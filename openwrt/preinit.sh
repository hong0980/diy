#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# Copyright (C) 2006-2013 OpenWrt.org
# Copyright (C) 2010 Vertical Communications
# 版权信息，标明 OpenWrt 社区及 Vertical Communications 以及年份。

boot_hook_splice_start() {
	# 作用：开始钩子拼接模式，允许临时修改钩子函数列表。
	export -n PI_HOOK_SPLICE=1
	# 设置 PI_HOOK_SPLICE 环境变量为 1，表示进入拼接模式。
}

boot_hook_splice_finish() {
	# 作用：完成钩子拼接，将临时拼接的钩子合并到主钩子列表并清理。
	local hook
	# 声明变量存储钩子名称。
	for hook in $PI_STACK_LIST; do
		# 遍历 PI_STACK_LIST 中的所有钩子。
		local v; eval "v=\${${hook}_splice:+\$${hook}_splice }$hook"
		# 获取拼接钩子（${hook}_splice）和主钩子（$hook）的组合。
		export -n "${hook}=${v% }"
		# 更新主钩子列表，去除末尾空格。
		export -n "${hook}_splice="
		# 清空拼接钩子列表。
	done
	export -n PI_HOOK_SPLICE=
	# 清除拼接模式标志。
}

boot_hook_init() {
	# 作用：初始化一个新的钩子列表，用于存储引导过程中的回调函数。
	local hook="${1}_hook"
	# 构造钩子变量名（例如 preinit_hook）。
	export -n "PI_STACK_LIST=${PI_STACK_LIST:+$PI_STACK_LIST }$hook"
	# 将新钩子添加到 PI_STACK_LIST 中。
	export -n "$hook="
	# 初始化钩子列表为空。
}

boot_hook_add() {
	# 作用：向指定钩子列表添加一个回调函数。
	local hook="${1}_hook${PI_HOOK_SPLICE:+_splice}"
	# 根据是否在拼接模式，构造钩子变量名（主钩子或拼接钩子）。
	local func="${2}"
	# 获取要添加的函数名。

	[ -n "$func" ] && {
		# 如果函数名非空。
		local v; eval "v=\$$hook"
		# 获取当前钩子列表的内容。
		export -n "$hook=${v:+$v }$func"
		# 将新函数追加到钩子列表，前面加空格（如果列表非空）。
	}
}

boot_hook_shift() {
	# 作用：从指定钩子列表中移除并返回第一个回调函数。
	local hook="${1}_hook"
	# 构造钩子变量名。
	local rvar="${2}"
	# 获取返回变量名，用于存储移除的函数。

	local v; eval "v=\$$hook"
	# 获取当前钩子列表的内容。
	[ -n "$v" ] && {
		# 如果钩子列表非空。
		local first="${v%% *}"
		# 提取第一个函数名（空格前的部分）。

		[ "$v" != "${v#* }" ] && \
			# 如果列表中还有其他函数。
			export -n "$hook=${v#* }" || \
			# 更新钩子列表，移除第一个函数。
			export -n "$hook="
			# 如果列表只剩一个函数，清空列表。

		export -n "$rvar=$first"
		# 将移除的函数名存储到返回变量。
		return 0
		# 成功返回。
	}

	return 1
	# 如果钩子列表为空，返回失败。
}

boot_run_hook() {
	# 作用：执行指定钩子列表中的所有回调函数，确保每个函数只运行一次。
	local hook="$1"
	# 获取钩子名称。
	local func
	# 声明变量存储当前处理的函数。

	while boot_hook_shift "$hook" func; do
		# 循环移除并获取钩子列表中的第一个函数。
		local ran; eval "ran=\$PI_RAN_$func"
		# 检查函数是否已运行（通过 PI_RAN_$func 标志）。
		[ -n "$ran" ] || {
			# 如果函数未运行。
			export -n "PI_RAN_$func=1"
			# 设置运行标志，防止重复执行。
			$func "$1" "$2"
			# 执行函数，传递钩子名称和额外参数。
		}
	done
}

pivot() { # <new_root> <old_root>
	# 作用：切换根文件系统，将当前根目录挂载到新位置并移动关键目录。
	/bin/mount -o noatime,move /proc $1/proc && \
	# 将 /proc 移动挂载到新根目录的 /proc。
	pivot_root $1 $1$2 && {
		# 执行 pivot_root，将新根目录设置为 $1，旧根目录挂载到 $1$2。
		/bin/mount -o noatime,move $2/dev /dev
		# 将旧根的 /dev 移动挂载到新根的 /dev。
		/bin/mount -o noatime,move $2/tmp /tmp
		# 将旧根的 /tmp 移动挂载到新根的 /tmp。
		/bin/mount -o noatime,move $2/sys /sys 2>&-
		# 将旧根的 /sys 移动挂载到新根的 /sys，忽略错误。
		/bin/mount -o noatime,move $2/overlay /overlay 2>&-
		# 将旧根的 /overlay 移动挂载到新根的 /overlay，忽略错误。
		return 0
		# 成功返回。
	}
}

fopivot() { # <rw_root> <work_dir> <ro_root> <dupe?>
	# 作用：使用 overlayfs 创建可写根文件系统，并切换到新根目录。
	/bin/mount -o noatime,lowerdir=/,upperdir=$1,workdir=$2 -t overlay "overlayfs:$1" /mnt
	# 挂载 overlayfs，使用当前根为下层，$1 为上层，$2 为工作目录，挂载到 /mnt。
	pivot /mnt $3
	# 调用 pivot 函数，将 /mnt 设为新根目录，旧根挂载到 $3。
}

ramoverlay() {
	# 作用：在内存中创建 tmpfs 作为可写根文件系统，并使用 overlayfs 切换。
	mkdir -p /tmp/root
	# 创建 /tmp/root 目录。
	/bin/mount -t tmpfs -o noatime,mode=0755 root /tmp/root
	# 挂载 tmpfs 到 /tmp/root，设置为 0755 权限。
	mkdir -p /tmp/root/root /tmp/root/work
	# 创建上层目录和工件目录。
	fopivot /tmp/root/root /tmp/root/work /rom 1
	# 调用 fopivot，使用 /tmp/root/root 作为上层，/tmp/root/work 作为工作目录，/rom 作为旧根。
}
