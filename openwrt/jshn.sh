#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# functions for parsing and generating json
# 该脚本提供了用于解析和生成 JSON 数据的 shell 函数，主要用于 OpenWrt 系统中的配置处理。

_json_get_var() {
	# 作用：获取 JSON 变量的值并存储到指定变量中。
	# dest=$1
	# var=$2
	eval "$1=\"\$${JSON_PREFIX}$2\""
	# 将 ${JSON_PREFIX}$2 的值赋给 $1。
}

_json_set_var() {
	# 作用：设置 JSON 变量的值。
	# var=$1
	local ___val="$2"
	# 获取要设置的值。
	eval "${JSON_PREFIX}$1=\"\$___val\""
	# 设置 ${JSON_PREFIX}$1 的值为 $___val。
}

__jshn_raw_append() {
	# 作用：将值追加到指定变量，使用指定的分隔符。
	# var=$1
	local value="$2"
	# 获取要追加的值。
	local sep="${3:- }"
	# 获取分隔符，默认为空格。

	eval "export -- \"$1=\${$1:+\${$1}\${value:+\$sep}}\$value\""
	# 如果 $1 已存在且 $value 非空，追加 $sep 和 $value；否则直接设置 $value。
}

_jshn_append() {
	# 作用：将值追加到 JSON 变量，始终使用空格作为分隔符。
	# var=$1
	local _a_value="$2"
	# 获取要追加的值。
	eval "${JSON_PREFIX}$1=\"\${${JSON_PREFIX}$1} \$_a_value\""
	# 将 $_a_value 追加到 ${JSON_PREFIX}$1，前面加空格。
}

_get_var() {
	# 作用：获取普通变量的值并存储到指定变量中。
	# var=$1
	# value=$2
	eval "$1=\"\$$2\""
	# 将 $2 的值赋给 $1。
}

_set_var() {
	# 作用：设置普通变量的值。
	# var=$1
	local __val="$2"
	# 获取要设置的值。
	eval "$1=\"\$__val\""
	# 设置 $1 的值为 $__val。
}

_json_inc() {
	# 作用：将 JSON 变量的值自增并存储结果。
	# var=$1
	# dest=$2
	let "${JSON_PREFIX}$1 += 1" "$2 = ${JSON_PREFIX}$1"
	# 自增 ${JSON_PREFIX}$1，并将结果赋给 $2。
}

_json_add_generic() {
	# 作用：添加通用类型的 JSON 数据（字符串、整数等）。
	# type=$1
	# name=$2
	# value=$3
	# cur=$4
	local var
	# 声明变量存储处理后的名称。
	if [ "${4%%[0-9]*}" = "J_A" ]; then
		# 如果当前表是数组（J_A 开头）。
		_json_inc "S_$4" var
		# 自增序列号，生成数组索引。
	else
		# 如果是对象。
		var="${2//[^a-zA-Z0-9_]/_}"
		# 将名称中的非法字符替换为下划线。
		[[ "$var" == "$2" ]] || export -- "${JSON_PREFIX}N_${4}_${var}=$2"
		# 如果名称被修改，记录原始名称。
	fi

	export -- \
		"${JSON_PREFIX}${4}_$var=$3" \
		"${JSON_PREFIX}T_${4}_$var=$1"
	# 设置值和类型。
	_jshn_append "JSON_UNSET" "${4}_$var"
	# 记录变量以便清理。
	_jshn_append "K_$4" "$var"
	# 追加键到当前表的键列表。
}

_json_add_table() {
	# 作用：添加 JSON 对象或数组。
	# name=$1
	# type=$2
	# itype=$3
	local cur seq
	# 声明变量存储当前表和序列号。

	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_inc JSON_SEQ seq
	# 自增序列号。

	local table="J_$3$seq"
	# 构造新表名（J_T 或 J_A 前缀）。
	_json_set_var "U_$table" "$cur"
	# 记录父表。
	export -- "${JSON_PREFIX}K_$table="
	# 初始化键列表。
	unset "${JSON_PREFIX}S_$table"
	# 清除序列号（用于数组）。
	_json_set_var JSON_CUR "$table"
	# 设置当前表为新表。
	_jshn_append "JSON_UNSET" "$table"
	# 记录表以便清理。

	_json_add_generic "$2" "$1" "$table" "$cur"
	# 将新表作为值添加到父表。
}

_json_close_table() {
	# 作用：关闭当前 JSON 对象或数组，恢复到父表。
	local _s_cur
	# 声明变量存储当前表。

	_json_get_var _s_cur JSON_CUR
	# 获取当前表。
	_json_get_var "${JSON_PREFIX}JSON_CUR" "U_$_s_cur"
	# 恢复到父表。
}

json_set_namespace() {
	# 作用：设置 JSON 操作的命名空间。
	local _new="$1"
	# 获取新命名空间。
	local _old="$2"
	# 获取旧命名空间变量名。

	[ -n "$_old" ] && _set_var "$_old" "$JSON_PREFIX"
	# 如果指定了旧命名空间变量，保存当前命名空间。
	JSON_PREFIX="$_new"
	# 设置新命名空间。
}

json_cleanup() {
	# 作用：清理所有 JSON 相关变量。
	local unset tmp
	# 声明变量存储待清理的变量列表。

	_json_get_var unset JSON_UNSET
	# 获取待清理的变量列表。
	for tmp in $unset J_V; do
		# 遍历变量和默认顶层变量 J_V。
		unset \
			${JSON_PREFIX}U_$tmp \
			${JSON_PREFIX}K_$tmp \
			${JSON_PREFIX}S_$tmp \
			${JSON_PREFIX}T_$tmp \
			${JSON_PREFIX}N_$tmp \
			${JSON_PREFIX}$tmp
		# 清除相关变量。
	done

	unset \
		${JSON_PREFIX}JSON_SEQ \
		${JSON_PREFIX}JSON_CUR \
		${JSON_PREFIX}JSON_UNSET
	# 清除全局控制变量。
}

json_init() {
	# 作用：初始化 JSON 数据结构。
	json_cleanup
	# 清理现有变量。
	export -n ${JSON_PREFIX}JSON_SEQ=0
	# 初始化序列号为 0。
	export -- \
		${JSON_PREFIX}JSON_CUR="J_V" \
		${JSON_PREFIX}K_J_V=
	# 设置当前表为顶层表 J_V，并初始化键列表。
}

json_add_object() {
	# 作用：添加 JSON 对象。
	local name="$1"
	# 获取对象名称。
	_json_add_table "$name" object T
	# 添加类型为 object 的表，内部类型为 T。
}

json_close_object() {
	# 作用：关闭当前 JSON 对象。
	_json_close_table
	# 恢复到父表。
}

json_add_array() {
	# 作用：添加 JSON 数组。
	local name="$1"
	# 获取数组名称。
	_json_add_table "$name" array A
	# 添加类型为 array 的表，内部类型为 A。
}

json_close_array() {
	# 作用：关闭当前 JSON 数组。
	_json_close_table
	# 恢复到父表。
}

json_add_string() {
	# 作用：添加字符串类型的 JSON 数据。
	local name="$1"
	# 获取键名。
	local value="$2"
	# 获取值。
	local cur
	# 声明变量存储当前表。
	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_add_generic string "$name" "$value" "$cur"
	# 添加字符串类型数据。
}

json_add_int() {
	# 作用：添加整数类型的 JSON 数据。
	local name="$1"
	# 获取键名。
	local value="$2"
	# 获取值。
	local cur
	# 声明变量存储当前表。
	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_add_generic int "$name" "$value" "$cur"
	# 添加整数类型数据。
}

json_add_boolean() {
	# 作用：添加布尔类型的 JSON 数据。
	local name="$1"
	# 获取键名。
	local value="$2"
	# 获取值。
	local cur
	# 声明变量存储当前表。
	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_add_generic boolean "$name" "$value" "$cur"
	# 添加布尔类型数据。
}

json_add_double() {
	# 作用：添加双精度浮点类型的 JSON 数据。
	local name="$1"
	# 获取键名。
	local value="$2"
	# 获取值。
	local cur
	# 声明变量存储当前表。
	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_add_generic double "$name" "$value" "$cur"
	# 添加双精度浮点类型数据。
}

json_add_null() {
	# 作用：添加空值类型的 JSON 数据。
	local name="$1"
	# 获取键名。
	local cur
	# 声明变量存储当前表。
	_json_get_var cur JSON_CUR
	# 获取当前表。
	_json_add_generic null "$name" "" "$cur"
	# 添加空值类型数据。
}

# functions read access to json variables

json_load() {
	# 作用：从字符串加载 JSON 数据。
	local input="$1"
	# 获取输入字符串。
	eval "`jshn -r \"$input\"`"
	# 使用 jshn 工具解析 JSON 并执行生成的 shell 命令。
}

json_load_file() {
	# 作用：从文件加载 JSON 数据。
	local file="$1"
	# 获取文件路径。
	eval "`jshn -R \"$file\"`"
	# 使用 jshn 工具读取文件并解析 JSON。
}

json_dump() {
	# 作用：将当前 JSON 数据结构转储为字符串。
	jshn "$@" ${JSON_PREFIX:+-p "$JSON_PREFIX"} -w
	# 调用 jshn 工具，传递命名空间并生成 JSON 字符串。
}

json_get_type() {
	# 作用：获取 JSON 变量的类型。
	local __dest="$1"
	# 获取目标变量名。
	local __cur
	# 声明变量存储当前表。

	_json_get_var __cur JSON_CUR
	# 获取当前表。
	local __var="${JSON_PREFIX}T_${__cur}_${2//[^a-zA-Z0-9_]/_}"
	# 构造类型变量名。
	eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"
	# 将类型赋给目标变量，并检查是否存在。
}

json_get_keys() {
	# 作用：获取 JSON 对象或数组的键列表。
	local __dest="$1"
	# 获取目标变量名。
	local _tbl_cur
	# 声明变量存储表名。

	if [ -n "$2" ]; then
		# 如果指定了表名。
		json_get_var _tbl_cur "$2"
		# 获取表名。
	else
		_json_get_var _tbl_cur JSON_CUR
		# 使用当前表。
	fi
	local __var="${JSON_PREFIX}K_${_tbl_cur}"
	# 构造键列表变量名。
	eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"
	# 将键列表赋给目标变量，并检查是否存在。
}

json_get_values() {
	# 作用：获取 JSON 对象或数组的值列表。
	local _v_dest="$1"
	# 获取目标变量名。
	local _v_keys _v_val _select=
	# 声明变量存储键列表、值和选择标志。
	local _json_no_warning=1
	# 禁用警告。

	unset "$_v_dest"
	# 清空目标变量。
	[ -n "$2" ] && {
		# 如果指定了表名。
		json_select "$2" || return 1
		# 选择表，失败则返回。
		_select=1
		# 设置选择标志。
	}

	json_get_keys _v_keys
	# 获取键列表。
	set -- $_v_keys
	# 将键列表设置为参数。
	while [ "$#" -gt 0 ]; do
		# 遍历键。
		json_get_var _v_val "$1"
		# 获取键对应的值。
		__jshn_raw_append "$_v_dest" "$_v_val"
		# 追加值到目标变量。
		shift
		# 处理下一个键。
	done
	[ -n "$_select" ] && json_select ..
	# 如果选择了表，恢复到父表。

	return 0
	# 成功返回。
}

json_get_var() {
	# 作用：获取 JSON 变量的值。
	local __dest="$1"
	# 获取目标变量名。
	local __cur
	# 声明变量存储当前表。

	_json_get_var __cur JSON_CUR
	# 获取当前表。
	local __var="${JSON_PREFIX}${__cur}_${2//[^a-zA-Z0-9_]/_}"
	# 构造值变量名。
	eval "export -- \"$__dest=\${$__var:-$3}\"; [ -n \"\${$__var+x}\${3+x}\" ]"
	# 将值赋给目标变量，失败时使用默认值 $3，并检查是否存在。
}

json_get_vars() {
	# 作用：批量获取 JSON 变量的值。
	while [ "$#" -gt 0 ]; do
		# 遍历参数。
		local _var="$1"; shift
		# 获取变量名。
		if [ "$_var" != "${_var#*:}" ]; then
			# 如果变量名包含默认值（格式 var:default）。
			json_get_var "${_var%%:*}" "${_var%%:*}" "${_var#*:}"
			# 获取值并指定默认值。
		else
			json_get_var "$_var" "$_var"
			# 获取值，无默认值。
		fi
	done
}

json_select() {
	# 作用：选择 JSON 对象或数组。
	local target="$1"
	# 获取目标名称。
	local type
	# 声明变量存储类型。
	local cur
	# 声明变量存储表名。

	[ -z "$1" ] && {
		# 如果目标为空。
		_json_set_var JSON_CUR "J_V"
		# 恢复到顶层表。
		return 0
		# 成功返回。
	}
	[[ "$1" == ".." ]] && {
		# 如果目标是父表（..）。
		_json_get_var cur JSON_CUR
		# 获取当前表。
		_json_get_var cur "U_$cur"
		# 获取父表。
		_json_set_var JSON_CUR "$cur"
		# 设置当前表为父表。
		return 0
		# 成功返回。
	}
	json_get_type type "$target"
	# 获取目标的类型。
	case "$type" in
		object|array)
			# 如果是对象或数组。
			json_get_var cur "$target"
			# 获取表名。
			_json_set_var JSON_CUR "$cur"
			# 设置当前表。
		;;
		*)
			# 如果不是对象或数组。
			[ -n "$_json_no_warning" ] || \
				echo "WARNING: Variable '$target' does not exist or is not an array/object"
			# 输出警告（除非禁用）。
			return 1
			# 返回失败。
		;;
	esac
}

json_is_a() {
	# 作用：检查 JSON 变量是否为指定类型。
	local type
	# 声明变量存储类型。

	json_get_type type "$1"
	# 获取变量类型。
	[ "$type" = "$2" ]
	# 检查是否匹配指定类型。
}

json_for_each_item() {
	# 作用：对 JSON 对象或数组的每个元素执行指定函数。
	[ "$#" -ge 2 ] || return 0
	# 如果参数不足，返回。
	local function="$1"; shift
	# 获取回调函数。
	local target="$1"; shift
	# 获取目标名称。
	local type val
	# 声明变量存储类型和值。

	json_get_type type "$target"
	# 获取目标类型。
	case "$type" in
		object|array)
			# 如果是对象或数组。
			local keys key
			json_select "$target"
			# 选择目标表。
			json_get_keys keys
			# 获取键列表。
			for key in $keys; do
				# 遍历键。
				json_get_var val "$key"
				# 获取值。
				eval "$function \"\$val\" \"\$key\" \"\$@\""
				# 执行回调函数，传递值、键和其他参数。
			done
			json_select ..
			# 恢复到父表。
		;;
		*)
			# 如果是其他类型。
			json_get_var val "$target"
			# 获取值。
			eval "$function \"\$val\" \"\" \"\$@\""
			# 执行回调函数，无键名。
		;;
	esac
}
