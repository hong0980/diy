'use strict';
'require rpc';
'require baseclass';

/**
 * 辅助函数：判断一个对象是否为空（不含任何自身属性）
 *
 * @param {Object} object  - 要检查的对象
 * @param {string} ignore  - 检查时忽略的属性名（可选）
 * @returns {boolean}        如果对象为空（或仅含 ignore 指定的属性）则返回 true
 *
 * 使用示例：
 *   isEmpty({})               // => true
 *   isEmpty({ a: 1 })         // => false
 *   isEmpty({ a: 1 }, 'a')    // => true（忽略属性 'a' 后视为空）
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
 * LuCI.uci 类是 OpenWrt LuCI 界面中用于操作 UCI（统一配置接口）配置的核心模块。
 *
 * 它通过 {@link LuCI.rpc} 与远端 ubus UCI 接口通信，并在本地实现了
 * 缓存与数据操作层，使得对 UCI 配置数据的读写可以以同步方式进行。
 *
 * 【工作原理】
 *  1. 调用 load() 将配置文件从路由器后端加载到本地缓存（state.values）
 *  2. 通过 get/set/add/remove 等方法在本地缓存中读写数据
 *     - 新增操作记录在 state.creates
 *     - 修改操作记录在 state.changes
 *     - 删除操作记录在 state.deletes
 *  3. 调用 save() 将所有本地变更批量提交到后端
 *  4. 调用 apply() 让后端将变更写入系统配置文件并生效
 *
 * 【完整使用示例】
 *
 *   // 1. 加载配置文件（如 /etc/config/network 和 /etc/config/firewall）
 *   await uci.load(['network', 'firewall']);
 *
 *   // 2. 读取值
 *   const proto = uci.get('network', 'lan', 'proto');   // => 'static'
 *   const lanSection = uci.get('network', 'lan');        // => 整个 section 对象
 *
 *   // 3. 修改值
 *   uci.set('network', 'lan', 'ipaddr', '192.168.2.1');
 *
 *   // 4. 新增匿名 section
 *   const sid = uci.add('firewall', 'rule');
 *   uci.set('firewall', sid, 'name', 'Allow-SSH');
 *   uci.set('firewall', sid, 'target', 'ACCEPT');
 *
 *   // 5. 删除 section
 *   uci.remove('network', 'oldlan');
 *
 *   // 6. 保存并应用
 *   await uci.save();
 *   await uci.apply();
 */
return baseclass.extend(/** @lends LuCI.uci.prototype */ {

	/**
	 * 构造函数（内部自动调用，无需手动实例化）
	 *
	 * 初始化本地状态缓存，包含以下字段：
	 *   - newidx:  新建 section 的自增索引，用于保证 .index 唯一性
	 *   - values:  从后端加载的原始配置数据
	 *   - creates: 本地新增的 section（尚未提交到后端）
	 *   - changes: 本地修改的选项（尚未提交到后端）
	 *   - deletes: 本地删除的 section 或选项（尚未提交到后端）
	 *   - reorder: 需要重新排序的配置文件标记
	 *
	 * loaded 对象用于记录哪些配置包已被加载（防止重复请求）。
	 */
	__init__() {
		this.state = {
			newidx:  0,
			values:  { },
			creates: { },
			changes: { },
			deletes: { },
			reorder: { }
		};

		this.loaded = {};
	},

	// ─────────────────────────────────────────────
	// 以下为通过 rpc.declare 声明的底层远端 ubus 调用
	// 这些方法直接与路由器后端的 ubus UCI 服务通信
	// ─────────────────────────────────────────────

	/**
	 * 【底层 RPC】从后端加载指定配置文件的所有数据
	 * 对应 ubus 调用：uci get config=<配置名>
	 * 返回值：{ values: { ... } }
	 */
	callLoad: rpc.declare({
		object: 'uci',
		method: 'get',
		params: [ 'config' ],
		expect: { values: { } },
		reject: true
	}),

	/**
	 * 【底层 RPC】对指定配置中的 section 进行重新排序
	 * 对应 ubus 调用：uci order config=<配置名> sections=[...]
	 */
	callOrder: rpc.declare({
		object: 'uci',
		method: 'order',
		params: [ 'config', 'sections' ],
		reject: true
	}),

	/**
	 * 【底层 RPC】向指定配置添加一个新 section
	 * 对应 ubus 调用：uci add config=<配置名> type=<类型> name=<名称> values={...}
	 * 返回值：{ section: '<新section的ID>' }
	 */
	callAdd: rpc.declare({
		object: 'uci',
		method: 'add',
		params: [ 'config', 'type', 'name', 'values' ],
		expect: { section: '' },
		reject: true
	}),

	/**
	 * 【底层 RPC】设置指定配置中某 section 的选项值
	 * 对应 ubus 调用：uci set config=<配置名> section=<ID> values={...}
	 */
	callSet: rpc.declare({
		object: 'uci',
		method: 'set',
		params: [ 'config', 'section', 'values' ],
		reject: true
	}),

	/**
	 * 【底层 RPC】删除指定配置中的 section 或其中的选项
	 * 对应 ubus 调用：uci delete config=<配置名> section=<ID> options=[...]
	 * 若 options 为 null，则删除整个 section
	 */
	callDelete: rpc.declare({
		object: 'uci',
		method: 'delete',
		params: [ 'config', 'section', 'options' ],
		reject: true
	}),

	/**
	 * 【底层 RPC】提交并应用所有已保存的 UCI 配置变更
	 * 对应 ubus 调用：uci apply timeout=<超时秒数> rollback=true
	 * 启用 rollback 后，若在超时时间内未收到 confirm，将自动回滚
	 */
	callApply: rpc.declare({
		object: 'uci',
		method: 'apply',
		params: [ 'timeout', 'rollback' ],
		reject: true
	}),

	/**
	 * 【底层 RPC】确认已应用的 UCI 配置变更，取消回滚计时器
	 * 对应 ubus 调用：uci confirm
	 */
	callConfirm: rpc.declare({
		object: 'uci',
		method: 'confirm',
		reject: true
	}),


	/**
	 * 为指定配置生成一个新的、唯一的临时 section ID。
	 *
	 * 生成的 ID 格式为 `newXXXXXX`（X 为十六进制数字），仅在本地有效。
	 * 一旦通过 save() 提交到后端，该 ID 将被替换为后端分配的
	 * `cfgXXXXXX` 格式的永久 ID。
	 *
	 * @param {string} conf - 配置文件名（如 'network'、'firewall'）
	 * @returns {string}      唯一的临时 section ID，格式为 `newXXXXXX`
	 *
	 * 使用示例：
	 *   const sid = uci.createSID('network');
	 *   // => 'new3fa2c1'（随机生成，每次不同）
	 */
	createSID(conf) {
		const v = this.state.values;
		const n = this.state.creates;
		let sid;

		do {
			// 生成随机十六进制 ID，循环直到不与现有 ID 重复
			sid = "new%06x".format(Math.random() * 0xFFFFFF);
		} while ((n[conf]?.[sid]) || (v[conf]?.[sid]));

		return sid;
	},

	/**
	 * 将扩展格式的 section ID 解析为内部实际 ID。
	 *
	 * UCI 支持以 `@typename[index]` 的方式引用 section，例如：
	 *   - `@interface[0]`  表示第一个 interface 类型的 section
	 *   - `@interface[-1]` 表示最后一个 interface 类型的 section
	 *
	 * 若传入的 ID 不是扩展格式，则原样返回。
	 *
	 * @param {string} conf - 配置文件名
	 * @param {string} sid  - 要解析的 section ID（可以是扩展格式或普通 ID）
	 * @returns {string|null}
	 *   - 普通 ID：原样返回
	 *   - 扩展 ID：返回解析后的内部 ID（如 'cfg0a1b2c' 或 'lan'）
	 *   - 无法解析：返回 null
	 *
	 * 使用示例：
	 *   uci.resolveSID('network', '@interface[0]')  // => 'loopback'（第一个 interface）
	 *   uci.resolveSID('network', '@interface[-1]') // => 'wan'（最后一个 interface）
	 *   uci.resolveSID('network', 'lan')            // => 'lan'（普通 ID 原样返回）
	 *   uci.resolveSID('network', '@interface[99]') // => null（索引超出范围）
	 */
	resolveSID(conf, sid) {
		if (typeof(sid) != 'string')
			return sid;

		// 匹配扩展格式：@类型名[索引]
		const m = /^@([a-zA-Z0-9_-]+)\[(-?[0-9]+)\]$/.exec(sid);

		if (m) {
			const type = m[1];
			const pos = +m[2];
			// 获取该类型的所有 section，支持负数索引（从末尾计数）
			const sections = this.sections(conf, type);
			const section = sections[pos >= 0 ? pos : sections.length + pos];

			return section?.['.name'] ?? null;
		}

		return sid;
	},

	/**
	 * 【内部方法】将本地记录的 section 排序变更提交到后端。
	 *
	 * 当调用 move() 改变了 section 顺序后，state.reorder 中会记录
	 * 哪些配置需要重新排序。本方法负责将这些排序信息通过
	 * callOrder() 同步到远端。
	 *
	 * @returns {Promise} 所有排序任务完成后 resolve 的 Promise
	 */
	/* private */
	reorderSections() {
		const v = this.state.values;
		const n = this.state.creates;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const tasks = [];

		// 如果没有排序变更，直接返回
		if (Object.keys(r).length === 0)
			return Promise.resolve();

		/*
		 收集所有新建的和已存在的 section，按 .index 排序，
		 然后调用 callOrder 提交排序结果到后端
		*/
		for (const c in r) {
			const o = [ ];

			// 跳过已被整体删除的配置
			if (d[c])
				continue;

			// 收集新建的 section（还未提交到后端的）
			if (n[c])
				for (const s in n[c])
					o.push(n[c][s]);

			// 收集已存在的 section
			for (const s in v[c])
				o.push(v[c][s]);

			if (o.length > 0) {
				// 按 .index 升序排列
				o.sort((a, b) => a['.index'] - b['.index']);

				// 提取排好序的 section ID 列表
				const sids = [ ];
				for (let i = 0; i < o.length; i++)
					sids.push(o[i]['.name']);

				tasks.push(this.callOrder(c, sids));
			}
		}

		// 清空排序记录，并等待所有排序任务完成
		this.state.reorder = { };
		return Promise.all(tasks);
	},

	/**
	 * 【内部方法】加载单个配置包（带缓存）。
	 *
	 * 若该配置已在加载中（返回 Promise）或已加载完成，直接返回缓存结果。
	 * 否则发起 RPC 请求并缓存其 Promise。
	 *
	 * @param {string} packageName - 配置文件名
	 * @returns {Promise}
	 */
	/* private */
	loadPackage(packageName) {
		if (this.loaded[packageName] == null)
			return (this.loaded[packageName] = this.callLoad(packageName));

		return Promise.resolve(this.loaded[packageName]);
	},

	/**
	 * 从远端 ubus 接口加载指定的 UCI 配置文件到本地缓存。
	 *
	 * 已加载的配置会被缓存，重复调用 load() 不会发起重复请求。
	 * 如需强制重新加载，请先调用 unload() 清除缓存。
	 *
	 * @param {string|string[]} packages
	 *   要加载的配置文件名，或配置文件名数组
	 *   （如 'network'、['network', 'firewall']）
	 *
	 * @returns {Promise<string[]>}
	 *   Promise resolve 后返回成功加载的配置文件名数组
	 *
	 * 使用示例：
	 *   // 加载单个配置
	 *   await uci.load('network');
	 *
	 *   // 同时加载多个配置
	 *   const loaded = await uci.load(['network', 'firewall', 'system']);
	 *   console.log(loaded); // => ['network', 'firewall', 'system']
	 *
	 *   // 已加载的配置不会重复请求
	 *   await uci.load('network'); // 第二次调用，直接返回缓存
	 */
	load(packages) {
		const self = this;
		const pkgs = [ ];
		const tasks = [];

		// 统一转为数组格式处理
		if (!Array.isArray(packages))
			packages = [ packages ];

		// 只加载尚未缓存的配置文件
		for (let i = 0; i < packages.length; i++)
			if (!self.state.values[packages[i]]) {
				pkgs.push(packages[i]);
				tasks.push(self.loadPackage(packages[i]));
			}

		return Promise.all(tasks).then(responses => {
			// 将返回的数据存入 state.values 缓存
			for (let i = 0; i < responses.length; i++)
				self.state.values[pkgs[i]] = responses[i];

			// 通知其他组件 UCI 配置已加载完成
			if (responses.length)
				document.dispatchEvent(new CustomEvent('uci-loaded'));

			return pkgs;
		});
	},

	/**
	 * 从本地缓存中卸载指定的 UCI 配置文件。
	 *
	 * 卸载后，对应配置的所有本地缓存数据（包括未提交的变更）都会被清除。
	 * 下次调用 load() 时，会重新从后端获取最新数据。
	 *
	 * @param {string|string[]} packages
	 *   要卸载的配置文件名，或配置文件名数组
	 *
	 * 使用示例：
	 *   // 卸载单个配置
	 *   uci.unload('network');
	 *
	 *   // 卸载多个配置
	 *   uci.unload(['network', 'firewall']);
	 *
	 *   // 强制重新加载（先卸载再加载）
	 *   uci.unload('network');
	 *   await uci.load('network');
	 */
	unload(packages) {
		if (!Array.isArray(packages))
			packages = [ packages ];

		for (let i = 0; i < packages.length; i++) {
			// 清除所有与该配置相关的本地状态
			delete this.state.values[packages[i]];
			delete this.state.creates[packages[i]];
			delete this.state.changes[packages[i]];
			delete this.state.deletes[packages[i]];

			// 清除加载记录，允许下次重新请求
			delete this.loaded[packages[i]];
		}
	},

	/**
	 * 在指定配置中新增一个 section。
	 *
	 * 新增的 section 只保存在本地缓存（state.creates）中，
	 * 需调用 save() 才会真正提交到后端。
	 *
	 * @param {string} conf   - 配置文件名（如 'network'）
	 * @param {string} type   - section 类型（如 'interface'、'rule'）
	 * @param {string} [name] - section 名称（可选）。省略则创建匿名 section
	 * @returns {string}        新 section 的 ID
	 *   - 命名 section：返回传入的 name
	 *   - 匿名 section：返回临时 ID（格式 newXXXXXX）
	 *
	 * 使用示例：
	 *   // 添加一个命名 section
	 *   uci.add('network', 'interface', 'vpn0');
	 *   uci.set('network', 'vpn0', 'proto', 'wireguard');
	 *
	 *   // 添加一个匿名 section（防火墙规则）
	 *   const sid = uci.add('firewall', 'rule');
	 *   uci.set('firewall', sid, 'name', 'Allow-HTTPS');
	 *   uci.set('firewall', sid, 'dest_port', '443');
	 *   uci.set('firewall', sid, 'target', 'ACCEPT');
	 *
	 *   await uci.save();
	 */
	add(conf, type, name) {
		const n = this.state.creates;
		// 命名 section 使用传入的 name，匿名 section 生成临时 ID
		const sid = name || this.createSID(conf);

		n[conf] ??= { };
		n[conf][sid] = {
			'.type':      type,       // section 类型
			'.name':      sid,        // section 内部 ID
			'.create':    name,       // 命名 section 的实际名称（匿名为 undefined）
			'.anonymous': !name,      // 是否为匿名 section
			'.index':     1000 + this.state.newidx++  // 排序索引（新建的排在后面）
		};

		return sid;
	},

	/**
	 * 克隆一个已有 section，并将克隆结果添加到指定配置中。
	 *
	 * 克隆的 section 会复制源 section 的所有选项值，
	 * 但拥有新的 ID（和可选的新名称）。
	 *
	 * @param {string}  conf     - 目标配置文件名
	 * @param {string}  type     - 新 section 的类型
	 * @param {string}  srcsid   - 要克隆的源 section ID
	 * @param {boolean} [put_next=false]
	 *   - true：将克隆的 section 放在源 section 之后
	 *   - false（默认）：放在配置末尾
	 * @param {string}  [name]   - 新 section 的名称（省略则创建匿名 section）
	 * @returns {string}           新 section 的 ID
	 *
	 * 使用示例：
	 *   // 克隆 'lan' 接口配置，紧跟在其后
	 *   const newSid = uci.clone('network', 'interface', 'lan', true, 'lan2');
	 *   uci.set('network', 'lan2', 'ipaddr', '192.168.3.1');
	 *   await uci.save();
	 */
	clone(conf, type, srcsid, put_next, name) {
		let n = this.state.creates;
		let sid = this.createSID(conf);
		let v = this.state.values;
		put_next = put_next || false;

		if (!n[conf])
			n[conf] = { };

		// 复制源 section 的所有属性，并覆盖元数据字段
		n[conf][sid] = {
			...v[conf][srcsid],       // 继承源 section 的所有选项值
			'.type': type,
			'.name': sid,
			'.create': name,
			'.anonymous': !name,
			'.index': 1000 + this.state.newidx++
		};

		// 若需要紧跟在源 section 后面，调用 move 进行定位
		if (put_next)
			this.move(conf, sid, srcsid, put_next);

		return sid;
	},

	/**
	 * 从指定配置中删除一个 section。
	 *
	 * 删除操作只在本地缓存中记录，需调用 save() 才会真正提交到后端。
	 * - 若删除的是刚刚新建（未提交）的 section，直接从 creates 中移除
	 * - 若删除的是已有 section，记录到 deletes 中，并清除该 section 的本地变更
	 *
	 * @param {string} conf - 配置文件名
	 * @param {string} sid  - 要删除的 section ID
	 *
	 * 使用示例：
	 *   // 删除一个已有的接口配置
	 *   uci.remove('network', 'guest_wifi');
	 *   await uci.save();
	 *
	 *   // 删除刚刚新建但未提交的 section
	 *   const sid = uci.add('firewall', 'rule');
	 *   uci.remove('firewall', sid);  // 直接从 creates 中移除，不会提交到后端
	 */
	remove(conf, sid) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		/* 若是刚刚新建（尚未提交）的 section，直接删除本地记录 */
		if (n[conf]?.[sid]) {
			delete n[conf][sid];
		}
		/* 若是已有 section，记录删除操作并清理该 section 的变更记录 */
		else if (v[conf]?.[sid]) {
			delete c[conf]?.[sid];

			d[conf] ??= { };
			d[conf][sid] = true;  // true 表示删除整个 section
		}
	},

	/**
	 * @typedef {Object<string, boolean|number|string|string[]>} SectionObject
	 * @memberof LuCI.uci
	 *
	 * Section 对象表示一个 UCI 配置块中的所有选项及其值，以及若干内部元数据字段。
	 * 内部字段以 `.` 开头（UCI 不允许选项名含 `.`），普通选项为字符串或字符串数组。
	 *
	 * 内部元数据字段说明：
	 *   @property {boolean} .anonymous - 是否为匿名 section（true 表示匿名）
	 *   @property {number}  .index     - section 的排列顺序（从 0 开始）
	 *   @property {string}  .name      - section 的内部 ID（匿名格式 cfgXXXXXX/newXXXXXX，命名则为实际名称）
	 *   @property {string}  .type      - section 的类型（如 'interface'、'rule'）
	 *   @property {string|string[]} *  - 其他普通选项（字符串或字符串数组）
	 *
	 * 示例（network 配置中的 lan section）：
	 *   {
	 *     '.name':      'lan',
	 *     '.type':      'interface',
	 *     '.anonymous': false,
	 *     '.index':     1,
	 *     'proto':      'static',
	 *     'ipaddr':     '192.168.1.1',
	 *     'netmask':    '255.255.255.0',
	 *     'dns':        ['8.8.8.8', '8.8.4.4']  // list 类型选项
	 *   }
	 */

	/**
	 * @callback LuCI.uci~sectionsFn
	 * sections() 方法的回调函数类型。
	 *
	 * @param {LuCI.uci.SectionObject} section - 当前枚举到的 section 对象
	 * @param {string} sid                      - 当前 section 的名称或 ID
	 */

	/**
	 * 枚举指定配置中的所有 section，可按类型过滤，并可传入回调逐个处理。
	 *
	 * 返回结果已按 .index 升序排列，并包含本地未提交的新建 section。
	 * 已被标记删除的 section 不会出现在结果中。
	 *
	 * @param {string}   conf   - 配置文件名
	 * @param {string}   [type] - 只枚举指定类型的 section（省略则枚举全部）
	 * @param {LuCI.uci~sectionsFn} [cb] - 可选回调，对每个 section 调用一次
	 * @returns {Array<LuCI.uci.SectionObject>} 排序后的 section 对象数组
	 *
	 * 使用示例：
	 *   // 获取 network 配置中所有 interface 类型的 section
	 *   const interfaces = uci.sections('network', 'interface');
	 *   // => [ { .name: 'loopback', proto: 'static', ... }, { .name: 'lan', ... }, ... ]
	 *
	 *   // 遍历所有防火墙规则并打印规则名称
	 *   uci.sections('firewall', 'rule', (s, sid) => {
	 *     console.log(sid, s['name']);
	 *   });
	 *
	 *   // 获取配置中的所有 section（不过滤类型）
	 *   const all = uci.sections('system');
	 */
	sections(conf, type, cb) {
		const sa = [ ];
		const v = this.state.values[conf];
		const n = this.state.creates[conf];
		const c = this.state.changes[conf];
		const d = this.state.deletes[conf];

		// 配置未加载，返回空数组
		if (!v)
			return sa;

		// 遍历已有 section（values 中），跳过已删除的，按类型过滤
		for (const s in v)
			if (!d || d[s] !== true)
				if (!type || v[s]['.type'] == type)
					// 合并本地变更（changes），生成快照对象
					sa.push(Object.assign({ }, v[s], c ? c[s] : null));

		// 将本地新建但未提交的 section（creates 中）也加入结果
		if (n)
			for (const s in n)
				if (!type || n[s]['.type'] == type)
					sa.push(Object.assign({ }, n[s]));

		// 按 .index 升序排列
		sa.sort((a, b) => {
			return a['.index'] - b['.index'];
		});

		// 重新对 .index 归一化（从 0 开始连续）
		for (let i = 0; i < sa.length; i++)
			sa[i]['.index'] = i;

		// 若提供了回调，依次调用
		if (typeof(cb) == 'function')
			for (let i = 0; i < sa.length; i++)
				cb.call(this, sa[i], sa[i]['.name']);

		return sa;
	},

	/**
	 * 读取指定配置中某个 section 的选项值，或获取整个 section 对象。
	 *
	 * 读取时会自动合并本地未提交的变更（changes、creates、deletes）。
	 *
	 * @param {string} conf      - 配置文件名
	 * @param {string} sid       - section 的名称或 ID（支持扩展格式 @type[index]）
	 * @param {string} [opt]     - 选项名（省略则返回整个 section 对象）
	 * @returns {null|string|string[]|LuCI.uci.SectionObject}
	 *   - 普通选项：返回字符串
	 *   - list 类型选项：返回字符串数组
	 *   - 省略 opt：返回整个 section 对象
	 *   - 配置/section/选项不存在：返回 null
	 *
	 * 使用示例：
	 *   // 读取单个选项值
	 *   const proto = uci.get('network', 'lan', 'proto');     // => 'static'
	 *   const ipaddr = uci.get('network', 'lan', 'ipaddr');   // => '192.168.1.1'
	 *
	 *   // 读取 list 类型选项
	 *   const dns = uci.get('network', 'lan', 'dns');         // => ['8.8.8.8', '8.8.4.4']
	 *
	 *   // 读取整个 section 对象
	 *   const section = uci.get('network', 'lan');
	 *   // => { .name: 'lan', .type: 'interface', proto: 'static', ... }
	 *
	 *   // 使用扩展格式（获取第一个 interface）
	 *   const firstIface = uci.get('network', '@interface[0]', 'proto');
	 *
	 *   // 不存在的配置返回 null
	 *   uci.get('network', 'notexist', 'proto')  // => null
	 */
	get(conf, sid, opt) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		// 解析扩展格式 ID（如 @interface[0]）
		sid = this.resolveSID(conf, sid);

		if (sid == null)
			return null;

		/* 若 section 是刚刚新建（未提交），从 creates 中读取 */
		if (n[conf]?.[sid]) {
			if (opt == null)
				return n[conf][sid];

			return n[conf][sid][opt];
		}

		/* 读取单个选项值 */
		if (opt != null) {
			/* 检查该选项是否被删除 */
			if (d[conf]?.[sid])
				if (d[conf][sid] === true || d[conf][sid][opt])
					return null;

			/* 检查是否有本地变更（优先返回变更后的值）*/
			if (c[conf]?.[sid]?.[opt] != null)
				return c[conf][sid][opt];

			/* 返回原始值 */
			if (v[conf]?.[sid])
				return v[conf][sid][opt];

			return null;
		}

		/* 读取整个 section */
		if (v[conf]) {
			/* 检查整个 section 是否被删除 */
			if (d[conf]?.[sid] === true)
				return null;

			const s = v[conf][sid] || null;

			if (s) {
				/* 将本地变更合并进 section 对象 */
				if (c[conf]?.[sid])
					for (const opt in c[conf][sid])
						if (c[conf][sid][opt] != null)
							s[opt] = c[conf][sid][opt];

				/* 将本地删除的选项从 section 对象中移除 */
				if (d[conf]?.[sid])
					for (const opt in d[conf][sid])
						delete s[opt];
			}

			return s;
		}

		return null;
	},

	/**
	 * 设置指定 section 中某个选项的值。
	 *
	 * 修改只在本地缓存中记录（state.changes），需调用 save() 才会提交到后端。
	 *
	 * 特殊情况：
	 * - 若 conf、sid 或 opt 为 null，或 opt 以 `.` 开头，函数不做任何操作
	 * - 若 val 为 null 或空字符串，则删除该选项（等同于调用 unset()）
	 * - 不允许对已被删除的 section 设置选项
	 * - 不允许对不存在的 section 设置选项
	 *
	 * @param {string}             conf - 配置文件名
	 * @param {string}             sid  - section 名称或 ID
	 * @param {string}             opt  - 选项名
	 * @param {null|string|string[]} val - 要设置的值（null 或空字符串表示删除该选项）
	 *
	 * 使用示例：
	 *   // 设置字符串值
	 *   uci.set('network', 'lan', 'ipaddr', '192.168.2.1');
	 *
	 *   // 设置 list 类型值
	 *   uci.set('network', 'lan', 'dns', ['114.114.114.114', '8.8.8.8']);
	 *
	 *   // 删除某个选项（传入 null）
	 *   uci.set('network', 'lan', 'gateway', null);
	 *
	 *   // 删除某个选项（传入空字符串）
	 *   uci.set('network', 'lan', 'gateway', '');
	 *
	 *   await uci.save();
	 */
	set(conf, sid, opt, val) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		// 解析扩展格式 ID
		sid = this.resolveSID(conf, sid);

		// 无效参数或选项名以 . 开头（内部字段），直接返回
		if (sid == null || opt == null || opt.charAt(0) == '.')
			return;

		if (n[conf]?.[sid]) {
			/* 对于新建的 section，直接修改 creates 中的数据 */
			if (val != null)
				n[conf][sid][opt] = val;
			else
				delete n[conf][sid][opt];
		}
		else if (val != null && val !== '') {
			/* 设置新值 */

			/* 不允许对已删除的整个 section 设置选项 */
			if (d[conf] && d[conf][sid] === true)
				return;

			/* 只允许对已存在的 section 设置选项 */
			if (!v[conf]?.[sid])
				return;

			c[conf] ??= {};
			c[conf][sid] ??= {};

			/*
			 若该选项之前被标记删除，现在重新设置值，
			 则需要从 deletes 中撤销该删除标记
			*/
			if (d[conf]?.[sid]) {
				if (isEmpty(d[conf][sid], opt))
					delete d[conf][sid];       // 该 section 下没有其他删除项，整个移除
				else
					delete d[conf][sid][opt];  // 只撤销该选项的删除标记
			}

			// 记录变更
			c[conf][sid][opt] = val;
		}
		else {
			/* 删除选项（val 为 null 或空字符串）*/

			/* 撤销对该选项的任何现有变更记录 */
			if (c[conf]?.[sid]) {
				if (isEmpty(c[conf][sid], opt))
					delete c[conf][sid];
				else
					delete c[conf][sid][opt];
			}

			/* 只对原始数据中存在的选项记录删除操作 */
			if (v[conf]?.[sid]?.hasOwnProperty(opt)) {
				d[conf] ??= { };
				d[conf][sid] ??= { };

				if (d[conf][sid] !== true)
					d[conf][sid][opt] = true;  // 标记该选项待删除
			}
		}
	},

	/**
	 * 删除指定 section 中的某个选项。
	 *
	 * 这是 `uci.set(conf, sid, opt, null)` 的便捷封装。
	 *
	 * @param {string} conf - 配置文件名
	 * @param {string} sid  - section 名称或 ID
	 * @param {string} opt  - 要删除的选项名
	 *
	 * 使用示例：
	 *   // 删除 lan 接口的 gateway 设置
	 *   uci.unset('network', 'lan', 'gateway');
	 *   await uci.save();
	 */
	unset(conf, sid, opt) {
		return this.set(conf, sid, opt, null);
	},

	/**
	 * 读取指定配置中符合类型的第一个 section 的选项值，
	 * 或在不指定类型时读取整个配置的第一个 section。
	 *
	 * @param {string} conf   - 配置文件名
	 * @param {string} [type] - section 类型（省略则取整个配置的第一个 section）
	 * @param {string} [opt]  - 选项名（省略则返回整个 section 对象）
	 * @returns {null|string|string[]|LuCI.uci.SectionObject}
	 *
	 * 使用示例：
	 *   // 读取 system 配置中第一个 system 类型 section 的 hostname
	 *   const hostname = uci.get_first('system', 'system', 'hostname');
	 *   // => 'OpenWrt'
	 *
	 *   // 读取整个第一个 system section
	 *   const sysSection = uci.get_first('system', 'system');
	 */
	get_first(conf, type, opt) {
		let sid = null;

		// 找到第一个匹配类型的 section 名称
		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.get(conf, sid, opt);
	},

	/**
	 * 读取指定选项的值并返回布尔结果。
	 *
	 * 适用于 UCI 配置中常见的布尔开关选项（如 enabled、disabled）。
	 * 以下值（不区分大小写）被视为 true：
	 *   '1'、'on'、'true'、'yes'、'enabled'
	 * 其他值均返回 false。
	 *
	 * @param {string} conf   - 配置文件名
	 * @param {string} type   - section 的名称或 ID（注意：此处参数名为 type 但实际是 sid）
	 * @param {string} [opt]  - 选项名（省略则返回 false）
	 * @returns {boolean}
	 *
	 * 使用示例：
	 *   // 检查 uhttpd 是否开启了重定向
	 *   const redirect = uci.get_bool('uhttpd', 'main', 'redirect_https');
	 *   // => true 或 false
	 *
	 *   // 检查 dropbear SSH 是否启用了密码登录
	 *   const pwdAuth = uci.get_bool('dropbear', '@dropbear[0]', 'PasswordAuth');
	 *   // => true（如果值为 'on'/'yes'/'1'/'true'/'enabled'）
	 */
	get_bool(conf, type, opt) {
		let value = this.get(conf, type, opt);
		if (typeof(value) == 'string')
			return ['1', 'on', 'true', 'yes', 'enabled'].includes(value.toLowerCase());
		return false;
	},

	/**
	 * 在符合指定类型的第一个 section 中设置某个选项的值。
	 * 若不指定类型，则在整个配置的第一个 section 中设置。
	 *
	 * 若 conf、type 或 opt 为 null，或 opt 以 `.` 开头，函数不做任何操作。
	 *
	 * @param {string}             conf - 配置文件名
	 * @param {string}             [type] - section 类型（省略则操作第一个 section）
	 * @param {string}             opt  - 选项名
	 * @param {null|string|string[]} val - 要设置的值（null 或空字符串表示删除）
	 *
	 * 使用示例：
	 *   // 修改 system 配置中第一个 system section 的 hostname
	 *   uci.set_first('system', 'system', 'hostname', 'MyRouter');
	 *   await uci.save();
	 *
	 *   // 修改整个配置第一个 section 的某个选项（不指定类型）
	 *   uci.set_first('dropbear', null, 'Port', '2222');
	 */
	set_first(conf, type, opt, val) {
		let sid = null;

		// 找到第一个匹配类型的 section 名称
		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.set(conf, sid, opt, val);
	},

	/**
	 * 删除符合指定类型的第一个 section 中的某个选项。
	 *
	 * 这是 `uci.set_first(conf, type, opt, null)` 的便捷封装。
	 *
	 * @param {string} conf   - 配置文件名
	 * @param {string} [type] - section 类型
	 * @param {string} opt    - 要删除的选项名
	 *
	 * 使用示例：
	 *   // 删除 system 配置中第一个 system section 的 timezone 选项
	 *   uci.unset_first('system', 'system', 'timezone');
	 *   await uci.save();
	 */
	unset_first(conf, type, opt) {
		return this.set_first(conf, type, opt, null);
	},

	/**
	 * 移动指定配置中的 section，使其排列在另一个 section 的前面或后面。
	 *
	 * @param {string}  conf         - 配置文件名
	 * @param {string}  sid1         - 要移动的 section 的 ID
	 * @param {string}  [sid2]       - 目标 section 的 ID
	 *   - 若为 null，则将 sid1 移动到配置末尾
	 * @param {boolean} [after=false]
	 *   - false（默认）：将 sid1 移动到 sid2 之前
	 *   - true：将 sid1 移动到 sid2 之后
	 *   - 若 sid2 为 null，此参数无效（始终移到末尾）
	 * @returns {boolean}
	 *   - true：移动成功
	 *   - false：sid1 或 sid2 不存在，移动失败
	 *
	 * 使用示例：
	 *   // 将防火墙规则 'rule_ssh' 移动到 'rule_http' 之前
	 *   uci.move('firewall', 'rule_ssh', 'rule_http');
	 *
	 *   // 将 'rule_ssh' 移动到 'rule_http' 之后
	 *   uci.move('firewall', 'rule_ssh', 'rule_http', true);
	 *
	 *   // 将 'rule_ssh' 移动到配置末尾
	 *   uci.move('firewall', 'rule_ssh', null);
	 *
	 *   await uci.save();
	 */
	move(conf, sid1, sid2, after) {
		// 获取该配置下所有 section 的有序列表
		const sa = this.sections(conf);
		let s1 = null;
		let s2 = null;

		// 解析扩展格式 ID
		sid1 = this.resolveSID(conf, sid1);
		sid2 = this.resolveSID(conf, sid2);

		// 从列表中找到并取出 sid1
		for (let i = 0; i < sa.length; i++) {
			if (sa[i]['.name'] != sid1)
				continue;

			s1 = sa[i];
			sa.splice(i, 1);  // 从数组中移除 s1
			break;
		}

		// sid1 不存在，移动失败
		if (s1 == null)
			return false;

		if (sid2 == null) {
			// 移到末尾
			sa.push(s1);
		}
		else {
			// 找到 sid2 的位置，将 s1 插入其前或其后
			for (let i = 0; i < sa.length; i++) {
				if (sa[i]['.name'] != sid2)
					continue;

				s2 = sa[i];
				// !!after：after 为 true 时偏移量为 1（插在 sid2 之后），否则为 0（插在之前）
				sa.splice(i + !!after, 0, s1);
				break;
			}

			// sid2 不存在，移动失败
			if (s2 == null)
				return false;
		}

		// 更新所有 section 的 .index 以反映新顺序
		for (let i = 0; i < sa.length; i++)
			this.get(conf, sa[i]['.name'])['.index'] = i;

		// 标记该配置需要重新排序（save 时会调用 reorderSections）
		if (this.state)
			this.state.reorder[conf] = true;

		return true;
	},

	/**
	 * 将所有本地变更提交到远端 ubus UCI 接口。
	 *
	 * 提交顺序为：删除 → 新增 → 修改 → 重排序。
	 * 提交完成后，会自动重新加载变更涉及的所有配置，
	 * 使本地缓存与后端保持同步。
	 *
	 * 注意：save() 只是将变更写入 UCI 配置缓冲区，
	 * 配置并不会立即在系统上生效。需调用 apply() 才能使配置真正生效。
	 *
	 * @returns {Promise<string[]>}
	 *   Promise resolve 后返回已重新加载的配置文件名数组
	 *
	 * 使用示例：
	 *   // 修改后保存
	 *   uci.set('network', 'lan', 'ipaddr', '192.168.10.1');
	 *   await uci.save();
	 *   // 之后若需要生效，再调用 apply()
	 *   await uci.apply();
	 */
	save() {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const self = this;
		const snew = [ ];    // 保存新建 section 对象的引用，用于接收后端返回的真实 ID
		let pkgs = { };      // 记录哪些配置文件被修改，需要重新加载
		const tasks = [];

		/* 第一步：处理所有删除操作 */
		if (d)
			for (const conf in d) {
				for (const sid in d[conf]) {
					const o = d[conf][sid];

					if (o === true)
						// 删除整个 section
						tasks.push(self.callDelete(conf, sid, null));
					else
						// 只删除指定的选项
						tasks.push(self.callDelete(conf, sid, Object.keys(o)));
				}

				pkgs[conf] = true;
			}

		/* 第二步：处理所有新增操作 */
		if (n)
			for (const conf in n) {
				for (const sid in n[conf]) {
					const p = {
						config: conf,
						values: { }
					};

					// 从新建 section 的数据中提取类型、名称和普通选项
					for (const k in n[conf][sid]) {
						if (k == '.type')
							p.type = n[conf][sid][k];
						else if (k == '.create')
							p.name = n[conf][sid][k];  // 命名 section 的实际名称
						else if (k.charAt(0) != '.')
							p.values[k] = n[conf][sid][k];  // 普通选项值
					}

					// 保存对该 section 对象的引用，以便稍后接收后端分配的真实 ID
					snew.push(n[conf][sid]);
					tasks.push(self.callAdd(p.config, p.type, p.name, p.values));
				}

				pkgs[conf] = true;
			}

		/* 第三步：处理所有修改操作 */
		if (c)
			for (const conf in c) {
				for (const sid in c[conf])
					tasks.push(self.callSet(conf, sid, c[conf][sid]));

				pkgs[conf] = true;
			}

		/* 记录需要重排序的配置 */
		if (r)
			for (const conf in r)
				pkgs[conf] = true;

		return Promise.all(tasks).then(responses => {
			/*
			 responses 中包含各 callAdd 返回的新 section ID。
			 将它们赋值给 snew 中对应的 section 对象，
			 使本地新建 section 的 .name 更新为后端的真实 ID。
			*/
			for (let i = 0; i < snew.length; i++)
				snew[i]['.name'] = responses[i];

			// 提交排序变更
			return self.reorderSections();
		}).then(() => {
			pkgs = Object.keys(pkgs);

			// 卸载并重新加载所有被修改的配置，使本地缓存与后端一致
			self.unload(pkgs);

			return self.load(pkgs);
		});
	},

	/**
	 * 通知远端 ubus UCI 接口提交所有已保存的变更，并使其在系统上生效。
	 *
	 * 工作流程：
	 * 1. 调用 callApply() 触发后端应用配置（带回滚保护）
	 * 2. 在超时时间内反复尝试调用 callConfirm() 确认变更
	 * 3. 确认成功后，回滚计时器被取消，配置永久生效
	 * 4. 若超时前未能确认，后端会自动回滚到上一版本配置
	 *
	 * @param {number} [timeout=10] - 确认超时时间（秒），默认 10 秒
	 * @returns {Promise<number>}     Promise resolve/reject 时返回 ubus RPC 状态码
	 *
	 * 使用示例：
	 *   // 保存并应用（使用默认 10 秒超时）
	 *   await uci.save();
	 *   await uci.apply();
	 *
	 *   // 使用更长的超时（适合配置复杂服务）
	 *   await uci.save();
	 *   await uci.apply(30);
	 *
	 *   // 完整错误处理
	 *   try {
	 *     await uci.save();
	 *     await uci.apply(15);
	 *     console.log('配置已成功应用！');
	 *   } catch(err) {
	 *     console.error('应用失败，错误码：', err);
	 *   }
	 */
	apply(timeout) {
		const self = this;
		const date = new Date();

		// 参数校验：超时时间必须是正整数，否则使用默认值 10 秒
		if (typeof(timeout) != 'number' || timeout < 1)
			timeout = 10;

		return self.callApply(timeout, true).then(rv => {
			// rv 非 0 表示 apply 调用失败
			if (rv != 0)
				return Promise.reject(rv);

			// 计算确认截止时间
			const try_deadline = date.getTime() + 1000 * timeout;

			// 递归重试确认，直到成功或超时
			const try_confirm = () => {
				return self.callConfirm().then(rv => {
					if (rv != 0) {
						if (date.getTime() < try_deadline)
							// 尚未超时，250ms 后重试
							window.setTimeout(try_confirm, 250);
						else
							// 已超时，以失败状态 reject
							return Promise.reject(rv);
					}

					return rv;
				});
			};

			// 等待 1 秒后开始首次确认尝试
			window.setTimeout(try_confirm, 1000);
		});
	},

	/**
	 * @typedef {string[]} ChangeRecord
	 * @memberof LuCI.uci
	 *
	 * UCI 变更记录是一个字符串数组，描述一次具体的配置操作。
	 *
	 * 数组各元素含义：
	 *   [0] 操作名称，可为以下之一：
	 *         'add'      - 添加了一个 section
	 *         'set'      - 设置了一个选项值，或添加了一个命名 section
	 *         'remove'   - 删除了一个选项
	 *         'order'    - 调整了 section 的排列顺序
	 *         'list-add' - 向 list 类型选项添加了一个值
	 *         'list-del' - 从 list 类型选项删除了一个值
	 *         'rename'   - 重命名了一个选项或 section
	 *
	 *   [1] 受影响的 section ID
	 *
	 *   [2] 第三个元素的含义因操作而异：
	 *         'add'      - 新增 section 的类型
	 *         'set'      - 若有第四元素：选项名；若无：命名 section 的类型
	 *         'remove'   - 被删除的选项名
	 *         'order'    - section 的新排序索引
	 *         'list-add' - 被添加值的 list 选项名
	 *         'list-del' - 被删除值的 list 选项名
	 *         'rename'   - 若有第四元素：被重命名的选项名；若无：section 的新名称
	 *
	 *   [3] 第四个元素的含义因操作而异（可选）：
	 *         'set'      - 选项被设置的新值
	 *         'list-add' - 被添加到 list 的新值
	 *         'rename'   - 选项被重命名后的新名称
	 *
	 * 示例：
	 *   ['set', 'lan', 'ipaddr', '192.168.2.1']   // 将 lan.ipaddr 设为 192.168.2.1
	 *   ['add', 'cfg1a2b3c', 'rule']              // 新增一个 rule 类型的匿名 section
	 *   ['remove', 'wan', 'gateway']              // 删除 wan.gateway 选项
	 */

	/**
	 * 从远端 ubus RPC 接口获取所有未提交的 UCI 变更记录。
	 *
	 * 注意：这里获取的是后端 UCI 缓冲区中尚未 commit 的变更，
	 * 而非本地缓存中的变更（本地未提交的变更不会出现在这里）。
	 *
	 * @method
	 * @returns {Promise<Object<string, Array<LuCI.uci.ChangeRecord>>>}
	 *   Promise resolve 后返回一个对象，
	 *   键为配置文件名，值为该配置的变更记录数组。
	 *
	 * 使用示例：
	 *   // 查看当前有哪些未提交的变更
	 *   const pending = await uci.changes();
	 *   // => {
	 *   //      'network': [
	 *   //        ['set', 'lan', 'ipaddr', '192.168.2.1'],
	 *   //        ['set', 'lan', 'gateway', '192.168.2.254']
	 *   //      ],
	 *   //      'firewall': [
	 *   //        ['add', 'cfg1a2b3c', 'rule']
	 *   //      ]
	 *   //    }
	 *
	 *   // 判断是否有待提交的变更
	 *   const changes = await uci.changes();
	 *   if (Object.keys(changes).length > 0) {
	 *     console.log('有未应用的配置变更');
	 *   }
	 */
	changes: rpc.declare({
		object: 'uci',
		method: 'changes',
		expect: { changes: { } }
	})
});
