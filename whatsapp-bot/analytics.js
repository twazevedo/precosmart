/**
 * @file analytics.js — Encurtador de Links Próprio & Métricas de Conversão PreçoSmart
 * Agora com persistência MongoDB via db.js — dados não são perdidos entre deploys no Render.
 */
'use strict';

const crypto = require('crypto');
const { createStore } = require('./db');

const analyticsStore = createStore('analytics');

// Estado em memória — carregado sincronicamente do JSON local ao iniciar
let data = analyticsStore.getLocalSync({ totalClicks: 0, links: {} }) || { totalClicks: 0, links: {} };

function saveAnalytics() {
  analyticsStore.saveLocalSync(data);
}

function generateCode() {
  return crypto.randomBytes(3).toString('hex'); // 6 chars hex
}

/**
 * Restaura dados do MongoDB (chamado no boot quando Mongo está disponível).
 * Mescla dados do Mongo com os locais, garantindo que cliques feitos durante
 * o downtime do Mongo não sejam perdidos.
 */
async function initAnalytics() {
  try {
    const saved = await analyticsStore.get('main', null);
    if (saved && typeof saved === 'object') {
      // Mescla: preserva links locais não-presentes no MongoDB
      const merged = {
        totalClicks: Math.max(data.totalClicks || 0, saved.totalClicks || 0),
        links: { ...(saved.links || {}), ...(data.links || {}) }
      };
      data = merged;
    }
  } catch (err) {
    // Fallback silencioso — dados locais permanecem
  }
  return data;
}

/**
 * Cria ou recupera link curto para rastreamento de cliques.
 */
function createShortLink(targetUrl, title = 'Produto', store = 'Varejo', price = null) {
  // Verifica se já existe link para essa URL exata
  for (const code in data.links) {
    if (data.links[code].targetUrl === targetUrl) {
      return { code, shortPath: '/r/' + code, targetUrl };
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

  return { code, shortPath: '/r/' + code, targetUrl };
}

/**
 * Registra o clique e retorna a URL final de afiliado para redirecionamento.
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
 * Retorna resumo executivo de métricas para o Dashboard.
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
  getAnalyticsSummary,
  initAnalytics
};
