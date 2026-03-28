# Copyright (C) 2006-2013 OpenWrt.org
# Copyright (C) 2010 Vertical Communications
# =============================================================================
# preinit.sh —— OpenWrt 预初始化（preinit）钩子框架
# =============================================================================
# 本文件实现 OpenWrt 启动过程中"预初始化"阶段的钩子（hook）管理框架，
# 以及根文件系统切换（pivot root）相关的挂载操作函数。
#
# 【OpenWrt 启动流程概述】
#   内核启动 → /sbin/init（procd）→ /etc/preinit → 各 preinit 钩子 → pivot_root → 正式启动
#
# 【preinit 阶段的主要任务】
#   1. 挂载基本文件系统（proc、sysfs、devtmpfs）
#   2. 检测并处理故障安全模式（failsafe）
#   3. 挂载 overlay 文件系统（OverlayFS，将可写层叠加在只读 squashfs 上）
#   4. 执行 pivot_root 切换根文件系统
#   5. 启动 procd 进程管理器
#
# 【钩子框架设计】
#   preinit 阶段的逻辑分散在 /lib/preinit/ 目录下的多个脚本中，
#   每个脚本向特定的钩子队列（hook）注册处理函数。
#   本框架提供队列管理和顺序执行机制：
#     - boot_hook_init   : 创建一个新的钩子队列
#     - boot_hook_add    : 向队列尾部添加函数
#     - boot_hook_splice : 将函数插入队列头部（优先执行）
#     - boot_hook_shift  : 从队列头部取出一个函数
#     - boot_run_hook    : 顺序执行队列中所有函数（每个只执行一次）
#
# 【Splice（插入）机制】
#   在 boot_hook_splice_start() 和 boot_hook_splice_finish() 之间调用
#   boot_hook_add() 时，函数会被加入 <hook>_splice 临时队列。
#   finish 时，splice 队列的内容会被前置到主队列头部，实现优先执行。
#   用途：允许某个脚本在其他脚本已注册的函数前插入紧急处理逻辑。
# =============================================================================


# =============================================================================
# boot_hook_splice_start() —— 开始"前置插入"模式
# =============================================================================
# 说明：设置 PI_HOOK_SPLICE=1 标志，之后调用 boot_hook_add 时，
#       函数会进入 <hook>_splice 临时队列，而不是主队列。
#       需与 boot_hook_splice_finish 配对使用。
# =============================================================================
boot_hook_splice_start() {
	export -n PI_HOOK_SPLICE=1    # 设置插入模式标志（-n: 不导出到子进程）
}

# =============================================================================
# boot_hook_splice_finish() —— 完成"前置插入"，将 splice 队列合并到主队列头部
# =============================================================================
# 说明：遍历所有已注册的钩子队列（PI_STACK_LIST），
#       将每个钩子的 _splice 临时队列内容前置到对应的主队列。
#       最终清除 PI_HOOK_SPLICE 标志，恢复正常的 add 模式。
# 合并逻辑：<hook> = <hook>_splice 的内容 + <hook> 原有内容
# =============================================================================
boot_hook_splice_finish() {
	local hook
	for hook in $PI_STACK_LIST; do
		# 将 splice 队列（若非空）前置到主队列
		# "${hook}_splice" 的内容在前，"$hook" 原内容在后
		local v; eval "v=\${${hook}_splice:+\$${hook}_splice }$hook"
		export -n "${hook}=${v% }"    # 写回主队列（去除尾部多余空格）
		export -n "${hook}_splice="   # 清空 splice 临时队列
	done
	export -n PI_HOOK_SPLICE=    # 退出插入模式
}

# =============================================================================
# boot_hook_init() —— 初始化一个新的钩子队列
# =============================================================================
# 参数：$1 - 钩子名称（不含 "_hook" 后缀，如 "preinit_main"、"failsafe"）
# 说明：
#   - 创建名为 <name>_hook 的空队列变量
#   - 将 <name>_hook 注册到全局 PI_STACK_LIST（用于 splice_finish 遍历）
# 示例：
#   boot_hook_init "preinit_main"   → 创建 preinit_main_hook 队列
#   boot_hook_init "failsafe"       → 创建 failsafe_hook 队列
# =============================================================================
boot_hook_init() {
	local hook="${1}_hook"
	# 将新钩子名追加到全局钩子列表（空格分隔）
	export -n "PI_STACK_LIST=${PI_STACK_LIST:+$PI_STACK_LIST }$hook"
	export -n "$hook="    # 初始化为空队列
}

# =============================================================================
# boot_hook_add() —— 向指定钩子队列追加一个处理函数
# =============================================================================
# 参数：$1 - 钩子名称（不含 "_hook" 后缀）
#       $2 - 要添加的函数名
# 说明：
#   - 若 PI_HOOK_SPLICE=1（splice 模式），函数加入 <hook>_splice 临时队列
#   - 否则，函数追加到 <hook> 主队列尾部
#   - 队列以空格分隔的函数名字符串形式存储
# 示例：
#   boot_hook_add "preinit_main" "do_mount_root"
#   → preinit_main_hook="... do_mount_root"
# =============================================================================
boot_hook_add() {
	# PI_HOOK_SPLICE 为1时写入 splice 队列，否则写入主队列
	local hook="${1}_hook${PI_HOOK_SPLICE:+_splice}"
	local func="${2}"

	[ -n "$func" ] && {
		local v; eval "v=\$$hook"
		export -n "$hook=${v:+$v }$func"    # 追加函数名（已有内容时先加空格）
	}
}

# =============================================================================
# boot_hook_shift() —— 从钩子队列头部取出第一个函数
# =============================================================================
# 参数：$1 - 钩子名称（不含 "_hook" 后缀）
#       $2 - 接收结果的变量名
# 返回：0 - 成功取出（队列非空）；1 - 队列为空
# 说明：取出后从队列中删除该函数（FIFO 出队操作）。
#       若队列只有一个元素，取出后队列变为空字符串。
# =============================================================================
boot_hook_shift() {
	local hook="${1}_hook"
	local rvar="${2}"

	local v; eval "v=\$$hook"
	[ -n "$v" ] && {
		local first="${v%% *}"    # 取第一个空格前的内容（第一个函数名）

		# 若队列有多个元素（含空格），更新队列为去掉第一个元素后的剩余部分
		# 否则（只有一个元素），清空队列
		[ "$v" != "${v#* }" ] && \
			export -n "$hook=${v#* }" || \
			export -n "$hook="

		export -n "$rvar=$first"    # 将取出的函数名写入目标变量
		return 0
	}

	return 1    # 队列为空
}

# =============================================================================
# boot_run_hook() —— 顺序执行指定钩子队列中的所有函数
# =============================================================================
# 参数：$1 - 钩子名称（不含 "_hook" 后缀）
# 说明：
#   - 使用 boot_hook_shift 逐个取出函数并执行
#   - 通过 PI_RAN_<函数名> 标志防止同一函数被重复执行
#     （即使该函数被重复添加到队列，也只执行一次）
#   - 执行函数时传入两个参数：钩子名称（$1）和 $2（调用者传入）
# 示例：boot_run_hook "preinit_main"
# =============================================================================
boot_run_hook() {
	local hook="$1"
	local func

	while boot_hook_shift "$hook" func; do
		# 检查此函数是否已被执行过（PI_RAN_<函数名> 变量是否已设置）
		local ran; eval "ran=\$PI_RAN_$func"
		[ -n "$ran" ] || {
			export -n "PI_RAN_$func=1"    # 标记为已执行
			$func "$1" "$2"               # 调用函数，传入钩子名和第二个参数
		}
	done
}


# =============================================================================
# ── 根文件系统切换函数 ────────────────────────────────────────────────────────
# 说明：OpenWrt 使用 OverlayFS 实现可写文件系统：
#   - 下层（lowerdir）: squashfs 只读文件系统（包含 OpenWrt 固件）
#   - 上层（upperdir）: jffs2/ext4/f2fs 可写层（存储用户配置和修改）
#   - 合并视图: 上层文件覆盖下层同名文件，上层不存在时显示下层文件
#
#   启动时文件系统层次：
#     /      : 内存中的 squashfs（initramfs 或直接挂载）
#     /tmp   : tmpfs（RAM 文件系统）
#   pivot_root 后：
#     /      : OverlayFS 合并视图（用户可读写）
#     /rom   : squashfs 只读根（原始固件）
#     /overlay: 可写层（实际存储修改的地方）
# =============================================================================

# pivot() —— 执行根文件系统切换（pivot_root）
# 参数：$1 - 新根文件系统的挂载路径（如 /mnt）
#       $2 - 将旧根挂载到新根下的子目录路径（如 /rom，即旧根将变为 /mnt/rom）
# 说明：
#   pivot_root 是 Linux 系统调用，将新目录设为根目录，旧根移到指定目录。
#   切换前必须先将 /proc 移动挂载到新根下（否则 pivot_root 会失败）。
#   切换后需要将 /dev、/tmp、/sys 等移动到新位置继续使用。
#   2>&-: 关闭 fd2（忽略 /sys 和 /overlay 挂载失败，某些配置下可能不存在）
pivot() { # <new_root> <old_root>
	# 将 /proc 移动挂载到新根下（pivot_root 要求 /proc 已挂载在新根下）
	/bin/mount -o noatime,move /proc $1/proc && \
	# 执行 pivot_root：新根=$1，旧根移到 $1$2（如 /mnt/rom）
	pivot_root $1 $1$2 && {
		# pivot_root 成功后，将原来挂载在旧根下的文件系统移到新位置
		/bin/mount -o noatime,move $2/dev /dev       # /dev 设备文件系统
		/bin/mount -o noatime,move $2/tmp /tmp       # /tmp 临时文件系统
		/bin/mount -o noatime,move $2/sys /sys 2>&-  # /sys 内核接口（可选）
		/bin/mount -o noatime,move $2/overlay /overlay 2>&-  # overlay 可写层（可选）
		return 0
	}
}

# fopivot() —— 挂载 OverlayFS 并切换根文件系统
# 参数：$1 - 可写层目录（upperdir，如 /tmp/root/root）
#       $2 - 工作目录（workdir，OverlayFS 内部使用，如 /tmp/root/work）
#       $3 - 旧根目录名（pivot 后旧根将挂载到此路径，如 /rom）
#       $4 - （未使用，历史参数）
# 说明：
#   OverlayFS 挂载参数：
#     lowerdir=/  : 下层为当前根（只读的 squashfs）
#     upperdir=$1 : 上层为可写目录
#     workdir=$2  : OverlayFS 工作目录（必须与 upperdir 在同一文件系统）
#   合并后挂载到 /mnt，再通过 pivot 切换根到 /mnt。
fopivot() { # <rw_root> <work_dir> <ro_root> <dupe?>
	/bin/mount -o noatime,lowerdir=/,upperdir=$1,workdir=$2 -t overlay "overlayfs:$1" /mnt
	pivot /mnt $3
}

# ramoverlay() —— 在 RAM 中创建 OverlayFS（用于故障安全模式或无可写 Flash 时）
# 说明：
#   在 /tmp（RAM tmpfs）中创建临时的可写层，再挂载 OverlayFS：
#     /tmp/root/root : 作为 OverlayFS 的 upperdir（可写层）
#     /tmp/root/work : 作为 OverlayFS 的 workdir
#   切换根后，所有写入均发生在 RAM 中，重启后丢失。
#   适用场景：
#     1. 故障安全（failsafe）模式：不加载 Flash 上可能损坏的配置
#     2. firstboot：第一次启动时使用 RAM 作为临时可写层
#     3. 无可写 Flash 的纯只读设备
ramoverlay() {
	mkdir -p /tmp/root
	# 在 /tmp 下创建 tmpfs（RAM 文件系统），用于存放可写层
	/bin/mount -t tmpfs -o noatime,mode=0755 root /tmp/root
	# 在 tmpfs 内创建 upperdir 和 workdir
	mkdir -p /tmp/root/root /tmp/root/work
	# 挂载 OverlayFS（squashfs 为下层，tmpfs 为上层）并切换根
	# /rom 作为旧根的挂载点（切换后原 squashfs 根可通过 /rom 访问）
	fopivot /tmp/root/root /tmp/root/work /rom 1
}
