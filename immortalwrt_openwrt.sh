#!/usr/bin/env bash
# sudo bash -c 'bash <(curl -s https://build-scripts.immortalwrt.eu.org/init_build_environment.sh)'
qb_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K(.*?)(?=/)' | sort -Vr | uniq | awk 'NR==1')
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
for page in 1 2; do
	curl -sL "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/releases?page=$page"
done | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' > xa
curl -sL https://api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
# curl -s https://api.github.com/repos/kiddin9/kwrt-packages/contents/ | jq -r '.[] | select(.type == "dir" and (.name | startswith(".") | not)) | .name' > kiddin9_packages

color() {
	case $1 in
		cr) echo -e "\e[1;31m$2\e[0m" ;;  # 红色
		cg) echo -e "\e[1;32m$2\e[0m" ;;  # 绿色
		cy) echo -e "\e[1;33m$2\e[0m" ;;  # 黄色
		cb) echo -e "\e[1;34m$2\e[0m" ;;  # 蓝色
		cm) echo -e "\e[1;35m$2\e[0m" ;;  # 紫色
		cc) echo -e "\e[1;36m$2\e[0m" ;;  # 青色
		cw) echo -e "\e[1;37m$2\e[0m" ;;  # 白色
		cd) echo -e "\e[1;90m$2\e[0m" ;;  # 灰色
		co) echo -e "\e[1;91m$2\e[0m" ;;  # 浅红色
		cg2) echo -e "\e[1;92m$2\e[0m" ;;  # 浅绿色
		cy2) echo -e "\e[1;93m$2\e[0m" ;;  # 浅黄色
		cb2) echo -e "\e[1;94m$2\e[0m" ;;  # 浅蓝色
		cm2) echo -e "\e[1;95m$2\e[0m" ;;  # 浅紫色
		cc2) echo -e "\e[1;96m$2\e[0m" ;;  # 浅青色
	esac
}

status() {
	local check=$? end_time=$(date '+%H:%M:%S')
	_date=" ==>用时 $[$(date +%s -d "$end_time") - $(date +%s -d "$begin_time")] 秒"
	[[ $_date =~ [0-9]+ ]] || _date=""
	if [[ $CHECK -eq 0 ]]; then
		printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cg ✔)\e[1;39m ]${_date}"`
	else
		printf "%35s %s %s %s %s %-6s %s\n" `echo -e "[ $(color cr ✕)\e[1;39m ]${_date}"`
	fi
}

find_first_dir() {
	find $1 -maxdepth 5 -type d -name "$2" -print -quit 2>/dev/null
}

create_directory() {
	for dir in "$@"; do
		mkdir -p "$dir" 2>/dev/null || return 1
	done
}

add_package() {
	for z in $@; do
		[[ $z =~ ^# ]] || echo "CONFIG_PACKAGE_$z=y" >>.config
	done
}

add_busybox() {
	local config_file="package/utils/busybox/Config-defaults.in"
	for z in $@; do
		[[ "$z" =~ ^# ]] && continue
		local str=$(echo "$z" | tr 'a-z' 'A-Z')
		grep -q "BUSYBOX_DEFAULT_$str$" "$config_file" && \
		sed -i "/^config BUSYBOX_DEFAULT_$str$/{n;n;/default /!{s/$/\n\tdefault y/};/default /s/default .*/default y/}" "$config_file" #&& _printf "$(color cb 添加) busybox_$z [ $(color cb ✔) ]"
	done
}

delpackage() {
	for z in $@; do
		[[ $z =~ ^# ]] || echo "# CONFIG_PACKAGE_$z is not set" >> .config
		# [[ $z =~ ^# ]] || sed -Ei "s/(CONFIG_PACKAGE_.*$z)=y/# \1 is not set/" .config
	done
}

_printf() {
	IFS=' ' read -r param1 param2 param3 param4 param5 <<< "$1"
	printf "%s %-40s %s %s %s\n" "$param1" "$param2" "$param3" "$param4" "$param5"
}

lan_ip() {
	sed -i '/lan) ipad/s/".*"/"'"${IP:-$1}"'"/' $config_generate
}

git_diff() {
	[[ $# -lt 1 ]] && return
	local original_dir=$(pwd)
	for i in $@; do
		if [[ $i =~ ^feeds ]]; then
			cd $(cut -d'/' -f1-2 <<< "$i") || return 1
			i=$(cut -d'/' -f3- <<< "$i")
		fi

		if [[ -d "$i" || -f "$i" ]]; then
			patch_file="$GITHUB_WORKSPACE/firmware/${REPO}-${REPO_BRANCH}-${i##*/}.patch"
			git diff -- "$i" > "$patch_file"
			[[ -s "$patch_file" ]] && _printf "$(color cm 生成) ${patch_file##*/} [ $(color cg ✔) ]" || rm "$patch_file"
		fi
		cd "$original_dir"
	done
}

git_apply() {
	[[ $# -lt 1 || $1 =~ ^# ]] && return
	local patch_source=$1 path=$2 original_dir=$(pwd)
	[[ -n $path ]] && {
		[[ -d $path ]] && cd "$path" || { echo -e "$(color cr '无法进入目录'): $path"; return 1; }
	}

	if [[ $patch_source =~ ^http ]]; then
		wget -qO- "$patch_source" | git apply --ignore-whitespace > /dev/null 2>&1
	elif [[ -f $patch_source ]]; then
		git apply --ignore-whitespace < "$patch_source" > /dev/null 2>&1
	else
		echo -e "$(color cr '无效的补丁源：') $patch_source"
		cd "$original_dir"
		return 1
	fi

	[[ $? -eq 0 ]] \
		&& _printf "$(color cm 执行) ${patch_source##*/} [ $(color cg ✔) ]" \
		|| _printf "$(color cr 执行) ${patch_source##*/} [ $(color cr ✕) ]"
	cd "$original_dir"
}

clone_dir() {
	[[ $# -lt 1 ]] && return 1
	local repo_url branch temp_dir=$(mktemp -d) find_dir="package feeds target"
	trap 'rm -rf "$temp_dir"' EXIT INT TERM
	if [[ $1 == */* ]]; then
		repo_url="$1"
		shift
	else
		branch="-b $1 --single-branch"
		repo_url="$2"
		shift 2
	fi
	if [[ $1 =~ ^(package|feeds|target)$ ]]; then
		find_dir="$1"
		shift
	fi
	[[ $repo_url =~ ^https?:// ]] || repo_url="https://github.com/$repo_url"

	git clone -q $branch --depth 1 "$repo_url" $temp_dir 2>/dev/null || {
		_printf "$(color cr 拉取) $repo_url [ $(color cr ✕) ]"
		return 1
	}

	[[ $REPO_BRANCH =~ master|23|24 ]] || {
		[[ $repo_url =~ hong0980/diy ]] && set -- "$@" luci-app-wizard
		[[ $repo_url =~ coolsnowwolf/packages ]] && set -- "$@" "bash" \
				"btrfs-progs" "gawk" "jq" "nginx-util" "pciutils" "curl"
	}
	[[ $repo_url =~ sbwml && $REPO =~ openwrt ]] && set -- "$@" "dns2socks" "dns2tcp" "hysteria" "ipt2socks" \
		"microsocks" "naiveproxy" "pdnsd" "redsocks2" "simple-obfs" "tcping" "trojan" \
		"tuic-client" "v2ray-core" "v2ray-geodata" "v2ray-plugin" "xray-plugin"

	for target_dir in $@; do
		local source_dir current_dir destination_dir
		if [[ ${repo_url##*/} == ${target_dir} ]]; then
			mv -f ${temp_dir} ${target_dir}
			source_dir=${target_dir}
		else
			source_dir=$(find_first_dir "$temp_dir" "$target_dir")
		fi
		[[ -d "$source_dir" ]] || continue
		current_dir=$(find_first_dir "$find_dir" "$target_dir")
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
}

clone_url() {
	[[ $# -lt 1 ]] && return 1
	for url in $@; do
		[[ $url =~ ^# ]] && continue
		[[ "$url" =~ ^https?:// ]] || url="https://github.com/${url#github:}"
		local temp_dir existing_sub_path dest="package/A"
		temp_dir=$(mktemp -d) && trap 'rm -rf "$temp_dir"' EXIT INT TERM

		if ! git clone -q --depth 1 --single-branch --config \
			advice.detachedHead=false "$url" "$temp_dir"; then
			_printf "$(color cr "克隆失败") $url"
			continue
		fi

		while IFS= read -r -d '' sub_dir; do
			sub_dir=$(basename "$sub_dir")
			existing_sub_path=$(find_first_dir "package feeds target" "$sub_dir")
			local backup_path=""

			if [[ -d "$existing_sub_path" ]]; then
				backup_path="../$sub_dir"
				{ rm -rf "$backup_path" && mv -f "$existing_sub_path" "$backup_path"; } 2>/dev/null
				dest="$existing_sub_path"
			fi

			if mv -f "$temp_dir/$sub_dir" "$dest" 2>/dev/null; then
				if [[ -n $backup_path ]]; then
					_printf "$(color cg 替换) $sub_dir [ $(color cg ✔) ]"
				else
					_printf "$(color cb 添加) $sub_dir [ $(color cb ✔) ]"
				fi
			else
				_printf "$(color cr 更换失败) $sub_dir [ $(color cr ✕) ]"
				if [[ -n "$backup_path" && -d "$backup_path" ]]; then
					if mv -f "$backup_path" "$(dirname "$existing_sub_path")"; then
						_printf "$(color cg 恢复) $sub_dir [ $(color cg ✔) ]"
					else
						_printf "$(color cr 恢复失败) $sub_dir [ $(color cr ✕) ]"
					fi
				fi
			fi
		done < <(find "$temp_dir" -maxdepth 1 -mindepth 1 -type d \
			-not -name '.*' -not -name '*test*' -print0)
	done
}

set_config (){
	cat >.config<<-EOF
		CONFIG_KERNEL_BUILD_USER="win3gp"
		CONFIG_KERNEL_BUILD_DOMAIN="OpenWrt"
		# CONFIG_LUCI_SRCDIET is not set #压缩 Lua 源代码
		## CONFIG_LUCI_JSMIN is not set  #压缩 JavaScript 源代码
		# CONFIG_LUCI_CSSTIDY is not set #压缩 CSS 文件
	EOF
	export DEVICE_NAME="$TARGET_DEVICE"
	case "$TARGET_DEVICE" in
		x86_64)
			cat >>.config<<-EOF
			# CONFIG_LUCI_JSMIN is not set  #压缩 JavaScript 源代码
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
			EOF
			lan_ip "192.168.2.150"
			echo "FIRMWARE_TYPE=squashfs-combined" >> $GITHUB_ENV
			add_busybox "lsusb lspci lsscsi lsof"
			add_package "kmod-rtl8187 kmod-r8101 kmod-r8125 kmod-r8126 kmod-r8152 kmod-r8186 kmod-rtl8xxxu"
			;;
		r[124]*)
			cat >>.config<<-EOF
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
				r1*) echo "CONFIG_TARGET_rockchip_armv8_DEVICE_xunlong_orangepi-$TARGET_DEVICE=y" >>.config ;;
				*) echo "CONFIG_TARGET_rockchip_armv8_DEVICE_friendlyarm_nanopi-$TARGET_DEVICE=y" >>.config ;;
			esac
			lan_ip "192.168.2.1"
			echo "FIRMWARE_TYPE=sysupgrade" >> $GITHUB_ENV
			;;
		newifi-d2)
			cat >>.config<<-EOF
			CONFIG_TARGET_ramips=y
			CONFIG_TARGET_ramips_mt7621=y
			CONFIG_TARGET_ramips_mt7621_DEVICE_d-team_newifi-d2=y
			EOF
			lan_ip "192.168.2.1"
			export DEVICE_NAME="Newifi-D2"
			echo "FIRMWARE_TYPE=sysupgrade" >> $GITHUB_ENV
			add_package "automount autosamba luci-app-diskman luci-app-usb-printer"
			;;
		phicomm_k2p)
			cat >>.config<<-EOF
			CONFIG_TARGET_ramips=y
			CONFIG_TARGET_ramips_mt7621=y
			CONFIG_TARGET_ramips_mt7621_DEVICE_phicomm_k2p=y
			EOF
			lan_ip "192.168.1.1"
			export DEVICE_NAME="Phicomm-K2P"
			echo "FIRMWARE_TYPE=sysupgrade" >> $GITHUB_ENV
			;;
		asus_rt-n16)
			if [[ "${REPO_BRANCH#*-}" = "18.06" ]]; then
				cat >>.config<<-EOF
				CONFIG_TARGET_brcm47xx=y
				CONFIG_TARGET_brcm47xx_mips74k=y
				CONFIG_TARGET_brcm47xx_mips74k_DEVICE_asus_rt-n16=y
				EOF
			else
				cat >>.config<<-EOF
				CONFIG_TARGET_bcm47xx=y
				CONFIG_TARGET_bcm47xx_mips74k=y
				CONFIG_TARGET_bcm47xx_mips74k_DEVICE_asus_rt-n16=y
				EOF
			fi
			lan_ip "192.168.2.130"
			export DEVICE_NAME="Asus-RT-N16"
			echo "FIRMWARE_TYPE=n16" >> $GITHUB_ENV
			;;
		armvirt-64-default)
			cat >>.config<<-EOF
			CONFIG_TARGET_armvirt=y
			CONFIG_TARGET_armvirt_64=y
			CONFIG_TARGET_armvirt_64_Default=y
			EOF
			lan_ip "192.168.2.110"
			echo "FIRMWARE_TYPE=$TARGET_DEVICE" >> $GITHUB_ENV
			;;
	esac
	[[ $TARGET_DEVICE =~ k2p|d2 ]] || {
		add_package "automount autosamba luci-app-diskman luci-app-poweroff luci-app-filebrowser luci-app-nlbwmon luci-app-bypass luci-app-openclash luci-app-passwall2 luci-app-simplenetwork luci-app-tinynote luci-app-uhttpd luci-app-eqos luci-app-usb-printer luci-app-dockerman luci-app-softwarecenter diffutils patch" "luci-app-qbittorrent luci-app-transmission luci-app-aria2 luci-app-deluge"
	}
	add_package "autocore opkg luci-app-arpbind luci-app-ddnsto luci-app-ssr-plus luci-app-passwall luci-app-upnp luci-app-ttyd luci-app-timedtask luci-app-ksmbd luci-app-wizard luci-app-accesscontrol-plus luci-app-eqosplus" luci-app-easymesh
}

deploy_cache() {
	local TOOLS_HASH=$(git log --pretty=tformat:"%h" -n1 tools toolchain)
	CACHE_NAME="$SOURCE_NAME-${REPO_BRANCH#*-}-$TOOLS_HASH-$ARCH"
	echo "CACHE_NAME=$CACHE_NAME" >> $GITHUB_ENV
	if grep -q "$CACHE_NAME" ../xa ../xc; then
		ls ../*"$CACHE_NAME"* >/dev/null 2>&1 || {
			echo -e "$(color cy '下载tz-cache')\c"; begin_time=$(date '+%H:%M:%S')
			wget -qc -t=3 -P ../ "$(grep -l "$CACHE_NAME" ../xa ../xc | head -1 | xargs grep -m1 "$CACHE_NAME")"
			status
		}

		if ls ../*"$CACHE_NAME"* >/dev/null 2>&1; then
			echo -e "$(color cy '部署tz-cache')\c"; begin_time=$(date '+%H:%M:%S')
			if tar -I unzstd -xf ../*.tzst || tar -xf ../*.tzst; then
				grep -q "$CACHE_NAME" ../xa || {
					cp ../$CACHE_NAME-cache.tzst ../output
					echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
				}
				sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
			fi
			[ -d staging_dir ]; status
		fi
	else
		echo "CACHE_ACTIONS=true" >> $GITHUB_ENV
	fi
}

git_clone() {
	local cmd
	echo -e "$(color cy "拉取源码 $REPO ${REPO_BRANCH#*-}")\c"
	begin_time=$(date '+%H:%M:%S')
	[ "$REPO_BRANCH" ] && cmd="-b $REPO_BRANCH --single-branch"
	git clone -q $cmd $REPO_URL $REPO_FLODER # --depth 1
	status
	[[ -d $REPO_FLODER ]] && cd $REPO_FLODER || exit 1

	echo -e "$(color cy '更新软件....')\c"
	begin_time=$(date '+%H:%M:%S')
	./scripts/feeds update -a 1>/dev/null 2>&1
	./scripts/feeds install -a 1>/dev/null 2>&1
	status
	create_directory "package/A"
	set_config
}

create_directory "firmware" "output"
REPO=${REPO:-immortalwrt}
REPO_URL="https://github.com/$REPO/$REPO"
SOURCE_NAME=$(basename $(dirname $REPO_URL))
config_generate="package/base-files/files/bin/config_generate"
REPO_BRANCH=${REPO_BRANCH/main/master}
echo "REPO_BRANCH=$REPO_BRANCH" >> $GITHUB_ENV
git_clone

clone_dir vernesong/OpenClash luci-app-openclash
clone_dir xiaorouji/openwrt-passwall luci-app-passwall
clone_dir xiaorouji/openwrt-passwall2 luci-app-passwall2
clone_dir hong0980/build ddnsto luci-app-ddnsto luci-app-diskman luci-app-dockerman \
	luci-app-filebrowser luci-app-poweroff luci-app-qbittorrent luci-app-softwarecenter \
	luci-app-timedtask luci-app-tinynote luci-app-wizard luci-app-easymesh luci-lib-docker \
	aria2 luci-app-aria2 sunpanel lsscsi axel luci-app-taskplan \
	deluge luci-app-deluge python-pyxdg python-rencode python-setproctitle \
	libtorrent-rasterbar python-mako
clone_dir openwrt/packages docker dockerd containerd docker-compose runc golang nlbwmon
clone_dir sirpdboy/luci-app-partexp luci-app-partexp

if [[ $REPO_BRANCH =~ master|23|24 ]]; then
	if [[ $REPO =~ openwrt ]]; then
		delpackage "dnsmasq"
		create_directory "package/emortal"
		clone_dir "$REPO_BRANCH" immortalwrt/immortalwrt emortal bcm27xx-utils
		clone_dir "$REPO_BRANCH" immortalwrt/luci luci-base luci-mod-status luci-app-homeproxy
		add_package "default-settings-chn default-settings block-mount kmod-nf-nathelper kmod-nf-nathelper-extra luci-light luci-app-cpufreq luci-app-package-manager luci-compat luci-lib-base luci-lib-ipkg"
	fi
	clone_dir nikkinikki-org/OpenWrt-nikki nikki luci-app-nikki
	add_package "axel luci-app-gecoosac luci-app-taskplan" #luci-app-istorex luci-app-partexp
	# git_diff "feeds/luci/collections/luci-lib-docker" "feeds/luci/applications/luci-app-dockerman"
	clone_dir fw876/helloworld luci-app-ssr-plus shadow-tls shadowsocks-libev shadowsocksr-libev mosdns lua-neturl dns2socks-rust
	[[ $TARGET_DEVICE =~ k2p|d2 ]] || add_package "luci-app-homeproxy luci-app-nikki"
	[[ $REPO_BRANCH =~ master ]] && rm package/*/luci-app-passwall2/htdocs/luci-static/resources/qrcode.min.js
else
	clone_url "fw876/helloworld xiaorouji/openwrt-passwall-packages"
	create_directory "package/network/config/firewall4" "package/utils/ucode" "package/network/utils/fullconenat-nft" "package/libs/libmd" "package/kernel/bpf-headers"
	clone_dir coolsnowwolf/lede automount ppp busybox parted r8101 r8125 r8168 firewall openssl \
		# bpf-headers firewall4 ucode fullconenat fullconenat-nft libmd
	# clone_dir coolsnowwolf/packages bash btrfs-progs gawk jq nginx-util pciutils curl
	[[ "$REPO_BRANCH" =~ 21 ]] && {
		git_apply "https://raw.githubusercontent.com/hong0980/diy/refs/heads/master/openwrt-21.02-dmesg.js.patch" "feeds/luci"
		git_apply "https://raw.githubusercontent.com/hong0980/diy/refs/heads/master/openwrt-21.02-syslog.js.patch" "feeds/luci"
	}
	curl -sSo package/kernel/linux/modules/netfilter.mk \
		https://raw.githubusercontent.com/coolsnowwolf/lede/refs/heads/master/package/kernel/linux/modules/netfilter.mk
	curl -sSo include/openssl-module.mk \
		https://raw.githubusercontent.com/coolsnowwolf/lede/refs/heads/master/include/openssl-module.mk
	sed -i '/deluge/d' .config
	rm -rf package/A/python-mako
fi

delpackage "luci-app-filetransfer luci-app-turboacc"
clone_dir sbwml/openwrt_helloworld shadowsocks-rust xray-core sing-box
clone_dir kiddin9/kwrt-packages chinadns-ng geoview lua-maxminddb luci-app-bypass luci-app-nlbwmon luci-app-arpbind \
	luci-app-pushbot luci-app-store luci-app-syncdial luci-lib-taskd luci-lib-xterm qBittorrent-static taskd trojan-plus \
	gecoosac luci-app-gecoosac luci-app-quickstart luci-app-accesscontrol-plus luci-app-advancedplus \
 	luci-app-eqosplus luci-app-istorex

wget -qO package/base-files/files/etc/banner git.io/JoNK8
color cy "自定义设置.... "
# sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
sed -i "s/ImmortalWrt/OpenWrt/g" {$config_generate,include/version.mk} || true
sed -i 's|/bin/login|/bin/login -f root|' feeds/packages/utils/ttyd/files/ttyd.config
REPLACEMENT=$([[ $SOURCE_NAME == openwrt ]] && echo "" || echo "${SOURCE_NAME}/")
sed -i "s|^\(OPENWRT_RELEASE.*%C\)\(.*\)|\1 ${REPLACEMENT}$(TZ=UTC-8 date +%m月%d日)\2|" package/*/*/*/lib/os-release || true
# sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk || true

settings="
uci -q set upnpd.config.enabled='1'
uci -q commit upnpd
uci -q set system.@system[0].hostname='OpenWrt'
uci -q commit system
uci -q set luci.main.lang='zh_cn'
uci -q set luci.main.mediaurlbase='/luci-static/bootstrap'
uci -q commit luci
sed -Ei 's/^(root:).*/\1\$5\$920qxtdc.ivTdd2R\$LHAFosdPCdYpPJiNnz3k7i.6VKiPnfFVPvXIj2pQth2:20227:0:99999:7:::/' /etc/shadow
exit 0
"
sed -i '/^exit/d' package/emortal/default-settings/files/99-default-settings-chinese
echo -e "$settings" >> package/emortal/default-settings/files/99-default-settings-chinese

xc=$(find_first_dir "package/A feeds" "qBittorrent-static")
[[ -d $xc ]] && sed -Ei "s/(PKG_VERSION:=).*/\1${qb_version:-4.5.2_v2.0.8}/" $xc/Makefile
sed -Ei \
	-e 's|../../luci.mk|$(TOPDIR)/feeds/luci/luci.mk|' \
	-e 's?include ../(lang|devel)?include $(TOPDIR)/feeds/packages/\1?' \
	-e "s/((^| |    )(PKG_HASH|PKG_MD5SUM|PKG_MIRROR_HASH|HASH):=).*/\1skip/" \
	package/A/*/Makefile 2>/dev/null

[ -f feeds/packages/net/ariang/Makefile ] && {
	sed -Ei \
		-e 's/(PKG_HASH:=).*/\1skip/' \
		-e 's/(PKG_VERSION:=).*/\11.3.10/' \
		feeds/packages/net/ariang/Makefile
}

[ -f feeds/luci/applications/luci-app-transmission/Makefile ] && \
	sed -i 's/transmission-daemon/transmission-daemon +transmission-web-control/' feeds/luci/applications/luci-app-transmission/Makefile

find {package/A,feeds/luci/applications}/luci-app*/po -type d 2>/dev/null | while read p; do
	if [[ -d $p/zh-cn && ! -e $p/zh_Hans ]]; then
		ln -s zh-cn "$p/zh_Hans" 2>/dev/null
	elif [[ -d $p/zh_Hans && ! -e $p/zh-cn ]]; then
		ln -s zh_Hans "$p/zh-cn" 2>/dev/null
	fi
done

[[ $REPO_BRANCH =~ master ]] && sed -i '/qbittorrent/d' .config
echo -e "$(color cy '更新配置....')\c"
begin_time=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status

LINUX_VERSION=$(sed -nr 's/CONFIG_LINUX_(.*)=y/\1/p' .config | tr '_' '.')
sed -i "/IMG_PREFIX:/ {s/=/=$SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-\$(shell TZ=UTC-8 date +%m%d-%H%M)-/}" include/image.mk
# sed -Ei 's/# (CONFIG_.*_COMPRESS_UPX) is not set/\1=y/' .config && make defconfig 1>/dev/null 2>&1
ARCH=$(sed -nr 's/CONFIG_ARCH="(.*)"/\1/p' .config)

echo "ARCH=$ARCH" >> $GITHUB_ENV
echo "CLEAN=false" >> $GITHUB_ENV
echo "UPLOAD_BIN_DIR=false" >> $GITHUB_ENV
echo "UPLOAD_COWTRANSFER=false" >> $GITHUB_ENV
echo "UPLOAD_WETRANSFER=false" >> $GITHUB_ENV
echo "LINUX_VERSION_ARCH=$LINUX_VERSION-$ARCH" >> $GITHUB_ENV
# echo "UPLOAD_FIRMWARE=false" >> $GITHUB_ENV
# echo "UPLOAD_PACKAGES=false" >> $GITHUB_ENV
# echo "UPLOAD_SYSUPGRADE=false" >> $GITHUB_ENV

deploy_cache
echo -e "$(color cy 当前机型) $(color cb $SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-${DEVICE_NAME})"
echo -e "\e[1;35m脚本运行完成！\e[0m"
