# 定义 __network_ifstatus 函数：通过 ubus 查询网络接口状态，并提取指定字段。
# 参数：
# 1: destination variable - 目标变量名，用于存储查询结果。
# 2: interface - 接口名称（可选），为空时查询所有接口。
# 3: path - JSON 路径，用于指定要提取的数据。
# 4: separator - 分隔符（可选），用于多值结果的分隔。
# 5: limit - 限制返回的条目数（可选）。
__network_ifstatus() {
	local __tmp  # 声明局部变量 __tmp，用于临时存储 ubus 查询结果。

	# 检查缓存变量 __NETWORK_CACHE 是否为空，如果为空则通过 ubus 获取网络接口状态。
	[ -z "$__NETWORK_CACHE" ] && {
		__tmp="$(ubus call network.interface dump 2>&1)"  # 调用 ubus 获取所有网络接口的完整状态，输出到 __tmp。
		case "$?" in  # 检查 ubus 调用的返回值。
			4) : ;;  # 返回值 4（未授权），不做处理。
			0) export __NETWORK_CACHE="$__tmp" ;;  # 返回值 0（成功），将结果存储到缓存变量 __NETWORK_CACHE。
			*) echo "$__tmp" >&2 ;;  # 其他返回值（错误），将错误信息输出到标准错误。
		esac
	}

	# 使用 jsonfilter 从缓存中提取指定字段的数据。
	# -F 指定分隔符，-l 指定条目限制，-s 指定输入 JSON 数据，-e 指定要提取的字段路径。
	__tmp="$(jsonfilter ${4:+-F "$4"} ${5:+-l "$5"} -s "${__NETWORK_CACHE:-{}}" -e "$1=@.interface${2:+[@.interface='$2']}$3")"

	# 如果提取结果为空，清理目标变量并返回 1（失败）。
	[ -z "$__tmp" ] && \
		unset "$1" && \
		return 1

	# 执行提取结果（通常为 export 命令），将值赋给目标变量。
	eval "$__tmp"
}

# 定义 network_get_ipaddr 函数：获取指定逻辑接口的第一个 IPv4 地址。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv4 地址。
# 2: interface - 逻辑接口名称。
network_get_ipaddr() {
	# 调用 __network_ifstatus，提取接口的第一个 IPv4 地址（路径：['ipv4-address'][0].address）。
	__network_ifstatus "$1" "$2" "['ipv4-address'][0].address";
}

# 定义 network_get_ipaddr6 函数：获取指定逻辑接口的第一个 IPv6 地址。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 地址。
# 2: interface - 逻辑接口名称。
network_get_ipaddr6() {
	# 尝试从接口的 IPv6 地址列表中提取第一个地址。
	__network_ifstatus "$1" "$2" "['ipv6-address'][0].address" || \
		# 如果失败，尝试从 IPv6 前缀分配的本地地址中提取第一个地址。
		__network_ifstatus "$1" "$2" "['ipv6-prefix-assignment'][0]['local-address'].address" || \
		# 如果均失败，返回 1（失败）。
		return 1
}

# 定义 network_get_subnet 函数：获取指定逻辑接口的第一个 IPv4 子网（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv4 子网。
# 2: interface - 逻辑接口名称。
network_get_subnet() {
	# 调用 __network_ifstatus，提取接口的第一个 IPv4 地址和掩码（路径：['ipv4-address'][0]['address','mask']），用 / 分隔。
	__network_ifstatus "$1" "$2" "['ipv4-address'][0]['address','mask']" "/"
}

# 定义 network_get_subnet6 函数：获取指定逻辑接口的第一个 IPv6 子网（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 子网。
# 2: interface - 逻辑接口名称。
network_get_subnet6() {
	local __nets __addr  # 声明局部变量 __nets 和 __addr，分别存储子网列表和单个地址。

	# 调用 network_get_subnets6 获取所有 IPv6 子网。
	if network_get_subnets6 __nets "$2"; then
		# 优先返回第一个非 fe80::/10（链路本地）和非 fc::/7（私有地址）的子网。
		for __addr in $__nets; do
			case "$__addr" in fe[8ab]?:*|f[cd]??:*)
				continue  # 跳过 fe80::/10 和 fc::/7 地址。
			esac
			export "$1=$__addr"  # 找到符合条件的地址，赋值给目标变量。
			return 0  # 返回 0（成功）。
		done

		# 如果没有非 fe80::/10 和非 fc::/7 的地址，尝试返回第一个非 fe80::/10 的地址。
		for __addr in $__nets; do
			case "$__addr" in fe[8ab]?:*)
				continue  # 跳过 fe80::/10 地址。
			esac
			export "$1=$__addr"  # 找到符合条件的地址，赋值给目标变量。
			return 0  # 返回 0（成功）。
		done

		# 如果仍未找到合适地址，返回第一个子网。
		for __addr in $__nets; do
			export "$1=$__addr"  # 赋值第一个地址给目标变量。
			return 0  # 返回 0（成功）。
		done
	fi

	# 如果没有子网，清理目标变量并返回 1（失败）。
	unset "$1"
	return 1
}

# 定义 network_get_prefix6 函数：获取指定逻辑接口的第一个 IPv6 前缀（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 前缀。
# 2: interface - 逻辑接口名称。
network_get_prefix6() {
	# 调用 __network_ifstatus，提取接口的第一个 IPv6 前缀（路径：['ipv6-prefix'][0]['address','mask']），用 / 分隔。
	__network_ifstatus "$1" "$2" "['ipv6-prefix'][0]['address','mask']" "/"
}

# 定义 network_get_ipaddrs 函数：获取指定逻辑接口的所有 IPv4 地址。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv4 地址列表。
# 2: interface - 逻辑接口名称。
network_get_ipaddrs() {
	# 调用 __network_ifstatus，提取接口的所有 IPv4 地址（路径：['ipv4-address'][*].address）。
	__network_ifstatus "$1" "$2" "['ipv4-address'][*].address"
}

# 定义 network_get_ipaddrs6 函数：获取指定逻辑接口的所有 IPv6 地址。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 地址列表。
# 2: interface - 逻辑接口名称。
network_get_ipaddrs6() {
	local __addr  # 声明局部变量 __addr，用于存储单个地址。
	local __list=""  # 声明局部变量 __list，用于存储地址列表。

	# 从接口的 IPv6 地址列表中提取所有地址。
	if __network_ifstatus "__addr" "$2" "['ipv6-address'][*].address"; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"  # 将地址追加到列表，用空格分隔。
		done
	fi

	# 从 IPv6 前缀分配的本地地址中提取所有地址。
	if __network_ifstatus "__addr" "$2" "['ipv6-prefix-assignment'][*]['local-address'].address"; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"  # 将地址追加到列表，用空格分隔。
		done
	fi

	# 如果列表不为空，赋值给目标变量并返回 0（成功）。
	if [ -n "$__list" ]; then
		export "$1=$__list"
		return 0
	fi

	# 如果列表为空，清理目标变量并返回 1（失败）。
	unset "$1"
	return 1
}

# 定义 network_get_ipaddrs_all 函数：获取指定逻辑接口的所有 IP 地址（IPv4 和 IPv6）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IP 地址列表。
# 2: interface - 逻辑接口名称。
network_get_ipaddrs_all() {
	local __addr __addr6  # 声明局部变量 __addr 和 __addr6，分别存储 IPv4 和 IPv6 地址。

	# 获取所有 IPv4 地址。
	network_get_ipaddrs __addr "$2"
	# 获取所有 IPv6 地址。
	network_get_ipaddrs6 __addr6 "$2"

	# 如果至少有一个地址（IPv4 或 IPv6），合并列表并赋值给目标变量。
	if [ -n "$__addr" -o -n "$__addr6" ]; then
		export "$1=${__addr:+$__addr }$__addr6"
		return 0  # 返回 0（成功）。
	fi

	# 如果没有地址，清理目标变量并返回 1（失败）。
	unset "$1"
	return 1
}

# 定义 network_get_subnets 函数：获取指定逻辑接口的所有 IPv4 子网（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv4 子网列表。
# 2: interface - 逻辑接口名称。
network_get_subnets() {
	# 调用 __network_ifstatus，提取接口的所有 IPv4 地址和掩码（路径：['ipv4-address'][*]['address','mask']），用 / 分隔，多个子网用空格分隔。
	__network_ifstatus "$1" "$2" "['ipv4-address'][*]['address','mask']" "/ "
}

# 定义 network_get_subnets6 函数：获取指定逻辑接口的所有 IPv6 子网（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 子网列表。
# 2: interface - 逻辑接口名称。
network_get_subnets6() {
	local __addr __mask  # 声明局部变量 __addr 和 __mask，分别存储地址和掩码。
	local __list=""  # 声明局部变量 __list，用于存储子网列表。

	# 从接口的 IPv6 地址列表中提取所有地址和掩码。
	if __network_ifstatus "__addr" "$2" "['ipv6-address'][*]['address','mask']" "/ "; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"  # 将子网追加到列表，用空格分隔。
		done
	fi

	# 从 IPv6 前缀分配中提取本地地址和掩码。
	if __network_ifstatus "__addr" "$2" "['ipv6-prefix-assignment'][*]['local-address'].address" && \
	   __network_ifstatus "__mask" "$2" "['ipv6-prefix-assignment'][*].mask"; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}/${__mask%% *}"  # 将地址和掩码组合成子网格式，追加到列表。
			__mask="${__mask#* }"  # 移除已使用的掩码，处理下一个地址。
		done
	fi

	# 如果列表不为空，赋值给目标变量并返回 0（成功）。
	if [ -n "$__list" ]; then
		export "$1=$__list"
		return 0
	fi

	# 如果列表为空，清理目标变量并返回 1（失败）。
	unset "$1"
	return 1
}

# 定义 network_get_prefixes6 函数：获取指定逻辑接口的所有 IPv6 前缀（地址/掩码）。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 前缀列表。
# 2: interface - 逻辑接口名称。
network_get_prefixes6() {
	# 调用 __network_ifstatus，提取接口的所有 IPv6 前缀（路径：['ipv6-prefix'][*]['address','mask']），用 / 分隔，多个前缀用空格分隔。
	__network_ifstatus "$1" "$2" "['ipv6-prefix'][*]['address','mask']" "/ "
}

# 定义 network_get_gateway 函数：获取指定逻辑接口的 IPv4 网关。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv4 网关地址。
# 2: interface - 逻辑接口名称。
# 3: consider inactive gateway if "true" (optional) - 是否考虑非活跃网关。
network_get_gateway() {
	# 尝试提取活跃路由中的默认网关（目标为 0.0.0.0，无路由表）。
	__network_ifstatus "$1" "$2" ".route[@.target='0.0.0.0' && !@.table].nexthop" "" 1 && \
		return 0  # 如果成功，返回 0。

	# 如果指定了考虑非活跃网关（第 3 个参数为 1 或 true），尝试提取非活跃路由中的默认网关。
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive.route[@.target='0.0.0.0' && !@.table].nexthop" "" 1
}

# 定义 network_get_gateway6 函数：获取指定逻辑接口的 IPv6 网关。
# 参数：
# 1: destination variable - 目标变量名，用于存储 IPv6 网关地址。
# 2: interface - 逻辑接口名称。
# 3: consider inactive gateway if "true" (optional) - 是否考虑非活跃网关。
network_get_gateway6() {
	# 尝试提取活跃路由中的默认网关（目标为 ::，无路由表）。
	__network_ifstatus "$1" "$2" ".route[@.target='::' && !@.table].nexthop" "" 1 && \
		return 0  # 如果成功，返回 0。

	# 如果指定了考虑非活跃网关，尝试提取非活跃路由中的默认网关。
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive.route[@.target='::' && !@.table].nexthop" "" 1
}

# 定义 network_get_dnsserver 函数：获取指定逻辑接口的 DNS 服务器列表。
# 参数：
# 1: destination variable - 目标变量名，用于存储 DNS 服务器列表。
# 2: interface - 逻辑接口名称。
# 3: consider inactive servers if "true" (optional) - 是否考虑非活跃 DNS 服务器。
network_get_dnsserver() {
	# 尝试提取活跃的 DNS 服务器列表。
	__network_ifstatus "$1" "$2" "['dns-server'][*]" && return 0

	# 如果指定了考虑非活跃服务器，尝试提取非活跃的 DNS 服务器列表。
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive['dns-server'][*]"
}

# 定义 network_get_dnssearch 函数：获取指定逻辑接口的 DNS 搜索域列表。
# 参数：
# 1: destination variable - 目标变量名，用于存储 DNS 搜索域列表。
# 2: interface - 逻辑接口名称。
# 3: consider inactive domains if "true" (optional) - 是否考虑非活跃搜索域。
network_get_dnssearch() {
	# 尝试提取活跃的 DNS 搜索域列表。
	__network_ifstatus "$1" "$2" "['dns-search'][*]" && return 0

	# 如果指定了考虑非活跃搜索域，尝试提取非活跃的 DNS 搜索域列表。
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive['dns-search'][*]"
}

# 定义 __network_wan 函数：查找包含指定默认路由的逻辑接口。
# 参数：
# 1: destination variable - 目标变量名，用于存储接口名称。
# 2: addr - 默认路由目标地址（IPv4 为 0.0.0.0，IPv6 为 ::）。
# 3: inactive - 是否考虑非活跃路由（可选）。
__network_wan()
{
	# 尝试查找活跃路由中包含指定默认路由的接口。
	__network_ifstatus "$1" "" \
		"[@.route[@.target='$2' && !@.table]].interface" "" 1 && \
			return 0  # 如果成功，返回 0。

	# 如果指定了考虑非活跃路由，尝试查找非活跃路由中包含指定默认路由的接口。
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "" \
			"[@.inactive.route[@.target='$2' && !@.table]].interface" "" 1
}

# 定义 network_find_wan 函数：查找包含当前 IPv4 默认路由的逻辑接口。
# 参数：
# 1: destination variable - 目标变量名，用于存储接口名称。
# 2: consider inactive default routes if "true" (optional) - 是否考虑非活跃默认路由。
network_find_wan() { __network_wan "$1" "0.0.0.0" "$2"; }

# 定义 network_find_wan6 函数：查找包含当前 IPv6 默认路由的逻辑接口。
# 参数：
# 1: destination variable - 目标变量名，用于存储接口名称。
# 2: consider inactive default routes if "true" (optional) - 是否考虑非活跃默认路由。
network_find_wan6() { __network_wan "$1" "::" "$2"; }

# 定义 network_is_up 函数：检查指定逻辑接口是否处于运行状态。
# 参数：
# 1: interface - 逻辑接口名称。
network_is_up()
{
	local __up  # 声明局部变量 __up，用于存储接口状态。
	# 调用 __network_ifstatus 检查接口的 up 字段，并判断是否为 1（运行中）。
	__network_ifstatus "__up" "$1" ".up" && [ "$__up" = 1 ]
}

# 定义 network_get_protocol 函数：获取指定逻辑接口的协议类型。
# 参数：
# 1: destination variable - 目标变量名，用于存储协议类型。
# 2: interface - 逻辑接口名称。
network_get_protocol() { __network_ifstatus "$1" "$2" ".proto"; }

# 定义 network_get_uptime 函数：获取指定逻辑接口的运行时间。
# 参数：
# 1: destination variable - 目标变量名，用于存储运行时间（秒）。
# 2: interface - 逻辑接口名称。
network_get_uptime() { __network_ifstatus "$1" "$2" ".uptime"; }

# 定义 network_get_metric 函数：获取指定逻辑接口的路由度量值。
# 参数：
# 1: destination variable - 目标变量名，用于存储度量值。
# 2: interface - 逻辑接口名称。
network_get_metric() { __network_ifstatus "$1" "$2" ".metric"; }

# 定义 network_get_device 函数：获取指定逻辑接口的第 3 层 Linux 网络设备（L3 设备）。
# 参数：
# 1: destination variable - 目标变量名，用于存储设备名称。
# 2: interface - 逻辑接口名称。
network_get_device() { __network_ifstatus "$1" "$2" ".l3_device"; }

# 定义 network_get_physdev 函数：获取指定逻辑接口的第 2 层 Linux 网络设备（物理设备）。
# 参数：
# 1: destination variable - 目标变量名，用于存储设备名称。
# 2: interface - 逻辑接口名称。
network_get_physdev() { __network_ifstatus "$1" "$2" ".device"; }

# 定义 network_defer_device 函数：延迟指定 Linux 网络设备的 netifd 操作。
# 参数：
# 1: device name - 设备名称。
network_defer_device()
{
	# 调用 ubus 设置设备状态为延迟（defer: true），忽略错误输出。
	ubus call network.device set_state \
		"$(printf '{ "name": "%s", "defer": true }' "$1")" 2>/dev/null
}

# 定义 network_ready_device 函数：恢复指定 Linux 网络设备的 netifd 操作。
# 参数：
# 1: device name - 设备名称。
network_ready_device()
{
	# 调用 ubus 设置设备状态为非延迟（defer: false），忽略错误输出。
	ubus call network.device set_state \
		"$(printf '{ "name": "%s", "defer": false }' "$1")" 2>/dev/null
}

# 定义 network_flush_cache 函数：清空内部缓存，强制从 ubus 重新读取数据。
network_flush_cache() { unset __NETWORK_CACHE; }
