# ucode `fs` 模块文档

> 来源：[ucode/lib/fs.c](https://github.com/jow-/ucode/blob/master/lib/fs.c)

`fs` 模块提供了与文件系统交互的完整功能集，包括文件读写、目录操作、进程管理、路径处理、权限控制等。

---

## 目录

- [导入方式](#导入方式)
- [预定义句柄](#预定义句柄)
- [错误处理](#错误处理)
- [全局函数](#全局函数)
- [fs.file 句柄方法](#fsfile-句柄方法)
- [fs.proc 句柄方法](#fsproc-句柄方法)
- [fs.dir 句柄方法](#fsdir-句柄方法)
- [常量](#常量)
- [数据类型](#数据类型)

---

## 导入方式

```js
// 命名导入
import { readlink, popen, open } from 'fs';

// 通配符导入
import * as fs from 'fs';

// 命令行加载
// ucode -lfs script.uc
```

---

## 预定义句柄

模块预定义了三个标准 I/O 句柄，类型均为 `fs.file`：

| 名称 | 描述 | 文件描述符 |
|------|------|-----------|
| `stdin` | 标准输入 | 0 |
| `stdout` | 标准输出 | 1 |
| `stderr` | 标准错误 | 2 |

```js
import * as fs from 'fs';

fs.stdout.write("Hello, World!\n");
let line = fs.stdin.read("line");
```

---

## 错误处理

所有 `fs` 函数在出错时返回 `null`，并将错误码存入内部注册表 `fs.last_error`。可通过 `error()` 函数获取人类可读的错误描述。

```js
import { unlink, error } from 'fs';

unlink('/path/does/not/exist');
print(error(), "\n");  // "No such file or directory"
```

---

## 全局函数

### `error()`

查询最后一次文件系统操作的错误信息。

- **返回**：`?string` — 错误描述字符串，无错误时返回 `null`

```js
import { unlink, error } from 'fs';

unlink('/nonexistent');
print(error());  // No such file or directory
```

---

### `open(path, mode, perm)`

打开一个文件，返回 `fs.file` 句柄。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 文件路径 |
| `mode` | `string` | `"r"` | 打开模式 |
| `perm` | `number` | `0o666` | 创建权限（仅 `w`/`a` 模式有效） |

**模式字符：**

| 模式 | 描述 |
|------|------|
| `r` | 只读，文件必须存在 |
| `w` | 只写，存在则截断，不存在则创建 |
| `a` | 追加写，不存在则创建 |
| `r+` | 读写，文件必须存在 |
| `w+` | 读写，存在则截断，不存在则创建 |
| `a+` | 读+追加，不存在则创建 |

**附加标志：**

| 标志 | 描述 |
|------|------|
| `x` | 独占创建，文件存在则失败 |
| `e` | 设置 `O_CLOEXEC`，`exec` 时自动关闭 |

```js
import { open } from 'fs';

// 只读打开
let f1 = open('file.txt', 'r');

// 创建新文件（独占）
let f2 = open('new.txt', 'wx');

// 追加模式，指定权限
let f3 = open('log.txt', 'a', 0o644);
```

---

### `fdopen(fd, mode)`

将已有的文件描述符包装为 `fs.file` 句柄。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `fd` | `number` | — | 文件描述符 |
| `mode` | `string` | `"r"` | 打开模式（需与描述符实际模式匹配） |

```js
import { fdopen } from 'fs';

let stdinHandle = fdopen(0, 'r');
let stdoutHandle = fdopen(1, 'w');
```

---

### `dup2(oldfd, newfd)`

复制文件描述符。如果 `newfd` 已打开，会先静默关闭。

| 参数 | 类型 | 描述 |
|------|------|------|
| `oldfd` | `number` | 源文件描述符 |
| `newfd` | `number` | 目标文件描述符 |

- **返回**：`?boolean` — 成功返回 `true`，失败返回 `null`

```js
import { open, dup2 } from 'fs';

let logfile = open('/tmp/error.log', 'w');
dup2(logfile.fileno(), 2);  // 将 stderr 重定向到日志文件
logfile.close();
```

---

### `opendir(path)`

打开一个目录，返回 `fs.dir` 句柄。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 目录路径 |

- **返回**：`?fs.dir` — 目录句柄

```js
import { opendir } from 'fs';

let dir = opendir('/tmp');
let entry;
while ((entry = dir.read()) != null) {
    print(entry, "\n");
}
dir.close();
```

---

### `popen(command, mode)`

启动一个子进程，返回 `fs.proc` 句柄。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `command` | `string \| Array<*>` | — | 命令字符串或参数数组 |
| `mode` | `string` | `"r"` | 打开模式：`"r"`（读 stdout）或 `"w"`（写 stdin），可附加 `"e"` |

- **返回**：`?fs.proc` — 进程句柄

**注意：** 传入数组时通过 `execvp()` 直接执行，不经过 shell；传入字符串时通过 `/bin/sh -c` 执行。

```js
import { popen } from 'fs';

// 通过 shell 执行
let p1 = popen('ls -la /tmp', 'r');
print(p1.read("all"));
p1.close();

// 直接执行（无 shell）
let p2 = popen(['ls', '-la', '/tmp'], 'r');
for (let line = p2.read("line"); length(line); line = p2.read("line"))
    print(line);
let code = p2.close();  // 正常退出码为正数，信号终止为负数
```

---

### `readlink(path)`

读取符号链接的目标路径。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 符号链接路径 |

- **返回**：`?string` — 目标路径

```js
import { readlink } from 'fs';

let target = readlink('/sys/class/net/eth0');
print(target);  // e.g. "../../devices/..."
```

---

### `stat(path)` / `lstat(path)`

获取文件或目录的详细信息。`lstat` 不跟随符号链接。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件或目录路径 |

- **返回**：`?FileStatResult` — 文件信息对象

```js
import { stat, lstat } from 'fs';

let info = stat('/etc/passwd');
print(info.size, "\n");       // 文件大小
print(info.type, "\n");       // "file"
print(info.perm.user_read);    // true

let linkInfo = lstat('/tmp/link');
print(linkInfo.type);          // "link"
```

---

### `statvfs(path)`

查询指定路径所在文件系统的统计信息。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件或目录路径 |

- **返回**：`?StatVFSResult` — 文件系统统计对象

```js
import { statvfs } from 'fs';

let vfs = statvfs('/');
print("Total: ", vfs.totalsize, " bytes\n");
print("Free:  ", vfs.freesize, " bytes\n");
print("Block size: ", vfs.bsize, "\n");
```

---

### `mkdir(path, mode)`

创建目录。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 目录路径 |
| `mode` | `number` | `0o777` | 权限模式 |

- **返回**：`?boolean`

```js
import { mkdir } from 'fs';

mkdir('/tmp/newdir');
mkdir('/tmp/newdir2', 0o755);
```

---

### `rmdir(path)`

删除空目录。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 目录路径 |

- **返回**：`?boolean`

```js
import { rmdir } from 'fs';

rmdir('/tmp/emptydir');
```

---

### `symlink(target, path)`

创建符号链接。

| 参数 | 类型 | 描述 |
|------|------|------|
| `target` | `string` | 链接目标 |
| `path` | `string` | 链接路径 |

- **返回**：`?boolean`

```js
import { symlink } from 'fs';

symlink('/usr/local/bin', '/tmp/binlink');
```

---

### `unlink(path)`

删除文件或符号链接。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件路径 |

- **返回**：`?boolean`

```js
import { unlink } from 'fs';

unlink('/tmp/tempfile.txt');
```

---

### `getcwd()`

获取当前工作目录。

- **返回**：`?string` — 当前目录路径

```js
import { getcwd } from 'fs';

print(getcwd());  // /home/user
```

---

### `chdir(path)`

改变当前工作目录。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string \| fs.file` | 目标目录路径或目录句柄 |

- **返回**：`?boolean`

```js
import { chdir } from 'fs';

chdir('/tmp');
print(getcwd());  // /tmp
```

---

### `chmod(path, mode)`

改变文件权限。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件路径 |
| `mode` | `number` | 权限模式（八进制） |

- **返回**：`?boolean`

```js
import { chmod } from 'fs';

chmod('/tmp/file.txt', 0o644);
chmod('/tmp/script.sh', 0o755);
```

---

### `chown(path, uid, gid)`

改变文件所有者和组。`uid` 和 `gid` 可以是数字或字符串（名称）。传 `null` 或 `-1` 表示不修改。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 文件路径 |
| `uid` | `number \| string \| null` | `-1` | 新所有者 |
| `gid` | `number \| string \| null` | `-1` | 新组 |

- **返回**：`?boolean`

```js
import { chown } from 'fs';

// 通过 UID 修改
chown('/tmp/file.txt', 1000, 1000);

// 通过用户名修改
chown('/var/www', 'www-data', 'www-data');

// 只修改组
chown('/htdocs/', null, 'www-data');
```

---

### `rename(oldPath, newPath)`

重命名或移动文件/目录。

| 参数 | 类型 | 描述 |
|------|------|------|
| `oldPath` | `string` | 原路径 |
| `newPath` | `string` | 新路径 |

- **返回**：`?boolean`

```js
import { rename } from 'fs';

rename('old-name.txt', 'new-name.txt');
rename('/tmp/file.txt', '/home/user/file.txt');
```

---

### `glob(...patterns)`

根据 glob 模式匹配文件路径。

| 参数 | 类型 | 描述 |
|------|------|------|
| `...patterns` | `string` | 一个或多个 glob 模式 |

- **返回**：`string[]` — 匹配的文件路径数组

```js
import { chdir, glob } from 'fs';

chdir('/etc/ssl/certs/');
for (let cert in glob('*.crt', '*.pem')) {
    if (cert != null)
        print(cert, '\n');
}
```

---

### `dirname(path)`

获取路径的目录部分。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件路径 |

- **返回**：`?string`

```js
import { dirname } from 'fs';

print(dirname('/path/to/file.txt'));  // /path/to
print(dirname('file.txt'));           // .
print(dirname('/'));                  // /
```

---

### `basename(path)`

获取路径的文件名部分。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件路径 |

- **返回**：`?string`

```js
import { basename } from 'fs';

print(basename('/path/to/file.txt'));  // file.txt
print(basename('/path/to/dir/'));      // dir
```

---

### `lsdir(path, pattern)`

列出目录内容，返回排序后的文件名数组。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 目录路径 |
| `pattern` | `string \| RegExp \| null` | `null` | 过滤模式 |

- **返回**：`?string[]`

```js
import { lsdir } from 'fs';

// 列出所有文件
let all = lsdir('/tmp');

// 使用 glob 模式过滤
let txts = lsdir('/tmp', '*.txt');

// 使用正则过滤
let nums = lsdir('/tmp', /^[0-9]+/);
```

---

### `mkstemp(template)`

创建唯一的临时文件，打开后立刻删除（unlink），返回 `fs.file` 句柄。关闭句柄后文件自动消失。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `template` | `string` | `"/tmp/XXXXXX"` | 路径模板，必须包含 `XXXXXX` |

- **返回**：`?fs.file`

```js
import { mkstemp } from 'fs';

let tmp = mkstemp('./data-XXXXXX');
tmp.write("sensitive data");
tmp.close();  // 文件自动删除
```

---

### `mkdtemp(template)`

创建唯一的临时目录。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `template` | `string` | `"/tmp/XXXXXX"` | 路径模板，必须包含 `XXXXXX` |

- **返回**：`?string` — 创建的目录路径

```js
import { mkdtemp } from 'fs';

let tmpdir = mkdtemp('./work-XXXXXX');
print(tmpdir);  // e.g. "./work-a3K9zL"
```

---

### `access(path, mode)`

检查文件的可访问性。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 文件路径 |
| `mode` | `string` | `"f"` | 访问模式 |

**模式字符：**

| 模式 | 描述 |
|------|------|
| `r` | 可读 |
| `w` | 可写 |
| `x` | 可执行 |
| `f` | 存在 |

- **返回**：`?boolean` — 可访问返回 `true`，不可访问返回 `false`，出错返回 `null`

```js
import { access } from 'fs';

if (access('/etc/passwd', 'r'))
    print("Readable\n");

if (access('/usr/bin/example', 'x'))
    print("Executable\n");
```

---

### `readfile(path, limit)`

读取整个文件内容。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 文件路径 |
| `limit` | `number` | — | 最大读取字节数 |

- **返回**：`?string`

```js
import { readfile } from 'fs';

// 读取全部
let content = readfile('/etc/hostname');

// 只读前 100 字节
let chunk = readfile('/var/log/syslog', 100);
```

---

### `writefile(path, data, limit)`

写入数据到文件（覆盖模式）。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `path` | `string` | — | 文件路径 |
| `data` | `*` | — | 要写入的数据 |
| `limit` | `number` | — | 最大写入字节数 |

**数据转换规则：**
- `string`：原样写入
- `number`/`double`：十进制表示
- `boolean`：`true`/`false`
- `array`/`object`：JSON 表示
- `null`：空字符串
- `resource`：`<type 0xaddr>` 格式

- **返回**：`?number` — 写入的字节数

```js
import { writefile } from 'fs';

writefile('/tmp/hello.txt', 'Hello, World!');

let obj = { foo: "bar", count: 42 };
writefile('/tmp/data.json', obj);
```

---

### `realpath(path)`

解析路径的绝对路径（解析所有符号链接和 `.`/`..`）。

| 参数 | 类型 | 描述 |
|------|------|------|
| `path` | `string` | 文件路径 |

- **返回**：`?string`

```js
import { realpath } from 'fs';

print(realpath('../config.json'));
print(realpath('/tmp/../etc/hostname'));
```

---

### `pipe()`

创建匿名管道，返回读写两个 `fs.file` 句柄。

- **返回**：`?fs.file[]` — `[readHandle, writeHandle]`

```js
import { pipe } from 'fs';

let p = pipe();
p[1].write("Hello world\n");
print(p[0].read("line"));  // Hello world

p[0].close();
p[1].close();
```

---

## `fs.file` 句柄方法

由 `open()`、`fdopen()`、`mkstemp()`、`pipe()` 返回。

### `read(length)`

从文件读取数据。

| 参数 | 类型 | 描述 |
|------|------|------|
| `length` | `number \| string` | 读取长度或模式 |

**`length` 取值：**

| 值 | 描述 |
|----|------|
| 正整数 | 读取最多指定字节数 |
| `"line"` | 读取一行（包含换行符） |
| `"all"` | 读取到 EOF |
| 单字符字符串 | 读取到该字符或 EOF |

- **返回**：`?string` — 读取的数据，EOF 返回空字符串，错误返回 `null`

```js
let fp = open('data.txt', 'r');

let chunk = fp.read(1024);      // 最多 1024 字节
let line = fp.read("line");     // 一行
let all = fp.read("all");       // 全部内容
let field = fp.read(":");       // 读到冒号

fp.close();
```

---

### `write(data)`

写入数据到文件。

| 参数 | 类型 | 描述 |
|------|------|------|
| `data` | `*` | 要写入的数据 |

- **返回**：`?number` — 写入的字节数

```js
let fp = open('output.txt', 'w');
fp.write("Hello\n");
fp.write(42);        // "42"
fp.write(true);      // "true"
fp.write([1,2,3]);   // "[1,2,3]"
fp.close();
```

---

### `seek(offset, position)`

设置文件读取位置。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `offset` | `number` | `0` | 偏移量（字节） |
| `position` | `number` | `0` | 基准位置 |

**`position` 取值：**

| 值 | 描述 |
|----|------|
| `0` | 从文件开头（默认） |
| `1` | 从当前位置 |
| `2` | 从文件末尾 |

- **返回**：`?boolean`

```js
let fp = open('data.bin', 'r');

fp.read(100);
fp.seek(0, 0);       // 回到开头
fp.seek(10, 1);      // 从当前位置前进 10 字节
fp.seek(-10, 2);     // 定位到 EOF 前 10 字节

fp.close();
```

---

### `tell()`

获取当前读取位置。

- **返回**：`?number` — 当前偏移量（字节）

```js
let fp = open('file.txt', 'r');
fp.read(50);
print(fp.tell());  // 50
fp.close();
```

---

### `close()`

关闭文件句柄，刷新缓冲区并关闭底层描述符。

- **返回**：`?boolean`

```js
let fp = open('file.txt', 'r');
// ... 操作 ...
fp.close();
```

---

### `flush()`

强制将所有缓冲数据写入底层句柄。

- **返回**：`?boolean`

```js
let fp = open('log.txt', 'a');
fp.write("important log");
fp.flush();  // 确保写入磁盘
```

---

### `fileno()`

获取底层文件描述符编号。

- **返回**：`?number`

```js
let fp = open('file.txt', 'r');
print(fp.fileno());  // e.g. 3
fp.close();
```

---

### `error()`

查询该句柄相关的错误信息。

- **返回**：`?string`

```js
let fp = open('/nonexistent', 'r');
if (!fp) {
    print(error());  // 使用全局 error()
}
```

---

### `isatty()`

检查句柄是否指向终端设备。

- **返回**：`?boolean`

```js
if (stdin.isatty()) {
    print("Running in a terminal\n");
}
```

---

### `truncate(offset)`

将文件截断到指定大小。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `offset` | `number` | `0` | 截断后的文件大小（字节） |

- **返回**：`?boolean`

```js
let fp = open('data.txt', 'r+');
fp.truncate(100);  // 截断到 100 字节
fp.close();
```

---

### `lock(op)`

对文件加锁或解锁。

| 参数 | 类型 | 描述 |
|------|------|------|
| `op` | `string` | 锁操作标志 |

**标志字符：**

| 标志 | 描述 |
|------|------|
| `s` | 共享锁（读锁） |
| `x` | 独占锁（写锁） |
| `n` | 非阻塞 |
| `u` | 解锁 |

- **返回**：`?boolean`

```js
let fp = open('data.txt', 'r');
fp.lock("s");   // 共享锁
// ... 读取 ...
fp.lock("u");   // 解锁
fp.close();
```

---

### `ioctl(direction, type, num, value)`

执行 ioctl 系统调用（仅 Linux/macOS）。

| 参数 | 类型 | 描述 |
|------|------|------|
| `direction` | `number` | 数据传输方向（`IOC_DIR_*` 常量） |
| `type` | `number \| null` | ioctl 类型 |
| `num` | `number` | 序列号 |
| `value` | `number \| string` | 传递的值/缓冲区 |

**方向常量：**

| 常量 | 值 | 描述 |
|------|----|------|
| `IOC_DIR_NONE` | — | 无数据传输 |
| `IOC_DIR_READ` | — | 内核写，用户读 |
| `IOC_DIR_WRITE` | — | 用户写，内核读 |
| `IOC_DIR_RW` | — | 双向传输 |

- **返回**：`?number \| ?string`

```js
// Linux 示例：获取终端窗口大小
let fp = open('/dev/tty', 'r');
let TIOCGWINSZ = 0x5413;
let result = fp.ioctl(IOC_DIR_READ, 0x54, 0x13, 8);
// result 为 8 字节字符串，需解析 winsize 结构
```

---

## `fs.proc` 句柄方法

由 `popen()` 返回。

### `read(length)`

从进程 stdout 读取数据。参数同 `fs.file.read()`。

- **返回**：`?string`

```js
let p = popen('echo hello', 'r');
print(p.read("line"));  // hello

p.close();
```

---

### `write(data)`

向进程 stdin 写入数据。参数同 `fs.file.write()`。

- **返回**：`?number`

```js
let p = popen('cat', 'w');
p.write("Hello\n");
p.close();
```

---

### `close()`

关闭进程句柄，等待进程终止并返回退出码。

- **返回**：`?number`
  - 正数：正常退出码
  - 负数：被信号终止（如 `-9` 表示 SIGKILL）

```js
let p = popen('true', 'r');
print(p.close());  // 0

let p2 = popen('false', 'r');
print(p2.close()); // 1
```

---

### `flush()`

刷新进程 stdin 缓冲区。

- **返回**：`?boolean`

---

### `fileno()`

获取进程管道对应的文件描述符。

- **返回**：`?number`

---

### `error()`

查询进程句柄的错误信息。

- **返回**：`?string`

---

## `fs.dir` 句柄方法

由 `opendir()` 返回。

### `read()`

读取下一个目录项。

- **返回**：`?string` — 文件名，无更多项或出错返回 `null`

```js
let dir = opendir('/tmp');
let entry;
while ((entry = dir.read()) != null) {
    print(entry, "\n");
}
dir.close();
```

---

### `tell()`

获取当前目录读取位置。

- **返回**：`?number` — 位置值（实现定义，用于 `seek()`）

```js
let dir = opendir('/tmp');
let start = dir.tell();
print(dir.read(), "\n");   // 第一个条目
dir.seek(start);
print(dir.read(), "\n");   // 再次读取第一个条目
dir.close();
```

---

### `seek(offset)`

设置目录读取位置。

| 参数 | 类型 | 描述 |
|------|------|------|
| `offset` | `number` | `tell()` 返回的位置值 |

- **返回**：`?boolean`

---

### `close()`

关闭目录句柄。

- **返回**：`?boolean`

```js
let dir = opendir('/tmp');
// ... 读取 ...
dir.close();
```

---

### `fileno()`

获取目录的文件描述符。

- **返回**：`?number`

---

### `error()`

查询目录句柄的错误信息。

- **返回**：`?string`

---

## 常量

### 挂载标志（`ST_*`）

用于 `statvfs()` 返回的 `flag` 字段。

| 常量 | 描述 |
|------|------|
| `ST_RDONLY` | 只读文件系统 |
| `ST_NOSUID` | 不允许 setuid/setgid |
| `ST_NODEV` | 不允许设备文件（Linux） |
| `ST_NOEXEC` | 不允许执行二进制文件（Linux） |
| `ST_SYNCHRONOUS` | 同步写入（Linux） |
| `ST_MANDLOCK` | 强制锁（Linux） |
| `ST_NOATIME` | 不更新访问时间（Linux） |
| `ST_NODIRATIME` | 不更新目录访问时间（Linux） |
| `ST_RELATIME` | 相对访问时间（Linux） |
| `ST_NOSYMFOLLOW` | 不跟随符号链接（Linux） |

```js
import { statvfs, ST_RDONLY } from 'fs';

let vfs = statvfs('/');
if (vfs.flag & ST_RDONLY)
    print("Read-only filesystem\n");
```

### ioctl 方向常量（`IOC_DIR_*`）

仅 Linux/macOS 可用。

| 常量 | 描述 |
|------|------|
| `IOC_DIR_NONE` | 无数据传输 |
| `IOC_DIR_READ` | 内核写，用户读 |
| `IOC_DIR_WRITE` | 用户写，内核读 |
| `IOC_DIR_RW` | 双向传输 |

---

## 数据类型

### `FileStatResult`

`stat()` / `lstat()` 返回的对象。

| 属性 | 类型 | 描述 |
|------|------|------|
| `dev` | `Object` | 设备信息 |
| `dev.major` | `number` | 主设备号 |
| `dev.minor` | `number` | 次设备号 |
| `perm` | `Object` | 权限信息 |
| `perm.setuid` | `boolean` | setuid 位 |
| `perm.setgid` | `boolean` | setgid 位 |
| `perm.sticky` | `boolean` | sticky 位 |
| `perm.user_read` | `boolean` | 所有者读 |
| `perm.user_write` | `boolean` | 所有者写 |
| `perm.user_exec` | `boolean` | 所有者执行 |
| `perm.group_read` | `boolean` | 组读 |
| `perm.group_write` | `boolean` | 组写 |
| `perm.group_exec` | `boolean` | 组执行 |
| `perm.other_read` | `boolean` | 其他读 |
| `perm.other_write` | `boolean` | 其他写 |
| `perm.other_exec` | `boolean` | 其他执行 |
| `inode` | `number` | inode 号 |
| `mode` | `number` | 文件模式（不含类型位） |
| `nlink` | `number` | 硬链接数 |
| `uid` | `number` | 所有者 UID |
| `gid` | `number` | 组 GID |
| `size` | `number` | 文件大小（字节） |
| `blksize` | `number` | I/O 块大小 |
| `blocks` | `number` | 分配的 512 字节块数 |
| `atime` | `number` | 最后访问时间戳 |
| `mtime` | `number` | 最后修改时间戳 |
| `ctime` | `number` | 最后状态变更时间戳 |
| `type` | `string` | 文件类型：`"file"`、`"directory"`、`"char"`、`"block"`、`"fifo"`、`"link"`、`"socket"`、`"unknown"` |

### `StatVFSResult`

`statvfs()` 返回的对象。

| 属性 | 类型 | 描述 |
|------|------|------|
| `bsize` | `number` | 文件系统块大小 |
| `frsize` | `number` | 片段大小 |
| `blocks` | `number` | 总块数 |
| `bfree` | `number` | 空闲块数 |
| `bavail` | `number` | 非特权用户可用空闲块 |
| `files` | `number` | 总 inode 数 |
| `ffree` | `number` | 空闲 inode 数 |
| `favail` | `number` | 非特权用户可用 inode |
| `fsid` | `number` | 文件系统 ID |
| `flag` | `number` | 挂载标志（见 `ST_*` 常量） |
| `namemax` | `number` | 最大文件名长度 |
| `freesize` | `number` | 空闲空间（字节），计算为 `frsize * bfree` |
| `totalsize` | `number` | 总空间（字节），计算为 `frsize * blocks` |
| `type` | `number` | Linux 特有：文件系统 magic number（来自 `statfs`） |
