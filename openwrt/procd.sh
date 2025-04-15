#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# procd API 文档：
# 该脚本为 OpenWrt 的 procd（进程管理守护进程）提供封装函数，用于管理系统服务和实例。
#
# procd_open_service(name, [script]):
#   作用：初始化一个新的 procd 服务消息，包含一个或多个实例。
#
# procd_close_service():
#   作用：发送服务的命令消息，完成服务配置。
#
# procd_open_instance([name]):
#   作用：在上一个 procd_open_service 定义的服务中添加一个实例。
#
# procd_set_param(type, [value...]):
#   作用：设置实例的参数，支持多种类型（如命令、环境变量等）。
#   可用的类型：
#     command: 命令行（数组）。
#     respawn: 重启信息，包含 $fail_threshold $restart_timeout $max_fail 三个值。
#     env: 传递给进程的环境变量。
#     data: 用于检测配置变化的任意键值对（表）。
#     file: 配置文件（数组）。
#     netdev: 绑定的网络设备（检测接口索引变化）。
#     limits: 资源限制（传递给进程）。
#     user: 服务运行的用户名。
#     group: 服务运行的组名。
#     pidfile: 写入进程 ID 的文件名。
#     stdout: 是否将命令的标准输出重定向到 syslog（默认：0）。
#     stderr: 是否将命令的标准错误重定向到 syslog（默认：0）。
#     facility: 日志记录到 syslog 时使用的设施（默认：daemon）。
#
# procd_close_instance():
#   作用：完成当前实例的配置。
#
# procd_running(service, [instance]):
#   作用：检查指定服务或实例是否正在运行。
#
# procd_kill(service, [instance]):
#   作用：终止指定服务的一个或所有实例。
#
# procd_send_signal(service, [instance], [signal]):
#   作用：向指定服务的一个或所有实例发送信号。

. "$IPKG_INSTROOT/usr/share/libubox/jshn.sh"
# 引入 jshn.sh 脚本，提供 JSON 处理功能。

PROCD_RELOAD_DELAY=1000
# 定义重载延迟时间（毫秒），用于触发器延迟。

_PROCD_SERVICE=
# 初始化服务名称变量，用于存储当前服务的名称。

procd_lock() {
	# 作用：为当前服务创建文件锁，防止并发操作冲突。
	local basescript=$(readlink "$initscript")
	# 获取初始化脚本的符号链接目标。
	local service_name="$(basename ${basescript:-$initscript})"
	# 获取服务名称（基于脚本文件名）。

	flock -n 1000 &> /dev/null
	# 尝试非阻塞获取文件描述符 1000 的锁。
	if [ "$?" != "0" ]; then
		# 如果获取锁失败。
		exec 1000>"$IPKG_INSTROOT/var/lock/procd_${service_name}.lock"
		# 创建锁文件并绑定到文件描述符 1000。
		flock 1000
		# 再次尝试获取锁。
		if [ "$?" != "0" ]; then
			# 如果仍无法获取锁。
			logger "warning: procd flock for $service_name failed"
			# 记录警告日志，提示锁获取失败。
		fi
	fi
}

_procd_call() {
	# 作用：包装函数调用，管理 JSON 命名空间以避免冲突。
	local old_cb
	# 声明变量保存旧的命名空间。

	json_set_namespace procd old_cb
	# 将 JSON 命名空间设置为 procd，并保存旧命名空间。
	"$@"
	# 执行传入的函数调用。
	json_set_namespace $old_cb
	# 恢复原来的 JSON 命名空间。
}

_procd_wrapper() {
	# 作用：为指定的函数创建包装器，确保调用时使用正确的 JSON 命名空间。
	# procd_lock
	# （注释掉的代码）原本用于加锁，当前未启用。
	while [ -n "$1" ]; do
		# 遍历传入的函数名。
		eval "$1() { _procd_call _$1 \"\$@\"; }"
		# 为每个函数动态定义包装器，调用 _procd_call。
		shift
		# 处理下一个函数名。
	done
}

_procd_ubus_call() {
	# 作用：通过 ubus 调用 procd 服务命令，并传递 JSON 数据。
	local cmd="$1"
	# 获取要执行的 ubus 命令。

	[ -n "$PROCD_DEBUG" ] && json_dump >&2
	# 如果启用了调试模式，将 JSON 数据输出到标准错误。
	ubus call service "$cmd" "$(json_dump)"
	# 调用 ubus 的 service 接口，执行指定命令并传递 JSON 数据。
	json_cleanup
	# 清理 JSON 数据结构。
}

_procd_open_service() {
	# 作用：初始化一个新的 procd 服务，设置服务名称和可选脚本。
	local name="$1"
	# 获取服务名称。
	local script="$2"
	# 获取可选的脚本路径。

	_PROCD_SERVICE="$name"
	# 保存服务名称到全局变量。
	_PROCD_INSTANCE_SEQ=0
	# 初始化实例序列计数器。

	json_init
	# 初始化 JSON 数据结构。
	json_add_string name "$name"
	# 添加服务名称到 JSON。
	[ -n "$script" ] && json_add_string script "$script"
	# 如果提供了脚本路径，添加到 JSON。
	json_add_object instances
	# 创建 instances 对象，用于存储实例配置。
}

_procd_close_service() {
	# 作用：完成服务配置，添加触发器和数据，并通过 ubus 发送服务命令。
	json_close_object
	# 关闭 instances 对象。
	_procd_open_trigger
	# 打开触发器数组。
	service_triggers
	# 调用 service_triggers 函数（需外部定义）添加触发器。
	_procd_close_trigger
	# 关闭触发器数组。
	_procd_open_data
	# 打开数据对象。
	service_data
	# 调用 service_data 函数（需外部定义）添加数据。
	_procd_close_data
	# 关闭数据对象。
	_procd_ubus_call ${1:-set}
	# 通过 ubus 调用 service set 命令（默认命令为 set）。
}

_procd_add_array_data() {
	# 作用：向当前 JSON 数组添加多个字符串元素。
	while [ "$#" -gt 0 ]; do
		# 遍历所有参数。
		json_add_string "" "$1"
		# 将参数作为字符串添加到 JSON 数组。
		shift
		# 处理下一个参数。
	done
}

_procd_add_array() {
	# 作用：创建 JSON 数组并添加数据。
	json_add_array "$1"
	# 创建名为 $1 的 JSON 数组。
	shift
	# 跳过数组名称参数。
	_procd_add_array_data "$@"
	# 调用 _procd_add_array_data 添加数据。
	json_close_array
	# 关闭 JSON 数组。
}

_procd_add_table_data() {
	# 作用：向 JSON 对象添加键值对数据。
	while [ -n "$1" ]; do
		# 遍历所有参数。
		local var="${1%%=*}"
		# 提取等号前的键名。
		local val="${1#*=}"
		# 提取等号后的值。
		[ "$1" = "$val" ] && val=
		# 如果参数不含等号，则值为空。
		json_add_string "$var" "$val"
		# 将键值对添加到 JSON 对象。
		shift
		# 处理下一个参数。
	done
}

_procd_add_table() {
	# 作用：创建 JSON 对象并添加键值对数据。
	json_add_object "$1"
	# 创建名为 $1 的 JSON 对象。
	shift
	# 跳过对象名称参数。
	_procd_add_table_data "$@"
	# 调用 _procd_add_table_data 添加数据。
	json_close_object
	# 关闭 JSON 对象。
}

_procd_open_instance() {
	# 作用：为当前服务添加一个新实例，设置实例名称。
	local name="$1"; shift
	# 获取实例名称（可选）。

	_PROCD_INSTANCE_SEQ="$(($_PROCD_INSTANCE_SEQ + 1))"
	# 增加实例序列计数器。
	name="${name:-instance$_PROCD_INSTANCE_SEQ}"
	# 如果未提供名称，使用 instanceN 格式。
	json_add_object "$name"
	# 创建名为 $name 的 JSON 对象。
	[ -n "$TRACE_SYSCALLS" ] && json_add_boolean trace "1"
	# 如果启用了系统调用跟踪，添加 trace 参数。
}

_procd_open_trigger() {
	# 作用：打开触发器数组，支持嵌套触发器。
	let '_procd_trigger_open = _procd_trigger_open + 1'
	# 增加触发器打开计数器。
	[ "$_procd_trigger_open" -gt 1 ] && return
	# 如果触发器已打开，不重复打开。
	json_add_array "triggers"
	# 创建 triggers 数组。
}

_procd_close_trigger() {
	# 作用：关闭触发器数组。
	let '_procd_trigger_open = _procd_trigger_open - 1'
	# 减少触发器打开计数器。
	[ "$_procd_trigger_open" -lt 1 ] || return
	# 如果触发器仍需保持打开状态，不关闭。
	json_close_array
	# 关闭 triggers 数组。
}

_procd_open_data() {
	# 作用：打开数据对象，支持嵌套数据。
	let '_procd_data_open = _procd_data_open + 1'
	# 增加数据打开计数器。
	[ "$_procd_data_open" -gt 1 ] && return
	# 如果数据对象已打开，不重复打开。
	json_add_object "data"
	# 创建 data 对象。
}

_procd_close_data() {
	# 作用：关闭数据对象。
	let '_procd_data_open = _procd_data_open - 1'
	# 减少数据打开计数器。
	[ "$_procd_data_open" -lt 1 ] || return
	# 如果数据对象仍需保持打开状态，不关闭。
	json_close_object
	# 关闭 data 对象。
}

_procd_open_validate() {
	# 作用：打开验证数组，用于存储验证规则。
	json_select ..
	# 返回上层 JSON 对象。
	json_add_array "validate"
	# 创建 validate 数组。
}

_procd_close_validate() {
	# 作用：关闭验证数组并返回触发器层。
	json_close_array
	# 关闭 validate 数组。
	json_select triggers
	# 选择 triggers 层。
}

_procd_add_jail() {
	# 作用：为实例添加 jail（隔离环境）配置，设置名称和选项。
	json_add_object "jail"
	# 创建 jail 对象。
	json_add_string name "$1"
	# 设置 jail 名称。

	shift
	# 跳过名称参数。
	
	for a in $@; do
		# 遍历剩余参数。
		case $a in
		log)	json_add_boolean "log" "1";;
		# 如果参数为 log，启用日志记录。
		ubus)	json_add_boolean "ubus" "1";;
		# 如果参数为 ubus，启用 ubus 支持。
		procfs)	json_add_boolean "procfs" "1";;
		# 如果参数为 procfs，挂载 procfs。
		sysfs)	json_add_boolean "sysfs" "1";;
		# 如果参数为 sysfs，挂载 sysfs。
		ronly)	json_add_boolean "ronly" "1";;
		# 如果参数为 ronly，设置只读模式。
		esac
	done
	json_add_object "mount"
	# 创建 mount 对象，用于存储挂载点。
	json_close_object
	# 关闭 mount 对象。
	json_close_object
	# 关闭 jail 对象。
}

_procd_add_jail_mount() {
	# 作用：为 jail 添加只读挂载点。
	local _json_no_warning=1
	# 禁用 JSON 警告。

	json_select "jail"
	# 选择 jail 对象。
	[ $? = 0 ] || return
	# 如果 jail 不存在，返回。
	json_select "mount"
	# 选择 mount 对象。
	[ $? = 0 ] || {
		# 如果 mount 不存在。
		json_select ..
		# 返回上层。
		return
	}
	for a in $@; do
		# 遍历挂载点参数。
		json_add_string "$a" "0"
		# 添加只读挂载点（0 表示只读）。
	done
	json_select ..
	# 返回 jail 层。
	json_select ..
	# 返回实例层。
}

_procd_add_jail_mount_rw() {
	# 作用：为 jail 添加可读写挂载点。
	local _json_no_warning=1
	# 禁用 JSON 警告。

	json_select "jail"
	# 选择 jail 对象。
	[ $? = 0 ] || return
	# 如果 jail 不存在，返回。
	json_select "mount"
	# 选择 mount 对象。
	[ $? = 0 ] || {
		# 如果 mount 不存在。
		json_select ..
		# 返回上层。
		return
	}
	for a in $@; do
		# 遍历挂载点参数。
		json_add_string "$a" "1"
		# 添加可读写挂载点（1 表示可读写）。
	done
	json_select ..
	# 返回 jail 层。
	json_select ..
	# 返回实例层。
}

_procd_set_param() {
	# 作用：设置实例的各种参数，支持多种类型。
	local type="$1"; shift
	# 获取参数类型。

	case "$type" in
		env|data|limits)
			# 如果类型为 env、data 或 limits。
			_procd_add_table "$type" "$@"
			# 添加键值对表。
		;;
		command|netdev|file|respawn|watch)
			# 如果类型为 command、netdev、file、respawn 或 watch。
			_procd_add_array "$type" "$@"
			# 添加数组。
		;;
		error)
			# 如果类型为 error。
			json_add_array "$type"
			# 创建 error 数组。
			json_add_string "" "$@"
			# 添加错误信息。
			json_close_array
			# 关闭 error 数组。
		;;
		nice|term_timeout)
			# 如果类型为 nice 或 term_timeout。
			json_add_int "$type" "$1"
			# 添加整数值。
		;;
		reload_signal)
			# 如果类型为 reload_signal。
			json_add_int "$type" $(kill -l "$1")
			# 添加信号编号。
		;;
		pidfile|user|group|seccomp|capabilities|facility)
			# 如果类型为 pidfile、user、group、seccomp、capabilities 或 facility。
			json_add_string "$type" "$1"
			# 添加字符串值。
		;;
		stdout|stderr|no_new_privs)
			# 如果类型为 stdout、stderr 或 no_new_privs。
			json_add_boolean "$type" "$1"
			# 添加布尔值。
		;;
	esac
}

_procd_add_timeout() {
	# 作用：为触发器添加延迟时间。
	[ "$PROCD_RELOAD_DELAY" -gt 0 ] && json_add_int "" "$PROCD_RELOAD_DELAY"
	# 如果重载延迟大于 0，添加延迟时间。
	return 0
	# 成功返回。
}

_procd_add_interface_trigger() {
	# 作用：添加网络接口触发器，响应接口事件。
	json_add_array
	# 创建触发器数组。
	_procd_add_array_data "$1"
	# 添加触发器类型。
	shift
	# 跳过类型参数。

	json_add_array
	# 创建条件数组。
	_procd_add_array_data "if"
	# 添加 if 条件。

	json_add_array
	# 创建比较数组。
	_procd_add_array_data "eq" "interface" "$1"
	# 添加接口名称比较。
	shift
	# 跳过接口名称。
	json_close_array
	# 关闭比较数组。

	json_add_array
	# 创建动作数组。
	_procd_add_array_data "run_script" "$@"
	# 添加运行脚本命令。
	json_close_array
	# 关闭动作数组。

	json_close_array
	# 关闭条件数组。
	_procd_add_timeout
	# 添加延迟时间。
	json_close_array
	# 关闭触发器数组。
}

_procd_add_reload_interface_trigger() {
	# 作用：为指定接口添加重载触发器，触发服务重载。
	local script=$(readlink "$initscript")
	# 获取初始化脚本的符号链接目标。
	local name=$(basename ${script:-$initscript})
	# 获取服务名称。

	_procd_open_trigger
	# 打开触发器数组。
	_procd_add_interface_trigger "interface.*" $1 /etc/init.d/$name reload
	# 添加接口触发器，调用服务重载。
	_procd_close_trigger
	# 关闭触发器数组。
}

_procd_add_config_trigger() {
	# 作用：添加配置更改触发器，响应包配置变化。
	json_add_array
	# 创建触发器数组。
	_procd_add_array_data "$1"
	# 添加触发器类型。
	shift
	# 跳过类型参数。

	json_add_array
	# 创建条件数组。
	_procd_add_array_data "if"
	# 添加 if 条件。

	json_add_array
	# 创建比较数组。
	_procd_add_array_data "eq" "package" "$1"
	# 添加包名称比较。
	shift
	# 跳过包名称。
	json_close_array
	# 关闭比较数组。

	json_add_array
	# 创建动作数组。
	_procd_add_array_data "run_script" "$@"
	# 添加运行脚本命令。
	json_close_array
	# 关闭动作数组。

	json_close_array
	# 关闭条件数组。
	_procd_add_timeout
	# 添加延迟时间。
	json_close_array
	# 关闭触发器数组。
}

_procd_add_raw_trigger() {
	# 作用：添加原始触发器，允许自定义触发条件和动作。
	json_add_array
	# 创建触发器数组。
	_procd_add_array_data "$1"
	# 添加触发器类型。
	shift
	# 跳过类型参数。
	local timeout=$1
	# 获取超时时间。
	shift
	# 跳过超时参数。

	json_add_array
	# 创建动作数组。
	json_add_array
	# 创建脚本数组。
	_procd_add_array_data "run_script" "$@"
	# 添加运行脚本命令。
	json_close_array
	# 关闭脚本数组。
	json_close_array
	# 关闭动作数组。

	json_add_int "" "$timeout"
	# 添加超时时间。

	json_close_array
	# 关闭触发器数组。
}

_procd_add_reload_trigger() {
	# 作用：为指定配置文件添加重载触发器，触发服务重载。
	local script=$(readlink "$initscript")
	# 获取初始化脚本的符号链接目标。
	local name=$(basename ${script:-$initscript})
	# 获取服务名称。
	local file
	# 声明文件变量。

	_procd_open_trigger
	# 打开触发器数组。
	for file in "$@"; do
		# 遍历配置文件参数。
		_procd_add_config_trigger "config.change" "$file" /etc/init.d/$name reload
		# 为每个文件添加配置触发器。
	done
	_procd_close_trigger
	# 关闭触发器数组。
}

_procd_add_validation() {
	# 作用：添加验证规则，调用外部验证函数。
	_procd_open_validate
	# 打开验证数组。
	$@
	# 执行传入的验证函数。
	_procd_close_validate
	# 关闭验证数组。
}

_procd_append_param() {
	# 作用：向已有参数追加数据，支持多种类型。
	local type="$1"; shift
	# 获取参数类型。
	local _json_no_warning=1
	# 禁用 JSON 警告。

	json_select "$type"
	# 选择指定类型的 JSON 节点。
	[ $? = 0 ] || {
		# 如果类型不存在。
		_procd_set_param "$type" "$@"
		# 调用 _procd_set_param 设置新参数。
		return
	}
	case "$type" in
		env|data|limits)
			# 如果类型为 env、data 或 limits。
			_procd_add_table_data "$@"
			# 追加键值对数据。
		;;
		command|netdev|file|respawn|watch)
			# 如果类型为 command、netdev、file、respawn 或 watch。
			_procd_add_array_data "$@"
			# 追加数组数据。
		;;
		error)
			# 如果类型为 error。
			json_add_string "" "$@"
			# 追加错误信息。
		;;
	esac
	json_select ..
	# 返回上层 JSON 节点。
}

_procd_close_instance() {
	# 作用：完成实例配置，处理重启参数的默认值。
	local respawn_vals
	# 声明变量保存重启参数。
	_json_no_warning=1
	# 禁用 JSON 警告。
	if json_select respawn ; then
		# 如果存在 respawn 参数。
		json_get_values respawn_vals
		# 获取重启参数值。
		if [ -z "$respawn_vals" ]; then
			# 如果重启参数为空。
			local respawn_threshold=$(uci_get system.@service[0].respawn_threshold)
			# 获取系统默认重启阈值。
			local respawn_timeout=$(uci_get system.@service[0].respawn_timeout)
			# 获取系统默认重启超时。
			local respawn_retry=$(uci_get system.@service[0].respawn_retry)
			# 获取系统默认重试次数。
			_procd_add_array_data ${respawn_threshold:-3600} ${respawn_timeout:-5} ${respawn_retry:-5}
			# 添加默认重启参数。
		fi
		json_select ..
		# 返回上层。
	fi

	json_close_object
	# 关闭实例对象。
}

_procd_add_instance() {
	# 作用：快速添加一个实例，设置命令参数并完成配置。
	_procd_open_instance
	# 打开新实例。
	_procd_set_param command "$@"
	# 设置命令参数。
	_procd_close_instance
	# 关闭实例。
}

procd_running() {
	# 作用：检查指定服务或实例是否正在运行。
	local service="$1"
	# 获取服务名称。
	local instance="${2:-instance1}"
	# 获取实例名称，默认为 instance1。
	local running
	# 声明变量保存运行状态。

	json_init
	# 初始化 JSON 数据结构。
	json_add_string name "$service"
	# 添加服务名称。
	running=$(_procd_ubus_call list | jsonfilter -e "@['$service'].instances['$instance'].running")
	# 调用 ubus 获取实例运行状态。

	[ "$running" = "true" ]
	# 返回运行状态（true 表示运行）。
}

_procd_kill() {
	# 作用：终止指定服务的一个或所有实例。
	local service="$1"
	# 获取服务名称。
	local instance="$2"
	# 获取实例名称。

	json_init
	# 初始化 JSON 数据结构。
	[ -n "$service" ] && json_add_string name "$service"
	# 如果提供了服务名称，添加到 JSON。
	[ -n "$instance" ] && json_add_string instance "$instance"
	# 如果提供了实例名称，添加到 JSON。
	_procd_ubus_call delete
	# 调用 ubus 删除服务或实例。
}

_procd_send_signal() {
	# 作用：向指定服务的一个或所有实例发送信号。
	local service="$1"
	# 获取服务名称。
	local instance="$2"
	# 获取实例名称。
	local signal="$3"
	# 获取信号。

	case "$signal" in
		[A-Z]*)
			# 如果信号是名称（如 SIGTERM）。
			signal="$(kill -l "$signal" 2>/dev/null)" || return 1
			# 转换为信号编号，若失败则返回。
			;;
	esac

	json_init
	# 初始化 JSON 数据结构。
	json_add_string name "$service"
	# 添加服务名称。
	[ -n "$instance" -a "$instance" != "*" ] && json_add_string instance "$instance"
	# 如果提供了具体实例名称，添加到 JSON。
	[ -n "$signal" ] && json_add_int signal "$signal"
	# 如果提供了信号，添加到 JSON。
	_procd_ubus_call signal
	# 调用 ubus 发送信号。
}

procd_open_data() {
	# 作用：打开全局数据对象，用于存储额外数据。
	local name="$1"
	# 获取数据对象名称（未使用）。
	json_set_namespace procd __procd_old_cb
	# 设置 JSON 命名空间并保存旧命名空间。
	json_add_object data
	# 创建 data 对象。
}

procd_close_data() {
	# 作用：关闭全局数据对象。
	json_close_object
	# 关闭 data 对象。
	json_set_namespace $__procd_old_cb
	# 恢复旧 JSON 命名空间。
}

_procd_set_config_changed() {
	# 作用：通知系统某个包的配置已更改。
	local package="$1"
	# 获取包名称。

	json_init
	# 初始化 JSON 数据结构。
	json_add_string type config.change
	# 设置事件类型为配置更改。
	json_add_object data
	# 创建 data 对象。
	json_add_string package "$package"
	# 添加包名称。
	json_close_object
	# 关闭 data 对象。

	ubus call service event "$(json_dump)"
	# 通过 ubus 发送配置更改事件。
}

procd_add_mdns_service() {
	# 作用：添加 mDNS 服务配置，用于服务发现。
	local service proto port
	# 声明服务、协议和端口变量。
	service=$1; shift
	# 获取服务名称。
	proto=$1; shift
	# 获取协议。
	port=$1; shift
	# 获取端口。
	json_add_object "${service}_$port"
	# 创建服务对象，名称为服务名+端口。
	json_add_string "service" "_$service._$proto.local"
	# 添加 mDNS 服务名称。
	json_add_int port "$port"
	# 添加端口号。
	[ -n "$1" ] && {
		# 如果有额外参数（TXT 记录）。
		json_add_array txt
		# 创建 TXT 记录数组。
		for txt in "$@"; do json_add_string "" "$txt"; done
		# 添加每个 TXT 记录。
		json_select ..
		# 返回上层。
	}
	json_select ..
	# 返回上层。
}

procd_add_mdns() {
	# 作用：为服务添加 mDNS 配置。
	procd_open_data
	# 打开数据对象。
	json_add_object "mdns"
	# 创建 mdns 对象。
	procd_add_mdns_service "$@"
	# 添加 mDNS 服务配置。
	json_close_object
	# 关闭 mdns 对象。
	procd_close_data
	# 关闭数据对象。
}

uci_validate_section() {
	# 作用：验证 UCI 配置节的合法性。
	local _package="$1"
	# 获取包名称。
	local _type="$2"
	# 获取配置类型。
	local _name="$3"
	# 获取节名称。
	local _result
	# 声明变量保存验证结果。
	local _error
	# 声明变量保存错误状态。
	shift; shift; shift
	# 跳过前三个参数。
	_result=`/sbin/validate_data "$_package" "$_type" "$_name" "$@" 2> /dev/null`
	# 执行验证命令，捕获结果。
	_error=$?
	# 保存验证命令的状态。
	eval "$_result"
	# 执行验证结果（设置变量）。
	[ "$_error" = "0" ] || `/sbin/validate_data "$_package" "$_type" "$_name" "$@" 1> /dev/null`
	# 如果验证失败，重新执行以显示错误。
	return $_error
	# 返回验证状态。
}

uci_load_validate() {
	# 作用：加载并验证 UCI 配置节，调用回调函数处理结果。
	local _package="$1"
	# 获取包名称。
	local _type="$2"
	# 获取配置类型。
	local _name="$3"
	# 获取节名称。
	local _function="$4"
	# 获取回调函数。
	local _option
	# 声明选项变量。
	local _result
	# 声明结果变量。
	shift; shift; shift; shift
	# 跳过前四个参数。
	for _option in "$@"; do
		# 遍历选项参数。
		eval "local ${_option%%:*}"
		# 为每个选项声明局部变量。
	done
	uci_validate_section "$_package" "$_type" "$_name" "$@"
	# 执行 UCI 配置验证。
	_result=$?
	# 保存验证结果。
	[ -n "$_function" ] || return $_result
	# 如果没有回调函数，直接返回结果。
	eval "$_function \"\$_name\" \"\$_result\""
	# 调用回调函数，传递节名称和验证结果。
}

_procd_wrapper \
	procd_open_service \
	procd_close_service \
	procd_add_instance \
	procd_add_raw_trigger \
	procd_add_config_trigger \
	procd_add_interface_trigger \
	procd_add_reload_trigger \
	procd_add_reload_interface_trigger \
	procd_open_trigger \
	procd_close_trigger \
	procd_open_instance \
	procd_close_instance \
	procd_open_validate \
	procd_close_validate \
	procd_add_jail \
	procd_add_jail_mount \
	procd_add_jail_mount_rw \
	procd_set_param \
	procd_append_param \
	procd_add_validation \
	procd_set_config_changed \
	procd_kill \
	procd_send_signal
# 为列出的函数创建包装器，确保调用时使用正确的 JSON 命名空间。
