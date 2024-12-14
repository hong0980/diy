#!/usr/bin/env bash
# sudo bash -c 'bash <(curl -s https://build-scripts.immortalwrt.eu.org/init_build_environment.sh)'
qBittorrent_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K\d+\.\d+\.\d+' | sort -Vr | head -n 1 || "")
libtorrent_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\d+\.\d+\.\d+_v\K\d+\.\d+\.\d+' | sort -Vr | head -n 1 || "")
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
curl -sL $GITHUB_API_URL/repos/$GITHUB_REPOSITORY/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xa
curl -sL api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc

color() {
    case $1 in
        cr) echo -e "\e[1;31m$2\e[0m" ;;
        cg) echo -e "\e[1;32m$2\e[0m" ;;
        cy) echo -e "\e[1;33m$2\e[0m" ;;
        cb) echo -e "\e[1;34m$2\e[0m" ;;
        cm) echo -e "\e[1;35m$2\e[0m" ;;
        cc) echo -e "\e[1;36m$2\e[0m" ;;
    esac
}

status() {
    local check="$1" end_time=$(date '+%H:%M:%S')
    _date=" ==>用时 $[$(date +%s -d "$end_time") - $(date +%s -d "$begin_time")] 秒"
    [[ $_date =~ [0-9]+ ]] || _date=""
    if [[ $check = 0 ]]; then
        printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cg ✔)\e[1;39m ]${_date}"`
    else
        printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cr ✕)\e[1;39m ]${_date}"`
    fi
}

_find() {
    find $1 -maxdepth 5 -type d -name "$2" -print -quit 2>/dev/null
}

create_directory() {
    for dir in $@; do
        mkdir -p "$dir" 2>/dev/null || return 1
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

safe_pushd() {
    pushd "$1" &> /dev/null || echo -e "$(color cr ${1} '该目录不存在。')"
}

safe_popd() {
    popd &> /dev/null || echo -e "$(color cr '该目录不存在。')"
}

_printf() {
    IFS=' ' read -r param1 param2 param3 param4 param5 <<< "$1"
    printf "%s %-40s %s %s %s\n" "$param1" "$param2" "$param3" "$param4" "$param5"
}

git_diff() {
    local path
    if [[ $1 =~ feeds/luci|feeds/packages && -d $1 ]]; then
        path="$1"
        shift
        safe_pushd "$path"
    fi

    for i in "$@"; do
        git cat-file commit origin/${REPO_BRANCH}:"$i" &>/dev/null &&
        git diff -- "$i" > $GITHUB_WORKSPACE/firmware/${REPO_BRANCH}-${i##*/}.patch
    done

    [[ -n $path ]] && safe_popd
    ls -la ../firmware
    find ../firmware -type f -empty -delete
}

git_apply() {
    [[ $1 =~ ^# ]] && return
    local patch_source=$1 path=$2
    [[ -n $path && -d $path ]] && safe_pushd "$path" || \
    { echo -e "$(color cr '无法进入目录'): $path"; return 1; }

    if [[ -f $patch_source ]]; then
        git apply --ignore-whitespace < "$patch_source" > /dev/null 2>&1
    elif [[ $patch_source =~ ^http ]]; then
        wget -qO- "$patch_source" | git apply --ignore-whitespace > /dev/null 2>&1
    else
        echo -e "$(color cr '无效的补丁源：') $patch_source"
        safe_popd
        return 1
    fi

    [[ $? -eq 0 ]] && \
        echo -e "$(color cy '补丁 ') $(color cb ${patch_source##*/}) $(color cg ' 执行成功。')" || \
        echo -e "$(color cy '补丁 ') $(color cb ${patch_source##*/}) $(color cr ' 执行出错。')"

    [[ -n $path ]] && safe_popd
}

clone_dir() {
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

    [[ $repo_url == coolsnowwolf/packages ]] &&  {
        [[ $REPO_BRANCH =~ 23.05 ]] && set -- "$@" "golang" "bandwidthd"
        [[ $REPO_BRANCH =~ 21.02 ]] && set -- "$@" "docker" "dockerd" "containerd" "runc" "btrfs-progs" "golang" "bandwidthd"
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

        [[ -d "$current_dir" ]] && mv -f "$current_dir" ../
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
    for url in $@; do
        name="${url##*/}"
        if grep "^https" <<<"$url" | egrep -qv "openwrt_helloworld$|helloworld$|build$|openwrt-passwall-packages$"; then
            local destination
            local existing_path=$(_find "package/ target/ feeds/" "$name" | grep "/${name}$")
            if [[ -d $existing_path ]]; then
                mv -f $existing_path ../ && destination="$existing_path"
            else
                destination="package/A/$name"
            fi

            if git clone -q --depth 1 "$url" "$destination"; then
                if [[ $destination = $existing_path ]]; then
                    _printf "$(color cg 替换) $name [ $(color cg ✔) ]"
                else
                    _printf "$(color cb 添加) $name [ $(color cb ✔) ]"
                fi
            else
                _printf "$(color cr 拉取) $name [ $(color cr ✕) ]"
                if [[ $destination = $existing_path ]]; then
                    mv -f ../${existing_path##*/} ${existing_path%/*}/ && \
                    _printf "$(color cy 回退) ${existing_path##*/} [ $(color cy ✔) ]"
                fi
            fi
        else
            grep "^https" <<< "$url" | while IFS= read -r single_url; do
                local temp_dir=$(mktemp -d) destination existing_sub_path
                git clone -q --depth 1 "$single_url" $temp_dir && {
                    for sub_dir in $(ls -l $temp_dir | awk '/^d/{print $NF}' | grep -Ev 'dump$|dtest$'); do
                        existing_sub_path=$(_find "package/ feeds/ target/" "$sub_dir")
                        if [[ -d $existing_sub_path ]]; then
                            rm -rf $existing_sub_path && destination="$existing_sub_path"
                        else
                            destination="package/A"
                        fi
                        if mv -f $temp_dir/$sub_dir $destination; then
                            if [[ $destination = $existing_sub_path ]]; then
                                _printf "$(color cg 替换) $sub_dir [ $(color cg ✔) ]"
                            else
                                _printf "$(color cb 添加) $sub_dir [ $(color cb ✔) ]"
                            fi
                        fi
                    done
                }
                rm -rf $temp_dir
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
			CONFIG_TARGET_KERNEL_PARTSIZE=16
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

download_and_deploy_cache() {
    if (grep -q "$CACHE_NAME" ../xa ../xc); then
        ls ../*.tzst > /dev/null 2>&1 || {
            echo -e "$(color cy '下载tz-cache')\c"
            begin_time=$(date '+%H:%M:%S')
            grep -q "$CACHE_NAME" ../xa && \
            wget -qc -t=3 -P ../ $(grep "$CACHE_NAME" ../xa) || wget -qc -t=3 -P ../ $(grep "$CACHE_NAME" ../xc)
            status $?
        }

        ls ../*.tzst > /dev/null 2>&1 && {
            echo -e "$(color cy '部署tz-cache')\c"; begin_time=$(date '+%H:%M:%S')
            (tar -I unzstd -xf ../*.tzst || tar -xf ../*.tzst) && {
                if ! grep -q "$CACHE_NAME-cache.tzst" ../xa; then
                    cp ../*.tzst ../output
                    echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
                fi
                sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
            }
            [ -d staging_dir ]; status $?
        }
    else
        echo "CACHE_ACTIONS=true" >>$GITHUB_ENV
    fi
    echo -e "$(color cy '更新软件....')\c"; begin_time=$(date '+%H:%M:%S')
    ./scripts/feeds update -a 1>/dev/null 2>&1
    ./scripts/feeds install -a 1>/dev/null 2>&1
    status $?
}

create_directory "firmware" "output"
REPO_URL="https://github.com/immortalwrt/immortalwrt"
echo -e "$(color cy '拉取源码....')\c"; begin_time=$(date '+%H:%M:%S')
[ "$REPO_BRANCH" -a "$REPO_BRANCH" != "master" ] && cmd="-b $REPO_BRANCH --single-branch"
git clone -q $cmd $REPO_URL $REPO_FLODER # --depth 1
status $?
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

download_and_deploy_cache
config

cat >>.config <<-EOF
	CONFIG_KERNEL_BUILD_USER="win3gp"
	CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
	CONFIG_PACKAGE_automount=y
	CONFIG_PACKAGE_autosamba=y
	CONFIG_PACKAGE_luci-app-accesscontrol=y
	CONFIG_PACKAGE_luci-app-appfilter=y
	CONFIG_PACKAGE_luci-app-arpbind=y
	CONFIG_PACKAGE_luci-app-bridge=y
	CONFIG_PACKAGE_luci-app-cowb-speedlimit=y
	CONFIG_PACKAGE_luci-app-cowbping=y
	CONFIG_PACKAGE_luci-app-cpulimit=y
	CONFIG_PACKAGE_luci-app-ddnsto=y
	CONFIG_PACKAGE_luci-app-diskman=y
	CONFIG_PACKAGE_luci-app-filebrowser=y
	CONFIG_PACKAGE_luci-app-filetransfer=y
	CONFIG_PACKAGE_luci-app-ikoolproxy=y
	CONFIG_PACKAGE_luci-app-luci-app-commands=y
	CONFIG_PACKAGE_luci-app-oaf=y
	CONFIG_PACKAGE_luci-app-opkg=y
	CONFIG_PACKAGE_luci-app-passwall=y
	CONFIG_PACKAGE_luci-app-ssr-plus=y
	CONFIG_PACKAGE_luci-app-timedtask=y
	CONFIG_PACKAGE_luci-app-tinynote=y
	CONFIG_PACKAGE_luci-app-ttyd=y
	CONFIG_PACKAGE_luci-app-upnp=y
	CONFIG_PACKAGE_luci-app-vlmcsd=y
	CONFIG_PACKAGE_luci-app-wifischedule=y
	CONFIG_PACKAGE_luci-app-wizard=y
	CONFIG_PACKAGE_default-settings-chn=y
	CONFIG_DEFAULT_SETTINGS_OPTIMIZE_FOR_CHINESE=y
	# CONFIG_LUCI_SRCDIET is not set #压缩 Lua 源代码
	## CONFIG_LUCI_JSMIN is not set  #压缩 JavaScript 源代码
	# CONFIG_LUCI_CSSTIDY is not set #压缩 CSS 文件
EOF

config_generate="package/base-files/files/bin/config_generate"
color cy "自定义设置.... "
wget -qO package/base-files/files/etc/banner git.io/JoNK8
sed -i "/DISTRIB_DESCRIPTION/ {s/'$/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)'/}" package/*/*/*/openwrt_release
sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk
sed -i "s/ImmortalWrt/OpenWrt/g" {$config_generate,include/version.mk}
sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
sed -i "\$i uci -q set luci.main.mediaurlbase=\"/luci-static/bootstrap\" && uci -q commit luci\nuci -q set upnpd.config.enabled=\"1\" && uci -q commit upnpd\nsed -i 's/root::.*:::/root:\$1\$pn1ABFaI\$vt5cmIjlr6M7Z79Eds2lV0:16821:0:99999:7:::/g' /etc/shadow" $(find package/emortal/ -type f -regex '.*default-settings$')

# git diff ./ >> ../output/t.patch || true
clone_url "
    https://github.com/hong0980/build
    https://github.com/fw876/helloworld
    https://github.com/xiaorouji/openwrt-passwall-packages
"

clone_dir vernesong/OpenClash luci-app-openclash
clone_dir xiaorouji/openwrt-passwall luci-app-passwall
clone_dir xiaorouji/openwrt-passwall2 luci-app-passwall2
clone_dir sbwml/openwrt_helloworld shadowsocks-rust #luci-app-openclash luci-app-passwall luci-app-passwall2
# git_apply https://raw.githubusercontent.com/sbwml/openwrt_helloworld/refs/heads/v5/patch-luci-app-ssr-plus.patch feeds/luci/applications
# git_apply https://raw.githubusercontent.com/sbwml/openwrt_helloworld/refs/heads/v5/patch-luci-app-passwall.patch feeds/luci/applications
clone_dir coolsnowwolf/packages qtbase qttools qBittorrent qBittorrent-static
clone_dir master UnblockNeteaseMusic/luci-app-unblockneteasemusic luci-app-unblockneteasemusic
clone_dir kiddin9/kwrt-packages luci-lib-taskd luci-lib-xterm lua-maxminddb \
    luci-app-bypass luci-app-store luci-app-pushbot taskd

git_diff "feeds/luci" "applications/luci-app-diskman" "applications/luci-app-passwall" "applications/luci-app-ssr-plus" "applications/luci-app-dockerman"

[[ "$TARGET_DEVICE" =~ phicomm|newifi|asus ]] || {
    _packages "
    axel lscpu lsscsi patch diffutils htop lscpu
    brcmfmac-firmware-43430-sdio brcmfmac-firmware-43455-sdio kmod-brcmfmac
    kmod-brcmutil kmod-mt7601u kmod-mt76x0u kmod-mt76x2u kmod-r8125
    kmod-rt2500-usb kmod-rt2800-usb kmod-rtl8187 kmod-rtl8723bs
    kmod-rtl8723au kmod-rtl8723bu kmod-rtl8812au-ac kmod-rtl8812au-ct
    kmod-rtl8821ae kmod-rtl8821cu kmod-rtl8xxxu kmod-usb-net-asix-ax88179
    kmod-usb-net-rtl8150 kmod-usb-net-rtl8152 mt7601u-firmware #rtl8188eu-firmware #kmod-rtl8188eu
    rtl8723au-firmware rtl8723bu-firmware rtl8821ae-firmware
    luci-app-aria2
    luci-app-bypass
    #luci-app-cifs-mount
    luci-app-commands
    luci-app-hd-idle
    luci-app-cupsd
    luci-app-openclash
    luci-app-pushbot
    luci-app-softwarecenter
    #luci-app-syncdial
    #luci-app-transmission
    luci-app-usb-printer
    luci-app-vssr
    luci-app-wol
    #luci-app-bandwidthd
    luci-app-store
    luci-app-log
    #luci-app-alist
    luci-app-weburl
    luci-app-wrtbwmon
    luci-theme-material
    luci-theme-opentomato
    luci-app-pwdHackDeny
    luci-app-uhttpd
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
        https://github.com/yaof2/luci-app-ikoolproxy
        https://github.com/AlexZhuo/luci-app-bandwidthd
    "

    rm -rf feeds/*/*/{luci-app-appfilter,open-app-filter}

    mwan3=feeds/packages/net/mwan3/files/etc/config/mwan3
    grep -q "8.8" $mwan3 && sed -i '/8.8/d' $mwan3

    grep -q "rblibtorrent" package/A/qBittorrent/Makefile && \
    sed -i 's/+rblibtorrent/+libtorrent-rasterbar/' package/A/qBittorrent/Makefile

    [[ "$REPO_BRANCH" =~ 2.*0 ]] && {
        sed -i 's/^ping/-- ping/g' package/*/*/*/*/*/bridge.lua
    } || {
        _packages "luci-app-argon-config"
        sed -i "s/argonv3/argon/" feeds/luci/applications/luci-app-argon-config/Makefile
        for d in $(find feeds/ package/ -type f -name "index.htm" 2>/dev/null); do
            if grep -q "Kernel Version" $d; then
                # echo $d
                sed -i 's|os.date(.*|os.date("%F %X") .. " " .. translate(os.date("%A")),|' $d
                sed -i '/<%+footer%>/i<%-\n\tlocal incdir = util.libpath() .. "/view/admin_status/index/"\n\tif fs.access(incdir) then\n\t\tlocal inc\n\t\tfor inc in fs.dir(incdir) do\n\t\t\tif inc:match("%.htm$") then\n\t\t\t\tinclude("admin_status/index/" .. inc:gsub("%.htm$", ""))\n\t\t\tend\n\t\tend\n\t\end\n-%>\n' $d
                # sed -i '/<%+footer%>/i<fieldset class="cbi-section">\n\t<legend><%:天气%></legend>\n\t<table width="100%" cellspacing="10">\n\t\t<tr><td width="10%"><%:本地天气%></td><td > <iframe width="900" height="120" frameborder="0" scrolling="no" hspace="0" src="//i.tianqi.com/?c=code&a=getcode&id=22&py=xiaoshan&icon=1"></iframe>\n\t\t<tr><td width="10%"><%:柯桥天气%></td><td > <iframe width="900" height="120" frameborder="0" scrolling="no" hspace="0" src="//i.tianqi.com/?c=code&a=getcode&id=22&py=keqiaoqv&icon=1"></iframe>\n\t\t<tr><td width="10%"><%:指数%></td><td > <iframe width="400" height="270" frameborder="0" scrolling="no" hspace="0" src="https://i.tianqi.com/?c=code&a=getcode&id=27&py=xiaoshan&icon=1"></iframe><iframe width="400" height="270" frameborder="0" scrolling="no" hspace="0" src="https://i.tianqi.com/?c=code&a=getcode&id=27&py=keqiaoqv&icon=1"></iframe>\n\t</table>\n</fieldset>\n' $d
            fi
        done
    }
    # xa=$(_find "package/A/ feeds/luci/applications/" "luci-app-vssr")
    # [[ -d $xa ]] && sed -i "/dports/s/1/2/;/ip_data_url/s|'.*'|'https://ispip.clang.cn/all_cn.txt'|" $xa/root/etc/config/vssr
    xb=$(_find "package/A/ feeds/luci/applications/" "luci-app-bypass")
    [[ -d $xb ]] && sed -i 's/default y/default n/g' $xb/Makefile
    #https://github.com/userdocs/qbittorrent-nox-static/releases
    xc=$(_find "package/A/ feeds/" "qBittorrent-static")
    [[ -d $xc ]] && {
        # [[ $qBittorrent_version ]] && sed -i "s/userdocs/hong0980/" $xc/Makefile
        sed -i "s/PKG_VERSION:=.*/PKG_VERSION:=${qBittorrent_version:-4.6.5}_v${libtorrent_version:-2.0.10}/" $xc/Makefile
    }
    xd=$(_find "package/A/ feeds/luci/applications/" "luci-app-turboacc")
    [[ -d $xd ]] && sed -i '/hw_flow/s/1/0/;/sfe_flow/s/1/0/;/sfe_bridge/s/1/0/' $xd/root/etc/config/turboacc
    xe=$(_find "package/A/ feeds/luci/applications/" "luci-app-ikoolproxy")
    [[ -f $xe/luasrc/model/cbi/koolproxy/basic.lua ]] && sed -i \
        '/^local.*sys.exec/ s/$/ or 0/g; /^local.*sys.exec/ s/.txt/.txt 2>\/dev\/null/g' $xe/luasrc/model/cbi/koolproxy/basic.lua
    xg=$(_find "package/A/ feeds/luci/applications/" "luci-app-pushbot")
    [[ -d $xg ]] && {
        sed -i "s|-c pushbot|/usr/bin/pushbot/pushbot|" $xg/luasrc/controller/pushbot.lua
        sed -i '/start()/a[ "$(uci get pushbot.@pushbot[0].pushbot_enable)" -eq "0" ] && return 0' $xg/root/etc/init.d/pushbot
    }
}

case "$TARGET_DEVICE" in
"r4s"|"r2c"|"r2s"|"r1-plus-lts"|"r1-plus")
    DEVICE_NAME="$TARGET_DEVICE"
    FIRMWARE_TYPE="sysupgrade"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.1"/' $config_generate
        _packages "
        luci-app-dockerman
        luci-app-turboacc
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
        _packages "kmod-rt2800-usb kmod-rtl8187 kmod-rtl8812au-ac kmod-rtl8812au-ct kmod-rtl8821ae
        kmod-rtl8821cu ethtool kmod-usb-wdm kmod-usb2 kmod-usb-ohci kmod-usb-uhci kmod-mt76x2u kmod-mt76x0u
        kmod-gpu-lima luci-app-cpufreq luci-app-pushbot luci-app-wrtbwmon luci-app-vssr"
        echo -e "CONFIG_DRIVER_11AC_SUPPORT=y\nCONFIG_DRIVER_11N_SUPPORT=y\nCONFIG_DRIVER_11W_SUPPORT=y" >>.config
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
        _packages "
        luci-app-adbyby-plus
        #luci-app-adguardhome
        luci-app-passwall2
        #luci-app-amule
        luci-app-dockerman
        luci-app-netdata
        luci-app-poweroff
        luci-app-qbittorrent
        #luci-app-smartdns
        luci-app-ikoolproxy
        luci-app-deluge
        #luci-app-godproxy
        #luci-app-frpc
        #luci-app-unblockneteasemusic
        #AmuleWebUI-Reloaded htop lscpu lsscsi lsusb nano pciutils screen webui-aria2 zstd pv
        #subversion-client #unixodbc #git-http
        "
        # [[ $REPO_BRANCH = "openwrt-18.06-k5.4" ]] && sed -i '/KERNEL_PATCHVER/s/=.*/=5.10/' target/linux/x86/Makefile
        wget -qO package/base-files/files/bin/bpm git.io/bpm && chmod +x package/base-files/files/bin/bpm
        wget -qO package/base-files/files/bin/ansi git.io/ansi && chmod +x package/base-files/files/bin/ansi
        [[ $REPO_BRANCH == master ]] && rm -rf package/kernel/rt*
    ;;
"armvirt-64-default")
    DEVICE_NAME="$TARGET_DEVICE"
    FIRMWARE_TYPE="$TARGET_DEVICE"
    [[ -n $IP ]] && \
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate || \
    sed -i '/n) ipad/s/".*"/"192.168.2.110"/' $config_generate
    echo "CONFIG_PERL_NOCOMMENT=y" >>.config
    sed -i -E '/easymesh/d' .config
    sed -i "s/default 160/default $PARTSIZE/" config/Config-images.in
    sed -i 's/@arm/@TARGET_armvirt_64/g' $(_find "package/A/ feeds/" "luci-app-cpufreq")/Makefile
    ;;
esac

[[ "$REPO_BRANCH" =~ 21.02|18.06 ]] && {
    create_directory "package/utils/ucode" "package/network/config/firewall4" "package/network/utils/fullconenat-nft"
    # [[ $TARGET_DEVICE =~ ^r ]] && \
    # sed -i "s|VERSION.*|VERSION-5.4 = .273|; s|HASH.*|HASH-5.4.273 = 8ba0cfd3faa7222542b30791def49f426d7b50a07217366ead655a5687534743|" include/kernel-5.4
    clone_dir immortalwrt/packages nghttp3 ngtcp2 bash
    clone_dir openwrt-23.05 immortalwrt/immortalwrt busybox ppp automount openssl \
        dnsmasq nftables libnftnl sonfilter opkg fullconenat fullconenat-nft \
        #fstools odhcp6c iptables ipset dropbear usbmode
    clone_dir openwrt-23.05 immortalwrt/packages samba4 nginx-util htop pciutils libwebsockets gawk mwan3 \
        lua-openssl smartdns bluez curl #miniupnpc miniupnpd
    clone_dir openwrt-23.05 immortalwrt/luci luci-app-syncdial luci-app-mwan3
    clone_dir coolsnowwolf/lede ucode firewall4
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
	define KernelPackage/nft-compat
	  SUBMENU:=$(NF_MENU)
	  TITLE:=Netfilter nf_tables compat support
	  DEPENDS:=+kmod-nft-core +kmod-nf-ipt
	  FILES:=$(foreach mod,$(NFT_COMPAT-m),$(LINUX_DIR)/net/$(mod).ko)
	  AUTOLOAD:=$(call AutoProbe,$(notdir $(NFT_COMPAT-m)))
	  KCONFIG:=$(KCONFIG_NFT_COMPAT)
	endef
	$(eval $(call KernelPackage,nft-compat))
	define KernelPackage/ipt-socket
	  TITLE:=Iptables socket matching support
	  DEPENDS+=+kmod-nf-socket +kmod-nf-conntrack
	  KCONFIG:=$(KCONFIG_IPT_SOCKET)
	  FILES:=$(foreach mod,$(IPT_SOCKET-m),$(LINUX_DIR)/net/$(mod).ko)
	  AUTOLOAD:=$(call AutoProbe,$(notdir $(IPT_SOCKET-m)))
	  $(call AddDepends/ipt)
	endef
	define KernelPackage/ipt-socket/description
	  Kernel modules for socket matching
	endef
	$(eval $(call KernelPackage,ipt-socket))
	define KernelPackage/nf-socket
	  SUBMENU:=$(NF_MENU)
	  TITLE:=Netfilter socket lookup support
	  KCONFIG:= $(KCONFIG_NF_SOCKET)
	  FILES:=$(foreach mod,$(NF_SOCKET-m),$(LINUX_DIR)/net/$(mod).ko)
	  AUTOLOAD:=$(call AutoProbe,$(notdir $(NF_SOCKET-m)))
	endef
	$(eval $(call KernelPackage,nf-socket))
	EOF
    curl -sSo include/openssl-module.mk https://raw.githubusercontent.com/immortalwrt/immortalwrt/master/include/openssl-module.mk
}

sed -i \
    -e 's|\.\./\.\./luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' \
    -e 's?include \.\./\.\./\(lang\|devel\)?include $(TOPDIR)/feeds/packages/\1?' \
    -e "s/\(\(^\| \|    \)\(PKG_HASH\|PKG_MD5SUM\|PKG_MIRROR_HASH\|HASH\):=\).*/\1skip/" \
package/A/*/Makefile 2>/dev/null

# mv -f package/A/luci-app* feeds/luci/applications/
# git diff -- feeds/luci/applications/luci-app-qbittorrent > ../firmware/$REPO_BRANCH-luci-app-qbittorrent.patch
[[ "$REPO_BRANCH" =~ master|openwrt-23.05|openwrt-24.10 ]] && sed -i '/deluge/d' .config
sed -i '/bridge\|vssr\|deluge/d' .config

[[ "$TARGET_DEVICE" = "x86_64" && "$REPO_BRANCH" =~ master|openwrt-23.05|openwrt-24.10 ]] && {
    cd ../
    rm -rf $REPO_FLODER
    git clone -q $cmd $REPO_URL $REPO_FLODER
    cd $REPO_FLODER
    download_and_deploy_cache
	cat >.config<<-EOF
	CONFIG_TARGET_x86=y
	CONFIG_TARGET_x86_64=y
	CONFIG_TARGET_x86_64_DEVICE_generic=y
	CONFIG_TARGET_ROOTFS_PARTSIZE=$PARTSIZE
	CONFIG_TARGET_KERNEL_PARTSIZE=16
	CONFIG_KERNEL_BUILD_USER="win3gp"
	CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
	CONFIG_PACKAGE_automount=y
	CONFIG_PACKAGE_autosamba=y
	CONFIG_PACKAGE_luci-app-dockerman=y
	CONFIG_PACKAGE_luci-app-diskman=y
	CONFIG_PACKAGE_luci-app-passwall=y
	CONFIG_PACKAGE_luci-app-ssr-plus=y
	CONFIG_PACKAGE_luci-app-openclash=y
	CONFIG_PACKAGE_luci-app-filebrowser=y
	CONFIG_PACKAGE_luci-app-filetransfer=y
	CONFIG_PACKAGE_luci-app-ssr-plus=y
	CONFIG_PACKAGE_luci-app-timedtask=y
	CONFIG_PACKAGE_luci-app-tinynote=y
	CONFIG_PACKAGE_luci-app-ttyd=y
	CONFIG_PACKAGE_luci-app-upnp=y
	CONFIG_PACKAGE_luci-app-wizard=y
	CONFIG_PACKAGE_luci-app-poweroff=y
	CONFIG_PACKAGE_luci-app-passwall2=y
	EOF
    create_directory "feeds/luci/applications/luci-app-passwall2"
    git_apply $GITHUB_WORKSPACE/firmware/${REPO_BRANCH}-luci-app-diskman.patch feeds/luci
    git_apply $GITHUB_WORKSPACE/firmware/${REPO_BRANCH}-luci-app-dockerman.patch feeds/luci
    clone_dir sbwml/openwrt_helloworld luci-app-ssr-plus luci-app-passwall2 shadowsocks-libev \
    shadowsocksr-libev shadow-tls pdnsd-alt ssocks v2ray-geoview
    clone_dir hong0980/build luci-app-timedtask luci-app-tinynote luci-app-wizard luci-app-poweroff
    sed -i '/n) ipad/s/".*"/"'"$IP"'"/' $config_generate
    sed -i "/DISTRIB_DESCRIPTION/ {s/'$/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)'/}" package/*/*/*/openwrt_release
    sed -i "s/ImmortalWrt/OpenWrt/g" {$config_generate,include/version.mk}
}

for p in package/A/luci-app*/po feeds/luci/applications/luci-app*/po; do
    [[ -L $p/zh_Hans || -L $p/zh-cn ]] || (ln -s zh-cn $p/zh_Hans 2>/dev/null || ln -s zh_Hans $p/zh-cn 2>/dev/null)
done

echo -e "$(color cy '更新配置....')\c"; begin_time=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status $?

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
