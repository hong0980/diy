-- 版权声明：2009-2015 Jo-Philipp Wich，作者邮箱 <jow@openwrt.org>
-- 授权协议：代码遵循 Apache License 2.0 许可，允许公共使用
-- Copyright 2009-2015 Jo-Philipp Wich <jow@openwrt.org>
-- Licensed to the public under the Apache License 2.0.

-- 导入 Lua 标准库函数，用于类型检查、迭代和表操作
-- type: 获取变量类型；next: 遍历表；pairs/ipairs: 迭代表；loadfile: 加载文件；table: 表操作；select: 获取变长参数
-- Import standard Lua functions used throughout the module for type checking, iteration, and table manipulation
local type, next, pairs, ipairs, loadfile, table, select
    = type, next, pairs, ipairs, loadfile, table, select

-- 导入 Lua 数学和字符串转换函数，用于数值运算和字符串处理
-- tonumber: 字符串转数字；tostring: 任意类型转字符串；math: 数学运算
-- Import Lua math and string conversion functions for numerical operations and string handling
local tonumber, tostring, math = tonumber, tostring, math

-- 导入 Lua 函数，用于安全调用和模块加载
-- pcall: 保护性调用；require: 加载模块；setmetatable: 设置元表
-- Import Lua functions for protected calls and module loading
local pcall, require, setmetatable = pcall, require, setmetatable

-- 导入 nixio 库，用于低级别系统操作（如访问网络接口）
-- Import nixio library for low-level system operations (e.g., network interface access)
local nxo = require "nixio"

-- 导入 nixio.fs 模块，用于文件系统操作（如检查文件是否存在）
-- Import nixio.fs for filesystem operations (e.g., checking file existence)
local nfs = require "nixio.fs"

-- 导入 luci.ip 模块，用于 IP 地址操作（如处理 IPv4/IPv6）
-- Import luci.ip for IP address manipulation (e.g., IPv4/IPv6 handling)
local ipc = require "luci.ip"

-- 导入 luci.util 模块，提供实用工具函数（如字符串分割、ubus 调用）
-- Import luci.util for utility functions (e.g., string splitting, ubus calls)
local utl = require "luci.util"

-- 导入 luci.model.uci 模块，用于 UCI 配置管理（如读写 /etc/config 文件）
-- Import luci.model.uci for UCI configuration management
local uci = require "luci.model.uci"

-- 导入 luci.i18n 模块，用于国际化支持，提供翻译功能
-- Import luci.i18n for internationalization and translation support
local lng = require "luci.i18n"

-- 导入 luci.jsonc 模块，用于 JSON 数据解析（如读取设备板卡信息）
-- Import luci.jsonc for JSON parsing (e.g., reading board configuration)
local jsc = require "luci.jsonc"

-- 声明模块 "luci.model.network"，用于封装网络相关的功能（如接口、协议、无线管理）
-- Declare the module "luci.model.network" to encapsulate network-related functionality
module "luci.model.network"

-- 定义全局表，用于存储虚拟接口的正则表达式模式（如 VPN 隧道接口）
-- Define a table to store patterns for identifying virtual interfaces (e.g., VPN tunnels)
IFACE_PATTERNS_VIRTUAL  = { }

-- 定义全局表，存储需要忽略的接口的正则表达式模式（如环回接口、临时无线接口）
-- Define a table of patterns for interfaces to be ignored (e.g., loopback, temporary wireless interfaces)
IFACE_PATTERNS_IGNORE   = { 
    "^wmaster%d",        -- 匹配无线主接口，如 wmaster0
    "^wifi%d",           -- 匹配通用 Wi-Fi 接口，如 wifi0
    "^hwsim%d",          -- 匹配硬件模拟接口，如 hwsim0
    "^imq%d",            -- 匹配中间队列设备，如 imq0
    "^ifb%d",            -- 匹配中间功能块设备，如 ifb0
    "^mon%.wlan%d",      -- 匹配无线监控接口，如 mon.wlan0
    "^sit%d",            -- 匹配简单 IP 隧道，如 sit0
    "^gre%d",            -- 匹配 GRE 隧道，如 gre0
    "^gretap%d",         -- 匹配 GRE tap 接口，如 gretap0
    "^ip6gre%d",         -- 匹配 IPv6 GRE 隧道，如 ip6gre0
    "^ip6tnl%d",         -- 匹配 IPv6 隧道，如 ip6tnl0
    "^tunl%d",           -- 匹配隧道接口，如 tunl0
    "^lo$"               -- 匹配环回接口 lo
}

-- 定义全局表，存储无线接口的正则表达式模式
-- Define a table of patterns for identifying wireless interfaces
IFACE_PATTERNS_WIRELESS = { 
    "^wlan%d",           -- 匹配标准无线接口，如 wlan0
    "^wl%d",             -- 匹配 Broadcom 无线接口，如 wl0
    "^ath%d",            -- 匹配 Atheros 无线接口，如 ath0
    "^%w+%.network%d"    -- 匹配特定网络的无线接口，如 radio0.network1
}

-- 定义全局表，存储网络操作的错误代码和对应的翻译错误信息
-- Define a table mapping error codes to translated error messages for network operations
IFACE_ERRORS = {
    CONNECT_FAILED       = lng.translate("Connection attempt failed"),        -- 连接尝试失败
    INVALID_ADDRESS      = lng.translate("IP address is invalid"),            -- IP 地址无效
    INVALID_GATEWAY      = lng.translate("Gateway address is invalid"),       -- 网关地址无效
    INVALID_LOCAL_ADDRESS = lng.translate("Local IP address is invalid"),     -- 本地 IP 地址无效
    MISSING_ADDRESS      = lng.translate("IP address is missing"),            -- 缺少 IP 地址
    MISSING_PEER_ADDRESS = lng.translate("Peer address is missing"),          -- 缺少对端地址
    NO_DEVICE            = lng.translate("Network device is not present"),    -- 网络设备不存在
    NO_IFACE             = lng.translate("Unable to determine device name"),  -- 无法确定设备名称
    NO_IFNAME            = lng.translate("Unable to determine device name"),  -- 无法确定设备名称
    NO_WAN_ADDRESS       = lng.translate("Unable to determine external IP address"), -- 无法确定外部 IP 地址
    NO_WAN_LINK          = lng.translate("Unable to determine upstream interface"),  -- 无法确定上行接口
    PEER_RESOLVE_FAIL    = lng.translate("Unable to resolve peer host name"),        -- 无法解析对端主机名
    PIN_FAILED           = lng.translate("PIN code rejected")                       -- PIN 码被拒绝
}

-- 定义 protocol 类，作为网络协议（如 DHCP、静态 IP）的基类
-- Define protocol class as the base class for network protocols (e.g., DHCP, static)
protocol = utl.class()

-- 定义全局表，存储所有注册的网络协议类（如 static、dhcp）
-- Define a table to store all registered protocol classes
local _protocols = { }

-- 定义全局变量，存储网络接口、桥接、交换机、隧道和交换机拓扑信息
-- Define global variables to store interfaces, bridges, switches, tunnels, and switch topologies
local _interfaces, _bridge, _switch, _tunnel, _swtopo

-- 定义全局变量，存储 ubus 缓存（网络接口、无线状态等）
-- Define global variables to store ubus caches (network interfaces, wireless status, etc.)
local _ubusnetcache, _ubusdevcache, _ubuswificache

-- 定义全局变量，存储 UCI 配置游标
-- Define a global variable to store the UCI configuration cursor
local _uci

-- 定义内部函数 _filter，用于从 UCI 配置中移除指定的值
-- Define internal function _filter to remove a specific value from UCI configuration
function _filter(c, s, o, r)
    -- 从 UCI 配置中获取指定配置、段和选项的值
    -- Get the value of the specified config, section, and option from UCI
    local val = _uci:get(c, s, o)
    -- 如果值存在，则进行处理
    -- If the value exists, process it
    if val then
        -- 定义一个表，用于存储过滤后的值
        -- Define a table to store filtered values
        local l = { }
        -- 如果值是字符串类型，则按空格分割并过滤
        -- If the value is a string, split by whitespace and filter
        if type(val) == "string" then
            -- 遍历字符串中的每个非空值
            -- Iterate over each non-empty value in the string
            for val in val:gmatch("%S+") do
                -- 如果值不等于要移除的值，则添加到结果表
                -- If the value is not the one to remove, add it to the result table
                if val ~= r then
                    l[#l+1] = val
                end
            end
            -- 如果过滤后有值，则更新 UCI 配置
            -- If there are values after filtering, update UCI configuration
            if #l > 0 then
                _uci:set(c, s, o, table.concat(l, " "))
            -- 否则删除该选项
            -- Otherwise, delete the option
            else
                _uci:delete(c, s, o)
            end
        -- 如果值是表类型，则直接过滤
        -- If the value is a table, filter directly
        elseif type(val) == "table" then
            -- 遍历表中的每个值
            -- Iterate over each value in the table
            for _, val in ipairs(val) do
                -- 如果值不等于要移除的值，则添加到结果表
                -- If the value is not the one to remove, add it to the result table
                if val ~= r then
                    l[#l+1] = val
                end
            end
            -- 如果过滤后有值，则更新 UCI 配置
            -- If there are values after filtering, update UCI configuration
            if #l > 0 then
                _uci:set(c, s, o, l)
            -- 否则删除该选项
            -- Otherwise, delete the option
            else
                _uci:delete(c, s, o)
            end
        end
    end
end

-- 定义内部函数 _append，用于向 UCI 配置的选项追加值
-- Define internal function _append to append a value to a UCI configuration option
function _append(c, s, o, a)
    -- 从 UCI 配置中获取指定配置、段和选项的值
    -- Get the value of the specified config, section, and option from UCI
    local val = _uci:get(c, s, o) or ""
    -- 如果值是字符串类型，则追加新值
    -- If the value is a string, append the new value
    if type(val) == "string" then
        -- 定义一个表，用于存储现有值和新值
        -- Define a table to store existing and new values
        local l = { }
        -- 遍历字符串中的每个非空值
        -- Iterate over each non-empty value in the string
        for val in val:gmatch("%S+") do
            -- 如果值不等于要追加的值，则添加到结果表（避免重复）
            -- If the value is not the one to append, add it to the result table (avoid duplicates)
            if val ~= a then
                l[#l+1] = val
            end
        end
        -- 将新值追加到表末尾
        -- Append the new value to the table
        l[#l+1] = a
        -- 更新 UCI 配置，将表连接为字符串
        -- Update UCI configuration by joining the table into a string
        _uci:set(c, s, o, table.concat(l, " "))
    -- 如果值是表类型，则追加新值
    -- If the value is a table, append the new value
    elseif type(val) == "table" then
        -- 定义一个表，用于存储现有值和新值
        -- Define a table to store existing and new values
        local l = { }
        -- 遍历表中的每个值
        -- Iterate over each value in the table
        for _, val in ipairs(val) do
            -- 如果值不等于要追加的值，则添加到结果表（避免重复）
            -- If the value is not the one to append, add it to the result table (avoid duplicates)
            if val ~= a then
                l[#l+1] = val
            end
        end
        -- 将新值追加到表末尾
        -- Append the new value to the table
        l[#l+1] = a
        -- 更新 UCI 配置
        -- Update UCI configuration
        _uci:set(c, s, o, l)
    end
end

-- 定义内部函数 _stror，返回两个字符串中的非空值
-- Define internal function _stror to return the non-empty string from two inputs
function _stror(s1, s2)
    -- 如果 s1 为空或不存在，则检查 s2
    -- If s1 is empty or nil, check s2
    if not s1 or #s1 == 0 then
        -- 如果 s2 存在且非空，则返回 s2，否则返回 nil
        -- If s2 exists and is non-empty, return s2, otherwise return nil
        return s2 and #s2 > 0 and s2
    -- 否则返回 s1
    -- Otherwise, return s1
    else
        return s1
    end
end

-- 定义内部函数 _get，用于从 UCI 配置中获取值
-- Define internal function _get to retrieve a value from UCI configuration
function _get(c, s, o)
    -- 调用 UCI 的 get 方法获取指定配置、段和选项的值
    -- Call UCI's get method to retrieve the value
    return _uci:get(c, s, o)
end

-- 定义内部函数 _set，用于设置或删除 UCI 配置中的值
-- Define internal function _set to set or delete a value in UCI configuration
function _set(c, s, o, v)
    -- 如果值 v 存在，则进行设置
    -- If the value v exists, proceed to set it
    if v ~= nil then
        -- 如果值是布尔类型，则转换为字符串 "1" 或 "0"
        -- If the value is boolean, convert to string "1" or "0"
        if type(v) == "boolean" then v = v and "1" or "0" end
        -- 设置 UCI 配置的值
        -- Set the value in UCI configuration
        return _uci:set(c, s, o, v)
    -- 如果值为空，则删除该选项
    -- If the value is nil, delete the option
    else
        return _uci:delete(c, s, o)
    end
end

-- 定义函数 init，用于初始化网络模块
-- Define function init to initialize the network module
function init(cursor)
    -- 如果提供了 UCI 游标，则使用它，否则使用全局 UCI 实例
    -- Use the provided UCI cursor, or default to the global UCI instance
    _uci = cursor or _uci or uci.cursor()

    -- 初始化网络接口表，用于存储所有接口信息
    -- Initialize the interfaces table to store all interface information
    _interfaces = { }

    -- 初始化桥接表，用于存储桥接配置
    -- Initialize the bridge table to store bridge configurations
    _bridge     = { }

    -- 初始化交换机表，用于存储交换机配置
    -- Initialize the switch table to store switch configurations
    _switch     = { }

    -- 初始化隧道表，用于存储虚拟接口（如 VPN 隧道）
    -- Initialize the tunnel table to store virtual interfaces (e.g., VPN tunnels)
    _tunnel     = { }

    -- 初始化交换机拓扑表，用于存储交换机端口和 VLAN 信息
    -- Initialize the switch topology table to store switch ports and VLAN info
    _swtopo     = { }

    -- 初始化 ubus 网络缓存，用于存储网络接口状态
    -- Initialize ubus network cache to store interface status
    _ubusnetcache  = { }

    -- 初始化 ubus 设备缓存，用于存储设备状态
    -- Initialize ubus device cache to store device status
    _ubusdevcache  = { }

    -- 初始化 ubus 无线缓存，用于存储无线状态
    -- Initialize ubus wireless cache to store wireless status
    _ubuswificache = { }

    -- 读取网络接口信息
    -- Read interface information
    local n, i
    -- 遍历 nixio.getifaddrs() 返回的接口信息
    -- Iterate over interface information from nixio.getifaddrs()
    for n, i in ipairs(nxo.getifaddrs()) do
        -- 提取接口名称，去掉可能的冒号后缀（如 eth0:1 -> eth0）
        -- Extract the interface name, removing any colon suffix (e.g., eth0:1 -> eth0)
        local name = i.name:match("[^:]+")

        -- 检查接口是否为虚拟接口（如 VPN 隧道）
        -- Check if the interface is virtual (e.g., VPN tunnel)
        if _iface_virtual(name) then
            -- 将虚拟接口标记添加到隧道表
            -- Add the virtual interface to the tunnel table
            _tunnel[name] = true
        end

        -- 如果接口是隧道接口或非忽略接口，则处理
        -- Process if the interface is a tunnel or not ignored
        if _tunnel[name] or not (_iface_ignore(name) or _iface_virtual(name)) then
            -- 初始化接口信息表，包含索引、名称、标志、IP 地址等
            -- Initialize the interface info table with index, name, flags, IPs, etc.
            _interfaces[name] = _interfaces[name] or {
                idx      = i.ifindex or n,       -- 接口索引，默认为迭代序号
                name     = name,                 -- 接口名称
                rawname  = i.name,               -- 原始接口名称（包含可能的后缀）
                flags    = { },                  -- 接口标志（如 up/down）
                ipaddrs  = { },                  -- IPv4 地址列表
                ip6addrs = { }                   -- IPv6 地址列表
            }

            -- 如果是数据包层（链路层）信息
            -- If the information is from the packet layer (link layer)
            if i.family == "packet" then
                -- 设置接口的标志信息（如 up、running）
                -- Set the interface flags (e.g., up, running)
                _interfaces[name].flags   = i.flags
                -- 设置接口的统计数据（如流量）
                -- Set the interface statistics (e.g., traffic)
                _interfaces[name].stats   = i.data
                -- 设置接口的 MAC 地址，经过验证
                -- Set the interface MAC address, validated
                _interfaces[name].macaddr = ipc.checkmac(i.addr)
            -- 如果是 IPv4 地址信息
            -- If the information is for IPv4 address
            elseif i.family == "inet" then
                -- 添加 IPv4 地址到接口的地址列表
                -- Add the IPv4 address to the interface's address list
                _interfaces[name].ipaddrs[#_interfaces[name].ipaddrs+1] = ipc.IPv4(i.addr, i.netmask)
            -- 如果是 IPv6 地址信息
            -- If the information is for IPv6 address
            elseif i.family == "inet6" then
                -- 添加 IPv6 地址到接口的地址列表
                -- Add the IPv6 address to the interface's address list
                _interfaces[name].ip6addrs[#_interfaces[name].ip6addrs+1] = ipc.IPv6(i.addr, i.netmask)
            end
        end
    end

    -- 读取桥接信息
    -- Read bridge information
    local b, l
    -- 执行 brctl show 命令并逐行处理输出
    -- Execute "brctl show" command and process output line by line
    for l in utl.execi("brctl show") do
        -- 忽略包含 "STP" 的标题行
        -- Skip header lines containing "STP"
        if not l:match("STP") then
            -- 将行按空格分割为多个字段
            -- Split the line into fields by whitespace
            local r = utl.split(l, "%s+", nil, true)
            -- 如果行包含 4 个字段，说明是桥接信息
            -- If the line has 4 fields, it represents a bridge
            if #r == 4 then
                -- 创建桥接信息表
                -- Create a bridge information table
                b = {
                    name    = r[1],              -- 桥接名称（如 br-lan）
                    id      = r[2],              -- 桥接 ID
                    stp     = r[3] == "yes",     -- 是否启用 STP（生成树协议）
                    ifnames = { _interfaces[r[4]] } -- 桥接的接口列表
                }
                -- 如果桥接的第一个接口存在，则设置其桥接引用
                -- If the first bridged interface exists, set its bridge reference
                if b.ifnames[1] then
                    b.ifnames[1].bridge = b
                end
                -- 将桥接信息存储到全局桥接表
                -- Store the bridge info in the global bridge table
                _bridge[r[1]] = b
                -- 设置桥接接口的桥接引用
                -- Set the bridge reference for the bridge interface
                _interfaces[r[1]].bridge = b
            -- 如果当前有桥接信息，则追加接口
            -- If there is current bridge info, append interfaces
            elseif b then
                -- 将接口添加到桥接的接口列表
                -- Add the interface to the bridge's interface list
                b.ifnames[#b.ifnames+1] = _interfaces[r[2]]
                -- 设置接口的桥接引用
                -- Set the bridge reference for the interface
                b.ifnames[#b.ifnames].bridge = b
            end
        end
    end

    -- 读取交换机拓扑信息
    -- Read switch topology information
    local boardinfo = jsc.parse(nfs.readfile("/etc/board.json") or "")
    -- 检查是否成功解析板卡信息，并且包含交换机配置
    -- Check if board info was parsed successfully and contains switch config
    if type(boardinfo) == "table" and type(boardinfo.switch) == "table" then
        -- 定义局部变量，用于遍历交换机和其布局
        -- Define local variables for iterating over switches and layouts
        local switch, layout
        -- 遍历板卡信息中的交换机配置
        -- Iterate over switch configurations in board info
        for switch, layout in pairs(boardinfo.switch) do
            -- 检查布局是否为表类型，并且包含端口信息
            -- Check if the layout is a table and contains port information
            if type(layout) == "table" and type(layout.ports) == "table" then
                -- 定义局部变量，用于遍历端口
                -- Define local variable for iterating over ports
                local _, port
                -- 初始化端口表，用于存储端口配置
                -- Initialize ports table to store port configurations
                local ports = { }
                -- 初始化角色计数表，用于统计每种角色的端口数
                -- Initialize role count table to count ports per role
                local nports = { }
                -- 初始化网络设备表，用于映射端口号到设备
                -- Initialize network devices table to map port numbers to devices
                local netdevs = { }

                -- 遍历布局中的每个端口
                -- Iterate over each port in the layout
                for _, port in ipairs(layout.ports) do
                    -- 检查端口是否为表类型，并且包含有效的端口号和角色/设备信息
                    -- Check if the port is a table with valid number and role/device info
                    if type(port) == "table" and
                       type(port.num) == "number" and
                       (type(port.role) == "string" or
                        type(port.device) == "string")
                    then
                        -- 创建端口配置表
                        -- Create a port configuration table
                        local spec = {
                            num    = port.num,              -- 端口号
                            role   = port.role or "cpu",    -- 端口角色，默认为 CPU
                            index  = port.index or port.num -- 端口索引，默认为端口号
                        }

                        -- 如果端口指定了设备
                        -- If the port specifies a device
                        if port.device then
                            -- 设置端口的设备名称
                            -- Set the device name for the port
                            spec.device = port.device
                            -- 设置是否需要 VLAN 标签
                            -- Set whether VLAN tagging is needed
                            spec.tagged = port.need_tag
                            -- 将端口号映射到设备名称
                            -- Map the port number to the device name
                            netdevs[tostring(port.num)] = port.device
                        end

                        -- 将端口配置添加到端口表
                        -- Add the port configuration to the ports table
                        ports[#ports+1] = spec

                        -- 如果端口有角色，更新角色计数
                        -- If the port has a role, update the role count
                        if port.role then
                            nports[port.role] = (nports[port.role] or 0) + 1
                        end
                    end
                end

                -- 对端口按角色和索引排序
                -- Sort ports by role and index
                table.sort(ports, function(a, b)
                    -- 如果角色不同，按角色字母序排序
                    -- If roles differ, sort by role alphabetically
                    if a.role ~= b.role then
                        return (a.role < b.role)
                    end

                    -- 如果角色相同，按索引排序
                    -- If roles are the same, sort by index
                    return (a.index < b.index)
                end)

                -- 定义变量，用于生成端口标签
                -- Define variables for generating port labels
                local pnum, role
                -- 遍历排序后的端口
                -- Iterate over sorted ports
                for _, port in ipairs(ports) do
                    -- 如果端口角色发生变化，重置计数
                    -- If the port role changes, reset the counter
                    if port.role ~= role then
                        role = port.role
                        pnum = 1
                    end

                    -- 如果是 CPU 端口，生成特定标签
                    -- If it's a CPU port, generate a specific label
                    if role == "cpu" then
                        port.label = "CPU (%s)" % port.device
                    -- 如果同一角色有多个端口，生成带序号的标签
                    -- If there are multiple ports for the role, include a number
                    elseif nports[role] > 1 then
                        port.label = "%s %d" %{ role:upper(), pnum }
                        pnum = pnum + 1
                    -- 否则使用角色名称作为标签
                    -- Otherwise, use the role name as the label
                    else
                        port.label = role:upper()
                    end

                    -- 移除角色和索引字段，保留最终配置
                    -- Remove role and index fields, keeping final config
                    port.role = nil
                    port.index = nil
                end

                -- 将交换机拓扑信息存储到全局表
                -- Store switch topology info in the global table
                _swtopo[switch] = {
                    ports = ports,       -- 端口配置列表
                    netdevs = netdevs    -- 端口号到设备映射
                }
            end
        end
    end

    -- 返回模块对象，完成初始化
    -- Return the module object to complete initialization
    return _M
end
