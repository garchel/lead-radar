# Plano de Melhorias Prioritárias - LeadRadar AI

Este documento detalha as 3 melhorias prioritárias selecionadas para elevar a produtividade, conversão e experiência de prospecção de Landing Pages para negócios locais.

---

## 📌 1. Botão Direto para WhatsApp com Mensagem Personalizada
**Objetivo:** Permitir que o prospectador entre em contato imediato com a empresa com um clique, enviando uma mensagem pré-formatada e altamente persuasiva com o nome da empresa e diagnóstico.

- **Ação com 1-Clique:** Botão verde destacado de WhatsApp em cards, tabelas, modais e mapa.
- **Mensagem Otimizada com IA:** Preenchimento automático com saudação profissional, menção à nota no Google, ausência de site e oferta de protótipo de Landing Page sem compromisso.

---

## 📌 2. Funil de Vendas / Status de Prospecção (Mini-CRM)
**Objetivo:** Permitir que o usuário acompanhe e organize seus leads por fases de prospecção com persistência local (`localStorage`).

- **Estágios do Funil (Pipeline):**
  - *Novo Prospect*, *Contatado*, *Proposta Enviada*, *Em Negociação*, *Fechado (Cliente)* ou *Recusado*.
- **Visualização Kanban & Tabela CRM:**
  - Aba/Modo dedicada ao Pipeline para mover leads entre colunas ou alterar status com select rápido.
  - Indicadores de valor total do pipeline e taxa de conversão.

---

## 📌 5. Filtro Rápido por Presença Digital (Sem Site - Ouro | Apenas Instagram - Prata)
**Objetivo:** Facilitar a segmentação dos alvos mais lucrativos no mapeamento por nível de oportunidade digital.

- **Nível Ouro (Sem Site):** Empresas com alta reputação no Google Maps que não possuem nenhuma página própria (oportunidade máxima de fechamento).
- **Nível Prata (Apenas Instagram/Rede Social):** Empresas que possuem perfil em redes sociais mas dependem de Direct e não possuem Landing Page de conversão.
- **Seletor de Presença no Cabeçalho:** Chips/Botoes de seleção rápida de nível Ouro/Prata/Todos na barra de busca e visualização de dados.

---

## ✅ Estado de Implementação

As 3 melhorias priorizadas estão **implementadas**:

- **1. Botão WhatsApp com 1-clic + mensagem IA** — presente em cards, modais, CRM e dossiê.
- **2. Mini-CRM / Pipeline** — persistido em **SQLite** (banco compartilhado com o MCP/Hermes), com kanban/tabela e indicadores.
- **5. Filtro por presença digital (Ouro/Prata)** — seletor na busca e visão de dados.

> **Adição (Fase 2 do roadmap):** o agendador de prospecção periódica (`schedule_prospecting`) dispara jobs recorrentes via cron, com limite de **LPs/dia** e aprovação humana antes do deploy.

*Status de Implementação: ✅ Concluído 🚀*
