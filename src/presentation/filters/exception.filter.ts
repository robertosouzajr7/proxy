import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get('nodeEnv') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Sanitizar URLs e dados sensíveis antes de logar
    const sanitizedUrl = this.sanitizeUrl(request.url);
    const clientIp = request.headers['x-forwarded-for'] || request.ip;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        errorCode = (exceptionResponse as any).error || errorCode;
      } else {
        message = exceptionResponse as string;
      }
    }

    // Log detalhado do erro, com níveis apropriados
    if (status >= 500) {
      this.logger.error(
        `Erro ${status} para ${request.method} ${sanitizedUrl} de ${clientIp}`,
        exception instanceof Error
          ? this.sanitizeStackTrace(exception.stack)
          : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `Erro ${status} para ${request.method} ${sanitizedUrl} de ${clientIp}: ${message}`,
      );
    }

    // Resposta ao cliente com informações limitadas em produção
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: sanitizedUrl,
      message: this.isProduction
        ? this.getPublicErrorMessage(status, message)
        : message,
      code: errorCode,
      // Incluir detalhes apenas em desenvolvimento
      ...(this.isProduction
        ? {}
        : {
            details: exception instanceof Error ? exception.message : undefined,
          }),
    };

    response.status(status).json(errorResponse);
  }

  private sanitizeUrl(url: string): string {
    // Remover tokens, chaves de API e outros dados sensíveis da URL
    return url.replace(
      /[?&](token|key|api_key|password|secret)=[^&]*/g,
      '$1=[REDACTED]',
    );
  }

  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;

    // Substituir os caminhos por [REDACTED]
    return stack
      .split('\n')
      .map((line) => line.replace(/(\w:\\[^:]+)|(\/[^:]+)/, '[REDACTED]'))
      .join('\n');
  }

  private getPublicErrorMessage(
    status: number,
    originalMessage: string,
  ): string {
    // Garantir que retornamos as mensagens genéricas em produção
    const genericMessages = {
      400: 'Requisição inválida',
      401: 'Não autorizado',
      403: 'Acesso negado',
      404: 'Recurso não encontrado',
      429: 'Muitas requisições',
      500: 'Erro interno do servidor',
      502: 'Erro de comunicação com serviço externo',
      504: 'Tempo limite excedido',
    };

    return (
      genericMessages[status] || 'Ocorreu um erro ao processar a requisição'
    );
  }
}
