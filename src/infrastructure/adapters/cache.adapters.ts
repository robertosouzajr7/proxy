import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CacheAdapter {
  private readonly logger = new Logger(CacheAdapter.name);
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly DEFAULT_TTL = 10 * 60 * 1000; // 10 minutos em milissegundos

  set(key: string, value: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now() + ttl,
    });
    this.logger.debug(`Armazenado em cache: ${key} (TTL: ${ttl}ms)`);
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    if (cached.timestamp < Date.now()) {
      this.logger.debug(`Cache expirado para: ${key}`);
      this.cache.delete(key);
      return null;
    }

    this.logger.debug(`Cache encontrado para: ${key}`);
    return cached.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.logger.debug(`Cache removido para: ${key}`);
  }

  clear(): void {
    this.cache.clear();
    this.logger.debug('Cache limpo completamente');
  }

  // Gera uma chave baseada no método, URL e body
  generateKey(method: string, url: string, body?: any): string {
    const bodyString = body ? JSON.stringify(body) : '';
    return `${method}:${url}:${bodyString}`;
  }
}
