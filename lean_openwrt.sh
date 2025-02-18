#!/usr/bin/env bash
curl -sL https://raw.githubusercontent.com/klever1988/nanopi-openwrt/zstd-bin/zstd | sudo tee /usr/bin/zstd > /dev/null
qb_version=$(curl -sL https://api.github.com/repos/userdocs/qbittorrent-nox-static/releases | grep -oP '(?<="browser_download_url": ").*?release-\K(.*?)(?=/)' | sort -Vr | uniq | awk 'NR==1')
for page in 1 2; do
	curl -sL "$GITHUB_API_URL/repos/hong0980/Actions-OpenWrt/releases?page=$page"
done | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' > xa
curl -sL https://api.github.com/repos/hong0980/OpenWrt-Cache/releases | grep -oP '"browser_download_url": "\K[^"]*cache[^"]*' >xc
# curl -s https://api.github.com/repos/kiddin9/kwrt-packages/contents/ | jq -r '.[] | select(.type == "dir" and (.name | startswith(".") | not)) | .name' > kiddin9_packages

mkdir firmware output &>/dev/null

if [[ $cache_Release == 'true' ]]; then
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

if [[ $CACHE_ACTIONS == 'true' ]]; then
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
		echo "OUTPUT_RELEASE=true" >> $GITHUB_ENV
		sed -i 's/ $(tool.*\/stamp-compile)//' Makefile
	fi
	echo "SAVE_CACHE=" >> $GITHUB_ENV
	exit 0
fi

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
	for dir in $@; do
		mkdir -p "$dir" 2>/dev/null || return 1
	done
}

addpackage() {
	for z in $@; do
		[[ $z =~ ^# ]] || echo "CONFIG_PACKAGE_$z=y" >>.config
	done
}

delpackage() {
	for z in $@; do
		[[ $z =~ ^# ]] || echo "# CONFIG_PACKAGE_$z is not set" >> .config
	done
}

_printf() {
	IFS=' ' read -r param1 param2 param3 param4 param5 <<< "$1"
	printf "%s %-40s %s %s %s\n" "$param1" "$param2" "$param3" "$param4" "$param5"
}

lan_ip() {
	sed -i '/lan) ipad/s/".*"/"'"${IP:-$1}"'"/' package/base-files/*/bin/config_generate
}

git_diff() {
	[[ $# -lt 1 ]] && return
	for i in $@; do
		original_dir=$(pwd)
		if [[ $i =~ ^feeds ]]; then
			cd $(cut -d'/' -f1-2 <<< "$i") || return 1
			i=$(cut -d'/' -f3- <<< "$i")
		fi

		if [[ -d "$i" || -f "$i" ]]; then
			patch_file="$GITHUB_WORKSPACE/firmware/${REPO_BRANCH}-${i##*/}.patch"
			git diff -- "$i" > "$patch_file"
			[[ -s "$patch_file" ]] || rm "$patch_file"
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
	create_directory "package/A"
	[[ $# -lt 1 ]] && return
	local repo_url branch temp_dir=$(mktemp -d)
	trap 'rm -rf "$temp_dir"' EXIT INT TERM
	if [[ $1 == */* ]]; then
		repo_url="$1"
		shift
	else
		branch="-b $1 --single-branch"
		repo_url="$2"
		shift 2
	fi
	[[ $repo_url =~ ^https?:// ]] || repo_url="https://github.com/$repo_url"

	git clone -q $branch --depth 1 "$repo_url" $temp_dir 2>/dev/null || {
		_printf "$(color cr 拉取) $repo_url [ $(color cr ✕) ]"
		return 1
	}

	for target_dir in $@; do
		local source_dir current_dir destination_dir
		if [[ ${repo_url##*/} == ${target_dir} ]]; then
			mv -f ${temp_dir} ${target_dir}
			source_dir=${target_dir}
		else
			source_dir=$(find_first_dir "$temp_dir" "$target_dir")
		fi
		[[ -d "$source_dir" ]] || continue
		current_dir=$(find_first_dir "package feeds target" "$target_dir")
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
		# CONFIG_LUCI_JSMIN is not set  #压缩 JavaScript 源代码
		# CONFIG_LUCI_CSSTIDY is not set #压缩 CSS 文件
	EOF
	export DEVICE_NAME="$TARGET_DEVICE"
	case "$TARGET_DEVICE" in
		x86_64)
			cat >>.config<<-EOF
			CONFIG_TARGET_x86=y
			CONFIG_TARGET_x86_64=y
			CONFIG_TARGET_x86_64_DEVICE_generic=y
			CONFIG_TARGET_ROOTFS_PARTSIZE=$PARTSIZE
			CONFIG_BUILD_NLS=y
			CONFIG_GRUB_IMAGES=y
			CONFIG_BUILD_PATENTED=y
			# CONFIG_GRUB_EFI_IMAGES is not set
			EOF
			lan_ip "192.168.2.150"
			echo "FIRMWARE_TYPE=squashfs-combined" >> $GITHUB_ENV
			addpackage "luci-app-dockerman luci-app-diskman luci-app-poweroff luci-app-qbittorrent lscpu lsusb lsscsi pciutils pv screen #luci-app-deluge #luci-app-netdata #luci-app-store #nano #git-http #subversion-client #unixodbc #htop "
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
			addpackage "
			luci-app-cpufreq luci-app-dockerman luci-app-qbittorrent luci-app-turboacc
			luci-app-passwall2 #luci-app-easymesh luci-app-store luci-app-netdata
			luci-app-deluge htop lscpu lsscsi lsusb #nano screen zstd pv
			#AmuleWebUI-Reloaded #subversion-client #unixodbc #git-http
			"
			# sed -i '/KERNEL_PATCHVER/s/=.*/=5.4/' target/linux/rockchip/Makefile
			# clone_dir 'openwrt-18.06-k5.4' immortalwrt/immortalwrt uboot-rockchip arm-trusted-firmware-rockchip-vendor
			sed -i "/interfaces_lan_wan/s/'eth1' 'eth0'/'eth0' 'eth1'/" target/linux/rockchip/*/*/*/*/02_network
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
			cat >>.config<<-EOF
			CONFIG_TARGET_bcm47xx=y
			CONFIG_TARGET_bcm47xx_mips74k=y
			CONFIG_TARGET_bcm47xx_mips74k_DEVICE_asus_rt-n16=y
			EOF
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
			sed -i '/easymesh/d' .config
			addpackage "attr bash blkid brcmfmac-firmware-43430-sdio brcmfmac-firmware-43455-sdio
			btrfs-progs cfdisk chattr curl dosfstools e2fsprogs f2fs-tools f2fsck fdisk getopt
			hostpad-common htop install-program iperf3 kmod-brcmfmac kmod-brcmutil kmod-cfg80211
			kmod-fs-exfat kmod-fs-ext4 kmod-fs-vfat kmod-mac80211 kmod-rt2800-usb kmod-usb-net
			kmod-usb-net-asix-ax88179 kmod-usb-net-rtl8150 kmod-usb-net-rtl8152 kmod-usb-storage
			kmod-usb-storage-extras kmod-usb-storage-uas kmod-usb2 kmod-usb3 lm-sensors losetup
			lsattr lsblk lscpu lsscsi luci-app-adguardhome luci-app-cpufreq luci-app-dockerman
			luci-app-qbittorrent mkf2fs ntfs-3g parted pv python3 resize2fs tune2fs unzip
			uuidgen wpa-cli wpad wpad-basic xfs-fsck xfs-mkf"

			dc=$(find_first_dir "package/A feeds" "luci-app-cpufreq")
			[[ -d $dc ]] && {
				sed -i 's/@arm/@TARGET_armvirt_64/g' $dc/Makefile
				sed -i 's/services/system/; s/00//' $dc/luasrc/controller/cpufreq.lua
			}
			[ -d ../opt/openwrt_packit ] && {
			sed -i "s/default 160/default $PARTSIZE/" config/Config-images.in
				sed -i '{
				s|mv |mv -v |
				s|openwrt-armvirt-64-default-rootfs.tar.gz|$(ls *default-rootfs.tar.gz)|
				s|TGT_IMG=.*|TGT_IMG="${WORK_DIR}/unifreq-openwrt-${SOC}_${BOARD}_k${KERNEL_VERSION}${SUBVER}-$(date "+%Y-%m%d-%H%M").img"|
				}' ../opt/openwrt_packit/mk*.sh
				sed -i '/ KERNEL_VERSION.*flippy/ {s/KERNEL_VERSION.*/KERNEL_VERSION="5.15.4-flippy-67+"/}' ../opt/openwrt_packit/make.env
			}
			;;
	esac
	addpackage "luci-app-bypass luci-app-ddnsto luci-app-filebrowser luci-app-openclash luci-app-passwall luci-app-passwall2 luci-app-ssr-plus luci-app-timedtask luci-app-tinynote luci-app-ttyd luci-app-uhttpd luci-app-wizard luci-app-homeproxy luci-app-usb-printer luci-app-eqos diffutils patch luci-app-nikki"
	delpackage "luci-app-ddns luci-app-autoreboot luci-app-wol luci-app-vlmcsd luci-app-filetransfer luci-app-turboacc"
}

deploy_cache() {
	local TOOLS_HASH=$(git log --pretty=tformat:"%h" -n1 tools toolchain)
	export CACHE_NAME="$SOURCE_NAME-$REPO_BRANCH-$TOOLS_HASH-$ARCH"
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
	echo -e "$(color cy '拉取源码....')\c"
	begin_time=$(date '+%H:%M:%S')
	[ "$REPO_BRANCH" ] && cmd="-b $REPO_BRANCH --single-branch"
	git clone -q $cmd $REPO_URL $REPO_FLODER # --depth 1
	status
	[[ -d $REPO_FLODER ]] && cd $REPO_FLODER || exit

	echo -e "$(color cy '更新软件....')\c"
	begin_time=$(date '+%H:%M:%S')
	sed -i '/#.*helloworld/ s/^#//' feeds.conf.default
	./scripts/feeds update -a 1>/dev/null 2>&1
	./scripts/feeds install -a 1>/dev/null 2>&1
	status
	color cy "自定义设置.... "
	set_config
	wget -qO package/base-files/files/etc/banner git.io/JoNK8
}

REPO_URL="https://github.com/coolsnowwolf/lede"
SOURCE_NAME=$(basename $(dirname $REPO_URL))
git_clone

# git diff ./ >> ../output/t.patch || true
clone_dir vernesong/OpenClash luci-app-openclash
clone_dir xiaorouji/openwrt-passwall luci-app-passwall
clone_dir xiaorouji/openwrt-passwall2 luci-app-passwall2
clone_dir hong0980/build luci-app-timedtask luci-app-tinynote luci-app-poweroff luci-app-filebrowser \
	luci-app-diskman luci-app-qbittorrent luci-app-wizard luci-app-ddnsto \
	luci-app-softwarecenter luci-lib-docker luci-app-dockerman lsscsi
clone_dir sbwml/openwrt_helloworld nikki luci-app-nikki \
	luci-app-homeproxy chinadns-ng geoview sing-box trojan-plus xray-core
clone_dir kiddin9/kwrt-packages luci-app-bypass lua-maxminddb \
	#luci-app-pushbot luci-app-store luci-lib-taskd taskd luci-lib-xterm

REPO_BRANCH=$(sed -En 's/^src-git luci.*;(.*)/\1/p' feeds.conf.default)
REPO_BRANCH=${REPO_BRANCH:-18.06}
# https://github.com/userdocs/qbittorrent-nox-static/releases
xc=$(find_first_dir "package/A feeds" "qBittorrent-static")
[[ -d $xc ]] && sed -Ei "s/(PKG_VERSION:=).*/\1${qb_version:-4.5.2_v2.0.8}/" $xc/Makefile
# sed -i "/listen_https/ {s/^/#/g}" package/*/*/*/files/uhttpd.config
# sed -i 's/invalid users = root/#&/g' feeds/*/*/*/files/smb.conf.template
sed -i 's|/bin/login|/bin/login -f root|' feeds/*/*/*/files/ttyd.config
sed -i 's/option enabled.*/option enabled 1/' feeds/*/*/*/*/upnpd.config
sed -i "s/%R/-$SOURCE_NAME-$(TZ=UTC-8 date +%Y年%m月%d日)/" package/*/*/*/openwrt_release
sed -i 's/${g}.*/${a}${b}${c}${d}${e}${f}${hydrid}/g' package/lean/autocore/files/x86/autocore
sed -i "/VERSION_NUMBER/ s/if.*/if \$(VERSION_NUMBER),\$(VERSION_NUMBER),${REPO_BRANCH#*-}-SNAPSHOT)/" include/version.mk
sed -i "{
		/upnp\|openwrt_release\|shadow/d
		/uci commit system/i\uci set system.@system[0].hostname=OpenWrt
		/uci commit system/a\uci set luci.main.mediaurlbase=/luci-static/bootstrap\nuci commit luci\n[ -f '/bin/bash' ] && sed -i '/\\\/ash$/s/ash/bash/' /etc/passwd\nsed -i 's/root::.*/root:\$1\$RysBCijW\$wIxPNkj9Ht9WhglXAXo4w0:18206:0:99999:7:::/g' /etc/shadow
	}" package/lean/*/*/*default-settings
# git_apply "https://raw.githubusercontent.com/sbwml/openwrt_helloworld/refs/heads/v5/patch-luci-app-ssr-plus.patch" "feeds/helloworld"
# git_apply "https://raw.githubusercontent.com/sbwml/openwrt_helloworld/refs/heads/v5/patch-luci-app-passwall.patch" "feeds/luci/applications"
sed -Ei '{
		s|../../luci.mk|$(TOPDIR)/feeds/luci/luci.mk|
		s?include ../(lang|devel)?include $(TOPDIR)/feeds/packages/\1?
		s/((^| |    )(PKG_HASH|PKG_MD5SUM|PKG_MIRROR_HASH|HASH):=).*/\1skip/
	}' package/A/*/Makefile 2>/dev/null

find {package/A,feeds/luci/applications}/luci-app*/po \
	-type d -print0 | xargs -0 -P$(nproc) -I{} bash -c '
	dir="$1"
	if [[ -d "$dir/zh-cn" && ! -e "$dir/zh_Hans" ]]; then
		ln -sf zh-cn "$dir/zh_Hans" 2>/dev/null
	elif [[ -d "$dir/zh_Hans" && ! -e "$dir/zh-cn" ]]; then
		ln -sf zh_Hans "$dir/zh-cn" 2>/dev/null
	fi
' _ {}

echo -e "$(color cy '更新配置....')\c"
begin_time=$(date '+%H:%M:%S')
make defconfig 1>/dev/null 2>&1
status

LINUX_VERSION=$(sed -nr 's/CONFIG_LINUX_(.*)=y/\1/p' .config | tr '_' '.')
sed -i "/IMG_PREFIX:/ {s/=/=$SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-\$(shell TZ=UTC-8 date +%m%d-%H%M)-/}" include/image.mk
# sed -i -E 's/# (CONFIG_.*_COMPRESS_UPX) is not set/\1=y/' .config && make defconfig 1>/dev/null 2>&1
ARCH=$(sed -nr 's/CONFIG_ARCH="(.*)"/\1/p' .config)

echo "ARCH=$ARCH" >> $GITHUB_ENV
echo "CLEAN=false" >> $GITHUB_ENV
echo "UPLOAD_BIN_DIR=false" >> $GITHUB_ENV
echo "UPLOAD_WETRANSFER=false" >> $GITHUB_ENV
echo "UPLOAD_COWTRANSFER=false" >> $GITHUB_ENV
echo "REPO_BRANCH=${REPO_BRANCH#*-}" >> $GITHUB_ENV
echo "LINUX_VERSION_ARCH=$LINUX_VERSION-$ARCH" >> $GITHUB_ENV
# echo "UPLOAD_PACKAGES=false" >> $GITHUB_ENV
# echo "UPLOAD_FIRMWARE=false" >> $GITHUB_ENV
# echo "UPLOAD_SYSUPGRADE=false" >> $GITHUB_ENV

deploy_cache
echo -e "$(color cy 当前机型) $(color cb $SOURCE_NAME-${REPO_BRANCH#*-}-$LINUX_VERSION-${DEVICE_NAME})"
echo -e "\e[1;35m脚本运行完成！\e[0m"
