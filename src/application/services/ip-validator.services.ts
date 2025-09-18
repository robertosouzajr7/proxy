// src/application/services/ip-validator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ipaddr from 'ipaddr.js';
import { IpValidatorInterface } from 'src/domain/interfaces/ip-validator.interfaces';

@Injectable()
export class IpValidatorService implements IpValidatorInterface {
  private readonly logger = new Logger(IpValidatorService.name);
  private readonly allowedCidrs: string[];
  private readonly allowedIps: string[];
  private readonly enableIpWhitelist: boolean;

  constructor(private configService: ConfigService) {
    // Separa os CIDRs reais dos IPs individuais
    const allAllowedAddresses =
      this.configService.get<string[]>('security.allowedCidrs') || [];

    this.allowedCidrs = allAllowedAddresses.filter((addr) =>
      addr.includes('/'),
    );
    this.allowedIps = allAllowedAddresses.filter((addr) => !addr.includes('/'));

    this.enableIpWhitelist =
      this.configService.get<boolean>('security.enableIpWhitelist') ?? false;

    // Adicionar localhost para desenvolvimento local
    this.allowedIps.push('127.0.0.1');
    this.allowedIps.push('::1');
    this.allowedIps.push('::ffff:127.0.0.1');

    // Log da configuração
    this.logger.log(
      `Validação de IP ${this.enableIpWhitelist ? 'ativada' : 'desativada'}`,
    );
    this.logger.log(
      `IPs diretamente permitidos: ${this.allowedIps.join(', ')}`,
    );
    this.logger.log(`CIDRs permitidos: ${this.allowedCidrs.join(', ')}`);
  }

  isIpAllowed(ip: string): boolean {
    // Se a verificação de IP estiver desativada, permitir todos
    if (!this.enableIpWhitelist) {
      return true;
    }

    // Remover o prefixo IPv6 se existir
    const cleanIp = ip.replace(/^::ffff:/, '');

    this.logger.debug(`Verificando IP: ${cleanIp}`);

    // Verificar se o IP está na lista de IPs permitidos
    if (this.allowedIps.includes(cleanIp)) {
      this.logger.debug(`IP ${cleanIp} encontrado na lista de IPs permitidos`);
      return true;
    }

    // Verificar se o IP está em algum dos CIDRs permitidos
    for (const cidr of this.allowedCidrs) {
      try {
        if (this.isIpInCidr(cleanIp, cidr)) {
          this.logger.debug(`IP ${cleanIp} encontrado no CIDR ${cidr}`);
          return true;
        }
      } catch (error) {
        // Type guard para garantir que error tenha a propriedade message
        const errorMessage = this.getErrorMessage(error);
        this.logger.error(
          `Erro ao verificar IP ${cleanIp} contra CIDR ${cidr}: ${errorMessage}`,
        );
      }
    }

    this.logger.debug(`IP ${cleanIp} não está autorizado`);
    return false;
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const addr = ipaddr.parse(ip);
      const range = ipaddr.parseCIDR(cidr);
      return addr.match(range);
    } catch (error) {
      // Type guard para garantir que error tenha a propriedade message
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `Erro ao analisar CIDR: ${cidr} Error: ${errorMessage}`,
      );
      return false;
    }
  }

  // Método utilitário para extrair mensagem de erro com segurança de tipo
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
