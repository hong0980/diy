#!/bin/sh
# Shebang: 指定脚本解释器为 /bin/sh，用于在 POSIX 兼容的 shell 中运行脚本。

# Copyright (C) 2006-2014 OpenWrt.org
# Copyright 声明：表明代码版权归 OpenWrt 项目所有，时间范围为 2006-2014 年。

# Copyright (C) 2006 Fokus Fraunhofer <carsten.tittel@fokus.fraunhofer.de>
# Copyright 声明：表明部分代码版权归 Fokus Fraunhofer 机构，作者为 Carsten Tittel。

# Copyright (C) 2010 Vertical Communications
# Copyright 声明：表明部分代码版权归 Vertical Communications，版权年份为 2010 年。

# 定义 debug 函数：用于调试输出，调用时通过 DEBUG 变量指定调试命令，默认不执行任何操作。
debug () {
	${DEBUG:-:} "$@"
}

# 定义变量 N：表示换行符，用于在字符串拼接时插入换行。
# newline
N="
"

# 初始化变量 _C：用作计数器，初始值为 0，可能用于跟踪某些操作的次数。
_C=0

# 设置变量 NO_EXPORT：值为 1，用于控制变量导出行为（是否使用 export -n）。
NO_EXPORT=1

# 设置变量 LOAD_STATE：值为 1，可能用于控制是否加载某些状态。
LOAD_STATE=1

# 定义变量 LIST_SEP：列表分隔符，默认为一个空格，用于列表元素的分隔。
LIST_SEP=" "

# 定义 xor 函数：对多个相同长度的十六进制值进行异或运算。
xor() {
	local val  # 声明局部变量 val，用于存储当前处理的十六进制值。
	local ret="0x$1"  # 声明局部变量 ret，初始值为第一个参数（带 0x 前缀）。
	local retlen=${#1}  # 声明局部变量 retlen，存储第一个参数的长度（不含 0x）。

	shift  # 移除第一个参数，将剩余参数向前移动。
	while [ -n "$1" ]; do  # 循环：只要还有参数，继续处理。
		val="0x$1"  # 将当前参数（十六进制字符串）加上 0x 前缀，赋值给 val。
		ret=$((ret ^ val))  # 对 ret 和 val 进行异或运算，更新 ret。
		shift  # 移除当前参数，继续处理下一个参数。
	done

	# 输出结果：将 ret 格式化为指定长度的十六进制字符串（不含 0x 前缀）。
	printf "%0${retlen}x" "$ret"
}

# 定义 append 函数：将值追加到指定变量，支持自定义分隔符。
append() {
	local var="$1"  # 声明局部变量 var，存储目标变量名。
	local value="$2"  # 声明局部变量 value，存储要追加的值。
	local sep="${3:- }"  # 声明局部变量 sep，分隔符，默认为空格。

	# 使用 eval 动态修改变量：将 value 追加到 var 中，中间用 sep 分隔。
	# NO_EXPORT 控制是否使用 export -n（不导出变量）。
	eval "export ${NO_EXPORT:+-n} -- \"$var=\${$var:+\${$var}\${value:+\$sep}}\$value\""
}

# 定义 list_contains 函数：检查列表变量中是否包含指定字符串。
list_contains() {
	local var="$1"  # 声明局部变量 var，存储目标变量名。
	local str="$2"  # 声明局部变量 str，存储要查找的字符串。
	local val  # 声明局部变量 val，用于存储变量值。

	# 使用 eval 获取变量值，并在前后加空格，便于查找。
	eval "val=\" \${$var} \""
	# 检查 val 是否包含 " $str "，如果包含则返回 true（0）。
	[ "${val%% $str *}" != "$val" ]
}

# 定义 config_load 函数：加载 UCI 配置。
config_load() {
	# 如果 IPKG_INSTROOT 不为空（可能是安装环境），直接返回 0，不加载配置。
	[ -n "$IPKG_INSTROOT" ] && return 0
	# 调用 uci_load 加载指定的 UCI 配置文件。
	uci_load "$@"
}

# 定义 reset_cb 函数：重置配置回调函数。
reset_cb() {
	# 定义 config_cb 函数：默认实现为空，用于处理配置段，返回 0。
	config_cb() { return 0; }
	# 定义 option_cb 函数：默认实现为空，用于处理选项，返回 0。
	option_cb() { return 0; }
	# 定义 list_cb 函数：默认实现为空，用于处理列表，返回 0。
	list_cb() { return 0; }
}
# 调用 reset_cb 函数，重置所有回调函数。
reset_cb

# 定义 package 函数：占位函数，默认实现为空，返回 0。
package() {
	return 0
}

# 定义 config 函数：创建新的配置段。
config () {
	local cfgtype="$1"  # 声明局部变量 cfgtype，存储配置类型。
	local name="$2"  # 声明局部变量 name，存储配置段名称。

	# 增加 CONFIG_NUM_SECTIONS 计数器，表示配置段数量。
	export ${NO_EXPORT:+-n} CONFIG_NUM_SECTIONS=$((CONFIG_NUM_SECTIONS + 1))
	# 如果未提供 name，则生成默认名称 cfgX（X 为 CONFIG_NUM_SECTIONS）。
	name="${name:-cfg$CONFIG_NUM_SECTIONS}"
	# 将新配置段名称追加到 CONFIG_SECTIONS 列表。
	append CONFIG_SECTIONS "$name"
	# 设置当前配置段为新创建的段。
	export ${NO_EXPORT:+-n} CONFIG_SECTION="$name"
	# 设置配置段的 TYPE 属性为 cfgtype。
	config_set "$CONFIG_SECTION" "TYPE" "${cfgtype}"
	# 如果 NO_CALLBACK 不为空，则不调用回调函数；否则调用 config_cb。
	[ -n "$NO_CALLBACK" ] || config_cb "$cfgtype" "$name"
}

# 定义 option 函数：设置配置选项。
option () {
	local varname="$1"; shift  # 声明局部变量 varname，存储选项名称，并移除第一个参数。
	local value="$*"  # 声明局部变量 value，存储选项值（剩余参数拼接）。

	# 将选项值存储到当前配置段中。
	config_set "$CONFIG_SECTION" "${varname}" "${value}"
	# 如果 NO_CALLBACK 不为空，则不调用回调函数；否则调用 option_cb。
	[ -n "$NO_CALLBACK" ] || option_cb "$varname" "$*"
}

# 定义 list 函数：添加列表项到配置选项。
list() {
	local varname="$1"; shift  # 声明局部变量 varname，存储列表选项名称，并移除第一个参数。
	local value="$*";  # 声明局部变量 value，存储列表项值（剩余参数拼接）。
	local len  # 声明局部变量 len，用于存储列表长度。

	# 获取当前列表长度，默认为 0。
	config_get len "$CONFIG_SECTION" "${varname}_LENGTH" 0
	# 如果是第一个列表项，将其加入 CONFIG_LIST_STATE。
	[ $len = 0 ] && append CONFIG_LIST_STATE "${CONFIG_SECTION}_${varname}"
	# 增加列表长度。
	len=$((len + 1))
	# 存储列表项值，格式为 varname_ITEMX。
	config_set "$CONFIG_SECTION" "${varname}_ITEM$len" "$value"
	# 更新列表长度。
	config_set "$CONFIG_SECTION" "${varname}_LENGTH" "$len"
	# 将值追加到 CONFIG_${section}_${varname} 变量，使用 LIST_SEP 分隔。
	append "CONFIG_${CONFIG_SECTION}_${varname}" "$value" "$LIST_SEP"
	# 如果 NO_CALLBACK 不为空，则不调用回调函数；否则调用 list_cb。
	[ -n "$NO_CALLBACK" ] || list_cb "$varname" "$*"
}

# 定义 config_unset 函数：清除指定配置选项的值。
config_unset() {
	# 调用 config_set，将指定选项值设置为空字符串。
	config_set "$1" "$2" ""
}

# 定义 config_get 函数：获取配置选项值。
# 支持两种调用方式：config_get <variable> <section> <option> [<default>] 或 config_get <section> <option>
config_get() {
	case "$3" in
		# 如果第 3 个参数为空（即调用方式为 config_get <section> <option>），直接输出值。
		"") eval echo "\"\${CONFIG_${1}_${2}:-\${4}}\"";;
		# 否则（调用方式为 config_get <variable> <section> <option> [<default>]），将值赋给指定变量。
		*)  eval export ${NO_EXPORT:+-n} -- "${1}=\${CONFIG_${2}_${3}:-\${4}}";;
	esac
}

# 定义 config_get_bool 函数：获取布尔类型的配置选项值。
# 将值转换为 0 或 1，存储到指定变量。
config_get_bool() {
	local _tmp  # 声明局部变量 _tmp，用于临时存储选项值。
	# 获取选项值，存储到 _tmp。
	config_get _tmp "$2" "$3" "$4"
	# 根据值转换为布尔值（1 或 0）。
	case "$_tmp" in
		1|on|true|yes|enabled) _tmp=1;;  # 如果值为 1、on、true、yes 或 enabled，设为 1。
		0|off|false|no|disabled) _tmp=0;;  # 如果值为 0、off、false、no 或 disabled，设为 0。
		*) _tmp="$4";;  # 否则使用默认值。
	esac
	# 将转换后的布尔值赋给指定变量。
	export ${NO_EXPORT:+-n} "$1=$_tmp"
}

# 定义 config_set 函数：设置配置选项值。
config_set() {
	local section="$1"  # 声明局部变量 section，存储配置段名称。
	local option="$2"  # 声明局部变量 option，存储选项名称。
	local value="$3"  # 声明局部变量 value，存储选项值。

	# 将值存储到 CONFIG_${section}_${option} 变量中。
	export ${NO_EXPORT:+-n} "CONFIG_${section}_${option}=${value}"
}

# 定义 config_foreach 函数：遍历所有配置段并执行指定函数。
config_foreach() {
	local ___function="$1"  # 声明局部变量 ___function，存储要执行的函数名。
	[ "$#" -ge 1 ] && shift  # 如果参数数量大于等于 1，移除第一个参数。
	local ___type="$1"  # 声明局部变量 ___type，存储配置类型（可选）。
	[ "$#" -ge 1 ] && shift  # 如果还有参数，移除第二个参数。
	local section cfgtype  # 声明局部变量 section 和 cfgtype，分别存储配置段名和类型。

	# 如果 CONFIG_SECTIONS 为空（无配置段），直接返回 0。
	[ -z "$CONFIG_SECTIONS" ] && return 0
	# 遍历所有配置段。
	for section in ${CONFIG_SECTIONS}; do
		# 获取当前配置段的类型。
		config_get cfgtype "$section" TYPE
		# 如果指定了类型且当前配置段类型不匹配，则跳过。
		[ -n "$___type" ] && [ "x$cfgtype" != "x$___type" ] && continue
		# 调用指定函数，传入配置段名和剩余参数。
		eval "$___function \"\$section\" \"\$@\""
	done
}

# 定义 config_list_foreach 函数：遍历指定配置段的列表项并执行指定函数。
config_list_foreach() {
	# 检查参数数量，至少需要 3 个参数（section、option、function），否则返回 0。
	[ "$#" -ge 3 ] || return 0
	local section="$1"; shift  # 声明局部变量 section，存储配置段名，并移除第一个参数。
	local option="$1"; shift  # 声明局部变量 option，存储列表选项名，并移除第二个参数。
	local function="$1"; shift  # 声明局部变量 function，存储要执行的函数名，并移除第三个参数。
	local val  # 声明局部变量 val，用于存储列表项值。
	local len  # 声明局部变量 len，用于存储列表长度。
	local c=1  # 声明局部变量 c，计数器，初始值为 1。

	# 获取列表长度。
	config_get len "${section}" "${option}_LENGTH"
	# 如果列表长度为空，返回 0。
	[ -z "$len" ] && return 0
	# 遍历列表项。
	while [ $c -le "$len" ]; do
		# 获取当前列表项值。
		config_get val "${section}" "${option}_ITEM$c"
		# 调用指定函数，传入列表项值和剩余参数。
		eval "$function \"\$val\" \"\$@\""
		# 计数器加 1。
		c="$((c + 1))"
	done
}

# 定义 default_prerm 函数：默认的包移除前脚本。
default_prerm() {
	local root="${IPKG_INSTROOT}"  # 声明局部变量 root，存储安装根目录（可能为空）。
	local pkgname="$(basename ${1%.*})"  # 声明局部变量 pkgname，存储包名（去掉文件扩展名）。
	local ret=0  # 声明局部变量 ret，返回值，初始为 0。

	# 检查是否存在 prerm-pkg 脚本，如果存在则执行。
	if [ -f "$root/usr/lib/opkg/info/${pkgname}.prerm-pkg" ]; then
		( . "$root/usr/lib/opkg/info/${pkgname}.prerm-pkg" )  # 执行 prerm-pkg 脚本。
		ret=$?  # 存储执行结果。
	fi

	# 获取 bash 的路径，用于执行脚本。
	local shell="$(which bash)"
	# 遍历包文件列表中以 /etc/init.d/ 开头的文件（通常为服务脚本）。
	for i in $(grep -s "^/etc/init.d/" "$root/usr/lib/opkg/info/${pkgname}.list"); do
		# 如果指定了 root（安装环境），调用 rc.common 禁用服务。
		if [ -n "$root" ]; then
			${shell:-/bin/sh} "$root/etc/rc.common" "$root$i" disable
		else
			# 如果不是升级（PKG_UPGRADE != 1），禁用服务。
			if [ "$PKG_UPGRADE" != "1" ]; then
				"$i" disable
			fi
			# 停止服务。
			"$i" stop
		fi
	done

	# 返回执行结果。
	return $ret
}

# 定义 add_group_and_user 函数：根据包的控制文件添加用户和组。
add_group_and_user() {
	local pkgname="$1"  # 声明局部变量 pkgname，存储包名。
	# 从控制文件中提取 Require-User 字段，存储到 rusers。
	local rusers="$(sed -ne 's/^Require-User: *//p' $root/usr/lib/opkg/info/${pkgname}.control 2>/dev/null)"

	# 如果 rusers 不为空，处理用户和组。
	if [ -n "$rusers" ]; then
		local tuple oIFS="$IFS"  # 声明局部变量 tuple 和 oIFS，oIFS 保存原始 IFS。
		# 遍历 rusers 中的每一项（格式为 user:group）。
		for tuple in $rusers; do
			local uid gid uname gname  # 声明局部变量 uid、gid、uname、gname。

			IFS=":"  # 设置 IFS 为冒号，分隔 user:group。
			set -- $tuple; uname="$1"; gname="$2"  # 解析 tuple，提取用户名和组名。
			IFS="="  # 设置 IFS 为等号，分隔 name=uid 或 name=gid。
			set -- $uname; uname="$1"; uid="$2"  # 解析用户名和 UID。
			set -- $gname; gname="$1"; gid="$2"  # 解析组名和 GID。
			IFS="$oIFS"  # 恢复原始 IFS。

			# 如果指定了组名和 GID，添加组。
			if [ -n "$gname" ] && [ -n "$gid" ]; then
				group_exists "$gname" || group_add "$gname" "$gid"
			# 如果仅指定了组名，自动分配 GID。
			elif [ -n "$gname" ]; then
				gid="$(group_add_next "$gname")"
			fi

			# 如果指定了用户名，添加用户。
			if [ -n "$uname" ]; then
				user_exists "$uname" || user_add "$uname" "$uid" "$gid"
			fi

			# 如果同时指定了用户名和组名，将用户加入组。
			if [ -n "$uname" ] && [ -n "$gname" ]; then
				group_add_user "$gname" "$uname"
			fi

			# 清理变量。
			unset uid gid uname gname
		done
	fi
}

# 定义 default_postinst 函数：默认的包安装后脚本。
default_postinst() {
	local root="${IPKG_INSTROOT}"  # 声明局部变量 root，存储安装根目录。
	local pkgname="$(basename ${1%.*})"  # 声明局部变量 pkgname，存储包名。
	local filelist="/usr/lib/opkg/info/${pkgname}.list"  # 声明局部变量 filelist，存储包文件列表路径。
	local ret=0  # 声明局部变量 ret，返回值，初始为 0。

	# 添加用户和组。
	add_group_and_user "${pkgname}"

	# 检查是否存在 postinst-pkg 脚本，如果存在则执行。
	if [ -f "$root/usr/lib/opkg/info/${pkgname}.postinst-pkg" ]; then
		( . "$root/usr/lib/opkg/info/${pkgname}.postinst-pkg" )  # 执行 postinst-pkg 脚本。
		ret=$?  # 存储执行结果。
	fi

	# 如果存在 rootfs-overlay 目录，将其内容复制到 root 并删除。
	if [ -d "$root/rootfs-overlay" ]; then
		cp -R $root/rootfs-overlay/. $root/
		rm -fR $root/rootfs-overlay/
	fi

	# 如果 root 为空（非安装环境），执行以下操作。
	if [ -z "$root" ]; then
		# 如果包中包含 /etc/modules.d/ 文件，加载内核模块。
		if grep -m1 -q -s "^/etc/modules.d/" "$filelist"; then
			kmodloader
		fi

		# 如果包中包含 /etc/sysctl.d/ 文件，重启 sysctl 服务。
		if grep -m1 -q -s "^/etc/sysctl.d/" "$filelist"; then
			/etc/init.d/sysctl restart
		fi

		# 如果包中包含 /etc/uci-defaults/ 文件，执行 UCI 默认配置。
		if grep -m1 -q -s "^/etc/uci-defaults/" "$filelist"; then
			[ -d /tmp/.uci ] || mkdir -p /tmp/.uci  # 创建 UCI 临时目录。
			# 遍历 UCI 默认脚本，执行并删除。
			for i in $(grep -s "^/etc/uci-defaults/" "$filelist"); do
				( [ -f "$i" ] && cd "$(dirname $i)" && . "$i" ) && rm -f "$i"
			done
			# 提交 UCI 配置。
			uci commit
		fi

		# 删除 LuCI 索引缓存。
		rm -f /tmp/luci-indexcache
	fi

	# 获取 bash 路径，用于执行脚本。
	local shell="$(which bash)"
	# 遍历包文件列表中以 /etc/init.d/ 开头的文件（服务脚本）。
	for i in $(grep -s "^/etc/init.d/" "$root$filelist"); do
		# 如果指定了 root（安装环境），启用服务。
		if [ -n "$root" ]; then
			${shell:-/bin/sh} "$root/etc/rc.common" "$root$i" enable
		else
			# 如果不是升级（PKG_UPGRADE != 1），启用服务。
			if [ "$PKG_UPGRADE" != "1" ]; then
				"$i" enable
			fi
			# 启动服务。
			"$i" start
		fi
	done

	# 返回执行结果。
	return $ret
}

# 定义 include 函数：包含指定目录下的所有 shell 脚本。
include() {
	local file  # 声明局部变量 file，用于存储脚本文件路径。

	# 遍历指定目录下的所有 .sh 文件并包含。
	for file in $(ls $1/*.sh 2>/dev/null); do
		. $file  # 使用 . 命令包含脚本。
	done
}

# 定义 find_mtd_index 函数：查找 MTD 分区的索引。
find_mtd_index() {
	local PART="$(grep "\"$1\"" /proc/mtd | awk -F: '{print $1}')"  # 从 /proc/mtd 中查找分区名，提取 MTD 设备名（如 mtd0）。
	local INDEX="${PART##mtd}"  # 提取设备名中的索引部分（如 0）。

	# 输出索引。
	echo ${INDEX}
}

# 定义 find_mtd_part 函数：查找 MTD 分区的设备路径。
find_mtd_part() {
	local INDEX=$(find_mtd_index "$1")  # 调用 find_mtd_index 获取分区索引。
	local PREFIX=/dev/mtdblock  # 设置默认设备前缀。

	# 如果 /dev/mtdblock 目录存在，使用该路径作为前缀。
	[ -d /dev/mtdblock ] && PREFIX=/dev/mtdblock/
	# 输出设备路径（例如 /dev/mtdblock/0）。
	echo "${INDEX:+$PREFIX$INDEX}"
}

# 定义 group_add 函数：添加用户组。
group_add() {
	local name="$1"  # 声明局部变量 name，存储组名。
	local gid="$2"  # 声明局部变量 gid，存储组 ID。
	local rc  # 声明局部变量 rc，用于存储返回码。

	# 检查 /etc/group 文件是否存在，不存在则返回 1。
	[ -f "${IPKG_INSTROOT}/etc/group" ] || return 1
	# 如果 IPKG_INSTROOT 为空（非安装环境），锁定 group 文件。
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/group
	# 将组信息追加到 /etc/group 文件。
	echo "${name}:x:${gid}:" >> ${IPKG_INSTROOT}/etc/group
	# 解锁 group 文件。
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/group
}

# 定义 group_exists 函数：检查用户组是否存在。
group_exists() {
	# 在 /etc/group 中查找组名，存在则返回 0。
	grep -qs "^${1}:" ${IPKG_INSTROOT}/etc/group
}

# 定义 group_add_next 函数：添加用户组并自动分配 GID。
group_add_next() {
	local gid gids  # 声明局部变量 gid 和 gids，分别存储组 ID 和现有 GID 列表。
	# 检查组是否已存在，若存在则返回其 GID。
	gid=$(grep -s "^${1}:" ${IPKG_INSTROOT}/etc/group | cut -d: -f3)
	if [ -n "$gid" ]; then
		echo $gid
		return
	fi
	# 获取所有现有 GID。
	gids=$(cut -d: -f3 ${IPKG_INSTROOT}/etc/group)
	# 从 65536 开始寻找未使用的 GID。
	gid=65536
	while echo "$gids" | grep -q "^$gid$"; do
		gid=$((gid + 1))
	done
	# 添加组并返回新 GID。
	group_add $1 $gid
	echo $gid
}

# 定义 group_add_user 函数：将用户添加到用户组。
group_add_user() {
	local grp delim=","  # 声明局部变量 grp 和 delim，delim 为分隔符。
	# 获取组信息。
	grp=$(grep -s "^${1}:" ${IPKG_INSTROOT}/etc/group)
	# 检查用户是否已在组中，若是则返回。
	echo "$grp" | cut -d: -f4 | grep -q $2 && return
	# 如果组成员为空，设置分隔符为空。
	echo "$grp" | grep -q ":$" && delim=""
	# 锁定 passwd 文件。
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/passwd
	# 将用户添加到组。
	sed -i "s/$grp/$grp$delim$2/g" ${IPKG_INSTROOT}/etc/group
	# 解锁 passwd 文件。
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/passwd
}

# 定义 user_add 函数：添加用户。
user_add() {
	local name="${1}"  # 声明局部变量 name，存储用户名。
	local uid="${2}"  # 声明局部变量 uid，存储用户 ID。
	local gid="${3}"  # 声明局部变量 gid，存储组 ID。
	local desc="${4:-$1}"  # 声明局部变量 desc，存储描述，默认为用户名。
	local home="${5:-/var/run/$1}"  # 声明局部变量 home，存储主目录，默认为 /var/run/用户名。
	local shell="${6:-/bin/false}"  # 声明局部变量 shell，存储登录 shell，默认为 /bin/false。
	local rc  # 声明局部变量 rc，用于存储返回码。

	# 如果未指定 UID，自动分配一个未使用的 UID。
	[ -z "$uid" ] && {
		uids=$(cut -d: -f3 ${IPKG_INSTROOT}/etc/passwd)
		uid=65536
		while echo "$uids" | grep -q "^$uid$"; do
			uid=$((uid + 1))
		done
	}
	# 如果未指定 GID，使用 UID 作为 GID。
	[ -z "$gid" ] && gid=$uid
	# 检查 /etc/passwd 文件是否存在，不存在则返回 1。
	[ -f "${IPKG_INSTROOT}/etc/passwd" ] || return 1
	# 锁定 passwd 文件。
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/passwd
	# 添加用户信息到 /etc/passwd。
	echo "${name}:x:${uid}:${gid}:${desc}:${home}:${shell}" >> ${IPKG_INSTROOT}/etc/passwd
	# 添加用户密码条目到 /etc/shadow。
	echo "${name}:x:0:0:99999:7:::" >> ${IPKG_INSTROOT}/etc/shadow
	# 解锁 passwd 文件。
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/passwd
}

# 定义 user_exists 函数：检查用户是否存在。
user_exists() {
	# 在 /etc/passwd 中查找用户名，存在则返回 0。
	grep -qs "^${1}:" ${IPKG_INSTROOT}/etc/passwd
}

# 定义 board_name 函数：获取设备主板名称。
board_name() {
	# 如果 /tmp/sysinfo/board_name 文件存在，读取其内容；否则返回 "generic"。
	[ -e /tmp/sysinfo/board_name ] && cat /tmp/sysinfo/board_name || echo "generic"
}

# 如果 IPKG_INSTROOT 为空（非安装环境）且 /lib/config/uci.sh 存在，加载 UCI 工具脚本。
[ -z "$IPKG_INSTROOT" ] && [ -f /lib/config/uci.sh ] && . /lib/config/uci.sh
