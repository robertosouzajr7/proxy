import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const nodeEnv = configService.get<string>('nodeEnv');

  // Aumentar o limite de tamanho do corpo da requisição
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Aplicar validação de DTO global
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const logger = new Logger('Bootstrap');

  await app.listen(port, () => {
    logger.log(`Servidor proxy iniciado na porta ${port} em modo ${nodeEnv}`);
    logger.log(
      `URL base de destino: ${configService.get<string>('proxy.targetUrl')}`,
    );
    logger.log(
      `Verificação de IP ${configService.get<boolean>('security.enableIpWhitelist') ? 'ativada' : 'desativada'}`,
    );
  });
}

bootstrap();
