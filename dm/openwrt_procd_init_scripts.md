# OpenWrt procd init 脚本完全参考手册

> 适用版本：OpenWrt 18.06 ~ master（2026）
> 依据源码：`/etc/rc.common`、`/lib/functions/procd.sh`
> 阅读对象：需要编写 / 调试 `/etc/init.d/*` 脚本的开发者

---

## 目录

1. [procd 脚本基础模型](#1-procd-脚本基础模型)
2. [完整执行流程与调用链](#2-完整执行流程与调用链)
3. [生命周期钩子函数详解](#3-生命周期钩子函数详解)
4. [实例声明 API（procd_open_instance 等）](#4-实例声明-api)
5. [procd_set_param 全量参数类型详解](#5-procd_set_param-全量参数类型详解)
6. [procd_append_param 与参数追加](#6-procd_append_param-与参数追加)
7. [触发器体系 service_triggers 完全指南](#7-触发器体系-service_triggers-完全指南)
8. [UCI 配置校验体系](#8-uci-配置校验体系)
9. [安全加固：jail / seccomp / capabilities](#9-安全加固jail--seccomp--capabilities)
10. [service_data 与跨服务数据联动](#10-service_data-与跨服务数据联动)
11. [运行时控制与查询函数](#11-运行时控制与查询函数)
12. [自定义命令 extra_command](#12-自定义命令-extra_command)
13. [启动顺序与依赖管理](#13-启动顺序与依赖管理)
14. [综合完整示例](#14-综合完整示例)
15. [调试命令大全](#15-调试命令大全)
16. [常见坑与 FAQ](#16-常见坑与-faq)
17. [速查表（Cheat Sheet）](#17-速查表cheat-sheet)

---

## 1. procd 脚本基础模型

OpenWrt 的 `/etc/init.d/*` 脚本有两种写法：

| 类型 | 标志 | 进程管理方 | 适用场景 |
|---|---|---|---|
| 传统 sysvinit 风格 | 无 | 脚本自己（start-stop-daemon / killall） | 一次性任务、需要复杂 shell 逻辑的脚本 |
| **procd 风格** | `USE_PROCD=1` | **procd**（监管、重启、触发器、日志） | 需要长期运行的 daemon |

**procd 脚本的最小骨架：**

```sh
#!/bin/sh /etc/rc.common

START=90          # 开机启动顺序（数字越小越早）
STOP=10           # 关机停止顺序

USE_PROCD=1       # 使用procd

PROG=/usr/sbin/myservice

start_service() {
    procd_open_instance
    procd_set_param command "$PROG" -c /etc/myservice.conf
    procd_set_param respawn 3600 5 5
    procd_close_instance
}
```

**关键约定：**

- **进程必须以前台方式运行**（不要加 `&`、不要 daemonize、不要自己 fork）。procd 用 uloop 监管进程，进程一旦退出 procd 就感知到并按 respawn 策略处理。如果进程自己 daemonize 了，procd 会误判为"秒退"并反复拉起，日志里出现 respawn 风暴。
- `rc.common` 在加载脚本时会先 source `/lib/functions.sh` 与 `/lib/functions/service.sh`（传统风格），若 `USE_PROCD=1` 再额外 source `/lib/functions/procd.sh` 并**覆写** `start/stop/reload/restart/status/running` 命令。因此：
  - procd 脚本里**不要再定义** `start()` / `stop()`（写了也会被覆盖，procd 模式下应写 `start_service()` 等）。
  - `boot()` 同样会被 procd 的 `start` 接管——开机走的就是 `start`。
- 一个服务 = 一个 name + 若干 instance。`/etc/init.d/xxx start` 默认操作所有实例；`stop` / `status` / `running` 可以**带实例名参数**只操作单个实例：`/etc/init.d/xxx stop instance2`。
- 脚本文件名就是服务名（`procd_open_service` 用 `basename $initscript` 注册），实例名默认为 `instance1`、`instance2`…，可用 `procd_open_instance "名字"` 指定。

---

## 2. 完整执行流程与调用链

以下流程直接对应 `rc.common` 的 procd 分支实现（`rc_procd()` 包装了 `procd_open_service → $回调 → procd_close_service`，并通过 ubus `service set` 发给 procd）。

### 2.1 `/etc/init.d/xxx start`

```
/etc/init.d/xxx start
        │
        ▼
rc_procd()
  ├─ procd_open_service "xxx" "/etc/init.d/xxx"     ← 开始组装 JSON 消息
  ├─ start_service "$@"                              ← 你的钩子：声明实例、参数
  │     ├─ procd_open_instance [name]
  │     ├─ procd_set_param command / respawn / file / env / ...
  │     ├─ procd_add_jail / procd_add_jail_mount ... （可选）
  │     └─ procd_close_instance
  └─ procd_close_service                             ← 发送 ubus service set
        ├─ 调用 service_triggers()  ← 注册触发器（嵌在 close 里）
        ├─ 调用 service_data()      ← 可选，注册自定义数据
        └─ 发送给 procd ──► procd 对比已有实例（command/file/data md5）
                             ├─ 无变化 → 什么都不做（幂等）
                             └─ 有变化 → 杀旧进程、拉起新进程
        │
        ▼
if type service_started; then service_started; fi    ← 可选回调
```

要点：

- **`start` 是幂等的**：再次执行时，若 command、file、data、netdev 等关键参数没有变化，procd 不会重启进程。这正是 procd 比传统脚本优雅的地方。
- `service_started` 只在 `start` 成功后调用（且仅在脚本定义了它时），不适合做"进程正在运行"的判断依据——它只是"注册完成"的回调。

### 2.2 `/etc/init.d/xxx stop`

```
procd_lock                    ← 加 flock 锁，防止与并发 reload/start 竞争
stop_service "$@"             ← 你的钩子：清理 pidfile、临时文件（procd 已先记录意图）
procd_kill "xxx" "$1"         ← 让 procd 杀实例（$1 可为实例名，空则杀全部）
service_stopped               ← 可选回调
```

要点：进程由 **procd 负责杀**，`stop_service` 只做善后，**不要在里面 kill 进程**（杀也杀的是 procd 的子进程，会破坏 respawn 逻辑）。

### 2.3 `/etc/init.d/xxx reload`

```
if 定义了 reload_service:
    procd_lock
    reload_service "$@"
else:
    start                      ← 退化为 start（靠 md5 差异决定是否重启实例）
```

### 2.4 `/etc/init.d/xxx restart`

procd 模式下没有单独的 restart 钩子，走默认实现：

```sh
restart() {
    trap '' TERM
    stop "$@"
    trap - TERM
    start "$@"
}
```

即 `stop` + `start`。若想在 restart 时做特殊优化（例如不中断的重载），请实现 `reload_service` 并让使用者用 `reload`。

### 2.5 其余命令

| 命令 | 实现 |
|---|---|
| `status` | 定义了 `status_service` 则调用之；否则 `_procd_status` 查询 ubus，输出 running / not running / running (n/m) / inactive，**退出码** 0=运行 3=未注册 4=实例不存在 5=存在但全停 |
| `running` | `service_running [实例名]` → `procd_running`，返回 0/1 |
| `info` | `ubus call service list` 的 verbose 包装 |
| `trace` | 置 `TRACE_SYSCALLS=1` 后走 start（配合 seccomp 生成 syscall 白名单，见第 9 节） |
| `enable/disable/enabled` | 维护 `/etc/rc.d/S{START}xxx`、`K{STOP}xxx` 软链 |

---

## 3. 生命周期钩子函数详解

所有钩子都在 `rc.common` 中有**默认空实现**，按需覆写即可，无需全部定义。

### 3.1 start_service() —— 必需

| 项 | 说明 |
|---|---|
| 签名 | `start_service()`（可 `"$@"` 取 start 的参数） |
| 调用时机 | `start` / `boot` / （未定义 reload_service 时的）`reload` / `restart` |
| 职责 | 用 procd API 声明一个或多个实例，procd 负责真正 fork |
| 返回值 | 非 0 不会阻止后续流程（rc.common 不检查），但应自行 `return 1` 中止并清理 |

典型模式：

```sh
start_service() {
    # 1. 准备运行环境（生成配置文件、创建目录）
    mkdir -p /var/run/myservice
    generate_config /var/etc/myservice.conf

    # 2. 声明实例
    procd_open_instance
    procd_set_param command /usr/sbin/myservice -c /var/etc/myservice.conf
    procd_set_param respawn 3600 5 5
    procd_set_param file /var/etc/myservice.conf
    procd_close_instance
}
```

多实例写法见第 14 节。

### 3.2 stop_service() —— 可选

| 项 | 说明 |
|---|---|
| 签名 | `stop_service()`（`"$@"` 为 stop 的参数，可能含实例名） |
| 调用时机 | `procd_kill` 之前 |
| 职责 | 善后清理：删 pidfile、清临时目录、umount、通知关联组件 |

```sh
stop_service() {
    rm -f /var/run/myservice.pid
    rm -rf /var/state/myservice
}
```

注意：此时进程**还活着**（procd 紧接着才 kill）。如果你的清理依赖进程已退出（如进程退出时才写出的文件），应放到 `service_stopped`。

### 3.3 service_started() —— 可选

| 项 | 说明 |
|---|---|
| 签名 | `service_started()` |
| 调用时机 | `start` 命令完成 `procd_close_service` 之后（rc.common 用 `type service_started` 检测，只在定义时调用） |
| 典型用途 | 打日志、联动下游（如 `ubus call` 通知）、设置状态标记 |

```sh
service_started() {
    logger -t myservice "started"
    ubus call network.interface.wan up    # 例：拉起依赖接口
}
```

注意：它只表示"已注册给 procd"，不代表进程已稳定运行（进程可能马上 crash 进入 respawn）。

### 3.4 service_stopped() —— 可选

| 项 | 说明 |
|---|---|
| 签名 | `service_stopped()` |
| 调用时机 | `stop` 命令在 `stop_service` + `procd_kill` 之后 |

```sh
service_stopped() {
    logger -t myservice "stopped, cleaning up state files"
    rm -f /var/state/myservice.db
}
```

### 3.5 reload_service() —— 可选但强烈建议

| 项 | 说明 |
|---|---|
| 签名 | `reload_service()`（`"$@"` 为 reload 参数） |
| 调用时机 | `reload`，且脚本定义了它 |
| 未定义时 | `reload` 退化为 `start`（靠 file/data md5 决定是否重启实例） |

三种典型策略：

```sh
# 策略 A：daemon 支持 SIGHUP 自加载配置 —— 零中断，推荐
reload_service() {
    procd_send_signal myservice '*' HUP
}

# 策略 B：reload 前重新生成配置文件，再让 procd 比对 file 的 md5；
#        若文件没变，procd 不会动进程；变了才重启
reload_service() {
    generate_config /var/etc/myservice.conf
    start          # set 一次，procd 自动 diff
}

# 策略 C：业务逻辑复杂（如需先同步状态），显式 stop/start
reload_service() {
    stop
    start
}
```

> `procd_set_param reload_signal HUP` 可指定 procd 内部触发实例重启前先发的信号（优雅退出用），与 `reload_service` 里手动 `procd_send_signal` 是不同层面的东西。

### 3.6 service_triggers() —— 可选

详见第 7 节。最简形式：

```sh
service_triggers() {
    procd_add_reload_trigger "myservice"     # 监听 /etc/config/myservice
}
```

它在 `procd_close_service` 内部被调用，声明的事件-动作映射随服务注册一起发给 procd。

### 3.7 service_data() —— 可选

详见第 10 节。向 procd 注册 key/value 数据，其他服务可用 `procd_add_reload_data_trigger` 监听其变化。

### 3.8 status_service() —— 可选

覆写 `status` 命令的输出。默认 `_procd_status` 已够用，自定义示例：

```sh
status_service() {
    if procd_running myservice; then
        echo "running, uptime: $(cat /var/run/myservice.uptime 2>/dev/null)"
        return 0
    fi
    echo "not running"
    return 5
}
```

### 3.9 非 procd 钩子（同样生效）

| 钩子 | 时机 |
|---|---|
| `depends()` | `enable` 时输出依赖（如 `echo "dnsmasq"`），供排序工具使用 |
| `shutdown()` | 关机流程调用（procd 模式下同样有效，先于 stop） |

---

## 4. 实例声明 API

| 函数 | 签名 | 说明 |
|---|---|---|
| `procd_open_service` | `procd_open_service <name> [script]` | 组装一条 service 消息。一般由 `rc.common` 自动调用，手工场景（如外部脚本注册）可用 |
| `procd_close_service` | `procd_close_service [set\|add]` | 发送消息；`add` 追加实例而非覆盖整个服务。rc.common 默认 `set` |
| `procd_open_instance` | `procd_open_instance [name]` | 开始定义实例；不给名则自动 `instance1`/`instance2`…；`procd_add_instance` 是其快捷封装 |
| `procd_close_instance` | `procd_close_instance` | 结束当前实例。若 respawn 参数为空数组，自动填默认 `3600 5 5` |
| `procd_add_instance` | `procd_add_instance <cmd...>` | 一行声明一个最小实例（command + close） |

实例名规则：ubus 消息里的实例 key 就是名字；多实例时建议用 uci section 名命名，便于单独 stop：

```sh
procd_open_instance "$cfg"          # cfg 如 "tun0"、"cfg02x3f"
...
/etc/init.d/myservice stop tun0     # 只停这一个
```

**幂等机制**：procd 对每个实例记录 command、env、file 内容 md5、data、netdev、limits、jail 等参数，收到新的 `set` 时逐项 diff——

- command 变化 → 重启实例
- file 指向的文件内容变化 → 重启实例
- data 变化 → 重启实例
- 仅 stdout/stderr/nice 等变化 → 按需调整，不重启
- 完全相同 → 不动

---

## 5. procd_set_param 全量参数类型详解

语法：`procd_set_param <type> [value...]`

> ⚠️ 数组/表类型**每个元素是独立函数参数**，不要拼成一个字符串：
> `procd_set_param respawn 3600 5 5` ✅　`procd_set_param respawn "3600 5 5"` ❌

### 5.1 参数总表

| type | 数据形态 | 语义 |
|---|---|---|
| `command` | 数组，必填 | 可执行文件 + 全部命令行参数 |
| `respawn` | 数组 `[threshold] [timeout] [retry]` | 崩溃自愈策略，见 5.2 |
| `env` | 表 `NAME=value` | 进程环境变量 |
| `file` | 数组（路径） | 监听文件内容 md5，变化时 procd 自动重启该实例 |
| `data` | 表 `key=value` | 任意数据；变化时触发实例重启；也可被别的服务监听 |
| `netdev` | 数组（网口名） | 监听网口 ifindex 变化（拔插、rename） |
| `watch` | 数组 | 声明 watch 目标（如 `"network.interface"`），供外部 event 匹配 |
| `watchdog` | 数组 | 看门狗模式：进程需持有 fd 喂狗，超时未喂 procd 重启进程 |
| `limits` | 表 | ulimit 资源限制，如 `core="unlimited" nofile="10000"` |
| `user` / `group` | 字符串 | 降权运行 |
| `pidfile` | 路径 | procd 把 pid 写入该文件（等价于 procd 代写 `-p`） |
| `stdout` / `stderr` | 0/1 | 重定向到 syslog（logd）。默认 0 |
| `facility` | syslog facility | 配合 stdout/stderr，默认 daemon |
| `nice` | 整数 | nice 优先级 |
| `term_timeout` | 秒 | SIGTERM 后等待进程自行退出的超时 |
| `reload_signal` | 信号名或号 | procd 重启实例前先发的"优雅"信号（默认 TERM） |
| `error` | 数组 | 错误处理附加信息（一般用不到） |
| `seccomp` | 路径 | seccomp 过滤器 JSON（需编译开启 seccomp） |
| `capabilities` | 能力列表 | 保留 Linux capabilities（cap_net_admin 等） |
| `no_new_privs` | 0/1 | 设置 no_new_privs 位 |
| `extroot` | 路径 | extroot 场景的文件监听 |
| `overlaydir` / `tmpoverlaysize` | 路径 / 大小 | overlay 相关 |
| `vrf` | 设备名 | 把所有 socket 绑定到指定 VRF 设备 |
| `trace` | —（由 TRACE_SYSCALLS 控制） | `rc.common` 的 `trace` 命令置位后自动加 trace 标记 |

### 5.2 respawn 三参数详解（最易踩坑）

`procd_set_param respawn <threshold> <timeout> <retry>`

| 参数 | 语义 |
|---|---|
| `threshold`（秒） | 时间窗。距离上次启动不足 threshold 秒就退出 → 计为一次"失败" |
| `timeout`（秒） | 失败后 procd 等待多少秒再拉起 |
| `retry`（次） | threshold 时间窗内**连续失败**达到 retry 次 → procd 放弃，不再拉起（实例进入 stopped） |

默认 `3600 5 5`（即一小时内连续崩 5 次就放弃），可用 uci 全局调整：

```
uci set system.@service[0].respawn_threshold='3600'
uci set system.@service[0].respawn_timeout='5'
uci set system.@service[0].respawn_retry='5'
```

只写 `procd_set_param respawn`（无参数）→ 空数组，procd 自动填充上述默认。

经验值：常驻关键服务 `respawn 3600 5 5`；对崩溃敏感的服务 `respawn 600 2 10` 之类。

### 5.3 file / data / netdev / watch 语义

```sh
# 生成的配置文件内容一变 → 实例自动重启（uci commit + reload_config 之外的另一条路）
procd_set_param file /var/etc/myservice.conf

# uci 关键值打进 data；procd 比对 data 变化决定是否重启
procd_set_param data port="$port" enabled="$enabled"

# 网口被拔出/重插（ifindex 变化）→ 实例重启（适合绑定物理口的 daemon）
procd_set_param netdev eth1

# 订阅 ubus 事件命名空间（外部 ubus call service event 可匹配）
procd_set_param watch "network.interface"
```

### 5.4 日志与资源

```sh
procd_set_param stdout 1
procd_set_param stderr 1
procd_set_param facility local0
procd_set_param nice -5
procd_set_param limits core="unlimited" nofile="10000"
procd_set_param user nobody
procd_set_param group nogroup
procd_set_param term_timeout 10
```

之后 `logread -e myservice` 即可看到进程输出，无需自己管 log 文件。

### 5.5 信号与退出

```sh
procd_set_param reload_signal USR1   # procd 需要重启实例前，先发 USR1 让进程优雅收尾
```

---

## 6. procd_append_param 与参数追加

`procd_append_param <type> [value...]` 用于向已声明的数组/表类型**追加**元素，常用于按条件拼 command：

```sh
procd_open_instance
procd_set_param command /usr/sbin/myservice -c /etc/myservice.conf

[ "$debug" = "1" ]   && procd_append_param command -d
[ -n "$bind_addr" ]  && procd_append_param command -b "$bind_addr"
config_list_foreach "$cfg" listen append_listen   # uci list → 追加多个参数

procd_close_instance
```

```sh
append_listen() {
    procd_append_param command --listen "$1"
}
```

同理 `env`、`file` 也可 append。

---

## 7. 触发器体系 service_triggers 完全指南

触发器 = **事件 + 匹配条件 + 动作**。procd 收到匹配事件后，执行动作（通常是 `/etc/init.d/xxx reload` 等脚本命令）。

全局可调参数（在 `service_triggers` 里设置）：

```sh
PROCD_RELOAD_DELAY=500    # 触发去抖延时(ms)，默认 1000。事件风暴时合并
```

### 7.1 配置文件触发（最常用）

```sh
service_triggers() {
    procd_add_reload_trigger "myservice"               # 单文件
    # procd_add_reload_trigger "cfg1" "cfg2"           # 多文件
}
```

完整链路：

```
uci set myservice.xxx.yyy=1
uci commit myservice                  ← 只写盘，不通知 procd
reload_config                         ← 发送 config.change 事件（/sbin/reload_config）
        │
        ▼
procd 比对 /etc/config/myservice 的 md5（与触发器注册时存的比对）
        │ 变化
        ▼
执行 /etc/init.d/myservice reload
```

- **只 commit 不 reload_config 不会触发**（LuCI "保存&应用" 会自动调 reload_config，SSH 手改必须手动执行）。
- 文件内容没变不会触发（md5 比对）。
- 该函数内部实现：`config.change` + `package == 文件名` → `run_script /etc/init.d/xxx reload`。
- 等价手动触发：`ubus call service event '{"type":"config.change","data":{"package":"myservice"}}'`，或在脚本里调 `procd_set_config_changed myservice`。

**与 `procd_set_param file` 的区别**：

| 机制 | 谁比对 | 何时生效 | 是否需 reload_config |
|---|---|---|---|
| `procd_add_reload_trigger` | procd（配置文件 md5） | 事件触发时执行脚本 `reload` | 需要 |
| `procd_set_param file <生成文件>` | procd（任意文件 md5） | `start` 时比对，变了自动重启实例 | 不需要 |

生产上二者常配合：uci 触发器 → reload 脚本 → 重新生成 `/var/etc/xxx.conf` → `start`（set）→ procd 发现 file md5 变了 → 重启实例。

### 7.2 接口（热插拔）触发

```sh
service_triggers() {
    # wan 口任意接口事件（up/down/ifupdate...）→ 本脚本 reload
    procd_add_reload_interface_trigger "wan" "wwan"

    # 细粒度：指定事件类型 + 自定义动作
    procd_add_interface_trigger "interface.up" "wan" /etc/init.d/myservice restart
    procd_add_interface_trigger "ifupdate"     "lan" /etc/init.d/myservice reload
}
```

常见事件：`interface.up` / `interface.down` / `ifupdate`（IP 变化）/ `interface.*`。

> 坑：网桥整体 down/up 不一定产生 hotplug 事件；pppoe 重拨产生的是 `ifupdate`。

### 7.3 挂载点触发

```sh
service_triggers() {
    # 指定挂载点出现后执行 reload（/etc/config/fstab 里有对应 mount section 才生效）
    procd_add_reload_mount_trigger /mnt/usb
    # 同上但执行 restart
    procd_add_restart_mount_trigger /mnt/usb
}
```

底层用 `procd_get_mountpoints` 解析 fstab 的 target，再注册 `mount.add` 事件。底层函数 `procd_add_mount_trigger <事件> <动作> <路径...>` 也可手动用。

### 7.4 跨服务数据触发（service_data 联动）

```sh
# 服务 A 的 service_data()
service_data() {
    procd_add_raw_trigger?   # 不，直接：
}
```

A 服务注册数据：

```sh
service_data() {
    # 见第 10 节 procd_open_data / json_add_string
}
```

B 服务监听：

```sh
service_triggers() {
    # A 服务的 data 里 key 变化 → 执行本脚本 reload
    procd_add_reload_data_trigger "upstream_server"
}
```

事件类型 `service.data.update`，匹配 `name == key`。

### 7.5 完全自定义触发器

```sh
service_triggers() {
    # 原始形式：事件名 + 超时 + 动作
    procd_add_raw_trigger "some.custom.event" 3000 /etc/init.d/myservice reload

    # 通用 config 触发：监听别的包的 config.change
    procd_add_config_trigger "config.change" "network" /etc/init.d/myservice reload

    procd_add_reload_trigger "myservice"
}
```

外部配合发送事件：`ubus call service event '{"type":"some.custom.event","data":{...}}'`。

### 7.6 触发器 API 汇总

| 函数 | 事件 | 动作 | 典型场景 |
|---|---|---|---|
| `procd_add_reload_trigger <uci名>...` | config.change | 本脚本 reload | uci 配置热更新 |
| `procd_add_reload_interface_trigger <iface>...` | interface.* | 本脚本 reload | 上游网络变化重配 |
| `procd_add_interface_trigger <事件> <iface> <cmd...>` | 指定 | 任意命令 | 精确控制 |
| `procd_add_reload_data_trigger <key>...` | service.data.update | 本脚本 reload | 跨服务联动 |
| `procd_add_reload_mount_trigger <路径>...` | mount.add | 本脚本 reload | 外接盘就绪 |
| `procd_add_restart_mount_trigger <路径>...` | mount.add | 本脚本 restart | 同上 |
| `procd_add_raw_trigger <事件> <超时ms> <cmd...>` | 任意 | 任意命令 | 完全自定义 |
| `procd_add_config_trigger <事件> <package> <cmd...>` | 任意 config 事件 | 任意命令 | 监听别的包 |

---

## 8. UCI 配置校验体系

procd 集成 UCI 校验：校验失败可阻止服务启动/重载，并在 LuCI "保存&应用" 时给出错误提示。

### 8.1 两个核心函数

```sh
# 一次性校验：校验失败返回非 0，已校验字段导出为同名 shell 变量
uci_validate_section <package> <type> <section> \
    'field1:uinteger:0' 'field2:port:53' 'field3:bool:1'

# 加载 + 校验 + 回调（推荐，LuCI 触发 reload 时回调拿到校验结果）
uci_load_validate <package> <type> <section> <回调函数> 'field:类型:默认值' ...
# 回调签名：<回调> <section名> <校验结果0/非0>，字段已导出为变量
```

### 8.2 常用校验类型

| 类型 | 说明 | 示例值 |
|---|---|---|
| `string` | 任意字符串 | `"abc"` |
| `boolean` / `bool` | 布尔 | `0` `1` |
| `integer` / `uinteger` | 有符号 / 无符号整数 | `-3` `42` |
| `float` | 浮点 | `1.5` |
| `port` | 1–65535 | `8080` |
| `ports` | 端口列表 | `80,443` |
| `ip4addr` / `ip6addr` | IPv4 / IPv6 地址 | `192.168.1.1` |
| `ipaddr` | 两者皆可 | |
| `cidr4` / `cidr6` | 带前缀 | `10.0.0.0/8` |
| `netmask4` / `netmask6` | 掩码 | `255.255.255.0` |
| `range(min,max)` | 整数区间 | `range(0,31)` |
| `or(类型,...)` | 多选一 | `or("tcp","udp")` |
| `list(类型)` | 列表 | `list(ipaddr)` |
| `min(值)` / `max(值)` | 下限 / 上限 | `min(1)` |
| `hostname` / `host` / `network` | 主机名 / 主机 / 网络名 | |

语法：`'字段:类型:默认值'`（默认值可省）。未设置的字段填默认值；校验失败返回非 0 且变量取默认值。

### 8.3 完整示例（system init 的风格）

```sh
validate_myservice_section() {
    uci_load_validate myservice myservice "$1" "$2" \
        'enabled:bool:0' \
        'port:port:8000' \
        'listen:ipaddr:0.0.0.0' \
        'mode:or("active","passive"):active' \
        'peers:list(ipaddr)' \
        'concurrency:range(1,64):4'
}

start_instance() {
    [ "$2" = 0 ] || { echo "validation failed"; return 1; }

    procd_open_instance "$1"
    procd_set_param command /usr/sbin/myservice -p "$port" -l "$listen" -m "$mode" -c "$concurrency"
    procd_close_instance
}

start_service() {
    config_load myservice
    config_foreach validate_myservice_section myservice start_instance
}

service_triggers() {
    procd_add_reload_trigger "myservice"
    procd_add_validation validate_myservice_section   # 把校验注册给 LuCI/procd
}
```

`procd_add_validation <函数>` 会把校验函数挂到服务注册消息里——LuCI 应用配置时先跑校验，失败直接报错而不执行 reload。多个校验用 `procd_open_validate ... procd_close_validate` 包起来（network 脚本即如此）。

---

## 9. 安全加固：jail / seccomp / capabilities

### 9.1 ujail 容器（mount + PID namespace）

```sh
start_service() {
    procd_open_instance
    procd_set_param command /usr/sbin/myservice -c /etc/myservice.conf

    # 1) 声明 jail 及特性
    #    可用特性: log(有/dev/log) ubus udebug procfs sysfs ronly(根只读)
    #              requirejail(无jail支持则拒绝启动) netns userns cgroupsns
    procd_add_jail myservice log ubus procfs

    # 2) 只读挂载需要的文件（不挂就看不到）
    procd_add_jail_mount /etc/myservice.conf /etc/passwd /etc/group /etc/TZ /etc/hosts

    # 3) 可写挂载（运行时目录）
    procd_add_jail_mount_rw /var/run/myservice /var/lib/myservice

    procd_close_instance
}
```

- ujail 自动解析二进制依赖库并 bind 进容器，无需手动挂 /lib。
- 挂二进制可用 `procd_add_jail_mount_bin /usr/bin/helper`（连同其依赖库一起）。
- dnsmasq、hostapd 等核心服务已 jail 化，可参考其 init 脚本。

### 9.2 seccomp 系统调用过滤

```sh
procd_set_param seccomp /etc/seccomp/myservice.json
```

生成过滤器：

```sh
# 先做一次跟踪运行，自动生成 syscall 白名单
/etc/init.d/myservice trace
# 运行一遍功能后 stop，JSON 写在 /tmp/<prog>.json.<pid>
cp /tmp/myservice.json.* /etc/seccomp/myservice.json
/etc/init.d/myservice restart
```

需要固件编译时开启 `Global build settings → Enable seccomp support`。

### 9.3 capabilities 与降权

```sh
procd_set_param user nobody
procd_set_param capabilities /usr/share/capabilities/myservice.json   # 保留指定能力
procd_set_param no_new_privs 1
```

常见保留能力：`CAP_NET_BIND_SERVICE`（低端口）、`CAP_NET_ADMIN`（网络配置）、`CAP_NET_RAW`（raw socket）。

---

## 10. service_data 与跨服务数据联动

在服务注册时附加一段 JSON 数据（被 `ubus call service list verbose` 看到，且可被别人监听）：

```sh
service_data() {
    # 需配合 jshn：这里由 rc.common 的 _procd_open_data 打开 "data" 对象
    json_add_string version "1.2.3"
    json_add_string upstream_server "$upstream"
    json_add_int channel "$channel"
}
```

其他服务监听：

```sh
service_triggers() {
    procd_add_reload_data_trigger "upstream_server" "channel"
}
```

当 A 服务重启/重载导致 data 值变化时，procd 发 `service.data.update`，B 服务收到后执行自己的 reload。典型场景：下游服务跟随上游服务的地址/端口变更。

另外 `procd_add_mdns <service> <proto> <port> [txt...]` 可注册 mDNS 广播数据。

---

## 11. 运行时控制与查询函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `procd_running` | `procd_running <service> [instance]` | 查询运行状态，返回 0/1 |
| `procd_kill` | `procd_kill <service> [instance]` | 让 procd 杀实例（stop 内部用） |
| `procd_send_signal` | `procd_send_signal <service> [instance] <信号>` | 发信号；信号可写名（HUP/USR1/TERM…）或数字 |
| `procd_lock` | `procd_lock` | 对当前服务名加 flock（fd 1000）。reload/stop 已内置，自定义命令里需要时自己调 |
| `procd_set_config_changed` | `procd_set_config_changed <uci名>` | 手动发送 config.change（等价 reload_config 对单个包的效果） |
| `service_running` | `service_running [instance]` | rc.common 提供的封装 = `procd_running <本服务>` |
| `procd_get_mountpoints` | `procd_get_mountpoints <路径>...` | 从 fstab 反查挂载点（mount 触发器内部用） |

```sh
# 只对某个实例发信号（多实例场景）
procd_send_signal myservice "tun0" USR1

# 条件性重启
procd_running myservice || /etc/init.d/myservice restart
```

---

## 12. 自定义命令 extra_command

```sh
EXTRA_HELP="    compact_logs      Compact rotation logs"   # 帮助文本
extra_command "compact_logs" "Compact rotation logs"

compact_logs() {
    procd_lock
    /usr/sbin/myservice-tool --compact
}
```

之后 `/etc/init.d/myservice compact_logs` 即可调用，`help` 会列出。

---

## 13. 启动顺序与依赖管理

- `START=NN` / `STOP=NN`：数字越小，开机越早启动 / 关机越早停止。常用锚点：

| START | 服务 |
|---|---|
| 10 | system、sysctl 等基础 |
| 20 | network（netifd） |
| 30+ | firewall、无线 |
| 50 | cron |
| 90+ | 一般应用服务 |

- 依赖网络的服务：START > 20，或改用接口触发器（更稳）。
- `depends()`：返回本服务的硬依赖名（部分排序工具会读），一般不必写。
- 开机与手动 start 走同一入口 `start_service`，没有单独的 boot 钩子（不要再写 `boot()` 期望 procd 调用）。

---

## 14. 综合完整示例

### 14.1 单实例 + 校验 + jail + 热重载（生产级模板）

```sh
#!/bin/sh /etc/rc.common

START=90
STOP=10

USE_PROCD=1

PROG=/usr/sbin/myservice
CONF_DIR=/var/etc
CONF=$CONF_DIR/myservice.conf

# ---------- 配置生成 ----------
generate_conf() {
    local cfg="$1"
    mkdir -p $CONF_DIR
    {
        echo "port = $port"
        echo "listen = $listen"
        echo "mode = $mode"
    } > $CONF_DIR/myservice.conf.$cfg
    ln -sf $CONF_DIR/myservice.conf.$cfg $CONF
}

# ---------- 校验 ----------
validate_myservice_section() {
    uci_load_validate myservice myservice "$1" "$2" \
        'enabled:bool:0' \
        'port:port:8000' \
        'listen:ipaddr:0.0.0.0' \
        'mode:or("active","passive"):active'
}

# ---------- 钩子 ----------
start_service() {
    config_load myservice
    config_foreach validate_myservice_section myservice start_instance
}

start_instance() {
    [ "$2" = 0 ] || { echo "validation failed"; return 1; }
    [ "$enabled" = "1" ] || return 0

    generate_conf "$1"

    procd_open_instance "$1"
    procd_set_param command $PROG -c $CONF
    procd_set_param respawn 3600 5 5
    procd_set_param file $CONF
    procd_set_param data port="$port" mode="$mode"
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_set_param limits core="unlimited"
    procd_set_param user nobody
    procd_set_param reload_signal USR1

    procd_add_jail myservice log procfs
    procd_add_jail_mount $CONF /etc/passwd /etc/group /etc/TZ /etc/hosts
    procd_add_jail_mount_rw /var/run/myservice

    procd_close_instance
}

reload_service() {
    # 重新生成配置 → set 一次 → procd 按 file/data 变化决定重启或发信号
    config_load myservice
    config_foreach validate_myservice_section myservice generate_conf
    start
}

stop_service() {
    rm -f /var/run/myservice/*
}

service_triggers() {
    procd_add_reload_trigger "myservice"
    procd_add_validation validate_myservice_section
    procd_add_reload_interface_trigger "wan"
}

service_started() {
    logger -t myservice "service started (port=$port mode=$mode)"
}
```

### 14.2 多实例（每 section 一个进程，可单独停止）

```sh
start_service() {
    config_load tunnels
    config_foreach start_tunnel tunnel
}

start_tunnel() {
    local cfg="$1" port remote enabled
    config_get_bool enabled "$cfg" enabled 0
    [ "$enabled" = 1 ] || return 0
    config_get port "$cfg" port
    config_get remote "$cfg" remote

    procd_open_instance "$cfg"
    procd_set_param command /usr/sbin/tunneld -p "$port" -r "$remote"
    procd_set_param respawn
    procd_set_param netdev "eth1"
    procd_close_instance
}
```

操作：

```sh
/etc/init.d/tunnels status
/etc/init.d/tunnels stop tun_beijing     # 只停一个
ubus call service list '{"name":"tunnels","verbose":true}'
```

---

## 15. 调试命令大全

```sh
# —— 查看注册信息 ——
ubus call service list '{"name":"myservice","verbose":true}'
/etc/init.d/myservice info
/etc/init.d/myservice status            # 退出码: 0运行 3未注册 4无此实例 5停止

# —— 观察脚本→procd 的消息（打印组装的 JSON）——
PROCD_DEBUG=1 /etc/init.d/myservice start

# —— 事件排查（触发器为什么不触发）——
ubus listen                             # 另开终端，然后 reload_config 观察事件
ubus call service event '{"type":"config.change","data":{"package":"myservice"}}'

# —— 手动控制 ——
ubus call service signal '{"name":"myservice","signal":1,"instance":"tun0"}'
ubus call service delete '{"name":"myservice","instance":"tun0"}'

# —— 日志 ——
logread -e myservice
logread -f -e myservice                 # 实时跟踪

# —— 跟踪运行（生成 seccomp 白名单）——
/etc/init.d/myservice trace
ls /tmp/*.json.*

# —— 看进程是否被 jail ——
cat /proc/$(pidof myservice)/status | grep -i ns
ls /proc/$(pidof myservice)/root/
```

---

## 16. 常见坑与 FAQ

1. **进程 daemonize 了** → procd 认为秒退，respawn 风暴。务必前台运行；非要后台化就干脆别用 procd。
2. **`procd_set_param respawn "3600 5 5"`**（拼成一个参数）→ 解析错乱，写成三个独立参数。
3. **reload 不触发**：没写 `procd_add_reload_trigger`；或 commit 后没 `reload_config`。
4. **reload 触发了但没效果**：`reload_service` 里什么都没做，且没有重新 `start` 让 procd 比对 file/data；记住 reload 默认 = start 的语义只在"未定义 reload_service"时成立。
5. **stop_service 里 kill 进程**：procd 随后找不到进程状态会异常；只做清理。
6. **多实例名冲突**：`procd_open_instance` 不写名默认 instance1/2…，多次 start 会相互覆盖；用 section 名命名。
7. **触发器风暴**：uci 批量修改 + 每个都 reload_config → 服务反复重启。调大 `PROCD_RELOAD_DELAY` 去抖。
8. **网桥不触发接口事件**：监听 br-lan 的成员口或改用 `ifupdate`。
9. **file 指向 /tmp 下文件被重建**：md5 每回都变导致无谓重启；生成时保持内容稳定（排序、去时间戳）。
10. **status 与实际情况不符**：实例 command 里有随机参数（如临时端口）导致每次 set 都重启——把随机部分挪出 command，或打进 data 管理。
11. **jail 里读不到文件**：忘了 `procd_add_jail_mount`，jail 根是独立 tmpfs。
12. **手动 cp 的 init 脚本不生效**：没建 rc.d 软链，执行 `/etc/init.d/myservice enable`。

---

## 17. 速查表（Cheat Sheet）

```sh
#!/bin/sh /etc/rc.common
START=90; STOP=10; USE_PROCD=1; PROG=/usr/sbin/xxx

start_service() {                 # 必需：声明实例
    procd_open_instance [name]
    procd_set_param command $PROG [args...]   # 必须，前台进程
    procd_set_param respawn 3600 5 5
    procd_set_param file /var/etc/xxx.conf    # 文件变→自动重启
    procd_set_param data k=v                  # 数据变→自动重启
    procd_set_param netdev eth1               # 网口变→重启
    procd_set_param env A=1                   # 环境变量
    procd_set_param stdout 1 stderr 1 facility daemon
    procd_set_param user nobody group nogroup
    procd_set_param limits core="unlimited"
    procd_set_param nice -5 term_timeout 10 reload_signal USR1
    procd_append_param command --extra        # 追加参数
    procd_close_instance
}

stop_service()    { rm -f /var/run/xxx.pid; }            # stop 时善后（进程由 procd 杀）
service_started() { :; }                                 # start 完成后回调
service_stopped() { :; }                                 # stop 完成后回调
reload_service()  { procd_send_signal xxx '*' HUP; }     # 不定义则 reload=start
service_triggers() {
    PROCD_RELOAD_DELAY=1000
    procd_add_reload_trigger "xxx"
    procd_add_reload_interface_trigger "wan"
    procd_add_reload_data_trigger "key1"
    procd_add_reload_mount_trigger /mnt/usb
    procd_add_raw_trigger "my.event" 1000 /etc/init.d/xxx reload
    procd_add_validation validate_xxx_section
}
```

| 命令 | 行为 |
|---|---|
| `start` | set 服务；按 md5 diff 决定不动/重启/新建 |
| `stop [实例]` | stop_service → procd_kill（可只停某实例） |
| `reload` | 定义了 reload_service 则执行之，否则 = start |
| `restart` | stop + start |
| `status/info/running` | 查询（支持实例参数） |
| `trace` | 带 TRACE_SYSCALLS 启动（seccomp 用） |
