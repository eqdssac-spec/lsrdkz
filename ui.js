/**
 * Shopee Auto Cart - 悬浮 UI 逻辑
 * Requirements: 5.3, 5.4, 5.5, 6.2, 6.5
 */

// 配置常量
const CONFIG = {
  MAX_LOG_ENTRIES: 100,
  STORAGE_KEY_POSITION: 'shopee_auto_cart_ui_position',
  STORAGE_KEY_MINIMIZED: 'shopee_auto_cart_ui_minimized'
};

// UI 状态
const uiState = {
  isMinimized: false,
  isDragging: false,
  dragOffset: { x: 0, y: 0 },
  position: { x: null, y: null }
};

// DOM 元素引用
let elements = {};

/**
 * 初始化 UI
 */
function initUI() {
  // 获取 DOM 元素引用
  elements = {
    panel: document.getElementById('shopee-auto-cart-panel'),
    header: document.getElementById('panel-header'),
    content: document.getElementById('panel-content'),
    minimizeBtn: document.getElementById('minimize-btn'),
    expandBtn: document.getElementById('expand-btn'),
    minimizedIcon: document.getElementById('minimized-icon'),
    keywordInput: document.getElementById('keyword-input'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    statusText: document.getElementById('status-text'),
    logArea: document.getElementById('log-area'),
    clearLogBtn: document.getElementById('clear-log-btn')
  };

  // 初始化事件监听
  initDragEvents();
  initButtonEvents();
  
  // 恢复保存的位置和状态
  restoreUIState();
  
  // 添加初始日志
  addLog('扩展已加载，准备就绪', 'info');
}

/**
 * 初始化拖拽事件
 */
function initDragEvents() {
  const { header, panel } = elements;
  
  header.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', endDrag);
}


/**
 * 开始拖拽
 */
function startDrag(e) {
  // 忽略按钮点击
  if (e.target.classList.contains('icon-btn')) return;
  
  uiState.isDragging = true;
  elements.panel.classList.add('dragging');
  
  const rect = elements.panel.getBoundingClientRect();
  uiState.dragOffset = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  
  e.preventDefault();
}

/**
 * 拖拽中
 */
function drag(e) {
  if (!uiState.isDragging) return;
  
  const x = e.clientX - uiState.dragOffset.x;
  const y = e.clientY - uiState.dragOffset.y;
  
  // 边界检查
  const maxX = window.innerWidth - elements.panel.offsetWidth;
  const maxY = window.innerHeight - elements.panel.offsetHeight;
  
  const boundedX = Math.max(0, Math.min(x, maxX));
  const boundedY = Math.max(0, Math.min(y, maxY));
  
  updatePanelPosition(boundedX, boundedY);
}

/**
 * 结束拖拽
 */
function endDrag() {
  if (!uiState.isDragging) return;
  
  uiState.isDragging = false;
  elements.panel.classList.remove('dragging');
  
  // 保存位置
  saveUIPosition();
}

/**
 * 更新面板位置
 */
function updatePanelPosition(x, y) {
  elements.panel.style.left = x + 'px';
  elements.panel.style.top = y + 'px';
  elements.panel.style.right = 'auto';
  
  // 同步更新最小化图标位置
  elements.minimizedIcon.style.left = x + 'px';
  elements.minimizedIcon.style.top = y + 'px';
  elements.minimizedIcon.style.right = 'auto';
  
  uiState.position = { x, y };
}

/**
 * 保存 UI 位置到 storage
 */
function saveUIPosition() {
  if (uiState.position.x !== null) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({
          [CONFIG.STORAGE_KEY_POSITION]: uiState.position
        });
      } else {
        localStorage.setItem(CONFIG.STORAGE_KEY_POSITION, JSON.stringify(uiState.position));
      }
    } catch (e) {
      console.error('保存位置失败:', e);
    }
  }
}

/**
 * 恢复 UI 状态
 */
function restoreUIState() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([CONFIG.STORAGE_KEY_POSITION, CONFIG.STORAGE_KEY_MINIMIZED], (result) => {
        if (result[CONFIG.STORAGE_KEY_POSITION]) {
          const pos = result[CONFIG.STORAGE_KEY_POSITION];
          updatePanelPosition(pos.x, pos.y);
        }
        if (result[CONFIG.STORAGE_KEY_MINIMIZED]) {
          minimizePanel();
        }
      });
    } else {
      const savedPos = localStorage.getItem(CONFIG.STORAGE_KEY_POSITION);
      if (savedPos) {
        const pos = JSON.parse(savedPos);
        updatePanelPosition(pos.x, pos.y);
      }
      const savedMinimized = localStorage.getItem(CONFIG.STORAGE_KEY_MINIMIZED);
      if (savedMinimized === 'true') {
        minimizePanel();
      }
    }
  } catch (e) {
    console.error('恢复状态失败:', e);
  }
}

/**
 * 初始化按钮事件
 */
function initButtonEvents() {
  // 最小化/展开按钮
  elements.minimizeBtn.addEventListener('click', minimizePanel);
  elements.expandBtn.addEventListener('click', expandPanel);
  elements.minimizedIcon.addEventListener('click', expandPanel);
  
  // 开始/停止按钮
  elements.startBtn.addEventListener('click', handleStart);
  elements.stopBtn.addEventListener('click', handleStop);
  
  // 清除日志按钮
  elements.clearLogBtn.addEventListener('click', clearLogs);
}

/**
 * 最小化面板
 */
function minimizePanel() {
  uiState.isMinimized = true;
  elements.panel.classList.add('hidden');
  elements.minimizedIcon.classList.remove('hidden');
  
  // 保存最小化状态
  saveMinimizedState(true);
}

/**
 * 展开面板
 */
function expandPanel() {
  uiState.isMinimized = false;
  elements.panel.classList.remove('hidden');
  elements.minimizedIcon.classList.add('hidden');
  
  // 保存最小化状态
  saveMinimizedState(false);
}

/**
 * 保存最小化状态
 */
function saveMinimizedState(isMinimized) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEY_MINIMIZED]: isMinimized
      });
    } else {
      localStorage.setItem(CONFIG.STORAGE_KEY_MINIMIZED, String(isMinimized));
    }
  } catch (e) {
    console.error('保存最小化状态失败:', e);
  }
}


/**
 * 处理开始按钮点击
 */
function handleStart() {
  const keyword = elements.keywordInput.value.trim();
  
  if (!keyword) {
    addLog('请输入搜索关键词', 'warning');
    elements.keywordInput.focus();
    return;
  }
  
  // 更新按钮状态
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  elements.keywordInput.disabled = true;
  
  // 更新状态显示
  setStatus('running');
  
  // 发送消息到 background
  sendMessage({
    type: 'START',
    payload: { keyword }
  });
  
  addLog(`开始搜索: "${keyword}"`, 'info');
}

/**
 * 处理停止按钮点击
 */
function handleStop() {
  // 更新按钮状态
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.keywordInput.disabled = false;
  
  // 更新状态显示
  setStatus('idle');
  
  // 发送消息到 background
  sendMessage({
    type: 'STOP',
    payload: {}
  });
  
  addLog('已停止任务', 'warning');
}

/**
 * 设置状态显示
 * @param {'idle' | 'running' | 'paused' | 'error'} status
 */
function setStatus(status) {
  const statusMap = {
    idle: { text: '空闲', class: 'status-idle' },
    running: { text: '运行中', class: 'status-running' },
    paused: { text: '已暂停', class: 'status-paused' },
    error: { text: '错误', class: 'status-error' }
  };
  
  const statusInfo = statusMap[status] || statusMap.idle;
  
  elements.statusText.textContent = statusInfo.text;
  elements.statusText.className = 'status-text ' + statusInfo.class;
}

/**
 * 添加日志条目
 * @param {string} message - 日志消息
 * @param {'info' | 'success' | 'error' | 'warning'} type - 日志类型
 */
function addLog(message, type = 'info') {
  const timestamp = formatTimestamp(new Date());
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span>${escapeHtml(message)}`;
  
  elements.logArea.appendChild(logEntry);
  
  // 限制日志条目数量
  enforceLogLimit();
  
  // 自动滚动到底部
  scrollToBottom();
}

/**
 * 格式化时间戳
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * HTML 转义
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 限制日志条目数量
 */
function enforceLogLimit() {
  const entries = elements.logArea.children;
  while (entries.length > CONFIG.MAX_LOG_ENTRIES) {
    entries[0].remove();
  }
}

/**
 * 自动滚动到底部
 */
function scrollToBottom() {
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

/**
 * 清除所有日志
 */
function clearLogs() {
  elements.logArea.innerHTML = '';
  addLog('日志已清除', 'info');
}

/**
 * 发送消息到 background
 * @param {Object} message
 */
function sendMessage(message) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(message);
    }
  } catch (e) {
    console.error('发送消息失败:', e);
  }
}

/**
 * 监听来自 background 的消息
 */
function initMessageListener() {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message);
      sendResponse({ received: true });
    });
  }
}

/**
 * 处理接收到的消息
 * @param {Object} message
 */
function handleMessage(message) {
  switch (message.type) {
    case 'LOG':
      // 支持 logType 和 type 两种字段名 (兼容 background.js 和 content.js)
      addLog(message.payload.message, message.payload.logType || message.payload.type || 'info');
      break;
    case 'STATE_UPDATE':
      handleStateUpdate(message.payload);
      break;
    case 'TASK_COMPLETE':
      handleTaskComplete();
      break;
  }
}

/**
 * 处理状态更新
 * @param {Object} state
 */
function handleStateUpdate(state) {
  if (state.isRunning !== undefined) {
    if (state.isRunning) {
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      elements.keywordInput.disabled = true;
      setStatus('running');
    } else {
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
      elements.keywordInput.disabled = false;
      setStatus('idle');
    }
  }
}

/**
 * 处理任务完成
 */
function handleTaskComplete() {
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.keywordInput.disabled = false;
  setStatus('idle');
  addLog('任务已完成', 'success');
}

// 导出函数供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addLog,
    clearLogs,
    enforceLogLimit,
    formatTimestamp,
    escapeHtml,
    CONFIG
  };
}

// 页面加载完成后初始化
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initUI();
      initMessageListener();
    });
  } else {
    initUI();
    initMessageListener();
  }
}
