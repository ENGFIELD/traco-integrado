/* Regras de aceitação do Controle Tecnológico (v1.16 — definidas pelo dono):
 *
 *  1. Aos 28 dias o concreto TEM que atingir o fck especificado.
 *  2. O resultado de 63 dias é sempre obrigatório (mesmo que os 28 tenham
 *     batido): a nota só fica "concluída" com 28 e 63 lançados.
 *  3. Se ficar abaixo do fck aos 28 OU aos 63 dias, é obrigatório registrar
 *     a justificativa: a CAUSA e a RESOLUÇÃO tomada. Até lá a nota aparece
 *     em "Hoje você precisa…" e não pode ser marcada como concluída.
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
/* v1.17: concretagem ANTERIOR AO SISTEMA (antes da 1ª rastreabilidade do app)
 * fica fora dos indicadores e conta como concluída. */
export function anterior(row) { return !!row && row.anteriorAoSistema === true; }
/* v1.17: a coluna Observação da planilha traz "Concluído" ou a justificativa
 * de cada ensaio. "Concluído" = nota concluída; o texto que não for só
 * "concluído/ok" vale como justificativa. */
export function obsConcluida(row) { return /CONCLU/i.test(String((row && row.observacao) || "")); }
export function obsJustificativa(row) {
  const t = String((row && row.observacao) || "")
    .replace(/conclu[ií]d[oa]s?/gi, "").replace(/^[\s.,;:|\-–—]+|[\s.,;:|\-–—]+$/g, "").trim();
  return t.length >= 5 && !/^(ok|finalizad[oa])$/i.test(t) ? t : "";
}
/** Nota concluída: anterior ao sistema, "Concluído" na observação ou marcada no app */
export function concluida(row) { return anterior(row) || obsConcluida(row) || (!!row && row.concluida === true); }
export function precisaJustificativa(row) { return !anterior(row) && abaixoEm(row).length > 0; }
/** Justificativa: causa E resolução no app, ou o texto da Observação da planilha */
export function justificada(row) {
  const j = row && row.justificativaFck;
  return !!(j && String(j.causa || "").trim() && String(j.resolucao || "").trim()) || !!obsJustificativa(row);
}
/** Ids das notas concretadas antes do início do sistema que ainda não foram marcadas (campo ausente) */
export function anterioresAoSistema(rows, inicioISO) {
  if (!inicioISO) return [];
  return rows.filter((r) => r.dataConcretagem && r.dataConcretagem < inicioISO && r.anteriorAoSistema == null).map((r) => r._id);
}
export function justificativaPendente(row) { return precisaJustificativa(row) && !justificada(row); }
/** O que impede marcar a nota como concluída (lista de motivos em texto; vazia = pode concluir) */
export function impedimentosConcluir(row) {
  const out = [];
  IDADES_OBRIGATORIAS.forEach((i) => { if (melhor(row, i) == null) out.push(`falta o resultado de ${i} dias`); });
  if (justificativaPendente(row)) out.push("falta a justificativa (causa e resolução) do resultado abaixo do fck");
  return out;
}
/** Texto para a coluna Observação da planilha exportada */
export function observacaoComJustificativa(row) {
  const obs = String(row.observacao || "").trim();
  const j = row.justificativaFck;
  if (!(j && String(j.causa || "").trim() && String(j.resolucao || "").trim())) return obs; // só a da planilha: já está na observação
  const txt = `Abaixo do fck aos ${abaixoEm(row).join(" e ")} dias. Causa: ${String(j.causa).trim()}. Resolução: ${String(j.resolucao).trim()}.`;
  return obs ? obs + " | " + txt : txt;
}
