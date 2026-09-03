# BRIEFING + COPY — Achei Ferragens

> LP: `sites/achei-ferragens/` · Lead do CRM (score 100, sem site, 4.5★ / 123 avaliações)
> **Briefing IMAGINADO pelo agente** (autorizado pelo Vitor) — itens marcados com ⚠️ precisam de
> confirmação com o cliente antes do deploy. Nada aqui foi respondido pelo cliente ainda.

## 1. Briefing imaginado

| Pergunta | Resposta assumida |
|---|---|
| Nome fantasia | Achei Ferragens |
| O que vende | Ferragens e materiais: ferramentas, elétrica, hidráulica, pintura, fixação e utilidades |
| Endereço | Quadra 61 Rua 01 Lote 13, Jardim Oriente — Valparaíso de Goiás/GO (dado real do CRM) |
| Telefone/WhatsApp | (61) 3627-9347 (dado real do CRM) → `wa.me/556136279347` |
| Horário ⚠️ | Seg–Sex 8h–18h · Sáb 8h–12h |
| Área de atendimento ⚠️ | Valparaíso de Goiás + Entorno (Novo Gama, Cidade Ocidental) |
| Entrega local ⚠️ | Sim, para a região (a confirmar taxa/prazo) |
| Diferencial ⚠️ | Tudo para obra e reparo num só lugar + preço justo + atendimento de vizinho |
| Objetivo da página | Orçamento rápido pelo WhatsApp (ligação como secundário) |
| Prova social real | 4.5★ em 123 avaliações no Google (dado real do CRM) |
| Instagram/site | Nenhum — a LP é a primeira presença digital |

## 2. Decisões de produção

- **Design:** `design/caldera.md` — industrial bold (Ember `#fc5000`, Pumice `#e2e2df`,
  Limestone `#f7f6f2`, Sulfur `#f5f28e`, Plasma `#524ae9` só no halftone do hero).
  Substitutos Google Fonts: **Anton** (display) + **Inter 500** (corpo, só Medium).
- **Efeitos (2, dentro do limite):** **03** loop-ambient no hero (atmosfera da loja) +
  **05** count-up nos stats (123 avaliações · 4,5 nota · 6 dias/semana).
- **Wireframe:** `wireframe.html` — fundo branco (fonte do guia é escura), textos reais,
  assets em blocos pontilhados, efeitos só etiquetados. **GATE:** Vitor envia ao cliente,
  ajustes voltam ao wireframe, não ao código.

## 3. Copy final (espelha `index.html` seção por seção)

1. **Nav:** Categorias · Por que a Achei · Como funciona · Avaliações + CTA “Chamar no WhatsApp”
2. **Hero** — tag: `Jardim Oriente · Valparaíso de Goiás`
   H1: `TUDO PARA SUA OBRA, NUM SÓ LUGAR`
   Sub: `Ferramentas, elétrica, hidráulica, pintura e fixação — com preço justo e
   atendimento de quem conhece a obra. Chame no WhatsApp e receba o orçamento rapidinho.`
   CTAs: `Chamar no WhatsApp` / `Ver categorias`
   Prova: `★★★★★ 4,5 · 123 avaliações no Google`
3. **Stats (05):** `123` avaliações no Google · `4,5` nota média · `6` dias por semana
4. **Categorias:** Ferramentas / Elétrica / Hidráulica / Pintura / Fixação e parafusos / Utilidades —
   cada card: o que tem + exemplo + mini-CTA “Pedir pelo WhatsApp”
5. **Por que a Achei:** Tudo num lugar · Preço justo · Atendimento de vizinho · Perto de você
6. **Como funciona:** 1 Chame no WhatsApp → 2 Receba o orçamento → 3 Retire na loja ou receba
7. **Avaliações:** 3 depoimentos ilustrativos ⚠️ (trocar por reais com autorização — ver ASSETS_PROMPT)
8. **Orçamento (form → WhatsApp):** nome + WhatsApp + categoria + mensagem → deep-link `wa.me`
9. **CTA final:** `Precisou, achou.` + botão WhatsApp
10. **Footer:** endereço, horário ⚠️, telefone, link Google Maps, nota LGPD
