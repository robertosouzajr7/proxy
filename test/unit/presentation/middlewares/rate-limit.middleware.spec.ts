// test/unit/presentation/middlewares/rate-limit.middleware.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitMiddleware } from '../../../../src/presentation/middlewares/rate-limit.middleware';
import { RateLimiterAdapter } from 'src/infrastructure/adapters/rate-limiter.adapters';

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;
  let rateLimiterAdapter: RateLimiterAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitMiddleware,
        {
          provide: RateLimiterAdapter,
          useValue: {
            checkLimit: jest.fn(),
            maxRequests: 100,
          },
        },
      ],
    }).compile();

    middleware = module.get<RateLimitMiddleware>(RateLimitMiddleware);
    rateLimiterAdapter = module.get<RateLimiterAdapter>(RateLimiterAdapter);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should call next() when under rate limit', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(rateLimiterAdapter, 'checkLimit').mockReturnValue({
        allowed: true,
        remainingRequests: 99,
        resetTime: Date.now() + 60000,
      });

      middleware.use(req as any, res as any, next);

      expect(rateLimiterAdapter.checkLimit).toHaveBeenCalledWith('127.0.0.1');
      expect(res.setHeader).toHaveBeenCalledTimes(3); // 3 rate limit headers
      expect(next).toHaveBeenCalled();
    });

    it('should return 429 status when rate limit exceeded', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(rateLimiterAdapter, 'checkLimit').mockReturnValue({
        allowed: false,
        remainingRequests: 0,
        resetTime: Date.now() + 60000,
      });

      middleware.use(req as any, res as any, next);

      expect(rateLimiterAdapter.checkLimit).toHaveBeenCalledWith('127.0.0.1');
      expect(res.setHeader).toHaveBeenCalledTimes(3); // 3 rate limit headers
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Muitas requisições',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
