# yq 完整中文指南（完整版，保留全部官方示例）

> 本文档基于 yq 官方操作符文档翻译整理，涵盖所有内置操作符的完整用法、全部示例和注意事项。
> 所有官方示例均已保留，未做删减。

---

## 目录

- [基础操作](#基础操作)
  - [遍历与读取 (Traverse / Read)](#遍历与读取-traverse--read)
  - [赋值与更新 (Assign / Update)](#赋值与更新-assign--update)
  - [管道 (Pipe)](#管道-pipe)
  - [联合 (Union)](#联合-union)
- [算术与数学运算](#算术与数学运算)
  - [加法 (Add)](#加法-add)
  - [减法 (Subtract)](#减法-subtract)
  - [乘法/深度合并 (Multiply / Merge)](#乘法深度合并-multiply--merge)
  - [除法 (Divide)](#除法-divide)
  - [取模 (Modulo)](#取模-modulo)
  - [转数字 (To Number)](#转数字-to-number)
- [数组操作](#数组操作)
  - [收集为数组 (Collect into Array)](#收集为数组-collect-into-array)
  - [数组/字符串切片 (Slice Array or String)](#数组字符串切片-slice-array-or-string)
  - [扁平化 (Flatten)](#扁平化-flatten)
  - [反转 (Reverse)](#反转-reverse)
  - [随机排序 (Shuffle)](#随机排序-shuffle)
  - [排序 (Sort)](#排序-sort)
  - [按键排序 (Sort Keys)](#按键排序-sort-keys)
  - [去重 (Unique)](#去重-unique)
  - [过滤 (Filter)](#过滤-filter)
  - [首个匹配 (First)](#首个匹配-first)
  - [分组 (Group By)](#分组-group-by)
  - [透视 (Pivot)](#透视-pivot)
  - [数组转映射 (Array to Map)](#数组转映射-array-to-map)
  - [拆分为文档 (Split into Documents)](#拆分为文档-split-into-documents)
- [对象/映射操作](#对象映射操作)
  - [创建对象 (Create, Collect into Object)](#创建对象-create-collect-into-object)
  - [键值对转换 (Entries)](#键值对转换-entries)
  - [选择字段 (Pick)](#选择字段-pick)
  - [排除字段 (Omit)](#排除字段-omit)
  - [获取键 (Keys)](#获取键-keys)
  - [存在检查 (Has)](#存在检查-has)
- [字符串操作](#字符串操作)
  - [字符串操作 (String Operators)](#字符串操作-string-operators)
  - [长度 (Length)](#长度-length)
  - [包含 (Contains)](#包含-contains)
- [条件与逻辑](#条件与逻辑)
  - [选择过滤 (Select)](#选择过滤-select)
  - [布尔操作 (Boolean Operators)](#布尔操作-boolean-operators)
  - [等于/不等于 (Equals / Not Equals)](#等于不等于-equals--not-equals)
  - [比较操作 (Compare Operators)](#比较操作-compare-operators)
  - [默认值 (Alternative / Default value)](#默认值-alternative--default-value)
  - [错误处理 (Error)](#错误处理-error)
- [路径与导航](#路径与导航)
  - [路径操作 (Path)](#路径操作-path)
  - [父节点 (Parent)](#父节点-parent)
  - [递归下降 (Recursive Descent / Glob)](#递归下降-recursive-descent--glob)
  - [文档索引 (Document Index)](#文档索引-document-index)
- [转换与编码](#转换与编码)
  - [编码解码 (Encoder / Decoder)](#编码解码-encoder--decoder)
  - [标签 (Tag)](#标签-tag)
  - [类型 (Kind)](#类型-kind)
  - [样式 (Style)](#样式-style)
  - [日期时间 (Date Time)](#日期时间-date-time)
- [高级操作](#高级操作)
  - [归约 (Reduce)](#归约-reduce)
  - [变量 (Variable Operators)](#变量-variable-operators)
  - [上下文操作 (With)](#上下文操作-with)
  - [动态求值 (Eval)](#动态求值-eval)
  - [环境变量 (Env Variable Operators)](#环境变量-env-variable-operators)
  - [文件操作 (File Operators)](#文件操作-file-operators)
  - [加载 (Load)](#加载-load)
  - [系统操作 (System Operators)](#系统操作-system-operators)
  - [锚点与别名 (Anchor and Alias Operators)](#锚点与别名-anchor-and-alias-operators)
  - [注释操作 (Comment Operators)](#注释操作-comment-operators)
  - [列号 (Column)](#列号-column)
  - [行号 (Line)](#行号-line)
- [其他操作](#其他操作)
  - [映射 (Map / Map Values)](#映射-map--map-values)
  - [最大值 (Max)](#最大值-max)
  - [最小值 (Min)](#最小值-min)
  - [删除 (Delete)](#删除-delete)
- [附录](#附录)
  - [安全标志](#安全标志)
  - [合并锚点标志](#合并锚点标志)
  - [常用快捷标志](#常用快捷标志)
  - [A. 读取值](#读取值)
  - [B. 更新值](#更新值)
  - [C. 删除](#删除)
  - [D. 转换](#转换)
  - [E. 合并文件](#合并文件)
  - [F. 环境变量](#环境变量)

---


## 基础操作

### 遍历与读取 (Traverse / Read)

> 这是最简单（也是最常用）的操作符，用于深入导航 YAML 结构。

#### 简单映射导航


```yaml
a:
  b: apple
```

```bash
yq '.a' sample.yml
```

输出：
```yaml
b: apple
```

#### 展开（Splat）

常用于将子元素管道传递给其他操作符。


```yaml
- b: apple
- c: banana
```

```bash
yq '.[]' sample.yml
```

输出：
```yaml
b: apple
---
c: banana
```

#### 可选展开（Optional Splat）

与 splat 类似，但对标量使用时不会报错。


```yaml
cat
```

```bash
yq '.[]' sample.yml
```

输出为空。

#### 特殊字符

对包含特殊字符的路径元素，使用方括号加引号。


```yaml
"{}": frog
```

```bash
yq '.["{}"]' sample.yml
```

输出：
```yaml
frog
```

#### 嵌套特殊字符


```yaml
a:
  "key.withdots":
    "another.key": apple
```

```bash
yq '.a["key.withdots"]["another.key"]' sample.yml
```

输出：
```yaml
apple
```

#### 带空格的键


```yaml
"red rabbit": frog
```

```bash
yq '.["red rabbit"]' sample.yml
```

输出：
```yaml
frog
```

#### 动态键

方括号内的表达式可用于动态查找/计算键。


```yaml
b: apple
apple: crispy yum
banana: soft yum
```

```bash
yq '.[.b]' sample.yml
```

输出：
```yaml
crispy yum
```

#### 子节点不存在

在遍历过程中，节点会动态添加。


```yaml
c: banana
```

```bash
yq '.a.b' sample.yml
```

输出：
```yaml
null
```

#### 可选标识符

与 jq 类似，当 YAML 不是预期的数组或对象时不会输出错误。


```yaml
- 1
- 2
- 3
```

```bash
yq '.a?' sample.yml
```

输出为空。

#### 通配符匹配


```yaml
a:
  cat: apple
  mad: things
```

```bash
yq '.a."*a*"' sample.yml
```

输出：
```yaml
apple
---
things
```

#### 别名（Aliases）


```yaml
a: &cat
  c: frog
b: *cat
```

```bash
yq '.b' sample.yml
```

输出：
```yaml
*cat
```

#### 通过展开遍历别名


```yaml
a: &cat
  c: frog
b: *cat
```

```bash
yq '.b[]' sample.yml
```

输出：
```yaml
frog
```

#### 显式遍历别名


```yaml
a: &cat
  c: frog
b: *cat
```

```bash
yq '.b.c' sample.yml
```

输出：
```yaml
frog
```

#### 按索引遍历数组


```yaml
- 1
- 2
- 3
```

```bash
yq '.[0]' sample.yml
```

输出：
```yaml
1
```

#### 按索引遍历嵌套数组


```yaml
[[], [cat]]
```

```bash
yq '.[1][0]' sample.yml
```

输出：
```yaml
cat
```

#### 数字键映射


```yaml
2: cat
```

```bash
yq '.[2]' sample.yml
```

输出：
```yaml
cat
```

#### 不存在的数字键映射


```yaml
a: b
```

```bash
yq '.[0]' sample.yml
```

输出：
```yaml
null
```

#### 遍历合并锚点


```yaml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  <<:
    - *foo
    - *bar
  c: foobarList_c
foobar:
  c: foobar_c
  <<: *foo
  thing: foobar_thing
```

```bash
yq '.foobar.a' sample.yml
```

输出：
```yaml
foo_a
```

#### 遍历带本地覆盖的合并锚点

```bash
yq '.foobar.thing' sample.yml
```

输出：
```yaml
foobar_thing
```

#### 选择多个索引


```yaml
a:
  - a
  - b
  - c
```

```bash
yq '.a[0, 2]' sample.yml
```

输出：
```yaml
a
---
c
```

---

### 赋值与更新 (Assign / Update)

> 此操作符用于更新节点值。有两种形式：
> - **普通形式 `=`**：将 LHS 节点值设为 RHS 节点值。RHS 表达式针对管道中匹配的节点运行。
> - **相对形式 `|=`**：与普通形式类似，但 RHS 表达式以每个 LHS 节点为上下文运行。适用于基于旧值更新，如递增。
>
> **标志**：`c` 覆盖自定义标签。

#### 创建 YAML 文件

```bash
yq --null-input '.a.b = "cat" | .x = "frog"'
```

输出：
```yaml
a:
  b: cat
x: frog
```

#### 更新节点为子值


```yaml
a:
  b:
    g: foof
```

```bash
yq '.a |= .b' sample.yml
```

输出：
```yaml
a:
  g: foof
```

#### 数组元素翻倍


```yaml
- 1
- 2
- 3
```

```bash
yq '.[] |= . * 2' sample.yml
```

输出：
```yaml
- 2
- 4
- 6
```

#### 从另一文件更新节点


```yaml
a: apples
```

以及 another.yml：
```yaml
b: bob
```

```bash
yq eval-all 'select(fileIndex==0).a = select(fileIndex==1) | select(fileIndex==0)' sample.yml another.yml
```

输出：
```yaml
a:
  b: bob
```

#### 更新节点为兄弟值


```yaml
a:
  b: child
b: sibling
```

```bash
yq '.a = .b' sample.yml
```

输出：
```yaml
a: sibling
b: sibling
```

#### 更新多个路径


```yaml
a: fieldA
b: fieldB
c: fieldC
```

```bash
yq '(.a, .c) = "potato"' sample.yml
```

输出：
```yaml
a: potato
b: fieldB
c: potato
```

#### 更新字符串值


```yaml
a:
  b: apple
```

```bash
yq '.a.b = "frog"' sample.yml
```

输出：
```yaml
a:
  b: frog
```

#### 通过 |= 更新字符串值


```yaml
a:
  b: apple
```

```bash
yq '.a.b |= "frog"' sample.yml
```

输出：
```yaml
a:
  b: frog
```

#### 更新深层选择结果

注意 LHS 被括号包裹！这是为了确保我们不会先过滤掉 YAML 再更新片段。


```yaml
a:
  b: apple
  c: cactus
```

```bash
yq '(.a[] | select(. == "apple")) = "frog"' sample.yml
```

输出：
```yaml
a:
  b: frog
  c: cactus
```

#### 更新数组值


```yaml
- candy
- apple
- sandy
```

```bash
yq '(.[] | select(. == "*andy")) = "bogs"' sample.yml
```

输出：
```yaml
- bogs
- apple
- bogs
```

#### 更新空对象


```yaml
{}
```

```bash
yq '.a.b |= "bogs"' sample.yml
```

输出：
```yaml
a:
  b: bogs
```

#### 更新带锚点的节点值

锚点会保留。


```yaml
a: &cool cat
```

```bash
yq '.a = "dog"' sample.yml
```

输出：
```yaml
a: &cool dog
```

#### 更新空对象和数组


```yaml
{}
```

```bash
yq '.a.b.[0] |= "bogs"' sample.yml
```

输出：
```yaml
a:
  b:
    - bogs
```

#### 自定义类型默认保持


```yaml
a: !cat meow
b: !dog woof
```

```bash
yq '.a = .b' sample.yml
```

输出：
```yaml
a: !cat woof
b: !dog woof
```

#### 自定义类型：覆盖

使用 `c` 选项覆盖自定义标签。


```yaml
a: !cat meow
b: !dog woof
```

```bash
yq '.a =c .b' sample.yml
```

输出：
```yaml
a: !dog woof
b: !dog woof
```

---

### 管道 (Pipe)

> 将表达式的结果传入另一个表达式。类似 bash 的管道操作符。

#### 简单管道


```yaml
a:
  b: cat
```

```bash
yq '.a | .b' sample.yml
```

输出：
```yaml
cat
```

#### 多重更新


```yaml
a: cow
b: sheep
c: same
```

```bash
yq '.a = "cat" | .b = "dog"' sample.yml
```

输出：
```yaml
a: cat
b: dog
c: same
```

---

### 联合 (Union)

> 此操作符用于组合不同的结果。

#### 组合标量

```bash
yq --null-input '1, true, "cat"'
```

输出：
```yaml
1
---
true
---
cat
```

#### 组合选择路径


```yaml
a: fieldA
b: fieldB
c: fieldC
```

```bash
yq '.a, .c' sample.yml
```

输出：
```yaml
fieldA
---
fieldC
```

---


## 算术与数学运算

### 加法 (Add)

> Add 根据 LHS 的类型不同而有不同的行为：
> - **数组**：连接
> - **数字标量**：算术加法
> - **字符串标量**：连接
> - **映射**：浅合并（使用乘号运算符 `*` 进行深合并）
>
> 使用 `+=` 作为相对追加赋值，如递增。注意 `.a += .x` 等价于运行 `.a = .a + .x`。

#### 连接数组


```yaml
a:
  - 1
  - 2
b:
  - 3
  - 4
```

```bash
yq '.a + .b' sample.yml
```

输出：
```yaml
- 1
- 2
- 3
- 4
```

#### 追加到现有数组

注意 `a` 的样式被保留。


```yaml
a: [1,2]
b:
  - 3
  - 4
```

```bash
yq '.a += .b' sample.yml
```

输出：
```yaml
a: [1, 2, 3, 4]
b:
  - 3
  - 4
```

#### 连接 null 到数组


```yaml
a:
  - 1
  - 2
```

```bash
yq '.a + null' sample.yml
```

输出：
```yaml
- 1
- 2
```

#### 追加到现有数组

注意样式从现有数组元素复制。


```yaml
a: ['dog']
```

```bash
yq '.a += "cat"' sample.yml
```

输出：
```yaml
a: ['dog', 'cat']
```

#### 前置到现有数组


```yaml
a:
  - dog
```

```bash
yq '.a = ["cat"] + .a' sample.yml
```

输出：
```yaml
a:
  - cat
  - dog
```

#### 向数组添加新对象


```yaml
a:
  - dog: woof
```

```bash
yq '.a + {"cat": "meow"}' sample.yml
```

输出：
```yaml
- dog: woof
- cat: meow
```

#### 相对追加


```yaml
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
```

输出：
```yaml
a:
  a1:
    b:
      - cat
      - mouse
  a2:
    b:
      - dog
      - mouse
  a3:
    b:
      - mouse
```

#### 字符串连接


```yaml
a: cat
b: meow
```

```bash
yq '.a += .b' sample.yml
```

输出：
```yaml
a: catmeow
b: meow
```

#### 数字加法 - 浮点

如果 lhs 或 rhs 是浮点数，则使用浮点数计算。


```yaml
a: 3
b: 4.9
```

```bash
yq '.a = .a + .b' sample.yml
```

输出：
```yaml
a: 7.9
b: 4.9
```

#### 数字加法 - 整数

如果 lhs 和 rhs 都是整数，则使用整数计算。


```yaml
a: 3
b: 4
```

```bash
yq '.a = .a + .b' sample.yml
```

输出：
```yaml
a: 7
b: 4
```

#### 递增数字


```yaml
a: 3
b: 5
```

```bash
yq '.[] += 1' sample.yml
```

输出：
```yaml
a: 4
b: 6
```

#### 日期加法

可以向日期添加持续时间。假设 RFC3339 日期时间格式。


```yaml
a: 2021-01-01T00:00:00Z
```

```bash
yq '.a += "3h10m"' sample.yml
```

输出：
```yaml
a: 2021-01-01T03:10:00Z
```

#### 日期加法 - 自定义格式


```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST", .a += "3h1m")' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 6:00AM GMT
```

#### 添加到 null

添加到 null 直接返回 rhs。

```bash
yq --null-input 'null + "cat"'
```

输出：
```yaml
cat
```

#### 映射浅合并

添加对象会浅合并。使用 `*` 进行深合并。


```yaml
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
```

输出：
```yaml
a:
  thing:
    name: Bstuff
    legs: 3
  a1: cool
  b1: neat
b:
  thing:
    name: Bstuff
    legs: 3
  b1: neat
```

#### 自定义类型：实际上是字符串

遇到自定义标签时，yq 会尝试解码底层类型。


```yaml
a: !horse cat
b: !goat _meow
```

```bash
yq '.a += .b' sample.yml
```

输出：
```yaml
a: !horse cat_meow
b: !goat _meow
```

#### 自定义类型：实际上是数字


```yaml
a: !horse 1.2
b: !goat 2.3
```

```bash
yq '.a += .b' sample.yml
```

输出：
```yaml
a: !horse 3.5
b: !goat 2.3
```

---

### 减法 (Subtract)

> 可以使用减法来减去数字以及从数组中移除元素。

#### 数组减法

```bash
yq --null-input '[1,2] - [2,3]'
```

输出：
```yaml
- 1
```

#### 带嵌套数组的数组减法

```bash
yq --null-input '[[1], 1, 2] - [[1], 3]'
```

输出：
```yaml
- 1
- 2
```

#### 带嵌套对象的数组减法

注意键的顺序不重要。


```yaml
- a: b
  c: d
- a: b
```

```bash
yq '. - [{"c": "d", "a": "b"}]' sample.yml
```

输出：
```yaml
- a: b
```

#### 数字减法 - 浮点

如果 lhs 或 rhs 是浮点数，则使用浮点数计算。


```yaml
a: 3
b: 4.5
```

```bash
yq '.a = .a - .b' sample.yml
```

输出：
```yaml
a: -1.5
b: 4.5
```

#### 数字减法 - 整数

如果 lhs 和 rhs 都是整数，则使用整数计算。


```yaml
a: 3
b: 4
```

```bash
yq '.a = .a - .b' sample.yml
```

输出：
```yaml
a: -1
b: 4
```

#### 递减数字


```yaml
a: 3
b: 5
```

```bash
yq '.[] -= 1' sample.yml
```

输出：
```yaml
a: 2
b: 4
```

#### 日期减法

可以从日期减去持续时间。假设 RFC3339 日期时间格式。


```yaml
a: 2021-01-01T03:10:00Z
```

```bash
yq '.a -= "3h10m"' sample.yml
```

输出：
```yaml
a: 2021-01-01T00:00:00Z
```

#### 日期减法 - 自定义格式


```yaml
a: Saturday, 15-Dec-01 at 6:00AM GMT
```

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST", .a -= "3h1m")' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

#### 自定义类型：实际上是数字


```yaml
a: !horse 2
b: !goat 1
```

```bash
yq '.a -= .b' sample.yml
```

输出：
```yaml
a: !horse 1
b: !goat 1
```

---


### 乘法/深度合并 (Multiply / Merge)

> 与 jq 的乘号运算符类似，根据操作数的不同，此乘号运算符会做不同的事情。目前支持数字、数组和对象。
>
> **对象和数组 - 合并**：对象通过匹配键进行深合并。默认情况下，数组值会覆盖，不会深合并。
>
> 可以使用加号运算符 `+` 进行浅合并。
>
> 注意，合并对象时，此运算符返回合并后的对象（不是父对象）。
>
> **合并标志**：
> - `+` 追加数组
> - `d` 深合并数组
> - `?` 只合并已有字段
> - `n` 只合并新字段
> - `c` 覆盖自定义标签

#### 整数相乘


```yaml
a: 3
b: 4
```

```bash
yq '.a *= .b' sample.yml
```

输出：
```yaml
a: 12
b: 4
```

#### 字符串节点 × 整数


```yaml
b: banana
```

```bash
yq '.b * 4' sample.yml
```

输出：
```yaml
bananabananabananabanana
```

#### 整数 × 字符串节点


```yaml
b: banana
```

```bash
yq '4 * .b' sample.yml
```

输出：
```yaml
bananabananabananabanana
```

#### 字符串 × 整数节点


```yaml
n: 4
```

```bash
yq '"banana" * .n' sample.yml
```

输出：
```yaml
bananabananabananabanana
```

#### 整数节点 × 字符串


```yaml
n: 4
```

```bash
yq '.n * "banana"' sample.yml
```

输出：
```yaml
bananabananabananabanana
```

#### 合并对象，仅返回合并结果


```yaml
a:
  field: me
  fieldA: cat
b:
  field:
    g: wizz
  fieldB: dog
```

```bash
yq '.a * .b' sample.yml
```

输出：
```yaml
field:
  g: wizz
fieldA: cat
fieldB: dog
```

#### 合并对象，返回父对象


```yaml
a:
  field: me
  fieldA: cat
b:
  field:
    g: wizz
  fieldB: dog
```

```bash
yq '. * {"a":.b}' sample.yml
```

输出：
```yaml
a:
  field:
    g: wizz
  fieldA: cat
  fieldB: dog
b:
  field:
    g: wizz
  fieldB: dog
```

#### 合并保持 LHS 样式


```yaml
a: {things: great}
b:
  also: "me"
```

```bash
yq '. * {"a":.b}' sample.yml
```

输出：
```yaml
a: {things: great, also: "me"}
b:
  also: "me"
```

#### 合并数组


```yaml
a:
  - 1
  - 2
  - 3
b:
  - 3
  - 4
  - 5
```

```bash
yq '. * {"a":.b}' sample.yml
```

输出：
```yaml
a:
  - 3
  - 4
  - 5
b:
  - 3
  - 4
  - 5
```

#### 合并，只合并已有字段


```yaml
a:
  thing: one
  cat: frog
b:
  missing: two
  thing: two
```

```bash
yq '.a *? .b' sample.yml
```

输出：
```yaml
thing: two
cat: frog
```

#### 合并，只合并新字段


```yaml
a:
  thing: one
  cat: frog
b:
  missing: two
  thing: two
```

```bash
yq '.a *n .b' sample.yml
```

输出：
```yaml
thing: one
cat: frog
missing: two
```

#### 合并，追加数组


```yaml
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
```

输出：
```yaml
array:
  - 1
  - 2
  - animal: dog
  - 3
  - 4
  - animal: cat
value: banana
```

#### 合并，只合并已有字段，追加数组


```yaml
a:
  thing:
    - 1
    - 2
b:
  thing:
    - 3
    - 4
  another:
    - 1
```

```bash
yq '.a *?+ .b' sample.yml
```

输出：
```yaml
thing:
  - 1
  - 2
  - 3
  - 4
```

#### 合并，深合并数组

深合并数组意味着数组像对象一样合并，索引作为键。


```yaml
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
```

输出：
```yaml
- name: fred
  age: 34
- name: bob
  age: 32
```

#### 合并对象数组，按键匹配

这是一个相当复杂的表达式——你可以按如下方式提供环境变量直接使用。

它将第二个文件中的数组合并到第一个文件中——按相等键匹配。

解释：

高层次的方法是归约到一个合并的映射（以唯一键为键），然后将其转换回数组。

首先，表达式将从数组创建映射，以 idPath（我们要合并的唯一字段）为键。
reduce 运算符合并 '({}; . * $item )'，所以具有匹配键的数组元素将合并在一起。

接下来，我们将映射转换回数组，再次使用 reduce，将所有映射值连接在一起。

最后，我们将合并后的数组结果设置回第一个文档。


```yaml
myArray:
  - a: apple
    b: appleB
  - a: kiwi
    b: kiwiB
  - a: banana
    b: bananaB
something: else
```

以及 another.yml：
```yaml
newArray:
  - a: banana
    c: bananaC
  - a: apple
    b: appleB2
  - a: dingo
    c: dingoC
```

```bash
idPath=".a"  originalPath=".myArray"  otherPath=".newArray" yq eval-all '
(
  (( (eval(strenv(originalPath)) + eval(strenv(otherPath)))  | .[] | {(eval(strenv(idPath))):  .}) as $item ireduce ({}; . * $item )) as $uniqueMap
  | ( $uniqueMap  | to_entries | .[]) as $item ireduce([]; . + $item.value)
) as $mergedArray
| select(fi == 0) | (eval(strenv(originalPath))) = $mergedArray
' sample.yml another.yml
```

输出：
```yaml
myArray:
  - a: apple
    b: appleB2
  - a: kiwi
    b: kiwiB
  - a: banana
    b: bananaB
    c: bananaC
  - a: dingo
    c: dingoC
something: else
```

#### 合并以添加前缀元素


```yaml
a: cat
b: dog
```

```bash
yq '. * {"a": {"c": .a}}' sample.yml
```

输出：
```yaml
a:
  c: cat
b: dog
```

#### 合并简单别名


```yaml
a: &cat
  c: frog
b:
  f: *cat
c:
  g: thongs
```

```bash
yq '.c * .b' sample.yml
```

输出：
```yaml
g: thongs
f: *cat
```

#### 合并复制锚点名


```yaml
a:
  c: &cat frog
b:
  f: *cat
c:
  g: thongs
```

```bash
yq '.c * .a' sample.yml
```

输出：
```yaml
g: thongs
c: &cat frog
```

#### 合并合并锚点


```yaml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  <<:
    - *foo
    - *bar
  c: foobarList_c
foobar:
  c: foobar_c
  <<: *foo
  thing: foobar_thing
```

```bash
yq '.foobar * .foobarList' sample.yml
```

输出：
```yaml
c: foobarList_c
<<:
  - *foo
  - *bar
thing: foobar_thing
b: foobarList_b
```

#### 自定义类型：实际上是数字


```yaml
a: !horse 2
b: !goat 3
```

```bash
yq '.a = .a * .b' sample.yml
```

输出：
```yaml
a: !horse 6
b: !goat 3
```

#### 自定义类型：实际上是映射


```yaml
a: !horse
  cat: meow
b: !goat
  dog: woof
```

```bash
yq '.a = .a * .b' sample.yml
```

输出：
```yaml
a: !horse
  cat: meow
  dog: woof
b: !goat
  dog: woof
```

#### 自定义类型：覆盖标签

使用 `c` 选项覆盖自定义标签。


```yaml
a: !horse
  cat: meow
b: !goat
  dog: woof
```

```bash
yq '.a *=c .b' sample.yml
```

输出：
```yaml
a: !goat
  cat: meow
  dog: woof
b: !goat
  dog: woof
```

#### null 与映射合并

```bash
yq --null-input 'null * {"some": "thing"}'
```

输出：
```yaml
some: thing
```

#### 映射与 null 合并

```bash
yq --null-input '{"some": "thing"} * null'
```

输出：
```yaml
some: thing
```

#### null 与数组合并

```bash
yq --null-input 'null * ["some"]'
```

输出：
```yaml
- some
```

#### 数组与 null 合并

```bash
yq --null-input '["some"] * null'
```

输出：
```yaml
- some
```

---

### 除法 (Divide)

> Divide 根据 LHS 的类型不同而有不同的行为：
> - **字符串**：按分隔符分割
> - **数字**：算术除法

#### 字符串分割


```yaml
a: cat_meow
b: _
```

```bash
yq '.c = .a / .b' sample.yml
```

输出：
```yaml
a: cat_meow
b: _
c:
  - cat
  - meow
```

#### 数字除法

除法结果计算为浮点数。


```yaml
a: 12
b: 2.5
```

```bash
yq '.a = .a / .b' sample.yml
```

输出：
```yaml
a: 4.8
b: 2.5
```

#### 数字除以零

除以零结果为 +Inf 或 -Inf。


```yaml
a: 1
b: -1
```

```bash
yq '.a = .a / 0 | .b = .b / 0' sample.yml
```

输出：
```yaml
a: +Inf
b: -Inf
```

---

### 取模 (Modulo)

> 算术取模运算符，返回两数相除的余数。

#### 数字取模 - 整数

如果 lhs 和 rhs 都是整数，则使用整数计算。


```yaml
a: 13
b: 2
```

```bash
yq '.a = .a % .b' sample.yml
```

输出：
```yaml
a: 1
b: 2
```

#### 数字取模 - 浮点

如果 lhs 或 rhs 是浮点数，则使用浮点数计算。


```yaml
a: 12
b: 2.5
```

```bash
yq '.a = .a % .b' sample.yml
```

输出：
```yaml
a: 2
b: 2.5
```

#### 数字取模 - 整数除以零

如果 lhs 是整数且 rhs 是 0，结果是错误。


```yaml
a: 1
b: 0
```

```bash
yq '.a = .a % .b' sample.yml
```

输出：
```bash
Error: cannot modulo by 0
```

#### 数字取模 - 浮点除以零

如果 lhs 是浮点数且 rhs 是 0，结果是 NaN。


```yaml
a: 1.1
b: 0
```

```bash
yq '.a = .a % .b' sample.yml
```

输出：
```yaml
a: NaN
b: 0
```

---

### 转数字 (To Number)

> 将输入解析为数字。yq 会先尝试解析为整数，失败则尝试浮点。已经是整数或浮点的值保持不变。

#### 字符串转数字


```yaml
- "3"
- "3.1"
- "-1e3"
```

```bash
yq '.[] | to_number' sample.yml
```

输出：
```yaml
3
---
3.1
---
-1e3
```

#### 不改变数字


```yaml
- 3
- 3.1
- -1e3
```

```bash
yq '.[] | to_number' sample.yml
```

输出：
```yaml
3
---
3.1
---
-1e3
```

#### 无法转换 null

```bash
yq --null-input '.a.b | to_number'
```

输出：
```bash
Error: cannot convert node value [null] at path a.b of tag !!null to number
```

---


## 数组操作

### 收集为数组 (Collect into Array)

> 使用方括号内的表达式创建数组。

#### 收集空数组

```bash
yq --null-input '[]'
```

输出：
```yaml
[]
```

#### 收集单个

```bash
yq --null-input '["cat"]'
```

输出：
```yaml
- cat
```

#### 收集多个


```yaml
a: cat
b: dog
```

```bash
yq '[.a, .b]' sample.yml
```

输出：
```yaml
- cat
- dog
```

---

### 数组/字符串切片 (Slice Array or String)

> 切片运算符适用于数组和字符串。与 jq 等价物类似，`.[10:15]` 将返回长度为 5 的子数组（或子字符串），从索引 10（含）开始，到索引 15（不含）结束。负数从数组或字符串末尾倒数。
>
> 可以省略第一个或第二个数字，分别表示从数组或字符串的开头或末尾开始。

#### 数组切片


```yaml
- cat
- dog
- frog
- cow
```

```bash
yq '.[1:3]' sample.yml
```

输出：
```yaml
- dog
- frog
```

#### 数组切片 - 省略第一个数字

从数组开头开始。


```yaml
- cat
- dog
- frog
- cow
```

```bash
yq '.[:2]' sample.yml
```

输出：
```yaml
- cat
- dog
```

#### 数组切片 - 省略第二个数字

到数组末尾结束。


```yaml
- cat
- dog
- frog
- cow
```

```bash
yq '.[2:]' sample.yml
```

输出：
```yaml
- frog
- cow
```

#### 数组切片 - 使用负数从末尾倒数


```yaml
- cat
- dog
- frog
- cow
```

```bash
yq '.[1:-1]' sample.yml
```

输出：
```yaml
- dog
- frog
```

#### 插入数组中间

使用表达式查找索引。


```yaml
- cat
- dog
- frog
- cow
```

```bash
yq '(.[] | select(. == "dog") | key + 1) as $pos | .[0:($pos)] + ["rabbit"] + .[$pos:]' sample.yml
```

输出：
```yaml
- cat
- dog
- rabbit
- frog
- cow
```

#### 字符串切片


```yaml
country: Australia
```

```bash
yq '.country[0:5]' sample.yml
```

输出：
```yaml
Austr
```

#### 字符串切片 - 省略第二个数字

到字符串末尾结束。


```yaml
country: Australia
```

```bash
yq '.country[5:]' sample.yml
```

输出：
```yaml
alia
```

#### 字符串切片 - 省略第一个数字

从字符串开头开始。


```yaml
country: Australia
```

```bash
yq '.country[:5]' sample.yml
```

输出：
```yaml
Austr
```

#### 字符串切片 - 使用负数从末尾倒数

负数索引从字符串末尾计数。


```yaml
country: Australia
```

```bash
yq '.country[-5:]' sample.yml
```

输出：
```yaml
ralia
```

#### 字符串切片 - Unicode

索引基于符文，所以多字节字符正确处理。


```yaml
greeting: héllo
```

```bash
yq '.greeting[1:3]' sample.yml
```

输出：
```yaml
él
```

---

### 扁平化 (Flatten)

> 递归扁平化数组。

#### 扁平化

递归扁平化所有数组。


```yaml
- 1
- - 2
- - - 3
```

```bash
yq 'flatten' sample.yml
```

输出：
```yaml
- 1
- 2
- 3
```

#### 深度为一的扁平化


```yaml
- 1
- - 2
- - - 3
```

```bash
yq 'flatten(1)' sample.yml
```

输出：
```yaml
- 1
- 2
- - 3
```

#### 扁平化空数组


```yaml
- []
```

```bash
yq 'flatten' sample.yml
```

输出：
```yaml
[]
```

#### 扁平化对象数组


```yaml
- foo: bar
- - foo: baz
```

```bash
yq 'flatten' sample.yml
```

输出：
```yaml
- foo: bar
- foo: baz
```

---

### 反转 (Reverse)

> 反转数组中项目的顺序。

#### 反转


```yaml
- 1
- 2
- 3
```

```bash
yq 'reverse' sample.yml
```

输出：
```yaml
- 3
- 2
- 1
```

#### 按字符串字段降序排序

使用 sort 配合 reverse 实现降序排序。


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'sort_by(.a) | reverse' sample.yml
```

输出：
```yaml
- a: cat
- a: banana
- a: apple
```

---

### 随机排序 (Shuffle)

> 随机打乱数组。注意此命令不使用加密安全的随机数生成器来随机化数组顺序。

#### 随机排序数组


```yaml
- 1
- 2
- 3
- 4
- 5
```

```bash
yq 'shuffle' sample.yml
```

输出（示例）：
```yaml
- 5
- 2
- 4
- 1
- 3
```

#### 原地随机排序数组


```yaml
cool:
  - 1
  - 2
  - 3
  - 4
  - 5
```

```bash
yq '.cool |= shuffle' sample.yml
```

输出（示例）：
```yaml
cool:
  - 5
  - 2
  - 4
  - 1
  - 3
```

---

### 排序 (Sort)

> 排序数组。使用 `sort` 按原样排序数组，或使用 `sort_by(exp)` 按特定表达式排序（如子字段）。
>
> 要降序排序，在排序后将结果通过 `reverse` 运算符管道。
>
> 注意，目前 `yq` 只排序标量字段。

#### 按字符串字段排序


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'sort_by(.a)' sample.yml
```

输出：
```yaml
- a: apple
- a: banana
- a: cat
```

#### 按多字段排序


```yaml
- a: dog
- a: cat
  b: banana
- a: cat
  b: apple
```

```bash
yq 'sort_by(.a, .b)' sample.yml
```

输出：
```yaml
- a: cat
  b: apple
- a: cat
  b: banana
- a: dog
```

#### 按字符串字段降序排序

使用 sort 配合 reverse 实现降序排序。


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'sort_by(.a) | reverse' sample.yml
```

输出：
```yaml
- a: cat
- a: banana
- a: apple
```

#### 原地排序数组


```yaml
cool:
  - a: banana
  - a: cat
  - a: apple
```

```bash
yq '.cool |= sort_by(.a)' sample.yml
```

输出：
```yaml
cool:
  - a: apple
  - a: banana
  - a: cat
```

#### 按键排序对象数组

注意可以给 sort_by 复杂表达式，不只是路径。


```yaml
cool:
  - b: banana
  - a: banana
  - c: banana
```

```bash
yq '.cool |= sort_by(keys | .[0])' sample.yml
```

输出：
```yaml
cool:
  - a: banana
  - b: banana
  - c: banana
```

#### 排序映射

默认按值排序映射。


```yaml
y: b
z: a
x: c
```

```bash
yq 'sort' sample.yml
```

输出：
```yaml
z: a
y: b
x: c
```

#### 按键排序映射

使用 sort_by 配合自定义函数排序映射。


```yaml
Y: b
z: a
x: c
```

```bash
yq 'sort_by(key | downcase)' sample.yml
```

输出：
```yaml
x: c
Y: b
z: a
```

#### 排序是稳定的

注意相等元素的顺序保持不变。


```yaml
- a: banana
  b: 1
- a: banana
  b: 2
- a: banana
  b: 3
- a: banana
  b: 4
```

```bash
yq 'sort_by(.a)' sample.yml
```

输出：
```yaml
- a: banana
  b: 1
- a: banana
  b: 2
- a: banana
  b: 3
- a: banana
  b: 4
```

#### 按数字字段排序


```yaml
- a: 10
- a: 100
- a: 1
```

```bash
yq 'sort_by(.a)' sample.yml
```

输出：
```yaml
- a: 1
- a: 10
- a: 100
```

#### 按自定义日期字段排序


```yaml
- a: 12-Jun-2011
- a: 23-Dec-2010
- a: 10-Aug-2011
```

```bash
yq 'with_dtf("02-Jan-2006"; sort_by(.a))' sample.yml
```

输出：
```yaml
- a: 23-Dec-2010
- a: 12-Jun-2011
- a: 10-Aug-2011
```

#### 排序，null 排在最前


```yaml
- 8
- 3
- null
- 6
- true
- false
- cat
```

```bash
yq 'sort' sample.yml
```

输出：
```yaml
- null
- false
- true
- 3
- 6
- 8
- cat
```

---

### 按键排序 (Sort Keys)

> Sort Keys 运算符按键（基于字符串值）排序映射。此运算符对数组或标量不做任何操作（所以你可以轻松递归应用到所有映射）。
>
> Sort 对比较两个不同 YAML 文档特别有用。

#### 映射键排序


```yaml
c: frog
a: blah
b: bing
```

```bash
yq 'sort_keys(.)' sample.yml
```

输出：
```yaml
a: blah
b: bing
c: frog
```

#### 递归键排序

注意数组元素保持未排序，但数组内的映射被排序。


```yaml
bParent:
  c: dog
  array:
    - 3
    - 1
    - 2
aParent:
  z: donkey
  x:
    - c: yum
      b: delish
    - b: ew
      a: apple
```

```bash
yq 'sort_keys(..)' sample.yml
```

输出：
```yaml
aParent:
  x:
    - b: delish
      c: yum
    - a: apple
      b: ew
  z: donkey
bParent:
  array:
    - 3
    - 1
    - 2
  c: dog
```

---


### 去重 (Unique)

> 用于过滤数组中的重复项。注意原始数组顺序被保持。

#### 标量数组去重（字符串/数字）

注意 unique 保持数组的原始顺序。


```yaml
- 2
- 1
- 3
- 2
```

```bash
yq 'unique' sample.yml
```

输出：
```yaml
- 2
- 1
- 3
```

#### null 去重

Unique 作用于节点值，所以不同表示的 null 被视为不同。


```yaml
- ~
- null
- ~
- null
```

```bash
yq 'unique' sample.yml
```

输出：
```yaml
- ~
- null
```

#### 所有 null 去重

对节点标签运行 unique 以统一所有 null。


```yaml
- ~
- null
- ~
- null
```

```bash
yq 'unique_by(tag)' sample.yml
```

输出：
```yaml
- ~
```

#### 对象数组去重


```yaml
- name: harry
  pet: cat
- name: billy
  pet: dog
- name: harry
  pet: cat
```

```bash
yq 'unique' sample.yml
```

输出：
```yaml
- name: harry
  pet: cat
- name: billy
  pet: dog
```

#### 按字段对对象数组去重


```yaml
- name: harry
  pet: cat
- name: billy
  pet: dog
- name: harry
  pet: dog
```

```bash
yq 'unique_by(.name)' sample.yml
```

输出：
```yaml
- name: harry
  pet: cat
- name: billy
  pet: dog
```

#### 数组的数组去重


```yaml
- - cat
  - dog
- - cat
  - sheep
- - cat
  - dog
```

```bash
yq 'unique' sample.yml
```

输出：
```yaml
- - cat
  - dog
- - cat
  - sheep
```

---

### 过滤 (Filter)

> 按给定表达式过滤数组（或映射值）。等价于 `map(select(exp))`。

#### 过滤数组


```yaml
- 1
- 2
- 3
```

```bash
yq 'filter(. < 3)' sample.yml
```

输出：
```yaml
- 1
- 2
```

#### 过滤映射值


```yaml
c:
  things: cool
  frog: yes
d:
  things: hot
  frog: false
```

```bash
yq 'filter(.things == "cool")' sample.yml
```

输出：
```yaml
- things: cool
  frog: yes
```

---

### 首个匹配 (First)

> 返回数组中第一个匹配的元素，或映射中第一个匹配的值。
>
> 可以给出匹配表达式，否则只返回第一个。

#### 数组首个匹配元素


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'first(.a == "cat")' sample.yml
```

输出：
```yaml
a: cat
```

#### 数组首个匹配元素（多个匹配）


```yaml
- a: banana
- a: cat
  b: firstCat
- a: apple
- a: cat
  b: secondCat
```

```bash
yq 'first(.a == "cat")' sample.yml
```

输出：
```yaml
a: cat
b: firstCat
```

#### 数组首个匹配元素（数值条件）


```yaml
- a: 10
- a: 100
- a: 1
- a: 101
```

```bash
yq 'first(.a > 50)' sample.yml
```

输出：
```yaml
a: 100
```

#### 数组首个匹配元素（布尔条件）


```yaml
- a: false
- a: true
  b: firstTrue
- a: false
- a: true
  b: secondTrue
```

```bash
yq 'first(.a == true)' sample.yml
```

输出：
```yaml
a: true
b: firstTrue
```

#### 数组首个匹配元素（null 值）


```yaml
- a: null
- a: cat
- a: apple
```

```bash
yq 'first(.a != null)' sample.yml
```

输出：
```yaml
a: cat
```

#### 数组首个匹配元素（复杂条件）


```yaml
- a: dog
  b: 7
- a: cat
  b: 3
- a: apple
  b: 5
```

```bash
yq 'first(.b > 4 and .b < 6)' sample.yml
```

输出：
```yaml
a: apple
b: 5
```

#### 映射首个匹配元素


```yaml
x:
  a: banana
y:
  a: cat
z:
  a: apple
```

```bash
yq 'first(.a == "cat")' sample.yml
```

输出：
```yaml
a: cat
```

#### 映射首个匹配元素（数值条件）


```yaml
x:
  a: 10
y:
  a: 100
z:
  a: 101
```

```bash
yq 'first(.a > 50)' sample.yml
```

输出：
```yaml
a: 100
```

#### 嵌套结构首个匹配元素


```yaml
items:
  - a: banana
  - a: cat
  - a: apple
```

```bash
yq '.items | first(.a == "cat")' sample.yml
```

输出：
```yaml
a: cat
```

#### 无匹配的首个匹配元素


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'first(.a == "dog")' sample.yml
```

输出为空。

#### 空数组的首个匹配元素


```yaml
[]
```

```bash
yq 'first(.a == "cat")' sample.yml
```

输出为空。

#### 标量节点的首个匹配元素


```yaml
hello
```

```bash
yq 'first(. == "hello")' sample.yml
```

输出为空。

#### null 节点的首个匹配元素


```yaml
null
```

```bash
yq 'first(. == "hello")' sample.yml
```

输出为空。

#### 字符串条件的首个匹配元素


```yaml
- a: banana
- a: cat
- a: apple
```

```bash
yq 'first(.a | test("^c"))' sample.yml
```

输出：
```yaml
a: cat
```

#### 长度条件的首个匹配元素


```yaml
- a: hi
- a: hello
- a: world
```

```bash
yq 'first(.a | length > 4)' sample.yml
```

输出：
```yaml
a: hello
```

#### 字符串数组的首个匹配元素


```yaml
- banana
- cat
- apple
```

```bash
yq 'first(. == "cat")' sample.yml
```

输出：
```yaml
cat
```

#### 数字数组的首个匹配元素


```yaml
- 10
- 100
- 1
```

```bash
yq 'first(. > 50)' sample.yml
```

输出：
```yaml
100
```

#### 无过滤的数组首个元素


```yaml
- 10
- 100
- 1
```

```bash
yq 'first' sample.yml
```

输出：
```yaml
10
```

#### 映射数组的无过滤首个元素


```yaml
- a: 10
- a: 100
```

```bash
yq 'first' sample.yml
```

输出：
```yaml
a: 10
```

---

### 分组 (Group By)

> 用于按表达式对数组中的项目进行分组。

#### 按字段分组


```yaml
- foo: 1
  bar: 10
- foo: 3
  bar: 100
- foo: 1
  bar: 1
```

```bash
yq 'group_by(.foo)' sample.yml
```

输出：
```yaml
- - foo: 1
    bar: 10
  - foo: 1
    bar: 1
- - foo: 3
    bar: 100
```

#### 按字段分组，含 null


```yaml
- cat: dog
- foo: 1
  bar: 10
- foo: 3
  bar: 100
- no: foo for you
- foo: 1
  bar: 1
```

```bash
yq 'group_by(.foo)' sample.yml
```

输出：
```yaml
- - cat: dog
  - no: foo for you
- - foo: 1
    bar: 10
  - foo: 1
    bar: 1
- - foo: 3
    bar: 100
```

---

### 透视 (Pivot)

> 模拟多个流行 RDBMS 系统支持的 `PIVOT` 函数。

#### 透视序列的序列


```yaml
- - foo
  - bar
  - baz
- - sis
  - boom
  - bah
```

```bash
yq 'pivot' sample.yml
```

输出：
```yaml
- - foo
  - sis
- - bar
  - boom
- - baz
  - bah
```

#### 透视异构序列的序列

缺失值被"填充"为 null。


```yaml
- - foo
  - bar
  - baz
- - sis
  - boom
  - bah
  - blah
```

```bash
yq 'pivot' sample.yml
```

输出：
```yaml
- - foo
  - sis
- - bar
  - boom
- - baz
  - bah
- -
  - blah
```

#### 透视映射序列


```yaml
- foo: a
  bar: b
  baz: c
- foo: x
  bar: y
  baz: z
```

```bash
yq 'pivot' sample.yml
```

输出：
```yaml
foo:
  - a
  - x
bar:
  - b
  - y
baz:
  - c
  - z
```

#### 透视异构映射序列

缺失值被"填充"为 null。


```yaml
- foo: a
  bar: b
  baz: c
- foo: x
  bar: y
  baz: z
  what: ever
```

```bash
yq 'pivot' sample.yml
```

输出：
```yaml
foo:
  - a
  - x
bar:
  - b
  - y
baz:
  - c
  - z
what:
  -
  - ever
```

---

### 数组转映射 (Array to Map)

> 使用此运算符将数组转换为映射。索引用作映射键，数组中的 null 值被跳过。
>
> 底层使用 reduce 实现：
> ```
> (.[] | select(. != null) ) as $i ireduce({}; .[$i | key] = $i)
> ```

#### 简单示例


```yaml
cool:
  - null
  - null
  - hello
```

```bash
yq '.cool |= array_to_map' sample.yml
```

输出：
```yaml
cool:
  2: hello
```

---

### 拆分为文档 (Split into Documents)

> 此运算符将所有匹配拆分为独立文档。

#### 拆分空

```bash
yq --null-input 'split_doc'
```

输出为空文档。

#### 拆分数组


```yaml
- a: cat
- b: dog
```

```bash
yq '.[] | split_doc' sample.yml
```

输出：
```yaml
a: cat
---
b: dog
```

---


## 对象/映射操作

### 创建对象 (Create, Collect into Object)

> 用于构造对象（或映射）。可以用于现有 yaml，或创建全新的 yaml 文档。

#### 收集空对象

```bash
yq --null-input '{}'
```

输出：
```yaml
{}
```

#### 包装（前缀）现有对象


```yaml
name: Mike
```

```bash
yq '{"wrap": .}' sample.yml
```

输出：
```yaml
wrap:
  name: Mike
```

#### 使用 splat 创建多个对象


```yaml
name: Mike
pets:
  - cat
  - dog
```

```bash
yq '{.name: .pets.[]}' sample.yml
```

输出：
```yaml
Mike: cat
---
Mike: dog
```

#### 多文档处理


```yaml
name: Mike
pets:
  - cat
  - dog
---
name: Rosey
pets:
  - monkey
  - sheep
```

```bash
yq '{.name: .pets.[]}' sample.yml
```

输出：
```yaml
Mike: cat
---
Mike: dog
---
Rosey: monkey
---
Rosey: sheep
```

#### 从零创建 yaml

```bash
yq --null-input '{"wrap": "frog"}'
```

输出：
```yaml
wrap: frog
```

#### 从零创建多个对象

```bash
yq --null-input '(.a.b = "foo") | (.d.e = "bar")'
```

输出：
```yaml
a:
  b: foo
d:
  e: bar
```

---

### 键值对转换 (Entries)

> 与 `jq` 中同名函数类似，这些函数在对象和键值对数组之间转换。对映射键执行操作时最有用。
>
> 使用 `with_entries(op)` 作为 `to_entries | op | from_entries` 的语法糖。

#### to_entries 映射


```yaml
a: 1
b: 2
```

```bash
yq 'to_entries' sample.yml
```

输出：
```yaml
- key: a
  value: 1
- key: b
  value: 2
```

#### to_entries 数组


```yaml
- a
- b
```

```bash
yq 'to_entries' sample.yml
```

输出：
```yaml
- key: 0
  value: a
- key: 1
  value: b
```

#### to_entries null


```yaml
null
```

```bash
yq 'to_entries' sample.yml
```

输出为空。

#### from_entries 映射


```yaml
a: 1
b: 2
```

```bash
yq 'to_entries | from_entries' sample.yml
```

输出：
```yaml
a: 1
b: 2
```

#### from_entries 带数字键索引

from_entries 总是创建映射，即使键是数字。


```yaml
- a
- b
```

```bash
yq 'to_entries | from_entries' sample.yml
```

输出：
```yaml
0: a
1: b
```

#### 使用 with_entries 更新键


```yaml
a: 1
b: 2
```

```bash
yq 'with_entries(.key |= "KEY_" + .)' sample.yml
```

输出：
```yaml
KEY_a: 1
KEY_b: 2
```

#### 递归更新键

使用 `(.. | select(tag="map"))` 查找文档中所有映射，然后 `|=` 更新每个映射。在更新中，使用 with_entries。


```yaml
a: 1
b:
  b_a: nested
  b_b: thing
```

```bash
yq '(.. | select(tag=="!!map")) |= with_entries(.key |= "KEY_" + .)' sample.yml
```

输出：
```yaml
KEY_a: 1
KEY_b:
  KEY_b_a: nested
  KEY_b_b: thing
```

#### 自定义排序映射键

使用 to_entries 转换为键值对数组，使用 sort/sort_by 等排序数组，然后转换回来。


```yaml
a: 1
c: 3
b: 2
```

```bash
yq 'to_entries | sort_by(.key) | reverse | from_entries' sample.yml
```

输出：
```yaml
c: 3
b: 2
a: 1
```

#### 使用 with_entries 过滤映射


```yaml
a:
  b: bird
c:
  d: dog
```

```bash
yq 'with_entries(select(.value | has("b")))' sample.yml
```

输出：
```yaml
a:
  b: bird
```

---

### 选择字段 (Pick)

> 按指定键列表过滤映射。映射以 pick 列表的顺序返回键。
>
> 类似地，按指定索引列表过滤数组。

#### 从映射选择键

注意键的顺序匹配 pick 顺序，不存在的键被跳过。


```yaml
myMap:
  cat: meow
  dog: bark
  thing: hamster
  hamster: squeak
```

```bash
yq '.myMap |= pick(["hamster", "cat", "goat"])' sample.yml
```

输出：
```yaml
myMap:
  hamster: squeak
  cat: meow
```

#### 从映射选择键，包含所有键

我们创建 picked 键加所有当前键的映射，然后通过 unique 运行。


```yaml
myMap:
  cat: meow
  dog: bark
  thing: hamster
  hamster: squeak
```

```bash
yq '.myMap |= pick( (["thing"] + keys) | unique)' sample.yml
```

输出：
```yaml
myMap:
  thing: hamster
  cat: meow
  dog: bark
  hamster: squeak
```

#### 从数组选择索引

注意索引的顺序匹配 pick 顺序，不存在的索引被跳过。


```yaml
- cat
- leopard
- lion
```

```bash
yq 'pick([2, 0, 734, -5])' sample.yml
```

输出：
```yaml
- lion
- cat
```

---

### 排除字段 (Omit)

> 与 `pick` 类似，但指定的是不想要的键/索引。

#### 从映射排除键

注意不存在的键被跳过。


```yaml
myMap:
  cat: meow
  dog: bark
  thing: hamster
  hamster: squeak
```

```bash
yq '.myMap |= omit(["hamster", "cat", "goat"])' sample.yml
```

输出：
```yaml
myMap:
  dog: bark
  thing: hamster
```

#### 从数组排除索引

注意不存在的索引被跳过。


```yaml
- cat
- leopard
- lion
```

```bash
yq 'omit([2, 0, 734, -5])' sample.yml
```

输出：
```yaml
- leopard
```

---

### 获取键 (Keys)

> 使用 `keys` 运算符返回映射键或数组索引。

#### 映射键


```yaml
dog: woof
cat: meow
```

```bash
yq 'keys' sample.yml
```

输出：
```yaml
- dog
- cat
```

#### 数组键（索引）


```yaml
- apple
- banana
```

```bash
yq 'keys' sample.yml
```

输出：
```yaml
- 0
- 1
```

#### 获取数组键


```yaml
- 1
- 2
- 3
```

```bash
yq '.[1] | key' sample.yml
```

输出：
```yaml
1
```

#### 获取映射键


```yaml
a: thing
```

```bash
yq '.a | key' sample.yml
```

输出：
```yaml
a
```

#### 无键


```yaml
{}
```

```bash
yq 'key' sample.yml
```

输出为空。

#### 更新映射键


```yaml
a:
  x: 3
  y: 4
```

```bash
yq '(.a.x | key) = "meow"' sample.yml
```

输出：
```yaml
a:
  meow: 3
  y: 4
```

#### 从映射键获取注释


```yaml
a:
  # comment on key
  x: 3
  y: 4
```

```bash
yq '.a.x | key | headComment' sample.yml
```

输出：
```yaml
comment on key
```

#### 检查节点是否为键


```yaml
a:
  b:
    - cat
  c: frog
```

```bash
yq '[... | { "p": path | join("."), "isKey": is_key, "tag": tag }]' sample.yml
```

输出：
```yaml
- p: ""
  isKey: false
  tag: '!!map'
- p: a
  isKey: true
  tag: '!!str'
- p: a
  isKey: false
  tag: '!!map'
- p: a.b
  isKey: true
  tag: '!!str'
- p: a.b
  isKey: false
  tag: '!!seq'
- p: a.b.0
  isKey: false
  tag: '!!str'
- p: a.c
  isKey: true
  tag: '!!str'
- p: a.c
  isKey: false
  tag: '!!str'
```

---

### 存在检查 (Has)

> 如果键存在于映射中（或索引存在于数组中）则返回 true，否则返回 false。

#### 检查映射键


```yaml
- a: yes
- a: ~
- a:
- b: nope
```

```bash
yq '.[] | has("a")' sample.yml
```

输出：
```yaml
true
---
true
---
true
---
false
```

#### 选择，检查深层路径是否存在

简单地将父表达式管道传入 `has`。


```yaml
- a:
    b:
      c: cat
- a:
    b:
      d: dog
```

```bash
yq '.[] | select(.a.b | has("c"))' sample.yml
```

输出：
```yaml
a:
  b:
    c: cat
```

#### 检查数组索引


```yaml
- []
- [1]
- [1, 2]
- [1, null]
- [1, 2, 3]
```

```bash
yq '.[] | has(1)' sample.yml
```

输出：
```yaml
false
---
false
---
true
---
true
---
true
```

---


## 字符串操作

### 字符串操作 (String Operators)

> 此部分使用 Golang 的原生正则函数。支持的正则语法见 [re2 文档](https://github.com/google/re2/wiki/Syntax)。
>
> 大小写不敏感提示：在正则前加 `(?i)` 前缀，例如 `test("(?i)cats")`。

#### 插值


```yaml
value: things
another: stuff
```

```bash
yq '.message = "I like \(.value) and \(.another)"' sample.yml
```

输出：
```yaml
value: things
another: stuff
message: I like things and stuff
```

#### 插值 - 非字符串


```yaml
value:
  an: apple
```

```bash
yq '.message = "I like \(.value)"' sample.yml
```

输出：
```yaml
value:
  an: apple
message: 'I like an: apple'
```

#### 转大写

支持 Unicode 字符。


```yaml
água
```

```bash
yq 'upcase' sample.yml
```

输出：
```yaml
ÁGUA
```

#### 转小写

支持 Unicode 字符。


```yaml
ÁgUA
```

```bash
yq 'downcase' sample.yml
```

输出：
```yaml
água
```

#### 连接字符串


```yaml
- cat
- meow
- 1
- null
- true
```

```bash
yq 'join("; ")' sample.yml
```

输出：
```yaml
cat; meow; 1; ; true
```

#### 修剪字符串


```yaml
- ' cat'
- 'dog '
- ' cow cow '
- horse
```

```bash
yq '.[] | trim' sample.yml
```

输出：
```yaml
cat
dog
cow cow
horse
```

#### 匹配字符串


```yaml
foo bar foo
```

```bash
yq 'match("foo")' sample.yml
```

输出：
```yaml
string: foo
offset: 0
length: 3
captures: []
```

#### 匹配字符串，大小写不敏感


```yaml
foo bar FOO
```

```bash
yq '[match("(?i)foo"; "g")]' sample.yml
```

输出：
```yaml
- string: foo
  offset: 0
  length: 3
  captures: []
- string: FOO
  offset: 8
  length: 3
  captures: []
```

#### 全局捕获组匹配


```yaml
abc abc
```

```bash
yq '[match("(ab)(c)"; "g")]' sample.yml
```

输出：
```yaml
- string: abc
  offset: 0
  length: 3
  captures:
    - string: ab
      offset: 0
      length: 2
    - string: c
      offset: 2
      length: 1
- string: abc
  offset: 4
  length: 3
  captures:
    - string: ab
      offset: 4
      length: 2
    - string: c
      offset: 6
      length: 1
```

#### 命名捕获组匹配


```yaml
foo bar foo foo  foo
```

```bash
yq '[match("foo (?P<bar123>bar)? foo"; "g")]' sample.yml
```

输出：
```yaml
- string: foo bar foo
  offset: 0
  length: 11
  captures:
    - string: bar
      offset: 4
      length: 3
      name: bar123
- string: foo  foo
  offset: 12
  length: 8
  captures:
    - string: null
      offset: -1
      length: 0
      name: bar123
```

#### 捕获命名组到映射


```yaml
xyzzy-14
```

```bash
yq 'capture("(?P<a>[a-z]+)-(?P<n>[0-9]+)")' sample.yml
```

输出：
```yaml
a: xyzzy
n: "14"
```

#### 无全局标志匹配


```yaml
cat cat
```

```bash
yq 'match("cat")' sample.yml
```

输出：
```yaml
string: cat
offset: 0
length: 3
captures: []
```

#### 带全局标志匹配


```yaml
cat cat
```

```bash
yq '[match("cat"; "g")]' sample.yml
```

输出：
```yaml
- string: cat
  offset: 0
  length: 3
  captures: []
- string: cat
  offset: 4
  length: 3
  captures: []
```

#### 使用正则测试

与 jq 的等价物类似，像 match 但只返回 true/false 而不是完整匹配详情。


```yaml
- cat
- dog
```

```bash
yq '.[] | test("at")' sample.yml
```

输出：
```yaml
true
---
false
```

#### 替换字符串

使用 Golang 的正则。注意使用 `|=` 在当前字符串值上下文中运行。


```yaml
a: dogs are great
```

```bash
yq '.a |= sub("dogs", "cats")' sample.yml
```

输出：
```yaml
a: cats are great
```

#### 正则替换字符串

使用 Golang 的正则。注意使用 `|=` 在当前字符串值上下文中运行。


```yaml
a: cat
b: heat
```

```bash
yq '.[] |= sub("(a)", "${1}r")' sample.yml
```

输出：
```yaml
a: cart
b: heart
```

#### 自定义类型：实际上是字符串

遇到自定义标签时，yq 会尝试解码底层类型。


```yaml
a: !horse cat
b: !goat heat
```

```bash
yq '.[] |= sub("(a)", "${1}r")' sample.yml
```

输出：
```yaml
a: !horse cart
b: !goat heart
```

#### 分割字符串


```yaml
cat; meow; 1; ; true
```

```bash
yq 'split("; ")' sample.yml
```

输出：
```yaml
- cat
- meow
- "1"
- ""
- "true"
```

#### 字符串分割单个匹配


```yaml
word
```

```bash
yq 'split("; ")' sample.yml
```

输出：
```yaml
- word
```

#### 转字符串

注意你可能想强制 `yq` 保留标量值包装，通过传入 `--unwrapScalar=false` 或 `-r=f`。


```yaml
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
```

输出：
```yaml
- "1"
- "true"
- "null"
- "~"
- cat
- "an: object"
- "- array\n- 2"
```

---

### 长度 (Length)

> 返回节点的长度。长度根据节点类型定义。

#### 字符串长度

返回字符串长度。


```yaml
a: cat
```

```bash
yq '.a | length' sample.yml
```

输出：
```yaml
3
```

#### null 长度


```yaml
a: null
```

```bash
yq '.a | length' sample.yml
```

输出：
```yaml
0
```

#### 映射长度

返回条目数。


```yaml
a: cat
c: dog
```

```bash
yq 'length' sample.yml
```

输出：
```yaml
2
```

#### 数组长度

返回元素数。


```yaml
- 2
- 4
- 6
- 8
```

```bash
yq 'length' sample.yml
```

输出：
```yaml
4
```

---

### 包含 (Contains)

> 如果上下文包含传入参数则返回 `true`，否则返回 `false`。对于数组，如果传入数组包含在数组内则返回 true。对于字符串，如果字符串是子串则返回 true。
>
> **注意**：与 jq 一样，检查数组是否 `contains` 另一个数组时，将使用 `contains` 而不是 equals 检查每个字符串。所以 `contains(["cat"])` 对 `["cats"]` 返回 true。

#### 数组包含数组

数组相等或是子集。


```yaml
- foobar
- foobaz
- blarp
```

```bash
yq 'contains(["baz", "bar"])' sample.yml
```

输出：
```yaml
true
```

#### 数组子集检查

从子集减去超集数组，如果还有剩余，则不是子集。


```yaml
- foobar
- foobaz
- blarp
```

```bash
yq '["baz", "bar"] - . | length == 0' sample.yml
```

输出：
```yaml
false
```

#### 对象包含在数组中


```yaml
"foo": 12
"bar":
  - 1
  - 2
  - "barp": 12
    "blip": 13
```

```bash
yq 'contains({"bar": [{"barp": 12}]})' sample.yml
```

输出：
```yaml
true
```

#### 对象不包含在数组中


```yaml
"foo": 12
"bar":
  - 1
  - 2
  - "barp": 12
    "blip": 13
```

```bash
yq 'contains({"foo": 12, "bar": [{"barp": 15}]})' sample.yml
```

输出：
```yaml
false
```

#### 字符串包含子串


```yaml
foobar
```

```bash
yq 'contains("bar")' sample.yml
```

输出：
```yaml
true
```

#### 字符串等于字符串


```yaml
meow
```

```bash
yq 'contains("meow")' sample.yml
```

输出：
```yaml
true
```

---


## 条件与逻辑

### 选择过滤 (Select)

> Select 用于按布尔表达式过滤数组和映射。

#### 使用通配前缀从数组选择元素


```yaml
- cat
- goat
- dog
```

```bash
yq '.[] | select(. == "*at")' sample.yml
```

输出：
```yaml
cat
---
goat
```

#### 使用通配后缀从数组选择元素


```yaml
- go-kart
- goat
- dog
```

```bash
yq '.[] | select(. == "go*")' sample.yml
```

输出：
```yaml
go-kart
---
goat
```

#### 使用前后通配从数组选择元素


```yaml
- ago
- go
- meow
- going
```

```bash
yq '.[] | select(. == "*go*")' sample.yml
```

输出：
```yaml
ago
---
go
---
going
```

#### 使用正则表达式从数组选择元素


```yaml
- this_0
- not_this
- nor_0_this
- thisTo_4
```

```bash
yq '.[] | select(test("[a-zA-Z]+_[0-9]$"))' sample.yml
```

输出：
```yaml
this_0
---
thisTo_4
```

#### 从映射选择项


```yaml
things: cat
bob: goat
horse: dog
```

```bash
yq '.[] | select(. == "cat" or test("og$"))' sample.yml
```

输出：
```yaml
cat
---
dog
```

#### 使用 select 和 with_entries 过滤映射键


```yaml
name: bob
legs: 2
game: poker
```

```bash
yq 'with_entries(select(.key | test("ame$")))' sample.yml
```

输出：
```yaml
name: bob
game: poker
```

#### 在映射中选择多项并更新

注意整个 LHS 周围的括号。


```yaml
a:
  things: cat
  bob: goat
  horse: dog
```

```bash
yq '(.a.[] | select(. == "cat" or . == "goat")) |= "rabbit"' sample.yml
```

输出：
```yaml
a:
  things: rabbit
  bob: rabbit
  horse: dog
```

---

### 布尔操作 (Boolean Operators)

> `or` 和 `and` 运算符接受两个参数并返回布尔结果。
>
> `not` 翻转布尔值。
>
> `any` 如果数组序列中有任何 `true` 值则返回 `true`，`all` 如果数组中所有元素都是 true 则返回 true。
>
> `any_c(condition)` 和 `all_c(condition)` 类似 `any` 和 `all` 但接受条件表达式。
>
> 这些最常与 `select` 运算符一起使用来过滤特定节点。

#### or 示例

```bash
yq --null-input 'true or false'
```

输出：
```yaml
true
```

#### "yes" 和 "no" 是字符串

在 yaml 1.2 标准中，yes/no 作为布尔值的支持被移除了——它们现在被视为字符串。


```yaml
- yes
- no
```

```bash
yq '.[] | tag' sample.yml
```

输出：
```yaml
!!str
---
!!str
```

#### and 示例

```bash
yq --null-input 'true and false'
```

输出：
```yaml
false
```

#### 使用 select、equals 和 or 匹配节点


```yaml
- a: bird
  b: dog
- a: frog
  b: bird
- a: cat
  b: fly
```

```bash
yq '[.[] | select(.a == "cat" or .b == "dog")]' sample.yml
```

输出：
```yaml
- a: bird
  b: dog
- a: cat
  b: fly
```

#### any 如果给定数组中有任何布尔值为 true 则返回 true


```yaml
- false
- true
```

```bash
yq 'any' sample.yml
```

输出：
```yaml
true
```

#### any 对空数组返回 false


```yaml
[]
```

```bash
yq 'any' sample.yml
```

输出：
```yaml
false
```

#### any_c 如果数组中有任何元素对给定条件为 true 则返回 true


```yaml
a:
  - rad
  - awesome
b:
  - meh
  - whatever
```

```bash
yq '.[] |= any_c(. == "awesome")' sample.yml
```

输出：
```yaml
a: true
b: false
```

#### all 如果给定数组中所有布尔值都是 true 则返回 true


```yaml
- true
- true
```

```bash
yq 'all' sample.yml
```

输出：
```yaml
true
```

#### all 对空数组返回 true


```yaml
[]
```

```bash
yq 'all' sample.yml
```

输出：
```yaml
true
```

#### all_c 如果数组中所有元素对给定条件为 true 则返回 true


```yaml
a:
  - rad
  - awesome
b:
  - meh
  - 12
```

```bash
yq '.[] |= all_c(tag == "!!str")' sample.yml
```

输出：
```yaml
a: true
b: false
```

#### Not true 是 false

```bash
yq --null-input 'true | not'
```

输出：
```yaml
false
```

#### Not false 是 true

```bash
yq --null-input 'false | not'
```

输出：
```yaml
true
```

#### 字符串值被视为 true

```bash
yq --null-input '"cat" | not'
```

输出：
```yaml
false
```

#### 空字符串值被视为 true

```bash
yq --null-input '"" | not'
```

输出：
```yaml
false
```

#### 数字被视为 true

```bash
yq --null-input '1 | not'
```

输出：
```yaml
false
```

#### 零被视为 true

```bash
yq --null-input '0 | not'
```

输出：
```yaml
false
```

#### Null 被视为 false

```bash
yq --null-input '~ | not'
```

输出：
```yaml
true
```

---

### 等于/不等于 (Equals / Not Equals)

> 布尔运算符，如果 LHS 等于 RHS 则返回 `true`，否则返回 `false`。
>
> 不等运算符 `!=` 如果 LHS 等于 RHS 则返回 `false`。

#### 匹配字符串


```yaml
- cat
- goat
- dog
```

```bash
yq '.[] | (. == "*at")' sample.yml
```

输出：
```yaml
true
---
true
---
false
```

#### 不匹配字符串


```yaml
- cat
- goat
- dog
```

```bash
yq '.[] | (. != "*at")' sample.yml
```

输出：
```yaml
false
---
false
---
true
```

#### 匹配数字


```yaml
- 3
- 4
- 5
```

```bash
yq '.[] | (. == 4)' sample.yml
```

输出：
```yaml
false
---
true
---
false
```

#### 不匹配数字


```yaml
- 3
- 4
- 5
```

```bash
yq '.[] | (. != 4)' sample.yml
```

输出：
```yaml
true
---
false
---
true
```

#### 匹配 null

```bash
yq --null-input 'null == ~'
```

输出：
```yaml
true
```

#### 不存在的键不等于值


```yaml
a: frog
```

```bash
yq 'select(.b != "thing")' sample.yml
```

输出：
```yaml
a: frog
```

#### 两个不存在的键相等


```yaml
a: frog
```

```bash
yq 'select(.b == .c)' sample.yml
```

输出：
```yaml
a: frog
```

---

### 比较操作 (Compare Operators)

> 比较运算符（`>`, `>=`, `<`, `<=`）可用于比较同类型的标量值。
>
> 目前支持：数字、字符串、日期时间。

#### 比较数字 (>)


```yaml
a: 5
b: 4
```

```bash
yq '.a > .b' sample.yml
```

输出：
```yaml
true
```

#### 比较相等数字 (>=)


```yaml
a: 5
b: 5
```

```bash
yq '.a >= .b' sample.yml
```

输出：
```yaml
true
```

#### 比较字符串

按字节码比较字符串。


```yaml
a: zoo
b: apple
```

```bash
yq '.a > .b' sample.yml
```

输出：
```yaml
true
```

#### 比较日期时间

假设 RFC3339 日期时间格式。


```yaml
a: 2021-01-01T03:10:00Z
b: 2020-01-01T03:10:00Z
```

```bash
yq '.a > .b' sample.yml
```

输出：
```yaml
true
```

#### 两边都是 null: > 是 false

```bash
yq --null-input '.a > .b'
```

输出：
```yaml
false
```

#### 两边都是 null: >= 是 true

```bash
yq --null-input '.a >= .b'
```

输出：
```yaml
true
```

---

### 默认值 (Alternative / Default value)

> 此运算符用于在特定表达式为 null 或 false 时提供替代（或默认）值。

#### LHS 已定义


```yaml
a: bridge
```

```bash
yq '.a // "hello"' sample.yml
```

输出：
```yaml
bridge
```

#### LHS 未定义


```yaml
{}
```

```bash
yq '.a // "hello"' sample.yml
```

输出：
```yaml
hello
```

#### LHS 为 null


```yaml
a: ~
```

```bash
yq '.a // "hello"' sample.yml
```

输出：
```yaml
hello
```

#### LHS 为 false


```yaml
a: false
```

```bash
yq '.a // "hello"' sample.yml
```

输出：
```yaml
hello
```

#### RHS 为表达式


```yaml
a: false
b: cat
```

```bash
yq '.a // .b' sample.yml
```

输出：
```yaml
cat
```

#### 更新或创建 - 实体存在

这初始化 `a` 如果不存在。


```yaml
a: 1
```

```bash
yq '(.a // (.a = 0)) += 1' sample.yml
```

输出：
```yaml
a: 2
```

#### 更新或创建 - 实体不存在

这初始化 `a` 如果不存在。


```yaml
b: camel
```

```bash
yq '(.a // (.a = 0)) += 1' sample.yml
```

输出：
```yaml
b: camel
a: 1
```

---

### 错误处理 (Error)

> 使用此操作来短路表达式。对验证有用。

#### 验证特定值


```yaml
a: hello
```

```bash
yq 'select(.a == "howdy") or error(".a [" + .a + "] is not howdy!")' sample.yml
```

输出：
```bash
Error: .a [hello] is not howdy!
```

#### 验证环境变量是数字 - 无效

```bash
numberOfCats="please" yq --null-input 'env(numberOfCats) | select(tag == "!!int") or error("numberOfCats is not a number :(")'
```

输出：
```bash
Error: numberOfCats is not a number :(
```

#### 验证环境变量是数字 - 有效

`with` 可以是封装验证的便捷方式。


```yaml
name: Bob
favouriteAnimal: cat
```

```bash
numberOfCats="3" yq '
	with(env(numberOfCats); select(tag == "!!int") or error("numberOfCats is not a number :(")) | 
	.numPets = env(numberOfCats)
' sample.yml
```

输出：
```yaml
name: Bob
favouriteAnimal: cat
numPets: 3
```

---


## 路径与导航

### 路径操作 (Path)

> `path` 运算符可用于获取表达式中匹配节点的遍历路径。路径作为数组返回，按顺序遍历将到达匹配节点。
>
> 可以通过使用 `path` 运算符返回路径数组，然后管道通过 `.[-1]` 获取该数组的最后一个元素（键）来获取匹配节点的键/索引。
>
> 使用 `setpath` 将值设置到 `path` 返回的路径数组，类似地 `delpaths` 用于路径数组的数组。

#### 映射路径


```yaml
a:
  b: cat
```

```bash
yq '.a.b | path' sample.yml
```

输出：
```yaml
- a
- b
```

#### 获取映射键


```yaml
a:
  b: cat
```

```bash
yq '.a.b | path | .[-1]' sample.yml
```

输出：
```yaml
b
```

#### 数组路径


```yaml
a:
  - cat
  - dog
```

```bash
yq '.a.[] | select(. == "dog") | path' sample.yml
```

输出：
```yaml
- a
- 1
```

#### 获取数组索引


```yaml
a:
  - cat
  - dog
```

```bash
yq '.a.[] | select(. == "dog") | path | .[-1]' sample.yml
```

输出：
```yaml
1
```

#### 打印路径和值


```yaml
a:
  - cat
  - dog
  - frog
```

```bash
yq '.a[] | select(. == "*og") | [{"path":path, "value":.}]' sample.yml
```

输出：
```yaml
- path:
    - a
    - 1
  value: dog
- path:
    - a
    - 2
  value: frog
```

#### 设置路径


```yaml
a:
  b: cat
```

```bash
yq 'setpath(["a", "b"]; "things")' sample.yml
```

输出：
```yaml
a:
  b: things
```

#### 在空文档上设置

```bash
yq --null-input 'setpath(["a", "b"]; "things")'
```

输出：
```yaml
a:
  b: things
```

#### 设置路径以裁剪深层路径

类似 pick 但递归。使用 `ireduce` 将选中的路径深度设置到空对象中。


```yaml
parentA: bob
parentB:
  child1: i am child1
  child2: i am child2
parentC:
  child1: me child1
  child2: me child2
```

```bash
yq '(.parentB.child2, .parentC.child1) as $i
  ireduce({}; setpath($i | path; $i))' sample.yml
```

输出：
```yaml
parentB:
  child2: i am child2
parentC:
  child1: me child1
```

#### 设置数组路径


```yaml
a:
  - cat
  - frog
```

```bash
yq 'setpath(["a", 0]; "things")' sample.yml
```

输出：
```yaml
a:
  - things
  - frog
```

#### 设置空数组路径

```bash
yq --null-input 'setpath(["a", 0]; "things")'
```

输出：
```yaml
a:
  - things
```

#### 删除路径

注意 delpaths 接受路径数组的数组。


```yaml
a:
  b: cat
  c: dog
  d: frog
```

```bash
yq 'delpaths([["a", "c"], ["a", "d"]])' sample.yml
```

输出：
```yaml
a:
  b: cat
```

#### 删除数组路径


```yaml
a:
  - cat
  - frog
```

```bash
yq 'delpaths([["a", 0]])' sample.yml
```

输出：
```yaml
a:
  - frog
```

#### 删除 - 错误参数

delpaths 对单个路径数组不起作用。


```yaml
a:
  - cat
  - frog
```

```bash
yq 'delpaths(["a", 0])' sample.yml
```

输出：
```bash
Error: DELPATHS: expected entry [0] to be a sequence, but its a !!str. Note that delpaths takes an array of path arrays, e.g. [["a", "b"]]
```

---

### 父节点 (Parent)

> Parent 简单返回匹配节点的父节点。

#### 简单示例


```yaml
a:
  nested: cat
```

```bash
yq '.a.nested | parent' sample.yml
```

输出：
```yaml
nested: cat
```

#### 嵌套匹配的父节点


```yaml
a:
  fruit: apple
  name: bob
b:
  fruit: banana
  name: sam
```

```bash
yq '.. | select(. == "banana") | parent' sample.yml
```

输出：
```yaml
fruit: banana
name: sam
```

#### 获取父属性


```yaml
a:
  fruit: apple
  name: bob
b:
  fruit: banana
  name: sam
```

```bash
yq '.. | select(. == "banana") | parent.name' sample.yml
```

输出：
```yaml
sam
```

#### 获取所有父节点

匹配所有父节点。


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | parents' sample.yml
```

输出：
```yaml
- c: cat
- b:
    c: cat
- a:
    b:
      c: cat
```

#### 获取顶层（根）父节点

使用负数获取顶层父节点。可以将其视为索引上面的 'parents' 数组。


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | parent(-1)' sample.yml
```

输出：
```yaml
a:
  b:
    c: cat
```

#### Root

parent(-1) 的别名，返回顶层父节点。通常是文档节点。


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | root' sample.yml
```

输出：
```yaml
a:
  b:
    c: cat
```

#### N 级父节点

可以可选提供向上层数，默认为 1。


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | parent(2)' sample.yml
```

输出：
```yaml
b:
  c: cat
```

#### N 级父节点 - 另一层


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | parent(3)' sample.yml
```

输出：
```yaml
a:
  b:
    c: cat
```

#### N 级负数

类似地，使用负数从 parents 数组反向索引。


```yaml
a:
  b:
    c: cat
```

```bash
yq '.a.b.c | parent(-2)' sample.yml
```

输出：
```yaml
b:
  c: cat
```

#### 无父节点


```yaml
{}
```

```bash
yq 'parent' sample.yml
```

输出为空。

---

### 递归下降 (Recursive Descent / Glob)

> 此运算符递归匹配（或 glob）给定特定元素的所有子节点，包括该节点本身。最常用于对所有匹配递归应用过滤器。

#### 从 `..` 匹配值

这将递归匹配所有值节点，类似 jq 等价物。用于查找/操作特定值。

例如设置 yaml 文档中所有值节点的 `style`，排除映射键：
```bash
yq '.. style= "flow"' file.yaml
```

#### 从 `...` 匹配值和映射键

这也包括映射键在结果集中。这在 YAML 中特别有用，因为与 JSON 不同，映射键可以有自己的样式和标签，也使用锚点和别名。

例如设置 yaml 文档中所有节点的 `style`，包括映射键：
```bash
yq '... style= "flow"' file.yaml
```

#### 递归映射（仅值）


```yaml
a: frog
```

```bash
yq '..' sample.yml
```

输出：
```yaml
a: frog
---
frog
```

#### 递归查找带键的节点

注意此示例将表达式包裹在 `[]` 中以显示返回了两个匹配。你不必在路径表达式中包裹 `[]`。


```yaml
a:
  name: frog
  b:
    name: blog
    age: 12
```

```bash
yq '[.. | select(has("name"))]' sample.yml
```

输出：
```yaml
- name: frog
  b:
    name: blog
    age: 12
- name: blog
  age: 12
```

#### 递归查找带值的节点


```yaml
a:
  nameA: frog
  b:
    nameB: frog
    age: 12
```

```bash
yq '.. | select(. == "frog")' sample.yml
```

输出：
```yaml
frog
---
frog
```

#### 递归映射（值和键）

注意映射键出现在结果中。


```yaml
a: frog
```

```bash
yq '...' sample.yml
```

输出：
```yaml
a: frog
---
a
---
frog
```

#### 不遍历别名


```yaml
a: &cat
  c: frog
b: *cat
```

```bash
yq '[..]' sample.yml
```

输出：
```yaml
- a: &cat
    c: frog
  b: *cat
- &cat
  c: frog
- frog
- *cat
```

#### 不遍历合并文档


```yaml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  <<:
    - *foo
    - *bar
  c: foobarList_c
foobar:
  c: foobar_c
  <<: *foo
  thing: foobar_thing
```

```bash
yq '.foobar | [..]' sample.yml
```

输出：
```yaml
- c: foobar_c
  <<: *foo
  thing: foobar_thing
- foobar_c
- *foo
- foobar_thing
```

---

### 文档索引 (Document Index)

> 使用 `documentIndex` 运算符（或 `di` 简写）选择特定文档的节点。

#### 获取文档索引


```yaml
a: cat
---
a: frog
```

```bash
yq '.a | document_index' sample.yml
```

输出：
```yaml
0
---
1
```

#### 获取文档索引，简写


```yaml
a: cat
---
a: frog
```

```bash
yq '.a | di' sample.yml
```

输出：
```yaml
0
---
1
```

#### 按文档索引过滤


```yaml
a: cat
---
a: frog
```

```bash
yq 'select(document_index == 1)' sample.yml
```

输出：
```yaml
a: frog
```

#### 按文档索引简写过滤


```yaml
a: cat
---
a: frog
```

```bash
yq 'select(di == 1)' sample.yml
```

输出：
```yaml
a: frog
```

#### 打印文档索引和匹配


```yaml
a: cat
---
a: frog
```

```bash
yq '.a | ({"match": ., "doc": document_index})' sample.yml
```

输出：
```yaml
match: cat
doc: 0
---
match: frog
doc: 1
```

---


## 转换与编码

### 编码解码 (Encoder / Decoder)

> 编码运算符将管道传入的对象结构编码为所需格式的字符串。解码运算符做相反的事，它们将格式化字符串解码为相关对象结构。
>
> 注意可以可选传递缩进值给编码函数。
>
> 这些运算符对处理包含字符串化嵌入 yaml/json/props 的 yaml 文档很有用。

| 格式 | 解码（从字符串） | 编码（到字符串） |
|------|------------------|------------------|
| Yaml | from_yaml/@yamld | to_yaml(i)/@yaml |
| JSON | from_json/@jsond | to_json(i)/@json |
| Properties | from_props/@propsd | to_props/@props |
| CSV | from_csv/@csvd | to_csv/@csv |
| TSV | from_tsv/@tsvd | to_tsv/@tsv |
| XML | from_xml/@xmld | to_xml(i)/@xml |
| Base64 | @base64d | @base64 |
| URI | @urid | @uri |
| Shell | - | @sh |

#### 编码值为 JSON 字符串


```yaml
a:
  cool: thing
```

```bash
yq '.b = (.a | to_json)' sample.yml
```

输出：
```yaml
a:
  cool: thing
b: |
  {
    "cool": "thing"
  }
```

#### 编码值为单行 JSON 字符串

传入 0 缩进以单行打印 json。


```yaml
a:
  cool: thing
```

```bash
yq '.b = (.a | to_json(0))' sample.yml
```

输出：
```yaml
a:
  cool: thing
b: '{"cool":"thing"}'
```

#### 编码值为单行 JSON 字符串简写

传入 0 缩进以单行打印 json。


```yaml
a:
  cool: thing
```

```bash
yq '.b = (.a | @json)' sample.yml
```

输出：
```yaml
a:
  cool: thing
b: '{"cool":"thing"}'
```

#### 解码 JSON 编码字符串

记住 JSON 是 YAML 的子集。如果想要地道 yaml，管道通过 style 运算符清除 JSON 样式。


```yaml
a: '{"cool":"thing"}'
```

```bash
yq '.a | from_json | ... style=""' sample.yml
```

输出：
```yaml
cool: thing
```

#### 编码值为 props 字符串


```yaml
a:
  cool: thing
```

```bash
yq '.b = (.a | @props)' sample.yml
```

输出：
```yaml
a:
  cool: thing
b: |
  cool = thing
```

#### 解码 props 编码字符串


```yaml
a: |-
  cats=great
  dogs=cool as well
```

```bash
yq '.a |= @propsd' sample.yml
```

输出：
```yaml
a:
  cats: great
  dogs: cool as well
```

#### 解码 csv 编码字符串


```yaml
a: |-
  cats,dogs
  great,cool as well
```

```bash
yq '.a |= @csvd' sample.yml
```

输出：
```yaml
a:
  - cats: great
    dogs: cool as well
```

#### 解码 tsv 编码字符串


```yaml
a: |-
  cats	dogs
  great	cool as well
```

```bash
yq '.a |= @tsvd' sample.yml
```

输出：
```yaml
a:
  - cats: great
    dogs: cool as well
```

#### 编码值为 yaml 字符串

缩进默认为 2。


```yaml
a:
  cool:
    bob: dylan
```

```bash
yq '.b = (.a | to_yaml)' sample.yml
```

输出：
```yaml
a:
  cool:
    bob: dylan
b: |
  cool:
    bob: dylan
```

#### 编码值为 yaml 字符串，自定义缩进

可以指定缩进级别作为第一个参数。


```yaml
a:
  cool:
    bob: dylan
```

```bash
yq '.b = (.a | to_yaml(8))' sample.yml
```

输出：
```yaml
a:
  cool:
    bob: dylan
b: |
  cool:
          bob: dylan
```

#### 解码 yaml 编码字符串


```yaml
a: 'foo: bar'
```

```bash
yq '.b = (.a | from_yaml)' sample.yml
```

输出：
```yaml
a: 'foo: bar'
b:
  foo: bar
```

#### 更新多行编码 yaml 字符串


```yaml
a: |
  foo: bar
  baz: dog
```

```bash
yq '.a |= (from_yaml | .foo = "cat" | to_yaml)' sample.yml
```

输出：
```yaml
a: |
  foo: cat
  baz: dog
```

#### 更新单行编码 yaml 字符串


```yaml
a: 'foo: bar'
```

```bash
yq '.a |= (from_yaml | .foo = "cat" | to_yaml)' sample.yml
```

输出：
```yaml
a: 'foo: cat'
```

#### 编码标量数组为 csv 字符串

标量是字符串、数字和布尔值。


```yaml
- cat
- thing1,thing2
- true
- 3.40
```

```bash
yq '@csv' sample.yml
```

输出：
```yaml
cat,"thing1,thing2",true,3.40
```

#### 编码数组的数组为 csv 字符串


```yaml
- - cat
  - thing1,thing2
  - true
  - 3.40
- - dog
  - thing3
  - false
  - 12
```

```bash
yq '@csv' sample.yml
```

输出：
```yaml
cat,"thing1,thing2",true,3.40
dog,thing3,false,12
```

#### 编码数组的数组为 tsv 字符串

标量是字符串、数字和布尔值。


```yaml
- - cat
  - thing1,thing2
  - true
  - 3.40
- - dog
  - thing3
  - false
  - 12
```

```bash
yq '@tsv' sample.yml
```

输出：
```yaml
cat	thing1,thing2	true	3.40
dog	thing3	false	12
```

#### 编码值为 xml 字符串


```yaml
a:
  cool:
    foo: bar
    +@id: hi
```

```bash
yq '.a | to_xml' sample.yml
```

输出：
```yaml
<cool id="hi">
  <foo>bar</foo>
</cool>
```

#### 编码值为单行 xml 字符串


```yaml
a:
  cool:
    foo: bar
    +@id: hi
```

```bash
yq '.a | @xml' sample.yml
```

输出：
```yaml
<cool id="hi"><foo>bar</foo></cool>
```

#### 编码值为 xml 字符串，自定义缩进


```yaml
a:
  cool:
    foo: bar
    +@id: hi
```

```bash
yq '{"cat": .a | to_xml(1)}' sample.yml
```

输出：
```yaml
cat: |
  <cool id="hi">
   <foo>bar</foo>
  </cool>
```

#### 解码 xml 编码字符串


```yaml
a: <foo>bar</foo>
```

```bash
yq '.b = (.a | from_xml)' sample.yml
```

输出：
```yaml
a: <foo>bar</foo>
b:
  foo: bar
```

#### 编码字符串为 base64


```yaml
coolData: a special string
```

```bash
yq '.coolData | @base64' sample.yml
```

输出：
```yaml
YSBzcGVjaWFsIHN0cmluZw==
```

#### 编码 yaml 文档为 base64

先管道通过 @yaml 转换为字符串，然后使用 @base64 编码。


```yaml
a: apple
```

```bash
yq '@yaml | @base64' sample.yml
```

输出：
```yaml
YTogYXBwbGUK
```

#### 编码字符串为 uri


```yaml
coolData: this has & special () characters *
```

```bash
yq '.coolData | @uri' sample.yml
```

输出：
```yaml
this+has+%26+special+%28%29+characters+%2A
```

#### 解码 URI 为字符串


```yaml
this+has+%26+special+%28%29+characters+%2A
```

```bash
yq '@urid' sample.yml
```

输出：
```yaml
this has & special () characters *
```

#### 编码字符串为 sh

Sh/Bash 友好的字符串。


```yaml
coolData: strings with spaces and a 'quote'
```

```bash
yq '.coolData | @sh' sample.yml
```

输出：
```yaml
strings' with spaces and a \'quote\'
```

#### 解码 base64 编码字符串

假设解码数据是字符串。


```yaml
coolData: V29ya3Mgd2l0aCBVVEYtMTYg8J+Yig==
```

```bash
yq '.coolData | @base64d' sample.yml
```

输出：
```yaml
Works with UTF-16 😊
```

#### 解码 base64 编码 yaml 文档

管道通过 `from_yaml` 将解码的 base64 字符串解析为 yaml 文档。


```yaml
coolData: YTogYXBwbGUK
```

```bash
yq '.coolData |= (@base64d | from_yaml)' sample.yml
```

输出：
```yaml
coolData:
  a: apple
```

---

### 标签 (Tag)

> tag 运算符可用于获取或设置节点的标签（如 `!!str`, `!!int`, `!!bool`）。

#### 获取 tag


```yaml
a: cat
b: 5
c: 3.2
e: true
f: []
```

```bash
yq '.. | tag' sample.yml
```

输出：
```yaml
!!map
---
!!str
---
!!int
---
!!float
---
!!bool
---
!!seq
```

#### type 是 tag 的别名


```yaml
a: cat
b: 5
c: 3.2
e: true
f: []
```

```bash
yq '.. | type' sample.yml
```

输出：
```yaml
!!map
---
!!str
---
!!int
---
!!float
---
!!bool
---
!!seq
```

#### 设置自定义 tag


```yaml
a: str
```

```bash
yq '.a tag = "!!mikefarah"' sample.yml
```

输出：
```yaml
a: !!mikefarah str
```

#### 查找数字并转换为字符串


```yaml
a: cat
b: 5
c: 3.2
e: true
```

```bash
yq '(.. | select(tag == "!!int")) tag= "!!str"' sample.yml
```

输出：
```yaml
a: cat
b: "5"
c: 3.2
e: true
```

---

### 类型 (Kind)

> `kind` 运算符将节点类型识别为 `scalar`, `map`, 或 `seq`。
>
> 可用于基于类型过滤或转换节点。
>
> 注意 `null` 值被视为 `scalar`。

#### 获取 kind


```yaml
a: cat
b: 5
c: 3.2
e: true
f: []
g: {}
h: null
```

```bash
yq '.. | kind' sample.yml
```

输出：
```yaml
map
---
scalar
---
scalar
---
scalar
---
scalar
---
seq
---
map
---
scalar
```

#### 获取 kind，忽略自定义标签

与 tag 不同，kind 不受自定义标签影响。


```yaml
a: !!thing cat
b: !!foo {}
c: !!bar []
```

```bash
yq '.. | kind' sample.yml
```

输出：
```yaml
map
---
scalar
---
map
---
seq
```

#### 只对标量添加注释

kind 用法示例。


```yaml
a:
  b: 5
  c: 3.2
e: true
f: []
g: {}
h: null
```

```bash
yq '(.. | select(kind == "scalar")) line_comment = "this is a scalar"' sample.yml
```

输出：
```yaml
a:
  b: 5 # this is a scalar
  c: 3.2 # this is a scalar
e: true # this is a scalar
f: []
g: {}
h: null # this is a scalar
```

---

### 样式 (Style)

> style 运算符可用于获取或设置节点的样式（如字符串样式、yaml 样式）。
> 用于控制 yaml 中文档的格式。

#### 更新并设置特定节点的样式（简单）


```yaml
a:
  b: thing
  c: something
```

```bash
yq '.a.b = "new" | .a.b style="double"' sample.yml
```

输出：
```yaml
a:
  b: "new"
  c: something
```

#### 使用路径变量更新并设置特定节点的样式


```yaml
a:
  b: thing
  c: something
```

```bash
yq 'with(.a.b ; . = "new" | . style="double")' sample.yml
```

输出：
```yaml
a:
  b: "new"
  c: something
```

#### 设置 tagged 样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="tagged"' sample.yml
```

输出：
```yaml
!!map
a: !!str cat
b: !!int 5
c: !!float 3.2
e: !!bool true
f: !!seq
  - !!int 1
  - !!int 2
  - !!int 3
g: !!map
  something: !!str cool
```

#### 设置双引号样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="double"' sample.yml
```

输出：
```yaml
a: "cat"
b: "5"
c: "3.2"
e: "true"
f:
  - "1"
  - "2"
  - "3"
g:
  something: "cool"
```

#### 对映射键也设置双引号样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '... style="double"' sample.yml
```

输出：
```yaml
"a": "cat"
"b": "5"
"c": "3.2"
"e": "true"
"f":
  - "1"
  - "2"
  - "3"
"g":
  "something": "cool"
```

#### 设置单引号样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="single"' sample.yml
```

输出：
```yaml
a: 'cat'
b: '5'
c: '3.2'
e: 'true'
f:
  - '1'
  - '2'
  - '3'
g:
  something: 'cool'
```

#### 设置字面量引号样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="literal"' sample.yml
```

输出：
```yaml
a: |-
  cat
b: |-
  5
c: |-
  3.2
e: |-
  true
f:
  - |-
    1
  - |-
    2
  - |-
    3
g:
  something: |-
    cool
```

#### 设置折叠引号样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="folded"' sample.yml
```

输出：
```yaml
a: >-
  cat
b: >-
  5
c: >-
  3.2
e: >-
  true
f:
  - >-
    1
  - >-
    2
  - >-
    3
g:
  something: >-
    cool
```

#### 设置流式样式


```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

```bash
yq '.. style="flow"' sample.yml
```

输出：
```yaml
{a: cat, b: 5, c: 3.2, e: true, f: [1, 2, 3], g: {something: cool}}
```

#### 重置样式 - 或美化打印

设置空（默认）引号样式，注意使用 `...` 也匹配键。注意有 `--prettyPrint/-P` 短标志。


```yaml
{a: cat, "b": 5, 'c': 3.2, "e": true,  f: [1,2,3], "g": { something: "cool"} }
```

```bash
yq '... style=""' sample.yml
```

输出：
```yaml
a: cat
b: 5
c: 3.2
e: true
f:
  - 1
  - 2
  - 3
g:
  something: cool
```

#### 使用 assign-update 相对设置样式


```yaml
a: single
b: double
```

```bash
yq '.[] style |= .' sample.yml
```

输出：
```yaml
a: 'single'
b: "double"
```

#### 读取样式


```yaml
{a: "cat", b: 'thing'}
```

```bash
yq '.. | style' sample.yml
```

输出：
```yaml
flow
---
double
---
single
```

---

### 日期时间 (Date Time)

> 各种用于解析和操作日期的运算符。
>
> **日期时间格式化**：使用 Golang 内置的 time 库解析和格式化日期时间。
>
> 未指定时，假设 RFC3339 标准格式 `2006-01-02T15:04:05Z07:00`。
>
> 要指定自定义解析格式，使用 `with_dtf` 运算符。第一个参数设置第二个参数中表达式的日期时间解析格式。
>
> **时区**：使用 Golang 内置的 LoadLocation 函数解析时区字符串。
>
> **持续时间**：使用 Golang 内置的 ParseDuration 函数解析。
>
> 可以使用 `+` 运算符向时间添加持续时间。

#### 格式化：从标准 RFC3339 格式

提供单个参数假设标准 RFC3339 日期时间格式。如果目标格式不是有效的 yaml 日期时间格式，结果将是字符串标记节点。


```yaml
a: 2001-12-15T02:59:43.1Z
```

```bash
yq '.a |= format_datetime("Monday, 02-Jan-06 at 3:04PM")' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 2:59AM
```

#### 格式化：从自定义日期时间

使用 with_dtf 设置自定义日期时间解析格式。


```yaml
a: Saturday, 15-Dec-01 at 2:59AM
```

```bash
yq '.a |= with_dtf("Monday, 02-Jan-06 at 3:04PM"; format_datetime("2006-01-02"))' sample.yml
```

输出：
```yaml
a: 2001-12-15
```

#### 格式化：获取星期几


```yaml
a: 2001-12-15
```

```bash
yq '.a | format_datetime("Monday")' sample.yml
```

输出：
```yaml
Saturday
```

#### Now


```yaml
a: cool
```

```bash
yq '.updated = now' sample.yml
```

输出：
```yaml
a: cool
updated: 2021-05-19T01:02:03Z
```

#### From Unix

从 unix 时间转换。注意，不需要管道通过 tz 运算符 :)

```bash
yq --null-input '1675301929 | from_unix | tz("UTC")'
```

输出：
```yaml
2023-02-02T01:38:49Z
```

#### To Unix

转换为 unix 时间。

```bash
yq --null-input 'now | to_unix'
```

输出：
```yaml
1621386123
```

#### 时区：从标准 RFC3339 格式

返回指定时区的新日期时间。指定标准 IANA 时区格式或 'utc', 'local'。给定单个参数时，假设日期时间为 RFC3339 格式。


```yaml
a: cool
```

```bash
yq '.updated = (now | tz("Australia/Sydney"))' sample.yml
```

输出：
```yaml
a: cool
updated: 2021-05-19T11:02:03+10:00
```

#### 时区：自定义格式

指定标准 IANA 时区格式或 'utc', 'local'。


```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

```bash
yq '.a |= with_dtf("Monday, 02-Jan-06 at 3:04PM MST"; tz("Australia/Sydney"))' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 1:59PM AEDT
```

#### 添加和时区自定义格式

指定标准 IANA 时区格式或 'utc', 'local'。


```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

```bash
yq '.a |= with_dtf("Monday, 02-Jan-06 at 3:04PM MST"; tz("Australia/Sydney"))' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 1:59PM AEDT
```

#### 日期加法


```yaml
a: 2021-01-01T00:00:00Z
```

```bash
yq '.a += "3h10m"' sample.yml
```

输出：
```yaml
a: 2021-01-01T03:10:00Z
```

#### 日期减法

可以从日期减去持续时间。假设 RFC3339 日期时间格式。


```yaml
a: 2021-01-01T03:10:00Z
```

```bash
yq '.a -= "3h10m"' sample.yml
```

输出：
```yaml
a: 2021-01-01T00:00:00Z
```

#### 日期加法 - 自定义格式


```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST"; .a += "3h1m")' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 6:00AM GMT
```

#### 带自定义格式的日期脚本

如果需要，可以在 with_dtf 中嵌入完整表达式。


```yaml
a: Saturday, 15-Dec-01 at 2:59AM GMT
```

```bash
yq 'with_dtf("Monday, 02-Jan-06 at 3:04PM MST"; .a = (.a + "3h1m" | tz("Australia/Perth")))' sample.yml
```

输出：
```yaml
a: Saturday, 15-Dec-01 at 2:00PM AWST
```

---


## 高级操作

### 归约 (Reduce)

> Reduce 是将集合数据处理为新形式的强大方式。
>
> 语法：`<exp> as $<name> ireduce (<init>; <block>)`
>
> 例如：`.[] as $item ireduce (0; . + $item)`
>
> 左侧配置将被归约的项目集合 `<exp>` 以及每个元素的名称 `$<name>`。注意数组被展开为单个元素。
>
> 右侧有 `<init>`，累加器的起始值，和 `<block>`，为集合中每个元素更新累加器的表达式。注意在块表达式中，`.` 将评估为累加器的当前值。

#### yq 与 jq 语法

Reduce 语法在 `yq` 中略有不同——因为 `yq`（目前）不如 `jq` 复杂，只支持中缀表示法——而 `jq` 使用中缀和前缀表示法的混合。

因此，reduce 运算符被称为 `ireduce`，以便向后兼容，如果将来添加类似 jq 的前缀版本 `reduce`。

#### 数字求和


```yaml
- 10
- 2
- 5
- 3
```

```bash
yq '.[] as $item ireduce (0; . + $item)' sample.yml
```

输出：
```yaml
20
```

#### 合并所有 YAML 文件


```yaml
a: cat
```

以及 another.yml：
```yaml
b: dog
```

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' sample.yml another.yml
```

输出：
```yaml
a: cat
b: dog
```

#### 数组转对象


```yaml
- name: Cathy
  has: apples
- name: Bob
  has: bananas
```

```bash
yq '.[] as $item ireduce ({}; .[$item | .name] = ($item | .has) )' sample.yml
```

输出：
```yaml
Cathy: apples
Bob: bananas
```

---

### 变量 (Variable Operators)

> 与 `jq` 等价物类似，变量有时对更复杂的表达式（或在字段之间交换值）是必需的。
>
> 注意还有一个额外的 `ref` 运算符，持有路径的引用（而不是副本），允许你对同一路径进行多次更改。

#### 单值变量


```yaml
a: cat
```

```bash
yq '.a as $foo | $foo' sample.yml
```

输出：
```yaml
cat
```

#### 多值变量


```yaml
- cat
- dog
```

```bash
yq '.[] as $foo | $foo' sample.yml
```

输出：
```yaml
cat
---
dog
```

#### 使用变量作为查找表

示例取自 [jq](https://stedolan.github.io/jq/manual/#Variable/SymbolicBindingOperator:...as$identifier|...)


```yaml
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
```

输出：
```yaml
title: First post
author: Anonymous Coward
---
title: A well-written article
author: Person McPherson
```

#### 使用变量交换值


```yaml
a: a_value
b: b_value
```

```bash
yq '.a as $x  | .b as $y | .b = $x | .a = $y' sample.yml
```

输出：
```yaml
a: b_value
b: a_value
```

#### 使用 ref 重复引用路径

注意：你可能会发现 `with` 运算符更有用。


```yaml
a:
  b: thing
  c: something
```

```bash
yq '.a.b ref $x | $x = "new" | $x style="double"' sample.yml
```

输出：
```yaml
a:
  b: "new"
  c: something
```

---

### 上下文操作 (With)

> 使用 `with` 运算符方便地对深层嵌套路径进行多次更新，或相对彼此更新数组元素。第一个参数表达式设置根上下文，第二个表达式针对该根上下文运行。

#### 更新并设置样式


```yaml
a:
  deeply:
    nested: value
```

```bash
yq 'with(.a.deeply.nested; . = "newValue" | . style="single")' sample.yml
```

输出：
```yaml
a:
  deeply:
    nested: 'newValue'
```

#### 更新多个深层嵌套属性


```yaml
a:
  deeply:
    nested: value
    other: thing
```

```bash
yq 'with(.a.deeply; .nested = "newValue" | .other= "newThing")' sample.yml
```

输出：
```yaml
a:
  deeply:
    nested: newValue
    other: newThing
```

#### 相对更新数组元素

第二个表达式以数组的每个元素作为其上下文根运行。这允许你相对元素进行更新。


```yaml
myArray:
  - a: apple
  - a: banana
```

```bash
yq 'with(.myArray[]; .b = .a + " yum")' sample.yml
```

输出：
```yaml
myArray:
  - a: apple
    b: apple yum
  - a: banana
    b: banana yum
```

---

### 动态求值 (Eval)

> 使用 `eval` 动态处理表达式——例如从环境变量传入。
>
> `eval` 接受单个参数，并将其评估为 `yq` 表达式。可以使用任何有效表达式，无论是路径 `.a.b.c | select(. == "cat")`，还是更新 `.a.b.c = "gogo"`。
>
> 提示：这是参数化复杂脚本的有用方式。

#### 动态求值路径


```yaml
pathExp: .a.b[] | select(.name == "cat")
a:
  b:
    - name: dog
    - name: cat
```

```bash
yq 'eval(.pathExp)' sample.yml
```

输出：
```yaml
name: cat
```

#### 从环境变量动态更新路径

环境变量可以是任何有效的 yq 表达式。


```yaml
a:
  b:
    - name: dog
    - name: cat
```

```bash
pathEnv=".a.b[0].name"  valueEnv="moo" yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
```

输出：
```yaml
a:
  b:
    - name: moo
    - name: cat
```

---

### 环境变量 (Env Variable Operators)

> 这些运算符用于处理表达式和文档中的环境变量。虽然环境变量当然可以通过 CLI 用字符串插值传入，但这通常伴随复杂的引号转义，可能难以编写和阅读。
>
> 有三个运算符：
> - `env`：接受单个环境变量名，将变量解析为 yaml 节点（映射、数组、字符串、数字或布尔值）
> - `strenv`：也接受单个环境变量名，始终将变量解析为字符串。
> - `envsubst`：将字符串管道传入，使用 envsubst 插值字符串中的环境变量。
>
> **EnvSubst 选项**：可以可选传递以下选项：
> - `nu`：NoUnset，如果有任何引用的变量未设置则失败
> - `ne`：NoEmpty，如果有任何引用的变量为空则失败
> - `ff`：FailFast，首次失败时中止（而不是收集所有错误）
>
> **提示**：要替换文档中所有值的环境变量，可以如下使用 `envsubst` 配合递归下降运算符：
> ```bash
> yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml
> ```
>
> **禁用 env 运算符**：如果需要，可以使用 `--security-disable-env-ops` 禁用 env 操作。

#### 读取字符串环境变量

```bash
myenv="cat meow" yq --null-input '.a = env(myenv)'
```

输出：
```yaml
a: cat meow
```

#### 读取布尔环境变量

```bash
myenv="true" yq --null-input '.a = env(myenv)'
```

输出：
```yaml
a: true
```

#### 读取数字环境变量

```bash
myenv="12" yq --null-input '.a = env(myenv)'
```

输出：
```yaml
a: 12
```

#### 读取 YAML 环境变量

```bash
myenv="{b: fish}" yq --null-input '.a = env(myenv)'
```

输出：
```yaml
a: {b: fish}
```

#### 将布尔环境变量作为字符串读取

```bash
myenv="true" yq --null-input '.a = strenv(myenv)'
```

输出：
```yaml
a: "true"
```

#### 将数字环境变量作为字符串读取

```bash
myenv="12" yq --null-input '.a = strenv(myenv)'
```

输出：
```yaml
a: "12"
```

#### 从环境变量动态更新路径

环境变量可以是任何有效的 yq 表达式。


```yaml
a:
  b:
    - name: dog
    - name: cat
```

```bash
pathEnv=".a.b[0].name"  valueEnv="moo" yq 'eval(strenv(pathEnv)) = strenv(valueEnv)' sample.yml
```

输出：
```yaml
a:
  b:
    - name: moo
    - name: cat
```

#### 使用环境变量动态键查找


```yaml
cat: meow
dog: woof
```

```bash
myenv="cat" yq '.[env(myenv)]' sample.yml
```

输出：
```yaml
meow
```

#### 使用 envsubst 替换字符串

```bash
myenv="cat" yq --null-input '"the ${myenv} meows" | envsubst'
```

输出：
```yaml
the cat meows
```

#### 使用 envsubst 替换字符串，缺失变量

```bash
yq --null-input '"the ${myenvnonexisting} meows" | envsubst'
```

输出：
```yaml
the  meows
```

#### 使用 envsubst(nu)，缺失变量

(nu) not unset，如果有未设置（缺失）的变量则失败。

```bash
yq --null-input '"the ${myenvnonexisting} meows" | envsubst(nu)'
```

输出：
```bash
Error: variable ${myenvnonexisting} not set
```

#### 使用 envsubst(ne)，缺失变量

(ne) not empty，只验证已设置的变量。

```bash
yq --null-input '"the ${myenvnonexisting} meows" | envsubst(ne)'
```

输出：
```yaml
the  meows
```

#### 使用 envsubst(ne)，空变量

(ne) not empty，如果引用的变量为空则失败。

```bash
myenv="" yq --null-input '"the ${myenv} meows" | envsubst(ne)'
```

输出：
```bash
Error: variable ${myenv} set but empty
```

#### 使用 envsubst，缺失变量带默认值

```bash
yq --null-input '"the ${myenvnonexisting-dog} meows" | envsubst'
```

输出：
```yaml
the dog meows
```

#### 使用 envsubst(nu)，缺失变量带默认值

有默认值会跳过缺失变量。

```bash
yq --null-input '"the ${myenvnonexisting-dog} meows" | envsubst(nu)'
```

输出：
```yaml
the dog meows
```

#### 使用 envsubst(ne)，缺失变量带默认值

失败，因为变量被显式设置为空。

```bash
myEmptyEnv="" yq --null-input '"the ${myEmptyEnv-dog} meows" | envsubst(ne)'
```

输出：
```bash
Error: variable ${myEmptyEnv} set but empty
```

#### 在文档中替换字符串环境变量


```yaml
v: ${myenv}
```

```bash
myenv="cat meow" yq '.v |= envsubst' sample.yml
```

输出：
```yaml
v: cat meow
```

#### （默认）返回所有 envsubst 错误

默认情况下，所有错误一次性返回。

```bash
yq --null-input '"the ${notThere} ${alsoNotThere}" | envsubst(nu)'
```

输出：
```bash
Error: variable ${notThere} not set
variable ${alsoNotThere} not set
```

#### 快速失败，返回第一个 envsubst 错误（并中止）

```bash
yq --null-input '"the ${notThere} ${alsoNotThere}" | envsubst(nu,ff)'
```

输出：
```bash
Error: variable ${notThere} not set
```

#### env() 在安全启用时失败

使用 `--security-disable-env-ops` 禁用 env 操作。

```bash
yq --null-input 'env("MYENV")'
```

输出：
```bash
Error: env operations have been disabled
```

#### strenv() 在安全启用时失败

```bash
yq --null-input 'strenv("MYENV")'
```

输出：
```bash
Error: env operations have been disabled
```

#### envsubst() 在安全启用时失败

```bash
yq --null-input '"value: ${MYENV}" | envsubst'
```

输出：
```bash
Error: env operations have been disabled
```

---

### 文件操作 (File Operators)

> 文件运算符最常与合并一起使用，当需要合并特定文件时。注意这样做时，需要使用 `eval-all` 确保所有 yaml 文档在合并前加载到内存中（与 `eval` 不同，后者对每个文档运行一次表达式）。
>
> 注意 `fileIndex` 运算符有 `fi` 短别名。

#### 合并文件

注意使用 eval-all 确保所有文档加载到内存中。

```bash
yq eval-all 'select(fi == 0) * select(filename == "file2.yaml")' file1.yaml file2.yaml
```

#### 获取文件名


```yaml
a: cat
```

```bash
yq 'filename' sample.yml
```

输出：
```yaml
sample.yml
```

#### 获取文件索引


```yaml
a: cat
```

```bash
yq 'file_index' sample.yml
```

输出：
```yaml
0
```

#### 获取多文档的文件索引


```yaml
a: cat
```

以及 another.yml：
```yaml
a: cat
```

```bash
yq eval-all 'file_index' sample.yml another.yml
```

输出：
```yaml
0
---
1
```

#### 获取文件索引别名


```yaml
a: cat
```

```bash
yq 'fi' sample.yml
```

输出：
```yaml
0
```

---

### 加载 (Load)

> load 运算符允许你从另一个文件加载内容。
>
> 可以使用字符串运算符如 `+` 和 `sub` 修改 yaml 文件中的值为系统中存在的路径。
>
> 支持以下文件类型：

| 格式 | 加载运算符 |
|------|-----------|
| Yaml | load |
| XML | load_xml |
| Properties | load_props |
| 纯文本 | load_str |
| Base64 | load_base64 |

> 注意 load_base64 只对 base64 编码的 utf-8 字符串有效。
>
> **禁用文件运算符**：如果需要，可以使用 `--security-disable-file-ops` 禁用文件操作。

#### 简单示例


```yaml
myFile: ../../examples/thing.yml
```

```bash
yq 'load(.myFile)' sample.yml
```

输出：
```yaml
a: apple is included
b: cool.
```

#### 用引用文件替换节点

注意可以在 load 运算符中修改文件名。


```yaml
something:
  file: thing.yml
```

```bash
yq '.something |= load("../../examples/" + .file)' sample.yml
```

输出：
```yaml
something:
  a: apple is included
  b: cool.
```

#### 用引用文件替换所有节点

递归匹配所有节点 (`..`)，然后过滤有 'file' 属性的节点。


```yaml
something:
  file: thing.yml
over:
  here:
    - file: thing.yml
```

```bash
yq '(.. | select(has("file"))) |= load("../../examples/" + .file)' sample.yml
```

输出：
```yaml
something:
  a: apple is included
  b: cool.
over:
  here:
    - a: apple is included
      b: cool.
```

#### 用引用文件作为字符串替换节点

这对任何基于文本的文件都有效。


```yaml
something:
  file: thing.yml
```

```bash
yq '.something |= load_str("../../examples/" + .file)' sample.yml
```

输出：
```yaml
something: |-
  a: apple is included
  b: cool.
```

#### 从 XML 加载


```yaml
cool: things
```

```bash
yq '.more_stuff = load_xml("../../examples/small.xml")' sample.yml
```

输出：
```yaml
cool: things
more_stuff:
  this: is some xml
```

#### 从 Properties 加载


```yaml
cool: things
```

```bash
yq '.more_stuff = load_props("../../examples/small.properties")' sample.yml
```

输出：
```yaml
cool: things
more_stuff:
  this:
    is: a properties file
```

#### 从 Properties 合并

可作为更新 yaml 文档的便捷方式。


```yaml
this:
  is: from yaml
  cool: ay
```

```bash
yq '. *= load_props("../../examples/small.properties")' sample.yml
```

输出：
```yaml
this:
  is: a properties file
  cool: ay
```

#### 从 base64 编码文件加载


```yaml
cool: things
```

```bash
yq '.more_stuff = load_base64("../../examples/base64.txt")' sample.yml
```

输出：
```yaml
cool: things
more_stuff: my secret chilli recipe is....
```

#### load() 在安全启用时失败

```bash
yq --null-input 'load("../../examples/thing.yml")'
```

输出：
```bash
Error: file operations have been disabled
```

#### load_str() 在安全启用时失败

```bash
yq --null-input 'load_str("../../examples/thing.yml")'
```

输出：
```bash
Error: file operations have been disabled
```

#### load_xml() 在安全启用时失败

```bash
yq --null-input 'load_xml("../../examples/small.xml")'
```

输出：
```bash
Error: file operations have been disabled
```

#### load_props() 在安全启用时失败

```bash
yq --null-input 'load_props("../../examples/small.properties")'
```

输出：
```bash
Error: file operations have been disabled
```

#### load_base64() 在安全启用时失败

```bash
yq --null-input 'load_base64("../../examples/base64.txt")'
```

输出：
```bash
Error: file operations have been disabled
```

---

### 系统操作 (System Operators)

> `system` 运算符允许你运行外部命令并在表达式中使用其输出作为值。
>
> **安全警告**：system 运算符默认禁用。必须显式传入 `--security-enable-system-operator` 才能使用。
>
> **注意**：启用后，system 运算符可以通过外部命令复制 `env` 和 `load` 运算符的功能。启用它实际上会覆盖 `--security-disable-env-ops` 和 `--security-disable-file-ops`。
>
> **用法**：
> ```bash
> yq --security-enable-system-operator --null-input '.field = system("command"; "arg1")'
> ```
> 运算符接受：命令字符串（必需）和参数（或参数数组），用 `;` 与命令分隔（可选）。
> 当前匹配节点的值序列化并通过 stdin 管道传入命令。命令的 stdout（去除尾部换行）作为字符串返回。
>
> **禁用 system 运算符**：system 运算符默认禁用。禁用时返回错误，与 `--security-disable-env-ops` 和 `--security-disable-file-ops` 一致。

#### system 运算符禁用时返回错误


```yaml
country: Australia
```

```bash
yq '.country = system("/usr/bin/echo"; "test")' sample.yml
```

输出：
```bash
Error: system operations are disabled, use --security-enable-system-operator to enable
```

#### 带参数运行命令

使用 `--security-enable-system-operator` 启用 system 运算符。


```yaml
country: Australia
```

```bash
yq --security-enable-system-operator '.country = system("/usr/bin/echo"; "test")' sample.yml
```

输出：
```yaml
country: test
```

#### 无参数运行命令

省略分号和参数以无额外参数运行命令。


```yaml
a: hello
```

```bash
yq --security-enable-system-operator '.a = system("/usr/bin/echo")' sample.yml
```

输出：
```yaml
a: ""
```

---


### 锚点与别名 (Anchor and Alias Operators)

> 使用 `alias` 和 `anchor` 运算符读写 yaml 别名和锚点。`explode` 运算符规范化 yaml 文件（反引用（或展开）别名并移除锚点名）。
>
> `yq` 支持 YAML 1.1 的合并键（如 `<<: *blah`）。这些不再是 YAML 1.2 标准的一部分，但在实践中仍然常见。普通 `<<:` 键被识别为合并键，往返为 `<<:` 不带显式 `!!merge` 标签。当源使用显式 `!!merge` 标签时，该标签在输出上保留。内部，当 `yq` 合成 `<<` 映射键（例如在合并操作期间），它将键标记为 `!!merge` 而不是 `!!str`。
>
> **注意 --yaml-fix-merge-anchor-to-spec 标志**：`yq` 不按规范合并锚点 `<<:`，在某些情况下不正确地覆盖现有键，而规范文档说明不应这样做。
>
> 为最小化中断同时修复问题，添加了标志来切换此行为。这将首先默认 false；并向用户记录警告。然后默认 true（并仍允许用户指定 false）。
>
> 此标志还启用高级合并，如内联映射，以及修复确保在展开特定路径时，邻居不受影响。
>
> 简而言之，你应该将此标志设为 true。

#### 合并一个映射


```yaml
- &CENTRE
  x: 1
  y: 2
- &LEFT
  x: 0
  y: 2
- &BIG
  r: 10
- &SMALL
  r: 1
- <<: *CENTRE
  r: 10
```

```bash
yq '.[4] | explode(.)' sample.yml
```

输出：
```yaml
x: 1
y: 2
r: 10
```

#### 获取锚点


```yaml
a: &billyBob cat
```

```bash
yq '.a | anchor' sample.yml
```

输出：
```yaml
billyBob
```

#### 设置锚点


```yaml
a: cat
```

```bash
yq '.a anchor = "foobar"' sample.yml
```

输出：
```yaml
a: &foobar cat
```

#### 使用 assign-update 相对设置锚点


```yaml
a:
  b: cat
```

```bash
yq '.a anchor |= .b' sample.yml
```

输出：
```yaml
a: &cat
  b: cat
```

#### 获取别名


```yaml
b: &billyBob meow
a: *billyBob
```

```bash
yq '.a | alias' sample.yml
```

输出：
```yaml
billyBob
```

#### 设置别名


```yaml
b: &meow purr
a: cat
```

```bash
yq '.a alias = "meow"' sample.yml
```

输出：
```yaml
b: &meow purr
a: *meow
```

#### 设置别名为空不做任何事


```yaml
b: &meow purr
a: cat
```

```bash
yq '.a alias = ""' sample.yml
```

输出：
```yaml
b: &meow purr
a: cat
```

#### 使用 assign-update 相对设置别名


```yaml
b: &meow purr
a:
  f: meow
```

```bash
yq '.a alias |= .f' sample.yml
```

输出：
```yaml
b: &meow purr
a: *meow
```

#### 展开别名和锚点


```yaml
f:
  a: &a cat
  b: *a
```

```bash
yq 'explode(.f)' sample.yml
```

输出：
```yaml
f:
  a: cat
  b: cat
```

#### 无别名或锚点时展开


```yaml
a: mike
```

```bash
yq 'explode(.a)' sample.yml
```

输出：
```yaml
a: mike
```

#### 带别名键展开


```yaml
f:
  a: &a cat
  *a : b
```

```bash
yq 'explode(.f)' sample.yml
```

输出：
```yaml
f:
  a: cat
  cat: b
```

#### 反引用并更新字段

使用 explode 配合 multiply 反引用对象。


```yaml
item_value: &item_value
  value: true
thingOne:
  name: item_1
  <<: *item_value
thingTwo:
  name: item_2
  <<: *item_value
```

```bash
yq '.thingOne |= (explode(.) | sort_keys(.)) * {"value": false}' sample.yml
```

输出：
```yaml
item_value: &item_value
  value: true
thingOne:
  name: item_1
  value: false
thingTwo:
  name: item_2
  <<: *item_value
```

#### LEGACY：带合并锚点展开

注意：这是 --yaml-fix-merge-anchor-to-spec=false 时的行为；不符合 YAML 规范，因为合并锚点不正确地覆盖对象值。


```yaml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  <<:
    - *foo
    - *bar
  c: foobarList_c
foobar:
  c: foobar_c
  <<: *foo
  thing: foobar_thing
```

```bash
yq 'explode(.)' sample.yml
```

输出：
```yaml
foo:
  a: foo_a
  thing: foo_thing
  c: foo_c
bar:
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: bar_b
  thing: foo_thing
  c: foobarList_c
  a: foo_a
foobar:
  c: foo_c
  a: foo_a
  thing: foobar_thing
```

#### LEGACY：合并多个映射

数据正确，但键顺序错误；设置 --yaml-fix-merge-anchor-to-spec=true 修复键顺序。


```yaml
- &CENTRE
  x: 1
  y: 2
- &LEFT
  x: 0
  y: 2
- &BIG
  r: 10
- &SMALL
  r: 1
- <<:
    - *CENTRE
    - *BIG
```

```bash
yq '.[4] | explode(.)' sample.yml
```

输出：
```yaml
r: 10
x: 1
y: 2
```

#### LEGACY：覆盖

数据正确，但键顺序错误；设置 --yaml-fix-merge-anchor-to-spec=true 修复键顺序。


```yaml
- &CENTRE
  x: 1
  y: 2
- &LEFT
  x: 0
  y: 2
- &BIG
  r: 10
- &SMALL
  r: 1
- <<:
    - *BIG
    - *LEFT
    - *SMALL
  x: 1
```

```bash
yq '.[4] | explode(.)' sample.yml
```

输出：
```yaml
r: 10
x: 1
y: 2
```

#### FIXED：带合并锚点展开

设置 `--yaml-fix-merge-anchor-to-spec=true` 获得正确的合并行为。注意 foobarList.b 属性仍然是 foobarList_b。


```yaml
foo: &foo
  a: foo_a
  thing: foo_thing
  c: foo_c
bar: &bar
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  <<:
    - *foo
    - *bar
  c: foobarList_c
foobar:
  c: foobar_c
  <<: *foo
  thing: foobar_thing
```

```bash
yq 'explode(.)' sample.yml
```

输出：
```yaml
foo:
  a: foo_a
  thing: foo_thing
  c: foo_c
bar:
  b: bar_b
  thing: bar_thing
  c: bar_c
foobarList:
  b: foobarList_b
  a: foo_a
  thing: foo_thing
  c: foobarList_c
foobar:
  c: foobar_c
  a: foo_a
  thing: foobar_thing
```

#### FIXED：合并多个映射

设置 `--yaml-fix-merge-anchor-to-spec=true` 获得正确的合并行为。与 legacy 相同的值，但键顺序正确。


```yaml
- &CENTRE
  x: 1
  y: 2
- &LEFT
  x: 0
  y: 2
- &BIG
  r: 10
- &SMALL
  r: 1
- <<:
    - *CENTRE
    - *BIG
```

```bash
yq '.[4] | explode(.)' sample.yml
```

输出：
```yaml
x: 1
y: 2
r: 10
```

#### FIXED：覆盖

设置 `--yaml-fix-merge-anchor-to-spec=true` 获得正确的合并行为。与 legacy 相同的值，但键顺序正确。


```yaml
- &CENTRE
  x: 1
  y: 2
- &LEFT
  x: 0
  y: 2
- &BIG
  r: 10
- &SMALL
  r: 1
- <<:
    - *BIG
    - *LEFT
    - *SMALL
  x: 1
```

```bash
yq '.[4] | explode(.)' sample.yml
```

输出：
```yaml
r: 10
y: 2
x: 1
```

#### 展开内联合并锚点

设置 `--yaml-fix-merge-anchor-to-spec=true` 获得正确的合并行为。


```yaml
a:
  b: &b 42
<<:
  c: *b
```

```bash
yq 'explode(.) | sort_keys(.)' sample.yml
```

输出：
```yaml
a:
  b: 42
c: 42
```

---

### 注释操作 (Comment Operators)

> 使用这些注释运算符设置或检索注释。注意映射/数组上的行注释实际上设置在键节点上而不是值（映射/数组）。见下方示例。
>
> 与 `=` 和 `|=` 赋值运算符类似，更新注释时适用相同语法：
> - **普通形式 `=`**：将 LHS 节点的注释设为 RHS 表达式的值。RHS 针对管道中匹配的节点运行。
> - **相对形式 `|=`**：与普通形式类似，但用每个匹配的 LHS 节点作为上下文评估 RHS。如果你想将注释设置为节点的相对表达式，例如其值或路径，这很有用。

#### 设置行尾注释

在键节点上设置注释更可靠（见下方）。


```yaml
a: cat
```

```bash
yq '.a line_comment="single"' sample.yml
```

输出：
```yaml
a: cat # single
```

#### 设置映射/数组的行尾注释

对于映射和数组，需要在键节点上设置行尾注释。这也适用于标量。


```yaml
a:
  b: things
```

```bash
yq '(.a | key) line_comment="single"' sample.yml
```

输出：
```yaml
a: # single
  b: things
```

#### 使用 update assign 进行相对更新


```yaml
a: cat
b: dog
```

```bash
yq '.. line_comment |= .' sample.yml
```

输出：
```yaml
a: cat # cat
b: dog # dog
```

#### 注释在哪里 - 映射键示例

底层 yaml 解析器可以将文档中的注释分配给令人惊讶的节点。使用类似这样的表达式查找你的注释在哪里。'p' 表示路径，'isKey' 表示节点是否为映射键（相对于映射值）。

从此可以看出 'hello-world-comment' 实际上在 'hello' 键上。


```yaml
hello: # hello-world-comment
  message: world
```

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "hc": headComment, "lc": lineComment, "fc": footComment}]' sample.yml
```

输出：
```yaml
- p: ""
  isKey: false
  hc: ""
  lc: ""
  fc: ""
- p: hello
  isKey: true
  hc: ""
  lc: hello-world-comment
  fc: ""
- p: hello
  isKey: false
  hc: ""
  lc: ""
  fc: ""
- p: hello.message
  isKey: true
  hc: ""
  lc: ""
  fc: ""
- p: hello.message
  isKey: false
  hc: ""
  lc: ""
  fc: ""
```

#### 检索注释 - 映射键示例

从前面的例子，我们知道注释在 'hello' 键上作为 lineComment。


```yaml
hello: # hello-world-comment
  message: world
```

```bash
yq '.hello | key | line_comment' sample.yml
```

输出：
```yaml
hello-world-comment
```

#### 注释在哪里 - 数组示例

底层 yaml 解析器可以将文档中的注释分配给令人惊讶的节点。使用类似这样的表达式查找你的注释在哪里。

从此可以看出 'under-name-comment' 实际上在第一个子元素上。


```yaml
name:
  # under-name-comment
  - first-array-child
```

```bash
yq '[... | {"p": path | join("."), "isKey": is_key, "hc": headComment, "lc": lineComment, "fc": footComment}]' sample.yml
```

输出：
```yaml
- p: ""
  isKey: false
  hc: ""
  lc: ""
  fc: ""
- p: name
  isKey: true
  hc: ""
  lc: ""
  fc: ""
- p: name
  isKey: false
  hc: ""
  lc: ""
  fc: ""
- p: name.0
  isKey: false
  hc: under-name-comment
  lc: ""
  fc: ""
```

#### 检索注释 - 数组示例

从前面的例子，我们知道注释在第一个子元素上作为 headComment。


```yaml
name:
  # under-name-comment
  - first-array-child
```

```bash
yq '.name[0] | headComment' sample.yml
```

输出：
```yaml
under-name-comment
```

#### 设置头部注释


```yaml
a: cat
```

```bash
yq '. head_comment="single"' sample.yml
```

输出：
```yaml
# single
a: cat
```

#### 设置映射条目的头部注释


```yaml
f: foo
a:
  b: cat
```

```bash
yq '(.a | key) head_comment="single"' sample.yml
```

输出：
```yaml
f: foo
# single
a:
  b: cat
```

#### 设置尾部注释，使用表达式


```yaml
a: cat
```

```bash
yq '. foot_comment=.a' sample.yml
```

输出：
```yaml
a: cat
# cat
```

#### 删除注释


```yaml
a: cat # comment
b: dog # leave this
```

```bash
yq '.a line_comment=""' sample.yml
```

输出：
```yaml
a: cat
b: dog # leave this
```

#### 删除（剥离）所有注释

注意使用 `...` 确保包含键节点。


```yaml
# hi

a: cat # comment
# great
b: # key comment
```

```bash
yq '... comments=""' sample.yml
```

输出：
```yaml
a: cat
b:
```

#### 获取行尾注释


```yaml
# welcome!

a: cat # meow
# have a great day
```

```bash
yq '.a | line_comment' sample.yml
```

输出：
```yaml
meow
```

#### 获取头部注释


```yaml
# welcome!

a: cat # meow

# have a great day
```

```bash
yq '. | head_comment' sample.yml
```

输出：
```yaml
welcome!
```

#### 带文档拆分的头部注释


```yaml
# welcome!
---
# bob
a: cat # meow

# have a great day
```

```bash
yq 'head_comment' sample.yml
```

输出：
```yaml
welcome!
---
bob
```

#### 获取尾部注释


```yaml
# welcome!

a: cat # meow

# have a great day
# no really
```

```bash
yq '. | foot_comment' sample.yml
```

输出：
```yaml
have a great day
no really
```

---

### 列号 (Column)

> 返回匹配节点的列号。从 1 开始，0 表示没有列数据。
>
> 列是节点所在行上位于该节点之前的字符数。

#### 返回值节点的列号


```yaml
a: cat
b: bob
```

```bash
yq '.b | column' sample.yml
```

输出：
```yaml
4
```

#### 返回键节点的列号

管道通过 key 运算符获取键的列号。


```yaml
a: cat
b: bob
```

```bash
yq '.b | key | column' sample.yml
```

输出：
```yaml
1
```

#### 第一列是 1


```yaml
a: cat
```

```bash
yq '.a | key | column' sample.yml
```

输出：
```yaml
1
```

#### 无列数据是 0

```bash
yq --null-input '{"a": "new entry"} | column'
```

输出：
```yaml
0
```

---

### 行号 (Line)

> 返回匹配节点的行号。从 1 开始，0 表示没有行数据。

#### 返回值节点的行号


```yaml
a: cat
b:
  c: cat
```

```bash
yq '.b | line' sample.yml
```

输出：
```yaml
3
```

#### 返回键节点的行号

管道通过 key 运算符获取键的行号。


```yaml
a: cat
b:
  c: cat
```

```bash
yq '.b | key | line' sample.yml
```

输出：
```yaml
2
```

#### 第一行是 1


```yaml
a: cat
```

```bash
yq '.a | line' sample.yml
```

输出：
```yaml
1
```

#### 无行数据是 0

```bash
yq --null-input '{"a": "new entry"} | line'
```

输出：
```yaml
0
```

---


## 其他操作

### 映射 (Map / Map Values)

> 映射数组的值。使用 `map_values` 映射对象的值。

#### 映射数组


```yaml
- 1
- 2
- 3
```

```bash
yq 'map(. + 1)' sample.yml
```

输出：
```yaml
- 2
- 3
- 4
```

#### 映射对象值


```yaml
a: 1
b: 2
c: 3
```

```bash
yq 'map_values(. + 1)' sample.yml
```

输出：
```yaml
a: 2
b: 3
c: 4
```

---

### 最大值 (Max)

> 计算传入标量值序列中的最大值。

#### 最大整数


```yaml
- 99
- 16
- 12
- 6
- 66
```

```bash
yq 'max' sample.yml
```

输出：
```yaml
99
```

#### 最大字符串


```yaml
- foo
- bar
- baz
```

```bash
yq 'max' sample.yml
```

输出：
```yaml
foo
```

#### 空的最大值


```yaml
[]
```

```bash
yq 'max' sample.yml
```

输出为空。

---

### 最小值 (Min)

> 计算传入标量值序列中的最小值。

#### 最小整数


```yaml
- 99
- 16
- 12
- 6
- 66
```

```bash
yq 'min' sample.yml
```

输出：
```yaml
6
```

#### 最小字符串


```yaml
- foo
- bar
- baz
```

```bash
yq 'min' sample.yml
```

输出：
```yaml
bar
```

#### 空的最小值


```yaml
[]
```

```bash
yq 'min' sample.yml
```

输出为空。

---

### 删除 (Delete)

> 删除映射或数组中的匹配项。

#### 删除映射中的条目


```yaml
a: cat
b: dog
```

```bash
yq 'del(.b)' sample.yml
```

输出：
```yaml
a: cat
```

#### 删除映射中的嵌套条目


```yaml
a:
  a1: fred
  a2: frood
```

```bash
yq 'del(.a.a1)' sample.yml
```

输出：
```yaml
a:
  a2: frood
```

#### 删除数组中的条目


```yaml
- 1
- 2
- 3
```

```bash
yq 'del(.[1])' sample.yml
```

输出：
```yaml
- 1
- 3
```

#### 删除数组中的嵌套条目


```yaml
- a: cat
  b: dog
```

```bash
yq 'del(.[0].a)' sample.yml
```

输出：
```yaml
- b: dog
```

#### 无匹配删除


```yaml
a: cat
b: dog
```

```bash
yq 'del(.c)' sample.yml
```

输出：
```yaml
a: cat
b: dog
```

#### 删除匹配条目


```yaml
a: cat
b: dog
c: bat
```

```bash
yq 'del( .[] | select(. == "*at") )' sample.yml
```

输出：
```yaml
b: dog
```

#### 递归删除匹配键


```yaml
a:
  name: frog
  b:
    name: blog
    age: 12
```

```bash
yq 'del(.. | select(has("name")).name)' sample.yml
```

输出：
```yaml
a:
  b:
    age: 12
```

---

## 附录

### 安全标志

| 标志 | 说明 |
|------|------|
| `--security-disable-env-ops` | 禁用环境变量操作 |
| `--security-disable-file-ops` | 禁用文件操作 |
| `--security-enable-system-operator` | 启用系统操作符 |

### 合并锚点标志

| 标志 | 说明 |
|------|------|
| `--yaml-fix-merge-anchor-to-spec=true` | 修复合并锚点到 YAML 规范（推荐） |

### 常用快捷标志

| 标志 | 说明 |
|------|------|
| `-P` / `--prettyPrint` | 美化打印（重置样式） |
| `-r` / `--unwrapScalar` | 解包标量 |
| `-n` / `--null-input` | 空输入 |
| `-i` | 原地编辑 |

### A. 读取值

```bash
yq '.key' file.yaml                              # 读取对象键值
yq '.nested.key' file.yaml                       # 读取嵌套值
yq '.array[0]' file.yaml                         # 读取数组第1个元素
yq '.array[].field' file.yaml                    # 读取数组每个元素的字段
yq '.["key-with-dots"]' file.yaml                # 读取带点特殊键名
yq '.["key with spaces"]' file.yaml              # 读取带空格特殊键名
yq '.[.dynamic_key]' file.yaml                   # 动态键访问（间接引用）
yq '.a?.b?.c?' file.yaml                         # 安全访问（不存在返回null）
yq '.a.b.c | parent' file.yaml                   # 获取父节点
yq '.a.b.c | path' file.yaml                     # 获取路径数组
yq 'getpath(["a","b"])' file.yaml                # 按路径数组获取值
```

### B. 更新值

```bash
yq -i '.key = "value"' file.yaml                 # 基本赋值
yq -i '.nested.key |= . + 1' file.yaml           # 相对赋值（基于旧值更新）
yq -i '(.array[] | select(.name == "x")).field = "y"' file.yaml  # 数组中查找并更新
yq -i '(.a, .b, .c) = "same"' file.yaml          # 多路径同时赋值
yq -i '.new.path.nested = "value"' file.yaml     # 自动创建不存在的路径
yq -i 'setpath(["a","b"]; "value")' file.yaml    # 按路径数组设置值
```

### C. 删除

```bash
yq -i 'del(.key)' file.yaml                         # 删除映射键
yq -i 'del(.array[0])' file.yaml                    # 删除数组元素
yq -i 'del(.. | select(. == "bad"))' file.yaml      # 递归删除匹配值
yq -i 'del(.. | .difficulty?)' file.yaml            # 安全删除（不存在不报错）
yq -i 'del(.[] | select(.active | not))' file.yaml  # 删除不满足条件的元素
yq -i 'delpaths([["a","b"]])' file.yaml             # 按路径数组删除
```

### D. 转换

```bash
yq -Poy file.json                                # JSON -> YAML（美化）
yq -o json file.yaml                             # YAML -> JSON
yq -o xml file.yaml                              # YAML -> XML
yq -P -p xml file.xml                            # XML -> YAML
yq -o props file.yaml                            # YAML -> Properties
yq -o csv file.yaml                              # YAML -> CSV
yq -o toml file.yaml                             # YAML -> TOML
```

### E. 合并文件

```bash
yq eval-all '. as $item ireduce ({}; . * $item )' *.yaml   # 合并所有文件（浅合并）
yq ea '. as $item ireduce ({}; . * $item )' *.yaml         # 简写形式
yq '. *= load("file2.yml")' file1.yml                      # 加载并合并另一个文件
yq '. *d load("file2.yml")' file1.yml                      # 深度合并（数组按索引合并）
```

### F. 环境变量

```bash
yq -i '.value = env(VAR)' file.yaml                       # 读取环境变量（自动识别类型）
myenv="cat" yq '.[env(myenv)]' file.yaml                  # 用环境变量值作为动态键
NAME=value yq -i '.name = strenv(NAME)' file.yaml         # 读取环境变量（始终为字符串）
yq '(.. | select(tag == "!!str")) |= envsubst' file.yaml  # 批量替换字符串中的${VAR}
```

### G. 条件与过滤

```bash
yq '.[] | select(.active == true)' file.yaml       # 选择满足条件的元素
yq '.[] | select(test("^[a-z]+$"))' file.yaml      # 正则匹配过滤
yq '.[] | select(.name == "*test*")' file.yaml     # 通配符匹配过滤
yq '[.[] | select(.age > 18)] | length' file.yaml  # 统计满足条件的数量
```

### H. 递归操作

```bash
yq '.. style="double"' file.yaml                            # 递归设置所有值为双引号
yq 'del(.. | .secret?)' file.yaml                           # 递归删除所有secret字段
yq '.. | select(has("image")).image' file.yaml              # 递归查找并读取image字段
yq '(.. | select(tag == "!!int")) tag = "!!str"' file.yaml  # 递归将所有整数转为字符串
```

### I. 数组操作

```bash
yq '.[]' file.yaml                                   # 展开数组每个元素
yq 'pivot' file.yaml                                 # 矩阵转置（行转列）
yq 'unique' file.yaml                                # 去重
yq '.[1:5]' file.yaml                                # 切片（索引1到4）
yq 'length' file.yaml                                # 获取数组/映射长度
yq 'flatten' file.yaml                               # 递归扁平化嵌套数组
yq 'shuffle' file.yaml                               # 随机打乱数组
yq '.[0, 2, 4]' file.yaml                            # 多索引选择
yq '[range(5)]' file.yaml                            # 生成0-4序列
yq '.[] |= . * 2' file.yaml                          # 每个元素乘以2
yq 'filter(. > 3)' file.yaml                         # 过滤数组（保留大于3的）
yq 'limit(3; .[])' file.yaml                         # 只取前3个结果
yq 'sort_by(.name)' file.yaml                        # 按字段排序
yq 'pick(["a","b"])' file.yaml                       # 只保留指定键
yq 'omit(["a","b"])' file.yaml                       # 排除指定键
yq 'unique_by(.name)' file.yaml                      # 按字段去重
yq 'map_values(. + 1)' file.yaml                     # 映射值批量运算（保持键）
yq 'group_by(.category)' file.yaml                   # 按字段分组
yq 'map(.field = "value")' file.yaml                 # 数组映射（给每个元素添加字段）
yq 'first(.name == "cat")' file.yaml                 # 返回第一个匹配条件的元素
yq 'reverse | unique_by(.name) | reverse' file.yaml  # 保留最新（后出现的优先）
```

### J. 字符串操作

```bash
yq '. | upcase' file.yaml                        # 转大写
yq '. | downcase' file.yaml                      # 转小写
yq '. | trim' file.yaml                          # 修剪首尾空白
yq '. | sub("old", "new")' file.yaml             # 正则替换（首次匹配）
yq '. | gsub("a", "A")' file.yaml                # 全局替换
yq 'join(", ")' file.yaml                        # 用逗号连接数组元素
yq 'split(";")' file.yaml                        # 按分号分割字符串
yq 'capture("(?P<a>\w+)-(?P<n>\d+)")' file.yaml  # 命名捕获组提取
yq 'test("pattern"; "i")' file.yaml              # 正则测试（忽略大小写）
yq '.[0:5]' file.yaml                            # 字符串切片（前5个字符）
```

### K. 样式与标签

```bash
yq '.a style="double"' file.yaml                 # 设置双引号样式
yq '.a style="single"' file.yaml                 # 设置单引号样式
yq '.a style="literal"' file.yaml                # 设置字面量块样式（|）
yq '.a tag = "!!str"' file.yaml                  # 设置类型标签为字符串
yq '.. | tag' file.yaml                          # 递归查看所有类型标签
yq '.. | kind' file.yaml                         # 递归查看所有节点类型（scalar/map/seq）
```

### L. 注释

```bash
yq '.a line_comment="note"' file.yaml            # 设置行尾注释
yq '. head_comment="header"' file.yaml           # 设置文档头部注释
yq '. foot_comment="footer"' file.yaml           # 设置文档尾部注释
yq '... comments=""' file.yaml                   # 删除所有注释
```

### M. 锚点与别名

```bash
yq '.a | anchor' file.yaml                       # 获取锚点名
yq '.a | alias' file.yaml                        # 获取别名引用名
yq 'explode(.)' file.yaml                        # 展开所有别名（内联化）
yq '.a anchor = "new"' file.yaml                 # 设置锚点名
```

### N. 变量与 Reduce

```bash
yq '.a as $x | .b = $x' file.yaml                   # 变量绑定与复用
yq '.[] as $item ireduce (0; . + $item)' file.yaml  # 数组求和（reduce）
yq 'with_entries(.key |= "prefix_" + .)' file.yaml  # 批量修改键名（加前缀）
```

### O. 安全条件更新

```bash
# 核心模式：条件满足时更新，否则保持原样
((select(条件) | .field = 新值) // .)

# 示例：只在type为ss时添加plugin字段
yq '.proxies |= map(
  ((select(.type == "ss") | .plugin = "obfs") // .)
)' file.yaml
```

### P. 数值运算

```bash
yq '.a + .b' file.yaml                           # 加法
yq '.a - .b' file.yaml                           # 减法
yq '.a * .b' file.yaml                           # 乘法
yq '.a / .b' file.yaml                           # 除法
yq '.a % .b' file.yaml                           # 取模
yq '.a | pow(.; 2)' file.yaml                    # 幂运算（平方）
yq '.a | sqrt' file.yaml                         # 平方根
yq '.a | min' file.yaml                          # 最小值
yq '.a | max' file.yaml                          # 最大值
yq 'min_by(.age)' file.yaml                      # 按字段取最小元素
yq 'max_by(.age)' file.yaml                      # 按字段取最大元素
yq '.a | round' file.yaml                        # 四舍五入
yq '.a | floor' file.yaml                        # 向下取整
yq '.a | ceil' file.yaml                         # 向上取整
yq '.a += 1' file.yaml                           # 自增
yq '.a -= 1' file.yaml                           # 自减
```

### Q. 日期时间

```bash
yq -n 'now'                                  # 获取当前时间
yq -n 'now | format_datetime("2006-01-02")'  # 格式化日期
yq -n '1675301929 | from_unix'               # Unix时间戳转日期
yq -n 'now | to_unix'                        # 日期转Unix时间戳
yq -n 'now | tz("Asia/Shanghai")'            # 时区转换（需系统安装 zoneinfo）
```

### R. 比较与默认值

```bash
yq '.a == .b' file.yaml                          # 相等
yq '.a != .b' file.yaml                          # 不等
yq '.a > .b' file.yaml                           # 大于
yq '.a >= .b' file.yaml                          # 大于等于
yq '.a < .b' file.yaml                           # 小于
yq '.a <= .b' file.yaml                          # 小于等于
yq '.a // "default"' file.yaml                   # 默认值（null/false时回退）
```

### S. 逻辑运算

```bash
yq '.a and .b' file.yaml                         # 逻辑与
yq '.a or .b' file.yaml                          # 逻辑或
yq '.a | not' file.yaml                          # 逻辑非
yq 'any' file.yaml                               # 数组任一元素为true
yq 'all' file.yaml                               # 数组所有元素为true
```

### T. 文档与文件索引

```bash
yq 'select(di == 0)' file.yaml                   # 选择第1个文档
yq 'select(fi == 0)' file1.yaml file2.yaml       # 选择第1个文件
yq '.[] | split_doc' file.yaml                   # 数组拆分为多个文档
```

### U. 节点元信息

```bash
yq '.a | line' file.yaml                         # 获取节点行号
yq '.a | column' file.yaml                       # 获取节点列号
yq '.a | key | line' file.yaml                   # 获取键节点的行号
yq 'is_key' file.yaml                            # 判断是否为键节点
yq 'filename' file.yaml                          # 获取当前文件名
yq 'fi' file.yaml                                # 获取文件索引
yq 'di' file.yaml                                # 获取文档索引
```

### V. 动态求值与系统

```bash
yq 'eval(".a.b")' file.yaml                      # 动态执行表达式字符串
yq 'error("msg")' file.yaml                      # 抛出错误并停止
yq 'builtins' file.yaml                          # 列出所有内置函数
yq 'debug' file.yaml                             # 调试输出当前值到stderr
yq 'system("cmd"; "arg")' file.yaml              # 执行外部系统命令（需--security-enable-system-operator）
```

### W. 类型过滤器

```bash
yq '.. | scalars' file.yaml                      # 只保留标量值
yq '.. | arrays' file.yaml                       # 只保留数组
yq '.. | objects' file.yaml                      # 只保留对象/映射
yq '.. | numbers' file.yaml                      # 只保留数字
yq '.. | strings' file.yaml                      # 只保留字符串
yq '.. | booleans' file.yaml                     # 只保留布尔值
yq '.. | iterables' file.yaml                    # 只保留可迭代对象（数组+映射）
yq '.. | nulls' file.yaml                        # 只保留null值
```

---

> **文档说明**：本指南基于 yq 官方操作符文档完整翻译整理，保留了所有官方示例，未做删减。涵盖所有内置操作符的完整用法、示例和注意事项。建议配合 `yq --help` 和实际练习使用。

