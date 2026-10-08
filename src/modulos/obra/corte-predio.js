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
  if (av.topo != null) {
    const y = topo + (N - 1 - av.topo) * (H + G) + H / 2;
    marcador = `<line x1="${xEmb + wEmb + 4}" x2="${xEmb + wEmb + 22}" y1="${y}" y2="${y}" class="cp-seta"/>
      <circle cx="${xEmb + wEmb + 4}" cy="${y}" r="3" class="cp-seta-p"/>`;
  }
  const svg = `<svg class="cp-svg" viewBox="0 0 ${xEmb + wEmb + 26} ${base + 6}" role="img" aria-label="Corte do prédio: ${av.pct}% da estrutura concretada">
      <line x1="0" x2="${xEmb + wEmb + 26}" y1="${solo}" y2="${solo}" class="cp-solo"/>
      ${rects}${marcador}</svg>`;
  const topoNome = av.topo != null ? av.niveis[av.topo].nome : null;
  return `<div class="cp">
    <div class="cp-desenho">${svg}</div>
    <div class="cp-info">
      <div class="cp-pct"><b>${av.pct}<small>%</small></b><span>da estrutura concretada</span></div>
      <div class="cp-ate">${topoNome ? `Executado até o piso do <b>${esc(topoNome)}</b>` : "Nenhuma concretagem registrada ainda"}</div>
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

export function rotulo(st) {
  return { liberado: "liberado", concretado: "concretado", execucao: "em execução", nada: "a executar" }[st] || st;
}
