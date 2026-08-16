# yq 完全使用手册（增强实战版）

> 基于 [mikefarah/yq](https://mikefarah.gitbook.io/yq) v4.40+ 官方文档整理并深度扩展
> 
> yq 是一个轻量级、可移植的命令行 YAML/JSON/XML/INI/Properties/CSV/TSV/TOML/HCL 处理器，使用类似 jq 的表达式语法。

---

## 目录

1. [安装与版本管理](#1-安装与版本管理)
2. [基础用法与核心概念](#2-基础用法与核心概念)
3. [命令行参数详解](#3-命令行参数详解)
4. [读取与遍历（导航）](#4-读取与遍历导航)
5. [赋值与更新](#5-赋值与更新)
6. [条件过滤](#6-条件过滤)
7. [删除操作](#7-删除操作)
8. [管道与组合](#8-管道与组合)
9. [变量与作用域](#9-变量与作用域)
10. [环境变量集成](#10-环境变量集成)
11. [合并操作](#11-合并操作)
12. [递归下降](#12-递归下降)
13. [排序与去重](#13-排序与去重)
14. [键操作](#14-键操作)
15. [长度与计数](#15-长度与计数)
16. [字符串操作](#16-字符串操作)
17. [布尔与逻辑运算](#17-布尔与逻辑运算)
18. [样式控制](#18-样式控制)
19. [标签与类型](#19-标签与类型)
20. [注释操作](#20-注释操作)
21. [锚点与别名](#21-锚点与别名)
22. [加载外部文件](#22-加载外部文件)
23. [编码与解码](#23-编码与解码)
24. [多文档处理](#24-多文档处理)
25. [格式转换](#25-格式转换)
26. [Reduce 与函数式操作](#26-reduce-与函数式操作)
27. [With 与 Entries 操作](#27-with-与-entries-操作)
28. [拆分为文档](#28-拆分为文档)
29. [加法与数值运算](#29-加法与数值运算)
30. [实战专题：Kubernetes 与容器配置](#30-实战专题kubernetes-与容器配置)
31. [实战专题：CI/CD 与配置管理](#31-实战专题cicd-与配置管理)
32. [实战专题：Docker Compose 管理](#32-实战专题docker-compose-管理)
33. [与 jq 对比迁移指南](#33-与-jq-对比迁移指南)
34. [性能优化与大数据处理](#34-性能优化与大数据处理)
35. [Shell 集成技巧](#35-shell-集成技巧)
36. [PowerShell 使用指南](#36-powershell-使用指南)
37. [常见陷阱与故障排除](#37-常见陷阱与故障排除)
38. [附录：速查表](#38-附录速查表)

---

## 1. 安装与版本管理

### 1.1 二进制下载（推荐生产环境）

```bash
# Linux AMD64 - 最新稳定版
sudo wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
sudo chmod +x /usr/local/bin/yq

# 验证安装
yq --version
# 输出类似: yq version 4.40.7

# 下载特定版本（适合需要版本锁定的场景）
VERSION=v4.40.7
PLATFORM=linux_amd64
wget "https://github.com/mikefarah/yq/releases/download/${VERSION}/yq_${PLATFORM}.tar.gz" -O - | tar xz
sudo mv yq_${PLATFORM} /usr/local/bin/yq
```

**架构对照表：**

| 平台 | 文件名 |
|------|--------|
| Linux AMD64 | `yq_linux_amd64` |
| Linux ARM64 | `yq_linux_arm64` |
| Linux 386 | `yq_linux_386` |
| macOS AMD64 | `yq_darwin_amd64` |
| macOS ARM64 (M1/M2) | `yq_darwin_arm64` |
| Windows | `yq_windows_amd64.exe` |

### 1.2 包管理器安装

```bash
# macOS / Linux (Homebrew) - 最方便
brew install yq

# Linux (Snap)
sudo snap install yq

# Arch Linux
sudo pacman -S go-yq

# Alpine Linux (v3.20+)
apk add yq-go

# Windows (Chocolatey)
choco install yq

# Windows (Scoop)
scoop install main/yq

# Windows (Winget)
winget install --id MikeFarah.yq

# Go 安装（适合 Go 开发者）
go install github.com/mikefarah/yq/v4@latest
```

### 1.3 Docker / Podman（无需本地安装）

```bash
# 一次性使用当前目录
docker run --rm -v "${PWD}":/workdir mikefarah/yq '.a.b[0].c' file.yaml

# 管道输入（注意 -i 参数）
cat file.yaml | docker run -i --rm mikefarah/yq '.this.thing'

# 交互式 Shell
docker run --rm -it -v "${PWD}":/workdir --entrypoint sh mikefarah/yq

# 安全模式（限制权限，适合 CI）
docker run --rm --security-opt=no-new-privileges --cap-drop all --network none \
  -v "${PWD}":/workdir mikefarah/yq '.a.b[0].c' file.yaml
```

**Bash 函数简化（添加到 `~/.bashrc`）：**

```bash
yq() {
  docker run --rm -i -v "${PWD}":/workdir mikefarah/yq "$@"
}
```

### 1.4 版本管理建议

```bash
# 在 CI 中锁定版本，避免行为差异
YQ_VERSION="v4.40.7"
curl -sL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o yq
chmod +x yq
./yq --version
```

### 1.5 版本兼容性说明

yq v4 是一次重大重构，与 v3 完全不兼容。v4 采用类似 jq 的表达式语法，而 v3 使用类似 `yq read/write` 的命令式语法。如果你维护使用 v3 的老项目，建议：

1. 逐步迁移到 v4（v3 已不再维护）
2. 在迁移期间使用 `yq4` 别名区分版本
3. 参考官方迁移指南：https://mikefarah.gitbook.io/yq/upgrading-from-v3

---

## 2. 基础用法与核心概念

### 2.1 基本模式

```bash
yq [全局选项] [命令] [表达式] [文件...]
```

### 2.2 核心概念

yq 的表达式语法继承自 **jq**，但有以下关键差异：

| 概念 | 说明 |
|------|------|
| **文档 (Document)** | YAML 文件可能包含多个 `---` 分隔的文档 |
| **节点 (Node)** | YAML 中的每个值都是一个带标签的节点 |
| **标量 (Scalar)** | 字符串、数字、布尔、null |
| **序列 (Sequence)** | 数组/列表，对应 JSON 的 `[]` |
| **映射 (Mapping)** | 对象/字典，对应 JSON 的 `{}` |
| **上下文 (Context)** | 管道 `|` 左侧的输出成为右侧的输入 |

### 2.3 快速示例

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

### 2.4 命令说明

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


---

## 3. 命令行参数详解

### 3.1 输入输出控制

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

### 3.2 输入格式支持（`-p`）

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

### 3.3 输出格式支持（`-o`）

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

### 3.4 颜色控制

```bash
yq -C '.a' file.yaml      # 强制彩色（即使管道）
yq -M '.a' file.yaml      # 强制无颜色（适合重定向）
```

### 3.5 安全参数

| 参数 | 说明 |
|------|------|
| `--security-disable-env-ops` | 禁用 `env()`, `strenv()`, `envsubst` |
| `--security-disable-file-ops` | 禁用 `load`, `load_str` 等文件操作 |

**在不可信输入环境中使用：**

```bash
# 如果处理用户提供的 YAML，禁用文件/环境操作防止信息泄露
yq --security-disable-file-ops --security-disable-env-ops '.' untrusted.yaml
```

### 3.6 XML 参数

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

### 3.7 CSV/TSV 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--csv-separator` | `,` | CSV 分隔符 |
| `--csv-auto-parse` | `true` | 自动解析嵌套 YAML/JSON 值 |

```bash
# 使用分号分隔的 CSV
yq -p csv --csv-separator=";" '.[0].name' data.csv
```

---

## 4. 读取与遍历（导航）

### 4.1 基本导航

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

### 4.2 数组访问

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

### 4.3 展开操作（Splat）

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
# ---
# c: banana
# ---
# d: cherry

# 展开映射的所有值
yq '.a[]' sample.yml      # 如果 a 是对象，输出所有值

# 递归展开所有值
yq '.. | select(scalar)' sample.yml
```

### 4.4 特殊键名访问

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

### 4.5 动态键访问（间接引用）

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

### 4.6 可选访问（避免 null 报错）

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

### 4.7 通配符键匹配

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
yq '.a."*g"' sample.yml   # 输出: things
```

### 4.8 锚点和别名处理

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

### 4.9 Merge 锚点（YAML 继承）

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

---

## 5. 赋值与更新

### 5.1 两种赋值形式（核心区别）

| 形式 | 符号 | 说明 | RHS 上下文 |
|------|------|------|-----------|
| 绝对赋值 | `=` | RHS 在**原始文档**上下文中运行 | 原始文档根 |
| 相对赋值 | `|=` | RHS 在**每个 LHS 结果**上下文中运行 | 当前节点 |

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

### 5.2 基本赋值

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

### 5.3 相对赋值（基于旧值更新）

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

### 5.4 更新为子节点值

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

### 5.5 更新为兄弟节点值

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

### 5.6 多路径同时更新

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

### 5.7 数组元素更新

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

### 5.8 深层选择更新（重要陷阱！）

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

### 5.9 数组元素批量运算

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

### 5.10 从其他文件更新

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

### 5.11 保留锚点更新

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

### 5.12 自定义类型处理

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

### 5.13 空对象自动创建路径

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

## 6. 条件过滤

### 6.1 基本 Select

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

### 6.2 包含匹配

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

### 6.3 正则匹配

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

### 6.4 复合条件

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

### 6.5 数组中查找并更新

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

### 6.6 存在性检查

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

---

## 7. 删除操作

### 7.1 删除映射键

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

### 7.2 删除嵌套键

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

### 7.3 删除数组元素

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

### 7.4 删除嵌套数组元素

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

### 7.5 删除匹配项

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

### 7.6 递归删除匹配键

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

### 7.7 安全删除（仅当存在时）

```bash
# 如果 .temp 存在则删除，否则不报错
yq 'del(.temp?)' sample.yml

# 递归删除所有 null 值
yq 'del(.. | select(. == null))' sample.yml
```

---

## 8. 管道与组合

### 8.1 基本管道

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

### 8.2 多更新管道

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

### 8.3 复杂管道

```bash
# 读取 -> 过滤 -> 转换 -> 格式化
yq '.items[] | select(.active) | .name | upcase' config.yml

# 构建新对象
yq '.users[] | {"name": .name, "email": .contact.email}' data.yml
```

---

## 9. 变量与作用域

### 9.1 单值变量

```yaml
# sample.yml
a: cat
```

```bash
yq '.a as $foo | $foo' sample.yml     # 输出: cat

# 变量在后续管道中使用
yq '.a as $animal | .b as $sound | "The \($animal) says \($sound)"' sample.yml
```

### 9.2 多值变量（迭代）

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

### 9.3 变量作为查找表

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

### 9.4 交换值

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

### 9.5 引用路径（ref）

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

### 9.6 变量作用域规则

```bash
# 变量在定义后的整个表达式中可用
yq '.a as $x | .b | .c = $x' sample.yml

# 但在子表达式中重新定义会遮蔽外层
yq '.a as $x | (.b as $x | $x) | $x' sample.yml  # 最后 $x 仍是 .a
```

---

## 10. 环境变量集成

### 10.1 三种环境变量操作符

| 操作符 | 说明 | 使用场景 |
|--------|------|----------|
| `env(NAME)` | 解析为 YAML 节点（自动识别类型） | 布尔值、数字、对象 |
| `strenv(NAME)` | 始终解析为字符串 | 版本号、ID、密码 |
| `envsubst` | 字符串中插值 `${VAR}` | 模板字符串 |

### 10.2 env() - 自动类型识别

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

### 10.3 strenv() - 始终作为字符串

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

### 10.4 动态路径更新

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

### 10.5 动态键查找

```yaml
# sample.yml
cat: meow
dog: woof
```

```bash
myenv="cat" yq '.[env(myenv)]' sample.yml
# 输出: meow
```

### 10.6 envsubst - 字符串插值

```bash
myenv="cat" other="red" yq --null-input '"the ${myenv} is ${other}" | envsubst'
# 输出: the cat is red

# 在现有文档中使用
myenv="production" yq '.environment = "deploy-to-${myenv}" | .environment |= envsubst' sample.yml
```

### 10.7 envsubst 高级选项

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
```

### 10.8 文档中批量替换环境变量

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

### 10.9 安全最佳实践

```bash
# 在 CI 中，如果不希望 yq 访问环境变量
yq --security-disable-env-ops '.' file.yaml

# 或者显式只传入需要的变量
DB_HOST=localhost yq '.host = strenv(DB_HOST)' file.yaml
```

---

## 11. 合并操作

### 11.1 合并标志速查

| 标志 | 说明 | 示例 |
|------|------|------|
| `*` | 基本合并 | `.a * .b` |
| `+` | 追加数组 | `.a *+ .b` |
| `d` | 深度合并数组 | `.a *d .b` |
| `?` | 仅合并已有字段 | `.a *? .b` |
| `n` | 仅合并新字段 | `.a *n .b` |
| `c` | 覆盖自定义标签 | `.a *c .b` |

### 11.2 基本对象合并

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

### 11.3 合并两个文件

```bash
# file1.yml 为基础，file2.yml 覆盖/补充
yq '. *= load("file2.yml")' file1.yml

# 深度合并
yq '. *d load("file2.yml")' file1.yml
```

### 11.4 合并所有文件

```bash
# 合并当前目录所有 yaml，后面的文件优先
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml

# 简写
yq ea '. as $item ireduce ({}; . * $item )' *.yml
```

### 11.5 仅合并已有字段（补丁模式）

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

### 11.6 仅合并新字段（安全添加）

```bash
yq '.a *n .b' sample.yml
# 输出:
# thing: one      # 已存在，保持原值
# cat: frog       # 已存在，保持原值
# missing: two    # 新字段，添加
```

### 11.7 追加数组

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

### 11.8 深度合并数组（按索引合并）

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

### 11.9 数值乘法合并

```yaml
# sample.yml
a: 3
b: 4
```

```bash
yq '.a *= .b' sample.yml    # 输出: a: 12
```

### 11.10 字符串重复

```bash
yq '.b * 4' sample.yml      # 假设 b: banana，输出 banana 重复 4 次
yq '4 * .b' sample.yml      # 同上（乘法交换律）
```

---

## 12. 递归下降

### 12.1 基本递归

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

### 12.2 递归查找并更新

```bash
# 查找所有包含 "image" 的字段并统一更新
yq -i '(.. | select(has("image"))).image = "nginx:latest"' deployment.yaml

# 递归删除所有 difficulty 字段
yq -i 'del(.. | .difficulty?)' question-file.yml

# 递归更新所有 name 字段为大写
yq -i '(.. | select(has("name")).name) |= upcase' data.yaml
```

### 12.3 递归设置样式

```bash
# 所有值用双引号
yq '.. style="double"' sample.yml

# 键和值都用双引号
yq '... style="double"' sample.yml

# 所有字符串转为字面量块
yq '(.. | select(tag == "!!str")) style="literal"' sample.yml
```

### 12.4 递归类型转换

```bash
# 将所有整数转为字符串（防止科学计数法等问题）
yq '(.. | select(tag == "!!int")) tag = "!!str"' sample.yml

# 将所有 "true"/"false" 字符串转为布尔
yq '(.. | select(. == "true" or . == "false")) |= (. == "true")' sample.yml
```

---

## 13. 排序与去重

### 13.1 数组排序

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

### 13.2 多字段排序

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

### 13.3 降序排序

```bash
yq 'sort_by(.a) | reverse' sample.yml

# 或者使用负数（数字字段）
yq 'sort_by(-.age)' users.yml
```

### 13.4 映射排序（按键）

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

### 13.5 原地排序

```bash
yq '.cool |= sort_by(.a)' sample.yml
```

### 13.6 自定义日期排序

```bash
yq 'with_dtf("02-Jan-2006"; sort_by(.date))' sample.yml
```

### 13.7 标量数组去重

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

### 13.8 对象数组去重（按字段）

```bash
# 按 name 字段去重（保留第一个）
yq 'unique_by(.name)' users.yml
```

---

## 14. 键操作

### 14.1 获取键名

```yaml
# sample.yml
a: thing
```

```bash
yq '.a | key' sample.yml     # 输出: a
```

### 14.2 获取数组索引

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.[1] | key' sample.yml   # 输出: 1
```

### 14.3 重命名键

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

### 14.4 获取所有键

```bash
yq 'keys' sample.yml         # 顶层键
yq '.a | keys' sample.yml    # .a 的键
```

### 14.5 键名批量修改

```bash
# 添加前缀
yq 'with_entries(.key |= "prefix_" + .)' sample.yml

# 替换键名中的字符
yq 'with_entries(.key |= sub("-"; "_"))' sample.yml

# 递归修改所有键
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= upcase)' sample.yml
```

---

## 15. 长度与计数

### 15.1 字符串长度

```yaml
# sample.yml
a: cat
```

```bash
yq '.a | length' sample.yml    # 输出: 3
```

### 15.2 映射长度

```bash
yq 'length' sample.yml         # 返回键值对数量
```

### 15.3 数组长度

```bash
yq 'length' sample.yml         # 返回元素数量
```

### 15.4 null 长度

```bash
yq '.a | length' sample.yml    # null 返回 0
```

### 15.5 实用计数

```bash
# 计算满足条件的元素数量
yq '[.[] | select(.active == true)] | length' sample.yml

# 计算嵌套数组总元素数
yq '[.. | select(tag == "!!seq")] | map(length) | add' sample.yml
```


---

## 16. 字符串操作

### 16.1 插值

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

### 16.2 大小写转换

```bash
yq 'upcase' sample.yml       # 转大写（支持 Unicode）
yq 'downcase' sample.yml     # 转小写（支持 Unicode）
```

### 16.3 连接字符串

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

### 16.4 修剪空白

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

### 16.5 正则匹配

```bash
# 匹配第一个
yq 'match("foo")' sample.yml

# 全局匹配，忽略大小写
yq '[match("(?i)foo"; "g")]' sample.yml

# 捕获组
yq '[match("(ab)(c)"; "g")]' sample.yml
```

### 16.6 命名捕获组

```bash
yq 'capture("(?P<a>[a-z]+)-(?P<n>[0-9]+)")' sample.yml
# 输入: xyzzy-14
# 输出:
# a: xyzzy
# n: "14"
```

### 16.7 替换

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

### 16.8 分割

```bash
yq 'split("; ")' sample.yml

# 按行分割
yq 'split("\n")' sample.yml
```

### 16.9 startsWith / endsWith / contains

```bash
yq '.[] | select(startswith("pre"))' sample.yml
yq '.[] | select(endswith("post"))' sample.yml
yq '.[] | select(contains("middle"))' sample.yml
```

---

## 17. 布尔与逻辑运算

### 17.1 逻辑运算

```bash
yq --null-input 'true and false'     # false
yq --null-input 'true or false'      # true
yq --null-input 'true | not'         # false

# 异或
yq --null-input 'true != false'      # true
```

### 17.2 any / all

```yaml
# sample.yml
- false
- true
```

```bash
yq 'any' sample.yml        # true（任一 true）
yq 'all' sample.yml        # false（并非全部 true）
```

### 17.3 条件 any/all

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

### 17.4 条件表达式（if-then-else 模式）

虽然 yq 没有直接的 if/else，但可以用 `//` 和 `select` 模拟：

```bash
# 设置默认值（如果为 null 则使用默认值）
yq '.name // "unknown"' sample.yml

# 条件赋值
yq '.status = (if .active then "running" else "stopped" end)' sample.yml
# 实际上 yq 支持 if-then-else:
yq 'if .active == true then "running" else "stopped" end' sample.yml
```

---

## 18. 样式控制

### 18.1 可用样式

| 样式 | 说明 | YAML 表示 |
|------|------|-----------|
| `""` | 默认（自动） | 自动选择 |
| `"double"` | 双引号 | `"value"` |
| `"single"` | 单引号 | `'value'` |
| `"literal"` | 字面量块 | `|` |
| `"folded"` | 折叠块 | `>` |
| `"flow"` | 流式 | `{a: 1}` / `[1, 2]` |
| `"tagged"` | 带类型标签 | `!!str value` |

### 18.2 设置样式

```bash
yq '.a.b = "new" | .a.b style="double"' sample.yml
# 输出: b: "new"
```

### 18.3 使用 with 设置样式

```bash
yq 'with(.a.b ; . = "newValue" | . style="single")' sample.yml
# 输出: 'newValue'
```

### 18.4 全局设置样式

```bash
yq '.. style="double"' sample.yml      # 所有值用双引号
yq '... style="double"' sample.yml     # 键和值都用双引号
yq '.. style="literal"' sample.yml     # 字面量块（多行字符串）
yq '.. style="flow"' sample.yml        # 流式格式（紧凑）
```

### 18.5 重置样式（美化打印）

```bash
yq '... style=""' sample.yml
# 等价于
yq -P '.' sample.yml
```

### 18.6 读取样式

```bash
yq '.. | style' sample.yml
```

### 18.7 保留注释的同时更新样式

```bash
# 先读取，修改样式，再赋值回去
yq '.a style="double"' sample.yml
```

---

## 19. 标签与类型

### 19.1 获取标签

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

### 19.2 设置自定义标签

```bash
yq '.a tag = "!!mikefarah"' sample.yml
# 输出: a: !!mikefarah str
```

### 19.3 数字转字符串

```bash
yq '(.. | select(tag == "!!int")) tag= "!!str"' sample.yml
# 将所有整数转为字符串

# 或者更精确：只转换特定路径
yq '.port tag = "!!str"' config.yml
```

### 19.4 类型检查

```bash
yq '.value | tag' sample.yml    # 查看类型
yq '.[] | select(tag == "!!str")' sample.yml  # 只选字符串
yq '.[] | select(tag == "!!int" or tag == "!!float")' sample.yml  # 数字
```

---

## 20. 注释操作

### 20.1 三种注释类型

| 类型 | 属性 | 说明 |
|------|------|------|
| 行尾注释 | `line_comment` | 行尾 `# comment` |
| 头部注释 | `head_comment` | 节点前的 `# comment` |
| 尾部注释 | `foot_comment` | 节点后的 `# comment` |

### 20.2 设置行尾注释

```yaml
# sample.yml
a: cat
```

```bash
yq '.a line_comment="single"' sample.yml
# 输出: a: cat # single
```

### 20.3 设置映射/数组的注释（在 key 上）

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

### 20.4 设置头部注释

```bash
yq '. head_comment="single"' sample.yml
# 输出:
# # single
# a: cat
```

### 20.5 设置尾部注释

```bash
yq '. foot_comment=.a' sample.yml
# 输出:
# a: cat
# # cat
```

### 20.6 相对更新注释

```bash
yq '.. line_comment |= .' sample.yml
# 将所有节点的行尾注释设为其值
```

### 20.7 删除注释

```bash
# 删除单个注释
yq '.a line_comment=""' sample.yml

# 删除所有注释（保留内容）
yq '... comments=""' sample.yml
```

### 20.8 查找注释位置

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "hc": headComment, "lc": lineComment, "fc": footComment}]' sample.yml
```

### 20.9 注释保留注意事项

yq 基于 go-yaml v3，**会尽力保留注释**，但在以下场景可能丢失：
- 删除节点后，依附于该节点的注释可能消失
- 大幅重构文档结构时，注释位置可能偏移
- 使用 `sort` 或 `unique` 后，注释通常不保留

**建议：** 在 CI 流水线中，如果注释很重要，先备份或使用 `yq` 的特定版本测试。

---

## 21. 锚点与别名

### 21.1 获取锚点名

```yaml
# sample.yml
a: &billyBob cat
```

```bash
yq '.a | anchor' sample.yml     # 输出: billyBob
```

### 21.2 设置锚点

```bash
yq '.a anchor = "foobar"' sample.yml
# 输出: a: &foobar cat
```

### 21.3 获取别名

```yaml
# sample.yml
b: &billyBob meow
a: *billyBob
```

```bash
yq '.a | alias' sample.yml      # 输出: billyBob
```

### 21.4 设置别名

```bash
yq '.a alias = "meow"' sample.yml
# 输出:
# b: &meow purr
# a: *meow
```

### 21.5 展开别名（explode）

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

### 21.6 解引用并更新

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

### 21.7 删除所有锚点和别名（内联化）

```bash
yq 'explode(.)' sample.yml
# 将所有别名引用替换为实际值，删除锚点
```

---

## 22. 加载外部文件

### 22.1 加载 YAML 文件

```yaml
# sample.yml
myFile: ../../examples/thing.yml
```

```bash
yq 'load(.myFile)' sample.yml
```

### 22.2 加载为字符串

```bash
yq '.something |= load_str("../../examples/" + .file)' sample.yml
```

### 22.3 递归加载所有 file 字段

```bash
yq '(.. | select(has("file"))) |= load("../../examples/" + .file)' sample.yml
```

### 22.4 加载其他格式

```bash
yq '.more_stuff = load_xml("../../examples/small.xml")' sample.yml
yq '.more_stuff = load_props("../../examples/small.properties")' sample.yml
yq '.more_stuff = load_base64("../../examples/base64.txt")' sample.yml
```

### 22.5 安全禁用文件操作

```bash
yq --security-disable-file-ops --null-input 'load("file.yml")'
# Error: file operations have been disabled
```

### 22.6 模板化配置（高级）

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

## 23. 编码与解码

### 23.1 编码/解码对照表

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

### 23.2 JSON 编码

```bash
# 嵌套 JSON 字符串
yq '.b = (.a | to_json)' sample.yml

# 单行 JSON
yq '.b = (.a | to_json(0))' sample.yml

# 简写
yq '.b = (.a | @json)' sample.yml
```

### 23.3 JSON 解码

```bash
yq '.a | from_json | ... style=""' sample.yml

# 解码后访问
yq '.json_field | from_json | .nested.key' sample.yml
```

### 23.4 Properties 编码/解码

```bash
yq '.b = (.a | @props)' sample.yml
yq '.a |= @propsd' sample.yml
```

### 23.5 CSV/TSV 编码/解码

```bash
# YAML 数组转 CSV
yq '@csv' sample.yml

# TSV
yq '@tsv' sample.yml

# CSV 转 YAML
yq '.a |= @csvd' sample.yml
```

### 23.6 XML 编码/解码

```bash
yq '.a | to_xml' sample.yml
yq '.a | @xml' sample.yml                   # 单行
yq '.b = (.a | from_xml)' sample.yml
```

### 23.7 Base64 编码/解码

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

### 23.8 URI 编码/解码

```bash
yq '.coolData | @uri' sample.yml
yq '@urid' sample.yml
```

### 23.9 Shell 编码

```bash
# 转义为 Shell 安全字符串
yq '.coolData | @sh' sample.yml
```

---

## 24. 多文档处理

### 24.1 读取多文档

```bash
yq '.' multi-doc.yaml
# 输出所有文档，用 --- 分隔
```

### 24.2 合并多文档文件

```bash
# 将所有 YAML 文件合并为一个多文档文件
yq '.' somewhere/*.yaml
```

### 24.3 选择特定文档

```bash
# 按文档索引（di 是 documentIndex 的简写）
yq 'select(documentIndex == 0)' multi-doc.yaml
yq 'select(di == 0)' multi-doc.yaml

# 按文件索引（fi 是 fileIndex 的简写）
yq 'select(fileIndex == 0)' file1.yaml file2.yaml
yq 'select(fi == 0)' file1.yaml file2.yaml
```

### 24.4 更新特定文档

```bash
# 只更新第二个文档
yq -i '(select(di == 1) | .each) += "cool"' multi-doc.json

# 更新所有文档的某个字段
yq -i '.version = "2.0"' multi-doc.yaml
```

### 24.5 拆分文档

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

### 24.6 多文档统计

```bash
# 计算文档数量
yq '[.] | length' multi-doc.yaml

# 或者
yq 'document_index' multi-doc.yaml  # 最后一个文档的索引
```

---

## 25. 格式转换

### 25.1 YAML ↔ JSON

```bash
# JSON 转 YAML（美化）
yq -Poy sample.json
yq -P -p json sample.json

# YAML 转 JSON
yq -o json file.yaml
yq -o json -I=0 file.yaml     # 单行 JSON
yq -o json -I=2 file.yaml     # 2空格缩进
```

### 25.2 YAML ↔ XML

```bash
# XML 转 YAML
yq -p xml file.xml
yq -o yaml file.xml

# YAML 转 XML
yq -o xml file.yaml
```

### 25.3 YAML ↔ Properties

```bash
yq -o props file.yaml
yq -p props file.properties
```

### 25.4 YAML ↔ CSV/TSV

```bash
# 数组数据转 CSV
yq -o csv file.yaml

# CSV 转 YAML
yq -p csv -P file.csv
```

### 25.5 YAML ↔ TOML

```bash
yq -o toml file.yaml
yq -p toml file.toml
```

### 25.6 YAML ↔ HCL (Terraform)

```bash
yq -o hcl file.yaml
yq -p hcl file.hcl
```

### 25.7 YAML ↔ INI

```bash
yq -o ini file.yaml
yq -p ini file.ini
```

### 25.8 YAML ↔ Base64

```bash
yq -o base64 file.yaml
yq -p base64 file.b64
```

### 25.9 自动检测格式

yq 默认根据文件扩展名自动检测格式，未知格式默认为 YAML。

```bash
# 显式指定输入格式（管道数据无扩展名）
cat file.xml | yq -p xml '.'

# 显式指定输出格式
yq -o json '.' file.yaml
```


---

## 26. Reduce 与函数式操作

### 26.1 语法

```
<exp> as $<name> ireduce (<init>; <block>)
```

### 26.2 数组求和

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

### 26.3 合并所有文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml
```

### 26.4 数组转对象

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

### 26.5 分组统计

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

---

## 27. With 与 Entries 操作

### 27.1 With 操作

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

### 27.2 同时更新多个属性

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

### 27.3 相对更新数组元素

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

### 27.4 Entries 操作

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

---

## 28. 拆分为文档

### 28.1 数组拆分为多文档

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

### 28.2 按条件拆分

```bash
# 将活跃和非活跃用户拆分为不同文档
yq '.users[] | select(.active) | split_doc' users.yml > active.yml
yq '.users[] | select(.active | not) | split_doc' users.yml > inactive.yml
```

---

## 29. 加法与数值运算

### 29.1 数字相加

```bash
yq '.a + .b' sample.yml
```

### 29.2 字符串拼接

```bash
yq '.a + .b' sample.yml
```

### 29.3 数组合并

```bash
yq '.a + .b' sample.yml
```

### 29.4 日期加法

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST", .a += "3h1m")' sample.yml
```

### 29.5 null 加法

```bash
yq --null-input 'null + "cat"'    # 输出: cat
```

### 29.6 数值运算

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

---

## 30. 实战专题：Kubernetes 与容器配置

### 30.1 批量更新镜像标签

```bash
# 更新所有容器的镜像为最新版本
yq -i '(.. | select(has("image")).image) = "nginx:latest"' deployment.yaml

# 只更新特定容器的镜像
yq -i '(.spec.template.spec.containers[] | select(.name == "app")).image = "myapp:v2"' deployment.yaml

# 使用环境变量注入镜像标签
IMAGE_TAG=v1.2.3 yq -i '(.spec.template.spec.containers[].image) |= sub("(?<=:).*"; strenv(IMAGE_TAG))' deployment.yaml
```

### 30.2 资源限制管理

```bash
# 统一设置所有容器的资源限制
yq -i '.spec.template.spec.containers[].resources = {
  "limits": {"cpu": "500m", "memory": "512Mi"},
  "requests": {"cpu": "100m", "memory": "128Mi"}
}' deployment.yaml

# 仅当没有设置资源时才添加
yq -i '(.spec.template.spec.containers[] | select(has("resources") | not)).resources = {
  "limits": {"cpu": "500m", "memory": "512Mi"}
}' deployment.yaml
```

### 30.3 环境变量注入

```bash
# 从 ConfigMap 注入环境变量
yq -i '.spec.template.spec.containers[0].env += [
  {"name": "DATABASE_URL", "valueFrom": {"configMapKeyRef": {"name": "app-config", "key": "database_url"}}}
]' deployment.yaml

# 批量注入多个环境变量
ENV_VARS='[{name: LOG_LEVEL, value: debug}, {name: TIMEOUT, value: "30"}]' \
  yq -i '.spec.template.spec.containers[0].env += env(ENV_VARS)' deployment.yaml
```

### 30.4 副本数管理

```bash
# 设置副本数
yq -i '.spec.replicas = 3' deployment.yaml

# 根据环境变量设置副本数
REPLICAS=5 yq -i '.spec.replicas = env(REPLICAS)' deployment.yaml
```

### 30.5 标签和选择器管理

```bash
# 添加标签
yq -i '.metadata.labels.environment = "production"' deployment.yaml

# 批量添加标签
yq -i '.metadata.labels *= {"team": "platform", "cost-center": "cc123"}' deployment.yaml

# 更新选择器
yq -i '.spec.selector.matchLabels.app = "new-app-name"' deployment.yaml
```

### 30.6 Service 配置管理

```bash
# 更新 Service 端口
yq -i '(.spec.ports[] | select(.name == "http")).targetPort = 8080' service.yaml

# 添加新端口
yq -i '.spec.ports += [{"name": "metrics", "port": 9090, "targetPort": 9090}]' service.yaml
```

### 30.7 ConfigMap 数据管理

```bash
# 添加/更新配置项
yq -i '.data."config.json" |= @jsond | .data."config.json".timeout = 30 | .data."config.json" |= @json' configmap.yaml

# 从文件加载配置
yq -i '.data."app.conf" = load_str("app.conf")' configmap.yaml
```

---

## 31. 实战专题：CI/CD 与配置管理

### 31.1 GitHub Actions 工作流管理

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
```

```bash
# 更新 Action 版本
yq -i '(.jobs.deploy.steps[] | select(.uses | contains("actions/checkout"))).uses = "actions/checkout@v4"' .github/workflows/deploy.yml

# 添加环境变量
yq -i '.jobs.deploy.env.DEPLOY_ENV = "production"' .github/workflows/deploy.yml

# 添加步骤
yq -i '.jobs.deploy.steps += [{"name": "Run tests", "run": "npm test"}]' .github/workflows/deploy.yml
```

### 31.2 Helm Values 文件管理

```bash
# 更新镜像仓库
yq -i '.image.repository = "myregistry.com/myapp"' values.yaml

# 根据环境设置不同配置
ENV=prod yq -i '
  .image.tag = strenv(ENV) |
  .replicaCount = (if strenv(ENV) == "prod" then 3 else 1 end) |
  .resources.limits.memory = (if strenv(ENV) == "prod" then "1Gi" else "256Mi" end)
' values.yaml

# 合并多个 values 文件
yq eval-all '. as $item ireduce ({}; . * $item)' values-base.yaml values-prod.yaml > values-merged.yaml
```

### 31.3 多环境配置管理

```bash
# 目录结构：
# config/
#   base.yaml
#   dev.yaml
#   staging.yaml
#   prod.yaml

# 合并基础配置和环境配置
yq eval-all '. as $item ireduce ({}; . * $item)' config/base.yaml config/$ENV.yaml > config/merged.yaml

# 验证必需字段存在
yq --exit-status '.database.host and .database.port and .api.key' config/merged.yaml > /dev/null \
  || { echo "Missing required config"; exit 1; }
```

### 31.4 版本号自动递增

```bash
# 读取当前版本
CURRENT_VERSION=$(yq '.version' package.yaml)

# 递增补丁版本
NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1"."$2"."($3+1)}')

# 更新版本号
yq -i '.version = strenv(NEW_VERSION)' package.yaml
```

### 31.5  secrets 管理（不泄露）

```bash
# 从环境变量注入 secrets（不硬编码）
yq -i '
  .database.password = strenv(DB_PASSWORD) |
  .api.token = strenv(API_TOKEN) |
  .oauth.client_secret = strenv(OAUTH_SECRET)
' secrets.yaml

# 验证 secrets 已设置
yq '[.database.password, .api.token, .oauth.client_secret] | all' secrets.yaml \
  || { echo "Missing secrets"; exit 1; }
```

---

## 32. 实战专题：Docker Compose 管理

### 32.1 服务镜像更新

```bash
# 更新所有服务的镜像标签
TAG=v2.0 yq -i '.services[].image |= sub("(?<=:).*"; strenv(TAG))' docker-compose.yml

# 只更新特定服务
yq -i '.services.app.image = "myapp:v2"' docker-compose.yml
```

### 32.2 环境变量注入

```bash
# 添加环境变量到所有服务
yq -i '.services[].environment += ["LOG_LEVEL=debug"]' docker-compose.yml

# 从 .env 文件加载（需要转换格式）
# 假设 .env 文件格式为 KEY=VALUE
while IFS='=' read -r key value; do
  yq -i '.services.app.environment += ["'"$key"='"$value"'"]' docker-compose.yml
done < .env
```

### 32.3 端口映射管理

```bash
# 添加端口映射
yq -i '.services.app.ports += ["8080:80"]' docker-compose.yml

# 更新特定端口
yq -i '(.services.app.ports[] | select(contains("80:80"))) = "8080:80"' docker-compose.yml
```

### 32.4 卷管理

```bash
# 添加卷
yq -i '.services.app.volumes += ["./data:/app/data:rw"]' docker-compose.yml

# 添加命名卷
yq -i '.services.app.volumes += ["app-data:/app/data"]' docker-compose.yml
yq -i '.volumes.app-data = {"driver": "local"}' docker-compose.yml
```

### 32.5 网络配置

```bash
# 添加自定义网络
yq -i '.services.app.networks += ["backend"]' docker-compose.yml
yq -i '.networks.backend = {"driver": "bridge"}' docker-compose.yml
```

### 32.6 健康检查配置

```bash
yq -i '.services.app.healthcheck = {
  "test": ["CMD", "curl", "-f", "http://localhost:8080/health"],
  "interval": "30s",
  "timeout": "10s",
  "retries": 3,
  "start_period": "40s"
}' docker-compose.yml
```

---

## 33. 与 jq 对比迁移指南

### 33.1 语法对照表

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

### 33.2 jq 用户常见陷阱

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

### 33.3 从 jq 迁移的实用技巧

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

## 34. 性能优化与大数据处理

### 34.1 大文件处理策略

```bash
# 对于超大 YAML 文件（>100MB），避免使用递归操作
# 慢：递归遍历整个文档
yq '.. | select(has("image")).image' large-file.yaml

# 快：只遍历已知路径
yq '.spec.template.spec.containers[].image' large-file.yaml

# 如果只需要特定字段，使用精确路径
yq '.items[].metadata.name' large-file.yaml
```

### 34.2 管道优化

```bash
# 避免多次读取同一文件
# 差：
yq '.items' file.yaml | yq '.[] | select(.active)' | yq '.name'

# 好：
yq '.items[] | select(.active) | .name' file.yaml

# 使用 eval-all 处理多个文件时，注意内存使用
yq eval-all '.[] | select(.active)' *.yaml  # 所有文件加载到内存
```

### 34.3 内存优化

```bash
# 对于超大数据集，考虑分批处理
for f in *.yaml; do
  yq -i '.items[] |= select(.active)' "$f"
done

# 使用 split 将大文档拆分为小文件
yq '.items[] | split_doc' large-file.yaml | split -l 1 - item-
```

### 34.4 原地更新的性能

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

## 35. Shell 集成技巧

### 35.1 Bash 数组创建

```bash
# 将 yq 输出读入 Bash 数组
readarray actions < <(yq '.coolActions[]' sample.yaml)
echo "${actions[1]}"
```

### 35.2 Bash 循环中使用 yq

```bash
readarray identityMappings < <(yq -o=j -I=0 '.identities[]' test.yml)

for identityMapping in "${identityMappings[@]}"; do
    roleArn=$(echo "$identityMapping" | yq '.arn' -)
    echo "roleArn: $roleArn"
done
```

### 35.3 批量更新多个文件

```bash
# 使用 find 批量更新
find *.yaml -exec yq '. += "cow"' -i {} \;

# 或者使用 xargs（更快）
ls *.yaml | xargs -P 4 -I {} yq '.version = "2.0"' -i {}
```

### 35.4 比较 YAML 文件

```bash
# 规范化后比较（忽略格式差异）
diff <(yq -P 'sort_keys(..)' -o=props file1.yaml) <(yq -P 'sort_keys(..)' -o=props file2.yaml)

# 只比较特定字段
diff <(yq '.spec' file1.yaml) <(yq '.spec' file2.yaml)
```

### 35.5 读取多个 STDIN

```bash
yq '.apple' <(curl -s https://somewhere/data1.yaml) <(cat file.yml)
```

### 35.6 逻辑判断（无 if/else）

```yaml
# sample.yml
- animal: cat
- animal: dog
- animal: frog
```

```bash
yq '.[] |= (
  with(select(.animal == "cat");
    .noise = "meow" |
    .whiskers = true
  ) |
  with(select(.animal == "dog");
    .noise = "woof" |
    .happy = true
  ) |
  with(select(.noise == null);
    .noise = "???"
  )
)' sample.yml
```

### 35.7 验证 YAML 文件

```bash
# 验证文件是否为有效的 YAML/JSON
yq --exit-status 'tag == "!!map" or tag == "!!seq"' file.txt > /dev/null

# 验证必需字段
yq --exit-status '.name and .version and .description' package.yaml > /dev/null \
  || { echo "Invalid package.yaml"; exit 1; }
```

### 35.8 生成随机数据

```bash
# 生成带时间戳的配置
yq -n '
  .generated_at = now |
  .id = "id-" + (now | tostring | split(".") | .[0])
' > generated.yaml
```

---

## 36. PowerShell 使用指南

### 36.1 引号问题

PowerShell 对引号的处理与 Bash 不同，需要特别注意：

```powershell
# 使用单引号（推荐简单查询）
yq '.a.b[0].c' file.yaml

# 转义双引号
yq ".a.b[0].c = \"value\"" file.yaml

# PowerShell 特殊语法（嵌套引号）
yq -n '.test = ""something""'

# 使用 Here-String 处理复杂表达式
$expr = @'
  .a = "cat" |
  .b = "dog" |
  .c = "fish"
'@
yq -i $expr file.yaml
```

### 36.2 环境变量

```powershell
# PowerShell 中设置环境变量
$env:MY_VAR = "hello"
yq --null-input '.a = env(MY_VAR)'

# 使用 strenv 确保字符串类型
$env:VERSION = "1.2.3"
yq -i '.version = strenv(VERSION)' file.yaml
```

### 36.3 管道使用

```powershell
# PowerShell 管道与 yq
Get-Content file.yaml | yq '.items[] | select(.active)'

# 处理多个文件
Get-ChildItem *.yaml | ForEach-Object { yq '.version' $_.FullName }
```

### 36.4 路径处理

```powershell
# PowerShell 路径可能包含空格，使用引号包裹
yq '.name' "C:\Program Files\App\config.yaml"

# 使用变量
$configPath = "C:\app\config.yaml"
yq -i '.debug = true' $configPath
```

---

## 37. 常见陷阱与故障排除

### 37.1 引号地狱（Shell 转义）

**问题：** 表达式中的引号与 Shell 引号冲突

```bash
# 错误：Shell 会解析内部引号
yq '.message = "He said "hello""' file.yaml

# 解决方案 1：使用单引号包裹，双引号在内部
yq '.message = "He said \"hello\""' file.yaml

# 解决方案 2：使用转义
yq ".message = \"He said \\"hello\\"\"" file.yaml

# 解决方案 3：使用环境变量
MESSAGE='He said "hello"' yq -i '.message = strenv(MESSAGE)' file.yaml

# 解决方案 4：从文件读取表达式
# expression.yq: .message = "He said \"hello\""
yq --from-file expression.yq file.yaml
```

### 37.2 注释和空白丢失

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

### 37.3 布尔值解析差异

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

### 37.4 Merge 锚点行为

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

### 37.5 数字被解析为科学计数法

**问题：** 大数字可能被错误解析

```bash
# 问题：12345678901234567890 可能被截断
# 解决方案：转为字符串
yq '.big_number tag = "!!str"' file.yaml

# 或者在输入时就作为字符串
yq --null-input '.id = "12345678901234567890"'
```

### 37.6 空值与 null 的区别

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

### 37.7 数组索引越界

```bash
# 访问不存在的数组索引会返回 null（不会报错）
yq '.[100]' sample.yml  # null

# 但如果数组本身不存在，会报错
yq '.nonexistent[0]' sample.yml  # Error: Cannot index ...

# 使用可选访问避免报错
yq '.nonexistent?[0]?' sample.yml  # null
```

### 37.8 原地更新文件权限

```bash
# yq -i 会保留原文件的权限和所有者
# 但如果文件是只读的，会报错
chmod +w file.yaml
yq -i '.version = "2.0"' file.yaml
```

### 37.9 已知问题汇总

1. **注释和空白**：yq 尝试保留注释位置和空白，但并非所有场景都能处理（参见 go-yaml/yaml v3）。
2. **布尔值**：YAML 1.2 标准中移除了 `yes`/`no` 作为布尔值，yq 假设使用 YAML 1.2 标准。
3. **Merge 锚点**：使用 `--yaml-fix-merge-anchor-to-spec=true` 获得符合规范的合并行为。
4. **大文件**：递归操作（`..`）在大文件上可能很慢，尽量使用精确路径。
5. **特殊字符**：某些 Unicode 字符在 Windows 终端可能显示异常。

---

## 38. 附录：速查表

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
```

### B. 更新值

```bash
yq -i '.key = "value"' file.yaml
yq -i '.nested.key |= . + 1' file.yaml
yq -i '(.array[] | select(.name == "x")).field = "y"' file.yaml
yq -i '(.a, .b, .c) = "same"' file.yaml
yq -i '.new.path.nested = "value"' file.yaml  # 自动创建路径
```

### C. 删除

```bash
yq -i 'del(.key)' file.yaml
yq -i 'del(.array[0])' file.yaml
yq -i 'del(.. | select(. == "bad"))' file.yaml
yq -i 'del(.. | .difficulty?)' file.yaml
yq -i 'del(.[] | select(.active | not))' file.yaml
```

### D. 转换

```bash
yq -Poy file.json                    # JSON → YAML
yq -o json file.yaml                 # YAML → JSON
yq -o xml file.yaml                  # YAML → XML
yq -P -p xml file.xml                # XML → YAML
yq -o props file.yaml                # YAML → Properties
yq -o csv file.yaml                  # YAML → CSV
yq -o toml file.yaml                 # YAML → TOML
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
NAME=value yq -i '.name = strenv(NAME)' file.yaml
yq -i '.value = env(VAR)' file.yaml
yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml
myenv="cat" yq '.[env(myenv)]' file.yaml
```

### G. 条件与过滤

```bash
yq '.[] | select(.active == true)' file.yaml
yq '.[] | select(.name == "*test*")' file.yaml
yq '.[] | select(test("^[a-z]+$"))' file.yaml
yq '[.[] | select(.age > 18)] | length' file.yaml
```

### H. 递归操作

```bash
yq '.. | select(has("image")).image' file.yaml
yq 'del(.. | .secret?)' file.yaml
yq '(.. | select(tag == "!!int")) tag = "!!str"' file.yaml
yq '.. style="double"' file.yaml
```

### I. 数组操作

```bash
yq '.[]' file.yaml                    # 迭代
yq '.[0, 2, 4]' file.yaml             # 多选
yq '.[1:5]' file.yaml                 # 切片
yq '.[] |= . * 2' file.yaml           # 批量更新
yq 'sort_by(.name)' file.yaml         # 排序
yq 'unique' file.yaml                 # 去重
yq 'unique_by(.name)' file.yaml       # 按字段去重
yq 'length' file.yaml                 # 长度
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
```

### K. 样式与标签

```bash
yq '.a style="double"' file.yaml
yq '.a style="single"' file.yaml
yq '.a style="literal"' file.yaml
yq '.a tag = "!!str"' file.yaml
yq '.. | tag' file.yaml
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

### N. GitHub Action 使用

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
> 
> **本手册版本**: v4.40+ 增强实战版
