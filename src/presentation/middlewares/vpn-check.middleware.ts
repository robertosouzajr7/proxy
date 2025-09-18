// src/presentation/middlewares/vpn-check.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { VpnCheckerAdapter } from 'src/infrastructure/adapters/vpn-checker.adapters';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VpnCheckMiddleware implements NestMiddleware {
  private readonly logger = new Logger(VpnCheckMiddleware.name);
  private readonly enableVpnCheck: boolean;

  constructor(
    private readonly vpnCheckerAdapter: VpnCheckerAdapter,
    private readonly configService: ConfigService,
  ) {
    this.enableVpnCheck =
      this.configService.get<boolean>('vpn.enableCheck') || false;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Pular verificação se estiver desabilitada
    if (!this.enableVpnCheck) {
      return next();
    }

    try {
      const isVpnConnected = await this.vpnCheckerAdapter.isVpnConnected();

      if (!isVpnConnected) {
        this.logger.warn('Requisição recebida com VPN desconectada');
        return res.status(503).json({
          error: 'Serviço indisponível',
          message:
            'A conexão VPN não está ativa. Por favor, verifique a conectividade com a rede interna.',
          code: 'VPN_DISCONNECTED',
        });
      }

      this.logger.log('VPN verificada e conectada');
      next();
    } catch (error: unknown) {
      // Extrair a mensagem de erro com segurança
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Erro ao verificar status da VPN: ${errorMessage}`);
      next(); // Em caso de erro na verificação, permitir a requisição
    }
  }

  // Método auxiliar para obter mensagem de erro com segurança
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: string }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return String(error);
  }
}
