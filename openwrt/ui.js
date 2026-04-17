'use strict';
'require validation';
'require baseclass';
'require request';
'require session';
'require poll';
'require dom';
'require rpc';
'require uci';
'require fs';

/** @type {HTMLElement|null} 当前显示的模态对话框 DOM 节点，未显示时为 null */
let modalDiv = null;

/** @type {HTMLElement|null} 当前显示的工具提示 DOM 节点，未显示时为 null */
let tooltipDiv = null;

/** @type {HTMLElement|null} 当前显示的状态指示器 DOM 节点，未显示时为 null */
let indicatorDiv = null;

/** @type {number|null} 工具提示自动隐藏的定时器句柄，未激活时为 null */
let tooltipTimeout = null;

/**
 * @class AbstractElement
 * @memberof LuCI.ui
 * @hideconstructor
 * @classdesc
 *
 * `AbstractElement` 是 `LuCI.ui` 中所有 UI 控件的抽象基类。
 * 提供了读写值、校验状态检查、事件绑定等公共逻辑。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.AbstractElement`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `AbstractElement` 属性。
 *
 * @example
 * // AbstractElement 是基类，通常不直接实例化，
 * // 而是通过具体子类（如 Textfield、Checkbox 等）使用：
 * 'require ui';
 * const input = new ui.Textfield('初始值', { optional: false });
 * document.body.appendChild(input.render());
 */
const UIElement = baseclass.extend(/** @lends LuCI.ui.AbstractElement.prototype */ {
	/**
	 * @typedef {Object} InitOptions
	 * @memberof LuCI.ui.AbstractElement
	 *
	 * 所有 UI 控件通用的初始化选项。
	 *
	 * @property {string} [id]
	 * 控件的 HTML `id` 属性值，设置在控件顶层 DOM 节点上。
	 *
	 * @property {string} [name]
	 * 控件的 HTML `name` 属性值，设置在对应的 `<input>` 元素上。
	 *
	 * @property {boolean} [optional=true]
	 * 是否允许输入空值。`true` 表示允许空值（默认），`false` 表示必填。
	 *
	 * @property {string} [datatype=string]
	 * 描述输入数据验证约束的表达式字符串，默认为 `string`（允许任意值）。
	 * 详见 {@link LuCI.validation} 的表达式格式说明。
	 *
	 * @property {function|function[]} [validator]
	 * 自定义验证函数或验证函数数组，在标准约束校验通过后依次调用。
	 * 每个函数应返回 `true` 表示接受该值；返回非 `true` 值时，
	 * 该值会被转为字符串作为验证错误提示信息。
	 * 数组中的函数串行执行，遇到第一个非 `true` 返回值即停止。
	 *
	 * @property {boolean} [disabled=false]
	 * 是否以禁用状态渲染控件。禁用的控件无法交互，并以略微褪色的样式显示。
	 */

	/**
	 * 读取输入控件的当前值。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @returns {string|string[]|null}
	 * 返回输入元素的当前值。对于文本框、下拉框等简单控件，返回字符串（可为空字符串）；
	 * 对于 `DynamicList` 等复杂控件，可能返回字符串数组或 `null`（未设值时）。
	 *
	 * @example
	 * const val = widget.getValue(); // 例如返回 "192.168.1.1" 或 null
	 */
	getValue() {
		if (dom.matches(this.node, 'select') || dom.matches(this.node, 'input'))
			return this.node.value;

		return null;
	},

	/**
	 * 设置输入控件的当前值。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @param {string|string[]|null} value
	 * 要设置的值。对于文本框、下拉框等简单控件，值应为字符串（可为空字符串）；
	 * `DynamicList` 等复杂控件可接受字符串数组或 `null`。
	 *
	 * @example
	 * widget.setValue('192.168.1.1');
	 */
	setValue(value) {
		if (dom.matches(this.node, 'select') || dom.matches(this.node, 'input'))
			this.node.value = value;
	},

	/**
	 * 设置输入控件的占位符文本（placeholder）。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @param {string|string[]|null} value
	 * 要设置的占位符文本。仅适用于文本类输入框，
	 * 不适用于单选按钮、下拉框等控件。
	 * 传入 `null` 或空字符串时，移除占位符属性。
	 *
	 * @example
	 * widget.setPlaceholder('请输入 IP 地址');
	 */
	setPlaceholder(value) {
		const node = this.node ? this.node.querySelector('input,textarea') : null;
		if (node) {
			switch (node.getAttribute('type') ?? 'text') {
			case 'password':
			case 'search':
			case 'tel':
			case 'text':
			case 'url':
				if (value != null && value != '')
					node.setAttribute('placeholder', value);
				else
					node.removeAttribute('placeholder');
			}
		}
	},

	/**
	 * 检查输入值是否被用户修改过。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @returns {boolean}
	 * 若用户修改过输入值则返回 `true`，未修改则返回 `false`。
	 * 注意：即使用户将值改回初始状态，仍会报告为已修改。
	 *
	 * @example
	 * if (widget.isChanged()) {
	 *     console.log('用户修改了该字段');
	 * }
	 */
	isChanged() {
		return (this.node ? this.node.getAttribute('data-changed') : null) == 'true';
	},

	/**
	 * 检查当前输入值是否有效。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @returns {boolean}
	 * 若当前输入值满足验证约束则返回 `true`，否则返回 `false`。
	 *
	 * @example
	 * if (!widget.isValid()) {
	 *     console.log('输入值不合法：', widget.getValidationError());
	 * }
	 */
	isValid() {
		return (this.validState !== false);
	},

	/**
	 * 返回当前验证错误信息。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @returns {string}
	 * 当前的验证错误提示字符串；若无错误则返回空字符串。
	 *
	 * @example
	 * const err = widget.getValidationError();
	 * if (err) alert('验证失败：' + err);
	 */
	getValidationError() {
		return this.validationError ?? '';
	},

	/**
	 * 手动触发当前输入值的验证。
	 *
	 * 输入验证通常由绑定在控件上的 DOM 事件自动触发。
	 * 在某些情况下（例如通过代码修改了值），需要手动触发验证。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @returns {boolean}
	 * 若验证状态发生变化（有效↔无效）则返回 `true`，否则返回 `false`。
	 *
	 * @example
	 * widget.setValue('invalid-value');
	 * const changed = widget.triggerValidation();
	 * // changed 为 true 表示刚刚从有效变为无效（或反之）
	 */
	triggerValidation() {
		if (typeof(this.vfunc) != 'function')
			return false;

		const wasValid = this.isValid();

		this.vfunc();

		return (wasValid != this.isValid());
	},

	/**
	 * 在接收到指定原生事件时，向控件根节点分发自定义合成事件。
	 *
	 * 在目标 DOM 节点上为指定事件名称注册监听器，
	 * 这些监听器触发后会向控件根节点分发一个指定类型的自定义事件。
	 *
	 * 主要用于统一建立 `widget-update`、`validation-success`、
	 * `validation-failure` 等标准自定义事件，由各种不同的原生 DOM 事件触发。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @param {Node} targetNode
	 * 要注册原生事件监听器的 DOM 节点。
	 *
	 * @param {string} synevent
	 * 要向控件根节点分发的自定义事件名称。
	 *
	 * @param {string[]} events
	 * 要监听的原生 DOM 事件名称数组。
	 *
	 * @example
	 * // 监听 input 的 keyup/blur，统一分发为 'widget-update'
	 * this.registerEvents(inputEl, 'widget-update', ['keyup', 'blur']);
	 */
	registerEvents(targetNode, synevent, events) {
		const dispatchFn = L.bind((ev) => {
			this.node.dispatchEvent(new CustomEvent(synevent, { bubbles: true }));
		}, this);

		for (let i = 0; i < events.length; i++)
			targetNode.addEventListener(events[i], dispatchFn);
	},

	/**
	 * 为可能导致控件值更新的原生 DOM 事件注册监听器。
	 *
	 * 在目标 DOM 节点上为指定事件名注册处理器，这些事件可能引发输入值更新
	 * （如 `keyup`、`onclick` 等）。与变更事件不同，更新事件会触发输入值验证。
	 *
	 * 若 `options.datatype` 或 `options.validate` 已配置，还会为目标节点
	 * 附加验证器，并将验证结果同步回 `this.validState` 与 `this.validationError`。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @param {Node} targetNode
	 * 要注册事件监听器的 DOM 节点。
	 *
	 * @param {...string} events
	 * 要监听的 DOM 事件名称。
	 *
	 * @example
	 * // 在 input 上注册 keyup 和 blur 作为"更新"事件
	 * this.setUpdateEvents(inputEl, 'keyup', 'blur');
	 */
	setUpdateEvents(targetNode, ...events) {
		const datatype = this.options.datatype;
		const optional = this.options.hasOwnProperty('optional') ? this.options.optional : true;
		const validate = this.options.validate;

		this.registerEvents(targetNode, 'widget-update', events);

		if (!datatype && !validate)
			return;

		this.vfunc = UI.prototype.addValidator(...[
			targetNode, datatype ?? 'string',
			optional, validate
		].concat(events));

		this.node.addEventListener('validation-success', L.bind((ev) => {
			this.validState = true;
			this.validationError = '';
		}, this));

		this.node.addEventListener('validation-failure', L.bind((ev) => {
			this.validState = false;
			this.validationError = ev.detail.message;
		}, this));
	},

	/**
	 * 为可能导致控件值整体变更的原生 DOM 事件注册监听器。
	 *
	 * 在目标 DOM 节点上为指定事件名注册处理器，这些事件可能造成输入值完全改变
	 * （如 select 菜单的 `change` 事件）。与更新事件不同，变更事件不会触发输入验证，
	 * 但会重新评估字段依赖关系，并将控件标记为"已修改（dirty）"。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 * @param {Node} targetNode
	 * 要注册事件监听器的 DOM 节点。
	 *
	 * @param {...string} events
	 * 要监听的 DOM 事件名称。
	 *
	 * @example
	 * // 在 select 上注册 change 作为"变更"事件
	 * this.setChangeEvents(selectEl, 'change');
	 */
	setChangeEvents(targetNode, ...events) {
		const tag_changed = L.bind(function(ev) { this.setAttribute('data-changed', true) }, this.node);

		for (let i = 0; i < events.length; i++)
			targetNode.addEventListener(events[i], tag_changed);

		this.registerEvents(targetNode, 'widget-change', events);
	},

	/**
	 * 渲染控件、绑定事件监听器并返回生成的 DOM 标记。
	 *
	 * 此方法为抽象接口，由各具体子类重写以生成自己的 DOM 结构。
	 * 调用后应返回可直接插入页面的 DOM 节点或 DocumentFragment。
	 *
	 * @instance
	 * @memberof LuCI.ui.AbstractElement
	 *
	 * @returns {Node}
	 * 返回包含渲染后控件标记的 DOM 节点或 DocumentFragment。
	 *
	 * @example
	 * const node = widget.render();
	 * document.getElementById('container').appendChild(node);
	 */
	render() {}
});

/**
 * @class UITextfield
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 * @classdesc
 *
 * 单行文本输入框控件，封装了 HTML `<input type="text">` 或
 * `<input type="password">` 元素。支持密码可见性切换、
 * 最大长度限制、占位符文本及只读/禁用状态。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.Textfield`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `Textfield` 属性。
 *
 * @param {string} [value=null]
 * 输入框的初始值。
 *
 * @param {LuCI.ui.Textfield.InitOptions} [options]
 * 描述控件专有配置的选项对象。
 *
 * @example
 * // 创建普通文本输入框
 * const input = new ui.Textfield('hello', { placeholder: '请输入内容' });
 * document.body.appendChild(input.render());
 *
 * @example
 * // 创建密码输入框（带切换可见性按钮）
 * const pwd = new ui.Textfield('', {
 *     password: true,
 *     placeholder: '请输入密码'
 * });
 * document.body.appendChild(pwd.render());
 */
const UITextfield = UIElement.extend(/** @lends LuCI.ui.Textfield.prototype */ {
	/**
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.Textfield
	 *
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 的基础上，额外支持以下属性：
	 *
	 * @property {boolean} [password=false]
	 * 是否以密码模式渲染（隐藏输入内容）。启用后输入框右侧会显示
	 * "显示/隐藏密码"切换按钮。
	 *
	 * @property {boolean} [readonly=false]
	 * 是否以只读模式渲染输入框。只读模式下用户无法修改内容。
	 *
	 * @property {number} [maxlength]
	 * 设置对应 `<input>` 元素的 HTML `maxlength` 属性，限制最大输入字符数。
	 * 注意：此属性为兼容性遗留属性，建议优先使用 `maxlength(N)` 验证表达式。
	 *
	 * @property {string} [placeholder]
	 * 设置对应 `<input>` 元素为空时显示的 HTML `placeholder` 占位符文本。
	 */

	/**
	 * 初始化文本输入框实例。
	 *
	 * @private
	 * @param {string} value - 输入框的初始值
	 * @param {LuCI.ui.Textfield.InitOptions} options - 控件配置选项
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({
			optional: true,
			password: false
		}, options);
	},

	/**
	 * 渲染文本输入框并返回对应的 DOM 节点。
	 *
	 * 若 `options.password` 为 `true`，则在 `<input>` 旁边附加一个
	 * "显示/隐藏密码"按钮，并在下一帧将输入类型切换为 `password`。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的容器 `<div>` DOM 节点。
	 *
	 * @example
	 * const node = new ui.Textfield('test').render();
	 * document.body.appendChild(node);
	 */
	render() {
		const frameEl = E('div', { 'id': this.options.id });
		const inputEl = E('input', {
			'id': this.options.id ? `widget.${this.options.id}` : null,
			'name': this.options.name,
			'type': 'text',
			'class': `password-input ${this.options.password ? 'cbi-input-password' : 'cbi-input-text'}`,
			'readonly': this.options.readonly ? '' : null,
			'disabled': this.options.disabled ? '' : null,
			'maxlength': this.options.maxlength,
			'placeholder': this.options.placeholder,
			'value': this.value,
		});

		if (this.options.password) {
			frameEl.appendChild(E('div', { 'class': 'control-group' }, [
				inputEl,
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'title': _('Reveal/hide password'),
					'aria-label': _('Reveal/hide password'),
					'click': function(ev) {
						// DOM manipulation (e.g. by password managers) may have inserted other
						// elements between the reveal button and the input. This searches for
						// the first <input> inside the parent of the <button> to use for toggle.
						const e = this.parentElement.querySelector('input.password-input')
						if (e) {
							e.type = (e.type === 'password') ? 'text' : 'password';
						} else {
							console.error('unable to find input corresponding to reveal/hide button');
						}
						ev.preventDefault();
					}
				}, '∗')
			]));

			window.requestAnimationFrame(() => { inputEl.type = 'password' });
		}
		else {
			frameEl.appendChild(inputEl);
		}

		return this.bind(frameEl);
	},

	/**
	 * 将控件实例绑定到已渲染的 DOM 节点并注册事件监听器。
	 *
	 * 此方法在 `render()` 内部调用，完成以下操作：
	 * - 保存根节点引用到 `this.node`
	 * - 为 `<input>` 注册 `keyup`/`blur` 为更新事件，`change` 为变更事件
	 * - 将类实例绑定到 DOM 节点（供外部通过 `dom.callClassMethod` 访问）
	 *
	 * @private
	 * @param {HTMLElement} frameEl - 控件的容器 DOM 节点
	 * @returns {HTMLElement} 传入的 `frameEl`，便于链式调用
	 */
	bind(frameEl) {
		const inputEl = frameEl.querySelector('input');

		this.node = frameEl;

		this.setUpdateEvents(inputEl, 'keyup', 'blur');
		this.setChangeEvents(inputEl, 'change');

		dom.bindClassInstance(frameEl, this);

		return frameEl;
	},

	/**
	 * 读取 `<input>` 元素的当前值。
	 *
	 * @override
	 * @returns {string} 输入框的当前文本值。
	 *
	 * @example
	 * const text = inputWidget.getValue(); // 返回用户输入的字符串
	 */
	getValue() {
		const inputEl = this.node.querySelector('input');
		return inputEl.value;
	},

	/**
	 * 设置 `<input>` 元素的值。
	 *
	 * @override
	 * @param {string} value - 要设置的新值
	 *
	 * @example
	 * inputWidget.setValue('新文本内容');
	 */
	setValue(value) {
		const inputEl = this.node.querySelector('input');
		inputEl.value = value;
	}
});

/**
 * @class UITextarea
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 * @classdesc
 *
 * 多行文本域输入控件，封装了 HTML `<textarea>` 元素。
 * 支持只读模式、等宽字体、列数/行数、换行控制及占位符文本。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.Textarea`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `Textarea` 属性。
 *
 * @param {string} [value=null]
 * 文本域的初始内容。
 *
 * @param {LuCI.ui.Textarea.InitOptions} [options]
 * 描述控件专有配置的选项对象。
 *
 * @example
 * // 创建多行文本域（自动撑满宽度，8 行）
 * const ta = new ui.Textarea('默认内容', {
 *     rows: 8,
 *     placeholder: '请输入多行文本...'
 * });
 * document.body.appendChild(ta.render());
 *
 * @example
 * // 创建等宽字体只读文本域（常用于配置文件预览）
 * const preview = new ui.Textarea(configContent, {
 *     readonly: true,
 *     monospace: true,
 *     wrap: false
 * });
 * document.body.appendChild(preview.render());
 */
const UITextarea = UIElement.extend(/** @lends LuCI.ui.Textarea.prototype */ {
	/**
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.Textarea
	 *
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 的基础上，额外支持以下属性：
	 *
	 * @property {boolean} [readonly=false]
	 * 是否以只读模式渲染文本域。只读时用户无法编辑内容。
	 *
	 * @property {string} [placeholder]
	 * 文本域为空时显示的 HTML `placeholder` 占位符文本。
	 *
	 * @property {boolean} [monospace=false]
	 * 是否强制使用等宽字体（`monospace`）渲染文本域内容，
	 * 常用于代码或配置文件编辑场景。
	 *
	 * @property {number} [cols]
	 * 设置对应 `<textarea>` 的 HTML `cols` 属性（列数）。
	 * 未指定时文本域宽度默认为 100%。
	 *
	 * @property {number} [rows]
	 * 设置对应 `<textarea>` 的 HTML `rows` 属性（行数）。
	 *
	 * @property {boolean} [wrap=false]
	 * 是否启用文本自动换行。`true` 对应 `wrap="soft"`，`false` 对应 `wrap="off"`。
	 */

	/**
	 * 初始化文本域实例。
	 *
	 * @private
	 * @param {string} value - 文本域的初始内容
	 * @param {LuCI.ui.Textarea.InitOptions} options - 控件配置选项
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({
			optional: true,
			wrap: false,
			cols: null,
			rows: null
		}, options);
	},

	/**
	 * 渲染文本域并返回对应的 DOM 节点。
	 *
	 * 若未指定 `cols`，容器宽度自动设为 100%。
	 * 若 `monospace` 为 `true`，则对 `<textarea>` 强制应用等宽字体。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的容器 `<div>` DOM 节点。
	 *
	 * @example
	 * const node = new ui.Textarea('line1\nline2', { rows: 5 }).render();
	 * document.body.appendChild(node);
	 */
	render() {
		const style = !this.options.cols ? 'width:100%' : null;
		const frameEl = E('div', { 'id': this.options.id, 'style': style });
		const value = (this.value != null) ? String(this.value) : '';

		frameEl.appendChild(E('textarea', {
			'id': this.options.id ? `widget.${this.options.id}` : null,
			'name': this.options.name,
			'class': 'cbi-input-textarea',
			'readonly': this.options.readonly ? '' : null,
			'disabled': this.options.disabled ? '' : null,
			'placeholder': this.options.placeholder,
			'style': style,
			'cols': this.options.cols,
			'rows': this.options.rows,
			'wrap': this.options.wrap ? 'soft' : 'off'
		}, [ value ]));

		if (this.options.monospace)
			frameEl.firstElementChild.style.fontFamily = 'monospace';

		return this.bind(frameEl);
	},

	/**
	 * 将控件实例绑定到已渲染的 DOM 节点并注册事件监听器。
	 *
	 * 此方法在 `render()` 内部调用，完成以下操作：
	 * - 保存根节点引用到 `this.node`
	 * - 为 `<textarea>` 注册 `keyup`/`blur` 为更新事件，`change` 为变更事件
	 * - 将类实例绑定到 DOM 节点
	 *
	 * @private
	 * @param {HTMLElement} frameEl - 控件的容器 DOM 节点
	 * @returns {HTMLElement} 传入的 `frameEl`，便于链式调用
	 */
	bind(frameEl) {
		const inputEl = frameEl.firstElementChild;

		this.node = frameEl;

		this.setUpdateEvents(inputEl, 'keyup', 'blur');
		this.setChangeEvents(inputEl, 'change');

		dom.bindClassInstance(frameEl, this);

		return frameEl;
	},

	/**
	 * 读取 `<textarea>` 元素的当前内容。
	 *
	 * @override
	 * @returns {string} 文本域的当前文本内容。
	 *
	 * @example
	 * const content = textareaWidget.getValue();
	 */
	getValue() {
		return this.node.firstElementChild.value;
	},

	/**
	 * 设置 `<textarea>` 元素的内容。
	 *
	 * @override
	 * @param {string} value - 要设置的新内容
	 *
	 * @example
	 * textareaWidget.setValue('第一行\n第二行\n第三行');
	 */
	setValue(value) {
		this.node.firstElementChild.value = value;
	}
});

/**
 * @class UICheckbox
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 * @classdesc
 *
 * 复选框输入控件，封装了 HTML `<input type="checkbox">` 元素。
 * 支持自定义选中/未选中时对应的字符串值、隐藏字段名称及
 * 可选的提示图标（tooltip）。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.Checkbox`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `Checkbox` 属性。
 *
 * @param {string} [value=null]
 * 复选框的初始值，与 `value_enabled` 相等时视为选中状态。
 *
 * @param {LuCI.ui.Checkbox.InitOptions} [options]
 * 描述控件专有配置的选项对象。
 *
 * @example
 * // 创建默认复选框（选中值="1"，未选中值="0"）
 * const cb = new ui.Checkbox('1');
 * document.body.appendChild(cb.render());
 * console.log(cb.isChecked()); // true
 *
 * @example
 * // 创建自定义值的复选框
 * const cb = new ui.Checkbox('yes', {
 *     value_enabled: 'yes',
 *     value_disabled: 'no',
 *     tooltip: '启用此功能可能影响性能'
 * });
 * document.body.appendChild(cb.render());
 */
const UICheckbox = UIElement.extend(/** @lends LuCI.ui.Checkbox.prototype */ {
	/**
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.Checkbox
	 *
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 的基础上，额外支持以下属性：
	 *
	 * @property {string} [value_enabled=1]
	 * 复选框被选中时对应的字符串值，默认为 `'1'`。
	 *
	 * @property {string} [value_disabled=0]
	 * 复选框未被选中时对应的字符串值，默认为 `'0'`。
	 *
	 * @property {string} [hiddenname]
	 * 隐藏 `<input type="hidden">` 字段的 HTML `name` 属性值。
	 * 此为兼容性遗留属性，用于支持基于 HTML 表单提交的场景。
	 *
	 * @property {string} [tooltip]
	 * 当设置此属性时，复选框旁边会显示一个带有提示文本的图标。
	 * 提示文本内容即为此属性的值。
	 *
	 * @property {string} [tooltipicon]
	 * 自定义提示图标字符，默认为警告图标（⚠️）。
	 */

	/**
	 * 初始化复选框实例。
	 *
	 * @private
	 * @param {string} value - 复选框的初始值
	 * @param {LuCI.ui.Checkbox.InitOptions} options - 控件配置选项
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({
			value_enabled: '1',
			value_disabled: '0'
		}, options);
	},

	/**
	 * 渲染复选框并返回对应的 DOM 节点。
	 *
	 * 生成包含 `<input type="checkbox">` 和对应 `<label>` 的容器 `<div>`。
	 * 若配置了 `hiddenname`，还会插入隐藏字段。
	 * 若配置了 `tooltip`，还会在旁边渲染提示图标容器。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的容器 `<div>` DOM 节点。
	 *
	 * @example
	 * const node = new ui.Checkbox('1', { tooltip: '请注意此选项' }).render();
	 * document.body.appendChild(node);
	 */
	render() {
		const id = 'cb%08x'.format(Math.random() * 0xffffffff);
		const frameEl = E('div', {
			'id': this.options.id,
			'class': 'cbi-checkbox'
		});

		if (this.options.hiddenname)
			frameEl.appendChild(E('input', {
				'type': 'hidden',
				'name': this.options.hiddenname,
				'value': 1
			}));

		frameEl.appendChild(E('input', {
			'id': id,
			'name': this.options.name,
			'type': 'checkbox',
			'value': this.options.value_enabled,
			'checked': (this.value == this.options.value_enabled) ? '' : null,
			'disabled': this.options.disabled ? '' : null,
			'data-widget-id': this.options.id ? `widget.${this.options.id}` : null
		}));

		frameEl.appendChild(E('label', { 'for': id }));

		if (this.options.tooltip != null) {
			let icon = "⚠️";

			if (this.options.tooltipicon != null)
				icon = this.options.tooltipicon;

			frameEl.appendChild(
				E('label', { 'class': 'cbi-tooltip-container' },[
					icon,
					E('div', { 'class': 'cbi-tooltip' },
						this.options.tooltip
					)
				])
			);
		}

		return this.bind(frameEl);
	},

	/**
	 * 将控件实例绑定到已渲染的 DOM 节点并注册事件监听器。
	 *
	 * 此方法在 `render()` 内部调用，完成以下操作：
	 * - 保存根节点引用到 `this.node`
	 * - 为 `<input type="checkbox">` 注册 `click`/`blur` 为更新事件，`change` 为变更事件
	 * - 将类实例绑定到 DOM 节点
	 *
	 * @private
	 * @param {HTMLElement} frameEl - 控件的容器 DOM 节点
	 * @returns {HTMLElement} 传入的 `frameEl`，便于链式调用
	 */
	bind(frameEl) {
		this.node = frameEl;

		const input = frameEl.querySelector('input[type="checkbox"]');
		this.setUpdateEvents(input, 'click', 'blur');
		this.setChangeEvents(input, 'change');

		dom.bindClassInstance(frameEl, this);

		return frameEl;
	},

	/**
	 * 检查复选框当前是否处于选中状态。
	 *
	 * @instance
	 * @memberof LuCI.ui.Checkbox
	 * @returns {boolean}
	 * 复选框当前选中时返回 `true`，未选中时返回 `false`。
	 *
	 * @example
	 * if (checkbox.isChecked()) {
	 *     console.log('已启用');
	 * }
	 */
	isChecked() {
		return this.node.querySelector('input[type="checkbox"]').checked;
	},

	/**
	 * 读取复选框当前对应的字符串值。
	 *
	 * 选中时返回 `options.value_enabled`，未选中时返回 `options.value_disabled`。
	 *
	 * @override
	 * @returns {string} 当前状态对应的字符串值。
	 *
	 * @example
	 * const val = checkbox.getValue(); // 选中时返回 '1'，未选中返回 '0'
	 */
	getValue() {
		return this.isChecked()
			? this.options.value_enabled
			: this.options.value_disabled;
	},

	/**
	 * 根据传入值设置复选框的选中状态。
	 *
	 * 若 `value` 等于 `options.value_enabled` 则选中，否则取消选中。
	 *
	 * @override
	 * @param {string} value - 要设置的值（与 `value_enabled` 比较决定是否选中）
	 *
	 * @example
	 * checkbox.setValue('1'); // 选中
	 * checkbox.setValue('0'); // 取消选中
	 */
	setValue(value) {
		this.node.querySelector('input[type="checkbox"]').checked = (value == this.options.value_enabled);
	}
});

/**
 * @class UISelect
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 * @classdesc
 *
 * 选择控件，根据配置渲染为 HTML `<select>` 下拉框，
 * 或一组复选框（`<input type="checkbox">`）/单选按钮（`<input type="radio">`）。
 *
 * 当 `multiple` 为 `false` 且 `widget` 为 `'select'` 时，渲染为单选下拉框；
 * 当 `multiple` 为 `true` 且 `widget` 为 `'select'` 时，渲染为多选下拉框；
 * 当 `widget` 为 `'individual'` 时，根据 `multiple` 渲染为单选按钮组或复选框组。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.Select`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `Select` 属性。
 *
 * @param {string|string[]} [value=null]
 * 初始选中的值（单选为字符串，多选为字符串数组）。
 *
 * @param {Object<string, string>} choices
 * 可选项对象。键为选项的提交值，值为显示标签文本。
 *
 * @param {LuCI.ui.Select.InitOptions} [options]
 * 描述控件专有配置的选项对象。
 *
 * @example
 * // 渲染为 <select> 下拉框
 * const sel = new ui.Select('option2', {
 *     option1: '选项一',
 *     option2: '选项二',
 *     option3: '选项三'
 * }, { widget: 'select' });
 * document.body.appendChild(sel.render());
 *
 * @example
 * // 渲染为水平排列的单选按钮组
 * const radio = new ui.Select('b', { a: '苹果', b: '香蕉', c: '橙子' }, {
 *     widget: 'individual',
 *     multiple: false,
 *     orientation: 'horizontal'
 * });
 * document.body.appendChild(radio.render());
 */
const UISelect = UIElement.extend(/** @lends LuCI.ui.Select.prototype */ {
	/**
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.Select
	 *
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 的基础上，额外支持以下属性：
	 *
	 * @property {boolean} [multiple=false]
	 * 是否允许同时选中多个选项。
	 *
	 * @property {"select"|"individual"} [widget=select]
	 * 控件渲染类型。`'select'` 使用 HTML `<select>` 元素；
	 * `'individual'` 使用一组单选按钮（`radio`）或复选框（`checkbox`）。
	 *
	 * @property {string} [orientation=horizontal]
	 * 仅在 `widget` 为 `'individual'` 时有效。
	 * 设置单选/复选按钮组的排列方向：`'horizontal'`（水平）或 `'vertical'`（垂直）。
	 *
	 * @property {boolean|string[]} [sort=false]
	 * 是否对选项排序。`true` 按字母顺序排序；传入字符串数组则按数组顺序排列。
	 *
	 * @property {number} [size]
	 * 仅在 `widget` 为 `'select'` 时有效，设置 `<select>` 的 `size` 属性
	 *（可见行数）。
	 *
	 * @property {string} [placeholder=-- Please choose --]
	 * 仅在 `widget` 为 `'select'` 且 `optional` 为 `true` 时有效，
	 * 为空选项显示的提示文本。
	 */

	/**
	 * 初始化选择控件实例。
	 *
	 * @private
	 * @param {string|string[]} value - 初始选中值
	 * @param {Object<string, string>} choices - 可选项对象
	 * @param {LuCI.ui.Select.InitOptions} options - 控件配置选项
	 */
	__init__(value, choices, options) {
		if (!L.isObject(choices))
			choices = {};

		if (!Array.isArray(value))
			value = (value != null && value != '') ? [ value ] : [];

		if (!options.multiple && value.length > 1)
			value.length = 1;

		this.values = value;
		this.choices = choices;
		this.options = Object.assign({
			multiple: false,
			widget: 'select',
			orientation: 'horizontal'
		}, options);

		if (this.choices.hasOwnProperty(''))
			this.options.optional = true;
	},

	/**
	 * 渲染选择控件并返回对应的 DOM 节点。
	 *
	 * 根据 `options.widget` 的值决定渲染为 `<select>` 或单选/复选按钮组。
	 * 若 `options.sort` 为 `true`，选项按字母自然顺序排序；
	 * 若为数组，则按数组定义的顺序排列选项。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的容器 `<div>` DOM 节点。
	 *
	 * @example
	 * const node = new ui.Select('a', { a: '选项A', b: '选项B' }).render();
	 * document.body.appendChild(node);
	 */
	render() {
		const frameEl = E('div', { 'id': this.options.id });
		let keys = Object.keys(this.choices);

		if (this.options.sort === true)
			keys.sort(L.naturalCompare);
		else if (Array.isArray(this.options.sort))
			keys = this.options.sort;

		if (this.options.widget != 'radio' && this.options.widget != 'checkbox') {
			frameEl.appendChild(E('select', {
				'id': this.options.id ? `widget.${this.options.id}` : null,
				'name': this.options.name,
				'size': this.options.size,
				'class': 'cbi-input-select',
				'multiple': this.options.multiple ? '' : null,
				'disabled': this.options.disabled ? '' : null
			}));

			if (this.options.optional)
				frameEl.lastChild.appendChild(E('option', {
					'value': '',
					'selected': (this.values.length == 0 || this.values[0] == '') ? '' : null
				}, [ this.choices[''] ?? this.options.placeholder ?? _('-- Please choose --') ]));

			for (let i = 0; i < keys.length; i++) {
				if (keys[i] == null || keys[i] == '')
					continue;

				frameEl.lastChild.appendChild(E('option', {
					'value': keys[i],
					'selected': (this.values.indexOf(keys[i]) > -1) ? '' : null
				}, [ this.choices[keys[i]] ?? keys[i] ]));
			}
		}
		else {
			const brEl = (this.options.orientation === 'horizontal') ? document.createTextNode(' \xa0 ') : E('br');

			for (let i = 0; i < keys.length; i++) {
				frameEl.appendChild(E('span', {
					'class': 'cbi-%s'.format(this.options.multiple ? 'checkbox' : 'radio')
				}, [
					E('input', {
						'id': this.options.id ? 'widget.%s.%d'.format(this.options.id, i) : null,
						'name': this.options.id ?? this.options.name,
						'type': this.options.multiple ? 'checkbox' : 'radio',
						'class': this.options.multiple ? 'cbi-input-checkbox' : 'cbi-input-radio',
						'value': keys[i],
						'checked': (this.values.indexOf(keys[i]) > -1) ? '' : null,
						'disabled': this.options.disabled ? '' : null
					}),
					E('label', { 'for': this.options.id ? 'widget.%s.%d'.format(this.options.id, i) : null }),
					E('span', {
						'click': function(ev) {
							ev.currentTarget.previousElementSibling.previousElementSibling.click();
						}
					}, [ this.choices[keys[i]] ?? keys[i] ])
				]));

				frameEl.appendChild(brEl.cloneNode());
			}
		}

		return this.bind(frameEl);
	},

	/**
	 * 将控件实例绑定到已渲染的 DOM 节点并注册事件监听器。
	 *
	 * 对于 `<select>` 类型，在 `select` 元素上注册事件；
	 * 对于单选/复选按钮组，逐一在每个 `<input type="radio">` 上注册事件。
	 *
	 * @private
	 * @param {HTMLElement} frameEl - 控件的容器 DOM 节点
	 * @returns {HTMLElement} 传入的 `frameEl`，便于链式调用
	 */
	bind(frameEl) {
		this.node = frameEl;

		if (this.options.widget != 'radio' && this.options.widget != 'checkbox') {
			this.setUpdateEvents(frameEl.firstChild, 'change', 'click', 'blur');
			this.setChangeEvents(frameEl.firstChild, 'change');
		}
		else {
			const radioEls = frameEl.querySelectorAll('input[type="radio"]');
			for (let i = 0; i < radioEls.length; i++) {
				this.setUpdateEvents(radioEls[i], 'change', 'click', 'blur');
				this.setChangeEvents(radioEls[i], 'change', 'click', 'blur');
			}
		}

		dom.bindClassInstance(frameEl, this);

		return frameEl;
	},

	/**
	 * 读取当前选中的值。
	 *
	 * 对于 `<select>` 元素，返回当前选中 `<option>` 的值；
	 * 对于单选按钮组，返回当前选中 `<input type="radio">` 的值；
	 * 若无选中项则返回 `null`。
	 *
	 * @override
	 * @returns {string|null} 当前选中的值，或无选中时的 `null`。
	 *
	 * @example
	 * const val = selectWidget.getValue(); // 例如 'option2'
	 */
	getValue() {
		if (this.options.widget != 'radio' && this.options.widget != 'checkbox')
			return this.node.firstChild.value;

		const radioEls = this.node.querySelectorAll('input[type="radio"]');
		for (let i = 0; i < radioEls.length; i++)
			if (radioEls[i].checked)
				return radioEls[i].value;

		return null;
	},

	/**
	 * 设置选择控件的选中值。
	 *
	 * 对于 `<select>` 元素，遍历所有 `<option>` 并设置匹配项的 `selected` 属性；
	 * 对于单选按钮组，遍历所有 `<input type="radio">` 并设置匹配项的 `checked` 属性。
	 *
	 * @override
	 * @param {string} value - 要选中的值
	 *
	 * @example
	 * selectWidget.setValue('option3');
	 */
	setValue(value) {
		if (this.options.widget != 'radio' && this.options.widget != 'checkbox') {
			if (value == null)
				value = '';

			for (let i = 0; i < this.node.firstChild.options.length; i++)
				this.node.firstChild.options[i].selected = (this.node.firstChild.options[i].value == value);

			return;
		}

		const radioEls = frameEl.querySelectorAll('input[type="radio"]');
		for (let i = 0; i < radioEls.length; i++)
			radioEls[i].checked = (radioEls[i].value == value);
	}
});

/**
 * @class UIDropdown
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 * @classdesc
 *
 * 富样式下拉选择控件，支持非纯文本选项标签（可含 HTML/DOM 节点）、
 * 多选模式、自定义输入、选项排序及触摸设备优化等功能。
 *
 * 与原生 `<select>` 不同，`Dropdown` 使用自定义 DOM 结构实现，
 * 可在折叠状态显示多个已选项预览，并支持通过输入框添加自定义选项。
 *
 * UI 控件实例通常不由视图代码直接创建，而是由 `LuCI.form` 在
 * 实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。
 * 在视图中使用：`'require ui'`，引用 `ui.Dropdown`；
 * 在外部 JS 中使用：`L.require("ui").then(...)` 后访问 `Dropdown` 属性。
 *
 * @param {string|string[]} [value=null]
 * 初始选中的值。传入数组时默认启用多选模式。
 *
 * @param {Object<string, *>} choices
 * 可选项对象。键为选项的提交值，值为显示内容（字符串或 DOM 节点）。
 *
 * @param {LuCI.ui.Dropdown.InitOptions} [options]
 * 描述控件专有配置的选项对象。
 *
 * @example
 * // 创建单选下拉框
 * const dd = new ui.Dropdown('opt2', {
 *     opt1: '选项一',
 *     opt2: '选项二',
 *     opt3: '选项三'
 * }, { optional: false });
 * document.body.appendChild(dd.render());
 *
 * @example
 * // 创建可自定义输入的多选下拉框
 * const multi = new ui.Dropdown(['tag1', 'tag2'], {
 *     tag1: '标签一',
 *     tag2: '标签二'
 * }, {
 *     multiple: true,
 *     create: true,
 *     display_items: 2
 * });
 * document.body.appendChild(multi.render());
 */
const UIDropdown = UIElement.extend(/** @lends LuCI.ui.Dropdown.prototype */ {
	/**
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.Dropdown
	 *
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 的基础上，额外支持以下属性：
	 *
	 * @property {boolean} [optional=true]
	 * 是否允许空选择。与其他控件不同，`Dropdown` 的 `optional` 含义为：
	 * `false` 时单选下拉框不提供空占位选项，多选时不允许取消全部已选项。
	 *
	 * @property {boolean} [multiple]
	 * 是否允许多选。当构造函数传入数组类型的 `value` 时，默认为 `true`。
	 *
	 * @property {boolean|string[]} [sort=false]
	 * 是否对选项排序。`true` 按字母自然顺序排序；传入字符串数组则按数组顺序排列。
	 *
	 * @property {string} [select_placeholder=-- Please choose --]
	 * 无选中项时在折叠状态显示的占位文本。
	 *
	 * @property {string} [custom_placeholder=-- custom --]
	 * 自定义输入框（`create` 启用时）的占位符文本。
	 *
	 * @property {boolean} [create=false]
	 * 是否允许用户输入自定义选项值。启用后，下拉列表末尾显示文本输入框。
	 *
	 * @property {string} [create_query=.create-item-input]
	 * 用于定位自定义输入框的 CSS 选择器。通常不需要修改。
	 *
	 * @property {string} [create_template=script[type="item-template"]]
	 * 用于定位新增选项 HTML 模板元素的 CSS 选择器。
	 * 模板中的 `{{value}}` 占位符会被替换为用户输入的值。
	 * 含 `data-label-placeholder` 属性的子元素会被替换为对应标签。
	 * 若未找到模板元素，默认使用
	 * `<li data-value="{{value}}"><span data-label-placeholder="true" /></li>`。
	 *
	 * @property {string} [create_markup]
	 * 直接以字符串形式指定新增选项的 HTML 模板，优先于 `create_template`。
	 *
	 * @property {number} [display_items=3]
	 * 折叠状态下最多显示的已选项标签数量。超出部分以 `···` 表示。
	 * 仅在多选模式下有效。
	 *
	 * @property {number} [dropdown_items=-1]
	 * 下拉列表展开时最多显示的选项数量。`-1` 表示尽量显示全部，
	 * 超出可视区域时才启用滚动。
	 *
	 * @property {string} [placeholder]
	 * `select_placeholder` 和 `custom_placeholder` 的快捷设置，
	 * 两者未单独指定时均回退到此值。
	 *
	 * @property {boolean} [readonly=false]
	 * 是否将自定义输入框设为只读。仅在 `create` 为 `true` 时有效。
	 *
	 * @property {number} [maxlength]
	 * 自定义输入框的最大字符数（HTML `maxlength` 属性）。
	 * 建议优先使用验证表达式 `maxlength(N)`，此属性为兼容性遗留属性。
	 * 仅在 `create` 为 `true` 时有效。
	 */

	/**
	 * 初始化下拉控件实例。
	 *
	 * @private
	 * @param {string|string[]} value - 初始选中值（数组时自动启用多选）
	 * @param {Object<string, *>} choices - 可选项对象
	 * @param {LuCI.ui.Dropdown.InitOptions} options - 控件配置选项
	 */
	__init__(value, choices, options) {
		if (typeof(choices) != 'object')
			choices = {};

		if (!Array.isArray(value))
			this.values = (value != null && value != '') ? [ value ] : [];
		else
			this.values = value;

		this.choices = choices;
		this.options = Object.assign({
			sort:               true,
			multiple:           Array.isArray(value),
			optional:           true,
			select_placeholder: _('-- Please choose --'),
			custom_placeholder: _('-- custom --'),
			display_items:      3,
			dropdown_items:     -1,
			create:             false,
			create_query:       '.create-item-input',
			create_template:    'script[type="item-template"]'
		}, options);
	},

	/**
	 * 渲染下拉控件并返回对应的 DOM 节点。
	 *
	 * 构建 `<div class="cbi-dropdown">` 容器，内含 `<ul>` 选项列表。
	 * 若启用了 `create`，还会在列表末尾追加自定义输入框 `<li>`。
	 * 若配置了 `create_markup`，还会插入 `<script type="item-template">` 模板。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的 `.cbi-dropdown` 容器 DOM 节点。
	 *
	 * @example
	 * const node = new ui.Dropdown('val1', { val1: '选项一', val2: '选项二' }).render();
	 * document.body.appendChild(node);
	 */
	render() {
		const sb = E('div', {
			'id': this.options.id,
			'class': 'cbi-dropdown',
			'multiple': this.options.multiple ? '' : null,
			'optional': this.options.optional ? '' : null,
			'disabled': this.options.disabled ? '' : null,
			'tabindex': -1
		}, E('ul'));

		let keys = Object.keys(this.choices);

		if (this.options.sort === true)
			keys.sort(L.naturalCompare);
		else if (Array.isArray(this.options.sort))
			keys = this.options.sort;

		if (this.options.create)
			for (let i = 0; i < this.values.length; i++)
				if (!this.choices.hasOwnProperty(this.values[i]))
					keys.push(this.values[i]);

		for (let i = 0; i < keys.length; i++) {
			let label = this.choices[keys[i]];

			if (dom.elem(label))
				label = label.cloneNode(true);

			sb.lastElementChild.appendChild(E('li', {
				'data-value': keys[i],
				'selected': (this.values.indexOf(keys[i]) > -1) ? '' : null
			}, [ label ?? keys[i] ]));
		}

		if (this.options.create) {
			const createEl = E('input', {
				'type': 'text',
				'class': 'create-item-input',
				'readonly': this.options.readonly ? '' : null,
				'maxlength': this.options.maxlength,
				'placeholder': this.options.custom_placeholder ?? this.options.placeholder,
				'inputmode': 'text',
				'enterkeyhint': 'done'
			});

			if (this.options.datatype || this.options.validate)
				UI.prototype.addValidator(createEl, this.options.datatype ?? 'string',
				                          true, this.options.validate, 'blur', 'keyup');

			sb.lastElementChild.appendChild(E('li', { 'data-value': '-' }, createEl));
		}

		if (this.options.create_markup)
			sb.appendChild(E('script', { type: 'item-template' },
				this.options.create_markup));

		return this.bind(sb);
	},

	/**
	 * 将下拉控件实例绑定到已渲染的 DOM 节点，
	 * 从 DOM 属性同步配置，初始化显示状态，并注册所有必要的事件监听器。
	 *
	 * 主要完成以下工作：
	 * - 从 DOM 属性（`multiple`、`optional`、`display-items` 等）覆写选项
	 * - 处理多选模式下已选项的 `display` 标记（最多显示 `display_items` 个）
	 * - 处理单选模式下的默认选中项及空占位选项
	 * - 保存值到隐藏字段（`saveValues`）
	 * - 注册 `click`、`keydown`、`cbi-dropdown-close` 等事件处理器
	 * - 对触摸设备和非触摸设备分别注册不同的全局关闭事件
	 * - 为自定义输入框注册 `keydown`、`focus`、`blur` 事件处理器
	 *
	 * @private
	 * @param {HTMLElement} sb - `.cbi-dropdown` 容器 DOM 节点
	 * @returns {HTMLElement} 传入的 `sb`，便于链式调用
	 */
	bind(sb) {
		const o = this.options;

		o.multiple = sb.hasAttribute('multiple');
		o.optional = sb.hasAttribute('optional');
		o.placeholder = sb.getAttribute('placeholder') ?? o.placeholder;
		o.display_items = parseInt(sb.getAttribute('display-items') ?? o.display_items);
		o.dropdown_items = parseInt(sb.getAttribute('dropdown-items') ?? o.dropdown_items);
		o.create_query = sb.getAttribute('item-create') ?? o.create_query;
		o.create_template = sb.getAttribute('item-template') ?? o.create_template;

		const ul = sb.querySelector('ul');
		const more = sb.appendChild(E('span', { class: 'more', tabindex: -1 }, '···'));
		const open = sb.appendChild(E('span', { class: 'open', tabindex: -1 }, '▾'));
		const canary = sb.appendChild(E('div'));
		const create = sb.querySelector(this.options.create_query);
		let ndisplay = this.options.display_items;
		let n = 0;

		if (this.options.multiple) {
			let items = ul.querySelectorAll('li');

			for (let i = 0; i < items.length; i++) {
				this.transformItem(sb, items[i]);

				if (items[i].hasAttribute('selected') && ndisplay-- > 0)
					items[i].setAttribute('display', n++);
			}
		}
		else {
			if (this.options.optional && !ul.querySelector('li[data-value=""]')) {
				const placeholder = E('li', { placeholder: '' },
					this.options.select_placeholder ?? this.options.placeholder);

				ul.firstChild
					? ul.insertBefore(placeholder, ul.firstChild)
					: ul.appendChild(placeholder);
			}

			let items = ul.querySelectorAll('li');
			const sel = sb.querySelectorAll('[selected]');

			sel.forEach(s => {
				s.removeAttribute('selected');
			});

			const s = sel[0] ?? items[0];
			if (s) {
				s.setAttribute('selected', '');
				s.setAttribute('display', n++);
			}

			ndisplay--;
		}

		this.saveValues(sb, ul);

		ul.setAttribute('tabindex', -1);
		sb.setAttribute('tabindex', 0);

		if (ndisplay < 0)
			sb.setAttribute('more', '')
		else
			sb.removeAttribute('more');

		if (ndisplay == this.options.display_items)
			sb.setAttribute('empty', '')
		else
			sb.removeAttribute('empty');

		dom.content(more, (ndisplay == this.options.display_items)
			? (this.options.select_placeholder ?? this.options.placeholder) : '···');


		sb.addEventListener('click', this.handleClick.bind(this));
		sb.addEventListener('keydown', this.handleKeydown.bind(this));
		sb.addEventListener('cbi-dropdown-close', this.handleDropdownClose.bind(this));
		sb.addEventListener('cbi-dropdown-select', this.handleDropdownSelect.bind(this));

		if ('ontouchstart' in window) {
			sb.addEventListener('touchstart', ev => ev.stopPropagation());
			window.addEventListener('touchstart', this.closeAllDropdowns);
		}
		else {
			sb.addEventListener('focus', this.handleFocus.bind(this));

			canary.addEventListener('focus', this.handleCanaryFocus.bind(this));

			window.addEventListener('click', this.closeAllDropdowns);
		}

		if (create) {
			create.addEventListener('keydown', this.handleCreateKeydown.bind(this));
			create.addEventListener('focus', this.handleCreateFocus.bind(this));
			create.addEventListener('blur', this.handleCreateBlur.bind(this));

			const li = findParent(create, 'li');

			li.setAttribute('unselectable', '');
			li.addEventListener('click', this.handleCreateClick.bind(this));
		}

		this.node = sb;

		this.setUpdateEvents(sb, 'cbi-dropdown-open', 'cbi-dropdown-close');
		this.setChangeEvents(sb, 'cbi-dropdown-change', 'cbi-dropdown-close');

		dom.bindClassInstance(sb, this);

		return sb;
	},

	/**
	 * 向上遍历 DOM 树，查找第一个具有滚动能力的父节点。
	 *
	 * 用于在展开下拉列表时正确定位列表位置，避免被裁剪。
	 * 若元素为 `position: fixed`，直接返回 `document.body`。
	 * 若为 `position: absolute`，跳过 `position: static` 的父节点。
	 *
	 * @private
	 * @param {HTMLElement} element - 起始元素
	 * @returns {HTMLElement} 第一个具有滚动溢出样式的父元素，或 `document.body`。
	 *
	 * @example
	 * const scrollParent = this.getScrollParent(this.node);
	 * // 用于后续计算可视区域高度
	 */
	getScrollParent(element) {
		let parent = element;
		let style = getComputedStyle(element);
		const excludeStaticParent = (style.position === 'absolute');

		if (style.position === 'fixed')
			return document.body;

		while ((parent = parent.parentElement) != null) {
			style = getComputedStyle(parent);

			if (excludeStaticParent && style.position === 'static')
				continue;

			if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX))
				return parent;
		}

		return document.body;
	},

	/**
	 * 展开下拉列表，计算最佳展示位置并设置相关样式。
	 *
	 * 展开逻辑：
	 * 1. 先关闭所有其他已展开的下拉框。
	 * 2. 在容器上设置 `open` 属性。
	 * 3. 触摸设备：全屏居中展示，并平滑滚动父容器使下拉框可见。
	 * 4. 非触摸设备：在下一帧计算上方/下方可用空间，优先向下展开，
	 *    空间不足时向上展开；同时根据 `dropdown_items` 限制最大高度。
	 * 5. 多选时启用已选项复选框，若仅剩一项且非 `optional`，禁用该复选框。
	 * 6. 克隆 `<ul>` 作为预览节点（`.preview`）插入 DOM。
	 *
	 * @private
	 * @param {HTMLElement} sb - `.cbi-dropdown` 容器 DOM 节点
	 */
	openDropdown(sb) {
		const st = window.getComputedStyle(sb, null);
		const ul = sb.querySelector('ul');
		const li = ul.querySelectorAll('li');
		const fl = findParent(sb, '.cbi-value-field');
		const sel = ul.querySelector('[selected]');
		const rect = sb.getBoundingClientRect();
		const items = Math.min(this.options.dropdown_items, li.length);
		const scrollParent = this.getScrollParent(sb);

		document.querySelectorAll('.cbi-dropdown[open]').forEach(s => {
			s.dispatchEvent(new CustomEvent('cbi-dropdown-close', {}));
		});

		sb.setAttribute('open', '');

		const pv = ul.cloneNode(true);
		pv.classList.add('preview');

		if (fl)
			fl.classList.add('cbi-dropdown-open');

		if ('ontouchstart' in window) {
			const vpWidth = Math.max(document.documentElement.clientWidth, window.innerWidth ?? 0);
			const vpHeight = Math.max(document.documentElement.clientHeight, window.innerHeight ?? 0);
			let start = null;

			ul.style.top = `${sb.offsetHeight}px`;
			ul.style.left = `${-rect.left}px`;
			ul.style.right = `${rect.right - vpWidth}px`;
			ul.style.maxHeight = `${vpHeight * 0.5}px`;
			ul.style.WebkitOverflowScrolling = 'touch';

			const scrollFrom = scrollParent.scrollTop;
			const scrollTo = scrollFrom + rect.top - vpHeight * 0.5;

			const scrollStep = timestamp => {
				if (!start) {
					start = timestamp;
					ul.scrollTop = sel ? Math.max(sel.offsetTop - sel.offsetHeight, 0) : 0;
				}

				const duration = Math.max(timestamp - start, 1);
				if (duration < 100) {
					scrollParent.scrollTop = scrollFrom + (scrollTo - scrollFrom) * (duration / 100);
					window.requestAnimationFrame(scrollStep);
				}
				else {
					scrollParent.scrollTop = scrollTo;
				}
			};

			window.requestAnimationFrame(scrollStep);
		}
		else {
			ul.style.maxHeight = '1px';
			ul.style.top = ul.style.bottom = '';

			window.requestAnimationFrame(() => {
				const containerRect = scrollParent.getBoundingClientRect();
				const itemHeight = li[Math.max(0, li.length - 2)].getBoundingClientRect().height;
				let fullHeight = 0;
				const spaceAbove = rect.top - containerRect.top;
				const spaceBelow = containerRect.bottom - rect.bottom;

				for (let i = 0; i < (items == -1 ? li.length : items); i++)
					fullHeight += li[i].getBoundingClientRect().height;

				if (fullHeight <= spaceBelow) {
					ul.style.top = `${rect.height}px`;
					ul.style.maxHeight = `${spaceBelow}px`;
				}
				else if (fullHeight <= spaceAbove) {
					ul.style.bottom = `${rect.height}px`;
					ul.style.maxHeight = `${spaceAbove}px`;
				}
				else if (spaceBelow >= spaceAbove) {
					ul.style.top = `${rect.height}px`;
					ul.style.maxHeight = `${spaceBelow - (spaceBelow % itemHeight)}px`;
				}
				else {
					ul.style.bottom = `${rect.height}px`;
					ul.style.maxHeight = `${spaceAbove - (spaceAbove % itemHeight)}px`;
				}

				ul.scrollTop = sel ? Math.max(sel.offsetTop - sel.offsetHeight, 0) : 0;
			});
		}

		const cboxes = ul.querySelectorAll('[selected] input[type="checkbox"]');
		for (let i = 0; i < cboxes.length; i++) {
			cboxes[i].checked = true;
			cboxes[i].disabled = (cboxes.length == 1 && !this.options.optional);
		}

		ul.classList.add('dropdown');

		sb.insertBefore(pv, ul.nextElementSibling);
/**
 * @fileoverview LuCI UI 组件库 - UIDropdown 私有方法与 UICombobox 类
 * 本文件对应 ui.js 第1351~2050行的中文注释版本。
 * 包含 UIDropdown 的私有方法实现以及 UICombobox 的类定义。
 */

		li.forEach(l => {
			if (!l.hasAttribute('unselectable'))
				l.setAttribute('tabindex', 0);
		});

		sb.lastElementChild.setAttribute('tabindex', 0);

		const focusFn = L.bind((el) => {
			this.setFocus(sb, el, true);
			ul.removeEventListener('transitionend', focusFn);
		}, this, sel ?? li[0]);

		ul.addEventListener('transitionend', focusFn);
	},

	/**
	 * @private
	 * @method closeDropdown
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 关闭下拉菜单。将下拉列表收起，移除预览节点，清理相关 CSS 类和属性，
	 * 并在需要时将焦点归还给 sb 元素，最后调用 saveValues 保存当前选中值。
	 *
	 * @param {HTMLElement} sb - 下拉组件的根元素（`.cbi-dropdown`）
	 * @param {boolean} [no_focus=false] - 若为 `true` 则关闭后不自动聚焦到根元素
	 *
	 * @example
	 * // 关闭下拉框并将焦点归还
	 * this.closeDropdown(sb);
	 *
	 * @example
	 * // 关闭下拉框但不转移焦点（例如通过键盘 Esc 触发时）
	 * this.closeDropdown(sb, true);
	 */
	/** @private */
	closeDropdown(sb, no_focus) {
		if (!sb.hasAttribute('open'))
			return;

		const pv = sb.querySelector('ul.preview');
		const ul = sb.querySelector('ul.dropdown');
		const li = ul.querySelectorAll('li');
		const fl = findParent(sb, '.cbi-value-field');

		li.forEach(l => l.removeAttribute('tabindex'));
		sb.lastElementChild.removeAttribute('tabindex');

		sb.removeChild(pv);
		sb.removeAttribute('open');
		sb.style.width = sb.style.height = '';

		ul.classList.remove('dropdown');
		ul.style.top = ul.style.bottom = ul.style.maxHeight = '';

		if (fl)
			fl.classList.remove('cbi-dropdown-open');

		if (!no_focus)
			this.setFocus(sb, sb);

		this.saveValues(sb, ul);
	},

	/**
	 * @private
	 * @method toggleItem
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 切换某个列表项的选中状态。
	 * - 多选模式下：更新该项的 `selected` 属性与复选框状态，并刷新预览区域显示；
	 *   当已选数量达到 `display_items` 上限时，会显示"···"溢出提示。
	 * - 单选模式下：取消上一个选中项，选中当前项，并关闭下拉框。
	 * 最终调用 `saveValues` 持久化当前选择。
	 *
	 * @param {HTMLElement} sb         - 下拉组件根元素
	 * @param {HTMLElement} li         - 要切换状态的列表项 `<li>` 元素
	 * @param {boolean}    [force_state] - `true` 强制选中，`false` 强制取消，
	 *                                    `undefined` 则自动切换
	 *
	 * @example
	 * // 自动切换某个选项的选中状态
	 * this.toggleItem(sb, liElement);
	 *
	 * @example
	 * // 强制选中
	 * this.toggleItem(sb, liElement, true);
	 *
	 * @example
	 * // 强制取消选中
	 * this.toggleItem(sb, liElement, false);
	 */
	/** @private */
	toggleItem(sb, li, force_state) {
		const ul = li.parentNode;

		if (li.hasAttribute('unselectable'))
			return;

		if (this.options.multiple) {
			const cbox = li.querySelector('input[type="checkbox"]');
			const items = li.parentNode.querySelectorAll('li');
			const label = sb.querySelector('ul.preview');
			let sel = li.parentNode.querySelectorAll('[selected]').length;
			const more = sb.querySelector('.more');
			let ndisplay = this.options.display_items;
			let n = 0;

			if (li.hasAttribute('selected')) {
				if (force_state !== true) {
					if (sel > 1 || this.options.optional) {
						li.removeAttribute('selected');
						cbox.checked = cbox.disabled = false;
						sel--;
					}
					else {
						cbox.disabled = true;
					}
				}
			}
			else {
				if (force_state !== false) {
					li.setAttribute('selected', '');
					cbox.checked = true;
					cbox.disabled = false;
					sel++;
				}
			}

			while (label && label.firstElementChild)
				label.removeChild(label.firstElementChild);

			for (let i = 0; i < items.length; i++) {
				items[i].removeAttribute('display');
				if (items[i].hasAttribute('selected')) {
					if (ndisplay-- > 0) {
						items[i].setAttribute('display', n++);
						if (label)
							label.appendChild(items[i].cloneNode(true));
					}
					const c = items[i].querySelector('input[type="checkbox"]');
					if (c)
						c.disabled = (sel == 1 && !this.options.optional);
				}
			}

			if (ndisplay < 0)
				sb.setAttribute('more', '');
			else
				sb.removeAttribute('more');

			if (ndisplay === this.options.display_items)
				sb.setAttribute('empty', '');
			else
				sb.removeAttribute('empty');

			dom.content(more, (ndisplay === this.options.display_items)
				? (this.options.select_placeholder ?? this.options.placeholder) : '···');
		}
		else {
			let sel = li.parentNode.querySelector('[selected]');
			if (sel) {
				sel.removeAttribute('display');
				sel.removeAttribute('selected');
			}

			li.setAttribute('display', 0);
			li.setAttribute('selected', '');

			this.closeDropdown(sb);
		}

		this.saveValues(sb, ul);
	},

	/**
	 * @private
	 * @method transformItem
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 将一个普通的 `<li>` 元素转换为多选模式所需的结构：
	 * 在其内部包裹一个带有复选框的 `<form>` 元素和一个 `<label>` 标签，
	 * 原有子节点全部移入 `<label>` 中。
	 *
	 * 转换前：`<li>文本内容</li>`
	 * 转换后：
	 * ```html
	 * <li>
	 *   <form><input type="checkbox" tabindex="-1" /></form>
	 *   <label>文本内容</label>
	 * </li>
	 * ```
	 *
	 * @param {HTMLElement} sb - 下拉组件根元素（当前方法中未直接使用，保留以保持接口一致）
	 * @param {HTMLElement} li - 需要转换的列表项元素
	 *
	 * @example
	 * // 将列表项改造为多选结构
	 * this.transformItem(sb, liElement);
	 */
	/** @private */
	transformItem(sb, li) {
		const cbox = E('form', {}, E('input', { type: 'checkbox', tabindex: -1, onclick: 'event.preventDefault()' }));
		const label = E('label');

		while (li.firstChild)
			label.appendChild(li.firstChild);

		li.appendChild(cbox);
		li.appendChild(label);
	},

	/**
	 * @private
	 * @method saveValues
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 将当前所有已选中的列表项的值同步到隐藏的 `<input type="hidden">` 表单字段，
	 * 更新 `sb.value` 属性，并触发 `cbi-dropdown-change` 自定义事件通知外部监听者。
	 *
	 * 事件 `detail` 字段包含：
	 * - `instance`：当前 UIDropdown 实例
	 * - `element`：根元素 sb
	 * - `values`（多选）或 `value`（单选）：选中值数组或单个值对象
	 *
	 * @param {HTMLElement} sb - 下拉组件根元素
	 * @param {HTMLElement} ul - 包含所有列表项的 `<ul>` 元素
	 *
	 * @fires CustomEvent#cbi-dropdown-change
	 *
	 * @example
	 * // 在切换选项后保存并通知外部
	 * this.saveValues(sb, ul);
	 */
	/** @private */
	saveValues(sb, ul) {
		const sel = ul.querySelectorAll('li[selected]');
		const div = sb.lastElementChild;
		const name = this.options.name;
		let strval = '';
		const values = [];

		while (div.lastElementChild)
			div.removeChild(div.lastElementChild);

		sel.forEach(s => {
			if (s.hasAttribute('placeholder'))
				return;

			const v = {
				text: s.innerText,
				value: s.hasAttribute('data-value') ? s.getAttribute('data-value') : s.innerText,
				element: s
			};

			div.appendChild(E('input', {
				type: 'hidden',
				name: name,
				value: v.value
			}));

			values.push(v);

			strval += strval.length ? ` ${v.value}` : v.value;
		});

		const detail = {
			instance: this,
			element: sb
		};

		if (this.options.multiple)
			detail.values = values;
		else
			detail.value = values.length ? values[0] : null;

		sb.value = strval;

		sb.dispatchEvent(new CustomEvent('cbi-dropdown-change', {
			bubbles: true,
			detail: detail
		}));
	},

	/**
	 * @private
	 * @method setValues
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 根据传入的值映射对象，批量设置下拉框各选项的选中状态。
	 * - 若启用了 `create` 选项，会先通过 `createItems` 确保对应值的选项存在。
	 * - 多选模式：遍历所有带 `data-value` 属性的 `<li>`，按照 `values` 对象决定选中或取消。
	 * - 单选模式：先选中占位符（若有），再按 `values` 对象选中对应选项。
	 *
	 * @param {HTMLElement}           sb     - 下拉组件根元素
	 * @param {Object<string,boolean>|null} values
	 *   键为选项值、值为 `true` 的对象，表示需要选中的选项集合；
	 *   传入 `null` 或空对象表示清空所有选中。
	 *
	 * @example
	 * // 单选：选中值为 "wan" 的选项
	 * this.setValues(sb, { wan: true });
	 *
	 * @example
	 * // 多选：同时选中 "eth0" 和 "eth1"
	 * this.setValues(sb, { eth0: true, eth1: true });
	 *
	 * @example
	 * // 清空所有选中
	 * this.setValues(sb, null);
	 */
	/** @private */
	setValues(sb, values) {
		const ul = sb.querySelector('ul');

		if (this.options.create) {
			for (const value in values) {
				this.createItems(sb, value);

				if (!this.options.multiple)
					break;
			}
		}

		if (this.options.multiple) {
			const lis = ul.querySelectorAll('li[data-value]');
			for (let i = 0; i < lis.length; i++) {
				const value = lis[i].getAttribute('data-value');
				if (values === null || !(value in values))
					this.toggleItem(sb, lis[i], false);
				else
					this.toggleItem(sb, lis[i], true);
			}
		}
		else {
			const ph = ul.querySelector('li[placeholder]');
			if (ph)
				this.toggleItem(sb, ph);

			const lis = ul.querySelectorAll('li[data-value]');
			for (let i = 0; i < lis.length; i++) {
				const value = lis[i].getAttribute('data-value');
				if (values !== null && (value in values))
					this.toggleItem(sb, lis[i]);
			}
		}
	},

	/**
	 * @private
	 * @method setFocus
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 将焦点移至下拉列表中的指定元素，同时为该元素添加 `focus` CSS 类，
	 * 并移除其他所有元素上的 `focus` 类。
	 * 若下拉框处于"locked-in"状态（自定义输入框获得焦点时），则不执行任何操作。
	 * 当 `scroll` 为 `true` 时，会自动将父容器的滚动位置调整到目标元素处。
	 *
	 * @param {HTMLElement} sb     - 下拉组件根元素
	 * @param {HTMLElement} elem   - 需要获得焦点的目标元素
	 * @param {boolean}    [scroll=false] - 是否滚动父容器使目标元素可见
	 *
	 * @example
	 * // 将焦点移至某个列表项，不滚动
	 * this.setFocus(sb, liElement);
	 *
	 * @example
	 * // 将焦点移至某个列表项，并滚动到可视区域
	 * this.setFocus(sb, liElement, true);
	 */
	/** @private */
	setFocus(sb, elem, scroll) {
		if (sb.hasAttribute('locked-in'))
			return;

		sb.querySelectorAll('.focus').forEach(e => {
			e.classList.remove('focus');
		});

		elem.classList.add('focus');

		if (scroll)
			elem.parentNode.scrollTop = elem.offsetTop - elem.parentNode.offsetTop;

		elem.focus();
	},

	/**
	 * @private
	 * @method handleMouseout
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理下拉框的 `mouseout` 事件。
	 * 当鼠标移出已打开的下拉框时，移除所有 `.focus` 样式类，
	 * 并将焦点归还给 `<ul class="dropdown">` 元素，
	 * 避免焦点停留在某个列表项上。
	 *
	 * @param {MouseEvent} ev - 触发的鼠标离开事件对象
	 *
	 * @example
	 * sb.addEventListener('mouseout', this.handleMouseout.bind(this));
	 */
	/** @private */
	handleMouseout(ev) {
		const sb = ev.currentTarget;

		if (!sb.hasAttribute('open'))
			return;

		sb.querySelectorAll('.focus').forEach(e => {
			e.classList.remove('focus');
		});

		sb.querySelector('ul.dropdown').focus();
	},

	/**
	 * @private
	 * @method createChoiceElement
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 根据给定的值和标签文本创建一个新的下拉选项 `<li>` 元素。
	 * 会优先从页面上的模板元素（`this.options.create_template`）读取 HTML 骨架，
	 * 若无模板则使用默认格式。模板中的 `{{value}}` 占位符将被实际值替换，
	 * `[data-label-placeholder]` 节点将被标签内容替换。
	 * 多选模式下还会调用 `transformItem` 为元素附加复选框结构。
	 *
	 * @param {HTMLElement}         sb    - 下拉组件根元素（用于查找模板）
	 * @param {string}              value - 新选项的值（`data-value` 属性）
	 * @param {Node|string|Node[]}  [label] - 新选项的显示标签；若不传则从
	 *                                        `this.choices[value]` 取值，再退回使用 value 本身
	 * @returns {HTMLElement} 构建好的 `<li>` 元素
	 *
	 * @example
	 * // 创建一个值为 "custom_val"、标签为 "自定义选项" 的列表项
	 * const li = this.createChoiceElement(sb, 'custom_val', '自定义选项');
	 * ul.appendChild(li);
	 */
	/** @private */
	createChoiceElement(sb, value, label) {
		const tpl = sb.querySelector(this.options.create_template);
		let markup = null;

		if (tpl)
			markup = (tpl.textContent ?? tpl.innerHTML ?? tpl.firstChild.data).replace(/^<!--|--!?>$/g, '').trim();
		else
			markup = '<li data-value="{{value}}"><span data-label-placeholder="true" /></li>';

		const new_item = E(markup.replace(/{{value}}/g, '%h'.format(value)));
		const placeholder = new_item.querySelector('[data-label-placeholder]');

		if (placeholder) {
			const content = E('span', {}, label ?? this.choices[value] ?? [ value ]);

			while (content.firstChild)
				placeholder.parentNode.insertBefore(content.firstChild, placeholder);

			placeholder.parentNode.removeChild(placeholder);
		}

		if (this.options.multiple)
			this.transformItem(sb, new_item);

		if (!new_item.hasAttribute('unselectable'))
			new_item.setAttribute('tabindex', 0);

		return new_item;
	},

	/**
	 * @private
	 * @method createItems
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 根据输入字符串动态创建并插入新的下拉选项，同时将其设置为选中状态。
	 * - 单选模式：将 `value` 视为单个值处理，若原来存在 `[created]` 的临时选项则先移除。
	 * - 多选模式：按空白字符分割 `value`，批量插入多个选项。
	 * 若对应值的选项已存在于列表中，则直接复用，不重复创建。
	 * 每个创建（或复用）的选项都会被选中并聚焦。
	 *
	 * @param {HTMLElement} sb    - 下拉组件根元素
	 * @param {string}      value - 要创建/选中的值，多选模式下可用空格分隔多个值
	 *
	 * @example
	 * // 单选：创建并选中值 "my_custom_value"
	 * this.createItems(sb, 'my_custom_value');
	 *
	 * @example
	 * // 多选：同时创建并选中 "val1" 和 "val2"
	 * this.createItems(sb, 'val1 val2');
	 */
	/** @private */
	createItems(sb, value) {
		const sbox = this;
		let val = (value ?? '').trim();
		const ul = sb.querySelector('ul');

		if (!sbox.options.multiple)
			val = val.length ? [ val ] : [];
		else
			val = val.length ? val.split(/\s+/) : [];

		val.forEach(item => {
			let new_item = null;

			ul.childNodes.forEach(li => {
				if (li.getAttribute && li.getAttribute('data-value') === item)
					new_item = li;
			});

			if (!new_item) {
				new_item = sbox.createChoiceElement(sb, item);

				if (!sbox.options.multiple) {
					const old = ul.querySelector('li[created]');
					if (old)
						ul.removeChild(old);

					new_item.setAttribute('created', '');
				}

				new_item = ul.insertBefore(new_item, ul.lastElementChild);
			}

			sbox.toggleItem(sb, new_item, true);
			sbox.setFocus(sb, new_item, true);
		});
	},

	/**
	 * 移除下拉菜单中所有已存在的选项。
	 *
	 * 此方法会从控件中移除所有预设的下拉选项。若未传入 `reset_value`，
	 * 则会保留当前已选中的选项；若传入 `reset_value = true`，
	 * 则会同时取消选中并移除所有选项。
	 *
	 * @instance
	 * @memberof LuCI.ui.Dropdown
	 * @param {boolean} [reset_value=false]
	 * 若设为 `true`，则同时取消选中并移除已选中的选项，而不只是保留它们。
	 *
	 * @example
	 * // 仅清除未选中的选项，保留已选项
	 * dropdown.clearChoices();
	 *
	 * @example
	 * // 清除所有选项并重置选中状态
	 * dropdown.clearChoices(true);
	 */
	clearChoices(reset_value) {
		const ul = this.node.querySelector('ul');
		const lis = ul ? ul.querySelectorAll('li[data-value]') : [];
		const len = lis.length - (this.options.create ? 1 : 0);
		const val = reset_value ? null : this.getValue();

		for (let i = 0; i < len; i++) {
			const lival = lis[i].getAttribute('data-value');
			if (val == null ||
				(!this.options.multiple && val != lival) ||
				(this.options.multiple && val.indexOf(lival) == -1))
				ul.removeChild(lis[i]);
		}

		if (reset_value)
			this.setValues(this.node, {});
	},

	/**
	 * 向下拉菜单中添加新的选项。
	 *
	 * 此方法向已有的下拉菜单追加更多选项，会自动忽略已存在相同值的选项，
	 * 不会产生重复条目。
	 *
	 * @instance
	 * @memberof LuCI.ui.Dropdown
	 * @param {string[]} values
	 * 要添加到下拉控件的选项值数组。
	 *
	 * @param {Object<string, *>} labels
	 * 选项值到显示标签的映射对象。若某个值没有对应标签，则直接使用值本身作为标签文本。
	 * 标签内容可以是 {@link LuCI.dom#content} 所支持的任意有效值。
	 *
	 * @example
	 * // 添加两个网络接口选项
	 * dropdown.addChoices(['eth0', 'eth1'], {
	 *   eth0: '有线接口 0',
	 *   eth1: '有线接口 1'
	 * });
	 *
	 * @example
	 * // 添加选项，无自定义标签时使用值本身
	 * dropdown.addChoices(['br-lan', 'br-wan'], {});
	 */
	addChoices(values, labels) {
		const sb = this.node;
		const ul = sb.querySelector('ul');
		const lis = ul ? ul.querySelectorAll('li[data-value]') : [];

		if (!Array.isArray(values))
			values = L.toArray(values);

		if (!L.isObject(labels))
			labels = {};

		for (let i = 0; i < values.length; i++) {
			let found = false;

			for (let j = 0; j < lis.length; j++) {
				if (lis[j].getAttribute('data-value') === values[i]) {
					found = true;
					break;
				}
			}

			if (found)
				continue;

			ul.insertBefore(
				this.createChoiceElement(sb, values[i], labels[values[i]]),
				ul.lastElementChild);
		}
	},

	/**
	 * 关闭当前文档中所有已打开的下拉控件。
	 *
	 * 遍历页面上所有带 `open` 属性的 `.cbi-dropdown` 元素，
	 * 向每个元素派发 `cbi-dropdown-close` 自定义事件，触发其关闭逻辑。
	 *
	 * @instance
	 * @memberof LuCI.ui.Dropdown
	 *
	 * @example
	 * // 在打开新下拉框前，先关闭页面上其他所有打开的下拉框
	 * UIDropdown.prototype.closeAllDropdowns();
	 */
	closeAllDropdowns() {
		document.querySelectorAll('.cbi-dropdown[open]').forEach(s => {
			s.dispatchEvent(new CustomEvent('cbi-dropdown-close', {}));
		});
	},

	/**
	 * @private
	 * @method handleClick
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理下拉框的点击事件（`click`）。
	 * - 若下拉框未打开：点击非 `input` 元素时调用 `openDropdown` 展开菜单。
	 * - 若下拉框已打开：
	 *   - 点击 `.dropdown` 中的 `<li>` → 调用 `toggleItem` 切换选中状态；
	 *   - 点击 `.preview` 中的 `<li>` → 调用 `closeDropdown` 折叠菜单；
	 *   - 点击 `span.open` 或 `span.more` → 调用 `closeDropdown` 折叠菜单。
	 * 最终阻止事件默认行为和冒泡。
	 *
	 * @param {MouseEvent} ev - 触发的点击事件对象
	 *
	 * @example
	 * sb.addEventListener('click', this.handleClick.bind(this));
	 */
	/** @private */
	handleClick(ev) {
		const sb = ev.currentTarget;

		if (!sb.hasAttribute('open')) {
			if (!matchesElem(ev.target, 'input'))
				this.openDropdown(sb);
		}
		else {
			const li = findParent(ev.target, 'li');
			if (li && li.parentNode.classList.contains('dropdown'))
				this.toggleItem(sb, li);
			else if (li && li.parentNode.classList.contains('preview'))
				this.closeDropdown(sb);
			else if (matchesElem(ev.target, 'span.open, span.more'))
				this.closeDropdown(sb);
		}

		ev.preventDefault();
		ev.stopPropagation();
	},

	/**
	 * @private
	 * @method handleKeydown
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理下拉框的键盘按键事件（`keydown`）。
	 * 对 `input` 元素上的按键不做处理（由其自身处理）。
	 *
	 * 未展开时：
	 * - 方向键（37/38/39/40）→ 展开下拉框
	 *
	 * 已展开时：
	 * - `Escape`（27）→ 关闭下拉框并阻止事件冒泡
	 * - `Enter`（13）→ 若有活动项则切换选中并关闭
	 * - `Space`（32）→ 切换当前活动项的选中状态
	 * - `ArrowUp`（38）→ 焦点移至上一个列表项
	 * - `ArrowDown`（40）→ 焦点移至下一个列表项；若进入 create 输入行则聚焦其 input
	 *
	 * @param {KeyboardEvent} ev - 触发的键盘事件对象
	 *
	 * @example
	 * sb.addEventListener('keydown', this.handleKeydown.bind(this));
	 */
	/** @private */
	handleKeydown(ev) {
		const sb = ev.currentTarget;
		const ul = sb.querySelector('ul.dropdown');

		if (matchesElem(ev.target, 'input'))
			return;

		if (!sb.hasAttribute('open')) {
			switch (ev.keyCode) {
			case 37:
			case 38:
			case 39:
			case 40:
				this.openDropdown(sb);
				ev.preventDefault();
			}
		}
		else {
			const active = findParent(document.activeElement, 'li');

			switch (ev.keyCode) {
			case 27:
				this.closeDropdown(sb);
				ev.stopPropagation();
				break;

			case 13:
				if (active) {
					if (!active.hasAttribute('selected'))
						this.toggleItem(sb, active);
					this.closeDropdown(sb);
					ev.preventDefault();
				}
				break;

			case 32:
				if (active) {
					this.toggleItem(sb, active);
					ev.preventDefault();
				}
				break;

			case 38:
				if (active && active.previousElementSibling) {
					this.setFocus(sb, active.previousElementSibling);
					ev.preventDefault();
				}
				else if (document.activeElement === ul) {
					this.setFocus(sb, ul.lastElementChild);
					ev.preventDefault();
				}
				break;

			case 40:
				if (active && active.nextElementSibling) {
					const li = active.nextElementSibling;
					this.setFocus(sb, li);
					if (this.options.create && li == li.parentNode.lastElementChild) {
						const input = li.querySelector('input:not([type="hidden"]):not([type="checkbox"]');
						if (input) input.focus();
					}
					ev.preventDefault();
				}
				else if (document.activeElement === ul) {
					this.setFocus(sb, ul.firstElementChild);
					ev.preventDefault();
				}
				break;
			}
		}
	},

	/**
	 * @private
	 * @method handleDropdownClose
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理 `cbi-dropdown-close` 自定义事件。
	 * 调用 `closeDropdown` 关闭下拉框，传入 `no_focus=true` 以避免自动聚焦。
	 * 该事件通常由 `closeAllDropdowns` 统一触发。
	 *
	 * @param {CustomEvent} ev - `cbi-dropdown-close` 事件对象
	 *
	 * @example
	 * sb.addEventListener('cbi-dropdown-close', this.handleDropdownClose.bind(this));
	 */
	/** @private */
	handleDropdownClose(ev) {
		const sb = ev.currentTarget;

		this.closeDropdown(sb, true);
	},

	/**
	 * @private
	 * @method handleDropdownSelect
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理 `cbi-dropdown-select` 自定义事件（通常由触摸设备或辅助功能触发）。
	 * 找到事件来源的 `<li>` 祖先元素，调用 `toggleItem` 切换其选中状态，
	 * 然后关闭下拉框（`no_focus=true`）。
	 *
	 * @param {CustomEvent} ev - `cbi-dropdown-select` 事件对象
	 *
	 * @example
	 * sb.addEventListener('cbi-dropdown-select', this.handleDropdownSelect.bind(this));
	 */
	/** @private */
	handleDropdownSelect(ev) {
		const sb = ev.currentTarget;
		const li = findParent(ev.target, 'li');

		if (!li)
			return;

		this.toggleItem(sb, li);
		this.closeDropdown(sb, true);
	},

	/**
	 * @private
	 * @method handleMouseover
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理下拉框的 `mouseover` 事件。
	 * 若下拉框已打开，且鼠标悬停在 `.dropdown` 中的某个 `<li>` 上，
	 * 则通过 `setFocus` 将焦点移至该列表项，实现鼠标悬停高亮效果。
	 *
	 * @param {MouseEvent} ev - 触发的鼠标悬停事件对象
	 *
	 * @example
	 * sb.addEventListener('mouseover', this.handleMouseover.bind(this));
	 */
	/** @private */
	handleMouseover(ev) {
		const sb = ev.currentTarget;

		if (!sb.hasAttribute('open'))
			return;

		const li = findParent(ev.target, 'li');

		if (li && li.parentNode.classList.contains('dropdown'))
			this.setFocus(sb, li);
	},

	/**
	 * @private
	 * @method handleFocus
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理下拉框的 `focus` 事件。
	 * 当该下拉框获得焦点时，关闭页面上所有其他已打开的下拉框，
	 * 保证同时只有一个下拉框处于展开状态。
	 *
	 * @param {FocusEvent} ev - 触发的焦点事件对象
	 *
	 * @example
	 * sb.addEventListener('focus', this.handleFocus.bind(this));
	 */
	/** @private */
	handleFocus(ev) {
		const sb = ev.currentTarget;

		document.querySelectorAll('.cbi-dropdown[open]').forEach(s => {
			if (s !== sb || sb.hasAttribute('open'))
				s.dispatchEvent(new CustomEvent('cbi-dropdown-close', {}));
		});
	},

	/**
	 * @private
	 * @method handleCanaryFocus
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理"金丝雀"（canary）元素的 `focus` 事件。
	 * 金丝雀元素是一个不可见的焦点哨兵节点，当焦点离开下拉框区域并落到该节点时，
	 * 说明用户已 Tab 跳出下拉框，此时关闭下拉框。
	 *
	 * @param {FocusEvent} ev - 触发的焦点事件对象
	 *
	 * @example
	 * canaryElement.addEventListener('focus', this.handleCanaryFocus.bind(this));
	 */
	/** @private */
	handleCanaryFocus(ev) {
		this.closeDropdown(ev.currentTarget.parentNode);
	},

	/**
	 * @private
	 * @method handleCreateKeydown
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理自定义输入框（create 模式下的 `<input>`）的 `keydown` 事件。
	 *
	 * - `Enter`（13）：若输入值合法（无 `cbi-input-invalid` 类），
	 *   则调用 `createItems` 创建新选项并清空输入框；
	 * - `Escape`（27）：取消输入，关闭下拉框，清空输入框；
	 * - `ArrowUp`（38）：焦点移回上一个列表项（若存在）。
	 *
	 * @param {KeyboardEvent} ev - 触发的键盘事件对象
	 *
	 * @example
	 * createInput.addEventListener('keydown', this.handleCreateKeydown.bind(this));
	 */
	/** @private */
	handleCreateKeydown(ev) {
		const input = ev.currentTarget;
		const li = findParent(input, 'li');
		const sb = findParent(li, '.cbi-dropdown');

		switch (ev.keyCode) {
		case 13:
			ev.preventDefault();

			if (input.classList.contains('cbi-input-invalid'))
				return;

			this.handleCreateBlur(ev);
			this.createItems(sb, input.value);
			input.value = '';
			break;

		case 27:
			this.handleCreateBlur(ev);
			this.closeDropdown(sb);
			ev.stopPropagation();
			input.value = '';
			break;

		case 38:
			if (li.previousElementSibling) {
				this.handleCreateBlur(ev);
				this.setFocus(sb, li.previousElementSibling, true);
			}
			break;
		}
	},

	/**
	 * @private
	 * @method handleCreateFocus
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理自定义输入框的 `focus` 事件。
	 * 当用户聚焦到 create 模式下的输入框时：
	 * 1. 若同行存在复选框，将其设为 checked 状态（视觉提示"正在输入"）；
	 * 2. 为下拉框根元素添加 `locked-in` 属性，防止 `setFocus` 被其他事件干扰；
	 * 3. 将焦点样式设置到当前 `<li>` 元素并滚动至可视范围。
	 *
	 * @param {FocusEvent} ev - 触发的焦点事件对象
	 *
	 * @example
	 * createInput.addEventListener('focus', this.handleCreateFocus.bind(this));
	 */
	/** @private */
	handleCreateFocus(ev) {
		const input = ev.currentTarget;
		const li = findParent(input, 'li');
		const cbox = li.querySelector('input[type="checkbox"]');
		const sb = findParent(input, '.cbi-dropdown');

		if (cbox)
			cbox.checked = true;

		sb.setAttribute('locked-in', '');
		this.setFocus(sb, li, true);
	},

	/**
	 * @private
	 * @method handleCreateBlur
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理自定义输入框的 `blur` 事件。
	 * 与 `handleCreateFocus` 相对：
	 * 1. 若同行存在复选框，将其取消 checked 状态；
	 * 2. 移除下拉框根元素的 `locked-in` 属性，恢复正常焦点控制。
	 *
	 * @param {FocusEvent} ev - 触发的失焦事件对象
	 *
	 * @example
	 * createInput.addEventListener('blur', this.handleCreateBlur.bind(this));
	 */
	/** @private */
	handleCreateBlur(ev) {
		const input = ev.currentTarget;
		const cbox = findParent(input, 'li').querySelector('input[type="checkbox"]');
		const sb = findParent(input, '.cbi-dropdown');

		if (cbox)
			cbox.checked = false;

		sb.removeAttribute('locked-in');
	},

	/**
	 * @private
	 * @method handleCreateClick
	 * @memberof LuCI.ui.Dropdown
	 * @description
	 * 处理自定义输入行的点击事件。
	 * 点击该行的任意位置时，自动将焦点转移到符合 `create_query` 选择器的输入框元素，
	 * 方便用户直接开始输入新选项。
	 *
	 * @param {MouseEvent} ev - 触发的点击事件对象
	 *
	 * @example
	 * createLi.addEventListener('click', this.handleCreateClick.bind(this));
	 */
	/** @private */
	handleCreateClick(ev) {
		ev.currentTarget.querySelector(this.options.create_query).focus();
	},

	/**
	 * 设置下拉框的当前选中值。
	 *
	 * 覆盖父类的 `setValue` 方法，根据 `multiple` 选项决定处理逻辑：
	 * - 多选模式：将传入值统一转为数组，构建值→true 的映射后调用 `setValues`；
	 * - 单选模式：将传入值（字符串、数组或 null）转为单值映射后调用 `setValues`。
	 *
	 * @override
	 * @instance
	 * @memberof LuCI.ui.Dropdown
	 * @param {string|string[]|null} values - 要设置的选中值；
	 *   单选传字符串，多选传字符串数组，传 `null` 表示清空选中。
	 *
	 * @example
	 * // 单选：选中 "lan"
	 * dropdown.setValue('lan');
	 *
	 * @example
	 * // 多选：同时选中 "eth0" 和 "eth1"
	 * dropdown.setValue(['eth0', 'eth1']);
	 *
	 * @example
	 * // 清空选中
	 * dropdown.setValue(null);
	 */
	/** @override */
	setValue(values) {
		if (this.options.multiple) {
			if (!Array.isArray(values))
				values = (values != null && values != '') ? [ values ] : [];

			const v = {};

			for (let i = 0; i < values.length; i++)
				v[values[i]] = true;

			this.setValues(this.node, v);
		}
		else {
			const v = {};

			if (values != null) {
				if (Array.isArray(values))
					v[values[0]] = true;
				else
					v[values] = true;
			}

			this.setValues(this.node, v);
		}
	},

	/**
	 * 获取下拉框当前选中的值。
	 *
	 * 覆盖父类的 `getValue` 方法，从末尾容器 div 中读取所有
	 * `<input type="hidden">` 的值集合：
	 * - 多选模式：返回值字符串数组；
	 * - 单选模式：返回单个值字符串（或 `undefined` 若无选项）。
	 *
	 * @override
	 * @instance
	 * @memberof LuCI.ui.Dropdown
	 * @returns {string|string[]} 当前选中的值或值数组
	 *
	 * @example
	 * // 单选场景
	 * const selected = dropdown.getValue(); // 'lan'
	 *
	 * @example
	 * // 多选场景
	 * const selected = dropdown.getValue(); // ['eth0', 'eth1']
	 */
	/** @override */
	getValue() {
		const div = this.node.lastElementChild;
		const h = div.querySelectorAll('input[type="hidden"]');
		const v = [];

		for (let i = 0; i < h.length; i++)
			v.push(h[i].value);

		return this.options.multiple ? v : v[0];
	}
});

/**
 * @class UICombobox
 * @memberof LuCI.ui
 * @augments LuCI.ui.Dropdown
 *
 * @classdesc
 * 实例化一个支持自定义值的富下拉选择控件（Combobox）。
 *
 * `Combobox` 类实现了一个样式丰富、支持用户自行输入自定义值的下拉菜单。
 * 历史上 Combobox 曾是 LuCI 中独立的控件类型，现已成为 Dropdown 控件
 * 的直接别名，通过预设一组默认属性简化实例化流程。
 *
 * UI 控件实例通常不应由视图代码直接创建，而是由 `LuCI.form` 在实例化
 * CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。在视图中使用时，
 * 请通过 `'require ui'` 引入并访问 `ui.Combobox`；
 * 在外部 JavaScript 中引入时，请使用 `L.require("ui").then(...)`
 * 并访问类实例的 `Combobox` 属性。
 *
 * @param {string|string[]} [value=null]
 * 初始输入值（可为单个字符串或字符串数组）。
 *
 * @param {Object<string, *>} choices
 * 包含可选项的对象，键作为各选项的值，值作为选项标签。
 *
 * @param {LuCI.ui.Combobox.InitOptions} [options]
 * 描述控件特定初始化选项的对象，用于初始化下拉框。
 *
 * @example
 * // 创建一个带自定义值的 Combobox
 * const combobox = new ui.Combobox('eth0', {
 *   eth0: '有线接口 0',
 *   eth1: '有线接口 1'
 * }, {
 *   optional: true
 * });
 *
 * // 将控件渲染到页面
 * document.body.appendChild(await combobox.render());
 */
const UICombobox = UIDropdown.extend(/** @lends LuCI.ui.Combobox.prototype */ {
	/**
	 * Comboboxes support the same properties as
	 * [Dropdown.InitOptions]{@link LuCI.ui.Dropdown.InitOptions} but enforce
	 * specific values for the following properties:
	 *
	 * @typedef {LuCI.ui.Dropdown.InitOptions} InitOptions
	 * @memberof LuCI.ui.Combobox
	 *
	 * @property {boolean} multiple=false
	 * Since Comboboxes never allow selecting multiple values, this property
	 * is forcibly set to `false`.
	 *
	 * @property {boolean} create=true
	 * Since Comboboxes always allow custom choice values, this property is
	 * forcibly set to `true`.
	 *
	 * @property {boolean} optional=true
	 * Since Comboboxes are always optional, this property is forcibly set to
	 * `true`.
	 * 初始化 UICombobox 组件。
	 *
	 * 该方法在 UIDropdown 的基础上强制设置三个选项：
	 * - `multiple = false`：组合框不允许多选。
	 * - `create = true`：组合框允许用户输入自定义值。
	 * - `optional = true`：组合框始终是可选的（允许留空）。
	 *
	 * 同时为下拉框提供默认的占位文字与排序行为。
	 *
	 * @param {string|string[]} value - 初始值（单个字符串或字符串数组）。
	 * @param {Object<string, *>} choices - 可供选择的键值对，键为选项值，值为显示标签。
	 * @param {LuCI.ui.Combobox.InitOptions} [options] - 附加的初始化选项。
	 *
	 * @example
	 * // 创建一个带预设选项、支持自定义输入的组合框
	 * const combobox = new UICombobox('wan', {
	 *   'wan': '外网接口',
	 *   'lan': '局域网接口'
	 * }, { placeholder: '请选择或输入接口名' });
	 * document.body.appendChild(combobox.render());
	 */
	__init__(value, choices, options) {
		this.super('__init__', [ value, choices, Object.assign({
			select_placeholder: _('-- Please choose --'),
			custom_placeholder: _('-- custom --'),
			dropdown_items: -1,
			sort: true
		}, options, {
			multiple: false,
			create: true,
			optional: true
		}) ]);
	}
});

/**
 * 实例化一个多功能组合按钮组件。
 *
 * @constructor ComboButton
 * @memberof LuCI.ui
 * @augments LuCI.ui.Dropdown
 *
 * @classdesc
 *
 * `ComboButton` 类实现了一个按钮元素，可以展开为下拉框以供用户从
 * 多个预设操作中选择。该组件常用于"保存并应用"/"仅保存"/"重置"等
 * 多操作场景。
 *
 * 通常不由视图代码直接创建，而是由 `LuCI.form` 在实例化 CBI 表单时
 * 隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。在视图中使用时，请 `require ui`
 * 并通过 `ui.ComboButton` 访问；在外部脚本中使用时，请调用
 * `L.require("ui").then(...)` 并访问返回实例的 `ComboButton` 属性。
 *
 * @param {string|string[]} [value=null] - 初始选中值。
 * @param {Object<string, *>} choices - 可选操作的键值对，键为动作值，值为显示标签。
 * @param {LuCI.ui.ComboButton.InitOptions} [options] - 按钮专属初始化选项。
 *
 * @example
 * // 创建一个带不同样式的多操作组合按钮
 * const btn = new UIComboButton('save', {
 *   'save':        '保存',
 *   'save-apply':  '保存并应用',
 *   'reset':       '重置'
 * }, {
 *   classes: {
 *     'save':       'btn-primary',
 *     'save-apply': 'btn-success',
 *     'reset':      'btn-danger'
 *   },
 *   click: function(ev, val) {
 *     console.log('用户点击了:', val);
 *   }
 * });
 * document.body.appendChild(btn.render());
 */
const UIComboButton = UIDropdown.extend(/** @lends LuCI.ui.ComboButton.prototype */ {
	/**
	 * ComboButton 支持与
	 * [Dropdown.InitOptions]{@link LuCI.ui.Dropdown.InitOptions} 相同的属性，
	 * 但对部分属性强制赋值，并新增了按钮专属属性。
	 *
	 * @typedef {LuCI.ui.Dropdown.InitOptions} InitOptions
	 * @memberof LuCI.ui.ComboButton
	 *
	 * @property {boolean} multiple=false
	 * ComboButton 不允许同时选中多个操作，该属性强制为 `false`。
	 *
	 * @property {boolean} create=false
	 * ComboButton 不允许用户创建自定义选项，该属性强制为 `false`。
	 *
	 * @property {boolean} optional=false
	 * ComboButton 必须始终选中某一操作，该属性强制为 `false`。
	 *
	 * @property {Object<string, string>} [classes]
	 * 动作值到 CSS 类名的映射表。当用户选择某个动作时，若该值在
	 * `classes` 对象中存在对应条目，则将对应的 CSS 类名应用到按钮元素上，
	 * 从而实现不同操作显示不同按钮样式（如颜色）的效果。
	 *
	 * @property {function} [click]
	 * 用户点击按钮时调用的处理函数。该函数以按钮 DOM 节点作为 `this` 上下文，
	 * 接收 DOM 点击事件作为第一个参数，当前选中的动作值作为第二个参数。
	 */

	/**
	 * 初始化 UIComboButton 组件。
	 *
	 * 在父类 UIDropdown 的基础上强制设置：
	 * - `multiple = false`
	 * - `create = false`
	 * - `optional = false`
	 *
	 * @param {string|string[]} value - 初始选中的动作值。
	 * @param {Object<string, *>} choices - 可选动作的键值对。
	 * @param {LuCI.ui.ComboButton.InitOptions} [options] - 附加初始化选项。
	 *
	 * @example
	 * const btn = new UIComboButton('apply', {
	 *   'apply': '应用',
	 *   'discard': '丢弃'
	 * }, { sort: true });
	 */
	__init__(value, choices, options) {
		this.super('__init__', [ value, choices, Object.assign({
			sort: true
		}, options, {
			multiple: false,
			create: false,
			optional: false
		}) ]);
	},

	/**
	 * 渲染 ComboButton 组件的 DOM 节点。
	 *
	 * 在父类渲染的基础上，若 `options.classes` 中存在当前选中值对应的
	 * CSS 类名，则将其应用到组件根节点上，实现动态样式变化。
	 *
	 * @override
	 * @param {...*} args - 传递给父类 render 方法的参数。
	 * @returns {HTMLElement} 渲染完成的 ComboButton DOM 节点。
	 *
	 * @example
	 * // 渲染后节点会携带对应操作的样式类
	 * const node = btn.render();
	 * // 若当前值为 'reset'，且 classes['reset'] = 'btn-danger'
	 * // 则 node.className === 'cbi-dropdown btn-danger'
	 */
	/** @override */
	render(...args) {
		const node = UIDropdown.prototype.render.call(this, ...args);
		const val = this.getValue();

		if (L.isObject(this.options.classes) && this.options.classes.hasOwnProperty(val))
			node.setAttribute('class', `cbi-dropdown ${this.options.classes[val]}`);

		return node;
	},

	/**
	 * 处理 ComboButton 的点击事件（私有方法）。
	 *
	 * 若下拉框已展开，则将事件委托给父类 UIDropdown 的 handleClick 处理；
	 * 否则，若用户配置了 `options.click` 回调，则以当前按钮节点为上下文
	 * 调用该回调，并将当前选中值传入。
	 *
	 * @private
	 * @param {MouseEvent} ev - 浏览器点击事件对象。
	 * @param {...*} args - 额外参数，透传给父类处理方法。
	 *
	 * @example
	 * // options.click 配置示例
	 * {
	 *   click: function(ev, val) {
	 *     if (val === 'save') saveConfig();
	 *     else if (val === 'reset') resetConfig();
	 *   }
	 * }
	 */
	/** @private */
	handleClick(ev, ...args) {
		const sb = ev.currentTarget;
		const t = ev.target;

		if (sb.hasAttribute('open') || dom.matches(t, '.cbi-dropdown > span.open'))
			return UIDropdown.prototype.handleClick.call(this, ev, ...args);

		if (this.options.click)
			return this.options.click.call(sb, ev, this.getValue());
	},

	/**
	 * 切换选中项并同步更新按钮样式（私有方法）。
	 *
	 * 在父类 toggleItem 完成选项切换后，根据新的选中值更新按钮节点的
	 * CSS 类：若 `options.classes` 中存在对应映射则应用，否则恢复默认类名。
	 *
	 * @private
	 * @param {HTMLElement} sb - 组合按钮的根 DOM 节点。
	 * @param {...*} args - 额外参数，透传给父类 toggleItem 方法。
	 * @returns {*} 父类 toggleItem 的返回值。
	 *
	 * @example
	 * // 切换后按钮样式自动更新
	 * // 若新选中值为 'save-apply' 且 classes['save-apply'] = 'btn-success'
	 * // 则 sb.className === 'cbi-dropdown btn-success'
	 */
	/** @private */
	toggleItem(sb, ...args) {
		const rv = UIDropdown.prototype.toggleItem.call(this, sb, ...args);
		const val = this.getValue();

		if (L.isObject(this.options.classes) && this.options.classes.hasOwnProperty(val))
			sb.setAttribute('class', `cbi-dropdown ${this.options.classes[val]}`);
		else
			sb.setAttribute('class', 'cbi-dropdown');

		return rv;
	}
});

/**
 * 实例化一个动态列表组件。
 *
 * @constructor DynamicList
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 *
 * @classdesc
 *
 * `DynamicList` 类实现了一个允许用户指定任意数量输入值的组件，
 * 用户可通过自由文本输入或从预定义选项中选择来添加列表项。
 * 列表项支持拖拽排序（同时支持鼠标拖拽和触摸滑动）。
 *
 * 通常不由视图代码直接创建，而是由 `LuCI.form` 在实例化 CBI 表单时
 * 隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。在视图中使用时，请 `require ui`
 * 并通过 `ui.DynamicList` 访问；在外部脚本中使用时，请调用
 * `L.require("ui").then(...)` 并访问返回实例的 `DynamicList` 属性。
 *
 * @param {string|string[]} [value=null] - 初始值，可以是字符串或字符串数组。
 * @param {Object<string, *>} [choices] - 预定义选项的键值对。键为选项值，值为显示标签。
 *   若省略，则渲染为纯文本输入框，允许用户自由输入任意值。
 * @param {LuCI.ui.DynamicList.InitOptions} [options] - 动态列表专属初始化选项。
 *
 * @example
 * // 带预定义选项的动态列表
 * const dl = new UIDynamicList(['eth0', 'eth1'], {
 *   'eth0': '以太网口 0',
 *   'eth1': '以太网口 1',
 *   'wlan0': '无线接口 0'
 * });
 * document.body.appendChild(dl.render());
 *
 * @example
 * // 纯文本输入动态列表（无预定义选项）
 * const dl = new UIDynamicList(['8.8.8.8', '8.8.4.4'], null, {
 *   placeholder: '输入 DNS 服务器地址',
 *   datatype: 'ipaddr'
 * });
 * document.body.appendChild(dl.render());
 */
const UIDynamicList = UIElement.extend(/** @lends LuCI.ui.DynamicList.prototype */ {
	/**
	 * 若在构造函数中传入了 choices，则该组件支持与
	 * [Dropdown.InitOptions]{@link LuCI.ui.Dropdown.InitOptions} 相同的属性，
	 * 但对部分下拉框属性强制赋值。
	 *
	 * @typedef {LuCI.ui.Dropdown.InitOptions} InitOptions
	 * @memberof LuCI.ui.DynamicList
	 *
	 * @property {boolean} multiple=false
	 * 动态列表在添加新项时不允许同时选择多个选项，该属性强制为 `false`。
	 *
	 * @property {boolean} optional=true
	 * 动态列表使用内嵌下拉框展示预定义选项，下拉框必须设为可选，
	 * 以允许其保持未选中状态，该属性强制为 `true`。
	 */

	/**
	 * 初始化 UIDynamicList 组件。
	 *
	 * 将传入的初始值规范化为数组，将 choices 规范化（非对象时置为 null），
	 * 并合并配置选项（强制 multiple=false, optional=true）。
	 *
	 * @param {string|string[]} values - 初始值，允许单个字符串或字符串数组。
	 * @param {Object<string, *>|null} choices - 预定义选项，若不需要则传 null。
	 * @param {LuCI.ui.DynamicList.InitOptions} [options] - 附加初始化选项。
	 *
	 * @example
	 * const dl = new UIDynamicList('192.168.1.1', null, { placeholder: '输入 IP' });
	 * // values 内部规范化为 ['192.168.1.1']
	 */
	__init__(values, choices, options) {
		if (!Array.isArray(values))
			values = (values != null && values != '') ? [ values ] : [];

		if (typeof(choices) != 'object')
			choices = null;

		this.values = values;
		this.choices = choices;
		this.options = Object.assign({}, options, {
			multiple: false,
			optional: true
		});
	},

	/**
	 * 渲染动态列表的 DOM 结构。
	 *
	 * 根据是否存在 choices，分两种方式渲染输入控件：
	 * - 有 choices：内嵌 UICombobox 下拉组合框。
	 * - 无 choices：渲染文本输入框和"+"添加按钮，并可选地附加数据验证器。
	 *
	 * 最后遍历初始值列表，调用 addItem 填充已有列表项，并初始化拖拽排序。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的动态列表容器 DOM 节点。
	 *
	 * @example
	 * const dl = new UIDynamicList(['tag1', 'tag2']);
	 * const node = dl.render();
	 * document.getElementById('container').appendChild(node);
	 */
	/** @override */
	render() {
		const dl = E('div', {
			'id': this.options.id,
			'class': 'cbi-dynlist',
			'disabled': this.options.disabled ? '' : null
		}, E('div', { 'class': 'add-item control-group' }));

		if (this.choices) {
			if (this.options.placeholder != null)
				this.options.select_placeholder = this.options.placeholder;

			const cbox = new UICombobox(null, this.choices, this.options);

			dl.lastElementChild.appendChild(cbox.render());
		}
		else {
			const inputEl = E('input', {
				'id': this.options.id ? `widget.${this.options.id}` : null,
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': this.options.placeholder,
				'disabled': this.options.disabled ? '' : null
			});

			dl.lastElementChild.appendChild(inputEl);
			dl.lastElementChild.appendChild(E('div', { 'class': 'btn cbi-button cbi-button-add' }, '+'));

			if (this.options.datatype || this.options.validate)
				UI.prototype.addValidator(inputEl, this.options.datatype ?? 'string',
				                          true, this.options.validate, 'blur', 'keyup');
		}

		for (let i = 0; i < this.values.length; i++) {
			let label = this.choices ? this.choices[this.values[i]] : null;

			if (dom.elem(label))
				label = label.cloneNode(true);

			this.addItem(dl, this.values[i], label);
		}

		this.initDragAndDrop(dl);

		return this.bind(dl);
	},

	/**
	 * 初始化动态列表的拖拽排序功能（私有方法）。
	 *
	 * 同时支持以下两种交互方式：
	 * 1. **鼠标拖拽（HTML5 Drag & Drop API）**：
	 *    - `dragstart`：标记被拖拽的列表项，添加 `dragging` 样式类。
	 *    - `dragend`：移除 `dragging` 样式类。
	 *    - `dragover`：阻止默认行为以允许放置。
	 *    - `dragenter` / `dragleave`：高亮显示潜在放置目标。
	 *    - `drop`：将拖拽项插入到目标位置，并触发 `cbi-dynlist-change` 事件。
	 *    - `click`：在列表项上点击时选中/取消选中文本内容。
	 *
	 * 2. **触摸拖拽（Touch Events API）**：
	 *    - `touchstart`：记录拖拽起始项，插入占位符元素。
	 *    - `touchmove`：根据手指位置移动占位符到最近的目标位置。
	 *    - `touchend`：将拖拽项插入占位符所在位置，移除占位符，触发变更事件。
	 *
	 * @private
	 * @param {HTMLElement} dl - 动态列表容器 DOM 节点。
	 *
	 * @example
	 * // render() 内部自动调用，无需手动调用
	 * this.initDragAndDrop(dl);
	 */
	/** @private */
	initDragAndDrop(dl) {
		let draggedItem = null;
		let placeholder = null;

		dl.addEventListener('dragstart', (e) => {
			if (e.target.classList.contains('item')) {
				draggedItem = e.target;
				e.target.classList.add('dragging');
			}
		});

		dl.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));

		dl.addEventListener('dragover', (e) => e.preventDefault());

		dl.addEventListener('dragenter', (e) => e.target.classList.add('drag-over'));

		dl.addEventListener('dragleave', (e) => e.target.classList.remove('drag-over'));

		dl.addEventListener('drop', (e) => {
			e.preventDefault();
			e.target.classList.remove('drag-over');
			const target = e.target.classList.contains('item') ? e.target : dl.querySelector('.add-item');
			dl.insertBefore(draggedItem, target);
			this.dispatchCbiDynlistChange(dl, draggedItem.value);
		});

		dl.addEventListener('click', (e) => {
			if (e.target.closest('.item')) {
				const span = e.target.closest('.item').querySelector('SPAN');
				if (span) {
					const range = document.createRange();
					range.selectNodeContents(span);
					const selection = window.getSelection();
					if (selection.rangeCount === 0 || selection.toString().length === 0) {
						selection.removeAllRanges();
						selection.addRange(range);
					} else selection.removeAllRanges();
				}
			}
		});

		dl.addEventListener('touchstart', (e) => {
			const touch = e.touches[0];
			const target = e.target.closest('.item');
			if (target) {
				draggedItem = target;

				placeholder = draggedItem.cloneNode(true);
				placeholder.className = 'placeholder';
				placeholder.style.height = `${draggedItem.offsetHeight}px`;
				draggedItem.parentNode.insertBefore(placeholder, draggedItem.nextSibling);
				draggedItem.classList.add('dragging')
			}
		});

		dl.addEventListener('touchmove', (e) => {
			if (draggedItem) {
				const touch = e.touches[0];
				const currentY = touch.clientY;

				const items = Array.from(dl.querySelectorAll('.item'));
				const target = items.find(item => {
					const rect = item.getBoundingClientRect();
					return currentY > rect.top && currentY < rect.bottom;
				});

				if (target && target !== draggedItem) {
					const insertBefore = currentY < target.getBoundingClientRect().top + target.offsetHeight / 2;
					dl.insertBefore(placeholder, insertBefore ? target : target.nextSibling);
				}

				e.preventDefault();
			}
		});

		dl.addEventListener('touchend', (e) => {
			if (draggedItem && placeholder) {
				dl.insertBefore(draggedItem, placeholder);
				draggedItem.classList.remove('dragging')
				placeholder.parentNode.removeChild(placeholder);
				this.dispatchCbiDynlistChange(dl, draggedItem.value);
				placeholder = null;
				draggedItem = null;
			}
		});
	},

	/**
	 * 绑定事件监听器并初始化动态列表节点（私有方法）。
	 *
	 * 将 click、keydown、cbi-dropdown-change 三类事件处理器绑定到列表容器上，
	 * 设置更新与变更事件为 `cbi-dynlist-change`，并将类实例与 DOM 节点关联。
	 *
	 * @private
	 * @param {HTMLElement} dl - 动态列表容器 DOM 节点。
	 * @returns {HTMLElement} 绑定完成的 DOM 节点（与传入的 dl 相同）。
	 *
	 * @example
	 * // render() 内部自动调用：
	 * return this.bind(dl);
	 */
	/** @private */
	bind(dl) {
		dl.addEventListener('click', L.bind(this.handleClick, this));
		dl.addEventListener('keydown', L.bind(this.handleKeydown, this));
		dl.addEventListener('cbi-dropdown-change', L.bind(this.handleDropdownChange, this));

		this.node = dl;

		this.setUpdateEvents(dl, 'cbi-dynlist-change');
		this.setChangeEvents(dl, 'cbi-dynlist-change');

		dom.bindClassInstance(dl, this);

		return dl;
	},

	/**
	 * 向动态列表中添加一个新列表项（私有方法）。
	 *
	 * 若列表中已存在相同值的隐藏 input，则不重复添加。
	 * 新创建的列表项包含：
	 * - 文本显示 `<span>`
	 * - 存储值的隐藏 `<input type="hidden">`
	 * - 支持拖拽的 `draggable` 属性
	 *
	 * 添加成功后触发 `cbi-dynlist-change` 自定义事件。
	 *
	 * @private
	 * @param {HTMLElement} dl - 动态列表容器 DOM 节点。
	 * @param {string} value - 列表项的值（隐藏字段存储）。
	 * @param {string|HTMLElement|null} text - 列表项的显示文本或 DOM 节点，为 null 时显示 value。
	 * @param {boolean} [flash=false] - 若为 true，则为新项添加 `flash` CSS 类（高亮闪烁动画）。
	 *
	 * @example
	 * // 添加一个带闪烁效果的新项
	 * this.addItem(dl, '10.0.0.1', '网关地址', true);
	 */
	/** @private */
	addItem(dl, value, text, flash) {
		let exists = false;

		const new_item = E('div', { 'class': flash ? 'item flash' : 'item', 'tabindex': 0, 'draggable': true }, [
			E('span', {}, [ text ?? value ]),
			E('input', {
				'type': 'hidden',
				'name': this.options.name,
				'value': value })]);

		dl.querySelectorAll('.item').forEach(item => {
			if (exists)
				return;

			let hidden = item.querySelector('input[type="hidden"]');

			if (hidden && hidden.parentNode !== item)
				hidden = null;

			if (hidden && hidden.value === value)
				exists = true;
		});

		if (!exists) {
			const ai = dl.querySelector('.add-item');
			ai.parentNode.insertBefore(new_item, ai);
		}

		this.dispatchCbiDynlistChange(dl,value);
	},

	/**
	 * 派发 `cbi-dynlist-change` 自定义事件（私有方法）。
	 *
	 * 当列表项被添加、删除或排序时调用，事件会冒泡并携带以下 detail 数据：
	 * - `instance`：当前 UIDynamicList 实例。
	 * - `element`：动态列表容器 DOM 节点。
	 * - `value`：触发变更的列表项值。
	 * - `add`：标记此次变更是添加操作（固定为 true）。
	 *
	 * @private
	 * @param {HTMLElement} dl - 动态列表容器 DOM 节点。
	 * @param {string} value - 发生变更的列表项值。
	 *
	 * @example
	 * // addItem / removeItem 内部自动调用：
	 * this.dispatchCbiDynlistChange(dl, '192.168.1.1');
	 */
	/** @private */
	dispatchCbiDynlistChange(dl,value) {
		dl.dispatchEvent(new CustomEvent('cbi-dynlist-change', {
			bubbles: true,
			detail: {
				instance: this,
				element: dl,
				value: value,
				add: true
			}
		}));
	},

	/**
	 * 从动态列表中移除一个列表项（私有方法）。
	 *
	 * 执行以下步骤：
	 * 1. 从列表项的隐藏 input 中读取值。
	 * 2. 若存在内嵌下拉框，将对应选项重新设为可选状态；
	 *    若该选项是用户自定义添加的（dynlistcustom），则直接从 DOM 中移除。
	 * 3. 从 DOM 中删除列表项节点。
	 * 4. 触发 `cbi-dynlist-change` 事件。
	 *
	 * @private
	 * @param {HTMLElement} dl - 动态列表容器 DOM 节点。
	 * @param {HTMLElement} item - 要移除的列表项 DOM 节点（.item 元素）。
	 *
	 * @example
	 * // handleClick 内部调用：
	 * this.removeItem(dl, clickedItem);
	 */
	/** @private */
	removeItem(dl, item) {
		const value = item.querySelector('input[type="hidden"]').value;
		const sb = dl.querySelector('.cbi-dropdown');
		if (sb)
			sb.querySelectorAll('ul > li').forEach(li => {
				if (li.getAttribute('data-value') === value) {
					if (li.hasAttribute('dynlistcustom'))
						li.parentNode.removeChild(li);
					else
						li.removeAttribute('unselectable');
				}
			});

		item.parentNode.removeChild(item);

		this.dispatchCbiDynlistChange(dl, value);
	},

	/**
	 * 处理动态列表的鼠标点击事件（私有方法）。
	 *
	 * 根据点击目标的不同执行不同操作：
	 * - 点击在 `.item` 上：检测是否点击在删除区域（`::after` 伪元素区域），
	 *   若是则调用 removeItem 移除该项。
	 * - 点击在 `.cbi-button-add` 上：读取文本输入框的值，若值非空且通过验证，
	 *   则调用 addItem 添加新列表项并清空输入框。
	 *
	 * @private
	 * @param {MouseEvent} ev - 浏览器点击事件对象。
	 *
	 * @example
	 * // bind() 内部自动绑定，无需手动调用：
	 * dl.addEventListener('click', L.bind(this.handleClick, this));
	 */
	/** @private */
	handleClick(ev) {
		const dl = ev.currentTarget;
		const item = findParent(ev.target, '.item');

		if (this.options.disabled)
			return;

		if (item) {
			// Get bounding rectangle of the item
			const rect = item.getBoundingClientRect();

			// Get computed styles for the ::after pseudo-element
			const afterStyles = window.getComputedStyle(item, '::after');
			const afterWidth = parseFloat(afterStyles.width) || 0;

			// Check if the click is within the ::after region
			if (rect.right - ev.clientX <= afterWidth) {
				this.removeItem(dl, item);
			}
		}
		else if (matchesElem(ev.target, '.cbi-button-add')) {
			const input = ev.target.previousElementSibling;
			if (input.value.length && !input.classList.contains('cbi-input-invalid')) {
				this.addItem(dl, input.value, null, true);
				input.value = '';
			}
		}
	},

	/**
	 * 处理内嵌下拉框（Combobox）的变更事件（私有方法）。
	 *
	 * 当内嵌的 UICombobox 触发 `cbi-dropdown-change` 时：
	 * 1. 若选中值为 null 则直接返回（无操作）。
	 * 2. 重置下拉框为未选中状态（setValues 传 null）。
	 * 3. 将对应下拉列表项标记为不可再次选择（unselectable）。
	 * 4. 若该项是用户新创建的（created），则标记为 dynlistcustom。
	 * 5. 从选中项的 DOM 节点克隆显示标签。
	 * 6. 调用 addItem 将新值和标签添加到动态列表。
	 *
	 * @private
	 * @param {CustomEvent} ev - cbi-dropdown-change 自定义事件对象。
	 *   ev.detail 包含：
	 *   - instance {UIDropdown} - 触发事件的下拉框实例
	 *   - element {HTMLElement} - 下拉框根节点
	 *   - value {Object|null} - 选中项信息（含 text、element、value 属性）
	 *
	 * @example
	 * // bind() 内部自动绑定，无需手动调用：
	 * dl.addEventListener('cbi-dropdown-change', L.bind(this.handleDropdownChange, this));
	 */
	/** @private */
	handleDropdownChange(ev) {
		const dl = ev.currentTarget;
		const sbIn = ev.detail.instance;
		const sbEl = ev.detail.element;
		const sbVal = ev.detail.value;

		if (sbVal === null)
			return;

		sbIn.setValues(sbEl, null);
		sbVal.element.setAttribute('unselectable', '');

		if (sbVal.element.hasAttribute('created')) {
			sbVal.element.removeAttribute('created');
			sbVal.element.setAttribute('dynlistcustom', '');
		}

		let label = sbVal.text;

		if (sbVal.element) {
			label = E([]);

			for (let i = 0; i < sbVal.element.childNodes.length; i++)
				label.appendChild(sbVal.element.childNodes[i].cloneNode(true));
		}

		this.addItem(dl, sbVal.value, label, true);
	},

	/**
	 * 处理动态列表的键盘事件（私有方法）。
	 *
	 * 根据焦点目标和按键的不同执行不同操作：
	 *
	 * **焦点在列表项（.item）上时：**
	 * - `Backspace (8)`：将焦点移至上一个列表项后删除当前项。
	 * - `Delete (46)`：将焦点移至下一个列表项（或输入框首元素）后删除当前项。
	 *
	 * **焦点在文本输入框（.cbi-input-text）上时：**
	 * - `Enter (13)`：若输入值非空且通过验证，则添加为新列表项，清空输入框并重新聚焦。
	 *   同时阻止默认的表单提交行为。
	 *
	 * @private
	 * @param {KeyboardEvent} ev - 浏览器键盘事件对象。
	 *
	 * @example
	 * // bind() 内部自动绑定，无需手动调用：
	 * dl.addEventListener('keydown', L.bind(this.handleKeydown, this));
	 */
	/** @private */
	handleKeydown(ev) {
		const dl = ev.currentTarget;
		const item = findParent(ev.target, '.item');

		if (item) {
			switch (ev.keyCode) {
			case 8: /* backspace */
				if (item.previousElementSibling)
					item.previousElementSibling.focus();

				this.removeItem(dl, item);
				break;

			case 46: /* delete */
				if (item.nextElementSibling) {
					if (item.nextElementSibling.classList.contains('item'))
						item.nextElementSibling.focus();
					else
						item.nextElementSibling.firstElementChild.focus();
				}

				this.removeItem(dl, item);
				break;
			}
		}
		else if (matchesElem(ev.target, '.cbi-input-text')) {
			switch (ev.keyCode) {
			case 13: /* enter */
				if (ev.target.value.length && !ev.target.classList.contains('cbi-input-invalid')) {
					this.addItem(dl, ev.target.value, null, true);
					ev.target.value = '';
					ev.target.blur();
					ev.target.focus();
				}

				ev.preventDefault();
				break;
			}
		}
	},

	/**
	 * 获取动态列表当前的所有值。
	 *
	 * 遍历所有 `.item > input[type="hidden"]` 节点收集值，并将文本输入框中
	 * 尚未添加为列表项的非空、通过验证且不重复的值也纳入结果。
	 *
	 * @override
	 * @returns {string[]} 包含所有列表项值（及输入框待添加值）的字符串数组。
	 *
	 * @example
	 * const dl = new UIDynamicList(['a', 'b']);
	 * dl.render();
	 * console.log(dl.getValue()); // ['a', 'b']
	 */
	/** @override */
	getValue() {
		const items = this.node.querySelectorAll('.item > input[type="hidden"]');
		const input = this.node.querySelector('.add-item > input[type="text"]');
		const v = [];

		for (let i = 0; i < items.length; i++)
			v.push(items[i].value);

		if (input && input.value != null && input.value.match(/\S/) &&
		    input.classList.contains('cbi-input-invalid') == false &&
		    v.filter(s => s == input.value).length == 0)
			v.push(input.value);

		return v;
	},

	/**
	 * 设置动态列表的值。
	 *
	 * 先移除所有已有的顶层列表项，再根据传入的 values 数组逐一调用 addItem
	 * 重新填充列表（若存在 choices 则尝试匹配对应标签）。
	 *
	 * @override
	 * @param {string|string[]|null} values - 要设置的值，可以是字符串、字符串数组或 null（清空列表）。
	 *
	 * @example
	 * dl.setValue(['192.168.1.1', '10.0.0.1']);
	 * // 列表将更新为两个 IP 地址项
	 *
	 * @example
	 * dl.setValue(null);
	 * // 清空列表
	 */
	/** @override */
	setValue(values) {
		if (!Array.isArray(values))
			values = (values != null && values != '') ? [ values ] : [];

		const items = this.node.querySelectorAll('.item');

		for (let i = 0; i < items.length; i++)
			if (items[i].parentNode === this.node)
				this.removeItem(this.node, items[i]);

		for (let i = 0; i < values.length; i++)
			this.addItem(this.node, values[i],
				this.choices ? this.choices[values[i]] : null);
	},

	/**
	 * 向动态列表的建议下拉框中添加新的预定义选项。
	 *
	 * 该方法将新的选项值追加到内嵌下拉框的选项列表中，已存在的选项值将被忽略。
	 *
	 * @instance
	 * @memberof LuCI.ui.DynamicList
	 * @param {string[]} values - 要添加到建议下拉框的选项值数组。
	 * @param {Object<string, *>} labels - 选项值到显示标签的映射。若某个值没有对应标签，
	 *   则直接使用值本身作为标签文本。标签可以是任何 {@link LuCI.dom#content} 接受的类型。
	 *
	 * @example
	 * // 动态添加新的 DNS 服务器建议
	 * dl.addChoices(['1.1.1.1', '9.9.9.9'], {
	 *   '1.1.1.1': 'Cloudflare DNS',
	 *   '9.9.9.9': 'Quad9 DNS'
	 * });
	 */
	addChoices(values, labels) {
		const dl = this.node.lastElementChild.firstElementChild;
		dom.callClassMethod(dl, 'addChoices', values, labels);
	},

	/**
	 * 清除动态列表内嵌下拉框中的所有预定义选项。
	 *
	 * 该方法会移除所有已存在的建议选项，可配合 addChoices 实现选项列表的动态刷新。
	 *
	 * @instance
	 * @memberof LuCI.ui.DynamicList
	 *
	 * @example
	 * // 先清空旧选项，再填入新选项
	 * dl.clearChoices();
	 * dl.addChoices(newValues, newLabels);
	 */
	clearChoices() {
		const dl = this.node.lastElementChild.firstElementChild;
		dom.callClassMethod(dl, 'clearChoices');
	}
});

/**
 * 实例化一个范围滑块组件。
 *
 * @constructor RangeSlider
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 *
 * @classdesc
 *
 * `RangeSlider` 类实现了一个允许用户从预定义范围内设置数值的滑块组件。
 * 可选地支持自定义计算函数，将滑块原始值转换为带单位的计算值并实时展示。
 *
 * 通常不由视图代码直接创建，而是由 `LuCI.form` 在实例化 CBI 表单时隐式创建。
 *
 * 该类作为 `LuCI.ui` 的一部分自动实例化。在视图中使用时，请 `require ui`
 * 并通过 `ui.RangeSlider` 访问；在外部脚本中使用时，请调用
 * `L.require("ui").then(...)` 并访问返回实例的 `RangeSlider` 属性。
 *
 * @param {string|string[]} [value=null] - 滑块的初始值，用于设置滑块把手的初始位置。
 * @param {LuCI.ui.RangeSlider.InitOptions} [options] - 滑块专属初始化选项。
 *
 * @example
 * // 创建一个范围为 1~10、步长为 1 的滑块
 * const slider = new UIRangeSlider(5, { min: 1, max: 10, step: 1 });
 * document.body.appendChild(slider.render());
 *
 * @example
 * // 创建一个带计算函数（将原始值转换为 MB）的滑块
 * const slider = new UIRangeSlider(512, {
 *   min: 128,
 *   max: 2048,
 *   step: 128,
 *   calculate: (v) => (v / 1024).toFixed(2),
 *   calcunits: 'GB'
 * });
 * document.body.appendChild(slider.render());
 */
const UIRangeSlider = UIElement.extend({
	/**
	 * 除 [AbstractElement.InitOptions]{@link LuCI.ui.AbstractElement.InitOptions} 外，
	 * 还支持以下属性：
	 *
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.RangeSlider
	 *
	 * @property {int} [min=0]
	 * 滑块范围的最小值，默认为 0。
	 *
	 * @property {int} [max=100]
	 * 滑块范围的最大值，默认为 100。
	 *
	 * @property {string|number} [step=1]
	 * 滑块把手移动的步长值。使用 `"any"` 可支持任意精度的浮点数，默认为 1。
	 *
	 * @property {function} [calculate=null]
	 * 用户调整滑块时调用的计算函数。函数接收当前滑块值作为参数，返回计算后的展示值。
	 * 若为 null 则不显示计算值。
	 *
	 * @property {string} [calcunits=null]
	 * 拼接在计算值后面的单位字符串（如 "MB"、"GB"）。若为 null 则不显示单位。
	 *
	 * @property {boolean} [disabled=false]
	 * 指定组件是否处于禁用状态。禁用后用户无法操作滑块。
	 */

	/**
	 * 初始化 UIRangeSlider 组件。
	 *
	 * 保存初始值，并将传入的 options 与默认值合并：
	 * min=0, max=100, step=1, calculate=null, calcunits=null, disabled=false。
	 *
	 * @param {string|number} value - 滑块初始值。
	 * @param {LuCI.ui.RangeSlider.InitOptions} [options] - 附加初始化选项。
	 *
	 * @example
	 * const slider = new UIRangeSlider(50, { min: 0, max: 100 });
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({
			min: 0,
			max: 100,
			step: 1,
			calculate: null,
			calcunits: null,
			disabled: false,
		}, options);
	},

	/**
	 * 渲染范围滑块的 DOM 结构。
	 *
	 * 创建以下 DOM 元素：
	 * - `<input type="range">`：滑块控件，设置 min/max/step/value 及 disabled 属性。
	 * - `<output class="cbi-range-slider-value">`：实时显示滑块当前原始值。
	 * - `<output class="cbi-range-slider-calc">`：（可选）显示计算后的值，
	 *   仅当 options.calculate 为函数时渲染。
	 * - `<span class="cbi-range-slider-calc-units">`：（可选）显示单位后缀，
	 *   仅当存在计算值时渲染。
	 * - 容器 `<div class="cbi-range-slider">`：包裹以上所有元素。
	 *
	 * @override
	 * @returns {HTMLElement} 渲染完成的滑块容器 DOM 节点。
	 *
	 * @example
	 * const slider = new UIRangeSlider(75, { min: 0, max: 100 });
	 * document.getElementById('settings').appendChild(slider.render());
	 */
	/** @override */
	render() {
		this.sliderEl = E('input', {
			'type': 'range',
			'id': this.options.id,
			'min': this.options.min,
			'max': this.options.max,
			'step': this.options.step || 'any',
			'value': this.value,
			'disabled': this.options.disabled ? '' : null
		});

		this.calculatedvalue = (typeof this.options.calculate === 'function')
			? this.options.calculate(this.value)
			: null;

		this.calcEl = E('output', { 'class': 'cbi-range-slider-calc' }, this.calculatedvalue);

		this.calcunitsEl = E('span', { 'class': 'cbi-range-slider-calc-units' },
			this.options.calcunits
			? '&nbsp;' + this.options.calcunits
			: ''
		);

		const container = E('div', { 'class': 'cbi-range-slider' }, [
			this.sliderEl,
			this.valueEl = E('output', { 'for': this.options.id, 'class': 'cbi-range-slider-value' }, this.value),
			this.calculatedvalue ? E('br') : null,
			this.calculatedvalue ? this.calcEl : null,
			this.calculatedvalue ? this.calcunitsEl : null,
		].filter(Boolean));

		this.node = container;

		this.setUpdateEvents(this.sliderEl, 'input', 'blur');
		this.setChangeEvents(this.sliderEl, 'change');

		/**
		 * 监听滑块输入事件：同步显示当前值，并在有 calculate 函数时更新计算值，
		 * 同时标记容器节点为已变更状态。
		 */
		this.sliderEl.addEventListener('input', () => {
			const val = this.sliderEl.value;
			this.valueEl.textContent = val;

			if (typeof this.options.calculate === 'function') {
				// 更新存储的计算值，并同步更新显示
				this.calculatedvalue = this.options.calculate(val);
				this.calcEl.textContent = this.calculatedvalue;
			}

			this.node.setAttribute('data-changed', true);
		});

		dom.bindClassInstance(container, this);

		return container;
	},

	/**
	 * 获取滑块当前原始值。
	 *
	 * @override
	 * @returns {string} 滑块 input 元素的当前字符串值。
	 *
	 * @example
	 * const slider = new ui.RangeSlider(50, { min: 0, max: 100 });
	 * slider.render();
	 * console.log(slider.getValue()); // "50"
	 */
	getValue() {
		return this.sliderEl.value;
	},

	/**
	 * 返回由 `calculate` 回调函数计算得出的衍生值。
	 * 若构造时未传入 `calculate` 选项，则该方法返回 `undefined`。
	 *
	 * @instance
	 * @memberof LuCI.ui.RangeSlider
	 * @returns {*} 由 options.calculate 函数处理后的计算结果。
	 *
	 * @example
	 * // 假设 calculate: v => v * 2
	 * slider.setValue(10);
	 * console.log(slider.getCalculatedValue()); // 20
	 */
	getCalculatedValue() {
		return this.calculatedvalue;
	},

	/**
	 * 设置滑块的值，同时同步更新数值显示元素和计算值显示元素。
	 *
	 * @override
	 * @param {string|number} value - 要设置的新值，须在 min～max 范围内。
	 *
	 * @example
	 * slider.setValue(75);
	 * // sliderEl.value === "75"
	 * // valueEl.textContent === "75"
	 */
	setValue(value) {
		this.sliderEl.value = value;
		this.valueEl.textContent = value;

		if (typeof this.options.calculate === 'function') {
			this.calculatedvalue = this.options.calculate(value);
			this.calcEl.textContent = this.calculatedvalue;
		}
	}
});

/**
 * 实例化一个隐藏输入字段组件。
 *
 * @constructor Hiddenfield
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 *
 * @classdesc
 * `Hiddenfield` 类封装了 HTML `<input type="hidden">` 元素，
 * 用于在表单中存储不需要向用户展示的数据。
 *
 * 通常不需要在视图代码中直接创建此类实例，`LuCI.form` 在实例化
 * CBI 表单时会自动创建它。
 *
 * 该类随 `LuCI.ui` 自动实例化。在视图中使用时，请 `require ui`
 * 并通过 `ui.Hiddenfield` 引用；在外部脚本中通过
 * `L.require("ui").then(...)` 访问返回实例的 `Hiddenfield` 属性。
 *
 * @param {string|string[]} [value=null] - 初始输入值。
 * @param {LuCI.ui.AbstractElement.InitOptions} [options] - 初始化隐藏字段的选项对象。
 *
 * @example
 * const hf = new ui.Hiddenfield('secret-token', { id: 'token-field' });
 * document.body.appendChild(hf.render());
 * console.log(hf.getValue()); // "secret-token"
 */
const UIHiddenfield = UIElement.extend(/** @lends LuCI.ui.Hiddenfield.prototype */ {
	/**
	 * 初始化隐藏字段实例，保存初始值与选项。
	 *
	 * @private
	 * @param {string|string[]} value - 字段初始值。
	 * @param {LuCI.ui.AbstractElement.InitOptions} options - 配置选项。
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({

		}, options);
	},

	/**
	 * 渲染隐藏 input 元素并完成绑定，返回 DOM 节点。
	 *
	 * @override
	 * @returns {HTMLInputElement} 渲染好的 `<input type="hidden">` 元素。
	 *
	 * @example
	 * const node = hf.render();
	 * // node.type === 'hidden'
	 * // node.value === 'secret-token'
	 */
	render() {
		const hiddenEl = E('input', {
			'id': this.options.id,
			'type': 'hidden',
			'value': this.value
		});

		return this.bind(hiddenEl);
	},

	/**
	 * 将隐藏输入元素与当前类实例进行绑定，设置 this.node 并注册实例引用。
	 *
	 * @private
	 * @param {HTMLInputElement} hiddenEl - 待绑定的 `<input type="hidden">` 元素。
	 * @returns {HTMLInputElement} 绑定完成后的元素。
	 */
	bind(hiddenEl) {
		this.node = hiddenEl;

		dom.bindClassInstance(hiddenEl, this);

		return hiddenEl;
	},

	/**
	 * 获取隐藏字段的当前值。
	 *
	 * @override
	 * @returns {string} 隐藏 input 元素的 value 属性值。
	 *
	 * @example
	 * hf.setValue('new-token');
	 * console.log(hf.getValue()); // "new-token"
	 */
	getValue() {
		return this.node.value;
	},

	/**
	 * 设置隐藏字段的值。
	 *
	 * @override
	 * @param {string} value - 要写入的新值。
	 *
	 * @example
	 * hf.setValue('updated-secret');
	 * // this.node.value === 'updated-secret'
	 */
	setValue(value) {
		this.node.value = value;
	}
});

/**
 * 实例化一个文件上传组件。
 *
 * @constructor FileUpload
 * @memberof LuCI.ui
 * @augments LuCI.ui.AbstractElement
 *
 * @classdesc
 * `FileUpload` 类实现了一个综合性文件管理组件，允许用户在预定义的远程目录下
 * 上传、浏览、选择和删除文件，并可选地支持目录创建与文件下载。
 *
 * 通常不需要在视图代码中直接创建此类实例，`LuCI.form` 在实例化
 * CBI 表单时会自动创建它。
 *
 * 该类随 `LuCI.ui` 自动实例化。在视图中使用时，请 `require ui`
 * 并通过 `ui.FileUpload` 引用；在外部脚本中通过
 * `L.require("ui").then(...)` 访问返回实例的 `FileUpload` 属性。
 *
 * @param {string|string[]} [value=null] - 初始选定的文件路径。
 * @param {LuCI.ui.FileUpload.InitOptions} [options] - 组件初始化选项。
 *
 * @example
 * const fu = new ui.FileUpload('/etc/luci-uploads/config.tar.gz', {
 *   root_directory: '/etc/luci-uploads',
 *   enable_upload: true,
 *   enable_remove: true,
 *   enable_download: true
 * });
 * document.body.appendChild(await fu.render());
 */
const UIFileUpload = UIElement.extend(/** @lends LuCI.ui.FileUpload.prototype */ {
	/**
	 * FileUpload 组件初始化选项。
	 * 在 {@link LuCI.ui.AbstractElement.InitOptions} 基础上扩展了以下属性：
	 *
	 * @typedef {LuCI.ui.AbstractElement.InitOptions} InitOptions
	 * @memberof LuCI.ui.FileUpload
	 *
	 * @property {boolean} [browser=false]
	 * 若为 `true`，则以纯文件浏览器模式运行，渲染完成后自动打开目录列表。
	 *
	 * @property {boolean} [show_hidden=false]
	 * 是否在浏览远程文件时显示隐藏文件（以 `.` 开头的文件）。
	 * 注意：这不是安全功能，隐藏文件始终存在于远程列表中，
	 * 此选项仅控制是否在界面上渲染它们。
	 *
	 * @property {boolean} [enable_upload=true]
	 * 是否允许用户上传文件。为 `false` 时不渲染上传控件。
	 * 注意：这不是安全功能，实际的上传权限由服务端 ACL 决定。
	 *
	 * @property {boolean} [enable_remove=true]
	 * 是否允许用户删除文件。为 `false` 时不渲染删除按钮。
	 * 注意：这不是安全功能，实际的删除权限由服务端 ACL 决定。
	 *
	 * @property {boolean} [directory_create=false]
	 * 是否允许用户在当前浏览路径下创建新目录。
	 *
	 * @property {boolean} [directory_select=false]
	 * 若为 `true`，组件仅允许选择目录而非文件。
	 *
	 * @property {boolean} [enable_download=false]
	 * 是否允许用户下载文件（在浏览列表中显示"下载"按钮）。
	 *
	 * @property {string} [root_directory=/etc/luci-uploads]
	 * 文件上传与浏览操作的根目录路径。组件会阻止用户浏览该目录以外的路径。
	 * 注意：这不是安全功能，实际目录访问权限由服务端 ACL 决定。
	 */
	/**
	 * 初始化文件上传组件，保存初始值与配置选项（含默认值）。
	 *
	 * @private
	 * @param {string|string[]} value - 初始文件路径。
	 * @param {LuCI.ui.FileUpload.InitOptions} options - 组件配置选项。
	 */
	__init__(value, options) {
		this.value = value;
		this.options = Object.assign({
			browser: false,
			directory_create: false,
			directory_select: false,
			show_hidden: false,
			enable_upload: true,
			enable_remove: true,
			enable_download: false,
			root_directory: '/etc/luci-uploads'
		}, options);
	},

	/**
	 * 将文件浏览器容器元素与当前类实例进行绑定，注册更新/变更事件。
	 *
	 * @private
	 * @param {HTMLElement} browserEl - 文件浏览器容器 DOM 元素。
	 * @returns {HTMLElement} 绑定完成后的容器元素。
	 */
	bind(browserEl) {
		this.node = browserEl;

		this.setUpdateEvents(browserEl, 'cbi-fileupload-select', 'cbi-fileupload-cancel');
		this.setChangeEvents(browserEl, 'cbi-fileupload-select', 'cbi-fileupload-cancel');

		dom.bindClassInstance(browserEl, this);

		return browserEl;
	},

	/**
	 * 渲染文件上传组件的完整 DOM 结构。
	 * 若当前已有初始值，先通过 `fs.stat` 获取文件信息，再决定按钮标签内容。
	 * 在浏览器模式（`options.browser === true`）下，渲染完成后自动触发目录列表展开。
	 *
	 * @override
	 * @returns {Promise<HTMLElement>} 解析为渲染完成的组件根元素的 Promise。
	 *
	 * @example
	 * fu.render().then(node => document.body.appendChild(node));
	 */
	render() {
		const renderFileBrowser = L.resolveDefault(this.value != null ? fs.stat(this.value) : null).then(L.bind((stat) => {
			let label;

			if (L.isObject(stat))
				this.stat = stat;

			// 根据文件状态决定按钮显示标签
			if (this.stat != null && this.stat.type === 'directory')
				label = [ this.iconForType(this.stat.type), ' %s'.format(this.truncatePath(this.stat.path)) ];
			else if (this.stat != null && this.stat.type !== 'directory')
				label = [ this.iconForType(this.stat.type), ' %s (%1000mB)'.format(this.truncatePath(this.stat.path), this.stat.size) ];
			else if (this.value != null)
				label = [ this.iconForType('file'), ' %s (%s)'.format(this.truncatePath(this.value), _('File not accessible')) ];
			else
				label = [ this.options.directory_select ? _('Select directory…') : _('Select file…') ];
			let btnOpenFileBrowser = E('button', {
				'class': 'btn open-file-browser',
				'click': UI.prototype.createHandlerFn(this, 'handleFileBrowser'),
				'disabled': this.options.disabled ? '' : null
			}, label);
			const fileBrowserEl = E('div', { 'id': this.options.id }, [
				btnOpenFileBrowser,
				E('div', {
					'class': 'cbi-filebrowser'
				}),
				E('input', {
					'type': 'hidden',
					'name': this.options.name,
					'value': this.value
				})
			]);
			return this.bind(fileBrowserEl);
		}, this));
		// 浏览器模式：渲染完成后自动点击"选择"按钮打开目录列表
		if (this.options.browser) {
			return renderFileBrowser.then((fileBrowserEl) => {
				const btnOpenFileBrowser = fileBrowserEl.getElementsByClassName('open-file-browser').item(0);
				btnOpenFileBrowser.click();
				return fileBrowserEl;
			});
		}
		return renderFileBrowser
	},

	/**
	 * 截断过长的路径字符串，保留首尾各 25 个字符，中间用省略号替代。
	 *
	 * @private
	 * @param {string} path - 原始路径字符串。
	 * @returns {string} 长度超过 50 个字符时返回截断后的路径，否则原样返回。
	 *
	 * @example
	 * truncatePath('/etc/luci-uploads/very/long/path/to/some/file.txt');
	 * // => "/etc/luci-uploads/very/l…h/to/some/file.txt"
	 */
	truncatePath(path) {
		if (path.length > 50)
			path = `${path.substring(0, 25)}…${path.substring(path.length - 25)}`;

		return path;
	},

	/**
	 * 根据文件类型返回对应的图标 `<img>` 元素。
	 *
	 * @private
	 * @param {'symlink'|'directory'|string} type - 文件类型字符串。
	 * @returns {HTMLImageElement} 对应类型的 SVG 图标元素。
	 *
	 * @example
	 * const icon = this.iconForType('directory');
	 * // 返回文件夹图标 img 元素
	 */
	iconForType(type) {
		switch (type) {
		case 'symlink':
			return E('img', {
				'src': L.resource('cbi/link.svg'),
				'width': 16,
				'title': _('Symbolic link'),
				'class': 'middle'
			});

		case 'directory':
			return E('img', {
				'src': L.resource('cbi/folder.svg'),
				'width': 16,
				'title': _('Directory'),
				'class': 'middle'
			});

		default:
			return E('img', {
				'src': L.resource('cbi/file.svg'),
				'width': 16,
				'title': _('File'),
				'class': 'middle'
			});
		}
	},

	/**
	 * 规范化路径字符串，处理多余斜杠、`.` 及 `..` 等特殊路径段，
	 * 并移除末尾的 `/`（根路径 `/` 除外）。
	 *
	 * @private
	 * @param {string} path - 需要规范化的原始路径。
	 * @returns {string} 规范化后的路径字符串。
	 *
	 * @example
	 * canonicalizePath('/etc//luci-uploads/./subdir/../file');
	 * // => "/etc/luci-uploads/file"
	 */
	canonicalizePath(path) {
	return path.replace(/\/{2,}/g, '/')                // 合并连续斜杠
				.replace(/\/\.(\/|$)/g, '/')           // 移除 `/.`
				.replace(/[^\/]+\/\.\.(\/|$)/g, '/')   // 解析 `/..`
				.replace(/\/$/g, (m, o, s) => s.length > 1 ? '' : '/'); // 仅当非根路径时移除末尾 `/`
	},

	/**
	 * 将路径分割为从根目录开始的各级目录段数组，用于面包屑导航渲染。
	 * 若给定路径不超出根目录，则返回仅含根目录的单元素数组。
	 *
	 * @private
	 * @param {string} path - 需要分割的完整路径。
	 * @returns {string[]} 以根目录为第一个元素的路径段数组。
	 *
	 * @example
	 * // root_directory = '/etc/luci-uploads'
	 * splitPath('/etc/luci-uploads/subdir/file.txt');
	 * // => ['/etc/luci-uploads', 'subdir', 'file.txt']
	 */
	splitPath(path) {
		const croot = this.canonicalizePath(this.options.root_directory ?? '/');
		const cpath = this.canonicalizePath(path ?? '/');

		if (cpath.length <= croot.length)
			return [ croot ];

		const parts = cpath.substring(croot.length).split(/\//).filter(p => p !== '');

		parts.unshift(croot);

		return parts;
	},

	/**
	 * 处理"创建目录"按钮点击事件。
	 * 弹出模态对话框，让用户输入目录名称，确认后调用 `fs.exec('mkdir', ...)` 创建目录。
	 * 创建成功后刷新当前路径列表；失败则弹出错误通知。
	 *
	 * @private
	 * @param {string} path - 当前浏览目录的路径，新目录将在此路径下创建。
	 * @param {Event} ev - 触发该操作的 DOM 事件对象。
	 *
	 * @example
	 * // 用户在 /etc/luci-uploads 目录下点击"创建"按钮
	 * this.handleCreateDirectory('/etc/luci-uploads', event);
	 * // 弹出对话框，用户输入 "newdir" 后点击 OK
	 * // 执行 mkdir -p /etc/luci-uploads/newdir
	 */
	handleCreateDirectory(path, ev) {
		const container = E('div', { 'class': 'uci-dialog' });

		const input = E('input', {
			'type': 'text',
			'placeholder': _('Directory name'),
			'style': 'margin-right: 0.5em'
		});

		const okBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button',
			'click': async () => {
				var directoryName = input.value.trim();
				if (!directoryName) {
					alert(_('Directory name cannot be empty.'));
					return;
				}

				try {
					// 使用当前上传路径作为基础路径（可根据实际需求自定义获取方式）
					var basePath = path || '/tmp';
					var fullPath = basePath + '/' + directoryName;

					await fs.exec('mkdir', ['-p', fullPath]).then(L.bind((path, ev) => {
						return this.handleSelect(path, null, ev);
					}, this, path, ev));
				} catch (err) {
					UI.prototype.addTimeLimitedNotification(_('Error'), E('p', _('Failed to create directory: %s').format(err.message)), 5000, 'error');
				} finally {
					UI.prototype.hideModal();
				}
			}
		}, _('OK'));

		var cancelBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button',
			'click': () => UI.prototype.hideModal(),
		}, _('Cancel'));

        container.appendChild(input);
        container.appendChild(okBtn);
        container.appendChild(cancelBtn);


		UI.prototype.showModal(_('Create Directory'), [
			container
		]);
	},

	/**
	 * 处理文件上传表单的提交事件。
	 * 从表单中读取选定文件与目标文件名，进行合法性校验后，
	 * 通过 `cgi-upload` 接口以 `multipart/form-data` 格式上传文件，
	 * 并在上传过程中实时更新按钮文本显示上传进度百分比。
	 *
	 * @private
	 * @param {string} path - 目标上传目录路径。
	 * @param {Object[]} list - 当前目录的文件列表，用于检测同名文件冲突。
	 * @param {Event} ev - 表单提交事件对象（来自"Upload file"按钮的 click 事件）。
	 * @returns {Promise<void>|undefined} 上传成功后刷新目录列表；若校验不通过则返回 undefined。
	 *
	 * @example
	 * // 用户选择文件 config.tar.gz，目标路径为 /etc/luci-uploads
	 * this.handleUpload('/etc/luci-uploads', currentList, submitEvent);
	 * // 上传过程中按钮显示 "45.23%"，上传完成后刷新目录
	 */
	handleUpload(path, list, ev) {
		const form = ev.target.parentNode;
		const fileinput = form.querySelector('input[type="file"]');
		const nameinput = form.querySelector('input[type="text"]');
		const filename = (nameinput.value != null ? nameinput.value : '').trim();

		ev.preventDefault();

		// 文件名为空、含斜杠、或未选择文件时中止
		if (filename == '' || filename.match(/\//) || fileinput.files[0] == null)
			return;

		const existing = list.filter(e => e.name == filename)[0];

		// 若已存在同名目录则提示并中止；若存在同名文件则询问是否覆盖
		if (existing != null && existing.type == 'directory')
			return alert(_('A directory with the same name already exists.'));
		else if (existing != null && !confirm(_('Overwrite existing file "%s" ?').format(filename)))
			return;

		const data = new FormData();

		data.append('sessionid', L.env.sessionid);
		data.append('filename', `${path}/${filename}`);
		data.append('filedata', fileinput.files[0]);

		return request.post(`${L.env.cgi_base}/cgi-upload`, data, {
			progress: L.bind((btn, ev) => {
				// 实时更新按钮文本为上传进度百分比
				btn.firstChild.data = '%.2f%%'.format((ev.loaded / ev.total) * 100);
			}, this, ev.target)
		}).then(L.bind((path, ev, res) => {
			const reply = res.json();

			if (L.isObject(reply) && reply.failure)
				alert(_('Upload request failed: %s').format(reply.message));

			return this.handleSelect(path, null, ev);
		}, this, path, ev));
	},

	/**
	 * 处理文件或目录的删除操作。
	 * 弹出确认对话框，用户确认后调用 `fs.remove` 删除指定路径。
	 * 若被删除的文件/目录正是当前选中值，则重置选择状态。
	 * 删除完成后刷新父目录列表；失败则弹出错误提示。
	 *
	 * @private
	 * @param {string} path - 要删除的文件或目录的完整路径。
	 * @param {Object} fileStat - 目标文件/目录的 stat 信息对象（含 `type` 属性）。
	 * @param {Event} ev - 触发删除操作的 DOM 事件对象。
	 * @returns {Promise<void>|undefined} 用户取消时返回 undefined，否则返回删除操作的 Promise。
	 *
	 * @example
	 * // 删除文件 /etc/luci-uploads/old.conf
	 * this.handleDelete('/etc/luci-uploads/old.conf', { type: 'file' }, event);
	 * // 弹出确认框："Do you really want to delete 'old.conf'?"
	 * // 确认后删除并刷新父目录
	 */
	handleDelete(path, fileStat, ev) {
		const parent = path.replace(/\/[^\/]+$/, '') ?? '/';
		const name = path.replace(/^.+\//, '');
		let msg;

		ev.preventDefault();

		if (fileStat.type == 'directory')
			msg = _('Do you really want to delete the "%s" directory recursively?').format(name);
		else
			msg = _('Do you really want to delete "%s" ?').format(name);

		if (confirm(msg)) {
			const button = this.node.firstElementChild;
			const hidden = this.node.lastElementChild;

			// 若正在删除的是当前选中文件，则同步清除选择状态
			if (path == hidden.value) {
				dom.content(button, this.options.directory_select ? _('Select directory…') : _('Select file…'));
				hidden.value = '';
			}

			return fs.remove(path).then(L.bind((parent, ev) => {
				return this.handleSelect(parent, null, ev);
			}, this, parent, ev)).catch(err => {
				alert(_('Delete request failed: %s').format(err.message));
			});
		}
	},

	/**
	 * 渲染文件上传区域 DOM 结构。
	 * 若 `options.enable_upload` 为 `false`，返回空元素。
	 * 否则渲染"Upload file…"链接及隐藏的上传表单（含文件选择器、文件名输入框和提交按钮）。
	 * 用户选择文件后，文件名自动填入输入框并激活提交按钮。
	 *
	 * @private
	 * @param {string} path - 文件上传的目标目录路径。
	 * @param {Object[]} list - 当前目录文件列表（传递给 handleUpload 用于冲突检测）。
	 * @returns {HTMLElement} 上传区域的 DOM 元素（或空 div）。
	 *
	 * @example
	 * const uploadArea = this.renderUpload('/etc/luci-uploads', fileList);
	 * container.appendChild(uploadArea);
	 */
	renderUpload(path, list) {
		if (!this.options.enable_upload)
			return E([]);

		return E([
			E('a', {
				'href': '#',
				'class': 'btn cbi-button-positive',
				'click': function(ev) {
					const uploadForm = ev.target.nextElementSibling;
					const fileInput = uploadForm.querySelector('input[type="file"]');

					// 显示上传表单并自动弹出系统文件选择对话框
					ev.target.style.display = 'none';
					uploadForm.style.display = '';
					fileInput.click();
				}
			}, _('Upload file…')),
			E('div', { 'class': 'upload', 'style': 'display:none' }, [
				E('input', {
					'type': 'file',
					'style': 'display:none',
					'change': function(ev) {
						const nameinput = ev.target.parentNode.querySelector('input[type="text"]');
						const uploadbtn = ev.target.parentNode.querySelector('button.cbi-button-save');

						// 自动从系统选择的文件路径中提取文件名并填充
						nameinput.value = ev.target.value.replace(/^.+[\/\\]/, '');
						uploadbtn.disabled = false;
					}
				}),
				E('button', {
					'class': 'btn',
					'click': function(ev) {
						ev.preventDefault();
						ev.target.previousElementSibling.click();
					}
				}, [ _('Browse…') ]),
				E('div', {}, E('input', { 'type': 'text', 'placeholder': _('Filename') })),
				E('button', {
					'class': 'btn cbi-button-save',
					'click': UI.prototype.createHandlerFn(this, 'handleUpload', path, list),
					'disabled': true
				}, [ _('Upload file') ])
			])
		]);
	},

	/**
	 * 渲染目录列表内容，包括面包屑导航、文件/目录条目列表以及底部操作栏。
	 * 每条目显示：图标、名称（可点击进入目录或选择文件）、最后修改时间、操作按钮组。
	 * 操作按钮根据配置项动态显示：选择、取消选择、下载、删除。
	 * 底部操作栏包含上传区域、创建目录按钮（可选）和取消按钮（非浏览器模式）。
	 *
	 * @private
	 * @param {HTMLElement} container - 文件浏览器容器 `.cbi-filebrowser` 元素。
	 * @param {string} path - 当前浏览目录的完整路径。
	 * @param {Object[]} list - 当前目录下的文件/目录信息对象数组，每项含 `name`、`type`、`mtime`、`size` 等字段。
	 *
	 * @example
	 * fs.list('/etc/luci-uploads').then(list => {
	 *   this.renderListing(browserContainer, '/etc/luci-uploads', list);
	 * });
	 */
	renderListing(container, path, list) {
		const breadcrumb = E('p');
		const rows = E('ul');

		// 目录优先，同类型按名称自然排序
		list.sort((a, b) => {
			return L.naturalCompare(a.type == 'directory', b.type == 'directory') ||
				   L.naturalCompare(a.name, b.name);
		});

		for (let i = 0; i < list.length; i++) {
			// 根据 show_hidden 选项决定是否跳过隐藏文件
			if (!this.options.show_hidden && list[i].name.charAt(0) == '.')
				continue;

			const entrypath = this.canonicalizePath(`${path}/${list[i].name}`);
			const selected = (entrypath == this.node.lastElementChild.value);
			const mtime = new Date(list[i].mtime * 1000);

			rows.appendChild(E('li', [
				E('div', { 'class': 'name' }, [
					this.iconForType(list[i].type),
					' ',
					// directory_select 模式下普通文件不可点击
					(this.options.directory_select && list[i].type !== 'directory') ?
					list[i].name :
					E('a', {
						'href': '#',
						'style': selected ? 'font-weight:bold' : null,
						'click': UI.prototype.createHandlerFn(this, 'handleSelect',
							entrypath, list[i].type != 'directory' ? list[i] : null)
					}, '%h'.format(list[i].name))
				]),
				E('div', { 'class': 'mtime hide-xs' }, [
					' %04d-%02d-%02d %02d:%02d:%02d '.format(
						mtime.getFullYear(),
						mtime.getMonth() + 1,
						mtime.getDate(),
						mtime.getHours(),
						mtime.getMinutes(),
						mtime.getSeconds())
				]),
				E('div', [
					// directory_select 模式下为目录显示"选择"按钮
					(this.options.directory_select && list[i].type === 'directory') ? E('button', {
						'class': 'btn cbi-button',
						'click': UI.prototype.createHandlerFn(this, 'handleSelect',
							entrypath, list[i].type === 'directory' ? list[i] : null)
					}, [ _('Select') ]) : '',
					// 当前已选中项显示"取消选择"按钮
					selected ? E('button', {
						'class': 'btn',
						'click': UI.prototype.createHandlerFn(this, 'handleReset')
					}, [ _('Deselect') ]) : '',
					// 启用下载且为普通文件时显示"下载"按钮
					this.options.enable_download && list[i].type == 'file' ? E('button', {
						'class': 'btn',
						'click': UI.prototype.createHandlerFn(this, 'handleDownload', entrypath, list[i])
					}, [ _('Download') ]) : '',
					// 启用删除时显示"删除"按钮
					this.options.enable_remove ? E('button', {
						'class': 'btn cbi-button-negative',
						'click': UI.prototype.createHandlerFn(this, 'handleDelete', entrypath, list[i])
					}, [ _('Delete') ]) : ''
				])
			]));
		}

		if (!rows.firstElementChild)
			rows.appendChild(E('em', _('No entries in this directory')));

		// 构建面包屑导航，从根目录逐级显示可点击的路径链接
		const dirs = this.splitPath(path);
		let cur = '';

		for (let i = 0; i < dirs.length; i++) {
			cur = (i === 0 || cur === '/') ? cur + dirs[i] : cur + '/' + dirs[i];
			dom.append(breadcrumb, [
				i ? ' » ' : '',
				E('a', {
					'href': '#',
					'click': UI.prototype.createHandlerFn(this, 'handleSelect', cur ?? '/', null)
				}, dirs[i] !== '/' ? '%h'.format(dirs[i]) : E('em', '(root)')),
			]);
		}

		dom.content(container, [
			breadcrumb,
			rows,
			E('div', { 'class': 'right' }, [
				this.renderUpload(path, list),
				(this.options.directory_create) ? E('a', {
					'href': '#',
					'class': 'btn cbi-button',
					'click': UI.prototype.createHandlerFn(this, 'handleCreateDirectory', path)
				}, _('Create')) : '',
				// 非浏览器模式下显示取消按钮
				!this.options.browser ? E('a', {
					'href': '#',
					'class': 'btn',
					'click': UI.prototype.createHandlerFn(this, 'handleCancel')
				}, _('Cancel')) : ''
			]),
		]);
	},

	/**
	 * 处理"取消"按钮点击事件，关闭文件浏览器面板并恢复"选择文件"按钮显示，
	 * 同时向组件节点派发 `cbi-fileupload-cancel` 自定义事件。
	 *
	 * @private
	 * @param {Event} ev - 取消按钮的 click 事件对象。
	 *
	 * @example
	 * // 用户点击"Cancel"按钮后浏览器面板收起，触发 cbi-fileupload-cancel 事件
	 * this.handleCancel(event);
	 */
	handleCancel(ev) {
		const button = this.node.firstElementChild;
		const browser = button.nextElementSibling;

		browser.classList.remove('open');
		button.style.display = '';

		this.node.dispatchEvent(new CustomEvent('cbi-fileupload-cancel', {}));

		ev.preventDefault();
	},

	/**
	 * 处理"取消选择"操作，清空已选中文件的隐藏值和按钮标签，
	 * 并调用 `handleCancel` 关闭文件浏览器面板。
	 *
	 * @private
	 * @param {Event} ev - 触发重置操作的 DOM 事件对象。
	 *
	 * @example
	 * // 用户点击"Deselect"按钮后当前选中值被清除，浏览器面板关闭
	 * this.handleReset(event);
	 */
	handleReset(ev) {
		const button = this.node.firstElementChild;
		const hidden = this.node.lastElementChild;

		hidden.value = '';
		dom.content(button, this.options.directory_select ? _('Select directory…') : _('Select file…'));

		this.handleCancel(ev);
	},

	/**
	 * 处理文件下载操作。
	 * 通过 `fs.read_direct` 以 Blob 形式读取文件内容，创建临时对象 URL，
	 * 构造隐藏的 `<a>` 元素并自动触发点击以触发浏览器下载，完成后清理资源。
	 *
	 * @private
	 * @param {string} path - 要下载的文件完整路径。
	 * @param {Object} fileStat - 文件的 stat 信息对象，用于获取下载文件名（`fileStat.name`）。
	 * @param {Event} ev - 触发下载操作的 DOM 事件对象。
	 *
	 * @example
	 * // 用户点击 /etc/luci-uploads/backup.tar.gz 的"Download"按钮
	 * this.handleDownload('/etc/luci-uploads/backup.tar.gz', { name: 'backup.tar.gz' }, event);
	 * // 浏览器弹出 backup.tar.gz 的下载保存对话框
	 */
	handleDownload(path, fileStat, ev) {
		fs.read_direct(path, 'blob').then((blob) => {
			const url = window.URL.createObjectURL(blob);
			let a = document.createElement('a');
			a.style.display = 'none';
			a.href = url;
			a.download = fileStat.name;
			document.body.appendChild(a);
			a.click();
			// 下载触发后撤销临时对象 URL，释放内存
			window.URL.revokeObjectURL(url);
		}).catch((err) => {
			alert(_('Download failed: %s').format(err.message));
		});
	},

	/**
	 * 处理文件/目录的选择操作。
	 * - 若 `fileStat` 为 null，表示用户点击了一个目录链接，则加载并渲染该目录的内容列表。
	 * - 若 `fileStat` 不为 null 且非浏览器模式，则将选中路径写入隐藏 input，
	 *   更新按钮标签，关闭浏览器面板，并派发 `cbi-fileupload-select` 事件。
	 *
	 * @private
	 * @param {string} path - 被选中的文件或目录的完整路径。
	 * @param {Object|null} fileStat - 若选中的是文件则为其 stat 信息对象，目录导航时为 null。
	 * @param {Event} ev - 触发选择操作的 DOM 事件对象。
	 *
	 * @example
	 * // 用户点击目录 /etc/luci-uploads/configs（目录导航）
	 * this.handleSelect('/etc/luci-uploads/configs', null, event);
	 * // → 显示加载动画并异步渲染该目录内容
	 *
	 * // 用户点击文件 /etc/luci-uploads/app.conf（文件选择）
	 * this.handleSelect('/etc/luci-uploads/app.conf', { type: 'file', size: 1024 }, event);
	 * // → 更新按钮标签为文件名和大小，关闭浏览器，派发选中事件
	 */
	handleSelect(path, fileStat, ev) {
		const browser = dom.parent(ev.target, '.cbi-filebrowser');
		const ul = browser.querySelector('ul');

		if (fileStat == null) {
			// 目录导航：显示加载提示并异步获取目录内容
			dom.content(ul, E('em', { 'class': 'spinning' }, _('Loading directory contents…')));
			L.resolveDefault(fs.list(path), []).then(L.bind(this.renderListing, this, browser, path));
		}
		else if (!this.options.browser) {
			// 文件选择：更新 UI 并关闭浏览器面板
			const button = this.node.firstElementChild;
			const hidden = this.node.lastElementChild;

			path = this.canonicalizePath(path);

			dom.content(button, [
				this.iconForType(fileStat.type),
				' %s (%1000mB)'.format(this.truncatePath(path), fileStat.size)
			]);

			browser.classList.remove('open');
			button.style.display = '';
			hidden.value = path;

			this.stat = Object.assign({ path: path }, fileStat);
			this.node.dispatchEvent(new CustomEvent('cbi-fileupload-select', { detail: this.stat }));
		}
	},

	/**
	 * 处理"打开文件浏览器"按钮点击事件。
	 * 确定初始浏览路径（优先使用当前选中文件所在目录，回退到 `initial_directory` 或 `root_directory`），
	 * 确保路径在根目录范围内，然后异步加载目录列表并渲染文件浏览器面板。
	 * 若页面上已有其他打开的文件浏览器，则先关闭它们。
	 *
	 * @private
	 * @param {Event} ev - 打开文件浏览器按钮的 click 事件对象。
	 * @returns {Promise<void>} 解析为目录列表渲染完成的 Promise。
	 *
	 * @example
	 * // 用户点击"Select file…"按钮
	 * this.handleFileBrowser(event);
	 * // → 关闭其他打开的文件浏览器 → 显示当前浏览器面板 → 加载目录列表
	 */
	handleFileBrowser(ev) {
		const button = ev.target;
		const browser = button.nextElementSibling;
		let path = this.stat ? this.stat.path.replace(/\/[^\/]+$/, '') : (this.options.initial_directory ?? this.options.root_directory);

		// 确保路径在根目录范围内，越界时回退到根目录
		if (path.indexOf(this.options.root_directory) != 0)
			path = this.options.root_directory;

		ev.preventDefault();

		return L.resolveDefault(fs.list(path), []).then(L.bind((button, browser, path, list) => {
			// 关闭页面上所有其他已打开的文件浏览器实例
			document.querySelectorAll('.cbi-filebrowser.open').forEach(browserEl => {
				dom.findClassInstance(browserEl).handleCancel(ev);
			});

			button.style.display = 'none';
			browser.classList.add('open');

			return this.renderListing(browser, path, list);
		}, this, button, browser, path));
	},

	/**
	 * 获取当前已选中的文件路径值。
	 *
	 * @override
	 * @returns {string} 组件内隐藏 input 元素中存储的文件路径。
	 *
	 * @example
	 * const path = fu.getValue();
	 * console.log(path); // "/etc/luci-uploads/config.tar.gz"
	 */
	getValue() {
		return this.node.lastElementChild.value;
	},

	/**
	 * 设置组件的当前选中文件路径值（写入隐藏 input 元素）。
	 *
	 * @override
	 * @param {string} value - 要设置的文件路径字符串。
	 *
	 * @example
	 * fu.setValue('/etc/luci-uploads/new-config.tar.gz');
	 */
	setValue(value) {
		this.node.lastElementChild.value = value;
	}
});


function scrubMenu(node) {
	let hasSatisfiedChild = false;

	if (L.isObject(node.children)) {
		for (const k in node.children) {
			const child = scrubMenu(node.children[k]);
		if (child.title && !child.firstchild_ineligible)
				hasSatisfiedChild ||= child.satisfied;
		}
	}

	if (L.isObject(node.action) &&
		node.action.type == 'firstchild' &&
		hasSatisfiedChild == false)
		node.satisfied = false;

	return node;
}

/**
 * @class UIMenu
 * @memberof LuCI.ui
 * @hideconstructor
 *
 * @classdesc
 * 菜单管理类（单例）。
 * 负责从服务端加载菜单树、缓存菜单数据、提供子菜单节点查询等功能。
 * 通过 `LuCI.ui.menu` 访问此单例实例。
 *
 * @example
 * // 加载菜单树并获取根节点的子菜单
 * L.require('ui').then(function(ui) {
 *   ui.menu.load().then(function(root) {
 *     const children = ui.menu.getChildren(root);
 *     children.forEach(function(node) {
 *       console.log(node.name, node.title);
 *     });
 *   });
 * });
 */
const UIMenu = baseclass.singleton(/** @lends LuCI.ui.menu.prototype */ {
	/**
	 * @typedef {Object} MenuNode
	 * @memberof LuCI.ui.menu
	 *
	 * @description
	 * 表示菜单树中的单个节点，包含节点的名称、排序权重、标题、
	 * 依赖是否满足、是否只读以及子节点列表等信息。
	 *
	 * @property {string} name
	 *   节点的内部名称，与 URL 路径中使用的名称一致。
	 * @property {number} order
	 *   节点的排序索引，值越小越靠前。
	 * @property {string} [title]
	 *   节点的显示标题。若为 `null`，则该节点在菜单中隐藏。
	 * @property {boolean} satisfied
	 *   布尔值，指示该菜单节点的所有依赖项是否已满足。
	 * @property {boolean} [readonly]
	 *   布尔值，指示该菜单节点对应的 ACL 权限是否为只读。
	 * @property {LuCI.ui.menu.MenuNode[]} [children]
	 *   子菜单节点数组。
	 */

	/**
	 * 加载并缓存当前菜单树。
	 *
	 * 首先尝试从 session 本地缓存读取菜单数据；
	 * 若缓存不存在或已失效，则向服务端请求 `/admin/menu` 接口并将结果
	 * 经由 `scrubMenu()` 清洗后存入缓存。
	 *
	 * @returns {Promise<LuCI.ui.menu.MenuNode>}
	 *   返回一个 Promise，解析为菜单树的根节点对象。
	 *
	 * @example
	 * // 加载菜单并打印根节点下所有子节点名称
	 * ui.menu.load().then(function(root) {
	 *   console.log('菜单加载完毕，根节点：', root);
	 * });
	 */
	load() {
		if (this.menu == null)
			this.menu = session.getLocalData('menu');

		if (!L.isObject(this.menu)) {
			this.menu = request.get(L.url('admin/menu')).then(L.bind((menu) => {
				this.menu = scrubMenu(menu.json());
				session.setLocalData('menu', this.menu);

				return this.menu;
			}, this));
		}

		return Promise.resolve(this.menu);
	},

	/**
	 * 清除内部菜单缓存，强制下次页面加载时重新获取菜单数据。
	 *
	 * 调用此方法后，下次调用 `load()` 时将重新向服务端请求菜单结构。
	 * 通常在用户登录/注销或权限变更后调用。
	 *
	 * @returns {void}
	 *
	 * @example
	 * // 注销时清除菜单缓存
	 * ui.menu.flushCache();
	 */
	flushCache() {
		session.setLocalData('menu', null);
	},

	/**
	 * 获取指定菜单节点的直接子节点列表。
	 *
	 * 该方法会过滤掉依赖不满足（`satisfied === false`）的节点和没有 `title`
	 * 属性的隐藏节点。对于 `alias` 或 `rewrite` 类型的动作，会自动解析
	 * 目标路径并合并对应节点的子节点与动作。
	 * 返回的数组按 `order` 升序排列，`order` 相同时按 `name` 自然排序。
	 *
	 * @param {LuCI.ui.menu.MenuNode} [node]
	 *   要查询子节点的菜单节点。若省略，默认使用菜单树的内部根节点。
	 *
	 * @returns {LuCI.ui.menu.MenuNode[]}
	 *   返回排序后的子菜单节点数组。
	 *
	 * @example
	 * // 获取顶级菜单项
	 * ui.menu.load().then(function() {
	 *   const topLevel = ui.menu.getChildren();
	 *   topLevel.forEach(function(item) {
	 *     console.log(item.name, item.order, item.title);
	 *   });
	 * });
	 *
	 * @example
	 * // 获取某个子节点的二级菜单
	 * ui.menu.load().then(function(root) {
	 *   const children = ui.menu.getChildren(root);
	 *   if (children.length > 0) {
	 *     const subChildren = ui.menu.getChildren(children[0]);
	 *     console.log('二级菜单：', subChildren);
	 *   }
	 * });
	 */
	getChildren(node) {
		const children = [];

		if (node == null)
			node = this.menu;

		for (const k in node.children) {
			if (!node.children.hasOwnProperty(k))
				continue;

			if (!node.children[k].satisfied)
				continue;

			if (!node.children[k].hasOwnProperty('title'))
				continue;

			let subnode = Object.assign(node.children[k], { name: k });

			if (L.isObject(subnode.action) && subnode.action.path != null &&
				(subnode.action.type == 'alias' || subnode.action.type == 'rewrite')) {
				let root = this.menu;
				const path = subnode.action.path.split('/');

				for (let i = 0; root != null && i < path.length; i++)
					root = L.isObject(root.children) ? root.children[path[i]] : null;

				if (root)
					subnode = Object.assign({}, subnode, {
						children: root.children,
						action: root.action
					});
			}

			children.push(subnode);
		}

		return children.sort((a, b) => {
			const wA = a.order ?? 1000;
			const wB = b.order ?? 1000;

			if (wA != wB)
				return wA - wB;

			return L.naturalCompare(a.name, b.name);
		});
	}
});

/**
 * @class UITable
 * @memberof LuCI.ui
 *
 * @classdesc
 * 表格 UI 组件类。
 * 封装了可排序数据表格的创建、数据更新、排序状态管理及用户交互处理。
 * 支持通过构造参数直接创建新表格，也支持从已有 DOM 标记初始化。
 *
 * @example
 * // 使用标题数组创建一个新的可排序表格
 * const table = new UITable(
 *   ['名称', '状态', '操作'],
 *   { id: 'my-table', sortable: true },
 *   '暂无数据'
 * );
 * document.body.appendChild(table.render());
 *
 * // 填充数据
 * table.update([
 *   ['路由器A', '在线', '编辑'],
 *   ['路由器B', '离线', '编辑']
 * ]);
 */
const UITable = baseclass.extend(/** @lends LuCI.ui.table.prototype */ {
	/**
	 * 表格组件构造函数。
	 *
	 * 当 `captions` 为数组时，创建全新的 `<table>` 元素，按参数配置列标题与排序；
	 * 当 `captions` 为 DOM 节点或选择器字符串时，调用 `initFromMarkup()` 从已有
	 * HTML 标记初始化（`options`、`placeholder` 参数会被忽略）。
	 *
	 * @param {string[]|Node|string} captions
	 *   列标题字符串数组，或已有表格的 DOM 节点/CSS 选择器。
	 * @param {Object} options
	 *   表格配置项。
	 * @param {string} [options.id]
	 *   表格元素的 HTML id，省略时自动生成随机 id。
	 * @param {boolean|Object} [options.sortable=true]
	 *   是否允许列排序。`true` 表示全部列可排序，`false` 禁用排序，
	 *   也可传入对象按列索引单独控制（`{ 0: false }` 表示第0列不可排序）。
	 * @param {string|string[]|Object} [options.captionClasses]
	 *   按列索引为表头单元格附加的额外 CSS 类名。
	 * @param {string|string[]} [options.classes]
	 *   附加到 `<table>` 根元素的额外 CSS 类名。
	 * @param {string} [options.placeholder]
	 *   表格无数据时的占位文本（可被 `update()` 的 `placeholderText` 覆盖）。
	 * @param {string|Node} [placeholder]
	 *   初始占位行内容，仅在 `captions` 为数组时有效。
	 *
	 * @example
	 * // 从数组创建表格
	 * const t = new UITable(['IP地址', '接口', '备注'], { id: 'arp-table' }, '无 ARP 记录');
	 *
	 * @example
	 * // 从已有 DOM 节点初始化
	 * const t = new UITable(document.querySelector('#existing-table'));
	 */
	__init__(captions, options, placeholder) {
		if (!Array.isArray(captions)) {
			this.initFromMarkup(captions);

			return;
		}

		const id = options.id ?? 'table%08x'.format(Math.random() * 0xffffffff);

		const table = E('table', { 'id': id, 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles', 'click': UI.prototype.createHandlerFn(this, 'handleSort') })
		]);

		this.id = id;
		this.node = table
		this.options = options;

		const sorting = this.getActiveSortState();

		for (let i = 0; i < captions.length; i++) {
			if (captions[i] == null)
				continue;

			const th = E('th', { 'class': 'th' }, [ captions[i] ]);

			if (typeof(options.captionClasses) == 'object')
				DOMTokenList.prototype.add.apply(th.classList, L.toArray(options.captionClasses[i]));

			if (options.sortable !== false && (typeof(options.sortable) != 'object' || options.sortable[i] !== false)) {
				th.setAttribute('data-sortable-row', true);

				if (sorting && sorting[0] == i)
					th.setAttribute('data-sort-direction', sorting[1] ? 'desc' : 'asc');
			}

			table.firstElementChild.appendChild(th);
		}

		if (placeholder) {
			const trow = table.appendChild(E('tr', { 'class': 'tr placeholder' }));
			const td = trow.appendChild(E('td', { 'class': 'td' }, placeholder));

			if (typeof(captionClasses) == 'object')
				DOMTokenList.prototype.add.apply(td.classList, L.toArray(captionClasses[0]));
		}

		DOMTokenList.prototype.add.apply(table.classList, L.toArray(options.classes));
	},

	/**
	 * 使用新数据更新表格内容。
	 *
	 * 若存在激活的排序状态，会在渲染前对 `data` 进行原地排序。
	 * 新行会复用已有 `<tr>` 元素（替换或追加），多余的旧行会被删除。
	 * 若更新后表格仍为空，则显示占位行。
	 *
	 * @param {Array<Array<*>>} data
	 *   二维数组，每个子数组表示一行，每个元素对应一列的值。
	 *   单元格值可以是字符串、DOM 节点、DocumentFragment，
	 *   也可以是 `[rawValue, displayValue]` 的二元组（rawValue 用于排序/筛选）。
	 * @param {string} [placeholderText]
	 *   覆盖构造时 `options.placeholder` 的无数据占位文本。
	 *
	 * @returns {Node}
	 *   返回表格的根 DOM 节点（`<table>` 或 `<div class="table">`）。
	 *
	 * @example
	 * // 更新表格数据
	 * table.update([
	 *   [['192.168.1.1', '192.168.1.1'], 'eth0', '网关'],
	 *   ['10.0.0.1', 'br-lan', '局域网']
	 * ], '当前无路由条目');
	 */
	update(data, placeholderText) {
		const placeholder = placeholderText ?? this.options.placeholder ?? _('No data', 'empty table placeholder');
		const sorting = this.getActiveSortState();

		if (!Array.isArray(data))
			return;

		const headings = [].slice.call(this.node.firstElementChild.querySelectorAll('th, .th'));

		if (sorting) {
			const list = data.map(L.bind((row) => {
				return [ this.deriveSortKey(row[sorting[0]], sorting[0]), row ];
			}, this));

			list.sort((a, b) => {
				return sorting[1]
					? -L.naturalCompare(a[0], b[0])
					: L.naturalCompare(a[0], b[0]);
			});

			data.length = 0;

			list.forEach(item => {
				data.push(item[1]);
			});

			headings.forEach((th, i) => {
				if (i == sorting[0])
					th.setAttribute('data-sort-direction', sorting[1] ? 'desc' : 'asc');
				else
					th.removeAttribute('data-sort-direction');
			});
		}

		this.data = data;
		this.placeholder = placeholder;

		let n = 0;
		const rows = this.node.querySelectorAll('tr, .tr');
		const trows = [];
		const captionClasses = this.options.captionClasses;
		const trTag = (rows[0] && rows[0].nodeName == 'DIV') ? 'div' : 'tr';
		const tdTag = (headings[0] && headings[0].nodeName == 'DIV') ? 'div' : 'td';

		data.forEach(row => {
			trows[n] = E(trTag, { 'class': 'tr' });

			for (let i = 0; i < headings.length; i++) {
				const text = (headings[i].innerText ?? '').trim();
				const raw_val = Array.isArray(row[i]) ? row[i][0] : null;
				const disp_val = Array.isArray(row[i]) ? row[i][1] : row[i];
				const td = trows[n].appendChild(E(tdTag, {
					'class': 'td',
					'data-title': (text !== '') ? text : null,
					'data-value': raw_val
				}, (disp_val != null) ? ((disp_val instanceof DocumentFragment) ? disp_val.cloneNode(true) : disp_val) : ''));

				if (typeof(captionClasses) == 'object')
					DOMTokenList.prototype.add.apply(td.classList, L.toArray(captionClasses[i]));

				if (!td.classList.contains('cbi-section-actions'))
					headings[i].setAttribute('data-sortable-row', true);
			}

			trows[n].classList.add('cbi-rowstyle-%d'.format((n++ % 2) ? 2 : 1));
		});

		for (let i = 0; i < n; i++) {
			if (rows[i+1])
				this.node.replaceChild(trows[i], rows[i+1]);
			else
				this.node.appendChild(trows[i]);
		}

		while (rows[++n])
			this.node.removeChild(rows[n]);

		if (placeholder && this.node.firstElementChild === this.node.lastElementChild) {
			const trow = this.node.appendChild(E(trTag, { 'class': 'tr placeholder' }));
			const td = trow.appendChild(E(tdTag, { 'class': 'td' }, placeholder));

			if (typeof(captionClasses) == 'object')
				DOMTokenList.prototype.add.apply(td.classList, L.toArray(captionClasses[0]));
		}

		return this.node;
	},

	/**
	 * 返回表格的根 DOM 节点，用于将表格插入页面。
	 *
	 * @returns {Node}
	 *   表格的根 DOM 节点（`<table>` 或容器 `<div>`）。
	 *
	 * @example
	 * document.getElementById('container').appendChild(table.render());
	 */
	render() {
		return this.node;
	},

	/**
	 * 从已有的 HTML 标记（`<table>` 元素或 CSS 选择器字符串）初始化表格实例。
	 *
	 * 该私有方法由构造函数在 `captions` 不为数组时自动调用，无需外部直接使用。
	 * 会从 DOM 中提取列的可排序性（`options.sortable`）和列样式类（`options.captionClasses`），
	 * 并绑定表头的点击排序事件。
	 *
	 * @private
	 * @param {Node|string} node
	 *   已有的 `<table>` DOM 节点，或指向该表格的 CSS 选择器字符串。
	 * @throws {string} 若节点无效或选择器未匹配到任何元素，抛出 'Invalid table selector'。
	 *
	 * @example
	 * // 由构造函数内部调用，不建议直接使用
	 * // new UITable('#my-existing-table');
	 */
	/** @private */
	initFromMarkup(node) {
		if (!dom.elem(node))
			node = document.querySelector(node);

		if (!node)
			throw 'Invalid table selector';

		const options = {};
		const headrow = node.querySelector('tr, .tr');

		if (!headrow)
			return;

		options.id = node.id;
		options.classes = [].slice.call(node.classList).filter(c => c != 'table');
		options.sortable = [];
		options.captionClasses = [];

		headrow.querySelectorAll('th, .th').forEach((th, i) => {
			options.sortable[i] = !th.classList.contains('cbi-section-actions');
			options.captionClasses[i] = [].slice.call(th.classList).filter(c => c != 'th');
		});

		headrow.addEventListener('click', UI.prototype.createHandlerFn(this, 'handleSort'));

		this.id = node.id;
		this.node = node;
		this.options = options;
	},

	/**
	 * 将单元格原始值转换为用于排序比较的规范化排序键。
	 *
	 * 根据列配置的排序提示（`options.sortable`）或自动检测，对值进行如下处理：
	 * - `'auto'` / `true`：自动识别 IPv6 地址/前缀、IPv4 地址/前缀、时间格式（`Xd Xh Xm Xs`）、
	 *   以数字开头的字符串，其余情况原样返回字符串。
	 * - `'ignorecase'`：转换为小写字符串，实现大小写不敏感排序。
	 * - `'numeric'`：转换为数字。
	 * - 其他值：原样转换为字符串。
	 *
	 * 若值为 DOM 元素，优先读取 `data-value` 属性，否则取 `innerText`。
	 *
	 * @private
	 * @param {*} value
	 *   待转换的单元格值（字符串、数字或 DOM 元素）。
	 * @param {number} index
	 *   该值所在列的索引，用于查找列级排序提示。
	 * @returns {string|number}
	 *   返回规范化后的排序键，用于 `naturalCompare` 比较。
	 *
	 * @example
	 * // 自动将 IPv4 地址转换为可排序的零填充字符串
	 * table.deriveSortKey('192.168.1.100', 0);
	 * // => '192168001100032'（示意）
	 *
	 * @example
	 * // 忽略大小写排序
	 * // options.sortable = { 1: 'ignorecase' }
	 * table.deriveSortKey('RouterA', 1);
	 * // => 'routera'
	 */
	/** @private */
	deriveSortKey(value, index) {
		const opts = this.options ?? {};
		let hint;
		let m;

		if (opts.sortable == true || opts.sortable == null)
			hint = 'auto';
		else if (typeof( opts.sortable) == 'object')
			hint =  opts.sortable[index];

		if (dom.elem(value)) {
			if (value.hasAttribute('data-value'))
				value = value.getAttribute('data-value');
			else
				value = (value.innerText ?? '').trim();
		}

		switch (hint ?? 'auto') {
		case true:
		case 'auto':
			m = /^([0-9a-fA-F:.]+)(?:\/([0-9a-fA-F:.]+))?$/.exec(value);

			if (m) {
				let addr;
				let mask;

				addr = validation.parseIPv6(m[1]);
				mask = m[2] ? validation.parseIPv6(m[2]) : null;

				if (addr && mask != null)
					return '%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x%04x'.format(
						addr[0], addr[1], addr[2], addr[3], addr[4], addr[5], addr[6], addr[7],
						mask[0], mask[1], mask[2], mask[3], mask[4], mask[5], mask[6], mask[7]
					);
				else if (addr)
					return '%04x%04x%04x%04x%04x%04x%04x%04x%02x'.format(
						addr[0], addr[1], addr[2], addr[3], addr[4], addr[5], addr[6], addr[7],
						m[2] ? +m[2] : 128
					);

				addr = validation.parseIPv4(m[1]);
				mask = m[2] ? validation.parseIPv4(m[2]) : null;

				if (addr && mask != null)
					return '%03d%03d%03d%03d%03d%03d%03d%03d'.format(
						addr[0], addr[1], addr[2], addr[3],
						mask[0], mask[1], mask[2], mask[3]
					);
				else if (addr)
					return '%03d%03d%03d%03d%02d'.format(
						addr[0], addr[1], addr[2], addr[3],
						m[2] ? +m[2] : 32
					);
			}

			m = /^(?:(\d+)d )?(\d+)h (\d+)m (\d+)s$/.exec(value);

			if (m)
				return '%05d%02d%02d%02d'.format(+m[1], +m[2], +m[3], +m[4]);

			m = /^(\d+)\b(\D*)$/.exec(value);

			if (m)
				return '%010d%s'.format(+m[1], m[2]);

			return String(value);

		case 'ignorecase':
			return String(value).toLowerCase();

		case 'numeric':
			return +value;

		default:
			return String(value);
		}
	},

	/**
	 * 获取当前表格激活的排序状态。
	 *
	 * 优先返回内存中缓存的 `this.sortState`；
	 * 若不存在，则从 session 本地数据中按页面+表格 id 的复合键读取持久化排序状态。
	 *
	 * @private
	 * @returns {Array|null}
	 *   返回 `[columnIndex, isDescending]` 形式的二元数组，
	 *   其中 `columnIndex` 为排序列的索引，`isDescending` 为 `true` 表示降序。
	 *   若当前没有激活的排序状态，返回 `null`。
	 *
	 * @example
	 * // 检查是否有激活的排序
	 * const sort = table.getActiveSortState();
	 * if (sort) {
	 *   console.log('按第', sort[0], '列排序，降序：', sort[1]);
	 * }
	 */
	/** @private */
	getActiveSortState() {
		if (this.sortState)
			return this.sortState;

		if (!this.options.id)
			return null;

		const page = document.body.getAttribute('data-page');
		const key = `${page}.${this.id}`;
		const state = session.getLocalData('tablesort');

		if (L.isObject(state) && Array.isArray(state[key]))
			return state[key];

		return null;
	},

	/**
	 * 设置并持久化当前表格的排序状态。
	 *
	 * 将排序状态同时写入内存缓存（`this.sortState`）和 session 本地数据，
	 * 以便页面刷新后仍能恢复上次的排序偏好。
	 *
	 * @private
	 * @param {number} index
	 *   排序列的索引（0 起）。
	 * @param {boolean} descending
	 *   `true` 表示降序，`false` 表示升序。
	 * @returns {void}
	 *
	 * @example
	 * // 按第2列降序排序并持久化
	 * table.setActiveSortState(2, true);
	 */
	/** @private */
	setActiveSortState(index, descending) {
		this.sortState = [ index, descending ];

		if (!this.options.id)
			return;

		const page = document.body.getAttribute('data-page');
		const key = `${page}.${this.options.id}`;
		let state = session.getLocalData('tablesort');

		if (!L.isObject(state))
			state = {};

		state[key] = this.sortState;

		session.setLocalData('tablesort', state);
	},

	/**
	 * 处理表头点击事件以触发列排序。
	 *
	 * 当用户点击带有 `data-sortable-row` 属性的表头单元格（`<th>`）时，
	 * 切换该列的排序方向（升序 ↔ 降序），清除其他列的排序指示，
	 * 并调用 `update()` 重新渲染表格。
	 *
	 * @private
	 * @param {MouseEvent} ev
	 *   表头行的点击事件对象。
	 * @returns {void}
	 *
	 * @example
	 * // 该方法由事件监听器自动调用，无需手动触发
	 * // headrow.addEventListener('click', UI.prototype.createHandlerFn(this, 'handleSort'));
	 */
	/** @private */
	handleSort(ev) {
		if (!ev.target.matches('th[data-sortable-row]'))
			return;

		const th = ev.target;
		const direction = (th.getAttribute('data-sort-direction') == 'asc');
		let index = 0;

		this.node.firstElementChild.querySelectorAll('th').forEach((other_th, i) => {
			if (other_th !== th)
				other_th.removeAttribute('data-sort-direction');
			else
				index = i;
		});

		this.setActiveSortState(index, direction);
		this.update(this.data, this.placeholder);
	}
});

/**
 * @class UI
 * @memberof LuCI
 * @hideconstructor
 *
 * @classdesc
 * LuCI 高级 UI 辅助功能主类。
 * 提供模态对话框、工具提示、通知横幅、标签页、UCI 变更管理等
 * 高层次 UI 操作封装。
 *
 * 在视图中通过 `require ui` 导入，在外部 JavaScript 中使用
 * `L.require("ui").then(...)` 异步加载。
 *
 * @example
 * // 在 LuCI 视图中使用
 * 'use strict';
 * 'require ui';
 *
 * return L.view.extend({
 *   render: function() {
 *     ui.addNotification('提示', '页面加载完毕', 'info');
 *     return E('div', {}, '内容');
 *   }
 * });
 */
const UI = baseclass.extend(/** @lends LuCI.ui.prototype */ {
	/**
	 * UI 类构造函数（由框架自动调用，无需手动实例化）。
	 *
	 * 执行以下初始化操作：
	 * 1. 在 `document.body` 中创建模态遮罩层 `#modal_overlay` 及其内部 `.modal` 容器。
	 * 2. 创建工具提示容器 `.cbi-tooltip`。
	 * 3. 为向后兼容，将 `showModal`、`hideModal`、`showTooltip`、`hideTooltip`、`itemlist`
	 *    挂载到全局 `L` 对象上。
	 * 4. 绑定 `mouseover`/`mouseout`/`focus`/`blur` 事件以驱动工具提示显示与隐藏。
	 * 5. 监听 `luci-loaded` 与 `uci-loaded` 事件，自动初始化标签页和 UCI 变更管理器。
	 *
	 * @private
	 */
	__init__() {
		modalDiv = document.body.appendChild(
			dom.create('div', {
				id: 'modal_overlay',
				tabindex: -1,
				keydown: this.cancelModal
			}, [
				dom.create('div', {
					class: 'modal',
					role: 'dialog',
					'aria-modal': true
				})
			]));

		tooltipDiv = document.body.appendChild(
			dom.create('div', { class: 'cbi-tooltip' }));

		/* set up old aliases */
		L.showModal = this.showModal;
		L.hideModal = this.hideModal;
		L.showTooltip = this.showTooltip;
		L.hideTooltip = this.hideTooltip;
		L.itemlist = this.itemlist;

		document.addEventListener('mouseover', this.showTooltip.bind(this), true);
		document.addEventListener('mouseout', this.hideTooltip.bind(this), true);
		document.addEventListener('focus', this.showTooltip.bind(this), true);
		document.addEventListener('blur', this.hideTooltip.bind(this), true);

		document.addEventListener('luci-loaded', this.tabs.init.bind(this.tabs));
		document.addEventListener('luci-loaded', this.changes.init.bind(this.changes));
		document.addEventListener('uci-loaded', this.changes.init.bind(this.changes));
	},

	/**
	 * 显示模态遮罩对话框，并填充指定内容。
	 *
	 * 模态遮罩层覆盖当前视图，阻止用户与背景内容交互。
	 * 同一时刻只能存在一个模态对话框；在已有对话框打开时再次调用
	 * `showModal()` 会直接替换其内容。
	 *
	 * 可通过可变参数 `classes` 传入额外的 CSS 类名来影响对话框外观
	 * （具体可用的类由底层主题决定，例如 `cbi-modal`）。
	 *
	 * @see LuCI.dom.content
	 *
	 * @param {string|null} title
	 *   对话框标题文字。传入 `null` 时不渲染标题元素。
	 * @param {*} children
	 *   对话框内容，通常为 DOM 节点或文档片段，原样传递给 `dom.content()`。
	 * @param {...string} [classes]
	 *   附加到模态对话框元素（`.modal`）的额外 CSS 类名（可变参数）。
	 *
	 * @returns {Node}
	 *   返回代表模态对话框的 DOM 节点（`.modal` 内层容器）。
	 *
	 * @example
	 * // 显示一个带确认按钮的简单对话框
	 * ui.showModal('操作确认', [
	 *   E('p', {}, '确定要执行此操作吗？'),
	 *   E('div', { 'class': 'right' }, [
	 *     E('button', { 'class': 'btn', 'click': ui.hideModal }, '取消'),
	 *     E('button', { 'class': 'btn cbi-button-action', 'click': function() {
	 *       // 执行操作...
	 *       ui.hideModal();
	 *     }}, '确定')
	 *   ])
	 * ]);
	 *
	 * @example
	 * // 显示带有额外样式类的对话框
	 * ui.showModal('加载中', E('p', {}, '请稍候...'), 'spinning');
	 */
	showModal(title, children, ...classes) {
		const dlg = modalDiv.firstElementChild;

		dlg.setAttribute('class', 'modal');
		dlg.classList.add(...classes);

		dom.content(dlg, dom.create('h4', {}, title));
		dom.append(dlg, children);

		document.body.classList.add('modal-overlay-active');
		modalDiv.scrollTop = 0;
		modalDiv.focus();

		return dlg;
	},

	/**
	 * 关闭当前打开的模态遮罩对话框。
	 *
	 * 移除 `modal-overlay-active` 类，恢复正常视图交互。
	 * 若当前没有打开的模态对话框，调用本方法无任何效果。
	 *
	 * 注意：本函数是独立函数，不依赖 `this`，也不调用其他类方法，
	 * 因此可以直接作为事件处理器使用，无需预先绑定（`.bind()`）。
	 *
	 * @returns {void}
	 *
	 * @example
	 * // 直接作为按钮点击处理器
	 * E('button', { 'class': 'btn', 'click': ui.hideModal }, '关闭')
	 *
	 * @example
	 * // 在异步操作完成后关闭对话框
	 * someAsyncTask().then(function() {
	 *   ui.hideModal();
	 * });
	 */
	hideModal() {
		document.body.classList.remove('modal-overlay-active');
		modalDiv.blur();
	},

	/**
	 * 处理模态遮罩层上的键盘事件，按下 Escape 键时自动点击"取消/关闭"按钮。
	 *
	 * 搜索顺序：`.right > button`、`.right > .btn`、`.button-row > .btn`，
	 * 找到第一个匹配的按钮后触发 `.click()`。
	 *
	 * @private
	 * @param {KeyboardEvent} ev
	 *   模态遮罩层的 `keydown` 事件对象。
	 * @returns {void}
	 *
	 * @example
	 * // 由 __init__ 自动绑定，无需手动调用
	 * // modalDiv 的 keydown 事件 -> this.cancelModal
	 */
	/** @private */
	cancelModal(ev) {
		if (ev.key == 'Escape') {
			const btn = modalDiv.querySelector('.right > button, .right > .btn, .button-row > .btn');

			if (btn)
				btn.click();
		}
	},

	/**
	 * 在鼠标悬停或元素获得焦点时显示工具提示气泡。
	 *
	 * 向上遍历事件目标的 DOM 树，寻找带有 `data-tooltip` 属性的祖先元素；
	 * 若找到则计算其位置并显示工具提示容器，自动处理视口溢出（在上方显示）。
	 * 同时派发 `tooltip-open` 自定义事件（冒泡）供外部监听。
	 *
	 * @private
	 * @param {MouseEvent|FocusEvent} ev
	 *   `mouseover` 或 `focus` 事件对象。
	 * @returns {void}
	 *
	 * @example
	 * // 为元素添加工具提示（由框架自动处理，无需手动调用）
	 * E('span', { 'data-tooltip': '这是一个提示文本' }, '悬停我')
	 *
	 * @example
	 * // 带有自定义样式的工具提示
	 * E('span', {
	 *   'data-tooltip': '错误信息',
	 *   'data-tooltip-style': 'error'
	 * }, '有问题的内容')
	 */
	/** @private */
	showTooltip(ev) {
		const target = findParent(ev.target, '[data-tooltip]');

		if (!target)
			return;

		if (tooltipTimeout !== null) {
			window.clearTimeout(tooltipTimeout);
			tooltipTimeout = null;
		}

		const rect = target.getBoundingClientRect();
		const x = rect.left              + window.pageXOffset;
		let y = rect.top + rect.height + window.pageYOffset;
		let above = false;

		tooltipDiv.className = 'cbi-tooltip';
		tooltipDiv.innerHTML = '▲ ';
		tooltipDiv.firstChild.data += target.getAttribute('data-tooltip');

		if (target.hasAttribute('data-tooltip-style'))
			tooltipDiv.classList.add(target.getAttribute('data-tooltip-style'));

		if ((y + tooltipDiv.offsetHeight) > (window.innerHeight + window.pageYOffset))
			above = true;

		const dropdown = target.querySelector('ul.dropdown[style]:first-child');

		if (dropdown && dropdown.style.top)
			above = true;

		if (above) {
			y -= (tooltipDiv.offsetHeight + target.offsetHeight);
			tooltipDiv.firstChild.data = `▼ ${tooltipDiv.firstChild.data.substr(2)}`;
		}

		tooltipDiv.style.top = `${y}px`;
		tooltipDiv.style.left = `${x}px`;
		tooltipDiv.style.opacity = 1;

		tooltipDiv.dispatchEvent(new CustomEvent('tooltip-open', {
			bubbles: true,
			detail: { target: target }
		}));
	},

	/**
	 * 在鼠标离开或元素失去焦点时隐藏工具提示气泡。
	 *
	 * 若事件的目标或相关目标是工具提示容器本身（或其子元素），则忽略此次事件。
	 * 隐藏操作通过将透明度设为 0 实现，250ms 后移除 `style` 属性完成清理。
	 * 同时派发 `tooltip-close` 自定义事件（冒泡）供外部监听。
	 *
	 * @private
	 * @param {MouseEvent|FocusEvent} ev
	 *   `mouseout` 或 `blur` 事件对象。
	 * @returns {void}
	 *
	 * @example
	 * // 由框架自动绑定 mouseout/blur 事件，无需手动调用
	 */
	/** @private */
	hideTooltip(ev) {
		if (ev.target === tooltipDiv || ev.relatedTarget === tooltipDiv ||
		    tooltipDiv.contains(ev.target) || tooltipDiv.contains(ev.relatedTarget))
			return;

		if (tooltipTimeout !== null) {
			window.clearTimeout(tooltipTimeout);
			tooltipTimeout = null;
		}

		tooltipDiv.style.opacity = 0;
		tooltipTimeout = window.setTimeout(() => tooltipDiv.removeAttribute('style'), 250);

		tooltipDiv.dispatchEvent(new CustomEvent('tooltip-close', { bubbles: true }));
	},

	/**
	 * 在当前视图顶部添加一条持久通知横幅。
	 *
	 * 通知横幅是一种占满可用宽度的警告信息条，通常显示在视图内容区顶部。
	 * 横幅会一直保留，直到用户手动点击"Dismiss（忽略）"按钮关闭。
	 * 可同时显示多条横幅，它们按插入顺序堆叠在内容区顶部。
	 *
	 * 可通过可变参数 `classes` 传入额外 CSS 类名来影响横幅外观
	 * （例如 `'info'`、`'warning'`、`'danger'`，具体取决于主题）。
	 *
	 * @see LuCI.dom.content
	 *
	 * @param {string|null} title
	 *   通知横幅的标题文字。传入 `null` 时不渲染标题元素。
	 * @param {*} children
	 *   通知内容，通常为 DOM 节点或文档片段，原样传递给 `dom.content()`。
	 * @param {...string} [classes]
	 *   附加到通知横幅元素的额外 CSS 类名（可变参数）。
	 *
	 * @returns {Node}
	 *   返回代表通知横幅的 DOM 节点（`.alert-message` 容器）。
	 *
	 * @example
	 * // 显示一条简单信息通知
	 * ui.addNotification('操作成功', E('p', {}, '配置已保存'), 'info');
	 *
	 * @example
	 * // 显示一条无标题的警告通知
	 * ui.addNotification(null, E('p', {}, '检测到未提交的更改，请及时保存'), 'warning');
	 *
	 * @example
	 * // 在操作失败时显示错误通知
	 * someAsyncOperation().catch(function(err) {
	 *   ui.addNotification('保存失败', [
	 *     E('p', {}, '发生错误：' + err.message)
	 *   ], 'danger');
	 * });
	 */
	addNotification(title, children, ...classes) {
		const mc = document.querySelector('#maincontent') ?? document.body;
		const msg = E('div', {
			'class': 'alert-message fade-in',
			'style': 'display:flex',
			'transitionend': function(ev) {
				const node = ev.currentTarget;
				if (node.parentNode && node.classList.contains('fade-out'))
					node.parentNode.removeChild(node);
			}
		}, [
			E('div', { 'style': 'flex:10' }),
			E('div', { 'style': 'flex:1 1 auto; display:flex' }, [
				E('button', {
					'class': 'btn',
					'style': 'margin-left:auto; margin-top:auto',
					'click': function(ev) {
						dom.parent(ev.target, '.alert-message').classList.add('fade-out');
					},

				}, [ _('Dismiss') ])
			])
		]);

		if (title != null)
			dom.append(msg.firstElementChild, E('h4', {}, title));

		dom.append(msg.firstElementChild, children);

		msg.classList.add(...classes);

		mc.insertBefore(msg, mc.firstElementChild);

		return msg;
	},

	/**
	 * 在当前视图顶部添加一条有时限的通知横幅。
	 *
	 * 与 `addNotification()` 类似，但该横幅在指定时间到期后会自动消失，
	 * 用户也可手动点击"Dismiss"提前关闭。
	 * 可同时显示多条横幅。
	 *
	 * @see LuCI.dom.content
	 *
	 * @param {string|null} title
	 *   通知横幅的标题文字。传入 `null` 时不渲染标题元素。
	 * @param {*} children
	 *   通知内容，通常为 DOM 节点或文档片段，原样传递给 `dom.content()`。
	 */
	/**
	 * 添加一个带自动消失超时的通知横幅。
	 *
	 * 该方法在页面顶部显示一条通知横幅，并在指定的毫秒数后自动淡出并从 DOM 中移除。
	 * 如果未提供超时参数，行为与 `addNotification` 完全相同，横幅将一直存在直到被点击。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} title
	 * 通知横幅的标题文字。若为 `null`，则不显示标题。
	 *
	 * @param {Array<*>} children
	 * 通知横幅正文内容的子节点数组，支持 `LuCI.dom.content()` 所接受的任意类型及可用值。
	 *
	 * @param {int} [timeout]
	 * 通知自动消失的毫秒数。若省略，则通知将一直显示，直到用户点击。
	 *
	 * @param {...string} [classes]
	 * 附加到通知横幅元素上的额外 CSS 类名。
	 *
	 * @returns {Node}
	 * 返回代表通知横幅的 DOM 节点。
	 *
	 * @example
	 * // 显示一条 3 秒后自动消失的成功通知
	 * ui.addTimeLimitedNotification('成功', [E('p', '操作已完成')], 3000, 'success');
	 *
	 * // 显示一条不会自动消失的通知（等同于 addNotification）
	 * ui.addTimeLimitedNotification('警告', [E('p', '请注意此提示')]);
	 */
	addTimeLimitedNotification(title, children, timeout, ...classes) {
		const msg = this.addNotification(title, children, ...classes);

		/**
		 * 使通知横幅执行淡出动画并从 DOM 中移除。
		 *
		 * @private
		 * @param {Node} element - 要淡出并移除的 DOM 节点
		 */
		function fadeOutNotification(element) {
			if (element) {
				element.classList.add('fade-out');
				element.classList.remove('fade-in');
				setTimeout(() => {
					if (element.parentNode) {
						element.parentNode.removeChild(element);
					}
				});
			}
		}

		if (typeof timeout === 'number' && timeout > 0) {
			setTimeout(() => fadeOutNotification(msg), timeout);
		}

		return msg;
	},

	/**
	 * 在页眉区域显示或更新一个状态指示器标签。
	 *
	 * 指示器是显示在页眉区域的小型标签，用于展示少量状态信息，例如条目数量或状态开关。
	 * 可以同时显示多个指示器，并可将指示器标签设为可点击，以展示更多信息或触发后续操作。
	 *
	 * 指示器支持两种样式：默认的 `active`（高亮）和较为低调的 `inactive`（用于表示状态开关）。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} id
	 * 指示器的唯一 ID。若指定 ID 的指示器已存在，则更新其标签文字和样式。
	 *
	 * @param {string} label
	 * 指示器标签上显示的文字。
	 *
	 * @param {function} [handler]
	 * 用户点击/触摸指示器标签时调用的处理函数。若省略，则指示器不可点击。
	 * 注意：此参数仅在创建新指示器时生效，更新已有指示器时会被忽略。
	 *
	 * @param {"active"|"inactive"} [style=active]
	 * 要使用的指示器样式，可为 `active` 或 `inactive`。
	 *
	 * @returns {boolean}
	 * 若指示器已被更新则返回 `true`，未发生任何变化则返回 `false`。
	 *
	 * @example
	 * // 显示一个带点击事件的活跃状态指示器
	 * ui.showIndicator('my-indicator', '未保存更改: 3', () => {
	 *     ui.changes.displayChanges();
	 * }, 'active');
	 *
	 * // 更新已有指示器的文字
	 * ui.showIndicator('my-indicator', '未保存更改: 5');
	 */
	showIndicator(id, label, handler, style) {
		if (indicatorDiv == null) {
			indicatorDiv = document.body.querySelector('#indicators');

			if (indicatorDiv == null)
				return false;
		}

		const handlerFn = (typeof(handler) == 'function') ? handler : null;
		let indicatorElem = indicatorDiv.querySelector('span[data-indicator="%s"]'.format(id));

		if (indicatorElem == null) {
			let beforeElem = null;

			for (beforeElem = indicatorDiv.firstElementChild;
			     beforeElem != null;
			     beforeElem = beforeElem.nextElementSibling)
				if (beforeElem.getAttribute('data-indicator') > id)
					break;

			indicatorElem = indicatorDiv.insertBefore(E('span', {
				'data-indicator': id,
				'data-clickable': handlerFn ? true : null,
				'click': handlerFn
			}, ['']), beforeElem);
		}

		if (label == indicatorElem.firstChild.data && style == indicatorElem.getAttribute('data-style'))
			return false;

		indicatorElem.firstChild.data = label;
		indicatorElem.setAttribute('data-style', (style == 'inactive') ? 'inactive' : 'active');
		return true;
	},

	/**
	 * 从页眉区域移除一个状态指示器。
	 *
	 * 此函数从页眉指示器区域中移除指定的指示器标签。若指定的指示器不存在，则不执行任何操作。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} id
	 * 要移除的指示器 ID。
	 *
	 * @returns {boolean}
	 * 若指示器已被成功移除则返回 `true`，若指定 ID 不存在则返回 `false`。
	 *
	 * @example
	 * // 移除 ID 为 'uci-changes' 的指示器
	 * const removed = ui.hideIndicator('uci-changes');
	 * if (removed) {
	 *     console.log('指示器已移除');
	 * }
	 */
	hideIndicator(id) {
		const indicatorElem = indicatorDiv ? indicatorDiv.querySelector('span[data-indicator="%s"]'.format(id)) : null;

		if (indicatorElem == null)
			return false;

		indicatorDiv.removeChild(indicatorElem);
		return true;
	},

	/**
	 * 将一组标签/值对格式化为列表标记并追加到指定的父 DOM 节点。
	 *
	 * 此函数将一个由标签和值交替排列的扁平数组转换为列表形式的标记：
	 * - 每个标签会被加上 `: ` 后缀并包裹在 `<strong>` 标签中；
	 * - `<strong>` 元素与对应的值被包裹在 `<span class="nowrap">` 元素中；
	 * - 各个 `<span>` 元组之间由 `separators` 中指定的分隔符连接；
	 * - 最终结果会替换指定父节点的全部子内容。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {Node} node
	 * 要追加标记的父 DOM 节点。调用前会清除其原有子元素。
	 *
	 * @param {Array<*>} items
	 * 标签和值交替排列的数组。标签将转换为纯字符串，值保持原样，
	 * 可为 `LuCI.dom.content()` 所接受的任意类型。
	 *
	 * @param {*|Array<*>} [separators=[E('br')]]
	 * 用于分隔各标签/值对的单个分隔符或分隔符数组。函数会循环使用分隔符数组中的元素。
	 * 若省略，默认使用单个 HTML `<br>` 元素作为分隔符。
	 * 分隔符的值保持原样，可为 `LuCI.dom.content()` 所接受的任意类型。
	 *
	 * @returns {Node}
	 * 返回已追加了格式化标记的父 DOM 节点。
	 *
	 * @example
	 * // 使用默认 <br> 分隔符渲染两个键值对
	 * const container = E('div');
	 * ui.itemlist(container, [
	 *     '主机名', 'OpenWrt',
	 *     '版本',  '23.05.0'
	 * ]);
	 * // 结果：<span class="nowrap"><strong>主机名: </strong>OpenWrt</span><br>
	 * //        <span class="nowrap"><strong>版本: </strong>23.05.0</span>
	 *
	 * // 使用自定义分隔符（空格 + 竖线）
	 * ui.itemlist(container, ['IP', '192.168.1.1', '端口', '80'], [' | ']);
	 */
	itemlist(node, items, separators) {
		const children = [];

		if (!Array.isArray(separators))
			separators = [ separators ?? E('br') ];

		for (let i = 0; i < items.length; i += 2) {
			if (items[i+1] !== null && items[i+1] !== undefined) {
				const sep = separators[(i/2) % separators.length];
				const cld = [];

				children.push(E('span', { class: 'nowrap' }, [
					items[i] ? E('strong', `${items[i]}: `) : '',
					items[i+1]
				]));

				if ((i+2) < items.length)
					children.push(dom.elem(sep) ? sep.cloneNode(true) : sep);
			}
		}

		dom.content(node, children);

		return node;
	},

	/**
	 * @class
	 * @memberof LuCI.ui
	 * @hideconstructor
	 * @classdesc
	 *
	 * `tabs` 类负责管理视图区域中使用的标签菜单组。
	 * 它负责建立标签组、追踪其状态以及处理相关事件。
	 *
	 * 该类作为 `LuCI.ui` 的一部分自动实例化为单例。
	 * 在视图中使用时，通过 `'require ui'` 引入并通过 `ui.tabs` 访问；
	 * 在外部 JavaScript 中使用时，通过 `L.require("ui").then(...)` 引入并访问实例的 `tabs` 属性。
	 *
	 * @example
	 * // 初始化当前页面中所有具有 data-tab 属性的标签面板
	 * ui.tabs.init();
	 *
	 * // 检查某个面板是否为空
	 * const isEmpty = ui.tabs.isEmptyPane(document.querySelector('[data-tab="advanced"]'));
	 */
	tabs: baseclass.singleton(/* @lends LuCI.ui.tabs.prototype */ {
		/**
		 * 初始化页面中所有标签组。
		 *
		 * 遍历页面中所有带有 `data-tab` 属性的元素，按其父节点分组，
		 * 然后对每个分组调用 `initTabGroup()` 完成初始化，并监听 `dependency-update` 事件。
		 *
		 * @private
		 */
		init() {
			const groups = [];
			let prevGroup = null;
			let currGroup = null;

			document.querySelectorAll('[data-tab]').forEach(tab => {
				const parent = tab.parentNode;

				if (dom.matches(tab, 'li') && dom.matches(parent, 'ul.cbi-tabmenu'))
					return;

				if (!parent.hasAttribute('data-tab-group'))
					parent.setAttribute('data-tab-group', groups.length);

				currGroup = +parent.getAttribute('data-tab-group');

				if (currGroup !== prevGroup) {
					prevGroup = currGroup;

					if (!groups[currGroup])
						groups[currGroup] = [];
				}

				groups[currGroup].push(tab);
			});

			for (let i = 0; i < groups.length; i++)
				this.initTabGroup(groups[i]);

			document.addEventListener('dependency-update', this.updateTabs.bind(this));

			this.updateTabs();
		},

		/**
		 * 根据给定的标签面板集合初始化一个新的标签组。
		 *
		 * 此函数遍历传入的标签面板 DOM 节点，提取其 tab ID、标题及激活状态，
		 * 渲染对应的标签菜单并将其插入到标签面板公共父节点之前。
		 *
		 * 标签菜单的标签文字取自各面板的 `data-tab-title` 属性。
		 * 最后一个 `data-tab-active` 属性值为 `true` 的面板将被默认选中。
		 * 若没有面板被标记为激活状态，则默认选中第一个非空面板。
		 *
		 * @instance
		 * @memberof LuCI.ui.tabs
		 *
		 * @param {Array<Node>|NodeList} panes
		 * 要构建标签组菜单的标签面板集合。可为 DOM 节点的普通数组或 NodeList，
		 * 例如 `querySelectorAll()` 的返回值或 DOM 节点的 `.childNodes` 属性。
		 *
		 * @example
		 * // 手动为一组面板初始化标签组（通常由 init() 自动调用）
		 * const panes = document.querySelectorAll('#my-group [data-tab]');
		 * ui.tabs.initTabGroup(panes);
		 */
		initTabGroup(panes) {
			if (typeof(panes) != 'object' || !('length' in panes) || panes.length === 0)
				return;

			const menu = E('ul', { 'class': 'cbi-tabmenu' });
			const group = panes[0].parentNode;
			const groupId = +group.getAttribute('data-tab-group');
			let selected = null;

			if (group.getAttribute('data-initialized') === 'true')
				return;

			for (let i = 0, pane; pane = panes[i]; i++) {
				const name = pane.getAttribute('data-tab');
				const title = pane.getAttribute('data-tab-title');
				const active = pane.getAttribute('data-tab-active') === 'true';

				menu.appendChild(E('li', {
					'style': this.isEmptyPane(pane) ? 'display:none' : null,
					'class': active ? 'cbi-tab' : 'cbi-tab-disabled',
					'data-tab': name
				}, E('a', {
					'href': '#',
					'click': this.switchTab.bind(this)
				}, title)));

				if (active)
					selected = i;
			}

			group.parentNode.insertBefore(menu, group);
			group.setAttribute('data-initialized', true);

			if (selected === null) {
				selected = this.getActiveTabId(panes[0]);

				if (selected < 0 || selected >= panes.length || this.isEmptyPane(panes[selected])) {
					for (let i = 0; i < panes.length; i++) {
						if (!this.isEmptyPane(panes[i])) {
							selected = i;
							break;
						}
					}
				}

				menu.childNodes[selected].classList.add('cbi-tab');
				menu.childNodes[selected].classList.remove('cbi-tab-disabled');
				panes[selected].setAttribute('data-tab-active', 'true');

				this.setActiveTabId(panes[selected], selected);
			}

			requestAnimationFrame(L.bind(pane => {
				pane.dispatchEvent(new CustomEvent('cbi-tab-active', {
					detail: { tab: pane.getAttribute('data-tab') }
				}));
			}, this, panes[selected]));

			this.updateTabs(group);
		},

		/**
		 * 检查给定的标签面板节点是否为空。
		 *
		 * 空面板指除带有 `cbi-tab-descr` 类的节点外不包含任何可见内容的面板。
		 * 空面板对应的标签菜单项将被隐藏。
		 *
		 * @instance
		 * @memberof LuCI.ui.tabs
		 *
		 * @param {Node} pane
		 * 要检查的标签面板 DOM 节点。
		 *
		 * @returns {boolean}
		 * 若面板为空返回 `true`，否则返回 `false`。
		 *
		 * @example
		 * const pane = document.querySelector('[data-tab="advanced"]');
		 * if (ui.tabs.isEmptyPane(pane)) {
		 *     console.log('高级选项卡为空，将被隐藏');
		 * }
		 */
		isEmptyPane(pane) {
			return dom.isEmpty(pane, n => n.classList.contains('cbi-tab-descr'));
		},

		/**
		 * 获取某个面板在 DOM 结构中的路径字符串，用于持久化记录当前激活的标签。
		 *
		 * 从给定面板向上遍历 DOM 树，收集所有祖先节点的 `data-tab` 或
		 * `data-section-id` 属性值，拼接成以 `/` 分隔的路径字符串。
		 *
		 * @private
		 * @param {Node} pane - 目标标签面板节点
		 * @returns {string} 面板的路径字符串，例如 `"network/interfaces/wan"`
		 */
		getPathForPane(pane) {
			const path = [];
			let node = null;

			for (node = pane ? pane.parentNode : null;
			     node != null && node.hasAttribute != null;
			     node = node.parentNode)
			{
				if (node.hasAttribute('data-tab'))
					path.unshift(node.getAttribute('data-tab'));
				else if (node.hasAttribute('data-section-id'))
					path.unshift(node.getAttribute('data-section-id'));
			}

			return path.join('/');
		},

		/**
		 * 从 session 本地存储中获取当前页面的标签激活状态对象。
		 *
		 * 若存储的状态与当前页面不匹配，则清除存储并返回空状态。
		 *
		 * @private
		 * @returns {{ page: string, paths: Object<string, number> }}
		 * 包含当前页面标识及各路径对应激活标签索引的状态对象。
		 */
		getActiveTabState() {
			const page = document.body.getAttribute('data-page');
			const state = session.getLocalData('tab');

			if (L.isObject(state) && state.page === page && L.isObject(state.paths))
				return state;

			session.setLocalData('tab', null);

			return { page: page, paths: {} };
		},

		/**
		 * 获取给定面板所在路径上当前激活的标签索引。
		 *
		 * @private
		 * @param {Node} pane - 目标标签面板节点
		 * @returns {number} 激活标签的索引，未找到时返回 0。
		 */
		getActiveTabId(pane) {
			const path = this.getPathForPane(pane);
			return +this.getActiveTabState().paths[path] ?? 0;
		},

		/**
		 * 将给定面板所在路径上的激活标签索引持久化存储到 session 本地存储。
		 *
		 * @private
		 * @param {Node} pane - 目标标签面板节点
		 * @param {number} tabIndex - 要记录的激活标签索引
		 * @returns {*} `session.setLocalData` 的返回值
		 */
		setActiveTabId(pane, tabIndex) {
			const path = this.getPathForPane(pane);
			const state = this.getActiveTabState();

			state.paths[path] = tabIndex;

			return session.setLocalData('tab', state);
		},

		/**
		 * 根据各标签面板当前的内容和验证状态更新标签菜单的显示。
		 *
		 * 遍历页面（或指定根节点）中所有带有 `data-tab-title` 属性的面板：
		 * - 空面板对应的菜单项将被隐藏，反之则显示并添加闪烁动画；
		 * - 含有无效字段（`.cbi-input-invalid`）的面板，其标签菜单项将显示错误提示。
		 *
		 * @private
		 * @param {Event|Node} [ev] - 触发事件或根节点（可选）
		 * @param {Node} [root] - 搜索范围根节点（可选，默认为 `document`）
		 */
		updateTabs(ev, root) {
			(root ?? document).querySelectorAll('[data-tab-title]').forEach(L.bind((pane) => {
				const menu = pane.parentNode.previousElementSibling;
				const tab = menu ? menu.querySelector('[data-tab="%s"]'.format(pane.getAttribute('data-tab'))) : null;
				const n_errors = pane.querySelectorAll('.cbi-input-invalid').length;

				if (!menu || !tab)
					return;

				if (this.isEmptyPane(pane)) {
					tab.style.display = 'none';
					tab.classList.remove('flash');
				}
				else if (tab.style.display === 'none') {
					tab.style.display = '';
					requestAnimationFrame(() => tab.classList.add('flash'));
				}

				if (n_errors) {
					tab.setAttribute('data-errors', n_errors);
					tab.setAttribute('data-tooltip', _('%d invalid field(s)').format(n_errors));
					tab.setAttribute('data-tooltip-style', 'error');
				}
				else {
					tab.removeAttribute('data-errors');
					tab.removeAttribute('data-tooltip');
				}
			}, this));
		},

		/**
		 * 处理标签菜单的点击事件，切换到被点击的标签面板。
		 *
		 * 阻止默认的链接跳转行为，更新菜单项的激活/禁用 CSS 类，
		 * 切换对应面板的 `data-tab-active` 属性，并触发 `cbi-tab-active` 自定义事件。
		 *
		 * @private
		 * @param {MouseEvent} ev - 标签菜单链接上的点击事件
		 */
		switchTab(ev) {
			const tab = ev.target.parentNode;
			const name = tab.getAttribute('data-tab');
			const menu = tab.parentNode;
			const group = menu.nextElementSibling;
			const groupId = +group.getAttribute('data-tab-group');
			let index = 0;

			ev.preventDefault();

			if (!tab.classList.contains('cbi-tab-disabled'))
				return;

			menu.querySelectorAll('[data-tab]').forEach(tab => {
				tab.classList.remove('cbi-tab');
				tab.classList.remove('cbi-tab-disabled');
				tab.classList.add(
					tab.getAttribute('data-tab') === name ? 'cbi-tab' : 'cbi-tab-disabled');
			});

			group.childNodes.forEach(pane => {
				if (dom.matches(pane, '[data-tab]')) {
					if (pane.getAttribute('data-tab') === name) {
						pane.setAttribute('data-tab-active', 'true');
						pane.dispatchEvent(new CustomEvent('cbi-tab-active', { detail: { tab: name } }));
						UI.prototype.tabs.setActiveTabId(pane, index);
					}
					else {
						pane.setAttribute('data-tab-active', 'false');
					}

					index++;
				}
			});
		}
	}),

	/**
	 * @typedef {Object} FileUploadReply
	 * @memberof LuCI.ui
	 *
	 * 文件上传成功后的服务器应答对象。
	 *
	 * @property {string} name - 上传文件的名称（不含目录路径）
	 * @property {number} size - 上传文件的字节大小
	 * @property {string} checksum - 服务端接收到的文件数据的 MD5 校验和
	 * @property {string} sha256sum - 服务端接收到的文件数据的 SHA256 校验和
	 */

	/**
	 * 弹出模态对话框，引导用户选择并上传文件到指定的远程路径。
	 *
	 * 此函数打开一个模态对话框，提示用户选择要上传的本地文件，
	 * 并通过 CGI 接口将文件上传到预定义的远程目标路径。
	 * 上传过程中会显示进度条，完成后关闭对话框并通过 Promise 返回上传结果。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} path
	 * 将本地文件上传到的远程文件路径。
	 *
	 * @param {Node} [progressStatusNode]
	 * 可选的 DOM 文本节点，上传过程中其文字内容将被更新为当前进度百分比字符串。
	 *
	 * @returns {Promise<LuCI.ui.FileUploadReply>}
	 * 返回一个 Promise：
	 * - 上传成功时 resolve 为 `FileUploadReply` 对象；
	 * - 上传失败或用户取消时 reject 并携带 `Error` 对象。
	 *
	 * @example
	 * // 上传固件文件到 /tmp/firmware.bin
	 * ui.uploadFile('/tmp/firmware.bin').then(reply => {
	 *     console.log('上传成功:', reply.name, reply.size, 'bytes');
	 *     console.log('MD5:', reply.checksum);
	 * }).catch(err => {
	 *     console.error('上传失败:', err.message);
	 * });
	 *
	 * // 带进度文本节点
	 * const statusNode = document.createTextNode('');
	 * ui.uploadFile('/tmp/upgrade.bin', statusNode);
	 */
	uploadFile(path, progressStatusNode) {
		return new Promise((resolveFn, rejectFn) => {
			UI.prototype.showModal(_('Uploading file…'), [
				E('p', _('Please select the file to upload.')),
				E('div', { 'style': 'display:flex' }, [
					E('div', { 'class': 'left', 'style': 'flex:1' }, [
						E('input', {
							type: 'file',
							style: 'display:none',
							change(ev) {
								const modal = dom.parent(ev.target, '.modal');
								const body = modal.querySelector('p');
								const upload = modal.querySelector('.cbi-button-action.important');
								const file = ev.currentTarget.files[0];

								if (file == null)
									return;

								dom.content(body, [
									E('ul', {}, [
										E('li', {}, [ '%s: %s'.format(_('Name'), file.name.replace(/^.*[\\\/]/, '')) ]),
										E('li', {}, [ '%s: %1024mB'.format(_('Size'), file.size) ])
									])
								]);

								upload.disabled = false;
								upload.focus();
							}
						}),
						E('button', {
							'class': 'btn cbi-button',
							'click': function(ev) {
								ev.target.previousElementSibling.click();
							}
						}, [ _('Browse…') ])
					]),
					E('div', { 'class': 'right', 'style': 'flex:1' }, [
						E('button', {
							'class': 'btn',
							'click': function() {
								UI.prototype.hideModal();
								rejectFn(new Error(_('Upload has been cancelled')));
							}
						}, [ _('Cancel') ]),
						' ',
						E('button', {
							'class': 'btn cbi-button-action important',
							'disabled': true,
							'click': function(ev) {
								const input = dom.parent(ev.target, '.modal').querySelector('input[type="file"]');

								if (!input.files[0])
									return;

								const progress = E('div', { 'class': 'cbi-progressbar', 'title': '0%' }, E('div', { 'style': 'width:0' }));

								UI.prototype.showModal(_('Uploading file…'), [ progress ]);

								const data = new FormData();

								data.append('sessionid', rpc.getSessionID());
								data.append('filename', path);
								data.append('filedata', input.files[0]);

								const filename = input.files[0].name;

								request.post(`${L.env.cgi_base}/cgi-upload`, data, {
									timeout: 0,
									progress(pev) {
										const percent = (pev.loaded / pev.total) * 100;

										if (progressStatusNode)
											progressStatusNode.data = '%.2f%%'.format(percent);

										progress.setAttribute('title', '%.2f%%'.format(percent));
										progress.firstElementChild.style.width = '%.2f%%'.format(percent);
									}
								}).then(res => {
									const reply = res.json();

									UI.prototype.hideModal();

									if (L.isObject(reply) && reply.failure) {
										UI.prototype.addNotification(null, E('p', _('Upload request failed: %s').format(reply.message)));
										rejectFn(new Error(reply.failure));
									}
									else {
										reply.name = filename;
										resolveFn(reply);
									}
								}, err => {
									UI.prototype.hideModal();
									rejectFn(err);
								});
							}
						}, [ _('Upload') ])
					])
				])
			]);
		});
	},

	/**
	 * 对设备进行连通性测试。
	 *
	 * 通过 HTTP 请求拉取远程设备上的已知资源（loading SVG 图标）来测试连通性。
	 * 此函数主要用于在路由器重启或重新配置后等待其重新上线。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} [proto=http]
	 * 用于探测资源的协议，可为 `http`（默认）或 `https`。
	 *
	 * @param {string} [ipaddr=window.location.host]
	 * 覆盖要探测的主机地址。默认探测地址栏中显示的当前主机。
	 *
	 * @returns {Promise<Event>}
	 * 返回一个 Promise：
	 * - 设备可达时 resolve 为 `load` 事件；
	 * - 设备不可达时 reject 为 `error` 事件；
	 * - 连通性检测超时时 reject 为 `null`。
	 *
	 * @example
	 * // 检测当前主机是否可达
	 * ui.pingDevice().then(() => {
	 *     console.log('设备在线');
	 * }).catch(() => {
	 *     console.log('设备不可达');
	 * });
	 *
	 * // 使用 HTTPS 检测指定 IP
	 * ui.pingDevice('https', '192.168.1.1').then(() => {
	 *     console.log('192.168.1.1 (HTTPS) 可达');
	 * });
	 */
	pingDevice(proto, ipaddr) {
		const target = '%s://%s%s?%s'.format(proto ?? 'http', ipaddr ?? window.location.host, L.resource('icons/loading.svg'), Math.random());

		return new Promise((resolveFn, rejectFn) => {
			const img = new Image();

			img.onload = resolveFn;
			img.onerror = rejectFn;

			window.setTimeout(rejectFn, 1000);

			img.src = target;
		});
	},

	/**
	 * 等待设备重新上线后自动跳转重连。
	 *
	 * 轮询给定的主机名或 IP 地址列表，一旦其中任意一个地址可达，
	 * 即自动将浏览器导航到该地址。初始等待 5 秒后开始轮询。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {...string} [hosts=[window.location.host]]
	 * 要检测可达性的 IP 地址和主机名列表。
	 * 若省略，默认使用 `window.location.host` 的当前值。
	 *
	 * @example
	 * // 等待当前主机重新上线
	 * ui.awaitReconnect();
	 *
	 * // 等待多个备选地址中任意一个可达后重连
	 * ui.awaitReconnect('192.168.1.1', '10.0.0.1', 'router.local');
	 */
	awaitReconnect(...hosts) {
		const ipaddrs = hosts.length ? hosts : [ window.location.host ];

		window.setTimeout(L.bind(() => {
			poll.add(L.bind(() => {
				const tasks = [];
				let reachable = false;

				for (let i = 0; i < 2; i++)
					for (let j = 0; j < ipaddrs.length; j++)
						tasks.push(this.pingDevice(i ? 'https' : 'http', ipaddrs[j])
							.then(ev => { reachable = ev.target.src.replace(/^(https?:\/\/[^\/]+).*$/, '$1/') }, () => {}));

				return Promise.all(tasks).then(() => {
					if (reachable) {
						poll.stop();
						window.location = reachable;
					}
				});
			}, this));
		}, this), 5000);
	},

	/**
	 * @class
	 * @memberof LuCI.ui
	 * @hideconstructor
	 * @classdesc
	 *
	 * `changes` 类封装了对暂存 UCI 变更集进行可视化、应用、确认和还原的逻辑。
	 *
	 * 该类作为 `LuCI.ui` 的一部分自动实例化为单例。
	 * 在视图中使用时，通过 `'require ui'` 引入并通过 `ui.changes` 访问；
	 * 在外部 JavaScript 中使用时，通过 `L.require("ui").then(...)` 引入并访问实例的 `changes` 属性。
	 *
	 * @example
	 * // 手动触发显示变更日志对话框
	 * ui.changes.displayChanges();
	 *
	 * // 应用暂存的配置变更（带回滚检查）
	 * ui.changes.apply(true);
	 *
	 * // 还原所有暂存的配置变更
	 * ui.changes.revert();
	 */
	changes: baseclass.singleton(/* @lends LuCI.ui.changes.prototype */ {
		/**
		 * 初始化变更追踪器。
		 *
		 * 若当前会话有效，则查询 UCI 变更列表并渲染变更数量指示器。
		 *
		 * @private
		 * @returns {Promise<void>|undefined}
		 */
		init() {
			if (!L.env.sessionid)
				return;

			return uci.changes().then(L.bind(this.renderChangeIndicator, this));
		},

		/**
		 * 设置页眉区域的变更数量指示器。
		 *
		 * 当变更数量大于 0 时，显示或更新指示器标签；
		 * 当变更数量为 0 时，移除指示器。
		 *
		 * @instance
		 * @memberof LuCI.ui.changes
		 *
		 * @param {number} n
		 * 要在指示器上显示的变更数量。
		 *
		 * @example
		 * // 显示 5 条未保存变更的指示器
		 * ui.changes.setIndicator(5);
		 *
		 * // 清除指示器
		 * ui.changes.setIndicator(0);
		 */
		setIndicator(n) {
			if (n > 0) {
				UI.prototype.showIndicator('uci-changes',
					'%s: %d'.format(_('Unsaved Changes'), n),
					L.bind(this.displayChanges, this));
			}
			else {
				UI.prototype.hideIndicator('uci-changes');
			}
		},

		/**
		 * 根据 UCI 变更集结构更新变更数量指示器。
		 *
		 * 统计给定变更集中所有配置文件的变更条目总数，
		 * 将变更集保存为实例属性后调用 `setIndicator()` 更新指示器。
		 *
		 * @instance
		 * @memberof LuCI.ui.changes
		 *
		 * @param {Object<string, Array<LuCI.uci.ChangeRecord>>} changes
		 * 要统计的 UCI 变更集对象，键为配置文件名，值为变更记录数组。
		 *
		 * @example
		 * uci.changes().then(changes => {
		 *     ui.changes.renderChangeIndicator(changes);
		 * });
		 */
		renderChangeIndicator(changes) {
			let n_changes = 0;

			for (const config in changes)
				if (changes.hasOwnProperty(config))
					n_changes += changes[config].length;

			this.changes = changes;
			this.setIndicator(n_changes);
		},

		/**
		 * UCI 变更记录对应的 HTML 模板映射表。
		 *
		 * 键格式为 `"<操作类型>-<参数数量>"`，值为含占位符的 HTML 字符串。
		 * 占位符 `%0` 到 `%4` 分别对应：配置文件名、保留、节 ID/匿名节引用、选项名、选项值。
		 *
		 * @private
		 * @type {Object<string, string>}
		 */
		changeTemplates: {
			'add-3':      '<ins>uci add %0 <strong>%3</strong> # =%2</ins>',
			'set-3':      '<ins>uci set %0.<strong>%2</strong>=%3</ins>',
			'set-4':      '<var><ins>uci set %0.%2.%3=<strong>%4</strong></ins></var>',
			'remove-2':   '<del>uci del %0.<strong>%2</strong></del>',
			'remove-3':   '<var><del>uci del %0.%2.<strong>%3</strong></del></var>',
			'order-3':    '<var>uci reorder %0.%2=<strong>%3</strong></var>',
			'list-add-4': '<var><ins>uci add_list %0.%2.%3=<strong>%4</strong></ins></var>',
			'list-del-4': '<var><del>uci del_list %0.%2.%3=<strong>%4</strong></del></var>',
			'rename-3':   '<var>uci rename %0.%2=<strong>%3</strong></var>',
			'rename-4':   '<var>uci rename %0.%2.%3=<strong>%4</strong></var>'
		},

		/**
		 * 显示当前暂存 UCI 变更的变更日志对话框。
		 *
		 * 打开一个模态对话框，以格式化的命令形式展示当前所有暂存的 UCI 变更，
		 * 并提供"保存并应用"、"无检查直接应用"和"还原"三个操作按钮。
		 *
		 * @instance
		 * @memberof LuCI.ui.changes
		 *
		 * @example
		 * // 通过代码手动弹出变更日志对话框
		 * ui.changes.displayChanges();
		 *
		 * // 通常由页眉的指示器点击事件自动触发
		 * ui.showIndicator('uci-changes', '未保存更改: 3',
		 *     () => ui.changes.displayChanges());
		 */
		displayChanges() {
			const list = E('div', { 'class': 'uci-change-list' });

			const dlg = UI.prototype.showModal(`${_('Configuration')} / ${_('Changes')}`, [
			E('div', { 'class': 'cbi-section' }, [
				E('strong', _('Legend:')),
				E('div', { 'class': 'uci-change-legend' }, [
					E('div', { 'class': 'uci-change-legend-label' }, [
						E('ins', '&#160;'), ' ', _('Section added') ]),
					E('div', { 'class': 'uci-change-legend-label' }, [
						E('del', '&#160;'), ' ', _('Section removed') ]),
					E('div', { 'class': 'uci-change-legend-label' }, [
						E('var', {}, E('ins', '&#160;')), ' ', _('Option changed') ]),
					E('div', { 'class': 'uci-change-legend-label' }, [
						E('var', {}, E('del', '&#160;')), ' ', _('Option removed') ])]),
				E('br'), list,
				E('div', { 'class': 'button-row' }, [
					E('button', {
						'class': 'btn cbi-button',
						'click': UI.prototype.hideModal
					}, [ _('Close') ]), ' ',
					new UIComboButton('0', {
						0: [ _('Save & Apply') ],
						1: [ _('Apply unchecked') ]
					}, {
						classes: {
							0: 'btn cbi-button cbi-button-positive important',
							1: 'btn cbi-button cbi-button-negative important'
						},
						click: L.bind((ev, mode) => { this.apply(mode == '0') }, this)
					}).render(), ' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': L.bind(this.revert, this)
					}, [ _('Revert') ])])])
		]);

			for (const config in this.changes) {
				if (!this.changes.hasOwnProperty(config))
					continue;

				list.appendChild(E('h5', '# /etc/config/%s'.format(config)));

				for (let i = 0, added = null; i < this.changes[config].length; i++) {
					const chg = this.changes[config][i];
					const tpl = this.changeTemplates['%s-%d'.format(chg[0], chg.length)];

					list.appendChild(E(tpl.replace(/%([01234])/g, (m0, m1) => {
						switch (+m1) {
						case 0:
							return config;

						case 2:
							if (added != null && chg[1] == added[0])
								return `@${added[1]}[-1]`;
							else
								return chg[1];

						case 4:
							return "'%h'".format(chg[3].replace(/'/g, "'\"'\"'"));

						default:
							return chg[m1-1];
						}
					})));

					if (chg[0] == 'add')
						added = [ chg[1], chg[2] ];
				}
			}

			list.appendChild(E('br'));
			dlg.classList.add('uci-dialog');
		},

		/**
		 * 显示或隐藏操作进度/状态的模态对话框。
		 *
		 * 若 `type` 为真值，则显示一个附加了指定 CSS 类的模态消息框，
		 * 并暂停轮询（如果正在轮询）；若 `type` 为假值，则关闭模态框并恢复轮询。
		 *
		 * @private
		 * @param {string|false} type - 要附加到消息框的 CSS 类名字符串（如 `'notice spinning'`），或 `false` 以关闭
		 * @param {*} [content] - 模态框的内容（可为 DOM 节点或字符串）
		 */
		displayStatus(type, content) {
			if (type) {
				const message = UI.prototype.showModal('', '');

				message.classList.add('alert-message');
				DOMTokenList.prototype.add.apply(message.classList, type.split(/\s+/));

				if (content)
					dom.content(message, content);

				if (!this.was_polling) {
					this.was_polling = request.poll.active();
					request.poll.stop();
				}
			}
			else {
				UI.prototype.hideModal();

				if (this.was_polling)
					request.poll.start();
			}
		},

		/**
		 * 检查当前暂存的网络变更是否会影响与设备的连通性。
		 *
		 * 通过执行 `/usr/libexec/luci-peeraddr` 获取入站接口信息，
		 * 并与 `this.changes.network` 中的变更记录对比，
		 * 判断是否存在可能中断当前连接的 IP/协议/禁用状态变更。
		 *
		 * @private
		 * @returns {Promise<string|null>}
		 * 若发现影响连通性的变更，resolve 为受影响的接口名称；否则 resolve 为 `null`。
		 */
		checkConnectivityAffected() {
			return L.resolveDefault(fs.exec_direct('/usr/libexec/luci-peeraddr', null, 'json')).then(L.bind((info) => {
				if (L.isObject(info) && Array.isArray(info.inbound_interfaces)) {
					for (let i = 0; i < info.inbound_interfaces.length; i++) {
						const iif = info.inbound_interfaces[i];

						for (let j = 0; this.changes && this.changes.network && j < this.changes.network.length; j++) {
							const chg = this.changes.network[j];

							if (chg[0] == 'set' && chg[1] == iif &&
								((chg[2] == 'disabled' && chg[3] == '1') || chg[2] == 'proto' || chg[2] == 'ipaddr' || chg[2] == 'netmask'))
								return iif;
						}
					}
				}

				return null;
			}, this));
		},

		/**
		 * 在检查式应用超时后执行回滚流程。
		 *
		 * 若处于检查式应用模式（`checked === true`），则持续轮询确认接口，
		 * 直到收到 204（已回滚）响应后显示回滚成功提示，并提供"忽略"、"还原变更"和"无检查应用"三个选项。
		 *
		 * 若处于非检查式模式（`checked === false`），则直接显示"设备不可达"警告。
		 *
		 * @private
		 * @param {boolean} checked - 是否处于检查式应用模式
		 */
		rollback(checked) {
			if (checked) {
				this.displayStatus('warning spinning',
					E('p', _('Failed to confirm apply within %ds, waiting for rollback…')
						.format(L.env.apply_rollback)));

				const call = (r, data, duration) => {
					if (r.status === 204) {
						UI.prototype.changes.displayStatus('warning', [
							E('h4', _('Configuration changes have been rolled back!')),
							E('p', _('The device could not be reached within %d seconds after applying the pending changes, which caused the configuration to be rolled back for safety reasons. If you believe that the configuration changes are correct nonetheless, perform an unchecked configuration apply. Alternatively, you can dismiss this warning and edit changes before attempting to apply again, or revert all pending changes to keep the currently working configuration state.').format(L.env.apply_rollback)),
							E('div', { 'class': 'button-row' }, [
								E('button', {
									'class': 'btn',
									'click': L.bind(UI.prototype.changes.displayStatus, UI.prototype.changes, false)
								}, [ _('Dismiss') ]), ' ',
								E('button', {
									'class': 'btn cbi-button-action important',
									'click': L.bind(UI.prototype.changes.revert, UI.prototype.changes)
								}, [ _('Revert changes') ]), ' ',
								E('button', {
									'class': 'btn cbi-button-negative important',
									'click': L.bind(UI.prototype.changes.apply, UI.prototype.changes, false)
								}, [ _('Apply unchecked') ])
							])
						]);

						return;
					}

					const delay = isNaN(duration) ? 0 : Math.max(1000 - duration, 0);
					window.setTimeout(() => {
						request.request(L.url('admin/uci/confirm'), {
							method: 'post',
							timeout: L.env.apply_timeout * 1000,
							query: { sid: L.env.sessionid, token: L.env.token }
						}).then(call, call.bind(null, { status: 0, duration: 0 }));
					}, delay);
				};

				call({ status: 0 });
			}
			else {
				this.displayStatus('warning', [
					E('h4', _('Device unreachable!')),
					E('p', _('Could not regain access to the device after applying the configuration changes. You might need to reconnect if you modified network related settings such as the IP address or wireless security credentials.'))
				]);
			}
		},

		/**
		 * 在应用成功后轮询确认接口，等待设备确认变更生效。
		 *
		 * 此私有方法在应用请求成功后启动一个倒计时显示，
		 * 并持续轮询 UCI 确认接口直到收到成功响应或超过 deadline 触发回滚。
		 *
		 * @private
		 * @param {boolean} checked - 是否为检查式应用模式
		 * @param {number} deadline - 确认截止时间的时间戳（毫秒）
		 * @param {string} [override_token] - 可选的覆盖确认令牌
		 */
		confirm(checked, deadline, override_token) {
			let tt;
			let ts = Date.now();

			this.displayStatus('notice');

			if (override_token)
				this.confirm_auth = { token: override_token };

			const call = (r, data, duration) => {
				if (Date.now() >= deadline) {
					window.clearTimeout(tt);
					UI.prototype.changes.rollback(checked);
					return;
				}
				else if (r.status === 200 || r.status === 204) {
					document.dispatchEvent(new CustomEvent('uci-applied'));

					UI.prototype.changes.setIndicator(0);
					UI.prototype.changes.displayStatus('notice',
						E('p', _('Configuration changes applied.')));

					window.clearTimeout(tt);
					window.setTimeout(() => {
						//UI.prototype.changes.displayStatus(false);
						window.location = window.location.href.split('#')[0];
					}, L.env.apply_display * 1000);

					return;
				}

				const delay = isNaN(duration) ? 0 : Math.max(1000 - duration, 0);
				window.setTimeout(() => {
					request.request(L.url('admin/uci/confirm'), {
						method: 'post',
						timeout: L.env.apply_timeout * 1000,
						query: UI.prototype.changes.confirm_auth
					}).then(call, call.bind(null, { status: 0, duration: 0 }));
				}, delay);
			};

			const tick = () => {
				const now = Date.now();

				UI.prototype.changes.displayStatus('notice spinning',
					E('p', _('Applying configuration changes… %ds')
						.format(Math.max(Math.floor((deadline - Date.now()) / 1000), 0))));

				if (now >= deadline)
					return;

				tt = window.setTimeout(tick, 1000 - (now - ts));
				ts = now;
			};

			tick();

			/* wait a few seconds for the settings to become effective */
			window.setTimeout(call.bind(null, { status: 0 }), L.env.apply_holdoff * 1000);
		},

		/**
		 * 应用暂存的 UCI 配置变更。
		 *
		 * 开始应用暂存的配置变更，并弹出带进度提示的模态对话框以阻止视图交互。
		 * 应用完成后，模态对话框将自动关闭并重新加载当前视图。
		 *
		 * 若为检查式应用（`checked=true`），在应用前还会检查变更是否影响当前连通性：
		 * - 若影响，弹出警告让用户选择"取消"、"带回滚应用"或"无检查应用"；
		 * - 若不影响，直接发起应用请求。
		 *
		 * @instance
		 * @memberof LuCI.ui.changes
		 *
		 * @param {boolean} [checked=false]
		 * 是否执行检查式（`true`）或无检查（`false`）的配置应用。
		 * 检查式应用要求在特定时间内确认变更，否则设备将自动回滚到之前的配置。
		 *
		 * @example
		 * // 执行检查式应用（推荐），超时后自动回滚
		 * ui.changes.apply(true);
		 *
		 * // 执行无检查应用（不安全，不会自动回滚）
		 * ui.changes.apply(false);
		 */
		apply(checked) {
			this.displayStatus('notice spinning',
				E('p', _('Starting configuration apply…')));

			(new Promise((resolveFn, rejectFn) => {
				if (!checked)
					return resolveFn(false);

				UI.prototype.changes.checkConnectivityAffected().then(affected => {
					if (!affected)
						return resolveFn(true);

					UI.prototype.changes.displayStatus('warning', [
						E('h4', _('Connectivity change')),
						E('p', _('Changes have been made to the existing connection via "%h". This could inhibit access to this device. Any IP change requires <strong>connecting to the new IP</strong> within %d seconds to retain the changes.').format(affected, L.env.apply_rollback)),
						E('div', { 'class': 'button-row' }, [
							E('button', {
								'class': 'btn cbi-button',
								'click': rejectFn,
							}, [ _('Cancel') ]), ' ',
							E('button', {
								'class': 'btn cbi-button-action important',
								'click': resolveFn.bind(null, true)
							}, [ _('Apply, reverting in case of connectivity loss') ]), ' ',
							E('button', {
								'class': 'btn cbi-button-negative important',
								'click': resolveFn.bind(null, false)
							}, [ _('Apply unchecked') ])
						])
					]);
				});
			})).then(checked => {
				request.request(L.url('admin/uci', checked ? 'apply_rollback' : 'apply_unchecked'), {
					method: 'post',
					query: { sid: L.env.sessionid, token: L.env.token }
				}).then(r => {
					if (r.status === (checked ? 200 : 204)) {
						let tok = null; try { tok = r.json(); } catch(e) {}
						if (checked && tok !== null && typeof(tok) === 'object' && typeof(tok.token) === 'string')
							UI.prototype.changes.confirm_auth = tok;

						UI.prototype.changes.confirm(checked, Date.now() + L.env.apply_rollback * 1000);
					}
					else if (checked && r.status === 204) {
						UI.prototype.changes.displayStatus('notice',
							E('p', _('There are no changes to apply')));

						window.setTimeout(() => {
							UI.prototype.changes.displayStatus(false);
						}, L.env.apply_display * 1000);
					}
					else {
						UI.prototype.changes.displayStatus('warning',
							E('p', _('Apply request failed with status <code>%h</code>')
								.format(r.responseText ?? r.statusText ?? r.status)));

						window.setTimeout(() => {
							UI.prototype.changes.displayStatus(false);
						}, L.env.apply_display * 1000);
					}
				});
			}, this.displayStatus.bind(this, false));
		},

		/**
		 * 还原所有暂存的 UCI 配置变更。
		 *
		 * 向后端发起还原请求，弹出带进度提示的模态对话框以阻止视图交互。
		 * 还原完成后，模态对话框将自动关闭并重新加载当前视图。
		 * 若还原请求失败，则显示包含 HTTP 状态码的警告信息。
		 *
		 * @instance
		 * @memberof LuCI.ui.changes
		 *
		 * @example
		 * // 还原所有未保存的 UCI 变更
		 * ui.changes.revert();
		 *
		 * // 通常由变更日志对话框中的"还原"按钮触发
		 * E('button', { 'click': L.bind(ui.changes.revert, ui.changes) }, ['还原']);
		 */
		revert() {
			this.displayStatus('notice spinning',
				E('p', _('Reverting configuration…')));

			request.request(L.url('admin/uci/revert'), {
				method: 'post',
				query: { sid: L.env.sessionid, token: L.env.token }
			}).then(r => {
				if (r.status === 200) {
					document.dispatchEvent(new CustomEvent('uci-reverted'));

					UI.prototype.changes.setIndicator(0);
					UI.prototype.changes.displayStatus('notice',
						E('p', _('Changes have been reverted.')));

					window.setTimeout(() => {
						//UI.prototype.changes.displayStatus(false);
						window.location = window.location.href.split('#')[0];
					}, L.env.apply_display * 1000);
				}
				else {
					UI.prototype.changes.displayStatus('warning',
						E('p', _('Revert request failed with status <code>%h</code>')
							.format(r.statusText ?? r.status)));

					window.setTimeout(() => {
						UI.prototype.changes.displayStatus(false);
					}, L.env.apply_display * 1000);
				}
			});
		}
	}),

	/**
	 * 为输入元素添加验证约束。
	 *
	 * 将给定的类型表达式和可选验证函数编译为验证函数，
	 * 并将其绑定到指定输入元素的事件上。
	 * 每次触发绑定事件时，都会执行字段验证并更新元素的验证状态。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {Node} field
	 * 要绑定验证约束的 DOM 输入元素节点。
	 *
	 * @param {string} type
	 * 描述验证约束的数据类型规范字符串。
	 * 详细说明请参阅 `LuCI.validation` 类的文档。
	 *
	 * @param {boolean} [optional=false]
	 * 指定是否允许空值（`true`）或不允许（`false`）。
	 * 若未标记为可选，则输入不能为空，否则该字段将被标记为无效。
	 *
	 * @param {function|function[]} [vfunc]
	 * 自定义验证函数或验证函数数组，在其他验证约束通过后依次调用。
	 * 每个函数必须返回 `true` 以接受传入的值；当提供数组时，验证在第一个返回非 `true` 值的函数处停止。
	 * 任何非 `true` 的返回值将被转换为字符串并视为验证错误信息。
	 *
	 * @param {...string} [events=blur, keyup]
	 * 要绑定的事件名称列表。每次接收到指定事件时都会触发字段验证。
	 * 若省略，默认绑定 `keyup` 和 `blur` 事件。
	 *
	 * @returns {function}
	 * 返回编译后的验证函数，可用于手动触发字段验证或绑定到更多事件。
	 *
	 * @see LuCI.validation
	 *
	 * @example
	 * // 为 IP 地址输入框添加验证，非空，绑定默认事件
	 * const validate = ui.addValidator(
	 *     document.querySelector('#ip-input'),
	 *     'ipaddr',
	 *     false
	 * );
	 *
	 * // 添加自定义验证函数，并绑定到 change 事件
	 * ui.addValidator(
	 *     document.querySelector('#port-input'),
	 *     'port',
	 *     true,
	 *     (value) => value !== '0' || '端口号不能为 0',
	 *     'change', 'blur'
	 * );
	 */
	addValidator(field, type, optional, vfunc, ...events) {
		if (type == null)
			return;

		if (events.length == 0)
			events.push('blur', 'keyup');

		try {
			const cbiValidator = validation.create(field, type, optional, vfunc);
			const validatorFn = cbiValidator.validate.bind(cbiValidator);

			for (let i = 0; i < events.length; i++)
				field.addEventListener(events[i], validatorFn);

			validatorFn();

			return validatorFn;
		}
		catch (e) { }
	},

	/**
	 * 创建一个预绑定的事件处理函数。
	 *
	 * 生成并绑定一个适用于事件处理器的函数。生成的函数会：
	 * 1. 自动禁用事件来源元素（设置 `disabled = true`）；
	 * 2. 为其添加 `spinning` CSS 类以显示加载状态；
	 * 3. 调用被包裹的函数；
	 * 4. 等待函数返回的 Promise 完成后，重新启用来源元素并移除 `spinning` 类。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {*} ctx
	 * 被包裹函数使用的 `this` 上下文。
	 *
	 * @param {function|string} fn
	 * 要包裹的函数。若为函数值，则直接使用；若为字符串，则在 `ctx` 中查找对应属性。
	 * 两种情况下，绑定函数都以 `ctx` 作为 `this` 上下文调用。
	 *
	 * @param {...*} extra_args
	 * 以与传入 `createHandlerFn()` 相同的顺序传递给绑定事件处理函数的额外参数。
	 *
	 * @returns {function|null}
	 * 返回预绑定的处理函数，可直接传递给 `addEventListener()`。
	 * 若 `fn` 为字符串且在 `ctx` 中找不到，或 `ctx[fn]` 不是有效函数，则返回 `null`。
	 *
	 * @example
	 * // 将方法名字符串绑定为点击处理器，点击时按钮禁用直到操作完成
	 * const handler = ui.createHandlerFn(this, 'handleSave', extraArg1);
	 * button.addEventListener('click', handler);
	 *
	 * // 直接传入函数
	 * const handler = ui.createHandlerFn(myCtx, async (ev) => {
	 *     await doSomeAsyncWork();
	 * });
	 * document.querySelector('#btn').addEventListener('click', handler);
	 */
	createHandlerFn(ctx, fn, ...args) {
		if (typeof(fn) == 'string')
			fn = ctx[fn];

		if (typeof(fn) != 'function')
			return null;

		return L.bind(function() {
			const t = arguments[args.length].currentTarget;

			t.classList.add('spinning');
			t.disabled = true;

			if (t.blur)
				t.blur();

			Promise.resolve(fn.apply(ctx, arguments)).finally(() => {
				t.classList.remove('spinning');
				t.disabled = false;
			});
		}, ctx, ...args);
	},

	/**
	 * 加载指定视图类路径并完成实例化。
	 *
	 * 将给定的视图路径转换为类名，使用 `LuCI.require()` 加载对应模块，
	 * 并断言加载的类实例是 `LuCI.view` 的子类。
	 *
	 * 实例化视图类后，其对应内容将被渲染并嵌入视图区域。
	 * 任何运行时错误都将被捕获并通过 `LuCI.error()` 渲染展示。
	 *
	 * @memberof LuCI.ui
	 * @instance
	 *
	 * @param {string} path
	 * 要渲染的视图路径，例如 `"network/interfaces"` 或 `"system/reboot"`。
	 * 路径中的 `/` 将被替换为 `.` 以构成类名。
	 *
	 * @returns {Promise<LuCI.view>}
	 * 返回一个 Promise，resolve 为加载完成的视图实例。
	 * 若加载失败（类不存在或不是 View 的子类），Promise 将 reject 并在页面上渲染错误信息。
	 *
	 * @example
	 * // 加载并渲染网络接口视图
	 * ui.instantiateView('network/interfaces').then(view => {
	 *     console.log('视图已加载:', view);
	 * });
	 *
	 * // 加载系统重启视图
	 * ui.instantiateView('system/reboot');
	 */
	instantiateView(path) {
		const className = 'view.%s'.format(path.replace(/\//g, '.'));

		return L.require(className).then(view => {
			if (!(view instanceof View))
				throw new TypeError('Loaded class %s is not a descendant of View'.format(className));

			return view;
		}).catch(err => {
			dom.content(document.querySelector('#view'), null);
			L.error(err);
		});
	},

	/** UI 菜单类，提供页面导航菜单的构建与管理功能。 */
	menu: UIMenu,

	/** UI 表格类，提供数据表格的渲染与交互功能。 */
	Table: UITable,

	/** UI 抽象基础元素类，所有 UI 控件的基类。 */
	AbstractElement: UIElement,

	/* 以下为各类 UI 控件的导出 */

	/** 单行文本输入框控件。 */
	Textfield: UITextfield,

	/** 多行文本输入框控件。 */
	Textarea: UITextarea,

	/** 复选框控件。 */
	Checkbox: UICheckbox,

	/** 下拉选择框控件（原生 select 元素）。 */
	Select: UISelect,

	/** 功能增强的下拉选择框控件，支持搜索和多选。 */
	Dropdown: UIDropdown,

	/** 动态列表控件，允许用户添加和删除列表项。 */
	DynamicList: UIDynamicList,

	/** 范围滑动条控件。 */
	RangeSlider: UIRangeSlider,

	/** 组合框控件，结合文本输入和下拉选择。 */
	Combobox: UICombobox,

	/** 组合按钮控件，点击展开多个操作选项。 */
	ComboButton: UIComboButton,

	/** 隐藏字段控件，用于存储不可见的表单值。 */
	Hiddenfield: UIHiddenfield,

	/** 文件上传控件，提供带进度显示的文件上传界面。 */
	FileUpload: UIFileUpload
});

/**
 * 导出 UI 主类。
 *
 * `UI` 类是 LuCI 前端界面的核心类，提供了通知、指示器、标签、
 * 文件上传、设备探测、UCI 变更管理、输入验证、事件处理及视图实例化等功能，
 * 同时导出了所有内置 UI 控件类供外部模块使用。
 *
 * @module LuCI.ui
 * @see LuCI.ui
 *
 * @example
 * // 在 LuCI 视图中引入 ui 模块
 * 'use strict';
 * 'require ui';
 *
 * return L.view.extend({
 *     render() {
 *         // 显示一条 5 秒后消失的通知
 *         ui.addTimeLimitedNotification('提示', [E('p', '操作成功')], 5000);
 *
 *         // 应用 UCI 变更
 *         ui.changes.apply(true);
 *
 *         return E('div');
 *     }
 * });
 */
return UI;
