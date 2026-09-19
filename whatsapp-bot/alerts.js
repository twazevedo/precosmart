/**
 * @file alerts.js — Sistema de Alertas Personalizados PreçoSmart
 * Agora com persistência MongoDB via db.js — alertas não são perdidos entre deploys no Render.
 */
'use strict';

const { createStore } = require('./db');

const alertsStore = createStore('alerts');

// Estado em memória — carregado sincronicamente do JSON local ao iniciar
let alerts = alertsStore.getLocalSync([]) || [];

function saveAlerts() {
  alertsStore.saveLocalSync(alerts);
}

/**
 * Restaura alertas do MongoDB (chamado no boot quando Mongo está disponível).
 * Garante que alertas de membros sobrevivam a reinicializações do Render.
 */
async function initAlerts() {
  try {
    const saved = await alertsStore.get('main', null);
    if (Array.isArray(saved) && saved.length > 0) {
      // Mescla: mantém alertas locais não presentes no MongoDB
      const savedIds = new Set(saved.map(a => a.id));
      const localOnly = alerts.filter(a => !savedIds.has(a.id));
      alerts = [...saved, ...localOnly];
    }
  } catch (err) {
    // Fallback silencioso — alertas locais permanecem
  }
  return alerts;
}

function addAlert(userJid, phone, query, targetPrice = null) {
  const id = 'alt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const newAlert = {
    id,
    userJid,
    phone,
    query: query.toLowerCase().trim(),
    targetPrice: targetPrice ? Number(targetPrice) : null,
    createdAt: new Date().toISOString(),
    matchCount: 0,
    lastNotifiedAt: null
  };
  alerts.push(newAlert);
  saveAlerts();
  return newAlert;
}

function removeAlert(userJid, queryOrId) {
  const q = queryOrId.toLowerCase().trim();
  const initialLen = alerts.length;
  alerts = alerts.filter(
    (a) => !(a.userJid === userJid && (a.id === q || a.query.includes(q) || q === 'todos'))
  );
  saveAlerts();
  return initialLen - alerts.length;
}

function getUserAlerts(userJid) {
  return alerts.filter((a) => a.userJid === userJid);
}

/**
 * Extrai valor numérico de preço com alta precisão.
 * Evita pegar modelos como "PS5", "iPhone 15", "Galaxy S24".
 */
function extractPriceFromText(text) {
  if (!text) return null;

  // 1. Padrão explícito com R$: R$ 3.499,00 ou R$ 199
  const rMatch = text.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:,[0-9]{2})?)/i);
  if (rMatch) {
    const raw = rMatch[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(raw);
    if (!isNaN(val)) return val;
  }

  // 2. Padrão com 'por' ou 'de': por 3.499,00 ou de 199,90
  const porMatch = text.match(/(?:por|de|apenas)\s*(?:R\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+,[0-9]{2})/i);
  if (porMatch) {
    const raw = porMatch[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(raw);
    if (!isNaN(val)) return val;
  }

  // 3. Qualquer número com formato monetário explícito (ex: 3.499,00 ou 199,90)
  const decMatch = text.match(/\b([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/);
  if (decMatch) {
    const raw = decMatch[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(raw);
    if (!isNaN(val)) return val;
  }

  return null;
}

function checkMatchingAlerts(offerText) {
  if (!offerText || alerts.length === 0) return [];

  const textLower = offerText.toLowerCase();
  const detectedPrice = extractPriceFromText(offerText);
  const now = Date.now();
  const cooldownMs = 4 * 60 * 60 * 1000;

  const matches = [];

  for (const alert of alerts) {
    const keywords = alert.query.split(/\s+/).filter(Boolean);
    const hasAllKeywords = keywords.every((kw) => textLower.includes(kw));

    if (hasAllKeywords) {
      if (alert.targetPrice && detectedPrice) {
        if (detectedPrice > alert.targetPrice) {
          continue; // Preço ainda acima do teto do usuário
        }
      }

      if (alert.lastNotifiedAt && (now - new Date(alert.lastNotifiedAt).getTime()) < cooldownMs) {
        continue;
      }

      alert.matchCount = (alert.matchCount || 0) + 1;
      alert.lastNotifiedAt = new Date().toISOString();
      matches.push({
        userJid: alert.userJid,
        phone: alert.phone,
        query: alert.query,
        detectedPrice,
        targetPrice: alert.targetPrice
      });
    }
  }

  if (matches.length > 0) {
    saveAlerts();
  }

  return matches;
}

function countTotalAlerts() {
  return alerts.length;
}

function getAllAlerts() {
  return [...alerts];
}

module.exports = {
  addAlert,
  removeAlert,
  getUserAlerts,
  getAllAlerts,
  checkMatchingAlerts,
  countTotalAlerts,
  extractPriceFromText,
  initAlerts
};
