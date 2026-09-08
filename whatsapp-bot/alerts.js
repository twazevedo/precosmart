/**
 * @file alerts.js — Sistema de Alertas Personalizados PreçoSmart
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, 'alerts.json');

let alerts = [];

let saveTimeout = null;

try {
  if (fs.existsSync(ALERTS_FILE)) {
    const data = fs.readFileSync(ALERTS_FILE, 'utf8');
    alerts = JSON.parse(data || '[]');
  } else {
    alerts = [];
  }
} catch (err) {
  alerts = [];
}

function loadAlerts() {
  return alerts;
}

function saveAlerts() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fs.promises.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf8');
    } catch (err) {
      console.error('Erro ao salvar alertas:', err.message);
    }
  }, 1000);
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
 * Extrai valor numérico de preço com alta precisão
 * Evita pegar modelos como "PS5", "iPhone 15", "Galaxy S24"
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
  extractPriceFromText
};
