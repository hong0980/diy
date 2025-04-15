#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# Copyright (C) 2006-2013 OpenWrt.org
# 版权信息，标明 OpenWrt 社区及年份。

get_mac_binary() {
	# 作用：从指定文件中读取指定偏移量的 6 字节二进制数据，并格式化为 MAC 地址。
	local path="$1"
	# 获取文件路径。
	local offset="$2"
	# 获取偏移量。

	if ! [ -e "$path" ]; then
		# 如果文件不存在。
		echo "get_mac_binary: file $path not found!" >&2
		# 输出错误信息到标准错误。
		return
		# 返回。
	fi

	hexdump -v -n 6 -s $offset -e '5/1 "%02x:" 1/1 "%02x"' $path 2>/dev/null
	# 使用 hexdump 读取 6 字节数据，格式化为 xx:xx:xx:xx:xx:xx。
}

find_mtd_chardev() {
	# 作用：查找指定 MTD 分区的字符设备路径。
	local INDEX=$(find_mtd_index "$1")
	# 获取 MTD 分区的索引。
	local PREFIX=/dev/mtd
	# 设置默认设备前缀。

	[ -d /dev/mtd ] && PREFIX=/dev/mtd/
	# 如果 /dev/mtd 目录存在，使用带斜杠的前缀。
	echo "${INDEX:+$PREFIX$INDEX}"
	# 输出设备路径（如果索引存在）。
}

mtd_get_mac_ascii() {
	# 作用：从 MTD 分区中读取 ASCII 格式的 MAC 地址（基于键值）。
	local mtdname="$1"
	# 获取 MTD 分区名称。
	local key="$2"
	# 获取键名。
	local part
	# 声明变量存储分区设备路径。
	local mac_dirty
	# 声明变量存储原始 MAC 地址。

	part=$(find_mtd_part "$mtdname")
	# 查找 MTD 分区设备路径。
	if [ -z "$part" ]; then
		# 如果分区不存在。
		echo "mtd_get_mac_ascii: partition $mtdname not found!" >&2
		# 输出错误信息到标准错误。
		return
		# 返回。
	fi

	mac_dirty=$(strings "$part" | sed -n 's/^'"$key"'=//p')
	# 使用 strings 提取分区中的字符串，查找以 key= 开头的行并提取值。

	# "canonicalize" mac
	[ -n "$mac_dirty" ] && macaddr_canonicalize "$mac_dirty"
	# 如果提取到 MAC 地址，调用 macaddr_canonicalize 规范化输出。
}

mtd_get_mac_text() {
	# 作用：从 MTD 分区指定偏移量读取 17 字节文本格式的 MAC 地址。
	local mtdname=$1
	# 获取 MTD 分区名称。
	local offset=$2
	# 获取偏移量。
	local part
	# 声明变量存储分区设备路径。
	local mac_dirty
	# 声明变量存储原始 MAC 地址。

	part=$(find_mtd_part "$mtdname")
	# 查找 MTD 分区设备路径。
	if [ -z "$part" ]; then
		# 如果分区不存在。
		echo "mtd_get_mac_text: partition $mtdname not found!" >&2
		# 输出错误信息到标准错误。
		return
		# 返回。
	fi

	if [ -z "$offset" ]; then
		# 如果未提供偏移量。
		echo "mtd_get_mac_text: offset missing!" >&2
		# 输出错误信息到标准错误。
		return
		# 返回。
	fi

	mac_dirty=$(dd if="$part" bs=1 skip="$offset" count=17 2>/dev/null)
	# 使用 dd 从分区读取 17 字节数据（假设为文本 MAC 地址）。

	# "canonicalize" mac
	[ -n "$mac_dirty" ] && macaddr_canonicalize "$mac_dirty"
	# 如果提取到 MAC 地址，调用 macaddr_canonicalize 规范化输出。
}

mtd_get_mac_binary() {
	# 作用：从 MTD 分区指定偏移量读取二进制格式的 MAC 地址。
	local mtdname="$1"
	# 获取 MTD 分区名称。
	local offset="$2"
	# 获取偏移量。
	local part
	# 声明变量存储分区设备路径。

	part=$(find_mtd_part "$mtdname")
	# 查找 MTD 分区设备路径。
	get_mac_binary "$part" "$offset"
	# 调用 get_mac_binary 读取二进制 MAC 地址。
}

mtd_get_mac_binary_ubi() {
	# 作用：从 UBI 卷指定偏移量读取二进制格式的 MAC 地址。
	local mtdname="$1"
	# 获取 UBI 卷名称。
	local offset="$2"
	# 获取偏移量。

	. /lib/upgrade/nand.sh
	# 引入 NAND 升级脚本，提供 UBI 相关函数。

	local ubidev=$(nand_find_ubi $CI_UBIPART)
	# 查找 UBI 设备。
	local part=$(nand_find_volume $ubidev $1)
	# 查找指定 UBI 卷。

	get_mac_binary "/dev/$part" "$offset"
	# 调用 get_mac_binary 读取二进制 MAC 地址。
}

mtd_get_part_size() {
	# 作用：获取指定 MTD 分区的大小（字节）。
	local part_name=$1
	# 获取分区名称。
	local first dev size erasesize name
	# 声明变量存储 /proc/mtd 的字段。

	while read dev size erasesize name; do
		# 逐行读取 /proc/mtd 文件。
		name=${name#'"'}; name=${name%'"'}
		# 去除分区名称的引号。
		if [ "$name" = "$part_name" ]; then
			# 如果找到匹配的分区名称。
			echo $((0x$size))
			# 将十六进制大小转换为十进制输出。
			break
			# 退出循环。
		fi
	done < /proc/mtd
	# 从 /proc/mtd 读取分区信息。
}

macaddr_add() {
	# 作用：对 MAC 地址的末三位（NIC 部分）进行增量计算，生成新 MAC 地址。
	local mac=$1
	# 获取原始 MAC 地址。
	local val=$2
	# 获取增量值。
	local oui=${mac%:*:*:*}
	# 提取 MAC 地址的前三位（OUI 部分）。
	local nic=${mac#*:*:*:}
	# 提取 MAC 地址的后三位（NIC 部分）。

	nic=$(printf "%06x" $((0x${nic//:/} + $val & 0xffffff)) | sed 's/^\(.\{2\}\)\(.\{2\}\)\(.\{2\}\)/\1:\2:\3/')
	# 将 NIC 部分转换为整数，加增量后取低 24 位，格式化为 xx:xx:xx。
	echo $oui:$nic
	# 输出新的 MAC 地址（OUI + 新 NIC）。
}

macaddr_setbit_la() {
	# 作用：设置 MAC 地址第一个字节的本地管理位（第 2 位），标记为本地地址。
	local mac=$1
	# 获取 MAC 地址。

	printf "%02x:%s" $((0x${mac%%:*} | 0x02)) ${mac#*:}
	# 将第一个字节与 0x02 按位或，保持其他字节不变，输出新 MAC 地址。
}

macaddr_2bin() {
	# 作用：将 MAC 地址转换为二进制格式（6 字节）。
	local mac=$1
	# 获取 MAC 地址。

	echo -ne \\x${mac//:/\\x}
	# 将 MAC 地址的冒号替换为 \x，输出二进制数据。
}

macaddr_canonicalize() {
	# 作用：规范化 MAC 地址格式，输出标准的 xx:xx:xx:xx:xx:xx 格式。
	local mac="$1"
	# 获取输入的 MAC 地址。
	local canon=""
	# 声明变量存储规范化结果。

	mac=$(echo -n $mac | tr -d \")
	# 去除输入中的双引号。
	[ ${#mac} -gt 17 ] && return
	# 如果输入长度超过 17 字节，返回（无效）。
	[ -n "${mac//[a-fA-F0-9\.: -]/}" ] && return
	# 如果输入包含非合法字符（字母、数字、冒号、点、空格、连字符），返回。

	for octet in ${mac//[\.:-]/ }; do
		# 遍历去除分隔符后的字节。
		case "${#octet}" in
		1)
			# 如果字节长度为 1。
			octet="0${octet}"
			# 在前面补 0。
			;;
		2)
			# 如果字节长度为 2，无需处理。
			;;
		4)
			# 如果字节长度为 4（可能是两个字节）。
			octet="${octet:0:2} ${octet:2:2}"
			# 分割为两个字节。
			;;
		12)
			# 如果字节长度为 12（可能是完整 MAC 地址）。
			octet="${octet:0:2} ${octet:2:2} ${octet:4:2} ${octet:6:2} ${octet:8:2} ${octet:10:2}"
			# 分割为 6 个字节。
			;;
		*)
			# 其他长度无效。
			return
			;;
		esac
		canon=${canon}${canon:+ }${octet}
		# 将字节追加到规范化结果，字节间用空格分隔。
	done

	[ ${#canon} -ne 17 ] && return
	# 如果规范化结果长度不为 17（6 个字节 + 5 个冒号），返回。

	printf "%02x:%02x:%02x:%02x:%02x:%02x" 0x${canon// / 0x} 2>/dev/null
	# 将字节转换为标准 MAC 地址格式输出。
}
