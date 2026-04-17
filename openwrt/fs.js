'use strict';
'require rpc';
'require request';
'require baseclass';

/**
 * @typedef {Object} FileStatEntry
 * @memberof LuCI.fs
 *
 * 文件/目录条目的详细信息对象，由 stat() 和 list() 方法返回。
 *
 * @property {string} name   - 目录条目名称（文件名或目录名）
 * @property {string} type   - 条目类型，取值之一：
 *                             `block`（块设备）、`char`（字符设备）、`directory`（目录）、
 *                             `fifo`（管道）、`symlink`（符号链接）、`file`（普通文件）、
 *                             `socket`（套接字）、`unknown`（未知类型）
 * @property {number} size   - 文件大小（字节数）
 * @property {number} mode   - 文件访问权限（八进制，如 0644）
 * @property {number} atime  - 最后访问时间（Unix 时间戳，秒）
 * @property {number} mtime  - 最后修改时间（Unix 时间戳，秒）
 * @property {number} ctime  - 最后状态变更时间（Unix 时间戳，秒）
 * @property {number} inode  - Inode 编号
 * @property {number} uid    - 文件所有者的用户 ID
 * @property {number} gid    - 文件所有者的组 ID
 */

/**
 * @typedef {Object} FileExecResult
 * @memberof LuCI.fs
 *
 * 命令执行结果对象，由 exec() 和 exec_direct() 方法返回。
 *
 * @property {number} code      - 命令退出码（0 表示成功，非 0 表示出错）
 * @property {string} [stdout]  - 命令的标准输出内容（如有）
 * @property {string} [stderr]  - 命令的标准错误输出内容（如有）
 */

// ─────────────────────────────────────────────────────────────────────────────
// 通过 ubus RPC 声明底层文件操作接口
// 这些函数直接对应 OpenWrt 的 rpcd file 插件所暴露的 ubus 方法。
// ─────────────────────────────────────────────────────────────────────────────

var callFileList, callFileStat, callFileRead, callFileWrite, callFileRemove,
    callFileExec, callFileMD5;

// 列举目录内容（对应 ubus call file list '{"path":"/etc"}' ）
callFileList = rpc.declare({
	object: 'file',
	method: 'list',
	params: [ 'path' ]
});

// 获取单个路径的 stat 信息（对应 ubus call file stat '{"path":"/etc/config"}' ）
callFileStat = rpc.declare({
	object: 'file',
	method: 'stat',
	params: [ 'path' ]
});

// 读取文件内容（对应 ubus call file read '{"path":"/etc/hostname"}' ）
callFileRead = rpc.declare({
	object: 'file',
	method: 'read',
	params: [ 'path' ]
});

// 写入文件内容，支持指定权限（对应 ubus call file write '{"path":...,"data":...}' ）
callFileWrite = rpc.declare({
	object: 'file',
	method: 'write',
	params: [ 'path', 'data', 'mode' ]
});

// 删除文件（对应 ubus call file remove '{"path":...}' ）
callFileRemove = rpc.declare({
	object: 'file',
	method: 'remove',
	params: [ 'path' ]
});

// 执行命令（对应 ubus call file exec '{"command":...}' ）
callFileExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params', 'env' ]
});

// 计算文件 MD5（对应 ubus call file md5 '{"path":...}' ）
callFileMD5 = rpc.declare({
	object: 'file',
	method: 'md5',
	params: [ 'path' ]
});

// ─────────────────────────────────────────────────────────────────────────────
// RPC 错误码到错误名称的映射表
// 索引对应 rpcd 返回的错误码（1~8），0 表示无错误
// ─────────────────────────────────────────────────────────────────────────────
var rpcErrors = [
	null,                   // 0: 无错误
	'InvalidCommandError',  // 1: 无效命令
	'InvalidArgumentError', // 2: 无效参数
	'MethodNotFoundError',  // 3: 方法不存在
	'NotFoundError',        // 4: 文件/路径不存在
	'NoDataError',          // 5: 无数据
	'PermissionError',      // 6: 权限不足
	'TimeoutError',         // 7: 超时
	'UnsupportedError'      // 8: 不支持的操作
];

/**
 * 处理 ubus RPC 回复的内部函数。
 *
 * @param {Object} expect - 期望的返回数据结构（用于类型校验）。
 *                          键为提取字段名，值为该字段的期望类型示例。
 *                          若键为空字符串 ''，则直接对整体返回值做类型检查。
 * @param {*} rc          - RPC 实际返回的原始数据。
 * @returns {*}           - 校验通过后，返回提取出的字段值（或整体返回值）。
 * @throws {Error}        - RPC 返回错误码，或返回数据格式不符合预期时抛出异常。
 */
function handleRpcReply(expect, rc) {
	// 如果 rc 是非 0 的数字，说明 ubus 返回了错误码
	if (typeof(rc) == 'number' && rc != 0) {
		var e = new Error(rpc.getStatusText(rc)); e.name = rpcErrors[rc] || 'Error';
		throw e;
	}

	if (expect) {
		var type = Object.prototype.toString;

		for (var key in expect) {
			// 若 key 非空，则从返回对象中提取该字段；key 为空则对整体做类型检查
			if (rc != null && key != '')
				rc = rc[key];

			// 检查提取出的值是否与期望值类型一致
			if (rc == null || type.call(rc) != type.call(expect[key])) {
				var e = new Error(_('Unexpected reply data format')); e.name = 'TypeError';
				throw e;
			}

			break;
		}
	}

	return rc;
}

/**
 * 处理 cgi-io HTTP 回复的内部函数（用于 read_direct / exec_direct）。
 *
 * @this  {{ type: string }}  - 绑定对象，包含期望的响应类型（'blob'/'json'/'text'）。
 * @param {Response} res      - Fetch API 的 Response 对象。
 * @returns {Promise<*>}      - 根据 this.type 解析并返回响应体。
 * @throws {Error}            - HTTP 状态非 200 时，根据状态码抛出对应命名错误。
 */
function handleCgiIoReply(res) {
	if (!res.ok || res.status != 200) {
		var e = new Error(res.statusText);
		switch (res.status) {
		case 400:
			e.name = 'InvalidArgumentError'; // 请求参数有误
			break;

		case 403:
			e.name = 'PermissionError';      // 权限不足
			break;

		case 404:
			e.name = 'NotFoundError';        // 资源不存在
			break;

		default:
			e.name = 'Error';
		}
		throw e;
	}

	// 根据调用方指定的类型，以不同方式解析响应体
	switch (this.type) {
	case 'blob':
		return res.blob();   // 二进制数据

	case 'json':
		return res.json();   // JSON 数据

	default:
		return res.text();   // 默认：纯文本
	}
}

/**
 * @class fs
 * @memberof LuCI
 * @hideconstructor
 * @classdesc
 *
 * LuCI 文件系统操作模块（LuCI.fs）。
 *
 * 提供对 OpenWrt 路由器文件系统进行读写、执行命令等高层封装，
 * 底层通过 ubus RPC（rpcd file 插件）或 cgi-io CGI 两种传输方式实现。
 *
 * 在视图中引入：`'require fs'`
 * 在外部 JS 中引入：`L.require("fs").then(...)`
 *
 * ─── 使用示例 ────────────────────────────────────────────────────────────────
 *
 * // 1. 列举 /etc/config 目录
 * fs.list('/etc/config').then(function(entries) {
 *     entries.forEach(function(e) {
 *         console.log(e.name, e.type, e.size);
 *     });
 * });
 *
 * // 2. 获取 /etc/hostname 文件信息
 * fs.stat('/etc/hostname').then(function(info) {
 *     console.log('大小:', info.size, '字节');
 *     console.log('权限:', info.mode.toString(8));
 * });
 *
 * // 3. 读取文件内容
 * fs.read('/etc/hostname').then(function(content) {
 *     console.log('主机名:', content);
 * });
 *
 * // 4. 写入文件
 * fs.write('/tmp/test.txt', 'Hello OpenWrt\n').then(function() {
 *     console.log('写入成功');
 * });
 *
 * // 5. 删除文件
 * fs.remove('/tmp/test.txt').then(function() {
 *     console.log('删除成功');
 * });
 *
 * // 6. 执行命令
 * fs.exec('/sbin/ifconfig', ['br-lan']).then(function(result) {
 *     console.log('退出码:', result.code);
 *     console.log('输出:', result.stdout);
 * });
 *
 * // 7. 读取 /proc 或 /sys 单值文件（自动去除首尾空白）
 * fs.trimmed('/proc/sys/kernel/hostname').then(function(name) {
 *     console.log('主机名:', name);
 * });
 *
 * // 8. 按行读取文件
 * fs.lines('/etc/hosts').then(function(lines) {
 *     lines.forEach(function(line) { console.log(line); });
 * });
 *
 * // 9. 绕过 ubus 直接通过 cgi-io 读取大文件（如日志）
 * fs.read_direct('/tmp/system.log', 'text').then(function(text) {
 *     console.log(text);
 * });
 *
 * // 10. 绕过 ubus 直接通过 cgi-io 执行命令并获取大输出
 * fs.exec_direct('/usr/bin/logread', ['-l', '100'], 'text').then(function(out) {
 *     console.log(out);
 * });
 * ─────────────────────────────────────────────────────────────────────────────
 */
var FileSystem = baseclass.extend(/** @lends LuCI.fs.prototype */ {

	/**
	 * 列举指定目录的内容。
	 *
	 * 通过 ubus `file list` 接口获取目录下所有条目的详细信息。
	 *
	 * @param {string} path - 要列举的目录路径，例如 `/etc/config`。
	 *
	 * @returns {Promise<LuCI.fs.FileStatEntry[]>}
	 *   成功时解析为 {@link LuCI.fs.FileStatEntry} 数组；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 列举 /etc/config 目录，打印所有配置文件名
	 * fs.list('/etc/config').then(function(entries) {
	 *     entries.forEach(function(e) {
	 *         console.log(e.name, e.type); // 例如 "network file"
	 *     });
	 * }).catch(function(err) {
	 *     console.error('列举失败:', err.message);
	 * });
	 */
	list: function(path) {
		return callFileList(path).then(handleRpcReply.bind(this, { entries: [] }));
	},

	/**
	 * 获取指定路径的文件/目录状态信息（stat）。
	 *
	 * 通过 ubus `file stat` 接口查询单个路径的元数据，
	 * 包括文件类型、大小、权限、时间戳、inode 等。
	 *
	 * @param {string} path - 要查询的文件或目录路径，例如 `/etc/config/network`。
	 *
	 * @returns {Promise<LuCI.fs.FileStatEntry>}
	 *   成功时解析为单个 {@link LuCI.fs.FileStatEntry} 对象；
	 *   失败时以描述原因的 Error 拒绝（路径不存在时为 NotFoundError）。
	 *
	 * @example
	 * // 检查 /etc/passwd 是否存在，并打印其大小和权限
	 * fs.stat('/etc/passwd').then(function(info) {
	 *     console.log('类型:', info.type);           // "file"
	 *     console.log('大小:', info.size, '字节');
	 *     console.log('权限:', info.mode.toString(8)); // 例如 "644"
	 * }).catch(function(err) {
	 *     if (err.name === 'NotFoundError')
	 *         console.warn('文件不存在');
	 * });
	 */
	stat: function(path) {
		return callFileStat(path).then(handleRpcReply.bind(this, { '': {} }));
	},

	/**
	 * 读取指定文件的全部内容并以字符串形式返回。
	 *
	 * 通过 ubus `file read` 接口读取文本文件。
	 * 注意：此接口不适合读取二进制文件，二进制文件请使用 {@link read_direct}。
	 *
	 * @param {string} path - 要读取的文件路径，例如 `/etc/hostname`。
	 *
	 * @returns {Promise<string>}
	 *   成功时解析为文件内容字符串；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 读取路由器主机名配置文件
	 * fs.read('/etc/hostname').then(function(content) {
	 *     console.log('主机名文件内容:', content);
	 * });
	 *
	 * // 读取 UCI 配置文件
	 * fs.read('/etc/config/system').then(function(config) {
	 *     console.log(config);
	 * });
	 */
	read: function(path) {
		return callFileRead(path).then(handleRpcReply.bind(this, { data: '' }));
	},

	/**
	 * 将数据写入指定文件路径。
	 *
	 * 通过 ubus `file write` 接口写入文件。
	 * 若目标路径不存在，将在权限允许的情况下自动创建。
	 * `data` 会通过 `String(data)` 转换为字符串，若为 `null` 则写入空字符串。
	 *
	 * @param {string} path      - 要写入的文件路径，例如 `/etc/hostname`。
	 * @param {*}      [data]    - 要写入的数据。null 时写入空字符串。
	 * @param {number} [mode]    - 创建新文件时使用的权限（八进制）。默认 420（即 0644）。
	 *
	 * @returns {Promise<number>}
	 *   成功时解析为 `0`；
	 *   失败时以描述原因的 Error 拒绝（权限不足时为 PermissionError）。
	 *
	 * @example
	 * // 写入主机名
	 * fs.write('/etc/hostname', 'my-router\n').then(function() {
	 *     console.log('主机名已更新');
	 * });
	 *
	 * // 写入脚本并设置可执行权限（0755 = 493）
	 * fs.write('/tmp/myscript.sh', '#!/bin/sh\necho hello\n', 493).then(function() {
	 *     console.log('脚本已写入');
	 * });
	 */
	write: function(path, data, mode) {
		data = (data != null) ? String(data) : '';
		mode = (mode != null) ? mode : 420; // 默认权限 0644
		return callFileWrite(path, data, mode).then(handleRpcReply.bind(this, { '': 0 }));
	},

	/**
	 * 删除指定文件（unlink）。
	 *
	 * 通过 ubus `file remove` 接口删除单个文件。
	 * 注意：此接口仅支持删除文件，不支持删除目录。
	 *
	 * @param {string} path - 要删除的文件路径，例如 `/tmp/test.txt`。
	 *
	 * @returns {Promise<number>}
	 *   成功时解析为 `0`；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 删除临时文件
	 * fs.remove('/tmp/test.txt').then(function() {
	 *     console.log('文件已删除');
	 * }).catch(function(err) {
	 *     console.error('删除失败:', err.name, err.message);
	 * });
	 */
	remove: function(path) {
		return callFileRemove(path).then(handleRpcReply.bind(this, { '': 0 }));
	},

	/**
	 * 执行指定命令，可选传入参数和环境变量。
	 *
	 * 通过 ubus `file exec` 接口在路由器上执行命令并获取结果。
	 *
	 * 说明：
	 * - `command` 可以是可执行文件的完整路径，或不含参数的程序名（会在 $PATH 中查找）。
	 * - 参数必须通过 `params` 数组传递，不能直接拼在 `command` 字符串里。
	 * - `env` 中的键值对会在执行前通过 `setenv()` 设置为环境变量。
	 * - 输出大小受 ubus 消息体积限制；大量输出请改用 {@link exec_direct}。
	 *
	 * @param {string}                   command  - 要执行的命令（路径或程序名）。
	 * @param {string[]}                 [params] - 传给命令的参数数组。
	 * @param {Object.<string, string>}  [env]    - 额外设置的环境变量。
	 *
	 * @returns {Promise<LuCI.fs.FileExecResult>}
	 *   成功时解析为包含 `code`、`stdout`、`stderr` 的结果对象；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 执行 ifconfig 查看 br-lan 网桥信息
	 * fs.exec('/sbin/ifconfig', ['br-lan']).then(function(res) {
	 *     console.log('退出码:', res.code);
	 *     console.log('stdout:', res.stdout);
	 *     if (res.stderr) console.warn('stderr:', res.stderr);
	 * });
	 *
	 * // 执行 uci 并设置环境变量
	 * fs.exec('uci', ['get', 'system.@system[0].hostname'], { LANG: 'C' })
	 *     .then(function(res) { console.log('主机名:', res.stdout.trim()); });
	 */
	exec: function(command, params, env) {
		// 参数必须是数组，否则置为 null（ubus 不传该字段）
		if (!Array.isArray(params))
			params = null;

		// 环境变量必须是对象，否则置为 null
		if (!L.isObject(env))
			env = null;

		return callFileExec(command, params, env).then(handleRpcReply.bind(this, { '': {} }));
	},

	/**
	 * 读取文件内容，去除首尾空白后返回。出错时返回空字符串而不抛出异常。
	 *
	 * 此方法保证 Promise 永不 reject，适合读取 `/sys` 或 `/proc`
	 * 下只含单个值的文件（如 `/proc/sys/kernel/hostname`）。
	 *
	 * @param {string} path - 要读取的文件路径。
	 *
	 * @returns {Promise<string>}
	 *   解析为去除首尾空白后的文件内容；读取失败时解析为空字符串 `''`。
	 *
	 * @example
	 * // 读取内核版本（/proc/version 内容含换行，trim 后更干净）
	 * fs.trimmed('/proc/version').then(function(ver) {
	 *     console.log('内核版本:', ver);
	 * });
	 *
	 * // 读取 CPU 温度（失败时不报错，只返回 ''）
	 * fs.trimmed('/sys/class/thermal/thermal_zone0/temp').then(function(val) {
	 *     var temp = val ? (parseInt(val) / 1000).toFixed(1) + '°C' : '未知';
	 *     console.log('CPU 温度:', temp);
	 * });
	 */
	trimmed: function(path) {
		return L.resolveDefault(this.read(path), '').then(function(s) {
			return s.trim();
		});
	},

	/**
	 * 读取文件内容，按行分割并去除每行首尾空白后，以数组形式返回。
	 * 出错时返回空数组而不抛出异常。
	 *
	 * 此方法保证 Promise 永不 reject，适合逐行解析文本文件（如 /etc/hosts）。
	 *
	 * @param {string} path - 要读取的文件路径。
	 *
	 * @returns {Promise<string[]>}
	 *   解析为各行内容的字符串数组（已去除首尾空白）；
	 *   读取失败时解析为空数组 `[]`。
	 *
	 * @example
	 * // 读取 /etc/hosts 并逐行处理
	 * fs.lines('/etc/hosts').then(function(lines) {
	 *     lines.forEach(function(line) {
	 *         if (!line.startsWith('#'))  // 跳过注释行
	 *             console.log(line);
	 *     });
	 * });
	 *
	 * // 统计 /tmp/opkg-lists 目录下某文件的行数
	 * fs.lines('/etc/opkg/customfeeds.conf').then(function(lines) {
	 *     console.log('自定义源数量:', lines.length);
	 * });
	 */
	lines: function(path) {
		return L.resolveDefault(this.read(path), '').then(function(s) {
			var lines = [];

			s = s.trim();

			if (s != '') {
				var l = s.split(/\n/);

				for (var i = 0; i < l.length; i++)
					lines.push(l[i].trim());
			}

			return lines;
		});
	},

	/**
	 * 绕过 ubus，通过 cgi-io 直接读取文件内容。
	 *
	 * 使用 `/cgi-bin/cgi-download` CGI 辅助程序读取文件，
	 * 适用于以下场景：
	 * - 文件内容较大，超过 ubus 消息体积限制（约 64KB）。
	 * - 文件包含二进制数据（使用 `type='blob'`）。
	 * - 需要以 JSON 格式解析文件内容（使用 `type='json'`）。
	 *
	 * cgi-io 会执行与 ubus read 相同的访问权限检查。
	 *
	 * @param {string}             path        - 要读取的文件路径。
	 * @param {"blob"|"text"|"json"} [type="text"]
	 *   期望的文件内容类型：
	 *   - `"text"`：以字符串返回（默认）。
	 *   - `"json"`：将内容解析为 JSON 对象返回。
	 *   - `"blob"`：以 Blob 实例返回（适合二进制文件）。
	 *
	 * @returns {Promise<string|Object|Blob>}
	 *   成功时按 `type` 解析后返回内容；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 读取系统日志（可能超过 ubus 限制）
	 * fs.read_direct('/tmp/system.log', 'text').then(function(log) {
	 *     console.log(log);
	 * });
	 *
	 * // 下载路由器证书为 Blob（用于浏览器端保存）
	 * fs.read_direct('/etc/ssl/certs/ca-cert.pem', 'blob').then(function(blob) {
	 *     var url = URL.createObjectURL(blob);
	 *     // 触发浏览器下载...
	 * });
	 *
	 * // 读取 JSON 格式的配置文件
	 * fs.read_direct('/etc/myapp/config.json', 'json').then(function(cfg) {
	 *     console.log('配置版本:', cfg.version);
	 * });
	 */
	read_direct: function(path, type) {
		// 构造 POST 请求体：会话 ID + 文件路径（均做 URL 编码）
		var postdata = 'sessionid=%s&path=%s'
			.format(encodeURIComponent(L.env.sessionid), encodeURIComponent(path));

		return request.post(L.env.cgi_base + '/cgi-download', postdata, {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			responseType: (type == 'blob') ? 'blob' : 'text'
		}).then(handleCgiIoReply.bind({ type: type }));
	},

	/**
	 * 绕过 ubus，通过 cgi-io 直接执行命令并返回输出。
	 *
	 * 使用 `/cgi-bin/cgi-exec` CGI 辅助程序执行命令，
	 * 适用于以下场景：
	 * - 命令输出量较大，超过 ubus 消息体积限制。
	 * - 命令输出包含二进制数据（使用 `type='blob'`）。
	 * - 命令输出为 JSON 格式（使用 `type='json'`）。
	 *
	 * cgi-io 会执行与 ubus exec 相同的访问权限检查。
	 *
	 * @param {string}               command       - 要执行的命令（完整路径或 $PATH 中的程序名）。
	 * @param {string[]}             [params]      - 传给命令的参数数组。
	 * @param {"blob"|"text"|"json"} [type="text"] - 期望的命令输出类型（同 read_direct）。
	 * @param {boolean}              [latin1=false]
	 *   是否以 Latin1 编码命令行（而非默认的 UTF-8）。
	 *   通常不需要开启，仅当目标程序无法处理 UTF-8 输入时使用。
	 *
	 * @returns {Promise<string|Object|Blob>}
	 *   成功时按 `type` 解析后返回命令的标准输出；
	 *   失败时以描述原因的 Error 拒绝。
	 *
	 * @example
	 * // 获取最近 100 条系统日志（输出可能很大）
	 * fs.exec_direct('/usr/bin/logread', ['-l', '100'], 'text').then(function(log) {
	 *     console.log(log);
	 * });
	 *
	 * // 执行返回 JSON 的自定义脚本
	 * fs.exec_direct('/usr/sbin/myinfo.sh', [], 'json').then(function(data) {
	 *     console.log('设备信息:', data);
	 * });
	 *
	 * // 对不支持 UTF-8 的旧程序使用 Latin1 编码
	 * fs.exec_direct('/bin/legacy-tool', ['参数'], 'text', true).then(function(out) {
	 *     console.log(out);
	 * });
	 */
	exec_direct: function(command, params, type, latin1) {
		// 对命令及每个参数进行转义：反斜杠和空白字符需要转义
		var cmdstr = String(command)
			.replace(/\\/g, '\\\\').replace(/(\s)/g, '\\$1');

		if (Array.isArray(params))
			for (var i = 0; i < params.length; i++)
				cmdstr += ' ' + String(params[i])
					.replace(/\\/g, '\\\\').replace(/(\s)/g, '\\$1');

		// 根据编码选项对命令字符串进行 URL 编码
		if (latin1)
			cmdstr = escape(cmdstr).replace(/\+/g, '%2b'); // Latin1 路径
		else
			cmdstr = encodeURIComponent(cmdstr);            // UTF-8 路径（默认）

		// 构造 POST 请求体
		var postdata = 'sessionid=%s&command=%s'
			.format(encodeURIComponent(L.env.sessionid), cmdstr);

		return request.post(L.env.cgi_base + '/cgi-exec', postdata, {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			responseType: (type == 'blob') ? 'blob' : 'text'
		}).then(handleCgiIoReply.bind({ type: type }));
	}
});

return FileSystem;
