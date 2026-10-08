/* Regras de aceitação do Controle Tecnológico (v1.18 — definidas pelo dono):
 *
 *  1. Notas ANTERIORES AO SISTEMA (concretadas antes da 1ª rastreabilidade do
 *     app) ficam fora de tudo: indicadores, pendências e cobranças.
 *  2. O fck exigido vem da planilha (40 ou 45 MPa). Os resultados que contam
 *     são os de 28 e 63 dias — 7 e 14 dias nunca geram pendência.
 *  3. "Concluído" na coluna Observação → nota concluída automaticamente.
 *     Observação com justificativa → fica EM ABERTO até o dono decidir.
 *  4. Bateu o fck aos 28 dias → conta como concluída, aguardando o de 63.
 *     Bateu aos 28 e aos 63 → concluída.
 *     Bateu aos 28 e NÃO bateu aos 63 (ou não bateu aos 28) → pendente:
 *     precisa da justificativa (causa e resolução) e da decisão do dono.
 *  5. O que o dono marcou como concluído no app não é mais alterado pelas
 *     planilhas importadas depois (a linha é ignorada na importação).
 *
 * A justificativa fica na própria nota (controleTecnologico/<id>):
 *   justificativaFck: { causa, resolucao, em, por }
 * Campo novo, aditivo — notas antigas continuam valendo.
 *
 * Sem dependências: roda no navegador e no Node (tests/regras-ct.test.mjs).
 */

export const IDADES_OBRIGATORIAS = ["28", "63"];

export function numero(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
// melhor resultado de uma idade (a planilha tem duas colunas: 28 e 28', 63 e 63')
export function melhor(row, idade) {
  const a = numero(row["r" + idade]), b = numero(row["r" + idade + "b"]);
  if (a == null && b == null) return null;
  return Math.max(a == null ? -Infinity : a, b == null ? -Infinity : b);
}
/** Idades (dentre 28 e 63) em que o resultado ficou abaixo do fck: [] | ["28"] | ["63"] | ["28","63"] */
export function abaixoEm(row) {
  const fck = numero(row.fck);
  if (fck == null) return [];
  return IDADES_OBRIGATORIAS.filter((i) => { const r = melhor(row, i); return r != null && r < fck; });
}
/* Concretagem ANTERIOR AO SISTEMA (antes da 1ª rastreabilidade do app) fica
 * fora dos indicadores. v1.18: vale pela data, sem precisar reimportar —
 * marcada à mão (true/false) na ficha da nota sempre prevalece. */
export function anterior(row, inicioISO) {
  if (!row) return false;
  if (row.anteriorAoSistema === true) return true;
  if (row.anteriorAoSistema === false) return false;
  return !!(inicioISO && row.dataConcretagem && row.dataConcretagem < inicioISO);
}
/* v1.17: a coluna Observação da planilha traz "Concluído" ou a justificativa
 * de cada ensaio. "Concluído" = nota concluída; o texto que não for só
 * "concluído/ok" vale como justificativa. */
export function obsConcluida(row) { return /CONCLU/i.test(String((row && row.observacao) || "")); }
export function obsJustificativa(row) {
  const t = String((row && row.observacao) || "")
    .replace(/conclu[ií]d[oa]s?/gi, "").replace(/^[\s.,;:|\-–—]+|[\s.,;:|\-–—]+$/g, "").trim();
  return t.length >= 5 && !/^(ok|finalizad[oa])$/i.test(t) ? t : "";
}
/** Justificativa: causa E resolução no app, ou o texto da Observação da planilha */
export function justificada(row) {
  const j = row && row.justificativaFck;
  return !!(j && String(j.causa || "").trim() && String(j.resolucao || "").trim()) || !!obsJustificativa(row);
}
/**
 * Situação da nota (v1.18):
 *  "anterior"   — antes do sistema: fora de tudo
 *  "concluida"  — marcada no app, "Concluído" na planilha ou bateu aos 28 e aos 63
 *  "ok28"       — bateu aos 28 dias; conta como concluída, aguarda o de 63
 *  "abaixo"     — não bateu (28 ou 63) e não há justificativa → pendente
 *  "decidir"    — justificativa na Observação da planilha, ou não bateu e já foi
 *                 justificada no app → em aberto até o dono decidir
 *  "aguardando" — ainda sem o resultado de 28 dias
 */
export function situacao(row) {
  if (anterior(row)) return "anterior";
  if (row.concluida === true || obsConcluida(row)) return "concluida";
  if (obsJustificativa(row)) return "decidir";
  if (abaixoEm(row).length) return justificada(row) ? "decidir" : "abaixo";
  const fck = numero(row.fck), r28 = melhor(row, "28"), r63 = melhor(row, "63");
  if (fck == null || r28 == null) return "aguardando";
  return r63 == null ? "ok28" : "concluida";
}
/** Conta como concluída nos indicadores (inclui "bateu aos 28, aguarda 63") */
export function concluida(row) { return ["anterior", "concluida", "ok28"].includes(situacao(row)); }
/** Precisa de ação do dono: resultado abaixo do fck sem justificativa ou à espera da decisão */
export function emAberto(row) { return ["abaixo", "decidir"].includes(situacao(row)); }
export function precisaJustificativa(row) { return situacao(row) === "abaixo" || situacao(row) === "decidir"; }
/** Ids das notas concretadas antes do início do sistema que ainda não foram marcadas (campo ausente) */
export function anterioresAoSistema(rows, inicioISO) {
  if (!inicioISO) return [];
  return rows.filter((r) => r.dataConcretagem && r.dataConcretagem < inicioISO && r.anteriorAoSistema == null).map((r) => r._id);
}
export function justificativaPendente(row) { return situacao(row) === "abaixo"; }
/** O que impede marcar a nota como concluída (lista de motivos em texto; vazia = pode concluir).
 * v1.18: quem decide é o dono — basta o resultado de 28 dias e, se ficou
 * abaixo do fck, a justificativa. */
export function impedimentosConcluir(row) {
  const out = [];
  if (melhor(row, "28") == null && situacao(row) !== "decidir") out.push("falta o resultado de 28 dias");
  if (justificativaPendente(row)) out.push("falta a justificativa (causa e resolução) do resultado abaixo do fck");
  return out;
}
/** Texto para a coluna Observação da planilha exportada */
export function observacaoComJustificativa(row) {
  const obs = String(row.observacao || "").trim();
  const j = row.justificativaFck;
  if (!(j && String(j.causa || "").trim() && String(j.resolucao || "").trim()) || !abaixoEm(row).length) return obs; // só a da planilha: já está na observação
  const txt = `Abaixo do fck aos ${abaixoEm(row).join(" e ")} dias. Causa: ${String(j.causa).trim()}. Resolução: ${String(j.resolucao).trim()}.`;
  return obs ? obs + " | " + txt : txt;
}
/** v1.18: Observação exportada — a da planilha + justificativa do app + "CONCLUÍDO"
 * quando a nota foi concluída no app (assim a planilha sai igual à do laboratório). */
export function observacaoExportada(row) {
  let obs = observacaoComJustificativa(row);
  if (row.concluida === true && !/CONCLU/i.test(obs)) obs = obs ? "CONCLUÍDO | " + obs : "CONCLUÍDO";
  return obs;
}
