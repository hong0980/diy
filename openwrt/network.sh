#!/bin/sh
# =============================================================================
# network.sh —— OpenWrt netifd 网络接口查询 API 库
# =============================================================================
# 本文件提供一组 Shell 函数，用于查询 OpenWrt 逻辑网络接口（logical interface）
# 的各类状态信息，包括 IP 地址、子网、网关、DNS 等。
#
# 【核心概念说明】
#   逻辑接口（logical interface）：
#     OpenWrt 在 /etc/config/network 中定义的接口名，如 wan、lan、loopback。
#     与之相对的是 Linux 内核网络设备名（如 eth0、br-lan）。
#
#   数据来源：
#     所有信息通过 ubus 总线查询 network.interface 对象获得，
#     结果缓存在 __NETWORK_CACHE 变量中，避免重复调用 ubus。
#
#   函数命名规律：
#     network_get_xxx      获取单个值（取第一条记录）
#     network_get_xxxs     获取所有值（返回空格分隔的列表）
#     network_find_xxx     查找满足条件的接口名
#     network_is_xxx       判断接口状态（返回布尔值）
#
# 【典型使用示例】
#   . /lib/functions/network.sh      # 加载本库
#
#   # 获取 wan 接口的 IPv4 地址
#   network_get_ipaddr ipaddr "wan"
#   echo "WAN IP: $ipaddr"
#
#   # 获取 wan 接口的默认网关
#   network_get_gateway gw "wan"
#   echo "Gateway: $gw"
#
#   # 检查 lan 接口是否运行中
#   if network_is_up "lan"; then
#       echo "LAN is up"
#   fi
#
#   # 找到持有 IPv4 默认路由的接口名
#   network_find_wan wanif
#   echo "WAN interface: $wanif"
#
# 【注意事项】
#   - 所有"目标变量"参数均以变量名字符串传入，函数内部通过 eval/export 赋值。
#     正确：network_get_ipaddr myvar "wan"   （传变量名，不加 $）
#     错误：network_get_ipaddr $myvar "wan"  （传变量值）
#   - 函数返回 0 表示成功（找到数据），返回 1 表示失败（未找到数据），
#     失败时目标变量会被 unset。
# =============================================================================


# =============================================================================
# __network_ifstatus() —— 核心底层查询函数（内部使用，以双下划线开头）
# =============================================================================
# 通过 ubus 获取网络接口状态，并用 jsonfilter 从 JSON 中提取指定字段，
# 将结果赋值给目标变量。结果会缓存在 __NETWORK_CACHE 中避免重复查询。
#
# 参数：
#   $1 - 目标变量名（字符串，函数内通过 eval 赋值）
#   $2 - 逻辑接口名（如 "wan"、"lan"；为空则匹配所有接口）
#   $3 - jsonfilter 路径表达式（在接口 JSON 对象内的取值路径）
#   $4 - 字段分隔符（可选；用于将多字段合并，如地址/掩码用 "/" 分隔）
#   $5 - 结果条数限制（可选；1 表示只取第一条）
#
# 返回：0 - 成功取到值；1 - 未取到值（同时 unset 目标变量）
#
# ubus 返回码说明：
#   0 - 成功
#   4 - network.interface 对象不存在（netifd 未运行），静默忽略
#   * - 其他错误，输出错误信息到 stderr
# =============================================================================
# 1: destination variable
# 2: interface
# 3: path
# 4: separator
# 5: limit
__network_ifstatus() {
	local __tmp

	# -------------------------------------------------------------------------
	# 缓存机制：__NETWORK_CACHE 为空时才重新查询 ubus，避免每次调用都走 ubus
	# ubus call network.interface dump 返回所有逻辑接口的完整状态 JSON
	# -------------------------------------------------------------------------
	[ -z "$__NETWORK_CACHE" ] && {
		__tmp="$(ubus call network.interface dump 2>&1)"
		case "$?" in
			4) : ;;                                # netifd 未运行，静默跳过
			0) export __NETWORK_CACHE="$__tmp" ;;  # 成功，写入缓存
			*) echo "$__tmp" >&2 ;;                # 其他错误，输出到 stderr
		esac
	}

	# -------------------------------------------------------------------------
	# 用 jsonfilter 从缓存中提取数据：
	#   -F "$4"         : 指定多字段合并分隔符（如 "/" 用于 address/mask）
	#   -l "$5"         : 限制返回条数
	#   -s "..."        : 从字符串读取 JSON（而非文件）
	#   -e "$1=@.interface[...].路径" : 将提取结果赋值给目标变量
	#
	# 路径示例：
	#   @.interface[@.interface='wan']['ipv4-address'][0].address
	#   → 从 interface 数组中找 interface 字段等于 'wan' 的项，
	#     取其 ipv4-address 数组第一项的 address 字段
	# -------------------------------------------------------------------------
	__tmp="$(jsonfilter ${4:+-F "$4"} ${5:+-l "$5"} -s "${__NETWORK_CACHE:-{}}" -e "$1=@.interface${2:+[@.interface='$2']}$3")"

	# 结果为空则 unset 目标变量并返回失败
	[ -z "$__tmp" ] && \
		unset "$1" && \
		return 1

	# 将 jsonfilter 输出的赋值语句（如 myvar='192.168.1.1'）eval 到当前环境
	eval "$__tmp"
}


# =============================================================================
# ── IPv4 地址查询 ─────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的第一个 IPv4 地址
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_ipaddr ip "wan"  → $ip = "203.0.113.1"
network_get_ipaddr() {
	__network_ifstatus "$1" "$2" "['ipv4-address'][0].address";
}

# 获取指定逻辑接口的所有 IPv4 地址（空格分隔）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_ipaddrs ips "lan"  → $ips = "192.168.1.1 192.168.2.1"
network_get_ipaddrs() {
	__network_ifstatus "$1" "$2" "['ipv4-address'][*].address"
}

# 获取指定逻辑接口的第一个 IPv4 子网（CIDR 格式：地址/掩码位数）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_subnet subnet "lan"  → $subnet = "192.168.1.1/24"
# 说明：使用 "/" 作为分隔符，将 address 和 mask 两个字段合并为 CIDR 格式
network_get_subnet() {
	__network_ifstatus "$1" "$2" "['ipv4-address'][0]['address','mask']" "/"
}

# 获取指定逻辑接口的所有 IPv4 子网（空格分隔的 CIDR 列表）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_subnets subnets "lan"  → $subnets = "192.168.1.0/24 10.0.0.0/8"
# 说明：使用 "/ " 分隔符，address 和 mask 以 "/" 合并，多条记录以空格分隔
network_get_subnets() {
	__network_ifstatus "$1" "$2" "['ipv4-address'][*]['address','mask']" "/ "
}


# =============================================================================
# ── IPv6 地址查询 ─────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的第一个 IPv6 地址
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：优先从 ipv6-address 取，若没有则尝试从 IPv6 前缀分配的本地地址取
# 示例：network_get_ipaddr6 ip6 "wan6"  → $ip6 = "2001:db8::1"
network_get_ipaddr6() {
	__network_ifstatus "$1" "$2" "['ipv6-address'][0].address" || \
		__network_ifstatus "$1" "$2" "['ipv6-prefix-assignment'][0]['local-address'].address" || \
		return 1
}

# 获取指定逻辑接口的所有 IPv6 地址（空格分隔）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：合并 ipv6-address 和 ipv6-prefix-assignment 中的本地地址两个来源
# 示例：network_get_ipaddrs6 ips6 "lan"  → $ips6 = "2001:db8::1 fd00::1"
network_get_ipaddrs6() {
	local __addr
	local __list=""

	# 来源1：直接分配的 IPv6 地址（ipv6-address）
	if __network_ifstatus "__addr" "$2" "['ipv6-address'][*].address"; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"
		done
	fi

	# 来源2：IPv6 前缀分配中的本地地址（ipv6-prefix-assignment 的 local-address）
	if __network_ifstatus "__addr" "$2" "['ipv6-prefix-assignment'][*]['local-address'].address"; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"
		done
	fi

	if [ -n "$__list" ]; then
		export "$1=$__list"
		return 0
	fi

	unset "$1"
	return 1
}

# 获取指定逻辑接口的第一个 IPv6 子网（CIDR 格式）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：按以下优先级过滤，返回最"公网可用"的地址：
#   1. 优先排除链路本地地址（fe80::/10）和 ULA 地址（fc::/7，即 fc/fd 段）
#   2. 次优先排除链路本地地址（只保留 ULA 和全局单播）
#   3. 实在没有则返回第一条（含链路本地）
# 示例：network_get_subnet6 s6 "wan6"  → $s6 = "2001:db8::1/64"
network_get_subnet6() {
	local __nets __addr

	if network_get_subnets6 __nets "$2"; then
		# 第一轮：排除链路本地（fe80::/10）和 ULA（fc00::/7），优先返回全局单播
		# fe[8ab]?: 匹配 fe80~febf（链路本地）
		# f[cd]??:  匹配 fc00~/7（ULA，即 fc/fd 开头）
		for __addr in $__nets; do
			case "$__addr" in fe[8ab]?:*|f[cd]??:*)
				continue
			esac
			export "$1=$__addr"
			return 0
		done

		# 第二轮：只排除链路本地（保留 ULA），兼顾纯 IPv6 内网场景
		for __addr in $__nets; do
			case "$__addr" in fe[8ab]?:*)
				continue
			esac
			export "$1=$__addr"
			return 0
		done

		# 第三轮：无可用地址时退而返回第一条（含链路本地）
		for __addr in $__nets; do
			export "$1=$__addr"
			return 0
		done
	fi

	unset "$1"
	return 1
}

# 获取指定逻辑接口的所有 IPv6 子网（空格分隔的 CIDR 列表）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：合并两个来源的子网信息：
#   - ipv6-address（直接分配地址 + 掩码）
#   - ipv6-prefix-assignment（前缀分配的本地地址 + 前缀掩码）
# 示例：network_get_subnets6 s6 "lan"  → $s6 = "2001:db8::1/64 fd00::1/48"
network_get_subnets6() {
	local __addr __mask
	local __list=""

	# 来源1：直接的 IPv6 地址及其掩码（address/mask 合并为 CIDR）
	if __network_ifstatus "__addr" "$2" "['ipv6-address'][*]['address','mask']" "/ "; then
		for __addr in $__addr; do
			__list="${__list:+$__list }${__addr}"
		done
	fi

	# 来源2：IPv6 前缀分配的本地地址，与对应前缀掩码手动拼接为 CIDR
	# 注意：address 和 mask 分两次查询，然后手动按顺序拼合
	if __network_ifstatus "__addr" "$2" "['ipv6-prefix-assignment'][*]['local-address'].address" && \
	   __network_ifstatus "__mask" "$2" "['ipv6-prefix-assignment'][*].mask"; then
		for __addr in $__addr; do
			# 取 __mask 的第一段（空格前），然后去掉已用的第一段，准备下次循环
			__list="${__list:+$__list }${__addr}/${__mask%% *}"
			__mask="${__mask#* }"
		done
	fi

	if [ -n "$__list" ]; then
		export "$1=$__list"
		return 0
	fi

	unset "$1"
	return 1
}


# =============================================================================
# ── IPv6 前缀查询 ─────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的第一个 IPv6 前缀（CIDR 格式）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：前缀（prefix）是 ISP 下发给路由器的地址段（如 2001:db8::/56），
#       与地址（address）不同，前缀用于分配给下游设备。
# 示例：network_get_prefix6 p6 "wan6"  → $p6 = "2001:db8::/56"
network_get_prefix6() {
	__network_ifstatus "$1" "$2" "['ipv6-prefix'][0]['address','mask']" "/"
}

# 获取指定逻辑接口的第一个 IPv6 前缀分配（CIDR 格式）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：前缀分配（prefix-assignment）是路由器从上游前缀中划分出来
#       分配给某个下游接口的子前缀（如将 /56 分成多个 /64 分配给 lan）。
# 示例：network_get_prefix_assignment6 pa6 "lan"  → $pa6 = "2001:db8:0:1::/64"
network_get_prefix_assignment6() {
	__network_ifstatus "$1" "$2" "['ipv6-prefix-assignment'][0]['address','mask']" "/"
}

# 获取指定逻辑接口的所有 IPv6 前缀（空格分隔的 CIDR 列表）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
network_get_prefixes6() {
	__network_ifstatus "$1" "$2" "['ipv6-prefix'][*]['address','mask']" "/ "
}

# 获取指定逻辑接口的所有 IPv6 前缀分配（空格分隔的 CIDR 列表）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
network_get_prefix_assignments6() {
	__network_ifstatus "$1" "$2" "['ipv6-prefix-assignment'][*]['address','mask']" "/ "
}


# =============================================================================
# ── 全协议地址查询 ────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的所有 IP 地址（IPv4 + IPv6，空格分隔）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：合并 IPv4 和 IPv6 地址，只要任一不为空即返回成功
# 示例：network_get_ipaddrs_all addrs "lan"
#       → $addrs = "192.168.1.1 2001:db8::1 fd00::1"
network_get_ipaddrs_all() {
	local __addr __addr6

	network_get_ipaddrs __addr "$2"
	network_get_ipaddrs6 __addr6 "$2"

	if [ -n "$__addr" -o -n "$__addr6" ]; then
		# 拼合两个列表，若 __addr 非空则加空格分隔
		export "$1=${__addr:+$__addr }$__addr6"
		return 0
	fi

	unset "$1"
	return 1
}


# =============================================================================
# ── 网关查询 ──────────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的 IPv4 默认网关
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
#       $3 - 是否查询非活跃网关（1 或 "true" 表示是，可选）
# 说明：查找路由表中目标为 0.0.0.0（IPv4 默认路由）且不在附加路由表中的路由，
#       取其 nexthop（下一跳）即为网关地址。
#       $3=true 时额外查询 inactive 段（接口未连接时保留的上次网关）。
# 示例：network_get_gateway gw "wan"        → $gw = "203.0.113.254"
#       network_get_gateway gw "wan" true   → 包括非活跃网关
network_get_gateway() {
	# 先查活跃路由表中的默认路由网关（!@.table 表示不在附加路由表中）
	__network_ifstatus "$1" "$2" ".route[@.target='0.0.0.0' && !@.table].nexthop" "" 1 && \
		return 0

	# 若 $3 为 true/1，则再查非活跃（inactive）路由中的网关
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive.route[@.target='0.0.0.0' && !@.table].nexthop" "" 1
}

# 获取指定逻辑接口的 IPv6 默认网关
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
#       $3 - 是否查询非活跃网关（1 或 "true" 表示是，可选）
# 说明：与 network_get_gateway 类似，查找目标为 "::"（IPv6 默认路由）的路由。
# 示例：network_get_gateway6 gw6 "wan6"  → $gw6 = "fe80::1"
network_get_gateway6() {
	__network_ifstatus "$1" "$2" ".route[@.target='::' && !@.table].nexthop" "" 1 && \
		return 0

	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive.route[@.target='::' && !@.table].nexthop" "" 1
}


# =============================================================================
# ── DNS 查询 ──────────────────────────────────────────────────────────────────
# =============================================================================

# 获取指定逻辑接口的 DNS 服务器列表（空格分隔）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
#       $3 - 是否查询非活跃 DNS（1 或 "true" 表示是，可选）
# 说明：DNS 服务器通常由 ISP 通过 DHCP/DHCPv6/PPP 自动下发。
#       $3=true 时额外查询接口非活跃状态时保留的 DNS 配置。
# 示例：network_get_dnsserver dns "wan"  → $dns = "8.8.8.8 1.1.1.1"
network_get_dnsserver() {
	__network_ifstatus "$1" "$2" "['dns-server'][*]" && return 0

	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive['dns-server'][*]"
}

# 获取指定逻辑接口的 DNS 搜索域列表（空格分隔）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
#       $3 - 是否查询非活跃搜索域（1 或 "true" 表示是，可选）
# 说明：DNS 搜索域（search domain）用于短主机名的自动补全，
#       如配置了 "example.com"，则 ping server 会自动尝试 server.example.com。
# 示例：network_get_dnssearch domains "wan"  → $domains = "example.com isp.net"
network_get_dnssearch() {
	__network_ifstatus "$1" "$2" "['dns-search'][*]" && return 0

	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "$2" ".inactive['dns-search'][*]"
}


# =============================================================================
# __network_wan() —— 查找持有指定默认路由的逻辑接口名（内部函数）
# =============================================================================
# 在所有接口中（不限定接口名）查找路由表中包含指定默认路由目标的接口。
# 参数：$1 - 目标变量名（用于存储找到的逻辑接口名）
#       $2 - 路由目标地址（"0.0.0.0" 表示 IPv4 默认路由，"::" 表示 IPv6）
#       $3 - 是否查询非活跃路由（1 或 "true"，可选）
# 说明：$2 为空时接口过滤条件失效，即遍历所有接口查找含该路由的接口名
# =============================================================================
# 1: destination variable
# 2: addr
# 3: inactive
__network_wan()
{
	# 遍历所有接口，找到活跃路由表中包含目标地址默认路由的接口名
	__network_ifstatus "$1" "" \
		"[@.route[@.target='$2' && !@.table]].interface" "" 1 && \
			return 0

	# $3=true 时再查非活跃路由
	[ "$3" = 1 -o "$3" = "true" ] && \
		__network_ifstatus "$1" "" \
			"[@.inactive.route[@.target='$2' && !@.table]].interface" "" 1
}

# 查找当前持有 IPv4 默认路由的逻辑接口名
# 参数：$1 - 目标变量名；$2 - 是否包含非活跃路由（"true" 或 1，可选）
# 说明：通常用于动态获取实际的 WAN 接口（多 WAN 或接口名不固定时很有用）
# 示例：network_find_wan wanif          → $wanif = "wan"
#       network_find_wan wanif true     → 包括非活跃接口
network_find_wan() { __network_wan "$1" "0.0.0.0" "$2"; }

# 查找当前持有 IPv6 默认路由的逻辑接口名
# 参数：$1 - 目标变量名；$2 - 是否包含非活跃路由（"true" 或 1，可选）
# 示例：network_find_wan6 wan6if  → $wan6if = "wan6"
network_find_wan6() { __network_wan "$1" "::" "$2"; }


# =============================================================================
# ── 接口状态与属性查询 ────────────────────────────────────────────────────────
# =============================================================================

# 检查指定逻辑接口是否处于运行状态（up）
# 参数：$1 - 逻辑接口名
# 返回：0 - 接口已连接运行；非 0 - 接口未运行
# 示例：
#   if network_is_up "wan"; then
#       echo "WAN 已连接"
#   fi
network_is_up()
{
	local __up
	# 取 .up 字段，为 1 则表示接口运行中
	__network_ifstatus "__up" "$1" ".up" && [ "$__up" = 1 ]
}

# 获取指定逻辑接口使用的协议名
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_protocol proto "wan"  → $proto = "pppoe" / "dhcp" / "static"
network_get_protocol() { __network_ifstatus "$1" "$2" ".proto"; }

# 获取指定逻辑接口的在线时长（秒）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 示例：network_get_uptime uptime "wan"  → $uptime = "3600"（秒）
network_get_uptime() { __network_ifstatus "$1" "$2" ".uptime"; }

# 获取指定逻辑接口的路由度量值（metric）
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：metric 用于多 WAN 路由优先级排序，数值越小优先级越高
# 示例：network_get_metric metric "wan"  → $metric = "10"
network_get_metric() { __network_ifstatus "$1" "$2" ".metric"; }

# 获取指定逻辑接口对应的三层（L3）Linux 网络设备名
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：L3 设备是实际承载 IP 流量的设备，如 PPPoE 的 pppoe-wan，
#       普通以太网的 eth0.2，与 network_get_physdev 返回的物理设备可能不同
# 示例：network_get_device dev "wan"  → $dev = "pppoe-wan" / "eth0.2"
network_get_device() { __network_ifstatus "$1" "$2" ".l3_device"; }

# 获取指定逻辑接口对应的二层（L2）物理 Linux 网络设备名
# 参数：$1 - 目标变量名；$2 - 逻辑接口名
# 说明：L2 设备是物理或虚拟网络设备，如 eth0、br-lan。
#       对于 PPPoE 等隧道协议，L2 设备（eth0）与 L3 设备（pppoe-wan）不同；
#       对于普通 DHCP 接口，两者相同。
# 示例：network_get_physdev phyDev "wan"  → $phyDev = "eth0"
network_get_physdev() { __network_ifstatus "$1" "$2" ".device"; }


# =============================================================================
# ── 网络设备控制 ──────────────────────────────────────────────────────────────
# =============================================================================

# 暂停 netifd 对指定 Linux 网络设备的操作（defer 模式）
# 参数：$1 - Linux 网络设备名（如 "eth0"，而非逻辑接口名）
# 说明：设置 defer=true 后，netifd 不会对该设备执行任何配置动作，
#       直到调用 network_ready_device 恢复。
#       适用场景：在外部程序配置设备期间，防止 netifd 干扰（如设置 VLAN、债加密等）。
# 示例：network_defer_device eth0
network_defer_device()
{
	ubus call network.device set_state \
		"$(printf '{ "name": "%s", "defer": true }' "$1")" 2>/dev/null
}

# 恢复 netifd 对指定 Linux 网络设备的操作（取消 defer 模式）
# 参数：$1 - Linux 网络设备名（如 "eth0"）
# 说明：与 network_defer_device 配对使用，外部程序完成配置后调用此函数，
#       通知 netifd 恢复对该设备的管理。
# 示例：network_ready_device eth0
network_ready_device()
{
	ubus call network.device set_state \
		"$(printf '{ "name": "%s", "defer": false }' "$1")" 2>/dev/null
}


# =============================================================================
# network_flush_cache() —— 清除接口状态缓存
# =============================================================================
# unset __NETWORK_CACHE 变量，下次调用任何 network_get_* 函数时
# 将重新通过 ubus 查询最新的接口状态。
#
# 适用场景：
#   - 脚本中执行了网络操作（如 ifup/ifdown）后，需要读取最新状态
#   - 长时间运行的脚本中，需要刷新缓存确保数据时效性
#
# 示例：
#   network_get_ipaddr old_ip "wan"
#   ifup wan                          # 触发接口重连
#   network_flush_cache               # 清除旧缓存
#   network_get_ipaddr new_ip "wan"   # 读取重连后的新 IP
# =============================================================================
network_flush_cache() { unset __NETWORK_CACHE; }
