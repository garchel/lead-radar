# LeadRadar — Planejamento: Geração do Site via Agente de IA (GitHub)

> Status: 🔄 planejamento em discussão — **em parte implementado** (ver seção 10)
> Data: agosto/2026
> Objetivo deste doc: registrar a evolução planejada para não perder o raciocínio
> entre sessões. Este documento descreve **como queremos que seja** — ainda não é
> o comportamento atual do app.

---

## 1. Problema / motivação

Hoje o app gera o HTML de uma Landing Page por **template fixo + IA**
(`server/landingPage/generator.ts` → `generateLandingPageHtml`, alimentado pelo
`landingPageConcept` que a IA retorna em `analyzeLead`). O resultado é um HTML
genérico e pouco customizado.

**Decisão:** remover essa funcionalidade de "template que gera o HTML". Em vez
disso, o app deve **preparar/organizar as informações** sobre o cliente e
entregá-las para um **agente de IA de código** (Gemini / agente Hermes) que
**cria o produto do zero no GitHub** (cria o repositório, trabalha nele e faz
push/commit). O app não deve "codar sozinho"; ele alimenta o agente e acompanha.

---

## 2. Papéis das telas atuais (redefinição)

### 2.1 Dashboard de Leads (CRM / pipeline)
- **NÃO gera o site.**
- Serve **apenas** para acompanhar as etapas de negociação/venda da Landing Page:
  `prospect → contacted → negotiating → em_desenvolvimento → closed → declined`
  (encontrar cliente → conversar → fechar contrato → desenvolver → finalizar).
- Nenhuma geração de HTML parte daqui.

### 2.2 Kanban de Projetos
- É o local onde o site **realmente passa a ser desenvolvido**.
- Etapas:
  - **briefing** → apenas coleta de informações (Typeform + PDF de validação)
  - **copywriting** → apenas coleta de informações (textos/voz)
  - **design** → apenas coleta de informações (referências/estilo/paleta)
  - **wireframe** → o agente monta a **estrutura da página** para aprovação do
    cliente: fundo **preto ou branco** (o oposto da cor da fonte do guia de
    design escolhido), **textos reais do copy** posicionados nos lugares
    adequados e **componentes/assets em blocos de linha pontilhada**
    (placeholders nomeados). O Vitor envia o link ao cliente, que revisa e
    decide se quer alterar copy/estrutura **antes de qualquer código**.
    Aprovação do cliente é **gate obrigatório** para avançar.
  - **desenvolvimento** → **é aqui que o HTML/código começa a ser desenvolvido**
    pelo agente de IA
  - **revisao** → validação
  - **deploy** → publicação
- **Regra:** briefing, copywriting, design e wireframe **não geram código de
  produção**. Só a etapa **desenvolvimento** dispara a construção real
  (o wireframe é HTML estático de aprovação, não o produto).

---

## 3. O que o app entrega para o agente de IA

O app reúne as informações adquiridas ao longo do funil e do projeto
(briefing/Typeform, conversa/notas com o cliente, copy produzida, referências de
design e dados do lead) e fornece ao agente de duas formas:

1. **Prompt otimizado (modo manual):**
   O app gera um **prompt pronto para copiar e colar** explicando as informações
   do cliente e o que precisa ser feito para codar a Landing Page (negócio,
   seções, copy, CTA, paleta, dados de contato/WhatsApp etc.). O usuário cola
   esse prompt no agente (Gemini/Hermes) e pede que ele code a página.

2. **Tool MCP (modo agente):**
   O app expõe uma **tool MCP** para o agente Hermes buscar os dados
   programaticamente, **da mesma forma que o usuário receberia**. Ao receber os
   dados, o agente deve **perceber que deve implementar a Landing Page** e, ao
   concluir, **fazer o push/commit** para que o projeto avance para a próxima
   etapa (revisão/deploy).

### 3.1 O "kit de dados" do projeto

**Decisão (agosto/2026):** as duas formas (prompt manual e tool MCP) compartilham
o mesmo **kit de dados** do projeto. O kit é montado pelo app com **todas as
informações relevantes do cliente** adquiridas/montadas nas etapas anteriores e
que sirvam ao desenvolvimento da LP:
- dados do lead (nome, cidade, telefone/WhatsApp, avaliações/reviews, categoria);
- briefing/Typeform;
- copy produzida na etapa **copywriting**;
- referências/notas de design da etapa **design**.

→ O app seleciona/combina o que é relevante para o projeto; o agente recebe esse
kit e (idealmente) **cria a copy/design final** a partir dele quando ainda não
houver anotações específicas.


---

## 4. Ciclo de vida do repositório GitHub

- Um **repo novo por projeto/cliente**, criado quando a etapa **desenvolvimento**
  começa.
- Se o projeto for **reaberto/retomado**, o agente **reusa o mesmo repositório**
  (continua trabalhando em cima do que já existe), em vez de criar um novo.

---

## 5. Como o app detecta que o agente terminou + aprovação humana

**Decisão (agosto/2026):**
- O **ser humano dá a palavra final** sobre se o código está pronto.
- O agente, **ao codar e a cada interação**, envia uma **mensagem de notificação**
  ao usuário. O agente Hermes consegue conectar em **Discord ou Telegram** — o
  canal de notificação será via um desses meios.
- Além da notificação por mensagem, o **kanban** continua refletindo o avanço
  (o usuário também pode avançar manualmente).

Fluxo:
1. Agente desenvolve no repositório e, **a cada iteração**, envia mensagem
   (Discord/Telegram) com o andamento/progresso.
2. Quando o agente entregar o código, o app recebe a notificação (tool MCP
   `submit_project_code` com URL/status).
3. **O usuário revisa e dá a palavra final** (aprova ou pede ajuste) antes de
   avançar da etapa **desenvolvimento** para **revisão/preview/deploy**.

---

## 6. Preview antes do deploy

**Decisão (agosto/2026):** o fluxo deve ter um **preview com URL temporária /
GitHub Pages**, para o usuário e o cliente validarem o que o agente publicou
antes do deploy final.
- Quando o agente entrega o código na etapa desenvolvimento, o app gera/mostra
  um **preview acessível** (URL temporária ou GitHub Pages).
- A validação desse preview alimenta a etapa **revisão**; só após aprovação
  humana é feito o **deploy** final.

---

## 7. Autenticação GitHub

- **Ainda não definido.** Pontos possíveis: token do app/agente no `.env`
  (`GITHUB_TOKEN`) para todos os projetos; credencial por cliente/repo; ou o
  agente usar as credenciais dele (app não gerencia token). → manter como aberto.

---

## 8. Perguntas / pontos em aberto (para refinar o planejamento)


- [x] **Papel das telas** — definido (seção 2).
- [x] **Forma de entrega ao agente** — prompt otimizado (manual) **e** tool MCP
      (agente Hermes) — *implementado*.
- [x] **Ciclo de vida do repo** — novo por projeto/cliente; reusa o mesmo ao
      reabrir/retomar.
- [x] **Como o app detecta término + aprovação** — humano dá a palavra final;
      agente notifica a cada iteração via **Discord/Telegram** (seção 5).
- [x] **Preview antes do deploy** — URL temporária / GitHub Pages para validação
      (seção 6) — *implementado* (`previewUrl` no projeto).
- [x] **Conteúdo do "kit de dados"/prompt** — definido (seção 3.1): dados do lead
      + briefing + copy + design, tudo que for relevante ao projeto — *implementado*.
- [x] **Relação prompt × tool MCP** — compartilham o mesmo "kit de dados" do
      projeto (`buildProjectDevPrompt` e tool `get_project_dev_kit` usam `buildProjectDevKit`) — *implementado*.
- [x] **Tool(s) MCP novas** — `get_project_dev_kit`, `submit_project_code` e `approve_project_code` — *implementado*.
- [x] **Vínculo projeto ↔ repositório** — `githubRepoUrl`/`repoOwner`/`repoName` persistidos no projeto — *implementado* (reuso ao retomar pelo mesmo campo).
- [ ] **O que será removido do código** do fluxo de template fixo (`generateLandingPageHtml`) — *ainda não removido*; o fluxo novo coexiste.
- [ ] **Canal de notificação definitivo** — Discord ou Telegram? (config exata +
      credenciais).
- [ ] **Autenticação do GitHub** (quem fornece o token — ver seção 7).

---

## 10. Estado da implementação (agosto/2026)

Parte planejada já implementada e testada, mantendo o fluxo legado coexistindo:

**Backend**
- **"Kit de dados" + prompt** (`server/projects/devKit.ts`):
  - `buildProjectDevKit(projectId)` monta lead + briefing/Typeform + copy + design
    + conceito de IA + repositório (§3.1).
  - `buildProjectDevPrompt(projectId)` gera o **prompt manual** pronto para colar.
  - `parseRepoUrl` interpreta URLs https/ssh do GitHub.
  - `setProjectDevRepo`, `submitProjectCode`, `updateProjectDevMessage`,
    `approveProjectCode`, `resetProjectDev`.
- **Persistência** — novos campos em `Project`: `githubRepoUrl`, `repoOwner`,
  `repoName`, `previewUrl`, `devStatus`, `devMessage` (schema + migrations + store).
- **REST** (`server/routes/projectRoutes.ts`): `GET /dev-kit`, `POST /dev-repo`,
  `/submit-code`, `/dev-message`, `/dev-approve`, `/dev-reset`.
- **Tools MCP** (`server/mcpServer.ts`): `get_project_dev_kit`,
  `submit_project_code`, `approve_project_code` (registrados na listagem).

**Frontend**
- Painel "Agente de IA de código" na etapa **desenvolvimento** do modal de
  projeto: gerar/copiar prompt, salvar repositório, registrar entrega, aprovar
  código e abrir preview.

**Testes**: `tests/devKit.test.ts` (parse de repo URL + kit + prompt + entrega/aprovação).

**Pendências (ainda em aberto)** — ver §8: remoção efetiva do gerador de template
fixo, canal de notificação (Discord/Telegram) e autenticação GitHub.

---

## 9. Próximos passos

1. Fechar as respostas das perguntas acima com o time/autor.
2. Consolidar este doc com as decisões.
3. Detalhar o desenho técnico (modelo de dados, endpoints, tools MCP).
4. Só então partir para implementação (fora do escopo atual).

