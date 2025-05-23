local sys = require "luci.sys"
local uci = require "luci.model.uci".cursor()
local wizard = uci:get_all("wizard", "default")
local network = uci:get_all("network")

if wizard.wan_proto ~= network.wan.proto then
    uci:set('wizard', 'default', 'ipv6', network.wan.ipv6)
    uci:set('wizard', 'default', 'wan_proto', network.wan.proto)
    uci:set('wizard', 'default', 'pppoe_user', network.wan.username)
    uci:set('wizard', 'default', 'pppoe_pass', network.wan.password)
    uci:set('wizard', 'default', 'lan_ipaddr', network.lan.ipaddr)
    uci:set('wizard', 'default', 'lan_netmask', network.lan.netmask)
    uci:set('wizard', 'default', 'lan_gateway', network.lan.gateway)
    uci:set_list('wizard', 'default', 'lan_dns', uci:get_list("network", "lan", 'dns'))
    if uci:get("dhcp", "lan", 'ignore') then
        uci:set('wizard', 'default', 'dhcp', '0')
    else
        uci:delete('wizard', 'default', 'dhcp')
    end
    uci:commit('wizard')
    luci.http.redirect(luci.dispatcher.build_url("admin/system/wizard"))
    -- return
end

local ip_mac = {}
sys.net.ipv4_hints(
    function(ip, name)
        ip_mac[#ip_mac + 1] = {ip = ip, mac = name}
    end, function(a, b)
    if #a.ip ~= #b.ip then
        return #a.ip < #b.ip
    end
    return a.ip < b.ip
end)

m = Map('wizard', translate('网络设置'), translate('如果你首次使用这个路由器，请在这里简单设置。'))

s = m:section(TypedSection, 'wizard')
s.addremove = false
s.anonymous = true

wan_proto = s:option(ListValue, 'wan_proto', translate('Protocol'))
wan_proto:value('pppoe', translate('PPPoE'))
wan_proto:value('dhcp', translate('DHCP client'))
-- wan_proto:value('siderouter', translate('Siderouter'))
-- wan_proto:value('static', translate('Static address'))

pppoe_user = s:option(Value, 'pppoe_user', translate('PAP/CHAP username'))
pppoe_user:depends('wan_proto', 'pppoe')

pppoe_pass = s:option(Value, 'pppoe_pass', translate('PAP/CHAP password'))
pppoe_pass:depends('wan_proto', 'pppoe')
pppoe_pass.password = true

wan_ipaddr = s:option(Value, 'wan_ipaddr', translate('IPv4 address'))
wan_ipaddr:depends('wan_proto', 'static')
wan_ipaddr.datatype = 'ip4addr'
wan_ipaddr.rmempty = false
wan_ipaddr.ucioption = 'ipaddr'

wan_gateway = s:option(Value, 'wan_gateway', translate('IPv4 gateway'))
wan_gateway:depends('wan_proto', 'static')
wan_gateway.datatype = "ip4addr"
wan_gateway.ucioption = 'gateway'

wan_netmask = s:option(ListValue, 'wan_netmask', translate('IPv4 netmask'))
wan_netmask:value('255.255.255.0')
wan_netmask:value('255.255.0.0')
wan_netmask:value('255.0.0.0')
wan_netmask:depends('wan_proto', 'static')
wan_netmask.datatype = "ip4addr"
wan_netmask.rmempty = true
wan_netmask.ucioption = 'netmask'

ipv6 = s:option(ListValue, 'ipv6', translate('Enable IPv6 negotiation'))
ipv6:value("0", translate("disable"))
ipv6:value("1", translate("Manual"))
ipv6:value("auto", translate("Automatic"))
ipv6.default = "auto"
ipv6:depends('wan_proto', 'pppoe')

siderouter = s:option(Flag, "enable_siderouter", translate("旁路由设置"))
siderouter:depends('wan_proto', 'siderouter')

local lan_ipaddr = network.lan.ipaddr or ""
ipaddr = s:option(Value, "lan_ipaddr", translate("IPv4 address"))
ipaddr:value(lan_ipaddr, translate(lan_ipaddr .. " --当前LAN的IP--"))
ipaddr.default = lan_ipaddr
ipaddr.datatype="ip4addr"
ipaddr.anonymous = false
ipaddr:depends('enable_siderouter', false)

ipaddr = s:option(Value, "siderouter_lan_ipaddr", translate("IPv4 address"))
local descr = {[[设置主路由同网段未冲突的IP地址<font color=red>(即是该路由web访问的IP)</font><br>当前的内网主机列表：<ol>]]}
for _, key in pairs(ip_mac) do
    descr[#descr + 1] = translatef([[<li>%s (%s)</li>]], key.ip, key.mac)
end
ipaddr.description = table.concat(descr) .. "</ol>"

ipaddr:value(lan_ipaddr, translatef("%s --当前LAN的IP--", lan_ipaddr))
ipaddr.default = lan_ipaddr
ipaddr.datatype="ip4addr"
ipaddr.anonymous = false
ipaddr:depends('enable_siderouter', true)

local sys_hostname = sys.hostname() or ""
hostname = s:option(Value, "hostname", translate("Hostname"))
hostname.default = sys_hostname
hostname:depends('enable_siderouter', true)

if wizard.hostname and wizard.hostname ~= sys_hostname then
    sys.hostname(wizard.hostname)
end

lan_gateway = s:option(Value, 'lan_gateway', translate('IPv4 gateway'),
    translate('这里输入主路由IP地址<b><font color="red"> 必须填写</font></b>'))
lan_gateway:depends('enable_siderouter', true)
lan_gateway.datatype = 'ip4addr'
lan_gateway.rmempty = true

lan_sum = s:option(Value, "lan_sum", translate("网口数量"),
    translate("该路由物理网口数量，留空则自动获取"))
lan_sum.datatype = 'ufloat'
lan_sum:depends('enable_siderouter', true)

netmask = s:option(ListValue, 'lan_netmask', translate('IPv4 netmask'))
netmask:value("255.255.255.0", translate("255.255.255.0"))
netmask:value("255.255.0.0", translate("255.255.0.0"))
netmask:value("255.0.0.0", translate("255.0.0.0"))
netmask.default = "255.255.255.0"
netmask.datatype='ip4addr'
netmask.anonymous = false

dns = s:option(DynamicList, 'lan_dns', translate('LAN DNS 服务器'),
    translate("可以设置主路由的IP，或可到<a href='https://dnsdaquan.com' target='_blank'> DNS大全 </a>获取更多"))
dns:value("223.5.5.5", translate("阿里DNS：223.5.5.5"))
dns:value("223.6.6.6", translate("阿里DNS：223.6.6.6"))
dns:value("101.226.4.6", translate("DNS派：101.226.4.6"))
dns:value("218.30.118.6", translate("DNS派：218.30.118.6"))
dns:value("180.76.76.76", translate("百度DNS：180.76.76.76"))
dns:value("114.114.114.114", translate("114DNS：114.114.114.114"))
dns:value("114.114.115.115", translate("114DNS：114.114.115.115"))
dns.default = "223.5.5.5"
dns.anonymous = false
dns.datatype = "ip4addr"
-- dns.cast = "string"

dhcp = s:option(Flag, 'dhcp', translate('DHCP Server'),
    translate('开启此DHCP则需要关闭主路由的DHCP<br><b><font color="red">关闭主路由DHCP则需要手动将所有上网设备的网关和DNS改为此旁路由的IP</font></b>'))
dhcp.datatype = 'ip4addr'
dhcp:depends('enable_siderouter', true)

wan = s:option(Flag, "wan_lan", translate("修改WAN口"),
    translate("修改WAN口变成LAN口"))
wan.rmempty = true
wan:depends('enable_siderouter', true)

wan_dns_1  = s:option(DynamicList, 'wan_dns_1', translate('WAN DNS 服务器'))
wan_dns_1:depends('wan_lan', true)
wan_dns_1 :value("223.5.5.5", translate("阿里DNS：223.5.5.5"))
wan_dns_1 :value("223.6.6.6", translate("阿里DNS：223.6.6.6"))
wan_dns_1 :value("101.226.4.6", translate("DNS派：101.226.4.6"))
wan_dns_1 :value("218.30.118.6", translate("DNS派：218.30.118.6"))
wan_dns_1 :value("180.76.76.76", translate("百度DNS：180.76.76.76"))
wan_dns_1 :value("114.114.114.114", translate("114DNS：114.114.114.114"))
wan_dns_1 :value("114.114.115.115", translate("114DNS：114.114.115.115"))
wan_dns_1 .default = "223.5.5.5"
wan_dns_1 .anonymous = false
wan_dns_1 .datatype = "ip4addr"

wan_ipaddr_1 = s:option(Value, 'wan_ipaddr_1', translate('IPv4 address'))
wan_ipaddr_1:depends('wan_lan', true)
wan_ipaddr_1.datatype = 'ip4addr'
wan_ipaddr_1.rmempty = true
wan_ipaddr_1.ucioption = 'ipaddr'

wan_gateway_1 = s:option(Value, 'wan_gateway_1', translate('IPv4 gateway'))
wan_gateway_1:depends('wan_lan', true)
wan_gateway_1.datatype = "ip4addr"
wan_gateway_1.ucioption = 'gateway'

wan_netmask_1 = s:option(ListValue, 'wan_netmask_1', translate('IPv4 netmask'))
wan_netmask_1:value('255.255.255.0')
wan_netmask_1:value('255.255.0.0')
wan_netmask_1:value('255.0.0.0')
wan_netmask_1:depends('wan_lan', true)
wan_netmask_1.datatype = "ip4addr"
wan_netmask_1.rmempty = true
wan_netmask_1.ucioption = 'netmask'

firewall = s:option(Flag, "firewall", translate("防火墙设置"))
firewall.rmempty = true
firewall:depends('enable_siderouter', true)

fullcone = s:option(Flag, "fullcone", translate("启用 SYN-flood 防御"),
    translate("建议开启"))
fullcone:depends("firewall", true)
fullcone.default = true
fullcone.rmempty = true

masq = s:option(Flag, "masq", translate("启用 IP 动态伪装"),
    translate("LAN防火墙服务<code>建议开启</code>"))
masq:depends("firewall", true)
masq.default = false
masq.rmempty = true

syn_flood = s:option(Flag, "syn_flood", translate("FullCone-NAT"),
    translate("开启防火墙IFullCone-NAT服务，默认关闭。<code>可忽略</code>"))
syn_flood:depends("firewall", true)
syn_flood.default = false
syn_flood.rmempty = true

omasq = s:option(Flag, "omasq", translate("防火墙规定"),
    translate("添加自定义防火墙规则。<code>建议开启</code>"))
omasq:depends("firewall", true)

ip_tables = s:option(DynamicList, "ip_tables", translate(" "))
ip_tables.default = "iptables -t nat -I POSTROUTING -o eth0 -j MASQUERADE"
ip_tables.anonymous = false
ip_tables:depends("omasq", true)

if luci.http.formvalue("cbi.apply") then
    sys.exec("/etc/init.d/wizard start &")
end

--if wizard.lan_ipaddr ~= uci:get("network", "lan", "ipaddr") then
--    m:append(Template("wizard/apply_widget"))
--end

return m
