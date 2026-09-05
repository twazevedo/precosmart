/**
 * @file crawler.js — Crawler Autônomo de Ofertas & Auto-Sourcing PreçoSmart
 */
'use strict';

const axios = require('axios');
const { processMessageText, extractCanonicalId, extractProductKeyword } = require('./mirror');
const { getRandomProduct } = require('./catalog');

/**
 * Fontes públicas de feeds RSS de ofertas verificadas
 */
const RSS_SOURCES = [
  { name: 'Adrenaline Ofertas', url: 'https://www.adrenaline.com.br/feed/' },
  { name: 'TecMundo Descontos', url: 'https://rss.tecmundo.com.br/feed' }
];

/**
 * Extrai ofertas de um XML/RSS usando regex rápido e leve
 */
function parseRssFeed(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || itemXml.match(/<title>(.*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/i) || itemXml.match(/<link>(.*?)<\/link>/i);
    const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i) || itemXml.match(/<description>(.*?)<\/description>/i);

    if (titleMatch && linkMatch) {
      const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&#8211;/g, '-').trim();
      const link = linkMatch[1].trim();
      const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      // Filtra apenas notícias ou posts que contêm palavras de compras ou desconto
      const isOffer = /(?:oferta|desconto|menor preço|por apenas|promoção|cupom|compre|r\$)/i.test(title + ' ' + desc);
      if (isOffer) {
        items.push({
          title,
          url: link,
          snippet: desc.substring(0, 150)
        });
      }
    }
  }

  return items;
}

/**
 * Busca oportunidades quentes de e-commerce na web
 */
async function fetchCuratedDeals() {
  const deals = [];

  for (const source of RSS_SOURCES) {
    try {
      const res = await axios.get(source.url, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrecoSmartBot/2.1' }
      });
      if (res.data) {
        const found = parseRssFeed(res.data);
        for (const item of found) {
          deals.push({
            title: item.title,
            rawText: '🔥 ' + item.title + '\n\n' + item.snippet + '\n\n🔗 ' + item.url,
            source: source.name
          });
        }
      }
    } catch (e) {
      // Continua para o próximo feed se um falhar
    }
  }

  // Se os feeds externos estiverem offline ou sem ofertas no momento,
  // usa o gerador autônomo do catálogo de alta conversão
  if (deals.length === 0) {
    const p = getRandomProduct();
    if (p) {
      deals.push({
        title: p.title,
        rawText: '🔥 OFERTA VERIFICADA PREÇOSMART\n\n' + p.emoji + ' *' + p.title + '*\n\n💰 De: ~R$ ' + p.history30dAvg.toFixed(2) + '~\n🔥 Por: *R$ ' + p.quotes[0].pix.toFixed(2) + '* no Pix\n\n🔗 https://www.amazon.com.br/s?k=' + encodeURIComponent(p.title),
        source: 'PreçoSmart Catalog'
      });
    }
  }

  return deals;
}

module.exports = {
  fetchCuratedDeals,
  parseRssFeed
};
