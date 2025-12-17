/**
 * UI Component Tests
 * **Feature: shopee-auto-cart-extension, Property 2: Log Entry Consistency**
 * **Validates: Requirements 6.1, 6.4**
 */

const fc = require('fast-check');

// 模拟 DOM 环境
const setupDOM = () => {
  document.body.innerHTML = `
    <div id="shopee-auto-cart-panel" class="floating-panel">
      <div class="panel-header" id="panel-header">
        <span class="panel-title">🛒 Shopee Auto Cart</span>
        <div class="header-buttons">
          <button id="minimize-btn" class="icon-btn">−</button>
          <button id="expand-btn" class="icon-btn hidden">+</button>
        </div>
      </div>
      <div class="panel-content" id="panel-content">
        <div class="input-group">
          <input type="text" id="keyword-input" placeholder="输入商品关键词...">
        </div>
        <div class="button-group">
          <button id="start-btn" class="btn btn-primary">▶ 开始</button>
          <button id="stop-btn" class="btn btn-danger" disabled>■ 停止</button>
        </div>
        <div class="status-bar">
          <span id="status-text" class="status-text status-idle">空闲</span>
        </div>
        <div class="log-section">
          <button id="clear-log-btn" class="btn-small">清除</button>
          <div id="log-area" class="log-area"></div>
        </div>
      </div>
    </div>
    <div id="minimized-icon" class="minimized-icon hidden"></div>
  `;
};

// 日志管理模块 - 独立实现用于测试
const LogManager = {
  MAX_LOG_ENTRIES: 100,
  
  formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  
  createLogEntry(message, type, logArea) {
    const timestamp = this.formatTimestamp(new Date());
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span>${this.escapeHtml(message)}`;
    logArea.appendChild(logEntry);
    return { timestamp, message, type };
  },
  
  enforceLogLimit(logArea) {
    const entries = logArea.children;
    while (entries.length > this.MAX_LOG_ENTRIES) {
      entries[0].remove();
    }
  },
  
  addLog(message, type, logArea) {
    const entry = this.createLogEntry(message, type, logArea);
    this.enforceLogLimit(logArea);
    return entry;
  },
  
  clearLogs(logArea) {
    logArea.innerHTML = '';
  }
};

describe('UI Component Tests', () => {
  let logArea;
  
  beforeEach(() => {
    setupDOM();
    logArea = document.getElementById('log-area');
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Log Entry Formatting', () => {
    test('formatTimestamp returns HH:MM:SS format', () => {
      const date = new Date(2024, 0, 1, 14, 30, 45);
      const result = LogManager.formatTimestamp(date);
      expect(result).toBe('14:30:45');
    });
    
    test('formatTimestamp pads single digits', () => {
      const date = new Date(2024, 0, 1, 9, 5, 3);
      const result = LogManager.formatTimestamp(date);
      expect(result).toBe('09:05:03');
    });
    
    test('escapeHtml escapes special characters', () => {
      const result = LogManager.escapeHtml('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
    });
  });

  describe('Log Entry Creation', () => {
    test('addLog creates entry with timestamp', () => {
      const entry = LogManager.addLog('Test message', 'info', logArea);
      
      expect(entry.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(entry.message).toBe('Test message');
      expect(entry.type).toBe('info');
    });
    
    test('addLog appends entry to log area', () => {
      LogManager.addLog('Test message', 'info', logArea);
      
      expect(logArea.children.length).toBe(1);
      expect(logArea.children[0].classList.contains('log-entry')).toBe(true);
      expect(logArea.children[0].classList.contains('log-info')).toBe(true);
    });
    
    test('addLog supports different log types', () => {
      const types = ['info', 'success', 'warning', 'error'];
      
      types.forEach(type => {
        LogManager.addLog(`${type} message`, type, logArea);
      });
      
      expect(logArea.children.length).toBe(4);
      types.forEach((type, index) => {
        expect(logArea.children[index].classList.contains(`log-${type}`)).toBe(true);
      });
    });
  });


  describe('Log Entry Limit', () => {
    test('enforceLogLimit removes oldest entries when exceeding limit', () => {
      // 添加超过限制的日志
      for (let i = 0; i < 105; i++) {
        LogManager.addLog(`Message ${i}`, 'info', logArea);
      }
      
      expect(logArea.children.length).toBe(100);
    });
    
    test('enforceLogLimit keeps most recent entries', () => {
      for (let i = 0; i < 105; i++) {
        LogManager.addLog(`Message ${i}`, 'info', logArea);
      }
      
      // 最后一条应该是 Message 104
      const lastEntry = logArea.children[99];
      expect(lastEntry.textContent).toContain('Message 104');
      
      // 第一条应该是 Message 5 (0-4 被移除)
      const firstEntry = logArea.children[0];
      expect(firstEntry.textContent).toContain('Message 5');
    });
  });

  describe('Clear Logs', () => {
    test('clearLogs removes all entries', () => {
      LogManager.addLog('Message 1', 'info', logArea);
      LogManager.addLog('Message 2', 'success', logArea);
      LogManager.addLog('Message 3', 'error', logArea);
      
      expect(logArea.children.length).toBe(3);
      
      LogManager.clearLogs(logArea);
      
      expect(logArea.children.length).toBe(0);
    });
  });

  /**
   * Property-Based Tests
   * **Feature: shopee-auto-cart-extension, Property 2: Log Entry Consistency**
   * **Validates: Requirements 6.1, 6.4**
   */
  describe('Property-Based Tests: Log Entry Consistency', () => {
    
    /**
     * Property 2: Log Entry Consistency
     * *For any* operation performed by the Extension, there SHALL exist a corresponding 
     * log entry with timestamp.
     * **Validates: Requirements 6.1**
     */
    test('Property 2: Every log operation creates an entry with valid timestamp', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom('info', 'success', 'warning', 'error'),
          (message, type) => {
            // 清空日志区域
            logArea.innerHTML = '';
            
            // 添加日志
            const entry = LogManager.addLog(message, type, logArea);
            
            // 验证返回的条目包含时间戳
            expect(entry.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
            
            // 验证 DOM 中存在对应的日志条目
            expect(logArea.children.length).toBeGreaterThan(0);
            
            // 验证日志条目包含时间戳元素
            const lastEntry = logArea.lastElementChild;
            const timestampSpan = lastEntry.querySelector('.timestamp');
            expect(timestampSpan).not.toBeNull();
            expect(timestampSpan.textContent).toMatch(/^\[\d{2}:\d{2}:\d{2}\]$/);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2 (continued): Log entries maintain correct type classification
     * **Validates: Requirements 6.1**
     */
    test('Property 2: Log entries have correct type classification', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.constantFrom('info', 'success', 'warning', 'error'),
          (message, type) => {
            logArea.innerHTML = '';
            
            LogManager.addLog(message, type, logArea);
            
            const lastEntry = logArea.lastElementChild;
            expect(lastEntry.classList.contains(`log-${type}`)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Log limit enforcement
     * *For any* number of log entries added, the log area SHALL maintain at most 100 entries.
     * **Validates: Requirements 6.4**
     */
    test('Property: Log area never exceeds MAX_LOG_ENTRIES', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          (numEntries) => {
            logArea.innerHTML = '';
            
            for (let i = 0; i < numEntries; i++) {
              LogManager.addLog(`Message ${i}`, 'info', logArea);
            }
            
            expect(logArea.children.length).toBeLessThanOrEqual(LogManager.MAX_LOG_ENTRIES);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Oldest entries are removed first (FIFO)
     * **Validates: Requirements 6.4**
     */
    test('Property: When limit exceeded, oldest entries are removed first', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 150 }),
          (numEntries) => {
            logArea.innerHTML = '';
            
            for (let i = 0; i < numEntries; i++) {
              LogManager.addLog(`Msg-${i}`, 'info', logArea);
            }
            
            // 验证最新的条目仍然存在
            const lastEntry = logArea.lastElementChild;
            expect(lastEntry.textContent).toContain(`Msg-${numEntries - 1}`);
            
            // 验证最旧的被保留的条目
            const expectedFirstIndex = numEntries - LogManager.MAX_LOG_ENTRIES;
            const firstEntry = logArea.firstElementChild;
            expect(firstEntry.textContent).toContain(`Msg-${expectedFirstIndex}`);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
