#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

. /lib/functions.sh
# 引入通用函数库，提供辅助函数（如 config_load、config_get 等）。

migrate_led_sysfs() {
	# 作用：迁移 LED 配置中的 sysfs 路径，替换旧路径为新路径。
	local cfg="$1"; shift
	# 获取配置名称。
	local tuples="$@"
	# 获取旧路径和新路径的键值对。
	local sysfs
	# 声明变量存储 sysfs 路径。
	local name
	# 声明变量存储 LED 名称。

	config_get sysfs "${cfg}" sysfs
	# 获取 LED 配置中的 sysfs 路径。
	config_get name "${cfg}" name
	# 获取 LED 配置中的名称。

	[ -z "${sysfs}" ] && return
	# 如果 sysfs 路径为空，返回。

	for tuple in ${tuples}; do
		# 遍历键值对。
		local old=${tuple%=*}
		# 提取旧路径。
		local new=${tuple#*=}
		# 提取新路径。
		local new_sysfs
		# 声明变量存储替换后的 sysfs 路径。

		new_sysfs=$(echo "${sysfs}" | sed "s/${old}/${new}/")
		# 使用 sed 替换 sysfs 路径中的旧值。

		[ "${new_sysfs}" = "${sysfs}" ] && continue
		# 如果路径未改变，跳过。

		uci set system."${cfg}".sysfs="${new_sysfs}"
		# 更新 UCI 配置中的 sysfs 路径。

		logger -t led-migration "sysfs option of LED \"${name}\" updated to ${new_sysfs}"
		# 记录日志，提示 sysfs 路径更新。
	done
}

migrate_leds() {
	# 作用：对所有 LED 配置应用 sysfs 路径迁移。
	config_load system
	# 加载 system 配置。
	config_foreach migrate_led_sysfs led "$@"
	# 对每个 LED 配置调用 migrate_led_sysfs，传递替换规则。
}

migrations_apply() {
	# 作用：应用指定 UCI 配置领域的更改。
	local realm="$1"
	# 获取配置领域（例如 system）。
	[ -n "$(uci changes ${realm})" ] && uci -q commit ${realm}
	# 如果领域有未提交的更改，提交更改。
}
