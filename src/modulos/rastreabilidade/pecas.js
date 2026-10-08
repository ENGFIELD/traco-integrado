/* Peças concretadas da rastreabilidade (v1.21): o mesmo elemento (ex.: "V5b")
 * não pode aparecer duas vezes NA MESMA BETONADA (mesma linha / mesma NF).
 * Em betonadas diferentes pode — a mesma peça pode receber concreto de mais
 * de um caminhão. O campo é texto livre por betonada: "V5b, L5; P6 / P7".
 * Separadores: vírgula, ponto e vírgula, barra, quebra de linha e " e ".
 * Comparação sem diferenciar maiúsculas e espaços ("v5B" = "V5b").
 * Sem dependências: roda no navegador e no Node (tests/pecas.test.mjs). */

export function separarPecas(txt) {
  return String(txt || "").split(/\s*(?:[,;/\n]|\se\s)\s*/i).map((p) => p.trim()).filter(Boolean);
}
export const chavePeca = (p) => String(p).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");

/** Peças repetidas dentro de um texto (uma linha): ["V5b"] */
export function repetidasNoTexto(txt) {
  const primeira = new Map(), rep = [];
  separarPecas(txt).forEach((p) => {
    const k = chavePeca(p);
    if (!primeira.has(k)) primeira.set(k, p);
    else if (!rep.includes(primeira.get(k))) rep.push(primeira.get(k));
  });
  return rep;
}

/**
 * Tira do texto da betonada `idx` as peças repetidas NELA MESMA (fica a 1ª).
 * Devolve { texto, repetidas: [{ peca, seq }] }.
 */
export function semRepetidas(linhas, idx) {
  const l = linhas[idx] || {}, vistos = new Set(), ficam = [], repetidas = [];
  separarPecas(l.pecas).forEach((p) => {
    const k = chavePeca(p);
    if (vistos.has(k)) repetidas.push({ peca: p, seq: l.seq || idx + 1 });
    else { vistos.add(k); ficam.push(p); }
  });
  return { texto: ficam.join(", "), repetidas };
}

/** Repetições dentro de cada betonada: [{ peca, seq }] (vazio = tudo certo) */
export function pecasRepetidas(linhas) {
  const out = [];
  (linhas || []).forEach((l, i) => repetidasNoTexto(l.pecas).forEach((p) => out.push({ peca: p, seq: l.seq || i + 1 })));
  return out;
}
