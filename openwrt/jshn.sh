# functions for parsing and generating json
# 用于解析和生成 JSON 的函数集合

# _json_get_var 使用说明:
#   获取 JSON 变量的值
#   参数: dest (目标变量名), var (JSON 变量名)
#   功能: 将指定 JSON 变量的值赋值给目标变量
_json_get_var() {
    # dest=$1
    # var=$2
    eval "$1=\"\$${JSON_PREFIX}$2\""  # 从 JSON_PREFIX 前缀的变量中获取值
}

# _json_set_var 使用说明:
#   设置 JSON 变量的值
#   参数: var (JSON 变量名), value (值)
#   功能: 将值赋给指定 JSON 变量
_json_set_var() {
    # var=$1
    local ___val="$2"
    eval "${JSON_PREFIX}$1=\"\$___val\""  # 设置带 JSON_PREFIX 前缀的变量值
}

# __jshn_raw_append 使用说明:
#   向变量追加原始值
#   参数: var (变量名), value (追加的值), sep (分隔符，默认为空格)
#   功能: 将值追加到指定变量，带可选分隔符
__jshn_raw_append() {
    # var=$1
    local value="$2"
    local sep="${3:- }"  # 默认分隔符为空格

    eval "export -- \"$1=\${$1:+\${$1}\${value:+\$sep}}\$value\""  # 追加值到变量
}

# _jshn_append 使用说明:
#   向 JSON 变量追加值
#   参数: var (JSON 变量名), value (追加的值)
#   功能: 将值追加到带 JSON_PREFIX 前缀的 JSON 变量
_jshn_append() {
    # var=$1
    local _a_value="$2"
    eval "${JSON_PREFIX}$1=\"\${${JSON_PREFIX}$1} \$_a_value\""  # 追加值到 JSON 变量
}

# _get_var 使用说明:
#   获取普通变量的值
#   参数: var (目标变量名), value (源变量名)
#   功能: 将源变量的值赋给目标变量
_get_var() {
    # var=$1
    # value=$2
    eval "$1=\"\$$2\""  # 获取变量值
}

# _set_var 使用说明:
#   设置普通变量的值
#   参数: var (目标变量名), value (值)
#   功能: 将值赋给指定变量
_set_var() {
    # var=$1
    local __val="$2"
    eval "$1=\"\$__val\""  # 设置变量值
}

# _json_inc 使用说明:
#   增加 JSON 计数器的值
#   参数: var (计数器变量名), dest (目标变量名)
#   功能: 增加 JSON 计数器并将结果赋值给目标变量
_json_inc() {
    # var=$1
    # dest=$2
    let "${JSON_PREFIX}$1 += 1" "$2 = ${JSON_PREFIX}$1"  # 增加计数器并赋值
}

# _json_add_generic 使用说明:
#   添加通用 JSON 数据项
#   参数: type (数据类型), name (键名), value (值), cur (当前 JSON 上下文)
#   功能: 添加 JSON 数据项，记录类型、键和值，并维护键列表
_json_add_generic() {
    # type=$1
    # name=$2
    # value=$3
    # cur=$4
    local var
    if [ "${4%%[0-9]*}" = "J_A" ]; then
        _json_inc "S_$4" var  # 对于数组，增加序列号
    else
        var="${2//[^a-zA-Z0-9_]/_}"  # 将键名中的非法字符替换为下划线
        [[ "$var" == "$2" ]] || export -- "${JSON_PREFIX}N_${4}_${var}=$2"  # 记录原始键名
    fi

    export -- \
        "${JSON_PREFIX}${4}_$var=$3" \  # 设置值
        "${JSON_PREFIX}T_${4}_$var=$1"  # 设置类型
    _jshn_append "JSON_UNSET" "${4}_$var"  # 记录需要清理的变量
    _jshn_append "K_$4" "$var"  # 添加到键列表
}

# _json_add_table 使用说明:
#   添加 JSON 对象或数组
#   参数: name (表名), type (类型，object 或 array), itype (内部类型，T 或 A)
#   功能: 创建新的 JSON 对象或数组，并更新当前上下文
_json_add_table() {
    # name=$1
    # type=$2
    # itype=$3
    local cur seq

    _json_get_var cur JSON_CUR  # 获取当前 JSON 上下文
    _json_inc JSON_SEQ seq  # 增加序列号

    local table="J_$3$seq"  # 生成表名
    _json_set_var "U_$table" "$cur"  # 保存父上下文
    export -- "${JSON_PREFIX}K_$table="  # 初始化键列表
    unset "${JSON_PREFIX}S_$table"  # 清空序列计数
    _json_set_var JSON_CUR "$table"  # 设置当前上下文
    _jshn_append "JSON_UNSET" "$table"  # 记录需要清理的表

    _json_add_generic "$2" "$1" "$table" "$cur"  # 添加表到父上下文
}

# _json_close_table 使用说明:
#   关闭当前 JSON 对象或数组
#   参数: 无
#   功能: 恢复到父 JSON 上下文
_json_close_table() {
    local _s_cur

    _json_get_var _s_cur JSON_CUR  # 获取当前上下文
    _json_get_var "${JSON_PREFIX}JSON_CUR" "U_$_s_cur"  # 恢复父上下文
}

# json_set_namespace 使用说明:
#   设置 JSON 命名空间
#   参数: new (新命名空间), old (旧命名空间变量名)
#   功能: 保存当前命名空间并切换到新命名空间
json_set_namespace() {
    local _new="$1"
    local _old="$2"

    [ -n "$_old" ] && _set_var "$_old" "$JSON_PREFIX"  # 保存旧命名空间
    JSON_PREFIX="$_new"  # 设置新命名空间
}

# json_cleanup 使用说明:
#   清理所有 JSON 变量
#   参数: 无
#   功能: 删除所有 JSON 相关变量，释放内存
json_cleanup() {
    local unset tmp

    _json_get_var unset JSON_UNSET  # 获取需要清理的变量列表
    for tmp in $unset J_V; do
        unset \
            ${JSON_PREFIX}U_$tmp \  # 清理父上下文
            ${JSON_PREFIX}K_$tmp \  # 清理键列表
            ${JSON_PREFIX}S_$tmp \  # 清理序列计数
            ${JSON_PREFIX}T_$tmp \  # 清理类型
            ${JSON_PREFIX}N_$tmp \  # 清理原始键名
            ${JSON_PREFIX}$tmp  # 清理值
    done

    unset \
        ${JSON_PREFIX}JSON_SEQ \  # 清理序列号
        ${JSON_PREFIX}JSON_CUR \  # 清理当前上下文
        ${JSON_PREFIX}JSON_UNSET  # 清理未设置列表
}

# json_init 使用说明:
#   初始化 JSON 环境
#   参数: 无
#   功能: 清理现有 JSON 数据并初始化基本变量
json_init() {
    json_cleanup  # 清理现有 JSON 数据
    export -n ${JSON_PREFIX}JSON_SEQ=0  # 初始化序列号
    export -- \
        ${JSON_PREFIX}JSON_CUR="J_V" \  # 设置初始上下文
        ${JSON_PREFIX}K_J_V=  # 初始化键列表
}

# json_add_object 使用说明:
#   添加 JSON 对象
#   参数: name (对象名)
#   功能: 创建一个新的 JSON 对象
json_add_object() {
    _json_add_table "$1" object T  # 添加对象类型表
}

# json_close_object 使用说明:
#   关闭当前 JSON 对象
#   参数: 无
#   功能: 结束当前对象的定义，恢复父上下文
json_close_object() {
    _json_close_table  # 关闭当前表
}

# json_add_array 使用说明:
#   添加 JSON 数组
#   参数: name (数组名)
#   功能: 创建一个新的 JSON 数组
json_add_array() {
    _json_add_table "$1" array A  # 添加数组类型表
}

# json_close_array 使用说明:
#   关闭当前 JSON 数组
#   参数: 无
#   功能: 结束当前数组的定义，恢复父上下文
json_close_array() {
    _json_close_table  # 关闭当前表
}

# json_add_string 使用说明:
#   添加 JSON 字符串
#   参数: name (键名), value (字符串值)
#   功能: 添加一个字符串类型的 JSON 数据项
json_add_string() {
    local cur
    _json_get_var cur JSON_CUR  # 获取当前上下文
    _json_add_generic string "$1" "$2" "$cur"  # 添加字符串
}

# json_add_int 使用说明:
#   添加 JSON 整数
#   参数: name (键名), value (整数值)
#   功能: 添加一个整数类型的 JSON 数据项
json_add_int() {
    local cur
    _json_get_var cur JSON_CUR  # 获取当前上下文
    _json_add_generic int "$1" "$2" "$cur"  # 添加整数
}

# json_add_boolean 使用说明:
#   添加 JSON 布尔值
#   参数: name (键名), value (布尔值)
#   功能: 添加一个布尔类型的 JSON 数据项
json_add_boolean() {
    local cur
    _json_get_var cur JSON_CUR  # 获取当前上下文
    _json_add_generic boolean "$1" "$2" "$cur"  # 添加布尔值
}

# json_add_double 使用说明:
#   添加 JSON 双精度浮点数
#   参数: name (键名), value (浮点数值)
#   功能: 添加一个双精度浮点数类型的 JSON 数据项
json_add_double() {
    local cur
    _json_get_var cur JSON_CUR  # 获取当前上下文
    _json_add_generic double "$1" "$2" "$cur"  # 添加浮点数
}

# json_add_null 使用说明:
#   添加 JSON 空值
#   参数: name (键名)
#   功能: 添加一个空值类型的 JSON 数据项
json_add_null() {
    local cur
    _json_get_var cur JSON_CUR  # 获取当前上下文
    _json_add_generic null "$1" "" "$cur"  # 添加空值
}

# json_add_fields 使用说明:
#   批量添加 JSON 字段
#   参数: field (字段，格式为 name=val 或 name:type=val)
#   功能: 批量添加指定类型的 JSON 字段（字符串、整数、布尔、浮点数）
json_add_fields() {
    while [ "$#" -gt 0 ]; do
        local field="$1"
        shift

        local name="${field%%=*}"  # 提取键名
        local val="${field#*=}"  # 提取值
        [ "$name" != "$val" ] || val=""  # 如果无值，设为空

        local type="${name#*:}"  # 提取类型
        [ "$type" != "$name" ] || type=string  # 默认类型为字符串
        name="${name%%:*}"  # 去除类型部分

        case "$type" in
            string|int|boolean|double)
                local cur
                _json_get_var cur JSON_CUR  # 获取当前上下文
                _json_add_generic "$type" "$name" "$val" "$cur"  # 添加字段
            ;;
        esac
    done
}

# json_compact 使用说明:
#   设置紧凑 JSON 输出格式
#   参数: 无
#   功能: 禁用换行和缩进，生成紧凑的 JSON 输出
json_compact() {
    JSON_NONEWLINE=1  # 禁用换行
    JSON_INDENT=  # 禁用缩进
}

# json_pretty 使用说明:
#   设置美化 JSON 输出格式
#   参数: 无
#   功能: 启用换行和缩进，生成格式化的 JSON 输出
json_pretty() {
    JSON_NONEWLINE=  # 启用换行
    JSON_INDENT=1  # 启用缩进
}

# json_load 使用说明:
#   从字符串加载 JSON 数据
#   参数: json_string (JSON 字符串)
#   功能: 解析 JSON 字符串并加载到变量中
json_load() {
    eval "`jshn -r "$1"`"  # 执行 jshn 解析命令
}

# json_load_file 使用说明:
#   从文件加载 JSON 数据
#   参数: filename (JSON 文件路径)
#   功能: 读取文件内容并解析为 JSON 变量
json_load_file() {
    eval "`jshn -R "$1"`"  # 执行 jshn 解析文件命令
}

# json_dump 使用说明:
#   输出 JSON 数据
#   参数: 可选参数（-p 前缀, -n 无换行, -i 缩进, -w 写入）
#   功能: 将当前 JSON 数据结构输出为 JSON 格式字符串
json_dump() {
    jshn "$@" ${JSON_PREFIX:+-p "$JSON_PREFIX"} ${JSON_NONEWLINE:+-n} ${JSON_INDENT:+-i} -w  # 调用 jshn 输出 JSON
}

# json_get_type 使用说明:
#   获取 JSON 变量的类型
#   参数: dest (目标变量名), key (JSON 键名)
#   功能: 返回指定键的 JSON 数据类型（如 object, array, string 等）
json_get_type() {
    local __dest="$1"
    local __cur

    _json_get_var __cur JSON_CUR  # 获取当前上下文
    local __var="${JSON_PREFIX}T_${__cur}_${2//[^a-zA-Z0-9_]/_}"  # 获取类型变量
    eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"  # 赋值并检查是否存在
}

# json_get_keys 使用说明:
#   获取 JSON 对象或数组的键列表
#   参数: dest (目标变量名), [table] (可选的表名，默认为当前上下文)
#   功能: 返回指定表的所有键名
json_get_keys() {
    local __dest="$1"
    local _tbl_cur

    if [ -n "$2" ]; then
        json_get_var _tbl_cur "$2"  # 获取指定表
    else
        _json_get_var _tbl_cur JSON_CUR  # 获取当前上下文
    fi
    local __var="${JSON_PREFIX}K_${_tbl_cur}"  # 获取键列表变量
    eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"  # 赋值并检查是否存在
}

# json_get_values 使用说明:
#   获取 JSON 对象或数组的值列表
#   参数: dest (目标变量名), [table] (可选的表名，默认为当前上下文)
#   功能: 返回指定表的所有值，忽略键名
json_get_values() {
    local _v_dest="$1"
    local _v_keys _v_val _select=
    local _json_no_warning=1

    unset "$_v_dest"  # 清空目标变量
    [ -n "$2" ] && {
        json_select "$2" || return 1  # 选择指定表
        _select=1
    }

    json_get_keys _v_keys  # 获取键列表
    set -- $_v_keys
    while [ "$#" -gt 0 ]; do
        json_get_var _v_val "$1"  # 获取每个键的值
        __jshn_raw_append "$_v_dest" "$_v_val"  # 追加到目标变量
        shift
    done
    [ -n "$_select" ] && json_select ..  # 恢复父上下文

    return 0
}

# json_get_var 使用说明:
#   获取 JSON 变量的值
#   参数: dest (目标变量名), key (JSON 键名), [default] (默认值)
#   功能: 将指定键的值赋给目标变量，若不存在则使用默认值
json_get_var() {
    local __dest="$1"
    local __cur

    _json_get_var __cur JSON_CUR  # 获取当前上下文
    local __var="${JSON_PREFIX}${__cur}_${2//[^a-zA-Z0-9_]/_}"  # 获取值变量
    eval "export -- \"$__dest=\${$__var:-$3}\"; [ -n \"\${$__var+x}\${3+x}\" ]"  # 赋值并检查是否存在
}

# json_get_vars 使用说明:
#   批量获取 JSON 变量的值
#   参数: var (变量名，可带默认值，格式为 var:default)
#   功能: 批量获取多个 JSON 键的值，支持默认值
json_get_vars() {
    while [ "$#" -gt 0 ]; do
        local _var="$1"; shift
        if [ "$_var" != "${_var#*:}" ]; then
            json_get_var "${_var%%:*}" "${_var%%:*}" "${_var#*:}"  # 获取带默认值
        else
            json_get_var "$_var" "$_var"  # 获取无默认值
        fi
    done
}

# json_select 使用说明:
#   选择 JSON 对象或数组
#   参数: target (目标表名，或 ".." 返回父上下文)
#   功能: 切换到指定表或父上下文，若目标不是对象/数组则报错
json_select() {
    local target="$1"
    local type
    local cur

    [ -z "$1" ] && {
        _json_set_var JSON_CUR "J_V"  # 重置到根上下文
        return 0
    }
    [[ "$1" == ".." ]] && {
        _json_get_var cur JSON_CUR  # 获取当前上下文
        _json_get_var cur "U_$cur"  # 获取父上下文
        _json_set_var JSON_CUR "$cur"  # 设置父上下文
        return 0
    }
    json_get_type type "$target"  # 获取目标类型
    case "$type" in
        object|array)
            json_get_var cur "$target"  # 获取目标表
            _json_set_var JSON_CUR "$cur"  # 设置当前上下文
        ;;
        *)
            [ -n "$_json_no_warning" ] || \
                echo "WARNING: Variable '$target' does not exist or is not an array/object"  # 警告无效目标
            return 1
        ;;
    esac
}

# json_is_a 使用说明:
#   检查 JSON 变量的类型
#   参数: key (JSON 键名), type (预期类型)
#   功能: 检查指定键是否为指定类型
json_is_a() {
    local type

    json_get_type type "$1"  # 获取键类型
    [ "$type" = "$2" ]  # 检查是否匹配
}

# json_for_each_item 使用说明:
#   遍历 JSON 对象或数组的项
#   参数: function (回调函数), target (目标表名), [args] (额外参数)
#   功能: 对指定表的每个键值对调用回调函数
json_for_each_item() {
    [ "$#" -ge 2 ] || return 0
    local function="$1"; shift
    local target="$1"; shift
    local type val

    json_get_type type "$target"  # 获取目标类型
    case "$type" in
        object|array)
            local keys key
            json_select "$target"  # 选择目标表
            json_get_keys keys  # 获取键列表
            for key in $keys; do
                json_get_var val "$key"  # 获取值
                eval "$function \"\$val\" \"\$key\" \"\$@\""  # 调用回调函数
            done
            json_select ..  # 恢复父上下文
        ;;
        *)
            json_get_var val "$target"  # 获取单个值
            eval "$function \"\$val\" \"\" \"\$@\""  # 调用回调函数
        ;;
    esac
}
