# Pools de nicho — como usar

Cada nicho tem três camadas separadas, porque elas falham de formas diferentes:

| Arquivo | Camada | O que responde | Como usar |
|---|---|---|---|
| `<nicho>-estrutura.json` | **estrutura** | quais seções/componentes existem e com que frequência | escolher entre `base` (70%+), `diferenciador` (15–70%) e `raro` (<15%) |
| `<nicho>-sistema-visual.json` | **arte** | escala tipográfica, razão título/corpo, paleta, degraus | usar como **faixa**, nunca valor exato |
| `<nicho>-voz.json` | **argumento** | enquadramentos (público → promessa → prova), lista negra, teste de troca | escolher UM enquadramento e **só** se tiver a prova exigida |

## Regras de uso (valem para os seis nichos)

1. **Componente de estrutura entra como opção, nunca como bloco obrigatório.** Sempre com a saída "nenhum".
2. **`base` não é diferencial.** O que 70%+ dos sites do nicho têm serve para não faltar, não para se destacar.
3. **`diferenciador` é onde mora a especificidade.** Priorizar a faixa 15–70%.
4. **Tipografia é proporção, não valor.** Copiar "Playfair 72px" produz imitação; copiar "título 4× o corpo" produz hierarquia.
5. **Enquadramento sem prova não é usado.** A página declara a pendência em vez de inventar.
6. **Teste de troca** antes de publicar: trocar o nome do negócio por um concorrente de outro ramo; se a frase continuar verdadeira, reprovar.
7. **Lista negra é bloqueio**, não sugestão.

## Índice consolidado

`_indice-nichos.json` junta as três camadas dos seis nichos em um arquivo consumível, com `como_usar` no topo.

## Avisos de amostra (não ignorar)

- **fisioterapia**: 24 referências e 8 brasileiras — indício, não medida.
- **odontologia**: a tipografia vem de 7 fichas de anatomia, não de medição em lote.
- **ótica**: amostra bimodal (loja física × e-commerce); a tipografia do índice é de loja física.
- **psicologia**: comparação BR × referência suspensa (só 7 consultórios brasileiros válidos).

## Como acrescentar um nicho

1. `tools/catalogar-nicho.mjs` com `NICHO_ALVO=<nicho>` (adicionar léxico em `LEXICO_NICHO` e `SERVICOS_POR_NICHO`).
2. Conferência automática de nicho, de tipo de site e de domínio de infraestrutura — **nenhuma é opcional**.
3. Anatomia em 1440px com `anatomia.mjs` para tipografia.
4. Escrever os três arquivos seguindo a forma dos existentes e registrar os limites da amostra.
