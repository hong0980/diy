-- 版权声明：2008 Steven Barth，作者邮箱 <steven@midlink.org>
-- Copyright 2008 Steven Barth <steven@midlink.org>
-- 授权协议：代码遵循 Apache License 2.0 许可，允许公共使用
-- Licensed to the public under the Apache License 2.0.

-- 导入标准 Lua 的 io 模块，用于文件输入输出操作
-- Import Lua's io module for file input/output operations
local io     = require "io"

-- 导入标准 Lua 的 os 模块，用于系统操作（如执行命令、获取环境变量）
-- Import Lua's os module for system operations (e.g., executing commands, getting env vars)
local os     = require "os"

-- 导入标准 Lua 的 table 模块，用于表操作（如插入、连接）
-- Import Lua's table module for table operations (e.g., insert, concat)
local table  = require "table"

-- 导入 nixio 库，用于低级别系统操作（如文件、网络、用户管理）
-- Import nixio library for low-level system operations (e.g., file, network, user management)
local nixio  = require "nixio"

-- 导入 nixio.fs 模块，用于文件系统操作（如读写文件、检查文件存在）
-- Import nixio.fs module for filesystem operations (e.g., read/write files, check existence)
local fs     = require "nixio.fs"

-- 导入 luci.model.uci 模块，用于 UCI 配置管理（如读写 /etc/config 文件）
-- Import luci.model.uci module for UCI configuration management (e.g., read/write /etc/config)
local uci    = require "luci.model.uci"

-- 定义 luci 表，用于存储 LuCI 框架的相关模块
-- Define luci table to store LuCI framework-related modules
local luci  = {}

-- 导入 luci.util 模块，提供实用工具函数（如执行命令、字符串处理）
-- Import luci.util module for utility functions (e.g., execute commands, string manipulation)
luci.util   = require "luci.util"

-- 导入 luci.ip 模块，用于 IP 地址操作（如检查 MAC 地址、IP 邻居查询）
-- Import luci.ip module for IP address operations (e.g., check MAC, query IP neighbors)
luci.ip     = require "luci.ip"

-- 导入常用的 Lua 函数到本地变量，提升访问效率
-- Import commonly used Lua functions to local variables for efficiency
local tonumber, ipairs, pairs, pcall, type, next, setmetatable, require, select, unpack =
	tonumber, ipairs, pairs, pcall, type, next, setmetatable, require, select, unpack

-- 声明模块 "luci.sys"，用于封装系统相关的功能（如重启、日志查询）
-- Declare module "luci.sys" to encapsulate system-related functionality (e.g., reboot, logs)
module "luci.sys"

-- 定义函数 call，用于执行系统命令并返回退出状态码
-- Define function call to execute system commands and return the exit status code
function call(...)
	-- 执行传入的命令，并将退出状态码除以 256（转换为 Shell 的标准退出码）
	-- Execute the provided command and divide the exit code by 256 (convert to Shell exit code)
	return os.execute(...) / 256
end

-- 将 luci.util.exec 赋值给 exec，作为执行命令的快捷方式
-- Assign luci.util.exec to exec as a shortcut for command execution
exec = luci.util.exec

-- 定义函数 getenv，用于获取环境变量
-- Define function getenv to retrieve environment variables
-- containing the whole environment is returned otherwise this function returns
-- the corresponding string value for the given name or nil if no such variable
-- exists.
getenv = nixio.getenv

-- 定义函数 hostname，用于获取或设置系统主机名
-- Define function hostname to get or set the system hostname
function hostname(newname)
	-- 检查参数 newname 是否为字符串且非空
	-- Check if newname is a string and non-empty
	if type(newname) == "string" and #newname > 0 then
		-- 将新主机名写入 /proc/sys/kernel/hostname 文件
		-- Write the new hostname to /proc/sys/kernel/hostname file
		fs.writefile( "/proc/sys/kernel/hostname", newname )
		-- 返回设置的主机名
		-- Return the set hostname
		return newname
	else
		-- 返回当前主机名，从 nixio.uname().nodename 获取
		-- Return the current hostname from nixio.uname().nodename
		return nixio.uname().nodename
	end
end

-- 定义函数 httpget，用于通过 HTTP 获取数据
-- Define function httpget to fetch data via HTTP
function httpget(url, stream, target)
	-- 检查是否需要将数据写入文件（target 参数存在）
	-- Check if data needs to be written to a file (target parameter exists)
	if not target then
		-- 根据 stream 参数选择数据源：io.popen（流式）或 luci.util.exec（完整输出）
		-- Choose data source based on stream: io.popen (streaming) or luci.util.exec (full output)
		local source = stream and io.popen or luci.util.exec
		-- 执行 wget 命令，获取 URL 内容并返回
		-- Execute wget command to fetch URL content and return it
		return source("wget -qO- %s" % luci.util.shellquote(url))
	else
		-- 执行 wget 命令，将 URL 内容保存到目标文件
		-- Execute wget command to save URL content to the target file
		return os.execute("wget -qO %s %s" %
			{luci.util.shellquote(target), luci.util.shellquote(url)})
	end
end

-- 定义函数 reboot，用于重启系统
-- Define function reboot to restart the system
function reboot()
	-- 执行 reboot 命令，并将输出重定向到 /dev/null
	-- Execute reboot command and redirect output to /dev/null
	return os.execute("reboot >/dev/null 2>&1")
end

-- 定义函数 syslog，用于获取系统日志
-- Define function syslog to retrieve system logs
function syslog()
	-- 执行 logread 命令，返回日志内容
	-- Execute logread command and return log content
	return luci.util.exec("logread")
end

-- 定义函数 dmesg，用于获取内核日志
-- Define function dmesg to retrieve kernel logs
function dmesg()
	-- 执行 dmesg 命令，返回内核日志内容
	-- Execute dmesg command and return kernel log content
	return luci.util.exec("dmesg")
end

-- 定义函数 uniqueid，用于生成指定长度的随机 ID
-- Define function uniqueid to generate a random ID of specified length
function uniqueid(bytes)
	-- 从 /dev/urandom 读取指定字节数的随机数据
	-- Read the specified number of random bytes from /dev/urandom
	local rand = fs.readfile("/dev/urandom", bytes)
	-- 如果读取成功，将数据转换为十六进制字符串并返回
	-- If read successfully, convert data to hexadecimal string and return
	return rand and nixio.bin.hexlify(rand)
end

-- 定义函数 uptime，用于获取系统运行时间
-- Define function uptime to get system uptime
function uptime()
	-- 返回 nixio.sysinfo().uptime，提供系统的运行秒数
	-- Return nixio.sysinfo().uptime, providing system uptime in seconds
	return nixio.sysinfo().uptime
end

-- 定义 net 表，用于存储网络相关的功能
-- Define net table to store network-related functionality
net = {}

-- 定义内部函数 _nethints，用于收集网络设备信息（如 MAC、IP、主机名）
-- Define internal function _nethints to collect network device info (e.g., MAC, IP, hostname)
local function _nethints(what, callback)
	-- 定义局部变量，用于存储 UCI 配置、接口信息、主机信息等
	-- Define local variables to store UCI config, interface info, host info, etc.
	local _, k, e, mac, ip, name, duid, iaid
	-- 创建 UCI 游标对象，用于访问 UCI 配置
	-- Create UCI cursor object to access UCI configuration
	local cur = uci.cursor()
	-- 定义表 ifn，存储接口信息
	-- Define table ifn to store interface information
	local ifn = { }
	-- 定义表 hosts，存储主机信息
	-- Define table hosts to store host information
	local hosts = { }
	-- 定义表 lookup，存储 DNS 查找结果
	-- Define table lookup to store DNS lookup results
	local lookup = { }

	-- 定义内部函数 _add，用于添加主机信息到 hosts 表
	-- Define internal function _add to add host info to hosts table
	local function _add(i, ...)
		-- 从参数中选择第 i 个值作为键
		-- Select the i-th value from parameters as the key
		local k = select(i, ...)
		-- 如果键存在
		-- If the key exists
		if k then
			-- 如果 hosts 表中没有该键，初始化一个空表
			-- If the key doesn't exist in hosts, initialize an empty table
			if not hosts[k] then hosts[k] = { } end
			-- 更新 hosts 表中的值，优先使用新值
			-- Update values in hosts table, prioritizing new values
			hosts[k][1] = select(1, ...) or hosts[k][1]
			hosts[k][2] = select(2, ...) or hosts[k][2]
			hosts[k][3] = select(3, ...) or hosts[k][3]
			hosts[k][4] = select(4, ...) or hosts[k][4]
		end
	end

	-- 调用 luci.ip.neighbors，遍历网络邻居信息
	-- Call luci.ip.neighbors to iterate over network neighbor information
	luci.ip.neighbors(nil, function(neigh)
		-- 如果邻居有 MAC 地址且是 IPv4 协议
		-- If the neighbor has a MAC address and uses IPv4 protocol
		if neigh.mac and neigh.family == 4 then
			-- 添加 IPv4 相关信息到 hosts 表
			-- Add IPv4-related info to hosts table
			_add(what, neigh.mac:string(), neigh.dest:string(), nil, nil)
		-- 如果邻居有 MAC 地址且是 IPv6 协议
		-- If the neighbor has a MAC address and uses IPv6 protocol
		elseif neigh.mac and neigh.family == 6 then
			-- 添加 IPv6 相关信息到 hosts 表
			-- Add IPv6-related info to hosts table
			_add(what, neigh.mac:string(), nil, neigh.dest:string(), nil)
		end
	end)

	-- 检查 /etc/ethers 文件是否存在
	-- Check if /etc/ethers file exists
	if fs.access("/etc/ethers") then
		-- 逐行读取 /etc/ethers 文件
		-- Read /etc/ethers file line by line
		for e in io.lines("/etc/ethers") do
			-- 匹配 MAC 地址和主机名
			-- Match MAC address and hostname
			mac, name = e:match("^([a-fA-F0-9:-]+)%s+(%S+)")
			-- 验证 MAC 地址格式
			-- Validate MAC address format
			mac = luci.ip.checkmac(mac)
			-- 如果 MAC 和主机名有效
			-- If MAC and hostname are valid
			if mac and name then
				-- 如果主机名是 IPv4 地址
				-- If hostname is an IPv4 address
				if luci.ip.checkip4(name) then
					-- 添加 IPv4 信息到 hosts 表
					-- Add IPv4 info to hosts table
					_add(what, mac, name, nil, nil)
				else
					-- 添加主机名信息到 hosts 表
					-- Add hostname info to hosts table
					_add(what, mac, nil, nil, name)
				end
			end
		end
	end

	-- 遍历 UCI 配置中的 dhcp.dnsmasq 段
	-- Iterate over dhcp.dnsmasq sections in UCI configuration
	cur:foreach("dhcp", "dnsmasq",
		function(s)
			-- 检查是否存在租约文件且可访问
			-- Check if lease file exists and is accessible
			if s.leasefile and fs.access(s.leasefile) then
				-- 逐行读取租约文件
				-- Read lease file line by line
				for e in io.lines(s.leasefile) do
					-- 匹配 MAC 地址、IP 地址和主机名
					-- Match MAC address, IP address, and hostname
					mac, ip, name = e:match("^%d+ (%S+) (%S+) (%S+)")
					-- 验证 MAC 地址格式
					-- Validate MAC address format
					mac = luci.ip.checkmac(mac)
					-- 如果 MAC 和 IP 有效
					-- If MAC and IP are valid
					if mac and ip then
						-- 添加信息到 hosts 表，排除 "*" 主机名
						-- Add info to hosts table, excluding "*" hostname
						_add(what, mac, ip, nil, name ~= "*" and name)
					end
				end
			end
		end
	)

	-- 遍历 UCI 配置中的 dhcp.odhcpd 段
	-- Iterate over dhcp.odhcpd sections in UCI configuration
	cur:foreach("dhcp", "odhcpd",
		function(s)
			-- 检查是否存在租约文件且为字符串类型且可访问
			-- Check if lease file exists, is a string, and is accessible
			if type(s.leasefile) == "string" and fs.access(s.leasefile) then
				-- 逐行读取租约文件
				-- Read lease file line by line
				for e in io.lines(s.leasefile) do
					-- 匹配 DUID、IAID、主机名和 IP 地址
					-- Match DUID, IAID, hostname, and IP address
					duid, iaid, name, _, ip = e:match("^# %S+ (%S+) (%S+) (%S+) (-?%d+) %S+ %S+ ([0-9a-f:.]+)/[0-9]+")
					-- 将 DUID 转换为 MAC 地址
					-- Convert DUID to MAC address
					mac = net.duid_to_mac(duid)
					-- 如果 MAC 地址有效
					-- If MAC address is valid
					if mac then
						-- 如果是 IPv4 地址
						-- If it's an IPv4 address
						if ip and iaid == "ipv4" then
							-- 添加 IPv4 信息到 hosts 表
							-- Add IPv4 info to hosts table
							_add(what, mac, ip, nil, name ~= "*" and name)
						-- 如果是 IPv6 地址
						-- If it's an IPv6 address
						elseif ip then
							-- 添加 IPv6 信息到 hosts 表
							-- Add IPv6 info to hosts table
							_add(what, mac, nil, ip, name ~= "*" and name)
						end
					end
				end
			end
		end
	)

	-- 遍历 UCI 配置中的 dhcp.host 段
	-- Iterate over dhcp.host sections in UCI configuration
	cur:foreach("dhcp", "host",
		function(s)
			-- 遍历主机段中的 MAC 地址列表
			-- Iterate over MAC addresses in the host section
			for mac in luci.util.imatch(s.mac) do
				-- 验证 MAC 地址格式
				-- Validate MAC address format
				mac = luci.ip.checkmac(mac)
				-- 如果 MAC 地址有效
				-- If MAC address is valid
				if mac then
					-- 添加主机信息到 hosts 表
					-- Add host info to hosts table
					_add(what, mac, s.ip, nil, s.name)
				end
			end
		end)

	-- 遍历所有网络接口信息
	-- Iterate over all network interface information
	for _, e in ipairs(nixio.getifaddrs()) do
		-- 排除环回接口 lo
		-- Exclude loopback interface lo
		if e.name ~= "lo" then
			-- 初始化接口信息表
			-- Initialize interface info table
			ifn[e.name] = ifn[e.name] or { }
			-- 如果是链路层信息且地址长度为 17（MAC 地址）
			-- If it's link-layer info and address length is 17 (MAC address)
			if e.family == "packet" and e.addr and #e.addr == 17 then
				-- 设置接口的 MAC 地址（转换为大写）
				-- Set interface MAC address (converted to uppercase)
				ifn[e.name][1] = e.addr:upper()
			-- 如果是 IPv4 地址
			-- If it's an IPv4 address
			elseif e.family == "inet" then
				-- 设置接口的 IPv4 地址
				-- Set interface IPv4 address
				ifn[e.name][2] = e.addr
			-- 如果是 IPv6 地址
			-- If it's an IPv6 address
			elseif e.family == "inet6" then
				-- 设置接口的 IPv6 地址
				-- Set interface IPv6 address
				ifn[e.name][3] = e.addr
			end
		end
	end

	-- 遍历接口信息表
	-- Iterate over interface info table
	for _, e in pairs(ifn) do
		-- 如果接口包含所需信息（what）且有 IPv4 或 IPv6 地址
		-- If interface contains required info (what) and has IPv4 or IPv6 address
		if e[what] and (e[2] or e[3]) then
			-- 添加接口信息到 hosts 表
			-- Add interface info to hosts table
			_add(what, e[1], e[2], e[3], e[4])
		end
	end

	-- 遍历 hosts 表，收集 DNS 查找的键
	-- Iterate over hosts table to collect keys for DNS lookup
	for _, e in pairs(hosts) do
		-- 根据 what 参数选择键（MAC、IPv4 或 IPv6）
		-- Select key based on what parameter (MAC, IPv4, or IPv6)
		lookup[#lookup+1] = (what > 1) and e[what] or (e[2] or e[3])
	end

	-- 如果有需要查找的键
	-- If there are keys to lookup
	if #lookup > 0 then
		-- 调用 ubus 的 network.rrdns.lookup 方法进行 DNS 解析
		-- Call ubus network.rrdns.lookup method for DNS resolution
		lookup = luci.util.ubus("network.rrdns", "lookup", {
			-- 传递需要解析的地址列表
			-- Pass the list of addresses to resolve
			addrs   = lookup,
			-- 设置超时时间为 250 毫秒
			-- Set timeout to 250 milliseconds
			timeout = 250,
			-- 设置最大解析条目数为 1000
			-- Set maximum number of resolved entries to 1000
			limit   = 1000
		}) or { }
	end

	-- 按键排序遍历 hosts 表
	-- Iterate over hosts table sorted by keys
	for _, e in luci.util.kspairs(hosts) do
		-- 调用回调函数，传递 MAC、IPv4、IPv6 和主机名
		-- Call callback with MAC, IPv4, IPv6, and hostname
		callback(e[1], e[2], e[3], lookup[e[2]] or lookup[e[3]] or e[4])
	end
end

-- 定义函数 mac_hints，用于获取 MAC 地址与主机名的映射
-- Define function mac_hints to get mappings of MAC addresses to hostnames
-- Each entry contains the values in the following order:
-- [ "mac", "name" ]
function net.mac_hints(callback)
	-- 如果提供了回调函数
	-- If a callback function is provided
	if callback then
		-- 调用 _nethints，提取 MAC 地址相关信息
		-- Call _nethints to extract MAC address-related info
		_nethints(1, function(mac, v4, v6, name)
			-- 使用主机名或 IPv4 地址作为名称
			-- Use hostname or IPv4 address as name
			name = name or v4
			-- 如果名称有效且不等于 MAC 地址
			-- If name is valid and not equal to MAC address
			if name and name ~= mac then
				-- 调用回调函数，传递 MAC 和名称
				-- Call callback with MAC and name
				callback(mac, name or v4)
			end
		end)
	else
		-- 如果没有回调函数，返回结果表
		-- If no callback, return a result table
		local rv = { }
		-- 调用 _nethints，收集 MAC 地址相关信息
		-- Call _nethints to collect MAC address-related info
		_nethints(1, function(mac, v4, v6, name)
			-- 使用主机名或 IPv4 地址作为名称
			-- Use hostname or IPv4 address as name
			name = name or v4
			-- 如果名称有效且不等于 MAC 地址
			-- If name is valid and not equal to MAC address
			if name and name ~= mac then
				-- 添加 MAC 和名称到结果表
				-- Add MAC and name to result table
				rv[#rv+1] = { mac, name or v4 }
			end
		end)
		-- 返回结果表
		-- Return the result table
		return rv
	end
end

-- 定义函数 ipv4_hints，用于获取 IPv4 地址与主机名的映射
-- Define function ipv4_hints to get mappings of IPv4 addresses to hostnames
-- Each entry contains the values in the following order:
-- [ "ip", "name" ]
function net.ipv4_hints(callback)
	-- 如果提供了回调函数
	-- If a callback function is provided
	if callback then
		-- 调用 _nethints，提取 IPv4 地址相关信息
		-- Call _nethints to extract IPv4 address-related info
		_nethints(2, function(mac, v4, v6, name)
			-- 使用主机名或 MAC 地址作为名称
			-- Use hostname or MAC address as name
			name = name or mac
			-- 如果名称有效且不等于 IPv4 地址
			-- If name is valid and not equal to IPv4 address
			if name and name ~= v4 then
				-- 调用回调函数，传递 IPv4 和名称
				-- Call callback with IPv4 and name
				callback(v4, name)
			end
		end)
	else
		-- 如果没有回调函数，返回结果表
		-- If no callback, return a result table
		local rv = { }
		-- 调用 _nethints，收集 IPv4 地址相关信息
		-- Call _nethints to collect IPv4 address-related info
		_nethints(2, function(mac, v4, v6, name)
			-- 使用主机名或 MAC 地址作为名称
			-- Use hostname or MAC address as name
			name = name or mac
			-- 如果名称有效且不等于 IPv4 地址
			-- If name is valid and not equal to IPv4 address
			if name and name ~= v4 then
				-- 添加 IPv4 和名称到结果表
				-- Add IPv4 and name to result table
				rv[#rv+1] = { v4, name }
			end
		end)
		-- 返回结果表
		-- Return the result table
		return rv
	end
end

-- 定义函数 ipv6_hints，用于获取 IPv6 地址与主机名的映射
-- Define function ipv6_hints to get mappings of IPv6 addresses to hostnames
-- Each entry contains the values in the following order:
-- [ "ip", "name" ]
function net.ipv6_hints(callback)
	-- 如果提供了回调函数
	-- If a callback function is provided
	if callback then
		-- 调用 _nethints，提取 IPv6 地址相关信息
		-- Call _nethints to extract IPv6 address-related info
		_nethints(3, function(mac, v4, v6, name)
			-- 使用主机名或 MAC 地址作为名称
			-- Use hostname or MAC address as name
			name = name or mac
			-- 如果名称有效且不等于 IPv6 地址
			-- If name is valid and not equal to IPv6 address
			if name and name ~= v6 then
				-- 调用回调函数，传递 IPv6 和名称
				-- Call callback with IPv6 and name
				callback(v6, name)
			end
		end)
	else
		-- 如果没有回调函数，返回结果表
		-- If no callback, return a result table
		local rv = { }
		-- 调用 _nethints，收集 IPv6 地址相关信息
		-- Call _nethints to collect IPv6 address-related info
		_nethints(3, function(mac, v4, v6, name)
			-- 使用主机名或 MAC 地址作为名称
			-- Use hostname or MAC address as name
			name = name or mac
			-- 如果名称有效且不等于 IPv6 地址
			-- If name is valid and not equal to IPv6 address
			if name and name ~= v6 then
				-- 添加 IPv6 和名称到结果表
				-- Add IPv6 and name to result table
				rv[#rv+1] = { v6, name }
			end
		end)
		-- 返回结果表
		-- Return the result table
		return rv
	end
end

-- 定义函数 host_hints，用于获取完整的网络主机信息
-- Define function host_hints to get complete network host information
function net.host_hints(callback)
	-- 如果提供了回调函数
	-- If a callback function is provided
	if callback then
		-- 调用 _nethints，提取主机信息
		-- Call _nethints to extract host information
		_nethints(1, function(mac, v4, v6, name)
			-- 如果 MAC 地址有效且非全零，且有 IPv4、IPv6 或主机名
			-- If MAC is valid and not all zeros, and has IPv4, IPv6, or hostname
			if mac and mac ~= "00:00:00:00:00:00" and (v4 or v6 or name) then
				-- 调用回调函数，传递 MAC、IPv4、IPv6 和主机名
				-- Call callback with MAC, IPv4, IPv6, and hostname
				callback(mac, v4, v6, name)
			end
		end)
	else
		-- 如果没有回调函数，返回结果表
		-- If no callback, return a result table
		local rv = { }
		-- 调用 _nethints，收集主机信息
		-- Call _nethints to collect host information
		_nethints(1, function(mac, v4, v6, name)
			-- 如果 MAC 地址有效且非全零，且有 IPv4、IPv6 或主机名
			-- If MAC is valid and not all zeros, and has IPv4, IPv6, or hostname
			if mac and mac ~= "00:00:00:00:00:00" and (v4 or v6 or name) then
				-- 创建主机信息表
				-- Create host info table
				local e = { }
				-- 如果有 IPv4 地址，添加到表
				-- If IPv4 exists, add to table
				if v4   then e.ipv4 = v4   end
				-- 如果有 IPv6 地址，添加到表
				-- If IPv6 exists, add to table
				if v6   then e.ipv6 = v6   end
				-- 如果有主机名，添加到表
				-- If hostname exists, add to table
				if name then e.name = name end
				-- 以 MAC 地址为键存储主机信息
				-- Store host info with MAC address as key
				rv[mac] = e
			end
		end)
		-- 返回结果表
		-- Return the result table
		return rv
	end
end

-- 定义函数 conntrack，用于获取网络连接跟踪信息
-- Define function conntrack to get network connection tracking information
function net.conntrack(callback)
	-- 尝试打开 /proc/net/nf_conntrack 文件
	-- Attempt to open /proc/net/nf_conntrack file
	local ok, nfct = pcall(io.lines, "/proc/net/nf_conntrack")
	-- 如果打开失败或文件不存在，返回 nil
	-- If opening fails or file doesn't exist, return nil
	if not ok or not nfct then
		return nil
	end

	-- 定义局部变量，用于存储行数据和连接跟踪信息
	-- Define local variables for line data and connection tracking info
	local line, connt = nil, (not callback) and { }
	-- 逐行读取连接跟踪文件
	-- Read connection tracking file line by line
	for line in nfct do
		-- 匹配协议族（IPv4/IPv6）、层3协议号、层4协议号和剩余内容
		-- Match protocol family (IPv4/IPv6), layer 3 protocol, layer 4 protocol, and rest
		local fam, l3, l4, rest =
			line:match("^(ipv[46]) +(%d+) +%S+ +(%d+) +(.+)$")

		-- 匹配超时时间和连接元组信息
		-- Match timeout and connection tuple info
		local timeout, tuples = rest:match("^(%d+) +(.+)$")

		-- 如果没有匹配到超时时间，使用整个剩余内容作为元组
		-- If timeout not matched, use entire rest as tuples
		if not tuples then
			tuples = rest
		end

		-- 如果协议族、层3和层4信息有效，且连接状态不是 TIME_WAIT
		-- If protocol family, layer 3, and layer 4 info are valid, and not TIME_WAIT
		if fam and l3 and l4 and not tuples:match("^TIME_WAIT ") then
			-- 将层4协议号转换为协议名称（如 tcp、udp）
			-- Convert layer 4 protocol number to name (e.g., tcp, udp)
			l4 = nixio.getprotobynumber(l4)

			-- 创建连接跟踪条目
			-- Create connection tracking entry
			local entry = {
				-- 初始化字节数为 0
				-- Initialize bytes to 0
				bytes = 0,
				-- 初始化数据包数为 0
				-- Initialize packets to 0
				packets = 0,
				-- 设置层3协议（IPv4 或 IPv6）
				-- Set layer 3 protocol (IPv4 or IPv6)
				layer3 = fam,
				-- 设置层4协议名称（如果未知则为 "unknown"）
				-- Set layer 4 protocol name (or "unknown" if not found)
				layer4 = l4 and l4.name or "unknown",
				-- 设置超时时间（转换为数字）
				-- Set timeout (converted to number)
				timeout = tonumber(timeout, 10)
			}

			-- 定义局部变量，用于解析键值对
			-- Define local variables for parsing key-value pairs
			local key, val
			-- 遍历连接元组中的键值对
			-- Iterate over key-value pairs in connection tuples
			for key, val in tuples:gmatch("(%w+)=(%S+)") do
				-- 如果键是 bytes 或 packets
				-- If key is bytes or packets
				if key == "bytes" or key == "packets" then
					-- 累加值到条目中
					-- Accumulate value to entry
					entry[key] = entry[key] + tonumber(val, 10)
				-- 如果键是 src 或 dst
				-- If key is src or dst
				elseif key == "src" or key == "dst" then
					-- 如果条目中尚未设置该键
					-- If key is not yet set in entry
					if entry[key] == nil then
						-- 将值转换为 IP 地址字符串
						-- Convert value to IP address string
						entry[key] = luci.ip.new(val):string()
					end
				-- 如果键是 sport 或 dport
				-- If key is sport or dport
				elseif key == "sport" or key == "dport" then
					-- 如果条目中尚未设置该键
					-- If key is not yet set in entry
					if entry[key] == nil then
						-- 直接存储值（端口号）
						-- Store value directly (port number)
						entry[key] = val
					end
				-- 如果值存在，存储到条目
				-- If value exists, store in entry
				elseif val then
					entry[key] = val
				end
			end

			-- 如果提供了回调函数
			-- If a callback function is provided
			if callback then
				-- 调用回调函数，传递连接条目
				-- Call callback with connection entry
				callback(entry)
			else
				-- 将连接条目添加到结果表
				-- Add connection entry to result table
				connt[#connt+1] = entry
			end
		end
	end

	-- 如果提供了回调函数，返回 true，否则返回连接表
	-- Return true if callback provided, otherwise return connection table
	return callback and true or connt
end

-- 定义函数 devices，用于获取所有网络设备名称
-- Define function devices to get all network device names
function net.devices()
	-- 定义表，用于存储设备名称
	-- Define table to store device names
	local devs = {}
	-- 定义表，用于记录已处理的设备（避免重复）
	-- Define table to track processed devices (avoid duplicates)
	local seen = {}
	-- 遍历 nixio.getifaddrs() 返回的接口信息
	-- Iterate over interface information from nixio.getifaddrs()
	for k, v in ipairs(nixio.getifaddrs()) do
		-- 如果接口名称存在且未处理
		-- If interface name exists and hasn't been processed
		if v.name and not seen[v.name] then
			-- 标记接口为已处理
			-- Mark interface as processed
			seen[v.name] = true
			-- 添加接口名称到设备表
			-- Add interface name to devices table
			devs[#devs+1] = v.name
		end
	end
	-- 返回设备名称表
	-- Return devices table
	return devs
end

-- 定义函数 duid_to_mac，用于将 DHCPv6 DUID 转换为 MAC 地址
-- Define function duid_to_mac to convert DHCPv6 DUID to MAC address
function net.duid_to_mac(duid)
	-- 定义局部变量，用于存储 MAC 地址的 6 个字节
	-- Define local variables to store 6 bytes of MAC address
	local b1, b2, b3, b4, b5, b6

	-- 检查 duid 是否为字符串
	-- Check if duid is a string
	if type(duid) == "string" then
		-- 如果 DUID 长度为 28（DUID-LLT / Ethernet）
		-- If DUID length is 28 (DUID-LLT / Ethernet)
		if #duid == 28 then
			-- 匹配 DUID-LLT 格式，提取 MAC 地址字节
			-- Match DUID-LLT format and extract MAC address bytes
			b1, b2, b3, b4, b5, b6 = duid:match("^00010001(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)%x%x%x%x%x%x%x%x$")
		-- 如果 DUID 长度为 20（DUID-LL / Ethernet）
		-- If DUID length is 20 (DUID-LL / Ethernet)
		elseif #duid == 20 then
			-- 匹配 DUID-LL 格式，提取 MAC 地址字节
			-- Match DUID-LL format and extract MAC address bytes
			b1, b2, b3, b4, b5, b6 = duid:match("^00030001(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)$")
		-- 如果 DUID 长度为 12（无头 DUID-LL / Ethernet）
		-- If DUID length is 12 (DUID-LL / Ethernet without header)
		elseif #duid == 12 then
			-- 匹配无头 DUID-LL 格式，提取 MAC 地址字节
			-- Match headerless DUID-LL format and extract MAC address bytes
			b1, b2, b3, b4, b5, b6 = duid:match("^(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)(%x%x)$")
		end
	end

	-- 如果提取到所有字节，将其连接为标准 MAC 地址格式并验证
	-- If all bytes are extracted, join them into standard MAC address format and validate
	return b1 and luci.ip.checkmac(table.concat({ b1, b2, b3, b4, b5, b6 }, ":"))
end

-- 定义 process 表，用于存储进程相关的功能
-- Define process table to store process-related functionality
process = {}

-- 定义函数 info，用于获取当前进程的用户和组信息
-- Define function info to get user and group info of the current process
function process.info(key)
	-- 创建表，存储当前进程的 UID 和 GID
	-- Create table to store UID and GID of the current process
	local s = {uid = nixio.getuid(), gid = nixio.getgid()}
	-- 如果未指定键，返回整个表，否则返回指定键的值
	-- If no key specified, return entire table, otherwise return value for key
	return not key and s or s[key]
end

-- 定义函数 list，用于获取系统中所有进程的信息
-- Define function list to get information about all processes in the system
function process.list()
	-- 定义表，用于存储进程信息
	-- Define table to store process information
	local data = {}
	-- 定义局部变量 k（未使用，但保留以符合 Lua 习惯）
	-- Define local variable k (unused, kept for Lua convention)
	local k
	-- 执行 busybox top -bn1 命令，获取进程快照
	-- Execute busybox top -bn1 command to get process snapshot
	local ps = luci.util.execi("/bin/busybox top -bn1")

	-- 如果命令执行失败，返回空表
	-- If command execution fails, return empty table
	if not ps then
		return
	end

	-- 逐行读取 top 命令输出
	-- Read top command output line by line
	for line in ps do
		-- 匹配进程信息（PID、PPID、用户、状态、虚拟内存、内存占用、CPU 占用、命令）
		-- Match process info (PID, PPID, user, status, virtual memory, memory usage, CPU usage, command)
		local pid, ppid, user, stat, vsz, mem, cpu, cmd = line:match(
			"^ *(%d+) +(%d+) +(%S.-%S) +([RSDZTW][<NW ][<N ]) +(%d+m?) +(%d+%%) +(%d+%%) +(.+)"
		)

		-- 将 PID 转换为数字
		-- Convert PID to number
		local idx = tonumber(pid)
		-- 如果 PID 有效且命令不是 top -bn1 本身
		-- If PID is valid and command is not top -bn1 itself
		if idx and not cmd:match("top %-bn1") then
			-- 创建进程信息表
			-- Create process info table
			data[idx] = {
				-- 存储进程 ID
				-- Store process ID
				['PID']     = pid,
				-- 存储父进程 ID
				-- Store parent process ID
				['PPID']    = ppid,
				-- 存储运行用户
				-- Store running user
				['USER']    = user,
				-- 存储进程状态
				-- Store process status
				['STAT']    = stat,
				-- 存储虚拟内存大小
				-- Store virtual memory size
				['VSZ']     = vsz,
				-- 存储内存占用百分比
				-- Store memory usage percentage
				['%MEM']    = mem,
				-- 存储 CPU 占用百分比
				-- Store CPU usage percentage
				['%CPU']    = cpu,
				-- 存储命令名称
				-- Store command name
				['COMMAND'] = cmd
			}
		end
	end

	-- 返回进程信息表
	-- Return process info table
	return data
end

-- 定义函数 setgroup，用于设置当前进程的组 ID
-- Define function setgroup to set the group ID of the current process
function process.setgroup(gid)
	-- 调用 nixio.setgid 设置组 ID
	-- Call nixio.setgid to set group ID
	return nixio.setgid(gid)
end

-- 定义函数 setuser，用于设置当前进程的用户 ID
-- Define function setuser to set the user ID of the current process
function process.setuser(uid)
	-- 调用 nixio.setuid 设置用户 ID
	-- Call nixio.setuid to set user ID
	return nixio.setuid(uid)
end

-- 将 nixio.kill 赋值给 process.signal，用于发送信号给进程
-- Assign nixio.kill to process.signal for sending signals to processes
process.signal = nixio.kill

-- 定义内部函数 xclose，用于安全关闭文件描述符
-- Define internal function xclose to safely close file descriptors
local function xclose(fd)
	-- 如果文件描述符存在且编号大于 2（排除 stdin、stdout、stderr）
	-- If file descriptor exists and its number is greater than 2 (exclude stdin, stdout, stderr)
	if fd and fd:fileno() > 2 then
		-- 关闭文件描述符
		-- Close the file descriptor
		fd:close()
	end
end

-- 定义函数 exec，用于执行命令并处理标准输出和错误输出
-- Define function exec to execute commands and handle stdout and stderr
function process.exec(command, stdout, stderr, nowait)
	-- 定义局部变量，用于存储管道文件描述符
	-- Define local variables to store pipe file descriptors
	local out_r, out_w, err_r, err_w
	-- 如果需要处理标准输出，创建管道
	-- If stdout handling is needed, create a pipe
	if stdout then out_r, out_w = nixio.pipe() end
	-- 如果需要处理标准错误，创建管道
	-- If stderr handling is needed, create a pipe
	if stderr then err_r, err_w = nixio.pipe() end

	-- 创建子进程
	-- Create a child process
	local pid = nixio.fork()
	-- 如果是子进程（pid == 0）
	-- If in child process (pid == 0)
	if pid == 0 then
		-- 将工作目录切换到根目录
		-- Change working directory to root
		nixio.chdir("/")

		-- 打开 /dev/null 用于重定向
		-- Open /dev/null for redirection
		local null = nixio.open("/dev/null", "w+")
		-- 如果 /dev/null 打开成功
		-- If /dev/null opened successfully
		if null then
			-- 将标准输出重定向到 out_w 或 /dev/null
			-- Redirect stdout to out_w or /dev/null
			nixio.dup(out_w or null, nixio.stdout)
			-- 将标准错误重定向到 err_w 或 /dev/null
			-- Redirect stderr to err_w or /dev/null
			nixio.dup(err_w or null, nixio.stderr)
			-- 将标准输入重定向到 /dev/null
			-- Redirect stdin to /dev/null
			nixio.dup(null, nixio.stdin)
			-- 关闭输出管道的写端
			-- Close output pipe write end
			xclose(out_w)
			-- 关闭输出管道的读端
			-- Close output pipe read end
			xclose(out_r)
			-- 关闭错误管道的写端
			-- Close error pipe write end
			xclose(err_w)
			-- 关闭错误管道的读端
			-- Close error pipe read end
			xclose(err_r)
			-- 关闭 /dev/null 文件描述符
			-- Close /dev/null file descriptor
			xclose(null)
		end

		-- 执行命令，替换当前进程
		-- Execute command, replacing current process
		nixio.exec(unpack(command))
		-- 如果执行失败，退出子进程
		-- If execution fails, exit child process
		os.exit(-1)
	end

	-- 定义局部变量，用于存储轮询文件描述符和返回值
	-- Define local variables for polling file descriptors and return value
	local _, pfds, rv = nil, {}, { code = -1, pid = pid }

	-- 关闭输出管道的写端
	-- Close output pipe write end
	xclose(out_w)
	-- 关闭错误管道的写端
	-- Close error pipe write end
	xclose(err_w)

	-- 如果有输出管道的读端
	-- If output pipe read end exists
	if out_r then
		-- 添加到轮询文件描述符表
		-- Add to polling file descriptors table
		pfds[#pfds+1] = {
			-- 设置文件描述符为输出管道的读端
			-- Set file descriptor to output pipe read end
			fd = out_r,
			-- 设置回调函数（如果 stdout 是函数）
			-- Set callback function (if stdout is a function)
			cb = type(stdout) == "function" and stdout,
			-- 设置名称为 stdout
			-- Set name to stdout
			name = "stdout",
			-- 设置轮询事件（输入、错误、挂起）
			-- Set polling events (input, error, hangup)
			events = nixio.poll_flags("in", "err", "hup")
		}
	end

	-- 如果有错误管道的读端
	-- If error pipe read end exists
	if err_r then
		-- 添加到轮询文件描述符表
		-- Add to polling file descriptors table
		pfds[#pfds+1] = {
			-- 设置文件描述符为错误管道的读端
			-- Set file descriptor to error pipe read end
			fd = err_r,
			-- 设置回调函数（如果 stderr 是函数）
			-- Set callback function (if stderr is a function)
			cb = type(stderr) == "function" and stderr,
			-- 设置名称为 stderr
			-- Set name to stderr
			name = "stderr",
			-- 设置轮询事件（输入、错误、挂起）
			-- Set polling events (input, error, hangup)
			events = nixio.poll_flags("in", "err", "hup")
		}
	end

	-- 当轮询文件描述符表不为空时
	-- While polling file descriptors table is not empty
	while #pfds > 0 do
		-- 调用 nixio.poll 轮询文件描述符，超时时间为 -1（无限等待）
		-- Call nixio.poll to poll file descriptors with timeout -1 (infinite wait)
		local nfds, err = nixio.poll(pfds, -1)
		-- 如果轮询失败且错误不是 EINTR，退出循环
		-- If polling fails and error is not EINTR, break the loop
		if not nfds and err ~= nixio.const.EINTR then
			break
		end

		-- 定义局部变量 i，用于遍历文件描述符
		-- Define local variable i for iterating file descriptors
		local i
		-- 从后向前遍历轮询文件描述符表
		-- Iterate polling file descriptors table from end to start
		for i = #pfds, 1, -1 do
			-- 获取当前文件描述符
			-- Get current file descriptor
			local rfd = pfds[i]
			-- 如果有轮询事件发生
			-- If polling events occurred
			if rfd.revents > 0 then
				-- 读取文件描述符中的数据块（最大 4096 字节）
				-- Read data chunk from file descriptor (max 4096 bytes)
				local chunk, err = rfd.fd:read(4096)
				-- 如果读取到数据
				-- If data is read
				if chunk and #chunk > 0 then
					-- 如果有回调函数
					-- If callback function exists
					if rfd.cb then
						-- 调用回调函数，传递数据块
						-- Call callback with data chunk
						rfd.cb(chunk)
					else
						-- 初始化缓冲区表
						-- Initialize buffer table
						rfd.buf = rfd.buf or {}
						-- 将数据块添加到缓冲区
						-- Add data chunk to buffer
						rfd.buf[#rfd.buf + 1] = chunk
					end
				else
					-- 从轮询文件描述符表中移除当前描述符
					-- Remove current descriptor from polling table
					table.remove(pfds, i)
					-- 如果有缓冲区，将其连接为字符串并存储到返回值
					-- If buffer exists, concatenate it to string and store in return value
					if rfd.buf then
						rv[rfd.name] = table.concat(rfd.buf, "")
					end
					-- 关闭文件描述符
					-- Close file descriptor
					rfd.fd:close()
				end
			end
		end
	end

	-- 如果不需要异步执行
	-- If not executing asynchronously
	if not nowait then
		-- 等待子进程结束并获取退出状态码
		-- Wait for child process to end and get exit status code
		_, _, rv.code = nixio.waitpid(pid)
	end

	-- 返回执行结果
	-- Return execution result
	return rv
end

-- 定义 user 表，用于存储用户相关的功能
-- Define user table to store user-related functionality
user = {}

-- 将 nixio.getpw 赋值给 user.getuser，用于获取用户信息
-- Assign nixio.getpw to user.getuser to get user information
-- { "uid", "gid", "name", "passwd", "dir", "shell", "gecos" }
user.getuser = nixio.getpw

-- 定义函数 getpasswd，用于获取用户密码信息
-- Define function getpasswd to get user password information
function user.getpasswd(username)
	-- 尝试从影子密码文件获取用户信息，如果失败则从普通密码文件获取
	-- Try to get user info from shadow password file, fallback to regular password file
	local pwe = nixio.getsp and nixio.getsp(username) or nixio.getpw(username)
	-- 获取密码字段（影子密码或普通密码）
	-- Get password field (shadow or regular)
	local pwh = pwe and (pwe.pwdp or pwe.passwd)
	-- 如果密码不存在或为空
	-- If password doesn't exist or is empty
	if not pwh or #pwh < 1 then
		-- 返回 nil 和用户信息
		-- Return nil and user info
		return nil, pwe
	else
		-- 返回密码和用户信息
		-- Return password and user info
		return pwh, pwe
	end
end

-- 定义函数 checkpasswd，用于验证用户密码
-- Define function checkpasswd to verify user password
function user.checkpasswd(username, pass)
	-- 获取用户密码和用户信息
	-- Get user password and user info
	local pwh, pwe = user.getpasswd(username)
	-- 如果用户信息存在
	-- If user info exists
	if pwe then
		-- 验证密码（如果密码为空或加密后匹配）
		-- Verify password (if password is empty or matches after encryption)
		return (pwh == nil or nixio.crypt(pass, pwh) == pwh)
	end
	-- 如果用户信息不存在，返回 false
	-- If user info doesn't exist, return false
	return false
end

-- 定义函数 setpasswd，用于设置用户密码
-- Define function setpasswd to set user password
function user.setpasswd(username, password)
	-- 执行 passwd 命令，通过管道输入两次密码确认
	-- Execute passwd command, piping password twice for confirmation
	return os.execute("(echo %s; sleep 1; echo %s) | busybox passwd %s >/dev/null 2>&1" %{
		-- 第一次输入密码（防止 Shell 注入）
		-- First password input (shell-escaped to prevent injection)
		luci.util.shellquote(password),
		-- 第二次输入密码（防止 Shell 注入）
		-- Second password input (shell-escaped to prevent injection)
		luci.util.shellquote(password),
		-- 用户名（防止 Shell 注入）
		-- Username (shell-escaped to prevent injection)
		luci.util.shellquote(username)
	})
end

-- 定义 wifi 表，用于存储无线相关的功能
-- Define wifi table to store wireless-related functionality
wifi = {}

-- 定义函数 getiwinfo，用于获取指定无线接口的信息
-- Define function getiwinfo to get information for a specific wireless interface
function wifi.getiwinfo(ifname)
	-- 导入 luci.model.network 模块，用于访问网络配置
	-- Import luci.model.network module to access network configuration
	local ntm = require "luci.model.network"

	-- 初始化网络模块
	-- Initialize network module
	ntm.init()

	-- 获取指定接口的无线网络对象
	-- Get wireless network object for the specified interface
	local wnet = ntm:get_wifinet(ifname)
	-- 如果无线网络对象存在且有 iwinfo 属性
	-- If wireless network object exists and has iwinfo property
	if wnet and wnet.iwinfo then
		-- 返回 iwinfo 属性
		-- Return iwinfo property
		return wnet.iwinfo
	end

	-- 获取指定接口的无线设备对象
	-- Get wireless device object for the specified interface
	local wdev = ntm:get_wifidev(ifname)
	-- 如果无线设备对象存在且有 iwinfo 属性
	-- If wireless device object exists and has iwinfo property
	if wdev and wdev.iwinfo then
		-- 返回 iwinfo 属性
		-- Return iwinfo property
		return wdev.iwinfo
	end

	-- 如果无法获取无线信息，返回仅包含接口名称的表
	-- If wireless info cannot be retrieved, return table with interface name
	return { ifname = ifname }
end

-- 定义 init 表，用于存储系统服务相关的功能
-- Define init table to store system service-related functionality
init = {}

-- 设置 init.dir 为系统服务脚本目录
-- Set init.dir to system service scripts directory
init.dir = "/etc/init.d/"

-- 定义函数 names，用于获取所有系统服务名称
-- Define function names to get all system service names
function init.names()
	-- 定义表，用于存储服务名称
	-- Define table to store service names
	local names = { }
	-- 遍历 /etc/init.d/ 目录中的所有文件
	-- Iterate over all files in /etc/init.d/ directory
	for name in fs.glob(init.dir.."*") do
		-- 提取文件名并添加到 names 表
		-- Extract filename and add to names table
		names[#names+1] = fs.basename(name)
	end
	-- 返回服务名称表
	-- Return service names table
	return names
end

-- 定义函数 index，用于获取系统服务的启动顺序
-- Define function index to get the startup order of a system service
function init.index(name)
	-- 提取服务名称（去除路径）
	-- Extract service name (remove path)
	name = fs.basename(name)
	-- 检查服务脚本是否存在
	-- Check if service script exists
	if fs.access(init.dir..name) then
		-- 执行脚本的 enabled 命令，获取 START 变量值作为启动顺序
		-- Execute script's enabled command to get START variable as startup order
		return call("env -i sh -c 'source %s%s enabled; exit ${START:-255}' >/dev/null"
			%{ init.dir, name })
	end
end

-- 定义内部函数 init_action，用于执行服务相关操作
-- Define internal function init_action to perform service-related operations
local function init_action(action, name)
	-- 提取服务名称（去除路径）
	-- Extract service name (remove path)
	name = fs.basename(name)
	-- 检查服务脚本是否存在
	-- Check if service script exists
	if fs.access(init.dir..name) then
		-- 执行指定的服务操作（如 start、stop）
		-- Execute specified service action (e.g., start, stop)
		return call("env -i %s%s %s >/dev/null" %{ init.dir, name, action })
	end
end

-- 定义函数 enabled，用于检查服务是否启用
-- Define function enabled to check if a service is enabled
function init.enabled(name)
	-- 调用 init_action 执行 enabled 操作，返回结果（0 表示启用）
	-- Call init_action with enabled operation, return result (0 means enabled)
	return (init_action("enabled", name) == 0)
end

-- 定义函数 enable，用于启用服务
-- Define function enable to enable a service
function init.enable(name)
	-- 调用 init_action 执行 enable 操作，返回结果（0 表示成功）
	-- Call init_action with enable operation, return result (0 means success)
	return (init_action("enable", name) == 0)
end

-- 定义函数 disable，用于禁用服务
-- Define function disable to disable a service
function init.disable(name)
	-- 调用 init_action 执行 disable 操作，返回结果（0 表示成功）
	-- Call init_action with disable operation, return result (0 means success)
	return (init_action("disable", name) == 0)
end

-- 定义函数 start，用于启动服务
-- Define function start to start a service
function init.start(name)
	-- 调用 init_action 执行 start 操作，返回结果（0 表示成功）
	-- Call init_action with start operation, return result (0 means success)
	return (init_action("start", name) == 0)
end

-- 定义函数 stop，用于停止服务
-- Define function stop to stop a service
function init.stop(name)
	-- 调用 init_action 执行 stop 操作，返回结果（0 表示成功）
	-- Call init_action with stop operation, return result (0 means success)
	return (init_action("stop", name) == 0)
end

-- 定义函数 restart，用于重启服务
-- Define function restart to restart a service
function init.restart(name)
	-- 调用 init_action 执行 restart 操作，返回结果（0 表示成功）
	-- Call init_action with restart operation, return result (0 means success)
	return (init_action("restart", name) == 0)
end

-- 定义函数 reload，用于重新加载服务
-- Define function reload to reload a service
function init.reload(name)
	-- 调用 init_action 执行 reload 操作，返回结果（0 表示成功）
	-- Call init_action with reload operation, return result (0 means success)
	return (init_action("reload", name) == 0)
end
