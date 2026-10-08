/* Etapas da obra (v1.14 — Fase 1 do plano "etapas × FVS").
 *
 * Liga cada atividade do cronograma a uma ETAPA (Fundação, Estrutura,
 * Alvenaria, Instalações…) e a um NÍVEL do prédio (00 Fundação … 27 Telhado,
 * a mesma numeração do corte e da lista oficial de pavimentos).
 *
 * O reconhecimento é automático, pelo nome da atividade e dos grupos acima
 * dela no MS Project (ex.: "ALVENARIA › 3º Pavimento › Marcação"). O que não
 * for reconhecido pode ser escolhido à mão na aba "Etapas" do Cronograma; a
 * escolha fica em cronogramas/etapas → { itens: { "<chave>": { etapa, nivel, em, por } } }
 * e vale também para os cronogramas enviados depois (a chave é o nome da
 * atividade com os grupos, não o número da linha).
 *
 * Sem dependências: roda no navegador e no Node (tests/etapas.test.mjs).
 * Nada aqui grava no banco.
 */
import { pctPrevisto } from "./cpm.js";

// Os 28 níveis do prédio — mesma lista de NIVEIS_OBRA no main.js (corte e lista oficial)
export const NIVEIS = (() => {
  const n = ["Fundação", "Subsolo"];
  for (let i = 1; i <= 5; i++) n.push(i + "º Embasamento");
  for (let i = 1; i <= 17; i++) n.push(i + "º Pavimento Tipo");
  return n.concat(["Cobertura", "Dependência", "Pavimento Técnico", "Telhado"]);
})();

export const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* Lista fixa de etapas, na ordem em que acontecem na obra.
 *   re:      palavras que identificam a etapa (sem acento, minúsculas)
 *   tiposFvs: tipos de FVS que verificam essa etapa (vazio = ainda não há ficha no app)
 *   nivelPadrao: nível usado quando a atividade não cita pavimento */
export const ETAPAS = [
  { key: "fundacao", nome: "Fundação", curto: "Fund.", nivelPadrao: 0,
    re: /\b(estacas?|blocos? de fund|blocos? de coroa|sapatas?|radier|fundac|baldrame|cortina|contenc|diafragma|tirante|escavac|terraplen|reaterro|locac)/,
    tiposFvs: ["locacao_obra", "escavacao", "estaca_metalica", "estaca_raiz", "estaca_helice", "estaca_escavada", "estaca_franki", "sapata_isolada", "radier_armado", "bloco", "parede_diafragma", "cortina_atirantada"] },
  { key: "estrutura", nome: "Estrutura", curto: "Estr.",
    re: /\b(estrutura|teto|lajes?|pilar|vigas?|formas?|armac|concretag|protens|escoramento|desforma|complemento (de )?(piso|laje))/,
    tiposFvs: ["fvs04", "protensao_cabos", "montagem_estrutura_metalica"] },
  { key: "alvenaria", nome: "Alvenaria", curto: "Alv.",
    re: /\b(alvenaria|vedac|encunhamento|drywall|acartonado|verga)/, tiposFvs: [] },
  { key: "eletrica", nome: "Inst. elétricas", curto: "Elét.",
    re: /\b(eletric|eletrod|enfiac|cabeamento|spda|telefon|logica|cftv|interfon|quadros? de (luz|distrib)|iluminac)/, tiposFvs: [] },
  { key: "hidraulica", nome: "Inst. hidráulicas", curto: "Hidr.",
    re: /\b(hidraul|hidross|esgoto|agua (fria|quente)|pluvia|prumada|incendio|sprinkler|hidrante|\bgas\b|ramais|ramal)/, tiposFvs: [] },
  { key: "instalacoes", nome: "Instalações (outras)", curto: "Inst.",
    re: /\b(instalac|ar condicionado|climatizac|exaust|elevador)/, tiposFvs: [] },
  { key: "impermeabilizacao", nome: "Impermeabilização", curto: "Imper.",
    re: /\b(impermeab|manta asfalt)/, tiposFvs: ["impermeabilizacao_rigida"] },
  { key: "revestimento", nome: "Revestimento", curto: "Revest.",
    re: /\b(revestimento|reboco|emboco|chapisco|massa unica|fachada|ceramic|porcelanato|azulej|pastilha|gesso|forro|textura)/, tiposFvs: [] },
  { key: "contrapiso", nome: "Contrapiso", curto: "Contrap.",
    re: /\b(contrapiso|contra-piso|regularizac)/, tiposFvs: [] },
  { key: "esquadrias", nome: "Esquadrias", curto: "Esquad.",
    re: /\b(esquadri|janelas?|portas?|caixilh|vidros?|guarda-? ?corpo|corrimao|serralher|bancadas?|granito|marmore|soleiras?|peitoris?)/, tiposFvs: ["guarda_corpo"] },
  { key: "pintura", nome: "Pintura", curto: "Pint.",
    re: /\b(pintura|selador|massa corrida|verniz|acabamento final)/, tiposFvs: [] },
];
export const ETAPA_POR_KEY = new Map(ETAPAS.map((e) => [e.key, e]));
// Ordem de teste dentro de um mesmo texto: as mais específicas primeiro
// ("Impermeabilização da laje" é impermeabilização, não estrutura;
//  "Contrapiso" não é "piso"; "Blocos de alvenaria" não é bloco de fundação).
const ORDEM_TESTE = ["impermeabilizacao", "contrapiso", "alvenaria", "eletrica", "hidraulica", "pintura", "esquadrias",
  "revestimento", "fundacao", "estrutura", "instalacoes"];

/** Etapa citada num texto (nome da atividade ou de um grupo), ou null */
export function etapaDoTexto(txt) {
  const n = norm(txt);
  if (!n) return null;
  for (const k of ORDEM_TESTE) if (ETAPA_POR_KEY.get(k).re.test(n)) return k;
  return null;
}

/* Nível do prédio (00–27) citado num texto, ou null.
 * Mesma convenção do corte: "Teto do 3º Pavimento" é a laje que vira o PISO
 * do 4º (nível de cima); "Alvenaria do 3º Pavimento" fica no próprio 3º. */
export function nivelDoTexto(txt) {
  const n = norm(txt);
  if (!n) return null;
  const teto = /^teto\b/.test(n);
  const sobe = teto ? 1 : 0;
  let m = n.match(/(\d{1,2})\s*[ºo°⁰ª.]?\s*(?:embasamento|emb\b)/);
  if (m && +m[1] >= 1 && +m[1] <= 5) return Math.min(27, 1 + Number(m[1]) + sobe);
  m = n.match(/(\d{1,2})\s*[ºo°⁰ª.]?\s*(?:pavimento|pav\b|pvto)/);
  if (m && +m[1] >= 1 && +m[1] <= 17) return Math.min(27, 6 + Number(m[1]) + sobe);
  if (/sub-?solo/.test(n)) return 1 + sobe;
  if (/terreo/.test(n)) return 2 + sobe;
  if (/cobertura/.test(n)) return 24 + sobe;
  if (/dependencia/.test(n)) return 25 + sobe;
  if (/casa de maquinas|reservatorio superior|barrilete/.test(n)) return 27;
  if (/pav(imento)? tecnico/.test(n)) return 26 + sobe;
  if (/telhado/.test(n)) return 27;
  if (/fundac/.test(n)) return 0;
  // nomes curtos usados nos grupos do cronograma: "E5", "3º", "COB", "SS"
  m = n.match(/^e\s*(\d)$/); if (m && +m[1] >= 1 && +m[1] <= 5) return 1 + Number(m[1]);
  m = n.match(/^(\d{1,2})\s*[ºo°⁰ª]?$/); if (m && +m[1] >= 1 && +m[1] <= 17) return 6 + Number(m[1]);
  if (/^(cob|cobert)$/.test(n)) return 24;
  if (/^(ss|sub)$/.test(n)) return 1;
  return null;
}

/** Chave estável de uma atividade (grupos + nome), para guardar a escolha manual */
export function chaveAtividade(t) {
  const s = norm(t.caminho.concat([t.nome]).join(" > "));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return "a" + h.toString(36) + s.length.toString(36);
}

/**
 * Classifica as atividades finais (não resumo) do cronograma.
 * manuais: { "<chave>": { etapa, nivel } } (cronogramas/etapas.itens)
 *   etapa "" = "não é etapa de obra" (fica de fora); nivel -1 = sem pavimento.
 * Devolve Map id → { etapa, nivel, origem: "auto" | "manual" }
 */
export function classificar(cr, manuais) {
  const out = new Map();
  if (!cr) return out;
  const man = manuais || {};
  cr.tarefas.forEach((t) => {
    if (t.resumo) return;
    const textos = [t.nome].concat(t.caminho.slice().reverse()); // do mais específico ao mais geral
    let etapa = null, nivel = null;
    for (const x of textos) { if (etapa == null) etapa = etapaDoTexto(x); if (nivel == null) nivel = nivelDoTexto(x); }
    if (etapa && nivel == null && ETAPA_POR_KEY.get(etapa).nivelPadrao != null) nivel = ETAPA_POR_KEY.get(etapa).nivelPadrao;
    let origem = "auto";
    const m = man[chaveAtividade(t)];
    if (m) {
      origem = "manual";
      if (m.etapa != null) etapa = m.etapa || null;
      if (m.nivel != null) nivel = m.nivel >= 0 ? m.nivel : null;
    }
    out.set(t.id, { etapa, nivel, origem });
  });
  return out;
}

/**
 * Resumo por etapa: % (média ponderada pela duração, como no MS Project),
 * datas e o avanço em cada nível do prédio.
 * Devolve [{ key, nome, curto, tiposFvs, pct, previsto, ini, fim, n, niveis: Map nivel → { pct, previsto, ini, fim, n } }]
 * só com as etapas que aparecem no cronograma, na ordem da obra.
 */
export function resumoEtapas(cr, classif, hoje) {
  if (!cr) return [];
  const acc = new Map();
  const soma = (o, t) => {
    const d = t.dur > 0 ? t.dur : 1;
    o.w += d; o.s += d * t.pct; o.sp += d * pctPrevisto(t, hoje); o.n++;
    if (t.ini && (!o.ini || t.ini < o.ini)) o.ini = t.ini;
    if (t.fim && (!o.fim || t.fim > o.fim)) o.fim = t.fim;
  };
  const novo = () => ({ w: 0, s: 0, sp: 0, n: 0, ini: "", fim: "" });
  cr.tarefas.forEach((t) => {
    const c = classif.get(t.id);
    if (!c || !c.etapa) return;
    if (!acc.has(c.etapa)) acc.set(c.etapa, { tot: novo(), niveis: new Map() });
    const a = acc.get(c.etapa);
    soma(a.tot, t);
    if (c.nivel != null) { if (!a.niveis.has(c.nivel)) a.niveis.set(c.nivel, novo()); soma(a.niveis.get(c.nivel), t); }
  });
  const fecha = (o) => ({ pct: Math.round(o.s / o.w), previsto: Math.round(o.sp / o.w), ini: o.ini, fim: o.fim, n: o.n });
  return ETAPAS.filter((e) => acc.has(e.key)).map((e) => {
    const a = acc.get(e.key), niveis = new Map();
    a.niveis.forEach((o, k) => niveis.set(k, fecha(o)));
    return Object.assign({ key: e.key, nome: e.nome, curto: e.curto, tiposFvs: e.tiposFvs }, fecha(a.tot), { niveis });
  });
}

/**
 * Situação de cada nível numa etapa, juntando o cronograma com as FVS.
 * fvsDoNivel(tiposFvs, nivel) → { total, fechadas } (FVS daqueles tipos naquele nível)
 * inicioFvs: data (ISO) da FVS mais antiga do app — o que terminou antes disso
 *   não é cobrado ("anterior ao app").
 * Situações: "na" (a etapa não passa por esse nível), "nada" (a executar),
 *   "execucao" (em andamento), "semfvs" (100% sem FVS), "fvsaberta" (100%, FVS aberta),
 *   "liberado" (100% com FVS fechada), "concluido" (100%, etapa ainda sem ficha
 *   no app, ou terminou antes do app).
 */
export function situacaoNivel(et, nivel, fvsDoNivel, inicioFvs) {
  const nv = et.niveis.get(nivel);
  if (!nv) return { st: "na", pct: null };
  if (nv.pct <= 0) return { st: "nada", pct: 0, nv };
  if (nv.pct < 100) return { st: "execucao", pct: nv.pct, nv };
  if (!et.tiposFvs.length) return { st: "concluido", pct: 100, nv };
  const f = fvsDoNivel(et.tiposFvs, nivel) || { total: 0, fechadas: 0 };
  if (f.total && f.fechadas === f.total) return { st: "liberado", pct: 100, nv, fvs: f };
  if (f.total) return { st: "fvsaberta", pct: 100, nv, fvs: f };
  if (inicioFvs && nv.fim && nv.fim < inicioFvs) return { st: "concluido", pct: 100, nv, antes: true };
  return { st: "semfvs", pct: 100, nv };
}

/** Nível mais alto em que a etapa chegou a 100% e o nível em que o cronograma previa estar hoje */
export function topoEtapa(et, hoje) {
  let topo = null, previsto = null;
  et.niveis.forEach((nv, k) => {
    if (nv.pct >= 100 && (topo == null || k > topo)) topo = k;
    if (nv.fim && nv.fim <= hoje && (previsto == null || k > previsto)) previsto = k;
  });
  return { topo, previsto };
}

/**
 * FVS que o cronograma pede: níveis de etapas com ficha no app que
 *   (a) chegaram a 100% sem FVS ("faltando"), ou
 *   (b) têm atividade na semana [de, ate] e ainda nenhuma FVS ("semana").
 * Uma linha por etapa + nível (uma FVS 04 cobre forma, armação e concretagem da laje).
 */
export function fvsPedidas(cr, classif, resumo, fvsDoNivel, inicioFvs, de, ate) {
  const faltando = [], semana = [];
  if (!cr) return { faltando, semana };
  resumo.forEach((et) => {
    if (!et.tiposFvs.length) return;
    et.niveis.forEach((nv, nivel) => {
      const s = situacaoNivel(et, nivel, fvsDoNivel, inicioFvs);
      if (s.st === "semfvs") faltando.push({ etapa: et.key, nomeEtapa: et.nome, tiposFvs: et.tiposFvs, nivel, fim: nv.fim });
    });
  });
  const vistos = new Set();
  cr.tarefas.forEach((t) => {
    if (t.resumo || !t.ini || !t.fim || t.ini > ate || t.fim < de || t.pct >= 100) return;
    const c = classif.get(t.id);
    if (!c || !c.etapa || c.nivel == null) return;
    const et = ETAPA_POR_KEY.get(c.etapa);
    if (!et.tiposFvs.length) return;
    const k = c.etapa + "|" + c.nivel;
    if (vistos.has(k)) return;
    const f = fvsDoNivel(et.tiposFvs, c.nivel) || { total: 0 };
    if (f.total) return;
    vistos.add(k);
    semana.push({ etapa: c.etapa, nomeEtapa: et.nome, tiposFvs: et.tiposFvs, nivel: c.nivel, tarefa: t });
  });
  faltando.sort((a, b) => (b.fim || "").localeCompare(a.fim || ""));
  semana.sort((a, b) => a.tarefa.ini.localeCompare(b.tarefa.ini));
  return { faltando, semana };
}
