import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
export const db = new DatabaseSync(dbPath);

export function initDB() {
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT,
      barcode TEXT,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'online',
      website TEXT,
      color TEXT DEFAULT '#3B82F6',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      url TEXT,
      in_stock INTEGER DEFAULT 1,
      quoted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_product ON price_quotes(product_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_store ON price_quotes(store_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_date ON price_quotes(quoted_at);
  `);

  seedInitialData();
}

function seedInitialData() {
  const storesCount = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
  const hasShopee = db.prepare("SELECT COUNT(*) as count FROM stores WHERE name = 'Shopee'").get().count;
  
  if (storesCount > 0 && hasShopee > 0) return;

  console.log('Populando banco com as 5 lojas de Eletrônicos...');
  
  // Limpar dados anteriores
  db.exec('DELETE FROM price_quotes; DELETE FROM products; DELETE FROM stores;');
  try {
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products', 'stores', 'price_quotes');");
  } catch (e) {
    // sqlite_sequence may not exist yet
  }

  // 1. Inserir as 5 Lojas
  const insertStore = db.prepare(`
    INSERT INTO stores (name, type, website, color) VALUES (?, ?, ?, ?)
  `);

  const storeMap = {};
  const stores = [
    ['Mercado Livre', 'online', 'https://www.mercadolivre.com.br', '#FFE600'],
    ['Shopee', 'online', 'https://shopee.com.br', '#EE4D2D'],
    ['KaBuM!', 'online', 'https://www.kabum.com.br', '#FF6500'],
    ['Amazon Brasil', 'online', 'https://www.amazon.com.br', '#FF9900'],
    ['AliExpress', 'online', 'https://pt.aliexpress.com', '#FF4747']
  ];

  for (const s of stores) {
    const res = insertStore.run(s[0], s[1], s[2], s[3]);
    storeMap[s[0]] = Number(res.lastInsertRowid);
  }

  // 2. Inserir Produtos Eletrônicos
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, brand, barcode, image_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const productMap = {};
  const products = [
    [
      'iphone',
      'Smartphone Apple iPhone 15 128GB',
      'Smartphones',
      'Apple',
      '195949038234',
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300'
    ],
    [
      'ps5',
      'Console PlayStation 5 Slim 1TB com Leitor',
      'Games & Consoles',
      'Sony',
      '711719572473',
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=300'
    ],
    [
      'rtx4060',
      'Placa de Vídeo GeForce RTX 4060 8GB GDDR6',
      'Hardware & PC',
      'NVIDIA / Asus',
      '4711387228890',
      'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=300'
    ],
    [
      'tv55',
      'Smart TV 55" 4K UHD Samsung Crystal',
      'TV & Vídeo',
      'Samsung',
      '7892509123456',
      'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=300'
    ],
    [
      'monitor',
      'Monitor Gamer LG UltraGear 27" 144Hz 1ms IPS',
      'Monitores',
      'LG',
      '7893299912837',
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300'
    ],
    [
      'ssd',
      'SSD NVMe M.2 1TB Kingston NV2 PCIe 4.0',
      'Armazenamento',
      'Kingston',
      '740617329919',
      'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=300'
    ],
    [
      'switch',
      'Console Nintendo Switch OLED 64GB',
      'Games & Consoles',
      'Nintendo',
      '045496883386',
      'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300'
    ],
    [
      'fone',
      'Fone Bluetooth Noise Cancelling Sony WH-1000XM5',
      'Áudio',
      'Sony',
      '027242924376',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300'
    ]
  ];

  for (const p of products) {
    const res = insertProduct.run(p[1], p[2], p[3], p[4], p[5]);
    productMap[p[0]] = Number(res.lastInsertRowid);
  }

  // 3. Inserir Cotações usando os IDs mapeados
  const insertQuote = db.prepare(`
    INSERT INTO price_quotes (product_id, store_id, price, url, in_stock, quoted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const quotesData = [
    // 1. iPhone 15:
    [productMap['iphone'], storeMap['KaBuM!'], 4699.90, 'https://www.kabum.com.br/busca/iphone-15', 1, '2026-08-31 12:00:00'],
    [productMap['iphone'], storeMap['Mercado Livre'], 4749.00, 'https://lista.mercadolivre.com.br/iphone-15', 1, '2026-08-31 11:30:00'],
    [productMap['iphone'], storeMap['Shopee'], 4799.00, 'https://shopee.com.br/search?keyword=iphone%2015', 1, '2026-08-31 10:00:00'],
    [productMap['iphone'], storeMap['Amazon Brasil'], 4899.00, 'https://www.amazon.com.br/s?k=iphone+15', 1, '2026-08-31 10:30:00'],
    [productMap['iphone'], storeMap['AliExpress'], 5120.00, 'https://pt.aliexpress.com/wholesale?SearchText=iphone+15', 1, '2026-08-31 09:00:00'],

    // 2. PS5 Slim:
    [productMap['ps5'], storeMap['Shopee'], 3499.00, 'https://shopee.com.br/search?keyword=ps5', 1, '2026-08-31 11:00:00'],
    [productMap['ps5'], storeMap['Amazon Brasil'], 3599.00, 'https://www.amazon.com.br/s?k=ps5', 1, '2026-08-31 10:00:00'],
    [productMap['ps5'], storeMap['Mercado Livre'], 3649.00, 'https://lista.mercadolivre.com.br/ps5', 1, '2026-08-31 09:30:00'],
    [productMap['ps5'], storeMap['KaBuM!'], 3699.90, 'https://www.kabum.com.br/busca/ps5', 1, '2026-08-31 12:00:00'],
    [productMap['ps5'], storeMap['AliExpress'], 3890.00, 'https://pt.aliexpress.com/wholesale?SearchText=ps5', 1, '2026-08-31 08:30:00'],

    // 3. RTX 4060:
    [productMap['rtx4060'], storeMap['KaBuM!'], 1899.90, 'https://www.kabum.com.br/busca/rtx-4060', 1, '2026-08-31 12:30:00'],
    [productMap['rtx4060'], storeMap['AliExpress'], 1949.00, 'https://pt.aliexpress.com/wholesale?SearchText=rtx+4060', 1, '2026-08-31 10:00:00'],
    [productMap['rtx4060'], storeMap['Mercado Livre'], 1999.00, 'https://lista.mercadolivre.com.br/rtx-4060', 1, '2026-08-31 11:00:00'],
    [productMap['rtx4060'], storeMap['Amazon Brasil'], 2049.00, 'https://www.amazon.com.br/s?k=rtx+4060', 1, '2026-08-31 09:00:00'],
    [productMap['rtx4060'], storeMap['Shopee'], 2099.00, 'https://shopee.com.br/search?keyword=rtx%204060', 1, '2026-08-31 08:00:00'],

    // 4. Smart TV 55 Samsung:
    [productMap['tv55'], storeMap['Amazon Brasil'], 2499.00, 'https://www.amazon.com.br/s?k=smart+tv+55+samsung', 1, '2026-08-31 10:15:00'],
    [productMap['tv55'], storeMap['Mercado Livre'], 2549.00, 'https://lista.mercadolivre.com.br/smart-tv-55-samsung', 1, '2026-08-31 08:30:00'],
    [productMap['tv55'], storeMap['Shopee'], 2599.00, 'https://shopee.com.br/search?keyword=smart%20tv%2055%20samsung', 1, '2026-08-31 09:00:00'],
    [productMap['tv55'], storeMap['KaBuM!'], 2699.90, 'https://www.kabum.com.br/busca/smart-tv-55-samsung', 1, '2026-08-31 11:00:00'],
    [productMap['tv55'], storeMap['AliExpress'], 2890.00, 'https://pt.aliexpress.com/wholesale?SearchText=smart+tv+55+samsung', 1, '2026-08-31 08:00:00'],

    // 5. Monitor LG 27:
    [productMap['monitor'], storeMap['KaBuM!'], 1099.90, 'https://www.kabum.com.br/busca/ultragear-27', 1, '2026-08-31 12:30:00'],
    [productMap['monitor'], storeMap['Mercado Livre'], 1189.00, 'https://lista.mercadolivre.com.br/ultragear-27', 1, '2026-08-31 11:00:00'],
    [productMap['monitor'], storeMap['Shopee'], 1199.00, 'https://shopee.com.br/search?keyword=ultragear%2027', 1, '2026-08-31 10:00:00'],
    [productMap['monitor'], storeMap['Amazon Brasil'], 1249.00, 'https://www.amazon.com.br/s?k=ultragear+27', 1, '2026-08-31 09:00:00'],
    [productMap['monitor'], storeMap['AliExpress'], 1290.00, 'https://pt.aliexpress.com/wholesale?SearchText=ultragear+27', 1, '2026-08-31 08:00:00'],

    // 6. SSD NVMe 1TB:
    [productMap['ssd'], storeMap['AliExpress'], 289.00, 'https://pt.aliexpress.com/wholesale?SearchText=ssd+nvme+1tb', 1, '2026-08-31 10:00:00'],
    [productMap['ssd'], storeMap['Shopee'], 319.00, 'https://shopee.com.br/search?keyword=ssd%20nvme%201tb', 1, '2026-08-31 09:00:00'],
    [productMap['ssd'], storeMap['KaBuM!'], 349.90, 'https://www.kabum.com.br/busca/ssd-nvme-1tb', 1, '2026-08-31 11:30:00'],
    [productMap['ssd'], storeMap['Mercado Livre'], 359.00, 'https://lista.mercadolivre.com.br/ssd-nvme-1tb', 1, '2026-08-31 10:15:00'],
    [productMap['ssd'], storeMap['Amazon Brasil'], 379.00, 'https://www.amazon.com.br/s?k=ssd+nvme+1tb', 1, '2026-08-31 08:45:00'],

    // 7. Nintendo Switch OLED:
    [productMap['switch'], storeMap['Shopee'], 1999.00, 'https://shopee.com.br/search?keyword=nintendo%20switch%20oled', 1, '2026-08-31 09:00:00'],
    [productMap['switch'], storeMap['Mercado Livre'], 2089.00, 'https://lista.mercadolivre.com.br/nintendo-switch-oled', 1, '2026-08-31 10:00:00'],
    [productMap['switch'], storeMap['Amazon Brasil'], 2149.00, 'https://www.amazon.com.br/s?k=nintendo+switch+oled', 1, '2026-08-31 11:00:00'],
    [productMap['switch'], storeMap['KaBuM!'], 2199.90, 'https://www.kabum.com.br/busca/nintendo-switch-oled', 1, '2026-08-31 12:00:00'],
    [productMap['switch'], storeMap['AliExpress'], 2280.00, 'https://pt.aliexpress.com/wholesale?SearchText=nintendo+switch+oled', 1, '2026-08-31 08:00:00'],

    // 8. Sony WH-1000XM5:
    [productMap['fone'], storeMap['Amazon Brasil'], 2199.00, 'https://www.amazon.com.br/s?k=sony+wh1000xm5', 1, '2026-08-31 10:00:00'],
    [productMap['fone'], storeMap['Mercado Livre'], 2249.00, 'https://lista.mercadolivre.com.br/sony-wh1000xm5', 1, '2026-08-31 11:00:00'],
    [productMap['fone'], storeMap['KaBuM!'], 2299.90, 'https://www.kabum.com.br/busca/sony-wh1000xm5', 1, '2026-08-31 12:00:00'],
    [productMap['fone'], storeMap['Shopee'], 2349.00, 'https://shopee.com.br/search?keyword=sony%20wh1000xm5', 1, '2026-08-31 09:00:00'],
    [productMap['fone'], storeMap['AliExpress'], 2390.00, 'https://pt.aliexpress.com/wholesale?SearchText=sony+wh1000xm5', 1, '2026-08-31 08:30:00']
  ];

  for (const q of quotesData) {
    insertQuote.run(q[0], q[1], q[2], q[3], q[4], q[5]);
  }

  console.log('Banco de dados de Eletrônicos inicializado com as 5 lojas com sucesso!');
}
