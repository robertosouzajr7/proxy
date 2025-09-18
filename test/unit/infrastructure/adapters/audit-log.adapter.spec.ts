// test/unit/infrastructure/adapters/audit-log.adapter.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuditLogAdapter } from 'src/infrastructure/adapters/audit-log.adapter';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

describe('AuditLogAdapter', () => {
  let adapter: AuditLogAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'logging.audit.console') return true;
              if (key === 'logging.audit.file') return true;
              if (key === 'logging.audit.filePath') return 'test-audit.log';
              return null;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<AuditLogAdapter>(AuditLogAdapter);
    configService = module.get<ConfigService>(ConfigService);

    // Mock fs.existsSync and fs.mkdirSync for directory creation
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('log', () => {
    it('should log to console when enabled', () => {
      const loggerSpy = jest.spyOn(adapter['logger'], 'log');

      adapter.log({
        timestamp: '2023-01-01T00:00:00.000Z',
        clientIp: '127.0.0.1',
        action: 'GET',
        resource: '/test',
        status: 'SUCCESS',
      });

      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should write to file when enabled', () => {
      const appendFileSpy = jest
        .spyOn(fs, 'appendFileSync')
        .mockImplementation(() => undefined);

      adapter.log({
        timestamp: '2023-01-01T00:00:00.000Z',
        clientIp: '127.0.0.1',
        action: 'GET',
        resource: '/test',
        status: 'SUCCESS',
      });

      expect(appendFileSpy).toHaveBeenCalled();
      expect(appendFileSpy).toHaveBeenCalledWith(
        'test-audit.log',
        expect.stringContaining('127.0.0.1'),
      );
    });

    it('should handle file write errors gracefully', () => {
      jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {
        throw new Error('Write error');
      });

      const loggerErrorSpy = jest.spyOn(adapter['logger'], 'error');

      adapter.log({
        timestamp: '2023-01-01T00:00:00.000Z',
        clientIp: '127.0.0.1',
        action: 'GET',
        resource: '/test',
        status: 'SUCCESS',
      });

      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logRequest', () => {
    it('should sanitize sensitive headers', () => {
      const logSpy = jest.spyOn(adapter, 'log');

      const req = {
        method: 'GET',
        originalUrl: '/test',
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=123456',
          'user-agent': 'test-agent',
        },
        ip: '127.0.0.1',
        query: {},
      };

      const res = {
        statusCode: 200,
        responseTime: 100,
      };

      adapter.logRequest(req, res, 'SUCCESS');

      expect(logSpy).toHaveBeenCalled();

      // Verify that sensitive data was redacted
      const logCall = logSpy.mock.calls[0][0];
      expect(logCall.details.headers.authorization).toBe('Bearer [REDACTED]');
      expect(logCall.details.headers.cookie).toBe('[REDACTED]');
      expect(logCall.details.headers['user-agent']).toBe('test-agent');
    });
  });
});
