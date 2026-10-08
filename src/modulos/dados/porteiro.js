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

/**
 * Instala o porteiro nas funções de gravação do Firestore (compat).
 *   fs: firebase.firestore (o namespace, com DocumentReference etc.)
 *   ctx: { somenteLeitura(): bool, recusar(): Promise, email(): string,
 *          agora(): string ISO, pendente(tipo, +1|-1), nomeTipo(colecao): string }
 */
export function instalarPorteiro(fs, ctx) {
  const colecaoDe = (ref) => (ref instanceof fs.CollectionReference ? ref.id : ref && ref.parent && ref.parent.id) || "";
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
      const p = original.apply(this, args);
      const t = tipo(this);
      ctx.pendente(t, +1);
      p.then(() => ctx.pendente(t, -1), () => ctx.pendente(t, -1));
      return p;
    };
    novo.__porteiro = true;
    proto[metodo] = novo;
  };
  const tipoRef = (ref) => ctx.nomeTipo(colecaoDe(ref));
  embrulhar(fs.DocumentReference.prototype, "set", { carimba: true, tipo: tipoRef });
  embrulhar(fs.DocumentReference.prototype, "update", { carimba: true, tipo: tipoRef });
  embrulhar(fs.DocumentReference.prototype, "delete", { carimba: false, tipo: tipoRef });
  embrulhar(fs.CollectionReference.prototype, "add", { carimba: true, tipo: tipoRef });
  embrulhar(fs.WriteBatch.prototype, "commit", { carimba: false, tipo: () => "alterações em lote" });
  // dentro do lote: só carimba (a contagem "aguardando envio" é feita no commit)
  ["set", "update"].forEach((m) => {
    const original = fs.WriteBatch.prototype[m];
    if (!original || original.__porteiro) return;
    const novo = function (ref, ...args) {
      return original.call(this, ref, ...carimbarArgs(ref, args));
    };
    novo.__porteiro = true;
    fs.WriteBatch.prototype[m] = novo;
  });
}
