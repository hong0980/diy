#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# Copyright (C) 2013 OpenWrt.org
# 版权信息，标明 OpenWrt 社区及年份。

get_dt_led() {
	# 作用：从设备树中获取指定 LED 的标签。
	local label
	# 声明变量存储 LED 标签。
	local ledpath
	# 声明变量存储 LED 路径。
	local basepath="/proc/device-tree"
	# 设置设备树基础路径。
	local nodepath="$basepath/aliases/led-$1"
	# 构造 LED 别名路径。

	[ -f "$nodepath" ] && ledpath=$(cat "$nodepath")
	# 如果别名文件存在，读取 LED 路径。
	[ -n "$ledpath" ] && \
		label=$(cat "$basepath$ledpath/label" 2>/dev/null) || \
		label=$(cat "$basepath$ledpath/chan-name" 2>/dev/null)
	# 尝试读取 label 或 chan-name 属性作为标签。

	echo "$label"
	# 输出 LED 标签。
}

led_set_attr() {
	# 作用：设置 LED 的 sysfs 属性。
	local led="$1"
	# 获取 LED 名称。
	local attr="$2"
	# 获取属性名称。
	local value="$3"
	# 获取属性值。

	[ -f "/sys/class/leds/$led/$attr" ] && echo "$value" > "/sys/class/leds/$led/$attr"
	# 如果属性文件存在，将值写入。
}

led_timer() {
	# 作用：设置 LED 为定时器触发模式。
	local led="$1"
	# 获取 LED 名称。
	local delay_on="$2"
	# 获取点亮时间。
	local delay_off="$3"
	# 获取熄灭时间。

	led_set_attr "$led" "trigger" "timer"
	# 设置触发器为 timer。
	led_set_attr "$led" "delay_on" "$delay_on"
	# 设置点亮时间。
	led_set_attr "$led" "delay_off" "$delay_off"
	# 设置熄灭时间。
}

led_on() {
	# 作用：点亮 LED。
	local led="$1"
	# 获取 LED 名称。

	led_set_attr "$led" "trigger" "none"
	# 禁用触发器。
	led_set_attr "$led" "brightness" 255
	# 设置亮度为最大值（255）。
}

led_off() {
	# 作用：关闭 LED。
	local led="$1"
	# 获取 LED 名称。

	led_set_attr "$led" "trigger" "none"
	# 禁用触发器。
	led_set_attr "$led" "brightness" 0
	# 设置亮度为 0。
}

status_led_set_timer() {
	# 作用：为状态 LED 设置定时器触发模式。
	local delay_on="$1"
	# 获取点亮时间。
	local delay_off="$2"
	# 获取熄灭时间。

	led_timer "$status_led" "$delay_on" "$delay_off"
	# 为主要状态 LED 设置定时器。
	[ -n "$status_led2" ] && led_timer "$status_led2" "$delay_on" "$delay_off"
	# 如果存在第二个状态 LED，也设置定时器。
}

status_led_set_heartbeat() {
	# 作用：设置状态 LED 为心跳模式。
	led_set_attr "$status_led" "trigger" "heartbeat"
	# 设置触发器为 heartbeat。
}

status_led_on() {
	# 作用：点亮状态 LED。
	led_on "$status_led"
	# 点亮主要状态 LED。
	[ -n "$status_led2" ] && led_on "$status_led2"
	# 如果存在第二个状态 LED，也点亮。
}

status_led_off() {
	# 作用：关闭状态 LED。
	led_off "$status_led"
	# 关闭主要状态 LED。
	[ -n "$status_led2" ] && led_off "$status_led2"
	# 如果存在第二个状态 LED，也关闭。
}

status_led_blink_slow() {
	# 作用：设置状态 LED 慢速闪烁（1秒亮，1秒灭）。
	led_timer "$status_led" 1000 1000
	# 设置 1000ms 点亮，1000ms 熄灭。
}

status_led_blink_fast() {
	# 作用：设置状态 LED 快速闪烁（100ms亮，100ms灭）。
	led_timer "$status_led" 100 100
	# 设置 100ms 点亮，100ms 熄灭。
}

status_led_blink_preinit() {
	# 作用：设置状态 LED 在预初始化阶段快速闪烁。
	led_timer "$status_led" 100 100
	# 设置 100ms 点亮，100ms 熄灭。
}

status_led_blink_failsafe() {
	# 作用：设置状态 LED 在故障安全模式下极快闪烁。
	led_timer "$status_led" 50 50
	# 设置 50ms 点亮，50ms 熄灭。
}

status_led_blink_preinit_regular() {
	# 作用：设置状态 LED 在常规预初始化阶段中等速度闪烁。
	led_timer "$status_led" 200 200
	# 设置 200ms 点亮，200ms 熄灭。
}
