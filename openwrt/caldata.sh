# Copyright (C) 2019 OpenWrt.org
# =============================================================================
# caldata.sh —— 无线校准数据（Calibration Data）提取工具库
# =============================================================================
# 本文件提供一组函数，用于从各类存储介质（MTD Flash、UBI、MMC、普通文件）
# 中提取无线网卡的射频校准数据，写入内核固件加载路径或 sysfs 接口。
#
# 【背景知识】
#   无线网卡（如 ath9k、ath10k、ath11k）在工厂生产时会进行射频校准，
#   校准结果（EEPROM/Calibration Data）存储在路由器的 Flash 中。
#   Linux 内核加载无线驱动时需要读取这些数据（通常放在 /lib/firmware/ 下），
#   才能正确配置发射功率、频率偏差等射频参数。
#
# 【使用流程】
#   板级初始化脚本（如 /lib/firmware/<设备>.sh）设置环境变量后调用本库函数：
#     export FIRMWARE="ath10k/cal-pci-0000:01:00.0.bin"  # 目标固件路径（相对于/lib/firmware/）
#     caldata_extract "art" 0x5000 0x844                  # 从 art 分区提取 0x844 字节
#
# 【环境变量】
#   FIRMWARE  : 校准数据写入的目标固件文件名（相对于 /lib/firmware/）
#   DEVPATH   : sysfs 设备路径（caldata_sysfsload_from_file 使用）
#   CI_UBIPART: UBI 主分区名（UBI 相关函数使用）
# =============================================================================

# 加载 OpenWrt 通用函数库（提供 find_mtd_chardev、find_mtd_part 等）
. /lib/functions.sh
# 加载系统工具库（提供 get_mac_binary 等）
. /lib/functions/system.sh


# =============================================================================
# caldata_dd() —— 通用的数据块复制函数（dd 封装）
# =============================================================================
# 参数：$1 - 源文件路径（如 /dev/mtd3）
#       $2 - 目标文件路径（如 /lib/firmware/xxx.bin）
#       $3 - 复制字节数（会做算术求值，支持十六进制如 0x844）
#       $4 - 源文件起始偏移（字节，支持十六进制）
# 说明：
#   iflag=skip_bytes : 让 skip 参数以字节为单位跳过（而非默认的块数）
#   iflag=fullblock  : 确保读满请求的字节数（防止管道传输时数据不完整）
#   bs=$count        : 块大小设为总字节数，count=1 表示只复制一个块
# =============================================================================
caldata_dd() {
	local source=$1
	local target=$2
	local count=$(($3))    # 算术求值，支持 0x 前缀十六进制
	local offset=$(($4))   # 算术求值

	dd if=$source of=$target iflag=skip_bytes,fullblock bs=$count skip=$offset count=1 2>/dev/null
	return $?
}


# =============================================================================
# caldata_die() —— 输出错误信息并终止脚本
# =============================================================================
# 参数：错误描述（可多个参数，会拼接输出）
# 说明：校准数据提取失败是严重错误，无线驱动无法正常加载，因此直接 exit 1。
# =============================================================================
caldata_die() {
	echo "caldata: " "$*"
	exit 1
}


# =============================================================================
# caldata_extract() —— 从 MTD Flash 分区提取校准数据
# =============================================================================
# 参数：$1 - MTD 分区名（如 "art"、"factory"）
#       $2 - 分区内字节偏移（如 0x5000）
#       $3 - 提取字节数（如 0x844）
# 说明：将提取的数据写入 /lib/firmware/$FIRMWARE，
#       内核无线驱动通过 firmware loader 机制读取此文件。
# 示例：caldata_extract "art" 0x5000 0x844
# =============================================================================
caldata_extract() {
	local part=$1
	local offset=$(($2))
	local count=$(($3))
	local mtd

	mtd=$(find_mtd_chardev $part)   # 将分区名转换为设备节点路径（如 /dev/mtd3）
	[ -n "$mtd" ] || caldata_die "no mtd device found for partition $part"

	caldata_dd $mtd /lib/firmware/$FIRMWARE $count $offset || \
		caldata_die "failed to extract calibration data from $mtd"
}


# =============================================================================
# caldata_extract_ubi() —— 从 UBI 逻辑卷提取校准数据
# =============================================================================
# 参数：$1 - UBI 卷名（逻辑卷名称，非设备路径）
#       $2 - 卷内字节偏移
#       $3 - 提取字节数
# 说明：用于使用 NAND Flash + UBI 的设备（如某些高端路由器）。
#       先挂载 UBI 分区（CI_UBIPART 指定），再找到指定卷，最后提取数据。
# =============================================================================
caldata_extract_ubi() {
	local part=$1
	local offset=$(($2))
	local count=$(($3))
	local ubidev
	local ubi

	. /lib/upgrade/nand.sh   # 加载 NAND/UBI 操作函数

	ubidev=$(nand_find_ubi $CI_UBIPART)     # 获取 UBI 设备名（如 ubi0）
	ubi=$(nand_find_volume $ubidev $part)   # 在 UBI 设备中查找指定卷名
	[ -n "$ubi" ] || caldata_die "no UBI volume found for $part"

	caldata_dd /dev/$ubi /lib/firmware/$FIRMWARE $count $offset || \
		caldata_die "failed to extract calibration data from $ubi"
}


# =============================================================================
# caldata_extract_mmc() —— 从 MMC/eMMC 分区提取校准数据
# =============================================================================
# 参数：$1 - MMC 分区名；$2 - 偏移；$3 - 字节数
# 说明：用于以 eMMC 作为主存储的设备（如某些 ARM 路由器）。
# =============================================================================
caldata_extract_mmc() {
	local part=$1
	local offset=$(($2))
	local count=$(($3))
	local mmc_part

	mmc_part=$(find_mmc_part $part)
	[ -n "$mmc_part" ] || caldata_die "no mmc partition found for partition $part"

	caldata_dd $mmc_part /lib/firmware/$FIRMWARE $count $offset || \
		caldata_die "failed to extract calibration data from $mmc_part"
}


# =============================================================================
# caldata_extract_reverse() —— 从 MTD 提取字节序反转的校准数据
# =============================================================================
# 参数：$1 - MTD 分区名；$2 - 偏移；$3 - 字节数
# 说明：某些设备（通常是大端/小端混用的 SoC）将校准数据以字节逆序存储。
#       本函数读取后逐字节反转，再写入目标固件文件。
#       实现方式：用 hexdump 逐字节读出，然后用字符串前置拼接法反转顺序，
#       最后用 printf "%b" 将 \xNN 格式转回二进制写入文件。
# =============================================================================
caldata_extract_reverse() {
	local part=$1
	local offset=$2
	local count=$(($3))
	local mtd
	local reversed
	local caldata

	mtd=$(find_mtd_chardev "$part")
	# hexdump 逐字节输出为 "xx " 格式的十六进制字符串
	reversed=$(hexdump -v -s $offset -n $count -e '1/1 "%02x "' $mtd)

	# 逐字节前置拼接，实现字节序反转
	# 如原始: "aa bb cc" → caldata = "\xcc\xbb\xaa"
	for byte in $reversed; do
		caldata="\x${byte}${caldata}"
	done

	# 将 \xNN 转义序列还原为二进制数据写入目标固件
	printf "%b" "$caldata" > /lib/firmware/$FIRMWARE
}


# =============================================================================
# caldata_from_file() —— 从普通文件提取校准数据
# =============================================================================
# 参数：$1 - 源文件路径（任意可读文件）
#       $2 - 文件内偏移
#       $3 - 提取字节数
#       $4 - 目标文件路径（可选，默认 /lib/firmware/$FIRMWARE）
# 说明：用于校准数据存储在普通文件系统文件中的情况（如 squashfs 内的二进制文件）。
# =============================================================================
caldata_from_file() {
	local source=$1
	local offset=$(($2))
	local count=$(($3))
	local target=$4

	[ -n "$target" ] || target=/lib/firmware/$FIRMWARE

	caldata_dd $source $target $count $offset || \
		caldata_die "failed to extract calibration data from $source"
}


# =============================================================================
# caldata_sysfsload_from_file() —— 通过 sysfs 固件加载接口写入校准数据
# =============================================================================
# 参数：$1 - 源文件路径；$2 - 偏移；$3 - 字节数
# 说明：Linux 内核提供了通过 sysfs 直接写入驱动固件的接口，
#       路径为 /sys/$DEVPATH/data，需配合 loading 标志文件控制：
#         echo 1 > loading  → 开始写入（内核准备好接收数据）
#         [写入 data 文件]
#         echo 0 > loading  → 写入完成（内核开始使用数据）
#         echo 1 > loading  → 写入失败（告知内核放弃）
#       DEVPATH 环境变量由内核在调用固件加载脚本时自动设置。
# =============================================================================
caldata_sysfsload_from_file() {
	local source=$1
	local offset=$(($2))
	local count=$(($3))
	local target_dir="/sys/$DEVPATH"
	local target="$target_dir/data"

	[ -d "$target_dir" ] || \
		caldata_die "no sysfs dir to write: $target"

	echo 1 > "$target_dir/loading"    # 通知内核：开始写入
	caldata_dd $source $target $count $offset
	if [ $? != 0 ]; then
		echo 1 > "$target_dir/loading"    # 写入失败：重置 loading 标志
		caldata_die "failed to extract calibration data from $source"
	else
		echo 0 > "$target_dir/loading"    # 写入成功：通知内核数据就绪
	fi
}


# =============================================================================
# caldata_valid() —— 验证校准数据的 magic number（魔数）
# =============================================================================
# 参数：$1 - 期望的 magic 值（4位十六进制字符串，如 "a55a"）
#       $2 - 目标文件路径（可选，默认 /lib/firmware/$FIRMWARE）
# 返回：0 - magic 匹配（数据有效）；1 - magic 不匹配（数据无效）
# 说明：校准数据文件通常以特定魔数开头（如 ath9k EEPROM 开头为 0xa55a），
#       用于快速验证提取的数据是否正确。
# 示例：
#   caldata_extract "art" 0x1000 0x800
#   caldata_valid "a55a" || caldata_die "invalid calibration data"
# =============================================================================
caldata_valid() {
	local expected="$1"
	local target=$2

	[ -n "$target" ] || target=/lib/firmware/$FIRMWARE

	# 读取文件前2字节并转为十六进制字符串
	magic=$(hexdump -v -n 2 -e '1/1 "%02x"' $target)
	[ "$magic" = "$expected" ]
	return $?
}


# =============================================================================
# caldata_patch_data() —— 在校准数据文件的指定偏移处修改数据
# =============================================================================
# 参数：$1 - 新数据（十六进制字符串，每字节两位，如 "aabbccddeeff"）
#       $2 - 数据写入偏移（十六进制）
#       $3 - 校验和偏移（可选；若提供则同步更新校验和）
#       $4 - 目标文件路径（可选，默认 /lib/firmware/$FIRMWARE）
# 说明：
#   - 若新数据与文件中现有数据相同，则跳过写入（优化 Flash 写入次数）
#   - 若提供了校验和偏移，在写入新数据前先更新校验和：
#       新校验和 = 原校验和 XOR 原数据各字节异或值 XOR 新数据各字节异或值
#       （相当于撤销原数据对校验和的贡献，再加入新数据的贡献）
# 依赖函数：xor、data_2xor_val、data_2bin（由 /lib/functions.sh 提供）
# =============================================================================
caldata_patch_data() {
	local data=$1
	local data_count=$((${#1} / 2))    # 字节数 = 十六进制字符数 / 2
	[ -n "$2" ] && local data_offset=$(($2))
	[ -n "$3" ] && local chksum_offset=$(($3))
	local target=$4
	local fw_data
	local fw_chksum

	[ -z "$data" -o -z "$data_offset" ] && return

	[ -n "$target" ] || target=/lib/firmware/$FIRMWARE

	# 读取当前文件中对应偏移的现有数据
	fw_data=$(hexdump -v -n $data_count -s $data_offset -e '1/1 "%02x"' $target)

	if [ "$data" != "$fw_data" ]; then
		# 新旧数据不同，需要更新

		if [ -n "$chksum_offset" ]; then
			# 更新校验和：先读取现有校验和，再 XOR 修正
			fw_chksum=$(hexdump -v -n 2 -s $chksum_offset -e '1/1 "%02x"' $target)
			# 新校验和 = 旧校验和 XOR 旧数据的异或值 XOR 新数据的异或值
			fw_chksum=$(xor $fw_chksum $(data_2xor_val $fw_data) $(data_2xor_val $data))

			# 将新校验和（2字节）写回文件对应偏移
			data_2bin $fw_chksum | \
				dd of=$target conv=notrunc bs=1 seek=$chksum_offset count=2 || \
				caldata_die "failed to write chksum to eeprom file"
		fi

		# 将新数据写入文件对应偏移（conv=notrunc: 不截断文件，只修改指定位置）
		data_2bin $data | \
			dd of=$target conv=notrunc bs=1 seek=$data_offset count=$data_count || \
			caldata_die "failed to write data to eeprom file"
	fi
}


# =============================================================================
# ── 芯片特定的 MAC 地址修补函数 ──────────────────────────────────────────────
# 说明：不同的 Atheros/Qualcomm 无线芯片将 MAC 地址存储在 EEPROM 的不同偏移处。
#       以下函数将 MAC 地址（去除冒号后的 12 位十六进制）写入对应芯片的 EEPROM 格式。
# =============================================================================

# ath9k_patch_mac() —— 修改 ath9k（802.11n）芯片校准数据中的 MAC 地址
# 参数：$1 - MAC 地址（标准格式 xx:xx:xx:xx:xx:xx）
#       $2 - 目标文件路径（可选）
# 说明：ath9k EEPROM 的 MAC 地址固定存储在偏移 0x2 处（无校验和更新）
ath9k_patch_mac() {
	local mac=$1
	local target=$2

	caldata_patch_data "${mac//:/}" 0x2 "" "$target"
	# ${mac//:/}: 将 MAC 中的冒号全部删除，如 "aa:bb:cc:dd:ee:ff" → "aabbccddeeff"
}

# ath9k_patch_mac_crc() —— 修改 ath9k EEPROM 中的 MAC 地址并更新校验和
# 参数：$1 - MAC 地址；$2 - MAC 地址在 EEPROM 中的偏移
#       $3（未使用）；$4 - 目标文件路径（可选）
# 说明：校验和偏移 = MAC 偏移 - 10（EEPROM 头部校验和位置固定规律）
ath9k_patch_mac_crc() {
	local mac=$1
	local mac_offset=$2
	local chksum_offset=$((mac_offset - 10))   # 校验和固定在 MAC 偏移前 10 字节处
	local target=$4

	caldata_patch_data "${mac//:/}" "$mac_offset" "$chksum_offset" "$target"
}

# ath10k_patch_mac() —— 修改 ath10k（802.11ac）芯片校准数据中的 MAC 地址
# 参数：$1 - MAC 地址；$2 - 目标文件路径（可选）
# 说明：ath10k Board Data File（BDF）的 MAC 地址在偏移 0x6 处，
#       偏移 0x2 处为 2 字节校验和。
ath10k_patch_mac() {
	local mac=$1
	local target=$2

	caldata_patch_data "${mac//:/}" 0x6 0x2 "$target"
}

# ath11k_patch_mac() —— 修改 ath11k（Wi-Fi 6）芯片校准数据中的 MAC 地址
# 参数：$1 - MAC 地址；$2 - mac_id（0~5，对应不同 radio/VAP 的 MAC 编号）
#       $3 - 目标文件路径（可选）
# 说明：ath11k 支持最多 6 个 MAC 地址（mac_id 0~5），每个占 6 字节，
#       起始偏移 = mac_id * 0x6 + 0xe（即从 0xe 处开始排列）
#       校验和在偏移 0xa 处（2字节）。
ath11k_patch_mac() {
	local mac=$1
	local mac_id=$2     # MAC 编号：0=主MAC，1~5=附加MAC（多BSSID/多VAP）
	local target=$3

	[ -z "$mac_id" ] && return

	# MAC 偏移 = mac_id * 6 + 0xe
	caldata_patch_data "${mac//:/}" $(printf "0x%x" $(($mac_id * 0x6 + 0xe))) 0xa "$target"
}


# =============================================================================
# ── 芯片特定的监管域（Regulatory Domain）处理函数 ────────────────────────────
# 说明：监管域（regdomain）定义了设备允许使用的 WiFi 信道和功率上限。
#       某些国家/地区要求清除设备固化的监管域，使用软件配置的监管域。
#       将监管域字段清零（"0000"）后，内核会使用 CRDA/cfg80211 的规则。
# =============================================================================

# ath10k_remove_regdomain() —— 清除 ath10k 校准数据中的监管域
# 参数：$1 - 目标文件路径（可选）
# 说明：ath10k BDF 的监管域字段在偏移 0xc 处（2字节），校验和在 0x2 处。
ath10k_remove_regdomain() {
	local target=$1

	caldata_patch_data "0000" 0xc 0x2 "$target"
}

# ath11k_remove_regdomain() —— 清除 ath11k 校准数据中的所有监管域字段
# 参数：$1 - 目标文件路径（可选）
# 说明：ath11k 的校准数据中监管域出现在多处：
#   - 主监管域：偏移 0x34
#   - 额外副本（可能）：偏移 0x450、0x458、0x500、0x5a8
#   只有当副本的值与主监管域相同时才清零（避免误改无关字段）。
#   所有校验和使用偏移 0xa 处的 2 字节。
ath11k_remove_regdomain() {
	local target=$1
	local regdomain
	local regdomain_data

	# 读取主监管域值（用于后续匹配副本）
	regdomain=$(hexdump -v -n 2 -s 0x34 -e '1/1 "%02x"' $target)
	# 清除主监管域
	caldata_patch_data "0000" 0x34 0xa "$target"

	# 遍历可能的副本偏移，若与主监管域相同则一并清除
	for offset in 0x450 0x458 0x500 0x5a8; do
		regdomain_data=$(hexdump -v -n 2 -s $offset -e '1/1 "%02x"' $target)

		if [ "$regdomain" == "$regdomain_data" ]; then
			caldata_patch_data "0000" $offset 0xa "$target"
		fi
	done
}


# =============================================================================
# ath11k_set_macflag() —— 在 ath11k 校准数据中设置 MAC 有效标志
# =============================================================================
# 参数：$1 - 目标文件路径（可选）
# 说明：ath11k 的 EEPROM 格式中，偏移 0x3e 处有一个标志字段，
#       写入 "0100" 表示 MAC 地址有效（由驱动使用 EEPROM 中的 MAC，而非随机 MAC）。
#       在调用 ath11k_patch_mac 写入 MAC 地址后，通常需要调用此函数标记 MAC 有效。
# =============================================================================
ath11k_set_macflag() {
	local target=$1

	caldata_patch_data "0100" 0x3e 0xa "$target"
}
