const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'tiktokCatalog.json');

function loadTikTokCatalog() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) {
      fs.writeFileSync(CATALOG_PATH, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(CATALOG_PATH, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('[TikTokCatalog] Erro ao carregar catálogo:', err.message);
    return [];
  }
}

function saveTikTokCatalog(catalog) {
  try {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[TikTokCatalog] Erro ao salvar catálogo:', err.message);
    return false;
  }
}

function getAllTikTokProducts() {
  return loadTikTokCatalog();
}

function addTikTokProduct(item) {
  const catalog = loadTikTokCatalog();
  const id = item.id || `tt-${Date.now()}`;
  const newProduct = {
    id,
    title: item.title ? item.title.trim() : 'Produto TikTok Shop',
    price: item.price ? item.price.toString().trim() : '',
    oldPrice: item.oldPrice ? item.oldPrice.toString().trim() : '',
    coupon: item.coupon ? item.coupon.trim() : '',
    affiliateUrl: item.affiliateUrl ? item.affiliateUrl.trim() : '',
    imageUrl: item.imageUrl ? item.imageUrl.trim() : '',
    active: item.active !== false,
    createdAt: new Date().toISOString()
  };
  catalog.push(newProduct);
  saveTikTokCatalog(catalog);
  return newProduct;
}

function removeTikTokProduct(id) {
  let catalog = loadTikTokCatalog();
  const initialLen = catalog.length;
  catalog = catalog.filter((p) => p.id !== id);
  if (catalog.length !== initialLen) {
    saveTikTokCatalog(catalog);
    return true;
  }
  return false;
}

let currentIndex = 0;
function getNextTikTokProduct() {
  const catalog = loadTikTokCatalog().filter((p) => p.active !== false);
  if (catalog.length === 0) return null;
  if (currentIndex >= catalog.length) {
    currentIndex = 0;
  }
  const product = catalog[currentIndex];
  currentIndex = (currentIndex + 1) % catalog.length;
  return product;
}

module.exports = {
  loadTikTokCatalog,
  saveTikTokCatalog,
  getAllTikTokProducts,
  addTikTokProduct,
  removeTikTokProduct,
  getNextTikTokProduct
};
