# Guia de Design Systems — Biblioteca de Landing Pages

> 34 `DESIGN.md` baixados de [styles.refero.design](https://styles.refero.design) (top 20 trending + top 20 popular, set/2026; 6 estilos apareciam em ambos → 34 únicos).
> Cada arquivo é autossuficiente: paleta (hex + oklch), tipografia, escala, espaçamento, gradientes, shapes e **component prompts** prontos para passar a um agente de código (Cursor, Claude Code, v0, Lovable, Hermes).

## Como usar

1. Cliente chega → ache o segmento dele na **Parte 1** (por tipo de empresa) e pegue o guia indicado.
2. Em caso de dúvida entre dois guias, use a **Parte 2** (por linguagem visual) para decidir o tom.
3. Combinações funcionam: estrutura de um + paleta de outro (ex. `linear.md` + `harvest.md`).
4. Para landing de **captação de leads**, priorize guias com hierarquia de CTA clara: `linear`, `cursor`, `elevenlabs`, `harvest`, `authkit`.

---

## Parte 1 — Por tipo de empresa (uso principal)

### Saúde & Bem-estar

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Dentista / implantes** | `apple.md` | `augen-pro.md`, `impilo.md` (premium dark) | Branco + espaço = higiene e confiança; azul clínico do augen passa precisão |
| **Clínica estética / dermato** | `augen-pro.md` | `impilo.md` | Painel de instrumento: técnico, caro, cirúrgico |
| **Oftalmologista / ótica** | `augen-pro.md` | `apple-espana.md` | O site de origem é literalmente sobre olhos |
| **Laboratório de análises** | `xai.md` | `impilo.md` | "Warm cream laboratory": ciência séria, acolhedora |
| **Psicólogo / terapeuta** | `harvest.md` | `notion.md` | Golden hour = calma; caderno de papel = escuta |
| **Nutricionista / nutri esportiva** | `harvest.md` | `elevenlabs.md` | Calor de comida, trabalho humanizado |
| **Academia / personal / crossfit** | `caldera.md` | `auros.md` | Condensed 189px + laranja fundido = energia e força |
| **Healthtech / telemedicina** | `impilo.md` | `xai.md` | Observatório clínico dark violeta |

### Serviços Profissionais (B2B)

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Advocacia tradicional** | `miranda.md` | `steep.md` | Broadsheet vintage, serifa colidente, selo laranja = legado |
| **Advocacia moderna / boutique** | `monad.md` | `steep.md` | Journal tech em pergaminho: letrado, mas atual |
| **Contabilidade / contador** | `seline-analytics.md` | `steep.md` | Mesa silenciosa do analista, papel quente, números |
| **Consultoria empresarial** | `steep.md` | `ventriloc.md` | Serifa = autoridade; observatório de dados = método |
| **Consultoria de dados / BI** | `ventriloc.md` | `seline-analytics.md` | Brasa laranja em relatório impresso |
| **Consultoria de IA / automação** | `ai-for-business.md` | `dala.md`, `hyperstudio.md` | Brutalist showroom (IA p/ negócios) ou constelação (IA produto) |
| **Agência de mentoria / coaching** | `elevenlabs.md` | `notion.md` | Editorial premium que valoriza a voz do mentor |

### Imóveis, Construção & Engenharia

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Imobiliária de luxo / alto padrão** | `origin-financial.md` | `mercury.md` | "Gallery of quiet wealth": galeria meia-noite de riqueza |
| **Imobiliária padrão** | `apple.md` | `harvest.md` | Fotos grandes em fundo limpo |
| **Construtora / engenharia** | `hyperstudio.md` | `caldera.md` | Blueprint gravado em obsidiana — metáfora literal de planta técnica |
| **Arquitetura / design de interiores** | `cursor.md` | `monopo-saigon.md`, `apple.md` | Ateliê pergaminho iluminado; escala editorial para fotos |

### Alimentação

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Pizzaria / churrascaria / padaria** | `caldera.md` | `harvest.md` | Laranja fundido = apetite; condensed bold = brasa e forno |
| **Restaurante premium** | `harvest.md` | `monopo-saigon.md` | Golden hour, cream canvas, fotos full-bleed |
| **Café especial / cafeteria** | `miranda.md` | `harvest.md` | Vintage woodblock + creme = torra artesanal |
| **Marca de food artesanal (e-commerce)** | `oryzo-ai.md` | `caldera.md` | Produto como artefato de museu (darkroom) |

### Beleza & Estilo

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Barbearia vintage** | `miranda.md` | `caldera.md` | Pôster 1900 com selo laranja: o clássico barbershop |
| **Barbearia street / moderna** | `caldera.md` | `monopo-saigon.md` | Bold industrial, sem delicadeza |
| **Salão / estúdio de beleza** | `say-briefly.md` | `vivid-co.md` | Caderno de rascunhos criativo, verde + amarelo |
| **Moda / loja conceito** | `monopo-saigon.md` | `vivid-co.md` | Monocromático radical + imagem iridescente |

### Educação & Infoprodutos

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Escola / curso online** | `notion.md` | `superr.md` | Caderno de papel ao sol: aprender anotando |
| **Infoprodutor / mentor** | `elevenlabs.md` | `notion.md` | Editorial Bauhaus creme = produto digital premium |
| **Escola infantil / kids** | `superr.md` | `say-briefly.md` | Stickers, caderno escolar, laranja marca-texto |
| **Escola premium / humanidades** | `general-intelligence-company.md` | `miranda.md` | "Literary journal beside a bonfire" |
| **Pet shop / veterinária** | `superr.md` | `harvest.md` | Lúdico e amigável sem infantilizar demais |

### Tech, SaaS & Financeiro

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **SaaS B2B** | `linear.md` | `shadcn-ui.md`, `default.md` | O benchmark; shadcn como base neutra |
| **Dev tooling / infra** | `harness-io.md` | `linear.md` | Mission control com verde fósforo |
| **Startup de IA** | `dala.md` | `cursor.md`, `xai.md` | Void + violeta + partículas: conhecimento visualizado |
| **Cybersecurity / TI** | `authkit.md` | `hyperstudio.md` | Frosted glass cathedral à meia-noite |
| **Fintech / banco digital** | `mercury.md` | `monad.md` | Banca alpina na blue hour |
| **Gestora / wealth / private** | `origin-financial.md` | `newform-capital.md` | Riqueza silenciosa; broadsheet para fundos |
| **Day trade / cripto / DeFi** | `auros.md` | `caldera.md` | Terminal abissal com orbes de dados |
| **Blockchain / web3** | `monad.md` | `caldera.md`, `hyperstudio.md` | Journal tech quente ou vulcão |
| **VC / private equity** | `newform-capital.md` | `origin-financial.md` | Broadsheet em sala verde |

### Agências, Criativos & Comércio

| Empresa | Guia principal | Alternativa | Por quê |
|---|---|---|---|
| **Agência de marketing / design** | `monopo-saigon.md` | `say-briefly.md`, `awesomic.md` | Radical, editorial, sem medo |
| **Estúdio audiovisual / vídeo** | `vivid-co.md` | `monopo-saigon.md` | Cinematográfico: prisma RGB em obsidiana |
| **Fotógrafo (casamento, retrato)** | `vivid-co.md` | `harvest.md` | Luz prisma / golden hour — foto é o produto |
| **Portfólio dev / designer** | `miranda.md` | `hyperstudio.md`, `awesomic.md` | Personalidade forte em broadsheet vintage |
| **E-commerce produto premium** (relógio, tênis, eletrônico) | `oryzo-ai.md` | `apple.md` | Produto flutuando em darkroom, museu |
| **Marketplace de serviços / talentos** | `awesomic.md` | `shadcn-ui.md` | Grid editorial zinc + badge laranja |
| **Buffet / eventos** | `vivid-co.md` | `superr.md` | Celebração: luz e cor sobre escuro |
| **Oficina / serviços automotivos** | `caldera.md` | `hyperstudio.md` | Industrial bold, laranja de oficina |
| **Turismo / pousada** | `harvest.md` | `elevenlabs.md` | Golden hour = o horário das fotos de viagem |

---

## Parte 2 — Por linguagem visual (referência de tom)

### Minimal Tech Premium (light) — "estilo Apple"
Branco cirúrgico, tipografia gigante, um único acento. `apple.md` · `apple-espana.md` · `augen-pro.md` · `shadcn-ui.md` · `xai.md`

### Dark Tech / Mission Control — AI, fintech, dev
Fundo quase-preto, hairlines, neon racionado. `linear.md` · `mercury.md` · `authkit.md` · `origin-financial.md` · `auros.md` · `impilo.md` · `harness-io.md` · `default.md` · `dala.md` · `vivid-co.md` · `oryzo-ai.md` · `hyperstudio.md`

### Editorial Warm (light) — "papel e tinta"
Creme quente, serifa/editorial, acento único. `elevenlabs.md` · `cursor.md` · `notion.md` · `harvest.md` · `monad.md` · `seline-analytics.md` · `steep.md` · `ventriloc.md` · `ai-for-business.md` · `general-intelligence-company.md` · `newform-capital.md` · `miranda.md`

### Criativo / Expressivo — cor como identidade
`monopo-saigon.md` · `say-briefly.md` · `superr.md` · `awesomic.md` · `caldera.md`

## Notas de campo

- **light × dark**: 22 light, 12 dark. Captura de leads converte melhor com light editorial (leitura, confiança); dark é mais memorável para tech e produtos visuais.
- **Fonts recorrentes**: Neue Montreal/PPNeueMontreal (weight 400 gigante + tracking negativo), Inter, Bricolage Grotesque, serifa editorial (Tiempos/Canopee). "Weight 400 em escala enorme" é a assinatura da refero.
- Cada `.md` termina com **Example Component Prompts** — prompts de hero, nav e cards prontos para copiar.
- Segmento sem guia ideal? Use o mapa da Parte 1 como analogia: o que importa é o **posicionamento** (premium × acessível, tradicional × moderno, técnico × acolhedor).

*Fonte: styles.refero.design — termos de uso do site aplicam-se ao conteúdo dos arquivos.*
