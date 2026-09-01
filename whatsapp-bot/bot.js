/**
 * @file bot.js
 * @description Motor principal do Bot de Ofertas PreçoSmart para WhatsApp.
 * Autentica via QR Code, agendador node-cron 3x ao dia,
 * envia mensagens formatadas com links de afiliado para um grupo/canal.
 *
 * COMO USAR:
 *   node whatsapp-bot/bot.js
 *
 *   1. Escaneie o QR Code com seu WhatsApp (Configurações > Dispositivos Vinculados)
 *   2. A sessão fica salva em ./whatsapp-bot/session/ — não precisa escanear novamente
 *   3. O bot envia ofertas automaticamente às 10h, 18h e 21h (horário de Brasília)
 *
 * CONFIGURAR O GRUPO:
 *   - Crie manualmente um grupo/canal no WhatsApp
 *   - Coloque o nome exato em TARGET_GROUP_NAME abaixo
 */

'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const path = require('path');

const { PRODUCTS, getDailyProduct, getRandomProduct } = require('./catalog');
const {
  buildOfferMessage,
  buildDailySummaryMessage,
  buildWelcomeMessage
} = require('./formatter');

// ============================================================================
// ⚙️  CONFIGURAÇÃO — EDITE AQUI
// ============================================================================

/** Nome EXATO do grupo ou canal no WhatsApp (case-sensitive) */
const TARGET_GROUP_NAME = 'PreçoSmart Ofertas 🔥';

/** Se true, envia uma mensagem de teste imediatamente ao iniciar */
const SEND_TEST_ON_START = true;

// ============================================================================
// CLIENTE WHATSAPP
// ============================================================================

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, 'session')
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// ============================================================================
// EVENTOS DO CLIENTE
// ============================================================================

client.on('qr', (qr) => {
  console.log('\n════════════════════════════════════════════════');
  console.log('  📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP');
  console.log('  Configurações → Dispositivos Vinculados → Vincular Dispositivo');
  console.log('════════════════════════════════════════════════\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp autenticado com sucesso! Sessão salva.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  console.log('💡 Tente apagar a pasta session/ e rodar novamente.');
});

client.on('ready', async () => {
  console.log('\n════════════════════════════════════════════════');
  console.log('  🤖 BOT PREÇOSMART ATIVO E PRONTO!');
  console.log(`  🎯 Grupo alvo: "${TARGET_GROUP_NAME}"`);
  console.log('  ⏰ Agendamentos: 10h • 18h • 21h (Brasília)');
  console.log('════════════════════════════════════════════════\n');

  if (SEND_TEST_ON_START) {
    console.log('🔍 Enviando mensagem de teste...');
    await sendOffer();
  }

  setupSchedules();
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ Bot desconectado:', reason);
  console.log('🔄 Reconectando em 10 segundos...');
  setTimeout(() => client.initialize(), 10000);
});

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Encontra o chat do grupo configurado.
 * @returns {Promise<Chat|null>}
 */
async function findTargetGroup() {
  const chats = await client.getChats();
  const group = chats.find((c) => c.name === TARGET_GROUP_NAME);

  if (!group) {
    console.error(`❌ Grupo "${TARGET_GROUP_NAME}" não encontrado.`);
    console.log('💡 Verifique o nome do grupo em TARGET_GROUP_NAME (linha 33 do bot.js)');
    console.log('💡 Grupos disponíveis:', chats.filter((c) => c.isGroup).map((c) => c.name).join(', '));
  }

  return group || null;
}

/**
 * Envia oferta do produto do dia (ou aleatório) para o grupo.
 */
async function sendOffer() {
  try {
    const group = await findTargetGroup();
    if (!group) return;

    const hour = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric'
    });
    const h = parseInt(hour);

    let product;
    // Manhã: produto do dia (fixo) | Tarde/Noite: produto aleatório diferente
    if (h < 14) {
      product = getDailyProduct();
    } else {
      // Garante que o produto da tarde/noite seja diferente do produto do dia
      const daily = getDailyProduct();
      do {
        product = getRandomProduct();
      } while (product.id === daily.id);
    }

    const message = buildOfferMessage(product);
    await group.sendMessage(message);

    console.log(`✅ [${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] Oferta enviada: ${product.title}`);
  } catch (err) {
    console.error('❌ Erro ao enviar oferta:', err.message);
  }
}

/**
 * Envia resumo matinal com Top 3 ofertas.
 */
async function sendMorningSummary() {
  try {
    const group = await findTargetGroup();
    if (!group) return;

    // Seleciona 3 produtos com melhores descontos relativos ao histórico
    const highlights = [...PRODUCTS]
      .sort((a, b) => {
        const discA = (a.history30dAvg - a.quotes[0].pix) / a.history30dAvg;
        const discB = (b.history30dAvg - b.quotes[0].pix) / b.history30dAvg;
        return discB - discA;
      })
      .slice(0, 3);

    const message = buildDailySummaryMessage(highlights);
    await group.sendMessage(message);

    console.log(`☀️ [${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] Resumo matinal enviado`);
  } catch (err) {
    console.error('❌ Erro ao enviar resumo:', err.message);
  }
}

// ============================================================================
// AGENDAMENTOS (node-cron)
// ============================================================================

function setupSchedules() {
  // 09:55 - Resumo matinal com Top 3 (Brasília = UTC-3 → hora cron em UTC)
  cron.schedule('55 12 * * *', sendMorningSummary, { timezone: 'America/Sao_Paulo' });

  // 10:00 - Oferta #1 do dia
  cron.schedule('0 10 * * *', sendOffer, { timezone: 'America/Sao_Paulo' });

  // 18:00 - Oferta #2 do dia (horário de pico do varejo)
  cron.schedule('0 18 * * *', sendOffer, { timezone: 'America/Sao_Paulo' });

  // 21:00 - Oferta #3 do dia (horário nobre / mais engajamento)
  cron.schedule('0 21 * * *', sendOffer, { timezone: 'America/Sao_Paulo' });

  console.log('⏰ Agendamentos configurados:');
  console.log('   📅 09:55 — Resumo Top 3 do Dia');
  console.log('   🔔 10:00 — Oferta #1');
  console.log('   🔔 18:00 — Oferta #2 (pico do varejo)');
  console.log('   🔔 21:00 — Oferta #3 (horário nobre)');
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

console.log('\n════════════════════════════════════════════════');
console.log('  🤖 BOT DE OFERTAS PREÇOSMART — INICIANDO...');
console.log('════════════════════════════════════════════════');
console.log(`  Grupo alvo: "${TARGET_GROUP_NAME}"`);
console.log('  Aguarde o QR Code aparecer abaixo...\n');

client.initialize();
