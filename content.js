/**
 * Shopee Auto Cart Extension - Content Script
 * 负责 DOM 操作、页面元素检测、执行自动化操作
 * Requirements: 5.1, 5.2
 */

// ============================================
// 配置常量
// ============================================

const CONFIG = {
  MAX_CARTS_WITH_VARIANTS: 5,    // 有规格时最多添加5个，然后换下一个商品
  MAX_CARTS_NO_VARIANTS: 3,      // 无规格时最多添加3个
  MAX_LOG_ENTRIES: 200,          // 最多保存200条日志
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,
  OPERATION_DELAY: 1000,         // 操作间延迟 (ms)
  NAVIGATION_TIMEOUT: 30000,     // 导航超时时间 (ms)
  ELEMENT_TIMEOUT: 5000,         // 元素等待超时时间 (ms)
  PAGE_LOAD_DELAY: 3000,         // 商品页面加载等待时间 (ms)
  SEARCH_PAGE_DELAY: 5000,       // 搜索页面加载等待时间 (ms)
  VARIANT_SELECT_DELAY: 500,     // 规格选择后等待时间 (ms)
  KEYWORD_CHANGE_INTERVAL: 240000 // 搜索词更换间隔 (ms) - 4分钟
};

// ============================================
// 4.1 基础框架 - 页面类型检测
// ============================================

/**
 * 页面类型枚举
 */
const PageType = {
  SEARCH: 'search',
  PRODUCT: 'product',
  SHOP: 'shop',
  OTHER: 'other'
};

/**
 * 检测当前页面类型
 * @returns {string} PageType
 */
function detectPageType() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  // 调试日志
  console.log('[Shopee Auto Cart] 检测页面类型, URL:', url, 'pathname:', pathname);
  
  // 搜索页面: /search?keyword=xxx
  if (pathname.includes('/search') || url.includes('keyword=')) {
    console.log('[Shopee Auto Cart] 检测到搜索页面');
    return PageType.SEARCH;
  }
  
  // 店铺页面: /shop/xxx (需要在商品页面之前检测，因为有些店铺URL可能包含商品ID格式)
  if (pathname.match(/^\/shop\//) || pathname.match(/\/shop\//)) {
    console.log('[Shopee Auto Cart] 检测到店铺页面');
    return PageType.SHOP;
  }
  
  // 商品详情页: 多种 URL 格式
  // 格式1: /product/123456/789012
  // 格式2: /-i.123456.789012
  // 格式3: /商品名称-i.123456.789012 (Shopee 台湾站常见格式)
  // 格式4: 包含 .i. 的 URL (新版 Shopee)
  // 格式5: 任何包含 -i. 后跟数字的 URL
  const productPatterns = [
    /\/product\/\d+\/\d+/,           // /product/shopId/productId
    /-i\.\d+\.\d+/,                  // -i.shopId.productId
    /\.i\.\d+\.\d+/,                 // .i.shopId.productId
    /i\.\d+\.\d+/                    // i.shopId.productId (更宽松的匹配)
  ];
  
  for (const pattern of productPatterns) {
    if (pattern.test(url) || pattern.test(pathname)) {
      console.log('[Shopee Auto Cart] 检测到商品详情页 (匹配模式:', pattern, ')');
      return PageType.PRODUCT;
    }
  }
  
  console.log('[Shopee Auto Cart] 未知页面类型');
  return PageType.OTHER;
}

/**
 * 检查是否为搜索页面
 * @returns {boolean}
 */
function isSearchPage() {
  return detectPageType() === PageType.SEARCH;
}

/**
 * 检查是否为商品详情页
 * @returns {boolean}
 */
function isProductPage() {
  return detectPageType() === PageType.PRODUCT;
}

/**
 * 检查是否为店铺页面
 * @returns {boolean}
 */
function isShopPage() {
  return detectPageType() === PageType.SHOP;
}

// ============================================
// 4.1 基础框架 - 消息通信
// ============================================

/**
 * 发送消息到 background script
 * @param {Object} message - 消息对象
 * @returns {Promise<Object>} 响应
 */
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 发送日志消息
 * @param {string} message - 日志内容
 * @param {'info'|'success'|'error'|'warning'} logType - 日志类型
 */
async function log(message, logType = 'info') {
  console.log(`[Shopee Auto Cart] [${logType}] ${message}`);
  try {
    await sendMessage({
      type: 'LOG',
      payload: { message, logType }
    });
  } catch (error) {
    console.error('Failed to send log:', error);
  }
}

/**
 * 获取扩展状态
 * @returns {Promise<Object>}
 */
async function getState() {
  const response = await sendMessage({ type: 'GET_STATE' });
  return response?.data || {};
}

/**
 * 获取扩展配置
 * @returns {Promise<Object>}
 */
async function getConfig() {
  const response = await sendMessage({ type: 'GET_CONFIG' });
  return response?.data || CONFIG;
}

/**
 * 更新扩展状态
 * @param {Object} updates - 状态更新
 */
async function updateState(updates) {
  await sendMessage({
    type: 'STATE_UPDATE',
    payload: updates
  });
}

/**
 * 导航到指定 URL
 * @param {string} url - 目标 URL
 */
async function navigateTo(url) {
  await sendMessage({
    type: 'NAVIGATE',
    payload: { url }
  });
}

/**
 * 标记商品为已处理
 * @param {string} productId - 商品 ID
 */
async function markProductProcessed(productId) {
  await sendMessage({
    type: 'ADD_PROCESSED',
    payload: { productId }
  });
}

/**
 * 检查商品是否已处理
 * @param {string} productId - 商品 ID
 * @returns {Promise<boolean>}
 */
async function isProductProcessed(productId) {
  const response = await sendMessage({
    type: 'IS_PROCESSED',
    payload: { productId }
  });
  return response?.data || false;
}

// ============================================
// 4.1 基础框架 - UI 注入
// ============================================

// 预设搜索关键词列表
const PRESET_KEYWORDS = [
  '女裝',
  '美式女裝',
  '男裝',
  '好看男裝',
  '男褲',
  '女褲',
  '美式女褲',
  '首飾'
];

/**
 * 从预设关键词中随机选择一个
 * @returns {string}
 */
function getRandomKeyword() {
  const randomIndex = Math.floor(Math.random() * PRESET_KEYWORDS.length);
  return PRESET_KEYWORDS[randomIndex];
}

/**
 * 注入悬浮 UI 到页面
 */
function injectFloatingUI() {
  // 检查是否已注入
  if (document.getElementById('shopee-auto-cart-panel')) {
    return;
  }
  
  // 创建 UI 容器
  const container = document.createElement('div');
  container.id = 'shopee-auto-cart-container';
  
  // 注入 UI HTML
  container.innerHTML = `
    <!-- 悬浮面板容器 -->
    <div id="shopee-auto-cart-panel" class="floating-panel">
      <!-- 标题栏 - 可拖拽区域 -->
      <div class="panel-header" id="panel-header">
        <span class="panel-title">🛒 Shopee Auto Cart</span>
        <div class="header-buttons">
          <button id="minimize-btn" class="icon-btn" title="最小化">−</button>
          <button id="expand-btn" class="icon-btn hidden" title="展开">+</button>
        </div>
      </div>

      <!-- 面板内容区域 -->
      <div class="panel-content" id="panel-content">
        <!-- 当前关键词显示 -->
        <div class="keyword-display">
          <span class="keyword-label">搜索关键词:</span>
          <span id="current-keyword" class="keyword-value">随机选择</span>
        </div>

        <!-- 控制按钮区域 -->
        <div class="button-group">
          <button id="start-btn" class="btn btn-primary">▶ 开始</button>
          <button id="stop-btn" class="btn btn-danger" disabled>■ 停止</button>
        </div>

        <!-- 状态显示 -->
        <div class="status-bar">
          <span class="status-label">状态:</span>
          <span id="status-text" class="status-text status-idle">空闲</span>
        </div>

        <!-- 日志显示区域 -->
        <div class="log-section">
          <div class="log-header">
            <span>任务日志</span>
            <div class="log-buttons">
              <button id="export-log-btn" class="btn-small">导出</button>
              <button id="clear-log-btn" class="btn-small">清除</button>
            </div>
          </div>
          <div id="log-area" class="log-area">
            <!-- 日志条目将动态添加到这里 -->
          </div>
        </div>

        <!-- 关于按钮 -->
        <div class="about-section">
          <button id="about-btn" class="btn-about">ℹ️ 关于</button>
        </div>
      </div>
    </div>

    <!-- 最小化状态的图标 -->
    <div id="minimized-icon" class="minimized-icon hidden">
      <span>🛒</span>
    </div>

    <!-- 关于对话框 -->
    <div id="about-modal" class="about-modal hidden">
      <div class="about-modal-content">
        <div class="about-modal-header">
          <span class="about-modal-title">🛒 关于 Shopee Auto Cart</span>
          <button id="about-close-btn" class="about-close-btn">×</button>
        </div>
        <div class="about-modal-body">
          <p class="about-warning">⚠️ 免责声明</p>
          <p>本扩展仅供学习交流使用，请勿用于非法用途。</p>
          <p>这只是一个辅助工具，使用者需自行承担使用风险。</p>
          <hr class="about-divider">
          <p class="about-author">👨‍💻 作者：橙子</p>
          <p class="about-version">📦 版本：1.0.0</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // 初始化 UI 逻辑
  initUILogic();
}


/**
 * 初始化 UI 逻辑 (注入后)
 */
function initUILogic() {
  const elements = {
    panel: document.getElementById('shopee-auto-cart-panel'),
    header: document.getElementById('panel-header'),
    minimizeBtn: document.getElementById('minimize-btn'),
    expandBtn: document.getElementById('expand-btn'),
    minimizedIcon: document.getElementById('minimized-icon'),
    currentKeyword: document.getElementById('current-keyword'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    statusText: document.getElementById('status-text'),
    logArea: document.getElementById('log-area'),
    clearLogBtn: document.getElementById('clear-log-btn'),
    exportLogBtn: document.getElementById('export-log-btn'),
    aboutBtn: document.getElementById('about-btn'),
    aboutModal: document.getElementById('about-modal'),
    aboutCloseBtn: document.getElementById('about-close-btn')
  };
  
  // 日志存储数组 (用于持久化和导出)
  let logStorage = [];
  
  // 拖拽状态
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  // 拖拽事件
  elements.header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('icon-btn')) return;
    isDragging = true;
    elements.panel.classList.add('dragging');
    const rect = elements.panel.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - elements.panel.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - elements.panel.offsetHeight));
    elements.panel.style.left = x + 'px';
    elements.panel.style.top = y + 'px';
    elements.panel.style.right = 'auto';
    elements.minimizedIcon.style.left = x + 'px';
    elements.minimizedIcon.style.top = y + 'px';
    elements.minimizedIcon.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      elements.panel.classList.remove('dragging');
      // 保存位置
      chrome.storage.local.set({
        shopee_auto_cart_ui_position: {
          x: parseInt(elements.panel.style.left),
          y: parseInt(elements.panel.style.top)
        }
      });
    }
  });
  
  // 最小化/展开
  elements.minimizeBtn.addEventListener('click', () => {
    elements.panel.classList.add('hidden');
    elements.minimizedIcon.classList.remove('hidden');
  });
  
  elements.expandBtn.addEventListener('click', expandPanel);
  elements.minimizedIcon.addEventListener('click', expandPanel);
  
  function expandPanel() {
    elements.panel.classList.remove('hidden');
    elements.minimizedIcon.classList.add('hidden');
  }
  
  // 开始按钮 - 随机选择关键词
  elements.startBtn.addEventListener('click', async () => {
    // 随机选择一个预设关键词
    const keyword = getRandomKeyword();
    
    // 显示选中的关键词
    elements.currentKeyword.textContent = keyword;
    
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    setStatusText('running');
    
    await sendMessage({ type: 'START', payload: { keyword } });
    addLogEntry(`开始搜索: "${keyword}"`, 'info');
    
    // 导航到搜索页面
    const searchUrl = buildSearchUrl(keyword);
    window.location.href = searchUrl;
  });
  
  // 停止按钮
  elements.stopBtn.addEventListener('click', async () => {
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    setStatusText('idle');
    elements.currentKeyword.textContent = '随机选择';
    
    await sendMessage({ type: 'STOP', payload: {} });
    addLogEntry('已停止任务', 'warning');
  });
  
  // 清除日志
  elements.clearLogBtn.addEventListener('click', () => {
    elements.logArea.innerHTML = '';
    logStorage = [];
    saveLogsToStorage();
    addLogEntry('日志已清除', 'info');
  });
  
  // 导出日志
  elements.exportLogBtn.addEventListener('click', () => {
    exportLogs();
  });
  
  // 关于按钮 - 显示关于对话框
  elements.aboutBtn.addEventListener('click', () => {
    elements.aboutModal.classList.remove('hidden');
  });
  
  // 关闭关于对话框
  elements.aboutCloseBtn.addEventListener('click', () => {
    elements.aboutModal.classList.add('hidden');
  });
  
  // 点击对话框外部关闭
  elements.aboutModal.addEventListener('click', (e) => {
    if (e.target === elements.aboutModal) {
      elements.aboutModal.classList.add('hidden');
    }
  });
  
  // 导出日志函数
  function exportLogs() {
    if (logStorage.length === 0) {
      addLogEntry('没有日志可导出', 'warning');
      return;
    }
    
    const logText = logStorage.map(entry => 
      `[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopee-auto-cart-log-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLogEntry(`已导出 ${logStorage.length} 条日志`, 'success');
  }
  
  // 保存日志到 storage
  function saveLogsToStorage() {
    try {
      chrome.storage.local.set({ shopee_auto_cart_logs: logStorage });
    } catch (e) {
      console.error('保存日志失败:', e);
    }
  }
  
  // 从 storage 加载日志
  function loadLogsFromStorage() {
    try {
      chrome.storage.local.get(['shopee_auto_cart_logs'], (result) => {
        if (result.shopee_auto_cart_logs && Array.isArray(result.shopee_auto_cart_logs)) {
          logStorage = result.shopee_auto_cart_logs;
          // 恢复日志到 UI (只显示最近100条)
          const displayLogs = logStorage.slice(-100);
          displayLogs.forEach(entry => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${entry.type}`;
            logEntry.innerHTML = `<span class="timestamp">[${entry.timestamp}]</span>${escapeHtml(entry.message)}`;
            elements.logArea.appendChild(logEntry);
          });
          elements.logArea.scrollTop = elements.logArea.scrollHeight;
        }
      });
    } catch (e) {
      console.error('加载日志失败:', e);
    }
  }
  
  // 状态文本更新
  function setStatusText(status) {
    const statusMap = {
      idle: { text: '空闲', class: 'status-idle' },
      running: { text: '运行中', class: 'status-running' },
      paused: { text: '已暂停', class: 'status-paused' },
      error: { text: '错误', class: 'status-error' }
    };
    const info = statusMap[status] || statusMap.idle;
    elements.statusText.textContent = info.text;
    elements.statusText.className = 'status-text ' + info.class;
  }
  
  // 添加日志条目
  function addLogEntry(message, type = 'info') {
    const timestamp = new Date();
    const timeStr = `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')}`;
    const fullTimeStr = `${timestamp.getFullYear()}-${String(timestamp.getMonth()+1).padStart(2,'0')}-${String(timestamp.getDate()).padStart(2,'0')} ${timeStr}`;
    
    // 添加到存储数组
    logStorage.push({
      timestamp: fullTimeStr,
      type: type,
      message: message
    });
    
    // 限制存储日志数量为200条
    while (logStorage.length > CONFIG.MAX_LOG_ENTRIES) {
      logStorage.shift();
    }
    
    // 保存到 storage
    saveLogsToStorage();
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="timestamp">[${timeStr}]</span>${escapeHtml(message)}`;
    elements.logArea.appendChild(entry);
    
    // 限制 UI 显示日志数量为100条
    while (elements.logArea.children.length > 100) {
      elements.logArea.firstChild.remove();
    }
    
    // 自动滚动
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 恢复保存的位置
  chrome.storage.local.get(['shopee_auto_cart_ui_position'], (result) => {
    if (result.shopee_auto_cart_ui_position) {
      const pos = result.shopee_auto_cart_ui_position;
      elements.panel.style.left = pos.x + 'px';
      elements.panel.style.top = pos.y + 'px';
      elements.panel.style.right = 'auto';
      elements.minimizedIcon.style.left = pos.x + 'px';
      elements.minimizedIcon.style.top = pos.y + 'px';
    }
  });
  
  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOG') {
      addLogEntry(message.payload.message, message.payload.logType || 'info');
    } else if (message.type === 'STATE_UPDATE') {
      const state = message.payload;
      if (state.isRunning) {
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        if (state.keyword) {
          elements.currentKeyword.textContent = state.keyword;
        }
        setStatusText('running');
      } else {
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
        elements.currentKeyword.textContent = '随机选择';
        setStatusText('idle');
      }
    }
    sendResponse({ received: true });
  });
  
  // 从 storage 加载历史日志
  loadLogsFromStorage();
  
  // 初始日志
  addLogEntry('扩展已加载，准备就绪', 'info');
  
  // 存储 addLogEntry 供全局使用
  window.shopeeAutoCartAddLog = addLogEntry;
  window.shopeeAutoCartSetStatus = setStatusText;
  window.shopeeAutoCartExportLogs = exportLogs;
  
  // 从 background 同步运行状态 (修复页面刷新后 UI 状态不同步的问题)
  syncUIState();
  
  async function syncUIState() {
    try {
      const response = await sendMessage({ type: 'GET_STATE' });
      const state = response?.data || {};
      console.log('[Shopee Auto Cart] 同步 UI 状态:', state);
      
      if (state.isRunning) {
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        if (state.keyword) {
          elements.currentKeyword.textContent = state.keyword;
        }
        setStatusText('running');
        addLogEntry('检测到任务正在运行中...', 'info');
      }
    } catch (error) {
      console.error('[Shopee Auto Cart] 同步状态失败:', error);
    }
  }
}

/**
 * 构建搜索 URL
 * @param {string} keyword - 搜索关键词
 * @returns {string}
 */
function buildSearchUrl(keyword) {
  const baseUrl = window.location.origin;
  return `${baseUrl}/search?keyword=${encodeURIComponent(keyword)}`;
}

// ============================================
// 工具函数
// ============================================

/**
 * 延迟执行
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待元素出现 (带重试机制)
 * Requirements: 7.1 - 元素未找到时重试3次，间隔2秒
 * @param {string} selector - CSS 选择器
 * @param {Object} options - 配置选项
 * @param {number} options.timeout - 单次等待超时时间 (ms)，默认 5000
 * @param {number} options.retries - 重试次数，默认 3
 * @param {number} options.retryDelay - 重试间隔 (ms)，默认 2000
 * @param {boolean} options.silent - 是否静默模式（不输出日志），默认 false
 * @returns {Promise<Element>}
 */
async function waitForElement(selector, options = {}) {
  const {
    timeout = 5000,
    retries = CONFIG.RETRY_ATTEMPTS,
    retryDelay = CONFIG.RETRY_DELAY,
    silent = false
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await sleep(100);
    }
    
    lastError = new Error(`Element not found: ${selector}`);
    
    if (attempt < retries) {
      if (!silent) {
        await log(`元素未找到 "${selector}"，${retryDelay/1000}秒后重试 (${attempt}/${retries})`, 'warning');
      }
      await sleep(retryDelay);
    }
  }
  
  if (!silent) {
    await log(`元素查找失败: ${selector} (已重试${retries}次)`, 'error');
  }
  throw lastError;
}

/**
 * 等待多个元素出现 (带重试机制)
 * Requirements: 7.1 - 元素未找到时重试3次，间隔2秒
 * @param {string} selector - CSS 选择器
 * @param {Object} options - 配置选项
 * @param {number} options.timeout - 单次等待超时时间 (ms)，默认 5000
 * @param {number} options.retries - 重试次数，默认 3
 * @param {number} options.retryDelay - 重试间隔 (ms)，默认 2000
 * @param {boolean} options.silent - 是否静默模式（不输出日志），默认 false
 * @returns {Promise<NodeList>}
 */
async function waitForElements(selector, options = {}) {
  const {
    timeout = 5000,
    retries = CONFIG.RETRY_ATTEMPTS,
    retryDelay = CONFIG.RETRY_DELAY,
    silent = false
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return elements;
      }
      await sleep(100);
    }
    
    lastError = new Error(`Elements not found: ${selector}`);
    
    if (attempt < retries) {
      if (!silent) {
        await log(`元素列表未找到 "${selector}"，${retryDelay/1000}秒后重试 (${attempt}/${retries})`, 'warning');
      }
      await sleep(retryDelay);
    }
  }
  
  if (!silent) {
    await log(`元素列表查找失败: ${selector} (已重试${retries}次)`, 'error');
  }
  throw lastError;
}

/**
 * 带重试的操作执行
 * Requirements: 7.1 - 操作失败时重试3次，间隔2秒
 * @param {Function} operation - 要执行的操作
 * @param {Object} options - 配置选项
 * @param {number} options.retries - 重试次数，默认 3
 * @param {number} options.delay - 重试延迟 (ms)，默认 2000
 * @param {string} options.operationName - 操作名称（用于日志）
 * @param {boolean} options.silent - 是否静默模式（不输出日志），默认 false
 * @returns {Promise<*>}
 */
async function withRetry(operation, options = {}) {
  // 支持旧的调用方式 withRetry(fn, retries, delay)
  if (typeof options === 'number') {
    options = { retries: options, delay: arguments[2] || CONFIG.RETRY_DELAY };
  }
  
  const {
    retries = CONFIG.RETRY_ATTEMPTS,
    delay = CONFIG.RETRY_DELAY,
    operationName = '操作',
    silent = false
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        if (!silent) {
          await log(`${operationName}失败: ${error.message}，${delay/1000}秒后重试 (${attempt}/${retries})`, 'warning');
        }
        await sleep(delay);
      }
    }
  }
  
  if (!silent) {
    await log(`${operationName}最终失败: ${lastError.message} (已重试${retries}次)`, 'error');
  }
  throw lastError;
}

/**
 * 带超时的操作执行
 * Requirements: 7.4 - 导航超时处理
 * @param {Function} operation - 要执行的操作
 * @param {number} timeout - 超时时间 (ms)
 * @param {string} operationName - 操作名称（用于日志）
 * @returns {Promise<*>}
 */
async function withTimeout(operation, timeout = 30000, operationName = '操作') {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName}超时 (${timeout/1000}秒)`));
    }, timeout);
    
    try {
      const result = await operation();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * 从 URL 提取商品 ID
 * @param {string} url - 商品 URL
 * @returns {string|null}
 */
function extractProductId(url) {
  // 格式1: /product/shopId/productId
  const match1 = url.match(/\/product\/(\d+)\/(\d+)/);
  if (match1) {
    return `${match1[1]}_${match1[2]}`;
  }
  
  // 格式2: /-i.shopId.productId
  const match2 = url.match(/-i\.(\d+)\.(\d+)/);
  if (match2) {
    return `${match2[1]}_${match2[2]}`;
  }
  
  return null;
}

/**
 * 从 URL 提取店铺 ID
 * @param {string} url - URL
 * @returns {string|null}
 */
function extractShopId(url) {
  const match = url.match(/\/shop\/(\d+)/);
  return match ? match[1] : null;
}


// ============================================
// 4.2 搜索页面操作
// Requirements: 1.2, 1.3, 4.1, 4.2
// ============================================

/**
 * Shopee 搜索页面选择器
 */
const SearchSelectors = {
  // 商品列表容器
  PRODUCT_LIST: '.shopee-search-item-result__items, [class*="search-item-result"]',
  // 单个商品卡片
  PRODUCT_CARD: '.shopee-search-item-result__item, [class*="search-item-result__item"], [data-sqe="item"]',
  // 商品链接
  PRODUCT_LINK: 'a[href*="/product/"], a[href*="-i."]',
  // 加载更多
  LOAD_MORE: '.shopee-search-item-result__loading, [class*="loading"]'
};

/**
 * 获取搜索结果中的商品列表
 * @returns {Promise<Element[]>}
 */
async function getProductList() {
  try {
    // 等待商品列表加载
    await waitForElement(SearchSelectors.PRODUCT_LIST, 15000);
    await sleep(1000); // 等待商品完全渲染
    
    const products = document.querySelectorAll(SearchSelectors.PRODUCT_CARD);
    await log(`找到 ${products.length} 个商品`, 'info');
    
    // 将 NodeList 转换为数组，并按 DOM 位置排序（从上到下，从左到右）
    const productArray = Array.from(products);
    
    // 先滚动到页面顶部，确保从第一个商品开始
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(300);
    
    // 按元素在页面中的绝对位置排序（先按 Y 坐标，再按 X 坐标）
    // 使用 offsetTop 获取相对于文档的位置，而不是视口位置
    productArray.sort((a, b) => {
      // 获取元素相对于文档的绝对位置
      const getAbsolutePosition = (el) => {
        let top = 0;
        let left = 0;
        let current = el;
        while (current) {
          top += current.offsetTop || 0;
          left += current.offsetLeft || 0;
          current = current.offsetParent;
        }
        return { top, left };
      };
      
      const posA = getAbsolutePosition(a);
      const posB = getAbsolutePosition(b);
      
      // 先按行排序（Y 坐标差距大于 50px 认为是不同行）
      if (Math.abs(posA.top - posB.top) > 50) {
        return posA.top - posB.top;
      }
      // 同一行按列排序
      return posA.left - posB.left;
    });
    
    // 输出调试信息
    if (productArray.length > 0) {
      const firstProduct = getProductInfo(productArray[0]);
      if (firstProduct) {
        await log(`第一个商品: ${firstProduct.name.substring(0, 30)}...`, 'info');
      }
    }
    
    return productArray;
  } catch (error) {
    await log(`获取商品列表失败: ${error.message}`, 'error');
    return [];
  }
}

/**
 * 从商品卡片获取商品信息
 * @param {Element} productCard - 商品卡片元素
 * @returns {Object|null}
 */
function getProductInfo(productCard) {
  const link = productCard.querySelector(SearchSelectors.PRODUCT_LINK);
  if (!link) return null;
  
  const href = link.getAttribute('href');
  const productId = extractProductId(href);
  
  if (!productId) return null;
  
  // 尝试获取商品名称
  const nameEl = productCard.querySelector('[class*="name"], [class*="title"], .shopee-search-item-result__item-name');
  const name = nameEl ? nameEl.textContent.trim() : '未知商品';
  
  return {
    id: productId,
    name: name,
    url: link.href,
    element: productCard
  };
}

/**
 * 获取下一个未处理的商品
 * @param {Element[]} products - 商品列表
 * @returns {Promise<Object|null>}
 */
async function getNextUnprocessedProduct(products) {
  for (const product of products) {
    const info = getProductInfo(product);
    if (!info) continue;
    
    const processed = await isProductProcessed(info.id);
    if (!processed) {
      return info;
    }
  }
  
  return null;
}

/**
 * 点击商品进入详情页
 * @param {Object} productInfo - 商品信息
 */
async function clickProduct(productInfo) {
  await log(`点击商品: ${productInfo.name}`, 'info');

  // 标记为已处理
  await markProductProcessed(productInfo.id);

  // 滚动到商品位置
  productInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);

  // 点击商品链接
  const link = productInfo.element.querySelector(SearchSelectors.PRODUCT_LINK);
  if (link) {
    link.click();
  } else {
    // 直接导航
    window.location.href = productInfo.url;
  }
}

/**
 * 滚动加载更多商品
 * @returns {Promise<boolean>} 是否成功加载更多
 */
async function scrollToLoadMore() {
  const beforeCount = document.querySelectorAll(SearchSelectors.PRODUCT_CARD).length;
  
  // 滚动到页面底部
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  });
  
  await sleep(2000);
  
  const afterCount = document.querySelectorAll(SearchSelectors.PRODUCT_CARD).length;
  
  if (afterCount > beforeCount) {
    await log(`加载了 ${afterCount - beforeCount} 个新商品`, 'info');
    return true;
  }
  
  return false;
}

/**
 * 处理搜索页面
 * 如果商品数量<=1，等待15秒后刷新页面继续（不停止扩展）
 */
async function handleSearchPage() {
  const state = await getState();
  
  if (!state.isRunning) {
    return;
  }
  
  await log('正在搜索页面，开始处理商品列表...', 'info');
  
  // 等待搜索页面加载 (10秒)
  await log(`等待页面加载 (${CONFIG.SEARCH_PAGE_DELAY / 1000}秒)...`, 'info');
  await sleep(CONFIG.SEARCH_PAGE_DELAY);
  
  // 获取商品列表
  let products = await getProductList();
  
  // 如果商品数量<=1，说明页面可能没加载完，等待15秒后刷新页面继续
  if (products.length <= 1) {
    await log(`只找到 ${products.length} 个商品，页面可能未加载完，等待15秒后刷新...`, 'warning');
    await sleep(15000);
    
    // 刷新页面继续，刷新后会自动重新执行 handleSearchPage
    await log('刷新页面...', 'info');
    window.location.reload();
    return;
  }
  
  // 随机选择商品（0-60范围内，但不超过实际商品数量）
  const maxRandomIndex = Math.min(60, products.length);
  const randomIndex = Math.floor(Math.random() * maxRandomIndex);
  
  await log(`共 ${products.length} 个商品，随机选择第 ${randomIndex + 1} 个`, 'info');
  
  // 从随机位置开始查找未处理的商品
  let selectedProduct = null;
  
  // 先从随机位置向后查找
  for (let i = randomIndex; i < products.length; i++) {
    const info = getProductInfo(products[i]);
    if (!info) continue;
    
    const processed = await isProductProcessed(info.id);
    if (!processed) {
      selectedProduct = info;
      await log(`选择第 ${i + 1} 个商品: ${info.name.substring(0, 30)}...`, 'info');
      break;
    }
  }
  
  // 如果后面没找到，从随机位置向前查找
  if (!selectedProduct) {
    for (let i = randomIndex - 1; i >= 0; i--) {
      const info = getProductInfo(products[i]);
      if (!info) continue;
      
      const processed = await isProductProcessed(info.id);
      if (!processed) {
        selectedProduct = info;
        await log(`选择第 ${i + 1} 个商品: ${info.name.substring(0, 30)}...`, 'info');
        break;
      }
    }
  }
  
  if (selectedProduct) {
    await clickProduct(selectedProduct);
  } else {
    // 尝试加载更多
    const loaded = await scrollToLoadMore();
    
    if (loaded) {
      // 重新获取商品列表
      const newProducts = await getProductList();
      const newMaxIndex = Math.min(60, newProducts.length);
      const newRandomIndex = Math.floor(Math.random() * newMaxIndex);
      
      // 从新的随机位置查找
      for (let i = newRandomIndex; i < newProducts.length; i++) {
        const info = getProductInfo(newProducts[i]);
        if (!info) continue;
        
        const processed = await isProductProcessed(info.id);
        if (!processed) {
          selectedProduct = info;
          await log(`选择第 ${i + 1} 个商品: ${info.name.substring(0, 30)}...`, 'info');
          break;
        }
      }
      
      if (selectedProduct) {
        await clickProduct(selectedProduct);
      } else {
        await log('所有可见商品已处理完成', 'success');
        await sendMessage({ type: 'STOP', payload: {} });
      }
    } else {
      await log('所有商品已处理完成', 'success');
      await sendMessage({ type: 'STOP', payload: {} });
    }
  }
}


// ============================================
// 4.3 商品详情页操作
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
// ============================================

/**
 * 商品详情页选择器 - 适配 Shopee 多种页面结构
 */
const ProductSelectors = {
  // 规格选择器 - Shopee 使用 flex 容器包含规格按钮
  VARIANT_CONTAINER: '.product-variation, [class*="variation"], [class*="tier-variation"], [class*="flex"][class*="items-center"]',
  VARIANT_OPTION: '.product-variation button, [class*="variation"] button, [class*="tier-variation"] button, button[class*="product-variation"], [class*="flex"] button[aria-label]',
  VARIANT_OPTION_ACTIVE: '.product-variation button.active, [class*="variation"] button[class*="active"], button[class*="product-variation"][class*="active"]',
  // 添加购物车按钮 - 多种可能的选择器
  ADD_TO_CART_BTN: 'button[class*="add-to-cart"], button[class*="btn-solid-primary"], [class*="add-to-cart"] button',
  // 店铺链接
  SHOP_LINK: 'a[href*="/shop/"], [class*="shop"] a[href*="/shop/"], [class*="seller"] a',
  // 商品名称 - Shopee 商品标题通常在 h1 或特定 class 中
  PRODUCT_NAME: 'h1, [class*="product-name"], [class*="title"], [class*="attM6y"], span[class*="VCxVFf"]',
  // 数量输入
  QUANTITY_INPUT: 'input[type="number"], [class*="quantity"] input, input[class*="qty"]',
  // 购物车成功提示
  CART_SUCCESS: '[class*="toast"], [class*="success"], [class*="notification"], [class*="shopee-modal"]'
};

/**
 * 检测商品是否有多规格
 * @returns {Promise<boolean>}
 */
async function hasVariants() {
  try {
    const variants = findVariantButtons();
    console.log('[Shopee Auto Cart] 检测到规格数量:', variants.length);
    return variants.length > 0;
  } catch (error) {
    console.error('[Shopee Auto Cart] 检测规格失败:', error);
    return false;
  }
}

/**
 * 查找规格容器 - Shopee 商品通常有多层规格（如颜色、尺码）
 * @returns {Element[]} 规格容器列表
 */
function findVariantContainers() {
  const containers = [];
  
  // 查找所有规格容器
  const selectors = [
    '[class*="product-variation"]',
    '[class*="tier-variation"]',
    '[class*="variation"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      // 确保容器内有按钮
      const buttons = el.querySelectorAll('button');
      if (buttons.length > 0 && !containers.includes(el)) {
        // 避免添加嵌套的容器
        let isNested = false;
        for (const existing of containers) {
          if (existing.contains(el) || el.contains(existing)) {
            isNested = true;
            break;
          }
        }
        if (!isNested) {
          containers.push(el);
        }
      }
    });
  }
  
  console.log('[Shopee Auto Cart] 找到规格容器数量:', containers.length);
  return containers;
}

/**
 * 从容器中获取可用的规格按钮
 * @param {Element} container - 规格容器
 * @returns {Element[]} 可用的规格按钮
 */
function getButtonsFromContainer(container) {
  const buttons = container.querySelectorAll('button');
  return Array.from(buttons).filter(btn => {
    const isDisabled = btn.disabled || 
                       btn.classList.contains('disabled') || 
                       btn.classList.contains('shopee-button-disabled') ||
                       btn.getAttribute('aria-disabled') === 'true' ||
                       btn.style.opacity === '0.5';
    return !isDisabled;
  });
}

/**
 * 查找规格按钮 - 适配 Shopee 多种页面结构
 * @returns {Element[]}
 */
function findVariantButtons() {
  const allButtons = [];
  
  // 方法1: 查找包含 "variation" 的容器中的按钮
  const variationContainers = document.querySelectorAll('[class*="variation"], [class*="tier-variation"], [class*="product-variation"]');
  variationContainers.forEach(container => {
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      if (!allButtons.includes(btn)) {
        allButtons.push(btn);
      }
    });
  });
  
  // 方法2: 查找带有 aria-label 的规格按钮
  const ariaButtons = document.querySelectorAll('button[aria-label]');
  ariaButtons.forEach(btn => {
    const parent = btn.closest('[class*="flex"]');
    if (parent && !allButtons.includes(btn)) {
      // 检查是否是规格按钮（通常在商品详情区域）
      const isInProductArea = btn.closest('[class*="product"]') || btn.closest('[class*="item"]');
      if (isInProductArea) {
        allButtons.push(btn);
      }
    }
  });
  
  // 方法3: 查找特定样式的规格按钮
  const styledButtons = document.querySelectorAll('button[class*="product-variation"], button[class*="tier"]');
  styledButtons.forEach(btn => {
    if (!allButtons.includes(btn)) {
      allButtons.push(btn);
    }
  });
  
  console.log('[Shopee Auto Cart] 找到规格按钮数量:', allButtons.length);
  return allButtons;
}

/**
 * 获取所有规格选项
 * @returns {Element[]}
 */
function getVariantOptions() {
  const options = findVariantButtons();
  // 过滤掉禁用的选项
  const filtered = options.filter(opt => {
    const isDisabled = opt.disabled || 
                       opt.classList.contains('disabled') || 
                       opt.classList.contains('shopee-button-disabled') ||
                       opt.getAttribute('aria-disabled') === 'true';
    return !isDisabled;
  });
  console.log('[Shopee Auto Cart] 可用规格选项数量:', filtered.length);
  return filtered;
}

/**
 * 选择规格
 * @param {Element} variantButton - 规格按钮
 */
async function selectVariant(variantButton) {
  variantButton.click();
  await sleep(CONFIG.VARIANT_SELECT_DELAY);
}

/**
 * 查找添加购物车按钮
 * @returns {Element|null}
 */
function findAddToCartButton() {
  console.log('[Shopee Auto Cart] 开始查找添加购物车按钮...');
  
  // 通过文本内容查找 - 这是最可靠的方法
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const text = btn.textContent || '';
    // 检查各种语言的"加入购物车"文本
    if (text.includes('加入購物車') || 
        text.includes('加入购物车') || 
        text.includes('Add to Cart') ||
        text.includes('ADD TO CART') ||
        text.includes('加入购物车')) {
      console.log('[Shopee Auto Cart] 找到添加购物车按钮 (通过文本):', text);
      return btn;
    }
  }
  
  // 尝试通过 class 选择器查找
  const selectors = [
    'button[class*="add-to-cart"]',
    'button[class*="btn-solid-primary"]',
    '[class*="product-briefing"] button',
    '[class*="flex"] button[class*="bg-primary"]',
    'button[class*="shopee-button-solid"]'
  ];
  
  for (const selector of selectors) {
    try {
      const buttons = document.querySelectorAll(selector);
      for (const btn of buttons) {
        const text = btn.textContent || '';
        // 排除"立即购买"按钮
        if (!text.includes('立即') && !text.includes('Buy Now') && !text.includes('buy now')) {
          // 检查是否包含购物车相关文本
          if (text.includes('購物車') || text.includes('购物车') || text.toLowerCase().includes('cart')) {
            console.log('[Shopee Auto Cart] 找到添加购物车按钮 (通过选择器):', selector, text);
            return btn;
          }
        }
      }
    } catch (e) {
      // 继续尝试下一个选择器
    }
  }
  
  console.log('[Shopee Auto Cart] 未找到添加购物车按钮');
  return null;
}

/**
 * 检测页面是否显示"请先选择商品规格"错误提示
 * @returns {boolean}
 */
function hasVariantSelectionError() {
  const errorTexts = ['請先選擇商品規格', '请先选择商品规格', 'Please select product variation', '請選擇商品規格'];
  
  // 检查页面文本
  const pageText = document.body.innerText;
  for (const errorText of errorTexts) {
    if (pageText.includes(errorText)) {
      console.log('[Shopee Auto Cart] 检测到规格选择错误提示:', errorText);
      return true;
    }
  }
  
  // 检查红色错误提示元素 (Shopee 通常用红色显示错误)
  const errorSelectors = [
    '[class*="error"]',
    '[class*="warning"]', 
    '[style*="color: red"]',
    '[style*="color:red"]',
    '[style*="color: rgb(255"]',
    '.shopee-toast',
    '[class*="toast"]'
  ];
  
  for (const selector of errorSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        for (const errorText of errorTexts) {
          if (text.includes(errorText)) {
            console.log('[Shopee Auto Cart] 检测到规格选择错误元素:', text);
            return true;
          }
        }
      }
    } catch (e) {
      // 继续检查
    }
  }
  
  return false;
}

/**
 * 检测规格层信息 - 获取每一层规格的名称和按钮
 * Shopee 台湾站的规格区域通常结构为:
 * - 一个包含规格名称的 label/div (如 "顏色", "尺寸")
 * - 一组规格按钮
 * @returns {Promise<Array<{name: string, container: Element, buttons: Element[]}>>}
 */
async function detectVariantLayers() {
  const layers = [];
  const processedButtons = new Set();
  
  await log('[调试] 开始检测规格层...', 'info');
  
  // 检测真正的商品规格关键词 - 支持各种商品类型
  const validVariantLabels = [
    // 颜色相关
    '顏色', '颜色', 'Color', '顏色分類', '颜色分类', '色系', '配色',
    // 尺寸相关
    '尺寸', '尺碼', 'Size', '尺寸分類', '尺码分类', '大小', '號碼', '号码',
    // 款式相关
    '款式', '樣式', '样式', 'Style', '款', '類型', '类型', 'Type',
    // 电子产品相关
    '容量', '版本', 'Version', '型號', '型号', 'Model', '規格', '规格', 'Spec',
    '內存', '内存', 'RAM', '存儲', '存储', 'Storage', '配置', '處理器', '处理器',
    // 食品相关
    '口味', '味道', 'Flavor', '份量', '重量', 'Weight', '包裝', '包装',
    // 套餐组合
    '套餐', '組合', '组合', 'Bundle', 'Set', '方案', '選項', '选项', 'Option',
    // 其他常见规格
    '材質', '材质', '長度', '长度', '寬度', '宽度', '厚度', '電壓', '电压',
    '功率', '瓦數', '瓦数', '插頭', '插头', '接口', '尺吋', '吋'
  ];
  
  // 需要排除的标签 - 这些不是可选择的商品规格
  const excludeLabels = [
    '數量', '数量', 'Quantity', '庫存', '库存', 'Stock', '尚有庫存',
    '評價', '评价', 'Rating', '評分', '评分',
    '付款', '物流', '運費', '运费', '配送',
    '商品數量', '商品数量', '購買數量', '购买数量'
  ];
  
  // 统计页面按钮
  const allPageButtons = document.querySelectorAll('button');
  await log(`[调试] 页面共有 ${allPageButtons.length} 个按钮`, 'info');
  
  // ========== 方法1: 查找 Shopee 的规格行容器 (最可靠) ==========
  // Shopee 的规格通常在 class 包含 "flex" 的行容器中，每行一个规格类型
  await log('[调试] 方法1: 查找规格行容器...', 'info');
  
  // 查找所有可能的规格行（通常是 flex 布局的 div）
  const allDivs = document.querySelectorAll('div');
  const variantRows = [];
  
  for (const div of allDivs) {
    // 检查这个 div 是否包含规格标签文本
    const children = div.children;
    if (children.length < 2) continue; // 规格行至少有标签和按钮区域
    
    // 获取第一个子元素的文本（通常是标签）
    const firstChild = children[0];
    const labelText = firstChild?.textContent?.trim() || '';
    
    if (labelText.length === 0 || labelText.length > 30) continue;
    
    // 检查是否包含规格关键词
    let matchedLabel = '';
    for (const validLabel of validVariantLabels) {
      if (labelText.includes(validLabel)) {
        matchedLabel = validLabel;
        break;
      }
    }
    
    if (!matchedLabel) continue;
    
    // 排除非规格项
    let isExcluded = false;
    for (const excludeLabel of excludeLabels) {
      if (labelText.includes(excludeLabel)) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) continue;
    
    // 检查这个 div 是否包含按钮
    const buttons = div.querySelectorAll('button');
    if (buttons.length === 0) continue;
    
    // 检查按钮是否是规格按钮（不是功能按钮）
    const variantButtons = findVariantButtonsInContainer(div, processedButtons);
    if (variantButtons.length === 0) continue;
    
    variantRows.push({
      container: div,
      label: matchedLabel,
      labelText: labelText,
      buttons: variantButtons,
      rect: div.getBoundingClientRect()
    });
  }
  
  // 按 Y 坐标排序（从上到下）
  variantRows.sort((a, b) => a.rect.top - b.rect.top);
  
  // 去重：如果多个行包含相同的按钮，只保留最小的容器
  const uniqueRows = [];
  for (const row of variantRows) {
    let isDuplicate = false;
    
    for (const existing of uniqueRows) {
      // 检查是否有按钮重叠
      const overlap = row.buttons.some(btn => existing.buttons.includes(btn));
      if (overlap) {
        // 如果当前行的按钮数量更少，说明是更精确的容器
        if (row.buttons.length < existing.buttons.length) {
          // 替换
          const idx = uniqueRows.indexOf(existing);
          uniqueRows[idx] = row;
        }
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      uniqueRows.push(row);
    }
  }
  
  await log(`[调试] 方法1找到 ${uniqueRows.length} 个规格行`, 'info');
  
  // 将找到的行添加到 layers
  for (const row of uniqueRows) {
    const btnTexts = row.buttons.slice(0, 5).map(b => b.textContent?.trim().substring(0, 15)).join(', ');
    await log(`[调试] 规格 "${row.label}": ${row.buttons.length} 个选项 [${btnTexts}]`, 'success');
    
    layers.push({
      name: row.label,
      container: row.container,
      buttons: row.buttons
    });
    row.buttons.forEach(b => processedButtons.add(b));
  }
  
  // ========== 方法2: 如果方法1没找到，尝试按标签文本查找 ==========
  if (layers.length === 0) {
    await log('[调试] 方法2: 按规格标签文本查找...', 'info');
    
    // 查找所有包含规格标签文本的元素
    const allElements = document.querySelectorAll('*');
    const labelElements = [];
    
    for (const el of allElements) {
      // 获取元素的直接文本内容（不包括子元素）
      let directText = '';
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          directText += node.textContent?.trim() || '';
        }
      }
      
      if (!directText) {
        if (el.children.length === 0 || (el.children.length <= 2 && el.textContent.length <= 20)) {
          directText = el.textContent?.trim() || '';
        }
      }
      
      if (!directText || directText.length > 25) continue;
      
      for (const validLabel of validVariantLabels) {
        if (directText.includes(validLabel)) {
          let isExcluded = false;
          for (const excludeLabel of excludeLabels) {
            if (directText.includes(excludeLabel)) {
              isExcluded = true;
              break;
            }
          }
          
          if (!isExcluded) {
            labelElements.push({
              element: el,
              text: directText,
              name: validLabel,
              rect: el.getBoundingClientRect()
            });
          }
          break;
        }
      }
    }
    
    // 去重
    const uniqueLabels = [];
    for (const label of labelElements) {
      let isDuplicate = false;
      for (let i = 0; i < uniqueLabels.length; i++) {
        const existing = uniqueLabels[i];
        if (existing.name === label.name) {
          const rectDiff = Math.abs(existing.rect.top - label.rect.top) + Math.abs(existing.rect.left - label.rect.left);
          if (rectDiff < 50) {
            if (label.text.length < existing.text.length) {
              uniqueLabels[i] = label;
            }
            isDuplicate = true;
            break;
          }
        }
      }
      if (!isDuplicate) {
        uniqueLabels.push(label);
      }
    }
    
    await log(`[调试] 方法2找到 ${uniqueLabels.length} 个规格标签: ${uniqueLabels.map(l => l.name).join(', ')}`, 'info');
    
    for (const labelInfo of uniqueLabels) {
      const { element, name } = labelInfo;
      let buttons = [];
      
      // 查找兄弟元素中的按钮
      let sibling = element.nextElementSibling;
      while (sibling && buttons.length === 0) {
        const siblingButtons = findVariantButtonsInContainer(sibling, processedButtons);
        if (siblingButtons.length > 0) {
          buttons = siblingButtons;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      
      // 查找父元素中的按钮
      if (buttons.length === 0) {
        const parent = element.parentElement;
        if (parent) {
          buttons = findVariantButtonsInContainer(parent, processedButtons);
          
          if (buttons.length > 0) {
            const labelRect = element.getBoundingClientRect();
            const filteredButtons = buttons.filter(btn => {
              const btnRect = btn.getBoundingClientRect();
              const yDiff = Math.abs(btnRect.top - labelRect.top);
              return yDiff < 100;
            });
            
            if (filteredButtons.length > 0) {
              buttons = filteredButtons;
            }
          }
        }
      }
      
      if (buttons.length > 0) {
        const btnTexts = buttons.slice(0, 5).map(b => b.textContent?.trim().substring(0, 15)).join(', ');
        await log(`[调试] 方法2找到规格 "${name}": ${buttons.length} 个选项 [${btnTexts}]`, 'success');
        
        layers.push({
          name: name,
          container: element.parentElement,
          buttons: buttons
        });
        buttons.forEach(b => processedButtons.add(b));
      }
    }
  }
  
  // ========== 方法3: 备用方法 - 查找 Shopee 特定的规格容器 ==========
  if (layers.length === 0) {
    await log('[调试] 方法3: 查找 Shopee 规格容器...', 'info');
    
    const variationContainers = document.querySelectorAll('[class*="product-variation"], [class*="tier-variation"]');
    
    for (const container of variationContainers) {
      const labelEl = container.querySelector('label, [class*="label"]');
      const labelText = labelEl?.textContent?.trim() || '';
      
      let variantName = '';
      for (const validLabel of validVariantLabels) {
        if (labelText.includes(validLabel)) {
          variantName = validLabel;
          break;
        }
      }
      
      if (!variantName) continue;
      
      const buttons = findVariantButtonsInContainer(container, processedButtons);
      if (buttons.length > 0) {
        const btnTexts = buttons.slice(0, 5).map(b => b.textContent?.trim().substring(0, 15)).join(', ');
        await log(`[调试] 方法3找到规格 "${variantName}": ${buttons.length} 个选项 [${btnTexts}]`, 'success');
        
        layers.push({
          name: variantName,
          container: container,
          buttons: buttons
        });
        buttons.forEach(b => processedButtons.add(b));
      }
    }
  }
  
  // 输出调试信息
  if (layers.length === 0) {
    await log('[调试] 未找到规格，可能是无规格商品', 'warning');
  }
  
  await log(`[调试] 规格检测完成，共找到 ${layers.length} 层规格`, layers.length > 0 ? 'success' : 'warning');
  return layers;
}

/**
 * 在容器中查找规格按钮
 * @param {Element} container - 容器元素
 * @param {Set} processedButtons - 已处理的按钮集合
 * @returns {Element[]} 按钮数组
 */
function findVariantButtonsInContainer(container, processedButtons) {
  const buttons = [];
  const allButtons = container.querySelectorAll('button');
  
  for (const btn of allButtons) {
    if (processedButtons.has(btn)) continue;
    if (btn.disabled) continue;
    
    const text = btn.textContent?.trim() || '';
    
    // 排除空文本或过长文本
    if (text.length === 0 || text.length > 50) continue;
    
    // 排除纯数字按钮 (通常是数量选择器 1,2,3,4,5...)
    if (/^\d+$/.test(text)) continue;
    
    // 排除评分按钮 (如 4.8, 4.9 等)
    if (/^\d+\.\d+$/.test(text)) continue;
    
    // 排除包含"評價"、"评价"的按钮
    if (/\d+評價/.test(text) || /\d+评价/.test(text)) continue;
    
    // 排除省略号按钮
    if (text === '...' || text === '…') continue;
    
    // 排除明显不是规格的按钮 - 包括各种功能按钮
    if (text.includes('購物車') || text.includes('购物车') || text.includes('Cart') ||
        text.includes('立即') || text.includes('Buy') || text.includes('關注') ||
        text.includes('分享') || text.includes('收藏') || text.includes('加入') ||
        text.includes('檢舉') || text.includes('检举') || text.includes('Report') ||
        text.includes('匿名') || text.includes('舉報') || text.includes('举报') ||
        text.includes('聊聊') || text.includes('客服') || text.includes('Chat') ||
        text.includes('優惠券') || text.includes('优惠券') || text.includes('Coupon') ||
        text.includes('領取') || text.includes('领取') || text.includes('Claim') ||
        text.includes('查看') || text.includes('更多') || text.includes('展開') ||
        text.includes('收起') || text.includes('喜歡') || text.includes('喜欢') ||
        text.includes('直接購買') || text.includes('直接购买') || text.includes('Buy Now') ||
        text.includes('庫存') || text.includes('库存') || text.includes('Stock') ||
        // 排除尺寸表、尺码表等参考信息按钮
        text.includes('尺寸表') || text.includes('尺碼表') || text.includes('Size Chart') ||
        text.includes('Size Guide') || text.includes('尺码表') || text.includes('測量') ||
        text.includes('测量') || text.includes('如何測量') || text.includes('如何测量') ||
        text.includes('參考') || text.includes('参考') || text.includes('Guide') ||
        text.includes('說明') || text.includes('说明') || text.includes('幫助') ||
        text.includes('帮助') || text.includes('Help')) {
      continue;
    }
    
    // 检查按钮是否被禁用（通过 class 或样式）
    const classList = btn.className || '';
    if (classList.includes('disabled') || classList.includes('shopee-button-disabled')) {
      continue;
    }
    
    // 检查按钮是否可点击（不是灰色/半透明状态）
    if (!isButtonClickable(btn)) {
      continue;
    }
    
    buttons.push(btn);
  }
  
  return buttons;
}

/**
 * 检查按钮是否可点击（不是禁用/灰色状态）
 * @param {Element} btn - 按钮元素
 * @returns {boolean}
 */
function isButtonClickable(btn) {
  // 检查 disabled 属性
  if (btn.disabled) return false;
  
  // 检查 aria-disabled 属性
  if (btn.getAttribute('aria-disabled') === 'true') return false;
  
  // 检查 class 中是否包含禁用相关的词
  const classList = btn.className || '';
  if (classList.includes('disabled') || 
      classList.includes('unavailable') ||
      classList.includes('sold-out') ||
      classList.includes('out-of-stock')) {
    return false;
  }
  
  // 检查样式 - 半透明通常表示不可点击
  const style = window.getComputedStyle(btn);
  const opacity = parseFloat(style.opacity);
  if (opacity < 0.5) return false;
  
  // 检查 pointer-events
  if (style.pointerEvents === 'none') return false;
  
  // 检查 cursor
  if (style.cursor === 'not-allowed') return false;
  
  return true;
}

/**
 * 检查按钮是否被选中
 * @param {Element} btn - 按钮元素
 * @returns {boolean}
 */
function isButtonSelected(btn) {
  const classList = btn.className || '';
  
  // 检查 class 中的选中状态
  if (classList.includes('active') || 
      classList.includes('selected') || 
      classList.includes('--selected') ||
      classList.includes('product-variation--selected')) {
    return true;
  }
  
  // 检查 aria 属性
  if (btn.getAttribute('aria-pressed') === 'true' ||
      btn.getAttribute('aria-selected') === 'true') {
    return true;
  }
  
  // 使用 getComputedStyle 检查实际渲染的边框颜色
  // Shopee 选中状态通常是橙红色边框 #ee4d2d = rgb(238, 77, 45)
  try {
    const computedStyle = window.getComputedStyle(btn);
    const borderColor = computedStyle.borderColor;
    
    // 检查是否是 Shopee 的橙红色
    if (borderColor === 'rgb(238, 77, 45)' || 
        borderColor === '#ee4d2d' ||
        borderColor.includes('238, 77, 45')) {
      return true;
    }
    
    // 也检查 outline 颜色（有些按钮用 outline 表示选中）
    const outlineColor = computedStyle.outlineColor;
    if (outlineColor === 'rgb(238, 77, 45)' || 
        outlineColor === '#ee4d2d' ||
        outlineColor.includes('238, 77, 45')) {
      return true;
    }
  } catch (e) {
    // 忽略样式检查错误
  }
  
  return false;
}

/**
 * 检查所有规格层是否都已选择
 * @param {Array} layers - 规格层数组
 * @returns {boolean}
 */
function areAllLayersSelected(layers) {
  for (const layer of layers) {
    let hasSelected = false;
    for (const btn of layer.buttons) {
      if (isButtonSelected(btn)) {
        hasSelected = true;
        break;
      }
    }
    if (!hasSelected) {
      console.log(`[Shopee Auto Cart] 规格层 "${layer.name}" 未选择`);
      return false;
    }
  }
  return true;
}

/**
 * 选择指定的规格按钮并等待生效
 * @param {Element} btn - 规格按钮
 * @returns {Promise<boolean>} 是否选择成功
 */
async function selectVariantButton(btn) {
  const btnName = btn.textContent?.trim() || btn.getAttribute('aria-label') || '未知';
  await log(`[调试] 点击规格按钮: "${btnName}"`, 'info');
  
  // 滚动到按钮位置确保可见
  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);
  
  btn.click();
  await sleep(CONFIG.VARIANT_SELECT_DELAY);
  
  // 验证是否选中
  const selected = isButtonSelected(btn);
  if (selected) {
    await log(`[调试] 规格 "${btnName}" 选择成功 ✓`, 'success');
    return true;
  }
  
  // 再次尝试
  await log(`[调试] 规格 "${btnName}" 首次点击未选中，重试...`, 'warning');
  btn.click();
  await sleep(CONFIG.VARIANT_SELECT_DELAY + 300);
  
  const selectedRetry = isButtonSelected(btn);
  if (selectedRetry) {
    await log(`[调试] 规格 "${btnName}" 重试选择成功 ✓`, 'success');
  } else {
    await log(`[调试] 规格 "${btnName}" 选择状态不确定，继续执行`, 'warning');
  }
  
  return selectedRetry;
}

/**
 * 添加商品到购物车 (不重试，失败直接返回)
 * @returns {Promise<boolean>}
 */
async function addToCart() {
  try {
    await log('[调试] 查找加入购物车按钮...', 'info');
    const addBtn = findAddToCartButton();

    if (!addBtn) {
      await log('[调试] 错误: 未找到加入购物车按钮', 'error');
      return false;
    }

    await log(`[调试] 找到按钮: "${addBtn.textContent?.trim().substring(0, 20)}"`, 'info');

    if (addBtn.disabled) {
      await log('[调试] 错误: 加入购物车按钮已禁用 (可能缺货)', 'error');
      return false;
    }

    // 滚动到按钮位置
    addBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);

    await log('[调试] 点击加入购物车按钮...', 'info');
    addBtn.click();

    // 等待操作完成
    await sleep(1500);

    // 检查是否出现规格未选择错误
    if (hasVariantSelectionError()) {
      await log('[调试] 检测到错误提示: 请先选择商品规格', 'error');
      return false;
    }

    return true;
  } catch (error) {
    await log(`[调试] 添加购物车异常: ${error.message}`, 'error');
    return false;
  }
}

// 记录上一次选择的索引，用于优化只选择变化的层
let lastSelectedIndices = null;

/**
 * 强制点击规格按钮（不检查是否已选中）
 * @param {Element} btn - 规格按钮
 * @returns {Promise<void>}
 */
async function forceClickVariantButton(btn) {
  const btnName = btn.textContent?.trim() || btn.getAttribute('aria-label') || '未知';

  // 滚动到按钮位置
  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  // 点击按钮
  btn.click();

  // 等待规格选择生效
  await sleep(CONFIG.VARIANT_SELECT_DELAY);

  await log(`[调试] 已点击规格: "${btnName}"`, 'info');
}

/**
 * 选择所有规格层并添加到购物车
 * 关键修复: 每次都强制点击所有规格按钮，不依赖 isButtonSelected() 判断
 * @param {Array} layers - 规格层数组
 * @param {Array<number>} indices - 每层选择的索引
 * @returns {Promise<boolean>}
 */
async function selectAllLayersAndAddToCart(layers, indices) {
  await log(`[调试] 开始选择 ${layers.length} 层规格...`, 'info');
  
  // 依次选择每一层规格
  // 关键修复: 每次都强制点击按钮，不依赖 isButtonSelected() 判断
  // 因为 isButtonSelected() 可能误判，导致按钮没有被真正点击
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const btnIdx = indices[layerIdx];
    
    if (btnIdx >= layer.buttons.length) {
      await log(`[调试] 错误: 规格层 ${layerIdx} 索引 ${btnIdx} 越界 (共 ${layer.buttons.length} 个)`, 'error');
      return false;
    }
    
    const btn = layer.buttons[btnIdx];
    const btnName = btn.textContent?.trim() || `选项${btnIdx + 1}`;
    
    // 检查这一层的索引是否变化
    const indexChanged = !lastSelectedIndices || 
                         lastSelectedIndices.length !== indices.length ||
                         lastSelectedIndices[layerIdx] !== btnIdx;
    
    // 关键修复: 当索引变化时，强制点击按钮
    if (indexChanged) {
      await log(`[调试] 点击第 ${layerIdx + 1} 层 "${layer.name}": ${btnName}`, 'info');
      await forceClickVariantButton(btn);
      // 等待页面更新（动态规格可能需要时间加载）
      await sleep(600);
    } else {
      // 索引没变，跳过点击（避免取消选中）
      await log(`[调试] 第 ${layerIdx + 1} 层 "${layer.name}" 保持: ${btnName}`, 'info');
    }
  }
  
  // 更新上次选择的索引
  lastSelectedIndices = [...indices];
  
  await log('[调试] 所有规格已选择，准备加入购物车...', 'info');
  await sleep(500);
  
  // 尝试添加到购物车
  const success = await addToCart();
  
  if (!success) {
    if (hasVariantSelectionError()) {
      await log('[调试] 添加失败: 页面提示规格未选择完整', 'error');
    } else {
      await log('[调试] 添加失败: 未知原因', 'error');
    }
    return false;
  }
  
  await log('[调试] 加入购物车成功 ✓', 'success');
  return true;
}

/**
 * 生成规格名称字符串
 * @param {Array} layers - 规格层数组
 * @param {Array<number>} indices - 每层选择的索引
 * @returns {string}
 */
function getVariantCombinationName(layers, indices) {
  const names = [];
  for (let i = 0; i < layers.length; i++) {
    const btn = layers[i].buttons[indices[i]];
    const name = btn?.textContent?.trim() || btn?.getAttribute('aria-label') || `选项${indices[i] + 1}`;
    names.push(name);
  }
  return names.join(' + ');
}

/**
 * 判断按钮文本是否像尺寸选项
 * @param {string} text - 按钮文本
 * @returns {boolean}
 */
function isSizeOption(text) {
  // 先排除"尺寸表"、"尺碼表"等非规格按钮
  const excludePatterns = [
    /尺寸表/,
    /尺碼表/,
    /尺码表/,
    /Size Chart/i,
    /Size Guide/i,
    /測量/,
    /测量/,
    /參考/,
    /参考/,
    /說明/,
    /说明/,
    /幫助/,
    /帮助/,
    /Guide/i,
    /Help/i
  ];
  
  // 如果匹配排除模式，直接返回 false
  if (excludePatterns.some(pattern => pattern.test(text))) {
    return false;
  }
  
  // 尺寸通常包含: XS, S, M, L, XL, XXL, 或者包含"公斤"、"kg"、"cm"等
  const sizePatterns = [
    // 标准尺码 (开头匹配)
    /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)/i,
    // 数字尺码 (如 36, 38, 40, 165/88A)
    /^\d{2,3}(\/\d+)?[A-Z]?$/i,
    /^\d{2,3}码/,
    /^\d{2,3}碼/,
    // 包含体重/身高建议的尺寸 (如 "XS【建議35-40kg】")
    /建議.*kg/i,
    /建议.*kg/i,
    /適合.*kg/i,
    /适合.*kg/i,
    /\d+-\d+kg/i,
    /\d+-\d+公斤/,
    // 单位关键词
    /公斤/,
    /kg/i,
    /cm/i,
    /公分/,
    /厘米/,
    // 尺寸相关词 - 但要排除"尺寸表"等
    /^\d+尺$/,      // 如 "2尺"
    /^\d+码$/,      // 如 "28码"
    /^\d+碼$/,      // 如 "28碼"
    /^\d+號$/,      // 如 "38號"
    /^\d+号$/,      // 如 "38号"
    /^\d+寸$/,      // 如 "29寸"
    // 纯数字（如 36, 38, 40）- 但排除太大的数字
    /^\d{1,3}$/,
    // 数字范围（如 35-40）
    /^\d+-\d+$/,
    // 均码/FREE SIZE
    /均码/,
    /均碼/,
    /FREE/i,
    /ONE SIZE/i,
  ];
  
  return sizePatterns.some(pattern => pattern.test(text));
}

/**
 * 将混合的规格按钮分离为颜色组和尺寸组
 * @param {Element[]} buttons - 所有按钮
 * @returns {{colorButtons: Element[], sizeButtons: Element[]}}
 */
function separateColorAndSizeButtons(buttons) {
  const colorButtons = [];
  const sizeButtons = [];
  
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (isSizeOption(text)) {
      sizeButtons.push(btn);
    } else {
      colorButtons.push(btn);
    }
  }
  
  return { colorButtons, sizeButtons };
}

/**
 * 处理动态规格商品 - 选择第一层后检测第二层
 * 有些商品的第二层规格（如尺寸）只有在选择第一层（如颜色）后才会出现
 * 或者颜色和尺寸混在同一层，需要智能分离
 * @param {Array} firstLayer - 第一层规格
 * @param {number} maxCarts - 最大购物车数量
 * @param {number} alreadySelectedIdx - 已经选中的第一个选项索引（避免重复点击）
 * @returns {Promise<number>} 添加到购物车的数量
 */
async function handleDynamicVariants(firstLayer, maxCarts, alreadySelectedIdx = 0) {
  let cartCount = 0;
  
  await log('[动态规格] 检测到可能是动态规格商品，尝试智能分离颜色和尺寸...', 'info');
  
  // 尝试分离颜色和尺寸按钮
  const { colorButtons, sizeButtons } = separateColorAndSizeButtons(firstLayer.buttons);
  
  await log(`[动态规格] 分析结果: ${colorButtons.length} 个颜色选项, ${sizeButtons.length} 个尺寸选项`, 'info');
  
  if (colorButtons.length > 0 && sizeButtons.length > 0) {
    // 成功分离！颜色和尺寸混在一起，需要分别选择
    await log('[动态规格] 颜色和尺寸混合在一层，开始分别选择...', 'info');
    
    // 记录当前选中的颜色索引
    let currentColorIdx = -1;
    
    // 遍历颜色
    for (let colorIdx = 0; colorIdx < colorButtons.length && cartCount < maxCarts; colorIdx++) {
      const currentState = await getState();
      if (!currentState.isRunning) break;
      
      const colorBtn = colorButtons[colorIdx];
      const colorName = colorBtn.textContent?.trim() || `颜色${colorIdx + 1}`;
      
      // 当切换到新颜色时，强制点击
      if (currentColorIdx !== colorIdx) {
        await log(`[动态规格] 点击颜色: ${colorName}`, 'info');
        await forceClickVariantButton(colorBtn);
        await sleep(500);
        currentColorIdx = colorIdx;
      }
      
      // 遍历尺寸
      for (let sizeIdx = 0; sizeIdx < sizeButtons.length && cartCount < maxCarts; sizeIdx++) {
        const currentState2 = await getState();
        if (!currentState2.isRunning) break;
        
        const sizeBtn = sizeButtons[sizeIdx];
        const sizeName = sizeBtn.textContent?.trim() || `尺寸${sizeIdx + 1}`;
        
        await log(`[动态规格] 选择尺寸: ${sizeName}`, 'info');
        await forceClickVariantButton(sizeBtn);
        await sleep(500);
        
        // 尝试加入购物车
        const success = await addToCart();
        if (success) {
          cartCount++;
          await log(`✓ 已添加 "${colorName} + ${sizeName}" (${cartCount}/${maxCarts})`, 'success');
        } else {
          await log(`✗ 添加 "${colorName} + ${sizeName}" 失败`, 'warning');
        }
        
        await sleep(CONFIG.OPERATION_DELAY);
        
        // 注意：不要在这里重新点击颜色！
        // Shopee 的按钮是切换式的，重复点击会取消选中
      }
    }
  } else {
    // 无法分离，说明可能是动态规格：选择颜色后尺寸才会出现
    await log('[动态规格] 无法分离颜色和尺寸，尝试动态检测第二层规格...', 'info');
    
    // 遍历所有选项（颜色）
    // 注意：如果 alreadySelectedIdx >= 0，说明该选项已经被点击过了，不需要重新点击
    for (let idx = 0; idx < firstLayer.buttons.length && cartCount < maxCarts; idx++) {
      const currentState = await getState();
      if (!currentState.isRunning) break;
      
      const btn = firstLayer.buttons[idx];
      const btnName = btn.textContent?.trim() || `选项${idx + 1}`;
      
      // 如果是已经选中的选项，不需要重新点击（避免取消选中）
      if (idx === alreadySelectedIdx) {
        await log(`[动态规格] 选项 "${btnName}" 已选中，跳过点击`, 'info');
      } else {
        // 点击新的颜色选项
        await log(`[动态规格] 点击颜色: ${btnName}`, 'info');
        await forceClickVariantButton(btn);
      }
      await sleep(1000); // 等待页面更新，尺寸按钮可能需要时间加载
      
      // 重新检测规格层
      const newLayers = await detectVariantLayers();
      await log(`[动态规格] 选择颜色后检测到 ${newLayers.length} 层规格`, 'info');
      
      // 查找第二层规格（尺寸）
      let secondLayer = null;
      
      if (newLayers.length > 1) {
        // 找到与第一层不同的规格层
        secondLayer = newLayers.find(layer => {
          const firstLayerBtnTexts = firstLayer.buttons.map(b => b.textContent?.trim());
          const layerBtnTexts = layer.buttons.map(b => b.textContent?.trim());
          // 如果这一层的按钮文本与第一层不完全相同，就是第二层
          return !layerBtnTexts.every(t => firstLayerBtnTexts.includes(t));
        });
      }
      
      // 如果没找到第二层，尝试直接在页面上查找尺寸按钮
      if (!secondLayer) {
        await log('[动态规格] 尝试直接查找页面上的尺寸按钮...', 'info');
        const allButtons = document.querySelectorAll('button');
        const sizeButtonsOnPage = [];
        
        for (const pageBtn of allButtons) {
          if (pageBtn.disabled) continue;
          const text = pageBtn.textContent?.trim() || '';
          if (text.length === 0 || text.length > 50) continue;
          
          // 检查是否是尺寸按钮
          if (isSizeOption(text)) {
            // 排除已经在第一层的按钮
            const isInFirstLayer = firstLayer.buttons.some(b => b === pageBtn);
            if (!isInFirstLayer && isButtonClickable(pageBtn)) {
              sizeButtonsOnPage.push(pageBtn);
            }
          }
        }
        
        if (sizeButtonsOnPage.length > 0) {
          await log(`[动态规格] 在页面上找到 ${sizeButtonsOnPage.length} 个尺寸按钮`, 'success');
          secondLayer = { name: '尺寸', buttons: sizeButtonsOnPage };
        }
      }
      
      if (secondLayer && secondLayer.buttons.length > 0) {
        // 找到了第二层规格！遍历所有尺寸
        await log(`[动态规格] 发现第二层规格: ${secondLayer.buttons.length} 个选项`, 'success');
        
        for (let secondIdx = 0; secondIdx < secondLayer.buttons.length && cartCount < maxCarts; secondIdx++) {
          const currentState2 = await getState();
          if (!currentState2.isRunning) break;
          
          const secondBtn = secondLayer.buttons[secondIdx];
          const secondName = secondBtn.textContent?.trim() || `选项${secondIdx + 1}`;
          
          // 检查按钮是否可点击
          if (!isButtonClickable(secondBtn)) {
            await log(`[动态规格] 尺寸 "${secondName}" 不可选，跳过`, 'warning');
            continue;
          }
          
          await log(`[动态规格] 点击尺寸: ${secondName}`, 'info');
          await forceClickVariantButton(secondBtn);
          await sleep(500);
          
          const success = await addToCart();
          if (success) {
            cartCount++;
            await log(`✓ 已添加 "${btnName} + ${secondName}" (${cartCount}/${maxCarts})`, 'success');
          } else {
            await log(`✗ 添加 "${btnName} + ${secondName}" 失败`, 'warning');
          }
          
          await sleep(CONFIG.OPERATION_DELAY);
          
          // 注意：不要在这里重新点击颜色！
          // Shopee 的按钮是切换式的，重复点击会取消选中
        }
      } else {
        // 还是没找到第二层，尝试直接加入购物车
        await log(`[动态规格] 未找到第二层规格，尝试直接加入购物车`, 'info');
        const success = await addToCart();
        if (success) {
          cartCount++;
          await log(`✓ 已添加 "${btnName}" (${cartCount}/${maxCarts})`, 'success');
        } else {
          await log(`✗ 添加 "${btnName}" 失败，可能需要选择更多规格`, 'warning');
        }
        
        await sleep(CONFIG.OPERATION_DELAY);
      }
    }
  }
  
  return cartCount;
}

/**
 * 处理商品详情页 - 添加所有规格组合到购物车
 * 智能检测页面上的规格层，确保每层都选择后再加入购物车
 * 有规格时最多添加15个，无规格时最多添加3个
 * 失败不重试，直接跳到下一个组合
 * @returns {Promise<number>} 添加到购物车的数量
 */
async function addAllVariantsToCart() {
  let cartCount = 0;
  
  // 重置上次选择的索引（新商品需要重新选择所有规格）
  lastSelectedIndices = null;
  
  console.log('[Shopee Auto Cart] addAllVariantsToCart 开始执行');
  
  // 获取商品名称
  const nameEl = document.querySelector(ProductSelectors.PRODUCT_NAME);
  const productName = nameEl ? nameEl.textContent.trim().substring(0, 50) : '未知商品';
  
  await log(`处理商品: ${productName}`, 'info');
  
  // 等待页面完全加载 (使用配置的延迟时间)
  await log(`等待页面加载 (${CONFIG.PAGE_LOAD_DELAY / 1000}秒)...`, 'info');
  await sleep(CONFIG.PAGE_LOAD_DELAY);
  
  // 智能检测规格层
  await log('开始检测商品规格...', 'info');
  let layers = await detectVariantLayers();
  
  // 如果第一次没检测到，等待后再试一次
  if (layers.length === 0) {
    await log('首次未检测到规格，等待后重试...', 'info');
    await sleep(2000);
    layers = await detectVariantLayers();
  }
  
  console.log('[Shopee Auto Cart] 最终检测到规格层数:', layers.length);
  
  // 根据是否有规格决定最大购物车数量
  const hasVariantOptions = layers.length > 0;
  const maxCarts = hasVariantOptions ? CONFIG.MAX_CARTS_WITH_VARIANTS : CONFIG.MAX_CARTS_NO_VARIANTS;
  
  if (layers.length === 0) {
    // 检测不到规格，先尝试直接加入购物车
    await log('未检测到规格选项，尝试直接加入购物车...', 'info');
    
    const firstTry = await addToCart();
    
    if (firstTry) {
      // 成功，说明确实没有规格
      cartCount++;
      await log(`已添加商品到购物车 (${cartCount}/${maxCarts})`, 'success');
      
      // 继续添加
      for (let i = 1; i < maxCarts; i++) {
        // 检查是否已停止运行
        const currentState = await getState();
        if (!currentState.isRunning) {
          await log('检测到停止信号，终止操作', 'warning');
          break;
        }
        
        await sleep(CONFIG.OPERATION_DELAY);
        const success = await addToCart();
        if (success) {
          cartCount++;
          await log(`已添加商品到购物车 (${cartCount}/${maxCarts})`, 'success');
        }
      }
    } else if (hasVariantSelectionError()) {
      // 出现规格未选择错误，说明有规格但没检测到
      await log('检测到需要选择规格，但未能自动识别规格选项', 'error');
      await log('请检查页面结构或手动选择规格', 'warning');
    } else {
      await log('添加购物车失败', 'warning');
    }
  } else {
    // 有规格商品
    await log(`检测到 ${layers.length} 层规格`, 'info');
    for (const layer of layers) {
      const buttonNames = layer.buttons.slice(0, 5).map(b => b.textContent?.trim().substring(0, 15)).join(', ');
      await log(`  - ${layer.name}: ${layer.buttons.length} 个选项 [${buttonNames}${layer.buttons.length > 5 ? '...' : ''}]`, 'info');
    }
    
    // 先检查是否是颜色和尺寸混合的情况（1层规格但包含颜色和尺寸）
    if (layers.length === 1) {
      const { colorButtons, sizeButtons } = separateColorAndSizeButtons(layers[0].buttons);
      await log(`[分析] 颜色选项: ${colorButtons.length} 个, 尺寸选项: ${sizeButtons.length} 个`, 'info');
      
      if (colorButtons.length > 0 && sizeButtons.length > 0) {
        // 颜色和尺寸混合在一层！直接使用混合规格处理，不尝试单层逻辑
        await log('[混合规格] 检测到颜色和尺寸混合，直接使用双层选择逻辑...', 'info');
        cartCount = await handleMixedColorSizeVariants(colorButtons, sizeButtons, maxCarts);
      } else if (sizeButtons.length === 0 && colorButtons.length > 0) {
        // 只有颜色，没有尺寸，尝试单层逻辑
        await log('[单层规格] 只检测到颜色选项，尝试单层逻辑...', 'info');
        cartCount = await handleSingleLayerVariants(layers[0], maxCarts);
      } else {
        // 只有尺寸或其他选项，尝试单层逻辑
        await log('[单层规格] 尝试单层逻辑...', 'info');
        cartCount = await handleSingleLayerVariants(layers[0], maxCarts);
      }
    } else {
      // 多层规格商品 - 直接使用多层逻辑
      await log('[多层规格] 使用多层规格组合逻辑...', 'info');
      cartCount = await handleMultiLayerVariants(layers, maxCarts);
    }
  }
  
  await log(`商品处理完成，共添加 ${cartCount} 个到购物车`, 'success');
  return cartCount;
}

/**
 * 处理单层规格商品
 * @param {Object} layer - 规格层对象
 * @param {number} maxCarts - 最大购物车数量
 * @returns {Promise<number>} 添加到购物车的数量
 */
async function handleSingleLayerVariants(layer, maxCarts) {
  let cartCount = 0;
  
  for (let i = 0; i < layer.buttons.length && cartCount < maxCarts; i++) {
    const currentState = await getState();
    if (!currentState.isRunning) break;
    
    const btn = layer.buttons[i];
    const btnName = btn.textContent?.trim() || `选项${i + 1}`;
    
    if (!isButtonClickable(btn)) {
      await log(`选项 "${btnName}" 不可选，跳过`, 'warning');
      continue;
    }
    
    await log(`点击: ${btnName}`, 'info');
    await forceClickVariantButton(btn);
    await sleep(500);
    
    const success = await addToCart();
    if (success) {
      cartCount++;
      await log(`✓ 已添加 "${btnName}" (${cartCount}/${maxCarts})`, 'success');
    } else if (hasVariantSelectionError()) {
      // 单层逻辑失败，可能需要动态规格处理
      // 注意：当前选项已经被点击了，传递当前索引给 handleDynamicVariants
      // 让它从当前选项开始处理，而不是重新点击
      await log(`[动态规格] 检测到需要更多规格，尝试动态处理...`, 'warning');
      cartCount = await handleDynamicVariants(layer, maxCarts, i);
      break; // 切换到动态规格处理后退出循环
    } else {
      await log(`✗ 添加 "${btnName}" 失败`, 'warning');
    }
    
    await sleep(CONFIG.OPERATION_DELAY);
  }
  
  return cartCount;
}

/**
 * 处理颜色和尺寸混合的规格
 * 关键修复 v19: 不要重复点击已选中的颜色，否则会取消选中
 * @param {Element[]} colorButtons - 颜色按钮数组
 * @param {Element[]} sizeButtons - 尺寸按钮数组
 * @param {number} maxCarts - 最大购物车数量
 * @returns {Promise<number>} 添加到购物车的数量
 */
async function handleMixedColorSizeVariants(colorButtons, sizeButtons, maxCarts) {
  let cartCount = 0;
  
  // 记录当前选中的颜色索引
  let currentSelectedColorIdx = -1;
  
  // 遍历颜色
  for (let colorIdx = 0; colorIdx < colorButtons.length && cartCount < maxCarts; colorIdx++) {
    const currentState = await getState();
    if (!currentState.isRunning) break;
    
    const colorBtn = colorButtons[colorIdx];
    const colorName = colorBtn.textContent?.trim() || `颜色${colorIdx + 1}`;
    
    // 只有切换到新颜色时才点击（避免重复点击导致取消选中）
    if (currentSelectedColorIdx !== colorIdx) {
      await log(`[混合规格] 选择颜色: ${colorName}`, 'info');
      await forceClickVariantButton(colorBtn);
      await sleep(600);
      currentSelectedColorIdx = colorIdx;
    }
    
    // 遍历尺寸
    for (let sizeIdx = 0; sizeIdx < sizeButtons.length && cartCount < maxCarts; sizeIdx++) {
      const currentState2 = await getState();
      if (!currentState2.isRunning) break;
      
      const sizeBtn = sizeButtons[sizeIdx];
      const sizeName = sizeBtn.textContent?.trim() || `尺寸${sizeIdx + 1}`;
      
      // 检查尺寸按钮是否可点击
      if (!isButtonClickable(sizeBtn)) {
        await log(`[混合规格] 尺寸 "${sizeName}" 不可选，跳过`, 'warning');
        continue;
      }
      
      // 点击尺寸按钮（尺寸每次都需要点击，因为要切换不同尺寸）
      await log(`[混合规格] 选择尺寸: ${sizeName}`, 'info');
      await forceClickVariantButton(sizeBtn);
      await sleep(500);
      
      // 尝试加入购物车
      const success = await addToCart();
      if (success) {
        cartCount++;
        await log(`✓ 已添加 "${colorName} + ${sizeName}" (${cartCount}/${maxCarts})`, 'success');
      } else {
        await log(`✗ 添加 "${colorName} + ${sizeName}" 失败`, 'warning');
      }
      
      await sleep(CONFIG.OPERATION_DELAY);
      
      // 注意：不要在这里重新点击颜色！
      // Shopee 的按钮是切换式的，重复点击会取消选中
      // 颜色在同一个循环内应该保持选中状态
    }
  }
  
  return cartCount;
}

/**
 * 处理多层规格商品
 * @param {Array} layers - 规格层数组
 * @param {number} maxCarts - 最大购物车数量
 * @returns {Promise<number>} 添加到购物车的数量
 */
async function handleMultiLayerVariants(layers, maxCarts) {
  let cartCount = 0;
  
  // 生成所有规格组合的索引
  const totalCombinations = layers.reduce((acc, layer) => acc * layer.buttons.length, 1);
  await log(`共 ${totalCombinations} 种规格组合，最多添加 ${maxCarts} 个`, 'info');
  
  // 使用迭代方式遍历所有组合
  const indices = new Array(layers.length).fill(0);
  let combinationIndex = 0;
  
  while (cartCount < maxCarts) {
    // 检查是否已停止运行
    const currentState = await getState();
    if (!currentState.isRunning) {
      await log('检测到停止信号，终止操作', 'warning');
      break;
    }
    
    combinationIndex++;
    
    // 获取当前组合的名称
    const combinationName = getVariantCombinationName(layers, indices);
    await log(`[${combinationIndex}/${totalCombinations}] 选择: ${combinationName}`, 'info');
    
    // 选择所有规格层并尝试添加到购物车
    const success = await selectAllLayersAndAddToCart(layers, indices);
    
    if (success) {
      cartCount++;
      await log(`✓ 已添加 "${combinationName}" (${cartCount}/${maxCarts})`, 'success');
    } else {
      await log(`✗ 添加 "${combinationName}" 失败，跳过`, 'warning');
    }
    
    await sleep(CONFIG.OPERATION_DELAY);
    
    // 移动到下一个组合
    let carry = true;
    for (let i = layers.length - 1; i >= 0 && carry; i--) {
      indices[i]++;
      if (indices[i] >= layers[i].buttons.length) {
        indices[i] = 0;
      } else {
        carry = false;
      }
    }
    
    // 如果所有组合都已遍历完成
    if (carry) {
      await log('所有规格组合已处理完成', 'info');
      break;
    }
  }
  
  return cartCount;
}



/**
 * 处理商品详情页
 * 处理完成后直接返回搜索页继续下一个商品
 */
async function handleProductPage() {
  const state = await getState();

  console.log('[Shopee Auto Cart] handleProductPage 被调用, state:', state);

  if (!state.isRunning) {
    console.log('[Shopee Auto Cart] 扩展未运行，跳过处理');
    return;
  }

  await log('正在商品详情页，开始处理...', 'info');

  try {
    // 等待页面加载
    await log(`等待页面加载 (${CONFIG.PAGE_LOAD_DELAY / 1000}秒)...`, 'info');
    await sleep(CONFIG.PAGE_LOAD_DELAY);

    // 检查页面是否正确加载
    const pageContent = document.body.innerText;
    if (pageContent.length < 100) {
      await log('页面内容过少，额外等待2秒...', 'warning');
      await sleep(2000);
    }

    // 添加所有规格到购物车
    const cartCount = await addAllVariantsToCart();

    // 更新状态
    await updateState({ cartCount });

    await log(`商品处理完成，添加了 ${cartCount} 个到购物车`, 'success');

    // 等待操作完成
    await sleep(1000);

    // 返回搜索页继续处理下一个商品
    await returnToSearch();

  } catch (error) {
    await log(`处理商品详情页失败: ${error.message}`, 'error');
    // 出错后也要等待一下再返回
    await sleep(2000);
    await returnToSearch();
  }
}




// 记录上次更换搜索词的时间
let lastKeywordChangeTime = 0;

/**
 * 检查是否需要更换搜索词（每2分钟更换一次）
 * @returns {boolean}
 */
function shouldChangeKeyword() {
  const now = Date.now();
  const elapsed = now - lastKeywordChangeTime;
  return elapsed >= CONFIG.KEYWORD_CHANGE_INTERVAL;
}

/**
 * 返回搜索结果页
 * @param {boolean} forceKeepKeyword - 是否强制保持当前关键词（不切换）
 * Requirements: 7.4 - 导航超时时记录错误并尝试返回搜索结果
 */
async function returnToSearch(forceKeepKeyword = true) {
  const state = await getState();
  let keyword = state.keyword;
  
  // 只有在不强制保持关键词且时间到了才更换搜索词
  if (!forceKeepKeyword && shouldChangeKeyword()) {
    // 随机选择一个新的搜索词（排除当前关键词，增加多样性）
    let newKeyword = getRandomKeyword();
    let attempts = 0;
    while (newKeyword === state.keyword && attempts < 5) {
      newKeyword = getRandomKeyword();
      attempts++;
    }
    
    await log(`[4分钟] 更换搜索词: "${state.keyword}" → "${newKeyword}"`, 'info');
    
    // 更新状态中的关键词和时间
    keyword = newKeyword;
    await updateState({ keyword: newKeyword });
    lastKeywordChangeTime = Date.now();
  } else {
    // 保持当前关键词，继续在同一搜索结果页面选择其他商品
    await log(`返回搜索页，继续搜索: ${keyword}`, 'info');
  }
  
  const searchUrl = buildSearchUrl(keyword);
  
  try {
    // 设置导航超时检测
    const navigationTimeout = setTimeout(async () => {
      await log('导航超时，正在重试...', 'warning');
    }, CONFIG.NAVIGATION_TIMEOUT || 30000);
    
    window.location.href = searchUrl;
    clearTimeout(navigationTimeout);
  } catch (error) {
    await log(`导航失败: ${error.message}`, 'error');
  }
}

/**
 * 安全导航到指定 URL (带超时和重试)
 * Requirements: 7.4 - 导航超时处理
 * @param {string} url - 目标 URL
 * @param {string} description - 导航描述（用于日志）
 * @returns {Promise<boolean>}
 */
async function safeNavigate(url, description = '页面') {
  try {
    await log(`正在导航到${description}...`, 'info');
    window.location.href = url;
    return true;
  } catch (error) {
    await log(`导航到${description}失败: ${error.message}`, 'error');
    return false;
  }
}



// ============================================
// 主入口和初始化
// ============================================

/**
 * 根据页面类型执行相应操作
 */
async function handleCurrentPage() {
  const state = await getState();
  
  if (!state.isRunning) {
    return;
  }
  
  const pageType = detectPageType();
  
  switch (pageType) {
    case PageType.SEARCH:
      await handleSearchPage();
      break;
    case PageType.PRODUCT:
      await handleProductPage();
      break;
    default:
      await log('当前页面类型不支持自动化操作，返回搜索页', 'warning');
      await returnToSearch();
  }
}

/**
 * 初始化 Content Script
 * Requirements: 1.1, 2.5, 3.4, 4.3 - 完整流程集成
 */
async function init() {
  console.log('[Shopee Auto Cart] Content Script 初始化开始');
  console.log('[Shopee Auto Cart] 当前 URL:', window.location.href);
  
  // 注入悬浮 UI
  injectFloatingUI();
  
  // 等待一段时间让页面完全加载
  await sleep(CONFIG.PAGE_LOAD_DELAY);
  
  // 检查是否正在运行，如果是则继续处理
  try {
    const state = await getState();
    console.log('[Shopee Auto Cart] 获取到状态:', state);
    
    if (state.isRunning) {
      const pageType = detectPageType();
      await log(`继续自动化流程，关键词: ${state.keyword}，页面类型: ${pageType}`, 'info');
      console.log('[Shopee Auto Cart] 开始处理页面，类型:', pageType);
      await handleCurrentPage();
    } else {
      console.log('[Shopee Auto Cart] 扩展未运行，等待用户启动');
    }
  } catch (error) {
    console.error('[Shopee Auto Cart] 初始化错误:', error);
    await log(`初始化错误: ${error.message}`, 'error');
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================
// SPA 导航监听 - 处理 Shopee 单页应用的页面切换
// ============================================

let lastUrl = window.location.href;

/**
 * 监听 URL 变化 (用于 SPA 导航)
 */
function setupUrlChangeListener() {
  // 使用 MutationObserver 监听 DOM 变化来检测 SPA 导航
  const observer = new MutationObserver(async () => {
    if (window.location.href !== lastUrl) {
      console.log('[Shopee Auto Cart] 检测到 URL 变化:', lastUrl, '->', window.location.href);
      lastUrl = window.location.href;
      
      // 等待页面内容加载
      await sleep(CONFIG.PAGE_LOAD_DELAY);
      
      // 检查是否正在运行
      try {
        const state = await getState();
        if (state.isRunning) {
          const pageType = detectPageType();
          console.log('[Shopee Auto Cart] SPA 导航后处理页面，类型:', pageType);
          await log(`页面切换，继续处理，页面类型: ${pageType}`, 'info');
          await handleCurrentPage();
        }
      } catch (error) {
        console.error('[Shopee Auto Cart] SPA 导航处理错误:', error);
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  // 同时监听 popstate 事件 (浏览器前进/后退)
  window.addEventListener('popstate', async () => {
    console.log('[Shopee Auto Cart] 检测到 popstate 事件');
    await sleep(CONFIG.PAGE_LOAD_DELAY);
    
    try {
      const state = await getState();
      if (state.isRunning) {
        lastUrl = window.location.href;
        await handleCurrentPage();
      }
    } catch (error) {
      console.error('[Shopee Auto Cart] popstate 处理错误:', error);
    }
  });
  
  // 监听 hashchange 事件
  window.addEventListener('hashchange', async () => {
    console.log('[Shopee Auto Cart] 检测到 hashchange 事件');
    await sleep(CONFIG.PAGE_LOAD_DELAY);
    
    try {
      const state = await getState();
      if (state.isRunning) {
        lastUrl = window.location.href;
        await handleCurrentPage();
      }
    } catch (error) {
      console.error('[Shopee Auto Cart] hashchange 处理错误:', error);
    }
  });
  
  console.log('[Shopee Auto Cart] URL 变化监听器已设置');
}

// 设置 URL 变化监听
setupUrlChangeListener();

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    PageType,
    detectPageType,
    isSearchPage,
    isProductPage,
    isShopPage,
    extractProductId,
    extractShopId,
    buildSearchUrl,
    sleep,
    // 错误处理和重试机制 - Requirements 7.1, 7.2
    waitForElement,
    waitForElements,
    withRetry,
    withTimeout,
    addToCartWithRetry,
    safeNavigate,
    // 购物车限制相关 - Property 1
    addAllVariantsToCart,
    hasVariants,
    getVariantOptions,
    addToCart
  };
}
