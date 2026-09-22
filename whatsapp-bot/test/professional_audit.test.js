/**
 * @file professional_audit.test.js
 * Bateria de testes de validação das otimizações profissionais de segurança,
 * concorrência, estabilidade de dados e integridade do PreçoSmart.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('1. SEGURANÇA: Backdoor estático foi removido de security.js', () => {
  process.env.API_SECRET_KEY = 'minha_chave_de_producao';
  const { requireApiAuth } = require('../security');
  
  // Simula request externa com a chave antiga do backdoor
  let statusResult = null;
  let jsonResult = null;
  const req = {
    ip: '198.51.100.1', // IP público externo
    headers: { 'x-api-key': 'precosmart_adm_sec_994586' }
  };
  const res = {
    status(code) { statusResult = code; return this; },
    json(data) { jsonResult = data; }
  };
  let calledNext = false;
  requireApiAuth(req, res, () => { calledNext = true; });

  assert.equal(calledNext, false, 'Backdoor antigo não deve passar na autenticação');
  assert.equal(statusResult, 401, 'Deve retornar HTTP 401 Unauthorized para chave antiga');
});

test('2. SEGURANÇA: Tokens na Query String são rejeitados (OWASP ASVS)', () => {
  process.env.API_SECRET_KEY = 'super_secret_token_2026';
  const { requireApiAuth } = require('../security');

  let statusResult = null;
  const req = {
    ip: '198.51.100.2',
    headers: {},
    query: { key: 'super_secret_token_2026' } // Passado via URL
  };
  const res = {
    status(code) { statusResult = code; return this; },
    json() {}
  };
  let calledNext = false;
  requireApiAuth(req, res, () => { calledNext = true; });

  assert.equal(calledNext, false, 'Token na query string não deve ser aceito');
  assert.equal(statusResult, 401);
});

test('3. SEGURANÇA: Autenticação via Header X-API-KEY com chave legítima é aceita', () => {
  process.env.API_SECRET_KEY = 'super_secret_token_2026';
  const { requireApiAuth } = require('../security');

  const req = {
    ip: '198.51.100.3',
    headers: { 'x-api-key': 'super_secret_token_2026' }
  };
  const res = {
    status() { return this; },
    json() {}
  };
  let calledNext = false;
  requireApiAuth(req, res, () => { calledNext = true; });

  assert.equal(calledNext, true, 'Deve liberar acesso com token configurado');
});

test('4. SSRF & REDIRECT: isSafePublicUrl bloqueia sub-redes privadas e representações alternativas de IP', () => {
  const { isSafePublicUrl } = require('../mirror');

  assert.equal(isSafePublicUrl('http://127.0.0.1:3000'), false);
  assert.equal(isSafePublicUrl('http://127.0.0.2'), false);
  assert.equal(isSafePublicUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isSafePublicUrl('http://10.0.0.5'), false);
  assert.equal(isSafePublicUrl('http://192.168.1.1'), false);
  assert.equal(isSafePublicUrl('http://172.16.0.1'), false);
  assert.equal(isSafePublicUrl('http://0.0.0.0'), false);
  assert.equal(isSafePublicUrl('http://[::1]'), false);
  assert.equal(isSafePublicUrl('http://2130706433'), false); // 127.0.0.1 em decimal

  assert.equal(isSafePublicUrl('https://www.kabum.com.br/produto/123'), true);
  assert.equal(isSafePublicUrl('https://www.amazon.com.br/dp/B08N5WRWNW'), true);
});

test('5. DEALSCORE: normalizeProductKey preserva especificações cruciais (5G, 4K, 15, S24)', () => {
  const { normalizeProductKey } = require('../dealScore');

  const keyIphone15 = normalizeProductKey('Apple iPhone 15 Pro Max 256GB');
  const keyIphone14 = normalizeProductKey('Apple iPhone 14 Pro Max 256GB');
  const keyTv4k = normalizeProductKey('Smart TV 50 4K UHD Samsung');
  const keyGalaxy5g = normalizeProductKey('Smartphone Samsung Galaxy S24 5G 128GB');

  assert.match(keyIphone15, /15/, 'Chave do iPhone 15 deve conter o 15');
  assert.match(keyIphone14, /14/, 'Chave do iPhone 14 deve conter o 14');
  assert.notEqual(keyIphone15, keyIphone14, 'iPhone 15 e 14 NÃO podem compartilhar o mesmo histórico');
  assert.match(keyTv4k, /4k/, 'TV 4K deve conter a sigla 4k');
  assert.match(keyGalaxy5g, /5g/, 'Galaxy 5G deve conter a sigla 5g');
});

test('6. AWIN CATALOG: getSpecific*Deal é imune a índices negativos ou vazios', async () => {
  const { 
    getSpecificKabumDeal, 
    getSpecificNikeDeal, 
    getSpecificAmazonDeal, 
    getSpecificMLDeal 
  } = require('../awinCatalog');

  // Testa índice negativo (antes causava TypeError de list[-1])
  const dealKabumNeg = await getSpecificKabumDeal(-1);
  const dealAmzNeg = await getSpecificAmazonDeal(-5);
  const dealMlNeg = await getSpecificMLDeal(-99);

  if (dealKabumNeg) assert.ok(dealKabumNeg.title, 'Deve retornar oferta válida mesmo com índice negativo');
  if (dealAmzNeg) assert.ok(dealAmzNeg.title, 'Deve retornar oferta válida na Amazon com índice negativo');
  if (dealMlNeg) assert.ok(dealMlNeg.title, 'Deve retornar oferta válida no ML com índice negativo');
});

test('7. PERSISTÊNCIA: db.js createStore armazena e lê com compatibilidade', async () => {
  const { createStore } = require('../db');
  const store = createStore('test_audit_store');

  await store.set('item_alpha', { score: 9.8, name: 'Produto Alpha' });
  await store.set('item_beta', { score: 7.5, name: 'Produto Beta' });

  const resAlpha = await store.get('item_alpha');
  const resBeta = await store.get('item_beta');

  assert.equal(resAlpha?.score, 9.8);
  assert.equal(resBeta?.name, 'Produto Beta');

  const fs = require('fs');
  const path = require('path');
  const tempFile = path.resolve(__dirname, '..', 'test_audit_store.json');
  if (fs.existsSync(tempFile)) {
    try { fs.unlinkSync(tempFile); } catch (_) {}
  }
});

test('8. FORMATTER: Preços e strings são formatados limpos sem escapes quebrados no WhatsApp', () => {
  const { buildOfferCaption } = require('../formatter');

  const dummyProduct = {
    title: 'Monitor Gamer 144Hz *Full HD* [Promo]',
    emoji: '🖥️',
    history30dAvg: 1200,
    quotes: [{ store: 'KaBuM!', pix: 899.90 }]
  };

  const caption = buildOfferCaption(dummyProduct);
  assert.ok(caption.includes('899,90'), 'Deve formatar preço BRL corretamente');
  assert.ok(!caption.includes('\\*'), 'Não deve conter barras invertidas de escape no WhatsApp');
});
