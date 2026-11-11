import React from 'react';

/**
 * Visão rápida por etapa: quantos cards existem em cada coluna do kanban,
 * sem precisar rolar a página inteira. Usada no Dashboard de Leads e em Projetos.
 *
 * Cada chip é um atalho: clicar leva até a etapa (e reabre, se estiver recolhida).
 */
export interface StageOverviewItem {
  id: string;
  label: string;
  count: number;
  /** classes do chip (mesmas do cabeçalho da etapa) */
  color: string;
  /** classe literal do segmento na barra proporcional (ex.: 'bg-sky-500') */
  bar: string;
}

interface StageOverviewProps {
  items: StageOverviewItem[];
  onSelect: (id: string) => void;
  unit: string;
  /** rótulo do total no canto direito; default: count/etapas */
  emptyHint?: string;
}

export const StageOverview: React.FC<StageOverviewProps> = ({ items, onSelect, unit, emptyHint }) => {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const filled = items.filter((item) => item.count > 0);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Visão rápida por etapa
        </span>
        <span className="text-xs text-slate-600">
          <strong className="tabular-nums text-slate-900">{total}</strong> {unit} em {items.length} etapas
        </span>
      </div>

      {/* barra proporcional: mostra o desequilíbrio do funil de relance */}
      <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 my-2" aria-hidden="true">
        {filled.map((item) => (
          <span
            key={item.id}
            className={item.bar}
            style={{ width: `${(item.count / Math.max(total, 1)) * 100}%` }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={`Ir para ${item.label} (${item.count})`}
            className={`inline-flex items-center gap-1.5 px-2 py-1 min-h-8 rounded-lg border text-[11px] font-semibold hover:brightness-[0.97] ${item.color} ${
              item.count === 0 ? 'opacity-60' : ''
            }`}
          >
            <span className="tabular-nums font-bold">{item.count}</span>
            <span className="truncate max-w-40">{item.label}</span>
          </button>
        ))}
      </div>

      {total === 0 && emptyHint && (
        <p className="text-[11px] text-slate-500 mt-1.5">{emptyHint}</p>
      )}
    </section>
  );
};

export default StageOverview;
