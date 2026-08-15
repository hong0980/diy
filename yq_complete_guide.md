# yq 完全使用手册

> 基于 [mikefarah/yq](https://mikefarah.gitbook.io/yq) 官方文档整理
> 
> yq 是一个轻量级、可移植的命令行 YAML/JSON/XML/INI/Properties/CSV/TSV 处理器，使用类似 jq 的语法。

---

## 目录

1. [安装](#1-安装)
2. [基础用法](#2-基础用法)
3. [命令行参数](#3-命令行参数)
4. [读取与遍历](#4-读取与遍历)
5. [赋值与更新](#5-赋值与更新)
6. [条件过滤](#6-条件过滤)
7. [删除操作](#7-删除操作)
8. [管道与组合](#8-管道与组合)
9. [变量](#9-变量)
10. [环境变量](#10-环境变量)
11. [合并操作](#11-合并操作)
12. [递归下降](#12-递归下降)
13. [排序](#13-排序)
14. [唯一值](#14-唯一值)
15. [键操作](#15-键操作)
16. [长度](#16-长度)
17. [字符串操作](#17-字符串操作)
18. [布尔操作](#18-布尔操作)
19. [样式控制](#19-样式控制)
20. [标签操作](#20-标签操作)
21. [注释操作](#21-注释操作)
22. [锚点与别名](#22-锚点与别名)
23. [加载外部文件](#23-加载外部文件)
24. [编码与解码](#24-编码与解码)
25. [多文档处理](#25-多文档处理)
26. [格式转换](#26-格式转换)
27. [Reduce 操作](#27-reduce-操作)
28. [With 操作](#28-with-操作)
29. [拆分为文档](#29-拆分为文档)
30. [Entries 操作](#30-entries-操作)
31. [加法操作](#31-加法操作)
32. [实用技巧与故障排除](#32-实用技巧与故障排除)

---

## 1. 安装

### 1.1 二进制下载

```bash
# Linux AMD64 (最新版)
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq && chmod +x /usr/local/bin/yq

# 或下载 tar.gz
VERSION=v4.40.0
PLATFORM=linux_amd64
wget https://github.com/mikefarah/yq/releases/download/${VERSION}/yq_${PLATFORM}.tar.gz -O - | tar xz && sudo mv yq_${PLATFORM} /usr/local/bin/yq
```

### 1.2 包管理器

```bash
# macOS / Linux (Homebrew)
brew install yq

# Linux (Snap)
snap install yq

# Arch Linux
pacman -S go-yq

# Alpine Linux (v3.20+)
apk add yq-go

# Windows (Chocolatey)
choco install yq

# Windows (Scoop)
scoop install main/yq

# Windows (Winget)
winget install --id MikeFarah.yq

# Go
go install github.com/mikefarah/yq/v4@latest
```

### 1.3 Docker / Podman

```bash
# 一次性使用
docker run --rm -v "${PWD}":/workdir mikefarah/yq '.a.b[0].c' file.yaml

# 管道输入
docker run -i --rm mikefarah/yq '.this.thing' < myfile.yml

# 交互式
docker run --rm -it -v "${PWD}":/workdir --entrypoint sh mikefarah/yq

# 安全模式（限制权限）
docker run --rm --security-opt=no-new-privileges --cap-drop all --network none   -v "${PWD}":/workdir mikefarah/yq '.a.b[0].c' file.yaml
```

### 1.4 Bash 函数简化 Docker 调用

```bash
yq() {
  docker run --rm -i -v "${PWD}":/workdir mikefarah/yq "$@"
}
```

---

## 2. 基础用法

### 2.1 基本模式

```bash
yq [表达式] [文件]
```

### 2.2 快速示例

```bash
# 读取值
yq '.a.b[0].c' file.yaml

# 从 STDIN 读取
cat file.yaml | yq '.a.b[0].c'
yq '.a.b[0].c' < file.yaml

# 原地更新
yq -i '.a.b[0].c = "cool"' file.yaml

# 使用环境变量
NAME=mike yq -i '.a.b[0].c = strenv(NAME)' file.yaml

# 多行更新
yq -i '
  .a.b[0].c = "cool" |
  .x.y.z = "foobar" |
  .person.name = strenv(NAME)
' file.yaml

# 查找并更新数组中的元素
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml

# 创建新文件
yq -n '.someNew = "content"' > newfile.yml
```

### 2.3 命令

| 命令 | 说明 |
|------|------|
| `eval` (默认) | 对每个文件的每个文档按顺序应用表达式 |
| `eval-all` (`ea`) | 加载所有文件的所有文档，然后一次性运行表达式 |
| `completion` | 生成自动补全脚本 |
| `help` | 帮助 |

---

## 3. 命令行参数

### 3.1 常用参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--inplace` | `-i` | 原地更新文件 |
| `--null-input` | `-n` | 不读取输入，仅评估表达式（用于创建文档） |
| `--input-format` | `-p` | 输入格式：`auto`/`yaml`/`json`/`xml`/`props`/`csv`/`tsv`/`toml`/`hcl`/`ini` |
| `--output-format` | `-o` | 输出格式（同上） |
| `--prettyPrint` | `-P` | 美化打印（相当于 `... style = ""`） |
| `--indent` | `-I` | 设置输出缩进级别（默认 2） |
| `--colors` | `-C` | 强制彩色输出 |
| `--no-colors` | `-M` | 强制无颜色输出 |
| `--no-doc` | `-N` | 不打印文档分隔符 `---` |
| `--unwrapScalar` | `-r` | 解包标量，不带引号/颜色/注释输出（默认 true） |
| `--exit-status` | `-e` | 无匹配或返回 null/false 时设置退出状态 |
| `--from-file` | | 从文件加载表达式 |
| `--front-matter` | `-f` | 提取/处理 YAML 前置内容（如 Jekyll） |
| `--split-exp` | `-s` | 将每个结果输出到单独文件 |
| `--verbose` | `-v` | 详细模式 |
| `--version` | `-V` | 版本信息 |

### 3.2 安全参数

| 参数 | 说明 |
|------|------|
| `--security-disable-env-ops` | 禁用环境变量相关操作 |
| `--security-disable-file-ops` | 禁用文件相关操作（如 load） |

### 3.3 XML 相关参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--xml-attribute-prefix` | `+@` | XML 属性前缀 |
| `--xml-content-name` | `+content` | XML 内容名称 |
| `--xml-directive-name` | `+directive` | XML 指令名称 |
| `--xml-proc-inst-prefix` | `+p_` | XML 处理指令前缀 |
| `--xml-keep-namespace` | `true` | 保留命名空间 |
| `--xml-raw-token` | `true` | 使用 RawToken 方法 |
| `--xml-skip-directives` | | 跳过指令 |
| `--xml-skip-proc-inst` | | 跳过处理指令 |
| `--xml-strict-mode` | | 严格 XML 解析 |

### 3.4 CSV/TSV 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--csv-separator` | `,` | CSV 分隔符 |
| `--csv-auto-parse` | `true` | 自动解析 CSV YAML/JSON 值 |
| `--tsv-auto-parse` | `true` | 自动解析 TSV YAML/JSON 值 |

### 3.5 Properties 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--properties-separator` | ` = ` | 键值分隔符 |
| `--properties-array-brackets` | | 数组路径使用 `[x]`（如 SpringBoot） |

---

## 4. 读取与遍历

### 4.1 基本导航

```yaml
# sample.yml
a:
  b: apple
```

```bash
# 读取嵌套值
yq '.a' sample.yml        # 输出: b: apple
yq '.a.b' sample.yml      # 输出: apple
```

### 4.2 数组访问

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.[0]' sample.yml      # 输出: 1
yq '.[1, 2]' sample.yml   # 输出: 2 和 3（多选）
```

### 4.3 展开数组/映射（Splat）

```yaml
# sample.yml
- b: apple
- c: banana
```

```bash
yq '.[]' sample.yml       # 输出每个元素
# b: apple
# ---
# c: banana
```

### 4.4 特殊键名访问

```yaml
# sample.yml
"red rabbit": frog
a:
  "key.withdots":
    "another.key": apple
```

```bash
# 空格键名
yq '.["red rabbit"]' sample.yml       # 输出: frog

# 带点键名
yq '.a["key.withdots"]["another.key"]' sample.yml   # 输出: apple
```

### 4.5 动态键访问

```yaml
# sample.yml
b: apple
apple: crispy yum
banana: soft yum
```

```bash
yq '.[.b]' sample.yml     # 输出: crispy yum（用 .b 的值作为键）
```

### 4.6 可选访问（避免 null 报错）

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.a?' sample.yml       # 输出: null（不会报错）
```

### 4.7 通配符键匹配

```yaml
# sample.yml
a:
  cat: apple
  mad: things
```

```bash
yq '.a."*a*"' sample.yml  # 输出所有包含 "a" 的键的值
# apple
# things
```

### 4.8 锚点和别名

```yaml
# sample.yml
a: &cat
  c: frog
b: *cat
```

```bash
yq '.b' sample.yml        # 输出: *cat（别名引用）
yq '.b[]' sample.yml      # 输出: frog（展开别名）
yq '.b.c' sample.yml      # 输出: frog（穿透别名访问）
```

### 4.9 Merge 锚点

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
yq '.foobar.a' sample.yml     # 输出: foo_a（从 foo 合并）
yq '.foobar.thing' sample.yml # 输出: foobar_thing（本地覆盖）
yq '.foobar.c' sample.yml     # 输出: foobar_c（本地值优先）
```

> **注意**：使用 `--yaml-fix-merge-anchor-to-spec` 标志可获得符合 YAML 规范的合并行为。

---

## 5. 赋值与更新

### 5.1 两种赋值形式

| 形式 | 说明 |
|------|------|
| `=` (plain) | RHS 表达式在原始文档上下文中运行 |
| `\|=` (relative) | RHS 表达式在每个 LHS 结果上下文中运行 |

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
yq '.a |= . + 1' sample.yml
# 输出:
# a: 2
# b: thing
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
# a: sibling
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
yq '(.[] | select(. == "*andy")) = "bogs"' sample.yml
# 输出:
# - bogs
# - apple
# - bogs
```

### 5.8 深层选择更新（重要！）

> **关键**：更新深层选择结果时，**必须**用括号包裹 LHS 表达式！

```yaml
# sample.yml
a:
  b: apple
  c: cactus
```

```bash
# ✅ 正确：用括号包裹
yq '(.a[] | select(. == "apple")) = "frog"' sample.yml
# 输出:
# a:
#   b: frog
#   c: cactus

# ❌ 错误：没有括号，只会返回更新的子集
yq '.a[] | select(. == "apple") = "frog"' sample.yml
# 输出:
# frog
```

### 5.9 数组元素翻倍

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq '.[] |= . * 2' sample.yml
# 输出:
# - 2
# - 4
# - 6
```

### 5.10 从其他文件更新

```yaml
# sample.yml
a: apples

# another.yml
b: bob
```

```bash
yq eval-all 'select(fileIndex==0).a = select(fileIndex==1) | select(fileIndex==0)' sample.yml another.yml
# 输出:
# a:
#   b: bob
```

### 5.11 保留锚点更新

```yaml
# sample.yml
a: &cool cat
```

```bash
yq '.a = "dog"' sample.yml
# 输出:
# a: &cool dog
```

### 5.12 自定义类型处理

```yaml
# sample.yml
a: !cat meow
b: !dog woof
```

```bash
# 默认保留自定义标签
yq '.a = .b' sample.yml
# 输出:
# a: !cat woof
# b: !dog woof

# 使用 c 标志覆盖自定义标签
yq '.a =c .b' sample.yml
# 输出:
# a: !dog woof
# b: !dog woof
```

### 5.13 空对象自动创建路径

```yaml
# sample.yml
{}
```

```bash
yq '.a.b |= "bogs"' sample.yml
# 输出:
# a:
#   b: bogs

yq '.a.b.[0] |= "bogs"' sample.yml
# 输出:
# a:
#   b:
#     - bogs
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
```

```bash
yq '.[] | select(test("[a-zA-Z]+_[0-9]$"))' sample.yml
# 输出:
# this_0
# thisTo_4
```

### 6.4 数组中查找并更新

```yaml
# data.yaml
- name: foo
  address: old_address
- name: bar
  address: another_address
```

```bash
yq -i '(.[] | select(.name == "foo") | .address) = "12 cat st"' data.yaml
```

---

## 7. 删除操作

### 7.1 删除映射键

```yaml
# sample.yml
a: cat
b: dog
```

```bash
yq 'del(.b)' sample.yml
# 输出:
# a: cat
```

### 7.2 删除嵌套键

```yaml
# sample.yml
a:
  a1: fred
  a2: frood
```

```bash
yq 'del(.a.a1)' sample.yml
# 输出:
# a:
#   a2: frood
```

### 7.3 删除数组元素

```yaml
# sample.yml
- 1
- 2
- 3
```

```bash
yq 'del(.[1])' sample.yml
# 输出:
# - 1
# - 3
```

### 7.4 删除嵌套数组元素

```yaml
# sample.yml
- a: cat
  b: dog
```

```bash
yq 'del(.[0].a)' sample.yml
# 输出:
# - b: dog
```

### 7.5 删除匹配项

```yaml
# sample.yml
a: cat
b: dog
c: bat
```

```bash
yq 'del( .[] | select(. == "*at") )' sample.yml
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
```

```bash
yq 'del(.. | select(has("name")).name)' sample.yml
# 输出:
# a:
#   b:
#     age: 12
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
yq '.a | .b' sample.yml     # 输出: cat
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

---

## 9. 变量

### 9.1 单值变量

```yaml
# sample.yml
a: cat
```

```bash
yq '.a as $foo | $foo' sample.yml     # 输出: cat
```

### 9.2 多值变量

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
yq '.a.b ref $x | $x = "new" | $x style="double"' sample.yml
# 输出:
# a:
#   b: "new"
#   c: something
```

---

## 10. 环境变量

### 10.1 三种环境变量操作符

| 操作符 | 说明 |
|--------|------|
| `env(NAME)` | 将环境变量解析为 YAML 节点（自动识别类型） |
| `strenv(NAME)` | 始终将环境变量解析为字符串 |
| `envsubst` | 在字符串中插值环境变量（`${VAR}` 格式） |

### 10.2 env() - 自动类型识别

```bash
# 字符串
myenv="cat meow" yq --null-input '.a = env(myenv)'
# 输出: a: cat meow

# 布尔值
myenv="true" yq --null-input '.a = env(myenv)'
# 输出: a: true

# 数字
myenv="12" yq --null-input '.a = env(myenv)'
# 输出: a: 12

# YAML 对象
myenv="{b: fish}" yq --null-input '.a = env(myenv)'
# 输出: a: {b: fish}
```

### 10.3 strenv() - 始终作为字符串

```bash
myenv="true" yq --null-input '.a = strenv(myenv)'
# 输出: a: "true"

myenv="12" yq --null-input '.a = strenv(myenv)'
# 输出: a: "12"
```

### 10.4 动态路径更新

```yaml
# sample.yml
a:
  b:
    - name: dog
    - name: cat
```

```bash
pathEnv=".a.b[0].name" valueEnv="moo"   yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
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
myenv="cat" yq --null-input '"the ${myenv} meows" | envsubst'
# 输出: the cat meows
```

### 10.7 envsubst 选项

| 选项 | 说明 |
|------|------|
| `nu` (NoUnset) | 未设置的变量报错 |
| `ne` (NoEmpty) | 空变量报错 |
| `ff` (FailFast) | 第一个错误就中止 |

```bash
# 未设置变量报错
yq --null-input '"the ${missing} meows" | envsubst(nu)'
# Error: variable ${missing} not set

# 空变量报错
myenv="" yq --null-input '"the ${myenv} meows" | envsubst(ne)'
# Error: variable ${myenv} set but empty

# 默认值
yq --null-input '"the ${missing-dog} meows" | envsubst'
# 输出: the dog meows
```

### 10.8 文档中替换环境变量

```yaml
# sample.yml
v: ${myenv}
```

```bash
myenv="cat meow" yq '.v |= envsubst' sample.yml
# 输出: v: cat meow
```

### 10.9 递归替换所有环境变量

```bash
yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml
```

---

## 11. 合并操作

### 11.1 合并标志

| 标志 | 说明 |
|------|------|
| `+` | 追加数组 |
| `d` | 深度合并数组 |
| `?` | 仅合并已有字段 |
| `n` | 仅合并新字段 |
| `c` | 覆盖自定义标签 |

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

# 返回父对象
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
yq '. *= load("file2.yml")' file1.yml
```

### 11.4 合并所有文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml
# 或简写
yq ea '. as $item ireduce ({}; . * $item )' *.yml
```

### 11.5 仅合并已有字段

```yaml
# sample.yml
a:
  thing: one
  cat: frog
b:
  missing: two
  thing: two
```

```bash
yq '.a *? .b' sample.yml
# 输出:
# thing: two
# cat: frog
```

### 11.6 仅合并新字段

```bash
yq '.a *n .b' sample.yml
# 输出:
# thing: one
# cat: frog
# missing: two
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
# value: banana
```

### 11.8 深度合并数组

```yaml
# sample.yml
a:
  - name: fred
    age: 12
  - name: bob
    age: 32
b:
  - name: fred
    age: 34
```

```bash
yq '.a *d .b' sample.yml
# 输出:
# - name: fred
#   age: 34
# - name: bob
#   age: 32
```

### 11.9 数字乘法

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
yq '.b * 4' sample.yml      # banana 重复 4 次
yq '4 * .b' sample.yml      # 同上
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
yq '..' sample.yml
# 输出所有节点
```

### 12.2 递归查找并更新

```bash
# 查找所有包含 "image" 的字段并更新
yq -i '(.. | select(has("image"))).image = "nginx:latest"' deployment.yaml

# 递归删除所有 difficulty 字段
yq -i 'del(.. | .difficulty?)' question-file.yml
```

### 12.3 递归设置样式

```bash
yq '.. style="double"' sample.yml    # 所有值用双引号
yq '... style="double"' sample.yml   # 包括键名也用双引号
```

---

## 13. 排序

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
```

### 13.4 映射排序

```yaml
# sample.yml
y: b
z: a
x: c
```

```bash
yq 'sort' sample.yml
# 输出:
# z: a
# y: b
# x: c
```

### 13.5 按键排序

```bash
yq 'sort_by(key | downcase)' sample.yml
```

### 13.6 原地排序

```bash
yq '.cool |= sort_by(.a)' sample.yml
```

### 13.7 自定义日期排序

```bash
yq 'with_dtf("02-Jan-2006"; sort_by(.a))' sample.yml
```

---

## 14. 唯一值

### 14.1 标量数组去重

```yaml
# sample.yml
- 2
- 1
- 3
- 2
```

```bash
yq 'unique' sample.yml
# 输出:
# - 2
# - 1
# - 3
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
yq 'keys' sample.yml
```

---

## 16. 长度

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
```

### 17.5 正则匹配

```bash
yq 'match("foo")' sample.yml
yq '[match("(?i)foo"; "g")]' sample.yml      # 全局、忽略大小写
yq '[match("(ab)(c)"; "g")]' sample.yml       # 捕获组
```

### 17.6 命名捕获组

```bash
yq 'capture("(?P<a>[a-z]+)-(?P<n>[0-9]+)")' sample.yml
# 输出:
# a: xyzzy
# n: "14"
```

### 17.7 替换

```yaml
# sample.yml
a: cat
b: heat
```

```bash
yq '.[] |= sub("(a)", "${1}r")' sample.yml
# 输出:
# a: cart
# b: heart
```

### 17.8 分割

```bash
yq 'split("; ")' sample.yml
```

---

## 18. 布尔操作

### 18.1 逻辑运算

```bash
yq --null-input 'true and false'     # false
yq --null-input 'true or false'      # true
yq --null-input 'true | not'         # false
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
# b: false
```

---

## 19. 样式控制

### 19.1 可用样式

| 样式 | 说明 |
|------|------|
| `""` | 默认（自动） |
| `"double"` | 双引号 |
| `"single"` | 单引号 |
| `"literal"` | 字面量块 `\|` |
| `"folded"` | 折叠块 `>` |
| `"flow"` | 流式 `{}` / `[]` |
| `"tagged"` | 带类型标签 |

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
yq '.. style="double"' sample.yml      # 值用双引号
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

## 20. 标签操作

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

### 20.2 设置自定义标签

```bash
yq '.a tag = "!!mikefarah"' sample.yml
# 输出: a: !!mikefarah str
```

### 20.3 数字转字符串

```bash
yq '(.. | select(tag == "!!int")) tag= "!!str"' sample.yml
# 将所有整数转为字符串
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

# 删除所有注释
yq '... comments=""' sample.yml
```

### 21.8 查找注释位置

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "hc": headComment, "lc": lineComment, "fc": footComment}]' sample.yml
```

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
yq '.b = (.a | to_json(0))' sample.yml     # 单行
yq '.b = (.a | @json)' sample.yml           # 简写
```

### 24.3 JSON 解码

```bash
yq '.a | from_json | ... style=""' sample.yml
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
yq '.a |= @tsvd' sample.yml
```

### 24.6 XML 编码/解码

```bash
yq '.a | to_xml' sample.yml
yq '.a | @xml' sample.yml                   # 单行
yq '.b = (.a | from_xml)' sample.yml
```

### 24.7 Base64 编码/解码

```bash
yq '.coolData | @base64' sample.yml
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
# 将所有 YAML 文件合并为一个多文档文件
```

### 25.3 选择特定文档

```bash
# 按文档索引
yq 'select(documentIndex == 0)' multi-doc.yaml
yq 'select(di == 0)' multi-doc.yaml

# 按文件索引
yq 'select(fileIndex == 0)' file1.yaml file2.yaml
yq 'select(fi == 0)' file1.yaml file2.yaml
```

### 25.4 更新特定文档

```bash
yq -i '(select(di == 1) | .each) += "cool"' multi-doc.json
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

---

## 26. 格式转换

### 26.1 YAML ↔ JSON

```bash
# JSON 转 YAML（美化）
yq -Poy sample.json
yq -P -p json sample.json

# YAML 转 JSON
yq -o json file.yaml
yq -o json -I=0 file.yaml     # 单行
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
yq -o csv file.yaml
yq -o tsv file.yaml
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
# 显式指定输入格式
cat file.xml | yq -p xml '.'

# 显式指定输出格式
yq -o json '.' file.yaml
```

---

## 27. Reduce 操作

### 27.1 语法

```
<exp> as $<name> ireduce (<init>; <block>)
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

### 27.3 合并所有文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yml
```

### 27.4 数组转对象

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

---

## 28. With 操作

### 28.1 更新深层嵌套路径

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

---

## 29. 拆分为文档

### 29.1 数组拆分为多文档

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

---

## 30. Entries 操作

### 30.1 映射转 entries

```yaml
# sample.yml
a: 1
b: 2
```

```bash
yq 'to_entries' sample.yml
# 输出:
# - key: a
#   value: 1
# - key: b
#   value: 2
```

### 30.2 entries 转映射

```bash
yq 'to_entries | from_entries' sample.yml
# 输出:
# a: 1
# b: 2
```

### 30.3 批量修改键名

```bash
yq 'with_entries(.key |= "KEY_" + .)' sample.yml
# 输出:
# KEY_a: 1
# KEY_b: 2
```

### 30.4 递归修改所有键名

```bash
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= "KEY_" + .)' sample.yml
```

---

## 31. 加法操作

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

---

## 32. 实用技巧与故障排除

### 32.1 验证 YAML 文件

```bash
yq --exit-status 'tag == "!!map" or tag == "!!seq"' file.txt > /dev/null
```

### 32.2 多行表达式

```bash
yq --inplace '
  with(.a.deeply.nested;
    . = "newValue" | . style="single"
  ) |
  with(.b.another.nested;
    . = "cool" | . style="folded"
  )
' my_file.yaml
```

### 32.3 创建 Bash 数组

```bash
readarray actions < <(yq '.coolActions[]' sample.yaml)
echo "${actions[1]}"
```

### 32.4 Bash 循环中使用 yq

```bash
readarray identityMappings < <(yq -o=j -I=0 '.identities[]' test.yml)

for identityMapping in "${identityMappings[@]}"; do
    roleArn=$(echo "$identityMapping" | yq '.arn' -)
    echo "roleArn: $roleArn"
done
```

### 32.5 批量更新多个文件

```bash
find *.yaml -exec yq '. += "cow"' -i {} \;
```

### 32.6 比较 YAML 文件

```bash
diff <(yq -P 'sort_keys(..)' -o=props file1.yaml) <(yq -P 'sort_keys(..)' -o=props file2.yaml)
```

### 32.7 读取多个 STDIN

```bash
yq '.apple' <(curl -s https://somewhere/data1.yaml) <(cat file.yml)
```

### 32.8 逻辑判断（无 if/else）

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

### 32.9 PowerShell 引号问题

```powershell
# 使用单引号
yq '.a.b[0].c' file.yaml

# 或转义双引号
yq ".a.b[0].c = "value"" file.yaml

# PowerShell 特殊语法
yq -n '.test = ""something""'
```

### 32.10 已知问题

1. **注释和空白**：yq 尝试保留注释位置和空白，但并非所有场景都能处理（参见 go-yaml/yaml v3）。
2. **布尔值**：YAML 1.2 标准中移除了 `yes`/`no` 作为布尔值，yq 假设使用 YAML 1.2 标准。
3. **Merge 锚点**：使用 `--yaml-fix-merge-anchor-to-spec=true` 获得符合规范的合并行为。

### 32.11 GitHub Action 使用

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

## 附录：常用速查

### A. 读取值

```bash
yq '.key' file.yaml
yq '.nested.key' file.yaml
yq '.array[0]' file.yaml
yq '.array[].field' file.yaml
yq '.["key-with-dots"]' file.yaml
```

### B. 更新值

```bash
yq -i '.key = "value"' file.yaml
yq -i '.nested.key |= . + 1' file.yaml
yq -i '(.array[] | select(.name == "x")).field = "y"' file.yaml
```

### C. 删除

```bash
yq -i 'del(.key)' file.yaml
yq -i 'del(.array[0])' file.yaml
yq -i 'del(.. | select(. == "bad"))' file.yaml
```

### D. 转换

```bash
yq -Poy file.json                    # JSON → YAML
yq -o json file.yaml                 # YAML → JSON
yq -o xml file.yaml                  # YAML → XML
yq -P -p xml file.xml                # XML → YAML
```

### E. 合并文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yaml
yq ea '. as $item ireduce ({}; . * $item )' *.yaml
```

### F. 环境变量

```bash
NAME=value yq -i '.name = strenv(NAME)' file.yaml
yq -i '.value = env(VAR)' file.yaml
yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml
```

---

> **官方文档**: https://mikefarah.gitbook.io/yq
> 
> **GitHub**: https://github.com/mikefarah/yq
