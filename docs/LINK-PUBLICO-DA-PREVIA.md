# Link público da prévia (cliente abre de qualquer rede)

A prévia é um HTML servido por este app. Enquanto o app roda no seu PC, o endereço
`192.168.x.x:3000` só existe dentro do seu Wi-Fi — inútil para o cliente.

Três formas de resolver, em ordem de simplicidade:

| Recurso | Endereço | Vive | Quando usar |
|---|---|---|---|
| **Rede local** (automático) | `http://192.168.15.9:3000/...` | enquanto o PC estiver ligado | testar no seu próprio celular, no mesmo Wi-Fi |
| **Túnel cloudflared** (automático) | `https://algo-aleatorio.trycloudflare.com/...` | enquanto o app e o túnel estiverem rodando — **muda a cada reinício** | mandar link para cliente agora |
| **Domínio próprio** (`PUBLIC_BASE_URL`) | `https://previa.vertice.com.br/...` | estável | produção (precisa de túnel nomeado com domínio, ou VPS) |

## Como o app escolhe

`resolvePublicBaseUrl()` tenta, nesta ordem:

1. `PUBLIC_BASE_URL` (env) — se definido, é ele que vale;
2. **túnel cloudflared** no ar;
3. **IP da rede local**;
4. nada (nesse caso o link **não** é enviado ao cliente — nunca inventar endereço).

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
