'use strict';
'require ui';
'require uci';
'require rpc';
'require dom';
'require baseclass';

const scope = this;

// 声明RPC调用方法，用于检查会话访问权限
const callSessionAccess = rpc.declare({
	object: 'session',
	method: 'access',
	params: [ 'scope', 'object', 'function' ],
	expect: { 'access': false }
});

// JSON配置类，用于处理JSON格式的配置数据
const CBIJSONConfig = baseclass.extend({
	__init__(data) {
		data = Object.assign({}, data);

		this.data = {};

		let num_sections = 0;
		const section_ids = [];

		// 遍历数据对象，处理不同类型的配置节
		for (const sectiontype in data) {
			if (!data.hasOwnProperty(sectiontype))
				continue;

			if (Array.isArray(data[sectiontype])) {
				// 处理数组类型的节
				for (let i = 0, index = 0; i < data[sectiontype].length; i++) {
					const item = data[sectiontype][i];
					let anonymous;
					let name;

					if (!L.isObject(item))
						continue;

					// 确定节名称和匿名状态
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

					// 合并节数据
					this.data[name] = Object.assign(item, {
						'.index': num_sections++,
						'.anonymous': anonymous,
						'.name': name,
						'.type': sectiontype
					});
				}
			}
			else if (L.isObject(data[sectiontype])) {
				// 处理对象类型的节
				this.data[sectiontype] = Object.assign(data[sectiontype], {
					'.anonymous': false,
					'.name': sectiontype,
					'.type': sectiontype
				});

				section_ids.push(sectiontype);
				num_sections++;
			}
		}

		// 对节ID进行排序
		section_ids.sort(L.bind((a, b) => {
			const indexA = (this.data[a]['.index'] != null) ? +this.data[a]['.index'] : 9999;
			const indexB = (this.data[b]['.index'] != null) ? +this.data[b]['.index'] : 9999;

			if (indexA != indexB)
				return (indexA - indexB);

			return L.naturalCompare(a, b);
		}, this));

		// 更新节索引
		for (let i = 0; i < section_ids.length; i++)
			this.data[section_ids[i]]['.index'] = i;
	},

	// 加载配置数据
	load() {
		return Promise.resolve(this.data);
	},

	// 保存配置数据
	save() {
		return Promise.resolve();
	},

	// 获取配置值
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

		if (value != null)
			return String(value);

		return null;
	},

	// 设置配置值
	set(config, section, option, value) {
		if (section == null || option == null || option.charAt(0) == '.')
			return;

		if (!this.data.hasOwnProperty(section))
			return;

		if (value == null)
			delete this.data[section][option];
		else if (Array.isArray(value))
			this.data[section][option] = value;
		else
			this.data[section][option] = String(value);
	},

	// 删除配置值
	unset(config, section, option) {
		return this.set(config, section, option, null);
	},

	// 获取节列表
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

	// 添加新节
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

	// 删除节
	remove(config, section) {
		if (this.data.hasOwnProperty(section))
			delete this.data[section];
	},

	// 解析节ID
	resolveSID(config, section_id) {
		return section_id;
	},

	// 移动节位置
	move(config, section_id1, section_id2, after) {
		return uci.move.apply(this, [config, section_id1, section_id2, after]);
	}
});

/**
 * @class AbstractElement
 * @memberof LuCI.form
 * @hideconstructor
 * @classdesc
 *
 * `AbstractElement` 是LuCI表单系统中所有表单元素的抽象基类，
 * 提供表单元素的通用功能实现，包括：
 * - 元素嵌套结构管理
 * - 值加载和解析逻辑
 * - 通用渲染流程
 * - HTML内容处理工具
 *
 * 注意：该类为抽象类，不能直接实例化，仅供其他表单元素类继承使用。
 */
const CBIAbstractElement = baseclass.extend(/** @lends LuCI.form.AbstractElement.prototype */ {
	/**
	 * 构造函数
	 * @param {string} [title] 元素标题
	 * @param {string} [description] 元素描述
	 */
	__init__(title, description) {
		// 初始化元素属性
		this.title = title ?? '';           // 元素标题文本
		this.description = description ?? ''; // 元素描述文本
		this.children = [];                 // 子元素容器
	},

	/**
	 * 添加子元素
	 * @param {AbstractElement} obj 要添加的表单元素实例
	 * @throws {TypeError} 如果参数不是表单元素实例
	 */
	append(obj) {
		this.children.push(obj);
	},

	/**
	 * 解析表单输入值
	 *
	 * 递归遍历表单元素树，触发每个元素的输入值读取和验证。
	 * 跳过因依赖不满足而被隐藏的元素。
	 *
	 * @returns {Promise<void>}
	 * 当所有元素值解析完成时resolve，遇到验证错误时reject
	 */
	parse() {
		const args = arguments;

		// 遍历所有子元素
		this.children.forEach((child) => {
			child.parse(...args);
		});
	},

	/**
	 * 渲染表单元素（抽象方法）
	 * @abstract
	 * @returns {Node|Promise<Node>}
	 * 返回DOM节点或解析为DOM节点的Promise
	 * @throws {Error} 必须由子类实现
	 */
	render() {
		L.error('InternalError', 'Not implemented');
	},

	/**
	 * 加载子元素值（内部方法）
	 * @private
	 * @param {...*} args 传递给子元素load方法的参数
	 * @returns {Promise<Array>} 所有子元素load结果的Promise
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
	 * 渲染子元素（内部方法）
	 * @private
	 * @param {string|null} tab_name 标签页名称（用于标签式布局）
	 * @param {...*} args 额外参数
	 * @returns {Promise<Array>} 所有子元素渲染结果的Promise
	 */
	renderChildren(tab_name, ...args) {
		const tasks = [];
		let index = 0;

		if (Array.isArray(this.children))
			for (let i = 0; i < this.children.length; i++)
				// 过滤指定标签页的子元素
				if (tab_name === null || this.children[i].tab === tab_name)
					if (!this.children[i].disable)
						tasks.push(this.children[i].render(index++, ...args));

		return Promise.all(tasks);
	},

	/**
	 * 清除字符串中的HTML标签并解码HTML实体
	 * @param {string} s 要处理的字符串
	 * @returns {string} 处理后的纯文本
	 *
	 * @example
	 * stripTags('<b>Hello</b>') // 返回 "Hello"
	 */
	stripTags(s) {
		// 简单字符串快速返回
		if (typeof(s) == 'string' && !s.match(/[<>\&]/))
			return s;

		// 解析HTML内容
		const x = dom.elem(s) ? s : dom.parse(`<div>${s}</div>`);

		// 转换<br>标签为换行符
		x.querySelectorAll('br').forEach((br) => {
			x.replaceChild(document.createTextNode('\n'), br);
		});

		// 提取文本内容并规范化空白
		return (x.textContent ?? x.innerText ?? '').replace(/([ \t]*\n)+/g, '\n');
	},

	/**
	 * 格式化属性值为标题文本
	 * @param {string} attr 属性名
	 * @param {...*} args 格式化参数
	 * @returns {string|null} 格式化后的文本或null
	 *
	 * @example
	 * // 使用字符串模板
	 * this.title = "Hello %s";
	 * titleFn('title', 'World'); // 返回 "Hello World"
	 *
	 * // 使用函数
	 * this.title = function(name) { return `Hello ${name}`; };
	 * titleFn('title', 'World'); // 返回 "Hello World"
	 */
	titleFn(attr, ...args) {
		let s = null;

		// 处理函数类型属性
		if (typeof(this[attr]) == 'function')
			s = this[attr](...args);
		// 处理字符串类型属性
		else if (typeof(this[attr]) == 'string')
			s = args.length ? this[attr].format(...args) : this[attr];

		// 清理HTML内容
		if (s != null)
			s = this.stripTags(String(s)).trim();

		// 空值处理
		if (s == null || s == '')
			return null;

		return s;
	}
});

/**
 * @class Map
 * @memberof LuCI.form
 * @augments LuCI.form.AbstractElement
 * @classdesc
 *
 * `Map` 类表示一个完整的表单，通常映射一个UCI配置文件。
 * 作为LuCI表单系统的主入口点，提供：
 * - 配置文件的加载与保存
 * - 表单元素的组织与管理
 * - 数据验证与依赖检查
 * - 渲染整个表单结构
 *
 * @param {string} config 要映射的UCI配置文件名
 * @param {string} [title] 表单标题
 * @param {string} [description] 表单描述
 */
const CBIMap = CBIAbstractElement.extend(/** @lends LuCI.form.Map.prototype */ {
	__init__(config, ...args) {
		this.super('__init__', args);

		// 初始化配置属性
		this.config = config;          // 主UCI配置文件名
		this.parsechain = [ config ]; // 需要解析的配置列表
		this.data = uci;             // UCI数据接口
	},

	/**
	 * 表单只读状态
	 * - true: 整个表单设为只读
	 * - false/null: 自动检测写权限
	 * @name LuCI.form.Map.prototype#readonly
	 * @type boolean
	 */

	/**
	 * 查找匹配的DOM元素
	 * @param {string} selector_or_attrname 选择器或属性名
	 * @param {string} [attrvalue] 属性值（双参数时使用）
	 * @returns {NodeList} 匹配的元素列表
	 * @example
	 * // 查找所有input元素
	 * map.findElements('input');
	 *
	 * // 查找type为text的元素
	 * map.findElements('type', 'text');
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
	 * 查找第一个匹配的DOM元素
	 * @param {...*} args 同findElements()
	 * @returns {Node|null} 匹配的元素或null
	 */
	findElement(...args) /* ... */{
		const res = this.findElements(...args);
		return res.length ? res[0] : null;
	},

	/**
	 * 关联额外的UCI配置文件
	 * @param {string} config 要添加的配置文件名
	 */
	chain(config) {
		if (this.parsechain.indexOf(config) == -1)
			this.parsechain.push(config);
	},

	/**
	 * 添加配置节到表单
	 * @param {LuCI.form.AbstractSection} sectionclass 节类型
	 * @param {...*} classargs 传递给节构造函数的参数
	 * @returns {LuCI.form.AbstractSection} 创建的节实例
	 * @throws {TypeError} 如果sectionclass不是AbstractSection子类
	 */
	section(cbiClass, ...args) {
		if (!CBIAbstractSection.isSubclass(cbiClass))
			L.error('TypeError', 'Class must be a descendent of CBIAbstractSection');

		const obj = cbiClass.instantiate([this, ...args]);
		this.append(obj);
		return obj;
	},

	/**
	 * 加载配置数据
	 * @returns {Promise<void>} 加载完成时resolve
	 */
	load() {
		const doCheckACL = (!(this instanceof CBIJSONMap) && this.readonly == null);
		const loadTasks = [ doCheckACL ? callSessionAccess('uci', this.config, 'write') : true ];
		const configs = this.parsechain ?? [ this.config ];

		// 加载所有关联的UCI配置
		loadTasks.push(...configs.map(L.bind((config, i) => {
			return i ? L.resolveDefault(this.data.load(config)) : this.data.load(config);
		}, this)));

		return Promise.all(loadTasks).then(L.bind((res) =>  {
			// 检查写权限
			if (res[0] === false)
				this.readonly = true;

			// 加载子元素数据
			return this.loadChildren();
		}, this));
	},

	/**
	 * 解析表单输入
	 * @returns {Promise<void>} 解析完成时resolve
	 */
	parse() {
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < this.children.length; i++)
				tasks.push(this.children[i].parse());

		return Promise.all(tasks);
	},

	/**
	 * 保存表单数据
	 * @param {function} [cb] 保存前的回调函数
	 * @param {boolean} [silent=false] 是否静默失败
	 * @returns {Promise<void>} 保存完成时resolve
	 */
	save(cb, silent) {
		this.checkDepends();

		return this.parse()
			.then(cb)
			.then(this.data.save.bind(this.data))
			.then(this.load.bind(this))
			.catch((e) =>  {
				if (!silent) {
					// 显示错误弹窗
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
	 * 重置表单状态
	 * @returns {Promise<Node>} 包含新DOM节点的Promise
	 */
	reset() {
		return this.renderContents();
	},

	/**
	 * 渲染整个表单
	 * @returns {Promise<Node>} 包含表单DOM的Promise
	 */
	render() {
		return this.load().then(this.renderContents.bind(this));
	},

	/** @private */
	renderContents() {
		const mapEl = (this.root ??= E('div', {
			'id': 'cbi-%s'.format(this.config),
			'class': 'cbi-map',
			'cbi-dependency-check': L.bind(this.checkDepends, this)
		}));

		dom.bindClassInstance(mapEl, this);

		return this.renderChildren(null).then(L.bind((nodes) =>  {
			const initialRender = !mapEl.firstChild;

			// 清空现有内容
			dom.content(mapEl, null);

			// 添加标题
			if (this.title != null && this.title != '')
				mapEl.appendChild(E('h2', { 'name': 'content' }, this.title));

			// 添加描述
			if (this.description != null && this.description != '')
				mapEl.appendChild(E('div', { 'class': 'cbi-map-descr' }, this.description));

			// 添加内容（标签页或普通布局）
			if (this.tabbed)
				dom.append(mapEl, E('div', { 'class': 'cbi-map-tabbed' }, nodes));
			else
				dom.append(mapEl, nodes);

			// 初始渲染后添加闪烁效果
			if (!initialRender) {
				mapEl.classList.remove('flash');
				window.setTimeout(() =>  {
					mapEl.classList.add('flash');
				}, 1);
			}

			// 检查依赖关系
			this.checkDepends();

			// 初始化标签页
			const tabGroups = mapEl.querySelectorAll('.cbi-map-tabbed, .cbi-section-node-tabbed');
			for (let i = 0; i < tabGroups.length; i++)
				ui.tabs.initTabGroup(tabGroups[i].childNodes);

			return mapEl;
		}, this));
	},

	/**
	 * 查找选项元素
	 * @param {string} name 选项名或完整ID
	 * @param {string} [section_id] 节ID
	 * @param {string} [config_name] 配置名
	 * @returns {Array|null} [选项实例, 节ID] 或null
	 */
	lookupOption(name, section_id, config_name) {
		let id;
		let elem;
		let sid;
		let inst;

		// 处理完整ID和简写ID
		if (name.indexOf('.') > -1)
			id = 'cbid.%s'.format(name);
		else
			id = 'cbid.%s.%s.%s'.format(config_name ?? this.config, section_id, name);

		// 查找元素和实例
		elem = this.findElement('data-field', id);
		sid  = elem ? id.split(/\./)[2] : null;
		inst = elem ? dom.findClassInstance(elem) : null;

		return (inst instanceof CBIAbstractValue) ? [ inst, sid ] : null;
	},

	/** @private */
	checkDepends(ev, n) {
		let changed = false;

		// 递归检查子元素依赖
		for (let i = 0, s = this.children[0]; (s = this.children[i]) != null; i++)
			if (s.checkDepends(ev, n))
				changed = true;

		// 防止无限递归
		if (changed && (n ?? 0) < 10)
			this.checkDepends(ev, (n ?? 10) + 1);

		// 更新标签页状态
		ui.tabs.updateTabs(ev, this.root);
	},

	/** @private */
	isDependencySatisfied(depends, config_name, section_id) {
		let def = false;

		// 无依赖直接返回true
		if (!Array.isArray(depends) || !depends.length)
			return true;

		// 检查每个依赖条件
		for (let i = 0; i < depends.length; i++) {
			let istat = true;
			const reverse = depends[i]['!reverse'];
			const contains = depends[i]['!contains'];

			// 检查每个依赖项
			for (const dep in depends[i]) {
				if (dep == '!reverse' || dep == '!contains') {
					continue;
				}
				else if (dep == '!default') {
					def = true;
					istat = false;
				}
				else {
					// 查找依赖选项
					const res = this.lookupOption(dep, section_id, config_name);
					const val = (res && res[0].isActive(res[1])) ? res[0].formvalue(res[1]) : null;

					// 检查值匹配
					const equal = contains
						? isContained(val, depends[i][dep])
						: isEqual(val, depends[i][dep]);

					istat = (istat && equal);
				}
			}

			// 处理反向逻辑
			if (istat ^ reverse)
				return true;
		}

		return def;
	}
});

// JSON映射类
const CBIJSONMap = CBIMap.extend(/** @lends LuCI.form.JSONMap.prototype */ {
	__init__(data, ...args) {
		this.super('__init__', [ 'json', ...args ]);

		this.config = 'json';
		this.parsechain = [ 'json' ];
		this.data = new CBIJSONConfig(data);
	}
});

// 抽象节基类
const CBIAbstractSection = CBIAbstractElement.extend(/** @lends LuCI.form.AbstractSection.prototype */ {
	__init__(map, sectionType, ...args) {
		this.super('__init__', args);

		this.sectiontype = sectionType;
		this.map = map;
		this.config = map.config;

		this.optional = true;
		this.addremove = false;
		this.dynamic = false;
	},

	// 获取配置节
	cfgsections() {
		L.error('InternalError', 'Not implemented');
	},

	// 过滤节
	filter(section_id) {
		return true;
	},

	// 加载节
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

	// 解析节
	parse() {
		const section_ids = this.cfgsections();
		const tasks = [];

		if (Array.isArray(this.children))
			for (let i = 0; i < section_ids.length; i++)
				for (let j = 0; j < this.children.length; j++)
					tasks.push(this.children[j].parse(section_ids[i]));

		return Promise.all(tasks);
	},

	// 添加标签页
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

	// 添加选项
	option(cbiClass, ...args) {
		if (!CBIAbstractValue.isSubclass(cbiClass))
			throw L.error('TypeError', 'Class must be a descendant of CBIAbstractValue');

		const obj = cbiClass.instantiate([ this.map, this, ...args ]);
		this.append(obj);
		return obj;
	},

	// 添加标签页选项
	taboption(tabName, ...args) {
		if (!this.tabs?.[tabName])
			throw L.error('ReferenceError', 'Associated tab not declared');

		const obj = this.option(...args);
		obj.tab = tabName;
		this.tabs[tabName].children.push(obj);

		return obj;
	},

	// 获取配置值
	cfgvalue(section_id, option) {
		const rv = (arguments.length == 1) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o.cfgvalue(section_id);
			else if (o.option == option)
				return o.cfgvalue(section_id);

		return rv;
	},

	// 获取表单值
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

	// 获取UI元素
	getUIElement(section_id, option) {
		const rv = (arguments.length == 1) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o.getUIElement(section_id);
			else if (o.option == option)
				return o.getUIElement(section_id);

		return rv;
	},

	// 获取选项
	getOption(option) {
		const rv = (arguments.length == 0) ? {} : null;

		for (let i = 0, o; (o = this.children[i]) != null; i++)
			if (rv)
				rv[o.option] = o;
			else if (o.option == option)
				return o;

		return rv;
	},

	// 渲染UCI节
	renderUCISection(section_id) {
		const renderTasks = [];

		if (!this.tabs)
			return this.renderOptions(null, section_id);

		for (let i = 0; i < this.tab_names.length; i++)
			renderTasks.push(this.renderOptions(this.tab_names[i], section_id));

		return Promise.all(renderTasks)
			.then(this.renderTabContainers.bind(this, section_id));
	},

	// 渲染标签页容器
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

	// 渲染选项
	renderOptions(tab_name, section_id) {
		const in_table = (this instanceof CBITableSection);
		return this.renderChildren(tab_name, section_id, in_table).then((nodes) =>  {
			const optionEls = E([]);
			for (let i = 0; i < nodes.length; i++)
				optionEls.appendChild(nodes[i]);
			return optionEls;
		});
	},

	// 检查依赖关系
	checkDepends(ev, n) {
		let changed = false;
		const sids = this.cfgsections();

		for (let i = 0, sid = sids[0]; (sid = sids[i]) != null; i++) {
			for (let j = 0, o = this.children[0]; (o = this.children[j]) != null; j++) {
				let isActive = o.isActive(sid);
				const isSatisified = o.checkDepends(sid);

				if (isActive != isSatisified) {
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

// 值比较函数
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

// 包含检查函数
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
 *
 * `AbstractValue`类是LuCI表单系统中各种表单选项控件的抽象基类，
 * 提供处理选项输入值、选项间依赖关系和输入验证约束的通用逻辑。
 *
 * 注意：该类为内部类，用户代码不应直接访问。
 */
const CBIAbstractValue = CBIAbstractElement.extend(/** @lends LuCI.form.AbstractValue.prototype */ {
	/**
	 * 构造函数
	 * @param {LuCI.form.Map} map 所属表单实例
	 * @param {LuCI.form.AbstractSection} section 所属节实例
	 * @param {string} option 选项名称
	 * @param {...*} args 其他参数
	 */
	__init__(map, section, option, ...args) {
		this.super('__init__', args);

		// 初始化基本属性
		this.section = section;    // 父节实例
		this.option = option;     // 选项名称
		this.map = map;          // 父表单实例
		this.config = map.config; // 关联的UCI配置名

		// 初始化状态属性
		this.deps = [];         // 依赖关系列表
		this.initial = {};     // 初始值缓存
		this.rmempty = true;   // 空值是否移除
		this.default = null;   // 默认值
		this.size = null;      // 显示尺寸限制
		this.optional = false; // 是否允许空值
		this.retain = false;  // 依赖不满足时是否保留值
	},

	/**
	 * 空值处理行为
	 * - true: 当值为空时从配置中移除该选项（默认）
	 * - false: 保留空值选项
	 * @name LuCI.form.AbstractValue.prototype#rmempty
	 * @type boolean
	 * @default true
	 */

	/**
	 * 选项可选性
	 * - true: 允许选项值为空
	 * - false: 要求必须输入有效值（默认）
	 * @name LuCI.form.AbstractValue.prototype#optional
	 * @type boolean
	 * @default false
	 */

	/**
	 * 值保留策略
	 * - true: 依赖不满足时保留配置项
	 * - false: 依赖不满足时删除配置项（默认）
	 * @name LuCI.form.AbstractValue.prototype#retain
	 * @type boolean
	 * @default false
	 */

	/**
	 * 默认值设置
	 * 当UCI配置中无此选项时使用的默认值
	 * @name LuCI.form.AbstractValue.prototype#default
	 * @type *
	 * @default null
	 */

	/**
	 * 数据类型验证规则
	 * 指定验证输入值的正则表达式或验证函数
	 * @name LuCI.form.AbstractValue.prototype#datatype
	 * @type string|function
	 * @default null
	 */

	/**
	 * 自定义验证函数
	 * 返回true表示验证通过，其他返回值将作为错误消息
	 * @name LuCI.form.AbstractValue.prototype#validate
	 * @type function
	 * @default null
	 */

	/**
	 * 覆盖UCI配置名
	 * 默认继承自父表单，设置后从指定配置读取
	 * @name LuCI.form.AbstractValue.prototype#uciconfig
	 * @type string
	 * @default null
	 */

	/**
	 * 覆盖UCI节名
	 * 默认继承自父节，设置后从指定节读取
	 * @name LuCI.form.AbstractValue.prototype#ucisection
	 * @type string
	 * @default null
	 */

	/**
	 * 覆盖UCI选项名
	 * 默认使用option参数，设置后作为实际选项名
	 * @name LuCI.form.AbstractValue.prototype#ucioption
	 * @type string
	 * @default null
	 */

	/**
	 * 表格节可编辑性
	 * - true: 在表格中显示为可编辑控件
	 * - false: 显示为只读文本（默认）
	 * @name LuCI.form.AbstractValue.prototype#editable
	 * @type boolean
	 * @default false
	 */

	/**
	 * 模态框显示模式
	 * - true: 仅在模态框显示
	 * - false: 仅在表格显示
	 * - null: 两者都显示（默认）
	 * @name LuCI.form.AbstractValue.prototype#modalonly
	 * @type boolean
	 * @default null
	 */

	/**
	 * 只读状态
	 * - true: 显示为禁用状态
	 * - false/null: 继承父表单状态（默认false）
	 * @name LuCI.form.AbstractValue.prototype#readonly
	 * @type boolean
	 * @default false
	 */

	/**
	 * 单元格宽度
	 * 可设置为像素值(100)或CSS宽度('100px')
	 * @name LuCI.form.AbstractValue.prototype#width
	 * @type number|string
	 * @default null
	 */

	/**
	 * 值变更处理函数
	 * 接收参数：(element, section_id, value)
	 * @name LuCI.form.AbstractValue.prototype#onchange
	 * @type function
	 * @default null
	 */

	/**
	 * 添加依赖约束
	 * @param {string|Object} field 依赖字段或条件对象
	 * @param {string|RegExp} [value] 期望值（单字段时使用）
	 * @example
	 * // 单字段依赖
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
	 */
	depends(field, value) {
		let deps;

		if (typeof(field) === 'string')
			deps = {}, deps[field] = value;
		else
			deps = field;

		this.deps.push(deps);
	},

	/** @private */
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

	/** @private */
	transformChoices() {
		if (!Array.isArray(this.keylist) || this.keylist.length == 0)
			return null;

		const choices = {};

		for (let i = 0; i < this.keylist.length; i++)
			choices[this.keylist[i]] = this.vallist[i];

		return choices;
	},

	/** @private */
	checkDepends(section_id) {
		const config_name = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const active = this.map.isDependencySatisfied(this.deps, config_name, section_id);

		if (active)
			this.updateDefaultValue(section_id);

		return active;
	},

	/** @private */
	updateDefaultValue(section_id) {
		if (!L.isObject(this.defaults))
			return;

		const config_name = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const cfgvalue = L.toArray(this.cfgvalue(section_id))[0];
		let default_defval = null;
		let satisified_defval = null;

		for (const value in this.defaults) {
			if (!this.defaults[value] || this.defaults[value].length == 0) {
				default_defval = value;
				continue;
			}
			else if (this.map.isDependencySatisfied(this.defaults[value], config_name, section_id)) {
				satisified_defval = value;
				break;
			}
		}

		if (satisified_defval == null)
			satisified_defval = default_defval;

		const node = this.map.findElement('id', this.cbid(section_id));
		if (node && node.getAttribute('data-changed') != 'true' && satisified_defval != null && cfgvalue == null)
			dom.callClassMethod(node, 'setValue', satisified_defval);

		this.default = satisified_defval;
	},

	/**
	 * 获取控件ID
	 * @param {string} section_id 节ID
	 * @returns {string} 完整控件ID
	 * @throws {TypeError} 当section_id为空时
	 */
	cbid(section_id) {
		if (section_id == null)
			L.error('TypeError', 'Section ID required');

		return 'cbid.%s.%s.%s'.format(
			this.uciconfig ?? this.section.uciconfig ?? this.map.config,
			section_id, this.option);
	},

	/**
	 * 加载配置值
	 * @param {string} section_id 节ID
	 * @returns {*|Promise<*>} 配置值或Promise
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
	 * 获取UI部件实例
	 * @param {string} section_id 节ID
	 * @returns {LuCI.ui.AbstractElement|null} UI部件实例或null
	 */
	getUIElement(section_id) {
		const node = this.map.findElement('id', this.cbid(section_id));
		const inst = node ? dom.findClassInstance(node) : null;
		return (inst instanceof ui.AbstractElement) ? inst : null;
	},

	/**
	 * 查询配置值
	 * @param {string} section_id 节ID
	 * @param {*} [set_value] 设置新值（可选）
	 * @returns {*} 当前配置值
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
	 * 获取表单输入值
	 * @param {string} section_id 节ID
	 * @returns {*} 当前输入值
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.getValue() : null;
	},

	/**
	 * 获取文本显示值
	 * @param {string} section_id 节ID
	 * @returns {string} 格式化后的文本
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
	 * 验证输入值
	 * @param {string} section_id 节ID
	 * @param {*} value 要验证的值
	 * @returns {boolean|string} true表示验证通过，字符串为错误消息
	 */
	validate(section_id, value) {
		return true;
	},

	/**
	 * 检查值有效性
	 * @param {string} section_id 节ID
	 * @returns {boolean} 当前值是否有效
	 */
	isValid(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.isValid() : true;
	},

	/**
	 * 获取验证错误
	 * @param {string} section_id 节ID
	 * @returns {string} 当前验证错误消息
	 */
	getValidationError(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.getValidationError() : '';
	},

	/**
	 * 检查选项是否活跃
	 * @param {string} section_id 节ID
	 * @returns {boolean} 是否满足依赖关系
	 */
	isActive(section_id) {
		const field = this.map.findElement('data-field', this.cbid(section_id));
		return (field != null && !field.classList.contains('hidden'));
	},

	/** @private */
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

	/** @private */
	triggerValidation(section_id) {
		const elem = this.getUIElement(section_id);
		return elem ? elem.triggerValidation() : true;
	},

	/**
	 * 解析选项输入
	 * @param {string} section_id 节ID
	 * @returns {Promise<void>} 解析完成Promise
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
	 * 写入选项值
	 * @param {string} section_id 节ID
	 * @param {*} formvalue 要写入的值
	 * @returns {Promise} 写入操作Promise
	 */
	write(section_id, formvalue) {
		return this.map.data.set(
			this.uciconfig ?? this.section.uciconfig ?? this.map.config,
			this.ucisection ?? section_id,
			this.ucioption ?? this.option,
			formvalue);
	},

	/**
	 * 移除选项值
	 * @param {string} section_id 节ID
	 * @returns {void}
	 */
	remove(section_id) {
		const this_cfg = this.uciconfig ?? this.section.uciconfig ?? this.map.config;
		const this_sid = this.ucisection ?? section_id;
		const this_opt = this.ucioption ?? this.option;

		// 检查是否有其他活跃选项使用相同UCI选项名
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

			// 找到使用相同UCI选项名的活跃选项，不能移除值
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
 *
 * `TypedSection` 类映射指定类型的所有（或通过重写 `filter()` 方法筛选后的部分）
 * UCI 配置节。在布局上，这些配置节实例（有时称为"节节点"）以单列形式垂直排列，
 * 每个节点旁可显示删除按钮（取决于 `addremove` 属性值），底部可显示添加按钮。
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [section()]{@link LuCI.form.Map#section} 方法添加时自动传入。
 *
 * @param {string} section_type
 * 要映射的 UCI 节类型。
 *
 * @param {string} [title]
 * 表单节元素的标题。
 *
 * @param {string} [description]
 * 表单节元素的描述文本。
 */
const CBITypedSection = CBIAbstractSection.extend(/** @lends LuCI.form.TypedSection.prototype */ {
	__name__: 'CBI.TypedSection',

	/**
	 * 控制是否允许用户添加/删除节实例。
	 * 设为 `true` 时显示添加/删除按钮，否则只能编辑已存在的节。
	 * 默认值：`false`
	 *
	 * @name LuCI.form.TypedSection.prototype#addremove
	 * @type boolean
	 * @default false
	 */

	/**
	 * 控制是否将映射的节实例视为匿名 UCI 节。
	 * 设为 `true` 时，节实例不显示标题且添加新节时不需指定名称。
	 * 默认值：`false`
	 *
	 * @name LuCI.form.TypedSection.prototype#anonymous
	 * @type boolean
	 * @default false
	 */

	/**
	 * 控制是否以标签页形式显示节实例。
	 * 设为 `true` 时，每个实例作为独立标签页显示，顶部显示标签菜单。
	 * 默认值：`false`
	 *
	 * @name LuCI.form.TypedSection.prototype#tabbed
	 * @type boolean
	 * @default false
	 */

	/**
	 * 自定义节底部"添加"按钮的标题。
	 * 可设为字符串（直接使用）或函数（调用返回值）。
	 * 未设置时默认使用 `Add`。
	 *
	 * @name LuCI.form.TypedSection.prototype#addbtntitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * 覆盖从父表单继承的 UCI 配置名称。
	 * 默认值：`null`（继承父表单的配置）
	 *
	 * @name LuCI.form.TypedSection.prototype#uciconfig
	 * @type string
	 * @default null
	 */

	/** @override */
	cfgsections() {
		return this.map.data.sections(this.uciconfig ?? this.map.config, this.sectiontype)
			.map((s) => { return s['.name'] })
			.filter(L.bind(this.filter, this));
	},

	/**
	 * 处理添加节操作
	 * @private
	 * @param {Event} ev 事件对象
	 * @param {string} name 新节名称
	 */
	handleAdd(ev, name) {
		const config_name = this.uciconfig ?? this.map.config;
		this.map.data.add(config_name, this.sectiontype, name);
		return this.map.save(null, true);
	},

	/**
	 * 处理删除节操作
	 * @private
	 * @param {string} section_id 要删除的节ID
	 * @param {Event} ev 事件对象
	 */
	handleRemove(section_id, ev) {
		const config_name = this.uciconfig ?? this.map.config;
		this.map.data.remove(config_name, section_id);
		return this.map.save(null, true);
	},

	/**
	 * 渲染"添加节"控件
	 * @private
	 * @param {string} extra_class 额外的CSS类
	 * @returns {HTMLElement} 添加控件的DOM元素
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
			// 匿名模式：简单添加按钮
			createEl.appendChild(E('button', {
				'class': 'cbi-button cbi-button-add',
				'title': btn_title ?? _('Add'),
				'click': ui.createHandlerFn(this, 'handleAdd'),
				'disabled': this.map.readonly || null
			}, [ btn_title ?? _('Add') ]));
		}
		else {
			// 非匿名模式：带名称输入框的添加控件
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

			// 非只读模式下添加输入验证
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
	 * 渲染空节占位符
	 * @private
	 * @returns {HTMLElement} 占位符DOM元素
	 */
	renderSectionPlaceholder() {
		return E('em', _('This section contains no values yet'));
	},

	/**
	 * 渲染节内容
	 * @private
	 * @param {Array} cfgsections 配置节ID数组
	 * @param {Array} nodes 子节点数组
	 * @returns {HTMLElement} 节内容的DOM元素
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

		// 添加标题和描述
		if (this.title != null && this.title != '')
			sectionEl.appendChild(E('h3', {}, this.title));
		if (this.description != null && this.description != '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		// 添加各个节节点
		for (let i = 0; i < nodes.length; i++) {
			if (this.addremove) {
				// 添加删除按钮
				sectionEl.appendChild(
					E('div', { 'class': 'cbi-section-remove right' },
						E('button', {
							'class': 'cbi-button',
							'name': 'cbi.rts.%s.%s'.format(config_name, cfgsections[i]),
							'data-section-id': cfgsections[i],
							'click': ui.createHandlerFn(this, 'handleRemove', cfgsections[i]),
							'disabled': this.map.readonly || null
						}, [ _('Delete') ])));
			}

			// 非匿名模式添加节标题
			if (!this.anonymous)
				sectionEl.appendChild(E('h3', cfgsections[i].toUpperCase()));

			// 添加节内容
			sectionEl.appendChild(E('div', {
				'id': 'cbi-%s-%s'.format(config_name, cfgsections[i]),
				'class': this.tabs
					? 'cbi-section-node cbi-section-node-tabbed' : 'cbi-section-node',
				'data-section-id': cfgsections[i]
			}, nodes[i]));
		}

		// 处理空节情况
		if (nodes.length == 0)
			sectionEl.appendChild(this.renderSectionPlaceholder());

		// 添加"添加节"控件
		sectionEl.appendChild(this.renderSectionAdd());

		dom.bindClassInstance(sectionEl, this);
		return sectionEl;
	},

	/** @override */
	render() {
		const cfgsections = this.cfgsections();
		const renderTasks = [];

		// 并行渲染所有节节点
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
 *
 * `TableSection` 类以表格形式映射指定类型的所有（或通过重写 `filter()` 方法筛选后的部分）
 * UCI配置节。在布局上，配置节实例以表格行形式展示，最后一列可包含删除按钮，
 * 表格下方可显示添加按钮（取决于 `addremove` 属性值）。
 *
 * 主要特性：
 * - 表格布局展示配置数据
 * - 支持列数限制和"更多"弹窗
 * - 内置拖拽排序功能
 * - 支持移动端触摸操作
 * - 可扩展的编辑和克隆功能
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [section()]{@link LuCI.form.Map#section} 方法添加时自动传入。
 *
 * @param {string} section_type
 * 要映射的UCI节类型。
 *
 * @param {string} [title]
 * 表单节元素的标题。
 *
 * @param {string} [description]
 * 表单节元素的描述文本。
 */
const CBITableSection = CBITypedSection.extend(/** @lends LuCI.form.TableSection.prototype */ {
	__name__: 'CBI.TableSection',

	/**
	 * 自定义每行在表格第一列显示的标题
	 * - 字符串：作为格式化模板，UCI节名称作为第一个参数
	 * - 函数：接收节名称作为参数，返回显示文本
	 * 默认显示UCI节名称
	 *
	 * @name LuCI.form.TableSection.prototype#sectiontitle
	 * @type string|function
	 * @default null
	 * @example
	 * // 使用字符串模板
	 * section.sectiontitle = "设备-%s";
	 *
	 * // 使用函数
	 * section.sectiontitle = function(name) {
	 *     return "设备" + name.toUpperCase();
	 * };
	 */

	/**
	 * 自定义点击"更多"按钮时弹窗的标题
	 * 用法同sectiontitle，默认显示UCI节名称
	 *
	 * @name LuCI.form.TableSection.prototype#modaltitle
	 * @type string|function
	 * @default null
	 */

	/**
	 * 设置表格最大显示列数
	 * - 超过此数值时会显示"更多"按钮
	 * - 点击按钮弹出模态框显示完整配置
	 * - null表示显示所有列
	 *
	 * @name LuCI.form.TableSection.prototype#max_cols
	 * @type number
	 * @default null
	 */

	/**
	 * 是否启用行交替颜色
	 * true时添加cbi-rowstyle-1/2类实现斑马纹效果
	 * 需要主题CSS支持
	 *
	 * @name LuCI.form.TableSection.prototype#rowcolors
	 * @type boolean
	 * @default false
	 */

	/**
	 * 是否启用节实例克隆功能
	 * true时每行显示克隆按钮
	 *
	 * @name LuCI.form.TableSection.prototype#cloneable
	 * @type boolean
	 * @default false
	 */

	/**
	 * 自定义行编辑行为
	 * - 字符串：作为URL模板（%s替换为节ID）
	 * - 函数：接收节ID和事件对象
	 *
	 * @name LuCI.form.TableSection.prototype#extedit
	 * @type string|function
	 * @default null
	 * @example
	 * // 跳转URL
	 * section.extedit = "/admin/network/edit/%s";
	 *
	 * // 自定义处理
	 * section.extedit = function(id, ev) {
	 *     console.log("编辑", id);
	 * };
	 */

	/**
	 * 是否启用拖拽排序
	 * true时显示拖拽手柄，支持桌面和移动端
	 *
	 * @name LuCI.form.TableSection.prototype#sortable
	 * @type boolean
	 * @default false
	 */

	/**
	 * 是否隐藏描述行
	 * true时不显示选项的描述文本行
	 *
	 * @name LuCI.form.TableSection.prototype#nodescriptions
	 * @type boolean
	 * @default false
	 */

	/**
	 * 表格节不支持标签页功能
	 * 调用此方法将抛出异常
	 *
	 * @override
	 * @throws 调用时抛出异常
	 */
	tab() {
		throw 'Tabs are not supported by TableSection';
	},

	/**
	 * 处理节克隆操作
	 * @private
	 * @param {string} section_id 要克隆的节ID
	 * @param {boolean} put_next 是否插入到原节后面
	 * @param {string} name 新节名称（可选）
	 */
	handleClone(section_id, put_next, name) {
		let config_name = this.uciconfig || this.map.config;
		this.map.data.clone(config_name, this.sectiontype, section_id, put_next, name);
		return this.map.save(null, true);
	},

	/**
	 * 渲染表格内容
	 * @private
	 * @param {Array} cfgsections 节ID数组
	 * @param {Array} nodes 子节点数组
	 * @returns {HTMLElement} 渲染好的表格容器
	 */
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

		// 添加标题和描述
		if (this.title != null && this.title != '')
			sectionEl.appendChild(E('h3', {}, this.title));

		if (this.description != null && this.description != '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		// 添加表头
		tableEl.appendChild(this.renderHeaderRows(false));

		// 添加表格行
		for (let i = 0; i < nodes.length; i++) {
			let sectionname = this.titleFn('sectiontitle', cfgsections[i]);

			if (sectionname == null)
				sectionname = cfgsections[i];

			// 创建行元素
			const trEl = E('tr', {
				'id': 'cbi-%s-%s'.format(config_name, cfgsections[i]),
				'class': 'tr cbi-section-table-row',
				'data-sid': cfgsections[i],
				'draggable': (drag_sort || touch_sort) ? true : null,
				'mousedown': drag_sort ? L.bind(this.handleDragInit, this) : null,
				'dragstart': drag_sort ? L.bind(this.handleDragStart, this) : null,
				'dragover': drag_sort ? L.bind(this.handleDragOver, this) : null,
				'dragenter': drag_sort ? L.bind(this.handleDragEnter, this) : null,
				'dragleave': drag_sort ? L.bind(this.handleDragLeave, this) : null,
				'dragend': drag_sort ? L.bind(this.handleDragEnd, this) : null,
				'drop': drag_sort ? L.bind(this.handleDrop, this) : null,
				'touchmove': touch_sort ? L.bind(this.handleTouchMove, this) : null,
				'touchend': touch_sort ? L.bind(this.handleTouchEnd, this) : null,
				'data-title': (sectionname && (!this.anonymous || this.sectiontitle)) ? sectionname : null,
				'data-section-id': cfgsections[i]
			});

			// 添加行样式
			if (this.extedit || this.rowcolors)
				trEl.classList.add(!(tableEl.childNodes.length % 2)
					? 'cbi-rowstyle-1' : 'cbi-rowstyle-2');

			// 添加单元格
			for (let j = 0; j < max_cols && nodes[i].firstChild; j++)
				trEl.appendChild(nodes[i].firstChild);

			// 添加操作按钮
			trEl.appendChild(this.renderRowActions(cfgsections[i], has_more ? _('More…') : null));
			tableEl.appendChild(trEl);
		}

		// 空表格处理
		if (nodes.length == 0)
			tableEl.appendChild(E('tr', { 'class': 'tr cbi-section-table-row placeholder' },
				E('td', { 'class': 'td' }, this.renderSectionPlaceholder())));

		sectionEl.appendChild(tableEl);

		sectionEl.appendChild(this.renderSectionAdd('cbi-tblsection-create'));

		dom.bindClassInstance(sectionEl, this);

		return sectionEl;
	},

	/**
	 * 渲染表头行
	 * @private
	 * @param {boolean} has_action 是否有操作列
	 * @returns {DocumentFragment} 表头行的文档片段
	 */
	renderHeaderRows(has_action) {
		let has_titles = false;
		let has_descriptions = false;
		const max_cols = this.max_cols ?? this.children.length;
		const has_more = max_cols < this.children.length;
		const anon_class = (!this.anonymous || this.sectiontitle) ? 'named' : 'anonymous';
		const trEls = E([]);

		// 检查是否需要显示标题和描述
		for (let i = 0, opt; i < max_cols && (opt = this.children[i]) != null; i++) {
			if (opt.modalonly)
				continue;

			has_titles = has_titles || !!opt.title;
			has_descriptions = has_descriptions || !!opt.description;
		}

		// 渲染标题行
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

				// 设置列宽
				if (opt.width != null)
					trEl.lastElementChild.style.width =
						(typeof(opt.width) == 'number') ? `${opt.width}px` : opt.width;

				// 添加标题链接或纯文本
				if (opt.titleref)
					trEl.lastElementChild.appendChild(E('a', {
						'href': opt.titleref,
						'class': 'cbi-title-ref',
						'title': this.titledesc ?? _('Go to relevant configuration page')
					}, opt.title));
				else
					dom.content(trEl.lastElementChild, opt.title);
			}

			// 添加操作列
			if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable)
				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell cbi-section-actions'
				}));

			trEls.appendChild(trEl);
		}

		// 渲染描述行
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

			if (this.sortable || this.extedit || this.addremove || has_more || has_action || this.cloneable)
				trEl.appendChild(E('th', {
					'class': 'th cbi-section-table-cell cbi-section-actions'
				}));

			trEls.appendChild(trEl);
		}

		return trEls;
	},

	/**
	 * 渲染行操作按钮
	 * @private
	 * @param {string} section_id 节ID
	 * @param {string} more_label "更多"按钮文本
	 * @returns {HTMLElement} 操作按钮单元格
	 */
	renderRowActions(section_id, more_label) {
		const config_name = this.uciconfig ?? this.map.config;

		// 无操作按钮时返回空元素
		if (!this.sortable && !this.extedit && !this.addremove && !more_label && !this.cloneable)
			return E([]);

		const tdEl = E('td', {
			'class': 'td cbi-section-table-cell nowrap cbi-section-actions'
		}, E('div'));

		// 添加排序按钮
		if (this.sortable) {
			dom.append(tdEl.lastElementChild, [
				E('button', {
					'title': _('Drag to reorder'),
					'class': 'cbi-button drag-handle center',
					'style': 'cursor:move',
					'disabled': this.map.readonly || null
				}, '☰')
			]);
		}

		// 添加编辑按钮
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

		// 添加"更多"按钮
		if (more_label) {
			dom.append(tdEl.lastElementChild,
				E('button', {
					'title': more_label,
					'class': 'btn cbi-button cbi-button-edit',
					'click': ui.createHandlerFn(this, 'renderMoreOptionsModal', section_id)
				}, [ more_label ])
			);
		}

		// 添加克隆按钮
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

		// 添加删除按钮
		if (this.addremove) {
			const btn_title = this.titleFn('removebtntitle', section_id);

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

	// 以下是各种交互处理方法，保持原有实现不变
	// 仅添加方法描述注释

	/**
	 * 初始化拖拽状态
	 * @private
	 * @param {Event} ev 鼠标事件
	 */
	handleDragInit(ev) {
		scope.dragState = { node: ev.target };
	},

	/**
	 * 处理拖拽开始事件
	 * @private
	 * @param {Event} ev 拖拽事件
	 */
	handleDragStart(ev) {
		if (!scope.dragState?.node.classList.contains('drag-handle')) {
			scope.dragState = null;
			return false;
		}

		scope.dragState.node = dom.parent(scope.dragState.node, '.tr');
		ev.dataTransfer.setData('text', 'drag');
		ev.target.style.opacity = 0.4;
	},

	/**
	 * 处理拖拽经过事件
	 * @private
	 * @param {Event} ev 拖拽事件
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

	/**
	 * 处理拖拽进入事件
	 * @private
	 * @param {Event} ev 拖拽事件
	 */
	handleDragEnter(ev) {
		if (scope.dragState === null ) return;
		scope.dragState.rect = ev.currentTarget.getBoundingClientRect();
		scope.dragState.targetNode = ev.currentTarget;
	},

	/**
	 * 处理拖拽离开事件
	 * @private
	 * @param {Event} ev 拖拽事件
	 */
	handleDragLeave(ev) {
		ev.currentTarget.classList.remove('drag-over-above');
		ev.currentTarget.classList.remove('drag-over-below');
	},

	/**
	 * 处理拖拽结束事件
	 * @private
	 * @param {Event} ev 拖拽事件
	 */
	handleDragEnd(ev) {
		const n = ev.target;

		n.style.opacity = '';
		n.classList.add('flash');
		n.parentNode.querySelectorAll('.drag-over-above, .drag-over-below')
			.forEach((tr) => {
				tr.classList.remove('drag-over-above');
				tr.classList.remove('drag-over-below');
			});
	},

	/**
	 * 处理放置事件
	 * @private
	 * @param {Event} ev 拖拽事件
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

	/**
	 * 计算行背景色
	 * @private
	 * @param {HTMLElement} node 行元素
	 * @returns {Array} RGB颜色数组
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

	/**
	 * 处理触摸移动事件
	 * @private
	 * @param {Event} ev 触摸事件
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

		rowElem.parentNode.querySelectorAll('[draggable]').forEach((tr, i, trs) => {
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

		/* 阻止默认滚动行为，当拖拽手柄接近视口边缘时自动滚动页面 */
		ev.preventDefault();

		if (touchLoc.clientY < 30)
			window.requestAnimationFrame(() => { htmlElem.scrollTop -= 30 });
		else if (touchLoc.clientY > viewportHeight - 30)
			window.requestAnimationFrame(() => { htmlElem.scrollTop += 30 });
	},

	/**
	 * 处理触摸结束事件
	 * @private
	 * @param {Event} ev 触摸事件
	 */
	handleTouchEnd(ev) {
		const rowElem = dom.parent(ev.target, '.tr');
		const htmlElem = document.querySelector('html');
		const dragHandle = document.querySelector('.touchsort-element');
		const targetElem = rowElem.parentNode.querySelector('.drag-over-above, .drag-over-below');
		const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight ?? 0);

		if (!dragHandle)
			return;

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

	/**
	 * 处理模态框取消事件
	 * @private
	 * @param {Object} modalMap 模态框映射实例
	 * @param {Event} ev 事件对象
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

	/**
	 * 处理模态框保存事件
	 * @private
	 * @param {Object} modalMap 模态框映射实例
	 * @param {Event} ev 事件对象
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

	/**
	 * 处理排序点击事件
	 * @private
	 * @param {Event} ev 点击事件
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
			val = `${val}`; // 强制非字符串类型转为字符串
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
	 * 添加模态框选项
	 *
	 * 子类可重写此方法，在显示"更多"模态框前添加额外配置项
	 *
	 * @param {NamedSection} modalSection 模态框节实例
	 * @param {string} section_id 节ID
	 * @param {Event} ev 触发事件
	 * @returns {*|Promise<*>} 可返回Promise用于异步操作
	 */
	addModalOptions(modalSection, section_id, ev) {
		// 默认空实现
	},

	/**
	 * 获取当前活动模态框
	 * @private
	 * @returns {HTMLElement} 模态框DOM元素
	 */
	getActiveModalMap() {
		return document.querySelector('body.modal-overlay-active > #modal_overlay > .modal.cbi-modal > .cbi-map:not(.hidden)');
	},

	/**
	 * 获取上一个模态框
	 * @private
	 * @returns {HTMLElement} 模态框DOM元素
	 */
	getPreviousModalMap() {
		const mapNode = this.getActiveModalMap();
		const prevNode = mapNode ? mapNode.previousElementSibling : null;

		return (prevNode && prevNode.matches('.cbi-map.hidden')) ? prevNode : null;
	},

	/**
	 * 克隆选项到目标节
	 * @private
	 * @param {AbstractSection} src_section 源节
	 * @param {AbstractSection} dest_section 目标节
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

	/**
	 * 渲染"更多选项"模态框
	 * @private
	 * @param {string} section_id 节ID
	 * @param {Event} ev 触发事件
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

			s.tabs = this.tabs;
			s.tab_names = this.tab_names;

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

// 网格节类
const CBIGridSection = CBITableSection.extend(/** @lends LuCI.form.GridSection.prototype */ {
	// 添加标签页
	tab(name, title, description) {
		CBIAbstractSection.prototype.tab.call(this, name, title, description);
	},

	// 处理添加节
	handleAdd(ev, name) {
		const config_name = this.uciconfig ?? this.map.config;
		const section_id = this.map.data.add(config_name, this.sectiontype, name);
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		prevMap.addedSection = section_id;

		return this.renderMoreOptionsModal(section_id);
	},

	// 处理模态保存
	handleModalSave(...args) /* ... */{
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		return this.super('handleModalSave', args);
	},

	// 处理模态取消
	handleModalCancel(modalMap, ev, isSaving) {
		const config_name = this.uciconfig ?? this.map.config;
		const mapNode = this.getPreviousModalMap();
		const prevMap = mapNode ? dom.findClassInstance(mapNode) : this.map;

		if (prevMap.addedSection != null && !isSaving)
			this.map.data.remove(config_name, prevMap.addedSection);

		delete prevMap.addedSection;

		return this.super('handleModalCancel', arguments);
	},

	// 渲染UCI节
	renderUCISection(section_id) {
		return this.renderOptions(null, section_id);
	},

	// 渲染子元素
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

	// 渲染文本值
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

	// 渲染表头行
	renderHeaderRows(section_id) {
		return this.super('renderHeaderRows', [ true ]);
	},

	// 渲染行操作
	renderRowActions(section_id) {
		return this.super('renderRowActions', [ section_id, _('Edit') ]);
	},

	// 解析节
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
// 命名节类
const CBINamedSection = CBIAbstractSection.extend(/** @lends LuCI.form.NamedSection.prototype */ {
	__name__: 'CBI.NamedSection',
	__init__(map, section_id, ...args) {
		this.super('__init__', [ map, ...args ]);

		this.section = section_id;
	},

	// 获取配置节
	cfgsections() {
		return [ this.section ];
	},

	// 处理添加节
	handleAdd(ev) {
		const section_id = this.section;
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.add(config_name, this.sectiontype, section_id);
		return this.map.save(null, true);
	},

	// 处理删除节
	handleRemove(ev) {
		const section_id = this.section;
		const config_name = this.uciconfig ?? this.map.config;

		this.map.data.remove(config_name, section_id);
		return this.map.save(null, true);
	},

	// 渲染节内容
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

		if (typeof(this.title) === 'string' && this.title !== '')
			sectionEl.appendChild(E('h3', {}, this.title));

		if (typeof(this.description) === 'string' && this.description !== '')
			sectionEl.appendChild(E('div', { 'class': 'cbi-section-descr' }, this.description));

		if (ucidata) {
			if (this.addremove) {
				sectionEl.appendChild(
					E('div', { 'class': 'cbi-section-remove right' },
						E('button', {
							'class': 'cbi-button',
							'click': ui.createHandlerFn(this, 'handleRemove'),
							'disabled': this.map.readonly || null
						}, [ _('Delete') ])));
			}

			sectionEl.appendChild(E('div', {
				'id': 'cbi-%s-%s'.format(config_name, section_id),
				'class': this.tabs
					? 'cbi-section-node cbi-section-node-tabbed' : 'cbi-section-node',
				'data-section-id': section_id
			}, nodes));
		}
		else if (this.addremove) {
			sectionEl.appendChild(
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, 'handleAdd'),
					'disabled': this.map.readonly || null
				}, [ _('Add') ]));
		}

		dom.bindClassInstance(sectionEl, this);

		return sectionEl;
	},

	// 渲染节
	render() {
		const config_name = this.uciconfig ?? this.map.config;
		const section_id = this.section;

		return Promise.all([
			this.map.data.get(config_name, section_id),
			this.renderUCISection(section_id)
		]).then(this.renderContents.bind(this));
	}
});

// 表单类导出
const CBIValue = CBIAbstractValue.extend(/** @lends LuCI.form.Value.prototype */ {
	__name__: 'CBI.Value',

	/**
	 * If set to `true`, the field is rendered as password input, otherwise
	 * as plain text input.
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
	 * or a plain text string. If omitted, the `key` value is used as caption.
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

	/** @private */
	handleValueChange(section_id, state, ev) {
		if (typeof(this.onchange) != 'function')
			return;

		const value = this.formvalue(section_id);

		if (isEqual(value, state.previousValue))
			return;

		state.previousValue = value;
		this.onchange.call(this, ev, section_id, value);
	},

	/** @private */
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
			optionEl.classList.add('hidden');

		optionEl.addEventListener('widget-change',
			L.bind(this.map.checkDepends, this.map));

		optionEl.addEventListener('widget-change',
			L.bind(this.handleValueChange, this, section_id, {}));

		dom.bindClassInstance(optionEl, this);

		return optionEl;
	},

	/** @private */
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
				validate: L.bind(this.validate, this, section_id),
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
				validate: L.bind(this.validate, this, section_id),
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
 *
 * `DynamicList` 类实现动态列表控件，允许用户输入多个唯一值，
 * 并可选地从预定义选项中选择。基于 {@link LuCI.ui.DynamicList} 部件实现。
 *
 * 典型应用场景：
 * - 允许动态添加/删除多个值的输入项
 * - 支持从预定义选项中选择或自定义输入
 * - 适用于需要多值配置的场景（如DNS服务器列表、IP白名单等）
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIDynamicList = CBIValue.extend(/** @lends LuCI.form.DynamicList.prototype */ {
	__name__: 'CBI.DynamicList',

	/**
	 * 渲染动态列表部件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {Array|string} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的动态列表DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;

		// 转换预定义选项数据
		const choices = this.transformChoices();

		// 确保值为数组形式
		const items = L.toArray(value);

		// 创建DynamicList部件实例
		const widget = new ui.DynamicList(items, choices, {
			id: this.cbid(section_id),       // 设置控件ID
			sort: this.keylist,              // 使用keylist作为排序依据
			optional: this.optional || this.rmempty, // 设置是否可选
			datatype: this.datatype,         // 设置数据类型验证
			placeholder: this.placeholder,    // 设置占位文本
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
		});

		// 渲染并返回部件
		return widget.render();
	},
});

/**
 * @class ListValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc
 *
 * `ListValue` 类实现静态下拉选择控件，允许用户从预定义选项中选择单个值。
 * 基于 {@link LuCI.ui.Select} 部件实现，支持两种渲染模式：
 * - 传统HTML下拉列表（select模式）
 * - 单选按钮组（radio模式）
 *
 * 典型应用场景：
 * - 需要从固定选项中选择单个值的配置项
 * - 替代布尔值的Flag控件，提供更多选项
 * - 需要明确显示所有选项的场景（使用radio模式）
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIListValue = CBIValue.extend(/** @lends LuCI.form.ListValue.prototype */ {
	__name__: 'CBI.ListValue',

	/**
	 * 构造函数
	 * @param {...*} args 传递给父类构造函数的参数
	 */
	__init__(...args) {
		// 调用父类构造函数
		this.super('__init__', args);

		// 默认使用select下拉框模式
		this.widget = 'select';

		// 默认水平排列（radio模式时生效）
		this.orientation = 'horizontal';

		// 初始化依赖列表
		this.deplist = [];
	},

	/**
	 * 设置HTML select元素的size属性
	 * - 控制同时显示的选项数量
	 * - 设为1时表现为传统下拉框
	 * - 大于1时表现为滚动列表框
	 *
	 * @name LuCI.form.ListValue.prototype#size
	 * @type number
	 * @default null
	 */

	/**
	 * 设置控件呈现类型
	 * - "select": HTML下拉列表（默认）
	 * - "radio": 单选按钮组
	 *
	 * @name LuCI.form.ListValue.prototype#widget
	 * @type string
	 * @default select
	 */

	/**
	 * 设置radio模式下的选项排列方向
	 * - "horizontal": 水平排列（默认）
	 * - "vertical": 垂直排列
	 * 仅在widget="radio"时生效
	 *
	 * @name LuCI.form.ListValue.prototype#orientation
	 * @type string
	 * @default horizontal
	 */

	/**
	 * 渲染选择控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的控件DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		// 转换预定义选项数据
		const choices = this.transformChoices();
		const widget = new ui.Select((cfgvalue != null) ? cfgvalue : this.default, choices, {

		// 创建Select部件实例
			id: this.cbid(section_id),       // 设置控件ID
			size: this.size,                 // 设置下拉框显示项数
			sort: this.keylist,              // 使用keylist作为排序依据
			widget: this.widget,             // 设置控件类型（select/radio）
			optional: this.optional,          // 设置是否可选
			orientation: this.orientation,   // 设置radio按钮排列方向
			placeholder: this.placeholder,    // 设置占位文本
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
		});

		// 渲染并返回部件
		return widget.render();
	},
});

/**
 * @class RichListValue
 * @memberof LuCI.form
 * @augments LuCI.form.ListValue
 * @hideconstructor
 * @classdesc
 *
 * `RichListValue` 类实现增强型下拉选择控件，在标准ListValue基础上支持：
 * - 每个选项可包含详细描述信息
 * - 支持富文本选项内容
 * - 保持ListValue所有功能的同时提供更丰富的展示形式
 *
 * 典型应用场景：
 * - 需要详细说明每个选项含义的配置项
 * - 选项内容需要格式化展示（如包含链接、样式等）
 * - 需要鼠标悬停显示详细说明的配置界面
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIRichListValue = CBIListValue.extend(/** @lends LuCI.form.ListValue.prototype */ {
	__name__: 'CBI.RichListValue',

	/**
	 * 构造函数
	 */
	__init__() {
		// 调用父类构造函数
		this.super('__init__', arguments);

		// 默认使用select下拉框模式
		this.widget = 'select';

		// 默认水平排列（radio模式时生效）
		this.orientation = 'horizontal';

		// 初始化依赖列表
		this.deplist = [];
	},

	/**
	 * 设置radio/checkbox元素的排列方向
	 * - "horizontal": 水平排列（默认）
	 * - "vertical": 垂直排列
	 * 仅在widget不为"select"时生效
	 *
	 * @name LuCI.form.RichListValue.prototype#orientation
	 * @type string
	 * @default horizontal
	 */

	/**
	 * 设置HTML select元素的size属性
	 * - 控制同时显示的选项数量
	 * - 设为1时表现为传统下拉框
	 * - 大于1时表现为滚动列表框
	 *
	 * @name LuCI.form.RichListValue.prototype#size
	 * @type number
	 * @default null
	 */

	/**
	 * 设置控件呈现类型
	 * - "select": HTML下拉列表（默认）
	 * - "radio": 单选按钮组
	 *
	 * @name LuCI.form.RichListValue.prototype#widget
	 * @type string
	 * @default select
	 */

	/**
	 * 渲染富文本选择控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的控件DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		// 转换预定义选项数据
		const choices = this.transformChoices();

		const widget = new ui.Dropdown((cfgvalue != null) ? cfgvalue : this.default, choices, {

		// 创建Dropdown部件实例（支持富文本渲染）
			id: this.cbid(section_id),       // 设置控件ID
			size: this.size,                 // 设置下拉框显示项数
			sort: this.keylist,              // 使用keylist作为排序依据
			widget: this.widget,             // 设置控件类型（select/radio）
			optional: this.optional,          // 设置是否可选
			orientation: this.orientation,   // 设置radio按钮排列方向
			select_placeholder: this.select_placeholder || this.placeholder, // 下拉模式占位文本
			custom_placeholder: this.custom_placeholder || this.placeholder, // 自定义输入占位文本
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
		});

		// 渲染并返回部件
		return widget.render();
	},

	/**
	 * 添加带详细描述的选项
	 * @param {string} value 选项值
	 * @param {string|Node} title 选项标题
	 * @param {string|Node} description 选项详细描述（可选）
	 *
	 * @example
	 * // 添加简单选项
	 * option.value('value1', '显示文本');
	 *
	 * // 添加带描述的选项
	 * option.value('value2', '显示文本', '详细描述文本');
	 *
	 * // 添加富文本选项
	 * option.value('value3', E('strong', '强调文本'),
	 *     E('div', [E('span', '描述'), E('br'), E('em', '额外说明')]));
	 */
	value(value, title, description) {
		if (description) {
			// 构建带详细描述的选项DOM结构
			CBIListValue.prototype.value.call(this, value, E([], [
				// 主显示区域（简洁视图）
				E('span', { 'class': 'hide-open' }, [ title ]),
				// 详细描述区域（展开视图）
				E('div', { 'class': 'hide-close', 'style': 'min-width:25vw' }, [
					E('strong', [ title ]),
					E('br'),
					E('span', { 'style': 'white-space:normal' }, description)
				])
			]));
		}
		else {
			// 无描述时使用标准选项添加方式
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
 *
 * `FlagValue` 类基于 {@link LuCI.ui.Checkbox} 部件实现复选框控件，
 * 用于表示布尔型配置选项，支持自定义选中/未选中状态的值。
 *
 * 典型应用场景：
 * - 开关型配置项（启用/禁用）
 * - 需要明确布尔值的选项
 * - 简单的是/否选择场景
 */
const CBIRangeSliderValue = CBIValue.extend(/** @lends LuCI.form.RangeSliderValue.prototype */ {
	__name__: 'CBI.RangeSliderValue',
	renderWidget(section_id, option_index, cfgvalue) {
		const slider = new ui.RangeSlider((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			name: this.cbid(section_id),
			optional: this.optional,
			min: this.min,
			max: this.max,
			step: this.step,
			calculate: this.calculate,
			calcunits: this.calcunits,
			usecalc: this.usecalc,
			disabled: this.readonly || this.disabled,
			datatype: this.datatype,
			validate: this.validate,
		});

		this.widget = slider;

		return slider.render();
	},

	/**
	 * Query the current form input value.
	 *
	 * @param {string} section_id
	 * The configuration section ID
	 *
	 * @returns {*}
	 * Returns the current input value.
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		if (!elem) return null;
		let val = (this.usecalc && (typeof this.calculate === 'function'))
			? elem.getCalculatedValue()
			: elem.getValue();
		val = val?.toString();
		return (val === this.default?.toString()) ? null : val;
	}
});
/*
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIFlagValue = CBIValue.extend(/** @lends LuCI.form.FlagValue.prototype */ {
	__name__: 'CBI.FlagValue',

	/**
	 * 构造函数
	 * @param {...*} args 传递给父类构造函数的参数
	 */
	__init__(...args) {
		this.super('__init__', args);

		// 默认选中状态的值（通常为"1"）
		this.enabled = '1';

		// 默认未选中状态的值（通常为"0"）
		this.disabled = '0';

		// 默认初始状态为未选中
		this.default = this.disabled;
	},

	/**
	 * 设置复选框选中时对应的值
	 * @name LuCI.form.FlagValue.prototype#enabled
	 * @type string
	 * @default "1"
	 */

	/**
	 * 设置复选框未选中时对应的值
	 * @name LuCI.form.FlagValue.prototype#disabled
	 * @type string
	 * @default "0"
	 */

	/**
	 * 设置复选框的提示工具文本
	 * - 字符串：直接作为提示文本
	 * - 函数：调用函数获取提示文本（返回null时不显示）
	 *
	 * @name LuCI.form.FlagValue.prototype#tooltip
	 * @type string|function
	 * @default null
	 */

	/**
	 * 设置提示工具图标
	 * - 内置图标：使用表情符号（如'ℹ️'）
	 * - 自定义图标：指定图片路径
	 *
	 * @name LuCI.form.FlagValue.prototype#tooltipicon
	 * @type string
	 * @default 'ℹ️'
	 */

	/**
	 * 渲染复选框部件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的复选框DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		// 处理工具提示文本
		let tooltip = null;
		if (typeof(this.tooltip) == 'function')
			tooltip = this.tooltip(section_id);
		else if (typeof(this.tooltip) == 'string')
			tooltip = this.tooltip.format(section_id);

		// 创建Checkbox部件实例
		const widget = new ui.Checkbox((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),       // 设置控件ID
			value_enabled: this.enabled,     // 设置选中状态值
			value_disabled: this.disabled,   // 设置未选中状态值
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			tooltip,                         // 设置工具提示
			tooltipicon: this.tooltipicon,   // 设置提示图标
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
		});

		return widget.render();
	},

	/**
	 * 获取复选框的当前表单值
	 * @override
	 * @param {string} section_id 节ID
	 * @returns {string} 当前状态对应的值（enabled/disabled）
	 */
	formvalue(section_id) {
		const elem = this.getUIElement(section_id);
		const checked = elem ? elem.isChecked() : false;
		return checked ? this.enabled : this.disabled;
	},

	/**
	 * 获取复选框状态的文本表示
	 * @override
	 * @param {string} section_id 节ID
	 * @returns {string} 本地化的"是"/"否"文本
	 */
	textvalue(section_id) {
		let cval = this.cfgvalue(section_id);
		if (cval == null)
			cval = this.default;

		return (cval == this.enabled) ? _('Yes') : _('No');
	},

	/**
	 * 解析并保存复选框值
	 * @override
	 * @param {string} section_id 节ID
	 * @returns {Promise} 异步保存操作的结果
	 */
	parse(section_id) {
		if (this.isActive(section_id)) {
			const fval = this.formvalue(section_id);

			// 验证输入值
			if (!this.isValid(section_id)) {
				const title = this.stripTags(this.title).trim();
				const error = this.getValidationError(section_id);

				return Promise.reject(new TypeError(
					`${_('Option "%s" contains an invalid input value.').format(title || this.option)} ${error}`));
			}

			// 处理空值情况
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
 *
 * `MultiValue` 类扩展自 `DynamicList`，使用 {@link LuCI.ui.Dropdown} 部件
 * 实现多选下拉控件，支持从预定义选项中选择多个值。
 *
 * 主要特性：
 * - 支持多选操作
 * - 可限制显示项数
 * - 支持自定义值输入
 * - 提供响应式布局
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIMultiValue = CBIDynamicList.extend(/** @lends LuCI.form.MultiValue.prototype */ {
	__name__: 'CBI.MultiValue',

	/**
	 * 构造函数
	 * @param {...*} args 传递给父类构造函数的参数
	 */
	__init__(...args) {
		this.super('__init__', args);

		// 设置默认占位文本
		this.placeholder = _('-- Please choose --');
	},

	/**
	 * 是否允许输入自定义值
	 * true时允许在预定义选项外输入自定义值
	 *
	 * @name LuCI.form.MultiValue.prototype#create
	 * @type boolean
	 * @default null
	 */

	/**
	 * 设置下拉面板中可见的选项数量
	 * - 控制下拉面板的高度
	 * - 未设置时使用size属性值，默认为3
	 *
	 * @name LuCI.form.MultiValue.prototype#display_size
	 * @type number
	 * @default null
	 */

	/**
	 * 设置下拉列表中显示的选项总数
	 * - 控制是否启用滚动条
	 * - 设为-1表示显示所有选项
	 * - 未设置时使用size属性值，默认为-1
	 *
	 * @name LuCI.form.MultiValue.prototype#dropdown_size
	 * @type number
	 * @default null
	 */

	/**
	 * 渲染多选下拉控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的下拉控件DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		// 获取当前值并确保为数组形式
		const value = (cfgvalue != null) ? cfgvalue : this.default;
		const choices = this.transformChoices();

		// 创建Dropdown部件实例
		const widget = new ui.Dropdown(L.toArray(value), choices, {
			id: this.cbid(section_id),       // 设置控件ID
			sort: this.keylist,              // 使用keylist排序选项
			multiple: true,                  // 启用多选模式
			optional: this.optional || this.rmempty, // 设置是否可选
			select_placeholder: this.placeholder, // 设置占位文本
			create: this.create,             // 是否允许自定义值
			display_items: this.display_size ?? this.size ?? 3, // 设置可见项数
			dropdown_items: this.dropdown_size ?? this.size ?? -1, // 设置总显示项数
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
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
 *
 * `TextValue` 类基于 {@link LuCI.ui.Textarea} 部件实现多行文本输入控件，
 * 适用于需要输入大段文本的配置场景。
 *
 * 典型应用场景：
 * - 配置文件编辑
 * - 长文本描述输入
 * - 需要格式保持的文本输入
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBITextValue = CBIValue.extend(/** @lends LuCI.form.TextValue.prototype */ {
	__name__: 'CBI.TextValue',

	/**
	 * 当前输入值
	 * @private
	 * @type {string|null}
	 */
	value: null,

	/**
	 * 是否强制使用等宽字体
	 * true时textarea内容使用monospace字体
	 *
	 * @name LuCI.form.TextValue.prototype#monospace
	 * @type boolean
	 * @default false
	 */

	/**
	 * 设置文本域的列数（宽度）
	 * 对应HTML textarea的cols属性
	 *
	 * @name LuCI.form.TextValue.prototype#cols
	 * @type number
	 * @default null
	 */

	/**
	 * 设置文本域的行数（高度）
	 * 对应HTML textarea的rows属性
	 *
	 * @name LuCI.form.TextValue.prototype#rows
	 * @type number
	 * @default null
	 */

	/**
	 * 设置文本换行模式
	 * 对应HTML textarea的wrap属性
	 * 可选值：soft|hard|off
	 *
	 * @name LuCI.form.TextValue.prototype#wrap
	 * @type string
	 * @default null
	 */

	/**
	 * 渲染多行文本输入控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {string} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的textarea元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;

		// 创建Textarea部件实例
		const widget = new ui.Textarea(value, {
			id: this.cbid(section_id),       // 设置控件ID
			optional: this.optional || this.rmempty, // 设置是否可选
			placeholder: this.placeholder,    // 设置占位文本
			monospace: this.monospace,        // 设置等宽字体
			cols: this.cols,                  // 设置列数
			rows: this.rows,                  // 设置行数
			wrap: this.wrap,                  // 设置换行模式
			validate: L.bind(this.validate, this, section_id), // 绑定验证函数
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly // 设置禁用状态
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
 *
 * `DummyValue` 类实现只读文本显示控件，用于展示配置值但不允许编辑。
 * 基于 {@link LuCI.ui.Hiddenfield} 实现，支持HTML渲染和链接跳转。
 *
 * 典型应用场景：
 * - 展示只读配置信息
 * - 显示计算后的结果值
 * - 提供查看但不允许修改的参数
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项标题文本。
 *
 * @param {string} [description]
 * 选项描述文本。
 */
const CBIDummyValue = CBIValue.extend(/** @lends LuCI.form.DummyValue.prototype */ {
	__name__: 'CBI.DummyValue',

	/**
	 * 设置点击文本跳转的URL
	 * 设置后文本会被包裹在<a>标签中
	 *
	 * @name LuCI.form.DummyValue.prototype#href
	 * @type string
	 * @default null
	 */

	/**
	 * 是否以原始HTML渲染值
	 * true时不对值进行HTML转义
	 *
	 * @name LuCI.form.DummyValue.prototype#rawhtml
	 * @type boolean
	 * @default null
	 */

	/**
	 * 是否隐藏显示值
	 * true时添加style="display:none"
	 *
	 * @name LuCI.form.DummyValue.prototype#hidden
	 * @type boolean
	 * @default null
	 */

	/**
	 * 渲染只读显示控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {Array} 包含显示元素和隐藏字段的DOM数组
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;

		// 创建隐藏字段（用于表单提交）
		const hiddenEl = new ui.Hiddenfield(value, { id: this.cbid(section_id) });

		// 创建显示容器
		const outputEl = E('div', { 'style': this.hidden ? 'display:none' : null });

		// 处理可点击链接
		if (this.href && !((this.readonly != null) ? this.readonly : this.map.readonly))
			outputEl.appendChild(E('a', { 'href': this.href }));

		// 添加显示内容（处理HTML转义）
		dom.append(outputEl.lastChild ?? outputEl,
			this.rawhtml ? value : [ value ]);

		// 返回显示元素和隐藏字段的组合
		return E([
			outputEl,
			hiddenEl.render()
		]);
	},

	/**
	 * 空实现 - DummyValue不执行删除操作
	 * @override
	 */
	remove() {},

	/**
	 * 空实现 - DummyValue不执行写入操作
	 * @override
	 */
	write() {}
});

/**
 * @class ButtonValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc
 *
 * `ButtonValue` 类实现按钮控件，将UCI选项值绑定到按钮点击动作。
 * 支持自定义按钮样式、文本和点击行为，是表单交互的重要组件。
 *
 * 典型应用场景：
 * - 触发特定操作的按钮（如测试、刷新等）
 * - 替代复选框的开关式按钮
 * - 需要自定义样式的操作按钮
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 按钮默认标题文本。
 *
 * @param {string} [description]
 * 按钮描述文本。
 */
const CBIButtonValue = CBIValue.extend(/** @lends LuCI.form.ButtonValue.prototype */ {
	__name__: 'CBI.ButtonValue',

	/**
	 * 自定义按钮显示文本
	 * - 字符串：作为格式化模板，UCI节名作为第一个参数
	 * - 函数：接收节ID参数，返回按钮文本
	 * 默认使用option的title参数
	 *
	 * @name LuCI.form.ButtonValue.prototype#inputtitle
	 * @type string|function
	 * @default null
	 * @example
	 * // 使用字符串模板
	 * btn.inputtitle = "按钮-%s";
	 *
	 * // 使用函数
	 * btn.inputtitle = function(section_id) {
	 *     return "操作" + section_id.toUpperCase();
	 * };
	 */

	/**
	 * 设置按钮样式类
	 * 可选值：
	 * - "positive": 积极操作样式（通常为绿色）
	 * - "negative": 危险操作样式（通常为红色）
	 * - "primary": 主要操作样式（通常为蓝色）
	 * - null: 默认中性样式
	 *
	 * @name LuCI.form.ButtonValue.prototype#inputstyle
	 * @type string
	 * @default null
	 */

	/**
	 * 自定义按钮点击处理函数
	 * 默认行为：
	 * 1. 将UCI选项值存入隐藏字段
	 * 2. 触发表单保存操作
	 *
	 * 设置为函数时替代默认行为
	 *
	 * @name LuCI.form.ButtonValue.prototype#onclick
	 * @type function
	 * @default null
	 * @example
	 * btn.onclick = function(ev, section_id) {
	 *     console.log("按钮被点击", section_id);
	 *     return false; // 阻止默认保存行为
	 * };
	 */

	/**
	 * 渲染按钮控件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {Array} 包含按钮和隐藏字段的DOM元素数组
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		const value = (cfgvalue != null) ? cfgvalue : this.default;

		// 创建隐藏字段（用于保存值）
		const hiddenEl = new ui.Hiddenfield(value, { id: this.cbid(section_id) });

		// 创建按钮容器
		const outputEl = E('div');

		// 获取按钮标题（支持动态生成）
		const btn_title = this.titleFn('inputtitle', section_id) ?? this.titleFn('title', section_id);

		if (value !== false)
			// 渲染有效值按钮
			dom.content(outputEl, [
				E('button', {
					'class': 'cbi-button cbi-button-%s'.format(this.inputstyle ?? 'button'),
					'click': ui.createHandlerFn(this, (section_id, ev) => {
						// 自定义点击处理
						if (this.onclick)
							return this.onclick(ev, section_id);

						// 默认行为：保存值并提交表单
						ev.currentTarget.parentNode.nextElementSibling.value = value;
						return this.map.save();
					}, section_id),
					'disabled': (this.readonly ?? this.map.readonly) || null
				}, [ btn_title ])
			]);
		else
			// 值无效时显示占位符
			dom.content(outputEl, ' - ');

		// 返回按钮和隐藏字段的组合
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
 *
 * `HiddenValue` 元素封装了 {@link LuCI.ui.Hiddenfield} 部件。
 *
 * 隐藏值部件在过去需要实际提交HTML表单到服务器的旧代码中是必要的。
 * 随着表单的客户端处理，现在有更高效的方式来存储隐藏状态数据。
 *
 * 由于此部件没有可见内容，应将此表单元素的标题和描述值设置为 `null`，
 * 以避免在渲染选项元素时破坏或扭曲表单布局。
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。当通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加选项时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。当通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加选项时自动传入。
 *
 * @param {string} option
 * 要映射的UCI选项名称。
 *
 * @param {string} [title]
 * 选项元素的标题（建议设为null）。
 *
 * @param {string} [description]
 * 选项元素的描述文本（建议设为null）。
 */
const CBIHiddenValue = CBIValue.extend(/** @lends LuCI.form.HiddenValue.prototype */ {
	__name__: 'CBI.HiddenValue',

	/**
	 * 渲染隐藏值部件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的隐藏域DOM元素
	 */
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
 *
 * `FileUpload` 元素封装了 {@link LuCI.ui.FileUpload} 部件，
 * 提供浏览、上传和选择远程文件的功能。
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。当通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加选项时自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。当通过 [option()]{@link LuCI.form.AbstractSection#option} 或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption} 添加选项时自动传入。
 *
 * @param {string} option
 * 要映射的 UCI 选项名称。
 *
 * @param {string} [title]
 * 选项元素的标题。
 *
 * @param {string} [description]
 * 选项元素的描述文本。
 */
const CBIFileUpload = CBIValue.extend(/** @lends LuCI.form.FileUpload.prototype */ {
	__name__: 'CBI.FileSelect',

	__init__(...args) {
		this.super('__init__', args);

		// 初始化文件上传控件属性
		this.browser = false;         // 是否以文件浏览器模式打开
		this.show_hidden = false;     // 是否显示隐藏文件
		this.enable_upload = true;    // 是否启用上传功能
		this.enable_remove = true;    // 是否启用删除功能
		this.enable_download = false; // 是否启用下载功能
		this.root_directory = '/etc/luci-uploads'; // 根目录路径
	},

	/**
	 * 以文件浏览器模式打开而非选择文件模式
	 *
	 * @name LuCI.form.FileUpload.prototype#browser
	 * @type boolean
	 * @default false
	 */

	/**
	 * 控制是否显示隐藏文件
	 *
	 * 在渲染远程目录列表时显示隐藏文件。
	 * 注意：这只是界面显示控制，隐藏文件始终会包含在接收到的远程文件列表中。
	 *
	 * 默认为 `false`，表示不显示隐藏文件。
	 *
	 * @name LuCI.form.FileUpload.prototype#show_hidden
	 * @type boolean
	 * @default false
	 */

	/**
	 * 控制是否启用文件上传功能
	 *
	 * 当设置为 `true` 时，部件会提供按钮让用户选择并上传本地文件到远程系统。
	 * 注意：这只是界面控制，实际上传权限由会话 ACL 规则控制。
	 *
	 * 默认为 `true`，表示显示上传功能。
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_upload
	 * @type boolean
	 * @default true
	 */

	/**
	 * 控制是否启用远程文件删除功能
	 *
	 * 当设置为 `true` 时，部件会提供按钮让用户删除远程目录中的文件。
	 * 注意：这只是界面控制，实际删除权限由会话 ACL 规则控制。
	 *
	 * 默认为 `true`，表示显示删除按钮。
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_remove
	 * @type boolean
	 * @default true
	 */

	/**
	 * 控制是否启用文件下载功能
	 *
	 * @name LuCI.form.FileUpload.prototype#enable_download
	 * @type boolean
	 * @default false
	 */

	/**
	 * 设置文件浏览的根目录
	 *
	 * 定义文件浏览器部件可导航的最高级目录，界面不允许浏览此前缀之外的目录。
	 * 注意：这只是界面控制，实际文件访问权限由会话 ACL 规则控制。
	 *
	 * 默认为 `/etc/luci-uploads`。
	 *
	 * @name LuCI.form.FileUpload.prototype#root_directory
	 * @type string
	 * @default /etc/luci-uploads
	 */

	/** @private */
	renderWidget(section_id, option_index, cfgvalue) {
		// 创建文件上传部件实例
		const browserEl = new ui.FileUpload((cfgvalue != null) ? cfgvalue : this.default, {
			id: this.cbid(section_id),
			name: this.cbid(section_id),
			browser: this.browser,
			show_hidden: this.show_hidden,
			enable_upload: this.enable_upload,
			enable_remove: this.enable_remove,
			enable_download: this.enable_download,
			root_directory: this.root_directory,
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		// 渲染并返回部件
		return browserEl.render();
	}
});

/**
 * @class SectionValue
 * @memberof LuCI.form
 * @augments LuCI.form.Value
 * @hideconstructor
 * @classdesc
 *
 * `SectionValue` 部件将表单节元素嵌入到选项元素容器中，
 * 允许在表单节中嵌套其他节。
 *
 * 这个类主要用于创建复杂的嵌套表单结构，例如：
 * - 在表格行中嵌入完整的表单节
 * - 创建多层次的配置界面
 * - 实现可折叠/展开的配置区域
 *
 * @param {LuCI.form.Map|LuCI.form.JSONMap} form
 * 要添加到的配置表单。当通过[option()]{@link LuCI.form.AbstractSection#option}或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption}添加选项时，
 * 此参数会自动传入。
 *
 * @param {LuCI.form.AbstractSection} section
 * 要添加到的配置节。当通过[option()]{@link LuCI.form.AbstractSection#option}或
 * [taboption()]{@link LuCI.form.AbstractSection#taboption}添加选项时，
 * 此参数会自动传入。
 *
 * @param {string} option
 * 包含节的选项元素的内部名称。由于节容器元素本身不读取或写入任何配置，
 * 此名称仅用于内部引用，不需要与任何底层UCI选项名称相关联。
 *
 * @param {LuCI.form.AbstractSection} subsection_class
 * 用于实例化嵌套节元素的类。注意这里需要传入类本身，
 * 而不是通过`new`创建的类实例。给定的类必须是`AbstractSection`的子类。
 *
 * @param {...*} [class_args]
 * 所有其他参数都将原样传递给子类构造函数。
 * 请参考相应类的构造函数文档了解详细信息。
 */
const CBISectionValue = CBIValue.extend(/** @lends LuCI.form.SectionValue.prototype */ {
	// 类标识符
	__name__: 'CBI.ContainerValue',

	/**
	 * 构造函数
	 * @param {Object} map 表单映射实例
	 * @param {Object} section 父节实例
	 * @param {string} option 选项名称
	 * @param {Function} cbiClass 嵌套节的类
	 * @param {...*} args 传递给嵌套节构造函数的参数
	 */
	__init__(map, section, option, cbiClass, ...args) {
		// 调用父类构造函数
		this.super('__init__', [ map, section, option ]);

		// 验证传入的类是否是AbstractSection的子类
		if (!CBIAbstractSection.isSubclass(cbiClass))
			throw 'Sub section must be a descendent of CBIAbstractSection';

		// 实例化嵌套节
		this.subsection = cbiClass.instantiate([ this.map, ...args ]);
		// 设置父选项引用
		this.subsection.parentoption = this;
	},

	/**
	 * 访问嵌入的节实例
	 *
	 * 此属性持有实例化的嵌套节的引用。
	 *
	 * @name LuCI.form.SectionValue.prototype#subsection
	 * @type LuCI.form.AbstractSection
	 * @readonly
	 */

	/**
	 * 加载节数据
	 * @override
	 * @param {string} section_id 节ID
	 * @returns {Promise} 加载完成的Promise
	 */
	load(section_id) {
		// 委托给嵌套节处理
		return this.subsection.load(section_id);
	},

	/**
	 * 解析节数据
	 * @override
	 * @param {string} section_id 节ID
	 * @returns {Promise} 解析完成的Promise
	 */
	parse(section_id) {
		// 委托给嵌套节处理
		return this.subsection.parse(section_id);
	},

	/**
	 * 渲染部件
	 * @private
	 * @param {string} section_id 节ID
	 * @param {number} option_index 选项索引
	 * @param {*} cfgvalue 配置值
	 * @returns {HTMLElement} 渲染好的DOM元素
	 */
	renderWidget(section_id, option_index, cfgvalue) {
		// 委托给嵌套节渲染
		return this.subsection.render(section_id);
	},

	/**
	 * 检查依赖关系
	 * @private
	 * @param {string} section_id 节ID
	 * @returns {boolean} 依赖是否满足
	 */
	checkDepends(section_id) {
		// 先检查嵌套节的依赖
		this.subsection.checkDepends(section_id);
		// 再检查自身的依赖
		return CBIValue.prototype.checkDepends.apply(this, [ section_id ]);
	},

	/**
	 * 空实现 - 节容器不渲染自己的部件
	 * @override
	 */
	value() {}, // 空实现，因为节容器不管理具体的值

	/**
	 * 空实现 - 节容器不绑定到任何UCI配置
	 * @override
	 */
	write() {}, // 空实现，因为节容器不直接写入配置

	/**
	 * 空实现 - 节容器不绑定到任何UCI配置
	 * @override
	 */
	remove() {}, // 空实现，因为节容器不直接删除配置

	/**
	 * 总是返回null - 节容器不绑定到任何UCI配置
	 * @override
	 * @returns {null}
	 */
	cfgvalue() { return null }, // 总是返回null，因为节容器不直接读取配置

	/**
	 * 总是返回null - 节容器不绑定到任何UCI配置
	 * @override
	 * @returns {null}
	 */
	formvalue() { return null } // 总是返回null，因为节容器不直接管理表单值
});

/**
 * @class form
 * @memberof LuCI
 * @hideconstructor
 * @classdesc
 *
 * LuCI表单类提供了高级抽象，用于创建基于UCI或JSON的配置表单。
 *
 * 要在视图中导入此类，使用`'require form'`；要在外部JavaScript中导入，
 * 使用`L.require("form").then(...)`。
 *
 * 典型表单创建流程：
 * 1. 使用`new`构造一个{@link LuCI.form.Map}或{@link LuCI.form.JSONMap}实例
 * 2. 随后向其添加节(section)和选项(option)
 * 3. 最后调用实例的[render()]{@link LuCI.form.Map#render}方法
 *    来组装HTML标记并插入到DOM中
 *
 * 示例代码：
 *
 * <pre>
 * 'use strict';
 * 'require form';
 *
 * let m, s, o;
 *
 * // 创建映射到/etc/config/example配置文件的表单
 * m = new form.Map('example', 'Example form',
 *     '这是一个映射/etc/config/example内容的示例表单');
 *
 * // 添加命名节，映射配置中的first_section节
 * s = m.section(form.NamedSection, 'first_section', 'example', 'The first section',
 *     '这部分映射/etc/config/example中的"config example first_section"');
 *
 * // 添加复选框选项
 * o = s.option(form.Flag, 'some_bool', 'A checkbox option');
 *
 * // 添加下拉选择选项
 * o = s.option(form.ListValue, 'some_choice', 'A select element');  // 选择框
 * o.value('choice1', 'The first choice');  // 添加选项1
 * o.value('choice2', 'The second choice');  // 添加选项2
 *
 * // 渲染表单并添加到DOM
 * m.render().then((node) => {
 *     document.body.appendChild(node);
 * });
 * </pre>
 */
return baseclass.extend(/** @lends LuCI.form.prototype */ {
	Map: CBIMap, // 表单映射类 - 用于映射UCI配置文件
	JSONMap: CBIJSONMap, // JSON映射类 - 用于映射JSON数据
	AbstractSection: CBIAbstractSection, // 抽象节类 - 所有节类型的基类
	AbstractValue: CBIAbstractValue, // 抽象值类 - 所有选项类型的基类

	TypedSection: CBITypedSection, // 类型化节 - 自动映射特定类型的所有UCI节
	TableSection: CBITableSection, // 表格节 - 以表格形式显示节内容
	GridSection: CBIGridSection, // 网格节 - 增强型表格节，支持模态对话框编辑
	NamedSection: CBINamedSection, // 命名节 - 映射特定的UCI节

	Value: CBIValue, // 基础值类型 - 文本输入框
	DynamicList: CBIDynamicList, // 动态列表 - 可动态添加/删除的列表
	ListValue: CBIListValue, // 列表值 - 下拉选择框
	RichListValue: CBIRichListValue, // 富列表值 - 带详细描述的下拉选择框
	RangeSliderValue: CBIRangeSliderValue,
	Flag: CBIFlagValue, // 标志值 - 复选框
	MultiValue: CBIMultiValue, // 多值 - 多选下拉框
	TextValue: CBITextValue, // 文本值 - 多行文本输入框
	DummyValue: CBIDummyValue, // 虚拟值 - 只读显示，不实际提交
	Button: CBIButtonValue, // 按钮 - 触发操作的按钮
	HiddenValue: CBIHiddenValue, // 隐藏值 - 隐藏的表单项
	FileUpload: CBIFileUpload, // 文件上传 - 文件选择上传控件
	SectionValue: CBISectionValue // 节值 - 嵌套节的容器
});
