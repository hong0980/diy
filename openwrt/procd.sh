#!/bin/sh
# =============================================================================
# procd.sh —— OpenWrt procd 服务管理 API 库
# =============================================================================
# procd 是 OpenWrt 的进程管理守护程序（类似 Linux 的 systemd）。
# 本文件提供一组 Shell 函数，供 /etc/init.d/ 下的服务脚本调用，
# 以便通过 ubus 总线与 procd 通信，注册、启动、停止和监控服务。
#
# 【典型服务脚本使用示例】
#   #!/bin/sh /etc/rc.common
#   USE_PROCD=1
#   START=95
#
#   start_service() {
#       procd_open_service "myservice"        # 1. 开启服务定义
#       procd_open_instance                   # 2. 开启一个实例
#       procd_set_param command /usr/bin/myapp --arg1  # 3. 设置启动命令
#       procd_set_param respawn               # 4. 启用自动重启
#       procd_set_param stdout 1              # 5. 标准输出重定向到 syslog
#       procd_close_instance                  # 6. 关闭实例
#       procd_close_service                   # 7. 提交服务到 procd
#   }
#
# =============================================================================
# procd 公开 API 速查
# =============================================================================
#
# procd_open_service(name, [script]):
#   【开启服务定义】初始化一条包含一个或多个实例的服务消息。
#   参数：name   - 服务名称
#         script - 可选，关联的启动脚本路径
#
# procd_close_service():
#   【提交服务定义】将服务消息发送给 procd 守护进程。
#
# procd_open_instance([name]):
#   【开启实例】在上一个 procd_open_service 调用所描述的服务中添加一个实例。
#   参数：name - 可选实例名，省略则自动按序号命名（instance1, instance2...）
#
# procd_set_param(type, [value...]):
#   【设置实例参数】为当前实例设置各类参数，可用的 type 如下：
#
#     command      启动命令行（数组格式）
#                  示例：procd_set_param command /usr/sbin/nginx -c /etc/nginx/nginx.conf
#
#     respawn      自动重启配置（数组，3个值）
#                  格式：$失败阈值(秒) $重启等待时间(秒) $最大失败次数
#                  示例：procd_set_param respawn 3600 5 5
#                  说明：3600秒内失败超过5次则不再重启；每次重启等待5秒
#                  留空则从 UCI system.@service[0] 中读取默认值
#
#     env          传递给进程的环境变量（键值对表格式）
#                  示例：procd_set_param env MY_VAR=hello OTHER_VAR=world
#
#     data         用于检测配置变化的任意键值对（表格式）
#                  示例：procd_set_param data config_hash="abc123"
#
#     file         监视的配置文件路径（数组），文件变化时触发重启
#                  示例：procd_set_param file /etc/myapp.conf
#
#     netdev       绑定的网络设备（检测 ifindex 变化时重启）
#                  示例：procd_set_param netdev eth0
#
#     limits       传递给进程的资源限制（表格式，格式同 ulimit）
#                  示例：procd_set_param limits core="unlimited"
#
#     user         以指定用户名运行服务
#                  示例：procd_set_param user nobody
#
#     group        以指定用户组运行服务
#                  示例：procd_set_param group nogroup
#
#     pidfile      将进程 PID 写入指定文件
#                  示例：procd_set_param pidfile /var/run/myapp.pid
#
#     stdout       是否将标准输出重定向到 syslog（布尔值，默认 0）
#                  示例：procd_set_param stdout 1
#
#     stderr       是否将标准错误重定向到 syslog（布尔值，默认 0）
#                  示例：procd_set_param stderr 1
#
#     facility     记录到 syslog 时使用的设施名（默认 daemon）
#                  示例：procd_set_param facility local0
#
#     nice         进程优先级（整数，-20 最高，19 最低）
#                  示例：procd_set_param nice -5
#
#     term_timeout 发送 SIGTERM 后等待进程退出的超时秒数
#                  示例：procd_set_param term_timeout 10
#
#     reload_signal 触发 reload 时向进程发送的信号
#                  示例：procd_set_param reload_signal HUP
#
#     no_new_privs 禁止进程获取新权限（安全加固，布尔值）
#                  示例：procd_set_param no_new_privs 1
#
#     seccomp      seccomp 过滤规则文件路径
#     capabilities capabilities 配置文件路径
#
#   注意：数组/表格类型参数不做空格分割——每个命令行参数用一个函数参数传入。
#
# procd_close_instance():
#   【关闭实例】完成当前实例的定义。
#
# procd_running(service, [instance]):
#   【检查运行状态】检查指定服务（或实例）是否正在运行。
#   返回 0 表示运行中，非 0 表示未运行。
#
# procd_kill(service, [instance]):
#   【杀死服务】终止一个服务实例（或全部实例）。
#
# procd_send_signal(service, [instance], [signal]):
#   【发送信号】向服务实例（或全部实例）发送指定信号。
#   示例：procd_send_signal myservice "" HUP
#

# =============================================================================
# 依赖：加载 libubox 的 JSON 操作库（jshn.sh）
# jshn 提供 json_init/json_add_string/json_dump 等函数，用于构造 ubus 消息。
# =============================================================================
. "$IPKG_INSTROOT/usr/share/libubox/jshn.sh"

# 触发器延迟时间（毫秒）：配置变化事件触发后，等待多久再执行重载动作。
# 默认 1000ms = 1秒，防止短时间内多次触发。
PROCD_RELOAD_DELAY=1000

# 当前正在操作的服务名称（内部状态变量）
_PROCD_SERVICE=

# =============================================================================
# procd_lock() —— 获取服务脚本的互斥锁
# =============================================================================
# 防止同一服务脚本被并发调用（如同时执行 start/stop/reload）。
# 使用文件描述符 1000 配合 flock 实现进程级互斥锁。
# 锁文件路径：/var/lock/procd_<服务名>.lock
# =============================================================================
procd_lock() {
    # 解析 initscript 的真实路径（处理符号链接），取文件名作为服务名
    local basescript=$(readlink "$initscript")
    local service_name="$(basename ${basescript:-$initscript})"

    # 先尝试以非阻塞方式 (-n) 获取 fd 1000 上的锁
    flock -n 1000 &> /dev/null
    if [ "$?" != "0" ]; then
        # 非阻塞失败，说明 fd 1000 未打开，先打开锁文件再阻塞等待锁
        exec 1000>"$IPKG_INSTROOT/var/lock/procd_${service_name}.lock"
        flock 1000
        if [ "$?" != "0" ]; then
            # 获取锁失败，记录警告（程序继续，但可能存在并发风险）
            logger "warning: procd flock for $service_name failed"
        fi
    fi
}

# =============================================================================
# _procd_call() —— 在 procd JSON 命名空间中调用内部函数
# =============================================================================
# jshn 支持多个 JSON 命名空间，procd 使用名为 "procd" 的命名空间，
# 避免与调用方脚本的 JSON 操作互相干扰。
# 用法：_procd_call <函数名> [参数...]
# =============================================================================
_procd_call() {
    local old_cb

    # 切换到 procd 命名空间，保存之前的命名空间到 old_cb
    json_set_namespace procd old_cb
    # 执行实际函数
    "$@"
    # 恢复原来的命名空间
    json_set_namespace $old_cb
}

# =============================================================================
# _procd_wrapper() —— 批量为公开函数生成命名空间包装
# =============================================================================
# 为每个以下划线开头的内部函数（如 _procd_open_service）生成对应的
# 公开函数（如 procd_open_service），公开函数会自动：
#   1. 调用 procd_lock 获取互斥锁
#   2. 通过 _procd_call 切换到 procd JSON 命名空间再执行
# 文件末尾的 _procd_wrapper 调用列出了所有需要包装的函数。
# =============================================================================
_procd_wrapper() {
    procd_lock  # 获取互斥锁，确保并发安全
    while [ -n "$1" ]; do
        # 动态定义公开函数：procd_xxx() { _procd_call _procd_xxx "$@"; }
        eval "$1() { _procd_call _$1 \"\$@\"; }"
        shift
    done
}

# =============================================================================
# _procd_ubus_call() —— 通过 ubus 总线向 procd 发送 JSON 消息
# =============================================================================
# ubus 是 OpenWrt 的进程间通信总线，procd 在其上注册了 "service" 对象。
# 支持的命令：set（注册/更新服务）、delete（删除服务）、
#             list（列出服务）、signal（发送信号）、event（发布事件）
# =============================================================================
_procd_ubus_call() {
    local cmd="$1"

    # 调试模式下将 JSON 内容输出到 stderr
    [ -n "$PROCD_DEBUG" ] && json_dump >&2
    # 将当前 JSON 命名空间内容序列化后通过 ubus 发送给 procd
    ubus call service "$cmd" "$(json_dump)"
    # 清理 JSON 命名空间，为下次使用做准备
    json_cleanup
}

# =============================================================================
# _procd_open_service() —— 初始化服务定义（JSON 消息开头）
# =============================================================================
# 调用后需依次调用 procd_open_instance / procd_set_param / procd_close_instance，
# 最后调用 procd_close_service 提交。
# 参数：$1 - 服务名称（必填）
#       $2 - 关联脚本路径（可选，通常为 /etc/init.d/<服务名>）
# =============================================================================
_procd_open_service() {
    local name="$1"
    local script="$2"

    # 记录当前服务名和实例序号（供后续函数使用）
    _PROCD_SERVICE="$name"
    _PROCD_INSTANCE_SEQ=0

    # 初始化 JSON 对象并填入服务名
    json_init
    json_add_string name "$name"
    # 如果提供了脚本路径，一并写入（procd 用于服务管理和重启）
    [ -n "$script" ] && json_add_string script "$script"
    # 打开 instances 对象，后续实例定义将填充到这里
    json_add_object instances
}

# =============================================================================
# _procd_close_service() —— 完成服务定义并提交给 procd
# =============================================================================
# 流程：关闭 instances 对象 → 附加触发器 → 附加 data → 通过 ubus 提交
# 参数：$1 - ubus 命令，默认 "set"（也可传 "add" 等）
# =============================================================================
_procd_close_service() {
    # 关闭 instances JSON 对象
    json_close_object

    # 打开 triggers 数组，调用服务脚本中定义的 service_triggers() 填充触发器
    # service_triggers() 由用户在 init.d 脚本中定义，用于注册配置/接口变化触发器
    _procd_open_trigger
    service_triggers
    _procd_close_trigger

    # 如果服务脚本定义了 service_data()，则附加自定义 data 段
    # service_data() 可用于暴露任意键值数据供外部查询
    type service_data >/dev/null 2>&1 && {
        _procd_open_data
        service_data
        _procd_close_data
    }

    # 通过 ubus 将完整 JSON 消息发送给 procd（默认命令为 "set"）
    _procd_ubus_call ${1:-set}
}

# =============================================================================
# _procd_add_array_data() —— 向当前 JSON 数组追加多个字符串元素
# =============================================================================
# 内部辅助函数，每个参数作为一个独立的数组元素（不做空格分割）。
# =============================================================================
_procd_add_array_data() {
    while [ "$#" -gt 0 ]; do
        json_add_string "" "$1"  # key 为空表示数组元素
        shift
    done
}

# =============================================================================
# _procd_add_array() —— 创建命名 JSON 数组并填充数据
# =============================================================================
# 参数：$1 - 数组名称；其余参数 - 数组元素
# =============================================================================
_procd_add_array() {
    json_add_array "$1"
    shift
    _procd_add_array_data "$@"
    json_close_array
}

# =============================================================================
# _procd_add_table_data() —— 向当前 JSON 对象追加键值对
# =============================================================================
# 参数格式：KEY=VALUE（等号分隔）；若无等号，值为空字符串。
# 示例：_procd_add_table_data "PATH=/usr/bin" "HOME=/root"
# =============================================================================
_procd_add_table_data() {
    while [ -n "$1" ]; do
        local var="${1%%=*}"   # 取等号前的键名
        local val="${1#*=}"   # 取等号后的值
        [ "$1" = "$val" ] && val=  # 没有等号时值为空
        json_add_string "$var" "$val"
        shift
    done
}

# =============================================================================
# _procd_add_table() —— 创建命名 JSON 对象（键值表）并填充数据
# =============================================================================
# 参数：$1 - 对象名称；其余参数 - KEY=VALUE 格式的键值对
# =============================================================================
_procd_add_table() {
    json_add_object "$1"
    shift
    _procd_add_table_data "$@"
    json_close_object
}

# =============================================================================
# _procd_open_instance() —— 在服务中开启一个新实例
# =============================================================================
# 一个服务可以有多个实例（如同一程序以不同参数运行多次）。
# 参数：$1 - 实例名（可选），省略时自动命名为 instance1/instance2/...
# =============================================================================
_procd_open_instance() {
    local name="$1"; shift

    # 递增实例序号
    _PROCD_INSTANCE_SEQ="$(($_PROCD_INSTANCE_SEQ + 1))"
    # 若未提供名称，使用自动序号名
    name="${name:-instance$_PROCD_INSTANCE_SEQ}"
    # 在 instances 对象中开启该实例的子对象
    json_add_object "$name"
    # 若设置了 TRACE_SYSCALLS 环境变量，启用系统调用跟踪（调试用）
    [ -n "$TRACE_SYSCALLS" ] && json_add_boolean trace "1"
}

# =============================================================================
# _procd_open_trigger() / _procd_close_trigger() —— 触发器数组的开关
# =============================================================================
# 触发器用于在特定事件（配置变化、网络接口变化等）发生时自动执行动作。
# 使用引用计数支持嵌套调用（防止重复打开/关闭同一数组）。
# =============================================================================
_procd_open_trigger() {
    let '_procd_trigger_open = _procd_trigger_open + 1'
    # 仅在第一次调用时真正打开 JSON 数组（防止嵌套重复打开）
    [ "$_procd_trigger_open" -gt 1 ] && return
    json_add_array "triggers"
}

_procd_close_trigger() {
    let '_procd_trigger_open = _procd_trigger_open - 1'
    # 仅在最后一次调用时真正关闭 JSON 数组
    [ "$_procd_trigger_open" -lt 1 ] || return
    json_close_array
}

# =============================================================================
# _procd_open_data() / _procd_close_data() —— 自定义数据段的开关
# =============================================================================
# data 段用于存储服务的任意附加信息，供外部通过 ubus 查询。
# 同样使用引用计数防止嵌套重复打开。
# =============================================================================
_procd_open_data() {
    let '_procd_data_open = _procd_data_open + 1'
    [ "$_procd_data_open" -gt 1 ] && return
    json_add_object "data"
}

_procd_close_data() {
    let '_procd_data_open = _procd_data_open - 1'
    [ "$_procd_data_open" -lt 1 ] || return
    json_close_object
}

# =============================================================================
# _procd_open_validate() / _procd_close_validate() —— 验证段的开关
# =============================================================================
# 验证段用于声明 UCI 配置验证规则，配合 uci_validate_section 使用。
# =============================================================================
_procd_open_validate() {
    json_select ..        # 返回上层 JSON 节点（triggers 数组的父对象）
    json_add_array "validate"
}

_procd_close_validate() {
    json_close_array
    json_select triggers  # 重新定位回 triggers 数组
}

# =============================================================================
# _procd_add_jail() —— 为服务实例配置沙箱（jail）隔离
# =============================================================================
# jail 基于 Linux 命名空间实现进程隔离，提升服务安全性。
# 参数：$1 - jail 名称
#       其余参数 - 功能标志（可多个）：
#         log        - 允许访问日志设施
#         ubus       - 允许访问 ubus 总线
#         procfs     - 挂载 /proc 文件系统
#         sysfs      - 挂载 /sys 文件系统
#         ronly      - 根文件系统只读挂载
#         requirejail - 若 jail 创建失败则拒绝启动服务
#         netns      - 使用独立网络命名空间
#         userns     - 使用独立用户命名空间
#         cgroupsns  - 使用独立 cgroups 命名空间
# 示例：procd_add_jail "myapp" log ubus ronly
# =============================================================================
_procd_add_jail() {
    json_add_object "jail"
    json_add_string name "$1"

    shift

    # 遍历功能标志，逐一写入 JSON
    for a in $@; do
        case $a in
        log)    json_add_boolean "log" "1";;
        ubus)   json_add_boolean "ubus" "1";;
        procfs) json_add_boolean "procfs" "1";;
        sysfs)  json_add_boolean "sysfs" "1";;
        ronly)  json_add_boolean "ronly" "1";;
        requirejail)    json_add_boolean "requirejail" "1";;
        netns)  json_add_boolean "netns" "1";;
        userns) json_add_boolean "userns" "1";;
        cgroupsns)  json_add_boolean "cgroupsns" "1";;
        esac
    done
    # 初始化空的挂载点对象（后续由 procd_add_jail_mount 填充）
    json_add_object "mount"
    json_close_object
    json_close_object
}

# =============================================================================
# _procd_add_jail_mount() —— 向 jail 添加只读挂载路径
# =============================================================================
# 将主机路径以只读方式挂载进 jail 沙箱，让服务可以读取必要文件。
# 参数：一个或多个路径（如 /etc/ssl /usr/lib/libssl.so）
# 示例：procd_add_jail_mount /etc/myapp.conf /usr/share/myapp
# =============================================================================
_procd_add_jail_mount() {
    local _json_no_warning=1  # 抑制 jshn 的无效选择警告

    # 定位到 jail.mount 对象
    json_select "jail"
    [ $? = 0 ] || return
    json_select "mount"
    [ $? = 0 ] || {
        json_select ..
        return
    }
    # "0" 表示只读挂载
    for a in $@; do
        json_add_string "$a" "0"
    done
    json_select ..  # 退出 mount
    json_select ..  # 退出 jail
}

# =============================================================================
# _procd_add_jail_mount_rw() —— 向 jail 添加读写挂载路径
# =============================================================================
# 将主机路径以读写方式挂载进 jail 沙箱，让服务可以写入数据。
# 参数：一个或多个路径
# 示例：procd_add_jail_mount_rw /var/log/myapp /tmp/myapp
# =============================================================================
_procd_add_jail_mount_rw() {
    local _json_no_warning=1

    json_select "jail"
    [ $? = 0 ] || return
    json_select "mount"
    [ $? = 0 ] || {
        json_select ..
        return
    }
    # "1" 表示读写挂载
    for a in $@; do
        json_add_string "$a" "1"
    done
    json_select ..
    json_select ..
}

# =============================================================================
# _procd_set_param() —— 为当前实例设置参数
# =============================================================================
# 根据参数类型选择合适的 JSON 结构（数组、对象或标量）。
# 详细参数说明见文件顶部的 API 文档。
# =============================================================================
_procd_set_param() {
    local type="$1"; shift

    case "$type" in
        env|data|limits)
            # 键值表类型：env（环境变量）、data（自定义数据）、limits（资源限制）
            _procd_add_table "$type" "$@"
        ;;
        command|netdev|file|respawn|watch|watchdog)
            # 数组类型：command（命令行）、netdev（网络设备）、file（配置文件）
            # respawn（重启策略）、watch（监视路径）、watchdog（看门狗）
            _procd_add_array "$type" "$@"
        ;;
        error)
            # 错误信息（特殊数组，整个内容作为单一字符串元素）
            json_add_array "$type"
            json_add_string "" "$@"
            json_close_array
        ;;
        nice|term_timeout)
            # 整数类型：nice（进程优先级）、term_timeout（SIGTERM 超时秒数）
            json_add_int "$type" "$1"
        ;;
        reload_signal)
            # 重载信号：将信号名（如 HUP）转换为信号编号后存储
            json_add_int "$type" $(kill -l "$1")
        ;;
        pidfile|user|group|seccomp|capabilities|facility|\
        extroot|overlaydir|tmpoverlaysize)
            # 字符串类型：PID文件路径、用户、用户组、安全策略文件等
            json_add_string "$type" "$1"
        ;;
        stdout|stderr|no_new_privs)
            # 布尔类型：标准输出/错误重定向、禁止新权限
            json_add_boolean "$type" "$1"
        ;;
    esac
}

# =============================================================================
# _procd_add_timeout() —— 向触发器添加延迟时间
# =============================================================================
# 在触发器动作数组中插入延迟值（毫秒），防止事件抖动导致频繁重启。
# 延迟值来自全局变量 PROCD_RELOAD_DELAY（默认 1000ms）。
# =============================================================================
_procd_add_timeout() {
    [ "$PROCD_RELOAD_DELAY" -gt 0 ] && json_add_int "" "$PROCD_RELOAD_DELAY"
    return 0
}

# =============================================================================
# _procd_add_interface_trigger() —— 添加网络接口事件触发器
# =============================================================================
# 当指定网络接口状态发生变化时，执行指定脚本。
# 参数：$1 - 事件名称（如 "interface.*" 匹配所有接口事件）
#       $2 - 接口名称（如 "wan"、"lan"）
#       其余参数 - 触发时执行的命令（如 /etc/init.d/myapp reload）
# =============================================================================
_procd_add_interface_trigger() {
    json_add_array                       # 外层数组：整个触发器
    _procd_add_array_data "$1"           # 事件名（如 "interface.*"）
    shift

    json_add_array                       # 条件数组
    _procd_add_array_data "if"           # "if" 条件判断

    json_add_array                       # eq 比较数组
    _procd_add_array_data "eq" "interface" "$1"  # 判断 interface == 指定接口名
    shift
    json_close_array

    json_add_array                       # 动作数组
    _procd_add_array_data "run_script" "$@"  # 条件成立时执行的脚本
    json_close_array

    json_close_array                     # 关闭条件数组
    _procd_add_timeout                   # 添加延迟
    json_close_array                     # 关闭外层数组
}

# =============================================================================
# _procd_add_reload_interface_trigger() —— 网络接口变化时自动重载本服务
# =============================================================================
# 封装 _procd_add_interface_trigger，当指定接口变化时调用本服务的 reload。
# 参数：$1 - 接口名（如 "wan"）
# 示例（在 service_triggers 中使用）：
#   service_triggers() {
#       procd_add_reload_interface_trigger wan
#   }
# =============================================================================
_procd_add_reload_interface_trigger() {
    # 解析本服务脚本的真实路径和名称
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})

    _procd_open_trigger
    # 监听所有接口事件，当 interface == $1 时重载服务
    _procd_add_interface_trigger "interface.*" $1 /etc/init.d/$name reload
    _procd_close_trigger
}

# =============================================================================
# _procd_add_data_trigger() —— 添加服务 data 变化触发器
# =============================================================================
# 当指定服务的 data 段发生 service.data.update 事件时，执行指定脚本。
# 参数：$1 - 监听的服务名称
#       其余参数 - 触发时执行的命令
# =============================================================================
_procd_add_data_trigger() {
    json_add_array
    _procd_add_array_data "service.data.update"  # 监听 data 更新事件

    json_add_array
    _procd_add_array_data "if"

    json_add_array
    _procd_add_array_data "eq" "name" "$1"  # 判断 name == 指定服务名
    shift
    json_close_array

    json_add_array
    _procd_add_array_data "run_script" "$@"  # 触发时执行的脚本
    json_close_array

    json_close_array
    _procd_add_timeout
    json_close_array
}

# =============================================================================
# _procd_add_reload_data_trigger() —— 指定服务 data 变化时重载本服务
# =============================================================================
# 参数：$1 - 被监听的服务名称
# =============================================================================
_procd_add_reload_data_trigger() {
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})

    _procd_open_trigger
    _procd_add_data_trigger $1 /etc/init.d/$name reload
    _procd_close_trigger
}

# =============================================================================
# _procd_add_config_trigger() —— 添加 UCI 配置变化触发器
# =============================================================================
# 当指定 UCI 包的配置发生变化（config.change 事件）时，执行指定脚本。
# 参数：$1 - 事件类型（通常为 "config.change"）
#       $2 - UCI 包名（如 "network"、"firewall"、"myapp"）
#       其余参数 - 触发时执行的命令
# =============================================================================
_procd_add_config_trigger() {
    json_add_array
    _procd_add_array_data "$1"           # 事件类型（如 "config.change"）
    shift

    json_add_array
    _procd_add_array_data "if"

    json_add_array
    _procd_add_array_data "eq" "package" "$1"  # 判断变化的 UCI 包名
    shift
    json_close_array

    json_add_array
    _procd_add_array_data "run_script" "$@"    # 触发时执行的脚本
    json_close_array

    json_close_array
    _procd_add_timeout
    json_close_array
}

# =============================================================================
# _procd_add_mount_trigger() —— 添加文件系统挂载触发器
# =============================================================================
# 当指定挂载点被挂载（mount.add 事件）时，执行 reload/restart 动作。
# 支持多个挂载点（使用 or 逻辑）。
# 参数：$1 - 事件类型（如 "mount.add"）
#       $2 - 动作（"reload" 或 "restart"）
#       其余参数 - 挂载点路径列表
# =============================================================================
_procd_add_mount_trigger() {
    json_add_array
    _procd_add_array_data "$1"           # 事件类型
    local action="$2"
    local multi=0
    shift ; shift

    json_add_array
    _procd_add_array_data "if"

    # 若有多个挂载点，使用 "or" 逻辑（任意一个匹配即触发）
    if [ "$2" ]; then
        json_add_array
        _procd_add_array_data "or"
        multi=1
    fi

    # 逐一写入挂载点匹配条件
    while [ "$1" ]; do
        json_add_array
        _procd_add_array_data "eq" "target" "$1"
        shift
        json_close_array
    done

    [ $multi = 1 ] && json_close_array  # 关闭 "or" 数组

    json_add_array
    _procd_add_array_data "run_script" /etc/init.d/$name $action  # 执行服务动作
    json_close_array

    json_close_array
    _procd_add_timeout
    json_close_array
}

# =============================================================================
# _procd_add_action_mount_trigger() —— 挂载点可用时触发服务动作（内部封装）
# =============================================================================
# 从 fstab 中解析实际挂载点，若有匹配则注册挂载触发器。
# 参数：$1 - 动作（"reload" 或 "restart"）
#       其余参数 - 需要监听的路径
# =============================================================================
_procd_add_action_mount_trigger() {
    local action="$1"
    shift
    # 从 /etc/config/fstab 中查找实际挂载点
    local mountpoints="$(procd_get_mountpoints "$@")"
    # 若没有找到有效挂载点，直接返回（不注册触发器）
    [ "${mountpoints//[[:space:]]}" ] || return 0
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})

    _procd_open_trigger
    _procd_add_mount_trigger mount.add $action "$mountpoints"
    _procd_close_trigger
}

# =============================================================================
# procd_get_mountpoints() —— 从 fstab 解析路径对应的实际挂载点
# =============================================================================
# 在子 shell 中执行（避免污染外部变量），通过遍历 fstab 配置，
# 找到包含指定路径的最近挂载点。输出结果去重排序。
# 参数：一个或多个路径（如 /mnt/data /srv）
# 返回：对应的挂载点路径（每行一个）
# =============================================================================
procd_get_mountpoints() {
    (
        # 内部辅助函数：检查 fstab 中的某个挂载项是否包含指定路径
        __procd_check_mount() {
            local cfg="$1"
            local path="${2%%/}/"        # 规范化待检查路径（末尾加/）
            local target
            config_get target "$cfg" target   # 从 fstab 读取挂载目标
            target="${target%%/}/"            # 规范化挂载点（末尾加/）
            # 若路径以挂载点开头（即路径在此挂载点下），输出挂载点
            [ "$path" != "${path##$target}" ] && echo "${target%%/}"
        }
        local mpath
        config_load fstab    # 加载 /etc/config/fstab
        for mpath in "$@"; do
            config_foreach __procd_check_mount mount "$mpath"
        done
    ) | sort -u    # 去重排序
}

# =============================================================================
# _procd_add_restart_mount_trigger() —— 挂载点可用时重启服务
# =============================================================================
# 当监听的挂载点被挂载时，自动重启本服务。
# 参数：需要监听的路径（可多个）
# 示例（在 service_triggers 中使用）：
#   service_triggers() {
#       procd_add_restart_mount_trigger /mnt/usb
#   }
# =============================================================================
_procd_add_restart_mount_trigger() {
    _procd_add_action_mount_trigger restart "$@"
}

# =============================================================================
# _procd_add_reload_mount_trigger() —— 挂载点可用时重载服务
# =============================================================================
# 当监听的挂载点被挂载时，自动重载本服务（不完全重启）。
# 示例（在 service_triggers 中使用）：
#   service_triggers() {
#       procd_add_reload_mount_trigger /mnt/data
#   }
# =============================================================================
_procd_add_reload_mount_trigger() {
    _procd_add_action_mount_trigger reload "$@"
}

# =============================================================================
# _procd_add_raw_trigger() —— 添加自定义原始触发器
# =============================================================================
# 直接构造触发器 JSON，适用于上述封装函数不满足需求的场景。
# 参数：$1 - 事件名称
#       $2 - 延迟时间（毫秒）
#       其余参数 - 触发时执行的命令
# =============================================================================
_procd_add_raw_trigger() {
    json_add_array
    _procd_add_array_data "$1"    # 事件名
    shift
    local timeout=$1              # 自定义延迟时间
    shift

    json_add_array
    json_add_array
    _procd_add_array_data "run_script" "$@"   # 执行的脚本
    json_close_array
    json_close_array

    json_add_int "" "$timeout"    # 写入延迟时间

    json_close_array
}

# =============================================================================
# _procd_add_reload_trigger() —— UCI 配置变化时重载本服务（最常用的触发器）
# =============================================================================
# 监听指定 UCI 包的 config.change 事件，变化时调用本服务的 reload。
# 参数：一个或多个 UCI 包名
# 示例（最常见用法，在 service_triggers 中使用）：
#   service_triggers() {
#       procd_add_reload_trigger "myapp" "network"
#   }
#   效果：/etc/config/myapp 或 /etc/config/network 变化时重载服务
# =============================================================================
_procd_add_reload_trigger() {
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})
    local file

    _procd_open_trigger
    for file in "$@"; do
        # 为每个 UCI 包名分别注册 config.change 触发器
        _procd_add_config_trigger "config.change" "$file" /etc/init.d/$name reload
    done
    _procd_close_trigger
}

# =============================================================================
# _procd_add_validation() —— 添加 UCI 配置验证规则
# =============================================================================
# 在服务触发器中注册 UCI 配置验证函数，procd 会在配置变化时验证合法性。
# 参数：验证函数名（该函数需在服务脚本中定义，调用 uci_validate_section）
# =============================================================================
_procd_add_validation() {
    _procd_open_validate
    $@                          # 调用用户提供的验证函数
    _procd_close_validate
}

# =============================================================================
# _procd_append_param() —— 向已存在的参数追加值（而非覆盖）
# =============================================================================
# 与 procd_set_param 的区别：若参数已存在，追加而不是替换。
# 适用于需要分多次添加命令行参数或文件列表的场景。
# =============================================================================
_procd_append_param() {
    local type="$1"; shift
    local _json_no_warning=1

    # 尝试定位已有的参数节点
    json_select "$type"
    [ $? = 0 ] || {
        # 参数不存在，直接创建新参数
        _procd_set_param "$type" "$@"
        return
    }
    # 参数已存在，根据类型追加数据
    case "$type" in
        env|data|limits)
            _procd_add_table_data "$@"    # 向键值表追加键值对
        ;;
        command|netdev|file|respawn|watch|watchdog)
            _procd_add_array_data "$@"    # 向数组追加元素
        ;;
        error)
            json_add_string "" "$@"
        ;;
    esac
    json_select ..    # 返回上层
}

# =============================================================================
# _procd_close_instance() —— 完成实例定义
# =============================================================================
# 若设置了 respawn（自动重启）但未提供参数值，则从 UCI 系统配置读取默认值：
#   - respawn_threshold：失败阈值（秒），默认 3600
#   - respawn_timeout  ：重启等待时间（秒），默认 5
#   - respawn_retry    ：最大失败次数，默认 5
# 含义：在 3600 秒内失败超过 5 次则停止重启；每次重启前等待 5 秒
# =============================================================================
_procd_close_instance() {
    local respawn_vals
    _json_no_warning=1
    # 检查是否设置了 respawn 参数
    if json_select respawn ; then
        json_get_values respawn_vals
        if [ -z "$respawn_vals" ]; then
            # respawn 参数存在但为空，从 UCI 系统配置读取默认值
            local respawn_threshold=$(uci_get system.@service[0].respawn_threshold)
            local respawn_timeout=$(uci_get system.@service[0].respawn_timeout)
            local respawn_retry=$(uci_get system.@service[0].respawn_retry)
            # 填入默认值（UCI 中未设置时使用内置默认值）
            _procd_add_array_data ${respawn_threshold:-3600} ${respawn_timeout:-5} ${respawn_retry:-5}
        fi
        json_select ..
    fi

    json_close_object    # 关闭实例 JSON 对象
}

# =============================================================================
# _procd_add_instance() —— 快速添加单命令实例（简化版）
# =============================================================================
# 相当于依次调用 open_instance + set_param command + close_instance。
# 适用于只需指定命令、不需要其他配置的简单服务。
# 示例：procd_add_instance /usr/bin/myapp --daemon
# =============================================================================
_procd_add_instance() {
    _procd_open_instance
    _procd_set_param command "$@"
    _procd_close_instance
}

# =============================================================================
# procd_running() —— 检查服务（实例）是否正在运行
# =============================================================================
# 参数：$1 - 服务名称（必填）
#       $2 - 实例名称（可选，默认检查所有实例 "*"）
# 返回：0 - 正在运行；非 0 - 未运行
# 示例：
#   if procd_running "myservice"; then
#       echo "服务运行中"
#   fi
# =============================================================================
procd_running() {
    local service="$1"
    local instance="${2:-*}"    # 默认检查所有实例
    [ "$instance" = "*" ] || instance="'$instance'"

    json_init
    json_add_string name "$service"
    # 通过 ubus 查询实例运行状态
    local running=$(_procd_ubus_call list | jsonfilter -l 1 -e "@['$service'].instances[$instance].running")

    [ "$running" = "true" ]    # "true" 时返回 0（运行中）
}

# =============================================================================
# _procd_kill() —— 停止服务（通过 ubus delete 命令）
# =============================================================================
# 参数：$1 - 服务名称（可选，空则操作所有服务）
#       $2 - 实例名称（可选，空则操作服务的所有实例）
# =============================================================================
_procd_kill() {
    local service="$1"
    local instance="$2"

    json_init
    [ -n "$service" ] && json_add_string name "$service"
    [ -n "$instance" ] && json_add_string instance "$instance"
    _procd_ubus_call delete    # 发送 delete 命令，procd 会终止对应进程
}

# =============================================================================
# _procd_send_signal() —— 向服务进程发送信号
# =============================================================================
# 参数：$1 - 服务名称（必填）
#       $2 - 实例名称（可选，"*" 或空表示所有实例）
#       $3 - 信号（可以是信号名如 "HUP" 或信号编号如 "1"）
# 示例：
#   procd_send_signal "myservice" "" HUP      # 发送 SIGHUP 给所有实例
#   procd_send_signal "myservice" "main" USR1 # 发送 SIGUSR1 给 main 实例
# =============================================================================
_procd_send_signal() {
    local service="$1"
    local instance="$2"
    local signal="$3"

    # 若信号为大写字母开头（信号名），转换为数字编号
    case "$signal" in
        [A-Z]*) signal="$(kill -l "$signal" 2>/dev/null)" || return 1;;
    esac

    json_init
    json_add_string name "$service"
    # 指定了实例名且不是通配符时，才加入实例过滤
    [ -n "$instance" -a "$instance" != "*" ] && json_add_string instance "$instance"
    [ -n "$signal" ] && json_add_int signal "$signal"
    _procd_ubus_call signal    # 通过 ubus 发送信号
}

# =============================================================================
# _procd_status() —— 查询服务运行状态详情
# =============================================================================
# 参数：$1 - 服务名称
#       $2 - 实例名称（可选）
# 输出：
#   "inactive"                - 服务未注册（返回码 3）
#   "active with no instances" - 服务已注册但无实例（返回码 0）
#   "running"                 - 所有实例运行中（返回码 0）
#   "running (N/M)"           - 部分实例运行中（返回码 0）
#   "not running"             - 所有实例已停止（返回码 5）
#   "unknown instance X"      - 指定实例不存在（返回码 4）
# =============================================================================
_procd_status() {
    local service="$1"
    local instance="$2"
    local data state
    local n_running=0
    local n_stopped=0
    local n_total=0

    json_init
    [ -n "$service" ] && json_add_string name "$service"

    # 通过 ubus 查询服务信息
    data=$(_procd_ubus_call list | jsonfilter -e '@["'"$service"'"]')
    [ -z "$data" ] && { echo "inactive"; return 3; }    # 服务不存在

    # 提取 instances 字段
    data=$(echo "$data" | jsonfilter -e '$.instances')
    if [ -z "$data" ]; then
        [ -z "$instance" ] && { echo "active with no instances"; return 0; }
        data="[]"
    fi

    # 处理实例名（通配符或带引号的具体实例名）
    [ -n "$instance" ] && instance="\"$instance\"" || instance='*'

    # 统计各状态实例数量
    for state in $(jsonfilter -s "$data" -e '$['"$instance"'].running'); do
        n_total=$((n_total + 1))
        case "$state" in
        false) n_stopped=$((n_stopped + 1)) ;;
        true)  n_running=$((n_running + 1)) ;;
        esac
    done

    if [ $n_total -gt 0 ]; then
        if [ $n_running -gt 0 ] && [ $n_stopped -eq 0 ]; then
            echo "running"           # 全部运行中
            return 0
        elif [ $n_running -gt 0 ]; then
            echo "running ($n_running/$n_total)"   # 部分运行中
            return 0
        else
            echo "not running"       # 全部停止
            return 5
        fi
    else
        echo "unknown instance $instance"    # 实例不存在
        return 4
    fi
}

# =============================================================================
# procd_open_data() / procd_close_data() —— 外部 data 段操作（公开接口）
# =============================================================================
# 与内部 _procd_open_data 不同，这对函数会切换 JSON 命名空间，
# 允许在 service_data() 函数中直接操作 JSON 而不影响 procd 的命名空间。
# 通常在 service_data() 中使用，配合 json_add_* 写入任意数据。
# 示例：
#   service_data() {
#       procd_open_data
#       json_add_string "version" "1.0"
#       json_add_int "port" 8080
#       procd_close_data
#   }
# =============================================================================
procd_open_data() {
    local name="$1"
    json_set_namespace procd __procd_old_cb    # 切换到 procd 命名空间
    json_add_object data
}

procd_close_data() {
    json_close_object
    json_set_namespace $__procd_old_cb         # 恢复原命名空间
}

# =============================================================================
# _procd_set_config_changed() —— 主动通知 procd 某 UCI 包配置已变化
# =============================================================================
# 向 ubus 发布 config.change 事件，会触发监听该包的服务执行 reload。
# 参数：$1 - UCI 包名（如 "myapp"）
# 示例：当程序内部修改了 UCI 配置后，调用此函数通知 procd 触发相关服务重载
# =============================================================================
_procd_set_config_changed() {
    local package="$1"

    json_init
    json_add_string type config.change    # 事件类型
    json_add_object data
    json_add_string package "$package"    # 变化的 UCI 包名
    json_close_object

    ubus call service event "$(json_dump)"    # 发布事件
}

# =============================================================================
# procd_add_mdns_service() —— 添加单个 mDNS 服务记录
# =============================================================================
# 向 data 段添加 mDNS（零配置网络）服务通告信息，
# 供 mDNS 守护进程（如 mdnsd）通告服务。
# 参数：$1 - 服务类型（如 "http"、"ssh"）
#       $2 - 协议（"tcp" 或 "udp"）
#       $3 - 端口号
#       其余参数 - TXT 记录内容（可选，键值对格式）
# 示例：
#   procd_add_mdns_service http tcp 80 "path=/" "version=1.0"
#   # 通告：_http._tcp.local:80
# =============================================================================
procd_add_mdns_service() {
    local service proto port txt_count=0
    service=$1; shift
    proto=$1; shift
    port=$1; shift
    # JSON 对象名：服务名_端口（如 "http_80"）
    json_add_object "${service}_$port"
    # 完整 mDNS 服务名（如 "_http._tcp.local"）
    json_add_string "service" "_$service._$proto.local"
    json_add_int port "$port"
    # 添加 TXT 记录（跳过空值）
    for txt in "$@"; do
        [ -z "$txt" ] && continue
        txt_count=$((txt_count+1))
        [ $txt_count -eq 1 ] && json_add_array txt    # 第一条记录时开启数组
        json_add_string "" "$txt"
    done
    [ $txt_count -gt 0 ] && json_select ..    # 关闭 txt 数组

    json_select ..    # 关闭服务对象
}

# =============================================================================
# procd_add_mdns() —— 在服务 data 段注册 mDNS 服务通告
# =============================================================================
# 封装 procd_add_mdns_service，自动处理 data 段的开关。
# 参数与 procd_add_mdns_service 相同。
# 典型用法（在 start_service 中）：
#   procd_open_service "mywebserver"
#   ...
#   procd_add_mdns http tcp 80
#   procd_close_service
# =============================================================================
procd_add_mdns() {
    procd_open_data
    json_add_object "mdns"
    procd_add_mdns_service "$@"
    json_close_object
    procd_close_data
}

# =============================================================================
# uci_validate_section() —— 验证 UCI 配置段的合法性
# =============================================================================
# 调用 /sbin/validate_data 验证 UCI 配置，并将验证结果（变量赋值语句）
# 通过 eval 导入当前 Shell 环境。
# 参数：$1 - UCI 包名
#       $2 - 配置类型
#       $3 - 配置段名称
#       其余参数 - 验证规则（格式：变量名:类型:默认值:约束）
# 返回：0 - 验证通过；非 0 - 验证失败（同时输出错误信息）
# 示例：
#   uci_validate_section "myapp" "settings" "$cfg" \
#       'port:port:8080' 'logfile:file'
# =============================================================================
uci_validate_section()
{
    local _package="$1"
    local _type="$2"
    local _name="$3"
    local _result
    local _error
    shift; shift; shift
    # 执行验证，结果为一组 Shell 赋值语句（如 port='8080'）
    _result=$(/sbin/validate_data "$_package" "$_type" "$_name" "$@" 2> /dev/null)
    _error=$?
    eval "$_result"    # 将验证结果中的变量赋值导入当前环境
    # 验证失败时重新执行以输出错误信息（到 stdout）
    [ "$_error" = "0" ] || $(/sbin/validate_data "$_package" "$_type" "$_name" "$@" 1> /dev/null)
    return $_error
}

# =============================================================================
# uci_load_validate() —— 加载并验证 UCI 配置段，然后调用处理函数
# =============================================================================
# 结合 uci_validate_section 和回调函数，是服务脚本读取 UCI 配置的标准方式。
# 参数：$1 - UCI 包名
#       $2 - 配置类型
#       $3 - 配置段名称
#       $4 - 回调函数名（验证后调用，参数为 $名称 $验证结果码）
#       其余参数 - 验证规则（格式：变量名:类型[:默认值[:约束]]）
# 示例：
#   validate_myapp_section() {
#       uci_load_validate "myapp" "config" "$1" "$2" \
#           'port:port:8080' \
#           'loglevel:string:info'
#   }
#   # 验证后 $port 和 $loglevel 变量自动赋值
# =============================================================================
uci_load_validate() {
    local _package="$1"
    local _type="$2"
    local _name="$3"
    local _function="$4"    # 验证完成后的回调函数
    local _option
    local _result
    shift; shift; shift; shift
    # 为每个验证规则预先声明局部变量（避免泄漏到上层）
    for _option in "$@"; do
        eval "local ${_option%%:*}"    # 取冒号前的变量名声明 local
    done
    # 执行验证
    uci_validate_section "$_package" "$_type" "$_name" "$@"
    _result=$?
    # 若未指定回调函数，直接返回验证结果
    [ -n "$_function" ] || return $_result
    # 调用回调函数，传入配置段名和验证结果码
    eval "$_function \"\$_name\" \"\$_result\""
}

# =============================================================================
# _procd_wrapper 调用 —— 批量生成所有公开 API 函数
# =============================================================================
# 为以下每个函数生成对应的公开版本（去掉前缀下划线）。
# 公开函数在调用时会自动：
#   1. 通过 procd_lock 获取互斥锁
#   2. 通过 _procd_call 在 procd JSON 命名空间中执行
#
# 用户在 init.d 服务脚本中应使用这些不带下划线前缀的公开函数。
# =============================================================================
_procd_wrapper \
    procd_open_service \          # 开启服务定义
    procd_close_service \         # 提交服务定义
    procd_add_instance \          # 快速添加单命令实例
    procd_add_raw_trigger \       # 添加自定义原始触发器
    procd_add_config_trigger \    # 添加 UCI 配置变化触发器
    procd_add_interface_trigger \ # 添加网络接口变化触发器
    procd_add_mount_trigger \     # 添加挂载点触发器
    procd_add_reload_trigger \    # UCI 配置变化时重载（最常用）
    procd_add_reload_data_trigger \       # 服务 data 变化时重载
    procd_add_reload_interface_trigger \  # 网络接口变化时重载
    procd_add_action_mount_trigger \      # 挂载时触发动作
    procd_add_reload_mount_trigger \      # 挂载时重载
    procd_add_restart_mount_trigger \     # 挂载时重启
    procd_open_trigger \          # 手动开启触发器数组
    procd_close_trigger \         # 手动关闭触发器数组
    procd_open_instance \         # 开启实例定义
    procd_close_instance \        # 关闭实例定义
    procd_open_validate \         # 开启验证段
    procd_close_validate \        # 关闭验证段
    procd_add_jail \              # 配置沙箱隔离
    procd_add_jail_mount \        # 向沙箱添加只读挂载
    procd_add_jail_mount_rw \     # 向沙箱添加读写挂载
    procd_set_param \             # 设置实例参数
    procd_append_param \          # 追加实例参数
    procd_add_validation \        # 添加 UCI 验证规则
    procd_set_config_changed \    # 通知配置已变化
    procd_kill \                  # 停止服务
    procd_send_signal             # 向服务发送信号
