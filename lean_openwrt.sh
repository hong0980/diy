#!/usr/bin/env bash
# git.io/J6IXO git.io/ql_diy git.io/lean_openwrt is.gd/lean_openwrt is.gd/build_environment is.gd/immortalwrt_openwrt
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
# curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | jq -r '.[0].assets[].browser_download_url' | grep 'cache' >xc
# curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | awk -F'"' '/browser_download_url/{print $4}' | grep 'cache' >xa
curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xa

if [[ -n $cache_Release ]]; then
	count=0
	while read -r line; do
		if ! grep -q "${line##*/}" xc 2>/dev/null; then
			if wget -qO "output/${line##*/}" "$line"; then
				if [[ $(du -m "output/${line##*/}" | cut -f1) -ge 300 ]]; then
					echo "${line##*/} 已经下载完成"
					count=$[count+1]
				else
					rm -f "output/${line##*/}"
				fi
			fi
		fi
		[ $count -eq 3 ] && break
	done < xa

	if [ "$(ls -A output)" ]; then
		echo "UPLOAD_Release=true" >> $GITHUB_ENV
	else
		echo "没有新的cache可以下载！"
	fi
	exit 0
fi

if [[ -n $FETCH_CACHE ]]; then
	hx=`ls $REPO_FLODER/bin/targets/*/*/*toolchain* 2>/dev/null | sed "s/openwrt/$IMG_NAME/g" 2>/dev/null`
	xx=`ls $REPO_FLODER/bin/targets/*/*/*imagebuil* 2>/dev/null | sed "s/openwrt/$IMG_NAME/g" 2>/dev/null`
	grep -q "$CACHE_NAME" xa || {
		echo "打包cache"
		[[ -n $hx ]] && (cp -v `find $REPO_FLODER/bin/targets/ -type f -name "*toolchain*"` output/${hx##*/} || true)
		[[ -n $xx ]] && (cp -v `find $REPO_FLODER/bin/targets/ -type f -name "*imagebuil*"` output/${xx##*/} || true)
		pushd $REPO_FLODER || pushd openwrt
		[[ -d ".ccache" ]] && (ccache=".ccache"; ls -alh .ccache)
		tar -I zstdmt -cf ../output/$CACHE_NAME-cache.tzst staging_dir/host* staging_dir/tool* $ccache || \
		tar --zstd -cf ../output/$CACHE_NAME-cache.tar.zst staging_dir/host* staging_dir/tool* $ccache
		du -h --max-depth=1 ./ --exclude=staging_dir
		du -h --max-depth=1 ./staging_dir
		popd
		ls -lh output
		if [[ $(du -m "output/${CACHE_NAME}*" | cut -f1) -ge 300 ]]; then
			echo "OUTPUT_RELEASE=true" >>$GITHUB_ENV
		fi
	}
	echo "SAVE_CACHE=" >>$GITHUB_ENV
	exit 0
fi
[[ -n $VERSION ]] || VERSION=plus
[[ -n $PARTSIZE ]] || PARTSIZE=900
mkdir firmware output

color() {
	case $1 in
		cy) echo -e "\033[1;33m$2\033[0m" ;;
		cr) echo -e "\033[1;31m$2\033[0m" ;;
		cg) echo -e "\033[1;32m$2\033[0m" ;;
		cb) echo -e "\033[1;34m$2\033[0m" ;;
	esac
}

status() {
	CHECK=$?
	END_TIME=$(date '+%H:%M:%S')
	_date=" ==>用时 $[$(date +%s -d "$END_TIME") - $(date +%s -d "$BEGIN_TIME")] 秒"
	[[ $_date =~ [0-9]+ ]] || _date=""
	if [ $CHECK = 0 ]; then
		printf "%35s %s %s %s %s %s %s\n" \
		`echo -e "[ $(color cg ✔)\033[0;39m ]${_date}"`
	else
		printf "%35s %s %s %s %s %s %s\n" \
		`echo -e "[ $(color cr ✕)\033[0;39m ]${_date}"`
	fi
}

git_apply() {
	for z in $@; do
		[[ $z =~ \# ]] || wget -qO- $z | git apply --reject --ignore-whitespace
	done
}

_packages() {
	for z in $@; do
		[[ $z =~ ^# ]] || echo "CONFIG_PACKAGE_$z=y" >>.config
	done
}

_delpackage() {
	for z in $@; do
		[[ $z =~ ^# ]] || sed -i -E "s/(CONFIG_PACKAGE_.*$z)=y/# \1 is not set/" .config
	done
}

_printf() {
	awk '{printf "%s %-40s %s %s %s\n" ,$1,$2,$3,$4,$5}'
}

svn_co() {
	g=$(find package/ feeds/ target/ -maxdepth 5 -type d -name ${2##*/} 2>/dev/null)
	if [[ -d $g ]]; then
		k="$g"
		mv -f $g ../
	else
		k="package/A/${2##*/}"
	fi
	if svn export --force $1 $2 $k 1>/dev/null 2>&1; then
	# $1="-rxxx" $2="url" $k="path"
		if [[ $k = $g ]]; then
			echo -e "$(color cg 替换) ${2##*/} [ $(color cg ✔) ]" | _printf
		else
			echo -e "$(color cb 添加) ${2##*/} [ $(color cb ✔) ]" | _printf
		fi
	else
		echo -e "$(color cr 拉取) ${2##*/} [ $(color cr ✕) ]" | _printf
		[[ -d ../${g##*/} ]] && (mv -f ../${g##*/} ${g%/*}/ && \
			echo -e "$(color cy 回退) ${g##*/} [ $(color cy ✔) ]" | _printf)
	fi
	unset -v k g
}

clone_url() {
	# set -x
	for x in $@; do
		name="${x##*/}"
		if [[ "$(grep "^https" <<<$x | egrep -v "helloworld$|build$|openwrt-passwall-packages$")" ]]; then
			g=$(find package/ target/ feeds/ -maxdepth 5 -type d -name "$name" 2>/dev/null | grep "/${name}$" | head -n 1)
			if [[ -d $g ]]; then
				mv -f $g ../ && k="$g"
			else
				k="package/A/$name"
			fi

			if [[ "$(egrep "trunk|branches" <<<$x)" ]]; then
				svn export $x $k 1>/dev/null 2>&1 && f="1"
			else
				git clone -q $x $k && f="1"
			fi

			if [[ -n $f ]]; then
				if [[ $k = $g ]]; then
					echo -e "$(color cg 替换) $name [ $(color cg ✔) ]" | _printf
				else
					echo -e "$(color cb 添加) $name [ $(color cb ✔) ]" | _printf
				fi
			else
				echo -e "$(color cr 拉取) $name [ $(color cr ✕) ]" | _printf
				if [[ $k = $g ]]; then
					mv -f ../${g##*/} ${g%/*}/ && \
					echo -e "$(color cy 回退) ${g##*/} [ $(color cy ✔) ]" | _printf
				fi
			fi
			unset -v f k g
		else
			for w in $(grep "^https" <<<$x); do
				git clone -q $w ../${w##*/} && {
					for z in `ls -l ../${w##*/} | awk '/^d/{print $NF}' | grep -Ev 'dump$|dtest$'`; do
						g=$(find package/ feeds/ target/ -maxdepth 5 -type d -name $z 2>/dev/null | head -n 1)
						if [[ -d $g ]]; then
							rm -rf $g && k="$g"
						else
							k="package/A"
						fi
						if mv -f ../${w##*/}/$z $k; then
							if [[ $k = $g ]]; then
								echo -e "$(color cg 替换) $z [ $(color cg ✔) ]" | _printf
							else
								echo -e "$(color cb 添加) $z [ $(color cb ✔) ]" | _printf
							fi
						fi
						unset -v k g
					done
				} && rm -rf ../${w##*/}
			done
		fi
	done
	# set +x
}

REPO_URL="https://github.com/coolsnowwolf/lede"
echo -e "$(color cy '拉取源码....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
[[ $REPO_BRANCH ]] && cmd="-b $REPO_BRANCH"
git clone -q $cmd $REPO_URL $REPO_FLODER --single-branch
status
[[ -d $REPO_FLODER ]] && cd $REPO_FLODER || exit

export SOURCE_NAME=$(awk -F'/' '{print $(NF-1)}' <<<$REPO_URL)
export IMG_NAME="$SOURCE_NAME-${REPO_BRANCH#*-}-$TARGET_DEVICE"
export TOOLS_HASH=`git log --pretty=tformat:"%h" -n1 tools toolchain`
case "$TARGET_DEVICE" in
	"x86_64") export DEVICE_NAME="x86_64";;
	"asus_rt-n16") export DEVICE_NAME="bcm47xx_mips74k";;
	"armvirt_64_Default") export DEVICE_NAME="armvirt_64";;
	"newifi-d2"|"phicomm_k2p") export DEVICE_NAME="ramips_mt7621";;
	"r1-plus-lts"|"r1-plus"|"r4s"|"r2c"|"r2s") export DEVICE_NAME="rockchip_armv8";;
esac
export CACHE_NAME="$SOURCE_NAME-$TOOLS_HASH-$DEVICE_NAME"
echo "IMG_NAME=$IMG_NAME" >>$GITHUB_ENV
echo "CACHE_NAME=$CACHE_NAME" >>$GITHUB_ENV
echo "SOURCE_NAME=$SOURCE_NAME" >>$GITHUB_ENV
echo "CACHE_ACTIONS=" >>$GITHUB_ENV

if (grep -q "$CACHE_NAME-cache.tzst" ../xa || grep -q "$CACHE_NAME-cache.tzst" ../xc); then
	echo -e "$(color cy '下载tz-cache')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
	grep -q "$CACHE_NAME-cache.tzst" ../xa && \
	wget -qc -t=3 $(grep "$CACHE_NAME" ../xa) || \
	wget -qc -t=3 $(grep "$CACHE_NAME" ../xc)
	[ -e *.tzst ]; status
	[ -e *.tzst ] && {
		echo -e "$(color cy '部署tz-cache')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
		(tar -I unzstd -xf *.tzst || tar -xf *.tzst) && {
			if ! grep -q "$CACHE_NAME-cache.tzst" ../xa; then
				cp *.tzst ../output
				echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
			fi
			sed -i 's/ $(tool.*stamp-compile)//g' Makefile
		}
		[ -d staging_dir ]; status
	}
else
	VERSION=''
fi

echo -e "$(color cy '更新软件....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
./scripts/feeds update -a 1>/dev/null 2>&1
./scripts/feeds install -a 1>/dev/null 2>&1
status

: >.config
case "$TARGET_DEVICE" in
	"x86_64")
		cat >.config<<-EOF
		CONFIG_TARGET_x86=y
		CONFIG_TARGET_x86_64=y
		CONFIG_TARGET_x86_64_DEVICE_generic=y
		CONFIG_TARGET_ROOTFS_PARTSIZE=$PARTSIZE
		CONFIG_BUILD_NLS=y
		CONFIG_BUILD_PATENTED=y
		CONFIG_TARGET_IMAGES_GZIP=y
		CONFIG_GRUB_IMAGES=y
		# CONFIG_GRUB_EFI_IMAGES is not set
		# CONFIG_VMDK_IMAGES is not set
		EOF
		;;
	"r1-plus-lts"|"r1-plus"|"r4s"|"r2c"|"r2s")
		cat<<-EOF >.config
		CONFIG_TARGET_rockchip=y
		CONFIG_TARGET_rockchip_armv8=y
		CONFIG_TARGET_ROOTFS_PARTSIZE=$PARTSIZE
		CONFIG_BUILD_NLS=y
		CONFIG_BUILD_PATENTED=y
		CONFIG_DRIVER_11AC_SUPPORT=y
		CONFIG_DRIVER_11N_SUPPORT=y
		CONFIG_DRIVER_11W_SUPPORT=y
		EOF
		case "$TARGET_DEVICE" in
		"r1-plus-lts"|"r1-plus")
		echo "CONFIG_TARGET_rockchip_armv8_DEVICE_xunlong_orangepi-$TARGET_DEVICE=y" >>.config ;;
		"r4s"|"r2c"|"r2s")
		echo "CONFIG_TARGET_rockchip_armv8_DEVICE_friendlyarm_nanopi-$TARGET_DEVICE=y" >>.config ;;
		esac
		;;
	"newifi-d2")
		cat >.config<<-EOF
		CONFIG_TARGET_ramips=y
		CONFIG_TARGET_ramips_mt7621=y
		CONFIG_TARGET_ramips_mt7621_DEVICE_d-team_newifi-d2=y
		EOF
		;;
	"phicomm_k2p")
		cat >.config<<-EOF
		CONFIG_TARGET_ramips=y
		CONFIG_TARGET_ramips_mt7621=y
		CONFIG_TARGET_ramips_mt7621_DEVICE_phicomm_k2p=y
		EOF
		;;
	"asus_rt-n16")
		cat >.config<<-EOF
		CONFIG_TARGET_bcm47xx=y
		CONFIG_TARGET_bcm47xx_mips74k=y
		CONFIG_TARGET_bcm47xx_mips74k_DEVICE_asus_rt-n16=y
		EOF
		;;
	"armvirt_64_Default")
		cat >.config<<-EOF
		CONFIG_TARGET_armvirt=y
		CONFIG_TARGET_armvirt_64=y
		CONFIG_TARGET_armvirt_64_Default=y
		EOF
		;;
esac

cat >>.config <<-EOF
	CONFIG_KERNEL_BUILD_USER="win3gp"
	CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
	CONFIG_PACKAGE_luci-app-accesscontrol=y
	CONFIG_PACKAGE_luci-app-bridge=y
	CONFIG_PACKAGE_luci-app-cowb-speedlimit=y
	CONFIG_PACKAGE_luci-app-cowbping=y
	CONFIG_PACKAGE_luci-app-cpulimit=y
	CONFIG_PACKAGE_luci-app-ddnsto=y
	CONFIG_PACKAGE_luci-app-filebrowser=y
	CONFIG_PACKAGE_luci-app-filetransfer=y
	CONFIG_PACKAGE_luci-app-network-settings=y
	CONFIG_PACKAGE_luci-app-oaf=y
	CONFIG_PACKAGE_luci-app-passwall=y
	CONFIG_PACKAGE_luci-app-timedtask=y
	CONFIG_PACKAGE_luci-app-ssr-plus=y
	CONFIG_PACKAGE_luci-app-wrtbwmon=y
	CONFIG_PACKAGE_luci-app-ttyd=y
	CONFIG_PACKAGE_luci-app-upnp=y
	CONFIG_PACKAGE_luci-app-ikoolproxy=y
	CONFIG_PACKAGE_luci-app-wizard=y
	CONFIG_PACKAGE_luci-app-simplenetwork=y
	CONFIG_PACKAGE_luci-app-opkg=y
	CONFIG_PACKAGE_automount=y
	CONFIG_PACKAGE_autosamba=y
	CONFIG_PACKAGE_luci-app-diskman=y
	CONFIG_PACKAGE_luci-app-syncdial=y
	CONFIG_PACKAGE_luci-theme-bootstrap=y
	CONFIG_PACKAGE_luci-theme-material=y
	CONFIG_PACKAGE_luci-app-tinynote=y
	CONFIG_PACKAGE_luci-app-arpbind=y
	CONFIG_PACKAGE_luci-app-wifischedule=y
	# CONFIG_PACKAGE_luci-app-unblockmusic is not set
	# CONFIG_PACKAGE_luci-app-wireguard is not set
	# CONFIG_PACKAGE_luci-app-autoreboot is not set
	# CONFIG_PACKAGE_luci-app-ddns is not set
	## CONFIG_PACKAGE_luci-app-ssr-plus is not set
	# CONFIG_PACKAGE_luci-app-zerotier is not set
	# CONFIG_PACKAGE_luci-app-ipsec-vpnd is not set
	# CONFIG_PACKAGE_luci-app-xlnetacc is not set
	# CONFIG_PACKAGE_luci-app-uugamebooster is not set
	EOF

config_generate="package/base-files/files/bin/config_generate"
color cy "自定义设置.... "
	wget -qO package/base-files/files/etc/banner git.io/JoNK8
	if [[ $IMG_NAME =~ "coolsnowwolf" ]]; then
		REPO_BRANCH="18.06"
		sed -i "/DISTRIB_DESCRIPTION/ {s/'$/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)'/}" package/*/*/*/openwrt_release
		sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk
		sed -i 's/option enabled.*/option enabled 1/' feeds/*/*/*/*/upnpd.config
		sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
		sed -i 's/UTC/UTC-8/' Makefile
		sed -i "{
				/upnp/d;/banner/d;/openwrt_release/d;/shadow/d
				s|zh_cn|zh_cn\nuci set luci.main.mediaurlbase=/luci-static/bootstrap|
				\$i sed -i 's/root::.*/root:\$1\$RysBCijW\$wIxPNkj9Ht9WhglXAXo4w0:18206:0:99999:7:::/g' /etc/shadow\n[ -f '/bin/bash' ] && sed -i '/\\\/ash$/s/ash/bash/' /etc/passwd
				}" $(find package/ -type f -name "*default-settings" 2>/dev/null)
	fi
	# git diff ./ >> ../output/t.patch || true
clone_url "
	https://github.com/hong0980/build
	https://github.com/fw876/helloworld
	https://github.com/xiaorouji/openwrt-passwall-packages
"
	[ "$VERSION" = plus -a "$TARGET_DEVICE" != phicomm_k2p -a "$TARGET_DEVICE" != newifi-d2 ] && {
		clone_url "
			https://github.com/destan19/OpenAppFilter
			https://github.com/jerrykuku/luci-app-vssr
			https://github.com/jerrykuku/lua-maxminddb
			https://github.com/zzsj0928/luci-app-pushbot
			https://github.com/yaof2/luci-app-ikoolproxy
			#https://github.com/project-lede/luci-app-godproxy
			https://github.com/vernesong/OpenClash/trunk/luci-app-openclash
			#https://github.com/immortalwrt/packages/trunk/net/qBittorrent-Enhanced-Edition
			https://github.com/sirpdboy/luci-app-cupsd/trunk/luci-app-cupsd
			https://github.com/sirpdboy/luci-app-cupsd/trunk/cups
			https://github.com/immortalwrt/luci/trunk/applications/luci-app-eqos
			https://github.com/immortalwrt/packages/trunk/net/adguardhome
			https://github.com/kiddin9/openwrt-packages/trunk/luci-app-adguardhome
			https://github.com/immortalwrt/packages/trunk/utils/cpulimit
			#https://github.com/sirpdboy/luci-app-netdata
			#https://github.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic
			https://github.com/xiaorouji/openwrt-passwall2/trunk/luci-app-passwall2
			https://github.com/xiaorouji/openwrt-passwall/trunk/luci-app-passwall
		"
		[[ -e package/A/luci-app-unblockneteasemusic/root/etc/init.d/unblockneteasemusic ]] && \
		sed -i '/log_check/s/^/#/' package/A/*/*/*/init.d/unblockneteasemusic
		packages_url="luci-app-bypass luci-app-filetransfer"
		for k in $packages_url; do
			clone_url "https://github.com/kiddin9/openwrt-packages/trunk/$k"
		done

		[[ $REPO_BRANCH =~ "18.06" ]] && {
			for d in $(find feeds/ package/ -type f -name "index.htm" 2>/dev/null); do
				if grep -q "Kernel Version" $d; then
					sed -i 's|os.date(.*|os.date("%F %X") .. " " .. translate(os.date("%A")),|' $d
					sed -i '/<%+footer%>/i<%-\n\tlocal incdir = util.libpath() .. "/view/admin_status/index/"\n\tif fs.access(incdir) then\n\t\tlocal inc\n\t\tfor inc in fs.dir(incdir) do\n\t\t\tif inc:match("%.htm$") then\n\t\t\t\tinclude("admin_status/index/" .. inc:gsub("%.htm$", ""))\n\t\t\tend\n\t\tend\n\t\end\n-%>\n' $d
					sed -i 's| <%=luci.sys.exec("cat /etc/bench.log") or ""%>||' $d
				fi
			done
			_packages "luci-app-argon-config luci-theme-argon"
			clone_url "
			https://github.com/liuran001/openwrt-packages/trunk/luci-theme-argon
			https://github.com/liuran001/openwrt-packages/trunk/luci-app-argon-config
			https://github.com/brvphoenix/wrtbwmon
			https://github.com/firker/luci-app-wrtbwmon-zh/trunk/luci-app-wrtbwmon-zh"
		}
		sed -i 's/ariang/ariang +webui-aria2/g' feeds/*/*/luci-app-aria2/Makefile
	}
	# git clone -b luci https://github.com/xiaorouji/openwrt-passwall package/A/luci-app-passwall
	# https://github.com/immortalwrt/luci/branches/openwrt-21.02/applications/luci-app-ttyd ##使用分支
	# echo -e 'pthome.net\nchdbits.co\nhdsky.me\nourbits.club' | \
	# tee -a $(find package/A/luci-* feeds/luci/applications/luci-* -type f -name "white.list" -o -name "direct_host" 2>/dev/null | grep "ss") >/dev/null
	echo -e '\nwww.nicept.net' | \
	tee -a $(find package/A/luci-* feeds/luci/applications/luci-* -type f -name "black.list" -o -name "proxy_host" 2>/dev/null | grep "ss") >/dev/null
	
	mwan3=feeds/packages/net/mwan3/files/etc/config/mwan3
	[[ -f $mwan3 ]] && grep -q "8.8" $mwan3 && \
	sed -i '/8.8/d' $mwan3

	# echo '<iframe src="https://ip.skk.moe/simple" style="width: 100%; border: 0"></iframe>' | \
	# tee -a {$(find package/ feeds/luci/applications/ -type d -name "luci-app-vssr" 2>/dev/null)/*/*/*/status_top.htm,$(find package/ feeds/luci/applications/ -type d -name "luci-app-ssr-plus" 2>/dev/null)/*/*/*/status.htm,$(find package/ feeds/luci/applications/ -type d -name "luci-app-bypass" 2>/dev/null)/*/*/*/status.htm,$(find package/ feeds/luci/applications/ -type d -name "luci-app-passwall" 2>/dev/null)/*/*/*/global/status.htm} >/dev/null

	# xa=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-vssr" 2>/dev/null)
	# [[ -d $xa ]] && sed -i "/dports/s/1/2/;/ip_data_url/s|'.*'|'https://ispip.clang.cn/all_cn.txt'|" $xa/root/etc/config/vssr
	xb=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-bypass" 2>/dev/null)
	[[ -d $xb ]] && sed -i 's/default y/default n/g' $xb/Makefile
	# https://github.com/userdocs/qbittorrent-nox-static/releases
	xc=$(find package/A/ feeds/ -type d -name "qBittorrent-static" 2>/dev/null)
	[[ -d $xc ]] && sed -i 's/PKG_VERSION:=.*/PKG_VERSION:=4.5.5_v2.0.9/;s/userdocs/hong0980/;s/ARCH)-qbittorrent/ARCH)-qt6-qbittorrent/' $xc/Makefile
	xd=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-turboacc" 2>/dev/null)
	[[ -d $xd ]] && sed -i '/hw_flow/s/1/0/;/sfe_flow/s/1/0/;/sfe_bridge/s/1/0/' $xd/root/etc/config/turboacc
	xe=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-ikoolproxy" 2>/dev/null)
	[[ -d $xe ]] && sed -i '/echo .*root/ s/echo /[ $time =~ [0-9]+ ] \&\& echo /' $xe/root/etc/init.d/koolproxy
	# xf=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-store" 2>/dev/null)
	# [[ -d $xf ]] && sed -i 's/ +luci-lib-ipkg//' $xf/Makefile
	xg=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-pushbot" 2>/dev/null)
	[[ -d $xg ]] && {
		sed -i "s|-c pushbot|/usr/bin/pushbot/pushbot|" $xg/luasrc/controller/pushbot.lua
		sed -i '/start()/a[ "$(uci get pushbot.@pushbot[0].pushbot_enable)" -eq "0" ] && return 0' $xg/root/etc/init.d/pushbot
	}
	# xh=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-passwall" 2>/dev/null)
	# [[ -d $xh ]] && sed -i '/+v2ray-geoip/d' $xh/Makefile
	_packages "
	luci-app-aria2
	luci-app-cifs-mount
	luci-app-commands
	luci-app-hd-idle
	luci-app-pushbot
	luci-app-eqos
	luci-app-softwarecenter
	luci-app-transmission
	luci-app-usb-printer
	luci-app-vssr
	luci-app-bypass
	luci-app-cupsd
	luci-app-adguardhome
	luci-app-openclash
	luci-app-weburl
	luci-app-wol
	luci-theme-material
	luci-theme-opentomato
	axel patch diffutils collectd-mod-ping collectd-mod-thermal wpad-wolfssl
	"

	trv=`awk -F= '/PKG_VERSION:/{print $2}' feeds/packages/net/transmission/Makefile`
	[[ $trv ]] && wget -qO feeds/packages/net/transmission/patches/tr$trv.patch \
	raw.githubusercontent.com/hong0980/diy/master/files/transmission/tr$trv.patch 1>/dev/null 2>&1

	cat <<-\EOF >feeds/packages/lang/python/python3/files/python3-package-uuid.mk
	define Package/python3-uuid
	$(call Package/python3/Default)
	TITLE:=Python $(PYTHON3_VERSION) UUID module
	DEPENDS:=+python3-light +libuuid
	endef

	$(eval $(call Py3BasePackage,python3-uuid, \
	/usr/lib/python$(PYTHON3_VERSION)/uuid.py \
	/usr/lib/python$(PYTHON3_VERSION)/lib-dynload/_uuid.$(PYTHON3_SO_SUFFIX) \
	))
	EOF

case $TARGET_DEVICE in
"newifi-d2")
	FIRMWARE_TYPE="sysupgrade"
	_packages "luci-app-easymesh"
	_delpackage "ikoolproxy openclash transmission softwarecenter aria2 vssr adguardhome"
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
	;;
"phicomm_k2p")
	FIRMWARE_TYPE="sysupgrade"
	_packages "luci-app-easymesh"
	_delpackage "samba4 luci-app-usb-printer luci-app-cifs-mount diskman cupsd autosamba automount"
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
	;;
"r1-plus-lts"|"r4s"|"r2c"|"r2s")
	FIRMWARE_TYPE="sysupgrade"
	_packages "
	luci-app-cpufreq
	luci-app-adbyby-plus
	luci-app-dockerman
	luci-app-qbittorrent
	luci-app-turboacc
	luci-app-passwall2
	#luci-app-easymesh
	luci-app-store
	#luci-app-unblockneteasemusic
	#luci-app-amule
	#luci-app-smartdns
	#luci-app-aliyundrive-fuse
	#luci-app-aliyundrive-webdav
	luci-app-deluge
	luci-app-netdata
	htop lscpu lsscsi lsusb #nano pciutils screen zstd pv
	#AmuleWebUI-Reloaded #subversion-client unixodbc #git-http
	"
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
	wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
	wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
	# sed -i '/KERNEL_PATCHVER/s/=.*/=5.4/' target/linux/rockchip/Makefile
	clone_url "
	#https://github.com/immortalwrt/immortalwrt/branches/openwrt-18.06-k5.4/target/linux/rockchip
	https://github.com/immortalwrt/immortalwrt/branches/openwrt-18.06-k5.4/package/boot/uboot-rockchip
	https://github.com/immortalwrt/immortalwrt/branches/openwrt-18.06-k5.4/package/boot/arm-trusted-firmware-rockchip-vendor
	"
	sed -i "/interfaces_lan_wan/s/'eth1' 'eth0'/'eth0' 'eth1'/" target/linux/rockchip/*/*/*/*/02_network
	# git_apply "raw.githubusercontent.com/hong0980/diy/master/files/r1-plus-lts-patches/0001-Add-pwm-fan.sh.patch"
	;;
"asus_rt-n16")
	FIRMWARE_TYPE="n16"
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.130"/' $config_generate
	;;
"x86_64")
	FIRMWARE_TYPE="squashfs-combined"
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.150"/' $config_generate
	#[[ $SOURCE_NAME =~ "coolsnowwolf" ]] && sed -i 's/5.15/5.4/g' target/linux/x86/Makefile
	[[ $VERSION = plus ]] && _packages "
	luci-app-adbyby-plus
	#luci-app-amule
	luci-app-deluge
	luci-app-passwall2
	luci-app-dockerman
	luci-app-netdata
	#luci-app-kodexplorer
	luci-app-poweroff
	luci-app-qbittorrent
	luci-app-smartdns
	#luci-app-unblockmusic
	#luci-app-aliyundrive-fuse
	#luci-app-aliyundrive-webdav
	#AmuleWebUI-Reloaded ariang bash htop lscpu lsscsi lsusb nano pciutils screen webui-aria2 zstd tar pv
	subversion-client #unixodbc git-http

	#USB3.0支持
	kmod-usb-audio kmod-usb-printer
	kmod-usb2 kmod-usb2-pci kmod-usb3

	#nfs
	kmod-fs-nfsd kmod-fs-nfs kmod-fs-nfs-v4

	#3G/4G_Support
	kmod-mii kmod-usb-acm kmod-usb-serial
	kmod-usb-serial-option kmod-usb-serial-wwan

	#Sound_Support
	kmod-sound-core kmod-sound-hda-codec-hdmi
	kmod-sound-hda-codec-realtek
	kmod-sound-hda-codec-via
	kmod-sound-hda-core kmod-sound-hda-intel

	#docker
	kmod-br-netfilter kmod-dm kmod-dummy kmod-fs-btrfs
	kmod-ikconfig kmod-nf-conntrack-netlink kmod-nf-ipvs kmod-veth

	#x86
	acpid alsa-utils ath10k-firmware-qca9888 blkid
	ath10k-firmware-qca988x ath10k-firmware-qca9984
	brcmfmac-firmware-43602a1-pcie irqbalance
	kmod-8139cp kmod-8139too kmod-alx kmod-ath10k
	kmod-bonding kmod-drm-ttm kmod-fs-ntfs kmod-i40e
	kmod-i40evf kmod-igbvf kmod-iwlwifi kmod-ixgbe
	kmod-ixgbevf kmod-mlx4-core kmod-mlx5-core
	kmod-mmc-spi kmod-pcnet32 kmod-r8125 kmod-r8168
	kmod-rt2800-usb kmod-rtl8xxxu kmod-sdhci
	kmod-sound-i8x0 kmod-sound-via82xx kmod-tg3
	kmod-tulip kmod-usb-hid kmod-vmxnet3 lm-sensors-detect
	qemu-ga smartmontools snmpd
	"
	sed -i '/easymesh/d' .config
	rm -rf package/lean/rblibtorrent
	#sed -i '/KERNEL_PATCHVER/s/=.*/=6.1/' target/linux/x86/Makefile
	wget -qO package/lean/autocore/files/x86/index.htm \
	https://raw.githubusercontent.com/immortalwrt/luci/openwrt-18.06-k5.4/modules/luci-mod-admin-full/luasrc/view/admin_status/index.htm
	wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
	wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
	;;
"armvirt_64_Default")
	FIRMWARE_TYPE="armvirt-64-default"
	sed -i '/easymesh/d' .config
	[[ -n $IP ]] && \
	sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
	sed -i '/n) ipad/s/".*"/"192.168.2.110"/' $config_generate
	# clone_url "https://github.com/tuanqing/install-program" && rm -rf package/A/install-program/tools
	_packages "attr bash blkid brcmfmac-firmware-43430-sdio brcmfmac-firmware-43455-sdio
	btrfs-progs cfdisk chattr curl dosfstools e2fsprogs f2fs-tools f2fsck fdisk getopt
	hostpad-common htop install-program iperf3 kmod-brcmfmac kmod-brcmutil kmod-cfg80211
	kmod-fs-exfat kmod-fs-ext4 kmod-fs-vfat kmod-mac80211 kmod-rt2800-usb kmod-usb-net
	kmod-usb-net-asix-ax88179 kmod-usb-net-rtl8150 kmod-usb-net-rtl8152 kmod-usb-storage
	kmod-usb-storage-extras kmod-usb-storage-uas kmod-usb2 kmod-usb3 lm-sensors losetup
	lsattr lsblk lscpu lsscsi luci-app-adguardhome luci-app-cpufreq luci-app-dockerman
	luci-app-qbittorrent mkf2fs ntfs-3g parted pv python3 resize2fs tune2fs unzip
	uuidgen wpa-cli wpad wpad-basic xfs-fsck xfs-mkf"

	# wget -qO feeds/luci/applications/luci-app-qbittorrent/Makefile https://raw.githubusercontent.com/immortalwrt/luci/openwrt-18.06/applications/luci-app-qbittorrent/Makefile
	# sed -i 's/-Enhanced-Edition//' feeds/luci/applications/luci-app-qbittorrent/Makefile
	sed -i 's/@arm/@TARGET_armvirt_64/g' $(find . -type d -name "luci-app-cpufreq" 2>/dev/null)/Makefile
	sed -i "s/default 160/default $PARTSIZE/" config/Config-images.in
	sed -e 's/services/system/; s/00//' $(find . -type d -name "luci-app-cpufreq" 2>/dev/null)/luasrc/controller/cpufreq.lua -i
	[ -d ../opt/openwrt_packit ] && {
		sed -i '{
		s|mv |mv -v |
		s|openwrt-armvirt-64-default-rootfs.tar.gz|$(ls *default-rootfs.tar.gz)|
		s|TGT_IMG=.*|TGT_IMG="${WORK_DIR}/unifreq-openwrt-${SOC}_${BOARD}_k${KERNEL_VERSION}${SUBVER}-$(date "+%Y-%m%d-%H%M").img"|
		}' ../opt/openwrt_packit/mk*.sh
		sed -i '/ KERNEL_VERSION.*flippy/ {s/KERNEL_VERSION.*/KERNEL_VERSION="5.15.4-flippy-67+"/}' ../opt/openwrt_packit/make.env
	}
	;;
esac
sed -i 's|\.\./\.\./luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' package/A/*/Makefile 2>/dev/null

for p in $(find package/A/ feeds/luci/applications/ -type d -name "po" 2>/dev/null); do
	if [[ "${REPO_BRANCH#*-}" == "21.02" ]]; then
		if [[ ! -d $p/zh_Hans && -d $p/zh-cn ]]; then
			ln -s zh-cn $p/zh_Hans 2>/dev/null
		fi
	else
		if [[ ! -d $p/zh-cn && -d $p/zh_Hans ]]; then
			ln -s zh_Hans $p/zh-cn 2>/dev/null
		fi
	fi
done

[[ -z "$VERSION" ]] && {
	echo "FETCH_CACHE=true" >>$GITHUB_ENV
	sed -i 's/luci-app-*//g' .config
	sed -i 's/luci-app-[^ ]* //g' {include/target.mk,$(find target/ -name Makefile)}
}

clone_url "https://github.com/immortalwrt/packages/branches/openwrt-23.05/lang/rust"
sed -i 's|\.\./\.\./luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' package/A/*/Makefile 2>/dev/null
sed -i 's|\.\./\.\./lang/golang|$(TOPDIR)/feeds/packages/lang/golang|' package/A/*/Makefile 2>/dev/null
sed -i '/bridge/d' .config
echo -e "$(color cy '更新配置....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status

LINUX_VERSION=$(grep 'CONFIG_LINUX.*=y' .config | sed -r 's/CONFIG_LINUX_(.*)=y/\1/' | tr '_' '.')
echo -e "$(color cy 当前机型) $(color cb $SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-$DEVICE_NAME-$VERSION)"
sed -i "/IMG_PREFIX:/ {s/=/=$SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-\$(shell TZ=UTC-8 date +%m%d-%H%M)-/}" include/image.mk
# sed -i -E 's/# (CONFIG_.*_COMPRESS_UPX) is not set/\1=y/' .config && make defconfig 1>/dev/null 2>&1
echo "CLEAN=false" >>$GITHUB_ENV
echo "UPLOAD_BIN_DIR=false" >>$GITHUB_ENV
# echo "UPLOAD_PACKAGES=false" >>$GITHUB_ENV
# echo "UPLOAD_FIRMWARE=false" >>$GITHUB_ENV
echo "UPLOAD_WETRANSFER=false" >>$GITHUB_ENV
# echo "UPLOAD_SYSUPGRADE=false" >>$GITHUB_ENV
echo "UPLOAD_COWTRANSFER=false" >>$GITHUB_ENV
[[ $REPO_BRANCH =~ 21 ]] && \
echo "REPO_BRANCH=${REPO_BRANCH#*-}" >>$GITHUB_ENV || \
echo "REPO_BRANCH=18.06" >>$GITHUB_ENV
echo "FIRMWARE_TYPE=$FIRMWARE_TYPE" >>$GITHUB_ENV
echo "VERSION=$VERSION" >>$GITHUB_ENV

echo -e "\e[1;35m脚本运行完成！\e[0m"
