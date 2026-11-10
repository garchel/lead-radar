import React, { useEffect, useState } from 'react';
import { Settings, Power, Database, RefreshCw, MessageCircle, Bot, FileText, HardDrive, AlertTriangle, Save } from 'lucide-react';

interface HumanizeSettings {
  enabled: boolean;
  replyStartHour: number;
  replyEndHour: number;
  prospectStartHour: number;
  prospectEndHour: number;
  prospectWeekdaysOnly: boolean;
  typingBaseMs: number;
  typingPerCharMs: number;
  typingMaxMs: number;
  pauseMinSeconds: number;
  pauseMaxSeconds: number;
  dailyTotalCap: number;
  dailyNewCap: number;
}

interface AutomationSettings {
  schedulerEnabled: boolean;
  backupEnabled: boolean;
  backupIntervalHours: number;
  typeformPollingEnabled: boolean;
  typeformIntervalMin: number;
  whatsappAutoIntent: boolean;
  whatsappAutoPipeline: boolean;
  whatsappAutoFollowUp: boolean;
  intentAi: boolean;
  autopilotAutoEnrich: boolean;
  autopilotAnalyzeTopN: number;
  autopilotSendPitches: boolean;
  cadenceEnabled: boolean;
  cadenceDailyCap: number;
  humanize: HumanizeSettings;
}

interface HumanizeStatus {
  enabled: boolean;
  usage: { sentToday: number; newContactsToday: number };
  remaining: { total: number; newContacts: number };
  withinWindow: { reply: boolean; prospect: boolean };
  nextSendAt: string | null;
  lastSendAt: string | null;
}

const NumField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (v: number) => void;
}> = ({ label, value, min = 0, max = 9999, suffix, onCommit }) => (
  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onCommit(Math.min(max, Math.max(min, Math.floor(Number(e.target.value) || 0))))}
      className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-normal"
    />
    {suffix && <span className="font-normal text-slate-400">{suffix}</span>}
  </label>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; danger?: boolean }> = ({ checked, onChange, danger }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? (danger ? 'bg-amber-600' : 'bg-indigo-600') : 'bg-slate-300'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

export const AutomationSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [humanizeStatus, setHumanizeStatus] = useState<HumanizeStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const r = await fetch('/api/whatsapp/humanize');
      const d = await r.json();
      if (d?.success) setHumanizeStatus(d as HumanizeStatus);
    } catch {
      /* painel de consumo é informativo */
    }
  };

  const load = async () => {
    const r = await fetch('/api/automation/settings');
    const d = await r.json();
    if (d?.success) setSettings(d.settings);
    void loadStatus();
  };
  useEffect(() => { void load(); }, []);

  const update = async (patch: Partial<AutomationSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/automation/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const d = await r.json();
      if (!d?.success) throw new Error(d?.error || 'Falha ao salvar');
      setSettings(d.settings);
      setMsg('Salvo');
      setTimeout(() => setMsg(null), 2000);
    } catch (e: any) {
      setMsg(e?.message || 'Erro ao salvar');
      void load();
    } finally { setSaving(false); }
  };

  const updateHumanize = async (patch: Partial<HumanizeSettings>) => {
    if (!settings) return;
    const next = { ...settings, humanize: { ...settings.humanize, ...patch } };
    setSettings(next);
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/automation/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ humanize: patch }) });
      const d = await r.json();
      if (!d?.success) throw new Error(d?.error || 'Falha ao salvar');
      setSettings(d.settings);
      setMsg('Salvo');
      void loadStatus();
      setTimeout(() => setMsg(null), 2000);
    } catch (e: any) {
      setMsg(e?.message || 'Erro ao salvar');
      void load();
    } finally { setSaving(false); }
  };

  if (!settings) return <div className="p-8 text-center text-slate-500 text-sm">Carregando automações...</div>;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Settings className="w-6 h-6 text-indigo-600" /> Automação do Projeto</h1>
          <p className="text-sm text-slate-500 mt-1">Ligue ou desligue cada etapa automática. Desativar não apaga dados, só pausa a execução.</p>
        </div>
        {saving && <span className="text-xs font-bold text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Salvando...</span>}
        {msg && <span className="text-xs font-bold text-emerald-600">{msg}</span>}
      </div>

      {/* Agendamento */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Power className="w-4 h-4 text-indigo-600" /> Agendamento e Fila</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Agendador global</div>
            <div className="text-xs text-slate-500">Controla todos os cron jobs (prospecção, follow-ups). Desligar pausa tudo sem apagar agendamentos.</div>
          </div>
          <Toggle checked={settings.schedulerEnabled} onChange={(v) => void update({ schedulerEnabled: v })} />
        </div>
        <div className="text-xs text-slate-400">Dica: agendamentos individuais continuam em Monitoramento → Agendamentos, com toggle próprio por item.</div>
      </div>

      {/* Backup */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><HardDrive className="w-4 h-4 text-sky-600" /> Backup</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Backup automático</div>
            <div className="text-xs text-slate-500">Snapshot diário do SQLite em data/backups (VACUUM INTO).</div>
          </div>
          <Toggle checked={settings.backupEnabled} onChange={(v) => void update({ backupEnabled: v })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600">Intervalo (horas)</label>
          <input type="number" min={1} max={168} value={settings.backupIntervalHours} onChange={(e) => void update({ backupIntervalHours: Math.max(1, Math.floor(Number(e.target.value) || 24)) })} className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          <span className="text-xs text-slate-400">Requer reinício</span>
        </div>
      </div>

      {/* Typeform */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-violet-600" /> Typeform (briefings)</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Polling automático</div>
            <div className="text-xs text-slate-500">Busca respostas do formulário a cada N minutos e importa para o projeto.</div>
          </div>
          <Toggle checked={settings.typeformPollingEnabled} onChange={(v) => void update({ typeformPollingEnabled: v })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600">Intervalo (min)</label>
          <input type="number" min={1} max={60} value={settings.typeformIntervalMin} onChange={(e) => void update({ typeformIntervalMin: Math.max(1, Math.floor(Number(e.target.value) || 5)) })} className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* WhatsApp */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp (webhook)</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Classificar intenção automaticamente</div>
            <div className="text-xs text-slate-500">Detecta recusa / interesse / preço por regex.</div>
          </div>
          <Toggle checked={settings.whatsappAutoIntent} onChange={(v) => void update({ whatsappAutoIntent: v })} />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Mover pipeline automaticamente</div>
            <div className="text-xs text-slate-500">Recusa → Perdeu, interesse/preço → Em Negociação. Requer intenção ligada.</div>
          </div>
          <Toggle checked={settings.whatsappAutoPipeline} onChange={(v) => void update({ whatsappAutoPipeline: v })} />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Criar follow-up automático</div>
            <div className="text-xs text-slate-500">Interesse/preço cria interação pendente com próximo contato agora.</div>
          </div>
          <Toggle checked={settings.whatsappAutoFollowUp} onChange={(v) => void update({ whatsappAutoFollowUp: v })} />
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">IA para respostas ambíguas</div>
            <div className="text-xs text-slate-500">
              Quando nenhuma palavra-chave casa ("manda", "claro", "beleza"), o Gemini decide se é interesse ou preço.
              Recusa e descadastro (LGPD) continuam só por palavra-chave — a IA nunca marca opt-out.
            </div>
          </div>
          <Toggle checked={settings.intentAi} onChange={(v) => void update({ intentAi: v })} />
        </div>
      </div>

      {/* Autopilot */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-amber-600" /> Autopilot (MCP)</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Enriquecer leads automaticamente</div>
            <div className="text-xs text-slate-500">Busca Google Places / CNPJ após prospecção.</div>
          </div>
          <Toggle checked={settings.autopilotAutoEnrich} onChange={(v) => void update({ autopilotAutoEnrich: v })} />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Quantas análises IA por execução</div>
            <div className="text-xs text-slate-500">0 desliga análise automática; máx 5.</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={5} value={settings.autopilotAnalyzeTopN} onChange={(e) => void update({ autopilotAnalyzeTopN: Number(e.target.value) })} className="w-24" />
            <span className="text-sm font-bold text-slate-700 w-6 text-center">{settings.autopilotAnalyzeTopN}</span>
          </div>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> Enviar pitches automaticamente</div>
            <div className="text-xs text-amber-600 font-medium">Perigoso: dispara WhatsApp/E-mail sem aprovação humana.</div>
          </div>
          <Toggle checked={settings.autopilotSendPitches} onChange={(v) => void update({ autopilotSendPitches: v })} danger />
        </div>
      </div>

      {/* Cadência de outbound */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-indigo-600" /> Cadência de outbound (D+3 / D+7)</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Permitir recontato automático</div>
            <div className="text-xs text-slate-500">Só toca em quem recebeu a abordagem inicial e não respondeu. Para sozinho em conversa aberta, opt-out, resposta ou 3 tentativas.</div>
          </div>
          <Toggle checked={settings.cadenceEnabled} onChange={(v) => void update({ cadenceEnabled: v })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600">Teto de envios da cadência por dia</label>
          <input type="number" min={0} max={200} value={settings.cadenceDailyCap} onChange={(e) => void update({ cadenceDailyCap: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          <span className="text-xs text-slate-400">0 bloqueia envios reais (simulação continua liberada)</span>
        </div>
      </div>

      {/* Humanização do WhatsApp */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-600" /> Humanização do WhatsApp (anti-ban)</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800">Simular comportamento humano</div>
            <div className="text-xs text-slate-500">Aplica janela de horário, delay de digitação, pausa entre envios e tetos diários em TODO envio de WhatsApp. Desligado = envia na hora.</div>
          </div>
          <Toggle checked={settings.humanize.enabled} onChange={(v) => void updateHumanize({ enabled: v })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">Janela de respostas</div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="início" value={settings.humanize.replyStartHour} max={23} suffix="h" onCommit={(v) => void updateHumanize({ replyStartHour: v })} />
              <NumField label="fim" value={settings.humanize.replyEndHour} max={24} suffix="h" onCommit={(v) => void updateHumanize({ replyEndHour: v })} />
            </div>
            <div className="text-xs text-slate-400">Responde quem já está em conversa com você. Vale todos os dias.</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between gap-2">
              Janela de prospecção
              <span className="flex items-center gap-2 font-normal text-slate-500">
                só seg–sex
                <Toggle checked={settings.humanize.prospectWeekdaysOnly} onChange={(v) => void updateHumanize({ prospectWeekdaysOnly: v })} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="início" value={settings.humanize.prospectStartHour} max={23} suffix="h" onCommit={(v) => void updateHumanize({ prospectStartHour: v })} />
              <NumField label="fim" value={settings.humanize.prospectEndHour} max={24} suffix="h" onCommit={(v) => void updateHumanize({ prospectEndHour: v })} />
            </div>
            <div className="text-xs text-slate-400">Primeiro contato e follow-ups da cadência.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">Delay de digitação</div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="base" value={settings.humanize.typingBaseMs} max={60000} suffix="ms" onCommit={(v) => void updateHumanize({ typingBaseMs: v })} />
              <NumField label="por caractere" value={settings.humanize.typingPerCharMs} max={500} suffix="ms" onCommit={(v) => void updateHumanize({ typingPerCharMs: v })} />
              <NumField label="teto" value={settings.humanize.typingMaxMs} max={120000} suffix="ms" onCommit={(v) => void updateHumanize({ typingMaxMs: v })} />
            </div>
            <div className="text-xs text-slate-400">Tempo "digitando" antes de cada envio, proporcional ao texto.</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">Pausa entre envios</div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="mín" value={settings.humanize.pauseMinSeconds} max={3600} suffix="s" onCommit={(v) => void updateHumanize({ pauseMinSeconds: v })} />
              <NumField label="máx" value={settings.humanize.pauseMaxSeconds} max={3600} suffix="s" onCommit={(v) => void updateHumanize({ pauseMaxSeconds: v })} />
            </div>
            <div className="text-xs text-slate-400">Intervalo sorteado entre uma mensagem e a seguinte (todas as origens).</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">Teto diário total</div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="mensagens/dia" value={settings.humanize.dailyTotalCap} max={500} onCommit={(v) => void updateHumanize({ dailyTotalCap: v })} />
            </div>
            <div className="text-xs text-slate-400">Soma TUDO que sai do número: respostas, prospecção e cadência.</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">Teto de contatos novos</div>
            <div className="flex flex-wrap items-center gap-3">
              <NumField label="novos/dia" value={settings.humanize.dailyNewCap} max={500} onCommit={(v) => void updateHumanize({ dailyNewCap: v })} />
            </div>
            <div className="text-xs text-slate-400">Só primeiros contatos (quem nunca recebeu nada nosso).</div>
          </div>
        </div>

        {humanizeStatus && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className={humanizeStatus.enabled ? 'font-bold text-emerald-600' : 'font-bold text-slate-400'}>
              {humanizeStatus.enabled ? 'Humanização ativa' : 'Humanização desligada'}
            </span>
            <span>Enviadas hoje: <b>{humanizeStatus.usage.sentToday}</b> / {settings.humanize.dailyTotalCap}</span>
            <span>Contatos novos hoje: <b>{humanizeStatus.usage.newContactsToday}</b> / {settings.humanize.dailyNewCap}</span>
            <span>Respostas: <b>{humanizeStatus.withinWindow.reply ? 'janela aberta' : 'janela fechada'}</b></span>
            <span>Prospecção: <b>{humanizeStatus.withinWindow.prospect ? 'janela aberta' : 'janela fechada'}</b></span>
            {humanizeStatus.nextSendAt && <span>Próximo envio: <b>{new Date(humanizeStatus.nextSendAt).toLocaleTimeString('pt-BR')}</b></span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Database className="w-3 h-3" /> Configurações salvas em <code className="bg-white px-1 rounded border">app_settings</code> e aplicadas em tempo real quando possível.
      </div>
    </div>
  );
};
