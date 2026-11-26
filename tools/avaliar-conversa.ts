/**
 * Avaliação da conversa da Clara.
 *
 * Mede o que o prompt dela NÃO cobre antes de mexer no prompt. Cada cenário é uma
 * mensagem realista de cliente com o estado da conversa; o modelo responde usando
 * o MESMO prompt que roda no cron (lido do jobs.json), e um segundo modelo julga a
 * resposta contra critérios fixos.
 *
 * Uso:
 *   npx tsx tools/avaliar-conversa.ts                 # prompt do jobs.json
 *   npx tsx tools/avaliar-conversa.ts caminho.md      # prompt candidato
 *
 * Não envia nada no WhatsApp: só gera e julga texto.
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAiClient, modelosDeepSeek } from "../server/services/aiClient";

const CENARIOS = [
  { id: "preco", estado: "primeiro contato respondido", cliente: "quanto custa?" },
  { id: "preco_concorrente", estado: "prévia já enviada", cliente: "o rapaz aqui da cidade cobra 500 reais. quanto vocês cobram?" },
  { id: "lgpd", estado: "primeiro contato respondido", cliente: "de onde você tirou meu número?" },
  { id: "golpe", estado: "prévia já enviada", cliente: "isso é golpe? ninguém faz site de graça" },
  { id: "robo", estado: "primeiro contato respondido", cliente: "você é um robô?" },
  { id: "recusa", estado: "prévia já enviada", cliente: "não tenho interesse, obrigado" },
  { id: "optout", estado: "prévia já enviada", cliente: "para de me mandar mensagem" },
  { id: "ja_tem_site", estado: "primeiro contato respondido", cliente: "já tenho site" },
  { id: "audio", estado: "prévia já enviada", cliente: "[áudio de 0:14]" },
  { id: "quem_e", estado: "primeiro contato enviado, lead nunca respondeu", cliente: "quem é?" },
  { id: "prazo", estado: "prévia já enviada", cliente: "e quanto tempo leva pra ficar pronto?" },
  { id: "loja", estado: "prévia já enviada", cliente: "vocês fazem loja virtual com pagamento?" },
  { id: "seo", estado: "prévia já enviada", cliente: "dá pra aparecer no Google quando alguém procurar?" },
  { id: "humano", estado: "prévia já enviada", cliente: "quero falar com uma pessoa de verdade" },
  { id: "ligacao", estado: "prévia já enviada", cliente: "me liga" },
  { id: "cnpj", estado: "prévia já enviada", cliente: "vocês têm CNPJ? qual o nome da empresa?" },
  { id: "vou_pensar", estado: "prévia já enviada", cliente: "vou pensar e te falo" },
  { id: "critica", estado: "prévia já enviada", cliente: "achei feio, não gostei" },
  { id: "parcelar", estado: "prévia já enviada", cliente: "posso pagar parcelado?" },
  { id: "nota", estado: "prévia já enviada", cliente: "vocês emitem nota fiscal? tem contrato?" },
  { id: "concorrente_ja_mandou", estado: "primeiro contato respondido", cliente: "já vieram outros me oferecendo isso" },
  { id: "ok", estado: "prévia já enviada", cliente: "ok" },
  { id: "bom_dia", estado: "primeiro contato enviado, lead nunca respondeu", cliente: "bom dia" },
  { id: "dominio", estado: "prévia já enviada", cliente: "e o domínio? www.nomedeles.com.br" },
];

const RUBRICA = `Você avalia UMA resposta de WhatsApp de uma atendente comercial (Clara, da Vértice Páginas Web, que vende landing pages para pequenos negócios).

Julgue APENAS a resposta dada, contra os critérios abaixo. Devolva JSON puro:
{"nota": 0-10, "falhas": ["..."], "acertou_a_pergunta": true|false}

Critérios (todos obrigatórios):
1. Responde a pergunta que o cliente fez, na primeira linha. Fugir da pergunta é falha grave.
2. Não inventa preço, prazo, funcionalidade, desconto ou condição que não esteja nas regras. Se não sabe, diz o que sabe e oferece o caminho (falar com o Paulo, ver a prévia).
3. Não promete resultado (SEO garantido, "vai vender mais").
4. Voz de WhatsApp humano: até 4 blocos curtos, sem travessão (—) nem meia-risca (–), sem markdown, no máximo 1 emoji em resposta curta.
5. Trata risco com respeito quando aparece: LGPD (de onde veio o número), acusação de golpe, pedido para parar de mandar mensagem, pedido de humano.
6. Não pressiona e não insiste depois de recusa.
7. Termina com uma pergunta leve quando a conversa pede continuidade; NÃO termina com pergunta quando o cliente pediu para parar.

nota 10 = responde, é humana, não inventa e trata o risco. nota 5 = responde mas escorrega em um critério.
nota 0-3 = foge da pergunta, inventa dado, pressiona quem pediu para parar, ou responde com texto de robô.`;

function lerPrompt(caminho?: string): string {
  if (caminho) return fs.readFileSync(caminho, "utf8");
  const jobs = JSON.parse(fs.readFileSync(path.join(os.homedir(), "AppData", "Local", "hermes", "cron", "jobs.json"), "utf8"));
  const lista = Array.isArray(jobs) ? jobs : jobs.jobs || [];
  const clara = lista.find((j: any) => String(j?.name || "").includes("responder lead"));
  if (!clara?.prompt) throw new Error("prompt da Clara não encontrado no jobs.json");
  return clara.prompt as string;
}

function estadoDoLead(estado: string): string {
  return `ESTADO ATUAL DA CONVERSA (dado real do CRM):
- lead: Ótica Óculos Mania Franco da Rocha · categoria Ótica · cidade Franco da Rocha/SP
- nota Google 5,0 com 2.340 avaliações · telefone disponível
- prévia gratuita: ${estado.includes("já enviada") ? "já foi enviada e publicada (link na conversa)" : "não foi enviada ainda"}
- última mensagem da conversa: do lead (nunca respondida ainda)
Interprete o papel de Clara e responda SÓ a mensagem do cliente abaixo. Não execute comandos, não consulte API: apenas escreva a resposta que você enviaria.`;
}

async function main() {
  const ai = getAiClient();
  const modelos = modelosDeepSeek().length ? modelosDeepSeek() : [process.env.GEMINI_MODEL || "gemini-flash-latest"];
  const prompt = lerPrompt(process.argv[2]);
  const modelo = modelos[0];

  async function falar(sistema: string, usuario: string): Promise<string> {
    const r = await ai.models.generateContent({
      model: modelo,
      contents: [{ role: "user", parts: [{ text: usuario }] }],
      config: { systemInstruction: sistema, temperature: 0.4, maxOutputTokens: 700 },
    } as never);
    return String((r as any)?.text || "").trim();
  }

  const linhas: Array<Record<string, unknown>> = [];
  for (const c of CENARIOS) {
    const resposta = await falar(prompt, `${estadoDoLead(c.estado)}\n\nMENSAGEM DO CLIENTE:\n${c.cliente}`);
    let veredito: any = { nota: null, falhas: ["juiz não respondeu"], acertou_a_pergunta: null };
    try {
      const bruto = await falar(RUBRICA, `MENSAGEM DO CLIENTE:\n${c.cliente}\n\nRESPOSTA DA CLARA:\n${resposta}`);
      const json = bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1);
      veredito = JSON.parse(json);
    } catch { /* mantém o padrão */ }
    linhas.push({ id: c.id, cliente: c.cliente, resposta, nota: veredito.nota, falhas: veredito.falhas, acertou: veredito.acertou_a_pergunta });
    console.log(`[${c.id}] nota ${veredito.nota} | ${c.cliente.slice(0, 40)}`);
  }

  const notas = linhas.map((l) => Number(l.nota)).filter((n) => !Number.isNaN(n));
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;
  const abaixo = linhas.filter((l) => Number(l.nota) < 7);
  const saida = { modelo, gerado_em: new Date().toISOString(), media: Number(media.toFixed(2)), n: linhas.length, abaixo_de_7: abaixo.length, linhas };
  const arquivo = path.join(os.tmpdir(), `avaliacao-clara-${Date.now()}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2), "utf8");

  console.log(`\nMÉDIA ${saida.media} em ${saida.n} cenários · ${saida.abaixo_de_7} abaixo de 7`);
  console.log(`relatório: ${arquivo}`);
  for (const l of abaixo) {
    console.log(`\n--- ${l.id}: ${l.cliente}`);
    console.log(`resposta: ${String(l.resposta).slice(0, 300)}`);
    console.log(`falhas: ${JSON.stringify(l.falhas)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
