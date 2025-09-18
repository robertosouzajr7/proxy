// src/config/configuration.ts - Configuração com melhorias de segurança

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  security: {
    enableIpWhitelist: process.env.ENABLE_IP_WHITELIST === 'true' || true,
    allowedCidrs: [
      // CIDRs da Infobip
      '193.105.74.0/24',
      '62.140.0.0/24',
      '31.0.0.0/24',
      '83.166.64.0/19',
      '202.22.160.0/20',
      '81.23.248.0/21',
      '185.255.8.0/22',
      '208.93.48.0/22',
      '89.164.98.0/24',
      '149.5.186.0/24',
      '109.117.13.32/27',
      '171.244.0.32/27',
      '151.1.137.208/28',
      '203.223.163.32/28',
      '182.48.75.160/29',
      '203.223.170.88/29',
      '13.87.78.119/32',
      '20.216.25.182/32',
      '20.173.68.171/32',
      // IPs individuais (sem formato CIDR)
      '192.168.71.56',
      '192.168.71.254',
      '189.89.171.194',
      '127.0.0.1', // localhost
    ],
    allowedDomains: [
      'forms-homo.salvador.ba.gov.br',
      'salvador.ba.gov.br',
      'bahia.gov.br',
    ],
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10), // 1 minuto
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10), // 100 requisições por minuto
    },
    cors: {
      origins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['*'],
    },
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    audit: {
      console: process.env.AUDIT_LOG_CONSOLE === 'true' || false,
      file: process.env.AUDIT_LOG_FILE === 'true' || true,
      filePath: process.env.AUDIT_LOG_PATH || 'logs/audit.log',
    },
  },
});
