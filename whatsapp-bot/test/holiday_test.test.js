const test = require('node:test');
const assert = require('node:assert/strict');
const { getNextHolidayGiftDeal } = require('../shopeeCatalog');

test('Especial de Natal & Amigo Secreto: Catálogo & Filtros de Presente', async (t) => {
  await t.test('1. Deve retornar ofertas com preço menor ou igual a R$ 50,00', async () => {
    const deals = [];
    for (let i = 0; i < 6; i++) {
      const deal = await getNextHolidayGiftDeal();
      assert.ok(deal, 'Deal deve existir');
      assert.ok(deal.title, 'Deal deve ter título');
      assert.ok(typeof deal.price === 'string' && deal.price.includes('R$'), 'Preço formatado deve conter R$');
      
      const numPrice = parseFloat(deal.price.replace(/[^\d,]/g, '').replace(',', '.'));
      assert.ok(numPrice <= 50.00, `Preço deve ser <= 50.00, recebido: ${numPrice}`);
      assert.ok(numPrice >= 14.90, `Preço deve ser >= 14.90, recebido: ${numPrice}`);

      assert.ok(deal.url, 'Deal deve ter URL');
      assert.ok(deal.text.includes('ESPECIAL DE NATAL'), 'Texto deve conter cabeçalho especial de natal');
      assert.ok(deal.text.includes('R$'), 'Texto deve conter formatação em Reais');
      assert.ok(!deal.text.includes('&#'), 'Texto não deve conter entidades HTML brutas');
      deals.push(deal);
    }

    // Verifica que não repetiu itens nos 6 disparos do teste
    const uniqueTitles = new Set(deals.map(d => d.title));
    assert.equal(uniqueTitles.size, 6, 'Os 6 disparos do teste devem ser produtos distintos');
  });
});
