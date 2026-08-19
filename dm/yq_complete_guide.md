# yq 完整中文指南

> 基于 [mikefarah/yq](https://github.com/mikefarah/yq) 官方 `pkg/yqlib/doc/operators/` 目录下的全部文档整理翻译
>
> yq 是一个轻量级、可移植的命令行 YAML/JSON/XML/INI/Properties/CSV/TSV/TOML 处理器，使用类似 jq 的表达式语法。

---

## 目录

1. [基础用法与核心概念](#1-基础用法与核心概念)
2. [命令行参数详解](#2-命令行参数详解)
3. [数据类型与节点基础](#3-数据类型与节点基础)
4. [表达式语法基础](#4-表达式语法基础)
5. [读取与遍历（导航）](#5-读取与遍历导航)
6. [赋值与更新](#6-赋值与更新)
7. [条件过滤](#7-条件过滤)
8. [删除操作](#8-删除操作)
9. [管道与组合](#9-管道与组合)
10. [变量与作用域](#10-变量与作用域)
11. [环境变量集成](#11-环境变量集成)
12. [合并操作](#12-合并操作)
13. [递归下降](#13-递归下降)
14. [排序与去重](#14-排序与去重)
15. [键操作](#15-键操作)
16. [长度与计数](#16-长度与计数)
17. [字符串操作](#17-字符串操作)
18. [布尔与逻辑运算](#18-布尔与逻辑运算)
19. [样式控制](#19-样式控制)
20. [标签与类型](#20-标签与类型)
21. [注释操作](#21-注释操作)
22. [锚点与别名](#22-锚点与别名)
23. [加载外部文件](#23-加载外部文件)
24. [编码与解码](#24-编码与解码)
25. [多文档处理](#25-多文档处理)
26. [格式转换](#26-格式转换)
27. [Reduce 与函数式操作](#27-reduce-与函数式操作)
28. [With 与 Entries 操作](#28-with-与-entries-操作)
29. [数组映射 map](#29-数组映射-map)
30. [拆分为文档](#30-拆分为文档)
31. [加法与数值运算](#31-加法与数值运算)
32. [节点元信息](#32-节点元信息)
33. [动态求值与系统函数](#33-动态求值与系统函数)
34. [内置函数速查表](#34-内置函数速查表)
35. [常见陷阱与故障排除](#35-常见陷阱与故障排除)
36. [附录：速查表](#36-附录速查表)

---

## 1. 基础用法与核心概念

### 1.1 基本模式

```bash
yq [全局选项] [命令] [表达式] [文件...]
```

### 1.2 核心概念

| 概念 | 说明 |
|------|------|
| **文档 (Document)** | YAML 文件可能包含多个 `---` 分隔的文档 |
| **节点 (Node)** | YAML 中的每个值都是一个带标签的节点 |
| **标量 (Scalar)** | 字符串、数字、布尔、null |
| **序列 (Sequence)** | 数组/列表，对应 JSON 的 `[]` |
| **映射 (Mapping)** | 对象/字典，对应 JSON 的 `{}` |
| **上下文 (Context)** | 管道 `\|` 左侧的输出成为右侧的输入 |

### 1.3 快速示例

```bash
# 读取嵌套值
yq '.a.b[0].c' file.yaml

# 从 STDIN 读取
cat file.yaml | yq '.a.b[0].c'

# 原地更新
yq -i '.a.b[0].c = "cool"' file.yaml

# 使用环境变量
NAME=mike yq -i '.a.b[0].c = strenv(NAME)' file.yaml

# 查找并更新数组中的特定元素
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml

# 创建新文件
yq -n '.someNew = "content"' > newfile.yml
```

### 1.4 命令说明

| 命令 | 简写 | 说明 |
|------|------|------|
| `eval` | (默认) | 对每个文件的每个文档按顺序应用表达式 |
| `eval-all` | `ea` | 加载所有文件的所有文档，然后一次性运行表达式 |
| `completion` | | 生成 Shell 自动补全脚本 |

**eval vs eval-all：**

```bash
# eval: 分别处理每个文档
yq '.a' file1.yaml file2.yaml

# eval-all: 所有文档加载到一个数组中
yq eval-all '.[0].a + .[1].b' file1.yaml file2.yaml
```

### 1.5 数据类型速览

| YAML 表示 | yq tag | kind | 示例 |
|-----------|--------|------|------|
| `hello` | `!!str` | scalar | 字符串 |
| `42` | `!!int` | scalar | 整数 |
| `3.14` | `!!float` | scalar | 浮点数 |
| `true` / `false` | `!!bool` | scalar | 布尔值 |
| `~` / `null` | `!!null` | scalar | 空值 |
| `[1, 2]` | `!!seq` | seq | 序列/数组 |
| `{a: 1}` | `!!map` | map | 映射/对象 |

> ⚠️ **重要**：YAML 1.2 标准中，`yes`/`no`/`on`/`off` 不再被识别为布尔值，而是字符串。

---

## 2. 命令行参数详解

### 2.1 输入输出控制

| 参数 | 简写 | 说明 |
|------|------|------|
| `--inplace` | `-i` | 原地更新文件 |
| `--null-input` | `-n` | 不读取输入，仅评估表达式 |
| `--input-format` | `-p` | 输入格式 |
| `--output-format` | `-o` | 输出格式 |
| `--prettyPrint` | `-P` | 美化打印 |
| `--indent` | `-I` | 缩进级别（默认 2） |
| `--no-doc` | `-N` | 不打印文档分隔符 `---` |
| `--unwrapScalar` | `-r` | 解包标量，纯文本输出 |
| `--exit-status` | `-e` | 无匹配时返回非零退出码 |
| `--from-file` | | 从文件加载表达式 |
| `--front-matter` | `-f` | 提取/处理 YAML 前置内容 |
| `--split-exp` | `-s` | 将每个结果输出到单独文件 |

### 2.2 输入格式支持（`-p`）

```
auto, yaml, json, xml, props, csv, tsv, toml, hcl, ini
```

```bash
# 从 JSON 文件读取，输出 YAML
yq -p json -P file.json

# 从 XML 读取
yq -p xml file.xml
```

### 2.3 输出格式支持（`-o`）

```bash
# YAML 转 JSON（单行）
yq -o json -I=0 file.yaml

# YAML 转 Properties
yq -o props application.yaml

# YAML 转 XML
yq -o xml config.yaml

# YAML 转 TOML
yq -o toml config.yaml

# YAML 转 CSV
yq -o csv data.yaml
```

### 2.4 颜色控制

```bash
yq -C '.a' file.yaml      # 强制彩色
yq -M '.a' file.yaml      # 强制无颜色
```

### 2.5 安全参数

| 参数 | 说明 |
|------|------|
| `--security-disable-env-ops` | 禁用 `env()`, `strenv()`, `envsubst` |
| `--security-disable-file-ops` | 禁用 `load`, `load_str` 等文件操作 |
| `--security-enable-system-operator` | 启用 `system()` 外部命令操作 |

```bash
# 处理不可信输入时禁用危险操作
yq --security-disable-file-ops --security-disable-env-ops '.' untrusted.yaml
```

### 2.6 XML 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--xml-attribute-prefix` | `+@` | XML 属性前缀 |
| `--xml-content-name` | `+content` | 文本内容键名 |
| `--xml-directive-name` | `+directive` | 指令键名 |
| `--xml-keep-namespace` | `true` | 保留 XML 命名空间 |

### 2.7 CSV/TSV 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--csv-separator` | `,` | CSV 分隔符 |
| `--csv-auto-parse` | `true` | 自动解析嵌套 YAML/JSON 值 |

---

## 3. 数据类型与节点基础

### 3.1 标量类型（Scalar）

```yaml
# sample.yml
str: hello
int: 42
float: 3.14
bool: true
null1: ~
null2: null
```

```bash
# 查看各节点的类型标签
yq '.. | tag' sample.yml
# 输出:
# !!map
# !!str
# !!int
# !!float
# !!bool
# !!null
# !!null

# 查看节点基本类型
yq '.. | kind' sample.yml
# 输出: map, scalar, scalar, scalar, scalar, scalar, scalar
```

### 3.2 序列（Sequence / 数组）

```yaml
# sample.yml
- apple
- banana
- cherry
```

```bash
yq 'tag' sample.yml     # !!seq
yq 'kind' sample.yml    # seq
```

### 3.3 映射（Mapping / 对象）

```yaml
# sample.yml
a: 1
b: 2
```

```bash
yq 'tag' sample.yml     # !!map
yq 'kind' sample.yml    # map
```

### 3.4 null 的三种写法与行为

```yaml
# sample.yml
a:        # 空值
b: ~      # 显式 null
c: null   # 无引号时为 !!null
```

```bash
yq '.a == null' sample.yml   # true
yq '.b == null' sample.yml   # true
yq '.c == null' sample.yml   # true
yq '"null" == null' --null-input  # false
```

### 3.5 布尔值陷阱（YAML 1.2）

```bash
# 错误：YAML 1.2 中 yes/no 不是布尔值
yq --null-input '.a = yes'     # Error: unknown name "yes"

# 正确
yq --null-input '.a = true'    # a: true
yq --null-input '.a = "yes"'   # a: "yes"
```

### 3.6 类型检查与过滤

```bash
# 只选择字符串节点
yq '.. | select(tag == "!!str")' sample.yml

# 只选择数字节点并求和
yq '[.. | select(tag == "!!int" or tag == "!!float")] | add' sample.yml

# 检查是否有 null 值
yq '[.. | select(. == null)] | length > 0' sample.yml
```

---

## 4. 表达式语法基础

### 4.1 字面量（Literals）

```bash
# 字符串
yq --null-input '"hello"'          # hello

# 数字
yq --null-input '42'                # 42
yq --null-input '3.14'             # 3.14

# 布尔
yq --null-input 'true'             # true
yq --null-input 'false'            # false

# null
yq --null-input 'null'             # null
yq --null-input '~'                # null

# 数组
yq --null-input '[1, 2, 3]'         # [1, 2, 3]

# 对象
yq --null-input '{"a": 1, "b": 2}'  # a: 1
b: 2
```

### 4.2 当前节点上下文 `.`

```bash
# . 表示当前上下文节点
yq '.a | .' sample.yml     # 等价于 yq '.a' sample.yml

# 在 |= 中，. 表示被更新的当前值
yq '.a |= . + 1' sample.yml
```

### 4.3 索引访问 `.[n]` 与属性访问 `.foo`

```yaml
# sample.yml
a:
  b: apple
  c:
    - x
    - y
```

```bash
yq '.a.b' sample.yml       # apple
yq '.a.c[0]' sample.yml    # x
yq '.a.c[-1]' sample.yml   # y（最后一个）
```

### 4.4 可选访问符 `?`

```yaml
# sample.yml
- 1
- 2
```

```bash
# 不加 ? 会报错
yq '.a' sample.yml        # Error: Cannot index array with string "a"

# 使用可选访问符
yq '.a?' sample.yml       # null（安全返回）
yq '.a?.b?.c?' sample.yml # 任何一层不存在都返回 null
```

### 4.5 联合运算符 `,`（Union）

```bash
# 组合多个标量
yq --null-input '1, true, "cat"'
# 输出:
# 1
# true
# cat

# 组合多个路径
yq '.a, .c' sample.yml
```

### 4.6 管道 `|`

```bash
yq '.a | .b' sample.yml      # 先取 .a，再取 .a 结果中的 .b
yq '.a.b' sample.yml         # 等价写法
```

### 4.7 括号分组 `()`

```bash
# ✅ 正确：括号包裹 LHS，更新反映到原文档
yq '(.a[] | select(. == "apple")) = "frog"' sample.yml

# ❌ 错误：没有括号，只返回更新的子集
yq '.a[] | select(. == "apple") = "frog"' sample.yml
```

### 4.8 构造新对象与数组

```bash
# 构造对象（包裹现有对象）
yq '{"wrap": .}' sample.yml

# 使用 splat 动态构造键
yq '{.name: .pets.[]}' sample.yml

# 构造数组
yq '[.a, .b, .c]' sample.yml
```

### 4.9 默认值运算符 `//`（Alternative）

`//` 在左侧值为 **null** 或 **false** 时返回右侧值：

```bash
# 基本用法
yq '.name // "unknown"' sample.yml

# 链式默认值
yq '.a.b.c // .fallback // "none"' sample.yml

# 环境变量默认值模式
yq -i '.host = strenv(HOST) // "localhost"' config.yaml
```

> **注意**：`//` 与 Shell 注释冲突时，需用引号包裹表达式。

### 4.10 比较运算符 `==` `!=` `>` `<` `>=` `<=`

```bash
# 相等 / 不等
yq '.[] | select(.a == "cat")' sample.yml
yq '.[] | select(.a != "dog")' sample.yml

# 数字比较
yq '.[] | select(.age >= 18 and .age <= 65)' users.yml

# 字符串通配符相等（yq 特有）
yq '.[] | select(.name == "*at")' sample.yml   # cat, goat 匹配

# 非存在键的比较行为
yq 'select(.b != "thing")' sample.yml     # .b 不存在时返回 true
yq 'select(.b == .c)' sample.yml          # 两个都不存在时返回 true
```

### 4.11 变量定义 `as`

```bash
# 单值变量
yq '.a as $foo | $foo' sample.yml

# 多值变量（迭代）
yq '.[] as $item | $item' sample.yml

# 变量在管道中保持可用
yq '.base as $b | .items | .[0] as $first | $first.name | . + $b' sample.yml

# 变量作用域规则：子表达式中重新定义会遮蔽外层
yq '.a as $x | (.b as $x | $x) | $x' sample.yml  # 最后 $x 仍是 .a
```

---

## 5. 读取与遍历（导航）

### 5.1 基本导航

```yaml
# sample.yml
a:
  b: apple
  c:
    d: deep_value
```

```bash
yq '.a' sample.yml        # 输出: b: apple
c:
  d: deep_value
yq '.a.b' sample.yml      # 输出: apple
yq '.a.c.d' sample.yml    # 输出: deep_value
```

### 5.2 数组访问

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.[0]' sample.yml      # 第一个元素: 1
yq '.[-1]' sample.yml     # 最后一个元素: 3
yq '.[1, 2]' sample.yml   # 多选: 2 和 3
yq '.[0:2]' sample.yml    # 切片: [1, 2]
yq '.[1:]' sample.yml     # 从索引1到末尾: [2, 3]
```

### 5.3 展开操作（Splat）

```yaml
# sample.yml
- b: apple
- c: banana
- d: cherry
```

```bash
yq '.[]' sample.yml
# 输出:
# b: apple
# c: banana
# d: cherry

yq '.a[]' sample.yml      # 如果 a 是对象，输出所有值
yq '.. | select(scalar)' sample.yml  # 递归展开所有值
```

### 5.4 特殊键名访问

```yaml
# sample.yml
"red rabbit": frog
a:
  "key.withdots":
    "another.key": apple
  "key-with-dashes": value
```

```bash
yq '.["red rabbit"]' sample.yml       # frog
yq '.a["key.withdots"]["another.key"]' sample.yml   # apple
yq '.a["key-with-dashes"]' sample.yml  # value
```

### 5.5 动态键访问（间接引用）

```yaml
# sample.yml
b: apple
apple: crispy yum
```

```bash
yq '.[.b]' sample.yml     # crispy yum
yq '.[.config.key]' sample.yml
```

### 5.6 可选访问（避免 null 报错）

```yaml
# sample.yml
- 1
- 2
```

```bash
yq '.a' sample.yml        # Error: Cannot index array with string "a"
yq '.a?' sample.yml       # null（安全返回）
yq '.a?.b?.c?' sample.yml # 任何一层不存在都返回 null
```

### 5.7 通配符键匹配

```yaml
# sample.yml
a:
  cat: apple
  mad: things
  dog: banana
```

```bash
yq '.a."*a*"' sample.yml  # apple 和 things
yq '.a."c*"' sample.yml   # apple
yq '.a."*g"' sample.yml   # banana
```

### 5.8 锚点和别名处理

```yaml
# sample.yml
a: &cat
  c: frog
  d: meow
b: *cat
```

```bash
yq '.b' sample.yml        # *cat
yq '.b[]' sample.yml      # frog, meow
yq '.b.c' sample.yml      # frog（自动解引用）
yq 'explode(.b)' sample.yml  # c: frog
d: meow
```

### 5.9 Merge 锚点（YAML 继承）

```yaml
# sample.yml
foo: &foo
  a: foo_a
  thing: foo_thing
bar: &bar
  b: bar_b
  thing: bar_thing
foobar:
  c: foobar_c
  !!merge <<: *foo
  thing: foobar_thing
```

```bash
yq '.foobar.a' sample.yml     # foo_a（从 foo 合并）
yq '.foobar.thing' sample.yml # foobar_thing（本地覆盖优先）
yq '.foobar.c' sample.yml     # foobar_c（本地值优先）
```

### 5.10 多索引选择

```yaml
# sample.yml
a:
  - a
  - b
  - c
```

```bash
yq '.a[0, 2]' sample.yml   # a 和 c
```

### 5.11 数字键映射

```yaml
# sample.yml
2: cat
```

```bash
yq '.[2]' sample.yml   # cat（映射的数字键）
```

### 5.12 parent / parents / root

```yaml
# sample.yml
a:
  b:
    c: hello
```

```bash
yq '.a.b.c | parent' sample.yml     # c: hello
yq '.a.b.c | parents' sample.yml    # 所有祖先
yq '.a.b.c | root' sample.yml       # 整个文档根
yq '.a.b.c | parent(2)' sample.yml  # 向上两级
```

### 5.13 path 与路径操作

```yaml
# sample.yml
a:
  b:
    c: hello
```

```bash
yq '.a.b.c | path' sample.yml           # [a, b, c]
yq '.a.b.c | path | join(".")' sample.yml  # a.b.c
```

### 5.14 getpath / setpath / delpaths

```yaml
# sample.yml
a:
  b:
    c: hello
    d: world
```

```bash
yq 'getpath(["a","b","c"])' sample.yml           # hello
yq 'setpath(["a","b","e"]; "new")' sample.yml    # 自动创建路径
yq 'delpaths([["a","b","c"]])' sample.yml         # 删除
yq 'delpaths([["a","b","c"],["a","b","d"]])' sample.yml  # 批量删除
```

---

## 6. 赋值与更新

### 6.1 两种赋值形式（核心区别）

| 形式 | 符号 | 说明 | RHS 上下文 |
|------|------|------|-----------|
| 绝对赋值 | `=` | RHS 在**原始文档**上下文中运行 | 原始文档根 |
| 相对赋值 | `\|=` | RHS 在**每个 LHS 结果**上下文中运行 | 当前节点 |

```yaml
# sample.yml
a:
  b: apple
  c: banana
```

```bash
# = : RHS 的 . 指向原始文档根
yq '.a.b = .a.c' sample.yml
# 结果: a: {b: banana, c: banana}

# |= : RHS 的 . 指向 .a.b 当前的值
yq '.a.b |= . + " pie"' sample.yml
# 结果: a: {b: apple pie, c: banana}
```

### 6.2 基本赋值

```bash
yq '.a.b = "frog"' sample.yml
```

### 6.3 相对赋值（基于旧值更新）

```bash
yq '.a |= . + 1' sample.yml      # 数字自增
yq '.b |= . + "_suffix"' sample.yml  # 字符串追加
yq '.list |= . + ["new"]' sample.yml  # 数组追加
```

### 6.4 更新为子节点值

```bash
yq '.a |= .b' sample.yml
```

### 6.5 更新为兄弟节点值

```bash
yq '.a = .b' sample.yml
```

### 6.6 多路径同时更新

```bash
yq '(.a, .c) = "potato"' sample.yml
```

### 6.7 数组元素更新

```bash
yq '(.[] | select(. == "*andy")) = "bogs"' sample.yml
yq '.[] |= . + "_updated"' sample.yml
```

### 6.8 深层选择更新（重要陷阱！）

```bash
# ✅ 正确：括号包裹 LHS
yq '(.a[] | select(. == "apple")) = "frog"' sample.yml

# ❌ 错误：没有括号，原文档结构丢失
yq '.a[] | select(. == "apple") = "frog"' sample.yml
```

### 6.9 数组元素批量运算

```bash
yq '.[] |= . * 2' sample.yml
yq '.[] |= . * .' sample.yml
yq '.[] |= (select(. > 1) | . * 10)' sample.yml
```

### 6.10 从其他文件更新

```bash
yq eval-all 'select(fileIndex==0).a = select(fileIndex==1) | select(fileIndex==0)' sample.yml another.yml
```

### 6.11 保留锚点更新

```bash
yq '.a = "dog"' sample.yml      # 默认保留锚点
yq '.a anchor = ""' sample.yml   # 删除锚点
```

### 6.12 自定义类型处理

```bash
yq '.a = .b' sample.yml      # 保留目标标签
yq '.a =c .b' sample.yml     # 复制源标签（c = copy tag）
```

### 6.13 空对象自动创建路径

```bash
yq '.a.b |= "bogs"' sample.yml      # 自动创建路径
yq '.a.b.[0] |= "bogs"' sample.yml  # 自动创建数组路径
yq '.x.y.z[2].name = "test"' sample.yml
```

---

## 7. 条件过滤

### 7.1 基本 Select

```bash
yq '.[] | select(. == "go*")' sample.yml   # 通配符匹配
yq '.[] | select(. == "*go*")' sample.yml  # 包含匹配
```

### 7.2 正则匹配

```bash
yq '.[] | select(test("[a-zA-Z]+_[0-9]$"))' sample.yml
yq '.[] | select(test("THIS"; "i"))' sample.yml   # 忽略大小写
yq '.[] | select(test("dog") | not)' sample.yml   # 不匹配
```

### 7.3 复合条件

```bash
yq '.[] | select(.active == true and .age > 20)' sample.yml
yq '.[] | select(.name == "foo" or .name == "baz")' sample.yml
```

### 7.4 数组中查找并更新

```bash
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml
```

### 7.5 存在性检查

```bash
yq '.a | has("b")' sample.yml      # true
yq '.a | has("z")' sample.yml      # false
yq '. | keys' sample.yml           # [a, c]
```

### 7.6 contains 运算符

```bash
yq --null-input '[1,2,3] | contains([1,2])'     # true
yq --null-input '{"a": 1, "b": 2} | contains({"a": 1})'   # true
yq --null-input '"concatenate" | contains("cat")'   # true
```

---

## 8. 删除操作

### 8.1 删除映射键

```bash
yq 'del(.b)' sample.yml
```

### 8.2 删除嵌套键

```bash
yq 'del(.a.a1)' sample.yml
```

### 8.3 删除数组元素

```bash
yq 'del(.[1])' sample.yml      # 删除索引 1
yq 'del(.[1, 3])' sample.yml   # 删除多个
yq 'del(.[1:3])' sample.yml    # 删除范围
```

### 8.4 删除匹配项

```bash
yq 'del(.[] | select(. == "*at"))' sample.yml
```

### 8.5 递归删除匹配键

```bash
yq 'del(.. | select(has("name")).name)' sample.yml
```

### 8.6 安全删除

```bash
yq 'del(.temp?)' sample.yml
yq 'del(.. | select(. == null))' sample.yml
```

---

## 9. 管道与组合

### 9.1 基本管道

```bash
yq '.a | .b' sample.yml     # 管道传递
```

### 9.2 多更新管道

```bash
yq '.a = "cat" | .b = "dog"' sample.yml
```

### 9.3 Union（联合多个结果）

```bash
yq --null-input '1, true, "cat"'
yq '.a, .c' sample.yml
```

---

## 10. 变量与作用域

### 10.1 单值变量

```bash
yq '.a as $foo | $foo' sample.yml
```

### 10.2 多值变量（迭代）

```bash
yq '.[] as $foo | $foo' sample.yml
```

### 10.3 变量作为查找表

```bash
yq '.realnames as $names | .posts[] | {"title":.title, "author": $names[.author]}' sample.yml
```

### 10.4 交换值

```bash
yq '.a as $x | .b as $y | .b = $x | .a = $y' sample.yml
```

### 10.5 引用路径（ref）

```bash
yq '.a.b ref $x | $x = "new" | $x style="double"' sample.yml
```

### 10.6 环境变量绑定

```bash
export DB_HOST="localhost"
export DB_PORT="5432"

yq -i '
  (strenv(DB_HOST)  // "") as $h |
  (strenv(DB_PORT)  // "") as $p |
  .database.host = $h |
  .database.port = ($p | tonumber)
' config.yaml
```

### 10.7 变量作用域规则

```bash
# 变量在定义后的整个表达式中可用
yq '.a as $x | .b | .c = $x' sample.yml

# 子表达式中重新定义会遮蔽外层
yq '.a as $x | (.b as $x | $x) | $x' sample.yml  # 最后 $x 仍是 .a
```

---

## 11. 环境变量集成

### 11.1 三种环境变量操作符

| 操作符 | 说明 | 使用场景 |
|--------|------|----------|
| `env(NAME)` | 解析为 YAML 节点（自动识别类型） | 布尔值、数字、对象 |
| `strenv(NAME)` | 始终解析为字符串 | 版本号、ID、密码 |
| `envsubst` | 字符串中插值 `${VAR}` | 模板字符串 |

### 11.2 env() - 自动类型识别

```bash
myenv="cat meow" yq --null-input '.a = env(myenv)'     # a: cat meow
myenv="true" yq --null-input '.a = env(myenv)'         # a: true
myenv="12" yq --null-input '.a = env(myenv)'           # a: 12
myenv="[1, 2, 3]" yq --null-input '.a = env(myenv)'    # a: [1, 2, 3]
```

### 11.3 strenv() - 始终作为字符串

```bash
myenv="true" yq --null-input '.a = strenv(myenv)'   # a: "true"
myenv="12" yq --null-input '.a = strenv(myenv)'     # a: "12"
```

### 11.4 动态路径更新

```bash
pathEnv=".a.b[0].name" valueEnv="moo"   yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
```

### 11.5 envsubst - 字符串插值

```bash
myenv="cat" other="red" yq --null-input '"the ${myenv} is ${other}" | envsubst'
# 输出: the cat is red
```

### 11.6 envsubst 高级选项

```bash
yq --null-input '"the ${missing} meows" | envsubst(nu)'     # 未设置报错
yq --null-input '"the ${myenv} meows" | envsubst(ne)'       # 空值报错
yq --null-input '"the ${missing-dog} meows" | envsubst'      # 默认值
```

### 11.7 文档中批量替换环境变量

```bash
DB_HOST=localhost DB_PORT=5432   yq '(.. | select(tag == "!!str")) |= envsubst' sample.yml
```

---

## 12. 合并操作

### 12.1 合并标志速查

| 标志 | 说明 | 示例 |
|------|------|------|
| `*` | 基本合并 | `.a * .b` |
| `+` | 追加数组 | `.a *+ .b` |
| `d` | 深度合并数组 | `.a *d .b` |
| `?` | 仅合并已有字段 | `.a *? .b` |
| `n` | 仅合并新字段 | `.a *n .b` |
| `c` | 覆盖自定义标签 | `.a *c .b` |

### 12.2 基本对象合并

```bash
yq '.a * .b' sample.yml
yq '. * {"a":.b}' sample.yml
```

### 12.3 合并两个文件

```bash
yq '. *= load("file2.yml")' file1.yml
yq '. *d load("file2.yml")' file1.yml
```

### 12.4 合并所有文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml
yq ea '. as $item ireduce ({}; . * $item )' *.yml
```

### 12.5 仅合并已有字段（补丁模式）

```bash
yq '.a *? .b' sample.yml
```

### 12.6 仅合并新字段（安全添加）

```bash
yq '.a *n .b' sample.yml
```

### 12.7 追加数组

```bash
yq '.a *+ .b' sample.yml
```

### 12.8 深度合并数组（按索引合并）

```bash
yq '.a *d .b' sample.yml
```

### 12.9 数值乘法合并

```bash
yq '.a *= .b' sample.yml    # a: 12（3*4）
```

### 12.10 字符串重复

```bash
yq '.b * 4' sample.yml      # banana 重复 4 次
```

---

## 13. 递归下降

### 13.1 基本递归

`..` 递归下降遍历所有节点。

```bash
yq '..' sample.yml
yq '.. | .c?' sample.yml   # 安全查找所有 .c
```

### 13.2 递归查找并更新

```bash
yq -i '(.. | select(has("image")).image) = "nginx:latest"' deployment.yaml
yq -i 'del(.. | .difficulty?)' question-file.yml
yq -i '(.. | select(has("name")).name) |= upcase' data.yaml
```

### 13.3 递归设置样式

```bash
yq '.. style="double"' sample.yml      # 所有值用双引号
yq '... style="double"' sample.yml     # 键和值都用双引号
yq '(.. | select(tag == "!!str")) style="literal"' sample.yml
```

### 13.4 递归类型转换

```bash
yq '(.. | select(tag == "!!int")) tag = "!!str"' sample.yml
yq '(.. | select(. == "true" or . == "false")) |= (. == "true")' sample.yml
```

---

## 14. 排序与去重

### 14.1 数组排序

```bash
yq 'sort_by(.a)' sample.yml
```

### 14.2 多字段排序

```bash
yq 'sort_by(.a, .b)' sample.yml
```

### 14.3 降序排序

```bash
yq 'sort_by(.a) | reverse' sample.yml
yq 'sort_by(-.age)' users.yml
```

### 14.4 映射排序（按键）

```bash
yq 'sort' sample.yml
yq 'sort_by(key | downcase)' sample.yml
```

### 14.5 标量数组去重

```bash
yq 'unique' sample.yml
yq 'unique | sort' sample.yml
```

### 14.6 对象数组去重（按字段）

```bash
yq 'unique_by(.name)' users.yml
```

### 14.7 保留最新去重（反转去重法）

```bash
yq '.proxies |= (reverse | unique_by(.name) | reverse)' sample.yml
```

---

## 15. 键操作

### 15.1 获取键名/索引

```bash
yq '.a | key' sample.yml     # 键名
yq '.[1] | key' sample.yml   # 数组索引
```

### 15.2 重命名键

```bash
yq '(.a.x | key) = "meow"' sample.yml
```

### 15.3 获取所有键

```bash
yq 'keys' sample.yml
yq '.a | keys' sample.yml
```

### 15.4 键名批量修改

```bash
yq 'with_entries(.key |= "prefix_" + .)' sample.yml
yq 'with_entries(.key |= sub("-", "_"))' sample.yml
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= upcase)' sample.yml
```

---

## 16. 长度与计数

### 16.1 各类长度

```bash
yq '.a | length' sample.yml    # 字符串长度: 3
yq 'length' sample.yml         # 映射键值对数量 / 数组元素数量
yq '.a | length' sample.yml    # null 返回 0
```

### 16.2 实用计数

```bash
yq '[.[] | select(.active == true)] | length' sample.yml
yq '[.. | select(tag == "!!seq")] | map(length) | add' sample.yml
```

---

## 17. 字符串操作

### 17.1 插值

```bash
yq '.message = "I like \(.value) and \(.another)"' sample.yml
```

### 17.2 大小写转换

```bash
yq 'upcase' sample.yml       # 转大写（支持 Unicode）
yq 'downcase' sample.yml     # 转小写（支持 Unicode）
```

### 17.3 连接字符串

```bash
yq 'join("; ")' sample.yml
yq '[.[] | select(. != null)] | join(", ")' sample.yml
```

### 17.4 修剪空白

```bash
yq '.[] | trim' sample.yml
```

### 17.5 正则匹配

```bash
yq 'match("foo")' sample.yml
yq '[match("(?i)foo"; "g")]' sample.yml
yq '[match("(ab)(c)"; "g")]' sample.yml
```

### 17.6 命名捕获组

```bash
yq 'capture("(?P<a>[a-z]+)-(?P<n>[0-9]+)")' sample.yml
# 输入: xyzzy-14
# 输出:
# a: xyzzy
# n: "14"
```

### 17.7 正则测试 test

```bash
yq '.[] | select(.name | test("^server-"))' sample.yml
yq '.[] | select(.region | test("(?i)US|america"))' sample.yml
yq '.[] | select(.name | test("hk") | not)' sample.yml
```

### 17.8 替换

```bash
yq '.[] |= sub("(a)", "${1}r")' sample.yml   # 注意：参数用逗号分隔
yq '.[] |= gsub("a", "A")' sample.yml
yq '.[] |= sub("cat", "dog")' sample.yml
```

> ⚠️ **注意**：`sub` 和 `gsub` 的参数使用**逗号 `,`** 分隔，不是分号 `;`。

### 17.9 分割

```bash
yq 'split("; ")' sample.yml
yq 'split("\n")' sample.yml
```

### 17.10 字符串切片

```bash
yq '.country[0:5]' sample.yml     # Austr
yq '.country[5:]' sample.yml      # alia
yq '.country[-5:]' sample.yml      # ralia
```

### 17.11 to_string

```bash
yq '.[] |= to_string' sample.yml
```

---

## 18. 布尔与逻辑运算

### 18.1 逻辑运算

```bash
yq --null-input 'true and false'     # false
yq --null-input 'true or false'      # true
yq --null-input 'true | not'         # false
yq --null-input 'true != false'      # true（异或）
```

### 18.2 any / all

```bash
yq 'any' sample.yml        # 任一 true
yq 'all' sample.yml        # 全部 true
```

### 18.3 条件 any/all

```bash
yq '.[] |= any_c(. == "awesome")' sample.yml
yq '.[] |= all_c(tag == "!!str")' sample.yml
```

### 18.4 条件表达式（select + //）

```bash
# 设置默认值
yq '.name // "unknown"' sample.yml

# 条件赋值（核心模式）
yq '((select(.active == true) | "running") // "stopped")' sample.yml

# 多分支：多次 select + //
yq '((select(.status == "green") | "healthy") // (select(.status == "yellow") | "warning") // "critical")' sample.yml
```

### 18.5 字符串转布尔（环境变量场景）

```bash
export ENABLE_FEATURE="true"

yq -i '
  (strenv(ENABLE_FEATURE) // "") as $e |
  .feature_enabled = (select($e != "") | ($e == "true")) // .
' config.yaml
```

### 18.6 安全条件更新模式（select + //）

```bash
# 核心模式：((select(条件) | .field = 新值) // .)
# 只在条件满足时更新，否则保持原样

yq -i '
  .proxies |= map(
    ((select(.type == "ss" and .cipher == "aes-256-gcm") | .plugin = "obfs") // .)
  )
' config.yaml
```

---

## 19. 样式控制

### 19.1 可用样式

| 样式 | 说明 | YAML 表示 |
|------|------|-----------|
| `""` | 默认（自动） | 自动选择 |
| `"double"` | 双引号 | `"value"` |
| `"single"` | 单引号 | `'value'` |
| `"literal"` | 字面量块 | `\|` |
| `"folded"` | 折叠块 | `>` |
| `"flow"` | 流式 | `{a: 1}` / `[1, 2]` |
| `"tagged"` | 带类型标签 | `!!str value` |

### 19.2 设置样式

```bash
yq '.a.b = "new" | .a.b style="double"' sample.yml
```

### 19.3 使用 with 设置样式

```bash
yq 'with(.a.b ; . = "newValue" | . style="single")' sample.yml
```

### 19.4 全局设置样式

```bash
yq '.. style="double"' sample.yml      # 所有值用双引号
yq '... style="double"' sample.yml     # 键和值都用双引号
yq '.. style="literal"' sample.yml     # 字面量块
yq '.. style="flow"' sample.yml        # 流式格式
```

### 19.5 重置样式（美化打印）

```bash
yq '... style=""' sample.yml
# 等价于
yq -P '.' sample.yml
```

### 19.6 读取样式

```bash
yq '.. | style' sample.yml
```

---

## 20. 标签与类型

### 20.1 获取标签

```bash
yq '.. | tag' sample.yml
yq '.. | kind' sample.yml    # scalar / map / seq
```

### 20.2 设置自定义标签

```bash
yq '.a tag = "!!mikefarah"' sample.yml
```

### 20.3 数字转字符串

```bash
yq '(.. | select(tag == "!!int")) tag= "!!str"' sample.yml
yq '.port tag = "!!str"' config.yml
```

### 20.4 类型检查

```bash
yq '.[] | select(tag == "!!str")' sample.yml
yq '.[] | select(tag == "!!int" or tag == "!!float")' sample.yml
```

---

## 21. 注释操作

### 21.1 三种注释类型

| 类型 | 属性 | 说明 |
|------|------|------|
| 行尾注释 | `line_comment` | 行尾 `# comment` |
| 头部注释 | `head_comment` | 节点前的 `# comment` |
| 尾部注释 | `foot_comment` | 节点后的 `# comment` |

### 21.2 设置行尾注释

```bash
yq '.a line_comment="single"' sample.yml
# 输出: a: cat # single
```

### 21.3 设置映射/数组的注释（在 key 上）

```bash
yq '(.a | key) line_comment="single"' sample.yml
# 输出:
# a: # single
#   b: things
```

### 21.4 设置头部注释

```bash
yq '. head_comment="single"' sample.yml
```

### 21.5 设置尾部注释

```bash
yq '. foot_comment=.a' sample.yml
```

### 21.6 删除注释

```bash
yq '.a line_comment=""' sample.yml
yq '... comments=""' sample.yml   # 删除所有注释
```

### 21.7 全局注释清理

```bash
yq ea '
  . as $item ireduce ({}; . * $item) |
  ... comments=""
' file1.yaml file2.yaml > merged.yaml
```

---

## 22. 锚点与别名

### 22.1 获取锚点名

```bash
yq '.a | anchor' sample.yml
```

### 22.2 设置锚点

```bash
yq '.a anchor = "foobar"' sample.yml
```

### 22.3 获取别名

```bash
yq '.a | alias' sample.yml
```

### 22.4 设置别名

```bash
yq '.a alias = "meow"' sample.yml
```

### 22.5 展开别名（explode）

```bash
yq 'explode(.f)' sample.yml
yq 'explode(.)' sample.yml     # 展开所有别名
```

### 22.6 解引用并更新

```bash
yq '.thingOne |= (explode(.) | sort_keys(.)) * {"value": false}' sample.yml
```

---

## 23. 加载外部文件

### 23.1 加载 YAML 文件

```bash
yq 'load(.myFile)' sample.yml
```

### 23.2 加载为字符串

```bash
yq '.something |= load_str("../../examples/" + .file)' sample.yml
```

### 23.3 递归加载所有 file 字段

```bash
yq '(.. | select(has("file"))) |= load("../../examples/" + .file)' sample.yml
```

### 23.4 加载其他格式

```bash
yq '.more_stuff = load_xml("../../examples/small.xml")' sample.yml
yq '.more_stuff = load_props("../../examples/small.properties")' sample.yml
yq '.more_stuff = load_base64("../../examples/base64.txt")' sample.yml
```

### 23.5 安全禁用文件操作

```bash
yq --security-disable-file-ops --null-input 'load("file.yml")'
# Error: file operations have been disabled
```

---

## 24. 编码与解码

### 24.1 编码/解码对照表

| 格式 | 解码 | 编码 |
|------|------|------|
| YAML | `from_yaml` / `@yamld` | `to_yaml(i)` / `@yaml` |
| JSON | `from_json` / `@jsond` | `to_json(i)` / `@json` |
| Properties | `from_props` / `@propsd` | `to_props` / `@props` |
| CSV | `from_csv` / `@csvd` | `to_csv` / `@csv` |
| TSV | `from_tsv` / `@tsvd` | `to_tsv` / `@tsv` |
| XML | `from_xml` / `@xmld` | `to_xml(i)` / `@xml` |
| Base64 | `@base64d` | `@base64` |
| URI | `@urid` | `@uri` |
| Shell | - | `@sh` |

### 24.2 JSON 编码

```bash
yq '.b = (.a | to_json)' sample.yml
yq '.b = (.a | to_json(0))' sample.yml   # 单行
yq '.b = (.a | @json)' sample.yml
```

### 24.3 JSON 解码

```bash
yq '.a | from_json | ... style=""' sample.yml
yq '.json_field | from_json | .nested.key' sample.yml
```

### 24.4 Properties 编码/解码

```bash
yq '.b = (.a | @props)' sample.yml
yq '.a |= @propsd' sample.yml
```

### 24.5 CSV/TSV 编码/解码

```bash
yq '@csv' sample.yml
yq '@tsv' sample.yml
yq '.a |= @csvd' sample.yml
```

### 24.6 XML 编码/解码

```bash
yq '.a | to_xml' sample.yml
yq '.a | @xml' sample.yml
yq '.b = (.a | from_xml)' sample.yml
```

### 24.7 Base64 编码/解码

```bash
yq '.coolData | @base64' sample.yml
yq '.coolData | @base64d' sample.yml
yq '@yaml | @base64' sample.yml
yq '.coolData |= (@base64d | from_yaml)' sample.yml
```

### 24.8 URI 编码/解码

```bash
yq '.coolData | @uri' sample.yml
yq '@urid' sample.yml
```

### 24.9 Shell 编码

```bash
yq '.coolData | @sh' sample.yml
```

---

## 25. 多文档处理

### 25.1 读取多文档

```bash
yq '.' multi-doc.yaml
# 输出所有文档，用 --- 分隔
```

### 25.2 合并多文档文件

```bash
yq '.' somewhere/*.yaml
```

### 25.3 选择特定文档

```bash
yq 'select(documentIndex == 0)' multi-doc.yaml
yq 'select(di == 0)' multi-doc.yaml

yq 'select(fileIndex == 0)' file1.yaml file2.yaml
yq 'select(fi == 0)' file1.yaml file2.yaml
```

### 25.4 更新特定文档

```bash
yq -i '(select(di == 1) | .each) += "cool"' multi-doc.json
yq -i '.version = "2.0"' multi-doc.yaml
```

### 25.5 拆分文档

```bash
yq '.[] | split_doc' sample.yml
```

### 25.6 多文档统计

```bash
yq '[.] | length' multi-doc.yaml
```

---

## 26. 格式转换

### 26.1 YAML ↔ JSON

```bash
yq -Poy sample.json                    # JSON -> YAML
yq -o json file.yaml                   # YAML -> JSON
yq -o json -I=0 file.yaml              # 单行 JSON
```

### 26.2 YAML ↔ XML

```bash
yq -p xml file.xml
yq -o xml file.yaml
```

### 26.3 YAML ↔ Properties

```bash
yq -o props file.yaml
yq -p props file.properties
```

### 26.4 YAML ↔ CSV/TSV

```bash
yq -o csv file.yaml
yq -p csv -P file.csv
```

### 26.5 YAML ↔ TOML

```bash
yq -o toml file.yaml
yq -p toml file.toml
```

### 26.6 YAML ↔ HCL (Terraform)

```bash
yq -o hcl file.yaml
yq -p hcl file.hcl
```

### 26.7 YAML ↔ INI

```bash
yq -o ini file.yaml
yq -p ini file.ini
```

### 26.8 YAML ↔ Base64

```bash
yq -o base64 file.yaml
yq -p base64 file.b64
```

### 26.9 自动检测格式

```bash
cat file.xml | yq -p xml '.'
yq -o json '.' file.yaml
```

---

## 27. Reduce 与函数式操作

### 27.1 语法

```
<表达式> as $<name> ireduce (<初始值>; <累积表达式>)
```

### 27.2 数组求和

```bash
yq '.[] as $item ireduce (0; . + $item)' sample.yml
```

### 27.3 合并所有文件（ireduce 核心场景）

```bash
yq ea '. as $item ireduce ({}; . * $item)' mixin1.yaml mixin2.yaml mixin3.yaml
```

### 27.4 深度合并

```bash
yq ea '. as $item ireduce ({}; . *d $item)' base.yaml patch.yaml
```

### 27.5 数组转对象

```bash
yq '.[] as $item ireduce ({}; .[$item | .name] = ($item | .has) )' sample.yml
```

### 27.6 分组统计

```bash
yq '.[] as $item ireduce ({}; .[$item.category] += $item.value)' sample.yml
```

### 27.7 合并 + 清理（完整流程）

```bash
yq -Mi ea '
  . as $item ireduce ({}; . * $item) |
  ... comments="" |
  explode(.)
' base.yaml extra.yaml > merged.yaml
```

---

## 28. With 与 Entries 操作

### 28.1 With 操作

```bash
yq 'with(.a.deeply.nested; . = "newValue" | . style="single")' sample.yml
```

### 28.2 同时更新多个属性

```bash
yq 'with(.a.deeply; .nested = "newValue" | .other = "newThing")' sample.yml
```

### 28.3 相对更新数组元素

```bash
yq 'with(.myArray[]; .b = .a + " yum")' sample.yml
```

### 28.4 Entries 操作

```bash
yq 'to_entries' sample.yml           # 映射转 entries
yq 'to_entries | from_entries' sample.yml   # entries 转映射
yq 'with_entries(.key |= "KEY_" + .)' sample.yml
```

### 28.5 with_entries 动态键名处理

```bash
yq '
  .providers |= with_entries(
    .key as $k |
    .value.path = ((.value.path | select(. != "")) // ("./provider/" + $k))
  )
' sample.yml
```

### 28.6 过滤特定键

```bash
yq '.providers |= with_entries(select(.key | startswith("custom_")))' sample.yml
yq '.providers |= with_entries(select(.key != "deprecated"))' sample.yml
```

### 28.7 批量修改键名格式

```bash
yq '. |= with_entries(.key |= sub("-", "_"))' sample.yml
yq '.providers |= with_entries(.key |= upcase)' sample.yml
```

---

## 29. 数组映射 map

`map` 用于对数组的每个元素应用表达式。

### 29.1 基础用法

```bash
yq '.proxies |= map(.udp = true)' sample.yml
yq '.proxies |= map(.port = 443)' sample.yml
```

### 29.2 条件映射（核心模式）

```bash
# 核心模式：((select(条件) | .field = 新值) // .)

export URL="http://test.com"
export INTERVAL="300"

yq -i '
  (strenv(URL)      // "") as $u |
  (strenv(INTERVAL) // "") as $i |
  (.proxy-groups // []) |= map(
    ((select($u != "") | .url = $u) // .) |
    ((select($i != "" and .type == "url-test") | .interval = ($i | tonumber)) // .)
  )
' config.yaml
```

### 29.3 过滤 + 映射组合

```bash
yq '.proxies |= map(
  (select(.type == "ss" and (.plugin | length == 0)) | .plugin = "obfs") // .
)' config.yaml
```

### 29.4 嵌套映射

```bash
yq '
  .proxy-groups |= map(
    .proxies |= map(
      (select(. == "DIRECT") | "🎯 DIRECT") // .
    )
  )
' config.yaml
```

---

## 30. 拆分为文档

### 30.1 数组拆分为多文档

```bash
yq '.[] | split_doc' sample.yml
```

### 30.2 按条件拆分

```bash
yq '.users[] | select(.active) | split_doc' users.yml > active.yml
yq '.users[] | select(.active | not) | split_doc' users.yml > inactive.yml
```

---

## 31. 加法与数值运算

### 31.1 数字相加

```bash
yq '.a + .b' sample.yml
```

### 31.2 字符串拼接

```bash
yq '.a + .b' sample.yml
```

### 31.3 数组合并

```bash
yq '.a + .b' sample.yml
```

### 31.4 日期加法

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST", .a += "3h1m")' sample.yml
```

### 31.5 null 加法

```bash
yq --null-input 'null + "cat"'    # cat
```

### 31.6 数值运算

```bash
yq '.a + .b' sample.yml      # 加法
yq '.a - .b' sample.yml      # 减法
yq '.a * .b' sample.yml      # 乘法
yq '.a / .b' sample.yml      # 除法
yq '.a % .b' sample.yml      # 取模
yq '.a | pow(.; 2)' sample.yml  # 幂运算
yq '.a | sqrt' sample.yml    # 平方根
```

### 31.7 字符串转数字 tonumber

```bash
export INTERVAL="300"

yq -i '
  (strenv(INTERVAL) | tonumber) as $i |
  .interval = $i
' config.yaml
```

### 31.8 布尔转换

```bash
export ENABLE_UDP="true"

yq -i '
  (strenv(ENABLE_UDP) // "") as $e |
  .udp = (select($e != "") | ($e == "true")) // .
' config.yaml
```

### 31.9 数组追加（+=）

```bash
yq '.a += .b' sample.yml
```

### 31.10 相对追加到数组元素

```bash
yq '.a[].b += ["mouse"]' sample.yml
```

### 31.11 字符串追加

```bash
yq '.a += .b' sample.yml
```

### 31.12 对象浅合并（+=）

```bash
yq '.a += .b' sample.yml
```

### 31.13 除法运算

```bash
yq '.a = .a / .b' sample.yml      # 数字除法（结果总是 float）
yq '.c = .a / .b' sample.yml      # 字符串分割
```

### 31.14 取模运算

```bash
yq '.a = .a % .b' sample.yml    # 整数取模
yq '.a = .a % .b' sample.yml    # 浮点取模
```

### 31.15 减法运算

```bash
yq --null-input '[1,2] - [2,3]'   # [1]
yq '.a = .a - .b' sample.yml
yq '.a -= "3h10m"' sample.yml
yq '.[] -= 1' sample.yml
```

---

## 32. 节点元信息

### 32.1 `line` — 获取行号

返回匹配节点的起始行号（从 1 开始），无行号数据时返回 0。

```bash
yq '.b | line' sample.yml        # 3
yq '.b | key | line' sample.yml  # 2
```

### 32.2 `column` — 获取列号

返回匹配节点的起始列号（从 1 开始），无列号数据时返回 0。

```bash
yq '.b | column' sample.yml      # 4
yq '.b | key | column' sample.yml  # 1
```

### 32.3 `is_key` — 判断是否为键节点

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "lc": lineComment}]' sample.yml
```

### 32.4 `filename` — 获取文件名

```bash
yq 'filename' sample.yml
yq eval-all 'filename' file1.yml file2.yml
```

### 32.5 `file_index` / `fi` — 获取文件索引

```bash
yq 'file_index' sample.yml
yq eval-all 'fi' file1.yml file2.yml
```

---

## 33. 动态求值与系统函数

### 33.1 `eval` — 动态执行表达式

```bash
yq 'eval(.pathExp)' sample.yml
pathEnv=".a.b[0].name" valueEnv="moo"   yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
```

### 33.2 `error(msg)` — 抛出错误

```bash
yq 'select(.a == "howdy") or error(".a [" + .a + "] is not howdy!")' sample.yml
```

### 33.3 `builtins` — 列出所有内置函数

```bash
yq 'builtins' --null-input
```

### 33.4 `debug` — 调试输出

```bash
yq '.items[] | debug | .name' sample.yml
```

### 33.5 `system(cmd; args)` — 执行外部命令

> ⚠️ 需要显式启用 `--security-enable-system-operator`

```bash
yq --security-enable-system-operator '.result = system("date"; "+%Y-%m-%d")' sample.yml
```

---

## 34. 内置函数速查表

### A

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `add` / `+` | 加法/拼接/数组合并/对象浅合并 | `.a + .b` |
| `all` | 数组所有元素为 true | `all` |
| `all_c(exp)` | 条件 all | `all_c(. > 0)` |
| `alternative` / `//` | 默认值（null 时回退） | `.a // "default"` |
| `anchor` | 获取/设置锚点 | `.a | anchor` |
| `any` | 数组任一元素为 true | `any` |
| `any_c(exp)` | 条件 any | `any_c(. > 0)` |
| `array_to_map` | 数组转映射（索引为键） | `array_to_map` |
| `as` | 变量绑定 | `.a as $x` |
| `assign` / `=` | 绝对赋值 | `.a = "val"` |
| `atan2(y; x)` | 双参数反正切 | `atan2(.y; .x)` |

### B

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `base64` / `@base64` | Base64 编码 | `.a | @base64` |
| `base64d` / `@base64d` | Base64 解码 | `.a | @base64d` |
| `builtins` | 列出内置函数 | `builtins` |

### C

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `capture(regex)` | 命名捕获组 | `capture("(?P<a>\w+)")` |
| `collect` / `[]` | 收集到数组 | `[.a, .b]` |
| `column` | 获取节点列号 | `.a | column` |
| `comment` | 注释操作 | `line_comment`, `head_comment`, `foot_comment` |
| `compare` | 比较运算 | `>`, `>=`, `<`, `<=` |
| `contains` | 包含检查 | `contains("sub")` |
| `csv` / `@csv` | CSV 编码 | `@csv` |
| `csvd` / `@csvd` | CSV 解码 | `@csvd` |

### D

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `debug` | 调试输出 | `debug` |
| `del` | 删除节点 | `del(.a)` |
| `di` / `document_index` | 文档索引 | `select(di == 0)` |
| `divide` / `/` | 除法/字符串分割 | `.a / .b` |
| `downcase` | 转小写（Unicode） | `downcase` |

### E

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `env(NAME)` | 读取环境变量（自动类型） | `env(MYVAR)` |
| `entries` | entries 转换 | `to_entries`, `from_entries` |
| `equals` / `==` | 相等比较 | `.a == .b` |
| `error(msg)` | 抛出错误 | `error("msg")` |
| `eval` | 动态求值 | `eval(".a.b")` |
| `eval-all` / `ea` | 加载所有文档后求值 | `yq ea '.' *.yaml` |
| `explode` | 展开别名 | `explode(.)` |

### F

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `fi` / `file_index` | 文件索引 | `select(fi == 0)` |
| `filter` | 过滤数组/映射值 | `filter(. > 3)` |
| `first` | 返回第一个匹配元素 | `first(.a == "cat")` |
| `flatten` | 递归扁平化数组 | `flatten`, `flatten(1)` |
| `floor` | 向下取整 | `floor` |
| `format_datetime` | 格式化日期时间 | `format_datetime("2006-01-02")` |
| `from_entries` | entries 转映射 | `from_entries` |
| `from_json` / `@jsond` | JSON 解码 | `from_json` |
| `from_props` / `@propsd` | Properties 解码 | `from_props` |
| `from_unix` | Unix 时间戳转日期 | `from_unix` |
| `from_xml` / `@xmld` | XML 解码 | `from_xml` |
| `from_yaml` / `@yamld` | YAML 解码 | `from_yaml` |

### G

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `getpath` | 按路径获取 | `getpath(["a","b"])` |
| `group_by` | 按表达式分组 | `group_by(.category)` |
| `gsub` | 全局替换 | `gsub("a", "b")` |

### H

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `has` | 检查键是否存在 | `has("key")` |
| `head_comment` | 头部注释 | `. head_comment="note"` |

### I

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `ireduce` | 迭代 reduce | `.[] as $i ireduce (0; . + $i)` |

### J

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `join` | 连接数组元素 | `join(", ")` |
| `json` / `@json` | JSON 编码 | `@json` |

### K

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `key` | 获取键名/索引 | `.a | key` |
| `keys` | 获取所有键 | `keys` |
| `kind` | 获取节点基本类型 | `kind` |

### L

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `length` | 长度 | `length` |
| `limit` | 限制数量 | `limit(3; .[])` |
| `line` | 获取节点行号 | `.a | line` |
| `line_comment` | 行尾注释 | `line_comment="note"` |
| `load` | 加载 YAML 文件 | `load("file.yml")` |
| `load_str` | 加载文件为字符串 | `load_str("file.txt")` |
| `load_xml` | 加载 XML 文件 | `load_xml("file.xml")` |
| `load_props` | 加载 Properties | `load_props("file.props")` |
| `load_base64` | 加载 Base64 文件 | `load_base64("file.b64")` |
| `log` | 自然对数 | `log` |
| `log10` | 常用对数 | `log10` |

### M

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `map` | 数组映射 | `map(. + 1)` |
| `map_values` | 映射值操作 | `map_values(. + 1)` |
| `match` | 正则匹配 | `match("foo"; "g")` |
| `max` | 最大值 | `max` |
| `max_by` | 按表达式取最大 | `max_by(.age)` |
| `min` | 最小值 | `min` |
| `min_by` | 按表达式取最小 | `min_by(.age)` |
| `modulo` / `%` | 取模 | `.a % .b` |
| `multiply` / `*` | 乘法/深度合并 | `.a * .b` |

### N

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `not` | 逻辑非 | `not` |
| `now` | 当前时间 | `now` |
| `null` | null 值 | `null` |
| `numbers` | 类型过滤器：数字 | `.. | numbers` |

### O

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `omit` | 排除指定键/索引 | `omit(["a","b"])` |
| `or` | 逻辑或 | `.a or .b` |

### P

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `parent` | 获取父节点 | `parent` |
| `parents` | 获取所有祖先 | `parents` |
| `path` | 获取路径 | `path` |
| `pick` | 选择指定键/索引 | `pick(["a","b"])` |
| `pivot` | 矩阵转置 | `pivot` |
| `pow` | 幂运算 | `pow(.; 2)` |
| `props` / `@props` | Properties 编码 | `@props` |

### R

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `range` | 生成序列 | `[range(5)]` |
| `recurse` / `..` | 递归下降 | `..` |
| `reduce` | reduce 操作 | `reduce .[] as $i (0; . + $i)` |
| `ref` | 路径引用 | `.a ref $x` |
| `reverse` | 反转数组 | `reverse` |
| `root` | 获取根节点 | `root` |
| `round` | 四舍五入 | `round` |

### S

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `scalars` | 类型过滤器：标量 | `.. | scalars` |
| `select` | 条件过滤 | `select(.a > 1)` |
| `setpath` | 按路径设置 | `setpath(["a","b"]; "val")` |
| `sh` / `@sh` | Shell 编码 | `@sh` |
| `shuffle` | 随机打乱数组 | `shuffle` |
| `sort` | 排序 | `sort` |
| `sort_by` | 按表达式排序 | `sort_by(.name)` |
| `sort_keys` | 按键排序映射 | `sort_keys(.)` |
| `split` | 字符串分割 | `split(";")` |
| `split_doc` | 拆分为文档 | `.[] | split_doc` |
| `sqrt` | 平方根 | `sqrt` |
| `strenv(NAME)` | 读取环境变量（字符串） | `strenv(MYVAR)` |
| `strings` | 类型过滤器：字符串 | `.. | strings` |
| `style` | 样式控制 | `style="double"` |
| `sub` | 正则替换 | `sub("old", "new")` |
| `subtract` / `-` | 减法/数组差集 | `.a - .b` |
| `system` | 执行外部命令 | `system("cmd"; "arg")` |

### T

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `tag` | 获取/设置标签 | `tag` |
| `test` | 正则测试 | `test("^foo")` |
| `to_entries` | 映射转 entries | `to_entries` |
| `to_json` | JSON 编码 | `to_json` |
| `to_number` / `tonumber` | 转数字 | `tonumber` |
| `to_props` | Properties 编码 | `to_props` |
| `to_string` | 转字符串 | `to_string` |
| `to_unix` | 日期转时间戳 | `to_unix` |
| `to_xml` | XML 编码 | `to_xml` |
| `to_yaml` | YAML 编码 | `to_yaml` |
| `trim` | 修剪空白 | `trim` |
| `tsv` / `@tsv` | TSV 编码 | `@tsv` |
| `tsvd` / `@tsvd` | TSV 解码 | `@tsvd` |
| `tz` | 时区转换 | `tz("Asia/Shanghai")` |

### U

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `unique` | 去重 | `unique` |
| `unique_by` | 按表达式去重 | `unique_by(.name)` |
| `union` / `,` | 联合多个结果 | `.a, .b` |
| `upcase` | 转大写（Unicode） | `upcase` |
| `uri` / `@uri` | URI 编码 | `@uri` |
| `urid` / `@urid` | URI 解码 | `@urid` |

### W

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `with` | 上下文操作 | `with(.a; . = "val")` |
| `with_dtf` | 指定日期格式 | `with_dtf("format"; .)` |
| `with_entries` | entries 批量操作 | `with_entries(.key | upcase)` |

### X

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `xml` / `@xml` | XML 编码 | `@xml` |
| `xmld` / `@xmld` | XML 解码 | `@xmld` |

### Y

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `yaml` / `@yaml` | YAML 编码 | `@yaml` |
| `yamld` / `@yamld` | YAML 解码 | `@yamld` |

---

## 35. 常见陷阱与故障排除

### 35.1 引号地狱（Shell 转义）

```bash
# 错误：Shell 会解析内部引号
yq '.message = "He said "hello""' file.yaml

# 解决方案 1：使用单引号包裹，双引号在内部
yq '.message = "He said \"hello\""' file.yaml

# 解决方案 2：使用环境变量
MESSAGE='He said "hello"' yq -i '.message = strenv(MESSAGE)' file.yaml

# 解决方案 3：从文件读取表达式
yq --from-file expression.yq file.yaml
```

### 35.2 注释和空白丢失

```bash
# yq 基于 go-yaml v3，会尽力保留注释，但以下场景可能丢失：
# 1. 删除节点后，依附于该节点的注释可能消失
# 2. 大幅重构文档结构时，注释位置可能偏移
# 3. 使用 sort 或 unique 后，注释通常不保留

cp important.yaml important.yaml.bak
yq -i '.version = "2.0"' important.yaml
```

### 35.3 布尔值解析差异

```bash
# YAML 1.1（旧标准）：yes/no/on/off/TRUE/FALSE 都是布尔值
# YAML 1.2（yq 使用）：只有 true/false 是布尔值

yq --null-input '.a = yes'   # Error: unknown name "yes"
yq --null-input '.a = true'  # a: true
yq --null-input '.a = "yes"'  # a: "yes"
```

### 35.4 Merge 锚点行为

```bash
# 默认行为
yq '.derived' sample.yml
# 输出: {a: 1, b: 3}

# 如果需要符合 YAML 规范的合并行为
yq --yaml-fix-merge-anchor-to-spec '.derived' sample.yml
```

### 35.5 数字被解析为科学计数法

```bash
# 大数字可能被错误解析
yq '.big_number tag = "!!str"' file.yaml
```

### 35.6 空值与 null 的区别

```bash
yq --null-input '.a = null'    # a: null（真正的 null）
yq --null-input '.a = "null"'  # a: "null"（字符串）
yq --null-input '.a = ~'      # a: null（YAML 的 null 别名）
```

### 35.7 数组索引越界

```bash
yq '.[100]' sample.yml  # null（不会报错）
yq '.nonexistent[0]' sample.yml  # Error
yq '.nonexistent?[0]?' sample.yml  # null
```

### 35.8 原地更新文件权限

```bash
chmod +w file.yaml
yq -i '.version = "2.0"' file.yaml
```

---

## 36. 附录：速查表

### A. 读取值

```bash
yq '.key' file.yaml
yq '.nested.key' file.yaml
yq '.array[0]' file.yaml
yq '.array[].field' file.yaml
yq '.["key-with-dots"]' file.yaml
yq '.["key with spaces"]' file.yaml
yq '.[.dynamic_key]' file.yaml
yq '.a?.b?.c?' file.yaml
yq '.a.b.c | parent' file.yaml
yq '.a.b.c | path' file.yaml
yq 'getpath(["a","b"])' file.yaml
```

### B. 更新值

```bash
yq -i '.key = "value"' file.yaml
yq -i '.nested.key |= . + 1' file.yaml
yq -i '(.array[] | select(.name == "x")).field = "y"' file.yaml
yq -i '(.a, .b, .c) = "same"' file.yaml
yq -i '.new.path.nested = "value"' file.yaml
yq -i 'setpath(["a","b"]; "value")' file.yaml
```

### C. 删除

```bash
yq -i 'del(.key)' file.yaml
yq -i 'del(.array[0])' file.yaml
yq -i 'del(.. | select(. == "bad"))' file.yaml
yq -i 'del(.. | .difficulty?)' file.yaml
yq -i 'del(.[] | select(.active | not))' file.yaml
yq -i 'delpaths([["a","b"]])' file.yaml
```

### D. 转换

```bash
yq -Poy file.json                    # JSON -> YAML
yq -o json file.yaml                 # YAML -> JSON
yq -o xml file.yaml                  # YAML -> XML
yq -P -p xml file.xml                # XML -> YAML
yq -o props file.yaml                # YAML -> Properties
yq -o csv file.yaml                  # YAML -> CSV
yq -o toml file.yaml                 # YAML -> TOML
```

### E. 合并文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yaml
yq ea '. as $item ireduce ({}; . * $item )' *.yaml
yq '. *= load("file2.yml")' file1.yml
yq '. *d load("file2.yml")' file1.yml
```

### F. 环境变量

```bash
yq -i '.value = env(VAR)'                      file.yaml
myenv="cat" yq '.[env(myenv)]'                 file.yaml
NAME=value yq -i '.name = strenv(NAME)'        file.yaml
yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml
```

### G. 条件与过滤

```bash
yq '.[] | select(.active == true)'      file.yaml
yq '.[] | select(test("^[a-z]+$"))'     file.yaml
yq '.[] | select(.name == "*test*")'    file.yaml
yq '[.[] | select(.age > 18)] | length' file.yaml
```

### H. 递归操作

```bash
yq '.. style="double"'                           file.yaml
yq 'del(.. | .secret?)'                          file.yaml
yq '.. | select(has("image")).image'             file.yaml
yq '(.. | select(tag == "!!int")) tag = "!!str"' file.yaml
```

### I. 数组操作

```bash
yq '.[]'                   file.yaml
yq 'pivot'                 file.yaml
yq 'unique'                file.yaml
yq '.[1:5]'                file.yaml
yq 'length'                file.yaml
yq 'flatten'               file.yaml
yq 'shuffle'               file.yaml
yq '.[0, 2, 4]'            file.yaml
yq '[range(5)]'            file.yaml
yq '.[] |= . * 2'          file.yaml
yq 'filter(. > 3)'         file.yaml
yq 'limit(3; .[])'         file.yaml
yq 'sort_by(.name)'        file.yaml
yq 'pick(["a","b"])'       file.yaml
yq 'omit(["a","b"])'       file.yaml
yq 'unique_by(.name)'      file.yaml
yq 'map_values(. + 1)'     file.yaml
yq 'group_by(.category)'   file.yaml
yq 'map(.field = "value")' file.yaml
yq 'first(.name == "cat")' file.yaml
yq 'reverse | unique_by(.name) | reverse' file.yaml
```

### J. 字符串操作

```bash
yq '. | upcase' file.yaml
yq '. | downcase' file.yaml
yq '. | trim' file.yaml
yq '. | sub("old", "new")' file.yaml
yq '. | gsub("a", "b")' file.yaml
yq 'join(", ")' file.yaml
yq 'split(";")' file.yaml
yq 'capture("(?P<a>\w+)-(?P<n>\d+)")' file.yaml
yq 'test("pattern"; "i")' file.yaml
yq '.[0:5]' file.yaml
```

### K. 样式与标签

```bash
yq '.a style="double"' file.yaml
yq '.a style="single"' file.yaml
yq '.a style="literal"' file.yaml
yq '.a tag = "!!str"' file.yaml
yq '.. | tag' file.yaml
yq '.. | kind' file.yaml
```

### L. 注释

```bash
yq '.a line_comment="note"' file.yaml
yq '. head_comment="header"' file.yaml
yq '. foot_comment="footer"' file.yaml
yq '... comments=""' file.yaml
```

### M. 锚点与别名

```bash
yq '.a | anchor' file.yaml
yq '.a | alias' file.yaml
yq 'explode(.)' file.yaml
yq '.a anchor = "new"' file.yaml
```

### N. 变量与 Reduce

```bash
yq '.a as $x | .b = $x' file.yaml
yq '.[] as $item ireduce (0; . + $item)' file.yaml
yq 'with_entries(.key |= "prefix_" + .)' file.yaml
```

### O. 安全条件更新

```bash
# 核心模式
((select(条件) | .field = 新值) // .)

# 示例
yq '.proxies |= map(
  ((select(.type == "ss") | .plugin = "obfs") // .)
)' file.yaml
```

### P. 数值运算

```bash
yq '.a + .b' file.yaml
yq '.a - .b' file.yaml
yq '.a * .b' file.yaml
yq '.a / .b' file.yaml
yq '.a % .b' file.yaml
yq '.a | pow(.; 2)' file.yaml
yq '.a | sqrt' file.yaml
yq '.a | min' file.yaml
yq '.a | max' file.yaml
yq 'min_by(.age)' file.yaml
yq 'max_by(.age)' file.yaml
yq '.a | round' file.yaml
yq '.a | floor' file.yaml
yq '.a | ceil' file.yaml
yq '.a += 1' file.yaml
yq '.a -= 1' file.yaml
```

### Q. 日期时间

```bash
yq --null-input 'now'
yq 'now | format_datetime("2006-01-02")' file.yaml
yq '1675301929 | from_unix' file.yaml
yq 'now | to_unix' file.yaml
yq 'now | tz("Asia/Shanghai")' file.yaml
```

### R. 比较与默认值

```bash
yq '.a == .b' file.yaml
yq '.a != .b' file.yaml
yq '.a > .b' file.yaml
yq '.a >= .b' file.yaml
yq '.a < .b' file.yaml
yq '.a <= .b' file.yaml
yq '.a // "default"' file.yaml
```

### S. 逻辑运算

```bash
yq '.a and .b' file.yaml
yq '.a or .b' file.yaml
yq '.a | not' file.yaml
yq 'any' file.yaml
yq 'all' file.yaml
```

### T. 文档与文件索引

```bash
yq 'select(di == 0)' file.yaml
yq 'select(fi == 0)' file1.yaml file2.yaml
yq '.[] | split_doc' file.yaml
```

### U. 节点元信息

```bash
yq '.a | line' file.yaml
yq '.a | column' file.yaml
yq '.a | key | line' file.yaml
yq 'is_key' file.yaml
yq 'filename' file.yaml
yq 'fi' file.yaml
yq 'di' file.yaml
```

### V. 动态求值与系统

```bash
yq 'eval(".a.b")' file.yaml
yq 'error("msg")' file.yaml
yq 'builtins' file.yaml
yq 'debug' file.yaml
yq 'system("cmd"; "arg")' file.yaml
```

### W. 类型过滤器

```bash
yq '.. | scalars' file.yaml
yq '.. | arrays' file.yaml
yq '.. | objects' file.yaml
yq '.. | numbers' file.yaml
yq '.. | strings' file.yaml
yq '.. | booleans' file.yaml
yq '.. | iterables' file.yaml
yq '.. | nulls' file.yaml
```

---

> **官方文档**: https://mikefarah.gitbook.io/yq
>
> **GitHub**: https://github.com/mikefarah/yq
