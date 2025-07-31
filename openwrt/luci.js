/**
 * @class LuCI
 * @classdesc
 * LuCI 基础类，全局变量 L 引用此类的实例
 *
 * @param {Object} env - LuCI 运行时环境设置
 */

((window, document, undefined) => {
	'use strict';

	// 环境变量对象
	const env = {};

	// 将字符串转换为驼峰命名法
	const toCamelCase = s => s.replace(/(?:^|[\. -])(.)/g, (m0, m1) => m1.toUpperCase());

	/**
	 * @class baseclass
	 * @hideconstructor
	 * @memberof LuCI
	 * @classdesc
	 * LuCI.baseclass 是所有 LuCI 类的抽象基类
	 * 提供创建子类和原型继承的简单方法
	 */
	const superContext = {};

	let classIndex = 0;

	// 基础类定义
	const Class = Object.assign(function() {}, {
		/**
		 * 扩展基类并返回新的子类
		 * @param {Object<string, *>} properties - 要添加到子类的属性
		 * @returns {LuCI.baseclass} 返回新的子类构造函数
		 */
		extend(properties) {
			const props = {
				__id__: { value: classIndex },
				__base__: { value: this.prototype },
				__name__: { value: properties.__name__ ?? `anonymous${classIndex++}` }
			};

	  		// 类构造函数
			const ClassConstructor = function() {
				if (!(this instanceof ClassConstructor))
					throw new TypeError('Constructor must not be called without "new"');

				// 调用初始化函数
				if (Object.getPrototypeOf(this).hasOwnProperty('__init__')) {
					if (typeof(this.__init__) != 'function')
						throw new TypeError('Class __init__ member is not a function');

					this.__init__.apply(this, arguments)
				}
				else {
					this.super('__init__', arguments);
				}
			};

	  		// 添加属性
			for (const key in properties)
				if (!props[key] && properties.hasOwnProperty(key))
					props[key] = { value: properties[key], writable: true };

	  		// 设置原型链
			ClassConstructor.prototype = Object.create(this.prototype, props);
			ClassConstructor.prototype.constructor = ClassConstructor;
			Object.assign(ClassConstructor, this);
			ClassConstructor.displayName = toCamelCase(`${props.__name__.value}Class`);

			return ClassConstructor;
		},

		/**
		 * 扩展基类并立即实例化
		 * @param {Object<string, *>} properties - 要添加到子类的属性
		 * @param {...*} [new_args] - 传递给构造函数的参数
		 * @returns {LuCI.baseclass} 返回子类实例
		 */
		singleton(properties, ...new_args) {
			return Class.extend(properties).instantiate(new_args);
		},

		/**
		 * 使用参数数组实例化类
		 * @param {Array<*>} params - 构造函数参数数组
		 * @returns {LuCI.baseclass} 返回类实例
		 */
		instantiate(args) {
			return new (Function.prototype.bind.call(this, null, ...args))();
		},

		/* unused */
		call(self, method, ...args) {
			if (typeof(this.prototype[method]) != 'function')
				throw new ReferenceError(`${method} is not defined in class`);

			return this.prototype[method].call(self, method, ...args);
		},
		/**
		 * 检查给定类是否是当前类的子类
		 * @param {LuCI.baseclass} classValue - 要测试的类
		 * @returns {boolean} 如果是子类返回 true
		 */
		isSubclass(classValue) {
			return (typeof(classValue) == 'function' && classValue.prototype instanceof this);
		},

		// 原型方法
		prototype: {
			/**
			 * 从参数数组中提取值
			 * @param {Array<*>} args - 源数组
			 * @param {number} offset - 开始提取的偏移量
			 * @param {...*} [extra_args] - 要添加到结果前面的额外参数
			 * @returns {Array<*>} 返回新数组
			 */
			varargs(args, offset, ...extra_args) {
				return extra_args.concat(Array.prototype.slice.call(args, offset));
			},

			/**
			 * 调用父类方法或获取父类属性
			 * @param {string} key - 成员名称
			 * @param {Array<*>} [callArgs] - 调用参数数组
			 * @returns {*|null} 返回父类成员值或方法调用结果
			 */
			super(key, ...callArgs) {
				if (key == null)
					return null;

				const slotIdx = `${this.__id__}.${key}`;
				const symStack = superContext[slotIdx];
				let protoCtx = null;

				// 查找父类中的成员
				for (protoCtx = Object.getPrototypeOf(symStack ? symStack[0] : Object.getPrototypeOf(this));
					 protoCtx != null && !protoCtx.hasOwnProperty(key);
					 protoCtx = Object.getPrototypeOf(protoCtx)) {}

				if (protoCtx == null)
					return null;

				let res = protoCtx[key];

				// 如果是方法调用
				if (callArgs.length > 0) {
					if (typeof(res) != 'function')
						throw new ReferenceError(`${key} is not a function in base class`);

					if (Array.isArray(callArgs[0]) || LuCI.prototype.isArguments(callArgs[0]))
						callArgs = callArgs[0];

		  			// 设置调用上下文
					if (symStack)
						symStack.unshift(protoCtx);
					else
						superContext[slotIdx] = [ protoCtx ];

		  			// 调用方法
					res = res.apply(this, callArgs);

		  			// 恢复上下文
					if (symStack && symStack.length > 1)
						symStack.shift(protoCtx);
					else
						delete superContext[slotIdx];
				}

				return res;
			},

			/**
			 * 返回类的字符串表示
			 * @returns {string} 类描述字符串
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

	/**
	 * @class headers
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * HTTP 响应头处理类
	 */
	const Headers = Class.extend(/** @lends LuCI.headers.prototype */ {
		__name__: 'LuCI.headers',
		__init__(xhr) {
			const hdrs = this.headers = {};
			xhr.getAllResponseHeaders().split(/\r\n/).forEach(line => {
				const m = /^([^:]+):(.*)$/.exec(line);
				if (m != null)
					hdrs[m[1].trim().toLowerCase()] = m[2].trim();
			});
		},

		/**
		 * 检查是否包含指定头
		 * @param {string} name - 头名称(不区分大小写)
		 * @returns {boolean} 如果存在返回 true
		 */
		has(name) {
			return this.headers.hasOwnProperty(String(name).toLowerCase());
		},

		/**
		 * 获取指定头的值
		 * @param {string} name - 头名称(不区分大小写)
		 * @returns {string|null} 头值或 null
		 */
		get(name) {
			const key = String(name).toLowerCase();
			return this.headers.hasOwnProperty(key) ? this.headers[key] : null;
		}
	});

	/**
	 * @class response
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * HTTP 响应处理类
	 */
	const Response = Class.extend({
		__name__: 'LuCI.response',
		__init__(xhr, url, duration, headers, content) {
	  		// 响应属性
			this.ok = (xhr.status >= 200 && xhr.status <= 299);
			this.status = xhr.status;
			this.statusText = xhr.statusText;
			this.headers = (headers != null) ? headers : new Headers(xhr);
			this.duration = duration;
			this.url = url;
			this.xhr = xhr;

	  		// 根据内容类型设置响应数据
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
		 * 克隆响应对象
		 * @param {*} [content] - 覆盖内容
		 * @returns {LuCI.response} 克隆的响应对象
		 */
		clone(content) {
			const copy = new Response(this.xhr, this.url, this.duration, this.headers, content);

			copy.ok = this.ok;
			copy.status = this.status;
			copy.statusText = this.statusText;

			return copy;
		},

		/**
		 * 获取JSON格式响应数据
		 * @throws {SyntaxError} 如果不是有效JSON
		 * @returns {*} 解析后的JSON数据
		 */
		json() {
			if (this.responseJSON == null)
				this.responseJSON = JSON.parse(this.responseText);

			return this.responseJSON;
		},

		/**
		 * 获取文本格式响应数据
		 * @returns {string} 响应文本
		 */
		text() {
			if (this.responseText == null && this.responseJSON != null)
				this.responseText = JSON.stringify(this.responseJSON);

			return this.responseText;
		},

		/**
		 * 获取二进制格式响应数据
		 * @returns {Blob} 响应二进制数据
		 */
		blob() {
			return this.responseBlob;
		}
	});

	// 请求队列
	const requestQueue = [];

	// 检查请求是否可批量处理
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

	// 刷新请求队列
	function flushRequestQueue() {
		if (!requestQueue.length)
			return;

		// 合并请求
		const reqopt = Object.assign({}, requestQueue[0][0], { content: [], nobatch: true }), batch = [];

		for (let i = 0; i < requestQueue.length; i++) {
			batch[i] = requestQueue[i];
			reqopt.content[i] = batch[i][0].content;
		}

		requestQueue.length = 0;

		// 发送批量请求
		Request.request(rpcBaseURL, reqopt).then(reply => {
			let json = null, req = null;

			try { json = reply.json() }
			catch(e) { }

	  		// 分发响应
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

	/**
	 * @class request
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * HTTP 请求处理类
	 */
	const Request = Class.singleton(/** @lends LuCI.request.prototype */ {
		__name__: 'LuCI.request',
		interceptors: [],

		/**
		 * 将相对URL转换为绝对URL
		 * @param {string} url - 要转换的URL
		 * @returns {string} 绝对URL
		 */
		expandURL(url) {
			if (!/^(?:[^/]+:)?\/\//.test(url))
				url = `${location.protocol}//${location.host}${url}`;

			return url;
		},

		/**
		 * 发起HTTP请求
		 * @param {string} target - 请求URL
		 * @param {LuCI.request.RequestOptions} [options] - 请求选项
		 * @returns {Promise<LuCI.response>} 响应Promise
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

		  			// 处理查询参数
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

		  			// 禁用缓存
					if (!opt.cache)
						opt.url += ((/\?/).test(opt.url) ? '&' : '?') + (new Date()).getTime();

		  			// 批量处理请求
					if (isQueueableRequest(opt)) {
						requestQueue.push([opt, rejectFn, resolveFn]);
						requestAnimationFrame(flushRequestQueue);
						return;
					}

		  			// 打开连接
					if ('username' in opt && 'password' in opt)
						opt.xhr.open(opt.method, opt.url, true, opt.username, opt.password);
					else
						opt.xhr.open(opt.method, opt.url, true);

		  			// 设置响应类型
					opt.xhr.responseType = opt.responseType ?? 'text';

					if ('overrideMimeType' in opt.xhr)
						opt.xhr.overrideMimeType('application/octet-stream');

					// 设置超时
					if ('timeout' in opt)
						opt.xhr.timeout = +opt.timeout;

		  			// 设置凭据
					if ('credentials' in opt)
						opt.xhr.withCredentials = !!opt.credentials;

		  			// 处理请求内容
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

		  			// 设置请求头
					if ('headers' in opt)
						for (const header in opt.headers)
							if (opt.headers.hasOwnProperty(header)) {
								if (header.toLowerCase() != 'content-type')
									opt.xhr.setRequestHeader(header, opt.headers[header]);
								else
									contenttype = opt.headers[header];
							}

		  			// 进度回调
					if ('progress' in opt && 'upload' in opt.xhr)
						opt.xhr.upload.addEventListener('progress', opt.progress);

		  			// 设置内容类型头
					if (contenttype != null)
						opt.xhr.setRequestHeader('Content-Type', contenttype);

		  			// 发送请求
					try {
						opt.xhr.send(content);
					}
					catch (e) {
						rejectFn.call(opt, e);
					}
				});
			});
		},

		// 处理XHR状态变化
		handleReadyStateChange(resolveFn, rejectFn, ev) {
			const xhr = this.xhr, duration = Date.now() - this.start;

			if (xhr.readyState !== 4)
				return;

	  		// 处理错误
			if (xhr.status === 0 && xhr.statusText === '') {
				if (duration >= this.timeout)
					rejectFn.call(this, new Error('XHR request timed out'));
				else
					rejectFn.call(this, new Error('XHR request aborted by browser'));
			}
			else {

				const response = new Response( // 创建响应对象并处理拦截器
					xhr, xhr.responseURL ?? this.url, duration);

				Promise.all(Request.interceptors.map(fn => fn(response)))
					.then(resolveFn.bind(this, response))
					.catch(rejectFn.bind(this));
			}
		},

		/**
		 * 发起GET请求
		 * @param {string} url - 请求URL
		 * @param {LuCI.request.RequestOptions} [options] - 请求选项
		 * @returns {Promise<LuCI.response>} 响应Promise
		 */
		get(url, options) {
			return this.request(url, Object.assign({ method: 'GET' }, options));
		},

		/**
		 * 发起POST请求
		 * @param {string} url - 请求URL
		 * @param {*} [data] - 请求数据
		 * @param {LuCI.request.RequestOptions} [options] - 请求选项
		 * @returns {Promise<LuCI.response>} 响应Promise
		 */
		post(url, data, options) {
			return this.request(url, Object.assign({ method: 'POST', content: data }, options));
		},

		/**
		 * 添加HTTP响应拦截器
		 * @param {LuCI.request.interceptorFn} interceptorFn - 拦截器函数
		 * @returns {LuCI.request.interceptorFn} 注册的函数
		 */
		addInterceptor(interceptorFn) {
			if (typeof(interceptorFn) == 'function')
				this.interceptors.push(interceptorFn);
			return interceptorFn;
		},

		/**
		 * 移除HTTP响应拦截器
		 * @param {LuCI.request.interceptorFn} interceptorFn - 要移除的函数
		 * @returns {boolean} 是否移除了函数
		 */
		removeInterceptor(interceptorFn) {
			const oldlen = this.interceptors.length;
			let i = oldlen;
			while (i--)
				if (this.interceptors[i] === interceptorFn)
					this.interceptors.splice(i, 1);
			return (this.interceptors.length < oldlen);
		},

		// 轮询相关功能
		poll: {
			/**
			 * 添加轮询请求
			 * @param {number} interval - 轮询间隔(秒)
			 * @param {string} url - 请求URL
			 * @param {LuCI.request.RequestOptions} [options] - 请求选项
			 * @param {LuCI.request.poll~callbackFn} [callback] - 回调函数
			 * @returns {function} 轮询函数
			 */
			add(interval, url, options, callback) {
				if (isNaN(interval) || interval <= 0)
					throw new TypeError('Invalid poll interval');

				const ival = interval >>> 0, opts = Object.assign({}, options, { timeout: ival * 1000 - 5 });

				const fn = () => Request.request(url, opts).then(res => {
					if (!Poll.active())
						return;

					let res_json = null;
					try {
						res_json = res.json();
					}
					catch (err) {}

					callback(res, res_json, res.duration);
				});

				return (Poll.add(fn, ival) ? fn : null);
			},

			/**
			 * 移除轮询请求
			 * @param {function} entry - 要移除的轮询函数
			 * @returns {boolean} 是否移除了函数
			 */
			remove(entry) { return Poll.remove(entry) },

	  		// 以下是对Poll类的代理方法
			start() { return Poll.start() },
			stop() { return Poll.stop() },
			active() { return Poll.active() }
		}
	});

	/**
	 * @class poll
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * 轮询管理类
	 */
	const Poll = Class.singleton(/** @lends LuCI.poll.prototype */ {
		__name__: 'LuCI.poll',
	queue: [], // 轮询队列

		/**
		 * 添加轮询操作
		 * @param {function} fn - 轮询函数
		 * @param {number} interval - 轮询间隔(秒)
		 * @returns {boolean} 是否添加成功
		 */
		add(fn, interval) {
			if (interval == null || interval <= 0)
				interval = env.pollinterval || null;

			if (isNaN(interval) || typeof(fn) != 'function')
				throw new TypeError('Invalid argument to LuCI.poll.add()');

	  		// 检查是否已存在
			for (let i = 0; i < this.queue.length; i++)
				if (this.queue[i].fn === fn)
					return false;

	  		// 添加轮询项
			const e = {
				r: true,
				i: interval >>> 0,
				fn
			};

			this.queue.push(e);

	  		// 自动启动轮询
			if (this.tick != null && !this.active())
				this.start();

			return true;
		},

		/**
		 * 移除轮询操作
		 * @param {function} fn - 要移除的函数
		 * @returns {boolean} 是否移除成功
		 */
		remove(fn) {
			if (typeof(fn) != 'function')
				throw new TypeError('Invalid argument to LuCI.poll.remove()');

			const len = this.queue.length;

	  		// 从后向前查找移除
			for (let i = len; i > 0; i--)
				if (this.queue[i-1].fn === fn)
					this.queue.splice(i-1, 1);

	  		// 如果队列为空则停止轮询
			if (!this.queue.length && this.stop())
				this.tick = 0;

			return (this.queue.length != len);
		},

		/**
		 * 启动轮询循环
		 * @returns {boolean} 是否启动成功
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
		 * 停止轮询循环
		 * @returns {boolean} 是否停止成功
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

		// 轮询步骤
		step() {
			for (let i = 0, e = null; (e = Poll.queue[i]) != null; i++) {
				// 检查是否到执行时间
				if ((Poll.tick % e.i) != 0)
					continue;

				if (!e.r)
					continue;

				e.r = false;

				// 执行轮询函数
				Promise.resolve(e.fn()).finally((function() { this.r = true }).bind(e));
			}

	  		// 更新计数器
			Poll.tick = (Poll.tick + 1) % Math.pow(2, 32);
		},

		/**
		 * 检查轮询是否活动
		 * @returns {boolean} 是否活动
		 */
		active() {
			return (this.timer != null);
		}
	});

	/**
	 * @class dom
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * DOM操作辅助类
		 */
	const DOM = Class.singleton(/** @lends LuCI.dom.prototype */ {
		__name__: 'LuCI.dom',

		/**
		 * 检查是否为DOM节点
		 * @param {*} e - 要检查的值
		 * @returns {boolean} 是否为DOM节点
		 */
		elem(e) {
			return (e != null && typeof(e) == 'object' && 'nodeType' in e);
		},

		/**
		 * 解析HTML字符串为DOM节点
		 * @param {string} s - HTML字符串
		 * @returns {Node} 解析后的第一个节点
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
		 * 检查节点是否匹配选择器
		 * @param {*} node - 要检查的节点
		 * @param {string} [selector] - 选择器
		 * @returns {boolean} 是否匹配
		 */
		matches(node, selector) {
			const m = this.elem(node) ? (node.matches ?? node.msMatchesSelector) : null;
			return m ? m.call(node, selector) : false;
		},

		/**
		 * 查找匹配选择器的最近父节点
		 * @param {*} node - 起始节点
		 * @param {string} [selector] - 选择器
		 * @returns {Node|null} 匹配的父节点或null
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
		 * 添加子节点
		 * @param {*} node - 父节点
		 * @param {*} [children] - 子节点
		 * @returns {Node|null} 最后添加的子节点
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
		 * 替换节点内容
		 * @param {*} node - 要替换内容的节点
		 * @param {*} [children] - 新内容
		 * @returns {Node|null} 最后添加的子节点
		 */
		content(node, children) {
			if (!this.elem(node))
				return null;

	  		// 清理数据引用
			const dataNodes = node.querySelectorAll('[data-idref]');

			for (let i = 0; i < dataNodes.length; i++)
				delete this.registry[dataNodes[i].getAttribute('data-idref')];

	  		// 移除所有子节点
			while (node.firstChild)
				node.removeChild(node.firstChild);

			return this.append(node, children);
		},

		/**
		 * 设置属性或事件监听器
		 * @param {*} node - 目标节点
		 * @param {string|Object<string, *>} key - 属性名或属性对象
		 * @param {*} [val] - 属性值
		 */
		attr(node, key, val) {
			if (!this.elem(node))
				return null;

			let attr = null;

			if (typeof(key) === 'object' && key !== null)
				attr = key;
			else if (typeof(key) === 'string')
				attr = {}, attr[key] = val;

	  		// 设置属性或事件
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
		 * 创建DOM节点
		 * @param {*} html - 节点描述
		 * @param {Object<string, *>} [attr] - 属性
		 * @param {*} [data] - 子节点
		 * @returns {Node} 创建的节点
		 */
		create() {
			const html = arguments[0];
			let attr = arguments[1];
			let data = arguments[2];
			let elem;

	  		// 处理参数重载
			if (!(attr instanceof Object) || Array.isArray(attr))
				data = attr, attr = null;

	  		// 根据输入类型创建节点
			if (Array.isArray(html)) {
				elem = document.createDocumentFragment();
				for (let i = 0; i < html.length; i++)
					elem.appendChild(this.create(html[i]));
			}
			else if (this.elem(html)) {
				elem = html;
			}
			else if (html.charCodeAt(0) === 60) {
				elem = this.parse(html);
			}
			else {
				elem = document.createElement(html);
			}

			if (!elem)
				return null;

	  		// 设置属性和子节点
			this.attr(elem, attr);
			this.append(elem, data);

			return elem;
		},

		registry: {},

		/**
		 * 获取/设置节点数据
		 * @param {Node} node - 目标节点
		 * @param {string|null} [key] - 数据键
		 * @param {*|null} [val] - 数据值
		 * @returns {*} 数据值
		 */
		data(node, key, val) {
			if (!node?.getAttribute)
				return null;

			let id = node.getAttribute('data-idref');

	  		// 清除所有数据
			if (arguments.length > 1 && key == null) {
				if (id != null) {
					node.removeAttribute('data-idref');
					val = this.registry[id]
					delete this.registry[id];
					return val;
				}

				return null;
			}
	  		// 清除指定键
			else if (arguments.length > 2 && key != null && val == null) {
				if (id != null) {
					val = this.registry[id][key];
					delete this.registry[id][key];
					return val;
				}

				return null;
			}
	  		// 设置数据
			else if (arguments.length > 2 && key != null && val != null) {
				if (id == null) {
		  			// 生成唯一ID
					do { id = Math.floor(Math.random() * 0xffffffff).toString(16) }
					while (this.registry.hasOwnProperty(id));

					node.setAttribute('data-idref', id);
					this.registry[id] = {};
				}

				return (this.registry[id][key] = val);
			}
	  		// 获取所有数据
			else if (arguments.length == 1) {
				if (id != null)
					return this.registry[id];

				return null;
			}
	  		// 获取指定键
			else if (arguments.length == 2) {
				if (id != null)
					return this.registry[id][key];
			}

			return null;
		},

		/**
		 * 绑定类实例到节点
		 * @param {Node} node - 目标节点
		 * @param {Class} inst - 类实例
		 * @returns {Class} 绑定的实例
		 */
		bindClassInstance(node, inst) {
			if (!(inst instanceof Class))
				LuCI.prototype.error('TypeError', 'Argument must be a class instance');

			return this.data(node, '_class', inst);
		},

		/**
		 * 查找节点或其父节点上的类实例
		 * @param {Node} node - 起始节点
		 * @returns {Class|null} 找到的类实例
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
		 * 调用节点或其父节点上类实例的方法
		 * @param {Node} node - 起始节点
		 * @param {string} method - 方法名
		 * @param {...*} params - 方法参数
		 * @returns {*|null} 方法返回值
		 */
		callClassMethod(node, method, ...args) {
			const inst = this.findClassInstance(node);

			if (typeof(inst?.[method]) != 'function')
				return null;

			return inst[method].call(inst, ...args);
		},

		/**
		 * 检查节点是否为空
		 * @param {Node} node - 要检查的节点
		 * @param {LuCI.dom~ignoreCallbackFn} [ignoreFn] - 忽略回调
		 * @returns {boolean} 是否为空
		 */
		isEmpty(node, ignoreFn) {
			for (let child = node?.firstElementChild; child != null; child = child.nextElementSibling)
				if (!child.classList.contains('hidden') && !ignoreFn?.(child))
					return false;

			return true;
		}
	});

	/**
	 * @class session
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * 会话管理类
	 */
	const Session = Class.singleton(/** @lends LuCI.session.prototype */ {
		__name__: 'LuCI.session',

		/**
		 * 获取会话ID
		 * @returns {string} 会话ID
		 */
		getID() {
			return env.sessionid ?? '00000000000000000000000000000000';
		},

		/**
		 * 获取会话令牌
		 * @returns {string|null} 会话令牌
		 */
		getToken() {
			return env.token ?? null;
		},

		/**
		 * 获取本地会话数据
		 * @param {string} [key] - 数据键
		 * @returns {*} 数据值
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
		 * 设置本地会话数据
		 * @param {string} key - 数据键
		 * @param {*} value - 数据值
		 * @returns {boolean} 是否成功
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

	/**
	 * @class view
	 * @memberof LuCI
	 * @hideconstructor
	 * @classdesc
	 * 视图基类
	 */
	const View = Class.extend(/** @lends LuCI.view.prototype */ {
		__name__: 'LuCI.view',

		// 初始化视图
		__init__() {
			const vp = document.getElementById('view');

			DOM.content(vp, E('div', { 'class': 'spinning' }, _('Loading view…')));

	  		// 加载并渲染视图
			return Promise.resolve(this.load())
				.then(LuCI.prototype.bind(this.render, this))
				.then(LuCI.prototype.bind(function(nodes) {
					const vp = document.getElementById('view');

					DOM.content(vp, nodes);
					DOM.append(vp, this.addFooter());
				}, this)).catch(LuCI.prototype.error);
		},

		/**
		 * 视图加载方法(需子类实现)
		 * @returns {*|Promise<*>} 加载结果
		 */
		load() {},

		/**
		 * 视图渲染方法(需子类实现)
		 * @param {*|null} load_results - 加载结果
		 * @returns {Node|Promise<Node>} 渲染的DOM节点
		 */
		render() {},

		/**
		 * 处理保存操作
		 * @param {Event} ev - 触发事件
		 * @returns {*|Promise<*>} 处理结果
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
		 * 处理保存并应用操作
		 * @param {Event} ev - 触发事件
		 * @returns {*|Promise<*>} 处理结果
		 */
		handleSaveApply(ev, mode) {
			return this.handleSave(ev).then(() => {
				classes.ui.changes.apply(mode == '0');
			});
		},

		/**
		 * 处理重置操作
		 * @param {Event} ev - 触发事件
		 * @returns {*|Promise<*>} 处理结果
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
		 * 添加页脚
		 * @returns {DocumentFragment} 页脚DOM片段
		 */
		addFooter() {
			const footer = E([]);
			const vp = document.getElementById('view');
			let hasmap = false;
			let readonly = true;

	  		// 检查是否有表单和权限
			vp.querySelectorAll('.cbi-map').forEach(map => {
				const m = DOM.findClassInstance(map);
				if (m) {
					hasmap = true;

					if (!m.readonly)
						readonly = false;
				}
			});

			if (!hasmap)
				readonly = !LuCI.prototype.hasViewPermission();

	  		// 创建保存并应用按钮
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

	  		// 添加按钮到页脚
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

  	// 全局变量初始化
	const domParser = new DOMParser();
	let originalCBIInit = null;
	let rpcBaseURL = null;
	let sysFeatures = null;
	let preloadClasses = null;

  	// 预加载核心类
	const classes = {
		baseclass: Class,
		dom: DOM,
		poll: Poll,
		request: Request,
		session: Session,
		view: View
	};

  	// 自然排序比较器
	const naturalCompare = new Intl.Collator(undefined, { numeric: true }).compare;

  	// LuCI 主类
	const LuCI = Class.extend(/** @lends LuCI.prototype */ {
		__name__: 'LuCI',

		// 初始化LuCI环境
		__init__(setenv) {
	  		// 从脚本URL获取基础URL
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

	  		// 等待DOM就绪并加载必要模块
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

	  		// 保存原始CBI初始化函数
			originalCBIInit = window.cbi_init;
			window.cbi_init = () => {};
		},

		/**
		 * 抛出错误并记录堆栈
		 * @param {Error|string} [type=Error] - 错误类型
		 * @param {string} [fmt=Unspecified error] - 错误格式字符串
		 * @param {...*} [args] - 格式参数
		 * @throws {Error} 抛出的错误
		 */
		raise(type, fmt, ...args) {
			let e = null;
			const msg = fmt ? String.prototype.format.call(fmt, ...args) : null;
			const stack = [];

			if (type instanceof Error) {
				e = type;

				if (msg)
					e.message = `${msg}: ${e.message}`;
			}
			else {
				try { throw new Error('stacktrace') }
				catch (e2) { stack.push(...(e2.stack ?? '').split(/\n/)) }

				e = new (window[type ?? 'Error'] ?? Error)(msg ?? 'Unspecified error');
				e.name = type ?? 'Error';
			}

	  		// 清理堆栈跟踪
			for (let i = 0; i < stack.length; i++) {
				const frame = stack[i].replace(/(.*?)@(.+):(\d+):(\d+)/g, 'at $1 ($2:$3:$4)').trim();
				stack[i] = frame ? `  ${frame}` : '';
			}

			if (!/^  at /.test(stack[0]))
				stack.shift();

			if (/\braise /.test(stack[0]))
				stack.shift();

			if (/\berror /.test(stack[0]))
				stack.shift();

			if (stack.length)
				e.message += `\n${stack.join('\n')}`;

	  		// 记录错误
			if (window.console && console.debug)
				console.debug(e);

			throw e;
		},

		/**
		 * 抛出错误并显示给用户
		 * @param {Error|string} [type=Error] - 错误类型
		 * @param {string} [fmt=Unspecified error] - 错误格式字符串
		 * @param {...*} [args] - 格式参数
		 * @throws {Error} 抛出的错误
		 */
		error(type, fmt /*, ...*/) {
			try {
				LuCI.prototype.raise.apply(LuCI.prototype,
					Array.prototype.slice.call(arguments));
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
		 * 绑定函数上下文
		 * @param {function} fn - 要绑定的函数
		 * @param {*} self - this上下文
		 * @param {...*} [args] - 绑定参数
		 * @returns {function} 绑定后的函数
		 */
		bind(fn, self, ...args) {
			return Function.prototype.bind.call(fn, self, ...args);
		},

		/**
		 * 加载JavaScript类
		 * @param {string} name - 类名(点分格式)
		 * @param {Array} [from=[]] - 依赖链(用于检测循环依赖)
		 * @returns {Promise<LuCI.baseclass>} 类实例Promise
		 */
		require(name, from = []) {
			const L = this;
			let url = null;

			// 检查是否已加载
			if (classes[name] != null) {
				if (from.indexOf(name) != -1)
					LuCI.prototype.raise('DependencyError',
						'Circular dependency: class "%s" depends on "%s"',
						name, from.join('" which depends on "'));

				return Promise.resolve(classes[name]);
			}

			// 构建类文件URL
			url = '%s/%s.js%s'.format(env.base_url, name.replace(/\./g, '/'), (env.resource_version ? `?v=${env.resource_version}` : ''));
			from = [ name ].concat(from);

			// 编译类
			const compileClass = res => {
				if (!res.ok)
					LuCI.prototype.raise('NetworkError',
						'HTTP error %d while loading class file "%s"', res.status, url);

				const source = res.text();
				const requirematch = /^require[ \t]+(\S+)(?:[ \t]+as[ \t]+([a-zA-Z_]\S*))?$/;
				const strictmatch = /^use[ \t]+strict$/;
				const depends = [];
				let args = '';

				// 解析依赖
				for (let i = 0, off = -1, prev = -1, quote = -1, comment = -1, esc = false; i < source.length; i++) {
					const chr = source.charCodeAt(i);

					if (esc) {
						esc = false;
					}
					else if (comment != -1) {
						if ((comment == 47 && chr == 10) || (comment == 42 && prev == 42 && chr == 47))
							comment = -1;
					}
					else if ((chr == 42 || chr == 47) && prev == 47) {
						comment = chr;
					}
					else if (chr == 92) {
						esc = true;
					}
					else if (chr == quote) {
						const s = source.substring(off, i), m = requirematch.exec(s);

						if (m) {
							const dep = m[1], as = m[2] || dep.replace(/[^a-zA-Z0-9_]/g, '_');
							depends.push(LuCI.prototype.require(dep, from));
							args += `, ${as}`;
						}
						else if (!strictmatch.exec(s)) {
							break;
						}

						off = -1;
						quote = -1;
					}
					else if (quote == -1 && (chr == 34 || chr == 39)) {
						off = i + 1;
						quote = chr;
					}

					prev = chr;
				}

				// 加载依赖并实例化类
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

		  			// 将类实例挂载到LuCI原型链
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

			// 请求类文件
			classes[name] = Request.get(url, { cache: true }).then(compileClass);

			return classes[name];
		},

		/* DOM 初始化相关方法 */

		// 探测RPC基础URL
		probeRPCBaseURL() {
			if (rpcBaseURL == null)
				rpcBaseURL = Session.getLocalData('rpcBaseURL');

			if (rpcBaseURL == null) {
				const msg = {
					jsonrpc: '2.0',
					id:	  'init',
					method:  'list',
					params:  undefined
				};
				const rpcFallbackURL = this.url('admin/ubus');

				rpcBaseURL = Request.post(env.ubuspath, msg, { nobatch: true }).then(res => rpcBaseURL = res.status == 200 ? env.ubuspath : rpcFallbackURL, () => rpcBaseURL = rpcFallbackURL).then(url => {
					Session.setLocalData('rpcBaseURL', url);
					return url;
				});
			}

			return Promise.resolve(rpcBaseURL);
		},

		// 探测系统特性
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

		// 探测预加载类
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
						if (entries[i].type != 'file')
							continue;

						const m = entries[i].name.match(/(.+)\.js$/);

						if (m)
							classes.push('preload.%s'.format(m[1]));
					}

					Session.setLocalData('preload', classes);
					preloadClasses = classes;

					return classes;
				});
			}

			return Promise.resolve(preloadClasses);
		},

		/**
		 * 检查系统是否支持某特性
		 * @param {string} feature - 特性名称
		 * @param {string} [subfeature] - 子特性名称
		 * @return {boolean|null} 是否支持
		 */
		hasSystemFeature() {
			const ft = sysFeatures[arguments[0]];

			if (arguments.length == 2)
				return this.isObject(ft) ? ft[arguments[1]] : null;

			return (ft != null && ft != false);
		},

		// 通知会话过期
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

		// 设置DOM环境
		setupDOM(res) {
			const domEv = res[0], uiClass = res[1], rpcClass = res[2], formClass = res[3], rpcBaseURL = res[4];

			rpcClass.setBaseURL(rpcBaseURL);

	  		// 添加RPC拦截器(处理会话过期)
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

	  		// 添加请求拦截器(处理权限拒绝)
			Request.addInterceptor(res => {
				let isDenied = false;

				if (res.status == 403 && res.headers.get('X-LuCI-Login-Required') == 'yes')
					isDenied = true;

				if (!isDenied)
					return;

				LuCI.prototype.notifySessionExpiry();
			});

	  		// 轮询事件处理
			document.addEventListener('poll-start', ev => {
				uiClass.showIndicator('poll-status', _('Refreshing'), ev => {
					Request.poll.active() ? Request.poll.stop() : Request.poll.start();
				});
			});

			document.addEventListener('poll-stop', ev => {
				uiClass.showIndicator('poll-status', _('Paused'), null, 'inactive');
			});

	  		// 加载系统特性和预加载类
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

		// 初始化DOM
		initDOM() {
			originalCBIInit(); // 恢复原始CBI初始化
			Poll.start(); // 启动轮询
			document.dispatchEvent(new CustomEvent('luci-loaded')); // 触发加载完成事件
		},

	/* 实用方法 */

		/**
		 * 环境变量对象
		 * @member {Object} env
		 */
			env,

		/**
		 * 构建文件系统路径
		 * @param {...string} [parts] - 路径部分
		 * @return {string} 完整路径
		 */
		fspath() /* ... */{
			let path = env.documentroot;

			for (let i = 0; i < arguments.length; i++)
				path += `/${arguments[i]}`;

	  		// 规范化路径
			const p = path.replace(/\/+$/, '').replace(/\/+/g, '/').split(/\//), res = [];

			for (let i = 0; i < p.length; i++)
				if (p[i] == '..')
					res.pop();
				else if (p[i] != '.')
					res.push(p[i]);

			return res.join('/');
		},

		/**
		 * 构建URL路径
		 * @param {string} [prefix] - 路径前缀
		 * @param {...string} [parts] - 路径部分
		 * @return {string} 完整路径
		 */
		path(prefix = '', parts) {
			const url = [ prefix ];

			for (let i = 0; i < parts.length; i++){
				const part = parts[i];
				if (Array.isArray(part))
					url.push(this.path('', part));
				else
					if (/^(?:[a-zA-Z0-9_.%,;-]+\/)*[a-zA-Z0-9_.%,;-]+$/.test(part) || /^\?[a-zA-Z0-9_.%=&;-]+$/.test(part))
						url.push(part.startsWith('?') ? part : '/' + part);
			}

			if (url.length === 1)
				url.push('/');

			return url.join('');
		},

		/**
		 * 构建相对于脚本路径的URL
		 * @param {...string} [parts] - 路径部分
		 * @return {string} 完整URL
		 */
		url() {
			return this.path(env.scriptname, arguments);
		},

		/**
		 * 构建相对于静态资源路径的URL
		 * @param {...string} [parts] - 路径部分
		 * @return {string} 完整URL
		 */
		resource() {
			return this.path(env.resource, arguments);
		},

		/**
		 * 构建相对于主题媒体路径的URL
		 * @param {...string} [parts] - 路径部分
		 * @return {string} 完整URL
		 */
		media() {
			return this.path(env.media, arguments);
		},

		/**
		 * 获取当前视图路径
		 * @return {string} 当前路径
		 */
		location() {
			return this.path(env.scriptname, env.requestpath);
		},

		/**
		 * 检查是否为对象
		 * @param {*} [val] - 要检查的值
		 * @return {boolean} 是否为对象
		 */
		isObject(val) {
			return (val != null && typeof(val) == 'object');
		},

		/**
		 * 检查是否为arguments对象
		 * @param {*} [val] - 要检查的值
		 * @return {boolean} 是否为arguments
		 */
		isArguments(val) {
			return (Object.prototype.toString.call(val) == '[object Arguments]');
		},

		/**
		 * 获取排序后的对象键
		 * @param {object} obj - 源对象
		 * @param {string|null} [key] - 排序依据的键
		 * @param {"addr"|"num"} [sortmode] - 排序模式
		 * @return {string[]} 排序后的键数组
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

				case 'num': // 数字排序
					v = (v != null) ? +v : null;
					break;
				}

				return [ e, v ];
			}).filter(e => e[1] != null).sort((a, b) => naturalCompare(a[1], b[1])).map(e => e[0]);
		},

		/**
		 * 自然排序比较函数
		 * @type {function}
		 */
		naturalCompare,

		/**
		 * 转换为数组并排序
		 * @param {*} val - 输入值
		 * @return {Array<*>} 排序后的数组
		 */
		sortedArray(val) {
			return this.toArray(val).sort(naturalCompare);
		},

		/**
		 * 转换为数组
		 * @param {*} val - 输入值
		 * @return {Array<*>} 结果数组
		 */
		toArray(val) {
			if (val == null)
				return [];
			else if (Array.isArray(val))
				return val;
			else if (typeof(val) == 'object')
				return [ val ];

			const s = String(val).trim();

			if (s == '')
				return [];

			return s.split(/\s+/);
		},

	/**
	 * 解析Promise并使用默认值
	 * @param {*} value - 输入值
	 * @param {*} defvalue - 默认值
	 * @returns {Promise<*>} 结果Promise
	 */
		resolveDefault(value, defvalue) {
			return Promise.resolve(value).catch(() => defvalue);
		},

	/* 向后兼容的旧方法 */

		// 旧版GET请求
		get(url, args, cb) {
			return this.poll(null, url, args, cb, false);
		},

		// 旧版POST请求
		post(url, args, cb) {
			return this.poll(null, url, args, cb, true);
		},

		// 旧版轮询
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

	// 旧版方法别名

	/**
	 * 检查视图权限
	 * @return {boolean|null} 是否有权限
	 */
		hasViewPermission() {
			if (!this.isObject(env.nodespec) || !env.nodespec.satisfied)
				return null;

			return !env.nodespec.readonly;
		},
		stop(entry) { return Poll.remove(entry) },
		halt() { return Poll.stop() },
		run() { return Poll.start() },

		/* 向后兼容的旧属性 */
		dom: DOM,
		view: View,
		Poll,
		Request,
		Class
	});

	/**
	 * @class xhr
	 * @memberof LuCI
	 * @deprecated
	 * @classdesc
	 * 旧版XHR兼容类
	 */
	const XHR = Class.extend(/** @lends LuCI.xhr.prototype */ {
		__name__: 'LuCI.xhr',
		__init__() {
			if (window.console && console.debug)
				console.debug('Direct use XHR() is deprecated, please use L.Request instead');
		},

		// 响应处理
		_response(cb, res, json, duration) {
			if (this.active)
				cb(res, json, duration);
			delete this.active;
		},

		// 旧版GET
		get(url, data, callback, timeout) {
			this.active = true;
			LuCI.prototype.get(url, data, this._response.bind(this, callback), timeout);
		},

		// 旧版POST
		post(url, data, callback, timeout) {
			this.active = true;
			LuCI.prototype.post(url, data, this._response.bind(this, callback), timeout);
		},

		// 取消请求
		cancel() { delete this.active },
		busy() { return (this.active === true) },
		abort() {},
		send_form() { LuCI.prototype.error('InternalError', 'Not implemented') },
	});

	// 设置XHR静态方法
	XHR.get = (...args) => LuCI.prototype.get.call(LuCI.prototype, ...args);
	XHR.post = (...args) => LuCI.prototype.post.call(LuCI.prototype, ...args);
	XHR.poll = (...args) => LuCI.prototype.poll.call(LuCI.prototype, ...args);
	XHR.stop = Request.poll.remove.bind(Request.poll);
	XHR.halt = Request.poll.stop.bind(Request.poll);
	XHR.run = Request.poll.start.bind(Request.poll);
	XHR.running = Request.poll.active.bind(Request.poll);

	// 暴露全局对象
	window.XHR = XHR;
	window.LuCI = LuCI;
})(window, document);
