> 基于 [mikefarah/yq](https://mikefarah.gitbook.io/yq) v4.40+ 官方文档整理
>
> yq 是一个轻量级、可移植的命令行 YAML/JSON/XML/INI/Properties/CSV/TSV/TOML/HCL 处理器，使用类似 jq 的表达式语法。
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
34. [内置函数大全](#34-内置函数大全)
35. [完整内置函数速查表](#35-完整内置函数速查表)
36. [与 jq 对比迁移指南](#36-与-jq-对比迁移指南)
37. [性能优化与大数据处理](#37-性能优化与大数据处理)
38. [常见陷阱与故障排除](#38-常见陷阱与故障排除)
39. [附录：速查表](#39-附录速查表)

---

## 1. 基础用法与核心概念

### 1.1 基本模式

```bash
yq [全局选项] [命令] [表达式] [文件...]
```

### 1.2 核心概念

yq 的表达式语法继承自 **jq**，但有以下关键差异：

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

# 从 STDIN 读取（三种等价方式）
cat file.yaml | yq '.a.b[0].c'
yq '.a.b[0].c' < file.yaml
echo 'a: {b: [{c: hello}]}' | yq '.a.b[0].c'

# 原地更新（-i 或 --inplace）
yq -i '.a.b[0].c = "cool"' file.yaml

# 使用环境变量（字符串形式）
NAME=mike yq -i '.a.b[0].c = strenv(NAME)' file.yaml

# 多行表达式（推荐复杂更新时使用）
yq -i '
  .a.b[0].c = "cool" |
  .x.y.z = "foobar" |
  .person.name = strenv(NAME)
' file.yaml

# 查找并更新数组中的特定元素
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml

# 创建新文件（-n 不读取输入）
yq -n '.someNew = "content"' > newfile.yml

# 同时处理多个文件
yq '.' file1.yaml file2.yaml
```

### 1.4 命令说明

| 命令 | 简写 | 说明 |
|------|------|------|
| `eval` | (默认) | 对每个文件的每个文档按顺序应用表达式 |
| `eval-all` | `ea` | 加载所有文件的所有文档，然后一次性运行表达式（用于跨文件操作） |
| `completion` | | 生成 Shell 自动补全脚本 |
| `help` | | 帮助信息 |

**eval vs eval-all 的区别：**

```bash
# eval: 分别处理每个文档
yq '.a' file1.yaml file2.yaml
# 输出 file1 的 .a，然后 file2 的 .a

# eval-all: 所有文档加载到一个数组中
yq eval-all '.[0].a + .[1].b' file1.yaml file2.yaml
# 可以跨文件引用
```

### 1.5 数据类型速览

yq 中所有值都是带标签的 YAML 节点，理解类型是正确使用操作符的前提：

| YAML 表示 | yq tag | kind | 示例 |
|-----------|--------|------|------|
| `hello` | `!!str` | scalar | 字符串 |
| `42` | `!!int` | scalar | 整数 |
| `3.14` | `!!float` | scalar | 浮点数 |
| `true` / `false` | `!!bool` | scalar | 布尔值（YAML 1.2 仅识别 `true`/`false`） |
| `~` / `null` | `!!null` | scalar | 空值 |
| `[1, 2]` | `!!seq` | seq | 序列/数组 |
| `{a: 1}` | `!!map` | map | 映射/对象 |

> ⚠️ **重要**：YAML 1.2 标准中，`yes`/`no`/`on`/`off` 不再被识别为布尔值，而是字符串。yq 遵循 YAML 1.2。

---

## 2. 命令行参数详解

### 2.1 输入输出控制

| 参数 | 简写 | 说明 | 典型场景 |
|------|------|------|----------|
| `--inplace` | `-i` | 原地更新文件 | 配置文件修改 |
| `--null-input` | `-n` | 不读取输入，仅评估表达式 | 创建新 YAML |
| `--input-format` | `-p` | 输入格式 | 处理无扩展名文件 |
| `--output-format` | `-o` | 输出格式 | 格式转换 |
| `--prettyPrint` | `-P` | 美化打印 | 规范化输出 |
| `--indent` | `-I` | 缩进级别（默认 2） | 团队规范 |
| `--no-doc` | `-N` | 不打印文档分隔符 `---` | 单文档输出 |
| `--unwrapScalar` | `-r` | 解包标量，纯文本输出 | 脚本提取值 |
| `--exit-status` | `-e` | 无匹配时返回非零退出码 | CI 验证 |
| `--from-file` | | 从文件加载表达式 | 复杂表达式复用 |
| `--front-matter` | `-f` | 提取/处理 YAML 前置内容 | Jekyll/Markdown |
| `--split-exp` | `-s` | 将每个结果输出到单独文件 | 文档拆分 |

### 2.2 输入格式支持（`-p`）

```
auto, yaml, json, xml, props, csv, tsv, toml, hcl, ini
```

```bash
# 从 JSON 文件读取，输出 YAML
yq -p json -P file.json

# 从 XML 读取
yq -p xml file.xml

# 处理无扩展名的管道数据
curl -s http://api.example.com/data | yq -p json '.items[0].name'
```

### 2.3 输出格式支持（`-o`）

```bash
# YAML 转 JSON（单行）
yq -o json -I=0 file.yaml

# YAML 转 Properties（Spring Boot 配置）
yq -o props application.yaml

# YAML 转 XML
yq -o xml config.yaml

# YAML 转 TOML
yq -o toml config.yaml

# YAML 转 CSV（数组数据）
yq -o csv data.yaml
```

### 2.4 颜色控制

```bash
yq -C '.a' file.yaml      # 强制彩色（即使管道）
yq -M '.a' file.yaml      # 强制无颜色（适合重定向）
```

### 2.5 安全参数

| 参数 | 说明 |
|------|------|
| `--security-disable-env-ops` | 禁用 `env()`, `strenv()`, `envsubst` |
| `--security-disable-file-ops` | 禁用 `load`, `load_str` 等文件操作 |
| `--security-enable-system-operator` | 启用 `system()` 外部命令操作 |

**在不可信输入环境中使用：**

```bash
# 如果处理用户提供的 YAML，禁用文件/环境操作防止信息泄露
yq --security-disable-file-ops --security-disable-env-ops '.' untrusted.yaml
```

### 2.6 XML 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--xml-attribute-prefix` | `+@` | XML 属性前缀 |
| `--xml-content-name` | `+content` | 文本内容键名 |
| `--xml-directive-name` | `+directive` | 指令键名 |
| `--xml-keep-namespace` | `true` | 保留 XML 命名空间 |
| `--xml-strict-mode` | | 启用严格解析 |

```bash
# XML 转 YAML 示例
yq -p xml -P '
  .root.item[] |
  {"name": .["+@name"], "value": .["+content"]}
' data.xml
```

### 2.7 CSV/TSV 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--csv-separator` | `,` | CSV 分隔符 |
| `--csv-auto-parse` | `true` | 自动解析嵌套 YAML/JSON 值 |

```bash
# 使用分号分隔的 CSV
yq -p csv --csv-separator=";" '.[0].name' data.csv
```

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

# 查看节点基本类型（不受自定义标签影响）
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

yq 表达式中可以直接使用以下字面量：

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

当路径可能不存在时，使用 `?` 避免报错，安全返回 `null`：

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

`,` 用于组合多个结果为一个输出流：

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

`|` 将左侧结果作为右侧的输入上下文：

```bash
yq '.a | .b' sample.yml      # 先取 .a，再取 .a 结果中的 .b
yq '.a.b' sample.yml         # 等价写法
```

### 4.7 括号分组 `()`

括号用于控制运算优先级，**在更新操作中尤为重要**：

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

`//` 在左侧值为 **null** 或 **false** 时返回右侧值，常用于设置默认值：

```bash
# 基本用法
yq '.name // "unknown"' sample.yml

# 链式默认值
yq '.a.b.c // .fallback // "none"' sample.yml

# 与 select 配合过滤空值
yq '.items[] | select(.name // "")' sample.yml

# 环境变量默认值模式
yq -i '.host = strenv(HOST) // "localhost"' config.yaml
```

> **注意**：`//` 与 Shell 注释冲突时，需用引号包裹表达式或在脚本文件中使用。

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

`as` 将值绑定到变量，供后续表达式复用：

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
# 读取对象
yq '.a' sample.yml        # 输出: b: apple\nc:\n  d: deep_value

# 读取嵌套值
yq '.a.b' sample.yml      # 输出: apple

# 深层嵌套
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
# 展开数组每个元素
yq '.[]' sample.yml
# 输出:
# b: apple
# c: banana
# d: cherry

# 展开映射的所有值
yq '.a[]' sample.yml      # 如果 a 是对象，输出所有值

# 递归展开所有值
yq '.. | select(scalar)' sample.yml
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
# 空格或特殊字符键名 - 使用方括号
yq '.["red rabbit"]' sample.yml       # 输出: frog

# 带点键名
yq '.a["key.withdots"]["another.key"]' sample.yml   # 输出: apple

# 带横线键名
yq '.a["key-with-dashes"]' sample.yml  # 输出: value
```

### 5.5 动态键访问（间接引用）

```yaml
# sample.yml
b: apple
apple: crispy yum
banana: soft yum
```

```bash
# 用 .b 的值 "apple" 作为键去查找
yq '.[.b]' sample.yml     # 输出: crispy yum

# 更复杂的动态路径
yq '.[.config.key]' sample.yml
```

### 5.6 可选访问（避免 null 报错）

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
# 不加 ? 会报错，因为根是数组不是对象
yq '.a' sample.yml        # Error: Cannot index array with string "a"

# 使用可选访问符
yq '.a?' sample.yml       # 输出: null（安全返回）

# 深层可选访问
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
# 匹配包含 "a" 的键
yq '.a."*a*"' sample.yml  # 输出 apple 和 things

# 匹配以 "c" 开头的键
yq '.a."c*"' sample.yml   # 输出: apple

# 匹配以 "g" 结尾的键
yq '.a."*g"' sample.yml   # 输出: banana
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
# 读取别名（显示引用）
yq '.b' sample.yml        # 输出: *cat

# 展开别名读取值
yq '.b[]' sample.yml      # 输出: frog, meow（展开后迭代）

# 穿透别名访问属性
yq '.b.c' sample.yml      # 输出: frog（自动解引用）

# 完全展开（explode）
yq 'explode(.b)' sample.yml  # 输出: c: frog\nd: meow
```

### 5.9 Merge 锚点（YAML 继承）

```yaml
# sample.yml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobar:
  c: foobar_c
  !!merge <<: *foo
  thing: foobar_thing
```

```bash
# 合并后的值
yq '.foobar.a' sample.yml     # 输出: foo_a（从 foo 合并）
yq '.foobar.thing' sample.yml # 输出: foobar_thing（本地覆盖优先）
yq '.foobar.c' sample.yml     # 输出: foobar_c（本地值优先）

# 使用规范合并行为
yq --yaml-fix-merge-anchor-to-spec '.foobar' sample.yml
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
yq '.a[0, 2]' sample.yml   # 输出: a 和 c
```

### 5.11 数字键映射

```yaml
# sample.yml
2: cat
```

```bash
yq '.[2]' sample.yml   # 输出: cat（映射的数字键）
```

### 5.12 parent / parents / root

获取当前节点的父节点、所有祖先节点或根节点。

```yaml
# sample.yml
a:
  b:
    c: hello
```

```bash
# 获取父节点
yq '.a.b.c | parent' sample.yml
# 输出:
# c: hello

# 获取所有祖先节点（从近到远）
yq '.a.b.c | parents' sample.yml
# 输出:
# - c: hello
# - b:
#     c: hello
# - a:
#     b:
#       c: hello

# 获取根节点
yq '.a.b.c | root' sample.yml
# 输出:
# a:
#   b:
#     c: hello
```

**实用场景：** 在递归操作中需要知道当前节点的上下文位置。

```bash
# 递归查找并输出带路径的值
yq '.. | select(. == "hello") | {"value": ., "parent": parent | keys}' sample.yml
```

### 5.13 path 与路径操作

`path` 返回当前匹配结果在文档中的路径（以数组形式）。

```yaml
# sample.yml
a:
  b:
    c: hello
```

```bash
# 获取路径数组
yq '.a.b.c | path' sample.yml
# 输出:
# - a
# - b
# - c

# 获取路径并格式化
yq '.a.b.c | path | join(".")' sample.yml
# 输出: a.b.c

# 在递归中收集所有匹配路径
yq '.. | select(. == "hello") | path | join(".")' sample.yml
# 输出: a.b.c
```

### 5.14 getpath / setpath / delpaths

按路径数组精确操作节点。

```yaml
# sample.yml
a:
  b:
    c: hello
    d: world
```

```bash
# getpath - 按路径数组获取值
yq 'getpath(["a","b","c"])' sample.yml
# 输出: hello

# setpath - 按路径数组设置值（自动创建路径）
yq 'setpath(["a","b","e"]; "new")' sample.yml
# 输出:
# a:
#   b:
#     c: hello
#     d: world
#     e: new

# delpaths - 按路径数组删除节点
yq 'delpaths([["a","b","c"]])' sample.yml
# 输出:
# a:
#   b:
#     d: world

# 批量删除多个路径
yq 'delpaths([["a","b","c"],["a","b","d"]])' sample.yml
# 输出:
# a:
#   b: {}
```

**动态路径构建：**

```bash
# 根据变量动态构建路径
yq '.target as $t | getpath([$t])' sample.yml
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
# 结果: a: {b: banana, c: banana} （.a.c 在根上下文是 banana）

# |= : RHS 的 . 指向 .a.b 当前的值
yq '.a.b |= . + " pie"' sample.yml
# 结果: a: {b: apple pie, c: banana} （. 是 apple）
```

### 6.2 基本赋值

```yaml
# sample.yml
a:
  b: apple
```

```bash
yq '.a.b = "frog"' sample.yml
# 输出:
# a:
#   b: frog
```

### 6.3 相对赋值（基于旧值更新）

```yaml
# sample.yml
a: 1
b: thing
```

```bash
# 数字自增
yq '.a |= . + 1' sample.yml      # a: 2

# 字符串追加
yq '.b |= . + "_suffix"' sample.yml  # b: thing_suffix

# 数组追加
yq '.list |= . + ["new"]' sample.yml
```

### 6.4 更新为子节点值

```yaml
# sample.yml
a:
  b:
    g: foof
```

```bash
yq '.a |= .b' sample.yml
# 输出:
# a:
#   g: foof
```

### 6.5 更新为兄弟节点值

```yaml
# sample.yml
a:
  b: child
b: sibling
```

```bash
yq '.a = .b' sample.yml
# 输出:
# a: sibling      # .b 在根上下文是 sibling
# b: sibling
```

### 6.6 多路径同时更新

```yaml
# sample.yml
a: fieldA
b: fieldB
c: fieldC
```

```bash
yq '(.a, .c) = "potato"' sample.yml
# 输出:
# a: potato
# b: fieldB
# c: potato
```

### 6.7 数组元素更新

```yaml
# sample.yml
- candy
- apple
- sandy
```

```bash
# 更新匹配条件的元素
yq '(.[] | select(. == "*andy")) = "bogs"' sample.yml
# 输出:
# - bogs
# - apple
# - bogs

# 所有元素更新
yq '.[] |= . + "_updated"' sample.yml
```

### 6.8 深层选择更新（重要陷阱！）

```yaml
# sample.yml
a:
  b: apple
  c: cactus
```

```bash
# ✅ 正确：用括号包裹 LHS，更新会反映到原文档
yq '(.a[] | select(. == "apple")) = "frog"' sample.yml
# 输出:
# a:
#   b: frog
#   c: cactus

# ❌ 错误：没有括号，只会返回更新的子集，不修改原文档
yq '.a[] | select(. == "apple") = "frog"' sample.yml
# 输出:
# frog    # 只输出了匹配项，原文档结构丢失！
```

**记忆法则：** 如果更新后需要保留完整文档结构，**整个 LHS 必须用括号包裹**。

### 6.9 数组元素批量运算

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
# 每个元素翻倍
yq '.[] |= . * 2' sample.yml
# 输出: [2, 4, 6]

# 每个元素平方
yq '.[] |= . * .' sample.yml
# 输出: [1, 4, 9]

# 过滤后更新
yq '.[] |= (select(. > 1) | . * 10)' sample.yml
# 输出: [1, 20, 30]
```

### 6.10 从其他文件更新

```yaml
# sample.yml
a: apples

# another.yml
b: bob
c: charlie
```

```bash
# 将 another.yml 的内容赋值给 sample.yml 的 .a
yq eval-all 'select(fileIndex==0).a = select(fileIndex==1) | select(fileIndex==0)' sample.yml another.yml
# 输出:
# a:
#   b: bob
#   c: charlie
```

### 6.11 保留锚点更新

```yaml
# sample.yml
a: &cool cat
b: *cool
```

```bash
# 默认保留锚点
yq '.a = "dog"' sample.yml
# 输出:
# a: &cool dog
# b: *cool

# 删除锚点
yq '.a anchor = ""' sample.yml
```

### 6.12 自定义类型处理

```yaml
# sample.yml
a: !cat meow
b: !dog woof
```

```bash
# 默认保留目标标签
yq '.a = .b' sample.yml
# 输出:
# a: !cat woof    # 保留了 !cat
# b: !dog woof

# 使用 c 标志覆盖自定义标签（copy tag）
yq '.a =c .b' sample.yml
# 输出:
# a: !dog woof    # 标签也被复制
# b: !dog woof
```

### 6.13 空对象自动创建路径

```yaml
# sample.yml
{}
```

```bash
# 自动创建不存在的路径
yq '.a.b |= "bogs"' sample.yml
# 输出:
# a:
#   b: bogs

# 自动创建数组路径
yq '.a.b.[0] |= "bogs"' sample.yml
# 输出:
# a:
#   b:
#     - bogs

# 深层自动创建
yq '.x.y.z[2].name = "test"' sample.yml
```

---

## 7. 条件过滤

### 7.1 基本 Select

```yaml
# sample.yml
- go-kart
- goat
- dog
```

```bash
# 通配符匹配（类似 glob）
yq '.[] | select(. == "go*")' sample.yml
# 输出:
# go-kart
# goat
```

### 7.2 包含匹配

```yaml
# sample.yml
- ago
- go
- meow
- going
```

```bash
yq '.[] | select(. == "*go*")' sample.yml
# 输出:
# ago
# go
# going
```

### 7.3 正则匹配

```yaml
# sample.yml
- this_0
- not_this
- nor_0_this
- thisTo_4
- test_99
```

```bash
# 匹配字母+下划线+数字结尾
yq '.[] | select(test("[a-zA-Z]+_[0-9]$"))' sample.yml
# 输出:
# this_0
# thisTo_4
# test_99

# 忽略大小写
yq '.[] | select(test("THIS"; "i"))' sample.yml

# 不匹配
yq '.[] | select(test("dog") | not)' sample.yml
```

### 7.4 复合条件

```yaml
# sample.yml
- name: foo
  age: 20
  active: true
- name: bar
  age: 30
  active: false
- name: baz
  age: 25
  active: true
```

```bash
# AND 条件
yq '.[] | select(.active == true and .age > 20)' sample.yml

# OR 条件
yq '.[] | select(.name == "foo" or .name == "baz")' sample.yml

# 复杂组合
yq '.[] | select((.active == true) and (.age >= 20 and .age <= 25))' sample.yml
```

### 7.5 数组中查找并更新

```yaml
# data.yaml
- name: foo
  address: old_address
- name: bar
  address: another_address
```

```bash
# 更新匹配项
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml

# 更新多个字段
yq -i '(.[] | select(.name == "foo")) |= (.address = "new" | .updated = true)' data.yaml
```

### 7.6 存在性检查

```yaml
# sample.yml
a:
  b: value
c: null
```

```bash
yq '.a | has("b")' sample.yml      # true
yq '.a | has("z")' sample.yml      # false
yq '. | has("c")' sample.yml       # true（c 存在，即使值为 null）
yq '. | keys' sample.yml           # [a, c]
```

### 7.7 inside 与 in 运算符

`inside` 检查一个值是否被包含在另一个值中（子集关系）。

```bash
# 数组子集检查
yq --null-input '[1,2] | inside([1,2,3])'     # true
yq --null-input '[1,4] | inside([1,2,3])'     # false

# 对象子集检查
yq --null-input '{"a": 1} | inside({"a": 1, "b": 2})'   # true

# 字符串包含
yq --null-input '"cat" | inside("concatenate")'   # true
```

`in` 检查值是否在数组/对象中。

```bash
# 值在数组中
yq --null-input '1 in [1,2,3]'     # true
yq --null-input '4 in [1,2,3]'     # false

# 键在对象中
yq '.a in .' sample.yml   # 检查 "a" 是否是顶层键
```

### 7.8 contains 运算符

`contains` 检查输入是否包含给定的值（与 `inside` 方向相反）。

```bash
# 数组包含
yq --null-input '[1,2,3] | contains([1,2])'     # true

# 对象包含
yq --null-input '{"a": 1, "b": 2} | contains({"a": 1})'   # true

# 字符串包含
yq --null-input '"concatenate" | contains("cat")'   # true
```

---

## 8. 删除操作

### 8.1 删除映射键

```yaml
# sample.yml
a: cat
b: dog
c: bat
```

```bash
yq 'del(.b)' sample.yml
# 输出:
# a: cat
# c: bat
```

### 8.2 删除嵌套键

```yaml
# sample.yml
a:
  a1: fred
  a2: frood
  a3: fred
```

```bash
yq 'del(.a.a1)' sample.yml
# 输出:
# a:
#   a2: frood
#   a3: fred
```

### 8.3 删除数组元素

```yaml
# sample.yml
- 1
- 2
- 3
- 4
```

```bash
yq 'del(.[1])' sample.yml      # 删除索引 1: [1, 3, 4]
yq 'del(.[1, 3])' sample.yml   # 删除多个: [1, 3]
yq 'del(.[1:3])' sample.yml    # 删除范围: [1, 4]
```

### 8.4 删除嵌套数组元素

```yaml
# sample.yml
- a: cat
  b: dog
- a: fish
  b: bird
```

```bash
yq 'del(.[0].a)' sample.yml
# 输出:
# - b: dog
# - a: fish
#   b: bird
```

### 8.5 删除匹配项

```yaml
# sample.yml
a: cat
b: dog
c: bat
d: rat
```

```bash
# 删除值包含 "at" 的键
yq 'del(.[] | select(. == "*at"))' sample.yml
# 输出:
# b: dog
```

### 8.6 递归删除匹配键

```yaml
# sample.yml
a:
  name: frog
  b:
    name: blog
    age: 12
    c:
      name: nested
      value: x
```

```bash
# 递归删除所有 name 字段
yq 'del(.. | select(has("name")).name)' sample.yml
# 输出:
# a:
#   b:
#     age: 12
#     c:
#       value: x
```

### 8.7 安全删除（仅当存在时）

```bash
# 如果 .temp 存在则删除，否则不报错
yq 'del(.temp?)' sample.yml

# 递归删除所有 null 值
yq 'del(.. | select(. == null))' sample.yml
```

---

## 9. 管道与组合

### 9.1 基本管道

```yaml
# sample.yml
a:
  b: cat
```

```bash
# 管道传递
yq '.a | .b' sample.yml     # 输出: cat

# 等价于
yq '.a.b' sample.yml
```

### 9.2 多更新管道

```yaml
# sample.yml
a: cow
b: sheep
c: same
```

```bash
yq '.a = "cat" | .b = "dog"' sample.yml
# 输出:
# a: cat
# b: dog
# c: same
```

### 9.3 复杂管道

```bash
# 读取 -> 过滤 -> 转换 -> 格式化
yq '.items[] | select(.active) | .name | upcase' config.yml

# 构建新对象
yq '.users[] | {"name": .name, "email": .contact.email}' data.yml
```

### 9.4 Union（联合多个结果）

```bash
# 组合多个标量结果
yq --null-input '1, true, "cat"'
# 输出:
# 1
# true
# cat

# 组合多个路径
yq '.a, .c' sample.yml
# 输出:
# fieldA
# fieldC
```

---

## 10. 变量与作用域

`as` 是 yq 中最重要的操作之一，用于将值暂存到变量中，供后续表达式复用。

### 10.1 单值变量

```yaml
# sample.yml
a: cat
```

```bash
yq '.a as $foo | $foo' sample.yml     # 输出: cat

# 变量在后续管道中使用
yq '.a as $animal | .b as $sound | "The \($animal) says \($sound)"' sample.yml
```

### 10.2 多值变量（迭代）

```yaml
# sample.yml
- cat
- dog
```

```bash
yq '.[] as $foo | $foo' sample.yml
# 输出:
# cat
# dog
```

### 10.3 变量作为查找表

```yaml
# sample.yml
"posts":
  - "title": First post
    "author": anon
  - "title": A well-written article
    "author": person1
"realnames":
  "anon": Anonymous Coward
  "person1": Person McPherson
```

```bash
yq '.realnames as $names | .posts[] | {"title":.title, "author": $names[.author]}' sample.yml
# 输出:
# title: First post
# author: Anonymous Coward
# ---
# title: A well-written article
# author: Person McPherson
```

### 10.4 交换值

```yaml
# sample.yml
a: a_value
b: b_value
```

```bash
yq '.a as $x | .b as $y | .b = $x | .a = $y' sample.yml
# 输出:
# a: b_value
# b: a_value
```

### 10.5 引用路径（ref）

```yaml
# sample.yml
a:
  b: thing
  c: something
```

```bash
# ref 获取的是路径引用，可以链式修改
yq '.a.b ref $x | $x = "new" | $x style="double"' sample.yml
# 输出:
# a:
#   b: "new"
#   c: something
```

### 10.6 环境变量绑定（OpenWrt / CI 最常用）

```bash
export DB_HOST="localhost"
export DB_PORT="5432"
export INTERVAL="300"

yq -i '
  (strenv(DB_HOST)  // "") as $h |
  (strenv(DB_PORT)  // "") as $p |
  (strenv(INTERVAL) // "") as $i |
  .database.host = $h |
  .database.port = ($p | tonumber) |
  .interval = ($i | tonumber)
' config.yaml
```

**关键点：**
- `strenv(NAME)` 读取环境变量，始终返回字符串
- `// ""` 提供默认值，防止变量未设置时报错
- `as $var` 绑定后，在后续整个表达式中可用
- `tonumber` 将字符串数字转为真正的数字

### 10.7 在 with_entries 中使用 as

```bash
# 将键名暂存，用于构造新值
yq '
  .providers |= with_entries(
    .key as $k |
    .value.path = "./provider/\($k).yaml"
  )
' config.yaml
```

### 10.8 多变量同时绑定

```bash
# 同时绑定多个环境变量
yq -i '
  (strenv(URL)      // "") as $u |
  (strenv(INTERVAL) // "") as $i |
  (strenv(TIMEOUT)  // "") as $t |
  .proxy-groups |= map(
    ((select($u != "") | .url = $u) // .) |
    ((select($i != "" and .type == "url-test") | .interval = ($i | tonumber)) // .) |
    ((select($t != "" and .type == "url-test") | .timeout = ($t | tonumber)) // .)
  )
' config.yaml
```

### 10.9 变量作用域规则

```bash
# 变量在定义后的整个表达式中可用
yq '.a as $x | .b | .c = $x' sample.yml

# 但在子表达式中重新定义会遮蔽外层
yq '.a as $x | (.b as $x | $x) | $x' sample.yml  # 最后 $x 仍是 .a

# 子表达式中的变量不会泄漏到外层
yq '
  .base as $b |
  (.items | .[0] as $first | $first.name) |
  .copy = $b    # $b 仍可用，$first 不可用
' sample.yml
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
# 字符串
myenv="cat meow" yq --null-input '.a = env(myenv)'
# 输出: a: cat meow

# 布尔值（注意：yq 使用 YAML 1.2，true/false 才是布尔）
myenv="true" yq --null-input '.a = env(myenv)'
# 输出: a: true

# 数字
myenv="12" yq --null-input '.a = env(myenv)'
# 输出: a: 12

# YAML/JSON 对象
myenv="{b: fish, c: [1, 2]}" yq --null-input '.a = env(myenv)'
# 输出: a: {b: fish, c: [1, 2]}

# 数组
myenv="[1, 2, 3]" yq --null-input '.a = env(myenv)'
# 输出: a: [1, 2, 3]
```

### 11.3 strenv() - 始终作为字符串

```bash
# 防止数字/布尔被解析
myenv="true" yq --null-input '.a = strenv(myenv)'
# 输出: a: "true"

myenv="12" yq --null-input '.a = strenv(myenv)'
# 输出: a: "12"

myenv="3.14" yq --null-input '.a = strenv(myenv)'
# 输出: a: "3.14"
```

**何时使用 strenv：** 处理 Kubernetes 标签、Docker 镜像标签、版本号、电话号码等**必须保持字符串类型**的场景。

### 11.4 动态路径更新

```yaml
# sample.yml
a:
  b:
    - name: dog
    - name: cat
```

```bash
# 通过环境变量指定路径和值
pathEnv=".a.b[0].name" valueEnv="moo" \
  yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
# 输出:
# a:
#   b:
#     - name: moo
#     - name: cat
```

### 11.5 动态键查找

```yaml
# sample.yml
cat: meow
dog: woof
```

```bash
myenv="cat" yq '.[env(myenv)]' sample.yml
# 输出: meow
```

### 11.6 envsubst - 字符串插值

```bash
myenv="cat" other="red" yq --null-input '"the ${myenv} is ${other}" | envsubst'
# 输出: the cat is red

# 在现有文档中使用
myenv="production" yq '.environment = "deploy-to-${myenv}" | .environment |= envsubst' sample.yml
```

### 11.7 envsubst 高级选项

| 选项 | 说明 |
|------|------|
| `nu` (NoUnset) | 未设置的变量报错 |
| `ne` (NoEmpty) | 空变量报错 |
| `ff` (FailFast) | 第一个错误就中止 |

```bash
# 未设置变量报错（适合严格模式）
yq --null-input '"the ${missing} meows" | envsubst(nu)'
# Error: variable ${missing} not set

# 空变量报错
myenv="" yq --null-input '"the ${myenv} meows" | envsubst(ne)'
# Error: variable ${myenv} set but empty

# 默认值语法（Shell 风格）
yq --null-input '"the ${missing-dog} meows" | envsubst'
# 输出: the dog meows

yq --null-input '"the ${missing:-dog} meows" | envsubst'
# 输出: the dog meows

# envsubst 的 ff (FailFast) 选项：第一个错误就中止
yq --null-input '"the ${notThere} ${alsoNotThere}" | envsubst(nu,ff)'
# 输出: Error: variable ${notThere} not set（只报第一个）

# 组合使用：未设置变量报错且遇到第一个错误就中止
yq --null-input '"the ${a} ${b}" | envsubst(nu, ff)'
```

### 11.8 文档中批量替换环境变量

```yaml
# sample.yml
database:
  host: ${DB_HOST}
  port: ${DB_PORT}
app:
  name: ${APP_NAME}
```

```bash
DB_HOST=localhost DB_PORT=5432 APP_NAME=myapp \
  yq '(.. | select(tag == "!!str")) |= envsubst' sample.yml
# 输出所有字符串中的 ${VAR} 被替换
```

### 11.9 安全最佳实践

```bash
# 在 CI 中，如果不希望 yq 访问环境变量
yq --security-disable-env-ops '.' file.yaml

# 或者显式只传入需要的变量
DB_HOST=localhost yq '.host = strenv(DB_HOST)' file.yaml
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

```yaml
# sample.yml
a:
  field: me
  fieldA: cat
b:
  field:
    g: wizz
  fieldB: dog
```

```bash
# 返回合并结果（不包含父对象）
yq '.a * .b' sample.yml
# 输出:
# field:
#   g: wizz
# fieldA: cat
# fieldB: dog

# 保留在父对象中
yq '. * {"a":.b}' sample.yml
# 输出:
# a:
#   field:
#     g: wizz
#   fieldA: cat
#   fieldB: dog
# b:
#   field:
#     g: wizz
#   fieldB: dog
```

### 12.3 合并两个文件

```bash
# file1.yml 为基础，file2.yml 覆盖/补充
yq '. *= load("file2.yml")' file1.yml

# 深度合并
yq '. *d load("file2.yml")' file1.yml
```

### 12.4 合并所有文件

```bash
# 合并当前目录所有 yaml，后面的文件优先
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml

# 简写
yq ea '. as $item ireduce ({}; . * $item )' *.yml
```

### 12.5 仅合并已有字段（补丁模式）

```yaml
# sample.yml
a:
  thing: one
  cat: frog
b:
  missing: two
  thing: two
  cat: updated
```

```bash
yq '.a *? .b' sample.yml
# 输出:
# thing: two      # 已存在，更新
# cat: updated    # 已存在，更新
# missing 被忽略 # 不存在于 .a，不添加
```

### 12.6 仅合并新字段（安全添加）

```bash
yq '.a *n .b' sample.yml
# 输出:
# thing: one      # 已存在，保持原值
# cat: frog       # 已存在，保持原值
# missing: two    # 新字段，添加
```

### 12.7 追加数组

```yaml
# sample.yml
a:
  array:
    - 1
    - 2
    - animal: dog
  value: coconut
b:
  array:
    - 3
    - 4
    - animal: cat
  value: banana
```

```bash
yq '.a *+ .b' sample.yml
# 输出:
# array:
#   - 1
#   - 2
#   - animal: dog
#   - 3
#   - 4
#   - animal: cat
# value: banana    # 非数组，正常覆盖
```

### 12.8 深度合并数组（按索引合并）

```yaml
# sample.yml
a:
  - name: fred
    age: 12
    city: NYC
  - name: bob
    age: 32
b:
  - name: fred
    age: 34
  - name: charlie
    age: 25
```

```bash
yq '.a *d .b' sample.yml
# 输出:
# - name: fred
#   age: 34        # 覆盖
#   city: NYC      # 保留（因为 .b[0] 没有 city）
# - name: bob
#   age: 32        # 保留（.b[1] 不存在）
```

### 12.9 数值乘法合并

```yaml
# sample.yml
a: 3
b: 4
```

```bash
yq '.a *= .b' sample.yml    # 输出: a: 12
```

### 12.10 字符串重复

```bash
yq '.b * 4' sample.yml      # 假设 b: banana，输出 banana 重复 4 次
yq '4 * .b' sample.yml      # 同上（乘法交换律）
```

### 12.11 合并数组中对象（按关键字段匹配）

这是高级用法，用于合并两个文件中数组元素按特定键匹配：

```bash
idPath=".a" originalPath=".myArray" otherPath=".newArray" \
yq eval-all '
(
  (( (eval(strenv(originalPath)) + eval(strenv(otherPath)))  | .[] | {(eval(strenv(idPath))):  .}) as $item ireduce ({}; . * $item )) as $uniqueMap
  | ( $uniqueMap  | to_entries | .[]) as $item ireduce([]; . + $item.value)
) as $mergedArray
| select(fi == 0) | (eval(strenv(originalPath))) = $mergedArray
' sample.yml another.yml
```

## 13. 递归下降

### 13.1 基本递归

`..` 递归下降遍历所有节点。

```yaml
# sample.yml
a:
  b:
    c: apple
```

```bash
# 列出所有节点
yq '..' sample.yml

# 递归查找特定键
yq '.. | .c?' sample.yml   # 安全查找所有 .c
```

### 13.2 递归查找并更新

```bash
# 查找所有包含 "image" 的字段并统一更新
yq -i '(.. | select(has("image")).image) = "nginx:latest"' deployment.yaml

# 递归删除所有 difficulty 字段
yq -i 'del(.. | .difficulty?)' question-file.yml

# 递归更新所有 name 字段为大写
yq -i '(.. | select(has("name")).name) |= upcase' data.yaml
```

### 13.3 递归设置样式

```bash
# 所有值用双引号
yq '.. style="double"' sample.yml

# 键和值都用双引号
yq '... style="double"' sample.yml

# 所有字符串转为字面量块
yq '(.. | select(tag == "!!str")) style="literal"' sample.yml
```

### 13.4 递归类型转换

```bash
# 将所有整数转为字符串（防止科学计数法等问题）
yq '(.. | select(tag == "!!int")) tag = "!!str"' sample.yml

# 将所有 "true"/"false" 字符串转为布尔
yq '(.. | select(. == "true" or . == "false")) |= (. == "true")' sample.yml
```

---

## 14. 排序与去重

### 14.1 数组排序

```yaml
# sample.yml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'sort_by(.a)' sample.yml
# 输出:
# - a: apple
# - a: banana
# - a: cat
```

### 14.2 多字段排序

```yaml
# sample.yml
- a: dog
- a: cat
  b: banana
- a: cat
  b: apple
```

```bash
yq 'sort_by(.a, .b)' sample.yml
# 先按 .a 排序，再按 .b 排序
# 输出:
# - a: cat
#   b: apple
# - a: cat
#   b: banana
# - a: dog
```

### 14.3 降序排序

```bash
yq 'sort_by(.a) | reverse' sample.yml

# 或者使用负数（数字字段）
yq 'sort_by(-.age)' users.yml
```

### 14.4 映射排序（按键）

```yaml
# sample.yml
y: b
z: a
x: c
```

```bash
yq 'sort' sample.yml
# 输出:
# x: c
# y: b
# z: a

# 按小写键排序
yq 'sort_by(key | downcase)' sample.yml
```

### 14.5 原地排序

```bash
yq '.cool |= sort_by(.a)' sample.yml
```

### 14.6 自定义日期排序

```bash
yq 'with_dtf("02-Jan-2006"; sort_by(.date))' sample.yml
```

### 14.7 标量数组去重

```yaml
# sample.yml
- 2
- 1
- 3
- 2
- 1
```

```bash
yq 'unique' sample.yml
# 输出:
# - 2
# - 1
# - 3

# 去重后排序
yq 'unique | sort' sample.yml
```

### 14.8 对象数组去重（按字段）

```bash
# 按 name 字段去重（保留第一个）
yq 'unique_by(.name)' users.yml
```

### 14.9 保留最新去重（反转去重法）

```yaml
# sample.yml
proxies:
  - name: node1
    server: 1.1.1.1
  - name: node2
    server: 2.2.2.2
  - name: node1
    server: 3.3.3.3
```

```bash
# 后面的配置优先：先反转，去重，再反转回来
yq '.proxies |= (reverse | unique_by(.name) | reverse)' sample.yml
# 结果保留最后一个 node1（server: 3.3.3.3）
```

### 14.10 去重统计

```bash
# 查看去重前后的数量
yq '
  (.proxies | length) as $before |
  (.proxies | unique_by(.name) | length) as $after |
  "Before: \($before), After: \($after)"
' config.yaml
```

---

## 15. 键操作

### 15.1 获取键名

```yaml
# sample.yml
a: thing
```

```bash
yq '.a | key' sample.yml     # 输出: a
```

### 15.2 获取数组索引

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.[1] | key' sample.yml   # 输出: 1
```

### 15.3 重命名键

```yaml
# sample.yml
a:
  x: 3
  y: 4
```

```bash
yq '(.a.x | key) = "meow"' sample.yml
# 输出:
# a:
#   meow: 3
#   y: 4
```

### 15.4 获取所有键

```bash
yq 'keys' sample.yml         # 顶层键
yq '.a | keys' sample.yml    # .a 的键
```

### 15.5 键名批量修改

```bash
# 添加前缀
yq 'with_entries(.key |= "prefix_" + .)' sample.yml

# 替换键名中的字符
yq 'with_entries(.key |= sub("-"; "_"))' sample.yml

# 递归修改所有键
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= upcase)' sample.yml
```

### 15.6 keys_unsorted

`keys_unsorted` 返回映射的键名列表，**不保证顺序**（比 `keys` 更快，当你不需要排序时）。

```yaml
# sample.yml
b: 1
a: 2
c: 3
```

```bash
yq 'keys_unsorted' sample.yml
# 输出: [b, a, c]（保持原始顺序）

yq 'keys' sample.yml
# 输出: [a, b, c]（已排序）
```

### 15.7 sort_keys

`sort_keys` 对映射的键进行排序，返回排序后的映射。

```yaml
# sample.yml
z: 1
a: 2
m: 3
```

```bash
yq 'sort_keys(.)' sample.yml
# 输出:
# a: 2
# m: 3
# z: 1

# 递归排序所有嵌套映射的键
yq '(.. | select(tag == "!!map")) |= sort_keys(.)' sample.yml

# 只排序顶层
yq 'sort_keys' sample.yml
```

---

## 16. 长度与计数

### 16.1 字符串长度

```yaml
# sample.yml
a: cat
```

```bash
yq '.a | length' sample.yml    # 输出: 3
```

### 16.2 映射长度

```bash
yq 'length' sample.yml         # 返回键值对数量
```

### 16.3 数组长度

```bash
yq 'length' sample.yml         # 返回元素数量
```

### 16.4 null 长度

```bash
yq '.a | length' sample.yml    # null 返回 0
```

### 16.5 实用计数

```bash
# 计算满足条件的元素数量
yq '[.[] | select(.active == true)] | length' sample.yml

# 计算嵌套数组总元素数
yq '[.. | select(tag == "!!seq")] | map(length) | add' sample.yml
```

---

## 17. 字符串操作

### 17.1 插值

```yaml
# sample.yml
value: things
another: stuff
```

```bash
yq '.message = "I like \(.value) and \(.another)"' sample.yml
# 输出:
# value: things
# another: stuff
# message: I like things and stuff
```

### 17.2 大小写转换

```bash
yq 'upcase' sample.yml       # 转大写（支持 Unicode）
yq 'downcase' sample.yml     # 转小写（支持 Unicode）
```

### 17.3 连接字符串

```yaml
# sample.yml
- cat
- meow
- 1
- null
- true
```

```bash
yq 'join("; ")' sample.yml
# 输出: cat; meow; 1; ; true

# 过滤 null 后连接
yq '[.[] | select(. != null)] | join(", ")' sample.yml
```

### 17.4 修剪空白

```yaml
# sample.yml
- ' cat'
- 'dog '
- ' cow cow '
```

```bash
yq '.[] | trim' sample.yml
# 输出:
# cat
# dog
# cow cow

# 修剪左侧/右侧
yq '.[] | ltrimstr(" ") | rtrimstr(" ")' sample.yml
```

### 17.5 正则匹配

```bash
# 匹配第一个
yq 'match("foo")' sample.yml

# 全局匹配，忽略大小写
yq '[match("(?i)foo"; "g")]' sample.yml

# 捕获组
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

`test` 用于判断字符串是否匹配正则表达式，返回布尔值，是条件过滤的核心工具。

```yaml
# sample.yml
- name: server-us-01
  region: america
- name: server-hk-01
  region: asia
- name: server-uk-01
  region: europe
```

```bash
# 基础匹配
yq '.[] | select(.name | test("^server-"))' sample.yml

# 忽略大小写 (?i)
yq '.[] | select(.region | test("(?i)US|america|美国"))' sample.yml

# 匹配结尾
yq '.[] | select(.name | test("-01$"))' sample.yml

# 不匹配
yq '.[] | select(.name | test("hk") | not)' sample.yml

# 在 with_entries 中使用
yq '
  .providers |= with_entries(
    .value.path = (
      (.value.path | select(test("/$")) | . + "suffix") // .value.path
    )
  )
' sample.yml
```

### 17.8 替换

```yaml
# sample.yml
a: cat
b: heat
```

```bash
yq '.[] |= sub("(a)"; "${1}r")' sample.yml
# 输出:
# a: cart
# b: heart

# 全局替换
yq '.[] |= gsub("a"; "A")' sample.yml

# 条件替换
yq '.[] |= sub("cat"; "dog")' sample.yml
```

### 17.9 分割

```bash
yq 'split("; ")' sample.yml

# 按行分割
yq 'split("\\n")' sample.yml
```

### 17.10 startsWith / endsWith / contains

```bash
yq '.[] | select(startswith("pre"))' sample.yml
yq '.[] | select(endswith("post"))' sample.yml
yq '.[] | select(contains("middle"))' sample.yml
```

### 17.11 字符串切片

```yaml
# sample.yml
country: Australia
```

```bash
# 字符串切片（按 rune，支持 Unicode）
yq '.country[0:5]' sample.yml     # Austr
yq '.country[5:]' sample.yml      # alia
yq '.country[-5:]' sample.yml      # ralia

# Unicode 字符正确处理
yq '.greeting[1:3]' sample.yml    # 输入 héllo，输出 él
```

### 17.12 to_string

将所有类型转为字符串表示。

```yaml
# sample.yml
- 1
- true
- null
- ~
- cat
- an: object
- - array
  - 2
```

```bash
yq '.[] |= to_string' sample.yml
# 输出:
# - "1"
# - "true"
# - "null"
# - "~"
# - cat
# - "an: object"
# - "- array\n- 2"
```

### 17.13 utf8bytelength

返回字符串的 UTF-8 字节长度（与 `length` 的字符数不同）。

```bash
# 中文字符：length 返回字符数，utf8bytelength 返回字节数
yq --null-input '"中文字符" | utf8bytelength'   # 12（UTF-8 每个中文3字节）
yq --null-input '"中文字符" | length'            # 4（字符数）
```

---

## 18. 布尔与逻辑运算

### 18.1 逻辑运算

```bash
yq --null-input 'true and false'     # false
yq --null-input 'true or false'      # true
yq --null-input 'true | not'         # false

# 异或
yq --null-input 'true != false'      # true
```

### 18.2 any / all

```yaml
# sample.yml
- false
- true
```

```bash
yq 'any' sample.yml        # true（任一 true）
yq 'all' sample.yml        # false（并非全部 true）
```

### 18.3 条件 any/all

```yaml
# sample.yml
a:
  - rad
  - awesome
b:
  - meh
  - whatever
```

```bash
yq '.[] |= any_c(. == "awesome")' sample.yml
# 输出:
# a: true
# b: false

yq '.[] |= all_c(tag == "!!str")' sample.yml
# 输出:
# a: true
# b: true
```

### 18.4 条件表达式（if-then-else）

```bash
# 设置默认值（如果为 null 则使用默认值）
yq '.name // "unknown"' sample.yml

# 条件赋值
yq 'if .active == true then "running" else "stopped" end' sample.yml

# 多分支条件
yq '
  if .status == "green" then "healthy"
  elif .status == "yellow" then "warning"
  else "critical"
  end
' sample.yml
```

### 18.5 字符串转布尔（环境变量场景）

```bash
export ENABLE_FEATURE="true"

# 将字符串 "true"/"false" 转为布尔值
yq -i '
  (strenv(ENABLE_FEATURE) // "") as $e |
  .feature_enabled = (select($e != "") | ($e == "true")) // .
' config.yaml

# 批量转换所有 "true"/"false" 字符串
yq '(.. | select(. == "true" or . == "false")) |= (. == "true")' config.yaml
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

# 多条件组合
yq -i '
  .proxy-groups |= map(
    ((select(.type == "url-test") | .url = "http://test.com") // .) |
    ((select(.type == "fallback") | .url = "http://fallback.com") // .)
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
# 输出: b: "new"
```

### 19.3 使用 with 设置样式

```bash
yq 'with(.a.b ; . = "newValue" | . style="single")' sample.yml
# 输出: 'newValue'
```

### 19.4 全局设置样式

```bash
yq '.. style="double"' sample.yml      # 所有值用双引号
yq '... style="double"' sample.yml     # 键和值都用双引号
yq '.. style="literal"' sample.yml     # 字面量块（多行字符串）
yq '.. style="flow"' sample.yml        # 流式格式（紧凑）
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

### 19.7 保留注释的同时更新样式

```bash
# 先读取，修改样式，再赋值回去
yq '.a style="double"' sample.yml
```

---

## 20. 标签与类型

### 20.1 获取标签

```yaml
# sample.yml
a: cat
b: 5
c: 3.2
e: true
f: []
```

```bash
yq '.. | tag' sample.yml
# 输出:
# !!map
# !!str
# !!int
# !!float
# !!bool
# !!seq
```

> `type` 是 `tag` 的别名。

### 20.2 kind（节点类型）

`kind` 返回节点的基本类型：`scalar`、`map` 或 `seq`，不受自定义标签影响。

```bash
yq '.. | kind' sample.yml
# 输出:
# map
# scalar
# scalar
# scalar
# scalar
# seq
```

```bash
# 只对标量添加注释
yq '(.. | select(kind == "scalar")) line_comment = "this is a scalar"' sample.yml
```

### 20.3 设置自定义标签

```bash
yq '.a tag = "!!mikefarah"' sample.yml
# 输出: a: !!mikefarah str
```

### 20.4 数字转字符串

```bash
yq '(.. | select(tag == "!!int")) tag= "!!str"' sample.yml
# 将所有整数转为字符串

# 或者更精确：只转换特定路径
yq '.port tag = "!!str"' config.yml
```

### 20.5 类型检查

```bash
yq '.value | tag' sample.yml    # 查看类型
yq '.[] | select(tag == "!!str")' sample.yml  # 只选字符串
yq '.[] | select(tag == "!!int" or tag == "!!float")' sample.yml  # 数字
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

```yaml
# sample.yml
a: cat
```

```bash
yq '.a line_comment="single"' sample.yml
# 输出: a: cat # single
```

### 21.3 设置映射/数组的注释（在 key 上）

```yaml
# sample.yml
a:
  b: things
```

```bash
yq '(.a | key) line_comment="single"' sample.yml
# 输出:
# a: # single
#   b: things
```

### 21.4 设置头部注释

```bash
yq '. head_comment="single"' sample.yml
# 输出:
# # single
# a: cat
```

### 21.5 设置尾部注释

```bash
yq '. foot_comment=.a' sample.yml
# 输出:
# a: cat
# # cat
```

### 21.6 相对更新注释

```bash
yq '.. line_comment |= .' sample.yml
# 将所有节点的行尾注释设为其值
```

### 21.7 删除注释

```bash
# 删除单个注释
yq '.a line_comment=""' sample.yml

# 删除所有注释（保留内容）
yq '... comments=""' sample.yml
```

### 21.8 全局注释清理

```bash
# 合并多个文件后清理所有注释，输出纯净 YAML
yq ea '
  . as $item ireduce ({}; . * $item) |
  ... comments=""
' file1.yaml file2.yaml > merged.yaml
```

### 21.9 查找注释位置

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "hc": headComment, "lc": lineComment, "fc": footComment}]' sample.yml
```

### 21.10 `is_key` 在注释定位中的应用

```bash
# 判断节点是键还是值，对理解注释归属至关重要
yq '[... | {"path": path | join("."), "isKey": is_key, "lineComment": lineComment}]' sample.yml
```

### 21.11 注释保留注意事项

yq 基于 go-yaml v3，**会尽力保留注释**，但在以下场景可能丢失：
- 删除节点后，依附于该节点的注释可能消失
- 大幅重构文档结构时，注释位置可能偏移
- 使用 `sort` 或 `unique` 后，注释通常不保留

**建议：** 在 CI 流水线中，如果注释很重要，先备份或使用 `yq` 的特定版本测试。

---

## 22. 锚点与别名

### 22.1 获取锚点名

```yaml
# sample.yml
a: &billyBob cat
```

```bash
yq '.a | anchor' sample.yml     # 输出: billyBob
```

### 22.2 设置锚点

```bash
yq '.a anchor = "foobar"' sample.yml
# 输出: a: &foobar cat
```

### 22.3 获取别名

```yaml
# sample.yml
b: &billyBob meow
a: *billyBob
```

```bash
yq '.a | alias' sample.yml      # 输出: billyBob
```

### 22.4 设置别名

```bash
yq '.a alias = "meow"' sample.yml
# 输出:
# b: &meow purr
# a: *meow
```

### 22.5 展开别名（explode）

```yaml
# sample.yml
f:
  a: &a cat
  b: *a
```

```bash
yq 'explode(.f)' sample.yml
# 输出:
# f:
#   a: cat
#   b: cat
```

### 22.6 解引用并更新

```yaml
# sample.yml
item_value: &item_value
  value: true
thingOne:
  name: item_1
  !!merge <<: *item_value
```

```bash
yq '.thingOne |= (explode(.) | sort_keys(.)) * {"value": false}' sample.yml
# 输出:
# thingOne:
#   name: item_1
#   value: false
```

### 22.7 删除所有锚点和别名（内联化）

```bash
# 展开后所有锚点消失，配置自包含
yq 'explode(.)' sample.yml
```

### 22.8 合并前展开（重要）

```bash
# 先展开别名，再合并，避免别名指向错误
yq ea '
  . as $item ireduce ({}; . * $item) |
  explode(.)
' base.yaml mixin.yaml
```

---

## 23. 加载外部文件

### 23.1 加载 YAML 文件

```yaml
# sample.yml
myFile: ../../examples/thing.yml
```

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

### 23.6 模板化配置（高级）

```yaml
# base.yml
database:
  host: localhost
  port: 5432

# prod.yml
extends: base.yml
database:
  host: prod.db.example.com
```

```bash
# 模拟继承（加载基础并合并）
yq '. * load(.extends)' prod.yml
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
# 嵌套 JSON 字符串
yq '.b = (.a | to_json)' sample.yml

# 单行 JSON
yq '.b = (.a | to_json(0))' sample.yml

# 简写
yq '.b = (.a | @json)' sample.yml
```

### 24.3 JSON 解码

```bash
yq '.a | from_json | ... style=""' sample.yml

# 解码后访问
yq '.json_field | from_json | .nested.key' sample.yml
```

### 24.4 Properties 编码/解码

```bash
yq '.b = (.a | @props)' sample.yml
yq '.a |= @propsd' sample.yml
```

### 24.5 CSV/TSV 编码/解码

```bash
# YAML 数组转 CSV
yq '@csv' sample.yml

# TSV
yq '@tsv' sample.yml

# CSV 转 YAML
yq '.a |= @csvd' sample.yml
```

### 24.6 XML 编码/解码

```bash
yq '.a | to_xml' sample.yml
yq '.a | @xml' sample.yml                   # 单行
yq '.b = (.a | from_xml)' sample.yml
```

### 24.7 Base64 编码/解码

```bash
# 编码
yq '.coolData | @base64' sample.yml

# 解码
yq '.coolData | @base64d' sample.yml

# YAML 文档编码为 Base64
yq '@yaml | @base64' sample.yml

# Base64 解码为 YAML
yq '.coolData |= (@base64d | from_yaml)' sample.yml
```

### 24.8 URI 编码/解码

```bash
yq '.coolData | @uri' sample.yml
yq '@urid' sample.yml
```

### 24.9 Shell 编码

```bash
# 转义为 Shell 安全字符串
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
# 将所有 YAML 文件合并为一个多文档文件
yq '.' somewhere/*.yaml
```

### 25.3 选择特定文档

```bash
# 按文档索引（di 是 documentIndex 的简写）
yq 'select(documentIndex == 0)' multi-doc.yaml
yq 'select(di == 0)' multi-doc.yaml

# 按文件索引（fi 是 fileIndex 的简写）
yq 'select(fileIndex == 0)' file1.yaml file2.yaml
yq 'select(fi == 0)' file1.yaml file2.yaml

# document_index 作为值输出
yq '.a | document_index' multi-doc.yaml

# file_index 与 document_index 的区别
# fi: 文件索引（第几个文件）
# di: 文档索引（文件内第几个 --- 分隔的文档）
yq eval-all '{"file": filename, "fi": fi, "di": di}' file1.yaml file2.yaml
```

### 25.4 更新特定文档

```bash
# 只更新第二个文档
yq -i '(select(di == 1) | .each) += "cool"' multi-doc.json

# 更新所有文档的某个字段
yq -i '.version = "2.0"' multi-doc.yaml
```

### 25.5 拆分文档

```yaml
# sample.yml
- a: cat
- b: dog
```

```bash
yq '.[] | split_doc' sample.yml
# 输出:
# a: cat
# ---
# b: dog
```

### 25.6 多文档统计

```bash
# 计算文档数量
yq '[.] | length' multi-doc.yaml

# 或者
yq 'document_index' multi-doc.yaml  # 最后一个文档的索引
```

---

## 26. 格式转换

### 26.1 YAML ↔ JSON

```bash
# JSON 转 YAML（美化）
yq -Poy sample.json
yq -P -p json sample.json

# YAML 转 JSON
yq -o json file.yaml
yq -o json -I=0 file.yaml     # 单行 JSON
yq -o json -I=2 file.yaml     # 2空格缩进
```

### 26.2 YAML ↔ XML

```bash
# XML 转 YAML
yq -p xml file.xml
yq -o yaml file.xml

# YAML 转 XML
yq -o xml file.yaml
```

### 26.3 YAML ↔ Properties

```bash
yq -o props file.yaml
yq -p props file.properties
```

### 26.4 YAML ↔ CSV/TSV

```bash
# 数组数据转 CSV
yq -o csv file.yaml

# CSV 转 YAML
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

yq 默认根据文件扩展名自动检测格式，未知格式默认为 YAML。

```bash
# 显式指定输入格式（管道数据无扩展名）
cat file.xml | yq -p xml '.'

# 显式指定输出格式
yq -o json '.' file.yaml
```

### 26.10 YAML 编码解码与缩进参数

```bash
# to_yaml 带缩进参数
yq '.b = (.a | to_yaml(8))' sample.yml   # 缩进 8 个空格

# to_xml 带缩进参数
yq '{"cat": .a | to_xml(1)}' sample.yml  # 缩进 1 个空格

# from_yaml / @yamld — YAML 字符串解码
yq '.b = (.a | from_yaml)' sample.yml
yq '.a |= (from_yaml | .foo = "cat" | to_yaml)' sample.yml
```

---

## 27. Reduce 与函数式操作

### 27.1 语法

```
<表达式> as $<name> ireduce (<初始值>; <累积表达式>)
```

### 27.2 数组求和

```yaml
# sample.yml
- 10
- 2
- 5
- 3
```

```bash
yq '.[] as $item ireduce (0; . + $item)' sample.yml
# 输出: 20
```

### 27.3 合并所有文件（ireduce 核心场景）

```bash
# 合并所有 mixin 文件，后面的覆盖前面的
yq ea '. as $item ireduce ({}; . * $item)' mixin1.yaml mixin2.yaml mixin3.yaml
```

**执行过程：**
1. 初始值 `{}`
2. 加载第一个文件，与 `{}` 合并 → 结果1
3. 加载第二个文件，与结果1 合并 → 结果2
4. 加载第三个文件，与结果2 合并 → 最终结果

### 27.4 深度合并（保留嵌套结构）

```bash
# 深度合并，数组按索引合并
yq ea '. as $item ireduce ({}; . *d $item)' base.yaml patch.yaml
```

### 27.5 数组转对象

```yaml
# sample.yml
- name: Cathy
  has: apples
- name: Bob
  has: bananas
```

```bash
yq '.[] as $item ireduce ({}; .[$item | .name] = ($item | .has) )' sample.yml
# 输出:
# Cathy: apples
# Bob: bananas
```

### 27.6 分组统计

```yaml
# sample.yml
- category: A
  value: 10
- category: B
  value: 20
- category: A
  value: 30
```

```bash
# 按 category 分组求和
yq '.[] as $item ireduce ({}; .[$item.category] += $item.value)' sample.yml
# 输出:
# A: 40
# B: 20
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

```yaml
# sample.yml
a:
  deeply:
    nested: value
```

```bash
yq 'with(.a.deeply.nested; . = "newValue" | . style="single")' sample.yml
# 输出:
# a:
#   deeply:
#     nested: 'newValue'
```

### 28.2 同时更新多个属性

```yaml
# sample.yml
a:
  deeply:
    nested: value
    other: thing
```

```bash
yq 'with(.a.deeply; .nested = "newValue" | .other = "newThing")' sample.yml
```

### 28.3 相对更新数组元素

```yaml
# sample.yml
myArray:
  - a: apple
  - a: banana
```

```bash
yq 'with(.myArray[]; .b = .a + " yum")' sample.yml
# 输出:
# myArray:
#   - a: apple
#     b: apple yum
#   - a: banana
#     b: banana yum
```

### 28.4 Entries 操作

```yaml
# sample.yml
a: 1
b: 2
```

```bash
# 映射转 entries
yq 'to_entries' sample.yml
# 输出:
# - key: a
#   value: 1
# - key: b
#   value: 2

# entries 转映射
yq 'to_entries | from_entries' sample.yml
# 输出:
# a: 1
# b: 2

# 批量修改键名
yq 'with_entries(.key |= "KEY_" + .)' sample.yml
# 输出:
# KEY_a: 1
# KEY_b: 2

# 递归修改所有键名
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= "KEY_" + .)' sample.yml
```

### 28.5 with_entries 动态键名处理

```yaml
# sample.yml
providers:
  custom1:
    path: ""
    url: http://example.com/1
  custom2:
    path: "/tmp/rules/"
    url: http://example.com/2
```

```bash
# 如果 path 为空，使用默认路径
yq '
  .providers |= with_entries(
    .key as $k |
    .value.path = ((.value.path | select(. != "")) // ("./provider/" + $k))
  )
' sample.yml
```

### 28.6 结合 as 和 test 处理路径

```bash
# 如果路径以 / 结尾，自动追加键名
yq '
  .providers |= with_entries(
    .key as $k |
    ((.value.path | select(. != "")) // ("./provider/" + $k)) as $base |
    .value.path = (
      ($base | select(test("/$")) | . + $k) // $base
    )
  )
' sample.yml
```

### 28.7 过滤特定键

```bash
# 只保留以 "custom_" 开头的 provider
yq '.providers |= with_entries(select(.key | startswith("custom_")))' sample.yml

# 删除特定键
yq '.providers |= with_entries(select(.key != "deprecated"))' sample.yml
```

### 28.8 批量修改键名格式

```bash
# 将键名中的横线改为下划线
yq '. |= with_entries(.key |= sub("-"; "_"))' sample.yml

# 键名转大写
yq '.providers |= with_entries(.key |= upcase)' sample.yml
```

---

## 29. 数组映射 map

`map` 用于对数组的每个元素应用表达式，是批量修改数组的核心工具。

### 29.1 基础用法

```yaml
# sample.yml
proxies:
  - name: node1
    type: ss
  - name: node2
    type: vmess
```

```bash
# 给所有元素添加字段
yq '.proxies |= map(.udp = true)' sample.yml

# 修改所有元素的字段
yq '.proxies |= map(.port = 443)' sample.yml
```

### 29.2 条件映射（核心模式）

```bash
# 核心模式：((select(条件) | .field = 新值) // .)
# 只在条件满足时更新，否则保持原样

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
# 只修改特定类型的元素
yq '.proxies |= map(
  (select(.type == "ss" and (.plugin | length == 0)) | .plugin = "obfs") // .
)' config.yaml

# 删除特定字段
yq '.proxies |= map(del(.unused_field))' config.yaml
```

### 29.4 嵌套映射

```bash
# 修改 proxy-groups 中的每个代理引用
yq '
  .proxy-groups |= map(
    .proxies |= map(
      (select(. == "DIRECT") | "🎯 DIRECT") // .
    )
  )
' config.yaml
```

### 29.5 多条件映射

```bash
export URL="http://test.com"
export INTERVAL="300"
export TOLERANCE="50"
export TIMEOUT="5000"

yq -i '
  (strenv(URL)       // "") as $u  |
  (strenv(INTERVAL)  // "") as $i  |
  (strenv(TOLERANCE) // "") as $t  |
  (strenv(TIMEOUT)   // "") as $to |
  (.proxy-groups // []) |= map(
    ((select($u  != "") | .url = $u) // .) |
    ((select($i  != "" and (.type == "url-test" or .type == "fallback")) | .interval = ($i | tonumber)) // .) |
    ((select($t  != "" and  .type == "url-test") | .tolerance = ($t | tonumber)) // .) |
    ((select($to != "" and (.type == "url-test" or .type == "fallback")) | .timeout = ($to | tonumber)) // .)
  )
' config.yaml
```

---

## 30. 拆分为文档

### 30.1 数组拆分为多文档

```yaml
# sample.yml
- a: cat
- b: dog
```

```bash
yq '.[] | split_doc' sample.yml
# 输出:
# a: cat
# ---
# b: dog
```

### 30.2 按条件拆分

```bash
# 将活跃和非活跃用户拆分为不同文档
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
yq --null-input 'null + "cat"'    # 输出: cat
```

### 31.6 数值运算

```bash
# 基本运算
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

# 基础转换
yq -i '
  (strenv(INTERVAL) | tonumber) as $i |
  .interval = $i
' config.yaml

# 安全转换（防止空值报错）
yq '
  (strenv(INTERVAL) // "") as $s |
  .interval = (select($s != "") | ($s | tonumber)) // .
' config.yaml

# 批量转换所有字符串数字
yq '(.. | select(test("^[0-9]+$"))) |= tonumber' config.yaml
```

### 31.8 布尔转换

```bash
export ENABLE_UDP="true"

# 将字符串 "true"/"false" 转为布尔值
yq -i '
  (strenv(ENABLE_UDP) // "") as $e |
  .udp = (select($e != "") | ($e == "true")) // .
' config.yaml
```

### 31.9 数组追加（+=）

```yaml
# sample.yml
a:
  - 1
  - 2
b:
  - 3
  - 4
```

```bash
yq '.a += .b' sample.yml
# 输出:
# a: [1, 2, 3, 4]
# b:
#   - 3
#   - 4
```

### 31.10 相对追加到数组元素

```yaml
# sample.yml
a:
  a1:
    b:
      - cat
  a2:
    b:
      - dog
  a3: {}
```

```bash
yq '.a[].b += ["mouse"]' sample.yml
# 所有子对象的 b 数组追加 mouse
```

### 31.11 字符串追加

```yaml
# sample.yml
a: cat
b: meow
```

```bash
yq '.a += .b' sample.yml
# 输出: a: catmeow
```

### 31.12 对象浅合并（+=）

```yaml
# sample.yml
a:
  thing:
    name: Astuff
    value: x
  a1: cool
b:
  thing:
    name: Bstuff
    legs: 3
  b1: neat
```

```bash
yq '.a += .b' sample.yml
# 输出: a 浅合并 b，thing.name 被覆盖为 Bstuff
```

### 31.13 除法运算

```bash
# 数字除法（结果总是 float）
yq '.a = .a / .b' sample.yml

# 字符串分割
yq '.c = .a / .b' sample.yml   # .a: cat_meow, .b: _ → c: [cat, meow]

# 除以零
yq '.a = .a / 0' sample.yml    # 输出: !!float +Inf
```

### 31.14 取模运算

```bash
# 整数取模
yq '.a = .a % .b' sample.yml    # a: 13, b: 2 → a: 1

# 浮点取模
yq '.a = .a % .b' sample.yml    # a: 12, b: 2.5 → a: !!float 2

# 整数除以零报错
yq '.a = .a % 0' sample.yml     # Error: cannot modulo by 0

# 浮点除以零为 NaN
yq '.a = .a % 0' sample.yml     # a: 1.1, b: 0 → a: !!float NaN
```

### 31.15 减法运算

```bash
# 数组减法
yq --null-input '[1,2] - [2,3]'   # 输出: [1]

# 嵌套数组减法
yq --null-input '[[1], 1, 2] - [[1], 3]'  # 输出: [1, 2]

# 对象数组减法（键顺序不影响）
yq '. - [{"c": "d", "a": "b"}]' sample.yml

# 数字减法
yq '.a = .a - .b' sample.yml

# 日期减法
yq '.a -= "3h10m"' sample.yml

# 批量递减
yq '.[] -= 1' sample.yml
```
---
## 32. 节点元信息

yq 可以读取 YAML 节点在源文件中的位置信息，这对编写 lint 工具、定位配置错误非常有用。

### 32.1 `line` — 获取行号

返回匹配节点的起始行号（从 1 开始），无行号数据时返回 0。

```yaml
# sample.yml
a: cat
b:
  c: cat
```

```bash
# 获取值节点的行号
yq '.b | line' sample.yml
# 输出: 3

# 获取键节点的行号
yq '.b | key | line' sample.yml
# 输出: 2

# 无行号数据时
yq --null-input '{"a": "new entry"} | line'
# 输出: 0
```

### 32.2 `column` — 获取列号

返回匹配节点的起始列号（从 1 开始），无列号数据时返回 0。

```yaml
# sample.yml
a: cat
b: bob
```

```bash
# 获取值节点的列号
yq '.b | column' sample.yml
# 输出: 4（b: 后第 4 个字符开始）

# 获取键节点的列号
yq '.b | key | column' sample.yml
# 输出: 1
```

### 32.3 `is_key` — 判断是否为键节点

在注释操作和元信息收集中非常有用：

```bash
# 查找所有注释的位置
yq '[... | {"p": path | join("."), "isKey": is_key, "lc": lineComment}]' sample.yml
```

### 32.4 `filename` — 获取文件名

```bash
# 单文件
yq 'filename' sample.yml
# 输出: sample.yml

# 多文件（需用 eval-all）
yq eval-all 'filename' file1.yml file2.yml

# 按文件名过滤合并
yq eval-all 'select(filename == "prod.yaml") * select(filename == "base.yaml")' *.yaml
```

### 32.5 `file_index` / `fi` — 获取文件索引

```bash
# 单文件索引
yq 'file_index' sample.yml
# 输出: 0

# 多文件索引
yq eval-all 'fi' file1.yml file2.yml
# 输出: 0 / 1

# 合并特定文件
yq eval-all 'select(fi == 0) * select(fi == 1)' base.yaml patch.yaml
```

---

## 33. 动态求值与系统函数

### 33.1 `eval` — 动态执行表达式

`eval` 将字符串作为 yq 表达式动态执行，常用于参数化脚本：

```yaml
# sample.yml
pathExp: .a.b[] | select(.name == "cat")
a:
  b:
    - name: dog
    - name: cat
```

```bash
# 从文档字段读取表达式并执行
yq 'eval(.pathExp)' sample.yml
# 输出: name: cat

# 从环境变量动态更新路径
pathEnv=".a.b[0].name" valueEnv="moo"   yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
```

### 33.2 `error(msg)` — 抛出错误

```bash
# 条件报错
yq '.value | if . > 100 then error("value too large") else . end' sample.yml
```

### 33.3 `halt` — 立即停止求值

```bash
yq '.items[] | select(.critical) | error("critical found") | halt' sample.yml
```

### 33.4 `builtins` — 列出所有内置函数

```bash
yq 'builtins' --null-input
```

### 33.5 `debug` — 调试输出

```bash
# 将当前值输出到 stderr，stdout 继续正常输出
yq '.items[] | debug | .name' sample.yml
```

### 33.6 `system(cmd; args)` — 执行外部命令

> ⚠️ 需要显式启用 `--security-enable-system-operator`

```bash
yq --security-enable-system-operator '.result = system("date"; "+%Y-%m-%d")' sample.yml
```

---

## 34. 内置函数大全

以下按字母顺序和功能分类列出 yq v4.40+ 支持的所有内置函数和运算符。

### 34.1 数组与集合操作

#### 34.1.1 map / map_values

| 函数 | 说明 | 示例 |
|------|------|------|
| `map(exp)` | 对数组每个元素应用表达式 | `map(. + 1)` |
| `map_values(exp)` | 对映射的每个值应用表达式，保持键不变 | `map_values(. + 1)` |

```yaml
# sample.yml
a:
  x: 1
  y: 2
  z: 3
```

```bash
# map 用于数组
yq '[1, 2, 3] | map(. * 2)' --null-input
# 输出: [2, 4, 6]

# map_values 用于对象（保持键，修改值）
yq 'map_values(. * 2)' sample.yml
# 输出:
# a:
#   x: 2
#   y: 4
#   z: 6

# 嵌套使用
yq '.items |= map_values(.price * 1.1)' sample.yml
```

#### 34.1.2 flatten

递归扁平化嵌套数组。

```yaml
# sample.yml
- [1, 2]
- [[3, 4], 5]
- 6
```

```bash
# 完全扁平化
yq 'flatten' sample.yml
# 输出: [1, 2, 3, 4, 5, 6]

# 只扁平化一层
yq 'flatten(1)' sample.yml
# 输出: [1, 2, [3, 4], 5, 6]
```

#### 34.1.3 group_by

按表达式对数组元素分组。

```yaml
# sample.yml
- category: A
  value: 10
- category: B
  value: 20
- category: A
  value: 30
```

```bash
yq 'group_by(.category)' sample.yml
# 输出:
# - - category: A
#     value: 10
#   - category: A
#     value: 30
# - - category: B
#     value: 20
```

#### 34.1.4 filter

过滤数组或映射值，只保留满足条件的元素。

```yaml
# sample.yml
- 1
- 2
- 3
- 4
- 5
```

```bash
yq 'filter(. > 2)' sample.yml
# 输出: [3, 4, 5]

# 过滤对象值
yq 'filter(. > 1)' sample.yml
# 对象: {a: 1, b: 2, c: 3} -> {b: 2, c: 3}
```

#### 34.1.5 first

返回第一个匹配条件的元素，或数组第一个元素。

```yaml
# sample.yml
- name: cat
  age: 2
- name: dog
  age: 5
- name: frog
  age: 1
```

```bash
# 数组第一个元素
yq 'first' sample.yml
# 输出: {name: cat, age: 2}

# 第一个匹配条件的元素
yq 'first(.name == "dog")' sample.yml
# 输出: {name: dog, age: 5}
```

#### 34.1.6 limit

限制输出结果的数量。

```bash
# 只取前3个
yq '.items[] | limit(3; .)' sample.yml

# 配合管道
yq '.users | limit(5; .[])' sample.yml
```

#### 34.1.7 range

生成数字序列数组。

```bash
# 生成 0 到 4
yq '[range(5)]' --null-input
# 输出: [0, 1, 2, 3, 4]

# 生成 2 到 5
yq '[range(2; 6)]' --null-input
# 输出: [2, 3, 4, 5]

# 带步长
yq '[range(0; 10; 2)]' --null-input
# 输出: [0, 2, 4, 6, 8]
```

#### 34.1.8 pick / omit

| 函数 | 说明 | 示例 |
|------|------|------|
| `pick(keys)` | 只保留指定的键/索引 | `pick(["a", "b"])` |
| `omit(keys)` | 排除指定的键/索引 | `omit(["a", "b"])` |

```yaml
# sample.yml
a: 1
b: 2
c: 3
d: 4
```

```bash
# 只保留指定键
yq 'pick(["a", "c"])' sample.yml
# 输出:
# a: 1
# c: 3

# 排除指定键
yq 'omit(["b", "d"])' sample.yml
# 输出:
# a: 1
# c: 3

# 数组索引
yq 'pick([0, 2])' sample.yml
# 输入 [cat, dog, frog, cow] -> [cat, frog]
```

#### 34.1.9 pivot

矩阵转置（PIVOT），将行转列、列转行。

```yaml
# sample.yml
- [1, 2, 3]
- [4, 5, 6]
- [7, 8, 9]
```

```bash
yq 'pivot' sample.yml
# 输出:
# - [1, 4, 7]
# - [2, 5, 8]
# - [3, 6, 9]
```

#### 34.1.10 shuffle

随机打乱数组顺序。

```yaml
# sample.yml
- 1
- 2
- 3
- 4
- 5
```

```bash
yq 'shuffle' sample.yml
# 输出（每次不同）: [3, 1, 5, 2, 4]
```

#### 34.1.11 reverse

反转数组顺序。

```bash
yq 'reverse' sample.yml
```

#### 34.1.12 sort_keys

对映射的键进行排序。

```yaml
# sample.yml
z: 1
a: 2
m: 3
```

```bash
# 顶层排序
yq 'sort_keys' sample.yml
# 输出:
# a: 2
# m: 3
# z: 1

# 递归排序
yq '(.. | select(tag == "!!map")) |= sort_keys' sample.yml
```

#### 34.1.13 array_to_map

将数组转换为映射，使用索引作为键。

```yaml
# sample.yml
cool:
  - null
  - null
  - hello
```

```bash
yq '.cool |= array_to_map' sample.yml
# 输出:
# cool:
#   2: hello
```

---

### 34.2 数学函数

yq 支持完整的数学运算函数集。

#### 34.2.1 基本运算

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `+` | 加法/拼接/合并 | `.a + .b` |
| `-` | 减法/差集 | `.a - .b` |
| `*` | 乘法/深度合并 | `.a * .b` |
| `/` | 除法/字符串分割 | `.a / .b` |
| `%` | 取模 | `.a % .b` |

#### 34.2.2 数学函数

| 函数 | 说明 | 示例 |
|------|------|------|
| `pow(x; y)` | 幂运算 | `pow(.; 2)` |
| `sqrt` | 平方根 | `sqrt` |
| `round` | 四舍五入 | `round` |
| `floor` | 向下取整 | `floor` |
| `ceil` | 向上取整 | `ceil` |
| `fabs` | 绝对值 | `fabs` |
| `log` | 自然对数 | `log` |
| `log10` | 常用对数 | `log10` |
| `exp` | 指数 e^x | `exp` |
| `sin` | 正弦（弧度） | `sin` |
| `cos` | 余弦（弧度） | `cos` |
| `tan` | 正切（弧度） | `tan` |
| `asin` | 反正弦 | `asin` |
| `acos` | 反余弦 | `acos` |
| `atan` | 反正切 | `atan` |
| `atan2(y; x)` | 双参数反正切 | `atan2(.y; .x)` |

```bash
# 幂运算
yq --null-input '2 | pow(.; 3)'      # 8

# 平方根
yq --null-input '16 | sqrt'          # 4

# 三角函数
yq --null-input '3.1415926535 | sin'  # 近似 0

# 对数
yq --null-input '100 | log10'        # 2

# 绝对值
yq --null-input '-5 | fabs'          # 5

# 四舍五入
yq --null-input '3.7 | round'        # 4
yq --null-input '3.2 | floor'        # 3
yq --null-input '3.2 | ceil'         # 4
```

#### 34.2.3 min / max / min_by / max_by

| 函数 | 说明 | 示例 |
|------|------|------|
| `min` | 最小标量值 | `min` |
| `max` | 最大标量值 | `max` |
| `min_by(exp)` | 按表达式取最小元素 | `min_by(.age)` |
| `max_by(exp)` | 按表达式取最大元素 | `max_by(.age)` |

```yaml
# sample.yml
- 99
- 16
- 12
- 6
- 66
```

```bash
# 数字最小/最大
yq 'min' sample.yml      # 6
yq 'max' sample.yml      # 99

# 字符串按字母序
yq 'min' sample.yml      # 输入 [foo, bar, baz] -> bar
yq 'max' sample.yml      # 输入 [foo, bar, baz] -> foo
```

```yaml
# users.yml
- name: Alice
  age: 30
- name: Bob
  age: 25
- name: Charlie
  age: 35
```

```bash
# 按字段取最小/最大
yq 'min_by(.age)' users.yml   # {name: Bob, age: 25}
yq 'max_by(.age)' users.yml   # {name: Charlie, age: 35}
```

---

### 34.3 日期时间函数

yq 支持完整的日期时间解析和格式化。

| 函数 | 说明 | 示例 |
|------|------|------|
| `now` | 当前时间 | `now` |
| `format_datetime(format)` | 按格式格式化时间 | `format_datetime("2006-01-02")` |
| `from_unix` | Unix 时间戳转日期 | `from_unix` |
| `to_unix` | 日期转 Unix 时间戳 | `to_unix` |
| `tz(timezone)` | 时区转换 | `tz("Asia/Shanghai")` |
| `with_dtf(format; exp)` | 在指定日期格式上下文中执行 | `with_dtf("format"; .)` |

```bash
# 当前时间
yq --null-input 'now'
# 输出: 2024-01-15T10:30:00Z

# 格式化日期
yq --null-input 'now | format_datetime("2006-01-02 15:04:05")'
# 输出: 2024-01-15 10:30:00

# 时间戳转日期
yq --null-input '1675301929 | from_unix'
# 输出: 2023-02-02T02:38:49Z

# 日期转时间戳
yq --null-input 'now | to_unix'
# 输出: 1705315800

# 时区转换
yq --null-input 'now | tz("Asia/Shanghai") | format_datetime("2006-01-02 15:04:05")'
# 输出: 2024-01-15 18:30:00

# 日期运算
yq --null-input 'now | . + "24h" | format_datetime("2006-01-02")'
# 输出明天的日期
```

**日期格式模板（Go 语言 time 包格式）：**

| 格式符 | 含义 |
|--------|------|
| `2006` | 四位年份 |
| `01` | 两位月份 |
| `02` | 两位日期 |
| `15` | 小时（24小时制） |
| `04` | 分钟 |
| `05` | 秒 |
| `Mon` | 星期缩写 |
| `Monday` | 星期全称 |
| `MST` | 时区缩写 |
| `-07:00` | 时区偏移 |

---

### 34.4 类型过滤器

用于只选择特定类型的节点。

| 过滤器 | 说明 | 示例 |
|--------|------|------|
| `scalars` | 只保留标量值 | `.. \| scalars` |
| `arrays` | 只保留数组 | `.. \| arrays` |
| `objects` | 只保留对象/映射 | `.. \| objects` |
| `numbers` | 只保留数字 | `.. \| numbers` |
| `strings` | 只保留字符串 | `.. \| strings` |
| `booleans` | 只保留布尔值 | `.. \| booleans` |
| `iterables` | 只保留可迭代对象（数组+映射） | `.. \| iterables` |
| `nulls` | 只保留 null | `.. \| nulls` |

```bash
# 提取所有标量值
yq '.. | scalars' sample.yml

# 提取所有字符串
yq '.. | strings' sample.yml

# 提取所有数字并求和
yq '[.. | numbers] | add' sample.yml

# 检查是否有 null 值
yq '[.. | nulls] | length > 0' sample.yml
```

---

### 34.5 系统与调试函数

| 函数 | 说明 | 示例 |
|------|------|------|
| `debug` | 调试输出当前值到 stderr | `debug` |
| `error(msg)` | 抛出错误并停止执行 | `error("invalid value")` |
| `halt` | 立即停止求值 | `halt` |
| `builtins` | 列出所有内置函数 | `builtins` |
| `system(cmd; args)` | 执行外部命令（需 `--security-enable-system-operator`） | `system("echo"; "hello")` |

```bash
# 调试输出
yq '.items[] | debug | .name' sample.yml
# stderr 输出调试信息，stdout 正常输出 name

# 条件报错
yq '.value | if . > 100 then error("value too large") else . end' sample.yml

# 列出所有内置函数
yq 'builtins' --null-input

# 执行外部命令（需要显式启用）
yq --security-enable-system-operator '.result = system("date"; "+%Y-%m-%d")' sample.yml
```

---

## 35. 完整内置函数速查表

### A

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `add` / `+` | 加法/拼接/数组合并/对象浅合并 | `.a + .b` |
| `all` | 数组所有元素为 true | `all` |
| `all_c(exp)` | 条件 all | `all_c(. > 0)` |
| `alternative` / `//` | 默认值（null 时回退） | `.a // "default"` |
| `anchor` | 获取/设置锚点 | `.a \| anchor` |
| `any` | 数组任一元素为 true | `any` |
| `any_c(exp)` | 条件 any | `any_c(. > 0)` |
| `array_to_map` | 数组转映射（索引为键） | `array_to_map` |
| `as` | 变量绑定 | `.a as $x` |
| `ascii_downcase` | ASCII 转小写 | `ascii_downcase` |
| `ascii_upcase` | ASCII 转大写 | `ascii_upcase` |
| `asin` | 反正弦 | `asin` |
| `assign` / `=` | 绝对赋值 | `.a = "val"` |
| `atan` | 反正切 | `atan` |
| `atan2(y; x)` | 双参数反正切 | `atan2(.y; .x)` |

### B

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `base64` / `@base64` | Base64 编码 | `.a \| @base64` |
| `base64d` / `@base64d` | Base64 解码 | `.a \| @base64d` |
| `bool` | 布尔运算 | `true and false` |
| `builtins` | 列出内置函数 | `builtins` |

### C

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `capture(regex)` | 命名捕获组 | `capture("(?P<a>\w+)")` |
| `ceil` | 向上取整 | `ceil` |
| `collect` / `[]` | 收集到数组 | `[.a, .b]` |
| `column` | 获取节点列号 | `.a \| column` |
| `comment` | 注释操作 | `line_comment`, `head_comment`, `foot_comment` |
| `compare` | 比较运算 | `>`, `>=`, `<`, `<=` |
| `contains` | 包含检查 | `contains("sub")` |
| `cos` | 余弦 | `cos` |
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
| `endswith` | 字符串后缀检查 | `endswith("post")` |
| `entries` | entries 转换 | `to_entries`, `from_entries` |
| `equals` / `==` | 相等比较 | `.a == .b` |
| `error(msg)` | 抛出错误 | `error("msg")` |
| `eval` | 动态求值 | `eval(".a.b")` |
| `eval-all` / `ea` | 加载所有文档后求值 | `yq ea '.' *.yaml` |
| `exp` | 指数 e^x | `exp` |
| `explode` | 展开别名 | `explode(.)` |

### F

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `fabs` | 绝对值 | `fabs` |
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
| `gsub` | 全局替换 | `gsub("a"; "b")` |

### H

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `halt` | 停止求值 | `halt` |
| `has` | 检查键是否存在 | `has("key")` |
| `head_comment` | 头部注释 | `. head_comment="note"` |

### I

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `if-then-else` | 条件表达式 | `if .a then 1 else 0 end` |
| `in` | 检查值是否在数组中 | `.a in ["x","y"]` |
| `inside` | 检查是否为子集 | `[1,2] \| inside([1,2,3])` |
| `ireduce` | 迭代 reduce | `.[] as $i ireduce (0; . + $i)` |

### J

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `join` | 连接数组元素 | `join(", ")` |
| `json` / `@json` | JSON 编码 | `@json` |

### K

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `key` | 获取键名/索引 | `.a \| key` |
| `keys` | 获取所有键 | `keys` |
| `keys_unsorted` | 获取所有键（不排序） | `keys_unsorted` |
| `kind` | 获取节点基本类型 | `kind` |

### L

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `length` | 长度 | `length` |
| `limit` | 限制数量 | `limit(3; .[])` |
| `line` | 获取节点行号 | `.a \| line` |
| `line_comment` | 行尾注释 | `line_comment="note"` |
| `load` | 加载 YAML 文件 | `load("file.yml")` |
| `load_str` | 加载文件为字符串 | `load_str("file.txt")` |
| `load_xml` | 加载 XML 文件 | `load_xml("file.xml")` |
| `load_props` | 加载 Properties | `load_props("file.props")` |
| `load_base64` | 加载 Base64 文件 | `load_base64("file.b64")` |
| `log` | 自然对数 | `log` |
| `log10` | 常用对数 | `log10` |
| `ltrimstr` | 修剪左侧字符串 | `ltrimstr("pre")` |

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
| `numbers` | 类型过滤器：数字 | `.. \| numbers` |

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
| `rtrimstr` | 修剪右侧字符串 | `rtrimstr("post")` |

### S

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `scalars` | 类型过滤器：标量 | `.. \| scalars` |
| `select` | 条件过滤 | `select(.a > 1)` |
| `setpath` | 按路径设置 | `setpath(["a","b"]; "val")` |
| `sh` / `@sh` | Shell 编码 | `@sh` |
| `shuffle` | 随机打乱数组 | `shuffle` |
| `sin` | 正弦 | `sin` |
| `sort` | 排序 | `sort` |
| `sort_by` | 按表达式排序 | `sort_by(.name)` |
| `sort_keys` | 按键排序映射 | `sort_keys(.)` |
| `split` | 字符串分割 | `split(";")` |
| `split_doc` | 拆分为文档 | `.[] \| split_doc` |
| `sqrt` | 平方根 | `sqrt` |
| `startswith` | 字符串前缀检查 | `startswith("pre")` |
| `strenv(NAME)` | 读取环境变量（字符串） | `strenv(MYVAR)` |
| `strings` | 类型过滤器：字符串 | `.. \| strings` |
| `style` | 样式控制 | `style="double"` |
| `sub` | 正则替换 | `sub("old"; "new")` |
| `subtract` / `-` | 减法/数组差集 | `.a - .b` |
| `system` | 执行外部命令 | `system("cmd"; "arg")` |

### T

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `tag` | 获取/设置标签 | `tag` |
| `tan` | 正切 | `tan` |
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
| `utf8bytelength` | UTF-8 字节长度 | `utf8bytelength` |

### V

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `values` | 获取映射值 | `values` |

### W

| 函数/运算符 | 说明 | 示例 |
|------------|------|------|
| `with` | 上下文操作 | `with(.a; . = "val")` |
| `with_dtf` | 指定日期格式 | `with_dtf("format"; .)` |
| `with_entries` | entries 批量操作 | `with_entries(.key \| upcase)` |

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

## 36. 与 jq 对比迁移指南

### 36.1 语法对照表

| 操作 | jq | yq | 说明 |
|------|-----|-----|------|
| 读取字段 | `.foo` | `.foo` | 相同 |
| 读取嵌套 | `.foo.bar` | `.foo.bar` | 相同 |
| 数组索引 | `.[0]` | `.[0]` | 相同 |
| 数组切片 | `.[1:3]` | `.[1:3]` | 相同 |
| 迭代 | `.[]` | `.[]` | 相同 |
| 管道 | `\|` | `\|` | 相同 |
| 选择 | `select(.foo == "bar")` | `select(.foo == "bar")` | 相同 |
| 赋值 | `.foo = "bar"` | `.foo = "bar"` | 相同 |
| 相对赋值 | `.foo \|= . + 1` | `.foo \|= . + 1` | 相同 |
| 删除 | `del(.foo)` | `del(.foo)` | 相同 |
| 键 | `keys` | `keys` | 相同 |
| 长度 | `length` | `length` | 相同 |
| 类型 | `type` | `tag` / `type` | yq 用 `tag` |
| 排序 | `sort_by(.foo)` | `sort_by(.foo)` | 相同 |
| 去重 | `unique` | `unique` | 相同 |
| 正则 | `test("foo")` | `test("foo")` | 相同 |
| 捕获 | `capture("(?<a>\w+)")` | `capture("(?P<a>\w+)")` | yq 用 `?P<name>` |
| 环境变量 | 不支持 | `env(NAME)` | yq 特有 |
| 文件加载 | 不支持 | `load("file.yml")` | yq 特有 |
| 样式控制 | 不支持 | `style="double"` | yq 特有 |
| 注释操作 | 不支持 | `line_comment` | yq 特有 |
| 锚点/别名 | 不支持 | `anchor` / `alias` | yq 特有 |
| 扁平化 | `flatten` | `flatten` | 相同 |
| 分组 | `group_by` | `group_by` | 相同 |
| 反转 | `reverse` | `reverse` | 相同 |
| 取第一个 | `first` | `first` | 相同 |
| 过滤 | `map(select(exp))` | `filter(exp)` | yq 有 filter |
| 包含 | `contains` | `contains` | 相同 |
| 随机打乱 | 不支持 | `shuffle` | yq 特有 |
| 矩阵转置 | 不支持 | `pivot` | yq 特有 |
| 选择键 | 不支持 | `pick(["a","b"])` | yq 特有 |
| 排除键 | 不支持 | `omit(["a","b"])` | yq 特有 |
| 行号 | 不支持 | `line` | yq 特有 |
| 列号 | 不支持 | `column` | yq 特有 |
| 节点类型 | `type` | `kind` | yq 用 `kind` |
| 父节点 | `..` | `parent` / `parents` | yq 特有 |
| 路径数组 | `path(..)` | `path` | 相同 |
| 按路径获取 | `getpath(path)` | `getpath(["a","b"])` | 相同 |
| 按路径设置 | `setpath(path; val)` | `setpath(["a","b"]; val)` | 相同 |
| 数学函数 | `acos`/`sin`/`log` | `acos`/`sin`/`log` | 相同 |
| 日期函数 | `now` | `now`/`format_datetime` | yq 特有 |
| 调试 | `debug` | `debug` | 相同 |
| 类型过滤 | `scalars`/`arrays` | `scalars`/`arrays` | 相同 |

### 36.2 jq 用户常见陷阱

**陷阱 1：YAML 是类型敏感的**

```bash
# jq 中 "true" 和 true 在 JSON 中一样
# yq 中 YAML 会区分字符串和布尔值
yq --null-input '.a = "true"'   # a: "true"（字符串）
yq --null-input '.a = true'     # a: true（布尔）
```

**陷阱 2：多文档**

```bash
# jq 只处理单个 JSON 文档
# yq 可以处理多个 YAML 文档（用 --- 分隔）
yq 'select(di == 0)' multi-doc.yaml  # 选择第一个文档
```

**陷阱 3：注释保留**

```bash
# jq 不保留注释（JSON 没有注释）
# yq 会尽量保留 YAML 注释
yq -i '.foo = "bar"' file.yaml  # 注释会被保留
```

**陷阱 4：Merge 键（<<）**

```bash
# YAML 特有的 Merge 键在 jq 中不存在
# yq 支持 YAML 的锚点和别名合并
yq '.foobar.a' sample.yml  # 可以读取通过 << 合并的字段
```

### 36.3 从 jq 迁移的实用技巧

```bash
# jq 脚本基本可以直接用于 yq（处理 JSON 时）
cat data.json | jq '.items[] | select(.active)'
# 等价于
cat data.json | yq -p json '.items[] | select(.active)'

# 将 jq 表达式保存为文件复用
echo '.items[] | select(.active) | .name' > query.yq
yq --from-file query.yq data.yaml
```

---

## 37. 性能优化与大数据处理

### 37.1 大文件处理策略

```bash
# 对于超大 YAML 文件（>100MB），避免使用递归操作
# 慢：递归遍历整个文档
yq '.. | select(has("image")).image' large-file.yaml

# 快：只遍历已知路径
yq '.spec.template.spec.containers[].image' large-file.yaml

# 如果只需要特定字段，使用精确路径
yq '.items[].metadata.name' large-file.yaml
```

### 37.2 管道优化

```bash
# 避免多次读取同一文件
# 差：
yq '.items' file.yaml | yq '.[] | select(.active)' | yq '.name'

# 好：
yq '.items[] | select(.active) | .name' file.yaml

# 使用 eval-all 处理多个文件时，注意内存使用
yq eval-all '.[] | select(.active)' *.yaml  # 所有文件加载到内存
```

### 37.3 内存优化

```bash
# 对于超大数据集，考虑分批处理
for f in *.yaml; do
  yq -i '.items[] |= select(.active)' "$f"
done

# 使用 split 将大文档拆分为小文件
yq '.items[] | split_doc' large-file.yaml | split -l 1 - item-
```

### 37.4 原地更新的性能

```bash
# -i 会创建临时文件然后替换原文件
# 对于频繁更新的场景，考虑批量操作

# 差：多次打开关闭文件
yq -i '.a = 1' file.yaml
yq -i '.b = 2' file.yaml
yq -i '.c = 3' file.yaml

# 好：一次完成所有更新
yq -i '.a = 1 | .b = 2 | .c = 3' file.yaml
```

---

## 38. 常见陷阱与故障排除

### 38.1 引号地狱（Shell 转义）

**问题：** 表达式中的引号与 Shell 引号冲突

```bash
# 错误：Shell 会解析内部引号
yq '.message = "He said "hello""' file.yaml

# 解决方案 1：使用单引号包裹，双引号在内部
yq '.message = "He said \"hello\""' file.yaml

# 解决方案 2：使用转义
yq ".message = \"He said \\\"hello\\\"\"" file.yaml

# 解决方案 3：使用环境变量
MESSAGE='He said "hello"' yq -i '.message = strenv(MESSAGE)' file.yaml

# 解决方案 4：从文件读取表达式
# expression.yq: .message = "He said \"hello\""
yq --from-file expression.yq file.yaml
```

### 38.2 注释和空白丢失

**问题：** 更新后注释位置变化或丢失

```bash
# yq 基于 go-yaml v3，会尽力保留注释，但以下场景可能丢失：
# 1. 删除节点后，依附于该节点的注释可能消失
# 2. 大幅重构文档结构时，注释位置可能偏移
# 3. 使用 sort 或 unique 后，注释通常不保留

# 建议：在 CI 流水线中，如果注释很重要，先备份
cp important.yaml important.yaml.bak
yq -i '.version = "2.0"' important.yaml

# 或者使用特定版本测试
yq --version  # 确保版本一致
```

### 38.3 布尔值解析差异

**问题：** YAML 1.1 和 YAML 1.2 的布尔值不同

```bash
# YAML 1.1（旧标准）：yes/no/on/off/TRUE/FALSE 都是布尔值
# YAML 1.2（yq 使用）：只有 true/false 是布尔值

# 这意味着：
yq --null-input '.a = yes'   # Error: unknown name "yes"
yq --null-input '.a = true'  # a: true

# 如果需要字符串 "yes"，显式加引号
yq --null-input '.a = "yes"'  # a: "yes"

# 或者使用 strenv
VALUE=yes yq --null-input '.a = strenv(VALUE)'  # a: "yes"
```

### 38.4 Merge 锚点行为

**问题：** YAML Merge 键（`<<`）的行为可能与预期不同

```yaml
# sample.yml
base: &base
  a: 1
  b: 2
derived:
  <<: *base
  b: 3
```

```bash
# 默认行为
yq '.derived' sample.yml
# 输出: {a: 1, b: 3}

# 如果需要符合 YAML 规范的合并行为
yq --yaml-fix-merge-anchor-to-spec '.derived' sample.yml
```

### 38.5 数字被解析为科学计数法

**问题：** 大数字可能被错误解析

```bash
# 问题：12345678901234567890 可能被截断
# 解决方案：转为字符串
yq '.big_number tag = "!!str"' file.yaml

# 或者在输入时就作为字符串
yq --null-input '.id = "12345678901234567890"'
```

### 38.6 空值与 null 的区别

```bash
# YAML 中以下都是 null：
# key:        # 空值
# key: ~      # 显式 null
# key: null   # 字符串 null（除非不带引号）

yq --null-input '.a = null'    # a: null（真正的 null）
yq --null-input '.a = "null"'  # a: "null"（字符串）
yq --null-input '.a = ~'      # a: null（YAML 的 null 别名）

# 检查 null
yq '.a == null' file.yaml
yq '.a // "default"' file.yaml  # 如果为 null 则使用默认值
```

### 38.7 数组索引越界

```bash
# 访问不存在的数组索引会返回 null（不会报错）
yq '.[100]' sample.yml  # null

# 但如果数组本身不存在，会报错
yq '.nonexistent[0]' sample.yml  # Error: Cannot index ...

# 使用可选访问避免报错
yq '.nonexistent?[0]?' sample.yml  # null
```

### 38.8 原地更新文件权限

```bash
# yq -i 会保留原文件的权限和所有者
# 但如果文件是只读的，会报错
chmod +w file.yaml
yq -i '.version = "2.0"' file.yaml
```

---

## 39. 附录：速查表

### A. 读取值

```bash
yq '.key' file.yaml
yq '.nested.key' file.yaml
yq '.array[0]' file.yaml
yq '.array[].field' file.yaml
yq '.["key-with-dots"]' file.yaml
yq '.["key with spaces"]' file.yaml
yq '.[.dynamic_key]' file.yaml      # 动态键
yq '.a?.b?.c?' file.yaml            # 安全访问
yq '.a.b.c | parent' file.yaml      # 父节点
yq '.a.b.c | path' file.yaml        # 路径数组
yq 'getpath(["a","b"])' file.yaml   # 按路径获取
```

### B. 更新值

```bash
yq -i '.key = "value"' file.yaml
yq -i '.nested.key |= . + 1' file.yaml
yq -i '(.array[] | select(.name == "x")).field = "y"' file.yaml
yq -i '(.a, .b, .c) = "same"' file.yaml
yq -i '.new.path.nested = "value"' file.yaml  # 自动创建路径
yq -i 'setpath(["a","b"]; "value")' file.yaml # 按路径设置
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
yq '. *d load("file2.yml")' file1.yml  # 深度合并
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
yq '1 in [1,2,3]'                       file.yaml # 成员检查
yq 'filter(. > 3)'                      file.yaml # 过滤数组
yq 'first(.name == "cat")'              file.yaml # 第一个匹配
yq '[1,2] | inside([1,2,3])'            file.yaml # 子集检查
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
yq '.[]'                   file.yaml # 迭代
yq 'pivot'                 file.yaml # 矩阵转置
yq 'unique'                file.yaml # 去重
yq '.[1:5]'                file.yaml # 切片
yq 'length'                file.yaml # 长度
yq 'flatten'               file.yaml # 扁平化
yq 'shuffle'               file.yaml # 随机打乱
yq '.[0, 2, 4]'            file.yaml # 多选
yq '[range(5)]'            file.yaml # 生成序列
yq '.[] |= . * 2'          file.yaml # 批量更新
yq 'filter(. > 3)'         file.yaml # 过滤
yq 'limit(3; .[])'         file.yaml # 限制数量
yq 'sort_by(.name)'        file.yaml # 排序
yq 'pick(["a","b"])'       file.yaml # 选择键
yq 'omit(["a","b"])'       file.yaml # 排除键
yq 'unique_by(.name)'      file.yaml # 按字段去重
yq 'map_values(. + 1)'     file.yaml # 映射值
yq 'group_by(.category)'   file.yaml # 分组
yq 'map(.field = "value")' file.yaml # 映射
yq 'first(.name == "cat")' file.yaml # 第一个匹配
yq 'reverse | unique_by(.name) | reverse' file.yaml  # 保留最新
```

### J. 字符串操作

```bash
yq '. | upcase' file.yaml
yq '. | downcase' file.yaml
yq '. | trim' file.yaml
yq '. | sub("old"; "new")' file.yaml
yq '. | gsub("a"; "b")' file.yaml
yq 'join(", ")' file.yaml
yq 'split(";")' file.yaml
yq 'capture("(?P<a>\w+)-(?P<n>\d+)")' file.yaml
yq 'test("pattern"; "i")' file.yaml   # 正则测试
yq '.[0:5]' file.yaml                 # 字符串切片
yq '"hello" | utf8bytelength' file.yaml # UTF-8 字节长度
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
yq '... comments=""' file.yaml        # 删除所有注释
```

### M. 锚点与别名

```bash
yq '.a | anchor' file.yaml
yq '.a | alias' file.yaml
yq 'explode(.)' file.yaml             # 展开所有别名
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
yq '.a + .b' file.yaml      # 加法
yq '.a - .b' file.yaml      # 减法
yq '.a * .b' file.yaml      # 乘法
yq '.a / .b' file.yaml      # 除法
yq '.a % .b' file.yaml      # 取模
yq '.a | pow(.; 2)' file.yaml  # 幂运算
yq '.a | sqrt' file.yaml    # 平方根
yq '.a | min' file.yaml     # 最小值
yq '.a | max' file.yaml     # 最大值
yq 'min_by(.age)' file.yaml # 按字段取最小
yq 'max_by(.age)' file.yaml # 按字段取最大
yq '.a | round' file.yaml   # 四舍五入
yq '.a | floor' file.yaml   # 向下取整
yq '.a | ceil' file.yaml    # 向上取整
yq '.a | fabs' file.yaml    # 绝对值
yq '.a | log' file.yaml     # 自然对数
yq '.a | log10' file.yaml   # 常用对数
yq '.a | exp' file.yaml     # 指数
yq '.a | sin' file.yaml     # 正弦
yq '.a | cos' file.yaml     # 余弦
yq '.a | acos' file.yaml    # 反余弦
yq '.a += 1' file.yaml      # 自增
yq '.a -= 1' file.yaml      # 自减
```

### Q. 日期时间

```bash
yq --null-input 'now'                    # 当前时间
yq 'now | format_datetime("2006-01-02")' file.yaml  # 格式化
yq '1675301929 | from_unix' file.yaml   # 时间戳转日期
yq 'now | to_unix' file.yaml            # 日期转时间戳
yq 'now | tz("Asia/Shanghai")' file.yaml # 时区转换
```

### R. 比较与默认值

```bash
yq '.a == .b' file.yaml       # 相等
yq '.a != .b' file.yaml       # 不等
yq '.a > .b' file.yaml        # 大于
yq '.a >= .b' file.yaml       # 大于等于
yq '.a < .b' file.yaml        # 小于
yq '.a <= .b' file.yaml       # 小于等于
yq '.a // "default"' file.yaml # 默认值（null/false 时回退）
```

### S. 逻辑运算

```bash
yq '.a and .b' file.yaml    # 与
yq '.a or .b' file.yaml     # 或
yq '.a | not' file.yaml     # 非
yq 'any' file.yaml          # 任一 true
yq 'all' file.yaml          # 全部 true
```

### T. 文档与文件索引

```bash
yq 'select(di == 0)' file.yaml      # 选择第一个文档
yq 'select(fi == 0)' file1.yaml file2.yaml  # 选择第一个文件
yq '.[] | split_doc' file.yaml      # 拆分为多文档
```

### U. 节点元信息

```bash
yq '.a | line' file.yaml              # 行号
yq '.a | column' file.yaml            # 列号
yq '.a | key | line' file.yaml        # 键的行号
yq 'is_key' file.yaml                 # 是否为键节点
yq 'filename' file.yaml               # 文件名
yq 'fi' file.yaml                     # 文件索引
yq 'di' file.yaml                     # 文档索引
```

### V. 动态求值与系统

```bash
yq 'eval(".a.b")' file.yaml            # 动态求值
yq 'error("msg")' file.yaml            # 报错
yq 'halt' file.yaml                    # 停止
yq 'builtins' file.yaml                # 内置函数列表
yq 'debug' file.yaml                   # 调试输出
yq 'system("cmd"; "arg")' file.yaml    # 外部命令（需 --security-enable-system-operator）
```

### W. 类型过滤器

```bash
yq '.. | scalars' file.yaml     # 只保留标量
yq '.. | arrays' file.yaml      # 只保留数组
yq '.. | objects' file.yaml     # 只保留对象
yq '.. | numbers' file.yaml     # 只保留数字
yq '.. | strings' file.yaml     # 只保留字符串
yq '.. | booleans' file.yaml    # 只保留布尔
yq '.. | iterables' file.yaml   # 只保留可迭代
yq '.. | nulls' file.yaml       # 只保留 null
```

### X. 系统与调试

```bash
yq 'debug' file.yaml            # 调试输出
yq 'builtins' file.yaml         # 列出内置函数
yq 'error("msg")' file.yaml     # 抛出错误
yq 'halt' file.yaml             # 停止求值
```

### Y. GitHub Action 使用

```yaml
- name: Set foobar to cool
  uses: mikefarah/yq@master
  with:
    cmd: yq -i '.foo.bar = "cool"' 'config.yml'

- name: Get an entry
  id: get_username
  uses: mikefarah/yq@master
  with:
    cmd: yq '.all.children.["${{ matrix.ip_address }}"].username' inventory.yml

- name: Reuse variable
  run: echo ${{ steps.get_username.outputs.result }}
```

---

> **官方文档**: https://mikefarah.gitbook.io/yq
>
> **GitHub**: https://github.com/mikefarah/yq
