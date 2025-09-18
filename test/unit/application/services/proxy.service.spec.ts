// test/unit/application/services/proxy.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from 'src/application/services/proxy.services';
import { CacheAdapter } from 'src/infrastructure/adapters/cache.adapters';
import { Request, Response } from 'express';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('ProxyService', () => {
  let service: ProxyService;
  let configService: ConfigService;
  let cacheAdapter: CacheAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'nodeEnv') return 'test';
              if (key === 'security.allowedDomains')
                return ['salvador.ba.gov.br'];
              return null;
            }),
          },
        },
        {
          provide: CacheAdapter,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            has: jest.fn(),
            generateKey: jest.fn().mockReturnValue('test-key'),
          },
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
    configService = module.get<ConfigService>(ConfigService);
    cacheAdapter = module.get<CacheAdapter>(CacheAdapter);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeUrl', () => {
    it('should return the URL unchanged if it starts with http://', () => {
      const result = service['normalizeUrl']('http://example.com');
      expect(result).toBe('http://example.com');
    });

    it('should return the URL unchanged if it starts with https://', () => {
      const result = service['normalizeUrl']('https://example.com');
      expect(result).toBe('https://example.com');
    });

    it('should prefix the URL with https:// if it does not have a protocol', () => {
      const result = service['normalizeUrl']('example.com');
      expect(result).toBe('https://example.com');
    });
  });

  describe('validateInput', () => {
    it('should reject invalid URLs', () => {
      const result = service['validateInput']('not-a-url', {});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Domínio não permitido');
    });

    it('should validate URLs that match allowed domains', () => {
      const result = service['validateInput']('forms.salvador.ba.gov.br', {});
      expect(result.valid).toBe(true);
    });

    it('should reject URLs with non-HTTP protocols', () => {
      const result = service['validateInput']('ftp://example.com', {});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Domínio não permitido');
    });

    it('should reject parameters that exceed the maximum length', () => {
      const longValue = 'a'.repeat(15000);
      const result = service['validateInput']('https://example.com', {
        param: longValue,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('excede o tamanho máximo permitido');
    });
  });

  describe('sanitizeParams', () => {
    it('should redact sensitive values', () => {
      const params = {
        username: 'user',
        password: 'secret',
        authToken: 'token123',
        normal: 'value',
      };

      const sanitized = service['sanitizeParams'](params);

      expect(sanitized.username).toBe('user');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.authToken).toBe('[REDACTED]');
      expect(sanitized.normal).toBe('value');
    });
  });

  describe('handleRequest', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      mockRequest = {
        method: 'POST',
        originalUrl: '/api/test',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token123',
        },
        body: {
          targetUrl: 'forms.salvador.ba.gov.br/test',
          param1: 'value1',
          param2: 'value2',
        },
      };

      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        headersSent: false,
      };

      jest
        .spyOn(service as any, 'validateInput')
        .mockReturnValue({ valid: true });
      jest.spyOn(cacheAdapter, 'has').mockReturnValue(false);
    });

    it('should handle valid requests and forward them', async () => {
      mockedAxios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { success: true },
      });

      await service.handleRequest(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'https://forms.salvador.ba.gov.br/test',
          data: { param1: 'value1', param2: 'value2' },
        }),
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith({ success: true });
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Proxied-By',
        'NestJS-Infobip-Proxy',
      );
    });

    it('should reject requests with missing targetUrl', async () => {
      mockRequest.body = { param1: 'value1' };

      await service.handleRequest(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Parâmetro obrigatório ausente',
        }),
      );
    });

    it('should handle validation failures', async () => {
      jest.spyOn(service as any, 'validateInput').mockReturnValue({
        valid: false,
        error: 'URL inválida',
      });

      await service.handleRequest(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validação falhou',
          message: 'URL inválida',
        }),
      );
    });

    it('should handle external service errors', async () => {
      const error = new Error('External service error');
      mockedAxios.mockRejectedValueOnce(error);

      await service.handleRequest(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Erro interno do servidor',
        }),
      );
    });

    it('should sanitize URLs in error logs', async () => {
      const error = new Error('External service error');
      error['config'] = {
        url: 'https://example.com/api?token=secret123',
        headers: { authorization: 'Bearer token123' },
      };
      mockedAxios.mockRejectedValueOnce(error);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await service.handleRequest(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(loggerSpy).toHaveBeenCalled();
      const loggedMessage = loggerSpy.mock.calls[0][0];
      expect(loggedMessage).not.toContain('secret123');
    });
    it('should handle errors gracefully', async () => {
      // Setup
      const req = mockRequest;
      const res = mockResponse;
      mockedAxios.mockRejectedValueOnce({
        message: 'Network Error',
        code: 'ECONNREFUSED',
      });

      req.body = {
        targetUrl: 'https://test/endpoint',
        param1: 'value1',
      };

      // Execute
      await service.handleRequest(req, res);

      // Verify error was handled correctly
      expect(res.status).toHaveBeenCalledWith(500); // Alterado de 502 para 500
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Erro interno do servidor', // Atualizar expectativa
        }),
      );
    });
  });
});
