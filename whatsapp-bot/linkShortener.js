/**
 * @file linkShortener.js — Encurtador Limpo & Seguro PreçoSmart
 * @description Mantém links oficiais e limpos (AWIN / tidd.ly), eliminando redirecionamentos
 * intermediários de redes de anúncios (como Viglink/TinyURL) que geram alertas de vírus.
 */
'use strict';

const shortLinkCache = new Map();

/**
 * Retorna a URL oficial e segura para divulgação, sem injetar intermediários de anúncios.
 * @param {string} longUrl - URL original de afiliado
 * @returns {Promise<string>} URL limpa e direta
 */
async function shortenUrl(longUrl) {
  if (!longUrl || typeof longUrl !== 'string') return longUrl;
  const cleanUrl = longUrl.trim();

  // Se já for tidd.ly ou link oficial AWIN, preserva direto
  return cleanUrl;
}

module.exports = {
  shortenUrl,
  shortLinkCache
};
