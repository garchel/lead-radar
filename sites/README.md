# `sites/` — Landing pages por nicho

Todas as landing pages do LeadRadar vivem em **um único repositório** (este,
`lead-radar`), organizadas por **nicho** e depois por **projeto**:

```
sites/
  <nicho>/
    <slug>/
      index.html          # a LP em si
      assets/             # imagens, vídeos, SVGs
      BRIEFING_COPY.md    # briefing + copy aprovada
      ASSETS_PROMPT.md    # prompts de asset (padrão v2 slot-aware)
      wireframe.html      # quando houver wireframe aprovado
  efeitos/                # biblioteca compartilhada de efeitos (fora dos nichos)
  ASSETS_PROMPT_TEMPLATE.md
```

## Regras

- **Um repo só.** Não criar repositório novo por cliente/projeto. O agente de
  código trabalha no `lead-radar` e cria a pasta do projeto dentro do nicho.
- **Nicho** = segmento do negócio, em minúsculas e sem acento (`medico`,
  `dentista`, `advogado`, `construcao`, `reformas`, `transporte`, `marketing`...).
- **Slug** = identificador curto do cliente/projeto, em kebab-case
  (`achei-ferragens`, `es-manutencoes`, `mudancas-valparaiso`).
- Um projeto novo **nunca** sobrescreve pasta existente: se o slug já existe,
  é retomada do mesmo projeto (reuso, não duplicação).
- `sites/efeitos/` é biblioteca compartilhada: fica **fora** das pastas de
  nicho e pode ser referenciada por qualquer LP.
- A pasta exata do projeto fica registrada em `Project.sitePath` e aparece no
  dev kit / prompt do agente.

## Mapa atual

| Nicho | Projeto | Caminho |
| --- | --- | --- |
| construção | Achei Ferragens | `sites/construcao/achei-ferragens/` |
| reformas | E&S Manutenções | `sites/reformas/es-manutencoes/` |
| transporte | Mudanças Valparaíso | `sites/transporte/mudancas-valparaiso/` |
| marketing | Paulo Victor (LP própria) | `sites/marketing/pv-landing/` |
