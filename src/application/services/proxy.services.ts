import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { ProxyHandlerInterface } from 'src/domain/interfaces/proxy-handler.interfaces';

// Interface para ajudar na tipagem
interface AxiosLikeError {
  config?: {
    url?: string;
    headers?: any;
  };
  message?: string;
  code?: string;
}

@Injectable()
export class ProxyService implements ProxyHandlerInterface {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private configService: ConfigService) {}

  async handleRequest(req: Request, res: Response): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Processando requisição: ${req.method} ${req.originalUrl}`);

    try {
      // Verificar se temos body e se ele contém o targetUrl
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
          error: 'Requisição inválida',
          message: 'O body deve ser um objeto JSON',
        });
      }

      // Extrair a URL de destino e os parâmetros do body
      const { targetUrl, ...params } = req.body;

      if (!targetUrl) {
        return res.status(400).json({
          error: 'Parâmetro obrigatório ausente',
          message:
            'O parâmetro "targetUrl" é obrigatório no body da requisição',
        });
      }

      // Validar entrada
      const validation = this.validateInput(targetUrl, params);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validação falhou',
          message: validation.error,
        });
      }

      // Construir URL completa
      const fullUrl = this.normalizeUrl(targetUrl);

      this.logger.debug(`URL de destino: ${fullUrl}`);

      // Limitar log de parâmetros para evitar exposição de dados sensíveis
      if (this.configService.get('nodeEnv') !== 'production') {
        this.logger.debug(
          `Parâmetros adicionais: ${JSON.stringify(this.sanitizeParams(params))}`,
        );
      }

      // Fazer a requisição com timeout reduzido
      const config = {
        method: req.method.toLowerCase(),
        url: fullUrl,
        headers: this.sanitizeHeaders(req.headers),
        data: ['POST', 'PUT', 'PATCH'].includes(req.method)
          ? params
          : undefined,
        params: !['POST', 'PUT', 'PATCH'].includes(req.method)
          ? params
          : undefined,
        timeout: 30000, // Reduzido para 30 segundos por razões de segurança
        maxContentLength: 5 * 1024 * 1024, // Reduzido para 5MB
        maxBodyLength: 5 * 1024 * 1024, // Reduzido para 5MB
        validateStatus: (status) => status >= 200 && status < 600, // Aceitar status de erro para tratamento adequado
        httpsAgent: new (require('https').Agent)({
          // Habilitar verificação SSL em produção
          rejectUnauthorized:
            this.configService.get('nodeEnv') === 'production',
        }),
      };

      const response = await axios(config);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Resposta recebida: ${response.status} em ${duration}ms para ${fullUrl}`,
      );

      // Transferir headers da resposta com sanitização
      const safeHeaders = this.sanitizeResponseHeaders(response.headers);
      Object.keys(safeHeaders).forEach((key) => {
        try {
          res.setHeader(key, safeHeaders[key]);
        } catch (e) {
          this.logger.warn(`Não foi possível definir o header ${key}`);
        }
      });

      // Adicionar headers seguros
      res.setHeader('X-Proxied-By', 'NestJS-Infobip-Proxy');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      );

      // Enviar resposta
      res.status(response.status).send(response.data);
    } catch (error: unknown) {
      const duration = Date.now() - startTime;

      // Verificar se o erro é do tipo AxiosError ou tem a estrutura esperada
      const axiosError = this.isAxiosLikeError(error);

      if (axiosError && axiosError.config) {
        // Sanitizar URL e headers antes de logar se existirem
        if (axiosError.config.url) {
          axiosError.config.url = this.sanitizeUrl(axiosError.config.url);
        }
        if (axiosError.config.headers) {
          axiosError.config.headers = this.sanitizeHeaders(
            axiosError.config.headers,
          );
        }
      }

      // Obter mensagem de erro de forma segura
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Erro após ${duration}ms: ${errorMessage}`);

      if (!res.headersSent) {
        // Resposta de erro segura
        res.status(500).json({
          error: 'Erro interno do servidor',
          message:
            this.configService.get('nodeEnv') === 'production'
              ? 'Ocorreu um erro ao processar a requisição'
              : errorMessage,
          code: axiosError?.code || 'UNKNOWN',
        });
      }
    }
  }

  // Type guard para verificar se é um erro do tipo Axios
  private isAxiosLikeError(error: unknown): AxiosLikeError | null {
    if (error && typeof error === 'object' && 'message' in error) {
      return error as AxiosLikeError;
    }
    return null;
  }

  // Método para obter a mensagem de erro com segurança
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }
    return String(error);
  }

  // Método para normalizar a URL, garantindo que seja uma URL completa
  private normalizeUrl(targetUrl: string): string {
    // Se a URL já começa com http ou https, usar diretamente
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      return targetUrl;
    }

    // Se a URL não começa com protocolo, adicionar https://
    return `https://${targetUrl}`;
  }

  // Em proxy.service.ts
  private validateInput(
    targetUrl: string,
    params: any,
  ): { valid: boolean; error?: string } {
    // Validar formato da URL
    try {
      // Verificar tamanho máximo dos parâmetros primeiro
      const MAX_PARAM_LENGTH = 10000; // 10KB
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.length > MAX_PARAM_LENGTH) {
          return {
            valid: false,
            error: `Parâmetro '${key}' excede o tamanho máximo permitido`,
          };
        }
      }

      // Verificar se é uma URL válida
      const url = new URL(this.normalizeUrl(targetUrl));

      // Verificar protocolos permitidos
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          valid: false,
          error: 'Protocolo não permitido',
        };
      }

      // Verificar domínios permitidos (lista branca)
      const allowedDomains =
        this.configService.get<string[]>('security.allowedDomains') || [];
      if (
        allowedDomains.length > 0 &&
        !allowedDomains.some((domain) => url.hostname.endsWith(domain))
      ) {
        return {
          valid: false,
          error: 'Domínio não permitido',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'URL inválida',
      };
    }
  }

  private sanitizeParams(params: any): any {
    const sanitized = { ...params };

    // Lista de chaves sensíveis
    const sensitiveKeys = [
      'password',
      'senha',
      'token',
      'key',
      'secret',
      'authorization',
      'auth',
    ];

    // Sanitizar valores sensíveis
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };

    // Remover headers problemáticos
    delete sanitized.host;
    delete sanitized.connection;
    delete sanitized['content-length'];

    // Adicionar headers de segurança
    sanitized['x-forwarded-by'] = 'infobip-proxy';

    return sanitized;
  }

  private sanitizeResponseHeaders(headers: any): any {
    const sanitized = { ...headers };

    // Remover headers inseguros ou redundantes
    const unsafeHeaders = [
      'server',
      'x-powered-by',
      'x-aspnet-version',
      'x-runtime',
    ];

    unsafeHeaders.forEach((header) => {
      delete sanitized[header];
    });

    return sanitized;
  }

  private sanitizeUrl(url: string): string {
    if (!url) return '';

    try {
      const parsedUrl = new URL(url);

      // Sanitizar parâmetros sensíveis na query string
      const sensitiveParams = ['token', 'key', 'apikey', 'password', 'secret'];
      sensitiveParams.forEach((param) => {
        if (parsedUrl.searchParams.has(param)) {
          parsedUrl.searchParams.set(param, '[REDACTED]');
        }
      });

      return parsedUrl.toString();
    } catch (e) {
      // Em caso de URL inválida, retornar versão sanitizada
      return url.replace(
        /[\?&](token|key|apikey|password|secret)=[^&]*/gi,
        '$1=[REDACTED]',
      );
    }
  }
}
