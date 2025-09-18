# Infobip Proxy para Prefeitura de Salvador

Este projeto é um servidor proxy seguro desenvolvido para facilitar a comunicação entre o simulador da Infobip e o ambiente de homologação da Prefeitura de Salvador que está protegido por VPN.

## Funcionalidades

- Encaminhamento dinâmico de requisições para qualquer URL especificada no corpo da requisição
- Filtro de IPs para permitir apenas requisições de endereços autorizados
- Proteção contra ataques com rate limiting integrado
- Sanitização automática de dados sensíveis em logs e cabeçalhos
- Logs de auditoria detalhados para fins de diagnóstico e segurança
- Verificação automática de conexão VPN
- Suporte a HTTPS com validação de certificados

## Requisitos

- Node.js 18+
- npm ou yarn
- Conexão VPN ativa para a rede da Prefeitura (FortiClient)
- Docker e Docker Compose (opcional, para conteinerização)

## Configuração

### Variáveis de Ambiente Completas

```
# Configurações Básicas
NODE_ENV=production        # production, development, test
PORT=3000                  # Porta do servidor

# Configurações do Proxy
TARGET_BASE_URL=           # URL base para requisições (opcional)
TARGET_SSO_URL=            # URL base para autenticação (opcional)
PROXY_ENABLED=true         # Habilitar/desabilitar o proxy

# Configurações de Segurança
ENABLE_IP_WHITELIST=true   # Habilitar filtro de IPs
RATE_LIMIT_WINDOW_MS=60000 # Janela de tempo para rate limiting (ms)
RATE_LIMIT_MAX=100         # Número máximo de requisições por janela

# Configurações de VPN
ENABLE_VPN_CHECK=true      # Habilitar verificação de VPN
VPN_CHECK_INTERVAL=30000   # Intervalo entre verificações (ms)

# Configurações de Logging
AUDIT_LOG_FILE=true        # Habilitar log em arquivo
AUDIT_LOG_CONSOLE=false    # Habilitar log no console
AUDIT_LOG_PATH=logs/audit.log # Caminho para arquivo de logs
```

## Instalação

1. Clone o repositório:

```bash
git clone https://github.com/prefeituradesalvador/infobip-proxy.git
cd infobip-proxy
```

2. Instale as dependências:

```bash
npm install
```

3. Compile o Projeto:

```bash
npm run build
```

## Execução

### Modo de desenvolvimento

```bash
npm run start:dev
```

### Modo de produção

```bash
npm run start:prod
```

### Execução de testes

```bash
# Executar todos os testes
npm test

# Executar testes com cobertura
npm run test:cov

# Executar testes em modo watch
npm run test:watch
```

## Docker

### Usando Docker

```bash
# Construir a imagem
docker build -t infobip-proxy .

# Executar o container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e TARGET_BASE_URL=your_target_url \
  -e TARGET_SSO_URL=your_sso_url \
  -e PROXY_ENABLED=true \
  -e ENABLE_IP_WHITELIST=true \
  -v ./logs:/app/logs \
  infobip-proxy
```

### Usando Docker Compose

```bash
# Iniciar o serviço
docker-compose up -d

# Visualizar logs
docker-compose logs -f

# Parar o serviço
docker-compose down
```

## Uso

### O proxy foi projetado para receber requisições com a seguinte estrutura:

```http
POST http://localhost:3000/api/proxy
Content-Type: application/json
Authorization: Bearer seu-token-aqui

{
  "targetUrl": "https://forms-homo.salvador.ba.gov.br/flow/responder-fluxo/",
  "param1": "valor1",
  "param2": "valor2"
}
```

### Onde:

- `targetUrl`: É a URL completa ou parcial do serviço de destino
  - Se começar com http:// ou https://, será usada diretamente
  - Caso contrário, será prefixada com https://
- Todos os outros parâmetros no corpo da requisição serão encaminhados para o destino

### Exemplos de URLs de destino:

```json
{
  "targetUrl": "https://forms-homo.salvador.ba.gov.br/flow/responder-fluxo/",
  "cpf": "04612794524",
  "flow": "casa-civil-consulta-publica39",
  "canal": "Whatsapp"
}
```

Ou:

```json
{
  "targetUrl": "forms-homo.salvador.ba.gov.br/login",
  "username": "usuario",
  "password": "senha"
}
```

### Endpoints de Status e Diagnóstico

#### Verificação de Status do Servidor

```http
GET http://localhost:3000/status
```

Resposta:

```json
{
  "status": "online",
  "timestamp": "2025-05-08T12:34:56.789Z",
  "client_ip": "192.168.1.1",
  "auth_token": "presente" // ou "ausente"
}
```

#### Verificação de Status da VPN

```http
GET http://localhost:3000/vpn-status
```

Resposta:

```json
{
  "vpnStatus": "connected",
  "timestamp": "2025-05-08T12:34:56.789Z",
  "details": [
    "Rota para servidor VPN encontrada: 0.0.0.0 0.0.0.0 10.255.1.1",
    "Adaptador VPN encontrado: FortiSSL VPN",
    "Ping para servidor VPN: Reply from 10.255.1.1: bytes=32 time=5ms TTL=64"
  ],
  "message": "VPN COGEL está conectada e funcionando"
}
```

## Características de Segurança

O Infobip Proxy inclui várias camadas de segurança para proteger a comunicação:

1. **Whitelist de IPs**: Apenas IPs autorizados podem acessar o proxy (configurável via variáveis de ambiente)
2. **Rate Limiting**: Proteção contra excesso de requisições de um mesmo IP
3. **Sanitização de Dados**: Remoção automática de dados sensíveis (tokens, senhas) dos logs
4. **Verificação de VPN**: Garantia de que requisições só são processadas quando a VPN está ativa
5. **Validação de Domínios**: Apenas domínios explicitamente permitidos são acessíveis
6. **Headers de Segurança**: Adição automática de headers como Content-Security-Policy, X-Frame-Options, etc.
7. **Logs de Auditoria**: Registro detalhado de todas as requisições para análise de segurança

## Solução de Problemas

### Problemas Comuns

#### VPN desconectada

Se o servidor retornar erro 503 com mensagem sobre VPN desconectada, verifique:

- Se a conexão FortiClient está ativa
- Se você consegue acessar recursos internos da rede
- Use o endpoint `/vpn-status` para verificar detalhes da conexão

#### Problemas de acesso devido ao filtro de IP

Se você receber erro 403, seu IP não está na whitelist. Solicite inclusão do seu IP no arquivo de configuração.

#### Erros de timeout

Aumente o valor de timeout no config:

```
// Valor padrão é 30000 (30 segundos)
// Em src/application/services/proxy.services.ts
timeout: 60000, // 60 segundos
```

### Logs para Diagnóstico

Os logs de auditoria contêm informações detalhadas que podem auxiliar na resolução de problemas:

```bash
# Ver logs de auditoria
cat logs/audit.log
```

## Arquitetura

O Infobip Proxy foi construído utilizando princípios de arquitetura limpa:

- **Domain**: Contratos e interfaces
- **Application**: Lógica de negócios e serviços
- **Infrastructure**: Adaptadores para serviços externos
- **Presentation**: Controllers e middlewares para interação HTTP

Esta separação permite melhor testabilidade e manutenção do código.

## Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Crie um novo Pull Request

Certifique-se de executar todos os testes antes de enviar contribuições.

---

Esta implementação permite que a URL de destino seja completamente dinâmica, sendo enviada em cada requisição, sem necessidade de configurar uma URL base no Dockerfile ou variáveis de ambiente. O proxy é flexível, podendo encaminhar para qualquer destino autorizado conforme necessário, simplificando a instalação e implantação sem precisar de configurações adicionais.
