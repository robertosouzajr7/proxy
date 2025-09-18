// test/unit/presentation/controllers/proxy.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ProxyController } from '../../../../src/presentation/controllers/proxy.controller';
import { ProxyService } from 'src/application/services/proxy.services';
import { AuditLogAdapter } from 'src/infrastructure/adapters/audit-log.adapter';
import { VpnCheckerAdapter } from 'src/infrastructure/adapters/vpn-checker.adapters';

describe('ProxyController', () => {
  let controller: ProxyController;
  let proxyService: ProxyService;
  let auditLogAdapter: AuditLogAdapter;

  const mockProxyService = {
    handleRequest: jest.fn().mockResolvedValue({}),
  };

  // Em proxy.controller.spec.ts
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: ProxyService,
          useValue: mockProxyService,
        },
        {
          provide: VpnCheckerAdapter, // Adicionar este provider
          useValue: {
            isVpnConnected: jest.fn().mockResolvedValue(true),
            testVpnConnection: jest.fn().mockResolvedValue({
              connected: true,
              details: 'Mock VPN connection',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<ProxyController>(ProxyController);
    proxyService = module.get<ProxyService>(ProxyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('status', () => {
    it('should return status information', () => {
      const req = {
        headers: { authorization: 'Bearer token123' },
        ip: '127.0.0.1',
      };
      const res = {
        json: jest.fn(),
      };

      controller.status(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'online',
          auth_token: 'presente',
        }),
      );
    });

    it('should indicate when auth token is missing', () => {
      const req = {
        headers: {},
        ip: '127.0.0.1',
      };
      const res = {
        json: jest.fn(),
      };

      controller.status(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_token: 'ausente',
        }),
      );
    });
  });

  describe('handleProxy', () => {
    it('should delegate to ProxyService', async () => {
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = {};

      await controller.handleProxy(req as any, res as any);

      expect(proxyService.handleRequest).toHaveBeenCalledWith(req, res);
    });

    it('should log the request', async () => {
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = {};

      jest.spyOn(controller['logger'], 'log');

      await controller.handleProxy(req as any, res as any);

      expect(controller['logger'].log).toHaveBeenCalled();
    });
  });
});
