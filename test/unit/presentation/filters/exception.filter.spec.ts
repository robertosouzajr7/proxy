// test/unit/presentation/filters/exception.filter.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from '../../../../src/presentation/filters/exception.filter';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'nodeEnv') return 'test';
              return null;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    let mockRequest: any;
    let mockResponse: any;
    let mockArgumentsHost: any;

    beforeEach(() => {
      mockRequest = {
        url: '/api/test?token=secret123',
        method: 'GET',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        ip: '127.0.0.1',
      };

      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      };
    });

    it('should handle HttpExceptions with correct status and message', () => {
      const exception = new HttpException(
        'Test exception',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Test exception',
        }),
      );
    });

    it('should handle unknown exceptions as 500 errors', () => {
      const exception = new Error('Unknown error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        }),
      );
    });

    it('should sanitize URLs in error responses', () => {
      const exception = new Error('Error with sensitive URL');
      mockRequest.url = '/api/test?token=secret123&key=private456';

      filter.catch(exception, mockArgumentsHost);

      const response = mockResponse.json.mock.calls[0][0];
      expect(response.path).toContain('[REDACTED]');
      expect(response.path).not.toContain('secret123');
    });

    it('should provide generic messages in production mode', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'production';
        return null;
      });

      const exception = new HttpException(
        'Detailed error for developers',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost);

      const response = mockResponse.json.mock.calls[0][0];
      expect(response.message).toBe('Requisição inválida');
      expect(response.message).not.toContain('Detailed error for developers');
    });
  });

  describe('sanitizeUrl', () => {
    it('should redact sensitive query parameters', () => {
      const url = '/api/test?token=secret&key=private&normal=value';
      const sanitized = filter['sanitizeUrl'](url);

      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).toContain('key=[REDACTED]');
      expect(sanitized).toContain('normal=value');
      expect(sanitized).not.toContain('secret');
      expect(sanitized).not.toContain('private');
    });
  });

  describe('sanitizeStackTrace', () => {
    it('should redact file paths from stack traces', () => {
      const stack =
        'Error: Test\n    at Object.<anonymous> (C:\\Users\\admin\\app.js:10:5)';
      const sanitized = filter['sanitizeStackTrace'](stack);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('C:\\Users\\admin');
    });
  });
});
