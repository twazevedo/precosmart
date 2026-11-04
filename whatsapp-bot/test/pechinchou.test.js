/**
 * @file pechinchou.test.js
 * Teste unitário para o extrator Pechinchou.com.br
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { fetchPechinchouDeals } = require('../pechinchouCrawler');
const { AFFILIATE } = require('../catalog');

test('Radar Pechinchou: Deve espionar, extrair ofertas e converter links com tags PreçoSmart', async () => {
  const deals = await fetchPechinchouDeals(3);
  
  assert.ok(Array.isArray(deals), 'Deals deve ser um array');
  assert.ok(deals.length > 0, 'Deve retornar ao menos 1 oferta ativa');

  const sample = deals[0];
  assert.ok(sample.title, 'Oferta deve possuir título');
  assert.ok(sample.store, 'Oferta deve possuir loja identificada');
  assert.ok(sample.affiliateUrl, 'Oferta deve possuir URL convertida');
  assert.ok(sample.formattedText, 'Oferta deve gerar copy formatada para WhatsApp');
  assert.ok(sample.formattedText.includes(sample.title), 'Copy deve conter o título do produto');

  // Se for Amazon, deve conter a tag precosmartapp-20
  const amazonDeal = deals.find(d => d.affiliateUrl.includes('amazon.com.br'));
  if (amazonDeal) {
    assert.ok(
      amazonDeal.affiliateUrl.includes(AFFILIATE.amazon),
      `URL Amazon deve conter a tag oficial ${AFFILIATE.amazon}`
    );
    assert.strictEqual(
      amazonDeal.affiliateUrl.includes('parceiropechi-20'),
      false,
      'Tag do concorrente parceiropechi-20 deve ter sido completamente removida'
    );
  }
});
