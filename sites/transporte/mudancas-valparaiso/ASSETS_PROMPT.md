# ASSETS_PROMPT — Mudanças Valparaíso

> LP: `sites/transporte/mudancas-valparaiso/` · Fluxo de design: **taste v2** (dials 7/5/3)
> Paleta: cobalto `#2b4bd6` + creme `#faf9f5` (light) / zinc `#101012` + cobalto claro `#6c86ff` (dark)
> As fotos da LP recebem duotone cobalto via CSS — gere as fotos em tom NEUTRO que o filtro unifica tudo.
> Regra: foto real da equipe/caminhão SEMPRE ganha de IA. IA só para o que não dá pra fotografar.
> LGPD: sem rosto de cliente sem autorização escrita; equipe própria com consentimento verbal basta.

## 1. Foto do hero (substitui o picsum atual)

**Slot:** `.hero-photo` (proporção 4:3.4, ~1200×1000). **Spec:** ≤300KB, sem texto/logo legível.

**Melhor caminho (real, 10 min):** foto da própria equipe carregando móvel embrulhado no
caminhão, luz da manhã, tirada de costas/lateral (sem rostos). Celular na altura do peito.

**I.A. (fotorealista):**
```
Photorealistic photo of a professional moving crew loading wrapped furniture and cardboard boxes into a closed box truck parked at a Brazilian suburban house entrance, two workers seen from behind wearing navy blue work shirts, warm morning light, no visible faces, no readable logos or text on truck or shirts, documentary photography style, shallow depth of field --ar 4:5
```

## 2. Foto do bento "Residenciais" (substitui o picsum atual)

**Slot:** `.cell-photo` (~900×1100, vertical). **Spec:** ≤250KB, sem texto legível.

**Real:** interior de caminhão carregado, caixas e sofá amarrados com corda/fitas.

**I.A.:**
```
Photorealistic interior of a moving truck fully loaded with cardboard boxes, wrapped sofa and furniture strapped with ratchet straps, neat professional packing, natural light from open truck door at the back, no people, no readable text, documentary style --ar 4:5
```

## 3. Fotos opcionais (upgrade futuro)

- Close de mão com luva ajustando cinta de amarração (bento tint → vira foto)
- Caminhão fechado estacionado em rua residencial brasileira ao amanhecer

## 4. Depoimentos reais (LGPD)

Trocar as 2 quotes ilustrativas por avaliações reais do Google (a transportadora tem 25)
com autorização por escrito. Formato: frase curta + "Nome ou inicial, cidade". Sem foto de rosto.

---

## Ordem de prioridade

| # | Asset | Por quê |
|---|---|---|
| 1 | Hero real (1) | Primeira dobra; foto real da equipe é o argumento de confiança |
| 2 | Caminhão carregado (2) | Bento principal; mostra o "padrão de organização" |
| 3 | Depoimentos (4) | Fechar o funil com prova real |

## Checklist de integração

- [ ] Fotos sem texto/logo legível (o filtro duotone não disfarça letreiro)?
- [ ] Duotone aplicado via CSS conferido nas 2 fotos (mesma temperatura)?
- [ ] Números dos stats conferem (4,8 / 25 / seg a sáb)?
- [ ] Telefone (61) 99502-8647 confirmado com o cliente?
- [ ] Horário e cidades do marquee confirmados?
- [ ] Probe headless re-executado (dark mode auto, reduced-motion, mobile, console limpo)?
