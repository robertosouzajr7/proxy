// test-vpn.js
const https = require('https');
const fs = require('fs');

// URL do ambiente de homologação
const targetUrl =
  process.env.TARGET_BASE_URL || 'https://forms-homo.salvador.ba.gov.br/';

console.log(`Testando conectividade com: ${targetUrl}`);

// Desativar a verificação de certificado para fins de teste
const agent = new https.Agent({
  rejectUnauthorized: false,
});

// Tentativa de fazer uma simples requisição GET
const req = https.get(
  targetUrl,
  {
    agent,
    timeout: 10000, // 10 segundos de timeout
    headers: {
      'User-Agent': 'VPN-Test/1.0',
    },
  },
  (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Conexão estabelecida com sucesso!');
      console.log(`Tamanho da resposta: ${data.length} bytes`);
      console.log(`Primeiros 200 caracteres: ${data.substring(0, 200)}...`);

      // Salvar resposta completa para análise
      fs.writeFileSync('vpn-test-response.html', data);
      console.log('Resposta completa salva em vpn-test-response.html');
    });
  },
);

req.on('error', (e) => {
  console.error('Erro de conexão:', e.message);
  if (e.code === 'ECONNREFUSED') {
    console.error(
      'Conexão recusada. Verifique se o endereço está correto e acessível.',
    );
  } else if (e.code === 'ETIMEDOUT') {
    console.error(
      'Timeout na conexão. Verifique se a VPN está funcionando corretamente.',
    );
  } else if (e.code === 'ENOTFOUND') {
    console.error(
      'Endereço não encontrado. Verifique o URL e a resolução DNS.',
    );
  }
});

req.on('timeout', () => {
  console.error('Timeout na requisição após 10 segundos');
  req.destroy();
});

console.log('Teste iniciado. Aguardando resposta...');
