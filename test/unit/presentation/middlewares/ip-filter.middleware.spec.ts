// test/unit/presentation/middlewares/ip-filter.middleware.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { IpFilterMiddleware } from '../../../../src/presentation/middlewares/ip-filter.middleware';
import { IpValidatorService } from 'src/application/services/ip-validator.services';
import { ForbiddenException } from '@nestjs/common';

describe('IpFilterMiddleware', () => {
  let middleware: IpFilterMiddleware;
  let ipValidatorService: IpValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpFilterMiddleware,
        {
          provide: IpValidatorService,
          useValue: {
            isIpAllowed: jest.fn(),
          },
        },
      ],
    }).compile();

    middleware = module.get<IpFilterMiddleware>(IpFilterMiddleware);
    ipValidatorService = module.get<IpValidatorService>(IpValidatorService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should call next() for allowed IPs', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
      };
      const res = {};
      const next = jest.fn();

      jest.spyOn(ipValidatorService, 'isIpAllowed').mockReturnValue(true);

      middleware.use(req as any, res as any, next);

      expect(ipValidatorService.isIpAllowed).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for denied IPs', () => {
      const req = {
        ip: '8.8.8.8',
        headers: {},
        connection: { remoteAddress: '8.8.8.8' },
      };
      const res = {};
      const next = jest.fn();

      jest.spyOn(ipValidatorService, 'isIpAllowed').mockReturnValue(false);

      expect(() => {
        middleware.use(req as any, res as any, next);
      }).toThrow(ForbiddenException);

      expect(ipValidatorService.isIpAllowed).toHaveBeenCalledWith('8.8.8.8');
      expect(next).not.toHaveBeenCalled();
    });

    it('should prefer x-forwarded-for header when available', () => {
      const req = {
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '192.168.1.1' },
        connection: { remoteAddress: '127.0.0.1' },
      };
      const res = {};
      const next = jest.fn();

      jest.spyOn(ipValidatorService, 'isIpAllowed').mockReturnValue(true);

      middleware.use(req as any, res as any, next);

      expect(ipValidatorService.isIpAllowed).toHaveBeenCalledWith(
        '192.168.1.1',
      );
    });
  });
});
