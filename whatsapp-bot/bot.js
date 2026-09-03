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
  const TARGET_GROUP_JID = process.env.WA_GROUP_JID || '120363428098199018@g.us';
  const groups = await sock.groupFetchAllParticipating();

  if (groups[TARGET_GROUP_JID]) {
    groupJid = TARGET_GROUP_JID;
    logEntry('GROUP', `Grupo oficial confirmado: "${groups[TARGET_GROUP_JID].subject}" (${groupJid})`);
    return;
  }

  const match = Object.values(groups).find((g) => g.subject === TARGET_GROUP || g.subject === 'PROMOÇÕES');
  if (match) {
    groupJid = match.id;
    logEntry('GROUP', `Grupo encontrado: "${match.subject}" (${groupJid})`);
    return;
  }

  // 2. Grupo não encontrado — tenta entrar via código de convite
  logEntry('GROUP', `Tentando entrar no grupo via convite...`);
  try {
    groupJid = await sock.groupAcceptInvite(GROUP_INVITE_CODE);
    logEntry('GROUP', `✅ Entrou no grupo com sucesso! JID: ${groupJid}`);
  } catch (err) {
    logEntry('ERROR', `Falha ao entrar no grupo via convite: ${err.message}`);
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
    sendScheduledOffer('12h', () => getProductByCategories(['Smartphones', 'E-readers & Tablets', 'Smartwatches', 'Saúde & Beleza', 'Supermercado']));
  }, { timezone: 'America/Sao_Paulo' });

  // 16:00 — Pausa da tarde no trabalho (Equipamentos e produtividade)
  cron.schedule('0 16 * * *', () => {
    sendScheduledOffer('16h', () => getProductByCategories(['Notebooks', 'Monitores', 'Periféricos']));
  }, { timezone: 'America/Sao_Paulo' });

  // 19:30 — Chegada em casa / Lazer (TV, Áudio, Entretenimento)
  cron.schedule('30 19 * * *', () => {
    sendScheduledOffer('19h30', () => getProductByCategories(['TV & Vídeo', 'Áudio', 'Câmeras & Drones', 'Casa Inteligente', 'Eletrodomésticos']));
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

const { MongoClient } = require('mongodb');
const { useMongoDBAuthState } = require('./mongoAuth');

const { processMessageText } = require('./mirror');
const SOURCE_INVITE_CODES = ['LVQeM8ke7aiAMKrert3tXn', 'DQrfjMHM3t52YY8oRuQoQi', 'H8V7Ilmsntr8hPbM8kQ6Wq', 'GBONHRtFDTB8xsWyT9roj7', 'Hfe7u2cfTlv1Nm8UBvKX6N', 'FvqlT4jcOGc1z5qlezaVEH', 'K5YnbdXfy7w7r9y7Awjd1b', 'F2ASYImwMi0I1Ka4HJyrW8', 'LNRhciUCYyQ2mz5W9ZenIL', 'B78psnhjpZW0MwrENmuVe8', 'JWh6YjN6vKfFLJcUWEddm7', 'EryWWJiMxfF0Cw3Oqcm7ip', 'J8xrwaVtPyH22gDnAPLkyW', 'FFBXlHiIPsaCJsV3VMUz0v', 'CV55f0uEOSnFu5GfQpOyQF', 'HFWO1yF8qTMA7WzNR3MiPs'];
const KNOWN_SPY_JIDS = [
  '120363426055112444@g.us',
  '120363422185523476@g.us',
  '120363022227006770@g.us',
  '120363361632968871@g.us',
  '558894177629-1589320377@g.us',
  '120363040345848018@g.us',
  '120363425265838837@g.us',
  '120363419645080011@g.us',
  '120363333962668123@g.us',
  '120363406543355604@g.us'
];
let sourceGroupJids = [...KNOWN_SPY_JIDS];

async function startBot() {
  let state, saveCreds;

  if (process.env.MONGO_URI) {
    try {
      logEntry('BOOT', 'Conectando ao MongoDB...');
      const mongoClient = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await mongoClient.connect();
      const collection = mongoClient.db('precosmart').collection('auth_info');
      const auth = await useMongoDBAuthState(collection);
      state = auth.state;
      saveCreds = auth.saveCreds;
      logEntry('BOOT', 'Sessão carregada do MongoDB com sucesso!');
    } catch (dbErr) {
      logEntry('FATAL', 'Falha ao conectar no MongoDB. Usando fallback local: ' + dbErr.message);
      if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
      const auth = await useMultiFileAuthState(SESSION_DIR);
      state = auth.state;
      saveCreds = auth.saveCreds;
    }
  } else {
    logEntry('BOOT', 'Atenção: Rodando com sessão local (arquivos). QR Code será resetado em reboots.');
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const auth = await useMultiFileAuthState(SESSION_DIR);
    state = auth.state;
    saveCreds = auth.saveCreds;
  }

  const { version } = await fetchLatestBaileysVersion();

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
      // Garante que o grupo VIP não esteja na lista de espelhos
      sourceGroupJids = sourceGroupJids.filter((id) => id !== groupJid);

      // Entrar nos grupos espelho novos (se ainda não estiver neles)
      for (const code of SOURCE_INVITE_CODES) {
        try {
          const jid = await sock.groupAcceptInvite(code);
          if (jid && !sourceGroupJids.includes(jid) && jid !== groupJid) {
            sourceGroupJids.push(jid);
            logEntry('GROUP', '✅ Entrou no grupo ESPELHO! JID: ' + jid);
          }
        } catch (err) {
          // Já participa ou limite temporário — silencioso
        }
      }
      
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

    // NUNCA processe ou responda mensagens do próprio grupo VIP de destino
    if (msg.key.remoteJid === groupJid) return;

    // Se NÃO for um grupo espelho cadastrado, IGNORE TOTALMENTE!
    // (Impede qualquer ação em conversas privadas, grupos de amigos, família, trabalho, etc.)
    if (!sourceGroupJids.includes(msg.key.remoteJid)) return;

    // Se veio de um grupo espelho, ROUBE A OFERTA
    try {
      logEntry('MIRROR', 'Nova mensagem detectada no grupo espelho. Trocando links...');
      
      // Pega o texto da legenda ou texto normal
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
      
      // Manda o texto para a nossa fábrica de links (vai abrir amzn.to e trocar pela sua tag)
      const newText = await processMessageText(text);
      
      if (!newText.trim()) return;
      
      // Se a mensagem original tinha foto, baixa a foto e manda com seu texto
      if (msg.message.imageMessage && groupJid) {
         const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
         const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
         let buffer = Buffer.from([]);
         for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
         await sock.sendMessage(groupJid, { image: buffer, caption: newText });
         logEntry('MIRROR', 'Oferta clonada com sucesso (FOTO + LINK SUBSTITUÍDO)!');
      } 
      // Se a mensagem original tinha vídeo, baixa o vídeo e manda
      else if (msg.message.videoMessage && groupJid) {
         const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
         const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
         let buffer = Buffer.from([]);
         for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
         await sock.sendMessage(groupJid, { video: buffer, caption: newText });
         logEntry('MIRROR', 'Oferta clonada com sucesso (VÍDEO + LINK SUBSTITUÍDO)!');
      }
      // Se era só texto com link, manda só o texto
      else if (groupJid) {
         await sock.sendMessage(groupJid, { text: newText });
         logEntry('MIRROR', 'Oferta clonada com sucesso (TEXTO + LINK SUBSTITUÍDO)!');
      }
    } catch (err) {
      logEntry('MIRROR', 'Erro ao clonar: ' + err.message);
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
logEntry('BOOT', '🚀 PreçoSmart WhatsApp Bot v2.0 iniciando...');
logEntry('BOOT', `Dashboard: http://localhost:${PORT}`);
startBot().catch((err) => logEntry('FATAL', err.message));
