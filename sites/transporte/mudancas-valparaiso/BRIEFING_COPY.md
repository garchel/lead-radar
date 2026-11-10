# BRIEFING + COPY — Mudanças Valparaíso

> LP: `sites/transporte/mudancas-valparaiso/` · Lead real do CRM: "Transportadora de mudanças Valparaiso de Goiás"
> (score 100, sem site, 4,8★ / 25 avaliações). **Fluxo de design: skill taste v2 (design-taste-frontend)**
> — esta LP não usa guia refero; estética vem dos dials + regras anti-slop da taste v2.
> **Briefing IMAGINADO** — itens ⚠️ dependem de confirmação com o cliente.

## 1. Briefing imaginado

| Pergunta | Resposta assumida |
|---|---|
| Nome fantasia | Mudanças Valparaíso (nome curto p/ LP; razão social é "Transportadora de mudanças Valparaiso de Goiás") |
| O que faz | Mudanças residenciais e comerciais, embalagem, montagem/desmontagem de móveis, itens especiais |
| Endereço | R. Vinte e Dois, Quadra 08 - Casa 14, Jd. Novo Oriente, Valparaíso de Goiás/GO (real do CRM) |
| Telefone/WhatsApp | (61) 99502-8647 (real do CRM) → `wa.me/5561995028647` |
| Área de atendimento ⚠️ | Valparaíso + Entorno (Novo Gama, Cidade Ocidental, Águas Lindas, Formosa) e Brasília |
| Diferencial ⚠️ | Equipe própria (não terceirizada), caminhão fechado, cuidado com móveis e eletros |
| Horário ⚠️ | Seg a sáb, 7h as 19h |
| Objetivo da página | Orçamento rápido pelo WhatsApp (público mobile) |
| Prova social real | 4,8★ em 25 avaliações no Google (real do CRM) |

## 2. Decisões de produção (skill taste v2)

- **Design Read:** landing de serviço local p/ famílias do Entorno; trust-first; linguagem logística.
- **Dials:** `DESIGN_VARIANCE 7` (hero split assimétrico, bento irregular) · `MOTION_INTENSITY 5` (mask-reveal, count-up, stagger; sem scroll-hijack) · `VISUAL_DENSITY 3` (galeria arejada, hairlines, sem cards).
- **Stack:** single-file HTML/CSS nativo (padrão do repo único `lead-radar`, pasta `sites/transporte/mudancas-valparaiso/`, deploy GitHub Pages; a taste v2 prefere React/Tailwind, mas o fluxo do negócio vence para consistência — TODAS as regras de design da skill aplicadas no arquivo único).
- **Tipografia:** Archivo Black (display, peso bruto logístico) + Outfit (corpo). Inter como default é banido pela skill.
- **Paleta (Cobalt & Cream, da lista de alternativas da skill):** creme neutro off-white `#faf9f5` + off-black `#141412` + cobalto `#2b4bd6` (light) / zinc-950 `#101012` + cobalto claro `#6c86ff` (dark, auto via prefers-color-scheme). Sem puro #000/#fff (ban). Laranja NÃO (clichê do setor).
- **Shape lock:** radius 12px em tudo (botões, cards, inputs) — um sistema único.
- **Motion motivado:** mask-reveal do hero (hierarquia), count-up (prova social real), stagger reveal (sequência de leitura), marquee cidades (amplitude real de cobertura). Reduced-motion → tudo estático.
- **Anti-tells aplicados:** zero em-dash; zero eyebrows; hero sem trust strip; sem "Stage 1/2/3" (verb-noun direto); 1 marquee só; CTA único de contato ("Chamar no WhatsApp"); depoimentos ilustrativos marcados p/ LGPD; sem version footer; sem scroll cue.
- **Efeitos lead-radar:** count-up (efeito 05) inline; loop-ambient (03) descartado nesta LP — atmosfera abstrata não serve ao argumento "confiança no que é físico"; a foto real duotone é o hero (taste: hero precisa de visual real).

## 3. Copy final (espelha index.html)

1. **Nav:** Serviços · Como funciona · Depoimentos · Atendimento + CTA "Chamar no WhatsApp"
2. **Hero (split):** H1 "Sua mudança, sem dor de cabeça." · sub (18 palavras): "Equipe própria, caminhão fechado e cuidado do começo ao fim. Orçamento pelo WhatsApp em minutos." · CTAs: Chamar no WhatsApp / Ver serviços · foto duotone cobalto à direita com mask-reveal
3. **Stats (count-up, hairline, sem cards):** 4,8 nota no Google · 25 avaliações · 7 dias por semana
4. **Serviços (bento 3 células: 1 foto + 1 tint + 1 pattern):** Residenciais (grande) · Comerciais e escritórios · Itens especiais (piano, cofre, quadros)
5. **Como funciona (3 verb-noun em hairline):** Chame no WhatsApp → Receba o orçamento → A gente muda você
6. **Depoimentos:** 2 quotes curtas ilustrativas ⚠️ (trocar por reais com autorização)
7. **Atendimento (1 marquee):** cidades do Entorno
8. **CTA final (bloco cobalto) + form:** nome + WhatsApp + tipo de mudança + quando → deep-link
9. **Footer:** endereço real, telefone, horário ⚠️, LGPD
