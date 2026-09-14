/**
 * @file linkShortener.js — Encurtador Limpo & Seguro PreçoSmart com AWIN tidd.ly
 * @description Conecta diretamente à Link Builder API oficial da AWIN para gerar links
 * encurtados com o domínio oficial (https://tidd.ly/XXXXXX), sem intermediários de anúncios.
 */
'use strict';

const https = require('https');

const shortLinkCache = new Map();

/**
 * Encurta uma URL de afiliado AWIN usando a Link Builder API oficial (gerando links https://tidd.ly/...).
 * @param {string} longUrl - URL de afiliado completa (awin1.com/cread.php)
 * @returns {Promise<string>} URL encurtada tidd.ly ou URL original em caso de fallback
 */
async function shortenUrl(longUrl) {
  if (!longUrl || typeof longUrl !== 'string') return longUrl;
  const cleanUrl = longUrl.trim();

  // Se já for tidd.ly ou outro link curto, retorna direto
  if (cleanUrl.includes('tidd.ly') || cleanUrl.includes('tinyurl.com') || cleanUrl.includes('is.gd') || cleanUrl.includes('amzn.to')) {
    return cleanUrl;
  }

  if (shortLinkCache.has(cleanUrl)) {
    return shortLinkCache.get(cleanUrl);
  }

  // 1. Encurtamento Automático de Links Mercado Livre e Amazon
  if (cleanUrl.includes('mercadolivre.') || cleanUrl.includes('amazon.')) {
    try {
      const axios = require('axios');
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(cleanUrl)}`, { timeout: 4000 });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        const shortRes = res.data.trim();
        shortLinkCache.set(cleanUrl, shortRes);
        return shortRes;
      }
    } catch (e) {
      return cleanUrl;
    }
  }

  // 2. Encurtamento Oficial AWIN (tidd.ly) via Link Builder API
  const token = process.env.AWIN_API_TOKEN;
  const publisherId = process.env.AFFILIATE_AWIN || process.env.AWIN_PUBLISHER_ID || '3077915';

  if (!token || !token.trim() || !cleanUrl.includes('awin1.com')) {
    return cleanUrl;
  }

  const midMatch = cleanUrl.match(/[?&]awinmid=(\d+)/);
  const uedMatch = cleanUrl.match(/[?&]ued=([^&]+)/);

  if (!midMatch || !uedMatch) {
    return cleanUrl;
  }

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
    const shortUrl = await new Promise((resolve) => {
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
          'User-Agent': 'PrecoSmart-Bot/1.0'
        },
        timeout: 6000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              if (json.shortUrl && typeof json.shortUrl === 'string') {
                return resolve(json.shortUrl);
              }
            } catch (err) {}
          }
          resolve(cleanUrl);
        });
      });

      req.on('error', () => resolve(cleanUrl));
      req.on('timeout', () => {
        req.destroy();
        resolve(cleanUrl);
      });

      req.write(postData);
      req.end();
    });

    if (shortUrl && shortUrl !== cleanUrl) {
      shortLinkCache.set(cleanUrl, shortUrl);
    }
    return shortUrl;
  } catch (err) {
    return cleanUrl;
  }
}

module.exports = {
  shortenUrl,
  shortLinkCache
};
