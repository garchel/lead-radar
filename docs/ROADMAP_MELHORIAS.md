# Roadmap de melhorias — LeadRadar

Contexto: aplicação de uso pessoal (um operador humano + agente de IA), rodando
em máquina local. Prioridade = impacto operacional, não escala multi-tenant.

Legenda: `[ ]` pendente · `[x]` feito · `[~]` parcial

## Segurança e integridade

- [ ] **Autenticação de escrita**: `API_WRITE_TOKEN` está documentado no
      `.env.example` mas não é usado em lugar nenhum. Rotas mutáveis e CORS `*`
      abertos. Como o uso é local, aceitável por ora; se a porta for exposta na
      rede, criar middleware de escrita e restringir CORS.
- [ ] **Webhook autenticado**: `WHATSAPP_WEBHOOK_TOKEN` é opcional. Sem token,
      qualquer origem pode forjar inbound/ACK. Configurar token no gateway e
      exigir quando presente (código já suporta).
- [ ] **Exposição de rede**: o servidor escuta em `0.0.0.0` sem auth de escrita.
      Em rede compartilhada, qualquer um acessa. Avaliar bind em `127.0.0.1`
      (mantendo webhook do Docker) ou token de escrita.
- [~] **SQLite fora do OneDrive**: `data/leadradar.db` está em pasta sincronizada;
      agora o boot avisa. Falta mover o arquivo e definir `LEADRADAR_DATA_DIR`
      para uma pasta local.
- [ ] **Higiene do repo**: `qr-*.json`, `qrcode*.png`, `.whatsmiau-src/` não
      devem ser versionados.

## Confiabilidade

- [x] **Reconciliação com âncora**: `syncMessages` exige `id` de mensagem
      existente; usar último `externalId` e retornar `no_anchor` quando faltar.
- [x] **Limite de `count`**: gateway valida 1–100 (nosso código permitia 200).
- [~] **Paginação/filtro `since`**: `since` exposto em REST/MCP; falta loop de
      páginas para históricos longos (o gateway já pagina até o limite de 500).
- [~] **Retry/outbox de envios**: `GET /api/outbox` + `retry_outbound` (manual,
      com guardas) e marcação de "sem confirmação" após 24h. Falta retry
      automático com backoff — decisão deliberada para não duplicar conversa.
- [x] **Cadência serializada**: mutex evita corrida entre execução manual e
      agendada estourando o teto diário.
- [~] **Watchdog do gateway**: `GET /api/whatsapp/health` + badge na UI; falta
      auto-restart/alerta ativo quando a instância cai.
- [x] **Backfill versionado**: roda uma vez por versão (`BACKFILL_VERSION` em
      `app_settings`); bump força nova passada.
- [ ] **Observabilidade**: contadores para webhook descartado, ACK aplicado, job
      falho e reconcile; hoje só `console.warn`.

## Produto

- [x] **Opt-out automático**: detectar "pare", "não quero", "descadastrar" no
      inbound e marcar `doNotContact` (LGPD).
- [x] **Gancho de cadência**: não é mais injetado; a atribuição usa o gancho do
      primeiro outbound (o lead nunca "vira" follow-up nas métricas).
- [ ] **GrowthPage**: taxa por etapa, tempo médio de resposta, exportação.
- [x] **Confirmação de entrega**: `metrics.delivery` (sent/delivered/read/failed/
      pending + sem confirmação há 24h) e painel na GrowthPage.
- [x] **Landing pages em repo único**: todas as LPs em `sites/<nicho>/<slug>/`
      (sem repo por cliente); `Project.sitePath` registra a pasta e o dev kit
      instrui o agente a criar/retomar ali.
- [x] **Identidade visual do lead**: `POST /api/leads/:id/brand-research` e tool
      `research_lead_brand` usam SerpAPI (Google Imagens/perfis) + Gemini vision
      para captar paleta, tom, logo e referências. Snapshot fica no lead
      (`brandSnapshot`) e entra no dev kit/prompt. Manual por design; guarda só
      dados derivados + URLs de origem.

## Engenharia

- [~] **Testes de rota/E2E**: cobertos health, webhook (assinatura/opt-out),
      clamp de `count` e `since` no reconcile. Faltam auth e cadência agendada
      ponta a ponta.
- [x] **Code splitting**: `MapView` e `GrowthPage` em chunks próprios; principal
      caiu de ~649 kB para ~584 kB.
- [ ] **Métricas em SQL**: `firstHooksByLead` e funil varrem tudo em memória;
      migrar para agregação com índices quando a base crescer.
