# Copyright (C) 2006-2013 OpenWrt.org
# =============================================================================
# system.sh —— OpenWrt 系统级硬件信息读取工具库
# =============================================================================
# 本文件提供一组 Shell 函数，用于从各类硬件存储介质（MTD Flash、UBI、MMC）
# 和设备树（Device Tree）中读取 MAC 地址，以及对 MAC 地址进行格式化处理。
#
# 【背景知识】
#   OpenWrt 路由器通常将出厂 MAC 地址烧写在 Flash 分区（如 art、factory）中，
#   开机时由 init 脚本读取并配置到网络接口。本库提供统一的读取接口。
#
# 【存储介质说明】
#   MTD  : Memory Technology Device，嵌入式设备的 NOR/NAND Flash 分区接口
#          分区信息在 /proc/mtd，设备节点为 /dev/mtd0、/dev/mtd1...
#   UBI  : Unsorted Block Images，NAND Flash 上的逻辑卷管理层（类似 LVM）
#   MMC  : MultiMediaCard，eMMC/SD 卡存储设备
#   DT   : Device Tree，设备树，ARM 嵌入式平台用于描述硬件的数据结构，
#          在 Linux 中以虚拟文件系统形式挂载于 /proc/device-tree/
#
# 【MAC 地址格式说明】
#   标准格式：xx:xx:xx:xx:xx:xx（6组两位十六进制，冒号分隔）
#   原始二进制：6字节连续存储在 Flash 特定偏移处
#   ASCII 文本：以 "KEY=xx:xx:xx:xx:xx:xx" 形式存储在 Flash 文本区
#
# =============================================================================

# 加载 OpenWrt 通用函数库（提供 find_mtd_part、find_mtd_index 等函数）
. /lib/functions.sh
# 加载 JSON 操作库（用于解析 board.json）
. /usr/share/libubox/jshn.sh


# =============================================================================
# get_mac_binary() —— 从任意文件的指定偏移处读取 6 字节二进制 MAC 地址
# =============================================================================
# 参数：$1 - 文件路径（如 /dev/mtd3、/proc/device-tree/.../mac-address）
#       $2 - 字节偏移量（从文件起始位置跳过的字节数）
# 输出：标准格式 MAC 地址（如 aa:bb:cc:dd:ee:ff），失败时无输出
# 说明：使用 hexdump 读取 6 字节并格式化：
#       前 5 字节格式为 "%02x:"，最后 1 字节格式为 "%02x"（无尾部冒号）
# 示例：get_mac_binary /dev/mtd3 0x10   → 读取 mtd3 第 16 字节处的 MAC
# =============================================================================
get_mac_binary() {
	local path="$1"
	local offset="$2"

	if ! [ -e "$path" ]; then
		echo "get_mac_binary: file $path not found!" >&2
		return
	fi

	# -v: 不省略重复行；-n 6: 读取6字节；-s $offset: 跳过偏移
	# -e '5/1 "%02x:" 1/1 "%02x"': 前5字节加冒号，最后1字节不加
	hexdump -v -n 6 -s $offset -e '5/1 "%02x:" 1/1 "%02x"' $path 2>/dev/null
}


# =============================================================================
# get_mac_label_dt() —— 从设备树（Device Tree）读取标签 MAC 地址
# =============================================================================
# 说明：设备树中通常有 aliases/label-mac-device 节点指向某个网络设备，
#       该设备下存有 mac-address 或 local-mac-address 属性（二进制格式）。
#       此函数按优先级尝试读取两个属性。
# 输出：标准格式 MAC 地址，或空（设备树中无相关节点时）
# 设备树路径示例：
#   /proc/device-tree/aliases/label-mac-device → "ethernet0"
#   /proc/device-tree/ethernet0/mac-address    → 6字节二进制
# =============================================================================
get_mac_label_dt() {
	local basepath="/proc/device-tree"
	# 读取 aliases 中指向标签 MAC 设备的节点名（如 "ethernet0"）
	local macdevice="$(cat "$basepath/aliases/label-mac-device" 2>/dev/null)"
	local macaddr

	[ -n "$macdevice" ] || return  # 无 label-mac-device 则退出

	# 优先读取 mac-address 属性（标准属性名）
	macaddr=$(get_mac_binary "$basepath/$macdevice/mac-address" 0 2>/dev/null)
	# 若无 mac-address，尝试 local-mac-address（部分厂商使用此名称）
	[ -n "$macaddr" ] || macaddr=$(get_mac_binary "$basepath/$macdevice/local-mac-address" 0 2>/dev/null)

	echo $macaddr
}


# =============================================================================
# get_mac_label_json() —— 从 /etc/board.json 读取标签 MAC 地址
# =============================================================================
# 说明：OpenWrt 在编译时会生成 /etc/board.json，包含板级硬件信息，
#       其中 system.label_macaddr 字段存储标签 MAC 地址（如印在路由器底部标签上的）。
# 输出：标准格式 MAC 地址，或空（board.json 不存在或无该字段时）
# =============================================================================
get_mac_label_json() {
	local cfg="/etc/board.json"
	local macaddr

	[ -s "$cfg" ] || return  # 文件不存在或为空则退出

	# 使用 jshn 解析 JSON：进入 system 对象，读取 label_macaddr 字段
	json_init
	json_load "$(cat $cfg)"
	if json_is_a system object; then
		json_select system
			json_get_var macaddr label_macaddr
		json_select ..
	fi

	echo $macaddr
}


# =============================================================================
# get_mac_label() —— 获取设备标签 MAC 地址（自动选择来源）
# =============================================================================
# 优先级：设备树（DT）> board.json
# 说明：统一入口，先尝试从设备树读取，若失败再从 board.json 读取。
#       标签 MAC 是路由器底部贴纸上印的 MAC，通常作为 WAN/LAN MAC 的基准值。
# 示例：label_mac=$(get_mac_label)
# =============================================================================
get_mac_label() {
	local macaddr=$(get_mac_label_dt)

	[ -n "$macaddr" ] || macaddr=$(get_mac_label_json)

	echo $macaddr
}


# =============================================================================
# find_mtd_chardev() —— 根据 MTD 分区名查找对应的字符设备路径
# =============================================================================
# 参数：$1 - MTD 分区名（如 "factory"、"art"、"config"）
# 输出：设备节点路径（如 /dev/mtd3 或 /dev/mtd/3）
# 说明：不同内核版本设备节点路径不同（旧版 /dev/mtd3，新版 /dev/mtd/3）
#       find_mtd_index 由 /lib/functions.sh 提供，解析 /proc/mtd 获取分区编号
# =============================================================================
find_mtd_chardev() {
	local INDEX=$(find_mtd_index "$1")
	local PREFIX=/dev/mtd

	# 若 /dev/mtd 是目录（新版内核），追加斜杠前缀
	[ -d /dev/mtd ] && PREFIX=/dev/mtd/
	echo "${INDEX:+$PREFIX$INDEX}"
}


# =============================================================================
# get_mac_ascii() —— 从任意文件的 ASCII 文本中提取 MAC 地址
# =============================================================================
# 参数：$1 - 文件路径（如 MTD 分区设备节点）
#       $2 - 键名（如 "ethaddr"、"wan_mac"）
# 输出：规范化后的 MAC 地址，或空
# 说明：Flash 中部分厂商将配置以 "KEY=VALUE" 纯文本形式存储，
#       本函数用 strings 提取可打印字符，再用 sed 匹配 KEY=MAC 格式。
#       提取后调用 macaddr_canonicalize 规范化格式。
# 示例：get_mac_ascii /dev/mtd3 "ethaddr"  → "aa:bb:cc:dd:ee:ff"
# =============================================================================
get_mac_ascii() {
	local part="$1"
	local key="$2"
	local mac_dirty

	# strings: 提取文件中的可打印字符串
	# tr -d: 去除空格和制表符（防止键名前后有空白）
	# sed -n: 匹配 KEY= 开头的行，提取等号后的值
	# head -n 1: 只取第一条匹配
	mac_dirty=$(strings "$part" | tr -d ' \t' | sed -n 's/^'"$key"'=//p' | head -n 1)

	# 规范化 MAC 地址格式（处理各种奇怪格式）
	[ -n "$mac_dirty" ] && macaddr_canonicalize "$mac_dirty"
}


# =============================================================================
# mtd_get_mac_ascii() —— 从 MTD 分区的 ASCII 文本中读取 MAC 地址
# =============================================================================
# 参数：$1 - MTD 分区名（如 "factory"）
#       $2 - 键名（如 "ethaddr"）
# 输出：规范化后的 MAC 地址，或空
# 说明：封装 get_mac_ascii，自动将分区名转换为设备路径。
# 示例：mtd_get_mac_ascii "factory" "ethaddr"
# =============================================================================
mtd_get_mac_ascii() {
	local mtdname="$1"
	local key="$2"
	local part

	part=$(find_mtd_part "$mtdname")
	if [ -z "$part" ]; then
		echo "mtd_get_mac_ascii: partition $mtdname not found!" >&2
		return
	fi

	get_mac_ascii "$part" "$key"
}


# =============================================================================
# mtd_get_mac_encrypted_arcadyan() —— 读取 Arcadyan 设备加密的 MAC 地址
# =============================================================================
# 参数：$1 - MTD 分区名
# 说明：Arcadyan（华为代工）路由器将配置信息以 AES-128-CBC 加密存储在 Flash 中。
#       固定密钥和 IV 为设备通用值。解密后从文本中提取 mac= 行。
#       支持 uencrypt（OpenWrt 内置）和 openssl 两种解密工具。
# 加密参数：
#   算法：AES-128-CBC，无填充
#   Key：2A4B303D7644395C3B2B7053553C5200（固定硬编码）
#   IV： 00000000000000000000000000000000（全零）
#   数据：从偏移 0x100 处开始，长度记录在偏移 9 处的 4 字节大端整数
# =============================================================================
mtd_get_mac_encrypted_arcadyan() {
	local iv="00000000000000000000000000000000"
	local key="2A4B303D7644395C3B2B7053553C5200"
	local mac_dirty
	local mtdname="$1"
	local part
	local size

	part=$(find_mtd_part "$mtdname")
	if [ -z "$part" ]; then
		echo "mtd_get_mac_encrypted_arcadyan: partition $mtdname not found!" >&2
		return
	fi

	# 从偏移 9 处读取 4 字节，作为加密数据的长度（十六进制转十进制）
	size=$((0x$(dd if=$part skip=9 bs=1 count=4 2>/dev/null | hexdump -v -e '1/4 "%08x"')))

	if [[ -f "/usr/bin/uencrypt" ]]; then
		# 使用 uencrypt（OpenWrt 内置解密工具）
		# -d: 解密；-n: 无填充；-k: 密钥；-i: IV
		mac_dirty=$(dd if=$part bs=1 count=$size skip=$((0x100)) 2>/dev/null | \
			uencrypt -d -n -k $key -i $iv | grep mac | cut -c 5-)
	elif [[ -f "/usr/bin/openssl" ]]; then
		# 使用 openssl 作为备选
		# aes-128-cbc -d: AES-128-CBC 解密；-nopad: 无填充；-K/-iv: 密钥和IV
		mac_dirty=$(dd if=$part bs=1 count=$size skip=$((0x100)) 2>/dev/null | \
			openssl aes-128-cbc -d -nopad -K $key -iv $iv | grep mac | cut -c 5-)
	else
		echo "mtd_get_mac_encrypted_arcadyan: Neither uencrypt nor openssl was found!" >&2
		return
	fi

	[ -n "$mac_dirty" ] && macaddr_canonicalize "$mac_dirty"
}


# =============================================================================
# mtd_get_mac_encrypted_deco() —— 读取 TP-Link Deco 设备加密的 MAC 地址
# =============================================================================
# 参数：$1 - 包含加密数据的文件路径（通常为 MTD 分区路径）
# 说明：TP-Link Deco 系列设备使用两层 DES-ECB 加密存储 MAC 地址。
#   第一层：用固定 TP-Link 密钥解密偏移 16 处的 8 字节，得到设备特定密钥
#   第二层：用第一层解出的密钥解密偏移 32 处的 8 字节，得到 MAC 地址
# 加密参数：
#   算法：DES-ECB（无填充）
#   固定密钥（十六进制）：3336303032384339（即 ASCII "360028C9"）
# =============================================================================
mtd_get_mac_encrypted_deco() {
	local mtdname="$1"

	if ! [ -e "$mtdname" ]; then
		echo "mtd_get_mac_encrypted_deco: file $mtdname not found!" >&2
		return
	fi

	tplink_key="3336303032384339"

	# 第一层解密：从偏移 16 读 8 字节，用固定密钥解密，得到设备密钥
	key=$(dd if=$mtdname bs=1 skip=16 count=8 2>/dev/null | \
		uencrypt -n -d -k $tplink_key -c des-ecb | hexdump -v -n 8 -e '1/1 "%02x"')

	# 第二层解密：从偏移 32 读 8 字节，用第一层密钥解密，得到 MAC（取前6字节）
	macaddr=$(dd if=$mtdname bs=1 skip=32 count=8 2>/dev/null | \
		uencrypt -n -d -k $key -c des-ecb | hexdump -v -n 6 -e '5/1 "%02x:" 1/1 "%02x"')

	echo $macaddr
}


# =============================================================================
# mtd_get_mac_uci_config_ubi() —— 从 UBI 卷的 UCI 配置中读取 MAC 地址
# =============================================================================
# 参数：$1 - UBI 卷名（逻辑卷名，非设备路径）
# 说明：某些设备将网络配置以 UCI 格式存储在独立 UBI 卷中，
#       本函数挂载 UBI 分区，找到指定卷，从中提取 "option macaddr" 配置行。
# UCI 格式示例：option macaddr 'AA:BB:CC:DD:EE:FF'
# =============================================================================
mtd_get_mac_uci_config_ubi() {
	local volumename="$1"

	# 加载 NAND Flash 操作函数（提供 nand_attach_ubi、nand_find_volume）
	. /lib/upgrade/nand.sh

	# 挂载 UBI 分区（CI_UBIPART 为全局变量，指定主 UBI 分区名）
	local ubidev=$(nand_attach_ubi $CI_UBIPART)
	local part=$(nand_find_volume $ubidev $volumename)

	# 用 sed 提取 "option macaddr 'XX:XX:XX:XX:XX:XX'" 中的 MAC 值
	# \s* 匹配可选空格；'"'\? 匹配可选引号；[0-9A-F:]+ 匹配 MAC；/I 不区分大小写
	cat "/dev/$part" | sed -n 's/^\s*option macaddr\s*'"'"'\?\([0-9A-F:]\+\)'"'"'\?/\1/Ip'
}


# =============================================================================
# mtd_get_mac_text() —— 从 MTD 分区指定偏移处读取 ASCII 格式 MAC 地址
# =============================================================================
# 参数：$1 - MTD 分区名
#       $2 - 字节偏移量（默认 0）
#       $3 - 读取长度（默认 17，即标准 MAC 格式 "xx:xx:xx:xx:xx:xx" 的字符数）
# 说明：直接按字节偏移读取 ASCII 文本，适用于 MAC 地址以文本形式直接存储的情况。
#       读取前会校验偏移+长度不超过分区大小，防止越界读取。
# 示例：mtd_get_mac_text "factory" 0x100   → 从 factory 分区偏移 0x100 处读取 MAC
# =============================================================================
mtd_get_mac_text() {
	local mtdname="$1"
	local offset=$((${2:-0}))    # 默认偏移为 0
	local length="${3:-17}"      # 默认读取 17 字节（标准 MAC 文本长度）
	local part

	part=$(find_mtd_part "$mtdname")
	if [ -z "$part" ]; then
		echo "mtd_get_mac_text: partition $mtdname not found!" >&2
		return
	fi

	# 校验不超出分区边界
	[ $((offset + length)) -le $(mtd_get_part_size "$mtdname") ] || return

	# 读取指定范围的字节并规范化 MAC 格式
	macaddr_canonicalize $(dd bs=1 if="$part" skip="$offset" count="$length" 2>/dev/null)
}


# =============================================================================
# mtd_get_mac_binary() —— 从 MTD 分区指定偏移处读取二进制 MAC 地址
# =============================================================================
# 参数：$1 - MTD 分区名（如 "art"、"factory"）
#       $2 - 字节偏移量
# 说明：封装 get_mac_binary，自动将分区名转换为设备路径。
# 示例：mtd_get_mac_binary "art" 0x1006  → 读取 art 分区偏移 0x1006 处的 MAC
# =============================================================================
mtd_get_mac_binary() {
	local mtdname="$1"
	local offset="$2"
	local part

	part=$(find_mtd_part "$mtdname")
	get_mac_binary "$part" "$offset"
}


# =============================================================================
# mtd_get_mac_binary_ubi() —— 从 UBI 卷指定偏移处读取二进制 MAC 地址
# =============================================================================
# 参数：$1 - UBI 卷名
#       $2 - 字节偏移量
# 说明：UBI 版本的二进制 MAC 读取，先挂载 UBI 找到卷，再调用 get_mac_binary。
# =============================================================================
mtd_get_mac_binary_ubi() {
	local mtdname="$1"
	local offset="$2"

	. /lib/upgrade/nand.sh

	# nand_find_ubi: 查找已挂载的 UBI 设备
	# nand_find_volume: 在 UBI 设备中查找指定卷名
	local ubidev=$(nand_find_ubi $CI_UBIPART)
	local part=$(nand_find_volume $ubidev $1)

	get_mac_binary "/dev/$part" "$offset"
}


# =============================================================================
# mtd_get_part_size() —— 获取 MTD 分区大小（字节）
# =============================================================================
# 参数：$1 - MTD 分区名
# 输出：分区大小（十进制字节数）
# 说明：通过解析 /proc/mtd 获取分区大小（十六进制），转换为十进制。
# /proc/mtd 格式示例：
#   dev:     size   erasesize  name
#   mtd0: 00040000 00020000 "u-boot"
#   mtd3: 00100000 00010000 "factory"
# =============================================================================
mtd_get_part_size() {
	local part_name=$1
	local first dev size erasesize name
	while read dev size erasesize name; do
		# 去除名称字段的引号
		name=${name#'"'}; name=${name%'"'}
		if [ "$name" = "$part_name" ]; then
			echo $((0x$size))    # 将十六进制大小转为十进制
			break
		fi
	done < /proc/mtd
}


# =============================================================================
# mmc_get_mac_ascii() —— 从 MMC/eMMC 分区的 ASCII 文本中读取 MAC 地址
# =============================================================================
# 参数：$1 - MMC 分区名
#       $2 - 键名（如 "ethaddr"）
# 说明：MMC 版本的 ASCII MAC 读取，适用于使用 eMMC 的设备。
#       find_mmc_part 由 /lib/functions.sh 提供。
# =============================================================================
mmc_get_mac_ascii() {
	local part_name="$1"
	local key="$2"
	local part

	part=$(find_mmc_part "$part_name")
	if [ -z "$part" ]; then
		echo "mmc_get_mac_ascii: partition $part_name not found!" >&2
		return
	fi

	get_mac_ascii "$part" "$key"
}


# =============================================================================
# mmc_get_mac_binary() —— 从 MMC/eMMC 分区指定偏移处读取二进制 MAC 地址
# =============================================================================
# 参数：$1 - MMC 分区名
#       $2 - 字节偏移量
# =============================================================================
mmc_get_mac_binary() {
	local part_name="$1"
	local offset="$2"
	local part

	part=$(find_mmc_part "$part_name")
	get_mac_binary "$part" "$offset"
}


# =============================================================================
# ── MAC 地址操作工具函数 ──────────────────────────────────────────────────────
# =============================================================================

# =============================================================================
# macaddr_add() —— 在 MAC 地址的 NIC 部分（后3字节）加上一个整数偏移
# =============================================================================
# 参数：$1 - 原始 MAC 地址（标准格式）
#       $2 - 要加的整数值（可以是负数）
# 输出：新的 MAC 地址（OUI 不变，NIC 部分加上偏移值）
# 说明：OpenWrt 通常从路由器标签 MAC 派生多个接口 MAC，
#       如 WAN=label_mac+0，LAN=label_mac+1，WiFi=label_mac+2。
#       溢出时自动回绕（只保留低 24 位，不会修改 OUI）。
# 示例：macaddr_add "aa:bb:cc:dd:ee:ff" 2  → "aa:bb:cc:dd:ef:01"
# =============================================================================
macaddr_add() {
	local mac=$1
	local val=$2
	local oui=${mac%:*:*:*}    # 提取 OUI（前3字节）：aa:bb:cc
	local nic=${mac#*:*:*:}    # 提取 NIC（后3字节）：dd:ee:ff

	# 去掉冒号转为整数，加上偏移，与 0xffffff 取 AND 防止溢出，再格式化
	nic=$(printf "%06x" $((0x${nic//:/} + val & 0xffffff)) | sed 's/^\(.\{2\}\)\(.\{2\}\)\(.\{2\}\)/\1:\2:\3/')
	echo $oui:$nic
}


# =============================================================================
# macaddr_generate_from_mmc_cid() —— 从 MMC 卡的 CID 生成 MAC 地址
# =============================================================================
# 参数：$1 - MMC 块设备名（如 "mmcblk0"）
# 输出：本地单播 MAC 地址
# 说明：适用于无固化 MAC 的设备（如某些 eMMC 路由器）。
#       对 MMC CID（卡唯一标识符）做 SHA256 哈希，取前 12 个十六进制字符作为 MAC，
#       然后设置 LA 位（本地管理位）并清除 MC 位（多播位），确保是有效单播 MAC。
# =============================================================================
macaddr_generate_from_mmc_cid() {
	local mmc_dev=$1

	# SHA256 哈希 CID，取哈希值的前 12 个字符作为 MAC 的 6 字节（不含分隔符）
	local sd_hash=$(sha256sum /sys/class/block/$mmc_dev/device/cid)
	local mac_base=$(macaddr_canonicalize "$(echo "${sd_hash}" | dd bs=1 count=12 2>/dev/null)")
	# 设置 LA 位（第7位=1，表示本地管理）并清除 MC 位（第8位=0，确保单播）
	echo "$(macaddr_unsetbit_mc "$(macaddr_setbit_la "${mac_base}")")"
}


# =============================================================================
# macaddr_geteui() —— 提取 MAC 地址的 EUI（扩展唯一标识符，后3字节）
# =============================================================================
# 参数：$1 - MAC 地址（标准格式）
#       $2 - 字节间分隔符（可选，默认无分隔符）
# 输出：MAC 地址的后3字节（xx:yy:zz 或 xxyyzz 等格式）
# 说明：EUI（后3字节）通常用于生成 IPv6 EUI-64 接口标识符。
# 示例：macaddr_geteui "aa:bb:cc:dd:ee:ff" ":"  → "dd:ee:ff"
#       macaddr_geteui "aa:bb:cc:dd:ee:ff"      → "ddeeff"
# =============================================================================
macaddr_geteui() {
	local mac=$1
	local sep=$2

	# 字符串截取：位置9开始取2字符（第4字节），位置12取2字符（第5字节），位置15取2字符（第6字节）
	echo ${mac:9:2}$sep${mac:12:2}$sep${mac:15:2}
}


# =============================================================================
# macaddr_setbit() —— 设置 MAC 地址的指定位
# =============================================================================
# 参数：$1 - MAC 地址
#       $2 - 位编号（1-48，从最高位 MSB 算起；默认 0 表示不操作）
# 说明：MAC 地址视为 48 位整数，第1位为最高位（第1字节的最高位）。
#       常用位：第7位（LA 位，本地管理）、第8位（MC 位，多播）
# 示例：macaddr_setbit "02:00:00:00:00:00" 7  → 设置 LA 位
# =============================================================================
macaddr_setbit() {
	local mac=$1
	local bit=${2:-0}

	[ $bit -gt 0 -a $bit -le 48 ] || return

	# 去掉冒号转为整数，与位掩码 OR，再格式化回 MAC（每2字符加冒号）
	printf "%012x" $(( 0x${mac//:/} | 2**(48-bit) )) | sed -e 's/\(.\{2\}\)/\1:/g' -e 's/:$//'
}


# =============================================================================
# macaddr_unsetbit() —— 清除 MAC 地址的指定位
# =============================================================================
# 参数：$1 - MAC 地址
#       $2 - 位编号（1-48；默认 0 表示不操作）
# 说明：与 macaddr_setbit 相反，将指定位清零。
# =============================================================================
macaddr_unsetbit() {
	local mac=$1
	local bit=${2:-0}

	[ $bit -gt 0 -a $bit -le 48 ] || return

	# 与位掩码取反后 AND，清除指定位
	printf "%012x" $(( 0x${mac//:/} & ~(2**(48-bit)) )) | sed -e 's/\(.\{2\}\)/\1:/g' -e 's/:$//'
}


# =============================================================================
# macaddr_setbit_la() —— 设置 MAC 地址的本地管理位（LA 位，第7位）
# =============================================================================
# 参数：$1 - MAC 地址
# 说明：IEEE 802 规定 MAC 地址第1字节第2位（从低位数为第7位全局位）为：
#       0 = 全局唯一（OUI 分配），1 = 本地管理（自行定义）
#       设置 LA 位表明此 MAC 是本地随机生成的，非全球唯一 OUI。
# 示例：macaddr_setbit_la "00:11:22:33:44:55"  → "02:11:22:33:44:55"
# =============================================================================
macaddr_setbit_la() {
	macaddr_setbit $1 7
}


# =============================================================================
# macaddr_unsetbit_mc() —— 清除 MAC 地址的多播位（MC 位，第8位/第1字节最低位）
# =============================================================================
# 参数：$1 - MAC 地址
# 说明：MAC 地址第1字节最低位为多播位：0=单播，1=多播/广播。
#       生成随机 MAC 时必须清除此位，确保是单播地址。
#       注意：此函数只修改第1字节，效率比 macaddr_unsetbit 更高（直接字符串操作）。
# 示例：macaddr_unsetbit_mc "03:11:22:33:44:55"  → "02:11:22:33:44:55"
# =============================================================================
macaddr_unsetbit_mc() {
	local mac=$1

	# 取第1字节十六进制值，与 0xfe（~0x01）AND，清除最低位（多播位）
	# ${mac%%:*}: 取第一个冒号前的字节（如 "03"）
	# ${mac#*:}: 取第一个冒号后的剩余部分（如 "11:22:33:44:55"）
	printf "%02x:%s" $((0x${mac%%:*} & ~0x01)) ${mac#*:}
}


# =============================================================================
# macaddr_random() —— 生成随机的本地单播 MAC 地址
# =============================================================================
# 输出：随机本地单播 MAC 地址
# 说明：从 /dev/urandom 读取 6 个随机字节，设置 LA 位（本地管理），
#       清除 MC 位（单播），生成符合规范的随机 MAC 地址。
#       适用于：无固化 MAC 的虚拟设备、容器网络、测试环境等。
# =============================================================================
macaddr_random() {
	local randsrc=$(get_mac_binary /dev/urandom 0)  # 读取6字节随机数

	# 设置 LA 位（表示本地管理），清除 MC 位（确保单播）
	echo "$(macaddr_unsetbit_mc "$(macaddr_setbit_la "${randsrc}")")"
}


# =============================================================================
# macaddr_canonicalize() —— 将各种格式的 MAC 地址规范化为标准格式
# =============================================================================
# 参数：$1 - 任意格式的 MAC 地址字符串
# 输出：标准格式 MAC 地址（xx:xx:xx:xx:xx:xx，全小写，冒号分隔）
#       输入无效时无输出并返回失败
# 说明：能处理的格式包括：
#   - 冒号分隔：aa:bb:cc:dd:ee:ff
#   - 连字符分隔：aa-bb-cc-dd-ee-ff
#   - 点号分隔：aabb.ccdd.eeff
#   - 无分隔符（12位十六进制）：aabbccddeeff
#   - 空格分隔（hexdump 输出）：aa bb cc dd ee ff
#   - 每字节1位十六进制（补零）：a b c d e f → 0a:0b:0c:0d:0e:0f
# 验证规则：
#   1. 长度不超过 17 字符（含分隔符）
#   2. 只含 a-f、A-F、0-9、点、冒号、连字符、空格
#   3. 处理后的 canon 字符串长度必须恰好为 17
# =============================================================================
macaddr_canonicalize() {
	local mac="$1"
	local canon=""

	# 去除可能存在的引号
	mac=$(echo -n $mac | tr -d \")
	# 基本验证：长度和字符集检查
	[ ${#mac} -gt 17 ] && return
	[ -n "${mac//[a-fA-F0-9\.: -]/}" ] && return

	# 将各种分隔符统一替换为空格，然后逐字节处理
	for octet in ${mac//[\.:-]/ }; do
		case "${#octet}" in
		1)
			# 单个十六进制字符（如 "a"），补零变为 "0a"
			octet="0${octet}"
			;;
		2)
			# 标准两位格式，直接使用
			;;
		4)
			# 4位格式（如点分格式 "aabb"），分割为两个字节
			octet="${octet:0:2} ${octet:2:2}"
			;;
		12)
			# 12位无分隔符（如 "aabbccddeeff"），分割为6个字节
			octet="${octet:0:2} ${octet:2:2} ${octet:4:2} ${octet:6:2} ${octet:8:2} ${octet:10:2}"
			;;
		*)
			# 其他长度不合法，直接返回
			return
			;;
		esac
		# 拼接字节到 canon（字节间加空格分隔）
		canon=${canon}${canon:+ }${octet}
	done

	# 最终验证：规范化后的字符串应为 17 字符（"aa bb cc dd ee ff"，含5个空格）
	[ ${#canon} -ne 17 ] && return

	# 输出标准格式：将 "aa bb cc dd ee ff" 转为 "aa:bb:cc:dd:ee:ff"
	# ${canon// / 0x} 将空格替换为 " 0x"，配合 0x 前缀传给 printf
	printf "%02x:%02x:%02x:%02x:%02x:%02x" 0x${canon// / 0x} 2>/dev/null
}


# =============================================================================
# dt_is_enabled() —— 检查设备树中某节点的 status 是否为 "okay"
# =============================================================================
# 参数：$1 - 设备树节点的相对路径（相对于 /proc/device-tree/）
# 返回：0 - 节点状态为 "okay"（设备已启用）；非 0 - 未启用
# 说明：设备树中每个硬件节点通常有 status 属性：
#       "okay"    = 设备存在且已启用
#       "disabled" = 设备存在但未启用
#       无此属性  = 默认启用
# 示例：dt_is_enabled "soc/ethernet@1e100000" && echo "以太网控制器已启用"
# =============================================================================
dt_is_enabled() {
	grep -q okay "/proc/device-tree/$1/status"
}


# =============================================================================
# get_linux_version() —— 获取 Linux 内核版本号（数字格式，便于比较）
# =============================================================================
# 输出：格式为 "主版本号(2位次版本号)(3位修订号)" 的整数，便于数值比较
# 说明：将 "uname -r" 输出的版本字符串（如 "5.15.134"）转换为数字（如 5015134），
#       方便脚本中进行版本比较（无需字符串分割）。
# 示例：
#   get_linux_version  → "5015134"（对应内核 5.15.134）
#   ver=$(get_linux_version)
#   [ $ver -ge 5015000 ] && echo "内核 >= 5.15"
# =============================================================================
get_linux_version() {
	local ver=$(uname -r)           # 如 "5.15.134"
	local minor=${ver%\.*}          # 去掉最后一段：得到 "5.15"

	# printf 格式：主版本(%d) + 次版本(%02d，两位补零) + 修订号(%03d，三位补零)
	# ${ver%%\.*}: 取第一个点前的主版本号（如 "5"）
	# ${minor#*\.}: 去掉第一个点前的部分，得到次版本号（如 "15"）
	# ${ver##*\.}: 取最后一个点后的修订号（如 "134"）
	printf "%d%02d%03d" ${ver%%\.*} ${minor#*\.} ${ver##*\.} 2>/dev/null
}
