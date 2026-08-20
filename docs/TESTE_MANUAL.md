# LeadRadar AI — Roteiro de Teste Manual

Este documento descreve como testar manualmente cada etapa do LeadRadar AI:

```text
buscar → qualificar → salvar → analisar → abordar → atualizar CRM
→ criar Landing Page → aprovar → publicar → monitorar → automatizar via Hermes
```

## 1. Pré-requisitos

- Node.js instalado.
- Dependências instaladas com `npm install`.
- Uma chave `GEMINI_API_KEY` para testar busca e análise reais com IA.
- PowerShell ou outro terminal disponível.

O servidor carrega as variáveis do arquivo `.env`. Apesar de alguns documentos antigos mencionarem `.env.local`, o código atual usa `dotenv.config()` e espera `.env`.

Exemplo de configuração:

```env
GEMINI_API_KEY=sua-chave-do-gemini
GEMINI_MODEL=gemini-flash-latest

# Recomendado durante os primeiros testes manuais
LEADRADAR_SCHEDULER=off

# Opcionais
GOOGLE_MAPS_PLATFORM_KEY=
HUNTER_API_KEY=
NETLIFY_AUTH_TOKEN=
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
JOB_WEBHOOK_URL=
MCP_API_TOKEN=
LEADRADAR_MAX_LPS_PER_DAY=5
LEADRADAR_MAX_LEADS_PER_RUN=5
```

> O app não simula contatos nem deploys. Para testar envio/publicação, configure as credenciais reais correspondentes; sem elas, a operação deve falhar explicitamente.

## 2. Iniciar a aplicação

No PowerShell:

```powershell
cd C:\Users\paulo\OneDrive\Documentos\lead-radar
npm install
npm run dev
```

Abra a aplicação no navegador:

```text
http://localhost:3000
```

### Resultado esperado ao iniciar

Uma saída como esta indica que o servidor iniciou corretamente:

```text
> react-example@0.0.0 dev
> tsx server.ts

◇ injected env (15) from .env
[Scheduler] 0 agendamento(s) ativo(s). Limite de LPs/dia: 5.
Server listening on http://0.0.0.0:3000
```

A mensagem significa:

- `injected env (15) from .env`: variáveis do `.env` foram carregadas.
- `0 agendamento(s) ativo(s)`: não existem agendamentos registrados no banco.
- `Limite de LPs/dia: 5`: o guardrail padrão de autonomia está ativo.
- `Server listening`: a aplicação está disponível na porta `3000`.

Durante os testes manuais, é recomendado usar `LEADRADAR_SCHEDULER=off`. Depois de alterar o `.env`, reinicie o servidor com `Ctrl+C` e execute novamente `npm run dev`.

## 3. Testar saúde da aplicação e MCP

### 3.1 Health check

```powershell
curl.exe http://localhost:3000/api/health
```

Resultado esperado:

```json
{
  "status": "ok",
  "hasGeminiKey": true,
  "hasGoogleMapsKey": false
}
```

O valor de `hasGoogleMapsKey` pode ser `false` se a integração não estiver configurada. Isso não impede os primeiros testes de busca com Gemini.

### 3.2 Metadados do MCP

```powershell
curl.exe http://localhost:3000/api/mcp/info
```

Valide se a resposta contém:

- `status: "online"`;
- endpoint `/api/mcp/sse`;
- endpoint `/api/mcp/messages`;
- as ferramentas MCP disponíveis;
- os recursos MCP;
- o prompt `autopilot_prospecting`.

### 3.3 Teste pela interface

1. Clique em **MCP Server** no menu lateral.
2. Abra a aba **Testar JSON-RPC**.
3. Clique em **Executar Teste /api/mcp/info**.
4. Confirme que o JSON dos metadados aparece na tela.

Esse teste valida a conexão básica e os metadados. A execução de ferramentas MCP será testada posteriormente com o Hermes Agent.

## 4. Testar descoberta de leads

Na interface:

1. Acesse **Busca de Região**.
2. Selecione uma cidade, por exemplo `Campinas`.
3. Selecione uma categoria, por exemplo `Dentista / Clínica Odontológica`.
4. Clique em **Sem Site — Ouro**.
5. Clique em **Filtrar e Mapear Região**.
6. Repita com **Apenas Instagram — Prata** e **Todos**.

Valide:

- cards de empresas aparecem;
- nome, categoria, endereço, telefone e avaliação são exibidos;
- o badge de presença digital está correto;
- o score de oportunidade aparece;
- a ordenação por score, avaliação, reviews e nome funciona;
- a visualização em grade funciona;
- a visualização em mapa funciona quando disponível;
- o botão **Exportar CSV** gera um arquivo.

### Teste direto da API de busca

```powershell
$body = @{
  location = "Campinas"
  state = "SP"
  category = "Dentista / Clínica Odontológica"
  filterNoWebsiteOnly = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/search-businesses `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Com `GEMINI_API_KEY` configurada, a resposta deve conter dados reais e `success: true`.

Sem a chave, a interface pode apresentar dados locais de demonstração, mas a API real de busca não deve ser considerada aprovada.

## 5. Testar salvar leads e o CRM

Na tela de busca:

1. Clique em **Salvar** em um card.
2. Confira o contador de leads no menu lateral.
3. Acesse **Dashboard de Leads**.
4. Confirme que o lead aparece em **Novos Prospects**.
5. Recarregue a página.
6. Confirme que o lead continua presente.

### Conferir os dados persistidos

```powershell
Invoke-RestMethod http://localhost:3000/api/leads
```

Resumo do pipeline:

```powershell
Invoke-RestMethod http://localhost:3000/api/pipeline
```

No CRM, teste cada mudança:

- `Novos Prospects`;
- `Contato Feito`;
- `Em Negociação`;
- `Fechado / Ganho`;
- `Perdido`.

Também teste:

- adicionar uma anotação;
- salvar a anotação;
- exportar o pipeline em CSV;
- remover o lead;
- recarregar a aplicação.

Os status internos usados pelo banco são:

```text
prospect
contacted
negotiating
closed
declined
```

A interface usa `localStorage` como cache, mas sincroniza os leads com o banco compartilhado por meio de `/api/leads`. A confirmação principal deve ser feita consultando a API.

## 6. Testar adição manual de lead

1. Clique em **Adicionar Lead**.
2. Preencha nome, categoria, cidade, endereço, telefone e demais campos.
3. Adicione uma anotação inicial.
4. Clique em **Adicionar Lead**.
5. Confirme que o lead aparece no CRM.
6. Confirme que a análise do lead é aberta.
7. Recarregue a página e confira a persistência.

Esse é o melhor caminho para criar um lead determinístico sem depender da busca do Gemini.

## 7. Testar análise de IA

Em um card de lead, clique em **Pitch IA**.

Valide:

- estado de carregamento;
- score de oportunidade;
- potencial financeiro;
- urgência;
- recursos faltantes;
- justificativa comercial;
- vantagem sobre concorrentes;
- pitch de WhatsApp;
- pitch de e-mail;
- roteiro de ligação;
- conceito da Landing Page.

Teste as abas:

- **WhatsApp**;
- **E-mail**;
- **Cold Call**;
- **Protótipo**.

Na aba WhatsApp:

1. Clique em **Copiar Script**.
2. Confirme a mensagem `Copiado!`.
3. Clique em **Abrir WhatsApp Web com Mensagem**.
4. Verifique se o link contém o telefone e a mensagem codificada.

Sem `GEMINI_API_KEY`, a análise deve falhar explicitamente. Uma tela vazia ou resposta estática não comprova a integração real com a IA.

## 8. Validar falhas de contato sem enviar mensagens reais

Não configure `WHATSAPP_API_URL` nem `SMTP_HOST` no primeiro teste.

Obtenha o ID de um lead:

```powershell
$leads = Invoke-RestMethod http://localhost:3000/api/leads
$leads.leads
```

Tente um contato sem configurar o provedor. A chamada não deve enviar nem simular uma mensagem:

```powershell
$contactBody = @{
  channel = "whatsapp"
  message = "Mensagem de teste do LeadRadar"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/leads/SEU_LEAD_ID/contact `
  -Method Post `
  -ContentType "application/json" `
  -Body $contactBody
```

Resultado esperado: HTTP 502, com `success: false`, `status: "failed"` e uma mensagem informando que nenhum contato foi enviado.

Consulte o histórico:

```powershell
Invoke-RestMethod http://localhost:3000/api/communications
```

Teste também:

- lead sem telefone usando WhatsApp: deve retornar `failed`;
- lead com e-mail sem SMTP/SMTP_FROM: deve retornar `failed`;
- lead sem e-mail usando e-mail: deve retornar `failed`.

> Configure integrações reais somente quando estiver pronto para enviar mensagens para clientes reais.

## 9. Validar histórico e recontato

Depois de um envio real, o lead fica com interação pendente. Registre uma resposta negativa:

```powershell
$outcomeBody = @{ outcome = "negative"; notes = "Sem orçamento neste momento" } | ConvertTo-Json
Invoke-RestMethod `
  -Uri http://localhost:3000/api/leads/SEU_LEAD_ID/interactions/outcome `
  -Method Post `
  -ContentType "application/json" `
  -Body $outcomeBody
```

O retorno deve informar `nextContactAt` aproximadamente 30 dias depois. Antes dessa data, `/api/leads/:id/contact` deve retornar HTTP 409 e não enviar mensagem. Os recontatos autorizados podem ser consultados em:

```powershell
Invoke-RestMethod http://localhost:3000/api/follow-ups/due
```

O app não envia recontatos automaticamente: a fila deve ser revisada antes de cada novo contato.

## 10. Testar fila assíncrona

Na interface:

1. Clique em **Fila Assíncrona**.
2. Abra **Nova Prospecção em Lote**.
3. Informe uma cidade, como `Campinas`.
4. Selecione estado e categoria.
5. Mantenha o filtro Ouro/Prata ativado.
6. Clique em **Enfileirar Job no Worker**.

Observe a transição:

```text
pending → processing → completed
```

Também pode ocorrer `failed` se uma integração externa estiver indisponível.

Valide:

- percentual de progresso;
- logs do worker;
- resultado do job;
- quantidade de leads encontrados;
- botão para importar os resultados para o CRM.

### Consultar a fila pela API

```powershell
Invoke-RestMethod http://localhost:3000/api/jobs
```

Consultar um job específico:

```powershell
Invoke-RestMethod http://localhost:3000/api/jobs/SEU_JOB_ID
```

Cancelar um job pendente ou em processamento:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/jobs/SEU_JOB_ID/cancel `
  -Method Post
```

## 10. Testar monitoramento e eventos em tempo real

1. Abra a aba **Monitoramento**.
2. Deixe a tela aberta.
3. Em outro terminal, crie um lead ou um job.
4. Confirme se o painel atualiza automaticamente.

Para observar os eventos SSE diretamente:

```powershell
curl.exe -N http://localhost:3000/api/events
```

O painel deve exibir:

- total de jobs;
- jobs processando;
- jobs pendentes;
- jobs concluídos;
- jobs falhos;
- logs detalhados;
- Landing Pages geradas;
- indicador **Tempo real**.

## 11. Testar criação de Landing Page

### 11.1 Criar um lead de teste

```powershell
$leadBody = @{
  id = "manual-test-lead-001"
  name = "Clínica Teste Campinas"
  category = "Clínica de Estética"
  city = "Campinas"
  state = "SP"
  phone = "(19) 99999-8888"
  rating = 4.9
  reviewsCount = 42
  websiteStatus = "none"
  pipelineStatus = "prospect"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/leads `
  -Method Post `
  -ContentType "application/json" `
  -Body $leadBody
```

### 11.2 Criar a Landing Page

```powershell
$lpBody = @{
  leadId = "manual-test-lead-001"
  concept = @{
    heroHeadline = "Transforme sua beleza com atendimento especializado"
    heroSubheadline = "Agende seu horário diretamente pelo WhatsApp"
    callToAction = "Agendar agora"
    recommendedSections = @("Serviços", "Depoimentos", "Contato")
    keySellingPoints = @("Atendimento rápido", "Equipe especializada")
  }
} | ConvertTo-Json -Depth 5

$lp = Invoke-RestMethod `
  -Uri http://localhost:3000/api/landing-pages `
  -Method Post `
  -ContentType "application/json" `
  -Body $lpBody

$lp.landingPage
```

Estado esperado:

```text
status: aguardando_aprovacao
stage: rascunho
```

### 11.3 Confirmar o guardrail de aprovação

Tente publicar antes da aprovação:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/landing-pages/ID_DA_LP/deploy `
  -Method Post
```

A chamada deve falhar informando que a Landing Page ainda não foi aprovada.

### 11.4 Aprovar a Landing Page

```powershell
$approved = Invoke-RestMethod `
  -Uri http://localhost:3000/api/landing-pages/ID_DA_LP/approve `
  -Method Post

$approved.landingPage
```

Estado esperado:

```text
status: aprovada
stage: deploy
```

### 11.5 Publicar localmente

```powershell
$deployed = Invoke-RestMethod `
  -Uri http://localhost:3000/api/landing-pages/ID_DA_LP/deploy `
  -Method Post

$deployed.landingPage
```

Sem `NETLIFY_AUTH_TOKEN`, o sistema usa o deploy local. Abra a URL retornada, normalmente:

```text
http://localhost:3000/landing-pages/slug-da-empresa
```

Estado esperado:

```text
status: publicada
stage: publicado
```

### 11.6 Testar rejeição

Crie outra Landing Page e execute:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/landing-pages/OUTRA_LP_ID/reject `
  -Method Post
```

O estado esperado é:

```text
status: rejeitada
```

## 12. Testar o job de criação de Landing Page

Esse teste valida fila, monitoramento e criação de LP simultaneamente:

```powershell
$jobBody = @{
  type = "landing_page_creation"
  title = "Criar LP Clínica Teste"
  payload = @{
    leadId = "manual-test-lead-001"
    autoDeploy = $false
    concept = @{
      heroHeadline = "Clínica Teste Campinas"
      callToAction = "Falar no WhatsApp"
    }
  }
} | ConvertTo-Json -Depth 5

$job = Invoke-RestMethod `
  -Uri http://localhost:3000/api/jobs `
  -Method Post `
  -ContentType "application/json" `
  -Body $jobBody

$job.job
```

Consulte o job até chegar a `completed`:

```powershell
Invoke-RestMethod http://localhost:3000/api/jobs/SEU_JOB_ID
```

Depois consulte as Landing Pages:

```powershell
Invoke-RestMethod http://localhost:3000/api/landing-pages
```

A LP deve existir em `aguardando_aprovacao`, aguardando a ação humana.

## 13. Testar agendamentos

Para testar o scheduler, altere o `.env`:

```env
LEADRADAR_SCHEDULER=on
LEADRADAR_MAX_LPS_PER_DAY=5
LEADRADAR_MAX_LEADS_PER_RUN=5
```

Reinicie o servidor.

Na aba **Monitoramento**:

1. Clique em **Novo** na seção de agendamentos.
2. Informe um nome, como `Teste Campinas`.
3. Use uma expressão rápida:

```text
*/15 * * * * *
```

4. Selecione `Autopilot` ou `Batch`.
5. Informe `Campinas`.
6. Salve.
7. Aguarde a próxima execução.

Valide:

- o agendamento aparece como `ativo`;
- `nextRunAt` é preenchido;
- depois da execução, `lastRunAt` é preenchido;
- um job `[Agendado] ...` é criado;
- o job aparece no monitoramento.

A API equivalente é:

```powershell
$scheduleBody = @{
  name = "Teste Campinas"
  cron = "*/15 * * * * *"
  jobType = "batch_prospecting"
  payload = @{
    locations = @("Campinas")
    state = "SP"
    categories = @("Dentista / Clínica Odontológica")
    filterNoWebsiteOnly = $true
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://localhost:3000/api/schedules `
  -Method Post `
  -ContentType "application/json" `
  -Body $scheduleBody
```

Depois do teste, pause ou remova o agendamento para evitar execuções inesperadas.

## 14. Testar o MCP com Hermes Agent

O arquivo `hermes_mcp_config.json` local aponta para:

```text
http://localhost:3000/api/mcp/sse
```

Com o servidor rodando, execute um teste seguro:

```powershell
hermes agent `
  --mcp-config .\hermes_mcp_config.json `
  --prompt "Use search_leads para buscar dentistas em Campinas SP com presenceFilter gold. Analise apenas o melhor lead e gere o pitch de WhatsApp. Não envie mensagens e não publique nenhuma Landing Page."
```

Esse teste deve exercitar:

- `search_leads`;
- `analyze_lead`;
- `generate_whatsapp_pitch`.

Depois teste a criação de Landing Pages sem deploy:

```powershell
hermes agent `
  --mcp-config .\hermes_mcp_config.json `
  --prompt "Execute autopilot_prospecting para clínicas de estética em Campinas SP. Busque leads Ouro, analise os três melhores, gere os pitches, crie as Landing Pages aguardando aprovação e não faça deploy."
```

Após a execução, confira o estado no servidor:

```powershell
Invoke-RestMethod http://localhost:3000/api/leads
Invoke-RestMethod http://localhost:3000/api/jobs
Invoke-RestMethod http://localhost:3000/api/landing-pages
```

Teste o guardrail explicitamente:

```text
Crie uma Landing Page para o lead manual-test-lead-001 usando create_landing_page. Não use autoDeploy. Consulte o job e a Landing Page. Tente deploy_landing_page sem aprovação e confirme que a operação é bloqueada.
```

Depois aprove e publique:

```text
Aprove a Landing Page usando approve_landing_page e só então execute deploy_landing_page.
```

## 15. Autenticação opcional do MCP

Se `MCP_API_TOKEN` estiver configurado, o endpoint exige um Bearer token:

```powershell
curl.exe -i http://localhost:3000/api/mcp/info
```

A chamada sem token deve retornar `401`.

Com token:

```powershell
curl.exe -i `
  -H "Authorization: Bearer SEU_TOKEN" `
  http://localhost:3000/api/mcp/info
```

O cliente MCP utilizado deve conseguir enviar o mesmo header de autorização para o endpoint SSE e para as mensagens MCP.

## 16. Diferenças e limitações atuais

1. `update_crm_status` no MCP exige `businessName`, além de `leadId`, `status` e `notes`.

2. `list_leads` usa os status internos em inglês:

   ```text
   prospect, contacted, negotiating, closed, declined
   ```

3. O recurso MCP `leads://pipeline` atualmente retorna um resumo estático. Para validar o pipeline real, use:

   ```text
   GET /api/pipeline
   ```

   ou `list_leads`.

4. `generate_whatsapp_pitch` apenas gera o link. Ele não envia a mensagem.

5. `send_contact` retorna falha quando WhatsApp ou SMTP/SMTP_FROM não estão configurados; nunca marca o lead como contatado nessa situação.

6. O deploy exige `NETLIFY_AUTH_TOKEN`; sem a credencial, a publicação retorna falha explícita.

7. A análise aberta pela interface pode não ser persistida no campo `analysis` do banco. O autopilot persiste a análise, o que é necessário para o `export_dossier` via MCP.

## 17. Validação automatizada

Além dos testes manuais, execute:

```powershell
npm test
npm run lint
npm run build
```

A validação atual do projeto possui testes para:

- configuração;
- persistência;
- contatos;
- enriquecimento;
- geração de Landing Pages;
- ciclo de vida de Landing Pages;
- dossiê;
- scheduler.

Resultado esperado:

```text
37 testes aprovados
lint sem erros
build concluído com sucesso
```
