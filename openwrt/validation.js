'use strict'; // 启用严格模式，确保代码更安全
'require baseclass'; // 引入基类模块（可能是自定义的模块引用方式）

function bytelen(x) { // 定义函数 bytelen，用于计算字符串的字节长度
	return new Blob([x]).size; // 使用 Blob 对象计算字符串 x 的字节大小
} // 函数结束

function arrayle(a, b) { // 定义函数 arrayle，比较两个数组是否满足小于等于关系
	if (!Array.isArray(a) || !Array.isArray(b)) // 检查输入 a 和 b 是否为数组
		return false; // 如果任一不是数组，返回 false

	for (let i = 0; i < a.length; i++) // 遍历数组 a 的元素
		if (a[i] > b[i]) // 如果 a[i] 大于 b[i]
			return false; // 返回 false，表示不满足小于等于
		else if (a[i] < b[i]) // 如果 a[i] 小于 b[i]
			return true; // 返回 true，表示满足小于等于

	return true; // 如果所有元素相等，返回 true
} // 函数结束

const Validator = baseclass.extend({ // 定义 Validator 类，继承自 baseclass
	__name__: 'Validation', // 设置类名属性为 'Validation'

	__init__(field, type, optional, vfunc, validatorFactory) { // 构造函数，初始化 Validator 实例
		this.field = field; // 保存表单字段 DOM 元素
		this.optional = optional; // 保存是否为可选字段的标志
		this.vfunc = vfunc; // 保存自定义验证函数
		this.vstack = validatorFactory.compile(type); // 编译验证类型，生成验证栈
		this.factory = validatorFactory; // 保存验证器工厂实例
	}, // 构造函数结束

	assert(condition, message) { // 定义 assert 方法，用于验证条件并处理错误
		if (!condition) { // 如果条件不满足
			this.field.classList.add('cbi-input-invalid'); // 为字段添加无效样式类
			this.error = message; // 设置错误信息
			return false; // 返回 false 表示验证失败
		} // 条件不满足的分支结束

		this.field.classList.remove('cbi-input-invalid'); // 移除无效样式类
		this.error = null; // 清空错误信息
		return true; // 返回 true 表示验证通过
	}, // assert 方法结束

	apply(name, value, args) { // 定义 apply 方法，应用指定的验证函数
		let func; // 定义变量 func 用于存储验证函数

		if (typeof(name) === 'function') // 如果 name 是函数
			func = name; // 直接使用 name 作为验证函数
		else if (typeof(this.factory.types[name]) === 'function') // 如果 name 是工厂中定义的验证函数
			func = this.factory.types[name]; // 使用工厂中的验证函数
		else // 如果 name 无效
			return false; // 返回 false 表示无法应用

		if (value != null) // 如果提供了 value
			this.value = value; // 更新当前值

		return func.apply(this, args); // 调用验证函数并返回结果
	}, // apply 方法结束

	validate() { // 定义 validate 方法，执行字段验证
		/* element is detached */ // 注释：检查元素是否已从 DOM 中分离
		if (!findParent(this.field, 'body') && !findParent(this.field, '[data-field]')) // 如果字段不在 body 或 data-field 中
			return true; // 返回 true，表示无需验证

		this.field.classList.remove('cbi-input-invalid'); // 移除无效样式类
		this.value = (this.field.value != null) ? this.field.value : ''; // 获取字段值，默认为空字符串
		this.error = null; // 清空错误信息

		let valid; // 定义变量 valid 存储验证结果

		if (this.value.length === 0) // 如果字段值为空
			valid = this.assert(this.optional, _('non-empty value')); // 检查是否允许为空，否则报错
		else // 如果字段值非空
			valid = this.vstack[0].apply(this, this.vstack[1]); // 应用验证栈中的验证函数

		if (valid !== true) { // 如果验证失败
			const message = _('Expecting: %s').format(this.error); // 格式化错误信息
			this.field.setAttribute('data-tooltip', message); // 设置 tooltip 显示错误信息
			this.field.setAttribute('data-tooltip-style', 'error'); // 设置 tooltip 样式为错误
			this.field.dispatchEvent(new CustomEvent('validation-failure', { // 触发验证失败事件
				bubbles: true, // 事件冒泡
				detail: { // 事件详情
					message: message // 包含错误信息
				} // 事件详情结束
			})); // 事件触发结束
			return false; // 返回 false 表示验证失败
		} // 验证失败分支结束

		if (typeof(this.vfunc) == 'function') // 如果存在自定义验证函数
			valid = this.vfunc(this.value); // 调用自定义验证函数

		if (valid !== true) { // 如果自定义验证失败
			this.assert(false, valid); // 设置错误信息
			this.field.setAttribute('data-tooltip', valid); // 设置 tooltip 显示错误信息
			this.field.setAttribute('data-tooltip-style', 'error'); // 设置 tooltip 样式为错误
			this.field.dispatchEvent(new CustomEvent('validation-failure', { // 触发验证失败事件
				bubbles: true, // 事件冒泡
				detail: { // 事件详情
					message: valid // 包含错误信息
				} // 事件详情结束
			})); // 事件触发结束
			return false; // 返回 false 表示验证失败
		} // 自定义验证失败分支结束

		this.field.removeAttribute('data-tooltip'); // 移除 tooltip 属性
		this.field.removeAttribute('data-tooltip-style'); // 移除 tooltip 样式属性
		this.field.dispatchEvent(new CustomEvent('validation-success', { bubbles: true })); // 触发验证成功事件
		return true; // 返回 true 表示验证通过
	}, // validate 方法结束

}); // Validator 类定义结束

const ValidatorFactory = baseclass.extend({ // 定义 ValidatorFactory 类，继承自 baseclass
	__name__: 'ValidatorFactory', // 设置类名属性为 'ValidatorFactory'

	create(field, type, optional, vfunc) { // 定义 create 方法，创建 Validator 实例
		return new Validator(field, type, optional, vfunc, this); // 返回新的 Validator 实例
	}, // create 方法结束

	compile(code) { // 定义 compile 方法，编译验证规则代码
		let pos = 0; // 记录当前解析位置
		let esc = false; // 标记是否处于转义状态
		let depth = 0; // 记录括号嵌套深度
		const stack = [ ]; // 初始化验证栈

		code += ','; // 在代码末尾添加逗号，便于解析

		for (let i = 0; i < code.length; i++) { // 遍历代码字符串
			if (esc) { // 如果当前处于转义状态
				esc = false; // 清除转义状态
				continue; // 继续下一次循环
			} // 转义处理结束

			switch (code.charCodeAt(i)) // 根据当前字符的 ASCII 码处理
			{
			case 92: // 反斜杠（\）
				esc = true; // 进入转义状态
				break; // 结束当前 case

			case 40: // 左括号（(）
			case 44: // 逗号（,）
				if (depth <= 0) { // 如果不在括号内
					if (pos < i) { // 如果有待处理的子字符串
						let label = code.substring(pos, i); // 提取子字符串
							label = label.replace(/\\(.)/g, '$1'); // 移除转义字符
							label = label.replace(/^[ \t]+/g, ''); // 去除前导空白
							label = label.replace(/[ \t]+$/g, ''); // 去除尾随空白

						if (label && !isNaN(label)) { // 如果是数字
							stack.push(parseFloat(label)); // 转换为浮点数并压入栈
						} // 数字处理结束
						else if (label.match(/^(['"]).*\1$/)) { // 如果是字符串
							stack.push(label.replace(/^(['"])(.*)\1$/, '$2')); // 提取字符串内容并压入栈
						} // 字符串处理结束
						else if (typeof this.types[label] == 'function') { // 如果是验证函数
							stack.push(this.types[label]); // 压入验证函数
							stack.push(null); // 压入占位符
						} // 验证函数处理结束
						else { // 如果无法识别
							L.raise('SyntaxError', 'Unhandled token "%s"', label); // 抛出语法错误
						} // 错误处理结束
					} // 子字符串处理结束

					pos = i+1; // 更新解析位置
				} // 不在括号内处理结束

				depth += (code.charCodeAt(i) == 40); // 如果是左括号，增加深度
				break; // 结束当前 case

			case 41: // 右括号（)）
				if (--depth <= 0) { // 减少深度，如果不在括号内
					if (typeof stack[stack.length-2] != 'function') // 如果倒数第二个元素不是函数
						L.raise('SyntaxError', 'Argument list follows non-function'); // 抛出语法错误

					stack[stack.length-1] = this.compile(code.substring(pos, i)); // 递归编译子表达式
					pos = i+1; // 更新解析位置
				} // 右括号处理结束

				break; // 结束当前 case
			} // switch 结束
		} // 遍历结束

		return stack; // 返回编译后的验证栈
	}, // compile 方法结束

	parseInteger(x) { // 定义 parseInteger 方法，解析整数
		return (/^-?\d+$/.test(x) ? +x : NaN); // 如果是整数，返回数值，否则返回 NaN
	}, // parseInteger 方法结束

	parseDecimal(x) { // 定义 parseDecimal 方法，解析小数
		return (/^-?\d+(?:\.\d+)?$/.test(x) ? +x : NaN); // 如果是小数，返回数值，否则返回 NaN
	}, // parseDecimal 方法结束

	parseIPv4(x) { // 定义 parseIPv4 方法，解析 IPv4 地址
		if (!x.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) // 检查 IPv4 格式
			return null; // 如果格式不匹配，返回 null

		if (RegExp.$1 > 255 || RegExp.$2 > 255 || RegExp.$3 > 255 || RegExp.$4 > 255) // 检查每段是否超过 255
			return null; // 如果超出范围，返回 null

		return [ +RegExp.$1, +RegExp.$2, +RegExp.$3, +RegExp.$4 ]; // 返回 IPv4 地址的数组形式
	}, // parseIPv4 方法结束

	parseIPv6(x) { // 定义 parseIPv6 方法，解析 IPv6 地址
		if (x.match(/^([a-fA-F0-9:]+):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)) { // 检查 IPv6 兼容 IPv4 格式
			const v6 = RegExp.$1; // 提取 IPv6 部分
			const v4 = this.parseIPv4(RegExp.$2); // 解析 IPv4 部分

			if (!v4) // 如果 IPv4 解析失败
				return null; // 返回 null

			x = `${v6}:${(v4[0] * 256 + v4[1]).toString(16)}:${(v4[2] * 256 + v4[3]).toString(16)}`; // 转换为标准 IPv6 格式
		} // IPv6 兼容 IPv4 处理结束

		if (!x.match(/^[a-fA-F0-9:]+$/)) // 检查是否只包含合法字符
			return null; // 如果不合法，返回 null

		const prefix_suffix = x.split(/::/); // 按 :: 分割地址

		if (prefix_suffix.length > 2) // 如果 :: 出现多次
			return null; // 返回 null

		const prefix = (prefix_suffix[0] || '0').split(/:/); // 提取前缀部分
		const suffix = prefix_suffix.length > 1 ? (prefix_suffix[1] || '0').split(/:/) : []; // 提取后缀部分

		if (suffix.length ? (prefix.length + suffix.length > 7) // 检查地址段数是否合法
			              : ((prefix_suffix.length < 2 && prefix.length < 8) || prefix.length > 8))
			return null; // 如果段数不合法，返回 null

		let i; // 定义循环变量
		let word; // 定义单词变量
		const words = []; // 初始化单词数组

		for (i = 0, word = parseInt(prefix[0], 16); i < prefix.length; word = parseInt(prefix[++i], 16)) // 解析前缀
			if (prefix[i].length <= 4 && !isNaN(word) && word <= 0xFFFF) // 检查每段是否合法
				words.push(word); // 压入单词数组
			else // 如果不合法
				return null; // 返回 null

		for (i = 0; i < (8 - prefix.length - suffix.length); i++) // 补齐中间的 0
			words.push(0); // 压入 0

		for (i = 0, word = parseInt(suffix[0], 16); i < suffix.length; word = parseInt(suffix[++i], 16)) // 解析后缀
			if (suffix[i].length <= 4 && !isNaN(word) && word <= 0xFFFF) // 检查每段是否合法
				words.push(word); // 压入单词数组
			else // 如果不合法
				return null; // 返回 null

		return words; // 返回 IPv6 地址的数组形式
	}, // parseIPv6 方法结束

	types: { // 定义 types 对象，包含各种验证函数
		integer() { // 验证整数
			return this.assert(!isNaN(this.factory.parseInteger(this.value)), _('valid integer value')); // 检查是否为有效整数
		}, // integer 验证结束

		uinteger() { // 验证无符号整数
			return this.assert(this.factory.parseInteger(this.value) >= 0, _('positive integer value')); // 检查是否为非负整数
		}, // uinteger 验证结束

		float() { // 验证浮点数
			return this.assert(!isNaN(this.factory.parseDecimal(this.value)), _('valid decimal value')); // 检查是否为有效小数
		}, // float 验证结束

		ufloat() { // 验证无符号浮点数
			return this.assert(this.factory.parseDecimal(this.value) >= 0, _('positive decimal value')); // 检查是否为非负小数
		}, // ufloat 验证结束

		ipaddr(nomask) { // 验证 IP 地址（IPv4 或 IPv6）
			return this.assert(this.apply('ip4addr', null, [nomask]) || this.apply('ip6addr', null, [nomask]), // 检查是否为有效 IP 地址
				nomask ? _('valid IP address') : _('valid IP address or prefix')); // 根据 nomask 参数返回错误信息
		}, // ipaddr 验证结束

		ip4addr(nomask) { // 验证 IPv4 地址
			const re = nomask ? /^(\d+\.\d+\.\d+\.\d+)$/ : /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+\.\d+\.\d+\.\d+)|\/(\d{1,2}))?$/; // 定义正则表达式
			const m = this.value.match(re); // 匹配输入值

			return this.assert(m && this.factory.parseIPv4(m[1]) && (m[2] ? this.factory.parseIPv4(m[2]) : (m[3] ? this.apply('ip4prefix', m[3]) : true)), // 验证地址和掩码
				nomask ? _('valid IPv4 address') : _('valid IPv4 address or network')); // 返回错误信息
		}, // ip4addr 验证结束

		ip6addr(nomask) { // 验证 IPv6 地址
			const re = nomask ? /^([0-9a-fA-F:.]+)$/ : /^([0-9a-fA-F:.]+)(?:\/(\d{1,3}))?$/; // 定义正则表达式
			const m = this.value.match(re); // 匹配输入值

			return this.assert(m && this.factory.parseIPv6(m[1]) && (m[2] ? this.apply('ip6prefix', m[2]) : true), // 验证地址和前缀
				nomask ? _('valid IPv6 address') : _('valid IPv6 address or prefix')); // 返回错误信息
		}, // ip6addr 验证结束

		ip4prefix() { // 验证 IPv4 前缀
			return this.assert(!isNaN(this.value) && this.value >= 0 && this.value <= 32, // 检查前缀范围
				_('valid IPv4 prefix value (0-32)')); // 返回错误信息
		}, // ip4prefix 验证结束

		ip6prefix() { // 验证 IPv6 前缀
			return this.assert(!isNaN(this.value) && this.value >= 0 && this.value <= 128, // 检查前缀范围
				_('valid IPv6 prefix value (0-128)')); // 返回错误信息
		}, // ip6prefix 验证结束

		cidr(negative) { // 验证 CIDR（IPv4 或 IPv6）
			return this.assert(this.apply('cidr4', null, [negative]) || this.apply('cidr6', null, [negative]), // 检查是否为有效 CIDR
				_('valid IPv4 or IPv6 CIDR')); // 返回错误信息
		}, // cidr 验证结束

		cidr4(negative) { // 验证 IPv4 CIDR
			const m = this.value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(-)?(\d{1,2})$/); // 匹配 CIDR 格式
			return this.assert(m && this.factory.parseIPv4(m[1]) && (negative || !m[2]) && this.apply('ip4prefix', m[3]), // 验证地址和前缀
				_('valid IPv4 CIDR')); // 返回错误信息
		}, // cidr4 验证结束

		cidr6(negative) { // 验证 IPv6 CIDR
			const m = this.value.match(/^([0-9a-fA-F:.]+)\/(-)?(\d{1,3})$/); // 匹配 CIDR 格式
			return this.assert(m && this.factory.parseIPv6(m[1]) && (negative || !m[2]) && this.apply('ip6prefix', m[3]), // 验证地址和前缀
				_('valid IPv6 CIDR')); // 返回错误信息
		}, // cidr6 验证结束

		ipnet4() { // 验证 IPv4 网络（地址/掩码）
			const m = this.value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // 匹配网络格式
			return this.assert(m && this.factory.parseIPv4(m[1]) && this.factory.parseIPv4(m[2]), // 验证地址和掩码
				_('IPv4 network in address/netmask notation')); // 返回错误信息
		}, // ipnet4 验证结束

		ipnet6() { // 验证 IPv6 网络（地址/掩码）
			const m = this.value.match(/^([0-9a-fA-F:.]+)\/([0-9a-fA-F:.]+)$/); // 匹配网络格式
			return this.assert(m && this.factory.parseIPv6(m[1]) && this.factory.parseIPv6(m[2]), // 验证地址和掩码
				_('IPv6 network in address/netmask notation')); // 返回错误信息
		}, // ipnet6 验证结束

		ip6hostid() { // 验证 IPv6 主机 ID
			if (this.value == "eui64" || this.value == "random") // 检查特殊值
				return true; // 返回 true

			const v6 = this.factory.parseIPv6(this.value); // 解析 IPv6 地址
			return this.assert(!(!v6 || v6[0] || v6[1] || v6[2] || v6[3]), // 检查主机 ID 部分
				_('valid IPv6 host id')); // 返回错误信息
		}, // ip6hostid 验证结束

		ipmask(negative) { // 验证 IP 网络（地址/掩码）
			return this.assert(this.apply('ipmask4', null, [negative]) || this.apply('ipmask6', null, [negative]), // 检查 IPv4 或 IPv6 网络
				_('valid network in address/netmask notation')); // 返回错误信息
		}, // ipmask 验证结束

		ipmask4(negative) { // 验证 IPv4 网络
			return this.assert(this.apply('cidr4', null, [negative]) || this.apply('ipnet4') || this.apply('ip4addr'), // 检查 CIDR、网络或地址
				_('valid IPv4 network')); // 返回错误信息
		}, // ipmask4 验证结束

		ipmask6(negative) { // 验证 IPv6 网络
			return this.assert(this.apply('cidr6', null, [negative]) || this.apply('ipnet6') || this.apply('ip6addr'), // 检查 CIDR、网络或地址
				_('valid IPv6 network')); // 返回错误信息
		}, // ipmask6 验证结束

		iprange(negative) { // 验证 IP 地址范围
			return this.assert(this.apply('iprange4', null, [negative]) || this.apply('iprange6', null, [negative]), // 检查 IPv4 或 IPv6 范围
				_('valid IP address range')); // 返回错误信息
		}, // iprange 验证结束

		iprange4(negative) { // 验证 IPv4 地址范围
			const m = this.value.split('-'); // 按 - 分割范围
			return this.assert(m.length == 2 && arrayle(this.factory.parseIPv4(m[0]), this.factory.parseIPv4(m[1])), // 检查范围有效性
				_('valid IPv4 address range')); // 返回错误信息
		}, // iprange4 验证结束

		iprange6(negative) { // 验证 IPv6 地址范围
			const m = this.value.split('-'); // 按 - 分割范围
			return this.assert(m.length == 2 && arrayle(this.factory.parseIPv6(m[0]), this.factory.parseIPv6(m[1])), // 检查范围有效性
				_('valid IPv6 address range')); // 返回错误信息
		}, // iprange6 验证结束

		port() { // 验证端口号
			const p = this.factory.parseInteger(this.value); // 解析端口号
			return this.assert(p >= 0 && p <= 65535, // 检查端口范围
				_('valid port value')); // 返回错误信息
		}, // port 验证结束

		portrange() { // 验证端口范围
			if (this.value.match(/^(\d+)-(\d+)$/)) { // 检查端口范围格式
				const p1 = +RegExp.$1; // 起始端口
				const p2 = +RegExp.$2; // 结束端口
				return this.assert(p1 <= p2 && p2 <= 65535, // 检查范围有效性
					_('valid port or port range (port1-port2)')); // 返回错误信息
			} // 端口范围处理结束

			return this.assert(this.apply('port'), // 验证单个端口
				_('valid port or port range (port1-port2)')); // 返回错误信息
		}, // portrange 验证结束

		macaddr(multicast) { // 验证 MAC 地址
			const m = this.value.match(/^([a-fA-F0-9]{2}):([a-fA-F0-9]{2}:){4}[a-fA-F0-9]{2}$/); // 匹配 MAC 地址格式
			return this.assert(m != null && !(+m[1] & 1) == !multicast, // 检查是否为多播地址
				multicast ? _('valid multicast MAC address') : _('valid MAC address')); // 返回错误信息
		}, // macaddr 验证结束

		host(ipv4only) { // 验证主机（主机名或 IP 地址）
			return this.assert(this.apply('hostname') || this.apply(ipv4only == 1 ? 'ip4addr' : 'ipaddr', null, ['nomask']), // 检查主机名或 IP
				_('valid hostname or IP address')); // 返回错误信息
		}, // host 验证结束

		hostname(strict) { // 验证主机名
			if (this.value.length <= 253) // 检查长度是否合法
				return this.assert(
					(this.value.match(/^[a-zA-Z0-9_]+$/) != null || // 检查是否为简单主机名
						(this.value.match(/^[a-zA-Z0-9_][a-zA-Z0-9_\-.]*[a-zA-Z0-9]\.?$/) && // 检查复杂主机名格式
						 this.value.match(/[^0-9.]/))) && // 确保包含非数字和点
					(!strict || !this.value.match(/^_/)), // 检查严格模式下是否以 _ 开头
					_('valid hostname')); // 返回错误信息

			return this.assert(false, _('valid hostname')); // 返回错误信息
		}, // hostname 验证结束

		network() { // 验证网络（UCI 标识、主机名或 IP）
			return this.assert(this.apply('uciname') || this.apply('hostname') || this.apply('ip4addr') || this.apply('ip6addr'), // 检查各种格式
				_('valid UCI identifier, hostname or IP address range')); // 返回错误信息
		}, // network 验证结束

		hostport(ipv4only) { // 验证主机:端口
			const hp = this.value.split(/:/); // 按 : 分割
			return this.assert(hp.length == 2 && this.apply('host', hp[0], [ipv4only]) && this.apply('port', hp[1]), // 验证主机和端口
				_('valid host:port')); // 返回错误信息
		}, // hostport 验证结束

		ip4addrport() { // 验证 IPv4 地址:端口
			const hp = this.value.split(/:/); // 按 : 分割
			return this.assert(hp.length == 2 && this.apply('ip4addr', hp[0], [true]) && this.apply('port', hp[1]), // 验证地址和端口
				_('valid IPv4 address:port')); // 返回错误信息
		}, // ip4addrport 验证结束

		ipaddrport(bracket) { // 验证 IP 地址:端口（支持 IPv6 括号格式）
			const m4 = this.value.match(/^([^\[\]:]+):(\d+)$/); // 匹配 IPv4 格式
			const m6 = this.value.match((bracket == 1) ? /^\[(.+)\]:(\d+)$/ : /^([^\[\]]+):(\d+)$/); // 匹配 IPv6 格式

			if (m4) // 如果是 IPv4
				return this.assert(this.apply('ip4addr', m4[1], [true]) && this.apply('port', m4[2]), // 验证地址和端口
					_('valid address:port')); // 返回错误信息

			return this.assert(m6 && this.apply('ip6addr', m6[1], [true]) && this.apply('port', m6[2]), // 验证 IPv6 地址和端口
				_('valid address:port')); // 返回错误信息
		}, // ipaddrport 验证结束

		wpakey() { // 验证 WPA 密钥
			const v = this.value; // 获取输入值

			if (v.length == 64) // 如果长度为 64
				return this.assert(v.match(/^[a-fA-F0-9]{64}$/), // 检查是否为 64 位十六进制
					_('valid hexadecimal WPA key')); // 返回错误信息

			return this.assert((v.length >= 8) && (v.length <= 63), // 检查长度是否在 8-63 之间
				_('key between 8 and 63 characters')); // 返回错误信息
		}, // wpakey 验证结束

		wepkey() { // 验证 WEP 密钥
			let v = this.value; // 获取输入值

			if (v.substr(0, 2) === 's:') // 如果以 s: 开头
				v = v.substr(2); // 移除前缀

			if ((v.length == 10) || (v.length == 26)) // 如果长度为 10 或 26
				return this.assert(v.match(/^[a-fA-F0-9]{10,26}$/), // 检查是否为十六进制
					_('valid hexadecimal WEP key')); // 返回错误信息

			return this.assert((v.length === 5) || (v.length === 13), // 检查长度是否为 5 或 13
				_('key with either 5 or 13 characters')); // 返回错误信息
		}, // wepkey 验证结束

		uciname() { // 验证 UCI 标识
			return this.assert(this.value.match(/^[a-zA-Z0-9_]+$/), // 检查是否为合法 UCI 标识
				_('valid UCI identifier')); // 返回错误信息
		}, // uciname 验证结束

		netdevname() { // 验证网络设备名称
			const v = this.value; // 获取输入值

			if (v == '.' || v == '..') // 检查是否为 . 或 ..
				return this.assert(false, // 返回错误
					_('valid network device name, not "." or ".."')); // 返回错误信息

			return this.assert(v.match(/^[^:\/%\s]{1,15}$/), // 检查格式和长度
				_('valid network device name between 1 and 15 characters not containing ":", "/", "%" or spaces')); // 返回错误信息
		}, // netdevname 验证结束

		range(min, max) { // 验证数值范围
			const val = this.factory.parseDecimal(this.value); // 解析输入值
			return this.assert(val >= +min && val <= +max, // 检查是否在范围内
				_('value between %f and %f').format(min, max)); // 返回错误信息
		}, // range 验证结束

		min(min) { // 验证最小值
			return this.assert(this.factory.parseDecimal(this.value) >= +min, // 检查是否大于等于最小值
				_('value greater or equal to %f').format(min)); // 返回错误信息
		}, // min 验证结束

		max(max) { // 验证最大值
			return this.assert(this.factory.parseDecimal(this.value) <= +max, // 检查是否小于等于最大值
				_('value smaller or equal to %f').format(max)); // 返回错误信息
		}, // max 验证结束

		length(len) { // 验证固定长度
			return this.assert(bytelen(this.value) == +len, // 检查字节长度是否匹配
				_('value with %d characters').format(len)); // 返回错误信息
		}, // length 验证结束

		rangelength(min, max) { // 验证长度范围
			const len = bytelen(this.value); // 计算字节长度
			return this.assert((len >= +min) && (len <= +max), // 检查长度是否在范围内
				_('value between %d and %d characters').format(min, max)); // 返回错误信息
		}, // rangelength 验证结束

		minlength(min) { // 验证最小长度
			return this.assert(bytelen(this.value) >= +min, // 检查字节长度是否足够
				_('value with at least %d characters').format(min)); // 返回错误信息
		}, // minlength 验证结束

		maxlength(max) { // 验证最大长度
			return this.assert(bytelen(this.value) <= +max, // 检查字节长度是否不超过
				_('value with at most %d characters').format(max)); // 返回错误信息
		}, // maxlength 验证结束

		or() { // 验证逻辑或
			const errors = []; // 初始化错误信息数组

			for (let i = 0; i < arguments.length; i += 2) { // 遍历参数
				if (typeof arguments[i] != 'function') { // 如果不是函数
					if (arguments[i] == this.value) // 如果值匹配
						return this.assert(true); // 返回 true
					errors.push('"%s"'.format(arguments[i])); // 添加错误信息
					i--; // 调整索引
				} // 非函数处理结束
				else if (arguments[i].apply(this, arguments[i+1])) { // 如果验证通过
					return this.assert(true); // 返回 true
				} // 验证通过处理结束
				else { // 如果验证失败
					errors.push(this.error); // 添加错误信息
				} // 验证失败处理结束
			} // 遍历结束

			const t = _('One of the following: %s'); // 格式化错误信息模板

			return this.assert(false, t.format(`\n - ${errors.join('\n - ')}`)); // 返回错误信息
		}, // or 验证结束

		and() { // 验证逻辑与
			for (let i = 0; i < arguments.length; i += 2) { // 遍历参数
				if (typeof arguments[i] != 'function') { // 如果不是函数
					if (arguments[i] != this.value) // 如果值不匹配
						return this.assert(false, '"%s"'.format(arguments[i])); // 返回错误
					i--; // 调整索引
				} // 非函数处理结束
				else if (!arguments[i].apply(this, arguments[i+1])) { // 如果验证失败
					return this.assert(false, this.error); // 返回错误
				} // 验证失败处理结束
			} // 遍历结束

			return this.assert(true); // 返回 true
		}, // and 验证结束

		neg() { // 验证否定
			this.value = this.value.replace(/^[ \t]*![ \t]*/, ''); // 移除前导 ! 和空白

			if (arguments[0].apply(this, arguments[1])) // 如果验证通过
				return this.assert(true); // 返回 true

			return this.assert(false, _('Potential negation of: %s').format(this.error)); // 返回错误信息
		}, // neg 验证结束

		list(subvalidator, subargs) { // 验证列表
			this.field.setAttribute('data-is-list', 'true'); // 标记字段为列表

			const tokens = this.value.match(/[^ \t]+/g); // 分割为非空白令牌
			for (let i = 0; i < tokens.length; i++) // 遍历令牌
				if (!this.apply(subvalidator, tokens[i], subargs)) // 如果子验证失败
					return this.assert(false, this.error); // 返回错误

			return this.assert(true); // 返回 true
		}, // list 验证结束

		phonedigit() { // 验证电话号码字符
			return this.assert(this.value.match(/^[0-9\*#!\.]+$/), // 检查是否为合法字符
				_('valid phone digit (0-9, "*", "#", "!" or ".")')); // 返回错误信息
		}, // phonedigit 验证结束

		timehhmmss() { // 验证时间格式（HH:MM:SS）
			return this.assert(this.value.match(/^(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)$/), // 检查时间格式
				_('valid time (HH:MM:SS)')); // 返回错误信息
		}, // timehhmmss 验证结束

		dateyyyymmdd() { // 验证日期格式（YYYY-MM-DD）
			if (this.value.match(/^(\d\d\d\d)-(\d\d)-(\d\d)/)) { // 匹配日期格式
				const year  = +RegExp.$1; // 提取年份
				const month = +RegExp.$2; // 提取月份
				const day   = +RegExp.$3; // 提取日期
				const days_in_month = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ]; // 每月天数

				const is_leap_year = year => (!(year % 4) && (year % 100)) || !(year % 400); // 判断闰年
				const get_days_in_month = (month, year) => (month === 2 && is_leap_year(year)) ? 29 : days_in_month[month - 1]; // 获取当月天数

				/* Firewall rules in the past don't make sense */ // 注释：过去的防火墙规则无意义
				return this.assert(year >= 2015 && month && month <= 12 && day && day <= get_days_in_month(month, year), // 验证日期有效性
					_('valid date (YYYY-MM-DD)')); // 返回错误信息
			} // 日期匹配处理结束

			return this.assert(false, _('valid date (YYYY-MM-DD)')); // 返回错误信息
		}, // dateyyyymmdd 验证结束

		unique(subvalidator, subargs) { // 验证唯一性
			const ctx = this; // 保存当前上下文
			const option = findParent(ctx.field, '[data-widget][data-name]'); // 查找父级选项
			const section = findParent(option, '.cbi-section'); // 查找父级 section
			const query = '[data-widget="%s"][data-name="%s"]'.format(option.getAttribute('data-widget'), option.getAttribute('data-name')); // 构建查询
			let unique = true; // 初始化唯一性标志

			section.querySelectorAll(query).forEach(sibling => { // 遍历同级元素
				if (sibling === option) // 如果是当前选项
					return; // 跳过

				const input = sibling.querySelector('[data-type]'); // 查找输入字段
				const values = input ? (input.getAttribute('data-is-list') ? input.value.match(/[^ \t]+/g) : [ input.value ]) : null; // 获取值

				if (values !== null && values.indexOf(ctx.value) !== -1) // 如果值重复
					unique = false; // 设置非唯一
			}); // 遍历结束

			if (!unique) // 如果不唯一
				return this.assert(false, _('unique value')); // 返回错误

			if (typeof(subvalidator) === 'function') // 如果有子验证器
				return this.apply(subvalidator, null, subargs); // 应用子验证

			return this.assert(true); // 返回 true
		}, // unique 验证结束

		hexstring() { // 验证十六进制字符串
			return this.assert(this.value.match(/^([a-fA-F0-9]{2})+$/i), // 检查是否为十六进制
				_('hexadecimal encoded value')); // 返回错误信息
		}, // hexstring 验证结束

		string() { // 验证字符串（始终通过）
			return true; // 返回 true
		}, // string 验证结束

		directory() { // 验证目录（始终通过）
			return true; // 返回 true
		}, // directory 验证结束

		file() { // 验证文件（始终通过）
			return true; // 返回 true
		}, // file 验证结束

		device() { // 验证设备（始终通过）
			return true; // 返回 true
		} // device 验证结束
	} // types 对象结束
}); // ValidatorFactory 类定义结束

return ValidatorFactory; // 返回 ValidatorFactory 类
