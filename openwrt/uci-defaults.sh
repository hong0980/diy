#!/bin/sh
# =============================================================================
# uci-defaults.sh —— OpenWrt 板级配置生成库（board.json 构建 API）
# =============================================================================
# 本文件提供一组 ucidef_* 函数，供 /etc/board.d/ 下的板级初始化脚本调用，
# 用于将硬件描述信息写入 /etc/board.json。
#
# 【背景知识】
#   OpenWrt 首次启动时，/etc/uci-defaults/ 下的脚本会依次执行，
#   其中板级脚本通过本库的 ucidef_* 函数构建 board.json，
#   后续的 network、wireless 等 UCI 初始化脚本再读取 board.json 生成初始配置。
#
# 【board.json 结构概览】
#   {
#     "model":   { "id": "...", "name": "..." },
#     "system":  { "compat_version": "1.0", "hostname": "..." },
#     "network": { "lan": { "device": "br-lan", "protocol": "static" }, ... },
#     "switch":  { "switch0": { "enable": 1, "reset": 1, "ports": [...], ... } },
#     "bridge":  { "name": "switch0", "macaddr": "..." },
#     "led":     { "<cfg>": { "name": "...", "sysfs": "...", "trigger": "..." } },
#     "wlan":    { "defaults": { "country": "US", "ssids": {...} }, "wl0": {...} },
#     "dsl":     { "atmbridge": {...}, "modem": {...} },
#     "poe":     { "budget": "...", "ports": [...] },
#     "credentials": { "root_password_plain": "..." }
#   }
#
# 【典型板级脚本结构】
#   #!/bin/sh
#   . /lib/functions/uci-defaults.sh
#
#   board_config_update          # 加载已有 board.json（或初始化空文档）
#
#   ucidef_set_board_id "tplink,archer-c7-v5"
#   ucidef_set_model_name "TP-Link Archer C7 v5"
#   ucidef_set_interfaces_lan_wan "eth0.1" "eth0.2"
#   ucidef_set_label_macaddr "$(get_mac_label)"
#
#   board_config_flush           # 将 JSON 写入 /etc/board.json
#
# =============================================================================

# 加载 OpenWrt 通用函数库和 JSON 操作库
. /lib/functions.sh
. /usr/share/libubox/jshn.sh


# =============================================================================
# ── JSON 辅助函数 ─────────────────────────────────────────────────────────────
# =============================================================================

# json_select_array() —— 进入指定数组（若不存在则自动创建空数组后进入）
# 参数：$1 - 数组键名
# 说明：这是对 jshn 标准 json_select 的增强版，避免因数组不存在而失败。
#       _json_no_warning=1 抑制 json_select 在找不到字段时输出的警告。
json_select_array() {
	local _json_no_warning=1

	json_select "$1"
	[ $? = 0 ] && return   # 数组存在，直接进入

	# 数组不存在：先创建空数组，再进入
	json_add_array "$1"
	json_close_array
	json_select "$1"
}

# json_select_object() —— 进入指定对象（若不存在则自动创建空对象后进入）
# 参数：$1 - 对象键名
# 说明：与 json_select_array 类似，是 ucidef_* 函数的基础构建块，
#       确保可以安全地进入任何对象节点，无论它是否已存在。
json_select_object() {
	local _json_no_warning=1

	json_select "$1"
	[ $? = 0 ] && return   # 对象存在，直接进入

	# 对象不存在：先创建空对象，再进入
	json_add_object "$1"
	json_close_object
	json_select "$1"
}


# =============================================================================
# ── 网络接口定义函数 ──────────────────────────────────────────────────────────
# =============================================================================

# ucidef_set_interface() —— 在 board.json 的 network 对象中定义一个逻辑接口
# =============================================================================
# 参数：$1 - 逻辑接口名（如 "lan"、"wan"）
#       其余参数 - 键值对序列（opt1 val1 opt2 val2 ...）
# 说明：
#   - "device" 选项若包含空格，自动展开为 ports 数组（多设备绑定）
#   - 若未设置 protocol，根据接口名自动推断：
#       lan → static（静态IP）
#       wan → dhcp（动态获取）
#       其他 → none
# 示例：
#   ucidef_set_interface "lan" device "br-lan" protocol "static"
#   ucidef_set_interface "wan" device "eth1" protocol "pppoe"
# =============================================================================
ucidef_set_interface() {
	local network=$1; shift

	[ -z "$network" ] && return

	json_select_object network      # 进入 network 对象
	json_select_object "$network"   # 进入具体接口对象（如 lan/wan）

	# 逐对读取键值参数
	while [ -n "$1" ]; do
		local opt=$1; shift
		local val=$1; shift

		[ -n "$opt" -a -n "$val" ] || break

		# device 选项含空格时（多个设备），展开为 ports 数组
		[ "$opt" = "device" -a "$val" != "${val/ //}" ] && {
			json_select_array "ports"
			for e in $val; do json_add_string "" "$e"; done
			json_close_array
		} || {
			# 其他选项直接写为字符串
			json_add_string "$opt" "$val"
		}
	done

	# 若 protocol 未设置，根据接口名自动设置默认协议
	if ! json_is_a protocol string; then
		case "$network" in
			lan) json_add_string protocol static ;;   # LAN 默认静态 IP
			wan) json_add_string protocol dhcp ;;     # WAN 默认 DHCP
			*) json_add_string protocol none ;;       # 其他接口默认 none
		esac
	fi

	json_select ..   # 退出接口对象
	json_select ..   # 退出 network 对象
}


# ucidef_set_board_id() —— 设置 board.json 中的板级 ID
# 参数：$1 - 板级 ID（通常为 DTS 兼容字符串，如 "tplink,archer-c7-v5"）
# 说明：board_name 由内核启动时写入 /tmp/sysinfo/board_name，
#       此处允许脚本覆盖或补充该值。
ucidef_set_board_id() {
	json_select_object model
	json_add_string id "$1"
	json_select ..
}

# ucidef_set_model_name() —— 设置 board.json 中的设备型号名称
# 参数：$1 - 人类可读的设备型号名（如 "TP-Link Archer C7 v5"）
ucidef_set_model_name() {
	json_select_object model
	json_add_string name "$1"
	json_select ..
}

# ucidef_set_compat_version() —— 设置 board.json 的兼容版本号
# 参数：$1 - 版本号字符串（默认 "1.0"）
# 说明：用于后续工具判断 board.json 格式是否与当前系统兼容。
ucidef_set_compat_version() {
	json_select_object system
	json_add_string compat_version "${1:-1.0}"
	json_select ..
}


# ucidef_set_interface_lan() —— 快速定义 LAN 接口
# 参数：$1 - LAN 设备名（如 "br-lan"、"eth0.1"）
#       $2 - 协议（可选，默认 "static"）
ucidef_set_interface_lan() {
	ucidef_set_interface "lan" device "$1" protocol "${2:-static}"
}

# ucidef_set_interface_wan() —— 快速定义 WAN 接口
# 参数：$1 - WAN 设备名（如 "eth1"、"eth0.2"）
#       $2 - 协议（可选，默认 "dhcp"）
ucidef_set_interface_wan() {
	ucidef_set_interface "wan" device "$1" protocol "${2:-dhcp}"
}

# ucidef_set_interfaces_lan_wan() —— 同时定义 LAN 和 WAN 接口（最常用的封装）
# 参数：$1 - LAN 设备名；$2 - WAN 设备名
# 示例：ucidef_set_interfaces_lan_wan "eth0.1" "eth0.2"
ucidef_set_interfaces_lan_wan() {
	local lan_if="$1"
	local wan_if="$2"

	ucidef_set_interface_lan "$lan_if"
	ucidef_set_interface_wan "$wan_if"
}


# ucidef_set_bridge_device() —— 设置网桥交换芯片名称
# 参数：$1 - 网桥/交换芯片名（默认 "switch0"）
# 说明：用于告知系统主交换芯片的名称，影响网桥初始化。
ucidef_set_bridge_device() {
	json_select_object bridge
	json_add_string name "${1:-switch0}"
	json_select ..
}

# ucidef_set_bridge_mac() —— 设置网桥的 MAC 地址
# 参数：$1 - MAC 地址（标准格式）
ucidef_set_bridge_mac() {
	json_select_object bridge
	json_add_string macaddr "${1}"
	json_select ..
}


# =============================================================================
# ── 网络设备属性定义函数 ──────────────────────────────────────────────────────
# =============================================================================

# _ucidef_set_network_device_common() —— 内部函数：设置网络设备的某个属性
# 参数：$1 - 设备名（如 "eth0"）；$2 - 属性键；$3 - 属性值
_ucidef_set_network_device_common() {
	json_select_object "network_device"
	json_select_object "${1}"
	json_add_string "${2}" "${3}"
	json_select ..
	json_select ..
}

# ucidef_set_network_device_mac() —— 为指定网络设备设置 MAC 地址
# 参数：$1 - 设备名（如 "eth0"）；$2 - MAC 地址
# 示例：ucidef_set_network_device_mac eth0 "aa:bb:cc:dd:ee:ff"
ucidef_set_network_device_mac() {
	_ucidef_set_network_device_common $1 macaddr $2
}

# ucidef_set_network_device_path() —— 为指定网络设备设置 sysfs 路径
# 参数：$1 - 设备名；$2 - 设备 sysfs 路径（用于匹配物理设备）
# 示例：ucidef_set_network_device_path eth0 "platform/ahb/ahb:eth@..."
ucidef_set_network_device_path() {
	_ucidef_set_network_device_common $1 path $2
}

# ucidef_set_network_device_path_port() —— 同时设置设备路径和端口号
# 参数：$1 - 设备名；$2 - 路径；$3 - 端口号
# 说明：用于 DSA（分布式交换架构）场景，同一物理路径下有多个端口。
ucidef_set_network_device_path_port() {
	_ucidef_set_network_device_common $1 path $2
	_ucidef_set_network_device_common $1 port $3
}

# ucidef_set_network_device_gro() —— 设置设备的 GRO（通用接收卸载）状态
# 参数：$1 - 设备名；$2 - 值（0 或 1）
ucidef_set_network_device_gro() {
	_ucidef_set_network_device_common $1 gro $2
}

# ucidef_set_network_device_conduit() —— 设置 DSA 设备的 conduit（上行）接口
# 参数：$1 - 设备名；$2 - conduit 设备名
ucidef_set_network_device_conduit() {
	_ucidef_set_network_device_common $1 conduit $2
}


# =============================================================================
# ── 交换机（Switch）定义函数 ─────────────────────────────────────────────────
# =============================================================================
# 说明：以下函数用于配置基于 DSA 或旧式 swconfig 的以太网交换芯片。
#       交换机端口格式：
#         "端口号@设备名"    → CPU 端口（连接主处理器的端口）
#           如 "0t@eth0"   → 端口0，tagged，连接 eth0
#           如 "5u@eth0"   → 端口5，untagged，连接 eth0
#         "端口号:角色"     → 用户端口，分配到指定 VLAN 角色
#           如 "1:lan"     → 端口1，属于 lan VLAN
#         "端口号:角色:序号" → 用户端口，指定 VLAN 序号
#           如 "2:lan:1"   → 端口2，属于 lan VLAN，序号为 1
# =============================================================================

# _ucidef_add_switch_port() —— 内部函数：向交换机配置添加一个端口
# 继承变量：$num $device $need_tag $want_untag $role $index $prev_role
#            $n_cpu $n_ports $n_vlan $cpu0~$cpu5
# 说明：
#   - CPU 端口（有 device 属性）：记录到 cpu0~cpu5 变量以便后续角色分配使用
#   - 用户端口（有 role 属性）：追加到对应角色的端口列表；
#     若角色与上一端口相同则追加，否则创建新角色条目（n_vlan++）
_ucidef_add_switch_port() {
	# inherited: $num $device $need_tag $want_untag $role $index $prev_role
	# inherited: $n_cpu $n_ports $n_vlan $cpu0 $cpu1 $cpu2 $cpu3 $cpu4 $cpu5

	n_ports=$((n_ports + 1))

	# 向 ports 数组添加端口对象
	json_select_array ports
		json_add_object
			json_add_int num "$num"                                              # 端口编号
			[ -n "$device"     ] && json_add_string  device     "$device"        # CPU端口对应的Linux设备名
			[ -n "$need_tag"   ] && json_add_boolean need_tag   "$need_tag"      # 是否需要 VLAN tag（802.1Q）
			[ -n "$want_untag" ] && json_add_boolean want_untag "$want_untag"    # 是否希望去除 tag
			[ -n "$role"       ] && json_add_string  role       "$role"          # 所属角色（lan/wan）
			[ -n "$index"      ] && json_add_int     index      "$index"         # VLAN 序号
		json_close_object
	json_select ..

	# CPU 端口：记录其在 ports 数组中的位置索引（从1开始）
	[ -n "$device" ] && {
		export "cpu$n_cpu=$n_ports"   # cpu0=第一个CPU端口的序号，cpu1=第二个...
		n_cpu=$((n_cpu + 1))
	}

	# 用户端口：维护 roles 数组（每个角色对应一个 VLAN 条目）
	[ -n "$role" ] && {
		json_select_array roles

		if [ "$role" != "$prev_role" ]; then
			# 新角色：创建新的角色对象
			json_add_object
				json_add_string role "$role"
				json_add_string ports "$num"    # 此角色的端口列表（初始为当前端口）
			json_close_object

			prev_role="$role"
			n_vlan=$((n_vlan + 1))            # VLAN 计数递增
		else
			# 相同角色：将当前端口号追加到已有角色的端口列表
			json_select_object "$n_vlan"
				json_get_var port ports
				json_add_string ports "$port $num"  # 追加端口号（空格分隔）
			json_select ..
		fi

		json_select ..
	}
}

# _ucidef_finish_switch_roles() —— 内部函数：完成交换机角色配置，关联 CPU 端口
# 继承变量：$name $n_cpu $n_vlan $cpu0~$cpu5
# 说明：遍历所有角色（VLAN），为每个角色分配对应的 CPU 端口，
#       并在 network 对象中创建对应的逻辑接口。
#       CPU 端口轮询分配（多 CPU 端口时按序号取模轮流分配给各 VLAN）。
_ucidef_finish_switch_roles() {
	# inherited: $name $n_cpu $n_vlan $cpu0 $cpu1 $cpu2 $cpu3 $cpu4 $cpu5
	local index role roles num device need_tag want_untag port ports

	# 获取所有已定义角色的索引列表
	json_select switch
		json_select "$name"
			json_get_keys roles roles
		json_select ..
	json_select ..

	for index in $roles; do
		# 按轮询方式分配 CPU 端口：第 index 个角色使用 cpu((index-1) % n_cpu)
		eval "port=\$cpu$(((index - 1) % n_cpu))"

		# 读取该 CPU 端口的属性
		json_select switch
			json_select "$name"
				json_select ports
					json_select "$port"
						json_get_vars num device need_tag want_untag
					json_select ..
				json_select ..

				# 确定 CPU 端口在此 VLAN 中的表示形式：
				# 若需要 tag 或不希望去 tag，则：
				#   端口号后加 "t"（带tag格式），设备名加 ".VLAN序号"（子接口）
				if [ ${need_tag:-0} -eq 1 -o ${want_untag:-0} -ne 1 ]; then
					num="${num}t"
					device="${device}.${index}"   # 如 eth0.1（eth0 的 VLAN 1 子接口）
				fi

				# 将 CPU 端口信息写入对应角色
				json_select roles
					json_select "$index"
						json_get_vars role ports
						json_add_string ports "$ports $num"   # 端口列表加入 CPU 端口
						json_add_string device "$device"      # 关联 Linux 设备名
					json_select ..
				json_select ..
			json_select ..
		json_select ..

		# 在 network 对象中更新对应角色的逻辑接口（支持多交换机设备合并）
		json_select_object network
			local devices

			json_select_object "$role"
				json_get_var devices device    # 读取已有设备列表
				# 防止重复添加同一设备
				if ! list_contains devices "$device"; then
					devices="${devices:+$devices }$device"
				fi
			json_select ..
		json_select ..

		# 创建/更新逻辑接口定义
		ucidef_set_interface "$role" device "$devices"
	done
}

# ucidef_set_ar8xxx_switch_mib() —— 配置 AR8xxx 系列交换芯片的 MIB 统计
# 参数：$1 - 交换机名称；$2 - MIB 类型；$3 - 轮询间隔（毫秒）
# 说明：AR8xxx 是 Qualcomm/Atheros 的网管型交换芯片，支持 MIB 流量统计。
ucidef_set_ar8xxx_switch_mib() {
	local name="$1"
	local type="$2"
	local interval="$3"

	json_select_object switch
		json_select_object "$name"
			json_add_int ar8xxx_mib_type $type
			json_add_int ar8xxx_mib_poll_interval $interval
		json_select ..
	json_select ..
}

# ucidef_add_switch() —— 完整定义一个交换机及其所有端口
# =============================================================================
# 参数：$1 - 交换机名称（如 "switch0"）
#       其余参数 - 端口描述列表，支持三种格式：
#         "端口号@设备名"     → CPU 端口，如 "0t@eth0"（tagged）、"5u@eth1"（untagged）
#         "端口号:角色"       → 用户端口，如 "1:lan"、"4:wan"
#         "端口号:角色:序号"  → 用户端口，指定 VLAN 序号，如 "2:lan:1"
# 示例（5口路由器：1个WAN + 4个LAN，通过 switch0 连接）：
#   ucidef_add_switch "switch0" \
#     "0t@eth0"    \   # 端口0：CPU端口，tagged模式，连接 eth0
#     "1:lan"      \   # 端口1：LAN 用户口
#     "2:lan"      \   # 端口2：LAN 用户口
#     "3:lan"      \   # 端口3：LAN 用户口
#     "4:lan"      \   # 端口4：LAN 用户口
#     "5:wan"          # 端口5：WAN 用户口
# =============================================================================
ucidef_add_switch() {
	local name="$1"; shift
	local port num role device index need_tag prev_role
	local cpu0 cpu1 cpu2 cpu3 cpu4 cpu5
	local n_cpu=0 n_vlan=0 n_ports=0

	json_select_object switch
		json_select_object "$name"
			json_add_boolean enable 1    # 默认启用交换机
			json_add_boolean reset 1     # 默认复位交换机

			for port in "$@"; do
				case "$port" in
					[0-9]*@*)
						# CPU 端口格式：端口号[@设备名]，可带 t（need_tag）或 u（want_untag）
						num="${port%%@*}"
						device="${port##*@}"
						need_tag=0
						want_untag=0
						[ "${num%t}" != "$num" ] && {
							num="${num%t}"
							need_tag=1          # 端口号末尾有 "t"：需要 VLAN tag
						}
						[ "${num%u}" != "$num" ] && {
							num="${num%u}"
							want_untag=1        # 端口号末尾有 "u"：希望 untagged
						}
					;;
					[0-9]*:*:[0-9]*)
						# 用户端口（带VLAN序号）格式：端口号:角色:序号
						num="${port%%:*}"
						index="${port##*:}"
						role="${port#[0-9]*:}"; role="${role%:*}"
					;;
					[0-9]*:*)
						# 用户端口格式：端口号:角色
						num="${port%%:*}"
						role="${port##*:}"
					;;
				esac

				# 确保端口号有效且有设备或角色信息
				if [ -n "$num" ] && [ -n "$device$role" ]; then
					_ucidef_add_switch_port
				fi

				unset num device role index need_tag want_untag
			done
		json_select ..
	json_select ..

	# 完成角色分配（关联 CPU 端口并创建逻辑接口）
	_ucidef_finish_switch_roles
}

# ucidef_add_switch_attr() —— 为交换机设置自定义属性
# 参数：$1 - 交换机名；$2 - 属性键；$3 - 属性值
# 说明：自动根据值判断类型（true/false → boolean，单数字 → int，其他 → string）
ucidef_add_switch_attr() {
	local name="$1"
	local key="$2"
	local val="$3"

	json_select_object switch
		json_select_object "$name"

		case "$val" in
			true|false) [ "$val" != "true" ]; json_add_boolean "$key" $? ;;  # $? 为 0(true) 或 1(false)
			[0-9]) json_add_int "$key" "$val" ;;
			*) json_add_string "$key" "$val" ;;
		esac

		json_select ..
	json_select ..
}

# ucidef_add_switch_port_attr() —— 为交换机的指定端口设置自定义属性
# 参数：$1 - 交换机名；$2 - 端口号（数字）；$3 - 属性键；$4 - 属性值
# 说明：遍历 ports 数组找到匹配端口号的条目，在其 attr 子对象中写入属性。
ucidef_add_switch_port_attr() {
	local name="$1"
	local port="$2"
	local key="$3"
	local val="$4"
	local ports i num

	json_select_object switch
	json_select_object "$name"

	json_get_keys ports ports      # 获取 ports 数组的所有索引
	json_select_array ports

	# 遍历所有端口，找到端口号匹配的条目
	for i in $ports; do
		json_select "$i"
		json_get_var num num

		if [ -n "$num" ] && [ $num -eq $port ]; then
			json_select_object attr   # 进入端口的 attr 子对象

			case "$val" in
				true|false) [ "$val" != "true" ]; json_add_boolean "$key" $? ;;
				[0-9]) json_add_int "$key" "$val" ;;
				*) json_add_string "$key" "$val" ;;
			esac

			json_select ..
		fi

		json_select ..
	done

	json_select ..   # 退出 ports 数组
	json_select ..   # 退出 switch.$name
	json_select ..   # 退出 switch
}


# ucidef_set_interface_macaddr() —— 为指定逻辑接口设置 MAC 地址
# 参数：$1 - 逻辑接口名；$2 - MAC 地址
# 示例：ucidef_set_interface_macaddr "wan" "aa:bb:cc:dd:ee:ff"
ucidef_set_interface_macaddr() {
	local network="$1"
	local macaddr="$2"

	ucidef_set_interface "$network" macaddr "$macaddr"
}

# ucidef_set_label_macaddr() —— 设置设备标签 MAC 地址（贴纸上印的那个）
# 参数：$1 - MAC 地址
# 说明：此 MAC 地址存储在 board.json 的 system.label_macaddr 字段，
#       供 get_mac_label_json() 读取，通常用作派生其他接口 MAC 的基准。
# 示例：ucidef_set_label_macaddr "$(get_mac_label)"
ucidef_set_label_macaddr() {
	local macaddr="$1"

	json_select_object system
		json_add_string label_macaddr "$macaddr"
	json_select ..
}


# =============================================================================
# ── DSL（ADSL/VDSL）调制解调器定义函数 ──────────────────────────────────────
# =============================================================================

# ucidef_add_atm_bridge() —— 定义 ATM 桥接配置（用于 ADSL/VDSL 连接）
# 参数：$1 - VPI（虚路径标识，如 0/8）
#       $2 - VCI（虚通道标识，如 35/100）
#       $3 - 封装方式（"llc" 或 "vcmux"）
#       $4 - 负载类型（"bridged" 或 "routed"）
#       $5 - 接口名称前缀
# 说明：ATM（异步传输模式）是 ADSL 的底层传输协议。
ucidef_add_atm_bridge() {
	local vpi="$1"
	local vci="$2"
	local encaps="$3"
	local payload="$4"
	local nameprefix="$5"

	json_select_object dsl
		json_select_object atmbridge
			json_add_int vpi "$vpi"
			json_add_int vci "$vci"
			json_add_string encaps "$encaps"
			json_add_string payload "$payload"
			json_add_string nameprefix "$nameprefix"
		json_select ..
	json_select ..
}

# ucidef_add_adsl_modem() —— 定义 ADSL 调制解调器参数
# 参数：$1 - Annex 类型（"A"=欧美、"B"=德国、"J"=日本等，影响频段划分）
#       $2 - 调制解调器固件文件路径
ucidef_add_adsl_modem() {
	local annex="$1"
	local firmware="$2"

	json_select_object dsl
		json_select_object modem
			json_add_string type "adsl"
			json_add_string annex "$annex"
			json_add_string firmware "$firmware"
		json_select ..
	json_select ..
}

# ucidef_add_vdsl_modem() —— 定义 VDSL2 调制解调器参数
# 参数：$1 - Annex 类型（"A"、"B" 等）
#       $2 - 频调类型（"a"=Annex A 频调、"b"=Annex B 频调）
#       $3 - 传输模式（"atm" 或 "ptm"，VDSL 通常用 PTM）
ucidef_add_vdsl_modem() {
	local annex="$1"
	local tone="$2"
	local xfer_mode="$3"

	json_select_object dsl
		json_select_object modem
			json_add_string type "vdsl"
			json_add_string annex "$annex"
			json_add_string tone "$tone"
			json_add_string xfer_mode "$xfer_mode"
		json_select ..
	json_select ..
}


# =============================================================================
# ── LED 定义函数 ──────────────────────────────────────────────────────────────
# =============================================================================
# 说明：以下函数用于在 board.json 中声明路由器 LED 的配置，
#       包括 LED 的 sysfs 名称、触发类型和触发参数。
#       生成的配置供 /etc/init.d/led 脚本读取并写入 UCI /etc/config/system。
#
# 所有 LED 定义函数的前三个参数含义相同：
#   $1 - LED 配置 ID（在 board.json led 对象中的键名，如 "power"、"wlan2g"）
#   $2 - LED 显示名称（人类可读，如 "Power LED"）
#   $3 - LED 的 sysfs 名称（/sys/class/leds/ 下的目录名，如 "green:power"）
# =============================================================================

# _ucidef_set_led_common() —— 内部函数：进入 LED 配置对象并写入公共属性
# 调用后停留在 LED 对象内，由调用者继续写入触发器特有属性，最后两次 json_select ..
_ucidef_set_led_common() {
	local cfg="led_$1"
	local name="$2"
	local sysfs="$3"

	json_select_object led      # 进入顶层 led 对象
	json_select_object "$1"     # 进入具体 LED 配置对象
	json_add_string name "$name"
	json_add_string sysfs "$sysfs"
	# 注意：此函数结束后仍在 led.$1 对象内，调用者需负责关闭
}

# ucidef_set_led_default() —— 设置默认亮/灭状态的 LED
# 参数：$1~$3 同上；$4 - 默认状态（"on" 或 "off"）
ucidef_set_led_default() {
	local default="$4"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string default "$default"
	json_select ..   # 退出 LED 对象
	json_select ..   # 退出 led 对象
}

# ucidef_set_led_heartbeat() —— 设置心跳闪烁触发的 LED（模拟心跳节律）
# 说明：heartbeat 触发器由内核实现，闪烁频率随系统负载变化。
ucidef_set_led_heartbeat() {
	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string trigger heartbeat
	json_select ..
	json_select ..
}

# ucidef_set_led_gpio() —— 设置由 GPIO 状态控制的 LED
# 参数：$1~$3 同上；$4 - GPIO 编号；$5 - 是否反转（1=低电平亮）
ucidef_set_led_gpio() {
	local gpio="$4"
	local inverted="$5"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string trigger "$trigger"
	json_add_string type gpio
	json_add_int gpio "$gpio"
	json_add_boolean inverted "$inverted"
	json_select ..
	json_select ..
}

# ucidef_set_led_ide() —— 设置磁盘活动触发的 LED
# 说明：disk-activity 触发器在磁盘 I/O 时闪烁。
ucidef_set_led_ide() {
	_ucidef_set_led_trigger "$1" "$2" "$3" disk-activity
}

# ucidef_set_led_netdev() —— 设置网络设备活动触发的 LED
# 参数：$1~$3 同上；$4 - 监听的网络设备名（如 "eth0"）
#       $5 - 监听的事件（默认 "link tx rx"：连接+发送+接收）
ucidef_set_led_netdev() {
	local dev="$4"
	local mode="${5:-link tx rx}"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string type netdev
	json_add_string device "$dev"
	json_add_string mode "$mode"
	json_select ..
	json_select ..
}

# ucidef_set_led_oneshot() —— 设置单次触发闪烁的 LED
# 参数：$1~$3 同上；$4 - 亮灯时间（ms）；$5 - 灭灯时间（ms）
ucidef_set_led_oneshot() {
	_ucidef_set_led_timer $1 $2 $3 "oneshot" $4 $5
}

# ucidef_set_led_portstate() —— 设置网口状态触发的 LED
# 参数：$1~$3 同上；$4 - 端口状态字符串
ucidef_set_led_portstate() {
	local port_state="$4"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string trigger port_state
	json_add_string type portstate
	json_add_string port_state "$port_state"
	json_select ..
	json_select ..
}

# ucidef_set_led_rssi() —— 设置 WiFi 信号强度（RSSI）指示的 LED
# 参数：$1~$3 同上；$4 - WiFi 接口名；$5 - 最小RSSI；$6 - 最大RSSI
#       $7 - 偏移量（默认0）；$8 - 缩放因子（默认1）
ucidef_set_led_rssi() {
	local iface="$4"
	local minq="$5"
	local maxq="$6"
	local offset="${7:-0}"
	local factor="${8:-1}"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string type rssi
	json_add_string name "$name"
	json_add_string iface "$iface"
	json_add_string minq "$minq"
	json_add_string maxq "$maxq"
	json_add_string offset "$offset"
	json_add_string factor "$factor"
	json_select ..
	json_select ..
}

# ucidef_set_led_switch() —— 设置交换机端口状态触发的 LED
# 参数：$1~$3 同上；$4 - 触发器名；$5 - 端口掩码（十六进制）
#       $6 - 速率掩码；$7 - 模式
ucidef_set_led_switch() {
	local trigger_name="$4"
	local port_mask="$5"
	local speed_mask="$6"
	local mode="$7"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string trigger "$trigger_name"
	json_add_string type switch
	json_add_string mode "$mode"
	json_add_string port_mask "$port_mask"
	json_add_string speed_mask "$speed_mask"
	json_select ..
	json_select ..
}

# _ucidef_set_led_timer() —— 内部函数：设置定时器/单次触发 LED
# 参数：$1~$3 同上；$4 - 触发器名（"timer" 或 "oneshot"）
#       $5 - 亮灯时间（ms）；$6 - 灭灯时间（ms）
_ucidef_set_led_timer() {
	local trigger_name="$4"
	local delayon="$5"
	local delayoff="$6"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string type "$trigger_name"
	json_add_string trigger "$trigger_name"
	json_add_int delayon "$delayon"
	json_add_int delayoff "$delayoff"
	json_select ..
	json_select ..
}

# ucidef_set_led_timer() —— 设置周期性定时闪烁的 LED
# 参数：$1~$3 同上；$4 - 亮灯时间（ms）；$5 - 灭灯时间（ms）
# 示例：ucidef_set_led_timer "power" "Power" "green:power" 500 500
ucidef_set_led_timer() {
	_ucidef_set_led_timer $1 $2 $3 "timer" $4 $5
}

# _ucidef_set_led_trigger() —— 内部函数：设置自定义触发器名的 LED
# 参数：$1~$3 同上；$4 - 触发器名称字符串
_ucidef_set_led_trigger() {
	local trigger_name="$4"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string trigger "$trigger_name"
	json_select ..
	json_select ..
}

# ucidef_set_led_ataport() —— 设置 ATA（硬盘）端口活动触发的 LED
# 参数：$1~$3 同上；$4 - ATA 端口编号（0、1、2...）
ucidef_set_led_ataport() {
	_ucidef_set_led_trigger "$1" "$2" "$3" ata"$4"
}

# ucidef_set_led_usbdev() —— 设置 USB 设备存在状态触发的 LED
# 参数：$1~$3 同上；$4 - USB 设备路径（如 "1-1"）
ucidef_set_led_usbdev() {
	local dev="$4"

	_ucidef_set_led_common "$1" "$2" "$3"
	json_add_string type usb
	json_add_string device "$dev"
	json_select ..
	json_select ..
}

# ucidef_set_led_usbhost() —— 设置 USB 主机模式触发的 LED
# 说明：usb-host 触发器在 USB 主控器活动时触发。
ucidef_set_led_usbhost() {
	_ucidef_set_led_trigger "$1" "$2" "$3" usb-host
}

# ucidef_set_led_usbport() —— 设置监控指定 USB 端口的 LED
# 参数：$1~$3 同上；其余参数 - USB 端口路径列表（如 "1-1" "1-2"）
# 说明：usbport 触发器可监控多个具体的 USB 端口，任一插入设备即亮灯。
ucidef_set_led_usbport() {
	local obj="$1"
	local name="$2"
	local sysfs="$3"
	shift; shift; shift

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	json_add_string type usbport
	json_select_array ports
		for port in "$@"; do
			json_add_string port "$port"
		done
	json_select ..
	json_select ..
	json_select ..
}

# ucidef_set_led_wlan() —— 设置 WiFi 活动触发的 LED
# 参数：$1~$3 同上；$4 - 触发器名（如 "phy0tpt"）
ucidef_set_led_wlan() {
	_ucidef_set_led_trigger "$1" "$2" "$3" "$4"
}


# =============================================================================
# ── 其他硬件配置函数 ──────────────────────────────────────────────────────────
# =============================================================================

# ucidef_set_rssimon() —— 配置 RSSI 监控参数
# 参数：$1 - WiFi 设备名；$2 - 刷新间隔（ms）；$3 - 信号阈值
ucidef_set_rssimon() {
	local dev="$1"
	local refresh="$2"
	local threshold="$3"

	json_select_object rssimon
		json_select_object "$dev"
		[ -n "$refresh" ] && json_add_int refresh "$refresh"
		[ -n "$threshold" ] && json_add_int threshold "$threshold"
		json_select ..
	json_select ..
}

# ucidef_add_gpio_switch() —— 定义 GPIO 控制的硬件开关
# 参数：$1 - 配置 ID；$2 - 显示名称；$3 - GPIO 引脚编号；$4 - 默认值（0或1，默认0）
# 说明：用于路由器上的拨码开关（如 WiFi 开关、VPN 开关）。
ucidef_add_gpio_switch() {
	local cfg="$1"
	local name="$2"
	local pin="$3"
	local default="${4:-0}"

	json_select_object gpioswitch
		json_select_object "$cfg"
			json_add_string name "$name"
			json_add_string pin "$pin"
			json_add_int default "$default"
		json_select ..
	json_select ..
}

# ucidef_set_hostname() —— 设置设备默认主机名
# 参数：$1 - 主机名（如 "OpenWrt"）
ucidef_set_hostname() {
	local hostname="$1"

	json_select_object system
		json_add_string hostname "$hostname"
	json_select ..
}

# ucidef_set_timezone() —— 设置设备默认时区
# 参数：$1 - 时区字符串（POSIX 格式，如 "UTC" 或 "CST-8"）
ucidef_set_timezone() {
	local timezone="$1"
	json_select_object system
		json_add_string timezone "$timezone"
	json_select ..
}


# =============================================================================
# ── 无线网络默认配置函数 ──────────────────────────────────────────────────────
# =============================================================================

# ucidef_set_wireless() —— 为指定频段设置默认 WiFi 配置
# 参数：$1 - 频段（"2g"、"5g"、"6g" 或 "all"）
#       $2 - SSID（网络名称）
#       $3 - 加密方式（可选，如 "psk2"）
#       $4 - 密码（可选）
# 示例：ucidef_set_wireless 2g "OpenWrt_2G" "psk2" "mypassword"
ucidef_set_wireless() {
	local band="$1"
	local ssid="$2"
	local encryption="$3"
	local key="$4"

	case "$band" in
	all|2g|5g|6g) ;;
	*) return;;    # 非法频段直接返回
	esac
	[ -z "$ssid" ] && return

	json_select_object wlan
		json_select_object defaults
			json_select_object ssids
				json_select_object "$band"
					json_add_string ssid "$ssid"
					[ -n "$encryption" ] && json_add_string encryption "$encryption"
					[ -n "$key" ] && json_add_string key "$key"
				json_select ..
			json_select ..
		json_select ..
	json_select ..
}

# ucidef_set_country() —— 设置 WiFi 国家/地区代码
# 参数：$1 - 两字母国家代码（如 "CN"、"US"、"DE"）
# 说明：国家代码影响可用的 WiFi 信道和功率限制。
ucidef_set_country() {
	local country="$1"

	json_select_object wlan
		json_select_object defaults
			json_add_string country "$country"
		json_select ..
	json_select ..
}

# ucidef_set_wireless_mac_count() —— 设置指定频段的 MAC 地址数量
# 参数：$1 - 频段（"2g"、"5g"、"6g"）；$2 - MAC 地址数量
# 说明：某些设备每个频段有多个 MAC 地址（支持多 BSSID 或多 VAP）。
ucidef_set_wireless_mac_count() {
	local band="$1"
	local mac_count="$2"

	case "$band" in
	2g|5g|6g) ;;
	*) return;;
	esac
	[ -z "$mac_count" ] && return

	json_select_object wlan
		json_select_object defaults
			json_select_object ssids
				json_select_object "$band"
					json_add_string mac_count "$mac_count"
				json_select ..
			json_select ..
		json_select ..
	json_select ..
}

# ucidef_add_wlan() —— 添加一个 WiFi 无线模块（radio）的配置
# 参数：$1 - 设备 sysfs/phy 路径；其余参数 - 额外属性（"键:类型=值" 格式）
# 说明：每调用一次添加一个无线模块（wl0、wl1...），序号自动递增。
# 示例：
#   ucidef_add_wlan "platform/soc/soc:pcie/..." "band:string=2g" "htmode:string=HT40"
ucidef_add_wlan() {
	local path="$1"; shift

	ucidef_wlan_idx=${ucidef_wlan_idx:-0}   # 初始化索引（首次调用）

	json_select_object wlan
	json_select_object "wl$ucidef_wlan_idx"
	json_add_string path "$path"
	json_add_fields "$@"    # 写入额外属性（使用 jshn 的批量写入函数）
	json_select ..
	json_select ..

	ucidef_wlan_idx="$((ucidef_wlan_idx + 1))"   # 序号递增
}


# =============================================================================
# ── 凭据配置函数 ──────────────────────────────────────────────────────────────
# =============================================================================

# ucidef_set_root_password_plain() —— 设置 root 账户明文密码（用于首次初始化）
# 参数：$1 - 明文密码
# 安全警告：明文密码会存储在 board.json 中，仅用于工厂初始化流程。
ucidef_set_root_password_plain() {
	local passwd="$1"
	json_select_object credentials
		json_add_string root_password_plain "$passwd"
	json_select ..
}

# ucidef_set_root_password_hash() —— 设置 root 账户哈希密码
# 参数：$1 - 密码哈希（/etc/shadow 格式，如 "$1$salt$hash"）
ucidef_set_root_password_hash() {
	local passwd="$1"
	json_select_object credentials
		json_add_string root_password_hash "$passwd"
	json_select ..
}

# ucidef_set_ssh_authorized_key() —— 添加 SSH 授权公钥
# 参数：$1 - SSH 公钥字符串（完整的 authorized_keys 行）
# 说明：支持多次调用添加多个公钥（追加到数组）。
ucidef_set_ssh_authorized_key() {
	local ssh_key="$1"
	json_select_object credentials
		json_select_array ssh_authorized_keys
			json_add_string "" "$ssh_key"
		json_select ..
	json_select ..
}


# =============================================================================
# ── 系统服务配置函数 ──────────────────────────────────────────────────────────
# =============================================================================

# ucidef_set_ntpserver() —— 设置 NTP 时间同步服务器列表
# 参数：一个或多个 NTP 服务器地址
# 示例：ucidef_set_ntpserver "0.openwrt.pool.ntp.org" "1.openwrt.pool.ntp.org"
ucidef_set_ntpserver() {
	local server

	json_select_object system
		json_select_array ntpserver
			for server in "$@"; do
				json_add_string "" "$server"
			done
		json_select ..
	json_select ..
}

# ucidef_set_poe() —— 配置 PoE（以太网供电）参数
# 参数：$1 - 总功率预算（瓦特，如 "30"）
#       $2 - 支持 PoE 的端口列表（空格分隔，如 "lan1 lan2"）
ucidef_set_poe() {
	json_select_object poe
		json_add_string "budget" "$1"
		json_select_array ports
			for port in $2; do
				json_add_string "" "$port"
			done
		json_select ..
	json_select ..
}


# =============================================================================
# ── board.json 读写入口函数 ───────────────────────────────────────────────────
# =============================================================================

# board_config_update() —— 初始化或加载 board.json 以开始更新
# 说明：
#   1. 调用 json_init 清空 JSON 状态
#   2. 若 board.json 已存在（${CFG} 变量指定路径），加载其内容
#   3. 若 model 对象不存在，从 /tmp/sysinfo/ 读取板级信息自动初始化
# 注意：${CFG} 通常由调用脚本设置，如 CFG=/etc/board.json
# 调用时机：板级脚本开始时调用，所有 ucidef_* 调用之前。
board_config_update() {
	json_init
	[ -f ${CFG} ] && json_load "$(cat ${CFG})"

	# 若 board.json 中还没有 model 对象，从内核写入的 sysinfo 文件自动填充
	if ! json_is_a model object; then
		json_select_object model
			[ -f "/tmp/sysinfo/board_name" ] && \
				json_add_string id "$(cat /tmp/sysinfo/board_name)"
			[ -f "/tmp/sysinfo/model" ] && \
				json_add_string name "$(cat /tmp/sysinfo/model)"
		json_select ..
	fi
}

# board_config_flush() —— 将 JSON 内存数据写入 board.json 文件
# 说明：以美化格式（-i 缩进）输出到 ${CFG} 文件（通常为 /etc/board.json）。
#       所有 ucidef_* 调用完成后最后调用此函数。
board_config_flush() {
	json_dump -i -o ${CFG}    # -i: 缩进美化；-o: 输出到文件
}
