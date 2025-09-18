// test/unit/infrastructure/adapters/rate-limiter.adapter.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterAdapter } from 'src/infrastructure/adapters/rate-limiter.adapters';
describe('RateLimiterAdapter', () => {
  let adapter: RateLimiterAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'security.rateLimit.windowMs') return 1000; // 1 second
              if (key === 'security.rateLimit.maxRequests') return 5; // 5 requests per second
              return null;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<RateLimiterAdapter>(RateLimiterAdapter);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('checkLimit', () => {
    it('should allow initial requests up to the limit', () => {
      const key = 'test-ip';

      // First request
      let result = adapter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(4);

      // Up to the limit
      for (let i = 0; i < 3; i++) {
        result = adapter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }

      // Last allowed request
      result = adapter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(0);

      // Exceeds the limit
      result = adapter.checkLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.remainingRequests).toBe(0);
    });

    it('should reset the counter after the window expires', async () => {
      const key = 'test-ip-reset';

      // Use up the limit
      for (let i = 0; i < 5; i++) {
        adapter.checkLimit(key);
      }

      // Next request should be blocked
      let result = adapter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Fast-forward time by setting a new entry with reset time
      const entry = { count: 0, expiresAt: Date.now() - 100 };
      adapter['limits'].set(key, entry);

      // After window expires, should allow again
      result = adapter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(4);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should remove expired entries', () => {
      // Add some entries
      adapter['limits'].set('expired', {
        count: 3,
        expiresAt: Date.now() - 1000,
      });
      adapter['limits'].set('valid', {
        count: 2,
        expiresAt: Date.now() + 1000,
      });

      // Run cleanup
      adapter['cleanupExpiredEntries']();

      // Check results
      expect(adapter['limits'].has('expired')).toBe(false);
      expect(adapter['limits'].has('valid')).toBe(true);
    });
  });
});
