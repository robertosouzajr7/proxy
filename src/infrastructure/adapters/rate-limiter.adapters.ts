import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

@Injectable()
export class RateLimiterAdapter {
  private readonly logger = new Logger(RateLimiterAdapter.name);
  private readonly limits: Map<string, RateLimitEntry> = new Map();

  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(private configService: ConfigService) {
    this.windowMs =
      this.configService.get<number>('security.rateLimit.windowMs') || 60000; // 1 minuto
    this.maxRequests =
      this.configService.get<number>('security.rateLimit.maxRequests') || 100; // 100 requisições por minuto

    // Limpar entradas expiradas periodicamente
    setInterval(() => this.cleanupExpiredEntries(), this.windowMs);
  }

  checkLimit(key: string): {
    allowed: boolean;
    remainingRequests: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.expiresAt < now) {
      // Criar nova entrada ou resetar expirada
      this.limits.set(key, {
        count: 1,
        expiresAt: now + this.windowMs,
      });

      return {
        allowed: true,
        remainingRequests: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }

    // Incrementar contador
    entry.count += 1;

    // Verificar limite
    const allowed = entry.count <= this.maxRequests;
    const remainingRequests = Math.max(0, this.maxRequests - entry.count);

    if (!allowed) {
      this.logger.warn(
        `Rate limit excedido para ${key}: ${entry.count} requisições`,
      );
    }

    return {
      allowed,
      remainingRequests,
      resetTime: entry.expiresAt,
    };
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.expiresAt < now) {
        this.limits.delete(key);
      }
    }
  }
}
