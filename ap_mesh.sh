#!/bin/sh
. /lib/functions.sh

PRESET_IP="${1:-192.168.2.2}"
if echo "$2" | grep -q '^[0-9]\+$'; then
    PRESET_CH="$2"
else
    PRESET_CH="36"
fi

MESH_ID="HomeMesh"
WIFI_PASS="86765010"
MESH_PASS="$WIFI_PASS"
GATEWAY="192.168.2.1"
WIFI_SSID_24G="k2p-341A"
WIFI_SSID_5G="k2p-5g-341A"

clear
echo "================================================="
echo "       OpenWrt AP & Mesh 一键部署"
echo "================================================="
echo "【当前预设值】"
echo "  - 预设 IP:    ${PRESET_IP}"
echo "  - 5G 信道:    ${PRESET_CH}"
echo "-------------------------------------------------"
printf "是否需要修改预设值？(y/n, 回车跳过): "
read change_confirm

LAN_IP="$PRESET_IP"
AP_5G_CHANNEL="$PRESET_CH"

if [ "$change_confirm" = "y" ] || [ "$change_confirm" = "Y" ]; then
    printf "请输入新 IP [%s]: " "$PRESET_IP"
    read USER_IP
    LAN_IP="${USER_IP:-$PRESET_IP}"
    printf "请输入新 5G 信道 [%s]: " "$PRESET_CH"
    read USER_CH
    AP_5G_CHANNEL="${USER_CH:-$PRESET_CH}"
fi

printf "确认写入配置并关闭防火墙/DHCP？(y/n): "
read final_confirm
case "$final_confirm" in [yY]) echo "正在批处理配置..." ;; *) exit 0 ;; esac

timezone=$(uci -q get system.@system[0].timezone)
iface_mac=$(cat /sys/class/net/br-lan/address | tr -d ':')
WAN_DEV=$(uci -q get network.wan.device 2>/dev/null || uci -q get network.wan.ifname 2>/dev/null)

uci -q batch <<EOF
$( [ -n "$WAN_DEV" ] && echo "add_list network.@device[0].ports='$WAN_DEV'" )
$( [ -n "$WAN_DEV" ] && echo "delete network.wan" )
$( [ -n "$WAN_DEV" ] && echo "delete network.wan6" )
set network.lan.proto='static'
set network.lan.stp='1'
set network.lan.device='br-lan'
set network.lan.ipaddr='${LAN_IP}'
set network.lan.gateway='${GATEWAY}'
add_list network.lan.dns='${GATEWAY}'
set network.lan.netmask='255.255.255.0'

del dhcp.lan.ra
del dhcp.lan.max_preferred_lifetime
del dhcp.lan.max_valid_lifetime
set dhcp.lan.ignore='1'
set dhcp.lan.ra_manage='0'
set dhcp.lan.dynamicdhcp='0'
set upnpd.config.enabled='0'
commit network
commit dhcp
commit upnpd
EOF

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
set wireless.${iface}.wnm_sleep_mode='1'
set wireless.${iface}.rrm_beacon_report='0'
set wireless.${iface}.ft_psk_generate_local='1'
set wireless.${iface}.wnm_sleep_mode_no_keys='1'
set wireless.${iface}.time_zone='${timezone}'
set wireless.${iface}.mobility_domain='4f57'
set wireless.${iface}.nasid='${iface_mac}'
set wireless.${iface}.fast_transition='1'
EOF

    case "${band}" in
        5g|5GHz|a|an)   uci -q set wireless."${iface}".ssid="${WIFI_SSID_5G}"  ;;
        2g|2.4GHz|b|bg) uci -q set wireless."${iface}".ssid="${WIFI_SSID_24G}" ;;
    esac
}

wifi_device() {
    local dev="$1" band
    config_get band "$dev" band
    uci -q set wireless."$dev".cell_density='0'

    case "$band" in 5g|5GHz|a|an) ;; *) return ;; esac
    uci -q set wireless."$dev".channel="${AP_5G_CHANNEL}"

    uci -q batch <<EOF
delete wireless.mesh0
set wireless.mesh0='wifi-iface'
set wireless.mesh0.mode='mesh'
set wireless.mesh0.disabled='0'
set wireless.mesh0.network='lan'
set wireless.mesh0.device="$dev"
set wireless.mesh0.mesh_fwding='1'
set wireless.mesh0.encryption='sae'
set wireless.mesh0.key="$MESH_PASS"
set wireless.mesh0.mesh_id="$MESH_ID"
set wireless.mesh0.time_zone="$timezone"
set wireless.mesh0.mesh_rssi_threshold='-75'
EOF
}

config_foreach wifi_iface wifi-iface
config_foreach wifi_device wifi-device

MAC_SUFFIX=$(echo "$iface_mac" | tr 'a-z' 'A-Z' | awk '{print substr($0, length($0)-5)}')
uci -q set system.@system[0].hostname="OpenWrt-${LAN_IP##*.}-${MAC_SUFFIX}"

uci -q commit system
uci -q commit wireless

/etc/init.d/dawn     disable 1>/dev/null 2>&1 && /etc/init.d/dawn     stop 1>/dev/null 2>&1
/etc/init.d/odhcpd   disable 1>/dev/null 2>&1 && /etc/init.d/odhcpd   stop 1>/dev/null 2>&1
/etc/init.d/firewall disable 1>/dev/null 2>&1 && /etc/init.d/firewall stop 1>/dev/null 2>&1

echo "-------------------------------------------------"
echo "配置完毕！主机名: OpenWrt-${LAN_IP##*.}-${MAC_SUFFIX}"
printf "是否立即重启？(y/n): "
read rb
[ "$rb" = "y" ] || [ "$rb" = "Y" ] && sync && reboot
