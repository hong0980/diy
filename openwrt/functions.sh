# Copyright (C) 2006-2014 OpenWrt.org
# Copyright (C) 2006 Fokus Fraunhofer <carsten.tittel@fokus.fraunhofer.de>
# Copyright (C) 2010 Vertical Communications

# 调试输出函数
debug () {
	${DEBUG:-:} "$@"  # 如果DEBUG变量未设置则使用冒号(:)空操作
}

# 定义换行符变量
N="
"

# 初始化计数器变量
_C=0
# 设置不导出变量标志
NO_EXPORT=1
# 加载状态标志
LOAD_STATE=1
# 列表分隔符
LIST_SEP=" "

# 异或多个相同长度的十六进制值
xor() {
	local val
	local ret="0x$1"  # 第一个参数作为初始值
	local retlen=${#1}  # 获取参数长度

	shift  # 移除第一个参数
	while [ -n "$1" ]; do  # 遍历剩余参数
		val="0x$1"  # 转换为十六进制
		ret=$((ret ^ val))  # 执行异或运算
		shift  # 移除已处理参数
	done

	# 格式化输出，保持原始长度
	printf "%0${retlen}x" "$ret"
}

# 将十六进制数据转换为二进制格式
data_2bin() {
	local data=$1
	local len=${#1}
	local bin_data

	# 每两个字符为一组转换为\x格式
	for i in $(seq 0 2 $(($len - 1))); do
		bin_data="${bin_data}\x${data:i:2}"
	done

	# 输出二进制数据
	echo -ne $bin_data
}

# 将数据转换为异或值格式
data_2xor_val() {
	local data=$1
	local len=${#1}
	local xor_data

	# 每四个字符为一组进行分割
	for i in $(seq 0 4 $(($len - 1))); do
		xor_data="${xor_data}${data:i:4} "
	done

	# 输出去掉最后一个空格的结果
	echo -n ${xor_data:0:-1}
}

# 向变量追加值
append() {
	local var="$1"    # 目标变量名
	local value="$2"  # 要追加的值
	local sep="${3:- }"  # 分隔符，默认为空格

	# 使用eval动态构建变量赋值语句
	eval "export ${NO_EXPORT:+-n} -- \"$var=\${$var:+\${$var}\${value:+\$sep}}\$value\""
}

# 向变量前置值
prepend() {
	local var="$1"    # 目标变量名
	local value="$2"  # 要前置的值
	local sep="${3:- }"  # 分隔符，默认为空格

	# 使用eval动态构建变量赋值语句
	eval "export ${NO_EXPORT:+-n} -- \"$var=\$value\${$var:+\${sep}\${$var}}\""
}

# 检查列表中是否包含某个字符串
list_contains() {
	local var="$1"  # 列表变量名
	local str="$2"  # 要查找的字符串
	local val

	# 获取列表变量值并在前后添加空格
	eval "val=\" \${$var} \""
	# 检查字符串是否存在于列表中
	[ "${val%% $str *}" != "$val" ]
}

# 加载配置文件
config_load() {
	[ -n "$IPKG_INSTROOT" ] && return 0  # 如果是安装根目录环境则直接返回
	uci_load "$@"  # 调用uci_load函数加载配置
}

# 重置回调函数
reset_cb() {
	config_cb() { return 0; }  # 配置回调
	option_cb() { return 0; }  # 选项回调
	list_cb() { return 0; }    # 列表回调
}
reset_cb  # 立即调用重置函数

# 空包函数
package() {
	return 0
}

# 配置段定义函数
config () {
	local cfgtype="$1"  # 配置类型
	local name="$2"     # 配置名称

	# 增加配置段计数器
	export ${NO_EXPORT:+-n} CONFIG_NUM_SECTIONS=$((CONFIG_NUM_SECTIONS + 1))
	# 如果没有提供名称则使用cfg+数字作为默认名称
	name="${name:-cfg$CONFIG_NUM_SECTIONS}"
	# 将配置名添加到配置段列表
	append CONFIG_SECTIONS "$name"
	# 设置当前配置段变量
	export ${NO_EXPORT:+-n} CONFIG_SECTION="$name"
	# 设置配置段类型
	config_set "$CONFIG_SECTION" "TYPE" "${cfgtype}"
	# 如果没有禁用回调则调用配置回调
	[ -n "$NO_CALLBACK" ] || config_cb "$cfgtype" "$name"
}

# 配置选项定义函数
option () {
	local varname="$1"; shift  # 选项名
	local value="$*"           # 选项值

	# 设置配置选项
	config_set "$CONFIG_SECTION" "${varname}" "${value}"
	# 如果没有禁用回调则调用选项回调
	[ -n "$NO_CALLBACK" ] || option_cb "$varname" "$*"
}

# 列表定义函数
list() {
	local varname="$1"; shift  # 列表名
	local value="$*"           # 列表项值
	local len

	# 获取当前列表长度，默认为0
	config_get len "$CONFIG_SECTION" "${varname}_LENGTH" 0
	# 如果是第一个列表项，则添加到列表状态变量
	[ $len = 0 ] && append CONFIG_LIST_STATE "${CONFIG_SECTION}_${varname}"
	# 增加列表长度
	len=$((len + 1))
	# 设置列表项
	config_set "$CONFIG_SECTION" "${varname}_ITEM$len" "$value"
	# 更新列表长度
	config_set "$CONFIG_SECTION" "${varname}_LENGTH" "$len"
	# 将列表项添加到列表变量
	append "CONFIG_${CONFIG_SECTION}_${varname}" "$value" "$LIST_SEP"
	# 如果没有禁用回调则调用列表回调
	[ -n "$NO_CALLBACK" ] || list_cb "$varname" "$*"
}

# 取消设置配置选项
config_unset() {
	config_set "$1" "$2" ""  # 将选项值设为空
}

# 获取配置值
# 用法1: config_get <variable> <section> <option> [<default>]
# 用法2: config_get <section> <option>
config_get() {
	case "$2${3:-$1}" in
		*[!A-Za-z0-9_]*) : ;;  # 如果包含非法字符则不做任何操作
		*)
			case "$3" in
				"") eval echo "\"\${CONFIG_${1}_${2}:-\${4}}\"";;  # 输出配置值
				*)  eval export ${NO_EXPORT:+-n} -- "${1}=\${CONFIG_${2}_${3}:-\${4}}";;  # 设置变量为配置值
			esac
		;;
	esac
}

# 获取布尔值
# get_bool <value> [<default>]
get_bool() {
	local _tmp="$1"
	case "$_tmp" in
		1|on|true|yes|enabled) _tmp=1;;     # 各种真值表示
		0|off|false|no|disabled) _tmp=0;;   # 各种假值表示
		*) _tmp="$2";;                      # 默认值
	esac
	echo -n "$_tmp"  # 输出结果
}

# 获取布尔型配置值
# config_get_bool <variable> <section> <option> [<default>]
config_get_bool() {
	local _tmp
	# 先获取原始配置值
	config_get _tmp "$2" "$3" "$4"
	# 转换为布尔值
	_tmp="$(get_bool "$_tmp" "$4")"
	# 设置目标变量
	export ${NO_EXPORT:+-n} "$1=$_tmp"
}

# 设置配置值
config_set() {
	local section="$1"  # 配置段
	local option="$2"   # 选项名
	local value="$3"    # 选项值

	# 导出配置变量
	export ${NO_EXPORT:+-n} "CONFIG_${section}_${option}=${value}"
}

# 遍历配置段并执行函数
config_foreach() {
	local ___function="$1"  # 要执行的函数
	[ "$#" -ge 1 ] && shift
	local ___type="$1"      # 配置类型过滤
	[ "$#" -ge 1 ] && shift
	local section cfgtype

	# 如果没有配置段则直接返回
	[ -z "$CONFIG_SECTIONS" ] && return 0
	# 遍历所有配置段
	for section in ${CONFIG_SECTIONS}; do
		# 获取配置段类型
		config_get cfgtype "$section" TYPE
		# 如果指定了类型且不匹配则跳过
		[ -n "$___type" ] && [ "x$cfgtype" != "x$___type" ] && continue
		# 执行回调函数
		eval "$___function \"\$section\" \"\$@\""
	done
}

# 遍历列表并执行函数
config_list_foreach() {
	[ "$#" -ge 3 ] || return 0  # 参数不足则返回
	local section="$1"; shift   # 配置段
	local option="$1"; shift    # 列表选项名
	local function="$1"; shift # 要执行的函数
	local val
	local len
	local c=1

	# 获取列表长度
	config_get len "${section}" "${option}_LENGTH"
	[ -z "$len" ] && return 0  # 如果列表为空则返回
	# 遍历列表项
	while [ $c -le "$len" ]; do
		# 获取列表项值
		config_get val "${section}" "${option}_ITEM$c"
		# 执行回调函数
		eval "$function \"\$val\" \"\$@\""
		c="$((c + 1))"  # 递增计数器
	done
}

# 默认的包卸载前处理函数
default_prerm() {
	local root="${IPKG_INSTROOT}"  # 安装根目录
	[ -z "$pkgname" ] && local pkgname="$(basename ${1%.*})"  # 获取包名
	local ret=0
	# 包文件列表路径
	local filelist="${root}/usr/lib/opkg/info/${pkgname}.list"
	[ -f "$root/lib/apk/packages/${pkgname}.list" ] && filelist="$root/lib/apk/packages/${pkgname}.list"

	# 如果存在包特定的卸载前脚本则执行
	if [ -f "$root/usr/lib/opkg/info/${pkgname}.prerm-pkg" ]; then
		( . "$root/usr/lib/opkg/info/${pkgname}.prerm-pkg" )
		ret=$?
	fi

	local shell="$(command -v bash)"
	# 处理init脚本
	for i in $(grep -s "^/etc/init.d/" "$filelist"); do
		if [ -n "$root" ]; then
			# 在安装根目录环境下禁用服务
			${shell:-/bin/sh} "$root/etc/rc.common" "$root$i" disable
		else
			# 如果不是升级过程则禁用服务
			if [ "$PKG_UPGRADE" != "1" ]; then
				"$i" disable
			fi
			# 停止服务
			"$i" stop
		fi
	done

	return $ret
}

# 添加用户组和用户
add_group_and_user() {
	[ -z "$pkgname" ] && local pkgname="$(basename ${1%.*})"  # 获取包名
	# 读取Require-User字段
	local rusers="$(sed -ne 's/^Require-User: *//p' $root/usr/lib/opkg/info/${pkgname}.control 2>/dev/null)"
	if [ -f "$root/lib/apk/packages/${pkgname}.rusers" ]; then
		local rusers="$(cat $root/lib/apk/packages/${pkgname}.rusers)"
	fi

	if [ -n "$rusers" ]; then
		local tuple oIFS="$IFS"
		# 遍历所有用户组定义
		for tuple in $rusers; do
			local uid gid uname gname addngroups addngroup addngname addngid

			# 解析用户组定义
			IFS=":"
			set -- $tuple; uname="$1"; gname="$2"; addngroups="$3"
			IFS="="
			set -- $uname; uname="$1"; uid="$2"
			set -- $gname; gname="$1"; gid="$2"
			IFS="$oIFS"

			# 处理组
			if [ -n "$gname" ] && [ -n "$gid" ]; then
				# 如果组不存在则添加
				group_exists "$gname" || group_add "$gname" "$gid"
			elif [ -n "$gname" ]; then
				# 自动分配组ID
				gid="$(group_add_next "$gname")"
			fi

			# 处理用户
			if [ -n "$uname" ]; then
				# 如果用户不存在则添加
				user_exists "$uname" || user_add "$uname" "$uid" "$gid"
			fi

			# 将用户添加到主组
			if [ -n "$uname" ] && [ -n "$gname" ]; then
				group_add_user "$gname" "$uname"
			fi

			# 处理附加组
			if [ -n "$uname" ] &&  [ -n "$addngroups" ]; then
				oIFS="$IFS"
				IFS=","
				for addngroup in $addngroups ; do
					IFS="="
					set -- $addngroup; addngname="$1"; addngid="$2"
					if [ -n "$addngid" ]; then
						# 如果附加组不存在则添加
						group_exists "$addngname" || group_add "$addngname" "$addngid"
					else
						# 自动分配附加组ID
						group_add_next "$addngname"
					fi

					# 将用户添加到附加组
					group_add_user "$addngname" "$uname"
				done
				IFS="$oIFS"
			fi

			unset uid gid uname gname addngroups addngroup addngname addngid
		done
	fi
}

# 更新备选方案
update_alternatives() {
	local root="${IPKG_INSTROOT}"  # 安装根目录
	local action="$1"  # 操作类型(install/remove)
	local pkgname="$2" # 包名

	if [ -f "$root/lib/apk/packages/${pkgname}.alternatives" ]; then
		# 遍历所有备选方案
		for pkg_alt in $(cat $root/lib/apk/packages/${pkgname}.alternatives); do
			local best_prio=0;     # 最佳优先级
			local best_src="/bin/busybox";  # 默认最佳源
			pkg_prio=${pkg_alt%%:*};       # 包优先级
			pkg_target=${pkg_alt#*:};      # 目标路径
			pkg_target=${pkg_target%:*};
			pkg_src=${pkg_alt##*:};        # 源路径

			if [ -e "$root/$target" ]; then
				# 查找所有备选方案文件
				for alts in $root/lib/apk/packages/*.alternatives; do
					for alt in $(cat $alts); do
						prio=${alt%%:*};        # 优先级
						target=${alt#*:};       # 目标路径
						target=${target%:*};
						src=${alt##*:};         # 源路径

						# 查找相同目标的最佳备选方案
						if [ "$target" = "$pkg_target" ] &&
						   [ "$src" != "$pkg_src" ] &&
						   [ "$best_prio" -lt "$prio" ]; then
							best_prio=$prio;
							best_src=$src;
						fi
					done
				done
			fi
			case "$action" in
				install)
					# 如果当前包优先级更高则创建链接
					if [ "$best_prio" -lt "$pkg_prio" ]; then
						ln -sf "$pkg_src" "$root/$pkg_target"
						echo "add alternative: $pkg_target -> $pkg_src"
					fi
				;;
				remove)
					# 如果移除的包优先级更高则恢复为次优备选
					if [ "$best_prio" -lt "$pkg_prio" ]; then
						ln -sf "$best_src" "$root/$pkg_target"
						echo "add alternative: $pkg_target -> $best_src"
					fi
				;;
			esac
		done
	fi
}

# 默认的包安装后处理函数
default_postinst() {
	local root="${IPKG_INSTROOT}"  # 安装根目录
	[ -z "$pkgname" ] && local pkgname="$(basename ${1%.*})"  # 获取包名
	local filelist="${root}/usr/lib/opkg/info/${pkgname}.list"  # 包文件列表
	[ -f "$root/lib/apk/packages/${pkgname}.list" ] && filelist="$root/lib/apk/packages/${pkgname}.list"
	local ret=0

	# 处理用户和组
	if [ -e "${root}/usr/lib/opkg/info/${pkgname}.list" ]; then
		filelist="${root}/usr/lib/opkg/info/${pkgname}.list"
		add_group_and_user "${pkgname}"
	fi

	# 处理备选方案
	if [ -e "${root}/lib/apk/packages/${pkgname}.list" ]; then
		filelist="${root}/lib/apk/packages/${pkgname}.list"
		update_alternatives install "${pkgname}"
	fi

	# 处理rootfs覆盖文件
	if [ -d "$root/rootfs-overlay" ]; then
		cp -R $root/rootfs-overlay/. $root/
		rm -fR $root/rootfs-overlay/
	fi

	# 如果不是在安装根目录环境下
	if [ -z "$root" ]; then
		# 处理内核模块
		if grep -m1 -q -s "^/etc/modules.d/" "$filelist"; then
			kmodloader
		fi

		# 处理sysctl配置
		if grep -m1 -q -s "^/etc/sysctl.d/" "$filelist"; then
			/etc/init.d/sysctl restart
		fi

		# 处理uci默认配置
		if grep -m1 -q -s "^/etc/uci-defaults/" "$filelist"; then
			[ -d /tmp/.uci ] || mkdir -p /tmp/.uci
			for i in $(grep -s "^/etc/uci-defaults/" "$filelist"); do
				( [ -f "$i" ] && cd "$(dirname $i)" && . "$i" ) && rm -f "$i"
			done
			uci commit
		fi

		# 清除LuCI缓存
		rm -f /tmp/luci-indexcache
	fi

	# 执行包特定的安装后脚本
	if [ -f "$root/usr/lib/opkg/info/${pkgname}.postinst-pkg" ]; then
		( . "$root/usr/lib/opkg/info/${pkgname}.postinst-pkg" )
		ret=$?
	fi

	local shell="$(command -v bash)"
	# 处理init脚本
	for i in $(grep -s "^/etc/init.d/" "$filelist"); do
		if [ -n "$root" ]; then
			# 在安装根目录环境下启用服务
			${shell:-/bin/sh} "$root/etc/rc.common" "$root$i" enable
		else
			# 如果不是升级过程则启用服务
			if [ "$PKG_UPGRADE" != "1" ]; then
				"$i" enable
			fi
			# 启动服务
			"$i" start
		fi
	done

	return $ret
}

# 包含目录下所有.sh文件
include() {
	local file

	for file in $(ls $1/*.sh 2>/dev/null); do
		. $file
	done
}

# IP地址计算函数
ipcalc() {
	set -- $(ipcalc.sh "$@")  # 调用ipcalc.sh工具
	[ $? -eq 0 ] && export -- "$@"  # 如果成功则导出结果
}

# 查找MTD设备索引
find_mtd_index() {
	local PART="$(grep "\"$1\"" /proc/mtd | awk -F: '{print $1}')"  # 从/proc/mtd查找分区
	local INDEX="${PART##mtd}"  # 提取索引号

	echo ${INDEX}
}

# 查找MTD分区设备
find_mtd_part() {
	local INDEX=$(find_mtd_index "$1")  # 先获取索引
	local PREFIX=/dev/mtdblock

	[ -d /dev/mtdblock ] && PREFIX=/dev/mtdblock/  # 处理不同的设备路径格式
	echo "${INDEX:+$PREFIX$INDEX}"  # 输出完整设备路径
}

# 查找MMC分区设备
find_mmc_part() {
	local DEVNAME PARTNAME ROOTDEV

	# 如果是MTD设备则返回空
	if grep -q "$1" /proc/mtd; then
		echo "" && return 0
	fi

	# 确定根设备
	if [ -n "$2" ]; then
		ROOTDEV="$2"
	else
		ROOTDEV="mmcblk*"
	fi

	# 遍历MMC设备查找匹配分区
	for DEVNAME in /sys/block/$ROOTDEV/mmcblk*p*; do
		PARTNAME="$(grep PARTNAME ${DEVNAME}/uevent | cut -f2 -d'=')"
		[ "$PARTNAME" = "$1" ] && echo "/dev/$(basename $DEVNAME)" && return 0
	done
}

# 添加用户组
group_add() {
	local name="$1"  # 组名
	local gid="$2"   # 组ID
	local rc
	[ -f "${IPKG_INSTROOT}/etc/group" ] || return 1  # 确保组文件存在
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/group  # 加锁
	# 添加组到/etc/group
	echo "${name}:x:${gid}:" >> ${IPKG_INSTROOT}/etc/group
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/group  # 解锁
}

# 检查组是否存在
group_exists() {
	grep -qs "^${1}:" ${IPKG_INSTROOT}/etc/group
}

# 添加组并自动分配ID
group_add_next() {
	local gid gids
	# 先检查是否已存在
	gid=$(grep -s "^${1}:" ${IPKG_INSTROOT}/etc/group | cut -d: -f3)
	if [ -n "$gid" ]; then
		echo $gid
		return
	fi
	# 获取所有已用组ID
	gids=$(cut -d: -f3 ${IPKG_INSTROOT}/etc/group)
	gid=32768  # 起始ID
	# 查找可用ID
	while echo "$gids" | grep -q "^$gid$"; do
		gid=$((gid + 1))
	done
	# 添加组
	group_add $1 $gid
	echo $gid
}

# 添加用户到组
group_add_user() {
	local grp delim=","
	# 获取组信息
	grp=$(grep -s "^${1}:" ${IPKG_INSTROOT}/etc/group)
	# 检查用户是否已在组中
	echo "$grp" | cut -d: -f4 | grep -q $2 && return
	# 确定分隔符
	echo "$grp" | grep -q ":$" && delim=""
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/passwd  # 加锁
	# 更新组信息
	sed -i "s/$grp/$grp$delim$2/g" ${IPKG_INSTROOT}/etc/group
	# 如果启用了SELinux则恢复上下文
	if [ -z "$IPKG_INSTROOT" ] && [ -x /usr/sbin/selinuxenabled ] && selinuxenabled; then
		restorecon /etc/group
	fi
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/passwd  # 解锁
}

# 添加用户
user_add() {
	local name="${1}"      # 用户名
	local uid="${2}"       # 用户ID
	local gid="${3}"       # 组ID
	local desc="${4:-$1}"  # 描述(默认为用户名)
	local home="${5:-/var/run/$1}"  # 家目录(默认为/var/run/用户名)
	local shell="${6:-/bin/false}"  # shell(默认为/bin/false)
	local rc
	# 自动分配UID
	[ -z "$uid" ] && {
		uids=$(cut -d: -f3 ${IPKG_INSTROOT}/etc/passwd)
		uid=32768  # 起始UID
		# 查找可用UID
		while echo "$uids" | grep -q "^$uid$"; do
			uid=$((uid + 1))
		done
	}
	# 如果未提供GID则使用UID
	[ -z "$gid" ] && gid=$uid
	[ -f "${IPKG_INSTROOT}/etc/passwd" ] || return 1  # 确保passwd文件存在
	[ -n "$IPKG_INSTROOT" ] || lock /var/lock/passwd  # 加锁
	# 添加用户到/etc/passwd
	echo "${name}:x:${uid}:${gid}:${desc}:${home}:${shell}" >> ${IPKG_INSTROOT}/etc/passwd
	# 添加shadow条目
	echo "${name}:x:0:0:99999:7:::" >> ${IPKG_INSTROOT}/etc/shadow
	[ -n "$IPKG_INSTROOT" ] || lock -u /var/lock/passwd  # 解锁
}

# 检查用户是否存在
user_exists() {
	grep -qs "^${1}:" ${IPKG_INSTROOT}/etc/passwd
}

# 获取板名
board_name() {
	[ -e /tmp/sysinfo/board_name ] && cat /tmp/sysinfo/board_name || echo "generic"
}

# 从内核命令行获取变量值
cmdline_get_var() {
	local var=$1
	local cmdlinevar tmp

	# 遍历内核命令行参数
	for cmdlinevar in $(cat /proc/cmdline); do
		tmp=${cmdlinevar##${var}}
		[ "=" = "${tmp:0:1}" ] && echo ${tmp:1}
	done
}

# 加载uci.sh脚本(如果存在且不在安装根目录环境下)
[ -z "$IPKG_INSTROOT" ] && [ -f /lib/config/uci.sh ] && . /lib/config/uci.sh || true
