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
  { name: 'TecMundo Descontos', url: 'https://rss.tecmundo.com.br/feed' },
  { name: 'Garimpeiros', url: 'https://www.garimpeiros.com.br/feed' }
];

const cheerio = require('cheerio');

/**
 * Extrai ofertas de um XML/RSS usando cheerio
 */
function parseRssFeed(xmlText) {
  const items = [];
  const $ = cheerio.load(xmlText, { xmlMode: true });

  $('item').each((_, el) => {
    const title = $(el).find('title').text().replace(/&amp;/g, '&').replace(/&#8211;/g, '-').trim();
    const link = $(el).find('link').text().trim();
    const descRaw = $(el).find('description').text() || '';
    const desc = descRaw.replace(/<[^>]+>/g, '').trim();

    if (title && link) {
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
  });

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
      console.error('Crawler error:', e.message);
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
