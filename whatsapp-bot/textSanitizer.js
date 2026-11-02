/**
 * @file textSanitizer.js — Sanitizador Universal de Textos e Preços PreçoSmart
 * @description Decodifica entidades HTML (&#199;, &amp;, etc.), corrige mojibake UTF-8,
 * converte preços no formato "BRL169.90" para "R$ 169,90" e limpa rótulos truncados
 * como "DESCRIÇÃO:Leve..." ou ".COMPOSIÇÃO" nos catálogos AWIN, Shopee e Multimarcas.
 */
'use strict';

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ccedil: '\u00e7', Ccedil: '\u00c7',
  atilde: '\u00e3', Atilde: '\u00c3', otilde: '\u00f5', Otilde: '\u00d5',
  aacute: '\u00e1', Aacute: '\u00c1', eacute: '\u00e9', Eacute: '\u00c9',
  iacute: '\u00ed', Iacute: '\u00cd', oacute: '\u00f3', Oacute: '\u00d3',
  uacute: '\u00fa', Uacute: '\u00da', acirc: '\u00e2', Acirc: '\u00c2',
  ecirc: '\u00ea', Ecirc: '\u00ca', ocirc: '\u00f4', Ocirc: '\u00d4',
  agrave: '\u00e0', Agrave: '\u00c0', uuml: '\u00fc', Uuml: '\u00dc',
  ntilde: '\u00f1', Ntilde: '\u00d1', ordm: '\u00ba', ordf: '\u00aa',
  ndash: '\u2013', mdash: '\u2014', rsquo: '\u2019', lsquo: '\u2018',
  rdquo: '\u201d', ldquo: '\u201c', hellip: '\u2026', reg: '\u00ae',
  trade: '\u2122', copy: '\u00a9'
};

/**
 * Decodifica entidades HTML numéricas/nomeadas, corrige mojibake e pontuação colada.
 * @param {string} str
 * @returns {string}
 */
function cleanText(str) {
  if (!str || typeof str !== 'string') return str;
  let s = str;

  // Corrige eventual mojibake UTF-8 interpretado como Latin-1 (ex: "HigiÃªnica" -> "Higiênica")
  if (/\u00c3[\u0080-\u00bf]/.test(s)) {
    try {
      const fixed = Buffer.from(s, 'latin1').toString('utf8');
      if (!fixed.includes('\ufffd')) s = fixed;
    } catch (_) {}
  }

  // Remove tags HTML residuais
  s = s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ');

  // Decodifica entidades HTML (2 passadas para casos duplamente escapados como &amp;#199;)
  for (let pass = 0; pass < 2; pass++) {
    if (!/&#\d+;|&#x[0-9a-f]+;|&[a-zA-Z]+;/i.test(s)) break;
    s = s
      .replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10);
        return code > 0 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const code = parseInt(hex, 16);
        return code > 0 ? String.fromCodePoint(code) : '';
      })
      .replace(/&([a-zA-Z]+);/g, (full, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : full));
  }

  // Remove prefixo redundante "DESCRIÇÃO:" / "SOBRE O PRODUTO:" no início
  s = s.replace(/^\s*(?:descri[\u00e7c][\u00e3a]o(?:\s+do\s+produto)?|sobre\s+o\s+produto|detalhes\s+do\s+produto|informa[\u00e7c][\u00f5o]es)\s*[:\-–]?\s*/i, '');

  // Remove cabeçalhos soltos truncados no final de descrições cortadas (ex: ".COMPOSIÇÃO", "ESPECIFICAÇÕES")
  s = s.replace(/\s*\.?\s*(?:COMPOSI[\u00c7C][\u00c3A]O|ESPECIFICA[\u00c7C][\u00d5O]ES|CARACTER[\u00cdI]STICAS|DIMENS[\u00d5O]ES|ITENS\s+INCLUSOS|FICHA\s+T[\u00c9E]CNICA|MODO\s+DE\s+USO)\s*[:\-–]?\s*$/i, '.');

  // Garante espaço após dois-pontos ou ponto final quando colado em palavra (ignorando URLs http://)
  s = s.replace(/([A-Za-z\u00c0-\u00ff]):([A-Za-z\u00c0-\u00ff])/g, '$1: $2');
  s = s.replace(/([a-z\u00e0-\u00ff])\.([A-Z\u00c0-\u00dd])/g, '$1. $2');

  // Converte eventual preço inline "BRL169.90" ou "BRL 169,90" dentro do texto
  s = s.replace(/\bBRL\s*(\d+)[.,](\d{2})\b/gi, (_, intPart, decPart) => {
    const num = parseFloat(`${intPart}.${decPart}`);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
  });

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza strings de preço ("BRL169.90", "R$169.90", "169.9") para "R$ 169,90".
 * @param {string|number} val
 * @returns {string|null}
 */
function cleanPrice(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
  }
  const s = cleanText(String(val));
  const m = s.match(/^(?:BRL|R\$)?\s*(\d+(?:\.\d{3})*(?:[.,]\d{1,2})?|\d+)$/i);
  if (m) {
    const raw = m[1];
    if (/^\d+\.\d{1,2}$/.test(raw)) {
      const num = parseFloat(raw);
      return num > 0
        ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')
        : s;
    }
    const normalized = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(normalized) && normalized > 0) {
      return normalized.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
    }
  }
  return s;
}

module.exports = {
  cleanText,
  cleanPrice
};
