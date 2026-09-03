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

require('./envLoader');
const path             = require('path');
const fs               = require('fs');
const QRCode           = require('qrcode');
const cron             = require('node-cron');
const express          = require('express');
const pino             = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

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
 */
const GROUP_INVITE_CODE = process.env.WA_GROUP_INVITE_CODE || '';

// ── Estado Global ────────────────────────────────────────────────────────────
let waSocket       = null;
let qrCodeDataUrl  = null;
let isConnected    = false;
let groupJid       = null;
const messageLog   = [];

// ── Sistema Anti-Flood e Deduplicação ─────────────────────────────────────────
const ANTI_FLOOD_DELAY_MS = 3 * 60 * 1000; // Intervalo de 3 minutos entre ofertas
const dealQueue           = [];
const recentDealHashes    = new Set();
let isWorkerActive        = false;
let lastDealSentAt        = 0;

// ── Modo Noturno e Integração Instagram ───────────────────────────────────────
let instagramWebhookUrl   = process.env.INSTAGRAM_WEBHOOK_URL || null;

function isNightQuietHours() {
  try {
    const spTimeStr = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const [hour, minute] = spTimeStr.split(':').map(Number);
    // Modo Noturno: das 23:30 até as 07:30 da manhã (Horário de Brasília)
    if (hour === 23 && minute >= 30) return true;
    if (hour >= 0 && hour < 7) return true;
    if (hour === 7 && minute < 30) return true;
  } catch (e) {}
  return false;
}

// ── Cache de Mídias Públicas para Instagram ──────────────────────────────────
const mediaCache = new Map();

async function dispatchToInstagram(deal) {
  if (!instagramWebhookUrl) return;
  try {
    const axios = require('axios');
    const urlMatch = deal.text ? deal.text.match(/(https?:\/\/[^\s]+)/i) : null;
    const link = urlMatch ? urlMatch[1] : '';

    // Limpa e formata o texto especificamente para o padrão nativo do Instagram
    const rawLines = deal.text ? deal.text.split('\n') : [];
    const cleanLines = rawLines.filter((l) => {
      const low = l.toLowerCase();
      if (low.includes('oferta exclusiva') || low.includes('compre aqui') || low.includes('link do produto')) return false;
      if (low.includes('acesse:') || low.includes('http') || low.includes('grupo') || low.includes('canal')) return false;
      if (low.includes('divulgador autorizado') || low.includes('compra 100% segura')) return false;
      if (low.includes('no mercado livre') || low.includes('na shopee') || low.includes('na amazon')) return false;
      return true;
    }).map((l) => {
      // Remove caracteres especiais de markdown do WhatsApp (*, ~, _, `)
      return l.replace(/[*~_`]/g, '')
              .replace(/\uFFFD+/g, '')
              .replace(/(\?{3,})/g, '')
              .trim();
    }).filter(Boolean);

    const titleLine = cleanLines[0] || '🔥 SUPER OFERTA IMPERDÍVEL';
    const bodyLines = cleanLines.slice(1).join('\n');

    const igCaption = `${titleLine}\n\n${bodyLines}\n\n💬 Comente "EU QUERO" que te envio o link com desconto exclusivo no seu Direct agora mesmo! 🚀\n\n⚠️ Oferta por tempo limitado sujeita a alteração de preço e estoque.\n\n#achadinhos #promocoes #ofertas #descontos #comprasonline #magalu #amazonbrasil #mercadolivre #shopee`;

    // Garante que a foto REAL da oferta seja servida com URL pública direta
    let resolvedImageUrl = deal.imageUrl || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=1080';
    if (deal.buffer && Buffer.isBuffer(deal.buffer)) {
      const mediaId = 'deal_' + Date.now();
      mediaCache.set(mediaId, { buffer: deal.buffer, createdAt: Date.now() });
      if (mediaCache.size > 50) {
        const oldestKey = mediaCache.keys().next().value;
        mediaCache.delete(oldestKey);
      }
      resolvedImageUrl = `https://precosmart.onrender.com/media/${mediaId}.jpg`;
    }

    await axios.post(instagramWebhookUrl, {
      text: igCaption,
      caption: igCaption,
      link: link,
      image_url: resolvedImageUrl,
      imageUrl: resolvedImageUrl,
      photo_url: resolvedImageUrl,
      type: deal.type,
      timestamp: new Date().toISOString()
    }, { timeout: 8000 });
    logEntry('INSTAGRAM', `Oferta com foto real disparada para o Instagram (${resolvedImageUrl})!`);
  } catch (e) {
    logEntry('WARN', 'Falha ao notificar Webhook do Instagram: ' + e.message);
  }
}

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

// Endpoint público para fotos reais do feed do Instagram
app.get('/media/:id.jpg', (req, res) => {
  const item = mediaCache.get(req.params.id);
  if (!item || !item.buffer) {
    return res.status(404).send('Media not found');
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(item.buffer);
});

app.get('/', (req, res) => res.send(dashboardHtml));

app.get('/api/status', (req, res) => res.json({
  connected:   isConnected,
  groupName:   TARGET_GROUP,
  groupJid,
  qrReady:     !!qrCodeDataUrl && !isConnected,
  uptime:      Math.floor(process.uptime()),
  logCount:    messageLog.length,
  queueLength: dealQueue.length,
  nightMode:   isNightQuietHours(),
  hasInstagramWebhook: !!instagramWebhookUrl,
  lastMessage: messageLog[0] || null,
  version:     '2.0.0'
}));

app.get('/api/qr', (req, res) => {
  if (isConnected)      return res.json({ status: 'connected', qr: null });
  if (!qrCodeDataUrl)   return res.json({ status: 'waiting',   qr: null });
  res.json({ status: 'qr_ready', qr: qrCodeDataUrl });
});

app.get('/api/logs', (req, res) => res.json(messageLog));

app.post('/api/send-magalu', async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado ou grupo não encontrado' });
  try {
    const magaluProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Magazine Luiza'));
    if (magaluProducts.length === 0) return res.status(404).json({ error: 'Nenhum produto do Magazine Luiza encontrado' });
    const product = magaluProducts[Math.floor(Math.random() * magaluProducts.length)];
    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    logEntry('MANUAL', `Oferta Magalu enviada: ${product.title}`);
    res.json({ ok: true, product: product.title, store: 'Magazine Luiza' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.post('/api/send-custom', async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado ou grupo não encontrado' });
  const { text, imageUrl } = req.body;
  try {
    if (imageUrl) {
      await waSocket.sendMessage(groupJid, {
        image: { url: imageUrl },
        caption: text,
        mimetype: 'image/jpeg'
      });
    } else {
      await waSocket.sendMessage(groupJid, { text });
    }
    logEntry('MANUAL', 'Oferta personalizada enviada com sucesso');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/set-instagram-webhook', (req, res) => {
  const { webhookUrl } = req.body;
  if (webhookUrl) {
    instagramWebhookUrl = webhookUrl;
    logEntry('INSTAGRAM', `Webhook do Instagram configurado: ${webhookUrl}`);
    return res.json({ ok: true, webhookUrl });
  }
  res.status(400).json({ error: 'URL do webhook ausente' });
});

app.listen(PORT, () => logEntry('SERVER', `Dashboard rodando em http://localhost:${PORT}`));

// ── Baileys WhatsApp ─────────────────────────────────────────────────────────
async function findGroupJid(sock) {
  const TARGET_GROUP_JID = process.env.WA_GROUP_JID || '';
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
      dispatchToInstagram({ type: 'image', imageUrl: product.imageUrl, text: caption }).catch(() => {});
      return;
    } catch (imgErr) {
      logEntry('WARN', `Imagem falhou, enviando só texto: ${imgErr.message}`);
    }
  }
  await waSocket.sendMessage(groupJid, { text: caption });
  dispatchToInstagram({ type: 'text', imageUrl: product.imageUrl, text: caption }).catch(() => {});
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

const SOURCE_INVITE_CODES = process.env.SOURCE_INVITE_CODES
  ? process.env.SOURCE_INVITE_CODES.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
let sourceGroupJids = [];

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

      // Carrega dinamicamente todos os canais conectados do WhatsApp,
      // excluindo apenas o grupo VIP oficial. NENHUMA fonte fica exposta no código!
      try {
        const participating = await sock.groupFetchAllParticipating();
        sourceGroupJids = Object.keys(participating).filter((id) => id !== groupJid);
        logEntry('GROUP', `Fontes de ofertas sincronizadas (${sourceGroupJids.length} canais ativos)`);
      } catch (gErr) {
        logEntry('WARN', 'Aviso ao mapear canais dinamicamente: ' + gErr.message);
      }

      // Entrar em novos grupos se fornecidos via variável de ambiente (oculto no GitHub)
      for (const code of SOURCE_INVITE_CODES) {
        try {
          const jid = await sock.groupAcceptInvite(code);
          if (jid && !sourceGroupJids.includes(jid) && jid !== groupJid) {
            sourceGroupJids.push(jid);
            logEntry('GROUP', '✅ Novo canal conectado: ' + jid);
          }
        } catch (err) {
          // Silencioso
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

  // ── Worker da Fila Anti-Flood ──────────────────────────────────────────────
  async function runDealQueueWorker() {
    if (isWorkerActive) return;
    isWorkerActive = true;

    while (dealQueue.length > 0) {
      // Se estiver no Horário de Silêncio Noturno (23:30 às 07:30 de Brasília), não acorda ninguém
      if (isNightQuietHours()) {
        logEntry('NIGHT', `🌙 Modo Noturno Ativo (23:30 - 07:30): envios pausados para proteger os membros (Fila: ${dealQueue.length})`);
        await new Promise((r) => setTimeout(r, 10 * 60 * 1000)); // Dorme por 10 min e reavalia
        continue;
      }

      const now = Date.now();
      const elapsed = now - lastDealSentAt;

      // Se enviou uma oferta recentemente, aguarda o intervalo anti-flood
      if (lastDealSentAt > 0 && elapsed < ANTI_FLOOD_DELAY_MS) {
        const waitMs = ANTI_FLOOD_DELAY_MS - elapsed;
        logEntry('QUEUE', `Anti-Flood: aguardando ${Math.ceil(waitMs / 1000)}s antes de postar a próxima oferta (Fila: ${dealQueue.length})`);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const deal = dealQueue.shift();
      if (!deal || !groupJid || !waSocket) continue;

      try {
        if (deal.type === 'image' && deal.buffer) {
          await waSocket.sendMessage(groupJid, { image: deal.buffer, caption: deal.text });
          logEntry('MIRROR', `Oferta postada via Anti-Flood (FOTO)! Restam na fila: ${dealQueue.length}`);
        } else if (deal.type === 'video' && deal.buffer) {
          await waSocket.sendMessage(groupJid, { video: deal.buffer, caption: deal.text });
          logEntry('MIRROR', `Oferta postada via Anti-Flood (VÍDEO)! Restam na fila: ${dealQueue.length}`);
        } else {
          await waSocket.sendMessage(groupJid, { text: deal.text });
          logEntry('MIRROR', `Oferta postada via Anti-Flood (TEXTO)! Restam na fila: ${dealQueue.length}`);
        }
        lastDealSentAt = Date.now();
        // Dispara simultaneamente para o Instagram se webhook estiver conectado
        dispatchToInstagram(deal).catch(() => {});
      } catch (err) {
        logEntry('ERROR', 'Falha ao enviar oferta da fila: ' + err.message);
      }
    }

    isWorkerActive = false;
  }

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const remoteJid = msg.key.remoteJid || '';
    const isPrivateChat = remoteJid.endsWith('@s.whatsapp.net');

    // ── 👑 COMANDOS DO DONO (CHAT PRIVADO) ──
    if (isPrivateChat) {
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ''
      ).trim();

      if (text.startsWith('!')) {
        const rawOwners = process.env.OWNER_NUMBER || '';
        const ownerList = rawOwners.split(/[,;\s]+/).map((n) => n.replace(/[^0-9]/g, '')).filter(Boolean);
        const senderPhone = remoteJid.replace(/[^0-9]/g, '');

        // Autorizado se enviado do próprio número (fromMe) OU se bater com qualquer OWNER_NUMBER da lista
        const isAuthorized = msg.key.fromMe || 
                             ownerList.length === 0 || 
                             ownerList.some((owner) => {
                               const last8 = owner.length >= 8 ? owner.slice(-8) : owner;
                               return (last8 && senderPhone.includes(last8)) || 
                                      senderPhone.includes(owner) || 
                                      owner.includes(senderPhone);
                             });

        if (isAuthorized) {
          const [cmd, ...args] = text.split(' ');
          const command = cmd.toLowerCase();

          // 1. !status
          if (command === '!status') {
            const uptimeHours = (process.uptime() / 3600).toFixed(1);
            const statusMsg = `📊 *Status PreçoSmart Bot*\n\n` +
              `🟢 Conectado: Sim\n` +
              `⏱️ Tempo Online: ${uptimeHours} horas\n` +
              `📦 Fila de Ofertas: ${dealQueue.length} aguardando\n` +
              `🌙 Modo Noturno: ${isNightQuietHours() ? 'Ativo (Pausado)' : 'Desligado (Ativo)'}\n` +
              `📡 Fontes Monitoradas: ${sourceGroupJids.length} canais\n` +
              `📸 Instagram Webhook: ${instagramWebhookUrl ? 'Conectado' : 'Desligado'}\n` +
              `🎯 Grupo VIP: ${groupJid || 'Buscando...'}`;
            await waSocket.sendMessage(remoteJid, { text: statusMsg });
            return;
          }

          // 2. !limpar
          if (command === '!limpar') {
            const count = dealQueue.length;
            dealQueue.length = 0;
            await waSocket.sendMessage(remoteJid, { text: `🧹 *Fila Limpa!* Foram removidas ${count} ofertas da fila pendente.` });
            return;
          }

          // 3. !postar <link ou texto>
          if (command === '!postar') {
            const content = args.join(' ');
            if (!content && !msg.message.imageMessage && !msg.message.videoMessage) {
              await waSocket.sendMessage(remoteJid, { text: '⚠️ *Como usar:* Digite `!postar <link>` ou envie uma foto/vídeo com a legenda `!postar <link>`.' });
              return;
            }

            try {
              let mediaType = 'text';
              let buffer = null;

              if (msg.message.imageMessage) {
                mediaType = 'image';
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              } else if (msg.message.videoMessage) {
                mediaType = 'video';
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
                buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              }

              const newText = await processMessageText(content);
              
              if (!groupJid) {
                await waSocket.sendMessage(remoteJid, { text: '❌ Grupo VIP oficial não encontrado para postar.' });
                return;
              }

              // Prioridade do Dono: Fura a fila e envia imediatamente para o VIP!
              if (mediaType === 'image' && buffer) {
                await waSocket.sendMessage(groupJid, { image: buffer, caption: newText });
              } else if (mediaType === 'video' && buffer) {
                await waSocket.sendMessage(groupJid, { video: buffer, caption: newText });
              } else {
                await waSocket.sendMessage(groupJid, { text: newText });
              }

              // Dispara também para o Instagram com a foto real
              dispatchToInstagram({ type: mediaType, buffer, text: newText }).catch(() => {});

              await waSocket.sendMessage(remoteJid, { text: `👑 *Oferta do Dono Postada!*\n\nA sua promoção acabou de ser enviada com prioridade máxima para o grupo VIP e para o Instagram com a sua comissão embutida! 🚀` });
              logEntry('ADMIN', 'Comando !postar executado pelo dono com sucesso!');
              return;
            } catch (postErr) {
              await waSocket.sendMessage(remoteJid, { text: `❌ Erro ao postar: ${postErr.message}` });
              return;
            }
          }

          // 4. !magalu
          if (command === '!magalu') {
            try {
              const magaluProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Magazine Luiza'));
              if (magaluProducts.length === 0) {
                await waSocket.sendMessage(remoteJid, { text: '❌ Nenhum produto do Magazine Luiza encontrado no catálogo.' });
                return;
              }
              const product = magaluProducts[Math.floor(Math.random() * magaluProducts.length)];
              const caption = buildOfferMessage(product);
              await sendProductMessage(product, caption);
              await waSocket.sendMessage(remoteJid, { text: `💙 *Oferta Magalu Postada!*\n\nPostei a oferta de *${product.title}* no Grupo VIP e no Instagram!` });
              logEntry('ADMIN', `Comando !magalu executado: ${product.title}`);
              return;
            } catch (magErr) {
              await waSocket.sendMessage(remoteJid, { text: `❌ Erro ao postar Magalu: ${magErr.message}` });
              return;
            }
          }

          // 5. !ajuda
          if (command === '!ajuda' || command === '!comandos') {
            const helpMsg = `👑 *Comandos do Administrador (PreçoSmart)*\n\n` +
              `👉 *!magalu*\nDispara uma oferta imediata do Magazine Luiza no Grupo VIP e no Instagram.\n\n` +
              `👉 *!postar <link> [texto]*\nEnvia uma oferta na mesma hora para o grupo VIP (fura a fila) com seus links de afiliados embutidos.\n\n` +
              `👉 *!status*\nMostra como o robô está operando agora.\n\n` +
              `👉 *!limpar*\nEsvazia a fila de ofertas se acumular muitas.\n\n` +
              `_Envie qualquer um desses comandos aqui no privado!_`;
            await waSocket.sendMessage(remoteJid, { text: helpMsg });
            return;
          }
        }
      }

      // Se não for comando de admin, não interage em chats privados
      return;
    }

    if (msg.key.fromMe) return;

    // NUNCA processe ou responda mensagens do próprio grupo VIP de destino
    if (msg.key.remoteJid === groupJid) return;

    // Ingestão: processa apenas canais sincronizados
    if (!sourceGroupJids.includes(msg.key.remoteJid)) return;

    // Processamento e normalização da oferta
    try {
      // Pega o texto da legenda ou texto normal
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
      
      // Manda o texto para a nossa fábrica de links (vai abrir amzn.to e trocar pela sua tag)
      const newText = await processMessageText(text);
      
      if (!newText.trim()) return;

      // ── Deduplicação Inteligente ──
      // Cria um hash baseado nos primeiros 60 caracteres sem espaço
      const fingerprint = newText.substring(0, 60).toLowerCase().replace(/\s+/g, '');
      if (recentDealHashes.has(fingerprint)) {
        logEntry('SKIP', 'Anti-Flood: oferta duplicada ignorada (já postada recentemente)');
        return;
      }
      recentDealHashes.add(fingerprint);
      if (recentDealHashes.size > 80) {
        const first = recentDealHashes.values().next().value;
        recentDealHashes.delete(first);
      }

      // ── Baixa mídia para memória antes de colocar na fila ──
      let mediaType = 'text';
      let buffer = null;

      if (msg.message.imageMessage) {
        mediaType = 'image';
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
        buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      } else if (msg.message.videoMessage) {
        mediaType = 'video';
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
        buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      }

      // Limite de fila: 8 durante a noite (para não acumular) e 25 durante o dia
      const maxQueueLimit = isNightQuietHours() ? 8 : 25;
      if (dealQueue.length < maxQueueLimit) {
        dealQueue.push({ type: mediaType, buffer, text: newText });
        logEntry('QUEUE', `Oferta adicionada à fila Anti-Flood (Posição: ${dealQueue.length})`);
        runDealQueueWorker();
      } else {
        logEntry('SKIP', 'Fila cheia, descartando item para evitar atrasos excessivos');
      }
    } catch (err) {
      logEntry('DEAL', 'Erro ao processar oferta: ' + err.message);
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
logEntry('BOOT', '🚀 PreçoSmart WhatsApp Bot v2.0 iniciando...');
logEntry('BOOT', `Dashboard: http://localhost:${PORT}`);
startBot().catch((err) => logEntry('FATAL', err.message));
