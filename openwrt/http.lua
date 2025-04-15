-- 版权声明：2008 Steven Barth <steven@midlink.org>
-- 版权声明：2010-2018 Jo-Philipp Wich <jo@mein.io>
-- 授权协议：代码遵循 Apache License 2.0 许可，允许公共使用

-- 导入 luci.util 模块，提供实用工具函数
local util  = require "luci.util"

-- 导入标准 Lua 的 coroutine 模块，支持协程操作
local coroutine = require "coroutine"

-- 导入标准 Lua 的 table 模块，用于表操作
local table = require "table"

-- 导入 lucihttp 模块，提供 HTTP 相关功能
local lhttp = require "lucihttp"

-- 导入 nixio 模块，提供 Linux I/O 操作接口
local nixio = require "nixio"

-- 导入 luci.ltn12 模块，提供 LTN12 数据传输工具
local ltn12 = require "luci.ltn12"

-- 导入常用的 Lua 函数到本地变量，提升访问效率
local table, ipairs, pairs, type, tostring, tonumber, error =
	table, ipairs, pairs, type, tostring, tonumber, error

-- 定义 luci.http 模块
module "luci.http"

-- 定义最大内容大小，100 KB
HTTP_MAX_CONTENT      = 1024*100

-- 创建线程局部存储，存储 HTTP 请求上下文
context = util.threadlocal()

-- 定义 Request 类，用于处理 HTTP 请求
Request = util.class()

-- 定义 Request 类的初始化方法
-- 作用：初始化 HTTP 请求对象，设置输入源和错误输出
function Request.__init__(self, env, sourcein, sinkerr)
	-- 设置输入源
	self.input = sourcein
	-- 设置错误输出
	self.error = sinkerr

	-- 默认文件处理器为 nil，以支持 content 方法
	self.filehandler = nil

	-- 初始化 HTTP 消息表
	self.message = {
		-- 存储环境变量
		env = env,
		-- 存储请求头
		headers = {},
		-- 解析查询字符串为参数表
		params = urldecode_params(env.QUERY_STRING or "")
	}

	-- 标记是否已解析输入
	self.parsed_input = false
end

-- 定义方法 formvalue，获取表单参数
-- 作用：返回指定名称的表单参数值或全部参数
function Request.formvalue(self, name, noparse)
	-- 如果未指定不解析且未解析输入，执行解析
	if not noparse and not self.parsed_input then
		self:_parse_input()
	end

	-- 如果指定了名称，返回对应参数值
	if name then
		return self.message.params[name]
	-- 否则返回所有参数
	else
		return self.message.params
	end
end

-- 定义方法 formvaluetable，获取带前缀的表单参数表
-- 作用：返回以指定前缀开头的参数子集
function Request.formvaluetable(self, prefix)
	-- 初始化结果表
	local vals = {}
	-- 设置前缀格式
	prefix = prefix and prefix .. "." or "."

	-- 如果未解析输入，执行解析
	if not self.parsed_input then
		self:_parse_input()
	end

	-- 获取空键的参数
	local void = self.message.params[nil]
	-- 遍历所有参数
	for k, v in pairs(self.message.params) do
		-- 如果参数键以指定前缀开头
		if k:find(prefix, 1, true) == 1 then
			-- 存储去掉前缀后的键值对
			vals[k:sub(#prefix + 1)] = tostring(v)
		end
	end

	-- 返回参数子集
	return vals
end

-- 定义方法 content，获取请求体内容
-- 作用：返回解析后的请求体内容及长度
function Request.content(self)
	-- 如果未解析输入，执行解析
	if not self.parsed_input then
		self:_parse_input()
	end

	-- 返回内容和长度
	return self.message.content, self.message.content_length
end

-- 定义方法 getcookie，获取 Cookie 值
-- 作用：从 HTTP_COOKIE 中提取指定名称的 Cookie
function Request.getcookie(self, name)
	-- 从环境变量获取 Cookie 并解析
	return lhttp.header_attribute("cookie; " .. (self:getenv("HTTP_COOKIE") or ""), name)
end

-- 定义方法 getenv，获取环境变量
-- 作用：返回指定名称的环境变量或全部环境变量
function Request.getenv(self, name)
	-- 如果指定了名称，返回对应值
	if name then
		return self.message.env[name]
	-- 否则返回环境变量表
	else
		return self.message.env
	end
end

-- 定义方法 setfilehandler，设置文件处理器
-- 作用：设置处理上传文件的回调函数
function Request.setfilehandler(self, callback)
	-- 设置文件处理器
	self.filehandler = callback

	-- 如果尚未解析输入，直接返回
	if not self.parsed_input then
		return
	end

	-- 遍历已解析的参数，处理文件句柄
	local name, value
	for name, value in pairs(self.message.params) do
		-- 如果值是表（表示文件）
		if type(value) == "table" then
			-- 循环处理文件句柄
			while value.fd do
				-- 读取文件数据块
				local data = value.fd:read(1024)
				-- 判断是否为文件末尾
				local eof = (not data or data == "")

				-- 调用回调函数处理数据
				callback(value, data, eof)

				-- 如果是末尾，关闭文件句柄
				if eof then
					value.fd:close()
					value.fd = nil
				end
			end
		end
	end
end

-- 定义方法 _parse_input，解析请求输入
-- 作用：解析 HTTP 请求体并存储参数
function Request._parse_input(self)
	-- 调用解析函数处理请求体
	parse_message_body(
		self.input,
		self.message,
		self.filehandler
	)
	-- 标记已解析输入
	self.parsed_input = true
end

-- 定义函数 close，关闭 HTTP 响应
-- 作用：结束响应头输出并关闭连接
function close()
	-- 如果未发送响应头
	if not context.eoh then
		-- 标记已发送响应头
		context.eoh = true
		-- 触发协程 yield，发送结束响应头信号
		coroutine.yield(3)
	end

	-- 如果未关闭连接
	if not context.closed then
		-- 标记连接已关闭
		context.closed = true
		-- 触发协程 yield，发送关闭连接信号
		coroutine.yield(5)
	end
end

-- 定义函数 content，获取当前请求内容
-- 作用：调用上下文请求对象的 content 方法
function content()
	return context.request:content()
end

-- 定义函数 formvalue，获取当前请求的表单参数
-- 作用：调用上下文请求对象的 formvalue 方法
function formvalue(name, noparse)
	return context.request:formvalue(name, noparse)
end

-- 定义函数 formvaluetable，获取当前请求的表单参数子集
-- 作用：调用上下文请求对象的 formvaluetable 方法
function formvaluetable(prefix)
	return context.request:formvaluetable(prefix)
end

-- 定义函数 getcookie，获取当前请求的 Cookie
-- 作用：调用上下文请求对象的 getcookie 方法
function getcookie(name)
	return context.request:getcookie(name)
end

-- 定义函数 getenv，获取当前请求的环境变量
-- 作用：调用上下文请求对象的 getenv 方法
function getenv(name)
	return context.request:getenv(name)
end

-- 定义函数 setfilehandler，设置当前请求的文件处理器
-- 作用：调用上下文请求对象的 setfilehandler 方法
function setfilehandler(callback)
	return context.request:setfilehandler(callback)
end

-- 定义函数 header，设置响应头
-- 作用：添加或更新 HTTP 响应头
function header(key, value)
	-- 如果上下文未初始化 headers 表
	if not context.headers then
		-- 创建 headers 表
		context.headers = {}
	end
	-- 存储小写键的响应头
	context.headers[key:lower()] = value
	-- 触发协程 yield，发送响应头
	coroutine.yield(2, key, value)
end

-- 定义函数 prepare_content，设置内容类型
-- 作用：根据 MIME 类型设置响应内容类型
function prepare_content(mime)
	-- 如果未设置内容类型
	if not context.headers or not context.headers["content-type"] then
		-- 如果是 XHTML 类型
		if mime == "application/xhtml+xml" then
			-- 检查客户端是否接受 XHTML
			if not getenv("HTTP_ACCEPT") or
				not getenv("HTTP_ACCEPT"):find("application/xhtml+xml", nil, true) then
				-- 回退到 HTML 类型
				mime = "text/html; charset=UTF-8"
			end
			-- 设置 Vary 头
			header("Vary", "Accept")
		end
		-- 设置内容类型头
		header("Content-Type", mime)
	end
end

-- 定义函数 source，获取请求输入源
-- 作用：返回上下文请求的输入源
function source()
	return context.request.input
end

-- 定义函数 status，设置响应状态
-- 作用：设置 HTTP 响应状态码和消息
function status(code, message)
	-- 设置默认状态码和消息
	code = code or 200
	message = message or "OK"
	-- 存储状态码
	context.status = code
	-- 触发协程 yield，发送状态
	coroutine.yield(1, code, message)
end

-- 定义函数 write，写入响应内容
-- 作用：作为 LTN12 sink，写入响应数据
function write(content, src_err)
	-- 如果内容为空
	if not content then
		-- 如果有错误，抛出异常
		if src_err then
			error(src_err)
		else
			-- 关闭响应
			close()
		end
		return true
	-- 如果内容长度为 0，直接返回
	elseif #content == 0 then
		return true
	else
		-- 如果未发送响应头
		if not context.eoh then
			-- 如果未设置状态，发送默认状态
			if not context.status then
				status()
			end
			-- 如果未设置内容类型，设置默认值
			if not context.headers or not context.headers["content-type"] then
				header("Content-Type", "text/html; charset=utf-8")
			end
			-- 设置默认缓存控制头
			if not context.headers["cache-control"] then
				header("Cache-Control", "no-cache")
				header("Expires", "0")
			end
			-- 设置默认安全头
			if not context.headers["x-frame-options"] then
				header("X-Frame-Options", "SAMEORIGIN")
			end
			if not context.headers["x-xss-protection"] then
				header("X-XSS-Protection", "1; mode=block")
			end
			if not context.headers["x-content-type-options"] then
				header("X-Content-Type-Options", "nosniff")
			end

			-- 标记已发送响应头
			context.eoh = true
			-- 触发协程 yield，发送结束响应头信号
			coroutine.yield(3)
		end
		-- 触发协程 yield，发送内容
		coroutine.yield(4, content)
		return true
	end
end

-- 定义函数 splice，拼接文件内容
-- 作用：将文件内容直接发送到响应
function splice(fd, size)
	-- 触发协程 yield，发送文件内容
	coroutine.yield(6, fd, size)
end

-- 定义函数 redirect，设置重定向
-- 作用：发送 302 重定向响应
function redirect(url)
	-- 如果 URL 为空，设置为根路径
	if url == "" then url = "/" end
	-- 设置重定向状态
	status(302, "Found")
	-- 设置 Location 头
	header("Location", url)
	-- 关闭响应
	close()
end

-- 定义函数 build_querystring，构建查询字符串
-- 作用：将参数表转换为 URL 查询字符串
function build_querystring(q)
	-- 初始化结果表和计数器
	local s, n, k, v = {}, 1, nil, nil

	-- 遍历参数表
	for k, v in pairs(q) do
		-- 添加分隔符
		s[n+0] = (n == 1) and "?" or "&"
		-- 编码键
		s[n+1] = util.urlencode(k)
		-- 添加等号
		s[n+2] = "="
		-- 编码值
		s[n+3] = util.urlencode(v)
		-- 更新计数器
		n = n + 4
	end

	-- 拼接并返回查询字符串
	return table.concat(s, "")
end

-- 定义 urldecode 函数，引用 util.urldecode
urldecode = util.urldecode

-- 定义 urlencode 函数，引用 util.urlencode
urlencode = util.urlencode

-- 定义函数 write_json，序列化并写入 JSON 数据
-- 作用：将数据序列化为 JSON 并写入响应
function write_json(x)
	-- 使用 util.serialize_json 序列化并写入
	util.serialize_json(x, write)
end

-- 定义函数 urldecode_params，解析 URL 参数
-- 作用：从 URL 或字符串解析 URL 解码后的参数表
function urldecode_params(url, tbl)
	-- 初始化参数表
	local parser, name
	local params = tbl or { }

	-- 创建 URL 编码解析器
	parser = lhttp.urlencoded_parser(function (what, buffer, length)
		-- 处理参数元组开始
		if what == parser.TUPLE then
			name, value = nil, nil
		-- 处理参数名称
		elseif what == parser.NAME then
			name = lhttp.urldecode(buffer)
		-- 处理参数值
		elseif what == parser.VALUE and name then
			params[name] = lhttp.urldecode(buffer) or ""
		end

		return true
	end)

	-- 如果解析器创建成功
	if parser then
		-- 解析 URL 的查询部分
		parser:parse((url or ""):match("[^?]*$"))
		-- 结束解析
		parser:parse(nil)
	end

	-- 返回解析后的参数表
	return params
end

-- 定义函数 urlencode_params，编码参数为查询字符串
-- 作用：将参数表编码为 URL 查询字符串
function urlencode_params(tbl)
	-- 初始化结果表和计数器
	local k, v
	local n, enc = 1, {}
	-- 遍历参数表
	for k, v in pairs(tbl) do
		-- 如果值是表
		if type(v) == "table" then
			-- 遍历表中的值
			local i, v2
			for i, v2 in ipairs(v) do
				-- 添加分隔符
				if enc[1] then
					enc[n] = "&"
					n = n + 1
				end

				-- 编码键值对
				enc[n+0] = lhttp.urlencode(k)
				enc[n+1] = "="
				enc[n+2] = lhttp.urlencode(v2)
				n = n + 3
			end
		else
			-- 添加分隔符
			if enc[1] then
				enc[n] = "&"
				n = n + 1
			end

			-- 编码键值对
			enc[n+0] = lhttp.urlencode(k)
			enc[n+1] = "="
			enc[n+2] = lhttp.urlencode(v)
			n = n + 3
		end
	end

	-- 拼接并返回查询字符串
	return table.concat(enc, "")
end

-- 定义函数 mimedecode_message_body，解析 MIME 请求体
-- 作用：解析 multipart/form-data 请求体，存储参数或调用文件回调
function mimedecode_message_body(src, msg, file_cb)
	-- 初始化解析器和变量
	local parser, header, field
	local len, maxlen = 0, tonumber(msg.env.CONTENT_LENGTH or nil)

	-- 创建 multipart 解析器
	parser, err = lhttp.multipart_parser(msg.env.CONTENT_TYPE, function (what, buffer, length)
		-- 处理部分初始化
		if what == parser.PART_INIT then
			field = { }

		-- 处理头名称
		elseif what == parser.HEADER_NAME then
			header = buffer:lower()

		-- 处理头值
		elseif what == parser.HEADER_VALUE and header then
			-- 处理 content-disposition 头
			if header:lower() == "content-disposition" and
				lhttp.header_attribute(buffer, nil) == "form-data"
			then
				-- 提取名称和文件名
				field.name = lhttp.header_attribute(buffer, "name")
				field.file = lhttp.header_attribute(buffer, "filename")
				field[1] = field.file
			end

			-- 存储头信息
			if field.headers then
				field.headers[header] = buffer
			else
				field.headers = { [header] = buffer }
			end

		-- 处理部分开始
		elseif what == parser.PART_BEGIN then
			return not field.file

		-- 处理部分数据
		elseif what == parser.PART_DATA and field.name and length > 0 then
			-- 如果是文件
			if field.file then
				-- 如果有文件回调
				if file_cb then
					-- 调用回调处理数据
					file_cb(field, buffer, false)
					msg.params[field.name] = msg.params[field.name] or field
				else
					-- 创建临时文件
					if not field.fd then
						field.fd = nixio.mkstemp(field.name)
					end

					-- 写入数据到临时文件
					if field.fd then
						field.fd:write(buffer)
						msg.params[field.name] = msg.params[field.name] or field
					end
				end
			else
				-- 存储普通参数值
				field.value = buffer
			end

		-- 处理部分结束
		elseif what == parser.PART_END and field.name then
			-- 如果是文件参数
			if field.file and msg.params[field.name] then
				-- 调用文件回调或重置文件句柄
				if file_cb then
					file_cb(field, "", true)
				elseif field.fd then
					field.fd:seek(0, "set")
				end
			else
				-- 处理普通参数
				local val = msg.params[field.name]

				if type(val) == "table" then
					-- 添加到参数表
					val[#val+1] = field.value or ""
				elseif val ~= nil then
					-- 转换为表存储多个值
					msg.params[field.name] = { val, field.value or "" }
				else
					-- 存储单个值
					msg.params[field.name] = field.value or ""
				end
			end

			-- 清空字段
			field = nil

		-- 处理错误
		elseif what == parser.ERROR then
			err = buffer
		end

		return true
	end, HTTP_MAX_CONTENT)

	-- 泵送数据到解析器
	return ltn12.pump.all(src, function (chunk)
		-- 更新数据长度
		len = len + (chunk and #chunk or 0)

		-- 检查是否超过内容长度
		if maxlen and len > maxlen + 2 then
			return nil, "Message body size exceeds Content-Length"
		end

		-- 如果解析失败，返回错误
		if not parser or not parser:parse(chunk) then
			return nil, err
		end

		return true
	end)
end

-- 定义函数 urldecode_message_body，解析 URL 编码请求体
-- 作用：解析 application/x-www-form-urlencoded 请求体
function urldecode_message_body(src, msg)
	-- 初始化解析器和变量
	local err, name, value, parser
	local len, maxlen = 0, tonumber(msg.env.CONTENT_LENGTH or nil)

	-- 创建 URL 编码解析器
	parser = lhttp.urlencoded_parser(function (what, buffer, length)
		-- 处理元组开始
		if what == parser.TUPLE then
			name, value = nil, nil
		-- 处理参数名称
		elseif what == parser.NAME then
			name = lhttp.urldecode(buffer, lhttp.DECODE_PLUS)
		-- 处理参数值
		elseif what == parser.VALUE and name then
			-- 获取当前参数值
			local val = msg.params[name]

			-- 如果是表，追加值
			if type(val) == "table" then
				val[#val+1] = lhttp.urldecode(buffer, lhttp.DECODE_PLUS) or ""
			-- 如果已有值，转换为表
			elseif val ~= nil then
				msg.params[name] = { val, lhttp.urldecode(buffer, lhttp.DECODE_PLUS) or "" }
			-- 存储单个值
			else
				msg.params[name] = lhttp.urldecode(buffer, lhttp.DECODE_PLUS) or ""
			end
		-- 处理错误
		elseif what == parser.ERROR then
			err = buffer
		end

		return true
	end, HTTP_MAX_CONTENT)

	-- 泵送数据到解析器
	return ltn12.pump.all(src, function (chunk)
		-- 更新数据长度
		len = len + (chunk and #chunk or 0)

		-- 检查是否超过内容长度
		if maxlen and len > maxlen + 2 then
			return nil, "Message body size exceeds Content-Length"
		-- 检查是否超过最大允许长度
		elseif len > HTTP_MAX_CONTENT then
			return nil, "Message body size exceeds maximum allowed length"
		end

		-- 如果解析失败，返回错误
		if not parser or not parser:parse(chunk) then
			return nil, err
		end

		return true
	end)
end

-- 定义函数 parse_message_body，解析请求体
-- 作用：根据内容类型选择合适的解码器解析请求体
function parse_message_body(src, msg, filecb)
	-- 如果存在内容长度或请求方法是 POST
	if msg.env.CONTENT_LENGTH or msg.env.REQUEST_METHOD == "POST" then
		-- 获取内容类型
		local ctype = lhttp.header_attribute(msg.env.CONTENT_TYPE, nil)

		-- 如果是 multipart/form-data
		if ctype == "multipart/form-data" then
			-- 解析 multipart 请求体
			return mimedecode_message_body(src, msg, filecb)

		-- 如果是 application/x-www-form-urlencoded
		elseif ctype == "application/x-www-form-urlencoded" then
			-- 解析 URL 编码请求体
			return urldecode_message_body(src, msg)
		end

		-- 处理未知编码
		local sink

		-- 如果提供了文件回调
		if type(filecb) == "function" then
			-- 创建元数据
			local meta = {
				name = "raw",
				encoding = msg.env.CONTENT_TYPE
			}
			-- 定义 sink 函数
			sink = function( chunk )
				if chunk then
					-- 调用回调处理数据
					return filecb(meta, chunk, false)
				else
					-- 调用回调处理结束
					return filecb(meta, nil, true)
				end
			end
		-- 否则存储到内容字段
		else
			-- 初始化内容字段
			msg.content = ""
			msg.content_length = 0

			-- 定义 sink 函数
			sink = function( chunk )
				if chunk then
					-- 检查内容长度是否超限
					if ( msg.content_length + #chunk ) <= HTTP_MAX_CONTENT then
						-- 追加内容
						msg.content        = msg.content        .. chunk
						msg.content_length = msg.content_length + #chunk
						return true
					else
						return nil, "POST data exceeds maximum allowed length"
					end
				end
				return true
			end
		end

		-- 泵送数据
		while true do
			-- 执行数据泵送
			local ok, err = ltn12.pump.step( src, sink )

			-- 如果失败，返回错误
			if not ok and err then
				return nil, err
			-- 如果到达文件末尾，结束
			elseif not ok then
				return true
			end
		end

		return true
	end

	-- 如果无需解析，返回 false
	return false
end
