# procd API 使用说明:
#
# procd_open_service(name, [script]):
#   初始化一个新的 procd 命令消息，包含一个或多个实例的服务
#
# procd_close_service()
#   发送服务的命令消息
#
# procd_open_instance([name]):
#   在上一个 procd_open_service 调用的服务中添加一个实例
#
# procd_set_param(type, [value...])
#   可用的参数类型:
#     command: 命令行（数组）
#     respawn info: 重启信息，包含三个值的数组 $fail_threshold $restart_timeout $max_fail
#     env: 环境变量（传递给进程）
#     data: 用于检测配置变化的任意键值对（表）
#     file: 配置文件（数组）
#     netdev: 绑定的网络设备（检测 ifindex 变化）
#     limits: 资源限制（传递给进程）
#     user: 运行服务的用户名 $username
#     group: 运行服务的组名 $groupname
#     pidfile: 写入 PID 的文件名
#     stdout: 是否将命令的 stdout 重定向到 syslog（默认: 0）
#     stderr: 是否将命令的 stderr 重定向到 syslog（默认: 0）
#     facility: 日志记录到 syslog 时使用的设施（默认: daemon）
#
#   数组/表参数不需要空格分隔 - 每个命令行参数使用一个函数参数
#
# procd_close_instance():
#   完成正在准备的实例
#
# procd_running(service, [instance]):
#   检查服务或实例是否正在运行
#
# procd_kill(service, [instance]):
#   终止服务实例（或所有实例）
#
# procd_send_signal(service, [instance], [signal])
#   向服务实例（或所有实例）发送信号
#

. "$IPKG_INSTROOT/usr/share/libubox/jshn.sh"

# 定义重新加载延迟时间，单位为毫秒
PROCD_RELOAD_DELAY=1000
# 用于存储当前服务名称
_PROCD_SERVICE=

# 加锁函数，避免多个进程同时操作同一服务
procd_lock() {
    local basescript=$(readlink "$initscript")  # 获取初始化脚本的符号链接
    local service_name="$(basename ${basescript:-$initscript})"  # 获取服务名称

    # 尝试非阻塞加锁
    flock -n 1000 &> /dev/null
    if [ "$?" != "0" ]; then
        # 如果加锁失败，创建锁文件并再次尝试加锁
        exec 1000>"$IPKG_INSTROOT/var/lock/procd_${service_name}.lock"
        flock 1000
        if [ "$?" != "0" ]; then
            # 加锁失败，记录警告日志
            logger "warning: procd flock for $service_name failed"
        fi
    fi
}

# 包装函数，用于在 procd 命名空间中调用函数
_procd_call() {
    local old_cb

    json_set_namespace procd old_cb  # 保存当前命名空间并切换到 procd
    "$@"
    json_set_namespace $old_cb  # 恢复原始命名空间
}

# procd_wrapper 使用说明:
#   将指定函数包装为支持锁和命名空间的调用
#   参数: 函数名称列表
#   功能: 为每个函数应用 procd_lock 和 _procd_call 包装，确保线程安全和命名空间隔离
_procd_wrapper() {
    procd_lock  # 加锁以防止并发
    while [ -n "$1" ]; do
        eval "$1() { _procd_call _$1 \"\$@\"; }"  # 动态定义包装函数
        shift
    done
}

# 通过 ubus 调用服务命令
_procd_ubus_call() {
    local cmd="$1"

    [ -n "$PROCD_DEBUG" ] && json_dump >&2  # 如果启用调试，输出 JSON 数据
    ubus call service "$cmd" "$(json_dump)"  # 调用 ubus 服务命令
    json_cleanup  # 清理 JSON 数据
}

# procd_open_service 使用说明:
#   初始化一个新的 procd 服务，包含一个或多个实例
#   参数: name (服务名称), [script] (可选的脚本路径)
#   功能: 创建 JSON 数据结构，设置服务名称和脚本路径，并初始化实例对象
_procd_open_service() {
    local name="$1"
    local script="$2"

    _PROCD_SERVICE="$name"  # 设置服务名称
    _PROCD_INSTANCE_SEQ=0  # 初始化实例序号

    json_init  # 初始化 JSON 数据
    json_add_string name "$name"  # 添加服务名称
    [ -n "$script" ] && json_add_string script "$script"  # 如果有脚本路径，添加脚本
    json_add_object instances  # 创建实例对象
}

# procd_close_service 使用说明:
#   发送服务的命令消息
#   参数: 无 (可选命令类型，默认为 "set")
#   功能: 关闭实例对象，添加触发器和服务数据，并通过 ubus 发送服务命令
_procd_close_service() {
    json_close_object  # 关闭实例对象
    _procd_open_trigger  # 打开触发器数组
    service_triggers  # 调用用户定义的触发器函数
    _procd_close_trigger  # 关闭触发器数组
    type service_data >/dev/null 2>&1 && {  # 如果定义了 service_data 函数
        _procd_open_data  # 打开数据对象
        service_data  # 调用用户定义的 service_data 函数
        _procd_close_data  # 关闭数据对象
    }
    _procd_ubus_call ${1:-set}  # 发送服务命令
}

# 添加数组数据到 JSON
_procd_add_array_data() {
    while [ "$#" -gt 0 ]; do
        json_add_string "" "$1"  # 逐个添加字符串到数组
        shift
    done
}

# 创建并填充 JSON 数组
_procd_add_array() {
    json_add_array "$1"  # 创建指定名称的数组
    shift
    _procd_add_array_data "$@"  # 添加数据
    json_close_array  # 关闭数组
}

# 添加键值对到 JSON 表
_procd_add_table_data() {
    while [ -n "$1" ]; do
        local var="${1%%=*}"  # 提取键
        local val="${1#*=}"  # 提取值
        [ "$1" = "$val" ] && val=  # 如果没有值，设置为空
        json_add_string "$var" "$val"  # 添加键值对
        shift
    done
}

# 创建并填充 JSON 表
_procd_add_table() {
    json_add_object "$1"  # 创建指定名称的对象
    shift
    _procd_add_table_data "$@"  # 添加键值对
    json_close_object  # 关闭对象
}

# procd_open_instance 使用说明:
#   在上一个 procd_open_service 调用的服务中添加一个实例
#   参数: [name] (可选的实例名称，默认为 instanceN)
#   功能: 创建一个新的实例对象，设置实例名称，并支持系统调用跟踪
_procd_open_instance() {
    local name="$1"; shift

    _PROCD_INSTANCE_SEQ="$(($_PROCD_INSTANCE_SEQ + 1))"  # 增加实例序号
    name="${name:-instance$_PROCD_INSTANCE_SEQ}"  # 使用默认名称（如果未提供）
    json_add_object "$name"  # 创建实例对象
    [ -n "$TRACE_SYSCALLS" ] && json_add_boolean trace "1"  # 如果启用跟踪，添加 trace 标志
}

# procd_open_trigger 使用说明:
#   打开触发器数组，用于添加触发器
#   参数: 无
#   功能: 初始化触发器数组，支持嵌套触发器管理
_procd_open_trigger() {
    let '_procd_trigger_open = _procd_trigger_open + 1'  # 增加触发器计数
    [ "$_procd_trigger_open" -gt 1 ] && return  # 如果已打开，直接返回
    json_add_array "triggers"  # 创建触发器数组
}

# procd_close_trigger 使用说明:
#   关闭触发器数组
#   参数: 无
#   功能: 结束触发器数组的定义，匹配 _procd_open_trigger 调用
_procd_close_trigger() {
    let '_procd_trigger_open = _procd_trigger_open - 1'  # 减少触发器计数
    [ "$_procd_trigger_open" -lt 1 ] || return  # 如果计数大于0，直接返回
    json_close_array  # 关闭触发器数组
}

# procd_open_data 使用说明:
#   打开数据对象，用于添加服务数据
#   参数: 无
#   功能: 初始化数据对象，支持嵌套数据管理
_procd_open_data() {
    let '_procd_data_open = _procd_data_open + 1'  # 增加数据计数
    [ "$_procd_data_open" -gt 1 ] && return  # 如果已打开，直接返回
    json_add_object "data"  # 创建数据对象
}

# procd_close_data 使用说明:
#   关闭数据对象
#   参数: 无
#   功能: 结束数据对象的定义，匹配 _procd_open_data 调用
_procd_close_data() {
    let '_procd_data_open = _procd_data_open - 1'  # 减少数据计数
    [ "$_procd_data_open" -lt 1 ] || return  # 如果计数大于0，直接返回
    json_close_object  # 关闭数据对象
}

# procd_open_validate 使用说明:
#   打开验证数组，用于添加验证规则
#   参数: 无
#   功能: 初始化验证数组，用于 UCI 配置验证
_procd_open_validate() {
    json_select ..  # 返回上层 JSON 对象
    json_add_array "validate"  # 创建验证数组
}

# procd_close_validate 使用说明:
#   关闭验证数组
#   参数: 无
#   功能: 结束验证数组的定义，切换回触发器对象
_procd_close_validate() {
    json_close_array  # 关闭验证数组
    json_select triggers  # 切换到触发器对象
}

# procd_add_jail 使用说明:
#   添加 jail（容器）配置
#   参数: jail 名称，选项（log, ubus, procfs, sysfs, ronly, requirejail, netns, userns, cgroupsns）
#   功能: 配置服务的容器隔离环境，设置挂载点和权限
_procd_add_jail() {
    json_add_object "jail"  # 创建 jail 对象
    json_add_string name "$1"  # 设置 jail 名称

    shift

    for a in $@; do
        case $a in
        log) json_add_boolean "log" "1";;  # 启用日志
        ubus) json_add_boolean "ubus" "1";;  # 启用 ubus
        procfs) json_add_boolean "procfs" "1";;  # 挂载 procfs
        sysfs) json_add_boolean "sysfs" "1";;  # 挂载 sysfs
        ronly) json_add_boolean "ronly" "1";;  # 只读模式
        requirejail) json_add_boolean "requirejail" "1";;  # 强制要求 jail
        netns) json_add_boolean "netns" "1";;  # 网络命名空间
        userns) json_add_boolean "userns" "1";;  # 用户命名空间
        cgroupsns) json_add_boolean "cgroupsns" "1";;  # cgroups 命名空间
        esac
    done
    json_add_object "mount"  # 创建挂载点对象
    json_close_object
    json_close_object  # 关闭 jail 对象
}

# procd_add_jail_mount 使用说明:
#   添加 jail 只读挂载点
#   参数: 挂载路径列表
#   功能: 为 jail 配置只读挂载点
_procd_add_jail_mount() {
    local _json_no_warning=1

    json_select "jail"  # 选择 jail 对象
    [ $? = 0 ] || return
    json_select "mount"  # 选择挂载点对象
    [ $? = 0 ] || {
        json_select ..
        return
    }
    for a in $@; do
        json_add_string "$a" "0"  # 添加只读挂载点
    done
    json_select ..
    json_select ..
}

# procd_add_jail_mount_rw 使用说明:
#   添加 jail 可写挂载点
#   参数: 挂载路径列表
#   功能: 为 jail 配置可写挂载点
_procd_add_jail_mount_rw() {
    local _json_no_warning=1

    json_select "jail"  # 选择 jail 对象
    [ $? = 0 ] || return
    json_select "mount"  # 选择挂载点对象
    [ $? = 0 ] || {
        json_select ..
        return
    }
    for a in $@; do
        json_add_string "$a" "1"  # 添加可写挂载点
    done
    json_select ..
    json_select ..
}

# procd_set_param 使用说明:
#   设置服务实例参数
#   参数: type (参数类型，如 command, respawn, env 等), [value...] (参数值)
#   功能: 配置服务实例的各种参数（如命令、环境变量、资源限制等）
_procd_set_param() {
    local type="$1"; shift

    case "$type" in
        env|data|limits)
            _procd_add_table "$type" "$@"  # 添加键值对表
        ;;
        command|netdev|file|respawn|watch|watchdog)
            _procd_add_array "$type" "$@"  # 添加数组
        ;;
        error)
            json_add_array "$type"
            json_add_string "" "$@"  # 添加错误信息
            json_close_array
        ;;
        nice|term_timeout)
            json_add_int "$type" "$1"  # 设置整数参数
        ;;
        reload_signal)
            json_add_int "$type" $(kill -l "$1")  # 设置重载信号
        ;;
        pidfile|user|group|seccomp|capabilities|facility|\
        extroot|overlaydir|tmpoverlaysize)
            json_add_string "$type" "$1"  # 设置字符串参数
        ;;
        stdout|stderr|no_new_privs)
            json_add_boolean "$type" "$1"  # 设置布尔参数
        ;;
    esac
}

# 添加超时设置
_procd_add_timeout() {
    [ "$PROCD_RELOAD_DELAY" -gt 0 ] && json_add_int "" "$PROCD_RELOAD_DELAY"  # 添加重新加载延迟
    return 0
}

# procd_add_interface_trigger 使用说明:
#   添加接口触发器
#   参数: 接口事件，接口名称，脚本路径及参数
#   功能: 当网络接口事件发生时触发指定脚本
_procd_add_interface_trigger() {
    json_add_array
    _procd_add_array_data "$1"  # 添加触发器事件
    shift

    json_add_array
    _procd_add_array_data "if"  # 添加条件

    json_add_array
    _procd_add_array_data "eq" "interface" "$1"  # 设置接口名称
    shift
    json_close_array

    json_add_array
    _procd_add_array_data "run_script" "$@"  # 添加脚本命令
    json_close_array

    json_close_array
    _procd_add_timeout  # 添加超时
    json_close_array
}

# procd_add_reload_interface_trigger 使用说明:
#   添加接口重新加载触发器
#   参数: 接口名称
#   功能: 当网络接口事件发生时触发服务的重新加载
_procd_add_reload_interface_trigger() {
    local script=$(readlink "$initscript")  # 获取脚本路径
    local name=$(basename ${script:-$initscript})  # 获取脚本名称

    _procd_open_trigger
    _procd_add_interface_trigger "interface.*" $1 /etc/init.d/$name reload  # 添加重新加载触发器
    _procd_close_trigger
}

# procd_add_data_trigger 使用说明:
#   添加数据触发器
#   参数: 服务名称，脚本路径及参数
#   功能: 当服务数据更新时触发指定脚本
_procd_add_data_trigger() {
    json_add_array
    _procd_add_array_data "service.data.update"  # 添加数据更新事件

    json_add_array
    _procd_add_array_data "if"  # 添加条件

    json_add_array
    _procd_add_array_data "eq" "name" "$1"  # 设置服务名称
    shift
    json_close_array

    json_add_array
    _procd_add_array_data "run_script" "$@"  # 添加脚本命令
    json_close_array

    json_close_array
    _procd_add_timeout  # 添加超时
    json_close_array
}

# procd_add_reload_data_trigger 使用说明:
#   添加数据重新加载触发器
#   参数: 服务名称
#   功能: 当服务数据更新时触发服务的重新加载
_procd_add_reload_data_trigger() {
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})

    _procd_open_trigger
    _procd_add_data_trigger $1 /etc/init.d/$name reload  # 添加数据重新加载触发器
    _procd_close_trigger
}

# procd_add_config_trigger 使用说明:
#   添加配置触发器
#   参数: 配置包名称，脚本路径及参数
#   功能: 当指定配置包变更时触发脚本
_procd_add_config_trigger() {
    json_add_array
    _procd_add_array_data "$1"  # 添加配置变更事件
    shift

    json_add_array
    _procd_add_array_data "if"  # 添加条件

    json_add_array
    _procd_add_array_data "eq" "package" "$1"  # 设置包名称
    shift
    json_close_array

    json_add_array
    _procd_add_array_data "run_script" "$@"  # 添加脚本命令
    json_close_array

    json_close_array
    _procd_add_timeout  # 添加超时
    json_close_array
}

# procd_add_mount_trigger 使用说明:
#   添加挂载触发器
#   参数: 事件类型，动作，挂载点列表
#   功能: 当挂载事件发生时触发指定动作
_procd_add_mount_trigger() {
    json_add_array
    _procd_add_array_data "$1"  # 添加事件类型
    local action="$2"
    local multi=0
    shift ; shift

    json_add_array
    _procd_add_array_data "if"  # 添加条件

    if [ "$2" ]; then
        json_add_array
        _procd_add_array_data "or"  # 如果有多个挂载点，使用 or 条件
        multi=1
    fi

    while [ "$1" ]; do
        json_add_array
        _procd_add_array_data "eq" "target" "$1"  # 设置挂载点
        shift
        json_close_array
    done

    [ $multi = 1 ] && json_close_array

    json_add_array
    _procd_add_array_data "run_script" /etc/init.d/$name $action  # 添加脚本动作
    json_close_array

    json_close_array
    _procd_add_timeout  # 添加超时
    json_close_array
}

# procd_add_action_mount_trigger 使用说明:
#   添加挂载动作触发器
#   参数: 动作，挂载点列表
#   功能: 当挂载点添加时触发指定动作
_procd_add_action_mount_trigger() {
    local action="$1"
    shift
    local mountpoints="$(procd_get_mountpoints "$@")"  # 获取挂载点
    [ "${mountpoints//[[:space:]]}" ] || return 0
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})

    _procd_open_trigger
    _procd_add_mount_trigger mount.add $action "$mountpoints"  # 添加挂载触发器
    _procd_close_trigger
}

# procd_get_mountpoints 使用说明:
#   获取挂载点列表
#   参数: 挂载路径列表
#   功能: 从 fstab 配置中提取匹配的挂载点并去重排序
procd_get_mountpoints() {
    (
        __procd_check_mount() {
            local cfg="$1"
            local path="${2%%/}/"
            local target
            config_get target "$cfg" target
            target="${target%%/}/"
            [ "$path" != "${path##$target}" ] && echo "${target%%/}"  # 输出匹配的挂载点
        }
        local mpath
        config_load fstab  # 加载 fstab 配置
        for mpath in "$@"; do
            config_foreach __procd_check_mount mount "$mpath"  # 检查每个挂载点
        done
    ) | sort -u  # 去重并排序
}

# procd_add_restart_mount_trigger 使用说明:
#   添加重启挂载触发器
#   参数: 挂载点列表
#   功能: 当挂载点添加时触发服务重启
_procd_add_restart_mount_trigger() {
    _procd_add_action_mount_trigger restart "$@"  # 添加重启动作触发器
}

# procd_add_reload_mount_trigger 使用说明:
#   添加重新加载挂载触发器
#   参数: 挂载点列表
#   功能: 当挂载点添加时触发服务重新加载
_procd_add_reload_mount_trigger() {
    _procd_add_action_mount_trigger reload "$@"  # 添加重新加载动作触发器
}

# procd_add_raw_trigger 使用说明:
#   添加原始触发器
#   参数: 事件名称，超时时间，脚本路径及参数
#   功能: 定义一个自定义事件触发器，运行指定脚本
_procd_add_raw_trigger() {
    json_add_array
    _procd_add_array_data "$1"  # 添加事件
    shift
    local timeout=$1
    shift

    json_add_array
    json_add_array
    _procd_add_array_data "run_script" "$@"  # 添加脚本命令
    json_close_array
    json_close_array

    json_add_int "" "$timeout"  # 设置超时

    json_close_array
}

# procd_add_reload_trigger 使用说明:
#   添加重新加载触发器
#   参数: 配置文件列表
#   功能: 当指定配置文件变更时触发服务重新加载
_procd_add_reload_trigger() {
    local script=$(readlink "$initscript")
    local name=$(basename ${script:-$initscript})
    local file

    _procd_open_trigger
    for file in "$@"; do
        _procd_add_config_trigger "config.change" "$file" /etc/init.d/$name reload  # 为每个文件添加触发器
    done
    _procd_close_trigger
}

# procd_add_validation 使用说明:
#   添加验证规则
#   参数: 验证函数
#   功能: 调用用户定义的验证函数，添加到验证数组
_procd_add_validation() {
    _procd_open_validate
    $@  # 调用用户定义的验证函数
    _procd_close_validate
}

# procd_append_param 使用说明:
#   追加参数到已有参数
#   参数: type (参数类型)，[value...] (参数值)
#   功能: 向已有参数类型追加数据，保持现有配置
_procd_append_param() {
    local type="$1"; shift
    local _json_no_warning=1

    json_select "$type"  # 选择指定类型
    [ $? = 0 ] || {
        _procd_set_param "$type" "$@"  # 如果类型不存在，创建新参数
        return
    }
    case "$type" in
        env|data|limits)
            _procd_add_table_data "$@"  # 追加键值对
        ;;
        command|netdev|file|respawn|watch|watchdog)
            _procd_add_array_data "$@"  # 追加数组数据
        ;;
        error)
            json_add_string "" "$@"  # 追加错误信息
        ;;
    esac
    json_select ..
}

# procd_close_instance 使用说明:
#   完成正在准备的实例
#   参数: 无
#   功能: 关闭实例对象，设置默认重启参数（如果未设置）
_procd_close_instance() {
    local respawn_vals
    _json_no_warning=1
    if json_select respawn ; then
        json_get_values respawn_vals
        if [ -z "$respawn_vals" ]; then
            # 从 UCI 配置获取默认重启参数
            local respawn_threshold=$(uci_get system.@service[0].respawn_threshold)
            local respawn_timeout=$(uci_get system.@service[0].respawn_timeout)
            local respawn_retry=$(uci_get system.@service[0].respawn_retry)
            _procd_add_array_data ${respawn_threshold:-3600} ${respawn_timeout:-5} ${respawn_retry:-5}
        fi
        json_select ..
    fi

    json_close_object  # 关闭实例对象
}

# procd_add_instance 使用说明:
#   添加一个简单的服务实例
#   参数: 命令及参数
#   功能: 创建一个新实例并设置命令
_procd_add_instance() {
    _procd_open_instance
    _procd_set_param command "$@"  # 设置命令
    _procd_close_instance
}

# procd_running 使用说明:
#   检查服务或实例是否正在运行
#   参数: service (服务名称), [instance] (可选的实例名称，默认为所有实例)
#   功能: 查询 ubus 服务状态，返回是否运行
procd_running() {
    local service="$1"
    local instance="${2:-*}"  # 默认检查所有实例
    [ "$instance" = "*" ] || instance="'$instance'"

    json_init
    json_add_string name "$service"
    local running=$(_procd_ubus_call list | jsonfilter -l 1 -e "@['$service'].instances[$instance].running")

    [ "$running" = "true" ]  # 返回运行状态
}

# procd_kill 使用说明:
#   终止服务或实例
#   参数: service (服务名称), [instance] (可选的实例名称)
#   功能: 通过 ubus 发送删除命令，终止指定服务或实例
_procd_kill() {
    local service="$1"
    local instance="$2"

    json_init
    [ -n "$service" ] && json_add_string name "$service"
    [ -n "$instance" ] && json_add_string instance "$instance"
    _procd_ubus_call delete  # 发送删除命令
}

# procd_send_signal 使用说明:
#   向服务或实例发送信号
#   参数: service (服务名称), [instance] (可选的实例名称), [signal] (信号名称或编号)
#   功能: 通过 ubus 向指定服务或实例发送信号
_procd_send_signal() {
    local service="$1"
    local instance="$2"
    local signal="$3"

    case "$signal" in
        [A-Z]*) signal="$(kill -l "$signal" 2>/dev/null)" || return 1;;  # 转换信号名称为信号编号
    esac

    json_init
    json_add_string name "$service"
    [ -n "$instance" -a "$instance" != "*" ] && json_add_string instance "$instance"
    [ -n "$signal" ] && json_add_int signal "$signal"
    _procd_ubus_call signal  # 发送信号
}

# procd_status 使用说明:
#   检查服务状态
#   参数: service (服务名称), [instance] (可选的实例名称)
#   功能: 查询服务或实例的运行状态，返回运行、部分运行或未运行
_procd_status() {
    local service="$1"
    local instance="$2"
    local data state
    local n_running=0
    local n_stopped=0
    local n_total=0

    json_init
    [ -n "$service" ] && json_add_string name "$service"

    data=$(_procd_ubus_call list | jsonfilter -e '@["'"$service"'"]')  # 获取服务信息
    [ -z "$data" ] && { echo "inactive"; return 3; }  # 服务不存在

    data=$(echo "$data" | jsonfilter -e '$.instances')  # 获取实例信息
    if [ -z "$data" ]; then
        [ -z "$instance" ] && { echo "active with no instances"; return 0; }
        data="[]"
    fi

    [ -n "$instance" ] && instance="\"$instance\"" || instance='*'

    for state in $(jsonfilter -s "$data" -e '$['"$instance"'].running'); do
        n_total=$((n_total + 1))
        case "$state" in
        false) n_stopped=$((n_stopped + 1)) ;;
        true)  n_running=$((n_running + 1)) ;;
        esac
    done

    if [ $n_total -gt 0 ]; then
        if [ $n_running -gt 0 ] && [ $n_stopped -eq 0 ]; then
            echo "running"
            return 0
        elif [ $n_running -gt 0 ]; then
            echo "running ($n_running/$n_total)"
            return 0
        else
            echo "not running"
            return 5
        fi
    else
        echo "unknown instance $instance"
        return 4
    fi
}

# procd_open_data 使用说明:
#   打开数据对象（外部调用）
#   参数: name (数据对象名称)
#   功能: 初始化数据对象并切换到 procd 命名空间
procd_open_data() {
    local name="$1"
    json_set_namespace procd __procd_old_cb
    json_add_object data
}

# procd_close_data 使用说明:
#   关闭数据对象（外部调用）
#   参数: 无
#   功能: 关闭数据对象并恢复原始命名空间
procd_close_data() {
    json_close_object
    json_set_namespace $__procd_old_cb
}

# procd_set_config_changed 使用说明:
#   设置配置变更事件
#   参数: package (包名称)
#   功能: 通知 ubus 配置变更事件
_procd_set_config_changed() {
    local package="$1"

    json_init
    json_add_string type config.change
    json_add_object data
    json_add_string package "$package"
    json_close_object

    ubus call service event "$(json_dump)"  # 发送配置变更事件
}

# procd_add_mdns_service 使用说明:
#   添加 mDNS 服务
#   参数: service (服务名称), proto (协议), port (端口), txt (文本记录)
#   功能: 配置 mDNS 服务，设置服务名称、协议、端口和文本记录
procd_add_mdns_service() {
    local service proto port txt_count=0
    service=$1; shift
    proto=$1; shift
    port=$1; shift
    json_add_object "${service}_$port"
    json_add_string "service" "_$service._$proto.local"  # 设置 mDNS 服务名称
    json_add_int port "$port"  # 设置端口
    for txt in "$@"; do
        [ -z "$txt" ] && continue
        txt_count=$((txt_count+1))
        [ $txt_count -eq 1 ] && json_add_array txt
        json_add_string "" "$txt"  # 添加文本记录
    done
    [ $txt_count -gt 0 ] && json_select ..

    json_select ..
}

# procd_add_mdns 使用说明:
#   添加 mDNS 配置
#   参数: 服务名称，协议，端口，文本记录
#   功能: 创建 mDNS 配置并调用 procd_add_mdns_service
procd_add_mdns() {
    procd_open_data
    json_add_object "mdns"
    procd_add_mdns_service "$@"
    json_close_object
    procd_close_data
}

# uci_validate_section 使用说明:
#   验证 UCI 配置段
#   参数: package (包名称), type (类型), name (配置名称), 验证规则
#   功能: 调用 validate_data 验证 UCI 配置段，返回验证结果
uci_validate_section() {
    local _package="$1"
    local _type="$2"
    local _name="$3"
    local _result
    local _error
    shift; shift; shift
    _result=$(/sbin/validate_data "$_package" "$_type" "$_name" "$@" 2> /dev/null)  # 执行验证
    _error=$?
    eval "$_result"
    [ "$_error" = "0" ] || $(/sbin/validate_data "$_package" "$_type" "$_name" "$@" 1> /dev/null)
    return $_error
}

# uci_load_validate 使用说明:
#   加载并验证 UCI 配置
#   参数: package (包名称), type (类型), name (配置名称), function (回调函数), 验证规则
#   功能: 加载 UCI 配置，验证并调用回调函数
uci_load_validate() {
    local _package="$1"
    local _type="$2"
    local _name="$3"
    local _function="$4"
    local _option
    local _result
    shift; shift; shift; shift
    for _option in "$@"; do
        eval "local ${_option%%:*}"  # 初始化验证变量
    done
    uci_validate_section "$_package" "$_type" "$_name" "$@"  # 验证配置
    _result=$?
    [ -n "$_function" ] || return $_result
    eval "$_function \"\$_name\" \"\$_result\""  # 调用回调函数
}

# 包装所有 procd 函数，使其支持锁和命名空间
_procd_wrapper \
    procd_open_service \ # 初始化新服务
    procd_close_service \ # 发送服务命令
    procd_add_instance \ # 添加简单服务实例
    procd_add_raw_trigger \ # 添加自定义事件触发器
    procd_add_config_trigger \ # 添加配置变更触发器
    procd_add_interface_trigger \ # 添加网络接口触发器
    procd_add_mount_trigger \ # 添加挂载事件触发器
    procd_add_reload_trigger \ # 添加配置文件变更触发器
    procd_add_reload_data_trigger \ # 添加服务数据变更触发器
    procd_add_reload_interface_trigger \ # 添加接口重新加载触发器
    procd_add_action_mount_trigger \ # 添加挂载动作触发器
    procd_add_reload_mount_trigger \ # 添加挂载重新加载触发器
    procd_add_restart_mount_trigger \ # 添加挂载重启触发器
    procd_open_trigger \ # 打开触发器数组
    procd_close_trigger \ # 关闭触发器数组
    procd_open_instance \ # 添加服务实例
    procd_close_instance \ # 完成实例配置
    procd_open_validate \ # 打开验证数组
    procd_close_validate \ # 关闭验证数组
    procd_add_jail \ # 添加 jail 配置
    procd_add_jail_mount \ # 添加 jail 只读挂载点
    procd_add_jail_mount_rw \ # 添加 jail 可写挂载点
    procd_set_param \ # 设置服务实例参数
    procd_append_param \ # 追加服务实例参数
    procd_add_validation \ # 添加验证规则
    procd_set_config_changed \ # 设置配置变更事件
    procd_kill \ # 终止服务或实例
    procd_send_signal # 发送信号到服务或实例
