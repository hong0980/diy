# Copyright (C) 2013 OpenWrt.org
# =============================================================================
# leds.sh —— OpenWrt LED 控制工具库
# =============================================================================
# 本文件提供操作路由器 LED 的 Shell 函数，通过 Linux sysfs LED 子系统
# （/sys/class/leds/）控制 LED 的亮灭、闪烁和触发器。
#
# 【Linux LED 子系统概述】
#   每个 LED 在 /sys/class/leds/<led名>/ 下暴露以下控制文件：
#     trigger   : 触发器类型（none/heartbeat/timer/netdev 等）
#     brightness: 亮度（0=灭，255=最亮，设置此值会自动将 trigger 改为 none）
#     delay_on  : timer 触发器的亮灯时间（毫秒）
#     delay_off : timer 触发器的灭灯时间（毫秒）
#
# 【LED 命名约定】
#   sysfs LED 名称通常为 "颜色:功能"，如：
#     "green:power"   → 绿色电源 LED
#     "red:wlan"      → 红色 WiFi LED
#     "blue:status"   → 蓝色状态 LED
#
# 【常用触发器类型】
#   none      : 手动控制（通过 brightness 文件直接控制亮灭）
#   heartbeat : 心跳模式（随系统负载变化闪烁频率）
#   timer     : 定时器模式（按 delay_on/delay_off 规律闪烁）
#   netdev    : 网络活动（link/tx/rx 事件触发）
#
# 【全局变量约定】
#   status_led  : 主状态 LED 的 sysfs 名称（由 /etc/diag.sh 设置）
#   status_led2 : 副状态 LED（可选，部分设备有双状态 LED）
# =============================================================================


# =============================================================================
# ── 设备树 LED 信息读取函数 ───────────────────────────────────────────────────
# =============================================================================

# get_dt_led_path() —— 从设备树 aliases 中获取指定 LED 的完整设备树路径
# 参数：$1 - LED 别名（不含 "led-" 前缀，如 "power"、"wlan"、"status"）
# 输出：LED 的完整设备树文件系统路径（如 /proc/device-tree/leds/power），
#       或空字符串（若别名不存在）
# 说明：设备树 aliases 节点存储 LED 路径映射：
#   /proc/device-tree/aliases/led-power → "/leds/power-led"
#   本函数读取此映射并拼接完整路径。
get_dt_led_path() {
	local ledpath
	local basepath="/proc/device-tree"
	local nodepath="$basepath/aliases/led-$1"   # aliases 中的 LED 别名节点

	[ -f "$nodepath" ] && ledpath=$(cat "$nodepath")     # 读取别名指向的相对路径
	[ -n "$ledpath" ] && ledpath="$basepath$ledpath"     # 拼接为完整路径

	echo "$ledpath"
}

# get_dt_led_color_func() —— 从设备树节点的颜色和功能属性生成 LED 标签
# 参数：$1 - LED 设备树节点路径（如 /proc/device-tree/leds/power-led）
# 输出：格式为 "颜色:功能[-序号]" 的标签字符串（如 "green:power"、"red:wlan-0"）
# 返回：0 - 成功生成；2 - 无法生成（节点缺少 color 和 function 属性）
# 说明：
#   color 属性: 4字节大端整数，表示颜色枚举值（按以下顺序：white=0, red=1, ...）
#   function 属性: 字符串，描述 LED 功能（如 "power"、"wlan"）
#   function-enumerator 属性: 4字节整数，同类功能的编号（如同一功能有多个 LED）
get_dt_led_color_func() {
	local enum
	local func
	local idx
	local label

	# 读取 function 属性（LED 功能描述字符串）
	[ -e "$1/function" ] && func=$(cat "$1/function")
	# 读取 color 属性（4字节大端整数，用 hexdump 转为十六进制再转十进制）
	[ -e "$1/color" ] && idx=$((0x$(hexdump -n 4 -e '4/1 "%02x"' "$1/color")))
	# 读取 function-enumerator（同功能 LED 的序号，用于区分多个同类 LED）
	[ -e "$1/function-enumerator" ] && \
		enum=$((0x$(hexdump -n 4 -e '4/1 "%02x"' "$1/function-enumerator")))

	# 若既无颜色又无功能，返回失败
	[ -z "$idx" ] && [ -z "$func" ] && return 2

	# 将颜色枚举值转换为颜色名称字符串
	# 枚举顺序与 Linux 内核 include/dt-bindings/leds/common.h 中定义一致
	if [ -n "$idx" ]; then
		for color in "white" "red" "green" "blue" "amber" \
			     "violet" "yellow" "ir" "multicolor" "rgb" \
			     "purple" "orange" "pink" "cyan" "lime"
		do
			[ $idx -eq 0 ] && label="$color" && break
			idx=$((idx-1))    # 递减直到匹配到对应枚举值
		done
	fi

	# 组合标签：颜色:功能（若有序号则加 -序号）
	label="$label:$func"
	[ -n "$enum" ] && label="$label-$enum"
	echo "$label"

	return 0
}

# get_dt_led() —— 获取指定 LED 别名对应的 sysfs 名称（标签）
# 参数：$1 - LED 别名（如 "power"、"status"、"wlan"）
# 输出：LED 的 sysfs 名称（/sys/class/leds/ 下的目录名）
# 说明：按以下优先级获取 LED 名称：
#   1. 设备树节点的 label 属性（最明确）
#   2. 设备树节点的 chan-name 属性（PWM LED 使用）
#   3. 从 color + function 属性生成（get_dt_led_color_func）
#   4. 设备树节点的目录名（basename，兜底方案）
get_dt_led() {
	local label
	local ledpath=$(get_dt_led_path $1)

	[ -n "$ledpath" ] && \
		label=$(cat "$ledpath/label" 2>/dev/null) || \
		label=$(cat "$ledpath/chan-name" 2>/dev/null) || \
		label=$(get_dt_led_color_func "$ledpath") || \
		label=$(basename "$ledpath")

	echo "$label"
}


# =============================================================================
# ── LED 基础控制函数 ──────────────────────────────────────────────────────────
# =============================================================================

# led_set_attr() —— 向指定 LED 的 sysfs 属性文件写入值（带存在性检查）
# 参数：$1 - LED sysfs 名称（如 "green:power"）
#       $2 - 属性名（如 "trigger"、"brightness"、"delay_on"）
#       $3 - 要写入的值
# 说明：先检查文件是否存在（部分 LED 可能不支持某些属性），再写入。
led_set_attr() {
	[ -f "/sys/class/leds/$1/$2" ] && echo "$3" > "/sys/class/leds/$1/$2"
}

# led_timer() —— 设置 LED 为定时器闪烁模式
# 参数：$1 - LED sysfs 名称；$2 - 亮灯时间（毫秒）；$3 - 灭灯时间（毫秒）
# 示例：led_timer "green:power" 500 500   → 0.5秒亮/0.5秒灭交替闪烁
led_timer() {
	led_set_attr $1 "trigger" "timer"      # 先设置触发器为 timer
	led_set_attr $1 "delay_on" "$2"        # 设置亮灯时间
	led_set_attr $1 "delay_off" "$3"       # 设置灭灯时间
}

# led_on() —— 点亮指定 LED（持续常亮）
# 参数：$1 - LED sysfs 名称
led_on() {
	led_set_attr $1 "trigger" "none"       # 先设置为手动模式
	led_set_attr $1 "brightness" 255       # 设置最大亮度
}

# led_off() —— 熄灭指定 LED
# 参数：$1 - LED sysfs 名称
led_off() {
	led_set_attr $1 "trigger" "none"       # 先设置为手动模式
	led_set_attr $1 "brightness" 0         # 亮度设为 0（熄灭）
}


# =============================================================================
# ── 状态 LED 高级控制函数 ─────────────────────────────────────────────────────
# 说明：以下函数操作全局变量 $status_led（和可选的 $status_led2），
#       由 /etc/diag.sh 脚本在 preinit 阶段设置这两个变量。
# =============================================================================

# status_led_restore_trigger() —— 恢复 LED 的设备树默认触发器
# 参数：$1 - LED 别名（如 "power"）
# 说明：设备树节点可以有 linux,default-trigger 属性指定默认触发器（如 "heartbeat"）。
#       系统启动完成后调用此函数，将 LED 恢复为设备树定义的默认行为。
status_led_restore_trigger() {
	local trigger
	local ledpath=$(get_dt_led_path $1)

	# 从设备树读取 linux,default-trigger 属性
	[ -n "$ledpath" ] && \
		trigger=$(cat "$ledpath/linux,default-trigger" 2>/dev/null)

	# 若有默认触发器，恢复设置
	[ -n "$trigger" ] && \
		led_set_attr "$(get_dt_led $1)" "trigger" "$trigger"
}

# status_led_set_timer() —— 设置状态 LED（和副状态 LED）为定时器闪烁
# 参数：$1 - 亮灯时间（ms）；$2 - 灭灯时间（ms）
status_led_set_timer() {
	led_timer $status_led "$1" "$2"
	[ -n "$status_led2" ] && led_timer $status_led2 "$1" "$2"
}

# status_led_set_heartbeat() —— 设置主状态 LED 为心跳触发模式
status_led_set_heartbeat() {
	led_set_attr $status_led "trigger" "heartbeat"
}

# status_led_on() —— 点亮状态 LED（主+副）
status_led_on() {
	led_on $status_led
	[ -n "$status_led2" ] && led_on $status_led2
}

# status_led_off() —— 熄灭状态 LED（主+副）
status_led_off() {
	led_off $status_led
	[ -n "$status_led2" ] && led_off $status_led2
}

# =============================================================================
# ── 预定义闪烁模式（用于系统启动各阶段的状态指示）────────────────────────────
# 说明：OpenWrt 在不同启动阶段用不同的 LED 闪烁模式指示系统状态：
#   preinit        : 快速闪烁（100ms/100ms）→ 系统正在初始化
#   preinit_regular: 中速闪烁（200ms/200ms）→ 正常预初始化流程
#   failsafe       : 极快闪烁（50ms/50ms）  → 进入故障安全模式（可刷机）
#   slow           : 慢速闪烁（1s/1s）      → 系统空闲/等待
#   fast           : 快速闪烁（100ms/100ms）→ 有活动/工作中
# =============================================================================

# status_led_blink_slow() —— 慢速闪烁（1秒亮/1秒灭）
status_led_blink_slow() {
	led_timer $status_led 1000 1000
}

# status_led_blink_fast() —— 快速闪烁（100ms亮/100ms灭）
status_led_blink_fast() {
	led_timer $status_led 100 100
}

# status_led_blink_preinit() —— 预初始化阶段闪烁（100ms/100ms，同 fast）
status_led_blink_preinit() {
	led_timer $status_led 100 100
}

# status_led_blink_failsafe() —— 故障安全模式闪烁（50ms/50ms，极快，表示告警）
# 说明：进入 failsafe 模式时 LED 极快闪烁，提示用户系统处于紧急状态，
#       此时可通过 telnet/SSH 连接进行恢复操作或固件刷写。
status_led_blink_failsafe() {
	led_timer $status_led 50 50
}

# status_led_blink_preinit_regular() —— 正常预初始化闪烁（200ms/200ms，中速）
status_led_blink_preinit_regular() {
	led_timer $status_led 200 200
}
