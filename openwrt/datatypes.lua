-- Copyright 2010 Jo-Philipp Wich <jow@openwrt.org>
-- Copyright 2017 Dan Luedtke <mail@danrl.com>
-- Licensed to the public under the Apache License 2.0.

local fs = require "nixio.fs"
local ip = require "luci.ip"
local math = require "math"
local util = require "luci.util"
local tonumber, tostring, type, unpack, select = tonumber, tostring, type, unpack, select

module "luci.cbi.datatypes"

-- 或逻辑验证：检查值 v 是否满足多个条件中的任意一个
-- @param v 要验证的值
-- @param ... 验证Specs: 验证条件，可以是值、数字或函数
-- @return boolean 如果满足任一条件返回 true，否则返回 false
_M['or'] = function(v, ...)
	local i, n = 1, select('#', ...)
	while i <= n do
		local f = select(i, ...)
		if type(f) ~= "function" then
			i = i + 1
            if type(f) == "number" then
                c = tonumber(c)
            end
            if f == c then
                return true
            end
        else
            i = i + 2
            local a = select(i-1, ...)
            if f(v, unpack(a)) then
                return true
            end
        end
    end
    return false
end

-- 与逻辑验证：检查值 v 是否满足所有条件
-- @param v 要验证的值
-- @param ... 验证条件，可以是值、数字或函数
-- @return boolean 如果满足所有条件返回 true，否则返回 false
_M['and'] = function(v, ...)
	local i, n = 1, select('#', ...)
	while i <= n do
		local f = select(i, ...)
		if type(f) ~= "function" then
			i = i + 1
			local c = v
			if type(f) == "number" then
				c = tonumber(c)
			end
			if f ~= c then
				return false
			end
			i = i - 1
		else
			i = i + 2
			local a = select(i-1, ...)
			if not f(v, unpack(a)) then
				return false
			end
		end
	end
	return true
end

-- 否定验证：对值 v 去除前导 "! " 后，检查是否满足任一条件
-- @param v 要验证的值
-- @param ... 验证条件
-- @return boolean 如果满足任一条件返回 true，否则返回 false
function neg(v, ...)
	return _M['or'](v:gsub("^%s*!%s*", ""), ...)
end

-- 列表验证：验证字符串 v 中的每个非空子字符串是否都满足指定验证函数
-- @param v 要验证的字符串
-- @param subvalidator 验证每个子字符串的函数
-- @param subargs 传递给 subvalidator 的额外参数
-- @return boolean 如果所有子字符串都通过验证返回 true，否则返回 false
function list(v, subvalidator, subargs)
	if type(subvalidator) ~= "function" then
		return false
	end
	local token
	for token in v:gmatch("%S+") do
		if not subvalidator(token, unpack(subargs)) then
			return false
		end
	end
	return true
end

-- 布尔值验证：检查值是否为布尔值或布尔值字符串
-- @param val 要验证的值
-- @return boolean 如果是 "1", "yes", "on", "true", "0", "no", "off", "false" 或空值返回 true，否则返回 false
function bool(val)
	if val == "1" or val == "yes" or val == "on" or val == "true" then
		return true
	elseif val == "0" or val == "no" or val == "off" or val == "false" then
		return true
	elseif val == "" or val == nil then
		return true
	end

	return false
end

-- 无符号整数验证：检查值是否为非负整数
-- @param val 要验证的值
-- @return boolean 如果是整数且 >= 0 返回 true，否则返回 false
function uinteger(val)
	local n = tonumber(val)
	if n ~= nil and math.floor(n) == n and n >= 0 then
		return true
	end

	return false
end

-- 整数验证：检查值是否为整数
-- @param val 要验证的值
-- @return boolean 如果是整数返回 true，否则返回 false
function integer(val)
	local n = tonumber(val)
	if n ~= nil and math.floor(n) == n then
		return true
	end

	return false
end

-- 无符号浮点数验证：检查值是否为非负浮点数
-- @param val 要验证的值
-- @return boolean 如果是浮点数且 >= 0 返回 true，否则返回 false
function ufloat(val)
	local n = tonumber(val)
	return ( n ~= nil and n >= 0 )
end

-- 浮点数验证：检查值是否为浮点数
-- @param val 要验证的值
-- @return boolean 如果是浮点数返回 true，否则返回 false
function float(val)
	return ( tonumber(val) ~= nil )
end

-- IP 地址验证：检查值是否为有效的 IPv4 或 IPv6 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 IP 地址返回 true，否则返回 false
function ipaddr(val)
	return ip4addr(val) or ip6addr(val)
end

-- IPv4 地址验证：检查值是否为有效的 IPv4 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 地址返回 true，否则返回 false
function ip4addr(val)
	if val then
		return ip.IPv4(val) and true or false
	end

	return false
end

-- IPv4 前缀验证：检查值是否为有效的 IPv4 子网掩码前缀（0-32）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 前缀返回 true，否则返回 false
function ip4prefix(val)
	val = tonumber(val)
	return ( val and val >= 0 and val <= 32 )
end

-- IPv6 地址验证：检查值是否为有效的 IPv6 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 地址返回 true，否则返回 false
function ip6addr(val)
	if val then
		return ip.IPv6(val) and true or false
	end

	return false
end

-- IPv6 前缀验证：检查值是否为有效的 IPv6 子网掩码前缀（0-128）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 前缀返回 true，否则返回 false
function ip6prefix(val)
	val = tonumber(val)
	return ( val and val >= 0 and val <= 128 )
end

-- CIDR 验证：检查值是否为有效的 IPv4 或 IPv6 CIDR 格式
-- @param val 要验证的值
-- @return boolean 如果是有效的 CIDR 返回 true，否则返回 false
function cidr(val)
	return cidr4(val) or cidr6(val)
end

-- IPv4 CIDR 验证：检查值是否为有效的 IPv4 CIDR 格式（IP/掩码）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 CIDR 返回 true，否则返回 false
function cidr4(val)
	local ip, mask = val:match("^([^/]+)/([^/]+)$")

	return ip4addr(ip) and ip4prefix(mask)
end

-- IPv6 CIDR 验证：检查值是否为有效的 IPv6 CIDR 格式（IP/掩码）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 CIDR 返回 true，否则返回 false
function cidr6(val)
	local ip, mask = val:match("^([^/]+)/([^/]+)$")

	return ip6addr(ip) and ip6prefix(mask)
end

-- IPv4 网络验证：检查值是否为有效的 IPv4 地址和掩码组合
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 网络返回 true，否则返回 false
function ipnet4(val)
	local ip, mask = val:match("^([^/]+)/([^/]+)$")

	return ip4addr(ip) and ip4addr(mask)
end

-- IPv6 网络验证：检查值是否为有效的 IPv6 地址和掩码组合
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 网络返回 true，否则返回 false
function ipnet6(val)
	local ip, mask = val:match("^([^/]+)/([^/]+)$")

	return ip6addr(ip) and ip6addr(mask)
end

-- IP 掩码验证：检查值是否为有效的 IPv4 或 IPv6 地址/掩码
-- @param val 要验证的值
-- @return boolean 如果是有效的 IP 掩码返回 true，否则返回 false
function ipmask(val)
	return ipmask4(val) or ipmask6(val)
end

-- IPv4 掩码验证：检查值是否为有效的 IPv4 CIDR、IP 网络或 IPv4 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 掩码返回 true，否则返回 false
function ipmask4(val)
	return cidr4(val) or ipnet4(val) or ip4addr(val)
end

-- IPv6 掩码验证：检查值是否为有效的 IPv6 CIDR、IP 网络或 IPv6 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 掩码返回 true，否则返回 false
function ipmask6(val)
	return cidr6(val) or ipnet6(val) or ip6addr(val)
end

-- IPv6 主机 ID 验证：检查值是否为有效的 IPv6 主机 ID（eui64、random 或特定格式）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv6 主机 ID 返回 true，否则返回 false
function ip6hostid(val)
	if val == "eui64" or val == "random" then
		return true
	else
		local addr = ip.IPv6(val)
		if addr and addr:prefix() == 128 and addr:lower("::1:0:0:0:0") then
			return true
		end
	end

	return false
end

-- 端口验证：检查值是否为有效的端口号（0-65535）
-- @param val 要验证的值
-- @return boolean 如果是有效的端口号返回 true，否则返回 false
function port(val)
	val = tonumber(val)
	return ( val and val >= 0 and val <= 65535 )
end

-- 端口范围验证：检查值是否为有效的端口号或端口范围（如 80-443）
-- @param val 要验证的值
-- @return boolean 如果是有效的端口或端口范围返回 true，否则返回 false
function portrange(val)
	local p1, p2 = val:match("^(%d+)%-(%d+)$")
	if p1 and p2 and port(p1) and port(p2) then
		return true
	else
		return port(val)
	end
end

-- MAC 地址验证：检查值是否为有效的 MAC 地址
-- @param val 要验证的值
-- @return boolean 如果是有效的 MAC 地址返回 true，否则返回 false
function macaddr(val)
	return ip.checkmac(val) and true or false
end

-- 主机名验证：检查值是否为有效的主机名
-- @param val 要验证的值
-- @param strict 是否严格检查（禁止以下划线开头）
-- @return boolean 如果是有效的主机名返回 true，否则返回 false
function hostname(val, strict)
	if val and (#val < 254) and (
	   val:match("^[a-zA-Z_]+$") or
	   (val:match("^[a-zA-Z0-9_][a-zA-Z0-9_%-%.]*[a-zA-Z0-9]$") and
	    val:match("[^0-9%.]"))
	) then
		return (not strict or not val:match("^_"))
	end
	return false
end

-- 主机验证：检查值是否为主机名或 IP 地址
-- @param val 要验证的值
-- @param ipv4only 是否仅允许 IPv4 地址
-- @return boolean 如果是有效的主机名或 IP 地址返回 true，否则返回 false
function host(val, ipv4only)
	return hostname(val) or ((ipv4only == 1) and ip4addr(val)) or ((not (ipv4only == 1)) and ipaddr(val))
end

-- 主机和端口验证：检查值是否为主机名或 IP 地址加端口号（如 host:port）
-- @param val 要验证的值
-- @param ipv4only 是否仅允许 IPv4 地址
-- @return boolean 如果是有效的主机和端口返回 true，否则返回 false
function hostport(val, ipv4only)
	local h, p = val:match("^([^:]+):([^:]+)$")
	return not not (h and p and host(h, ipv4only) and port(p))
end

-- IPv4 地址和端口验证：检查值是否为 IPv4 地址加端口号（如 ip:port）
-- @param val 要验证的值
-- @return boolean 如果是有效的 IPv4 地址和端口返回 true，否则返回 false
function ip4addrport(val)
	local h, p = val:match("^([^:]+):([^:]+)$")
	return (h and p and ip4addr(h) and port(p))
end

-- IP 地址和端口验证：检查值是否为 IP 地址加端口号（支持 IPv4 和 IPv6）
-- @param val 要验证的值
-- @param bracket 是否支持 IPv6 地址的方括号格式（如 [IPv6]:port）
-- @return boolean 如果是有效的 IP 地址和端口返回 true，否则返回 false
function ipaddrport(val, bracket)
	local h, p = val:match("^([^%[%]:]+):([^:]+)$")
	if (h and p and ip4addr(h) and port(p)) then
		return true
	elseif (bracket == 1) then
		h, p = val:match("^%[(.+)%]:([^:]+)$")
		if  (h and p and ip6addr(h) and port(p)) then
			return true
		end
	end
	h, p = val:match("^([^%[%]]+):([^:]+)$")
	return (h and p and ip6addr(h) and port(p))
end

-- WPA 密钥验证：检查值是否为有效的 WPA 密钥（64 位十六进制或 8-63 位字符串）
-- @param val 要验证的值
-- @return boolean 如果是有效的 WPA 密钥返回 true，否则返回 false
function wpakey(val)
	if #val == 64 then
		return (val:match("^[a-fA-F0-9]+$") ~= nil)
	else
		return (#val >= 8) and (#val <= 63)
	end
end

-- WEP 密钥验证：检查值是否为有效的 WEP 密钥（5、13 字符或 10、26 位十六进制）
-- @param val 要验证的值
-- @return boolean 如果是有效的 WEP 密钥返回 true，否则返回 false
function wepkey(val)
	if val:sub(1, 2) == "s:" then
		val = val:sub(3)
	end

	if (#val == 10) or (#val == 26) then
		return (val:match("^[a-fA-F0-9]+$") ~= nil)
	else
		return (#val == 5) or (#val == 13)
	end
end

-- 十六进制字符串验证：检查值是否为有效的十六进制字符串
-- @param val 要验证的值
-- @return boolean 如果是有效的十六进制字符串返回 true，否则返回 false
function hexstring(val)
	if val then
		return (val:match("^[a-fA-F0-9]+$") ~= nil)
	end
	return false
end

-- 十六进制值验证：检查值是否为以 0x 开头的十六进制值，且长度不超过指定字节数
-- @param val 要验证的值
-- @param maxbytes 最大字节数
-- @return boolean 如果是有效的十六进制值返回 true，否则返回 false
function hex(val, maxbytes)
	maxbytes = tonumber(maxbytes)
	if val and maxbytes ~= nil then
		return ((val:match("^0x[a-fA-F0-9]+$") ~= nil) and (#val <= 2 + maxbytes * 2))
	end
	return false
end

-- Base64 验证：检查值是否为有效的 Base64 编码字符串
-- @param val 要验证的值
-- @return boolean 如果是有效的 Base64 字符串返回 true，否则返回 false
function base64(val)
	if val then
		return (val:match("^[a-zA-Z0-9/+]+=?=?$") ~= nil) and (math.fmod(#val, 4) == 0)
	end
	return false
end

-- 字符串验证：检查值是否为字符串（任何值都视为字符串）
-- @param val 要验证的值
-- @return boolean 始终返回 true
function string(val)
	return true
end

-- 目录验证：检查值是否为有效的目录路径
-- @param val 要验证的路径
-- @param seen 已检查的 inode 集合（防止循环链接）
-- @return boolean 如果是有效的目录返回 true，否则返回 false
function directory(val, seen)
	local s = fs.stat(val)
	seen = seen or { }

	if s and not seen[s.ino] then
		seen[s.ino] = true
		if s.type == "dir" then
			return true
		elseif s.type == "lnk" then
			return directory( fs.readlink(val), seen )
		end
	end

	return false
end

-- 文件验证：检查值是否为有效的文件路径
-- @param val 要验证的路径
-- @param seen 已检查的 inode 集合（防止循环链接）
-- @return boolean 如果是有效的文件返回 true，否则返回 false
function file(val, seen)
	local s = fs.stat(val)
	seen = seen or { }

	if s and not seen[s.ino] then
		seen[s.ino] = true
		if s.type == "reg" then
			return true
		elseif s.type == "lnk" then
			return file( fs.readlink(val), seen )
		end
	end

	return false
end

-- 设备验证：检查值是否为有效的设备文件路径（字符设备或块设备）
-- @param val 要验证的路径
-- @param seen 已检查的 inode 集合（防止循环链接）
-- @return boolean 如果是有效的设备文件返回 true，否则返回 false
function device(val, seen)
	local s = fs.stat(val)
	seen = seen or { }

	if s and not seen[s.ino] then
		seen[s.ino] = true
		if s.type == "chr" or s.type == "blk" then
			return true
		elseif s.type == "lnk" then
			return device( fs.readlink(val), seen )
		end
	end

	return false
end

-- UCI 名称验证：检查值是否为有效的 UCI 配置名称（字母、数字、下划线）
-- @param val 要验证的值
-- @return boolean 如果是有效的 UCI 名称返回 true，否则返回 false
function uciname(val)
	return (val:match("^[a-zA-Z0-9_]+$") ~= nil)
end

-- 范围验证：检查值是否在指定范围内
-- @param val 要验证的值
-- @param min 最小值
-- @param max 最大值
-- @return boolean 如果值在 min 和 max 之间（包含边界）返回 true，否则返回 false
function range(val, min, max)
	val = tonumber(val)
	min = tonumber(min)
	max = tonumber(max)

	if val ~= nil and min ~= nil and max ~= nil then
		return ((val >= min) and (val <= max))
	end

	return false
end

-- 最小值验证：检查值是否大于或等于指定最小值
-- @param val 要验证的值
-- @param min 最小值
-- @return boolean 如果值 >= min 返回 true，否则返回 false
function min(val, min)
	val = tonumber(val)
	min = tonumber(min)

	if val ~= nil and min ~= nil then
		return (val >= min)
	end

	return false
end

-- 最大值验证：检查值是否小于或等于指定最大值
-- @param val 要验证的值
-- @param max 最大值
-- @return boolean 如果值 <= max 返回 true，否则返回 false
function max(val, max)
	val = tonumber(val)
	max = tonumber(max)

	if val ~= nil and max ~= nil then
		return (val <= max)
	end

	return false
end

-- 长度范围验证：检查字符串长度是否在指定范围内
-- @param val 要验证的字符串
-- @param min 最小长度
-- @param max 最大长度
-- @return boolean 如果长度在 min 和 max 之间（包含边界）返回 true，否则返回 false
function rangelength(val, min, max)
	val = tostring(val)
	min = tonumber(min)
	max = tonumber(max)

	if val ~= nil and min ~= nil and max ~= nil then
		return ((#val >= min) and (#val <= max))
	end

	return false
end

-- 最小长度验证：检查字符串长度是否大于或等于指定最小长度
-- @param val 要验证的字符串
-- @param min 最小长度
-- @return boolean 如果长度 >= min 返回 true，否则返回 false
function minlength(val, min)
	val = tostring(val)
	min = tonumber(min)

	if val ~= nil and min ~= nil then
		return (#val >= min)
	end
	return false
end

-- 最大长度验证：检查字符串长度是否小于或等于指定最大长度
-- @param val 要验证的字符串
-- @param max 最大长度
-- @return boolean 如果长度 <= max 返回 true，否则返回 false
function maxlength(val, max)
	val = tostring(val)
	max = tonumber(max)

	if val ~= nil and max ~= nil then
		return (#val <= max)
	end
	return false
end

-- 电话号码验证：检查值是否仅包含数字、*、#、!、. 等字符
-- @param val 要验证的值
-- @return boolean 如果是有效的电话号码字符返回 true，否则返回 false
function phonedigit(val)
	return (val:match("^[0-9%*#!%.]+$") ~= nil)
end

-- 时间验证：检查值是否为有效的时间格式（HH:MM:SS，小时 00-69，分钟/秒 00-69）
-- @param val 要验证的值
-- @return boolean 如果是有效的时间格式返回 true，否则返回 false
function timehhmmss(val)
	return (val:match("^[0-6][0-9]:[0-6][0-9]:[0-6][0-9]$") ~= nil)
end

-- 日期验证：检查值是否为有效的日期格式（YYYY-MM-DD，年 >= 2015）
-- @param val 要验证的值
-- @return boolean 如果是有效的日期返回 true，否则返回 false
function dateyyyymmdd(val)
	if val ~= nil then
		yearstr, monthstr, daystr = val:match("^(%d%d%d%d)-(%d%d)-(%d%d)$")
		if (yearstr == nil) or (monthstr == nil) or (daystr == nil) then
			return false;
		end
		year = tonumber(yearstr)
		month = tonumber(monthstr)
		day = tonumber(daystr)
		if (year == nil) or (month == nil) or (day == nil) then
			return false;
		end

		local days_in_month = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }

		local function is_leap_year(year)
			return (year % 4 == 0) and ((year % 100 ~= 0) or (year % 400 == 0))
		end

		function get_days_in_month(month, year)
			if (month == 2) and is_leap_year(year) then
				return 29
			else
				return days_in_month[month]
			end
		end
		if (year < 2015) then
			return false
		end
		if ((month == 0) or (month > 12)) then
			return false
		end
		if ((day == 0) or (day > get_days_in_month(month, year))) then
			return false
		end
		return true
	end
	return false
end

-- 唯一值验证：始终返回 true（用于占位或特定场景）
-- @param val 要验证的值
-- @return boolean 始终返回 true
function unique(val)
	return true
end
