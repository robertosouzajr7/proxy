import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuditLogAdapter } from 'src/infrastructure/adapters/audit-log.adapter';

@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditLogMiddleware.name);

  constructor(private readonly auditLogAdapter: AuditLogAdapter) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Registrar tempo de início
    const startTime = Date.now();
    const self = this;

    // Interceptar o fim da resposta
    const originalEnd = res.end;
    res.end = function (this: Response, ...args) {
      // Calcular tempo de resposta
      const responseTime = Date.now() - startTime;
      res['responseTime'] = responseTime;

      // Registrar log de auditoria
      const status = res.statusCode >= 400 ? 'FAILED' : 'SUCCESS';
      self.auditLogAdapter.logRequest(req, res, status);

      // Chamar o método original
      return originalEnd.apply(this, args);
    }.bind(res);

    next();
  }
}
