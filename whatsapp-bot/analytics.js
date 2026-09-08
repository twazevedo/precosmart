/**
 * @file analytics.js — Encurtador de Links Próprio & Métricas de Conversão PreçoSmart
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'analytics.json');
let data = {
  totalClicks: 0,
  links: {}
};

let saveTimeout = null;

try {
  if (fs.existsSync(DATA_FILE)) {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(content || '{"totalClicks":0,"links":{}}');
  }
} catch (err) {
  data = { totalClicks: 0, links: {} };
}

function loadAnalytics() {
  return data;
}

function saveAnalytics() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // Silencioso em caso de falha de I/O
    }
  }, 1000);
}

function generateCode() {
  return crypto.randomBytes(3).toString('hex'); // 6 caracteres alfanuméricos
}

/**
 * Cria ou recupera link curto para rastreamento de cliques
 */
function createShortLink(targetUrl, title = 'Produto', store = 'Varejo', price = null) {

  // Verifica se já existe link para essa URL exata
  for (const code in data.links) {
    if (data.links[code].targetUrl === targetUrl) {
      return {
        code,
        shortPath: '/r/' + code,
        targetUrl
      };
    }
  }

  const code = generateCode();
  data.links[code] = {
    code,
    targetUrl,
    title: title.substring(0, 80),
    store,
    price: price ? Number(price) : null,
    clicks: 0,
    createdAt: new Date().toISOString(),
    lastClickAt: null
  };
  saveAnalytics();

  return {
    code,
    shortPath: '/r/' + code,
    targetUrl
  };
}

/**
 * Registra o clique e retorna a URL final de afiliado para redirecionamento
 */
function recordClick(code) {
  const link = data.links[code];
  if (!link) return null;

  link.clicks = (link.clicks || 0) + 1;
  link.lastClickAt = new Date().toISOString();
  data.totalClicks = (data.totalClicks || 0) + 1;
  saveAnalytics();

  return link.targetUrl;
}

/**
 * Retorna resumo executivo de métricas para o Dashboard
 */
function getAnalyticsSummary() {
  const allLinks = Object.values(data.links);
  const topLinks = [...allLinks]
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 10);

  return {
    totalClicks: data.totalClicks || 0,
    totalLinks: allLinks.length,
    topLinks
  };
}

module.exports = {
  createShortLink,
  recordClick,
  getAnalyticsSummary
};
