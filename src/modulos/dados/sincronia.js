/* Sincronização que baixa só o que mudou (v1.28 — fase A3 do plano).
 *
 * Antes só o controle tecnológico funcionava assim (v1.6). Agora vale para
 * FVS, rastreabilidade, plantas, aço e tarefas também:
 *   - ao abrir o app, os registros vêm do cache do aparelho (0 leituras) e só
 *     os alterados desde a última vez são baixados (carimbo do porteiro maior
 *     que o último visto, com 2 dias de folga para relógio de celular atrasado);
 *   - de tempos em tempos (ou num aparelho novo, ou sem cache) baixa tudo de
 *     novo por segurança.
 * Excluir nunca apaga de verdade (vai para a lixeira com excluido:true), então
 * a exclusão também chega aos outros aparelhos como uma alteração.
 */

const DIA = 86400000;
const FOLGA = 2 * DIA;

/** a partir de quando pedir alterações, dado o maior carimbo visto no cache ("" = baixar tudo) */
export function desdeQuando(maiorCarimbo) {
  const t = Date.parse(maiorCarimbo || "");
  return isNaN(t) ? "" : new Date(t - FOLGA).toISOString();
}

/** precisa baixar tudo de novo? (última completa há mais de `dias`) */
export function precisaCompleta(ultimaCompletaMs, dias, agoraMs) {
  return !(Number(ultimaCompletaMs) > 0) || (agoraMs - Number(ultimaCompletaMs)) > dias * DIA;
}

/**
 * Escuta uma coleção.
 *   col: CollectionReference (compat)
 *   campo: campo do carimbo ("updatedAt" ou "atualizadoEm")
 *   chave: nome no localStorage da data da última sincronização completa
 *   dias: de quantos em quantos dias baixa tudo
 *   aoMudar(mapa, snap): chamado a cada alteração (mapa: id → dados, inclui os da lixeira)
 *   aoErro(err)
 * Devolve { mapa, parar(), modo() } — modo: "completa" ou "incremental" (usado no teste de ponta a ponta).
 */
export function escutarColecao({ col, campo, chave, dias, aoMudar, aoErro, armazenamento }) {
  const ls = armazenamento || (typeof localStorage !== "undefined" ? localStorage : null);
  const mapa = new Map();
  let completa = true, unsub = null, parado = false, modo = "";
  try { completa = precisaCompleta(ls && ls.getItem(chave), dias, Date.now()); } catch (e) { /* sem localStorage */ }

  const tratar = (snap) => {
    snap.docChanges().forEach((ch) => {
      // no modo incremental, "removed" só quer dizer que saiu do filtro
      if (ch.type === "removed") { if (completa) mapa.delete(ch.doc.id); return; }
      mapa.set(ch.doc.id, ch.doc.data());
    });
    aoMudar(mapa, snap);
  };
  const escutar = (desde) => {
    if (parado) return;
    modo = desde ? "incremental" : "completa";
    const q = desde ? col.where(campo, ">", desde) : col;
    unsub = q.onSnapshot((snap) => {
      tratar(snap);
      if (!desde && !snap.metadata.fromCache) { try { ls && ls.setItem(chave, String(Date.now())); } catch (e) { /* ok */ } }
    }, aoErro);
  };
  const tudo = () => { completa = true; mapa.clear(); escutar(""); };

  if (completa) tudo();
  else {
    col.get({ source: "cache" }).then((snap) => {
      if (parado) return;
      if (!snap.size) { tudo(); return; }
      let maior = "";
      snap.docs.forEach((d) => {
        const x = d.data(); mapa.set(d.id, x);
        if (x[campo] && String(x[campo]) > maior) maior = String(x[campo]);
      });
      aoMudar(mapa, snap);
      const desde = desdeQuando(maior);
      if (desde) escutar(desde); else tudo();
    }).catch(() => { if (!parado) tudo(); });
  }
  return { mapa, modo: () => modo, parar() { parado = true; if (unsub) unsub(); unsub = null; } };
}
