-- Copyright (C) 2021 dz <dingzhong110@gmail.com>
-- https://openwrt.org/docs/guide-user/network/wifi/mesh/batman
local m, s, o
local util = require "luci.util"
local uci  = require "luci.model.uci".cursor()

local function get_bat_nodes()
	local nodes = {}
	local output = util.exec("batctl n 2>/dev/null | awk 'NR>2 {print $1,$2,$3,$4}'") or ""

	for line in output:gmatch("[^\r\n]+") do
		local iface, neighbor, lastseen, link_quality = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
		if iface then
			nodes[#nodes + 1] = { IF = iface, Neighbor = neighbor, lastseen = lastseen, link_quality = link_quality }
		end
	end

	return nodes
end

local bat_nodes = get_bat_nodes()
local node_count = #bat_nodes

m = Map("easymesh", translate("EasyMesh Configuration"),
	translate("Configure wireless mesh network using Batman-adv"))

if node_count > 0 then
	s = m:section(Table, bat_nodes,
		translatef("<b>Active Mesh Nodes: %d</b>", node_count))
	s:option(DummyValue, "IF", translate("Interface"))
	s:option(DummyValue, "Neighbor", translate("Neighbor MAC"))
	s:option(DummyValue, "lastseen", translate("Last Seen"))
	s:option(DummyValue, "link_quality", translate("Link Quality"))
end

s = m:section(TypedSection, "easymesh", translate(" "))
s.anonymous = true

o = s:option(Flag, "enabled", translate("Enable"),
	translate("Enable or disable EASY MESH"))
o.default = 0
o.rmempty = false

o = s:option(ListValue, "role", translate("role"))
o:value("off", translate("off"))
o:value("server", translate("host MESH"))
o:value("client", translate("son MESH"))
o.rmempty = false

local radios = {}
uci:foreach("wireless", "wifi-device",
	function(s) radios[s['.name']] = true end)

o = s:option(ListValue, "apRadio", translate("MESH Radio device"),
	translate("The radio device which MESH use"))
for radio in pairs(radios) do
	o:value(radio, radio:upper())
end
o:value("all", translate("All"))
o.default = next(radios) or "radio0"

o = s:option(Value, "mesh_id", translate("MESH ID"),
	translate("MESH ID"))
o.default = "openwrt_mesh"
o.datatype = "string"

o = s:option(Flag, "encryption", translate("Encryption"))
o.default = 0
o.rmempty = false

o = s:option(Value, "key", translate("Key"))
o.default = "easymesh"
o:depends("encryption", 1)
o.datatype = "rangelength(8,16)"

o = s:option(Flag, "kvr", translate("K/V/R"),
	translate("Enable 802.11k/v/r for improved roaming and network management. 802.11k provides neighbor reports, 802.11v supports load balancing, and 802.11r enables fast AP transitions."))
o.default = 1
o.rmempty = false

o = s:option(Value, "mobility_domain", translate("Mobility Domain"),
	translate("4-character hexadecimal ID"))
o.default = "4f57"
o.datatype = "and(hexstring,rangelength(4, 4))"
o:depends("kvr", 1)

o = s:option(Value, "rssi_val", translate("Threshold for an good RSSI"),
	translate("RSSI threshold (dBm) for a good signal, used by DAWN to prefer stronger APs."))
o.default = "-60"
o.datatype = "range(-120, -1)"
o:depends("kvr", 1)

o = s:option(Value, "low_rssi_val", translate("Threshold for an bad RSSI"),
	translate("RSSI threshold (dBm) for a bad signal, used by DAWN to trigger AP switching."))
o.default = "-88"
o.datatype = "range(-120, -1)"
o:depends("kvr", 1)

enable = s:option(Flag, "ap_mode", translate("AP MODE Enable"),
	translate("Enable or disable AP MODE"))
enable.default = 0
enable.rmempty = false

o = s:option(Value, "ap_ipaddr", translate("IPv4-Address"))
o.default = "192.168.1.10"
o.datatype = "ip4addr"
o:depends("ap_mode", 1)

o = s:option(Value, "netmask", translate("IPv4 netmask"))
o.default = "255.255.255.0"
o.datatype = "ip4addr"
o:depends("ap_mode", 1)

o = s:option(Value, "gateway", translate("IPv4 gateway"))
o.default = "192.168.1.1"
o.datatype = "ip4addr"
o:depends("ap_mode", 1)

o = s:option(Value, "dns", translate("Use custom DNS servers"))
o.default = "192.168.1.1"
o.datatype = "ip4addr"
o:depends("ap_mode", 1)

return m
