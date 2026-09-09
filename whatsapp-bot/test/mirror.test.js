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

test('8. Algoritmo do Termômetro de Ofertas (Deal Score)', () => {
  const { evaluateDeal } = require('../dealScore');
  const deal = evaluateDeal('Notebook Dell Inspiron', 2499, 3999);
  assert.ok(deal.score >= 9.0, 'Desconto alto deve render score superior a 9.0');
  assert.ok(deal.badge.includes('Termômetro PreçoSmart'), 'Deve gerar badge visual com termômetro');
  assert.equal(deal.discountPct, 38, 'Desconto deve ser 38%');
});

test('9. Encurtador de Links & Rastreamento de Cliques', () => {
  const { createShortLink, recordClick, getAnalyticsSummary } = require('../analytics');
  const link = createShortLink('https://www.amazon.com.br/dp/B0TESTE', 'Monitor Gamer', 'Amazon', 899);
  assert.ok(link.code, 'Deve gerar código curto único');
  assert.equal(link.shortPath, `/r/${link.code}`, 'Caminho deve ser /r/:code');

  const target = recordClick(link.code);
  assert.equal(target, 'https://www.amazon.com.br/dp/B0TESTE', 'Deve retornar URL de destino no clique');

  const summary = getAnalyticsSummary();
  assert.ok(summary.totalClicks >= 1, 'Contador de cliques global deve ser incrementado');
});

test('10. Expansão Multicanal Telegram (Modo Seguro / Fallback)', async () => {
  const { isTelegramConfigured, broadcastTelegramDeal } = require('../telegram');
  // Sem variáveis de ambiente no ambiente de teste, deve retornar simulated sem quebrar
  const res = await broadcastTelegramDeal({
    title: 'Echo Pop',
    price: 'R$ 219,00',
    url: 'https://amzn.to/echo'
  });
  assert.equal(res.ok, true, 'Deve responder ok em modo simulado');
});

test('11. Parser de Feeds RSS do Crawler Autônomo', () => {
  const { parseRssFeed } = require('../crawler');
  const mockXml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[Super Oferta: Placa de Vídeo RTX 4060 com menor preço]]></title>
          <link>https://www.adrenaline.com.br/oferta-rtx</link>
          <description><![CDATA[Placa de vídeo por apenas R$ 1.899 no Pix]]></description>
        </item>
        <item>
          <title><![CDATA[Notícia sobre nova atualização do Windows]]></title>
          <link>https://www.adrenaline.com.br/windows-update</link>
          <description><![CDATA[Atualização traz correções de segurança]]></description>
        </item>
      </channel>
    </rss>
  `;
  const items = parseRssFeed(mockXml);
  assert.equal(items.length, 1, 'Deve filtrar apenas itens que são ofertas reais');
  assert.ok(items[0].title.includes('RTX 4060'));
});

test('12. Injeção de Afiliado Grupo Boticário: Deve converter links para a loja oficial do consultor', async () => {
  const msgBoticario = 'Promoção Perfume Malbec!\nhttps://www.boticario.com.br/malbec-desodorante-colonia-100ml';
  const resBoticario = await processMessageText(msgBoticario);
  assert.ok(resBoticario, 'Oferta do Boticário deve ser aceita');
  assert.ok(resBoticario.includes('minhaloja.boticario.com.br/redirect/27065696'), 'Deve conter o redirect com ID do consultor');
  assert.ok(resBoticario.includes('Consultor Autorizado Grupo Boticário'), 'Deve incluir rodapé do Grupo Boticário');

  const msgEudora = 'Kit Siage Eudora em Promoção:\nhttps://minhaloja.eudora.com.br/redirect/99999999/?origin=boticario';
  const resEudora = await processMessageText(msgEudora);
  assert.ok(resEudora, 'Oferta da Eudora deve ser aceita');
  assert.ok(resEudora.includes('minhaloja.eudora.com.br/redirect/27065696'), 'Deve substituir ID de outro revendedor pelo seu ID oficial');
});

