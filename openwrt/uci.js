'use strict';
'require rpc';
'require baseclass';

/**
 * ============================================================
 * LuCI.uci —— OpenWrt UCI 配置管理模块
 * ============================================================
 *
 * 【模块作用】
 *   uci（Unified Configuration Interface，统一配置接口）是 OpenWrt
 *   管理所有系统配置的标准方式。本模块通过 LuCI.rpc 与后端 ubus UCI
 *   服务通信，并在前端维护一个本地缓存层，让插件代码可以像操作本地
 *   对象一样同步读写配置，最后再统一提交到路由器。
 *
 * 【核心数据流】
 *   uci.load('network')          ← 从路由器加载配置到本地缓存
 *       ↓
 *   uci.get/set/add/remove()     ← 在本地缓存中同步读写（不发网络请求）
 *       ↓
 *   uci.save()                   ← 将本地变更批量提交到路由器
 *       ↓
 *   uci.apply()                  ← 应用生效（带回滚保护）
 *
 * 【配置文件结构】
 *   OpenWrt 配置文件位于 /etc/config/ 下，以 UCI 格式存储，例如：
 *
 *   # /etc/config/network
 *   config interface 'lan'       ← section，类型=interface，名称=lan
 *       option ifname 'eth0'     ← option
 *       list dns '8.8.8.8'      ← list（多值）
 *
 *   在 JS 中通过 uci.get('network', 'lan', 'ifname') 访问。
 *
 * 【本地状态缓存结构】
 *   this.state = {
 *     values:  { conf: { sid: { opt: val } } }  // 从路由器加载的原始值
 *     creates: { conf: { sid: { ... } } }        // 待新建的 section
 *     changes: { conf: { sid: { opt: val } } }   // 待修改的选项
 *     deletes: { conf: { sid: true|{opt:true} } }// 待删除的 section/选项
 *     reorder: { conf: true }                    // 需要重新排序的配置
 *   }
 *
 * 【典型使用场景】
 *   'require uci';
 *
 *   // 在 view 的 load() 中加载配置
 *   return uci.load(['network', 'firewall']);
 *
 *   // 读取 LAN 接口的 IP 地址
 *   var ip = uci.get('network', 'lan', 'ipaddr');
 *
 *   // 修改主机名
 *   uci.set('system', '@system[0]', 'hostname', 'MyRouter');
 *
 *   // 保存并应用
 *   uci.save().then(function() { return uci.apply(); });
 */

/**
 * 工具函数：判断对象是否为空（忽略指定属性）
 * @param {Object} object - 要检查的对象
 * @param {string} ignore - 忽略的属性名（通常是将要新设置的 key）
 * @returns {boolean} 如果对象没有其他属性则返回 true
 */
function isEmpty(object, ignore) {
	for (const property in object)
		if (object.hasOwnProperty(property) && property != ignore)
			return false;

	return true;
}

/**
 * @class uci
 * @memberof LuCI
 * @hideconstructor
 * @classdesc
 *
 * LuCI.uci 类：通过 LuCI.rpc 封装远程 UCI ubus 调用，
 * 并在本地实现缓存和数据操作层，支持对 UCI 配置的同步操作。
 */
return baseclass.extend(/** @lends LuCI.uci.prototype */ {

	/**
	 * 构造函数：初始化本地状态缓存和已加载配置记录
	 * @private
	 */
	__init__() {
		this.state = {
			newidx:  0,    // 新建 section 的递增序号（用于生成唯一临时ID）
			values:  { }, // 从路由器加载的原始配置值
			creates: { }, // 本地待新建的 section 记录
			changes: { }, // 本地待修改的选项记录
			deletes: { }, // 本地待删除的 section/选项记录
			reorder: { }  // 需要重新排序的配置包记录
		};

		// 记录已加载的配置包，避免重复加载（键=包名，值=Promise）
		this.loaded = {};
	},

	// ════════════════════════════════════════════════════════
	// 底层 RPC 调用声明（通过 rpc.declare 绑定到 ubus UCI 接口）
	// ════════════════════════════════════════════════════════

	/**
	 * 【私有 RPC】加载整个配置包的所有 section 和 option 值
	 * ubus 调用: uci get {config}
	 * 返回: { values: { section_id: { '.type':..., option: value, ... } } }
	 */
	callLoad: rpc.declare({
		object: 'uci',
		method: 'get',
		params: [ 'config' ],
		expect: { values: { } },  // 提取 values 字段，默认空对象
		reject: true              // ubus 非0状态码视为错误
	}),

	/**
	 * 【私有 RPC】重新排序指定配置包中的 sections
	 * ubus 调用: uci order {config} {sections:[id1,id2,...]}
	 */
	callOrder: rpc.declare({
		object: 'uci',
		method: 'order',
		params: [ 'config', 'sections' ],
		reject: true
	}),

	/**
	 * 【私有 RPC】新建一个 section
	 * ubus 调用: uci add {config} {type} {name} {values}
	 * 返回: { section: '新建的section ID' }
	 * 注意：若 name 为 null 则创建匿名 section，ID 由系统生成（cfgXXXXXX）
	 */
	callAdd: rpc.declare({
		object: 'uci',
		method: 'add',
		params: [ 'config', 'type', 'name', 'values' ],
		expect: { section: '' }, // 提取返回的 section ID
		reject: true
	}),

	/**
	 * 【私有 RPC】更新指定 section 的若干选项值
	 * ubus 调用: uci set {config} {section} {values:{opt:val,...}}
	 */
	callSet: rpc.declare({
		object: 'uci',
		method: 'set',
		params: [ 'config', 'section', 'values' ],
		reject: true
	}),

	/**
	 * 【私有 RPC】删除指定 section 或其中若干选项
	 * ubus 调用: uci delete {config} {section} {options:[opt,...]}
	 * options 为 null 时删除整个 section，否则只删除列出的选项
	 */
	callDelete: rpc.declare({
		object: 'uci',
		method: 'delete',
		params: [ 'config', 'section', 'options' ],
		reject: true
	}),

	/**
	 * 【私有 RPC】应用所有已保存的 UCI 变更（带回滚保护）
	 * ubus 调用: uci apply {timeout} {rollback}
	 * timeout: 回滚超时秒数，rollback: 是否启用回滚保护
	 */
	callApply: rpc.declare({
		object: 'uci',
		method: 'apply',
		params: [ 'timeout', 'rollback' ],
		reject: true
	}),

	/**
	 * 【私有 RPC】确认应用操作，取消回滚计时器
	 * ubus 调用: uci confirm
	 * 在 apply() 后需要在超时前调用此方法，否则路由器会自动回滚配置
	 */
	callConfirm: rpc.declare({
		object: 'uci',
		method: 'confirm',
		reject: true
	}),

	// ════════════════════════════════════════════════════════
	// Section ID 管理
	// ════════════════════════════════════════════════════════

	/**
	 * 为指定配置包生成一个唯一的临时 section ID。
	 *
	 * 生成的 ID 为 `newXXXXXX` 格式（X 为十六进制），仅在本地使用。
	 * 调用 save() 后，服务器会将其替换为正式的 `cfgXXXXXX` 格式 ID。
	 *
	 * @param {string} conf - 配置包名称
	 * @returns {string} 唯一的临时 section ID，例如 'new1a2b3c'
	 *
	 * 【使用场景】
	 *   此函数由 add() 内部调用，通常不需要直接调用。
	 *   当需要在 add() 之后立即引用新 section 时：
	 *
	 *   var sid = uci.add('network', 'interface', 'vlan10');
	 *   uci.set('network', sid, 'proto', 'static');
	 *   uci.set('network', sid, 'ipaddr', '192.168.10.1');
	 */
	createSID(conf) {
		const v = this.state.values;
		const n = this.state.creates;
		let sid;

		// 循环生成直到找到唯一的 ID（避免与已有 section 冲突）
		do {
			sid = "new%06x".format(Math.random() * 0xFFFFFF);
		} while ((n[conf]?.[sid]) || (v[conf]?.[sid]));

		return sid;
	},

	/**
	 * 将扩展格式的 section ID 解析为内部 section ID。
	 *
	 * @param {string} conf - 配置包名称
	 * @param {string} sid  - 要解析的 section ID
	 * @returns {string|null} 解析后的内部 ID，或原 ID（若非扩展格式），或 null
	 *
	 * 【扩展格式说明】
	 *   @typename[index] 格式可通过类型和索引引用 section，例如：
	 *   - '@interface[0]'  → 第一个 interface 类型的 section
	 *   - '@interface[-1]' → 最后一个 interface 类型的 section
	 *   - '@system[0]'     → system 配置中第一个 system 类型的 section
	 *
	 * 【使用场景】
	 *   // 读取 system 配置中第一个 system section 的主机名
	 *   var hostname = uci.get('system', '@system[0]', 'hostname');
	 *
	 *   // 修改 network 配置中最后一个 interface 的协议
	 *   uci.set('network', '@interface[-1]', 'proto', 'dhcp');
	 */
	resolveSID(conf, sid) {
		if (typeof(sid) != 'string')
			return sid;

		// 匹配 @typename[index] 格式
		const m = /^@([a-zA-Z0-9_-]+)\[(-?[0-9]+)\]$/.exec(sid);

		if (m) {
			const type = m[1];
			const pos = +m[2];
			const sections = this.sections(conf, type);
			// 支持负索引（-1 表示最后一个）
			const section = sections[pos >= 0 ? pos : sections.length + pos];

			return section?.['.name'] ?? null;
		}

		// 不是扩展格式，原样返回
		return sid;
	},

	// ════════════════════════════════════════════════════════
	// 私有方法
	// ════════════════════════════════════════════════════════

	/**
	 * 【私有】将本地 reorder 状态同步到路由器（排序变更提交）
	 *
	 * 在 save() 完成 add/set/delete 操作后调用，
	 * 按 .index 排序后调用 callOrder 提交新顺序。
	 */
	reorderSections() {
		const v = this.state.values;
		const n = this.state.creates;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const tasks = [];

		// 没有排序变更时直接返回
		if (Object.keys(r).length === 0)
			return Promise.resolve();

		// 遍历所有有排序变更的配置包
		for (const c in r) {
			const o = [ ];

			// 已整体删除的配置包跳过排序
			if (d[c])
				continue;

			// 将待新建的 sections 加入排序列表
			if (n[c])
				for (const s in n[c])
					o.push(n[c][s]);

			// 将已有的 sections 加入排序列表
			for (const s in v[c])
				o.push(v[c][s]);

			if (o.length > 0) {
				// 按 .index 升序排列
				o.sort((a, b) => a['.index'] - b['.index']);

				const sids = [ ];
				for (let i = 0; i < o.length; i++)
					sids.push(o[i]['.name']);

				// 提交新顺序到路由器
				tasks.push(this.callOrder(c, sids));
			}
		}

		// 清除排序状态
		this.state.reorder = { };
		return Promise.all(tasks);
	},

	/**
	 * 【私有】加载单个配置包（带缓存，同一包只加载一次）
	 * @param {string} packageName - 配置包名称
	 * @returns {Promise} 加载完成的 Promise
	 */
	loadPackage(packageName) {
		// 若已有加载记录（Promise 或结果），直接复用
		if (this.loaded[packageName] == null)
			return (this.loaded[packageName] = this.callLoad(packageName));

		return Promise.resolve(this.loaded[packageName]);
	},

	// ════════════════════════════════════════════════════════
	// 配置加载与卸载
	// ════════════════════════════════════════════════════════

	/**
	 * 从路由器加载指定的 UCI 配置包到本地缓存。
	 *
	 * 已加载的配置会被缓存，重复调用不会重新发起请求。
	 * 若要强制重新加载，需先调用 unload() 清除缓存。
	 *
	 * @param {string|string[]} packages - 配置包名称或名称数组
	 * @returns {Promise<string[]>} 解析为本次成功加载的包名数组
	 *
	 * 【使用场景1：在 view 的 load() 中加载需要的配置】
	 *
	 *   return Promise.all([
	 *       uci.load('network'),
	 *       uci.load('firewall'),
	 *       uci.load('system')
	 *   ]);
	 *
	 * 【使用场景2：批量加载】
	 *
	 *   return uci.load(['network', 'wireless', 'dhcp']);
	 *
	 * 【注意事项】
	 *   - load() 完成后才能调用 get/set 等操作
	 *   - 加载成功后会触发 document 上的 'uci-loaded' 自定义事件
	 *   - 配置只保存在 JS 内存中，刷新页面后需重新加载
	 */
	load(packages) {
		const self = this;
		const pkgs = [ ];
		const tasks = [];

		// 统一转为数组处理
		if (!Array.isArray(packages))
			packages = [ packages ];

		// 只加载尚未缓存的包
		for (let i = 0; i < packages.length; i++)
			if (!self.state.values[packages[i]]) {
				pkgs.push(packages[i]);
				tasks.push(self.loadPackage(packages[i]));
			}

		return Promise.all(tasks).then(responses => {
			// 将加载结果存入 state.values 缓存
			for (let i = 0; i < responses.length; i++)
				self.state.values[pkgs[i]] = responses[i];

			// 触发 uci-loaded 事件（其他模块可监听此事件）
			if (responses.length)
				document.dispatchEvent(new CustomEvent('uci-loaded'));

			return pkgs;
		});
	},

	/**
	 * 从本地缓存中卸载指定的 UCI 配置包，同时清除所有相关的待提交变更。
	 *
	 * @param {string|string[]} packages - 要卸载的配置包名称或数组
	 *
	 * 【使用场景：保存成功后强制刷新某个配置】
	 *
	 *   uci.save().then(function() {
	 *       uci.unload('network');
	 *       return uci.load('network');  // 重新从路由器加载最新值
	 *   });
	 *
	 * 【注意】unload 会丢弃所有未提交的本地变更，请在 save() 之后调用。
	 */
	unload(packages) {
		if (!Array.isArray(packages))
			packages = [ packages ];

		for (let i = 0; i < packages.length; i++) {
			// 清除缓存的原始值和所有待提交状态
			delete this.state.values[packages[i]];
			delete this.state.creates[packages[i]];
			delete this.state.changes[packages[i]];
			delete this.state.deletes[packages[i]];

			// 清除加载记录，允许下次重新发起请求
			delete this.loaded[packages[i]];
		}
	},

	// ════════════════════════════════════════════════════════
	// Section 管理（增删改）
	// ════════════════════════════════════════════════════════

	/**
	 * 在指定配置包中新建一个 section（仅在本地缓存中记录，需 save() 提交）。
	 *
	 * @param {string} conf   - 配置包名称（如 'network'）
	 * @param {string} type   - section 类型（如 'interface'）
	 * @param {string} [name] - section 名称，省略则创建匿名 section
	 * @returns {string} 新建 section 的临时 ID（命名 section 返回 name 本身）
	 *
	 * 【使用场景1：新建命名接口配置】
	 *
	 *   var sid = uci.add('network', 'interface', 'vlan10');
	 *   uci.set('network', sid, 'proto', 'static');
	 *   uci.set('network', sid, 'ipaddr', '10.0.10.1');
	 *   uci.set('network', sid, 'netmask', '255.255.255.0');
	 *   uci.save();
	 *
	 * 【使用场景2：新建匿名防火墙规则】
	 *
	 *   var sid = uci.add('firewall', 'rule');  // 匿名，系统自动分配 ID
	 *   uci.set('firewall', sid, 'src', 'wan');
	 *   uci.set('firewall', sid, 'dest_port', '8080');
	 *   uci.set('firewall', sid, 'target', 'ACCEPT');
	 *   uci.save();
	 */
	add(conf, type, name) {
		const n = this.state.creates;
		const sid = name || this.createSID(conf);

		n[conf] ??= { };
		n[conf][sid] = {
			'.type':      type,
			'.name':      sid,
			'.create':    name,       // 提交时用于指定命名（null 表示匿名）
			'.anonymous': !name,      // 是否匿名
			'.index':     1000 + this.state.newidx++  // 排到末尾
		};

		return sid;
	},

	/**
	 * 克隆一个现有 section 到同一配置包中（复制所有选项值）。
	 *
	 * @param {string}  conf     - 配置包名称
	 * @param {string}  type     - 新 section 的类型
	 * @param {string}  srcsid   - 要克隆的源 section ID
	 * @param {boolean} [put_next=false] - true=紧接在源 section 后，false=放到末尾
	 * @param {string}  [name]   - 新 section 的名称，省略则创建匿名
	 * @returns {string} 新建（克隆）section 的临时 ID
	 *
	 * 【使用场景：复制一条 DHCP 静态租约记录】
	 *
	 *   var newSid = uci.clone('dhcp', 'host', 'existingHostSid', true);
	 *   uci.set('dhcp', newSid, 'mac', '00:11:22:33:44:55');
	 *   uci.set('dhcp', newSid, 'ip', '192.168.1.100');
	 *   uci.save();
	 */
	clone(conf, type, srcsid, put_next, name) {
		let n = this.state.creates;
		let sid = this.createSID(conf);
		let v = this.state.values;
		put_next = put_next || false;

		if (!n[conf])
			n[conf] = { };

		// 复制源 section 所有选项，再覆盖元数据
		n[conf][sid] = {
			...v[conf][srcsid],
			'.type': type,
			'.name': sid,
			'.create': name,
			'.anonymous': !name,
			'.index': 1000 + this.state.newidx++
		};

		// 若指定 put_next，将新 section 移到源 section 后面
		if (put_next)
			this.move(conf, sid, srcsid, put_next);
		return sid;
	},

	/**
	 * 从指定配置包中标记删除一个 section（本地操作，需 save() 提交）。
	 *
	 * @param {string} conf - 配置包名称
	 * @param {string} sid  - 要删除的 section ID
	 *
	 * 【使用场景：删除一个无线接口配置】
	 *
	 *   uci.remove('wireless', 'wifinet1');
	 *   uci.save();
	 *
	 * 【注意】
	 *   - 若删除的是刚刚用 add() 新建（未保存）的 section，直接从 creates 中移除
	 *   - 若删除的是已存在的 section，记录到 deletes 中，save() 时发送 callDelete
	 */
	remove(conf, sid) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		// 情况1：删除尚未保存的新建 section（直接从 creates 中移除）
		if (n[conf]?.[sid]) {
			delete n[conf][sid];
		}
		// 情况2：删除已存在的 section（记入 deletes，等待 save() 提交）
		else if (v[conf]?.[sid]) {
			delete c[conf]?.[sid];  // 清除对该 section 的待修改记录

			d[conf] ??= { };
			d[conf][sid] = true;    // true 表示删除整个 section
		}
	},

	// ════════════════════════════════════════════════════════
	// 数据枚举与读取
	// ════════════════════════════════════════════════════════

	/**
	 * @typedef {Object<string, boolean|number|string|string[]>} SectionObject
	 * @memberof LuCI.uci
	 * UCI Section 对象，包含所有选项及元数据。
	 *
	 * 内置元数据字段（以 '.' 开头，不对应真实 UCI 选项）：
	 *   .anonymous  {boolean} 是否为匿名 section
	 *   .index      {number}  在配置文件中的排列顺序（从0开始）
	 *   .name       {string}  section 名称或匿名 ID（cfgXXXXXX / newXXXXXX）
	 *   .type       {string}  section 类型
	 *
	 * 其他字段为该 section 的实际选项值，字符串或字符串数组（list）。
	 */

	/**
	 * 枚举指定配置包中的所有（或特定类型的）section。
	 *
	 * @param {string}   conf   - 配置包名称
	 * @param {string}   [type] - 只枚举该类型的 section，省略则枚举全部
	 * @param {Function} [cb]   - 可选回调函数，对每个 section 调用 cb(sectionObj, sid)
	 * @returns {Array<LuCI.uci.SectionObject>} 按排序后的 section 对象数组
	 *
	 * 【使用场景1：遍历所有网络接口并打印名称】
	 *
	 *   uci.sections('network', 'interface', function(s, sid) {
	 *       console.log('接口:', sid, '协议:', s.proto);
	 *   });
	 *
	 * 【使用场景2：获取所有接口的数组】
	 *
	 *   var ifaces = uci.sections('network', 'interface');
	 *   ifaces.forEach(function(s) {
	 *       console.log(s['.name'], s.proto);
	 *   });
	 *
	 * 【使用场景3：获取配置包中所有 section（不过滤类型）】
	 *
	 *   var all = uci.sections('system');
	 *   console.log('section 数量:', all.length);
	 *
	 * 【注意】返回的对象是合并了 values+changes 的视图（反映当前本地状态），
	 *         对返回对象的修改不会影响 uci 内部状态，请使用 set() 进行修改。
	 */
	sections(conf, type, cb) {
		const sa = [ ];
		const v = this.state.values[conf];
		const n = this.state.creates[conf];
		const c = this.state.changes[conf];
		const d = this.state.deletes[conf];

		// 配置未加载时返回空数组
		if (!v)
			return sa;

		// 遍历已存在的 sections（跳过已标记删除的）
		for (const s in v)
			if (!d || d[s] !== true)          // 未被整体删除
				if (!type || v[s]['.type'] == type)  // 类型过滤
					// 合并原始值和待修改值，生成当前视图
					sa.push(Object.assign({ }, v[s], c ? c[s] : null));

		// 追加本地新建的 sections
		if (n)
			for (const s in n)
				if (!type || n[s]['.type'] == type)
					sa.push(Object.assign({ }, n[s]));

		// 按 .index 排序
		sa.sort((a, b) => {
			return a['.index'] - b['.index'];
		});

		// 重新规范化索引（从0连续）
		for (let i = 0; i < sa.length; i++)
			sa[i]['.index'] = i;

		// 若提供了回调，逐个调用
		if (typeof(cb) == 'function')
			for (let i = 0; i < sa.length; i++)
				cb.call(this, sa[i], sa[i]['.name']);

		return sa;
	},

	/**
	 * 读取指定配置选项的值，或读取整个 section 对象。
	 *
	 * @param {string} conf     - 配置包名称
	 * @param {string} sid      - section ID（支持 @type[index] 扩展格式）
	 * @param {string} [opt]    - 选项名称。省略则返回整个 section 对象
	 * @returns {null|string|string[]|LuCI.uci.SectionObject}
	 *   - 字符串：普通 UCI option 的值
	 *   - 字符串数组：UCI list 的所有值
	 *   - SectionObject：省略 opt 时返回整个 section
	 *   - null：配置/section/option 不存在，或配置未加载
	 *
	 * 【使用场景1：读取普通选项】
	 *
	 *   var proto = uci.get('network', 'wan', 'proto');
	 *   console.log('WAN 协议:', proto);  // 'dhcp' / 'pppoe' / 'static' 等
	 *
	 * 【使用场景2：读取 list 选项】
	 *
	 *   var dnsList = uci.get('network', 'lan', 'dns');
	 *   // 返回数组: ['8.8.8.8', '8.8.4.4'] 或 null
	 *
	 * 【使用场景3：通过扩展格式读取】
	 *
	 *   var hostname = uci.get('system', '@system[0]', 'hostname');
	 *
	 * 【使用场景4：读取整个 section 对象】
	 *
	 *   var lanSection = uci.get('network', 'lan');
	 *   console.log(lanSection.ipaddr, lanSection.netmask);
	 *
	 * 【读取优先级】 creates > changes > values（本地修改优先于原始值）
	 */
	get(conf, sid, opt) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		sid = this.resolveSID(conf, sid);

		if (sid == null)
			return null;

		// 情况1：读取刚新建（尚未保存）的 section
		if (n[conf]?.[sid]) {
			if (opt == null)
				return n[conf][sid];
			return n[conf][sid][opt];
		}

		// 情况2：读取指定 option 值
		if (opt != null) {
			// 检查该 option 是否已被标记删除
			if (d[conf]?.[sid])
				if (d[conf][sid] === true || d[conf][sid][opt])
					return null;

			// 优先返回本地已修改的值
			if (c[conf]?.[sid]?.[opt] != null)
				return c[conf][sid][opt];

			// 返回原始加载值
			if (v[conf]?.[sid])
				return v[conf][sid][opt];

			return null;
		}

		// 情况3：返回整个 section 对象（合并 changes 和 deletes）
		if (v[conf]) {
			// 整个 section 已被删除
			if (d[conf]?.[sid] === true)
				return null;

			const s = v[conf][sid] || null;

			if (s) {
				// 合并本地修改
				if (c[conf]?.[sid])
					for (const opt in c[conf][sid])
						if (c[conf][sid][opt] != null)
							s[opt] = c[conf][sid][opt];

				// 反映本地删除
				if (d[conf]?.[sid])
					for (const opt in d[conf][sid])
						delete s[opt];
			}

			return s;
		}

		return null;
	},

	/**
	 * 设置指定 section 中某个选项的值（本地操作，需 save() 提交）。
	 *
	 * @param {string}           conf - 配置包名称
	 * @param {string}           sid  - section ID（支持扩展格式）
	 * @param {string}           opt  - 选项名称（不能以 '.' 开头）
	 * @param {null|string|string[]} val - 要设置的值。null 或空字符串将删除该选项
	 *
	 * 【使用场景1：设置普通选项】
	 *
	 *   uci.set('network', 'lan', 'ipaddr', '192.168.2.1');
	 *   uci.set('network', 'lan', 'netmask', '255.255.255.0');
	 *
	 * 【使用场景2：设置 list 选项（传入数组）】
	 *
	 *   uci.set('network', 'lan', 'dns', ['8.8.8.8', '1.1.1.1']);
	 *
	 * 【使用场景3：通过扩展格式设置】
	 *
	 *   uci.set('system', '@system[0]', 'hostname', 'MyOpenWrt');
	 *   uci.set('system', '@system[0]', 'timezone', 'CST-8');
	 *
	 * 【使用场景4：删除某个选项（设值为 null）】
	 *
	 *   uci.set('network', 'lan', 'ipaddr', null);  // 删除 ipaddr 选项
	 *
	 * 【注意】对 .name/.type 等元数据字段的修改会被忽略（以 '.' 开头的字段）
	 */
	set(conf, sid, opt, val) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		sid = this.resolveSID(conf, sid);

		// 无效参数检查：sid/opt 为 null，或 opt 以 '.' 开头（元数据字段）
		if (sid == null || opt == null || opt.charAt(0) == '.')
			return;

		// 情况1：对尚未保存的新建 section 设值（直接修改 creates）
		if (n[conf]?.[sid]) {
			if (val != null)
				n[conf][sid][opt] = val;
			else
				delete n[conf][sid][opt];
		}
		// 情况2：设置有效值（非 null 非空串）
		else if (val != null && val !== '') {
			// 整个 section 已标记删除时不允许修改
			if (d[conf] && d[conf][sid] === true)
				return;

			// section 不存在时不操作
			if (!v[conf]?.[sid])
				return;

			c[conf] ??= {};
			c[conf][sid] ??= {};

			// 若该 option 之前被标记删除，先清除删除标记
			if (d[conf]?.[sid]) {
				if (isEmpty(d[conf][sid], opt))
					delete d[conf][sid];
				else
					delete d[conf][sid][opt];
			}

			// 记录变更
			c[conf][sid][opt] = val;
		}
		// 情况3：设值为 null 或空串 → 删除该 option
		else {
			// 清除该 option 的待修改记录
			if (c[conf]?.[sid]) {
				if (isEmpty(c[conf][sid], opt))
					delete c[conf][sid];
				else
					delete c[conf][sid][opt];
			}

			// 只删除原始数据中存在的 option
			if (v[conf]?.[sid]?.hasOwnProperty(opt)) {
				d[conf] ??= { };
				d[conf][sid] ??= { };

				if (d[conf][sid] !== true)
					d[conf][sid][opt] = true;
			}
		}
	},

	/**
	 * 删除指定 section 中的某个选项（set(conf, sid, opt, null) 的简便写法）。
	 *
	 * @param {string} conf - 配置包名称
	 * @param {string} sid  - section ID
	 * @param {string} opt  - 要删除的选项名称
	 *
	 * 【使用场景】
	 *   uci.unset('network', 'lan', 'ip6addr');  // 删除 IPv6 地址配置
	 */
	unset(conf, sid, opt) {
		return this.set(conf, sid, opt, null);
	},

	/**
	 * 读取指定类型（或整个配置）中第一个 section 的选项值或整个对象。
	 *
	 * @param {string} conf  - 配置包名称
	 * @param {string} [type] - section 类型过滤，省略则读第一个 section
	 * @param {string} [opt] - 选项名称，省略则返回整个 section 对象
	 * @returns {null|string|string[]|LuCI.uci.SectionObject}
	 *
	 * 【使用场景：读取 system 配置的主机名（已知只有一个 system section）】
	 *
	 *   var hostname = uci.get_first('system', 'system', 'hostname');
	 *   var timezone = uci.get_first('system', 'system', 'timezone');
	 */
	get_first(conf, type, opt) {
		let sid = null;

		// 找到第一个匹配的 section ID
		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.get(conf, sid, opt);
	},

	/**
	 * 读取布尔类型的配置选项，将多种真值格式统一转换为 boolean。
	 *
	 * @param {string} conf  - 配置包名称
	 * @param {string} sid   - section ID
	 * @param {string} [opt] - 选项名称
	 * @returns {boolean} true 或 false
	 *
	 * 【支持的真值格式】（不区分大小写）
	 *   '1', 'on', 'true', 'yes', 'enabled' → true
	 *   其他任何值（包括 '0', 'off', 'false', 'no'）→ false
	 *
	 * 【使用场景：读取服务的启用状态】
	 *
	 *   var enabled = uci.get_bool('dropbear', '@dropbear[0]', 'enable');
	 *   if (enabled) {
	 *       console.log('SSH 服务已启用');
	 *   }
	 */
	get_bool(conf, type, opt) {
		let value = this.get(conf, type, opt);
		if (typeof(value) == 'string')
			return ['1', 'on', 'true', 'yes', 'enabled'].includes(value.toLowerCase());
		return false;
	},

	/**
	 * 设置指定类型中第一个 section 的选项值。
	 *
	 * @param {string} conf  - 配置包名称
	 * @param {string} [type] - section 类型，省略则写第一个 section
	 * @param {string} opt   - 选项名称
	 * @param {null|string|string[]} val - 选项值
	 *
	 * 【使用场景：修改系统主机名（不需要知道具体 section ID）】
	 *
	 *   uci.set_first('system', 'system', 'hostname', 'NewRouterName');
	 *   uci.save();
	 */
	set_first(conf, type, opt, val) {
		let sid = null;

		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.set(conf, sid, opt, val);
	},

	/**
	 * 删除指定类型中第一个 section 的某个选项（set_first 传 null 的简便写法）。
	 *
	 * @param {string} conf  - 配置包名称
	 * @param {string} [type] - section 类型
	 * @param {string} opt   - 要删除的选项名称
	 */
	unset_first(conf, type, opt) {
		return this.set_first(conf, type, opt, null);
	},

	// ════════════════════════════════════════════════════════
	// Section 排序
	// ════════════════════════════════════════════════════════

	/**
	 * 在配置包内移动指定 section 的位置（本地操作，save() 时提交排序）。
	 *
	 * @param {string}  conf  - 配置包名称
	 * @param {string}  sid1  - 要移动的 section ID
	 * @param {string}  [sid2] - 目标参考 section ID。null 时移到末尾
	 * @param {boolean} [after=false] - true=移到 sid2 之后，false=移到 sid2 之前
	 * @returns {boolean} true=成功移动，false=找不到 sid1 或 sid2
	 *
	 * 【使用场景1：将某条防火墙规则移到最前面】
	 *
	 *   var sections = uci.sections('firewall', 'rule');
	 *   var firstSid = sections[0]['.name'];
	 *   uci.move('firewall', 'myRuleSid', firstSid, false); // 移到第一条之前
	 *   uci.save();
	 *
	 * 【使用场景2：将某条规则移到末尾】
	 *
	 *   uci.move('firewall', 'myRuleSid', null);  // sid2=null 表示末尾
	 *   uci.save();
	 */
	move(conf, sid1, sid2, after) {
		const sa = this.sections(conf);
		let s1 = null;
		let s2 = null;

		sid1 = this.resolveSID(conf, sid1);
		sid2 = this.resolveSID(conf, sid2);

		// 从列表中找到并移除 sid1
		for (let i = 0; i < sa.length; i++) {
			if (sa[i]['.name'] != sid1)
				continue;

			s1 = sa[i];
			sa.splice(i, 1);
			break;
		}

		if (s1 == null)
			return false;  // 找不到 sid1

		if (sid2 == null) {
			// 移到末尾
			sa.push(s1);
		}
		else {
			// 插入到 sid2 的前或后
			for (let i = 0; i < sa.length; i++) {
				if (sa[i]['.name'] != sid2)
					continue;

				s2 = sa[i];
				sa.splice(i + !!after, 0, s1);
				break;
			}

			if (s2 == null)
				return false;  // 找不到 sid2
		}

		// 更新所有 section 的 .index 值
		for (let i = 0; i < sa.length; i++)
			this.get(conf, sa[i]['.name'])['.index'] = i;

		// 标记该配置包需要重新排序（save() 时会调用 callOrder）
		if (this.state)
			this.state.reorder[conf] = true;

		return true;
	},

	// ════════════════════════════════════════════════════════
	// 保存与应用
	// ════════════════════════════════════════════════════════

	/**
	 * 将所有本地变更提交到路由器，并重新加载相关配置以同步最新状态。
	 *
	 * @returns {Promise<string[]>} 解析为本次重新加载的配置包名称数组
	 *
	 * 【save() 执行步骤】
	 *   1. 批量发送所有待删除操作（callDelete）
	 *   2. 批量发送所有待新建操作（callAdd），服务器返回正式 section ID
	 *   3. 批量发送所有待修改操作（callSet）
	 *   4. 处理排序变更（reorderSections）
	 *   5. 卸载并重新加载所有涉及变更的配置包（同步最新状态）
	 *
	 * 【使用场景（配合 form.Map 使用时通常不需要手动调用）】
	 *
	 *   // 修改配置后手动保存
	 *   uci.set('network', 'lan', 'ipaddr', '192.168.100.1');
	 *   uci.save().then(function() {
	 *       console.log('配置已保存到路由器，等待 apply 生效');
	 *       return uci.apply();
	 *   });
	 *
	 * 【注意】save() 只是将变更写入路由器的 UCI 层，服务并未重启。
	 *         需要调用 apply() 使配置真正生效。
	 */
	save() {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const self = this;
		const snew = [ ];  // 记录新建 section 的引用（用于回填服务器分配的 ID）
		let pkgs = { };
		const tasks = [];

		// 步骤1：提交删除操作
		if (d)
			for (const conf in d) {
				for (const sid in d[conf]) {
					const o = d[conf][sid];

					if (o === true)
						// 删除整个 section
						tasks.push(self.callDelete(conf, sid, null));
					else
						// 只删除指定的 options
						tasks.push(self.callDelete(conf, sid, Object.keys(o)));
				}

				pkgs[conf] = true;
			}

		// 步骤2：提交新建操作
		if (n)
			for (const conf in n) {
				for (const sid in n[conf]) {
					const p = {
						config: conf,
						values: { }
					};

					// 提取元数据和选项值
					for (const k in n[conf][sid]) {
						if (k == '.type')
							p.type = n[conf][sid][k];
						else if (k == '.create')
							p.name = n[conf][sid][k];   // 命名 section 的名称
						else if (k.charAt(0) != '.')
							p.values[k] = n[conf][sid][k];  // 普通选项
					}

					snew.push(n[conf][sid]);
					tasks.push(self.callAdd(p.config, p.type, p.name, p.values));
				}

				pkgs[conf] = true;
			}

		// 步骤3：提交修改操作
		if (c)
			for (const conf in c) {
				for (const sid in c[conf])
					tasks.push(self.callSet(conf, sid, c[conf][sid]));

				pkgs[conf] = true;
			}

		// 步骤4：标记需要排序的包
		if (r)
			for (const conf in r)
				pkgs[conf] = true;

		return Promise.all(tasks).then(responses => {
			// 将服务器返回的正式 section ID 回填到新建记录中
			// responses 顺序与 tasks 一致，snew 对应 callAdd 的结果
			for (let i = 0; i < snew.length; i++)
				snew[i]['.name'] = responses[i];

			// 步骤4：提交排序
			return self.reorderSections();
		}).then(() => {
			pkgs = Object.keys(pkgs);

			// 步骤5：卸载并重新加载变更的配置包
			self.unload(pkgs);
			return self.load(pkgs);
		});
	},

	/**
	 * 应用所有已保存的配置变更，使其真正生效（带回滚保护机制）。
	 *
	 * @param {number} [timeout=10] - 回滚等待超时秒数（不确认则自动撤销变更）
	 * @returns {Promise<number>} 解析/拒绝为 ubus 状态码
	 *
	 * 【工作原理】
	 *   1. 调用 uci apply 触发配置生效，路由器启动倒计时（默认10秒）
	 *   2. 如果在超时前收到 uci confirm，变更永久保留
	 *   3. 如果超时没有确认，路由器自动回滚到之前的配置
	 *   这种机制防止因错误配置（如误设IP）导致管理界面无法访问
	 *
	 * 【使用场景：保存并应用配置（通常由 ui.changes.apply() 封装调用）】
	 *
	 *   uci.save().then(function() {
	 *       return uci.apply(30);  // 30秒内需确认，否则回滚
	 *   }).then(function() {
	 *       console.log('配置已成功应用');
	 *   }).catch(function(err) {
	 *       console.error('应用失败或已回滚:', err);
	 *   });
	 *
	 * 【注意】LuCI 的 form.Map 和 ui.changes 已封装了完整的 save+apply 流程，
	 *         普通插件通常通过点击"保存并应用"按钮触发，不需要手动调用 apply()。
	 */
	apply(timeout) {
		const self = this;
		const date = new Date();

		// 超时参数校验，默认10秒
		if (typeof(timeout) != 'number' || timeout < 1)
			timeout = 10;

		return self.callApply(timeout, true).then(rv => {
			if (rv != 0)
				return Promise.reject(rv);

			// 计算确认截止时间
			const try_deadline = date.getTime() + 1000 * timeout;

			// 重复尝试确认，直到成功或超时
			const try_confirm = () => {
				return self.callConfirm().then(rv => {
					if (rv != 0) {
						// 还在截止时间内，250ms 后再试
						if (date.getTime() < try_deadline)
							window.setTimeout(try_confirm, 250);
						else
							return Promise.reject(rv);
					}

					return rv;
				});
			};

			// apply 后1秒再发第一次 confirm（等路由器重载服务）
			window.setTimeout(try_confirm, 1000);
		});
	},

	// ════════════════════════════════════════════════════════
	// 变更查询
	// ════════════════════════════════════════════════════════

	/**
	 * @typedef {string[]} ChangeRecord
	 * @memberof LuCI.uci
	 *
	 * UCI 变更记录格式（数组）：
	 *   [0] 操作名: 'add'|'set'|'remove'|'order'|'list-add'|'list-del'|'rename'
	 *   [1] section ID
	 *   [2] 第三元素含义视操作而定（类型/选项名/新顺序等）
	 *   [3] 第四元素含义视操作而定（新值/新名称等）
	 */

	/**
	 * 从路由器获取所有未提交的 UCI 变更记录。
	 *
	 * 此方法返回的是路由器 UCI 层记录的变更，即 save() 后但 apply() 前
	 * 处于"已保存但未生效"状态的所有改动。
	 *
	 * @returns {Promise<Object<string, Array<LuCI.uci.ChangeRecord>>>}
	 * 解析为 { 配置包名: [变更记录数组] } 的对象
	 *
	 * 【使用场景：查看当前有多少待应用的变更】
	 *
	 *   uci.changes().then(function(changes) {
	 *       var total = 0;
	 *       for (var pkg in changes)
	 *           total += changes[pkg].length;
	 *       console.log('共有', total, '条待应用的变更');
	 *   });
	 *
	 * 【注意】这是读取路由器侧的变更队列，与本地 state.changes 不同：
	 *   - state.changes：本地缓存中未 save() 的变更
	 *   - uci.changes()：已 save() 但未 apply() 的变更（路由器侧）
	 */
	changes: rpc.declare({
		object: 'uci',
		method: 'changes',
		expect: { changes: { } }  // 提取 changes 字段，默认空对象
	})
});
