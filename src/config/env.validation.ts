import { plainToClass } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsString,
  validateSync,
} from 'class-validator';

enum Enviroment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnviromentVariables {
  @IsEnum(Enviroment, { message: 'Invalid environment' })
  NODE_ENV!: Enviroment;

  @IsNumber()
  PORT!: number;

  @IsString()
  TARGET_BASE_URL!: string;

  @IsString()
  TARGET_SSO_URL!: string;

  @IsBoolean()
  PROXY_ENABLED!: boolean;

  @IsBoolean()
  ENABLE_IP_WHITELIST!: boolean;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnviromentVariables, {
    ...config,
    PORT: parseInt(config.PORT as string, 10),
    PROXY_ENABLED: config.PROXY_ENABLED === 'true',
    ENABLE_IP_WHITELIST: config.ENABLE_IP_WHITELIST === 'true',
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
