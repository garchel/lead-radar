/**
 * BrasilAPI enrichment for Brazilian companies (CNPJ).
 * Free, no API key required: https://brasilapi.com.br/docs
 */
export interface CnpjEnrichment {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnae?: string;
  cnaeDescription?: string;
  municipio?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  logradouro?: string;
  bairro?: string;
  cep?: string;
  situacao?: string;
  dataAbertura?: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`BrasilAPI HTTP ${res.status}`);
  }
  return res.json();
}

function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/**
 * Look up a company by CNPJ (accepts formatted or raw digits).
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjEnrichment | null> {
  const cnpj = onlyDigits(rawCnpj);
  if (cnpj.length !== 14) {
    throw new Error('CNPJ inválido: informe exatamente 14 dígitos.');
  }

  const data = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    const cnae = data.cnae_fiscal;
    let cnaeDescription = undefined;
    if (cnae) {
      try {
        const cnaeData = await fetchJson(
          `https://brasilapi.com.br/api/cnae/v1/${cnae}`,
        );
        cnaeDescription = cnaeData.descricao;
      } catch {
        /* cnae description is optional */
      }
    }

  return {
    cnpj,
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia || undefined,
    cnae,
    cnaeDescription,
    municipio: data.municipio,
    uf: data.uf,
    telefone: data.ddd_telefone_1 || undefined,
    email: data.email || undefined,
    logradouro: data.logradouro,
    bairro: data.bairro,
    cep: data.cep,
    situacao: data.descricao_situacao_cadastral,
    dataAbertura: data.data_inicio_atividade,
  };
}