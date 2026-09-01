import assert from 'node:assert';

const BASE_URL = 'http://localhost:3001';

async function runTests() {
  console.log('--- Iniciando Testes da API do Comparador de Preços ---');

  // 1. Teste de listagem de produtos
  const productsRes = await fetch(`${BASE_URL}/api/products`);
  assert.strictEqual(productsRes.status, 200, 'Status deve ser 200');
  const products = await productsRes.json();
  console.log(`✓ GET /api/products: ${products.length} produtos encontrados`);
  assert.ok(products.length >= 8, 'Deve ter os produtos padrão iniciais');

  // 2. Teste de listagem de lojas
  const storesRes = await fetch(`${BASE_URL}/api/stores`);
  assert.strictEqual(storesRes.status, 200, 'Status deve ser 200');
  const stores = await storesRes.json();
  console.log(`✓ GET /api/stores: ${stores.length} lojas encontradas`);
  assert.strictEqual(stores.length, 5, 'Deve ter exatamente as 5 lojas solicitadas');

  // 3. Teste de comparação de preços
  const compRes = await fetch(`${BASE_URL}/api/comparison`);
  assert.strictEqual(compRes.status, 200, 'Status deve ser 200');
  const compData = await compRes.json();
  console.log(`✓ GET /api/comparison: ${compData.products.length} produtos analisados`);
  const firstWithQuotes = compData.products.find(p => p.hasQuotes);
  assert.ok(firstWithQuotes, 'Deve existir produtos com cotações');
  assert.ok(firstWithQuotes.lowestPrice > 0, 'Menor preço deve ser maior que zero');
  assert.ok(firstWithQuotes.cheapestStore, 'Deve identificar a loja mais barata');
  console.log(`  -> Exemplo: ${firstWithQuotes.product.name} mais barato na ${firstWithQuotes.cheapestStore.name} por R$ ${firstWithQuotes.lowestPrice}`);

  // 4. Teste de otimização de cesta de compras
  const basketRes = await fetch(`${BASE_URL}/api/basket/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { productId: 1, quantity: 1 }, // iPhone 15
        { productId: 2, quantity: 1 }, // PS5 Slim
        { productId: 3, quantity: 1 }  // RTX 4060
      ]
    })
  });
  assert.strictEqual(basketRes.status, 200, 'Status deve ser 200');
  const basketData = await basketRes.json();
  console.log('✓ POST /api/basket/optimize: Cesta otimizada com sucesso');
  console.log(`  -> Menor preço dividido: R$ ${basketData.optimalSplit.total}`);
  if (basketData.bestSingleStore) {
    console.log(`  -> Melhor loja única: ${basketData.bestSingleStore.store.name} (R$ ${basketData.bestSingleStore.total})`);
    console.log(`  -> Economia ao dividir compras: R$ ${basketData.splitSavings}`);
  }

  // 5. Teste de estatísticas
  const statsRes = await fetch(`${BASE_URL}/api/stats`);
  assert.strictEqual(statsRes.status, 200, 'Status deve ser 200');
  const statsData = await statsRes.json();
  console.log(`✓ GET /api/stats: ${statsData.totalProducts} produtos, ${statsData.totalStores} lojas, ${statsData.totalQuotes} cotações`);

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

// Iniciar servidor em segundo plano para teste
import('./src/server.js').then(() => {
  setTimeout(() => {
    runTests()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Falha nos testes:', err);
        process.exit(1);
      });
  }, 1000);
});
