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

  // IPs que são sempre permitidos (localhost, etc.)
  private readonly DEFAULT_ALLOWED_IPS = [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ];

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

    // Adicionar IPs padrão permitidos
    this.allowedIps.push(...this.DEFAULT_ALLOWED_IPS);

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
      this.logger.debug('Validação de IP desativada - acesso permitido');
      return true;
    }

    if (!ip) {
      this.logger.warn('IP não fornecido para validação');
      return false;
    }

    // Limpar o IP (remover prefixos IPv6, etc.)
    const cleanIp = this.cleanIp(ip);

    this.logger.debug(`Verificando IP: ${cleanIp} (original: ${ip})`);

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
        const errorMessage = this.getErrorMessage(error);
        this.logger.error(
          `Erro ao verificar IP ${cleanIp} contra CIDR ${cidr}: ${errorMessage}`,
        );
      }
    }

    this.logger.warn(`IP ${cleanIp} não está autorizado`);
    return false;
  }

  /**
   * Verifica se um IP está dentro de um CIDR
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const addr = ipaddr.parse(ip);
      const range = ipaddr.parseCIDR(cidr);
      return addr.match(range);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `Erro ao analisar CIDR: ${cidr} para IP: ${ip} - Error: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Limpa o IP removendo prefixos e espaços
   */
  private cleanIp(ip: string): string {
    if (!ip) return '';

    // Remover o prefixo IPv6 se existir
    return ip.replace(/^::ffff:/, '').trim();
  }

  /**
   * Valida se um IP tem formato válido
   */
  public isValidIpFormat(ip: string): boolean {
    if (!ip) return false;

    const cleanedIp = this.cleanIp(ip);

    try {
      // Usar a biblioteca ipaddr.js para validação mais robusta
      ipaddr.parse(cleanedIp);
      return true;
    } catch (error) {
      this.logger.debug(`IP ${cleanedIp} tem formato inválido`);
      return false;
    }
  }

  /**
   * Retorna informações de depuração sobre a validação de um IP
   */
  public getIpValidationInfo(ip: string): {
    originalIp: string;
    cleanedIp: string;
    isValid: boolean;
    isAllowed: boolean;
    matchedRule?: string;
    validationEnabled: boolean;
  } {
    const cleanedIp = this.cleanIp(ip);
    const isValid = this.isValidIpFormat(ip);
    let matchedRule: string | undefined;
    let isAllowed = false;

    if (!this.enableIpWhitelist) {
      isAllowed = true;
      matchedRule = 'Validação desativada';
    } else if (this.allowedIps.includes(cleanedIp)) {
      isAllowed = true;
      matchedRule = `IP direto: ${cleanedIp}`;
    } else {
      // Verificar CIDRs
      for (const cidr of this.allowedCidrs) {
        try {
          if (this.isIpInCidr(cleanedIp, cidr)) {
            isAllowed = true;
            matchedRule = `CIDR: ${cidr}`;
            break;
          }
        } catch (error) {
          // Continue verificando outros CIDRs
        }
      }
    }

    return {
      originalIp: ip,
      cleanedIp,
      isValid,
      isAllowed,
      matchedRule,
      validationEnabled: this.enableIpWhitelist,
    };
  }

  /**
   * Método utilitário para extrair mensagem de erro com segurança de tipo
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
