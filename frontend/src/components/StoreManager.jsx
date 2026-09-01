import React, { useState } from 'react';
import { Store, Plus, Trash2, Globe, ExternalLink } from 'lucide-react';

export default function StoreManager({ stores, onStoreAdded, onStoreDeleted }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('online');
  const [website, setWebsite] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome da loja é obrigatório.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, website, color })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao cadastrar loja');
      }

      setName('');
      setWebsite('');
      setColor('#3B82F6');
      onStoreAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, storeName) => {
    if (!confirm(`Deseja realmente remover a loja "${storeName}" e todas as suas cotações?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/stores/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onStoreDeleted();
      }
    } catch (err) {
      alert('Erro ao excluir loja: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Gerenciamento de Lojas</h2>
        <p className="text-sm text-slate-500 mt-1">
          Cadastre redes de varejo, supermercados físicos e e-commerces para monitorar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulário de Cadastro de Loja */}
        <div className="lg:col-span-5">
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Nova Loja</span>
            </h3>

            {error && (
              <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Loja *
              </label>
              <input
                type="text"
                placeholder="Ex: Mercado Livre, Amazon, Carrefour"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tipo de Loja
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="online">E-Commerce / Online</option>
                  <option value="physical">Loja Física / Supermercado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cor da Identidade
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-9 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-xs text-slate-500 uppercase font-mono">{color}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link do Website (opcional)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Cadastrando...' : 'Cadastrar Loja'}</span>
            </button>
          </form>
        </div>

        {/* Lista de Lojas Cadastradas */}
        <div className="lg:col-span-7">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>Lojas Cadastradas ({stores.length})</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {stores.map((s) => (
                <div key={s.id} className="py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: s.color || '#3b82f6' }}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{s.name}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="capitalize">{s.type === 'online' ? 'E-Commerce' : 'Loja Física'}</span>
                        {s.website && (
                          <>
                            <span>•</span>
                            <a
                              href={s.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <span>Visitar</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(s.id, s.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Excluir loja"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
