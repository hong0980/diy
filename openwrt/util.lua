-- 版权声明：2008 Steven Barth，作者邮箱 <steven@midlink.org>
-- 授权协议：代码遵循 Apache License 2.0 许可，允许公共使用

-- 导入标准 Lua 的 io 模块，用于文件和流操作
local io = require "io"

-- 导入标准 Lua 的 math 模块，提供数学运算函数
local math = require "math"

-- 导入标准 Lua 的 table 模块，用于表操作（如插入、连接）
local table = require "table"

-- 导入标准 Lua 的 debug 模块，提供调试功能
local debug = require "debug"

-- 导入 luci.debug 模块，提供 LuCI 特定的调试工具
local ldebug = require "luci.debug"

-- 导入标准 Lua 的 string 模块，提供字符串操作函数
local string = require "string"

-- 导入标准 Lua 的 coroutine 模块，支持协程操作
local coroutine = require "coroutine"

-- 导入 luci.template.parser 模块，用于模板解析
local tparser = require "luci.template.parser"

-- 导入 luci.jsonc 模块，用于 JSON 数据处理
local json = require "luci.jsonc"

-- 导入 lucihttp 模块，提供 HTTP 相关功能（如 URL 编码）
local lhttp = require "lucihttp"

-- 导入 ubus 模块，用于与 ubus 系统交互
local _ubus = require "ubus"

-- 定义全局变量 _ubus_connection，用于存储 ubus 连接对象，初始为 nil
local _ubus_connection = nil

-- 导入常用的 Lua 函数到本地变量，提升访问效率
local getmetatable, setmetatable = getmetatable, setmetatable

-- 导入原始表操作和参数处理函数
local rawget, rawset, unpack, select = rawget, rawset, unpack, select

-- 导入类型转换和错误处理函数
local tostring, type, assert, error = tostring, type, assert, error

-- 导入迭代和动态代码加载函数
local ipairs, pairs, next, loadstring = ipairs, pairs, next, loadstring

-- 导入安全调用函数
local require, pcall, xpcall = require, pcall, xpcall

-- 导入垃圾回收和内存限制函数
local collectgarbage, get_memory_limit = collectgarbage, get_memory_limit

-- 定义 LuCI 工具模块
module "luci.util"

--
-- Pythonic 字符串格式化扩展
--

-- 为字符串的元表添加 __mod 方法，支持 Python 风格的字符串格式化
getmetatable("").__mod = function(a, b)
	-- 定义局部变量，存储调用结果
	local ok, res

	-- 如果没有参数 b，直接返回字符串 a
	if not b then
		return a
	-- 如果 b 是表
	elseif type(b) == "table" then
		-- 遍历表 b，将所有 userdata 类型的值转换为字符串
		local k, _
		for k, _ in pairs(b) do 
			if type(b[k]) == "userdata" then 
				b[k] = tostring(b[k]) 
			end 
		end

		-- 使用 pcall 安全调用字符串的 format 方法
		ok, res = pcall(a.format, a, unpack(b))
		-- 如果调用失败，抛出错误
		if not ok then
			error(res, 2)
		end
		-- 返回格式化结果
		return res
	-- 如果 b 是其他类型
	else
		-- 如果 b 是 userdata 类型，转换为字符串
		if type(b) == "userdata" then 
			b = tostring(b) 
		end

		-- 使用 pcall 安全调用字符串的 format 方法
		ok, res = pcall(a.format, a, b)
		-- 如果调用失败，抛出错误
		if not ok then
			error(res, 2)
		end
		-- 返回格式化结果
		return res
	end
end


--
-- 类辅助函数
--

-- 定义内部函数 _instantiate，用于实例化类
-- 作用：创建类的实例并调用其 __init__ 方法
local function _instantiate(class, ...)
	-- 创建新表，并设置元表指向类
	local inst = setmetatable({}, {__index = class})

	-- 如果类定义了 __init__ 方法，调用它并传递参数
	if inst.__init__ then
		inst:__init__(...)
	end

	-- 返回创建的实例
	return inst
end

-- 定义函数 class，创建类对象
-- 作用：创建可实例化的类，支持继承和初始化
function class(base)
	-- 返回新表，设置元表以支持调用和继承
	return setmetatable({}, {
		-- 设置 __call 元方法，支持类调用以实例化
		__call  = _instantiate,
		-- 设置 __index 元方法，支持从基类继承
		__index = base
	})
end

-- 定义函数 instanceof，检查对象是否为类的实例
-- 作用：判断对象是否属于指定类或其子类
function instanceof(object, class)
	-- 获取对象的元表
	local meta = getmetatable(object)
	-- 遍历元表链，检查是否匹配指定类
	while meta and meta.__index do
		if meta.__index == class then
			-- 如果匹配，返回 true
			return true
		end
		-- 继续检查基类的元表
		meta = getmetatable(meta.__index)
	end
	-- 如果未找到匹配，返回 false
	return false
end


--
-- 作用域操作函数
--

-- 定义 coxpt 表，存储协程相关数据，弱表模式（键值弱引用）
coxpt = setmetatable({}, { __mode = "kv" })

-- 定义线程局部存储的元表
local tl_meta = {
	-- 设置弱键模式，仅对键生效
	__mode = "k",

	-- 定义 __index 元方法，用于获取值
	__index = function(self, key)
		-- 获取当前协程的存储表
		local t = rawget(self, coxpt[coroutine.running()] 
			or coroutine.running() or 0)
		-- 返回存储表中对应的键值
		return t and t[key]
	end,

	-- 定义 __newindex 元方法，用于设置值
	__newindex = function(self, key, value)
		-- 获取当前协程的标识
		local c = coxpt[coroutine.running()] or coroutine.running() or 0
		-- 获取当前协程的存储表
		local r = rawget(self, c)
		-- 如果存储表不存在，创建新表
		if not r then
			rawset(self, c, { [key] = value })
		else
			-- 否则直接设置键值
			r[key] = value
		end
	end
}

-- 定义函数 threadlocal，创建线程局部存储
-- 作用：为当前协程创建私有的键值存储
function threadlocal(tbl)
	-- 为传入表（或新表）设置线程局部存储元表
	return setmetatable(tbl or {}, tl_meta)
end


--
-- 调试函数
--

-- 定义函数 perror，输出错误信息到标准错误流
-- 作用：将对象转换为字符串并输出到标准错误流
function perror(obj)
	-- 将对象转换为字符串，附加换行符后写入标准错误流
	return io.stderr:write(tostring(obj) .. "\n")
end

-- 定义函数 dumptable，递归打印表内容
-- 作用：以缩进格式打印表的所有键值对，支持最大深度限制
function dumptable(t, maxdepth, i, seen)
	-- 初始化缩进级别，默认为 0
	i = i or 0
	-- 初始化已访问表集合，防止循环引用
	seen = seen or setmetatable({}, {__mode="k"})

	-- 遍历表的所有键值对
	for k,v in pairs(t) do
		-- 打印当前键值对，带缩进
		perror(string.rep("\t", i) .. tostring(k) .. "\t" .. tostring(v))
		-- 如果值是表且未达到最大深度
		if type(v) == "table" and (not maxdepth or i < maxdepth) then
			-- 检查是否已访问，防止循环引用
			if not seen[v] then
				-- 标记为已访问
				seen[v] = true
				-- 递归打印子表
				dumptable(v, maxdepth, i+1, seen)
			else
				-- 如果是循环引用，打印提示
				perror(string.rep("\t", i) .. "*** RECURSION ***")
			end
		end
	end
end


--
-- 字符串和数据操作函数
--

-- 定义函数 pcdata，兼容性包装器，用于 XML 数据处理（已废弃）
-- 作用：将值转换为安全的 XML 文本内容
function pcdata(value)
	-- 导入 luci.xml 模块
	local xml = require "luci.xml"

	-- 打印警告，提示函数已废弃
	perror("luci.util.pcdata() has been replaced by luci.xml.pcdata() - Please update your code.")
	-- 调用 luci.xml.pcdata 处理值
	return xml.pcdata(value)
end

-- 定义函数 urlencode，编码 URL 参数
-- 作用：将值转换为 URL 安全的字符串
function urlencode(value)
	-- 检查值是否非空
	if value ~= nil then
		-- 将值转换为字符串
		local str = tostring(value)
		-- 使用 lucihttp 模块进行 URL 编码
		return lhttp.urlencode(str, lhttp.ENCODE_IF_NEEDED + lhttp.ENCODE_FULL)
			-- 如果编码失败，返回原字符串
			or str
	end
	-- 如果值为空，返回 nil
	return nil
end

-- 定义函数 urldecode，解码 URL 参数
-- 作用：将 URL 编码的字符串解码为原始值
function urldecode(value, decode_plus)
	-- 检查值是否非空
	if value ~= nil then
		-- 根据 decode_plus 参数设置解码标志
		local flag = decode_plus and lhttp.DECODE_PLUS or 0
		-- 将值转换为字符串
		local str = tostring(value)
		-- 使用 lucihttp 模块进行 URL 解码
		return lhttp.urldecode(str, lhttp.DECODE_IF_NEEDED + flag)
			-- 如果解码失败，返回原字符串
			or str
	end
	-- 如果值为空，返回 nil
	return nil
end

-- 定义函数 striptags，兼容性包装器，用于去除 XML/HTML 标签（已废弃）
-- 作用：从字符串中去除 XML/HTML 标签
function striptags(value)
	-- 导入 luci.xml 模块
	local xml = require "luci.xml"

	-- 打印警告，提示函数已废弃
	perror("luci.util.striptags() has been replaced by luci.xml.striptags() - Please update your code.")
	-- 调用 luci.xml.striptags 处理值
	return xml.striptags(value)
end

-- 定义函数 shellquote，为 shell 命令转义字符串
-- 作用：将字符串包装为安全的 shell 单引号字符串
function shellquote(value)
	-- 使用单引号包装字符串，并转义内部单引号
	return string.format("'%s'", string.gsub(value or "", "'", "'\\''"))
end

-- 定义函数 shellsqescape，为 shell 单引号字符串转义
-- 作用：转义字符串中的单引号，确保在 shell 中安全
function shellsqescape(value)
	-- 替换字符串中的单引号为转义形式
	local res
	res, _ = string.gsub(value, "'", "'\\''")
	-- 返回转义后的字符串
	return res
end

-- 定义函数 shellstartsqescape，转义 shell 命令开头的单引号和连字符
-- 作用：处理命令行参数开头的连字符（-），确保 shell 正确解析
function shellstartsqescape(value)
	-- 替换字符串开头的连字符为转义形式
	res, _ = string.gsub(value, "^%-", "\\-")
	-- 调用 shellsqescape 进一步转义单引号
	return shellsqescape(res)
end

-- 定义函数 split，分割字符串
-- 作用：根据分隔符将字符串分割为子字符串列表
function split(str, pat, max, regex)
	-- 设置默认分隔符为换行符
	pat = pat or "\n"
	-- 设置最大处理字节数为字符串长度
	max = max or #str

	-- 初始化结果表
	local t = {}
	-- 初始化当前字符位置
	local c = 1

	-- 如果字符串为空，返回单元素表
	if #str == 0 then
		return {""}
	end

	-- 如果分隔符为空，返回 nil
	if #pat == 0 then
		return nil
	end

	-- 如果最大字节数为 0，返回原字符串
	if max == 0 then
		return str
	end

	-- 循环查找分隔符并分割字符串
	repeat
		-- 查找分隔符的起始和结束位置
		local s, e = str:find(pat, c, not regex)
		-- 减少剩余最大字节数
		max = max - 1
		-- 如果找到分隔符但超过最大字节数
		if s and max < 0 then
			-- 添加剩余字符串
			t[#t+1] = str:sub(c)
		else
			-- 添加当前子字符串
			t[#t+1] = str:sub(c, s and s - 1)
		end
		-- 更新当前位置
		c = e and e + 1 or #str + 1
	-- 直到未找到分隔符或超过最大字节数
	until not s or max < 0

	-- 返回子字符串列表
	return t
end

-- 定义函数 trim，去除字符串两端的空白字符
-- 作用：去除字符串首尾的空格、制表符等空白字符
function trim(str)
	-- 使用正则表达式匹配并提取非空白内容
	return (str:gsub("^%s*(.-)%s*$", "%1"))
end

-- 定义函数 cmatch，统计字符串中模式匹配的次数
-- 作用：计算字符串中匹配指定模式的次数
function cmatch(str, pat)
	-- 初始化计数器
	local count = 0
	-- 遍历匹配模式，增加计数
	for _ in str:gmatch(pat) do count = count + 1 end
	-- 返回匹配次数
	return count
end

-- 定义函数 imatch，创建字符串或表的迭代器
-- 作用：为字符串或表生成按令牌或元素迭代的函数
function imatch(v)
	-- 如果输入是表
	if type(v) == "table" then
		-- 初始化键为 nil
		local k = nil
		-- 返回迭代器函数
		return function()
			-- 获取下一个键值对
			k = next(v, k)
			-- 返回值
			return v[k]
		end

	-- 如果输入是数字或布尔值
	elseif type(v) == "number" or type(v) == "boolean" then
		-- 初始化标志
		local x = true
		-- 返回迭代器函数
		return function()
			-- 第一次调用返回值，之后返回 nil
			if x then
				x = false
				return tostring(v)
			end
		end

	-- 如果输入是 userdata 或字符串
	elseif type(v) == "userdata" or type(v) == "string" then
		-- 返回按非空白字符分割的迭代器
		return tostring(v):gmatch("%S+")
	end

	-- 默认返回空迭代器
	return function() end
end

-- 定义函数 parse_units，解析带单位的字符串
-- 作用：将带单位的字符串（如 "2kb"）转换为数值
function parse_units(ustr)
	-- 初始化结果值
	local val = 0

	-- 定义单位映射表
	local map = {
		-- 时间单位
		y   = 60 * 60 * 24 * 366, -- 年
		m   = 60 * 60 * 24 * 31,  -- 月
		w   = 60 * 60 * 24 * 7,   -- 周
		d   = 60 * 60 * 24,       -- 天
		h   = 60 * 60,            -- 小时
		min = 60,                 -- 分钟

		-- 存储单位
		kb  = 1024,               -- 千字节
		mb  = 1024 * 1024,        -- 兆字节
		gb  = 1024 * 1024 * 1024, -- 吉字节

		-- SI 存储单位
		kib = 1000,               -- 千字节
		mib = 1000 * 1000,        -- 兆字节
		gib = 1000 * 1000 * 1000  -- 吉字节
	}

	-- 遍历字符串中的数字和单位
	for spec in ustr:lower():gmatch("[0-9%.]+[a-zA-Z]*") do
		-- 提取数字部分
		local num = spec:gsub("[^0-9%.]+$","")
		-- 提取单位部分
		local spn = spec:gsub("^[0-9%.]+", "")

		-- 如果单位存在于映射表中
		if map[spn] or map[spn:sub(1,1)] then
			-- 计算并累加值
			val = val + num * ( map[spn] or map[spn:sub(1,1)] )
		else
			-- 直接累加数字
			val = val + num
		end
	end

	-- 返回解析结果
	return val
end

-- 将上述字符串操作函数注册到 string 类
string.split       = split
string.trim        = trim
string.cmatch      = cmatch
string.parse_units = parse_units


-- 定义函数 append，向表追加元素
-- 作用：将多个值或表追加到目标表
function append(src, ...)
	-- 遍历所有参数
	for i, a in ipairs({...}) do
		-- 如果参数是表
		if type(a) == "table" then
			-- 遍历表并追加每个元素
			for j, v in ipairs(a) do
				src[#src+1] = v
			end
		else
			-- 直接追加参数
			src[#src+1] = a
		end
	end
	-- 返回修改后的表
	return src
end

-- 定义函数 combine，合并多个值或表
-- 作用：创建新表并追加所有参数
function combine(...)
	-- 调用 append 创建新表并追加参数
	return append({}, ...)
end

-- 定义函数 contains，检查表中是否包含值
-- 作用：查找表中是否存在指定值，返回键或 false
function contains(table, value)
	-- 遍历表的所有键值对
	for k, v in pairs(table) do
		-- 如果值匹配
		if value == v then
			-- 返回对应的键
			return k
		end
	end
	-- 如果未找到，返回 false
	return false
end

-- 定义函数 update，更新表内容
-- 作用：将更新表中的键值对合并到目标表
function update(t, updates)
	-- 遍历更新表的所有键值对
	for k, v in pairs(updates) do
		-- 更新目标表
		t[k] = v
	end
end

-- 定义函数 keys，获取表的所有键
-- 作用：返回表的所有键的列表
function keys(t)
	-- 初始化键列表
	local keys = { }
	-- 如果表存在
	if t then
		-- 遍历表的所有键
		for k, _ in kspairs(t) do
			-- 添加键到列表
			keys[#keys+1] = k
		end
	end
	-- 返回键列表
	return keys
end

-- 定义函数 clone，克隆表
-- 作用：创建表的副本，支持深拷贝
function clone(object, deep)
	-- 初始化副本表
	local copy = {}

	-- 遍历原始表的所有键值对
	for k, v in pairs(object) do
		-- 如果需要深拷贝且值是表
		if deep and type(v) == "table" then
			-- 递归克隆子表
			v = clone(v, deep)
		end
		-- 设置副本表的键值
		copy[k] = v
	end

	-- 设置副本表的元表
	return setmetatable(copy, getmetatable(object))
end


-- 定义内部函数 _serialize_table，序列化表内容
-- 作用：将表转换为可执行的 Lua 字符串
function _serialize_table(t, seen)
	-- 断言不存在循环引用
	assert(not seen[t], "Recursion detected.")
	-- 标记表为已访问
	seen[t] = true

	-- 初始化数据字符串
	local data  = ""
	-- 初始化索引数据字符串
	local idata = ""
	-- 初始化索引长度
	local ilen  = 0

	-- 遍历表的所有键值对
	for k, v in pairs(t) do
		-- 如果键不是有效数字索引
		if type(k) ~= "number" or k < 1 or math.floor(k) ~= k or ( k - #t ) > 3 then
			-- 序列化键和值
			k = serialize_data(k, seen)
			v = serialize_data(v, seen)
			-- 添加到数据字符串
			data = data .. ( #data > 0 and ", " or "" ) ..
				'[' .. k .. '] = ' .. v
		-- 如果键是有效索引
		elseif k > ilen then
			-- 更新最大索引
			ilen = k
		end
	end

	-- 处理数字索引
	for i = 1, ilen do
		-- 序列化值
		local v = serialize_data(t[i], seen)
		-- 添加到索引数据字符串
		idata = idata .. ( #idata > 0 and ", " or "" ) .. v
	end

	-- 返回合并的序列化字符串
	return idata .. ( #data > 0 and #idata > 0 and ", " or "" ) .. data
end

-- 定义函数 serialize_data，序列化数据
-- 作用：将任意 Lua 数据类型转换为可执行的 Lua 字符串
function serialize_data(val, seen)
	-- 初始化已访问表集合
	seen = seen or setmetatable({}, {__mode="k"})

	-- 根据值类型进行序列化
	if val == nil then
		return "nil"
	elseif type(val) == "number" then
		return val
	elseif type(val) == "string" then
		return "%q" % val
	elseif type(val) == "boolean" then
		return val and "true" or "false"
	elseif type(val) == "function" then
		return "loadstring(%q)" % get_bytecode(val)
	elseif type(val) == "table" then
		return "{ " .. _serialize_table(val, seen) .. " }"
	else
		return '"[unhandled data type:' .. type(val) .. ']"'
	end
end

-- 定义函数 restore_data，反序列化数据
-- 作用：将序列化的 Lua 字符串还原为原始数据
function restore_data(str)
	-- 使用 loadstring 执行字符串并返回结果
	return loadstring("return " .. str)()
end


--
-- 字节码操作函数
--

-- 定义函数 get_bytecode，获取函数或数据的字节码
-- 作用：将函数或数据转换为 Lua 字节码字符串
function get_bytecode(val)
	-- 定义局部变量存储字节码
	local code

	-- 如果值是函数
	if type(val) == "function" then
		-- 直接获取函数字节码
		code = string.dump(val)
	else
		-- 序列化数据并获取字节码
		code = string.dump( loadstring( "return " .. serialize_data(val) ) )
	end

	-- 返回字节码
	return code -- and strip_bytecode(code)
end

-- 定义函数 strip_bytecode，剥离字节码中的调试信息
-- 作用：移除字节码中的调试信息和行号
function strip_bytecode(code)
	-- 解析字节码头部信息
	local version, format, endian, int, size, ins, num, lnum = code:byte(5, 12)
	-- 定义子整数解析函数
	local subint
	-- 根据字节序选择解析方式
	if endian == 1 then
		-- 小端序
		subint = function(code, i, l)
			local val = 0
			for n = l, 1, -1 do
				val = val * 256 + code:byte(i + n - 1)
			end
			return val, i + l
		end
	else
		-- 大端序
		subint = function(code, i, l)
			local val = 0
			for n = 1, l, 1 do
				val = val * 256 + code:byte(i + n - 1)
			end
			return val, i + l
		end
	end

	-- 定义内部函数 strip_function，剥离函数字节码
	local function strip_function(code)
		-- 解析字节码长度和偏移
		local count, offset = subint(code, 1, size)
		-- 初始化剥离后的字节码列表
		local stripped = { string.rep("\0", size) }
		-- 记录脏数据起始位置
		local dirty = offset + count
		-- 跳过头部信息
		offset = offset + count + int * 2 + 4
		-- 跳过指令部分
		offset = offset + int + subint(code, offset, int) * ins
		-- 解析常量数量
		count, offset = subint(code, offset, int)
		-- 遍历所有常量
		for n = 1, count do
			-- 获取常量类型
			local t
			t, offset = subint(code, offset, 1)
			-- 根据类型跳过相应字节
			if t == 1 then
				offset = offset + 1
			elseif t == 4 then
				offset = offset + size + subint(code, offset, size)
			elseif t == 3 then
				offset = offset + num
			elseif t == 254 or t == 9 then
				offset = offset + lnum
			end
		end
		-- 解析子函数数量
		count, offset = subint(code, offset, int)
		-- 添加当前字节码片段
		stripped[#stripped+1] = code:sub(dirty, offset - 1)
		-- 递归剥离子函数
		for n = 1, count do
			local proto, off = strip_function(code:sub(offset, -1))
			stripped[#stripped+1] = proto
			offset = offset + off - 1
		end
		-- 跳过局部变量信息
		offset = offset + subint(code, offset, int) * int + int
		-- 解析上值数量
		count, offset = subint(code, offset, int)
		-- 跳过上值信息
		for n = 1, count do
			offset = offset + subint(code, offset, size) + size + int * 2
		end
		-- 解析源信息
		count, offset = subint(code, offset, int)
		-- 跳过源信息
		for n = 1, count do
			offset = offset + subint(code, offset, size) + size
		end
		-- 添加尾部填充
		stripped[#stripped+1] = string.rep("\0", int * 3)
		-- 返回剥离后的字节码和偏移
		return table.concat(stripped), offset
	end

	-- 返回头部和剥离后的字节码
	return code:sub(1,12) .. strip_function(code:sub(13,-1))
end


--
-- 排序迭代函数
--

-- 定义内部函数 _sortiter，创建排序迭代器
-- 作用：为表创建按键排序的迭代器
function _sortiter( t, f )
	-- 初始化键列表
	local keys = { }

	-- 遍历表，收集所有键
	local k, v
	for k, v in pairs(t) do
		keys[#keys+1] = k
	end

	-- 初始化当前位置
	local _pos = 0

	-- 根据提供的排序函数对键排序
	table.sort( keys, f )

	-- 返回迭代器函数
	return function()
		-- 增加位置计数
		_pos = _pos + 1
		-- 如果未超出键列表
		if _pos <= #keys then
			-- 返回当前键、值和位置
			return keys[_pos], t[keys[_pos]], _pos
		end
	end
end

-- 定义函数 spairs，创建自定义排序迭代器
-- 作用：按自定义排序函数迭代表
function spairs(t,f)
	-- 调用 _sortiter 创建迭代器
	return _sortiter( t, f )
end

-- 定义函数 kspairs，创建按键排序迭代器
-- 作用：按键排序迭代表
function kspairs(t)
	-- 调用 _sortiter 创建默认排序迭代器
	return _sortiter( t )
end

-- 定义函数 vspairs，创建按值排序迭代器
-- 作用：按值排序迭代表
function vspairs(t)
	-- 调用 _sortiter，使用值比较函数
	return _sortiter( t, function (a,b) return t[a] < t[b] end )
end


--
-- 系统工具函数
--

-- 定义函数 bigendian，检查系统字节序
-- 作用：判断系统是否为大端字节序
function bigendian()
	-- 检查空函数字节码的第 7 字节
	return string.byte(string.dump(function() end), 7) == 0
end

-- 定义函数 exec，执行 shell 命令并返回输出
-- 作用：运行命令并捕获所有输出
function exec(command)
	-- 打开命令管道
	local pp   = io.popen(command)
	-- 读取所有输出
	local data = pp:read("*a")
	-- 关闭管道
	pp:close()

	-- 返回输出数据
	return data
end

-- 定义函数 execi，创建 shell 命令输出迭代器
-- 作用：逐行迭代命令输出
function execi(command)
	-- 打开命令管道
	local pp = io.popen(command)

	-- 返回迭代器函数
	return pp and function()
		-- 读取一行
		local line = pp:read()

		-- 如果没有更多行，关闭管道
		if not line then
			pp:close()
		end

		-- 返回当前行
		return line
	end
end

-- 定义函数 execl，执行 shell 命令并返回行列表（已废弃）
-- 作用：运行命令并将输出按行存储为表
function execl(command)
	-- 打开命令管道
	local pp   = io.popen(command)
	-- 初始化行变量
	local line = ""
	-- 初始化数据表
	local data = {}

	-- 逐行读取输出
	while true do
		line = pp:read()
		-- 如果没有更多行，退出循环
		if (line == nil) then break end
		-- 添加行到数据表
		data[#data+1] = line
	end
	-- 关闭管道
	pp:close()

	-- 返回行列表
	return data
end


-- 定义 ubus 错误代码表
local ubus_codes = {
	"INVALID_COMMAND",
	"INVALID_ARGUMENT",
	"METHOD_NOT_FOUND",
	"NOT_FOUND",
	"NO_DATA",
	"PERMISSION_DENIED",
	"TIMEOUT",
	"NOT_SUPPORTED",
	"UNKNOWN_ERROR",
	"CONNECTION_FAILED"
}

-- 定义内部函数 ubus_return，处理 ubus 调用返回值
-- 作用：格式化 ubus 调用结果，附加错误描述
local function ubus_return(...)
	-- 检查返回值数量
	if select('#', ...) == 2 then
		-- 获取返回值和错误代码
		local rv, err = select(1, ...), select(2, ...)
		-- 如果返回值为空且错误代码是数字
		if rv == nil and type(err) == "number" then
			-- 返回 nil、错误代码和错误描述
			return nil, err, ubus_codes[err]
		end
	end

	-- 返回原始参数
	return ...
end

-- 定义函数 ubus，调用 ubus 方法
-- 作用：与 ubus 系统交互，执行指定对象和方法
function ubus(object, method, data, path, timeout)
	-- 如果未建立 ubus 连接
	if not _ubus_connection then
		-- 创建新连接
		_ubus_connection = _ubus.connect(path, timeout)
		-- 断言连接成功
		assert(_ubus_connection, "Unable to establish ubus connection")
	end

	-- 如果指定了对象和方法
	if object and method then
		-- 确保数据是表
		if type(data) ~= "table" then
			data = { }
		end
		-- 调用 ubus 方法并返回结果
		return ubus_return(_ubus_connection:call(object, method, data))
	-- 如果仅指定了对象
	elseif object then
		-- 返回对象签名
		return _ubus_connection:signatures(object)
	else
		-- 返回所有对象
		return _ubus_connection:objects()
	end
end

-- 定义函数 serialize_json，序列化数据为 JSON
-- 作用：将 Lua 数据转换为 JSON 字符串
function serialize_json(x, cb)
	-- 使用 luci.jsonc 序列化数据
	local js = json.stringify(x)
	-- 如果提供回调函数
	if type(cb) == "function" then
		-- 调用回调并传递 JSON 字符串
		cb(js)
	else
		-- 直接返回 JSON 字符串
		return js
	end
end


-- 定义函数 libpath，获取库路径
-- 作用：返回 luci.debug 模块所在目录
function libpath()
	-- 使用 nixio.fs 获取模块文件目录
	return require "nixio.fs".dirname(ldebug.__file__)
end

-- 定义函数 checklib，检查可执行文件是否依赖指定库
-- 作用：验证可执行文件是否链接到指定动态库
function checklib(fullpathexe, wantedlib)
	-- 导入 nixio.fs 模块
	local fs = require "nixio.fs"
	-- 检查 ldd 命令是否存在
	local haveldd = fs.access('/usr/bin/ldd')
	-- 检查可执行文件是否存在
	local haveexe = fs.access(fullpathexe)
	-- 如果任一不存在，返回 false
	if not haveldd or not haveexe then
		return false
	end
	-- 执行 ldd 命令获取依赖库
	local libs = exec(string.format("/usr/bin/ldd %s", shellquote(fullpathexe)))
	-- 如果没有获取到库信息，返回 false
	if not libs then
		return false
	end
	-- 遍历 ldd 输出
	for k, v in ipairs(split(libs)) do
		-- 如果找到目标库
		if v:find(wantedlib) then
			-- 返回 true
			return true
		end
	end
	-- 如果未找到，返回 false
	return false
end

-------------------------------------------------------------------------------
-- 协程安全的 xpcall 和 pcall 版本
--
-- 作用：通过协程封装受保护调用，解决 Lua 5.x 中协程在 pcall/xpcall 中 yield 的问题
--
-- 作者：Roberto Ierusalimschy 和 Andre Carregal
-- 贡献者：Thomas Harning Jr., Ignacio Burgueño, Fabio Mascarenhas
--
-- 版权声明：2005 - Kepler Project
--
-------------------------------------------------------------------------------

-------------------------------------------------------------------------------
-- 实现协程安全的 xpcall
-------------------------------------------------------------------------------

-- 定义 coromap 表，存储协程映射，弱表模式
local coromap = setmetatable({}, { __mode = "k" })

-- 定义内部函数 handleReturnValue，处理协程返回值
-- 作用：处理协程执行的状态和返回值
local function handleReturnValue(err, co, status, ...)
	-- 如果执行失败
	if not status then
		-- 返回 false 和错误堆栈
		return false, err(debug.traceback(co, (...)), ...)
	end
	-- 如果协程暂停
	if coroutine.status(co) == 'suspended' then
		-- 继续执行协程
		return performResume(err, co, coroutine.yield(...))
	else
		-- 返回成功状态和结果
		return true, ...
	end
end

-- 定义函数 performResume，继续执行协程
-- 作用：恢复协程并处理返回值
function performResume(err, co, ...)
	-- 调用 handleReturnValue 处理恢复结果
	return handleReturnValue(err, co, coroutine.resume(co, ...))
end

-- 定义函数 id，身份函数
-- 作用：直接返回输入的跟踪信息
local function id(trace, ...)
	return trace
end

-- 定义函数 coxpcall，协程安全的 xpcall
-- 作用：支持协程的受保护调用，处理 yield 场景
function coxpcall(f, err, ...)
	-- 获取当前协程
	local current = coroutine.running()
	-- 如果不在协程中
	if not current then
		-- 如果错误处理函数是 id，使用 pcall
		if err == id then
			return pcall(f, ...)
		else
			-- 如果有参数，包装函数
			if select("#", ...) > 0 then
				local oldf, params = f, { ... }
				f = function() return oldf(unpack(params)) end
			end
			-- 使用 xpcall 执行
			return xpcall(f, err)
		end
	else
		-- 尝试创建协程
		local res, co = pcall(coroutine.create, f)
		-- 如果创建失败
		if not res then
			-- 创建新函数包装
			local newf = function(...) return f(...) end
			co = coroutine.create(newf)
		end
		-- 存储协程映射
		coromap[co] = current
		-- 设置协程局部存储
		coxpt[co] = coxpt[current] or current or 0
		-- 执行协程
		return performResume(err, co, ...)
	end
end

-- 定义函数 copcall，协程安全的 pcall
-- 作用：使用 coxpcall 实现协程安全的 pcall
function copcall(f, ...)
	-- 调用 coxpcall，传递 id 作为错误处理函数
	return coxpcall(f, id, ...)
end
