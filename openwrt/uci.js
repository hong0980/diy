/* 严格模式声明 */
'use strict';
/* 引入RPC模块 */
'require rpc';
/* 引入基础类模块 */ 
'require baseclass';

/* 检查对象是否为空（忽略指定属性） */
function isEmpty(object, ignore) {
	for (const property in object)
		if (object.hasOwnProperty(property) && property != ignore)
			return false;

	return true;
}

/**
 * UCI配置管理核心类
 */
return baseclass.extend(/** @lends LuCI.uci.prototype */ {
	/* 初始化UCI状态 */
	__init__() {
		this.state = {
			newidx:  0,    // 新section索引计数器
			values:  { },  // 已加载的配置值
			creates: { },  // 新建的section
			changes: { },  // 修改的选项
			deletes: { },  // 删除的标记
			reorder: { }   // 需要重排序的配置
		};

		this.loaded = {};  // 已加载的配置缓存
	},

	/* 声明RPC调用方法 */
	callLoad: rpc.declare({
		object: 'uci',     // UCI服务对象
		method: 'get',     // 获取配置方法
		params: [ 'config' ], // 参数：配置名
		expect: { values: { } }, // 期望返回格式
		reject: true       // 拒绝非零状态码
	}),

	callOrder: rpc.declare({
		object: 'uci',
		method: 'order',   // 排序方法
		params: [ 'config', 'sections' ], // 参数：配置名和section列表
		reject: true
	}),

	callAdd: rpc.declare({
		object: 'uci',
		method: 'add',     // 添加section方法
		params: [ 'config', 'type', 'name', 'values' ], // 参数：配置名、类型、名称、值
		expect: { section: '' }, // 期望返回新section ID
		reject: true
	}),

	callSet: rpc.declare({
		object: 'uci',
		method: 'set',      // 设置选项方法
		params: [ 'config', 'section', 'values' ], // 参数：配置名、section、值
		reject: true
	}),

	callDelete: rpc.declare({
		object: 'uci',
		method: 'delete',   // 删除方法
		params: [ 'config', 'section', 'options' ], // 参数：配置名、section、选项
		reject: true
	}),

	callApply: rpc.declare({
		object: 'uci',
		method: 'apply',    // 应用更改方法
		params: [ 'timeout', 'rollback' ], // 参数：超时时间和回滚标志
		reject: true
	}),

	callConfirm: rpc.declare({
		object: 'uci',
		method: 'confirm',  // 确认更改方法
		reject: true
	}),

	/**
	 * 生成新的临时section ID
	 * @param {string} conf 配置名称
	 * @returns {string} 格式为newXXXXXX的临时ID
	 */
	createSID(conf) {
		const v = this.state.values;
		const n = this.state.creates;
		let sid;

		/* 生成随机ID直到唯一 */
		do {
			sid = "new%06x".format(Math.random() * 0xFFFFFF);
		} while ((n[conf]?.[sid]) || (v[conf]?.[sid]));

		return sid;
	},

	/**
	 * 解析扩展格式的section ID
	 * @param {string} conf 配置名称
	 * @param {string} sid 要解析的ID（支持@type[index]格式）
	 * @returns {string|null} 解析后的真实ID或null
	 */
	resolveSID(conf, sid) {
		if (typeof(sid) != 'string')
			return sid;

		/* 匹配@type[index]格式 */
		const m = /^@([a-zA-Z0-9_-]+)\[(-?[0-9]+)\]$/.exec(sid);

		if (m) {
			const type = m[1];  // section类型
			const pos = +m[2];   // 位置索引
			const sections = this.sections(conf, type);
			/* 处理负数索引 */
			const section = sections[pos >= 0 ? pos : sections.length + pos];

			return section?.['.name'] ?? null;
		}

		return sid;
	},

	/* 私有方法：执行section重排序 */
	reorderSections() {
		const v = this.state.values;
		const n = this.state.creates;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const tasks = [];

		/* 没有需要排序的配置直接返回 */
		if (Object.keys(r).length === 0)
			return Promise.resolve();

		/* 处理每个需要排序的配置 */
		for (const c in r) {
			const o = [ ];

			// 跳过已删除配置
			if (d[c])
				continue;

			// 收集新建的section
			if (n[c])
				for (const s in n[c])
					o.push(n[c][s]);

			// 收集现有的section
			for (const s in v[c])
				o.push(v[c][s]);

			if (o.length > 0) {
				// 按索引排序
				o.sort((a, b) => a['.index'] - b['.index']);

				const sids = [ ];
				// 提取排序后的ID列表
				for (let i = 0; i < o.length; i++)
					sids.push(o[i]['.name']);

				// 提交排序请求
				tasks.push(this.callOrder(c, sids));
			}
		}

		// 清空重排序标记
		this.state.reorder = { };
		return Promise.all(tasks);
	},

	/* 私有方法：加载单个配置 */
	loadPackage(packageName) {
		// 如果未加载则发起请求，否则返回缓存
		if (this.loaded[packageName] == null)
			return (this.loaded[packageName] = this.callLoad(packageName));

		return Promise.resolve(this.loaded[packageName]);
	},

	/**
	 * 加载UCI配置
	 * @param {string|string[]} packages 要加载的配置名或数组
	 * @returns {Promise<string[]>} 返回已加载的配置名数组
	 */
	load(packages) {
		const self = this;
		const pkgs = [ ];
		const tasks = [];

		// 标准化为数组
		if (!Array.isArray(packages))
			packages = [ packages ];

		// 收集需要加载的配置
		for (let i = 0; i < packages.length; i++)
			if (!self.state.values[packages[i]]) {
				pkgs.push(packages[i]);
				tasks.push(self.loadPackage(packages[i]));
			}

		// 处理加载结果
		return Promise.all(tasks).then(responses => {
			// 保存配置值
			for (let i = 0; i < responses.length; i++)
				self.state.values[pkgs[i]] = responses[i];

			// 触发加载事件
			if (responses.length)
				document.dispatchEvent(new CustomEvent('uci-loaded'));

			return pkgs;
		});
	},

	/**
	 * 卸载配置
	 * @param {string|string[]} packages 要卸载的配置名或数组
	 */
	unload(packages) {
		// 标准化为数组
		if (!Array.isArray(packages))
			packages = [ packages ];

		// 清理所有状态
		for (let i = 0; i < packages.length; i++) {
			delete this.state.values[packages[i]];
			delete this.state.creates[packages[i]];
			delete this.state.changes[packages[i]];
			delete this.state.deletes[packages[i]];

			delete this.loaded[packages[i]];
		}
	},

	/**
	 * 添加新section
	 * @param {string} conf 配置名
	 * @param {string} type section类型
	 * @param {string} [name] section名称（可选）
	 * @returns {string} 新section的ID
	 */
	add(conf, type, name) {
		const n = this.state.creates;
		const sid = name || this.createSID(conf);

		// 初始化配置创建记录
		n[conf] ??= { };
		n[conf][sid] = {
			'.type':      type,      // section类型
			'.name':      sid,       // section ID
			'.create':    name,      // 创建参数
			'.anonymous': !name,     // 是否匿名
			'.index':     1000 + this.state.newidx++ // 排序索引
		};

		return sid;
	},

	/**
	 * 克隆现有section
	 * @param {string} conf 目标配置名
	 * @param {string} type section类型
	 * @param {string} srcsid 源section ID
	 * @param {boolean} [put_next] 是否插入到源section后面
	 * @param {string} [name] 新section名称（可选）
	 * @returns {string} 新section的ID
	 */
	clone(conf, type, srcsid, put_next, name) {
		let n = this.state.creates;
		let sid = this.createSID(conf);
		let v = this.state.values;
		put_next = put_next || false;

		// 复制源section属性
		if (!n[conf])
			n[conf] = { };

		n[conf][sid] = {
			...v[conf][srcsid],      // 展开源属性
			'.type': type,
			'.name': sid,
			'.create': name,
			'.anonymous': !name,
			'.index': 1000 + this.state.newidx++
		};

		// 处理位置关系
		if (put_next)
			this.move(conf, sid, srcsid, put_next);
		return sid;
	},

	/**
	 * 删除section
	 * @param {string} conf 配置名
	 * @param {string} sid 要删除的section ID
	 */
	remove(conf, sid) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		/* 处理新建section的删除 */
		if (n[conf]?.[sid]) {
			delete n[conf][sid];
		}
		/* 处理现有section的删除 */
		else if (v[conf]?.[sid]) {
			delete c[conf]?.[sid];

			// 标记删除
			d[conf] ??= { };
			d[conf][sid] = true;
		}
	},

	/**
	 * 枚举配置中的section
	 * @param {string} conf 配置名
	 * @param {string} [type] 过滤类型（可选）
	 * @param {Function} [cb] 回调函数（可选）
	 * @returns {Array} 排序后的section数组
	 */
	sections(conf, type, cb) {
		const sa = [ ];
		const v = this.state.values[conf];
		const n = this.state.creates[conf];
		const c = this.state.changes[conf];
		const d = this.state.deletes[conf];

		if (!v)
			return sa;

		// 收集现有section（过滤已删除）
		for (const s in v)
			if (!d || d[s] !== true)
				if (!type || v[s]['.type'] == type)
					sa.push(Object.assign({ }, v[s], c ? c[s] : null));

		// 收集新建section
		if (n)
			for (const s in n)
				if (!type || n[s]['.type'] == type)
					sa.push(Object.assign({ }, n[s]));

		// 按索引排序
		sa.sort((a, b) => {
			return a['.index'] - b['.index'];
		});

		// 更新排序索引
		for (let i = 0; i < sa.length; i++)
			sa[i]['.index'] = i;

		// 执行回调
		if (typeof(cb) == 'function')
			for (let i = 0; i < sa.length; i++)
				cb.call(this, sa[i], sa[i]['.name']);

		return sa;
	},

	/**
	 * 获取配置值
	 * @param {string} conf 配置名
	 * @param {string} sid section ID
	 * @param {string} [opt] 选项名（可选）
	 * @returns {*} 返回选项值或整个section
	 */
	get(conf, sid, opt) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		sid = this.resolveSID(conf, sid);

		if (sid == null)
			return null;

		/* 获取新建section的值 */
		if (n[conf]?.[sid]) {
			if (opt == null)
				return n[conf][sid];

			return n[conf][sid][opt];
		}

		/* 获取选项值 */
		if (opt != null) {
			/* 检查是否被删除 */
			if (d[conf]?.[sid])
				if (d[conf][sid] === true || d[conf][sid][opt])
					return null;

			/* 检查是否有修改 */
			if (c[conf]?.[sid]?.[opt] != null)
				return c[conf][sid][opt];

			/* 返回原始值 */
			if (v[conf]?.[sid])
				return v[conf][sid][opt];

			return null;
		}

		/* 获取整个section */
		if (v[conf]) {
			/* 检查整个section是否被删除 */
			if (d[conf]?.[sid] === true)
				return null;

			const s = v[conf][sid] || null;

			if (s) {
				/* 合并修改 */
				if (c[conf]?.[sid])
					for (const opt in c[conf][sid])
						if (c[conf][sid][opt] != null)
							s[opt] = c[conf][sid][opt];

				/* 合并删除 */
				if (d[conf]?.[sid])
					for (const opt in d[conf][sid])
						delete s[opt];
			}

			return s;
		}

		return null;
	},

	/**
	 * 设置选项值
	 * @param {string} conf 配置名
	 * @param {string} sid section ID
	 * @param {string} opt 选项名
	 * @param {*} val 要设置的值
	 */
	set(conf, sid, opt, val) {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;

		sid = this.resolveSID(conf, sid);

		// 验证参数有效性
		if (sid == null || opt == null || opt.charAt(0) == '.')
			return;

		// 处理新建section的设置
		if (n[conf]?.[sid]) {
			if (val != null)
				n[conf][sid][opt] = val;
			else
				delete n[conf][sid][opt];
		}
		// 处理现有section的设置
		else if (val != null && val !== '') {
			/* 跳过已删除的section */
			if (d[conf] && d[conf][sid] === true)
				return;

			/* 只处理存在的section */
			if (!v[conf]?.[sid])
				return;

			c[conf] ??= {};
			c[conf][sid] ??= {};

			/* 恢复被删除的选项 */
			if (d[conf]?.[sid]) {
				if (isEmpty(d[conf][sid], opt))
					delete d[conf][sid];
				else
					delete d[conf][sid][opt];
			}

			c[conf][sid][opt] = val;
		}
		// 处理选项删除
		else {
			/* 撤销对要删除选项的修改 */
			if (c[conf]?.[sid]) {
				if (isEmpty(c[conf][sid], opt))
					delete c[conf][sid];
				else
					delete c[conf][sid][opt];
			}

			/* 只删除存在的选项 */
			if (v[conf]?.[sid]?.hasOwnProperty(opt)) {
				d[conf] ??= { };
				d[conf][sid] ??= { };

				if (d[conf][sid] !== true)
					d[conf][sid][opt] = true;
			}
		}
	},

	/**
	 * 删除选项
	 * @param {string} conf 配置名
	 * @param {string} sid section ID
	 * @param {string} opt 选项名
	 */
	unset(conf, sid, opt) {
		return this.set(conf, sid, opt, null);
	},

	/**
	 * 获取第一个匹配section的值
	 * @param {string} conf 配置名
	 * @param {string} [type] section类型（可选）
	 * @param {string} [opt] 选项名（可选）
	 * @returns {*} 返回选项值或整个section
	 */
	get_first(conf, type, opt) {
		let sid = null;

		// 查找第一个匹配的section
		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.get(conf, sid, opt);
	},

	/**
	 * 获取布尔型选项值
	 * @param {string} conf 配置名
	 * @param {string} type section ID或类型
	 * @param {string} [opt] 选项名（可选）
	 * @returns {boolean} 返回布尔值
	 */
	get_bool(conf, type, opt) {
		let value = this.get(conf, type, opt);
		// 检查常见真值表示
		if (typeof(value) == 'string')
			return ['1', 'on', 'true', 'yes', 'enabled'].includes(value.toLowerCase());
		return false;
	},

	/**
	 * 设置第一个匹配section的值
	 * @param {string} conf 配置名
	 * @param {string} [type] section类型（可选）
	 * @param {string} opt 选项名
	 * @param {*} val 要设置的值
	 */
	set_first(conf, type, opt, val) {
		let sid = null;

		// 查找第一个匹配的section
		this.sections(conf, type, s => {
			sid ??= s['.name'];
		});

		return this.set(conf, sid, opt, val);
	},

	/**
	 * 删除第一个匹配section的选项
	 * @param {string} conf 配置名
	 * @param {string} [type] section类型（可选）
	 * @param {string} opt 选项名
	 */
	unset_first(conf, type, opt) {
		return this.set_first(conf, type, opt, null);
	},

	/**
	 * 移动section位置
	 * @param {string} conf 配置名
	 * @param {string} sid1 要移动的section ID
	 * @param {string} [sid2] 目标section ID（可选）
	 * @param {boolean} [after] 是否移动到后面（可选）
	 * @returns {boolean} 是否移动成功
	 */
	move(conf, sid1, sid2, after) {
		const sa = this.sections(conf);
		let s1 = null;
		let s2 = null;

		sid1 = this.resolveSID(conf, sid1);
		sid2 = this.resolveSID(conf, sid2);

		// 查找并移除要移动的section
		for (let i = 0; i < sa.length; i++) {
			if (sa[i]['.name'] != sid1)
				continue;

			s1 = sa[i];
			sa.splice(i, 1);
			break;
		}

		if (s1 == null)
			return false;

		// 处理移动到末尾的情况
		if (sid2 == null) {
			sa.push(s1);
		}
		// 处理相对移动
		else {
			// 查找目标section
			for (let i = 0; i < sa.length; i++) {
				if (sa[i]['.name'] != sid2)
					continue;

				s2 = sa[i];
				// 插入到指定位置
				sa.splice(i + !!after, 0, s1);
				break;
			}

			if (s2 == null)
				return false;
		}

		// 更新所有section的索引
		for (let i = 0; i < sa.length; i++)
			this.get(conf, sa[i]['.name'])['.index'] = i;

		// 标记需要重排序
		this.state.reorder[conf] = true;

		return true;
	},

	/**
	 * 保存所有更改
	 * @returns {Promise} 返回重新加载的配置名数组
	 */
	save() {
		const v = this.state.values;
		const n = this.state.creates;
		const c = this.state.changes;
		const d = this.state.deletes;
		const r = this.state.reorder;
		const self = this;
		const snew = [ ];
		let pkgs = { };
		const tasks = [];

		/* 处理删除操作 */
		if (d)
			for (const conf in d) {
				for (const sid in d[conf]) {
					const o = d[conf][sid];

					if (o === true)
						tasks.push(self.callDelete(conf, sid, null));
					else
						tasks.push(self.callDelete(conf, sid, Object.keys(o)));
				}

				pkgs[conf] = true;
			}

		/* 处理新建操作 */
		if (n)
			for (const conf in n) {
				for (const sid in n[conf]) {
					const p = {
						config: conf,
						values: { }
					};

					// 准备添加参数
					for (const k in n[conf][sid]) {
						if (k == '.type')
							p.type = n[conf][sid][k];
						else if (k == '.create')
							p.name = n[conf][sid][k];
						else if (k.charAt(0) != '.')
							p.values[k] = n[conf][sid][k];
					}

					snew.push(n[conf][sid]);
					tasks.push(self.callAdd(p.config, p.type, p.name, p.values));
				}

				pkgs[conf] = true;
			}

		/* 处理修改操作 */
		if (c)
			for (const conf in c) {
				for (const sid in c[conf])
					tasks.push(self.callSet(conf, sid, c[conf][sid]));

				pkgs[conf] = true;
			}

		/* 处理需要重排序的配置 */
		if (r)
			for (const conf in r)
				pkgs[conf] = true;

		/* 执行所有操作 */
		return Promise.all(tasks).then(responses => {
			/* 更新新建section的真实ID */
			for (let i = 0; i < snew.length; i++)
				snew[i]['.name'] = responses[i];

			return self.reorderSections();
		}).then(() => {
			/* 重新加载所有修改过的配置 */
			pkgs = Object.keys(pkgs);

			self.unload(pkgs);

			return self.load(pkgs);
		});
	},

	/**
	 * 应用配置更改
	 * @param {number} [timeout] 确认超时时间（秒）
	 * @returns {Promise} 返回操作结果
	 */
	apply(timeout) {
		const self = this;
		const date = new Date();

		// 设置默认超时
		if (typeof(timeout) != 'number' || timeout < 1)
			timeout = 10;

		return self.callApply(timeout, true).then(rv => {
			if (rv != 0)
				return Promise.reject(rv);

			// 计算确认截止时间
			const try_deadline = date.getTime() + 1000 * timeout;
			
			// 定义确认函数
			const try_confirm = () => {
				return self.callConfirm().then(rv => {
					if (rv != 0) {
						// 在超时前重试
						if (date.getTime() < try_deadline)
							window.setTimeout(try_confirm, 250);
						else
							return Promise.reject(rv);
					}

					return rv;
				});
			};

			// 启动确认流程
			window.setTimeout(try_confirm, 1000);
		});
	},

	/* 声明获取变更记录的方法 */
	changes: rpc.declare({
		object: 'uci',
		method: 'changes',
		expect: { changes: { } }
	})
});