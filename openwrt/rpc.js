'use strict';
'require baseclass';
'require request';

/**
 * ============================================================
 * LuCI.rpc —— OpenWrt ubus JSON-RPC 通信核心模块
 * ============================================================
 *
 * 【模块作用】
 *   本模块是 LuCI Web 界面与 OpenWrt 底层系统之间的通信桥梁。
 *   它封装了 ubus（OpenWrt 统一总线）的 JSON-RPC 协议，让前端
 *   JavaScript 代码可以通过 HTTP 请求调用路由器后端的系统服务。
 *
 * 【调用链路】
 *   浏览器 JS → LuCI.rpc → HTTP POST → /cgi-bin/luci/admin/ubus
 *            → ubus daemon → 后端服务（network、system、firewall 等）
 *
 * 【典型使用场景】
 *   - 读取网络接口状态（luci-rpc / network 对象）
 *   - 执行系统命令（sys 对象）
 *   - 读写 UCI 配置（uci 对象）
 *   - 查询防火墙规则、无线状态等
 *
 * 【快速使用示例】
 *
 *   // 1. 在插件 js 文件顶部引入模块
 *   'require rpc';
 *
 *   // 2. 声明一个 RPC 调用（只声明，不立即执行）
 *   var callNetworkStatus = rpc.declare({
 *       object: 'network.interface',   // ubus 对象名
 *       method: 'status',              // ubus 方法名
 *       params: ['interface'],         // 参数列表
 *       expect: { '': {} }            // 期望返回整个对象，默认值为 {}
 *   });
 *
 *   // 3. 调用并处理结果
 *   callNetworkStatus('lan').then(function(status) {
 *       console.log('LAN IP:', status['ipv4-address']);
 *   });
 */

// ── 模块级私有变量 ──────────────────────────────────────────

/**
 * 全局 RPC 请求序号（自增），用于匹配 JSON-RPC 请求与响应。
 * JSON-RPC 协议要求每个请求带一个唯一 id，响应中会原样返回该 id，
 * 以便在批量请求时区分各个响应属于哪一个请求。
 */
let rpcRequestID = 1;

/**
 * 当前会话 ID（32位十六进制字符串）。
 * 从 LuCI 环境变量 L.env.sessionid 读取，若未登录则使用全零字符串。
 * 每次 RPC 调用都会把此 sessionid 作为第一个参数发送给服务器，
 * 服务器据此判断请求是否经过身份验证。
 *
 * 【注意】会话 ID 在用户登录后由 LuCI 后端分配，过期后需重新登录。
 */
let rpcSessionID = L.env.sessionid ?? '00000000000000000000000000000000';

/**
 * RPC 请求的目标 URL（后端 ubus 代理端点）。
 * 默认指向 /cgi-bin/luci/admin/ubus（由 L.url() 拼接前缀）。
 * 可通过 setBaseURL() 修改，例如在调试时指向自定义端点。
 */
let rpcBaseURL = L.url('admin/ubus');

/**
 * 全局拦截器函数列表。
 * 所有通过 addInterceptor() 注册的函数都存放在此数组中。
 * 每次收到 RPC 响应后，会在正式解析前依次调用这些函数。
 * 最常见用途：检测 session 过期（返回 6=权限拒绝），自动跳转登录页。
 */
const rpcInterceptorFns = [];

// ── 核心类定义 ──────────────────────────────────────────────

/**
 * @class rpc
 * @memberof LuCI
 * @hideconstructor
 * @classdesc
 *
 * LuCI.rpc 类：提供高层次的 ubus JSON-RPC 抽象接口，
 * 用于列举和调用远程 RPC 方法。
 */
return baseclass.extend(/** @lends LuCI.rpc.prototype */ {

    // ════════════════════════════════════════════════════════
    // 私有方法（内部使用，不对外暴露）
    // ════════════════════════════════════════════════════════

    /**
     * 【私有】发起底层 HTTP POST 请求，将 JSON-RPC 消息发送到服务器。
     *
     * @param {Object|Array} req  - 单个或批量 JSON-RPC 请求对象
     * @param {Function}     cb   - 请求完成后的回调（成功或失败均调用）
     * @param {boolean}    nobatch - 若为 true，禁止该请求参与批处理
     *
     * 【URL 拼接说明】
     *   为便于服务器端日志定位，会在 URL 后追加调用路径信息：
     *   例如批量请求 [network.interface/status, system/board] 时，
     *   URL 会变成 /admin/ubus/network.interface.status;system.board
     *   这只是调试标识，不影响实际路由。
     *
     * 【超时】
     *   使用 L.env.rpctimeout（后端配置，单位秒），默认 20 秒。
     *
     * 【credentials】
     *   设为 true 表示跨域请求也携带 Cookie，确保会话认证正常工作。
     */
    call(req, cb, nobatch) {
        let q = '';

        // 批量请求时，构建 URL 后缀（调试用路径标识）
        if (Array.isArray(req)) {
            // 空数组直接返回空结果，不发请求
            if (req.length == 0)
                return Promise.resolve([]);

            // 遍历每条请求，提取 object 名和 method 名拼成路径
            // params 结构为 [sessionID, object, method, args]
            for (let i = 0; i < req.length; i++)
                if (req[i].params)
                    q += '%s%s.%s'.format(
                        q ? ';' : '/',          // 第一个用 /，后续用 ; 分隔
                        req[i].params[1],        // ubus 对象名
                        req[i].params[2]         // ubus 方法名
                    );
        }

        // 发起 POST 请求，body 为 JSON-RPC 消息体
        return request.post(rpcBaseURL + q, req, {
            timeout: (L.env.rpctimeout ?? 20) * 1000,  // 超时毫秒数
            nobatch,      // 是否禁止批处理合并
            credentials: true  // 携带认证 Cookie
        }).then(cb, cb);  // 成功和失败都用同一个 cb 处理（内部再区分）
    },

    /**
     * 【私有】解析 HTTP 响应，触发拦截器，再转交给 handleCallReply。
     *
     * @param {Object} req - 请求上下文对象（含 resolve/reject/expect/filter 等）
     * @param {Response|Error} res - HTTP 响应对象，或网络错误时的 Error 实例
     *
     * 【处理流程】
     *   1. 若 res 是 Error（网络超时等），直接 reject
     *   2. 检查 HTTP 状态码，非 2xx 则抛出 RPCError
     *   3. 解析 JSON 响应体
     *   4. 并行执行所有已注册的拦截器函数
     *   5. 拦截器全部通过后，调用 handleCallReply 做最终处理
     *
     * 【拦截器参数顺序说明】
     *   注意：拦截器的参数顺序与 Request 类的拦截器相反——
     *   这里是 fn(msg, req)，即响应消息在前，请求对象在后。
     *   这是为了与 LuCI Request 类的拦截器接口保持一致的设计决策。
     */
    parseCallReply(req, res) {
        let msg = null;

        // 情况1：网络层错误（如超时、DNS 解析失败）
        if (res instanceof Error)
            return req.reject(res);

        try {
            // 情况2：HTTP 层错误（如 403、500）
            if (!res.ok)
                L.raise('RPCError', 'RPC call to %s/%s failed with HTTP error %d: %s',
                    req.object, req.method, res.status, res.statusText || '?');

            // 解析 JSON 响应体
            msg = res.json();
        }
        catch (e) {
            return req.reject(e);
        }

        // 依次调用所有拦截器（并行执行，全部 resolve 才继续）
        // 任意拦截器 reject 都会导致整个请求失败
        Promise.all(rpcInterceptorFns.map(fn => fn(msg, req)))
            .then(this.handleCallReply.bind(this, req, msg))
            .catch(req.reject);
    },

    /**
     * 【私有】处理已通过拦截器的 RPC 响应，提取最终返回值。
     *
     * @param {Object} req - 请求上下文对象
     * @param {Object} msg - 已解析的 JSON-RPC 响应对象
     *
     * 【处理步骤详解】
     *
     *   步骤1：验证 JSON-RPC 消息格式
     *     - 必须是对象且 jsonrpc 字段等于 '2.0'
     *
     *   步骤2：检查 JSON-RPC 层错误
     *     - msg.error 存在且有 code/message 时视为错误
     *
     *   步骤3：提取 result 值
     *     - list() 调用（无 object/method）：直接取 msg.result
     *     - declare() 调用：result 是 [ubus_code, data] 数组
     *       * ubus_code === 0 表示成功，data 是实际数据
     *       * 若 options.reject=true 且 code !== 0，则 reject
     *
     *   步骤4：应用 expect 过滤
     *     - 从 result 中提取指定 key 的子值
     *     - 类型不匹配时使用 expect 中定义的默认值
     *
     *   步骤5：应用 filter 函数
     *     - 对提取出的值做自定义转换
     */
    handleCallReply(req, msg) {
        const type = Object.prototype.toString;  // 用于精确类型判断
        let ret = null;

        try {
            // 步骤1：验证 JSON-RPC 消息帧格式
            if (!L.isObject(msg) || msg.jsonrpc != '2.0')
                L.raise('RPCError', 'RPC call to %s/%s returned invalid message frame',
                    req.object, req.method);

            // 步骤2：检查 JSON-RPC 协议层错误
            if (L.isObject(msg.error) && msg.error.code && msg.error.message)
                L.raise('RPCError', 'RPC call to %s/%s failed with error %d: %s',
                    req.object, req.method, msg.error.code, msg.error.message || '?');
        }
        catch (e) {
            return req.reject(e);
        }

        // 步骤3：提取实际数据
        if (!req.object && !req.method) {
            // list() 调用：result 直接就是数据
            ret = msg.result;
        }
        else if (Array.isArray(msg.result)) {
            // declare() 调用：result = [ubus状态码, 实际数据]
            // 如果设置了 reject:true 且 ubus 返回非0状态码，则当作错误处理
            if (req.raise && msg.result[0] !== 0)
                L.raise('RPCError', 'RPC call to %s/%s failed with ubus code %d: %s',
                    req.object, req.method, msg.result[0], this.getStatusText(msg.result[0]));

            // result 长度 > 1 时取索引1（实际数据），否则取索引0（仅状态码）
            ret = (msg.result.length > 1) ? msg.result[1] : msg.result[0];
        }

        // 步骤4：应用 expect 选项，提取子字段并做类型校验
        if (req.expect) {
            for (const key in req.expect) {
                // key 非空时，从 ret 中取对应子字段
                if (ret != null && key != '')
                    ret = ret[key];

                // 若取出的值为 null 或类型不符，使用 expect 中定义的默认值
                if (ret == null || type.call(ret) != type.call(req.expect[key]))
                    ret = req.expect[key];

                break;  // expect 只处理第一个 key
            }
        }

        // 步骤5：应用自定义 filter 函数做数据转换
        if (typeof(req.filter) == 'function') {
            req.priv[0] = ret;         // priv[0] = 当前返回值
            req.priv[1] = req.params;  // priv[1] = 请求参数
            // filter(data, args, ...extraArgs)
            ret = req.filter.apply(this, req.priv);
        }

        // 最终 resolve，将处理后的值返回给调用方
        req.resolve(ret);
    },

    // ════════════════════════════════════════════════════════
    // 公开 API 方法
    // ════════════════════════════════════════════════════════

    /**
     * 列举可用的远程 ubus 对象或指定对象的方法签名。
     *
     * 【两种调用形式】
     *   - list()                    → 返回所有 ubus 对象名称的数组
     *   - list('obj1', 'obj2', ...) → 返回指定对象的方法签名描述
     *
     * @param {...string} [objectNames] - 可选，要查询方法签名的对象名称
     * @returns {Promise}
     *   - 无参数时：Promise<string[]>  所有对象名数组
     *   - 有参数时：Promise<Object>    各对象的方法签名 { 对象名: { 方法名: { 参数名: 类型 } } }
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景1：调试时查看所有可用 ubus 对象】
     *
     *   rpc.list().then(function(objects) {
     *       console.log('全部 ubus 对象:', objects);
     *       // 输出示例: ["network.interface", "system", "uci", "iwinfo", ...]
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景2：查看特定对象的方法及参数】
     *
     *   rpc.list('network.interface').then(function(signatures) {
     *       console.log('network.interface 的方法:', signatures);
     *       // 输出示例:
     *       // {
     *       //   "network.interface": {
     *       //     "status": { "interface": "String" },
     *       //     "dump":   {}
     *       //   }
     *       // }
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景3：同时查询多个对象】
     *
     *   rpc.list('system', 'uci').then(function(sigs) {
     *       console.log('system 方法:', Object.keys(sigs['system']));
     *       console.log('uci 方法:', Object.keys(sigs['uci']));
     *   });
     */
    list(...args) {
        // 构建 JSON-RPC list 请求消息
        const msg = {
            jsonrpc: '2.0',
            id:      rpcRequestID++,   // 自增请求 ID
            method:  'list',           // JSON-RPC 方法固定为 'list'
            params:  args.length ? args : undefined  // 无参数时不传 params
        };

        return new Promise(L.bind(function(resolve, reject) {
            // 请求上下文（无 object/method，handleCallReply 会直接取 msg.result）
            const req = { resolve, reject };

            // 发起 RPC 调用
            this.call(msg, this.parseCallReply.bind(this, req));
        }, this));
    },

    // ════════════════════════════════════════════════════════
    // JSDoc 类型与回调定义（供 declare() 使用）
    // ════════════════════════════════════════════════════════

    /**
     * @typedef {Object} DeclareOptions
     * @memberof LuCI.rpc
     *
     * declare() 方法的配置选项对象，描述一次 RPC 调用的全部细节。
     *
     * @property {string} object
     *   远程 ubus 对象的名称。
     *   示例: 'network.interface'、'system'、'uci'、'iwinfo'
     *
     * @property {string} method
     *   远程 ubus 方法的名称。
     *   示例: 'status'、'board'、'get'、'set'
     *
     * @property {string[]} [params]
     *   定义远程方法期望的有名参数列表（按顺序）。
     *   调用生成函数时传入的位置参数会按此顺序映射为命名参数。
     *   超出 params 数量的额外参数不会发送到服务器，
     *   但会作为私有参数传递给 filter 函数。
     *
     *   示例:
     *     params: ['interface']
     *     调用 fn('lan') → 发送 { interface: 'lan' }
     *
     *     params: ['key', 'value']
     *     调用 fn('hostname', 'OpenWrt') → 发送 { key: 'hostname', value: 'OpenWrt' }
     *
     * @property {Object<string,*>} [expect]
     *   描述期望的返回数据结构，用于从响应中提取子字段并做类型校验。
     *   只能有一个 key，key 对应要提取的字段名，value 是该字段的默认值
     *   （同时也指定了期望类型）。
     *
     *   特殊情况：key 为 '' 时表示取整个返回对象。
     *
     *   示例:
     *     expect: { '': {} }        → 返回整个响应对象，失败时默认 {}
     *     expect: { results: [] }   → 取 response.results，失败时默认 []
     *     expect: { success: false } → 取 response.success，失败时默认 false
     *
     * @property {LuCI.rpc~filterFn} [filter]
     *   可选的数据转换函数，在 expect 处理之后调用，用于对返回值做自定义处理。
     *
     * @property {boolean} [reject=false]
     *   若为 true，ubus 返回非0状态码时 Promise 会 reject（抛出错误）。
     *   默认为 false，非0状态码会作为普通值 resolve 返回。
     *
     * @property {boolean} [nobatch=false]
     *   若为 true，此请求不会被合并到批量请求中单独发送。
     */

    /**
     * @callback LuCI.rpc~filterFn
     * 数据转换回调函数，用于在返回给调用方之前对 ubus 响应数据做自定义处理。
     *
     * @param {*}        data      - 经过 expect 处理后的响应数据（或 ubus 错误码）
     * @param {Array<*>} args      - 调用 RPC 方法时传入的参数数组
     * @param {...*}     extraArgs - 超出 params 定义数量的额外参数
     * @return {*} 转换后的值，直接返回给调用方
     *
     * 【使用场景：将服务器返回的原始数据转换为更易用的格式】
     *
     *   var callGetAddresses = rpc.declare({
     *       object: 'network.interface',
     *       method: 'status',
     *       params: ['interface'],
     *       expect: { '': {} },
     *       filter: function(data, args) {
     *           // 只返回 IPv4 地址列表
     *           return (data['ipv4-address'] || []).map(function(a) {
     *               return a.address + '/' + a.mask;
     *           });
     *       }
     *   });
     *
     *   callGetAddresses('lan').then(function(ips) {
     *       console.log('LAN IPv4 地址:', ips);
     *       // 输出示例: ["192.168.1.1/24"]
     *   });
     */

    /**
     * @callback LuCI.rpc~invokeFn
     * 由 declare() 生成的调用函数。
     * 每次调用都会向远程 ubus 发起一次 HTTP RPC 请求。
     *
     * @param {...*} params - 按照 declare() 中 params 顺序传入的参数值
     * @return {Promise<*>} 解析为远程调用结果的 Promise
     */

    /**
     * 声明一个远程 RPC 调用，并返回实现该调用的函数。
     *
     * 这是使用 LuCI.rpc 最常用的核心方法。
     * 它不会立即发起请求，而是返回一个可以反复调用的函数。
     *
     * @param {LuCI.rpc.DeclareOptions} options - RPC 调用配置选项
     * @returns {LuCI.rpc~invokeFn} 封装了 RPC 调用逻辑的可执行函数
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景1：查询系统基本信息（无参数）】
     *
     *   'require rpc';
     *
     *   var callSystemBoard = rpc.declare({
     *       object: 'system',
     *       method: 'board',
     *       expect: { '': {} }   // 返回整个对象，默认值 {}
     *   });
     *
     *   // 在 view 的 load() 中调用
     *   return callSystemBoard().then(function(info) {
     *       console.log('设备型号:', info.model);
     *       console.log('固件版本:', info.release.description);
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景2：查询特定网络接口状态（带参数）】
     *
     *   var callIfStatus = rpc.declare({
     *       object: 'network.interface',
     *       method: 'status',
     *       params: ['interface'],
     *       expect: { '': {} }
     *   });
     *
     *   callIfStatus('wan').then(function(s) {
     *       console.log('WAN 是否在线:', s.up);
     *       console.log('WAN IP:', (s['ipv4-address'] || [])[0]?.address);
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景3：读取 UCI 配置】
     *
     *   var callUciGet = rpc.declare({
     *       object: 'uci',
     *       method: 'get',
     *       params: ['config', 'section', 'option'],
     *       expect: { value: '' }   // 取 response.value，默认空字符串
     *   });
     *
     *   callUciGet('system', '@system[0]', 'hostname').then(function(name) {
     *       console.log('主机名:', name);
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景4：使用 filter 对数据做后处理】
     *
     *   var callGetLeases = rpc.declare({
     *       object: 'luci-rpc',
     *       method: 'getDHCPLeases',
     *       expect: { '': {} },
     *       filter: function(data) {
     *           return data.leases || [];
     *       }
     *   });
     *
     *   callGetLeases().then(function(leases) {
     *       leases.forEach(function(l) {
     *           console.log(l.hostname, '->', l.ipaddr);
     *       });
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景5：写操作，错误时希望 reject（reject: true）】
     *
     *   var callUciCommit = rpc.declare({
     *       object: 'uci',
     *       method: 'commit',
     *       params: ['config'],
     *       reject: true   // ubus 非0状态码视为错误
     *   });
     *
     *   callUciCommit('network').then(function() {
     *       console.log('配置已提交');
     *   }).catch(function(err) {
     *       console.error('提交失败:', err.message);
     *   });
     */
    declare(options) {
        // 使用 Function.prototype.bind 绑定 rpc 实例和 options，
        // 返回一个新函数（invokeFn），调用时传入实际参数
        return Function.prototype.bind.call(function(rpc, options, ...args) {
            return new Promise((resolve, reject) => {

                // ── 步骤1：将位置参数映射为命名参数对象 ──
                let p_off = 0;
                const params = { };
                if (Array.isArray(options.params))
                    for (p_off = 0; p_off < options.params.length; p_off++)
                        params[options.params[p_off]] = args[p_off];
                // 例: params=['interface'], args=['lan'] → params = { interface: 'lan' }

                // ── 步骤2：收集超出 params 定义的额外参数（传给 filter）──
                // priv[0] 和 priv[1] 预留给 handleCallReply 填入 ret 和 params
                const priv = [ undefined, undefined ];
                for (; p_off < args.length; p_off++)
                    priv.push(args[p_off]);

                // ── 步骤3：构建请求上下文对象（供 parseCallReply/handleCallReply 使用）──
                const req = {
                    expect:  options.expect,   // 期望的返回结构及默认值
                    filter:  options.filter,   // 自定义数据转换函数
                    resolve,                   // Promise resolve 回调
                    reject,                    // Promise reject 回调
                    params,                    // 已命名的参数对象
                    priv,                      // 额外私有参数（给 filter 用）
                    object:  options.object,   // ubus 对象名（用于错误信息）
                    method:  options.method,   // ubus 方法名（用于错误信息）
                    raise:   options.reject    // 是否对非0 ubus 码抛错
                };

                // ── 步骤4：构建 JSON-RPC 消息体 ──
                const msg = {
                    jsonrpc: '2.0',
                    id:      rpcRequestID++,   // 自增唯一请求 ID
                    method:  'call',           // ubus 代理固定使用 'call'
                    params:  [
                        rpcSessionID,          // [0] 会话 ID（身份认证）
                        options.object,        // [1] ubus 对象名
                        options.method,        // [2] ubus 方法名
                        params                 // [3] 调用参数对象
                    ]
                };

                // ── 步骤5：发起请求 ──
                rpc.call(msg, rpc.parseCallReply.bind(rpc, req), options.nobatch);
            });
        }, this, this, options);
    },

    // ════════════════════════════════════════════════════════
    // Session / URL 管理 API
    // ════════════════════════════════════════════════════════

    /**
     * 获取当前 RPC 会话 ID。
     *
     * @returns {string} 32 字节十六进制会话 ID 字符串
     *
     * 【使用场景】
     *   在自定义 HTTP 请求或与第三方接口通信时，需要附带当前 sessionid
     *   以保持与 LuCI 相同的认证状态。
     *
     *   示例：
     *     var sid = rpc.getSessionID();
     *     fetch('/custom/api?auth=' + sid);
     */
    getSessionID() {
        return rpcSessionID;
    },

    /**
     * 设置 RPC 会话 ID。
     *
     * @param {string} sid - 新的 32 字节十六进制会话 ID
     *
     * 【使用场景】
     *   在 LuCI 登录流程中，用户完成认证后服务器会下发新的 sessionid，
     *   此时需要调用此方法更新本地存储的 ID，使后续请求使用新会话。
     *
     *   示例（登录后更新 session）：
     *     rpc.declare({
     *         object: 'session',
     *         method: 'login',
     *         params: ['username', 'password'],
     *         expect: { ubus_rpc_session: '' }
     *     })('root', 'password').then(function(newSid) {
     *         rpc.setSessionID(newSid);
     *         console.log('已更新会话 ID:', newSid);
     *     });
     */
    setSessionID(sid) {
        rpcSessionID = sid;
    },

    /**
     * 获取当前 RPC 请求的基础 URL。
     *
     * @returns {string} RPC 端点 URL 字符串
     *
     * 【使用场景】
     *   调试时确认当前请求目标地址，或在动态切换请求目标前保存原始地址。
     *
     *   示例：
     *     console.log('当前 RPC 地址:', rpc.getBaseURL());
     *     // 输出示例: '/cgi-bin/luci/admin/ubus'
     */
    getBaseURL() {
        return rpcBaseURL;
    },

    /**
     * 设置 RPC 请求的基础 URL（请求端点）。
     *
     * @param {string} url - 新的 RPC 端点 URL
     *
     * 【使用场景】
     *   - 开发/调试时将请求代理到本地 mock 服务
     *   - 对接多个 OpenWrt 设备时动态切换目标
     *
     *   示例（切换到测试服务器）：
     *     var orig = rpc.getBaseURL();
     *     rpc.setBaseURL('http://192.168.1.1/cgi-bin/luci/admin/ubus');
     *     callSomeApi().finally(function() {
     *         rpc.setBaseURL(orig);  // 调用完毕后恢复
     *     });
     */
    setBaseURL(url) {
        rpcBaseURL = url;
    },

    // ════════════════════════════════════════════════════════
    // 工具方法
    // ════════════════════════════════════════════════════════

    /**
     * 将 ubus 数字状态码转换为人类可读的描述字符串。
     *
     * @param {number} statusCode - ubus 状态码（0~10）
     * @returns {string} 对应的状态描述文本（已通过 _() 做国际化处理）
     *
     * 【ubus 状态码含义对照表】
     *   0  → 命令成功        (UBUS_STATUS_OK)
     *   1  → 无效命令        (UBUS_STATUS_INVALID_COMMAND)
     *   2  → 无效参数        (UBUS_STATUS_INVALID_ARGUMENT)
     *   3  → 方法不存在      (UBUS_STATUS_METHOD_NOT_FOUND)
     *   4  → 资源未找到      (UBUS_STATUS_NOT_FOUND)
     *   5  → 无数据返回      (UBUS_STATUS_NO_DATA)
     *   6  → 权限被拒绝      (UBUS_STATUS_PERMISSION_DENIED)  ← 常见：session 过期
     *   7  → 请求超时        (UBUS_STATUS_TIMEOUT)
     *   8  → 不支持          (UBUS_STATUS_NOT_SUPPORTED)
     *   9  → 未知错误        (UBUS_STATUS_UNKNOWN_ERROR)
     *   10 → 连接断开        (UBUS_STATUS_CONNECTION_FAILED)
     *
     * 【使用场景】
     *   在 RPC 调用错误处理中展示友好的错误信息：
     *
     *   callSomeApi().catch(function(err) {
     *       // err.message 中通常已包含 getStatusText 的输出
     *       ui.addNotification(null,
     *           E('p', '操作失败: ' + err.message),
     *           'danger'
     *       );
     *   });
     *
     *   // 或者直接使用：
     *   console.log(rpc.getStatusText(6));  // 输出: "Permission denied"
     */
    getStatusText(statusCode) {
        switch (statusCode) {
        case 0:  return _('Command OK');           // 成功
        case 1:  return _('Invalid command');      // 无效命令
        case 2:  return _('Invalid argument');     // 参数错误（常见：参数类型或值不合法）
        case 3:  return _('Method not found');     // 方法不存在（检查 object/method 拼写）
        case 4:  return _('Resource not found');   // 资源不存在（如接口名错误）
        case 5:  return _('No data received');     // 无数据返回
        case 6:  return _('Permission denied');    // 权限拒绝（通常意味着 session 已过期）
        case 7:  return _('Request timeout');      // 超时（后端处理超时）
        case 8:  return _('Not supported');        // 功能不受支持
        case 9:  return _('Unspecified error');    // 未知错误
        case 10: return _('Connection lost');      // 连接丢失
        default: return _('Unknown error code');   // 未定义的错误码
        }
    },

    // ════════════════════════════════════════════════════════
    // 拦截器管理 API
    // ════════════════════════════════════════════════════════

    /**
     * @callback LuCI.rpc~interceptorFn
     * 拦截器回调函数，在 RPC 响应标准解析流程之前被调用。
     *
     * 【核心能力】
     *   1. 【检测】可以检查响应内容，在标准解析前判断是否出现特殊情况
     *   2. 【拦截】返回 reject 的 Promise 可以强制让 RPC 调用失败
     *   3. 【修改】可以直接修改 msg 对象（原地修改），
     *             标准解析逻辑会看到修改后的版本
     *
     * @param {*}      msg - 未经标准解析的原始 JSON-RPC 响应（已 JSON.parse）
     * @param {Object} req - 对应的请求上下文（含 filter/expect/params 等）
     * @return {Promise<*>|*}
     *   返回 Promise 时，等待其完成后再继续解析（resolve 值会被忽略）；
     *   返回 rejected Promise 时，整个 RPC 调用随之失败。
     *
     * 【最常见使用场景：自动处理 session 过期，跳转登录页】
     *
     *   rpc.addInterceptor(function(msg, req) {
     *       // ubus 返回 6 = 权限拒绝，通常是 session 已过期
     *       if (L.isObject(msg) &&
     *           Array.isArray(msg.result) &&
     *           msg.result[0] === 6) {
     *           // 弹出提示或直接跳转登录页
     *           return Promise.reject(new Error('会话已过期，请重新登录'));
     *       }
     *   });
     */

    /**
     * 注册一个 RPC 响应拦截器函数。
     *
     * 注册后的拦截器会在每次 RPC 响应到达时、标准解析之前自动调用。
     * 多个拦截器按注册顺序并行执行（Promise.all）。
     *
     * @param {LuCI.rpc~interceptorFn} interceptorFn - 要注册的拦截器函数
     * @returns {LuCI.rpc~interceptorFn} 返回传入的同一个函数（便于后续 remove）
     *
     * 【使用场景1：全局 session 过期检测】
     *
     *   var authInterceptor = rpc.addInterceptor(function(msg) {
     *       if (L.isObject(msg) &&
     *           Array.isArray(msg.result) &&
     *           msg.result[0] === 6) {
     *           // 重定向到登录页
     *           window.location.href = L.url('admin/login');
     *           return Promise.reject(new Error('Session expired'));
     *       }
     *   });
     *
     *   // 需要时取消注册
     *   rpc.removeInterceptor(authInterceptor);
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景2：全局请求日志（开发调试）】
     *
     *   rpc.addInterceptor(function(msg, req) {
     *       console.debug(
     *           '[RPC]', req.object + '/' + req.method,
     *           '→', msg.result
     *       );
     *   });
     *
     * ──────────────────────────────────────────────────────
     * 【使用场景3：响应数据修改（mock / 数据补丁）】
     *
     *   rpc.addInterceptor(function(msg) {
     *       // 强制将所有响应的 result[0] 改为成功
     *       if (Array.isArray(msg.result))
     *           msg.result[0] = 0;  // 原地修改
     *   });
     */
    addInterceptor(interceptorFn) {
        // 只接受函数类型，非函数参数会被静默忽略
        if (typeof(interceptorFn) == 'function')
            rpcInterceptorFns.push(interceptorFn);

        // 返回函数本身，方便调用方保存引用用于 removeInterceptor
        return interceptorFn;
    },

    /**
     * 注销一个已注册的 RPC 响应拦截器函数。
     *
     * 使用严格引用比较（===）来匹配，因此必须传入与注册时完全相同的函数引用。
     *
     * @param {LuCI.rpc~interceptorFn} interceptorFn - 要移除的拦截器函数引用
     * @returns {boolean}
     *   true  → 找到并成功移除
     *   false → 未找到（可能已被移除，或传入了不同的函数引用）
     *
     * 【使用场景：在特定页面或操作完成后取消全局拦截器】
     *
     *   // 注册时保存引用
     *   var myInterceptor = rpc.addInterceptor(function(msg) {
     *       // ... 拦截逻辑
     *   });
     *
     *   // 页面卸载或操作完成后移除
     *   var removed = rpc.removeInterceptor(myInterceptor);
     *   console.log('拦截器已移除:', removed);  // true
     *
     * 【注意事项】
     *   - 匿名函数无法被移除（每次 function(){} 都是新引用）
     *   - 如果同一函数被多次 addInterceptor，removeInterceptor 会一次性全部移除
     */
    removeInterceptor(interceptorFn) {
        const oldlen = rpcInterceptorFns.length;
        let i = oldlen;

        // 从后向前遍历，避免 splice 影响后续索引
        while (i--)
            if (rpcInterceptorFns[i] === interceptorFn)
                rpcInterceptorFns.splice(i, 1);

        // 数组长度减少说明至少移除了一个
        return (rpcInterceptorFns.length < oldlen);
    }
});
