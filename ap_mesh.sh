#!/bin/sh
. /lib/functions.sh

MESH_ID="HomeMesh"
WIFI_PASS="86765010"
MESH_PASS="$WIFI_PASS"
WIFI_SSID_24G="k2p-341A"
WIFI_SSID_5G="k2p-5g-341A"
PRESET_CH="36"
iface_mac=$(cat /sys/class/net/br-lan/address | tr -d ':')
MAC_SUFFIX=$(echo "$iface_mac" | tr 'a-z' 'A-Z' | awk '{print substr($0, length($0)-5)}')

clear
echo "================================================="
echo "       OpenWrt AP & Mesh 一键部署"
echo "================================================="
echo "【当前预设值】"
echo " - 主机名      : OpenWrt-${MAC_SUFFIX}"
echo " - 5G 信道     : ${PRESET_CH}"
echo " - Mesh ID     : ${MESH_ID}"
echo " - 2.4G SSID   : ${WIFI_SSID_24G}"
echo " - 5G SSID     : ${WIFI_SSID_5G}"
echo "-------------------------------------------------"
printf "是否需要修改预设值？(y/n, 回车跳过): "
read change_confirm

AP_5G_CHANNEL="$PRESET_CH"
if [ "$change_confirm" = "y" ] || [ "$change_confirm" = "Y" ]; then
    printf "请输入新 5G 信道 [%s]: " "$PRESET_CH"
    read USER_CH
    AP_5G_CHANNEL="${USER_CH:-$PRESET_CH}"
fi

printf "确认写入配置并关闭防火墙/DHCP？(y/n): "
read final_confirm
case "$final_confirm" in [yY]) echo "正在配置..." ;; *) exit 0 ;; esac

timezone=$(uci -q get system.@system[0].timezone 2>/dev/null)
WAN_DEV=$(uci -q get network.wan.device 2>/dev/null || uci -q get network.wan.ifname 2>/dev/null)

if [ -n "$WAN_DEV" ]; then
    BR_DEV=$(uci -q get network.lan.device 2>/dev/null)
    if [ -n "$BR_DEV" ]; then
        uci -q add_list "network.${BR_DEV}.ports=${WAN_DEV}" 2>/dev/null || true
    fi
    uci -q delete network.wan
    uci -q delete network.wan6
fi

uci -q batch <<EOF
set network.lan.proto='dhcp'
set network.lan.stp='1'
commit network
EOF

uci -q del dhcp.lan.ra_slaac
uci -q del dhcp.lan.dhcpv6
uci -q set dhcp.lan.ignore='1'
uci -q set dhcp.lan.ra='relay'
uci -q commit dhcp

/etc/init.d/dnsmasq  disable 1>/dev/null 2>&1 && /etc/init.d/dnsmasq  stop 1>/dev/null 2>&1
/etc/init.d/upnpd    disable 1>/dev/null 2>&1 && /etc/init.d/upnpd    stop 1>/dev/null 2>&1
/etc/init.d/dawn     disable 1>/dev/null 2>&1 && /etc/init.d/dawn     stop 1>/dev/null 2>&1
/etc/init.d/odhcpd   disable 1>/dev/null 2>&1 && /etc/init.d/odhcpd   stop 1>/dev/null 2>&1
/etc/init.d/firewall disable 1>/dev/null 2>&1 && /etc/init.d/firewall stop 1>/dev/null 2>&1

config_load wireless

wifi_iface() {
    local iface="$1" dev band mode
    config_get mode "$iface" mode
    [ "$mode" = "ap" ] || return

    config_get dev  "$iface" device
    config_get band "$dev"   band

    uci -q batch <<EOF
set wireless.${iface}.encryption='psk2+ccmp'
set wireless.${iface}.key='${WIFI_PASS}'
set wireless.${iface}.ieee80211k='1'
set wireless.${iface}.ieee80211v='1'
set wireless.${iface}.ieee80211r='1'
set wireless.${iface}.ft_over_ds='1'
set wireless.${iface}.proxy_arp='1'
set wireless.${iface}.bss_transition='1'
set wireless.${iface}.ft_psk_generate_local='1'
set wireless.${iface}.mobility_domain='4f57'
set wireless.${iface}.nasid='${iface_mac}'
EOF

    uci -q delete wireless.${iface}.wnm_sleep_mode_no_keys
    uci -q delete wireless.${iface}.fast_transition

    case "${band}" in
        5g|5GHz|a|an)
            uci -q set wireless."${iface}".ssid="${WIFI_SSID_5G}"
            ;;
        2g|2.4GHz|b|bg)
            uci -q set wireless."${iface}".ssid="${WIFI_SSID_24G}"
            ;;
    esac
}

wifi_device() {
    local dev="$1" band
    config_get band "$dev" band

    uci -q set wireless."$dev".cell_density='0'
    uci -q set wireless."$dev".time_zone="${timezone}"

    case "$band" in 5g|5GHz|a|an) ;; *) return ;; esac
    uci -q set wireless."$dev".channel="${AP_5G_CHANNEL}"

    local mesh_iface="mesh_${dev}"
    uci -q batch <<EOF
delete wireless.${mesh_iface}
set wireless.${mesh_iface}='wifi-iface'
set wireless.${mesh_iface}.mode='mesh'
set wireless.${mesh_iface}.disabled='0'
set wireless.${mesh_iface}.network='lan'
set wireless.${mesh_iface}.device='${dev}'
set wireless.${mesh_iface}.mesh_fwding='1'
set wireless.${mesh_iface}.encryption='sae'
set wireless.${mesh_iface}.key='${MESH_PASS}'
set wireless.${mesh_iface}.mesh_id='${MESH_ID}'
set wireless.${mesh_iface}.mesh_rssi_threshold='-65'
EOF

}

config_foreach wifi_iface wifi-iface
config_foreach wifi_device wifi-device

# ==================== 系统配置 ====================
uci -q set system.@system[0].hostname="OpenWrt-${MAC_SUFFIX}"
uci -q commit system
uci -q commit wireless

echo "================================================="
echo "AP & Mesh 配置完成！"
echo "================================================="
echo "【配置摘要】"
echo " - 工作模式   : 纯 Dumb AP + Mesh（LAN DHCP 客户端）"
echo " - 主机名     : OpenWrt-${MAC_SUFFIX}"
echo " - 2.4G SSID  : ${WIFI_SSID_24G}"
echo " - 5G SSID    : ${WIFI_SSID_5G}"
echo " - 5G 信道    : ${AP_5G_CHANNEL}"
echo " - Mesh ID    : ${MESH_ID}"
echo "================================================="
echo ""
echo "【重要提醒】"
echo "1. 请用网线将本设备任意 LAN 口 连接到 上级路由器的 LAN 口"
echo "2. 重启后，在上级路由器的「客户端列表」或「DHCP 租约」中查找主机名："
echo "   → OpenWrt-Mesh-${MAC_SUFFIX}"
echo "3. 推荐通过 .local 访问： http://OpenWrt-Mesh-${MAC_SUFFIX}.local"
echo ""
echo "【Mesh 查看命令】"
echo "   iw dev mesh_* info"
echo "   iw dev mesh_* station dump"
echo "   iw dev mesh_* mpath dump"
echo "================================================="

printf "是否立即重启？(y/n): "
read rb
[ "$rb" = "y" ] || [ "$rb" = "Y" ] && uci commit && sync && reboot
