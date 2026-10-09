/* Porteiro único de gravação (v1.28 — fase A2 do plano de arquitetura).
 *
 * Toda gravação do app (set, update, add e lotes) passa por aqui antes de ir
 * para o banco. O porteiro:
 *   1. recusa na hora quem só pode visualizar;
 *   2. CARIMBA o documento com quando e quem gravou (o mesmo carimbo em todas
 *      as áreas — é ele que permite baixar só o que mudou, o histórico e a
 *      lixeira das próximas fases);
 *   3. avisa o selo "aguardando envio" do topo.
 *
 * Os nomes dos campos do carimbo seguem o que cada coleção já usa, para não
 * mexer nos dados antigos nem nas regras do banco: FVS e rastreabilidade usam
 * updatedAt/updatedByEmail; as outras, atualizadoEm/atualizadoPor.
 *
 * Esta parte não depende do Firebase: roda no Node (tests/porteiro.test.mjs).
 */

const CARIMBO = {
  fvs: ["updatedAt", "updatedByEmail"],
  rastreabilidade: ["updatedAt", "updatedByEmail"],
};
const CARIMBO_PADRAO = ["atualizadoEm", "atualizadoPor"];

/** [campo da data, campo de quem gravou] da coleção */
export function camposCarimbo(colecao) {
  return CARIMBO[colecao] || CARIMBO_PADRAO;
}

/** objeto simples ({ ... }) — não carimba FieldPath, arrays etc. */
function objetoSimples(x) {
  return x != null && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype;
}

/**
 * Devolve uma CÓPIA de `dados` com o carimbo de agora (a data sempre é a de
 * agora, mesmo que venha uma antiga copiada da ficha; quem gravou só entra se
 * houver e-mail).
 */
export function carimbar(colecao, dados, email, agoraISO) {
  if (!objetoSimples(dados)) return dados;
  const [campoData, campoQuem] = camposCarimbo(colecao);
  const out = Object.assign({}, dados);
  out[campoData] = agoraISO;
  if (email) out[campoQuem] = email;
  return out;
}

/** Dados para mandar um registro para a lixeira (nunca se apaga de verdade). */
export function dadosExclusao(colecao, email, agoraISO) {
  return carimbar(colecao, { excluido: true, excluidoEm: agoraISO, excluidoPor: email || "" }, email, agoraISO);
}

/** registro ativo (fora da lixeira) */
export function ativo(dados) {
  return !!dados && dados.excluido !== true;
}

// ---------- v1.30: histórico de alterações (fase B2) ----------
// Cada gravação vira uma linha no histórico do dia: auditoria/AAAA-MM-DD,
// lista "entradas" que só cresce. Um documento por dia (e não um por
// alteração) para o histórico e o backup lerem pouco do banco.
export const COLECOES_AUDITADAS = ["fvs", "rastreabilidade", "controleTecnologico", "entregasAco", "tarefas", "plantas", "cronogramas", "assinaturas", "equipe"];
const CAMPOS_IGNORADOS = new Set(["updatedAt", "updatedByEmail", "atualizadoEm", "atualizadoPor", "excluido", "excluidoEm", "excluidoPor", "restauradoEm", "restauradoPor", "editadoNoSite", "travadaEm", "travadaPor"]);
const vazio = (x) => x === undefined || x === null || x === "" || (Array.isArray(x) && !x.length);
const igual = (a, b) => { if (vazio(a) && vazio(b)) return true; try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } };

/**
 * Linha do histórico para uma gravação (ou null se não há o que registrar).
 *   metodo: "set" | "update" | "add" | "delete"; merge: set com { merge:true }
 *   anterior: como o registro estava no aparelho (ou null se não se sabe / novo)
 */
export function entradaAuditoria({ colecao, id, metodo, dados, merge, anterior, email, agoraISO }) {
  if (COLECOES_AUDITADAS.indexOf(colecao) === -1) return null;
  const d = objetoSimples(dados) ? dados : {};
  let acao;
  if (metodo === "delete") acao = "apagou";
  else if (d.excluido === true) acao = "excluiu";
  else if (d.excluido === false && anterior && anterior.excluido === true) acao = "restaurou";
  else if (metodo === "add" || (!anterior && metodo === "set" && !merge)) acao = "criou";
  else acao = "alterou";
  let campos = Object.keys(d).filter((k) => !CAMPOS_IGNORADOS.has(k));
  if (anterior && acao === "alterou") campos = campos.filter((k) => !igual(d[k], anterior[k]));
  if (acao === "alterou" && !campos.length) return null; // nada mudou de fato
  return { em: agoraISO, por: email || "", col: colecao, id: id || "", acao, campos: campos.slice(0, 25) };
}

/** id do documento do dia (data local do aparelho) */
export function diaAuditoria(data) {
  const d = data || new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/**
 * Instala o porteiro nas funções de gravação do Firestore (compat).
 *   fs: firebase.firestore (o namespace, com DocumentReference etc.)
 *   ctx: { somenteLeitura(): bool, recusar(): Promise, email(): string,
 *          agora(): string ISO, pendente(tipo, +1|-1), nomeTipo(colecao): string,
 *          db(): Firestore (para o histórico), anterior(colecao, id): dados no aparelho }
 */
export function instalarPorteiro(fs, ctx) {
  const colecaoDe = (ref) => (ref instanceof fs.CollectionReference ? ref.id : ref && ref.parent && ref.parent.id) || "";
  const originais = {
    set: fs.DocumentReference.prototype.set.__original || fs.DocumentReference.prototype.set,
  };
  // grava linhas no histórico do dia — por fora do porteiro (sem carimbo, sem
  // contar na fila) e sem nunca atrapalhar a gravação principal
  const registrar = (entradas) => {
    entradas = entradas.filter(Boolean);
    if (!entradas.length || !ctx.db) return;
    try {
      const ref = ctx.db().collection("auditoria").doc(diaAuditoria());
      originais.set.call(ref, { entradas: fs.FieldValue.arrayUnion(...entradas) }, { merge: true })
        .catch((e) => console.warn("histórico:", e && e.code));
    } catch (e) { console.warn("histórico:", e); }
  };
  const entrada = (ref, metodo, dados, opcoes, idNovo) => {
    const col = colecaoDe(ref), id = idNovo || (ref instanceof fs.CollectionReference ? "" : ref.id);
    let anterior = null;
    try { anterior = ctx.anterior ? ctx.anterior(col, id) : null; } catch (e) { /* sem anterior */ }
    return entradaAuditoria({ colecao: col, id, metodo, dados, merge: !!(opcoes && (opcoes.merge || opcoes.mergeFields)), anterior, email: ctx.email(), agoraISO: ctx.agora() });
  };
  const carimbarArgs = (ref, args) => {
    if (args.length && objetoSimples(args[0])) {
      args = Array.from(args);
      args[0] = carimbar(colecaoDe(ref), args[0], ctx.email(), ctx.agora());
    }
    return args;
  };
  const embrulhar = (proto, metodo, { carimba, tipo }) => {
    const original = proto[metodo];
    if (!original || original.__porteiro) return;
    const novo = function (...args) {
      if (ctx.somenteLeitura()) return ctx.recusar();
      if (carimba) args = carimbarArgs(this, args);
      let alvo = this, idNovo = "";
      if (metodo === "add") { // add = doc com id novo + set: assim o histórico já sabe o id
        alvo = this.doc(); idNovo = alvo.id;
      }
      if (metodo === "commit") registrar(this.__historico || []);
      else registrar([entrada(this, metodo, args[0], args[1], idNovo)]);
      const p = metodo === "add" ? originais.set.call(alvo, args[0]).then(() => alvo) : original.apply(this, args);
      const t = tipo(this);
      ctx.pendente(t, +1);
      p.then(() => ctx.pendente(t, -1), () => ctx.pendente(t, -1));
      return p;
    };
    novo.__porteiro = true;
    novo.__original = original;
    proto[metodo] = novo;
  };
  const tipoRef = (ref) => ctx.nomeTipo(colecaoDe(ref));
  embrulhar(fs.DocumentReference.prototype, "set", { carimba: true, tipo: tipoRef });
  embrulhar(fs.DocumentReference.prototype, "update", { carimba: true, tipo: tipoRef });
  embrulhar(fs.DocumentReference.prototype, "delete", { carimba: false, tipo: tipoRef });
  embrulhar(fs.CollectionReference.prototype, "add", { carimba: true, tipo: tipoRef });
  embrulhar(fs.WriteBatch.prototype, "commit", { carimba: false, tipo: () => "alterações em lote" });
  // dentro do lote: carimba e guarda a linha do histórico (gravada no commit);
  // a contagem "aguardando envio" é feita no commit
  ["set", "update"].forEach((m) => {
    const original = fs.WriteBatch.prototype[m];
    if (!original || original.__porteiro) return;
    const novo = function (ref, ...args) {
      args = carimbarArgs(ref, args);
      (this.__historico || (this.__historico = [])).push(entrada(ref, m, args[0], args[1]));
      return original.call(this, ref, ...args);
    };
    novo.__porteiro = true;
    fs.WriteBatch.prototype[m] = novo;
  });
}
