/**
 * Content Script Tests
 * **Feature: shopee-auto-cart-extension, Property 1: Cart Addition Limit**
 * **Validates: Requirements 2.3**
 */

const fc = require('fast-check');

// ============================================
// 购物车添加限制逻辑 - 独立实现用于测试
// ============================================

const CartManager = {
  MAX_CARTS_PER_PRODUCT: 10,
  
  /**
   * 计算应该添加到购物车的数量
   * 根据 Requirements 2.3: 每个商品最多添加10个到购物车
   * @param {number} variantCount - 商品规格数量
   * @returns {number} 应该添加的数量
   */
  calculateCartsToAdd(variantCount) {
    if (variantCount <= 0) {
      return 0;
    }
    return Math.min(variantCount, this.MAX_CARTS_PER_PRODUCT);
  },
  
  /**
   * 模拟添加规格到购物车的过程
   * @param {Array} variants - 规格列表
   * @param {Function} addToCartFn - 添加购物车函数 (返回 boolean)
   * @returns {number} 成功添加的数量
   */
  async processVariants(variants, addToCartFn) {
    let cartCount = 0;
    
    for (let i = 0; i < variants.length && cartCount < this.MAX_CARTS_PER_PRODUCT; i++) {
      const success = await addToCartFn(variants[i]);
      if (success) {
        cartCount++;
      }
    }
    
    return cartCount;
  },
  
  /**
   * 同步版本的规格处理 (用于测试)
   * @param {Array} variants - 规格列表
   * @param {Function} addToCartFn - 添加购物车函数 (返回 boolean)
   * @returns {number} 成功添加的数量
   */
  processVariantsSync(variants, addToCartFn) {
    let cartCount = 0;
    
    for (let i = 0; i < variants.length && cartCount < this.MAX_CARTS_PER_PRODUCT; i++) {
      const success = addToCartFn(variants[i]);
      if (success) {
        cartCount++;
      }
    }
    
    return cartCount;
  }
};

// ============================================
// 页面类型检测逻辑 - 独立实现用于测试
// ============================================

const PageDetector = {
  PageType: {
    SEARCH: 'search',
    PRODUCT: 'product',
    SHOP: 'shop',
    OTHER: 'other'
  },
  
  /**
   * 从 URL 检测页面类型
   * @param {string} url - 页面 URL
   * @returns {string} 页面类型
   */
  detectPageType(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // 搜索页面
      if (pathname.includes('/search') || urlObj.search.includes('keyword=')) {
        return this.PageType.SEARCH;
      }
      
      // 商品详情页
      if (pathname.match(/\/product\/\d+\/\d+/) || pathname.match(/-i\.\d+\.\d+/)) {
        return this.PageType.PRODUCT;
      }
      
      // 店铺页面
      if (pathname.match(/^\/shop\/\d+/)) {
        return this.PageType.SHOP;
      }
      
      return this.PageType.OTHER;
    } catch (e) {
      return this.PageType.OTHER;
    }
  },
  
  /**
   * 从 URL 提取商品 ID
   * @param {string} url - 商品 URL
   * @returns {string|null}
   */
  extractProductId(url) {
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
};

// ============================================
// 单元测试
// ============================================

describe('Content Script Tests', () => {
  
  describe('CartManager - calculateCartsToAdd', () => {
    test('returns 0 for 0 variants', () => {
      expect(CartManager.calculateCartsToAdd(0)).toBe(0);
    });
    
    test('returns 0 for negative variants', () => {
      expect(CartManager.calculateCartsToAdd(-5)).toBe(0);
    });
    
    test('returns variant count when less than limit', () => {
      expect(CartManager.calculateCartsToAdd(5)).toBe(5);
    });
    
    test('returns exactly 10 when variant count equals limit', () => {
      expect(CartManager.calculateCartsToAdd(10)).toBe(10);
    });
    
    test('returns exactly 10 when variant count exceeds limit', () => {
      expect(CartManager.calculateCartsToAdd(15)).toBe(10);
    });
  });

  describe('CartManager - processVariantsSync', () => {
    test('processes all variants when count is below limit', () => {
      const variants = ['red', 'blue', 'green'];
      const addToCart = jest.fn().mockReturnValue(true);
      
      const result = CartManager.processVariantsSync(variants, addToCart);
      
      expect(result).toBe(3);
      expect(addToCart).toHaveBeenCalledTimes(3);
    });
    
    test('stops at limit when variants exceed MAX_CARTS_PER_PRODUCT', () => {
      const variants = Array.from({ length: 15 }, (_, i) => `variant-${i}`);
      const addToCart = jest.fn().mockReturnValue(true);
      
      const result = CartManager.processVariantsSync(variants, addToCart);
      
      expect(result).toBe(10);
      expect(addToCart).toHaveBeenCalledTimes(10);
    });
    
    test('counts only successful additions', () => {
      const variants = ['v1', 'v2', 'v3', 'v4', 'v5'];
      // 模拟部分失败
      const addToCart = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      
      const result = CartManager.processVariantsSync(variants, addToCart);
      
      expect(result).toBe(3);
      expect(addToCart).toHaveBeenCalledTimes(5);
    });
  });

  describe('PageDetector - detectPageType', () => {
    test('detects search page', () => {
      expect(PageDetector.detectPageType('https://shopee.tw/search?keyword=test'))
        .toBe(PageDetector.PageType.SEARCH);
    });
    
    test('detects product page format 1', () => {
      expect(PageDetector.detectPageType('https://shopee.tw/product/123456/789012'))
        .toBe(PageDetector.PageType.PRODUCT);
    });
    
    test('detects product page format 2', () => {
      expect(PageDetector.detectPageType('https://shopee.tw/some-product-name-i.123456.789012'))
        .toBe(PageDetector.PageType.PRODUCT);
    });
    
    test('detects shop page', () => {
      expect(PageDetector.detectPageType('https://shopee.tw/shop/123456'))
        .toBe(PageDetector.PageType.SHOP);
    });
    
    test('returns OTHER for unknown pages', () => {
      expect(PageDetector.detectPageType('https://shopee.tw/'))
        .toBe(PageDetector.PageType.OTHER);
    });
  });

  describe('PageDetector - extractProductId', () => {
    test('extracts ID from format 1', () => {
      expect(PageDetector.extractProductId('https://shopee.tw/product/123/456'))
        .toBe('123_456');
    });
    
    test('extracts ID from format 2', () => {
      expect(PageDetector.extractProductId('https://shopee.tw/name-i.123.456'))
        .toBe('123_456');
    });
    
    test('returns null for invalid URL', () => {
      expect(PageDetector.extractProductId('https://shopee.tw/search'))
        .toBeNull();
    });
  });
});

// ============================================
// Property-Based Tests
// ============================================

describe('Property-Based Tests', () => {
  
  /**
   * **Feature: shopee-auto-cart-extension, Property 1: Cart Addition Limit**
   * *For any* product with N variants where N > 10, the Extension SHALL add exactly 10 items to cart and stop.
   * **Validates: Requirements 2.3**
   */
  describe('Property 1: Cart Addition Limit', () => {
    
    /**
     * Property 1a: For any product with N variants where N > 10, 
     * the Extension SHALL add exactly 10 items to cart and stop.
     */
    test('Property 1: Products with more than 10 variants add exactly 10 to cart', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 11, max: 100 }),
          (variantCount) => {
            const variants = Array.from({ length: variantCount }, (_, i) => `variant-${i}`);
            const addToCart = () => true; // 假设所有添加都成功
            
            const result = CartManager.processVariantsSync(variants, addToCart);
            
            // 验证: 添加数量必须正好是 10
            expect(result).toBe(10);
            
            return result === 10;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1b: For any product with N variants where N <= 10,
     * the Extension SHALL add all N items to cart.
     */
    test('Property 1: Products with 10 or fewer variants add all to cart', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (variantCount) => {
            const variants = Array.from({ length: variantCount }, (_, i) => `variant-${i}`);
            const addToCart = () => true;
            
            const result = CartManager.processVariantsSync(variants, addToCart);
            
            // 验证: 添加数量等于规格数量
            expect(result).toBe(variantCount);
            
            return result === variantCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1c: Cart count never exceeds MAX_CARTS_PER_PRODUCT
     */
    test('Property 1: Cart count never exceeds maximum limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }),
          (variantCount) => {
            const variants = Array.from({ length: variantCount }, (_, i) => `variant-${i}`);
            const addToCart = () => true;
            
            const result = CartManager.processVariantsSync(variants, addToCart);
            
            // 验证: 添加数量永远不超过限制
            expect(result).toBeLessThanOrEqual(CartManager.MAX_CARTS_PER_PRODUCT);
            
            return result <= CartManager.MAX_CARTS_PER_PRODUCT;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1d: With partial failures, cart count still respects limit
     */
    test('Property 1: Cart limit respected even with partial failures', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.float({ min: 0, max: 1 }),
          (variantCount, successRate) => {
            const variants = Array.from({ length: variantCount }, (_, i) => `variant-${i}`);
            
            // 模拟随机成功/失败
            let callCount = 0;
            const addToCart = () => {
              callCount++;
              return Math.random() < successRate;
            };
            
            const result = CartManager.processVariantsSync(variants, addToCart);
            
            // 验证: 添加数量永远不超过限制
            expect(result).toBeLessThanOrEqual(CartManager.MAX_CARTS_PER_PRODUCT);
            
            // 验证: 添加数量不超过规格数量
            expect(result).toBeLessThanOrEqual(variantCount);
            
            return result <= CartManager.MAX_CARTS_PER_PRODUCT && result <= variantCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1e: calculateCartsToAdd returns correct value
     */
    test('Property 1: calculateCartsToAdd returns min(variants, limit)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }),
          (variantCount) => {
            const result = CartManager.calculateCartsToAdd(variantCount);
            
            if (variantCount <= 0) {
              expect(result).toBe(0);
              return result === 0;
            }
            
            const expected = Math.min(variantCount, CartManager.MAX_CARTS_PER_PRODUCT);
            expect(result).toBe(expected);
            
            return result === expected;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Page Detection Properties
   */
  describe('Page Detection Properties', () => {
    
    test('Property: Search URLs are correctly identified', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (keyword) => {
            const url = `https://shopee.tw/search?keyword=${encodeURIComponent(keyword)}`;
            const result = PageDetector.detectPageType(url);
            
            expect(result).toBe(PageDetector.PageType.SEARCH);
            return result === PageDetector.PageType.SEARCH;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Product URLs with valid IDs are correctly identified', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }),
          fc.integer({ min: 1, max: 999999999 }),
          (shopId, productId) => {
            const url1 = `https://shopee.tw/product/${shopId}/${productId}`;
            const url2 = `https://shopee.tw/some-name-i.${shopId}.${productId}`;
            
            expect(PageDetector.detectPageType(url1)).toBe(PageDetector.PageType.PRODUCT);
            expect(PageDetector.detectPageType(url2)).toBe(PageDetector.PageType.PRODUCT);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Product ID extraction is consistent', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }),
          fc.integer({ min: 1, max: 999999999 }),
          (shopId, productId) => {
            const url1 = `https://shopee.tw/product/${shopId}/${productId}`;
            const url2 = `https://shopee.tw/name-i.${shopId}.${productId}`;
            
            const id1 = PageDetector.extractProductId(url1);
            const id2 = PageDetector.extractProductId(url2);
            
            // 两种格式应该提取出相同的 ID
            expect(id1).toBe(id2);
            expect(id1).toBe(`${shopId}_${productId}`);
            
            return id1 === id2;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================
// 错误恢复逻辑 - 独立实现用于测试
// Requirements: 7.1
// ============================================

const ErrorRecovery = {
  DEFAULT_RETRY_ATTEMPTS: 3,
  DEFAULT_RETRY_DELAY: 2000,
  
  /**
   * 带重试的操作执行 (同步版本用于测试)
   * Requirements: 7.1 - 操作失败时重试3次，间隔2秒
   * @param {Function} operation - 要执行的操作
   * @param {Object} options - 配置选项
   * @returns {Object} { success: boolean, attempts: number, result: any }
   */
  withRetrySync(operation, options = {}) {
    const {
      retries = this.DEFAULT_RETRY_ATTEMPTS
    } = options;
    
    let lastError;
    let attempts = 0;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      attempts = attempt;
      try {
        const result = operation();
        return { success: true, attempts, result };
      } catch (error) {
        lastError = error;
      }
    }
    
    return { success: false, attempts, error: lastError };
  },
  
  /**
   * 模拟元素等待重试逻辑 (同步版本用于测试)
   * @param {Function} findElement - 查找元素的函数
   * @param {Object} options - 配置选项
   * @returns {Object} { found: boolean, attempts: number }
   */
  waitForElementSync(findElement, options = {}) {
    const {
      retries = this.DEFAULT_RETRY_ATTEMPTS
    } = options;
    
    let attempts = 0;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      attempts = attempt;
      const element = findElement();
      if (element) {
        return { found: true, attempts, element };
      }
    }
    
    return { found: false, attempts };
  }
};

// ============================================
// Property 5: Error Recovery Tests
// **Feature: shopee-auto-cart-extension, Property 5: Error Recovery**
// **Validates: Requirements 7.1**
// ============================================

describe('Property 5: Error Recovery', () => {
  
  /**
   * Property 5a: For any failed operation, the Extension SHALL retry up to 
   * the configured retry limit (3 times) before proceeding.
   */
  test('Property 5: Operations retry exactly up to the configured limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // 配置的重试次数
        fc.integer({ min: 0, max: 20 }), // 操作在第几次成功 (0 = 永不成功)
        (retryLimit, successOnAttempt) => {
          let callCount = 0;
          
          const operation = () => {
            callCount++;
            if (successOnAttempt > 0 && callCount >= successOnAttempt) {
              return 'success';
            }
            throw new Error('Operation failed');
          };
          
          const result = ErrorRecovery.withRetrySync(operation, { retries: retryLimit });
          
          if (successOnAttempt > 0 && successOnAttempt <= retryLimit) {
            // 操作应该在重试限制内成功
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(successOnAttempt);
          } else {
            // 操作应该在达到重试限制后失败
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(retryLimit);
          }
          
          // 验证: 尝试次数永远不超过重试限制
          expect(result.attempts).toBeLessThanOrEqual(retryLimit);
          
          return result.attempts <= retryLimit;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5b: Default retry limit is 3 attempts
   */
  test('Property 5: Default retry limit is 3 attempts', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // 操作是否最终成功
        (willSucceed) => {
          let callCount = 0;
          
          const operation = () => {
            callCount++;
            if (willSucceed && callCount >= 3) {
              return 'success';
            }
            throw new Error('Operation failed');
          };
          
          const result = ErrorRecovery.withRetrySync(operation);
          
          // 验证: 默认重试次数为 3
          expect(result.attempts).toBeLessThanOrEqual(ErrorRecovery.DEFAULT_RETRY_ATTEMPTS);
          expect(ErrorRecovery.DEFAULT_RETRY_ATTEMPTS).toBe(3);
          
          return result.attempts <= 3;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5c: Element wait retries up to configured limit
   */
  test('Property 5: Element wait retries up to configured limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // 配置的重试次数
        fc.integer({ min: 0, max: 15 }), // 元素在第几次出现 (0 = 永不出现)
        (retryLimit, appearOnAttempt) => {
          let callCount = 0;
          
          const findElement = () => {
            callCount++;
            if (appearOnAttempt > 0 && callCount >= appearOnAttempt) {
              return { id: 'found-element' };
            }
            return null;
          };
          
          const result = ErrorRecovery.waitForElementSync(findElement, { retries: retryLimit });
          
          if (appearOnAttempt > 0 && appearOnAttempt <= retryLimit) {
            // 元素应该在重试限制内找到
            expect(result.found).toBe(true);
            expect(result.attempts).toBe(appearOnAttempt);
          } else {
            // 元素应该在达到重试限制后仍未找到
            expect(result.found).toBe(false);
            expect(result.attempts).toBe(retryLimit);
          }
          
          // 验证: 尝试次数永远不超过重试限制
          expect(result.attempts).toBeLessThanOrEqual(retryLimit);
          
          return result.attempts <= retryLimit;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5d: Successful operations don't retry unnecessarily
   */
  test('Property 5: Successful operations complete on first attempt', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (returnValue) => {
          let callCount = 0;
          
          const operation = () => {
            callCount++;
            return returnValue;
          };
          
          const result = ErrorRecovery.withRetrySync(operation);
          
          // 验证: 成功的操作只执行一次
          expect(result.success).toBe(true);
          expect(result.attempts).toBe(1);
          expect(callCount).toBe(1);
          
          return result.attempts === 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5e: Retry count is configurable
   */
  test('Property 5: Retry count is configurable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (customRetryLimit) => {
          let callCount = 0;
          
          // 操作永远失败
          const operation = () => {
            callCount++;
            throw new Error('Always fails');
          };
          
          const result = ErrorRecovery.withRetrySync(operation, { retries: customRetryLimit });
          
          // 验证: 使用自定义重试次数
          expect(result.success).toBe(false);
          expect(result.attempts).toBe(customRetryLimit);
          expect(callCount).toBe(customRetryLimit);
          
          return result.attempts === customRetryLimit;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// 商品处理唯一性逻辑 - 独立实现用于测试
// Requirements: 4.2
// ============================================

/**
 * 商品处理追踪器
 * 用于确保每个商品在单次运行中只被处理一次
 * **Feature: shopee-auto-cart-extension, Property 3: Product Processing Uniqueness**
 * **Validates: Requirements 4.2**
 */
const ProductTracker = {
  /**
   * 创建新的处理追踪器实例
   * @returns {Object} 追踪器实例
   */
  create() {
    return {
      processedProducts: new Set(),
      processingOrder: [],
      
      /**
       * 检查商品是否已处理
       * @param {string} productId - 商品 ID
       * @returns {boolean}
       */
      isProcessed(productId) {
        return this.processedProducts.has(productId);
      },
      
      /**
       * 标记商品为已处理
       * @param {string} productId - 商品 ID
       * @returns {boolean} 是否成功标记 (false 表示已经处理过)
       */
      markProcessed(productId) {
        if (this.processedProducts.has(productId)) {
          return false; // 已经处理过，不应该再次处理
        }
        this.processedProducts.add(productId);
        this.processingOrder.push(productId);
        return true;
      },
      
      /**
       * 获取已处理商品数量
       * @returns {number}
       */
      getProcessedCount() {
        return this.processedProducts.size;
      },
      
      /**
       * 获取处理顺序
       * @returns {string[]}
       */
      getProcessingOrder() {
        return [...this.processingOrder];
      },
      
      /**
       * 清除所有处理记录
       */
      clear() {
        this.processedProducts.clear();
        this.processingOrder = [];
      }
    };
  },
  
  /**
   * 模拟处理商品列表
   * @param {string[]} productIds - 商品 ID 列表
   * @param {Object} tracker - 追踪器实例
   * @returns {Object} 处理结果
   */
  processProducts(productIds, tracker) {
    const results = {
      processed: [],
      skipped: [],
      duplicateAttempts: 0
    };
    
    for (const productId of productIds) {
      if (tracker.isProcessed(productId)) {
        results.skipped.push(productId);
        results.duplicateAttempts++;
      } else {
        tracker.markProcessed(productId);
        results.processed.push(productId);
      }
    }
    
    return results;
  },
  
  /**
   * 获取下一个未处理的商品
   * @param {string[]} productIds - 商品 ID 列表
   * @param {Object} tracker - 追踪器实例
   * @returns {string|null} 下一个未处理的商品 ID
   */
  getNextUnprocessed(productIds, tracker) {
    for (const productId of productIds) {
      if (!tracker.isProcessed(productId)) {
        return productId;
      }
    }
    return null;
  }
};

// ============================================
// Property 3: Product Processing Uniqueness Tests
// **Feature: shopee-auto-cart-extension, Property 3: Product Processing Uniqueness**
// **Validates: Requirements 4.2**
// ============================================

describe('Property 3: Product Processing Uniqueness', () => {
  
  /**
   * Property 3a: For any product in the search results, 
   * the Extension SHALL process it exactly once during a single run.
   */
  test('Property 3: Each product is processed exactly once', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 50 }),
        (productIds) => {
          const tracker = ProductTracker.create();
          const results = ProductTracker.processProducts(productIds, tracker);
          
          // 获取唯一商品 ID
          const uniqueProductIds = [...new Set(productIds)];
          
          // 验证: 处理的商品数量等于唯一商品数量
          expect(results.processed.length).toBe(uniqueProductIds.length);
          
          // 验证: 每个唯一商品都被处理了
          for (const productId of uniqueProductIds) {
            expect(tracker.isProcessed(productId)).toBe(true);
          }
          
          // 验证: 处理列表中没有重复
          const processedSet = new Set(results.processed);
          expect(processedSet.size).toBe(results.processed.length);
          
          return results.processed.length === uniqueProductIds.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3b: Duplicate product IDs in input are skipped
   */
  test('Property 3: Duplicate products are skipped', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 30 }),
        (productIds) => {
          const tracker = ProductTracker.create();
          const results = ProductTracker.processProducts(productIds, tracker);
          
          // 计算输入中的重复数量
          const uniqueCount = new Set(productIds).size;
          const duplicateCount = productIds.length - uniqueCount;
          
          // 验证: 跳过的数量等于重复数量
          expect(results.skipped.length).toBe(duplicateCount);
          expect(results.duplicateAttempts).toBe(duplicateCount);
          
          return results.skipped.length === duplicateCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3c: Processing order is preserved for unique products
   */
  test('Property 3: Processing order preserves first occurrence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 30 }),
        (productIds) => {
          const tracker = ProductTracker.create();
          ProductTracker.processProducts(productIds, tracker);
          
          const processingOrder = tracker.getProcessingOrder();
          
          // 获取每个唯一商品的首次出现顺序
          const firstOccurrenceOrder = [];
          const seen = new Set();
          for (const productId of productIds) {
            if (!seen.has(productId)) {
              seen.add(productId);
              firstOccurrenceOrder.push(productId);
            }
          }
          
          // 验证: 处理顺序与首次出现顺序一致
          expect(processingOrder).toEqual(firstOccurrenceOrder);
          
          return JSON.stringify(processingOrder) === JSON.stringify(firstOccurrenceOrder);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3d: getNextUnprocessed returns correct product
   */
  test('Property 3: getNextUnprocessed returns first unprocessed product', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (productIds, processCount) => {
          if (productIds.length === 0) return true;
          
          const tracker = ProductTracker.create();
          const uniqueProducts = [...new Set(productIds)];
          
          // 处理前 processCount 个唯一商品
          const toProcess = Math.min(processCount, uniqueProducts.length);
          for (let i = 0; i < toProcess; i++) {
            tracker.markProcessed(uniqueProducts[i]);
          }
          
          const nextUnprocessed = ProductTracker.getNextUnprocessed(productIds, tracker);
          
          if (toProcess >= uniqueProducts.length) {
            // 所有商品都已处理
            expect(nextUnprocessed).toBeNull();
          } else {
            // 应该返回第一个未处理的商品
            expect(nextUnprocessed).not.toBeNull();
            expect(tracker.isProcessed(nextUnprocessed)).toBe(false);
            
            // 验证它确实是列表中第一个未处理的
            for (const productId of productIds) {
              if (!tracker.isProcessed(productId)) {
                expect(nextUnprocessed).toBe(productId);
                break;
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3e: Tracker state is consistent after multiple operations
   */
  test('Property 3: Tracker maintains consistent state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 50 }),
        (productIds) => {
          const tracker = ProductTracker.create();
          
          // 处理所有商品
          for (const productId of productIds) {
            tracker.markProcessed(productId);
          }
          
          const uniqueCount = new Set(productIds).size;
          
          // 验证: 处理数量等于唯一商品数量
          expect(tracker.getProcessedCount()).toBe(uniqueCount);
          
          // 验证: 所有唯一商品都被标记为已处理
          for (const productId of new Set(productIds)) {
            expect(tracker.isProcessed(productId)).toBe(true);
          }
          
          // 验证: 处理顺序长度等于唯一商品数量
          expect(tracker.getProcessingOrder().length).toBe(uniqueCount);
          
          return tracker.getProcessedCount() === uniqueCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3f: Clear resets tracker state completely
   */
  test('Property 3: Clear resets all tracking state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 30 }),
        (productIds) => {
          const tracker = ProductTracker.create();
          
          // 处理一些商品
          for (const productId of productIds) {
            tracker.markProcessed(productId);
          }
          
          // 清除状态
          tracker.clear();
          
          // 验证: 状态已完全重置
          expect(tracker.getProcessedCount()).toBe(0);
          expect(tracker.getProcessingOrder()).toEqual([]);
          
          // 验证: 之前处理过的商品现在可以再次处理
          for (const productId of productIds) {
            expect(tracker.isProcessed(productId)).toBe(false);
          }
          
          return tracker.getProcessedCount() === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3g: markProcessed returns correct boolean
   */
  test('Property 3: markProcessed returns false for already processed products', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (productId) => {
          const tracker = ProductTracker.create();
          
          // 第一次标记应该返回 true
          const firstMark = tracker.markProcessed(productId);
          expect(firstMark).toBe(true);
          
          // 第二次标记应该返回 false
          const secondMark = tracker.markProcessed(productId);
          expect(secondMark).toBe(false);
          
          // 第三次标记也应该返回 false
          const thirdMark = tracker.markProcessed(productId);
          expect(thirdMark).toBe(false);
          
          // 验证: 商品只被记录一次
          expect(tracker.getProcessedCount()).toBe(1);
          expect(tracker.getProcessingOrder().length).toBe(1);
          
          return firstMark === true && secondMark === false && thirdMark === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// 导出供其他测试使用
module.exports = {
  CartManager,
  PageDetector,
  ErrorRecovery,
  ProductTracker
};
