/**
 * @file network.js
 * @description OpenWrt LuCI 网络抽象模块
 *
 * 本模块是 LuCI Web 界面的核心网络库，通过整合来自多个 ubus API 的数据，
 * 为 OpenWrt 的网络配置状态提供统一的抽象层。
 *
 * 主要功能：
 *  - 枚举和管理逻辑网络接口（Network / Protocol）
 *  - 枚举和管理物理网络设备（Device）
 *  - 枚举和管理无线设备及无线网络（WifiDevice / WifiNetwork）
 *  - 提供主机信息查询（Hosts）
 *  - 提供 IP/掩码转换工具函数
 *
 * 依赖模块：
 *  - uci       : UCI 配置读写接口
 *  - rpc       : ubus RPC 调用接口
 *  - validation: IP 地址格式校验
 *  - baseclass : LuCI 基类，提供 extend() 继承机制
 *  - firewall  : 防火墙联动（删除网络时同步清理防火墙规则）
 *
 * 核心类层次：
 *  Network（顶层入口）
 *   ├── Protocol  —— 逻辑接口（UCI interface section）
 *   ├── Device    —— Linux 网络设备（eth0, br-lan 等）
 *   ├── WifiDevice —— 无线射频设备（radio0, radio1 等）
 *   ├── WifiNetwork —— 无线网络虚拟接口（wlan0 等）
 *   └── Hosts     —— 已知主机信息聚合
 *
 * 使用示例（在 LuCI view 或 controller 中）：
 * ─────────────────────────────────────────────────────────
 * // 加载网络模块
 * 'use strict';
 * 'require network';
 *
 * return {
 *   load() {
 *     // 获取所有网络接口，返回 Promise<Protocol[]>
 *     return network.getNetworks();
 *   },
 *   render(networks) {
 *     for (let net of networks) {
 *       console.log(net.getName(), net.getIPAddr(), net.getProtocol());
 *     }
 *   }
 * };
 * ─────────────────────────────────────────────────────────
 */

'use strict';
'require uci';
'require rpc';
'require validation';
'require baseclass';
'require firewall';

/**
 * 协议错误码 → 用户可读错误消息的映射表。
 * 当 ubus 协议处理程序返回这些错误码时，LuCI 会在界面上显示对应的翻译字符串。
 *
 * 常见错误码说明：
 *  - CONNECT_FAILED    : 拨号/连接尝试失败（PPP/PPPoE 等）
 *  - INVALID_ADDRESS   : IP 地址格式非法
 *  - INVALID_GATEWAY   : 网关地址非法
 *  - MISSING_ADDRESS   : 未配置 IP 地址
 *  - NO_DEVICE         : 找不到对应的网络设备
 *  - NO_IFACE/NO_IFNAME: 无法确定设备名称
 *  - NO_WAN_ADDRESS    : 无法获取外部 IP（常见于 PPPoE/DHCP 未完成时）
 *  - PIN_FAILED        : 移动网络 SIM 卡 PIN 码被拒绝
 */
const proto_errors = {
	CONNECT_FAILED:			_('Connection attempt failed'),
	INVALID_ADDRESS:		_('IP address is invalid'),
	INVALID_GATEWAY:		_('Gateway address is invalid'),
	INVALID_LOCAL_ADDRESS:	_('Local IP address is invalid'),
	MISSING_ADDRESS:		_('IP address is missing'),
	MISSING_PEER_ADDRESS:	_('Peer address is missing'),
	NO_DEVICE:				_('Network device is not present'),
	NO_IFACE:				_('Unable to determine device name'),
	NO_IFNAME:				_('Unable to determine device name'),
	NO_WAN_ADDRESS:			_('Unable to determine external IP address'),
	NO_WAN_LINK:			_('Unable to determine upstream interface'),
	PEER_RESOLVE_FAIL:		_('Unable to resolve peer host name'),
	PIN_FAILED:				_('PIN code rejected')
};

/**
 * 需要忽略的网络接口名称正则列表。
 * 这些接口通常由内核模块隐式创建，不适合出现在网络配置界面中：
 *  - wmaster*  : 旧版 mac80211 主设备（已废弃）
 *  - wifi*     : 虚拟 WiFi 接口
 *  - hwsim*    : 内核无线仿真设备（用于测试）
 *  - imq*      : 中间队列设备（IMQ，用于 QoS）
 *  - ifb*      : 中间功能块设备（IFB，用于流量整形）
 *  - mon.wlan* : 无线监控模式接口
 *  - sit*      : IPv6-in-IPv4 隧道（Simple Internet Transition）
 *  - gre*      : GRE 隧道设备
 *  - gretap*   : GRE TAP 隧道
 *  - ip6gre*   : IPv6 GRE 隧道
 *  - ip6tnl*   : IPv6 隧道
 *  - tunl*     : IPIP 隧道
 *  - lo        : 本地回环接口
 */
const iface_patterns_ignore = [
	/^wmaster\d+/,
	/^wifi\d+/,
	/^hwsim\d+/,
	/^imq\d+/,
	/^ifb\d+/,
	/^mon\.wlan\d+/,
	/^sit\d+/,
	/^gre\d+/,
	/^gretap\d+/,
	/^ip6gre\d+/,
	/^ip6tnl\d+/,
	/^tunl\d+/,
	/^lo$/
];

/**
 * 用于识别无线网络接口名称的正则模式列表：
 *  - wlan*          : 标准 Linux mac80211 无线接口（如 wlan0、wlan1）
 *  - wl*            : Broadcom 无线驱动接口（如 wl0）
 *  - ath*           : Atheros/ath9k 驱动接口（如 ath0）
 *  - *.network*     : LuCI 内部无线网络 ID（如 radio0.network1）
 */
const iface_patterns_wireless = [
	/^wlan\d+/,
	/^wl\d+/,
	/^ath\d+/,
	/^\w+\.network\d+/
];

/**
 * 用于识别虚拟接口名称的正则模式列表（默认为空）。
 * 可通过 Network.registerPatternVirtual() 动态追加自定义模式，
 * 例如将 6in4-wan、tun0 等标记为虚拟接口。
 */
const iface_patterns_virtual = [ ];

// ─────────────────────────────────────────────────────────────────────────────
// ubus RPC 调用声明
// 以下常量均通过 rpc.declare() 声明为可调用的异步函数，
// 调用后返回 Promise，resolve 值为对应的 expect 字段内容。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 调用 luci-rpc 的 getNetworkDevices 方法，
 * 获取当前系统中所有 Linux 网络设备的状态信息
 * （IP 地址、MAC、统计数据、MTU 等）。
 * 结果为 { [设备名]: { ... } } 的对象。
 */
const callLuciNetworkDevices = rpc.declare({
	object: 'luci-rpc',
	method: 'getNetworkDevices',
	expect: { '': {} }
});

/**
 * 调用 luci-rpc 的 getWirelessDevices 方法，
 * 获取所有无线射频设备（radio）及其关联的无线网络（wifi-iface）的运行时状态。
 * 结果为 { [radio名]: { interfaces: [...], ... } } 的对象。
 */
const callLuciWirelessDevices = rpc.declare({
	object: 'luci-rpc',
	method: 'getWirelessDevices',
	expect: { '': {} }
});

/**
 * 调用 luci-rpc 的 getBoardJSON 方法，
 * 获取 /etc/board.json 中记录的硬件板级信息，
 * 包含交换机拓扑（switch）、DSL modem 类型等。
 */
const callLuciBoardJSON = rpc.declare({
	object: 'luci-rpc',
	method: 'getBoardJSON'
});

/**
 * 调用 luci-rpc 的 getHostHints 方法，
 * 聚合来自 DHCP 租约、ARP 表、IPv6 邻居等多个来源的主机信息，
 * 结果为 { [MAC地址]: { name, ipaddrs, ip6addrs } } 的对象。
 */
const callLuciHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

/**
 * 调用 iwinfo 的 assoclist 方法，
 * 获取指定无线设备上已关联（已连接）的客户端列表。
 * 参数：device（无线接口名）、mac（可选，过滤指定 MAC）
 * 结果为关联客户端信息数组。
 */
const callIwinfoAssoclist = rpc.declare({
	object: 'iwinfo',
	method: 'assoclist',
	params: [ 'device', 'mac' ],
	expect: { results: [] }
});

/**
 * 调用 iwinfo 的 scan 方法，
 * 对指定无线设备执行无线网络扫描，返回周围可见的 AP 列表。
 * nobatch: true 表示此调用不会被合并进批量 RPC 请求（因为扫描耗时较长）。
 */
const callIwinfoScan = rpc.declare({
	object: 'iwinfo',
	method: 'scan',
	params: [ 'device' ],
	nobatch: true,
	expect: { results: [] }
});

/**
 * 调用 network.interface 的 dump 方法，
 * 获取 netifd（网络接口守护进程）管理的所有逻辑接口的运行时状态，
 * 包含 IP 地址、路由、uptime、协议等信息。
 * 结果为接口状态对象数组。
 */
const callNetworkInterfaceDump = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { 'interface': [] }
});

/**
 * 调用 network 的 get_proto_handlers 方法，
 * 获取系统上已安装的所有协议处理程序（如 dhcp、pppoe、static 等）
 * 及其能力描述（是否需要设备、是否浮动等）。
 * 结果为 { [协议名]: { no_device: bool, ... } } 的对象。
 */
const callNetworkProtoHandlers = rpc.declare({
	object: 'network',
	method: 'get_proto_handlers',
	expect: { '': {} }
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块级状态变量（私有，模块内部使用）
// ─────────────────────────────────────────────────────────────────────────────

/** 初始化 Promise（用于防止重复并行初始化） */
let _init = null;

/** 当前网络运行时状态缓存对象，由 initNetworkState() 填充 */
let _state = null;

/** 已注册的协议类映射：{ [协议名]: Protocol子类构造函数 } */
const _protocols = {};

/** 协议规格描述映射：{ [协议名]: { no_device, ... } }，来自 ubus */
const _protospecs = {};

/**
 * 【内部函数】获取并加载所有协议处理程序。
 *
 * 执行流程：
 *  1. 调用 ubus 获取系统已安装的协议列表（如 dhcp、pppoe、static）
 *  2. 过滤掉 bonding 协议（LuCI 不支持）
 *  3. 补充缺失的内置协议（none、relay）
 *  4. 保存协议规格到 _protospecs
 *  5. 动态 require 每个协议对应的 JS 模块（如 protocol/dhcp.js）
 *
 * @returns {Promise<Object>} 协议规格对象
 */
function getProtocolHandlers() {
	return callNetworkProtoHandlers().then(function(protos) {
		/* Prevent attempt to load "protocol/bonding" */
		delete protos.bonding;

		/* Register "none" protocol */
		if (!protos.hasOwnProperty('none'))
			Object.assign(protos, { none: { no_device: false } });

		/* Hack: emulate relayd protocol */
		if (!protos.hasOwnProperty('relay') && L.hasSystemFeature('relayd'))
			Object.assign(protos, { relay: { no_device: true } });

		Object.assign(_protospecs, protos);

		return Promise.all(Object.keys(protos).map(function(p) {
			return Promise.resolve(L.require('protocol.%s'.format(p))).catch(function(err) {
				if (L.isObject(err) && err.name != 'NetworkError')
					L.error(err);
			});
		})).then(function() {
			return protos;
		});
	}).catch(function() {
		return {};
	});
}

/**
 * 【内部函数】根据 UCI section ID 查找对应的无线接口运行时状态。
 *
 * @param {string} sid - UCI wireless section 的名称（如 'wifinet0'）
 * @returns {null|Array} 若找到则返回 [radioName, radioState, netState]，
 *                       否则返回 null。
 *
 * 注意：若 UCI section 是命名 section 但运行时以匿名方式（@开头）记录，
 *       则视为不匹配，返回 null。
 */
function getWifiStateBySid(sid) {
	const s = uci.get('wireless', sid);

	if (s != null && s['.type'] == 'wifi-iface') {
		for (let radioname in _state.radios) {
			for (let netstate of _state.radios[radioname].interfaces) {

				if (typeof(netstate.section) != 'string')
					continue;

				const s2 = uci.get('wireless', netstate.section);

				if (s2 != null && s['.type'] == s2['.type'] && s['.name'] == s2['.name']) {
					if (s2['.anonymous'] == false && netstate.section.charAt(0) == '@')
						return null;

					return [ radioname, _state.radios[radioname], netstate ];
				}
			}
		}
	}

	return null;
}

/**
 * 【内部函数】根据 Linux 接口名（如 wlan0）查找对应的无线接口运行时状态。
 *
 * @param {string} ifname - Linux 网络接口名
 * @returns {null|Array} 若找到则返回 [radioName, radioState, netState]，
 *                       否则返回 null。
 */
function getWifiStateByIfname(ifname) {
	for (let radioname in _state.radios) {
		for (let netstate of _state.radios[radioname].interfaces) {

			if (typeof(netstate.ifname) != 'string')
				continue;

			if (netstate.ifname == ifname)
				return [ radioname, _state.radios[radioname], netstate ];
		}
	}

	return null;
}

/**
 * 【内部函数】判断给定接口名是否为无线接口（根据 iface_patterns_wireless 匹配）。
 *
 * @param {string} ifname - 接口名称
 * @returns {boolean} 是无线接口返回 true，否则 false
 */
function isWifiIfname(ifname) {
	for (let ifp of iface_patterns_wireless)
		if (ifp.test(ifname))
			return true;

	return false;
}

/**
 * 【内部函数】将无线网络 ID（如 "radio0.network1"）转换为 UCI section 名。
 *
 * 规则：解析 "radio设备名.network序号" 格式，找到该 radio 下第 N 个
 *       wifi-iface section 的名称。
 *
 * @param {string} netid - 网络 ID，格式为 "radio0.network1"
 * @returns {null|string} UCI section 名，找不到则返回 null
 */
function getWifiSidByNetid(netid) {
	const m = /^(\w+)\.network(\d+)$/.exec(netid);
	if (m) {
		const sections = uci.sections('wireless', 'wifi-iface');
		let n = 0;
		for (let s of sections) {
			if (s.device != m[1])
				continue;

			if (++n == +m[2])
				return s['.name'];
		}
	}

	return null;
}

/**
 * 【内部函数】根据 Linux 接口名或网络 ID 查找对应的 UCI section 名。
 *
 * 查找顺序：
 *  1. 先尝试把 ifname 当作 netid（如 radio0.network1）解析
 *  2. 再通过运行时状态反查 UCI section
 *
 * @param {string} ifname - Linux 接口名（如 wlan0）或网络 ID
 * @returns {null|string} UCI section 名，找不到则返回 null
 */
function getWifiSidByIfname(ifname) {
	const sid = getWifiSidByNetid(ifname);

	if (sid != null)
		return sid;

	const res = getWifiStateByIfname(ifname);

	if (res != null && L.isObject(res[2]) && typeof(res[2].section) == 'string')
		return res[2].section;

	return null;
}

/**
 * 【内部函数】根据 UCI section 名（sid）生成无线网络 ID。
 *
 * 网络 ID 格式为 "radio设备名.network序号"，其中序号是该 wifi-iface
 * 在同一 radio 下的排列顺序（从 1 开始）。
 *
 * @param {string} sid - UCI wireless section 名
 * @returns {null|Array} [netid, radioname] 或 null（找不到时）
 *
 * 示例：
 *   getWifiNetidBySid('wifinet0') → ['radio0.network1', 'radio0']
 */
function getWifiNetidBySid(sid) {
	const s = uci.get('wireless', sid);
	if (s != null && s['.type'] == 'wifi-iface') {
		const radioname = s.device;
		if (typeof(radioname) == 'string') {
			const sections = uci.sections('wireless', 'wifi-iface');
			let n = 0;
			for (let sec of sections) {
				if (sec.device != radioname)
					continue;

				n++;

				if (sec['.name'] != s['.name'])
					continue;

				return [ '%s.network%d'.format(s.device, n), s.device ];
			}

		}
	}

	return null;
}

/**
 * 【内部函数】根据逻辑网络名（如 'lan'）查找关联的无线网络 ID。
 *
 * UCI wifi-iface 的 network 选项可包含多个逻辑网络名（空格分隔），
 * 此函数遍历所有 wifi-iface section，找到包含指定网络名的条目。
 *
 * @param {string} name - 逻辑网络名（如 'lan'、'wan'）
 * @returns {null|Array} [netid, radioname] 或 null
 */
function getWifiNetidByNetname(name) {
	const sections = uci.sections('wireless', 'wifi-iface');
	for (let s of sections) {
		if (typeof(s.network) != 'string')
			continue;

		const nets = s.network.split(/\s+/);
		for (let n of nets) {
			if (n != name)
				continue;

			return getWifiNetidBySid(s['.name']);
		}
	}

	return null;
}

/**
 * 【内部函数】判断给定接口名是否为虚拟接口（匹配 iface_patterns_virtual）。
 *
 * @param {string} ifname - 接口名称
 * @returns {boolean} 是虚拟接口返回 true
 */
function isVirtualIfname(ifname) {
	for (let nfp of iface_patterns_virtual)
		if (nfp.test(ifname))
			return true;

	return false;
}

/**
 * 【内部函数】判断给定接口名是否应被忽略（匹配 iface_patterns_ignore）。
 * 忽略的接口不会出现在 LuCI 的设备列表中。
 *
 * @param {string} ifname - 接口名称
 * @returns {boolean} 应忽略返回 true
 */
function isIgnoredIfname(ifname) {
	for (let nfpi of iface_patterns_ignore)
		if (nfpi.test(ifname))
			return true;

	return false;
}

/**
 * 【内部函数】向 UCI 选项的值列表中追加一个值（如果不存在）。
 *
 * 此函数同时支持数组类型（UCI list）和空格分隔字符串类型的选项，
 * 追加前会检查值是否已存在以避免重复。
 *
 * @param {string} config  - UCI 配置名（如 'network'）
 * @param {string} section - UCI section 名
 * @param {string} option  - UCI 选项名
 * @param {string} value   - 要追加的值
 * @returns {boolean} 若值被追加（之前不存在）返回 true，否则 false
 *
 * 示例：
 *   // 向 network.lan 的 ifname 列表追加 eth1
 *   appendValue('network', 'lan', 'ifname', 'eth1');
 */
function appendValue(config, section, option, value) {
	let values = uci.get(config, section, option);
	const isArray = Array.isArray(values);
	let rv = false;

	if (isArray == false)
		values = L.toArray(values);

	if (values.indexOf(value) == -1) {
		values.push(value);
		rv = true;
	}

	uci.set(config, section, option, isArray ? values : values.join(' '));

	return rv;
}

/**
 * 【内部函数】从 UCI 选项的值列表中移除指定值。
 *
 * 支持数组类型和空格分隔字符串类型。若移除后列表为空，
 * 则自动 unset 该选项（删除整个选项）。
 *
 * @param {string} config  - UCI 配置名
 * @param {string} section - UCI section 名
 * @param {string} option  - UCI 选项名
 * @param {string} value   - 要移除的值
 * @returns {boolean} 若值被移除返回 true，若值不存在返回 false
 *
 * 示例：
 *   // 从 network.lan 的 ifname 列表中移除 eth1
 *   removeValue('network', 'lan', 'ifname', 'eth1');
 */
function removeValue(config, section, option, value) {
	let values = uci.get(config, section, option);
	const isArray = Array.isArray(values);
	let rv = false;

	if (isArray == false)
		values = L.toArray(values);

	for (let i = values.length - 1; i >= 0; i--) {
		if (values[i] == value) {
			values.splice(i, 1);
			rv = true;
		}
	}

	if (values.length > 0)
		uci.set(config, section, option, isArray ? values : values.join(' '));
	else
		uci.unset(config, section, option);

	return rv;
}

/**
 * 【内部函数】将前缀长度（CIDR bits）转换为子网掩码字符串。
 *
 * @param {number} bits - 前缀位数（IPv4: 0-32，IPv6: 0-128）
 * @param {boolean} v6  - true 表示 IPv6，false 表示 IPv4
 * @returns {null|string} 掩码字符串，超出范围返回 null
 *
 * 示例：
 *   prefixToMask(24, false)  → '255.255.255.0'
 *   prefixToMask(48, true)   → 'ffff:ffff:ffff::'
 *   prefixToMask(33, false)  → null（超出 IPv4 最大值 32）
 */
function prefixToMask(bits, v6) {
	const w = v6 ? 128 : 32;
	const m = [];

	if (bits > w)
		return null;

	for (let i = 0; i < w / 16; i++) {
		const b = Math.min(16, bits);
		m.push((0xffff << (16 - b)) & 0xffff);
		bits -= b;
	}

	if (v6)
		return String.prototype.format.apply('%x:%x:%x:%x:%x:%x:%x:%x', m).replace(/:0(?::0)+$/, '::');
	else
		return '%d.%d.%d.%d'.format(m[0] >>> 8, m[0] & 0xff, m[1] >>> 8, m[1] & 0xff);
}

/**
 * 【内部函数】将子网掩码字符串转换为前缀长度（CIDR bits）。
 * 掩码必须是连续 1 后跟全 0 的合法形式，否则返回 null。
 *
 * @param {string} mask  - 掩码字符串（如 '255.255.255.0' 或 'ffff:ffff::'）
 * @param {boolean} v6   - true 表示 IPv6，false 表示 IPv4
 * @returns {null|number} 前缀位数，非法掩码返回 null
 *
 * 示例：
 *   maskToPrefix('255.255.255.0', false) → 24
 *   maskToPrefix('255.255.0.1', false)   → null（非法掩码）
 */
function maskToPrefix(mask, v6) {
	const m = v6 ? validation.parseIPv6(mask) : validation.parseIPv4(mask);

	if (!m)
		return null;

	let bits = 0;

	for (let i = 0, z = false; i < m.length; i++) {
		z = z || !m[i];

		while (!z && (m[i] & (v6 ? 0x8000 : 0x80))) {
			m[i] = (m[i] << 1) & (v6 ? 0xffff : 0xff);
			bits++;
		}

		if (m[i])
			return null;
	}

	return bits;
}

/**
 * 【内部函数】初始化（或刷新）网络运行时状态缓存 _state。
 *
 * 这是模块的核心初始化函数，首次调用时并行发起以下 ubus/UCI 请求：
 *  1. callNetworkInterfaceDump()  → netifd 逻辑接口状态
 *  2. callLuciBoardJSON()         → 板级信息（交换机、DSL 等）
 *  3. callLuciNetworkDevices()    → Linux 网络设备信息
 *  4. callLuciWirelessDevices()   → 无线设备运行时状态
 *  5. callLuciHostHints()         → 主机信息（MAC/IP/主机名）
 *  6. getProtocolHandlers()       → 协议处理程序
 *  7. uci.load('network')         → 加载 /etc/config/network
 *  8. uci.load('wireless')        → 加载 /etc/config/wireless（若有 WiFi）
 *  9. uci.load('luci')            → 加载 /etc/config/luci
 *
 * 填充后的 _state 结构：
 * {
 *   isTunnel:  { [ifname]: true }    // 虚拟/隧道接口标记
 *   isBridge:  { [ifname]: true }    // 桥接接口标记
 *   isSwitch:  { [ifname]: true }    // 交换机端口标记
 *   isWifi:    { [ifname]: true }    // 无线接口标记
 *   ifaces:    [...]                 // netifd 接口状态数组
 *   radios:    { [radio]: {...} }    // 无线 radio 状态
 *   hosts:     { [mac]: {...} }      // 主机信息
 *   netdevs:   { [ifname]: {...} }   // 网络设备详情
 *   bridges:   { [ifname]: {...} }   // 网桥信息
 *   switches:  { [name]: {...} }     // 交换机拓扑
 *   hostapd:   { [ifname]: {...} }   // hostapd 能力信息
 *   hasDSLModem: {...}               // DSL modem 信息（若存在）
 * }
 *
 * @param {boolean} [refresh=false] - 为 true 时强制刷新缓存
 * @returns {Promise<Object>} 网络状态对象
 */
function initNetworkState(refresh) {
	if (_state == null || refresh) {
		const hasWifi = L.hasSystemFeature('wifi');

		if (refresh || !_init) {
			_init = Promise.all([
			L.resolveDefault(callNetworkInterfaceDump(), []),
			L.resolveDefault(callLuciBoardJSON(), {}),
			L.resolveDefault(callLuciNetworkDevices(), {}),
			L.resolveDefault(callLuciWirelessDevices(), {}),
			L.resolveDefault(callLuciHostHints(), {}),
			getProtocolHandlers(),
			L.resolveDefault(uci.load('network')),
			hasWifi ? L.resolveDefault(uci.load('wireless')) : L.resolveDefault(),
			L.resolveDefault(uci.load('luci'))
		]).then(function([netifd_ifaces, board_json, luci_devs, radios, hosts]) {

			const s = {
				isTunnel: {}, isBridge: {}, isSwitch: {}, isWifi: {},
				ifaces: netifd_ifaces, radios: radios, hosts: hosts,
				netdevs: {}, bridges: {}, switches: {}, hostapd: {}
			};

			for (let name in luci_devs) {
				const dev = luci_devs[name];

				if (isVirtualIfname(name))
					s.isTunnel[name] = true;

				if (!s.isTunnel[name] && isIgnoredIfname(name))
					continue;

				s.netdevs[name] = s.netdevs[name] || {
					idx:      dev.ifindex,
					name:     name,
					rawname:  name,
					flags:    dev.flags,
					link:     dev.link,
					stats:    dev.stats,
					macaddr:  dev.mac,
					pse:      dev?.pse,
					type:     dev.type,
					devtype:  dev.devtype,
					mtu:      dev.mtu,
					qlen:     dev.qlen,
					wireless: dev.wireless,
					parent:   dev.parent,
					ipaddrs:  [],
					ip6addrs: []
				};

				if (Array.isArray(dev.ipaddrs))
					for (let ip of dev.ipaddrs)
						s.netdevs[name].ipaddrs.push(ip.address + '/' + ip.netmask);

				if (Array.isArray(dev.ip6addrs))
					for (let ip6 of dev.ip6addrs)
						s.netdevs[name].ip6addrs.push(ip6.address + '/' + ip6.netmask);
			}

			for (let name in luci_devs) {
				const dev = luci_devs[name];

				if (!dev.bridge)
					continue;

				const b = {
					name:    name,
					id:      dev.id,
					stp:     dev.stp,
					ifnames: []
				};

				for (let port of dev.ports) {
					const subdev = s.netdevs[port];

					if (subdev == null)
						continue;

					b.ifnames.push(subdev);
					subdev.bridge = b;
				}

				s.bridges[name] = b;
				s.isBridge[name] = true;
			}

			for (let name in luci_devs) {
				const dev = luci_devs[name];

				if (!dev.parent || dev.devtype != 'dsa')
					continue;

				s.isSwitch[dev.parent] = true;
				s.isSwitch[name] = true;
			}

			if (L.isObject(board_json.switch)) {
				for (let switchname in board_json.switch) {
					const layout = board_json.switch[switchname];
					const netdevs = {};
					const nports = {};
					const ports = [];
					let pnum = null;
					let role = null;

					if (L.isObject(layout) && Array.isArray(layout.ports)) {
						for (let port of layout.ports) {
							if (typeof(port) == 'object' && typeof(port.num) == 'number' &&
								(typeof(port.role) == 'string' || typeof(port.device) == 'string')) {
								const spec = {
									num:   port.num,
									role:  port.role || 'cpu',
									index: (port.index != null) ? port.index : port.num
								};

								if (port.device != null) {
									spec.device = port.device;
									spec.tagged = spec.need_tag;
									netdevs[port.num] = port.device;
								}

								ports.push(spec);

								if (port.role != null)
									nports[port.role] = (nports[port.role] || 0) + 1;
							}
						}

						ports.sort(function(a, b) {
							return L.naturalCompare(a.role, b.role) || L.naturalCompare(a.index, b.index);
						});

						for (let port of ports) {
							if (port.role != role) {
								role = port.role;
								pnum = 1;
							}

							if (role == 'cpu')
								port.label = 'CPU (%s)'.format(port.device);
							else if (nports[role] > 1)
								port.label = '%s %d'.format(role.toUpperCase(), pnum++);
							else
								port.label = role.toUpperCase();

							delete port.role;
							delete port.index;
						}

						s.switches[switchname] = {
							ports: ports,
							netdevs: netdevs
						};
					}
				}
			}

			if (L.isObject(board_json.dsl) && L.isObject(board_json.dsl.modem)) {
				s.hasDSLModem = board_json.dsl.modem;
			}

			_init = null;

			const objects = [];

			if (L.isObject(s.radios))
				for (let radio in s.radios)
					if (L.isObject(s.radios[radio]) && Array.isArray(s.radios[radio].interfaces))
						for (let ri of s.radios[radio].interfaces)
							if (L.isObject(ri) && ri.ifname)
								objects.push('hostapd.%s'.format(ri.ifname));

			return (objects.length ? L.resolveDefault(rpc.list.apply(rpc, objects), {}) : Promise.resolve({})).then(function(res) {
				for (let k in res) {
					const m = k.match(/^hostapd\.(.+)$/);
					if (m)
						s.hostapd[m[1]] = res[k];
				}

				return (_state = s);
			});
		});
		} // end if (refresh || !_init)

	}

	if (refresh)
		return _init;

	return (_state != null ? Promise.resolve(_state) : _init);
}

/**
 * 【内部函数】从各种对象类型中提取 Linux 接口名称字符串。
 *
 * 支持的输入类型：
 *  - Protocol 实例   → 调用 getIfname()
 *  - Device 实例     → 调用 getName()
 *  - WifiDevice 实例 → 调用 getName()
 *  - WifiNetwork 实例→ 调用 getIfname()
 *  - 字符串          → 去掉冒号及后面的部分（如 'eth0:1' → 'eth0'）
 *
 * @param {*} obj - 任意对象或字符串
 * @returns {null|string} 接口名，无法识别时返回 null
 */
function ifnameOf(obj) {
	if (obj instanceof Protocol)
		return obj.getIfname();
	else if (obj instanceof Device)
		return obj.getName();
	else if (obj instanceof WifiDevice)
		return obj.getName();
	else if (obj instanceof WifiNetwork)
		return obj.getIfname();
	else if (typeof(obj) == 'string')
		return obj.replace(/:.+$/, '');

	return null;
}

/**
 * 【内部函数】按网络名称自然排序的比较函数，用于 Array.sort()。
 * 排序规则：自然顺序（数字部分按数值比较，如 lan < wan < wan2）
 */
function networkSort(a, b) {
	return L.naturalCompare(a.getName(), b.getName());
}

/**
 * 【内部函数】设备排序比较函数。
 * 排序优先级（权重）：
 *  - 普通设备（ethernet 等）: 权重 1（最先）
 *  - WiFi 虚拟设备: 权重 2
 *  - alias 别名设备: 权重 3（最后）
 * 同权重内按设备名自然排序。
 */
function deviceSort(a, b) {
	const typeWeight = { wifi: 2, alias: 3 };

	return L.naturalCompare(typeWeight[a.getType()] || 1, typeWeight[b.getType()] || 1) ||
	       L.naturalCompare(a.getName(), b.getName());
}

/**
 * 【内部函数】将无线加密信息对象转换为人类可读的描述字符串。
 *
 * 支持的加密类型：
 *  - 无加密  → 'None'
 *  - WEP     → 'WEP Open System (WEP-40)' 等
 *  - WPA/WPA2/WPA3 → 'WPA2 PSK (CCMP)' / 'mixed WPA/WPA2 PSK (TKIP, CCMP)' 等
 *  - 未知    → 'Unknown'
 *
 * @param {Object} enc - WifiEncryption 加密信息对象（来自 iwinfo）
 * @returns {null|string} 可读描述字符串，enc 无效时返回 null
 *
 * 示例：
 *   formatWifiEncryption({ enabled: false })
 *   → 'None'
 *
 *   formatWifiEncryption({ enabled: true, wpa: [2], authentication: ['psk'], ciphers: ['ccmp'] })
 *   → 'WPA2 PSK (CCMP)'
 *
 *   formatWifiEncryption({ enabled: true, wpa: [1,2], authentication: ['psk'], ciphers: ['tkip','ccmp'] })
 *   → 'mixed WPA/WPA2 PSK (TKIP, CCMP)'
 */
function formatWifiEncryption(enc) {
	if (!L.isObject(enc))
		return null;

	if (!enc.enabled)
		return 'None';

	const ciphers = Array.isArray(enc.ciphers)
		? enc.ciphers.map(function(c) { return c.toUpperCase() }) : [ 'NONE' ];

	if (Array.isArray(enc.wep)) {
		let has_open = false;
		let has_shared = false;

		for (let wencr of enc.wep)
			if (wencr == 'open')
				has_open = true;
			else if (wencr == 'shared')
				has_shared = true;

		if (has_open && has_shared)
			return 'WEP Open/Shared (%s)'.format(ciphers.join(', '));
		else if (has_open)
			return 'WEP Open System (%s)'.format(ciphers.join(', '));
		else if (has_shared)
			return 'WEP Shared Auth (%s)'.format(ciphers.join(', '));

		return 'WEP';
	}

	if (Array.isArray(enc.wpa)) {
		const versions = [];
		const suites = Array.isArray(enc.authentication)
			? enc.authentication.map(function(a) { return a.toUpperCase() }) : [ 'NONE' ];

		for (let encr of enc.wpa)
			switch (encr) {
			case 1:
				versions.push('WPA');
				break;

			default:
				versions.push('WPA%d'.format(encr));
				break;
			}

		if (versions.length > 1)
			return 'mixed %s %s (%s)'.format(versions.join('/'), suites.join(', '), ciphers.join(', '));

		return '%s %s (%s)'.format(versions[0], suites.join(', '), ciphers.join(', '));
	}

	return 'Unknown';
}

/**
 * 【内部函数】枚举所有已知网络接口，返回排序后的 Protocol 实例数组。
 *
 * 数据来源合并（取并集）：
 *  1. /etc/config/network 中的 interface section（UCI 已配置的接口）
 *  2. netifd 运行时报告的接口（可能包含动态创建的、不在 UCI 中的接口）
 *
 * @returns {Array<Protocol>} 按名称自然排序的协议实例数组
 */
function enumerateNetworks() {
	const uciInterfaces = uci.sections('network', 'interface');
	const networks = {};

	for (let intf of uciInterfaces)
		networks[intf['.name']] = this.instantiateNetwork(intf['.name']);

	for (let ifstate of _state.ifaces)
		if (networks[ifstate.interface] == null)
			networks[ifstate.interface] =
				this.instantiateNetwork(ifstate.interface, ifstate.proto);

	const rv = [];

	for (let network in networks)
		if (networks.hasOwnProperty(network))
			rv.push(networks[network]);

	rv.sort(networkSort);

	return rv;
}


let Hosts, Network, Protocol, Device, WifiDevice, WifiNetwork, WifiVlan;

// ═════════════════════════════════════════════════════════════════════════════
//  Network 类 —— 顶层入口，所有网络操作的起点
//
//  【完整使用示例】
//
//  ① 获取所有逻辑接口并打印基本信息：
//  ─────────────────────────────────────────────────────────────────────────
//  'use strict';
//  'require network';
//  return network.getNetworks().then(function(networks) {
//    for (let net of networks) {
//      console.log(
//        '接口:', net.getName(),          // 'lan' / 'wan'
//        '协议:', net.getProtocol(),      // 'static' / 'dhcp' / 'pppoe'
//        'IP:',   net.getIPAddr(),        // '192.168.1.1'
//        '网关:', net.getGatewayAddr(),   // '10.0.0.1'
//        '运行时间(秒):', net.getUptime()
//      );
//    }
//  });
//
//  ② 添加一个新的静态 IP 网络接口：
//  ─────────────────────────────────────────────────────────────────────────
//  network.addNetwork('mynet', {
//    proto: 'static',
//    ipaddr: '10.0.0.1',
//    netmask: '255.255.255.0'
//  }).then(function(proto) {
//    if (proto) {
//      console.log('新接口已创建:', proto.getName());
//      return uci.save(); // 保存 UCI 配置
//    }
//  });
//
//  ③ 删除一个网络接口（同时清理防火墙和 DHCP 配置）：
//  ─────────────────────────────────────────────────────────────────────────
//  network.deleteNetwork('mynet').then(function(success) {
//    if (success) uci.save();
//  });
//
//  ④ 枚举所有无线设备及其关联网络：
//  ─────────────────────────────────────────────────────────────────────────
//  network.getWifiDevices().then(function(radios) {
//    for (let radio of radios) {
//      console.log('射频设备:', radio.getName()); // 'radio0'
//      for (let wifiNet of radio.getWifiNetworks()) {
//        console.log(
//          '  SSID:', wifiNet.getActiveSSID(),
//          '  信号:', wifiNet.getSignal(), 'dBm',
//          '  信道:', wifiNet.getChannel()
//        );
//      }
//    }
//  });
//
//  ⑤ 查询 IP/掩码转换工具：
//  ─────────────────────────────────────────────────────────────────────────
//  network.prefixToMask(24, false)          → '255.255.255.0'
//  network.prefixToMask(64, true)           → 'ffff:ffff:ffff:ffff::'
//  network.maskToPrefix('255.255.255.0', false) → 24
//
//  ⑥ 主机信息查询（DHCP 客户端 / ARP 表）：
//  ─────────────────────────────────────────────────────────────────────────
//  network.getHostHints().then(function(hosts) {
//    const hostname = hosts.getHostnameByMACAddr('aa:bb:cc:dd:ee:ff');
//    const ip       = hosts.getIPAddrByMACAddr('aa:bb:cc:dd:ee:ff');
//    const mac      = hosts.getMACAddrByIPAddr('192.168.1.100');
//    console.log(hostname, ip, mac);
//  });
//
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @class network
 * @memberof LuCI
 * @hideconstructor
 * @classdesc
 *
 * `LuCI.network` 类整合来自多个 `ubus` API 的数据，
 * 为当前网络配置状态提供统一的抽象层。
 *
 * 提供枚举接口与设备、查询当前配置详情以及修改配置设置等功能。
 */
Network = baseclass.extend(/** @lends LuCI.network.prototype */ {
	/**
	 * 将前缀位数（CIDR）转换为子网掩码字符串。
	 *
	 * @function
	 *
	 * @param {number} bits
	 * 前缀位数（IPv4: 0-32，IPv6: 0-128）。
	 *
	 * @param {boolean} [v6=false]
	 * 为 `false` 时转换为 IPv4 掩码，为 `true` 时转换为 IPv6 掩码。
	 *
	 * @returns {null|string}
	 * 返回对应的掩码字符串；若位数超出最大值（IPv4: 32，IPv6: 128）则返回 `null`。
	 * 示例：prefixToMask(24, false) → '255.255.255.0'
	 */
	prefixToMask: prefixToMask,

	/**
	 * 将子网掩码字符串转换为前缀位数（CIDR）。
	 *
	 * @function
	 *
	 * @param {string} netmask
	 * 要转换的掩码字符串（如 '255.255.255.0'）。
	 *
	 * @param {boolean} [v6=false]
	 * 为 `false` 时解析为 IPv4 掩码，为 `true` 时解析为 IPv6 掩码。
	 *
	 * @returns {null|number}
	 * 返回对应的前缀位数；掩码格式非法时返回 `null`。
	 * 示例：maskToPrefix('255.255.255.0', false) → 24
	 */
	maskToPrefix: maskToPrefix,

	/**
	 * 加密信息条目，描述当前无线加密的配置，
	 * 包括使用的密钥管理协议、加密套件和协议版本。
	 *
	 * @typedef {Object<string, boolean|Array<number|string>>} LuCI.network.WifiEncryption
	 * @memberof LuCI.network
	 *
	 * @property {boolean} enabled
	 * 指定是否启用了任意加密（如 `WEP` 或 `WPA`）。
	 * 若为 `false` 则表示网络处于开放模式（无加密）。
	 *
	 * @property {string[]} [wep]
	 * 若存在 `wep` 属性，表示网络使用 WEP 加密。
	 * 值为活动 WEP 模式的数组，可能为 `'open'`、`'shared'` 或两者均有。
	 *
	 * @property {number[]} [wpa]
	 * 若存在 `wpa` 属性，表示网络使用 WPA 安全加密。
	 * 值为使用的 WPA 版本数组，如 `[1, 2]` 表示 WPA/WPA2 混合模式，`[3]` 表示 WPA3-SAE。
	 *
	 * @property {string[]} [authentication]
	 * `authentication` 属性仅适用于 WPA 加密，与 `wpa` 属性同时存在。
	 * 值为网络使用的认证套件数组，如 `['psk']` 表示 WPA(2)-PSK，`['psk', 'sae']` 表示 WPA2-PSK/WPA3-SAE 混合。
	 *
	 * @property {string[]} [ciphers]
	 * 当 WEP 或 WPA 加密激活时，`ciphers` 属性为活动加密算法的数组，
	 * 如 WPA/WPA2-PSK 混合为 `['tkip', 'ccmp']`，WEP 为 `['wep-40', 'wep-104']`。
	 */

	/**
	 * 将 {@link LuCI.network.WifiEncryption 加密信息对象} 转换为人类可读的字符串，
	 * 如 `'mixed WPA/WPA2 PSK (TKIP, CCMP)'` 或 `'WPA3 SAE (CCMP)'`。
	 *
	 * @function
	 *
	 * @param {LuCI.network.WifiEncryption} encryption
	 * 要转换的无线加密信息对象。
	 *
	 * @returns {null|string}
	 * 返回可读的加密描述字符串；若入参无效则返回 `null`。
	 */
	formatWifiEncryption: formatWifiEncryption,

	/**
	 * 清除本地网络状态缓存，并从远端 `ubus` API 重新拉取最新数据。
	 * 通常在执行了网络配置变更（uci.apply）后调用，以确保状态同步。
	 *
	 * @returns {Promise<Object>}
	 * 返回一个 Promise，resolve 为内部网络状态对象。
	 */
	flushCache() {
		initNetworkState(true);
		return _init;
	},

	/**
	 * 实例化指定的 {@link LuCI.network.Protocol 协议} 后端类，可选地关联到指定网络名。
	 *
	 * @param {string} protoname
	 * 协议名称，如 `'static'`、`'dhcp'`、`'pppoe'`。
	 *
	 * @param {string} [netname=__dummy__]
	 * 关联的网络接口名（通常是 /etc/config/network 中的 interface 名）。
	 * 可省略，省略后将使用占位名 `__dummy__`（适用于仅查询协议能力的场景）。
	 *
	 * @returns {null|LuCI.network.Protocol}
	 * 返回协议子类实例；若协议未知则返回 `null`。
	 */
	getProtocol(protoname, netname) {
		const v = _protocols[protoname];
		if (v != null)
			return new v(netname || '__dummy__');

		return null;
	},

	/**
	 * 获取所有已注册的 {@link LuCI.network.Protocol 协议} 后端类的实例列表。
	 *
	 * @returns {Array<LuCI.network.Protocol>}
	 * 返回所有协议类实例的数组（每个协议一个 `__dummy__` 实例，用于查询协议元信息）。
	 */
	getProtocols() {
		const rv = [];

		for (let protoname in _protocols)
			rv.push(new _protocols[protoname]('__dummy__'));

		return rv;
	},

	/**
	 * 注册一个新的 {@link LuCI.network.Protocol 协议} 子类并返回该子类。
	 *
	 * 此函数内部调用 `Protocol` 基类的 `baseclass.extend()` 方法创建子类，
	 * 并自动注入 `getProtocol()`、`isVirtual()` 等必要方法。
	 *
	 * @param {string} protoname
	 * 要注册的协议名称（如 `'myppp'`），需与 netifd 协议处理程序名称一致。
	 *
	 * @param {Object<string, *>} methods
	 * 新协议子类的成员方法和属性对象，将传递给 `baseclass.extend()`。
	 *
	 * @returns {LuCI.network.Protocol}
	 * 返回新创建的协议子类构造函数。
	 */
	registerProtocol(protoname, methods) {
		const spec = L.isObject(_protospecs) ? _protospecs[protoname] : null;
		const proto = Protocol.extend(Object.assign({
			getI18n() {
				return protoname;
			},

			isFloating() {
				return false;
			},

			isVirtual() {
				return (L.isObject(spec) && spec.no_device == true);
			},

			renderFormOptions(section) {

			}
		}, methods, {
			__init__(name) {
				this.sid = name;
			},

			getProtocol() {
				return protoname;
			}
		}));

		_protocols[protoname] = proto;

		return proto;
	},

	/**
	 * 注册一个新的正则表达式模式，用于识别虚拟接口名称。
	 * 匹配的接口将被标记为虚拟/隧道接口（isTunnel），不显示为普通设备。
	 *
	 * @param {RegExp} pat
	 * 用于匹配虚拟接口名的正则表达式，如 `/^6in4-/` 或 `/^tun\d+/`。
	 */
	registerPatternVirtual(pat) {
		iface_patterns_virtual.push(pat);
	},

	/**
	 * 为协议错误码注册一个人类可读的翻译字符串，显示在 LuCI 界面的错误提示中。
	 *
	 * @param {string} code
	 * 要注册翻译的 `ubus` 协议错误码，如 `'NO_DEVICE'`、`'CONNECT_FAILED'`。
	 *
	 * @param {string} message
	 * 该错误码对应的可读描述字符串（建议使用 `_()` 包裹以支持 i18n）。
	 *
	 * @returns {boolean}
	 * 注册成功返回 `true`；若参数无效或该错误码已有描述则返回 `false`。
	 */
	registerErrorCode(code, message) {
		if (typeof(code) == 'string' &&
		    typeof(message) == 'string' &&
		    !proto_errors.hasOwnProperty(code)) {
			proto_errors[code] = message;
			return true;
		}

		return false;
	},

	/**
	 * 添加一个新的逻辑网络接口，并用给定的 UCI 选项值对其进行初始化。
	 *
	 * 若同名网络已存在且为空接口，则更新其选项；若已存在且非空，则不做任何操作。
	 *
	 * @param {string} name
	 * 新网络接口的名称，格式必须匹配 `[a-zA-Z0-9_]+`（如 `'myvpn'`）。
	 *
	 * @param {Object<string, string|string[]>} [options]
	 * 要设置的 UCI 选项对象，如 `{ proto: 'static', ipaddr: '10.0.0.1' }`。
	 *
	 * @returns {Promise<null|LuCI.network.Protocol>}
	 * 返回描述新接口的 Protocol 子类实例；若名称非法或同名非空接口已存在则返回 `null`。
	 */
	addNetwork(name, options) {
		return this.getNetwork(name).then(L.bind(function(existingNetwork) {
			if (name != null && /^[a-zA-Z0-9_]+$/.test(name) && existingNetwork == null) {
				const sid = uci.add('network', 'interface', name);

				if (sid != null) {
					if (L.isObject(options))
						for (let key in options)
							if (options.hasOwnProperty(key))
								uci.set('network', sid, key, options[key]);

					return this.instantiateNetwork(sid);
				}
			}
			else if (existingNetwork != null && existingNetwork.isEmpty()) {
				if (L.isObject(options))
					for (let key in options)
						if (options.hasOwnProperty(key))
							existingNetwork.set(key, options[key]);

				return existingNetwork;
			}
		}, this));
	},

	/**
	 * 获取描述指定网络接口的 {@link LuCI.network.Protocol Protocol} 实例。
	 *
	 * @param {string} name
	 * 逻辑接口名称，如 `'lan'` 或 `'wan'`。
	 *
	 * @returns {Promise<null|LuCI.network.Protocol>}
	 * 返回描述该网络的 Protocol 子类实例；若网络不存在则返回 `null`。
	 */
	getNetwork(name) {
		return initNetworkState().then(L.bind(function() {
			const section = (name != null) ? uci.get('network', name) : null;

			if (section != null && section['.type'] == 'interface') {
				return this.instantiateNetwork(name);
			}
			else if (name != null) {
				for (let ifc of _state.ifaces)
					if (ifc.interface == name)
						return this.instantiateNetwork(name, ifc.proto);
			}

			return null;
		}, this));
	},

	/**
	 * 获取系统中所有已知逻辑网络接口的列表。
	 *
	 * @returns {Promise<Array<LuCI.network.Protocol>>}
	 * 返回按接口名自然排序的 Protocol 子类实例数组，涵盖 UCI 配置中的接口和 netifd 运行时接口。
	 */
	getNetworks() {
		return initNetworkState().then(L.bind(enumerateNetworks, this));
	},

	/**
	 * 从网络和防火墙配置中删除指定网络接口及其所有引用。
	 *
	 * 删除操作包括：移除 UCI interface section、关联的路由/别名/规则、
	 * DHCP 配置、无线接口的 network 引用，以及防火墙区域规则。
	 *
	 * @param {string} name
	 * 要删除的网络接口名称（如 `'mynet'`）。
	 *
	 * @returns {Promise<boolean>}
	 * 删除成功返回 `true`；网络不存在或删除失败返回 `false`。
	 */
	deleteNetwork(name) {
		const requireFirewall = Promise.resolve(L.require('firewall')).catch(function() {});
		const loadDHCP = L.resolveDefault(uci.load('dhcp'));
		const network = this.instantiateNetwork(name);

		return Promise.all([ requireFirewall, loadDHCP, initNetworkState() ]).then(function(res) {
			const uciInterface = uci.get('network', name);
			const firewall = res[0];

			if (uciInterface != null && uciInterface['.type'] == 'interface') {
				return Promise.resolve(network ? network.deleteConfiguration() : null).then(function() {
					uci.remove('network', name);

					uci.sections('luci', 'ifstate', function(s) {
						if (s.interface == name)
							uci.remove('luci', s['.name']);
					});

					uci.sections('network', null, function(s) {
						switch (s['.type']) {
						case 'alias':
						case 'route':
						case 'route6':
							if (s.interface == name)
								uci.remove('network', s['.name']);

							break;

						case 'rule':
						case 'rule6':
							if (s.in == name || s.out == name)
								uci.remove('network', s['.name']);

							break;
						}
					});

					uci.sections('wireless', 'wifi-iface', function(s) {
						const networks = L.toArray(s.network).filter(function(network) { return network != name });

						if (networks.length > 0)
							uci.set('wireless', s['.name'], 'network', networks.join(' '));
						else
							uci.unset('wireless', s['.name'], 'network');
					});

					uci.sections('dhcp', 'dhcp', function(s) {
						if (s.interface == name)
							uci.remove('dhcp', s['.name']);
					});

					if (firewall)
						return firewall.deleteNetwork(name).then(function() { return true });

					return true;
				}).catch(function() {
					return false;
				});
			}

			return false;
		});
	},

	/**
	 * 重命名指定的网络接口，同时更新所有对该接口名的引用（路由、无线、DHCP 等）。
	 *
	 * @param {string} oldName
	 * 当前网络接口的名称。
	 *
	 * @param {string} newName
	 * 新的接口名称，格式必须匹配 `[a-zA-Z0-9_]+`。
	 *
	 * @returns {Promise<boolean>}
	 * 重命名成功返回 `true`；新名称非法、已存在或原接口不存在时返回 `false`。
	 */
	renameNetwork(oldName, newName) {
		return initNetworkState().then(function() {
			if (newName == null || !/^[a-zA-Z0-9_]+$/.test(newName) || uci.get('network', newName) != null)
				return false;

			const oldNetwork = uci.get('network', oldName);

			if (oldNetwork == null || oldNetwork['.type'] != 'interface')
				return false;

			const sid = uci.add('network', 'interface', newName);

			for (let key in oldNetwork)
				if (oldNetwork.hasOwnProperty(key) && key.charAt(0) != '.')
					uci.set('network', sid, key, oldNetwork[key]);

			uci.sections('luci', 'ifstate', function(s) {
				if (s.interface == oldName)
					uci.set('luci', s['.name'], 'interface', newName);
			});

			uci.sections('network', 'alias', function(s) {
				if (s.interface == oldName)
					uci.set('network', s['.name'], 'interface', newName);
			});

			uci.sections('network', 'route', function(s) {
				if (s.interface == oldName)
					uci.set('network', s['.name'], 'interface', newName);
			});

			uci.sections('network', 'route6', function(s) {
				if (s.interface == oldName)
					uci.set('network', s['.name'], 'interface', newName);
			});

			uci.sections('wireless', 'wifi-iface', function(s) {
				const networks = L.toArray(s.network).map(function(network) { return (network == oldName ? newName : network) });

				if (networks.length > 0)
					uci.set('wireless', s['.name'], 'network', networks.join(' '));
			});

			uci.remove('network', oldName);

			return true;
		});
	},

	/**
	 * 获取描述指定 Linux 网络设备的 {@link LuCI.network.Device Device} 实例。
	 *
	 * @param {string} name
	 * 网络设备名称，如 `'eth0'`、`'br-lan'`，也可传入无线 UCI section 名。
	 *
	 * @returns {Promise<null|LuCI.network.Device>}
	 * 返回 Device 实例；设备不存在则返回 `null`。
	 */
	getDevice(name) {
		return initNetworkState().then(L.bind(function() {
			if (name == null)
				return null;

			if (_state.netdevs.hasOwnProperty(name))
				return this.instantiateDevice(name);

			const netid = getWifiNetidBySid(name);
			if (netid != null)
				return this.instantiateDevice(netid[0]);

			return null;
		}, this));
	},

	/**
	 * 获取系统中所有网络设备的有序列表（包括以太网、VLAN、桥接、无线虚拟接口等）。
	 *
	 * @returns {Promise<Array<LuCI.network.Device>>}
	 * 返回按设备类型和名称排序的 Device 实例数组。
	 */
	getDevices() {
		return initNetworkState().then(L.bind(function() {
			const devices = {};

			/* find simple devices */
			const uciInterfaces = uci.sections('network', 'interface');
			for (let uif of uciInterfaces) {
				const ifnames = L.toArray(uif.ifname);

				for (let ifn of ifnames) {
					if (ifn.charAt(0) == '@')
						continue;

					if (isIgnoredIfname(ifn) || isVirtualIfname(ifn) || isWifiIfname(ifn))
						continue;

					devices[ifn] = this.instantiateDevice(ifn);
				}
			}

			for (let ifname in _state.netdevs) {
				if (devices.hasOwnProperty(ifname))
					continue;

				if (isIgnoredIfname(ifname) || isWifiIfname(ifname))
					continue;

				if (_state.netdevs[ifname].wireless)
					continue;

				devices[ifname] = this.instantiateDevice(ifname);
			}

			/* find VLAN devices */
			const uciSwitchVLANs = uci.sections('network', 'switch_vlan');
			for (let sw of uciSwitchVLANs) {
				if (typeof(sw.ports) != 'string' ||
				    typeof(sw.device) != 'string' ||
				    !_state.switches.hasOwnProperty(sw.device))
					continue;

				const ports = sw.ports.split(/\s+/);
				for (let p of ports) {
					let m = p.match(/^(\d+)([tu]?)$/);
					if (m == null)
						continue;

					let netdev = _state.switches[sw.device].netdevs[m[1]];
					if (netdev == null)
						continue;

					if (!devices.hasOwnProperty(netdev))
						devices[netdev] = this.instantiateDevice(netdev);

					_state.isSwitch[netdev] = true;

					if (m[2] != 't')
						continue;

					let vid = sw.vid || sw.vlan;
					    vid = (vid != null ? +vid : null);

					if (vid == null || vid < 0 || vid > 4095)
						continue;

					const vlandev = '%s.%d'.format(netdev, vid);

					if (!devices.hasOwnProperty(vlandev))
						devices[vlandev] = this.instantiateDevice(vlandev);

					_state.isSwitch[vlandev] = true;
				}
			}

			/* find bridge VLAN devices */
			const uciBridgeVLANs = uci.sections('network', 'bridge-vlan');
			for (let bvl of uciBridgeVLANs) {
				const basedev = bvl.device;
				const local = bvl.local;
				const alias = bvl.alias;
				const vid = +bvl.vlan;
				const ports = L.toArray(bvl.ports);

				if (local == '0')
					continue;

				if (isNaN(vid) || vid < 0 || vid > 4095)
					continue;

				const vlandev = '%s.%s'.format(basedev, alias || vid);

				_state.isBridge[basedev] = true;

				if (!_state.bridges.hasOwnProperty(basedev))
					_state.bridges[basedev] = {
						name:    basedev,
						ifnames: []
					};

				if (!devices.hasOwnProperty(vlandev))
					devices[vlandev] = this.instantiateDevice(vlandev);

				ports.forEach(function(port_name) {
					const m = port_name.match(/^([^:]+)(?::[ut*]+)?$/);
					const p = m ? m[1] : null;

					if (!p)
						return;

					if (_state.bridges[basedev].ifnames.filter(function(sd) { return sd.name == p }).length)
						return;

					_state.netdevs[p] = _state.netdevs[p] || {
						name: p,
						ipaddrs: [],
						ip6addrs: [],
						type: 1,
						devtype: 'ethernet',
						stats: {},
						flags: {}
					};

					_state.bridges[basedev].ifnames.push(_state.netdevs[p]);
					_state.netdevs[p].bridge = _state.bridges[basedev];
				});
			}

			/* find wireless interfaces */
			const uciWifiIfaces = uci.sections('wireless', 'wifi-iface');
			const networkCount = {};

			for (let wf_if of uciWifiIfaces) {
				if (typeof(wf_if.device) != 'string')
					continue;

				networkCount[wf_if.device] = (networkCount[wf_if.device] || 0) + 1;

				const netid = '%s.network%d'.format(wf_if.device, networkCount[wf_if.device]);

				devices[netid] = this.instantiateDevice(netid);
			}

			/* find uci declared devices */
			const uciDevices = uci.sections('network', 'device');

			for (let d of uciDevices) {
				const type = d.type;
				const name = d.name;

				if (!type || !name || devices.hasOwnProperty(name))
					continue;

				if (type == 'bridge')
					_state.isBridge[name] = true;

				devices[name] = this.instantiateDevice(name);
			}

			const rv = [];

			for (let netdev in devices)
				if (devices.hasOwnProperty(netdev))
					rv.push(devices[netdev]);

			rv.sort(deviceSort);

			return rv;
		}, this));
	},

	/**
	 * 判断指定设备名是否在忽略列表的正则模式中（即是否应被 LuCI 隐藏）。
	 *
	 * 被忽略的设备通常是由内核模块隐式创建的、不适合出现在网络配置中的接口，
	 * 如 `tunl0`、`hwsim0`、`lo` 等。
	 *
	 * @param {string} name
	 * 要检测的设备名称。
	 *
	 * @returns {boolean}
	 * 若名称匹配忽略模式返回 `true`，否则返回 `false`。
	 */
	isIgnoredDevice(name) {
		return isIgnoredIfname(name);
	},

	/**
	 * 获取描述指定无线射频设备的 {@link LuCI.network.WifiDevice WifiDevice} 实例。
	 *
	 * @param {string} devname
	 * 无线射频设备的 UCI 配置名称，如第一个 mac80211 phy 通常为 `'radio0'`。
	 *
	 * @returns {Promise<null|LuCI.network.WifiDevice>}
	 * 返回 WifiDevice 实例；该 radio 不存在或未在 UCI 中配置则返回 `null`。
	 */
	getWifiDevice(devname) {
		return initNetworkState().then(L.bind(function() {
			const existingDevice = uci.get('wireless', devname);

			if (existingDevice == null || existingDevice['.type'] != 'wifi-device')
				return null;

			return this.instantiateWifiDevice(devname, _state.radios[devname] || {});
		}, this));
	},

	/**
	 * 获取系统中所有已配置的无线射频设备列表。
	 *
	 * @returns {Promise<Array<LuCI.network.WifiDevice>>}
	 * 返回 WifiDevice 实例数组，顺序与 UCI wireless 配置中 wifi-device section 的顺序一致。
	 */
	getWifiDevices() {
		return initNetworkState().then(L.bind(function() {
			const uciWifiDevices = uci.sections('wireless', 'wifi-device');
			const rv = [];

			for (let wfd of uciWifiDevices) {
				const devname = wfd['.name'];
				rv.push(this.instantiateWifiDevice(devname, _state.radios[devname] || {}));
			}

			return rv;
		}, this));
	},

	/**
	 * 获取描述指定无线网络的 {@link LuCI.network.WifiNetwork WifiNetwork} 实例。
	 *
	 * @param {string} netname
	 * 无线网络的标识，支持三种格式：
	 *  - UCI section 名（如 `'wifinet0'`）
	 *  - 网络 ID（如 `'radio0.network1'`）
	 *  - Linux 接口名（如 `'wlan0'`，通过 ubus 运行时信息反向解析）
	 *
	 * @returns {Promise<null|LuCI.network.WifiNetwork>}
	 * 返回 WifiNetwork 实例；找不到对应网络则返回 `null`。
	 */
	getWifiNetwork(netname) {
		return initNetworkState()
			.then(L.bind(this.lookupWifiNetwork, this, netname));
	},

	/**
	 * 获取系统中所有无线网络虚拟接口的列表。
	 *
	 * @returns {Promise<Array<LuCI.network.WifiNetwork>>}
	 * 返回按网络 ID 排序的 WifiNetwork 实例数组；若无无线网络则返回空数组。
	 */
	getWifiNetworks() {
		return initNetworkState().then(L.bind(function() {
			const wifiIfaces = uci.sections('wireless', 'wifi-iface');
			const rv = [];

			for (let wf_if of wifiIfaces)
				rv.push(this.lookupWifiNetwork(wf_if['.name']));

			rv.sort(function(a, b) {
				return L.naturalCompare(a.getID(), b.getID());
			});

			return rv;
		}, this));
	},

	/**
	 * 向 UCI 配置中添加一个新的无线网络（wifi-iface section），并设置给定的选项值。
	 *
	 * @param {Object<string, string|string[]>} options
	 * 新无线网络的 UCI 选项对象，至少必须包含 `device` 属性（指定所属 radio 名）。
	 * 其他常用选项：`mode`（'ap'/'sta'/'adhoc'）、`ssid`、`encryption`、`key` 等。
	 *
	 * @returns {Promise<null|LuCI.network.WifiNetwork>}
	 * 返回描述新无线网络的 WifiNetwork 实例；选项无效或 radio 不存在时返回 `null`。
	 */
	addWifiNetwork(options) {
		return initNetworkState().then(L.bind(function() {
			if (options == null ||
			    typeof(options) != 'object' ||
			    typeof(options.device) != 'string')
			    return null;

			const existingDevice = uci.get('wireless', options.device);
			if (existingDevice == null || existingDevice['.type'] != 'wifi-device')
				return null;

			/* XXX: need to add a named section (wifinet#) here */
			const sid = uci.add('wireless', 'wifi-iface');
			for (let key in options)
				if (options.hasOwnProperty(key))
					uci.set('wireless', sid, key, options[key]);

			const radioname = existingDevice['.name'];
			const netid = getWifiNetidBySid(sid) || [];

			return this.instantiateWifiNetwork(sid, radioname, _state.radios[radioname], netid[0], null);
		}, this));
	},

	/**
	 * 从 UCI 配置中删除指定的无线网络（wifi-iface section）。
	 *
	 * @param {string} netname
	 * 要删除的无线网络标识，支持网络 ID（如 `'radio0.network1'`）
	 * 或 Linux 接口名（如 `'wlan0'`）。
	 *
	 * @returns {Promise<boolean>}
	 * 删除成功返回 `true`；找不到对应网络则返回 `false`。
	 */
	deleteWifiNetwork(netname) {
		return initNetworkState().then(L.bind(function() {
			const sid = getWifiSidByIfname(netname);

			if (sid == null)
				return false;

			uci.remove('wireless', sid);
			return true;
		}, this));
	},

	/* private */
	getStatusByRoute(addr, mask) {
		return initNetworkState().then(L.bind(function() {
			const rv = [];

			for (let sif of _state.ifaces) {
				if (!Array.isArray(sif.route))
					continue;

				for (let sifr of sif.route) {
					if (typeof(sifr) != 'object' ||
					    typeof(sifr.target) != 'string' ||
					    typeof(sifr.mask) != 'number')
					    continue;

					if (sifr.table)
						continue;

					if (sifr.target != addr ||
					    sifr.mask != mask)
					    continue;

					rv.push(sif);
				}
			}

			rv.sort(function(a, b) {
				return L.naturalCompare(a.metric, b.metric) || L.naturalCompare(a.interface, b.interface);
			});

			return rv;
		}, this));
	},

	/* private */
	getStatusByAddress(addr) {
		return initNetworkState().then(L.bind(function() {
			for (let sif of _state.ifaces) {
				if (Array.isArray(sif['ipv4-address']))
					for (let a of sif['ipv4-address'])
						if (typeof(a) == 'object' &&
						    a.address == addr)
							return sif;

				if (Array.isArray(sif['ipv6-address']))
					for (let a of sif['ipv6-address'])
						if (typeof(a) == 'object' &&
						    a.address == addr)
							return sif;

				if (Array.isArray(sif['ipv6-prefix-assignment']))
					for (let a of sif['ipv6-prefix-assignment'])
						if (typeof(a) == 'object' &&
							typeof(a['local-address']) == 'object' &&
						    a['local-address'].address == addr)
							return sif;
			}

			return null;
		}, this));
	},

	/**
	 * 获取 IPv4 WAN 网络列表。
	 *
	 * 此函数查找所有拥有默认路由（`0.0.0.0/0`）的网络接口并以数组形式返回。
	 * 通常用于判断当前 WAN 口的 IP 连通状态。
	 *
	 * @returns {Promise<Array<LuCI.network.Protocol>>}
	 * 返回具有默认 IPv4 路由的 Protocol 子类实例数组；
	 * instances describing the found default route interfaces.
	 */
	getWANNetworks() {
		return this.getStatusByRoute('0.0.0.0', 0).then(L.bind(function(statuses) {
			const rv = [], seen = {};

			for (let s of statuses) {
				if (!seen.hasOwnProperty(s.interface)) {
					rv.push(this.instantiateNetwork(s.interface, s.proto));
					seen[s.interface] = true;
				}
			}

			return rv;
		}, this));
	},

	/**
	 * 获取 IPv6 WAN 网络列表。
	 *
	 * 此函数查找所有拥有 IPv6 默认路由（`::/0`）的网络接口并以数组形式返回。
	 *
	 * @returns {Promise<Array<LuCI.network.Protocol>>}
	 * 返回具有默认 IPv6 路由的 Protocol 子类实例数组；
	 * instances describing the found IPv6 default route interfaces.
	 */
	getWAN6Networks() {
		return this.getStatusByRoute('::', 0).then(L.bind(function(statuses) {
			const rv = [], seen = {};

			for (let s of statuses) {
				if (!seen.hasOwnProperty(s.interface)) {
					rv.push(this.instantiateNetwork(s.interface, s.proto));
					seen[s.interface] = true;
				}
			}

			return rv;
		}, this));
	},

	/**
	 * 描述 swconfig 交换机的拓扑结构，包含 CPU 端口映射和已连接端口信息。
	 * connections and external port labels of a switch.
	 *
	 * @typedef {Object<string, Object|Array>} SwitchTopology
	 * @memberof LuCI.network
	 *
	 * @property {Object<number, string>} netdevs
	 * `netdevs` 属性指向描述 CPU 端口与 Linux 网络设备映射关系的对象，
	 * connections of the switch. The numeric key of the enclosed object is
	 * the port number, the value contains the Linux network device name the
	 * port is hardwired to.
	 *
	 * @property {Array<Object<string, boolean|number|string>>} ports
	 * `ports` 属性指向描述已连接端口列表的数组，
	 * ports of the switch in the external label order. Each array item is
	 * an object containing the following keys:
	 *  - `num` - the internal switch port number
	 *  - `label` - the label of the port, e.g. `LAN 1` or `CPU (eth0)`
	 *  - `device` - the connected Linux network device name (CPU ports only)
	 *  - `tagged` - a boolean indicating whether the port must be tagged to
	 *     function (CPU ports only)
	 */

	/**
	 * 获取系统中所有 swconfig 交换机的拓扑结构信息。
	 *
	 * @returns {Promise<Object<string, LuCI.network.SwitchTopology>>}
	 * 返回以交换机名（如 `'switch0'`）为键，
	 * {@link LuCI.network.SwitchTopology SwitchTopology} 对象为值的拓扑描述对象。
	 */
	getSwitchTopologies() {
		return initNetworkState().then(function() {
			return _state.switches;
		});
	},

	/* private */
	instantiateNetwork(name, proto) {
		if (name == null)
			return null;

		proto = (proto == null ? (uci.get('network', name, 'proto') || 'none') : proto);

		const protoClass = _protocols[proto] || Protocol;
		return new protoClass(name);
	},

	/* private */
	instantiateDevice(name, network, extend) {
		if (extend != null)
			return new (Device.extend(extend))(name, network);

		return new Device(name, network);
	},

	/* private */
	instantiateWifiDevice(radioname, radiostate) {
		return new WifiDevice(radioname, radiostate);
	},

	/* private */
	instantiateWifiNetwork(sid, radioname, radiostate, netid, netstate, hostapd) {
		return new WifiNetwork(sid, radioname, radiostate, netid, netstate, hostapd);
	},

	/* private */
	lookupWifiNetwork(netname) {
		let sid, res, netid, radioname, radiostate, netstate;

		sid = getWifiSidByNetid(netname);

		if (sid != null) {
			res        = getWifiStateBySid(sid);
			netid      = netname;
			radioname  = res ? res[0] : null;
			radiostate = res ? res[1] : null;
			netstate   = res ? res[2] : null;
		}
		else {
			res = getWifiStateByIfname(netname);

			if (res != null) {
				radioname  = res[0];
				radiostate = res[1];
				netstate   = res[2];
				sid        = netstate.section;
				netid      = L.toArray(getWifiNetidBySid(sid))[0];
			}
			else {
				res = getWifiStateBySid(netname);

				if (res != null) {
					radioname  = res[0];
					radiostate = res[1];
					netstate   = res[2];
					sid        = netname;
					netid      = L.toArray(getWifiNetidBySid(sid))[0];
				}
				else {
					res = getWifiNetidBySid(netname);

					if (res != null) {
						netid     = res[0];
						radioname = res[1];
						sid       = netname;
					}
				}
			}
		}

		return this.instantiateWifiNetwork(sid || netname, radioname,
			radiostate, netid, netstate,
			netstate ? _state.hostapd[netstate.ifname] : null);
	},

	/**
	 * 从各种类型的对象中提取 Linux 网络设备名称字符串。
	 *
	 * @param {LuCI.network.Protocol|LuCI.network.Device|LuCI.network.WifiDevice|LuCI.network.WifiNetwork|string} obj
	 * 支持 Protocol、Device、WifiDevice、WifiNetwork 实例，或字符串形式的接口名。
	 *
	 * @returns {null|string}
	 * 返回对应的设备名字符串；无法识别时返回 `null`。
	 */
	getIfnameOf(obj) {
		return ifnameOf(obj);
	},

	/**
	 * 从板级信息（/etc/board.json）中查询内置 DSL modem 的类型。
	 *
	 * @returns {Promise<null|string>}
	 * 返回内置 modem 的类型字符串（如 `'vdsl'`、`'adsl'`）；若无内置 modem 则返回 `null`。
	 */
	getDSLModemType() {
		return initNetworkState().then(function() {
			return _state.hasDSLModem ? _state.hasDSLModem.type : null;
		});
	},

	/**
	 * 查询系统中所有已知主机的聚合信息。
	 *
	 * 此函数整合 DHCP 租约数据库、ARP 表、IPv6 邻居表、无线关联列表等多种来源，
	 * 返回一个封装了所有主机信息的 {@link LuCI.network.Hosts Hosts} 实例。
	 *
	 * @returns {Promise<LuCI.network.Hosts>}
	 * 返回包含系统已知主机信息的 Hosts 实例。
	 */
	getHostHints() {
		return initNetworkState().then(function() {
			return new Hosts(_state.hosts);
		});
	}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `LuCI.network.Hosts` 类封装了从多个来源聚合的主机信息，
 * 并提供按不同条件（MAC、IP、主机名）查询主机信息的便捷方法。
 */
Hosts = baseclass.extend(/** @lends LuCI.network.Hosts.prototype */ {
	__init__(hosts) {
		this.hosts = hosts;
	},

	/**
	 * 根据 MAC 地址查找对应的主机名。
	 *
	 * @param {string} mac
	 * 要查询的 MAC 地址字符串（如 `'aa:bb:cc:dd:ee:ff'`）。
	 *
	 * @returns {null|string}
	 * 返回对应的主机名；若 MAC 不存在或无主机名记录则返回 `null`。
	 */
	getHostnameByMACAddr(mac) {
		return this.hosts[mac]
			? (this.hosts[mac].name || null)
			: null;
	},

	/**
	 * 根据 MAC 地址查找对应的 IPv4 地址。
	 *
	 * @param {string} mac
	 * 要查询的 MAC 地址字符串。
	 *
	 * @returns {null|string}
	 * 返回对应的 IPv4 地址字符串；若 MAC 不存在或无 IPv4 记录则返回 `null`。
	 */
	getIPAddrByMACAddr(mac) {
		return this.hosts[mac]
			? (L.toArray(this.hosts[mac].ipaddrs || this.hosts[mac].ipv4)[0] || null)
			: null;
	},

	/**
	 * 根据 MAC 地址查找对应的 IPv6 地址。
	 *
	 * @param {string} mac
	 * 要查询的 MAC 地址字符串。
	 *
	 * @returns {null|string}
	 * 返回对应的 IPv6 地址字符串；若 MAC 不存在或无 IPv6 记录则返回 `null`。
	 */
	getIP6AddrByMACAddr(mac) {
		return this.hosts[mac]
			? (L.toArray(this.hosts[mac].ip6addrs || this.hosts[mac].ipv6)[0] || null)
			: null;
	},

	/**
	 * 根据 IPv4 地址查找对应的主机名。
	 *
	 * @param {string} ipaddr
	 * 要查询的 IPv4 地址字符串（如 `'192.168.1.100'`）。
	 *
	 * @returns {null|string}
	 * 返回对应的主机名；若地址不存在或无主机名则返回 `null`。
	 */
	getHostnameByIPAddr(ipaddr) {
		for (let mac in this.hosts) {
			if (this.hosts[mac].name == null)
				continue;

			const addrs = L.toArray(this.hosts[mac].ipaddrs || this.hosts[mac].ipv4);

			for (let a of addrs)
				if (a == ipaddr)
					return this.hosts[mac].name;
		}

		return null;
	},

	/**
	 * 根据 IPv4 地址查找对应的 MAC 地址。
	 *
	 * @param {string} ipaddr
	 * 要查询的 IPv4 地址字符串。
	 *
	 * @returns {null|string}
	 * 返回对应的 MAC 地址字符串；若地址不存在则返回 `null`。
	 */
	getMACAddrByIPAddr(ipaddr) {
		for (let mac in this.hosts) {
			const addrs = L.toArray(this.hosts[mac].ipaddrs || this.hosts[mac].ipv4);

			for (let a of addrs)
				if (a == ipaddr)
					return mac;
		}

		return null;
	},

	/**
	 * 根据 IPv6 地址查找对应的主机名。
	 *
	 * @param {string} ip6addr
	 * 要查询的 IPv6 地址字符串。
	 *
	 * @returns {null|string}
	 * 返回对应的主机名；若地址不存在或无主机名则返回 `null`。
	 */
	getHostnameByIP6Addr(ip6addr) {
		for (let mac in this.hosts) {
			if (this.hosts[mac].name == null)
				continue;

			const addrs = L.toArray(this.hosts[mac].ip6addrs || this.hosts[mac].ipv6);

			for (let a of addrs)
				if (a == ip6addr)
					return this.hosts[mac].name;
		}

		return null;
	},

	/**
	 * 根据 IPv6 地址查找对应的 MAC 地址。
	 *
	 * @param {string} ip6addr
	 * 要查询的 IPv6 地址字符串。
	 *
	 * @returns {null|string}
	 * 返回对应的 MAC 地址字符串；若地址不存在则返回 `null`。
	 */
	getMACAddrByIP6Addr(ip6addr) {
		for (let mac in this.hosts) {
			const addrs = L.toArray(this.hosts[mac].ip6addrs || this.hosts[mac].ipv6);

			for (let a of addrs)
				if (a == ip6addr)
					return mac;
		}

		return null;
	},

	/**
	 * 返回按 MAC 地址排序的 [MAC, 名称提示] 元组数组，适合填充下拉选择器。
	 *
	 * @param {boolean} [preferIp6=false]
	 * 当某主机无主机名但同时有 IPv4 和 IPv6 地址时，
	 * 为 `true` 则优先使用 IPv6 地址作为名称提示，为 `false` 则优先使用 IPv4。
	 *
	 * @returns {Array<Array<string>>}
	 * 返回二元素数组的数组，按 MAC 地址升序排列。
	 * 每个子数组格式为 `[MAC地址, 名称提示]`，
	 * 名称提示优先级：主机名 > IPv4/IPv6 地址（取决于 preferIp6）。
	 */
	getMACHints(preferIp6) {
		const rv = [];

		for (let mac in this.hosts) {
			const hint = this.hosts[mac].name ||
				L.toArray(this.hosts[mac][preferIp6 ? 'ip6addrs' : 'ipaddrs'] || this.hosts[mac][preferIp6 ? 'ipv6' : 'ipv4'])[0] ||
				L.toArray(this.hosts[mac][preferIp6 ? 'ipaddrs' : 'ip6addrs'] || this.hosts[mac][preferIp6 ? 'ipv4' : 'ipv6'])[0];

			rv.push([mac, hint]);
		}

		return rv.sort(function(a, b) {
			return L.naturalCompare(a[0], b[0]);
		});
	}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `Network.Protocol` 类是各协议子类的基类，
 * 用于描述 `/etc/config/network` 中 `config interface` section 所定义的逻辑 UCI 网络接口。
 */
Protocol = baseclass.extend(/** @lends LuCI.network.Protocol.prototype */ {
	/** 构造函数：用 UCI section 名称初始化协议实例 */
	__init__(name) {
		this.sid = name;  // UCI section ID，即接口名（如 'lan'、'wan'）
	},

	/**
	 * 【私有】从 UCI 读取指定选项值。
	 * 若值为数组（list 类型），以空格连接后返回字符串；
	 * 若选项不存在，返回空字符串（而非 null），与 get() 行为不同。
	 */
	_get(opt) {
		const val = uci.get('network', this.sid, opt);

		if (Array.isArray(val))
			return val.join(' ');

		return val || '';
	},

	/**
	 * 【私有】从 netifd 运行时状态（_state.ifaces）中查找本接口的指定字段。
	 *
	 * @param {string|null} field - 要获取的字段名；传 null 则返回整个状态对象
	 * @returns {*} 字段值，接口不在运行时状态中时返回 undefined
	 *
	 * 常用字段：
	 *  'uptime'         → 接口运行时长（秒）
	 *  'ipv4-address'   → IPv4 地址数组
	 *  'ipv6-address'   → IPv6 地址数组
	 *  'route'          → 路由条目数组
	 *  'dns-server'     → DNS 服务器列表
	 *  'device'         → 关联的 L2 设备名
	 *  'l3_device'      → 关联的 L3 设备名（PPP 等浮动协议使用）
	 *  'metric'         → 路由度量值
	 *  'data'           → 协议私有数据（如 DHCP leasetime）
	 */
	_ubus(field) {
		for (let sif of _state.ifaces) {
			if (sif.interface != this.sid)
				continue;

			return (field != null ? sif[field] : sif);
		}
	},

	/**
	 * 读取本网络接口的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'ipaddr'`、`'proto'`、`'ifname'`。
	 *
	 * @returns {null|string|string[]}
	 * 返回 UCI 选项值（list 类型为字符串数组）；选项不存在则返回 `null`。
	 */
	get(opt) {
		return uci.get('network', this.sid, opt);
	},

	/**
	 * 设置本网络接口的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'ipaddr'`、`'netmask'`。
	 *
	 * @param {null|string|string[]} val
	 * 要设置的值；传入 `null` 将删除该选项（等价于 uci.unset）。
	 * @returns {null}
	 */
	set(opt, val) {
		return uci.set('network', this.sid, opt, val);
	},

	/**
	 * 获取本逻辑网络接口关联的 Linux 网络设备名。
	 *
	 * 对于浮动协议（如 PPP），返回 L3 设备名；
	 * 对于普通协议，优先返回 L2 设备名，回退到 L3 设备名。
	 *
	 * @returns {null|string}
	 * 返回关联的网络设备名（如 `'eth0'`、`'ppp0'`）；无法确定则返回 `null`。
	 */
	getIfname() {
		let ifname;

		if (this.isFloating())
			ifname = this._ubus('l3_device');
		else
			ifname = this._ubus('device') || this._ubus('l3_device');

		if (ifname != null)
			return ifname;

		const res = getWifiNetidByNetname(this.sid);
		return (res != null ? res[0] : null);
	},

	/**
	 * 获取本协议类的协议名称字符串。
	 *
	 * 此方法为抽象方法，由 {@link LuCI.network#registerProtocol registerProtocol()} 创建的子类自动覆盖实现。
	 *
	 * @abstract
	 * @returns {string}
	 * 返回协议实现的名称，如 `'static'`、`'dhcp'`、`'pppoe'`。基类实现返回 `null`。
	 */
	getProtocol() {
		return null;
	},

	/**
	 * 返回协议的人类可读描述字符串，用于在 LuCI 界面中展示给用户。
	 *
	 * 子类应覆盖此方法以返回本地化的协议描述（建议用 `_()` 包裹）。
	 *
	 * @abstract
	 * @returns {string}
	 * 返回协议描述字符串，如 `'Static address'`（静态地址）、`'DHCP client'`（DHCP 客户端）。
	 */
	getI18n() {
		switch (this.getProtocol()) {
		case 'none':   return _('Unmanaged');
		case 'static': return _('Static address');
		case 'dhcp':   return _('DHCP client');
		default:       return _('Unknown');
		}
	},

	/**
	 * 获取底层接口的类型。
	 *
	 * 这是 `proto.get('type')` 的便捷封装，主要供 LuCI.network 内部代码用于
	 * 判断接口是否在 UCI 中声明为桥接（type='bridge'）。
	 *
	 * @returns {null|string}
	 * 返回 UCI `type` 选项的值（如 `'bridge'`）；未设置该选项时返回 `null`。
	 */
	getType() {
		return this._get('type');
	},

	/**
	 * 获取本实例关联的逻辑接口名称（即 UCI section 名）。
	 *
	 * @returns {string}
	 * 返回逻辑接口名，如 `'lan'`、`'wan'`、`'loopback'`。
	 */
	getName() {
		return this.sid;
	},

	/**
	 * 获取本逻辑接口的运行时长。
	 *
	 * @returns {number}
	 * 返回接口自上次启动以来的运行时长（秒）；接口未运行或信息不可用时返回 `0`。
	 */
	getUptime() {
		return this._ubus('uptime') || 0;
	},

	/**
	 * 获取本逻辑接口的租约剩余有效时间（秒）。
	 *
	 * 对于有租约概念的协议（如 DHCP、DHCPv6），返回租约到期前的剩余秒数。
	 * 对于 DHCPv6，取第一个 IPv6 前缀/地址的 valid lifetime。
	 *
	 * @returns {number}
	 * 返回租约剩余秒数；协议不支持租约概念时返回 `-1`，租约已过期返回 `0`。
	 */
	getExpiry() {
		const u = this._ubus('uptime');
		const d = this._ubus('data');
		const v6_prefixes = this._ubus('ipv6-prefix');
		const v6_addresses = this._ubus('ipv6-address');

		if (typeof(u) == 'number' && d != null) {

			// DHCPv4 or leasetime in data
			if(typeof(d) == 'object' && typeof(d.leasetime) == 'number') {
				const r = d.leasetime - (u % d.leasetime);
				return (r > 0 ? r : 0);
			}

			// DHCPv6, we can have multiple IPs and prefixes
			if (Array.isArray(v6_prefixes) || Array.isArray(v6_addresses)) {
				const prefixes = [...v6_prefixes, ...v6_addresses];

				if(prefixes.length && typeof(prefixes[0].valid) == 'number') {
					const r = prefixes[0].valid;
					return (r > 0 ? r : 0);
				}
			}
		}

		return -1;
	},

	/**
	 * 获取本逻辑接口的路由度量值（metric）。
	 *
	 * 度量值用于路由选择优先级：值越小优先级越高。当多个接口都有默认路由时，
	 * metric 较小的接口优先使用。
	 *
	 * @returns {number}
	 * 返回当前的路由度量值；信息不可用时返回 `0`。
	 */
	getMetric() {
		return this._ubus('metric') || 0;
	},

	/**
	 * 获取本逻辑接口请求的防火墙区域名称。
	 *
	 * 某些协议实现（如 VPN 协议）会在 ubus 数据的 `data.zone` 字段请求归属到
	 * 特定防火墙区域，以便自动将产生的网络设备纳入对应防火墙规则集。
	 *
	 * @returns {null|string}
	 * 返回协议请求的防火墙区域名（如 `'vpn'`）；协议未请求特定区域则返回 `null`。
	 */
	getZoneName() {
		const d = this._ubus('data');

		if (L.isObject(d) && typeof(d.zone) == 'string')
			return d.zone;

		return null;
	},

	/**
	 * 查询本逻辑接口的首个（主）IPv4 地址。
	 *
	 * @returns {null|string}
	 * 返回协议处理程序注册的主 IPv4 地址字符串（如 `'192.168.1.1'`）；
	 * 未分配 IPv4 地址时返回 `null`。
	 */
	getIPAddr() {
		const addrs = this._ubus('ipv4-address');
		return ((Array.isArray(addrs) && addrs.length) ? addrs[0].address : null);
	},

	/**
	 * 查询本逻辑接口的所有 IPv4 地址。
	 *
	 * @returns {string[]}
	 * 返回 CIDR 格式的 IPv4 地址数组（如 `['192.168.1.1/24', '10.0.0.1/8']`）；
	 * 顺序与 ubus 运行时信息中的地址顺序一致；无地址时返回空数组。
	 */
	getIPAddrs() {
		const addrs = this._ubus('ipv4-address');
		const rv = [];

		if (Array.isArray(addrs))
			for (let a of addrs)
				rv.push('%s/%d'.format(a.address, a.mask));

		return rv;
	},

	/**
	 * 查询本逻辑接口主 IPv4 地址对应的子网掩码。
	 *
	 * @returns {null|string}
	 * 返回主 IPv4 地址的子网掩码字符串（如 `'255.255.255.0'`）；
	 * 未分配 IPv4 地址时返回 `null`。
	 */
	getNetmask() {
		const addrs = this._ubus('ipv4-address');
		if (Array.isArray(addrs) && addrs.length)
			return prefixToMask(addrs[0].mask, false);
	},

	/**
	 * 查询本逻辑接口关联的默认路由的 IPv4 网关地址（下一跳）。
	 *
	 * @returns {string}
	 * 返回默认路由的 IPv4 网关地址字符串（如 `'192.168.1.254'`）；
	 * 未找到默认路由（0.0.0.0/0）时返回 `null`。
	 */
	getGatewayAddr() {
		const routes = this._ubus('route');

		if (Array.isArray(routes))
			for (let r of routes)
				if (typeof(r) == 'object' &&
				    r.target == '0.0.0.0' &&
				    r.mask == 0)
				    return r.nexthop;

		return null;
	},

	/**
	 * 查询本逻辑接口关联的 IPv4 DNS 服务器列表。
	 *
	 * @returns {string[]}
	 * 返回 IPv4 DNS 服务器地址数组（过滤掉 IPv6 地址）；无 DNS 信息时返回空数组。
	 */
	getDNSAddrs() {
		const addrs = this._ubus('dns-server');
		const rv = [];

		if (Array.isArray(addrs))
			for (let a of addrs)
				if (!/:/.test(a))
					rv.push(a);

		return rv;
	},

	/**
	 * 查询本逻辑接口的首个（主）IPv6 地址。
	 *
	 * 优先从 `ipv6-address` 中取值，回退到 `ipv6-prefix-assignment` 的本地地址。
	 *
	 * @returns {null|string}
	 * 返回 CIDR 格式的主 IPv6 地址（如 `'2001:db8::1/64'`）；无 IPv6 地址时返回 `null`。
	 */
	getIP6Addr() {
		let addrs = this._ubus('ipv6-address');

		if (Array.isArray(addrs) && L.isObject(addrs[0]))
			return '%s/%d'.format(addrs[0].address, addrs[0].mask);

		addrs = this._ubus('ipv6-prefix-assignment');

		if (Array.isArray(addrs) && L.isObject(addrs[0]) && L.isObject(addrs[0]['local-address']))
			return '%s/%d'.format(addrs[0]['local-address'].address, addrs[0]['local-address'].mask);

		return null;
	},

	/**
	 * 查询本逻辑接口的所有 IPv6 地址（含前缀分配中的本地地址，去重）。
	 *
	 * @returns {string[]}
	 * 返回 CIDR 格式的 IPv6 地址数组（如 `['2001:db8::1/64']`）；无地址时返回空数组。
	 */
	getIP6Addrs() {
		let addrs = this._ubus('ipv6-address');
		const rv = new Set();

		if (Array.isArray(addrs))
			for (let a of addrs)
				if (L.isObject(a))
					rv.add('%s/%d'.format(a.address, a.mask));

		addrs = this._ubus('ipv6-prefix-assignment');

		if (Array.isArray(addrs))
			for (let a of addrs)
				if (L.isObject(a) && L.isObject(a['local-address']))
					rv.add('%s/%d'.format(a['local-address'].address, a['local-address'].mask));

		return Array.from(rv);
	},

	/**
	 * 查询本逻辑接口关联的 IPv6 默认路由的网关地址（下一跳）。
	 *
	 * @returns {string}
	 * 返回 IPv6 默认路由的网关地址（如 `'fe80::1'`）；未找到则返回 `null`。
	 */
	getGateway6Addr() {
		const routes = this._ubus('route');

		if (Array.isArray(routes))
			for (let r of routes)
				if (typeof(r) == 'object' &&
				    r.target == '::' &&
				    r.mask == 0)
				    return r.nexthop;

		return null;
	},

	/**
	 * 查询本逻辑接口关联的 IPv6 DNS 服务器列表。
	 *
	 * @returns {string[]}
	 * 返回 IPv6 DNS 服务器地址数组（过滤掉 IPv4 地址）；无 DNS 信息时返回空数组。
	 */
	getDNS6Addrs() {
		const addrs = this._ubus('dns-server');
		const rv = [];

		if (Array.isArray(addrs))
			for (let a of addrs)
				if (/:/.test(a))
					rv.push(a);

		return rv;
	},

	/**
	 * 查询本逻辑接口关联的首个被路由的 IPv6 前缀。
	 *
	 * @returns {null|string}
	 * 返回 CIDR 格式的 IPv6 前缀（如 `'2001:db8::/48'`）；无前缀时返回 `null`。
	 */
	getIP6Prefix() {
		const prefixes = this._ubus('ipv6-prefix');

		if (Array.isArray(prefixes) && L.isObject(prefixes[0]))
			return '%s/%d'.format(prefixes[0].address, prefixes[0].mask);

		return null;
	},

	/**
	 * 查询本逻辑接口关联的所有已路由 IPv6 前缀列表。
	 *
	 * @returns {null|string[]}
	 * 返回 CIDR 格式的 IPv6 前缀数组（如 `['2001:db8::/48']`）；无前缀时返回 `null`。
	 */
	getIP6Prefixes() {
		const prefixes = this._ubus('ipv6-prefix');
		const rv = [];

		if (Array.isArray(prefixes))
			for (let p of prefixes)
				if (L.isObject(p))
					rv.push('%s/%d'.format(p.address, p.mask));

		return rv.length > 0 ? rv: null;
	},

	/**
	 * 查询 ubus 运行时状态中发布的接口错误消息列表。
	 *
	 * 当远端协议处理程序建立接口失败时（如配置错误、网络不通），会发布错误码。
	 * 此函数将错误码翻译为可读消息，优先使用
	 * {@link LuCI.network#registerErrorCode registerErrorCode()} 注册的翻译，
	 * 找不到时回退为 `'Unknown error (CODE)'` 格式。
	 *
	 * @returns {string[]}
	 * 返回已翻译的接口错误消息字符串数组；无错误时返回 `null`。
	 */
	getErrors() {
		const errors = this._ubus('errors');
		let rv = null;

		if (Array.isArray(errors)) {
			for (let e of errors) {
				if (!L.isObject(e) || typeof(e.code) != 'string')
					continue;

				rv = rv || [];
				rv.push(proto_errors[e.code] || _('Unknown error (%s)').format(e.code));
			}
		}

		return rv;
	},

	/**
	 * 检查底层逻辑接口是否被声明为桥接接口（bridge）。
	 *
	 * @returns {boolean}
	 * 当接口设置了 `option type bridge` 且协议实现未标记为虚拟时返回 `true`；否则返回 `false`。
	 */
	isBridge() {
		return (!this.isVirtual() && this.getType() == 'bridge');
	},

	/**
	 * 获取提供本协议功能所需的 opkg 软件包名称。
	 * 当配置引用了尚未安装的协议处理程序时用于提示用户安装对应包。
	 *
	 * 协议特定子类应覆盖此方法。
	 *
	 * @abstract
	 *
	 * @returns {string}
	 * 返回所需软件包名，如 `dhcpv6` 协议对应 `'odhcp6c'`；基类返回 `null`。
	 */
	getPackageName() {
		return null;
	},

	/**
	 * 检查协议处理程序是否允许创建新接口（如设备是否存在、协议是否就绪）。
	 *
	 * 协议特定子类应覆盖此方法以实现实际的可创建性检查逻辑。
	 *
	 * @abstract
	 *
	 * @param {string} ifname
	 * 要创建的接口名称。
	 *
	 * @returns {Promise<void>}
	 * 可创建时 resolve；不可创建时 reject 并携带错误消息字符串。
	 */
	isCreateable(ifname) {
		return Promise.resolve(null);
	},

	/**
	 * 检查协议功能是否已安装。
	 *
	 * 此函数仅为兼容旧代码而保留，始终返回 `true`，请勿在新代码中使用。
	 *
	 * @deprecated 已废弃
	 * @abstract
	 *
	 * @returns {boolean}
	 * 始终返回 `true`。
	 */
	isInstalled() {
		return true;
	},

	/**
	 * 检查本协议是否为"虚拟"协议。
	 *
	 * 虚拟协议按需创建自身专属接口，而不使用已有物理接口。
	 * 虚拟协议示例：`6in4`、`gre`（启动时创建隧道设备）。
	 * 非虚拟协议示例：`dhcp`、`static`（在已有接口上配置 IP）。
	 *
	 * 子类应覆盖此方法，对应 netifd 协议规格中的 `no_device` 属性。
	 *
	 * @returns {boolean}
	 * 返回 `true` 表示协议会动态创建接口；返回 `false` 表示使用已有接口。
	 */
	isVirtual() {
		return false;
	},

	/**
	 * 检查本协议是否为"浮动"协议。
	 *
	 * 浮动协议类似虚拟协议，按需创建接口，但依赖已有底层接口来建立连接。
	 * 典型例子：`pppoe`（在 eth 上创建 ppp 设备，L3 与 L2 设备不同）。
	 *
	 * 此函数仅为向后兼容旧代码而保留，请勿在新代码中使用。
	 *
	 * @deprecated 已废弃
	 * @returns {boolean}
	 * 返回 `true` 表示浮动协议；返回 `false` 表示非浮动。
	 */
	isFloating() {
		return false;
	},

	/**
	 * 检查本逻辑接口是否为动态接口。
	 *
	 * 动态接口是 netifd 在运行时自动创建的接口（如另一接口的子接口），
	 * 没有对应的 UCI 用户配置。动态接口不能被编辑，只能关闭或重启。
	 *
	 * @returns {boolean}
	 * 返回 `true` 表示动态创建的接口；返回 `false` 表示由用户配置的普通接口。
	 */
	isDynamic() {
		return (this._ubus('dynamic') == true);
	},

	/**
	 * 检查本逻辑接口是否处于 pending（等待）状态。
	 *
	 * 处于 pending 状态的接口通常正在等待某个条件（如链路就绪、拨号完成）。
	 *
	 * @returns {boolean}
	 * 接口处于 pending 状态返回 `true`；否则返回 `false`。
	 */
	isPending() {
		return (this._ubus('pending') == true);
	},

	/**
	 * 检查本接口是否为别名接口（alias）。
	 *
	 * 别名接口叠加在另一接口之上，在 UCI `device` 选项中以 `@接口名` 记法表示。
	 * 别名接口继承父接口的网络设备，通常用于在同一设备上配置多个 IP 地址段。
	 *
	 * @returns {null|string}
	 * 若为别名接口，返回父接口名（如 `'lan'`）；否则返回 `null`。
	 */
	isAlias() {
		const ifnames = L.toArray(uci.get('network', this.sid, 'device'));
		let parent = null;

		for (let ifn of ifnames)
			if (ifn.charAt(0) == '@')
				parent = ifn.substr(1);
			else if (parent != null)
				parent = null;

		return parent;
	},

	/**
	 * 检查本逻辑接口是否为"空"接口，即未绑定任何网络设备。
	 *
	 * 浮动协议（如 pppoe）始终不被视为空。空接口通常是刚创建但尚未完成配置的接口。
	 *
	 * @returns {boolean}
	 * 未绑定设备返回 `true`；已绑定设备（含无线网络）返回 `false`。
	 */
	isEmpty() {
		if (this.isFloating())
			return false;

		let empty = true;
	    const device = this._get('device');

		if (device != null && device.match(/\S+/))
			empty = false;

		if (empty == true && getWifiNetidBySid(this.sid) != null)
			empty = false;

		return empty;
	},

	/**
	 * 检查本逻辑接口是否已配置并正在运行（up 状态）。
	 *
	 * @returns {boolean}
	 * 接口处于 up 状态返回 `true`；接口 down 或未启动返回 `false`。
	 */
	isUp() {
		return (this._ubus('up') == true);
	},

	/**
	 * 将指定网络设备添加到本逻辑接口的设备列表（追加到 UCI `device` 选项）。
	 *
	 * @param {LuCI.network.Protocol|LuCI.network.Device|LuCI.network.WifiDevice|LuCI.network.WifiNetwork|string} device
	 * 要添加的设备对象或设备名字符串。若传入的不是字符串，
	 * 将通过 {@link LuCI.network#getIfnameOf Network.getIfnameOf()} 自动解析。
	 *
	 * @returns {boolean}
	 * 成功添加返回 `true`；若参数无效、设备已在该接口中或接口为虚拟类型则返回 `false`。
	 */
	addDevice(device) {
		device = ifnameOf(device);

		if (device == null || this.isFloating())
			return false;

		const wif = getWifiSidByIfname(device);

		if (wif != null)
			return appendValue('wireless', wif, 'network', this.sid);

		return appendValue('network', this.sid, 'device', device);
	},

	/**
	 * 从本逻辑接口的设备列表中移除指定网络设备（从 UCI `device` 选项中删除）。
	 *
	 * @param {LuCI.network.Protocol|LuCI.network.Device|LuCI.network.WifiDevice|LuCI.network.WifiNetwork|string} device
	 * 要移除的设备对象或设备名字符串。若传入的不是字符串，
	 * 将通过 {@link LuCI.network#getIfnameOf Network.getIfnameOf()} 自动解析。
	 *
	 * @returns {boolean}
	 * 成功移除返回 `true`；若参数无效、设备不在该接口中或接口为虚拟类型则返回 `false`。
	 */
	deleteDevice(device) {
		let rv = false;

		device = ifnameOf(device);

		if (device == null || this.isFloating())
			return false;

		const wif = getWifiSidByIfname(device);

		if (wif != null)
			rv = removeValue('wireless', wif, 'network', this.sid);

		if (removeValue('network', this.sid, 'device', device))
			rv = true;

		return rv;
	},

	/**
	 * 获取与本逻辑接口关联的 Linux 网络设备实例（依配置优先 L2，浮动协议取 L3）。
	 *
	 * @returns {LuCI.network.Device}
	 * 返回关联的 `Network.Device` 实例；逻辑接口未连接时返回 `null`。
	 */
	getDevice() {
		if (this.isVirtual()) {
			const ifname = '%s-%s'.format(this.getProtocol(), this.sid);
			_state.isTunnel[this.getProtocol() + '-' + this.sid] = true;
			return Network.prototype.instantiateDevice(ifname, this);
		}
		else if (this.isBridge()) {
			const ifname = 'br-%s'.format(this.sid);
			_state.isBridge[ifname] = true;
			return new Device(ifname, this);
		}
		else {
			const ifnames = L.toArray(uci.get('network', this.sid, 'device'));

			for (let ifn of ifnames) {
				const m = ifn.match(/^([^:/]+)/);
				return ((m && m[1]) ? Network.prototype.instantiateDevice(m[1], this) : null);
			}

			const ifname = getWifiNetidByNetname(this.sid);

			return (ifname != null ? Network.prototype.instantiateDevice(ifname[0], this) : null);
		}
	},

	/**
	 * 获取当前与本逻辑接口关联的 L2（数据链路层）Linux 网络设备实例。
	 *
	 * @returns {LuCI.network.Device}
	 * 返回 L2 设备的 `Network.Device` 实例；未连接时返回 `null`。
	 */
	getL2Device() {
		const ifname = this._ubus('device');
		return (ifname != null ? Network.prototype.instantiateDevice(ifname, this) : null);
	},

	/**
	 * 获取当前与本逻辑接口关联的 L3（网络层）Linux 网络设备实例。
	 * 对于 PPP/PPPoE 等浮动协议，L3 设备（ppp0）与 L2 设备（eth0）不同。
	 *
	 * @returns {LuCI.network.Device}
	 * 返回 L3 设备的 `Network.Device` 实例；未连接时返回 `null`。
	 */
	getL3Device() {
		const ifname = this._ubus('l3_device');
		return (ifname != null ? Network.prototype.instantiateDevice(ifname, this) : null);
	},

	/**
	 * 获取与本逻辑接口关联的子设备列表（如桥接成员端口、绑定成员接口等）。
	 *
	 * @returns {null|Array<LuCI.network.Device>}
	 * 返回子设备的 `Network.Device` 实例数组；接口为虚拟类型（非桥接）时返回 `null`。
	 */
	getDevices() {
		const rv = [];

		if (!this.isBridge() && !(this.isVirtual() && !this.isFloating()))
			return null;

		const device = uci.get('network', this.sid, 'device');

		if (device && device.charAt(0) != '@') {
			const m = device.match(/^([^:/]+)/);
			if (m != null)
				rv.push(Network.prototype.instantiateDevice(m[1], this));
		}

		const uciWifiIfaces = uci.sections('wireless', 'wifi-iface');

		for (let wf_if of uciWifiIfaces) {
			if (typeof(wf_if.device) != 'string')
				continue;

			const networks = L.toArray(wf_if.network);

			for (let n of networks) {
				if (n != this.sid)
					continue;

				const netid = getWifiNetidBySid(wf_if['.name']);

				if (netid != null)
					rv.push(Network.prototype.instantiateDevice(netid[0], this));
			}
		}

		rv.sort(deviceSort);

		return rv;
	},

	/**
	 * 检查本逻辑接口是否包含指定的设备。
	 *
	 * @param {LuCI.network.Protocol|LuCI.network.Device|LuCI.network.WifiDevice|LuCI.network.WifiNetwork|string} device
	 * 要检查的设备对象或设备名字符串。若不是字符串，则通过
	 * {@link LuCI.network#getIfnameOf Network.getIfnameOf()} 自动解析为设备名。
	 *
	 * @returns {boolean}
	 * 包含该设备返回 `true`；不包含返回 `false`。
	 */
	containsDevice(device) {
		device = ifnameOf(device);

		if (device == null)
			return false;
		else if (this.isVirtual() && '%s-%s'.format(this.getProtocol(), this.sid) == device)
			return true;
		else if (this.isBridge() && 'br-%s'.format(this.sid) == device)
			return true;

		const name = uci.get('network', this.sid, 'device');
		if (name) {
			const m = name.match(/^([^:/]+)/);
			if (m != null && m[1] == device)
				return true;
		}

		const wif = getWifiSidByIfname(device);

		if (wif != null) {
			const networks = L.toArray(uci.get('wireless', wif, 'network'));

			for (let n of networks)
				if (n == this.sid)
					return true;
		}

		return false;
	},

	/**
	 * 清理与本协议相关的附属配置条目。
	 *
	 * 当接口即将从配置中删除时此函数将被调用，负责清理相关配置中的附属 UCI 条目
	 *（如 relayd 协议的中继配置、VPN 隧道配置等）。
	 *
	 * 协议特定子类应覆盖此方法以实现特定的清理逻辑。
	 *
	 * @abstract
	 *
	 * @returns {*|Promise<*>}
	 * 可返回 Promise，在继续删除配置前会等待其完成。非 Promise 返回值及已 resolve 的值将被忽略。
	 * 若返回的 Promise 被 reject，则整个接口删除流程将被中止。
	 */
	deleteConfiguration() {}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `Network.Device` 类实例代表底层 Linux 网络设备，
 * 提供查询设备详细信息（如数据包统计、MTU、MAC 地址、接口类型等）的功能。
 */
Device = baseclass.extend(/** @lends LuCI.network.Device.prototype */ {
	__init__(device, network) {
		const wif = getWifiSidByIfname(device);

		if (wif != null) {
			const res = getWifiStateBySid(wif) || [];
			const netid = getWifiNetidBySid(wif) || [];

			this.wif    = new WifiNetwork(wif, res[0], res[1], netid[0], res[2], { ifname: device });
			this.device = this.wif.getIfname();
		}

		this.device  = this.device || device;
		this.dev     = Object.assign({}, _state.netdevs[this.device]);
		this.network = network;

		let conf;

		uci.sections('network', 'device', function(s) {
			if (s.name == device)
				conf = s;
		});

		this.config  = Object.assign({}, conf);
	},

	_devstate(/* ... */) {
		let rv = this.dev;

		for (let a of arguments)
			if (L.isObject(rv))
				rv = rv[a];
			else
				return null;

		return rv;
	},

	/**
	 * 获取网络设备的 Linux 名称。
	 *
	 * @returns {string}
	 * 返回设备名称字符串，如 `'eth0'`、`'br-lan'`、`'wlan0'`。
	 */
	getName() {
		return (this.wif != null ? this.wif.getIfname() : this.device);
	},

	/**
	 * 获取设备的 MAC 地址。
	 *
	 * @returns {null|string}
	 * 返回 MAC 地址字符串（如 `'aa:bb:cc:dd:ee:ff'`）；非以太网隧道设备等无 MAC 的情况返回 `null`。
	 */
	getMAC() {
		const mac = this._devstate('macaddr');
		return mac ? mac.toUpperCase() : null;
	},

	/**
	 * 获取设备的最大传输单元（MTU）。
	 *
	 * @returns {number}
	 * 返回 MTU 值（字节数，如以太网默认为 `1500`）。
	 */
	getMTU() {
		return this._devstate('mtu');
	},

	/**
	 * 获取设备上配置的所有 IPv4 地址列表。
	 *
	 * @returns {string[]}
	 * 返回 IPv4 地址字符串数组；无地址时返回空数组。
	 */
	getIPAddrs() {
		const addrs = this._devstate('ipaddrs');
		return (Array.isArray(addrs) ? addrs : []);
	},

	/**
	 * 获取设备上配置的所有 IPv6 地址列表。
	 *
	 * @returns {string[]}
	 * 返回 IPv6 地址字符串数组；无地址时返回空数组。
	 */
	getIP6Addrs() {
		const addrs = this._devstate('ip6addrs');
		return (Array.isArray(addrs) ? addrs : []);
	},

	/**
	 * 获取设备类型标识字符串。
	 *
	 * @returns {string}
	 * 返回描述设备类型的字符串：
	 *  - `'alias'`    : 抽象别名设备（`@` 记法）
	 *  - `'wifi'`     : 无线接口（如 `wlan0`）
	 *  - `'bridge'`   : Linux 网桥（如 `br-lan`）
	 *  - `'tunnel'`   : tun/tap 隧道设备（如 `tun0`）
	 *  - `'vlan'`     : VLAN 设备（如 `eth0.1`）
	 *  - `'vrf'`      : 虚拟路由转发设备（如 `vrf0`）
	 *  - `'switch'`   : 交换机端口设备（如连接到 switch0 的 `eth1`）
	 *  - `'ethernet'` : 其他所有设备类型（普通以太网）
	 */
	getType() {
		if (this.device != null && this.device.charAt(0) == '@')
			return 'alias';
		else if (this.dev.devtype == 'wlan' || this.wif != null || isWifiIfname(this.device))
			return 'wifi';
		else if (this.dev.devtype == 'bridge' || _state.isBridge[this.device])
			return 'bridge';
		else if (this.dev.devtype == 'wireguard')
			return 'wireguard';
		else if (_state.isTunnel[this.device])
			return 'tunnel';
		else if (this.dev.devtype == 'vlan' || this.device.indexOf('.') > -1)
			return 'vlan';
		else if (this.dev.devtype == 'dsa' || _state.isSwitch[this.device])
			return 'switch';
		else if (this.config.type == '8021q' || this.config.type == '8021ad')
			return 'vlan';
		else if (this.config.type == 'bridge')
			return 'bridge';
		else if (this.config.type == 'vrf')
			return 'vrf';
		else
			return 'ethernet';
	},

	/**
	 * 获取设备的简短描述字符串。
	 *
	 * @returns {string}
	 * 非 WiFi 设备返回设备名；WiFi 设备返回包含操作模式和 SSID 的字符串。
	 */
	getShortName() {
		if (this.wif != null)
			return this.wif.getShortName();

		return this.device;
	},

	/**
	 * 获取设备的详细描述字符串（设备类型 + 名称，或 WiFi 的模式 + SSID）。
	 *
	 * @returns {string}
	 * 非 WiFi 设备返回类型描述和设备名；WiFi 设备返回操作模式和 SSID。
	 */
	getI18n() {
		if (this.wif != null) {
			return '%s: %s "%s"'.format(
				_('Wireless Network'),
				this.wif.getActiveMode(),
				this.wif.getActiveSSID() || this.wif.getActiveBSSID() || this.wif.getID() || '?');
		}

		return '%s: "%s"'.format(this.getTypeI18n(), this.getName());
	},

	/**
	 * 获取设备类型的可读描述字符串（用于界面显示）。
	 *
	 * @returns {string}
	 * 返回类型描述字符串，如 `'Wireless Adapter'`（无线适配器）、`'Bridge'`（网桥）等。
	 */
	getTypeI18n() {
		switch (this.getType()) {
		case 'alias':
			return _('Alias Interface');

		case 'wifi':
			return _('Wireless Adapter');

		case 'bridge':
			return _('Bridge');

		case 'vrf':
			return _('Virtual Routing and Forwarding (VRF)');

		case 'switch':
			return (_state.netdevs[this.device] && _state.netdevs[this.device].devtype == 'dsa')
				? _('Switch port') : _('Ethernet Switch');

		case 'vlan':
			return (_state.isSwitch[this.device] ? _('Switch VLAN') : _('Software VLAN'));

		case 'wireguard':
			return _('WireGuard Interface');

		case 'tunnel':
			return _('Tunnel Interface');

		default:
			return _('Ethernet Adapter');
		}
	},

	/**
	 * 获取本网桥设备的所有成员端口（从接口）。
	 *
	 * @returns {null|Array<LuCI.network.Device>}
	 * 返回成员端口的 `Network.Device` 实例数组；本设备不是 Linux 网桥则返回 `null`。
	 */
	getPorts() {
		const br = _state.bridges[this.device];
		const rv = [];

		if (br == null || !Array.isArray(br.ifnames))
			return null;

		for (let ifn of br.ifnames)
			rv.push(Network.prototype.instantiateDevice(ifn.name));

		rv.sort(deviceSort);

		return rv;
	},

	/**
	 * 获取网桥 ID（Bridge ID）。
	 *
	 * @returns {null|string}
	 * 返回网桥 ID 字符串；本设备不是 Linux 网桥时返回 `null`。
	 */
	getBridgeID() {
		const br = _state.bridges[this.device];
		return (br != null ? br.id : null);
	},

	/**
	 * 获取网桥的 STP（生成树协议）开关状态。
	 *
	 * @returns {boolean}
	 * 本设备是 Linux 网桥且已启用 STP 时返回 `true`；否则返回 `false`。
	 */
	getBridgeSTP() {
		const br = _state.bridges[this.device];
		return (br != null ? !!br.stp : false);
	},

	/**
	 * 检查设备是否处于 up（运行）状态。
	 *
	 * @returns {boolean}
	 * 设备正在运行返回 `true`；设备 down 或不存在返回 `false`。
	 */
	isUp() {
		let up = this._devstate('flags', 'up');

		if (up == null)
			up = (this.getType() == 'alias');

		return up;
	},

	/**
	 * 检查本设备是否为 Linux 网桥。
	 *
	 * @returns {boolean}
	 * 是 Linux 网桥返回 `true`；否则返回 `false`。
	 */
	isBridge() {
		return (this.getType() == 'bridge');
	},

	/**
	 * 检查本设备是否为某个 Linux 网桥的成员端口。
	 *
	 * @returns {boolean}
	 * 是网桥成员端口返回 `true`；否则返回 `false`。
	 */
	isBridgePort() {
		return (this._devstate('bridge') != null);
	},

	/**
	 * 获取设备的累计发送字节数。
	 *
	 * @returns {number}
	 * 返回设备自上次重置以来发送的总字节数。
	 */
	getTXBytes() {
		const stat = this._devstate('stats');
		return (stat != null ? stat.tx_bytes || 0 : 0);
	},

	/**
	 * 获取设备的累计接收字节数。
	 *
	 * @returns {number}
	 * 返回设备自上次重置以来接收的总字节数。
	 */
	getRXBytes() {
		const stat = this._devstate('stats');
		return (stat != null ? stat.rx_bytes || 0 : 0);
	},

	/**
	 * 获取设备的累计发送数据包数量。
	 *
	 * @returns {number}
	 * 返回设备自上次重置以来发送的总数据包数。
	 */
	getTXPackets() {
		const stat = this._devstate('stats');
		return (stat != null ? stat.tx_packets || 0 : 0);
	},

	/**
	 * 获取设备的累计接收数据包数量。
	 *
	 * @returns {number}
	 * 返回设备自上次重置以来接收的总数据包数。
	 */
	getRXPackets() {
		const stat = this._devstate('stats');
		return (stat != null ? stat.rx_packets || 0 : 0);
	},

	/**
	 * 获取网络设备的载波状态（是否有物理链路）。
	 *
	 * @returns {boolean}
	 * 有载波（如网线已插入或无线链路已建立）返回 `true`；否则返回 `false`。
	 */
	getCarrier() {
		const link = this._devstate('link');
		return (link != null ? link.carrier || false : false);
	},

	/**
	 * 获取网络设备当前的链路速率（若可用）。
	 *
	 * @returns {number|null}
	 * 返回以 Mbps 为单位的链路速率（如 `1000`、`100`）；
	 * 设备不支持以太网速率返回 `null`；支持以太网但无载波时返回 `-1`。
	 */
	getSpeed() {
		const link = this._devstate('link');
		return (link != null ? link.speed || null : null);
	},

	/**
	 * 获取网络设备当前的双工模式（若可用）。
	 *
	 * @returns {string|null}
	 * 返回 `'full'`（全双工）或 `'half'`（半双工）；双工状态未知或不支持时返回 `null`。
	 */
	getDuplex() {
		const link = this._devstate('link');
		const duplex = link ? link.duplex : null;

		return (duplex != 'unknown') ? duplex : null;
	},

	/**
	 * 获取设备的 PSE（供电设备 / PoE）状态信息对象。
	 *
	 * @returns {Object|null}
	 * 返回包含 PSE 状态信息的对象；设备不支持 PoE 时返回 `null`。
	 * 对象可能包含以下字段：
	 * - `c33AdminState`         : `'enabled'` 或 `'disabled'`（C33 PoE 管理状态）
	 * - `c33PowerStatus`        : 供电状态（`'disabled'`/`'searching'`/`'delivering'`/`'fault'` 等）
	 * - `c33PowerClass`         : 功率等级（1-8）
	 * - `c33ActualPower`        : 实际功耗（单位：mW）
	 * - `c33AvailablePowerLimit`: 可用功率限制（单位：mW）
	 * - `podlAdminState`        : PoDL 管理状态
	 * - `podlPowerStatus`       : PoDL 供电状态
	 * - `priority`              : 当前优先级
	 * - `priorityMax`           : 最大优先级
	 */
	getPSE() {
		const pse = this._devstate('pse');
		if (!pse)
			return null;

		return {
			c33AdminState: pse['c33-admin-state'] || null,
			c33PowerStatus: pse['c33-power-status'] || null,
			c33PowerClass: pse['c33-power-class'] || null,
			c33ActualPower: pse['c33-actual-power'] || null,
			c33AvailablePowerLimit: pse['c33-available-power-limit'] || null,
			podlAdminState: pse['podl-admin-state'] || null,
			podlPowerStatus: pse['podl-power-status'] || null,
			priority: pse['priority'] || null,
			priorityMax: pse['priority-max'] || null
		};
	},

	/**
	 * 检查本设备是否具备 PSE（PoE 供电）硬件能力。
	 *
	 * @returns {boolean}
	 * 具备 PSE 硬件返回 `true`；否则返回 `false`。
	 */
	hasPSE() {
		return this._devstate('pse') != null;
	},

	/**
	 * 获取本设备所属的首个逻辑接口实例。
	 *
	 * @returns {null|LuCI.network.Protocol}
	 * 返回对应的 `Network.Protocol` 实例；设备未分配给任何接口时返回 `null`。
	 */
	getNetwork() {
		return this.getNetworks()[0];
	},

	/**
	 * 获取本设备所属的所有逻辑接口实例列表。
	 * 一个设备可以同时属于多个逻辑接口（如 LAN 桥和无线 AP 同时绑定到 br-lan）。
	 *
	 * @returns {Array<LuCI.network.Protocol>}
	 * 返回所属逻辑接口的 `Network.Protocol` 实例数组；未分配时返回空数组。
	 */
	getNetworks() {
		if (this.networks == null) {
			this.networks = [];

			const networks = enumerateNetworks.apply(L.network);

			for (let n of networks)
				if (n.containsDevice(this.device) || n.getIfname() == this.device)
					this.networks.push(n);

			this.networks.sort(networkSort);
		}

		return this.networks;
	},

	/**
	 * 获取与本设备关联的无线网络实例。
	 *
	 * @returns {null|LuCI.network.WifiNetwork}
	 * 返回关联的 `WifiNetwork` 实例；本设备不是无线设备时返回 `null`。
	 */
	getWifiNetwork() {
		return (this.wif != null ? this.wif : null);
	},

	/**
	 * 获取本设备的逻辑父设备。
	 *
	 * DSA 交换机端口的父设备为 DSA switch 主设备；VLAN 设备的父设备为基础设备；
	 * 普通以太网接口无父设备。
	 *
	 * @returns {null|LuCI.network.Device}
	 * 返回父设备的 `Network.Device` 实例；无父设备时返回 `null`。
	 */
	getParent() {
		if (this.dev.parent)
			return Network.prototype.instantiateDevice(this.dev.parent);

		if ((this.config.type == '8021q' || this.config.type == '802ad') && typeof(this.config.ifname) == 'string')
			return Network.prototype.instantiateDevice(this.config.ifname);

		return null;
	}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `Network.WifiDevice` 类实例代表系统中存在的无线射频设备（radio），
 * 提供无线能力查询（支持的频段、信道、加密类型等）以及枚举关联无线网络的方法。
 */
WifiDevice = baseclass.extend(/** @lends LuCI.network.WifiDevice.prototype */ {
	__init__(name, radiostate) {
		const uciWifiDevice = uci.get('wireless', name);

		if (uciWifiDevice != null &&
		    uciWifiDevice['.type'] == 'wifi-device' &&
		    uciWifiDevice['.name'] != null) {
			this.sid    = uciWifiDevice['.name'];
		}

		this.sid    = this.sid || name;
		this._ubusdata = {
			radio: name,
			dev:   radiostate
		};
	},

	/* private */
	ubus(/* ... */) {
		let v = this._ubusdata;

		for (let a of arguments)
			if (L.isObject(v))
				v = v[a];
			else
				return null;

		return v;
	},

	/**
	 * 读取本无线设备的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'channel'`、`'hwmode'`、`'txpower'`。
	 *
	 * @returns {null|string|string[]}
	 * 返回 UCI 选项值（list 类型为字符串数组）；选项不存在则返回 `null`。
	 */
	get(opt) {
		return uci.get('wireless', this.sid, opt);
	},

	/**
	 * 设置本网络接口的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'ipaddr'`、`'netmask'`、`'proto'`。
	 *
	 * @param {null|string|string[]} value
	 * 要设置的值（list 类型传数组）；传入 `null` 将删除该选项（等价于 uci.unset）。
	 * @returns {null}
	 */
	set(opt, value) {
		return uci.set('wireless', this.sid, opt, value);
	},

	/**
	 * 检查本无线射频设备是否被禁用。
	 *
	 * @returns {boolean}
	 * 当 ubus 运行时状态标记为 disabled，或 UCI 配置中设置了 `disabled` 选项时返回 `true`；否则返回 `false`。
	 */
	isDisabled() {
		return this.ubus('dev', 'disabled') || this.get('disabled') == '1';
	},

	/**
	 * 获取本无线射频设备的 UCI 配置名称（也用作唯一逻辑标识符）。
	 *
	 * @returns {string}
	 * 返回对应 `wifi-device` section 的 UCI 名称，如 `'radio0'`，同时也是该无线 phy 的唯一 ID。
	 */
	getName() {
		return this.sid;
	},

	/**
	 * 获取本无线射频设备支持的硬件模式（hwmode）列表。
	 * hwmode 描述 phy 支持的频段和无线标准版本。
	 *
	 * @returns {string[]}
	 * 返回 hwmode 字符串数组，已知值：
	 *  - `'a'`  - 传统 802.11a 模式，5 GHz，最高 54 Mbit/s
	 *  - `'b'`  - 传统 802.11b 模式，2.4 GHz，最高 11 Mbit/s
	 *  - `'g'`  - 传统 802.11g 模式，2.4 GHz，最高 54 Mbit/s
	 *  - `'n'`  - IEEE 802.11n 模式，2.4 或 5 GHz，最高 600 Mbit/s
	 *  - `'ac'` - IEEE 802.11ac 模式，5 GHz，最高 6770 Mbit/s
	 *  - `'ax'` - IEEE 802.11ax 模式（Wi-Fi 6），2.4 或 5 GHz
	 *  - `'be'` - IEEE 802.11be 模式（Wi-Fi 7），2.4、5 或 6 GHz
	 */
	getHWModes() {
		const hwmodes = this.ubus('dev', 'iwinfo', 'hwmodes');
		return Array.isArray(hwmodes) ? hwmodes : [ 'b', 'g' ];
	},

	/**
	 * 获取本无线射频设备支持的信道宽度模式（htmode）列表。
	 *
	 * @returns {string[]}
	 * 返回 htmode 字符串数组，已知值：
	 *  - `'HT20'`   - 802.11n，20 MHz 信道
	 *  - `'HT40'`   - 802.11n，40 MHz 信道
	 *  - `'VHT20'`  - 802.11ac，20 MHz 信道
	 *  - `'VHT40'`  - 802.11ac，40 MHz 信道
	 *  - `'VHT80'`  - 802.11ac，80 MHz 信道
	 *  - `'VHT160'` - 802.11ac，160 MHz 信道
	 *  - `'HE20'`   - 802.11ax，20 MHz 信道
	 *  - `'HE40'`   - 802.11ax，40 MHz 信道
	 *  - `'HE80'`   - 802.11ax，80 MHz 信道
	 *  - `'HE160'`  - 802.11ax，160 MHz 信道
	 *  - `'EHT20'`  - 802.11be，20 MHz 信道
	 *  - `'EHT40'`  - 802.11be，40 MHz 信道
	 *  - `'EHT80'`  - 802.11be，80 MHz 信道
	 *  - `'EHT160'` - 802.11be，160 MHz 信道
	 *  - `'EHT320'` - 802.11be，320 MHz 信道
	 */
	getHTModes() {
		const htmodes = this.ubus('dev', 'iwinfo', 'htmodes');
		return (Array.isArray(htmodes) && htmodes.length) ? htmodes : null;
	},

	/**
	 * 获取描述无线射频硬件的字符串（如芯片型号或驱动名称）。
	 *
	 * @returns {string}
	 * 返回描述字符串，如 `'Atheros AR9380 802.11bgn'`。
	 */
	getI18n() {
		const hw = this.ubus('dev', 'iwinfo', 'hardware');
		let type = L.isObject(hw) ? hw.name : null;
		const modes = this.ubus('dev', 'iwinfo', 'hwmodes_text');

		if (this.ubus('dev', 'iwinfo', 'type') == 'wl')
			type = 'Broadcom';

		return '%s %s Wireless Controller (%s)'.format(
			type || 'Generic',
			modes ? '802.11' + modes : 'unknown',
			this.getName());
	},

	/**
	 * A wireless scan result object describes a neighbouring wireless
	 * network found in the vicinity.
	 *
	 * @typedef {Object<string, number|string|LuCI.network.WifiEncryption>} WifiScanResult
	 * @memberof LuCI.network
	 *
	 * @property {string} ssid
	 * 网络的 SSID（基础设施/AP 模式）或 Mesh ID（Mesh 模式）。
	 *
	 * @property {string} bssid
	 * 网络的 BSSID（AP 的 MAC 地址）。
	 *
	 * @property {string} mode
	 * 网络的操作模式，可能为 `'Master'`（AP）、`'Ad-Hoc'`（点对点）或 `'Mesh Point'`（Mesh）。
	 *
	 * @property {number} channel
	 * 网络所在的无线信道编号。
	 *
	 * @property {number} signal
	 * 接收到的网络信号强度（单位：dBm）。
	 *
	 * @property {number} quality
	 * 信号质量的数值，可与 `quality_max` 结合计算百分比（`quality / quality_max * 100`）。
	 *
	 * @property {number} quality_max
	 * 信号质量的最大值，与 `quality` 配合用于计算信号质量百分比。
	 *
	 * @property {LuCI.network.WifiEncryption} encryption
	 * 该无线网络使用的加密类型，格式同 {@link LuCI.network.WifiEncryption}。
	 */

	/**
	 * 在本 radio 设备上触发无线扫描，获取附近可见网络列表。
	 * 注意：扫描期间 radio 可能短暂中断业务，且此调用耗时较长（通常 3-5 秒）。
	 *
	 * @returns {Promise<Array<LuCI.network.WifiScanResult>>}
	 * 返回扫描结果对象数组，每个对象描述一个发现的无线网络。
	 */
	getScanList() {
		return callIwinfoScan(this.sid);
	},

	/**
	 * 检查本无线射频设备是否在 ubus 运行时状态中标记为 up。
	 *
	 * @returns {boolean}
	 * radio 设备处于 up 状态返回 `true`；否则返回 `false`。
	 */
	isUp() {
		if (L.isObject(_state.radios[this.sid]))
			return (_state.radios[this.sid].up == true);

		return false;
	},

	/**
	 * 获取属于本 radio 设备的指定无线网络实例。
	 *
	 * @param {string} network
	 * 无线网络标识，支持三种格式：UCI section 名（如 `'wifinet0'`）、
	 * 网络 ID（如 `'radio0.network1'`）或 Linux 接口名（如 `'wlan0'`，通过 ubus 反向解析）。
	 *
	 * @returns {Promise<LuCI.network.WifiNetwork>}
	 * 返回对应的 `WifiNetwork` 实例 Promise；网络不存在或不属于本 radio 时 reject（值为 null）。
	 */
	getWifiNetwork(network) {
		return Network.prototype.getWifiNetwork(network).then(L.bind(function(networkInstance) {
			const uciWifiIface = (networkInstance.sid ? uci.get('wireless', networkInstance.sid) : null);

			if (uciWifiIface == null || uciWifiIface['.type'] != 'wifi-iface' || uciWifiIface.device != this.sid)
				return Promise.reject();

			return networkInstance;
		}, this));
	},

	/**
	 * 获取与本无线射频设备关联的所有无线网络实例列表。
	 *
	 * @returns {Promise<Array<LuCI.network.WifiNetwork>>}
	 * 返回该 radio 上所有 `WifiNetwork` 实例的数组；无关联网络时返回空数组。
	 */
	getWifiNetworks() {
		return Network.prototype.getWifiNetworks().then(L.bind(function(networks) {
			const rv = [];

			for (let n of networks)
				if (n.getWifiDeviceName() == this.getName())
					rv.push(n);

			return rv;
		}, this));
	},

	/**
	 * 向本 radio 设备添加新的无线网络（wifi-iface section）并设置指定选项。
	 *
	 * @param {Object<string, string|string[]>} [options]
	 * 新无线网络的 UCI 选项对象，常用选项：`mode`、`ssid`、`encryption`、`key`。
	 * 无需设置 `device`，本方法会自动填充。
	 *
	 * @returns {Promise<null|LuCI.network.WifiNetwork>}
	 * 返回描述新无线网络的 `WifiNetwork` 实例；选项无效时返回 `null`。
	 */
	addWifiNetwork(options) {
		if (!L.isObject(options))
			options = {};

		options.device = this.sid;

		return Network.prototype.addWifiNetwork(options);
	},

	/**
	 * 从配置中删除属于本 radio 设备的指定无线网络。
	 *
	 * @param {string} network
	 * 无线网络标识，支持 UCI section 名、网络 ID 或 Linux 接口名。
	 *
	 * @returns {Promise<boolean>}
	 * 删除成功返回 `true`；网络不存在或不属于本 radio 设备则返回 `false`。
	 */
	deleteWifiNetwork(network) {
		let sid = null;

		if (network instanceof WifiNetwork) {
			sid = network.sid;
		}
		else {
			const uciWifiIface = uci.get('wireless', network);

			if (uciWifiIface == null || uciWifiIface['.type'] != 'wifi-iface')
				sid = getWifiSidByIfname(network);
		}

		if (sid == null || uci.get('wireless', sid, 'device') != this.sid)
			return Promise.resolve(false);

		uci.remove('wireless', sid);

		return Promise.resolve(true);
	}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `Network.WifiNetwork` 实例代表在射频设备（radio）之上配置的一个无线网络虚拟接口（vif），
 * 提供查询网络运行时状态的函数（SSID、信号、加密、关联客户端等）。
 * 大多数射频设备支持同时运行多个此类虚拟网络（Multi-SSID）。
 */
WifiNetwork = baseclass.extend(/** @lends LuCI.network.WifiNetwork.prototype */ {
	__init__(sid, radioname, radiostate, netid, netstate, hostapd) {
		this.sid    = sid;
		this.netid  = netid;
		this._ubusdata = {
			hostapd: hostapd,
			radio:   radioname,
			dev:     radiostate,
			net:     netstate
		};
	},

	ubus(/* ... */) {
		let v = this._ubusdata;

		for (let a of arguments)
			if (L.isObject(v))
				v = v[a];
			else
				return null;

		return v;
	},

	/**
	 * 读取本无线网络的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'ssid'`、`'encryption'`、`'mode'`。
	 *
	 * @returns {null|string|string[]}
	 * 返回 UCI 选项值（list 类型为字符串数组）；选项不存在则返回 `null`。
	 */
	get(opt) {
		return uci.get('wireless', this.sid, opt);
	},

	/**
	 * 设置本网络接口的指定 UCI 选项值。
	 *
	 * @param {string} opt
	 * UCI 选项名，如 `'ipaddr'`、`'netmask'`、`'proto'`。
	 *
	 * @param {null|string|string[]} value
	 * 要设置的值（list 类型传数组）；传入 `null` 将删除该选项（等价于 uci.unset）。
	 * @returns {null}
	 */
	set(opt, value) {
		return uci.set('wireless', this.sid, opt, value);
	},

	/**
	 * 检查本无线网络是否被禁用。
	 *
	 * @returns {boolean}
	 * 当 ubus 中标记为 disabled 或 UCI 中设置了 `disabled` 选项时返回 `true`；否则返回 `false`。
	 */
	isDisabled() {
		return this.ubus('dev', 'disabled') || this.get('disabled') == '1';
	},

	/**
	 * 获取本无线网络配置的操作模式。
	 *
	 * @returns {string}
	 * 返回 UCI 中配置的操作模式字符串，可能的值：
	 *  - `'ap'`      : 主机 / AP 接入点模式
	 *  - `'sta'`     : 站点 / 客户端模式
	 *  - `'adhoc'`   : Ad-Hoc / IBSS 点对点模式
	 *  - `'mesh'`    : Mesh / 802.11s 网状网络模式
	 *  - `'monitor'` : 监控模式
	 */
	getMode() {
		return this.ubus('net', 'config', 'mode') || this.get('mode') || 'ap';
	},

	/**
	 * 获取本无线网络配置的 SSID。
	 *
	 * @returns {null|string}
	 * 返回 UCI 配置的 SSID 字符串；Mesh 模式下返回 `null`。
	 */
	getSSID() {
		if (this.getMode() == 'mesh')
			return null;

		return this.ubus('net', 'config', 'ssid') || this.get('ssid');
	},

	/**
	 * 获取本无线网络配置的 Mesh ID（仅 Mesh 模式有效）。
	 *
	 * @returns {null|string}
	 * 返回 UCI 配置的 Mesh ID 字符串；非 Mesh 模式时返回 `null`。
	 */
	getMeshID() {
		if (this.getMode() != 'mesh')
			return null;

		return this.ubus('net', 'config', 'mesh_id') || this.get('mesh_id');
	},

	/**
	 * 获取本无线网络配置的 BSSID（通常仅在 STA 模式下指定目标 AP）。
	 *
	 * @returns {null|string}
	 * 返回 BSSID 字符串（如 `'aa:bb:cc:dd:ee:ff'`）；未配置时返回 `null`。
	 */
	getBSSID() {
		return this.ubus('net', 'config', 'bssid') || this.get('bssid');
	},

	/**
	 * 获取本无线网络所附属的逻辑接口名称列表（UCI `network` 选项）。
	 *
	 * @returns {string[]}
	 * 返回逻辑接口名数组，如 `['lan']` 或 `['lan', 'guest']`。
	 */
	getNetworkNames() {
		return L.toArray(this.ubus('net', 'config', 'network') || this.get('network'));
	},

	/**
	 * 获取本无线网络的内部网络 ID（LuCI 专有标识符）。
	 *
	 * 网络 ID 格式为 `radio设备名.network序号`，用于通过 radio 名称和索引号唯一标识无线网络，
	 * 例如 `'radio0.network1'` 表示 radio0 上的第一个 wifi-iface。
	 *
	 * @returns {string}
	 * 返回 LuCI 网络 ID 字符串。
	 */
	getID() {
		return this.netid;
	},

	/**
	 * 获取本无线网络对应的 UCI section 配置 ID。
	 *
	 * @returns {string}
	 * 返回对应的 UCI section 名称（如 `'wifinet0'`、`'@wifi-iface[0]'`）。
	 */
	getName() {
		return this.sid;
	},

	/**
	 * 获取本无线网络对应的 Linux 网络接口名（从 ubus 运行时信息解析）。
	 *
	 * @returns {null|string}
	 * 返回 Linux 接口名（如 `'wlan0'`）；网络未配置或未启动时返回 `null`。
	 */
	getIfname() {
		let ifname = this.ubus('net', 'ifname') || this.ubus('net', 'iwinfo', 'ifname');

		if (ifname == null || ifname.match(/^(wifi|radio)\d/))
			ifname = this.netid;

		return ifname;
	},

	/**
	 * 获取本无线网络关联的 Linux VLAN 设备名列表（从 ubus 运行时信息解析）。
	 *
	 * @returns {string[]}
	 * 返回 VLAN 接口名数组（如 `['wlan0.100']`）；无 VLAN 设备时返回空数组。
	 */
	getVlanIfnames() {
		const vlans = L.toArray(this.ubus('net', 'vlans'));
		const ifnames = [];

		for (let v of vlans)
			ifnames.push(v['ifname']);

		return ifnames;
	},

	/**
	 * 获取本无线网络所在的射频设备名称。
	 *
	 * @returns {null|string}
	 * 返回 radio 设备名（如 `'radio0'`）；无法确定时返回 `null`。
	 */
	getWifiDeviceName() {
		return this.ubus('radio') || this.get('device');
	},

	/**
	 * 获取本无线网络所在的射频设备实例。
	 *
	 * @returns {null|LuCI.network.WifiDevice}
	 * 返回对应的 `WifiDevice` 实例；找不到关联 radio 时返回 `null`。
	 */
	getWifiDevice() {
		const radioname = this.getWifiDeviceName();

		if (radioname == null)
			return Promise.reject();

		return Network.prototype.getWifiDevice(radioname);
	},

	/**
	 * 检查本无线网络是否处于 up 状态。
	 *
	 * 由于 OpenWrt 通过统一的 hostapd 实例管理虚拟接口（而非单独控制每个 vif），
	 * 此函数实际查询的是关联 radio 设备的 up 状态，以其作为本网络的 up 指示。
	 *
	 * @returns {boolean}
	 * 关联 radio 处于 up 状态返回 `true`；否则返回 `false`。
	 */
	isUp() {
		const device = this.getDevice();

		if (device == null)
			return false;

		return device.isUp();
	},

	/**
	 * 从 ubus 运行时信息查询本无线网络当前的操作模式（英文标识名）。
	 *
	 * @returns {string}
	 * 返回 iwinfo 或 UCI 报告的模式名称，可能的值：
	 *  - `'Master'`        : AP 接入点模式
	 *  - `'Ad-Hoc'`        : 点对点模式
	 *  - `'Client'`        : 客户端/站点模式
	 *  - `'Monitor'`       : 监控模式
	 *  - `'Master (VLAN)'` : AP VLAN 模式
	 *  - `'WDS'`           : WDS 分布式系统模式
	 *  - `'Mesh Point'`    : 802.11s Mesh 网状网络
	 *  - `'P2P Client'`    : Wi-Fi Direct 客户端
	 *  - `'P2P Go'`        : Wi-Fi Direct 组主机
	 *  - `'Unknown'`       : 未知模式
	 */
	getActiveMode() {
		const mode = this.ubus('net', 'iwinfo', 'mode') || this.getMode();

		switch (mode) {
		case 'ap':      return 'Master';
		case 'sta':     return 'Client';
		case 'adhoc':   return 'Ad-Hoc';
		case 'mesh':    return 'Mesh Point';
		case 'monitor': return 'Monitor';
		default:        return mode;
		}
	},

	/**
	 * 从 ubus 运行时信息查询本无线网络当前的操作模式（本地化可读字符串，用于 UI 展示）。
	 *
	 * @returns {string}
	 * 返回经 i18n 翻译的模式名称，如 `'Access Point'`、`'Client'`、`'Mesh Point'` 等。
	 */
	getActiveModeI18n() {
		const mode = this.getActiveMode();

		switch (mode) {
		case 'Master':       return _('Access Point');
		case 'Ad-Hoc':       return _('Ad-Hoc');
		case 'Client':       return _('Client');
		case 'Monitor':      return _('Monitor');
		case 'Master(VLAN)': return _('Master (VLAN)');
		case 'WDS':          return _('WDS');
		case 'Mesh Point':   return _('Mesh Point');
		case 'P2P Client':   return _('P2P Client');
		case 'P2P Go':       return _('P2P Go');
		case 'Unknown':      return _('Unknown');
		default:             return mode;
		}
	},

	/**
	 * 从 ubus 运行时信息查询本无线网络当前实际的 SSID（活跃值）。
	 *
	 * @returns {string}
	 * 返回当前活跃的 SSID 或 Mesh ID 字符串；信息不可用时返回空字符串。
	 */
	getActiveSSID() {
		return this.ubus('net', 'iwinfo', 'ssid') || this.ubus('net', 'config', 'ssid') || this.get('ssid');
	},

	/**
	 * 从 ubus 运行时信息查询本无线网络当前实际的 BSSID（AP 的 MAC 地址）。
	 *
	 * @returns {string}
	 * 返回当前活跃的 BSSID 字符串（如 `'aa:bb:cc:dd:ee:ff'`）；信息不可用时返回空字符串。
	 */
	getActiveBSSID() {
		return this.ubus('net', 'iwinfo', 'bssid') || this.ubus('net', 'config', 'bssid') || this.get('bssid');
	},

	/**
	 * 从 ubus 运行时信息查询本无线网络当前实际的加密设置描述。
	 *
	 * @returns {string}
	 * 返回可读的加密描述字符串（如 `'WPA2 PSK (CCMP)'`）；无法获取时返回 `'-'`。
	 */
	getActiveEncryption() {
		return formatWifiEncryption(this.ubus('net', 'iwinfo', 'encryption')) || '-';
	},

	/**
	 * A wireless peer entry describes the properties of a remote wireless
	 * peer associated with a local network.
	 *
	 * @typedef {Object<string, boolean|number|string|LuCI.network.WifiRateEntry>} WifiPeerEntry
	 * @memberof LuCI.network
	 *
	 * @property {string} mac
	 * 已关联客户端的 MAC 地址（BSSID 格式，如 `'aa:bb:cc:dd:ee:ff'`）。
	 *
	 * @property {number} signal
	 * 从该客户端接收到的信号强度（单位：dBm，通常为负值，如 `-65`）。
	 *
	 * @property {number} [signal_avg]
	 * 驱动支持时的平均信号强度（单位：dBm）；不支持时为 `0` 或缺失。
	 *
	 * @property {number} [noise]
	 * radio 当前的噪底（单位：dBm）；驱动不支持时可能为 `0` 或缺失。
	 *
	 * @property {number} inactive
	 * 该客户端处于非活动状态的毫秒数（如处于省电休眠状态）。
	 *
	 * @property {number} connected_time
	 * 该客户端与本网络保持关联的总毫秒数（关联时长）。
	 *
	 * @property {number} [thr]
	 * 该客户端的估计吞吐量（单位：kbps）；驱动不支持时为 `0` 或缺失。
	 *
	 * @property {boolean} authorized
	 * 指定该客户端是否已通过授权（802.1X 或 PSK 验证通过则为 `true`）。
	 *
	 * @property {boolean} authenticated
	 * 指定该客户端是否已完成身份验证（四次握手或 802.1X 认证完成则为 `true`）。
	 *
	 * @property {string} preamble
	 * 该客户端使用的前导码模式，可能为 `'long'`（长前导码）或 `'short'`（短前导码）。
	 *
	 * @property {boolean} wme
	 * 指定该客户端是否支持 WME/WMM（无线多媒体扩展/Wi-Fi 多媒体）能力。
	 *
	 * @property {boolean} mfp
	 * 指定是否已启用管理帧保护（MFP / 802.11w），防止管理帧被伪造。
	 *
	 * @property {boolean} tdls
	 * 指定是否已激活 TDLS（Tunneled Direct Link Setup，隧道直接链路建立）。
	 *
	 * @property {number} [mesh_llid]
	 * Mesh 链路本地 ID（LLID）；不适用或驱动不支持时为 `0` 或缺失。
	 *
	 * @property {number} [mesh_plid]
	 * Mesh 链路对端 ID（PLID）；不适用或驱动不支持时为 `0` 或缺失。
	 *
	 * @property {string} [mesh_plink]
	 * Mesh 对端链路状态描述字符串；不适用或驱动不支持时为空字符串 `''`。
	 *
	 * 已知状态值：
	 *  - `LISTEN`
	 *  - `OPN_SNT`
	 *  - `OPN_RCVD`
	 *  - `CNF_RCVD`
	 *  - `ESTAB`
	 *  - `HOLDING`
	 *  - `BLOCKED`
	 *  - `UNKNOWN`
	 *
	 * @property {number} [mesh_local_PS]
	 * 本端针对该对端链路的省电模式；不适用或不支持时为空字符串 `''`。
	 *
	 * 已知模式值：
	 *  - `ACTIVE` (no power save)
	 *  - `LIGHT SLEEP`
	 *  - `DEEP SLEEP`
	 *  - `UNKNOWN`
	 *
	 * @property {number} [mesh_peer_PS]
	 * 对端的省电模式；不适用或不支持时为空字符串 `''`。
	 *
	 * 已知模式值：
	 *  - `ACTIVE` (no power save)
	 *  - `LIGHT SLEEP`
	 *  - `DEEP SLEEP`
	 *  - `UNKNOWN`
	 *
	 * @property {number} [mesh_non_peer_PS]
	 * 针对所有非 Mesh 对端邻居的省电模式；不适用或不支持时为空字符串 `''`。
	 *
	 * 已知模式值：
	 *  - `ACTIVE` (no power save)
	 *  - `LIGHT SLEEP`
	 *  - `DEEP SLEEP`
	 *  - `UNKNOWN`
	 *
	 * @property {LuCI.network.WifiRateEntry} rx
	 * 描述从该客户端接收数据时使用的无线速率信息（接收速率）。
	 *
	 * @property {LuCI.network.WifiRateEntry} tx
	 * 描述向该客户端发送数据时使用的无线速率信息（发送速率）。
	 */

	/**
	 * A wireless rate entry describes the properties of a wireless
	 * transmission rate to or from a peer.
	 *
	 * @typedef {Object<string, boolean|number>} WifiRateEntry
	 * @memberof LuCI.network
	 *
	 * @property {number} [drop_misc]
	 * 因数据损坏或缺少认证等原因被丢弃的杂项数据包数量（仅适用于接收速率）。
	 *
	 * @property {number} packets
	 * 以此速率收发的数据包总数。
	 *
	 * @property {number} bytes
	 * 以此速率收发的字节总数。
	 *
	 * @property {number} [failed]
	 * 发送失败的尝试次数（仅适用于发送速率条目）。
	 *
	 * @property {number} [retries]
	 * 重试发送的次数（仅适用于发送速率条目）。
	 *
	 * @property {boolean} is_ht
	 * 指定此速率是否为 HT 速率（IEEE 802.11n / Wi-Fi 4）。
	 *
	 * @property {boolean} is_vht
	 * 指定此速率是否为 VHT 速率（IEEE 802.11ac / Wi-Fi 5）。
	 *
	 * @property {number} mhz
	 * 本次传输使用的信道带宽（单位：MHz，如 `20`、`40`、`80`、`160`）。
	 *
	 * @property {number} rate
	 * 本次传输的原始比特率（单位：bit/s）。
	 *
	 * @property {number} [mcs]
	 * 本次传输使用的 MCS 索引值（调制编码方案），仅适用于 HT 或 VHT 速率。
	 *
	 * @property {number} [40mhz]
	 * 指定本次传输是否使用了 40MHz 宽信道（仅适用于 HT 或 VHT 速率）。
	 *
	 * 注意：此选项仅为向后兼容保留，不建议使用，应改用 `mhz` 字段判断信道带宽。
	 *
	 * @property {boolean} [short_gi]
	 * 指定本次传输是否使用了短保护间隔（Short GI）（仅适用于 HT 或 VHT 速率）。
	 *
	 * @property {number} [nss]
	 * 指定本次传输使用的空间流数量（仅适用于 VHT 速率）。
	 *
	 * @property {boolean} [he]
	 * 指定此速率是否为 HE 速率（IEEE 802.11ax / Wi-Fi 6）。
	 *
	 * @property {number} [he_gi]
	 * 指定本次传输使用的保护间隔类型（仅适用于 HE 速率）。
	 *
	 * @property {number} [he_dcm]
	 * 指定本次传输是否使用了双并发调制（DCM，仅适用于 HE 速率）。
	 *
	 * @property {boolean} [eht]
	 * 指定此速率是否为 EHT 速率（IEEE 802.11be / Wi-Fi 7）。
	 *
	 * @property {number} [eht_gi]
	 * 指定本次传输使用的保护间隔类型（仅适用于 EHT 速率）。
	 *
	 * @property {number} [eht_dcm]
	 * 指定本次传输是否使用了双并发调制（DCM，仅适用于 EHT 速率）。
	 */

	/**
	 * 获取与本无线网络关联（已连接）的客户端列表。
	 *
	 * @returns {Promise<Array<LuCI.network.WifiPeerEntry>>}
	 * 返回已关联客户端的 WifiPeerEntry 对象数组；无客户端时返回空数组。
	 */
	getAssocList() {
		const tasks = [];
		let station;

		for (let vlan of this.getVlans())
			tasks.push(callIwinfoAssoclist(vlan.getIfname()).then(
				function(stations) {
					for (station of stations)
						station.vlan = vlan;

					return stations;
				})
			);

		tasks.push(callIwinfoAssoclist(this.getIfname()));

		return Promise.all(tasks).then(function(values) {
			return Array.prototype.concat.apply([], values);
		});
	},

	/**
	 * 获取本无线网络配置的 VLAN 列表。
	 *
	 * @returns {Array<LuCI.network.WifiVlan>}
	 * 返回 `WifiVlan` 实例数组；未配置 VLAN 时返回空数组。
	 */
	getVlans() {
		const vlans = [];
		const vlans_ubus = this.ubus('net', 'vlans');

		if (vlans_ubus)
			for (let vlan of vlans_ubus)
				vlans.push(new WifiVlan(vlan));

		return vlans;
	},

	/**
	 * 查询本无线网络当前的工作频率（从 ubus 运行时信息获取）。
	 *
	 * @returns {null|string}
	 * 返回以 GHz 为单位的频率字符串（如 `'2.412'`、`'5.180'`）；信息不可用时返回 `null`。
	 */
	getFrequency() {
		const freq = this.ubus('net', 'iwinfo', 'frequency');

		if (freq != null && freq > 0)
			return '%.03f'.format(freq / 1000);

		return null;
	},

	/**
	 * 查询本无线网络所有关联客户端的当前平均比特率。
	 *
	 * @returns {null|number}
	 * 返回以 bit/s 为单位的平均比特率；信息不可用时返回 `null`。
	 */
	getBitRate() {
		const rate = this.ubus('net', 'iwinfo', 'bitrate');

		if (rate != null && rate > 0)
			return (rate / 1000);

		return null;
	},

	/**
	 * 查询本无线网络当前使用的信道编号（从 ubus 运行时信息获取）。
	 *
	 * @returns {null|number}
	 * 返回信道编号整数（如 `6`、`36`）；信息不可用时返回 `null`。
	 */
	getChannel() {
		return this.ubus('net', 'iwinfo', 'channel') || this.ubus('dev', 'config', 'channel') || this.get('channel');
	},

	/**
	 * 查询本无线网络当前的信号强度（从 ubus 运行时信息获取）。
	 *
	 * @returns {null|number}
	 * 返回以 dBm 为单位的信号强度（如 `-65`）；信息不可用时返回 `null`。
	 */
	getSignal() {
		return this.ubus('net', 'iwinfo', 'signal') || 0;
	},

	/**
	 * 查询本 radio 当前的噪底（Noise Floor）。
	 *
	 * @returns {number}
	 * 返回以 dBm 为单位的噪底值（如 `-95`）；信息不可用时返回 `0`。
	 */
	getNoise() {
		return this.ubus('net', 'iwinfo', 'noise') || 0;
	},

	/**
	 * 查询本 radio 当前使用的国家/地区代码。
	 *
	 * @returns {string}
	 * 返回两字母国家代码（如 `'CN'`、`'US'`）；信息不可用时返回 `'00'`。
	 */
	getCountryCode() {
		return this.ubus('net', 'iwinfo', 'country') || this.ubus('dev', 'config', 'country') || '00';
	},

	/**
	 * 查询本 radio 当前的发射功率（TX Power）。
	 *
	 * @returns {null|number}
	 * 返回以 dBm 为单位的发射功率（如 `20`）；信息不可用时返回 `null`。
	 */
	getTXPower() {
		return this.ubus('net', 'iwinfo', 'txpower');
	},

	/**
	 * 查询 radio 的发射功率偏移量（TX Power Offset）。
	 * 某些 radio 因使用外置功率放大器等原因存在固定偏移，实际功率 = TX Power + Offset。
	 *
	 * @returns {number}
	 * 返回以 dBm 为单位的功率偏移量；无偏移或不可用时返回 `0`。
	 */
	getTXPowerOffset() {
		return this.ubus('net', 'iwinfo', 'txpower_offset') || 0;
	},

	/**
	 * 计算当前信号质量等级（已废弃，建议使用 `getSignalPercent()`）。
	 *
	 * @deprecated
	 * @param {number} signal - 信号强度（dBm），默认取 `getSignal()`
	 * @param {number} noise  - 噪底（dBm），默认取 `getNoise()`
	 * @returns {number}
	 * 返回信号质量等级，计算方式为 (signal - noise) / 5，取整；未关联时返回 `-1`。
	 */
	getSignalLevel(signal, noise) {
		if (this.getActiveBSSID() == '00:00:00:00:00:00')
			return -1;

		signal = signal || this.getSignal();
		noise  = noise  || this.getNoise();

		if (signal < 0 && noise < 0) {
			const snr = -1 * (noise - signal);
			return Math.floor(snr / 5);
		}

		return 0;
	},

	/**
	 * 计算本无线网络当前的信号质量百分比（0-100）。
	 *
	 * @returns {number}
	 * 返回归一化到 0-100 的信号质量百分比，由 ubus `quality` / `quality_max` 计算得出；
	 * 无信息时返回 `0`。
	 */
	getSignalPercent() {
		const qc = this.ubus('net', 'iwinfo', 'quality') || 0;
		const qm = this.ubus('net', 'iwinfo', 'quality_max') || 0;

		if (qc > 0 && qm > 0)
			return Math.floor((100 / qm) * qc);

		return 0;
	},

	/**
	 * 获取本无线网络的简短描述字符串。
	 *
	 * @returns {string}
	 * 返回由当前操作模式加上 SSID、BSSID 或网络 ID（优先取可用的）组成的简短描述。
	 */
	getShortName() {
		return '%s "%s"'.format(
			this.getActiveModeI18n(),
			this.getActiveSSID() || this.getActiveBSSID() || this.getID());
	},

	/**
	 * 获取本无线网络的详细描述字符串（用于 UI 展示）。
	 *
	 * @returns {string}
	 * 返回包含 `'Wireless Network'` 前缀、当前操作模式、SSID/BSSID/网络 ID
	 * 以及 Linux 设备名的完整描述字符串。
	 */
	getI18n() {
		return '%s: %s "%s" (%s)'.format(
			_('Wireless Network'),
			this.getActiveModeI18n(),
			this.getActiveSSID() || this.getActiveBSSID() || this.getID(),
			this.getIfname());
	},

	/**
	 * 获取本无线网络所附属的首个逻辑接口实例。
	 *
	 * @returns {null|LuCI.network.Protocol}
	 * 返回对应的 `Protocol` 实例；未附属于任何逻辑接口时返回 `null`。
	 */
	getNetwork() {
		return this.getNetworks()[0];
	},

	/**
	 * 获取本无线网络所附属的所有逻辑接口实例列表。
	 *
	 * @returns {Array<LuCI.network.Protocol>}
	 * 返回所附属逻辑接口的 `Protocol` 实例数组；未附属任何接口时返回空数组。
	 */
	getNetworks() {
		const networkNames = this.getNetworkNames();
		const networks = [];

		for (let nn of networkNames) {
			const uciInterface = uci.get('network', nn);

			if (uciInterface == null || uciInterface['.type'] != 'interface')
				continue;

			networks.push(Network.prototype.instantiateNetwork(nn));
		}

		networks.sort(networkSort);

		return networks;
	},

	/**
	 * 获取与本无线网络关联的 Linux 网络设备实例。
	 *
	 * @returns {LuCI.network.Device}
	 * 返回关联的 `Network.Device` 实例（如 `wlan0` 对应的 Device 对象）。
	 */
	getDevice() {
		return Network.prototype.instantiateDevice(this.getIfname());
	},

	/**
	 * 检查本无线网络是否支持强制断开客户端（deauth）操作。
	 * 需要 hostapd 运行且支持 `del_client` 接口。
	 *
	 * @returns {boolean}
	 * 支持强制断开客户端返回 `true`；否则返回 `false`。
	 */
	isClientDisconnectSupported() {
		return L.isObject(this.ubus('hostapd', 'del_client'));
	},

	/**
	 * 强制断开指定客户端与本无线网络的连接。
	 *
	 * @param {string} mac
	 * 要断开的客户端 MAC 地址（如 `'aa:bb:cc:dd:ee:ff'`）。
	 *
	 * @param {boolean} [deauth=false]
	 * 为 `true` 时执行 de-authenticate（解除认证）；为 `false` 时执行 disassociate（解除关联）。
	 *
	 * @param {number} [reason=1]
	 * IEEE 802.11 断开原因码，默认为 `1`（未指定原因）。
	 * 参见 https://www.iana.org/assignments/ieee-802-11-parameters/ 查询完整列表。
	 *
	 * @param {number} [ban_time=0]
	 * 断开后禁止该客户端重新关联的毫秒数，默认为 `0`（不禁止）。
	 *
	 * @returns {Promise<number>}
	 * 返回 ubus 调用结果码（通常为 `0`，即使 MAC 地址不存在）；
	 * 参数无效时 reject 并携带错误信息。
	 */
	disconnectClient(mac, deauth, reason, ban_time) {
		if (reason == null || reason == 0)
			reason = 1;

		if (ban_time == 0)
			ban_time = null;

		return rpc.declare({
			object: 'hostapd.%s'.format(this.getIfname()),
			method: 'del_client',
			params: [ 'addr', 'deauth', 'reason', 'ban_time' ]
		})(mac, deauth, reason, ban_time);
	}
});

/**
 * @class
 * @memberof LuCI.network
 * @hideconstructor
 * @classdesc
 *
 * `Network.WifiVlan` 类实例代表 WifiNetwork 上的一个 VLAN。
 */
WifiVlan = baseclass.extend(/** @lends LuCI.network.WifiVlan.prototype */ {
	__init__(vlan) {
		this.ifname = vlan.ifname;
		if (L.isObject(vlan.config)) {
			this.vid = vlan.config.vid;
			this.name = vlan.config.name;

			if (Array.isArray(vlan.config.network) && vlan.config.network.length)
				this.network = vlan.config.network[0];
		}
	},

	/**
	 * 获取本 WiFi VLAN 的名称。
	 *
	 * @returns {string}
	 * 返回 VLAN 名称字符串。
	 */
	getName() {
		return this.name;
	},

	/**
	 * 获取本 WiFi VLAN 的 VLAN ID。
	 *
	 * @returns {number}
	 * 返回 VLAN ID 数值（如 `100`）。
	 */
	getVlanId() {
		return this.vid;
	},

	/**
	 * 获取本 WiFi VLAN 所属的逻辑网络名。
	 *
	 * @returns {string}
	 * 返回关联的逻辑网络名称字符串（如 `'lan'`）。
	 */
	getNetwork() {
		return this.network;
	},

	/**
	 * 获取本 WiFi VLAN 对应的 Linux 网络设备名。
	 *
	 * @returns {string}
	 * 返回当前的 Linux 设备名字符串（如 `'wlan0.100'`）。
	 */
	getIfname() {
		return this.ifname;
	},

	/**
	 * 获取本 WiFi VLAN 的详细描述字符串（VLAN ID + 名称）。
	 *
	 * @returns {string}
	 * 返回包含 VLAN ID 的描述字符串；若 VLAN 名称与 ID 不同，则同时包含名称。
	 */
	getI18n() {
		const name =  this.name && this.name != this.vid ? ' (' + this.name + ')' : '';
		return 'vlan %d%s'.format(this.vid, name);
	},
});

return Network;
