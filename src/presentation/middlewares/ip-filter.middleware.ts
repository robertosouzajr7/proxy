import {
  Injectable,
  NestMiddleware,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { IpValidatorService } from 'src/application/services/ip-validator.services';

@Injectable()
export class IpFilterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpFilterMiddleware.name);

  // IPs que devem ser ignorados na validação (proxies, WAF, VPN, etc.)
  private readonly IGNORED_IPS = [
    '172.30.1.254', // IP do container Docker/VPN
    '127.0.0.1', // localhost
    '::1', // localhost IPv6
    '::ffff:127.0.0.1', // localhost IPv6 mapped
  ];

  constructor(private readonly ipValidatorService: IpValidatorService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = this.extractRealClientIp(req);

    this.logger.log(`Requisição recebida de IP: ${clientIp}`);

    if (!clientIp || !this.ipValidatorService.isIpAllowed(clientIp)) {
      this.logger.warn(`Acesso negado para IP: ${clientIp}`);
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Acesso negado',
        error: 'IP não autorizado',
      });
    }

    this.logger.log(`Acesso permitido para IP: ${clientIp}`);
    next();
  }

  /**
   * Extrai o IP real do cliente, ignorando IPs de proxies/WAF/VPN
   */
  private extractRealClientIp(req: Request): string | null {
    // Lista de headers que podem conter o IP real do cliente
    const ipHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip', // Cloudflare
      'x-forwarded',
      'forwarded-for',
      'forwarded',
    ];

    // Tentar extrair IP dos headers
    for (const header of ipHeaders) {
      const headerValue = req.headers[header];
      if (headerValue) {
        const ip = this.parseIpFromHeader(headerValue);
        if (ip) {
          this.logger.debug(`IP extraído do header ${header}: ${ip}`);
          return ip;
        }
      }
    }

    // Fallback para IP direto da conexão
    const directIp =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    if (directIp && !this.isIgnoredIp(directIp)) {
      this.logger.debug(`IP extraído da conexão direta: ${directIp}`);
      return this.cleanIp(directIp);
    }

    this.logger.warn('Não foi possível extrair um IP válido da requisição');
    return null;
  }

  /**
   * Processa o valor de um header que pode conter IPs
   */
  private parseIpFromHeader(headerValue: string | string[]): string | null {
    // Converter para string se for array
    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!value) return null;

    // Se contém vírgulas, é uma lista de IPs (formato x-forwarded-for)
    if (value.includes(',')) {
      const ips = value.split(',').map((ip) => ip.trim());

      // Procurar o primeiro IP que não está na lista de ignorados
      for (const ip of ips) {
        const cleanedIp = this.cleanIp(ip);
        if (
          cleanedIp &&
          !this.isIgnoredIp(cleanedIp) &&
          this.isValidIp(cleanedIp)
        ) {
          this.logger.debug(
            `IP válido encontrado na lista: ${cleanedIp} (lista completa: ${value})`,
          );
          return cleanedIp;
        }
      }
    } else {
      // Header com IP único
      const cleanedIp = this.cleanIp(value);
      if (
        cleanedIp &&
        !this.isIgnoredIp(cleanedIp) &&
        this.isValidIp(cleanedIp)
      ) {
        return cleanedIp;
      }
    }

    return null;
  }

  /**
   * Remove prefixos IPv6 e limpa o IP
   */
  private cleanIp(ip: string): string {
    if (!ip) return '';

    // Remover o prefixo IPv6 se existir
    return ip.replace(/^::ffff:/, '').trim();
  }

  /**
   * Verifica se o IP deve ser ignorado na validação
   */
  private isIgnoredIp(ip: string): boolean {
    const cleanedIp = this.cleanIp(ip);
    const shouldIgnore = this.IGNORED_IPS.includes(cleanedIp);

    if (shouldIgnore) {
      this.logger.debug(`IP ${cleanedIp} está na lista de IPs ignorados`);
    }

    return shouldIgnore;
  }

  /**
   * Validação básica de formato de IP
   */
  private isValidIp(ip: string): boolean {
    if (!ip) return false;

    // Regex básico para IPv4
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // Regex básico para IPv6 (simplificado)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    const isValid = ipv4Regex.test(ip) || ipv6Regex.test(ip);

    if (!isValid) {
      this.logger.debug(`IP ${ip} não passou na validação de formato`);
    }

    return isValid;
  }
}
