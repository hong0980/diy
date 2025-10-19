from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    StaleElementReferenceException,
    TimeoutException,
    NoSuchElementException,
    NoAlertPresentException,
    NoSuchFrameException,
    NoSuchWindowException,
    ElementNotInteractableException,
    InvalidArgumentException,
    SessionNotCreatedException
)
from selenium_stealth import stealth
from fake_useragent import UserAgent
import time, os, tempfile, shutil, psutil, glob, uuid

class WebFormAutomation:
    """
    Selenium 自动化表单操作类，包含完善的定位、操作、交互和反爬规避方法
    本类作为 Selenium 的使用示例和说明文档，涵盖核心功能、示例和最佳实践。
    基于 Selenium 官方文档（https://www.selenium.dev/documentation/webdriver/）、Chrome DevTools Protocol 和 Chromium 文档整理。

    ### 1. 元素定位策略 (By 类的方法)
    - By.ID: 通过元素的 ID 属性定位（唯一且高效）。示例: find_element(By.ID, "username")。提示: ID 应唯一。异常: NoSuchElementException。
    - By.NAME: 通过 name 属性定位，常用于表单。示例: find_element(By.NAME, "password")。提示: 确保 name 唯一。
    - By.CLASS_NAME: 通过 class 属性定位，返回第一个匹配项。示例: find_element(By.CLASS_NAME, "btn-submit")。提示: 不支持复合类名，需用 CSS_SELECTOR。
    - By.TAG_NAME: 通过标签名定位（如 "input"）。示例: find_element(By.TAG_NAME, "input")。提示: 适合简单结构。
    - By.LINK_TEXT: 通过链接的完整文本定位 <a> 元素。示例: find_element(By.LINK_TEXT, "登录")。提示: 区分大小写。
    - By.PARTIAL_LINK_TEXT: 通过链接的部分文本定位。示例: find_element(By.PARTIAL_LINK_TEXT, "忘记")。
    - By.CSS_SELECTOR: 通过 CSS 选择器定位，最灵活。示例: find_element(By.CSS_SELECTOR, "div.form>input#email")。
    - By.XPATH: 通过 XPath 表达式定位，支持复杂路径。示例: find_element(By.XPATH, "//input[@type='submit']")。提示: 性能较低。

    # 获取元素内容相关
    text = element.text                    # 获取可见文本内容（去除HTML标签）
    inner_html = element.get_attribute("innerHTML")  # 获取元素内部的HTML代码
    outer_html = element.get_attribute("outerHTML")  # 获取包括自身的完整HTML代码

    # 获取标准属性
    value = element.get_attribute("value")        # 表单元素的值
    href = element.get_attribute("href")          # 链接地址
    src = element.get_attribute("src")            # 图片等资源的源地址
    alt = element.get_attribute("alt")            # 图片的替代文本
    title = element.get_attribute("title")        # 标题属性（悬停提示）
    type = element.get_attribute("type")          # 输入框类型
    placeholder = element.get_attribute("placeholder")  # 占位符文本

    # 获取状态属性
    disabled = element.get_attribute("disabled")  # 是否禁用（返回"true"或None）
    readonly = element.get_attribute("readonly")  # 是否只读
    checked = element.get_attribute("checked")    # 是否选中（复选框/单选框）
    selected = element.get_attribute("selected")  # 是否选择（下拉选项）

    # 获取自定义数据属性
    data_id = element.get_attribute("data-id")    # data-id属性
    data_value = element.get_attribute("data-value")  # data-value属性
    # 支持任何 data-* 属性

    # 获取样式和类相关
    class_name = element.get_attribute("class")   # class属性值
    id_value = element.get_attribute("id")        # id属性值
    style = element.get_attribute("style")        # 内联样式

    # 获取CSS计算样式
    color = element.value_of_css_property("color")
    background_color = element.value_of_css_property("background-color")
    font_size = element.value_of_css_property("font-size")
    font_weight = element.value_of_css_property("font-weight")
    display = element.value_of_css_property("display")
    visibility = element.value_of_css_property("visibility")

    # 获取元素元信息
    tag_name = element.tag_name                  # 标签名（小写）
    location = element.location                  # 位置坐标：{'x': 100, 'y': 200}
    size = element.size                          # 尺寸：{'width': 50, 'height': 30}
    rect = element.rect                          # 位置和尺寸：{'x': 100, 'y': 200, 'width': 50, 'height': 30}

    # 获取表单特定属性
    max_length = element.get_attribute("maxlength")  # 最大输入长度
    min = element.get_attribute("min")            # 最小值
    max = element.get_attribute("max")            # 最大值
    pattern = element.get_attribute("pattern")    # 验证模式
    required = element.get_attribute("required")  # 是否必填

    # 获取链接特定属性
    target = element.get_attribute("target")      # 链接打开方式
    rel = element.get_attribute("rel")            # 链接关系

    # 获取图片特定属性
    width = element.get_attribute("width")        # 图片宽度
    height = element.get_attribute("height")      # 图片高度

    driver.page_source  driverd的html
    # 按标签名
    driver.find_element(By.CSS_SELECTOR, "a")          # 所有<a>标签
    driver.find_element(By.CSS_SELECTOR, "input")      # 所有<input>标签
    elements = driver.find_elements(By.CSS_SELECTOR, "div.post")  # 所有div.post元素

    # 按ID
    driver.find_element(By.CSS_SELECTOR, "#username")  # id="username"
    driver.find_element(By.CSS_SELECTOR, "div#header") # <div id="header">

    # 按类名
    driver.find_element(By.CSS_SELECTOR, ".btn")       # class="btn"
    driver.find_element(By.CSS_SELECTOR, "button.primary")  # <button class="primary">

    # 精确匹配属性
    driver.find_element(By.CSS_SELECTOR, "[name='email']")      # name="email"
    driver.find_element(By.CSS_SELECTOR, "input[type='submit']")  # <input type="submit">

    # 包含特定值
    driver.find_element(By.CSS_SELECTOR, "[href*='login']")     # href包含"login"
    driver.find_element(By.CSS_SELECTOR, "[class*='btn']")      # class包含"btn"

    # 开头匹配
    driver.find_element(By.CSS_SELECTOR, "[href^='https']")     # href以"https"开头

    # 结尾匹配
    driver.find_element(By.CSS_SELECTOR, "[src$='.png']")       # src以".png"结尾

    # 包含单词
    driver.find_element(By.CSS_SELECTOR, "[class~='active']")   # class包含单词"active"

    # 后代选择器（空格）
    driver.find_element(By.CSS_SELECTOR, "div.container p")     # div内的所有p元素

    # 直接子元素（>）
    driver.find_element(By.CSS_SELECTOR, "form > input")        # form的直接子input

    # 相邻兄弟（+）
    driver.find_element(By.CSS_SELECTOR, "label + input")       # label后面的第一个input

    # 后续兄弟（~）
    driver.find_element(By.CSS_SELECTOR, "h1 ~ p")              # h1后面的所有p元素

    # 状态伪类
    driver.find_element(By.CSS_SELECTOR, "input:disabled")      # 禁用的input
    driver.find_element(By.CSS_SELECTOR, "a:visited")           # 访问过的链接
    driver.find_element(By.CSS_SELECTOR, "input:focus")         # 获得焦点的元素

    # 结构伪类
    driver.find_element(By.CSS_SELECTOR, "tr:first-child")      # 第一个tr
    driver.find_element(By.CSS_SELECTOR, "li:last-child")       # 最后一个li
    driver.find_element(By.CSS_SELECTOR, "div:nth-child(2)")    # 第二个div子元素
    driver.find_element(By.CSS_SELECTOR, "p:nth-of-type(1)")    # 第一个p元素

    # 复杂的组合选择器
    driver.find_element(By.CSS_SELECTOR, "form#login > input[type='text'][name='username']")
    driver.find_element(By.CSS_SELECTOR, "div.user-panel > input[name='login']")
    driver.find_element(By.CSS_SELECTOR, "a[href*='download'].btn.primary:not([disabled])")

    # 表格操作
    driver.find_element(By.CSS_SELECTOR, "table.data > tbody > tr:nth-child(3) > td:nth-child(2)")

    # 导航菜单
    driver.find_element(By.CSS_SELECTOR, "nav > ul.menu > li.active > a[href^='/home']")

    # 登录表单
    username = driver.find_element(By.CSS_SELECTOR, "form#login input[type='text']")
    password = driver.find_element(By.CSS_SELECTOR, "form#login input[type='password']")
    submit = driver.find_element(By.CSS_SELECTOR, "form#login button[type='submit']")

    ### 2. 元素交互方法
    - element.send_keys("text"): 输入文本到输入框。示例: element.send_keys("username")。
    - element.clear(): 清空输入框内容。示例: element.clear()。
    - element.click(): 点击元素。示例: element.click()。异常: ElementClickInterceptedException, ElementNotInteractableException。
    - element.get_attribute("attr"): 获取元素属性。示例: element.get_attribute("href")。
    - element.text: 获取元素可见文本。示例: print(element.text)。
    - element.is_displayed(): 检查元素是否可见。示例: if element.is_displayed(): ... .
    - element.is_enabled(): 检查元素是否启用。
    - element.is_selected(): 检查是否选中（复选框/单选）。

    ### 3. 等待机制 (WebDriverWait 和 expected_conditions)
    - Implicit Wait: 全局等待元素出现。示例: driver.implicitly_wait(10)。提示: 不要与显式等待混用。
    - Explicit Wait: 使用 WebDriverWait 等待特定条件。示例: WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "id")))。
    - 常见 Expected Conditions (EC):
      - presence_of_element_located: 元素在 DOM 中存在。
      - visibility_of_element_located: 元素可见。
      - element_to_be_clickable: 元素可点击。
      - text_to_be_present_in_element: 元素包含指定文本。
      - invisibility_of_element_located: 元素不可见。

    ### 4. 弹窗处理 (Alerts)
    - driver.switch_to.alert: 切换到警报弹窗。示例: alert = driver.switch_to.alert。
    - alert.accept(): 接受弹窗。示例: alert.accept()。
    - alert.dismiss(): 取消弹窗。示例: alert.dismiss()。
    - alert.send_keys("text"): 输入文本到提示弹窗。示例: alert.send_keys("Selenium")。
    - alert.text: 获取弹窗文本。

    ### 5. 框架处理 (Frames 和 IFrames)
    - driver.switch_to.frame("id_or_element"): 切换到框架。示例: driver.switch_to.frame("iframe_id")。
    - driver.switch_to.default_content(): 返回主文档。

    ### 6. 窗口和标签处理 (Windows 和 Tabs)
    - driver.current_window_handle: 获取当前窗口句柄。
    - driver.window_handles: 获取所有窗口句柄列表。
    - driver.switch_to.window("handle"): 切换到指定窗口。
    - driver.switch_to.new_window('tab' or 'window'): 创建新标签或窗口（Selenium 4+）。
    - driver.close(): 关闭当前窗口。

    ### 7. 高级交互 (ActionChains)
    - actions.move_to_element(element): 鼠标悬停。
    - actions.double_click(element): 双击。
    - actions.context_click(element): 右键点击。
    - actions.drag_and_drop(source, target): 拖拽。
    - actions.click_and_hold(element): 点击并保持。
    - actions.move_by_offset(x, y): 移动到偏移位置。

    ### 8. 浏览器操作和导航
    - driver.get("url"): 打开网页。
    - driver.refresh(): 刷新页面。
    - driver.back(): 返回上一页。
    - driver.forward(): 前进到下一页。
    - driver.maximize_window(): 最大化窗口。
    - driver.set_window_size(w, h): 设置窗口大小。
    - driver.execute_script("js"): 执行 JavaScript。
    - driver.get_screenshot_as_file("path.png"): 保存截图。

    ### 9. 文件上传
    - element.send_keys("/path/to/file"): 上传文件。提示: 需 <input type="file">，路径需绝对路径。

    ### 10. 下拉框处理 (Select 类)
    - Select(select_element): 初始化 Select 对象。
    - select.select_by_visible_text("text"): 通过可见文本选择。
    - select.select_by_value("value"): 通过 value 属性选择。
    - select.select_by_index(index): 通过索引选择。
    - select.options: 获取所有选项列表。
    - select.first_selected_option: 获取第一个选中选项。

    ### 11. 临时目录清理
    - Selenium 使用系统临时目录（Windows: %TEMP%, Linux/Mac: /tmp）存储 Chrome 临时配置文件。
    - driver.quit(): 理论上清理临时目录，但可能因进程未完全退出失败。
    - 解决方案: 使用 tempfile.mkdtemp 创建隔离目录，指定 --user-data-dir，并在会话结束时用 shutil.rmtree 清理。
    - 重试机制: 处理文件锁问题。
    - 进程检查: 使用 psutil 确保 Chrome 进程退出。
    - 初始化前清理: 检查并清理残留临时目录，避免目录冲突。

    ### 12. ChromeOptions 配置
    - ChromeOptions 控制浏览器行为，通过 add_argument() 和 add_experimental_option() 设置。
    - 常用命令行参数 (add_argument):
      - --headless: 无头模式（无界面运行）。场景: CI/CD、服务器测试。注意: 可能影响某些交互。
      - --disable-gpu: 禁用 GPU 加速。场景: 与 --headless 配合。
      - --no-sandbox: 禁用沙箱（Linux/Docker 常用）。
      - --disable-extensions: 禁用扩展。
      - --disable-dev-shm-usage: 禁用 /dev/shm（Docker 内存优化）。
      - --window-size=width,height: 设置窗口大小。
      - --start-maximized: 启动时最大化窗口。
      - --user-agent="string": 自定义 User-Agent。场景: 模拟移动设备。
      - --disable-notifications: 禁用浏览器通知。
      - --disable-popup-blocking: 禁用弹窗拦截。
      - --incognito: 隐身模式。场景: 无缓存测试。
      - --user-data-dir=path: 指定用户数据目录。场景: 隔离临时文件。
      - --lang=locale: 设置浏览器语言。示例: --lang=zh-CN。
      - --proxy-server=host:port: 设置代理。
      - --disable-web-security: 禁用 Web 安全策略（谨慎使用）。
      - --allow-running-insecure-content: 允许不安全内容。
      - --disable-infobars: 禁用信息栏。
      - --ignore-certificate-errors: 忽略 SSL 证书错误（谨慎使用）。
    - 常用实验性选项 (add_experimental_option):
      - excludeSwitches: 禁用特定开关。示例: ["enable-automation"]。
      - prefs: 设置 Chrome 首选项。子选项:
        - download.default_directory: 设置默认下载目录。
        - profile.default_content_settings.popups: 控制弹窗（0=禁用）。
        - profile.managed_default_content_settings.images: 控制图像加载（2=禁用）。
        - credentials_enable_service: 禁用密码保存提示。
      - mobileEmulation: 模拟移动设备。示例: {"deviceName": "Pixel 2"}。
      - perfLoggingPrefs: 启用性能日志。
      - useAutomationExtension: 禁用自动化扩展。

    ### 13. 反爬机制规避
    - 目的: 防止网站检测 Selenium 自动化（如 navigator.webdriver）。
    - 方法:
      - 使用 selenium-stealth 库，通过 stealth() 函数简化反爬配置。
      - 修改浏览器属性：
        - navigator.webdriver: 设置为 undefined，规避自动化检测。
        - navigator.languages: 设置语言列表（如 ['zh-CN', 'zh', 'en']）。
        - navigator.plugins: 模拟插件列表。
        - navigator.platform: 设置平台（如 'Win32'）。
        - window.screen: 模拟屏幕分辨率（如 1920x1080）。
        - WebGL: 修改 WebGL 渲染信息（如 vendor='Intel Inc.', renderer='Intel Iris OpenGL Engine'）。
        - Canvas: 随机化 Canvas 指纹。
        - navigator.hardwareConcurrency: 设置 CPU 核心数（如 4）。
        - navigator.deviceMemory: 设置设备内存（如 8GB）。
        - navigator.maxTouchPoints: 设置触摸点数（如 0 表示无触摸屏）。
      - 设置额外 HTTP 头（如 Accept-Language、User-Agent）。
      - 支持自定义 JavaScript 注入，允许用户添加特定规避逻辑。
    - stealth 配置参数:
      - platform: 设置 navigator.platform（如 'Win32'）。
      - vendor: 设置 navigator.vendor（如 'Google Inc.'）。
      - webgl_vendor/renderer: 设置 WebGL 信息。
      - languages: 设置语言列表。
      - fix_hairline: 修复 headless 模式下的渲染差异。
      - mock_hardware: 模拟硬件信息（如 CPU、内存）。
      - run_on_insecure_origins: 允许不安全内容。
      - hide_webdriver: 隐藏 navigator.webdriver。
    - 自定义脚本:
      - 通过 custom_scripts 参数注入额外 JavaScript（如修改 navigator.vendor）。
    - 提示:
      - 确保 User-Agent、语言和 HTTP 头一致。
      - 测试反爬效果：访问 https://intoli.com/blog/not-possible-to-block-chrome-headless/test.html 或 https://bot.sannysoft.com/.
      - 参考: https://github.com/ultrafunkamsterdam/selenium-stealth

    ### 最佳实践
    - 使用自定义 user-data-dir 隔离临时文件，或禁用 --user-data-dir 避免冲突。
    - 在 finally 块中调用 driver.quit() 和清理临时目录。
    - 结合 headless 模式和反爬规避优化爬虫性能。
    - 初始化前清理残留 Chrome/Chromedriver 进程和临时目录。
    - 测试反爬效果时，验证 navigator.webdriver 等属性。
    """

    def __init__(self, driver_path="/usr/bin/chromedriver", url=None, custom_temp_dir=None, chrome_options_config=None, use_anti_detection=True, use_user_data_dir=True):
        """
        初始化 WebDriver，支持自定义临时目录、ChromeOptions 和反爬规避
        参数:
            driver_path: ChromeDriver 可执行文件路径（默认 /usr/bin/chromedriver）
            url: 目标网页 URL
            custom_temp_dir: 自定义用户数据目录（默认 None，使用系统 Temp）
            chrome_options_config: 字典，指定 ChromeOptions 配置（默认 None，使用推荐配置）
            use_anti_detection: 是否启用反爬机制规避（默认 True）
            use_user_data_dir: 是否使用 --user-data-dir（默认 True，设为 False 禁用）
        """
        # 初始化前清理残留 Chrome/Chromedriver 进程
        self._terminate_chrome_processes()

        chrome_options = Options()

        # 默认推荐的 ChromeOptions 配置
        default_options = {
            "arguments": [
                "--disable-extensions",  # 禁用扩展，减少干扰
                "--no-sandbox",  # Linux/Docker 环境兼容
                "--disable-gpu",  # 配合 headless 模式
                # "--headless",  # 无头模式（注释掉以便调试）
                "--disable-notifications",  # 禁用浏览器通知
                "--disable-infobars",  # 禁用 "Chrome 正受自动化控制" 提示
                "--start-maximized"  # 启动时最大化窗口
            ],
            "experimental_options": {
                "excludeSwitches": ["enable-automation"],  # 隐藏自动化提示
                "prefs": {
                    "profile.default_content_settings.popups": 0,  # 禁用弹窗
                    "credentials_enable_service": False,  # 禁用密码保存提示
                    "profile.password_manager_enabled": False  # 禁用密码管理
                }
            }
        }

        # 初始化 User-Agent
        ua = UserAgent()
        default_user_agent = ua.chrome
        default_options["arguments"].append(f"--user-agent={default_user_agent}")

        # 应用用户自定义配置
        if chrome_options_config:
            for arg in chrome_options_config.get("arguments", []):
                chrome_options.add_argument(arg)
            for key, value in chrome_options_config.get("experimental_options", {}).items():
                chrome_options.add_experimental_option(key, value)
        else:
            for arg in default_options["arguments"]:
                chrome_options.add_argument(arg)
            for key, value in default_options["experimental_options"].items():
                chrome_options.add_experimental_option(key, value)

        # 自定义用户数据目录
        self.custom_temp_dir = None
        if use_user_data_dir:
            self.custom_temp_dir = custom_temp_dir or tempfile.mkdtemp(prefix=f"selenium_chrome_{uuid.uuid4().hex}_")
            os.makedirs(self.custom_temp_dir, exist_ok=True)
            chrome_options.add_argument(f"--user-data-dir={self.custom_temp_dir}")
            chrome_options.add_experimental_option("prefs", {
                **chrome_options.experimental_options.get("prefs", {}),
                "download.default_directory": self.custom_temp_dir
            })

        try:
            # 初始化 WebDriver
            self.driver = webdriver.Chrome(service=Service(driver_path), options=chrome_options)
            self.url = url
            self.wait = WebDriverWait(self.driver, 10)
            self.driver.implicitly_wait(5)

            # 启用反爬机制
            if use_anti_detection:
                self.apply_anti_detection(default_user_agent)
            print("WebDriver 初始化成功")
        except SessionNotCreatedException as e:
            print(f"WebDriver 初始化失败（会话创建错误）: {e}")
            self._cleanup_temp_dirs()
            raise
        except Exception as e:
            print(f"WebDriver 初始化失败: {e}")
            self._cleanup_temp_dirs()
            raise

    def _terminate_chrome_processes(self, max_retries=3):
        """终止残留的 Chrome 和 Chromedriver 进程"""
        try:
            for proc in psutil.process_iter(['pid', 'name']):
                if 'chrome' in proc.info['name'].lower() or 'chromedriver' in proc.info['name'].lower():
                    for attempt in range(max_retries):
                        try:
                            proc.terminate()
                            proc.wait(timeout=3)
                            print(f"已终止进程: {proc.info['name']} (PID: {proc.info['pid']})")
                            break
                        except psutil.TimeoutExpired:
                            proc.kill()
                            print(f"强制终止进程: {proc.info['name']} (PID: {proc.info['pid']})")
                        except Exception as e:
                            print(f"终止进程失败: {proc.info['name']} (PID: {proc.info['pid']}): {e}")
                            break
        except Exception as e:
            print(f"检查或终止进程失败: {e}")

    def apply_anti_detection(self, user_agent, custom_scripts=None):
        """应用反爬机制规避，使用 selenium-stealth 修改浏览器属性"""
        try:
            stealth(
                self.driver,
                platform="Win32",
                fix_hairline=True,
                vendor="Google Inc.",
                webgl_vendor="Intel Inc.",
                renderer="Intel Iris OpenGL Engine",
                languages=["zh-CN", "zh", "en"],
                mock_hardware=True,
                run_on_insecure_origins=True,
                hide_webdriver=True
            )

            headers = {
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "User-Agent": user_agent,
                "Referer": "https://www.google.com"
            }
            self.driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": headers})
            self.driver.execute_cdp_cmd("Network.setUserAgentOverride", {
                "userAgent": user_agent,
                "acceptLanguage": "zh-CN,zh;q=0.9,en;q=0.8"
            })

            if custom_scripts:
                for script in custom_scripts:
                    self.driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": script})

            print("反爬机制规避已应用")
        except Exception as e:
            print(f"反爬机制应用失败: {e}")

    def open_page(self):
        """打开目标网页"""
        try:
            self.driver.get(self.url)
            print("网页打开成功")
        except Exception as e:
            print(f"打开网页失败: {e}")

    def find_element_safe(self, by, value):
        """安全查找元素，带等待"""
        try:
            return self.wait.until(EC.presence_of_element_located((by, value)))
        except TimeoutException:
            print(f"未找到元素: {by}={value}")
            return None

    def click_element(self, by, value, use_js=False):
        """点击元素，支持 JavaScript 点击和滚动"""
        element = self.find_element_safe(by, value)
        if not element:
            return False
        try:
            if use_js:
                self.driver.execute_script("arguments[0].click();", element)
            else:
                self.driver.execute_script("arguments[0].scrollIntoView();", element)
                element.click()
            return True
        except ElementClickInterceptedException:
            print("元素被遮挡，尝试使用 JavaScript 点击")
            self.driver.execute_script("arguments[0].click();", element)
            return True
        except StaleElementReferenceException:
            print("元素过期，重新尝试点击")
            return self.click_element(by, value, use_js=True)
        except ElementNotInteractableException:
            print("元素不可交互")
            return False
        except Exception as e:
            print(f"点击失败: {e}")
            return False

    def safe_select_dropdown(self, by, value, select_value, select_by="visible_text"):
        """安全选择下拉框选项"""
        select_element = self.find_element_safe(by, value)
        if not select_element:
            return False
        try:
            select = Select(select_element)
            if select_by == "visible_text":
                select.select_by_visible_text(select_value)
            elif select_by == "value":
                select.select_by_value(select_value)
            elif select_by == "index":
                select.select_by_index(int(select_value))
            self.wait.until(
                lambda d: select.first_selected_option.text == select_value if select_by == "visible_text"
                else select.first_selected_option.get_attribute("value") == select_value
            )
            return True
        except NoSuchElementException:
            print("下拉框选项未找到")
            return False
        except Exception as e:
            print(f"下拉框选择失败: {e}")
            return False

    def handle_alert(self, accept=True, text_to_send=None):
        """处理弹窗，支持接受/取消和输入文本"""
        try:
            self.wait.until(EC.alert_is_present())
            alert = self.driver.switch_to.alert
            alert_text = alert.text
            if text_to_send:
                alert.send_keys(text_to_send)
            if accept:
                alert.accept()
            else:
                alert.dismiss()
            print(f"弹窗内容: {alert_text}")
            return True
        except NoAlertPresentException:
            print("无弹窗可处理")
            return False
        except Exception as e:
            print(f"处理弹窗失败: {e}")
            return False

    def switch_to_iframe(self, iframe_locator):
        """切换到 iframe，支持 ID、Name 或 WebElement"""
        try:
            if isinstance(iframe_locator, str):
                self.driver.switch_to.frame(iframe_locator)
            else:
                self.driver.switch_to.frame(iframe_locator)
            print(f"已切换到 iframe: {iframe_locator}")
            return True
        except NoSuchFrameException:
            print(f"未找到 iframe: {iframe_locator}")
            return False
        except Exception as e:
            print(f"切换 iframe 失败: {e}")
            return False

    def switch_to_default(self):
        """返回主文档"""
        try:
            self.driver.switch_to.default_content()
            print("已返回主文档")
            return True
        except Exception as e:
            print(f"返回主文档失败: {e}")
            return False

    def custom_dropdown_select(self, dropdown_selector, option_text):
        """处理非标准下拉框（如 div 模拟的下拉框）"""
        try:
            dropdown = self.find_element_safe(By.CSS_SELECTOR, dropdown_selector)
            if not dropdown:
                return False
            dropdown.click()
            option = self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, f"//div[@class='dropdown-option' and contains(text(), '{option_text}')]")
                )
            )
            option.click()
            return True
        except Exception as e:
            print(f"自定义下拉框选择失败: {e}")
            return False

    def fill_form(self, username, password, country, gender):
        """填写并提交表单"""
        try:
            username_field = self.find_element_safe(By.NAME, "username")
            if username_field:
                username_field.clear()
                username_field.send_keys(username)
            password_field = self.find_element_safe(By.NAME, "password")
            if password_field:
                password_field.clear()
                password_field.send_keys(password)
            self.safe_select_dropdown(By.NAME, "country", country, "visible_text")
            gender_radio = self.find_element_safe(By.CSS_SELECTOR, f"input[value='{gender}']")
            if gender_radio:
                self.driver.execute_script("arguments[0].click();", gender_radio)
            self.click_element(By.CSS_SELECTOR, "button[type='submit']")
            return True
        except Exception as e:
            print(f"表单填写失败: {e}")
            return False

    def hover_element(self, by, value):
        """鼠标悬停到元素上"""
        element = self.find_element_safe(by, value)
        if not element:
            return False
        try:
            actions = ActionChains(self.driver)
            actions.move_to_element(element).perform()
            print(f"成功悬停到元素: {by}={value}")
            return True
        except Exception as e:
            print(f"悬停失败: {e}")
            return False

    def drag_and_drop(self, source_by, source_value, target_by, target_value):
        """拖拽元素从源到目标"""
        source = self.find_element_safe(source_by, source_value)
        target = self.find_element_safe(target_by, target_value)
        if not source or not target:
            return False
        try:
            actions = ActionChains(self.driver)
            actions.drag_and_drop(source, target).perform()
            print("拖拽操作成功")
            return True
        except Exception as e:
            print(f"拖拽失败: {e}")
            return False

    def upload_file(self, by, value, file_path):
        """上传文件"""
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            return False
        element = self.find_element_safe(by, value)
        if not element:
            return False
        try:
            element.send_keys(os.path.abspath(file_path))
            print(f"文件上传成功: {file_path}")
            return True
        except InvalidArgumentException:
            print("无效的文件路径")
            return False
        except Exception as e:
            print(f"文件上传失败: {e}")
            return False

    def switch_to_window(self, handle=None, index=None):
        """切换到指定窗口或标签"""
        try:
            if handle:
                self.driver.switch_to.window(handle)
            elif index is not None:
                handles = self.driver.window_handles
                if index < len(handles):
                    self.driver.switch_to.window(handles[index])
                else:
                    print("无效的窗口索引")
                    return False
            else:
                self.wait.until(EC.number_of_windows_to_be(len(self.driver.window_handles)))
                self.driver.switch_to.window(self.driver.window_handles[-1])
            print("窗口切换成功")
            return True
        except NoSuchWindowException:
            print("窗口不存在")
            return False
        except Exception as e:
            print(f"窗口切换失败: {e}")
            return False

    def get_element_info(self, by, value):
        """获取元素信息（如文本、属性、可见性）"""
        element = self.find_element_safe(by, value)
        if not element:
            return None
        try:
            info = {
                "text": element.text,
                "value": element.get_attribute("value"),
                "is_displayed": element.is_displayed(),
                "is_enabled": element.is_enabled(),
                "is_selected": element.is_selected() if element.tag_name in ["input", "option"] else False
            }
            print(f"元素信息: {info}")
            return info
        except Exception as e:
            print(f"获取元素信息失败: {e}")
            return None

    def navigate_browser(self, action):
        """浏览器导航操作"""
        try:
            if action == "back":
                self.driver.back()
            elif action == "forward":
                self.driver.forward()
            elif action == "refresh":
                self.driver.refresh()
            print(f"导航操作成功: {action}")
            return True
        except Exception as e:
            print(f"导航失败: {e}")
            return False

    def take_screenshot(self, file_path):
        """截取当前页面截图"""
        try:
            self.driver.get_screenshot_as_file(file_path)
            print(f"截图保存到: {file_path}")
            return True
        except Exception as e:
            print(f"截图失败: {e}")
            return False

    def _is_chrome_running(self):
        """检查 Chrome 或 Chromedriver 进程是否仍在运行"""
        try:
            for proc in psutil.process_iter(['pid', 'name']):
                if 'chrome' in proc.info['name'].lower() or 'chromedriver' in proc.info['name'].lower():
                    return True
            return False
        except Exception:
            return False

    def _cleanup_temp_dirs(self, max_retries=3):
        """清理临时目录，包括自定义 user-data-dir 和系统 Temp 中的 Selenium 残留"""
        if self.custom_temp_dir and os.path.exists(self.custom_temp_dir):
            for attempt in range(max_retries):
                try:
                    shutil.rmtree(self.custom_temp_dir, ignore_errors=True)
                    print(f"已删除自定义临时目录: {self.custom_temp_dir}")
                    break
                except PermissionError:
                    print(f"权限不足，尝试 {attempt + 1}/{max_retries} 次清理: {self.custom_temp_dir}")
                    time.sleep(1)
                except Exception as e:
                    print(f"删除自定义临时目录失败: {self.custom_temp_dir}, 错误: {e}")
                    break

        temp_dir = os.environ.get('TEMP', '/tmp')
        patterns = ['scoped_dir*', 'webdriver-*', 'anonymous*', 'chrome_debug.log', 'selenium_chrome_*']
        for pattern in patterns:
            dirs_to_delete = glob.glob(os.path.join(temp_dir, pattern))
            for dir_path in dirs_to_delete:
                for attempt in range(max_retries):
                    try:
                        if os.path.isdir(dir_path):
                            shutil.rmtree(dir_path, ignore_errors=True)
                            print(f"已删除系统临时目录: {dir_path}")
                        else:
                            os.remove(dir_path)
                            print(f"已删除系统临时文件: {dir_path}")
                        break
                    except PermissionError:
                        print(f"权限不足，尝试 {attempt + 1}/{max_retries} 次清理: {dir_path}")
                        time.sleep(1)
                    except Exception as e:
                        print(f"删除失败: {dir_path}, 错误: {e}")

    def close_browser(self):
        """关闭浏览器并清理临时目录"""
        try:
            if hasattr(self, 'driver') and self.driver:
                self.driver.quit()
                for _ in range(5):
                    if not self._is_chrome_running():
                        break
                    time.sleep(2)
                print("浏览器进程已完全关闭")
            self._cleanup_temp_dirs()
        except Exception as e:
            print(f"关闭浏览器失败: {e}")
            self._cleanup_temp_dirs()

if __name__ == "__main__":
    # 配置示例
    DRIVER_PATH = "/usr/bin/chromedriver"  # 使用你的 ChromeDriver 路径
    URL = "http://example.com/form"  # 替换为实际的网页地址
    FILE_PATH = "/tmp/file.txt"  # 替换为实际文件路径
    USER_DATA_DIR = tempfile.mkdtemp(prefix=f"selenium_chrome_{uuid.uuid4().hex}_")

    # 自定义 ChromeOptions 配置示例
    custom_chrome_options = {
        "arguments": [
            "--headless",  # 无头模式（注释掉以便调试）
            "--lang=zh-CN",  # 设置中文界面
            "--disable-web-security"  # 谨慎：仅用于测试跨域
        ],
        "experimental_options": {
            "mobileEmulation": {"deviceName": "Pixel 2"},  # 模拟移动设备
            "prefs": {
                "download.default_directory": USER_DATA_DIR,
                "profile.managed_default_content_settings.images": 2
            }
        }
    }

    # 自定义反爬脚本示例
    custom_anti_detection_scripts = [
        "Object.defineProperty(navigator, 'vendor', {get: () => 'Google Inc.'})",
        "Object.defineProperty(window, 'outerWidth', {get: () => 1920})"
    ]

    # 初始化自动化对象
    automation = WebFormAutomation(
        driver_path=DRIVER_PATH,
        url=URL,
        custom_temp_dir=USER_DATA_DIR,
        chrome_options_config=custom_chrome_options,
        use_anti_detection=True,
        use_user_data_dir=True
    )

    try:
        # 打开网页
        automation.open_page()
        time.sleep(2)

        # 如果需要自定义反爬脚本，可手动调用
        automation.apply_anti_detection(UserAgent().chrome, custom_scripts=custom_anti_detection_scripts)

        # 填写表单
        automation.fill_form(
            username="testuser",
            password="testpass123",
            country="中国",
            gender="male"
        )

        # 示例：鼠标悬停
        automation.hover_element(By.ID, "hover-element")

        # 示例：处理弹窗
        automation.handle_alert(accept=True, text_to_send="Selenium")

        # 示例：切换到 iframe 并点击
        automation.switch_to_iframe("iframe_id")
        automation.click_element(By.ID, "iframe_button")
        automation.switch_to_default()

        # 示例：处理自定义下拉框
        automation.custom_dropdown_select(".custom-dropdown", "北京市")

        # 示例：上传文件
        automation.upload_file(By.CSS_SELECTOR, "input[type='file']", FILE_PATH)

        # 示例：拖拽操作
        automation.drag_and_drop(By.ID, "source-element", By.ID, "target-element")

        # 示例：切换到新窗口
        original_handle = automation.driver.current_window_handle
        automation.click_element(By.LINK_TEXT, "Open New Window")
        automation.switch_to_window()
        automation.switch_to_window(original_handle)

        # 示例：获取元素信息
        automation.get_element_info(By.ID, "some-element")

        # 示例：浏览器导航
        automation.navigate_browser("refresh")

        # 示例：保存截图
        automation.take_screenshot("screenshot.png")

    except Exception as e:
        print(f"自动化流程出错: {e}")
    finally:
        automation.close_browser()
