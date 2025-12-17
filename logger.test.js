/**
 * Logger Module Tests
 * Requirements: 6.1, 6.3, 6.4
 */

const fc = require('fast-check');
const {
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
} = require('./logger');

// ============================================
// 单元测试
// ============================================

describe('Logger Module', () => {
  
  describe('formatTimestamp', () => {
    test('formats time as HH:MM:SS', () => {
      const date = new Date(2024, 0, 1, 14, 30, 45);
      expect(formatTimestamp(date)).toBe('14:30:45');
    });
    
    test('pads single digits with zeros', () => {
      const date = new Date(2024, 0, 1, 9, 5, 3);
      expect(formatTimestamp(date)).toBe('09:05:03');
    });
    
    test('handles midnight correctly', () => {
      const date = new Date(2024, 0, 1, 0, 0, 0);
      expect(formatTimestamp(date)).toBe('00:00:00');
    });
    
    test('handles end of day correctly', () => {
      const date = new Date(2024, 0, 1, 23, 59, 59);
      expect(formatTimestamp(date)).toBe('23:59:59');
    });
    
    test('returns current time for invalid date', () => {
      const result = formatTimestamp(new Date('invalid'));
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('formatFullTimestamp', () => {
    test('formats date and time correctly', () => {
      const date = new Date(2024, 5, 15, 14, 30, 45);
      expect(formatFullTimestamp(date)).toBe('2024-06-15 14:30:45');
    });
    
    test('pads month and day with zeros', () => {
      const date = new Date(2024, 0, 5, 9, 5, 3);
      expect(formatFullTimestamp(date)).toBe('2024-01-05 09:05:03');
    });
  });

  describe('escapeHtml', () => {
    test('escapes < and >', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });
    
    test('escapes &', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });
    
    test('escapes quotes', () => {
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
      expect(escapeHtml("'test'")).toBe('&#039;test&#039;');
    });
    
    test('handles non-string input', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(null)).toBe('null');
    });
    
    test('returns empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('LogType', () => {
    test('has all required types', () => {
      expect(LogType.INFO).toBe('info');
      expect(LogType.SUCCESS).toBe('success');
      expect(LogType.ERROR).toBe('error');
      expect(LogType.WARNING).toBe('warning');
    });
  });

  describe('createLogEntry', () => {
    test('creates entry with timestamp', () => {
      const entry = createLogEntry('Test message', LogType.INFO);
      
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.message).toBe('Test message');
      expect(entry.type).toBe('info');
      expect(entry.formattedTimestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
    
    test('defaults to INFO type', () => {
      const entry = createLogEntry('Test message');
      expect(entry.type).toBe('info');
    });
    
    test('validates log type', () => {
      const entry = createLogEntry('Test', 'invalid-type');
      expect(entry.type).toBe('info');
    });
    
    test('accepts all valid log types', () => {
      ['info', 'success', 'error', 'warning'].forEach(type => {
        const entry = createLogEntry('Test', type);
        expect(entry.type).toBe(type);
      });
    });
  });

  describe('LogStore', () => {
    let store;
    
    beforeEach(() => {
      store = new LogStore();
    });
    
    test('starts empty', () => {
      expect(store.count).toBe(0);
      expect(store.getAll()).toEqual([]);
    });
    
    test('adds entries', () => {
      store.add('Message 1', LogType.INFO);
      store.add('Message 2', LogType.SUCCESS);
      
      expect(store.count).toBe(2);
    });
    
    test('returns created entry on add', () => {
      const entry = store.add('Test', LogType.ERROR);
      
      expect(entry.message).toBe('Test');
      expect(entry.type).toBe('error');
    });
    
    test('enforces max entries limit', () => {
      const customStore = new LogStore(5);
      
      for (let i = 0; i < 10; i++) {
        customStore.add(`Message ${i}`, LogType.INFO);
      }
      
      expect(customStore.count).toBe(5);
    });
    
    test('removes oldest entries when limit exceeded', () => {
      const customStore = new LogStore(3);
      
      customStore.add('First', LogType.INFO);
      customStore.add('Second', LogType.INFO);
      customStore.add('Third', LogType.INFO);
      customStore.add('Fourth', LogType.INFO);
      
      const entries = customStore.getAll();
      expect(entries[0].message).toBe('Second');
      expect(entries[2].message).toBe('Fourth');
    });
    
    test('clears all entries', () => {
      store.add('Message 1', LogType.INFO);
      store.add('Message 2', LogType.INFO);
      
      store.clear();
      
      expect(store.count).toBe(0);
    });
    
    test('getLatest returns most recent entries', () => {
      for (let i = 0; i < 10; i++) {
        store.add(`Message ${i}`, LogType.INFO);
      }
      
      const latest = store.getLatest(3);
      
      expect(latest.length).toBe(3);
      expect(latest[0].message).toBe('Message 7');
      expect(latest[2].message).toBe('Message 9');
    });
    
    test('uses default max entries from config', () => {
      expect(store.maxEntries).toBe(LOG_CONFIG.MAX_LOG_ENTRIES);
      expect(store.maxEntries).toBe(100);
    });
  });

  describe('LogManager', () => {
    beforeEach(() => {
      LogManager.clear();
    });
    
    test('info() adds info log', () => {
      const entry = LogManager.info('Info message');
      expect(entry.type).toBe('info');
    });
    
    test('success() adds success log', () => {
      const entry = LogManager.success('Success message');
      expect(entry.type).toBe('success');
    });
    
    test('error() adds error log', () => {
      const entry = LogManager.error('Error message');
      expect(entry.type).toBe('error');
    });
    
    test('warning() adds warning log', () => {
      const entry = LogManager.warning('Warning message');
      expect(entry.type).toBe('warning');
    });
    
    test('log() adds log with specified type', () => {
      const entry = LogManager.log('Test', LogType.SUCCESS);
      expect(entry.type).toBe('success');
    });
    
    test('clear() removes all logs', () => {
      LogManager.info('Test 1');
      LogManager.info('Test 2');
      
      LogManager.clear();
      
      expect(LogManager.count).toBe(0);
    });
    
    test('getAll() returns all logs', () => {
      LogManager.info('Test 1');
      LogManager.error('Test 2');
      
      const logs = LogManager.getAll();
      
      expect(logs.length).toBe(2);
    });
  });

  describe('formatLogEntry', () => {
    test('formats entry as string', () => {
      const entry = createLogEntry('Test message', LogType.INFO);
      const formatted = formatLogEntry(entry);
      
      expect(formatted).toMatch(/^\[\d{2}:\d{2}:\d{2}\] \[INFO\] Test message$/);
    });
    
    test('uppercases log type', () => {
      const entry = createLogEntry('Test', LogType.ERROR);
      const formatted = formatLogEntry(entry);
      
      expect(formatted).toContain('[ERROR]');
    });
  });

  describe('formatLogEntryHtml', () => {
    test('formats entry as HTML', () => {
      const entry = createLogEntry('Test message', LogType.INFO);
      const html = formatLogEntryHtml(entry);
      
      expect(html).toContain('<span class="timestamp">');
      expect(html).toContain('Test message');
    });
    
    test('escapes HTML in message', () => {
      const entry = createLogEntry('<script>alert("xss")</script>', LogType.INFO);
      const html = formatLogEntryHtml(entry);
      
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('getLogTypeClass', () => {
    test('returns correct class for each type', () => {
      expect(getLogTypeClass('info')).toBe('log-info');
      expect(getLogTypeClass('success')).toBe('log-success');
      expect(getLogTypeClass('error')).toBe('log-error');
      expect(getLogTypeClass('warning')).toBe('log-warning');
    });
  });
});

// ============================================
// Property-Based Tests
// Requirements: 6.1, 6.4
// ============================================

describe('Logger Property-Based Tests', () => {
  
  /**
   * Property: Timestamp format consistency
   * *For any* Date object, formatTimestamp SHALL return a string in HH:MM:SS format
   * **Validates: Requirements 6.1**
   */
  describe('Timestamp Format Properties', () => {
    test('Property: formatTimestamp always returns HH:MM:SS format', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 0, 1) }),
          (date) => {
            const result = formatTimestamp(date);
            
            // 验证格式
            expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
            
            // 验证值范围
            const [hours, minutes, seconds] = result.split(':').map(Number);
            expect(hours).toBeGreaterThanOrEqual(0);
            expect(hours).toBeLessThanOrEqual(23);
            expect(minutes).toBeGreaterThanOrEqual(0);
            expect(minutes).toBeLessThanOrEqual(59);
            expect(seconds).toBeGreaterThanOrEqual(0);
            expect(seconds).toBeLessThanOrEqual(59);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Log entry creation consistency
   * *For any* message and valid type, createLogEntry SHALL create an entry with timestamp
   * **Validates: Requirements 6.1**
   */
  describe('Log Entry Creation Properties', () => {
    test('Property: Every log entry has a valid timestamp', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.constantFrom('info', 'success', 'error', 'warning'),
          (message, type) => {
            const entry = createLogEntry(message, type);
            
            // 验证时间戳存在且有效
            expect(entry.timestamp).toBeInstanceOf(Date);
            expect(isNaN(entry.timestamp.getTime())).toBe(false);
            
            // 验证格式化时间戳
            expect(entry.formattedTimestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
            
            // 验证消息和类型
            expect(entry.message).toBe(message);
            expect(entry.type).toBe(type);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Invalid log types default to INFO', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['info', 'success', 'error', 'warning'].includes(s)),
          (invalidType) => {
            const entry = createLogEntry('Test', invalidType);
            expect(entry.type).toBe('info');
            return entry.type === 'info';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Log store limit enforcement
   * *For any* number of entries added, the store SHALL maintain at most MAX_LOG_ENTRIES
   * **Validates: Requirements 6.4**
   */
  describe('Log Store Limit Properties', () => {
    test('Property: Log store never exceeds max entries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 300 }),
          (numEntries) => {
            const store = new LogStore();
            
            for (let i = 0; i < numEntries; i++) {
              store.add(`Message ${i}`, LogType.INFO);
            }
            
            expect(store.count).toBeLessThanOrEqual(LOG_CONFIG.MAX_LOG_ENTRIES);
            
            return store.count <= LOG_CONFIG.MAX_LOG_ENTRIES;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Custom max entries is respected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 100 }),
          (maxEntries, numToAdd) => {
            const store = new LogStore(maxEntries);
            
            for (let i = 0; i < numToAdd; i++) {
              store.add(`Message ${i}`, LogType.INFO);
            }
            
            expect(store.count).toBeLessThanOrEqual(maxEntries);
            
            return store.count <= maxEntries;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Oldest entries are removed first (FIFO)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 200 }),
          (numEntries) => {
            const store = new LogStore();
            
            for (let i = 0; i < numEntries; i++) {
              store.add(`Msg-${i}`, LogType.INFO);
            }
            
            const entries = store.getAll();
            
            // 验证最新的条目存在
            expect(entries[entries.length - 1].message).toBe(`Msg-${numEntries - 1}`);
            
            // 验证最旧的被保留的条目
            const expectedFirstIndex = numEntries - LOG_CONFIG.MAX_LOG_ENTRIES;
            expect(entries[0].message).toBe(`Msg-${expectedFirstIndex}`);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: HTML escaping
   * *For any* string, escapeHtml SHALL prevent XSS by escaping special characters
   * **Validates: Requirements 6.1**
   */
  describe('HTML Escaping Properties', () => {
    test('Property: escapeHtml never contains raw HTML tags', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }),
          (input) => {
            const escaped = escapeHtml(input);
            
            // 验证不包含未转义的 < 或 >
            // 只有当原始输入包含这些字符时才检查
            if (input.includes('<')) {
              expect(escaped).not.toMatch(/<(?!&)/);
            }
            if (input.includes('>')) {
              expect(escaped).not.toMatch(/(?<!&)>/);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: escapeHtml is idempotent for safe strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter(s => !/[&<>"']/.test(s)),
          (safeString) => {
            const escaped = escapeHtml(safeString);
            expect(escaped).toBe(safeString);
            return escaped === safeString;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: LogManager operations
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('LogManager Properties', () => {
    beforeEach(() => {
      LogManager.clear();
    });

    test('Property: All log methods create entries with correct type', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (message) => {
            LogManager.clear();
            
            const infoEntry = LogManager.info(message);
            const successEntry = LogManager.success(message);
            const errorEntry = LogManager.error(message);
            const warningEntry = LogManager.warning(message);
            
            expect(infoEntry.type).toBe('info');
            expect(successEntry.type).toBe('success');
            expect(errorEntry.type).toBe('error');
            expect(warningEntry.type).toBe('warning');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: LogManager count matches actual entries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          (numEntries) => {
            LogManager.clear();
            
            for (let i = 0; i < numEntries; i++) {
              LogManager.info(`Message ${i}`);
            }
            
            expect(LogManager.count).toBe(numEntries);
            expect(LogManager.getAll().length).toBe(numEntries);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
