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

const DATA_PATH = path.join(__dirname, 'awinDealsData.json');

/**
 * Faz requisição HTTPS nativa para a API da AWIN
 */
function fetchAwinApi(endpoint, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.awin.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/json',
        'User-Agent': 'PrecoSmart-Bot/1.0'
      },
      timeout: 15000
    };

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
    req.end();
  });
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
    // Busca promoções dos anunciantes vinculados
    const res = await fetchAwinApi(`/publisher/${publisherId}/promotions?membership=joined`, token);
    const apiVouchers = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

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
      const id = String(item.id || item.promotionId);
      if (!id || existingIds.has(id)) continue;

      const advertiserName = item.advertiser?.name || item.advertiserName || 'Loja Parceira';
      const advertiserId = String(item.advertiser?.id || item.advertiserId || '');

      currentData.vouchers.unshift({
        id,
        advertiser: advertiserName,
        advertiserId,
        type: item.type || (item.code ? 'voucher' : 'promotion'),
        code: item.code || '',
        description: item.description || item.title || '',
        starts: item.startDate || '',
        ends: item.endDate || '',
        categories: item.category || '',
        deeplinkTracking: item.url || item.trackingUrl || '',
        deeplink: item.deeplink || item.url || '',
        title: item.title || `${item.code ? 'Cupom ' + item.code : 'Promoção'} | ${advertiserName}`,
        imageUrl: item.imageUrl || null
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
  fetchAwinApi
};
