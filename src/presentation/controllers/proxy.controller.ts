// src/presentation/controllers/proxy.controller.ts

import { All, Controller, Req, Res, Logger, Get } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from 'src/application/services/proxy.services';
import { VpnCheckerAdapter } from 'src/infrastructure/adapters/vpn-checker.adapters';
import { IpValidatorService } from 'src/application/services/ip-validator.services';

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly vpnCheckerAdapter: VpnCheckerAdapter,
    private readonly ipValidatorService: IpValidatorService,
  ) {}

  // Rota de status para verificação do serviço
  @All('status')
  status(@Req() req: Request, @Res() res: Response) {
    const authHeader = req.headers.authorization;
    let tokenStatus = 'ausente';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenStatus = 'presente';
    }

    const clientIp = this.extractRealClientIp(req);

    return res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      message:
        'O proxy está funcionando corretamente e pronto para processar requisições',
      client_ip: clientIp,
      auth_token: tokenStatus,
    });
  }

  // Endpoint para debug de IP - útil para diagnosticar problemas
  @Get('debug/ip')
  debugIp(@Req() req: Request) {
    const allIpHeaders = {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-client-ip': req.headers['x-client-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip'],
      'x-forwarded': req.headers['x-forwarded'],
      'forwarded-for': req.headers['forwarded-for'],
      forwarded: req.headers['forwarded'],
    };

    const directIp =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const extractedIp = this.extractRealClientIp(req);

    // Obter informações detalhadas de validação
    const validationInfo = extractedIp
      ? this.ipValidatorService.getIpValidationInfo(extractedIp)
      : null;

    return {
      timestamp: new Date().toISOString(),
      headers: allIpHeaders,
      directConnectionIp: directIp,
      extractedClientIp: extractedIp,
      validation: validationInfo,
      message: extractedIp
        ? `IP ${extractedIp} ${validationInfo?.isAllowed ? 'é permitido' : 'NÃO é permitido'}`
        : 'Não foi possível extrair o IP do cliente',
    };
  }

  // Captura todas as outras rotas e encaminha para o proxy
  @All('*')
  async handleProxy(@Req() req: Request, @Res() res: Response) {
    this.logger.log(
      `Encaminhando requisição: ${req.method} ${req.originalUrl}`,
    );
    await this.proxyService.handleRequest(req, res);
  }

  @Get('vpn-status')
  async testVpnConnection() {
    const testResults = await this.vpnCheckerAdapter.testVpnConnection();

    return {
      timestamp: new Date().toISOString(),
      vpnStatus: testResults.connected ? 'connected' : 'disconnected',
      details: testResults.details.split('\n'),
      message: testResults.connected
        ? 'VPN COGEL está conectada e funcionando'
        : 'VPN COGEL não está conectada. Por favor, verifique sua conexão FortiClient.',
    };
  }

  /**
   * Extrai o IP real do cliente - mesma lógica do middleware
   */
  private extractRealClientIp(req: Request): string | null {
    // IPs que devem ser ignorados
    const IGNORED_IPS = [
      '172.30.1.254', // IP do container Docker/VPN
      '127.0.0.1', // localhost
      '::1', // localhost IPv6
      '::ffff:127.0.0.1', // localhost IPv6 mapped
    ];

    // Lista de headers que podem conter o IP real do cliente
    const ipHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip',
      'x-forwarded',
      'forwarded-for',
      'forwarded',
    ];

    // Tentar extrair IP dos headers
    for (const header of ipHeaders) {
      const headerValue = req.headers[header];
      if (headerValue) {
        const ip = this.parseIpFromHeader(headerValue, IGNORED_IPS);
        if (ip) {
          return ip;
        }
      }
    }

    // Fallback para IP direto da conexão
    const directIp =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    if (directIp && !this.isIgnoredIp(directIp, IGNORED_IPS)) {
      return this.cleanIp(directIp);
    }

    return null;
  }

  private parseIpFromHeader(
    headerValue: string | string[],
    ignoredIps: string[],
  ): string | null {
    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!value) return null;

    if (value.includes(',')) {
      const ips = value.split(',').map((ip) => ip.trim());

      for (const ip of ips) {
        const cleanedIp = this.cleanIp(ip);
        if (
          cleanedIp &&
          !this.isIgnoredIp(cleanedIp, ignoredIps) &&
          this.isValidIp(cleanedIp)
        ) {
          return cleanedIp;
        }
      }
    } else {
      const cleanedIp = this.cleanIp(value);
      if (
        cleanedIp &&
        !this.isIgnoredIp(cleanedIp, ignoredIps) &&
        this.isValidIp(cleanedIp)
      ) {
        return cleanedIp;
      }
    }

    return null;
  }

  private cleanIp(ip: string): string {
    if (!ip) return '';
    return ip.replace(/^::ffff:/, '').trim();
  }

  private isIgnoredIp(ip: string, ignoredIps: string[]): boolean {
    const cleanedIp = this.cleanIp(ip);
    return ignoredIps.includes(cleanedIp);
  }

  private isValidIp(ip: string): boolean {
    if (!ip) return false;

    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }
}
