/**
 * @file mirror.test.js — Testes Automatizados da Suíte PreçoSmart
 * Executável nativamente via `node --test` (sem necessidade de frameworks externos).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { processMessageText, extractProductKeyword, extractCanonicalId } = require('../mirror');
const { addAlert, checkMatchingAlerts, removeAlert, extractPriceFromText } = require('../alerts');

test('1. Filtro Anti-Conversa: Mensagens sem links de e-commerce devem ser rejeitadas', async () => {
  const msgPessoal = 'Pessoal as 15:00 da pra todos estar no ensaio ?';
  const resultado = await processMessageText(msgPessoal);
  assert.equal(resultado, null, 'Mensagens normais de conversa devem retornar null');
});

test('2. Filtro Anti-Notícia: Links genéricos não-comerciais devem ser rejeitados', async () => {
  const msgNoticia = 'Olha o que aconteceu hoje: https://g1.globo.com/ultimas-noticias';
  const resultado = await processMessageText(msgNoticia);
  assert.equal(resultado, null, 'Links fora de e-commerce devem retornar null');
});

test('3. Injeção de Afiliado Amazon: Deve formatar e adicionar tag oficial', async () => {
  const msgAmazon = 'Super Oferta! Fone de Ouvido Bluetooth:\nhttps://www.amazon.com.br/dp/B08N5WRWNW';
  const resultado = await processMessageText(msgAmazon);
  assert.ok(resultado, 'Oferta da Amazon deve ser aceita e processada');
  assert.ok(resultado.includes('tag='), 'URL deve conter a tag de afiliado');
  assert.ok(resultado.includes('PreçoSmart') || resultado.includes('Magazine Luiza'), 'Deve conter rodapé oficial');
});

test('4. Extração de Identificadores Canônicos (ASIN, MLB, SKU)', () => {
  const asin = extractCanonicalId('https://www.amazon.com.br/dp/B08N5WRWNW');
  assert.equal(asin, 'amz_B08N5WRWNW');

  const mlb = extractCanonicalId('https://produto.mercadolivre.com.br/MLB-123456789-produto');
  assert.equal(mlb, 'ml_MLB123456789');

  const shp = extractCanonicalId('https://shopee.com.br/product/12345/67890');
  assert.equal(shp, 'shp_67890');
});

test('5. Extração de Palavras-Chave de Produto', () => {
  const texto = '🔥 FONE DE OUVIDO JBL TUNE 510BT\nPor apenas R$ 199,00\nCompre aqui: https://amzn.to/teste';
  const kw = extractProductKeyword(texto);
  assert.ok(kw.length > 3, 'Deve extrair nome significativo do produto');
  assert.ok(kw.toLowerCase().includes('jbl') || kw.toLowerCase().includes('fone'), 'Palavra-chave deve conter o nome');
});

test('6. Sistema de Alertas Personalizados', () => {
  const userJid = '5511999999999@s.whatsapp.net';
  
  // Limpa anteriores
  removeAlert(userJid, 'todos');

  // Adiciona alerta para "ps5" com teto de R$ 3800
  addAlert(userJid, '5511999999999', 'ps5', 3800);

  // Oferta cara (R$ 4200) -> Não deve disparar
  const matchCaro = checkMatchingAlerts('Console Sony PS5 Slim por apenas R$ 4.200,00! https://amzn.to/ps5');
  assert.equal(matchCaro.length, 0, 'Oferta acima do preço desejado não deve dar match');

  // Oferta no preço (R$ 3599) -> Deve disparar!
  const matchBom = checkMatchingAlerts('SUPER PROMO! Console Sony PS5 Slim por R$ 3.599,00 https://amzn.to/ps5');
  assert.equal(matchBom.length, 1, 'Oferta abaixo do preço deve acionar o alerta');
  assert.equal(matchBom[0].phone, '5511999999999');

  // Limpeza
  removeAlert(userJid, 'todos');
});

test('7. Extração Numérica de Preço', () => {
  assert.equal(extractPriceFromText('R$ 3.499,00'), 3499.00);
  assert.equal(extractPriceFromText('Apenas 199,90 no Pix'), 199.90);
  assert.equal(extractPriceFromText('Por R$ 49,00 com cupom'), 49.00);
  assert.equal(extractPriceFromText('Sem preço aqui'), null);
});
