// ubus list | grep luci.nikki
// ubus -v list luci.nikki
// ubus call luci.nikki core_version '{"mode":"smart"}'
// ubus call luci.nikki core_version '{"mode":"alpha"}'
// ubus call luci.nikki core_version '{"mode":"meta"}'
import { cursor } from 'uci';
const uci = cursor();
const uloop   = require("uloop");
const uclient = require("uclient");
function ug(o) { return uci.get('nikki', 'mixin', o); };
function mihomo_request(method, path, body) {
    const api_secret     = ug('api_secret') || '';
    const api_listen     = ug('api_listen');
    const api_tls_listen = ug('api_tls_listen');

    if (!api_listen && !api_tls_listen)
        return null;

    let protocol, listen_addr;
    if (api_listen) {
        protocol = 'http';
        listen_addr = api_listen;
    } else {
        protocol = 'https';
        listen_addr = api_tls_listen;
    }

    const url = sprintf("%s://%s%s", protocol, listen_addr, path);
    let response_body = "";
    let result = null;
    let request_failed = false;
    let uc;

    uloop.init();

    uc = uclient.new(url, null, {
        header_done: function(cb) {},
        // data_read: function(cb) {
        //     let chunk;
        //     while (length(chunk = uc.read(4096)) > 0) {
        //         response_body += chunk;
        //     }
        // },
        data_read: function(cb) {
            let chunk;
            while ((chunk = uc.read(4096)) != null && length(chunk) > 0) {
                response_body += chunk;
            }
        },
        data_eof: function(cb) {
            uloop.end();
            result = (length(response_body) > 0) ? json(response_body) : null;
        },
        error: function(cb, code) {
            request_failed = true;
            uloop.end();
        }
    });

    let headers = {
        "Authorization": sprintf("Bearer %s", api_secret),
        "Content-Type": "application/json"
    };

    let post_data = null;
    if (body) post_data = (type(body) == "string") ? body : sprintf("%.J", body);

    if (!uc.connect()) {
        uloop.end();
        return null;
    }

    if (!uc.request(method, { headers: headers, post_data: post_data })) {
        uloop.end();
        return null;
    }

    uloop.run();
    // if (uc) uc.free();

    return request_failed ? null : result;
}

// ==========================================================================
// 版本与连通性
// ==========================================================================

function get_version() {
    let data = mihomo_request("GET", "/version", null);
    return (data && data.version) ? data.version : null;
}

// ==========================================================================
// 代理与策略组
// ==========================================================================

function get_proxies() {
    let data = mihomo_request("GET", "/proxies", null);
    return (data && data.proxies) ? data.proxies : null;
}

function get_groups() {
    let data = mihomo_request("GET", "/proxies", null);
    if (data && data.proxies) {
        let groups = [];
        let names = keys(data.proxies);
        for (let i = 0; i < length(names); i++) {
            let name = names[i];
            let p = data.proxies[name];
            if (p.type == "Selector" || p.type == "URLTest" || p.type == "Fallback" || p.type == "LoadBalance") {
                push(groups, {
                    name: name,
                    type: p.type,
                    now: p.now || "N/A",
                    all: p.all || []
                });
            }
        }
        return groups;
    }
    return null;
}

function set_proxy(group, node) {
    if (!group || !node) return false;
    mihomo_request("PUT", sprintf("/proxies/%s", group), { name: node });
    return true;
}

function delete_fixed_proxy(proxyGroup) {
    if (!proxyGroup) return false;
    mihomo_request("DELETE", sprintf("/proxies/%s", proxyGroup), null);
    return true;
}

function test_delay(proxy_name, test_url, timeout) {
    let url = test_url || "http://www.gstatic.com/generate_204";
    let to = timeout || 5000;
    let path = sprintf("/proxies/%s/delay?url=%s&timeout=%d", proxy_name, url, to);
    return mihomo_request("GET", path, null);
}

function test_group_delay(group_name, test_url, timeout) {
    let url = test_url || "http://www.gstatic.com/generate_204";
    let to = timeout || 5000;
    let path = sprintf("/group/%s/delay?url=%s&timeout=%d", group_name, url, to);
    return mihomo_request("GET", path, null);
}

// ==========================================================================
// Provider 代理集合
// ==========================================================================

function get_providers() {
    let data = mihomo_request("GET", "/providers/proxies", null);
    return (data && data.providers) ? data.providers : null;
}

function update_provider(name) {
    if (!name) return false;
    mihomo_request("PUT", sprintf("/providers/proxies/%s", name), null);
    return true;
}

function test_provider_delay(provider_name, proxy_name, test_url, timeout) {
    let url = test_url || "http://www.gstatic.com/generate_204";
    let to = timeout || 5000;
    let path = sprintf("/providers/proxies/%s/%s/healthcheck?url=%s&timeout=%d",
        provider_name, proxy_name, url, to);
    return mihomo_request("GET", path, null);
}

function provider_health_check(name) {
    if (!name) return null;
    let path = sprintf("/providers/proxies/%s/healthcheck", name);
    return mihomo_request("GET", path, null);
}

// ==========================================================================
// 规则
// ==========================================================================

function get_rules() {
    let data = mihomo_request("GET", "/rules", null);
    return (data && data.rules) ? data.rules : null;
}

function get_rule_providers() {
    let data = mihomo_request("GET", "/providers/rules", null);
    return (data && data.providers) ? data.providers : null;
}

function update_rule_provider(name) {
    if (!name) return false;
    mihomo_request("PUT", sprintf("/providers/rules/%s", name), null);
    return true;
}

function toggle_rules(rules_map) {
    mihomo_request("PATCH", "/rules/disable", rules_map);
    return true;
}

// ==========================================================================
// 连接
// ==========================================================================

function get_connections() {
    return mihomo_request("GET", "/connections", null);
}

function close_connection(id) {
    if (!id) return false;
    mihomo_request("DELETE", sprintf("/connections/%s", id), null);
    return true;
}

function close_all_connections() {
    mihomo_request("DELETE", "/connections", null);
    return true;
}

// ==========================================================================
// 配置
// ==========================================================================

function get_configs() {
    return mihomo_request("GET", "/configs", null);
}

function patch_config(changes) {
    if (!changes) return false;
    mihomo_request("PATCH", "/configs", changes);
    return true;
}

function reload_configs() {
    mihomo_request("PUT", "/configs?reload=true", { path: "", payload: "" });
    return true;
}

function update_configs(path, payload, force) {
    let query = force ? "?force=true" : "";
    let body = { path: path || "", payload: payload || "" };
    mihomo_request("PUT", sprintf("/configs%s", query), body);
    return true;
}

// ==========================================================================
// DNS 与缓存
// ==========================================================================

function flush_dns() {
    mihomo_request("POST", "/cache/dns/flush", null);
    return true;
}

function flush_fakeip() {
    mihomo_request("POST", "/cache/fakeip/flush", null);
    return true;
}

function query_dns(name, qtype) {
    if (!name) return null;
    let path = sprintf("/dns/query?name=%s&type=%s", name, qtype || "A");
    return mihomo_request("GET", path, null);
}

// ==========================================================================
// 流量与内存
// ==========================================================================

function get_traffic() {
    return mihomo_request("GET", "/traffic", null);
}

function get_memory() {
    return mihomo_request("GET", "/memory", null);
}

// ==========================================================================
// 内核与 UI 升级 / 重启
// ==========================================================================

function upgrade_core(channel) {
    let ch = channel || "auto";
    let path = (ch == "auto") ? "/upgrade" : sprintf("/upgrade?channel=%s", ch);
    mihomo_request("POST", path, null);
    return true;
}

function upgrade_ui() {
    mihomo_request("POST", "/upgrade/ui", null);
    return true;
}

function restart_core() {
    mihomo_request("POST", "/restart", { path: "", payload: "" });
    return true;
}

function update_geo() {
    mihomo_request("POST", "/configs/geo", { path: "", payload: "" });
    return true;
}

// ==========================================================================
// 面板存储 (zashboard 设置同步)
// ==========================================================================

function get_storage() {
    return mihomo_request("GET", "/storage/zashboard", null);
}

function set_storage(value) {
    if (value == null) return false;
    mihomo_request("PUT", "/storage/zashboard", value);
    return true;
}

function delete_storage() {
    mihomo_request("DELETE", "/storage/zashboard", null);
    return true;
}

// ==========================================================================
// Smart / Honk / reFind 附加
// ==========================================================================

function get_smart_weights() {
    let data = mihomo_request("GET", "/group/weights", null);
    return (data && data.weights) ? data.weights : null;
}

function flush_smart_weights() {
    mihomo_request("POST", "/cache/smart/flush", null);
    return true;
}

function get_honk_stats() {
    return mihomo_request("GET", "/stats", null);
}

export function mihomoapi(cmd, a1, a2, a3, a4) {
    switch (cmd) {
        // 基本信息
        case 'version':           return get_version();

        // 代理与策略组
        case 'proxies':           return get_proxies();
        case 'groups':            return get_groups();
        case 'set':               return set_proxy(a1, a2);
        case 'del-proxy':         return delete_fixed_proxy(a1);
        case 'delay':             return test_delay(a1, a2, int(a3 || 5000));
        case 'group-delay':       return test_group_delay(a1, a2, int(a3 || 5000));

        // Provider
        case 'providers':         return get_providers();
        case 'update-provider':   return update_provider(a1);
        case 'provider-delay':    return test_provider_delay(a1, a2, a3, int(a4 || 5000));
        case 'provider-hc':       return provider_health_check(a1);

        // 规则
        case 'rules':             return get_rules();
        case 'rule-providers':    return get_rule_providers();
        case 'update-rule-provider': return update_rule_provider(a1);
        case 'toggle-rule': {
            if (a1 == null || a2 == null) return false;
            let map = {};
            map[a1] = (a2 == "1" || a2 == "true" || a2 == true);
            return toggle_rules(map);
        }

        // 连接
        case 'connections':       return get_connections();
        case 'close-conn':        return close_connection(a1);
        case 'close-all-conn':    return close_all_connections();

        // 配置
        case 'configs':           return get_configs();
        case 'patch': {
            if (a1 == null || a2 == null) return false;
            let obj = {};
            obj[a1] = a2;
            return patch_config(obj);
        }
        case 'reload':            return reload_configs();
        case 'update-config':     return update_configs(a1, a2, (a3 == "force" || a3 == "true" || a3 == true));

        // DNS 与缓存
        case 'flush-dns':         return flush_dns();
        case 'flush-fakeip':      return flush_fakeip();
        case 'dns-query':         return query_dns(a1, a2);

        // 监控
        case 'traffic':           return get_traffic();
        case 'memory':            return get_memory();

        // 升级与重启
        case 'upgrade-core':      return upgrade_core(a1);
        case 'upgrade-ui':        return upgrade_ui();
        case 'restart':           return restart_core();
        case 'geo':               return update_geo();

        // 面板存储
        case 'get-storage':       return get_storage();
        case 'set-storage': {
            let val = a1;
            if (type(a1) == "string") {
                try {
                    let parsed = json(a1);
                    if (parsed != null) val = parsed;
                } catch(e) {}
            }
            return set_storage(val);
        }
        case 'del-storage':       return delete_storage();

        // Smart / Honk
        case 'smart-weights':     return get_smart_weights();
        case 'flush-smart':       return flush_smart_weights();
        case 'honk-stats':        return get_honk_stats();

        default:                  return null;
    }
};

