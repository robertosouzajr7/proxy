// test/proxy.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from 'src/application/services/proxy.services';
import axios from 'axios';
import { createMock } from '@golevelup/ts-jest';
import { Request, Response } from 'express';

// Mock do axios
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('ProxyService', () => {
  let service: ProxyService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'proxy.targetUrl') {
                return 'https://mock-target.com/';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleRequest', () => {
    it('should forward request to target URL from body', async () => {
      // Mock request and response
      const req = createMock<Request>({
        method: 'POST',
        originalUrl: '/api/proxy',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: {
          targetUrl: 'test/endpoint',
          param1: 'value1',
          param2: 'value2',
        },
      });

      const res = createMock<Response>({
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      });

      mockedAxios.mockImplementation(() =>
        Promise.resolve({ data: {}, status: 200 }),
      );

      // Mock axios response
      mockedAxios.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
        headers: {
          'content-type': 'application/json',
        },
      });

      // Call service method
      await service.handleRequest(req, res);

      // Verify correct URL was constructed
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'https://test/endpoint',
          data: expect.objectContaining({
            param1: 'value1',
            param2: 'value2',
          }),
          headers: expect.objectContaining({
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          }),
        }),
      );

      // Verify response was handled correctly
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ success: true });
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Proxied-By',
        'NestJS-Infobip-Proxy',
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock request and response
      const req = createMock<Request>({
        method: 'POST',
        originalUrl: '/api/proxy',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          targetUrl: 'error/endpoint',
          param1: 'value1',
        },
      });

      const res = createMock<Response>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      });

      // Mock axios error
      const error = new Error('Network Error');
      (error as any).isAxiosError = true;
      (error as any).response = {
        status: 502,
        data: { message: 'Network Error' },
      };
      (error as any).code = 'ECONNREFUSED';
      mockedAxios.mockRejectedValueOnce(error);

      // Call service method
      await service.handleRequest(req, res);

      // Verify error was handled correctly
      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Conexão recusada',
          code: 'ECONNREFUSED',
        }),
      );
    });
  });
});
