#!/usr/bin/env bash
# git.io/J6IXO git.io/ql_diy git.io/lean_openwrt is.gd/lean_openwrt is.gd/build_environment is.gd/immortalwrt_openwrt
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
# curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | jq -r '.[0].assets[].browser_download_url' | grep 'cache' >xc
# curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | awk -F'"' '/browser_download_url/{print $4}' | grep 'cache' >xa
qBittorrent_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K\d+\.\d+\.\d+' | sort -Vr | head -n 1 || "")
libtorrent_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\d+\.\d+\.\d+_v\K\d+\.\d+\.\d+' | sort -Vr | head -n 1 || "")
curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
curl -sL api.github.com/repos/hong0980/Actions-OpenWrt/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xa
mkdir firmware output &>/dev/null

if [[ $cache_Release = 'true' ]]; then
    count=0
    while read -r line && [ $count -lt 4 ]; do
        filename="${line##*/}"
        if ! grep -q "$filename" xc &>/dev/null && wget -qO "output/$filename" "$line"; then
            echo "$filename 已经下载完成"
            ((count++))
        fi
    done < xa

    if [ -n "$(ls -A output 2>/dev/null)" ]; then
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

color() {
    case $1 in
        cy) echo -e "\033[1;33m$2\033[0m" ;;
        cr) echo -e "\033[1;31m$2\033[0m" ;;
        cg) echo -e "\033[1;32m$2\033[0m" ;;
        cb) echo -e "\033[1;34m$2\033[0m" ;;
    esac
}

status() {
    local CHECK=$?
    END_TIME=$(date '+%H:%M:%S')
    _date=" ==>用时 $[$(date +%s -d "$END_TIME") - $(date +%s -d "$BEGIN_TIME")] 秒"
    [[ $_date =~ [0-9]+ ]] || _date=""
    if [[ $CHECK -eq 0 ]]; then
        printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cg ✔)\e[1;39m ]${_date}"`
    else
        printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cr ✕)\e[1;39m ]${_date}"`
    fi
}

_find() {
    find $1 -maxdepth 5 -type d -name "$2" -print -quit 2>/dev/null
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
        [[ $z =~ ^# ]] || echo "# CONFIG_PACKAGE_$z is not set" >> .config
        # [[ $z =~ ^# ]] || sed -iE "s/(CONFIG_PACKAGE_.*$z)=y/# \1 is not set/" .config
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
    IFS=' ' read -r param1 param2 param3 param4 param5 <<< "$1"
    printf "%s %-40s %s %s %s\n" "$param1" "$param2" "$param3" "$param4" "$param5"
}

lan_ip() {
    sed -i "/192.168.1.1/${IP:-$1}/" package/base-files/*/bin/config_generate
}

clone_dir() {
    mkdir -p  "package/A"
    [[ -z $2 ]] && return
    local repo_url branch temp_dir=$(mktemp -d)
    if [[ "$1" == */* ]]; then
        repo_url="$1"
        shift
    else
        branch="-b $1 --single-branch"
        repo_url="$2"
        shift 2
    fi

    git clone -q $branch --depth 1 "https://github.com/$repo_url" $temp_dir 2>/dev/null || {
        _printf "$(color cr 拉取) https://github.com/$repo_url [ $(color cr ✕) ]"
        return 0
    }

    for target_dir in "$@"; do
        local source_dir current_dir destination_dir
        if [[ ${repo_url##*/} == ${target_dir} ]]; then
            mv -f ${temp_dir} ${target_dir}
            source_dir=${target_dir}
        else
            source_dir=$(_find "$temp_dir" "$target_dir")
        fi
        [[ -d "$source_dir" ]] || continue
        current_dir=$(_find "package/ feeds/ target/" "$target_dir")
        destination_dir="${current_dir:-package/A/$target_dir}"

        [[ -d "$current_dir" ]] && rm -rf "../$(basename "$current_dir")" && mv -f "$current_dir" ../
        if mv -f "$source_dir" "${destination_dir%/*}"; then
            if [[ -d "$current_dir" ]]; then
                _printf "$(color cg 替换) $target_dir [ $(color cg ✔) ]"
            else
                _printf "$(color cb 添加) $target_dir [ $(color cb ✔) ]"
            fi
        fi
    done
    rm -rf "$temp_dir"
}

clone_url() {
    mkdir -p "package/A"
    # set -x
    for x in $@; do
        name="${x##*/}"
        if [[ "$(grep "^https" <<<$x | egrep -v "helloworld$|build$|openwrt-passwall-packages$")" ]]; then
            g=$(_find "package/ target/ feeds/" "$name" | grep "/${name}$" | head -n 1)
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
                    	# [[ $z =~ transmission ]] && continue
                        g=$(find "package/ feeds/ target/" "$z" | head -n 1)
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

_config(){
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

REPO_URL="https://github.com/coolsnowwolf/lede"
echo -e "$(color cy '拉取源码....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
git clone -q $REPO_URL $REPO_FLODER
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
    grep -q "$CACHE_NAME" ../xa && \
    wget -qc -t=3 $(grep "$CACHE_NAME" ../xa) || wget -qc -t=3 $(grep "$CACHE_NAME" ../xc)
    [ -e *.tzst ]; status
    [ -e *.tzst ] && {
        echo -e "$(color cy '部署tz-cache')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
        (tar -I unzstd -xf *.tzst || tar -xf *.tzst) && {
            if ! grep -q "$CACHE_NAME" ../xa; then
                cp *.tzst ../output
                echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
            fi
            sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
        }
        [ -d staging_dir ]; status
    }
else
    echo "CACHE_ACTIONS=true" >>$GITHUB_ENV
fi

echo -e "$(color cy '更新软件....')\c"; BEGIN_TIME=$(date '+%H:%M:%S')
sed -i '/#.*helloworld/ s/^#//' feeds.conf.default
./scripts/feeds update -a 1>/dev/null 2>&1
./scripts/feeds install -a 1>/dev/null 2>&1
status
_config

cat >>.config <<-EOF
	CONFIG_KERNEL_BUILD_USER="win3gp"
	CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
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
	CONFIG_PACKAGE_luci-app-ttyd=y
	CONFIG_PACKAGE_luci-app-upnp=y
	CONFIG_PACKAGE_luci-app-wizard=y
	CONFIG_PACKAGE_luci-app-simplenetwork=y
	CONFIG_PACKAGE_luci-app-opkg=y
	CONFIG_PACKAGE_automount=y
	CONFIG_PACKAGE_autosamba=y
	CONFIG_PACKAGE_luci-app-diskman=y
	CONFIG_PACKAGE_luci-theme-bootstrap=y
	CONFIG_PACKAGE_luci-app-tinynote=y
	EOF

color cy "自定义设置.... "
wget -qO package/base-files/files/etc/banner git.io/JoNK8
if [[ $REPO_URL =~ "coolsnowwolf" ]]; then
    REPO_BRANCH=$(sed -En 's/^src-git luci.*;(.*)/\1/p' feeds.conf.default)
    REPO_BRANCH=${REPO_BRANCH:-18.06}
    sed -i "/DISTRIB_DESCRIPTION/ {s/'$/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)'/}" package/*/*/*/openwrt_release
    sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk
    sed -i 's/option enabled.*/option enabled 1/' feeds/*/*/*/*/upnpd.config
    sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
    sed -i "{
            /upnp\|openwrt_release\|shadow/d
            \$i sed -i 's/root::.*/root:\$1\$RysBCijW\$wIxPNkj9Ht9WhglXAXo4w0:18206:0:99999:7:::/g' /etc/shadow\n[ -f '/bin/bash' ] && sed -i '/\\\/ash$/s/ash/bash/' /etc/passwd\nuci set luci.main.mediaurlbase=\"/luci-static/bootstrap\"
            }" package/lean/default-settings/files/*default-settings
fi
# git diff ./ >> ../output/t.patch || true
clone_dir sbwml/openwrt_helloworld trojan-plus geoview
clone_dir vernesong/OpenClash luci-app-openclash
clone_dir xiaorouji/openwrt-passwall luci-app-passwall
clone_dir xiaorouji/openwrt-passwall2 luci-app-passwall2
clone_dir hong0980/build luci-app-timedtask luci-app-tinynote luci-app-poweroff luci-app-filebrowser luci-app-cowbping \
    luci-app-diskman luci-app-cowb-speedlimit qBittorrent-static luci-app-qbittorrent luci-app-wizard luci-app-dockerman \
    luci-app-pwdHackDeny luci-app-softwarecenter luci-app-ddnsto luci-lib-docker
clone_dir kiddin9/kwrt-packages luci-lib-taskd luci-lib-xterm lua-maxminddb luci-app-store \
    luci-app-bypass luci-app-pushbot taskd

# https://github.com/userdocs/qbittorrent-nox-static/releases
xc=$(_find "package/A/ feeds/" "qBittorrent-static")
[[ -d $xc ]] && [[ $qBittorrent_version ]] && \
    sed -i "s/PKG_VERSION:=.*/PKG_VERSION:=${qBittorrent_version:-4.6.5}_v${libtorrent_version:-2.0.10}/" $xc/Makefile

case $TARGET_DEVICE in
"x86_64")
    FIRMWARE_TYPE="squashfs-combined"
    # lan_ip "192.168.2.150"
    #[[ $SOURCE_NAME =~ "coolsnowwolf" ]] && sed -i 's/5.15/5.4/g' target/linux/x86/Makefile
    _packages "
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
    ;;
"newifi-d2")
    FIRMWARE_TYPE="sysupgrade"
    _packages "luci-app-easymesh"
    _delpackage "ikoolproxy openclash transmission softwarecenter aria2 vssr adguardhome"
    lan_ip "192.168.2.1"
    ;;
"phicomm_k2p")
    FIRMWARE_TYPE="sysupgrade"
    _packages "luci-app-easymesh"
    _delpackage "samba4 luci-app-usb-printer luci-app-cifs-mount diskman cupsd autosamba automount"
    lan_ip "192.168.2.1"
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
    lan_ip "192.168.2.1"
    # sed -i '/KERNEL_PATCHVER/s/=.*/=5.4/' target/linux/rockchip/Makefile
    # clone_dir 'openwrt-18.06-k5.4' immortalwrt/immortalwrt uboot-rockchip arm-trusted-firmware-rockchip-vendor
    sed -i "/interfaces_lan_wan/s/'eth1' 'eth0'/'eth0' 'eth1'/" target/linux/rockchip/*/*/*/*/02_network
    # git_apply "raw.githubusercontent.com/hong0980/diy/master/files/r1-plus-lts-patches/0001-Add-pwm-fan.sh.patch"
    ;;
"asus_rt-n16")
    FIRMWARE_TYPE="n16"
    lan_ip "192.168.2.130"
    ;;
"armvirt-64-default")
    FIRMWARE_TYPE="$TARGET_DEVICE"
    sed -i '/easymesh/d' .config
    lan_ip "192.168.2.110"
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

for p in package/A/luci-app*/po feeds/luci/applications/luci-app*/po; do
    [[ -L $p/zh_Hans || -L $p/zh-cn ]] || (ln -s zh-cn $p/zh_Hans 2>/dev/null || ln -s zh_Hans $p/zh-cn 2>/dev/null)
done

sed -i '/bridged\|deluge\|transmission/d' .config
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
echo "REPO_BRANCH=${REPO_BRANCH#*-}" >>$GITHUB_ENV
echo "FIRMWARE_TYPE=$FIRMWARE_TYPE" >>$GITHUB_ENV

echo -e "\e[1;35m脚本运行完成！\e[0m"
