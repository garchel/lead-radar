# Referência — Técnicas do SceneAI (sceneai.art)

> Extraído em set/2026 de 48 cards da galeria de landing pages + backgrounds do sceneai.art (biblioteca de prompts para I.A. gerar seções web). Dados brutos: `sceneai-raw.json`.
> **Limitação**: o prompt completo (Copy Prompt) exige login/pago — extraímos as **descrições públicas** (que resumem a técnica) + URLs de vídeo-preview do CDN. O valor aqui é o **padrão das técnicas**, não o prompt literal.

## Análise: as 8 técnicas recorrentes que tornam esses designs interessantes

### 1. Cursor como instrumento narrativo (não é hover comum)
O card mais premiado (Stories in Light, 131.9k): "cursor becomes a spotlight gliding over a portrait to unveil a hidden gold Venetian mask… one soft oval of light at a time".
**Técnica**: máscara radial que segue o cursor com luz suave (spotlight reveal), revelando camadas ocultas por baixo — não um simples before/after.
**Como fazer**: variação do nosso efeito 01 — trocar `clip-path: inset()` por `circle(140px at var(--mx) var(--my))` com `filter: blur` na borda. Igual ao "spotlight" já mapeado como variação no EFFECT.md do 01.
**Segmentos**: portfólio (fotógrafo!), imobiliária de luxo, produtos premium — revelar detalhe sob demanda.

### 2. Tipografia monumental + escultura 3D (o "anti-template")
HVMANITY: "haloed marble statue behind oversized Roman serif typography — the page feels like an **artifact, not a website**". Eternal Rome: "molten-gold equestrian statue rises through ultra-thin serif typography, Latin inscriptions".
**Técnica**: estátua/objeto 3D renderizado (fundo) + serif gigante por cima + inscrições + luz dourada. A página vira "peça de museu".
**Como fazer**: asset I.A. (estátua render dourada) + tipografia serif display (Canela/Tiempos/Fraunces) + grain. É o estilo `miranda.md`/`general-intelligence-company.md` do nosso design/ levado ao extremo.
**Segmentos**: advogados premium, arquitetura de luxo, joalherias, queijaria/cartão premium — posicionamento "legado".

### 3. Ambient cinematográfico no hero (dark + partícula/luz)
Padrão dominante: "cinematic animated background", "immersive cosmic experiences", "ember-lit darkness", "golden light". ~15 dos 33 cards usam dark cinematográfico.
**Técnica**: fundo escuro + luz volumétrica/emissiva + partículas + grain — o hero "respira" antes de qualquer interação.
**Como fazer**: nosso efeito 03 com vídeos/particles dark tech; para o glow dourado, gradientes radiais animados (CSS) também funcionam sem vídeo.
**Segmentos**: qualquer premium; funciona em dark tech (Linear/Auros) e editorial escuro (Miranda).

### 4. Inertia/buttery scrolling + staggered reveals
Noire: "buttery inertia scrolling, staggered scroll reveals, and a signature gradient smoke cursor effect".
**Técnica**: scroll com física de inércia (Lenis) + reveals em cascata por elemento (stagger) + cursor com rastro de fumaça/gradiente.
**Como fazer**: Lenis via CDN (2KB) + stagger no nosso reveal (delay incremental). O cursor-smoke é canvas + rAF (variação pesada do 01).
**Segmentos**: portfólios, agências — onde o prazer de scrollar é o produto.

### 5. Chat-to-action (interface como prova)
Crucible AI: "AI SaaS hero showcasing **chat-to-action interface**".
**Técnica**: em vez de screenshot do produto, o hero mostra uma conversa de chat que termina num CTA — o produto se demonstra sozinho.
**Como fazer**: bolhas de chat animadas (typing indicator → resposta → botão) em CSS/JS puro, sem vídeo. O "produto" do E&S (diagnóstico por foto no WhatsApp) traduz perfeitamente: mini-chat "manda foto → recebe orçamento".
**Segmentos**: clínicas (agendamento simulado), SaaS, serviços com processo claro.

### 6. Microcopy temático integrado ao visual
The Still Signal: "radio-transmission microcopy that makes the whole page hum like a frequency held in the dark". Manifesto lines espalhadas (HVMANITY).
**Técnica**: a copy não é só conteúdo — vira textura visual (linhas de manifesto, código de transmissão, legendas monoespaçadas espalhadas no fundo).
**Como fazer**: eyebrow em mono + linhas decorativas de texto girado/espaçado como camada de fundo (aria-hidden). Barato, alto impacto.
**Segmentos**: todos que querem "artefato" em vez de "site" — combina com 2.

### 7. Tipografia ultra-fina gigante (thin display)
Eternal Rome: "ultra-thin serif typography". Recorrente nos dark premium.
**Técnica**: serif/sans weight 200-300 em 100-140px — fragilidade elegante contra fundos escuros. (Já é a assinatura do nosso design/ — "weight 400 em escala enorme"; aqui é o extremo fino.)
**Como fazer**: fonts com peso light real (Playfair Fraunces 300, Inter 200) + tracking apertado. Cuidado com contraste (WCAG) em fundos escuros.
**Segmentos**: moda, joalheria, arte, advogacia boutique.

### 8. Objetos 3D flutuantes interativos
Airlines/Velora/Hunsy (carros, aeronaves): o objeto-produto 3D flutua no hero, às vezes reagindo ao mouse (parallax de camadas).
**Técnica**: render 3D do produto (ou asset I.A. com transparência) + parallax mouse + sombra/reflexo suave.
**Como fazer**: asset PNG/video com alpha + parallax simples (translate baseado no mouse, rAF). Combina com o 04 do catálogo (parallax).
**Segmentos**: concessionária premium, óticas, joalherias, produtos físicos de ticket alto — nosso e-commerce premium (oryzo-ai.md).

## Padrões transversais (valem para qualquer Landing)

| Padrão | Evidência nos cards | Status no nosso banco |
|---|---|---|
| Dark cinematográfico + luz dourada/violeta | ~45% dos cards | design/ dark tech + efeito 03 |
| Serif display gigante | em quase todos os premium | tokens nos DESIGN.md |
| Cursor com poder narrativo | spotlight, smoke, drag | efeito 01 + variações |
| Scroll com física (inertia/stagger) | buttery/inertia/staggered | falta → candidato efeito 15 |
| Chat simulado como CTA | chat-to-action | falta → candidato efeito 16 |
| Microcopy como textura | manifesto/transmission lines | barato, adotar como padrão editorial |
| 3D/pseudo-3D do produto | floating objects + parallax | efeito 04 quando construído |

## O que isso muda no nosso pipeline

1. **Novos candidatos para o catálogo** (sites/efeitos/README.md):
   - **15 · Inertia scroll + stagger** (Lenis, 2KB) — upgrade barato do reveal padrão de TODA LP
   - **16 · Chat-to-action** (bolhas de chat animadas com CTA final) — perfeito p/ serviços locais
   - **17 · Spotlight reveal** (variação circular do 01 — já anotada no EFFECT.md dele; promover a efeito próprio se usada 2x+)
2. **ASSETS_PROMPT**: os cards de estátua/marble/ouro (HVMANITY, Eternal Rome) viram prompts prontos no estilo "monumental 3D" p/ segmentos premium.
3. **Escala de "cinematográfico"**: se o cliente pede "algo impressionante", a receita dos cards populares é: dark + serif gigante + luz emissiva + (cursor especial OU objeto 3D) + microcopy textura — 5 ingredientes, escolher 3.

## Limitações e ética
- Os prompts completos são produto pago do SceneAI — extraímos só metadados públicos (descrições visíveis no DOM) e **técnicas** (não copiáveis como texto). As referências de vídeo (CDN) são dos previews públicos da galeria.
- Usar como inspiração de técnica, não reproduzir prompos literais do site pago.
