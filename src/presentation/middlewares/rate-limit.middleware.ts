import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterAdapter } from 'src/infrastructure/adapters/rate-limiter.adapters';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly rateLimiterAdapter: RateLimiterAdapter) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Usar IP como chave para o rate limiting
    const ip =
      req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    const key = `${ip}`;

    const result = this.rateLimiterAdapter.checkLimit(key);

    // Adicionar headers de rate limit para transparência
    res.setHeader(
      'X-RateLimit-Limit',
      this.rateLimiterAdapter['maxRequests'].toString(),
    );
    res.setHeader('X-RateLimit-Remaining', result.remainingRequests.toString());
    res.setHeader(
      'X-RateLimit-Reset',
      Math.floor(result.resetTime / 1000).toString(),
    );

    if (!result.allowed) {
      this.logger.warn(`Rate limit excedido para IP: ${key}`);
      return res.status(429).json({
        error: 'Muitas requisições',
        message: 'Por favor, tente novamente mais tarde',
      });
    }

    next();
  }
}
