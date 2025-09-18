# Teste Manual da API de Proxy

## Passos para Implementar e Testar

### 1. Implementar as Mudanças

```bash
# 1. Atualizar package.json
npm install multer@^1.4.5-lts.1 form-data@^4.0.2 @types/multer@^1.4.12 @types/form-data@^2.5.0

# 2. Criar os novos arquivos
# - src/application/services/file-upload.service.ts
# - src/presentation/middlewares/multer.middleware.ts

# 3. Substituir arquivos existentes
# - src/application/services/proxy.services.ts
# - src/app.module.ts

# 4. Compilar e executar
npm run build
npm run start:dev
```

### 2. Teste 1: JSON Tradicional (compatibilidade)

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://httpbin.org/post",
    "nome": "Teste",
    "valor": 123
  }'
```

**Resultado esperado**: Status 200 com eco dos dados enviados

### 3. Teste 2: Upload de Arquivo Real

```bash
# Criar um arquivo de teste
echo "Arquivo de teste" > teste.txt

curl -X POST http://localhost:3000/ \
  -F "targetUrl=https://httpbin.org/post" \
  -F "nome=João" \
  -F "arquivo=@teste.txt"
```

**Resultado esperado**: Status 200 com dados do arquivo na resposta

### 4. Teste 3: Base64 no JSON

```bash
# Base64 de "Hello World": SGVsbG8gV29ybGQ=
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://httpbin.org/post",
    "arquivo": "SGVsbG8gV29ybGQ=",
    "nome": "Teste Base64"
  }'
```

**Resultado esperado**: Status 200, arquivo convertido para FormData

### 5. Teste 4: Arquivo Muito Grande (erro esperado)

```bash
# Criar arquivo de 6MB (excede limite de 5MB)
dd if=/dev/zero of=arquivo_grande.txt bs=1M count=6

curl -X POST http://localhost:3000/ \
  -F "targetUrl=https://httpbin.org/post" \
  -F "arquivo=@arquivo_grande.txt"
```

**Resultado esperado**: Status 400 com erro de tamanho

### 6. Teste 5: Tipo de Arquivo Não Permitido

```bash
echo "Código malicioso" > malware.exe

curl -X POST http://localhost:3000/ \
  -F "targetUrl=https://httpbin.org/post" \
  -F "arquivo=@malware.exe"
```

**Resultado esperado**: Status 400 com erro de tipo não permitido

### 7. Verificar Logs

Os logs devem mostrar:

- Arquivos sendo processados
- Validações executadas
- Conversões de base64
- Tempo de processamento

### 8. Teste com API da Prefeitura

```bash
curl -X POST http://localhost:3000/ \
  -H "Authorization: Bearer seu-token" \
  -F "targetUrl=https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/" \
  -F "arquivo=@sua-imagem.jpg"
```

## Próximos Passos

Depois de confirmar que a API de proxy funciona:

1. **Atualizar API de conversão** para usar base64 simples
2. **Remover estratégias complexas** do ImageService
3. **Simplificar envio** para apenas uma chamada
4. **Testar integração completa**

## Verificações de Segurança

- ✅ Rate limiting mantido
- ✅ IP filtering mantido
- ✅ Validação de domínios mantida
- ✅ Logs de auditoria mantidos
- ✅ Validação de tipos de arquivo
- ✅ Limites de tamanho respeitados
