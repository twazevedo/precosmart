import express from 'express';
import cors from 'cors';
import { db, initDB } from './db.js';

initDB();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==========================================
// PRODUTOS
// ==========================================
app.get('/api/products', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (name LIKE ? OR brand LIKE ? OR barcode LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY id DESC';
    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { name, category, brand, barcode, image_url } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Nome e Categoria são obrigatórios' });
    }

    const stmt = db.prepare(`
      INSERT INTO products (name, category, brand, barcode, image_url)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, category, brand || '', barcode || '', image_url || '');
    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true, message: 'Produto removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// LOJAS
// ==========================================
app.get('/api/stores', (req, res) => {
  try {
    const stores = db.prepare('SELECT * FROM stores ORDER BY name ASC').all();
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stores', (req, res) => {
  try {
    const { name, type, website, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome da loja é obrigatório' });
    }

    const stmt = db.prepare(`
      INSERT INTO stores (name, type, website, color)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, type || 'online', website || '', color || '#3B82F6');
    const newStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newStore);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/stores/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);
    res.json({ success: true, message: 'Loja removida com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// COTAÇÕES / PREÇOS
// ==========================================
app.get('/api/quotes', (req, res) => {
  try {
    const { productId, limit = 50 } = req.query;
    let query = `
      SELECT q.*, p.name as product_name, s.name as store_name, s.color as store_color, s.type as store_type
      FROM price_quotes q
      JOIN products p ON q.product_id = p.id
      JOIN stores s ON q.store_id = s.id
    `;
    const params = [];
    if (productId) {
      query += ' WHERE q.product_id = ?';
      params.push(productId);
    }
    query += ' ORDER BY q.quoted_at DESC, q.id DESC LIMIT ?';
    params.push(Number(limit));

    const quotes = db.prepare(query).all(...params);
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quotes', (req, res) => {
  try {
    const { product_id, store_id, price, url, in_stock } = req.body;
    if (!product_id || !store_id || price === undefined) {
      return res.status(400).json({ error: 'Produto, Loja e Preço são obrigatórios' });
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    const stmt = db.prepare(`
      INSERT INTO price_quotes (product_id, store_id, price, url, in_stock, quoted_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    const result = stmt.run(product_id, store_id, numPrice, url || '', in_stock !== undefined ? (in_stock ? 1 : 0) : 1);
    
    const newQuote = db.prepare(`
      SELECT q.*, p.name as product_name, s.name as store_name, s.color as store_color
      FROM price_quotes q
      JOIN products p ON q.product_id = p.id
      JOIN stores s ON q.store_id = s.id
      WHERE q.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newQuote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// COMPARAÇÃO GERAL DE PREÇOS
// ==========================================
app.get('/api/comparison', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
    const stores = db.prepare('SELECT * FROM stores ORDER BY name ASC').all();

    // Buscar a cotação mais recente de cada produto para cada loja
    const latestQuotes = db.prepare(`
      SELECT q.*, s.name as store_name, s.color as store_color, s.type as store_type
      FROM price_quotes q
      JOIN stores s ON q.store_id = s.id
      WHERE q.id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id, store_id ORDER BY quoted_at DESC, id DESC) as rn
          FROM price_quotes
        ) WHERE rn = 1
      )
    `).all();

    const comparisonList = products.map((product) => {
      const quotesForProduct = latestQuotes.filter((q) => q.product_id === product.id && q.in_stock === 1);
      
      if (quotesForProduct.length === 0) {
        return {
          product,
          hasQuotes: false,
          quotes: [],
          lowestPrice: null,
          highestPrice: null,
          averagePrice: null,
          cheapestStore: null,
          potentialSavings: 0,
          savingsPercentage: 0
        };
      }

      quotesForProduct.sort((a, b) => a.price - b.price);
      const lowest = quotesForProduct[0];
      const highest = quotesForProduct[quotesForProduct.length - 1];
      const sum = quotesForProduct.reduce((acc, curr) => acc + curr.price, 0);
      const avg = sum / quotesForProduct.length;
      const savings = highest.price - lowest.price;
      const savingsPct = highest.price > 0 ? (savings / highest.price) * 100 : 0;

      return {
        product,
        hasQuotes: true,
        quotes: quotesForProduct,
        lowestPrice: lowest.price,
        highestPrice: highest.price,
        averagePrice: Number(avg.toFixed(2)),
        cheapestStore: {
          id: lowest.store_id,
          name: lowest.store_name,
          color: lowest.store_color,
          type: lowest.store_type,
          url: lowest.url,
          quoted_at: lowest.quoted_at
        },
        potentialSavings: Number(savings.toFixed(2)),
        savingsPercentage: Number(savingsPct.toFixed(1))
      };
    });

    res.json({ products: comparisonList, stores });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// HISTÓRICO DE PREÇOS POR PRODUTO
// ==========================================
app.get('/api/products/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const history = db.prepare(`
      SELECT q.id, q.price, q.quoted_at, s.name as store_name, s.color as store_color
      FROM price_quotes q
      JOIN stores s ON q.store_id = s.id
      WHERE q.product_id = ?
      ORDER BY q.quoted_at ASC
    `).all(id);

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// OTIMIZADOR DE CESTA DE COMPRAS
// ==========================================
app.post('/api/basket/optimize', (req, res) => {
  try {
    const { items } = req.body; // Array de { productId, quantity }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum item informado para a cesta' });
    }

    const stores = db.prepare('SELECT * FROM stores').all();
    const storeTotals = {};
    const storeItemCoverage = {};

    stores.forEach((s) => {
      storeTotals[s.id] = { store: s, total: 0, availableItems: 0, missingItems: [] };
    });

    const optimalSplit = {
      items: [],
      total: 0
    };

    let totalBestPossible = 0;

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
      if (!product) continue;

      const qty = Math.max(1, parseInt(item.quantity || 1, 10));

      // Pegar a cotação mais recente em estoque para cada loja
      const quotes = db.prepare(`
        SELECT q.*, s.name as store_name, s.color as store_color
        FROM price_quotes q
        JOIN stores s ON q.store_id = s.id
        WHERE q.product_id = ? AND q.in_stock = 1
        ORDER BY q.quoted_at DESC
      `).all(item.productId);

      // Agrupar por store pegando apenas a mais recente
      const storeLatestQuote = new Map();
      quotes.forEach((q) => {
        if (!storeLatestQuote.has(q.store_id)) {
          storeLatestQuote.set(q.store_id, q);
        }
      });

      let cheapestQuote = null;

      // Calcular para cada loja
      stores.forEach((s) => {
        const quote = storeLatestQuote.get(s.id);
        if (quote) {
          storeTotals[s.id].total += quote.price * qty;
          storeTotals[s.id].availableItems += 1;
        } else {
          storeTotals[s.id].missingItems.push(product.name);
        }
      });

      // Menor preço absoluto para a divisão ótima
      const availableQuotes = Array.from(storeLatestQuote.values()).sort((a, b) => a.price - b.price);
      if (availableQuotes.length > 0) {
        cheapestQuote = availableQuotes[0];
        const itemTotal = cheapestQuote.price * qty;
        totalBestPossible += itemTotal;

        optimalSplit.items.push({
          product,
          quantity: qty,
          unitPrice: cheapestQuote.price,
          totalPrice: Number(itemTotal.toFixed(2)),
          store: {
            id: cheapestQuote.store_id,
            name: cheapestQuote.store_name,
            color: cheapestQuote.store_color
          }
        });
      }
    }

    optimalSplit.total = Number(totalBestPossible.toFixed(2));

    // Filtrar e ordenar lojas que possuem todos ou mais itens
    const storeRanking = Object.values(storeTotals)
      .map((st) => ({
        ...st,
        total: Number(st.total.toFixed(2)),
        isComplete: st.missingItems.length === 0
      }))
      .sort((a, b) => {
        if (a.isComplete && !b.isComplete) return -1;
        if (!a.isComplete && b.isComplete) return 1;
        return a.total - b.total;
      });

    const bestSingleStore = storeRanking.find((s) => s.isComplete) || storeRanking[0] || null;
    const splitSavings = bestSingleStore && bestSingleStore.total > 0
      ? Number((bestSingleStore.total - optimalSplit.total).toFixed(2))
      : 0;

    res.json({
      optimalSplit,
      bestSingleStore,
      storeRanking,
      splitSavings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ESTATÍSTICAS GERAIS
// ==========================================
app.get('/api/stats', (req, res) => {
  try {
    const productsCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const storesCount = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
    const quotesCount = db.prepare('SELECT COUNT(*) as count FROM price_quotes').get().count;

    const categories = db.prepare('SELECT DISTINCT category FROM products').all().map((c) => c.category);

    res.json({
      totalProducts: productsCount,
      totalStores: storesCount,
      totalQuotes: quotesCount,
      categories
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SERVIR FRONTEND REACT ESTÁTICO (SPA)
// ==========================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __serverFilename = fileURLToPath(import.meta.url);
const __serverDirname = path.dirname(__serverFilename);
const frontendDist = path.join(__serverDirname, '..', '..', 'frontend', 'dist');

app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PreçoSmart Online rodando na porta ${PORT}`);
});

