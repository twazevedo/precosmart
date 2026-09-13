/**
 * @file awinApiSync.js — Sincronizador Automático da API da AWIN
 * @description Conecta diretamente na API REST da AWIN (https://api.awin.com) usando seu API Token,
 * baixa automaticamente todos os novos cupons e promoções ativas de anunciantes parceiros
 * (Nike, Olympikus, KaBuM, Clovis, Adidas, Lacoste, Samsung) e atualiza o catálogo do robô.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { upgradeToHdImage } = require('./mirror');

const DATA_PATH = path.join(__dirname, 'awinDealsData.json');

/**
 * Faz requisição HTTPS nativa para a API da AWIN
 */
function fetchAwinApi(endpoint, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.awin.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/json',
        'User-Agent': 'PrecoSmart-Bot/1.0'
      },
      timeout: 15000
    };

    if (postData) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Falha ao parsear JSON da AWIN: ${e.message}`));
          }
        } else {
          reject(new Error(`Erro API Awin (HTTP ${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao conectar na API da AWIN'));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Verifica programas aprovados e ativa parceiros pendentes automaticamente
 */
async function checkProgramApprovals(token, publisherId) {
  try {
    const res = await fetchAwinApi(`/publishers/${publisherId}/programmes?relationship=joined`, token);
    const joinedList = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    
    for (const prog of joinedList) {
      const id = Number(prog.id);
      if (id === 79926 && process.env.ADIDAS_APPROVED !== 'true') {
        process.env.ADIDAS_APPROVED = 'true';
        console.log('[AWIN-API] 🎉 Notícia fantástica: adidas BR APROVADA na Awin! Links comissionados ativados!');
      }
      if (id === 112756 && process.env.LACOSTE_APPROVED !== 'true') {
        process.env.LACOSTE_APPROVED = 'true';
        console.log('[AWIN-API] 🎉 Notícia fantástica: Lacoste BR APROVADA na Awin! Links comissionados ativados!');
      }
    }
    return joinedList;
  } catch (err) {
    console.warn('[AWIN-API] Aviso ao verificar aprovação de programas:', err.message);
    return [];
  }
}

/**
 * Sincroniza cupons e promoções ativas via API oficial da AWIN
 */
async function syncAwinPromotions() {
  const token = process.env.AWIN_API_TOKEN;
  const publisherId = process.env.AFFILIATE_AWIN || '3077915';

  if (!token || !token.trim()) {
    console.log('[AWIN-API] AWIN_API_TOKEN não configurado. Mantendo catálogo local offline.');
    return { ok: false, reason: 'Token não configurado' };
  }

  console.log(`[AWIN-API] Conectando à API da AWIN para o Publisher ID ${publisherId}...`);

  try {
    // 1. Verifica anunciantes aprovados
    await checkProgramApprovals(token, publisherId);

    // 2. Busca promoções e cupons oficiais de parceiros afiliados
    const res = await fetchAwinApi(`/publisher/${publisherId}/promotions`, token, 'POST', {
      filters: { membership: 'joined' }
    });
    const apiVouchers = Array.isArray(res?.data) ? res.data : [];

    console.log(`[AWIN-API] Recebidas ${apiVouchers.length} promoções/cupons ativos da AWIN.`);

    if (apiVouchers.length === 0) {
      return { ok: true, updated: 0, message: 'Nenhuma promoção nova retornada.' };
    }

    // Carrega o banco atual
    let currentData = { vouchers: [], products: [] };
    if (fs.existsSync(DATA_PATH)) {
      try {
        currentData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      } catch (e) {}
    }

    let addedCount = 0;
    const existingIds = new Set((currentData.vouchers || []).map(v => String(v.id)));

    for (const item of apiVouchers) {
      const id = String(item.promotionId || item.id);
      if (!id || existingIds.has(id)) continue;

      const advertiserName = item.advertiser?.name || item.advertiserName || 'Loja Parceira';
      const advertiserId = String(item.advertiser?.id || item.advertiserId || '');
      const couponCode = item.voucher?.code || item.code || '';
      const trackingLink = item.urlTracking || item.url || '';

      currentData.vouchers.unshift({
        id,
        advertiser: advertiserName,
        advertiserId,
        type: item.type || (couponCode ? 'voucher' : 'promotion'),
        code: couponCode,
        description: item.description || item.title || '',
        starts: item.startDate || '',
        ends: item.endDate || '',
        categories: Array.isArray(item.categories) ? item.categories.map(c => c.name).join(', ') : '',
        deeplinkTracking: trackingLink,
        deeplink: item.url || trackingLink,
        title: item.title || `${couponCode ? 'Cupom ' + couponCode : 'Promoção'} | ${advertiserName}`,
        imageUrl: upgradeToHdImage(item.imageUrl) || null
      });

      existingIds.add(id);
      addedCount++;
    }

    if (addedCount > 0) {
      fs.writeFileSync(DATA_PATH, JSON.stringify(currentData, null, 2), 'utf8');
      console.log(`[AWIN-API] ✅ Catálogo atualizado com ${addedCount} novas ofertas da API!`);
    } else {
      console.log('[AWIN-API] Todos os cupons da API já estavam cadastrados no catálogo local.');
    }

    return { ok: true, updated: addedCount, total: currentData.vouchers.length };
  } catch (err) {
    console.error(`[AWIN-API] Erro ao sincronizar com API da Awin: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  syncAwinPromotions,
  fetchAwinApi,
  checkProgramApprovals
};
