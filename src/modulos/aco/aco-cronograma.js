/* Aço × cronograma (v1.10): avisa com antecedência quando uma laje do
 * cronograma vai começar e o aço dela não está programado (ou chega tarde).
 *
 * Sem dependências: roda no navegador e no Node (tests/aco-cronograma.test.mjs).
 * Nada é gravado — só cruza o cronograma já carregado com entregasAco.
 *
 * Como liga uma entrega a uma laje: pelo pavimento escrito no destino, na
 * descrição dos itens e no código da prancha ("1º Pavimento", "-1PV-",
 * "3º Embasamento", "Cobertura"...). No projeto estrutural "Armação do 1º
 * Pavimento" é a laje que o cronograma chama de "Teto do 1º Pavimento".
 */

const DIA = 86400000;
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const somarDias = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / DIA);

export const ANTECEDENCIA = 21;   // dias antes do início da laje em que o aviso aparece
export const TOLERANCIA = 3;      // aço pode chegar até 3 dias depois do início

// Chave do pavimento a partir do nome da tarefa do cronograma (só lajes da estrutura)
export function chaveDaTarefa(nome) {
  const n = norm(nome);
  const compl = /^\s*complemento\s+(?:de\s+)?(?:piso|laje)/.test(n);
  if (!/^\s*teto/.test(n) && !compl) return null;
  let m = n.match(/(\d+)\s*[ºo°⁰]?\s*embasamento/); if (m) return "emb:" + Number(m[1]);
  if (compl) return null;
  if (/subsolo/.test(n)) return "subsolo";
  m = n.match(/(\d+)\s*[ºo°⁰]?\s*pavimento/); if (m) return "pav:" + Number(m[1]);
  if (/cobertura/.test(n)) return "cob";
  if (/depend/.test(n)) return "dep";
  if (/maquinas|reservat/.test(n)) return "cm";
  return null;
}

// Chaves de pavimento citadas numa entrega (pode ser mais de uma)
export function chavesDaEntrega(e) {
  const textos = [e.destino].concat((e.itens || []).map((i) => (i.descricao || "") + " " + (i.prancha || "")));
  const ch = new Set();
  textos.forEach((t) => {
    const n = norm(t);
    let m;
    const reP = /(\d+)\s*[ºo°⁰]?\s*(?:pavimento|pav\b|pvto)/g; while ((m = reP.exec(n))) ch.add("pav:" + Number(m[1]));
    const reE = /(\d+)\s*[ºo°⁰]?\s*(?:embasamento|emb\b)/g; while ((m = reE.exec(n))) ch.add("emb:" + Number(m[1]));
    const reC = /-(\d+)(pv|eb|emb)-/g; while ((m = reC.exec(n))) ch.add((m[2] === "pv" ? "pav:" : "emb:") + Number(m[1]));
    if (/subsolo/.test(n)) ch.add("subsolo");
    if (/cobertura/.test(n)) ch.add("cob");
    if (/dependencia/.test(n)) ch.add("dep");
    if (/casa de maquinas|reservatorio/.test(n)) ch.add("cm");
  });
  return ch;
}

const situacao = (e, hoje) => e.status === "entregue" ? "entregue" : e.status === "cancelado" ? "cancelado"
  : e._concretadoEm ? "concretada"
  : (e.dataPrevista && e.dataPrevista < hoje ? "atrasada" : "programada");

/* v1.18: aço × concretagem. Se a laje já foi CONCRETADA (há rastreabilidade
 * naquele pavimento), a armação dela chegou — não faz sentido cobrar o aço.
 *
 * Nível do prédio (00 Fundação … 27 Telhado, mesma lista do corte) da
 * rastreabilidade → chave da laje: concretar o PISO do 4º pavimento é
 * concretar o "Teto do 3º Pavimento" (chave pav:3), igual ao cronograma e ao
 * projeto de armação. */
export function chaveDoNivel(nivel) {
  if (nivel == null || nivel < 2) return null;
  if (nivel === 2) return "subsolo";                  // piso do 1º embasamento = teto do subsolo
  if (nivel <= 6) return "emb:" + (nivel - 2);        // 2º–5º embasamento
  if (nivel === 7) return "emb:5";                    // piso do 1º pavimento = teto do 5º embasamento
  if (nivel <= 24) return "pav:" + (nivel - 7);       // 2º pav … cobertura
  return { 25: "cob", 26: "dep", 27: "cm" }[nivel] || null;
}
/** concretagens: [{ data, niveis:[…] }] → Map chave → [datas em ordem] */
export function concretadasPorChave(concretagens) {
  const m = new Map();
  (concretagens || []).forEach((c) => {
    if (!c || !c.data) return;
    (c.niveis || []).forEach((n) => {
      const ch = chaveDoNivel(n); if (!ch) return;
      if (!m.has(ch)) m.set(ch, []);
      m.get(ch).push(c.data);
    });
  });
  m.forEach((l) => l.sort());
  return m;
}
/** Data da concretagem que mostra que o aço desta entrega já chegou ("" se não houver).
 * Vale concretagem do mesmo pavimento a partir de 30 dias antes da data prevista. */
export function chegouPelaConcretagem(e, concretadas) {
  if (!e || e.status === "entregue" || e.status === "cancelado" || !concretadas || !concretadas.size) return "";
  const desde = somarDias(e.dataPrevista || String(e.criadoEm || "").slice(0, 10) || "1900-01-01", -30);
  let achou = "";
  chavesDaEntrega(e).forEach((ch) => {
    (concretadas.get(ch) || []).forEach((d) => { if (d >= desde && (!achou || d < achou)) achou = d; });
  });
  return achou;
}

/**
 * cr: cronograma calculado (cpm.lerCronograma) · entregas: [{id, ...entregasAco}]
 * Devolve uma linha por laje que começa nos próximos ANTECEDENCIA dias (ou
 * começou há pouco e está abaixo de 50%), com:
 *   tipo: "sem" (nenhum aço) | "atrasada" (entrega já devia ter chegado)
 *         | "tarde" (programado para depois do início) | "ok"
 */
export function acoParaLajes(cr, entregas, hoje, opcoes) {
  if (!cr) return [];
  const antecedencia = (opcoes && opcoes.antecedencia) || ANTECEDENCIA;
  const limite = somarDias(hoje, antecedencia);
  const comChaves = (entregas || []).filter((e) => e.status !== "cancelado").map((e) => ({ e, ch: chavesDaEntrega(e) }));
  const out = [];
  cr.tarefas.forEach((t) => {
    if (t.resumo || !t.ini || t.pct >= 100) return;
    if (!t.caminho.length || !/ESTRUTURA/i.test(t.caminho[0])) return;
    const chave = chaveDaTarefa(t.nome); if (!chave) return;
    if (t.ini > limite) return;                                   // ainda longe
    if (t.ini < hoje && (t.pct >= 50 || diasEntre(t.ini, hoje) > 14)) return; // já bem andada: o aço já veio
    // a mesma chave aparece em lajes de épocas diferentes (teto e complemento do
    // 4º embasamento): só vale entrega de no máximo 60 dias antes do início
    const desde = somarDias(t.ini, -60);
    // v1.18: laje já concretada → o aço chegou; nada a cobrar
    if (((opcoes && opcoes.concretadas && opcoes.concretadas.get(chave)) || []).some((d) => d >= desde)) return;
    const ligadas = comChaves.filter((x) => x.ch.has(chave) && ((x.e.dataEntrega || x.e.dataPrevista || "9999") >= desde)).map((x) => x.e);
    let tipo = "ok";
    const pendentes = ligadas.filter((e) => e.status !== "entregue" && !e._concretadoEm);
    if (!ligadas.length) tipo = "sem";
    else if (pendentes.some((e) => situacao(e, hoje) === "atrasada")) tipo = "atrasada";
    else if (pendentes.some((e) => e.dataPrevista && e.dataPrevista > somarDias(t.ini, TOLERANCIA))) tipo = "tarde";
    out.push({ tarefa: t, chave, tipo, entregas: ligadas, diasParaInicio: diasEntre(hoje, t.ini) });
  });
  return out.sort((a, b) => a.tarefa.ini.localeCompare(b.tarefa.ini));
}

export function textoAviso(x, fmt) {
  const d = x.diasParaInicio, quando = d < 0 ? "começou em " + fmt(x.tarefa.ini) : d === 0 ? "começa hoje" : "começa em " + d + " dia(s) (" + fmt(x.tarefa.ini) + ")";
  if (x.tipo === "sem") return { titulo: "Programar aço — " + x.tarefa.nome, sub: quando + " · nenhuma entrega de aço cadastrada para esse pavimento" };
  if (x.tipo === "atrasada") return { titulo: "Aço atrasado para " + x.tarefa.nome, sub: quando + " · entrega prevista já passou e não foi recebida" };
  if (x.tipo === "tarde") {
    const ult = x.entregas.filter((e) => e.status !== "entregue").map((e) => e.dataPrevista).sort().pop();
    return { titulo: "Aço chega depois do início — " + x.tarefa.nome, sub: quando + " · aço previsto para " + fmt(ult) };
  }
  return { titulo: x.tarefa.nome, sub: quando + " · aço " + (x.entregas.every((e) => e.status === "entregue") ? "recebido" : "programado") };
}

// "pav:6" → "6º Pavimento" (para preencher o destino ao programar a entrega)
export function rotuloDaChave(ch) {
  const [k, n] = String(ch).split(":");
  return { pav: n + "º Pavimento", emb: n + "º Embasamento", subsolo: "Subsolo", cob: "Cobertura", dep: "Dependência", cm: "Casa de Máquinas / Reservatório" }[k] || ch;
}
