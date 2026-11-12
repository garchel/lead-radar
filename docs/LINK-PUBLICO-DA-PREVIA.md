# Link público da prévia (cliente abre de qualquer rede)

A prévia é um HTML servido por este app. Enquanto o app roda no seu PC, o endereço
`192.168.x.x:3000` só existe dentro do seu Wi-Fi — inútil para o cliente.

Três formas de resolver, em ordem de simplicidade:

| Recurso | Endereço | Vive | Quando usar |
|---|---|---|---|
| **Rede local** (automático) | `http://192.168.15.9:3000/...` | enquanto o PC estiver ligado | testar no seu próprio celular, no mesmo Wi-Fi |
| **Túnel cloudflared** (automático) | `https://algo-aleatorio.trycloudflare.com/...` | enquanto o app e o túnel estiverem rodando — **muda a cada reinício** | mandar link para cliente agora |
| **Cloudflare Pages** (configurado) | `https://vertice-previas-aqa.pages.dev/<slug>` | **estável, sobrevive ao app fechar** | produção — é o padrão agora |
| **Domínio próprio** (`PUBLIC_BASE_URL`) | `https://previa.vertice.com.br/<slug>` | estável, com a marca | quando houver domínio |

## Como o app escolhe

`resolvePublicBaseUrl()` tenta, nesta ordem:

1. `PUBLIC_BASE_URL` (env) — domínio próprio;
2. **Cloudflare Pages** (`CF_PAGES_PROJECT` + token) — estável;
3. **túnel cloudflared** no ar;
4. **IP da rede local**;
5. nada (nesse caso o link **não** é enviado ao cliente — nunca inventar endereço).

Caminho da URL muda com a base: no Pages o arquivo é servido na raiz (`/<slug>`),
no túnel e na rede local em `/p/<slug>` (rota própria). `resolvePreviewUrl(slug)`
cuida disso para ninguém montar o link na mão.

O painel mostra a base em uso em **Canais & APIs → Link público das prévias**, com
botão de copiar e de subir/derrubar o túnel. `GET /api/tunnel` devolve o mesmo.

## Túnel (o que funciona hoje, sem conta e sem domínio)

- binário do `cloudflared` em `%LOCALAPPDATA%\hermes\tools\cloudflared\cloudflared.exe`
  (ou `CLOUDFLARED_PATH`);
- sobe sozinho no boot quando `PUBLIC_BASE_URL` está vazio (`TUNNEL_AUTO_START=false`
  desliga);
- URL efêmera: `https://<aleatório>.trycloudflare.com`;
- **cai junto com o app** e **muda de endereço** quando reinicia — link antigo morre.

Para testar de fora (rede móvel, outro computador), basta abrir a URL do túnel.

## Domínio fixo (o próximo degrau)

Duas saídas, ambas exigem algo além do PC:

1. **Túnel nomeado**: `cloudflared tunnel create vertice` + DNS na Cloudflare
   apontando para `<id>.cfargotunnel.com`; depois `PUBLIC_BASE_URL=https://previa.dominio.com.br`.
2. **VPS**: subir app + gateway no servidor e apontar o domínio para ele — resolve
   também o "app precisa estar aberto".

## Limites que precisam ser ditos ao cliente

- A prévia é um link temporário: quem guardar o endereço depois que o túnel cair não
  abre mais.
- Para o cliente ver a versão final, o caminho é o site publicado (deploy), não a prévia.
- O HTML da prévia é `noindex` — não aparece no Google.

## Cloudflare Pages (o caminho escolhido)

Configuração no `.env` (nunca versionado):

```
CLOUDFLARE_ACCOUNT_ID=<id da conta>
CLOUDFLARE_API_TOKEN=<token com Account > Cloudflare Pages > Edit>
CF_PAGES_PROJECT=vertice-previas
```

O subdomínio real é descoberto na API (`vertice-previas` já existia no Cloudflare,
então ele virou `vertice-previas-aqa.pages.dev`). O app lê isso no boot e usa como
base.

Fluxo: `POST /api/leads/:id/preview` gera o HTML, **publica no Pages** e só então
devolve `publicUrl`. Se a publicação falhar, o link do túnel continua valendo.
Botão **Publicar** em Canais & APIs publica tudo manualmente.

### Plano Free: o que limita e o que não cobra

| Item | Free |
|---|---|
| Deploys | 500/mês (1 por prévia gerada) |
| Arquivos por projeto | 20.000 (~4 KB cada prévia) |
| Requisições / banda | ilimitadas |
| Projetos | 100 |
| Cartão de crédito | **não exige** |

Proteções contra cobrança: não cadastrar cartão; não ativar Workers Paid, R2,
Images, Stream, Argo ou Load Balancing (são medidos); não servir vídeo/arquivo
grande pelo Pages no Free (o termo exige serviço pago). Se um dia houver cartão,
ligar **Notifications → Billing** e conferir **Billing → Subscriptions**.

### Próximo degrau: link com a marca

Comprar um domínio (`.com.br`, ~R$ 40/ano), mover o DNS para o Cloudflare e
adicionar como domínio customizado do projeto Pages. Fica
`https://previa.seudominio.com.br/<slug>`, ainda no Free.
