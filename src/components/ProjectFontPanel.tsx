import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Type, Check, Loader2, Sparkles } from 'lucide-react';

interface FontMeta {
  name: string;
  category: string;
  tags: string[];
}

interface Suggestion {
  display: string;
  body: string;
  score: number;
  reason: string;
}

interface ProjectFontPanelProps {
  projectId: string;
  fontDisplay?: string;
  fontBody?: string;
  refreshKey?: string;
  onSaved?: () => void;
}

/**
 * Escolha da tipografia do projeto.
 *
 * O par sugerido pelo tom da marca é só o ponto de partida: aqui o operador troca
 * a fonte do título e recebe as de texto que combinam, com o motivo. Sem isso
 * todas as prévias saem com a mesma cara, que é o que o cliente percebe.
 */
export const ProjectFontPanel: React.FC<ProjectFontPanelProps> = ({ projectId, fontDisplay, fontBody, refreshKey, onSaved }) => {
  const [fontes, setFontes] = useState<FontMeta[]>([]);
  const [display, setDisplay] = useState(fontDisplay || '');
  const [body, setBody] = useState(fontBody || '');
  const [sugestoes, setSugestoes] = useState<Suggestion[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setDisplay(fontDisplay || '');
    setBody(fontBody || '');
  }, [fontDisplay, fontBody, refreshKey]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch('/api/fonts');
        const data = await res.json();
        if (ativo && data?.success) setFontes(data.fontes as FontMeta[]);
      } catch {
        /* painel secundário */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const buscarSugestoes = useCallback(async (familia: string) => {
    if (!familia) {
      setSugestoes([]);
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch(`/api/fonts?family=${encodeURIComponent(familia)}`);
      const data = await res.json();
      setSugestoes((data?.sugestoes || []) as Suggestion[]);
    } catch {
      setSugestoes([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void buscarSugestoes(display);
  }, [display, buscarSugestoes]);

  // prévia ao vivo: carrega as duas famílias escolhidas
  useEffect(() => {
    if (!display && !body) return;
    const id = 'preview-fonts';
    const existente = document.getElementById(id);
    if (existente) existente.remove();
    const partes = [display, body]
      .filter(Boolean)
      .map((nome) => `family=${encodeURIComponent(nome).replace(/%20/g, '+')}:wght@400;600;700`);
    if (!partes.length) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${partes.join('&')}&display=swap`;
    document.head.appendChild(link);
  }, [display, body]);

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontDisplay: display || null, fontBody: body || null }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'Falha ao salvar a tipografia.');
      setAviso('Tipografia salva. Gere a prévia de novo para ver na página.');
      onSaved?.();
    } catch (e: any) {
      setAviso(e?.message || 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const opcoes = useMemo(
    () => [...fontes].sort((a, b) => a.name.localeCompare(b.name)),
    [fontes]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
          <Type className="h-4 w-4 text-indigo-600" /> Tipografia da página
        </h3>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || (!display && !body)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar tipografia
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-slate-600">
          Título
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            <option value="">(automático pelo tom da marca)</option>
            {opcoes.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} · {f.category}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">
          Texto
          <select
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            <option value="">(automático pelo tom da marca)</option>
            {opcoes.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} · {f.category}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* prévia ao vivo */}
      {(display || body) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p
            className="text-[10px] font-bold uppercase tracking-wider text-slate-500"
            style={{ fontFamily: body ? `"${body}", system-ui, sans-serif` : undefined }}
          >
            Prévia
          </p>
          <p
            className="mt-1 text-lg font-semibold leading-tight text-slate-900"
            style={{ fontFamily: display ? `"${display}", Georgia, serif` : undefined }}
          >
            Cuidar do seu sorriso pode ser tranquilo
          </p>
          <p
            className="mt-1 text-[12px] leading-relaxed text-slate-600"
            style={{ fontFamily: body ? `"${body}", system-ui, sans-serif` : undefined }}
          >
            Atendimento com hora marcada, explicação de cada etapa e um plano que cabe no seu tempo.
          </p>
        </div>
      )}

      {/* sugestões de par */}
      {display && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Textos que combinam com {display}
          </p>
          {carregando ? (
            <p className="mt-1 text-[11px] text-slate-500">calculando…</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {sugestoes.map((s) => (
                <li key={s.body}>
                  <button
                    type="button"
                    onClick={() => setBody(s.body)}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      body === s.body
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">{s.body}</span>
                      <span className="text-[10px] tabular-nums text-slate-500">{s.score}</span>
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">{s.reason}</span>
                  </button>
                </li>
              ))}
              {!sugestoes.length && <li className="text-[11px] text-slate-500">sem sugestão para esta fonte</li>}
            </ul>
          )}
        </div>
      )}

      {aviso && <p className="text-[11px] text-slate-600">{aviso}</p>}
    </div>
  );
};
