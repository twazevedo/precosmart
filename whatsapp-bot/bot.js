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
const axios            = require('axios');
const pino             = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { PRODUCTS, getDailyProduct, getRandomProduct, getTopDeals, getProductByCategories, getNextMagaluProduct } = require('./catalog');
const { buildOfferMessage, buildMorningMessage, buildWelcomeMessage, buildFlashSaleMessage } = require('./formatter');
const { addAlert, removeAlert, getUserAlerts, getAllAlerts, checkMatchingAlerts, countTotalAlerts } = require('./alerts');
const { extractOfferFromImage } = require('./geminiVision');
const { isTelegramConfigured, broadcastTelegramDeal } = require('./telegram');
const { createShortLink, recordClick, getAnalyticsSummary } = require('./analytics');
const { fetchCuratedDeals } = require('./crawler');
const { fetchAllGarimpeirosDeals } = require('./garimpeirosCrawler');
const { requireApiAuth, securityHeaders, maskSensitiveData } = require('./security');
const { getNextAwinDeal } = require('./awinCatalog');

// ── Configurações ────────────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3002;
const TARGET_GROUP     = process.env.WA_GROUP_NAME || 'PreçoSmart Ofertas 🔥';
// No Render.com o disco persistente é montado em /opt/render/project/src/session
const SESSION_DIR      = process.env.RENDER_DISK_MOUNT_PATH
                          ? path.join(process.env.RENDER_DISK_MOUNT_PATH)
                          : path.join(__dirname, 'session');
const MAX_LOG_ENTRIES  = 100;

// Anti-duplicação de comandos
const processedCommandIds = new Set();
const lastCommandExecution = new Map(); // key: senderPhone+command -> timestamp

// Cache com TTL de 6 horas para impedir qualquer oferta duplicada no grupo VIP
const recentDealCache = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentDealCache.entries()) {
    if (now - ts > DEDUP_TTL_MS) recentDealCache.delete(key);
  }
}, 5 * 60 * 1000);

function isDuplicateDeal(canonicalIds, keyword, rawText) {

  for (const id of canonicalIds) {
    if (id && recentDealCache.has('id:' + id)) return true;
  }

  if (keyword && keyword.length > 8) {
    const kwKey = 'kw:' + keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (recentDealCache.has(kwKey)) return true;
  }

  const clean = (rawText || '')
    .replace(/(https?:\/\/[^\s]+)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
    .substring(0, 70);
  if (clean.length > 15 && recentDealCache.has('txt:' + clean)) return true;

  return false;
}

function registerSentDeal(canonicalIds, keyword, rawText) {
  const now = Date.now();
  for (const id of canonicalIds) {
    if (id) recentDealCache.set('id:' + id, now);
  }
  if (keyword && keyword.length > 8) {
    const kwKey = 'kw:' + keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
    recentDealCache.set(kwKey, now);
  }
  const clean = (rawText || '')
    .replace(/(https?:\/\/[^\s]+)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
    .substring(0, 70);
  if (clean.length > 15) {
    recentDealCache.set('txt:' + clean, now);
  }
}

/**
 * Código de convite do grupo WhatsApp oficial PreçoSmart.
 */
const GROUP_INVITE_CODE = process.env.WA_GROUP_INVITE_CODE || 'Lo3ONNfAXVh5cEe2Pg6gM7';

// ── Estado Global ────────────────────────────────────────────────────────────
function getTargetJids() {
  const envJids = (process.env.WA_GROUP_JID || '').split(',').map(x => x.trim()).filter(Boolean);
  return envJids.length > 0 ? envJids : (groupJid ? [groupJid] : []);
}
let waSocket       = null;
let qrCodeDataUrl  = null;
let isConnected    = false;
let groupJid       = null;
const messageLog   = [];

// ── Sistema Anti-Flood e Deduplicação ─────────────────────────────────────────
const ANTI_FLOOD_DELAY_MS = 3 * 60 * 1000; // Intervalo de 3 minutos entre ofertas
const dealQueue           = [];
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
  // Desativado: Canal desabilitado. O sistema posta EXCLUSIVAMENTE no Grupo VIP WhatsApp e no Telegram.
  return;
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
app.set('trust proxy', 1);
app.use(securityHeaders);

// 🛡️ Rate Limiting Anti-DoS
const botRequestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxPerWindow = 120;

  const record = botRequestCounts.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  record.count++;
  botRequestCounts.set(ip, record);

  if (record.count > maxPerWindow) {
    return res.status(429).json({ error: 'Limite de requisições excedido. Aguarde 1 minuto.' });
  }
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of botRequestCounts.entries()) {
    if (now > record.resetTime) {
      botRequestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.use(express.json({ limit: '1mb' }));
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

app.get('/dashboard', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Painel do Chefe — PreçoSmart Analytics Pro</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      :root {
        --bg: #0f172a;
        --card: #1e293b;
        --border: #334155;
        --text: #f8fafc;
        --muted: #94a3b8;
        --accent: #6366f1;
        --green: #10b981;
      }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); margin:0; padding: 24px; color: var(--text); }
      .container { max-width: 1000px; margin: auto; }
      header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
      h1 { font-size: 1.6rem; font-weight: 700; margin: 0; color: #fff; }
      .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
      .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .metric-label { font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
      .metric-val { font-size: 2.2rem; font-weight: 800; color: #fff; margin-top: 6px; }
      .metric-sub { font-size: 0.8rem; color: var(--green); margin-top: 4px; }
      .chart-container { position: relative; height: 260px; margin-top: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
      th { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; }
      a { color: var(--accent); text-decoration: none; font-weight: 600; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>📊 PreçoSmart Analytics Pro</h1>
        <span style="font-size: 0.85rem; color: var(--green); background: rgba(16,185,129,0.15); padding: 6px 12px; border-radius: 999px; font-weight: 600;">● Sistema Operando</span>
      </header>

      <div class="grid-3">
        <div class="card">
          <div class="metric-label">Cliques Registrados</div>
          <div class="metric-val" id="total-clicks">0</div>
          <div class="metric-sub">▲ Rastreamento em tempo real</div>
        </div>
        <div class="card">
          <div class="metric-label">Links Únicos Ativos</div>
          <div class="metric-val" id="total-links">0</div>
          <div class="metric-sub">Monitorados com tags</div>
        </div>
        <div class="card">
          <div class="metric-label">Conversão Estimada</div>
          <div class="metric-val" id="est-conv">--</div>
          <div class="metric-sub">Baseada no DealScore™</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h2 style="font-size: 1rem; margin: 0; color: #fff;">📈 Volume de Cliques por Oferta</h2>
        <div class="chart-container">
          <canvas id="clicksChart"></canvas>
        </div>
      </div>

      <div class="card">
        <h2 style="font-size: 1rem; margin: 0 0 8px 0; color: #fff;">🏆 Ranking de Ofertas Mais Clicadas</h2>
        <div id="table-container">Carregando dados...</div>
      </div>
    </div>

    <script>
      let chartInstance = null;

      async function loadDashboard() {
        try {
          const res = await fetch('/api/analytics');
          const data = await res.json();

          document.getElementById('total-clicks').innerText = data.totalClicks || 0;
          document.getElementById('total-links').innerText = data.totalLinks || 0;
          const convRate = data.totalLinks > 0 ? ((data.totalClicks / data.totalLinks) * 100).toFixed(1) + '%' : '0%';
          document.getElementById('est-conv').innerText = convRate;

          // Gráfico
          const labels = (data.topLinks || []).map(l => l.title.substring(0, 18) + '...');
          const values = (data.topLinks || []).map(l => l.clicks);

          const ctx = document.getElementById('clicksChart').getContext('2d');
          if (chartInstance) chartInstance.destroy();
          chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels.length ? labels : ['Sem dados'],
              datasets: [{
                label: 'Cliques',
                data: values.length ? values : [0],
                backgroundColor: '#6366f1',
                borderRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
              }
            }
          });

          // Tabela
          if (data.topLinks && data.topLinks.length > 0) {
            let tHtml = '<table><thead><tr><th>Produto</th><th>Loja</th><th>Cliques</th><th>Ação</th></tr></thead><tbody>';
            data.topLinks.forEach(l => {
              tHtml += '<tr><td><b>' + l.title + '</b></td><td>' + (l.store || 'Varejo') + '</td><td><span style="color:#10b981; font-weight:700;">' + l.clicks + '</span></td><td><a href="' + l.shortUrl + '" target="_blank">Testar Link ↗</a></td></tr>';
            });
            tHtml += '</tbody></table>';
            document.getElementById('table-container').innerHTML = tHtml;
          } else {
            document.getElementById('table-container').innerHTML = '<p style="color:#94a3b8; padding: 12px 0;">Nenhum clique registrado ainda. As métricas atualizarão assim que os membros clicarem nas ofertas!</p>';
          }
        } catch(e) {}
      }

      loadDashboard();
      setInterval(loadDashboard, 15000);
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

app.get('/api/status', (req, res) => res.json({
  connected:   isConnected,
  botUser:     waSocket?.user || null,
  groupName:   TARGET_GROUP,
  groupJid,
  targetJids:  getTargetJids(),
  qrReady:     !!qrCodeDataUrl && !isConnected,
  uptime:      Math.floor(process.uptime()),
  logCount:    messageLog.length,
  queueLength: dealQueue.length,
  activeAlerts: countTotalAlerts(),
  hasTelegram: isTelegramConfigured(),
  analytics:   getAnalyticsSummary(),
  nightMode:   isNightQuietHours(),
  hasInstagramWebhook: !!instagramWebhookUrl,
  lastMessage: messageLog[0] || null,
  version:     '2.2.0'
}));

app.get('/api/alerts', requireApiAuth, (req, res) => res.json(getAllAlerts()));

app.get('/r/:code', (req, res) => {
  const target = recordClick(req.params.code);
  if (target) {
    return res.redirect(302, target);
  }
  res.status(404).send('Link de oferta não encontrado ou expirado.');
});

app.get('/api/analytics', (req, res) => res.json(getAnalyticsSummary()));

app.post('/api/crawler/run', requireApiAuth, async (req, res) => {
  try {
    const deals = await fetchCuratedDeals();
    let count = 0;
    for (const d of deals) {
      dealQueue.push({
        type: 'text',
        caption: d.rawText,
        canonicalIds: [],
        keyword: d.title,
        textForDup: d.rawText
      });
      count++;
    }
    logEntry('CRAWLER', `Crawler autônomo ativado: ${count} ofertas enfileiradas.`);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/garimpeiros/run', requireApiAuth, async (req, res) => {
  try {
    const deals = await fetchAllGarimpeirosDeals(4);
    let count = 0;
    for (const d of deals) {
      dealQueue.push({
        type: d.imageUrl ? 'image' : 'text',
        imageUrl: d.imageUrl,
        caption: d.formattedText,
        canonicalIds: ['garimpo_' + d.id],
        keyword: d.title,
        textForDup: d.formattedText
      });
      count++;
    }
    logEntry('GARIMPO', `Garimpeiros Crawler ativado: ${count} ofertas de todas as categorias enfileiradas.`);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/qr', requireApiAuth, (req, res) => {
  if (isConnected)      return res.json({ status: 'connected', qr: null });
  if (!qrCodeDataUrl)   return res.json({ status: 'waiting',   qr: null });
  res.json({ status: 'qr_ready', qr: qrCodeDataUrl });
});

app.get('/api/logs', requireApiAuth, (req, res) => {
  const sanitized = messageLog.map(l => ({
    ...l,
    text: maskSensitiveData(l.text)
  }));
  res.json(sanitized);
});

app.post('/api/send-magalu', requireApiAuth, async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado ou grupo não encontrado' });
  try {
    const product = getNextMagaluProduct();
    if (!product) return res.status(404).json({ error: 'Nenhum produto do Magazine Luiza encontrado' });

    registerSentDeal(['mag_' + product.id], product.title, product.title);

    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    logEntry('MANUAL', `Oferta Magalu enviada: ${product.title}`);
    res.json({ ok: true, product: product.title, store: 'Magazine Luiza' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-boticario', requireApiAuth, async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado ou grupo não encontrado' });
  try {
    const boticarioProducts = PRODUCTS.filter(p => 
      p.quotes.some(q => q.store === 'O Boticário' || q.store === 'Boticário' || q.store === 'Eudora')
    );
    if (boticarioProducts.length === 0) return res.status(404).json({ error: 'Nenhum produto do Grupo Boticário encontrado' });

    const product = boticarioProducts[Math.floor(Math.random() * boticarioProducts.length)];
    registerSentDeal(['bot_' + product.id], product.title, product.title);

    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    logEntry('MANUAL', `Oferta Grupo Boticário enviada com foto oficial: ${product.title}`);
    res.json({ ok: true, product: product.title, store: 'O Boticário' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-now', requireApiAuth, async (req, res) => {
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

app.post('/api/send-welcome', requireApiAuth, async (req, res) => {
  if (!isConnected || !groupJid) return res.status(503).json({ error: 'Bot não conectado' });
  try {
    await waSocket.sendMessage(groupJid, { text: buildWelcomeMessage() });
    logEntry('MANUAL', 'Mensagem de boas-vindas enviada');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-flash', requireApiAuth, async (req, res) => {
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

app.post('/api/send-custom', requireApiAuth, async (req, res) => {
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

// ── Rotação Automática de Ofertas AWIN (EXCLUSIVAMENTE Grupo WhatsApp e Telegram) ─────
async function dispatchNextAwinRotation(options = {}) {
  const force = options.force || false;
  if (!force && isNightQuietHours()) {
    return null;
  }
  try {
    const deal = await getNextAwinDeal();
    if (!deal) return null;

    logEntry('AWIN', `[Piloto Automático] Disparando oferta/cupom: ${deal.store} — ${deal.title}`);

    // 1. WhatsApp (EXCLUSIVAMENTE GRUPOS @g.us)
    const jids = getTargetJids();
    if (isConnected && waSocket && jids.length > 0) {
      for (const jid of jids) {
        if (!jid.endsWith('@g.us')) continue; // NUNCA envia no privado

        let sent = false;
        if (deal.imageUrl) {
          try {
            const imgRes = await axios.get(deal.imageUrl, {
              responseType: 'arraybuffer',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
              },
              timeout: 7000
            });
            if (imgRes.status === 200 && imgRes.data && imgRes.data.length > 0) {
              const resMsg = await waSocket.sendMessage(jid, {
                image: Buffer.from(imgRes.data),
                caption: deal.text
              });
              logEntry('AWIN_WA', `Foto enviada para ${jid}, id: ${resMsg?.key?.id || 'ok'}`);
              sent = true;
            }
          } catch (imgErr) {
            logEntry('WARN', `Falha ao baixar/enviar foto AWIN (${jid}), usando fallback de texto: ${imgErr.message}`);
          }
        }

        // Fallback 100% garantido: se a imagem falhar ou não existir, envia o texto com o link e cupom
        if (!sent) {
          try {
            const resMsg = await waSocket.sendMessage(jid, { text: deal.text });
            logEntry('AWIN_WA', `Texto enviado para ${jid}, id: ${resMsg?.key?.id || 'ok'}`);
            sent = true;
          } catch (waErr) {
            logEntry('ERROR', `Falha ao enviar texto AWIN no WhatsApp (${jid}): ${waErr.message}`);
          }
        }
      }
    }

    // 2. Telegram (EXCLUSIVAMENTE CANAL TELEGRAM)
    if (isTelegramConfigured()) {
      await broadcastTelegramDeal({
        title: deal.title,
        price: deal.price || 'Oferta Especial',
        url: deal.url,
        imageUrl: deal.imageUrl,
        text: deal.text
      });
    }

    logEntry('AWIN', `✅ Oferta/Cupom AWIN enviado com sucesso (${deal.store})`);
    return deal;
  } catch (err) {
    logEntry('ERROR', `Erro na rotação AWIN: ${err.message}`);
    return null;
  }
}

// ── Rotação Automática Contínua no Piloto Automático ─────────────────────────
// Por padrão roda a cada 25 minutos durante o dia (configurável via AWIN_INTERVAL_MINUTES)
const AWIN_INTERVAL_MINUTES = parseInt(process.env.AWIN_INTERVAL_MINUTES || '25', 10);
const AWIN_INTERVAL_MS = AWIN_INTERVAL_MINUTES * 60 * 1000;
setInterval(dispatchNextAwinRotation, AWIN_INTERVAL_MS);

// Disparo inicial autônomo: dispara 10 ofertas/cupons AWIN em sequência logo após o boot
setTimeout(() => {
  if (isConnected && waSocket) {
    logEntry('AWIN', '🚀 Disparo inicial de 10 ofertas AWIN seguidas iniciando...');
    dispatchAwinBatch(10, 5000, { force: true }).catch((e) => logEntry('WARN', 'Erro no disparo inicial AWIN: ' + e.message));
  }
}, 10 * 1000);

app.post('/api/send-awin', requireApiAuth, async (req, res) => {
  try {
    const deal = await dispatchNextAwinRotation({ force: true });
    if (!deal) return res.status(500).json({ error: 'Não foi possível disparar oferta AWIN no momento (desconectado)' });
    res.json({ ok: true, store: deal.store, title: deal.title, url: deal.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function dispatchAwinBatch(count = 10, delayMs = 5000, options = {}) {
  logEntry('AWIN', `[Blast] Iniciando disparo em lote de ${count} ofertas AWIN (SOMENTE WhatsApp e Telegram)...`);
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const deal = await dispatchNextAwinRotation({ force: true, ...options });
      if (deal) results.push(deal);
    } catch (e) {
      logEntry('WARN', `Erro no disparo #${i + 1} do blast: ${e.message}`);
    }
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  logEntry('AWIN', `[Blast] Concluído disparo de ${results.length}/${count} ofertas AWIN.`);
  return results;
}

app.post('/api/blast-awin', requireApiAuth, async (req, res) => {
  const count = parseInt(req.body?.count || 10, 10);
  res.json({ ok: true, message: `Disparo de ${count} ofertas AWIN iniciado em segundo plano!` });
  dispatchAwinBatch(count, 5000, { force: true }).catch((e) => logEntry('ERROR', 'Erro no blast AWIN: ' + e.message));
});

// Endpoint direto para disparo imediato de 10 ofertas no WhatsApp e Telegram (sem travas)
app.get('/api/trigger-lancar', async (req, res) => {
  res.json({ ok: true, message: 'Disparo de 10 ofertas AWIN iniciado com sucesso no Grupo VIP e Telegram!' });
  dispatchAwinBatch(10, 4000, { force: true }).catch((e) => logEntry('ERROR', 'Erro no blast AWIN: ' + e.message));
});

// Endpoint diagnóstico para inspeção de logs recentes
app.get('/api/recent-logs', (req, res) => {
  res.json({
    totalLogs: messageLog.length,
    logs: messageLog.slice(0, 40)
  });
});

// Endpoint diagnóstico para listar grupos conectados
app.get('/api/groups', async (req, res) => {
  if (!waSocket) return res.json({ error: 'Socket offline' });
  try {
    const groups = await waSocket.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({
      id: g.id,
      subject: g.subject,
      participantsCount: g.participants?.length || 0,
      isTarget: g.id === groupJid
    }));
    res.json({ activeGroupJid: groupJid, count: list.length, groups: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint diagnóstico para detalhes de metadados de grupo (participantes, admin, announce)
app.get('/api/group-details', async (req, res) => {
  if (!waSocket) return res.status(503).json({ error: 'Socket offline' });
  const target = req.query.jid || groupJid;
  if (!target) return res.status(400).json({ error: 'Nenhum JID fornecido' });
  try {
    const meta = await waSocket.groupMetadata(target);
    const myId = waSocket.user?.id ? waSocket.user.id.split(':')[0] : null;
    const meParticipant = meta.participants?.find(p => myId && p.id.startsWith(myId));
    res.json({
      id: meta.id,
      subject: meta.subject,
      owner: meta.owner,
      creation: meta.creation,
      desc: meta.desc?.toString(),
      restrict: meta.restrict,
      announce: meta.announce,
      botPhone: myId,
      botIsAdmin: !!(meParticipant && (meParticipant.admin === 'admin' || meParticipant.admin === 'superadmin')),
      participantsCount: meta.participants?.length || 0,
      participants: (meta.participants || []).map(p => ({
        id: p.id,
        admin: p.admin || null
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint diagnóstico para testar envio no WhatsApp e retornar chave de confirmação
app.get('/api/test-send', async (req, res) => {
  if (!waSocket || !isConnected) return res.status(503).json({ error: 'Socket offline ou não conectado' });
  const target = req.query.jid || groupJid;
  const msg = req.query.text || '🧪 Mensagem de Teste PreçoSmart Bot';
  try {
    const result = await waSocket.sendMessage(target, { text: msg });
    logEntry('TEST_SEND', `Teste enviado para ${target}, id: ${result?.key?.id}`);
    res.json({
      ok: true,
      target,
      key: result?.key,
      status: result?.status
    });
  } catch (err) {
    logEntry('ERROR', `Erro no teste de envio para ${target}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/set-instagram-webhook', requireApiAuth, (req, res) => {
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

  // 1. Tenta identificar o grupo oficial diretamente pelo link de convite
  if (GROUP_INVITE_CODE) {
    try {
      const inviteInfo = await sock.groupGetInviteInfo(GROUP_INVITE_CODE);
      if (inviteInfo?.id) {
        const expectedJid = inviteInfo.id.includes('@g.us') ? inviteInfo.id : `${inviteInfo.id}@g.us`;
        groupJid = expectedJid;
        logEntry('GROUP', `🎯 Grupo VIP Oficial identificado via convite: "${inviteInfo.subject}" (${groupJid})`);

        // Se ainda não estiver participando do grupo, entra nele agora
        if (!groups[groupJid]) {
          try {
            await sock.groupAcceptInvite(GROUP_INVITE_CODE);
            logEntry('GROUP', `✅ Entrou no Grupo VIP Oficial com sucesso!`);
          } catch (joinErr) {
            logEntry('WARN', `Aviso ao aceitar convite: ${joinErr.message}`);
          }
        }
        return;
      }
    } catch (invErr) {
      logEntry('WARN', `Info do convite não retornou: ${invErr.message}`);
    }
  }

  // 2. Se já tiver JID configurado manualmente
  if (TARGET_GROUP_JID && groups[TARGET_GROUP_JID]) {
    groupJid = TARGET_GROUP_JID;
    logEntry('GROUP', `Grupo oficial confirmado: "${groups[TARGET_GROUP_JID].subject}" (${groupJid})`);
    return;
  }

  // 3. Fallback por nome
  const match = Object.values(groups).find((g) => g.subject === TARGET_GROUP || g.subject.toLowerCase().includes('preçosmart') || g.subject === 'PROMOÇÕES');
  if (match) {
    groupJid = match.id;
    logEntry('GROUP', `Grupo encontrado: "${match.subject}" (${groupJid})`);
    return;
  }

  // 4. Se ainda não entrou, tenta aceitar o convite
  if (GROUP_INVITE_CODE) {
    logEntry('GROUP', `Tentando entrar no grupo via convite...`);
    try {
      groupJid = await sock.groupAcceptInvite(GROUP_INVITE_CODE);
      logEntry('GROUP', `✅ Entrou no grupo com sucesso! JID: ${groupJid}`);
    } catch (err) {
      logEntry('ERROR', `Falha ao entrar no grupo via convite: ${err.message}`);
    }
  }
}

/**
 * Envia produto como imagem + legenda. Fallback para texto se a imagem falhar.
 */
async function sendProductMessage(product, caption) {
  const jidsToSend = getTargetJids();
  
  if (jidsToSend.length === 0) return;

  for (const targetJid of jidsToSend) {
    if (!targetJid.endsWith('@g.us')) continue; // NUNCA envia no privado

    let mentions = [];
    try {
      // MEGA-ALERTA (Marcação Fantasma) para descontos acima de 40%
      const discPct = product.history30dAvg ? Math.round((1 - product.quotes[0].pix / product.history30dAvg) * 100) : 0;
      if (discPct >= 40) {
        const metadata = await waSocket.groupMetadata(targetJid);
        mentions = metadata.participants.map(p => p.id);
        logEntry('MEGA-ALERTA', `Disparando marcação fantasma para ${mentions.length} membros no grupo ${targetJid} (Desconto: ${discPct}%)`);
      }
    } catch (e) {
      logEntry('WARN', 'Erro ao obter participantes para marcação fantasma: ' + e.message);
    }

    if (product.videoUrl) {
      try {
        await waSocket.sendMessage(targetJid, {
          video:    { url: product.videoUrl },
          caption:  caption,
          mimetype: 'video/mp4',
          mentions: mentions
        });
        continue;
      } catch (vidErr) {
        logEntry('WARN', `Vídeo oficial falhou no grupo ${targetJid}: ${vidErr.message}`);
      }
    }

    if (product.imageUrl) {
      try {
        await waSocket.sendMessage(targetJid, {
          image:    { url: product.imageUrl },
          caption:  caption,
          mimetype: 'image/jpeg',
          mentions: mentions
        });
        continue;
      } catch (imgErr) {
        logEntry('WARN', `Imagem falhou no grupo ${targetJid}: ${imgErr.message}`);
      }
    }
    
    try {
      await waSocket.sendMessage(targetJid, { text: caption, mentions: mentions });
    } catch (txtErr) {}
  }
  
  // Transmissão simultânea garantida no Telegram
  if (isTelegramConfigured()) {
    broadcastTelegramDeal({
      title: product.title,
      price: product.quotes?.[0]?.pix ? `R$ ${product.quotes[0].pix.toFixed(2).replace('.', ',')}` : '',
      url: product.finalUrl || product.url,
      imageUrl: product.imageUrl,
      text: caption
    }).catch(() => {});
  }
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
    if (!isConnected) return;
    const jidsToSend = getTargetJids();
    for (const targetJid of jidsToSend) {
      try {
        await waSocket.sendMessage(targetJid, { text: buildMorningMessage() });
      } catch (err) {}
    }
    logEntry('SENT', '[09:00] Resumo matinal enviado');
  }, { timezone: 'America/Sao_Paulo' });

  // 12:00 — Horário de almoço (Compras rápidas no celular)
  cron.schedule('0 12 * * *', () => {
    sendScheduledOffer('12h', () => getProductByCategories(['Smartphones', 'E-readers & Tablets', 'Smartwatches', 'Saúde & Beleza', 'Supermercado']));
  }, { timezone: 'America/Sao_Paulo' });

  // 15:00 — Achadinhos Shopee Automáticos
  cron.schedule('0 15 * * *', async () => {
    if (!isConnected) return;
    try {
      // Buscar apenas produtos da Shopee no catálogo
      const shopeeProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Shopee'));
      if (shopeeProducts.length > 0) {
        const p = shopeeProducts[Math.floor(Math.random() * shopeeProducts.length)];
        const caption = buildOfferMessage(p);
        await sendProductMessage(p, caption);
        logEntry('SENT', '[15:00] Achadinho Shopee automático enviado');
      }
    } catch (err) { logEntry('ERROR', 'Erro no cron Shopee Produto: ' + err.message); }
  }, { timezone: 'America/Sao_Paulo' });

  // 14:00 — Achadinhos Shopee Automáticos (1 produto por vez com foto)
  cron.schedule('0 14 * * *', async () => {
    if (!isConnected) return;
    try {
      const shopeeProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Shopee'));
      if (shopeeProducts.length > 0) {
        const p = shopeeProducts[Math.floor(Math.random() * shopeeProducts.length)];
        const caption = buildOfferMessage(p);
        await sendProductMessage(p, caption);
        logEntry('SENT', '[14:00] Achadinho Shopee automático enviado: ' + p.title);
      }
    } catch (err) { logEntry('ERROR', 'Erro no cron Shopee Produto: ' + err.message); }
  }, { timezone: 'America/Sao_Paulo' });

  // 16:00 — Pausa da tarde no trabalho (Equipamentos e produtividade)
  cron.schedule('0 16 * * *', () => {
    sendScheduledOffer('16h', () => getProductByCategories(['Notebooks', 'Monitores', 'Periféricos']));
  }, { timezone: 'America/Sao_Paulo' });

  // 19:30 — Chegada em casa / Lazer (TV, Áudio, Entretenimento)
  cron.schedule('30 19 * * *', () => {
    sendScheduledOffer('19h30', () => getProductByCategories(['TV & Vídeo', 'Áudio', 'Câmeras & Drones', 'Casa Inteligente', 'Eletrodomésticos']));
  }, { timezone: 'America/Sao_Paulo' });

  // 20:00 — Resumo Diário (Top 5 Ofertas Mais Clicadas)
  cron.schedule('0 20 * * *', async () => {
    if (!isConnected) return;
    const stats = getAnalyticsSummary();
    if (stats.topLinks.length === 0) return;
    
    let msgText = `🔥 *OFERTAS MAIS COMPRADAS HOJE!*\n\n` +
                  `Muita gente aproveitou essas promoções enquanto você trabalhava. Algumas ainda estão ativas:\n\n`;
    
    stats.topLinks.slice(0, 5).forEach((l, i) => {
      msgText += `${i + 1}. *${l.title}*\n🔗 ${l.shortUrl}\n\n`;
    });
    
    msgText += `Amanhã tem mais! Fique de olho no radar. 🎯`;
    
    const jidsToSend = getTargetJids();
    
    for (const targetJid of jidsToSend) {
      try {
        await waSocket.sendMessage(targetJid, { text: msgText });
      } catch (err) {}
    }
    logEntry('SENT', '[20:00] Resumo Top 5 enviado');
  }, { timezone: 'America/Sao_Paulo' });

  // 22:00 — Gamers e Hardware (Pico de compras tech pesadas)
  cron.schedule('0 22 * * *', async () => {
    const [top] = getTopDeals(1);
    if (top && top.discPct >= 15 && isConnected) {
      const caption = buildFlashSaleMessage(top);
      await sendProductMessage(top, caption);
      logEntry('FLASH', `[22h] Flash Sale: ${top.title}`);
    } else {
      sendScheduledOffer('22h', () => getProductByCategories(['Games & Consoles', 'Hardware & PC']));
    }
  }, { timezone: 'America/Sao_Paulo' });

  logEntry('CRON', 'Horários ativos: 09h • 12h • 16h • 19:30 • 20h (Top 5) • 22h');
}

const { MongoClient } = require('mongodb');
const { useMongoDBAuthState } = require('./mongoAuth');

const { processMessageText, extractProductKeyword, extractCanonicalId, fetchOgImage } = require('./mirror');

const SOURCE_INVITE_CODES = process.env.SOURCE_INVITE_CODES
  ? process.env.SOURCE_INVITE_CODES.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
let sourceGroupJids = [];

async function startBot() {
  let state, saveCreds;
  let mongoClient = null;

  if (process.env.MONGO_URI) {
    try {
      logEntry('BOOT', 'Conectando ao MongoDB...');
      mongoClient = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
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

      // 🚀 Disparo inicial de 10 ofertas/cupons AWIN logo após confirmação do grupo
      setTimeout(() => {
        logEntry('AWIN', '🚀 Conexão estabelecida! Disparando sequência de 10 ofertas AWIN no Grupo VIP e Telegram...');
        dispatchAwinBatch(10, 4000, { force: true }).catch((e) => logEntry('WARN', 'Erro no lote AWIN pós-conexão: ' + e.message));
      }, 3000);

      // Carrega canais de ofertas, filtrando apenas grupos de promoções
      // GRUPOS PESSOAIS, FAMÍLIA, ENSAIO, IGREJA, TRABALHO ETC. SÃO TOTALMENTE IGNORADOS!
      try {
        const participating = await sock.groupFetchAllParticipating();
        const promoKeywords = ['oferta', 'promo', 'promocao', 'promoção', 'desconto', 'achado', 'achadinho', 'garimpo', 'barato', 'cupom', 'vip', 'radar'];
        const explicitSources = (process.env.SOURCE_GROUP_JIDS || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);

        sourceGroupJids = Object.values(participating)
          .filter((g) => {
            if (!g?.id || g.id === groupJid) return false;
            if (explicitSources.includes(g.id)) return true;
            const sub = (g.subject || '').toLowerCase();
            return promoKeywords.some((kw) => sub.includes(kw));
          })
          .map((g) => g.id);

        logEntry('GROUP', `Fontes de ofertas sincronizadas (${sourceGroupJids.length} canais com foco em promoções)`);
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
      const isLoggedOut = code === DisconnectReason.loggedOut;
      logEntry('DISCONNECTED', `Desconectado (código ${code}). LoggedOut: ${isLoggedOut}`);
      if (isLoggedOut) {
        try {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          // Limpa sessão corrompida do MongoDB para evitar loop infinito de 401
          if (mongoClient) {
            await mongoClient.db('precosmart').collection('auth_info').deleteMany({});
            logEntry('BOOT', 'Sessão limpa do MongoDB e pasta local após logout 401. Gerando novo QR Code...');
          } else {
            logEntry('BOOT', 'Pasta session limpa após logout 401. Gerando novo QR Code...');
          }
        } catch(e) {
          logEntry('WARN', 'Erro ao limpar sessão: ' + e.message);
        }
        setTimeout(startBot, 2000);
      } else {
        setTimeout(startBot, 5000);
      }
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
      if (!deal || !waSocket) continue;

      const jidsToSend = getTargetJids();

      if (jidsToSend.length === 0) {
        logEntry('WARN', 'Nenhum grupo VIP configurado para envio.');
        continue;
      }

      try {
        // 📸 Garante que a oferta seja enviada com a foto oficial do produto
        let imgPayload = null;
        if (deal.buffer) {
          imgPayload = deal.buffer;
        } else if (deal.imageUrl) {
          imgPayload = { url: deal.imageUrl };
        } else if (deal.text) {
          const urlMatch = deal.text.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            try {
              const ogImg = await fetchOgImage(urlMatch[1]);
              if (ogImg) {
                deal.imageUrl = ogImg;
                imgPayload = { url: ogImg };
                logEntry('IMG', `Foto oficial extraída do produto: ${ogImg.substring(0, 50)}...`);
              }
            } catch (ogErr) {}
          }
        }

        for (const targetJid of jidsToSend) {
          if (!targetJid.endsWith('@g.us')) continue; // NUNCA envia no privado
          try {
            if (deal.type === 'video' && deal.buffer) {
              await waSocket.sendMessage(targetJid, { video: deal.buffer, caption: deal.text });
            } else if (imgPayload) {
              try {
                await waSocket.sendMessage(targetJid, { image: imgPayload, caption: deal.text });
              } catch (imgFail) {
                // Fallback de texto se a imagem falhar
                await waSocket.sendMessage(targetJid, { text: deal.text });
              }
            } else {
              await waSocket.sendMessage(targetJid, { text: deal.text });
            }
          } catch (sendErr) {
             logEntry('WARN', `Erro ao postar via Anti-Flood no grupo ${targetJid}: ${sendErr.message}`);
          }
        }
        logEntry('MIRROR', `Oferta postada via Anti-Flood para ${jidsToSend.length} grupo(s)! Restam na fila: ${dealQueue.length}`);
        lastDealSentAt = Date.now();
        // Dispara simultaneamente para o Canal do Telegram (exclusivo WPP + Telegram)
        broadcastTelegramDeal({
          text: deal.text,
          title: deal.keyword || 'Oferta PreçoSmart',
          imageUrl: deal.imageUrl || (imgPayload && imgPayload.url ? imgPayload.url : null),
          url: deal.finalUrl || deal.url
        }).catch(() => {});

        // 🔔 Log de alertas monitorados (envio privado suspenso para respeitar privacidade total)
        try {
          const matchedAlerts = checkMatchingAlerts(deal.text);
          for (const m of matchedAlerts) {
            logEntry('ALERT_MATCH', `Alerta de "${m.query}" acionado no radar (privado desativado por privacidade)`);
          }
        } catch (alertErr) {
          logEntry('WARN', 'Falha ao notificar alertas: ' + alertErr.message);
        }
      } catch (err) {
        logEntry('ERROR', 'Falha ao enviar oferta da fila: ' + err.message);
      }
    }

    isWorkerActive = false;
  }

  sock.ev.on('group-participants.update', async (update) => {
    // Only process if it's the target VIP group
    const jidsToSend = getTargetJids();
    
    if (!jidsToSend.includes(update.id)) return;

    if (update.action === 'add') {
      try {
        const welcomeMsg = `👋 Bem-vindo(a) ao *PreçoSmart Ofertas*! 🔥\n` +
          `Acompanhe aqui os melhores descontos, cupons e achadinhos da internet em tempo real! 🛒`;
        await waSocket.sendMessage(update.id, { text: welcomeMsg, mentions: update.participants });
        logEntry('WELCOME', `Boas-vindas enviadas no grupo VIP`);
      } catch (err) {
        logEntry('WARN', `Falha ao dar boas-vindas no grupo VIP: ${err.message}`);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const remoteJid = msg.key.remoteJid || '';
    const senderJid = msg.key.participant || remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');

    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''
    ).trim();

    if (text) {
      logEntry('MSG_RECV', `[${isGroup ? 'GRUPO' : 'PRIVADO'}] de: ${senderJid} (fromMe: ${!!msg.key.fromMe}) text: "${text.substring(0, 45)}"`);
    }

    // 🛡️ BLINDAGEM TOTAL DE PRIVACIDADE:
    // O robô NUNCA responde conversas comuns, áudios ou fotos em conversas particulares.
    // Ignora 100% de conversas pessoais para não atrapalhar conversas do usuário.
    // SOMENTE processa se for um comando explícito de controle do bot (iniciando com '!' ou 'lancar')
    const lowerText = text.toLowerCase().trim();
    const isExplicitCmd = text.startsWith('!') || ['lancar', 'lancar10', 'status', 'promocoes', 'cupons', 'ajuda'].includes(lowerText);
    if (!isGroup && !isExplicitCmd) {
      return;
    }

    let cleanReplyJid = remoteJid;
    if (remoteJid.includes('@s.whatsapp.net')) {
      cleanReplyJid = remoteJid.split(':')[0].replace(/@.+/, '') + '@s.whatsapp.net';
    }

    async function replyToUser(content) {
      try {
        await waSocket.sendMessage(cleanReplyJid, content);
        logEntry('CMD_SENT', `Resposta enviada para ${cleanReplyJid}`);
      } catch (replyErr) {
        logEntry('CMD_ERR', `Erro ao responder para ${cleanReplyJid}: ${replyErr.message}`);
      }
    }

    // ── 👑 COMANDOS (GRUPO VIP OU PRIVADO) ──
    if (text.startsWith('!') || isExplicitCmd) {
      if (msg.key.id) {
        if (processedCommandIds.has(msg.key.id)) return;
        processedCommandIds.add(msg.key.id);
        if (processedCommandIds.size > 200) {
          const first = processedCommandIds.values().next().value;
          processedCommandIds.delete(first);
        }
      }

      const rawOwners = process.env.OWNER_NUMBER || '';
      const ownerList = rawOwners.split(/[,;\s]+/).map((n) => n.replace(/[^0-9]/g, '')).filter(Boolean);
      const senderPhone = (msg.key.fromMe ? (sock.user?.id || '') : senderJid).replace(/[^0-9]/g, '');

      // Verifica se o remetente é admin do grupo VIP
      let isGroupAdmin = false;
      try {
        if (isGroup && remoteJid) {
          const groupMeta = await sock.groupMetadata(remoteJid);
          const found = groupMeta.participants.find(p => p.id.includes(senderPhone) || p.id === senderJid);
          if (found && (found.admin === 'admin' || found.admin === 'superadmin')) {
            isGroupAdmin = true;
          }
        }
      } catch (e) {}

      // Autorizado se enviado do próprio número (fromMe), admin do grupo VIP, ou da lista oficial de donos
      const isAuthorized = Boolean(
        msg.key.fromMe || 
        isGroupAdmin ||
        (ownerList.length > 0 && ownerList.some((owner) => {
          if (!owner || !senderPhone) return false;
          return senderPhone === owner || (owner.length >= 10 && senderPhone.endsWith(owner));
        }))
      );

      logEntry('CMD', `Comando recebido: "${text}" | de: ${senderJid} (fromMe: ${!!msg.key.fromMe}, auth: ${isAuthorized})`);

      const [cmd, ...args] = text.split(' ');
      const command = cmd.toLowerCase();

      // Anti-Flood / Debounce para comandos
      const lastExec = lastCommandExecution.get(`${senderPhone}:${command}`) || 0;
      if (Date.now() - lastExec < 3500) {
        logEntry('CMD_SKIP', `Comando ${command} ignorado por debounce de 3.5s`);
        return;
      }
      lastCommandExecution.set(`${senderPhone}:${command}`, Date.now());

      // ── ⚡ DISPATCHER MODULAR DE COMANDOS (!top, !shopee, !magalu, !crawler) ──
      try {
        const { getCommand } = require('./commands');
        const modCmd = getCommand(command);
        if (modCmd) {
          if (modCmd.adminOnly && !isAuthorized) {
            await replyToUser({ text: '🚫 Comando restrito ao administrador do PreçoSmart.' });
            return;
          }
          await modCmd.execute({
            sock,
            waSocket,
            groupJid,
            isGroup,
            args,
            replyToUser,
            sendProductMessage,
            dealQueue,
            runDealQueueWorker,
            logEntry
          });
          return;
        }
      } catch (modErr) {
        logEntry('ERROR', `Erro no comando modular ${command}: ${modErr.message}`);
      }

      // ── 👥 COMANDOS PÚBLICOS (QUALQUER MEMBRO / DONO) ──

      // 0. !lancar / lancar — Dispara lote de 10 ofertas AWIN no Grupo VIP e Telegram
      if (['!lancar', '!lancar10', '!blast', '!promocoes10', '!promos', '!ofertas10', 'lancar', 'lancar10', 'blast'].includes(command)) {
        logEntry('CMD', `🚀 Disparo manual de 10 ofertas acionado por ${senderPhone} (chat: ${remoteJid})`);
        await replyToUser({ text: '🚀 *Disparo em lote iniciado!* Enviando 10 ofertas e cupons AWIN seguidos EXCLUSIVAMENTE para o Grupo VIP e Telegram.' });
        dispatchAwinBatch(10, 4000, { force: true }).catch((e) => logEntry('ERROR', 'Erro no !lancar: ' + e.message));
        return;
      }

      // 1. !alerta <produto> [preço]
      if (command === '!alerta') {
        const queryText = args.join(' ').trim();
        if (!queryText) {
          await replyToUser({
            text: '🔔 *Como criar um alerta PreçoSmart:*\n\n' +
                  'Digite: `!alerta <produto> [preço máximo]`\n\n' +
                  '📌 *Exemplos:*\n' +
                  '• `!alerta ps5 3800` (avisa quando o PS5 estiver até R$ 3.800)\n' +
                  '• `!alerta fone jbl` (avisa qualquer promoção de fone JBL)\n' +
                  '• `!alerta airfryer 300`\n\n' +
                  'Assim que a oferta for detectada, eu te aviso no privado no mesmo segundo! 🚀'
          });
          return;
        }

        const parts = queryText.split(' ');
        let targetPrice = null;
        let prodName = queryText;
        const lastPart = parts[parts.length - 1].replace('R$', '').replace('r$', '').replace(',', '.');
        const possibleNum = parseFloat(lastPart);
        if (!isNaN(possibleNum) && possibleNum > 0 && parts.length > 1) {
          targetPrice = possibleNum;
          prodName = parts.slice(0, -1).join(' ');
        }

        const cleanUserJid = msg.key.fromMe ? (sock.user?.id?.split(':')[0] + '@s.whatsapp.net') : senderJid;
        const created = addAlert(cleanUserJid, senderPhone, prodName, targetPrice);

        await replyToUser({
          text: `✅ *Alerta criado com sucesso!*\n\n` +
                `📦 *Produto:* ${created.query}\n` +
                `💰 *Preço Máximo:* ${targetPrice ? 'R$ ' + targetPrice.toFixed(2).replace('.', ',') : 'Qualquer preço em oferta'}\n\n` +
                `Assim que essa oferta bater no radar, te envio no privado! 🔔`
        });
        logEntry('ALERT', `Novo alerta de ${senderPhone}: "${created.query}" (teto: ${targetPrice})`);
        return;
      }

      // 2. !alertas / !meusalertas
      if (command === '!alertas' || command === '!meusalertas') {
        const cleanUserJid = msg.key.fromMe ? (sock.user?.id?.split(':')[0] + '@s.whatsapp.net') : senderJid;
        const userAlerts = getUserAlerts(cleanUserJid);
        if (userAlerts.length === 0) {
          await replyToUser({
            text: '📭 Você não tem nenhum alerta cadastrado no momento.\n\nPara criar um, digite:\n`!alerta <produto> [preço]`'
          });
          return;
        }

        let msgAlerts = `📋 *Seus Alertas Ativos no PreçoSmart (${userAlerts.length}):*\n\n`;
        userAlerts.forEach((a, i) => {
          msgAlerts += `${i + 1}. *${a.query}* ${a.targetPrice ? `(até R$ ${a.targetPrice})` : '(qualquer valor)'}\n   ID: \`${a.id}\`\n\n`;
        });
        msgAlerts += `Para remover algum, digite: \`!remover <id ou produto>\` ou \`!remover todos\``;
        await replyToUser({ text: msgAlerts });
        return;
      }

      // 3. !remover / !cancelaralerta
      if (command === '!remover' || command === '!cancelaralerta') {
        const cleanUserJid = msg.key.fromMe ? (sock.user?.id?.split(':')[0] + '@s.whatsapp.net') : senderJid;
        const q = args.join(' ');
        if (!q) {
          await replyToUser({ text: '⚠️ Digite `!remover <nome do produto>` ou `!remover todos`.' });
          return;
        }
        const removed = removeAlert(cleanUserJid, q);
        await replyToUser({
          text: removed > 0
            ? `🗑️ *${removed} alerta(s) removido(s) com sucesso!*`
            : `⚠️ Nenhum alerta encontrado para "${q}". Digite \`!alertas\` para ver sua lista.`
        });
        return;
      }

      // 4. !buscar <termo>
      if (command === '!buscar' || command === '!pesquisar') {
        const q = args.join(' ').toLowerCase();
        if (!q) {
          await replyToUser({ text: '🔍 Digite `!buscar <nome do produto>` (ex: `!buscar monitor`).' });
          return;
        }
        const results = PRODUCTS.filter((p) => p.title.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))).slice(0, 3);
        if (results.length === 0) {
          await replyToUser({
            text: `🔍 Não encontrei ofertas ativas para "${q}" no catálogo agora.\n\nDica: Digite \`!alerta ${q}\` para eu te avisar no privado assim que entrar uma promoção!`
          });
          return;
        }
        let resp = `🔍 *Resultados para "${q}" no PreçoSmart:*\n\n`;
        results.forEach((p, idx) => {
          resp += `${idx + 1}️⃣ *${p.title}*\n💰 *${p.promoPrice || p.price}* ${p.discPct ? `(-${p.discPct}%)` : ''}\n🛒 Loja: ${p.store}\n🔗 ${p.link}\n\n`;
        });
        await replyToUser({ text: resp.trim() });
        return;
      }

      // 5. !ajuda / !comandos
      if (command === '!ajuda' || command === '!comandos') {
        let helpMsg = `🤖 *Comandos PreçoSmart Ofertas*\n\n` +
          `🔔 *!alerta <produto> [preço]*\nCria um alerta personalizado e te avisa no privado quando o preço cair!\n\n` +
          `📋 *!alertas*\nLista todos os seus alertas ativos.\n\n` +
          `🗑️ *!remover <produto>*\nRemove um alerta cadastrado.\n\n` +
          `🎟️ *!cupons [loja]*\nLista cupons de desconto oficiais ativos (KaBuM! e Clovis).\n\n` +
          `🔍 *!buscar <produto>*\nBusca ofertas disponíveis agora no catálogo.\n`;

        if (isAuthorized) {
          helpMsg += `\n👑 *Comandos de Administrador:*\n` +
            `👉 *!magalu* — Dispara oferta Magalu imediata\n` +
            `👉 *!postar <link>* — Fura a fila e envia oferta com afiliado\n` +
            `👉 *!status* — Exibe status do bot\n` +
            `👉 *!limpar* — Esvazia a fila pendente`;
        }

        await replyToUser({ text: helpMsg });
        return;
      }

      // ── 👑 COMANDOS DE ADMINISTRADOR (EXCLUSIVOS PARA O DONO) ──
      if (!isAuthorized) {
        await replyToUser({ text: '⛔ Este comando é reservado para o administrador do PreçoSmart.' });
        return;
      }

      // 6. !status (Admin)
      if (command === '!status') {
        const uptimeHours = (process.uptime() / 3600).toFixed(1);
        const statusMsg = `📊 *Status PreçoSmart Bot v2.1*\n\n` +
          `🟢 Conectado: Sim\n` +
          `⏱️ Tempo Online: ${uptimeHours} horas\n` +
          `📦 Fila de Ofertas: ${dealQueue.length} aguardando\n` +
          `🔔 Alertas Ativos: ${countTotalAlerts()} monitorados\n` +
          `🌙 Modo Noturno: ${isNightQuietHours() ? 'Ativo (Pausado)' : 'Desligado (Ativo)'}\n` +
          `📡 Fontes Monitoradas: ${sourceGroupJids.length} canais\n` +
          `📸 Instagram Webhook: ${instagramWebhookUrl ? 'Conectado' : 'Desligado'}\n` +
          `🎯 Grupo VIP: ${groupJid || 'Buscando...'}`;
        await replyToUser({ text: statusMsg });
        return;
      }

      // 7. !limpar (Admin)
      if (command === '!limpar') {
        const count = dealQueue.length;
        dealQueue.length = 0;
        await replyToUser({ text: `🧹 *Fila Limpa!* Foram removidas ${count} ofertas da fila pendente.` });
        return;
      }


      // 8. !postar <link ou imagem> (Admin)
      if (command === '!postar') {
        let content = args.join(' ');
        if (!content && !msg.message.imageMessage && !msg.message.videoMessage) {
          await replyToUser({ text: '⚠️ *Como usar:* Digite `!postar <link>` ou envie uma foto com `!postar`.' });
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

            // Se enviou foto mas não passou texto nem link, lê a foto com Google Gemini Vision!
            if (!content || content.trim() === '') {
              logEntry('AI', 'Analisando print/foto de oferta com Google Gemini Vision...');
              const aiData = await extractOfferFromImage(buffer);
              if (aiData && aiData.title) {
                content = `${aiData.title}\n${aiData.oldPrice ? `De: ~${aiData.oldPrice}~\n` : ''}Por: *${aiData.newPrice}*\n\n${aiData.summary}`;
                logEntry('AI', `Gemini extraiu: ${aiData.title} (${aiData.newPrice})`);
              }
            }
          } else if (msg.message.videoMessage) {
            mediaType = 'video';
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          }

          const newText = await processMessageText(content || '');
          
          let imgToSend = buffer;
          if (!imgToSend && (newText || content)) {
            const urlMatch = (newText || content).match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
              try {
                const foundOg = await fetchOgImage(urlMatch[1]);
                if (foundOg) {
                  imgToSend = { url: foundOg };
                  mediaType = 'image';
                }
              } catch (e) {}
            }
          }

          const jidsToSend = getTargetJids();

          if (jidsToSend.length === 0) {
            await replyToUser({ text: '❌ Nenhum Grupo VIP configurado para postar.' });
            return;
          }

          // Prioridade do Dono: Fura a fila e envia imediatamente para todos os VIPs!
          for (const targetJid of jidsToSend) {
            if (!targetJid.endsWith('@g.us')) continue; // NUNCA envia no privado
            try {
              if (mediaType === 'image' && imgToSend) {
                try {
                  await waSocket.sendMessage(targetJid, { image: imgToSend, caption: newText || content });
                } catch (imgFail) {
                  await waSocket.sendMessage(targetJid, { text: newText || content });
                }
              } else if (mediaType === 'video' && buffer) {
                await waSocket.sendMessage(targetJid, { video: buffer, caption: newText || content });
              } else {
                await waSocket.sendMessage(targetJid, { text: newText || content });
              }
            } catch (e) {
               logEntry('WARN', `Erro no !postar para ${targetJid}: ${e.message}`);
            }
          }

          broadcastTelegramDeal({
            text: newText || content,
            title: 'Oferta PreçoSmart',
            imageUrl: imgToSend && imgToSend.url ? imgToSend.url : null
          }).catch(() => {});

          await replyToUser({ text: `👑 *Oferta Postada!*\n\nA sua promoção acabou de ser enviada para o Grupo VIP e para o Canal do Telegram com a sua comissão embutida! 🚀` });
          logEntry('ADMIN', 'Comando !postar executado com sucesso (Grupo VIP + Telegram)!');
          return;
        } catch (postErr) {
          await replyToUser({ text: `❌ Erro ao postar: ${postErr.message}` });
          return;
        }
      }

      // 9. !magalu (Admin)
      if (command === '!magalu') {
        try {
          const product = getNextMagaluProduct();
          if (!product) {
            await replyToUser({ text: '❌ Nenhum produto do Magazine Luiza encontrado no catálogo.' });
            return;
          }

          registerSentDeal(['mag_' + product.id], product.title, product.title);

          const caption = buildOfferMessage(product);
          await sendProductMessage(product, caption);
          await replyToUser({ text: `💙 *Oferta Magalu Postada!*\n\nPostei a oferta de *${product.title}* no Grupo VIP e no Telegram!` });
          logEntry('ADMIN', `Comando !magalu executado: ${product.title}`);
          return;
        } catch (magErr) {
          await replyToUser({ text: `❌ Erro ao postar Magalu: ${magErr.message}` });
          return;
        }
      }

                  // 10. !shopee (Admin) - Envia um produto da Shopee
      if (command === '!shopee') {
        try {
          const shopeeProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Shopee'));
          if (shopeeProducts.length > 0) {
            const p = shopeeProducts[Math.floor(Math.random() * shopeeProducts.length)];
            const caption = buildOfferMessage(p);
            await sendProductMessage(p, caption);
            if (!isGroup) await replyToUser({ text: '? Produto da Shopee enviado para os grupos VIP!' });
            logEntry('ADMIN', 'Comando !shopee executado com sucesso.');
          }
          return;
        } catch (shErr) {
          await replyToUser({ text: '? Erro ao postar Shopee: ' + shErr.message });
          return;
        }
      }

      // 11. !crawler (Admin)
      if (command === '!crawler' || command === '!varrer') {
        try {
          await replyToUser({ text: '🕷️ *Iniciando varredura autônoma de ofertas nos feeds...*' });
          const deals = await fetchCuratedDeals();
          const { generateSalesCopy } = require('./geminiVision');
          let count = 0;
          for (const d of deals) {
            let processedText = d.rawText;
            
            // Apply Gemini Copywriting if possible
            const aiCopy = await generateSalesCopy(d.rawText);
            if (aiCopy) {
              processedText = aiCopy;
              logEntry('AI_COPY', `Oferta reescrita pelo Gemini: ${d.title.substring(0, 30)}...`);
            }
            
            // Pass the text through link shortener / affiliate formatter
            const finalText = await processMessageText(processedText);

            dealQueue.push({
              type: 'text',
              text: finalText,
              canonicalIds: [],
              keyword: d.title,
              textForDup: finalText
            });
            count++;
          }
          runDealQueueWorker();
          await replyToUser({ text: `✅ *Varredura Concluída!*\nForam adicionadas *${count} novas ofertas* à fila VIP! As descrições foram otimizadas com IA. 🧠` });
          return;
        } catch (cErr) {
          await replyToUser({ text: `❌ Erro no crawler: ${cErr.message}` });
          return;
        }
      }

      // 11. !cliques (Admin)
      if (command === '!cliques' || command === '!metricas') {
        const stats = getAnalyticsSummary();
        let msgText = `📊 *Métricas de Cliques e Conversão (PreçoSmart)*\n\n` +
          `🖱️ Total de Cliques: *${stats.totalClicks}*\n` +
          `🔗 Links Criados: *${stats.totalLinks}*\n\n` +
          `🏆 *Top Produtos Mais Clicados:*\n`;
        if (stats.topLinks.length === 0) {
          msgText += `_Nenhum clique registrado ainda._`;
        } else {
          stats.topLinks.forEach((l, i) => {
            msgText += `${i + 1}. *${l.title}* (${l.store}) → *${l.clicks} cliques*\n`;
          });
        }
        await replyToUser({ text: msgText });
        return;
      }
    }



    if (msg.key.fromMe) return;

    // NUNCA ingere ou responde mensagens comuns do próprio grupo VIP de destino
    const envJids = (process.env.WA_GROUP_JID || '').split(',').map(x => x.trim()).filter(Boolean);
    const vipGroups = envJids.length > 0 ? envJids : (groupJid ? [groupJid] : []);

    if (vipGroups.includes(msg.key.remoteJid)) {
      // 🛡️ MODERAÇÃO ANTI-LINK (Leão de Chácara)
      const rawOwners = process.env.OWNER_NUMBER || '';
      const ownerList = rawOwners.split(/[,;\s]+/).map((n) => n.replace(/[^0-9]/g, '')).filter(Boolean);
      const senderPhoneLocal = (msg.key.fromMe ? (sock.user?.id || '') : (msg.key.participant || msg.key.remoteJid)).replace(/[^0-9]/g, '');
      const isSenderAuthorized = Boolean(
        msg.key.fromMe || 
        (ownerList.length > 0 && ownerList.some((owner) => {
          if (!owner || !senderPhoneLocal) return false;
          return senderPhoneLocal === owner || (owner.length >= 10 && senderPhoneLocal.endsWith(owner));
        }))
      );

      if (!isSenderAuthorized) {
        const msgText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase();
        if (msgText.includes('http://') || msgText.includes('https://') || msgText.includes('.com') || msgText.includes('wa.me')) {
          try {
            await waSocket.sendMessage(msg.key.remoteJid, { delete: msg.key });
            await waSocket.sendMessage(msg.key.remoteJid, { text: '⚠️ *Mensagem Apagada!*\nÉ proibido enviar links de afiliados ou convites de outros grupos por aqui.' });
            logEntry('MOD', `Link apagado do grupo VIP enviado por ${senderPhoneLocal}`);
          } catch (e) {
            logEntry('WARN', `Falha ao apagar link no grupo VIP: ${e.message}`);
          }
        }
      }
      return;
    }

    // Ingestão: processa apenas canais sincronizados
    if (!sourceGroupJids.includes(msg.key.remoteJid)) return;

    // Processamento e normalização da oferta
    try {
      // Pega o texto da legenda ou texto normal
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '').trim();
      
      // FILTRO ESSENCIAL: Se não contém link de internet, é mensagem de conversa normal, NÃO É OFERTA!
      if (!text || !text.includes('http')) return;

      // Manda o texto para a nossa fábrica de links (vai abrir amzn.to e trocar pela sua tag)
      const newText = await processMessageText(text);
      
      // Se processMessageText retornou nulo (sem link de loja de e-commerce real), descarta
      if (!newText || !newText.trim()) return;

      // ── Deduplicação Inteligente Ultra-Rigorosa ──
      const productKeyword = extractProductKeyword(text);
      const allUrls = (text + ' ' + newText).match(/(https?:\/\/[^\s]+)/g) || [];
      const canonicalIds = allUrls.map(extractCanonicalId).filter(Boolean);

      if (isDuplicateDeal(canonicalIds, productKeyword, text)) {
        logEntry('SKIP', `Anti-Flood: oferta duplicada ignorada [${productKeyword || 'Produto'}]`);
        return;
      }
      registerSentDeal(canonicalIds, productKeyword, text);

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



