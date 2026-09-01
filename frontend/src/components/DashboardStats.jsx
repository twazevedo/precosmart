import React from 'react';
import { Package, Store, TrendingDown, Percent } from 'lucide-react';

export default function DashboardStats({ comparisonData, stats }) {
  const productsWithQuotes = comparisonData?.products?.filter((p) => p.hasQuotes) || [];
  
  // Calcular economia média em porcentagem
  const avgSavingsPct = productsWithQuotes.length > 0
    ? (productsWithQuotes.reduce((acc, curr) => acc + curr.savingsPercentage, 0) / productsWithQuotes.length).toFixed(1)
    : 0;

  // Calcular economia total possível somando todos os produtos
  const totalMaxSavings = productsWithQuotes.reduce((acc, curr) => acc + curr.potentialSavings, 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Card 1 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Produtos Monitorados
          </p>
          <h3 className="text-2xl font-bold text-slate-900">
            {stats?.totalProducts ?? comparisonData?.products?.length ?? 0}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {stats?.categories?.length || 0} categorias cadastradas
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <Package className="w-6 h-6" />
        </div>
      </div>

      {/* Card 2 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Lojas Ativas
          </p>
          <h3 className="text-2xl font-bold text-slate-900">
            {stats?.totalStores ?? comparisonData?.stores?.length ?? 0}
          </h3>
          <p className="text-xs text-emerald-600 font-medium mt-1">
            Físicas e E-commerces
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
          <Store className="w-6 h-6" />
        </div>
      </div>

      {/* Card 3 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Economia Média
          </p>
          <h3 className="text-2xl font-bold text-emerald-600">
            {avgSavingsPct}%
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            entre a loja mais cara e mais barata
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Percent className="w-6 h-6" />
        </div>
      </div>

      {/* Card 4 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Economia Potencial
          </p>
          <h3 className="text-2xl font-bold text-teal-600">
            R$ {totalMaxSavings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            comprando no melhor preço
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <TrendingDown className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
