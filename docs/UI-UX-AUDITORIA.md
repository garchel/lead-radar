# Auditoria de UI/UX — o que está ruim e como melhorar

> **Status: Onda 1 aplicada + parte da Onda 2.** Feito: contraste (99 pontos em telas claras + 11 no Crescimento), piso de fonte 10→11px (88 pontos), alvos de 32px nos controles citados, `sticky thead` (Cidades e Banco), 13 toggles com `role="switch"`/`aria-label`, cópias mortas corrigidas, contagem sem duplicar, **Fila de Cidades com paginação de 50 + seleção e ação em lote** (endpoint `PATCH /api/cities`, página de 26.680px → 3.033px), **filtros do Banco em 2 linhas**, **Follow-ups sem títulos duplicados** e **menu "⋯" no card do CRM**.
>
> Pendente: acordeões por tema na Automação, distribuições do Banco em accordion, indicar "chave em uso" nos Canais, `h1` por página e o padrão único de loading/erro/vazio (Onda 3).

**Como auditei:** medição no DOM real (1440×950, app rodando) + leitura do código de cada componente. Sem "achismo": cada achado abaixo tem número ou trecho de código. Contrastes calculados com a fórmula WCAG (AA = 4,5:1 para texto normal).

## Resumo executivo (o que mais dói)

1. **`text-slate-400` em 130 lugares** → contraste **2,56:1** sobre branco (mínimo AA é 4,5). É o problema mais espalhado do app.
2. **Fila de Cidades é um paredão**: 500 linhas, **26.680px de altura**, cabeçalho não fixo, 507 controles com menos de 30px de altura e **nenhuma ação em lote**.
3. **Tipografia micro**: 158 textos a 10px no Banco de Dados, 30 no Crescimento, 21 em Projetos, 42 (10+11px) no ProjectModal.
4. **Toggles sem nome acessível**: os 8 interruptores da Automação são `<button>` sem `aria-label`/`role="switch"` — altura 20px, texto vazio.
5. **Follow-ups repete títulos**: 5 headings, com pares duplicados ("Recontato autorizado" + "Recontatos autorizados"; "Cadência automática D+3/D+7" + "Cadência D+3 / D+7") e 2 botões "Atualizar".
6. **Cópia morta**: a Fila diz "crie uma landing page pela aba Automação" (isso não existe mais ali) e a Automação mantém um card só para dizer que o agendador mudou de lugar.

## Achados transversais (afetam todas as telas)

| # | Sintoma (medido) | Impacto | Correção |
|---|---|---|---|
| T1 | `text-slate-400` = 2,56:1 (branco) / 2,45:1 (slate-50) — **130 ocorrências** | texto de apoio ilegível para quem tem vista cansada ou tela com brilho baixo | trocar para `slate-500` (4,76:1) em fundo claro e `slate-300`/`slate-400` em fundo escuro (`slate-900`: 12:1 / 6,96:1) |
| T2 | `text-slate-500` sobre `slate-100` = 4,34:1 e sobre `slate-900` = 3,75:1 | mesmo problema em chips e nas seções escuras do Crescimento | subir um tom nos fundos coloridos/escuros |
| T3 | 10px/11px em textos de conteúdo (não só em labels) | esforço de leitura; autoridade visual baixa | piso de **11px para label** e **12px para conteúdo**; 10px só em badge decorativo |
| T4 | Alvos de clique < 28px (ex.: "Editar" 15px, chips 20px, headers de tabela 16px) | errar o clique é fácil, principalmente em notebook | piso de 32px de altura para qualquer controle (padding, não fonte) |
| T5 | Toggles sem `role="switch"`/`aria-label` | leitor de tela anuncia "botão" sem nome | adicionar `role="switch"`, `aria-checked` e `aria-label` = texto do recurso |
| T6 | Nenhuma tabela longa tem cabeçalho fixo | ao rolar 500 linhas perde-se a referência das colunas | `thead` com `sticky top-0` |
| T7 | Títulos de página inconsistentes (`h2` na maioria, `h1` em algumas, vazio em CRM/Projetos/Crescimento) | hierarquia confusa e título de aba pobre | um `h1` por tela; subtítulo em `p` |
| T8 | Contagem duplicada nas "Próximas ações" ("3 projetos… ×3") | ruído que faz duvidar do dado | mostrar o número uma vez |
| T9 | Estados de carregamento/erro variam de forma entre telas | parece que a tela quebrou | padronizar: skeleton nas listas, erro em banner com "tentar de novo" |

## Por página

### Busca de Região (`search`)
- Chips de auto-salvar ("Não/Ouro/Ouro+Prata") têm 20–22px de altura e **"Ouro" com 2,3:1** de contraste → difícil de acertar e de ler.
- Botão "Canais & APIs (chaves)" (26px) no meio do card do provedor: é configuração em tela de operação; já tem aba própria → reduzir a um link discreto.
- Filtros de presença (Todos/Ouro/Prata/Bronze) e o banner de resultado competem com o formulário: dois blocos de "resumo" antes da lista.
- **Proposta:** chips com 32px de altura e cor sólida quando ativos; mover o resumo para uma faixa única; "Canais & APIs" vira link de texto.

### Fila de Cidades (`cities`) — **pior tela do app**
- **500 linhas** carregadas de uma vez, página de **26.680px**, sem paginação/ virtualização.
- Cabeçalho da tabela não fixo; clicar para ordenar exige 16px de altura.
- **507** controles abaixo de 30px (o toggle de cada cidade).
- Nenhuma ação em lote (desabilitar 100 cidades = 100 cliques).
- Filtros de população/tier aplicam no cliente — mudar o filtro não reduz o que já veio.
- **Proposta:** paginação de 50 + `sticky thead`; checkbox por linha + barra de ação em lote ("desabilitar selecionadas"); toggles com 32px; mover filtros para a URL/estado aplicado (já existe o padrão de 600ms em outras telas).

### Banco de Dados (`database`)
- **3.430px** de altura: 6 KPIs + 3 gráficos + 2 listas **acima** da tabela empurram a lista (que é o objetivo) para longe.
- **10 controles de filtro numa única linha** — em 1280px quebra feio.
- 158 textos a 10px (badges e hints) e 56 a 11px.
- A lista é de 50 por página (bom), mas o cabeçalho não é fixo.
- **Proposta:** KPIs em uma faixa compacta, filtros em 2 linhas agrupados (busca+ordem / pipeline+presença+cidade+categoria / score+período), distribuições recolhidas atrás de um "ver análise" (ou abaixo com accordion), `sticky thead`.

### Dashboard de Leads (`crm`)
- Cards com **25 alvos < 30px**, incluindo "Editar" com **15px** de altura.
- Micro texto: 66 elementos a 11px e 20 a 10px dentro dos cards.
- Card carrega: nome, score, categoria, valor, resultado do contato (select), próxima data, anotações (textarea), lixeira — muita coisa em ~330px de largura.
- **Proposta:** ações do card em um menu "⋯" (Editar / Remover / Ver histórico); anotações viram resumo de 2 linhas + "editar" só no hover; o select "Registrar resposta" ganha rótulo claro e 32px.

### Follow-ups (`followups`)
- **Títulos duplicados** (5 headings, 2 pares) e **dois "Atualizar"** na mesma tela.
- Os dois cards do topo (recontato autorizado × cadência) repetem o que os títulos abaixo dizem.
- Botões "Simular/Enviar cadência" com 12px de fonte e contraste baixo no estado desabilitado.
- **Proposta:** um único cabeçalho + dois blocos com subtítulo; um só "Atualizar" no topo; cards explicativos viram linha de apoio dentro de cada bloco.

### Crescimento (`growth`)
- Seções escuras com `slate-500` = **3,75:1** em texto de 11–12px → ilegível no limite.
- 30 textos a 10px; o funil e as métricas competem com a tabela de prioridades.
- **Proposta:** seções claras como o resto do app (ou subir o texto para `slate-300`), 12px mínimo; separar "métricas" de "prioridades" em duas colunas com títulos claros.

### Projetos (`projects`)
- 36 textos ≤10px (badges de tipo/prioridade, progresso).
- Com uma etapa recolhida, o cabeçalho perde o contexto do que havia dentro (só o número).
- **Proposta:** 11px mínimo nos badges; no cabeçalho recolhido mostrar "3 projetos · 2 vencidos" quando houver.

### Automação (`automation`)
- **2.485px**, 8 cards, 15 alvos pequenos, 8 toggles sem nome acessível.
- Card morto: "Agendador global … agora ficam em Operação → Fila & Agendamentos" (ocupa espaço para dizer onde a coisa não está).
- "Humanização" e "Autopilot" têm números densos (10px) sem hierarquia.
- **Proposta:** transformar em acordeões por tema (Coleta / WhatsApp / IA / Infra) com 1 linha de resumo no cabeçalho; remover o card morto; toggles com rótulo e 32px.

### Fila & Agendamentos (`monitoring`)
- Estado vazio com cópia errada: "Inicie uma prospecção em lote ou crie uma landing page pela **aba Automação**" (não existe mais).
- KPIs de jobs (5 cartões) com dados quase sempre zerados ocupam a primeira dobra.
- **Proposta:** corrigir a cópia; esconder KPIs quando `total === 0`; mostrar "Nova tarefa em lote" como CTA principal no vazio.

### Canais & APIs (`channels`)
- Boa estrutura; o problema é que a lista de chaves não mostra **qual chave está sendo usada agora** (só "hoje X/Y").
- **Proposta:** destacar a última chave usada e ordenar por uso do dia.

### Resultado da Busca / Estratégia / Agentes
- Estrutura ok. "Resultado da Busca" ainda se chama "Empresas Encontradas" no `h2` interno (inconsistente com o menu).
- Estratégia tem simulador com campos numéricos sem unidade visível ao lado.

## Plano sugerido (3 ondas)

### Onda 1 — quick wins (baixo risco, alto ganho)
1. Trocar `text-slate-400` → `text-slate-500` (claro) / `slate-300` (escuro) nos 130 pontos — só cor.
2. Piso de fonte: 10px apenas em badge; conteúdo ≥12px.
3. Altura mínima 32px em controles clicáveis.
4. `sticky thead` nas tabelas de Cidades e Banco de Dados.
5. Toggles com `role="switch"` + `aria-label` + 32px.
6. Corrigir as cópias mortas (Fila, título "Empresas Encontradas", card do agendador).
7. "Próximas ações": contagem sem duplicar.

### Onda 2 — telas problemáticas
8. Cidades: paginação 50 + seleção múltipla + ações em lote.
9. Banco de Dados: reorganizar densidade (KPIs compactos, filtros em 2 linhas, distribuições em accordion).
10. Follow-ups: um cabeçalho, um "Atualizar", sem títulos duplicados.
11. Dashboard de Leads: menu "⋯" no card, anotações resumidas.
12. Automação: acordeões por tema + remover card morto.

### Onda 3 — consistência
13. Padrão único de loading/erro/vazio (componente compartilhado).
14. `h1` por página e título de aba refletindo a tela.
15. Crescimento: sair do dark ou ajustar contraste; 12px mínimo.
16. Canais: indicar a chave em uso.

## O que eu **não** mexeria
- Estrutura de navegação e os kanbans em accordeon (recém-validados por você).
- Paleta índigo/slate e o padrão de cards `rounded-2xl` — é o que dá identidade ao app.
- Ordem "lista antes dos gráficos" no Banco de Dados.
