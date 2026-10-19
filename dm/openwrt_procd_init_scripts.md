# OpenWrt procd init 脚本参考手册

> **核验说明**：本版已逐条对照 OpenWrt main 分支源码核验（2026-10-19）：
> - `/lib/functions/procd.sh`（openwrt/openwrt@main，全部函数实现与头注释）
> - `/etc/rc.common`（openwrt/openwrt@main，命令分派与 procd 集成路径）
> - `/sbin/reload_config`（openwrt/openwrt@main，配置变更通知机制）
>
> 正文标 **【main 已核验】** 的条目可直接信赖；标 **【实现相关】** 的条目（C 端 procd 行为、编译选项、分支差异）仍需在目标固件按第 18 节核验。
> 文末附本次修订的完整对照表。

## 目录

1. [先理解 procd 的模型](#1-先理解-procd-的模型)
2. [最小可用脚本](#2-最小可用脚本)
3. [生命周期与命令行为](#3-生命周期与命令行为)
4. [实例 API](#4-实例-api)
5. [procd_set_param 参数参考](#5-procd_set_param-参数参考)
6. [动态追加参数](#6-动态追加参数)
7. [配置变更与触发器](#7-配置变更与触发器)
8. [UCI 配置读取与校验](#8-uci-配置读取与校验)
9. [jail、seccomp 与权限收敛](#9-jailseccomp-与权限收敛)
10. [service_data 与服务间联动](#10-service_data-与服务间联动)
11. [运行时控制与查询](#11-运行时控制与查询)
12. [自定义 init 命令](#12-自定义-init-命令)
13. [启动顺序与依赖](#13-启动顺序与依赖)
14. [实战模板](#14-实战模板)
15. [排错流程](#15-排错流程)
16. [常见错误清单](#16-常见错误清单)
17. [速查表](#17-速查表)
18. [在目标固件上核验 API](#18-在目标固件上核验-api)
19. [附：本次修订对照表](#19-附本次修订对照表)

---

## 1. 先理解 procd 的模型

OpenWrt init 脚本常见两类：

| 模式 | 特征 | 适用情况 |
|---|---|---|
| 传统 shell 管理 | 脚本自行启动、查找和终止进程 | 一次性任务，或确实不需要 procd 管理的程序 |
| procd 管理 | `USE_PROCD=1`，通过声明服务实例交给 procd 管理 | 长期运行的 daemon |

### 1.1 服务、实例和进程

- **服务（service）**：对应 `/etc/init.d/myservice` 这个脚本。
- **实例（instance）**：服务内的一组运行参数；一个服务可以声明一个或多个实例。
- **进程（process）**：由 procd 按实例配置启动并监管的程序。
- `procd_open_instance [name]` 为实例开始组装配置。**【main 已核验】** 不传名字时自动命名为 `instance<N>`（`instance1`、`instance2`……按声明顺序递增，见 `_procd_open_instance`）。需要稳定地单独操作某实例时，必须显式命名（通常用 UCI section 名）。
- **实例比较机制【main 已核验】**：再次 start（ubus `service set`）时，procd 逐实例比较 command/env/data/limits/file 等参数，其中 `file` 列出的文件按**内容 md5** 参与比较。无差异的实例保持原进程不动；有差异的实例先停后起。因此 start 是幂等的——配置没变就不会引起进程抖动。
- **set / add 语义【main 已核验，见 rc.common 的 `rc_procd`】**：
  - `/etc/init.d/x start`（不带参数）→ ubus `service set`：整体替换该服务的注册（消失的旧实例会被删除）。
  - `/etc/init.d/x start <实例名>` → ubus `service add`：只增改指定实例，其他实例不动。可用于多实例服务的增量更新。

### 1.2 daemon 应以前台模式运行

交给 procd 管理的程序通常应使用前台模式，不要自行 daemonize，也不要在命令后加 `&`。否则 procd 可能只观察到父进程退出，造成监管对象不正确或反复重启。

### 1.3 脚本入口

```sh
#!/bin/sh /etc/rc.common

START=90
STOP=10
USE_PROCD=1
```

`USE_PROCD=1` 让 `rc.common` 使用 procd 集成路径。通常实现 `start_service()`、`stop_service()`、`reload_service()` 等钩子，而不是自行重写 `start()`、`stop()`。重写这些命令会绕开框架默认行为（包括 `service_started`/`service_stopped` 回调和 set/add 语义）。

---

## 2. 最小可用脚本

假设服务通过 UCI 管理配置，配置文件为 `/etc/config/myservice`，并从 UCI 读取 `port` 后作为命令行参数传给程序：

```sh
#!/bin/sh /etc/rc.common

START=90
STOP=10
USE_PROCD=1

start_service() {
    local port

    [ -x /usr/sbin/myservice ] || {
        logger -t myservice "executable not found"
        return 1
    }

    config_load myservice
    config_get port main port 8080

    case "$port" in
        ''|*[!0-9]*)
            logger -t myservice "invalid port: $port"
            return 1
            ;;
    esac

    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || {
        logger -t myservice "port out of range: $port"
        return 1
    }

    procd_open_instance
    procd_set_param command /usr/sbin/myservice --port "$port" --foreground
    procd_set_param respawn 3600 5 5
    procd_set_param file /etc/config/myservice
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}

service_triggers() {
    procd_add_reload_trigger "myservice"
}
```

`--port` 和 `--foreground` 是示例程序参数，需替换为实际程序支持的选项。`config_load myservice` 读取的是 `/etc/config/myservice`；不要把 UCI 文件路径直接传给程序的 `-c` 参数，除非该程序明确支持 UCI 格式。`file` 让该文件按内容 md5 参与实例比较（见 1.1）；它不能替代配置触发器。

保存为 `/etc/init.d/myservice` 后：

```sh
chmod 0755 /etc/init.d/myservice
sh -n /etc/init.d/myservice          # 语法检查
/etc/init.d/myservice enable
/etc/init.d/myservice start
/etc/init.d/myservice status
logread -e myservice
```

---

## 3. 生命周期与命令行为

### 3.1 钩子

| 钩子 | 存在性 | 用途 | 注意事项 |
|---|---|---|---|
| `start_service()` | 【main 已核验】 | 声明需要运行的实例 | 在这里准备配置、读取 UCI、调用 `procd_open_instance` / `procd_set_param` |
| `stop_service()` | 【main 已核验】 | 停止前的清理工作 | 在 `procd_kill` **之前**执行；不要在这里重复 kill 主进程 |
| `reload_service()` | 【main 已核验】 | 自定义 reload 行为 | 一旦定义，框架**只**调用它，不再自动重新声明实例 |
| `service_triggers()` | 【main 已核验】 | 声明配置或其他事件触发器 | 在注册流程末尾、triggers 数组已打开时被调用，直接调用 `procd_add_*` 即可 |
| `service_data()` | 【main 已核验】 | 附加服务数据 | 与 `start_service()` 是两次独立调用，**局部变量不共享**，需重新读取或用全局变量 |
| `service_started()` | 【main 已核验】 | start 注册流程结束后的回调 | 不等于进程已完成初始化或健康检查 |
| `service_stopped()` | 【main 已核验】 | stop 流程结束后的回调 | 在 `procd_kill` 之后调用 |
| `status_service()` | 【main 已核验】 | 自定义 status 输出 | 定义后完全接管 `status` 命令（包括退出码） |

`service_triggers()` 的调用上下文【main 已核验，见 `_procd_close_service`】：procd 已打开 `triggers` JSON 数组并处于 procd namespace，直接调用各 `procd_add_*_trigger` 即可；不需要（也不应）手工调用 `procd_open_trigger` / `procd_close_trigger`。

### 3.2 命令语义

| 命令 | 行为 | 来源 |
|---|---|---|
| `start [instance]` | 无参数 → `set` 整体注册；带实例名 → `add` 增量注册 | rc.common |
| `stop [instance]` | 先 `stop_service()`，再 `procd_kill`（可指定实例），最后 `service_stopped()` | rc.common |
| `restart` | `stop` 后 `start`（中间屏蔽 TERM） | rc.common |
| `reload` | 定义了 `reload_service()` → 加锁调用之；否则 → `start` | rc.common |
| `enable` / `disable` | 管理 `/etc/rc.d/S??name`、`K??name` 软链接；`enable` 要求至少定义 START 或 STOP 之一，否则返回 1 | rc.common |
| `enabled` | 检查开机启动软链接是否存在，退出码 0/非 0 | rc.common |
| `running [instance]` | `service_running` → 退出码 0/非 0 | rc.common |
| `status [instance]` | 见下方返回码表 | rc.common |
| `trace` | 置 `TRACE_SYSCALLS=1` 后走 start，实例带 trace 标记；需固件编译支持 | rc.common |
| `info` | verbose 的 `service list`（等价 `ubus call service list '{"name":"x","verbose":true}'`） | rc.common |
| `boot` / `shutdown` / `depends` | 由启动序列/opkg 调用；init 脚本一般不用 | rc.common |

**`status` 退出码【main 已核验，见 `_procd_status`】**（未定义 `status_service` 时）：

| 输出 | 退出码 |
|---|---|
| `running` | 0 |
| `running (n/m)`（部分实例运行） | 0 |
| `inactive`（服务未注册） | 3 |
| `unknown instance <name>` | 4 |
| `not running` | 5 |

**不要把“配置已提交给 procd”当成“业务进程已经就绪”。** 需要就绪判断时使用程序自身的健康检查、ubus 状态或明确的就绪机制。

### 3.3 reload 的正确设计

三种设计，按程序能力选一种。

**方案 A：程序支持信号热加载【main 已核验】**

```sh
reload_service() {
    procd_send_signal myservice '*' HUP
}
```

main 分支的 `_procd_send_signal` 对 instance 为 `'*'` 时不发送 instance 字段，procd 端解释为“所有实例”。仅当程序明确支持 `SIGHUP` 重载时使用；18.06 及更早分支的该函数实现可能不同，旧固件先 grep 核验。

**方案 B：重新生成配置，再重新声明实例**

程序不支持热加载时，让配置触发器执行 reload，reload 中重新生成配置并重新走 start 注册流程（无参数 start = set 整体替换，会正确清理被删除的实例）。直接把逻辑抽成独立函数，`reload_service()` 里调用它再 `start`，避免重复 start 入口造成的锁重入：

```sh
generate_config() {
    # 从 UCI 生成 /var/etc/myservice.conf
    ...
}

reload_service() {
    generate_config
    start
}
```

**方案 C：完整重启**

```sh
reload_service() {
    restart
}
```

不能安全热加载时这通常比不完整的 reload 更安全。不要为了“看起来优雅”而实现一个不完整的 `reload_service()`，导致配置改了却没有重新声明实例。

---

## 4. 实例 API

以下函数由 `/lib/functions/procd.sh` 提供（【main 已核验】）：

| 函数 | 形式 | 作用 |
|---|---|---|
| `procd_open_instance [name]` | `procd_open_instance "vpn_a"` | 开始声明一个实例；缺省名 `instance<N>` |
| `procd_close_instance` | `procd_close_instance` | 结束当前实例声明；respawn 为空时补默认值（见 5.2） |
| `procd_set_param <type> [args...]` | `procd_set_param command /usr/sbin/app` | 设置实例参数（见第 5 节类型表） |
| `procd_append_param <type> [args...]` | `procd_append_param command --verbose` | 向已声明参数追加内容（见第 6 节） |
| `procd_add_instance <command...>` | `procd_add_instance /usr/sbin/app -f` | 快捷方式 = open + command + close，无需任何其他参数时使用 |
| `procd_open_service` / `procd_close_service` | 框架内部使用 | 服务级消息开始/结束；`rc_procd` 已代为处理 |
| `procd_open_trigger` / `procd_close_trigger` | 框架内部使用 | triggers 数组开闭；`service_triggers()` 内直接 add 即可 |

日常 init 脚本只需要：`procd_open_instance`、`procd_set_param`、`procd_append_param`、`procd_close_instance`。

### 4.1 多实例示例

```sh
#!/bin/sh /etc/rc.common

START=90
USE_PROCD=1

start_service() {
    start_tunnel "tunnel_a" 10001 "192.0.2.10"
    start_tunnel "tunnel_b" 10002 "192.0.2.20"
}

start_tunnel() {
    local name="$1"
    local port="$2"
    local remote="$3"

    procd_open_instance "$name"
    procd_set_param command /usr/sbin/tunneld -p "$port" -r "$remote"
    procd_set_param respawn 3600 5 5
    procd_close_instance
}
```

操作：

```sh
/etc/init.d/tunnels status
/etc/init.d/tunnels stop tunnel_a      # 只停 tunnel_a【main 已核验：procd_kill 支持实例参数】
/etc/init.d/tunnels start tunnel_a     # 只重新注册 tunnel_a（add 语义，tunnel_b 不动）
```

注意：不带参数的 `stop`（`procd_kill name`）会停掉全部实例。实例名是 procd 注册对象的名称，不是 PID。

---

## 5. procd_set_param 参数参考

基本语法：

```sh
procd_set_param <type> [value...]
```

**类型总览【main 已核验，见 `_procd_set_param`】**：

| 类型 | JSON 形态 | 值 |
|---|---|---|
| `command` | array | 可执行文件 + 每个命令行参数一项 |
| `respawn` | array | 3 个整数（见 5.2） |
| `env` / `data` / `limits` | table | `KEY=value` 成对，每对一项 |
| `file` / `netdev` / `watch` / `watchdog` | array | 每项一个值 |
| `nice` / `term_timeout` | int | 整数 |
| `reload_signal` | int | 信号名（自动转数字） |
| `pidfile` / `user` / `group` / `seccomp` / `capabilities` / `facility` / `extroot` / `overlaydir` / `tmpoverlaysize` / `vrf` | string | 单值 |
| `stdout` / `stderr` / `no_new_privs` | bool | 0 / 1 |
| `error` | array | 实例声明失败时展示的错误信息 |

对于 array 类型，**每个值必须是独立 shell 参数**，不要做 shell 级拼接。

### 5.1 `command`

```sh
procd_set_param command /usr/sbin/myservice --foreground
```

- 第一个元素是可执行文件，其余每个元素是一个参数。
- 不要把整条命令包成一个字符串（`"/usr/sbin/app -c /x"` 会被当成含空格的一个可执行路径）。
- 不经过 shell，`*`、管道、重定向、`$(...)` 都不会生效。确需 shell 逻辑时显式 `/bin/sh -c '...'` 并自行处理注入风险；更推荐写进独立脚本。

### 5.2 `respawn`

```sh
procd_set_param respawn <fail_threshold> <restart_timeout> <max_fail>
```

三个参数的官方命名（procd.sh 头注释）：`$fail_threshold $restart_timeout $max_fail`。

- `fail_threshold`（秒）：守护窗口。进程**连续稳定运行超过该时长后**再退出，失败计数清零重新统计；运行不满该时长就退出，记 1 次失败。
- `restart_timeout`（秒）：进程退出后、再次拉起前等待的时间。
- `max_fail`：失败计数上限。累计失败达到该值后 procd 放弃重启，实例进入 failed 状态（ubus 中 `running=false`、`/etc/init.d/x status` 显示 `not running`）。之后 `/etc/init.d/x restart` 可重新拉起并复位计数。

`respawn 3600 5 5` 的完整含义：进程退出后等 5 秒重启；若每次运行不到 3600 秒就崩溃，连续崩溃满 5 次后放弃；任一次稳定运行超过 3600 秒则计数清零。

**默认值【main 已核验，见 `_procd_close_instance`】**：写 `procd_set_param respawn` 不带值时，依次取 UCI `system.@service[0].respawn_threshold` / `respawn_timeout` / `respawn_retry`，缺省 `3600 5 5`。生产服务建议显式写出并注释理由。

```sh
# 正确：三个独立参数
procd_set_param respawn 3600 5 5

# 错误：一个含空格的单一参数
procd_set_param respawn "3600 5 5"
```

### 5.3 `env`

```sh
procd_set_param env LANG=C
procd_set_param env APP_MODE=production
```

每次调用设置一对 `KEY=value`（table 类型，可多次调用）。不要把秘密凭据放进 env——它可能被 ubus/调试输出/进程信息暴露。

### 5.4 `file`

```sh
procd_set_param file /etc/config/myservice
procd_set_param file /var/etc/generated.conf
```

把文件路径纳入实例比较：**procd 按文件内容 md5 判断**。start/reload 重新提交时，文件内容变化 → 该实例被重启。`file` 不产生独立事件，只是实例差异比较的一部分。UCI 管理的服务监测 `/etc/config/myservice`；`/var/etc/generated.conf` 适用于确实生成了该文件的场景。

### 5.5 `data`

```sh
procd_set_param data port=8080
procd_set_param data mode=proxy
```

附加键值数据（table），参与实例比较；也是服务间数据联动的载体（见第 10 节）。

### 5.6 `netdev` 与 `watch`

```sh
procd_set_param netdev eth1
procd_set_param watch network.interface
```

依赖 procd 的事件监听机制，细节【实现相关】。不要将其等同于“接口 up/down 必定重启”。若要接口状态变化后重配服务，优先用 7.3 的接口触发器，并在目标设备用 `ubus listen` 验证。

### 5.7 `watchdog`

```sh
procd_set_param watchdog 30
```

array 类型，值为超时秒数。启用后 procd 为该实例打开看门狗，进程必须周期性写 `/dev/watchdog` 喂狗，超时未喂则被 procd 重启。适合需要硬超时保障的长驻进程；普通服务不需要。可用性与行为【实现相关，较新版本才有】。

### 5.8 `stdout`、`stderr` 与 `facility`

```sh
procd_set_param stdout 1
procd_set_param stderr 1
procd_set_param facility daemon
```

**【main 已核验】** `stdout` / `stderr` 默认 `0`，`facility` 默认 `daemon`。每种类型单独调用：

```sh
# 错误：一个调用混写两种类型
procd_set_param stdout 1 stderr 1
```

查看日志：

```sh
logread -e myservice
logread -f
```

程序自行写入独立日志文件时，这两个设置不会接管那个文件。

### 5.9 `limits`

```sh
procd_set_param limits core="unlimited" nofile="1024"
```

table 类型，每个 `key=value` 一项。可用 key（core/nofile/stack 等）与值语法取决于 procd 的 ulimit 实现，先用保守值测试。

### 5.10 `user`、`group`、`nice`

```sh
procd_set_param user nobody
procd_set_param group nogroup
procd_set_param nice 5
```

- `user` / `group`：以指定账户运行，前提是该账户存在。
- 降权前确认配置、运行目录、socket、设备节点、日志目标的访问权限。
- 不要为省事直接给所有文件开写权限或无条件以 root 运行。

### 5.11 `pidfile`、`term_timeout`、`reload_signal`

```sh
procd_set_param pidfile /var/run/myservice.pid
procd_set_param term_timeout 10
procd_set_param reload_signal HUP
```

`reload_signal` 传信号名（procd 内部转成数字）【main 已核验】。三个参数的具体语义【实现相关】：`pidfile` 不等于“procd 靠它接管任意后台进程”；`reload_signal` 是实例内部 reload 通道的一部分，不要当成用户执行 `reload` 命令时必定发送的信号（用户 `reload` 走 `reload_service()`）。

### 5.12 `error`

```sh
procd_set_param error "config validation failed"
```

实例声明自带的错误信息，`status` / ubus 输出中可见。配合配置校验失败时使用，给出可读原因。

### 5.13 安全相关参数

`seccomp`、`capabilities`、`no_new_privs`、`jail` 相关函数、`extroot` / `overlaydir` / `tmpoverlaysize` / `vrf` 等为高级能力，不是统一 API。启用前核验：固件是否编译该功能、本机 `procd.sh` 是否支持（见第 5 节类型表）、程序在受限环境需要哪些文件/设备/能力、失败时是否有可读日志和回退方式。详见第 9 节。

---

## 6. 动态追加参数

`procd_append_param <type> [value...]` 常用于按条件添加命令行参数：

```sh
start_service() {
    local debug="1"
    local bind_addr="192.0.2.1"

    procd_open_instance
    procd_set_param command /usr/sbin/myservice --foreground

    [ "$debug" = "1" ] && procd_append_param command --debug
    [ -n "$bind_addr" ] && procd_append_param command --bind "$bind_addr"

    procd_close_instance
}
```

列表参数示例（每个 UCI list 项变成一个独立命令行参数）：

```sh
append_listen() {
    procd_append_param command --listen "$1"
}

start_service() {
    procd_open_instance
    procd_set_param command /usr/sbin/myservice

    config_load myservice
    config_list_foreach "main" listen append_listen

    procd_close_instance
}
```

注意：不要把一串空格分隔的参数当成一个值传递；`procd_append_param` 前若该类型尚未 `set_param`，会自动创建【main 已核验，见 `_procd_append_param`】。

---

## 7. 配置变更与触发器

### 7.1 UCI 变更触发与 reload_config 的真实机制【main 已核验】

`procd_add_reload_trigger "myservice"` 注册的触发器结构为：

```
["config.change", [["if"], ["eq","package","myservice"], ["run_script","/etc/init.d/myservice","reload"]]]
```

而 `/sbin/reload_config` 的实现是：把 `/etc/config/*`（含 `/var/run/uci/*`）逐一 `uci show` 导出，与上次保存的 `/var/run/config.md5` 比对，**内容有变化的包**才发事件：

```sh
ubus call service event '{ "type": "config.change", "data": { "package": "<pkgname>" } }'
```

由此得到几个确切结论：

1. `uci commit` 只写文件，**不发事件**；必须执行 `reload_config` 才会比对并通知（LuCI “保存并应用”会自动调）。
2. 通知是**按内容 diff** 的：手工直接编辑 `/etc/config` 文件（没走 uci）也能被检测到。
3. 触发器最终执行的是 `/etc/init.d/myservice reload`。

完整流程：

```sh
uci set myservice.main.port='8081'
uci commit myservice
reload_config
# → config.change(myservice) → /etc/init.d/myservice reload
```

### 7.2 触发器与 `file` / `data` 参数的分工

| 机制 | 作用 | 典型用途 |
|---|---|---|
| `procd_add_reload_trigger` | 配置包内容变化 → 服务 reload | 让服务重新读取 UCI |
| `procd_set_param file` | 文件内容 md5 参与实例比较 | 生成文件变化时重启实例 |
| `procd_set_param data` | 键值参与实例比较 | 非文件配置参与差异比较 |

三者互补。最可靠的流程：UCI 变更事件触发 reload → 服务重新生成运行配置 → 重新声明实例（set 比较后自动重启有变化的实例）。

### 7.3 网络接口触发器【main 已核验】

```sh
service_triggers() {
    procd_add_reload_interface_trigger "wan"
}
```

main 分支实现：注册 `interface.*` 事件且 `data.interface == "wan"` 的触发器，命中后执行 `/etc/init.d/<本脚本名> reload`。

要点：
- 参数是**逻辑接口名**（`/etc/config/network` 中 `config interface` 的名字，如 `wan`），**不是设备名**（`eth1`）。
- 匹配 `interface.*` 事件族（up、down 等都算），不是只有 up。
- 触发动作固定为 `reload`；需要自定义动作用 `procd_add_interface_trigger <事件> <接口> <命令...>`【main 已核验存在】。

### 7.4 mount、raw、config、data 触发器【main 已核验函数存在】

```sh
grep -n 'procd_add_.*trigger' /lib/functions/procd.sh
```

| 函数 | 说明 |
|---|---|
| `procd_add_reload_mount_trigger <路径...>` | 挂载点变化（`mount.add`）→ reload。内部用 `procd_get_mountpoints` 结合 `/etc/config/fstab` 解析路径对应的挂载点 |
| `procd_add_restart_mount_trigger <路径...>` | 同上，动作为 restart |
| `procd_add_raw_trigger <事件> <超时ms> <命令...>` | 任意 ubus 事件触发任意命令，最灵活 |
| `procd_add_config_trigger <事件> <包名> <命令...>` | 通用 config 事件触发 |
| `procd_add_reload_data_trigger <数据键...>` | **24.10 新增**：其他服务 `service_data` 变化 → `service.data.update` 事件 → 按数据键名匹配 → 本服务 reload。事件 data 格式建议用 `ubus listen` 实测 |

复制来源不明的示例前，务必打开函数体核对参数顺序。

### 7.5 去抖和事件风暴

`PROCD_RELOAD_DELAY`【main 已核验】：**毫秒**，默认 `1000`。触发器命中后按该延迟合并执行，避免批量改配置时反复 reload。可导出该变量调整。批量改配置时避免逐项单独触发 reload。

---

## 8. UCI 配置读取与校验

### 8.1 读取与基本校验

`/lib/functions.sh` 提供 `config_load`、`config_foreach`、`config_get`、`config_get_bool`、`config_list_foreach`。签名：`config_get <变量> <section> <option> [默认值]`。

```sh
start_service() {
    local enabled port

    config_load myservice
    config_get_bool enabled main enabled 0
    config_get port main port 8080

    [ "$enabled" = "1" ] || return 0

    case "$port" in
        ''|*[!0-9]*)
            logger -t myservice "invalid port: $port"
            return 1
            ;;
    esac

    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || {
        logger -t myservice "port out of range: $port"
        return 1
    }

    procd_open_instance
    procd_set_param command /usr/sbin/myservice --port "$port"
    procd_close_instance
}
```

### 8.2 `uci_validate_section` / `uci_load_validate`【main 已核验】

**注意：这两个函数定义在 `/lib/functions/procd.sh`，不在 `/lib/functions.sh`。**

```sh
grep -n 'uci_validate_section\|uci_load_validate' /lib/functions/procd.sh
```

用法：字段语法 `'name:type:default'`，支持的类型由 `/sbin/validate_data` 决定（常见 `bool`、`port`、`integer`、`uinteger`、`range`、`ipaddr`、`string` 等，以本机为准）。**校验通过后字段值导出为同名 shell 变量。**

```sh
validate_myservice() {
    uci_validate_section myservice myservice "$1" \
        'enabled:bool:0' \
        'port:port:8080' \
        'bind_addr:ipaddr'
}

service_triggers() {
    procd_add_reload_trigger "myservice"
    procd_add_validation validate_myservice
}

start_service() {
    local enabled port bind_addr

    config_load myservice
    uci_load_validate myservice myservice main "" || {
        logger -t myservice "config validation failed"
        procd_set_param error "config validation failed" 2>/dev/null
        return 1
    }

    [ "$enabled" = "1" ] || return 0

    procd_open_instance
    procd_set_param command /usr/sbin/myservice --port "$port" --foreground
    [ -n "$bind_addr" ] && procd_append_param command --bind "$bind_addr"
    procd_set_param respawn 3600 5 5
    procd_close_instance
}
```

要点：
- `uci_load_validate <包> <类型> <section> <回调> [字段...]`：回调签名为 `<回调> <section> <校验结果>`，传 `""` 表示不回调。
- `procd_add_validation`【main 已核验】把校验函数挂进注册消息，LuCI “保存并应用”可据此在提交前预检并弹出字段级错误。
- 依赖 `/sbin/validate_data`，极简固件可能没有。
- 校验失败必须 `return 1` 或跳过实例，不要打印错误后继续注册。
- 上述 `procd_set_param error` 在 start 注册流程外调用会因 JSON 上下文不存在而失败，故加 `2>/dev/null`；更常见的做法是在 `status`/日志中给出原因，或在校验失败时输出到 `logger`。

---

## 9. jail、seccomp 与权限收敛

这些功能有版本和编译选项要求，必须在目标固件验证后使用。不要把安全隔离配置当成可直接复制到任意服务的通用模板。

### 9.1 jail / ujail【flags 列表 main 已核验】

```sh
command -v ujail
grep -n 'procd_add_jail' /lib/functions/procd.sh
```

```sh
procd_add_jail myservice ronly netns
procd_add_jail_mount /etc/myservice.conf /lib/libnss_dns.so.2
procd_add_jail_mount_rw /var/run/myservice /var/log/myservice
```

`procd_add_jail` 支持的 flags（main）：`log`（允许写日志）、`ubus`（允许 ubus socket）、`udebug`（允许 udebug）、`procfs`、`sysfs`、`ronly`（根只读）、`requirejail`（ujail 不可用时拒绝启动而非降级）、`netns`、`userns`、`cgroupsns`。

隔离清单要逐项核对：程序及动态库、配置/证书/时区/解析文件、可写状态目录、socket/设备/DNS/ubus、运行用户与目录权限。**挂载过少服务起不来，挂载过多隔离失效。** `requirejail` 的降级行为【实现相关】，先核验。

### 9.2 seccomp

目标构建支持时 procd 可加载系统调用过滤配置（`procd_set_param seccomp /etc/seccomp/myservice.json`）。先用 strace 覆盖全部功能路径（DNS、重连、异常处理、重载、升级）再收紧规则；未经测试的规则不能视为安全白名单。

### 9.3 capabilities 与降权

- 能以普通用户运行就不要 root；确有需要才保留特定 capability（`procd_set_param capabilities "cap_net_bind_service"` 格式【实现相关】）。
- 不要为启动方便无条件授予 `CAP_NET_ADMIN`。
- 降权后复查文件、目录、设备、socket 权限。

---

## 10. service_data 与服务间联动【main 已核验钩子】

`service_data()` 在注册消息收尾时被调用（若已定义），JSON 上下文已处于 data 对象内，直接 `json_add_*`：

```sh
service_data() {
    json_add_string version "1.2.3"
    json_add_string upstream "10.0.0.1"
}
```

**注意作用域**：`service_data()` 与 `start_service()` 是两次独立调用，start_service 的局部变量在这里不可用。需要的数据重新读取 UCI 或写入显式全局变量。

消费方（**24.10+**，`procd_add_reload_data_trigger`）：当某服务 data 中对应键的值变化时，procd 发出 `service.data.update` 事件，匹配键名的服务收到 reload：

```sh
# 关心 “upstream” 数据键变化的服务：
service_triggers() {
    procd_add_reload_data_trigger "upstream"
}
```

事件 data 的精确格式【实现相关】，先在目标固件用 `ubus listen` 观察。

---

## 11. 运行时控制与查询

函数来源分清：

| 函数 | 来源 | 用途 |
|---|---|---|
| `service_running [instance]` | rc.common | 本服务运行状态，退出码 0/非 0 |
| `procd_running <service> [instance]` | procd.sh | 任意服务/实例运行状态 |
| `procd_kill <service> [instance]` | procd.sh | 请求 procd 停止（框架 stop 已代调） |
| `procd_send_signal <service> [instance] [signal]` | procd.sh | 发信号；instance 为 `'*'` 或不传 = 全部实例【main 已核验】 |
| `procd_lock` / `procd_unlock` | procd.sh | flock 互斥（fd 1000），reload/start 等已自动使用 |
| `procd_set_config_changed <package>` | procd.sh | 手动发 `config.change`（reload_config 内部即用） |
| `procd_get_mountpoints <路径...>` | procd.sh | mount 触发器辅助 |

信号示例：

```sh
# 程序明确支持 USR1 时
procd_send_signal myservice '*' USR1
```

`status` 命令的退出码表见 3.2，可直接用于脚本判断：

```sh
if /etc/init.d/myservice status >/dev/null 2>&1; then
    logger -t myservice "service is running"
fi
```

---

## 12. 自定义 init 命令

`extra_command` 注册额外命令（19.07+；18.06 及更早用 `EXTRA_COMMANDS` / `EXTRA_HELP` 变量）：

```sh
#!/bin/sh /etc/rc.common

START=90
USE_PROCD=1

extra_command "check_config" "Validate myservice UCI configuration"

check_config() {
    local port

    config_load myservice
    config_get port main port 8080

    case "$port" in
        ''|*[!0-9]*)
            echo "Invalid port: $port" >&2
            return 1
            ;;
    esac

    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || {
        echo "Port must be between 1 and 65535" >&2
        return 1
    }
}
```

```sh
/etc/init.d/myservice check_config
```

注意：自定义命令默认不与 start/stop 抢锁；需要并发安全时自行 `procd_lock`。

---

## 13. 启动顺序与依赖

### 13.1 `START` 与 `STOP`

```sh
START=90
STOP=10
```

影响 init 脚本启停顺序，但不是完整依赖系统。`enable` 要求至少定义其一。

### 13.2 不要只依赖启动序号判断网络已就绪

`START` 比 network 大不保证 WAN 已有地址、VPN 已连接、DNS 可用。依赖网络的服务应：具备重试能力；用接口事件触发器（7.3）；避免在 init 脚本中无限等待；处理重连和地址变化。

### 13.3 `depends()` 与 `boot()`

`depends()` 是 opkg 安装期的依赖声明，**不是运行时依赖监督**。`boot()` 由 `/etc/rc.d/S*` 序列调用，走 `start`。不要定义了 `depends()` 就认为 procd 会帮你等依赖就绪。

---

## 14. 实战模板

占位程序名、参数、配置格式均需替换为实际内容。

### 14.1 单实例完整模板（UCI + 校验 + 触发器 + reload 策略）

`/etc/config/myservice`：

```text
config myservice 'main'
    option enabled '1'
    option port '8080'
```

`/etc/init.d/myservice`：

```sh
#!/bin/sh /etc/rc.common

START=90
STOP=10
USE_PROCD=1

PROG=/usr/sbin/myservice

validate_myservice() {
    uci_validate_section myservice myservice "$1" \
        'enabled:bool:0' \
        'port:port:8080'
}

start_service() {
    local enabled port

    [ -x "$PROG" ] || {
        logger -t myservice "program not found: $PROG"
        return 1
    }

    config_load myservice
    uci_load_validate myservice myservice main "" || {
        logger -t myservice "config validation failed"
        return 1
    }

    [ "$enabled" = "1" ] || return 0

    procd_open_instance
    procd_set_param command "$PROG" --port "$port" --foreground
    procd_set_param respawn 3600 5 5
    procd_set_param file /etc/config/myservice
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}

# 程序支持 SIGHUP 热加载时用方案 A；否则删掉本函数走默认（start 重新注册）
reload_service() {
    procd_send_signal myservice '*' HUP
}

service_triggers() {
    procd_add_reload_trigger "myservice"
    procd_add_validation validate_myservice
}
```

验证：

```sh
sh -n /etc/init.d/myservice
chmod 0755 /etc/init.d/myservice
/etc/init.d/myservice enable
/etc/init.d/myservice start
/etc/init.d/myservice status
/etc/init.d/myservice info        # verbose 注册信息
logread -e myservice

uci set myservice.main.port='8081'
uci commit myservice
reload_config
/etc/init.d/myservice status      # 端口变化 → 实例重启
```

### 14.2 多实例：每个 UCI section 对应一个进程

```text
config tunnel 'tunnel_a'
    option enabled '1'
    option port '10001'
    option remote '192.0.2.10'

config tunnel 'tunnel_b'
    option enabled '1'
    option port '10002'
    option remote '192.0.2.20'
```

```sh
#!/bin/sh /etc/rc.common

START=90
USE_PROCD=1

start_service() {
    config_load tunnels
    config_foreach start_tunnel tunnel
}

start_tunnel() {
    local cfg="$1"
    local enabled port remote

    config_get_bool enabled "$cfg" enabled 0
    [ "$enabled" = "1" ] || return 0

    config_get port "$cfg" port
    config_get remote "$cfg" remote

    case "$port" in
        ''|*[!0-9]*)
            logger -t tunnels "invalid port in section $cfg"
            return 1
            ;;
    esac

    [ -n "$remote" ] || {
        logger -t tunnels "missing remote in section $cfg"
        return 1
    }

    procd_open_instance "$cfg"
    procd_set_param command /usr/sbin/tunneld -p "$port" -r "$remote" --foreground
    procd_set_param respawn 3600 5 5
    procd_close_instance
}

service_triggers() {
    procd_add_reload_trigger "tunnels"
}
```

```sh
/etc/init.d/tunnels enable
/etc/init.d/tunnels start
/etc/init.d/tunnels status
/etc/init.d/tunnels stop tunnel_a     # 只停一个
/etc/init.d/tunnels start tunnel_a    # 只起一个（add 语义，其余不动）
```

### 14.3 需要先生成配置文件的 reload

```sh
generate_config() {
    # 从 UCI 生成 /var/etc/myservice.conf
    config_load myservice
    {
        echo "port=$port"
    } > /var/etc/myservice.conf
}

reload_service() {
    generate_config
    start        # 重新声明实例；file 的 md5 变化会触发实例重启
}

start_service() {
    generate_config
    procd_open_instance
    procd_set_param command /usr/sbin/myservice -c /var/etc/myservice.conf --foreground
    procd_set_param file /var/etc/myservice.conf
    procd_set_param respawn 3600 5 5
    procd_close_instance
}
```

---

## 15. 排错流程

按从低成本到高成本的顺序。

### 15.1 语法与权限

```sh
sh -n /etc/init.d/myservice
ls -l /etc/init.d/myservice
head -n 5 /etc/init.d/myservice
```

### 15.2 注册状态

```sh
/etc/init.d/myservice status; echo "rc=$?"
/etc/init.d/myservice info
ubus call service list
ubus call service list '{"name":"myservice","verbose":true}'   # 新版本支持按名过滤
```

`status` 退出码见 3.2（3=未注册、4=无此实例、5=已注册但进程不在），可直接定位问题。

### 15.3 日志

```sh
logread -e myservice
logread -f
```

同时检查程序是否把错误写到自己的文件、是否启动即退出、是否因配置路径/权限无法运行。

### 15.4 确认 shell API 存在

```sh
grep -n 'procd_set_param\|procd_append_param\|procd_add_reload_trigger' /lib/functions/procd.sh
grep -n 'procd_add_.*trigger\|procd_add_jail\|procd_add_validation' /lib/functions/procd.sh
```

无匹配 → 该函数在本机不存在，换本机支持的实现。

### 15.5 观察事件

```sh
ubus listen
```

另开终端执行 `uci commit` + `reload_config`、插拔网线、`ifup wan`，观察事件格式与触发器匹配条件是否一致。

### 15.6 进程与文件

```sh
ps w
ls -l /var/run/
```

procd 管理的进程不要在 stop 钩子里重复 kill；结合 status 退出码、日志和程序自身健康接口判断。

### 15.7 锁

procd 用 `flock`（fd 1000，锁文件 `/var/lock/procd_<服务名>.lock`）串行化 start/stop/reload。脚本卡死时检查锁持有者：

```sh
ls -l /var/lock/procd_*.lock
```

---

## 16. 常见错误清单

1. **daemon 自行后台化**：procd 跟踪到错误的父进程。启用前台模式。
2. **整条命令写成一个参数**：`command "/usr/sbin/app -c /x"` 不是“可执行文件 + 参数”。
3. **respawn 合成一个字符串**：应写 `respawn 3600 5 5`。
4. **一次调用混写多种类型**：`stdout 1 stderr 1` 是错的，分开调用。
5. **以为 `uci commit` 必然触发 reload**：commit 只写文件，须 `reload_config` 比对发事件（LuCI 会自动调）。
6. **定义了 reload 却没有真正重载**：自定义 `reload_service()` 后框架只调用它，信号/生成配置/重新声明实例都得自己做。
7. **在 stop 钩子里重复 kill 主进程**：`stop_service()` 在 `procd_kill` 之前执行，只做清理（删临时文件等）。
8. **变量未加引号**：路径、地址、参数一律 `"$var"`。
9. **把实例名当 PID**：实例名是注册对象名。取 PID 用 `ubus call service list` 或让程序写 pidfile。
10. **假设高级 API 全版本都有**：先 grep 本机 `procd.sh` 再看函数体。
11. **过度依赖 START 数字**：启动顺序 ≠ WAN/DNS/VPN 就绪。
12. **配置错误仍注册实例**：校验失败 `return 1` 或跳过该实例，并写日志。
13. **把 `service_started()` 当健康检查**：它只是注册完成回调。
14. **jail 内缺文件或权限不对**：逐项核对挂载、可写路径、用户、设备。
15. **触发器引发反复重启**：检查 reload 是否重复生成不稳定配置（时间戳/随机值每次不同）、是否产生循环事件。
16. **接口触发器用了设备名**：`procd_add_reload_interface_trigger` 要的是逻辑接口名（wan），不是 eth1。
17. **`service_data()` 里用 start_service 的局部变量**：两次独立调用，作用域不共享。
18. **多实例增量更新误用整体 start**：只改一个实例用 `/etc/init.d/x start <实例>`（add）；整体 start 会删掉未声明的旧实例（set）。
19. **`procd_send_signal` 传 PID**：第一个参数是服务名，不是进程号。
20. **`reload_service` 里直接调外部脚本重启**：优先 `procd_send_signal` / `start` / `restart`，避免绕开 procd 状态。

---

## 17. 速查表

### 最小实例

```sh
procd_open_instance
procd_set_param command /usr/sbin/myservice --foreground
procd_set_param respawn 3600 5 5
procd_set_param stdout 1
procd_set_param stderr 1
procd_close_instance
```

### 配置触发器

```sh
service_triggers() {
    procd_add_reload_trigger "myservice"
}
```

### 常见命令

```sh
/etc/init.d/myservice start [inst]   # 无参=set 整体替换；带参=add 增量
/etc/init.d/myservice stop [inst]
/etc/init.d/myservice restart
/etc/init.d/myservice reload
/etc/init.d/myservice status         # 退出码 0/3/4/5
/etc/init.d/myservice enabled
/etc/init.d/myservice info
logread -e myservice
```

### 参数调用规则

| 目的 | 写法 |
|---|---|
| 指定命令 | `procd_set_param command /usr/sbin/app --config /etc/app.conf` |
| 自动重启策略 | `procd_set_param respawn 3600 5 5`（fail_threshold / restart_timeout / max_fail） |
| 监测文件 | `procd_set_param file /etc/app.conf`（按内容 md5 比较） |
| 环境变量 | `procd_set_param env MODE=prod` |
| 输出到系统日志 | `procd_set_param stdout 1`、`procd_set_param stderr 1` 分开写 |
| 追加命令参数 | `procd_append_param command --verbose` |
| 配置变化触发 | `service_triggers() { procd_add_reload_trigger "app"; }` |
| 接口变化触发 | `service_triggers() { procd_add_reload_interface_trigger "wan"; }` |
| 数据变化触发 | `service_triggers() { procd_add_reload_data_trigger "upstream"; }` |
| 全部实例发信号 | `procd_send_signal app '*' HUP` |
| 声明失败原因 | `procd_set_param error "reason"` |
| UCI 校验 | `uci_load_validate pkg type section "" 'enabled:bool:0' ...` |

---

## 18. 在目标固件上核验 API

### 18.1 版本与关键文件

```sh
cat /etc/openwrt_release 2>/dev/null
ubus -V 2>/dev/null
ls -l /etc/rc.common /lib/functions/procd.sh /sbin/reload_config
```

### 18.2 对照 main 分支源码（本手册核验依据）

- procd.sh：<https://github.com/openwrt/openwrt/blob/main/package/system/procd/files/procd.sh>
- rc.common：<https://github.com/openwrt/openwrt/blob/main/package/base-files/files/etc/rc.common>
- reload_config：<https://github.com/openwrt/openwrt/blob/main/package/system/procd/files/reload_config>
- procd C 端：<https://github.com/openwrt/procd>（instance.c / service.c / jail/ 等）

### 18.3 查看实际函数定义

```sh
grep -n '^[[:space:]]*procd_' /lib/functions/procd.sh
grep -n 'USE_PROCD\|rc_procd\|start_service\|reload_service\|service_started' /etc/rc.common
```

grep 只能定位定义，重要 API 应继续读函数体。

### 18.4 检查 procd 运行时

```sh
ubus -v list service
ubus call service list
/etc/init.d/myservice info
```

### 18.5 发布前验证矩阵

- 首次启动；连续两次 start（第二次不应重启进程）；
- 程序启动失败；异常退出的 respawn；failed 后 restart 复位；
- stop 后进程退出；配置变更 reload；配置无变化不重启；
- 多实例独立启停、删除 section 后旧实例被清理；
- 设备重启后自启；目标固件不支持某可选 API 时有明确报错或回退。

---

## 19. 附：本次修订对照表

| # | 位置 | 原文 | 修订 | 依据（main 分支源码） |
|---|---|---|---|---|
| 1 | 5.2 respawn | 三参数仅模糊描述 | 明确为 `fail_threshold / restart_timeout / max_fail` 并给出完整语义与 failed 状态说明 | procd.sh 头注释 |
| 2 | 5.2 respawn | 默认值“一些版本” | 明确：空 respawn 取 `system.@service[0].respawn_*`，缺省 3600/5/5 | `_procd_close_instance` |
| 3 | 3.3 / 14.3 | `procd_send_signal '*' 的支持方式存疑 | 确认 main 支持 `'*'`（=全部实例），旧分支仍需核验 | `_procd_send_signal` 中 `[ "$instance" != "*" ]` |
| 4 | 8.2 | 让 grep `/lib/functions.sh` 找校验函数 | 修正：定义在 `/lib/functions/procd.sh`；补完整示例（含 `procd_add_validation`） | procd.sh 末尾函数定义 |
| 5 | 7.1 | “仅 uci commit 不应假定触发 reload” | 补 reload_config 真实机制：`uci show` + md5 比对（`/var/run/config.md5`）+ 定向 `config.change` 事件 | `/sbin/reload_config` |
| 6 | 3.1 | `service_started/stopped` 标“若该分支支持” | 确认 main 存在（`type service_started` 检测后调用），语义=注册流程结束 | rc.common |
| 7 | 1.1 | 默认实例名“由库生成” | 明确为 `instance<N>` 递增 | `_procd_open_instance` |
| 8 | 1.1 新增 | — | set/add 语义：start 不带参=set 整体替换，带实例名=add 增量 | rc.common `rc_procd` |
| 9 | 5.x 新增 | — | 补 `error`、`watchdog` 参数及完整类型总览表 | `_procd_set_param` |
| 10 | 7.3 | 接口触发器行为存疑 | 确认按逻辑接口名过滤 `eq interface <名>`，匹配 `interface.*` 事件族，动作固定 reload | `_procd_add_reload_interface_trigger` |
| 11 | 7.4 新增 | — | 补 `procd_add_reload_data_trigger`（24.10）、mount/raw/config 触发器函数表 | procd.sh wrapper 列表 |
| 12 | 9.1 | jail flags 未列出 | 补完整 flags：log/ubus/udebug/procfs/sysfs/ronly/requirejail/netns/userns/cgroupsns | `_procd_add_jail` |
| 13 | 3.2 新增 | — | `status` 退出码表（0/3/4/5）、`enabled`、`trace`、`info` 命令确认 | rc.common、`_procd_status` |
| 14 | 11 | `procd_running`/`service_running` 混列 | 分清来源：前者 procd.sh，后者 rc.common；补 `procd_set_config_changed`、`procd_get_mountpoints` | procd.sh / rc.common |
| 15 | 2 | 残留“示例假设程序支持 -c 参数”注释 | 删除与示例不符的笔误 | — |
| 16 | 10 | service_data 作用域未说明 | 明确与 start_service 两次独立调用、局部变量不共享 | `_procd_close_service` 调用时序 |
| 17 | 16 新增 | — | 错误清单扩充至 20 条（设备名/实例名/PID/锁等高频坑） | 综合 |
| 18 | 12 | 仅 extra_command | 补 18.06 及更早的 `EXTRA_COMMANDS` 兼容说明 | rc.common |
| 19 | 15 新增 | — | 排错补 `info`、status 退出码、`/var/lock/procd_*` 锁定位 | `_procd_status`、`procd_lock` |
| 20 | 18 新增 | — | 附 main 分支源码链接作为核验基线 | openwrt/openwrt@main |

---

## 维护原则

- 以目标固件上的 `/etc/rc.common`、`/lib/functions/procd.sh` 和 procd 源码为最终依据。
- 示例中的程序名、参数和配置格式均为占位内容，必须替换为实际程序支持的选项。
- 不要把某个分支的实现细节写成跨版本保证；本文标注【main 已核验】的条目以 OpenWrt main 分支（2026-10-19 时点）为准。
- 安全功能和事件触发器应在测试设备验证后再用于生产。
