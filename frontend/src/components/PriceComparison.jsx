import React, { useState, useMemo } from 'react';
import { Search, Plus, ShoppingCart, History, ExternalLink, ArrowDownRight, Tag, Trash2, Store } from 'lucide-react';

export default function PriceComparison({
  comparisonData,
  onAddToBasket,
  onOpenHistory,
  onOpenQuoteModalForProduct,
  onDeleteProduct
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('savings');

  const categories = useMemo(() => {
    if (!comparisonData?.products) return [];
    const set = new Set();
    comparisonData.products.forEach((p) => {
      if (p.product?.category) set.add(p.product.category);
    });
    return Array.from(set);
  }, [comparisonData]);

  const filteredProducts = useMemo(() => {
    if (!comparisonData?.products) return [];

    return comparisonData.products
      .filter((item) => {
        const matchesSearch =
          item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.product.brand && item.product.brand.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory =
          selectedCategory === 'all' || item.product.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'savings') {
          return b.savingsPercentage - a.savingsPercentage;
        }
        if (sortBy === 'lowestPrice') {
          return (a.lowestPrice || 999999) - (b.lowestPrice || 999999);
        }
        if (sortBy === 'name') {
          return a.product.name.localeCompare(b.product.name);
        }
        return 0;
      });
  }, [comparisonData, searchTerm, selectedCategory, sortBy]);

  const formatBRL = (val) => {
    if (val === null || val === undefined) return '—';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Input de Busca */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por produto, marca ou especificação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Categorias & Ordenação */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Todas as Categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="savings">Maior Economia (%)</option>
            <option value="lowestPrice">Menor Preço Inicial</option>
            <option value="name">Nome (A - Z)</option>
          </select>
        </div>
      </div>

      {/* Grid de Produtos Comparados */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
          <Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-700">Nenhum produto encontrado</h4>
          <p className="text-sm text-slate-500 mt-1">
            Tente buscar com outro termo ou cadastre um novo produto com o botão acima.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredProducts.map((item) => {
            const { product, hasQuotes, quotes, lowestPrice, highestPrice, averagePrice, cheapestStore, potentialSavings, savingsPercentage } = item;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Cabeçalho do Produto */}
                <div className="p-5 border-b border-slate-100 flex gap-4 items-start">
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://placehold.co/100x100?text=Produto';
                        }}
                      />
                    ) : (
                      <Tag className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {product.category}
                      </span>
                      {product.brand && (
                        <span className="text-xs text-slate-400 font-medium">
                          {product.brand}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                      {product.name}
                    </h3>

                    {/* Preço de Destaque */}
                    {hasQuotes ? (
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">A partir de</span>
                        <span className="text-xl font-extrabold text-emerald-600">
                          {formatBRL(lowestPrice)}
                        </span>
                        {cheapestStore && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-md text-white shadow-xs"
                            style={{ backgroundColor: cheapestStore.color || '#059669' }}
                          >
                            {cheapestStore.name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-600 font-medium">
                        Nenhuma cotação cadastrada ainda
                      </p>
                    )}
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDeleteProduct(product.id, product.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Excluir produto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Resumo de Economia & Variação */}
                {hasQuotes && savingsPercentage > 0 && (
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-2.5 border-b border-emerald-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                      <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                      <span>
                        Diferença de até <strong>{formatBRL(potentialSavings)}</strong> entre as lojas
                      </span>
                    </div>
                    <span className="font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      -{savingsPercentage}%
                    </span>
                  </div>
                )}

                {/* Comparação entre as Lojas */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      <span>Loja</span>
                      <span>Preço</span>
                    </div>

                    {quotes && quotes.length > 0 ? (
                      quotes.map((q) => {
                        const isCheapest = q.price === lowestPrice;
                        return (
                          <div
                            key={q.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              isCheapest
                                ? 'bg-emerald-50/70 border-emerald-300 font-semibold'
                                : 'bg-slate-50 border-slate-200/80 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: q.store_color || '#94a3b8' }}
                              />
                              <span className="text-sm">{q.store_name}</span>
                              {isCheapest && (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                  Menor
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`text-sm ${isCheapest ? 'text-emerald-700 font-bold' : 'text-slate-800'}`}>
                                {formatBRL(q.price)}
                              </span>
                              {q.url && (
                                <a
                                  href={q.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-400 hover:text-slate-700"
                                  title="Abrir no site da loja"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400 italic">Cadastre cotações para comparar lojas.</p>
                    )}
                  </div>

                  {/* Rodapé do Card com Botões de Ação */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onOpenHistory(product)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Histórico</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenQuoteModalForProduct(product)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cotação</span>
                      </button>

                      <button
                        onClick={() => onAddToBasket(product)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>+ Cesta</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
