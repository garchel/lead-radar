import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Printer, Copy, Check, RefreshCw, Wand2, AlertTriangle, ShieldCheck, ShieldX, Upload } from 'lucide-react';

/**
 * Gerador de contrato.
 *
 * O contrato não pode ter escopo fixo: barbearia, clínica e oficina têm seções
 * diferentes, e o Anexo I precisa refletir o que o cliente aprovou na conversa. Então
 * a tela puxa os pacotes e, por nicho, as seções que a análise de páginas reais indica
 * como base e como diferencial — o resto é ajuste manual.
 *
 * A mesma API serve a Clara: ela gera pelo WhatsApp com o que foi combinado, e o Paulo
 * gera aqui, com o texto bonito para imprimir. Mesmo documento, mesma fonte de verdade.
 */

interface Opcao { id: string; nome: string; preco: number; secoes: string[]; revisoes: number }
interface Opcoes {
  pacotes: Opcao[];
  nichos: Array<{ id: string; titulo: string }>;
  secoesBase: string[];
  secoesDiferencial: string[];
}

interface Veredito {
  temAssinatura: boolean;
  quantidade: number;
  integro: boolean;
  assinantes: string[];
  hashDocumento: string | null;
  problemas: string[];
  observacao: string;
}

interface Resposta {
  success: boolean;
  contrato?: string;
  html?: string;
  resumo?: string;
  secoes?: string[];
  valores?: { total: number; entrada: number; saldo: number };
  error?: string;
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** Quantas seções o pacote comporta — o mesmo número que a oferta usa. */
const limiteDe = (pacoteId: string) => (pacoteId === 'profissional' ? 8 : 5);

const campo = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';
const rotulo = 'block text-xs font-semibold text-slate-500 mb-1';

export const ContractBuilder: React.FC = () => {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [nicho, setNicho] = useState('');
  const [pacoteId, setPacoteId] = useState('essencial');
  const [secoes, setSecoes] = useState<string[]>([]);
  const [secaoNova, setSecaoNova] = useState('');
  const [cliente, setCliente] = useState({
    contratante: '',
    contratanteDoc: '',
    contratanteEndereco: '',
    contratanteTelefone: '',
    contratanteEmail: '',
    representante: '',
    contratadaCnpj: '',
  });
  const [resultado, setResultado] = useState<Resposta | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [veredito, setVeredito] = useState<Veredito | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');

  const carregarOpcoes = useCallback(async (chaveNicho?: string) => {
    setCarregandoOpcoes(true);
    try {
      const url = `/api/agent/contrato/opcoes${chaveNicho ? `?nicho=${encodeURIComponent(chaveNicho)}` : ''}`;
      const r = await fetch(url);
      const d: Opcoes = await r.json();
      setOpcoes(d);
      if (chaveNicho && (d.secoesBase.length || d.secoesDiferencial.length)) {
        // Pré-seleciona só o ESSENCIAL do nicho, cortado no limite do pacote. Marcar os
        // diferenciais junto deixava 13 seções num pacote de 5 — o contrato nascia
        // prometendo mais do que o preço cobre.
        setSecoes(d.secoesBase.slice(0, limiteDe(pacoteId)));
      }
    } catch {
      setErro('Não consegui carregar pacotes e nichos.');
    } finally {
      setCarregandoOpcoes(false);
    }
  }, []);

  useEffect(() => {
    void carregarOpcoes();
  }, [carregarOpcoes]);

  const pacote = useMemo(
    () => opcoes?.pacotes.find((p) => p.id === pacoteId) || opcoes?.pacotes[0] || null,
    [opcoes, pacoteId],
  );

  const alternarSecao = (s: string) =>
    setSecoes((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));

  const adicionarSecao = () => {
    const s = secaoNova.trim();
    if (!s || secoes.includes(s)) return;
    setSecoes([...secoes, s]);
    setSecaoNova('');
  };

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const r = await fetch('/api/agent/contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacote: pacoteId,
          nicho: opcoes?.nichos.find((n) => n.id === nicho)?.titulo || nicho,
          secoes,
          ...cliente,
        }),
      });
      const d: Resposta = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao gerar');
      setResultado(d);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gerar o contrato.');
    } finally {
      setGerando(false);
    }
  };

  const verificar = async (arquivo: File) => {
    setVerificando(true);
    setErro(null);
    setVeredito(null);
    setNomeArquivo(arquivo.name);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('falha ao ler o arquivo'));
        r.readAsDataURL(arquivo);
      });
      const resp = await fetch('/api/contracts/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const d = await resp.json();
      if (!d.success) throw new Error(d.error || 'Falha ao verificar');
      setVeredito(d.veredito as Veredito);
    } catch (e: any) {
      setErro(e?.message || 'Não consegui verificar o arquivo.');
    } finally {
      setVerificando(false);
    }
  };

  const imprimir = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) win.print();
  };

  const copiar = async () => {
    if (!resultado?.contrato) return;
    await navigator.clipboard.writeText(resultado.contrato);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-400" />
            Contrato
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Escolha o pacote, o nicho e as seções combinadas. O texto e o PDF saem daqui, e a Clara gera o mesmo documento pela API.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregarOpcoes(nicho || undefined)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${carregandoOpcoes ? 'animate-spin' : ''}`} />
          Recarregar nichos
        </button>
      </header>

      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* ---------------- Formulário ---------------- */}
        <section className="space-y-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>Pacote</label>
              <select value={pacoteId} onChange={(e) => setPacoteId(e.target.value)} className={campo}>
                {(opcoes?.pacotes || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome} — {brl(p.preco)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo}>Nicho</label>
              <select
                value={nicho}
                onChange={(e) => { setNicho(e.target.value); void carregarOpcoes(e.target.value || undefined); }}
                className={campo}
              >
                <option value="">— escolher —</option>
                {(opcoes?.nichos || []).map((n) => (
                  <option key={n.id} value={n.id}>{n.titulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={rotulo}>Cliente</label>
            <input
              value={cliente.contratante}
              onChange={(e) => setCliente({ ...cliente, contratante: e.target.value })}
              placeholder="Nome do negócio ou razão social"
              className={campo}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>CPF / CNPJ do cliente</label>
              <input value={cliente.contratanteDoc} onChange={(e) => setCliente({ ...cliente, contratanteDoc: e.target.value })} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Telefone</label>
              <input value={cliente.contratanteTelefone} onChange={(e) => setCliente({ ...cliente, contratanteTelefone: e.target.value })} className={campo} />
            </div>
          </div>

          <div>
            <label className={rotulo}>Endereço do cliente</label>
            <input value={cliente.contratanteEndereco} onChange={(e) => setCliente({ ...cliente, contratanteEndereco: e.target.value })} className={campo} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>E-mail do cliente</label>
              <input value={cliente.contratanteEmail} onChange={(e) => setCliente({ ...cliente, contratanteEmail: e.target.value })} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Representante</label>
              <input value={cliente.representante} onChange={(e) => setCliente({ ...cliente, representante: e.target.value })} placeholder="quem assina pelo cliente" className={campo} />
            </div>
          </div>

          <div>
            <label className={rotulo}>CNPJ da Vértice (deixe vazio enquanto o MEI não sair)</label>
            <input value={cliente.contratadaCnpj} onChange={(e) => setCliente({ ...cliente, contratadaCnpj: e.target.value })} className={campo} />
          </div>

          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className={rotulo + ' mb-0'}>Seções do site ({secoes.length})</label>
              {pacote && (
                <span className={`text-[11px] ${secoes.length > limiteDe(pacoteId) ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                  {secoes.length}/{limiteDe(pacoteId)} seções
                  {secoes.length > limiteDe(pacoteId) ? ' — acima do pacote' : ''}
                </span>
              )}
            </div>

            {!!(opcoes?.secoesBase.length || opcoes?.secoesDiferencial.length) && (
              <div className="space-y-1 mb-2">
                {opcoes?.secoesBase.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={secoes.includes(s)} onChange={() => alternarSecao(s)} className="accent-indigo-500" />
                    <span>{s}</span>
                  </label>
                ))}
                {opcoes?.secoesDiferencial.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={secoes.includes(s)} onChange={() => alternarSecao(s)} className="accent-indigo-500" />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={secaoNova}
                onChange={(e) => setSecaoNova(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarSecao(); } }}
                placeholder="adicionar seção (ex.: antes e depois)"
                className={campo}
              />
              <button type="button" onClick={adicionarSecao} className="shrink-0 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm">
                +
              </button>
            </div>

            {secoes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {secoes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => alternarSecao(s)}
                    title="remover"
                    className="px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
                  >
                    {s} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void gerar()}
            disabled={gerando}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm"
          >
            {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {gerando ? 'Gerando…' : 'Gerar contrato'}
          </button>

          {resultado?.valores && (
            <p className="text-[11px] text-slate-500">
              {brl(resultado.valores.total)} · entrada {brl(resultado.valores.entrada)} · saldo {brl(resultado.valores.saldo)}
            </p>
          )}
        </section>

        {/* ---------------- Prévia ---------------- */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[75vh] shadow-sm">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <span className="text-xs font-semibold text-slate-600">Prévia do documento</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void copiar()}
                disabled={!resultado?.contrato}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs"
              >
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiado ? 'Copiado' : 'Copiar texto'}
              </button>
              <button
                type="button"
                onClick={imprimir}
                disabled={!resultado?.html}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / PDF
              </button>
            </div>
          </div>
          {resultado?.html ? (
            <iframe ref={iframeRef} title="Prévia do contrato" srcDoc={resultado.html} className="flex-1 w-full bg-white min-h-[70vh]" />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm p-8 text-center bg-slate-50">
              Preencha os dados e clique em <strong className="mx-1 text-slate-700">Gerar contrato</strong> para ver o documento aqui.
            </div>
          )}
        </section>
      </div>

      {/* ---------------- Verificar assinatura devolvida ---------------- */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Contrato assinado voltou?
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Envie o PDF que o cliente devolveu. Verificamos se a assinatura existe, se o arquivo foi alterado depois e de quem é.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm cursor-pointer">
            {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {verificando ? 'Verificando…' : 'Enviar PDF assinado'}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void verificar(f);
              }}
            />
          </label>
        </div>

        {nomeArquivo && !veredito && !verificando && (
          <p className="text-xs text-slate-500">{nomeArquivo}</p>
        )}

        {veredito && (
          <div className={`rounded-lg border p-3 text-sm space-y-2 ${
            veredito.temAssinatura && veredito.integro
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-rose-50 border-rose-200'
          }`}>
            <div className="flex items-center gap-2 font-semibold">
              {veredito.temAssinatura && veredito.integro ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <ShieldX className="w-4 h-4 text-rose-600" />
              )}
              <span className={veredito.temAssinatura && veredito.integro ? 'text-emerald-800' : 'text-rose-800'}>
                {veredito.temAssinatura && veredito.integro
                  ? `Assinado e íntegro${veredito.assinantes.length ? ` — ${veredito.assinantes.join(', ')}` : ''}`
                  : veredito.temAssinatura
                    ? 'Assinatura encontrada, mas o arquivo não está íntegro'
                    : 'Sem assinatura digital'}
              </span>
              {veredito.quantidade > 0 && (
                <span className="text-[11px] font-normal text-slate-500">({veredito.quantidade} assinatura{veredito.quantidade > 1 ? 's' : ''})</span>
              )}
            </div>

            {veredito.problemas.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-rose-700 space-y-0.5">
                {veredito.problemas.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}

            {veredito.hashDocumento && (
              <p className="text-[10px] font-mono text-slate-500 break-all">
                hash do que foi assinado: {veredito.hashDocumento}
              </p>
            )}

            <p className="text-[11px] text-slate-600">{veredito.observacao}</p>
          </div>
        )}
      </section>
    </div>
  );
};
