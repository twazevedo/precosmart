/**
 * @file bot.js — PreçoSmart WhatsApp Bot v2.0
 * @description Serviço web oficial com:
 *   • Baileys (WhatsApp via WebSocket puro — sem Chrome)
 *   • Dashboard web acessível via navegador
 *   • Agendador node-cron 4x ao dia
 *   • QR Code servido como imagem no navegador
 *   • Log de mensagens em memória
 *
 * DEPLOY no Render.com:
 *   Build Command: npm install
 *   Start Command: node bot.js
 *   Root Directory: whatsapp-bot
 */
'use strict';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino       = require('pino');
const QRCode     = require('qrcode');
const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const cron       = require('node-cron');

const { getDailyProduct, getRandomProduct, getTopDeals, getProductByCategories } = require('./catalog');
const { buildOfferMessage, buildMorningMessage, buildWelcomeMessage, buildFlashSaleMessage } = require('./formatter');

// ── Configurações ────────────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3002;
const TARGET_GROUP     = process.env.WA_GROUP_NAME || 'PreçoSmart Ofertas 🔥';
// No Render.com o disco persistente é montado em /opt/render/project/src/session
const SESSION_DIR      = process.env.RENDER_DISK_MOUNT_PATH
                          ? path.join(process.env.RENDER_DISK_MOUNT_PATH)
                          : path.join(__dirname, 'session');
const MAX_LOG_ENTRIES  = 100;

/**
 * Código de convite do grupo WhatsApp (extraído do link fornecido pelo dono).
 * Link completo: https://chat.whatsapp.com/Ht6rc4aPeBxHkXQChS4ADJ
 */
const GROUP_INVITE_CODE = process.env.WA_GROUP_INVITE_CODE || 'Ht6rc4aPeBxHkXQChS4ADJ';

// ── Estado Global ────────────────────────────────────────────────────────────
let waSocket       = null;
let qrCodeDataUrl  = null;
let isConnected    = false;
let groupJid       = null;
const messageLog   = [];

function logEntry(type, text) {
  const entry = { time: new Date().toISOString(), type, text };
  messageLog.unshift(entry);
  if (messageLog.length > MAX_LOG_ENTRIES) messageLog.pop();
  console.log(`[${entry.type}] ${entry.text}`);
}

// ── Dashboard HTML ───────────────────────────────────────────────────────────
const dashboardHtml = fs.readFileSync(path.join(__dirname, 'dashboard', 'index.html'), 'utf8');

// ── Express Dashboard ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

app.get('/', (req, res) => res.send(dashboardHtml));

app.get('/api/status', (req, res) => res.json({
  connected:   isConnected,
  groupName:   TARGET_GROUP,
  groupJid,
  qrReady:     !!qrCodeDataUrl && !isConnected,
  uptime:      Math.floor(process.uptime()),
  logCount:    messageLog.length,
  lastMessage: messageLog[0] || null,
  version:     '2.0.0'
}));

app.get('/api/qr', (req, res) => {
  if (isConnected)      return res.json({ status: 'connected', qr: null });
  if (!qrCodeDataUrl)   return res.json({ status: 'waiting',   qr: null });
  res.json({ status: 'qr_ready', qr: qrCodeDataUrl });
});

app.get('/api/logs', (req, res) => res.json(messageLog));

app.post('/api/send-now', async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado ou grupo não encontrado' });
  try {
    const product = getRandomProduct();
    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    logEntry('MANUAL', `Oferta manual enviada: ${product.title}`);
    res.json({ ok: true, product: product.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-welcome', async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado' });
  try {
    await waSocket.sendMessage(groupJid, { text: buildWelcomeMessage() });
    logEntry('MANUAL', 'Mensagem de boas-vindas enviada');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-flash', async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado' });
  try {
    const [top] = getTopDeals(1);
    const caption = buildFlashSaleMessage(top);
    await sendProductMessage(top, caption);
    logEntry('FLASH', `Flash sale enviado: ${top.title}`);
    res.json({ ok: true, product: top.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => logEntry('SERVER', `Dashboard rodando em http://localhost:${PORT}`));

// ── Baileys WhatsApp ─────────────────────────────────────────────────────────
async function findGroupJid(sock) {
  // 1. Tenta encontrar o grupo pelo nome entre os grupos que já participa
  const groups = await sock.groupFetchAllParticipating();
  const match  = Object.values(groups).find((g) => g.subject === TARGET_GROUP);

  if (match) {
    groupJid = match.id;
    logEntry('GROUP', `Grupo encontrado: "${TARGET_GROUP}" (${groupJid})`);
    return;
  }

  // 2. Grupo não encontrado — tenta entrar via código de convite
  logEntry('GROUP', `Grupo "${TARGET_GROUP}" não encontrado. Tentando entrar via convite...`);
  try {
    const inviteInfo = await sock.groupGetInviteInfo(GROUP_INVITE_CODE);
    logEntry('GROUP', `Convite válido: "${inviteInfo.subject}" — entrando no grupo...`);
    groupJid = await sock.groupAcceptInvite(GROUP_INVITE_CODE);
    logEntry('GROUP', `✅ Entrou no grupo com sucesso! JID: ${groupJid}`);

    // Envia mensagem de apresentação ao grupo após entrar
    await new Promise((r) => setTimeout(r, 3000)); // aguarda 3s para o WhatsApp processar
    await sock.sendMessage(groupJid, { text: buildWelcomeMessage() });
    logEntry('SENT', 'Mensagem de boas-vindas enviada ao grupo');
  } catch (err) {
    logEntry('ERROR', `Falha ao entrar no grupo via convite: ${err.message}`);
    logEntry('WARN', `Grupos disponíveis: ${Object.values(groups).map((g) => g.subject).join(' | ')}`);
  }
}

/**
 * Envia produto como imagem + legenda. Fallback para texto se a imagem falhar.
 */
async function sendProductMessage(product, caption) {
  if (product.imageUrl) {
    try {
      await waSocket.sendMessage(groupJid, {
        image:    { url: product.imageUrl },
        caption:  caption,
        mimetype: 'image/jpeg'
      });
      return;
    } catch (imgErr) {
      logEntry('WARN', `Imagem falhou, enviando só texto: ${imgErr.message}`);
    }
  }
  await waSocket.sendMessage(groupJid, { text: caption });
}

async function sendScheduledOffer(label, productFn) {
  if (!isConnected || !groupJid) {
    logEntry('SKIP', `[${label}] Bot offline ou grupo não encontrado`);
    return;
  }
  try {
    const product = productFn();
    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    logEntry('SENT', `[${label}] ${product.title}`);
  } catch (err) {
    logEntry('ERROR', `[${label}] ${err.message}`);
  }
}

function setupCronJobs() {
  // 09:00 — Resumo matinal (O que esperar do dia)
  cron.schedule('0 9 * * *', async () => {
    if (!isConnected || !groupJid) return;
    try {
      await waSocket.sendMessage(groupJid, { text: buildMorningMessage() });
      logEntry('SENT', '[09:00] Resumo matinal enviado');
    } catch (err) { logEntry('ERROR', err.message); }
  }, { timezone: 'America/Sao_Paulo' });

  // 12:00 — Horário de almoço (Compras rápidas no celular)
  cron.schedule('0 12 * * *', () => {
    sendScheduledOffer('12h', () => getProductByCategories(['Smartphones', 'E-readers & Tablets']));
  }, { timezone: 'America/Sao_Paulo' });

  // 16:00 — Pausa da tarde no trabalho (Equipamentos e produtividade)
  cron.schedule('0 16 * * *', () => {
    sendScheduledOffer('16h', () => getProductByCategories(['Notebooks', 'Monitores']));
  }, { timezone: 'America/Sao_Paulo' });

  // 19:30 — Chegada em casa / Lazer (TV, Áudio, Entretenimento)
  cron.schedule('30 19 * * *', () => {
    sendScheduledOffer('19h30', () => getProductByCategories(['TV & Vídeo', 'Áudio', 'Câmeras & Drones']));
  }, { timezone: 'America/Sao_Paulo' });

  // 22:00 — Gamers e Hardware (Pico de compras tech pesadas)
  cron.schedule('0 22 * * *', async () => {
    const [top] = getTopDeals(1);
    if (top.discPct >= 15 && isConnected && groupJid) {
      // Se tiver uma oferta muuuito boa, solta como Flash Sale
      const caption = buildFlashSaleMessage(top);
      await sendProductMessage(top, caption);
      logEntry('FLASH', `[22h] Flash Sale: ${top.title}`);
    } else {
      sendScheduledOffer('22h', () => getProductByCategories(['Games & Consoles', 'Hardware & PC']));
    }
  }, { timezone: 'America/Sao_Paulo' });

  logEntry('CRON', 'Horários de pico ativos: 09h(Resumo) • 12h(Celulares) • 16h(PCs) • 19:30(TV/Áudio) • 22h(Gamers)');
}

async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth:         state,
    logger:       pino({ level: 'silent' }),
    printQRInTerminal: true,
    browser:      ['PreçoSmart Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false
  });

  waSocket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCodeDataUrl = await QRCode.toDataURL(qr);
      isConnected   = false;
      logEntry('QR', 'Novo QR Code gerado — acesse /qr no dashboard para escanear');
    }

    if (connection === 'open') {
      isConnected   = true;
      qrCodeDataUrl = null;
      logEntry('CONNECTED', 'WhatsApp conectado com sucesso!');
      await findGroupJid(sock);
      setupCronJobs();
    }

    if (connection === 'close') {
      isConnected = false;
      groupJid    = null;
      const code  = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      logEntry('DISCONNECTED', `Desconectado (código ${code}). Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startBot, 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (body.toLowerCase().includes('oi') || body.toLowerCase().includes('olá')) {
      await sock.sendMessage(msg.key.remoteJid, { text: buildWelcomeMessage() });
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
logEntry('BOOT', '🚀 PreçoSmart WhatsApp Bot v2.0 iniciando...');
logEntry('BOOT', `Dashboard: http://localhost:${PORT}`);
startBot().catch((err) => logEntry('FATAL', err.message));
