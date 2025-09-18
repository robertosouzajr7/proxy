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

  constructor(private readonly ipValidatorService: IpValidatorService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const ip =
      req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const clientIp = Array.isArray(ip) ? ip[0] : ip;

    this.logger.log(`Requisição recebida de IP: ${clientIp}`);

    if (
      !clientIp ||
      !this.ipValidatorService.isIpAllowed(clientIp.toString())
    ) {
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
}
