/**
 * @file linkShortener.js — Encurtador Inteligente de Links PreçoSmart
 * @description Encurta links de afiliados via TinyURL / is.gd com cache em memória e fallback seguro.
 */
'use strict';

const axios = require('axios');

// Cache em memória (URL Longa -> URL Encurtada)
const shortLinkCache = new Map();

/**
 * Encurta uma URL longa para formato amigável.
 * @param {string} longUrl - URL original de afiliado
 * @returns {Promise<string>} URL encurtada ou original em caso de falha
 */
async function shortenUrl(longUrl) {
  if (!longUrl || typeof longUrl !== 'string') return longUrl;
  
  // Limpa espaços
  const cleanUrl = longUrl.trim();
  
  // Verifica cache
  if (shortLinkCache.has(cleanUrl)) {
    return shortLinkCache.get(cleanUrl);
  }

  // 1. Tenta TinyURL
  try {
    const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(cleanUrl)}`, {
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0 PrecoSmartBot/2.0' }
    });
    if (res.status === 200 && typeof res.data === 'string' && res.data.startsWith('http')) {
      const shortened = res.data.trim();
      shortLinkCache.set(cleanUrl, shortened);
      return shortened;
    }
  } catch (e) {
    // Falha silenciosa para tentar fallback
  }

  // 2. Fallback: is.gd
  try {
    const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(cleanUrl)}`, {
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0 PrecoSmartBot/2.0' }
    });
    if (res.status === 200 && typeof res.data === 'string' && res.data.startsWith('http')) {
      const shortened = res.data.trim();
      shortLinkCache.set(cleanUrl, shortened);
      return shortened;
    }
  } catch (e) {
    // Falha silenciosa
  }

  // 3. Se serviços de encurtamento estiverem indisponíveis, retorna a URL original
  return cleanUrl;
}

module.exports = {
  shortenUrl,
  shortLinkCache
};
