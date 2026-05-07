/**
 * ============================================================
 * LuCI form.js —— OpenWrt 配置表单核心框架
 * ============================================================

   【模块总览】
     form.js 是 LuCI Web 界面中用于构建 UCI 配置表单的核心框架。
     它将底层 UCI 配置（/etc/config/ 下的文件）与前端 UI 控件紧密绑定，
     让开发者只需几行代码就能生成完整的配置表单，无需手动处理
     数据加载、渲染、验证和保存的细节。

   【类继承体系】

     AbstractElement（所有表单元素的基类）
     ├── Map           完整表单，对应一个 UCI 配置文件
     │   └── JSONMap   基于 JS 对象数据（不读写 UCI）的表单
     ├── AbstractSection（Section 基类）
     │   ├── TypedSection   枚举某类型的所有 UCI section，垂直堆叠显示
     │   │   ├── TableSection   表格行形式显示多 section
     │   │   └── GridSection    网格形式，支持展开编辑
     │   └── NamedSection   直接引用指定名称的单个 UCI section
     └── AbstractValue（Option 控件基类）
         ├── Value          文本输入框（可附带候选下拉）
         │   ├── DynamicList    可动态增删的多值列表（对应 UCI list）
         │   │   └── MultiValue 多选下拉框（基于 Dropdown 控件）
         │   ├── ListValue      固定选项的下拉选择框
         │   │   └── RichListValue  带描述文字的富下拉框
         │   ├── RangeSliderValue  数值范围滑块
         │   ├── FlagValue      布尔开关复选框
         │   ├── TextValue      多行 textarea 文本域
         │   ├── DummyValue     只读展示值（不可编辑）
         │   ├── ButtonValue    操作按钮
         │   ├── HiddenValue    隐藏字段
         │   ├── FileUpload     文件上传/路径选择器
         │   ├── DirectoryPicker 目录选择器
         │   └── SectionValue   在 option 位置内嵌另一个 section

   【标准视图开发流程】

     'use strict';
     'require form';

     return view.extend({
       // 第1步：加载 UCI 配置
       load() { return uci.load('network'); },

       // 第2步：构建并渲染表单
       render() {
         let m, s, o;

         // 创建表单，绑定 UCI 配置文件 'network'
         m = new form.Map('network', _('网络配置'));

         // 添加 TypedSection，枚举所有 'interface' 类型的 UCI section
         s = m.section(form.TypedSection, 'interface', _('接口列表'));
         s.addremove = true;   // 允许增删 section
         s.anonymous = true;   // 创建匿名 section

         // 添加 option 控件
         o = s.option(form.ListValue, 'proto', _('协议'));
         o.value('dhcp',   _('DHCP'));
         o.value('static', _('静态 IP'));
         o.value('pppoe',  _('PPPoE'));

         o = s.option(form.Value, 'ipaddr', _('IP 地址'));
         o.datatype = 'cidr4';           // 格式验证
         o.depends('proto', 'static');   // 仅 proto=static 时显示

         o = s.option(form.Flag, 'auto', _('自动连接'));
         o.default = o.enabled = '1';

         return m.render();   // 返回 Promise<Node>
       }
     });

   【depends() 条件依赖系统完整用法】

     // 单条件：proto == 'pppoe' 时显示
     o.depends('proto', 'pppoe');

     // AND 条件（同一对象内多字段须同时满足）
     o.depends({ proto: 'pppoe', auth: 'pap' });

     // OR 条件（多次调用，任一满足即显示）
     o.depends('proto', 'pppoe');
     o.depends('proto', 'pptp');

     // 正则匹配
     o.depends({ proto: /ppp/ });

     // 跨 section 引用（点分格式：config.section_id.option）
     o.depends('network.lan.proto', 'static');

     // 包含匹配（字段值包含指定子串）
     o.depends({ zones: 'wan', '!contains': true });

     // 反向依赖（条件不满足时才显示）
     o.depends({ proto: 'none', '!reverse': true });

     // 始终显示
     o.depends({ '!default': true });

   【常用 datatype 验证类型一览】
     'ipaddr'        IPv4 或 IPv6 地址
     'ip4addr'       仅 IPv4 地址
     'ip6addr'       仅 IPv6 地址
     'cidr'          CIDR 格式（如 192.168.1.0/24）
     'cidr4'         IPv4 CIDR
     'cidr6'         IPv6 CIDR
     'ipnet4'        IPv4 地址/掩码
     'port'          端口号（1-65535）
     'portrange'     端口范围（如 8080-8090）
     'macaddr'       MAC 地址（AA:BB:CC:DD:EE:FF）
     'hostname'      主机名
     'host'          主机名或 IP 地址
     'uciname'       合法的 UCI 名称（字母数字下划线）
     'string'        任意字符串
     'integer'       整数
     'uinteger'      无符号整数（≥0）
     'float'         浮点数
     'range(a,b)'    值域限制（如 range(1,100)）
     'min(a)'        最小值限制
     'max(a)'        最大值限制
     'maxlength(n)'  字符串最大长度
     'minlength(n)'  字符串最小长度
     'ipmask'        IP 地址+掩码（空格分隔）
     'netmask4'      IPv4 子网掩码
     'neg(type)'     可带负号的指定类型（如 neg(ipaddr)）
     'list(t,sep)'   以 sep 分隔的类型列表
     'or(t1,t2)'     满足 t1 或 t2 之一（如 or(ip4addr,ip6addr)）
     'and(t1,t2)'    同时满足 t1 和 t2
     'file'          文件路径（以 '/' 开头的字符串）

   【Section 类型快速对比】

     ┌─────────────────┬──────────┬──────────┬──────────┬──────────────────────────────┐
     │ Section 类型    │ 展示方式  │ Tab 支持  │ 编辑方式  │ 适用场景                     │
     ├─────────────────┼──────────┼──────────┼──────────┼──────────────────────────────┤
     │ NamedSection    │ 单块展开  │ ✓         │ 直接编辑  │ 一个已知名称的 section       │
     │ TypedSection    │ 垂直堆叠  │ ✓         │ 直接编辑  │ 多个同类 section，字段多     │
     │ TableSection    │ 表格行   │ ✗         │ 直接/模态框│ 多个同类 section，字段少     │
     │ GridSection     │ 表格行   │ ✓（模态框）│ 格内/展开 │ 表格概览 + 详细编辑          │
     └─────────────────┴──────────┴──────────┴──────────┴──────────────────────────────┘

   【控件类型快速选择指南】

     用户场景                          推荐控件
     ─────────────────────────────────────────────────────────────
     输入任意文本                      form.Value
     输入文本，但有常用建议             form.Value + value()（Combobox）
     从固定列表选一个                   form.ListValue
     从固定列表选一个（需说明）          form.RichListValue
     从固定列表选多个                   form.MultiValue
     输入多个值（UCI list）             form.DynamicList
     布尔开关（是/否）                  form.Flag
     数值范围                          form.RangeSliderValue
     多行文本（代码/证书）              form.TextValue
     只读展示值                        form.DummyValue
     操作按钮（不存储值）               form.Button
     隐藏携带内部值                     form.HiddenValue
     选择文件路径                       form.FileUpload
     选择目录路径                       form.DirectoryPicker
     在 option 位置内嵌子表单           form.SectionValue

   【onchange 高级用法——响应字段变化实时更新 UI】

     // 场景：proto 改变时，动态显示/隐藏相关字段（这是 depends() 的替代方案，
     //        适合需要"主动驱动"而非被动响应的场景）
     var proto = s.option(form.ListValue, 'proto', _('协议'));
     proto.value('dhcp', 'DHCP');
     proto.value('static', _('静态'));
     proto.onchange = function(ev, section_id, value) {
       // 手动切换另一个 option 的可见性
       var ipOpt = this.map.lookupOption('ipaddr', section_id);
       if (ipOpt) ipOpt[0].setActive(section_id, value === 'static');
     };

     // 场景：根据输入值动态更新另一个字段的选项（Combobox 内容联动）
     var zone = s.option(form.ListValue, 'zone', _('防火墙区域'));
     zone.onchange = function(ev, section_id, value) {
       // 当区域改变时，更新相关联的规则列表
       var ruleOpt = this.map.lookupOption('rule', section_id);
       if (ruleOpt) {
         var uiEl = ruleOpt[0].getUIElement(section_id);
         if (uiEl) uiEl.setChoices(getRulesForZone(value));
       }
     };

   【defaults 属性——条件驱动的动态默认值】

     // defaults 是一个特殊对象，用于根据其他字段的值动态切换默认值。
     // 格式：{ '默认值': [依赖条件数组], ... }
     // 空数组 [] 表示兜底默认值（无条件生效）。

     // 示例：当 proto=pppoe 时 mtu 默认 1492，否则默认 1500
     var mtu = s.option(form.Value, 'mtu', _('MTU'));
     mtu.datatype = 'uinteger';
     mtu.optional = true;
     mtu.defaults = {
       '1492': [{ proto: 'pppoe' }],   // proto=pppoe 时默认 1492
       '1492': [{ proto: 'pptp' }],    // ⚠️ JS 对象 key 唯一，同值无法区分
       '1500': []                      // 兜底默认 1500
     };
     // 注意：JS 对象 key 必须唯一！若多个 proto 值对应同一 MTU 默认值，
     // 需要使用 depends() 嵌套或合并条件（依赖条件数组中的对象是 OR 关系）：
     mtu.defaults = {
       '1492': [{ proto: 'pppoe' }, { proto: 'pptp' }],  // pppoe OR pptp → 1492
       '1500': []
     };

   【自定义控件扩展——继承 Value 实现自定义输入控件】

     // 方式1：覆盖 renderWidget() 渲染自定义 HTML 控件
     var ColorPicker = form.Value.extend({
       renderWidget(section_id, option_index, cfgvalue) {
         const val = cfgvalue ?? this.default ?? '#ffffff';
         return E('input', {
           type: 'color',
           id: this.cbid(section_id),       // 必须设置 id 供 getUIElement() 查找
           value: val,
           change: (ev) => {
             // 必须触发 widget-change 事件，否则 depends() 和 onchange 不工作
             ev.target.dispatchEvent(new CustomEvent('widget-change', { bubbles: true }));
           }
         });
       },
       // 若没有使用 ui.* 控件，必须覆盖 formvalue() 读取输入值
       formvalue(section_id) {
         const el = this.map.findElement('id', this.cbid(section_id));
         return el ? el.value : null;
       }
     });

     // 方式2：覆盖 cfgvalue()/write() 实现数据转换（不改变渲染）
     var IpOnlyValue = form.Value.extend({
       // UCI 存 '192.168.1.1/24'，但只让用户编辑 IP 部分
       cfgvalue(section_id) {
         const raw = uci.get(this.map.config, section_id, this.option) || '';
         return raw.split('/')[0];
       },
       write(section_id, value) {
         const mask = uci.get(this.map.config, section_id, 'netmask') || '24';
         uci.set(this.map.config, section_id, this.option, `${value}/${mask}`);
       }
     });

   【开发 Checklist——新建 LuCI 视图时的常见步骤】

     □ 1. 在 load() 中预加载所有需要的 UCI 配置：
            return Promise.all([ uci.load('network'), uci.load('firewall') ]);

     □ 2. 若需要 RPC 数据，在 load() 中并行获取：
            return Promise.all([ uci.load('myapp'), callGetStatus() ]).then(([,status]) => {
              this._status = status;
            });

     □ 3. 使用 map.chain('otherconfig') 关联额外 UCI 文件（而非重复 uci.load）

     □ 4. 为每个表单控件设置合理的 datatype 验证

     □ 5. 明确设置 rmempty / optional：
            - 必填字段：o.rmempty = false;
            - 可选字段：o.optional = true;

     □ 6. 为 Flag 控件始终显式设置 enabled/disabled/default 三个属性

     □ 7. 在 render() 最后返回 m.render()（不要 await，直接返回 Promise）

     □ 8. 若视图有自定义操作按钮（Button），处理函数要返回 Promise
            并在出错时用 ui.addNotification() 展示错误，而非静默失败
 */
'use strict';
'require ui';
'require uci';
'require rpc';
'require dom';
'require baseclass';

const scope = this;

uci.loadPackage('luci').catch();

const callSessionAccess = rpc.declare({
	object: 'session',
	method: 'access',
	params: [ 'scope', 'object', 'function' ],
	expect: { 'access': false }
});

/**
 * ════════════════════════════════════════════════════════════
 * CBIJSONConfig（内部类）：为 JSONMap 提供类 UCI 接口的数据适配器
 * ════════════════════════════════════════════════════════════

   【作用】
     将一个普通 JS 对象包装成与 LuCI.uci 接口完全兼容的数据层。
     这使得 JSONMap 及其所有子元素可以透明地操作非 UCI 数据源，
     无需知道底层数据来自 UCI 文件还是 JS 对象。

   【支持的输入数据格式】

     // 格式1：值为数组 —— 每个元素代表一个匿名或命名 section
     {
       interface: [
         { '.name': 'lan', proto: 'static', ipaddr: '192.168.1.1' },
         { '.name': 'wan', proto: 'dhcp' },
         { proto: 'pppoe' }   // 无 .name → 自动生成 ID（如 interface2）
       ]
     }

     // 格式2：值为对象 —— 整个对象是一个命名 section（键名即 section 名）
     {
       system: { hostname: 'OpenWrt', timezone: 'UTC+8' }
     }

     // 格式3：混合格式
     {
       interface: [ { '.name': 'lan', ... } ],   // 数组格式
       globals:   { ula_prefix: 'auto' }          // 对象格式
     }

   【内部存储格式】
     每个 section 统一存储为：
     {
       '.name':      'section_id',  // section 唯一标识
       '.type':      'sectiontype', // section 类型
       '.anonymous': false,         // 是否匿名
       '.index':     0,             // 排列顺序（0开始）
       option1:      'value1',      // 实际配置选项
       ...
     }

   【与 LuCI.uci 的接口对应关系】
     本类实现了与 uci 完全相同的方法签名：
     load()           → 返回内存数据（无网络请求）
     save()           → 空操作（需调用方自行处理持久化）
     get(c, s, o)     → 读取选项值或整个 section
     set(c, s, o, v)  → 设置选项值
     unset(c, s, o)   → 删除选项（= set(..., null)）
     sections(c, t, cb) → 枚举 section
     add(c, t, n)     → 新建 section
     remove(c, s)     → 删除 section
     resolveSID()     → 直接返回原 ID（不处理 @type[n] 格式）
     move()           → 委托给 uci.move

   【使用场景】
     一般不直接使用，通过 JSONMap 间接使用。
     见 CBIJSONMap 的文档。
 */
const CBIJSONConfig = baseclass.extend({
	__init__(data) {
		data = Object.assign({}, data);

		this.data = {};

		let num_sections = 0;
		const section_ids = [];

		for (const sectiontype in data) {
			if (!data.hasOwnProperty(sectiontype))
				continue;

			if (Array.isArray(data[sectiontype])) {
				for (let i = 0, index = 0; i < data[sectiontype].length; i++) {
					const item = data[sectiontype][i];
					let anonymous;
					let name;

					if (!L.isObject(item))
						continue;

					if (typeof(item['.name']) == 'string') {
						name = item['.name'];
						anonymous = false;
					}
					else {
						name = sectiontype + num_sections;
						anonymous = true;
					}

					if (!this.data.hasOwnProperty(name))
						section_ids.push(name);

					this.data[name] = Object.assign(item, {
						'.index': num_sections++,
						'.anonymous': anonymous,
						'.name': name,
						'.type': sectiontype
					});
				}
			}
			else if (L.isObject(data[sectiontype])) {
				this.data[sectiontype] = Object.assign(data[sectiontype], {
					'.anonymous': false,
					'.name': sectiontype,
					'.type': sectiontype
				});

				section_ids.push(sectiontype);
				num_sections++;
			}
		}

		section_ids.sort(L.bind((a, b) => {
			const indexA = (this.data[a]['.index'] != null) ? +this.data[a]['.index'] : 9999;
			const indexB = (this.data[b]['.index'] != null) ? +this.data[b]['.index'] : 9999;

			if (indexA != indexB)
				return (indexA - indexB);

			return L.naturalCompare(a, b);
		}, this));

		for (let i = 0; i < section_ids.length; i++)
			this.data[section_ids[i]]['.index'] = i;
	},

	/**
	 * 加载内部数据（无网络请求，立即返回已解析的内存对象）。
	 * 与 LuCI.uci.load() 接口保持一致，JSONMap 调用时触发。
	 * @returns {Promise<Object>}
	 */
	load() {
		return Promise.resolve(this.data);
	},

	/**
	 * 保存操作（空实现，JSON 数据持久化需调用方自行处理）。
	 * JSONMap.save() 会调用此方法，但对 JSON 数据源无任何副作用。
	 * 如需将更改持久化，请在 map.save() 的回调中访问 this.data 并处理。
	 * @returns {Promise<void>}
	 */
	save() {
		return Promise.resolve();
	},

	/**
	 * 读取配置值（与 LuCI.uci.get 接口一致）。
	 *
	 * @param {string} config  - 配置名（忽略，JSON 只有一个内存数据源）
	 * @param {string} section - section ID；为 null 时返回 null
	 * @param {string} [option] - 选项名；省略时返回整个 section 对象
	 * @returns {string|string[]|Object|null}
	 *   - option 省略：返回整个 section 对象（含 .name/.type 等元信息）
	 *   - option 存在：返回对应值（数组/对象原样返回，其他强制转为字符串）
	 *   - section 不存在或选项不存在：返回 null
	 */
	get(config, section, option) {
		if (section == null)
			return null;

		if (option == null)
			return this.data[section];

		if (!this.data.hasOwnProperty(section))
			return null;

		const value = this.data[section][option];

		if (Array.isArray(value))
			return value;

		if (L.isObject(value))
			return value;

		if (value != null)
			return String(value);

		return null;
	},

	/**
	 * 设置配置值（与 LuCI.uci.set 接口一致）。
	 *
	 * 特殊规则：
	 *   - section 或 option 为 null 时静默返回（不执行操作）
	 *   - option 以 '.' 开头时静默返回（保护 .name/.type/.index 等元信息）
	 *   - value 为 null 时删除该选项（等同于 unset）
	 *   - value 为数组或对象时原样存储；其他类型强制转为字符串
	 *
	 * @param {string}   config  - 配置名（忽略）
	 * @param {string}   section - section ID
	 * @param {string}   option  - 选项名（不能以 '.' 开头）
	 * @param {*}        value   - 要写入的值；null 表示删除
	 */
	set(config, section, option, value) {
		if (section == null || option == null || option.charAt(0) == '.')
			return;

		if (!this.data.hasOwnProperty(section))
			return;

		if (value == null)
			delete this.data[section][option];
		else if (Array.isArray(value))
			this.data[section][option] = value;
		else if (L.isObject(value))
			this.data[section][option] = value;
		else
			this.data[section][option] = String(value);
	},

	/**
	 * 删除配置选项（与 LuCI.uci.unset 接口一致）。
	 * 等同于 set(config, section, option, null)。
	 *
	 * @param {string} config  - 配置名（忽略）
	 * @param {string} section - section ID
	 * @param {string} option  - 要删除的选项名
	 */
	unset(config, section, option) {
		return this.set(config, section, option, null);
	},

	/**
	 * 枚举 section 列表（与 LuCI.uci.sections 接口一致）。
	 *
	 * 按 .index 升序返回所有（或指定类型的）section 对象数组。
	 * 若提供了回调函数，对每个 section 调用 callback(section, section_id)。
	 *
	 * @param {string}   config      - 配置名（忽略）
	 * @param {string}   [sectiontype] - 过滤指定类型；null 表示返回所有类型
	 * @param {function} [callback]  - 可选回调：(sectionObj, sectionId) => void
	 * @returns {Object[]} section 对象数组（按 .index 排序）
	 */
	sections(config, sectiontype, callback) {
		const rv = [];

		for (const section_id in this.data)
			if (sectiontype == null || this.data[section_id]['.type'] == sectiontype)
				rv.push(this.data[section_id]);

		rv.sort((a, b) => { return a['.index'] - b['.index'] });

		if (typeof(callback) == 'function')
			for (let i = 0; i < rv.length; i++)
				callback.call(this, rv[i], rv[i]['.name']);

		return rv;
	},

	/**
	 * 添加新 section（与 LuCI.uci.add 接口一致）。
	 *
	 * 若已存在同名 section，直接返回已有的 section ID（不覆盖）。
	 * 若未提供名称（sectionname 为 null/undefined），自动生成：
	 *   ID = sectiontype + 当前同类型 section 的数量，如 'interface0'、'rule2'。
	 * 新 section 的 .index = 当前最大 index + 1（追加到末尾）。
	 *
	 * @param {string}  config      - 配置名（忽略）
	 * @param {string}  sectiontype - 新 section 的类型名
	 * @param {string}  [sectionname] - 新 section 的名称；省略则自动生成匿名 ID
	 * @returns {string} 新建（或已有）section 的 ID
	 */
	add(config, sectiontype, sectionname) {
		let num_sections_type = 0;
		let next_index = 0;

		for (const name in this.data) {
			num_sections_type += (this.data[name]['.type'] == sectiontype);
			next_index = Math.max(next_index, this.data[name]['.index']);
		}

		const section_id = sectionname ?? (sectiontype + num_sections_type);

		if (!this.data.hasOwnProperty(section_id)) {
			this.data[section_id] = {
				'.name': section_id,
				'.type': sectiontype,
				'.anonymous': (sectionname == null),
				'.index': next_index + 1
			};
		}

		return section_id;
	},

	/**
	 * 删除 section（与 LuCI.uci.remove 接口一致）。
	 *
	 * 从内存数据中删除指定 section 及其所有选项。
	 * 若 section 不存在，静默忽略。
	 *
	 * @param {string} config  - 配置名（忽略）
	 * @param {string} section - 要删除的 section ID
	 */
	remove(config, section) {
		if (this.data.hasOwnProperty(section))
			delete this.data[section];
	},

	/**
	 * 解析 section ID（与 LuCI.uci.resolveSID 接口一致）。
	 *
	 * CBIJSONConfig 不支持 @type[n] 格式，直接原样返回 section_id。
	 * 与 LuCI.uci.resolveSID 不同，后者会将 '@type[0]' 解析为实际的 section 名。
	 *
	 * @param {string} config     - 配置名（忽略）
	 * @param {string} section_id - section ID（直接返回）
	 * @returns {string} 原样返回的 section_id
	 */
	resolveSID(config, section_id) {
		return section_id;
	},

	/**
	 * 移动 section 顺序（委托给 LuCI.uci.move）。
	 *
	 * JSONMap 不在本地维护 section 排序，直接委托给 uci.move 处理。
	 * 实际上这主要用于配合 TableSection 的拖拽排序功能。
	 *
	 * @param {string}  config      - 配置名
	 * @param {string}  section_id1 - 要移动的 section ID
	 * @param {string}  section_id2 - 参考位置的 section ID
	 * @param {boolean} after       - true=移到 section_id2 之后，false=移到之前
	 */
	move(config, section_id1, section_id2, after) {
		return uci.move.apply(this, [config, section_id1, section_id2, after]);
	}
});

/**
 * @class AbstractElement
 * @memberof LuCI.form
 * @hideconstructor
 * @classdesc

 * The `AbstractElement` class serves as an abstract base for the different form
 * elements implemented by `LuCI.form`. It provides the common logic for
 * loading and rendering values, for nesting elements and for defining common
 * properties.

 * This class is private and not directly accessible by user code.
 */
/**
 * ════════════════════════════════════════════════════════════
 * AbstractElement：所有表单元素的抽象基类
 * ════════════════════════════════════════════════════════════

   【作用】
     提供 Map、Section、Option 三类元素共用的基础逻辑：
     - 标题/描述属性（title、description）的存储与访问
     - 子元素管理（children 数组、append/load/render 递归）
     - HTML 清理工具 stripTags()
     - 标题格式化工具 titleFn()（支持字符串模板和函数）

   【关键属性】
     title       {string}  元素标题（渲染为 label/h3 文字）
     description {string}  元素说明（渲染为段落文字）
     children    {Array}   子元素列表（Map→sections，Section→options）
     disable     {boolean} 若为 true，该元素在加载/渲染时被跳过

   【不直接实例化，通过 Map、Section、Value 子类间接使用】
 */
const CBIAbstractElement = baseclass.extend(/** @lends LuCI.form.AbstractElement.prototype */ {
	__init__(title, description) {
		this.title = title ?? '';
		this.description = description ?? '';
		this.children = [];
	},

	/**
	 * Add another form element as children to this element.
	 *
	 * @param {AbstractElement} obj
	 * The form element to add.
	 */
	append(obj) {
		this.children.push(obj);
	},

	/**
	 * Parse this element's form input.
	 *
	 * The `parse()` function recursively walks the form element tree and
	 * triggers input value reading and validation for each encountered element.
	 *
	 * Elements which are hidden due to unsatisfied dependencies are skipped.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once this element's value and the values of
	 * all child elements have been parsed. The returned promise is rejected
	 * if any parsed values do not meet the validation constraints of their
	 * respective elements.
	 */
	parse() {
		const args = arguments;
		this.children.forEach((child) => {
			child.parse(...args);
		});
	},

	/**
	 * Render the form element.
	 *
	 * The `render()` function recursively walks the form element tree and
	 * renders the markup for each element, returning the assembled DOM tree.
	 *
	 * @abstract
	 * @returns {Node|Promise<Node>}
	 * May return a DOM Node or a promise resolving to a DOM node containing
	 * the form element's markup, including the markup of any child elements.
	 */
	render() {
		L.error('InternalError', 'Not implemented');
	},

	/**
	   【私有】并行加载所有未禁用子元素的数据。
	 *
	 * 遍历 children 数组，对每个 disable 不为 true 的子元素调用 load(args)，
	 * 全部加载完成后返回。由 Map.load() 和 Section.load() 调用。
	 *
	 * @param {...*} args - 透传给每个子元素 load() 的参数（通常是 section_id）
	 * @returns {Promise<Array>} 所有子元素 load 结果的数组
	 */
	loadChildren(...args) /* ... */{
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < this.children.length; i++)
				if (!this.children[i].disable)
					tasks.push(this.children[i].load(...args));

		return Promise.all(tasks);
	},

	/**
	   【私有】并行渲染指定 Tab 下（或所有）未禁用子元素的 DOM。
	 *
	 * @param {string|null} tab_name
	 *   要渲染的 Tab 名称；null 表示渲染所有不属于任何 Tab 的子元素；
	 *   非 null 时只渲染 child.tab === tab_name 的子元素。
	 * @param {...*} args - 透传给每个子元素 render() 的参数（option_index, section_id, in_table）
	 * @returns {Promise<Array<Node>>} 渲染结果节点数组
	 */
	renderChildren(tab_name, ...args) {
		const tasks = [];
		let index = 0;

		if (Array.isArray(this.children))
			for (let i = 0; i < this.children.length; i++)
				if (tab_name === null || this.children[i].tab === tab_name)
					if (!this.children[i].disable)
						tasks.push(this.children[i].render(index++, ...args));

		return Promise.all(tasks);
	},

	/**
	 * Strip any HTML tags from the given input string, and decode
	 * HTML entities.
	 *
	 * @param {string} s
	 * The input string to clean.
	 *
	 * @returns {string}
	 * The cleaned input string with HTML tags removed, and HTML
	 * entities decoded.
	 */
	stripTags(s) {
		if (typeof(s) == 'string' && !s.match(/[<>\&]/))
			return s;

		const x = dom.elem(s) ? s : dom.parse(`<div>${s}</div>`);

		x.querySelectorAll('br').forEach((br) => {
			x.replaceChild(document.createTextNode('\n'), br);
		});

		return (x.textContent ?? x.innerText ?? '').replace(/([ \t]*\n)+/g, '\n');
	},

	/**
	 * Format the given named property as a title string.
	 *
	 * This function looks up the given named property and formats its value
	 * suitable for use as an element caption or description string. It also
	 * strips any HTML tags from the result.
	 *
	 * If the property value is a string, it is passed to `String.format()`
	 * along with any additional parameters passed to `titleFn()`.
	 *
	 * If the property value is a function, it is invoked with any additional
	 * `titleFn()` parameters as arguments, and the obtained return value is
	 * converted to a string.
	 *
	 * In all other cases, `null` is returned.
	 *
	 * @param {string} property
	 * The name of the element property to use.
	 *
	 * @param {...*} fmt_args
	 * Extra values to format the title string with.
	 *
	 * @returns {string|null}
	 * The formatted title string or `null` if the property did not exist or
	 * was neither a string nor a function.
	 */
	titleFn(attr, ...args) {
		let s = null;

		if (typeof(this[attr]) == 'function')
			s = this[attr](...args);
		else if (typeof(this[attr]) == 'string')
			s = args.length ? this[attr].format(...args) : this[attr];

		if (s != null)
			s = this.stripTags(String(s)).trim();

		if (s == null || s == '')
			return null;

		return s;
	}
});

/**
 * @constructor Map
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractElement

 * @classdesc

 * The `Map` class represents one complete form. A form usually maps one UCI
 * configuration file and is divided into multiple sections containing multiple
 * fields each.

 * It serves as the main entry point into the `LuCI.form` for typical view code.

 * @param {string} config
 * The UCI configuration to map. It is automatically loaded along with the
 * resulting map instance.

 * @param {string} [title]
 * The title caption of the form. A form title is usually rendered as a separate
 * headline element before the actual form contents. If omitted, the
 * corresponding headline element will not be rendered.

 * @param {string} [description]
 * The description text of the form which is usually rendered as a text
 * paragraph below the form title and before the actual form contents.
 * If omitted, the corresponding paragraph element will not be rendered.
 */
/**
 * ════════════════════════════════════════════════════════════
 * Map：完整配置表单（绑定一个 UCI 配置文件）
 * ════════════════════════════════════════════════════════════

   【作用】
     Map 是整个 form.js 框架的顶层入口，代表一个完整的配置表单。
     通常绑定一个 UCI 配置文件（如 'network'、'firewall'、'system'）。
     负责数据加载（含 ACL 权限检查）、渲染、保存和重置。

   【构造函数】
     new form.Map(config, title?, description?)

   【参数说明】
     config      {string} UCI 配置包名（必需），如 'network'、'system'
     title       {string} 表单标题（可选），渲染为 <h2>
     description {string} 表单描述（可选），渲染为说明段落

   【关键属性】
     readonly  {boolean}
       null/undefined = 自动：加载时检查 UCI ACL，无写权限则只读
       true           = 强制只读：所有控件禁用，不显示保存按钮
       false          = 强制可写：忽略 ACL 检查

     tabbed    {boolean}
       true = 多个 TypedSection 以 Tab 方式并排显示（默认 false）
       使用场景：将不同类型的配置分组到不同标签页

   【主要方法】
     section(SectionClass, ...args)     添加 section，返回 section 实例
     chain(config)                      关联额外 UCI 配置文件
     render()                           加载数据并渲染，返回 Promise<Node>
     save(cb?, silent?)                 解析→保存→重载→重绘
     reset()                            重置表单（重新渲染，丢弃未保存输入）
     lookupOption(name, sid?, cfg?)     查找 option 实例及其 section ID
     findElement(sel_or_attr, val?)     在表单 DOM 中查找第一个匹配节点
     findElements(sel_or_attr, val?)    在表单 DOM 中查找所有匹配节点

   ──────────────────────────────────────────────────────────
   【示例1：最常见的用法】

     'use strict';
     'require form';
     'require uci';

     return view.extend({
       load()   { return uci.load('system'); },
       render() {
         var m = new form.Map('system', _('系统设置'), _('配置基本系统参数'));

         var s = m.section(form.NamedSection, '@system[0]', 'system');
         s.option(form.Value, 'hostname', _('主机名'));

         return m.render();
       }
     });

   ──────────────────────────────────────────────────────────
   【示例2：关联多配置文件（chain）】

     var m = new form.Map('network', _('网络'));
     m.chain('firewall');  // 同时加载 firewall 包

     var s = m.section(form.TypedSection, 'interface');
     var o = s.option(form.Value, 'fw_zone');
     o.uciconfig = 'firewall';   // 该字段读写 firewall 配置

   ──────────────────────────────────────────────────────────
   【示例3：Tab 布局（多 section 并排为 Tab）】

     var m = new form.Map('network', _('网络配置'));
     m.tabbed = true;  // 各 section 作为独立 Tab

     m.section(form.TypedSection, 'interface', _('接口'));
     m.section(form.TypedSection, 'route',     _('路由'));
     m.section(form.TypedSection, 'rule',      _('规则'));
     // 渲染后生成"接口 | 路由 | 规则"Tab 菜单

   ──────────────────────────────────────────────────────────
   【示例4：手动保存并处理结果】

     document.getElementById('my-save-btn').onclick = function() {
       map.save(null, true)  // silent=true，不自动弹出错误框
         .then(() => ui.addNotification(null, E('p', _('已保存')), 'info'))
         .catch(err => ui.addNotification(null, E('p', err.message), 'danger'));
     };

   ──────────────────────────────────────────────────────────
   【示例5：保存前做额外数据处理（save 回调）】

     map.save(function() {
       // 此回调在 parse() 完成后、uci.save() 之前执行
       // 可以在此基于表单值设置其他 UCI 选项
       var result = map.lookupOption('proto', 'wan');
       if (result && result[0].formvalue(result[1]) === 'pppoe') {
         uci.set('network', 'wan', 'username', getUsername());
       }
     });

   ──────────────────────────────────────────────────────────
   【示例6：只读状态展示页面】

     var m = new form.Map('network', _('网络状态'));
     m.readonly = true;  // 所有字段只读，不显示保存/应用按钮

     // 配合 DummyValue 展示运行时状态
     var s = m.section(form.NamedSection, 'wan', 'interface', _('WAN 状态'));
     var o = s.option(form.DummyValue, '_up', _('连接状态'));
     o.cfgvalue = sid => uci.get('network', sid, 'up') ? _('已连接') : _('未连接');
 */
const CBIMap = CBIAbstractElement.extend(/** @lends LuCI.form.Map.prototype */ {
	__init__(config, ...args) {
		this.super('__init__', args);
		uci.load('luci');

		this.config = config;
		this.parsechain = [ config ];
		this.data = uci;
	},

	/**
	 * Toggle readonly state of the form.
	 *
	 * If set to `true`, the Map instance is marked readonly and any form
	 * option elements added to it will inherit the readonly state.
	 *
	 * If left unset, the Map will test the access permission of the primary
	 * uci configuration upon loading and mark the form readonly if no write
	 * permissions are granted.
	 *
	 * @name LuCI.form.Map.prototype#readonly
	 * @type boolean
	 */

	/**
	 * Return all DOM nodes within this Map which match the given search
	 * parameters. This function is essentially a convenience wrapper around
	 * `querySelectorAll()`.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if only one argument is specified, it is used as selector-expression
	 * as-is. When two arguments are passed, the first argument is treated
	 * as an attribute name, the second one as an attribute value to match.
	 *
	 * As an example, `map.findElements('input')` would find all `<input>`
	 * nodes while `map.findElements('type', 'text')` would find any DOM node
	 * with a `type="text"` attribute.
	 *
	 * @param {string} selector_or_attrname
	 * If invoked with only one parameter, this argument is a
	 * `querySelectorAll()` compatible selector expression. If invoked with
	 * two parameters, this argument is the attribute name to filter for.
	 *
	 * @param {string} [attrvalue]
	 * In case the function is invoked with two parameters, this argument
	 * specifies the attribute value to match.
	 *
	 * @throws {InternalError}
	 * Throws an `InternalError` if more than two function parameters are
	 * passed.
	 *
	 * @returns {NodeList}
	 * Returns a (possibly empty) DOM `NodeList` containing the found DOM nodes.
	 */
	findElements(...args) /* ... */{
		let q = null;

		if (args.length == 1)
			q = args[0];
		else if (args.length == 2)
			q = '[%s="%s"]'.format(args[0], args[1]);
		else
			L.error('InternalError', 'Expecting one or two arguments to findElements()');

		return this.root.querySelectorAll(q);
	},

	/**
	 * Return the first DOM node within this Map which matches the given search
	 * parameters. This function is essentially a convenience wrapper around
	 * `findElements()` which only returns the first found node.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if only one argument is specified, it is used as selector-expression
	 * as-is. When two arguments are passed, the first argument is treated
	 * as an attribute name, the second one as an attribute value to match.
	 *
	 * As an example, `map.findElement('input')` would find the first `<input>`
	 * node while `map.findElement('type', 'text')` would find the first DOM
	 * node with a `type="text"` attribute.
	 *
	 * @param {string} selector_or_attrname
	 * If invoked with only one parameter, this argument is a `querySelector()`
	 * compatible selector expression. If invoked with two parameters, this
	 * argument is the attribute name to filter for.
	 *
	 * @param {string} [attrvalue]
	 * In case the function is invoked with two parameters, this argument
	 * specifies the attribute value to match.
	 *
	 * @throws {InternalError}
	 * Throws an `InternalError` if more than two function parameters are
	 * passed.
	 *
	 * @returns {Node|null}
	 * Returns the first found DOM node or `null` if no element matched.
	 */
	findElement(...args) /* ... */{
		const res = this.findElements(...args);
		return res.length ? res[0] : null;
	},

	/**
	 * Tie another UCI configuration to the map.
	 *
	 * By default, a map instance will only load the UCI configuration file
	 * specified in the constructor, but sometimes access to values from
	 * further configuration files is required. This function allows for such
	 * use cases by registering further UCI configuration files which are
	 * needed by the map.
	 *
	 * @param {string} config
	 * The additional UCI configuration file to tie to the map. If the given
	 * config is in the list of required files already, it will be ignored.
	 */
	chain(config) {
		if (this.parsechain.indexOf(config) == -1)
			this.parsechain.push(config);
	},

	/**
	 * Add a configuration section to the map.
	 *
	 * LuCI forms follow the structure of the underlying UCI configurations.
	 * This means that a map, which represents a single UCI configuration, is
	 * divided into multiple sections which in turn contain an arbitrary
	 * number of options.
	 *
	 * While UCI itself only knows two kinds of sections - named and anonymous
	 * ones - the form class offers various flavors of form section elements
	 * to present configuration sections in different ways. Refer to the
	 * documentation of the different section classes for details.
	 *
	 * @param {LuCI.form.AbstractSection} sectionclass
	 * The section class to use for rendering the configuration section.
	 * Note that this value must be the class itself, not a class instance
	 * obtained from calling `new`. It must also be a class derived from
	 * `LuCI.form.AbstractSection`.
	 *
	 * @param {...string} classargs
	 * Additional arguments which are passed as-is to the constructor of the
	 * given section class. Refer to the class specific constructor
	 * documentation for details.
	 *
	 * @returns {LuCI.form.AbstractSection}
	 * Returns the instantiated section class instance.
	 */
	section(cbiClass, ...args) {
		if (!CBIAbstractSection.isSubclass(cbiClass))
			L.error('TypeError', 'Class must be a descendent of CBIAbstractSection');

		const obj = cbiClass.instantiate([this, ...args]);
		this.append(obj);
		return obj;
	},

	/**
	 * Load the configuration covered by this map.
	 *
	 * The `load()` function first loads all referenced UCI configurations,
	 * then it recursively walks the form element tree and invokes the
	 * load function of each child element.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the entire form completed loading all
	 * data. The promise may reject with an error if any configuration failed
	 * to load or if any of the child elements' load functions reject with
	 * an error.
	 */
	load() {
		const doCheckACL = (!(this instanceof CBIJSONMap) && this.readonly == null);
		const loadTasks = [ doCheckACL ? callSessionAccess('uci', this.config, 'write') : true ];
		const configs = this.parsechain ?? [ this.config ];

		loadTasks.push(...configs.map(L.bind((config, i) => {
			return i ? L.resolveDefault(this.data.load(config)) : this.data.load(config);
		}, this)));

		return Promise.all(loadTasks).then(L.bind((res) =>  {
			if (res[0] === false)
				this.readonly = true;

			return this.loadChildren();
		}, this));
	},

	/**
	 * Parse the form input values.
	 *
	 * The `parse()` function recursively walks the form element tree and
	 * triggers input value reading and validation for each child element.
	 *
	 * Elements which are hidden due to unsatisfied dependencies are skipped.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the entire form completed parsing all
	 * input values. The returned promise is rejected if any parsed values do
	 * not meet the validation constraints of their respective elements.
	 */
	parse() {
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < this.children.length; i++)
				tasks.push(this.children[i].parse());

		return Promise.all(tasks);
	},

	/**
	 * Save the form input values.
	 *
	 * This function parses the current form, saves the resulting UCI changes,
	 * reloads the UCI configuration data and redraws the form elements.
	 *
	 * @param {function} [cb]
	 * An optional callback function that is invoked after the form is parsed
	 * but before the changed UCI data is saved. This is useful to perform
	 * additional data manipulation steps before saving the changes.
	 *
	 * @param {boolean} [silent=false]
	 * If set to `true`, trigger an alert message to the user in case saving
	 * the form data fails. Otherwise fail silently.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the entire save operation is complete.
	 * The returned promise is rejected if any step of the save operation
	 * failed.
	 */
	save(cb, silent) {
		this.checkDepends();

		return this.parse()
			.then(cb)
			.then(this.data.save.bind(this.data))
			.then(this.load.bind(this))
			.catch((e) =>  {
				if (!silent) {
					ui.showModal(_('Save error'), [
						E('p', {}, [ _('An error occurred while saving the form:') ]),
						E('p', {}, [ E('em', { 'style': 'white-space:pre-wrap' }, [ e.message ]) ]),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, [ _('Dismiss') ])
						])
					]);
				}

				return Promise.reject(e);
			}).then(this.renderContents.bind(this));
	},

	/**
	 * Reset the form by re-rendering its contents. This will revert all
	 * unsaved user inputs to their initial form state.
	 *
	 * @returns {Promise<Node>}
	 * Returns a promise resolving to the top-level form DOM node once the
	 * re-rendering is complete.
	 */
	reset() {
		return this.renderContents();
	},

	/**
	 * Render the form markup.
	 *
	 * @returns {Promise<Node>}
	 * Returns a promise resolving to the top-level form DOM node once the
	 * rendering is complete.
	 */
	render() {
		return this.load().then(this.renderContents.bind(this));
	},

	/**
	   【私有】真正完成表单 DOM 渲染的核心方法。
	 *
	 * render() 和 save() 最终都调用此方法。执行流程：
	 *   1. 创建或复用 this.root（div.cbi-map）
	 *   2. 渲染所有子 section（renderChildren）
	 *   3. 按顺序装配：标题 h2 → 描述段落 → section 节点
	 *   4. 非首次渲染时添加 flash 动画效果
	 *   5. 更新依赖状态（checkDepends）
	 *   6. 初始化 Tab 组件
	 *
	 * @returns {Promise<Node>} 表单根节点（div.cbi-map）
	 */
	renderContents() {
		const mapEl = (this.root ??= E('div', {
			'id': 'cbi-%s'.format(this.config),
			'class': 'cbi-map',
			'cbi-dependency-check': L.bind(this.checkDepends, this)
		}));

		dom.bindClassInstance(mapEl, this);

		return this.renderChildren(null).then(L.bind((nodes) =>  {
			const initialRender = !mapEl.firstChild;

			dom.content(mapEl, null);

			if (this.title != null && this.title != '')
				mapEl.appendChild(E('h2', { 'name': 'content' }, this.title));

			if (this.description != null && this.description != '')
				mapEl.appendChild(E('div', { 'class': 'cbi-map-descr' }, this.description));

			if (this.tabbed)
				dom.append(mapEl, E('div', { 'class': 'cbi-map-tabbed' }, nodes));
			else
				dom.append(mapEl, nodes);

			if (!initialRender) {
				mapEl.classList.remove('flash');

				window.setTimeout(() =>  {
					mapEl.classList.add('flash');
				}, 1);
			}

			this.checkDepends();

			const tabGroups = mapEl.querySelectorAll('.cbi-map-tabbed, .cbi-section-node-tabbed');

			for (let i = 0; i < tabGroups.length; i++)
				ui.tabs.initTabGroup(tabGroups[i].childNodes);

			return mapEl;
		}, this));
	},

	/**
	 * Find a form option element instance.
	 *
	 * @param {string} name
	 * The name or the full ID of the option element to look up.
	 *
	 * @param {string} [section_id]
	 * The ID of the UCI section that contains the option to look up. May be
	 * omitted if a full ID is passed as the first argument.
	 *
	 * @param {string} [config_name]
	 * The name of the UCI configuration the option instance belongs to.
	 * Defaults to the main UCI configuration of the map if omitted.
	 *
	 * @returns {Array<LuCI.form.AbstractValue,string>|null}
	 * Returns a two-element array containing the form option instance as
	 * the first item and the corresponding UCI section ID as the second item.
	 * Returns `null` if the option could not be found.
	 */
	lookupOption(name, section_id, config_name) {
		let id;
		let elem;
		let sid;
		let inst;

		if (name.indexOf('.') > -1)
			id = 'cbid.%s'.format(name);
		else
			id = 'cbid.%s.%s.%s'.format(config_name ?? this.config, section_id, name);

		elem = this.findElement('data-field', id);
		sid  = elem ? id.split(/\./)[2] : null;
		inst = elem ? dom.findClassInstance(elem) : null;

		return (inst instanceof CBIAbstractValue) ? [ inst, sid ] : null;
	},

	/**
	   【私有】递归检查并更新所有 option 的依赖显示状态。
	 *
	 * 遍历所有子 section，调用各 section 的 checkDepends()，
	 * 任何依赖状态发生变化时递归重新检查（最多10次，避免死循环）。
	 * 最后调用 ui.tabs.updateTabs() 更新 Tab 的显示状态（隐藏全空的 Tab）。
	 *
	 * @param {Event}  [ev] - 触发依赖检查的 DOM 事件（可为 undefined）
	 * @param {number} [n]  - 当前递归深度（内部使用，调用时无需传入）
	 */
	checkDepends(ev, n) {
		let changed = false;

		for (let i = 0, s = this.children[0]; (s = this.children[i]) != null; i++)
			if (s.checkDepends(ev, n))
				changed = true;

		if (changed && (n ?? 0) < 10)
			this.checkDepends(ev, (n ?? 10) + 1);

		ui.tabs.updateTabs(ev, this.root);
	},

	/**
	   【私有】判断给定的依赖条件组是否满足（由 AbstractValue.checkDepends 调用）。
	 *
	 * 依赖条件的判断规则：
	 *   - depends 数组中每个对象是一个"条件组"（AND 关系）
	 *   - 多个条件组之间是 OR 关系（任一满足即为 true）
	 *   - 对象中特殊 key：
	 *     '!reverse'：本组条件取反
	 *     '!contains'：使用包含匹配（isContained）而非精确匹配（isEqual）
	 *     '!default'：所有组都不满足时的默认返回值（true=默认显示）
	 *
	 * @param {Array}  depends      - 依赖条件数组（来自 option.deps）
	 * @param {string} config_name  - UCI 配置名（用于 lookupOption 定位字段）
	 * @param {string} section_id   - UCI section ID
	 * @returns {boolean} 依赖条件满足时返回 true，否则返回 false
	 */
	isDependencySatisfied(depends, config_name, section_id) {
		let def = false;

		if (!Array.isArray(depends) || !depends.length)
			return true;

		for (let i = 0; i < depends.length; i++) {
			let istat = true;
			const reverse = depends[i]['!reverse'];
			const contains = depends[i]['!contains'];

			for (const dep in depends[i]) {
				if (dep == '!reverse' || dep == '!contains') {
					continue;
				}
				else if (dep == '!default') {
					def = true;
					istat = false;
				}
				else {
					const res = this.lookupOption(dep, section_id, config_name);
					const val = (res && res[0].isActive(res[1])) ? res[0].formvalue(res[1]) : null;

					const equal = contains
						? isContained(val, depends[i][dep])
						: isEqual(val, depends[i][dep]);

					istat = (istat && equal);
				}
			}

			if (istat ^ reverse)
				return true;
		}

		return def;
	}
});

/**
 * @constructor JSONMap
 * @memberof LuCI.form
 * @augments LuCI.form.Map

 * @classdesc

 * A `JSONMap` class functions similar to [LuCI.form.Map]{@link LuCI.form.Map}
 * but uses a multidimensional JavaScript object instead of UCI configuration
 * as a data source.

 * @param {Object<string, Object<string, *>|Array<Object<string, *>>>} data
 * The JavaScript object to use as a data source. Internally, the object is
 * converted into an UCI-like format. Its top-level keys are treated like UCI
 * section types while the object or array-of-object values are treated as
 * section contents.

 * @param {string} [title]
 * The title caption of the form. A form title is usually rendered as a separate
 * headline element before the actual form contents. If omitted, the
 * corresponding headline element will not be rendered.

 * @param {string} [description]
 * The description text of the form which is usually rendered as a text
 * paragraph below the form title and before the actual form contents.
 * If omitted, the corresponding paragraph element will not be rendered.
 */
/**
 * ════════════════════════════════════════════════════════════
 * JSONMap：基于 JS 对象数据的表单（不读写 UCI 文件）
 * ════════════════════════════════════════════════════════════

   【作用】
     JSONMap 与 Map 用法几乎完全相同，区别在于数据来源：
     - Map：从路由器的 UCI 配置文件读取，save() 写入 UCI
     - JSONMap：从构造时传入的 JS 对象读取，save() 只更新内存对象

   【构造函数】
     new form.JSONMap(data, title?, description?)

   【参数】
     data  {Object} JS 对象格式的配置数据（格式详见 CBIJSONConfig）

   【适用场景】
     1. 展示 RPC 返回的状态/统计数据（不需要写入 UCI）
     2. 前端临时配置（数据生命周期只在页面内）
     3. 将 JSON API 响应映射到表单界面
     4. 测试/预览目的的表单（不影响实际配置）

   ──────────────────────────────────────────────────────────
   【示例1：展示 RPC 状态数据（只读）】

     var callGetStatus = rpc.declare({
       object: 'myservice', method: 'status', expect: { '': {} }
     });

     render() {
       return callGetStatus().then(status => {
         // status = { info: [{ '.name': 'main', version: '2.0', uptime: 7200 }] }
         var m = new form.JSONMap(status, _('服务状态'));
         m.readonly = true;

         var s = m.section(form.TypedSection, 'info', _('基本信息'));
         s.option(form.DummyValue, 'version', _('版本'));
         s.option(form.DummyValue, 'uptime',  _('运行时间（秒）'));

         return m.render();
       });
     }

   ──────────────────────────────────────────────────────────
   【示例2：可编辑的前端表单（手动处理保存逻辑）】

     var localData = {
       settings: { theme: 'dark', rows_per_page: '20' }
     };

     var m = new form.JSONMap(localData, _('界面设置'));
     var s = m.section(form.NamedSection, 'settings', 'settings');

     var o = s.option(form.ListValue, 'theme', _('主题'));
     o.value('dark',  _('深色'));
     o.value('light', _('浅色'));

     o = s.option(form.Value, 'rows_per_page', _('每页行数'));
     o.datatype = 'range(5,100)';

     // 自定义保存逻辑：将更新后的数据发送到后端 API
     // save() 会更新 localData 对象，然后在回调中处理
     m.save(function() {
       // 此时 localData 已被更新为表单中的最新值
       return callSaveSettings(localData.settings);
     });

   ──────────────────────────────────────────────────────────
   【示例3：多个 section 类型（混合数组和对象格式）】

     var data = {
       peer: [
         { '.name': 'peer1', endpoint: '1.2.3.4:51820', pubkey: 'abc...' },
         { '.name': 'peer2', endpoint: '5.6.7.8:51820', pubkey: 'def...' }
       ],
       global: { listen_port: '51820', mtu: '1420' }
     };

     var m = new form.JSONMap(data, _('WireGuard 配置'));

     // 全局配置（对象格式的 section）
     var sg = m.section(form.NamedSection, 'global', 'global', _('全局设置'));
     sg.option(form.Value, 'listen_port', _('监听端口'));
     sg.option(form.Value, 'mtu',         _('MTU'));

     // 对端列表（数组格式的 section）
     var sp = m.section(form.TableSection, 'peer', _('对端列表'));
     sp.addremove = true;
     sp.option(form.Value, 'endpoint', _('端点'));
     sp.option(form.Value, 'pubkey',   _('公钥'));
 */
const CBIJSONMap = CBIMap.extend(/** @lends LuCI.form.JSONMap.prototype */ {
	/**
	 * 构造 JSONMap。
	 *
	 * @param {Object} data  - JS 对象格式的配置数据（格式见 CBIJSONConfig 注释）
	 * @param {string} [title]       - 表单标题
	 * @param {string} [description] - 表单描述
	 *
	   【与 Map 的区别】
	 *   Map：   this.data = uci（LuCI.uci 全局实例）
	 *   JSONMap：this.data = new CBIJSONConfig(data)（内存对象）
	 *   因此 JSONMap 的 save() 只更新内存，不写入路由器 UCI 文件。
	 */
	__init__(data, ...args) {
		this.super('__init__', [ 'json', ...args ]);

		this.config = 'json';
		this.parsechain = [ 'json' ];
		this.data = new CBIJSONConfig(data);
	}
});

/**
 * @class AbstractSection
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractElement
 * @hideconstructor
 * @classdesc

 * The `AbstractSection` class serves as an abstract base for the different form
 * section styles implemented by `LuCI.form`. It provides the common logic for
 * enumerating underlying configuration section instances, for registering
 * form options and for handling tabs in order to segment child options.

 * This class is private and not directly accessible by user code.
 */
/**
 * ════════════════════════════════════════════════════════════
 * AbstractSection：Section 控件的抽象基类
 * ════════════════════════════════════════════════════════════

   【作用】
     所有 Section 类（TypedSection、NamedSection、TableSection、
     GridSection）的公共基类。提供：
     - option()/taboption() 添加 option 控件
     - tab() 将 option 分组到 Tab 标签页
     - 数据查询接口（cfgvalue/formvalue/getUIElement/getOption）
     - 依赖状态更新（checkDepends）

   【关键属性】
     addremove  {boolean}  是否显示添加/删除按钮（默认 false）
     anonymous  {boolean}  添加时创建匿名 section（默认 false）
     dynamic    {boolean}  是否为动态 section（默认 false）
     optional   {boolean}  section 是否可选（默认 true）
     parentoption {AbstractValue} 若此 section 嵌套在 option 中，
                  指向父 option 实例（用于 SectionValue）

   【关键方法】
     option(ValueClass, optname, title?, desc?)
       添加一个 option 控件，返回控件实例

     taboption(tabName, ValueClass, optname, title?, desc?)
       添加一个 option 到指定 tab，返回控件实例

     tab(name, title, desc?)
       定义一个 tab 分组（必须在 taboption 之前调用）

     cfgvalue(section_id, option?)
       读取 UCI 配置值（1参数=全部选项字典，2参数=指定选项值）

     formvalue(section_id, option?)
       读取当前表单输入值（渲染后才有效）

     getUIElement(section_id, option?)
       获取底层 UI 控件实例（用于高级操作）

     getOption(option?)
       获取 option 实例对象（0参数=全部字典，1参数=指定实例）

   ──────────────────────────────────────────────────────────
   【option() 与 taboption() 的选择】

     // 不使用 Tab：直接 option()
     s.option(form.Value, 'hostname', _('主机名'));

     // 使用 Tab：先 tab() 定义分组，再 taboption() 添加
     s.tab('basic',    _('基本设置'));
     s.tab('advanced', _('高级设置'), _('这些选项适合高级用户'));

     s.taboption('basic',    form.Value,    'hostname', _('主机名'));
     s.taboption('basic',    form.ListValue,'timezone', _('时区'));
     s.taboption('advanced', form.Value,    'ntp',      _('NTP 服务器'));

     // 注意：定义了 tab 后，用 option() 添加的控件不会被渲染！
     // 所有控件都必须用 taboption() 并指定所属 tab。

   ──────────────────────────────────────────────────────────
   【cfgvalue/formvalue/getUIElement 的区别】

     cfgvalue(section_id, 'proto')
       → 从 UCI 缓存读取原始配置值（字符串或数组）
       → 不依赖 DOM，适合在 save 回调中读取已保存的值

     formvalue(section_id, 'proto')
       → 读取当前表单控件的输入值（用户操作后的实时值）
       → 需要表单已渲染（DOM 存在）

     getUIElement(section_id, 'proto')
       → 返回底层 LuCI.ui 控件实例（如 ui.Select、ui.Textfield）
       → 可以调用控件的 setValue()、getValue() 等方法
       → 用于高级场景：需要直接操作 UI 控件状态

   ──────────────────────────────────────────────────────────
   【getOption 用法示例】

     // 获取 section 中特定 option 的实例（用于动态修改属性）
     var protoOpt = s.getOption('proto');
     protoOpt.depends('enabled', '1');  // 动态添加依赖

     // 获取所有 option 的字典
     var allOpts = s.getOption();
     Object.keys(allOpts).forEach(name => {
       console.log(name, allOpts[name].datatype);
     });
 */
const CBIAbstractSection = CBIAbstractElement.extend(/** @lends LuCI.form.AbstractSection.prototype */ {
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  constructor / __init__(map, sectionType, ...args)              │
	 * │  AbstractSection 构造函数                                        │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   初始化 AbstractSection 实例，设置与父 Map、UCI 配置、section 类型
	 *   相关的基础属性。该方法由框架通过 .extend()/.instantiate() 机制调用，
	 *   不应直接调用（通过 m.section() 创建 section 实例）。
	 *
	 * 【参数】
	 *   @param {LuCI.form.Map}  map          父 Map 实例（表单根节点）
	 *   @param {string}         sectionType  对应的 UCI section 类型（如 'interface'）
	 *   @param {...*}            args         透传给父类 AbstractElement 的额外参数
	 *                                         （通常为 title、description）
	 *
	 * 【初始化的属性】
	 *   this.sectiontype  {string}   UCI section 类型名（对应 config 文件中的 config xxx）
	 *   this.map          {Map}      父 Map 实例引用
	 *   this.config       {string}   UCI 配置文件名（继承自 map.config）
	 *   this.optional     {boolean}  section 是否可选，默认 true
	 *   this.addremove    {boolean}  是否显示添加/删除按钮，默认 false
	 *   this.dynamic      {boolean}  是否为动态 section，默认 false
	 *
	 * 【使用示例】
	 *
	 *   // 标准创建方式（通过 m.section()，框架自动调用构造函数）
	 *   m = new form.Map('network', _('网络配置'));
	 *
	 *   // TypedSection：枚举所有 type='interface' 的 section
	 *   s = m.section(form.TypedSection, 'interface', _('接口'));
	 *   s.addremove = true;   // 覆盖默认值，允许增删
	 *   s.anonymous = true;   // 创建时生成匿名 section 名
	 *
	 *   // NamedSection：直接引用名为 'lan' 的 section
	 *   s = m.section(form.NamedSection, 'lan', 'interface', _('LAN 接口'));
	 *   s.addremove = false;
	 *
	 *   // GridSection：以网格形式展示（支持 Tab）
	 *   s = m.section(form.GridSection, 'rule', _('防火墙规则'));
	 *   s.addremove = true;
	 *   s.sortable  = true;
	 *
	 * 【注意】
	 *   - 不要直接 new CBIAbstractSection()，始终通过 m.section() 创建
	 *   - sectionType 区分大小写，必须与 UCI 配置文件中的 type 完全一致
	 *   - map.config 会被继承为 this.config，但可通过设置 s.uciconfig 覆盖
	 */
	__init__(map, sectionType, ...args) {
		this.super('__init__', args);

		this.sectiontype = sectionType;
		this.map = map;
		this.config = map.config;

		this.optional = true;
		this.addremove = false;
		this.dynamic = false;
	},

	/**
	 * Access the parent option container instance.
	 *
	 * In case this section is nested within an option element container,
	 * this property will hold a reference to the parent option instance.
	 *
	 * If this section is not nested, the property is `null`.
	 *
	 * @name LuCI.form.AbstractSection.prototype#parentoption
	 * @type LuCI.form.AbstractValue
	 * @readonly
	 */

	/**
	 * Enumerate the UCI section IDs covered by this form section element.
	 *
	 * @abstract
	 * @throws {InternalError}
	 * Throws an `InternalError` exception if the function is not implemented.
	 *
	 * @returns {string[]}
	 * Returns an array of UCI section IDs covered by this form element.
	 * The sections will be rendered in the same order as the returned array.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  cfgsections()                                                  │
	 * │  枚举本 section 元素所覆盖的所有 UCI section ID 列表             │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   返回一个字符串数组，列出本 section 元素负责渲染的所有 UCI section ID。
	 *   框架在渲染、load()、parse() 时都以这个数组作为迭代基础：
	 *   返回几个 ID 就渲染几行（或几个表格行）。
	 *
	 * 【子类实现】
	 *   - TypedSection：查询 UCI 中所有 type == this.sectiontype 的 section
	 *   - NamedSection：直接返回构造时传入的固定 section 名称数组
	 *   - 抽象基类（本处）：抛出 InternalError，强制子类覆盖
	 *
	 * 【返回值】
	 *   {string[]}  UCI section ID 数组，渲染顺序与数组顺序一致
	 *
	 * 【使用示例】
	 *
	 *   // 读取当前 section 枚举的所有 section ID（通常在扩展或调试时使用）
	 *   const ids = s.cfgsections();
	 *   console.log('当前 section 数量：', ids.length);
	 *   // 输出示例：['cfg0192bc', 'cfg0394de', 'cfg05a1f2']
	 *
	 *   // 自定义 TypedSection 子类，覆盖 cfgsections 来过滤/排序
	 *   const MySection = form.TypedSection.extend({
	 *     cfgsections() {
	 *       // 调用父类方法获取原始列表，再按名称排序
	 *       return this.super('cfgsections', [])
	 *         .sort((a, b) => uci.get('network', a, 'ifname')
	 *                           ?.localeCompare(uci.get('network', b, 'ifname')));
	 *     }
	 *   });
	 *
	 *   // 遍历所有 section ID，读取某个 option 的配置值
	 *   s.cfgsections().forEach(sid => {
	 *     console.log(sid, '->', uci.get('network', sid, 'proto'));
	 *   });
	 *
	 * 【注意】
	 *   不应在普通视图代码中直接覆盖 cfgsections()。
	 *   如需过滤特定 section，应覆盖 filter() 方法（更安全）。
	 */
	cfgsections() {
		L.error('InternalError', 'Not implemented');
	},

	/**
	 * Filter UCI section IDs to render.
	 *
	 * The filter function is invoked for each UCI section ID of a given type
	 * and controls whether the given UCI section is rendered or ignored by
	 * the form section element.
	 *
	 * The default implementation always returns `true`. User code or
	 * classes extending `AbstractSection` may override this function with
	 * custom implementations.
	 *
	 * @abstract
	 * @param {string} section_id
	 * The UCI section ID to test.
	 *
	 * @returns {boolean}
	 * Returns `true` when the given UCI section ID should be handled and
	 * `false` when it should be ignored.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  filter(section_id)                                             │
	 * │  过滤要渲染的 UCI section ID（决定哪些行显示、哪些跳过）         │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   由 cfgsections() 枚举出的每个 UCI section ID 都会经过 filter() 检验。
	 *   返回 false 的 section 不会被渲染，也不参与 load/parse 流程。
	 *
	 *   默认实现直接返回 true（全部通过），子类可覆盖以实现自定义过滤逻辑。
	 *
	 * 【参数】
	 *   @param {string} section_id  待检查的 UCI section ID
	 *
	 * 【返回值】
	 *   {boolean}  true = 渲染此 section；false = 跳过此 section
	 *
	 * 【使用示例】
	 *
	 *   // 示例1：只显示 proto == 'static' 的接口
	 *   s = m.section(form.TypedSection, 'interface', _('静态接口'));
	 *   s.filter = function(section_id) {
	 *     return uci.get('network', section_id, 'proto') === 'static';
	 *   };
	 *
	 *   // 示例2：隐藏名称以 'wg' 开头的 section（WireGuard 接口）
	 *   s.filter = function(section_id) {
	 *     return !section_id.startsWith('wg');
	 *   };
	 *
	 *   // 示例3：只显示 disabled != '1' 的无线 section
	 *   s.filter = function(section_id) {
	 *     return uci.get('wireless', section_id, 'disabled') !== '1';
	 *   };
	 *
	 *   // 示例4：用子类方式覆盖，结合父类逻辑
	 *   const MySection = form.TypedSection.extend({
	 *     filter(section_id) {
	 *       // 先调用父类过滤，再追加自定义条件
	 *       if (!this.super('filter', section_id)) return false;
	 *       return uci.get('network', section_id, 'ifname') != null;
	 *     }
	 *   });
	 *
	 * 【注意】
	 *   - filter() 是纯同步函数，不能返回 Promise
	 *   - filter() 在每次渲染前调用，不影响已写入 UCI 的数据
	 *   - 被过滤掉的 section 不会被 parse()，其修改不会保存到 UCI
	 */
	filter(section_id) {
		return true;
	},

	/**
	 * Load the configuration covered by this section.
	 *
	 * The `load()` function recursively walks the section element tree and
	 * invokes the load function of each child option element.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the values of all child elements have
	 * been loaded. The promise may reject with an error if any of the child
	 * elements' load functions rejected with an error.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  load()                                                         │
	 * │  加载本 section 覆盖的所有配置值到各 option 子控件              │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   递归遍历本 section 的所有子 option 元素，调用每个 option 的
	 *   load(section_id) 方法，将 UCI 配置值缓存到控件内部（cfgvalue 缓存），
	 *   为后续渲染和 formvalue 读取做准备。
	 *
	 *   通常由 Map.load() 自动调用，不需要手动触发。
	 *
	 * 【返回值】
	 *   {Promise<void>}  所有子 option 加载完成后 resolve；
	 *                    任意子元素 load 失败则 reject
	 *
	 * 【内部流程】
	 *   1. 调用 cfgsections() 获取所有 section ID 列表
	 *   2. 对每个 section ID，调用 loadChildren(section_id)
	 *      → loadChildren 并行调用每个 child option 的 load()
	 *   3. 将返回的值数组逐一写入 this.children[i].cfgvalue(section_id, value)
	 *   4. 所有 Promise 通过 Promise.all() 并行等待
	 *
	 * 【使用示例】
	 *
	 *   // 通常不需要手动调用，由 Map.render() 自动管理
	 *   // 仅在需要强制重新加载某个 section 时使用：
	 *   s.load().then(() => {
	 *     console.log('section 配置已重新加载');
	 *     // 之后可调用 s.cfgvalue(sid, 'option') 读取最新值
	 *   });
	 *
	 *   // 结合动态配置刷新场景：
	 *   uci.load('network').then(() => s.load()).then(() => {
	 *     const proto = s.cfgvalue('lan', 'proto');
	 *     console.log('LAN 协议：', proto);
	 *   });
	 *
	 * 【注意】
	 *   - load() 只填充 cfgvalue 缓存，不操作 DOM，不影响表单控件显示值
	 *   - 渲染后若需要反映最新 UCI 值到界面，需调用 Map.reset() 或
	 *     重新渲染整个 Map
	 */
	load() {
		const section_ids = this.cfgsections();
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < section_ids.length; i++)
				tasks.push(this.loadChildren(section_ids[i])
					.then(Function.prototype.bind.call((section_id, set_values) =>  {
						for (let i = 0; i < set_values.length; i++)
							this.children[i].cfgvalue(section_id, set_values[i]);
					}, this, section_ids[i])));

		return Promise.all(tasks);
	},

	/**
	 * Parse this sections form input.
	 *
	 * The `parse()` function recursively walks the section element tree and
	 * triggers input value reading and validation for each encountered child
	 * option element.
	 *
	 * Options which are hidden due to unsatisfied dependencies are skipped.
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the values of all child elements have
	 * been parsed. The returned promise is rejected if any parsed values do
	 * not meet the validation constraints of their respective elements.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  parse()                                                        │
	 * │  读取并验证本 section 所有 option 的表单输入值，写入 UCI 缓存    │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   递归遍历本 section 的所有子 option，调用每个 option 的
	 *   parse(section_id) 方法，完成以下工作：
	 *     1. 从 DOM 控件读取用户输入的 formvalue
	 *     2. 对值进行验证（datatype、validate 回调）
	 *     3. 若验证通过，将值写入 UCI 内存缓存（uci.set）
	 *     4. 若 formvalue 与 cfgvalue 相同，则不重复写入
	 *     5. 依赖不满足（被隐藏）的 option 自动跳过
	 *
	 *   通常由 Map.save() 自动调用，不需要手动触发。
	 *
	 * 【返回值】
	 *   {Promise<void>}  所有验证通过且写入成功后 resolve；
	 *                    任意 option 验证失败则 reject（并在界面标红显示错误）
	 *
	 * 【使用示例】
	 *
	 *   // 通常不需要手动调用，由 Map.save() 自动管理
	 *   // 仅在需要自定义保存流程时使用：
	 *   s.parse().then(() => {
	 *     // parse 完成后 UCI 缓存已更新，可手动提交
	 *     return uci.save();
	 *   }).then(() => {
	 *     return uci.apply();
	 *   }).catch(err => {
	 *     console.error('验证失败或保存出错：', err);
	 *   });
	 *
	 *   // 部分保存场景：只 parse 某个 section 而非整个 Map
	 *   document.querySelector('#my-save-btn').addEventListener('click', () => {
	 *     s.parse()
	 *       .then(() => uci.save())
	 *       .then(() => ui.addNotification(null, E('p', _('已保存')), 'info'));
	 *   });
	 *
	 * 【注意】
	 *   - parse() 只操作 UCI 内存缓存，不自动调用 uci.save() 或 uci.apply()
	 *   - 被 filter() 过滤掉的 section 不参与 parse
	 *   - 依赖条件不满足（隐藏）的 option 值不会被写入 UCI
	 */
	parse() {
		const section_ids = this.cfgsections();
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < section_ids.length; i++)
				for (let j = 0; j < this.children.length; j++)
					tasks.push(this.children[j].parse(section_ids[i]));

		return Promise.all(tasks);
	},

	/**
	 * Add an option tab to the section.
	 *
	 * The child option elements of a section may be divided into multiple
	 * tabs to provide a better overview to the user.
	 *
	 * Before options can be moved into a tab pane, the corresponding tab
	 * has to be defined first, which is done by calling this function.
	 *
	 * Note that once tabs are defined, user code must use the `taboption()`
	 * method to add options to specific tabs. Option elements added by
	 * `option()` will not be assigned to any tab and not be rendered in this
	 * case.
	 *
	 * @param {string} name
	 * The name of the tab to register. It may be freely chosen and just serves
	 * as an identifier to differentiate tabs.
	 *
	 * @param {string} title
	 * The human readable caption of the tab.
	 *
	 * @param {string} [description]
	 * An additional description text for the corresponding tab pane. It is
	 * displayed as a text paragraph below the tab but before the tab pane
	 * contents. If omitted, no description will be rendered.
	 *
	 * @throws {Error}
	 * Throws an exception if a tab with the same `name` already exists.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  tab(name, title, description?)                                 │
	 * │  在 section 中定义一个 Tab 标签分组                              │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   将 section 中的 option 分组到多个 Tab 标签页，提升配置界面的可读性。
	 *   调用 tab() 注册分组后，必须使用 taboption() 而非 option() 添加控件，
	 *   否则用 option() 添加的控件将不会被渲染。
	 *
	 * 【参数】
	 *   @param {string}  name         Tab 的内部标识符（唯一，用于 taboption 引用）
	 *   @param {string}  title        Tab 标签栏显示的标题文字
	 *   @param {string}  [description] Tab 内容区顶部显示的说明段落（可选）
	 *
	 * 【异常】
	 *   - 同名 tab 重复注册时抛出 'Tab already declared'
	 *
	 * 【使用示例】
	 *
	 *   // 基础用法：2个 Tab
	 *   s.tab('general',  _('常规设置'));
	 *   s.tab('advanced', _('高级设置'));
	 *
	 *   s.taboption('general',  form.Value,     'hostname', _('主机名'));
	 *   s.taboption('general',  form.ListValue,  'proto',   _('协议'));
	 *   s.taboption('advanced', form.Value,      'mtu',     _('MTU'));
	 *
	 *   // 带描述文字的 Tab（会在 tab 内容区上方显示一段说明）
	 *   s.tab('firewall', _('防火墙'), _('以下设置仅在启用防火墙时生效。'));
	 *   s.taboption('firewall', form.Flag, 'fw_enable', _('启用防火墙'));
	 *
	 *   // 3个 Tab 的完整示例
	 *   s.tab('basic',    _('基本'));
	 *   s.tab('wireless', _('无线'));
	 *   s.tab('ipv6',     _('IPv6'), _('IPv6 相关配置，留空则禁用。'));
	 *
	 *   s.taboption('basic',    form.Value,    'ssid',     _('SSID'));
	 *   s.taboption('wireless', form.ListValue,'htmode',   _('HT 模式'));
	 *   s.taboption('ipv6',     form.Value,    'ip6addr',  _('IPv6 地址'));
	 *
	 * 【注意】
	 *   - tab() 必须在 taboption() 之前调用，否则 taboption 会抛出 ReferenceError
	 *   - 不支持在 TableSection 上使用 tab()（会抛出异常），
	 *     需要使用 GridSection 代替
	 *   - Tab 的显示顺序与 tab() 调用顺序一致
	 */
	tab(name, title, description) {
		if (this.tabs && this.tabs[name])
			throw 'Tab already declared';

		const entry = {
			name,
			title,
			description,
			children: []
		};

		this.tabs ??= [];
		this.tabs.push(entry);
		this.tabs[name] = entry;

		this.tab_names ??= [];
		this.tab_names.push(name);
	},

	/**
	 * Add a configuration option widget to the section.
	 *
	 * Note that [taboption()]{@link LuCI.form.AbstractSection#taboption}
	 * should be used instead if this form section element uses tabs.
	 *
	 * @param {LuCI.form.AbstractValue} optionclass
	 * The option class to use for rendering the configuration option. Note
	 * that this value must be the class itself, not a class instance obtained
	 * from calling `new`. It must also be a class derived from
	 * [LuCI.form.AbstractSection]{@link LuCI.form.AbstractSection}.
	 *
	 * @param {...*} classargs
	 * Additional arguments which are passed as-is to the constructor of the
	 * given option class. Refer to the class specific constructor
	 * documentation for details.
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception in case the passed class value is not a
	 * descendant of `AbstractValue`.
	 *
	 * @returns {LuCI.form.AbstractValue}
	 * Returns the instantiated option class instance.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  option(cbiClass, optname, title?, description?)                │
	 * │  向 section 添加一个配置 option 控件（不分 Tab）                 │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   实例化指定的 option 控件类，将其注册到本 section 的 children 列表，
	 *   并返回实例以供链式属性设置。
	 *
	 *   若 section 已定义了 Tab（调用过 tab()），应改用 taboption()；
	 *   此时用 option() 添加的控件不会被渲染。
	 *
	 * 【参数】
	 *   @param {class}   cbiClass     控件类本身（非实例），必须继承自 AbstractValue
	 *   @param {string}  optname      对应的 UCI option 名称
	 *   @param {string}  [title]      控件左侧显示的标签文字
	 *   @param {string}  [description] 控件下方显示的帮助说明文字
	 *
	 * 【返回值】
	 *   {AbstractValue}  返回已注册的 option 实例，可继续设置属性
	 *
	 * 【使用示例】
	 *
	 *   // 文本输入框
	 *   o = s.option(form.Value, 'hostname', _('主机名'), _('设备在网络中的名称'));
	 *   o.datatype = 'hostname';
	 *   o.placeholder = 'OpenWrt';
	 *
	 *   // 下拉选择框
	 *   o = s.option(form.ListValue, 'proto', _('协议'));
	 *   o.value('dhcp',   _('DHCP 客户端'));
	 *   o.value('static', _('静态地址'));
	 *   o.value('pppoe',  _('PPPoE'));
	 *
	 *   // 布尔开关
	 *   o = s.option(form.Flag, 'disabled', _('禁用接口'));
	 *   o.default = o.disabled = '0';
	 *
	 *   // 只读展示值（DummyValue）
	 *   o = s.option(form.DummyValue, 'macaddr', _('MAC 地址'));
	 *   o.rawhtml = true;
	 *
	 *   // 带依赖的 option（仅 proto=static 时显示 IP 地址输入框）
	 *   o = s.option(form.Value, 'ipaddr', _('IP 地址'));
	 *   o.datatype = 'cidr4';
	 *   o.depends('proto', 'static');
	 *
	 *   // 多行文本域
	 *   o = s.option(form.TextValue, 'description', _('描述'));
	 *   o.rows = 5;
	 *
	 * 【注意】
	 *   - 第一个参数传类本身，不能用 new（框架内部会实例化）
	 *   - section 定义了 tab() 后，此方法添加的控件不会被渲染
	 *   - 返回的实例在 m.render() 前设置属性，render 后设置无效
	 */
	option(cbiClass, ...args) {
		if (!CBIAbstractValue.isSubclass(cbiClass))
			throw L.error('TypeError', 'Class must be a descendant of CBIAbstractValue');

		const obj = cbiClass.instantiate([ this.map, this, ...args ]);
		this.append(obj);
		return obj;
	},

	/**
	 * Add a configuration option widget to a tab of the section.
	 *
	 * @param {string} tabName
	 * The name of the section tab to add the option element to.
	 *
	 * @param {LuCI.form.AbstractValue} optionclass
	 * The option class to use for rendering the configuration option. Note
	 * that this value must be the class itself, not a class instance obtained
	 * from calling `new`. It must also be a class derived from
	 * [LuCI.form.AbstractSection]{@link LuCI.form.AbstractSection}.
	 *
	 * @param {...*} classargs
	 * Additional arguments which are passed as-is to the constructor of the
	 * given option class. Refer to the class specific constructor
	 * documentation for details.
	 *
	 * @throws {ReferenceError}
	 * Throws a `ReferenceError` exception when the given tab name does not
	 * exist.
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception in case the passed class value is not a
	 * descendant of `AbstractValue`.
	 *
	 * @returns {LuCI.form.AbstractValue}
	 * Returns the instantiated option class instance.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  taboption(tabName, cbiClass, optname, title?, description?)    │
	 * │  向指定 Tab 中添加一个配置 option 控件                           │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   与 option() 功能相同，区别在于会将控件归属到指定的 Tab 分组下。
	 *   内部调用 option() 创建实例后，设置 obj.tab = tabName 并将实例
	 *   推入 this.tabs[tabName].children 数组。
	 *
	 *   必须先通过 tab() 注册对应的 Tab，否则抛出 ReferenceError。
	 *
	 * 【参数】
	 *   @param {string}  tabName      目标 Tab 的名称（必须已通过 tab() 注册）
	 *   @param {class}   cbiClass     控件类本身（非实例），继承自 AbstractValue
	 *   @param {string}  optname      对应的 UCI option 名称
	 *   @param {string}  [title]      控件标签文字
	 *   @param {string}  [description] 控件帮助说明文字
	 *
	 * 【异常】
	 *   - tabName 未注册：ReferenceError 'Associated tab not declared'
	 *   - cbiClass 非 AbstractValue 子类：TypeError
	 *
	 * 【返回值】
	 *   {AbstractValue}  返回已注册的 option 实例
	 *
	 * 【使用示例】
	 *
	 *   // 标准用法：先定义 Tab，再用 taboption 添加控件
	 *   s.tab('general',  _('常规'));
	 *   s.tab('advanced', _('高级'));
	 *   s.tab('physical', _('物理接口'));
	 *
	 *   // 常规 Tab
	 *   o = s.taboption('general', form.Value, 'ipaddr', _('IP 地址'));
	 *   o.datatype = 'cidr4';
	 *   o.depends('proto', 'static');
	 *
	 *   o = s.taboption('general', form.ListValue, 'proto', _('协议'));
	 *   o.value('dhcp',   _('DHCP'));
	 *   o.value('static', _('静态'));
	 *
	 *   // 高级 Tab
	 *   o = s.taboption('advanced', form.Value, 'mtu', _('MTU'));
	 *   o.datatype = 'range(576, 9200)';
	 *   o.placeholder = '1500';
	 *
	 *   o = s.taboption('advanced', form.Flag, 'delegate', _('委托前缀'));
	 *   o.default = '1';
	 *
	 *   // 物理接口 Tab（嵌套另一个 section）
	 *   o = s.taboption('physical', form.SectionValue, '_physdev',
	 *     form.TypedSection, 'interface', _('绑定接口'));
	 *
	 * 【注意】
	 *   - tabName 必须与 tab() 中定义的名称完全一致（区分大小写）
	 *   - 一旦使用了 taboption()，该 section 下就不应再使用 option()，
	 *     否则用 option() 添加的控件不会出现在任何 Tab 中（不被渲染）
	 *   - Tab 标签只在有多个 Tab 时才会渲染（单 Tab 会退化为无 Tab 显示）
	 */
	taboption(tabName, ...args) {
		if (!this.tabs?.[tabName])
			throw L.error('ReferenceError', 'Associated tab not declared');

		const obj = this.option(...args);
		obj.tab = tabName;
		this.tabs[tabName].children.push(obj);

		return obj;
	},

	/**
	 * Query underlying option configuration values.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if only one argument is specified, the configuration values of all
	 * options within this section are returned as a dictionary.
	 *
	 * If both the section ID and an option name are supplied, this function
	 * returns the configuration value of the specified option only.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @param {string} [option]
	 * The name of the option to query
	 *
	 * @returns {null|string|string[]|Object<string, null|string|string[]>}
	 * Returns either a dictionary of option names and their corresponding
	 * configuration values or just a single configuration value, depending
	 * on the amount of passed arguments.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  cfgvalue(section_id, option?)                                  │
	 * │  读取 UCI 配置文件中的原始值（非用户界面输入值）                  │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   从 UCI 内存缓存中读取指定 section 的配置值。
	 *   这是配置文件中持久化存储的值，不受用户在界面上的临时修改影响。
	 *
	 *   - 传 1 个参数（section_id）：返回该 section 下所有 option 的值字典
	 *   - 传 2 个参数（section_id + option）：返回指定 option 的单个值
	 *
	 * 【参数】
	 *   @param {string}  section_id  UCI section ID
	 *   @param {string}  [option]    option 名称（省略则返回全部）
	 *
	 * 【返回值】
	 *   - 2参数模式：string | string[] | null
	 *     （单值 option 返回字符串，UCI list 返回字符串数组，不存在返回 null）
	 *   - 1参数模式：{ optName: value, ... } 字典对象
	 *
	 * 【与 formvalue 的区别】
	 *   cfgvalue   → UCI 缓存中的原始值（保存前的持久化值）
	 *   formvalue  → 用户当前在界面上填写的值（可能尚未保存）
	 *
	 * 【使用示例】
	 *
	 *   // 读取单个 option 的 UCI 原始值
	 *   const proto = s.cfgvalue('lan', 'proto');
	 *   console.log('LAN 协议：', proto);  // 'static' 或 'dhcp'
	 *
	 *   // 读取 UCI list 类型的值（返回数组）
	 *   const zones = s.cfgvalue('rule1', 'src_mac');
	 *   // ['aa:bb:cc:dd:ee:ff', '11:22:33:44:55:66']
	 *
	 *   // 读取整个 section 的所有 option 值（1参数模式）
	 *   const allValues = s.cfgvalue('lan');
	 *   console.log(allValues);
	 *   // { proto: 'static', ipaddr: '192.168.1.1', netmask: '255.255.255.0', ... }
	 *
	 *   // 在 save 前比较原始值与用户输入，决定是否需要重启服务
	 *   const oldProto = s.cfgvalue(sid, 'proto');
	 *   const newProto = s.formvalue(sid, 'proto');
	 *   if (oldProto !== newProto) {
	 *     console.log('协议已更改，需要重新配置接口');
	 *   }
	 *
	 * 【注意】
	 *   - 依赖 load() 已执行（Map.render() 自动完成）
	 *   - 不依赖 DOM，渲染前后均可调用
	 */
	cfgvalue(section_id, option) {
		const rv = (arguments.length == 1) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o.cfgvalue(section_id);
			else if (o.option == option)
				return o.cfgvalue(section_id);

		return rv;
	},

	/**
	 * Query the underlying option widget input values.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if only one argument is specified, the widget input values of all
	 * options within this section are returned as a dictionary.
	 *
	 * If both the section ID and an option name are supplied, this function
	 * returns the widget input value of the specified option only.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @param {string} [option]
	 * The name of the option to query
	 *
	 * @returns {null|string|string[]|Object<string, null|string|string[]>}
	 * Returns either a dictionary of option names and their corresponding
	 * widget input values or just a single widget input value, depending
	 * on the amount of passed arguments.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  formvalue(section_id, option?)                                 │
	 * │  读取用户在界面上当前输入的值（表单控件的实时值）                 │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   从页面 DOM 控件中读取用户当前填写的值，反映用户操作后的最新状态，
	 *   即使用户尚未点击保存也能读取到。
	 *
	 *   - 传 1 个参数（section_id）：返回该 section 下所有 option 的表单值字典
	 *   - 传 2 个参数（section_id + option）：返回指定 option 的当前表单值
	 *
	 * 【参数】
	 *   @param {string}  section_id  UCI section ID
	 *   @param {string}  [option]    option 名称（省略则返回全部）
	 *
	 * 【返回值】
	 *   与 cfgvalue() 相同的类型结构，但值来自 DOM 而非 UCI 缓存
	 *
	 * 【与 cfgvalue 的区别】
	 *   cfgvalue   → UCI 持久化值（已保存的配置）
	 *   formvalue  → 用户界面当前值（可能未保存，实时反映控件状态）
	 *
	 * 【使用示例】
	 *
	 *   // 读取用户当前在 proto 下拉框选择的值
	 *   const proto = s.formvalue(sid, 'proto');
	 *   console.log('用户选择的协议：', proto);
	 *
	 *   // 在 onchange 回调中读取相关 option 的当前值
	 *   o = s.option(form.ListValue, 'proto', _('协议'));
	 *   o.onchange = function(ev, sid, value) {
	 *     // 同时读取另一个 option 的当前值
	 *     const currentIp = s.formvalue(sid, 'ipaddr');
	 *     console.log('当前 IP：', currentIp, '新协议：', value);
	 *   };
	 *
	 *   // 读取整个 section 的所有当前表单值
	 *   const current = s.formvalue('lan');
	 *   // { proto: 'static', ipaddr: '192.168.1.100', ... }
	 *
	 *   // 在自定义 validate 中读取其他字段的当前值
	 *   o = s.option(form.Value, 'gateway', _('网关'));
	 *   o.validate = function(sid, value) {
	 *     const proto = s.formvalue(sid, 'proto');
	 *     if (proto === 'static' && !value)
	 *       return _('静态 IP 模式下网关不能为空');
	 *     return true;
	 *   };
	 *
	 * 【注意】
	 *   - 必须在表单渲染（m.render()）完成后才能调用
	 *   - 若 Map 尚未 render，则退化为读取 cfgvalue（Map.root 为空时）
	 *   - 被依赖条件隐藏的控件其 formvalue 可能与 cfgvalue 相同
	 */
	formvalue(section_id, option) {
		const rv = (arguments.length == 1) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++) {
			const func = this.map.root ? this.children[i].formvalue : this.children[i].cfgvalue;

			if (rv)
				rv[o.option] = func.call(o, section_id);
			else if (o.option == option)
				return func.call(o, section_id);
		}

		return rv;
	},

	/**
	 * Obtain underlying option LuCI.ui widget instances.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if only one argument is specified, the LuCI.ui widget instances of all
	 * options within this section are returned as a dictionary.
	 *
	 * If both the section ID and an option name are supplied, this function
	 * returns the LuCI.ui widget instance value of the specified option only.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @param {string} [option]
	 * The name of the option to query
	 *
	 * @returns {null|LuCI.ui.AbstractElement|Object<string, null|LuCI.ui.AbstractElement>}
	 * Returns either a dictionary of option names and their corresponding
	 * widget instances or just a single widget instance, depending on the
	 * amount of passed arguments.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  getUIElement(section_id, option?)                              │
	 * │  获取底层 LuCI.ui 控件实例（用于高级 DOM 操作）                  │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   返回底层 LuCI.ui 框架的控件实例（如 ui.Textfield、ui.Select、
	 *   ui.Checkbox、ui.Dropdown 等），可直接调用控件的 setValue()、
	 *   setChoices()、getValue() 等底层方法，适合需要精细控制 UI 状态的场景。
	 *
	 *   - 传 1 个参数：返回所有 option 的 UI 控件实例字典
	 *   - 传 2 个参数：返回指定 option 的单个 UI 控件实例（不存在返回 null）
	 *
	 * 【参数】
	 *   @param {string}  section_id  UCI section ID
	 *   @param {string}  [option]    option 名称（省略则返回全部）
	 *
	 * 【返回值】
	 *   - 2参数模式：LuCI.ui.AbstractElement | null
	 *   - 1参数模式：{ optName: LuCI.ui.AbstractElement, ... }
	 *
	 * 【三种查询方法对比】
	 *   cfgvalue(sid, opt)      → UCI 原始值（字符串/数组）
	 *   formvalue(sid, opt)     → 控件当前输入值（字符串/数组）
	 *   getUIElement(sid, opt)  → 控件实例对象（可调用其方法）
	 *
	 * 【使用示例】
	 *
	 *   // 动态更新下拉框的候选选项（适合异步加载数据后刷新）
	 *   fetch('/api/servers').then(r => r.json()).then(list => {
	 *     const uiEl = s.getUIElement(sid, 'server');
	 *     if (uiEl) {
	 *       const choices = {};
	 *       list.forEach(item => { choices[item.id] = item.name; });
	 *       uiEl.setChoices(choices);
	 *     }
	 *   });
	 *
	 *   // 在 onchange 中动态修改另一个控件的值
	 *   o = s.option(form.ListValue, 'type', _('类型'));
	 *   o.onchange = function(ev, sid, value) {
	 *     const nameEl = s.getUIElement(sid, 'name');
	 *     if (nameEl) nameEl.setValue(value === 'auto' ? 'auto-generated' : '');
	 *   };
	 *
	 *   // 强制触发控件校验
	 *   const ipEl = s.getUIElement(sid, 'ipaddr');
	 *   if (ipEl) ipEl.triggerValidation();
	 *
	 *   // 批量获取所有控件实例（1参数模式）
	 *   const allWidgets = s.getUIElement(sid);
	 *   Object.entries(allWidgets).forEach(([name, widget]) => {
	 *     if (widget) console.log(name, '->', widget.getValue());
	 *   });
	 *
	 * 【注意】
	 *   - 必须在表单渲染（m.render()）完成后调用，否则返回 null
	 *   - 返回的是 LuCI.ui 层的控件，不是 form.AbstractValue 实例
	 *     （form 层实例请用 getOption()）
	 *   - 控件实例与特定 section_id 绑定，多 section 时需传对应的 sid
	 */
	getUIElement(section_id, option) {
		const rv = (arguments.length == 1) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o.getUIElement(section_id);
			else if (o.option == option)
				return o.getUIElement(section_id);

		return rv;
	},

	/**
	 * Obtain underlying option objects.
	 *
	 * This function is sensitive to the amount of arguments passed to it;
	 * if no option name is specified, all options within this section are
	 * returned as a dictionary.
	 *
	 * If an option name is supplied, this function returns the matching
	 * LuCI.form.AbstractValue instance only.
	 *
	 * @param {string} [option]
	 * The name of the option object to obtain
	 *
	 * @returns {null|LuCI.form.AbstractValue|Object<string, LuCI.form.AbstractValue>}
	 * Returns either a dictionary of option names and their corresponding
	 * option instance objects or just a single object instance value,
	 * depending on the amount of passed arguments.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  getOption(option?)                                             │
	 * │  获取 form.AbstractValue option 实例对象（form 层对象，非 UI）   │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   返回通过 option()/taboption() 注册的 AbstractValue 子类实例。
	 *   可用于在渲染前或渲染后动态修改 option 的属性、依赖关系、验证规则等。
	 *
	 *   - 传 0 个参数：返回本 section 下所有 option 的实例字典
	 *   - 传 1 个参数（option 名）：返回对应的单个 option 实例
	 *
	 * 【参数】
	 *   @param {string}  [option]  option 名称（省略则返回全部）
	 *
	 * 【返回值】
	 *   - 1参数模式：LuCI.form.AbstractValue | null
	 *   - 0参数模式：{ optName: AbstractValue, ... }
	 *
	 * 【getOption vs getUIElement 区别】
	 *   getOption(opt)      → form 层实例（AbstractValue），可修改 depends/datatype 等属性
	 *   getUIElement(sid, opt) → ui 层实例（ui.AbstractElement），可调用 setValue/setChoices 等方法
	 *
	 * 【使用示例】
	 *
	 *   // 渲染前动态添加依赖条件
	 *   const ipOpt = s.getOption('ipaddr');
	 *   if (ipOpt) {
	 *     ipOpt.depends('proto', 'static');
	 *     ipOpt.depends('proto', 'relay');
	 *   }
	 *
	 *   // 动态修改 datatype 验证规则
	 *   const portOpt = s.getOption('port');
	 *   if (portOpt) portOpt.datatype = 'range(1, 65535)';
	 *
	 *   // 获取所有 option，检查哪些是必填的
	 *   const allOpts = s.getOption();
	 *   Object.entries(allOpts).forEach(([name, opt]) => {
	 *     if (!opt.optional && opt.rmempty === false)
	 *       console.log('必填字段：', name);
	 *   });
	 *
	 *   // 在封装函数中通用操作：对某个 option 追加额外的 value 选项
	 *   function addValue(section, optName, val, label) {
	 *     const opt = section.getOption(optName);
	 *     if (opt && typeof opt.value === 'function')
	 *       opt.value(val, label);
	 *   }
	 *   addValue(s, 'proto', 'wireguard', _('WireGuard'));
	 *
	 * 【注意】
	 *   - 渲染前后均可调用（不依赖 DOM）
	 *   - 修改属性需在 m.render() 之前生效；render 后修改依赖不会自动刷新 UI
	 *   - 返回的是 form 框架层对象，若需操作控件 DOM 请用 getUIElement()
	 */
	getOption(option) {
		const rv = (arguments.length == 0) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o;
			else if (o.option == option)
				return o;

		return rv;
	},

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  renderUCISection(section_id)          【框架内部方法，非公开】  │
	 * │  渲染单个 UCI section 实例的全部内容（含 Tab 分组支持）           │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   根据是否定义了 Tab，选择不同的渲染路径：
	 *   - 无 Tab：直接调用 renderOptions(null, section_id) 渲染全部 option
	 *   - 有 Tab：并行调用每个 tab 的 renderOptions(tabName, section_id)，
	 *             再通过 renderTabContainers() 将结果组合为带 data-tab 属性的容器
	 *
	 * 【调用时机】
	 *   由子类（TypedSection、NamedSection 等）的 render() 方法在遍历
	 *   cfgsections() 时对每个 section ID 调用。
	 *
	 * 【参数】
	 *   @param {string}  section_id  要渲染的 UCI section ID
	 *
	 * 【返回值】
	 *   {Promise<Node>}  渲染完成的 section 内容节点（DocumentFragment）
	 *
	 * 【使用示例】
	 *
	 *   // 通常不直接调用，由框架自动管理
	 *   // 若需在子类中自定义渲染行为，可覆盖此方法：
	 *   const MySection = form.TypedSection.extend({
	 *     renderUCISection(section_id) {
	 *       // 在标准渲染结果前插入自定义标题
	 *       return this.super('renderUCISection', section_id).then(node => {
	 *         const wrapper = E('div', { 'class': 'my-section' });
	 *         wrapper.appendChild(E('h4', {}, uci.get('network', section_id, 'ifname')));
	 *         wrapper.appendChild(node);
	 *         return wrapper;
	 *       });
	 *     }
	 *   });
	 *
	 * 【注意】
	 *   - 这是框架内部方法，普通开发者无需直接调用
	 *   - Tab 并行渲染：各 Tab 的 renderOptions() 以 Promise.all() 并行执行
	 */
	renderUCISection(section_id) {
		const renderTasks = [];

		if (!this.tabs)
			return this.renderOptions(null, section_id);

		for (let i = 0; i < this.tab_names.length; i++)
			renderTasks.push(this.renderOptions(this.tab_names[i], section_id));

		return Promise.all(renderTasks)
			.then(this.renderTabContainers.bind(this, section_id));
	},

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  renderTabContainers(section_id, nodes)  【框架内部方法，非公开】│
	 * │  将各 Tab 内容节点包装为带 data-tab 属性的 div 容器              │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   接收 renderUCISection 并行渲染出的各 Tab 内容节点数组（nodes），
	 *   为每个 Tab 生成一个 <div> 容器，设置以下属性：
	 *     - id:                "container.{config}.{section_id}.{tab_name}"
	 *     - data-tab:          Tab 名称（供 ui.tabs.initTabGroup 识别）
	 *     - data-tab-title:    Tab 标题文字
	 *     - data-tab-active:   是否为当前激活 Tab（布尔字符串）
	 *
	 *   若 Tab 定义了 description，还会在内容前插入说明段落 <div class="cbi-tab-descr">。
	 *   最终返回包含所有 Tab 容器的 DocumentFragment，由框架的
	 *   ui.tabs.initTabGroup() 解析并激活 Tab 切换交互。
	 *
	 * 【参数】
	 *   @param {string}      section_id  UCI section ID
	 *   @param {Array<Node>} nodes       各 Tab 的渲染内容节点（顺序与 tab_names 一致）
	 *
	 * 【返回值】
	 *   {DocumentFragment}  包含所有 Tab 容器 <div> 的文档片段
	 *
	 * 【使用示例】
	 *
	 *   // 这是框架内部方法，通常不直接调用
	 *   // 若需自定义 Tab 容器的渲染（如添加徽标或图标），可在子类覆盖：
	 *   const MySection = form.TypedSection.extend({
	 *     renderTabContainers(section_id, nodes) {
	 *       // 调用父类生成标准容器
	 *       const fragment = this.super('renderTabContainers', section_id, nodes);
	 *       // 对第一个 Tab 容器追加自定义内容
	 *       const firstTab = fragment.firstElementChild;
	 *       if (firstTab) firstTab.classList.add('my-custom-tab');
	 *       return fragment;
	 *     }
	 *   });
	 *
	 * 【注意】
	 *   - nodes 数组长度必须与 this.tab_names 长度一致
	 *   - 生成的容器 id 格式固定，ui.tabs 依赖此格式识别 Tab 分组
	 *   - selected_tab 属性可在渲染前设置，以控制默认激活的 Tab
	 */
	renderTabContainers(section_id, nodes) {
		const config_name = this.uciconfig ?? this.map.config;
		const containerEls = E([]);

		for (let i = 0; i < nodes.length; i++) {
			const tab_name = this.tab_names[i];
			const tab_data = this.tabs[tab_name];
			const containerEl = E('div', {
				'id': 'container.%s.%s.%s'.format(config_name, section_id, tab_name),
				'data-tab': tab_name,
				'data-tab-title': tab_data.title,
				'data-tab-active': tab_name === this.selected_tab
			});

			if (tab_data.description != null && tab_data.description != '')
				containerEl.appendChild(
					E('div', { 'class': 'cbi-tab-descr' }, tab_data.description));

			containerEl.appendChild(nodes[i]);
			containerEls.appendChild(containerEl);
		}

		return containerEls;
	},

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  renderOptions(tab_name, section_id)    【框架内部方法，非公开】 │
	 * │  渲染指定 Tab（或无 Tab 模式）下的所有 option 控件节点           │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   调用 renderChildren(tab_name, section_id, in_table) 并行渲染
	 *   属于指定 Tab 的所有 option 子元素，将结果节点数组收集到
	 *   一个 DocumentFragment 中返回。
	 *
	 *   in_table 参数由是否为 TableSection 实例决定，影响各 option
	 *   渲染为 <td> 格（表格模式）还是 <div> 行（表单模式）。
	 *
	 * 【参数】
	 *   @param {string|null} tab_name   Tab 名称；null 表示无 Tab 模式（渲染全部）
	 *   @param {string}      section_id UCI section ID
	 *
	 * 【返回值】
	 *   {Promise<DocumentFragment>}  包含所有 option 渲染节点的文档片段
	 *
	 * 【调用链关系】
	 *   renderUCISection(sid)
	 *     └─ renderOptions(tabName, sid)          ← 本方法
	 *          └─ renderChildren(tabName, sid, inTable)
	 *               └─ option.render(sid)         每个子控件渲染自身
	 *
	 * 【使用示例】
	 *
	 *   // 框架内部方法，普通开发者无需直接调用
	 *   // 若需在某个 Tab 内容前后插入自定义内容，可在子类覆盖：
	 *   const MySection = form.TypedSection.extend({
	 *     renderOptions(tab_name, section_id) {
	 *       return this.super('renderOptions', tab_name, section_id).then(fragment => {
	 *         if (tab_name === 'advanced') {
	 *           // 在高级 Tab 的 option 列表顶部插入一条警告
	 *           fragment.insertBefore(
	 *             E('div', { 'class': 'alert-message warning' }, _('修改高级选项可能导致连接中断')),
	 *             fragment.firstChild
	 *           );
	 *         }
	 *         return fragment;
	 *       });
	 *     }
	 *   });
	 *
	 * 【注意】
	 *   - 属于其他 Tab 的 option（tab 属性不匹配）会被 renderChildren 自动跳过
	 *   - TableSection 中此方法生成 <td> 单元格，其他 section 生成 <div> 行
	 */
	renderOptions(tab_name, section_id) {
		const in_table = (this instanceof CBITableSection);
		return this.renderChildren(tab_name, section_id, in_table).then((nodes) =>  {
			const optionEls = E([]);
			for (let i = 0; i < nodes.length; i++)
				optionEls.appendChild(nodes[i]);
			return optionEls;
		});
	},

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  checkDepends(ev, n)                    【框架内部方法，非公开】 │
	 * │  检查并更新本 section 中所有 option 的依赖显示状态               │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   遍历所有 section ID 及其每个 option 子元素，重新计算依赖是否满足：
	 *     1. 调用 option.checkDepends(sid) 判断当前依赖条件是否满足
	 *     2. 若激活状态（isActive）与依赖结果（isSatisfied）不一致，
	 *        调用 option.setActive(sid, true/false) 切换显示/隐藏
	 *     3. 对仍处于激活状态的 option 调用 triggerValidation(sid)
	 *        重新触发验证（避免隐藏后残留的验证错误影响提交）
	 *
	 *   由 Map 层在每次 option 值变化时自动调用（绑定在 cbi-input-change 事件上），
	 *   实现 option 的动态显示/隐藏联动。
	 *
	 * 【参数】
	 *   @param {Event}   [ev]  触发此次检查的 DOM 事件（可为 undefined，程序触发时）
	 *   @param {number}  [n]   递归调用深度标志（非 0 时跳过 triggerValidation）
	 *
	 * 【返回值】
	 *   {boolean}  任意 option 的显示状态发生改变时返回 true，否则返回 false
	 *
	 * 【触发时机】
	 *   - 用户修改任意表单控件值后（cbi-input-change 事件）
	 *   - 表单首次渲染完成后（初始化依赖状态）
	 *   - 手动调用 Map.checkDepends() 时级联触发
	 *
	 * 【使用示例】
	 *
	 *   // 框架自动管理，普通开发者通常无需手动调用
	 *   // 若在 JS 中以编程方式修改了某个 option 的值，
	 *   // 需要手动触发依赖更新：
	 *   const uiEl = s.getUIElement(sid, 'proto');
	 *   if (uiEl) {
	 *     uiEl.setValue('static');
	 *     // 手动触发依赖刷新，使依赖 proto=static 的字段显示出来
	 *     s.checkDepends();
	 *   }
	 *
	 *   // 监听依赖变化（如需在状态改变后执行额外逻辑）
	 *   const origCheck = s.checkDepends.bind(s);
	 *   s.checkDepends = function(ev, n) {
	 *     const changed = origCheck(ev, n);
	 *     if (changed) console.log('依赖状态已更新，有字段显示/隐藏发生变化');
	 *     return changed;
	 *   };
	 *
	 * 【注意】
	 *   - 这是框架内部方法，一般不需要覆盖
	 *   - depends() 使用的是 isEqual/isContained 比较，
	 *     值类型敏感（注意 UCI 值都是字符串，比较时使用字符串 '0'/'1' 而非布尔值）
	 *   - n 非 0 时不触发 triggerValidation，避免级联递归中重复校验
	 */
	checkDepends(ev, n) {
		let changed = false;
		const sids = this.cfgsections();

		for (let i = 0, sid = sids[0]; (sid = sids[i]) != null; i++) {
			for (let j = 0, o = this.children[0]; (o = this.children[j]) != null; j++) {
				let isActive = o.isActive(sid);
				const isSatisfied = o.checkDepends(sid);

				if (isActive != isSatisfied) {
					o.setActive(sid, !isActive);
					isActive = !isActive;
					changed = true;
				}

				if (!n && isActive)
					o.triggerValidation(sid);
			}
		}

		return changed;
	}
});


/**
 * isEqual：深度比较两个值是否相等（用于依赖检查和变更检测）。

 * 支持的比较类型：
     - 正则表达式（RegExp）：x 匹配正则 y 时返回 true
     - 数组：逐元素递归比较
     - 对象：键值对递归比较
     - 基本类型：严格相等（==）
     - null 与非 null：返回 false

 * @param {*} x - 第一个值
 * @param {*} y - 第二个值（可以是 RegExp 用于模式匹配）
 * @returns {boolean}

   【内部使用】
     主要在两个场景使用：
     1. 依赖检查：比较字段当前值与 depends() 中指定的期望值
     2. 变更检测：比较 cfgvalue（UCI 原始值）与 formvalue（用户输入）
        相同时不写入 UCI（避免不必要的变更记录）

   【使用示例（间接通过 depends()）】
     o.depends('proto', 'static');   // isEqual(currentProto, 'static')
     o.depends({ proto: /ppp.+/ });  // isEqual(currentProto, /ppp.+/)
 */
function isEqual(x, y) {
	if (typeof(y) == 'object' && y instanceof RegExp)
		return (x == null) ? false : y.test(x);

	if (x != null && y != null && typeof(x) != typeof(y))
		return false;

	if ((x == null && y != null) || (x != null && y == null))
		return false;

	if (Array.isArray(x)) {
		if (x.length != y.length)
			return false;

		for (let i = 0; i < x.length; i++)
			if (!isEqual(x[i], y[i]))
				return false;
	}
	else if (typeof(x) == 'object') {
		for (const k in x) {
			if (x.hasOwnProperty(k) && !y.hasOwnProperty(k))
				return false;

			if (!isEqual(x[k], y[k]))
				return false;
		}

		for (const k in y)
			if (y.hasOwnProperty(k) && !x.hasOwnProperty(k))
				return false;
	}
	else if (x != y) {
		return false;
	}

	return true;
};

/**
 * isContained：检查值 x 是否包含 y（用于 '!contains' 依赖修饰符）。

 * 支持的检查类型：
     - 数组 x：检查 y 是否是 x 的元素
     - 对象 x：检查 x 是否有键 y 且值非 null
     - 字符串 x：检查 x 是否包含子串 y

 * @param {Array|Object|string} x - 被检查的值
 * @param {*}                   y - 要查找的值
 * @returns {boolean}

   【内部使用，通过 depends() 的 '!contains' 修饰符触发】

   【使用示例（通过 depends()）】
     // UCI list 选项 'zones' 包含 'wan' 时显示
     o.depends({ zones: 'wan', '!contains': true });

     // 字符串选项 'ssid' 包含 'Guest' 时显示
     o.depends({ ssid: 'Guest', '!contains': true });
 */
function isContained(x, y) {
	if (Array.isArray(x)) {
		for (let i = 0; i < x.length; i++)
			if (x[i] == y)
				return true;
	}
	else if (L.isObject(x)) {
		if (x.hasOwnProperty(y) && x[y] != null)
			return true;
	}
	else if (typeof(x) == 'string') {
		return (x.indexOf(y) > -1);
	}

	return false;
};

/**
 * @class AbstractValue
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractElement
 * @hideconstructor
 * @classdesc

 * The `AbstractValue` class serves as an abstract base for the different form
 * option styles implemented by `LuCI.form`. It provides the common logic for
 * handling option input values, for dependencies among options and for
 * validation constraints that should be applied to entered values.

 * This class is private and not directly accessible by user code.
 */
/**
 * ════════════════════════════════════════════════════════════
 * AbstractValue：Option 控件的抽象基类
 * ════════════════════════════════════════════════════════════

   【作用】
     所有 Option 控件（Value、Flag、ListValue 等）的公共基类。
     提供：依赖管理、数据读写（cfgvalue/formvalue/write/remove）、
     输入验证（datatype/validate）、只读控制、UCI 路径覆盖等。

 * ══════════════════ 关键属性完整说明 ══════════════════

   【数据相关属性】
     default     {*}
       当 UCI 中该选项不存在时使用的默认值。
       建议总是显式设置，避免 undefined 导致的意外行为。
       示例：o.default = '1';  o.default = 'none';

     rmempty     {boolean}  默认 true
       true：当用户将值清空时，从 UCI 中删除该选项（unset）
       false：即使用户清空，也保留该选项（保存空字符串）
       示例：必填字段应设 o.rmempty = false;

     optional    {boolean}  默认 false
       true：允许控件为空（空值不触发验证错误）
       false：控件不能为空（空值时显示错误提示）
       与 rmempty 的区别：optional 控制是否允许空；rmempty 控制空时的保存行为

     retain      {boolean}  默认 false
       true：当该 option 因依赖不满足被隐藏时，保留 UCI 中的原有值
       false：隐藏时删除 UCI 中的值（默认行为）
       使用场景：条件显示的字段不希望在隐藏时丢失已保存的值

     forcewrite  {boolean}  默认 false
       true：即使值未改变，也强制写入 UCI
       false：仅在值发生变化时写入（默认，避免不必要的变更记录）

   【UCI 路径覆盖属性】
     uciconfig   {string}  默认 null（继承父 Map 的配置名）
       覆盖 UCI 配置文件名，使该 option 读写不同的配置文件。
       示例：o.uciconfig = 'firewall';  // 从 firewall 配置读写

     ucisection  {string}  默认 null（使用父 section 的 section_id）
       覆盖 UCI section 名，使该 option 读写指定的 section。
       示例：o.ucisection = 'defaults';  // 总是读写 defaults section

     ucioption   {string}  默认 null（使用 option 元素的名称）
       覆盖 UCI 选项名，使该 option 读写不同名的 UCI 选项。
       示例：o.ucioption = 'dns_server';  // 实际读写 dns_server 选项

   【验证相关属性】
     datatype    {string}  默认 null
       格式验证表达式。详见文件头部的"常用 datatype 类型一览"。
       示例：o.datatype = 'ipaddr';
              o.datatype = 'range(1,65535)';
              o.datatype = 'list(ipaddr, " ")';

     validate    {function|Array<function>}  默认 null
       自定义验证函数（或函数数组）。
       函数签名：(section_id, value) => true | '错误消息'
       返回 true 表示验证通过；返回字符串则显示为错误消息。
       示例：
         o.validate = function(sid, val) {
           if (val.length < 8) return _('密码至少8位');
           return true;
         };
       多个验证器（串行执行，第一个失败即停止）：
         o.validate = [
           (sid, val) => val.length >= 8 || _('密码至少8位'),
           (sid, val) => /[A-Z]/.test(val) || _('需要大写字母')
         ];

   【显示相关属性】
     readonly    {boolean}  默认 null（继承 Map 的 readonly 状态）
       true：控件显示为禁用状态，用户无法修改
       false：强制可编辑（即使 Map 设置了 readonly）

     onchange    {function}  默认 null
       值变化时的回调函数。
       函数签名：(ev, section_id, value) => void
       示例：
         o.onchange = function(ev, sid, value) {
           // 当 proto 改变时，动态更新其他字段的可见性
           var ipOpt = map.lookupOption('ipaddr', sid);
           if (ipOpt) ipOpt[0].setActive(sid, value === 'static');
         };

     width       {number|string}  默认 null
       在 TableSection/GridSection 中控制列宽。
       数字时按像素处理，字符串时直接设为 CSS width 值。
       示例：o.width = 150;  o.width = '20%';

     editable    {boolean}  默认 false
       在 GridSection 的表格列中，true=显示为可编辑控件，false=只显示文本

     modalonly   {boolean|null}  默认 null
       在 GridSection 中控制 option 的显示位置：
       null  = 在表格列和模态框中都显示
       false = 仅在表格列中显示（不在模态框）
       true  = 仅在模态框中显示（不在表格列）

     titleref    {string}  默认 null
       将 option 标题渲染为链接，指向该 URL（方便跳转到相关配置页）。
       示例：o.titleref = L.url('admin/network/interfaces');

 * ══════════════════ 关键方法完整说明 ══════════════════

   【depends(field, value?) — 添加依赖约束】
     见文件头部的"depends() 条件依赖系统完整用法"。

   【cbid(section_id) — 获取元素的 DOM ID】
     返回格式：'cbid.{config}.{section_id}.{option}'
     示例：o.cbid('lan') → 'cbid.network.lan.ipaddr'
     用途：通过 map.findElement('id', o.cbid(sid)) 定位 DOM 节点

   【load(section_id) — 加载 UCI 配置值】
     默认实现读取 UCI 值，可以覆盖以从其他来源加载：
     o.load = function(sid) {
       return callMyRPC(sid).then(data => data.value);
     };

   【cfgvalue(section_id) — 查询缓存的配置值】
     读取 load() 加载并缓存的原始值（不触发网络请求）。
     可以覆盖以返回动态计算的值：
     o.cfgvalue = function(sid) {
       var raw = uci.get('network', sid, 'ipaddr');
       return raw ? raw.split('/')[0] : null;  // 只取 IP 部分
     };

   【formvalue(section_id) — 读取当前输入值】
     读取表单控件当前显示的值（用户可能已修改但未保存）。
     需要在表单渲染完成后调用。

   【textvalue(section_id) — 获取文本表示】
     返回值的 HTML 转义纯文本表示。
     FlagValue 覆盖此方法返回 'Yes'/'No'。
     可以覆盖以自定义显示格式（用于 TableSection 的文本预览）。

   【write(section_id, value) — 写入配置值（覆盖可自定义保存逻辑）】
     默认实现调用 uci.set()，可以覆盖以自定义：
     o.write = function(sid, val) {
       uci.set('network', sid, 'ipaddr', val + '/24');  // 自动追加前缀长度
     };

   【remove(section_id) — 删除配置值（覆盖可阻止删除）】
     默认实现调用 uci.unset()，可以覆盖以防止删除：
     o.remove = function(sid) {
       // 覆盖为空函数，防止值被删除
     };

   【validate(section_id, value) — 自定义验证（等同于属性赋值）】
     既可以设置为属性（o.validate = fn），也可以覆盖为方法：
     // 方法形式（等效但风格不同）
     const MyValue = form.Value.extend({
       validate(sid, val) {
         return val.startsWith('https://') || _('必须以 https:// 开头');
       }
     });

   【isValid(section_id) — 检查当前输入是否有效】
     返回 true/false，基于 datatype 和 validate 规则。
     可用于在 save 回调中手动检查特定字段的状态。

   【isActive(section_id) — 检查控件是否处于激活（可见）状态】
     返回 true（可见且未因依赖被隐藏）或 false。
 */
const CBIAbstractValue = CBIAbstractElement.extend(/** @lends LuCI.form.AbstractValue.prototype */ {
	__init__(map, section, option, ...args) {
		this.super('__init__', args);

		this.section = section;
		this.option = option;
		this.map = map;
		this.config = map.config;

		this.deps = [];
		this.initial = {};
		this.rmempty = true;
		this.default = null;
		this.size = null;
		this.optional = false;
		this.retain = false;
	},

	/**
	 * If set to `false`, the underlying option value is retained upon saving
	 * the form when the option element is disabled due to unsatisfied
	 * dependency constraints.
	 *
	 * @name LuCI.form.AbstractValue.prototype#rmempty
	 * @type boolean
	 * @default true
	 */

	/**
	 * If set to `true`, the underlying ui input widget is allowed to be empty,
	 * otherwise the option element is marked invalid when no value is entered
	 * or selected by the user.
	 *
	 * @name LuCI.form.AbstractValue.prototype#optional
	 * @type boolean
	 * @default false
	 */

	/**
	 * If set to `true`, the underlying ui input widget value is not cleared
	 * from the configuration on unsatisfied dependencies. The default behavior
	 * is to remove the values of all options whose dependencies are not
	 * fulfilled.
	 *
	 * @name LuCI.form.AbstractValue.prototype#retain
	 * @type boolean
	 * @default false
	 */

	/**
	 * Sets a default value to use when the underlying UCI option is not set.
	 *
	 * @name LuCI.form.AbstractValue.prototype#default
	 * @type *
	 * @default null
	 */

	/**
	 * Specifies a datatype constraint expression to validate input values
	 * against. Refer to {@link LuCI.validation} for details on the format.
	 *
	 * If the user entered input does not match the datatype validation, the
	 * option element is marked as invalid.
	 *
	 * @name LuCI.form.AbstractValue.prototype#datatype
	 * @type string
	 * @default null
	 */

	/**
	 * Specifies a custom validation function to test the user input for
	 * validity. The validation function must return `true` to accept the
	 * value. Any other return value type is converted to a string and
	 * displayed to the user as a validation error message.
	 *
	 * If the user entered input does not pass the validation function, the
	 * option element is marked as invalid.
	 *
	 * @name LuCI.form.AbstractValue.prototype#validate
	 * @type function
	 * @default null
	 */

	/**
	 * Override the UCI configuration name to read the option value from.
	 *
	 * By default, the configuration name is inherited from the parent Map.
	 * By setting this property, a deviating configuration may be specified.
	 *
	 * The default of null means inherit from the parent form.
	 *
	 * @name LuCI.form.AbstractValue.prototype#uciconfig
	 * @type string
	 * @default null
	 */

	/**
	 * Override the UCI section name to read the option value from.
	 *
	 * By default, the section ID is inherited from the parent section element.
	 * By setting this property, a deviating section may be specified.
	 *
	 * The default of null means inherit from the parent section.
	 *
	 * @name LuCI.form.AbstractValue.prototype#ucisection
	 * @type string
	 * @default null
	 */

	/**
	 * Override the UCI option name to read the value from.
	 *
	 * By default, the elements name, which is passed as the third argument to
	 * the constructor, is used as the UCI option name. By setting this property,
	 * a deviating UCI option may be specified.
	 *
	 * The default of null means use the option element name.
	 *
	 * @name LuCI.form.AbstractValue.prototype#ucioption
	 * @type string
	 * @default null
	 */

	/**
	 * Mark the grid section option element as editable.
	 *
	 * Options which are displayed in the table portion of a `GridSection`
	 * instance are rendered as readonly text by default. By setting the
	 * `editable` property of a child option element to `true`, that element
	 * is rendered as a full input widget within its cell instead of a text only
	 * preview.
	 *
	 * This property has no effect on options that are not children of grid
	 * section elements.
	 *
	 * @name LuCI.form.AbstractValue.prototype#editable
	 * @type boolean
	 * @default false
	 */

	/**
	 * Move the grid section option element into the table, the modal popup or both.
	 *
	 * If this property is `null` (the default), the option element is
	 * displayed in both the table preview area and the per-section instance
	 * modal popup of a grid section. When it is set to `false` the option
	 * is only shown in the table but not the modal popup. When set to `true`,
	 * the option is only visible in the modal popup but not the table.
	 *
	 * This property has no effect on options that are not children of grid
	 * section elements.
	 *
	 * @name LuCI.form.AbstractValue.prototype#modalonly
	 * @type boolean
	 * @default null
	 */

	/**
	 * Make option element readonly.
	 *
	 * This property defaults to the readonly state of the parent form element.
	 * When set to `true`, the underlying widget is rendered in disabled state,
	 * meaning its contents cannot be changed and the widget cannot be
	 * interacted with.
	 *
	 * @name LuCI.form.AbstractValue.prototype#readonly
	 * @type boolean
	 * @default false
	 */

	/**
	 * Override the cell width of a table or grid section child option.
	 *
	 * If the property is set to a numeric value, it is treated as pixel width
	 * which is set on the containing cell element of the option, essentially
	 * forcing a certain column width. When the property is set to a string
	 * value, it is applied as-is to the CSS `width` property.
	 *
	 * This property has no effect on options that are not children of grid or
	 * table section elements.
	 *
	 * @name LuCI.form.AbstractValue.prototype#width
	 * @type number|string
	 * @default null
	 */

	/**
	 * Register a custom value change handler.
	 *
	 * If this property is set to a function, it is invoked
	 * whenever the value of the underlying UI input element changes.
	 *
	 * The invoked handler function will receive the DOM click element as
	 * first and the underlying configuration section ID as well as the input
	 * value as second and third argument respectively.
	 *
	 * @name LuCI.form.AbstractValue.prototype#onchange
	 * @type function
	 * @default null
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  onchange  {function}  属性                                     │
	 * │  值变化时的回调函数（用于实现字段间联动）                         │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   当用户修改表单控件的值时触发（input/change 事件），
	 *   可用于实现字段联动、动态更新其他控件、触发异步加载等。
	 *
	 * 【回调函数签名】
	 *   function(ev, section_id, value) {}
	 *     @param {Event}  ev          触发变化的 DOM 事件对象
	 *     @param {string} section_id  当前 UCI section ID
	 *     @param {*}      value       控件变化后的新值
	 *
	 * 【使用示例】
	 *
	 *   // 示例1：根据协议切换显示不同字段
	 *   o = s.option(form.ListValue, 'proto', _('协议'));
	 *   o.value('static', _('静态 IP'));
	 *   o.value('dhcp',   _('DHCP'));
	 *   o.value('pppoe',  _('PPPoE'));
	 *   o.onchange = function(ev, sid, value) {
	 *     // 切换协议时强制刷新依赖状态（可选，框架通常自动处理）
	 *     this.section.checkDepends();
	 *   };
	 *
	 *   // 示例2：动态更新另一个下拉框的选项（异步加载）
	 *   o = s.option(form.ListValue, 'device', _('设备'));
	 *   o.onchange = function(ev, sid, value) {
	 *     // 根据选中的设备，动态加载可用端口列表
	 *     fs.exec('/usr/bin/get_ports', [value]).then(result => {
	 *       const portEl = this.section.getUIElement(sid, 'port');
	 *       if (portEl) {
	 *         const choices = {};
	 *         result.trim().split('\n').forEach(p => { choices[p] = p; });
	 *         portEl.setChoices(choices);
	 *       }
	 *     });
	 *   };
	 *
	 *   // 示例3：实时计算并展示派生值
	 *   o = s.option(form.Value, 'ipaddr', _('IP 地址'));
	 *   o.onchange = function(ev, sid, value) {
	 *     const dummy = this.section.getUIElement(sid, 'network_display');
	 *     if (dummy && value) {
	 *       // 实时显示所属网段
	 *       const net = value.split('.').slice(0, 3).join('.') + '.0/24';
	 *       dummy.setValue(net);
	 *     }
	 *   };
	 *
	 *   // 示例4：联动控制另一个字段的 readonly 状态
	 *   o = s.option(form.Flag, 'custom_mtu', _('自定义 MTU'));
	 *   o.onchange = function(ev, sid, value) {
	 *     const mtuEl = this.section.getUIElement(sid, 'mtu');
	 *     if (mtuEl) {
	 *       // 勾选时解除只读，取消勾选时恢复只读
	 *       mtuEl.node.querySelector('input')
	 *            .toggleAttribute('disabled', value !== '1');
	 *     }
	 *   };
	 *
	 * 【注意】
	 *   - 回调中 this 指向 option 实例，可访问 this.section、this.map
	 *   - onchange 在 DOM 事件层面触发，不是在 parse/save 时触发
	 *   - 依赖切换（shows/hides）由框架自动处理，通常不需要在 onchange 里
	 *     手动操作依赖状态；需要时调用 this.section.checkDepends()
	 *   - 若需要在程序里模拟值变化，使用 uiElement.setValue() 不会触发
	 *     onchange，需要手动调用 this.section.checkDepends()
	 */

	/**
	 * Add a dependency constraint to the option.
	 *
	 * Dependency constraints allow making the presence of option elements
	 * dependent on the current values of certain other options within the
	 * same form. An option element with unsatisfied dependencies will be
	 * hidden from the view and its current value omitted when saving.
	 *
	 * Multiple constraints (that is, multiple calls to `depends()`) are
	 * treated as alternatives, forming a logical "or" expression.
	 *
	 * By passing an object of name => value pairs as the first argument, it is
	 * possible to depend on multiple options simultaneously, forming
	 * a logical "and" expression.
	 *
	 * Option names may be given in "dot notation" which allows referencing
	 * option elements outside the current form section. If a name without
	 * a dot is specified, it refers to an option within the same configuration
	 * section. If specified as <code>configname.sectionid.optionname</code>,
	 * options anywhere within the same form may be specified.
	 *
	 * The object notation also allows for a number of special keys which are
	 * not treated as option names but as modifiers to influence the dependency
	 * constraint evaluation. The associated value of these special "tag" keys
	 * is ignored. The recognized tags are:
	 *
	 * <ul>
	 *   <li>
	 *	<code>!reverse</code><br>
	 *	Invert the dependency, instead of requiring another option to be
	 *	equal to the dependency value, that option should <em>not</em> be
	 *	equal.
	 *   </li>
	 *   <li>
	 *	<code>!contains</code><br>
	 *	Instead of requiring an exact match, the dependency is considered
	 *	satisfied when the dependency value is contained within the option
	 *	value.
	 *   </li>
	 *   <li>
	 *	<code>!default</code><br>
	 *	The dependency is always satisfied
	 *   </li>
	 * </ul>
	 *
	 * Examples:
	 *
	 * <ul>
	 *  <li>
	 *   <code>opt.depends("foo", "test")</code><br>
	 *   Require the value of `foo` to be `test`.
	 *  </li>
	 *  <li>
	 *   <code>opt.depends({ foo: "test" })</code><br>
	 *   Equivalent to the previous example.
	 *  </li>
	 *  <li>
	 *   <code>opt.depends({ foo: /test/ })</code><br>
	 *   Require the value of `foo` to match the regular expression `/test/`.
	 *  </li>
	 *  <li>
	 *   <code>opt.depends({ foo: "test", bar: "qrx" })</code><br>
	 *   Require the value of `foo` to be `test` and the value of `bar` to be
	 *   `qrx`.
	 *  </li>
	 *  <li>
	 *   <code>opt.depends({ foo: "test" })<br>
	 *		 opt.depends({ bar: "qrx" })</code><br>
	 *   Require either <code>foo</code> to be set to <code>test</code>,
	 *   <em>or</em> the <code>bar</code> option to be <code>qrx</code>.
	 *  </li>
	 *  <li>
	 *   <code>opt.depends("test.section1.foo", "bar")</code><br>
	 *   Require the "foo" form option within the "section1" section to be
	 *   set to "bar".
	 *  </li>
	 *  <li>
	 *   <code>opt.depends({ foo: "test", "!contains": true })</code><br>
	 *   Require the "foo" option value to contain the substring "test".
	 *  </li>
	 * </ul>
	 *
	 * @param {string|Object<string, string|RegExp>} field
	 * The name of the option to depend on or an object describing multiple
	 * dependencies which must be satisfied (a logical "and" expression).
	 *
	 * @param {string|RegExp} [value]
	 * When invoked with a plain option name as the first argument, this parameter
	 * specifies the expected value. In case an object is passed as the first
	 * argument, this parameter is ignored.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  depends(field, value?)                                         │
	 * │  为 option 添加依赖约束（控制显示/隐藏联动）                     │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   当指定字段不满足条件时，本 option 自动隐藏且其值不写入 UCI。
	 *   多次调用 depends() 之间是 OR 关系（任一满足即显示）。
	 *   同一次调用中传入对象则字段之间是 AND 关系（全部满足才显示）。
	 *
	 * 【参数】
	 *   @param {string|Object} field  依赖字段名，或包含多字段条件的对象
	 *   @param {string|RegExp} [value] 期望值（field 为字符串时使用）
	 *
	 * 【字段名格式】
	 *   - 'proto'                    → 同 section 内的 option
	 *   - 'network.lan.proto'        → 跨 section 引用（config.section.option）
	 *
	 * 【特殊修饰符（对象 key）】
	 *   '!reverse'   true  → 反转条件（值不等于期望值时显示）
	 *   '!contains'  true  → 包含匹配（值包含子串/数组含元素时满足）
	 *   '!default'   true  → 无条件满足（始终显示）
	 *   '!val:XXX'   true  → 以 XXX 作为该字段的期望值（高级用法）
	 *
	 * 【使用示例】
	 *
	 *   // 1. 简单等值匹配：proto='static' 时显示
	 *   o.depends('proto', 'static');
	 *
	 *   // 2. 等效对象写法
	 *   o.depends({ proto: 'static' });
	 *
	 *   // 3. 正则匹配：proto 以 'ppp' 开头时显示
	 *   o.depends({ proto: /^ppp/ });
	 *
	 *   // 4. AND 条件：proto='pppoe' 且 auth='pap' 时显示
	 *   o.depends({ proto: 'pppoe', auth: 'pap' });
	 *
	 *   // 5. OR 条件：proto='pppoe' 或 proto='pptp' 时显示
	 *   o.depends('proto', 'pppoe');
	 *   o.depends('proto', 'pptp');
	 *
	 *   // 6. 反向依赖：proto 不是 'none' 时显示
	 *   o.depends({ proto: 'none', '!reverse': true });
	 *
	 *   // 7. 包含匹配：UCI list 'zones' 包含 'wan' 时显示
	 *   o.depends({ zones: 'wan', '!contains': true });
	 *
	 *   // 8. 跨 section 引用：network.lan 的 proto='static' 时显示
	 *   o.depends('network.lan.proto', 'static');
	 *
	 *   // 9. 无条件显示（覆盖其他 depends，用于条件性地强制显示）
	 *   if (alwaysShow) o.depends({ '!default': true });
	 *
	 *   // 10. 复合：(proto='pppoe' AND mtu 不空) OR (proto='static')
	 *   o.depends({ proto: 'pppoe', mtu: /\d+/ });
	 *   o.depends({ proto: 'static' });
	 *
	 * 【注意】
	 *   - UCI 中所有值都是字符串，注意用 '0'/'1' 而非 false/true
	 *   - 隐藏时 option 的值默认从 UCI 中删除（除非设置 retain=true）
	 *   - depends() 在 render() 之前调用；render() 后动态修改需手动
	 *     调用 section.checkDepends() 刷新显示状态
	 */
	depends(field, value) {
		let deps;

		if (typeof(field) === 'string')
			deps = {}, deps[field] = value;
		else
			deps = field;

		this.deps.push(deps);
	},

	/**
	   【私有】将 deps 数组转换为 DOM data-depends 格式（cbid 路径）。
	 *
	 * depends() 中用户填写的是相对字段名（如 'proto'），
	 * 此方法将其转换为完整的 DOM 元素 ID 格式：
	 *   'proto' → 'cbid.network.lan.proto'
	 *   'net.lan.proto' → 'cbid.net.lan.proto'（点分格式保留）
	 *   '!reverse'、'!contains' 等特殊 key 原样保留
	 *
	 * @param {string}  section_id - 当前 section ID（用于构造完整路径）
	 * @param {Array}   [deplist]  - 要转换的依赖列表，省略时使用 this.deps
	 * @returns {Array} 转换后的依赖条件数组（可直接用于 data-depends 属性）
	 */
	transformDepList(section_id, deplist) {
		const list = deplist ?? this.deps;
		const deps = [];

		if (Array.isArray(list)) {
			for (let i = 0; i < list.length; i++) {
				const dep = {};

				for (const k in list[i]) {
					if (list[i].hasOwnProperty(k)) {
						if (k.charAt(0) === '!')
							dep[k] = list[i][k];
						else if (k.indexOf('.') !== -1)
							dep['cbid.%s'.format(k)] = list[i][k];
						else
							dep['cbid.%s.%s.%s'.format(
								this.uciconfig ?? this.section.uciconfig ?? this.map.config,
								this.ucisection ?? section_id,
								k
							)] = list[i][k];
					}
				}

				for (const k in dep) {
					if (dep.hasOwnProperty(k)) {
						deps.push(dep);
						break;
					}
				}
			}
		}

		return deps;
	},

	/**
	   【私有】将 keylist/vallist 数组对转换为 {key: val} 的 choices 对象。
	 *
	 * Value/ListValue 等控件调用 value(key, val) 时，key 存入 this.keylist，
	 * val 存入 this.vallist。此方法将两个数组合并为控件渲染所需的 choices 对象。
	 * 若 keylist 为空，返回 null（表示无候选选项，使用纯输入框）。
	 *
	 * @returns {Object<string,*>|null} choices 对象，或 null（无候选选项时）
	 */
	transformChoices() {
		if (!Array.isArray(this.keylist) || this.keylist.length == 0)
			return null;

		const choices = {};

		for (let i = 0; i < this.keylist.length; i++)
			choices[this.keylist[i]] = this.vallist[i];

		return choices;
	},

	/**
	   【私有】检查本 option 的依赖是否满足，并在满足时更新默认值。
	 *
	 * 调用 map.isDependencySatisfied() 判断 this.deps 中的条件，
	 * 若依赖满足则调用 updateDefaultValue() 处理条件默认值（defaults 属性）。
	 *
	 * @param {string} section_id - 当前 section ID
	 * @returns {boolean} 依赖满足时返回 true，否则返回 false
	 */
	checkDepends(section_id) {
		const config_name = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const active = this.map.isDependencySatisfied(this.deps, config_name, section_id);

		if (active)
			this.updateDefaultValue(section_id);

		return active;
	},

	/**
	   【私有】根据条件依赖动态更新 option 的默认值（this.defaults 属性）。
	 *
	 * this.defaults 是一个特殊对象，允许根据其他 option 的值动态切换默认值：
	 *   { '默认值': [依赖条件数组], ... }
	 *
	 *   - 依赖条件数组中的每个对象是一个 AND 条件组（对象内多字段须同时满足）
	 *   - 数组中多个对象之间是 OR 关系（任一对象满足即匹配该默认值）
	 *   - 空数组（[]）表示无条件的兜底默认值（无任何其他条件匹配时使用）
	 *   - 注意：JS 对象 key 必须唯一，不能用重复 key 表示多个默认值 ！
	 *
	   【this.defaults 用法示例】
	 *   o.defaults = {
	 *     '1492': [
	 *       { proto: 'pppoe' },   // proto=pppoe 时默认 1492
	 *       { proto: 'pptp' }     // 或 proto=pptp 时默认 1492（OR）
	 *     ],
	 *     '1500': []              // 兜底：以上条件都不满足时默认 1500
	 *   };
	 *
	 *   // 高级示例：AND 条件（proto=pppoe 且 compress=1 时默认 1488）
	 *   o.defaults = {
	 *     '1488': [{ proto: 'pppoe', compress: '1' }],  // 同一对象内是 AND 关系
	 *     '1492': [{ proto: 'pppoe' }],
	 *     '1500': []
	 *   };
	 *
	 *   // 注意：defaults 只在 UCI 中无值（cfgvalue=null）时生效，
	 *   //        若 UCI 中已有值则优先使用 UCI 的值（不会覆盖已保存的配置）。
	 *
	 * @param {string} section_id - 当前 section ID
	 */
	updateDefaultValue(section_id) {
		if (!L.isObject(this.defaults))
			return;

		const config_name = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const cfgvalue = L.toArray(this.cfgvalue(section_id))[0];
		let default_defval = null;
		let satisfied_defval = null;

		for (const value in this.defaults) {
			if (!this.defaults[value] || this.defaults[value].length == 0) {
				default_defval = value;
				continue;
			}
			else if (this.map.isDependencySatisfied(this.defaults[value], config_name, section_id)) {
				satisfied_defval = value;
				break;
			}
		}

		if (satisfied_defval == null)
			satisfied_defval = default_defval;

		const node = this.map.findElement('id', this.cbid(section_id));
		if (node && node.getAttribute('data-changed') != 'true' && satisfied_defval != null && cfgvalue == null)
			dom.callClassMethod(node, 'setValue', satisfied_defval);

		this.default = satisfied_defval;
	},

	/**
	 * Obtain the internal ID ("cbid") of the element instance.
	 *
	 * Since each form section element may map multiple underlying
	 * configuration sections, the configuration section ID is required to
	 * form a fully qualified ID pointing to the specific element instance
	 * within the given specific section.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @returns {string}
	 * Returns the element ID.
	 */
	cbid(section_id) {
		if (section_id == null)
			L.error('TypeError', 'Section ID required');

		return 'cbid.%s.%s.%s'.format(
			this.uciconfig ?? this.section.uciconfig ?? this.map.config,
			section_id, this.option);
	},

	/**
	 * Load the underlying configuration value.
	 *
	 * The default implementation of this method reads and returns the
	 * underlying UCI option value (or the related JavaScript property for
	 * `JSONMap` instances). It may be overridden by user code to load data
	 * from non-standard sources.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @returns {*|Promise<*>}
	 * Returns the configuration value to initialize the option element with.
	 * The return value of this function is filtered through `Promise.resolve()`
	 * so it may return promises if overridden by user code.
	 */
	load(section_id) {
		if (section_id == null)
			L.error('TypeError', 'Section ID required');

		return this.map.data.get(
			this.uciconfig ?? this.section.uciconfig ?? this.map.config,
			this.ucisection ?? section_id,
			this.ucioption ?? this.option);
	},

	/**
	 * Obtain the underlying `LuCI.ui` element instance.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @return {LuCI.ui.AbstractElement|null}
	 * Returns the `LuCI.ui` element instance or `null` in case the form
	 * option implementation does not use `LuCI.ui` widgets.
	 */
	getUIElement(section_id) {
		const node = this.map.findElement('id', this.cbid(section_id));
		const inst = node ? dom.findClassInstance(node) : null;
		return (inst instanceof ui.AbstractElement) ? inst : null;
	},

	/**
	 * Query the underlying configuration value.
	 *
	 * The default implementation of this method returns the cached return
	 * value of [load()]{@link LuCI.form.AbstractValue#load}. It may be
	 * overridden by user code to obtain the configuration value in a
	 * different way.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @returns {*}
	 * Returns the configuration value.
	 */
	cfgvalue(section_id, set_value) {
		if (section_id == null)
			L.error('TypeError', 'Section ID required');

		if (arguments.length == 2) {
			this.data ??= {};
			this.data[section_id] = set_value;
		}

		return this.data?.[section_id];
	},

	/**
	 * Query the current form input value.
	 *
	 * The default implementation of this method returns the current input
	 * value of the underlying [LuCI.ui]{@link LuCI.ui.AbstractElement} widget.
	 * It may be overridden by user code to handle input values differently.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @returns {*}
	 * Returns the current input value.
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.getValue() : null;
	},

	/**
	 * Obtain a textual input representation.
	 *
	 * The default implementation of this method returns the HTML-escaped
	 * current input value of the underlying
	 * [LuCI.ui]{@link LuCI.ui.AbstractElement} widget. User code or specific
	 * option element implementations may override this function to apply a
	 * different logic, e.g. to return `Yes` or `No` depending on the checked
	 * state of checkbox elements.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @throws {TypeError}
	 * Throws a `TypeError` exception when no `section_id` was specified.
	 *
	 * @returns {string}
	 * Returns the text representation of the current input value.
	 */
	textvalue(section_id) {
		let cval = this.cfgvalue(section_id);

		if (cval == null)
			cval = this.default;

		if (Array.isArray(cval))
			cval = cval.join(' ');

		return (cval != null) ? '%h'.format(cval) : null;
	},

	/**
	 * Apply custom validation logic.
	 *
	 * This method is invoked whenever incremental validation is performed on
	 * the user input, e.g. on keyup or blur events.
	 *
	 * The default implementation of this method does nothing and always
	 * returns `true`. User code may override this method to provide
	 * additional validation logic which is not covered by data type
	 * constraints.
	 *
	 * @abstract
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @param {*} value
	 * The value to validate
	 *
	 * @returns {*}
	 * The method shall return `true` to accept the given value. Any other
	 * return value is treated as a failure, converted to a string and displayed
	 * as an error message to the user.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  validate(section_id, value)                                    │
	 * │  自定义验证逻辑（在 datatype 校验之后执行的业务规则校验）         │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   当用户输入值发生变化时（blur/keyup）触发，用于实现 datatype 无法
	 *   覆盖的业务逻辑验证。默认实现直接返回 true（总是通过）。
	 *
	 *   有两种使用方式：
	 *   1. 将函数赋值给 o.validate 属性（推荐，更简洁）
	 *   2. 在自定义控件子类中覆盖 validate 方法
	 *
	 * 【参数】
	 *   @param {string} section_id  当前 UCI section ID
	 *   @param {*}      value       待验证的当前输入值
	 *
	 * 【返回值】
	 *   true          → 验证通过
	 *   string/Error  → 验证失败，字符串内容作为错误提示显示给用户
	 *
	 * 【方式1：属性赋值（单个验证器）】
	 *
	 *   o = s.option(form.Value, 'password', _('密码'));
	 *   o.validate = function(sid, val) {
	 *     if (val.length < 8)
	 *       return _('密码至少需要 8 位');
	 *     if (!/[A-Z]/.test(val))
	 *       return _('密码需包含至少一个大写字母');
	 *     return true;
	 *   };
	 *
	 * 【方式1：属性赋值（多个验证器数组，串行执行）】
	 *
	 *   o.validate = [
	 *     function(sid, val) {
	 *       return val.length >= 8 || _('密码至少 8 位');
	 *     },
	 *     function(sid, val) {
	 *       return /[0-9]/.test(val) || _('密码需包含数字');
	 *     }
	 *   ];
	 *
	 * 【方式1：使用 section 上下文（读取其他字段的值）】
	 *
	 *   o = s.option(form.Value, 'confirm_pwd', _('确认密码'));
	 *   o.validate = function(sid, val) {
	 *     // 读取同一 section 内 password 字段的当前输入值
	 *     const pwd = this.section.formvalue(sid, 'password');
	 *     if (val !== pwd) return _('两次输入的密码不一致');
	 *     return true;
	 *   };
	 *
	 * 【方式2：子类覆盖方法】
	 *
	 *   const UrlValue = form.Value.extend({
	 *     validate(sid, val) {
	 *       try { new URL(val); return true; }
	 *       catch(e) { return _('请输入有效的 URL'); }
	 *     }
	 *   });
	 *   o = s.option(UrlValue, 'endpoint', _('接口地址'));
	 *
	 * 【与 datatype 的区别】
	 *   datatype  → 格式验证（ip、port、range 等内置规则，实时验证）
	 *   validate  → 业务逻辑验证（跨字段、异步检查、自定义规则）
	 *
	 *   两者可同时使用，datatype 先执行，validate 后执行：
	 *   o.datatype = 'port';               // 先验证是否为合法端口号
	 *   o.validate = function(sid, val) {  // 再验证是否与其他端口冲突
	 *     const otherPort = this.section.formvalue(sid, 'other_port');
	 *     return val !== otherPort || _('端口不能与其他端口相同');
	 *   };
	 *
	 * 【注意】
	 *   - 函数内 this 指向 option 实例本身
	 *   - 验证器在用户每次输入时触发，应避免复杂/同步阻塞操作
	 *   - 不支持返回 Promise（异步验证需通过其他机制实现）
	 */
	validate(section_id, value) {
		return true;
	},

	/**
	   【私有】获取绑定了 section_id 的验证函数，供底层 UI 控件使用。
	 *
	 * 处理两种情况：
	 *   1. this.validate 是函数：返回绑定了 (section_id) 的方法引用
	 *   2. this.validate 是数组：返回串行执行所有验证器的包装函数
	 *      （第一个返回非 true 的验证器结果作为最终结果）
	 *
	 * 通常在 renderWidget() 中调用，将结果传给 ui.Textfield/ui.Select 等控件
	 * 的 validate 选项，实现实时输入验证（blur/keyup 时触发）。
	 *
	 * @param {string} section_id - 当前 section ID
	 * @returns {function} 可直接传给 LuCI.ui 控件 validate 选项的验证函数
	 *
	   【示例：在自定义控件中使用】
	 *   renderWidget(section_id, option_index, cfgvalue) {
	 *     const widget = new ui.Textfield(cfgvalue, {
	 *       validate: this.getValidator(section_id),  // 绑定验证器
	 *       datatype: this.datatype
	 *     });
	 *     return widget.render();
	 *   }
	 */
	getValidator(section_id) {
		if (Array.isArray(this.validate)) {
			const validators = this.validate;
			const element = this;
			return (value) => {
				for (let val of validators) {
					if (typeof(val) === 'function') {
						const result = val.call(element, section_id, value);
						if (result !== true)
							return result;
					}
				}
				return true;
			};
		}
		return L.bind(this.validate, this, section_id);
	},

	/**
	 * Test whether the input value is currently valid.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @returns {boolean}
	 * Returns `true` if the input value currently is valid, otherwise it
	 * returns `false`.
	 */
	isValid(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.isValid() : true;
	},

	/**
	 * Returns the current validation error for this input.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @returns {string}
	 * The validation error at this time
	 */
	getValidationError(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.getValidationError() : '';
	},

	/**
	 * Test whether the option element is currently active.
	 *
	 * An element is active when it is not hidden due to unsatisfied dependency
	 * constraints.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @returns {boolean}
	 * Returns `true` if the option element currently is active, otherwise it
	 * returns `false`.
	 */
	isActive(section_id) {
		const field = this.map.findElement('data-field', this.cbid(section_id));
		return (field != null && !field.classList.contains('hidden'));
	},

	/**
	   【私有】设置 option 的激活（显示）或隐藏状态。
	 *
	 * 通过切换对应 DOM 元素上的 'hidden' CSS 类控制显示/隐藏。
	 * 在 TableSection 中同时处理父 td 的 'inactive' 类（影响行高）。
	 *
	 * @param {string}  section_id - 当前 section ID
	 * @param {boolean} active     - true=显示，false=隐藏
	 * @returns {boolean} 状态确实发生了改变时返回 true，已是目标状态时返回 false
	 */
	setActive(section_id, active) {
		const field = this.map.findElement('data-field', this.cbid(section_id));

		if (field && field.classList.contains('hidden') == active) {
			field.classList[active ? 'remove' : 'add']('hidden');

			if (dom.matches(field.parentNode, '.td.cbi-value-field'))
				field.parentNode.classList[active ? 'remove' : 'add']('inactive');

			return true;
		}

		return false;
	},

	/**
	   【私有】主动触发 UI 控件的验证（在依赖状态变更后刷新校验提示）。
	 *
	 * 调用底层 LuCI.ui 控件的 triggerValidation() 方法，
	 * 使控件重新执行 datatype 和 validate 的校验并更新错误提示样式。
	 *
	 * @param {string} section_id - 当前 section ID
	 * @returns {boolean} 控件当前有效时返回 true
	 */
	triggerValidation(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.triggerValidation() : true;
	},

	/**
	 * Parse the option element input.
	 *
	 * The function is invoked when the `parse()` method has been invoked on
	 * the parent form and triggers input value reading and validation.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @returns {Promise<void>}
	 * Returns a promise resolving once the input value has been read and
	 * validated or rejecting in case the input value does not meet the
	 * validation constraints.
	 */
	parse(section_id) {
		const active = this.isActive(section_id);

		if (active && !this.isValid(section_id)) {
			const title = this.stripTags(this.title).trim();
			const error = this.getValidationError(section_id);

			return Promise.reject(new TypeError(
				`${_('Option "%s" contains an invalid input value.').format(title || this.option)} ${error}`));
		}

		if (active) {
			const cval = this.cfgvalue(section_id);
			const fval = this.formvalue(section_id);

			if (fval == null || fval == '') {
				if (this.rmempty || this.optional) {
					return Promise.resolve(this.remove(section_id));
				}
				else {
					const title = this.stripTags(this.title).trim();

					return Promise.reject(new TypeError(
						_('Option "%s" must not be empty.').format(title || this.option)));
				}
			}
			else if (this.forcewrite || !isEqual(cval, fval)) {
				return Promise.resolve(this.write(section_id, fval));
			}
		}
		else if (!this.retain) {
			return Promise.resolve(this.remove(section_id));
		}

		return Promise.resolve();
	},

	/**
	 * Write the current input value into the configuration.
	 *
	 * This function is invoked upon saving the parent form when the option
	 * element is valid and when its input value has been changed compared to
	 * the initial value returned by
	 * [cfgvalue()]{@link LuCI.form.AbstractValue#cfgvalue}.
	 *
	 * The default implementation simply sets the given input value in the
	 * UCI configuration (or the associated JavaScript object property in
	 * case of `JSONMap` forms). It may be overridden by user code to
	 * implement alternative save logic, e.g. to transform the input value
	 * before it is written.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @param {string|string[]} formvalue
	 * The input value to write.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  write(section_id, formvalue)                                   │
	 * │  将表单输入值写入 UCI 配置缓存（可覆盖以自定义保存逻辑）          │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   在 parse() 确认值有效且发生变化后调用，将用户输入的 formvalue
	 *   写入 UCI 内存缓存（uci.set）。
	 *
	 *   默认实现调用 map.data.set()，可以覆盖以实现：
	 *   - 写入前对值进行变换（格式化、追加后缀等）
	 *   - 同时写入多个 UCI option
	 *   - 写入到不同的 config/section/option
	 *
	 * 【参数】
	 *   @param {string}          section_id  UCI section ID
	 *   @param {string|string[]} formvalue   用户输入的当前值（已通过验证）
	 *
	 * 【使用示例】
	 *
	 *   // 示例1：写入前自动追加 CIDR 前缀长度
	 *   o = s.option(form.Value, 'ipaddr', _('IP 地址'));
	 *   o.datatype = 'ip4addr';
	 *   o.write = function(sid, val) {
	 *     // 若用户只输入了 IP，自动追加 /24
	 *     uci.set('network', sid, 'ipaddr',
	 *       val.indexOf('/') === -1 ? val + '/24' : val);
	 *   };
	 *
	 *   // 示例2：同时写入两个相关 UCI option
	 *   o = s.option(form.Value, 'cidr', _('IP/前缀'));
	 *   o.write = function(sid, val) {
	 *     const parts = val.split('/');
	 *     uci.set('network', sid, 'ipaddr',  parts[0]);
	 *     uci.set('network', sid, 'netmask',
	 *       parts[1] ? prefixToMask(parts[1]) : '255.255.255.0');
	 *   };
	 *
	 *   // 示例3：写入不同的 section（跨 section 保存）
	 *   o = s.option(form.Value, 'ntp_server', _('NTP 服务器'));
	 *   o.write = function(sid, val) {
	 *     uci.set('system', 'ntp', 'server', val.split('\n'));
	 *   };
	 *
	 *   // 示例4：写入时进行类型转换（字符串转数组）
	 *   o = s.option(form.Value, 'dns', _('DNS 服务器'));
	 *   o.write = function(sid, val) {
	 *     // 将空格/逗号分隔的字符串转为 UCI list
	 *     uci.set('network', sid, 'dns',
	 *       val.split(/[\s,]+/).filter(Boolean));
	 *   };
	 *
	 * 【注意】
	 *   - write() 只操作 UCI 内存缓存，不会立即写磁盘（需 uci.save() + uci.apply()）
	 *   - 只有当 formvalue != cfgvalue 时才调用（值未改变时跳过）
	 *   - 若设置了 forcewrite=true，即使值相同也会调用 write()
	 *   - 覆盖 write() 时通常不需要调用 super，除非需要默认写入行为
	 */
	write(section_id, formvalue) {
		return this.map.data.set(
			this.uciconfig ?? this.section.uciconfig ?? this.map.config,
			this.ucisection ?? section_id,
			this.ucioption ?? this.option,
			formvalue);
	},

	/**
	 * Remove the corresponding value from the configuration.
	 *
	 * This function is invoked upon saving the parent form when the option
	 * element has been hidden due to unsatisfied dependencies or when the
	 * user cleared the input value and the option is marked optional.
	 *
	 * The default implementation simply removes the associated option from the
	 * UCI configuration (or the associated JavaScript object property in
	 * case of `JSONMap` forms). It may be overridden by user code to
	 * implement alternative removal logic, e.g. to retain the original value.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  remove(section_id)                                             │
	 * │  从 UCI 配置缓存中删除本 option 的值（可覆盖以自定义删除逻辑）   │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   在以下两种情况下由 parse() 自动调用：
	 *   1. option 因依赖不满足被隐藏（且 retain=false 时）
	 *   2. 用户清空了输入值且 option 是可选的（rmempty=true 或 optional=true）
	 *
	 *   默认实现调用 map.data.unset() 删除对应 UCI 选项。
	 *   若存在其他 option 共享同一 UCI 路径（ucioption 别名），则跳过删除，
	 *   防止误删其他仍处于激活状态的 option 的值。
	 *
	 * 【参数】
	 *   @param {string} section_id  UCI section ID
	 *
	 * 【使用示例】
	 *
	 *   // 示例1：阻止删除（保留 UCI 中的原始值）
	 *   // 等效于设置 o.retain = true，但更灵活
	 *   o = s.option(form.Value, 'metric', _('路由跃点数'));
	 *   o.remove = function(sid) {
	 *     // 什么都不做：即使依赖不满足，也不删除 UCI 中的值
	 *   };
	 *
	 *   // 示例2：删除时同时清理关联的多个 UCI option
	 *   o = s.option(form.Value, 'ipaddr', _('IP 地址'));
	 *   o.remove = function(sid) {
	 *     uci.unset('network', sid, 'ipaddr');
	 *     uci.unset('network', sid, 'netmask');  // 同时删除掩码
	 *     uci.unset('network', sid, 'gateway');  // 同时删除网关
	 *   };
	 *
	 *   // 示例3：删除时重置为特定默认值（而非完全删除）
	 *   o = s.option(form.ListValue, 'proto', _('协议'));
	 *   o.remove = function(sid) {
	 *     uci.set('network', sid, 'proto', 'none');  // 重置为 none 而非删除
	 *   };
	 *
	 * 【与 retain 属性的区别】
	 *   retain=true   → 框架层面完全跳过 remove() 调用（更简洁）
	 *   覆盖 remove() → 可以在"删除"时执行自定义逻辑（更灵活）
	 *
	 * 【注意】
	 *   - remove() 只操作 UCI 内存缓存，不立即写磁盘
	 *   - 若多个 option 共享同一 UCI 路径（ucioption 相同），
	 *     只要有任一处于激活状态，就不会删除（框架自动处理）
	 */
	remove(section_id) {
		const this_cfg = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const this_sid = this.ucisection ?? section_id;
		const this_opt = this.ucioption ?? this.option;

		for (let i = 0; i < this.section.children.length; i++) {
			const sibling = this.section.children[i];

			if (sibling === this || sibling.ucioption == null)
				continue;

			const sibling_cfg = sibling.uciconfig ?? sibling.section.uciconfig ?? sibling.map.config;
			const sibling_sid = sibling.ucisection ?? section_id;
			const sibling_opt = sibling.ucioption ?? sibling.option;

			if (this_cfg != sibling_cfg || this_sid != sibling_sid || this_opt != sibling_opt)
				continue;

			if (!sibling.isActive(section_id))
				continue;

			/* found another active option aliasing the same uci option name,
			 * so we can't remove the value */
			return;
		}

		this.map.data.unset(this_cfg, this_sid, this_opt);
	}
});

/**
 * @class TypedSection
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractSection
 * @hideconstructor
 * @classdesc

 * The `TypedSection` class maps all or - if `filter()` is overridden - a
 * subset of the underlying UCI configuration sections of a given type.

 * Layout wise, the configuration section instances mapped by the section
 * element (sometimes referred to as "section nodes") are stacked beneath
 * each other in a single column, with an optional section remove button next
 * to each section node and a section add button at the end, depending on the
 * value of the `addremove` property.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [section()]{@link LuCI.form.Map#section}.

 * @param {string} section_type
 * The type of the UCI section to map.

 * @param {string} [title]
 * The title caption of the form section element.

 * @param {string} [description]
 * The description text of the form section element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * TypedSection：枚举指定类型的所有 UCI section（最常用的 Section）
 * ════════════════════════════════════════════════════════════

   【作用】
     枚举 UCI 配置中指定类型（type）的所有 section，
     每个 section 渲染为一个独立的配置块（垂直堆叠）。
     是最通用的 Section 类型，适合大多数配置场景。

   【构造函数（通过 map.section() 调用）】
     m.section(form.TypedSection, type, title?, description?)

     type        {string} 要枚举的 UCI section 类型（如 'interface'、'rule'）
     title       {string} section 区域标题（可选）
     description {string} section 区域描述（可选）

 * ══════════════════ 关键属性说明 ══════════════════

     addremove   {boolean}  默认 false
       true：显示"添加"和"删除"按钮，允许用户动态增删 section 实例
       false：只显示已有的 section，不允许增删

     anonymous   {boolean}  默认 false
       true：添加时创建匿名 section（用户不需要输入名称，系统自动生成）
       false：添加时要求用户输入 section 名称（命名 section）
       注意：anonymous=true 时 section 标题不显示 section 名称

     hidetitle   {boolean}  默认 false
       true：不渲染 section 的标题（h3）

     tabbed      {boolean}  默认 false
       true：将多个 section 实例以 Tab 方式横向显示
       （与 Map.tabbed 不同：这里是 section 实例之间的 Tab）

     addbtntitle {string|function}  默认 _('Add')
       自定义"添加"按钮的文字。函数形式将被调用获取动态文字。

     delbtntitle {string|function}  默认 _('Delete')
       自定义"删除"按钮的文字。函数形式：(section_id) => string

     uciconfig   {string}  默认 null（继承 Map 的配置名）
       覆盖此 section 读取 section ID 的配置名。

   【filter() 方法：过滤显示的 section】
     filter 是一个可覆盖的方法，用于过滤哪些 section 显示，哪些跳过。
     默认实现返回 true（显示所有 section）。
     覆盖示例：
       s.filter = function(section_id) {
         // 只显示 ifname 包含 'eth' 的接口
         return (uci.get('network', section_id, 'ifname') || '').includes('eth');
       };

   ──────────────────────────────────────────────────────────
   【示例1：最基本用法（显示所有防火墙规则）】

     var s = m.section(form.TypedSection, 'rule', _('防火墙规则'));
     s.addremove = true;
     s.anonymous = true;

     var o = s.option(form.Value, 'name', _('规则名称'));
     o.optional = true;

     o = s.option(form.ListValue, 'target', _('动作'));
     o.value('ACCEPT', _('允许'));
     o.value('DROP',   _('拒绝'));
     o.value('REJECT', _('拒绝并回应'));

   ──────────────────────────────────────────────────────────
   【示例2：命名 section（用户需要输入名称）】

     var s = m.section(form.TypedSection, 'domain', _('域名列表'));
     s.addremove = true;
     s.anonymous = false;  // 创建时用户需输入 section 名（如 domain 名）

     var o = s.option(form.Value, 'address', _('IP 地址'));

   ──────────────────────────────────────────────────────────
   【示例3：Tab 式多实例（每个 section 实例是一个 Tab）】

     var s = m.section(form.TypedSection, 'interface', _('接口配置'));
     s.addremove = true;
     s.tabbed = true;  // wan、lan 等接口各占一个 Tab

   ──────────────────────────────────────────────────────────
   【示例4：带过滤器（只显示 WAN 类型的接口）】

     var s = m.section(form.TypedSection, 'interface', _('WAN 接口'));
     s.filter = function(section_id) {
       return uci.get('network', section_id, 'proto') !== 'none';
     };

   ──────────────────────────────────────────────────────────
   【示例5：自定义按钮文字】

     var s = m.section(form.TypedSection, 'peer', _('WireGuard 对端'));
     s.addremove = true;
     s.addbtntitle = _('添加对端');
     s.delbtntitle = function(sid) {
       return _('删除 %s').format(uci.get('wg', sid, 'description') || sid);
     };

   ──────────────────────────────────────────────────────────
   【示例6：在 option 中使用 tab 分组（在 TypedSection 内分 Tab）】

     var s = m.section(form.TypedSection, 'interface');

     s.tab('general',  _('常规'));
     s.tab('advanced', _('高级'));
     s.tab('firewall', _('防火墙'));

     s.taboption('general',  form.Value,    'proto',   _('协议'));
     s.taboption('general',  form.Value,    'ipaddr',  _('IP 地址'));
     s.taboption('advanced', form.Value,    'mtu',     _('MTU'));
     s.taboption('firewall', form.ListValue,'zone',    _('防火墙区域'));
 */
const CBITypedSection = CBIAbstractSection.extend(/** @lends LuCI.form.TypedSection.prototype */ {
	__name__: 'CBI.TypedSection',

	/**
	 * If set to `true`, the user may add or remove instances from the form
	 * section widget, otherwise only pre-existing sections may be edited.
	 * The default is `false`.
	 *
	 * @name LuCI.form.TypedSection.prototype#addremove
	 * @type boolean
	 * @default false
	 */

	/**
	 * If set to true, the title caption of the form section element which
	 * is normally rendered before the start of the section content will
	 * not be rendered in the UI. The default is false, meaning that the
	 * title is rendered.
	 *
	 * @name LuCI.form.TypedSection.prototype#hidetitle
	 * @type boolean
	 * @default false
	 */

	/**
	 * If set to `true`, mapped section instances are treated as anonymous
	 * UCI sections, which means that section instance elements will be
	 * rendered without a title element and that no name is required when adding
	 * new sections. The default is `false`.
	 *
	 * @name LuCI.form.TypedSection.prototype#anonymous
	 * @type boolean
	 * @default false
	 */

	/**
	 * When set to `true`, instead of rendering section instances one below
	 * another, treat each instance as a separate tab pane and render a tab menu
	 * at the top of the form section element, allowing the user to switch
	 * among instances. The default is `false`.
	 *
	 * @name LuCI.form.TypedSection.prototype#tabbed
	 * @type boolean
	 * @default false
	 */

	/**
	 * Override the caption used for the section add button at the bottom of
	 * the section form element. Set to a string, it will be used as-is.
	 * Set to a function, the function will be invoked and its return value
	 * is used as a caption, after converting it to a string. If this property
	 * is not set, the default is `Add`.
	 *
	 * @name LuCI.form.TypedSection.prototype#addbtntitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the caption used for the section delete button at the bottom of
	 * the section form element. Set to a string, it will be used as-is.
	 * Set to a function, the function will be invoked and its return value
	 * is used as a caption, after converting it to a string. If this property
	 * is not set, the default is `Delete`.
	 *
	 * @name LuCI.form.TypedSection.prototype#delbtntitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the UCI configuration name to read the section IDs from. By
	 * default, the configuration name is inherited from the parent `Map`.
	 * By setting this property, a deviating configuration may be specified.
	 * The default of `null` means inherit from the parent form.
	 *
	 * @name LuCI.form.TypedSection.prototype#uciconfig
	 * @type string
	 * @default null
	 */

	/**
	 * 返回本 section 覆盖的所有 UCI section ID 列表（已应用 filter 过滤）。
	 *
	 * 调用 uci.sections() 获取指定类型的所有 section，
	 * 提取 .name 字段，再通过 filter() 方法过滤，返回最终列表。
	 * 渲染时按此顺序渲染 section 实例。
	 *
	 * @override
	 * @returns {string[]} 过滤后的 UCI section ID 数组
	 */
	cfgsections() {
		return this.map.data.sections(this.uciconfig ?? this.map.config, this.sectiontype)
			.map((s) => { return s['.name'] })
			.filter(L.bind(this.filter, this));
	},

	/**
	   【私有】处理"添加 section"按钮点击事件。
	 *
	 * 调用 uci.add() 创建新 section，然后触发 map.save() 保存并重新渲染。
	 * anonymous=true 时 name 为 undefined（系统自动生成 ID）；
	 * anonymous=false 时 name 为用户在输入框中填写的名称。
	 *
	 * @param {Event}  ev   - 点击事件
	 * @param {string} name - 新 section 的名称（命名 section 时由输入框提供）
	 * @returns {Promise<void>}
	 */
	handleAdd(ev, name) {
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.add(config_name, this.sectiontype, name);
		return this.map.save(null, true);
	},

	/**
	   【私有】处理"删除 section"按钮点击事件。
	 *
	 * 调用 uci.remove() 从配置中删除指定 section，然后触发 map.save() 保存重渲。
	 *
	 * @param {string} section_id - 要删除的 UCI section ID
	 * @param {Event}  ev         - 点击事件
	 * @returns {Promise<void>}
	 */
	handleRemove(section_id, ev) {
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.remove(config_name, section_id);
		return this.map.save(null, true);
	},

	/**
	   【私有】渲染 section 底部的"添加"按钮区域。
	 *
	 * anonymous=true：渲染单个"添加"按钮（无需输入名称）
	 * anonymous=false：渲染"名称输入框 + 添加按钮"组合（用户需填写 section 名称）
	 *   - 输入框为空时按钮禁用，并实时验证输入是否符合 uciname 格式
	 *
	 * @param {string} [extra_class] - 额外追加到容器元素的 CSS 类名
	 * @returns {Node} 添加区域的 DOM 节点（addremove=false 时返回空 DocumentFragment）
	 */
	renderSectionAdd(extra_class) {
		if (!this.addremove)
			return E([]);

		const createEl = E('div', { 'class': 'cbi-section-create' });
		const config_name = this.uciconfig ?? this.map.config;
		const btn_title = this.titleFn('addbtntitle');

		if (extra_class != null)
			createEl.classList.add(extra_class);

		if (this.anonymous) {
			createEl.appendChild(E('button', {
				'class': 'cbi-button cbi-button-add',
				'title': btn_title ?? _('Add'),
				'click': ui.createHandlerFn(this, 'handleAdd'),
				'disabled': this.map.readonly || null
			}, [ btn_title ?? _('Add') ]));
		}
		else {
			const nameEl = E('input', {
				'type': 'text',
				'class': 'cbi-section-create-name',
				'disabled': this.map.readonly || null
			});

			dom.append(createEl, [
				E('div', {}, nameEl),
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'title': btn_title ?? _('Add'),
					'click': ui.createHandlerFn(this, (ev) => {
						if (nameEl.classList.contains('cbi-input-invalid'))
							return;

						return this.handleAdd(ev, nameEl.value);
					}),
					'disabled': this.map.readonly || true
				}, [ btn_title ?? _('Add') ])
			]);

			if (this.map.readonly !== true) {
				ui.addValidator(nameEl, 'uciname', true, (v) => {
					const button = createEl.querySelector('.cbi-section-create > .cbi-button-add');
					if (v !== '') {
						button.disabled = null;
						return true;
					}
					else {
						button.disabled = true;
						return _('Expecting: %s').format(_('non-empty value'));
					}
				}, 'blur', 'keyup');
			}
		}

		return createEl;
	},

	/**
	   【私有】渲染 section 无内容时的占位提示文字。
	 *
	 * 当 cfgsections() 返回空数组（配置中没有该类型的 section）时调用，
	 * 渲染一段斜体提示文字："This section contains no values yet"。
	 * 可在子类中覆盖此方法以自定义空状态提示。
	 *
	 * @returns {Node} 占位提示节点（em 元素）
	 */
	renderSectionPlaceholder() {
		return E('em', _('This section contains no values yet'));
	},

	/**
	   【私有】将渲染完成的各 section 节点组装为最终的 section DOM 结构。
	 *
	 * 结构：div.cbi-section
	 *         ├── h3（标题，anonymous=false 时为 section 名称大写）
	 *         ├── div.cbi-section-descr（描述，若有）
	 *         ├── div.cbi-section-remove（删除按钮，addremove=true 时）
	 *         ├── div.cbi-section-node（section 内容节点，含 option 控件）
	 *         └── div.cbi-section-create（添加按钮区域）
	 *
	 * @param {string[]}      cfgsections - UCI section ID 数组
	 * @param {Array<Node>}   nodes       - 各 section 渲染结果（与 cfgsections 一一对应）
	 * @returns {Node} 完整的 section 容器节点
	 */
	renderContents(cfgsections, nodes) {
		const section_id = null;
		const config_name = this.uciconfig ?? this.map.config;

		const sectionEl = E('div', {
			'id': 'cbi-%s-%s'.format(config_name, this.sectiontype),
			'class': 'cbi-section',
			'data-tab': (this.map.tabbed && !this.parentoption) ? this.sectiontype : null,
			'data-tab-title': (this.map.tabbed && !this.parentoption) ? this.title || this.sectiontype : null
		});

		if (this.title != null && this.title != '' && !this.hidetitle)
			sectionEl.appendChild(E('h3', {}, this.title));

		if (this.description != null && this.description != '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		for (let i = 0; i < nodes.length; i++) {
			if (this.addremove) {
				const rem_btn_title = this.titleFn('delbtntitle', section_id);
				sectionEl.appendChild(
					E('div', { 'class': 'cbi-section-remove right' },
						E('button', {
							'class': 'cbi-button',
							'name': 'cbi.rts.%s.%s'.format(config_name, cfgsections[i]),
							'data-section-id': cfgsections[i],
							'click': ui.createHandlerFn(this, 'handleRemove', cfgsections[i]),
							'disabled': this.map.readonly || null
						}, [ rem_btn_title ?? _('Delete') ])));
			}

			if (!this.anonymous)
				sectionEl.appendChild(E('h3', cfgsections[i].toUpperCase()));

			sectionEl.appendChild(E('div', {
				'id': 'cbi-%s-%s'.format(config_name, cfgsections[i]),
				'class': this.tabs
					? 'cbi-section-node cbi-section-node-tabbed' : 'cbi-section-node',
				'data-section-id': cfgsections[i]
			}, nodes[i]));
		}

		if (nodes.length == 0)
			sectionEl.appendChild(this.renderSectionPlaceholder());

		sectionEl.appendChild(this.renderSectionAdd());

		dom.bindClassInstance(sectionEl, this);

		return sectionEl;
	},

	/** @override */
	render() {
		const cfgsections = this.cfgsections();
		const renderTasks = [];

		for (let i = 0; i < cfgsections.length; i++)
			renderTasks.push(this.renderUCISection(cfgsections[i]));

		return Promise.all(renderTasks).then(this.renderContents.bind(this, cfgsections));
	}
});

/**
 * @class TableSection
 * @memberof LuCI.form
 * @augments LuCI.form.TypedSection
 * @hideconstructor
 * @classdesc

 * The `TableSection` class maps all or - if `filter()` is overridden - a
 * subset of the underlying UCI configuration sections of a given type.

 * Layout wise, the configuration section instances mapped by the section
 * element (sometimes referred to as "section nodes") are rendered as rows
 * within an HTML table element, with an optional section remove button in the
 * last column and a section add button below the table, depending on the
 * value of the `addremove` property.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [section()]{@link LuCI.form.Map#section}.

 * @param {string} section_type
 * The type of the UCI section to map.

 * @param {string} [title]
 * The title caption of the form section element.

 * @param {string} [description]
 * The description text of the form section element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * TableSection：表格形式展示多个 Section（适合列表型配置）
 * ════════════════════════════════════════════════════════════

   【作用】
     继承自 TypedSection，将多个 UCI section 以 HTML 表格形式紧凑展示：
     - 每行代表一个 UCI section 实例
     - 每列代表一个 option 字段
     - 最右列（可选）显示操作按钮（编辑/删除/排序）
     适合配置项较少、需要一览多条记录的场景。

   【构造函数（通过 map.section() 调用）】
     m.section(form.TableSection, type, title?, description?)

   【关键属性（除继承自 TypedSection 的外）】

     sortable    {boolean}  默认 false
       true：在每行右侧显示上下排序箭头按钮，允许用户手动调整顺序

     extedit     {string|function}  默认 null
       设置后，每行右侧显示"编辑"按钮，点击跳转到指定 URL。
       可以是字符串 URL，也可以是 (section_id) => URL 的函数。
       适合配置项很多需要单独页面编辑的场景。

     modaltitle  {string|function}  默认 null
       设置后，每行点击时弹出模态框进行编辑（而非跳转页面）。
       在模态框中显示 option 的完整标题和描述。

     rowactions  {boolean}  默认 true
       false：隐藏每行右侧的操作按钮列

     nodescriptions {boolean}  默认 false
       true：不显示 option 的描述文字（节省表格空间）

     max_cols    {number}  默认 null
       限制最大列数（超出部分的 option 只在模态框中显示）

   ──────────────────────────────────────────────────────────
   【示例1：DHCP 静态租约列表（最常见的 TableSection 用法）】

     var s = m.section(form.TableSection, 'host', _('DHCP 静态租约'));
     s.addremove = true;
     s.anonymous = true;
     s.nodescriptions = true;

     var o = s.option(form.Value, 'name',  _('主机名'));
     o.width = '20%';

     o = s.option(form.Value, 'mac', _('MAC 地址'));
     o.datatype = 'macaddr';
     o.width = '20%';

     o = s.option(form.Value, 'ip', _('IP 地址'));
     o.datatype = 'ip4addr';
     o.width = '20%';

     o = s.option(form.Flag, 'dns', _('DNS 注册'));

   ──────────────────────────────────────────────────────────
   【示例2：可排序的路由表列表】

     var s = m.section(form.TableSection, 'route', _('静态路由'));
     s.addremove = true;
     s.anonymous = true;
     s.sortable  = true;  // 显示排序按钮

     s.option(form.Value, 'interface', _('接口'));
     s.option(form.Value, 'target',    _('目标网络'));
     s.option(form.Value, 'gateway',   _('网关'));
     s.option(form.Value, 'metric',    _('度量值'));

   ──────────────────────────────────────────────────────────
   【示例3：使用 extedit 跳转到详情编辑页】

     var s = m.section(form.TableSection, 'interface', _('网络接口'));
     // 点击编辑按钮跳转到接口详情页
     s.extedit = function(sid) {
       return L.url('admin/network/interfaces', 'iface', sid);
     };

     // 表格只显示概要信息
     s.option(form.DummyValue, 'proto',   _('协议'));
     s.option(form.DummyValue, 'ipaddr',  _('IP 地址'));
     s.option(form.DummyValue, 'ifname',  _('物理接口'));

   ──────────────────────────────────────────────────────────
   【示例4：使用 modaltitle 弹框编辑（适合字段较多但不需要单独页面）】

     var s = m.section(form.TableSection, 'rule', _('防火墙规则'));
     s.addremove  = true;
     s.anonymous  = true;
     s.modaltitle = _('编辑防火墙规则');  // 弹出模态框编辑

     // 表格列显示的字段（宽度受限，显示关键信息）
     s.option(form.Value,    'name',   _('名称'));
     s.option(form.ListValue,'target', _('动作')).value('ACCEPT').value('DROP');

     // 模态框中才显示的详细字段（modalonly = true）
     var o = s.option(form.Value, 'src',      _('源区域'));
     o.modalonly = true;
     o = s.option(form.Value, 'dest',     _('目标区域'));
     o.modalonly = true;
     o = s.option(form.Value, 'src_ip',   _('源 IP'));
     o.modalonly = true;
     o = s.option(form.Value, 'dest_port',_('目标端口'));
     o.modalonly = true;
 */
const CBITableSection = CBITypedSection.extend(/** @lends LuCI.form.TableSection.prototype */ {
	__name__: 'CBI.TableSection',

	/**
	 * sectiontitle：覆盖表格第一列（section 名称列）中每行的标题文字。
	 *
	 * 默认值（null）：使用 UCI section 名称本身（如 'lan'、'rule0'）。
	 * 字符串模式：作为 String.format() 模板，%s 替换为 section 名称。
	 *   示例：s.sectiontitle = _('接口 %s'); → 显示"接口 lan"
	 * 函数模式：(section_id) => string，返回该行的标题文字。
	 *   示例：s.sectiontitle = sid => uci.get('network', sid, 'proto') || sid;
	 *
	   【常见用法】在 anonymous=true 时隐藏 section ID，显示更友好的名称：
	 *   s.anonymous    = true;
	 *   s.sectiontitle = false;  // 不显示名称列（完全匿名）
	 *
	 * @name LuCI.form.TableSection.prototype#sectiontitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the per-section instance title caption shown in the first
	 * column of the table unless `anonymous` is set to true. Set to a
	 * string, it will be used as a `String.format()` pattern with the name of
	 * the underlying UCI section as the first argument. Set to a function, the
	 * function will be invoked with the section name as the first argument and
	 * its return value used as a caption, after converting it to a string.
	 * If this property is not set, the default is the name of the underlying
	 * UCI configuration section.
	 *
	 * @name LuCI.form.TableSection.prototype#sectiontitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the per-section instance modal popup title caption shown when
	 * clicking the `More…` button in a section specifying `max_cols`. Set
	 * to a string, it will be used as a `String.format()` pattern with the name
	 * of the underlying UCI section as the first argument. Set to a function,
	 * the function will be invoked with the section name as the first argument, and
	 * its return value is used as a caption after converting it to a string.
	 * If this property is not set, the default is the name of the underlying
	 * UCI configuration section.
	 *
	 * @name LuCI.form.TableSection.prototype#modaltitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * actionstitle：自定义操作按钮列（最右列）表头的文字。
	 *
	 * 默认（null）：操作列表头为空白。
	 * 字符串：直接作为表头文字。
	 * 函数：(has_action) => string，根据是否有操作按钮动态返回文字。
	 *
	   【使用示例】
	 *   s.actionstitle = _('操作');
	 *
	 * @name LuCI.form.TableSection.prototype#actionstitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Set a custom text for the actions column header row when actions buttons
	 * are present.
	 *
	 * @name LuCI.form.TableSection.prototype#actionstitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * max_cols：限制表格最大显示列数。
	 *
	 * 默认（null）：每个 option 对应一列，全部显示。
	 * 设为正整数 N：只显示前 N 列，超出部分在最后一列显示"更多…"按钮，
	 *   点击后弹出模态框显示所有 option（NamedSection 风格）。
	 *
	 * 与 modalonly 配合使用：
	 *   - max_cols 控制表格列数（哪些列显示在表格中）
	 *   - modalonly=true 的 option 不计入 max_cols（只在模态框中出现）
	 *
	   【使用示例】
	 *   s.max_cols = 4;  // 只在表格中显示4列，其他在"更多…"模态框中
	 *
	 * @name LuCI.form.TableSection.prototype#max_cols
	 * @type number
	 * @default null
	 */

	/**
	 * Specify a maximum amount of columns to display. By default, one table
	 * column is rendered for each child option of the form section element.
	 * When this option is set to a positive number, then no more columns than
	 * the given amount are rendered. When the number of child options exceeds
	 * the specified amount, a `More…` button is rendered in the last column,
	 * opening a modal dialog presenting all options elements in `NamedSection`
	 * style when clicked.
	 *
	 * @name LuCI.form.TableSection.prototype#max_cols
	 * @type number
	 * @default null
	 */

	/**
	 * rowcolors：启用交替行颜色（斑马纹效果）。
	 *
	 * true：奇偶行分别添加 cbi-rowstyle-1/cbi-rowstyle-2 CSS 类。
	 * 实际显示效果取决于主题 CSS 是否定义了这两个样式类。
	 * bootstrap 等主题支持此效果，其他主题可能无视。
	 *
	 * @name LuCI.form.TableSection.prototype#rowcolors
	 * @type boolean
	 * @default false
	 */

	/**
	 * Set to `true`, alternating `cbi-rowstyle-1` and `cbi-rowstyle-2` CSS
	 * classes are added to the table row elements. Not all LuCI themes
	 * implement these row style classes. The default is `false`.
	 *
	 * @name LuCI.form.TableSection.prototype#rowcolors
	 * @type boolean
	 * @default false
	 */

	/**
	 * cloneable：启用克隆按钮，允许用户复制已有的 section 实例。
	 *
	 * true：每行操作列中添加"复制"按钮，点击后立即在该行后面
	 *   插入一个相同配置的新 section（通过 handleClone 实现）。
	 * 新 section 与原 section 拥有相同的所有 option 值，
	 * 用户可以在新行中修改需要改变的部分。
	 *
	   【使用场景】规则列表、端口映射等需要"以现有条目为模板"新建的场景。
	 *
	 * @name LuCI.form.TypedSection.prototype#cloneable
	 * @type boolean
	 * @default false
	 */

	/**
	 * Set to `true`, a clone button is added to the button column, allowing
	 * the user to clone section instances mapped by the section form element.
	 * The default is `false`.
	 *
	 * @name LuCI.form.TypedSection.prototype#cloneable
	 * @type boolean
	 * @default false
	 */

	/**
	 * clonebtntitle：自定义克隆按钮的显示文字。
	 *
	 * 默认（null）：显示 _('Clone') 翻译文字。
	 * 字符串：直接使用该字符串。
	 * 函数：() => string，动态返回按钮文字。
	 *
	 * @name LuCI.form.TypedSection.prototype#clonebtntitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the caption used for the section clone button at the bottom of
	 * the section form element. Set to a string, it will be used as-is.
	 * Set to a function, the function will be invoked and its return value
	 * is used as a caption, after converting it to a string. If this property
	 * is not set, the default is `Clone`.
	 *
	 * @name LuCI.form.TypedSection.prototype#clonebtntitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Enables a per-section instance row `Edit` button which triggers a certain
	 * action when clicked. Set to a string, the string value is used
	 * as a `String.format()` pattern with the name of the underlying UCI section
	 * as the first format argument. The result is then interpreted as a URL which
	 * LuCI will navigate to when the user clicks the edit button.
	 *
	 * If set to a function, this function will be registered as a click event
	 * handler on the rendered edit button, receiving the section instance
	 * name as the first and the DOM click event as the second argument.
	 *
	 * @name LuCI.form.TableSection.prototype#extedit
	 * @type string|function
	 * @default null
	 */

	/**
	 * filterrow：启用表格列过滤功能（搜索栏）。
	 *
	 * true：在表头行下方添加一行过滤输入框（每列一个），
	 *   用户输入时实时过滤匹配的行（大小写敏感，部分匹配）。
	 * 过滤条件是累加的（AND 逻辑）：所有列的过滤条件须同时满足才显示该行。
	 * 需要在 LuCI 全局设置中启用 tablefilters（uci.get('luci','main','tablefilters')）。
	 *
	 * 特殊处理：
	 *   - 复选框（Flag）列：过滤框只接受 '0' 或 '1'（宽度受限）
	 *   - 下拉框（ListValue）列：匹配选中选项的文字
	 *   - 操作列右侧显示"重置"按钮，清空所有过滤条件
	 *
	   【使用示例】
	 *   s.filterrow = true;  // 启用过滤行（同时需路由器 luci.main.tablefilters=1）
	 *
	 * @name LuCI.form.TableSection.prototype#filterrow
	 * @type boolean
	 * @default null
	 */

	/**
	 * Optional table filtering for table sections.
	 *
	 * Set `filterrow` to `true` to display a filter header row in the generated
	 * table with per-column text fields to search for string matches in the
	 * column. The filter row appears after the titles row.
	 *
	 * The filters work cumulatively: text in each field shall match
	 * an entry for the row to be displayed. The results are filtered live.
	 * Matching is case-sensitive, and partial, i.e. part or all of the result
	 * includes the search string.
	 *
	 * The filter fields assume the placeholder text `Filter ` suffixed with
	 * the column name, to ease correlation of filter fields to their corresponding
	 * column entries on narrow displays which might fold the columns over
	 * multiple lines.
	 *
	 * @name LuCI.form.TableSection.prototype#filterrow
	 * @type boolean
	 * @default null
	 */

	/**
	 * footer：在表格底部添加汇总行或自定义内容。
	 *
	 * 支持两种形式：
	 *
	   【形式1：字符串数组】
	 *   每个字符串对应一列的内容（从左到右）：
	 *   - 第一项对应名称列（anonymous=false 时）
	 *   - 后续项对应各 option 列
	 *   - 最后一项（可选）对应操作列
	 *   示例：
	 *     s.footer = [
	 *       _('合计'),         // 名称列
	 *       '—',              // mac 列
	 *       computeTotalIPs() // ip 列汇总
	 *     ];
	 *
	   【形式2：函数】
	 *   (has_action) => Node | null
	 *   返回完整的 <tr> 节点或任意 DOM 节点（直接插入 tfoot 中）。
	 *   has_action：是否有操作按钮列（用于决定是否需要空操作列单元格）。
	 *   示例：
	 *     s.footer = function(has_action) {
	 *       return E('tr', { class: 'tr' }, [
	 *         E('td', { class: 'td', colspan: '99' },
	 *           E('em', _('共 %d 条记录').format(totalCount)))
	 *       ]);
	 *     };
	 *
	 * @name LuCI.form.TableSection.prototype#footer
	 * @type string[]|function
	 * @default E([])（空节点，不显示页脚）
	 */

	/**
	 * Optional footer row for table sections.
	 *
	 * Set `footer` to one of:
	 *  - a function that returns a table row (`tr`) or node `E('...')`
	 *  - an array of string cell contents (first entry maps to the name column
	 * if present).
	 *
	 * This is useful for providing sum totals, extra function buttons or extra
	 * space.
	 *
	 * The default implementation returns an empty node.
	 *
	 * @name LuCI.form.TableSection.prototype#footer
	 * @type string[]|function
	 * @default E([])
	 */

	/**
	 * Set to `true`, a sort button is added to the last column, allowing
	 * the user to reorder the section instances mapped by the section form
	 * element.
	 *
	 * @name LuCI.form.TableSection.prototype#sortable
	 * @type boolean
	 * @default false
	 */

	/**
	 * Set to `true`, the header row with the descriptions of options will
	 * not be displayed. By default, the row of descriptions is automatically displayed
	 * when at least one option has a description.
	 *
	 * @name LuCI.form.TableSection.prototype#nodescriptions
	 * @type boolean
	 * @default false
	 */

	/**
	 * TableSection 不支持 Tab 分组（选项只能在表格列中平铺显示）。
	 *
	 * 若需要 Tab 功能请改用 GridSection（支持 taboption 将字段放入展开面板的 Tab）。
	 * 在 TableSection 上调用 tab() 会直接抛出异常，这是有意的设计。
	 *
	 * @override
	 * @throws {string} 始终抛出 'Tabs are not supported by TableSection'
	 *
	   【迁移建议】
	 *   // 错误：TableSection 不支持 tab
	 *   var s = m.section(form.TableSection, 'rule');
	 *   s.tab('basic', '基本');       // ← 会抛出异常！
	 *   s.taboption('basic', ...);    // ← 同上
	 *
	 *   // 正确：换用 GridSection
	 *   var s = m.section(form.GridSection, 'rule');
	 *   s.tab('basic', '基本');       // ← 正常工作
	 *   s.taboption('basic', ...);    // ← 正常工作
	 */
	tab() {
		throw 'Tabs are not supported by TableSection';
	},


	/**
	   【私有】处理"克隆"按钮点击事件，复制指定 section 并立即保存。
	 *
	 * 调用 uci.clone() 在内存中创建 section 的副本，
	 * put_next=true 时新 section 紧接在原 section 后面，
	 * 最后调用 map.save() 提交并重新渲染。
	 *
	 * @param {string}  section_id - 要克隆的源 section ID
	 * @param {boolean} put_next   - true=克隆到原 section 的下一位；false=追加到末尾
	 * @param {string}  [name]     - 新 section 的名称；省略则使用自动生成的匿名 ID
	 * @returns {Promise<void>}
	 */
	handleClone(section_id, put_next, name) {
		let config_name = this.uciconfig || this.map.config;

		this.map.data.clone(config_name, this.sectiontype, section_id, put_next, name);
		return this.map.save(null, true);
	},

	/** @private */
	renderContents(cfgsections, nodes) {
		const section_id = null;
		const config_name = this.uciconfig ?? this.map.config;
		const max_cols = this.max_cols ?? this.children.length;
		const cloneable = this.cloneable;
		const has_more = max_cols < this.children.length;
		const drag_sort = this.sortable && !('ontouchstart' in window);
		const touch_sort = this.sortable && ('ontouchstart' in window);

		const sectionEl = E('div', {
			'id': 'cbi-%s-%s'.format(config_name, this.sectiontype),
			'class': 'cbi-section cbi-tblsection',
			'data-tab': (this.map.tabbed && !this.parentoption) ? this.sectiontype : null,
			'data-tab-title': (this.map.tabbed && !this.parentoption) ? this.title || this.sectiontype : null
		});

		const tableEl = E('table', {
			'class': 'table cbi-section-table'
		});

		const theadEl = E('thead', {
			'class': 'thead cbi-section-thead'
		});

		const tbodyEl = E('tbody', {
			'class': 'tbody cbi-section-tbody'
		});

		const tfootEl = E('tfoot', {
			'class': 'tfoot cbi-section-tfoot'
		});

		if (this.title != null && this.title != '' && !this.hidetitle)
			sectionEl.appendChild(E('h3', {}, this.title));

		if (this.description != null && this.description != '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		theadEl.appendChild(this.renderHeaderRows(false));

		if(theadEl.hasChildNodes())
			tableEl.appendChild(theadEl);

		for (let i = 0; i < nodes.length; i++) {
			let sectionname = this.titleFn('sectiontitle', cfgsections[i]);

			if (sectionname == null)
				sectionname = cfgsections[i];

			const trEl = E('tr', {
				'id': 'cbi-%s-%s'.format(config_name, cfgsections[i]),
				'class': 'tr cbi-section-table-row',
				'data-sid': cfgsections[i],
				'dragover': drag_sort ? L.bind(this.handleDragOver, this) : null,
				'dragenter': drag_sort ? L.bind(this.handleDragEnter, this) : null,
				'dragleave': drag_sort ? L.bind(this.handleDragLeave, this) : null,
				'dragend': drag_sort ? L.bind(this.handleDragEnd, this) : null,
				'drop': drag_sort ? L.bind(this.handleDrop, this) : null,
				'touchend': touch_sort ? L.bind(this.handleTouchEnd, this) : null,
				'data-title': (sectionname && (!this.anonymous || this.sectiontitle)) ? sectionname : null,
				'data-section-id': cfgsections[i]
			});

			if (this.extedit || this.rowcolors)
				trEl.classList.add(!(tbodyEl.childNodes.length % 2)
					? 'cbi-rowstyle-1' : 'cbi-rowstyle-2');

			for (let j = 0; j < max_cols && nodes[i].firstChild; j++)
				trEl.appendChild(nodes[i].firstChild);

			trEl.appendChild(this.renderRowActions(cfgsections[i], has_more ? _('More…') : null));
			tbodyEl.appendChild(trEl);
		}

		if (nodes.length == 0)
			tbodyEl.appendChild(E('tr', { 'class': 'tr cbi-section-table-row placeholder' },
				E('td', { 'class': 'td' }, this.renderSectionPlaceholder())));

		tableEl.appendChild(tbodyEl);

		tfootEl.appendChild(this.renderFooterRows(false));

		if (tfootEl.hasChildNodes())
			tableEl.appendChild(tfootEl);

		sectionEl.appendChild(tableEl);

		setTimeout(() => { try { this.stabilizeActionColumnWidth(tableEl); } catch (e) {} }, 0);

		sectionEl.appendChild(this.renderSectionAdd('cbi-tblsection-create'));

		dom.bindClassInstance(sectionEl, this);

		return sectionEl;
	},

	/** @private */
	renderHeaderRows(has_action) {
		let has_titles = false;
		let has_descriptions = false;
		const max_cols = this.max_cols ?? this.children.length;
		const has_more = max_cols < this.children.length;
		const anon_class = (!this.anonymous || this.sectiontitle) ? 'named' : 'anonymous';
		const tableFilter = uci.get('luci', 'main', 'tablefilters') || false;
		const trEls = E([]);

		for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
			if (opt.modalonly)
				continue;

			has_titles = has_titles || !!opt.title;
			has_descriptions = has_descriptions || !!opt.description;
		}

		if (has_titles) {
			const trEl = E('tr', {
				'class': `tr cbi-section-table-titles ${anon_class}`,
				'data-title': (!this.anonymous || this.sectiontitle) ? _('Name') : null,
				'click': this.sortable ? ui.createHandlerFn(this, 'handleSort') : null
			});

			for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
				if (opt.modalonly)
					continue;

				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell',
					'data-widget': opt.__name__,
					'data-sortable-row': this.sortable ? '' : null
				}));

				if (opt.width != null)
					trEl.lastElementChild.style.width =
						(typeof(opt.width) == 'number') ? `${opt.width}px` : opt.width;

				if (opt.titleref)
					trEl.lastElementChild.appendChild(E('a', {
						'href': opt.titleref,
						'class': 'cbi-title-ref',
						'title': this.titledesc ?? _('Go to relevant configuration page')
					}, opt.title));
				else
					dom.content(trEl.lastElementChild, opt.title);
			}

			if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable) {
				const rawTitle = (this.actionstitle !== undefined) ? this.actionstitle : null;
				const actionsTitle = (typeof rawTitle === 'function') ? rawTitle.call(this, has_action) : rawTitle;
				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell cbi-section-actions'
				}, (actionsTitle !== undefined) ? actionsTitle : null));
			}

			trEls.appendChild(trEl);
		}

		if (this.filterrow && tableFilter) {
			const filterTr = E('tr', { 'class': `tr cbi-section-table-filter ${anon_class}` });

			if (!this.anonymous || this.sectiontitle) {
				filterTr.appendChild(E('th', { 'class': 'th cbi-section-table-cell' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input cbi-section-filter',
						'placeholder': _('Filter'),
					})
				]));
			}

			for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
				if (opt.modalonly) continue;
				const f = /flag/i.test(opt.__name__);

				const th = E('th', { 'class': 'th cbi-section-table-cell' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input cbi-section-filter',
						'placeholder': f ? _('0/1') : _('Filter') + ' ' + opt.title,
						'maxlength': f ? 1 : '',
						'style': f ? 'width: 30px;' : '',
					})
				]);

				if (opt.width != null) th.style.width = (typeof(opt.width) == 'number') ? `${opt.width}px` : opt.width;
				filterTr.appendChild(th);
			}

			if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable) {
				filterTr.appendChild(E('th', { 'class': 'th cbi-section-table-cell cbi-section-actions' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-neutral',
						'type': 'button',
						'title': _('Reset filters'),
						'click': () => {
							const inputs = filterTr.querySelectorAll('input.cbi-section-filter');
							inputs.forEach(i => {
								i.value = '';
								i.dispatchEvent(new Event('input', { bubbles: true }));
							});
							const tbl = filterTr.closest('table');
							try { this.stabilizeActionColumnWidth(tbl); } catch (e) { }
						}
					}, [ _('Reset') ])
				]));
			}

			const attachFn = (input) => {
				input.addEventListener('input', (ev) => {
					const tbl = ev.target.closest('table');
					if (!tbl) return;

					const inputs = tbl.querySelectorAll('tr.cbi-section-table-filter input');
					const col_filts = Array.from(inputs).map(i => i.value.trim());
					const rows = tbl.querySelectorAll('tr.tr.cbi-section-table-row');

					rows.forEach(row => {
						const cells = Array.from(row.children)
							.filter(c => c.classList && c.classList.contains('td'));

						let hide = false;

						for (let k = 0; k < col_filts.length; k++) {
							if (!col_filts[k]) continue;

							let txt;
							const cell = cells[k];

							const checked = cell?.querySelector('input[type="checkbox"]')?.checked;
							const select = cell?.querySelector('select');
							const checkbox = checked !== undefined;

							if (checkbox)
								txt = checked ? '1' : '0';
							else if (select)
								txt = Array.from(select.selectedOptions)
									.map(opt => opt.textContent || opt.value.toLowerCase())
									.join(' ');
							else
								txt = cell.textContent || '';

							if (!txt.includes(col_filts[k])) { hide = true; break; }
						}
						row.style.display = hide ? 'none' : '';
					});
					try { this.stabilizeActionColumnWidth(tbl); } catch (e) { /* ignore */ }
				});
			};

			filterTr.querySelectorAll('input').forEach(attachFn);

			trEls.appendChild(filterTr);
		}

		if (has_descriptions && !this.nodescriptions) {
			const trEl = E('tr', {
				'class': `tr cbi-section-table-descr ${anon_class}`
			});

			for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
				if (opt.modalonly)
					continue;

				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell',
					'data-widget': opt.__name__
				}, opt.description));

				if (opt.width != null)
					trEl.lastElementChild.style.width =
						(typeof(opt.width) == 'number') ? `${opt.width}px` : opt.width;
			}

			if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable) {
				const rawTitle = (this.actionstitle !== undefined) ? this.actionstitle : null;
				const actionsTitle = (typeof rawTitle === 'function') ? rawTitle.call(this, has_action) : rawTitle;
				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell cbi-section-actions'
				}, (actionsTitle !== undefined) ? actionsTitle : null));
			}

			trEls.appendChild(trEl);
		}

		return trEls;
	},

	/** @private */
	renderFooterRows(has_action) {
		if (this.footer == null)
			return E([]);

		const max_cols = this.max_cols ?? this.children.length;
		const has_more = max_cols < this.children.length;
		const anon_class = (!this.anonymous || this.sectiontitle) ? 'named' : 'anonymous';

		if (typeof this.footer === 'function') {
			const node = this.footer.call(this, has_action);
			return node || E([]);
		}

		const values = Array.isArray(this.footer) ? this.footer : [];
		let idx = 0;
		const trEl = E('tr', { 'class': `tr cbi-section-table-footer ${anon_class}` });

		if (!this.anonymous || this.sectiontitle) {
			trEl.appendChild(E('td', { 'class': 'td cbi-value-field cbi-section-table-titles' }, values[idx++] ?? null));
		}

		for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
			if (opt.modalonly)
				continue;

			trEl.appendChild(E('td', { 'class': 'td', 'data-widget': opt.__name__ }, values[idx++] ?? null));
		}

		if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable) {
			trEl.appendChild(E('td', { 'class': 'td cbi-section-actions' }, values[idx++] ?? null));
		}

		return trEl;
	},


	/**
	 * stabilizeActionColumnWidth：稳定操作列宽度（防止过滤/隐藏行时列宽抖动）。
	 *
	 * 测量所有可见操作单元格（td.cbi-section-actions > div）的最大宽度，
	 * 将该宽度固定设置到表头、过滤行表头、页脚、所有操作格上，
	 * 从而避免因行显示/隐藏而导致的列宽变化。
	 *
	 * 同时在首次调用时绑定 window.resize 事件，视口大小变化时重新测量。
	 *
	   【内部调用时机】
	 *   - renderContents() 完成后（setTimeout 0 延迟，确保布局已完成）
	 *   - 过滤操作后（filterrow 功能调用）
	 *   - 窗口大小改变时（resize 事件）
	 *
	 * @param {HTMLTableElement} tableEl - 要处理的 table 元素
	 */

	/**
	 * Ensure the actions column keeps a stable width even when rows are hidden
	 * (e.g., due to filtering). Measures the widest actions cell and applies
	 * a fixed width to header/filter/footer/action cells. Stores measured width
	 * in dataset so filtering won't collapse the column if all rows are hidden.
	 */
	stabilizeActionColumnWidth(tableEl) {
		if (!tableEl || !tableEl.querySelector) return;

		const actionDivs = Array.from(tableEl.querySelectorAll('td.cbi-section-actions > div'));
		let max = 0;
		actionDivs.forEach(div => {
			if (div && div.offsetWidth) max = Math.max(max, div.offsetWidth);
		});

		const saved = parseInt(tableEl.dataset.actionColWidth || '0', 10) || 0;
		if (max <= 0 && saved > 0) max = saved;
		if (max <= 0) return; // nothing measurable

		tableEl.dataset.actionColWidth = String(max);
		const px = `${max}px`;

		const setStyles = (el) => {
			if (!el) return;
			el.style.minWidth = px;
			el.style.width = px;
		};

		setStyles(tableEl.querySelector('th.cbi-section-actions'));
		setStyles(tableEl.querySelector('tr.cbi-section-table-filter th.cbi-section-actions'));
		setStyles(tableEl.querySelector('tr.cbi-section-table-footer td.cbi-section-actions'));
		actionDivs.forEach(div => setStyles(div.parentNode));

		// attach a single resize handler per table to recalc on viewport changes
		if (!tableEl.__actionColResizeAttached) {
			tableEl.__actionColResizeAttached = true;
			window.addEventListener('resize', () => {
				delete tableEl.dataset.actionColWidth; // force re-measure
				this.stabilizeActionColumnWidth(tableEl);
			});
		}
	},

	/**
	   【私有】渲染表格每行右侧的操作按钮组（删除/排序/编辑/克隆等）。
	 *
	 * 根据 section 配置决定显示哪些按钮：
	 *   sortable=true   → 显示拖拽排序手柄（桌面端）或长按排序（触摸端）
	 *   extedit         → 显示"编辑"按钮（跳转到 URL 或触发函数）
	 *   more_label      → 显示"更多…"按钮（触发 renderMoreOptionsModal）
	 *   cloneable=true  → 显示"克隆"按钮
	 *   addremove=true  → 显示"删除"按钮
	 *
	 * @param {string} section_id - 当前行的 UCI section ID
	 * @param {string|null} more_label - "更多…"按钮文字，null 表示不显示
	 * @param {Node}   [trEl]     - 当前行的 tr 元素（触摸排序时使用）
	 * @returns {Node} td.cbi-section-actions 操作列节点
	 */
	renderRowActions(section_id, more_label, trEl) {
		const config_name = this.uciconfig ?? this.map.config;

		if (!this.sortable && !this.extedit && !this.addremove && !more_label && !this.cloneable)
			return E([]);

		const tdEl = E('td', {
			'class': 'td cbi-section-table-cell nowrap cbi-section-actions'
		}, E('div'));

		if (this.sortable) {
			const touch_sort = ('ontouchstart' in window);
			const dragHandleProps = {
				'title': _('Drag to reorder'),
				'class': 'cbi-button drag-handle center',
				'style': 'cursor:move; user-select:none; -webkit-user-select:none; display:inline-block;',
				'draggable': !touch_sort,
				'dragstart': !touch_sort ? L.bind(function(ev) {
					this.handleDragStart(ev, trEl);
				}, this) : null,
				'dragend': !touch_sort ? L.bind(function(ev) {
					this.handleDragEnd(ev, trEl);
				}, this) : null,
				'touchmove': touch_sort ? L.bind(function(ev) {
					this.handleTouchMove(ev);
				}, this) : null,
				'touchend': touch_sort ? L.bind(function(ev) {
					this.handleTouchEnd(ev);
				}, this) : null
			};
			const dragHandle = E('button', dragHandleProps, '☰');
			dom.append(tdEl.lastElementChild, [ dragHandle ]);
		}

		if (this.extedit) {
			let evFn = null;

			if (typeof(this.extedit) == 'function')
				evFn = L.bind(this.extedit, this);
			else if (typeof(this.extedit) == 'string')
				evFn = L.bind((sid, ev) => {
					location.href = this.extedit.format(sid);
				}, this, section_id);

			dom.append(tdEl.lastElementChild,
				E('button', {
					'title': _('Edit'),
					'class': 'btn cbi-button cbi-button-edit',
					'click': evFn
				}, [ _('Edit') ])
			);
		}

		if (more_label) {
			dom.append(tdEl.lastElementChild,
				E('button', {
					'title': more_label,
					'class': 'btn cbi-button cbi-button-edit',
					'click': ui.createHandlerFn(this, 'renderMoreOptionsModal', section_id)
				}, [ more_label ])
			);
		}

		if (this.cloneable) {
			const btn_title = this.titleFn('clonebtntitle', section_id);

			dom.append(tdEl.lastElementChild,
				E('button', {
					'title': btn_title || _('Clone') + '⿻',
					'class': 'btn cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(this, 'handleClone', section_id, true),
					'disabled': this.map.readonly || null
				}, [ btn_title || _('Clone') + '⿻' ])
			);
		}

		if (this.addremove) {
			const btn_title = this.titleFn('delbtntitle', section_id);

			dom.append(tdEl.lastElementChild,
				E('button', {
					'title': btn_title ?? _('Delete'),
					'class': 'btn cbi-button cbi-button-remove',
					'click': ui.createHandlerFn(this, 'handleRemove', section_id),
					'disabled': this.map.readonly || null
				}, [ btn_title ?? _('Delete') ])
			);
		}

		return tdEl;
	},

	/** @private */
	/**
	   【私有】初始化拖拽排序（mousedown 事件处理）。
	 * 记录拖拽开始时鼠标位置，防止与普通点击冲突。
	 */
	handleDragInit(ev) {
		scope.dragState = { node: ev.target };
	},

	/** @private */
	/**
	   【私有】拖拽开始（dragstart 事件处理）。
	 * 设置拖拽数据、记录被拖拽行，给行添加 dragging CSS 类以改变外观。
	 * @param {DragEvent} ev   - 浏览器 dragstart 事件
	 * @param {HTMLElement} trEl - 被拖拽的 tr 元素
	 */
	handleDragStart(ev, trEl) {
		// Only allow drag from the handle
		if (!ev.target || !ev.target.classList || !ev.target.classList.contains('drag-handle')) {
			scope.dragState = null;
			return false;
		}
		// Set the row as the drag source
		scope.dragState = scope.dragState || {};
		scope.dragState.node = trEl || dom.parent(ev.target, '.tr');
		ev.dataTransfer.setData('text', 'drag');
		ev.target.style.opacity = 0.4;
	},

	/** @private */
	/**
	   【私有】拖拽经过其他行时的处理（dragover 事件，需调用 preventDefault）。
	 * 阻止默认行为以允许 drop，并更新拖拽位置指示器。
	 * @param {DragEvent} ev - 浏览器 dragover 事件
	 */
	handleDragOver(ev) {
		if (scope.dragState === null ) return;
		const n = scope.dragState.targetNode;
		const r = scope.dragState.rect;
		const t = r.top + r.height / 2;

		if (ev.clientY <= t) {
			n.classList.remove('drag-over-below');
			n.classList.add('drag-over-above');
		}
		else {
			n.classList.remove('drag-over-above');
			n.classList.add('drag-over-below');
		}

		ev.dataTransfer.dropEffect = 'move';
		ev.preventDefault();
		return false;
	},

	/** @private */
	/**
	   【私有】拖拽进入某行时的样式处理（dragenter 事件）。
	 * 给目标行添加 drag-over 高亮 CSS 类。
	 * @param {DragEvent} ev - 浏览器 dragenter 事件
	 */
	handleDragEnter(ev) {
		if (scope.dragState === null ) return;
		scope.dragState.rect = ev.currentTarget.getBoundingClientRect();
		scope.dragState.targetNode = ev.currentTarget;
	},

	/** @private */
	/**
	   【私有】拖拽离开某行时的样式清理（dragleave 事件）。
	 * 移除目标行的 drag-over 高亮 CSS 类。
	 * @param {DragEvent} ev - 浏览器 dragleave 事件
	 */
	handleDragLeave(ev) {
		ev.currentTarget.classList.remove('drag-over-above');
		ev.currentTarget.classList.remove('drag-over-below');
	},

	/** @private */
	/**
	   【私有】拖拽结束（dragend 事件，无论是否成功 drop）。
	 * 清除拖拽状态、恢复行外观、提交新顺序到 UCI（调用 map.save）。
	 * @param {DragEvent}   ev   - 浏览器 dragend 事件
	 * @param {HTMLElement} trEl - 被拖拽的 tr 元素
	 */
	handleDragEnd(ev, trEl) {
		let n;
		if (trEl) {
			n = trEl;
		} else if (ev.target && typeof ev.target.closest === 'function') {
			n = ev.target.closest('tr');
		} else {
			// Fall-back: skip if no valid row
			return;
		}
		if (!n) return;
		// Reset drag handle visual state
		n.querySelector('.drag-handle').style.opacity = '';
		n.style.opacity = '';
		n.classList.add('flash');
		n.parentNode.querySelectorAll('.drag-over-above, .drag-over-below')
			.forEach((tr) => {
				tr.classList.remove('drag-over-above');
				tr.classList.remove('drag-over-below');
			});
	},

	/** @private */
	/**
	   【私有】拖拽释放（drop 事件）。
	 * 将被拖拽行插入到目标位置，更新 UCI section 顺序（调用 uci.move()）。
	 * @param {DragEvent} ev - 浏览器 drop 事件
	 */
	handleDrop(ev) {
		const s = scope.dragState;
		if (!s) return;

		if (s.node && s.targetNode) {
			const config_name = this.uciconfig ?? this.map.config;
			let ref_node = s.targetNode;
			let after = false;

			if (ref_node.classList.contains('drag-over-below')) {
				ref_node = ref_node.nextElementSibling;
				after = true;
			}

			const sid1 = s.node.getAttribute('data-sid');
			const sid2 = s.targetNode.getAttribute('data-sid');

			s.node.parentNode.insertBefore(s.node, ref_node);
			this.map.data.move(config_name, sid1, sid2, after);
		}

		scope.dragState = null;
		ev.target.style.opacity = '';
		ev.stopPropagation();
		ev.preventDefault();
		return false;
	},

	/** @private */
	/**
	   【私有】获取指定 DOM 节点的背景颜色（用于触摸拖拽时的视觉反馈）。
	 * 向上遍历父节点直到找到非透明背景色，用于绘制拖拽预览的背景。
	 * @param {HTMLElement} node - 目标节点
	 * @returns {string} CSS 颜色字符串（如 'rgb(255,255,255)'）
	 */
	determineBackgroundColor(node) {
		let r = 255;
		let g = 255;
		let b = 255;

		while (node) {
			const s = window.getComputedStyle(node);
			const c = (s.getPropertyValue('background-color') ?? '').replace(/ /g, '');

			if (c != '' && c != 'transparent' && c != 'rgba(0,0,0,0)') {
				if (/^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.test(c)) {
					r = parseInt(RegExp.$1, 16);
					g = parseInt(RegExp.$2, 16);
					b = parseInt(RegExp.$3, 16);
				}
				else if (/^rgba?\(([0-9]+),([0-9]+),([0-9]+)[,)]$/.test(c)) {
					r = +RegExp.$1;
					g = +RegExp.$2;
					b = +RegExp.$3;
				}

				break;
			}

			node = node.parentNode;
		}

		return [ r, g, b ];
	},

	/** @private */
	/**
	   【私有】触摸排序：手指移动事件处理（touchmove）。
	 * 在触摸设备上实现长按拖拽排序（桌面端使用 HTML5 Drag API 代替）。
	 * 跟踪手指位置，更新拖拽预览浮层位置，确定目标插入行。
	 * @param {TouchEvent} ev - 浏览器 touchmove 事件
	 */
	handleTouchMove(ev) {
		if (!ev.target.classList.contains('drag-handle'))
			return;

		const touchLoc = ev.targetTouches[0];
		const rowBtn = ev.target;
		const rowElem = dom.parent(rowBtn, '.tr');
		const htmlElem = document.querySelector('html');
		let dragHandle = document.querySelector('.touchsort-element');
		const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight ?? 0);

		if (!dragHandle) {
			const rowRect = rowElem.getBoundingClientRect();
			const btnRect = rowBtn.getBoundingClientRect();
			const paddingLeft = btnRect.left - rowRect.left;
			const paddingRight = rowRect.right - btnRect.right;
			const colorBg = this.determineBackgroundColor(rowElem);
			const colorFg = (colorBg[0] * 0.299 + colorBg[1] * 0.587 + colorBg[2] * 0.114) > 186 ? [ 0, 0, 0 ] : [ 255, 255, 255 ];

			dragHandle = E('div', { 'class': 'touchsort-element' }, [
				E('strong', [ rowElem.getAttribute('data-title') ]),
				rowBtn.cloneNode(true)
			]);

			Object.assign(dragHandle.style, {
				position: 'absolute',
				boxShadow: '0 0 3px rgba(%d, %d, %d, 1)'.format(colorFg[0], colorFg[1], colorFg[2]),
				background: 'rgba(%d, %d, %d, 0.8)'.format(colorBg[0], colorBg[1], colorBg[2]),
				top: `${rowRect.top}px`,
				left: `${rowRect.left}px`,
				width: `${rowRect.width}px`,
				height: `${rowBtn.offsetHeight + 4}px`
			});

			Object.assign(dragHandle.firstElementChild.style, {
				position: 'absolute',
				lineHeight: dragHandle.style.height,
				whiteSpace: 'nowrap',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				left: (paddingRight > paddingLeft) ? '' : '5px',
				right: (paddingRight > paddingLeft) ? '5px' : '',
				width: `${Math.max(paddingLeft, paddingRight) - 10}px`
			});

			Object.assign(dragHandle.lastElementChild.style, {
				position: 'absolute',
				top: '2px',
				left: `${paddingLeft}px`,
				width: `${rowBtn.offsetWidth}px`
			});

			document.body.appendChild(dragHandle);

			rowElem.classList.remove('flash');
			rowBtn.blur();
		}

		dragHandle.style.top = `${touchLoc.pageY - (parseInt(dragHandle.style.height) / 2)}px`;

		rowElem.parentNode.querySelectorAll('.cbi-section-table-row').forEach((tr, i, trs) => {
			const trRect = tr.getBoundingClientRect();
			const yTop = trRect.top + window.scrollY;
			const yBottom = trRect.bottom + window.scrollY;
			const yMiddle = yTop + ((yBottom - yTop) / 2);

			tr.classList.remove('drag-over-above', 'drag-over-below');

			if ((i == 0 || touchLoc.pageY >= yTop) && touchLoc.pageY <= yMiddle)
				tr.classList.add('drag-over-above');
			else if ((i == (trs.length - 1) || touchLoc.pageY <= yBottom) && touchLoc.pageY > yMiddle)
				tr.classList.add('drag-over-below');
		});

		/* prevent standard scrolling and scroll page when drag handle is
		 * moved very close (~30px) to the viewport edge */

		ev.preventDefault();

		if (touchLoc.clientY < 30)
			window.requestAnimationFrame(() => { htmlElem.scrollTop -= 30 });
		else if (touchLoc.clientY > viewportHeight - 30)
			window.requestAnimationFrame(() => { htmlElem.scrollTop += 30 });
	},

	/** @private */
	/**
	   【私有】触摸排序：手指抬起事件处理（touchend）。
	 * 完成触摸拖拽操作：将被排序行移动到目标位置，
	 * 移除拖拽预览浮层，调用 uci.move() 提交新顺序后保存。
	 * @param {TouchEvent} ev - 浏览器 touchend 事件
	 */
	handleTouchEnd(ev) {
		const rowElem = dom.parent(ev.target, '.tr');
		const htmlElem = document.querySelector('html');
		const dragHandle = document.querySelector('.touchsort-element');
		const targetElem = rowElem.parentNode.querySelector('.drag-over-above, .drag-over-below');
		const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight ?? 0);

		if (!dragHandle)
			return;

		// Reset drag handle visual state
		dragHandle.style.opacity = '';

		if (targetElem) {
			const isBelow = targetElem.classList.contains('drag-over-below');

			rowElem.parentNode.insertBefore(rowElem, isBelow ? targetElem.nextElementSibling : targetElem);

			this.map.data.move(
				this.uciconfig ?? this.map.config,
				rowElem.getAttribute('data-sid'),
				targetElem.getAttribute('data-sid'),
				isBelow);

			window.requestAnimationFrame(() => {
				const rowRect = rowElem.getBoundingClientRect();

				if (rowRect.top < 50)
					htmlElem.scrollTop = (htmlElem.scrollTop + rowRect.top - 50);
				else if (rowRect.bottom > viewportHeight - 50)
					htmlElem.scrollTop = (htmlElem.scrollTop + viewportHeight - 50 - rowRect.height);

				rowElem.classList.add('flash');
			});

			targetElem.classList.remove('drag-over-above', 'drag-over-below');
		}

		document.body.removeChild(dragHandle);
	},

	/** @private */
	/**
	   【私有】处理模态框"取消/关闭"按钮点击。
	 *
	 * 调用 ui.hideModal() 关闭弹框，并对 GridSection 等子类：
	 * 若刚刚通过"添加"按钮创建了新 section 但用户取消，则删除该 section。
	 *
	 * @param {CBIMap}  modalMap - 模态框内的临时 Map 实例
	 * @param {Event}   ev       - 点击事件
	 * @returns {Promise<void>}
	 */
	handleModalCancel(modalMap, ev) {
		const prevNode = this.getPreviousModalMap();
		let resetTasks = Promise.resolve();

		if (prevNode) {
			const heading = prevNode.parentNode.querySelector('h4');
			let prevMap = dom.findClassInstance(prevNode);

			while (prevMap) {
				resetTasks = resetTasks
					.then(L.bind(prevMap.load, prevMap))
					.then(L.bind(prevMap.reset, prevMap));

				prevMap = prevMap.parent;
			}

			prevNode.classList.add('flash');
			prevNode.classList.remove('hidden');
			prevNode.parentNode.removeChild(prevNode.nextElementSibling);

			heading.removeChild(heading.lastElementChild);

			if (!this.getPreviousModalMap())
				prevNode.parentNode
					.querySelector('div.button-row > button')
					.firstChild.data = _('Dismiss');
		}
		else {
			ui.hideModal();
		}

		return resetTasks;
	},

	/** @private */
	/**
	   【私有】处理模态框"保存"按钮点击。
	 *
	 * 调用临时 modalMap.save() 验证并保存模态框中的所有输入，
	 * 成功后关闭弹框并触发父 Map 的 save() 刷新表格行。
	 *
	 * @param {CBIMap}  modalMap - 模态框内的临时 Map 实例
	 * @param {Event}   ev       - 点击事件
	 * @returns {Promise<void>}
	 */
	handleModalSave(modalMap, ev) {
		const mapNode = this.getActiveModalMap();
		let activeMap = dom.findClassInstance(mapNode);
		let saveTasks = activeMap.save(null, true);

		while (activeMap.parent) {
			activeMap = activeMap.parent;
			saveTasks = saveTasks
				.then(L.bind(activeMap.load, activeMap))
				.then(L.bind(activeMap.reset, activeMap));
		}

		return saveTasks
			.then(L.bind(this.handleModalCancel, this, modalMap, ev, true))
			.catch(() => {});
	},

	/** @private */
	/**
	   【私有】处理表格标题行点击排序（按列排序）。
	 *
	 * 点击某列表头时，按该列的文字内容对所有行进行字典序排序，
	 * 再次点击同一列表头则反向排序。排序结果通过 uci.move() 持久化。
	 * 适用于 sortable=true 时的"点击列头排序"功能。
	 *
	 * @param {Event} ev - 点击事件（target 为 th 元素）
	 */
	handleSort(ev) {
		if (!ev.target.matches('th[data-sortable-row]'))
			return;

		const th = ev.target;
		const descending = (th.getAttribute('data-sort-direction') == 'desc');
		const config_name = this.uciconfig ?? this.map.config;
		let index = 0;
		const list = [];

		ev.currentTarget.querySelectorAll('th').forEach((other_th, i) => {
			if (other_th !== th)
				other_th.removeAttribute('data-sort-direction');
			else
				index = i;
		});

		ev.currentTarget.parentNode.querySelectorAll('tr.cbi-section-table-row').forEach(L.bind((tr, i) => {
			const sid = tr.getAttribute('data-sid');
			const opt = tr.childNodes[index].getAttribute('data-name');
			let val = this.cfgvalue(sid, opt);

			tr.querySelectorAll('.flash').forEach((n) => {
				n.classList.remove('flash')
			});

			val = Array.isArray(val) ? val.join(' '): val;
			val = `${val}`; // coerce non-string types to string
			list.push([
				ui.Table.prototype.deriveSortKey((val != null && typeof val.trim === 'function') ? val.trim() : ''),
				tr
			]);
		}, this));

		list.sort((a, b) => {
			return descending
				? -L.naturalCompare(a[0], b[0])
				: L.naturalCompare(a[0], b[0]);
		});

		window.requestAnimationFrame(L.bind(() => {
			let ref_sid;
			let cur_sid;

			for (let i = 0; i < list.length; i++) {
				list[i][1].childNodes[index].classList.add('flash');
				th.parentNode.parentNode.appendChild(list[i][1]);

				cur_sid = list[i][1].getAttribute('data-sid');

				if (ref_sid)
					this.map.data.move(config_name, cur_sid, ref_sid, true);

				ref_sid = cur_sid;
			}

			th.setAttribute('data-sort-direction', descending ? 'asc' : 'desc');
		}, this));
	},

	/**
	 * Add further options to the per-section instanced modal popup.
	 *
	 * This function may be overridden by user code to perform additional
	 * setup steps before displaying the more options modal which is useful to
	 * e.g. query additional data or to inject further option elements.
	 *
	 * The default implementation of this function does nothing.
	 *
	 * @abstract
	 * @param {LuCI.form.NamedSection} modalSection
	 * The `NamedSection` instance about to be rendered in the modal popup.
	 *
	 * @param {string} section_id
	 * The ID of the underlying UCI section the modal popup belongs to.
	 *
	 * @param {Event} ev
	 * The DOM event emitted by clicking the `More…` button.
	 *
	 * @returns {*|Promise<*>}
	 * Return values of this function are ignored but if a promise is returned,
	 * it is run to completion before the rendering is continued, allowing
	 * custom logic to perform asynchronous work before the modal dialog
	 * is shown.
	 */
	/**
	 * 在模态框中添加额外的 option（自定义扩展点）。
	 *
	 * 这是一个空的"钩子方法"，供子类或使用者覆盖，
	 * 用于在弹出的编辑模态框中动态追加额外的 option 控件，
	 * 而无需在初始渲染时就存在于 section 中。
	 *
	 * 调用时机：renderMoreOptionsModal() 创建临时 Map 后、渲染前调用此方法。
	 * 返回 Promise 时会等待其完成后再渲染。
	 *
	 * @param {LuCI.form.NamedSection} modalSection
	 *   模态框内临时 Map 的 NamedSection 实例，可以对其调用 option()/taboption()。
	 * @param {string} section_id - 当前编辑的 UCI section ID
	 * @param {Event}  ev         - 触发模态框打开的原始点击事件
	 * @returns {void|Promise<void>}
	 *
	   【使用示例：在模态框中动态添加字段】
	 *
	 *   // 继承 TableSection 并覆盖 addModalOptions
	 *   var MySection = form.TableSection.extend({
	 *     addModalOptions(s, section_id, ev) {
	 *       // 根据当前 section 的某个值决定是否添加额外字段
	 *       var proto = uci.get('network', section_id, 'proto');
	 *       if (proto === 'pppoe') {
	 *         s.option(form.Value, 'pppoe_user', _('PPPoE 用户名'));
	 *         s.option(form.Value, 'pppoe_pass', _('PPPoE 密码')).password = true;
	 *       }
	 *     }
	 *   });
	 */
	addModalOptions(modalSection, section_id, ev) {

	},

	/** @private */
	/**
	   【私有】获取当前正在显示的模态框内的 Map DOM 节点。
	 *
	 * 在 body.modal-overlay-active 下的模态框中查找未隐藏（非 .hidden）的 .cbi-map 节点。
	 * 用于在保存/取消时找到当前活动的 Map 实例（支持嵌套模态框场景）。
	 *
	 * @returns {HTMLElement|null} 当前活动的 Map DOM 节点，或 null（模态框未打开）
	 */
	getActiveModalMap() {
		return document.querySelector('body.modal-overlay-active > #modal_overlay > .modal.cbi-modal > .cbi-map:not(.hidden)');
	},

	/** @private */
	/**
	   【私有】获取嵌套模态框场景中被隐藏的前一个 Map DOM 节点。
	 *
	 * 在支持嵌套模态框时（如 GridSection 内的 SectionValue 再次弹出编辑框），
	 * 当前活动 Map 的前一个兄弟节点若是 .cbi-map.hidden，则为"上一级"Map。
	 * 用于在取消时恢复上一级模态框的显示状态。
	 *
	 * @returns {HTMLElement|null} 被隐藏的前一个 Map DOM 节点，或 null（无上一级）
	 */
	getPreviousModalMap() {
		const mapNode = this.getActiveModalMap();
		const prevNode = mapNode ? mapNode.previousElementSibling : null;

		return (prevNode && prevNode.matches('.cbi-map.hidden')) ? prevNode : null;
	},

	/** @private */
	/**
	   【私有】将源 section 的所有 option 克隆到目标 section（用于渲染模态框）。
	 *
	 * 深度复制每个 option 实例的属性到新实例：
	 *   - 跳过 modalonly=false 的 option（仅表格列显示，不在模态框中）
	 *   - 支持嵌套的 SectionValue（递归克隆 subsection 内的 option）
	 *   - 克隆所有自定义属性（datatype/validate/depends/onchange 等）
	 *   - 跳过内部引用属性（map/section/subsection 等，在新实例中重新绑定）
	 *
	 * 调用时机：renderMoreOptionsModal() 构建模态框 Map 时调用。
	 *
	 * @param {CBIAbstractSection} src_section  - 源 section（通常是 this）
	 * @param {CBIAbstractSection} dest_section - 目标 section（模态框内的临时 section）
	 */
	cloneOptions(src_section, dest_section) {
		for (let i = 0; i < src_section.children.length; i++) {
			const o1 = src_section.children[i];

			if (o1.modalonly === false && src_section === this)
				continue;

			let o2;

			if (o1.subsection) {
				o2 = dest_section.option(o1.constructor, o1.option, o1.subsection.constructor, o1.subsection.sectiontype, o1.subsection.title, o1.subsection.description);

				for (const k in o1.subsection) {
					if (!o1.subsection.hasOwnProperty(k))
						continue;

					switch (k) {
					case 'map':
					case 'children':
					case 'parentoption':
						continue;

					default:
						o2.subsection[k] = o1.subsection[k];
					}
				}

				this.cloneOptions(o1.subsection, o2.subsection);
			}
			else {
				o2 = dest_section.option(o1.constructor, o1.option, o1.title, o1.description);
			}

			for (const k in o1) {
				if (!o1.hasOwnProperty(k))
					continue;

				switch (k) {
				case 'map':
				case 'section':
				case 'option':
				case 'title':
				case 'description':
				case 'subsection':
					continue;

				default:
					o2[k] = o1[k];
				}
			}
		}
	},

	/** @private */
	/**
	   【私有】渲染并弹出"更多选项"模态框（点击"更多…"或"编辑"按钮时触发）。
	 *
	 * 执行流程：
	 *   1. 创建一个临时的 Map（CBIMap 或 CBIJSONMap）
	 *   2. 在临时 Map 中创建 NamedSection 并克隆所有 option
	 *   3. 调用 addModalOptions() 允许用户注入额外字段
	 *   4. 渲染临时 Map 并弹出模态框
	 *
	 * 支持嵌套模态框（GridSection 中点击 SectionValue 内嵌 GridSection 的编辑按钮时）：
	 *   - 若已有打开的模态框，将当前模态框隐藏，在其后插入新的模态框内容
	 *   - 面包屑导航（标题行 » 子标题）自动更新
	 *
	 * @param {string} section_id - 要编辑的 UCI section ID
	 * @param {Event}  [ev]       - 触发事件（可为 undefined）
	 * @returns {Promise<void>}
	 */
	renderMoreOptionsModal(section_id, ev) {
		const parent = this.map;
		const sref = parent.data.get(parent.config, section_id);
		const mapNode = this.getActiveModalMap();
		const activeMap = mapNode ? dom.findClassInstance(mapNode) : null;
		const stackedMap = activeMap && (activeMap.parent !== parent || activeMap.section !== section_id);

		return (stackedMap ? activeMap.save(null, true) : Promise.resolve()).then(L.bind(() => {
			section_id = sref['.name'];

			let m;

			if (parent instanceof CBIJSONMap) {
				m = new CBIJSONMap(null, null, null);
				m.data = parent.data;
			}
			else {
				m = new CBIMap(parent.config, null, null);
			}

			const s = m.section(CBINamedSection, section_id, this.sectiontype);

			m.parent = parent;
			m.section = section_id;
			m.readonly = parent.readonly;

			/* Clone tabs as both array and object. Otherwise calling renderMoreOptionsModal (reopening
			the same Modal multiple times) results in errors when s.tab is called in the modal. This
			allows Modal dialogues that declare new tabs to be opened multiple times without re-creating
			tabs that 'already exist'. */
			if (this.tabs) {
				s.tabs = Array.from(this.tabs);
				for (const key in this.tabs) {
					if (Object.prototype.hasOwnProperty.call(this.tabs, key) && isNaN(Number(key))) {
						s.tabs[key] = this.tabs[key];
					}
				}
			} else {
				s.tabs = undefined;
			}

			if (this.tab_names) {
				s.tab_names = Array.isArray(this.tab_names) ? this.tab_names.slice() : Object.assign({}, this.tab_names);
			} else {
				s.tab_names = undefined;
			}

			this.cloneOptions(this, s);

			return Promise.resolve(this.addModalOptions(s, section_id, ev)).then(() => {
				return m.render();
			}).then(L.bind((nodes) => {
				let title = parent.title;
				let name = null;

				if ((name = this.titleFn('modaltitle', section_id)) != null)
					title = name;
				else if ((name = this.titleFn('sectiontitle', section_id)) != null)
					title = '%s - %s'.format(parent.title, name);
				else if (!this.anonymous)
					title = '%s - %s'.format(parent.title, section_id);

				if (stackedMap) {
					mapNode.parentNode
						.querySelector('h4')
						.appendChild(E('span', title ? ` » ${title}` : ''));

					mapNode.parentNode
						.querySelector('div.button-row > button')
						.firstChild.data = _('Dismiss');

					mapNode.classList.add('hidden');
					mapNode.parentNode.insertBefore(nodes, mapNode.nextElementSibling);

					nodes.classList.add('flash');
				}
				else {
					ui.showModal(title, [
						nodes,
						E('div', { 'class': 'button-row' }, [
							E('button', {
								'class': 'btn cbi-button',
								'click': ui.createHandlerFn(this, 'handleModalCancel', m)
							}, [ _('Dismiss') ]), ' ',
							E('button', {
								'class': 'btn cbi-button cbi-button-positive important',
								'click': ui.createHandlerFn(this, 'handleModalSave', m),
								'disabled': m.readonly || null
							}, [ _('Save') ])
						])
					], 'cbi-modal');
				}
			}, this));
		}, this)).catch(L.error);
	}
});

/**
 * @class GridSection
 * @memberof LuCI.form
 * @augments LuCI.form.TableSection
 * @hideconstructor
 * @classdesc

 * The `GridSection` class maps all or - if `filter()` is overridden - a
 * subset of the underlying UCI configuration sections of a given type.

 * A grid section functions similar to a {@link LuCI.form.TableSection} but
 * supports tabbing in the modal overlay. Option elements added with
 * [option()]{@link LuCI.form.GridSection#option} are shown in the table while
 * elements added with [taboption()]{@link LuCI.form.GridSection#taboption}
 * are displayed in the modal popup.

 * Another important difference is that the table cells show a readonly text
 * preview of the corresponding option elements by default, unless the child
 * option element is explicitly made writeable by setting the `editable`
 * property to `true`.

 * Additionally, the grid section honours a `modalonly` property of child
 * option elements. Refer to the [AbstractValue]{@link LuCI.form.AbstractValue}
 * documentation for details.

 * Layout wise, a grid section looks mostly identical to table sections.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [section()]{@link LuCI.form.Map#section}.

 * @param {string} section_type
 * The type of the UCI section to map.

 * @param {string} [title]
 * The title caption of the form section element.

 * @param {string} [description]
 * The description text of the form section element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * GridSection：网格式 Section（表格 + 可展开的详细编辑）
 * ════════════════════════════════════════════════════════════

   【作用】
     继承自 TableSection，在表格展示的基础上增加了"展开编辑"功能：
     - 表格列中显示关键字段（editable=true 的字段可直接在格内编辑）
     - 点击行或编辑按钮时展开该行，显示完整的编辑面板
     - 使用 tab 机制将字段分组到不同的展开面板中

     适合字段数量中等、部分字段需要详细编辑的场景
     （比 TableSection 更灵活，比跳转到专门编辑页更紧凑）。

   【构造函数（通过 map.section() 调用）】
     m.section(form.GridSection, type, title?, description?)

   【关键属性（除继承的外）】

     nodescriptions {boolean}  默认 true（GridSection 默认不显示描述）
       与 TableSection 不同，GridSection 默认关闭描述，节省空间。

   【GridSection 中 option() 与 taboption() 的本质区别】

     ┌──────────────────┬────────────────────────┬────────────────────────────┐
     │                  │ option()               │ taboption('tabname', ...)  │
     ├──────────────────┼────────────────────────┼────────────────────────────┤
     │ 显示在表格列中   │ ✓（默认）              │ ✗（不在表格列显示）        │
     │ 显示在展开面板中 │ ✗（不在展开面板）      │ ✓（在指定 tab 面板中）     │
     │ modalonly=null   │ 同时显示（重复）        │ 只在展开面板中显示         │
     │ modalonly=true   │ 只在展开面板显示        │ 只在展开面板显示           │
     │ modalonly=false  │ 只在表格列显示          │ 只在表格列显示             │
     └──────────────────┴────────────────────────┴────────────────────────────┘

     设计模式：
     - 关键概要字段 → s.option()（在表格中可见，不进展开面板）
     - 详细编辑字段 → s.taboption()（在展开面板的 tab 中显示）
     - 同时在表格和展开面板显示 → s.option() + modalonly=null（默认）
       但这通常不推荐，会造成信息重复

   【option() 的 editable 属性（在表格格内直接编辑）】

     var o = s.option(form.Value, 'name', _('名称'));
     o.editable = true;  // 表格格内直接显示输入框，无需展开
     // editable=false（默认）：格内显示只读文本，需展开才能编辑

   【option() 的 modalonly 属性（控制出现位置）】

     var o = s.option(form.Value, 'summary', _('摘要'));
     o.modalonly = false;  // 只在表格列中（不在展开面板）

     o = s.taboption('detail', form.TextValue, 'detail', _('详情'));
     // taboption 自动属于展开面板

   【option() 的 modalonly 属性（控制出现位置）】

     o.modalonly = null;   // 两处都显示（默认，常用于 taboption）
     o.modalonly = true;   // 只在展开面板/模态框
     o.modalonly = false;  // 只在表格列

   ──────────────────────────────────────────────────────────
   【示例1：接口列表（表格+展开编辑）】

     var s = m.section(form.GridSection, 'interface', _('网络接口'));
     s.addremove = true;
     s.sortable  = true;

     // 表格列中显示的字段（简洁的概要信息）
     // 注意：GridSection 中 option() 直接添加的字段默认在表格列显示
     var o = s.option(form.Value, 'ifname', _('接口'));
     o.width = '15%';

     o = s.option(form.ListValue, 'proto', _('协议'));
     o.width = '10%';
     o.value('dhcp',   'DHCP');
     o.value('static', _('静态'));
     o.value('pppoe',  'PPPoE');

     // 展开面板中的详细字段（使用 tab 分组）
     s.tab('general',  _('常规设置'));
     s.tab('advanced', _('高级设置'));
     s.tab('firewall', _('防火墙'));

     // 这些字段只在展开面板的 'general' Tab 中显示
     o = s.taboption('general', form.Value, 'ipaddr', _('IP 地址'));
     o.depends('proto', 'static');
     o.datatype = 'cidr4';

     o = s.taboption('general', form.Value, 'netmask', _('子网掩码'));
     o.depends('proto', 'static');

     s.taboption('advanced', form.Value, 'mtu',     _('MTU'));
     s.taboption('advanced', form.Value, 'metric',  _('度量值'));
     s.taboption('firewall', form.ListValue, 'zone',_('防火墙区域'));

   ──────────────────────────────────────────────────────────
   【示例2：表格列内可直接编辑（editable=true）】

     var s = m.section(form.GridSection, 'host', _('主机记录'));
     s.addremove = true;
     s.anonymous = true;

     // 在表格格内可以直接编辑（不需要展开）
     var o = s.option(form.Value, 'ip', _('IP 地址'));
     o.editable = true;  // 表格格内显示为可编辑输入框
     o.datatype  = 'ip4addr';

     o = s.option(form.Value, 'name', _('主机名'));
     o.editable = true;

     // 这个字段只在展开面板中显示
     s.tab('extra', _('更多设置'));
     o = s.taboption('extra', form.DynamicList, 'mac', _('MAC 地址'));
     o.datatype = 'macaddr';
 */
const CBIGridSection = CBITableSection.extend(/** @lends LuCI.form.GridSection.prototype */ {
	/**
	 * Add an option tab to the section.
	 *
	 * The modal option elements of a grid section may be divided into multiple
	 * tabs to provide a better overview to the user.
	 *
	 * Before options can be moved into a tab pane, the corresponding tab
	 * has to be defined first, which is done by calling this function.
	 *
	 * Note that tabs are only effective in modal popups. Options added with
	 * `option()` will not be assigned to a specific tab and are rendered in
	 * the table view only.
	 *
	 * @param {string} name
	 * The name of the tab to register. It may be freely chosen and just serves
	 * as an identifier to differentiate tabs.
	 *
	 * @param {string} title
	 * The human readable caption of the tab.
	 *
	 * @param {string} [description]
	 * An additional description text for the corresponding tab pane. It is
	 * displayed as a text paragraph below the tab but before the tab pane
	 * contents. If omitted, no description will be rendered.
	 *
	 * @throws {Error}
	 * Throws an exception if a tab with the same `name` already exists.
	 */
	tab(name, title, description) {
		CBIAbstractSection.prototype.tab.call(this, name, title, description);
	},

	/** @private */
	/**
	   【私有】GridSection 的"添加"处理：创建新 section 后立即弹出编辑模态框。
	 *
	 * 与 TableSection.handleAdd 的区别：
	 *   TableSection：直接创建并保存，无模态框
	 *   GridSection：创建后立即弹出模态框让用户填写详情，
	 *                取消时自动删除刚创建的 section（在 handleModalCancel 中处理）
	 *
	 * @param {Event}  ev   - 点击事件
	 * @param {string} name - 命名 section 的名称（anonymous=false 时由用户输入）
	 * @returns {Promise<void>}
	 */
	handleAdd(ev, name) {
		const config_name = this.uciconfig ?? this.map.config;
		const section_id = this.map.data.add(config_name, this.sectiontype, name);
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		prevMap.addedSection = section_id;

		return this.renderMoreOptionsModal(section_id);
	},

	/** @private */
	/**
	   【私有】GridSection 的模态框"保存"处理。
	 *
	 * 调用父类 TableSection.handleModalSave 执行保存逻辑，
	 * 同时清除 addedSection 标记（表示新建 section 已确认保存，取消时不再删除）。
	 *
	 * @param {...*} args - 透传给父类的参数（modalMap, ev）
	 * @returns {Promise<void>}
	 */
	handleModalSave(...args) /* ... */{
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		return this.super('handleModalSave', args);
	},

	/** @private */
	/**
	   【私有】GridSection 的模态框"取消"处理。
	 *
	 * 若用户取消了通过"添加"按钮触发的新建操作（isSaving=false），
	 * 则自动删除刚创建的 section（回滚创建），避免遗留空 section。
	 * 若是保存成功后的关闭（isSaving=true），则不删除，直接关闭模态框。
	 *
	 * @param {CBIMap}  modalMap  - 模态框内的临时 Map 实例
	 * @param {Event}   ev        - 点击事件
	 * @param {boolean} isSaving  - 是否因保存成功而关闭（true 时不删除新建的 section）
	 * @returns {Promise<void>}
	 */
	handleModalCancel(modalMap, ev, isSaving) {
		const config_name = this.uciconfig ?? this.map.config;
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		if (prevMap.addedSection != null && !isSaving)
			this.map.data.remove(config_name, prevMap.addedSection);

		delete prevMap.addedSection;

		return this.super('handleModalCancel', arguments);
	},

	/** @private */
	/**
	   【私有】GridSection 的 section 渲染入口（覆盖 TableSection 的实现）。
	 *
	 * GridSection 使用 renderOptions(null, section_id) 而非 TypedSection 的方式，
	 * 这样表格列中仅渲染通过 option()（而非 taboption()）添加的字段，
	 * taboption() 添加的字段留在展开的模态框面板中显示。
	 *
	 * @param {string} section_id - 要渲染的 UCI section ID
	 * @returns {Promise<Node>} 包含本行所有 option 节点的 DocumentFragment
	 */
	renderUCISection(section_id) {
		return this.renderOptions(null, section_id);
	},

	/** @private */
	/**
	   【私有】GridSection 的子元素渲染（覆盖 AbstractElement 实现）。
	 *
	 * 与 TableSection.renderChildren 的核心区别：
	 *   - 跳过 modalonly=true 的 option（这些只在展开面板/模态框中显示）
	 *   - editable=true 的 option：渲染为可编辑输入控件（直接在格内操作）
	 *   - editable=false 的 option（默认）：渲染为只读文本预览（需展开才能编辑）
	 *
	 * @param {string|null} tab_name   - 当前 Tab 名；null 表示渲染所有非 Tab option
	 * @param {string}      section_id - UCI section ID
	 * @param {boolean}     in_table   - 是否在表格模式下渲染（始终为 true）
	 * @returns {Promise<Array<Node>>} 渲染完成的节点数组
	 */
	renderChildren(tab_name, section_id, in_table) {
		const tasks = [];
		let index = 0;

		for (let i = 0, opt; (opt = this.children[i]) != null; i++) {
			if (opt.disable || opt.modalonly)
				continue;

			if (opt.editable)
				tasks.push(opt.render(index++, section_id, in_table));
			else
				tasks.push(this.renderTextValue(section_id, opt));
		}

		return Promise.all(tasks);
	},

	/** @private */
	renderTextValue(section_id, opt) {
		const title = this.stripTags(opt.title).trim();
		const descr = this.stripTags(opt.description).trim();
		const value = opt.textvalue(section_id);

		return E('td', {
			'class': 'td cbi-value-field',
			'data-title': (title != '') ? title : null,
			'data-description': (descr != '') ? descr : null,
			'data-name': opt.option,
			'data-widget': 'CBI.DummyValue'
		}, (value != null) ? value : E('em', _('none')));
	},

	/** @private */
	renderHeaderRows(section_id) {
		return this.super('renderHeaderRows', [ true ]);
	},

	/** @private */
	renderRowActions(section_id) {
		return this.super('renderRowActions', [ section_id, _('Edit') ]);
	},

	/** @override */
	parse() {
		const section_ids = this.cfgsections();
		const tasks = [];

		if (Array.isArray(this.children)) {
			for (let i = 0; i < section_ids.length; i++) {
				for (let j = 0; j < this.children.length; j++) {
					if (!this.children[j].editable || this.children[j].modalonly)
						continue;

					tasks.push(this.children[j].parse(section_ids[i]));
				}
			}
		}

		return Promise.all(tasks);
	}
});

/**
 * @class NamedSection
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractSection
 * @hideconstructor
 * @classdesc

 * The `NamedSection` class maps exactly one UCI section instance which is
 * specified when constructing the class instance.

 * Layout and functionality wise, a named section is essentially a
 * `TypedSection` which allows exactly one section node.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added to. It is automatically passed
 * by [section()]{@link LuCI.form.Map#section}.

 * @param {string} section_id
 * The name (ID) of the UCI section to map.

 * @param {string} section_type
 * The type of the UCI section to map.

 * @param {string} [title]
 * The title caption of the form section element.

 * @param {string} [description]
 * The description text of the form section element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * NamedSection：直接按名称引用特定 UCI section
 * ════════════════════════════════════════════════════════════

   【作用】
     直接引用 UCI 配置中一个已知名称（或 @type[index] 格式）的 section，
     只显示该 section 的配置字段。
     适合：配置文件中只有一个特定 section，或需要编辑已知名称的 section。

   【构造函数（通过 map.section() 调用）】
     m.section(form.NamedSection, section_name, type, title?, description?)

     section_name  {string}
       UCI section 名称，支持：
       - 普通名称：'lan'、'wan'、'dnsmasq'
       - 扩展格式：'@system[0]'（第一个 system 类型的 section）
       - 扩展格式：'@interface[-1]'（最后一个 interface 类型的 section）

     type          {string}
       UCI section 类型（用于标识，在 addremove 功能中创建同类型的 section）

   【关键属性】

     addremove  {boolean}  默认 false
       true：显示"删除此 section"和"创建此 section"按钮
       用于可选的 section（该 section 可能不存在，用户可以创建或删除）

   ──────────────────────────────────────────────────────────
   【示例1：编辑系统配置（最常见用法，使用 @type[n] 格式）】

     // 编辑 /etc/config/system 中第一个 system 类型 section
     var s = m.section(form.NamedSection, '@system[0]', 'system',
         _('系统基本设置'));

     s.option(form.Value, 'hostname', _('主机名'));
     s.option(form.Value, 'timezone', _('时区'));
     s.option(form.Value, 'zonename', _('时区名称'));

   ──────────────────────────────────────────────────────────
   【示例2：编辑已知名称的接口（直接用 section 名称）】

     var s = m.section(form.NamedSection, 'lan', 'interface', _('LAN 配置'));

     var o = s.option(form.Value, 'ipaddr', _('IPv4 地址'));
     o.datatype = 'cidr4';

     o = s.option(form.Value, 'ip6assign', _('IPv6 前缀长度'));
     o.datatype = 'range(0,64)';
     o.optional = true;

   ──────────────────────────────────────────────────────────
   【示例3：带 Tab 分组的 NamedSection】

     var s = m.section(form.NamedSection, '@system[0]', 'system');

     s.tab('general',  _('常规'));
     s.tab('logging',  _('日志'));
     s.tab('timesync', _('时间同步'));

     s.taboption('general',  form.Value, 'hostname', _('主机名'));
     s.taboption('general',  form.Value, 'description', _('描述'));
     s.taboption('logging',  form.Value, 'log_ip',   _('日志服务器'));
     s.taboption('logging',  form.Value, 'log_port', _('日志端口'));
     s.taboption('timesync', form.Value, 'ntpserver',_('NTP 服务器'));

   ──────────────────────────────────────────────────────────
   【示例4：可选 section（addremove=true）】

     // /etc/config/network 中 'globals' section 可能不存在
     var s = m.section(form.NamedSection, 'globals', 'globals',
         _('全局网络设置'));
     s.addremove = true;  // 允许用户创建或删除该 section

     var o = s.option(form.Value, 'ula_prefix', _('ULA IPv6 前缀'));
     o.datatype = 'cidr6';
     o.optional = true;
 */
const CBINamedSection = CBIAbstractSection.extend(/** @lends LuCI.form.NamedSection.prototype */ {
	__name__: 'CBI.NamedSection',
	__init__(map, section_id, ...args) {
		this.super('__init__', [ map, ...args ]);

		this.section = section_id;
	},

	/**
	 * Set to `true`, the user may remove or recreate the sole mapped
	 * configuration instance from the form section widget, otherwise only a
	 * pre-existing section may be edited. The default is `false`.
	 *
	 * @name LuCI.form.NamedSection.prototype#addremove
	 * @type boolean
	 * @default false
	 */

	/**
	 * If set to true, the title caption of the form section element which
	 * is normally rendered before the start of the section content will
	 * not be rendered in the UI. The default is false, meaning that the
	 * title is rendered.
	 *
	 * @name LuCI.form.NamedSection.prototype#hidetitle
	 * @type boolean
	 * @default false
	 */

	/**
	 * Override the UCI configuration name to read the section IDs from. By
	 * default, the configuration name is inherited from the parent `Map`.
	 * By setting this property, a deviating configuration may be specified.
	 * The default of `null` means inherit from the parent form.
	 *
	 * @name LuCI.form.NamedSection.prototype#uciconfig
	 * @type string
	 * @default null
	 */

	/**
	 * The `NamedSection` class overrides the generic `cfgsections()`
	 * implementation to return a one-element array containing the mapped
	 * section ID as a sole element. User code should not normally change this.
	 *
	 * @returns {string[]}
	 * Returns a one-element array containing the mapped section ID.
	 */
	cfgsections() {
		return [ this.section ];
	},

	/** @private */
	/**
	   【私有】处理"创建此 section"按钮点击（addremove=true 且 section 不存在时显示）。
	 *
	 * 使用 NamedSection 构造时指定的固定 section 名称创建 UCI section，
	 * 然后触发 map.save() 重新渲染（此后按钮变为"删除"按钮）。
	 *
	 * @param {Event} ev - 点击事件
	 * @returns {Promise<void>}
	 */
	handleAdd(ev) {
		const section_id = this.section;
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.add(config_name, this.sectiontype, section_id);
		return this.map.save(null, true);
	},

	/**
	   【私有】处理"删除此 section"按钮点击（addremove=true 且 section 存在时显示）。
	 *
	 * 删除 NamedSection 对应的固定名称 UCI section，
	 * 然后触发 map.save() 重新渲染（此后按钮变为"创建"按钮）。
	 *
	 * @param {Event} ev - 点击事件
	 * @returns {Promise<void>}
	 */
	handleRemove(ev) {
		const section_id = this.section;
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.remove(config_name, section_id);
		return this.map.save(null, true);
	},

	/**
	   【私有】将渲染结果组装为 NamedSection 的最终 DOM 结构。
	 *
	 * 根据 ucidata（section 是否存在于 UCI 中）分两种情况：
	 *
	   【section 存在时（ucidata 非 null）】
	 *   显示 section 内容节点（option 控件），
	 *   若 addremove=true 同时显示"删除"按钮。
	 *
	   【section 不存在时（ucidata 为 null）】
	 *   若 addremove=true，显示"创建"按钮；
	 *   否则什么都不显示（section 整体为空）。
	 *
	 * @param {Array} data - [ucidata, nodes]（由 render() 传入的 Promise.all 结果）
	 *   ucidata：UCI section 对象（存在时）或 null（不存在时）
	 *   nodes：renderUCISection() 的渲染结果
	 * @returns {Node} 完整的 section 容器节点
	 */
	renderContents(data) {
		const ucidata = data[0];
		const nodes = data[1];
		const section_id = this.section;
		const config_name = this.uciconfig ?? this.map.config;

		const sectionEl = E('div', {
			'id': ucidata ? null : 'cbi-%s-%s'.format(config_name, section_id),
			'class': 'cbi-section',
			'data-tab': (this.map.tabbed && !this.parentoption) ? this.sectiontype : null,
			'data-tab-title': (this.map.tabbed && !this.parentoption) ? this.title || this.sectiontype : null
		});

		if (typeof(this.title) === 'string' && this.title !== '' && !this.hidetitle)
			sectionEl.appendChild(E('h3', {}, this.title));

		if (typeof(this.description) === 'string' && this.description !== '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		if (ucidata) {
			if (this.addremove) {
				const rem_btn_title = this.titleFn('delbtntitle', section_id);
				sectionEl.appendChild(
					E('div', { 'class': 'cbi-section-remove right' },
						E('button', {
							'class': 'cbi-button',
							'click': ui.createHandlerFn(this, 'handleRemove'),
							'disabled': this.map.readonly || null
						}, [ rem_btn_title ?? _('Delete') ])));
			}

			sectionEl.appendChild(E('div', {
				'id': 'cbi-%s-%s'.format(config_name, section_id),
				'class': this.tabs
					? 'cbi-section-node cbi-section-node-tabbed' : 'cbi-section-node',
				'data-section-id': section_id
			}, nodes));
		}
		else if (this.addremove) {
			const add_btn_title = this.titleFn('addbtntitle', section_id);
			sectionEl.appendChild(
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, 'handleAdd'),
					'disabled': this.map.readonly || null
				}, [ add_btn_title ?? _('Add') ]));
		}

		dom.bindClassInstance(sectionEl, this);

		return sectionEl;
	},

	/**
	 * 渲染 NamedSection（加载数据并组装 DOM）。
	 *
	 * 并行执行：
	 *   1. uci.get(config, section_id) - 检查 section 是否存在（结果传给 renderContents）
	 *   2. renderUCISection(section_id) - 渲染所有 option 控件
	 *
	 * 两个操作都完成后调用 renderContents 组装最终结构。
	 *
	 * @override
	 * @returns {Promise<Node>}
	 */
	render() {
		const config_name = this.uciconfig ?? this.map.config;
		const section_id = this.section;

		return Promise.all([
			this.map.data.get(config_name, section_id),
			this.renderUCISection(section_id)
		]).then(this.renderContents.bind(this));
	}
});

/**
 * @class Value
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractValue
 * @hideconstructor
 * @classdesc

 * The `Value` class represents a simple one-line form input using the
 * {@link LuCI.ui.Textfield} or - in case choices are added - the
 * {@link LuCI.ui.Combobox} class as underlying widget.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * Value：文本输入框控件（最基础、最常用的 Option 控件）
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为文本输入框（HTML input[type=text] 或 input[type=password]）。
     当通过 value() 方法添加候选选项后，自动升级为 Combobox 组合框
    （既可自由输入，也可从下拉列表选择）。

   【关键属性（除继承自 AbstractValue 的外）】

     password    {boolean}  默认 false
       true：渲染为密码输入框（内容以 ● 掩码显示）

     placeholder {string}   默认 null
       未输入时显示的提示文字（浅灰色）

   【关键方法】
     value(key, val?)
       添加一个候选选项（使控件变为 Combobox 组合框）
       key：选项的实际值（存储到 UCI 的值）
       val：显示给用户的标签（省略时显示 key 本身）

   ──────────────────────────────────────────────────────────
   【示例1：普通文本输入（最简单用法）】

     var o = s.option(form.Value, 'hostname', _('主机名'));
     o.placeholder = 'OpenWrt';         // 提示文字
     o.datatype    = 'hostname';        // 格式验证
     o.optional    = true;              // 可以为空

   ──────────────────────────────────────────────────────────
   【示例2：密码输入框】

     var o = s.option(form.Value, 'psk', _('WiFi 密码'));
     o.password    = true;
     o.datatype    = 'minlength(8)';    // 最少8位
     o.optional    = true;              // 允许空（无密码）

   ──────────────────────────────────────────────────────────
   【示例3：带候选项的组合框（Combobox）】
     调用 value() 后控件从纯文本框升级为 Combobox（自由输入+下拉选择）

     var o = s.option(form.Value, 'server', _('NTP 服务器'));
     o.placeholder = _('输入服务器地址或从列表选择');
     o.value('0.openwrt.pool.ntp.org', _('公共 NTP 0'));
     o.value('1.openwrt.pool.ntp.org', _('公共 NTP 1'));
     o.value('time.cloudflare.com',    _('Cloudflare NTP'));
     o.datatype = 'host';  // 验证：主机名或 IP

   ──────────────────────────────────────────────────────────
   【示例4：IP 地址输入】

     var o = s.option(form.Value, 'ipaddr', _('IPv4 地址'));
     o.datatype = 'ip4addr';  // 纯 IP，不含前缀长度

     // 或带前缀长度的 CIDR 格式
     o.datatype = 'cidr4';   // 如：192.168.1.1/24

   ──────────────────────────────────────────────────────────
   【示例5：自定义验证】

     var o = s.option(form.Value, 'port', _('端口号'));
     o.datatype = 'port';
     o.validate = function(sid, val) {
       var used = [22, 80, 443];  // 已被占用的端口
       if (used.includes(parseInt(val)))
         return _('端口 %d 已被占用').format(val);
       return true;
     };

   ──────────────────────────────────────────────────────────
   【示例6：带依赖的输入框】

     var proto = s.option(form.ListValue, 'proto', _('协议'));
     proto.value('dhcp',   'DHCP');
     proto.value('static', _('静态'));
     proto.value('pppoe',  'PPPoE');

     var ip = s.option(form.Value, 'ipaddr', _('IP 地址'));
     ip.datatype = 'cidr4';
     ip.depends('proto', 'static');  // 只在静态模式下显示

     var user = s.option(form.Value, 'username', _('用户名'));
     user.depends('proto', 'pppoe');  // 只在 PPPoE 模式下显示

     var pass = s.option(form.Value, 'password', _('密码'));
     pass.password = true;
     pass.depends('proto', 'pppoe');

   ──────────────────────────────────────────────────────────
   【示例7：自定义读写逻辑（覆盖 cfgvalue/write）】

     var o = s.option(form.Value, 'ipaddr', _('IP 地址（不含掩码）'));
     // UCI 中存储的是 '192.168.1.1/24'，但只让用户编辑 IP 部分
     o.cfgvalue = function(sid) {
       var val = uci.get('network', sid, 'ipaddr') || '';
       return val.split('/')[0];  // 只返回 IP 部分
     };
     o.write = function(sid, val) {
       var mask = uci.get('network', sid, 'netmask') || '24';
       uci.set('network', sid, 'ipaddr', val + '/' + mask);
     };
 */
const CBIValue = CBIAbstractValue.extend(/** @lends LuCI.form.Value.prototype */ {
	__name__: 'CBI.Value',

	/**
	 * If set to `true`, the field is rendered as a password input, otherwise
	 * as a plain text input.
	 *
	 * @name LuCI.form.Value.prototype#password
	 * @type boolean
	 * @default false
	 */

	/**
	 * Set a placeholder string to use when the input field is empty.
	 *
	 * @name LuCI.form.Value.prototype#placeholder
	 * @type string
	 * @default null
	 */

	/**
	 * Add a predefined choice to the form option. By adding one or more
	 * choices, the plain text input field is turned into a combobox widget
	 * which prompts the user to select a predefined choice, or to enter a
	 * custom value.
	 *
	 * @param {string} key
	 * The choice value to add.
	 *
	 * @param {Node|string} val
	 * The caption for the choice value. May be a DOM node, a document fragment
	 * or a plain text string. If omitted, the `key` value is used as a caption.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  value(key, val?)               [Value / ListValue 通用]        │
	 * │  添加预定义候选选项                                               │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   - Value（文本输入框）：调用后变为 Combobox（下拉 + 自由输入），
	 *     用户可选择预设值，也可手动输入自定义值。
	 *   - ListValue（下拉选择框）：添加固定选项，用户只能从中选择。
	 *   - DynamicList（动态列表）：添加候选建议项。
	 *
	 * 【参数】
	 *   @param {string}      key  保存到 UCI 的实际值（option 的 value）
	 *   @param {string|Node} [val] 显示给用户的标签文字或 DOM 节点；
	 *                             省略时使用 key 作为显示文字
	 *
	 * 【使用示例】
	 *
	 *   // 基础：ListValue 下拉选择框
	 *   o = s.option(form.ListValue, 'proto', _('协议'));
	 *   o.value('dhcp',   _('DHCP 客户端'));
	 *   o.value('static', _('静态地址'));
	 *   o.value('pppoe',  _('PPPoE 拨号'));
	 *   o.value('none',   _('不配置'));
	 *   o.default = 'dhcp';
	 *
	 *   // Value Combobox（可输入 + 预设建议）
	 *   o = s.option(form.Value, 'dns', _('DNS 服务器'));
	 *   o.value('8.8.8.8',   _('Google Public DNS'));
	 *   o.value('1.1.1.1',   _('Cloudflare DNS'));
	 *   o.value('114.114.114.114', _('国内 114 DNS'));
	 *   // 用户也可以手动输入任意 IP
	 *   o.datatype = 'ipaddr';
	 *
	 *   // key 与显示标签不同（UCI 存 '0'/'1'，显示中文）
	 *   o = s.option(form.ListValue, 'band', _('无线频段'));
	 *   o.value('2g', _('2.4 GHz'));
	 *   o.value('5g', _('5 GHz'));
	 *   o.value('6g', _('6 GHz（Wi-Fi 6E）'));
	 *
	 *   // 用变量循环添加（适合从数据动态生成选项）
	 *   o = s.option(form.ListValue, 'interface', _('绑定接口'));
	 *   uci.sections('network', 'interface').forEach(function(iface) {
	 *     if (iface['.name'] !== 'loopback')
	 *       o.value(iface['.name'], iface['.name'].toUpperCase());
	 *   });
	 *
	 *   // val 使用 DOM 节点（富文本标签）
	 *   o = s.option(form.ListValue, 'level', _('日志级别'));
	 *   o.value('0', E('span', { style: 'color:red' },   _('错误')));
	 *   o.value('1', E('span', { style: 'color:orange' }, _('警告')));
	 *   o.value('2', E('span', { style: 'color:green' },  _('信息')));
	 *
	 * 【注意】
	 *   - key 始终被转为字符串存储，确保与 UCI 值类型一致
	 *   - 调用顺序决定下拉列表的显示顺序
	 *   - ListValue 未设置 optional=true 时，必须通过 value() 提供至少一个选项
	 *     或设置 o.default，否则初始值为空会导致验证失败
	 */
	value(key, val) {
		this.keylist ??= [];
		this.keylist.push(String(key));

		this.vallist ??= [];
		this.vallist.push(dom.elem(val) ? val : String(val != null ? val : key));
	},

	/** @override */
	render(option_index, section_id, in_table) {
		return Promise.resolve(this.cfgvalue(section_id))
			.then(this.renderWidget.bind(this, section_id, option_index))
			.then(this.renderFrame.bind(this, section_id, in_table, option_index));
	},

	/**
	   【私有】处理 UI 控件值变化事件（widget-change 事件触发）。
	 *
	 * 读取当前控件值，与上次记录的值比较，
	 * 若确实发生变化则调用 this.onchange(ev, section_id, newValue)。
	 * 使用 state.previousValue 记录上次值，避免重复触发。
	 *
	 * @param {string}  section_id - 当前 section ID
	 * @param {Object}  state      - 状态对象（持有 previousValue）
	 * @param {Event}   ev         - 原始 widget-change 事件
	 */
	handleValueChange(section_id, state, ev) {
		if (typeof(this.onchange) != 'function')
			return;

		const value = this.formvalue(section_id);

		if (isEqual(value, state.previousValue))
			return;

		state.previousValue = value;
		this.onchange.call(this, ev, section_id, value);
	},

	/**
	   【私有】将 renderWidget() 返回的控件节点包装为完整的 option 容器。
	 *
	 * 根据所在上下文生成不同的容器结构：
	 *
	   【表格模式（in_table=true，用于 TableSection/GridSection）】
	 *   生成 td.td.cbi-value-field，data-title 用于移动端折叠显示列标题。
	 *
	   【普通模式（in_table=false，用于 TypedSection/NamedSection）】
	 *   生成 div.cbi-value，包含：
	 *   - label.cbi-value-title（标题，可带 titleref 链接）
	 *   - div.cbi-value-field（控件容器）
	 *   - div.cbi-value-description（描述文字，可选）
	 *
	 * 公共处理：
	 *   - 设置 data-field（cbid）、data-depends（依赖列表）等属性
	 *   - 依赖不满足时添加 hidden 类（初始隐藏）
	 *   - 绑定 widget-change 事件（触发依赖更新和 onchange 回调）
	 *   - 绑定类实例到 DOM 节点（供 lookupOption 等反向查找）
	 *
	 * @param {string}  section_id   - UCI section ID
	 * @param {boolean} in_table     - true=表格单元格模式，false=普通卡片模式
	 * @param {number}  option_index - 当前 option 在 section 中的序号
	 * @param {Node}    nodes        - renderWidget() 返回的控件节点
	 * @returns {Node} 完整的 option 容器节点（td 或 div）
	 */
	renderFrame(section_id, in_table, option_index, nodes) {
		const config_name = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const depend_list = this.transformDepList(section_id);
		let optionEl;

		if (in_table) {
			const title = this.stripTags(this.title).trim();
			optionEl = E('td', {
				'class': 'td cbi-value-field',
				'data-title': (title != '') ? title : null,
				'data-description': this.stripTags(this.description).trim(),
				'data-name': this.option,
				'data-widget': this.typename || (this.template ? this.template.replace(/^.+\//, '') : null) || this.__name__
			}, E('div', {
				'id': 'cbi-%s-%s-%s'.format(config_name, section_id, this.option),
				'data-index': option_index,
				'data-depends': depend_list,
				'data-field': this.cbid(section_id)
			}));
		}
		else {
			optionEl = E('div', {
				'class': 'cbi-value',
				'id': 'cbi-%s-%s-%s'.format(config_name, section_id, this.option),
				'data-index': option_index,
				'data-depends': depend_list,
				'data-field': this.cbid(section_id),
				'data-name': this.option,
				'data-widget': this.typename || (this.template ? this.template.replace(/^.+\//, '') : null) || this.__name__
			});

			if (this.last_child)
				optionEl.classList.add('cbi-value-last');

			if (typeof(this.title) === 'string' && this.title !== '') {
				optionEl.appendChild(E('label', {
					'class': 'cbi-value-title',
					'for': 'widget.cbid.%s.%s.%s'.format(config_name, section_id, this.option),
					'click': (ev) => {
						const node = ev.currentTarget;
						const elem = node.nextElementSibling.querySelector(`#${node.getAttribute('for')}`) ?? node.nextElementSibling.querySelector(`[data-widget-id="${node.getAttribute('for')}"]`);

						if (elem) {
							elem.click();
							elem.focus();
						}
					}
				},
				this.titleref ? E('a', {
					'class': 'cbi-title-ref',
					'href': this.titleref,
					'title': this.titledesc ?? _('Go to relevant configuration page')
				}, this.title) : this.title));

				optionEl.appendChild(E('div', { 'class': 'cbi-value-field' }));
			}
		}

		if (nodes)
			(optionEl.lastChild ?? optionEl).appendChild(nodes);

		if (!in_table && typeof(this.description) === 'string' && this.description !== '')
			dom.append(optionEl.lastChild ?? optionEl,
				E('div', { 'class': 'cbi-value-description' }, this.description.trim()));

		if (depend_list && depend_list.length)
			if (in_table)
				optionEl.firstChild.classList.add('hidden');
			else
				optionEl.classList.add('hidden');

		optionEl.addEventListener('widget-change',
			L.bind(this.map.checkDepends, this.map));

		optionEl.addEventListener('widget-change',
			L.bind(this.handleValueChange, this, section_id, {}));

		dom.bindClassInstance(optionEl, this);

		return optionEl;
	},

	/**
	   【私有】渲染实际的 UI 输入控件（核心渲染方法，子类通常覆盖此方法）。
	 *
	 * Value 的实现逻辑：
	 *   - 若有候选选项（transformChoices() 非 null）：渲染为 ui.Combobox
	 *     （自由输入 + 下拉候选列表）
	 *   - 否则：渲染为 ui.Textfield（纯文本输入框）
	 *
	 * 所有子类（ListValue、Flag、DynamicList 等）都覆盖此方法，
	 * 使用不同的 ui.* 控件渲染。
	 *
	 * @param {string} section_id   - UCI section ID
	 * @param {number} option_index - 当前 option 在 section 中的序号
	 * @param {*}      cfgvalue     - load() 加载的 UCI 配置值（null 时用 this.default）
	 * @returns {Promise<Node>|Node} 渲染完成的控件 DOM 节点
	 *
	   【子类覆盖示例】
	 *   // 自定义一个颜色选择器控件
	 *   var ColorPicker = form.Value.extend({
	 *     renderWidget(section_id, option_index, cfgvalue) {
	 *       const val = cfgvalue ?? this.default ?? '#ffffff';
	 *       const input = E('input', {
	 *         type: 'color',
	 *         id: this.cbid(section_id),
	 *         value: val,
	 *         change: (ev) => {
	 *           // 触发 widget-change 让依赖系统感知变化
	 *           ev.target.dispatchEvent(new CustomEvent('widget-change', { bubbles: true }));
	 *         }
	 *       });
	 *       return input;
	 *     },
	 *     formvalue(section_id) {
	 *       const el = this.map.findElement('id', this.cbid(section_id));
	 *       return el ? el.value : null;
	 *     }
	 *   });
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const choices = this.transformChoices();
		let widget;

		if (choices) {
			const placeholder = (this.optional || this.rmempty)
				? E('em', _('unspecified')) : _('-- Please choose --');

			widget = new ui.Combobox(Array.isArray(value) ? value.join(' ') : value, choices, {
				id: this.cbid(section_id),
				sort: this.keylist,
				optional: this.optional || this.rmempty,
				datatype: this.datatype,
				select_placeholder: this.placeholder ?? placeholder,
				validate: this.getValidator(section_id),
				disabled: (this.readonly != null) ? this.readonly : this.map.readonly
			});
		}
		else {
			widget = new ui.Textfield(Array.isArray(value) ? value.join(' ') : value, {
				id: this.cbid(section_id),
				password: this.password,
				optional: this.optional || this.rmempty,
				datatype: this.datatype,
				placeholder: this.placeholder,
				validate: this.getValidator(section_id),
				disabled: (this.readonly != null) ? this.readonly : this.map.readonly
			});
		}

		return widget.render();
	}
});

/**
 * @class DynamicList
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `DynamicList` class represents a multi-value widget allowing the user
 * to enter multiple unique values, optionally selected from a set of
 * predefined choices. It builds upon the {@link LuCI.ui.DynamicList} widget.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * DynamicList：可动态增删的多值列表控件（对应 UCI list 类型）
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为可动态添加和删除条目的列表输入控件。
     每个条目是一个独立的输入框，用户可以：
     - 通过"+"按钮添加新条目
     - 通过"×"按钮删除现有条目
     适合对应 UCI 中的 list 类型选项（一个选项有多个值）。

   【继承自 Value】
     支持 value() 方法添加候选项，条目输入框会变为 Combobox。
     支持所有 AbstractValue 属性（datatype、validate、depends 等）。

   ──────────────────────────────────────────────────────────
   【示例1：DNS 服务器列表（最常见用法）】

     // UCI 中：list dns '8.8.8.8'
     //          list dns '1.1.1.1'
     var o = s.option(form.DynamicList, 'dns', _('DNS 服务器'));
     o.datatype   = 'ipaddr';
     o.placeholder = _('输入 DNS 服务器地址');

   ──────────────────────────────────────────────────────────
   【示例2：带候选项的列表（Combobox + 多值）】

     var o = s.option(form.DynamicList, 'server', _('NTP 服务器'));
     o.datatype = 'host';
     // 添加候选选项后，每个条目变为 Combobox（可选可填）
     o.value('0.openwrt.pool.ntp.org', _('公共 NTP 0'));
     o.value('1.openwrt.pool.ntp.org', _('公共 NTP 1'));
     o.value('2.openwrt.pool.ntp.org', _('公共 NTP 2'));

   ──────────────────────────────────────────────────────────
   【示例3：静态路由的额外属性列表】

     var o = s.option(form.DynamicList, 'blacklist', _('IP 黑名单'));
     o.datatype   = 'cidr';   // 支持 IP 和 CIDR 格式
     o.optional   = true;

   ──────────────────────────────────────────────────────────
   【与 MultiValue 的区别】
     DynamicList：每条目为独立输入框，用户可自由输入
     MultiValue：多个候选项以复选框或多选下拉形式展示，只能选不能自填
     选择原则：
     - 值集合已知且固定 → MultiValue
     - 值集合未知或需要自由输入 → DynamicList
 */
const CBIDynamicList = CBIValue.extend(/** @lends LuCI.form.DynamicList.prototype */ {
	__name__: 'CBI.DynamicList',

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const choices = this.transformChoices();
		const items = L.toArray(value);

		const widget = new ui.DynamicList(items, choices, {
			id: this.cbid(section_id),
			sort: this.keylist,
			optional: this.optional || this.rmempty,
			datatype: this.datatype,
			placeholder: this.placeholder,
			validate: this.getValidator(section_id),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},
});

/**
 * @class ListValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `ListValue` class implements a simple static HTML select element
 * allowing the user to choose a single value from a set of predefined choices.
 * It builds upon the {@link LuCI.ui.Select} widget.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * ListValue：固定选项的下拉选择框（只能从预定义列表中选择）
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为 HTML select 下拉框或一组 radio 单选按钮。
     与 Value（Combobox）的区别：ListValue 不允许自由输入，
     只能从 value() 方法添加的候选项中选择一个。

   【关键属性】

     size         {number}   默认 null
       设置 <select> 元素的 size 属性（显示的选项行数）
       size > 1 时渲染为多行可见的列表框而非折叠下拉框

     widget       {string}   默认 'select'
       'select'：渲染为 <select> 下拉框
       'radio'：渲染为多个 <input type="radio"> 单选按钮组

     orientation  {string}   默认 'horizontal'
       radio 模式下的排列方向：'horizontal'（横排）或 'vertical'（竖排）

   ──────────────────────────────────────────────────────────
   【示例1：协议选择（最常见用法）】

     var o = s.option(form.ListValue, 'proto', _('协议'));
     o.value('none',   _('不配置'));
     o.value('dhcp',   _('DHCP 自动获取'));
     o.value('static', _('静态 IP 地址'));
     o.value('pppoe',  _('PPPoE 拨号'));
     o.value('pptp',   _('PPTP VPN'));
     o.value('l2tp',   _('L2TP VPN'));

   ──────────────────────────────────────────────────────────
   【示例2：加密方式选择（带默认值）】

     var o = s.option(form.ListValue, 'encryption', _('加密方式'));
     o.value('none',  _('不加密（开放）'));
     o.value('psk',   _('WPA-PSK'));
     o.value('psk2',  _('WPA2-PSK（推荐）'));
     o.value('mixed-psk', _('WPA/WPA2-PSK 混合'));
     o.default = 'psk2';  // 默认选择 WPA2

   ──────────────────────────────────────────────────────────
   【示例3：radio 按钮组形式（适合选项少且需要一目了然的场景）】

     var o = s.option(form.ListValue, 'mode', _('无线模式'));
     o.widget = 'radio';
     o.orientation = 'horizontal';
     o.value('ap',      _('接入点（AP）'));
     o.value('sta',     _('客户端（STA）'));
     o.value('adhoc',   _('自组网（Ad-hoc）'));
     o.value('monitor', _('监听模式'));
     o.default = 'ap';

   ──────────────────────────────────────────────────────────
   【示例4：可选的下拉框（带"未指定"选项）】

     var o = s.option(form.ListValue, 'zone', _('防火墙区域'));
     o.optional = true;  // 允许不选（显示"-- Please choose --"）
     o.value('lan',    _('局域网'));
     o.value('wan',    _('广域网'));
     o.value('custom', _('自定义'));

   ──────────────────────────────────────────────────────────
   【示例5：动态添加选项（基于 UCI 数据）】

     var o = s.option(form.ListValue, 'interface', _('绑定接口'));
     // 从已加载的 network 配置中获取所有接口名称
     uci.sections('network', 'interface', function(iface) {
       o.value(iface['.name'], iface['.name'].toUpperCase());
     });

   ──────────────────────────────────────────────────────────
   【ListValue vs Value（Combobox）的选择原则】
     ListValue：选项固定，用户只能选，不能自定义输入
     Value + value()：选项仅作为建议，用户还可以手动输入其他值
 */
const CBIListValue = CBIValue.extend(/** @lends LuCI.form.ListValue.prototype */ {
	__name__: 'CBI.ListValue',

	__init__(...args) {
		this.super('__init__', args);
		this.widget = 'select';
		this.orientation = 'horizontal';
		this.deplist = [];
	},

	/**
	 * Set the size attribute of the underlying HTML select element.
	 *
	 * @name LuCI.form.ListValue.prototype#size
	 * @type number
	 * @default null
	 */

	/**
	 * Set the type of the underlying form controls.
	 *
	 * May be one of `select` or `radio`. If set to `select`, an HTML
	 * select element is rendered, otherwise a collection of `radio`
	 * elements is used.
	 *
	 * @name LuCI.form.ListValue.prototype#widget
	 * @type string
	 * @default select
	 */

	/**
	 * Set the orientation of the underlying radio or checkbox elements.
	 *
	 * May be one of `horizontal` or `vertical`. Only applies to non-select
	 * widget types.
	 *
	 * @name LuCI.form.ListValue.prototype#orientation
	 * @type string
	 * @default horizontal
	 */

	 /** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const choices = this.transformChoices();
		const widget = new ui.Select((cfgvalue != null) ? cfgvalue : this.default, choices, {
			id: this.cbid(section_id),
			size: this.size,
			sort: this.keylist,
			widget: this.widget,
			optional: this.optional,
			orientation: this.orientation,
			placeholder: this.placeholder,
			validate: this.getValidator(section_id),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},
});

/**
 * @class RichListValue
 * @memberof LuCI.form
 * @augments LuCI.form.ListValue
 * @hideconstructor
 * @classdesc

 * The `RichListValue` class implements a simple static HTML select element
 * allowing the user to choose a single value from a set of predefined choices.
 * Each choice may contain a tertiary, more elaborate description.
 * It builds upon the {@link LuCI.form.ListValue} widget.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * RichListValue：带详细描述文字的富下拉框
 * ════════════════════════════════════════════════════════════

   【作用】
     继承自 ListValue，使用 LuCI.ui.Dropdown（而非原生 <select>）渲染，
     每个选项除了标题外还可以附带详细描述文字，帮助用户理解每个选项的含义。
     折叠时显示标题，展开后显示标题+描述。

   【与 ListValue 的区别】
     ListValue：纯文本选项，简洁
     RichListValue：每项带描述，视觉效果更丰富，适合复杂选项的说明

   【value() 方法扩展（与 ListValue 相比多了 description 参数）】
     value(key, title, description?)
       key：存储到 UCI 的值
       title：折叠时显示的标题文字
       description：（可选）展开时在标题下方显示的详细说明
       若不提供 description，行为与 ListValue.value() 相同

   ──────────────────────────────────────────────────────────
   【示例1：WiFi 加密方式（带安全说明）】

     var o = s.option(form.RichListValue, 'encryption', _('加密方式'));

     o.value('none',
       _('无加密'),
       _('开放网络，所有人均可连接，数据不加密，存在安全风险'));

     o.value('psk',
       _('WPA-PSK'),
       _('传统 WPA 加密，兼容性好但安全性较弱'));

     o.value('psk2',
       _('WPA2-PSK（推荐）'),
       _('当前主流加密标准，安全性高，兼容大多数设备'));

     o.value('psk-mixed',
       _('WPA/WPA2-PSK 混合'),
       _('同时支持 WPA 和 WPA2，适合有旧设备的环境'));

     o.value('sae',
       _('WPA3-SAE'),
       _('最新一代 WiFi 安全协议，抗离线字典攻击，需设备支持'));

     o.default = 'psk2';

   ──────────────────────────────────────────────────────────
   【示例2：服务模式选择（带功能说明）】

     var o = s.option(form.RichListValue, 'mode', _('运行模式'));

     o.value('router',
       _('路由器模式'),
       _('NAT 路由，WAN 口连接互联网，LAN 口分配内网 IP'));

     o.value('bridge',
       _('桥接模式'),
       _('作为网络交换机，所有端口在同一网段，无 NAT'));

     o.value('relay',
       _('中继模式'),
       _('连接到上级 WiFi 并转发给有线设备，扩展无线覆盖'));
 */
const CBIRichListValue = CBIListValue.extend(/** @lends LuCI.form.ListValue.prototype */ {
	__name__: 'CBI.RichListValue',

	__init__() {
		this.super('__init__', arguments);
		this.widget = 'select';
		this.orientation = 'horizontal';
		this.deplist = [];
	},

	/**
	 * Set the orientation of the underlying radio or checkbox elements.
	 *
	 * May be one of `horizontal` or `vertical`. Only applies to non-select
	 * widget types.
	 *
	 * @name LuCI.form.RichListValue.prototype#orientation
	 * @type string
	 * @default horizontal
	 */

	/**
	 * Set the size attribute of the underlying HTML select element.
	 *
	 * @name LuCI.form.RichListValue.prototype#size
	 * @type number
	 * @default null
	 */

	/**
	 * Set the type of the underlying form controls.
	 *
	 * May be one of `select` or `radio`. If set to `select`, an HTML
	 * select element is rendered, otherwise a collection of `radio`
	 * elements is used.
	 *
	 * @name LuCI.form.RichListValue.prototype#widget
	 * @type string
	 * @default select
	 */

	 /** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const choices = this.transformChoices();
		const widget = new ui.Dropdown((cfgvalue != null) ? cfgvalue : this.default, choices, {
			id: this.cbid(section_id),
			size: this.size,
			sort: this.keylist,
			widget: this.widget,
			multiple: this.multiple,
			optional: this.optional,
			orientation: this.orientation,
			select_placeholder: this.select_placeholder || this.placeholder,
			custom_placeholder: this.custom_placeholder || this.placeholder,
			validate: this.getValidator(section_id),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},

	/**
	 * Add a predefined choice to the form option. By adding one or more
	 * choices, the plain text input field is turned into a combobox widget
	 * which prompts the user to select a predefined choice, or to enter a
	 * custom value.
	 *
	 * @param {string} key
	 * The choice value to add.
	 *
	 * @param {Node|string} val
	 * The caption for the choice value. May be a DOM node, a document fragment
	 * or a plain text string. If omitted, the `key` value is used as caption.
	 *
	 * @param {Node|string} description
	 * The description text of the choice value. May be a DOM node, a document
	 * fragment or a plain text string. If omitted, the value element is
	 * implemented as a simple ListValue entry.
	 */
	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │  value(key, title?, description?)       [RichListValue 专用]    │
	 * │  添加带描述文字的富选项（比普通 ListValue 的 value() 多一个说明） │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * 【作用】
	 *   与 ListValue.value() 相同，但支持为每个选项附加一段描述文字，
	 *   展开下拉时用户可以看到每个选项的详细说明（闭合时仍只显示标题）。
	 *   若省略 description，退化为普通 ListValue 条目。
	 *
	 * 【参数】
	 *   @param {string}      key          保存到 UCI 的实际值
	 *   @param {string|Node} [title]      选项标题（列表中显示的文字）
	 *   @param {string|Node} [description] 选项详细说明（展开时显示）
	 *
	 * 【使用示例】
	 *
	 *   o = s.option(form.RichListValue, 'routing_algo', _('路由算法'));
	 *
	 *   o.value('batman-iv',
	 *     _('BATMAN IV'),
	 *     _('基于链路质量（TQ）的路由，与所有设备兼容。网格中所有节点必须使用相同算法。')
	 *   );
	 *   o.value('batman-v',
	 *     _('BATMAN V'),
	 *     _('基于吞吐量（ELP）的路由，性能更好，但需要所有节点升级。')
	 *   );
	 *   o.value('none',
	 *     _('无路由'),
	 *     _('禁用路由功能，仅桥接模式。')
	 *   );
	 *
	 *   // 省略 description 时等同于普通 ListValue.value()
	 *   o.value('auto', _('自动检测'));
	 *
	 * 【注意】
	 *   - RichListValue 继承自 ListValue，其他属性（depends/default 等）完全相同
	 *   - 只有 RichListValue 类型的 option 才支持三参数 value()，
	 *     在 ListValue 上调用三参数形式不会显示 description
	 */
	value(value, title, description) {
		if (description) {
			CBIListValue.prototype.value.call(this, value, E([], [
				E('span', { 'class': 'hide-open' }, [ title ]),
				E('div', { 'class': 'hide-close', 'style': 'min-width:25vw' }, [
					E('strong', [ title ]),
					E('br'),
					E('span', { 'style': 'white-space:normal' }, description)
				])
			]));
		}
		else {
			CBIListValue.prototype.value.call(this, value, title);
		}
	}
});

/**
 * @class RangeSliderValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `RangeSliderValue` class implements a range slider input using
 * {@link LuCI.ui.RangeSlider}. It is useful in cases where a value shall fall
 * within a predetermined range. This helps omit various error checks for such
 * values. The currently chosen value is displayed to the side of the slider.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * RangeSliderValue：数值范围滑块控件
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为 HTML range input 滑块，用于在指定数值范围内选择值。
     当前选中值实时显示在滑块旁，也可以用 calculate 函数显示转换后的值。

   【关键属性】

     min         {number}   默认 0
       滑块最小值

     max         {number}   默认 100
       滑块最大值

     step        {number|string}  默认 1
       滑块步长；'any' 表示任意精度浮点数

     default     {string}   默认 null
       默认值（若当前值等于默认值，保存时不写入 UCI，即视为"未设置"）

     calculate   {function}  默认 null
       值变化时调用的转换函数，返回值显示在滑块下方。
       函数签名：(value) => string
       适合将原始数值转换为更直观的展示（如毫秒转秒、dBm 转信号强度）

     calcunits   {string}   默认 null
       显示在 calculate 结果后的单位字符串（如 'ms'、'dBm'、'%'）

   ──────────────────────────────────────────────────────────
   【示例1：WiFi 发射功率（最常见用法）】

     var o = s.option(form.RangeSliderValue, 'txpower', _('发射功率'));
     o.min  = 0;
     o.max  = 30;    // dBm 范围
     o.step = 1;
     o.calcunits = 'dBm';

   ──────────────────────────────────────────────────────────
   【示例2：带换算显示（毫瓦换算为 dBm）】

     var o = s.option(form.RangeSliderValue, 'txpower', _('发射功率'));
     o.min  = 0;
     o.max  = 100;
     o.step = 1;
     o.calculate = function(val) {
       // 将百分比转换为大约的 dBm 值
       return (10 * Math.log10(val)).toFixed(1);
     };
     o.calcunits = 'dBm';

   ──────────────────────────────────────────────────────────
   【示例3：连接超时设置（秒数）】

     var o = s.option(form.RangeSliderValue, 'timeout', _('超时时间'));
     o.min     = 5;
     o.max     = 300;
     o.step    = 5;
     o.default = '30';
     o.calcunits = _('秒');
 */
const CBIRangeSliderValue = CBIValue.extend(/** @lends LuCI.form.RangeSliderValue.prototype */ {
	__name__: 'CBI.RangeSliderValue',

	/**
	 * Minimum value the slider can represent.
	 * @name LuCI.form.RangeSliderValue.prototype#min
	 * @type number
	 * @default 0
	 */

	/**
	 * Maximum value the slider can represent.
	 * @name LuCI.form.RangeSliderValue.prototype#max
	 * @type number
	 * @default 100
	 */

	/**
	 * Step size for each tick of the slider, or the special value "any" when
	 * handling arbitrary precision floating point numbers.
	 * @name LuCI.form.RangeSliderValue.prototype#step
	 * @type string
	 * @default 1
	 */

	/**
	 * Set the default value for the slider. The default value is elided during
	 * save: meaning, a currently chosen value which matches the default is
	 * not saved.
	 * @name LuCI.form.RangeSliderValue.prototype#default
	 * @type string
	 * @default null
	 */

	/**
	 * Override the calculate action.
	 *
	 * When this property is set to a function, it is invoked when the slider
	 * is adjusted. This might be useful to calculate and display a result which
	 * is more meaningful than the currently chosen value. The calculated value
	 * is displayed below the slider.
	 *
	 * @name LuCI.form.RangeSliderValue.prototype#calculate
	 * @type function
	 * @default null
	 */

	/**
	 * Define the units of the calculated value.
	 *
	 * Suffix a unit string to the calculated value, e.g. 'seconds' or 'dBm'.
	 *
	 * @name LuCI.form.RangeSliderValue.prototype#calcunits
	 * @type string
	 * @default null
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const slider = new ui.RangeSlider((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			name: this.cbid(section_id),
			min: this.min,
			max: this.max,
			step: this.step,
			calculate: this.calculate,
			calcunits: this.calcunits,
			disabled: this.readonly || this.disabled,
			datatype: this.datatype,
			validate: this.getValidator(section_id),
		});

		this.widget = slider;

		return slider.render();
	},

	/**
	 * 读取当前滑块的选中值。
	 *
	 * 特殊处理：若当前值等于 this.default，返回 null（表示"使用默认值"）。
	 * 这与 AbstractValue.parse() 的逻辑配合：
	 *   返回 null 时，rmempty=true 的字段会从 UCI 中删除该选项，
	 *   从而让该选项使用 OpenWrt 服务/守护进程的内置默认值。
	 *
	 * @override
	 * @param {string} section_id - UCI section ID
	 * @returns {string|null} 当前值字符串，或等于默认值时返回 null
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		if (!elem) return null;
		const val = elem.getValue().toString();
		return (val === this.default?.toString()) ? null : val;
	}
});

/**
 * @class FlagValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `FlagValue` element builds upon the {@link LuCI.ui.Checkbox} widget to
 * implement a simple checkbox element.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * FlagValue（Flag）：布尔开关复选框控件
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为一个复选框（HTML input[type=checkbox]）。
     勾选时将 enabled 属性值写入 UCI，取消勾选时写入 disabled 属性值。
     适合对应 UCI 中的布尔型选项（如 enabled、disabled、option等）。

   【关键属性】

     enabled     {string}   默认 '1'
       复选框被勾选时写入 UCI 的值
       常见配置：'1'、'true'、'yes'、'on'、'enabled'

     disabled    {string}   默认 '0'
       复选框未勾选时写入 UCI 的值
       常见配置：'0'、'false'、'no'、'off'、'disabled'

     default     {string}   默认继承 this.disabled（即 '0'）
       表单的初始状态（建议显式设置）

     tooltip     {string|function}  默认 null
       复选框旁边显示的提示气泡文字。
       函数形式：(section_id) => string | null
       null 返回值：不显示提示

     tooltipicon {string}   默认 'ℹ️'
       提示图标的 HTML 或图片路径

   【重要说明】
     FlagValue 与普通 Value 的 rmempty 行为不同：
     当 formvalue == default 时，若 optional=true 或 rmempty=true，
     会从 UCI 中删除该选项（即恢复 UCI 默认值而非显式存储）。
     为了总是保存明确的值，请设置 o.rmempty = false。

   ──────────────────────────────────────────────────────────
   【示例1：服务启用开关（最常见用法）】

     var o = s.option(form.Flag, 'enabled', _('启用服务'));
     // 勾选=写入'1'，取消=写入'0'，默认启用
     o.default = o.enabled = '1';
     o.rmempty = false;  // 总是保存该值，不管是否为默认值

   ──────────────────────────────────────────────────────────
   【示例2：禁用开关（逻辑取反）】

     // UCI 中 'disabled 1' 表示禁用，'disabled 0' 表示启用
     var o = s.option(form.Flag, 'disabled', _('禁用'));
     o.enabled  = '1';   // 勾选时写 '1'（即禁用状态）
     o.disabled = '0';   // 取消时写 '0'（即启用状态）
     o.default  = '0';   // 默认不禁用（即默认启用）

   ──────────────────────────────────────────────────────────
   【示例3：特殊值的布尔选项】

     // 某些配置使用 'yes'/'no' 而非 '1'/'0'
     var o = s.option(form.Flag, 'log_queries', _('记录查询日志'));
     o.enabled  = 'yes';
     o.disabled = 'no';
     o.default  = 'no';

   ──────────────────────────────────────────────────────────
   【示例4：带提示说明的复选框】

     var o = s.option(form.Flag, 'rebind_protection',
         _('DNS 重绑定攻击防护'));
     o.default = o.enabled = '1';
     o.tooltip = _('启用后，dnsmasq 将过滤可能导致 DNS 重绑定攻击的响应。' +
                   '如果某些内网域名无法解析，请尝试关闭此选项。');

   ──────────────────────────────────────────────────────────
   【示例5：依赖其他选项的开关】

     var enabled = s.option(form.Flag, 'enabled', _('启用'));
     enabled.default = enabled.enabled = '1';

     var advanced = s.option(form.Flag, 'advanced', _('高级模式'));
     advanced.depends('enabled', '1');  // 只在服务启用时显示
     advanced.default = advanced.disabled = '0';

   ──────────────────────────────────────────────────────────
   【formvalue() 和 textvalue() 的行为】
     formvalue() → 根据勾选状态返回 enabled 或 disabled 的值（如 '1' 或 '0'）
     textvalue() → 返回本地化的 '是' 或 '否' 文字（用于 TableSection 的文字预览）
 */
const CBIFlagValue = CBIValue.extend(/** @lends LuCI.form.FlagValue.prototype */ {
	__name__: 'CBI.FlagValue',

	__init__(...args) {
		this.super('__init__', args);

		this.enabled  = '1';   // 勾选时写入 UCI 的值（可覆盖为 'yes'/'on'/'true' 等）
		this.disabled = '0';   // 未勾选时写入 UCI 的值（可覆盖为 'no'/'off' 等）
		this.default  = this.disabled;  // 默认值（建议在构造后显式设置）
	},

	/**
	 * Sets the input value to use for the checkbox checked state.
	 *
	 * @name LuCI.form.FlagValue.prototype#enabled
	 * @type string
	 * @default 1
	 */

	/**
	 * Sets the input value to use for the checkbox unchecked state.
	 *
	 * @name LuCI.form.FlagValue.prototype#disabled
	 * @type string
	 * @default 0
	 */

	/**
	 * Set a tooltip for the flag option.
	 *
	 * Set to a string, it will be used as-is as a tooltip.
	 *
	 * Set to a function, the function will be invoked and the return
	 * value will be shown as a tooltip. If the return value of the function
	 * is `null` no tooltip will be set.
	 *
	 * @name LuCI.form.FlagValue.prototype#tooltip
	 * @type string|function
	 * @default null
	 */

	/**
	 * Set a tooltip icon for the flag option.
	 *
	 * If set, this icon will be shown for the default one.
	 * This could also be a png icon from the resources directory.
	 *
	 * @name LuCI.form.FlagValue.prototype#tooltipicon
	 * @type string
	 * @default 'ℹ️';
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		let tooltip = null;

		if (typeof(this.tooltip) == 'function')
			tooltip = this.tooltip(section_id);
		else if (typeof(this.tooltip) == 'string')
			tooltip = this.tooltip.format(section_id);

		const widget = new ui.Checkbox((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			value_enabled: this.enabled,
			value_disabled: this.disabled,
			validate: this.getValidator(section_id),
			tooltip,
			tooltipicon: this.tooltipicon,
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},

	/**
	 * Query the checked state of the underlying checkbox widget and return
	 * either the `enabled` or the `disabled` property value, depending on
	 * the checked state.
	 *
	 * @override
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		const checked = elem ? elem.isChecked() : false;
		return checked ? this.enabled : this.disabled;
	},

	/**
	 * Query the checked state of the underlying checkbox widget and return
	 * either a localized `Yes` or `No` string, depending on the checked state.
	 *
	 * @override
	 */
	textvalue(section_id) {
		let cval = this.cfgvalue(section_id);

		if (cval == null)
			cval = this.default;

		return (cval == this.enabled) ? _('Yes') : _('No');
	},

	/**
	 * 解析 Flag 控件的当前值并写入 UCI（覆盖 AbstractValue.parse）。
	 *
	 * Flag 的特殊逻辑：
	 *   - 若当前值等于 default，且 optional=true 或 rmempty=true，
	 *     则调用 remove() 从 UCI 中删除该选项（恢复 UCI 默认值状态）
	 *   - 否则调用 write() 写入 enabled 或 disabled 值
	 *   - 依赖不满足（隐藏）且 retain=false 时调用 remove()
	 *
	 * @override
	 * @param {string} section_id - UCI section ID
	 * @returns {Promise<void>}
	 */
	parse(section_id) {
		if (this.isActive(section_id)) {
			const fval = this.formvalue(section_id);

			if (!this.isValid(section_id)) {
				const title = this.stripTags(this.title).trim();
				const error = this.getValidationError(section_id);

				return Promise.reject(new TypeError(
					`${_('Option "%s" contains an invalid input value.').format(title || this.option)} ${error}`));
			}

			if (fval == this.default && (this.optional || this.rmempty))
				return Promise.resolve(this.remove(section_id));
			else
				return Promise.resolve(this.write(section_id, fval));
		}
		else if (!this.retain) {
			return Promise.resolve(this.remove(section_id));
		}
	},
});

/**
 * @class MultiValue
 * @memberof LuCI.form
 * @augments LuCI.form.DynamicList
 * @hideconstructor
 * @classdesc

 * The `MultiValue` class is a modified variant of the `DynamicList` element
 * which leverages the {@link LuCI.ui.Dropdown} widget to implement a multi
 * select dropdown element.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * MultiValue：多选下拉框控件（选多个固定选项）
 * ════════════════════════════════════════════════════════════

   【作用】
     继承自 DynamicList，使用 LuCI.ui.Dropdown（multiple=true）渲染。
     将预定义的选项以多选下拉框形式展示，用户可以同时选择多个值。
     选中的值作为 UCI list 存储。

   【与 DynamicList 的区别】
     MultiValue：只能选择预设选项（不能自由输入），折叠显示已选项
     DynamicList：可以自由输入，每个值是独立的输入框

   【关键属性（除继承的外）】

     create       {boolean}  默认 null
       true：允许用户在下拉框中输入自定义值（不仅限于预设选项）
       null/false：只能选预设选项

     display_size {number}   默认 null（使用 size 属性或默认 3）
       下拉框折叠时显示的最大选项数（超出显示"..."）

     dropdown_size {number}  默认 null（使用 size 属性或默认 -1，即不限）
       下拉框展开后显示的最大选项行数

   ──────────────────────────────────────────────────────────
   【示例1：允许管理界面访问的接口列表】

     // UCI: list listen_interfaces 'lan'
     //       list listen_interfaces 'loopback'
     var o = s.option(form.MultiValue, 'listen_interfaces', _('监听接口'));
     o.optional = true;

     uci.sections('network', 'interface', function(iface) {
       o.value(iface['.name'], iface['.name'].toUpperCase());
     });

   ──────────────────────────────────────────────────────────
   【示例2：多个防火墙区域（预设区域列表）】

     var o = s.option(form.MultiValue, 'extra_zones', _('额外防火墙区域'));
     o.value('lan',    _('局域网（lan）'));
     o.value('wan',    _('广域网（wan）'));
     o.value('vpn',    _('VPN 区域'));
     o.value('guest',  _('访客网络'));
     o.display_size = 2;  // 折叠时最多显示2个已选项

   ──────────────────────────────────────────────────────────
   【示例3：允许自定义输入的多选框（create=true）】

     var o = s.option(form.MultiValue, 'tags', _('标签'));
     o.create = true;  // 允许用户输入新标签
     o.value('default',  _('默认'));
     o.value('critical', _('重要'));
     o.value('monitor',  _('监控'));
 */
const CBIMultiValue = CBIDynamicList.extend(/** @lends LuCI.form.MultiValue.prototype */ {
	__name__: 'CBI.MultiValue',

	/**
	 * 初始化 MultiValue，设置默认占位提示文字。
	 * 下拉框未选中任何选项时显示 '-- Please choose --'（已国际化）。
	 */
	__init__(...args) {
		this.super('__init__', args);
		this.placeholder = _('-- Please choose --');
	},

	/**
	 * Allows custom value entry in addition to those already specified.
	 *
	 * @name LuCI.form.MultiValue.prototype#create
	 * @type boolean
	 * @default null
	 */

	/**
	 * Allows specifying the [display_items]{@link LuCI.ui.Dropdown.InitOptions}
	 * property of the underlying dropdown widget. If omitted, the value of
	 * the `size` property is used or `3` when `size` is also unspecified.
	 *
	 * @name LuCI.form.MultiValue.prototype#display_size
	 * @type number
	 * @default null
	 */

	/**
	 * Allows specifying the [dropdown_items]{@link LuCI.ui.Dropdown.InitOptions}
	 * property of the underlying dropdown widget. If omitted, the value of
	 * the `size` property is used or `-1` when `size` is also unspecified.
	 *
	 * @name LuCI.form.MultiValue.prototype#dropdown_size
	 * @type number
	 * @default null
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const choices = this.transformChoices();

		const widget = new ui.Dropdown(L.toArray(value), choices, {
			id: this.cbid(section_id),
			sort: this.keylist,
			multiple: true,
			optional: this.optional || this.rmempty,
			select_placeholder: this.placeholder,
			create: this.create,
			display_items: this.display_size ?? this.size ?? 3,
			dropdown_items: this.dropdown_size ?? this.size ?? -1,
			validate: this.getValidator(section_id),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},
});

/**
 * @class TextValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `TextValue` class implements a multi-line textarea input using
 * {@link LuCI.ui.Textarea}.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * TextValue：多行文本域控件（textarea）
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为 HTML <textarea> 多行文本输入区域。
     适合需要输入多行内容的场景：脚本代码、证书内容、配置片段、
     IP 规则列表等。

   【关键属性（除继承的外）】

     monospace   {boolean}  默认 false
       true：使用等宽字体（Monospace）显示，适合代码/配置内容

     cols        {number}   默认 null（自动）
       文本域的字符列数（控制宽度）

     rows        {number}   默认 null（自动）
       文本域的行数（控制高度）

     wrap        {string}   默认 null
       文本换行方式：'soft'（显示换行不提交）或 'hard'（提交时插入换行符）

     placeholder {string}   默认 null
       空时显示的提示文字

   【注意】
     TextValue 的 value() 方法被设置为 null（禁用），
     因为 textarea 不支持下拉候选选项。

   ──────────────────────────────────────────────────────────
   【示例1：自定义防火墙规则脚本】

     var o = s.option(form.TextValue, 'extra_rules', _('自定义防火墙规则'));
     o.monospace  = true;
     o.rows       = 10;
     o.placeholder = _('每行一条 iptables 规则，例如：
-A INPUT -p tcp --dport 8080 -j ACCEPT');
     o.optional   = true;

   ──────────────────────────────────────────────────────────
   【示例2：SSH 公钥输入】

     var o = s.option(form.TextValue, 'authorized_keys', _('SSH 授权密钥'));
     o.monospace = true;
     o.rows      = 5;
     o.cols      = 80;
     o.optional  = true;

   ──────────────────────────────────────────────────────────
   【示例3：SSL 证书内容】

     var o = s.option(form.TextValue, 'cert', _('SSL 证书'));
     o.monospace = true;
     o.rows      = 8;
     o.validate  = function(sid, val) {
       if (val && !val.includes('-----BEGIN CERTIFICATE-----'))
         return _('无效的 PEM 格式证书');
       return true;
     };

   ──────────────────────────────────────────────────────────
   【示例4：IP 地址列表（每行一个）】

     var o = s.option(form.TextValue, 'ip_list', _('IP 白名单'));
     o.monospace = true;
     o.rows      = 6;
     o.placeholder = _('每行输入一个 IP 地址或 CIDR 网段');
     o.optional  = true;
 */
const CBITextValue = CBIValue.extend(/** @lends LuCI.form.TextValue.prototype */ {
	__name__: 'CBI.TextValue',

	/**
	 * TextValue 禁用了 Value.value() 方法。
	 * textarea 不支持候选下拉列表，调用 value() 无效（被设为 null）。
	 * 若需要多选输入，请改用 DynamicList 或 MultiValue。
	 * @ignore
	 */
	value: null,

	/**
	 * Enforces the use of a monospace font for the textarea contents when set
	 * to `true`.
	 *
	 * @name LuCI.form.TextValue.prototype#monospace
	 * @type boolean
	 * @default false
	 */

	/**
	 * Allows specifying the [cols]{@link LuCI.ui.Textarea.InitOptions}
	 * property of the underlying textarea widget.
	 *
	 * @name LuCI.form.TextValue.prototype#cols
	 * @type number
	 * @default null
	 */

	/**
	 * Allows specifying the [rows]{@link LuCI.ui.Textarea.InitOptions}
	 * property of the underlying textarea widget.
	 *
	 * @name LuCI.form.TextValue.prototype#rows
	 * @type number
	 * @default null
	 */

	/**
	 * Allows specifying the [wrap]{@link LuCI.ui.Textarea.InitOptions}
	 * property of the underlying textarea widget.
	 *
	 * @name LuCI.form.TextValue.prototype#wrap
	 * @type number
	 * @default null
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;

		const widget = new ui.Textarea(value, {
			id: this.cbid(section_id),
			optional: this.optional || this.rmempty,
			placeholder: this.placeholder,
			monospace: this.monospace,
			cols: this.cols,
			rows: this.rows,
			wrap: this.wrap,
			validate: this.getValidator(section_id),
			readonly: (this.readonly != null) ? this.readonly : this.map.readonly,
			disabled: (this.disabled != null) ? this.disabled : null,
		});

		return widget.render();
	}
});

/**
 * @class DummyValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `DummyValue` element wraps a {@link LuCI.ui.Hiddenfield} widget and
 * renders the underlying UCI option or default value as readonly text.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * DummyValue：只读展示控件（显示值但不允许编辑）
 * ════════════════════════════════════════════════════════════

   【作用】
     将 UCI 选项的当前值（或 default 属性值）渲染为只读文本输出。
     底层使用隐藏 input 保存值，渲染为 <output> 元素显示。
     适合在配置表单中展示状态信息、计算结果或不可修改的配置项。

   【关键属性（除继承的外）】

     href        {string}   默认 null
       设置后将展示文本包裹在 <a> 链接中，点击跳转到该 URL。
       只读模式下不显示链接（只显示文本）。

     rawhtml     {boolean}  默认 null
       null/false：对值进行 HTML 转义后显示（安全，防止 XSS）
       true：直接将值作为 HTML 渲染（允许包含 HTML 标签）
       注意：使用 true 时必须确保数据来源安全。

     hidden      {boolean}  默认 null
       true：使用 CSS display:none 隐藏显示元素（但隐藏 input 仍存在）
       适合需要值参与依赖计算但不需要显示的场景。

   【与 HiddenValue 的区别】
     DummyValue：有可见的 <output> 显示值，有 <input type=hidden> 参与提交
     HiddenValue：只有 <input type=hidden>，完全不可见

   【write/remove 均为空操作】
     DummyValue 不会向 UCI 写入或删除任何值（纯展示）。

   ──────────────────────────────────────────────────────────
   【示例1：显示当前 WAN IP 地址（动态计算）】

     var o = s.option(form.DummyValue, '_wan_ip', _('当前 WAN IP'));
     o.cfgvalue = function(sid) {
       // 从 ubus 状态数据中读取（需要在 load() 中通过 RPC 获取）
       var status = this.map.data['_status'];
       return (status && status['ipv4-address'] && status['ipv4-address'][0])
         ? status['ipv4-address'][0].address
         : _('未连接');
     };

   ──────────────────────────────────────────────────────────
   【示例2：带链接的只读值（点击跳转相关页面）】

     var o = s.option(form.DummyValue, 'hostname', _('主机名'));
     // 点击主机名跳转到系统设置页
     o.href = L.url('admin/system');

   ──────────────────────────────────────────────────────────
   【示例3：显示 HTML 内容（rawhtml=true）】

     var o = s.option(form.DummyValue, '_status_html', _('状态'));
     o.rawhtml = true;
     o.cfgvalue = function(sid) {
       var up = uci.get('network', sid, 'up');
       return up
         ? '<span style="color:green">● ' + _('已连接') + '</span>'
         : '<span style="color:red">● '   + _('未连接') + '</span>';
     };

   ──────────────────────────────────────────────────────────
   【示例4：在 TableSection 中展示状态信息列】

     var s = m.section(form.TableSection, 'interface', _('接口状态'));
     s.option(form.DummyValue, 'proto',  _('协议'));
     s.option(form.DummyValue, 'ipaddr', _('IP 地址'));
     // 配合自定义 cfgvalue 显示实时状态
     var o = s.option(form.DummyValue, '_uptime', _('在线时长'));
     o.cfgvalue = function(sid) {
       return formatUptime(statusData[sid] && statusData[sid].uptime);
     };
 */
const CBIDummyValue = CBIValue.extend(/** @lends LuCI.form.DummyValue.prototype */ {
	__name__: 'CBI.DummyValue',

	/**
	 * Set a URL which is opened when clicking on the dummy value text.
	 *
	 * By setting this property, the dummy value text is wrapped in an `<a>`
	 * element with the property value used as `href` attribute.
	 *
	 * @name LuCI.form.DummyValue.prototype#href
	 * @type string
	 * @default null
	 */

	/**
	 * Treat the UCI option value (or the `default` property value) as HTML.
	 *
	 * By default, the value text is HTML escaped before being rendered as
	 * text. In some cases, HTML content may need to be interpreted and
	 * rendered as-is. When set to `true`, HTML escaping is disabled.
	 *
	 * @name LuCI.form.DummyValue.prototype#rawhtml
	 * @type boolean
	 * @default null
	 */

	/**
	 * Render the UCI option value as hidden using the HTML 'display: none'
	 * style property.
	 *
	 * By default, the value is displayed.
	 *
	 * @name LuCI.form.DummyValue.prototype#hidden
	 * @type boolean
	 * @default null
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const hiddenEl = new ui.Hiddenfield(value, { id: this.cbid(section_id) });
		const outputEl = E('output', { 'style': this.hidden ? 'display:none' : null,
			'for': this.cbid(section_id)});

		if (this.href && !((this.readonly != null) ? this.readonly : this.map.readonly))
			outputEl.appendChild(E('a', { 'href': this.href }));

		dom.append(outputEl.lastChild ?? outputEl,
			this.rawhtml ? value : [ value ]);

		return E([
			outputEl,
			hiddenEl.render()
		]);
	},

	/** @override */
	remove() {},

	/** @override */
	write() {}
});

/**
 * @class ButtonValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `ButtonValue` element wraps a {@link LuCI.ui.Hiddenfield} widget and
 * renders the underlying UCI option or default value as readonly text.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * ButtonValue（Button）：操作按钮控件
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为一个操作按钮（HTML <button>）。
     底层同样有隐藏 input 保存当前 UCI 值（供依赖检查使用）。
     点击按钮时执行自定义操作（如重启服务、测试连接、下载配置等）。
     不直接读写 UCI 配置值（write/remove 均为空操作）。

   【关键属性】

     inputtitle  {string|function}  默认 null
       按钮显示的文字。
       字符串：直接作为按钮文字
       函数：(section_id) => string，返回动态文字
       若为 null，使用 option 的 title 属性作为按钮文字

     inputstyle  {string}   默认 null
       按钮的 CSS 样式类（追加到 'cbi-button' 后）。
       常用值：
         'apply'   → 蓝色应用按钮
         'reset'   → 灰色重置按钮
         'save'    → 绿色保存按钮
         'remove'  → 红色删除按钮
         'action'  → 橙色操作按钮
         'add'     → 绿色添加按钮

     onclick     {function}  默认 null
       按钮点击事件处理函数。
       函数签名：(ev, section_id) => void | Promise
       返回 Promise 时：在 Promise pending 期间按钮显示加载状态并禁用点击
       返回 void 时：立即恢复可用状态

   ──────────────────────────────────────────────────────────
   【示例1：重启服务按钮】

     var o = s.option(form.Button, '_restart', _('服务控制'));
     o.inputtitle = _('重启服务');
     o.inputstyle = 'apply';
     o.onclick = function(ev, sid) {
       return ui.showModal(_('重启中…'), [
         E('p', _('正在重启服务，请稍候…'))
       ], callRestartService().then(() => {
         ui.hideModal();
         return map.reset();  // 重新渲染表单
       }));
     };

   ──────────────────────────────────────────────────────────
   【示例2：测试连接按钮（动态状态显示）】

     var o = s.option(form.Button, '_test', _(''));
     o.inputtitle = _('测试连接');
     o.inputstyle = 'action';
     o.onclick = function(ev, sid) {
       var host = uci.get('myconfig', sid, 'server');
       return callPingTest(host).then(function(result) {
         if (result.success)
           ui.addNotification(null, E('p', _('连接成功！延迟: %dms').format(result.latency)), 'info');
         else
           ui.addNotification(null, E('p', _('连接失败: %s').format(result.error)), 'danger');
       });
     };

   ──────────────────────────────────────────────────────────
   【示例3：动态按钮文字（根据 section 状态显示不同文字）】

     var o = s.option(form.Button, '_toggle', _(''));
     o.inputtitle = function(sid) {
       var enabled = uci.get('myservice', sid, 'enabled');
       return enabled === '1' ? _('禁用服务') : _('启用服务');
     };
     o.inputstyle = function(sid) {
       var enabled = uci.get('myservice', sid, 'enabled');
       return enabled === '1' ? 'remove' : 'apply';
     };
     o.onclick = function(ev, sid) {
       var enabled = uci.get('myservice', sid, 'enabled') === '1';
       uci.set('myservice', sid, 'enabled', enabled ? '0' : '1');
       return map.save(null, true);
     };

   ──────────────────────────────────────────────────────────
   【示例4：在 TableSection 中每行都有操作按钮】

     var s = m.section(form.TableSection, 'host', _('设备列表'));
     s.addremove = true;

     s.option(form.Value, 'name', _('名称'));
     s.option(form.Value, 'ip',   _('IP 地址'));

     var o = s.option(form.Button, '_ping', _('操作'));
     o.inputtitle = _('Ping');
     o.inputstyle = 'action';
     o.onclick = function(ev, sid) {
       var ip = uci.get('myconfig', sid, 'ip');
       return callPingHost(ip).then(ok => {
         alert(ok ? 'Ping 成功' : 'Ping 失败');
       });
     };
 */
const CBIButtonValue = CBIValue.extend(/** @lends LuCI.form.ButtonValue.prototype */ {
	__name__: 'CBI.ButtonValue',

	/**
	 * Override the rendered button caption.
	 *
	 * By default, the option title - which is passed as the fourth argument to the
	 * constructor - is used as a caption for the button element. When setting
	 * this property to a string, it is used as a `String.format()` pattern with
	 * the underlying UCI section name passed as the first format argument. When
	 * set to a function, it is invoked passing the section ID as the sole argument,
	 * and the resulting return value is converted to a string before being
	 * used as a button caption.
	 *
	 * The default of `null` means the option title is used as caption.
	 *
	 * @name LuCI.form.ButtonValue.prototype#inputtitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * Override the button style class.
	 *
	 * By setting this property, a specific `cbi-button-*` CSS class can be
	 * selected to influence the style of the resulting button.
	 *
	 * Suitable values which are implemented by most themes are `positive`,
	 * `negative` and `primary`.
	 *
	 * The default of `null` means a neutral button styling is used.
	 *
	 * @name LuCI.form.ButtonValue.prototype#inputstyle
	 * @type string
	 * @default null
	 */

	/**
	 * Override the button click action.
	 *
	 * By default, the underlying UCI option (or default property) value is
	 * copied into a hidden field tied to the button element and the save
	 * action is triggered on the parent form element.
	 *
	 * When this property is set to a function, it is invoked instead of
	 * performing the default actions. The handler function will receive the
	 * DOM click element as the first and the underlying configuration section ID
	 * as the second argument.
	 *
	 * @name LuCI.form.ButtonValue.prototype#onclick
	 * @type function
	 * @default null
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const hiddenEl = new ui.Hiddenfield(value, { id: this.cbid(section_id) });
		const outputEl = E('output', {'for': this.cbid(section_id)});
		const btn_title = this.titleFn('inputtitle', section_id) ?? this.titleFn('title', section_id);

		if (value !== false)
			dom.content(outputEl, [
				E('button', {
					'class': 'cbi-button cbi-button-%s'.format(this.inputstyle ?? 'button'),
					'click': ui.createHandlerFn(this, (section_id, ev) => {
						if (this.onclick)
							return this.onclick(ev, section_id);

						ev.currentTarget.parentNode.nextElementSibling.value = value;
						return this.map.save();
					}, section_id),
					'disabled': (this.readonly ?? this.map.readonly) || null
				}, [ btn_title ])
			]);
		else
			dom.content(outputEl, ' - ');

		return E([
			outputEl,
			hiddenEl.render()
		]);
	}
});

/**
 * @class HiddenValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `HiddenValue` element wraps a {@link LuCI.ui.Hiddenfield} widget.

 * Hidden value widgets used to be necessary in legacy code which actually
 * submitted the underlying HTML form the server. With client side handling of
 * forms, there are more efficient ways to store hidden state data.

 * Since this widget has no visible content, the title and description values
 * of this form element should be set to `null` as well to avoid a broken or
 * distorted form layout when rendering the option element.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added to. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * HiddenValue：隐藏字段控件（完全不可见）
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为 HTML <input type="hidden">，完全不在界面上显示。
     参与完整的表单数据流（load/parse/write），但用户看不到也无法编辑。
     适合在表单中携带需要保存但不需要用户操作的内部数据。

   【与 DummyValue 的区别】
     DummyValue：有可见的 <output> 显示，适合展示状态
     HiddenValue：完全不可见，适合内部数据传递

   ──────────────────────────────────────────────────────────
   【示例1：保存版本号或内部标识】

     var o = s.option(form.HiddenValue, '_config_version', '');
     o.default = '2';      // 每次保存时写入版本号
     o.rmempty = false;    // 始终保存该值

   ──────────────────────────────────────────────────────────
   【示例2：携带依赖检查所需的状态值】

     // 从 RPC 获取设备能力标志，用于影响其他 option 的 depends
     var o = s.option(form.HiddenValue, '_has_wifi', '');
     o.cfgvalue = function(sid) {
       return this.map.wifiCapable ? '1' : '0';
     };
     o.write = function() {};  // 不写入 UCI

     // 其他 option 依赖这个隐藏字段
     var wifiOpt = s.option(form.Value, 'ssid', _('SSID'));
     wifiOpt.depends('_has_wifi', '1');
 */
const CBIHiddenValue = CBIValue.extend(/** @lends LuCI.form.HiddenValue.prototype */ {
	__name__: 'CBI.HiddenValue',

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const widget = new ui.Hiddenfield((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id)
		});

		return widget.render();
	}
});

/**
 * @class FileUpload
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `FileUpload` element wraps a {@link LuCI.ui.FileUpload} widget and
 * offers the ability to browse, upload and select remote files.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * FileUpload：文件上传/路径选择器控件
 * ════════════════════════════════════════════════════════════

   【作用】
     渲染为文件浏览器和上传控件（基于 LuCI.ui.FileUpload 控件）。
     允许用户从路由器的文件系统中浏览和选择文件，
     或将本地计算机的文件上传到路由器，
     最终将选中文件的完整路径保存到 UCI 选项中。

   【关键属性】

     browser        {boolean}  默认 true
       true：显示文件浏览器按钮（可浏览路由器文件系统）
       false：只显示路径输入框（不提供浏览功能）

     root_directory {string}   默认 '/tmp'
       文件浏览器的根目录（用户无法浏览此目录之外的路径）。
       这只是 UI 限制，实际的文件系统访问权限由 ACL 控制。

     enable_upload  {boolean}  默认 false
       true：显示"上传文件"按钮，允许用户从本地上传文件到路由器

     enable_remove  {boolean}  默认 false
       true：显示"删除"按钮，允许用户删除路由器上的文件
       这只是 UI 控制，实际删除权限由 session ACL 决定。

     enable_download {boolean}  默认 false
       true：允许下载文件到本地

     show_hidden    {boolean}  默认 true
       true：在文件浏览器中显示隐藏文件（以 '.' 开头的文件）

   ──────────────────────────────────────────────────────────
   【示例1：SSL 证书文件路径选择（带上传功能）】

     var o = s.option(form.FileUpload, 'cert', _('SSL 证书文件'));
     o.root_directory  = '/etc/ssl/certs';
     o.enable_upload   = true;    // 允许上传
     o.enable_remove   = false;   // 不允许删除
     o.optional        = true;

   ──────────────────────────────────────────────────────────
   【示例2：选择 UCI 配置中的脚本路径】

     var o = s.option(form.FileUpload, 'script', _('自定义脚本路径'));
     o.root_directory = '/etc/myapp';
     o.browser        = true;
     o.enable_upload  = true;
     o.datatype       = 'file';   // 验证路径格式（可选）

   ──────────────────────────────────────────────────────────
   【示例3：选择日志文件目录下的文件】

     var o = s.option(form.FileUpload, 'logfile', _('日志文件'));
     o.root_directory = '/var/log';
     o.enable_upload  = false;   // 不允许上传（只读浏览）
     o.show_hidden    = false;   // 隐藏以 '.' 开头的文件
 */
const CBIFileUpload = CBIValue.extend(/** @lends LuCI.form.FileUpload.prototype */ {
	__name__: 'CBI.FileSelect',

	__init__(...args) {
		this.super('__init__', args);

		this.browser = false;
		this.directory_create = false;
		this.directory_select = false;
		this.show_hidden = false;
		this.enable_upload = true;
		this.enable_remove = true;
		this.enable_download = false;
		this.root_directory = '/etc/luci-uploads';
	},


	/**
	 * Render the widget in browser mode initially instead of a button
	 * to 'Select File...'.
	 *
	 * @name LuCI.form.FileUpload.prototype#browser
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle display of hidden files.
	 *
	 * Display hidden files when rendering the remote directory listing.
	 * Note that this is merely a cosmetic feature: hidden files are always
	 * included in received remote file listings.
	 *
	 * The default of `false` means hidden files are not displayed.
	 *
	 * @name LuCI.form.FileUpload.prototype#show_hidden
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle file upload functionality.
	 *
	 * When set to `true`, the underlying widget provides a button which lets
	 * the user select and upload local files to the remote system.
	 * Note that this is merely a cosmetic feature: remote upload access is
	 * controlled by the session ACL rules.
	 *
	 * The default of `true` means file upload functionality is displayed.
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_upload
	 * @type boolean
	 * @default true
	 */

	/**
	 * Toggle remote directory create functionality.
	 *
	 * When set to `true`, the underlying widget provides a button which lets
	 * the user create directories. Note that this is merely
	 * a cosmetic feature: remote create permissions are controlled by the
	 * session ACL rules.
	 *
	 * The default of `false` means the directory create button is hidden.
	 *
	 * @name LuCI.form.FileUpload.prototype#directory_create
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle remote directory select functionality.
	 *
	 * When set to `true`, the underlying widget changes behaviour to select
	 * directories instead of files, in effect, becoming a directory
	 * picker.
	 *
	 * The default is `false`.
	 *
	 * @name LuCI.form.FileUpload.prototype#directory_select
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle remote file delete functionality.
	 *
	 * When set to `true`, the underlying widget provides buttons which let
	 * the user delete files from remote directories. Note that this is merely
	 * a cosmetic feature: remote delete permissions are controlled by the
	 * session ACL rules.
	 *
	 * The default is `true`, means file removal buttons are displayed.
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_remove
	 * @type boolean
	 * @default true
	 */

	/**
	 * Toggle download file functionality.
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_download
	 * @type boolean
	 * @default false
	 */

	/**
	 * Specify the root directory for file browsing.
	 *
	 * This property defines the topmost directory the file browser widget may
	 * navigate to. The UI will not allow browsing directories outside this
	 * prefix. Note that this is merely a cosmetic feature: remote file access
	 * and directory listing permissions are controlled by the session ACL
	 * rules.
	 *
	 * The default is `/etc/luci-uploads`.
	 *
	 * @name LuCI.form.FileUpload.prototype#root_directory
	 * @type string
	 * @default /etc/luci-uploads
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const browserEl = new ui.FileUpload((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			name: this.cbid(section_id),
			browser: this.browser,
			show_hidden: this.show_hidden,
			directory_create: this.directory_create,
			directory_select: this.directory_select,
			enable_upload: this.enable_upload,
			enable_remove: this.enable_remove,
			enable_download: this.enable_download,
			root_directory: this.root_directory,
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return browserEl.render();
	}
});

/**
 * @class DirectoryPicker
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `DirectoryPicker` element wraps a {@link LuCI.ui.FileUpload} widget and
 * offers the ability to browse, create, delete and select remote directories.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The name of the UCI option to map.

 * @param {string} [title]
 * The title caption of the option element.

 * @param {string} [description]
 * The description text of the option element.
 */
/**
 * ════════════════════════════════════════════════════════════
 * DirectoryPicker：目录选择器控件
 * ════════════════════════════════════════════════════════════

   【作用】
     类似 FileUpload，但专门用于选择目录路径而非文件。
     控件内部设置 directory_select=true，使文件浏览器只允许选择目录。
     将选中目录的完整路径保存到 UCI 选项中。

   【关键属性】（与 FileUpload 相同）

     root_directory   {string}  默认 '/tmp'  根目录限制
     enable_upload    {boolean} 默认 false   允许上传文件到选中目录
     enable_remove    {boolean} 默认 false   允许删除目录内的文件
     enable_download  {boolean} 默认 false   允许下载文件
     directory_create {boolean} 默认 false   允许在浏览器中创建新目录
     show_hidden      {boolean} 默认 true    显示隐藏目录

   ──────────────────────────────────────────────────────────
   【示例1：文件共享挂载点目录选择】

     var o = s.option(form.DirectoryPicker, 'path', _('共享目录路径'));
     o.root_directory  = '/mnt';
     o.directory_create = true;  // 允许创建新目录
     o.optional        = true;

   ──────────────────────────────────────────────────────────
   【示例2：下载目录配置】

     var o = s.option(form.DirectoryPicker, 'download_dir', _('下载目录'));
     o.root_directory = '/mnt';
     o.enable_upload  = false;

   ──────────────────────────────────────────────────────────
   【与 FileUpload 的选择原则】
     FileUpload：需要选择具体文件（证书、脚本、密钥等）
     DirectoryPicker：需要选择目录路径（挂载点、下载目录、备份目录等）
 */
const CBIDirectoryPicker = CBIValue.extend(/** @lends LuCI.form.DirectoryPicker.prototype */ {
	__name__: 'CBI.DirectoryPicker',

	__init__(...args) {
		this.super('__init__', args);

		this.browser = false;
		this.directory_create = false;
		this.enable_download = false;
		this.enable_remove = false;
		this.enable_upload = false;
		this.root_directory = '/tmp';
		this.show_hidden = true;
	},


	/**
	 * Render the widget in browser mode initially instead of a button
	 * to 'Select Directory...'.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#browser
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle remote directory create functionality.
	 *
	 * When set to `true`, the underlying widget provides a button which lets
	 * the user create directories. Note that this is merely
	 * a cosmetic feature: remote create permissions are controlled by the
	 * session ACL rules.
	 *
	 * The default of `false` means the directory create button is hidden.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#directory_create
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle download file functionality.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#enable_download
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle remote file delete functionality.
	 *
	 * When set to `true`, the underlying widget provides buttons which let
	 * the user delete files from remote directories. Note that this is merely
	 * a cosmetic feature: remote delete permissions are controlled by the
	 * session ACL rules.
	 *
	 * The default is `false`, means file removal buttons are not displayed.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#enable_remove
	 * @type boolean
	 * @default false
	 */

	/**
	 * Toggle file upload functionality.
	 *
	 * When set to `true`, the underlying widget provides a button which lets
	 * the user select and upload local files to the remote system.
	 * Note that this is merely a cosmetic feature: remote upload access is
	 * controlled by the session ACL rules.
	 *
	 * The default of `false` means file upload functionality is disabled.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#enable_upload
	 * @type boolean
	 * @default false
	 */

	/**
	 * Specify the root directory for file browsing.
	 *
	 * This property defines the topmost directory the file browser widget may
	 * navigate to. The UI will not allow browsing directories outside this
	 * prefix. Note that this is merely a cosmetic feature: remote file access
	 * and directory listing permissions are controlled by the session ACL
	 * rules.
	 *
	 * The default is `/tmp`.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#root_directory
	 * @type string
	 * @default /tmp
	 */

	/**
	 * Toggle display of hidden files.
	 *
	 * Display hidden files when rendering the remote directory listing.
	 * Note that this is merely a cosmetic feature: hidden files are always
	 * included in received remote file listings.
	 *
	 * The default of `true` means hidden files are displayed.
	 *
	 * @name LuCI.form.DirectoryPicker.prototype#show_hidden
	 * @type boolean
	 * @default true
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		const browserEl = new ui.FileUpload((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			name: this.cbid(section_id),
			browser: this.browser,
			directory_create: this.directory_create,
			directory_select: true,
			enable_download: this.enable_download,
			enable_remove: this.enable_remove,
			enable_upload: this.enable_upload,
			root_directory: this.root_directory,
			show_hidden: this.show_hidden,
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return browserEl.render();
	}
});

/**
 * @class SectionValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc

 * The `SectionValue` widget embeds a form section element within an option
 * element container, allowing to nest form sections into other sections.

 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * The configuration form to which this section is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {LuCI.form.AbstractSection} section
 * The configuration section to which this option is added. It is automatically passed
 * by [option()]{@link LuCI.form.AbstractSection#option} or
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} when adding the
 * option to the section.

 * @param {string} option
 * The internal name of the option element holding the section. Since a section
 * container element does not read or write any configuration itself, the name
 * is only used internally and does not need to relate to any underlying UCI
 * option name.

 * @param {LuCI.form.AbstractSection} subsection_class
 * The class to use for instantiating the nested section element. Note that
 * the class value itself is expected here, not a class instance obtained by
 * calling `new`. The given class argument must be a subclass of the
 * `AbstractSection` class.

 * @param {...*} [class_args]
 * All further arguments are passed as-is to the subclass constructor. Refer
 * to the corresponding class constructor documentations for details.
 */
/**
 * ════════════════════════════════════════════════════════════
 * SectionValue：在 Option 位置内嵌另一个完整 Section 的容器控件
 * ════════════════════════════════════════════════════════════

   【作用】
     允许在一个 option 的位置内嵌入一个完整的 Section 子结构。
     实现配置表单的嵌套布局：一个 section 中的某个位置展示另一个 section。
     内嵌的 section 通过 subsection 属性访问，可以像普通 section 一样添加 option。

   【构造函数（通过 section.option() 调用）】
     s.option(form.SectionValue, optname, SectionClass, ...sectionArgs)

     optname       {string}  内部标识名（不对应 UCI 选项，仅用于 DOM ID）
     SectionClass  {class}   要内嵌的 section 类（必须继承自 AbstractSection）
     sectionArgs   {...*}    传给 section 类构造函数的额外参数

   【subsection 属性】
     创建后通过 .subsection 访问内嵌的 section 实例，
     可以像普通 section 一样调用 option()、taboption()、tab() 等方法。

   【value/write/remove/cfgvalue/formvalue 均为空操作】
     SectionValue 本身不读写任何 UCI 值，它只是一个布局容器。
     实际数据由内嵌 section 的 option 控件处理。

   ──────────────────────────────────────────────────────────
   【示例1：在接口编辑页内嵌 IP 地址列表】

     var s = m.section(form.NamedSection, 'wan', 'interface', _('WAN 配置'));

     // 常规选项
     s.option(form.ListValue, 'proto', _('协议'))
       .value('dhcp').value('static').value('pppoe');

     // 在 proto=static 时，内嵌一个 TableSection 显示 IP 地址列表
     var ipSection = s.option(form.SectionValue, '_ipaddrs',
         form.TableSection, 'ip_address', _('IP 地址列表'));
     ipSection.depends('proto', 'static');

     // 通过 subsection 属性配置内嵌 section
     var ss = ipSection.subsection;
     ss.addremove = true;
     ss.anonymous = true;

     ss.option(form.Value, 'ipaddr',  _('IP/前缀')).datatype = 'cidr4';
     ss.option(form.Value, 'gateway', _('网关')).datatype = 'ip4addr';

   ──────────────────────────────────────────────────────────
   【示例2：WireGuard 接口内嵌对端列表】

     // 主 section：WireGuard 接口配置
     var s = m.section(form.NamedSection, 'wg0', 'interface', _('WireGuard 接口'));
     s.option(form.Value,    'private_key',  _('私钥')).password = true;
     s.option(form.Value,    'listen_port',  _('监听端口')).datatype = 'port';
     s.option(form.DynamicList, 'addresses', _('本机地址')).datatype = 'cidr';

     // 内嵌 TypedSection：对端列表
     var peerContainer = s.option(form.SectionValue, '_peers',
         form.TypedSection, 'wireguard_wg0', _('对端列表'));

     var peers = peerContainer.subsection;
     peers.addremove = true;
     peers.anonymous = true;
     peers.uciconfig = 'network';

     peers.option(form.Value, 'public_key',  _('公钥'));
     peers.option(form.Value, 'endpoint_host', _('端点地址'));
     peers.option(form.Value, 'endpoint_port', _('端点端口')).datatype = 'port';
     peers.option(form.DynamicList, 'allowed_ips', _('允许的 IP'));
 */
const CBISectionValue = CBIValue.extend(/** @lends LuCI.form.SectionValue.prototype */ {
	__name__: 'CBI.ContainerValue',
	__init__(map, section, option, cbiClass, ...args) {
		this.super('__init__', [ map, section, option ]);

		if (!CBIAbstractSection.isSubclass(cbiClass))
			throw 'Sub section must be a descendent of CBIAbstractSection';

		this.subsection = cbiClass.instantiate([ this.map, ...args ]);
		this.subsection.parentoption = this;
	},

	/**
	 * Access the embedded section instance.
	 *
	 * This property holds a reference to the instantiated nested section.
	 *
	 * @name LuCI.form.SectionValue.prototype#subsection
	 * @type LuCI.form.AbstractSection
	 * @readonly
	 */

	/**
	 * 委托给内嵌 subsection 执行加载（数据由 subsection 的 option 负责读取）。
	 * @override
	 */
	load(section_id) {
		return this.subsection.load(section_id);
	},

	/**
	 * 委托给内嵌 subsection 执行解析和验证（所有数据写入由 subsection 的 option 处理）。
	 * @override
	 */
	parse(section_id) {
		return this.subsection.parse(section_id);
	},

	/**
	 * 将 subsection 渲染为控件节点（替代普通 input 控件的位置）。
	 * 返回完整的 section DOM，嵌入到父 section 的 option 位置中。
	 * @private
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		return this.subsection.render(section_id);
	},

	/**
	 * 同时检查内嵌 subsection 和自身的依赖状态。
	 * 先更新 subsection 内部所有 option 的依赖，再检查自身的依赖条件。
	 * @private
	 */
	checkDepends(section_id) {
		this.subsection.checkDepends(section_id);
		return CBIValue.prototype.checkDepends.apply(this, [ section_id ]);
	},

	/**
	 * SectionValue 不是输入控件，不支持添加候选选项。
	 * 调用 value() 无任何效果（空操作）。
	 * 若需要在内嵌 section 的 option 中添加候选，请通过 subsection.option() 设置。
	 * @override
	 */
	value() {},

	/**
	 * SectionValue 本身不写入 UCI（实际写入由 subsection 的 option 控件负责）。
	 * @override
	 */
	write() {},

	/**
	 * SectionValue 本身不删除 UCI 值（实际删除由 subsection 的 option 控件负责）。
	 * @override
	 */
	remove() {},

	/**
	 * Since the section container is not tied to any UCI configuration,
	 * its `cfgvalue()` implementation will always return `null`.
	 *
	 * @override
	 * @returns {null}
	 */
	cfgvalue() { return null },

	/**
	 * Since the section container is not tied to any UCI configuration,
	 * its `formvalue()` implementation will always return `null`.
	 *
	 * @override
	 * @returns {null}
	 */
	formvalue() { return null }
});

/**
 * @class form
 * @memberof LuCI
 * @hideconstructor
 * @classdesc

 * The LuCI form class provides high level abstractions for creating
 * UCI- or JSON backed configurations forms.

 * To import the class in views, use `'require form'`, to import it in
 * external JavaScript, use `L.require("form").then(...)`.

 * A typical form is created by first constructing a
 * {@link LuCI.form.Map} or {@link LuCI.form.JSONMap} instance using `new` and
 * by subsequently adding sections and options to it. Finally
 * [render()]{@link LuCI.form.Map#render} is invoked on the instance to
 * assemble the HTML markup and insert it into the DOM.

 * Example:

 * <pre>
 * 'use strict';
 * 'require form';

 * let m, s, o;

 * m = new form.Map('example', 'Example form',
 *	'This is an example form mapping the contents of /etc/config/example');

 * s = m.section(form.NamedSection, 'first_section', 'example', 'The first section',
 * 	'This sections maps "config example first_section" of /etc/config/example');

 * o = s.option(form.Flag, 'some_bool', 'A checkbox option');

 * o = s.option(form.ListValue, 'some_choice', 'A select element');
 * o.value('choice1', 'The first choice');
 * o.value('choice2', 'The second choice');

 * m.render().then((node) => {
 * 	document.body.appendChild(node);
 * });
 * </pre>
 */
/**
 * ════════════════════════════════════════════════════════════
 * form 模块导出：所有公开控件类的统一导出对象
 * ════════════════════════════════════════════════════════════

   【使用方式】
     在视图文件中：'require form';
     然后通过 form.Map、form.TypedSection、form.Value 等访问各个类。

   【导出的类列表及用途速查】

     顶层表单：
       form.Map              绑定 UCI 配置文件的完整表单（最常用）
       form.JSONMap          绑定 JS 对象的表单（不读写 UCI）

     Section 类（区段/分组）：
       form.TypedSection     枚举同类型的所有 UCI section（垂直堆叠）
       form.TableSection     表格行形式展示多 section
       form.GridSection      网格+展开编辑形式
       form.NamedSection     直接引用指定名称的单个 section

     基础类（通常不直接使用，用于扩展）：
       form.AbstractSection  所有 Section 类的抽象基类
       form.AbstractValue    所有 Value 类的抽象基类

     Option 控件类（输入控件）：
       form.Value            文本输入框（可附带候选下拉→Combobox）
       form.DynamicList      可动态增删的多值列表（对应 UCI list）
       form.ListValue        固定选项的下拉选择框
       form.RichListValue    带描述的富下拉框
       form.RangeSliderValue 数值范围滑块
       form.Flag             布尔开关复选框
       form.MultiValue       多选下拉框（选多个固定选项）
       form.TextValue        多行文本域（textarea）
       form.DummyValue       只读展示控件（不可编辑）
       form.Button           操作按钮
       form.HiddenValue      隐藏字段（完全不可见）
       form.FileUpload       文件上传/路径选择器
       form.DirectoryPicker  目录选择器
       form.SectionValue     在 option 位置内嵌 section 的容器

   【选择合适控件的决策树】

     需要显示一个配置区域？
     ├── 一个已知名称/类型索引的 section → form.NamedSection
     ├── 同类型的多个 section，每个单独展示 → form.TypedSection
     ├── 同类型的多个 section，表格形式 → form.TableSection
     └── 同类型的多个 section，表格+展开详情 → form.GridSection

     需要输入/显示一个配置值？
     ├── 纯文本输入（可自由输入）→ form.Value
     │   └── 带候选列表但仍可自填？→ form.Value + value()
     ├── 只能从固定选项选一个？→ form.ListValue
     │   └── 选项需要描述说明？→ form.RichListValue
     ├── 可以选多个固定选项？→ form.MultiValue
     ├── 多个值可自由输入（UCI list）？→ form.DynamicList
     ├── 开关/布尔值？→ form.Flag
     ├── 数值范围选择？→ form.RangeSliderValue
     ├── 多行文本？→ form.TextValue
     ├── 只读展示？→ form.DummyValue
     ├── 操作按钮？→ form.Button
     ├── 隐藏内部值？→ form.HiddenValue
     ├── 文件路径选择？→ form.FileUpload
     ├── 目录路径选择？→ form.DirectoryPicker
     └── 内嵌子表单？→ form.SectionValue

 * ══════════════════════════════════════════════════════════════
   【完整综合示例——一个完整的 LuCI 视图文件骨架】
 * ══════════════════════════════════════════════════════════════

     'use strict';
     'require form';
     'require uci';
     'require rpc';
     'require view';

     // 声明 RPC 调用（若需要从 ubus 获取状态数据）
     var callGetStatus = rpc.declare({
       object: 'myservice',
       method: 'status',
       expect: { '': {} }
     });

     return view.extend({
       // ① 加载阶段：并行加载 UCI 配置 + RPC 数据
       load() {
         return Promise.all([
           uci.load('myapp'),        // 主配置文件
           uci.load('network'),      // 关联配置（用于获取接口列表）
           callGetStatus()           // RPC 状态数据
         ]).then(([, , status]) => {
           this._status = status;    // 缓存状态数据供 render() 使用
         });
       },

       // ② 渲染阶段：构建表单树并返回渲染 Promise
       render() {
         var m, s, o;

         // ─── 创建表单 ───────────────────────────────────────
         m = new form.Map('myapp', _('我的应用'), _('配置说明文字'));
         m.chain('network');   // 关联 network 配置（已在 load() 中加载）

         // ─── Section 1：基本设置（NamedSection）─────────────
         s = m.section(form.NamedSection, '@myapp[0]', 'myapp', _('基本设置'));
         s.addremove = false;

         // 使用 Tab 分组
         s.tab('general',  _('常规'));
         s.tab('advanced', _('高级'));

         o = s.taboption('general', form.Flag, 'enabled', _('启用'));
         o.default = o.enabled = '1';
         o.rmempty = false;

         o = s.taboption('general', form.Value, 'port', _('监听端口'));
         o.datatype = 'port';
         o.default  = '8080';
         o.depends('enabled', '1');   // 只在启用时显示

         o = s.taboption('general', form.ListValue, 'interface', _('绑定接口'));
         o.optional = true;
         uci.sections('network', 'interface', (iface) => {
           o.value(iface['.name'], iface['.name'].toUpperCase());
         });

         o = s.taboption('advanced', form.Value, 'timeout', _('超时（秒）'));
         o.datatype = 'range(1,3600)';
         o.default  = '30';
         o.optional = true;

         // ─── Section 2：规则列表（TableSection）──────────────
         s = m.section(form.TableSection, 'rule', _('转发规则'));
         s.addremove = true;
         s.anonymous = true;
         s.sortable  = true;
         s.nodescriptions = true;

         o = s.option(form.Flag, 'enabled', _('启用'));
         o.default = o.enabled = '1';

         o = s.option(form.Value, 'name', _('名称'));
         o.width = '25%';
         o.rmempty = false;

         o = s.option(form.Value, 'src_port', _('源端口'));
         o.datatype = 'portrange';
         o.width    = '15%';

         o = s.option(form.Value, 'dest_ip', _('目标 IP'));
         o.datatype = 'ip4addr';
         o.width    = '20%';

         o = s.option(form.Value, 'dest_port', _('目标端口'));
         o.datatype = 'port';
         o.width    = '15%';

         // ─── Section 3：状态展示（只读，DummyValue）───────────
         s = m.section(form.NamedSection, '@myapp[0]', 'myapp', _('运行状态'));
         s.addremove = false;

         var self = this;

         o = s.option(form.DummyValue, '_version', _('版本'));
         o.cfgvalue = () => self._status.version || _('未知');

         o = s.option(form.DummyValue, '_uptime', _('运行时长'));
         o.cfgvalue = () => {
           var sec = self._status.uptime || 0;
           return '%dh %dm %ds'.format(
             Math.floor(sec / 3600),
             Math.floor((sec % 3600) / 60),
             sec % 60
           );
         };

         // ─── 按钮：操作控制 ───────────────────────────────────
         o = s.option(form.Button, '_restart', _(''));
         o.inputtitle = _('重启服务');
         o.inputstyle = 'apply';
         o.onclick    = function(ev, sid) {
           return callRestartService()
             .then(() => ui.addNotification(null, E('p', _('服务已重启')), 'info'))
             .catch(err => ui.addNotification(null, E('p', err.message), 'danger'));
         };

         return m.render();
       },

       // ③（可选）handleSave/handleSaveApply/handleReset 由 view 基类处理，
       //    只要 render() 返回 m，view 框架会自动调用 m.save() / m.reset()。
       //    若需要自定义保存行为，覆盖 handleSave()：
       // handleSave(ev) {
       //   return m.save(function() {
       //     // 在此做额外的 UCI 操作（此时 parse 已完成，可读取 formvalue）
       //   });
       // }
     });

 * ══════════════════════════════════════════════════════════════
   【常见陷阱与解决方法】
 * ══════════════════════════════════════════════════════════════

     ❌ 问题：depends() 不工作，字段总是显示
     ✓ 原因：依赖字段名拼写错误，或依赖字段不在同一 section
     ✓ 解决：用点分格式引用跨 section 字段：o.depends('config.sid.field', 'val')
             或检查 depends() 中的字段名是否与 option() 中的 option 名一致

     ❌ 问题：Flag 控件保存后总是被删除（UCI 中消失）
     ✓ 原因：当 formvalue == default 且 rmempty=true 时会删除该选项
     ✓ 解决：设置 o.rmempty = false; 确保总是写入

     ❌ 问题：TableSection 中 tab() 报错
     ✓ 原因：TableSection 不支持 Tab（继承自 TypedSection 但屏蔽了 tab()）
     ✓ 解决：改用 GridSection（支持 taboption + Tab）

     ❌ 问题：自定义 cfgvalue() 返回了值，但控件显示的是默认值
     ✓ 原因：cfgvalue() 的返回值须同步，不能返回 Promise
     ✓ 解决：在 load() 中异步获取并缓存，在 cfgvalue() 中读取缓存值

     ❌ 问题：JSONMap 修改后数据没有持久化
     ✓ 原因：JSONMap.save() 只更新内存对象，不写到磁盘
     ✓ 解决：在 map.save(callback) 的回调中手动调用 RPC 将数据发送给后端

     ❌ 问题：SectionValue 内嵌的 section 数据没有保存
     ✓ 原因：SectionValue 自身的 write/remove 是空操作，
              内嵌 subsection 的 uciconfig 需要与外部 Map 一致或正确设置
     ✓ 解决：确保 peerContainer.subsection.uciconfig 指向正确的 UCI 配置名
 */
return baseclass.extend(/** @lends LuCI.form.prototype */ {
	Map: CBIMap,
	JSONMap: CBIJSONMap,
	AbstractSection: CBIAbstractSection,
	AbstractValue: CBIAbstractValue,

	TypedSection: CBITypedSection,
	TableSection: CBITableSection,
	GridSection: CBIGridSection,
	NamedSection: CBINamedSection,

	Value: CBIValue,
	DynamicList: CBIDynamicList,
	ListValue: CBIListValue,
	RichListValue: CBIRichListValue,
	RangeSliderValue: CBIRangeSliderValue,
	Flag: CBIFlagValue,
	MultiValue: CBIMultiValue,
	TextValue: CBITextValue,
	DummyValue: CBIDummyValue,
	Button: CBIButtonValue,
	HiddenValue: CBIHiddenValue,
	FileUpload: CBIFileUpload,
	DirectoryPicker: CBIDirectoryPicker,
	SectionValue: CBISectionValue
});
