-- 版权声明：2008 Steven Barth，作者邮箱 <steven@midlink.org>
-- Copyright 2008 Steven Barth <steven@midlink.org>
-- 授权协议：代码遵循 Apache License 2.0 许可，允许公共使用
-- Licensed to the public under the Apache License 2.0.

-- 导入标准 Lua 的 os 模块，用于系统操作（如获取时间）
-- Import Lua's os module for system operations (e.g., getting time)
local os    = require "os"

-- 导入 luci.util 模块，提供实用工具函数（如 ubus 调用）
-- Import luci.util module for utility functions (e.g., ubus calls)
local util  = require "luci.util"

-- 导入标准 Lua 的 table 模块，用于表操作（如插入、连接）
-- Import Lua's table module for table operations (e.g., insert, concat)
local table = require "table"

-- 导入常用的 Lua 函数到本地变量，提升访问效率
-- Import commonly used Lua functions to local variables for efficiency
local setmetatable, rawget, rawset = setmetatable, rawget, rawset

-- 导入 require 函数，用于动态加载模块
-- Import require function for dynamic module loading
local require, getmetatable, assert = require, getmetatable, assert

-- 导入错误处理和迭代相关的 Lua 函数
-- Import error handling and iteration-related Lua functions
local error, pairs, ipairs, select = error, pairs, ipairs, select

-- 导入类型检查和转换相关的 Lua 函数
-- Import type checking and conversion-related Lua functions
local type, tostring, tonumber, unpack = type, tostring, tonumber, unpack

-- UCI 的典型工作流程：从游标工厂获取游标实例，通过 Cursor.add、Cursor.delete 等方法修改数据，
-- 通过 Cursor.save 将更改保存到暂存区，最后通过 Cursor.commit 提交到实际配置文件。
-- LuCI 随后需要通过 Cursor.apply 应用更改，以重启相关守护进程等。
-- Typical UCI workflow: Get a cursor instance from the cursor factory, modify data (via Cursor.add, Cursor.delete, etc.),
-- save changes to the staging area via Cursor.save, and finally commit to config files via Cursor.commit.
-- LuCI then needs to apply changes via Cursor.apply to reload daemons, etc.
module "luci.model.uci"

-- 定义错误信息表，映射 UCI 操作的错误代码到描述
-- Define error message table mapping UCI operation error codes to descriptions
local ERRSTR = {
	-- 错误代码 1：无效的命令
	-- Error code 1: Invalid command
	"Invalid command",
	-- 错误代码 2：无效的参数
	-- Error code 2: Invalid argument
	"Invalid argument",
	-- 错误代码 3：方法未找到
	-- Error code 3: Method not found
	"Method not found",
	-- 错误代码 4：条目未找到
	-- Error code 4: Entry not found
	"Entry not found",
	-- 错误代码 5：无数据
	-- Error code 5: No data
	"No data",
	-- 错误代码 6：权限拒绝
	-- Error code 6: Permission denied
	"Permission denied",
	-- 错误代码 7：超时
	-- Error code 7: Timeout
	"Timeout",
	-- 错误代码 8：不支持
	-- Error code 8: Not supported
	"Not supported",
	-- 错误代码 9：未知错误
	-- Error code 9: Unknown error
	"Unknown error",
	-- 错误代码 10：连接失败
	-- Error code 10: Connection failed
	"Connection failed"
}

-- 定义全局变量 session_id，存储当前会话 ID，初始为 nil
-- Define global variable session_id to store current session ID, initially nil
local session_id = nil

-- 定义内部函数 call，用于调用 UCI 的 ubus 方法
-- Define internal function call to invoke UCI ubus methods
-- 作用：通过 ubus 调用 UCI 的指定命令，附加会话 ID（如果存在）
-- Purpose: Call UCI commands via ubus, attaching session ID if available
local function call(cmd, args)
	-- 检查 args 是否为表且 session_id 是否存在
	-- Check if args is a table and session_id exists
	if type(args) == "table" and session_id then
		-- 将 session_id 添加到 args 表，用于认证
		-- Add session_id to args table for authentication
		args.ubus_rpc_session = session_id
	end
	-- 调用 luci.util.ubus 执行 UCI 命令，返回结果
	-- Call luci.util.ubus to execute UCI command and return result
	return util.ubus("uci", cmd, args)
end

-- 定义函数 cursor，返回 UCI 模块对象
-- Define function cursor to return UCI module object
-- 作用：返回 UCI 模块对象，用于后续配置操作
-- Purpose: Return UCI module object for subsequent configuration operations
function cursor()
	-- 返回模块对象 _M（即 luci.model.uci）
	-- Return module object _M (i.e., luci.model.uci)
	return _M
end

-- 定义函数 cursor_state，返回 UCI 状态模块对象
-- Define function cursor_state to return UCI state module object
-- 作用：返回 UCI 模块对象，通常用于访问运行时状态（当前实现与 cursor 相同）
-- Purpose: Return UCI module object, typically for runtime state access (currently same as cursor)
function cursor_state()
	-- 返回模块对象 _M（与 cursor 相同）
	-- Return module object _M (same as cursor)
	return _M
end

-- 定义函数 substate，返回子状态对象
-- Define function substate to return substate object
-- 作用：支持链式调用，返回自身对象
-- Purpose: Support method chaining by returning self
function substate(self)
	-- 返回自身对象
	-- Return self
	return self
end

-- 定义函数 get_confdir，返回 UCI 配置文件目录
-- Define function get_confdir to return UCI configuration directory
-- 作用：返回 UCI 配置文件的默认存储目录
-- Purpose: Return default storage directory for UCI configuration files
function get_confdir(self)
	-- 返回固定目录 /etc/config
	-- Return fixed directory /etc/config
	return "/etc/config"
end

-- 定义函数 get_savedir，返回 UCI 暂存目录
-- Define function get_savedir to return UCI staging directory
-- 作用：返回 UCI 配置更改的暂存目录
-- Purpose: Return staging directory for UCI configuration changes
function get_savedir(self)
	-- 返回固定目录 /tmp/.uci
	-- Return fixed directory /tmp/.uci
	return "/tmp/.uci"
end

-- 定义函数 get_session_id，返回当前会话 ID
-- Define function get_session_id to return current session ID
-- 作用：获取当前 UCI 操作的会话 ID
-- Purpose: Get the session ID for current UCI operations
function get_session_id(self)
	-- 返回全局变量 session_id
	-- Return global variable session_id
	return session_id
end

-- 定义函数 set_confdir，设置 UCI 配置文件目录
-- Define function set_confdir to set UCI configuration directory
-- 作用：尝试设置 UCI 配置文件的存储目录（当前实现不支持更改）
-- Purpose: Attempt to set UCI configuration file directory (currently not supported)
function set_confdir(self, directory)
	-- 当前实现不支持更改目录，返回 false
	-- Current implementation doesn't support changing directory, return false
	return false
end

-- 定义函数 set_savedir，设置 UCI 暂存目录
-- Define function set_savedir to set UCI staging directory
-- 作用：尝试设置 UCI 配置更改的暂存目录（当前实现不支持更改）
-- Purpose: Attempt to set UCI staging directory (currently not supported)
function set_savedir(self, directory)
	-- 当前实现不支持更改目录，返回 false
	-- Current implementation doesn't support changing directory, return false
	return false
end

-- 定义函数 set_session_id，设置会话 ID
-- Define function set_session_id to set session ID
-- 作用：设置 UCI 操作的会话 ID，用于认证和跟踪
-- Purpose: Set session ID for UCI operations, used for authentication and tracking
function set_session_id(self, id)
	-- 将传入的 id 赋值给全局变量 session_id
	-- Assign provided id to global variable session_id
	session_id = id
	-- 返回 true 表示设置成功
	-- Return true indicating success
	return true
end

-- 定义函数 load，加载 UCI 配置文件
-- Define function load to load UCI configuration file
-- 作用：加载指定的 UCI 配置文件到内存（当前实现无需显式加载）
-- Purpose: Load specified UCI configuration file into memory (currently no explicit loading needed)
function load(self, config)
	-- 当前实现总是返回 true，表示加载成功
	-- Current implementation always returns true, indicating success
	return true
end

-- 定义函数 save，保存 UCI 配置更改到暂存区
-- Define function save to save UCI configuration changes to staging area
-- 作用：将内存中的配置更改保存到暂存区（当前实现无需显式保存）
-- Purpose: Save in-memory configuration changes to staging area (currently no explicit saving needed)
function save(self, config)
	-- 当前实现总是返回 true，表示保存成功
	-- Current implementation always returns true, indicating success
	return true
end

-- 定义函数 unload，卸载 UCI 配置文件
-- Define function unload to unload UCI configuration file
-- 作用：从内存中卸载指定的 UCI 配置文件（当前实现无需显式卸载）
-- Purpose: Unload specified UCI configuration file from memory (currently no explicit unloading needed)
function unload(self, config)
	-- 当前实现总是返回 true，表示卸载成功
	-- Current implementation always returns true, indicating success
	return true
end

-- 定义函数 changes，获取 UCI 配置的更改
-- Define function changes to get UCI configuration changes
-- 作用：查询指定配置文件或所有配置的暂存更改
-- Purpose: Query pending changes for a specific config or all configs
function changes(self, config)
	-- 调用内部 call 函数，执行 ubus 的 changes 方法
	-- Call internal call function to execute ubus changes method
	local rv, err = call("changes", { config = config })

	-- 检查返回值是否为表且包含 changes 字段
	-- Check if return value is a table and contains changes field
	if type(rv) == "table" and type(rv.changes) == "table" then
		-- 返回更改内容（键值对形式）
		-- Return changes content (in key-value pair format)
		return rv.changes
	-- 如果有错误代码
	-- If there is an error code
	elseif err then
		-- 返回 nil 和对应的错误描述
		-- Return nil and corresponding error description
		return nil, ERRSTR[err]
	-- 如果没有更改或返回值无效
	-- If no changes or return value is invalid
	else
		-- 返回空表
		-- Return empty table
		return { }
	end
end

-- 定义函数 revert，还原 UCI 配置的更改
-- Define function revert to revert UCI configuration changes
-- 作用：取消指定配置文件在暂存区的所有更改
-- Purpose: Cancel all pending changes for a specific config in the staging area
function revert(self, config)
	-- 调用内部 call 函数，执行 ubus 的 revert 方法
	-- Call internal call function to execute ubus revert method
	local _, err = call("revert", { config = config })
	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 commit，提交 UCI 配置更改到实际文件
-- Define function commit to commit UCI configuration changes to actual files
-- 作用：将暂存区的更改写入实际的 UCI 配置文件
-- Purpose: Write pending changes from staging area to actual UCI config files
function commit(self, config)
	-- 调用内部 call 函数，执行 ubus 的 commit 方法
	-- Call internal call function to execute ubus commit method
	local _, err = call("commit", { config = config })
	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 apply，应用 UCI 配置更改并重启相关服务
-- Define function apply to apply UCI configuration changes and restart services
-- 作用：应用所有暂存的配置更改，并触发相关服务的重启（支持回滚）
-- Purpose: Apply all pending config changes and trigger service restarts (supports rollback)
function apply(self, rollback)
	-- 定义局部变量，用于存储错误代码
	-- Define local variable to store error code
	local _, err

	-- 检查是否启用了回滚功能
	-- Check if rollback is enabled
	if rollback then
		-- 导入 luci.sys 模块，用于生成唯一 ID 等系统操作
		-- Import luci.sys module for generating unique IDs and other system operations
		local sys = require "luci.sys"
		-- 导入 luci.config 模块，获取 LuCI 的配置参数
		-- Import luci.config module to get LuCI configuration parameters
		local conf = require "luci.config"
		-- 获取回滚超时时间，默认为 90 秒
		-- Get rollback timeout, default to 90 seconds
		local timeout = tonumber(conf and conf.apply and conf.apply.rollback or 90) or 0

		-- 调用内部 call 函数，执行 ubus 的 apply 方法，启用回滚
		-- Call internal call function to execute ubus apply method with rollback enabled
		_, err = call("apply", {
			-- 设置超时时间（至少 90 秒）
			-- Set timeout (minimum 90 seconds)
			timeout = (timeout > 90) and timeout or 90,
			-- 启用回滚功能
			-- Enable rollback
			rollback = true
		})

		-- 如果没有错误
		-- If no error occurred
		if not err then
			-- 获取当前时间戳
			-- Get current timestamp
			local now = os.time()
			-- 生成 16 字节的唯一回滚令牌
			-- Generate a 16-byte unique rollback token
			local token = sys.uniqueid(16)

			-- 调用 ubus 的 session.set 方法，存储回滚信息
			-- Call ubus session.set method to store rollback information
			util.ubus("session", "set", {
				-- 使用默认会话 ID（全零）
				-- Use default session ID (all zeros)
				ubus_rpc_session = "00000000000000000000000000000000",
				-- 设置回滚相关的数据
				-- Set rollback-related data
				values = {
					rollback = {
						-- 存储回滚令牌
						-- Store rollback token
						token   = token,
						-- 存储当前会话 ID
						-- Store current session ID
						session = session_id,
						-- 设置超时时间（当前时间 + 超时秒数）
						-- Set timeout (current time + timeout seconds)
						timeout = now + timeout
					}
				}
			})

			-- 返回回滚令牌
			-- Return rollback token
			return token
		end
	-- 如果不启用回滚
	-- If rollback is not enabled
	else
		-- 调用内部 call 函数，获取所有配置的更改
		-- Call internal call function to get all configuration changes
		_, err = call("changes", {})

		-- 如果没有错误
		-- If no error occurred
		if not err then
			-- 检查返回值是否为表且包含 changes 字段
			-- Check if return value is a table and contains changes field
			if type(_) == "table" and type(_.changes) == "table" then
				-- 定义局部变量 k, v 用于遍历更改
				-- Define local variables k, v to iterate over changes
				local k, v
				-- 遍历所有更改的配置文件
				-- Iterate over all changed configuration files
				for k, v in pairs(_.changes) do
					-- 对每个配置文件执行 commit 操作
					-- Execute commit operation for each configuration file
					_, err = call("commit", { config = k })
					-- 如果提交失败，退出循环
					-- If commit fails, break the loop
					if err then
						break
					end
				end
			end
		end

		-- 如果仍然没有错误
		-- If still no error
		if not err then
			-- 调用内部 call 函数，执行 ubus 的 apply 方法，禁用回滚
			-- Call internal call function to execute ubus apply method with rollback disabled
			_, err = call("apply", { rollback = false })
		end
	end

	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 confirm，确认回滚操作
-- Define function confirm to confirm rollback operation
-- 作用：确认应用更改，清除回滚状态
-- Purpose: Confirm applied changes and clear rollback state
function confirm(self, token)
	-- 调用 rollback_pending 方法，检查是否有待处理的回滚
	-- Call rollback_pending to check if there is a pending rollback
	local is_pending, time_remaining, rollback_sid, rollback_token = self:rollback_pending()

	-- 如果存在待处理的回滚
	-- If a pending rollback exists
	if is_pending then
		-- 检查提供的 token 是否与回滚令牌匹配
		-- Check if provided token matches rollback token
		if token ~= rollback_token then
			-- 如果不匹配，返回 false 和权限拒绝错误
			-- If not matching, return false and permission denied error
			return false, "Permission denied"
		end

		-- 调用 ubus 的 confirm 方法，确认更改
		-- Call ubus confirm method to confirm changes
		local _, err = util.ubus("uci", "confirm", {
			-- 使用回滚会话 ID
			-- Use rollback session ID
			ubus_rpc_session = rollback_sid
		})

		-- 如果没有错误
		-- If no error occurred
		if not err then
			-- 调用 ubus 的 session.set 方法，清除回滚信息
			-- Call ubus session.set method to clear rollback information
			util.ubus("session", "set", {
				-- 使用默认会话 ID（全零）
				-- Use default session ID (all zeros)
				ubus_rpc_session = "00000000000000000000000000000000",
				-- 设置空的回滚信息
				-- Set empty rollback information
				values = { rollback = {} }
			})
		end

		-- 返回操作是否成功（err 为 nil）以及错误描述
		-- Return whether operation was successful (err is nil) and error description
		return (err == nil), ERRSTR[err]
	end

	-- 如果没有待处理的回滚，返回 false 和无数据错误
	-- If no pending rollback, return false and no data error
	return false, "No data"
end

-- 定义函数 rollback，执行回滚操作
-- Define function rollback to perform rollback operation
-- 作用：撤销应用的所有更改，恢复到更改前的状态
-- Purpose: Revert all applied changes to the state before changes
function rollback(self)
	-- 调用 rollback_pending 方法，检查是否有待处理的回滚
	-- Call rollback_pending to check if there is a pending rollback
	local is_pending, time_remaining, rollback_sid = self:rollback_pending()

	-- 如果存在待处理的回滚
	-- If a pending rollback exists
	if is_pending then
		-- 调用 ubus 的 rollback 方法，执行回滚
		-- Call ubus rollback method to perform rollback
		local _, err = util.ubus("uci", "rollback", {
			-- 使用回滚会话 ID
			-- Use rollback session ID
			ubus_rpc_session = rollback_sid
		})

		-- 如果没有错误
		-- If no error occurred
		if not err then
			-- 调用 ubus 的 session.set 方法，清除回滚信息
			-- Call ubus session.set method to clear rollback information
			util.ubus("session", "set", {
				-- 使用默认会话 ID（全零）
				-- Use default session ID (all zeros)
				ubus_rpc_session = "00000000000000000000000000000000",
				-- 设置空的回滚信息
				-- Set empty rollback information
				values = { rollback = {} }
			})
		end

		-- 返回操作是否成功（err 为 nil）以及错误描述
		-- Return whether operation was successful (err is nil) and error description
		return (err == nil), ERRSTR[err]
	end

	-- 如果没有待处理的回滚，返回 false 和无数据错误
	-- If no pending rollback, return false and no data error
	return false, "No data"
end

-- 定义函数 rollback_pending，检查是否有待处理的回滚
-- Define function rollback_pending to check for pending rollback
-- 作用：查询当前是否存在待确认或可回滚的更改
-- Purpose: Query if there is a pending change to confirm or rollback
function rollback_pending(self)
	-- 调用 ubus 的 session.get 方法，获取回滚信息
	-- Call ubus session.get method to retrieve rollback information
	local rv, err = util.ubus("session", "get", {
		-- 使用默认会话 ID（全零）
		-- Use default session ID (all zeros)
		ubus_rpc_session = "00000000000000000000000000000000",
		-- 仅获取 rollback 键
		-- Retrieve only the rollback key
		keys = { "rollback" }
	})

	-- 获取当前时间戳
	-- Get current timestamp
	local now = os.time()

	-- 检查返回值是否为表，且包含有效的回滚信息
	-- Check if return value is a table and contains valid rollback information
	if type(rv) == "table" and
	   type(rv.values) == "table" and
	   type(rv.values.rollback) == "table" and
	   type(rv.values.rollback.token) == "string" and
	   type(rv.values.rollback.session) == "string" and
	   type(rv.values.rollback.timeout) == "number" and
	   rv.values.rollback.timeout > now
	then
		-- 返回 true（存在待处理的回滚），剩余时间，会话 ID 和令牌
		-- Return true (pending rollback exists), remaining time, session ID, and token
		return true,
			rv.values.rollback.timeout - now,
			rv.values.rollback.session,
			rv.values.rollback.token
	end

	-- 如果没有有效的回滚信息，返回 false 和错误描述
	-- If no valid rollback info, return false and error description
	return false, ERRSTR[err]
end

-- 定义函数 foreach，遍历 UCI 配置中的指定类型段
-- Define function foreach to iterate over sections of a specific type in UCI config
-- 作用：对指定配置和类型的每个段执行回调函数
-- Purpose: Execute callback function for each section of specified config and type
function foreach(self, config, stype, callback)
	-- 检查回调函数是否为函数类型
	-- Check if callback is a function
	if type(callback) == "function" then
		-- 调用内部 call 函数，执行 ubus 的 get 方法，获取指定类型的所有段
		-- Call internal call function to execute ubus get method for all sections of specified type
		local rv, err = call("get", {
			-- 指定配置文件
			-- Specify configuration file
			config = config,
			-- 指定段类型
			-- Specify section type
			type   = stype
		})

		-- 检查返回值是否为表且包含 values 字段
		-- Check if return value is a table and contains values field
		if type(rv) == "table" and type(rv.values) == "table" then
			-- 创建表，用于存储段信息
			-- Create table to store section information
			local sections = {}
			-- 定义标志，表示是否至少有一个段被处理
			-- Define flag indicating if at least one section was processed
			local res = false
			-- 定义索引，用于给段分配顺序
			-- Define index for assigning order to sections
			local index = 1

			-- 定义局部变量 section 用于遍历
			-- Define local variable section for iteration
			local _, section
			-- 遍历返回的所有段
			-- Iterate over all returned sections
			for _, section in pairs(rv.values) do
				-- 如果段没有 .index，分配当前 index
				-- If section has no .index, assign current index
				section[".index"] = section[".index"] or index
				-- 将段信息存储到 sections 表
				-- Store section info in sections table
				sections[index] = section
				-- 增加索引
				-- Increment index
				index = index + 1
			end

			-- 对 sections 表按 .index 排序
			-- Sort sections table by .index
			table.sort(sections, function(a, b)
				-- 比较两个段的 .index 值
				-- Compare .index values of two sections
				return a[".index"] < b[".index"]
			end)

			-- 遍历排序后的段
			-- Iterate over sorted sections
			for _, section in ipairs(sections) do
				-- 调用回调函数，传递当前段
				-- Call callback function with current section
				local continue = callback(section)
				-- 标记至少有一个段被处理
				-- Mark that at least one section was processed
				res = true
				-- 如果回调返回 false，退出循环
				-- If callback returns false, break the loop
				if continue == false then
					break
				end
			end
			-- 返回处理结果（true 表示至少处理了一个段）
			-- Return processing result (true if at least one section was processed)
			return res
		else
			-- 如果返回值无效，返回 false 和错误描述
			-- If return value is invalid, return false and error description
			return false, ERRSTR[err] or "No data"
		end
	else
		-- 如果回调不是函数，返回 false 和无效参数错误
		-- If callback is not a function, return false and invalid argument error
		return false, "Invalid argument"
	end
end

-- 定义内部函数 _get，获取 UCI 配置中的值
-- Define internal function _get to retrieve values from UCI configuration
-- 作用：根据操作类型（get 或 state）获取配置、段或选项的值
-- Purpose: Retrieve config, section, or option values based on operation type (get or state)
local function _get(self, operation, config, section, option)
	-- 检查 section 是否为 nil
	-- Check if section is nil
	if section == nil then
		-- 如果 section 为 nil，返回 nil
		-- If section is nil, return nil
		return nil
	-- 检查 option 是否为字符串且不以点号开头（非元数据）
	-- Check if option is a string and doesn't start with a dot (not metadata)
	elseif type(option) == "string" and option:byte(1) ~= 46 then
		-- 调用内部 call 函数，执行指定的操作（get 或 state）
		-- Call internal call function to execute specified operation (get or state)
		local rv, err = call(operation, {
			-- 指定配置文件
			-- Specify configuration file
			config  = config,
			-- 指定段名称
			-- Specify section name
			section = section,
			-- 指定选项名称
			-- Specify option name
			option  = option
		})

		-- 检查返回值是否为表
		-- Check if return value is a table
		if type(rv) == "table" then
			-- 返回选项的值（如果存在），否则返回 nil
			-- Return option value (if exists), otherwise nil
			return rv.value or nil
		-- 如果有错误代码
		-- If there is an error code
		elseif err then
			-- 返回 false 和错误描述
			-- Return false and error description
			return false, ERRSTR[err]
		-- 如果返回值无效
		-- If return value is invalid
		else
			-- 返回 nil
			-- Return nil
			return nil
		end
	-- 如果 option 为 nil
	-- If option is nil
	elseif option == nil then
		-- 调用 get_all 方法，获取段的所有值
		-- Call get_all to retrieve all values of the section
		local values = self:get_all(config, section)
		-- 如果 values 存在
		-- If values exist
		if values then
			-- 返回段的类型和名称
			-- Return section type and name
			return values[".type"], values[".name"]
		else
			-- 否则返回 nil
			-- Otherwise return nil
			return nil
		end
	-- 如果参数无效
	-- If parameters are invalid
	else
		-- 返回 false 和无效参数错误
		-- Return false and invalid argument error
		return false, "Invalid argument"
	end
end

-- 定义函数 get，获取 UCI 配置中的值
-- Define function get to retrieve values from UCI configuration
-- 作用：获取指定配置、段和选项的值
-- Purpose: Retrieve value of specified config, section, and option
function get(self, ...)
	-- 调用内部 _get 函数，执行 get 操作
	-- Call internal _get function with get operation
	return _get(self, "get", ...)
end

-- 定义函数 get_state，获取 UCI 配置中的状态值
-- Define function get_state to retrieve state values from UCI configuration
-- 作用：获取指定配置、段和选项的运行时状态值
-- Purpose: Retrieve runtime state value of specified config, section, and option
function get_state(self, ...)
	-- 调用内部 _get 函数，执行 state 操作
	-- Call internal _get function with state operation
	return _get(self, "state", ...)
end

-- 定义函数 get_all，获取 UCI 配置段的所有值
-- Define function get_all to retrieve all values of a UCI config section
-- 作用：获取指定配置和段的所有键值对
-- Purpose: Retrieve all key-value pairs of specified config and section
function get_all(self, config, section)
	-- 调用内部 call 函数，执行 ubus 的 get 方法
	-- Call internal call function to execute ubus get method
	local rv, err = call("get", {
		-- 指定配置文件
		-- Specify configuration file
		config  = config,
		-- 指定段名称
		-- Specify section name
		section = section
	})

	-- 检查返回值是否为表且包含 values 字段
	-- Check if return value is a table and contains values field
	if type(rv) == "table" and type(rv.values) == "table" then
		-- 返回段的所有值
		-- Return all values of the section
		return rv.values
	-- 如果有错误代码
	-- If there is an error code
	elseif err then
		-- 返回 false 和错误描述
		-- Return false and error description
		return false, ERRSTR[err]
	-- 如果返回值无效
	-- If return value is invalid
	else
		-- 返回 nil
		-- Return nil
		return nil
	end
end

-- 定义函数 get_bool，获取 UCI 配置中的布尔值
-- Define function get_bool to retrieve boolean values from UCI configuration
-- 作用：将指定选项的值转换为布尔值（1、true、yes、on 视为 true）
-- Purpose: Convert specified option value to boolean (1, true, yes, on are true)
function get_bool(self, ...)
	-- 调用 get 方法获取选项值
	-- Call get method to retrieve option value
	local val = self:get(...)
	-- 返回布尔值，检查值是否为 "1"、"true"、"yes" 或 "on"
	-- Return boolean, checking if value is "1", "true", "yes", or "on"
	return (val == "1" or val == "true" or val == "yes" or val == "on")
end

-- 定义函数 get_first，获取 UCI 配置中第一个匹配的值
-- Define function get_first to retrieve first matching value from UCI configuration
-- 作用：从指定配置和类型的段中获取第一个匹配的选项值或段名称
-- Purpose: Get first matching option value or section name from specified config and type
function get_first(self, config, stype, option, default)
	-- 初始化返回值，默认为提供的默认值
	-- Initialize return value to provided default
	local rv = default

	-- 调用 foreach 方法，遍历指定配置和类型的段
	-- Call foreach to iterate over sections of specified config and type
	self:foreach(config, stype, function(s)
		-- 如果没有指定 option，获取段名称，否则获取选项值
		-- If no option specified, get section name, otherwise get option value
		local val = not option and s[".name"] or s[option]

		-- 如果默认值是数字类型
		-- If default value is a number
		if type(default) == "number" then
			-- 将值转换为数字
			-- Convert value to number
			val = tonumber(val)
		-- 如果默认值是布尔类型
		-- If default value is a boolean
		elseif type(default) == "boolean" then
			-- 将值转换为布尔值
			-- Convert value to boolean
			val = (val == "1" or val == "true" or
			       val == "yes" or val == "on")
		end

		-- 如果值不为 nil
		-- If value is not nil
		if val ~= nil then
			-- 更新返回值
			-- Update return value
			rv = val
			-- 返回 false 终止遍历
			-- Return false to stop iteration
			return false
		end
	end)

	-- 返回最终值
	-- Return final value
	return rv
end

-- 定义函数 get_list，获取 UCI 配置中的列表值
-- Define function get_list to retrieve list values from UCI configuration
-- 作用：获取指定配置、段和选项的列表值（单个值包装为列表）
-- Purpose: Retrieve list value of specified config, section, and option (single value wrapped as list)
function get_list(self, config, section, option)
	-- 检查是否提供了所有参数
	-- Check if all parameters are provided
	if config and section and option then
		-- 调用 get 方法获取选项值
		-- Call get method to retrieve option value
		local val = self:get(config, section, option)
		-- 如果值是表，直接返回，否则包装为单元素列表
		-- If value is a table, return it, otherwise wrap as single-element list
		return (type(val) == "table" and val or { val })
	end
	-- 如果参数缺失，返回空列表
	-- If parameters are missing, return empty list
	return { }
end

-- 定义函数 section，添加或更新 UCI 配置段
-- Define function section to add or update a UCI configuration section
-- 作用：向指定配置添加一个新段，或更新现有段的键值对
-- Purpose: Add a new section to specified config or update key-value pairs of existing section
function section(self, config, stype, name, values)
	-- 调用内部 call 函数，执行 ubus 的 add 方法
	-- Call internal call function to execute ubus add method
	local rv, err = call("add", {
		-- 指定配置文件
		-- Specify configuration file
		config = config,
		-- 指定段类型
		-- Specify section type
		type   = stype,
		-- 指定段名称（可选）
		-- Specify section name (optional)
		name   = name,
		-- 指定段的键值对（可选）
		-- Specify section key-value pairs (optional)
		values = values
	})

	-- 检查返回值是否为表
	-- Check if return value is a table
	if type(rv) == "table" then
		-- 返回新创建的段名称
		-- Return name of newly created section
		return rv.section
	-- 如果有错误代码
	-- If there is an error code
	elseif err then
		-- 返回 false 和错误描述
		-- Return false and error description
		return false, ERRSTR[err]
	-- 如果返回值无效
	-- If return value is invalid
	else
		-- 返回 nil
		-- Return nil
		return nil
	end
end

-- 定义函数 add，添加 UCI 配置段
-- Define function add to add a UCI configuration section
-- 作用：向指定配置添加一个新段（调用 section 方法）
-- Purpose: Add a new section to specified config (calls section method)
function add(self, config, stype)
	-- 调用 section 方法，不指定名称和值
	-- Call section method without specifying name or values
	return self:section(config, stype)
end

-- 定义函数 set，设置 UCI 配置中的值
-- Define function set to set values in UCI configuration
-- 作用：设置指定配置、段和选项的值，或添加新段
-- Purpose: Set value of specified config, section, and option, or add new section
function set(self, config, section, option, ...)
	-- 检查是否有额外参数
	-- Check if there are additional parameters
	if select('#', ...) == 0 then
		-- 如果没有额外参数，调用 section 方法添加新段
		-- If no additional parameters, call section to add new section
		local sname, err = self:section(config, option, section)
		-- 返回操作是否成功和错误描述
		-- Return whether operation was successful and error description
		return (not not sname), err
	else
		-- 调用内部 call 函数，执行 ubus 的 set 方法
		-- Call internal call function to execute ubus set method
		local _, err = call("set", {
			-- 指定配置文件
			-- Specify configuration file
			config  = config,
			-- 指定段名称
			-- Specify section name
			section = section,
			-- 设置键值对（选项和第一个额外参数）
			-- Set key-value pair (option and first additional parameter)
			values  = { [option] = select(1, ...) }
		})
		-- 返回操作是否成功（err 为 nil）以及错误描述
		-- Return whether operation was successful (err is nil) and error description
		return (err == nil), ERRSTR[err]
	end
end

-- 定义函数 set_list，设置 UCI 配置中的列表值
-- Define function set_list to set list values in UCI configuration
-- 作用：设置指定配置、段和选项的列表值
-- Purpose: Set list value of specified config, section, and option
function set_list(self, config, section, option, value)
	-- 检查 section 和 option 是否为 nil
	-- Check if section or option is nil
	if section == nil or option == nil then
		-- 如果参数缺失，返回 false
		-- If parameters are missing, return false
		return false
	-- 检查值是否为 nil 或空表
	-- Check if value is nil or empty table
	elseif value == nil or (type(value) == "table" and #value == 0) then
		-- 如果值为空，删除选项
		-- If value is empty, delete the option
		return self:delete(config, section, option)
	-- 如果值是表
	-- If value is a table
	elseif type(value) == "table" then
		-- 调用 set 方法设置列表值
		-- Call set method to set list value
		return self:set(config, section, option, value)
	-- 如果值是单个值
	-- If value is a single value
	else
		-- 调用 set 方法，将值包装为单元素列表
		-- Call set method, wrapping value as single-element list
		return self:set(config, section, option, { value })
	end
end

-- 定义函数 tset，设置 UCI 配置段的多个值
-- Define function tset to set multiple values in a UCI configuration section
-- 作用：同时设置指定段的多个键值对
-- Purpose: Set multiple key-value pairs for a specified section simultaneously
function tset(self, config, section, values)
	-- 调用内部 call 函数，执行 ubus 的 set 方法
	-- Call internal call function to execute ubus set method
	local _, err = call("set", {
		-- 指定配置文件
		-- Specify configuration file
		config  = config,
		-- 指定段名称
		-- Specify section name
		section = section,
		-- 设置多个键值对
		-- Set multiple key-value pairs
		values  = values
	})
	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 reorder，重新排序 UCI 配置段
-- Define function reorder to reorder UCI configuration sections
-- 作用：调整指定配置中段的顺序
-- Purpose: Adjust order of sections in specified configuration
function reorder(self, config, section, index)
	-- 定义局部变量，用于存储段列表
	-- Define local variable to store section list
	local sections

	-- 检查 section 是否为字符串且 index 是否为数字
	-- Check if section is a string and index is a number
	if type(section) == "string" and type(index) == "number" then
		-- 初始化位置计数器
		-- Initialize position counter
		local pos = 0

		-- 初始化段列表
		-- Initialize sections list
		sections = { }

		-- 调用 foreach 方法，遍历所有段
		-- Call foreach to iterate over all sections
		self:foreach(config, nil, function(s)
			-- 如果当前位置等于目标索引
			-- If current position equals target index
			if pos == index then
				-- 增加位置计数器
				-- Increment position counter
				pos = pos + 1
			end

			-- 如果当前段不是目标段
			-- If current section is not target section
			if s[".name"] ~= section then
				-- 增加位置计数器并添加段
				-- Increment position counter and add section
				pos = pos + 1
				sections[pos] = s[".name"]
			else
				-- 将目标段插入指定索引
				-- Insert target section at specified index
				sections[index + 1] = section
			end
		end)
	-- 如果 section 是表
	-- If section is a table
	elseif type(section) == "table" then
		-- 直接使用提供的段列表
		-- Use provided section list directly
		sections = section
	-- 如果参数无效
	-- If parameters are invalid
	else
		-- 返回 false 和无效参数错误
		-- Return false and invalid argument error
		return false, "Invalid argument"
	end

	-- 调用内部 call 函数，执行 ubus 的 order 方法
	-- Call internal call function to execute ubus order method
	local _, err = call("order", {
		-- 指定配置文件
		-- Specify configuration file
		config   = config,
		-- 指定段列表
		-- Specify section list
		sections = sections
	})

	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 delete，删除 UCI 配置中的选项或段
-- Define function delete to delete options or sections from UCI configuration
-- 作用：删除指定配置、段或选项
-- Purpose: Delete specified config, section, or option
function delete(self, config, section, option)
	-- 调用内部 call 函数，执行 ubus 的 delete 方法
	-- Call internal call function to execute ubus delete method
	local _, err = call("delete", {
		-- 指定配置文件
		-- Specify configuration file
		config  = config,
		-- 指定段名称
		-- Specify section name
		section = section,
		-- 指定选项名称（可选）
		-- Specify option name (optional)
		option  = option
	})
	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end

-- 定义函数 delete_all，删除 UCI 配置中所有匹配的段
-- Define function delete_all to delete all matching sections from UCI configuration
-- 作用：删除指定配置中所有指定类型的段，可根据比较器过滤
-- Purpose: Delete all sections of specified type in config, optionally filtered by comparator
function delete_all(self, config, stype, comparator)
	-- 定义局部变量，用于存储错误代码
	-- Define local variable to store error code
	local _, err
	-- 如果比较器是表
	-- If comparator is a table
	if type(comparator) == "table" then
		-- 调用内部 call 函数，执行 ubus 的 delete 方法，带匹配条件
		-- Call internal call function to execute ubus delete method with match condition
		_, err = call("delete", {
			-- 指定配置文件
			-- Specify configuration file
		QFconfig = config,
			-- 指定段类型
			-- Specify section type
			type   = stype,
			-- 指定匹配条件
			-- Specify match condition
			match  = comparator
		})
	-- 如果比较器是函数
	-- If comparator is a function
	elseif type(comparator) == "function" then
		-- 调用内部 call 函数，获取指定类型的所有段
		-- Call internal call function to get all sections of specified type
		local rv = call("get", {
			-- 指定配置文件
			-- Specify configuration file
			config = config,
			-- 指定段类型
			-- Specify section type
			type   = stype
		})

		-- 检查返回值是否为表且包含 values 字段
		-- Check if return value is a table and contains values field
		if type(rv) == "table" and type(rv.values) == "table" then
			-- 定义局部变量 sname, section 用于遍历
			-- Define local variables sname, section for iteration
			local sname, section
			-- 遍历所有段
			-- Iterate over all sections
			for sname, section in pairs(rv.values) do
				-- 如果比较器返回 true
				-- If comparator returns true
				if comparator(section) then
					-- 删除该段
					-- Delete the section
					_, err = call("delete", {
						-- 指定配置文件
						-- Specify configuration file
						config  = config,
						-- 指定段名称
						-- Specify section name
						section = sname
					})
				end
			end
		end
	-- 如果没有提供比较器
	-- If no comparator provided
	elseif comparator == nil then
		-- 调用内部 call 函数，删除所有指定类型的段
		-- Call internal call function to delete all sections of specified type
		_, err = call("delete", {
			-- 指定配置文件
			-- Specify configuration file
			config  = config,
			-- 指定段类型
			-- Specify section type
			type    = stype
		})
	-- 如果比较器类型无效
	-- If comparator type is invalid
	else
		-- 返回 false 和无效参数错误
		-- Return false and invalid argument error
		return false, "Invalid argument"
	end

	-- 返回操作是否成功（err 为 nil）以及错误描述
	-- Return whether operation was successful (err is nil) and error description
	return (err == nil), ERRSTR[err]
end
