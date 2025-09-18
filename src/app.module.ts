import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProxyController } from './presentation/controllers/proxy.controller';
import { ProxyService } from './application/services/proxy.services';
import { FileUploadService } from './application/services/file-upload.service';
import { IpValidatorService } from './application/services/ip-validator.services';
import { IpFilterMiddleware } from './presentation/middlewares/ip-filter.middleware';
import { RateLimitMiddleware } from './presentation/middlewares/rate-limit.middleware';
import { AuditLogMiddleware } from './presentation/middlewares/audit-log.middleware';
import { MulterMiddleware } from './presentation/middlewares/multer.middleware';
import { CacheAdapter } from './infrastructure/adapters/cache.adapters';
import { RateLimiterAdapter } from './infrastructure/adapters/rate-limiter.adapters';
import { AuditLogAdapter } from './infrastructure/adapters/audit-log.adapter';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './presentation/filters/exception.filter';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { VpnCheckerAdapter } from './infrastructure/adapters/vpn-checker.adapters';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
  ],
  controllers: [ProxyController],
  providers: [
    ProxyService,
    FileUploadService, // Novo serviço para upload de arquivos
    IpValidatorService,
    CacheAdapter,
    RateLimiterAdapter,
    AuditLogAdapter,
    VpnCheckerAdapter,
    {
      provide: 'ALLOWED_DOMAINS',
      useFactory: (configService: ConfigService) => {
        return configService.get<string>('security.allowedDomains') ?? '';
      },
      inject: [ConfigService],
    },
    {
      provide: 'VPN_URL',
      useFactory: (configService: ConfigService) => {
        return configService.get<string>('vpn.url');
      },
      inject: [ConfigService],
    },
    {
      provide: 'VPN_CHECK_INTERVAL',
      useFactory: (configService: ConfigService) => {
        return configService.get<number>('vpn.checkInterval');
      },
      inject: [ConfigService],
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(private configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    // Aplicar middleware de processamento de arquivos PRIMEIRO
    // (deve vir antes dos outros middlewares para processar multipart/form-data)
    consumer
      .apply(MulterMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Aplicar middleware de auditoria em todas as rotas
    consumer
      .apply(AuditLogMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Aplicar middleware de rate limiting em todas as rotas
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Aplicar o middleware de filtro de IP em todas as rotas
    if (this.configService.get<boolean>('security.enableIpWhitelist')) {
      consumer
        .apply(IpFilterMiddleware)
        .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
  }
}
