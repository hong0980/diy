#/bin/bash
echo 当前时间:$(date "+%Y-%m%d-%H%M ")
echo '修改网关'
sed -i 's/192.168.1.1/192.168.2.1/g' package/base-files/files/bin/config_generate

echo '修改时区'
sed -i "s/'UTC'/'CST-8'\n        set system.@system[-1].zonename='Asia\/Shanghai'/g" package/base-files/files/bin/config_generate

echo '修改名称'
sed -i 's/OpenWrt/Newifi/g' package/base-files/files/bin/config_generate

echo '修改banner'
cp -f diy/hong0980/banner package/base-files/files/etc/

ln -s ../diy package/openwrt-packages

echo '添加软件包'
git clone https://github.com/hong0980/build package/ipk
git clone https://github.com/jerrykuku/luci-app-jd-dailybonus package/luci-app-jd-dailybonus
git clone https://github.com/xiaorouji/openwrt-passwall package/passwall
#svn co https://github.com/linkease/nas-packages/trunk/network/services/ddnsto package/ddnsto
#svn co https://github.com/linkease/nas-packages/trunk/luci/luci-app-ddnsto package/luci-app-ddnsto
#sed -i 's/ddnsto.\$(PKG_ARCH_DDNSTO)/ddnsto.mipsel/g' package/luci-app-ddnsto/Makefile
sed -i 's/ddnsto.\$(PKG_ARCH_DDNSTO)/ddnsto.mipsel/g' package/ipk/luci-app-ddnsto/Makefile
#sed -i '296,315d' package/ipk/luci-app-Network-settings/luasrc/model/cbi/advanced.lua  #删除指定296-315行
#sed -i '9,35d' package/ipk/luci-app-Network-settings/luasrc/model/cbi/advanced.lua  #删除指定9—35行
sed -i '$a\chdbits.co\n\www.cnscg.club\n\pt.btschool.club\n\et8.org\n\www.nicept.net\n\pthome.net\n\ourbits.club\n\pt.m-team.cc\n\hdsky.me\n\ccfbits.org' package/passwall/luci-app-passwall/root/usr/share/passwall/rules/proxy_host
sed -i '$a\docker.com\n\docker.io' package/passwall/luci-app-passwall/root/usr/share/passwall/rules/proxy_host
sed -i '/global_rules/a	option auto_update 1\n	option week_update 0\n	option time_update 5' package/passwall/luci-app-passwall/root/etc/config/passwall
sed -i '/global_subscribe/a	option auto_update_subscribe 1\noption week_update_subscribe 7\noption time_update_subscribe 5' package/passwall/luci-app-passwall/root/etc/config/passwall
rm -rf package/diy/OpenAppFilter && git clone https://github.com/destan19/OpenAppFilter package/OpenAppFilter

git clone https://github.com/fw876/helloworld package/luci-app-ssr-plus
if [ -e package/luci-app-openclash/luci-app-openclash/luasrc/view/openclash/myip.htm ]; then
	sed -i '/status/am:section(SimpleSection).template = "openclash/myip"' package/luci-app-ssr-plus/luci-app-ssr-plus/luasrc/model/cbi/shadowsocksr/client.lua
	sed -i '/get("@global_other/i\m:section(SimpleSection).template = "openclash/myip"' package/passwall/luci-app-passwall/luasrc/model/cbi/passwall/client/global.lua
else
	cp -vr diy/hong0980/myip.htm package/luci-app-ssr-plus/luci-app-ssr-plus/luasrc/view
	sed -i '/status/am:section(SimpleSection).template = "myip"' package/luci-app-ssr-plus/luci-app-ssr-plus/luasrc/model/cbi/shadowsocksr/client.lua
	sed -i '/get("@global_other/i\m:section(SimpleSection).template = "myip"' package/passwall/luci-app-passwall/luasrc/model/cbi/passwall/client/global.lua
fi

git clone https://github.com/jefferymvp/luci-app-koolproxyR package/luci-app-koolproxyR
git clone https://github.com/tty228/luci-app-serverchan package/luci-app-serverchan && \
cp -vf diy/hong0980/serverchan package/luci-app-serverchan/root/etc/config/
git clone https://github.com/rufengsuixing/luci-app-autoipsetadder package/luci-app-autoipsetadder

sed -i 's/IMG_PREFIX:=\$(VERSION_DIST_SANITIZED)/IMG_PREFIX:=\$(shell date +%Y-%m%d-%H%M -d +8hour)-\$(VERSION_DIST_SANITIZED)/g' include/image.mk
sed -i '/o:value("\/", translate("Use as root filesystem (\/)"))/a\o:value("\/opt\/docker",translate("Use as Docker data (\/opt\/docker)"))' feeds/luci/modules/luci-mod-admin-full/luasrc/model/cbi/admin_system/fstab/mount.lua
sed -i 's/o.system.*/o.system or "?")%> | <%:RAM frequency%><%=luci.sys.exec("dmesg | grep Clock | cut -d : -f2") or ""%><\/div><\/div>/g' feeds/luci/modules/luci-mod-admin-full/luasrc/view/admin_status/index.htm

rm -rf package/kernel/broadcom-wl && svn co https://github.com/openwrt/openwrt/trunk/package/kernel/broadcom-wl package/kernel/broadcom-wl
sed -i '/ssid=OpenWrt/d' package/kernel/mac80211/files/lib/wifi/mac80211.sh
sed -i "/devidx}.mode=ap/a\			set wireless.default_radio\${devidx}.ssid=OpenWrt-\$(cat /sys/class/ieee80211/\${dev}/macaddress | awk -F \":\" '{print \$5\"\"\$6}' | tr a-z A-Z\)" package/kernel/mac80211/files/lib/wifi/mac80211.sh

sed -i '/https/d' package/network/services/uhttpd/files/uhttpd.config
cp -vRf diy/hong0980/zzz-default-settings package/default-settings/files/
aa=`grep DISTRIB_DESCRIPTION package/base-files/files/etc/openwrt_release | awk -F"'" '{print $2}'`
sed -i "s/${aa}/${aa}-$(TZ=UTC-8 date +%Y年%m月%d日)/g" package/base-files/files/etc/openwrt_release
sed -i 's/enabled		0/enabled		1/g' feeds/packages/net/miniupnpd/files/upnpd.config
sed -i '/docker-ce/d' package/ipk/luci-app-dockerman/Makefile
sed -i 's/@(aarch64||arm||x86_64)//g' package/ipk/luci-app-dockerman/Makefile

echo 'qBittorrent'
rm -rf package/lean/qt5 #5.9.8
rm -rf package/lean/luci-app-qbittorren
rm -rf package/lean/qBittorrent #4.3.1
# rm -rf diy/hong0980/qbittorrent #4.3.1
#sed -i 's/rblibtorrent/libtorrent-rasterbar/g' diy/hong0980/qbittorrent/Makefile
# rm -rf diy/hong0980/qt5 #5.98
#sed -i 's/+qbittorrent/+qBittorrent-Enhanced-Edition/g' package/ipk/luci-app-qbittorrent/Makefile #qBittorrent-Enhanced-Edition 4.2.3.10
#sed -i '33,36d' package/ipk/luci-app-qbittorrent/luasrc/model/cbi/qbittorrent/config.lua

echo '替换aria2'
rm -rf feeds/luci/applications/luci-app-aria2 && \
svn co https://github.com/hong0980/luci/trunk/applications/luci-app-aria2 feeds/luci/applications/luci-app-aria2
rm -rf feeds/packages/net/aria2 && \
svn co https://github.com/hong0980/packages/trunk/net/aria2 feeds/packages/net/aria2
cp -Rf diy/hong0980/files/aria2/* feeds/packages/net/aria2/

echo '替换transmission'
rm -rf feeds/luci/applications/luci-app-transmission && \
svn co https://github.com/hong0980/luci/trunk/applications/luci-app-transmission package/luci-app-transmission
rm -rf feeds/packages/net/transmission && \
svn co https://github.com/hong0980/packages/trunk/net/transmission package/transmission
p=`awk -F= '/PKG_VERSION:/{print $2}' package/transmission/Makefile`
[ -e diy/hong0980/files/transmission/tr$p.patch ] && cp -vRf diy/hong0980/files/transmission/tr$p.patch package/transmission/patches/tr$p.patch
rm -rf feeds/packages/net/transmission-web-control && \
svn co https://github.com/hong0980/packages/trunk/net/transmission-web-control package/transmission-web-control
rm -rf feeds/packages/net/ariang && \
svn co https://github.com/hong0980/packages/trunk/net/ariang package/ariang

po="adbyby tcpping redsocks2 luci-app-ttyd luci-app-unblockmusic rblibtorrent automount UnblockNeteaseMusic UnblockNeteaseMusicGo luci-app-adbyby-plus autosamba automount ntfs3-mount ntfs3"
for p in $po; do
[ -e package/lean/$p ] && rm -rf package/lean/$p
[ -e package/lean/$p ] || svn co https://github.com/coolsnowwolf/lede/trunk/package/lean/$p package/$p
done

sed -i "s/option enable '0'/option enable '1'/g" package/luci-app-adbyby-plus/root/etc/config/adbyby
#sed -i '/+kmod-crypto-arc4/d' package/lean/ksmbd/Makefile
rm -rf feeds/packages/utils/ttyd && \
svn co https://github.com/coolsnowwolf/packages/trunk/utils/ttyd package/ttyd
rm -rf feeds/luci/applications/luci-app-samba && \
svn co https://github.com/coolsnowwolf/luci/trunk/applications/luci-app-samba feeds/luci/applications/luci-app-samba
rm -rf package/network/services/samba36 && \
svn co https://github.com/coolsnowwolf/lede/trunk/package/network/services/samba36 package/network/services/samba36
svn co https://github.com/coolsnowwolf/lede/trunk/package/utils/bcm27xx-userland package/utils/bcm27xx-userland

sed -i '$d' feeds/luci/modules/luci-mod-admin-full/luasrc/view/admin_status/index.htm
cat >> "feeds/luci/modules/luci-mod-admin-full/luasrc/view/admin_status/index.htm" <<-EOF
<% local raid = {}
   local devs = {}
   local devinfo = {}
   local colors = { "c0c0ff", "fbbd00", "e97c30", "a0e0a0", "e0c0ff" }
   local mounts = nixio.fs.readfile("/proc/mounts")
   local show_raid = 1
   local show_disc = 1

   if self then
		if self.hide_raid then
			show_raid = 0
		end
		if self.hide_disc then
			show_disc = 0
		end
	end

	function disp_size(s)
		local units = { "kB", "MB", "GB", "TB" }
		local i, unit
		s = s / 2
			for i, unit in ipairs(units) do
				if (i == #units) or (s < 1024) then
					return math.floor(s * 100) / 100 .. unit
				end
				s = s / 1024
			end
	end

	function first_line(s)
		local n = s:find("\n")
			if n then
				return s:sub(1, n-1)
			end
		return s
	end

	function get_fs(pname, status)
		for r,raid in ipairs(raid) do
			for m,member in ipairs(raid.members) do
				if member.name == pname then
					return "(raid member)"
				end
			end
		end

		local mounted_fs = mounts:match("\n[a-z/]*" .. pname .. " [^ ]* ([^ ]*)")
		if mounted_fs then
			if status == "standby" then
				return "(" .. mounted_fs .. ")"
			end
			local df = luci.sys.exec("df /dev/" .. pname):match(" ([0-9]+)%% ")
			return "(" .. mounted_fs .. " " .. df .. "%)"
		end

		if status == "standby" then return end

		local blkid = luci.sys.exec(" blkid -s TYPE /dev/" .. pname):match("TYPE=\"(.*)\"")
		if blkid then return "(" .. blkid .. ")" end
	end

	function get_status(raid)
		for m,member in ipairs(raid.members) do
			for d,dev in ipairs(devinfo) do
				if member.name == dev.name then
					return dev.status
				end

				for p,part in ipairs(dev.parts) do
					if member.name == part.name then
						return dev.status
					end
				end
			end
		end
	end

	function get_parts(dev,status,size)
		local c = 1
		local unused = size
		local parts = {}

		for part in nixio.fs.glob("/sys/block/" .. dev .."/" .. dev .. "*") do
			local pname = nixio.fs.basename(part)
			local psize = nixio.fs.readfile(part .. "/size")
			table.insert(parts, {name=pname, size=psize, perc=math.floor(psize*100/size), fs=get_fs(pname,status), color=colors[c]})
			c = c + 1
			unused = unused - psize
		end

		if unused > 2048 then
			table.insert(parts, { name="", fs=get_fs(dev,status), size=unused, color=colors[c] })
		end
		return parts
	end

		for dev in nixio.fs.glob("/sys/block/*") do
			if nixio.fs.access(dev .. "/md") then
				local name = nixio.fs.basename(dev)
				local rlevel = first_line(nixio.fs.readfile(dev .. "/md/level"))
				local ndisks = tonumber(nixio.fs.readfile(dev .. "/md/raid_disks"))
				local size = tonumber(nixio.fs.readfile(dev .. "/size"))
				local metav = nixio.fs.readfile(dev .. "/md/metadata_version")
				local degr = tonumber(nixio.fs.readfile(dev .. "/md/degraded"))
				local sync = first_line(nixio.fs.readfile(dev .. "/md/sync_action"))
				local sync_speed = tonumber(nixio.fs.readfile(dev .. "/md/sync_speed"))
				local sync_compl = nixio.fs.readfile(dev .. "/md/sync_completed")
				local status = "active"

					if sync ~= "idle" then
						local progress, total = nixio.fs.readfile(dev .. "/md/sync_completed"):match("^([0-9]*)[^0-9]*([0-9]*)")
						local rem = (total - progress) / sync_speed / 2
						local rems = math.floor(rem % 60)
						if rems < 10 then rems = "0" .. rems end
						rem = math.floor(rem / 60)
						local remm = math.floor(rem % 60)
						if remm < 10 then remm = "0" .. remm end
						local remh = math.floor(rem / 60)
						local remstr = remh .. ":" .. remm .. ":" .. rems
						status = sync .. " (" .. math.floor(sync_speed/1024) .. "MB/s, " .. math.floor(progress * 1000 / total) /10  .. "%, rem. " .. remstr .. ")"
					elseif degr == 1 then
						status = "degraded"
					end

				local members = {}
				local c = 1
				for member in nixio.fs.glob("/sys/block/" .. name .. "/md/dev-*") do
					local dname = nixio.fs.basename(nixio.fs.readlink(member .. "/block"))
					local dsize = disp_size(tonumber(nixio.fs.readfile(member .. "/block/size")))
					local dstate = nixio.fs.readfile(member .. "/state"):gsub("_", " "):match "^%s*(.-)%s*$"
					table.insert(members, { name = dname, size = dsize, state = dstate, color = colors[c] })
					c = c + 1
				end
				table.insert(raid, {name=name, rlevel=rlevel, ndisks=ndisks, size=size, metav=metav, status=status, members=members })
			end
		end

		if show_disc == 1 then
			for dev in nixio.fs.glob("/sys/class/scsi_disk/*/device") do
				local section
				local model = nixio.fs.readfile(dev .. "/model")
				local fw = nixio.fs.readfile(dev .. "/rev")
					for bdev in nixio.fs.glob(dev .. "/block/*") do
						local section
						local name = nixio.fs.basename(bdev)
						local size = tonumber(nixio.fs.readfile(bdev .. "/size"))
						local unused = size
						local status = "-"
						local temp = "-"
						local serial = "-"
						local secsize = "-"

						for _,line in ipairs(luci.util.execl("smartctl -A -i -n standby -f brief /dev/" .. name)) do
							local attrib, val
								if section == 1 then
									attrib, val = line:match "^(.*):%s*(.*)"
								elseif section == 2 then
									attrib, val = line:match("^([0-9 ]*) [^ ]* * [POSRCK-]* *[0-9-]* *[0-9-]* *[0-9-]* *[0-9-]* *([0-9-]*)")
								else
									attrib = line:match "^=== START OF (.*) SECTION ==="
										if attrib == "INFORMATION" then
											section = 1
										elseif attrib == "READ SMART DATA" then
											section = 2
										elseif status == "-" then
											val = line:match "^Device is in (.*) mode"
												if val then
													status = val:lower()
												end
										end
								end

								if not attrib then
										if section ~= 2 then section = 0 end
								elseif (attrib == "Power mode is") or (attrib == "Power mode was") then
										status = val:lower():match "(%S*)"
								elseif attrib == "Sector Sizes" then
										secsize = val:match "([0-9]*) bytes physical"
								elseif attrib == "Sector Size" then
										secsize = val:match "([0-9]*)"
								elseif attrib == "Serial Number" then
										serial = val
								elseif attrib == "194" then
										temp = val .. "&deg;C"
								end
						end
						table.insert(devinfo, {name=name, model=model, fw=fw, size=size, status=status, temp=temp, serial=serial, secsize=secsize, parts=get_parts(name,status,size) })
					end
			end

			for r,dev in ipairs(raid) do
				table.insert(devinfo, {name=dev.name, model="Linux RAID", size=dev.size, status=get_status(dev), secsize=secsize, parts=get_parts(dev.name,status,dev.size) })
			end
		end
if show_disc == 1 then%>

<div class="cbi-section">
	<h4><%:Disks%></h4>
	<table class="cbi-section-table" style="white-space: nowrap">
		<tr>
			<th width="5%"><%:Path%></th>
			<th width="30%"><%:Disks Model%></th>
			<th width="15%"><%:Serial Number%></th>
			<th width="10%"><%:Firmware%></th>
			<th width="10%"><%:Capacity%></th>
			<th width="7%"><%:Sector size%></th>
			<th width="7%"><%:Temperature%></th>
			<th width="16%"><%:Power state%></th>
		</tr>
		<%	local style=true for d,dev in ipairs(devinfo) do %>
		<tr class="cbi-section-table-row cbi-rowstyle-<%=(style and 1 or 2)%>">
			<td class="cbi-vluae-field" style="padding-bottom:0px; border-bottom-width:0px; vertical-align:middle" rowspan="4"><%=dev.name%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.model%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.serial%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.fw%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=disp_size(dev.size)%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.secsize%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.temp%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.status%></td>
		</tr>
		<tr style="height:0px" />
		<tr class="cbi-section-table-row cbi-rowstyle-<%=(style and 1 or 2)%>">
			<td style="padding-top:0px; border-top-width:0px" colspan="7" rowspan="2">
				<table style="border: 0pt; border-collapse:collapse; width:100%; padding:0px; margin:0px"><tr>
					<% for _, part in pairs(dev.parts) do %>
					<td style="text-align:center; padding: 0px 4px; border-radius: 3px; background-color:#<%=part.color%>"
					width="<%=part.perc%>%"><%=part.name%> <%=disp_size(part.size)%> <%=part.fs%></td>
					<% end %>
				</tr></table>
			</td>
		</tr>
		<tr style="height:0px" />
		<% style = not style end %>
	</table>
</div>

<% end if show_raid == 1 and #raid > 0 then %>
<div class="cbi-section">
	<h4><%:Raid arrays%></h4>
	<table class="cbi-section-table" style="white-space:nowrap">
		<tr>
			<th width="5%"><%:Path%></th>
			<th width="13%"><%:Level%></th>
			<th width="13%"><%:# Disks%></th>
			<th width="13%"><%:Capacity%></th>
			<th width="13%"><%:Metadata%></th>
			<th width="43%"><%:Status%></th>
		</tr>
		<%	local style=true for r,dev in ipairs(raid) do %>
		<tr class="cbi-section-table-row cbi-rowstyle-<%=(style and 1 or 2)%>">
			<td class="cbi-vluae-field" style="padding-bottom:0px; border-bottom-width:0px; vertical-align:middle" rowspan="4"><%=dev.name%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.rlevel%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.ndisks%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=disp_size(dev.size)%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.metav%></td>
			<td class="cbi-value-field" style="padding-bottom:0px; border-bottom-width:0px" rowspan="2"><%=dev.status%></td>
		</tr>
		<tr style="height:0px" />
		<tr class="cbi-section-table-row cbi-rowstyle-<%=(style and 1 or 2)%>">
			<td style="padding-top:0px; border-top-width:0px" colspan="6" rowspan="2">
				<table style="border: 0pt; border-collapse:collapse; width:100%; padding:0px; margin:0px"><tr>
					<% for _,member in pairs(dev.members) do %>
					<td style="text-align:center; padding: 0px 4px; border-radius: 3px; background-color:#<%=member.color%>; white-space: nowrap"><%=member.name%> <%=member.size%> (<%=member.state%>)</td>
					<% end %>
				</tr></table>
			</td>
		</tr>
		<tr style="height:0px" />
		<%	style = not style end %>
	</table>
</div>
<% end %>

<%-
local incdir = util.libpath() .. "/view/admin_status/index/"
if fs.access(incdir) then
	local inc
	for inc in fs.dir(incdir) do
		if inc:match("%.htm$") then
			include("admin_status/index/" .. inc:gsub("%.htm$", ""))
		end
	end
end
-%>

<%+footer%>
EOF
cp -Rf package/diy/npc package/npc
echo '删除重复包'
rm -rf package/diy
