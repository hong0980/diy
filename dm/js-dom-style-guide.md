# JavaScript DOM 与样式操作完全手册

> 一本面向前端开发者的原生 JavaScript DOM 操作参考手册。涵盖从基础概念到高级技巧的全部内容，不依赖任何第三方库。

---

## 目录

- [第 1 章：基础概念](#第-1-章基础概念)
- [第 2 章：DOM 树与节点类型](#第-2-章dom-树与节点类型)
- [第 3 章：元素选择](#第-3-章元素选择)
- [第 4 章：DOM 遍历](#第-4-章dom-遍历)
- [第 5 章：内容操作](#第-5-章内容操作)
- [第 6 章：属性操作](#第-6-章属性操作)
- [第 7 章：DOM 结构操作](#第-7-章dom-结构操作)
- [第 8 章：样式操作](#第-8-章样式操作)
- [第 9 章：尺寸与位置](#第-9-章尺寸与位置)
- [第 10 章：事件基础](#第-10-章事件基础)
- [第 11 章：表单操作](#第-11-章表单操作)
- [第 12 章：性能优化](#第-12-章性能优化)
- [第 13 章：实用工具函数](#第-13-章实用工具函数)
- [附录：速查表](#附录速查表)

---

## 第 1 章：基础概念

### 1.1 什么是 DOM

DOM（Document Object Model，文档对象模型）是 HTML/XML 文档的编程接口。浏览器将 HTML 文档解析为一个由节点组成的树状结构，JavaScript 可以通过 DOM API 来读取和修改这个树。

```
HTML 文档          DOM 树
─────────         ───────
<html>            Document
  <head>            └─ html (Element)
  <body>               ├─ head (Element)
    <div>              │   └─ ...
      Hello            └─ body (Element)
    </div>                └─ div (Element)
  </body>                    └─ text: "Hello"
</html>
```

### 1.2 核心对象关系

```
Node（节点基类）
├── Document（文档）
│   └── HTMLDocument（HTML 文档）
├── DocumentFragment（文档片段）
├── Element（元素）
│   ├── HTMLElement
│   │   ├── HTMLDivElement
│   │   ├── HTMLInputElement
│   │   └── ...
│   └── SVGElement
├── CharacterData（字符数据）
│   ├── Text（文本节点）
│   └── Comment（注释节点）
└── Attr（属性节点，已废弃）
```

### 1.3 常用属性速览

| 属性 | 所属 | 说明 |
|------|------|------|
| `nodeType` | Node | 节点类型数字 |
| `nodeName` | Node | 节点名称（大写标签名） |
| `nodeValue` | Node | 节点值（文本/注释内容） |
| `tagName` | Element | 元素标签名（大写） |
| `id` | Element | 元素 ID |
| `className` | Element | 元素 class 字符串 |
| `classList` | Element | class 集合（DOMTokenList） |
| `innerHTML` | Element | 内部 HTML |
| `outerHTML` | Element | 包含自身的 HTML |
| `textContent` | Node | 纯文本内容 |

---

## 第 2 章：DOM 树与节点类型

### 2.1 节点类型常量

```javascript
// 在浏览器控制台输入这些查看对应数值
Node.ELEMENT_NODE                // 1  - 元素节点
Node.TEXT_NODE                   // 3  - 文本节点
Node.CDATA_SECTION_NODE          // 4  - CDATA 区段
Node.PROCESSING_INSTRUCTION_NODE // 7  - 处理指令
Node.COMMENT_NODE                // 8  - 注释节点
Node.DOCUMENT_NODE               // 9  - 文档节点
Node.DOCUMENT_TYPE_NODE          // 10 - 文档类型节点
Node.DOCUMENT_FRAGMENT_NODE      // 11 - 文档片段节点
```

### 2.2 判断节点类型

```javascript
function getNodeInfo(node) {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return `元素: <${node.tagName.toLowerCase()}>`;
    case Node.TEXT_NODE:
      return `文本: "${node.nodeValue.trim()}"`;
    case Node.COMMENT_NODE:
      return `注释: <!--${node.nodeValue}-->`;
    case Node.DOCUMENT_NODE:
      return '文档根节点';
    default:
      return `其他类型: ${node.nodeType}`;
  }
}

// 使用示例
const body = document.body;
body.childNodes.forEach(node => {
  console.log(getNodeInfo(node));
});
```

### 2.3 空白文本节点问题

HTML 中的换行和缩进会被解析为文本节点，这是 `firstChild` 等属性"失效"的主要原因：

```html
<div id="box">
  <span>Text</span>
</div>
```

```javascript
const box = document.getElementById('box');

box.childNodes.length;        // 3
// [text(\n  ), span, text(\n)]

box.firstChild.nodeType;      // 3 (TEXT_NODE)
box.firstChild.nodeValue;     // "\n  "

box.firstElementChild;        // <span>Text</span>
```

### 2.4 忽略空白文本的遍历工具

```javascript
// 获取所有非空白的子元素/文本
function getSignificantChildren(parent) {
  return Array.from(parent.childNodes).filter(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.trim().length > 0;
    }
    return true;
  });
}

// 获取下一个有意义的兄弟节点
function nextSignificantSibling(node) {
  let sib = node.nextSibling;
  while (sib) {
    if (sib.nodeType !== Node.TEXT_NODE || sib.nodeValue.trim().length > 0) {
      return sib;
    }
    sib = sib.nextSibling;
  }
  return null;
}
```

---

## 第 3 章：元素选择

### 3.1 基础选择器详解

```javascript
// getElementById - 最快的查找方式
// 返回: Element | null
const header = document.getElementById('header');

// getElementsByTagName - 按标签名查找
// 返回: 实时 HTMLCollection
const allDivs = document.getElementsByTagName('div');
const spansInHeader = header.getElementsByTagName('span');

// getElementsByClassName - 按 class 查找
// 返回: 实时 HTMLCollection
const items = document.getElementsByClassName('item');
const activeItems = document.getElementsByClassName('item active'); // 同时包含两个 class

// getElementsByName - 按 name 属性查找（常用于表单）
// 返回: 实时 NodeList
const radios = document.getElementsByName('gender');
```

### 3.2 querySelector 系列

```javascript
// querySelector - 返回第一个匹配的元素
// 支持所有 CSS3 选择器
const el = document.querySelector('#app .list > li:first-child');
const btn = document.querySelector('button[type="submit"]');
const odd = document.querySelectorAll('.row:nth-child(odd)');

// 属性选择器
const links = document.querySelectorAll('a[href^="https"]');     // 以 https 开头
const pdfs = document.querySelectorAll('a[href$=".pdf"]');       // 以 .pdf 结尾
const imgs = document.querySelectorAll('img[alt*="logo"]');      // 包含 logo

// 伪类选择器
const checked = document.querySelectorAll('input:checked');
const disabled = document.querySelectorAll('button:disabled');
const empty = document.querySelectorAll('td:empty');

// 结构性伪类
const first = document.querySelector('li:first-of-type');
const last = document.querySelector('li:last-of-type');
const only = document.querySelector('span:only-child');
const notHidden = document.querySelectorAll('div:not(.hidden)');
```

### 3.3 实时集合 vs 静态集合

```javascript
// 实时集合（Live Collection）
const live = document.getElementsByClassName('item');
console.log(live.length);  // 假设 3

// 添加新元素
const newItem = document.createElement('div');
newItem.className = 'item';
document.body.appendChild(newItem);

console.log(live.length);  // 4！自动更新

// 静态集合（Static Collection）
const static = document.querySelectorAll('.item');
console.log(static.length);  // 4

document.body.appendChild(document.createElement('div')).className = 'item';
console.log(static.length);  // 还是 4，不会更新
```

### 3.4 选择器性能

```javascript
// ✅ 最快：ID 选择
const el = document.getElementById('app');

// ✅ 很快：标签名选择
const divs = document.getElementsByTagName('div');

// ✅ 较快：class 选择
const items = document.getElementsByClassName('item');

// ⚠️ 较慢：复杂 CSS 选择器（需要解析）
const slow = document.querySelectorAll('div.container > ul.list li:nth-child(3) a');

// 优化：缩小搜索范围
const container = document.getElementById('container');
const fast = container.querySelectorAll('.item');  // 只在 container 内查找
```

---

## 第 4 章：DOM 遍历

### 4.1 父子关系遍历

```javascript
const parent = document.getElementById('parent');

// 所有子节点（NodeList，含文本和注释）
parent.childNodes;

// 仅元素子节点（HTMLCollection）
parent.children;

// 子节点数量
parent.childNodes.length;
parent.children.length;

// 第一个/最后一个子节点（含文本）
parent.firstChild;
parent.lastChild;

// 第一个/最后一个元素子节点
parent.firstElementChild;
parent.lastElementChild;

// 是否有子节点
parent.hasChildNodes();  // true/false

// 父节点
parent.parentNode;       // 父节点（可能是 document）
parent.parentElement;    // 父元素节点（如果父节点不是元素则返回 null）

// 获取根元素
parent.ownerDocument;    // 所属 Document
parent.getRootNode();    // 根节点（含 Shadow DOM 时有用）
```

### 4.2 兄弟关系遍历

```javascript
const item = document.querySelector('.item');

// 相邻节点（含文本）
item.nextSibling;
item.previousSibling;

// 相邻元素
item.nextElementSibling;
item.previousElementSibling;

// 实用：获取所有兄弟元素
function getSiblings(el) {
  return Array.from(el.parentNode.children).filter(child => child !== el);
}

// 实用：获取同类型的所有兄弟
function getSiblingElementsOfSameType(el) {
  return Array.from(el.parentNode.children).filter(
    child => child !== el && child.tagName === el.tagName
  );
}
```

### 4.3 高级遍历方法

```javascript
// closest - 向上查找最近的匹配祖先
const btn = document.querySelector('button');
const card = btn.closest('.card');        // 最近的 .card 祖先
const form = btn.closest('form');         // 最近的 form 祖先

// matches - 检查是否匹配选择器
if (btn.matches('.primary')) { ... }
if (btn.matches(':disabled')) { ... }

// contains - 检查是否包含某后代
if (document.body.contains(btn)) { ... }

// compareDocumentPosition - 比较两个节点位置
const a = document.getElementById('a');
const b = document.getElementById('b');
const pos = a.compareDocumentPosition(b);
// pos & Node.DOCUMENT_POSITION_FOLLOWING  // b 在 a 之后
// pos & Node.DOCUMENT_POSITION_PRECEDING  // b 在 a 之前
// pos & Node.DOCUMENT_POSITION_CONTAINED_BY // b 是 a 的后代
```

### 4.4 自定义遍历器

```javascript
// 深度优先遍历所有后代元素
function* walkElements(root) {
  yield root;
  for (const child of root.children) {
    yield* walkElements(child);
  }
}

// 使用
for (const el of walkElements(document.body)) {
  console.log(el.tagName);
}

// 查找所有文本节点
function getAllTextNodes(root) {
  const texts = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue.trim()) {
      texts.push(node);
    }
  }
  return texts;
}
```

---

## 第 5 章：内容操作

### 5.1 innerHTML

```javascript
const box = document.getElementById('box');

// 读取 HTML 字符串
const html = box.innerHTML;

// 写入 HTML（会解析标签）
box.innerHTML = '<p>Hello <strong>World</strong></p>';

// 追加 HTML
box.innerHTML += '<p>More content</p>';  // ⚠️ 会重新解析全部内容，效率低

// 清空元素
box.innerHTML = '';

// ⚠️ 安全问题：XSS 风险
const userInput = '<img src=x onerror="alert(1)">';
box.innerHTML = userInput;  // 危险！会执行脚本
```

### 5.2 textContent

```javascript
// 读取纯文本（不包含 HTML 标签）
const text = box.textContent;  // "Hello World"

// 设置纯文本（自动转义 HTML）
box.textContent = '<script>alert(1)</script>';
// 结果: 页面显示 "<script>alert(1)</script>"，不会执行

// 性能更好：不会触发 HTML 解析
// 不会触发重排（reflow）
```

### 5.3 innerText

```javascript
// 读取可见文本（受 CSS 影响）
const visible = box.innerText;
// - 忽略 display:none 的内容
// - 忽略 visibility:hidden 的内容
// - 会触发重排（性能较差）

// 设置文本
box.innerText = 'Hello\nWorld';  // 会保留换行符
```

### 5.4 outerHTML

```javascript
// 包含元素自身的 HTML
const html = box.outerHTML;
// 结果: "<div id=\"box\">...</div>"

// 替换元素自身
box.outerHTML = '<section>New content</section>';
// box 变量仍然指向旧元素（已从 DOM 移除）
```

### 5.5 插入 HTML 的安全方法

```javascript
// 方法 1：使用 textContent（最安全）
function setText(el, text) {
  el.textContent = text;
}

// 方法 2：使用 template 标签解析 HTML
function setHtml(el, html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  el.appendChild(template.content.cloneNode(true));
}

// 方法 3：手动创建元素（最可控）
function createSafeElement(tag, attrs, text) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val);
  }
  if (text) el.textContent = text;
  return el;
}
```

---

## 第 6 章：属性操作

### 6.1 标准属性

```javascript
const link = document.querySelector('a');

// 直接属性访问（仅标准属性）
link.href = 'https://example.com';
link.target = '_blank';
link.title = 'Example';

// 读取
console.log(link.href);      // 完整 URL
console.log(link.id);
console.log(link.className); // 注意：class 是保留字，用 className

// 布尔属性
input.checked = true;
input.disabled = false;
button.autofocus = true;
```

### 6.2 getAttribute / setAttribute

```javascript
// 通用方法（适用于所有属性，包括自定义属性）
link.setAttribute('data-id', '123');
link.setAttribute('aria-label', 'Close dialog');

// 读取
const id = link.getAttribute('data-id');

// 删除
link.removeAttribute('data-temp');

// 检查是否存在
if (link.hasAttribute('target')) { ... }

// 获取所有属性
for (const attr of link.attributes) {
  console.log(attr.name, attr.value);
}
```

### 6.3 data-* 自定义属性

```html
<div id="user"
     data-id="42"
     data-role="admin"
     data-user-name="John Doe"
     data-json='{"age":30}'>
</div>
```

```javascript
const user = document.getElementById('user');

// 读取（自动驼峰转换）
user.dataset.id;        // "42"
user.dataset.role;      // "admin"
user.dataset.userName;  // "John Doe"（data-user-name → userName）

// 写入
user.dataset.status = 'active';

// 删除
delete user.dataset.status;

// 读取 JSON
try {
  const data = JSON.parse(user.dataset.json);
  console.log(data.age);  // 30
} catch (e) {
  console.error('Invalid JSON');
}
```

### 6.4 class 操作详解

```javascript
const box = document.querySelector('.box');

// className：读写整个 class 字符串
box.className = 'box active';
box.className += ' large';  // 追加（注意空格）

// classList：推荐方式
box.classList.add('active', 'visible');      // 添加多个
box.classList.remove('hidden', 'loading');   // 移除多个
box.classList.toggle('active');              // 切换
box.classList.toggle('active', condition);   // 条件切换
box.classList.contains('active');            // 检查
box.classList.replace('old', 'new');         // 替换

// 遍历
for (const cls of box.classList) {
  console.log(cls);
}

// 条件切换的实用写法
box.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
```

### 6.5 style 属性

```javascript
const el = document.querySelector('div');

// 单个属性（camelCase）
el.style.backgroundColor = '#f00';
el.style.fontSize = '16px';
el.style.marginTop = '10px';

// 使用 setProperty（支持 CSS 变量和 kebab-case）
el.style.setProperty('background-color', 'red');
el.style.setProperty('--theme-color', 'blue');

// 读取内联样式
el.style.backgroundColor;  // "red"（仅内联样式）

// 移除内联样式
el.style.backgroundColor = '';
el.style.removeProperty('font-size');

// 批量设置（会覆盖所有内联样式）
el.style.cssText = `
  color: red;
  background: black;
  padding: 10px;
  margin: 0;
`;

// 保留原有样式并追加
el.style.cssText += 'border: 1px solid red;';
```

### 6.6 CSS 属性名转换

| CSS 写法 | JS style 写法 |
|----------|---------------|
| `background-color` | `style.backgroundColor` |
| `font-size` | `style.fontSize` |
| `margin-top` | `style.marginTop` |
| `z-index` | `style.zIndex` |
| `float` | `style.cssFloat`（IE 用 `styleFloat`） |
| `--main-color` | `style.getPropertyValue('--main-color')` |

---

## 第 7 章：DOM 结构操作

### 7.1 创建节点

```javascript
// 创建元素
const div = document.createElement('div');

// 创建带命名空间的元素（SVG、MathML）
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

// 创建文本节点
const text = document.createTextNode('Hello World');

// 创建注释节点
const comment = document.createComment('This is a comment');

// 创建文档片段
const fragment = document.createDocumentFragment();

// 创建模板内容（不渲染到页面）
const template = document.createElement('template');
template.innerHTML = '<li>Item</li>';
const clone = template.content.cloneNode(true);
```

### 7.2 插入节点

```javascript
const parent = document.getElementById('parent');
const child = document.createElement('span');
const ref = parent.firstElementChild;

// 末尾追加
parent.appendChild(child);

// 插入到指定子节点之前
parent.insertBefore(child, ref);

// 现代方法（更灵活，可插入多个）
parent.append(child, 'text', anotherNode);   // 末尾
parent.prepend(child);                        // 开头

// insertAdjacent 系列
ref.insertAdjacentElement('beforebegin', child);  // ref 之前（同级）
ref.insertAdjacentElement('afterbegin', child);   // ref 内部开头
ref.insertAdjacentElement('beforeend', child);    // ref 内部末尾
ref.insertAdjacentElement('afterend', child);     // ref 之后（同级）

// 插入 HTML 字符串
parent.insertAdjacentHTML('beforeend', '<p>New paragraph</p>');

// 插入纯文本
parent.insertAdjacentText('beforeend', 'plain text');
```

**insertAdjacent 位置示意图：**

```
<!-- beforebegin -->
<div id="ref">
  <!-- afterbegin -->
  Existing content
  <!-- beforeend -->
</div>
<!-- afterend -->
```

### 7.3 删除节点

```javascript
// 方法 1：通过父节点删除（返回被删除的节点）
const removed = parent.removeChild(child);

// 方法 2：直接删除自身（现代方法，不返回）
child.remove();

// 方法 3：替换节点
parent.replaceChild(newNode, oldNode);
oldNode.replaceWith(newNode);

// 方法 4：清空元素内容
parent.innerHTML = '';
while (parent.firstChild) {
  parent.removeChild(parent.firstChild);
}

// 方法 5：移除所有子节点
parent.textContent = '';  // 最快，但只保留文本
```

### 7.4 克隆节点

```javascript
// 浅克隆：只复制节点本身，不复制子节点
const shallow = el.cloneNode(false);

// 深克隆：复制节点及所有后代
const deep = el.cloneNode(true);

// 注意：
// 1. cloneNode 不会复制事件监听器
// 2. id 属性也会复制，需手动修改
// 3. 表单元素的值不会被复制（用 cloneNode(true) 后需要手动设置 value）

// 安全克隆（处理 id 冲突）
function safeClone(el, deep = true) {
  const clone = el.cloneNode(deep);
  if (clone.id) {
    clone.id = clone.id + '-clone-' + Date.now();
  }
  // 处理所有后代元素的 id
  clone.querySelectorAll('[id]').forEach(node => {
    node.id = node.id + '-clone-' + Date.now();
  });
  return clone;
}
```

### 7.5 DocumentFragment

```javascript
// 文档片段是轻量级容器，不会出现在 DOM 树中
// 插入到 DOM 时，只有其子节点被插入，片段本身消失

const fragment = document.createDocumentFragment();

for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  li.textContent = `Item ${i}`;
  fragment.appendChild(li);
}

// 只触发一次 DOM 更新
list.appendChild(fragment);
```

---

## 第 8 章：样式操作

### 8.1 内联样式

```javascript
const el = document.querySelector('div');

// 直接设置
el.style.color = 'red';
el.style.backgroundColor = '#f5f5f5';
el.style.width = '100px';

// 使用 setProperty（支持重要声明）
el.style.setProperty('color', 'red', 'important');

// 读取内联样式
console.log(el.style.color);

// 读取计算样式
const computed = getComputedStyle(el);
console.log(computed.color);           // "rgb(255, 0, 0)"
console.log(computed.fontSize);        // "16px"
console.log(computed.getPropertyValue('background-color'));
```

### 8.2 计算样式详解

```javascript
const styles = getComputedStyle(el);

// 颜色值总是返回 rgb/rgba 格式
styles.color;              // "rgb(255, 0, 0)"
styles.backgroundColor;    // "rgba(0, 0, 0, 0)"（透明）

// 尺寸值总是返回像素
styles.width;              // "100px"（即使 CSS 写的是 50%）
styles.fontSize;           // "16px"（即使 CSS 写的是 1rem）

// 简写属性
styles.margin;             // "10px 20px 10px 20px"
styles.padding;            // "0px"

// 获取伪元素样式
const after = getComputedStyle(el, '::after');
console.log(after.content);     // ""quoted""
console.log(after.display);     // "block"
```

### 8.3 CSS 变量（自定义属性）

```javascript
const root = document.documentElement;

// 定义/修改变量
root.style.setProperty('--primary-color', '#1890ff');
root.style.setProperty('--spacing', '16px');

// 读取变量
const primary = getComputedStyle(root).getPropertyValue('--primary-color').trim();

// 在特定元素上定义局部变量
const card = document.querySelector('.card');
card.style.setProperty('--card-bg', 'white');

// 在 CSS 中使用
// .card { background: var(--card-bg); }
```

### 8.4 切换主题方案

```javascript
// 方案 1：切换 class（推荐）
function setTheme(theme) {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(theme + '-theme');
  localStorage.setItem('theme', theme);
}

// 方案 2：动态修改样式表
function addGlobalStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

// 方案 3：修改 CSS 变量
function setThemeVars(colors) {
  const root = document.documentElement;
  for (const [key, val] of Object.entries(colors)) {
    root.style.setProperty(key, val);
  }
}

setThemeVars({
  '--bg-color': '#1a1a1a',
  '--text-color': '#ffffff',
  '--accent-color': '#1890ff'
});
```

### 8.5 动态样式表操作

```javascript
// 访问已有样式表
const sheet = document.styleSheets[0];  // 第一个 <link> 或 <style>

// 插入规则
sheet.insertRule('.new-class { color: red; }', sheet.cssRules.length);

// 删除规则
sheet.deleteRule(0);  // 删除第一条规则

// 创建新样式表
const newStyle = document.createElement('style');
document.head.appendChild(newStyle);
const newSheet = newStyle.sheet;
newSheet.insertRule('body { margin: 0; }', 0);

// 修改已有规则（有限支持）
const rule = sheet.cssRules[0];
if (rule.style) {
  rule.style.color = 'blue';
}
```

---

## 第 9 章：尺寸与位置

### 9.1 元素尺寸

```
┌──────────────────────────────────────────┐
│              margin（外边距）              │
│   ┌──────────────────────────────────┐   │
│   │            border（边框）          │   │
│   │   ┌──────────────────────────┐   │   │
│   │   │        padding（内边距）   │   │   │
│   │   │   ┌──────────────────┐   │   │   │
│   │   │   │                  │   │   │   │
│   │   │   │     content      │   │   │   │
│   │   │   │   (width/height) │   │   │   │
│   │   │   │                  │   │   │   │
│   │   │   └──────────────────┘   │   │   │
│   │   │                          │   │   │
│   │   └──────────────────────────┘   │   │
│   │                                  │   │
│   └──────────────────────────────────┘   │
│                                          │
└──────────────────────────────────────────┘
```

```javascript
const el = document.querySelector('div');

// offset：包含 padding + border + content，不包含 margin
el.offsetWidth;    // 可见宽度
el.offsetHeight;   // 可见高度
el.offsetLeft;     // 相对于 offsetParent 的左边距
el.offsetTop;      // 相对于 offsetParent 的上边距
el.offsetParent;   // 最近的定位祖先（position 不为 static）

// client：包含 padding + content，不包含 border
el.clientWidth;    // 内容区 + padding 宽度
el.clientHeight;   // 内容区 + padding 高度
el.clientLeft;     // 左边框宽度
el.clientTop;      // 上边框宽度

// scroll：内容的总尺寸
el.scrollWidth;    // 内容总宽度（含溢出）
el.scrollHeight;   // 内容总高度（含溢出）
el.scrollLeft;     // 水平滚动距离
el.scrollTop;      // 垂直滚动距离
```

### 9.2 元素位置

```javascript
// 相对于视口的位置
const rect = el.getBoundingClientRect();
rect.top;       // 元素顶部到视口顶部的距离
rect.left;      // 元素左边到视口左边的距离
rect.right;     // 元素右边到视口左边的距离
rect.bottom;    // 元素底部到视口顶部的距离
rect.width;     // 元素宽度（含 border）
rect.height;    // 元素高度（含 border）
rect.x;         // 同 left
rect.y;         // 同 top

// 考虑页面滚动后的绝对位置
const absoluteTop = rect.top + window.scrollY;
const absoluteLeft = rect.left + window.scrollX;
```

### 9.3 滚动操作

```javascript
// 元素滚动
el.scrollTop = 100;
el.scrollTo(0, 100);
el.scrollTo({ top: 100, left: 0, behavior: 'smooth' });
el.scrollBy(0, 50);  // 相对滚动

// 滚动到指定子元素
el.scrollIntoView();                    // 滚动到可视区域
el.scrollIntoView({ behavior: 'smooth', block: 'center' });
// block: 'start' | 'center' | 'end' | 'nearest'
// inline: 'start' | 'center' | 'end' | 'nearest'

// 页面滚动
window.scrollTo(0, 500);
window.scrollTo({ top: 0, behavior: 'smooth' });
window.scrollBy(0, 100);

// 滚动到页面顶部
window.scrollTo({ top: 0, behavior: 'smooth' });

// 检查滚动位置
window.scrollY;   // 或 window.pageYOffset（兼容旧浏览器）
window.scrollX;   // 或 window.pageXOffset
```

### 9.4 判断元素可见性

```javascript
// 是否在视口内
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

// 是否部分可见
function isPartiallyVisible(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

// 元素是否被隐藏
function isHidden(el) {
  return el.offsetParent === null ||
         getComputedStyle(el).display === 'none' ||
         getComputedStyle(el).visibility === 'hidden' ||
         getComputedStyle(el).opacity === '0';
}
```

---

## 第 10 章：事件基础

### 10.1 事件绑定

```javascript
const btn = document.querySelector('button');

// 方法 1：DOM0 级（只能绑定一个处理函数）
btn.onclick = function(e) {
  console.log('clicked');
};
btn.onclick = null;  // 移除

// 方法 2：DOM2 级（推荐，可绑定多个）
btn.addEventListener('click', handleClick);
btn.addEventListener('click', handleClick2);

// 移除监听（必须使用同一个函数引用）
btn.removeEventListener('click', handleClick);

// 只执行一次
btn.addEventListener('click', handleOnce, { once: true });

// 捕获阶段监听（默认是冒泡阶段）
btn.addEventListener('click', handleCapture, true);
// 或
btn.addEventListener('click', handleCapture, { capture: true });

// 阻止默认行为
function handleClick(e) {
  e.preventDefault();     // 阻止默认行为（如链接跳转）
  e.stopPropagation();    // 阻止事件冒泡
}
```

### 10.2 事件对象

```javascript
element.addEventListener('click', function(event) {
  event.type;           // "click"
  event.target;         // 实际触发事件的元素
  event.currentTarget;  // 绑定监听器的元素
  event.timeStamp;      // 事件发生时间

  // 鼠标位置
  event.clientX;        // 相对于视口
  event.clientY;
  event.pageX;          // 相对于文档（含滚动）
  event.pageY;
  event.offsetX;        // 相对于目标元素
  event.offsetY;

  // 按键状态
  event.ctrlKey;        // Ctrl 是否按下
  event.shiftKey;       // Shift 是否按下
  event.altKey;         // Alt 是否按下
  event.metaKey;        // Meta/Command 是否按下
  event.button;         // 0: 左键, 1: 中键, 2: 右键
});
```

### 10.3 事件委托

```javascript
// 给父元素绑定一个监听器，处理所有子元素的点击
const list = document.getElementById('list');

list.addEventListener('click', function(e) {
  // 检查点击的是否是目标元素
  const item = e.target.closest('.item');
  if (!item) return;  // 点击的不是 .item 或其子元素

  if (item.matches('.delete-btn')) {
    item.closest('.item').remove();
  } else if (item.matches('.edit-btn')) {
    editItem(item);
  }
});

// 动态添加的新元素也会自动生效
const newItem = document.createElement('li');
newItem.className = 'item';
newItem.innerHTML = '<button class="delete-btn">删除</button>';
list.appendChild(newItem);  // 无需重新绑定事件
```

### 10.4 常用事件类型

```javascript
// 鼠标事件
el.addEventListener('click', fn);       // 单击
el.addEventListener('dblclick', fn);    // 双击
el.addEventListener('mousedown', fn);   // 按下
el.addEventListener('mouseup', fn);     // 释放
el.addEventListener('mousemove', fn);   // 移动
el.addEventListener('mouseenter', fn);  // 进入（不冒泡）
el.addEventListener('mouseleave', fn);  // 离开（不冒泡）
el.addEventListener('mouseover', fn);   // 悬停（冒泡）
el.addEventListener('mouseout', fn);    // 移出（冒泡）
el.addEventListener('contextmenu', fn); // 右键菜单

// 键盘事件
document.addEventListener('keydown', fn);   // 按下
document.addEventListener('keyup', fn);     // 释放
document.addEventListener('keypress', fn);  // 字符输入（已废弃）

// 表单事件
input.addEventListener('focus', fn);      // 获得焦点
input.addEventListener('blur', fn);       // 失去焦点
input.addEventListener('input', fn);      // 输入内容变化
input.addEventListener('change', fn);     // 值改变并失去焦点
form.addEventListener('submit', fn);      // 提交

// 窗口事件
window.addEventListener('load', fn);        // 页面加载完成
window.addEventListener('DOMContentLoaded', fn);  // DOM 解析完成
window.addEventListener('resize', fn);      // 窗口大小改变
window.addEventListener('scroll', fn);      // 滚动
window.addEventListener('beforeunload', fn); // 离开页面前
```

---

## 第 11 章：表单操作

### 11.1 表单元素

```javascript
const form = document.getElementById('myForm');
const input = document.querySelector('input[name="email"]');
const select = document.querySelector('select');
const textarea = document.querySelector('textarea');

// 获取/设置值
input.value = 'test@example.com';
console.log(input.value);

// 获取/设置 placeholder
input.placeholder = 'Enter email';

// 禁用/启用
input.disabled = true;
input.disabled = false;

// 只读
input.readOnly = true;

// 必填
input.required = true;

// 聚焦/失焦
input.focus();
input.blur();

// 选中文本
input.select();

// 设置选区
input.setSelectionRange(0, 5);  // 选中前 5 个字符
```

### 11.2 复选框与单选框

```javascript
const checkbox = document.querySelector('input[type="checkbox"]');
const radios = document.querySelectorAll('input[name="gender"]');

// 复选框
checkbox.checked = true;
checkbox.checked = false;
checkbox.indeterminate = true;  // 第三种状态（半选）

// 单选框：按值选中
function setRadioValue(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

// 获取选中的单选框值
function getRadioValue(name) {
  const radio = document.querySelector(`input[name="${name}"]:checked`);
  return radio ? radio.value : null;
}
```

### 11.3 Select 元素

```javascript
const select = document.querySelector('select');

// 选中值
select.value = 'option2';

// 选中索引
select.selectedIndex = 0;

// 获取选中的 option
const selected = select.options[select.selectedIndex];
console.log(selected.value, selected.text, selected.selected);

// 遍历所有选项
for (const option of select.options) {
  console.log(option.value, option.text, option.selected);
}

// 添加选项
const newOption = new Option('Text', 'value', false, true);
select.add(newOption);

// 移除选项
select.remove(0);  // 移除第一个
select.options[0] = null;  // 同上

// 多选
const multi = document.querySelector('select[multiple]');
const selectedValues = Array.from(multi.selectedOptions).map(o => o.value);
```

### 11.4 表单验证

```javascript
const input = document.querySelector('input[type="email"]');

// HTML5 验证 API
input.checkValidity();      // 检查是否符合约束
input.reportValidity();     // 显示验证提示
input.setCustomValidity('自定义错误消息');
input.setCustomValidity('');  // 清除自定义错误

// 验证状态
input.validity.valid;           // 是否有效
input.validity.valueMissing;    // 是否为空（required）
input.validity.typeMismatch;    // 类型不匹配（如 email）
input.validity.tooShort;        // 长度不足（minlength）
input.validity.tooLong;         // 长度超出（maxlength）
input.validity.rangeUnderflow;  // 小于最小值（min）
input.validity.rangeOverflow;   // 大于最大值（max）
input.validity.patternMismatch; // 不匹配正则（pattern）

// 自定义验证
input.addEventListener('input', function() {
  if (this.value.length < 6) {
    this.setCustomValidity('至少需要 6 个字符');
  } else {
    this.setCustomValidity('');
  }
});
```

### 11.5 表单序列化

```javascript
// 使用 FormData API
const form = document.getElementById('form');
const formData = new FormData(form);

// 获取单个值
formData.get('username');

// 获取多个值（如多选）
formData.getAll('interests');

// 遍历
for (const [key, value] of formData.entries()) {
  console.log(key, value);
}

// 转换为对象
function formDataToObject(formData) {
  const obj = {};
  for (const [key, value] of formData.entries()) {
    if (obj[key]) {
      if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
      obj[key].push(value);
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

// 转换为 URL 编码字符串
const params = new URLSearchParams(formData).toString();
```

---

## 第 12 章：性能优化

### 12.1 减少重排（Reflow）

```javascript
// ❌ 低效：每次修改都会触发重排
const el = document.getElementById('box');
el.style.width = '100px';   // 重排
el.style.height = '100px';  // 重排
el.style.margin = '10px';   // 重排

// ✅ 高效：使用 cssText 一次性设置
el.style.cssText = 'width: 100px; height: 100px; margin: 10px;';

// ✅ 或添加 class
el.classList.add('size-large');
```

### 12.2 批量 DOM 操作

```javascript
// ❌ 低效：1000 次 DOM 操作
for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  list.appendChild(li);  // 每次都会触发重排
}

// ✅ 高效：使用 DocumentFragment
const fragment = document.createDocumentFragment();
for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  fragment.appendChild(li);
}
list.appendChild(fragment);  // 只触发一次重排

// ✅ 或离线操作
const clone = list.cloneNode(true);
// ... 对 clone 进行大量修改 ...
list.parentNode.replaceChild(clone, list);

// ✅ 或 display:none 后操作
list.style.display = 'none';
// ... 大量修改 ...
list.style.display = '';
```

### 12.3 缓存查询结果

```javascript
// ❌ 低效：重复查询
for (let i = 0; i < 100; i++) {
  document.getElementById('box').style.left = i + 'px';
}

// ✅ 高效：缓存元素引用
const box = document.getElementById('box');
for (let i = 0; i < 100; i++) {
  box.style.left = i + 'px';
}
```

### 12.4 事件委托

```javascript
// ❌ 低效：给每个按钮绑定事件
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', handleClick);
});

// ✅ 高效：委托给父元素
document.getElementById('container').addEventListener('click', function(e) {
  if (e.target.matches('.btn')) {
    handleClick(e);
  }
});
```

### 12.5 防抖与节流

```javascript
// 防抖：延迟执行，只执行最后一次
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 节流：固定间隔执行
function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 使用
window.addEventListener('scroll', throttle(() => {
  console.log('scroll position:', window.scrollY);
}, 200));

window.addEventListener('resize', debounce(() => {
  console.log('window size:', window.innerWidth);
}, 300));
```

### 12.6 requestAnimationFrame

```javascript
// 用于动画，与显示器刷新率同步
function animate() {
  const box = document.getElementById('box');
  let start = null;

  function step(timestamp) {
    if (!start) start = timestamp;
    const progress = timestamp - start;
    const percent = Math.min(progress / 1000, 1);

    box.style.transform = `translateX(${percent * 300}px)`;

    if (progress < 1000) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
```

---

## 第 13 章：实用工具函数

### 13.1 DOM 查询工具

```javascript
// 安全地获取元素
function $(selector, context = document) {
  return context.querySelector(selector);
}

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// 等待元素出现（MutationObserver）
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}
```

### 13.2 元素操作工具

```javascript
// 移除所有子元素
function empty(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

// 在元素前/后插入
function insertAfter(newNode, referenceNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function insertBefore(newNode, referenceNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode);
}

// 包装元素
function wrap(el, wrapper) {
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
}

// 解包元素
function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

// 获取元素在父元素中的索引
function index(el) {
  return Array.from(el.parentNode.children).indexOf(el);
}
```

### 13.3 样式工具

```javascript
// 获取元素的实际样式（含继承）
function getStyle(el, prop) {
  return getComputedStyle(el).getPropertyValue(prop).trim();
}

// 设置多个样式
function setStyles(el, styles) {
  Object.assign(el.style, styles);
}

// 获取元素相对于文档的位置
function getOffset(el) {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX
  };
}

// 判断元素是否在视口内
function isInViewport(el, threshold = 0) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top <= window.innerHeight + threshold &&
    rect.bottom >= -threshold &&
    rect.left <= window.innerWidth + threshold &&
    rect.right >= -threshold
  );
}
```

### 13.4 表单工具

```javascript
// 重置表单
function resetForm(form) {
  form.reset();
}

// 序列化表单为对象
function serializeForm(form) {
  const data = {};
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    if (data[key]) {
      data[key] = [].concat(data[key], value);
    } else {
      data[key] = value;
    }
  }
  return data;
}

// 验证表单
function validateForm(form) {
  const inputs = form.querySelectorAll('input, select, textarea');
  let isValid = true;
  inputs.forEach(input => {
    if (!input.checkValidity()) {
      isValid = false;
      input.classList.add('invalid');
    } else {
      input.classList.remove('invalid');
    }
  });
  return isValid;
}
```

### 13.5 事件工具

```javascript
// 一次性事件
function once(el, event, fn) {
  el.addEventListener(event, function handler(e) {
    el.removeEventListener(event, handler);
    fn.call(this, e);
  });
}

// 点击外部触发
function onClickOutside(el, fn) {
  document.addEventListener('click', function(e) {
    if (!el.contains(e.target)) {
      fn(e);
    }
  });
}

// 长按事件
function onLongPress(el, fn, delay = 500) {
  let timer;
  el.addEventListener('mousedown', () => {
    timer = setTimeout(fn, delay);
  });
  el.addEventListener('mouseup', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => clearTimeout(timer));
}
```

---

## 附录：速查表

### A. 节点选择

| 方法 | 返回 | 实时 | 范围 |
|------|------|------|------|
| `getElementById(id)` | Element / null | - | Document |
| `getElementsByTagName(tag)` | HTMLCollection | ✅ | Element |
| `getElementsByClassName(cls)` | HTMLCollection | ✅ | Element |
| `querySelector(sel)` | Element / null | - | Element |
| `querySelectorAll(sel)` | NodeList | ❌ | Element |

### B. 节点遍历

| 属性 | 说明 |
|------|------|
| `parentNode` | 父节点 |
| `parentElement` | 父元素节点 |
| `children` | 子元素集合 |
| `childNodes` | 所有子节点 |
| `firstElementChild` | 第一个子元素 |
| `lastElementChild` | 最后一个子元素 |
| `firstChild` | 第一个子节点（含文本） |
| `nextElementSibling` | 下一个兄弟元素 |
| `previousElementSibling` | 上一个兄弟元素 |
| `closest(sel)` | 最近的匹配祖先 |

### C. 内容操作

| 属性 | 解析 HTML | 安全 | 性能 |
|------|-----------|------|------|
| `innerHTML` | ✅ | ❌ | 中 |
| `outerHTML` | ✅ | ❌ | 中 |
| `textContent` | ❌ | ✅ | 高 |
| `innerText` | ❌ | ✅ | 低（触发重排） |

### D. 尺寸位置

| 属性 | 包含内容 |
|------|----------|
| `offsetWidth/Height` | content + padding + border |
| `clientWidth/Height` | content + padding |
| `scrollWidth/Height` | 内容总尺寸（含溢出） |
| `getBoundingClientRect()` | 相对于视口的位置 |

### E. classList 方法

| 方法 | 说明 |
|------|------|
| `add(...cls)` | 添加 class |
| `remove(...cls)` | 移除 class |
| `toggle(cls, force)` | 切换 class |
| `contains(cls)` | 是否包含 |
| `replace(old, new)` | 替换 class |

### F. 事件

| 阶段 | 说明 |
|------|------|
| 捕获阶段 | 从 window 到目标元素 |
| 目标阶段 | 事件到达目标元素 |
| 冒泡阶段 | 从目标元素到 window |

| 方法 | 说明 |
|------|------|
| `preventDefault()` | 阻止默认行为 |
| `stopPropagation()` | 阻止事件传播 |
| `stopImmediatePropagation()` | 阻止同类型其他监听器 |

---

*文档版本：2.0 | 适用于现代浏览器（ES6+）*
*最后更新：2026-09-02*
