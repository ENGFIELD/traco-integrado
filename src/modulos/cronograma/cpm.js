/* Leitura do cronograma (exportação do MS Project em Excel) e cálculo do
 * caminho crítico — sem dependências, roda no navegador e no Node (testes).
 *
 * Formato esperado (colunas): Atividade (recuo de 3 espaços por nível),
 * % concluída, Predecessoras, Início, Duração, Término.
 *   Predecessoras: "17", "12TI+180 dd", "70II;72II", "18TT", "143IT", "104TI+25 dd"
 *     TI = término→início (padrão) · II = início→início · TT = término→término · IT = início→término
 *     folga: "+5 d" (dias úteis) ou "+180 dd" (dias corridos)
 *   Datas: "Seg 02/06/25"   Duração: "38,86 d"
 * O ID de cada tarefa é o número da linha (a 1ª linha de dados é o ID 1), igual ao MS Project.
 */

const DIAS = 86400000;

export function dataISO(txt) {
  const m = String(txt || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return "";
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}
// índice de dia útil (seg–sex); sábado/domingo caem no próximo dia útil
export function idxUtil(iso) {
  const d = new Date(iso + "T12:00:00Z");
  let dias = Math.floor(d.getTime() / DIAS);
  let dow = (dias + 4) % 7; // 0 = domingo (1/1/1970 foi quinta)
  if (dow === 6) { dias += 2; dow = 1; } else if (dow === 0) { dias += 1; dow = 1; }
  const semanas = Math.floor((dias + 3) / 7); // semanas iniciadas na segunda
  return semanas * 5 + ((dow + 6) % 7);
}
export function isoDeUtil(idx) {
  const semanas = Math.floor(idx / 5), dow = idx - semanas * 5; // 0 = segunda
  const dias = semanas * 7 - 3 + dow;
  return new Date(dias * DIAS).toISOString().slice(0, 10);
}

function lerPred(txt) {
  return String(txt || "").split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(\d+)\s*(TI|II|TT|IT)?\s*(?:([+-])\s*([\d,]+)\s*(dd|d|ed|sem|s)?)?/i);
    if (!m) return null;
    let lag = m[4] ? Number(m[4].replace(",", ".")) * (m[3] === "-" ? -1 : 1) : 0;
    const un = (m[5] || "d").toLowerCase();
    if (un === "dd" || un === "ed") lag = Math.round(lag * 5 / 7); // corridos → úteis
    else if (un === "sem" || un === "s") lag = lag * 5;
    return { id: Number(m[1]), tipo: (m[2] || "TI").toUpperCase(), lag: Math.round(lag) };
  }).filter(Boolean);
}

/** linhas: array de arrays (sheet_to_json header:1), com a linha de cabeçalho */
export function lerCronograma(linhas) {
  const cab = (linhas[0] || []).map((c) => String(c || "").toLowerCase());
  const col = (re, padrao) => { const i = cab.findIndex((c) => re.test(c)); return i >= 0 ? i : padrao; };
  const C = { nome: col(/atividade|nome|tarefa/, 0), pct: col(/conclu/, 1), pred: col(/predecess/, 2), ini: col(/in[ií]cio/, 3), dur: col(/dura/, 4), fim: col(/t[ée]rmino|fim/, 5) };
  const tarefas = [];
  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i] || [];
    const bruto = String(r[C.nome] == null ? "" : r[C.nome]);
    if (!bruto.trim()) continue;
    tarefas.push({
      id: i, nome: bruto.trim(), nivel: Math.round(bruto.match(/^ */)[0].length / 3),
      pct: Number(String(r[C.pct] || "0").replace("%", "").replace(",", ".")) || 0,
      pred: lerPred(r[C.pred]), ini: dataISO(r[C.ini]), fim: dataISO(r[C.fim]),
      dur: Number(String(r[C.dur] || "0").replace(/[^\d,]/g, "").replace(",", ".")) || 0,
    });
  }
  // hierarquia: pai = última tarefa de nível menor; resumo = tem filhos
  const pilha = [];
  tarefas.forEach((t) => {
    while (pilha.length && pilha[pilha.length - 1].nivel >= t.nivel) pilha.pop();
    t.pai = pilha.length ? pilha[pilha.length - 1].id : null;
    t.grupo = pilha.length > 1 ? pilha[1].nome : (pilha[0] ? t.nome : t.nome); // nível 1 (ex.: ESTRUTURA)
    t.caminho = pilha.slice(1).map((p) => p.nome);
    pilha.push(t);
  });
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  tarefas.forEach((t) => { if (t.pai != null) porId.get(t.pai).resumo = true; });
  return { tarefas, porId };
}

/** Caminho crítico por passagem de volta (datas do arquivo como cedo). Folga em dias úteis. */
export function calcularFolgas(cr) {
  const { tarefas, porId } = cr;
  const comData = tarefas.filter((t) => t.ini && t.fim);
  comData.forEach((t) => { t._es = idxUtil(t.ini); t._ef = Math.max(t._es, idxUtil(t.fim)); t._d = t._ef - t._es; });
  const fimProj = Math.max(...comData.map((t) => t._ef));
  comData.forEach((t) => { t._lf = fimProj; });
  // sucessores
  const succ = new Map();
  comData.forEach((s) => s.pred.forEach((p) => { if (porId.has(p.id)) { if (!succ.has(p.id)) succ.set(p.id, []); succ.get(p.id).push({ s, tipo: p.tipo, lag: p.lag }); } }));
  // relaxação até estabilizar (lida com resumos e ordem qualquer)
  for (let it = 0; it < 200; it++) {
    let mudou = false;
    for (const p of comData) {
      let lf = p._lf;
      (succ.get(p.id) || []).forEach(({ s, tipo, lag }) => {
        if (s._lf == null) return;
        const ls = s._lf - s._d;
        let lim;
        if (tipo === "TI") lim = ls - 1 - lag;
        else if (tipo === "II") lim = ls - lag + p._d;
        else if (tipo === "TT") lim = s._lf - lag;
        else lim = s._lf - lag + p._d; // IT
        if (lim < lf) lf = lim;
      });
      // filho não pode terminar depois do fim tardio do resumo (pai)
      if (p.pai != null) { const pai = porId.get(p.pai); if (pai && pai._lf != null && pai._lf < lf) lf = pai._lf; }
      if (lf < p._lf) { p._lf = lf; mudou = true; }
    }
    if (!mudou) break;
  }
  comData.forEach((t) => { t.folga = t._lf - t._ef; t.fimTardio = isoDeUtil(t._lf); });
  return { fimProjeto: isoDeUtil(fimProj) };
}

/** Atividades do período [de, ate] (ISO), só tarefas finais (não resumo) */
export function atividadesNoPeriodo(cr, de, ate) {
  return cr.tarefas.filter((t) => !t.resumo && t.ini && t.fim && t.ini <= ate && t.fim >= de);
}
/** % previsto hoje para uma tarefa (linear entre início e término, em dias úteis) */
export function pctPrevisto(t, hojeISO) {
  if (!t.ini || !t.fim) return 0;
  if (hojeISO < t.ini) return 0;
  if (hojeISO >= t.fim) return 100;
  const a = idxUtil(t.ini), b = idxUtil(t.fim), h = idxUtil(hojeISO);
  return Math.round(Math.min(100, Math.max(0, (h - a + 1) / (b - a + 1) * 100)));
}
