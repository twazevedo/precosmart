/**
 * @file syncBackend.js — Sincronizador do Bot com o Comparador Web PreçoSmart
 * Envia automaticamente produtos e ofertas descobertas no WhatsApp/Crawler
 * para o banco SQLite do Backend (alimentando a plataforma web em tempo real).
 */
'use strict';

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001/api';

/**
 * Envia uma cotação capturada para a API do comparador
 * @param {object} item - { title, price, store, url }
 */
async function syncDealWithBackend(item) {
  if (!item || !item.title || !item.price) return false;

  try {
    // 1. Tenta buscar ou registrar o produto
    const productsRes = await axios.get(`${BACKEND_URL}/products?search=${encodeURIComponent(item.title.substring(0, 20))}`, { timeout: 3000 });
    let product = productsRes.data && productsRes.data[0];

    const authHeaders = process.env.API_SECRET_KEY ? { 'x-api-key': process.env.API_SECRET_KEY } : {};

    if (!product) {
      const createRes = await axios.post(`${BACKEND_URL}/products`, {
        name: item.title,
        category: 'Ofertas WhatsApp',
        brand: item.store || 'Geral',
        image_url: item.imageUrl || ''
      }, { timeout: 3000, headers: authHeaders });
      product = createRes.data;
    }

    if (!product || !product.id) return false;

    // 2. Registra ou mapeia a loja
    const storesRes = await axios.get(`${BACKEND_URL}/stores`, { timeout: 3000 });
    let store = storesRes.data && storesRes.data.find(s => s.name.toLowerCase() === (item.store || '').toLowerCase());

    if (!store) {
      const createStoreRes = await axios.post(`${BACKEND_URL}/stores`, {
        name: item.store || 'Internet',
        type: 'online',
        color: '#10B981'
      }, { timeout: 3000, headers: authHeaders });
      store = createStoreRes.data;
    }

    if (!store || !store.id) return false;

    // 3. Registra a cotação
    await axios.post(`${BACKEND_URL}/quotes`, {
      product_id: product.id,
      store_id: store.id,
      price: Number(item.price),
      url: item.url || '',
      in_stock: 1
    }, { timeout: 3000, headers: authHeaders });

    return true;
  } catch (err) {
    // Falha silenciosa para não interromper fluxo do WhatsApp se backend estiver offline
    return false;
  }
}

module.exports = {
  syncDealWithBackend
};
