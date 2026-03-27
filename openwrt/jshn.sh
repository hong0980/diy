#!/bin/sh
# =============================================================================
# jshn.sh —— OpenWrt JSON 操作库（Shell 版）
# =============================================================================
# jshn（JSON Shell Notation）是 OpenWrt libubox 提供的 Shell JSON 处理库。
# 它将 JSON 对象/数组"展平"存储为 Shell 变量，通过命名约定实现结构访问，
# 同时依赖外部二进制程序 jshn（C 语言实现）完成实际的 JSON 序列化/反序列化。
#
# 【核心设计思想】
#   JSON 数据在 Shell 中用带前缀的变量模拟树形结构：
#     ${前缀}J_V            - 根对象/数组（固定名 J_V）
#     ${前缀}J_T<序号>      - 子对象（T = table/object）
#     ${前缀}J_A<序号>      - 子数组（A = array）
#     ${前缀}<节点>_<键名>  - 节点的字段值（如 J_V_name = "router"）
#     ${前缀}T_<节点>_<键名>- 字段类型（如 T_J_V_name = "string"）
#     ${前缀}K_<节点>       - 节点的所有键名（空格分隔列表）
#     ${前缀}S_<节点>       - 数组的当前元素序号（仅数组有）
#     ${前缀}U_<节点>       - 节点的父节点名（用于 json_select .. 返回上层）
#     ${前缀}N_<节点>_<键>  - 键名的原始形式（当键名含特殊字符时存储原始名）
#     ${前缀}JSON_CUR       - 当前操作节点（构建/访问时的"光标"）
#     ${前缀}JSON_SEQ       - 全局序号计数器（生成唯一节点名）
#     ${前缀}JSON_UNSET     - 待清理的变量列表（供 json_cleanup 使用）
#
# 【命名空间机制】
#   通过 json_set_namespace 设置 JSON_PREFIX，所有变量名自动加上前缀，
#   允许在同一 Shell 进程中同时操作多个独立的 JSON 文档（如 procd.sh 使用）。
#
# 【典型使用示例】
#   ┌── 构建 JSON ──────────────────────────────────────┐
#   │  json_init                                        │
#   │  json_add_string "name" "OpenWrt"                 │
#   │  json_add_int    "port" 80                        │
#   │  json_add_object "config"                         │
#   │    json_add_boolean "enabled" 1                   │
#   │  json_close_object                                │
#   │  json_dump        # 输出：{"name":"OpenWrt",...}  │
#   └───────────────────────────────────────────────────┘
#
#   ┌── 解析 JSON ──────────────────────────────────────┐
#   │  json_load '{"name":"OpenWrt","port":80}'         │
#   │  json_get_var name "name"    # name="OpenWrt"     │
#   │  json_get_var port "port"    # port="80"          │
#   └───────────────────────────────────────────────────┘
# =============================================================================


# =============================================================================
# ── 内部底层辅助函数（双下划线前缀，不对外使用）─────────────────────────────
# =============================================================================

# _json_get_var() —— 读取带命名空间前缀的 JSON 内部变量到目标变量
# 参数：$1 - 目标变量名；$2 - 不含前缀的内部变量名
# 原理：eval "$1=\"\$${JSON_PREFIX}$2\"" 相当于 dest="${JSON_PREFIX}varname"
_json_get_var() {
    # dest=$1
    # var=$2
    eval "$1=\"\$${JSON_PREFIX}$2\""
}

# _json_set_var() —— 将值写入带命名空间前缀的 JSON 内部变量
# 参数：$1 - 不含前缀的内部变量名；$2 - 要写入的值
_json_set_var() {
    # var=$1
    local ___val="$2"
    eval "${JSON_PREFIX}$1=\"\$___val\""
}

# __jshn_raw_append() —— 向变量追加一个值（用分隔符连接，不加前缀）
# 参数：$1 - 目标变量名（直接使用，不加前缀）
#       $2 - 要追加的值
#       $3 - 分隔符（默认空格）
# 原理：若变量已有值则加分隔符，若追加值为空则跳过
__jshn_raw_append() {
    # var=$1
    local value="$2"
    local sep="${3:- }"

    # 若 $1 已有值且 value 非空，则在中间插入分隔符
    eval "export -- \"$1=\${$1:+\${$1}\${value:+\$sep}}\$value\""
}

# _jshn_append() —— 向带命名空间前缀的变量追加一个值（空格分隔）
# 参数：$1 - 不含前缀的变量名；$2 - 要追加的值
_jshn_append() {
    # var=$1
    local _a_value="$2"
    eval "${JSON_PREFIX}$1=\"\${${JSON_PREFIX}$1} \$_a_value\""
}

# _get_var() —— 读取任意变量名（由另一变量指定）的值
# 参数：$1 - 目标变量名；$2 - 源变量名（变量的变量）
_get_var() {
    # var=$1
    # value=$2
    eval "$1=\"\$$2\""
}

# _set_var() —— 将值写入任意变量（变量名由参数指定）
# 参数：$1 - 变量名（字符串）；$2 - 值
_set_var() {
    # var=$1
    local __val="$2"
    eval "$1=\"\$__val\""
}

# _json_inc() —— 对带前缀的计数器变量加1，并将结果赋给目标变量
# 参数：$1 - 不含前缀的计数器变量名；$2 - 接收递增后值的目标变量名
# 示例：_json_inc "JSON_SEQ" seq  → JSON_SEQ++，seq = JSON_SEQ 的新值
_json_inc() {
    # var=$1
    # dest=$2
    let "${JSON_PREFIX}$1 += 1" "$2 = ${JSON_PREFIX}$1"
}


# =============================================================================
# _json_add_generic() —— 向当前 JSON 节点添加任意类型的字段（核心内部函数）
# =============================================================================
# 参数：$1 - 类型（string/int/boolean/double/null/object/array）
#       $2 - 键名（数组中为空字符串 ""）
#       $3 - 值
#       $4 - 当前节点名（如 J_V、J_T1）
# 说明：
#   - 若当前节点是数组（J_A 前缀），自动递增序号作为键名
#   - 否则将键名中的非法字符替换为下划线作为变量名；若原始键名与处理后不同，
#     将原始键名额外保存在 N_<节点>_<变量名> 变量中（用于序列化时还原）
#   - 最终设置两个变量：值变量和类型变量
#   - 将新键名加入当前节点的键列表（K_<节点>）
#   - 将节点+键名加入全局 JSON_UNSET 列表（用于 json_cleanup 清理）
# =============================================================================
_json_add_generic() {
    # type=$1
    # name=$2
    # value=$3
    # cur=$4

    local var
    if [ "${4%%[0-9]*}" = "J_A" ]; then
        # 当前节点是数组：键名由序号自动生成（S_<节点> 递增）
        _json_inc "S_$4" var
    else
        # 当前节点是对象：将键名中的非字母数字下划线字符替换为 _
        var="${2//[^a-zA-Z0-9_]/_}"
        # 若键名经过了替换（即原始键名含特殊字符），保存原始键名以便序列化还原
        [[ "$var" == "$2" ]] || export -- "${JSON_PREFIX}N_${4}_${var}=$2"
    fi

    # 设置字段值和类型变量
    export -- \
        "${JSON_PREFIX}${4}_$var=$3" \
        "${JSON_PREFIX}T_${4}_$var=$1"
    # 将此字段加入待清理列表
    _jshn_append "JSON_UNSET" "${4}_$var"
    # 将键名加入当前节点的键列表（K_<节点>）
    _jshn_append "K_$4" "$var"
}


# =============================================================================
# _json_add_table() —— 新建对象或数组节点（作为当前节点的子节点）
# =============================================================================
# 参数：$1 - 键名（在父节点中的名称）
#       $2 - 类型（"object" 或 "array"）
#       $3 - 节点类型前缀（T=对象，A=数组）
# 说明：
#   1. 生成唯一序号，创建新节点名（如 J_T3、J_A4）
#   2. 将当前节点名保存到新节点的 U_<新节点> 变量（父节点引用，用于 json_select ..）
#   3. 将当前节点切换为新节点
#   4. 在父节点中注册此子节点（调用 _json_add_generic）
# =============================================================================
_json_add_table() {
    # name=$1
    # type=$2
    # itype=$3
    local cur seq

    _json_get_var cur JSON_CUR        # 获取当前节点
    _json_inc JSON_SEQ seq            # 全局序号 +1，seq = 新序号

    local table="J_$3$seq"           # 新节点名，如 J_T3 或 J_A4
    _json_set_var "U_$table" "$cur"  # 记录父节点（用于 json_select .. 返回上层）
    export -- "${JSON_PREFIX}K_$table="  # 初始化空键列表
    unset "${JSON_PREFIX}S_$table"   # 清除数组序号（避免旧状态干扰）
    _json_set_var JSON_CUR "$table"  # 将"光标"移到新节点
    _jshn_append "JSON_UNSET" "$table"  # 加入待清理列表

    # 在父节点（$cur）中注册此子节点（类型为 object/array，值为节点名）
    _json_add_generic "$2" "$1" "$table" "$cur"
}


# _json_close_table() —— 从当前节点返回其父节点（"光标"上移）
_json_close_table() {
    local _s_cur

    _json_get_var _s_cur JSON_CUR              # 获取当前节点
    _json_get_var "${JSON_PREFIX}JSON_CUR" "U_$_s_cur"  # 将光标设为父节点
}


# =============================================================================
# json_set_namespace() —— 切换 JSON 命名空间（变量前缀）
# =============================================================================
# 参数：$1 - 新的命名空间前缀（如 "procd"，之后变量名为 procdJ_V 等）
#       $2 - 保存旧前缀的变量名（可选，用于恢复）
# 说明：允许多个 JSON 文档在同一 Shell 进程中并行操作而互不干扰。
#       procd.sh 用此机制在 procd 命名空间和外部命名空间之间切换。
# 示例：
#   json_set_namespace procd old_ns    # 切换到 procd 命名空间，保存旧命名空间
#   # ... 操作 procd 的 JSON ...
#   json_set_namespace "$old_ns"       # 恢复旧命名空间
# =============================================================================
json_set_namespace() {
    local _new="$1"
    local _old="$2"

    [ -n "$_old" ] && _set_var "$_old" "$JSON_PREFIX"  # 保存当前前缀到 _old 指定的变量
    JSON_PREFIX="$_new"                                # 设置新前缀
}


# =============================================================================
# json_cleanup() —— 清理当前命名空间中所有 JSON 相关变量
# =============================================================================
# 说明：遍历 JSON_UNSET 列表，将所有与 JSON 树相关的变量全部 unset。
#       同时清理根节点 J_V 和 JSON 状态变量（JSON_SEQ、JSON_CUR、JSON_UNSET）。
#       在 json_init 前或不再需要 JSON 数据时调用。
# =============================================================================
json_cleanup() {
    local unset tmp

    _json_get_var unset JSON_UNSET    # 获取待清理的变量名列表
    for tmp in $unset J_V; do
        # 清理每个节点相关的所有变量（值、键列表、序号、类型、父节点、原始键名）
        unset \
            ${JSON_PREFIX}U_$tmp \    # 父节点引用
            ${JSON_PREFIX}K_$tmp \    # 键列表
            ${JSON_PREFIX}S_$tmp \    # 数组序号
            ${JSON_PREFIX}T_$tmp \    # 字段类型（注：这里实际清理的是节点级类型变量）
            ${JSON_PREFIX}N_$tmp \    # 原始键名
            ${JSON_PREFIX}$tmp        # 字段值
    done

    # 清理 JSON 状态变量
    unset \
        ${JSON_PREFIX}JSON_SEQ \      # 全局序号计数器
        ${JSON_PREFIX}JSON_CUR \      # 当前节点光标
        ${JSON_PREFIX}JSON_UNSET      # 待清理列表
}


# =============================================================================
# json_init() —— 初始化 JSON 文档（重置所有状态）
# =============================================================================
# 说明：先清理旧数据，再初始化根节点 J_V 作为当前操作节点。
#       每次开始构建或准备接收新 JSON 数据前必须调用。
# =============================================================================
json_init() {
    json_cleanup
    export -n ${JSON_PREFIX}JSON_SEQ=0          # 序号从 0 开始
    export -- \
        ${JSON_PREFIX}JSON_CUR="J_V" \           # 初始光标指向根节点 J_V
        ${JSON_PREFIX}K_J_V=                     # 根节点键列表初始化为空
}


# =============================================================================
# ── JSON 构建函数（写操作）────────────────────────────────────────────────────
# =============================================================================

# json_add_object() —— 在当前位置添加一个对象，并进入该对象
# 参数：$1 - 对象的键名（在数组中可为空 ""）
# 说明：调用后"光标"移入新对象，需配对调用 json_close_object
# 示例：
#   json_add_object "config"
#     json_add_string "host" "localhost"
#   json_close_object
json_add_object() {
    _json_add_table "$1" object T   # T = table，对象节点前缀
}

# json_close_object() —— 关闭当前对象，返回父节点
json_close_object() {
    _json_close_table
}

# json_add_array() —— 在当前位置添加一个数组，并进入该数组
# 参数：$1 - 数组的键名
# 说明：进入数组后，添加的元素键名自动按序号生成（0、1、2...）
# 示例：
#   json_add_array "servers"
#     json_add_string "" "192.168.1.1"
#     json_add_string "" "192.168.1.2"
#   json_close_array
json_add_array() {
    _json_add_table "$1" array A   # A = array，数组节点前缀
}

# json_close_array() —— 关闭当前数组，返回父节点
json_close_array() {
    _json_close_table
}

# json_add_string() —— 向当前对象/数组添加字符串类型字段
# 参数：$1 - 键名（数组元素用 ""）；$2 - 字符串值
# 示例：json_add_string "name" "OpenWrt"
json_add_string() {
    local cur
    _json_get_var cur JSON_CUR
    _json_add_generic string "$1" "$2" "$cur"
}

# json_add_int() —— 向当前对象/数组添加整数类型字段
# 参数：$1 - 键名；$2 - 整数值
# 示例：json_add_int "port" 8080
json_add_int() {
    local cur
    _json_get_var cur JSON_CUR
    _json_add_generic int "$1" "$2" "$cur"
}

# json_add_boolean() —— 向当前对象/数组添加布尔类型字段
# 参数：$1 - 键名；$2 - 布尔值（0 或 1）
# 示例：json_add_boolean "enabled" 1
json_add_boolean() {
    local cur
    _json_get_var cur JSON_CUR
    _json_add_generic boolean "$1" "$2" "$cur"
}

# json_add_double() —— 向当前对象/数组添加浮点数类型字段
# 参数：$1 - 键名；$2 - 浮点数值
# 示例：json_add_double "ratio" 3.14
json_add_double() {
    local cur
    _json_get_var cur JSON_CUR
    _json_add_generic double "$1" "$2" "$cur"
}

# json_add_null() —— 向当前对象/数组添加 null 类型字段
# 参数：$1 - 键名
# 示例：json_add_null "data"  → JSON: "data": null
json_add_null() {
    local cur
    _json_get_var cur JSON_CUR
    _json_add_generic null "$1" "" "$cur"
}

# =============================================================================
# json_add_fields() —— 批量添加字段（键:类型=值 格式）
# =============================================================================
# 参数：一个或多个字段描述，格式为 "键名:类型=值" 或 "键名=值"（类型默认 string）
# 支持的类型：string、int、boolean、double
# 示例：
#   json_add_fields "name:string=OpenWrt" "port:int=80" "debug:boolean=1"
# =============================================================================
json_add_fields() {
    while [ "$#" -gt 0 ]; do
        local field="$1"
        shift

        local name="${field%%=*}"    # 等号前：键名（可能含类型 "name:type"）
        local val="${field#*=}"      # 等号后：值
        [ "$name" != "$val" ] || val=""  # 无等号时值为空

        local type="${name#*:}"      # 冒号后：类型名
        [ "$type" != "$name" ] || type=string  # 无冒号时默认 string
        name="${name%%:*}"           # 冒号前：键名

        case "$type" in
            string|int|boolean|double)
                local cur
                _json_get_var cur JSON_CUR
                _json_add_generic "$type" "$name" "$val" "$cur"
            ;;
            # 其他类型忽略（防止非法类型注入）
        esac
    done
}


# =============================================================================
# ── JSON 序列化选项 ───────────────────────────────────────────────────────────
# =============================================================================

# json_compact() —— 设置输出为紧凑格式（无换行无缩进）
# 说明：适用于通过 ubus 发送 JSON 数据时减少数据量
json_compact() {
    JSON_NONEWLINE=1
    JSON_INDENT=
}

# json_pretty() —— 设置输出为美化格式（带换行和缩进）
# 说明：适用于调试时阅读 JSON 输出
json_pretty() {
    JSON_NONEWLINE=
    JSON_INDENT=1
}


# =============================================================================
# ── JSON 反序列化（加载）函数 ─────────────────────────────────────────────────
# =============================================================================

# json_load() —— 从字符串加载 JSON 数据到 Shell 变量
# 参数：$1 - JSON 字符串
# 说明：调用外部 jshn 程序（C 实现）解析 JSON，生成 Shell 赋值语句，
#       再通过 eval 将变量导入当前环境。加载后可用 json_get_var 等函数读取。
# 示例：
#   json_load '{"name":"OpenWrt","port":80}'
#   json_get_var name "name"   # name="OpenWrt"
json_load() {
    eval "`jshn -r "$1"`"   # jshn -r: 将 JSON 字符串反序列化为 Shell 赋值语句
}

# json_load_file() —— 从文件加载 JSON 数据到 Shell 变量
# 参数：$1 - JSON 文件路径
# 示例：json_load_file "/etc/board.json"
json_load_file() {
    eval "`jshn -R "$1"`"   # jshn -R: 从文件读取 JSON 并反序列化
}

# =============================================================================
# json_dump() —— 将当前 Shell 变量中的 JSON 数据序列化为 JSON 字符串
# =============================================================================
# 说明：调用外部 jshn 程序（-w 写模式）将 Shell 变量树序列化为 JSON 输出。
#       -p: 指定命名空间前缀；-n: 紧凑模式（无换行）；-i: 美化模式（缩进）
# 典型用途：json_init → json_add_* → json_dump → 传给 ubus call
# =============================================================================
json_dump() {
    jshn "$@" ${JSON_PREFIX:+-p "$JSON_PREFIX"} ${JSON_NONEWLINE:+-n} ${JSON_INDENT:+-i} -w
}


# =============================================================================
# ── JSON 读取函数（读操作）────────────────────────────────────────────────────
# =============================================================================

# =============================================================================
# json_get_type() —— 获取当前对象中指定字段的类型
# =============================================================================
# 参数：$1 - 目标变量名（用于接收类型字符串）；$2 - 字段键名
# 输出类型：string、int、boolean、double、null、object、array
# 返回：0 - 字段存在；1 - 字段不存在
# 示例：
#   json_get_type t "name"   # t="string"
#   json_get_type t "config" # t="object"
# =============================================================================
json_get_type() {
    local __dest="$1"
    local __cur

    _json_get_var __cur JSON_CUR
    # 类型变量名格式：T_<当前节点>_<键名>（键名中特殊字符已替换为_）
    local __var="${JSON_PREFIX}T_${__cur}_${2//[^a-zA-Z0-9_]/_}"
    # 将类型值赋给目标变量；若类型变量未定义则返回 1
    eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"
}

# =============================================================================
# json_get_keys() —— 获取当前对象/数组的所有键名（空格分隔列表）
# =============================================================================
# 参数：$1 - 目标变量名；$2 - 可选的对象/数组字段名（省略则用当前节点）
# 说明：键名列表存储在 K_<节点> 变量中，此函数将其读取并赋给目标变量。
# 示例：
#   json_get_keys keys        # keys = "name port config"
#   json_get_keys keys "arr"  # 获取 arr 数组/对象的键列表
# =============================================================================
json_get_keys() {
    local __dest="$1"
    local _tbl_cur

    if [ -n "$2" ]; then
        json_get_var _tbl_cur "$2"       # 获取指定字段所指向的节点名
    else
        _json_get_var _tbl_cur JSON_CUR  # 使用当前节点
    fi
    local __var="${JSON_PREFIX}K_${_tbl_cur}"
    eval "export -- \"$__dest=\${$__var}\"; [ -n \"\${$__var+x}\" ]"
}

# =============================================================================
# json_get_values() —— 获取当前数组/对象的所有值（空格分隔）
# =============================================================================
# 参数：$1 - 目标变量名（接收空格分隔的值列表）
#       $2 - 可选的数组/对象字段名（指定时自动进入再退出）
# 说明：遍历所有键，依次取值并拼接，适用于读取简单值数组。
# 示例：
#   json_add_array "servers"
#     json_add_string "" "8.8.8.8"
#     json_add_string "" "1.1.1.1"
#   json_close_array
#   json_get_values vals "servers"   # vals = "8.8.8.8 1.1.1.1"
# =============================================================================
json_get_values() {
    local _v_dest="$1"
    local _v_keys _v_val _select=
    local _json_no_warning=1

    unset "$_v_dest"
    [ -n "$2" ] && {
        json_select "$2" || return 1   # 进入指定字段
        _select=1
    }

    json_get_keys _v_keys     # 获取所有键名
    set -- $_v_keys
    while [ "$#" -gt 0 ]; do
        json_get_var _v_val "$1"                     # 取每个键的值
        __jshn_raw_append "$_v_dest" "$_v_val"       # 追加到结果列表
        shift
    done
    [ -n "$_select" ] && json_select ..  # 若进入了子节点，返回上层

    return 0
}

# =============================================================================
# json_get_var() —— 获取当前节点中指定字段的值
# =============================================================================
# 参数：$1 - 目标变量名；$2 - 字段键名；$3 - 默认值（字段不存在时使用，可选）
# 返回：0 - 字段存在（或提供了默认值）；1 - 字段不存在且无默认值
# 示例：
#   json_get_var name "name"           # name 字段的值
#   json_get_var port "port" "80"      # port 不存在时默认 "80"
# =============================================================================
json_get_var() {
    local __dest="$1"
    local __cur

    _json_get_var __cur JSON_CUR
    # 值变量名格式：<当前节点>_<键名>（键名特殊字符替换为_）
    local __var="${JSON_PREFIX}${__cur}_${2//[^a-zA-Z0-9_]/_}"
    # ${$__var:-$3}: 变量有值则取值，否则用默认值 $3
    # [ -n "${$__var+x}${3+x}" ]: 若变量存在或有默认值则返回 0
    eval "export -- \"$__dest=\${$__var:-$3}\"; [ -n \"\${$__var+x}\${3+x}\" ]"
}

# =============================================================================
# json_get_vars() —— 批量获取多个字段值（字段名即变量名）
# =============================================================================
# 参数：一个或多个字段名，格式为 "字段名" 或 "字段名:默认值"
# 说明：直接将字段值赋给同名变量（省去分别调用 json_get_var 的繁琐）
# 示例：
#   json_get_vars name port      # 等价于 json_get_var name "name"; json_get_var port "port"
#   json_get_vars "timeout:30"   # 读取 timeout 字段，不存在时默认 30
# =============================================================================
json_get_vars() {
    while [ "$#" -gt 0 ]; do
        local _var="$1"; shift
        if [ "$_var" != "${_var#*:}" ]; then
            # 含冒号：冒号前为字段名/变量名，冒号后为默认值
            json_get_var "${_var%%:*}" "${_var%%:*}" "${_var#*:}"
        else
            # 不含冒号：字段名即变量名，无默认值
            json_get_var "$_var" "$_var"
        fi
    done
}


# =============================================================================
# json_select() —— 将"光标"移动到指定字段（进入子对象/数组）
# =============================================================================
# 参数：$1 - 目标字段名；特殊值 ".." 表示返回父节点；空字符串返回根节点
# 返回：0 - 成功移动；1 - 目标不是对象或数组（标量字段不可进入）
# 说明：只能进入 object 或 array 类型的字段，标量字段（string/int 等）不可进入。
#       未设置 _json_no_warning 时，进入不存在/非对象字段会输出警告。
# 示例：
#   json_select "config"     # 进入 config 对象
#   json_get_var host "host" # 读取 config.host
#   json_select ..           # 返回上层
#   json_select              # 返回根节点
# =============================================================================
json_select() {
    local target="$1"
    local type
    local cur

    [ -z "$1" ] && {
        _json_set_var JSON_CUR "J_V"  # 空参数：回到根节点
        return 0
    }
    [[ "$1" == ".." ]] && {
        # ".."：返回父节点（通过 U_<当前节点> 变量获取父节点名）
        _json_get_var cur JSON_CUR
        _json_get_var cur "U_$cur"
        _json_set_var JSON_CUR "$cur"
        return 0
    }
    json_get_type type "$target"
    case "$type" in
        object|array)
            json_get_var cur "$target"      # 获取子节点的实际节点名（如 J_T3）
            _json_set_var JSON_CUR "$cur"   # 将光标移入子节点
        ;;
        *)
            # 目标不存在或非对象/数组，返回失败
            [ -n "$_json_no_warning" ] || \
                echo "WARNING: Variable '$target' does not exist or is not an array/object"
            return 1
        ;;
    esac
}

# =============================================================================
# json_is_a() —— 检查指定字段是否为特定类型
# =============================================================================
# 参数：$1 - 字段键名；$2 - 期望的类型（string/int/boolean/object/array 等）
# 返回：0 - 类型匹配；非 0 - 类型不匹配
# 示例：
#   json_is_a "config" object && echo "config 是对象"
#   json_is_a "port" int && echo "port 是整数"
# =============================================================================
json_is_a() {
    local type

    json_get_type type "$1"
    [ "$type" = "$2" ]
}


# =============================================================================
# json_for_each_item() —— 遍历对象/数组的每个元素并调用回调函数
# =============================================================================
# 参数：$1 - 回调函数名
#       $2 - 字段键名（要遍历的对象或数组）
#       其余参数 - 透传给回调函数的额外参数
# 回调函数的参数：$1=字段值，$2=键名（数组元素为""），其余=透传参数
# 说明：若目标是对象/数组，遍历所有元素逐一调用回调；
#       若目标是标量，直接以该值调用回调一次（键名为空）。
# 示例：
#   print_item() { echo "key=$2, val=$1"; }
#   json_for_each_item print_item "servers"
# =============================================================================
json_for_each_item() {
    [ "$#" -ge 2 ] || return 0
    local function="$1"; shift
    local target="$1"; shift
    local type val

    json_get_type type "$target"
    case "$type" in
        object|array)
            local keys key
            json_select "$target"       # 进入目标节点
            json_get_keys keys          # 获取所有键名
            for key in $keys; do
                json_get_var val "$key"                        # 取当前键的值
                eval "$function \"\$val\" \"\$key\" \"\$@\""  # 调用回调（透传额外参数）
            done
            json_select ..              # 返回上层
        ;;
        *)
            # 标量字段：直接以该值调用回调，键名为空
            json_get_var val "$target"
            eval "$function \"\$val\" \"\" \"\$@\""
        ;;
    esac
}
