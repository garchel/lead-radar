# Ficha do cliente (`.md`) — fatos + marca para a primeira versão do site

Quando o lead **demonstra interesse** ("quero ver a prévia"), o LeadRadar monta
uma ficha do negócio e grava em Markdown. Ela é o insumo de conteúdo da primeira
versão da landing page — junto do `ASSETS_PROMPT.md` e do `BRIEFING_COPY.md`.

Implementação: `server/services/clientProfileService.ts`.

## O que a ficha traz

| Bloco | Exemplo |
|---|---|
| Identificação | nome, categoria, endereço completo, cidade/UF, telefone, Instagram, site |
| Responsável técnico | **CRM/CRO/CREFITO** + UF + nome (quando aparece em fonte pública) |
| Experiência | desde que ano, anos de atuação, formação, certificações |
| Serviços | lista de tratamentos/procedimentos/serviços |
| Atendimento | horário, convênios |
| Diferenciais | o que o negócio destaca |
| Provas sociais | nota e nº de avaliações do Google + frases citáveis |
| Identidade visual | paleta com HEX, tom, tipografia, logo, resumo (vem do `brandSnapshot`) |
| Lacunas | o que **não** foi encontrado — vira pergunta para o cliente |
| Fontes | cada URL usada, com o tipo (`site`, `google`, `instagram`) |

## De onde vem cada coisa (e o que NÃO fazemos)

1. **Cadastro do lead** (Google Maps via SerpAPI) — endereço, telefone, nota.
2. **Site do próprio cliente** — home + até 2 páginas com `sobre`, `equipe`,
   `tratamentos`, `serviços`, `especialidades`. É a fonte mais confiável para
   CRM, formação e lista de serviços.
3. **Google** — 2 a 3 buscas: `"Nome" cidade`, `"Nome" site:instagram.com` e,
   para categorias de saúde, `"Nome" (CRM OR CRO OR CREFITO OR CRBM)`.
   O **snippet da bio do Instagram** costuma trazer "CRO-SP 12345" e "desde 2012".
4. **Não abrimos o Instagram.** A página bloqueia scraping e o uso automatizado
   viola os ToS. O que existe de bio indexada aparece no resultado do Google.

Resultados que não citam o negócio são **descartados** (`isRelevantSearchResult`):
buscas com nome comprido devolvem lixo (time de futebol, Wikipedia) e isso
contaminaria o prompt da IA.

## Regra de ouro: nada inventado

O prompt proíbe inventar número de conselho, tempo de casa, convênio ou
tratamento. O que não aparece nas fontes vai para **Lacunas** e chega ao prompt
do site como instrução explícita de não publicar. `confidence` é a cobertura dos
blocos (identidade, serviços, experiência, conselho, prova social, marca) — uma
ficha só com endereço não passa de 0.4.

## Onde os arquivos ficam

| Arquivo | Quando |
|---|---|
| `data/clientes/<slug>.md` | sempre que a ficha é gerada (fora do git) |
| `sites/<nicho>/<slug>/CLIENTE.md` | quando o projeto da LP já tem `sitePath` — vai versionado junto do site |

## Como gerar

Automático: o webhook de WhatsApp dispara a coleta quando a intenção é
**interesse** ou **preço** (o lead pediu prévia/orçamento). Roda em segundo plano,
o webhook já respondeu.

Manual:

```bash
# API
curl -X POST localhost:3000/api/leads/<leadId>/client-profile -d '{"force":true}' -H 'Content-Type: application/json'
curl localhost:3000/api/leads/<leadId>/client-profile          # consultar (sem gastar cota)

# Agente (MCP)
client_profile(leadId="...", force=true)
```

Custo por ficha: até 3 buscas SerpAPI (cache de 7 dias evita repetir) + 1 chamada
Gemini (+ a pesquisa visual quando ainda não existe). Ficha salva é reaproveitada
— só `force: true` refaz.

## Uso na geração do site

`buildProjectDevPrompt` (`server/projects/devKit.ts`) injeta
`formatClientProfileForPrompt(lead.clientProfile)` num bloco **FICHA DO CLIENTE**,
antes do bloco de identidade visual. O agente de código recebe endereço, CRM,
experiência, serviços e as lacunas — e a instrução de não inventar o que falta.
