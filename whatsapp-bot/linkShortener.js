/**
 * @file linkShortener.js — Encurtador Limpo & Seguro PreçoSmart (AWIN tidd.ly + is.gd 301 Direto)
 * @description Conecta diretamente à Link Builder API oficial da AWIN (https://tidd.ly/XXXXXX)
 * e utiliza is.gd (redirecionamento 301 puro, sem anúncios) para encurtar automaticamente
 * links longos da Shopee (an_redir), AWIN, Boticário e Magalu no momento do disparo.
 */
'use strict';

const https = require('https');

const shortLinkCache = new Map();

/**
 * Encurta via is.gd (301 Moved Permanently direto, sem página intermediária e sem chave de API).
 * @param {string} targetUrl
 * @returns {Promise<string|null>}
 */
function shortenWithIsGd(targetUrl) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(targetUrl);
    const options = {
      hostname: 'is.gd',
      path: `/create.php?format=simple&url=${encoded}`,
      method: 'GET',
      headers: {
        'User-Agent': 'PrecoSmart-Bot/2.2'
      },
      timeout: 4500
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const trimmed = (data || '').trim();
        if (res.statusCode >= 200 && res.statusCode < 300 && /^https:\/\/is\.gd\/[A-Za-z0-9_]+$/.test(trimmed)) {
          return resolve(trimmed);
        }
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Encurta uma URL de afiliado usando AWIN Link Builder (tidd.ly) ou is.gd (301 limpo).
 * @param {string} longUrl - URL de afiliado completa
 * @returns {Promise<string>} URL encurtada ou URL original em caso de fallback
 */
async function shortenUrl(longUrl) {
  if (!longUrl || typeof longUrl !== 'string') return longUrl;
  const cleanUrl = longUrl.trim();

  // Se já for link curto confiável, retorna direto
  if (
    cleanUrl.includes('tidd.ly') ||
    cleanUrl.includes('is.gd/') ||
    cleanUrl.includes('amzn.to') ||
    cleanUrl.includes('mercadolivre.com/sec/') ||
    /^https?:\/\/s\.shopee\.com\.br\/[A-Za-z0-9_-]{4,16}$/.test(cleanUrl)
  ) {
    return cleanUrl;
  }

  if (shortLinkCache.has(cleanUrl)) {
    return shortLinkCache.get(cleanUrl);
  }

  // 1. Tentativa Oficial AWIN (tidd.ly) via Link Builder API quando token estiver configurado
  const token = process.env.AWIN_API_TOKEN || '';
  const publisherId = process.env.AFFILIATE_AWIN || process.env.AWIN_PUBLISHER_ID || '3077915';

  if (token && token.trim() && cleanUrl.includes('awin1.com')) {
    const midMatch = cleanUrl.match(/[?&]awinmid=(\d+)/);
    const uedMatch = cleanUrl.match(/[?&]ued=([^&]+)/);

    if (midMatch && uedMatch) {
      const advertiserId = parseInt(midMatch[1], 10);
      let destinationUrl = '';
      try {
        destinationUrl = decodeURIComponent(uedMatch[1]);
      } catch (e) {
        destinationUrl = uedMatch[1];
      }

      const clickMatch = cleanUrl.match(/[?&]clickref=([^&]+)/);
      const clickRef = clickMatch ? decodeURIComponent(clickMatch[1]) : 'PILOTO_AUTO';

      try {
        const awinShort = await new Promise((resolve) => {
          const postData = JSON.stringify({
            advertiserId,
            destinationUrl,
            shorten: true,
            clickRef
          });

          const options = {
            hostname: 'api.awin.com',
            path: `/publishers/${publisherId}/linkbuilder/generate`,
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token.trim()}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              'User-Agent': 'PrecoSmart-Bot/2.2'
            },
            timeout: 5000
          };

          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const json = JSON.parse(data);
                  if (json.shortUrl && typeof json.shortUrl === 'string') {
                    return resolve(json.shortUrl);
                  }
                } catch (err) {}
              }
              resolve(null);
            });
          });

          req.on('error', () => resolve(null));
          req.on('timeout', () => {
            req.destroy();
            resolve(null);
          });

          req.write(postData);
          req.end();
        });

        if (awinShort && awinShort !== cleanUrl) {
          shortLinkCache.set(cleanUrl, awinShort);
          return awinShort;
        }
      } catch (err) {}
    }
  }

  // 2. Encurtamento automático 301 limpo via is.gd para links longos (> 48 chars)
  if (cleanUrl.length > 48) {
    try {
      const isgdShort = await shortenWithIsGd(cleanUrl);
      if (isgdShort) {
        shortLinkCache.set(cleanUrl, isgdShort);
        return isgdShort;
      }
    } catch (err) {}
  }

  return cleanUrl;
}

/**
 * Localiza todas as URLs longas em um texto de oferta e substitui pelas versões encurtadas.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function shortenLinksInText(text) {
  if (!text || typeof text !== 'string') return text;
  const urls = text.match(/https?:\/\/[^\s)]+/g);
  if (!urls || urls.length === 0) return text;

  let updated = text;
  const uniqueUrls = [...new Set(urls)];
  for (const u of uniqueUrls) {
    if (u.length <= 48) continue;
    const shortU = await shortenUrl(u);
    if (shortU && shortU !== u) {
      updated = updated.split(u).join(shortU);
    }
  }
  return updated;
}

module.exports = {
  shortenUrl,
  shortenLinksInText,
  shortLinkCache
};
