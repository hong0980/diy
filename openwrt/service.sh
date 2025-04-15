#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# service: 围绕 start-stop-daemon 的简单封装
# 该脚本为 OpenWrt 系统提供了一个简化的接口，用于管理进程的启动、停止、检查和信号发送。

# 用法：service ACTION EXEC ARGS...
#   ACTION: 操作类型
#   -C: 检查 EXEC 是否存活
#   -S: 启动 EXEC，将 ARGS 作为其参数传递
#   -K: 终止 EXEC，默认发送 TERM 信号（可通过 SERVICE_SIG 指定其他信号）
#
# 暴露的环境变量：
#   SERVICE_DAEMONIZE: 在后台运行 EXEC
#   SERVICE_WRITE_PID: 创建 PID 文件并用于进程匹配
#   SERVICE_MATCH_EXEC: 使用 EXEC 的命令行进行匹配（默认）
#   SERVICE_MATCH_NAME: 使用 EXEC 的进程名称进行匹配
#   SERVICE_USE_PID: 假设 EXEC 自己创建 PID 文件并用于匹配
#   SERVICE_NAME: 使用的进程名称（默认为 EXEC 的文件名部分）
#   SERVICE_PID_FILE: 使用的 PID 文件路径（默认为 /var/run/$SERVICE_NAME.pid）
#   SERVICE_SIG: 使用 -K 时发送的信号
#   SERVICE_SIG_RELOAD: 重载时默认信号
#   SERVICE_SIG_STOP: 停止时默认信号
#   SERVICE_STOP_TIME: 等待进程优雅停止的时间（秒），超时后强制终止
#   SERVICE_UID: EXEC 运行的用户
#   SERVICE_GID: EXEC 运行的组
#   SERVICE_DEBUG: 不执行操作，仅显示将执行的内容
#   SERVICE_QUIET: 不打印任何输出

SERVICE_QUIET=1
# 设置默认安静模式，不打印输出。
SERVICE_SIG_RELOAD="HUP"
# 设置默认重载信号为 HUP。
SERVICE_SIG_STOP="TERM"
# 设置默认停止信号为 TERM。
SERVICE_STOP_TIME=5
# 设置默认停止等待时间为 5 秒。
SERVICE_MATCH_EXEC=1
# 默认使用 EXEC 的命令行进行进程匹配。

service() {
	# 作用：根据指定操作（-C、-S、-K）管理进程，包括检查、启动或终止。
	local ssd
	# 声明变量存储 start-stop-daemon 命令。
	local exec
	# 声明变量存储可执行文件路径。
	local name
	# 声明变量存储进程名称。
	local start
	# 声明变量标记是否为启动操作。
	ssd="${SERVICE_DEBUG:+echo }start-stop-daemon${SERVICE_QUIET:+ -q}"
	# 初始化 start-stop-daemon 命令，添加调试或安静选项。
	case "$1" in
	  -C)
		# 如果操作为检查（-C）。
		ssd="$ssd -K -t"
		# 添加 -K -t 选项，仅测试进程是否存在。
		;;
	  -S)
		# 如果操作为启动（-S）。
		ssd="$ssd -S${SERVICE_DAEMONIZE:+ -b}${SERVICE_WRITE_PID:+ -m}"
		# 添加 -S 选项，启动进程；根据环境变量添加后台运行 (-b) 或 PID 文件创建 (-m)。
		start=1
		# 标记为启动操作。
		;;
	  -K)
		# 如果操作为终止（-K）。
		ssd="$ssd -K${SERVICE_SIG:+ -s $SERVICE_SIG}"
		# 添加 -K 选项，终止进程；如果指定了 SERVICE_SIG，添加信号选项。
		;;
	  *)
		# 如果操作未知。
		echo "service: unknown ACTION '$1'" 1>&2
		# 输出错误信息到标准错误。
		return 1
		# 返回失败状态。
	esac
	shift
	# 跳过操作参数。
	exec="$1"
	# 获取可执行文件路径。
	[ -n "$exec" ] || {
		# 如果未提供可执行文件。
		echo "service: missing argument" 1>&2
		# 输出错误信息到标准错误。
		return 1
		# 返回失败状态。
	}
	[ -x "$exec" ] || {
		# 如果可执行文件不可执行。
		echo "service: file '$exec' is not executable" 1>&2
		# 输出错误信息到标准错误。
		return 1
		# 返回失败状态。
	}
	name="${SERVICE_NAME:-${exec##*/}}"
	# 设置进程名称，优先使用 SERVICE_NAME，否则使用文件名部分。
	[ -z "$SERVICE_USE_PID$SERVICE_WRITE_PID$SERVICE_PID_FILE" ] \
		|| ssd="$ssd -p ${SERVICE_PID_FILE:-/var/run/$name.pid}"
	# 如果使用了 PID 文件相关选项，添加 -p 选项指定 PID 文件路径。
	[ -z "$SERVICE_MATCH_NAME" ] || ssd="$ssd -n $name"
	# 如果指定了按进程名称匹配，添加 -n 选项。
	ssd="$ssd${SERVICE_UID:+ -c $SERVICE_UID${SERVICE_GID:+:$SERVICE_GID}}"
	# 如果指定了用户或组，添加 -c 选项设置运行用户和组。
	[ -z "$SERVICE_MATCH_EXEC$start" ] || ssd="$ssd -x $exec"
	# 如果需要按可执行文件匹配或为启动操作，添加 -x 选项。
	shift
	# 跳过可执行文件参数。
	$ssd${1:+ -- "$@"}
	# 执行 start-stop-daemon 命令，传递剩余参数。
}

service_check() {
	# 作用：检查指定进程是否正在运行。
	service -C "$@"
	# 调用 service 函数，使用 -C 操作检查进程状态。
}

service_signal() {
	# 作用：向指定进程发送自定义信号，默认为 USR1。
	SERVICE_SIG="${SERVICE_SIG:-USR1}" service -K "$@"
	# 设置信号为 SERVICE_SIG（默认 USR1），调用 service 函数使用 -K 操作发送信号。
}

service_start() {
	# 作用：启动指定进程。
	service -S "$@"
	# 调用 service 函数，使用 -S 操作启动进程。
}

service_stop() {
	# 作用：优雅停止指定进程，超时后强制终止。
	local try
	# 声明变量记录尝试次数。
	SERVICE_SIG="${SERVICE_SIG:-$SERVICE_SIG_STOP}" service -K "$@" || return 1
	# 设置信号为 SERVICE_SIG（默认 TERM），尝试终止进程；失败则返回。
	while [ $((try++)) -lt $SERVICE_STOP_TIME ]; do
		# 循环等待进程停止，最多等待 SERVICE_STOP_TIME 秒。
		service -C "$@" || return 0
		# 检查进程是否已停止，若停止则成功返回。
		sleep 1
		# 等待 1 秒。
	done
	SERVICE_SIG="KILL" service -K "$@"
	# 如果超时，发送 KILL 信号强制终止。
	sleep 1
	# 等待 1 秒以确保进程终止。
	! service -C "$@"
	# 检查进程是否仍存在，返回相反状态（不存在为真）。
}

service_reload() {
	# 作用：向指定进程发送重载信号，默认为 HUP。
	SERVICE_SIG="${SERVICE_SIG:-$SERVICE_SIG_RELOAD}" service -K "$@"
	# 设置信号为 SERVICE_SIG（默认 HUP），调用 service 函数使用 -K 操作发送信号。
}
