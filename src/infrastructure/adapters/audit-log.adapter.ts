import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

interface AuditLogEntry {
  timestamp: string;
  clientIp: string;
  userId?: string;
  action: string;
  resource: string;
  status: string;
  details?: any;
}

@Injectable()
export class AuditLogAdapter {
  private readonly logger = new Logger(AuditLogAdapter.name);
  private readonly logToConsole: boolean;
  private readonly logToFile: boolean;
  private readonly logFilePath: string;

  constructor(private configService: ConfigService) {
    this.logToConsole =
      this.configService.get<boolean>('logging.audit.console') || false;
    this.logToFile =
      this.configService.get<boolean>('logging.audit.file') || false;
    this.logFilePath =
      this.configService.get<string>('logging.audit.filePath') ||
      'logs/audit.log';

    // Criar diretório de logs se não existir
    if (this.logToFile) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  log(entry: AuditLogEntry): void {
    const logEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    };

    // Log para console
    if (this.logToConsole) {
      this.logger.log(`AUDIT: ${JSON.stringify(logEntry)}`);
    }

    // Log para arquivo
    if (this.logToFile) {
      try {
        fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry) + '\n');
      } catch (error: unknown) {
        // Extrair mensagem de erro com segurança
        const errorMessage = this.getErrorMessage(error);
        this.logger.error(`Erro ao escrever log de auditoria: ${errorMessage}`);
      }
    }
  }

  logRequest(req: any, res: any, status: string): void {
    const clientIp =
      req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const userId = req.headers['authorization'] ? 'authenticated' : 'anonymous';
    const method = req.method;
    const url = req.originalUrl;
    const statusCode = res.statusCode;

    this.log({
      timestamp: new Date().toISOString(),
      clientIp,
      userId,
      action: method,
      resource: url,
      status: `${status} (${statusCode})`,
      details: {
        headers: this.sanitizeHeaders(req.headers),
        query: req.query,
        responseTime: res.responseTime,
      },
    });
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };

    // Remover dados sensíveis
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer [REDACTED]';
    }

    if (sanitized.cookie) {
      sanitized.cookie = '[REDACTED]';
    }

    return sanitized;
  }

  // Método auxiliar para extrair mensagem de erro de forma segura
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return String(error);
  }
}
