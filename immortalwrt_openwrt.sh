#!/usr/bin/env bash
# sudo bash -c 'bash <(curl -s https://build-scripts.immortalwrt.eu.org/init_build_environment.sh)'
qBittorrent_version=$(curl -sL api.github.com/repos/hong0980/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K\d+\.\d+\.\d+' | sort -Vr | head -n 1)
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
curl -sL $GITHUB_API_URL/repos/$GITHUB_REPOSITORY/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xa
curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
[[ $VERSION ]] || VERSION=plus
[[ $PARTSIZE ]] || PARTSIZE=900
mkdir firmware output 2>/dev/null

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
        source_dir=$(find gitemp -maxdepth 5 -type d -name "$target_dir" -print -quit)
        current_dir=$(find package/ feeds/ target/ -maxdepth 5 -type d -name "$target_dir" -print -quit)

        if [[ -d $source_dir ]]; then
            [[ -d $current_dir ]] && mv -f "$current_dir" ../
            destination_dir="${current_dir:-package/A/$target_dir}"
            if mv -f "$source_dir" "${destination_dir%/*}"; then
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
}

config (){
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
			if [[ "${REPO_BRANCH#*-}" = "18.06" ]]; then
				cat >.config<<-EOF
				CONFIG_TARGET_brcm47xx=y
				CONFIG_TARGET_brcm47xx_mips74k=y
				CONFIG_TARGET_brcm47xx_mips74k_DEVICE_asus_rt-n16=y
				EOF
			else
				cat >.config<<-EOF
				CONFIG_TARGET_bcm47xx=y
				CONFIG_TARGET_bcm47xx_mips74k=y
				CONFIG_TARGET_bcm47xx_mips74k_DEVICE_asus_rt-n16=y
				EOF
			fi
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

REPO_URL="https://github.com/immortalwrt/immortalwrt"
echo -e "$(color cy '拉取源码....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
[[ $REPO_BRANCH ]] && cmd="-b $REPO_BRANCH"
git clone -q $cmd $REPO_URL $REPO_FLODER --single-branch # --depth 1
status
[[ -d $REPO_FLODER ]] && cd $REPO_FLODER || exit

case "$TARGET_DEVICE" in
    "x86_64") export NAME="x86_64";;
    "asus_rt-n16") export NAME="bcm47xx_mips74k";;
    "armvirt-64-default") export NAME="armvirt_64";;
    "newifi-d2"|"phicomm_k2p") export NAME="ramips_mt7621";;
    "r1-plus-lts"|"r1-plus"|"r4s"|"r2c"|"r2s") export NAME="rockchip_armv8";;
esac

SOURCE_NAME=$(basename $(dirname $REPO_URL))
export TOOLS_HASH=`git log --pretty=tformat:"%h" -n1 tools toolchain`
export CACHE_NAME="$SOURCE_NAME-${REPO_BRANCH#*-}-$TOOLS_HASH-$NAME"
echo "CACHE_NAME=$CACHE_NAME" >>$GITHUB_ENV

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
#     min
#     exit 0
# fi

cat >>.config <<-EOF
	CONFIG_KERNEL_BUILD_USER="win3gp"
	CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
	CONFIG_PACKAGE_luci-app-ssr-plus=y
	CONFIG_PACKAGE_luci-app-ddnsto=y
	CONFIG_PACKAGE_luci-app-accesscontrol=y
	CONFIG_PACKAGE_luci-app-ikoolproxy=y
	CONFIG_PACKAGE_luci-app-wizard=y
	CONFIG_PACKAGE_luci-app-cowb-speedlimit=y
	CONFIG_PACKAGE_luci-app-diskman=y
	CONFIG_PACKAGE_luci-app-cowbping=y
	CONFIG_PACKAGE_luci-app-bridge=y
	CONFIG_PACKAGE_luci-app-cpulimit=y
	CONFIG_PACKAGE_luci-app-filebrowser=y
	CONFIG_PACKAGE_luci-app-filetransfer=y
	CONFIG_PACKAGE_luci-app-network-settings=y
	CONFIG_PACKAGE_luci-app-oaf=y
	CONFIG_PACKAGE_luci-app-appfilter=y
	CONFIG_PACKAGE_luci-app-passwall=y
	CONFIG_PACKAGE_luci-app-commands=y
	CONFIG_PACKAGE_luci-app-timedtask=y
	CONFIG_PACKAGE_luci-app-ttyd=y
	CONFIG_PACKAGE_luci-app-upnp=y
	CONFIG_PACKAGE_luci-app-opkg=y
	CONFIG_PACKAGE_luci-app-arpbind=y
	CONFIG_PACKAGE_luci-app-vlmcsd=y
	CONFIG_PACKAGE_luci-app-tinynote=y
	CONFIG_PACKAGE_luci-app-wifischedule=y
	CONFIG_PACKAGE_automount=y
	CONFIG_PACKAGE_autosamba=y
	CONFIG_TARGET_IMAGES_GZIP=y
	CONFIG_BRCMFMAC_SDIO=y
	# CONFIG_VMDK_IMAGES is not set
	## CONFIG_GRUB_EFI_IMAGES is not set
	CONFIG_PACKAGE_default-settings-chn=y
	CONFIG_DEFAULT_SETTINGS_OPTIMIZE_FOR_CHINESE=y
	# CONFIG_LUCI_SRCDIET is not set #缩小 Lua 源代码
	## CONFIG_LUCI_JSMIN is not set  #缩小 JavaScript 源代码
	# CONFIG_LUCI_CSSTIDY is not set #缩小 CSS 文件
EOF

config_generate="package/base-files/files/bin/config_generate"
color cy "自定义设置.... "
wget -qO package/base-files/files/etc/banner git.io/JoNK8
sed -i "/DISTRIB_DESCRIPTION/ {s/'$/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)'/}" package/*/*/*/openwrt_release
sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk
sed -i "s/ImmortalWrt/OpenWrt/g" {$config_generate,include/version.mk}
sed -i 's/option enabled.*/option enabled 1/' feeds/packages/*/*/files/upnpd.config
sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
sed -i 's/UTC/UTC-8/' Makefile
sed -i "{
		/commit luci/ i\uci -q set luci.main.mediaurlbase=\"/luci-static/bootstrap\"
		\$i sed -i 's/root::.*:::/root:\$1\$pn1ABFaI\$vt5cmIjlr6M7Z79Eds2lV0:16821:0:99999:7:::/g' /etc/shadow
		}" $(find package/ -type f -name "*default-settings" 2>/dev/null)

# git diff ./ >> ../output/t.patch || true
clone_url "
    https://github.com/hong0980/build
    https://github.com/fw876/helloworld
    https://github.com/xiaorouji/openwrt-passwall-packages
"

grep -q 'nft-tproxy' package/kernel/linux/modules/netfilter.mk || {
	cat <<-\EOF >>package/kernel/linux/modules/netfilter.mk
	define KernelPackage/nft-tproxy
		SUBMENU:=$(NF_MENU)
		TITLE:=Netfilter nf_tables tproxy support
		DEPENDS:=+kmod-nft-core +kmod-nf-tproxy +kmod-nf-conntrack
		FILES:=$(foreach mod,$(NFT_TPROXY-m),$(LINUX_DIR)/net/$(mod).ko)
		AUTOLOAD:=$(call AutoProbe,$(notdir $(NFT_TPROXY-m)))
		KCONFIG:=$(KCONFIG_NFT_TPROXY)
	endef

	$(eval $(call KernelPackage,nft-tproxy))

	define KernelPackage/nf-tproxy
		SUBMENU:=$(NF_MENU)
		TITLE:=Netfilter tproxy support
		KCONFIG:= $(KCONFIG_NF_TPROXY)
		FILES:=$(foreach mod,$(NF_TPROXY-m),$(LINUX_DIR)/net/$(mod).ko)
		AUTOLOAD:=$(call AutoProbe,$(notdir $(NF_TPROXY-m)))
	endef

	$(eval $(call KernelPackage,nf-tproxy))
	EOF
}

clone_repo vernesong/OpenClash luci-app-openclash
clone_repo xiaorouji/openwrt-passwall luci-app-passwall
clone_repo xiaorouji/openwrt-passwall2 luci-app-passwall2
clone_repo coolsnowwolf/packages qtbase qttools qBittorrent qBittorrent-static
clone_repo kiddin9/openwrt-packages luci-app-bypass luci-app-store luci-app-alist luci-lib-taskd luci-lib-xterm taskd alist

[ "$VERSION" = plus -a "$TARGET_DEVICE" != phicomm_k2p -a "$TARGET_DEVICE" != newifi-d2 -a "$TARGET_DEVICE" != asus_rt-n16 ] && {
    _packages "
    attr axel bash blkid bsdtar btrfs-progs cfdisk chattr collectd-mod-ping
    collectd-mod-thermal curl diffutils dosfstools e2fsprogs f2fs-tools f2fsck
    fdisk gawk getopt hostpad-common htop install-program iperf3 lm-sensors
    losetup lsattr lsblk lscpu lsscsi patch
    rtl8188eu-firmware mt7601u-firmware rtl8723au-firmware rtl8723bu-firmware
    rtl8821ae-firmwarekmod-mt76x0u wpad-wolfssl brcmfmac-firmware-43430-sdio
    brcmfmac-firmware-43455-sdio kmod-brcmfmac kmod-brcmutil kmod-cfg80211
    kmod-fs-ext4 kmod-fs-vfat kmod-ipt-nat6 kmod-mac80211 kmod-mt7601u kmod-mt76x2u
    kmod-nf-nat6 kmod-r8125 kmod-rt2500-usb kmod-rt2800-usb kmod-rtl8187 kmod-rtl8188eu
    kmod-rtl8723bs kmod-rtl8812au-ac kmod-rtl8812au-ct kmod-rtl8821ae kmod-rtl8821cu
    kmod-rtl8xxxu kmod-usb-net kmod-usb-net-asix-ax88179 kmod-usb-net-rtl8150
    kmod-usb-net-rtl8152 kmod-usb-ohci kmod-usb-serial-option kmod-usb-storage kmod-usb-uhci
    kmod-usb-storage-extras kmod-usb-storage-uas kmod-usb-wdm kmod-usb2 kmod-usb3
    luci-app-aria2
    luci-app-bypass
    luci-app-cifs-mount
    luci-app-commands
    luci-app-hd-idle
    luci-app-cupsd
    luci-app-openclash
    luci-app-pushbot
    luci-app-softwarecenter
    #luci-app-syncdial
    luci-app-transmission
    luci-app-usb-printer
    luci-app-vssr
    luci-app-wol
    luci-app-bandwidthd
    luci-app-store
    luci-app-alist
    luci-app-weburl
    luci-app-wrtbwmon
    luci-theme-material
    luci-theme-opentomato
    luci-app-pwdHackDeny
    luci-app-control-webrestriction
    luci-app-cowbbonding
    "
    trv=`awk -F= '/PKG_VERSION:/{print $2}' feeds/packages/net/transmission/Makefile`
    [[ $trv ]] && wget -qO feeds/packages/net/transmission/patches/tr$trv.patch \
    raw.githubusercontent.com/hong0980/diy/master/files/transmission/tr$trv.patch

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

    clone_url "
        https://github.com/destan19/OpenAppFilter
        https://github.com/messense/aliyundrive-webdav
        https://github.com/jerrykuku/lua-maxminddb
        https://github.com/sirpdboy/luci-app-cupsd
        https://github.com/yaof2/luci-app-ikoolproxy
        https://github.com/zzsj0928/luci-app-pushbot
        https://github.com/kuoruan/luci-app-frpc
        https://github.com/AlexZhuo/luci-app-bandwidthd
    "

    rm -rf feeds/*/*/{luci-app-appfilter,open-app-filter}

    [[ -e feeds/luci/applications/luci-app-unblockneteasemusic/root/etc/init.d/unblockneteasemusic ]] && \
    sed -i '/log_check/s/^/#/' feeds/luci/applications/luci-app-unblockneteasemusic/root/etc/init.d/unblockneteasemusic
    # https://github.com/immortalwrt/luci/branches/openwrt-21.02/applications/luci-app-ttyd ## 分支
    # echo -e 'pthome.net\nchdbits.co\nhdsky.me\nourbits.club' | \
    # tee -a $(find package/A/luci-* feeds/luci/applications/luci-* -type f -name "white.list" -o -name "direct_host" 2>/dev/null | grep "ss") >/dev/null
    echo -e '\nwww.nicept.net' | \
    tee -a $(find package/A/luci-* feeds/luci/applications/luci-* -type f -name "black.list" -o -name "proxy_host" 2>/dev/null | grep "ss") >/dev/null
    
    mwan3=feeds/packages/net/mwan3/files/etc/config/mwan3
    [[ -f $mwan3 ]] && grep -q "8.8" $mwan3 && \
    sed -i '/8.8/d' $mwan3

    [[ -f package/A/qBittorrent/Makefile ]] && grep -q "rblibtorrent" package/A/qBittorrent/Makefile && \
    sed -i 's/+rblibtorrent/+libtorrent-rasterbar/' package/A/qBittorrent/Makefile
    # if wget -qO feeds/luci/modules/luci-mod-admin-full/luasrc/view/myip.htm \
    # raw.githubusercontent.com/hong0980/diy/master/myip.htm; then
        # [[ -e "$(find package/A/ feeds/luci/ -type d -name "luci-app-vssr" 2>/dev/null)/luasrc/model/cbi/vssr/client.lua" ]] && {
            # sed -i '/vssr\/status_top/am:section(SimpleSection).template  = "myip"' \
            # $(find package/A/ feeds/luci/ -type d -name "luci-app-vssr" 2>/dev/null)/luasrc/model/cbi/vssr/client.lua
        # }
        # [[ -e "$(find package/A/ feeds/luci/ -type d -name "luci-app-ssr-plus" 2>/dev/null)/luasrc/model/cbi/shadowsocksr/client.lua" ]] && {
            # sed -i '/shadowsocksr\/status/am:section(SimpleSection).template  = "myip"' \
            # $(find package/A/ feeds/luci/ -type d -name "luci-app-ssr-plus" 2>/dev/null)/luasrc/model/cbi/shadowsocksr/client.lua
        # }
        # [[ -e "$(find package/A/ feeds/luci/ -type d -name "luci-app-bypass" 2>/dev/null)/luasrc/model/cbi/bypass/base.lua" ]] && {
            # sed -i '/bypass\/status"/am:section(SimpleSection).template  = "myip"' \
            # $(find package/A/ feeds/luci/ -type d -name "luci-app-bypass" 2>/dev/null)/luasrc/model/cbi/bypass/base.lua
        # }
        # [[ -e "$(find package/A/ feeds/luci/ -type d -name "luci-app-passwall" 2>/dev/null)/luasrc/model/cbi/passwall/client/global.lua" ]] && {
            # sed -i '/global\/status/am:section(SimpleSection).template  = "myip"' \
            # $(find package/A/ feeds/luci/ -type d -name "luci-app-passwall" 2>/dev/null)/luasrc/model/cbi/passwall/client/global.lua
        # }
    # fi

    [[ "$REPO_BRANCH" =~ 2.*0 ]] && {
        sed -i 's/^ping/-- ping/g' package/*/*/*/*/*/bridge.lua
        # sed -i 's/services/nas/' feeds/luci/*/*/*/*/*/*/menu.d/*transmission.json
        # clone_url "
        # https://github.com/x-wrt/com.x-wrt/trunk/luci-app-simplenetwork
        # https://github.com/brvphoenix/wrtbwmon/trunk/wrtbwmon
        # https://github.com/brvphoenix/luci-app-wrtbwmon/trunk/luci-app-wrtbwmon
        # "
    } || {
        _packages "luci-app-argon-config"
        # clone_url "
        # https://github.com/liuran001/openwrt-packages/trunk/luci-theme-argon
        # https://github.com/liuran001/openwrt-packages/trunk/luci-app-argon-config
        # https://github.com/brvphoenix/wrtbwmon
        # https://github.com/firker/luci-app-wrtbwmon-zh/trunk/luci-app-wrtbwmon-zh"
        sed -i "s/argonv3/argon/" feeds/luci/applications/luci-app-argon-config/Makefile
        sed -i 's/option enabled.*/option enabled 1/' feeds/*/*/*/*/upnpd.config
        sed -i 's/option dports.*/option enabled 2/' feeds/*/*/*/*/upnpd.config
        for d in $(find feeds/ package/ -type f -name "index.htm" 2>/dev/null); do
            if grep -q "Kernel Version" $d; then
                echo $d
                sed -i 's|os.date(.*|os.date("%F %X") .. " " .. translate(os.date("%A")),|' $d
                sed -i '/<%+footer%>/i<%-\n\tlocal incdir = util.libpath() .. "/view/admin_status/index/"\n\tif fs.access(incdir) then\n\t\tlocal inc\n\t\tfor inc in fs.dir(incdir) do\n\t\t\tif inc:match("%.htm$") then\n\t\t\t\tinclude("admin_status/index/" .. inc:gsub("%.htm$", ""))\n\t\t\tend\n\t\tend\n\t\end\n-%>\n' $d
                # sed -i '/<%+footer%>/i<fieldset class="cbi-section">\n\t<legend><%:天气%></legend>\n\t<table width="100%" cellspacing="10">\n\t\t<tr><td width="10%"><%:本地天气%></td><td > <iframe width="900" height="120" frameborder="0" scrolling="no" hspace="0" src="//i.tianqi.com/?c=code&a=getcode&id=22&py=xiaoshan&icon=1"></iframe>\n\t\t<tr><td width="10%"><%:柯桥天气%></td><td > <iframe width="900" height="120" frameborder="0" scrolling="no" hspace="0" src="//i.tianqi.com/?c=code&a=getcode&id=22&py=keqiaoqv&icon=1"></iframe>\n\t\t<tr><td width="10%"><%:指数%></td><td > <iframe width="400" height="270" frameborder="0" scrolling="no" hspace="0" src="https://i.tianqi.com/?c=code&a=getcode&id=27&py=xiaoshan&icon=1"></iframe><iframe width="400" height="270" frameborder="0" scrolling="no" hspace="0" src="https://i.tianqi.com/?c=code&a=getcode&id=27&py=keqiaoqv&icon=1"></iframe>\n\t</table>\n</fieldset>\n' $d
            fi
        done
    }
    # xa=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-vssr" 2>/dev/null)
    # [[ -d $xa ]] && sed -i "/dports/s/1/2/;/ip_data_url/s|'.*'|'https://ispip.clang.cn/all_cn.txt'|" $xa/root/etc/config/vssr
    xb=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-bypass" 2>/dev/null)
    [[ -d $xb ]] && sed -i 's/default y/default n/g' $xb/Makefile
    #https://github.com/userdocs/qbittorrent-nox-static/releases
    xc=$(find package/A/ feeds/ -type d -name "qBittorrent-static" 2>/dev/null)
    [[ -d $xc ]] && sed -i "s/PKG_VERSION:=.*/PKG_VERSION:=${qBittorrent_version}_v2.0.10/;s/userdocs/hong0980/;s/ARCH)-qbittorrent/ARCH)-qt6-qbittorrent/" $xc/Makefile
    xd=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-turboacc" 2>/dev/null)
    [[ -d $xd ]] && sed -i '/hw_flow/s/1/0/;/sfe_flow/s/1/0/;/sfe_bridge/s/1/0/' $xd/root/etc/config/turboacc
    xe=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-ikoolproxy" 2>/dev/null)
    [[ -d $xe ]] && sed -i '/echo.*root/ s/^/[[ $time =~ [0-9]+ ]] \&\&/' $xe/root/etc/init.d/koolproxy
    xg=$(find package/A/ feeds/luci/applications/ -type d -name "luci-app-pushbot" 2>/dev/null)
    [[ -d $xg ]] && {
        sed -i "s|-c pushbot|/usr/bin/pushbot/pushbot|" $xg/luasrc/controller/pushbot.lua
        sed -i '/start()/a[ "$(uci get pushbot.@pushbot[0].pushbot_enable)" -eq "0" ] && return 0' $xg/root/etc/init.d/pushbot
    }
}

# clone_url "https://github.com/immortalwrt/packages/branches/openwrt-21.02/libs/libtorrent-rasterbar" && {
    # rm -rf package/A/{luci-app-deluge,deluge}
    # sed -i 's/+rblibtorrent/+libtorrent-rasterbar/' package/A/qBittorrent/Makefile
    # sed -i 's/qBittorrent-static/qBittorrent-Enhanced-Edition/g' package/feeds/luci/luci-app-qbittorrent/Makefile
# }

# clone_url "https://github.com/coolsnowwolf/packages/trunk/libs/libtorrent-rasterbar" && {
    # rm -rf package/A/{luci-app-deluge,deluge}
    # sed -i 's/qBittorrent-static/qbittorrent/g' package/feeds/luci/luci-app-qbittorrent/Makefile
    # sed -i 's/+libtorrent-rasterbar/+rblibtorrent/' feeds/packages/net/qBittorrent-Enhanced-Edition/Makefile
# }

case "$TARGET_DEVICE" in
"r4s"|"r2c"|"r2s"|"r1-plus-lts"|"r1-plus")
    DEVICE_NAME="$TARGET_DEVICE"
    FIRMWARE_TYPE="sysupgrade"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
    [[ $VERSION = plus ]] && {
        _packages "
        luci-app-dockerman
        luci-app-turboacc
        luci-app-uhttpd
        luci-app-qbittorrent
        luci-app-passwall2
        luci-app-netdata
        luci-app-cpufreq
        #luci-app-adguardhome
        #luci-app-amule
        luci-app-deluge
        #luci-app-smartdns
        #luci-app-adbyby-plus
        #luci-app-unblockneteasemusic
        #htop lscpu lsscsi #nano screen #zstd pv ethtool
        "
        [[ "${REPO_BRANCH#*-}" =~ ^2 ]] && sed -i '/bridge/d' .config
        wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
        wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
    } || {
        _packages "kmod-rt2800-usb kmod-rtl8187 kmod-rtl8812au-ac kmod-rtl8812au-ct kmod-rtl8821ae
        kmod-rtl8821cu ethtool kmod-usb-wdm kmod-usb2 kmod-usb-ohci kmod-usb-uhci kmod-r8125 kmod-mt76x2u
        kmod-mt76x0u kmod-gpu-lima wpad-wolfssl iwinfo iw collectd-mod-ping collectd-mod-thermal
        luci-app-cpufreq luci-app-uhttpd luci-app-pushbot luci-app-wrtbwmon luci-app-vssr"
        echo -e "CONFIG_DRIVER_11AC_SUPPORT=y\nCONFIG_DRIVER_11N_SUPPORT=y\nCONFIG_DRIVER_11W_SUPPORT=y" >>.config
    }
    [[ $TARGET_DEVICE =~ r1-plus-lts ]] && sed -i "/lan_wan/s/'.*' '.*'/'eth0' 'eth1'/" target/*/rockchip/*/*/*/*/02_network
    ;;
"newifi-d2")
    DEVICE_NAME="Newifi-D2"
    FIRMWARE_TYPE="sysupgrade"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
    ;;
"phicomm_k2p")
    DEVICE_NAME="Phicomm-K2P"
    _packages "luci-app-wifischedule"
    FIRMWARE_TYPE="sysupgrade"
    sed -i '/diskman/d;/autom/d;/ikoolproxy/d;/autos/d' .config
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.1.1"/' $config_generate
    ;;
"asus_rt-n16")
    DEVICE_NAME="Asus-RT-N16"
    FIRMWARE_TYPE="n16"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.130"/' $config_generate
    ;;
"x86_64")
    DEVICE_NAME="x86_64"
    FIRMWARE_TYPE="squashfs-combined"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.150"/' $config_generate
    [[ $VERSION = plus ]] && {
        _packages "
        luci-app-adbyby-plus
        #luci-app-adguardhome
        luci-app-passwall2
        #luci-app-amule
        luci-app-dockerman
        luci-app-netdata
        #luci-app-kodexplorer
        luci-app-poweroff
        luci-app-qbittorrent
        #luci-app-smartdns
        #luci-app-unblockneteasemusic
        luci-app-ikoolproxy
        luci-app-deluge
        #luci-app-godproxy
        #luci-app-frpc
        #luci-app-aliyundrive-webdav
        #AmuleWebUI-Reloaded htop lscpu lsscsi lsusb nano pciutils screen webui-aria2 zstd tar pv
        subversion-client #unixodbc #git-http
        #USB3.0支持
        kmod-usb2 kmod-usb2-pci kmod-usb3
        kmod-fs-nfsd kmod-fs-nfs kmod-fs-nfs-v4
        #3G/4G_Support
        kmod-usb-acm kmod-usb-serial kmod-usb-ohci-pci kmod-sound-core
        #USB_net_driver
        kmod-mt76 kmod-mt76x2u kmod-rtl8821cu kmod-rtl8192cu kmod-rtl8812au-ac
        kmod-usb-net-asix-ax88179 kmod-usb-net-cdc-ether kmod-usb-net-rndis
        usb-modeswitch kmod-usb-net-rtl8152-vendor
        #docker
        kmod-dm kmod-dummy kmod-ikconfig kmod-veth
        kmod-nf-conntrack-netlink kmod-nf-ipvs
        #x86
        acpid alsa-utils ath10k-firmware-qca9888
        ath10k-firmware-qca988x ath10k-firmware-qca9984
        brcmfmac-firmware-43602a1-pcie irqbalance
        kmod-alx kmod-ath10k kmod-bonding kmod-drm-ttm
        kmod-fs-ntfs kmod-igbvf kmod-iwlwifi kmod-ixgbevf
        kmod-mmc-spi kmod-rtl8xxxu kmod-sdhci
        kmod-tg3 lm-sensors-detect qemu-ga snmpd
        "
        # [[ $REPO_BRANCH = "openwrt-18.06-k5.4" ]] && sed -i '/KERNEL_PATCHVER/s/=.*/=5.10/' target/linux/x86/Makefile
        wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
        wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
        [[ $REPO_BRANCH == master ]] && rm -rf package/kernel/rt*
    }
    ;;
"armvirt-64-default")
    DEVICE_NAME="$TARGET_DEVICE"
    FIRMWARE_TYPE="$TARGET_DEVICE"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.110"/' $config_generate
    # clone_url "https://github.com/ophub/luci-app-amlogic/trunk/luci-app-amlogic"
    [[ $VERSION = plus ]] && {
        _packages "attr bash blkid brcmfmac-firmware-43430-sdio brcmfmac-firmware-43455-sdio
        bsdtar btrfs-progs cfdisk chattr curl dosfstools e2fsprogs f2fs-tools f2fsck fdisk
        gawk getopt hostpad-common htop install-program iperf3 kmod-brcmfmac kmod-brcmutil
        kmod-cfg80211 kmod-fs-ext4 kmod-fs-vfat kmod-mac80211 kmod-rt2800-usb kmod-usb-net
        kmod-usb-net-asix-ax88179 kmod-usb-net-rtl8150 kmod-usb-net-rtl8152 kmod-usb-storage
        kmod-usb-storage-extras kmod-usb-storage-uas kmod-usb2 kmod-usb3 lm-sensors losetup
        lsattr lsblk lscpu lsscsi #luci-app-adguardhome luci-app-amlogic luci-app-cpufreq
        luci-app-dockerman luci-app-ikoolproxy luci-app-qbittorrent mkf2fs ntfs-3g parted
        perl perl-http-date perlbase-getopt perlbase-time perlbase-unicode perlbase-utf8
        pigz pv python3 resize2fs tune2fs unzip uuidgen wpa-cli wpad wpad-basic xfs-fsck
        xfs-mkfs"
        echo "CONFIG_PERL_NOCOMMENT=y" >>.config
        sed -i -E '/easymesh/d' .config
        sed -i "s/default 160/default $PARTSIZE/" config/Config-images.in
        sed -i 's/@arm/@TARGET_armvirt_64/g' $(find package/A/ feeds/ -type d -name "luci-app-cpufreq" 2>/dev/null)/Makefile
    }
    ;;
esac

[[ "$REPO_BRANCH" =~ 21.02 ]] && {
	[[ $TARGET_DEVICE =~ ^r\d+.* ]] && \
    wget -qO include/kernel-5.4 https://raw.githubusercontent.com/coolsnowwolf/lede/master/include/kernel-5.4
    clone_repo sbwml/openwrt_helloworld shadowsocks-rust chinadns-ng
    # sed -i 's/ +libopenssl-legacy//' feeds/packages/net/shadowsocks.*/Makefile
}

rm -rf feeds/packages/lang/golang && \
git clone -q https://github.com/sbwml/packages_lang_golang -b 22.x feeds/packages/lang/golang

sed -i 's|\.\./\.\./luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' package/A/*/Makefile 2>/dev/null

for p in $(find package/A/ feeds/luci/applications/ -type d -name "po" 2>/dev/null); do
    if [[ "$REPO_BRANCH" =~ openwrt-2 || "$REPO_BRANCH" =~ master ]]; then
        if [[ ! -d $p/zh_Hans && -d $p/zh-cn ]]; then
            ln -s zh-cn $p/zh_Hans 2>/dev/null
            # printf "%-13s %-33s %s %s %s\n" \
            # $(echo -e "添加zh_Hans $(awk -F/ '{print $(NF-1)}' <<< $p) [ $(color cg ✔) ]")
        fi
    else
        if [[ ! -d $p/zh-cn && -d $p/zh_Hans ]]; then
            ln -s zh_Hans $p/zh-cn 2>/dev/null
            # printf "%-13s %-33s %s %s %s\n" \
            # `echo -e "添加zh-cn $(awk -F/ '{print $(NF-1)}' <<< $p) [ $(color cg ✔) ]"`
        fi
    fi
done
[[ "$REPO_BRANCH" =~ master ]] && sed -i '/deluge/d' .config
sed -i '/bridge/d' .config
echo -e "$(color cy '更新配置....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status

LINUX_VERSION=$(grep 'CONFIG_LINUX.*=y' .config | sed -r 's/CONFIG_LINUX_(.*)=y/\1/' | tr '_' '.')
echo -e "$(color cy 当前机型) $(color cb $SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-${DEVICE_NAME}${VERSION:+-$VERSION})"
sed -i "/IMG_PREFIX:/ {s/=/=$SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-\$(shell TZ=UTC-8 date +%m%d-%H%M)-/}" include/image.mk
# sed -i -E 's/# (CONFIG_.*_COMPRESS_UPX) is not set/\1=y/' .config && make defconfig 1>/dev/null 2>&1

# echo "SSH_ACTIONS=true" >>$GITHUB_ENV #SSH后台
# echo "UPLOAD_PACKAGES=false" >>$GITHUB_ENV
# echo "UPLOAD_SYSUPGRADE=false" >>$GITHUB_ENV
echo "UPLOAD_BIN_DIR=false" >>$GITHUB_ENV
# echo "UPLOAD_FIRMWARE=false" >>$GITHUB_ENV
echo "UPLOAD_COWTRANSFER=false" >>$GITHUB_ENV
echo "UPLOAD_WETRANSFER=false" >>$GITHUB_ENV
echo "CLEAN=false" >>$GITHUB_ENV
echo "FIRMWARE_TYPE=$FIRMWARE_TYPE" >>$GITHUB_ENV
echo "VERSION=$VERSION" >>$GITHUB_ENV

echo -e "\e[1;35m脚本运行完成！\e[0m"
