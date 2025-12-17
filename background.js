/**
 * Shopee Auto Cart Extension - Background Service Worker
 * 管理扩展状态、协调页面间通信、存储配置
 */

// ============================================
// 2.1 扩展状态管理
// ============================================

/**
 * @typedef {Object} ExtensionState
 * @property {boolean} isRunning - 是否正在运行
 * @property {string} keyword - 搜索关键词
 * @property {number} currentProductIndex - 当前处理的商品索引
 * @property {string[]} processedProducts - 已处理商品ID列表
 * @property {number} cartCount - 当前商品已添加购物车数量
 */

/**
 * @typedef {Object} ExtensionConfig
 * @property {number} maxCartsPerProduct - 每个商品最大添加购物车数量
 * @property {number} retryAttempts - 重试次数
 * @property {number} retryDelay - 重试延迟(ms)
 * @property {number} maxLogEntries - 最大日志条目数
 * @property {{x: number, y: number}} uiPosition - UI位置
 */

/** @type {ExtensionState} */
let state = {
  isRunning: false,
  keyword: '',
  currentProductIndex: 0,
  processedProducts: [],
  cartCount: 0
};

/** @type {ExtensionConfig} */
const defaultConfig = {
  maxCartsPerProduct: 10,
  retryAttempts: 3,
  retryDelay: 2000,
  maxLogEntries: 100,
  uiPosition: { x: 20, y: 20 }
};

let config = { ...defaultConfig };

// ============================================
// 2.2 状态持久化
// ============================================

/**
 * 保存状态到 chrome.storage.local
 */
async function saveState() {
  try {
    await chrome.storage.local.set({ extensionState: state });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}


/**
 * 从 chrome.storage.local 加载状态
 */
async function loadState() {
  try {
    const result = await chrome.storage.local.get(['extensionState']);
    if (result.extensionState) {
      state = { ...state, ...result.extensionState };
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

/**
 * 保存配置到 chrome.storage.local
 */
async function saveConfig() {
  try {
    await chrome.storage.local.set({ extensionConfig: config });
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

/**
 * 从 chrome.storage.local 加载配置
 */
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(['extensionConfig']);
    if (result.extensionConfig) {
      config = { ...defaultConfig, ...result.extensionConfig };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

/**
 * 保存 UI 位置
 * @param {{x: number, y: number}} position
 */
async function saveUIPosition(position) {
  config.uiPosition = position;
  await saveConfig();
}

/**
 * 获取 UI 位置
 * @returns {{x: number, y: number}}
 */
function getUIPosition() {
  return config.uiPosition;
}

/**
 * 添加已处理商品
 * @param {string} productId
 */
async function addProcessedProduct(productId) {
  if (!state.processedProducts.includes(productId)) {
    state.processedProducts.push(productId);
    await saveState();
  }
}

/**
 * 检查商品是否已处理
 * @param {string} productId
 * @returns {boolean}
 */
function isProductProcessed(productId) {
  return state.processedProducts.includes(productId);
}

/**
 * 清除已处理商品列表
 */
async function clearProcessedProducts() {
  state.processedProducts = [];
  await saveState();
}

// ============================================
// 2.3 页面间通信协调
// ============================================

/**
 * @typedef {Object} Message
 * @property {'START'|'STOP'|'LOG'|'STATE_UPDATE'|'NAVIGATE'|'GET_STATE'|'GET_CONFIG'|'SAVE_UI_POSITION'|'ADD_PROCESSED'|'IS_PROCESSED'|'CLEAR_PROCESSED'} type
 * @property {*} payload
 */

/**
 * 向所有 Shopee 标签页发送消息
 * @param {Message} message
 */
async function broadcastToShopee(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.shopee.*/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        // 标签页可能没有 content script，忽略错误
      }
    }
  } catch (error) {
    console.error('Failed to broadcast message:', error);
  }
}

/**
 * 向指定标签页发送消息
 * @param {number} tabId
 * @param {Message} message
 */
async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('Failed to send message to tab:', error);
  }
}


/**
 * 处理 START 消息 - 开始自动化流程
 * @param {Object} payload
 * @param {string} payload.keyword - 搜索关键词
 * @param {number} senderId - 发送者标签页ID
 */
async function handleStart(payload, senderId) {
  state.isRunning = true;
  state.keyword = payload.keyword || '';
  state.currentProductIndex = 0;
  state.cartCount = 0;
  await clearProcessedProducts();
  await saveState();
  
  // 广播状态更新
  await broadcastToShopee({
    type: 'STATE_UPDATE',
    payload: { ...state }
  });
  
  // 记录日志
  await broadcastToShopee({
    type: 'LOG',
    payload: {
      message: `开始自动化流程，关键词: ${state.keyword}`,
      logType: 'info'
    }
  });
}

/**
 * 处理 STOP 消息 - 停止自动化流程
 * Requirements: 4.4 - 用户点击停止时立即停止所有操作并保持当前状态
 */
async function handleStop() {
  state.isRunning = false;
  await saveState();
  
  // 广播状态更新
  await broadcastToShopee({
    type: 'STATE_UPDATE',
    payload: { ...state }
  });
  
  // 记录日志
  await broadcastToShopee({
    type: 'LOG',
    payload: {
      message: '自动化流程已停止',
      logType: 'warning'
    }
  });
}

/**
 * 处理 NAVIGATE 消息 - 页面跳转
 * @param {Object} payload
 * @param {string} payload.url - 目标URL
 * @param {number} senderId - 发送者标签页ID
 */
async function handleNavigate(payload, senderId) {
  if (!state.isRunning) return;
  
  try {
    await chrome.tabs.update(senderId, { url: payload.url });
  } catch (error) {
    console.error('Navigation failed:', error);
    await broadcastToShopee({
      type: 'LOG',
      payload: {
        message: `导航失败: ${error.message}`,
        logType: 'error'
      }
    });
  }
}

/**
 * 处理 LOG 消息 - 转发日志到 UI
 * Requirements: 6.1 - 任何操作执行时都要添加带时间戳的日志
 * @param {Object} payload
 * @param {string} payload.message - 日志消息
 * @param {string} payload.logType - 日志类型
 */
async function handleLog(payload) {
  // 转发日志到所有 Shopee 标签页的 UI
  await broadcastToShopee({
    type: 'LOG',
    payload: {
      message: payload.message,
      logType: payload.logType || 'info',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * 处理 STATE_UPDATE 消息 - 更新状态
 * @param {Partial<ExtensionState>} payload
 */
async function handleStateUpdate(payload) {
  state = { ...state, ...payload };
  await saveState();
  
  // 广播状态更新
  await broadcastToShopee({
    type: 'STATE_UPDATE',
    payload: { ...state }
  });
}

/**
 * 消息监听器
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderId = sender.tab?.id;
  
  (async () => {
    try {
      switch (message.type) {
        case 'START':
          await handleStart(message.payload, senderId);
          sendResponse({ success: true });
          break;
          
        case 'STOP':
          await handleStop();
          sendResponse({ success: true });
          break;
          
        case 'NAVIGATE':
          await handleNavigate(message.payload, senderId);
          sendResponse({ success: true });
          break;
          
        case 'LOG':
          await handleLog(message.payload);
          sendResponse({ success: true });
          break;
          
        case 'STATE_UPDATE':
          await handleStateUpdate(message.payload);
          sendResponse({ success: true });
          break;
          
        case 'GET_STATE':
          sendResponse({ success: true, data: { ...state } });
          break;
          
        case 'GET_CONFIG':
          sendResponse({ success: true, data: { ...config } });
          break;
          
        case 'SAVE_UI_POSITION':
          await saveUIPosition(message.payload);
          sendResponse({ success: true });
          break;
          
        case 'ADD_PROCESSED':
          await addProcessedProduct(message.payload.productId);
          sendResponse({ success: true });
          break;
          
        case 'IS_PROCESSED':
          sendResponse({ 
            success: true, 
            data: isProductProcessed(message.payload.productId) 
          });
          break;
          
        case 'CLEAR_PROCESSED':
          await clearProcessedProducts();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // 返回 true 表示异步响应
  return true;
});

// ============================================
// 初始化
// ============================================

/**
 * 扩展安装/更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  await loadConfig();
  await loadState();
  console.log('Shopee Auto Cart Extension installed/updated');
});

/**
 * Service Worker 启动时加载状态
 */
(async () => {
  await loadConfig();
  await loadState();
  console.log('Shopee Auto Cart Extension background service started');
})();

// 导出供测试使用
export {
  state,
  config,
  defaultConfig,
  saveState,
  loadState,
  saveConfig,
  loadConfig,
  saveUIPosition,
  getUIPosition,
  addProcessedProduct,
  isProductProcessed,
  clearProcessedProducts,
  broadcastToShopee,
  sendToTab,
  handleStart,
  handleStop,
  handleNavigate,
  handleLog,
  handleStateUpdate
};
