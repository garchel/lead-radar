/**
 * Rótulos das seções do catálogo de nichos.
 *
 * O catálogo fala em slug (`telefone_clicavel`, `antes_depois`) porque é assim que a
 * análise compara páginas reais. Contrato é lido pelo dono do negócio: no Anexo I
 * precisa aparecer "telefone clicável para ligar do celular", não o slug.
 */

const ROTULOS: Record<string, string> = {
  agendamento_online: "agendamento online",
  antes_depois: "antes e depois",
  blog: "blog com artigos",
  casos: "casos atendidos",
  clareamento: "clareamento dental",
  convenios: "convênios aceitos",
  depoimentos: "depoimentos de clientes",
  endereco: "endereço e como chegar",
  equipe: "equipe, com quem atende",
  estacionamento: "estacionamento no local",
  faq: "perguntas frequentes",
  financeiro: "formas de pagamento e parcelamento",
  galeria: "galeria com fotos do trabalho",
  harmonizacao: "harmonização facial",
  horario: "horário de funcionamento",
  implante: "implante dentário explicado em etapas",
  infantil: "atendimento infantil",
  mapa: "mapa de localização",
  ortodontia: "aparelho e alinhadores",
  pagamento: "pagamento na própria página",
  tecnologia: "tecnologia e equipamentos",
  telefone_clicavel: "telefone clicável para ligar do celular",
  urgencia: "atendimento de urgência",
  video: "vídeo de apresentação",
  whatsapp: "botão de WhatsApp",
};

/**
 * Traduz o slug; desconhecido vira texto legível (nunca fica snake_case na tela).
 * Minúsculo de propósito: a lista do Anexo I mistura rótulos e termos do próprio
 * cliente, e capitalizar só alguns deixava "agendamento online" ao lado de "Corte".
 */
export function rotuloDeSecao(chave: string): string {
  const k = String(chave || "").trim();
  if (!k) return "";
  const direto = ROTULOS[k];
  if (direto) return direto;
  return k.replace(/[_-]+/g, " ").trim().toLowerCase();
}

/** Converte uma lista de slugs, sem repetir. */
export function rotulosDeSecoes(chaves: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const c of chaves) {
    const r = rotuloDeSecao(c);
    if (r && !vistos.has(r)) {
      vistos.add(r);
      saida.push(r);
    }
  }
  return saida;
}
