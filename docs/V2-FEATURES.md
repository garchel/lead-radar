# LeadRadar V2 — Features planejadas

## Objetivo
Evoluir o LeadRadar de uma ferramenta de prospecção manual para uma **plataforma autônoma de captação, negociação e entrega**, com conversação real, integração com Telegram e automação de follow-up.

---

## 🗣️ Conversação real com leads
- **WhatsApp (via WhatsApp Cloud API / Evolution API)**  
  - Envio efetivo de mensagens (não apenas link wa.me).  
  - Recebimento de respostas via webhook.  
  - Atualização automática do CRM com base nas interações.  
- **E-mail** (já existe, mas melhorar com templates e rastreamento de abertura).  
- **Histórico completo de conversas** por lead (armazenado no SQLite).  
- **Interpretação de intenção** pelo Hermes (ex: "quero saber mais", "quanto custa", "não tenho interesse").

---

## 🤖 Bot do Telegram para acompanhamento
- O usuário poderá interagir com um bot no Telegram para:
  - Consultar o status de leads e jobs.
  - Visualizar prévias das landing pages em desenvolvimento.
  - Aprovar ou rejeitar LPs.
  - Receber notificações de novos leads, respostas, ou jobs concluídos.
- Integração com a API do Telegram (webhook ou polling).

---

## 📊 Dashboard de operações
- Visão geral em tempo real:
  - Leads por estágio (funil).
  - Landing pages criadas, aprovadas, publicadas.
  - Conversas ativas e taxa de resposta.
  - Jobs em execução e histórico.
- Gráficos com Chart.js ou similar.

---

## 🧩 Melhorias no Kanban
- Quadro interativo com colunas:
  - `Novos` → `Contatado` → `Negociação` → `Fechado` → `Perdido`
- Arrastar cards para atualizar estágio (integrado com `update_crm_status`).
- Filtros por categoria, cidade, data.

---

## 🚀 Deploy para produção (Netlify / Vercel)
- Publicação automática das landing pages aprovadas.
- Domínio próprio (configurável).
- Versão pública da LP com analytics básico.

---

## 🔁 Follow-up inteligente
- Agendamento de recontatos baseado em regras:
  - Ex: se não respondeu em 2 dias, enviar lembrete.
  - Se respondeu com interesse, agendar call ou enviar proposta.
- Decisão assistida por IA (Hermes avalia histórico e sugere próximo passo).

---

## 🔔 Notificações em tempo real
- Via Telegram ou e-mail:
  - Novo lead encontrado.
  - Lead respondeu.
  - LP pronta para aprovação.
  - Job falhou ou concluiu.

---

## 🧪 Integração com ferramentas externas (futuro)
- Google Calendar para agendamento de calls.
- Stripe para pagamento de propostas.
- CRM externo (ex: Pipedrive) via API.

---

## 📝 Briefing Typeform determinístico (implementado — V1)
- **Como funciona:** cada projeto gera um `typeform_token` único (coluna `typeform_token`); o card do projeto tem o botão **"Copiar link de briefing"**, que monta `https://form.typeform.com/to/{FORM_ID}?project_token={TOKEN}` e copia para o clipboard. O usuário cola e envia ao cliente (WhatsApp/e-mail).
- **Atribuição automática:** o sync do Typeform casa a resposta pelo hidden field `project_token` (prioridade máxima, depois `project_id`/`projectId`, `lead_id`/`leadId` e, por fim, nome da empresa). Nada manual na montagem de URL.
- **Rota:** `POST /api/projects/:id/typeform-link` (gera o token se ausente — cobre projetos legados — e devolve `{ token, url }`).

---

## 🤖 Envio automático do link de briefing (V2 — aguardando implementação)
- Quando um lead **entra em "Em Desenvolvimento"** (ou quando o projeto é criado), o app envia **automaticamente** o link personalizado do briefing ao cliente, via canal de contato configurado:
  - **WhatsApp** — mensagem via `WHATSAPP_API_URL` (reuso da infra do `send_contact`): *"Olá, para iniciarmos, preencha seu briefing: {link}"*.
  - **E-mail** — e-mail transacional via SMTP (também já existente).
- O link já carrega o `project_token` do projeto criado — zero trabalho manual.
- Quando o cliente responde o formulário, o sync importa o briefing **direto no card certo**.
- **Pendências a resolver:**
  - Definir gatilho exato (entrada em Em Desenvolvimento vs. criação do projeto; ou ambos com configuração).
  - Mapear para o fluxo de envio existente (`server/contact/` + fila/`send_contact`), garantindo deduplicação de envios.
  - (Opcional) Webhook do Typeform para sync em tempo real; (opcional) auto-criação de projeto quando a resposta vier com `lead_id`.

---

## 🛠️ Implementação sugerida (ordem de prioridade)
1. **Kanban visual** (já possível agora).
2. **Telegram bot** (fácil, gratuito, entrega rápida).
3. **WhatsApp Cloud API** (gratuito até 1k conversas/mês).
4. **Dashboard** (médio esforço, alto valor).
5. **Follow-up inteligente** (depende de conversação).
6. **Deploy Netlify/Vercel** (médio esforço).
7. **Notificações** (segue bot do Telegram).

---

*Última atualização: 20/08/2026*