# nftables 规则编写完全指南

> 本文档结合 OpenWrt / mihomo 透明代理场景，系统讲解 nftables 规则的编写方法。

---

## 目录

1. [概述](#1-概述)
2. [核心概念](#2-核心概念)
3. [基础语法](#3-基础语法)
4. [匹配条件详解](#4-匹配条件详解)
5. [动作（Statement）详解](#5-动作statement详解)
6. [Set 集合](#6-set-集合)
7. [Hook 与优先级](#7-hook-与优先级)
8. [实战：结合 hijack.ut.js 的透明代理规则](#8-实战结合-hijackutjs-的透明代理规则)
9. [调试与排错](#9-调试与排错)
10. [iptables → nftables 对照表](#10-iptables--nftables-对照表)
11. [完整配置示例](#11-完整配置示例)

---

## 1. 概述

**nftables** 是 Linux 内核 3.13+ 引入的新一代包过滤框架，替代了传统的 iptables/ip6tables/arptables/ebtables。

### 为什么用 nftables？

| 特性 | iptables | nftables |
|------|----------|----------|
| IPv4/IPv6 统一处理 | 需要分别用 iptables/ip6tables | `inet` family 同时处理 |
| 规则性能 | 线性遍历 | 使用集合（Set）实现 O(1) 匹配 |
| 动态更新 | 原子性差 | 支持原子性规则替换 |
| 语法 | 命令行参数拼接 | 类 C 的声明式语法 |
| 调试 | 计数器分散 | 内置计数器，支持追踪 |

### 基本工作流

```
用户配置 → nft 命令 → 内核 netfilter 子系统 → 包过滤/修改
```

---

## 2. 核心概念

nftables 的规则组织采用 **四层结构**：

```
Table（表）
  └── Chain（链）
        └── Rule（规则）
              └── Expression（匹配条件 + 动作）
```

### 2.1 Table（表）

表是规则的命名空间，按 **family**（协议族）分类：

| Family | 说明 | 典型用途 |
|--------|------|---------|
| `ip` | IPv4 专用 | 纯 IPv4 过滤 |
| `ip6` | IPv6 专用 | 纯 IPv6 过滤 |
| `inet` | IPv4 + IPv6 统一 | **最常用**，同时处理双栈 |
| `arp` | ARP 协议 | ARP 过滤 |
| `bridge` | 网桥/二层 | ebtables 替代 |
| `netdev` | 网卡 ingress | 高性能网卡级过滤 |

```nft
# 创建一个同时处理 IPv4/IPv6 的表
table inet myfilter { }
```

### 2.2 Chain（链）

链是规则的容器，必须绑定到一个 **Hook**（挂载点）才能生效。

```nft
chain input {
    type filter hook input priority filter; policy accept;
    # 规则写在这里
}
```

链的属性：
- **type**：`filter`（过滤）、`nat`（地址转换）、`route`（路由标记）
- **hook**：挂载点（见第 7 节）
- **priority**：优先级（见第 7 节）
- **policy**：默认策略（`accept` / `drop`）

### 2.3 Rule（规则）

规则由 **匹配条件** + **动作** 组成：

```nft
ip saddr 192.168.1.0/24 tcp dport 22 accept
# └─ 匹配条件 ─┘  └─ 匹配条件 ─┘ └─ 动作 ─┘
```

多个条件之间是 **AND** 关系（必须同时满足）。

---

## 3. 基础语法

### 3.1 创建表

```nft
table inet mytable {
    # 链和规则放在这里
}
```

### 3.2 创建链

```nft
table inet mytable {
    chain input {
        type filter hook input priority filter; policy accept;
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

### 3.3 添加规则

```bash
# 方法1：直接写 nft 脚本文件，然后加载
nft -f /etc/nftables.conf

# 方法2：命令行逐条添加（调试时用）
nft add rule inet mytable input tcp dport 22 accept

# 方法3：插入到链的开头
nft insert rule inet mytable input tcp dport 22 accept

# 方法4：删除规则（需要 handle 号）
nft -a list ruleset          # 查看 handle 号
nft delete rule inet mytable input handle 10
```

### 3.4 注释

```nft
# 单行注释

/*
 * 多行注释
 */
```

---

## 4. 匹配条件详解

### 4.1 元数据匹配（meta）

用于匹配包的基本属性：

```nft
# 接口匹配
meta iifname "eth0"                    # 入接口名等于 eth0
meta iifname { "eth0", "eth1" }        # 入接口名在集合中
meta oifname != "lo"                   # 出接口名不是 lo

# 协议族
meta nfproto ipv4                      # IPv4
meta nfproto ipv6                      # IPv6
meta nfproto { ipv4, ipv6 }            # IPv4 或 IPv6

# 第四层协议
meta l4proto tcp                       # TCP
meta l4proto udp                       # UDP
meta l4proto { tcp, udp, icmp }        # 集合匹配

# 数据包长度
meta length > 1000                     # 包长大于 1000 字节

# 时间（需要内核支持）
meta hour "09:00"-"18:00"             # 工作时间

# 用户/组（仅 output 链有效，匹配发出进程的身份）
meta skuid { root, nobody }            # 用户 ID
meta skgid { nogroup }                 # 组 ID

# fwmark
meta mark 0x80                         # mark 精确等于 0x80
meta mark & 0xFF == 0x80               # mark 的低 8 位等于 0x80
```

### 4.2 IP 层匹配（ip / ip6）

```nft
# IPv4
ip saddr 192.168.1.100                 # 源地址精确匹配
ip saddr 192.168.1.0/24                # 源地址段匹配
ip daddr { 10.0.0.0/8, 172.16.0.0/12 } # 目标地址集合匹配
ip daddr != 127.0.0.1                  # 排除本机

# IPv6
ip6 saddr ::1                          # 本机 IPv6
ip6 saddr 2001:db8::/32                # IPv6 段
ip6 daddr { ::1, fe80::/10 }           # 集合

# IP 协议字段（与 meta l4proto 不同，这是 IP 头部的 protocol 字段）
ip protocol tcp                        # IP 协议字段 = TCP
ip6 nexthdr tcp                        # IPv6 下一个头部 = TCP

# TTL / Hop Limit
ip ttl 64                              # IPv4 TTL = 64
ip6 hoplimit 64                        # IPv6 Hop Limit = 64
```

### 4.3 FIB（转发信息库）匹配

用于查询路由表，判断目标地址的属性：

```nft
# 目标地址类型
fib daddr type local                   # 目标是本机地址
fib daddr type broadcast               # 广播地址
fib daddr type multicast               # 组播地址
fib daddr type anycast                 # 任播地址
fib daddr type { local, broadcast, multicast }  # 集合

# 源地址类型
fib saddr type != local                # 源地址不是本机

# 综合查询
fib daddr . oif type local             # 目标地址通过出接口到达本机
```

> 在 hijack.ut.js 中大量使用 `fib daddr type { local, broadcast, anycast, multicast } counter return` 来绕过本地流量。

### 4.4 传输层匹配（tcp / udp / icmp）

```nft
# TCP
tcp dport 80                           # 目标端口
tcp dport { 80, 443, 8080 }            # 端口集合
tcp dport 1024-65535                   # 端口范围
tcp sport 22                           # 源端口
tcp flags syn                          # TCP 标志位
tcp flags { syn, ack }                 # 标志位集合
tcp flags & (syn|ack) == syn           # 只设置了 SYN，没设置 ACK（新连接）
tcp option maxseg size 1460            # TCP MSS

# UDP
udp dport 53
udp sport { 123, 53 }

# ICMP
icmp type echo-request                 # IPv4 ping 请求
icmp type echo-reply                   # IPv4 ping 回复
icmpv6 type echo-request               # IPv6 ping 请求
icmpv6 type echo-reply                 # IPv6 ping 回复
icmpv6 type { echo-request, echo-reply }

# 通用传输层（th = transport header）
th dport 443                           # 匹配 TCP 或 UDP 的 443 端口
meta l4proto { tcp, udp } th dport 53  # 明确限定 TCP/UDP
```

### 4.5 连接跟踪（ct / conntrack）

```nft
# 连接状态
ct state new                           # 新连接
ct state established                   # 已建立
ct state related                       # 相关连接（如 FTP 数据通道）
ct state invalid                       # 非法/无法识别的连接
ct state { established, related }      # 集合

# 连接方向
ct direction original                  # 发起方向
ct direction reply                     # 回复方向

# 连接状态计数
ct status dnat                         # 已做 DNAT
ct status snat                         # 已做 SNAT

# 连接超时（高级）
ct expiration < 60                     # 连接将在 60 秒内过期

# 辅助连接（如 FTP、SIP）
ct helper "ftp"                        # 使用 FTP helper
```

> hijack.ut.js 中的 `ct direction reply counter return` 表示：如果是回复包，直接放行，不做代理处理。

### 4.6 以太网层匹配

```nft
ether saddr aa:bb:cc:dd:ee:ff          # 源 MAC 地址
ether daddr { aa:bb:cc:dd:ee:ff, 11:22:33:44:55:66 }  # MAC 集合
ether type ip                          # 以太网类型 = IPv4
ether type { ip, ip6 }                 # IPv4 或 IPv6
```

### 4.7 DSCP 匹配

```nft
ip dscp cs0                            # IPv4 DSCP = CS0 (0)
ip dscp { cs1, cs2, cs3 }              # DSCP 集合
ip6 dscp af11                          # IPv6 DSCP
```

### 4.8 Socket 匹配（cgroup）

```nft
# cgroup v1
meta cgroup 0x12061206                 # 匹配 cgroup ID

# cgroup v2
socket cgroupv2 level 2 "services/nikki"   # 匹配 cgroup v2 路径
socket cgroupv2 level 3 "user.slice/user-1000.session"  # 更深层级
```

> `level` 指定 cgroup 层级深度。`"services/nikki"` 是相对根 cgroup 的路径。

---

## 5. 动作（Statement）详解

### 5.1 基本控制动作

```nft
accept                                 # 接受包，停止匹配
 drop                                  # 丢弃包，静默丢弃
 reject                                # 丢弃并发送错误响应
 reject with icmp type host-unreachable
 reject with tcp reset
 return                                # 返回调用链的上一层
 jump chain_name                       # 跳转到子链，执行完后返回
 goto chain_name                       # 跳转到子链，不返回（尾调用）
```

### 5.2 NAT 动作

```nft
# DNAT（目标地址转换）—— 用于 prerouting 链
 dnat to 192.168.1.10                  # 改目标 IP
 dnat to 192.168.1.10:8080             # 改目标 IP + 端口
 dnat to :8080                         # 只改目标端口（本机）

# SNAT（源地址转换）—— 用于 postrouting 链
 snat to 203.0.113.1                   # 改源 IP
 snat to 203.0.113.1-203.0.113.10      # 源 IP 池
 snat to :1024-65535                   # 只改源端口

# MASQUERADE（动态 SNAT，自动使用出接口 IP）
 masquerade                            # 用于拨号/动态 IP 场景
 masquerade persistent                 # 同一连接始终使用同一 IP
 masquerade to :1024-65535            # 限制端口范围

# REDIRECT（重定向到本机）—— 用于 nat 链
 redirect to :8080                     # 将目标端口改为 8080（本机）
 redirect to :1053                     # DNS 劫持常用
```

> **注意**：`redirect` 和 `dnat to :port` 的区别：
> - `redirect` 自动将目标 IP 改为本机接收此包的接口 IP
> - `dnat to :port` 需要显式指定 IP

### 5.3 TPROXY 动作

```nft
# TPROXY（透明代理）—— 用于 mangle/prerouting 链
 tproxy to :7895                       # 将流量透明代理到本机 7895
 tproxy ip to :7895                    # 仅 IPv4
 tproxy ip6 to :7895                   # 仅 IPv6
```

> TPROXY 需要配合路由策略（ip rule / ip route）使用，将带有特定 mark 的流量导入本地回环。

### 5.4 Mark 设置

```nft
# 直接设置
 meta mark set 0x80

# 位操作（清空某些位，再设置）
 meta mark set meta mark & 0xFFFFFF00 | 0x80
 # 含义：保留 mark 的高 24 位，低 8 位设为 0x80

# 使用十六进制掩码
 meta mark set meta mark & 0xFFFFFFFF ^ 0xFF | 0x80
```

> hijack.ut.js 中的 `tproxy_fw_umask = fw4.hex(~tproxy_fw_mask & 0xFFFFFFFF)` 就是用来生成这个掩码的。

### 5.5 计数器与日志

```nft
counter                                # 命中次数 + 字节数计数
counter packets 0 bytes 0             # 带初始值的计数器

log                                    # 记录到内核日志
log prefix "NFT-DROP: "               # 带前缀的日志
log level debug                        # 指定日志级别
log flags all                          # 记录所有信息
```

### 5.6 集合操作

```nft
# 动态向集合添加元素
add @myset { 192.168.1.100 }

# 从集合删除元素
delete @myset { 192.168.1.100 }

# 在规则中引用集合
ip saddr @myset accept
```

### 5.7 多动作组合

一条规则可以包含多个动作，按顺序执行：

```nft
# 先计数，再设置 mark，最后接受
meta l4proto tcp counter meta mark set 0x80 accept

# 先计数，再跳转到子链
meta l4proto tcp counter jump my_subchain
```

---

## 6. Set 集合

Set 是 nftables 最强大的特性之一，可以实现 O(1) 的批量匹配。

### 6.1 命名集合（Named Set）

```nft
set my_ips {
    type ipv4_addr                      # 元素类型
    flags interval                      # 支持 CIDR（如 10.0.0.0/8）
    auto-merge                          # 自动合并重叠段
    elements = {                        # 初始元素
        192.168.1.0/24,
        10.0.0.0/8,
        127.0.0.1
    }
}

# 使用
ip saddr @my_ips accept                 # @ 表示引用命名集合
```

### 6.2 匿名集合（Anonymous Set）

直接在规则中写集合，不需要单独定义：

```nft
tcp dport { 22, 80, 443 } accept
ip saddr { 192.168.1.0/24, 10.0.0.0/8 } accept
```

### 6.3 集合类型大全

| 类型 | 说明 | 示例元素 |
|------|------|---------|
| `ipv4_addr` | IPv4 地址 | `192.168.1.1`, `10.0.0.0/8` |
| `ipv6_addr` | IPv6 地址 | `::1`, `2001:db8::/32` |
| `ether_addr` | MAC 地址 | `aa:bb:cc:dd:ee:ff` |
| `inet_proto` | 协议 | `tcp`, `udp`, `icmp` |
| `inet_service` | 端口 | `80`, `443`, `1024-65535` |
| `ifname` | 接口名 | `"eth0"`, `"pppoe-wan"` |
| `mark` | fwmark | `0x80`, `0x100` |
| `dscp` | DSCP | `cs0`, `af11`, `ef` |
| `nf_proto` | 协议族 | `ipv4`, `ipv6` |
| `counter` | 计数器 | — |
| `quota` | 配额 | — |

### 6.4 复合类型（Concatenation）

可以组合多个字段作为集合元素：

```nft
# 组合：源 IP + 目标端口
set ip_port {
    type ipv4_addr . inet_service
    flags interval
    elements = {
        192.168.1.0/24 . 80,
        10.0.0.0/8 . { 22, 443 }
    }
}

# 使用
ip saddr . tcp dport @ip_port accept

# 更复杂的组合：协议 + 端口
set proto_port {
    type inet_proto . inet_service
    elements = { tcp . 80, udp . 53, tcp . 443 }
}

meta l4proto . th dport @proto_port accept
```

> hijack.ut.js 中的 `proxy_dport` 集合就是 `inet_proto . inet_service` 类型：
> ```nft
> elements = { tcp . 0-65535, udp . 0-65535 }
> ```

### 6.5 动态集合（通过规则增删）

```nft
# 定义一个空集合
set blacklist {
    type ipv4_addr
    flags timeout
    timeout 1h                          # 元素 1 小时后自动过期
}

# 规则中添加元素（如检测到攻击）
ip saddr 192.168.1.100 add @blacklist

# 规则中删除元素
ip saddr 192.168.1.100 delete @blacklist
```

### 6.6 Map（映射）

Map 是特殊的集合，每个 key 对应一个 value：

```nft
# 定义映射：源 IP → 目标端口
map port_forward {
    type ipv4_addr : inet_service
    elements = {
        192.168.1.10 : 8080,
        192.168.1.11 : 9090
    }
}

# 使用：根据源 IP 做 DNAT
dnat to ip saddr map @port_forward
```

### 6.7 vmap（值映射）

用于根据某个字段的值选择不同动作：

```nft
# 根据协议选择不同链
meta l4proto vmap {
    tcp : jump tcp_chain,
    udp : jump udp_chain,
    icmp : jump icmp_chain
}
```

> hijack.ut.js 中的经典用法：
> ```nft
> meta l4proto vmap {
>     tcp : jump router_tproxy,
>     udp : jump router_tun
> }
> ```

---

## 7. Hook 与优先级

### 7.1 Hook 挂载点

| Hook | 触发位置 | 可用 type | 典型用途 |
|------|---------|-----------|---------|
| `prerouting` | 包刚进入网卡，路由决策前 | `filter`, `nat` | DNAT、TPROXY、mark |
| `input` | 路由后，目标为本机 | `filter`, `nat` | 过滤到本机的流量 |
| `forward` | 路由后，需要转发 | `filter` | 过滤转发流量 |
| `output` | 本机进程发出的包 | `filter`, `nat`, `route` | 过滤本机出站、SNAT |
| `postrouting` | 包即将离开网卡 | `filter`, `nat` | SNAT、MASQUERADE |
| `ingress` | 网卡驱动层 | `filter` | 高性能过滤（netdev family） |

### 7.2 优先级

同一 Hook 点可以挂多个链，按优先级排序。数字越小越早执行。

| 优先级名称 | 数值 | 用途 |
|-----------|------|------|
| `raw` | -300 | 最早处理，连接跟踪前 |
| `mangle` | -150 | 修改包内容、打 mark |
| `dstnat` | -100 | 目标地址转换（DNAT） |
| `filter` | 0 | 过滤决策 |
| `security` | 50 | SELinux 等安全模块 |
| `srcnat` | 100 | 源地址转换（SNAT） |

```nft
# 比 mangle 还早执行（用于 TPROXY 还原）
chain early_mangle {
    type filter hook prerouting priority mangle - 1; policy accept;
}

# 在 dstnat 之后执行（用于自定义 DNAT）
chain my_dstnat {
    type nat hook prerouting priority dstnat + 1; policy accept;
}
```

### 7.3 包流经路径

```
         ┌─────────────┐
  入站 →  │  ingress    │  （网卡驱动层，netdev family）
         └──────┬──────┘
                ↓
         ┌─────────────┐
         │ prerouting  │  （DNAT、TPROXY、mark）
         └──────┬──────┘
                ↓
         ┌─────────────┐
    ┌──→ │   input     │  （到本机的包）
    │    └──────┬──────┘
    │           ↓
    │    ┌─────────────┐
    │    │  本机进程   │
    │    └──────┬──────┘
    │           ↓
    │    ┌─────────────┐
    │    │   output    │  （本机发出的包）
    │    └──────┬──────┘
    │           ↓
    │    ┌─────────────┐
    └──→ │  forward    │  （转发的包）
         └──────┬──────┘
                ↓
         ┌─────────────┐
         │ postrouting │  （SNAT、MASQUERADE）
         └──────┬──────┘
                ↓
              出站
```

---

## 8. 实战：结合 hijack.ut.js 的透明代理规则

### 8.1 DNS 劫持规则拆解

```nft
# 原始规则（来自 hijack.ut.js）
meta nfproto @dns_hijack_nfproto meta l4proto { tcp, udp } th dport 53 counter redirect to :1053

# 逐段拆解：
# ├─ meta nfproto @dns_hijack_nfproto    # 匹配 IPv4 或 IPv6（由集合决定）
# ├─ meta l4proto { tcp, udp }           # 匹配 TCP 或 UDP
# ├─ th dport 53                         # 目标端口 53（DNS）
# ├─ counter                             # 计数
# └─ redirect to :1053                   # 重定向到本机 1053 端口（nikki DNS）
```

**为什么用 `th dport` 而不是 `tcp dport`？**
- `th`（transport header）是通用匹配器，同时适用于 TCP 和 UDP
- 如果用 `tcp dport`，当 `meta l4proto udp` 时，这条规则不会匹配
- 但 `meta l4proto { tcp, udp } th dport 53` 可以统一处理两种协议的 53 端口

### 8.2 TPROXY 标记规则拆解

```nft
# 原始规则
meta nfproto @proxy_nfproto meta l4proto { tcp, udp } meta mark set meta mark & 0xFFFFFF00 | 0x80 accept

# 逐段拆解：
# ├─ meta nfproto @proxy_nfproto         # 匹配 IPv4/IPv6
# ├─ meta l4proto { tcp, udp }           # 匹配 TCP/UDP
# ├─ meta mark set ...                   # 设置 fwmark
# │   ├─ meta mark & 0xFFFFFF00          # 清空低 8 位（保留高 24 位）
# │   └─ | 0x80                          # 低 8 位设为 0x80
# └─ accept                              # 放行
```

**为什么需要 `& 0xFFFFFF00`？**
- 避免覆盖 mark 的其他位（可能有其他程序也在用 mark）
- 只修改低 8 位，保留高 24 位的原有值

**后续配合的路由规则**（通常由 iproute2 配置）：
```bash
# 创建路由表
ip rule add fwmark 0x80 lookup 100
ip route add local default dev lo table 100

# 这样带有 0x80 mark 的包会被路由到 lo 接口
# 然后被 TPROXY 监听程序（nikki）接收
```

### 8.3 防死环规则拆解

```nft
# cgroup v2 白名单
socket cgroupv2 level 2 "services/nikki" counter return

# 逐段拆解：
# ├─ socket cgroupv2                     # 查询发出此包的进程所属 cgroup v2
# ├─ level 2                             # 在 cgroup 层级树的第 2 层查找
# ├─ "services/nikki"                    # 匹配路径
# ├─ counter                             # 计数
# └─ return                              # 直接返回，不再继续匹配后续规则
```

**为什么能防死环？**
- nikki 进程本身发出的流量不应该再被代理
- 如果 nikki 请求 DNS（比如查询远程代理服务器域名），这个 DNS 请求又会被劫持回 nikki → 死循环
- 通过 cgroup 识别 nikki 自身进程，直接放行

### 8.4 访问控制规则拆解

```nft
# 路由器本机按用户匹配
meta nfproto @proxy_nfproto meta l4proto tcp meta skuid { root, nikki } counter redirect to :7892

# 逐段拆解：
# ├─ meta nfproto @proxy_nfproto         # IPv4/IPv6
# ├─ meta l4proto tcp                    # TCP 协议
# ├─ meta skuid { root, nikki }          # 发出进程的用户是 root 或 nikki
# ├─ counter                             # 计数
# └─ redirect to :7892                   # 重定向到 redir_port
```

### 8.5 Fake-IP 特殊处理

```nft
# 保留 IP 段直接放行，但 Fake-IP 段除外
ip daddr @reserved_ip ip daddr != 198.18.0.0/15 counter return

# 逐段拆解：
# ├─ ip daddr @reserved_ip               # 目标在保留 IP 集合中
# ├─ ip daddr != 198.18.0.0/15           # 但目标不是 Fake-IP 段
# ├─ counter                             # 计数
# └─ return                              # 放行
```

**为什么 Fake-IP 要除外？**
- Fake-IP（如 `198.18.0.0/15`）是 nikki 返回给客户端的虚假 IP
- 客户端访问这个虚假 IP 时，流量必须被代理到 nikki，nikki 才能做域名解析和真实连接
- 所以 Fake-IP 段虽然看起来是"保留地址"，但必须走代理

---

## 9. 调试与排错

### 9.1 查看规则

```bash
# 查看所有规则
nft list ruleset

# 查看指定表
nft list table inet nikki

# 查看指定链
nft list chain inet nikki nat_output

# 查看带 handle 号（用于删除）
nft -a list ruleset

# 只查看计数器
nft list ruleset | grep counter
```

### 9.2 计数器清零与查看

```bash
# 重置所有计数器
nft reset counters

# 重置指定表的计数器
nft reset counters table inet nikki
```

### 9.3 规则追踪（Trace）

```bash
# 启用追踪（需要内核支持 CONFIG_NF_TABLES_TRACE）
nft add rule inet nikki prerouting meta nftrace set 1

# 查看追踪日志
dmesg -w | grep "nft"

# 或者使用 nftrace 工具
nft trace add inet nikki prerouting
```

### 9.4 日志调试

```nft
# 在规则中加日志
ip saddr 192.168.1.100 log prefix "HIT-MY-RULE: " accept

# 查看日志
journalctl -kf | grep "HIT-MY-RULE"
```

### 9.5 测试规则

```bash
# 命令行临时添加规则（重启后失效）
nft add rule inet nikki input tcp dport 9999 counter drop

# 从文件加载（原子性替换）
nft -f /etc/nftables.conf

# 检查语法（不加载）
nft -c -f /etc/nftables.conf
```

### 9.6 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 规则不生效 | chain 没有绑定 hook | 检查 `type ... hook ... priority` |
| 集合匹配失败 | 元素格式不对 | 检查集合类型与元素类型是否匹配 |
| TPROXY 不工作 | 缺少路由规则 | 添加 `ip rule` 和 `ip route` |
| 死循环 | nikki 流量被再次代理 | 添加 cgroup/uid 白名单 |
| DNS 劫持失败 | 客户端使用 DoH/DoT | 需要额外阻断 853/443 的 DNS 流量 |

---

## 10. iptables → nftables 对照表

### 10.1 命令对照

| iptables | nftables |
|----------|----------|
| `iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to 192.168.1.10` | `add rule ip nat prerouting tcp dport 80 dnat to 192.168.1.10` |
| `iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE` | `add rule ip nat postrouting oifname "eth0" masquerade` |
| `iptables -t mangle -A OUTPUT -p tcp -j MARK --set-mark 0x80` | `add rule ip mangle output meta l4proto tcp meta mark set 0x80` |
| `iptables -A INPUT -p tcp --dport 22 -j ACCEPT` | `add rule inet filter input tcp dport 22 accept` |
| `iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT` | `add rule inet filter input ct state established,related accept` |
| `iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT` | `add rule inet filter input ip saddr 192.168.1.0/24 accept` |
| `iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to 1053` | `add rule ip nat prerouting tcp dport 53 redirect to :1053` |
| `iptables -t mangle -A PREROUTING -p tcp -j TPROXY --on-port 7895` | `add rule ip mangle prerouting tcp dport 80 tproxy to :7895` |

### 10.2 概念对照

| iptables | nftables |
|----------|----------|
| Table（-t nat/filter/mangle/raw） | `table` 中的 `type` + `hook` |
| Chain（INPUT/FORWARD/OUTPUT/PREROUTING/POSTROUTING） | `chain` 中的 `hook` |
| -m multiport --dports 80,443 | `tcp dport { 80, 443 }` |
| -m iprange --src-range 10.0.0.1-10.0.0.100 | `ip saddr 10.0.0.0/24`（用 set） |
| -m owner --uid-owner 1000 | `meta skuid 1000` |
| -m cgroup --cgroup 0x12061206 | `meta cgroup 0x12061206` |
| -m set --match-set myset src | `ip saddr @myset` |
| -j LOG --log-prefix "XXX" | `log prefix "XXX"` |

---

## 11. 完整配置示例

### 11.1 基础防火墙（替代 iptables 默认规则）

```nft
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
    set lan_subnets {
        type ipv4_addr
        flags interval
        elements = { 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12 }
    }

    chain input {
        type filter hook input priority filter; policy drop;

        # 允许回环
        iifname "lo" accept

        # 允许已建立/相关连接
        ct state established,related accept

        # 允许 ICMP（ping）
        icmp type echo-request accept
        icmpv6 type echo-request accept

        # 允许 LAN 访问 SSH 和 DNS
        iifname { "eth1", "br-lan" } meta l4proto { tcp, udp } th dport { 22, 53 } accept

        # 允许 LAN 访问 Web
        iifname { "eth1", "br-lan" } tcp dport { 80, 443 } accept

        # 拒绝其他入站
        counter log prefix "DROP-INPUT: " drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;

        # 允许已建立/相关连接
        ct state established,related accept

        # 允许 LAN 到 WAN 的转发
        iifname { "eth1", "br-lan" } oifname "eth0" accept

        # 拒绝其他转发
        counter log prefix "DROP-FORWARD: " drop
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

### 11.2 透明代理完整示例（类似 hijack.ut.js）

```nft
#!/usr/sbin/nft -f

flush ruleset

define REDIR_PORT = 7892
define TPROXY_PORT = 7895
define DNS_PORT = 1053
define TPROXY_MARK = 0x80
define TPROXY_MASK = 0xFF

table inet nikki {
    # === 集合定义 ===
    set reserved_ip {
        type ipv4_addr
        flags interval
        auto-merge
        elements = {
            0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10,
            127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12,
            192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24,
            192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24,
            203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4
        }
    }

    set reserved_ip6 {
        type ipv6_addr
        flags interval
        auto-merge
        elements = {
            ::/128, ::1/128, ::ffff:0:0/96,
            64:ff9b::/96, 100::/64, 2001::/32,
            2001:db8::/32, 2002::/16, fc00::/7,
            fe80::/10, ff00::/8
        }
    }

    set proxy_dport {
        type inet_proto . inet_service
        flags interval
        elements = { tcp . 0-65535, udp . 0-65535 }
    }

    set lan_devices {
        type ifname
        elements = { "br-lan", "eth1" }
    }

    # === 路由器本机代理链 ===
    chain router_dns_hijack {
        meta l4proto { tcp, udp } th dport 53 counter redirect to :$DNS_PORT
    }

    chain router_redirect {
        meta l4proto tcp counter redirect to :$REDIR_PORT
    }

    chain router_tproxy {
        meta l4proto { tcp, udp } counter meta mark set meta mark & 0xFFFFFFFF ^ $TPROXY_MASK | $TPROXY_MARK accept
    }

    # === 局域网代理链 ===
    chain lan_dns_hijack {
        meta l4proto { tcp, udp } th dport 53 counter redirect to :$DNS_PORT
    }

    chain lan_redirect {
        meta l4proto tcp counter redirect to :$REDIR_PORT
    }

    chain lan_tproxy {
        meta l4proto { tcp, udp } counter meta mark set meta mark & 0xFFFFFFFF ^ $TPROXY_MASK | $TPROXY_MARK tproxy to :$TPROXY_PORT accept
    }

    # === 本机流量入口（output 链） ===
    chain nat_output {
        type nat hook output priority filter; policy accept;

        # 白名单：nikki 自身（通过 cgroup v2）
        socket cgroupv2 level 2 "services/nikki" counter return

        # DNS 劫持
        jump router_dns_hijack

        # 绕过规则
        fib daddr type { local, broadcast, anycast, multicast } counter return
        ct direction reply counter return
        ip daddr @reserved_ip counter return
        ip6 daddr @reserved_ip6 counter return
        meta nfproto ipv4 meta l4proto . th dport != @proxy_dport counter return
        meta nfproto ipv6 meta l4proto . th dport != @proxy_dport counter return

        # TCP 重定向
        jump router_redirect
    }

    chain mangle_output {
        type route hook output priority mangle; policy accept;

        # 白名单
        socket cgroupv2 level 2 "services/nikki" counter return

        # 绕过规则
        fib daddr type { local, broadcast, anycast, multicast } counter return
        ct direction reply counter return
        ip daddr @reserved_ip counter return
        ip6 daddr @reserved_ip6 counter return
        meta nfproto ipv4 meta l4proto . th dport != @proxy_dport counter return
        meta nfproto ipv6 meta l4proto . th dport != @proxy_dport counter return

        # 按协议分发到 TPROXY
        meta l4proto vmap {
            tcp : jump router_tproxy,
            udp : jump router_tproxy
        }
    }

    # === TPROXY 还原 ===
    chain mangle_prerouting {
        type filter hook prerouting priority mangle - 1; policy accept;
        iifname "lo" meta l4proto { tcp, udp } meta mark & $TPROXY_MASK == $TPROXY_MARK tproxy to :$TPROXY_PORT counter accept
    }

    # === 局域网流量入口 ===
    chain dstnat {
        type nat hook prerouting priority dstnat + 1; policy accept;

        # DNS 劫持（仅 LAN 接口）
        iifname @lan_devices jump lan_dns_hijack

        # 绕过规则
        fib daddr type { local, broadcast, anycast, multicast } counter return
        ct direction reply counter return
        ip daddr @reserved_ip counter return
        ip6 daddr @reserved_ip6 counter return

        # TCP 重定向
        iifname @lan_devices jump lan_redirect
    }

    chain mangle_prerouting_lan {
        type filter hook prerouting priority mangle; policy accept;

        # 绕过规则
        fib daddr type { local, broadcast, anycast, multicast } counter return
        ct direction reply counter return
        ip daddr @reserved_ip counter return
        ip6 daddr @reserved_ip6 counter return

        # 按协议分发到 TPROXY
        iifname @lan_devices meta l4proto vmap {
            tcp : jump lan_tproxy,
            udp : jump lan_tproxy
        }
    }
}
```

### 11.3 配合的路由规则（iproute2）

```bash
#!/bin/bash

# 创建路由表 100
ip rule add fwmark 0x80 lookup 100
ip route add local default dev lo table 100

# 持久化（OpenWrt 写入 /etc/config/network 或 hotplug）
```

---

## 附录：常用参考

### 保留 IPv4 地址段

| CIDR | 说明 |
|------|------|
| 0.0.0.0/8 | 当前网络 |
| 10.0.0.0/8 | 私有地址 A 类 |
| 100.64.0.0/10 | 运营商级 NAT |
| 127.0.0.0/8 | 回环地址 |
| 169.254.0.0/16 | 链路本地 |
| 172.16.0.0/12 | 私有地址 B 类 |
| 192.168.0.0/16 | 私有地址 C 类 |
| 198.18.0.0/15 | 基准测试（常被用作 Fake-IP） |
| 224.0.0.0/4 | 组播 |
| 240.0.0.0/4 | 保留 |

### 保留 IPv6 地址段

| CIDR | 说明 |
|------|------|
| ::/128 | 未指定 |
| ::1/128 | 回环 |
| ::ffff:0:0/96 | IPv4 映射 |
| fc00::/7 | 唯一本地地址（ULA） |
| fe80::/10 | 链路本地 |
| ff00::/8 | 组播 |

### 官方文档

- [nftables wiki](https://wiki.nftables.org/)
- `man nft`
- `man nftables`
