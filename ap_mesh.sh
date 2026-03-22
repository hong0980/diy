#!/bin/sh
. /lib/functions.sh
LAN_IP="${1:-192.168.2.2}"
GATEWAY="192.168.2.1"
WIFI_SSID_24G="k2p-341A"
WIFI_SSID_5G="k2p-5g-341A"
WIFI_PASS="86765010"
MESH_ID="HomeMesh"
MESH_PASS="$WIFI_PASS"

# 桥接 WAN 到 LAN
WAN_DEV=$(uci -q get network.wan.device 2>/dev/null \
       || uci -q get network.wan.ifname 2>/dev/null)
if [ -n "$WAN_DEV" ]; then
    echo "   将 ${WAN_DEV} 加入 br-lan ports"
    uci add_list network.@device[0].ports="$WAN_DEV"
    uci -q delete network.wan
    uci -q delete network.wan6
fi
timezone=$(uci -q get system.@system[0].timezone)
uci -q set network.lan.proto='static'
uci -q set network.lan.stp='1'
uci -q set network.lan.device='br-lan'
uci -q set network.lan.ipaddr="${LAN_IP}"
uci -q set network.lan.netmask='255.255.255.0'
uci -q set network.lan.gateway="${GATEWAY}"
uci -q del dhcp.lan.ra_slaac
uci -q del dhcp.lan.dhcpv6
uci -q set dhcp.lan.ignore='1'
uci -q add_list network.lan.dns="${GATEWAY}"
uci -q set upnpd.config.enabled='0'

echo "== 配置无线 (802.11k/v/r + Mesh) =="
config_load wireless

wifi_iface() {
    local iface="$1" dev band mode
    config_get mode "$iface" mode
    [ "$mode" = "ap" ] || return
    config_get dev "$iface" device
    config_get band "$dev" band
    case "$band" in
        5g|5GHz|a|an)
            echo "   [5G AP] $iface -> ssid: ${WIFI_SSID_5G}"
            uci -q set wireless."$iface".ssid="${WIFI_SSID_5G}"
            ;;
        2g|2.4GHz|b|bg|bgn)
            echo "   [2.4G AP] $iface -> ssid: ${WIFI_SSID_24G}"
            uci -q set wireless."$iface".ssid="${WIFI_SSID_24G}"
            ;;
        *)
            echo "   [警告] $iface 未识别的 band: '$band'，跳过 SSID 设置"
            ;;
    esac
    uci -q set wireless."$iface".encryption='psk2+ccmp'
    uci -q set wireless."$iface".key="${WIFI_PASS}"
    uci -q set wireless."$iface".ieee80211k='1'
    uci -q set wireless."$iface".ieee80211v='1'
    uci -q set wireless."$iface".ieee80211r='1'
    uci -q set wireless."$iface".ft_over_ds='1'
    uci -q set wireless."$iface".proxy_arp='1'
    uci -q set wireless."$iface".bss_transition='1'
    uci -q set wireless."$iface".wnm_sleep_mode='1'
    uci -q set wireless."$iface".rrm_beacon_report='0'
    uci -q set wireless."$iface".ft_psk_generate_local='1'
    uci -q set wireless."$iface".wnm_sleep_mode_no_keys='1'
    uci -q set wireless."$iface".time_zone="${timezone}"
}

wifi_device() {
    local dev="$1" band
    config_get band "$dev" band
    uci -q set wireless."$dev".cell_density='0'
    case "$band" in
        5g|5GHz|a|an) ;;
        *) return ;;
    esac
    echo "   [Mesh] 在 $dev (band: $band) 创建 mesh_backhaul"
    uci -q delete wireless.mesh_backhaul
    uci -q set wireless.mesh_backhaul="wifi-iface"
    uci -q set wireless.mesh_backhaul.device="$dev"
    uci -q set wireless.mesh_backhaul.mode='mesh'
    uci -q set wireless.mesh_backhaul.mesh_id="${MESH_ID}"
    uci -q set wireless.mesh_backhaul.network='lan'
    uci -q set wireless.mesh_backhaul.encryption='sae'
    uci -q set wireless.mesh_backhaul.key="${MESH_PASS}"
    uci -q set wireless.mesh_backhaul.mesh_fwding='1'
    uci -q set wireless.mesh_backhaul.mesh_rssi_threshold='-75'
    uci -q set wireless.mesh_backhaul.disabled='0'
    uci -q set wireless.mesh_backhaul.time_zone="${timezone}"
}

config_foreach wifi_iface wifi-iface
config_foreach wifi_device wifi-device

# ====== 系统配置 ======
echo "== 配置系统 =="
MAC_SUFFIX=$(cat /sys/class/net/br-lan/address | tr -d ':' | tr 'a-z' 'A-Z' | tail -c 7)
uci -q set system.@system[0].hostname="OpenWrt-${LAN_IP##*.}-${MAC_SUFFIX}"

echo "== 关闭防火墙和多余服务 =="
/etc/init.d/firewall stop
/etc/init.d/firewall disable
/etc/init.d/dawn stop
/etc/init.d/dawn disable
/etc/init.d/odhcpd stop
/etc/init.d/odhcpd disable

echo "== 提交配置 =="
uci commit network
uci commit wireless
uci commit system
uci commit dhcp

echo ""
echo "== 配置完成！ =="
echo "   LAN IP:    ${LAN_IP}"
echo "   网关/DNS:  ${GATEWAY}"
echo "   2.4G SSID: ${WIFI_SSID_24G}"
echo "   5G SSID:   ${WIFI_SSID_5G}"
echo "   Mesh ID:   ${MESH_ID}"
echo "   WAN 设备:  ${WAN_DEV:-未检测}"
echo ""
echo "=========================================="
echo "   配置已全部完成！"
echo "=========================================="
echo ""
echo "请选择后续操作："
echo "  [R] 安全重启 (reboot) - 应用所有配置"
echo "  [N] 不做任何操作，直接退出"
echo ""
echo -n "请输入选项 (R/N): "
read choice

case "$choice" in
    [Rr])
        echo ""
        echo "正在执行安全重启..."
        echo "所有服务将正常关闭，系统将在3秒后重启"
        sleep 3
        sync
        echo "系统重启中..."
        reboot
        ;;
    [Nn]|*)
        echo ""
        echo "直接退出，系统保持运行。"
        ;;
esac

echo ""
echo "脚本执行完毕。"
exit 0
