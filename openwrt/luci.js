/**
 * ============================================================
 * luci.js —— LuCI 核心运行时入口
 * ============================================================
 *
 * 【文件作用】
 *   本文件是 LuCI 前端框架的核心，定义了整个 LuCI JS 运行时的基础设施：
 *
 *   1. Class 系统   ── 原型继承、子类化、单例、super() 调用
 *   2. Headers      ── HTTP 响应头封装（大小写不敏感）
 *   3. Response     ── HTTP 响应体封装（JSON/Text/Blob）
 *   4. Request      ── XMLHttpRequest 封装 + RPC 批处理 + 轮询
 *   5. Poll         ── 定时轮询调度器（setInterval 驱动）
 *   6. DOM          ── DOM 工具集（E() 函数的来源）
 *   7. Session      ── 会话 ID/Token + sessionStorage 读写
 *   8. View         ── 所有插件视图的基类（load→render→footer 生命周期）
 *   9. LuCI 主类    ── 全局 L 对象：路径工具、模块加载、错误处理等
 *  10. XHR 兼容层   ── 旧版 Lua CBI 代码的向后兼容接口
 *
 * 【全局变量】
 *   window.L    → LuCI 主类实例（所有 LuCI API 的统一入口）
 *   window.XHR  → 旧版兼容 XHR 类（新代码请勿使用）
 *
 * 【视图插件的典型用法】
 *
 *   'use strict';
 *   'require form';   // 声明依赖，等价于 L.require('form')
 *   'require uci';
 *
 *   return view.extend({
 *       load()   { return uci.load('network'); },
 *       render() {
 *           var m = new form.Map('network', '网络配置');
 *           // ... 添加 section/option
 *           return m.render();
 *       }
 *   });
 */

((window, document, undefined) => {
	'use strict';

	/**
	 * LuCI 运行时环境变量（由后端模板在页面中注入）。
	 * 常用字段：
	 *   sessionid     当前会话 ID（32位十六进制）
	 *   token         CSRF 防护令牌
	 *   base_url      JS 文件基础 URL（从 luci.js script src 解析）
	 *   scriptname    CGI 脚本路径（如 /cgi-bin/luci）
	 *   resource      静态资源路径（如 /luci-static/resources）
	 *   media         主题媒体路径（如 /luci-static/bootstrap）
	 *   pollinterval  轮询间隔秒数（默认 5）
	 *   rpctimeout    RPC 超时秒数（默认 20）
	 *   ubuspath      ubus RPC 直接访问路径
	 *   documentroot  服务器文档根目录
	 *   nodespec      当前视图的 ACL 节点描述（含 readonly 等）
	 *   requestpath   当前请求路径数组
	 */
	const env = {};

	// ── Class 系统辅助 ──────────────────────────────────────

	/**
	 * 将点/连字符/空格分隔的字符串转为驼峰命名（用于自动生成类 displayName）。
	 * 例如：'luci.base-class' → 'LuciBaseClass'
	 */
	const toCamelCase = s => s.replace(/(?:^|[\. -])(.)/g, (m0, m1) => m1.toUpperCase());

	/**
	 * @class baseclass
	 * @hideconstructor
	 * @memberof LuCI
	 * @classdesc
	 *
	 * LuCI.baseclass 是所有 LuCI 类的抽象基类，实现了原型继承机制。
	 * 提供子类化、单例创建、super() 父类方法调用等能力。
	 */

	/** super() 调用上下文栈（多层继承时追踪当前调用层级） */
	const superContext = {};

	/** 类 ID 全局计数器（每次 extend 时递增，保证每个类的 __id__ 唯一） */
	let classIndex = 0;

	/**
	 * Class：LuCI 类系统的根对象。不直接使用，通过 Class.extend() 创建子类。
	 */
	const Class = Object.assign(function() {}, {

		/**
		 * 用给定属性创建本类的子类，返回新的类构造函数。
		 *
		 * @memberof LuCI.baseclass
		 * @param {Object<string,*>} properties - 子类属性和方法
		 * @returns {LuCI.baseclass} 可用 new 实例化的子类构造函数
		 *
		 * 【使用场景：在插件中创建自定义控件基类】
		 *
		 *   var MyWidget = baseclass.extend({
		 *       __name__: 'MyWidget',
		 *       __init__(title) { this.title = title; },
		 *       render() { return E('div', this.title); }
		 *   });
		 */
		extend(properties) {
			const props = {
				__id__:   { value: classIndex },
				__base__: { value: this.prototype },
				__name__: { value: properties.__name__ ?? `anonymous${classIndex++}` }
			};

			const ClassConstructor = function() {
				if (!(this instanceof ClassConstructor))
					throw new TypeError('Constructor must not be called without "new"');

				if (Object.getPrototypeOf(this).hasOwnProperty('__init__')) {
					if (typeof(this.__init__) != 'function')
						throw new TypeError('Class __init__ member is not a function');

					this.__init__.apply(this, arguments)
				}
				else {
					this.super('__init__', arguments);
				}
			};

			for (const key in properties)
				if (!props[key] && properties.hasOwnProperty(key))
					props[key] = { value: properties[key], writable: true };

			ClassConstructor.prototype = Object.create(this.prototype, props);
			ClassConstructor.prototype.constructor = ClassConstructor;
			Object.assign(ClassConstructor, this);
			ClassConstructor.displayName = toCamelCase(`${props.__name__.value}Class`);

			return ClassConstructor;
		},

		/**
		 * 用给定属性创建子类并立即实例化返回（extend + new 的简便写法）。
		 *
		 * @memberof LuCI.baseclass
		 * @param {Object<string,*>} properties - 子类属性
		 * @param {...*} [new_args] - 传给构造函数的参数
		 * @returns {LuCI.baseclass} 已实例化的子类对象（单例）
		 */
		singleton(properties, ...new_args) {
			return Class.extend(properties).instantiate(new_args);
		},

		/**
		 * 将数组展开为参数，使用 new 实例化本类。
		 *
		 * @memberof LuCI.baseclass
		 * @param {Array<*>} args - 构造函数参数数组
		 * @returns {LuCI.baseclass} 新实例
		 */
		instantiate(args) {
			return new (Function.prototype.bind.call(this, null, ...args))();
		},

		/* 未对外使用的静态方法，内部保留 */
		call(self, method, ...args) {
			if (typeof(this.prototype[method]) != 'function')
				throw new ReferenceError(`${method} is not defined in class`);

			return this.prototype[method].call(self, method, ...args);
		},

		/**
		 * 检查给定类值是否是本类的子类。
		 *
		 * @memberof LuCI.baseclass
		 * @param {LuCI.baseclass} classValue - 待检测的类
		 * @returns {boolean}
		 *
		 * 【使用场景：校验插件传入的 section 类是否合法】
		 *   if (!CBIAbstractSection.isSubclass(UserClass))
		 *       throw 'Not a valid section class';
		 */
		isSubclass(classValue) {
			return (typeof(classValue) == 'function' && classValue.prototype instanceof this);
		},

		prototype: {
			/**
			 * 从 args 的 offset 处提取元素，并在前面追加 extra_args。
			 * 常用于子类向父类转发剩余参数。
			 *
			 * @memberof LuCI.baseclass
			 * @instance
			 * @param {Array<*>} args    - 源参数数组
			 * @param {number}   offset  - 起始提取偏移
			 * @param {...*} [extra_args] - 前置追加的额外元素
			 * @returns {Array<*>}
			 *
			 * 【使用场景】
			 *   render(index, ...args) {
			 *       return this.super('render', this.varargs(arguments, 1, index));
			 *   }
			 */
			varargs(args, offset, ...extra_args) {
				return extra_args.concat(Array.prototype.slice.call(args, offset));
			},

			/**
			 * 调用父类链中的指定方法（或获取其值）。
			 *
			 * 两种形式（对参数数量敏感）：
			 *   super('key')          → 返回父类 key 的值
			 *   super('key', [args])  → 调用父类 key 方法并传参
			 *
			 * @memberof LuCI.baseclass
			 * @instance
			 * @param {string}   key       - 父类成员名称
			 * @param {Array<*>} [callArgs] - 调用参数（有此参数时作为函数调用）
			 * @returns {*|null} 父类成员值或方法返回值，找不到返回 null
			 * @throws {ReferenceError} 指定了 callArgs 但父类成员不是函数时
			 *
			 * 【使用场景：在覆盖的 render() 中先调用父类渲染再追加内容】
			 *
			 *   render(index, sid) {
			 *       return this.super('render', [index, sid]).then(node => {
			 *           node.appendChild(E('span', '额外内容'));
			 *           return node;
			 *       });
			 *   }
			 */
			super(key, ...callArgs) {
				if (key == null)
					return null;

				const slotIdx = `${this.__id__}.${key}`;
				const symStack = superContext[slotIdx];
				let protoCtx = null;

				// 沿原型链向上查找包含该 key 的原型
				for (protoCtx = Object.getPrototypeOf(symStack ? symStack[0] : Object.getPrototypeOf(this));
					 protoCtx != null && !protoCtx.hasOwnProperty(key);
					 protoCtx = Object.getPrototypeOf(protoCtx)) {}

				if (protoCtx == null)
					return null;

				let res = protoCtx[key];

				if (callArgs.length > 0) {
					if (typeof(res) != 'function')
						throw new ReferenceError(`${key} is not a function in base class`);

					if (Array.isArray(callArgs[0]) || LuCI.prototype.isArguments(callArgs[0]))
						callArgs = callArgs[0];

					if (symStack)
						symStack.unshift(protoCtx);
					else
						superContext[slotIdx] = [ protoCtx ];

					res = res.apply(this, callArgs);

					if (symStack && symStack.length > 1)
						symStack.shift(protoCtx);
					else
						delete superContext[slotIdx];
				}

				return res;
			},

			/**
			 * 返回类实例的调试字符串（含类名和实例属性类型列表）。
			 * @returns {string}
			 */
			toString() {
				let s = `[${this.constructor.displayName}]`, f = true;
				for (const k in this) {
					if (this.hasOwnProperty(k)) {
						s += `${f ? ' {\n' : ''}  ${k}: ${typeof(this[k])}\n`;
						f = false;
					}
				}
				return s + (f ? '' : '}');
			}
		}
	});

	// ════════════════════════════════════════════════════════
	// Headers 类（HTTP 响应头封装）
	// ════════════════════════════════════════════════════════

	/**
	 * @class headers
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * HTTP 响应头封装，通过 response.headers 访问。
	 * 所有头名称均规范化为小写，实现大小写不敏感查询。
	 */
	const Headers = Class.extend(/** @lends LuCI.headers.prototype */ {
		__name__: 'LuCI.headers',

		/** 解析 XHR 响应头字符串，规范化键名为小写存入 this.headers */
		__init__(xhr) {
			const hdrs = this.headers = {};
			xhr.getAllResponseHeaders().split(/\r\n/).forEach(line => {
				const m = /^([^:]+):(.*)$/.exec(line);
				if (m != null)
					hdrs[m[1].trim().toLowerCase()] = m[2].trim();
			});
		},

		/**
		 * 检查指定响应头是否存在（大小写不敏感）。
		 *
		 * @instance
		 * @memberof LuCI.headers
		 * @param {string} name - 头名称
		 * @returns {boolean}
		 *
		 * 【使用场景：判断是否需要重定向到登录页】
		 *   if (res.headers.has('X-LuCI-Login-Required')) redirectToLogin();
		 */
		has(name) {
			return this.headers.hasOwnProperty(String(name).toLowerCase());
		},

		/**
		 * 获取指定响应头的值（大小写不敏感）。
		 *
		 * @instance
		 * @memberof LuCI.headers
		 * @param {string} name - 头名称
		 * @returns {string|null} 值或 null
		 *
		 * 【使用场景】
		 *   var ct = res.headers.get('Content-Type');  // 'application/json'
		 */
		get(name) {
			const key = String(name).toLowerCase();
			return this.headers.hasOwnProperty(key) ? this.headers[key] : null;
		}
	});

	// ════════════════════════════════════════════════════════
	// Response 类（HTTP 响应体封装）
	// ════════════════════════════════════════════════════════

	/**
	 * @class response
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * HTTP 响应封装，由 Request.request() 的 Promise 解析后返回。
	 * 提供 ok/status/headers/json()/text()/blob() 等统一访问接口。
	 */
	const Response = Class.extend({
		__name__: 'LuCI.response',

		/**
		 * @param {XMLHttpRequest} xhr      - 底层 XHR 对象
		 * @param {string}         url      - 实际请求 URL（跟随重定向后）
		 * @param {number}         duration - 请求耗时毫秒数
		 * @param {LuCI.headers}   headers  - 响应头（null 时从 xhr 解析）
		 * @param {*}              content  - 预设内容（Blob/Object/string）
		 */
		__init__(xhr, url, duration, headers, content) {
			/** @type {boolean} 是否为 2xx 成功响应 */
			this.ok = (xhr.status >= 200 && xhr.status <= 299);
			/** @type {number} HTTP 状态码 */
			this.status = xhr.status;
			/** @type {string} HTTP 状态描述（'OK'/'Not Found' 等） */
			this.statusText = xhr.statusText;
			/** @type {LuCI.headers} 响应头对象 */
			this.headers = (headers != null) ? headers : new Headers(xhr);
			/** @type {number} 请求总耗时（毫秒） */
			this.duration = duration;
			/** @type {string} 最终响应 URL（跟随重定向后） */
			this.url = url;

			this.xhr = xhr; /* 私有：供 clone() 使用 */

			if (content instanceof Blob) {
				this.responseBlob = content;
				this.responseJSON = null;
				this.responseText = null;
			}
			else if (content != null && typeof(content) == 'object') {
				this.responseBlob = null;
				this.responseJSON = content;
				this.responseText = null;
			}
			else if (content != null) {
				this.responseBlob = null;
				this.responseJSON = null;
				this.responseText = String(content);
			}
			else {
				this.responseJSON = null;
				if (xhr.responseType == 'blob') {
					this.responseBlob = xhr.response;
					this.responseText = null;
				}
				else {
					this.responseBlob = null;
					this.responseText = xhr.responseText;
				}
			}
		},

		/**
		 * 克隆响应对象，可选地覆盖内容（用于批量 RPC 的结果分发）。
		 *
		 * @instance
		 * @memberof LuCI.response
		 * @param {*} [content] - 覆盖内容
		 * @returns {LuCI.response}
		 */
		clone(content) {
			const copy = new Response(this.xhr, this.url, this.duration, this.headers, content);
			copy.ok = this.ok;
			copy.status = this.status;
			copy.statusText = this.statusText;
			return copy;
		},

		/**
		 * 将响应内容解析为 JSON（结果缓存）。
		 *
		 * @instance
		 * @memberof LuCI.response
		 * @throws {SyntaxError} 非法 JSON 时抛出
		 * @returns {*}
		 */
		json() {
			if (this.responseJSON == null)
				this.responseJSON = JSON.parse(this.responseText);
			return this.responseJSON;
		},

		/**
		 * 以字符串形式返回响应内容。
		 *
		 * @instance
		 * @memberof LuCI.response
		 * @returns {string}
		 */
		text() {
			if (this.responseText == null && this.responseJSON != null)
				this.responseText = JSON.stringify(this.responseJSON);
			return this.responseText;
		},

		/**
		 * 以 Blob 形式返回响应内容（用于二进制下载）。
		 *
		 * @instance
		 * @memberof LuCI.response
		 * @returns {Blob}
		 */
		blob() {
			return this.responseBlob;
		}
	});

	// ════════════════════════════════════════════════════════
	// RPC 请求批处理队列
	// ════════════════════════════════════════════════════════

	/**
	 * 待批处理的 RPC 请求队列。
	 * 同一帧内对相同 ubus 端点的多个 POST 请求会被合并为一条批量请求，
	 * 从而减少网络往返，提升性能。每个元素格式：[requestOpt, rejectFn, resolveFn]
	 */
	const requestQueue = [];

	/**
	 * 判断请求是否满足批处理条件（同时满足4个条件时可批处理）：
	 * 1. rpc 模块已加载
	 * 2. 请求方法为 POST 且 content 为对象
	 * 3. 未设置 nobatch=true
	 * 4. 请求 URL 以 RPC 基础 URL 开头
	 */
	function isQueueableRequest(opt) {
		if (!classes.rpc)
			return false;
		if (opt.method != 'POST' || typeof(opt.content) != 'object')
			return false;
		if (opt.nobatch === true)
			return false;
		const rpcBaseURL = Request.expandURL(classes.rpc.getBaseURL());
		return (rpcBaseURL != null && opt.url.indexOf(rpcBaseURL) == 0);
	}

	/**
	 * 将队列中所有请求合并为一条批量请求发送，响应后按序分发结果。
	 * 在 requestAnimationFrame 回调中调用，确保同帧内所有请求都已入队。
	 */
	function flushRequestQueue() {
		if (!requestQueue.length)
			return;

		const reqopt = Object.assign({}, requestQueue[0][0], { content: [], nobatch: true }), batch = [];

		for (let i = 0; i < requestQueue.length; i++) {
			batch[i] = requestQueue[i];
			reqopt.content[i] = batch[i][0].content;
		}

		requestQueue.length = 0;

		Request.request(rpcBaseURL, reqopt).then(reply => {
			let json = null, req = null;
			try { json = reply.json() }
			catch(e) { }
			while ((req = batch.shift()) != null)
				if (Array.isArray(json) && json.length)
					req[2].call(reqopt, reply.clone(json.shift()));
				else
					req[1].call(reqopt, new Error('No related RPC reply'));
		}).catch(error => {
			let req = null;
			while ((req = batch.shift()) != null)
				req[1].call(reqopt, error);
		});
	}

	// ════════════════════════════════════════════════════════
	// Request 类（HTTP 客户端）
	// ════════════════════════════════════════════════════════

	/**
	 * @class request
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 *
	 * LuCI.request 类：封装 XMLHttpRequest，提供 Promise 风格 HTTP 接口。
	 * 核心特性：
	 *   - 支持 GET/POST 请求和完整配置（超时、凭据、进度回调等）
	 *   - 内置 RPC 请求批处理（同帧合并，减少网络往返）
	 *   - 支持响应拦截器（全局错误处理、登录超时检测）
	 *   - Request.poll 子命名空间提供轮询 HTTP 请求注册
	 */
	const Request = Class.singleton(/** @lends LuCI.request.prototype */ {
		__name__: 'LuCI.request',

		/** 已注册的 HTTP 响应拦截器函数列表 */
		interceptors: [],

		/**
		 * 将相对 URL 转换为绝对 URL（补充协议和主机名）。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {string} url - 输入 URL（相对或已是绝对）
		 * @returns {string} 绝对 URL
		 *
		 * 【使用场景】
		 *   Request.expandURL('/cgi-bin/luci/admin/ubus')
		 *   → 'http://192.168.1.1/cgi-bin/luci/admin/ubus'
		 */
		expandURL(url) {
			if (!/^(?:[^/]+:)?\/\//.test(url))
				url = `${location.protocol}//${location.host}${url}`;
			return url;
		},

		/**
		 * @typedef {Object} RequestOptions
		 * @memberof LuCI.request
		 *
		 * 请求配置选项：
		 *   method      {string}  HTTP 方法（默认 'GET'）
		 *   query       {Object}  URL 查询参数（对象值自动 JSON 序列化）
		 *   cache       {boolean} 是否允许缓存（false 时追加时间戳，默认 false）
		 *   username    {string}  Basic 认证用户名
		 *   password    {string}  Basic 认证密码
		 *   timeout     {number}  超时毫秒数
		 *   credentials {boolean} 是否携带 Cookie 等凭据（默认 false）
		 *   responseType {string} 响应类型：'text' 或 'blob'（默认 'text'）
		 *   content     {*}       请求体（Object→JSON，FormData→原样，其他→字符串）
		 *   headers     {Object}  自定义请求头 {头名: 值}
		 *   progress    {Function}上传进度回调（接收 ProgressEvent）
		 *   nobatch     {boolean} 禁止此请求加入批处理队列
		 */

		/**
		 * 发起一个 HTTP 请求。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {string} target                   - 请求 URL
		 * @param {LuCI.request.RequestOptions} [options] - 请求配置
		 * @returns {Promise<LuCI.response>}
		 *
		 * 【使用场景：获取 JSON 数据文件】
		 *   Request.request('/data.json', { cache: true }).then(res => {
		 *       console.log(res.json());
		 *   });
		 *
		 * 【批处理说明】
		 *   满足条件的 RPC 请求不立即发送，而是入队等到帧末批量发送，
		 *   可显著减少多个并发 RPC 调用的网络开销。
		 */
		request(target, options) {
			return Promise.resolve(target).then(url => {
				const state = { xhr: new XMLHttpRequest(), url: this.expandURL(url), start: Date.now() };
				const opt = Object.assign({}, options, state);
				let content = null;
				let contenttype = null;
				const callback = this.handleReadyStateChange;

				return new Promise((resolveFn, rejectFn) => {
					opt.xhr.onreadystatechange = callback.bind(opt, resolveFn, rejectFn);
					opt.method = String(opt.method ?? 'GET').toUpperCase();

					// 处理 query 参数
					if ('query' in opt) {
						const q = (opt.query != null) ? Object.keys(opt.query).map(k => {
							if (opt.query[k] != null) {
								const v = (typeof(opt.query[k]) == 'object')
									? JSON.stringify(opt.query[k])
									: String(opt.query[k]);
								return '%s=%s'.format(encodeURIComponent(k), encodeURIComponent(v));
							}
							else {
								return encodeURIComponent(k);
							}
						}).join('&') : '';

						if (q !== '') {
							switch (opt.method) {
							case 'GET':
							case 'HEAD':
							case 'OPTIONS':
								opt.url += ((/\?/).test(opt.url) ? '&' : '?') + q;
								break;
							default:
								if (content == null) {
									content = q;
									contenttype = 'application/x-www-form-urlencoded';
								}
							}
						}
					}

					// 禁用缓存：追加时间戳
					if (!opt.cache)
						opt.url += ((/\?/).test(opt.url) ? '&' : '?') + (new Date()).getTime();

					// 满足批处理条件时入队，延迟到下帧统一发送
					if (isQueueableRequest(opt)) {
						requestQueue.push([opt, rejectFn, resolveFn]);
						requestAnimationFrame(flushRequestQueue);
						return;
					}

					// 打开连接（支持 Basic 认证）
					if ('username' in opt && 'password' in opt)
						opt.xhr.open(opt.method, opt.url, true, opt.username, opt.password);
					else
						opt.xhr.open(opt.method, opt.url, true);

					opt.xhr.responseType = opt.responseType ?? 'text';

					if ('overrideMimeType' in opt.xhr)
						opt.xhr.overrideMimeType('application/octet-stream');

					if ('timeout' in opt)
						opt.xhr.timeout = +opt.timeout;

					if ('credentials' in opt)
						opt.xhr.withCredentials = !!opt.credentials;

					// 处理请求体
					if (opt.content != null) {
						switch (typeof(opt.content)) {
						case 'function':
							content = opt.content(opt.xhr);
							break;
						case 'object':
							if (!(opt.content instanceof FormData)) {
								content = JSON.stringify(opt.content);
								contenttype = 'application/json';
							}
							else {
								content = opt.content;
							}
							break;
						default:
							content = String(opt.content);
						}
					}

					// 设置自定义请求头（Content-Type 单独处理）
					if ('headers' in opt)
						for (const header in opt.headers)
							if (opt.headers.hasOwnProperty(header)) {
								if (header.toLowerCase() != 'content-type')
									opt.xhr.setRequestHeader(header, opt.headers[header]);
								else
									contenttype = opt.headers[header];
							}

					if ('progress' in opt && 'upload' in opt.xhr)
						opt.xhr.upload.addEventListener('progress', opt.progress);

					if (contenttype != null)
						opt.xhr.setRequestHeader('Content-Type', contenttype);

					try {
						opt.xhr.send(content);
					}
					catch (e) {
						rejectFn.call(opt, e);
					}
				});
			});
		},

		/**
		 * XHR readystatechange 内部回调：请求完成时解析响应，执行拦截器，resolve/reject Promise。
		 * 状态码为 0 时区分超时和浏览器中止两种情况。
		 * @private
		 */
		handleReadyStateChange(resolveFn, rejectFn, ev) {
			const xhr = this.xhr, duration = Date.now() - this.start;

			if (xhr.readyState !== 4)
				return;

			if (xhr.status === 0 && xhr.statusText === '') {
				if (duration >= this.timeout)
					rejectFn.call(this, new Error('XHR request timed out'));
				else
					rejectFn.call(this, new Error('XHR request aborted by browser'));
			}
			else {
				const response = new Response(xhr, xhr.responseURL ?? this.url, duration);

				Promise.all(Request.interceptors.map(fn => fn(response)))
					.then(resolveFn.bind(this, response))
					.catch(rejectFn.bind(this));
			}
		},

		/**
		 * 发起 HTTP GET 请求。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {string} url
		 * @param {LuCI.request.RequestOptions} [options]
		 * @returns {Promise<LuCI.response>}
		 *
		 * 【使用场景】
		 *   Request.get(L.url('admin/status/overview')).then(res => {
		 *       document.body.innerHTML = res.text();
		 *   });
		 */
		get(url, options) {
			return this.request(url, Object.assign({ method: 'GET' }, options));
		},

		/**
		 * 发起 HTTP POST 请求。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {string} url
		 * @param {*}      [data]    - 请求体（Object → JSON）
		 * @param {LuCI.request.RequestOptions} [options]
		 * @returns {Promise<LuCI.response>}
		 *
		 * 【使用场景：提交 JSON 数据到后端】
		 *   Request.post('/api/save', { key: 'value' });
		 */
		post(url, data, options) {
			return this.request(url, Object.assign({ method: 'POST', content: data }, options));
		},

		/**
		 * 注册一个 HTTP 响应拦截器（对所有请求生效）。
		 * 可用于全局错误处理、登录超时检测、请求日志等。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {LuCI.request.interceptorFn} interceptorFn
		 * @returns {LuCI.request.interceptorFn} 注册的函数（供 remove 使用）
		 *
		 * 【使用场景：检测 HTTP 403 + 登录要求头，跳转登录页】
		 *
		 *   Request.addInterceptor(function(res) {
		 *       if (res.status == 403 &&
		 *           res.headers.get('X-LuCI-Login-Required') == 'yes')
		 *           window.location.href = L.url('admin/login');
		 *   });
		 */
		addInterceptor(interceptorFn) {
			if (typeof(interceptorFn) == 'function')
				this.interceptors.push(interceptorFn);
			return interceptorFn;
		},

		/**
		 * 移除一个已注册的 HTTP 响应拦截器。
		 *
		 * @instance
		 * @memberof LuCI.request
		 * @param {LuCI.request.interceptorFn} interceptorFn
		 * @returns {boolean} 成功移除返回 true
		 */
		removeInterceptor(interceptorFn) {
			const oldlen = this.interceptors.length;
			let i = oldlen;
			while (i--)
				if (this.interceptors[i] === interceptorFn)
					this.interceptors.splice(i, 1);
			return (this.interceptors.length < oldlen);
		},

		/**
		 * @class
		 * @memberof LuCI.request
		 * @hideconstructor
		 * @classdesc
		 *
		 * Request.poll：将 HTTP 请求封装为周期性轮询任务。
		 * 主要用于页面数据的自动定期刷新。
		 */
		poll: {
			/**
			 * 注册一个周期性 HTTP 轮询请求。
			 *
			 * @instance
			 * @memberof LuCI.request.poll
			 * @param {number}   interval - 轮询间隔秒数（必须 > 0）
			 * @param {string}   url      - 每次轮询请求的 URL
			 * @param {LuCI.request.RequestOptions} [options] - 请求配置
			 * @param {Function} [callback] - 每次收到响应时调用：cb(res, json, duration)
			 * @throws {TypeError} interval 无效时抛出
			 * @returns {function|null} 内部轮询函数（可传给 remove() 取消）
			 *
			 * 【使用场景：每5秒轮询网络接口状态并更新表格】
			 *
			 *   var pollFn = Request.poll.add(5,
			 *       L.url('admin/status/interfaces'), {},
			 *       function(res, data, duration) {
			 *           if (data) updateIfaceTable(data.interfaces);
			 *       }
			 *   );
			 *   // 离开页面时：Request.poll.remove(pollFn);
			 */
			add(interval, url, options, callback) {
				if (isNaN(interval) || interval <= 0)
					throw new TypeError('Invalid poll interval');

				const ival = interval >>> 0, opts = Object.assign({}, options, { timeout: ival * 1000 - 5 });

				const fn = () => Request.request(url, opts).then(res => {
					if (!Poll.active())
						return;

					let res_json = null;
					try { res_json = res.json(); }
					catch (err) {}

					callback(res, res_json, res.duration);
				});

				return (Poll.add(fn, ival) ? fn : null);
			},

			/** 移除一个轮询任务（Poll.remove 的别名）
			 * @instance @memberof LuCI.request.poll */
			remove(entry) { return Poll.remove(entry) },

			/** 启动轮询循环（Poll.start 的别名）
			 * @instance @memberof LuCI.request.poll */
			start() { return Poll.start() },

			/** 停止轮询循环（Poll.stop 的别名）
			 * @instance @memberof LuCI.request.poll */
			stop() { return Poll.stop() },

			/** 检查轮询是否在运行（Poll.active 的别名）
			 * @instance @memberof LuCI.request.poll */
			active() { return Poll.active() }
		}
	});

	// ════════════════════════════════════════════════════════
	// Poll 类（定时轮询调度器）
	// ════════════════════════════════════════════════════════

	/**
	 * @class poll
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 *
	 * LuCI.poll 类：以1秒为粒度驱动的定时任务调度器。
	 *
	 * 【工作原理】
	 *   启动后每秒触发一次 step()，step() 遍历队列中的所有任务，
	 *   当 tick 数是任务间隔的整数倍时调用该任务。
	 *   任务执行期间标记 r=false（防止并发），完成（finally）后恢复 r=true。
	 */
	const Poll = Class.singleton(/** @lends LuCI.poll.prototype */ {
		__name__: 'LuCI.poll',

		/** 已注册的轮询任务：[{ r:就绪标志, i:间隔秒数, fn:函数 }, ...] */
		queue: [],

		/**
		 * 添加一个轮询任务，若循环未启动则自动启动。
		 *
		 * @instance
		 * @memberof LuCI.poll
		 * @param {function} fn       - 要周期调用的函数（可返回 Promise）
		 * @param {number}   interval - 调用间隔秒数（≤0 时用全局 pollinterval）
		 * @throws {TypeError} 参数无效时抛出
		 * @returns {boolean} 成功添加返回 true，已存在返回 false
		 *
		 * 【使用场景：每30秒检查一次系统负载】
		 *   Poll.add(() => callSysInfo().then(info => updateLoadDisplay(info)), 30);
		 */
		add(fn, interval) {
			if (interval == null || interval <= 0)
				interval = env.pollinterval || null;

			if (isNaN(interval) || typeof(fn) != 'function')
				throw new TypeError('Invalid argument to LuCI.poll.add()');

			for (let i = 0; i < this.queue.length; i++)
				if (this.queue[i].fn === fn)
					return false;

			const e = {
				r: true,        // 就绪标志（false 时表示正在执行，跳过调度）
				i: interval >>> 0,  // 间隔秒数（整数）
				fn              // 被调度的函数
			};

			this.queue.push(e);

			if (this.tick != null && !this.active())
				this.start();

			return true;
		},

		/**
		 * 移除一个轮询任务，队列清空时自动停止轮询。
		 *
		 * @instance
		 * @memberof LuCI.poll
		 * @param {function} fn - 要移除的函数引用（必须与 add 时完全相同）
		 * @throws {TypeError} 参数不是函数时抛出
		 * @returns {boolean}
		 */
		remove(fn) {
			if (typeof(fn) != 'function')
				throw new TypeError('Invalid argument to LuCI.poll.remove()');

			const len = this.queue.length;

			for (let i = len; i > 0; i--)
				if (this.queue[i-1].fn === fn)
					this.queue.splice(i-1, 1);

			if (!this.queue.length && this.stop())
				this.tick = 0;

			return (this.queue.length != len);
		},

		/**
		 * （重新）启动轮询循环，触发 document 的 'poll-start' 事件。
		 *
		 * @instance
		 * @memberof LuCI.poll
		 * @returns {boolean} 成功启动返回 true，已在运行返回 false
		 */
		start() {
			if (this.active())
				return false;

			this.tick = 0;

			if (this.queue.length) {
				this.timer = window.setInterval(this.step, 1000);
				this.step();
				document.dispatchEvent(new CustomEvent('poll-start'));
			}

			return true;
		},

		/**
		 * 停止轮询循环，触发 document 的 'poll-stop' 事件。
		 *
		 * @instance
		 * @memberof LuCI.poll
		 * @returns {boolean} 成功停止返回 true，未在运行返回 false
		 */
		stop() {
			if (!this.active())
				return false;

			document.dispatchEvent(new CustomEvent('poll-stop'));
			window.clearInterval(this.timer);
			delete this.timer;
			delete this.tick;
			return true;
		},

		/**
		 * 每秒执行一次的步进函数：遍历队列，调度到期且就绪的任务。
		 * @private
		 */
		step() {
			for (let i = 0, e = null; (e = Poll.queue[i]) != null; i++) {
				if ((Poll.tick % e.i) != 0) continue;  // 未到调度时刻
				if (!e.r) continue;                     // 上次还未完成，跳过

				e.r = false; // 标记为执行中

				// 调用任务，无论成功失败均恢复就绪标志
				Promise.resolve(e.fn()).finally((function() { this.r = true }).bind(e));
			}

			// tick 自增（防止溢出：到 2^32 时回绕到 0）
			Poll.tick = (Poll.tick + 1) % Math.pow(2, 32);
		},

		/**
		 * 检查轮询循环是否正在运行。
		 *
		 * @instance
		 * @memberof LuCI.poll
		 * @returns {boolean}
		 */
		active() {
			return (this.timer != null);
		}
	});

	// ════════════════════════════════════════════════════════
	// DOM 类（DOM 操作工具集）
	// ════════════════════════════════════════════════════════

	/**
	 * @class dom
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 *
	 * LuCI.dom 类：提供 DOM 元素的创建、属性设置、内容操作和类实例绑定工具。
	 *
	 * 引入方式：
	 *   'require dom';              // 视图文件中
	 *   L.require("dom").then(...)  // 外部 JS 中
	 *
	 * 全局别名 E() 等同于 dom.create()，是 LuCI 插件中最常用的 DOM 函数。
	 */
	const DOM = Class.singleton(/** @lends LuCI.dom.prototype */ {
		__name__: 'LuCI.dom',

		/**
		 * 检查给定值是否是有效的 DOM Node。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*} e - 待测试值
		 * @returns {boolean}
		 */
		elem(e) {
			return (e != null && typeof(e) == 'object' && 'nodeType' in e);
		},

		/**
		 * 将 HTML 字符串解析为 DOM 节点（返回第一个子节点）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {string} s - HTML 字符串
		 * @returns {Node|null}
		 *
		 * 【使用场景】
		 *   var el = dom.parse('<span class="badge">3</span>');
		 */
		parse(s) {
			try {
				return domParser.parseFromString(s, 'text/html').body.firstChild;
			}
			catch(e) {
				return null;
			}
		},

		/**
		 * 测试 DOM Node 是否匹配 CSS 选择器（对非 Node 值安全返回 false）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*}      node     - 待测节点
		 * @param {string} selector - CSS 选择器
		 * @returns {boolean}
		 */
		matches(node, selector) {
			const m = this.elem(node) ? (node.matches ?? node.msMatchesSelector) : null;
			return m ? m.call(node, selector) : false;
		},

		/**
		 * 返回最近匹配 CSS 选择器的父节点（closest 的安全封装）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*}      node     - 起始节点
		 * @param {string} selector - CSS 选择器
		 * @returns {Node|null}
		 *
		 * 【使用场景：从按钮向上找到所属的 .cbi-section 容器】
		 *   var section = dom.parent(buttonEl, '.cbi-section');
		 */
		parent(node, selector) {
			if (this.elem(node) && node.closest)
				return node.closest(selector);

			while (this.elem(node))
				if (this.matches(node, selector))
					return node;
				else
					node = node.parentNode;

			return null;
		},

		/**
		 * 向节点追加子内容（支持多种 children 类型）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*} node      - 目标节点
		 * @param {*} [children] - 要追加的内容：
		 *   Array   → 逐项追加（DOM Node 直接 appendChild，其他转文本节点）
		 *   Function→ 调用，以返回值递归追加
		 *   DOM Node→ 直接 appendChild
		 *   其他非null→ 设置 innerHTML
		 * @returns {Node|null} 最后追加的节点
		 */
		append(node, children) {
			if (!this.elem(node))
				return null;

			if (Array.isArray(children)) {
				for (let i = 0; i < children.length; i++)
					if (this.elem(children[i]))
						node.appendChild(children[i]);
					else if (children !== null && children !== undefined)
						node.appendChild(document.createTextNode(`${children[i]}`));
				return node.lastChild;
			}
			else if (typeof(children) === 'function') {
				return this.append(node, children(node));
			}
			else if (this.elem(children)) {
				return node.appendChild(children);
			}
			else if (children !== null && children !== undefined) {
				node.innerHTML = `${children}`;
				return node.lastChild;
			}

			return null;
		},

		/**
		 * 清空节点所有子内容，再追加新内容（content = clear + append）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*} node      - 目标节点
		 * @param {*} [children] - 新内容（同 append 的 children 参数）
		 * @returns {Node|null}
		 *
		 * 【使用场景：更新视图区域的内容（不保留旧内容）】
		 *   DOM.content(document.getElementById('view'), E('div', 'Loading...'));
		 */
		content(node, children) {
			if (!this.elem(node))
				return null;

			const dataNodes = node.querySelectorAll('[data-idref]');
			for (let i = 0; i < dataNodes.length; i++)
				delete this.registry[dataNodes[i].getAttribute('data-idref')];

			while (node.firstChild)
				node.removeChild(node.firstChild);

			return this.append(node, children);
		},

		/**
		 * 设置节点的属性或注册事件监听器。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*}           node - 目标节点
		 * @param {string|Object} key - 属性名，或 {属性名: 值} 批量对象
		 * @param {*}           [val]- 属性值（key 为字符串时使用）
		 *
		 * 值类型处理规则：
		 *   Function → addEventListener(key, val)（注册事件处理器）
		 *   Object   → setAttribute(key, JSON.stringify(val))
		 *   其他     → setAttribute(key, val)
		 *
		 * 【使用场景】
		 *   dom.attr(el, 'class', 'cbi-button primary');
		 *   dom.attr(el, { class: 'x', click: myHandler });
		 */
		attr(node, key, val) {
			if (!this.elem(node))
				return null;

			let attr = null;

			if (typeof(key) === 'object' && key !== null)
				attr = key;
			else if (typeof(key) === 'string')
				attr = {}, attr[key] = val;

			for (key in attr) {
				if (!attr.hasOwnProperty(key) || attr[key] == null)
					continue;

				switch (typeof(attr[key])) {
				case 'function':
					node.addEventListener(key, attr[key]);
					break;
				case 'object':
					node.setAttribute(key, JSON.stringify(attr[key]));
					break;
				default:
					node.setAttribute(key, attr[key]);
				}
			}
		},

		/**
		 * 创建 DOM 节点（LuCI 最常用的工具函数，全局别名 E()）。
		 *
		 * 调用形式：
		 *   create(html[, attr[, data]])
		 *   create(html[, data])
		 *
		 * @instance @memberof LuCI.dom
		 * @param {*}      html - 节点描述：
		 *   Array     → 创建 DocumentFragment，成员递归转为节点
		 *   DOM Node  → 直接使用
		 *   '<...'    → 解析 HTML（以 '<' 开头）
		 *   其他字符串  → document.createElement(html)
		 * @param {Object} [attr] - 属性/事件对象（参见 dom.attr()）
		 * @param {*}      [data] - 子内容（参见 dom.append()）
		 * @returns {Node}
		 *
		 * 【使用场景1：创建带属性的按钮】
		 *   E('button', { class: 'btn cbi-button-save', click: myFn }, '保存')
		 *
		 * 【使用场景2：创建嵌套结构】
		 *   E('div', { class: 'cbi-section' }, [
		 *       E('h3', '标题'),
		 *       E('p', { class: 'description' }, '说明文字')
		 *   ])
		 *
		 * 【使用场景3：DocumentFragment（用于批量追加）】
		 *   E([ E('li', 'item1'), E('li', 'item2') ])
		 */
		create() {
			const html = arguments[0];
			let attr = arguments[1];
			let data = arguments[2];
			let elem;

			if (!(attr instanceof Object) || Array.isArray(attr))
				data = attr, attr = null;

			if (Array.isArray(html)) {
				elem = document.createDocumentFragment();
				for (let i = 0; i < html.length; i++)
					elem.appendChild(this.create(html[i]));
			}
			else if (this.elem(html)) {
				elem = html;
			}
			else if (html.charCodeAt(0) === 60) { // '<' 字符
				elem = this.parse(html);
			}
			else {
				elem = document.createElement(html);
			}

			if (!elem)
				return null;

			this.attr(elem, attr);
			this.append(elem, data);

			return elem;
		},

		/** 节点数据注册表（存储通过 data() 绑定到节点的非字符串数据） */
		registry: {},

		/**
		 * 读取/写入/删除节点关联的任意数据（避免污染 DOM 属性）。
		 * 数据存储在 registry 中，节点持有 data-idref 属性作为索引键。
		 *
		 * 调用形式：
		 *   dom.data(node)               → 获取全部数据
		 *   dom.data(node, key)          → 获取指定 key
		 *   dom.data(node, key, val)     → 设置 key = val
		 *   dom.data(node, null)         → 清除所有数据
		 *   dom.data(node, key, null)    → 删除指定 key
		 *
		 * @instance @memberof LuCI.dom
		 */
		data(node, key, val) {
			if (!node?.getAttribute)
				return null;

			let id = node.getAttribute('data-idref');

			if (arguments.length > 1 && key == null) {
				if (id != null) {
					node.removeAttribute('data-idref');
					val = this.registry[id];
					delete this.registry[id];
					return val;
				}
				return null;
			}
			else if (arguments.length > 2 && key != null && val == null) {
				if (id != null) {
					val = this.registry[id][key];
					delete this.registry[id][key];
					return val;
				}
				return null;
			}
			else if (arguments.length > 2 && key != null && val != null) {
				if (id == null) {
					do { id = Math.floor(Math.random() * 0xffffffff).toString(16) }
					while (this.registry.hasOwnProperty(id));
					node.setAttribute('data-idref', id);
					this.registry[id] = {};
				}
				return (this.registry[id][key] = val);
			}
			else if (arguments.length == 1) {
				if (id != null) return this.registry[id];
				return null;
			}
			else if (arguments.length == 2) {
				if (id != null) return this.registry[id][key];
			}

			return null;
		},

		/**
		 * 将类实例绑定到 DOM 节点（方便后续通过节点反向查找控件实例）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {Node}  node - DOM 节点
		 * @param {Class} inst - 类实例
		 * @returns {Class}
		 * @throws {TypeError} inst 不是类实例时抛出
		 *
		 * 【使用场景：绑定 Table 实例到节点后，可用 findClassInstance 反向恢复】
		 *   dom.bindClassInstance(tableEl, new L.ui.Table(tableEl));
		 */
		bindClassInstance(node, inst) {
			if (!(inst instanceof Class))
				LuCI.prototype.error('TypeError', 'Argument must be a class instance');
			return this.data(node, '_class', inst);
		},

		/**
		 * 从节点或其最近父节点上查找绑定的类实例。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {Node} node - 起始节点
		 * @returns {Class|null}
		 */
		findClassInstance(node) {
			let inst = null;
			do {
				inst = this.data(node, '_class');
				node = node.parentNode;
			}
			while (!(inst instanceof Class) && node != null);
			return inst;
		},

		/**
		 * 查找节点或父节点上绑定的类实例，并调用其指定方法。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {Node}   node   - 起始节点
		 * @param {string} method - 方法名
		 * @param {...*}   params - 传给方法的参数
		 * @returns {*|null}
		 *
		 * 【使用场景：对所有 .cbi-map 表单调用 save()】
		 *   document.querySelectorAll('.cbi-map').forEach(map =>
		 *       DOM.callClassMethod(map, 'save'));
		 */
		callClassMethod(node, method, ...args) {
			const inst = this.findClassInstance(node);
			if (typeof(inst?.[method]) != 'function')
				return null;
			return inst[method].call(inst, ...args);
		},

		/**
		 * 检查节点是否无可见子节点（hidden 类的子节点及 ignoreFn 返回 true 的节点会被忽略）。
		 *
		 * @instance @memberof LuCI.dom
		 * @param {Node}     node      - 待检测节点
		 * @param {Function} [ignoreFn]- 可选忽略回调（返回 true 则忽略该子节点）
		 * @returns {boolean}
		 */
		isEmpty(node, ignoreFn) {
			for (let child = node?.firstElementChild; child != null; child = child.nextElementSibling)
				if (!child.classList.contains('hidden') && !ignoreFn?.(child))
					return false;
			return true;
		}
	});

	// ════════════════════════════════════════════════════════
	// Session 类（会话和本地存储管理）
	// ════════════════════════════════════════════════════════

	/**
	 * @class session
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 *
	 * LuCI.session 类：提供会话 ID/Token 访问，以及与 session 绑定的
	 * 浏览器 sessionStorage 读写（用于跨页面缓存少量数据）。
	 *
	 * 常见缓存用途：
	 *   rpcBaseURL  —— 避免每次页面加载都重新探测 RPC 端点
	 *   features    —— 系统特性标志（避免重复 RPC 查询）
	 *   preload     —— 预加载类列表
	 */
	const Session = Class.singleton(/** @lends LuCI.session.prototype */ {
		__name__: 'LuCI.session',

		/**
		 * 获取当前登录会话 ID（32位十六进制字符串）。
		 * @returns {string}
		 */
		getID() {
			return env.sessionid ?? '00000000000000000000000000000000';
		},

		/**
		 * 获取当前 CSRF 令牌（用于防止跨站请求伪造）。
		 * @returns {string|null}
		 */
		getToken() {
			return env.token ?? null;
		},

		/**
		 * 从 sessionStorage 读取与当前 session 绑定的本地数据。
		 *
		 * @param {string} [key] - 键名，省略时返回全部数据对象
		 * @returns {*} 值或 null
		 *
		 * 【使用场景】
		 *   var url = L.session.getLocalData('rpcBaseURL');
		 */
		getLocalData(key) {
			try {
				const sid = this.getID();
				const item = 'luci-session-store';
				let data = JSON.parse(window.sessionStorage.getItem(item));

				if (!LuCI.prototype.isObject(data) || !data.hasOwnProperty(sid)) {
					data = {};
					data[sid] = {};
				}

				if (key != null)
					return data[sid].hasOwnProperty(key) ? data[sid][key] : null;

				return data[sid];
			}
			catch (e) {
				return (key != null) ? null : {};
			}
		},

		/**
		 * 向 sessionStorage 写入与当前 session 绑定的本地数据。
		 *
		 * @param {string} key   - 键名
		 * @param {*}      value - 值（自动 JSON 序列化）。null 表示删除该键
		 * @returns {boolean} 成功返回 true
		 *
		 * 【使用场景】
		 *   L.session.setLocalData('features', { fwl3: true });
		 */
		setLocalData(key, value) {
			if (key == null)
				return false;

			try {
				const sid = this.getID();
				const item = 'luci-session-store';
				let data = JSON.parse(window.sessionStorage.getItem(item));

				if (!LuCI.prototype.isObject(data) || !data.hasOwnProperty(sid)) {
					data = {};
					data[sid] = {};
				}

				if (value != null)
					data[sid][key] = value;
				else
					delete data[sid][key];

				window.sessionStorage.setItem(item, JSON.stringify(data));
				return true;
			}
			catch (e) {
				return false;
			}
		}
	});

	// ════════════════════════════════════════════════════════
	// View 类（视图基类）
	// ════════════════════════════════════════════════════════

	/**
	 * @class view
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 *
	 * LuCI.view 类：所有 LuCI 插件视图的基类，定义了标准的视图生命周期：
	 *   load() → render() → addFooter()
	 *
	 * 【典型插件视图结构】
	 *
	 *   'use strict';
	 *   'require form';
	 *   'require uci';
	 *
	 *   return view.extend({
	 *       // 阶段1：加载数据
	 *       load() {
	 *           return uci.load('mypackage');
	 *       },
	 *
	 *       // 阶段2：构建 UI（接收 load 返回值）
	 *       render(data) {
	 *           var m = new form.Map('mypackage', '我的配置');
	 *           var s = m.section(form.TypedSection, 'main');
	 *           s.option(form.Value, 'host', '主机地址');
	 *           return m.render();
	 *       },
	 *
	 *       // 可选：禁用"保存并应用"按钮
	 *       handleSaveApply: null,
	 *   });
	 */
	const View = Class.extend(/** @lends LuCI.view.prototype */ {
		__name__: 'LuCI.view',

		/**
		 * 视图构造：显示加载状态，依次调用 load → render → addFooter。
		 * @private
		 */
		__init__() {
			const vp = document.getElementById('view');
			DOM.content(vp, E('div', { 'class': 'spinning' }, _('Loading view…')));

			const ready = L.loaded
				? Promise.resolve()
				: new Promise((resolve) => {
					document.addEventListener('luci-loaded', resolve, { once: true });
				});

			return ready
				.then(LuCI.prototype.bind(this.load, this))
				.then(LuCI.prototype.bind(this.render, this))
				.then(LuCI.prototype.bind(function(nodes) {
					const vp = document.getElementById('view');
					DOM.content(vp, nodes);
					DOM.append(vp, this.addFooter());
				}, this)).catch(LuCI.prototype.error);
		},

		/**
		 * 视图加载阶段（生命周期第1阶段）：在渲染前执行的数据获取。
		 *
		 * 子类覆盖此方法以加载所需数据（如 uci.load/RPC 调用）。
		 * 返回值将作为 render() 的第一个参数传入，可返回 Promise。
		 *
		 * @instance @abstract @memberof LuCI.view
		 * @returns {*|Promise<*>}
		 *
		 * 【覆盖示例】
		 *   load() {
		 *       return Promise.all([
		 *           uci.load('network'),
		 *           callNetworkDevices()
		 *       ]);
		 *   }
		 */
		load() {},

		/**
		 * 视图渲染阶段（生命周期第2阶段）：构建并返回视图 DOM。
		 *
		 * 子类必须覆盖此方法并返回 DOM 节点（或 Promise<Node>）。
		 * 渲染结果插入页面主内容区域 #view。
		 *
		 * @instance @abstract @memberof LuCI.view
		 * @param {*|null} load_results - load() 的返回值
		 * @returns {Node|Promise<Node>}
		 *
		 * 【覆盖示例】
		 *   render(data) {
		 *       var m = new form.Map('network', '网络配置');
		 *       // ... 配置 section/option
		 *       return m.render();
		 *   }
		 */
		render() {},

		/**
		 * 处理"保存"按钮点击事件。
		 * 默认实现：对页面所有 .cbi-map 表单调用 save()。
		 * 要禁用此按钮：子类中设 handleSave: null。
		 *
		 * @instance @memberof LuCI.view
		 * @param {Event} ev
		 * @returns {Promise}
		 */
		handleSave(ev) {
			const tasks = [];
			document.getElementById('maincontent')
				.querySelectorAll('.cbi-map').forEach(map => {
					tasks.push(DOM.callClassMethod(map, 'save'));
				});
			return Promise.all(tasks);
		},

		/**
		 * 处理"保存并应用"按钮点击事件。
		 * 默认实现：先 handleSave()，再调用 ui.changes.apply() 触发应用流程。
		 * 要禁用此按钮：子类中设 handleSaveApply: null。
		 *
		 * @instance @memberof LuCI.view
		 * @param {Event}  ev
		 * @param {string} mode - '0'=带确认应用，其他=直接应用
		 * @returns {Promise}
		 */
		handleSaveApply(ev, mode) {
			return this.handleSave(ev).then(() => {
				classes.ui.changes.apply(mode == '0');
			});
		},

		/**
		 * 处理"重置"按钮点击事件。
		 * 默认实现：对页面所有 .cbi-map 表单调用 reset()。
		 * 要禁用此按钮：子类中设 handleReset: null。
		 *
		 * @instance @memberof LuCI.view
		 * @param {Event} ev
		 * @returns {Promise}
		 */
		handleReset(ev) {
			const tasks = [];
			document.getElementById('maincontent')
				.querySelectorAll('.cbi-map').forEach(map => {
					tasks.push(DOM.callClassMethod(map, 'reset'));
				});
			return Promise.all(tasks);
		},

		/**
		 * 渲染页面底部操作栏（保存/保存并应用/重置按钮）。
		 * 对应 handle*() 为 null 的按钮不渲染。只读视图自动禁用所有按钮。
		 *
		 * @instance @memberof LuCI.view
		 * @returns {DocumentFragment}
		 */
		addFooter() {
			const footer = E([]);
			const vp = document.getElementById('view');
			let hasmap = false;
			let readonly = true;

			vp.querySelectorAll('.cbi-map').forEach(map => {
				const m = DOM.findClassInstance(map);
				if (m) {
					hasmap = true;
					if (!m.readonly) readonly = false;
				}
			});

			if (!hasmap)
				readonly = !LuCI.prototype.hasViewPermission();

			const saveApplyBtn = this.handleSaveApply ? new classes.ui.ComboButton('0', {
				0: [ _('Save & Apply') ],
				1: [ _('Apply unchecked') ]
			}, {
				classes: {
					0: 'btn cbi-button cbi-button-apply important',
					1: 'btn cbi-button cbi-button-negative important'
				},
				click: classes.ui.createHandlerFn(this, 'handleSaveApply'),
				disabled: readonly || null
			}).render() : E([]);

			if (this.handleSaveApply || this.handleSave || this.handleReset) {
				footer.appendChild(E('div', { 'class': 'cbi-page-actions' }, [
					saveApplyBtn, ' ',
					this.handleSave ? E('button', {
						'class': 'cbi-button cbi-button-save',
						'click': classes.ui.createHandlerFn(this, 'handleSave'),
						'disabled': readonly || null
					}, [ _('Save') ]) : '', ' ',
					this.handleReset ? E('button', {
						'class': 'cbi-button cbi-button-reset',
						'click': classes.ui.createHandlerFn(this, 'handleReset'),
						'disabled': readonly || null
					}, [ _('Reset') ]) : ''
				]));
			}

			return footer;
		}
	});

	// ════════════════════════════════════════════════════════
	// 框架内部变量
	// ════════════════════════════════════════════════════════

	const domParser = new DOMParser();
	let originalCBIInit = null;  // 保存原始 cbi_init（框架就绪前替换为空操作）
	let rpcBaseURL = null;       // 探测到的 RPC 基础 URL 缓存
	let sysFeatures = null;      // 系统特性标志缓存
	let preloadClasses = null;   // 预加载类列表缓存

	/**
	 * 内置模块注册表（框架启动时直接注册，无需 HTTP 加载）。
	 * 通过 require() 加载的外部模块也会存入此表（如 ui、rpc、form 等）。
	 */
	const classes = {
		baseclass: Class,
		dom: DOM,
		poll: Poll,
		request: Request,
		session: Session,
		view: View
	};

	/** 自然排序比较器（数字字符串按数值大小排序，如 eth10 排在 eth9 之后）*/
	const naturalCompare = new Intl.Collator(undefined, { numeric: true }).compare;


	// ════════════════════════════════════════════════════════
	// LuCI 主类（全局 L 对象）
	// ════════════════════════════════════════════════════════

	const LuCI = Class.extend(/** @lends LuCI.prototype */ {
		__name__: 'LuCI',

		/**
		 * 框架初始化入口（由页面底部内联脚本调用，传入后端注入的环境配置）。
		 *
		 * 初始化流程：
		 *   1. 从 luci.js script src 解析 base_url 和 resource_version
		 *   2. 等待 DOMContentLoaded + 核心模块加载（ui/rpc/form）+ RPC URL 探测
		 *   3. 调用 setupDOM() 完成拦截器注册、系统特性探测、预加载类加载
		 *   4. 调用 initDOM() 启动轮询并触发 luci-loaded 事件
		 * @private
		 */
		__init__(setenv) {
			document.querySelectorAll('script[src*="/luci.js"]').forEach(s => {
				if (setenv.base_url == null || setenv.base_url == '') {
					const m = (s.getAttribute('src') ?? '').match(/^(.*)\/luci\.js(?:\?v=([^?]+))?$/);
					if (m) {
						setenv.base_url = m[1];
						setenv.resource_version = m[2];
					}
				}
			});

			if (setenv.base_url == null)
				this.error('InternalError', 'Cannot find url of luci.js');

			setenv.cgi_base = setenv.scriptname.replace(/\/[^\/]+$/, '');
			Object.assign(env, setenv);

			const domReady = new Promise((resolveFn, rejectFn) => {
				document.addEventListener('DOMContentLoaded', resolveFn);
			});

			Promise.all([
				domReady,
				this.require('ui'),
				this.require('rpc'),
				this.require('form'),
				this.probeRPCBaseURL()
			]).then(this.setupDOM.bind(this)).catch(this.error);

			originalCBIInit = window.cbi_init;
			window.cbi_init = () => {};
		},

		/**
		 * 抛出指定类型的错误（附带调用栈），并记录到控制台。
		 *
		 * @instance @memberof LuCI
		 * @param {Error|string} [type=Error] - 错误类型字符串或已有 Error 实例
		 * @param {string}       [fmt]        - 格式化字符串（支持 %s %d 等占位符）
		 * @param {...*}         [args]        - 格式化参数
		 * @throws {Error}
		 *
		 * 【使用场景：在 RPC 出错时抛出自定义错误】
		 *   L.raise('RPCError', 'Call to %s/%s failed with code %d',
		 *       object, method, code);
		 */
		raise(type, fmt, ...args) {
			let e = null;
			const msg = fmt ? String.prototype.format.call(fmt, ...args) : null;
			const stack = [];

			if (type instanceof Error) {
				e = type;
				if (msg) e.message = `${msg}: ${e.message}`;
			}
			else {
				try { throw new Error('stacktrace') }
				catch (e2) { stack.push(...(e2.stack ?? '').split(/\n/)) }

				e = new (window[type ?? 'Error'] ?? Error)(msg ?? 'Unspecified error');
				e.name = type ?? 'Error';
			}

			for (let i = 0; i < stack.length; i++) {
				const frame = stack[i].replace(/(.*?)@(.+):(\d+):(\d+)/g, 'at $1 ($2:$3:$4)').trim();
				stack[i] = frame ? `  ${frame}` : '';
			}

			if (!/^  at /.test(stack[0])) stack.shift();
			if (/\braise /.test(stack[0])) stack.shift();
			if (/\berror /.test(stack[0])) stack.shift();

			if (stack.length)
				e.message += `\n${stack.join('\n')}`;

			if (window.console && console.debug)
				console.debug(e);

			throw e;
		},

		/**
		 * raise() 的包装：除抛出错误外，还将错误渲染到页面。
		 * UI 已加载时显示模态通知，否则直接替换 #maincontent 内容。
		 *
		 * @instance @memberof LuCI
		 * @param {Error|string} [type=Error]
		 * @param {string}       [fmt]
		 * @param {...*}         [args]
		 * @throws {Error}
		 */
		error(type, fmt /*, ...*/) {
			try {
				LuCI.prototype.raise.apply(LuCI.prototype, Array.prototype.slice.call(arguments));
			}
			catch (e) {
				if (!e.reported) {
					if (classes.ui)
						classes.ui.addNotification(e.name || _('Runtime error'),
							E('pre', {}, e.message), 'danger');
					else
						DOM.content(document.querySelector('#maincontent'),
							E('pre', { 'class': 'alert-message error' }, e.message));

					e.reported = true;
				}

				throw e;
			}
		},

		/**
		 * 创建绑定指定 this 和前置参数的函数（Function.bind 的简便封装）。
		 *
		 * @instance @memberof LuCI
		 * @param {function} fn   - 要绑定的函数
		 * @param {*}        self - 绑定的 this 值
		 * @param {...*}     args - 前置绑定参数
		 * @returns {function}
		 *
		 * 【使用场景：确保回调中 this 指向视图实例】
		 *   Poll.add(L.bind(this.update, this), 5);
		 */
		bind(fn, self, ...args) {
			return Function.prototype.bind.call(fn, self, ...args);
		},

		/**
		 * 按需加载指定的 LuCI JavaScript 模块（每个模块只加载一次，结果缓存）。
		 *
		 * @instance @memberof LuCI
		 * @param {string} name - 模块名（点分格式，'form'、'ui'、'luci.tools' 等）
		 * @throws {DependencyError} 循环依赖时
		 * @throws {NetworkError}   HTTP 加载失败时
		 * @throws {SyntaxError}    模块代码语法错误时
		 * @throws {TypeError}      模块未返回有效类实例时
		 * @returns {Promise<LuCI.baseclass>} 解析为模块实例
		 *
		 * 【在插件中使用 'require' 字符串语法声明依赖（推荐方式）】
		 *
		 *   'use strict';
		 *   'require form';    // 框架解析后等价于 L.require('form')
		 *   'require uci';     // 依赖的模块实例作为参数注入
		 *
		 * 【模块加载机制】
		 *   1. 将模块名转换为 URL：'form' → '{base_url}/form.js?v=...'
		 *   2. 解析文件头部的 'require xxx' 声明，递归加载所有依赖
		 *   3. 通过 eval() 执行模块代码，将依赖实例作为参数注入
		 *   4. 将返回的类实例存入 classes 表，并挂载到 L 对象对应路径
		 */
		require(name, from = []) {
			const L = this;
			let url = null;

			if (classes[name] != null) {
				if (from.indexOf(name) != -1)
					LuCI.prototype.raise('DependencyError',
						'Circular dependency: class "%s" depends on "%s"',
						name, from.join('" which depends on "'));

				return Promise.resolve(classes[name]);
			}

			url = '%s/%s.js%s'.format(env.base_url, name.replace(/\./g, '/'),
				(env.resource_version ? `?v=${env.resource_version}` : ''));
			from = [ name ].concat(from);

			const compileClass = res => {
				if (!res.ok)
					LuCI.prototype.raise('NetworkError',
						'HTTP error %d while loading class file "%s"', res.status, url);

				const source = res.text();
				const requirematch = /^require[ \t]+(\S+)(?:[ \t]+as[ \t]+([a-zA-Z_]\S*))?$/;
				const strictmatch = /^use[ \t]+strict$/;
				const depends = [];
				let args = '';

				/* 扫描源码头部，提取所有 'require xxx' 声明 */
				for (let i = 0, off = -1, prev = -1, quote = -1, comment = -1, esc = false; i < source.length; i++) {
					const chr = source.charCodeAt(i);

					if (esc) { esc = false; }
					else if (comment != -1) {
						if ((comment == 47 && chr == 10) || (comment == 42 && prev == 42 && chr == 47))
							comment = -1;
					}
					else if ((chr == 42 || chr == 47) && prev == 47) { comment = chr; }
					else if (chr == 92) { esc = true; }
					else if (chr == quote) {
						const s = source.substring(off, i), m = requirematch.exec(s);

						if (m) {
							const dep = m[1], as = m[2] || dep.replace(/[^a-zA-Z0-9_]/g, '_');
							depends.push(LuCI.prototype.require(dep, from));
							args += `, ${as}`;
						}
						else if (!strictmatch.exec(s)) { break; }

						off = -1;
						quote = -1;
					}
					else if (quote == -1 && (chr == 34 || chr == 39)) {
						off = i + 1;
						quote = chr;
					}

					prev = chr;
				}

				/* 等所有依赖加载完毕后，eval 执行模块代码并实例化 */
				return Promise.all(depends).then(instances => {
					let _factory, _class;

					try {
						_factory = eval(
							'(function(window, document, L%s) { %s })\n\n//# sourceURL=%s\n'
								.format(args, source, res.url));
					}
					catch (error) {
						LuCI.prototype.raise('SyntaxError', '%s\n  in %s:%s',
							error.message, res.url, error.lineNumber ?? '?');
					}

					_factory.displayName = toCamelCase(`${name}ClassFactory`);
					_class = _factory.apply(_factory, [window, document, L].concat(instances));

					if (!Class.isSubclass(_class))
						LuCI.prototype.error('TypeError', '"%s" factory yields invalid constructor', name);

					if (_class.displayName == 'AnonymousClass')
						_class.displayName = toCamelCase(`${name}Class`);

					/* 将模块实例挂载到 L 对象对应路径（如 L.form、L.ui 等） */
					let ptr = Object.getPrototypeOf(L);
					let idx = 0;
					const parts = name.split(/\./);
					const instance = new _class();

					while (ptr && idx < parts.length - 1)
						ptr = ptr[parts[idx++]];

					if (ptr)
						ptr[parts[idx]] = instance;

					classes[name] = instance;
					return instance;
				});
			};

			classes[name] = Request.get(url, { cache: true }).then(compileClass);
			return classes[name];
		},

		/**
		 * 探测 RPC 基础 URL（优先读 sessionStorage 缓存，再尝试直连 ubus，失败回退 CGI 代理）。
		 * @private
		 */
		probeRPCBaseURL() {
			if (rpcBaseURL == null)
				rpcBaseURL = Session.getLocalData('rpcBaseURL');

			if (rpcBaseURL == null) {
				const msg = { jsonrpc: '2.0', id: 'init', method: 'list', params: undefined };
				const rpcFallbackURL = this.url('admin/ubus');

				rpcBaseURL = Request.post(env.ubuspath, msg, { nobatch: true })
					.then(res => rpcBaseURL = res.status == 200 ? env.ubuspath : rpcFallbackURL,
					      () => rpcBaseURL = rpcFallbackURL)
					.then(url => {
						Session.setLocalData('rpcBaseURL', url);
						return url;
					});
			}

			return Promise.resolve(rpcBaseURL);
		},

		/** 探测并缓存系统特性标志（通过 luci.getFeatures RPC 调用）。@private */
		probeSystemFeatures() {
			if (sysFeatures == null)
				sysFeatures = Session.getLocalData('features');

			if (!this.isObject(sysFeatures)) {
				sysFeatures = classes.rpc.declare({
					object: 'luci',
					method: 'getFeatures',
					expect: { '': {} }
				})().then(features => {
					Session.setLocalData('features', features);
					sysFeatures = features;
					return features;
				});
			}

			return Promise.resolve(sysFeatures);
		},

		/** 探测并缓存预加载类列表（从 preload 目录读取 JS 文件列表）。@private */
		probePreloadClasses() {
			if (preloadClasses == null)
				preloadClasses = Session.getLocalData('preload');

			if (!Array.isArray(preloadClasses)) {
				preloadClasses = this.resolveDefault(classes.rpc.declare({
					object: 'file',
					method: 'list',
					params: [ 'path' ],
					expect: { 'entries': [] }
				})(this.fspath(this.resource('preload'))), []).then(entries => {
					const classes = [];

					for (let i = 0; i < entries.length; i++) {
						if (entries[i].type != 'file') continue;
						const m = entries[i].name.match(/(.+)\.js$/);
						if (m) classes.push('preload.%s'.format(m[1]));
					}

					Session.setLocalData('preload', classes);
					preloadClasses = classes;
					return classes;
				});
			}

			return Promise.resolve(preloadClasses);
		},

		/**
		 * 检测指定系统特性是否可用（session 开始时查询一次并缓存）。
		 *
		 * @instance @memberof LuCI
		 * @param {string} feature      - 特性名（如 'fwl3'、'ipv6'、'hostapd'）
		 * @param {string} [subfeature] - 子特性名（如 'sae'、'11w'）
		 * @returns {boolean|null}
		 *   true  → 特性可用
		 *   false → 特性不可用
		 *   null  → 查询了不支持子特性的特性的子特性
		 *
		 * 【使用场景：根据硬件能力动态显示配置选项】
		 *   if (L.hasSystemFeature('hostapd', 'sae'))
		 *       s.option(form.Flag, 'sae', '启用 WPA3 SAE 认证');
		 */
		hasSystemFeature() {
			const ft = sysFeatures[arguments[0]];
			if (arguments.length == 2)
				return this.isObject(ft) ? ft[arguments[1]] : null;
			return (ft != null && ft != false);
		},

		/**
		 * session 过期时：停止轮询，弹出重新登录对话框，抛出 SessionError。
		 * @private
		 */
		notifySessionExpiry() {
			Poll.stop();

			classes.ui.showModal(_('Session expired'), [
				E('div', { class: 'alert-message warning' },
					_('A new login is required since the authentication session expired.')),
				E('div', { class: 'right' },
					E('div', {
						class: 'btn primary',
						click() {
							const loc = window.location;
							window.location = `${loc.protocol}//${loc.host}${loc.pathname}${loc.search}`;
						}
					}, _('Log in…')))
			]);

			LuCI.prototype.raise('SessionError', 'Login session is expired');
		},

		/**
		 * DOM 就绪且核心模块加载完成后的初始化：注册拦截器、绑定轮询指示器、
		 * 探测系统特性、加载预加载模块，最后调用 initDOM()。
		 * @private
		 */
		setupDOM(res) {
			const domEv = res[0], uiClass = res[1], rpcClass = res[2], formClass = res[3], rpcBaseURL = res[4];

			rpcClass.setBaseURL(rpcBaseURL);

			/* RPC 拦截器：检测 JSON-RPC 错误码 -32002（session 过期/权限问题） */
			rpcClass.addInterceptor((msg, req) => {
				if (!LuCI.prototype.isObject(msg) ||
					!LuCI.prototype.isObject(msg.error) ||
					msg.error.code != -32002)
					return;

				if (!LuCI.prototype.isObject(req) ||
					(req.object == 'session' && req.method == 'access'))
					return;

				return rpcClass.declare({
					'object': 'session',
					'method': 'access',
					'params': [ 'scope', 'object', 'function' ],
					'expect': { access: true }
				})('uci', 'luci', 'read').catch(LuCI.prototype.notifySessionExpiry);
			});

			/* HTTP 拦截器：检测 403 + X-LuCI-Login-Required 头 */
			Request.addInterceptor(res => {
				let isDenied = false;
				if (res.status == 403 && res.headers.get('X-LuCI-Login-Required') == 'yes')
					isDenied = true;
				if (!isDenied) return;
				LuCI.prototype.notifySessionExpiry();
			});

			/* 轮询状态指示器（右上角"正在刷新"/"已暂停"） */
			document.addEventListener('poll-start', ev => {
				uiClass.showIndicator('poll-status', _('Refreshing'), ev => {
					Request.poll.active() ? Request.poll.stop() : Request.poll.start();
				});
			});

			document.addEventListener('poll-stop', ev => {
				uiClass.showIndicator('poll-status', _('Paused'), null, 'inactive');
			});

			return Promise.all([
				this.probeSystemFeatures(),
				this.probePreloadClasses()
			]).finally(LuCI.prototype.bind(function() {
				const tasks = [];
				if (Array.isArray(preloadClasses))
					for (let i = 0; i < preloadClasses.length; i++)
						tasks.push(this.require(preloadClasses[i]));
				return Promise.all(tasks);
			}, this)).finally(this.initDOM);
		},

		/**
		 * 最终 DOM 初始化：恢复并调用 cbi_init()、启动轮询、发出 luci-loaded 事件。
		 * 触发 luci-loaded 后，视图的 load()/render() 生命周期才会开始执行。
		 * @private
		 */
		initDOM() {
			originalCBIInit();
			Poll.start();
			L.loaded = true;
			document.dispatchEvent(new CustomEvent('luci-loaded'));
		},

		/** 标记 LuCI 是否完成初始化（视图在 load/render 前会等待此标志变为 true）*/
		loaded: false,

		/** 暴露运行时环境变量（供外部读取 env.sessionid 等）*/
		env,

		/**
		 * 构建相对于服务器文档根目录的绝对文件系统路径（处理 .. 和多余 /）。
		 *
		 * @instance @memberof LuCI
		 * @param {...string} [parts] - 路径各部分
		 * @returns {string}
		 *
		 * 【使用场景：构建 preload 目录的完整路径】
		 *   L.fspath(L.resource('preload'))  → '/www/luci-static/resources/preload'
		 */
		fspath() /* ... */ {
			let path = env.documentroot;
			for (let i = 0; i < arguments.length; i++)
				path += `/${arguments[i]}`;

			const p = path.replace(/\/+$/, '').replace(/\/+/g, '/').split(/\//), res = [];
			for (let i = 0; i < p.length; i++)
				if (p[i] == '..') res.pop();
				else if (p[i] != '.') res.push(p[i]);

			return res.join('/');
		},

		/**
		 * 构建带白名单过滤的安全 URL（内部使用，防止路径注入）。
		 * 允许字符：a-z A-Z 0-9 _ . % , ; - / 以及 ?key=value 查询串。
		 * @private
		 */
		path(prefix = '', parts) {
			const url = [ prefix ];

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (Array.isArray(part))
					url.push(this.path('', part));
				else
					if (/^(?:[a-zA-Z0-9_.%,;-]+\/)*[a-zA-Z0-9_.%,;-]+$/.test(part) ||
					    /^\?[a-zA-Z0-9_.%=&;-]+$/.test(part))
						url.push(part.startsWith('?') ? part : '/' + part);
			}

			if (url.length === 1) url.push('/');
			return url.join('');
		},

		/**
		 * 构建相对于 CGI 脚本路径的 URL（如 /cgi-bin/luci/...）。
		 *
		 * @instance @memberof LuCI
		 * @param {...string} [parts] - URL 路径各部分
		 * @returns {string}
		 *
		 * 【使用场景】
		 *   L.url('admin/network/interfaces')
		 *   → '/cgi-bin/luci/admin/network/interfaces'
		 *
		 *   L.url('admin/ubus')  // RPC CGI 代理端点
		 */
		url() {
			return this.path(env.scriptname, arguments);
		},

		/**
		 * 构建相对于静态资源目录的 URL（/luci-static/resources/...）。
		 *
		 * @instance @memberof LuCI
		 * @param {...string} [parts]
		 * @returns {string}
		 *
		 * 【使用场景】
		 *   L.resource('icons', 'wifi.png')
		 *   → '/luci-static/resources/icons/wifi.png'
		 */
		resource() {
			return this.path(env.resource, arguments);
		},

		/**
		 * 构建相对于主题媒体目录的 URL（/luci-static/themes/xxx/...）。
		 *
		 * @instance @memberof LuCI
		 * @param {...string} [parts]
		 * @returns {string}
		 */
		media() {
			return this.path(env.media, arguments);
		},

		/**
		 * 返回当前视图的完整 URL 路径。
		 * @instance @memberof LuCI
		 * @returns {string}
		 */
		location() {
			return this.path(env.scriptname, env.requestpath);
		},

		/**
		 * 检查给定值是否是非 null 的 JavaScript 对象（Array.isArray 的对象版本）。
		 *
		 * @instance @memberof LuCI
		 * @param {*} [val]
		 * @returns {boolean}
		 *
		 * 【使用场景】
		 *   if (L.isObject(response)) { ... }   // 排除 null 和原始类型
		 */
		isObject(val) {
			return (val != null && typeof(val) == 'object');
		},

		/**
		 * 检查给定值是否是函数 arguments 对象。
		 * @instance @memberof LuCI
		 * @param {*} [val]
		 * @returns {boolean}
		 */
		isArguments(val) {
			return (Object.prototype.toString.call(val) == '[object Arguments]');
		},

		/**
		 * 返回对象键的自然排序数组，支持按嵌套值排序和多种排序模式。
		 *
		 * @instance @memberof LuCI
		 * @param {object} obj       - 要排序的对象
		 * @param {string} [key]     - 按哪个子键排序（用于对象数组）
		 * @param {string} [sortmode]- 'addr'=IP/MAC 地址排序，'num'=纯数值排序
		 * @returns {string[]} 排序后的键数组
		 *
		 * 【使用场景：对网络接口状态对象按名称自然排序】
		 *   var ifaceNames = L.sortedKeys(statusObj);
		 *   // ['eth0', 'eth1', 'eth10'] — 而非 ['eth0', 'eth1', 'eth10'] 的字典序
		 */
		sortedKeys(obj, key, sortmode) {
			if (obj == null || typeof(obj) != 'object')
				return [];

			return Object.keys(obj).map(e => {
				let v = (key != null) ? obj[e][key] : e;

				switch (sortmode) {
				case 'addr':
					v = (v != null) ? v.replace(/(?:^|[.:])([0-9a-fA-F]{1,4})/g,
						(m0, m1) => (`000${m1.toLowerCase()}`).substr(-4)) : null;
					break;
				case 'num':
					v = (v != null) ? +v : null;
					break;
				}

				return [ e, v ];
			}).filter(e => e[1] != null).sort((a, b) => naturalCompare(a[1], b[1])).map(e => e[0]);
		},

		/**
		 * 自然排序比较器（可直接用于 Array.sort()）。
		 * 能正确处理含数字的字符串：'eth10' 排在 'eth9' 之后。
		 *
		 * @type {function}
		 * @memberof LuCI
		 *
		 * 【使用场景】
		 *   ['eth10', 'eth2', 'eth1'].sort(L.naturalCompare)
		 *   → ['eth1', 'eth2', 'eth10']
		 */
		naturalCompare,

		/**
		 * 将值转换为数组后自然排序（若已是数组则原地排序）。
		 *
		 * @instance @memberof LuCI
		 * @param {*} val
		 * @returns {Array<*>}
		 */
		sortedArray(val) {
			return this.toArray(val).sort(naturalCompare);
		},

		/**
		 * 将任意值统一转换为数组：
		 *   null/undefined → []
		 *   已是数组       → 原样返回
		 *   对象           → [val]（单元素数组）
		 *   字符串         → trim 后按空白拆分
		 *
		 * @instance @memberof LuCI
		 * @param {*} val
		 * @returns {Array<*>}
		 *
		 * 【使用场景：统一处理 UCI option（字符串）和 list（数组）】
		 *   var dns = L.toArray(uci.get('network', 'lan', 'dns'));
		 *   // 无论原始值是 '8.8.8.8' 还是 ['8.8.8.8','1.1.1.1'] 都返回数组
		 */
		toArray(val) {
			if (val == null) return [];
			else if (Array.isArray(val)) return val;
			else if (typeof(val) == 'object') return [ val ];

			const s = String(val).trim();
			if (s == '') return [];
			return s.split(/\s+/);
		},

		/**
		 * 返回一个 Promise，当 value 是 rejecting Promise 时改为解析为 defvalue。
		 *
		 * @instance @memberof LuCI
		 * @param {*} value    - 可能是普通值或 Promise
		 * @param {*} defvalue - reject 时的默认值
		 * @returns {Promise<*>}
		 *
		 * 【使用场景：允许可选的 RPC 调用失败而不影响整体流程】
		 *   L.resolveDefault(callOptionalApi(), {}).then(data => {
		 *       // data 要么是 API 返回值，要么是空对象 {}
		 *   });
		 */
		resolveDefault(value, defvalue) {
			return Promise.resolve(value).catch(() => defvalue);
		},

		// ────────────────────────────────────────────────────
		// 已废弃的旧版 API（向后兼容，新代码勿用）
		// ────────────────────────────────────────────────────

		/**
		 * @deprecated 请使用 Request.get() 代替
		 * 发起 GET 请求，通过回调返回结果（旧版 Lua CBI 兼容接口）。
		 */
		get(url, args, cb) {
			return this.poll(null, url, args, cb, false);
		},

		/**
		 * @deprecated 请使用 Request.post() 代替
		 * 发起 POST 请求，自动附加 token 字段（旧版 Lua CBI 兼容接口）。
		 */
		post(url, args, cb) {
			return this.poll(null, url, args, cb, true);
		},

		/**
		 * @deprecated 请使用 Request.poll.add() 代替
		 * 注册周期性 HTTP 请求，通过回调返回结果（旧版兼容接口）。
		 */
		poll(interval, url, args, cb, post) {
			if (interval !== null && interval <= 0)
				interval = env.pollinterval;

			const data = Object.assign(post ? { token: env.token } : {}, args);
			const method = post ? 'POST' : 'GET';

			if (!/^(?:\/|\S+:\/\/)/.test(url))
				url = this.url(url);

			if (interval !== null)
				return Request.poll.add(interval, url, { method, query: data }, cb);
			else
				return Request.request(url, { method, query: data })
					.then(res => {
						let json = null;
						if (/^application\/json\b/.test(res.headers.get('Content-Type')))
							try { json = res.json() } catch(e) {}
						cb(res.xhr, json, res.duration);
					});
		},

		/**
		 * 检查当前视图的 ACL 访问权限。
		 * @instance @memberof LuCI
		 * @returns {boolean|null}
		 *   null  → 无任何访问权限（节点未满足）
		 *   false → 只读权限
		 *   true  → 读写权限
		 */
		hasViewPermission() {
			if (!this.isObject(env.nodespec) || !env.nodespec.satisfied)
				return null;
			return !env.nodespec.readonly;
		},

		/** @deprecated 使用 Poll.remove() 代替 */
		stop(entry) { return Poll.remove(entry) },

		/** @deprecated 使用 Poll.stop() 代替 */
		halt() { return Poll.stop() },

		/** @deprecated 使用 Poll.start() 代替 */
		run() { return Poll.start() },

		/** @deprecated 使用 'require dom' 代替 */
		dom: DOM,

		/** @deprecated 使用 'require view' 代替 */
		view: View,

		/** @deprecated 使用 'require poll' 代替 */
		Poll,

		/** @deprecated 使用 'require request' 代替 */
		Request,

		/** @deprecated 使用 'require baseclass' 代替 */
		Class
	});

	// ════════════════════════════════════════════════════════
	// XHR 兼容层（仅供旧版 Lua CBI 模板使用）
	// ════════════════════════════════════════════════════════

	/**
	 * @class xhr
	 * @memberof LuCI
	 * @deprecated
	 * @classdesc
	 *
	 * LuCI.xhr 是 xhr.js 的兼容垫片，注册为全局 window.XHR。
	 * 新代码请勿直接使用此类，改用 LuCI.request 类。
	 *
	 * 【主要方法】
	 *   get(url, data, callback, timeout)  → 发起 GET 请求（回调式）
	 *   post(url, data, callback, timeout) → 发起 POST 请求（回调式）
	 *   cancel()  → 取消请求（仅阻止回调，不中止 XHR）
	 *   busy()    → 检查请求是否还在进行中
	 *   abort()   → 空操作（向后兼容）
	 *   send_form() → 抛出 InternalError（向后兼容）
	 */
	const XHR = Class.extend(/** @lends LuCI.xhr.prototype */ {
		__name__: 'LuCI.xhr',

		__init__() {
			if (window.console && console.debug)
				console.debug('Direct use XHR() is deprecated, please use L.Request instead');
		},

		/** 内部：若请求仍活跃则调用回调 @private */
		_response(cb, res, json, duration) {
			if (this.active) cb(res, json, duration);
			delete this.active;
		},

		/**
		 * @deprecated 使用 L.get() 代替
		 * 发起 GET 请求并通过回调返回结果。
		 */
		get(url, data, callback, timeout) {
			this.active = true;
			LuCI.prototype.get(url, data, this._response.bind(this, callback), timeout);
		},

		/**
		 * @deprecated 使用 L.post() 代替
		 * 发起 POST 请求并通过回调返回结果。
		 */
		post(url, data, callback, timeout) {
			this.active = true;
			LuCI.prototype.post(url, data, this._response.bind(this, callback), timeout);
		},

		/**
		 * @deprecated
		 * 取消请求（仅阻止回调触发，XHR 本身不被中止）。
		 */
		cancel() { delete this.active },

		/**
		 * @deprecated
		 * 检查请求是否仍在进行中。
		 * @returns {boolean}
		 */
		busy() { return (this.active === true) },

		/**
		 * @deprecated
		 * 空操作，向后兼容保留。
		 */
		abort() {},

		/**
		 * @deprecated
		 * 始终抛出 InternalError，向后兼容保留。
		 * @throws {InternalError}
		 */
		send_form() { LuCI.prototype.error('InternalError', 'Not implemented') },
	});

	// XHR 静态方法别名（旧版调用方式：XHR.get(...)、XHR.poll(...) 等）
	XHR.get     = (...args) => LuCI.prototype.get.call(LuCI.prototype, ...args);
	XHR.post    = (...args) => LuCI.prototype.post.call(LuCI.prototype, ...args);
	XHR.poll    = (...args) => LuCI.prototype.poll.call(LuCI.prototype, ...args);
	XHR.stop    = Request.poll.remove.bind(Request.poll);
	XHR.halt    = Request.poll.stop.bind(Request.poll);
	XHR.run     = Request.poll.start.bind(Request.poll);
	XHR.running = Request.poll.active.bind(Request.poll);

	// 注册全局变量
	window.XHR   = XHR;
	window.LuCI  = LuCI;
})(window, document);
