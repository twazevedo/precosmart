/**
 * @file dealScore.js — Algoritmo do Termômetro de Ofertas & Histórico PreçoSmart
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'price_history.json');
let history = {};

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      history = JSON.parse(data || '{}');
    } else {
      history = {};
    }
  } catch (err) {
    history = {};
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    // Falha silenciosa em I/O
  }
}

loadHistory();

function normalizeProductKey(keyOrTitle) {
  if (!keyOrTitle) return 'unknown';
  return keyOrTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join('_');
}

/**
 * Avalia o desconto e a qualidade da oferta em escala de 1.0 a 10.0
 * @param {string} keyOrTitle - Nome ou identificador canônico do produto
 * @param {number} currentPrice - Preço atual da promoção
 * @param {number|null} oldPrice - Preço de referência / De (opcional)
 * @returns {object} Detalhes do score e badge formatada
 */
function evaluateDeal(keyOrTitle, currentPrice, oldPrice = null) {
  if (!currentPrice || currentPrice <= 0) {
    return {
      score: 7.0,
      badge: '🏷️ *Termômetro PreçoSmart:* 7.0/10 — Oferta Verificada',
      discountPct: 0,
      isAllTimeLow: false
    };
  }

  loadHistory();
  const key = normalizeProductKey(keyOrTitle);
  const record = history[key] || {
    min: currentPrice,
    max: oldPrice && oldPrice > currentPrice ? oldPrice : currentPrice,
    avg: currentPrice,
    count: 0
  };

  const isAllTimeLow = currentPrice < record.min;
  const minPrice = Math.min(record.min, currentPrice);
  const maxPrice = Math.max(record.max, oldPrice || currentPrice);
  const newCount = record.count + 1;
  const newAvg = ((record.avg * record.count) + currentPrice) / newCount;

  // Atualiza histórico
  history[key] = {
    min: minPrice,
    max: maxPrice,
    avg: Number(newAvg.toFixed(2)),
    count: newCount,
    lastSeen: new Date().toISOString()
  };
  saveHistory();

  // Cálculo de desconto percentual
  let discountPct = 0;
  if (oldPrice && oldPrice > currentPrice) {
    discountPct = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
  } else if (newAvg > currentPrice) {
    discountPct = Math.round(((newAvg - currentPrice) / newAvg) * 100);
  }

  // Pontuação baseada em desconto e mínima histórica
  let score = 6.0;
  if (isAllTimeLow && newCount > 1) {
    score = 9.8;
  } else if (discountPct >= 40) {
    score = 9.7;
  } else if (discountPct >= 30) {
    score = 9.2;
  } else if (discountPct >= 20) {
    score = 8.5;
  } else if (discountPct >= 10) {
    score = 7.6;
  } else if (discountPct >= 5) {
    score = 6.8;
  }

  let rating = '';
  let badge = '';

  if (score >= 9.5) {
    rating = 'OFERTA HISTÓRICA 🔥';
    badge = '🌡️ *Termômetro PreçoSmart:* *' + score.toFixed(1) + '/10* — MENOR PREÇO HISTÓRICO! 🔥';
  } else if (score >= 8.5) {
    rating = 'OPORTUNIDADE DE OURO ⭐';
    badge = '🌡️ *Termômetro PreçoSmart:* *' + score.toFixed(1) + '/10* — DESCONTO EXCELENTE (' + discountPct + '% OFF) ⭐';
  } else if (score >= 7.5) {
    rating = 'BOM PREÇO 🏷️';
    badge = '🌡️ *Termômetro PreçoSmart:* *' + score.toFixed(1) + '/10* — Bom Desconto (' + discountPct + '% OFF) 🏷️';
  } else {
    rating = 'PREÇO JUSTO 💡';
    badge = '🌡️ *Termômetro PreçoSmart:* *' + score.toFixed(1) + '/10* — Oferta Recomendada 💡';
  }

  return {
    score,
    rating,
    discountPct,
    isAllTimeLow,
    minPrice,
    avgPrice: Number(newAvg.toFixed(2)),
    badge
  };
}

module.exports = {
  evaluateDeal,
  normalizeProductKey
};
