#!/bin/ash
# 指定脚本使用 ash shell 运行（OpenWrt 常用的轻量级 shell）。

. /lib/functions.sh
# 引入通用函数库，提供辅助函数。
. /usr/share/libubox/jshn.sh
# 引入 jshn.sh 脚本，提供 JSON 处理功能。

json_select_array() {
	# 作用：选择或创建 JSON 数组，确保目标数组存在。
	local _json_no_warning=1
	# 禁用 JSON 警告。

	json_select "$1"
	# 尝试选择指定名称的 JSON 数组。
	[ $? = 0 ] && return
	# 如果数组存在，直接返回。

	json_add_array "$1"
	# 创建新的 JSON 数组。
	json_close_array
	# 关闭数组。
	json_select "$1"
	# 再次选择新创建的数组。
}

json_select_object() {
	# 作用：选择或创建 JSON 对象，确保目标对象存在。
	local _json_no_warning=1
	# 禁用 JSON 警告。

	json_select "$1"
	# 尝试选择指定名称的 JSON 对象。
	[ $? = 0 ] && return
	# 如果对象存在，直接返回。

	json_add_object "$1"
	# 创建新的 JSON 对象。
	json_close_object
	# 关闭对象。
	json_select "$1"
	# 再次选择新创建的对象。
}

ucidef_set_interface() {
	# 作用：配置网络接口的参数（如接口名称、协议等）。
	local network=$1; shift
	# 获取网络名称（例如 lan、wan）。

	[ -z "$network" ] && return
	# 如果网络名称为空，返回。

	json_select_object network
	# 选择 network 对象。
	json_select_object "$network"
	# 选择或创建指定网络名称的对象。

	while [ -n "$1" ]; do
		# 遍历参数对（键值对）。
		local opt=$1; shift
		# 获取选项名称。
		local val=$1; shift
		# 获取选项值。

		[ -n "$opt" -a -n "$val" ] || break
		# 如果选项或值为空，退出循环。

		json_add_string "$opt" "$val"
		# 添加键值对到 JSON 对象。
	done

	if ! json_is_a protocol string; then
		# 如果协议未设置。
		case "$network" in
			lan) json_add_string protocol static ;;
			# 对于 lan，默认使用 static 协议。
			wan) json_add_string protocol dhcp ;;
			# 对于 wan，默认使用 dhcp 协议。
			*) json_add_string protocol none ;;
			# 其他网络，默认使用 none 协议。
		esac
	fi

	json_select ..
	# 返回 network 层。
	json_select ..
	# 返回顶层。
}

ucidef_set_board_id() {
	# 作用：设置设备型号的 ID。
	local id="$1"
	# 获取设备 ID。

	json_select_object model
	# 选择 model 对象。
	json_add_string id "$id"
	# 设置 id 字段。
	json_select ..
	# 返回顶层。
}

ucidef_set_model_name() {
	# 作用：设置设备型号的名称。
	local name="$1"
	# 获取设备名称。

	json_select_object model
	# 选择 model 对象。
	json_add_string name "$name"
	# 设置 name 字段。
	json_select ..
	# 返回顶层。
}

ucidef_set_interface_lan() {
	# 作用：配置 LAN 接口的接口名称和协议。
	local ifname="$1"
	# 获取接口名称。
	local protocol="$2"
	# 获取协议（可选）。

	ucidef_set_interface "lan" ifname "$ifname" protocol "${protocol:-static}"
	# 调用 ucidef_set_interface 配置 LAN 接口，默认协议为 static。
}

ucidef_set_interface_wan() {
	# 作用：配置 WAN 接口的接口名称和协议。
	local ifname="$1"
	# 获取接口名称。
	local protocol="$2"
	# 获取协议（可选）。

	ucidef_set_interface "wan" ifname "$ifname" protocol "${protocol:-dhcp}"
	# 调用 ucidef_set_interface 配置 WAN 接口，默认协议为 dhcp。
}

ucidef_set_interfaces_lan_wan() {
	# 作用：同时配置 LAN 和 WAN 接口。
	local lan_if="$1"
	# 获取 LAN 接口名称。
	local wan_if="$2"
	# 获取 WAN 接口名称。

	ucidef_set_interface_lan "$lan_if"
	# 配置 LAN 接口。
	ucidef_set_interface_wan "$wan_if"
	# 配置 WAN 接口。
}

_ucidef_add_switch_port() {
	# 作用：添加交换机端口配置到 JSON 结构。
	# 继承变量：$num $device $need_tag $want_untag $role $index $prev_role
	# 继承变量：$n_cpu $n_ports $n_vlan $cpu0 $cpu1 $cpu2 $cpu3 $cpu4 $cpu5

	n_ports=$((n_ports + 1))
	# 增加端口计数。

	json_select_array ports
	# 选择 ports 数组。
		json_add_object
		# 创建新端口对象。
			json_add_int num "$num"
			# 设置端口号。
			[ -n "$device"     ] && json_add_string  device     "$device"
			# 如果设备名称存在，设置设备字段。
			[ -n "$need_tag"   ] && json_add_boolean need_tag   "$need_tag"
			# 如果需要 VLAN 标记，设置 need_tag 字段。
			[ -n "$want_untag" ] && json_add_boolean want_untag "$want_untag"
			# 如果需要取消 VLAN 标记，设置 want_untag 字段。
			[ -n "$role"       ] && json_add_string  role       "$role"
			# 如果角色存在，设置 role 字段。
			[ -n "$index"      ] && json_add_int     index      "$index"
			# 如果索引存在，设置 index 字段。
		json_close_object
	# 关闭端口对象。
	json_select ..
	# 返回上层。

	# record pointer to cpu entry for lookup in _ucidef_finish_switch_roles()
	[ -n "$device" ] && {
		# 如果设备名称存在。
		export "cpu$n_cpu=$n_ports"
		# 记录 CPU 端口的索引。
		n_cpu=$((n_cpu + 1))
		# 增加 CPU 端口计数。
	}

	# create/append object to role list
	[ -n "$role" ] && {
		# 如果角色存在。
		json_select_array roles
		# 选择 roles 数组。

		if [ "$role" != "$prev_role" ]; then
			# 如果角色与前一个不同。
			json_add_object
			# 创建新角色对象。
				json_add_string role "$role"
				# 设置角色名称。
				json_add_string ports "$num"
				# 设置端口列表（当前端口）。
			json_close_object
			# 关闭角色对象。

			prev_role="$role"
			# 更新前一个角色。
			n_vlan=$((n_vlan + 1))
			# 增加 VLAN 计数。
		else
			# 如果角色与前一个相同。
			json_select_object "$n_vlan"
			# 选择当前 VLAN 对象。
				json_get_var port ports
				# 获取已有端口列表。
				json_add_string ports "$port $num"
				# 追加当前端口到端口列表。
			json_select ..
			# 返回 roles 层。
		fi

		json_select ..
		# 返回 switch 层。
	}
}

_ucidef_finish_switch_roles() {
	# 作用：完成交换机角色配置，处理 VLAN 标记和网络接口。
	# 继承变量：$name $n_cpu $n_vlan $cpu0 $cpu1 $cpu2 $cpu3 $cpu4 $cpu5
	local index role roles num device need_tag want_untag port ports
	# 声明局部变量。

	json_select switch
	# 选择 switch 对象。
		json_select "$name"
		# 选择指定交换机。
			json_get_keys roles roles
			# 获取角色列表。
		json_select ..
	# 返回 switch 层。
	json_select ..
	# 返回顶层。

	for index in $roles; do
		# 遍历角色索引。
		eval "port=\$cpu$(((index - 1) % n_cpu))"
		# 计算对应的 CPU 端口索引。

		json_select switch
		# 选择 switch 对象。
			json_select "$name"
			# 选择指定交换机。
				json_select ports
				# 选择 ports 数组。
					json_select "$port"
					# 选择 CPU 端口。
						json_get_vars num device need_tag want_untag
						# 获取端口属性。
					json_select ..
				# 返回 ports 层。
				json_select ..
				# 返回 switch 层。

				if [ ${need_tag:-0} -eq 1 -o ${want_untag:-0} -ne 1 ]; then
					# 如果需要 VLAN 标记或不需要取消标记。
					num="${num}t"
					# 为端口号添加 't' 标记。
					device="${device}.${index}"
					# 为设备名称添加 VLAN 索引。
				fi

				json_select roles
				# 选择 roles 数组。
					json_select "$index"
					# 选择当前角色。
						json_get_vars role ports
						# 获取角色和端口列表。
						json_add_string ports "$ports $num"
						# 更新端口列表。
						json_add_string device "$device"
						# 设置设备名称。
					json_select ..
				# 返回 roles 层。
				json_select ..
			# 返回 switch 层。
			json_select ..
		# 返回 switch 层。
		json_select ..
		# 返回顶层。

		json_select_object network
		# 选择 network 对象。
			local devices
			# 声明变量存储设备列表。

			json_select_object "$role"
			# 选择角色对应的网络对象。
				# attach previous interfaces (for multi-switch devices)
				json_get_var devices ifname
				# 获取已有接口名称。
				if ! list_contains devices "$device"; then
					# 如果设备不在列表中。
					devices="${devices:+$devices }$device"
					# 追加设备到列表。
				fi
			json_select ..
			# 返回 network 层。
		json_select ..
		# 返回顶层。

		ucidef_set_interface "$role" ifname "$devices"
		# 配置网络接口，使用更新后的设备列表。
	done
}

ucidef_set_ar8xxx_switch_mib() {
	# 作用：为 AR8xxx 交换机设置 MIB（管理信息库）参数。
	local name="$1"
	# 获取交换机名称。
	local type="$2"
	# 获取 MIB 类型。
	local interval="$3"
	# 获取轮询间隔。

	json_select_object switch
	# 选择 switch 对象。
		json_select_object "$name"
		# 选择指定交换机。
			json_add_int ar8xxx_mib_type $type
			# 设置 MIB 类型。
			json_add_int ar8xxx_mib_poll_interval $interval
			# 设置轮询间隔。
		json_select ..
	# 返回 switch 层。
	json_select ..
	# 返回顶层。
}

ucidef_add_switch() {
	# 作用：添加交换机配置，包括端口和角色。
	local name="$1"; shift
	# 获取交换机名称。
	local port num role device index need_tag prev_role
	# 声明变量存储端口信息。
	local cpu0 cpu1 cpu2 cpu3 cpu4 cpu5
	# 声明变量存储 CPU 端口索引。
	local n_cpu=0 n_vlan=0 n_ports=0
	# 初始化 CPU 端口、VLAN 和端口计数。

	json_select_object switch
	# 选择 switch 对象。
		json_select_object "$name"
		# 选择或创建指定交换机对象。
			json_add_boolean enable 1
			# 启用交换机。
			json_add_boolean reset 1
			# 重置交换机。

			for port in "$@"; do
				# 遍历端口参数。
				case "$port" in
					[0-9]*@*)
						# 格式：num@device（例如 0@eth0）。
						num="${port%%@*}"
						# 提取端口号。
						device="${port##*@}"
						# 提取设备名称。
						need_tag=0
						# 默认不需要 VLAN 标记。
						want_untag=0
						# 默认不需要取消 VLAN 标记。
						[ "${num%t}" != "$num" ] && {
							# 如果端口号以 't' 结尾。
							num="${num%t}"
							# 移除 't'。
							need_tag=1
							# 设置需要 VLAN 标记。
						}
						[ "${num%u}" != "$num" ] && {
							# 如果端口号以 'u' 结尾。
							num="${num%u}"
							# 移除 'u'。
							want_untag=1
							# 设置需要取消 VLAN 标记。
						}
					;;
					[0-9]*:*:[0-9]*)
						# 格式：num:role:index（例如 1:lan:1）。
						num="${port%%:*}"
						# 提取端口号。
						index="${port##*:}"
						# 提取索引。
						role="${port#[0-9]*:}"; role="${role%:*}"
						# 提取角色。
					;;
					[0-9]*:*)
						# 格式：num:role（例如 1:lan）。
						num="${port%%:*}"
						# 提取端口号。
						role="${port##*:}"
						# 提取角色。
					;;
				esac

				if [ -n "$num" ] && [ -n "$device$role" ]; then
					# 如果端口号和设备/角色存在。
					_ucidef_add_switch_port
					# 添加端口配置。
				fi

				unset num device role index need_tag want_untag
				# 清除临时变量。
			done
		json_select ..
	# 返回 switch 层。
	json_select ..
	# 返回顶层。

	_ucidef_finish_switch_roles
	# 完成角色配置。
}

ucidef_add_switch_attr() {
	# 作用：为交换机添加属性。
	local name="$1"
	# 获取交换机名称。
	local key="$2"
	# 获取属性键。
	local val="$3"
	# 获取属性值。

	json_select_object switch
	# 选择 switch 对象。
		json_select_object "$name"
		# 选择指定交换机。

		case "$val" in
			true|false) [ "$val" != "true" ]; json_add_boolean "$key" $? ;;
			# 如果值是布尔值，转换为 0 或 1。
			[0-9]) json_add_int "$key" "$val" ;;
			# 如果值是数字，添加整数。
			*) json_add_string "$key" "$val" ;;
			# 其他值作为字符串添加。
		esac

		json_select ..
	# 返回 switch 层。
	json_select ..
	# 返回顶层。
}

ucidef_add_switch_port_attr() {
	# 作用：为交换机端口添加属性。
	local name="$1"
	# 获取交换机名称。
	local port="$2"
	# 获取端口号。
	local key="$3"
	# 获取属性键。
	local val="$4"
	# 获取属性值。
	local ports i num
	# 声明变量存储端口列表和索引。

	json_select_object switch
	# 选择 switch 对象。
	json_select_object "$name"
	# 选择指定交换机。

	json_get_keys ports ports
	# 获取端口列表。
	json_select_array ports
	# 选择 ports 数组。

	for i in $ports; do
		# 遍历端口。
		json_select "$i"
		# 选择端口对象。
		json_get_var num num
		# 获取端口号。

		if [ -n "$num" ] && [ $num -eq $port ]; then
			# 如果端口号匹配。
			json_select_object attr
			# 选择或创建 attr 对象。

			case "$val" in
				true|false) [ "$val" != "true" ]; json_add_boolean "$key" $? ;;
				# 如果值是布尔值，转换为 0 或 1。
				[0-9]) json_add_int "$key" "$val" ;;
				# 如果值是数字，添加整数。
				*) json_add_string "$key" "$val" ;;
				# 其他值作为字符串添加。
			esac

			json_select ..
			# 返回端口层。
		fi

		json_select ..
		# 返回 ports 层。
	done

	json_select ..
	# 返回 switch 层。
	json_select ..
	# 返回顶层。
	json_select ..
	# 返回顶层（确保正确返回）。
}

ucidef_set_interface_macaddr() {
	# 作用：设置网络接口的 MAC 地址。
	local network="$1"
	# 获取网络名称。
	local macaddr="$2"
	# 获取 MAC 地址。

	ucidef_set_interface "$network" macaddr "$macaddr"
	# 调用 ucidef_set_interface 设置 MAC 地址。
}

ucidef_add_atm_bridge() {
	# 作用：添加 ATM 桥接配置。
	local vpi="$1"
	# 获取 VPI 值。
	local vci="$2"
	# 获取 VCI 值。
	local encaps="$3"
	# 获取封装类型。
	local payload="$4"
	# 获取负载类型。
	local nameprefix="$5"
	# 获取名称前缀。

	json_select_object dsl
	# 选择 dsl 对象。
		json_select_object atmbridge
		# 选择或创建 atmbridge 对象。
			json_add_int vpi "$vpi"
			# 设置 VPI。
			json_add_int vci "$vci"
			# 设置 VCI。
			json_add_string encaps "$encaps"
			# 设置封装类型。
			json_add_string payload "$payload"
			# 设置负载类型。
			json_add_string nameprefix "$nameprefix"
			# 设置名称前缀。
		json_select ..
	# 返回 dsl 层。
	json_select ..
	# 返回顶层。
}

ucidef_add_adsl_modem() {
	# 作用：添加 ADSL 调制解调器配置。
	local annex="$1"
	# 获取 Annex 类型。
	local firmware="$2"
	# 获取固件路径。

	json_select_object dsl
	# 选择 dsl 对象。
		json_select_object modem
		# 选择或创建 modem 对象。
			json_add_string type "adsl"
			# 设置类型为 ADSL。
			json_add_string annex "$annex"
			# 设置 Annex 类型。
			json_add_string firmware "$firmware"
			# 设置固件路径。
		json_select ..
	# 返回 dsl 层。
	json_select ..
	# 返回顶层。
}

ucidef_add_vdsl_modem() {
	# 作用：添加 VDSL 调制解调器配置。
	local annex="$1"
	# 获取 Annex 类型。
	local tone="$2"
	# 获取 Tone 类型。
	local xfer_mode="$3"
	# 获取传输模式。

	json_select_object dsl
	# 选择 dsl 对象。
		json_select_object modem
		# 选择或创建 modem 对象。
			json_add_string type "vdsl"
			# 设置类型为 VDSL。
			json_add_string annex "$annex"
			# 设置 Annex 类型。
			json_add_string tone "$tone"
			# 设置 Tone 类型。
			json_add_string xfer_mode "$xfer_mode"
			# 设置传输模式。
		json_select ..
	# 返回 dsl 层。
	json_select ..
	# 返回顶层。
}

ucidef_set_led_ataport() {
	# 作用：设置 LED 触发器为 ATA 端口状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local port="$4"
	# 获取 ATA 端口号。

	_ucidef_set_led_trigger "$obj" "$name" "$sysfs" ata"$port"
	# 调用 _ucidef_set_led_trigger 设置触发器为 ataN。
}

_ucidef_set_led_common() {
	# 作用：设置 LED 配置的公共属性（名称和 sysfs 路径）。
	local cfg="led_$1"
	# 构造 LED 配置名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。

	json_select_object led
	# 选择 led 对象。

	json_select_object "$1"
	# 选择或创建指定 LED 对象。
	json_add_string name "$name"
	# 设置 LED 名称。
	json_add_string sysfs "$sysfs"
	# 设置 sysfs 路径。
}

ucidef_set_led_default() {
	# 作用：设置 LED 默认状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local default="$4"
	# 获取默认状态。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string default "$default"
	# 设置默认状态。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_gpio() {
	# 作用：设置 GPIO 控制的 LED 配置。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local gpio="$4"
	# 获取 GPIO 引脚。
	local inverted="$5"
	# 获取是否反转。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string trigger "$trigger"
	# 设置触发器（由外部定义）。
	json_add_string type gpio
	# 设置类型为 GPIO。
	json_add_int gpio "$gpio"
	# 设置 GPIO 引脚。
	json_add_boolean inverted "$inverted"
	# 设置是否反转。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_ide() {
	# 作用：设置 LED 触发器为 IDE 磁盘状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。

	_ucidef_set_led_trigger "$obj" "$name" "$sysfs" ide-disk
	# 调用 _ucidef_set_led_trigger 设置触发器为 ide-disk。
}

ucidef_set_led_netdev() {
	# 作用：设置 LED 触发器为网络设备状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local dev="$4"
	# 获取网络设备名称。
	local mode="${5:-link tx rx}"
	# 获取触发模式（默认：link tx rx）。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string type netdev
	# 设置类型为 netdev。
	json_add_string device "$dev"
	# 设置网络设备名称。
	json_add_string mode "$mode"
	# 设置触发模式。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_oneshot() {
	# 作用：设置 LED 为单次触发定时器模式。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local delayon="$4"
	# 获取点亮时间。
	local delayoff="$5"
	# 获取熄灭时间。

	_ucidef_set_led_timer "$obj" "$name" "$sysfs" "oneshot" "$delayon" "$delayoff"
	# 调用 _ucidef_set_led_timer 设置单次触发定时器。
}

ucidef_set_led_portstate() {
	# 作用：设置 LED 触发器为端口状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local port_state="$4"
	# 获取端口状态。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string trigger port_state
	# 设置触发器为 port_state。
	json_add_string type portstate
	# 设置类型为 portstate。
	json_add_string port_state "$port_state"
	# 设置端口状态。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_rssi() {
	# 作用：设置 LED 触发器为无线信号强度（RSSI）。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local iface="$4"
	# 获取无线接口名称。
	local minq="$5"
	# 获取最小信号质量。
	local maxq="$6"
	# 获取最大信号质量。
	local offset="${7:-0}"
	# 获取偏移量（默认 0）。
	local factor="${8:-1}"
	# 获取因子（默认 1）。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string type rssi
	# 设置类型为 rssi。
	json_add_string name "$name"
	# 设置名称。
	json_add_string iface "$iface"
	# 设置无线接口名称。
	json_add_string minq "$minq"
	# 设置最小信号质量。
	json_add_string maxq "$maxq"
	# 设置最大信号质量。
	json_add_string offset "$offset"
	# 设置偏移量。
	json_add_string factor "$factor"
	# 设置因子。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_switch() {
	# 作用：设置 LED 触发器为交换机端口状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local trigger_name="$4"
	# 获取触发器名称。
	local port_mask="$5"
	# 获取端口掩码。
	local speed_mask="$6"
	# 获取速度掩码。
	local mode="$7"
	# 获取模式。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string trigger "$trigger_name"
	# 设置触发器名称。
	json_add_string type switch
	# 设置类型为 switch。
	json_add_string mode "$mode"
	# 设置模式。
	json_add_string port_mask "$port_mask"
	# 设置端口掩码。
	json_add_string speed_mask "$speed_mask"
	# 设置速度掩码。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

_ucidef_set_led_timer() {
	# 作用：设置 LED 定时器触发器。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local trigger_name="$4"
	# 获取触发器类型。
	local delayon="$5"
	# 获取点亮时间。
	local delayoff="$6"
	# 获取熄灭时间。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string type "$trigger_name"
	# 设置类型。
	json_add_string trigger "$trigger_name"
	# 设置触发器名称。
	json_add_int delayon "$delayon"
	# 设置点亮时间。
	json_add_int delayoff "$delayoff"
	# 设置熄灭时间。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_timer() {
	# 作用：设置 LED 为常规定时器触发模式。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local delayon="$4"
	# 获取点亮时间。
	local delayoff="$5"
	# 获取熄灭时间。

	_ucidef_set_led_timer "$obj" "$name" "$sysfs" "timer" "$delayon" "$delayoff"
	# 调用 _ucidef_set_led_timer 设置常规定时器。
}

_ucidef_set_led_trigger() {
	# 作用：设置 LED 触发器。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local trigger_name="$4"
	# 获取触发器名称。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string trigger "$trigger_name"
	# 设置触发器名称。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_usbdev() {
	# 作用：设置 LED 触发器为 USB 设备状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local dev="$4"
	# 获取 USB 设备名称。

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string type usb
	# 设置类型为 usb。
	json_add_string device "$dev"
	# 设置 USB 设备名称。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_usbhost() {
	# 作用：设置 LED 触发器为 USB 主机状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。

	_ucidef_set_led_trigger "$obj" "$name" "$sysfs" usb-host
	# 调用 _ucidef_set_led_trigger 设置触发器为 usb-host。
}

ucidef_set_led_usbport() {
	# 作用：设置 LED 触发器为 USB 端口状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	shift
	# 跳过前三个参数。
	shift
	shift

	_ucidef_set_led_common "$obj" "$name" "$sysfs"
	# 设置公共属性。

	json_add_string type usbport
	# 设置类型为 usbport。
	json_select_array ports
	# 选择 ports 数组。
		for port in "$@"; do
			# 遍历端口参数。
			json_add_string port "$port"
			# 添加端口名称。
		done
	json_select ..
	# 返回 LED 对象层。
	json_select ..
	# 返回 led 层。

	json_select ..
	# 返回顶层。
}

ucidef_set_led_wlan() {
	# 作用：设置 LED 触发器为无线网络状态。
	local obj="$1"
	# 获取 LED 对象名称。
	local name="$2"
	# 获取 LED 名称。
	local sysfs="$3"
	# 获取 sysfs 路径。
	local trigger_name="$4"
	# 获取触发器名称。

	_ucidef_set_led_trigger "$obj" "$name" "$sysfs" "$trigger_name"
	# 调用 _ucidef_set_led_trigger 设置触发器。
}

ucidef_set_rssimon() {
	# 作用：配置无线信号强度监控（RSSI 监控）。
	local dev="$1"
	# 获取设备名称。
	local refresh="$2"
	# 获取刷新间隔。
	local threshold="$3"
	# 获取阈值。

	json_select_object rssimon
	# 选择 rssimon 对象。

	json_select_object "$dev"
	# 选择或创建设备对象。
	[ -n "$refresh" ] && json_add_int refresh "$refresh"
	# 如果刷新间隔存在，设置 refresh 字段。
	[ -n "$threshold" ] && json_add_int threshold "$threshold"
	# 如果阈值存在，设置 threshold 字段。
	json_select ..
	# 返回 rssimon 层。

	json_select ..
	# 返回顶层。
}

ucidef_add_gpio_switch() {
	# 作用：添加 GPIO 控制的开关配置。
	local cfg="$1"
	# 获取配置名称。
	local name="$2"
	# 获取开关名称。
	local pin="$3"
	# 获取 GPIO 引脚。
	local default="${4:-0}"
	# 获取默认状态（默认 0）。

	json_select_object gpioswitch
	# 选择 gpioswitch 对象。
		json_select_object "$cfg"
		# 选择或创建配置对象。
			json_add_string name "$name"
			# 设置开关名称。
			json_add_int pin "$pin"
			# 设置 GPIO 引脚。
			json_add_int default "$default"
			# 设置默认状态。
		json_select ..
	# 返回 gpioswitch 层。
	json_select ..
	# 返回顶层。
}

ucidef_set_hostname() {
	# 作用：设置系统主机名。
	local hostname="$1"
	# 获取主机名。

	json_select_object system
	# 选择 system 对象。
		json_add_string hostname "$hostname"
		# 设置主机名。
	json_select ..
	# 返回顶层。
}

ucidef_set_ntpserver() {
	# 作用：设置 NTP 服务器列表。
	local server
	# 声明变量存储服务器地址。

	json_select_object system
	# 选择 system 对象。
		json_select_array ntpserver
		# 选择或创建 ntpserver 数组。
			for server in "$@"; do
				# 遍历服务器参数。
				json_add_string "" "$server"
				# 添加服务器地址。
			done
		json_select ..
	# 返回 system 层。
	json_select ..
	# 返回顶层。
}

board_config_update() {
	# 作用：加载并更新设备板级配置文件（通常为 JSON 格式）。
	json_init
	# 初始化 JSON 数据结构。
	[ -f ${CFG} ] && json_load "$(cat ${CFG})"
	# 如果配置文件存在，加载其内容。

	# auto-initialize model id and name if applicable
	if ! json_is_a model object; then
		# 如果 model 对象不存在。
		json_select_object model
		# 创建 model 对象。
			[ -f "/tmp/sysinfo/board_name" ] && \
				json_add_string id "$(cat /tmp/sysinfo/board_name)"
			# 如果板级名称文件存在，设置 id 字段。
			[ -f "/tmp/sysinfo/model" ] && \
				json_add_string name "$(cat /tmp/sysinfo/model)"
			# 如果型号文件存在，设置 name 字段。
		json_select ..
		# 返回顶层。
	fi
}

board_config_flush() {
	# 作用：将当前 JSON 配置写入配置文件。
	json_dump -i > /tmp/.board.json
	# 将 JSON 数据转储到临时文件。
	mv /tmp/.board.json ${CFG}
	# 将临时文件移动到目标配置文件。
}
