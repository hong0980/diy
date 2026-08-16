# Playwright JS 自动化表单操作指南

## 概览
本文档是 Playwright JS 的全面指南，涵盖元素定位、交互、等待机制、反爬规避、日志追踪等功能，适用于端到端测试、Web 爬虫和自动化脚本开发。基于 Playwright 官方文档（https://playwright.dev/docs/intro）、Chromium DevTools Protocol 和浏览器文档整理，适配 Playwright v1.45+（截至 2025 年 9 月）。本更新特别完善了等待机制部分，详细列出 `locator.waitFor()` 的 `state` 参数及其注释，并明确所有等待方法的返回类型（包括 Promise 特性，如 `.then()` 和 `.catch()`）。文档采用分层目录结构，优化可读性和 PDF 生成。

## 目录
1. [元素定位策略](#1-元素定位策略)
   - [定位方法](#定位方法)
   - [获取元素信息](#获取元素信息)
   - [CSS 选择器示例](#css-选择器示例)
2. [元素交互方法](#2-元素交互方法)
3. [等待机制](#3-等待机制)
4. [弹窗处理](#4-弹窗处理)
5. [框架处理](#5-框架处理)
6. [窗口和标签处理](#6-窗口和标签处理)
7. [高级交互](#7-高级交互)
8. [浏览器操作和导航](#8-浏览器操作和导航)
9. [文件上传](#9-文件上传)
10. [下拉框处理](#10-下拉框处理)
11. [临时目录管理](#11-临时目录管理)
12. [浏览器和上下文配置](#12-浏览器和上下文配置)
13. [反爬机制规避](#13-反爬机制规避)
14. [日志和追踪](#14-日志和追踪)
15. [网络拦截和路由处理](#15-网络拦截和路由处理)
16. [Cookies 和存储管理](#16-cookies-和存储管理)
17. [错误处理和重试机制](#17-错误处理和重试机制)
18. [性能优化和录制](#18-性能优化和录制)
19. [移动设备模拟](#19-移动设备模拟)
20. [多浏览器支持和并行执行](#20-多浏览器支持和并行执行)
21. [CI/CD 集成](#21-cicd-集成)
22. [组件测试](#22-组件测试)
23. [无障碍测试](#23-无障碍测试)
24. [视觉回归测试](#24-视觉回归测试)
25. [API 模拟和测试](#25-api-模拟和测试)
26. [WebSocket 处理](#26-websocket-处理)
27. [浏览器扩展测试](#27-浏览器扩展测试)
28. [分布式测试和分片](#28-分布式测试和分片)
29. [云服务集成](#29-云服务集成)
30. [国际化与本地化支持](#30-国际化与本地化支持)
31. [Observability 工具集成](#31-observability-工具集成)
32. [最佳实践](#32-最佳实践)

## 1. 元素定位策略
### 定位方法
- **通过角色**：`page.getByRole('button', { name: 'Submit', exact: true, max: 1 })`，支持 ARIA 无障碍定位。
- **通过文本**：`page.getByText('Login', { exact: true })`，支持正则 `/Login/i`。
- **通过占位符**：`page.getByPlaceholder('Enter email', { exact: false })`。
- **通过标签**：`page.getByLabel('Username')`，关联 `<label>` 的 `for` 属性。
- **通过测试 ID**：`page.getByTestId('submit-button')`，推荐用于测试。
- **通过 CSS 选择器**：`page.locator('div.form > input#email')`，支持 `:has()`、`:not()`。
- **通过 XPath**：`page.locator('xpath=//input[@type="submit"]')`，优先 CSS。
- **链式定位**：`page.locator('form').locator('input[name="email"]')`。
- **通过 Alt 文本**：`page.getByAltText('Logo')`，用于图片。
- **高级过滤**：`page.locator('button').filter({ has: page.locator('span.icon') })` 或 `.filter({ hasText: /regex/ })`。
- **逻辑组合**：`page.locator('input').or(page.locator('textarea'))` 或 `.and(page.locator('[required]'))`.

### 获取元素信息
```javascript
// 文本内容
text = await locator.textContent();         // 可见文本（去除 HTML）
inner_html = await locator.innerHTML();     // 内部 HTML
outer_html = await locator.outerHTML();     // 完整 HTML
allTexts = await locator.allTextContents(); // 文本数组
innerText = await locator.innerText();      // 渲染文本

// 标准属性
value = await locator.inputValue();         // 输入框值
href = await locator.getAttribute('href');  // 链接地址
src = await locator.getAttribute('src');    // 资源地址
alt = await locator.getAttribute('alt');    // 替代文本
title = await locator.getAttribute('title');// 标题
type = await locator.getAttribute('type');  // 输入类型
aria_label = await locator.getAttribute('aria-label'); // 无障碍标签

// 状态属性
disabled = await locator.isDisabled();      // 是否禁用
readonly = await locator.getAttribute('readonly'); // 是否只读
checked = await locator.isChecked();        // 是否选中
selected = await locator.isSelected();      // 下拉选项选中
visible = await locator.isVisible();        // 是否可见
enabled = await locator.isEnabled();        // 是否启用
focused = await locator.isFocused();        // 是否聚焦
editable = await locator.isEditable();      // 是否可编辑

// 自定义数据属性
data_id = await locator.getAttribute('data-id'); // data-id
dataset = await locator.evaluate(el => el.dataset); // 所有 data-*

// 样式和类
class_name = await locator.getAttribute('class'); // class 属性
classes = await locator.evaluate(el => Array.from(el.classList)); // 类数组
hasClass = await locator.evaluate(el => el.classList.contains('active')); // 检查类
style = await locator.getAttribute('style'); // 内联样式
computed_style = await page.evaluate((el) => window.getComputedStyle(el), await locator.elementHandle());
color = computed_style.color;
opacity = computed_style.opacity;
zIndex = computed_style.zIndex;

// 元素元信息
tag_name = await locator.evaluate((el) => el.tagName.toLowerCase()); // 标签名
bounding_box = await locator.boundingBox(); // { x, y, width, height }
screenshot = await locator.screenshot({ type: 'jpeg', quality: 80 }); // 元素截图
count = await locator.count();              // 匹配数量
parent = await locator.locator('..').elementHandle(); // 父元素
children = await locator.locator('> *').all(); // 子元素

// 表单特定属性
max_length = await locator.getAttribute('maxlength'); // 最大输入长度
validity = await locator.evaluate(el => el.validity); // 表单有效性
validationMessage = await locator.evaluate(el => el.validationMessage); // 验证消息

// 链接和图片属性
target = await locator.getAttribute('target'); // 链接打开方式
download = await locator.getAttribute('download'); // 下载属性
naturalWidth = await locator.evaluate(el => el.naturalWidth); // 图片原始宽度
loading = await locator.getAttribute('loading'); // 加载模式 (lazy/eager)
```

### CSS 选择器示例
```javascript
// 标签
await page.locator('a');                    // 所有 <a>
elements = await page.locator('div.post').all(); // 所有 div.post

// ID 和类
await page.locator('#username');            // id="username"
await page.locator('button.primary');       // class="primary"

// 属性
await page.locator('[name="email"]');       // name="email"
await page.locator('[href*="login"]');      // href 包含 "login"
await page.locator('[src$=".png"]');        // src 以 ".png" 结尾
await page.locator('[aria-label="search"]'); // 无障碍属性

// 组合选择器
await page.locator('form#login > input[type="text"][name="username"]');
await page.locator('div:has(> button.active)'); // 包含子元素
await page.locator('input:matches([type="email"], [type="tel"])'); // 多类型匹配
```

## 2. 元素交互方法
- `await locator.fill('text', { force: true, delay: 50 })`: 输入文本。
- `await locator.clear()`: 清空输入框。
- `await locator.click({ button: 'right', position: { x: 10, y: 10 }, trial: true })`: 点击。
- `await locator.getAttribute('href')`: 获取属性。
- `await locator.textContent()`: 获取文本。
- **扩展**:
  - `await locator.hover({ position: { x: 0, y: 0 } })`: 悬停。
  - `await locator.focus()`: 聚焦。
  - `await locator.check({ force: true })`: 选中复选框。
  - `await locator.press('Enter', { delay: 100 })`: 按键。
  - `await locator.scrollIntoViewIfNeeded({ behavior: 'smooth' })`: 滚动。
  - `await locator.dispatchEvent('click')`: 触发事件。

## 3. 等待机制
Playwright 提供强大的等待机制，包括自动等待（内置于交互方法）和显式等待（通过 `expect` 或特定等待方法）。所有等待方法返回 `Promise`，支持 `.then()` 和 `.catch()` 用于异步处理和错误捕获。以下详细说明每种等待方法，包括 `locator.waitFor()` 的所有 `state` 参数及其用途。

### 自动等待
- **描述**: Playwright 的交互方法（如 `locator.click()`, `locator.fill()`）内置自动等待元素**可见**（`visible`）和**启用**（`enabled`），默认超时 30 秒（可通过 `page.setDefaultTimeout(timeout)` 配置）。
- **返回类型**: 无需显式等待的交互方法返回 `Promise<void>`，可使用 `.then(() => { ... })` 处理成功，或 `.catch(e => { if (e.name === 'TimeoutError') { ... } })` 处理超时。
- **示例**:
  ```javascript
  await page.locator('#submit').click()
    .then(() => console.log('Clicked successfully'))
    .catch(e => console.error(`Click failed: ${e.message}`));
  // 自动等待元素可见和启用，超时抛出 TimeoutError
  ```

### 显式等待
显式等待用于需要特定条件的场景，分为 `expect` 断言和直接等待方法（如 `locator.waitFor()`）。所有方法返回 `Promise`，支持 `.then()` 和 `.catch()`。

#### expect 断言
- **描述**: 使用 `@playwright/test` 的 `expect` API 验证条件，自动轮询直到满足或超时。支持丰富的断言方法，适合测试场景。
- **返回类型**: `Promise<void>`，成功时解析，无需返回值；失败时抛出 `Error`，可通过 `.catch()` 处理。
- **常见方法**:
  - `toBeVisible({ timeout: 10000 })`: 验证元素可见。
    - 返回: `Promise<void>`
    - 示例: `await expect(locator).toBeVisible().catch(e => console.error('Not visible:', e));`
  - `toBeEnabled()`: 验证元素启用。
    - 返回: `Promise<void>`
  - `toHaveText('text', { useInnerText: true })`: 验证文本内容。
    - 返回: `Promise<void>`
  - `toHaveAttribute('href', /regex/)`: 验证属性。
    - 返回: `Promise<void>`
  - `toHaveCount(n)`: 验证元素数量。
    - 返回: `Promise<void>`
  - `toHaveCSS('color', 'rgb(255, 0, 0)')`: 验证 CSS 属性。
    - 返回: `Promise<void>`
  - `toHaveValue('value')`: 验证输入框值。
    - 返回: `Promise<void>`
  - `toBeFocused()`: 验证元素聚焦。
    - 返回: `Promise<void>`
- **选项**:
  - `timeout`: 超时时间（毫秒），默认 30 秒。
  - `polling`: 轮询策略，`'raf'`（requestAnimationFrame，约 16ms）或数值（毫秒）。
- **示例**:
  ```javascript
  await expect(page.locator('#submit')).toBeVisible({ timeout: 5000 })
    .then(() => console.log('Button is visible'))
    .catch(e => console.error('Visibility check failed:', e));
  // 轮询直到元素可见或超时
  ```

#### locator.waitFor
- **描述**: 等待 `Locator` 满足特定状态（如 `visible`、`hidden`），适用于精确控制等待条件。
- **返回类型**: `Promise<void>`，成功时解析，失败（如超时）抛出 `TimeoutError`，支持 `.then()` 和 `.catch()`。
- **参数**:
  - `state`: 等待的目标状态，选项如下：
    - `'attached'`: 等待元素附加到 DOM（可能不可见）。适用于动态加载元素。
      - 示例: 等待 AJAX 加载的元素。
    - `'detached'`: 等待元素从 DOM 移除。适用于验证元素消失（如弹窗关闭）。
      - 示例: 等待加载指示器消失。
    - `'visible'`: 等待元素可见（在视口中且 `display` 不是 `none`，`opacity` 不是 0）。默认状态。
      - 示例: 等待按钮可点击。
    - `'hidden'`: 等待元素隐藏（不在 DOM 或不可见）。适用于验证 UI 更新。
      - 示例: 等待错误提示隐藏。
  - `timeout`: 超时时间（毫秒），默认 30 秒。
- **示例**:
  ```javascript
  const locator = page.locator('#submit');
  await locator.waitFor({ state: 'visible', timeout: 10000 })
    .then(() => console.log('Button is visible'))
    .catch(e => console.error('Wait failed:', e.message));
  // 等待按钮可见，超时抛出 TimeoutError
  ```

#### 其他等待方法
- **page.waitForLoadState(state, { timeout })**:
  - **描述**: 等待页面加载到指定状态。
  - **返回类型**: `Promise<void>`，支持 `.then()` 和 `.catch()`。
  - **状态**:
    - `'load'`: 页面完全加载（包括子资源）。
      - 示例: 等待所有图片加载。
    - `'domcontentloaded'`: DOM 加载完成（不包括子资源）。
      - 示例: 等待 HTML 结构就绪。
    - `'networkidle'`: 网络空闲（500ms 内无新请求）。
      - 示例: 等待 AJAX 请求完成。
    - `'commit'`: 导航提交（新页面开始加载）。
      - 示例: 验证页面跳转开始。
  - **示例**:
    ```javascript
    await page.waitForLoadState('networkidle')
      .then(() => console.log('Page loaded'))
      .catch(e => console.error('Load failed:', e));
    ```
- **page.waitForURL(url, { waitUntil, timeout })**:
  - **描述**: 等待页面导航到指定 URL（支持正则）。
  - **返回类型**: `Promise<void>`，支持 `.then()` 和 `.catch()`。
  - **选项**:
    - `waitUntil`: 同 `page.goto` 的加载状态（`load`, `domcontentloaded`, `networkidle`, `commit`）。
  - **示例**:
    ```javascript
    await page.waitForURL(/dashboard/, { waitUntil: 'networkidle' })
      .then(() => console.log('Navigated to dashboard'))
      .catch(e => console.error('Navigation failed:', e));
    ```
- **page.waitForSelector(selector, { state, timeout })**:
  - **描述**: 等待选择器匹配元素（旧 API，推荐 `locator.waitFor`）。
  - **返回类型**: `Promise<ElementHandle | null>`，返回匹配的元素句柄（或 null，若 `state: 'detached'`），支持 `.then()` 和 `.catch()`。
  - **状态**: 同 `locator.waitFor` 的 `state`（`attached`, `detached`, `visible`, `hidden`）。
  - **示例**:
    ```javascript
    await page.waitForSelector('#submit', { state: 'visible' })
      .then(handle => console.log('Element found:', handle ? 'Yes' : 'No'))
      .catch(e => console.error('Selector wait failed:', e));
    ```
- **page.waitForFunction(fn, { polling, timeout })**:
  - **描述**: 等待 JavaScript 函数返回真值。
  - **返回类型**: `Promise<JSHandle>`，返回函数的执行结果，支持 `.then()` 和 `.catch()`。
  - **选项**:
    - `polling`: 轮询间隔（`'raf'` 或毫秒）。
  - **示例**:
    ```javascript
    await page.waitForFunction('() => window.ready === true', { polling: 100 })
      .then(result => console.log('Function resolved:', result.jsonValue()))
      .catch(e => console.error('Function wait failed:', e));
    ```
- **page.waitForEvent(event, { predicate, timeout })**:
  - **描述**: 等待特定事件（如 `popup`, `request`, `response`）。
  - **返回类型**: `Promise<Event>`，返回事件对象（如 `Page`、`Request`），支持 `.then()` 和 `.catch()`。
  - **示例**:
    ```javascript
    await page.waitForEvent('popup')
      .then(popup => console.log('Popup opened:', popup.url()))
      .catch(e => console.error('Popup wait failed:', e));
    ```
- **page.waitForTimeout(timeout)**:
  - **描述**: 等待指定时间（毫秒），用于模拟延迟。
  - **返回类型**: `Promise<void>`，支持 `.then()` 和 `.catch()`。
  - **示例**:
    ```javascript
    await page.waitForTimeout(1000)
      .then(() => console.log('Waited 1 second'))
      .catch(e => console.error('Timeout failed:', e)); // 通常不会失败
    ```

### 错误处理
- 所有等待方法可能抛出 `TimeoutError` 或其他错误（如 `Error`），应使用 `.catch()` 处理。
- **示例**:
  ```javascript
  try {
    await expect(page.locator('#submit')).toBeVisible({ timeout: 5000 });
    console.log('Button is visible');
  } catch (e) {
    if (e.name === 'TimeoutError') {
      console.error('Button not visible within 5 seconds');
    } else {
      console.error('Unexpected error:', e.message);
    }
  }
  ```

### 最佳实践
- **优先自动等待**：交互方法（如 `click`）已包含等待，减少显式等待。
- **精准状态**：选择合适的 `state`（如 `attached` 用于动态元素，`visible` 用于 UI 交互）。
- **合理超时**：根据场景调整 `timeout`，避免过长等待。
- **轮询优化**：使用 `'raf'` 轮询以降低 CPU 占用。
- **错误捕获**：始终使用 `.catch()` 或 `try-catch` 处理超时和 DOM 错误。

## 4. 弹窗处理
- `page.on('dialog', dialog => dialog.accept('text'))`: 处理 alert/confirm/prompt。
- **扩展**:
  - `page.on('filechooser', fileChooser => fileChooser.setFiles('/path'))`.
  - `page.on('download', download => download.saveAs('file.pdf'))`.

## 5. 框架处理
- `page.frameLocator('#iframe_id').locator('input')`: 框架内定位。
- **扩展**:
  - `page.frames().map(f => f.name())`: 框架列表。
  - `frame.evaluate('js')`: 执行 JS。
  - `frame.waitForFunction('() => document.readyState === "complete"')`.

## 6. 窗口和标签处理
- `browser.newContext()`: 新上下文。
- `context.newPage()`: 新页面。
- **扩展**:
  - `page.waitForEvent('popup')`: 弹出窗口。
  - `context.grantPermissions(['clipboard-read'])`: 权限管理。

## 7. 高级交互
- `page.mouse.move(x, y, { steps: 20 })`: 平滑移动。
- `page.keyboard.type('text', { delay: 50 })`: 模拟输入。
- **扩展**:
  - `page.touchscreen.tap(locator)`: 触摸点击。
  - `page.mouse.wheel(0, 100)`: 滚动。
  - `page.keyboard.insertText('text')`: 直接插入。

## 8. 浏览器操作和导航
- `page.goto('url', { waitUntil: 'networkidle', referer: 'prev.com' })`: 导航。
- `page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 })`: 截图。
- **扩展**:
  - `page.pdf({ format: 'A4', margin: { top: '1cm' } })`: PDF。
  - `page.emulateTimezone('Asia/Shanghai')`: 时区。
  - `page.emulateMedia({ media: 'screen', colorScheme: 'dark' })`.

## 9. 文件上传
- `locator.setInputFiles('/path')`: 上传文件。
- **扩展**: `setInputFiles({ buffer: Buffer.from(data), mimeType: 'image/png' })`.

## 10. 下拉框处理
- `locator.selectOption('value')`: 选择选项。
- **扩展**:
  - `expect(locator).toHaveValue('selected')`.
  - `locator.evaluate(el => Array.from(el.options).map(o => o.value))`.

## 11. 临时目录管理
- `playwright.launch({ args: ['--user-data-dir=/custom/path'] })`.
- **清理**:
  ```javascript
  const rimraf = require('rimraf');
  rimraf.sync('/custom/path', { maxRetries: 3 });
  ```
- **扩展**: `child_process.execSync('pkill -f playwright')` 清理进程。

## 12. 浏览器和上下文配置
- **LaunchOptions**:
  - `--headless`, `--no-sandbox`, `--user-agent='Mozilla/5.0'`.
  - `--enable-automation=false`, `--remote-debugging-port=9222`.
- **ContextOptions**:
  - `viewport: { width: 1280, height: 720 }`, `userAgent`, `geolocation`.
  - `recordVideo`, `recordHar`, `bypassCSP: true`, `locale: 'zh-CN'`.

## 13. 反爬机制规避
- 使用 `playwright-extra` 和 `stealth-plugin`.
- 修改 `navigator.webdriver`, `window.screen`, `Canvas` 指纹。
- **扩展**:
  - 随机延迟：`page.waitForTimeout(Math.random() * 1000 + 500)`.
  - 代理旋转：`newContext({ proxy: { server: 'http://proxy:8080' } })`.
  - 行为模拟：随机滚动、鼠标轨迹曲线。
  - 检测规避：覆盖 `MutationObserver`, `IntersectionObserver`.

## 14. 日志和追踪
- `page.on('console', msg => console.log(`${msg.type()}: ${msg.text()}`))`.
- **Tracing**:
  ```javascript
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.tracing.stop({ path: 'trace.zip' });
  ```
- **扩展**:
  - `page.on('websocket', ws => ws.on('framesent', frame => console.log(frame.payload)))`.
  - 集成 `pino`：`const logger = require('pino')(); logger.info('Request: %s', req.url())`.

## 15. 网络拦截和路由处理
- `page.route('**/api/**', route => route.fulfill({ status: 200, body: JSON.stringify({}) }))`.
- **扩展**:
  - `page.routeFromHAR('requests.har', { update: true })`.
  - `expect.request('/api', { timeout: 5000 })`.

## 16. Cookies 和存储管理
- `context.addCookies([{ name: 'session', value: 'token', domain: '.example.com' }])`.
- **扩展**:
  - `context.storageState({ path: 'state.json' })`.
  - `page.evaluate(() => sessionStorage.setItem('key', 'value'))`.

## 17. 错误处理和重试机制
- **重试**:
  ```javascript
  async function retry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try { return await fn(); } catch (e) {
        if (i === retries - 1) throw e;
        await page.waitForTimeout(delay * (i + 1));
      }
    }
  }
  ```
- **扩展**: `expect.poll(() => condition, { timeout: 10000 })`.

## 18. 性能优化和录制
- **视频**：`newContext({ recordVideo: { dir: 'videos/', pixelFormat: 'yuv420p' } })`.
- **截图**：`page.screenshot({ animations: 'disabled' })`.
- **扩展**:
  - 性能指标：`page.evaluate(() => performance.timing.loadEventEnd)`.
  - 优化：`page.setDefaultTimeout(10000)`, 批量 `locator.all()`.

## 19. 移动设备模拟
- `newContext({ ...devices['iPhone 12'], hasTouch: true })`.
- **扩展**: `page.touchscreen.tap(locator)`, `expect(page).toHaveTitle('Mobile View')`.

## 20. 多浏览器支持和并行执行
- `chromium.launch()`, `firefox.launch()`, `webkit.launch()`.
- **扩展**:
  - `playwright.config.js`：
    ```javascript
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
    ]
    ```

## 21. CI/CD 集成
- **GitHub Actions**:
  ```yaml
  name: Playwright Tests
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: microsoft/playwright-github-action@v1
          with:
            playwright-version: '1.45.0'
        - run: npx playwright test --reporter=html
  ```
- **Docker**:
  ```dockerfile
  FROM mcr.microsoft.com/playwright:v1.45.0-focal
  COPY . /tests
  WORKDIR /tests
  RUN npm install && npx playwright test
  ```
- **扩展**: 报告 `junit`, 缓存 `--cache-dir=/cache`.

## 22. 组件测试
- `npx playwright test --ct` 测试 React/Vue/Svelte。
- **示例**:
  ```javascript
  import { test } from '@playwright/experimental-ct-react';
  test('Button', async ({ mount }) => {
    const component = await mount(<Button>Click</Button>);
    await component.click();
    await expect(component).toContainText('Clicked');
  });
  ```

## 23. 无障碍测试
- **Axe 扫描**:
  ```javascript
  import { injectAxe, checkA11y } from 'axe-playwright';
  await injectAxe(page);
  await checkA11y(page, null, { detailedReport: true, axeOptions: { runOnly: ['wcag2a', 'wcag2aa'] } });
  ```
- **扩展**:
  - 测试键盘导航：`await page.keyboard.press('Tab'); expect(await page.locator(':focus').evaluate(el => el.tagName)).toBe('INPUT')`.
  - ARIA 属性验证：`expect(locator).toHaveAttribute('aria-label', 'Search')`.

## 24. 视觉回归测试
- **工具**：`playwright-visual-regression` 或 `pixelmatch`.
- **示例**:
  ```javascript
  await page.screenshot({ path: 'current.png' });
  const diff = await compareScreenshots('current.png', 'baseline.png');
  expect(diff).toBeLessThan(0.01); // 差异小于 1%
  ```
- **扩展**: 集成 `jest-image-snapshot` 或 GitHub Actions 自动对比。

## 25. API 模拟和测试
- **模拟**:
  ```javascript
  await page.route('**/api/users', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ users: [] })
  }));
  ```
- **API 测试**:
  ```javascript
  const apiRequest = await page.context().request;
  const response = await apiRequest.get('https://api.example.com');
  expect(response.status()).toBe(200);
  ```
- **扩展**: 集成 `msw`（Mock Service Worker）模拟复杂 API。

## 26. WebSocket 处理
- **监听**:
  ```javascript
  page.on('websocket', ws => {
    ws.on('framesent', frame => console.log(`Sent: ${frame.payload}`));
    ws.on('framereceived', frame => console.log(`Received: ${frame.payload}`));
  });
  ```
- **扩展**: 模拟 WebSocket：`page.route('wss://**', route => route.fulfill({ status: 101 }))`.

## 27. 浏览器扩展测试
- **加载扩展**:
  ```javascript
  const browser = await chromium.launch({
    args: ['--load-extension=/path/to/extension', '--disable-extensions-except=/path/to/extension']
  });
  ```
- **扩展**: 测试扩展 UI：`page.locator('#extension-panel').click()`.

## 28. 分布式测试和分片
- **分片**：`npx playwright test --shard=1/3`.
- **扩展**:
  - 分布式运行：`playwright.config.js` `{ workers: process.env.CI ? 4 : 1 }`.
  - 云分片：BrowserStack 或 LambdaTest。

## 29. 云服务集成
- **BrowserStack**:
  ```javascript
  const browser = await playwright.chromium.connectOverCDP({
    wsEndpoint: 'wss://cdp.browserstack.com?caps=' + encodeURIComponent(JSON.stringify({
      os: 'Windows', os_version: '10', browser: 'chrome', browser_version: 'latest'
    }))
  });
  ```
- **扩展**: 集成 Sauce Labs 或 AWS Device Farm。

## 30. 国际化与本地化支持
- **配置**:
  ```javascript
  const context = await browser.newContext({
    locale: 'zh-CN',
    extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  ```
- **扩展**:
  - 测试多语言 UI：`expect(page.locator('h1')).toHaveText('欢迎')`.
  - 验证 `lang` 属性：`expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')`.

## 31. Observability 工具集成
- **Datadog**:
  ```javascript
  const { datadogLogs } = require('@datadog/datadog-api-client');
  const logger = datadogLogs.createLogger({ apiKey: process.env.DD_API_KEY });
  page.on('request', req => logger.log(`Request: ${req.url()}`, { service: 'playwright' }));
  ```
- **扩展**: New Relic、Sentry 集成，监控错误和性能。

## 32. 最佳实践
- **模块化**:
  ```javascript
  class LoginPage {
    constructor(page) {
      this.page = page;
      this.username = page.getByLabel('Username');
    }
    /** @param {string} user @param {string} pass */
    async login(user, pass) {
      await this.username.fill(user);
      await this.page.getByLabel('Password').fill(pass);
      await this.page.getByRole('button', { name: 'Submit' }).click();
    }
  }
  ```
- **安全**：`dotenv` 管理凭证，`keytar` 加密存储。
- **性能**：批量操作，`slowMo: 50` 调试，`workers: 4` 并行。
- **CI/CD**：Docker `--no-sandbox`, 报告 `html,junit`.
- **扩展**:
  - JSDoc 文档化：`/** @returns {Promise<void>} */`.
  - 版本控制：Pin `playwright@1.45.0`.
  - 错误日志：过滤敏感数据。
  - 规模化：分片、云测试、POM 模式。

**参考**：Playwright 官方文档、GitHub 示例、社区插件。建议结合项目需求持续优化。