# ucode `ubus` 模块文档

> 来源：[ucode/lib/ubus.c](https://github.com/jow-/ucode/blob/master/lib/ubus.c)

`ubus` 模块提供了 OpenWrt 进程间通信（IPC）功能，包括访问 ubus 注册的对象和方法、监听 ubus 消息总线上的事件，以及发布/订阅通知。

---

## 目录

- [导入方式](#导入方式)
- [架构概览](#架构概览)
- [通信模式](#通信模式)
- [错误处理](#错误处理)
- [全局函数](#全局函数)
- [ubus.connection 方法](#ubusconnection-方法)
- [ubus.channel 方法](#ubuschannel-方法)
- [ubus.deferred 方法](#ubusdeferred-方法)
- [ubus.object 方法](#ubusobject-方法)
- [ubus.request 方法](#ubusrequest-方法)
- [ubus.notify 方法](#ubusnotify-方法)
- [ubus.listener 方法](#ubuslistener-方法)
- [ubus.subscriber 方法](#ubussubscriber-方法)
- [状态码常量](#状态码常量)
- [数据格式说明](#数据格式说明)

---

## 导入方式

```js
// 命名导入
import { connect, error } from 'ubus';

// 通配符导入
import * as ubus from 'ubus';

// 命令行加载
// ucode -lubus script.uc
```

---

## 架构概览

Ubus 采用**代理（Broker）模式**，包含三个核心组件：

| 组件 | 描述 |
|------|------|
| **ubusd** | 中央消息路由器/代理，管理注册并转发消息 |
| **服务对象** | 注册方法供客户端调用的接口/守护进程 |
| **客户端** | 调用服务对象方法的请求方 |

所有连接都通过 `ubusd` 进行，相比传统客户端-服务器模型显著减少了 IPC 连接数量。

---

## 通信模式

Ubus 提供三种通信方案：

| 模式 | 类型 | 描述 |
|------|------|------|
| **Invoke** | 一对一 | 直接调用特定对象的指定方法 |
| **Subscribe/Notify** | 一对多（按对象分组） | 向某个对象的所有订阅者发送通知 |
| **Event Broadcast** | 一对多（按事件分组） | 向所有匹配事件模式的监听器广播事件 |

### 角色定义

| 角色 | 描述 |
|------|------|
| **Object** | 注册到 `ubusd` 的进程，包括服务和调用方 |
| **Method** | 对象提供的过程，一个对象可提供多个方法 |
| **Data** | 以 JSON 格式传输的请求或响应数据 |
| **Subscriber** | 订阅目标服务的对象，目标发送通知时收到通知 |
| **Event** | 由字符串事件模式标识，对象可注册事件并发送匹配数据 |
| **Event Registrant** | 注册到事件模式的对象，收到匹配消息时接收转发数据 |

---

## 错误处理

所有 ubus 操作在出错时返回 `null`，并将错误信息存入内部状态。可通过 `error()` 函数获取错误描述或状态码。

```js
import { connect, error } from 'ubus';

let conn = connect();
let result = conn.call("nonexistent", "method", {});
if (result == null) {
    print(error());        // 人类可读的错误信息
    print(error(true));    // 数字状态码
}
```

---

## 全局函数

### `error(numeric)`

查询最后一次 ubus 操作的错误信息。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `numeric` | `boolean` | `false` | 为 `true` 时返回数字状态码，否则返回可读消息 |

- **返回**：`?string | ?number` — 错误信息或状态码，无错误返回 `null`

```js
import { connect, error } from 'ubus';

let conn = connect();
conn.call("bad.object", "method", {});
print(error());       // e.g. "Object not found"
print(error(true));   // e.g. 4 (STATUS_NOT_FOUND)
```

---

### `connect(socket, timeout)`

建立到 ubus 总线的连接。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `socket` | `string` | — | ubus socket 路径，省略则使用默认路径 |
| `timeout` | `number` | `30` | 后续操作的超时时间（秒） |

- **返回**：`?ubus.connection` — 连接对象

```js
import { connect } from 'ubus';

// 使用默认 socket
let conn = connect();

// 指定 socket 路径和超时
let conn2 = connect('/var/run/ubus.sock', 60);
```

---

### `open_channel(fd, cb, disconnect_cb, timeout)`

从已有的文件描述符创建 ubus 通道连接。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `fd` | `number \| fs.file \| socket.socket` | — | 文件描述符或带 `fileno()` 方法的资源对象 |
| `cb` | `function` | — | 收到消息时的回调函数 |
| `disconnect_cb` | `function` | — | 通道断开时的回调函数 |
| `timeout` | `number` | `30` | 操作超时时间（秒） |

- **返回**：`?ubus.channel` — 通道连接对象

**注意：** 传入整数 fd 时，ubus 通道获得所有权，断开时自动关闭；传入资源对象时，资源保留 fd 所有权。

```js
import { open_channel } from 'ubus';
import { open } from 'fs';

let fd = open('/tmp/ubus-channel', 'r');
let chan = open_channel(fd, (req, msg) => {
    print("Received:", msg, "\n");
});
```

---

### `guard(handler)`

获取或设置 ubus 异常处理器。

| 参数 | 类型 | 描述 |
|------|------|------|
| `handler` | `function` | 异常处理回调函数 |

- **无参数时返回**：当前注册的异常处理器函数
- **有参数时返回**：`true`（设置成功）

```js
import { guard } from 'ubus';

guard((ex) => {
    print("Ubus exception:", ex, "\n");
});
```

---

## `ubus.connection` 方法

由 `connect()` 返回。

### `list(object_name)`

查询 ubus 总线上注册的对象。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `object_name` | `string` | — | 对象名称模式，提供则返回匹配对象的签名信息 |

- **返回**：`?string[]` — 对象路径列表或对象签名数组

```js
let conn = connect();

// 列出所有对象
let all = conn.list();
for (let obj in all)
    print(obj, "\n");

// 查询特定对象的签名
let sig = conn.list("network.interface");
print(sig, "\n");
```

---

### `call(object, method, data, return, fd, fd_cb)`

同步调用 ubus 对象的方法。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `object` | `string \| number` | — | 对象名称或对象 ID |
| `method` | `string` | — | 方法名 |
| `data` | `Object` | `{}` | 方法参数 |
| `return` | `string \| boolean` | `"single"` | 返回模式：`"single"`、`"multiple"`、`"ignore"` |
| `fd` | `number` | — | 随调用发送的文件描述符 |
| `fd_cb` | `function` | — | 收到文件描述符时的回调 |

**返回模式：**

| 模式 | 描述 |
|------|------|
| `"single"` | 只返回第一个响应 |
| `"multiple"` | 返回所有响应的数组 |
| `"ignore"` | 丢弃响应 |

- **返回**：`*` — 方法响应数据

```js
let conn = connect();

// 基本调用
let result = conn.call("network.interface", "status", { interface: "lan" });
print(result, "\n");

// 使用对象 ID 调用
let result2 = conn.call(123, "status", {});

// 收集多个响应
let results = conn.call("some.object", "method", {}, "multiple");
```

---

### `defer(object, method, data, cb, data_cb, fd, fd_cb)`

异步调用 ubus 对象的方法。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `object` | `string` | — | 对象名称 |
| `method` | `string` | — | 方法名 |
| `data` | `Object` | `{}` | 方法参数 |
| `cb` | `function` | — | 完成回调 `(status, data) => {}` |
| `data_cb` | `function` | — | 中间数据回调 |
| `fd` | `number` | — | 随调用发送的文件描述符 |
| `fd_cb` | `function` | — | 收到文件描述符时的回调 |

- **返回**：`?ubus.deferred` — 延迟请求对象

```js
let conn = connect();

// 异步调用
let req = conn.defer("system", "info", {}, (rc, data) => {
    if (rc == 0)
        print("Info:", data, "\n");
});

// 在已发布对象的方法处理器中使用
const obj = conn.publish("my.service", {
    "proxy": (req, msg) => {
        conn.defer("backend", "query", msg, (rc, data) => {
            req.reply({ result: data });
        });
    }
});
```

---

### `publish(object_name, methods, subscribe_callback)`

在 ubus 总线上发布一个服务对象。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `object_name` | `string` | — | 对象注册名称 |
| `methods` | `Object` | — | 方法定义对象 |
| `subscribe_callback` | `function` | — | 订阅状态变化回调 |

**方法定义格式：**

```js
{
    "method_name": {
        call: (req, msg) => { ... },
        args: { arg1: "string", arg2: 32 }
    }
}
```

**`args` 类型说明：**

| 类型提示 | blobmsg 类型 |
|----------|-------------|
| `true/false` (boolean) | `INT8` |
| `8` | `INT8` |
| `16` | `INT16` |
| `64` | `INT64` |
| 其他整数 | `INT32` |
| `1.0` (double) | `DOUBLE` |
| `[]` (array) | `ARRAY` |
| `{}` (object) | `TABLE` |
| 字符串 | `STRING` |

- **返回**：`?ubus.object` — 发布的对象

```js
let conn = connect();

let obj = conn.publish("my.service", {
    "hello": {
        call: (req, msg) => {
            req.reply({ message: "Hello, " + msg.name });
        },
        args: { name: "string" }
    },
    "status": {
        call: (req, msg) => {
            req.reply({ uptime: 3600, load: 0.5 });
        }
    }
}, () => {
    print("Subscription state changed\n");
});
```

---

### `remove(resource)`

从总线上移除已注册的对象、监听器或订阅者。

| 参数 | 类型 | 描述 |
|------|------|------|
| `resource` | `ubus.object \| ubus.listener \| ubus.subscriber` | 要移除的资源 |

- **返回**：`?boolean`

```js
let obj = conn.publish("temp.service", { ... });
// ... 使用 ...
conn.remove(obj);

let listener = conn.listener("event.*", (type, data) => { ... });
conn.remove(listener);
```

---

### `listener(pattern, cb)`

注册事件监听器，接收匹配指定模式的事件。

| 参数 | 类型 | 描述 |
|------|------|------|
| `pattern` | `string` | 事件类型匹配模式，支持通配符（如 `system.*`、`my.event.?`） |
| `cb` | `function` | 回调函数 `(type, data) => {}` |

- **返回**：`?ubus.listener` — 监听器对象

```js
let conn = connect();

let listener = conn.listener("system.*", (type, data) => {
    print("Event:", type, "Data:", data, "\n");
});

// 之后移除
listener.remove();
```

---

### `subscriber(notify_callback, remove_callback, subscription_patterns)`

注册订阅者，接收来自其他对象的通知。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `notify_callback` | `function` | — | 收到通知时的回调 `(event) => {}` |
| `remove_callback` | `function` | — | 订阅对象被移除时的回调 `(objid) => {}` |
| `subscription_patterns` | `string[]` | — | 自动订阅的 glob 模式数组 |

**通知回调 `event` 对象结构：**

| 属性 | 描述 |
|------|------|
| `type` | 通知类型 |
| `data` | 通知数据 |
| `info` | 请求信息（包含 ACL、对象信息等） |

- **返回**：`?ubus.subscriber` — 订阅者对象

```js
let conn = connect();

let sub = conn.subscriber(
    (event) => {
        print("Notification:", event.type, event.data, "\n");
    },
    (objid) => {
        print("Object removed:", objid, "\n");
    },
    ["network.interface.*"]  // 自动订阅匹配的对象
);

// 手动订阅特定对象
sub.subscribe("some.object");

// 取消订阅
sub.unsubscribe("some.object");

// 完全移除
sub.remove();
```

---

### `event(event_type, event_data)`

广播一个事件到所有匹配的监听器。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `event_type` | `string` | — | 事件类型标识 |
| `event_data` | `Object` | — | 事件数据 |

- **返回**：`?boolean`

```js
let conn = connect();

conn.event("system.boot", { host: "router1", uptime: 3600 });
conn.event("network.change", { interface: "wan", action: "up" });
```

---

### `disconnect()`

断开与 ubus 总线的连接，释放相关资源，中止所有待处理请求。

- **返回**：`boolean`

```js
let conn = connect();
// ... 操作 ...
conn.disconnect();
```

---

## `ubus.channel` 方法

由 `open_channel()` 或 `request.new_channel()` 返回。通道提供两个 ubus 对象之间的双向通信。

### `request(method, data, return, fd, fd_cb)`

在通道上发送同步请求（使用对象 ID 0）。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `method` | `string` | — | 方法名 |
| `data` | `Object` | `{}` | 方法参数 |
| `return` | `string \| boolean` | `"single"` | 返回模式 |
| `fd` | `number` | — | 随请求发送的文件描述符 |
| `fd_cb` | `function` | — | 收到 fd 时的回调 |

- **返回**：`*` — 响应数据

```js
let chan = open_channel(fd, (req, msg) => {
    print("Channel message:", msg, "\n");
});

let result = chan.request("method_name", { arg: "value" });
```

---

### `defer(method, data, cb, data_cb, fd, fd_cb)`

在通道上发送异步请求。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `method` | `string` | — | 方法名 |
| `data` | `Object` | `{}` | 方法参数 |
| `cb` | `function` | — | 完成回调 `(status, data) => {}` |
| `data_cb` | `function` | — | 中间数据回调 |
| `fd` | `number` | — | 随请求发送的文件描述符 |
| `fd_cb` | `function` | — | 收到 fd 时的回调 |

- **返回**：`?ubus.deferred`

```js
let req = chan.defer("method_name", { arg: "value" },
    (status, data) => {
        print("Status:", status, "\n");
    });
```

---

### `disconnect()`

断开通道连接。

- **返回**：`boolean`

---

## `ubus.deferred` 方法

由 `defer()` 返回，表示异步操作的挂起请求。

### `completed()`

检查请求是否已完成。

- **返回**：`boolean` — `true` 表示已完成

```js
let req = conn.defer("system", "info", {}, (rc, data) => { ... });
if (req.completed()) {
    print("Request finished\n");
}
```

---

### `await()`

同步等待请求完成或超时。

- **返回**：`boolean` — `true` 表示请求已完成，`false` 表示已完成无需等待

```js
let req = conn.defer("system", "info", {}, (rc, data) => { ... });
req.await();  // 阻塞直到完成
```

---

### `abort()`

中止尚未完成的请求。

- **返回**：`boolean` — `true` 表示成功中止，`false` 表示已完成

```js
let req = conn.defer("slow.operation", "method", {});
// ... 不再需要结果 ...
if (!req.completed()) {
    req.abort();
}
```

---

## `ubus.object` 方法

由 `publish()` 返回。

### `subscribed()`

检查当前是否有活跃的订阅者。

- **返回**：`boolean`

```js
let obj = conn.publish("my.service", {
    "trigger": (req, msg) => {
        if (obj.subscribed()) {
            obj.notify("update", { data: "value" });
        }
        req.reply({ notified: obj.subscribed() });
    }
});
```

---

### `notify(type, data, data_cb, status_cb, cb, timeout)`

向所有订阅者发送异步通知。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `type` | `string` | — | 通知类型 |
| `data` | `Object` | — | 通知数据 |
| `data_cb` | `function` | — | 每个数据通知的回调 `(type, data) => {}` |
| `status_cb` | `function` | — | 状态更新回调 `(idx, ret) => {}` |
| `cb` | `function` | — | 完成回调 `(idx, ret) => {}` |
| `timeout` | `number` | — | 超时时间（毫秒），指定则同步等待 |

- **无 timeout 时返回**：`?ubus.notify` — 通知请求对象
- **有 timeout 时返回**：`number` — 状态码

```js
let obj = conn.publish("my.service", {
    "trigger": (req, msg) => {
        obj.notify("update", { key: "value" }, (idx, ret) => {
            print("Notification", idx, "status:", ret, "\n");
        });
        req.reply({ sent: true });
    }
});
```

---

### `remove()`

从 ubus 总线注销该对象。

- **返回**：`?boolean`

```js
let obj = conn.publish("temp.service", { ... });
obj.remove();
```

---

## `ubus.request` 方法

在已发布对象的方法处理器中作为第一个参数传入。

### `reply(reply, rcode)`

向调用者发送回复数据。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `reply` | `Object` | — | 回复数据 |
| `rcode` | `number` | `0` | 状态码，负值表示还有更多回复 |

- **返回**：`?boolean`

```js
conn.publish("my.service", {
    "hello": (req, msg) => {
        req.reply({ message: "Hello, " + msg.name });
    },
    "multi": (req, msg) => {
        req.reply({ part: 1 }, -1);  // 还有更多回复
        req.reply({ part: 2 }, 0);   // 最后一条
    }
});
```

---

### `error(rcode)`

以错误状态结束请求，不发送任何回复数据。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `rcode` | `number` | `STATUS_UNKNOWN_ERROR` | 错误状态码 |

- **返回**：`?boolean`

```js
conn.publish("my.service", {
    "process": (req, msg) => {
        if (!msg.input) {
            req.error(STATUS_INVALID_ARGUMENT);
            return;
        }
        req.reply({ result: "ok" });
    }
});
```

---

### `defer()`

标记当前请求为延迟处理，允许异步完成后调用 `reply()`。

- **返回**：`?boolean`

```js
conn.publish("my.service", {
    "async_method": (req, msg) => {
        req.defer();
        // 异步操作...
        // 稍后调用 req.reply({ result: "done" });
    }
});
```

---

### `get_fd()`

获取调用者传递的文件描述符。

- **返回**：`number` — fd 编号，无则返回 `-1`

```js
conn.publish("my.service", {
    "receive_fd": (req, msg) => {
        let fd = req.get_fd();
        print("Received fd:", fd, "\n");
        req.reply({ received: true });
    }
});
```

---

### `set_fd(fd)`

设置要随回复发送给调用者的文件描述符。

| 参数 | 类型 | 描述 |
|------|------|------|
| `fd` | `number` | 文件描述符编号 |

- **返回**：`?boolean`

```js
conn.publish("my.service", {
    "get_fd": (req, msg) => {
        let fd = open_some_file();
        req.set_fd(fd);
        req.reply({ info: "fd sent" });
    }
});
```

---

### `new_channel(cb, disconnect_cb, timeout)`

创建新的 ubus 通道作为对此请求的响应。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `cb` | `function` | — | 收到消息时的回调 |
| `disconnect_cb` | `function` | — | 断开时的回调 |
| `timeout` | `number` | `30` | 超时时间（秒） |

- **返回**：`?ubus.channel`

```js
conn.publish("my.service", {
    "upgrade": (req, msg) => {
        let chan = req.new_channel((req2, msg2) => {
            print("Channel msg:", msg2, "\n");
        });
        req.reply({ channel: "established" });
    }
});
```

---

## `ubus.notify` 方法

由 `object.notify()` 返回。

### `completed()`

检查通知请求是否已完成。

- **返回**：`boolean`

```js
let n = obj.notify("method", { data: "value" });
if (n.completed()) {
    print("Notification sent\n");
}
```

---

### `abort()`

中止尚未完成的通知请求。

- **返回**：`boolean` — `true` 表示成功中止

```js
let n = obj.notify("method", { data: "value" });
if (!n.completed()) {
    n.abort();
}
```

---

## `ubus.listener` 方法

由 `connection.listener()` 返回。

### `remove()`

注销事件监听器。

- **返回**：`?boolean`

```js
let listener = conn.listener("my.event.*", (type, data) => { ... });
listener.remove();
```

---

## `ubus.subscriber` 方法

由 `connection.subscriber()` 返回。

### `subscribe(object_name)`

订阅指定对象的通知。

| 参数 | 类型 | 描述 |
|------|------|------|
| `object_name` | `string` | 对象名称 |

- **返回**：`?boolean`

```js
let sub = conn.subscriber((event) => { ... });
sub.subscribe("network.interface");
```

---

### `unsubscribe(object_name)`

取消对指定对象的订阅。

| 参数 | 类型 | 描述 |
|------|------|------|
| `object_name` | `string` | 对象名称 |

- **返回**：`?boolean`

```js
sub.unsubscribe("network.interface");
```

---

### `remove()`

从总线注销订阅者。

- **返回**：`?boolean`

```js
sub.remove();
```

---

## 状态码常量

| 常量 | 值 | 描述 |
|------|----|------|
| `STATUS_OK` | `0` | 操作成功 |
| `STATUS_INVALID_COMMAND` | `1` | 无效命令 |
| `STATUS_INVALID_ARGUMENT` | `2` | 无效参数 |
| `STATUS_METHOD_NOT_FOUND` | `3` | 方法未找到 |
| `STATUS_NOT_FOUND` | `4` | 对象未找到 |
| `STATUS_NO_DATA` | `5` | 无可用数据 |
| `STATUS_PERMISSION_DENIED` | `6` | 权限被拒绝 |
| `STATUS_TIMEOUT` | `7` | 操作超时 |
| `STATUS_NOT_SUPPORTED` | `8` | 操作不支持 |
| `STATUS_UNKNOWN_ERROR` | `9` | 未知错误 |
| `STATUS_CONNECTION_FAILED` | `10` | 连接失败 |
| `STATUS_NO_MEMORY` | `11` | 内存不足（新版 ubus） |
| `STATUS_PARSE_ERROR` | `12` | 解析错误（新版 ubus） |
| `STATUS_SYSTEM_ERROR` | `13` | 系统错误（新版 ubus） |
| `STATUS_CONTINUE` | `-1` | 虚拟状态码，表示还有更多回复 |
| `SYSTEM_OBJECT_ACL` | — | 系统对象 ACL 标识符 |

```js
import { STATUS_OK, STATUS_NOT_FOUND, STATUS_TIMEOUT } from 'ubus';

let rc = error(true);
if (rc == STATUS_TIMEOUT) {
    print("Operation timed out\n");
}
```

---

## 数据格式说明

### 请求/响应数据转换

Ubus 使用 `blobmsg` 格式在进程间传输数据，ucode 会自动进行 JSON 与 blobmsg 之间的转换。

**ucode → blobmsg 映射：**

| ucode 类型 | blobmsg 类型 |
|-----------|-------------|
| `null` | `UNSPEC` |
| `boolean` | `INT8` (0/1) |
| `integer` (32位范围) | `INT32` |
| `integer` (64位) | `INT64` |
| `double` | `DOUBLE` |
| `string` | `STRING` |
| `array` | `ARRAY` |
| `object` | `TABLE` |

**blobmsg → ucode 映射：**

| blobmsg 类型 | ucode 类型 |
|-------------|-----------|
| `BOOL` | `boolean` |
| `INT16` | `integer` |
| `INT32` | `integer` |
| `INT64` | `integer` |
| `DOUBLE` | `double` |
| `STRING` | `string` |
| `ARRAY` | `array` |
| `TABLE` | `object` |

### 方法处理器中的 `req` 对象

在已发布对象的方法处理器中，`req` 对象（`ubus.request`）的 `info` 属性包含：

```js
{
    acl: {
        user: "root",
        group: "root",
        object: "network.interface"  // 可选
    },
    object: {
        id: 123,
        name: "my.service",
        path: "my.service"
    },
    method: "hello"
}
```

### 订阅者通知事件结构

```js
{
    type: "update",
    data: { ... },
    info: {
        acl: { user: "...", group: "..." },
        object: { id: ..., name: "...", path: "..." }
    }
}
```
