/* Peças concretadas da rastreabilidade (v1.17): o mesmo elemento (ex.: "V1c")
 * não pode aparecer duas vezes na ficha — nem na mesma betonada, nem em outra.
 * O campo é texto livre por betonada: "V1c, V2a; P5 / P6". Separadores: vírgula,
 * ponto e vírgula, barra, quebra de linha e " e ". Comparação sem diferenciar
 * maiúsculas e espaços ("v1C" = "V1c", "Laje L11" = "laje  l11").
 * Sem dependências: roda no navegador e no Node (tests/pecas.test.mjs). */

export function separarPecas(txt) {
  return String(txt || "").split(/\s*(?:[,;/\n]|\se\s)\s*/i).map((p) => p.trim()).filter(Boolean);
}
export const chavePeca = (p) => String(p).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");

/**
 * Tira do texto da betonada `idx` as peças que já existem (antes nela mesma ou
 * em outra betonada). Devolve { texto, repetidas: [{ peca, seq }] } — seq é a
 * BT onde a peça já estava.
 */
export function semRepetidas(linhas, idx) {
  const ja = new Map(); // chave → seq da BT onde apareceu
  linhas.forEach((l, i) => {
    if (i === idx) return;
    separarPecas(l.pecas).forEach((p) => { const k = chavePeca(p); if (!ja.has(k)) ja.set(k, l.seq || i + 1); });
  });
  const proprias = new Set(), ficam = [], repetidas = [];
  separarPecas((linhas[idx] || {}).pecas).forEach((p) => {
    const k = chavePeca(p);
    if (ja.has(k)) repetidas.push({ peca: p, seq: ja.get(k) });
    else if (proprias.has(k)) repetidas.push({ peca: p, seq: (linhas[idx] || {}).seq || idx + 1 });
    else { proprias.add(k); ficam.push(p); }
  });
  return { texto: ficam.join(", "), repetidas };
}

/** Todas as repetições da ficha: [{ peca, seqs: [..] }] (vazio = tudo certo) */
export function pecasRepetidas(linhas) {
  const onde = new Map();
  (linhas || []).forEach((l, i) => separarPecas(l.pecas).forEach((p) => {
    const k = chavePeca(p);
    if (!onde.has(k)) onde.set(k, { peca: p, seqs: [] });
    onde.get(k).seqs.push(l.seq || i + 1);
  }));
  return [...onde.values()].filter((x) => x.seqs.length > 1);
}
