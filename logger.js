/**
 * Shopee Auto Cart Extension - 日志管理模块
 * Requirements: 6.1, 6.3, 6.4
 * 
 * 提供统一的日志管理功能:
 * - 带时间戳的日志格式化
 * - 日志类型 (info/success/error/warning)
 * - 日志条目限制 (最多100条)
 */

// ============================================
// 配置常量
// ============================================

const LOG_CONFIG = {
  MAX_LOG_ENTRIES: 100,
  LOG_TYPES: ['info', 'success', 'error', 'warning']
};

// ============================================
// 日志类型枚举
// ============================================

/**
 * 日志类型
 * @readonly
 * @enum {string}
 */
const LogType = {
  INFO: 'info',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning'
};

// ============================================
// 日志条目类
// ============================================

/**
 * 日志条目
 * @typedef {Object} LogEntry
 * @property {Date} timestamp - 时间戳
 * @property {string} message - 日志消息
 * @property {string} type - 日志类型
 * @property {string} formattedTimestamp - 格式化的时间戳字符串
 */

/**
 * 创建日志条目
 * Requirements: 6.1 - 任何操作执行时都要添加带时间戳的日志
 * @param {string} message - 日志消息
 * @param {string} type - 日志类型
 * @returns {LogEntry}
 */
function createLogEntry(message, type = LogType.INFO) {
  const timestamp = new Date();
  const validType = LOG_CONFIG.LOG_TYPES.includes(type) ? type : LogType.INFO;
  
  return {
    timestamp,
    message,
    type: validType,
    formattedTimestamp: formatTimestamp(timestamp)
  };
}

// ============================================
// 时间戳格式化
// ============================================

/**
 * 格式化时间戳为 HH:MM:SS 格式
 * Requirements: 6.1 - 带时间戳的日志格式化
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的时间字符串
 */
function formatTimestamp(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 格式化完整时间戳 (包含日期)
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的完整时间字符串
 */
function formatFullTimestamp(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTimestamp(date)}`;
}

// ============================================
// HTML 转义
// ============================================

/**
 * HTML 转义，防止 XSS 攻击
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, char => escapeMap[char]);
}

// ============================================
// 日志存储管理
// ============================================

/**
 * 日志存储类
 * Requirements: 6.4 - 日志区域满时保持最近100条，移除旧条目
 */
class LogStore {
  constructor(maxEntries = LOG_CONFIG.MAX_LOG_ENTRIES) {
    this.maxEntries = maxEntries;
    this.entries = [];
  }
  
  /**
   * 添加日志条目
   * @param {string} message - 日志消息
   * @param {string} type - 日志类型
   * @returns {LogEntry} 创建的日志条目
   */
  add(message, type = LogType.INFO) {
    const entry = createLogEntry(message, type);
    this.entries.push(entry);
    this.enforceLimit();
    return entry;
  }
  
  /**
   * 强制执行日志条目限制
   * Requirements: 6.4 - 保持最近100条，移除旧条目
   */
  enforceLimit() {
    while (this.entries.length > this.maxEntries) {
      this.entries.shift(); // 移除最旧的条目
    }
  }
  
  /**
   * 清除所有日志
   * Requirements: 6.5 - 用户点击清除日志时移除所有日志条目
   */
  clear() {
    this.entries = [];
  }
  
  /**
   * 获取所有日志条目
   * @returns {LogEntry[]}
   */
  getAll() {
    return [...this.entries];
  }
  
  /**
   * 获取日志条目数量
   * @returns {number}
   */
  get count() {
    return this.entries.length;
  }
  
  /**
   * 获取最新的日志条目
   * @param {number} n - 获取的条目数量
   * @returns {LogEntry[]}
   */
  getLatest(n = 10) {
    return this.entries.slice(-n);
  }
}

// ============================================
// 日志格式化输出
// ============================================

/**
 * 格式化日志条目为字符串
 * @param {LogEntry} entry - 日志条目
 * @returns {string}
 */
function formatLogEntry(entry) {
  return `[${entry.formattedTimestamp}] [${entry.type.toUpperCase()}] ${entry.message}`;
}

/**
 * 格式化日志条目为 HTML
 * @param {LogEntry} entry - 日志条目
 * @returns {string}
 */
function formatLogEntryHtml(entry) {
  const escapedMessage = escapeHtml(entry.message);
  return `<span class="timestamp">[${entry.formattedTimestamp}]</span>${escapedMessage}`;
}

/**
 * 获取日志类型对应的 CSS 类名
 * @param {string} type - 日志类型
 * @returns {string}
 */
function getLogTypeClass(type) {
  return `log-${type}`;
}

// ============================================
// 日志管理器 (单例)
// ============================================

/**
 * 日志管理器
 * 提供统一的日志管理接口
 */
const LogManager = {
  store: new LogStore(),
  
  /**
   * 添加信息日志
   * @param {string} message - 日志消息
   * @returns {LogEntry}
   */
  info(message) {
    return this.store.add(message, LogType.INFO);
  },
  
  /**
   * 添加成功日志
   * @param {string} message - 日志消息
   * @returns {LogEntry}
   */
  success(message) {
    return this.store.add(message, LogType.SUCCESS);
  },
  
  /**
   * 添加错误日志
   * Requirements: 6.3 - 错误发生时记录描述性错误消息
   * @param {string} message - 日志消息
   * @returns {LogEntry}
   */
  error(message) {
    return this.store.add(message, LogType.ERROR);
  },
  
  /**
   * 添加警告日志
   * @param {string} message - 日志消息
   * @returns {LogEntry}
   */
  warning(message) {
    return this.store.add(message, LogType.WARNING);
  },
  
  /**
   * 添加日志 (通用方法)
   * @param {string} message - 日志消息
   * @param {string} type - 日志类型
   * @returns {LogEntry}
   */
  log(message, type = LogType.INFO) {
    return this.store.add(message, type);
  },
  
  /**
   * 清除所有日志
   */
  clear() {
    this.store.clear();
  },
  
  /**
   * 获取所有日志
   * @returns {LogEntry[]}
   */
  getAll() {
    return this.store.getAll();
  },
  
  /**
   * 获取日志数量
   * @returns {number}
   */
  get count() {
    return this.store.count;
  }
};

// ============================================
// 导出
// ============================================

// CommonJS 导出 (用于 Node.js 测试环境)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LOG_CONFIG,
    LogType,
    LogStore,
    LogManager,
    createLogEntry,
    formatTimestamp,
    formatFullTimestamp,
    escapeHtml,
    formatLogEntry,
    formatLogEntryHtml,
    getLogTypeClass
  };
}

// ES Module 导出 (用于浏览器环境)
// export { LOG_CONFIG, LogType, LogStore, LogManager, createLogEntry, formatTimestamp, formatFullTimestamp, escapeHtml, formatLogEntry, formatLogEntryHtml, getLogTypeClass };
