import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { ProxyHandlerInterface } from 'src/domain/interfaces/proxy-handler.interfaces';
import { FileUploadService } from './file-upload.service';

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

  constructor(
    private configService: ConfigService,
    private fileUploadService: FileUploadService,
  ) {}

  async handleRequest(req: Request, res: Response): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Processando requisição: ${req.method} ${req.originalUrl}`);
    this.logger.debug(`Content-Type: ${req.headers['content-type']}`);

    try {
      // Determinar tipo de conteúdo da requisição
      const contentType = req.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');
      const isJson = contentType.includes('application/json');

      let targetUrl: string;
      let requestData: any;

      if (isMultipart) {
        // Processar requisição multipart/form-data
        const result = await this.handleMultipartRequest(req);
        targetUrl = result.targetUrl;
        requestData = result.formData;
      } else if (isJson) {
        // Processar requisição JSON (incluindo base64)
        const result = await this.handleJsonRequest(req);
        targetUrl = result.targetUrl;
        requestData = result.data;
      } else {
        return res.status(400).json({
          error: 'Tipo de conteúdo não suportado',
          message: 'Suportamos apenas application/json e multipart/form-data',
        });
      }

      if (!targetUrl) {
        return res.status(400).json({
          error: 'Parâmetro obrigatório ausente',
          message: 'O parâmetro "targetUrl" é obrigatório',
        });
      }

      // Validar entrada
      const validation = this.validateInput(targetUrl, {});
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validação falhou',
          message: validation.error,
        });
      }

      // Construir URL completa
      const fullUrl = this.normalizeUrl(targetUrl);
      this.logger.debug(`URL de destino: ${fullUrl}`);

      // Fazer a requisição
      await this.makeProxyRequest(req, res, fullUrl, requestData, isMultipart);
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Erro após ${duration}ms: ${errorMessage}`);

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Erro interno do servidor',
          message:
            this.configService.get('nodeEnv') === 'production'
              ? 'Ocorreu um erro ao processar a requisição'
              : errorMessage,
        });
      }
    }
  }

  /**
   * Processa requisições multipart/form-data (arquivos)
   */
  private async handleMultipartRequest(
    req: Request,
  ): Promise<{ targetUrl: string; formData: any }> {
    // Verificar se tem arquivos
    const files = (req as any).files || [];
    const body = req.body || {};

    this.logger.debug(`Arquivos recebidos: ${files.length}`);
    this.logger.debug(`Campos de texto: ${Object.keys(body).length}`);

    // Extrair targetUrl do body
    const { targetUrl, ...textFields } = body;

    if (!targetUrl) {
      throw new Error('targetUrl é obrigatório em requisições multipart');
    }

    // Validar arquivos
    for (const file of files) {
      const validation = this.fileUploadService.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      this.logger.debug(
        `Arquivo validado: ${this.fileUploadService.sanitizeFileLog(file)}`,
      );
    }

    // Criar FormData para envio
    const formData = this.fileUploadService.createFormData(files, textFields);

    return { targetUrl, formData };
  }

  /**
   * Processa requisições JSON (incluindo base64)
   */
  private async handleJsonRequest(
    req: Request,
  ): Promise<{ targetUrl: string; data: any }> {
    if (!req.body || typeof req.body !== 'object') {
      throw new Error('O body deve ser um objeto JSON');
    }

    const { targetUrl, ...params } = req.body;

    if (!targetUrl) {
      throw new Error(
        'O parâmetro "targetUrl" é obrigatório no body da requisição',
      );
    }

    // Verificar se há arquivos base64 no JSON
    const { files, cleanBody } =
      this.fileUploadService.processBase64Files(params);

    if (files.length > 0) {
      // Se há arquivos base64, converter para FormData
      this.logger.debug(`Arquivos base64 detectados: ${files.length}`);

      // Validar arquivos base64
      for (const file of files) {
        const validation = this.fileUploadService.validateFile(file);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        this.logger.debug(
          `Arquivo base64 validado: ${this.fileUploadService.sanitizeFileLog(file)}`,
        );
      }

      const formData = this.fileUploadService.createFormData(files, cleanBody);
      return { targetUrl, data: formData };
    } else {
      // Requisição JSON normal
      return { targetUrl, data: cleanBody };
    }
  }

  /**
   * Faz a requisição proxy
   */
  private async makeProxyRequest(
    req: Request,
    res: Response,
    fullUrl: string,
    requestData: any,
    isFormData: boolean,
  ): Promise<void> {
    const startTime = Date.now();

    // Configurar headers
    const headers = this.sanitizeHeaders(req.headers);

    if (isFormData) {
      // Para FormData, deixar o axios/form-data definir o content-type
      delete headers['content-type'];
      // Adicionar headers do FormData se disponível
      if (requestData && typeof requestData.getHeaders === 'function') {
        Object.assign(headers, requestData.getHeaders());
      }
    }

    const config = {
      method: req.method.toLowerCase(),
      url: fullUrl,
      headers: headers,
      data: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? requestData
        : undefined,
      params: !['POST', 'PUT', 'PATCH'].includes(req.method)
        ? requestData
        : undefined,
      timeout: 60000, // Aumentado para upload de arquivos
      maxContentLength: 10 * 1024 * 1024, // 10MB para arquivos
      maxBodyLength: 10 * 1024 * 1024, // 10MB para arquivos
      validateStatus: (status) => status >= 200 && status < 600,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: this.configService.get('nodeEnv') === 'production',
      }),
    };

    this.logger.debug(
      `Configuração da requisição: ${JSON.stringify({
        method: config.method,
        url: config.url,
        hasData: !!config.data,
        isFormData: isFormData,
        headers: Object.keys(headers),
      })}`,
    );

    const response = await axios(config);

    const duration = Date.now() - startTime;
    this.logger.log(
      `Resposta recebida: ${response.status} em ${duration}ms para ${fullUrl}`,
    );

    // Transferir headers da resposta
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
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      return targetUrl;
    }
    return `https://${targetUrl}`;
  }

  private validateInput(
    targetUrl: string,
    params: any,
  ): { valid: boolean; error?: string } {
    try {
      // Verificar se é uma URL válida
      const url = new URL(this.normalizeUrl(targetUrl));

      // Verificar protocolos permitidos
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          valid: false,
          error: 'Protocolo não permitido',
        };
      }

      // Verificar domínios permitidos
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
}
