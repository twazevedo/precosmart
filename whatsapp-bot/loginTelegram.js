/**
 * @file loginTelegram.js — Gerador de Sessão Telegram para o PreçoSmart
 */
'use strict';

const readline = require('readline');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\n======================================================');
  console.log('  🚀 PreçoSmart — Conexão com Telegram (Radar Awin)   ');
  console.log('======================================================\n');

  const defaultApiId = '19847514';
  const defaultPhone = '+5511945868954';

  let apiIdInput = await ask(`👉 App api_id [Aperte ENTER para usar ${defaultApiId}]: `);
  apiIdInput = apiIdInput.trim() || defaultApiId;
  const apiId = parseInt(apiIdInput, 10);

  const apiHashRaw = await ask('👉 Cole o App api_hash (Ctrl+V): ');
  const apiHash = apiHashRaw.trim();

  if (!apiId || !apiHash) {
    console.error('❌ api_id ou api_hash inválidos. Abortando.');
    rl.close();
    return;
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5
  });

  console.log('\n📡 Conectando aos servidores do Telegram...');

  await client.start({
    phoneNumber: async () => {
      const p = await ask(`📱 Seu número [Aperte ENTER para usar ${defaultPhone}]: `);
      return p.trim() || defaultPhone;
    },
    password: async () => await ask('🔑 Senha de 2 etapas (se tiver, ou aperte ENTER): '),
    phoneCode: async () => await ask('📩 Digite o código de 5 números que o Telegram te enviou: '),
    onError: (err) => console.error('Erro:', err.message)
  });

  console.log('\n✅ Autenticado com sucesso na sua conta do Telegram!\n');

  const sessionSaved = client.session.save();

  console.log('======================================================');
  console.log('🎉 COPIE AS CONFIGURAÇÕES ABAIXO PARA O SEU RENDER:');
  console.log('======================================================\n');
  console.log(`TELEGRAM_API_ID=${apiId}`);
  console.log(`TELEGRAM_API_HASH=${apiHash}`);
  console.log(`TELEGRAM_STRING_SESSION=${sessionSaved}`);
  console.log('\n======================================================');
  console.log('Adicione essas 3 variáveis no Render.com e pronto!\n');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Falha:', err.message);
  rl.close();
  process.exit(1);
});
