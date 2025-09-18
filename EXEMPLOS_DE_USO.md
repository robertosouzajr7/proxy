# API de Proxy - Suporte a Arquivos

## Resumo das Melhorias

A API de proxy agora suporta **3 tipos de requisições**:

1. **JSON tradicional** (como antes)
2. **Multipart/form-data** (upload de arquivos)
3. **JSON com base64** (arquivos embutidos no JSON)

---

## Tipos de Requisições Suportadas

### 1. JSON Tradicional (compatibilidade mantida)

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/",
    "nome": "João Silva",
    "email": "joao@email.com"
  }'
```

### 2. Multipart/Form-Data (Upload de Arquivos)

```bash
curl -X POST http://localhost:3000/ \
  -H "Authorization: Bearer seu-token" \
  -F "targetUrl=https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/" \
  -F "nome=João Silva" \
  -F "email=joao@email.com" \
  -F "arquivo=@/caminho/para/imagem.jpg" \
  -F "documento=@/caminho/para/documento.pdf"
```

### 3. JSON com Base64 (Arquivos Embutidos)

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/",
    "nome": "João Silva",
    "arquivo": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...",
    "documento": {
      "data": "JVBERi0xLjQKJdPr6eEKMSAwIG9iago8...",
      "filename": "documento.pdf",
      "mimetype": "application/pdf"
    }
  }'
```

---

## Configurações e Limites

### Arquivos Permitidos

- **Tipos**: JPEG, PNG, GIF, WebP, PDF, TXT, DOC, DOCX
- **Tamanho máximo**: 5MB por arquivo
- **Quantidade máxima**: 10 arquivos por requisição

### Validações Implementadas

- Verificação de tipo MIME
- Validação de extensão de arquivo
- Controle de tamanho
- Sanitização de nomes de arquivo

---

## Como Funciona Internamente

### 1. Processamento Multipart

```typescript
// O middleware MulterMiddleware processa os arquivos
// Os arquivos ficam disponíveis em req.files
// Os campos de texto ficam em req.body
```

### 2. Processamento Base64

```typescript
// O FileUploadService detecta campos base64
// Converte base64 para buffer
// Cria FormData automaticamente
```

### 3. Envio para API de Destino

```typescript
// Sempre envia como FormData se houver arquivos
// Mantém compatibilidade com JSON puro
// Headers corretos são definidos automaticamente
```

---

## Integração com API de Conversão

Para usar com sua API de conversão de imagens, agora você pode:

### Opção 1: Enviar arquivo via multipart

```typescript
// Na sua API de conversão
const formData = new FormData();
formData.append(
  'targetUrl',
  'https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/',
);
formData.append('arquivo', imageBuffer, 'imagem_otimizada.jpg');
formData.append('authToken', token);

const response = await axios.post('http://proxy:3000/', formData, {
  headers: formData.getHeaders(),
});
```

### Opção 2: Enviar base64 via JSON (recomendado)

```typescript
// Na sua API de conversão
const payload = {
  targetUrl: 'https://forms-homo.salvador.ba.gov.br/api/flow/arquivo-upload/',
  arquivo: optimizedImageBase64, // String base64 pura
  authToken: token,
};

const response = await axios.post('http://proxy:3000/', payload, {
  headers: { 'Content-Type': 'application/json' },
});
```

---

## Logs e Monitoramento

### Logs Disponíveis

- Upload de arquivos processados
- Validações de arquivo
- Conversões base64 → FormData
- Tempo de processamento
- Erros detalhados

### Exemplo de Log

```
[MulterMiddleware] 2 arquivo(s) processado(s) com sucesso
[FileUploadService] Arquivo validado: {originalname: "imagem.jpg", size: 102400}
[ProxyService] Arquivos base64 detectados: 1
[ProxyService] Resposta recebida: 200 em 1250ms
```

---

## Tratamento de Erros

### Erros de Validação

```json
{
  "error": "Erro de upload",
  "message": "Arquivo muito grande. Tamanho máximo: 5MB",
  "code": "LIMIT_FILE_SIZE"
}
```

### Erros de Tipo de Arquivo

```json
{
  "error": "Validação falhou",
  "message": "Tipo de arquivo não permitido: application/exe"
}
```

---

## Migração da API de Conversão

Para migrar sua API de conversão atual:

1. **Instale as dependências**: `npm install`
2. **Substitua os arquivos** pelos artefatos fornecidos
3. **Atualize as chamadas** para o proxy:

```typescript
// ANTES (não funcionava com arquivos)
const response = await axios.post(proxyUrl, {
  targetUrl: apiUrl,
  imageUrl: url,
  authToken: token,
});

// DEPOIS (funciona com arquivos)
const response = await axios.post(proxyUrl, {
  targetUrl: apiUrl,
  arquivo: optimizedImageBase64, // Base64 da imagem otimizada
  authToken: token,
});
```

---

## Próximos Passos

1. **Testar a API de proxy** com os novos recursos
2. **Atualizar a API de conversão** para usar base64
3. **Remover estratégias complexas** que não funcionavam
4. **Simplificar o envio** para a prefeitura

A abordagem base64 via JSON é mais simples e confiável que as múltiplas estratégias anteriores.
