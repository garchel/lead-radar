import fs from "node:fs";
import { getAiClient, modelosDeepSeek } from "./aiClient";

/**
 * Juiz visual da prévia.
 *
 * O portão técnico (1 título, 2 CTAs, sem transbordo) garante página que FUNCIONA.
 * Não garante página que VENDE. Este serviço olha o print da primeira dobra e dá
 * uma nota com rubrica fixa — serve para escolher entre tentativas, não para
 * substituir o portão.
 */

export interface VereditoVisual {
  nota: number;
  problemas: string[];
}

const RUBRICA = `Você é diretor de arte avaliando a primeira dobra de uma página de vendas
para um negócio local brasileiro. A página foi feita para convencer o dono do
negócio a contratar um site.

Dê uma nota de 0 a 10 pensando no que um cliente pagaria para ter.

Critérios, todos com o mesmo peso:
1. Hierarquia: dá para entender em 2 segundos o que o negócio faz e qual é a ação?
2. Tipografia: a escala é coerente, os títulos têm presença, o corpo é legível?
3. Cor: a paleta parece escolhida ou parece sorteada? Texto tem contraste?
4. Composição: existe ritmo, ou é um bloco atrás do outro sem respiro?
5. Densidade: falta conteúdo (vazio) ou sobra (apertado)?
6. Acabamento: algo parece rascunho, provisório ou automático?

Desconte com força:
- espaço reservado para imagem DOMINANDO a dobra (uma faixa fina e discreta dizendo
  "foto do espaço" é aceitável e não deve custar nota — é onde a foto do cliente vai entrar)
- texto de apoio repetindo a mesma informação do título
- cara de template genérico (gradiente roxo, três cards iguais, tudo centralizado)
- espaços vazios grandes sem intenção

Responda SOMENTE um JSON, sem markdown:
{"nota": 7.5, "problemas": ["frase curta e acionável", "outra frase"]}

Máximo 3 problemas, do mais grave para o menos. Se a nota for 9 ou mais, a lista
pode vir vazia.

Contexto obrigatório: é proibido usar foto tirada da internet e o cliente ainda não
mandou nenhuma. NÃO desconte por a página não ter foto. Desconte se o espaço
reservado parecer inacabado, ocupar área nobre sem intenção ou quebrar o ritmo.`;

/** Extrai o JSON do texto, tolerando cerca e conversa em volta. */
export function extrairVeredito(texto: string): VereditoVisual | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const bruto = JSON.parse(texto.slice(inicio, fim + 1));
    const nota = Number(bruto?.nota);
    if (!Number.isFinite(nota)) return null;
    const problemas = Array.isArray(bruto?.problemas)
      ? bruto.problemas.map((p: unknown) => String(p)).filter(Boolean).slice(0, 3)
      : [];
    return { nota: Math.min(10, Math.max(0, nota)), problemas };
  } catch {
    return null;
  }
}

export function juizVisualAtivo(): boolean {
  if (process.env.PREVIEW_VISUAL_GATE === "0") return false;
  return modelosDeepSeek().length > 0;
}

export function notaMinima(): number {
  const valor = Number(process.env.PREVIEW_VISUAL_MIN || 7.5);
  return Number.isFinite(valor) ? valor : 7.5;
}

export async function julgarPaginaVisualmente(
  caminhoPng: string,
  contexto: { nome: string; segmento?: string; cidade?: string },
): Promise<VereditoVisual | null> {
  if (!juizVisualAtivo()) return null;
  if (!caminhoPng || !fs.existsSync(caminhoPng)) return null;

  const estatistica = fs.statSync(caminhoPng);
  if (estatistica.size < 2000) return null;

  const modelo = modelosDeepSeek()[0];
  const ai = getAiClient();
  const dados = fs.readFileSync(caminhoPng).toString("base64");
  const resumo = [contexto.nome, contexto.segmento, contexto.cidade].filter(Boolean).join(" · ");

  try {
    const resposta = await ai.models.generateContent({
      model: modelo,
      contents: [
        {
          role: "user",
          parts: [
            { text: `${RUBRICA}\n\nNegócio desta página: ${resumo}` },
            { inlineData: { mimeType: "image/png", data: dados } },
          ],
        },
      ],
      config: {
        systemInstruction: "Você avalia design de páginas com olho crítico e responde só JSON.",
        temperature: 0.2,
        maxOutputTokens: 500,
        reasoningEffort: "none",
        abortSignal: AbortSignal.timeout(Number(process.env.PREVIEW_VISUAL_TIMEOUT_MS || 60000)),
      },
    });

    const veredito = extrairVeredito(String(resposta.text || ""));
    if (!veredito) {
      console.warn(`[previa-ia] juiz visual devolveu texto sem JSON: ${String(resposta.text || "").slice(0, 120)}`);
      return null;
    }
    console.log(`[previa-ia] juiz visual: nota ${veredito.nota}${veredito.problemas.length ? ` — ${veredito.problemas.join(" | ")}` : ""}`);
    return veredito;
  } catch (erro: any) {
    console.warn(`[previa-ia] juiz visual falhou: ${String(erro?.message || erro).slice(0, 140)}`);
    return null;
  }
}
