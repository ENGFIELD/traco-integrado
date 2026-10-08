/* Corte esquemático do prédio com o avanço da estrutura (Início, v1.5).
 *
 * Recebe os 28 níveis da obra (00 Fundação … 27 Telhado) já com o status
 * calculado no main.js a partir das fichas:
 *   "liberado"   — concretado e todas as FVS do pavimento fechadas
 *   "concretado" — existe rastreabilidade (concretagem) do pavimento
 *   "execucao"   — tem FVS aberta, mas ainda sem concretagem
 *   "nada"       — sem registro
 * Embasamento (níveis 0–6) desenhado mais largo que a torre (7+).
 */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function corteHtml(av) {
  const N = av.niveis.length;
  const H = 9, G = 2, topo = 18, base = topo + N * (H + G);
  const solo = topo + (N - 2) * (H + G) - G / 2; // linha do terreno: abaixo do térreo/1º embasamento (níveis 0 e 1 enterrados)
  const xEmb = 8, wEmb = 176, xTor = 30, wTor = 118;
  const rects = av.niveis.map((n, i) => {
    const y = topo + (N - 1 - i) * (H + G);
    const emb = n.rank <= 6;
    const x = emb ? xEmb : xTor, w = emb ? wEmb : wTor;
    return `<rect class="cp-nivel cp-${n.status}" x="${x}" y="${y}" width="${w}" height="${H}" rx="1.5" data-nivel="${n.rank}">
      <title>${esc(String(n.rank).padStart(2, "0") + " — " + n.nome)}: ${esc(rotulo(n.status))}${n.rast ? " · " + n.rast + " concretagem(ns)" : ""}${n.fvs ? " · " + n.fvsFechadas + "/" + n.fvs + " FVS fechadas" : ""}</title></rect>`;
  }).join("");
  let marcador = "";
  // nível em que o cronograma diz que a estrutura deveria estar hoje (tracejado)
  let prevMarca = "";
  if (av.previsto != null) {
    const yp = topo + (N - 1 - av.previsto) * (H + G) - G / 2;
    prevMarca = `<line x1="2" x2="${xEmb + wEmb + 4}" y1="${yp}" y2="${yp}" class="cp-prev"><title>Previsto pelo cronograma para hoje</title></line>`;
  }
  if (av.topo != null) {
    const y = topo + (N - 1 - av.topo) * (H + G) + H / 2;
    marcador = `<line x1="${xEmb + wEmb + 4}" x2="${xEmb + wEmb + 22}" y1="${y}" y2="${y}" class="cp-seta"/>
      <circle cx="${xEmb + wEmb + 4}" cy="${y}" r="3" class="cp-seta-p"/>`;
  }
  const svg = `<svg class="cp-svg" viewBox="0 0 ${xEmb + wEmb + 26} ${base + 6}" role="img" aria-label="Corte do prédio: ${av.pct}% da estrutura concretada">
      <line x1="0" x2="${xEmb + wEmb + 26}" y1="${solo}" y2="${solo}" class="cp-solo"/>
      ${rects}${prevMarca}${marcador}</svg>`;
  const topoNome = av.topo != null ? av.niveis[av.topo].nome : null;
  return `<div class="cp">
    <div class="cp-desenho">${svg}</div>
    <div class="cp-info">
      <div class="cp-pct"><b>${av.pct}<small>%</small></b><span>da estrutura concretada</span></div>
      <div class="cp-ate">${topoNome ? `Executado até o piso do <b>${esc(topoNome)}</b>` : "Nenhuma concretagem registrada ainda"}</div>
      ${av.previsto != null ? compara(av) : ""}
      <div class="cp-barra"><i style="width:${av.pct}%"></i></div>
      <ul class="cp-leg">
        <li><i class="cp-liberado"></i>Liberado <b>${av.cont.liberado}</b><small>concretado + FVS fechadas</small></li>
        <li><i class="cp-concretado"></i>Concretado <b>${av.cont.concretado}</b><small>FVS ainda abertas</small></li>
        <li><i class="cp-execucao"></i>Em execução <b>${av.cont.execucao}</b><small>FVS aberta, sem concretagem</small></li>
        <li><i class="cp-nada"></i>A executar <b>${av.cont.nada}</b></li>
      </ul>
      <div class="cp-dica">Toque num pavimento do corte para ver as fichas dele.</div>
    </div>
  </div>`;
}

function compara(av) {
  const dif = (av.topo == null ? -1 : av.topo) - av.previsto;
  const prevNome = av.niveis[av.previsto] ? av.niveis[av.previsto].nome : "";
  const txt = dif === 0 ? "em dia com o cronograma" : (dif > 0 ? `${dif} pavimento(s) adiantado` : `${-dif} pavimento(s) atrasado`);
  return `<div class="cp-prevtxt ${dif < 0 ? "atraso" : "ok"}">Cronograma previa até o piso do <b>${esc(prevNome)}</b> hoje — <b>${txt}</b></div>`;
}

export function rotulo(st) {
  return { liberado: "liberado", concretado: "concretado", execucao: "em execução", nada: "a executar" }[st] || st;
}

/* v1.14: corte por etapa (Alvenaria, Instalações, Revestimento…).
 * Mesmo desenho do corte da estrutura, mas cada nível vem do cronograma
 * (média do % das atividades daquela etapa naquele nível) junto com as FVS:
 *   d = { nome, pct, topo, previsto, inicio (ISO, se ainda não começou),
 *         temFvs (a etapa já tem ficha no app), niveis: [{ rank, nome, st, pct }] }
 *   st: liberado · fvsaberta · concluido · semfvs · execucao · nada · na
 */
const ROTULO_ETAPA = {
  liberado: "concluído, FVS fechada", fvsaberta: "concluído, FVS aberta", concluido: "concluído",
  semfvs: "concluído sem FVS", execucao: "em andamento", nada: "a executar", na: "não está no cronograma",
};
const CLASSE_ETAPA = { liberado: "liberado", fvsaberta: "concretado", concluido: "concretado", semfvs: "semfvs", execucao: "execucao", nada: "nada", na: "na" };

export function corteEtapaHtml(d, fmtData) {
  const N = d.niveis.length;
  const H = 9, G = 2, topo = 18, base = topo + N * (H + G);
  const solo = topo + (N - 2) * (H + G) - G / 2;
  const xEmb = 8, wEmb = 176, xTor = 30, wTor = 118;
  const cont = {};
  const rects = d.niveis.map((n, i) => {
    cont[n.st] = (cont[n.st] || 0) + 1;
    const y = topo + (N - 1 - i) * (H + G);
    const emb = n.rank <= 6;
    const x = emb ? xEmb : xTor, w = emb ? wEmb : wTor;
    const tit = `<title>${esc(String(n.rank).padStart(2, "0") + " — " + n.nome)}: ${esc(ROTULO_ETAPA[n.st])}${n.pct != null && n.st !== "na" ? " · " + n.pct + "%" : ""}</title>`;
    // em andamento: o pedaço já feito aparece preenchido dentro do pavimento
    const parte = n.st === "execucao" ? `<rect class="cp-parcial" x="${x}" y="${y}" width="${Math.max(2, w * n.pct / 100).toFixed(1)}" height="${H}" rx="1.5" pointer-events="none"/>` : "";
    return `<rect class="cp-nivel cp-${CLASSE_ETAPA[n.st]}" x="${x}" y="${y}" width="${w}" height="${H}" rx="1.5" data-nivel="${n.rank}">${tit}</rect>${parte}`;
  }).join("");
  let prevMarca = "", marcador = "";
  if (d.previsto != null) {
    const yp = topo + (N - 1 - d.previsto) * (H + G) - G / 2;
    prevMarca = `<line x1="2" x2="${xEmb + wEmb + 4}" y1="${yp}" y2="${yp}" class="cp-prev"><title>Previsto pelo cronograma para hoje</title></line>`;
  }
  if (d.topo != null) {
    const y = topo + (N - 1 - d.topo) * (H + G) + H / 2;
    marcador = `<line x1="${xEmb + wEmb + 4}" x2="${xEmb + wEmb + 22}" y1="${y}" y2="${y}" class="cp-seta"/><circle cx="${xEmb + wEmb + 4}" cy="${y}" r="3" class="cp-seta-p"/>`;
  }
  const svg = `<svg class="cp-svg" viewBox="0 0 ${xEmb + wEmb + 26} ${base + 6}" role="img" aria-label="Corte do prédio: ${d.pct}% de ${esc(d.nome)}">
      <line x1="0" x2="${xEmb + wEmb + 26}" y1="${solo}" y2="${solo}" class="cp-solo"/>${rects}${prevMarca}${marcador}</svg>`;
  let ate;
  if (d.inicio) ate = `Começa em <b>${esc(fmtData(d.inicio))}</b> pelo cronograma`;
  else if (d.topo != null) ate = `Concluída até o <b>${esc(d.niveis[d.topo].nome)}</b>`;
  else ate = "Ainda não chegou a 100% em nenhum pavimento";
  let comp = "";
  if (d.previsto != null && !d.inicio) {
    const dif = (d.topo == null ? -1 : d.topo) - d.previsto;
    const txt = dif === 0 ? "em dia com o cronograma" : (dif > 0 ? `${dif} pavimento(s) adiantado` : `${-dif} pavimento(s) atrasado`);
    comp = `<div class="cp-prevtxt ${dif < 0 ? "atraso" : "ok"}">Cronograma previa até o <b>${esc(d.niveis[d.previsto].nome)}</b> hoje — <b>${txt}</b></div>`;
  }
  const item = (st, rot, sub) => `<li><i class="cp-${CLASSE_ETAPA[st]}"></i>${rot} <b>${cont[st] || 0}</b>${sub ? `<small>${sub}</small>` : ""}</li>`;
  const leg = d.temFvs
    ? item("liberado", "Liberado", "100% e FVS fechada") + item("fvsaberta", "FVS aberta", "100%, ficha ainda aberta")
      + item("semfvs", "Falta FVS", "100% no cronograma, sem ficha") + item("execucao", "Em andamento") + item("nada", "A executar")
    : item("concluido", "Concluído", "esta etapa ainda não tem FVS no app") + item("execucao", "Em andamento") + item("nada", "A executar");
  return `<div class="cp">
    <div class="cp-desenho">${svg}</div>
    <div class="cp-info">
      <div class="cp-pct"><b>${d.pct}<small>%</small></b><span>de ${esc(d.nome.toLowerCase())} concluída</span></div>
      <div class="cp-ate">${ate}</div>
      ${comp}
      <div class="cp-barra"><i style="width:${d.pct}%"></i></div>
      <ul class="cp-leg">${leg}<li><i class="cp-na"></i>Fora do cronograma <b>${cont.na || 0}</b></li></ul>
      <div class="cp-dica">Toque num pavimento para ver as fichas dele. % pelo cronograma (média ponderada pela duração, como no MS Project).</div>
    </div>
  </div>`;
}
