// test/unit/infrastructure/adapters/cache.adapter.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { CacheAdapter } from 'src/infrastructure/adapters/cache.adapters';

describe('CacheAdapter', () => {
  let adapter: CacheAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheAdapter],
    }).compile();
    jest.useFakeTimers();
    adapter = module.get<CacheAdapter>(CacheAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      adapter.set(key, value);

      expect(adapter.get(key)).toEqual(value);
    });

    it('should respect TTL for cached items', () => {
      const key = 'ttl-test';
      const value = { data: 'expires-soon' };

      // Set with very short TTL (1ms)
      adapter.set(key, value, 1);

      // Wait for expiration
      jest.advanceTimersByTime(10);

      expect(adapter.get(key)).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired keys', () => {
      adapter.set('exists', { data: 'value' });

      expect(adapter.has('exists')).toBe(true);
      expect(adapter.has('does-not-exist')).toBe(false);
    });

    it('should return false for expired keys', () => {
      adapter.set('expires', { data: 'value' }, 1);

      jest.advanceTimersByTime(10);

      expect(adapter.has('expires')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove cached items', () => {
      adapter.set('to-delete', { data: 'value' });
      adapter.delete('to-delete');

      expect(adapter.has('to-delete')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all cached items', () => {
      adapter.set('key1', { data: 'value1' });
      adapter.set('key2', { data: 'value2' });

      adapter.clear();

      expect(adapter.has('key1')).toBe(false);
      expect(adapter.has('key2')).toBe(false);
    });
  });

  describe('generateKey', () => {
    it('should generate consistent keys for the same inputs', () => {
      const method = 'GET';
      const url = '/test';
      const body = { param: 'value' };

      const key1 = adapter.generateKey(method, url, body);
      const key2 = adapter.generateKey(method, url, body);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = adapter.generateKey('GET', '/test', { a: 1 });
      const key2 = adapter.generateKey('POST', '/test', { a: 1 });
      const key3 = adapter.generateKey('GET', '/other', { a: 1 });
      const key4 = adapter.generateKey('GET', '/test', { a: 2 });

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).not.toBe(key4);
    });
  });

  afterEach(() => {
    jest.useRealTimers(); // Restaurar os timers originais
  });
});
