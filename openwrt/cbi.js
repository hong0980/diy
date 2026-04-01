/*
	LuCI - Lua Configuration Interface

	Copyright 2008 Steven Barth <steven@midlink.org>
	Copyright 2008-2018 Jo-Philipp Wich <jo@mein.io>

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0
*/

/**
 * ============================================================
 * cbi.js —— LuCI 旧版 CBI（Configuration Binding Interface）兼容层
 * ============================================================
 *
 * 【模块作用】
 *   本文件是 LuCI 旧版（Lua/CGI 时代）CBI 表单系统遗留的前端 JS 支撑代码。
 *   主要负责以下几类功能：
 *   1. 【依赖检查系统】根据表单字段的值动态显示/隐藏关联字段（cbi_d_* 系列）
 *   2. 【表单验证】在提交前验证输入格式（cbi_validate_* 系列）
 *   3. 【表格行排序】拖动排序表格行（cbi_row_swap）
 *   4. 【国际化工具】_()/N_() 函数实现多语言翻译
 *   5. 【字符串扩展】String.prototype.format 等格式化工具
 *   6. 【DOM 初始化】cbi_init() 在页面加载后初始化所有 CBI 控件
 *
 * 【与新版 form.js 的关系】
 *   新版 LuCI 插件推荐使用 form.js（纯 JS，基于 rpc+uci）。
 *   本文件主要用于支撑仍使用旧 Lua CBI 生成 HTML 的页面，
 *   两套系统在同一页面中均可共存。
 *
 * 【典型调用时机】
 *   页面 HTML 加载完成后，document 的 DOMContentLoaded 事件触发，
 *   L.require('ui') 完成后由 luci.js 中的 initDOM() 调用 cbi_init()，
 *   从而完成所有控件的初始化。
 */

// ════════════════════════════════════════════════════════════
// 全局变量
// ════════════════════════════════════════════════════════════

/**
 * 依赖关系注册表。
 * 每个元素描述一个 DOM 节点与其显示条件的关联：
 * {
 *   node:   DOM 节点对象,
 *   id:     节点的 id 属性,
 *   parent: 父节点的 id,
 *   deps:   [ { fieldId: expectedValue, ... }, ... ],  // 多组依赖条件（OR 关系）
 *   index:  节点在父容器中的排列顺序
 * }
 */
var cbi_d = [];

/**
 * 字符串资源缓存，用于存放从页面 data-strings 属性中读取的本地化字符串。
 * 结构: { path: {}, label: {} }
 */
var cbi_strings = { path: {}, label: {} };

// ════════════════════════════════════════════════════════════
// 哈希工具（用于国际化翻译键的索引查找）
// ════════════════════════════════════════════════════════════

/**
 * 读取字节数组中指定偏移处的有符号8位整数
 * @param {number[]} bytes - 字节数组
 * @param {number}   off   - 字节偏移
 * @returns {number} 有符号8位整数（-128 ~ 127）
 */
function s8(bytes, off) {
	var n = bytes[off];
	return (n > 0x7F) ? (n - 256) >>> 0 : n;
}

/**
 * 读取字节数组中指定偏移处的无符号16位整数（小端序）
 * @param {number[]} bytes - 字节数组
 * @param {number}   off   - 字节偏移
 * @returns {number} 无符号16位整数
 */
function u16(bytes, off) {
	return ((bytes[off + 1] << 8) + bytes[off]) >>> 0;
}

/**
 * SuperFastHash 算法：将字符串转换为8位十六进制哈希值。
 * 用于计算翻译字符串的查找键（在 window.TR 翻译表中索引）。
 *
 * @param {string} s - 输入字符串
 * @returns {string|null} 8位十六进制哈希字符串，输入为空时返回 null
 *
 * 【工作原理】
 *   将输入字符串转为 UTF-8 字节序列，再使用 SuperFastHash 算法
 *   计算32位哈希，最终输出为固定8位十六进制字符串（用于 TR 表查找）。
 */
function sfh(s) {
	if (s === null || s.length === 0)
		return null;

	// 将字符串编码为 UTF-8 字节数组
	var bytes = [];
	for (var i = 0; i < s.length; i++) {
		var ch = s.charCodeAt(i);

		if (ch <= 0x7F)
			bytes.push(ch);
		else if (ch <= 0x7FF)
			bytes.push(((ch >>>  6) & 0x1F) | 0xC0,
			           ( ch         & 0x3F) | 0x80);
		else if (ch <= 0xFFFF)
			bytes.push(((ch >>> 12) & 0x0F) | 0xE0,
			           ((ch >>>  6) & 0x3F) | 0x80,
			           ( ch         & 0x3F) | 0x80);
		else if (code <= 0x10FFFF)
			bytes.push(((ch >>> 18) & 0x07) | 0xF0,
			           ((ch >>> 12) & 0x3F) | 0x80,
			           ((ch >>   6) & 0x3F) | 0x80,
			           ( ch         & 0x3F) | 0x80);
	}

	if (!bytes.length)
		return null;

	// SuperFastHash 核心运算
	var hash = (bytes.length >>> 0),
	    len = (bytes.length >>> 2),
	    off = 0, tmp;

	while (len--) {
		hash += u16(bytes, off);
		tmp   = ((u16(bytes, off + 2) << 11) ^ hash) >>> 0;
		hash  = ((hash << 16) ^ tmp) >>> 0;
		hash += hash >>> 11;
		off  += 4;
	}

	// 处理剩余字节
	switch ((bytes.length & 3) >>> 0) {
	case 3:
		hash += u16(bytes, off);
		hash  = (hash ^ (hash << 16)) >>> 0;
		hash  = (hash ^ (s8(bytes, off + 2) << 18)) >>> 0;
		hash += hash >>> 11;
		break;

	case 2:
		hash += u16(bytes, off);
		hash  = (hash ^ (hash << 11)) >>> 0;
		hash += hash >>> 17;
		break;

	case 1:
		hash += s8(bytes, off);
		hash  = (hash ^ (hash << 10)) >>> 0;
		hash += hash >>> 1;
		break;
	}

	// 雪崩混淆
	hash  = (hash ^ (hash << 3)) >>> 0;
	hash += hash >>> 5;
	hash  = (hash ^ (hash << 4)) >>> 0;
	hash += hash >>> 17;
	hash  = (hash ^ (hash << 25)) >>> 0;
	hash += hash >>> 6;

	// 转为固定8位十六进制字符串
	return (0x100000000 + hash).toString(16).substr(1);
}

// ════════════════════════════════════════════════════════════
// 国际化（i18n）函数
// ════════════════════════════════════════════════════════════

/** 复数规则函数（由翻译文件中的规则动态生成） */
var plural_function = null;

/**
 * 去除字符串首尾空白，并将内部连续空白压缩为单个空格（用于规范化翻译键）
 * @param {string} s - 输入字符串
 * @returns {string} 规范化后的字符串
 */
function trimws(s) {
	return String(s).trim().replace(/[ \t\n]+/g, ' ');
}

/**
 * 翻译函数（单数形式）：查找并返回字符串 s 的本地化翻译。
 *
 * @param {string} s - 要翻译的原文字符串
 * @param {string} [c] - 翻译上下文（可选，用于区分相同原文在不同场景下的不同译文）
 * @returns {string} 翻译后的字符串，若无翻译则返回原文 s
 *
 * 【查找流程】
 *   1. 规范化原文（去多余空白）
 *   2. 计算翻译键的哈希值
 *   3. 在 window.TR 翻译表中查找
 *   4. 找不到时返回原文
 *
 * 【使用场景】
 *   _('Save')           → '保存'（中文翻译存在时）
 *   _('Save', 'button') → 按钮场景下的"保存"（带上下文区分）
 */
function _(s, c) {
	var k = (c != null ? trimws(c) + '\u0001' : '') + trimws(s);
	return (window.TR && TR[sfh(k)]) || s;
}

/**
 * 翻译函数（复数形式）：根据数量 n 选择单数或复数翻译。
 *
 * @param {number} n - 数量（决定使用单数还是复数形式）
 * @param {string} s - 单数原文
 * @param {string} p - 复数原文
 * @param {string} [c] - 翻译上下文
 * @returns {string} 对应数量的翻译字符串
 *
 * 【使用场景】
 *   N_(count, '%d item', '%d items') → 中文通常只有一种形式，英文区分单复数
 */
function N_(n, s, p, c) {
	if (plural_function == null && window.TR)
		plural_function = new Function('n', (TR['00000000'] || 'plural=(n != 1);') + 'return +plural');

	var i = plural_function ? plural_function(n) : (n != 1),
	    k = (c != null ? trimws(c) + '\u0001' : '') + trimws(s) + '\u0002' + i.toString();

	return (window.TR && TR[sfh(k)]) || (i ? p : s);
}

// ════════════════════════════════════════════════════════════
// 依赖检查系统（控制表单字段的显示/隐藏）
// ════════════════════════════════════════════════════════════

/**
 * 注册一个表单字段的依赖关系（将其加入 cbi_d 依赖注册表）。
 *
 * @param {string|Element} field - 字段的 DOM id 或 DOM 元素
 * @param {Object} dep   - 依赖条件对象 { fieldId: expectedValue, ... }
 *                         可以包含特殊键：
 *                         '!reverse'  → 依赖逻辑取反
 *                         '!default'  → 所有条件都不满足时的默认显示状态
 * @param {number} index - 字段在父容器中的位置索引（用于还原位置）
 *
 * 【使用场景】
 *   此函数由后端生成的 HTML 中的内联脚本调用，或由 cbi_init() 读取
 *   data-depends 属性后自动调用。一般不需要手动调用。
 *
 *   示例（后端生成的 HTML 中可能包含）：
 *   cbi_d_add('cbid.network.wan.password', { 'cbid.network.wan.proto': 'pppoe' }, 5);
 *   → 只有当 proto=pppoe 时才显示 password 字段
 */
function cbi_d_add(field, dep, index) {
	var obj = (typeof(field) === 'string') ? document.getElementById(field) : field;
	if (obj) {
		var entry;
		// 检查是否已有该节点的注册记录
		for (var i=0; i<cbi_d.length; i++) {
			if (cbi_d[i].id == obj.id) {
				entry = cbi_d[i];
				break;
			}
		}
		// 首次注册时创建新记录
		if (!entry) {
			entry = {
				"node": obj,
				"id": obj.id,
				"parent": obj.parentNode.id,
				"deps": [],
				"index": index
			};
			// 插入到数组开头（后注册的优先检查，支持依赖链）
			cbi_d.unshift(entry);
		}
		// 追加新的依赖条件组（与已有条件组是 OR 关系）
		entry.deps.push(dep);
	}
}

/**
 * 检查某个目标字段当前的值是否与期望值匹配。
 *
 * @param {string} target - 目标字段的 id 或 name
 * @param {string} ref    - 期望的值
 * @returns {boolean} 匹配返回 true，否则 false
 *
 * 【查找规则】
 *   - 支持 input（包括 radio/checkbox）和 select 元素
 *   - radio/checkbox 只有在选中状态下才读取其 value
 *   - 字段不存在时，视当前值为空字符串，与 '' 比较
 */
function cbi_d_checkvalue(target, ref) {
	var value = null,
	    query = 'input[id="'+target+'"], input[name="'+target+'"], ' +
	            'select[id="'+target+'"], select[name="'+target+'"]';

	document.querySelectorAll(query).forEach(function(i) {
		if (value === null && ((i.type !== 'radio' && i.type !== 'checkbox') || i.checked === true))
			value = i.value;
	});

	return (((value !== null) ? value : "") == ref);
}

/**
 * 检查一组依赖条件是否满足（支持 OR 逻辑和取反）。
 *
 * @param {Array} deps - 依赖条件数组，每个元素是一个条件组对象
 *                       同一条件组内各条件是 AND 关系，条件组之间是 OR 关系
 * @returns {boolean} 至少一组条件满足时返回 true
 *
 * 【条件组特殊键说明】
 *   '!reverse': 将本组的最终结果取反
 *   '!default': 当所有条件组均不满足时的默认返回值（true=默认显示）
 */
function cbi_d_check(deps) {
	var reverse;
	var def = false;  // 默认：所有组都不满足时隐藏
	for (var i=0; i<deps.length; i++) {
		var istat = true;   // 当前条件组的状态（AND 累积）
		reverse = false;
		for (var j in deps[i]) {
			if (j == "!reverse") {
				reverse = true;
			} else if (j == "!default") {
				def = true;      // 设置所有条件不满足时的默认显示状态
				istat = false;
			} else {
				// 普通字段依赖条件：当前值必须等于期望值
				istat = (istat && cbi_d_checkvalue(j, deps[i][j]));
			}
		}

		// 条件组满足（可能取反）时立即返回 true
		if (istat ^ reverse) {
			return true;
		}
	}
	return def;  // 所有条件组均不满足时返回默认值
}

/**
 * 更新所有注册了依赖关系的字段的显示状态。
 *
 * 遍历 cbi_d 中的所有记录，对每个字段：
 * - 若依赖条件不满足 → 从 DOM 中移除节点（隐藏）
 * - 若依赖条件满足且节点不在 DOM 中 → 将节点插回正确位置（显示）
 *
 * 状态变化时会递归调用自身，确保链式依赖（A依赖B，B依赖C）正确处理。
 * 更新完成后触发 'dependency-update' 自定义事件。
 *
 * 【何时调用】
 *   - cbi_init() 初始化完成后调用一次
 *   - 任何表单字段值发生变化时（通过 data-update 属性绑定的事件）
 *   - 下拉框选项变化时（cbi-dropdown-change 事件）
 */
function cbi_d_update() {
	var state = false;  // 本轮是否有 DOM 变化
	for (var i=0; i<cbi_d.length; i++) {
		var entry = cbi_d[i];
		var node  = document.getElementById(entry.id);
		var parent = document.getElementById(entry.parent);

		if (node && node.parentNode && !cbi_d_check(entry.deps)) {
			// 依赖不满足且节点在 DOM 中 → 移除（隐藏）
			node.parentNode.removeChild(node);
			state = true;
		}
		else if (parent && (!node || !node.parentNode) && cbi_d_check(entry.deps)) {
			// 依赖满足但节点不在 DOM 中 → 插入到正确位置（显示）
			var next = undefined;

			// 按 data-index 属性找到正确的插入位置
			for (next = parent.firstChild; next; next = next.nextSibling) {
				if (next.getAttribute && parseInt(next.getAttribute('data-index'), 10) > entry.index)
					break;
			}

			if (!next)
				parent.appendChild(entry.node);
			else
				parent.insertBefore(entry.node, next);

			state = true;
		}

		// 隐藏可选字段的父选择器（当没有可选项时隐藏整个容器）
		if (parent && parent.parentNode && parent.getAttribute('data-optionals'))
			parent.parentNode.style.display = (parent.options.length <= 1) ? 'none' : '';
	}

	// 更新最后一个子元素的样式标记
	if (entry && entry.parent)
		cbi_tag_last(parent);

	// 若有 DOM 变化，递归检查（处理链式依赖）
	if (state)
		cbi_d_update();
	else if (parent)
		// 通知其他组件依赖状态已稳定
		parent.dispatchEvent(new CustomEvent('dependency-update', { bubbles: true }));
}

// ════════════════════════════════════════════════════════════
// 页面初始化
// ════════════════════════════════════════════════════════════

/**
 * CBI 页面初始化函数：初始化页面上所有 CBI 控件。
 *
 * 由 luci.js 中的 initDOM() 在 DOM 就绪后调用（替代旧版直接在 DOMContentLoaded 调用）。
 *
 * 【初始化步骤】
 *   1. 初始化所有 .cbi-dropdown 下拉框控件（绑定到 L.ui.Dropdown 类）
 *   2. 读取 data-strings 属性，将页面嵌入的字符串资源存入 cbi_strings
 *   3. 读取 data-depends 属性，注册所有字段依赖关系到 cbi_d
 *   4. 读取 data-update 属性，绑定字段变更事件（触发依赖更新）
 *   5. 初始化 data-choices 控件（Combobox 下拉列表）
 *   6. 初始化 data-dynlist 控件（DynamicList 动态列表）
 *   7. 绑定 data-type 校验器（对有类型约束的输入字段添加验证）
 *   8. 添加 tooltip 容器样式
 *   9. 绑定 section 删除按钮的 hover 高亮效果
 *   10. 初始化 data-ui-widget 控件（通用 LuCI UI 控件）
 *   11. 完成后调用 cbi_d_update() 触发首次依赖状态检查
 */
function cbi_init() {
	var nodes;

	// 步骤1：初始化所有 CBI 下拉框
	document.querySelectorAll('.cbi-dropdown').forEach(function(node) {
		cbi_dropdown_init(node);
		node.addEventListener('cbi-dropdown-change', cbi_d_update);
	});

	// 步骤2：读取页面内嵌的字符串资源
	nodes = document.querySelectorAll('[data-strings]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		var str = JSON.parse(node.getAttribute('data-strings'));
		for (var key in str) {
			for (var key2 in str[key]) {
				var dst = cbi_strings[key] || (cbi_strings[key] = { });
				    dst[key2] = str[key][key2];
			}
		}
	}

	// 步骤3：注册字段依赖关系（从 data-depends JSON 属性读取）
	nodes = document.querySelectorAll('[data-depends]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		var index = parseInt(node.getAttribute('data-index'), 10);
		var depends = JSON.parse(node.getAttribute('data-depends'));
		if (!isNaN(index) && depends.length > 0) {
			for (var alt = 0; alt < depends.length; alt++)
				cbi_d_add(node, depends[alt], index);
		}
	}

	// 步骤4：绑定字段变更事件（触发依赖重新计算）
	nodes = document.querySelectorAll('[data-update]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		var events = node.getAttribute('data-update').split(' ');
		for (var j = 0, event; (event = events[j]) !== undefined; j++)
			node.addEventListener(event, cbi_d_update);
	}

	// 步骤5：初始化 Combobox 控件（带预设选项的组合下拉框）
	nodes = document.querySelectorAll('[data-choices]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		var choices = JSON.parse(node.getAttribute('data-choices')),
		    options = {};

		for (var j = 0; j < choices[0].length; j++)
			options[choices[0][j]] = choices[1][j];

		// data-optional="true" 时允许不选（显示提示文字）
		var def = (node.getAttribute('data-optional') === 'true')
			? node.placeholder || '' : null;

		var cb = new L.ui.Combobox(node.value, options, {
			name: node.getAttribute('name'),
			sort: choices[0],
			select_placeholder: def || _('-- Please choose --'),
			custom_placeholder: node.getAttribute('data-manual') || _('-- custom --')
		});

		var n = cb.render();
		n.addEventListener('cbi-dropdown-change', cbi_d_update);
		node.parentNode.replaceChild(n, node);
	}

	// 步骤6：初始化 DynamicList 控件（可动态增删的列表输入）
	nodes = document.querySelectorAll('[data-dynlist]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		var choices = JSON.parse(node.getAttribute('data-dynlist')),
		    values = JSON.parse(node.getAttribute('data-values') || '[]'),
		    options = null;

		if (choices[0] && choices[0].length) {
			options = {};
			for (var j = 0; j < choices[0].length; j++)
				options[choices[0][j]] = choices[1][j];
		}

		var dl = new L.ui.DynamicList(values, options, {
			name: node.getAttribute('data-prefix'),
			sort: choices[0],
			datatype: choices[2],
			optional: choices[3],
			placeholder: node.getAttribute('data-placeholder')
		});

		var n = dl.render();
		n.addEventListener('cbi-dynlist-change', cbi_d_update);
		node.parentNode.replaceChild(n, node);
	}

	// 步骤7：为有类型约束的输入字段绑定格式校验器
	nodes = document.querySelectorAll('[data-type]');
	for (var i = 0, node; (node = nodes[i]) !== undefined; i++) {
		cbi_validate_field(node, node.getAttribute('data-optional') === 'true',
		                   node.getAttribute('data-type'));
	}

	// 步骤8：为非空的 tooltip 容器添加 CSS 类（用于显示问号图标）
	document.querySelectorAll('.cbi-tooltip:not(:empty)').forEach(function(s) {
		s.parentNode.classList.add('cbi-tooltip-container');
	});

	// 步骤9：绑定 section 删除按钮的鼠标悬停高亮效果
	document.querySelectorAll('.cbi-section-remove > input[name^="cbi.rts"]').forEach(function(i) {
		var handler = function(ev) {
			var bits = this.name.split(/\./),
			    section = document.getElementById('cbi-' + bits[2] + '-' + bits[3]);

		    section.style.opacity = (ev.type === 'mouseover') ? 0.5 : '';
		};

		i.addEventListener('mouseover', handler);
		i.addEventListener('mouseout', handler);
	});

	var tasks = [];

	// 步骤10：初始化通用 LuCI UI 控件（通过 data-ui-widget 属性配置）
	document.querySelectorAll('[data-ui-widget]').forEach(function(node) {
		var args = JSON.parse(node.getAttribute('data-ui-widget') || '[]'),
		    widget = new (Function.prototype.bind.apply(L.ui[args[0]], args)),
		    markup = widget.render();

		tasks.push(Promise.resolve(markup).then(function(markup) {
			markup.addEventListener('widget-change', cbi_d_update);
			node.parentNode.replaceChild(markup, node);
		}));
	});

	// 步骤11：所有异步控件就绪后，触发首次依赖状态更新
	Promise.all(tasks).then(cbi_d_update);
}

// ════════════════════════════════════════════════════════════
// 表单验证
// ════════════════════════════════════════════════════════════

/**
 * 验证整个表单的所有字段（提交前调用）。
 *
 * @param {HTMLFormElement} form   - 要验证的 form 元素
 * @param {string}          errmsg - 验证失败时的提示消息（null 时不弹出）
 * @returns {boolean} 所有字段均通过验证时返回 true
 *
 * 【注意】当表单处于 add-section 或 del-section 状态时跳过验证
 *         （新增/删除 section 不需要完整验证）
 */
function cbi_validate_form(form, errmsg)
{
	/* 新增或删除 section 时不做全量验证 */
	if (form.cbi_state == 'add-section' || form.cbi_state == 'del-section')
		return true;

	if (form.cbi_validators) {
		for (var i = 0; i < form.cbi_validators.length; i++) {
			var validator = form.cbi_validators[i];

			if (!validator() && errmsg) {
				alert(errmsg);
				return false;
			}
		}
	}

	return true;
}

/**
 * 当用户在命名 section 输入框中输入时，实时控制"添加"按钮的可用状态。
 * 输入为空时禁用按钮，有内容时启用。
 *
 * @param {HTMLInputElement} input - section 名称输入框
 */
function cbi_validate_named_section_add(input)
{
	var button = input.parentNode.parentNode.querySelector('.cbi-button-add');
	button.disabled = input.value === '';
}

/**
 * 延迟重新验证整个表单（通常在 reset 后调用）。
 *
 * @param {HTMLFormElement} form - 要重新验证的表单
 * @returns {boolean} 始终返回 true
 */
function cbi_validate_reset(form)
{
	window.setTimeout(
		function() { cbi_validate_form(form, null) }, 100
	);

	return true;
}

/**
 * 为指定字段绑定类型验证器。
 *
 * @param {string|Element} cbid     - 字段的 id 或 DOM 元素
 * @param {boolean}        optional - true=允许为空，false=必填
 * @param {string}         type     - 数据类型字符串（如 'ipaddr', 'port', 'uinteger'）
 *
 * 【验证触发时机】
 *   - blur（失去焦点）
 *   - keyup（键盘输入）
 *   - cbi-dropdown-change（下拉框变化）
 *   - change/click（select 元素）
 *   - 绑定时立即执行一次初始验证
 *
 * 【常见 type 值】
 *   'ipaddr'    - IPv4 或 IPv6 地址
 *   'ip4addr'   - IPv4 地址
 *   'ip6addr'   - IPv6 地址
 *   'port'      - 端口号（1-65535）
 *   'portrange' - 端口范围（如 '8080-8090'）
 *   'uinteger'  - 无符号整数
 *   'macaddr'   - MAC 地址
 *   'hostname'  - 主机名
 *   'string'    - 任意字符串
 */
function cbi_validate_field(cbid, optional, type)
{
	var field = isElem(cbid) ? cbid : document.getElementById(cbid);
	var validatorFn;

	try {
		var cbiValidator = L.validation.create(field, type, optional);
		validatorFn = cbiValidator.validate.bind(cbiValidator);
	}
	catch(e) {
		validatorFn = null;
	};

	if (validatorFn !== null) {
		var form = findParent(field, 'form');

		// 将验证函数注册到表单的验证列表
		if (!form.cbi_validators)
			form.cbi_validators = [ ];

		form.cbi_validators.push(validatorFn);

		// 绑定各类触发事件
		field.addEventListener("blur",  validatorFn);
		field.addEventListener("keyup", validatorFn);
		field.addEventListener("cbi-dropdown-change", validatorFn);

		if (matchesElem(field, 'select')) {
			field.addEventListener("change", validatorFn);
			field.addEventListener("click",  validatorFn);
		}

		// 初始化时立即执行一次验证（显示初始状态）
		validatorFn();
	}
}

// ════════════════════════════════════════════════════════════
// 表格行排序
// ════════════════════════════════════════════════════════════

/**
 * 交换表格中相邻的两行（用于 section 的手动排序）。
 *
 * @param {Element} elem  - 触发排序的按钮元素（位于某行内）
 * @param {boolean} up    - true=向上移动，false=向下移动
 * @param {string}  store - 用于存储排序结果的隐藏 input 的 id
 * @returns {boolean} 始终返回 false（防止表单默认提交）
 *
 * 【效果】
 *   移动后会自动更新行的 CSS 交替样式（cbi-rowstyle-1/2），
 *   将新顺序以空格分隔的 section ID 写入 store 对应的隐藏 input，
 *   并滚动到被移动的行，添加闪烁动画（flash 类）。
 */
function cbi_row_swap(elem, up, store)
{
	var tr = findParent(elem.parentNode, '.cbi-section-table-row');

	if (!tr)
		return false;

	tr.classList.remove('flash');

	if (up) {
		var prev = tr.previousElementSibling;

		if (prev && prev.classList.contains('cbi-section-table-row'))
			tr.parentNode.insertBefore(tr, prev);
		else
			return;
	}
	else {
		var next = tr.nextElementSibling ? tr.nextElementSibling.nextElementSibling : null;

		if (next && next.classList.contains('cbi-section-table-row'))
			tr.parentNode.insertBefore(tr, next);
		else if (!next)
			tr.parentNode.appendChild(tr);
		else
			return;
	}

	// 收集新顺序中所有行的 section ID
	var ids = [ ];
	for (var i = 0, n = 0; i < tr.parentNode.childNodes.length; i++) {
		var node = tr.parentNode.childNodes[i];
		if (node.classList && node.classList.contains('cbi-section-table-row')) {
			// 重置并应用交替行样式
			node.classList.remove('cbi-rowstyle-1');
			node.classList.remove('cbi-rowstyle-2');
			node.classList.add((n++ % 2) ? 'cbi-rowstyle-2' : 'cbi-rowstyle-1');

			// 从行 id 末尾提取 section ID
			if (/-([^\-]+)$/.test(node.id))
				ids.push(RegExp.$1);
		}
	}

	// 将新顺序写入隐藏 input（提交时传递给后端）
	var input = document.getElementById(store);
	if (input)
		input.value = ids.join(' ');

	// 滚动到被移动的行并播放闪烁动画
	window.scrollTo(0, tr.offsetTop);
	void tr.offsetWidth;       // 触发重绘，确保动画重新开始
	tr.classList.add('flash');

	return false;
}

// ════════════════════════════════════════════════════════════
// DOM 工具函数
// ════════════════════════════════════════════════════════════

/**
 * 在容器的所有 div 子元素中，为最后一个添加 'cbi-value-last' CSS 类。
 * 用于实现最后一项不显示底部边框的视觉效果。
 *
 * @param {Element} container - 要处理的容器元素
 */
function cbi_tag_last(container)
{
	var last;

	for (var i = 0; i < container.childNodes.length; i++) {
		var c = container.childNodes[i];
		if (matchesElem(c, 'div')) {
			c.classList.remove('cbi-value-last');
			last = c;
		}
	}

	if (last)
		last.classList.add('cbi-value-last');
}

/**
 * 提交表单，可选地设置 action URL 和附加一个隐藏 input 字段。
 *
 * @param {Element} elem   - 触发提交的元素（在其中查找 form）
 * @param {string}  name   - 隐藏 input 的 name（可选）
 * @param {string}  value  - 隐藏 input 的值（可选，默认 '1'）
 * @param {string}  action - 覆盖 form 的 action URL（可选）
 * @returns {boolean} 成功提交返回 true，找不到 form 返回 false
 *
 * 【使用场景】
 *   通常由旧版 CBI Lua 模板生成的按钮 onclick 调用：
 *   onclick="return cbi_submit(this, 'cbi.apply', '', '/cgi-bin/luci/admin/apply')"
 */
function cbi_submit(elem, name, value, action)
{
	var form = elem.form || findParent(elem, 'form');

	if (!form)
		return false;

	if (action)
		form.action = action;

	if (name) {
		var hidden = form.querySelector('input[type="hidden"][name="%s"]'.format(name)) ||
			E('input', { type: 'hidden', name: name });

		hidden.value = value || '1';
		form.appendChild(hidden);
	}

	form.submit();
	return true;
}

// ════════════════════════════════════════════════════════════
// 字符串扩展
// ════════════════════════════════════════════════════════════

/**
 * String.prototype.format：类 printf 的字符串格式化方法。
 *
 * 支持的格式化占位符：
 *   %s  - 字符串
 *   %d  - 有符号整数
 *   %u  - 无符号整数
 *   %f  - 浮点数（支持 %.2f 精度）
 *   %b  - 二进制
 *   %o  - 八进制
 *   %x  - 十六进制（小写）
 *   %X  - 十六进制（大写）
 *   %h  - HTML 转义字符串（& " ' < > 均转义）
 *   %q  - 引号转义字符串（" ' 转义）
 *   %t  - 时间格式（秒数转换为 Xd Xh Xm Xs）
 *   %m  - 存储单位格式（如 '1.23 M' 或 '512 K'），支持 %1024m 使用 Ki 单位
 *   %%  - 输出字面量 %
 *
 * 对齐与填充：
 *   %-10s  - 左对齐，最小宽度10（空格填充）
 *   %010d  - 右对齐，宽度10，零填充
 *   %'#5s  - 右对齐，宽度5，# 字符填充
 *
 * 【使用场景】
 *   'Hello, %s! You have %d messages.'.format('World', 3)
 *   → 'Hello, World! You have 3 messages.'
 *
 *   'IP: %s, Port: %d'.format('192.168.1.1', 80)
 *   → 'IP: 192.168.1.1, Port: 80'
 *
 *   'Traffic: %m'.format(1536000)   → 'Traffic: 1.46 M'
 *   'Traffic: %1024m'.format(1024)  → 'Traffic: 1.00 Ki'
 *
 *   'Uptime: %t'.format(3661)  → 'Uptime: 1h 1m 1s'
 */
String.prototype.format = function()
{
	if (!RegExp)
		return;

	var html_esc = [/&/g, '&#38;', /"/g, '&#34;', /'/g, '&#39;', /</g, '&#60;', />/g, '&#62;'];
	var quot_esc = [/"/g, '&#34;', /'/g, '&#39;'];

	function esc(s, r) {
		var t = typeof(s);

		if (s == null || t === 'object' || t === 'function')
			return '';

		if (t !== 'string')
			s = String(s);

		for (var i = 0; i < r.length; i += 2)
			s = s.replace(r[i], r[i+1]);

		return s;
	}

	var str = this;
	var out = '';
	var re = /^(([^%]*)%('.|0|\x20)?(-)?(\\d+)?(\\.\\d+)?(%|b|c|d|u|f|o|s|x|X|q|h|j|t|m))/;
	var a = b = [], numSubstitutions = 0, numMatches = 0;

	while (a = re.exec(str)) {
		var m = a[1];
		var leftpart = a[2], pPad = a[3], pJustify = a[4], pMinLength = a[5];
		var pPrecision = a[6], pType = a[7];

		numMatches++;

		if (pType == '%') {
			subst = '%';
		}
		else {
			if (numSubstitutions < arguments.length) {
				var param = arguments[numSubstitutions++];

				var pad = '';
				if (pPad && pPad.substr(0,1) == "'")
					pad = leftpart.substr(1,1);
				else if (pPad)
					pad = pPad;
				else
					pad = ' ';

				var justifyRight = true;
				if (pJustify && pJustify === "-")
					justifyRight = false;

				var minLength = -1;
				if (pMinLength)
					minLength = +pMinLength;

				var precision = -1;
				if (pPrecision && pType == 'f')
					precision = +pPrecision.substring(1);

				var subst = param;

				switch(pType) {
					case 'b': subst = Math.floor(+param || 0).toString(2); break;
					case 'c': subst = String.fromCharCode(+param || 0); break;
					case 'd': subst = Math.floor(+param || 0).toFixed(0); break;
					case 'u':
						var n = +param || 0;
						subst = Math.floor((n < 0) ? 0x100000000 + n : n).toFixed(0);
						break;
					case 'f':
						subst = (precision > -1) ? ((+param || 0.0)).toFixed(precision) : (+param || 0.0);
						break;
					case 'o': subst = Math.floor(+param || 0).toString(8); break;
					case 's': subst = param; break;
					case 'x': subst = Math.floor(+param || 0).toString(16).toLowerCase(); break;
					case 'X': subst = Math.floor(+param || 0).toString(16).toUpperCase(); break;
					case 'h': subst = esc(param, html_esc); break;
					case 'q': subst = esc(param, quot_esc); break;
					case 't':
						// 将秒数转换为 Xd Xh Xm Xs 格式
						var td = 0, th = 0, tm = 0, ts = (param || 0);
						if (ts > 59) { tm = Math.floor(ts / 60); ts = (ts % 60); }
						if (tm > 59) { th = Math.floor(tm / 60); tm = (tm % 60); }
						if (th > 23) { td = Math.floor(th / 24); th = (th % 24); }
						subst = (td > 0)
							? String.format('%dd %dh %dm %ds', td, th, tm, ts)
							: String.format('%dh %dm %ds', th, tm, ts);
						break;
					case 'm':
						// 将字节数转换为带单位的存储大小
						var mf = pMinLength ? +pMinLength : 1000;
						var pr = pPrecision ? ~~(10 * +('0' + pPrecision)) : 2;
						var i = 0;
						var val = (+param || 0);
						var units = [ ' ', ' K', ' M', ' G', ' T', ' P', ' E' ];
						for (i = 0; (i < units.length) && (val > mf); i++)
							val /= mf;
						if (i)
							subst = val.toFixed(pr) + units[i] + (mf == 1024 ? 'i' : '');
						else
							subst = val + ' ';
						pMinLength = null;
						break;
				}
			}
		}

		if (pMinLength) {
			subst = subst.toString();
			for (var i = subst.length; i < pMinLength; i++)
				if (pJustify == '-')
					subst = subst + ' ';
				else
					subst = pad + subst;
		}

		out += leftpart + subst;
		str = str.substr(m.length);
	}

	return out + str;
}

/**
 * 将字符串中的空白字符替换为不换行空格（&nbsp;/&#160;），防止自动换行。
 * @returns {string} 处理后的字符串
 */
String.prototype.nobr = function()
{
	return this.replace(/[\s\n]+/g, '&#160;');
}

/**
 * String.format：等同于 ''.format.apply(template, args)
 * 将 format 作为静态方法调用（第一个参数为模板字符串）。
 *
 * 【使用场景】
 *   String.format('Hello, %s!', 'World')  → 'Hello, World!'
 *   等价于: 'Hello, %s!'.format('World')
 */
String.format = function()
{
	var a = [ ];
	for (var i = 1; i < arguments.length; i++)
		a.push(arguments[i]);
	return ''.format.apply(arguments[0], a);
}

/**
 * String.nobr：nobr 的静态调用版本
 */
String.nobr = function()
{
	var a = [ ];
	for (var i = 1; i < arguments.length; i++)
		a.push(arguments[i]);
	return ''.nobr.apply(arguments[0], a);
}

// ════════════════════════════════════════════════════════════
// 浏览器兼容性 Polyfill
// ════════════════════════════════════════════════════════════

/**
 * NodeList.forEach Polyfill：为不支持 forEach 的旧版浏览器补充实现。
 * 现代浏览器（Chrome 51+, Firefox 50+, Safari 10+）已原生支持，此处仅兼容旧版本。
 */
if (window.NodeList && !NodeList.prototype.forEach) {
	NodeList.prototype.forEach = function (callback, thisArg) {
		thisArg = thisArg || window;
		for (var i = 0; i < this.length; i++) {
			callback.call(thisArg, this[i], i, this);
		}
	};
}

/**
 * requestAnimationFrame Polyfill：以 ~30fps 的 setTimeout 模拟帧动画。
 * 用于在不支持 rAF 的旧版浏览器上平滑处理 UI 更新。
 */
if (!window.requestAnimationFrame) {
	window.requestAnimationFrame = function(f) {
		window.setTimeout(function() {
			f(new Date().getTime())
		}, 1000/30);
	};
}

// ════════════════════════════════════════════════════════════
// LuCI DOM/UI 别名（为了让旧版 CBI Lua 模板生成的 JS 代码可以使用）
// ════════════════════════════════════════════════════════════

/** 检查是否为 DOM 元素（等同于 L.dom.elem(e)） */
function isElem(e) { return L.dom.elem(e) }

/** 解析 HTML 字符串为 DOM 节点（等同于 L.dom.parse(s)） */
function toElem(s) { return L.dom.parse(s) }

/** 检查节点是否匹配 CSS 选择器（等同于 L.dom.matches(node, selector)） */
function matchesElem(node, selector) { return L.dom.matches(node, selector) }

/** 向上查找匹配 CSS 选择器的父节点（等同于 L.dom.parent(node, selector)） */
function findParent(node, selector) { return L.dom.parent(node, selector) }

/** 创建 DOM 元素（等同于 L.dom.create(...)） */
function E() { return L.dom.create.apply(L.dom, arguments) }

// ════════════════════════════════════════════════════════════
// 控件初始化助手
// ════════════════════════════════════════════════════════════

/**
 * 初始化单个 CBI 下拉框控件（将普通 select 元素升级为 L.ui.Dropdown 实例）。
 *
 * @param {Element} sb - 要初始化的下拉框元素
 * @returns {*} 绑定后的 Dropdown 实例
 *
 * 【注意】若元素已绑定 Dropdown 实例则直接返回，不重复初始化
 */
function cbi_dropdown_init(sb) {
	if (sb && L.dom.findClassInstance(sb) instanceof L.ui.Dropdown)
		return;

	var dl = new L.ui.Dropdown(sb, null, { name: sb.getAttribute('name') });
	return dl.bind(sb);
}

/**
 * 更新表格内容（将数据数组渲染到指定的表格元素中）。
 *
 * @param {string|Element} table       - 表格元素或其 CSS 选择器
 * @param {Array}          data        - 表格数据（二维数组）
 * @param {string|Element} placeholder - 无数据时显示的占位内容
 *
 * 【使用场景：在 view 中动态更新一个数据表格】
 *
 *   cbi_update_table('#my-table', [
 *       ['192.168.1.100', 'MyPhone',  '00:11:22:33:44:55', '12h'],
 *       ['192.168.1.101', 'MyLaptop', '66:77:88:99:AA:BB', '3h']
 *   ], E('em', _('No leases')));
 */
function cbi_update_table(table, data, placeholder) {
	var target = isElem(table) ? table : document.querySelector(table);

	if (!isElem(target))
		return;

	var t = L.dom.findClassInstance(target);

	// 若尚未绑定 Table 实例，创建并绑定
	if (!(t instanceof L.ui.Table)) {
		t = new L.ui.Table(target);
		L.dom.bindClassInstance(target, t);
	}

	t.update(data, placeholder);
}

// ════════════════════════════════════════════════════════════
// 全局模态框快捷函数
// ════════════════════════════════════════════════════════════

/**
 * 显示模态对话框（封装 L.showModal）。
 *
 * @param {string}   title    - 对话框标题
 * @param {Element|Array} children - 对话框内容节点或节点数组
 * @returns {Element} 模态框元素
 *
 * 【使用场景：显示确认对话框】
 *   showModal('确认操作', [
 *       E('p', '确定要删除这条规则吗？'),
 *       E('div', { class: 'right' }, [
 *           E('button', { class: 'btn', click: function() { hideModal() } }, '取消'),
 *           E('button', { class: 'btn cbi-button-action', click: doDelete }, '确定')
 *       ])
 *   ]);
 */
function showModal(title, children)
{
	return L.showModal(title, children);
}

/**
 * 关闭当前模态对话框（封装 L.hideModal）。
 */
function hideModal()
{
	return L.hideModal();
}

// ════════════════════════════════════════════════════════════
// 页面级事件监听
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
	// 当输入验证失败时，在焦点字段旁显示错误 tooltip
	document.addEventListener('validation-failure', function(ev) {
		if (ev.target === document.activeElement)
			L.showTooltip(ev);
	});

	// 当输入验证恢复成功时，隐藏错误 tooltip
	document.addEventListener('validation-success', function(ev) {
		if (ev.target === document.activeElement)
			L.hideTooltip(ev);
	});

	// 加载 ui 模块后，初始化页面中所有 .table 元素（更新数据表格显示）
	L.require('ui').then(function(ui) {
		document.querySelectorAll('.table').forEach(cbi_update_table);
	});
});
