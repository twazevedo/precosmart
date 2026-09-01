import React, { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, CheckCircle, AlertTriangle, Sparkles, Store, ArrowRight, RefreshCw } from 'lucide-react';

export default function BasketCalculator({
  basket,
  onUpdateQuantity,
  onRemoveFromBasket,
  onClearBasket,
  allProducts,
  onAddToBasket
}) {
  const [optimization, setOptimization] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedAddId, setSelectedAddId] = useState('');

  // Atualizar otimização sempre que o carrinho mudar
  useEffect(() => {
    if (basket.length === 0) {
      setOptimization(null);
      return;
    }

    const fetchOptimization = async () => {
      setLoading(true);
      try {
        const payload = {
          items: basket.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity
          }))
        };

        const res = await fetch('/api/basket/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          setOptimization(data);
        }
      } catch (err) {
        console.error('Erro ao otimizar cesta:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOptimization();
  }, [basket]);

  const handleAddProduct = () => {
    if (!selectedAddId) return;
    const prod = allProducts.find((p) => p.id === parseInt(selectedAddId, 10));
    if (prod) {
      onAddToBasket(prod);
      setSelectedAddId('');
    }
  };

  const formatBRL = (val) => {
    if (val === null || val === undefined) return '—';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-8">
      {/* Banner de Apresentação */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-emerald-700/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Otimizador de Compras Inteligente</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold">Cesta & Carrinho Mais Barato</h2>
          <p className="text-emerald-100 text-sm sm:text-base mt-1 max-w-xl">
            Simule sua lista de compras. Nosso algoritmo descobre em qual loja comprar tudo sai mais barato, ou quanto você economiza dividindo a compra entre os menores preços!
          </p>
        </div>

        {basket.length > 0 && (
          <button
            onClick={onClearBasket}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm transition-all border border-white/20"
          >
            <Trash2 className="w-4 h-4" />
            <span>Limpar Cesta</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Coluna Esquerda: Itens da Cesta */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                <span>Itens na Cesta ({basket.length})</span>
              </h3>
            </div>

            {/* Seletor rápido para adicionar item */}
            <div className="flex gap-2 mb-4">
              <select
                value={selectedAddId}
                onChange={(e) => setSelectedAddId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">+ Selecione um produto para adicionar...</option>
                {allProducts?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddProduct}
                disabled={!selectedAddId}
                className="px-4 py-2 bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar</span>
              </button>
            </div>

            {/* Lista de itens */}
            {basket.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl">
                <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-600">Sua cesta está vazia</p>
                <p className="text-xs text-slate-400 mt-1">
                  Adicione produtos pelo seletor acima ou clique em "+ Cesta" no comparador.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto pr-1">
                {basket.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {item.product.category}
                      </p>
                    </div>

                    {/* Controle de Quantidade */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onRemoveFromBasket(item.product.id)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Resultados da Otimização */}
        <div className="lg:col-span-7 space-y-6">
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Calculando melhor combinação de lojas...</p>
            </div>
          ) : !optimization || basket.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center">
              <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-800">Simule sua compra</h4>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
                Adicione produtos na cesta à esquerda para ver a análise completa de economia e o ranking de lojas.
              </p>
            </div>
          ) : (
            <>
              {/* Comparação dos Dois Cenários */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cenário 1: Loja Única */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Cenário 1: Loja Única
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                        Sem frete extra
                      </span>
                    </div>

                    {optimization.bestSingleStore ? (
                      <>
                        <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: optimization.bestSingleStore.store.color || '#3b82f6' }}
                          />
                          {optimization.bestSingleStore.store.name}
                        </h4>
                        <div className="mt-3">
                          <span className="text-xs text-slate-500">Total na melhor loja:</span>
                          <p className="text-2xl font-extrabold text-slate-900">
                            {formatBRL(optimization.bestSingleStore.total)}
                          </p>
                        </div>
                        {optimization.bestSingleStore.missingItems.length > 0 && (
                          <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Faltam {optimization.bestSingleStore.missingItems.length} item(ns) nesta loja</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">Nenhuma loja possui os produtos selecionados.</p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4">
                    Ideal para quem deseja fazer um pedido único em um só lugar.
                  </p>
                </div>

                {/* Cenário 2: Menor Preço Dividido */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 p-5 rounded-2xl border border-emerald-300 shadow-sm relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                        Cenário 2: Menor Preço Absoluto
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                        Mais Barato
                      </span>
                    </div>

                    <h4 className="text-lg font-bold text-emerald-950">
                      Divisão Inteligente
                    </h4>

                    <div className="mt-3">
                      <span className="text-xs text-emerald-700">Total comprando cada no menor preço:</span>
                      <p className="text-2xl font-black text-emerald-700">
                        {formatBRL(optimization.optimalSplit.total)}
                      </p>
                    </div>

                    {optimization.splitSavings > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Economia extra de {formatBRL(optimization.splitSavings)}!</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-4">
                    Compra dividida entre as lojas mais baratas de cada item.
                  </p>
                </div>
              </div>

              {/* Onde comprar cada item (Divisão Ótima) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald-600" />
                  <span>Distribuição de Compra Recomendada</span>
                </h4>

                <div className="divide-y divide-slate-100 text-xs">
                  {optimization.optimalSplit.items.map((it, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-semibold text-slate-800">
                          {it.quantity}x {it.product.name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: it.store.color || '#3b82f6' }}
                          />
                          <span className="text-slate-500">Comprar na <strong>{it.store.name}</strong></span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">{formatBRL(it.totalPrice)}</span>
                        <p className="text-[10px] text-slate-400">({formatBRL(it.unitPrice)} un.)</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ranking Geral de Lojas */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 text-sm mb-3">
                  Ranking Geral das Lojas para Esta Cesta
                </h4>

                <div className="space-y-2">
                  {optimization.storeRanking.map((sr) => (
                    <div
                      key={sr.store.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sr.store.color || '#94a3b8' }}
                        />
                        <div>
                          <span className="font-semibold text-slate-800">{sr.store.name}</span>
                          {sr.missingItems.length > 0 && (
                            <span className="ml-2 text-[10px] text-amber-600 font-medium">
                              (Faltam: {sr.missingItems.join(', ')})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="font-bold text-slate-900">
                        {sr.total > 0 ? formatBRL(sr.total) : 'Indisponível'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
