// test/unit/application/services/ip-validator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IpValidatorService } from 'src/application/services/ip-validator.services';

describe('IpValidatorService', () => {
  let service: IpValidatorService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpValidatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'security.enableIpWhitelist') return false;
              if (key === 'security.allowedCidrs')
                return ['193.105.74.0/24', '127.0.0.1', '192.168.1.1'];
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<IpValidatorService>(IpValidatorService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isIpAllowed', () => {
    it('should allow IPs that are in the allowedIps list', () => {
      expect(service.isIpAllowed('127.0.0.1')).toBe(true);
      expect(service.isIpAllowed('192.168.1.1')).toBe(true);
    });

    it('should allow IPs that match CIDR ranges', () => {
      expect(service.isIpAllowed('193.105.74.1')).toBe(true);
      expect(service.isIpAllowed('193.105.74.254')).toBe(true);
    });

    it('should reject IPs that do not match any allowed IP or CIDR', () => {
      expect(service.isIpAllowed('8.8.8.8')).toBe(false);
      expect(service.isIpAllowed('10.0.0.1')).toBe(false);
    });

    it('should strip IPv6 prefix from IPv4 addresses', () => {
      expect(service.isIpAllowed('::ffff:127.0.0.1')).toBe(true);
    });

    it('should return true for all IPs when IP whitelist is disabled', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'security.enableIpWhitelist') return false;
        return null;
      });

      expect(service.isIpAllowed('8.8.8.8')).toBe(true);
    });
  });
});
