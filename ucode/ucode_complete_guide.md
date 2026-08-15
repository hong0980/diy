# ucode 完全使用手册

> **官方文档**: [https://ucode.mein.io](https://ucode.mein.io)  
> **GitHub**: [https://github.com/jow-/ucode](https://github.com/jow-/ucode)  
> **版本**: 基于 ucode 最新稳定版文档整理

---

## 目录

- [第一部分：语言基础](#第一部分语言基础)
  - [1. ucode 简介与设计哲学](#1-ucode-简介与设计哲学)
  - [2. 安装与编译](#2-安装与编译)
  - [3. 命令行详解](#3-命令行详解)
  - [4. 数据类型系统](#4-数据类型系统)
  - [5. 变量与作用域](#5-变量与作用域)
  - [6. 运算符完全参考](#6-运算符完全参考)
  - [7. 控制流语句](#7-控制流语句)
  - [8. 函数与闭包](#8-函数与闭包)
  - [9. 模板模式深度解析](#9-模板模式深度解析)
  - [10. 内存管理与 GC](#10-内存管理与-gc)
- [第二部分：核心内置函数](#第二部分核心内置函数)
  - [11. 类型转换函数](#11-类型转换函数)
  - [12. 字符串操作函数](#12-字符串操作函数)
  - [13. 数组操作函数](#13-数组操作函数)
  - [14. 对象操作函数](#14-对象操作函数)
  - [15. 数学与工具函数](#15-数学与工具函数)
  - [16. 模块系统与 import](#16-模块系统与-import)
- [第三部分：fs 模块完全参考](#第三部分fs-模块完全参考)
  - [17. fs 模块概述与导入](#17-fs-模块概述与导入)
  - [18. 路径操作函数](#18-路径操作函数)
  - [19. 文件访问检查](#19-文件访问检查)
  - [20. 便捷文件读写](#20-便捷文件读写)
  - [21. 目录操作](#21-目录操作)
  - [22. 文件元数据与权限](#22-文件元数据与权限)
  - [23. 文件描述符操作](#23-文件描述符操作)
  - [24. 进程与管道](#24-进程与管道)
  - [25. 临时文件系统](#25-临时文件系统)
  - [26. fs.file 句柄详解](#26-fsfile-句柄详解)
  - [27. fs.dir 句柄详解](#27-fsdir-句柄详解)
  - [28. fs.proc 句柄详解](#28-fsproc-句柄详解)
  - [29. 错误处理与最佳实践](#29-错误处理与最佳实践)
  - [30. fs 实战示例集](#30-fs-实战示例集)
- [第四部分：OpenWrt 核心模块](#第四部分openwrt-核心模块)
  - [31. ubus 模块](#31-ubus-模块)
  - [32. uci 模块](#32-uci-模块)
  - [33. uloop 事件循环](#33-uloop-事件循环)
- [第五部分：网络与系统模块](#第五部分网络与系统模块)
  - [34. socket 模块](#34-socket-模块)
  - [35. math 模块](#35-math-模块)
  - [36. digest 模块](#36-digest-模块)
  - [37. debug 模块](#37-debug-模块)
- [第六部分：高级主题](#第六部分高级主题)
  - [38. 字节码编译](#38-字节码编译)
  - [39. 异常处理与调试](#39-异常处理与调试)
  - [40. C API 嵌入指南](#40-c-api-嵌入指南)
  - [41. 性能优化建议](#41-性能优化建议)
  - [42. 常见问题与陷阱](#42-常见问题与陷阱)

---

# 第一部分：语言基础

---

## 1. ucode 简介与设计哲学

### 1.1 什么是 ucode

**ucode** 是一种小型通用脚本语言，语法高度接近 **ECMAScript 6 (JavaScript)**，但设计为**同步执行**、**无面向对象标准库**的系统脚本语言。它由 Jo-Philipp Wich 开发，最初为 OpenWrt 的 nftables 防火墙（firewall4）模板处理器而设计，后来演变为通用系统脚本语言。

### 1.2 核心设计目标

| 目标 | 说明 |
|------|------|
| **ECMAScript-like 语法** | 熟悉 JS 的开发者可快速上手，可复用现有编辑器的语法高亮 |
| **模板引擎** | 支持 Jinja-like 的模板语法，适合生成配置文件 |
| **原生 JSON 支持** | 内置 JSON 解析与序列化，无需外部库 |
| **独立类型系统** | 区分 `array` / `object`，`int` / `double`，避免 Lua 的表混淆 |
| **64位整数保证** | 支持 `-9223372036854775808` 到 `+9223372036854775807` |
| **位运算内置** | 支持 `&`、`|`、`^`、`<<`、`>>`、`~` |
| **POSIX 正则表达式** | 内置正则支持，无需额外库 |
| **Perl 5 风格内置函数** | 丰富的标准库函数，如 `split`、`join`、`map`、`grep` 等 |
| **OpenWrt 原生集成** | 绑定 ubus、uci、uloop、netlink 等 API |
| **超小体积** | 解释器+运行时约 **64KB** (ARM Cortex A9) |
| **可嵌入 C 程序** | 提供 C API 供宿主应用调用 |
| **同步执行** |  procedural 编程模型，无 async/await 复杂性 |

### 1.3 与 JavaScript 的关键差异

| 特性 | ucode | JavaScript |
|------|-------|-----------|
| 执行模型 | 同步单线程 | 异步事件驱动 |
| 对象系统 | 无内置 OOP（无 class/new） | 完整的原型链 + class |
| 数组实现 | 连续内存数组 | 动态对象数组 |
| 整数类型 | 64位有符号整数 | 53位安全整数（IEEE 754） |
| 类型转换 | 更严格的隐式规则 | 宽松的隐式转换 |
| 错误处理 | 简单的异常机制 | 完整的 try/catch/finally |
| 模块系统 | `import` 加载原生模块 | ES Modules / CommonJS |
| 标准库 | Perl 5 风格函数集 | ECMAScript 标准库 |
| 模板语法 | Jinja-like 原生支持 | 需外部模板引擎 |
| 内存管理 | 引用计数 + 标记清除 | 垃圾回收（V8 等） |

### 1.4 典型应用场景

- **OpenWrt 系统脚本**：替代 shell 和 Lua 处理配置
- **防火墙规则生成**：nftables 规则集模板处理（firewall4）
- **JSON 数据处理**：配置解析、API 响应处理
- **ubus/uci 交互**：OpenWrt 进程通信和配置管理
- **嵌入式系统**：超小体积适合资源受限设备
- **C 应用嵌入**：作为配置语言或扩展脚本引擎

---

## 2. 安装与编译

### 2.1 OpenWrt (22.03+)

Modern OpenWrt 通常已预装 ucode 基础包：

```bash
# 安装基础解释器
opkg install ucode

# 安装常用模块
opkg install ucode-mod-fs      # 文件系统
opkg install ucode-mod-ubus    # ubus 通信
opkg install ucode-mod-uci     # UCI 配置
opkg install ucode-mod-uloop   # 事件循环
opkg install ucode-mod-math    # 数学函数
opkg install ucode-mod-socket  # 网络套接字
opkg install ucode-mod-digest  # 哈希算法
```

### 2.2 macOS 编译安装

```bash
# 安装依赖
brew install cmake json-c libmd

# 克隆源码
git clone https://github.com/jow-/ucode.git
cd ucode/

# 配置（禁用 OpenWrt 特有模块）
cmake -DUBUS_SUPPORT=OFF -DUCI_SUPPORT=OFF -DULOOP_SUPPORT=OFF \
  -DCMAKE_BUILD_RPATH=/usr/local/lib \
  -DCMAKE_INSTALL_RPATH=/usr/local/lib .

# 编译安装
make
sudo make install
```

### 2.3 Debian/Ubuntu 编译安装

```bash
# 安装构建依赖
sudo apt-get install build-essential devscripts debhelper \
  libjson-c-dev cmake pkg-config

# 克隆源码
git clone https://github.com/jow-/ucode.git
cd ucode/

# 构建 deb 包
dpkg-buildpackage -b -us -uc

# 安装
sudo dpkg -i ../ucode*.deb ../libucode*.deb
```

### 2.4 通用 Linux 源码编译

```bash
git clone https://github.com/jow-/ucode.git
cd ucode/

# 基础配置（仅核心 + fs）
cmake -DUBUS_SUPPORT=OFF -DUCI_SUPPORT=OFF -DULOOP_SUPPORT=OFF .

# 完整功能配置
cmake -DUBUS_SUPPORT=ON -DUCI_SUPPORT=ON -DULOOP_SUPPORT=ON \
  -DSOCKET_SUPPORT=ON -DMATH_SUPPORT=ON .

make
sudo make install
```

### 2.5 编译选项说明

| CMake 选项 | 默认值 | 说明 |
|-----------|--------|------|
| `UBUS_SUPPORT` | ON | ubus 模块支持 |
| `UCI_SUPPORT` | ON | uci 模块支持 |
| `ULOOP_SUPPORT` | ON | uloop 模块支持 |
| `SOCKET_SUPPORT` | ON | socket 模块支持 |
| `MATH_SUPPORT` | ON | math 模块支持 |
| `DIGEST_SUPPORT` | ON | digest 模块支持 |
| `DEBUG_SUPPORT` | ON | debug 模块支持 |

---

## 3. 命令行详解

### 3.1 基本调用格式

```bash
ucode [options] <script.uc> [args...]
```

### 3.2 完整选项参考

| 选项 | 长格式 | 参数 | 说明 |
|------|--------|------|------|
| `-h` | | | 显示帮助信息 |
| `-e` | | `"expr"` | 将表达式作为 ucode 程序执行 |
| `-p` | | `"expr"` | 执行表达式并打印结果 |
| `-c` | | `[-s] [-o out.uc] in.uc ...` | 编译为字节码（默认输出 `./uc.out`） |
| `-t` | | | 启用 VM 执行跟踪（调试输出） |
| `-g` | | `interval` | 每 `interval` 条指令执行一次 GC |
| `-S` | | | 启用严格模式 |
| `-R` | | | 原始脚本模式（默认） |
| `-T` | | `[flag,flag,...]` | 模板模式，可选标志控制空白处理 |
| `-D` | | `[name=]value` | 定义全局变量（JSON 或字符串） |
| `-F` | | `[name=]path` | 从 JSON 文件定义全局变量 |
| `-U` | | `name` | 取消定义全局变量 |
| `-l` | | `[name=]library` | 预加载指定库/模块 |
| `-L` | | `pattern` | 添加库搜索路径 |
| `-E` | | | 将未捕获的异常视为致命错误 |
| `-C` | | | 禁用字节码编译器优化 |
| `-V` | | | 显示版本信息 |

### 3.3 执行模式详解

#### 原始模式（Raw Mode，默认）

```bash
# 直接执行脚本文件
ucode script.uc

# 执行表达式
ucode -e "print('Hello World\n')"

# 执行并打印结果
ucode -p "2 ** 10"        # 输出: 1024
ucode -p "json({a:1})"    # 输出: {"a":1}
```

#### 模板模式（Template Mode）

```bash
# 使用 -T 标志
ucode -T template.html

# 或使用 utpl 别名（如果安装了）
utpl template.html

# 模板模式带标志
ucode -Tl,n template.html
#   l: 保留前导空白
#   n: 保留尾部换行
```

#### 编译模式

```bash
# 编译为字节码
ucode -c script.uc

# 指定输出文件
ucode -c -o compiled.uc script.uc

# 去除调试信息（更小体积）
ucode -c -s -o compiled.uc script.uc

# 执行编译后的字节码
ucode compiled.uc
```

### 3.4 全局变量定义

```bash
# 定义简单变量
ucode -D "debug=true" -D "port=8080" script.uc

# 定义 JSON 对象（所有属性成为全局变量）
ucode -D '{"debug":true,"port":8080}' script.uc

# 从文件加载（必须是 JSON 字典）
ucode -F config.json script.uc

# 命名加载
ucode -D "cfg={"x":1}" script.uc
ucode -F "cfg=config.json" script.uc
```

### 3.5 模块预加载

```bash
# 预加载 fs 模块
ucode -lfs script.uc

# 预加载并指定别名
ucode -l "myfs=fs" script.uc

# 预加载多个模块
ucode -lfs -lmath -lsocket script.uc

# 添加自定义搜索路径
ucode -L "/usr/local/lib/ucode" -L "/opt/ucode/lib" script.uc
```

### 3.6 脚本参数传递

```bash
# 传递参数
ucode script.uc arg1 arg2 arg3

# 脚本内通过全局变量访问
# ARGV = ["arg1", "arg2", "arg3"]
# SCRIPT_NAME = "script.uc"
```

```javascript
#!/usr/bin/env ucode
// script.uc
print("Script: ", SCRIPT_NAME, "\n");
print("Args: ", ARGV, "\n");
print("Arg count: ", length(ARGV), "\n");

if (length(ARGV) > 0) {
    print("First arg: ", ARGV[0], "\n");
}
```

### 3.7 shebang 写法

```javascript
#!/usr/bin/env ucode
// 标准 shebang

#!/usr/bin/ucode -lfs
// 带预加载模块的 shebang

#!/usr/bin/env -S ucode -T
// 模板模式 shebang（注意：-S 是 env 的选项，不是 ucode 的）
```

---

## 4. 数据类型系统

### 4.1 类型总览

ucode 支持 7 种基本类型 + 2 种特殊类型：

| 类型 | 字面量示例 | 说明 | type() 返回值 |
|------|-----------|------|--------------|
| `null` | `null` | 空值 | `null` |
| `bool` | `true`, `false` | 布尔值 | `"bool"` |
| `int` | `42`, `0xff`, `-999` | 64位有符号整数 | `"int"` |
| `double` | `3.14`, `1.7e308`, `NaN`, `Infinity` | IEEE 754 双精度浮点 | `"double"` |
| `string` | `"hello"`, `'world'`, `"\u2600"` | UTF-8 字符串 | `"string"` |
| `array` | `[1, 2, 3]` | 连续内存数组 | `"array"` |
| `object` | `{foo: 1, "bar": 2}` | 有序哈希表（键为字符串） | `"object"` |
| `function` | `function() {}` | 函数值 | `"function"` |
| `resource` | `<fs.file 0x7f...>` | 资源句柄（不可直接创建） | 资源类型名 |

### 4.2 类型检测

```javascript
// 使用 type() 函数
let x = 42;
print(type(x), "\n");      // "int"

let y = [1, 2, 3];
print(type(y), "\n");      // "array"

let z = null;
print(type(z), "\n");      // null (注意：type(null) 返回 null，不是字符串)

// 类型判断
function isArray(val) {
    return type(val) == "array";
}

function isObject(val) {
    return type(val) == "object";
}
```

### 4.3 类型转换规则

#### 隐式转换

ucode 的隐式转换比 JavaScript 更严格：

```javascript
// 算术运算：全部转为数字
print("10" + 5);      // 15 (字符串被转为数字)
print("10" + "5");    // "105" (字符串拼接)
print(true + 1);      // 2 (true -> 1)
print(false + 1);     // 1 (false -> 0)

// 关系运算
print(123 == "123");  // true (强制转为数字比较)
print(123 === "123"); // false (严格相等，不转换)
print({} == {});      // false (对象比较内存地址)

// 逻辑运算
print(0 || "hello");  // "hello" (0 为 falsy)
print("" && 42);      // "" (空字符串为 falsy)
print(null ?? 42);    // 42 (nullish 合并)
```

#### 显式转换

```javascript
// 转整数
int("123");           // 123
int("0xff");          // 255
int("abc");           // NaN
int(3.14);            // 3
int(true);            // 1
int(false);           // 0

// 转浮点数
double("3.14");       // 3.14
double("abc");        // NaN

// 转字符串
str(42);              // "42"
str(true);            // "true"
str([1,2,3]);         // "[1,2,3]" (JSON)
str({a:1});           // "{\"a\":1}" (JSON)

// JSON 转换
json({a: 1, b: true});  // '{"a":1,"b":true}'
let obj = json('{"x":10}');  // 解析 JSON 字符串
```

### 4.4 真值判断（Truthiness）

在 ucode 中，以下值被视为 **falsy**：

- `null`
- `false`
- `0` (整数零)
- `0.0` (浮点零)
- `""` (空字符串)
- `NaN`

其他所有值均为 **truthy**，包括：
- 空数组 `[]`
- 空对象 `{}`
- 字符串 `"0"`
- 字符串 `"false"`

```javascript
if ([]) {
    print("Empty array is truthy\n");  // 会执行
}

if ("") {
    print("This won't print\n");       // 不会执行
}

if ("0") {
    print("String '0' is truthy\n");   // 会执行
}
```

---

## 5. 变量与作用域

### 5.1 变量声明方式

```javascript
// 全局变量（无关键字）
a = 1;

// 局部变量（块作用域）
let b = 2;

// 常量（不可重新赋值）
const c = 3;
```

### 5.2 作用域规则

ucode 使用**函数作用域**（不是块作用域），但 `let` 和 `const` 具有**块作用域**：

```javascript
let x = 1;          // 全局

function test() {
    let local = 2;  // 函数局部
    global = 3;     // 隐式全局（不推荐）

    if (true) {
        let block = 4;  // 块作用域（仅在此 if 内）
        var_func = 5;   // 函数作用域（整个 test 函数内）
    }

    // print(block);    // 错误！block 不可见
    print(var_func);    // 5，可以访问
}

test();
print(x);           // 1
// print(local);    // 错误！local 不可见
```

### 5.3 const 常量

```javascript
const PI = 3.14159;
const CONFIG = { debug: true, port: 8080 };

// PI = 3.14;       // 语法错误！
// CONFIG = {};     // 语法错误！

// 但对象属性可以修改
CONFIG.debug = false;   // 这是允许的！
CONFIG.port = 9090;     // 这也是允许的！

// const 必须初始化
// const X;          // 语法错误！
```

### 5.4 变量提升与顺序

```javascript
// 函数声明提升
foo();  // 可以调用，因为函数声明被提升

function foo() {
    print("foo\n");
}

// let/const 不提升
// print(x);        // 错误！x 未定义
let x = 1;
```

---

## 6. 运算符完全参考

### 6.1 算术运算符

| 运算符 | 名称 | 示例 | 说明 |
|--------|------|------|------|
| `+` | 加法 | `4 + 8` -> `12` | 任一操作数为字符串则拼接 |
| `-` | 减法 | `7 - 4` -> `3` | |
| `*` | 乘法 | `3 * 3` -> `9` | |
| `/` | 除法 | `10 / 4` -> `2` | 整数除法（两个整数） |
| `/` | 除法 | `10 / 4.0` -> `2.5` | 浮点除法（任一为 double） |
| `%` | 取模 | `10 % 7` -> `3` | **仅支持整数** |
| `**` | 幂运算 | `2 ** 10` -> `1024` | |
| `++` | 自增 | `a++` / `++a` | 前缀/后缀 |
| `--` | 自减 | `a--` / `--a` | 前缀/后缀 |
| `+` | 一元正 | `+"123"` -> `123` | 转为数字 |
| `-` | 一元负 | `-"123"` -> `-123` | 取反 |

**特殊行为：**

```javascript
print(10 / 0);        // Infinity
print(10 % 7.0);      // NaN (取模不支持浮点)
print(10 / 4);        // 2 (整数除法)
print(10 / 4.0);      // 2.5 (浮点除法)
print("hello" + 1);   // "hello1" (字符串拼接)
print("10" + 5);      // 15 (算术运算，字符串转数字)
```

### 6.2 位运算符

| 运算符 | 名称 | 示例 | 说明 |
|--------|------|------|------|
| `&` | 按位与 | `0 & 1` -> `0` | |
| `|` | 按位或 | `0 | 1` -> `1` | |
| `^` | 按位异或 | `0 ^ 1` -> `1` | |
| `<<` | 左移 | `10 << 2` -> `40` | |
| `>>` | 右移 | `10 >> 2` -> `2` | 算术右移（保留符号） |
| `~` | 按位非 | `~15` -> `-16` | |

**重要特性**：位运算符会**强制将操作数转为整数**：

```javascript
print(12.34 >> 0);    // 12 (截断小数部分)
print(~(~12.34));     // 12 (双重取反 = 截断)
print(3.9 & 0);       // 3 (截断后运算)
```

### 6.3 关系运算符

| 运算符 | 名称 | 说明 |
|--------|------|------|
| `==` | 相等 | 不同类型时强制转数字比较 |
| `!=` | 不等 | |
| `===` | 严格相等 | 类型和值都相同 |
| `!==` | 严格不等 | |
| `<` | 小于 | 字符串按字节值比较 |
| `<=` | 小于等于 | |
| `>` | 大于 | |
| `>=` | 大于等于 | |
| `in` | 成员检查 | `"foo" in {foo:1}` -> `true` |

```javascript
print(123 == "123");     // true (强制转换)
print(123 === "123");    // false (严格相等)
print({} == {});         // false (不同对象，比较内存地址)
let a = {}; print(a == a);  // true (同一对象)
print("abc" < "def");    // true (字符串字节比较)
print("foo" in {foo: 1}); // true
```

### 6.4 逻辑运算符

| 运算符 | 名称 | 行为 | 示例 |
|--------|------|------|------|
| `&&` | 逻辑与 | 返回最后一个 truthy 值 | `1 && 2 && 3` -> `3` |
| `||` | 逻辑或 | 返回第一个 truthy 值 | `1 || 2 || 3` -> `1` |
| `??` | Nullish 合并 | 返回第一个非 null 值 | `null ?? 42` -> `42` |
| `!` | 逻辑非 | 取反 | `!false` -> `true` |

**短路求值：**

```javascript
// && 短路
let result = test1() && test2();  // test2() 仅在 test1() 返回 truthy 时执行

// || 短路
let config = userConfig || defaultConfig;

// ?? 短路
let value = maybeNull ?? defaultValue;
```

### 6.5 赋值运算符

| 运算符 | 等价于 | 说明 |
|--------|--------|------|
| `=` | `a = b` | 基本赋值 |
| `+=` | `a = a + b` | 加法赋值 |
| `-=` | `a = a - b` | 减法赋值 |
| `*=` | `a = a * b` | 乘法赋值 |
| `/=` | `a = a / b` | 除法赋值 |
| `%=` | `a = a % b` | 取模赋值 |
| `**=` | `a = a ** b` | 幂运算赋值 |
| `&=` | `a = a & b` | 按位与赋值 |
| `|=` | `a = a | b` | 按位或赋值 |
| `^=` | `a = a ^ b` | 按位异或赋值 |
| `<<=` | `a = a << b` | 左移赋值 |
| `>>=` | `a = a >> b` | 右移赋值 |
| `&&=` | `a = a && b` | 逻辑与赋值 |
| `||=` | `a = a || b` | 逻辑或赋值 |
| `??=` | `a = a ?? b` | Nullish 合并赋值 |

### 6.6 其他运算符

| 运算符 | 名称 | 示例 | 说明 |
|--------|------|------|------|
| `delete` | 删除 | `delete obj.prop` | 删除对象属性 |
| `?.` | 可选链 | `obj?.prop` | 安全访问嵌套属性 |
| `...` | 展开 | `[...arr, 4]` | 展开数组/对象 |
| `=>` | 箭头 | `(x) => x * 2` | 箭头函数 |
| `,` | 序列 | `a = 1, b = 2` | 逗号运算符 |

### 6.7 运算符优先级（从高到低）

| 优先级 | 运算符 | 结合性 |
|--------|--------|--------|
| 19 | `( ... )` 分组 | n/a |
| 18 | `.` 属性访问, `?.` 可选链, `[ ]` 计算属性, `( )` 函数调用 | 左到右 |
| 17 | `++` `--` 后缀 | n/a |
| 16 | `!` `~` `+` `-` `++` `--` `delete` 前缀 | n/a |
| 15 | `**` 幂运算 | 右到左 |
| 14 | `*` `/` `%` | 左到右 |
| 13 | `+` `-` | 左到右 |
| 12 | `<<` `>>` | 左到右 |
| 11 | `<` `<=` `>` `>=` `in` | 左到右 |
| 10 | `==` `!=` `===` `!==` | 左到右 |
| 9 | `&` | 左到右 |
| 8 | `^` | 左到右 |
| 7 | `|` | 左到右 |
| 6 | `&&` | 左到右 |
| 5 | `||` `??` | 左到右 |
| 4 | `=` `+=` `-=` 等所有赋值 | 右到左 |
| 3 | `? :` 三元 | 右到左 |
| 2 | `=>` 箭头, `...` 展开 | 右到左 |
| 1 | `,` 序列 | 左到右 |

---

## 7. 控制流语句

### 7.1 if / else if / else

```javascript
let user = getenv("USER");

if (user == "alice") {
    print("Hello Alice!\n");
} else if (user == "bob") {
    print("Hello Bob!\n");
} else {
    print("Hello guest!\n");
}

// 单语句可省略花括号
if (rand() == 3)
    print("This is quite unlikely\n");
```

### 7.2 while 循环

```javascript
let i = 0;
let arr = [1, 2, 3, 4, 5];

while (i < length(arr)) {
    print(arr[i], "\n");
    i++;
}

// do-while 不支持
```

### 7.3 for...in 循环（数组/对象遍历）

```javascript
// 遍历数组（返回元素值）
let arr = ["apple", "banana", "cherry"];
for (item in arr) {
    print(item, "\n");
}

// 遍历对象（返回键名）
let obj = { Alice: 32, Bob: 54 };
for (person in obj) {
    print(person, " is ", obj[person], " years old.\n");
}

// C-style for 循环
for (let j = 0; j < length(arr); j++) {
    print(arr[j], "\n");
}
```

### 7.4 switch 语句

```javascript
let day = 3;
let specialDay = 1;

switch (day) {
    case specialDay + 2:
        print("Wednesday\n");
        break;

    case 1:
        let message = "Start of week";
        print(message + "\n");
        break;

    case 2: {
        let message = "Tuesday";
        print(message + "\n");
        break;
    }

    case 4:
    case 5:
        print("Thursday or Friday\n");
        break;

    default:
        print("Weekend\n");
}
```

**switch 特性：**
- 使用**严格相等**（`===`）比较
- 没有 `break` 会 fall-through
- 整个 switch 共享一个块作用域
- 可在 case 内使用 `{}` 创建局部作用域
- 不支持替代语法（`switch` 没有 `endswitch`）

### 7.5 替代语法（模板友好）

在模板中可使用更清晰的 `end` 语法：

```jinja
{% if (user == "admin"): %}
    <h1>Admin Panel</h1>
{% elif (user == "moderator"): %}
    <h1>Moderator Panel</h1>
{% else %}
    <h1>Welcome</h1>
{% endif %}

{% for (item in items): %}
    <li>{{ item }}</li>
{% endfor %}

{% while (count < 10): %}
    {{ count++ }}
{% endwhile %}
```

**替代语法对应表：**

| 标准语法 | 替代语法 |
|---------|---------|
| `if (...) { }` | `if (...): ... endif` |
| `for (...) { }` | `for (...): ... endfor` |
| `while (...) { }` | `while (...): ... endwhile` |
| `function name() { }` | `function name(): ... endfunction` |

---

## 8. 函数与闭包

### 8.1 函数声明

```javascript
// 命名函数声明
function add(a, b) {
    return a + b;
}

// 匿名函数表达式
let multiply = function(a, b) {
    return a * b;
};

// 箭头函数
let square = (x) => x * x;
let sum = (a, b) => a + b;

// 多语句箭头函数
let calc = (a, b) => {
    let result = a + b;
    return result * 2;
};
```

### 8.2 函数作为值

```javascript
let utilities = {
    concat: function(a, b) {
        return "" + a + b;
    },
    greeting: function() {
        return "Hello, " + getenv("USER") + "!";
    }
};

print(utilities.concat("abc", 123));  // "abc123"
print(utilities.greeting());
```

### 8.3 前向声明（递归）

```javascript
// 前向声明
function is_even;
function is_odd;

function is_even(n) {
    if (n == 0) return true;
    return is_odd(n - 1);
}

function is_odd(n) {
    if (n == 0) return false;
    return is_even(n - 1);
}

print(is_even(10), "\n");  // true
```

### 8.4 函数参数

```javascript
// 默认参数（通过 || 或 ?? 实现）
function greet(name) {
    name = name || "World";
    return "Hello, " + name;
}

// 推荐做法：显式数组参数
function sumArray(arr) {
    let total = 0;
    for (let n in arr) {
        total += n;
    }
    return total;
}
```

### 8.5 this 上下文

```javascript
let obj = {
    name: "Alice",
    greet: function() {
        return "Hello, " + this.name;
    }
};

print(obj.greet());  // "Hello, Alice"

// 使用 call() 改变上下文
let other = { name: "Bob" };
print(call(obj.greet, other));  // "Hello, Bob"
```

---

## 9. 模板模式深度解析

### 9.1 模板模式概述

模板模式允许在纯文本中嵌入 ucode 逻辑，类似于 Jinja2 模板引擎。通过 `-T` 标志或 `utpl` 命令启用。

### 9.2 三种块类型

| 块类型 | 语法 | 说明 | 输出行为 |
|--------|------|------|---------|
| **语句块** | `{% ... %}` | 执行任意 ucode 语句 | 不产生输出 |
| **表达式块** | `{{ ... }}` | 求值并输出结果 | 输出表达式结果 |
| **注释块** | `{# ... #}` | 完全丢弃 | 不产生任何输出 |

### 9.3 语句块详解

```jinja
{# 条件输出 #}
The epoch is {% if (time() % 2): %}odd{% else %}even{% endif %}!

{# 循环输出 #}
<ul>
{% for (item in ["apple", "banana", "cherry"]): %}
    <li>{{ item }}</li>
{% endfor %}
</ul>

{# 可以省略结束标签，解析剩余全部内容 #}
{%
    // 这里可以写完整的 ucode 程序
    let x = 1;
    let y = 2;
    print(x + y, "\n");
    // 不需要 %}
```

### 9.4 表达式块详解

```jinja
Hello world, {{ getenv("USER") }}!
{# 输出: Hello world, alice! #}

{{ 2 + 3 }}
{# 输出: 5 #}

{{ [1, 2, 3] }}
{# 输出: [1,2,3] (JSON 格式) #}
```

### 9.5 空白控制

在块标签中使用 `-` 控制空白：

```jinja
{# 原始输出（保留空白） #}
Line 1
{% for (x in [1, 2, 3]): %}
Item {{ x }}
{% endfor %}
Line 2
{# 输出中间会有空行 #}

{# 去除块后空白 #}
Line 1
{% for (x in [1, 2, 3]): -%}
Item {{ x }}
{% endfor -%}
Line 2
{# 去除了 for 和 endfor 后的换行 #}

{# 去除块前后空白 #}
Line 1
{%- for (x in [1, 2, 3]): -%}
Item {{ x }}
{%- endfor -%}
Line 2
{# 所有块相关的空白都被去除 #}
```

**空白控制规则：**

| 标记 | 作用 |
|------|------|
| `{%-` | 去除块**前**的空白 |
| `-%}` | 去除块**后**的空白 |
| `{{-` | 去除表达式块**前**的空白 |
| `-}}` | 去除表达式块**后**的空白 |

### 9.6 模板模式标志

```bash
ucode -Tl,n template.html
```

| 标志 | 说明 |
|------|------|
| `l` | 保留前导空白（leading whitespace） |
| `n` | 保留尾部换行（trailing newlines） |

### 9.7 完整模板示例

```html
<!DOCTYPE html>
<html>
<head>
    <title>{{ title ?? "Default Title" }}</title>
</head>
<body>
    <h1>Welcome, {{ user.name ?? "Guest" }}!</h1>

    {% if (user.role == "admin"): %}
        <div class="admin-panel">
            <p>You have admin privileges.</p>
        </div>
    {% endif %}

    <h2>Products</h2>
    <ul>
    {% for (product in products): %}
        <li>
            <strong>{{ product.name }}</strong> - 
            ${{ product.price }}
            {% if (product.in_stock): %}
                <span class="in-stock">In Stock</span>
            {% else %}
                <span class="out-of-stock">Out of Stock</span>
            {% endif %}
        </li>
    {% endfor %}
    </ul>

    {# 注释：这部分是页脚 #}
    <footer>
        <p>Generated at {{ time() }}</p>
    </footer>
</body>
</html>
```

### 9.8 render() 函数

`render()` 可以捕获模板输出为字符串：

```javascript
// 渲染模板文件到字符串
let html = render("template.html", { title: "My Page", user: { name: "Alice" } });

// 渲染函数输出
let output = render(function() {
    print("Hello from rendered function!\n");
});
```

---

## 10. 内存管理与 GC

### 10.1 引用计数机制

ucode 主要使用**引用计数**管理内存：

```javascript
let x = [{a: 1}, {b: 2}];  // 数组引用计数 = 1
let y = x[1];               // x[1] 的对象引用计数 = 2

x = null;                   // 数组引用计数 = 0，触发释放
                            // {a:1} 被释放
                            // {b:2} 仍被 y 引用，不释放

y = null;                   // {b:2} 引用计数 = 0，被释放
```

### 10.2 循环引用问题

引用计数无法处理循环引用：

```javascript
let obj = {};
obj.self = obj;             // 循环引用！引用计数永远 >= 1

// 即使 obj = null，内存也不会释放
obj = null;
// obj 指向的对象仍被 obj.self 引用，内存泄漏
```

### 10.3 标记-清除 GC

ucode 提供**标记-清除（Mark-Sweep）**垃圾回收器处理循环引用：

```bash
# 命令行启用周期性 GC
ucode -g 100 script.uc      # 每 100 条 VM 指令执行一次 GC
```

```javascript
// 脚本中手动触发 GC
gc();                       // 执行一次完整的 GC 周期

// GC 操作参数
gc("collect");              // 同 gc()，执行收集
gc("start", 500);           // 启动周期性 GC，每 500 条指令
gc("stop");                 // 停止周期性 GC
gc("count");                // 返回当前活跃的对象引用数量
```

### 10.4 内存管理最佳实践

```javascript
// 1. 避免循环引用
let parent = { children: [] };
let child = { parent: null };  // 使用弱引用模式
parent.children = [child];

// 2. 大对象及时释放
function processLargeFile() {
    let data = readfile("/tmp/huge.bin");
    // 处理数据...
    data = null;  // 显式释放引用
    gc();          // 建议手动触发 GC
}

// 3. 使用局部变量减少全局引用
function helper() {
    let tmp = createLargeObject();
    // 使用 tmp...
    // 函数返回后 tmp 自动释放
}
```

---

# 第二部分：核心内置函数

---

## 11. 类型转换函数

### 11.1 完整类型转换参考

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `type(val)` | 任意 | 字符串/null | 返回类型名，null 输入返回 null |
| `int(val, base?)` | 任意 | int/NaN | 转为整数，可选进制(2-36) |
| `double(val)` | 任意 | double/NaN | 转为浮点数 |
| `str(val)` | 任意 | 字符串 | 转为字符串 |
| `json(val)` | 任意 | 字符串 | 转为 JSON 字符串 |
| `json(str)` | 字符串 | 任意 | 解析 JSON 字符串 |
| `hexenc(str)` | 字符串 | 字符串 | 字节串转十六进制 |
| `hexdec(str, skip?)` | 字符串 | 字符串/null | 十六进制转字节串 |
| `b64enc(str)` | 字符串 | 字符串 | Base64 编码 |
| `b64dec(str)` | 字符串 | 字符串 | Base64 解码 |

### 11.2 int() 详解

```javascript
int("123");           // 123
int("0xff");          // 255 (自动检测十六进制)
int("0b1010");        // 10 (自动检测二进制)
int("0o77");          // 63 (自动检测八进制)

int("1010", 2);       // 10 (显式二进制)
int("FF", 16);        // 255 (显式十六进制)
int("377", 8);        // 255 (显式八进制)

int("abc");           // NaN
int(3.14);            // 3 (截断)
int(true);            // 1
int(false);           // 0
int(null);            // NaN
```

### 11.3 json() 详解

```javascript
// 序列化
json({a: 1, b: true});     // '{"a":1,"b":true}'
json([1, 2, 3]);           // '[1,2,3]'
json(null);                // 'null'

// 解析
let obj = json('{"x":10,"y":20}');
print(obj.x);              // 10

// 解析错误会抛出异常
// json('{"a":1,');        // 抛出异常：Parse error
```

### 11.4 编解码函数

```javascript
// 十六进制
hexenc("Hello");          // "48656c6c6f"
hexdec("48656c6c6f");     // "Hello"
hexdec("44:55:66", ":"); // "DUf" (跳过指定字符)

// Base64
b64enc("Hello");          // "SGVsbG8="
b64dec("SGVsbG8=");      // "Hello"
```

---

## 12. 字符串操作函数

### 12.1 完整字符串函数参考

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `length(str)` | 字符串 | int | 字节长度（不是字符数） |
| `substr(str, off, len?)` | 字符串, 偏移, 长度 | 字符串 | 子字符串 |
| `split(str, sep, limit?)` | 字符串, 分隔符, 限制 | 数组 | 分割字符串 |
| `join(sep, arr)` | 分隔符, 数组 | 字符串 | 数组连接 |
| `trim(str, chars?)` | 字符串, 字符集 | 字符串 | 去除首尾字符 |
| `ltrim(str, chars?)` | 字符串, 字符集 | 字符串 | 去除首部字符 |
| `rtrim(str, chars?)` | 字符串, 字符集 | 字符串 | 去除尾部字符 |
| `ord(str, off?)` | 字符串, 偏移 | int | 获取字符 ASCII 值 |
| `chr(n)` | 数字 | 字符串 | ASCII 转字符 |
| `uc(str)` | 字符串 | 字符串 | 转大写 |
| `lc(str)` | 字符串 | 字符串 | 转小写 |
| `replace(str, pat, repl, limit?)` | 字符串, 模式, 替换, 限制 | 字符串 | 替换 |
| `match(str, regex)` | 字符串, 正则 | 数组/null | 正则匹配 |
| `sprintf(fmt, ...)` | 格式, 参数... | 字符串 | 格式化 |
| `index(str, needle)` | 字符串, 子串 | int | 查找子串位置 |
| `rindex(str, needle)` | 字符串, 子串 | int | 从后查找 |
| `reverse(str)` | 字符串 | 字符串 | 反转字符串 |

### 12.2 replace() 详解

```javascript
// 简单替换
replace("foo bar baz", "bar", "qux");  // "foo qux baz"

// 正则替换（全局）
replace("foo bar baz", /a/g, "X");     // "foo bXr bXz"

// 限制替换次数
replace("aaaaa", "a", "x", 3);         // "xxxaa"

// 使用回调函数
replace("foo bar", /(\w+) (\w+)/, function(m, w1, w2) {
    return w2 + " " + w1;
});  // "bar foo"

// 特殊替换字符串
replace("abc", /b/, "[$&]");           // "a[b]c" ($& = 匹配内容)
replace("abc", /b/, "[$`]");           // "a[a]c" ($` = 匹配前内容)
replace("abc", /b/, "[$']");           // "a[c]c" ($' = 匹配后内容)
```

### 12.3 match() 详解

```javascript
// 简单匹配
let m = match("hello world", /(\w+) (\w+)/);
// m = ["hello world", "hello", "world"]

// 无匹配返回 null
let m2 = match("hello", /xyz/);
// m2 = null
```

### 12.4 sprintf() 格式说明

```javascript
sprintf("Hello %s", "world");           // "Hello world"
sprintf("Number: %d", 42);              // "Number: 42"
sprintf("Hex: %x", 255);                // "Hex: ff"
sprintf("JSON: %J", {a:1});             // 'JSON: {"a":1}'
sprintf("String: %q", "a\nb");         // 'String: "a\nb"' (带引号转义)
```

---

## 13. 数组操作函数

### 13.1 数组特性

ucode 的数组是**真正的连续内存数组**：

- **连续存储**：所有元素在内存中连续排列
- **快速随机访问**：`arr[i]` 是 O(1) 操作
- **负索引支持**：`arr[-1]` 访问最后一个元素
- **动态扩容**：超出容量时以 1.5 倍增长重新分配
- **⚠️ 稀疏数组惩罚**：`arr[1000000] = 1` 会分配约 8MB 内存

### 13.2 数组函数参考

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `length(arr)` | 数组 | int | 元素个数（含空槽） |
| `push(arr, ...vals)` | 数组, 值... | 最后推入的值 | 尾部添加 |
| `pop(arr)` | 数组 | 值/null | 尾部移除 |
| `unshift(arr, ...vals)` | 数组, 值... | 最后添加的值 | 头部添加 |
| `shift(arr)` | 数组 | 值/null | 头部移除 |
| `index(arr, val)` | 数组, 值 | int | 首次出现索引，-1 表示未找到 |
| `rindex(arr, val)` | 数组, 值 | int | 最后出现索引 |
| `map(arr, fn)` | 数组, 函数 | 数组 | 映射转换 |
| `filter(arr, fn)` | 数组, 函数 | 数组 | 过滤 |
| `sort(arr, fn?)` | 数组, 比较函数? | 数组 | 原地排序 |
| `reverse(arr)` | 数组 | 数组 | 原地反转 |
| `uniq(arr)` | 数组 | 数组 | 去重（原地） |
| `slice(arr, start, end?)` | 数组, 开始, 结束 | 数组 | 浅拷贝切片 |
| `join(sep, arr)` | 分隔符, 数组 | 字符串 | 连接为字符串 |
| `splice(arr, start, deleteCount, ...items)` | 数组, 开始, 删除数, 插入项... | 数组 | 删除/插入元素 |

### 13.3 map() 使用详解

```javascript
// 基本用法
let doubled = map([1, 2, 3], function(x) {
    return x * 2;
});
// doubled = [2, 4, 6]

// 箭头函数
let squared = map([1, 2, 3], x => x * x);

// ⚠️ 陷阱：直接传入内置函数
// map() 传递 3 个参数给回调：(value, index, array)
// int("10", 0, array) -> base 0 被解释为自动检测
let nums = map(["10", "32", "13"], int);
// 结果不可预期！

// ✅ 正确做法：使用箭头函数包装
let nums = map(["10", "32", "13"], x => int(x));
// nums = [10, 32, 13]

// 使用索引参数
let indexed = map(["a", "b", "c"], function(val, idx) {
    return idx + ": " + val;
});
// indexed = ["0: a", "1: b", "2: c"]
```

### 13.4 filter() 使用详解

```javascript
// 过滤非空字符串
let nonEmpty = filter(["foo", "", "bar", "", "baz"], length);
// nonEmpty = ["foo", "bar", "baz"]

// 过滤数字类型
let numbers = filter(["foo", 1, true, null, 2.2], function(v) {
    return (type(v) == "int" || type(v) == "double");
});
// numbers = [1, 2.2]

// 过滤大于 10 的数
let big = filter([5, 12, 3, 20, 8], x => x > 10);
// big = [12, 20]
```

### 13.5 sort() 使用详解

```javascript
// 默认排序（按字符串比较）
let arr = [3, 1, 4, 1, 5];
sort(arr);
// arr = [1, 1, 3, 4, 5]

// 自定义比较函数
let items = [{name: "foo", score: 30}, {name: "bar", score: 10}];
sort(items, function(a, b) {
    return a.score - b.score;
});
// 按 score 升序排列

// 降序
sort(items, function(a, b) {
    return b.score - a.score;
});
```

### 13.6 splice() 使用详解

```javascript
let arr = ["a", "b", "c", "d", "e"];

// 删除元素
let removed = splice(arr, 1, 2);
// arr = ["a", "d", "e"]
// removed = ["b", "c"]

// 插入元素
splice(arr, 1, 0, "X", "Y");
// arr = ["a", "X", "Y", "d", "e"]

// 替换元素
splice(arr, 1, 2, "Z");
// arr = ["a", "Z", "e"]
```

---

## 14. 对象操作函数

### 14.1 对象特性

ucode 的对象是**有序哈希表**：

- **有序**：保持插入顺序
- **字符串键**：键只能是字符串，非字符串会被强制转换
- **引用语义**：赋值是引用传递
- **⚠️ 空字节截断**：键中包含 `\0` 会被静默截断

```javascript
let obj = {"foo\0bar": 123};
print(obj.foo);             // 123 (\0 后的部分被截断)
print(exists(obj, "foo\0bar"));  // false (!)
```

### 14.2 对象函数参考

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `length(obj)` | 对象 | int | 键的数量 |
| `keys(obj)` | 对象 | 数组 | 键名数组 |
| `values(obj)` | 对象 | 数组 | 值数组 |
| `exists(obj, key)` | 对象, 键 | bool | 检查键是否存在 |
| `sort(obj, fn?)` | 对象, 比较函数? | 对象 | 按键排序 |
| `delete obj.key` | 对象.键 | bool | 删除属性 |
| `proto(val, proto?)` | 值, 原型? | 对象/null | 获取/设置原型 |

### 14.3 对象操作示例

```javascript
let config = { debug: true, port: 8080, host: "localhost" };

// 遍历键值
for (let key in config) {
    print(key, " = ", config[key], "\n");
}

// 获取所有键
let k = keys(config);       // ["debug", "port", "host"]

// 获取所有值
let v = values(config);     // [true, 8080, "localhost"]

// 检查存在
if (exists(config, "port")) {
    print("Port is set\n");
}

// 删除属性
let deleted = delete config.debug;
// deleted = true, config = { port: 8080, host: "localhost" }

// 合并对象（展开运算符）
let defaults = { theme: "light", fontSize: 12 };
let user = { theme: "dark" };
let merged = {...defaults, ...user};
// merged = { theme: "dark", fontSize: 12 }
```

### 14.4 原型系统

```javascript
// 设置原型
let base = { greet: function() { return "Hello"; } };
let obj = { name: "Alice" };
proto(obj, base);

// 现在 obj 可以访问 base 的方法
print(obj.greet());  // "Hello"

// 创建空原型对象（沙箱）
let sandbox = proto({}, {});
// sandbox 没有继承任何全局属性
```

---

## 15. 数学与工具函数

### 15.1 核心工具函数

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `print(...vals)` | 任意... | int | 输出到 stdout，返回字节数 |
| `printf(fmt, ...)` | 格式, 参数... | int | 格式化输出 |
| `time()` | | int | 返回 Unix 时间戳（秒） |
| `sleep(ms)` | 毫秒 | bool | 休眠 |
| `rand()` | | int | 随机整数 (0..RAND_MAX) |
| `rand(max)` | 最大值 | int | 随机整数 (0..max) |
| `rand(min, max)` | 最小, 最大 | int | 随机整数 (min..max) |
| `srand(seed)` | 种子 | | 设置随机种子 |
| `gc(op?, arg?)` | 操作, 参数 | 任意 | GC 控制 |
| `assert(cond, msg?)` | 条件, 消息 | | 断言，失败抛出异常 |
| `die(msg)` | 消息 | | 终止程序并输出消息 |
| `exit(code)` | 退出码 | | 退出程序 |
| `call(fn, ctx?, scope?, ...args)` | 函数, 上下文, 作用域, 参数... | 任意 | 指定上下文调用 |
| `render(path/fn, scope/args...)` | 模板/函数, 作用域/参数... | 字符串 | 渲染并捕获输出 |
| `include(path, scope?)` | 路径, 作用域 | | 加载并执行外部文件 |
| `getenv(name?)` | 变量名? | 字符串/对象 | 获取环境变量 |

### 15.2 IP 地址函数

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `iptoarr(ip)` | IP 字符串 | 数组 | IP 转字节数组 |
| `arrtoip(arr)` | 字节数组 | 字符串 | 字节数组转 IP |

```javascript
iptoarr("192.168.1.1");    // [192, 168, 1, 1]
iptoarr("::1");            // IPv6 字节数组
arrtoip([192, 168, 1, 1]); // "192.168.1.1"
```

### 15.3 include() 与沙箱

```javascript
// 基本包含
include("./lib/utils.uc");

// 带作用域扩展
include("./config.uc", {
    DEBUG: true,
    VERSION: "1.0"
});

// 沙箱执行（限制访问）
include("./untrusted.uc", proto({
    print: print,
    json: json
}, {}));
// untrusted.uc 只能访问 print 和 json
```

---

## 16. 模块系统与 import

### 16.1 import 语法

ucode 支持三种导入方式：

```javascript
// 1. 命名导入（推荐）
import { readfile, writefile, open } from 'fs';
import { cursor } from 'uci';

// 2. 命名空间导入
import * as fs from 'fs';
import * as uci from 'uci';

// 3. 命令行预加载
// ucode -lfs -luci script.uc
```

### 16.2 模块搜索路径

```bash
# 默认搜索路径（按优先级）：
# 1. 当前目录
# 2. /usr/lib/ucode/
# 3. /usr/local/lib/ucode/

# 添加自定义路径
ucode -L "/opt/mylibs" script.uc

# 路径模式（自动追加 /*.so 和 /*.uc）
ucode -L "/opt/mylibs/*.uc" script.uc
```

### 16.3 可用模块列表

| 模块 | 说明 | 命令行加载 |
|------|------|-----------|
| `fs` | 文件系统访问 | `-lfs` |
| `ubus` | OpenWrt IPC 总线 | `-lubus` |
| `uci` | OpenWrt 配置接口 | `-luci` |
| `uloop` | 事件循环 | `-luloop` |
| `socket` | 网络套接字 | `-lsocket` |
| `math` | 数学函数 | `-lmath` |
| `digest` | 哈希算法 | `-ldigest` |
| `debug` | 调试工具 | `-ldebug` |
| `log` | 日志系统 | `-llog` |
| `struct` | 二进制结构 | `-lstruct` |
| `nl80211` | WiFi  netlink | `-lnl80211` |
| `rtnl` | 路由 netlink | `-lrtnl` |

---

# 第三部分：fs 模块完全参考

---

## 17. fs 模块概述与导入

### 17.1 模块说明

`fs` 模块提供完整的 POSIX 文件系统访问能力，包括：
- 文件读写（文本/二进制）
- 目录遍历与管理
- 文件元数据查询（stat/lstat）
- 权限与所有权管理
- 符号链接操作
- 进程管道（pipe/popen）
- 临时文件系统
- 文件锁
- ioctl 操作

### 17.2 导入方式

```javascript
// 方式 1：命名导入（推荐，按需导入）
import { readfile, writefile, open, stat, mkdir, unlink } from 'fs';

// 方式 2：命名空间导入（访问所有功能）
import * as fs from 'fs';
fs.readfile('/etc/hostname');
fs.mkdir('/tmp/mydir');

// 方式 3：命令行预加载
// ucode -lfs script.uc
// 或
// ucode -l "myfs=fs" script.uc
```

### 17.3 模块架构

```
fs 模块
├── 路径操作
│   ├── basename(path)
│   ├── dirname(path)
│   ├── realpath(path)
│   └── readlink(path)
├── 访问检查
│   └── access(path, mode?)
├── 便捷文件读写
│   ├── readfile(path, limit?)
│   └── writefile(path, data, limit?)
├── 目录操作
│   ├── mkdir(path)
│   ├── rmdir(path)
│   ├── lsdir(path)
│   ├── chdir(path)
│   ├── getcwd()
│   └── opendir(path) -> fs.dir
├── 文件元数据
│   ├── stat(path) -> FileStatResult
│   ├── lstat(path) -> FileStatResult
│   └── statvfs(path) -> StatVFSResult
├── 权限管理
│   ├── chmod(path, mode)
│   └── chown(path, uid?, gid?)
├── 文件操作
│   ├── open(path, mode?, perm?) -> fs.file
│   ├── fdopen(fd, mode?) -> fs.file
│   ├── rename(old, new)
│   ├── unlink(path)
│   └── symlink(target, path)
├── 文件描述符
│   ├── dup2(oldfd, newfd)
│   └── pipe() -> [fs.file, fs.file]
├── 进程操作
│   └── popen(command, mode?) -> fs.proc
├── 临时文件
│   ├── mkstemp(template?) -> fs.file
│   └── mkdtemp(template?) -> string
├── 模式匹配
│   └── glob(...patterns) -> array
├── 错误查询
│   └── error() -> string|null
└── 类/句柄
    ├── fs.file (文件句柄)
    ├── fs.dir (目录句柄)
    └── fs.proc (进程句柄)
```

| `fmin(x, y)` | 最小值 | `fmin(3, 5)` -> `3` |
| `signbit(x)` | 符号位 | `signbit(-5)` -> `true` |
| `isinf(x)` | 是否无穷 | `isinf(1/0)` -> `true` |
| `isnan(x)` | 是否 NaN | `isnan(0/0)` -> `true` |
| `isfinite(x)` | 是否有限 | `isfinite(42)` -> `true` |
| `frexp(x)` | 分解浮点 | `frexp(10)` -> `{ signif: 0.625, exp: 4 }` |
| `ldexp(x, exp)` | 组合浮点 | `ldexp(0.625, 4)` -> `10` |
| `modf(x)` | 分离整数小数 | `modf(3.14)` -> `{ int: 3, frac: 0.14 }` |

### 35.4 常量

| 常量 | 值 |
|------|-----|
| `PI` | 3.141592653589793 |
| `E` | 2.718281828459045 |
| `LN2` | 0.6931471805599453 |
| `LN10` | 2.302585092994046 |
| `LOG2E` | 1.4426950408889634 |
| `LOG10E` | 0.4342944819032518 |
| `SQRT1_2` | 0.7071067811865476 |
| `SQRT2` | 1.4142135623730951 |
| `MAXDOUBLE` | 1.7976931348623157e+308 |
| `MINDOUBLE` | 2.2250738585072014e-308 |

---

## 36. digest 模块

### 36.1 模块概述

`digest` 模块提供密码学哈希和 HMAC 功能。

### 36.2 导入方式

```javascript
import { md5, sha256, hmac } from 'digest';
import * as digest from 'digest';
```

### 36.3 哈希函数

```javascript
import { md5, sha1, sha256, sha512 } from 'digest';

// MD5
let hash = md5("hello");
print(hash, "\n");  // 5d41402abc4b2a76b9719d911017c592

// SHA-256
let hash256 = sha256("hello");

// SHA-512
let hash512 = sha512("hello");
```

### 36.4 HMAC

```javascript
import { hmac } from 'digest';

// HMAC-SHA256
let sig = hmac("sha256", "secret_key", "message");
```

### 36.5 可用算法

| 算法 | 说明 |
|------|------|
| `md5` | MD5（128位，已不推荐用于安全场景） |
| `sha1` | SHA-1（160位，已不推荐用于安全场景） |
| `sha256` | SHA-256（256位） |
| `sha512` | SHA-512（512位） |
| `sha3-256` | SHA3-256 |
| `sha3-512` | SHA3-512 |
| `blake2b` | BLAKE2b |
| `blake2s` | BLAKE2s |

---

## 37. debug 模块

### 37.1 模块概述

`debug` 模块提供运行时调试和自省功能。

### 37.2 导入方式

```javascript
import { traceback, sourcepos, memdump } from 'debug';
import * as debug from 'debug';
```

### 37.3 函数参考

| 函数 | 说明 |
|------|------|
| `traceback()` | 获取当前调用栈 |
| `sourcepos()` | 获取当前源码位置 |
| `memdump(path?)` | 内存转储（排查内存泄漏） |
| `vmdump()` | VM 状态转储 |

### 37.4 使用示例

```javascript
import * as debug from 'debug';

// 获取调用栈
function deepCall(n) {
    if (n <= 0) {
        print(debug.traceback(), "\n");
        return;
    }
    deepCall(n - 1);
}

deepCall(3);

// 获取当前位置
let pos = debug.sourcepos();
print("Current: ", pos.file, ":", pos.line, "\n");

// 内存转储（排查泄漏）
debug.memdump('/tmp/memory.log');
```

---

# 第六部分：高级主题

---

## 38. 字节码编译

### 38.1 编译为字节码

ucode 可以将脚本编译为字节码，提高加载速度并保护源码：

```bash
# 编译脚本
ucode -c script.uc
# 输出: ./uc.out

# 指定输出文件
ucode -c -o compiled.uc script.uc

# 去除调试信息（更小体积）
ucode -c -s -o compiled.uc script.uc

# 执行编译后的字节码
ucode compiled.uc
```

### 38.2 字节码特性

| 特性 | 说明 |
|------|------|
| 加载速度 | 比源码解析更快 |
| 体积 | 通常比源码小 |
| 安全性 | 不提供源码保护（可反编译） |
| 兼容性 | 不同版本可能不兼容 |

### 38.3 编译选项

| 选项 | 说明 |
|------|------|
| `-c` | 编译模式 |
| `-s` | 去除调试信息 |
| `-o file` | 指定输出文件 |
| `-C` | 禁用编译器优化 |

---

## 39. 异常处理与调试

### 39.1 异常机制

ucode 的异常处理相对简单：

```javascript
// 使用 assert 断言
assert(condition, "Error message");

// 使用 die 终止
die("Fatal error occurred");

// 使用 exit 退出
exit(1);  // 返回退出码 1
```

### 39.2 调试技巧

```bash
# 启用 VM 执行跟踪
ucode -t script.uc

# 启用严格模式
ucode -S script.uc

# 周期性 GC（排查内存问题）
ucode -g 100 script.uc
```

### 39.3 使用 debug 模块

```javascript
import * as debug from 'debug';

// 打印调用栈
function problematic() {
    print(debug.traceback(), "\n");
}

// 内存分析
debug.memdump('/tmp/before.log');
// ... 执行可能泄漏的代码 ...
debug.memdump('/tmp/after.log');
```

---

## 40. C API 嵌入指南

### 40.1 基本概念

ucode 可以嵌入到 C/C++ 程序中作为脚本引擎：

```c
#include <ucode/compiler.h>
#include <ucode/vm.h>
#include <ucode/lib.h>

// 编译脚本
uc_source_t *source = uc_source_new_file("script.uc");
uc_program_t *program = uc_compile(source, NULL);

// 创建 VM
uc_vm_t vm;
uc_vm_init(&vm, NULL);

// 注册自定义模块
uc_vm_registry_set(&vm, "my_module", my_module);

// 执行
uc_value_t *result = uc_vm_execute(&vm, program, NULL);

// 清理
uc_vm_free(&vm);
uc_program_free(program);
uc_source_put(source);
```

### 40.2 创建自定义模块

```c
#include <ucode/module.h>

// 定义模块函数
static uc_value_t *
my_function(uc_vm_t *vm, size_t nargs)
{
    // 获取参数
    uc_value_t *arg = uc_fn_arg(0);

    // 处理...

    // 返回结果
    return ucv_string_new("result");
}

// 模块导出表
static const uc_function_list_t my_module_functions[] = {
    { "my_function", my_function },
};

// 模块初始化
void uc_module_init(uc_vm_t *vm, uc_value_t *scope)
{
    uc_function_list_register(scope, my_module_functions);
}
```

---

## 41. 性能优化建议

### 41.1 数组优化

```javascript
// 避免稀疏数组
let arr = [];
arr[1000000] = 1;  // 分配约 8MB 内存！

// 预分配容量
let arr2 = [];
for (let i = 0; i < 1000; i++) {
    push(arr2, i);  // 每次 push 可能触发重新分配
}

// 更好的做法：如果知道大小，直接赋值
let arr3 = [];
for (let i = 0; i < 1000; i++) {
    arr3[i] = i;  // 直接索引，减少重新分配
}
```

### 41.2 字符串优化

```javascript
// 避免大量字符串拼接
let result = "";
for (let i = 0; i < 10000; i++) {
    result = result + "x";  // 每次创建新字符串，O(n^2)
}

// 更好的做法：使用数组 + join
let parts = [];
for (let i = 0; i < 10000; i++) {
    push(parts, "x");
}
let result = join("", parts);  // O(n)
```

### 41.3 文件操作优化

```javascript
// 避免频繁小写入
let fp = open('/tmp/log.txt', 'a');
for (let i = 0; i < 10000; i++) {
    fp.write("line " + i + "\n");  // 每次系统调用
}
fp.close();

// 更好的做法：批量写入
let buffer = [];
for (let i = 0; i < 10000; i++) {
    push(buffer, "line " + i + "\n");
}
writefile('/tmp/log.txt', join("", buffer));
```

### 41.4 内存优化

```javascript
// 及时释放大对象
function process() {
    let data = readfile('/tmp/huge.bin');
    // 处理...
    data = null;  // 释放引用
    gc();          // 建议触发 GC
}

// 避免循环引用
let obj = {};
// obj.self = obj;  // 避免！会导致内存泄漏
```

### 41.5 GC 优化

```bash
# 命令行启用周期性 GC
ucode -g 1000 script.uc  # 每 1000 条指令 GC 一次

# 脚本中手动控制
gc("start", 500);  # 启动周期性 GC
gc("stop");        # 停止
gc("count");       // 检查对象数量
```

---

## 42. 常见问题与陷阱

### 42.1 类型陷阱

```javascript
// 整数除法 vs 浮点除法
print(10 / 4);      // 2 (整数)
print(10 / 4.0);    // 2.5 (浮点)

// 取模不支持浮点
print(10 % 7.0);    // NaN

// 空数组是 truthy
if ([]) {
    print("This will print!\n");
}
```

### 42.2 数组陷阱

```javascript
// map() 传递 3 个参数给回调
let nums = map(["10", "32"], int);  // 错误！int 接收到 (value, index, array)
let nums = map(["10", "32"], x => int(x));  // 正确

// 负索引
let arr = [1, 2, 3];
print(arr[-1]);     // 3 (最后一个)
print(arr[-2]);     // 2
```

### 42.3 对象陷阱

```javascript
// 空字节截断键
let obj = {"foo\0bar": 123};
print(obj.foo);             // 123
print(exists(obj, "foo\0bar"));  // false

// 对象比较的是引用
print({} == {});            // false
let a = {}; print(a == a);  // true
```

### 42.4 字符串陷阱

```javascript
// length() 返回字节数，不是字符数
print(length("hello"));     // 5
print(length("你好"));      // 6 (UTF-8 编码)

// 字符串拼接 vs 算术
print("10" + 5);            // 15 (算术)
print("10" + "5");          // "105" (拼接)
```

### 42.5 fs 陷阱

```javascript
// readfile() 返回 null 表示失败，不是空字符串
let content = readfile('/nonexistent');
if (content == null) {
    print("File not found\n");
}

// writefile() 会截断文件
writefile('/tmp/data.txt', 'new content');  // 旧内容丢失！

// popen() 字符串 vs 数组
popen('ls -la /tmp', 'r');        // 通过 shell
popen(['ls', '-la', '/tmp'], 'r'); // 直接 exec，更安全
```

### 42.6 模块陷阱

```javascript
// import 必须在脚本顶部
// function test() { import { x } from 'mod'; }  // 错误！

// 命令行预加载
// ucode -lfs script.uc  // 正确
// 在脚本中 import  // 正确
```

### 42.7 模板陷阱

```javascript
// 模板中注意空白控制
// {%- 去除前空白，-%} 去除后空白

// 表达式块自动转义
// {{ "<script>" }}  // 输出: <script> (不转义，注意 XSS)
```

---

## 附录 A：快速参考卡

### A.1 文件操作速查

| 任务 | 函数/方法 |
|------|-----------|
| 读整个文件 | `readfile(path)` |
| 写整个文件 | `writefile(path, data)` |
| 逐行读取 | `open(path).read("line")` |
| 追加内容 | `open(path, "a").write(data)` |
| 复制文件 | 逐块 `read()` + `write()` |
| 删除文件 | `unlink(path)` |
| 移动/重命名 | `rename(old, new)` |
| 创建目录 | `mkdir(path)` |
| 删除目录 | `rmdir(path)` |
| 列出目录 | `lsdir(path)` |
| 检查存在 | `access(path, "f")` |
| 检查可读 | `access(path, "r")` |
| 获取信息 | `stat(path)` |
| 创建临时文件 | `mkstemp()` |
| 创建临时目录 | `mkdtemp()` |
| 执行命令 | `popen(cmd, "r")` |
| 创建管道 | `pipe()` |

### A.2 常用 shebang

```bash
#!/usr/bin/env ucode
#!/usr/bin/env -S ucode -lfs
#!/usr/bin/env -S ucode -T
```

### A.3 模块加载速查

```bash
ucode -lfs -lubus -luci -luloop -lsocket -lmath -ldigest -ldebug script.uc
```

---

> 本手册基于 ucode 官方文档 [ucode.mein.io](https://ucode.mein.io) 整理编写，涵盖语言基础、核心内置函数、fs 模块完全参考、OpenWrt 核心模块、网络与系统模块以及高级主题。
