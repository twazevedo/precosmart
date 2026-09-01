import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import DashboardStats from './components/DashboardStats';
import PriceComparison from './components/PriceComparison';
import BasketCalculator from './components/BasketCalculator';
import StoreManager from './components/StoreManager';
import QuoteModal from './components/QuoteModal';
import ProductModal from './components/ProductModal';
import HistoryModal from './components/HistoryModal';
import { RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('compare');
  const [comparisonData, setComparisonData] = useState({ products: [], stores: [] });
  const [stores, setStores] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cesta de compras persistida no localStorage
  const [basket, setBasket] = useState(() => {
    try {
      const saved = localStorage.getItem('precosmart_basket');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Salvar cesta sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem('precosmart_basket', JSON.stringify(basket));
    } catch (e) {
      console.error(e);
    }
  }, [basket]);

  // Modais
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState(null);
  const [selectedProductIdForQuote, setSelectedProductIdForQuote] = useState(null);

  // Feedback toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [compRes, storesRes, statsRes] = await Promise.all([
        fetch('/api/comparison'),
        fetch('/api/stores'),
        fetch('/api/stats')
      ]);

      if (!compRes.ok || !storesRes.ok) {
        throw new Error('Falha ao conectar com o servidor da API');
      }

      const compData = await compRes.json();
      const storesData = await storesRes.json();
      const statsData = statsRes.ok ? await statsRes.json() : null;

      setComparisonData(compData);
      setStores(storesData);
      setStats(statsData);
    } catch (err) {
      console.error(err);
      setError('Não foi possível carregar os dados. Verifique se o backend está ativo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ações de Cesta
  const handleAddToBasket = (product) => {
    setBasket((prev) => {
      const exists = prev.find((item) => item.product.id === product.id);
      if (exists) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    showToast(`"${product.name}" adicionado à Cesta!`);
  };

  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveFromBasket(productId);
      return;
    }
    setBasket((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const handleRemoveFromBasket = (productId) => {
    setBasket((prev) => prev.filter((item) => item.product.id !== productId));
    showToast('Item removido da cesta');
  };

  const handleClearBasket = () => {
    setBasket([]);
    showToast('Cesta limpa com sucesso');
  };

  // Handlers para Cotações e Produtos
  const handleOpenQuoteModalForProduct = (product) => {
    setSelectedProductIdForQuote(product.id);
    setQuoteModalOpen(true);
  };

  const handleOpenHistory = (product) => {
    setSelectedProductForHistory(product);
    setHistoryModalOpen(true);
  };

  const handleDeleteProduct = async (id, name) => {
    if (!confirm(`Deseja realmente remover o produto "${name}" e todo seu histórico?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Produto excluído com sucesso');
        loadData();
      }
    } catch (err) {
      alert('Erro ao excluir produto: ' + err.message);
    }
  };

  const rawProductsList = comparisonData?.products?.map((p) => p.product) || [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className="bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Navbar Superior */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenProductModal={() => setProductModalOpen(true)}
        onOpenQuoteModal={() => {
          setSelectedProductIdForQuote(null);
          setQuoteModalOpen(true);
        }}
        basketCount={basket.reduce((acc, curr) => acc + curr.quantity, 0)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {loading && !comparisonData.products.length ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800">Carregando sistema de preços...</h3>
            <p className="text-xs text-slate-400 mt-1">Conectando ao banco de dados SQLite e API</p>
          </div>
        ) : (
          <>
            {/* Cards de Métricas do Dashboard */}
            <DashboardStats comparisonData={comparisonData} stats={stats} />

            {/* Abas de Navegação */}
            {activeTab === 'compare' && (
              <PriceComparison
                comparisonData={comparisonData}
                onAddToBasket={handleAddToBasket}
                onOpenHistory={handleOpenHistory}
                onOpenQuoteModalForProduct={handleOpenQuoteModalForProduct}
                onDeleteProduct={handleDeleteProduct}
              />
            )}

            {activeTab === 'basket' && (
              <BasketCalculator
                basket={basket}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveFromBasket={handleRemoveFromBasket}
                onClearBasket={handleClearBasket}
                allProducts={rawProductsList}
                onAddToBasket={handleAddToBasket}
              />
            )}

            {activeTab === 'stores' && (
              <StoreManager
                stores={stores}
                onStoreAdded={() => {
                  showToast('Nova loja cadastrada!');
                  loadData();
                }}
                onStoreDeleted={() => {
                  showToast('Loja removida!');
                  loadData();
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Modais */}
      <QuoteModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        products={rawProductsList}
        stores={stores}
        initialProductId={selectedProductIdForQuote}
        onQuoteAdded={() => {
          showToast('Cotação cadastrada com sucesso!');
          loadData();
        }}
      />

      <ProductModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        onProductCreated={() => {
          showToast('Produto cadastrado com sucesso!');
          loadData();
        }}
      />

      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        product={selectedProductForHistory}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <p>PreçoSmart • Sistema de Comparação de Preços e Otimização de Compras</p>
        <p className="mt-1 text-slate-400">Node.js + SQLite Nativo • React + Vite + TailwindCSS</p>
      </footer>
    </div>
  );
}
