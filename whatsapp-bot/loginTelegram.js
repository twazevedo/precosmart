/**
 * @file loginTelegram.js — Gerador de Sessão Telegram para o PreçoSmart
 * Rode este script no seu terminal para conectar sua conta do Telegram uma única vez.
 * Ele gerará a chave TELEGRAM_STRING_SESSION para você colocar no Render.
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

  const apiIdInput = await ask('👉 Digite o App api_id (ex: 19847514): ');
  const apiId = parseInt(apiIdInput.trim(), 10);
  const apiHash = (await ask('👉 Cole o App api_hash: ')).trim();

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
    phoneNumber: async () => await ask('📱 Digite seu número com DDD (ex: +5511999999999): '),
    password: async () => await ask('🔑 Digite sua senha de 2 etapas (se tiver, ou aperte ENTER): '),
    phoneCode: async () => await ask('📩 Digite o código de login que o Telegram acabou de te enviar: '),
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
  console.log('Basta adicionar essas 3 variáveis no Render.com!');
  console.log('O PreçoSmart vai monitorar o canal da KaBuM 24h por dia.\n');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Falha na autenticação:', err.message);
  rl.close();
  process.exit(1);
});
