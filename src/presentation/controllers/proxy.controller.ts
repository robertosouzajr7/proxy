// src/presentation/controllers/proxy.controller.ts

import { All, Controller, Req, Res, Logger, Get } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from 'src/application/services/proxy.services';
import { VpnCheckerAdapter } from 'src/infrastructure/adapters/vpn-checker.adapters';
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly vpnCheckerAdapter: VpnCheckerAdapter,
  ) {}

  // Rota de status para verificação do serviço
  @All('status')
  status(@Req() req: Request, @Res() res: Response) {
    const authHeader = req.headers.authorization;
    let tokenStatus = 'ausente';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenStatus = 'presente';
    }

    return res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      message:
        'O proxy está funcionando corretamente e pronto para processar requisições',
      client_ip:
        req.headers['x-forwarded-for'] ||
        req.ip ||
        req.connection.remoteAddress,
      auth_token: tokenStatus,
    });
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
}
