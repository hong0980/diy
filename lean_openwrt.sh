#!/usr/bin/env bash
# git.io/J6IXO git.io/ql_diy git.io/lean_openwrt is.gd/lean_openwrt is.gd/build_environment is.gd/immortalwrt_openwrt
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
# curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | jq -r '.[0].assets[].browser_download_url' | grep 'cache' >xc
# curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | awk -F'"' '/browser_download_url/{print $4}' | grep 'cache' >xa
qBittorrent_version=$(curl -sL api.github.com/repos/hong0980/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K\d+\.\d+\.\d+' | sort -Vr | head -n 1)
curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xa
mkdir firmware output 2>/dev/null

if [[ $cache_Release = 'true' ]]; then
	count=0
	while read -r line && [ $count -lt 4 ]; do
		filename="${line##*/}"
		if ! grep -q "$filename" xc 2>/dev/null && wget -qO "output/$filename" "$line"; then
		    echo "$filename 已经下载完成"
		    count=$((count + 1))
		fi
	done < xa

	if [ "$(ls -A output 2>/dev/null)" ]; then
		echo "UPLOAD_Release=true" >> $GITHUB_ENV
	else
		echo "没有新的cache可以下载！"
	fi
	exit 0
fi

if [[ $CACHE_ACTIONS = 'true' ]]; then
	echo "打包cache"
	REPO_FLODER=${REPO_FLODER:-openwrt}
	hx=`ls $REPO_FLODER/bin/targets/*/*/*toolchain* 2>/dev/null | sed "s/openwrt/$CACHE_NAME/g" 2>/dev/null`
	xx=`ls $REPO_FLODER/bin/targets/*/*/*imagebuil* 2>/dev/null | sed "s/openwrt/$CACHE_NAME/g" 2>/dev/null`
	[[ $hx ]] && (cp -v `find $REPO_FLODER/bin/targets/ -type f -name "*toolchain*"` output/${hx##*/} || true)
	[[ $xx ]] && (cp -v `find $REPO_FLODER/bin/targets/ -type f -name "*imagebuil*"` output/${xx##*/} || true)
	cd "$REPO_FLODER"
	[[ -d ".ccache" ]] && (ccache=".ccache"; ls -alh .ccache)
	# rm -rf dl build_dir tmp .git
	du -h --max-depth=1 ./staging_dir
	du -h --max-depth=1 ./ --exclude=staging_dir
	tar -I zstdmt -cf ../output/$CACHE_NAME-cache.tzst staging_dir/host* staging_dir/tool* $ccache || \
	tar --zstd -cf ../output/$CACHE_NAME-cache.tar.zst staging_dir/host* staging_dir/tool* $ccache
	if [[ $(du -sm "../output" | cut -f1) -ge 150 ]]; then
		ls -lh ../output
		echo "OUTPUT_RELEASE=true" >>$GITHUB_ENV
		sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
	fi
	echo "SAVE_CACHE=" >>$GITHUB_ENV
	exit 0
fi

[[ -n $VERSION ]] || VERSION=plus
[[ -n $PARTSIZE ]] || PARTSIZE=900

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
_pushd() {
	if ! pushd "$@" &> /dev/null; then
		printf '\n%b\n' "该目录不存在。"
	fi
}
_popd() {
	if ! popd &> /dev/null; then
		printf '%b\n' "该目录不存在。"
	fi
}

_printf() {
	awk '{printf "%s %-40s %s %s %s\n" ,$1,$2,$3,$4,$5}'
}

clone_repo() {
    local repo_url branch target_dir source_dir current_dir destination_dir
    if [[ "$1" == */* ]]; then
        repo_url="$1"
        shift
    else
        branch="-b $1"
        repo_url="$2"
        shift 2
    fi

    if ! git clone -q $branch --depth 1 "https://github.com/$repo_url" gitemp; then
        echo -e "$(color cr 拉取) https://github.com/$repo_url [ $(color cr ✕) ]" | _printf
        return 0
    fi

    for target_dir in "$@"; do
        if [ "$target_dir" = 'golang' -a -d "gitemp/lang/golang" ]; then
            mv -f feeds/packages/lang/golang ../
            mv -f gitemp/lang/golang feeds/packages/lang/golang && \
            echo -e "$(color cg 替换) $target_dir [ $(color cg ✔) ]" | _printf
            [ -d gitemp ] && rm -rf gitemp
            continue
        fi
        source_dir=$(find gitemp -maxdepth 5 -type d -name "$target_dir" -print -quit)
        current_dir=$(find package/ feeds/ target/ -maxdepth 5 -type d -name "$target_dir" -print -quit)
        destination_dir="${current_dir:-package/A/$target_dir}"
        if [[ -d $current_dir && $destination_dir != $current_dir ]]; then
            mv -f "$current_dir" ../
        fi

        if [[ -d $source_dir ]]; then
            if mv -f "$source_dir" "$destination_dir"; then
                if [[ $destination_dir = $current_dir ]]; then
                    echo -e "$(color cg 替换) $target_dir [ $(color cg ✔) ]" | _printf
                else
                    echo -e "$(color cb 添加) $target_dir [ $(color cb ✔) ]" | _printf
                fi
            fi
        fi
    done

    [ -d gitemp ] && rm -rf gitemp
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

			git clone -q $x $k && f="1"

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
                    [[ ${w##*/} =~ packages ]] && {
                        _pushd ../${w##*/}
                        git reset -q --hard f76133e
                        _popd
                    }
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

function config(){
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
			cat >.config<<-EOF
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
		"armvirt-64-default")
			cat >.config<<-EOF
			CONFIG_TARGET_armvirt=y
			CONFIG_TARGET_armvirt_64=y
			CONFIG_TARGET_armvirt_64_Default=y
			EOF
			;;
	esac
}

min() {
    echo VERSION="" >>$GITHUB_ENV
	echo "FETCH_CACHE=true" >>$GITHUB_ENV
	sed -i 's/luci-app-[^ ]* //g' {include/target.mk,$(find target/ -name Makefile)}
	echo -e "$(color cy '更新配置....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
	make defconfig 1>/dev/null 2>&1
	status
}

REPO_URL="https://github.com/coolsnowwolf/lede"
echo -e "$(color cy '拉取源码....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
[[ $REPO_BRANCH ]] && cmd="-b $REPO_BRANCH"
git clone -q $cmd $REPO_URL $REPO_FLODER
status
cd $REPO_FLODER || exit

case "$TARGET_DEVICE" in
	"x86_64") export DEVICE_NAME="x86_64";;
	"asus_rt-n16") export DEVICE_NAME="bcm47xx_mips74k";;
	"armvirt-64-default") export DEVICE_NAME="armvirt_64";;
	"newifi-d2"|"phicomm_k2p") export DEVICE_NAME="ramips_mt7621";;
	"r1-plus-lts"|"r1-plus"|"r4s"|"r2c"|"r2s") export DEVICE_NAME="rockchip_armv8";;
esac

SOURCE_NAME=$(basename $(dirname $REPO_URL))
export TOOLS_HASH=`git log --pretty=tformat:"%h" -n1 tools toolchain`
export CACHE_NAME="$SOURCE_NAME-$REPO_BRANCH-$TOOLS_HASH-$DEVICE_NAME"
echo "CACHE_NAME=$CACHE_NAME" >>$GITHUB_ENV

if (grep -q "$CACHE_NAME" ../xa || grep -q "$CACHE_NAME" ../xc); then
	echo -e "$(color cy '下载tz-cache')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
	wget -qc -t=3 $(grep "$CACHE_NAME" ../xa) || wget -qc -t=3 $(grep "$CACHE_NAME" ../xc)
	[ -e *.tzst ]; status
	[ -e *.tzst ] && {
		echo -e "$(color cy '部署tz-cache')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
		(tar -I unzstd -xf *.tzst || tar -xf *.tzst) && {
			if ! grep -q "$CACHE_NAME" ../xc; then
				cp *.tzst ../output
				echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
			fi
			sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
		}
		[ -d staging_dir ]; status
	}
else
	# VERSION=
	echo "CACHE_ACTIONS=true" >>$GITHUB_ENV
fi

echo -e "$(color cy '更新软件....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
./scripts/feeds update -a 1>/dev/null 2>&1
./scripts/feeds install -a 1>/dev/null 2>&1
status

config
# if [ x"$VERSION" = x ]; then
# 	min
# 	exit 0
# fi

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
	if [[ $REPO_URL =~ "coolsnowwolf" ]]; then
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
			https://github.com/jerrykuku/lua-maxminddb
			https://github.com/zzsj0928/luci-app-pushbot
			https://github.com/yaof2/luci-app-ikoolproxy
		"
		clone_repo immortalwrt/luci/ luci-app-eqos
		clone_repo immortalwrt/packages golang
		# rm -rf feeds/packages/lang/golang
		# git clone -q https://github.com/sbwml/packages_lang_golang -b 22.x feeds/packages/lang/golang
		clone_repo vernesong/OpenClash luci-app-openclash
		clone_repo immortalwrt/packages cpulimit btrfs-progs
		clone_repo sirpdboy/luci-app-cupsd luci-app-cupsd cups
		clone_repo xiaorouji/openwrt-passwall luci-app-passwall
		clone_repo xiaorouji/openwrt-passwall2 luci-app-passwall2
		clone_repo destan19/OpenAppFilter luci-app-oaf open-app-filter oaf
		clone_repo kiddin9/openwrt-packages luci-app-adguardhome adguardhome luci-app-bypass lua-neturl
		
		[[ -e package/A/luci-app-unblockneteasemusic/root/etc/init.d/unblockneteasemusic ]] && \
		sed -i '/log_check/s/^/#/' package/A/*/*/*/init.d/unblockneteasemusic
		# packages_url="luci-app-bypass luci-app-filetransfer"
		# for k in $packages_url; do
			# clone_url "https://github.com/kiddin9/openwrt-packages/trunk/$k"
		# done

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
			https://github.com/brvphoenix/wrtbwmon"
			clone_repo liuran001/openwrt-packages luci-theme-argon luci-app-argon-config
			clone_repo firker/luci-app-wrtbwmon-zh luci-app-wrtbwmon-zh
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
	[[ -d $xc ]] && sed -i "s/PKG_VERSION:=.*/PKG_VERSION:=${qBittorrent_version}_v2.0.9/;s/userdocs/hong0980/;s/ARCH)-qbittorrent/ARCH)-qt6-qbittorrent/" $xc/Makefile
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
	#luci-app-adguardhome
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
	# clone_repo 'openwrt-18.06-k5.4' immortalwrt/immortalwrt uboot-rockchip arm-trusted-firmware-rockchip-vendor
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
	#subversion-client #unixodbc #git-http

	"
	sed -i '/easymesh/d' .config
	rm -rf package/lean/rblibtorrent
	#sed -i '/KERNEL_PATCHVER/s/=.*/=6.1/' target/linux/x86/Makefile
	wget -qO package/lean/autocore/files/x86/index.htm \
	https://raw.githubusercontent.com/immortalwrt/luci/openwrt-18.06-k5.4/modules/luci-mod-admin-full/luasrc/view/admin_status/index.htm
	wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
	wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
	;;
"armvirt-64-default")
	FIRMWARE_TYPE="$TARGET_DEVICE"
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

# clone_url "https://github.com/immortalwrt/packages/branches/openwrt-23.05/lang/rust"
clone_repo openwrt-23.05 immortalwrt/packages rust
sed -i 's|\.\./\.\./luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' package/A/*/Makefile 2>/dev/null
sed -i '/bridge/d' .config
echo -e "$(color cy '更新配置....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status

LINUX_VERSION=$(grep 'CONFIG_LINUX.*=y' .config | sed -r 's/CONFIG_LINUX_(.*)=y/\1/' | tr '_' '.')
echo -e "$(color cy 当前机型) $(color cb $SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-${DEVICE_NAME}${VERSION:+-$VERSION})"
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
