/* Lista de pendências → não conformidades nas FVS (v1.19).
 *
 * O dono recebe listas de pendências (vistoria, auditoria, cliente) em
 * planilha, PDF copiado ou texto de WhatsApp. Esta parte lê a lista, separa
 * cada pendência e sugere em qual FVS ela entra (pelo nº da ficha, pelo
 * pavimento e pelo serviço). Na tela, cada linha pode ter a ficha trocada
 * antes de incluir. Nada aqui grava no banco.
 *
 * Sem dependências: roda no navegador e no Node (tests/pendencias.test.mjs).
 */

export const norm = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const COLUNAS = [
  ["correcao", /corre[cç]|a[cç][aã]o|providen|solu[cç]|tratativa|o que fazer/],
  ["prazo", /prazo|data limite|vencimento/],
  ["responsavel", /respons|empreit|empresa|equipe|executor/],
  ["fvs", /\bfvs\b|ficha/],
  ["pavimento", /pavimento|\bpav\b|andar|\blocal\b|nivel|setor/],
  ["servico", /servi[cç]o|\btipo\b|etapa|atividade|disciplina/],
  ["data", /^data|registro|abertura|identifica/],
  ["descricao", /pend|descri|n[aã]o conform|problema|ocorr|observa|apontamento|defeito/],
];
function papel(txt) {
  const n = norm(txt);
  if (!n || n.length > 40) return null;
  for (const [k, re] of COLUNAS) if (re.test(n)) return k;
  return null;
}

// "dd/mm/aaaa", "dd/mm/aa", "dd/mm" (ano corrente) ou data do Excel → "aaaa-mm-dd"
export function dataISO(v, anoPadrao) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v);
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[0];
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s);
  if (!m) return "";
  let a = m[3] ? Number(m[3]) : (anoPadrao || new Date().getFullYear());
  if (a < 100) a += 2000;
  const d = Number(m[1]), me = Number(m[2]);
  if (d < 1 || d > 31 || me < 1 || me > 12) return "";
  return `${a}-${String(me).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// pavimento citado num texto livre ("5º pav", "3º embasamento", "cobertura"…) — o texto como escrito
export function pavimentoNoTexto(txt) {
  const s = String(txt || "");
  const m = /(\d{1,2})\s*[ºo°⁰ª.]?\s*(pavimento(?:\s*tipo)?|pav\.?|pvto|andar|embasamento|emb\.?)/i.exec(s);
  if (m) return m[0].trim();
  const m2 = /\b(subsolo|t[ée]rreo|cobertura|depend[êe]ncia|telhado|casa de m[áa]quinas|funda[çc][ãa]o)\b/i.exec(s);
  return m2 ? m2[0] : "";
}
// nº da FVS citado ("FVS 12", "ficha nº 12", "FVS 04 nº 7" → "7")
export function fvsNoTexto(txt) {
  const s = norm(txt);
  let m = /(?:ficha|fvs)[^\d]{0,12}(?:\d{1,3}[^\d]{1,6})?n[ºo°.]?\s*(\d{1,4})/.exec(s);
  if (m) return m[1];
  m = /(?:ficha|fvs)\s*(?:n[ºo°.]?\s*)?(\d{1,4})\b/.exec(s);
  return m ? m[1] : "";
}

function limparItem(t) { return String(t || "").replace(/^\s*(?:[-–•*·]|\d{1,3}\s*[.)-])\s*/, "").trim(); }

/**
 * Lê a lista. entrada: texto colado OU tabela (array de linhas da planilha).
 * Devolve [{ descricao, correcao, pavimento, fvs, servico, prazo, responsavel, data }]
 */
export function lerPendencias(entrada, hojeISO) {
  const ano = hojeISO ? Number(hojeISO.slice(0, 4)) : undefined;
  let linhas = entrada;
  if (typeof entrada === "string") {
    const brutas = entrada.split(/\r?\n/);
    // colado do Excel (colunas separadas por TAB) ou CSV com ";"
    const sep = brutas.filter((l) => l.includes("\t")).length >= 2 ? "\t" : (brutas.filter((l) => (l.match(/;/g) || []).length >= 2).length >= 2 ? ";" : null);
    if (sep) linhas = brutas.map((l) => l.split(sep));
    else return brutas.map(limparItem).filter((l) => l.length >= 4).map((l) => doTexto(l, ano));
  }
  linhas = (linhas || []).map((r) => (r || []).map((c) => (c == null ? "" : c)));
  // cabeçalho nas 10 primeiras linhas
  let iCab = -1, mapa = null;
  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    const m = {};
    linhas[i].forEach((c, j) => { const k = papel(c); if (k && m[k] == null) m[k] = j; });
    if (m.descricao != null && Object.keys(m).length >= 2) { iCab = i; mapa = m; break; }
  }
  const out = [];
  linhas.slice(iCab + 1).forEach((r) => {
    if (!r.some((c) => String(c).trim())) return;
    if (!mapa) { // sem cabeçalho: junta as células como texto livre
      const t = limparItem(r.filter((c) => String(c).trim()).join(" — "));
      if (t.length >= 4) out.push(doTexto(t, ano));
      return;
    }
    const cel = (k) => (mapa[k] == null ? "" : r[mapa[k]]);
    const desc = limparItem(cel("descricao"));
    if (!desc) return;
    const base = doTexto(desc, ano);
    out.push({
      descricao: desc,
      correcao: String(cel("correcao") || "").trim(),
      pavimento: String(cel("pavimento") || "").trim() || base.pavimento,
      fvs: String(cel("fvs") || "").replace(/\D+/g, " ").trim().split(" ").pop() || base.fvs,
      servico: String(cel("servico") || "").trim(),
      prazo: dataISO(cel("prazo"), ano) || base.prazo,
      responsavel: String(cel("responsavel") || "").trim(),
      data: dataISO(cel("data"), ano),
    });
  });
  return out;
}
function doTexto(t, ano) {
  // "… até 10/10" / "prazo 10/10" vira prazo
  const mp = /(?:at[ée]|prazo:?)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(t);
  return { descricao: t, correcao: "", pavimento: pavimentoNoTexto(t), fvs: fvsNoTexto(t), servico: "", prazo: mp ? dataISO(mp[1], ano) : "", responsavel: "", data: "" };
}

/**
 * Sugere a FVS de cada pendência.
 * fichas: [{ id, numero, codigo, titulo, pavimentos:[…], data }]
 * nivel: (texto) => nº do nível do prédio (pavimentoRank do app; 9999 = não reconhecido)
 * Devolve o id da ficha (ou "" se nada bate o suficiente).
 */
export function sugerirFvs(item, fichas, nivel) {
  const nivelItem = item.pavimento ? nivel(item.pavimento) : 9999;
  const txt = norm([item.servico, item.descricao].join(" "));
  let melhor = "", pontos = 0, dataMelhor = "";
  (fichas || []).forEach((f) => {
    let p = 0;
    const num = String(f.numero || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (item.fvs && num && num === String(item.fvs).replace(/^0+(?=\d)/, "")) p += 100;
    if (nivelItem !== 9999 && (f.pavimentos || []).some((pv) => nivel(pv) === nivelItem)) p += 40;
    // serviço: palavras do tipo da ficha ("alvenaria", "forma", "impermeabilização"…) citadas na pendência
    const palavras = norm([f.titulo, f.codigo].join(" ")).split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
    if (palavras.some((w) => txt.includes(w))) p += 30;
    if (p > pontos || (p === pontos && p > 0 && String(f.data || "") > dataMelhor)) { melhor = f.id; pontos = p; dataMelhor = String(f.data || ""); }
  });
  return pontos >= 40 ? melhor : "";
}
