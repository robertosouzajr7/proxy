# Estágio de build
FROM node:18-alpine AS build

# Diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./
COPY tsconfig*.json ./

# Instalar dependências com cache otimizado
RUN npm ci --legacy-peer-deps

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Remover dev dependencies mantendo a flag
RUN npm prune --production --legacy-peer-deps

# Estágio de produção
FROM node:18-alpine AS production

# Instalar ping e ferramentas de rede para verificação de VPN
RUN apk add --no-cache iputils curl bind-tools

# Diretório de trabalho
WORKDIR /app

# Criar diretório para logs
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Copiar arquivos do estágio de build
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000
ENV TARGET_BASE_URL=dynamic
ENV TARGET_SSO_URL=dynamic
ENV PROXY_ENABLED=true
ENV ENABLE_IP_WHITELIST=true
ENV ENABLE_VPN_CHECK=true
ENV VPN_CHECK_INTERVAL=30000
ENV AUDIT_LOG_FILE=true
ENV AUDIT_LOG_CONSOLE=false
ENV AUDIT_LOG_PATH=/app/logs/audit.log
ENV RATE_LIMIT_WINDOW_MS=60000
ENV RATE_LIMIT_MAX=100

# Expor porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/status || exit 1

# Usuário não-root para segurança
USER node

# Comando para iniciar a aplicação
CMD ["node", "dist/main"]