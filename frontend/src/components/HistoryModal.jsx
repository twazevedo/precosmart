import React, { useState, useEffect } from 'react';
import { X, History, TrendingUp, TrendingDown, RefreshCw, Calendar, Store } from 'lucide-react';

export default function HistoryModal({ isOpen, onClose, product }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !product) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${product.id}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (err) {
        console.error('Erro ao buscar histórico:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const formatBRL = (val) => {
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const prices = history.map((h) => h.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Histórico de Preços</h3>
              <p className="text-xs text-slate-500 truncate max-w-xs sm:max-w-sm">
                {product.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Métricas do Histórico */}
          {history.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> Menor Registrado
                </span>
                <p className="text-lg font-extrabold text-emerald-800 mt-0.5">
                  {formatBRL(minPrice)}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Maior Registrado
                </span>
                <p className="text-lg font-extrabold text-slate-800 mt-0.5">
                  {formatBRL(maxPrice)}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center">
              <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Carregando histórico...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl">
              <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Nenhum histórico de cotações para este item.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {history.map((item) => {
                const isLowest = item.price === minPrice;
                return (
                  <div key={item.id} className="relative group">
                    {/* Marcador na linha do tempo */}
                    <div
                      className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 ${
                        isLowest ? 'bg-emerald-600 ring-emerald-300' : 'bg-slate-400 ring-slate-200'
                      }`}
                    />

                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:shadow-xs transition-all flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: item.store_color || '#3b82f6' }}
                          />
                          <span className="text-xs font-bold text-slate-800">
                            {item.store_name}
                          </span>
                          {isLowest && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                              Menor
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {formatDate(item.quoted_at)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className={`text-sm font-extrabold ${isLowest ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {formatBRL(item.price)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
