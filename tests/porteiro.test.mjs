// Porteiro de gravação e sincronização incremental: node tests/porteiro.test.mjs
import { carimbar, camposCarimbo, dadosExclusao, ativo, instalarPorteiro } from "../src/modulos/dados/porteiro.js";
import { desdeQuando, precisaCompleta, escutarColecao } from "../src/modulos/dados/sincronia.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
const AGORA = "2026-10-08T12:00:00.000Z";

// carimbo
ok(camposCarimbo("fvs")[0] === "updatedAt" && camposCarimbo("controleTecnologico")[0] === "atualizadoEm", "nomes dos campos seguem cada coleção");
const f = carimbar("fvs", { numero: "14", updatedAt: "2026-01-01T00:00:00Z" }, "a@b", AGORA);
ok(f.updatedAt === AGORA && f.updatedByEmail === "a@b" && f.numero === "14", "FVS: data sempre a de agora (mesmo vindo uma antiga) e quem gravou");
const c = carimbar("controleTecnologico", { fck: 40 }, "", AGORA);
ok(c.atualizadoEm === AGORA && !("atualizadoPor" in c), "sem e-mail: não grava quem");
const orig = { a: 1 }; carimbar("tarefas", orig, "x", AGORA);
ok(!("atualizadoEm" in orig), "não altera o objeto original");
const arr = [1]; ok(carimbar("fvs", arr, "x", AGORA) === arr, "não carimba o que não é objeto simples");

// lixeira
const ex = dadosExclusao("rastreabilidade", "m@sig", AGORA);
ok(ex.excluido === true && ex.excluidoPor === "m@sig" && ex.updatedAt === AGORA, "excluir = ir para a lixeira, com carimbo");
ok(ativo({ x: 1 }) && !ativo(ex) && !ativo(null), "ativo() esconde os da lixeira");

// instalação no Firestore (falso)
class Col { constructor(id) { this.id = id; } add(d) { gravado.push(["add", this.id, d]); return Promise.resolve(); } doc(id) { return new Doc(this, id); } }
class Doc { constructor(p, id) { this.parent = p; this.id = id; } set(d, o) { gravado.push(["set", this.parent.id, d, o]); return Promise.resolve(); } update(d) { gravado.push(["update", this.parent.id, d]); return Promise.resolve(); } delete() { gravado.push(["delete", this.parent.id]); return Promise.resolve(); } }
class Lote { set(r, d, o) { gravado.push(["lote.set", r.parent.id, d, o]); return this; } update(r, d) { gravado.push(["lote.update", r.parent.id, d]); return this; } commit() { return Promise.resolve(); } }
let gravado = [], leitura = false, pend = 0;
const fs = { DocumentReference: Doc, CollectionReference: Col, WriteBatch: Lote };
const ctx = { somenteLeitura: () => leitura, recusar: () => Promise.reject(new Error("leitura")), email: () => "eu@sig", agora: () => AGORA, pendente: (t, d) => { pend += d; }, nomeTipo: (c) => c };
instalarPorteiro(fs, ctx);
instalarPorteiro(fs, ctx); // instalar duas vezes não embrulha de novo
const fvs = new Col("fvs");
await fvs.doc("f1").set({ numero: "1" }, { merge: true });
ok(gravado[0][2].updatedAt === AGORA && gravado[0][2].updatedByEmail === "eu@sig" && gravado[0][3].merge, "set carimba e mantém as opções");
await fvs.doc("f1").update({ fechado: true });
ok(gravado[1][2].updatedAt === AGORA, "update carimba");
await new Col("tarefas").add({ titulo: "x" });
ok(gravado[2][2].atualizadoEm === AGORA && gravado[2][2].atualizadoPor === "eu@sig", "add carimba");
const l = new Lote(); l.set(new Col("controleTecnologico").doc("n1"), { fck: 40 }, { merge: true }); l.update(fvs.doc("f2"), { a: 1 });
ok(gravado[3][2].atualizadoEm === AGORA && gravado[3][3].merge && gravado[4][2].updatedAt === AGORA, "lote carimba set e update");
await l.commit(); await Promise.resolve();
ok(pend === 0, "fila 'aguardando envio' volta a zero");
leitura = true; let recusou = false;
await fvs.doc("f1").set({ a: 1 }).catch(() => { recusou = true; });
ok(recusou && gravado.length === 5, "conta só de visualização: recusa sem gravar");

// sincronização
ok(desdeQuando("2026-10-08T12:00:00.000Z") === "2026-10-06T12:00:00.000Z", "pede alterações com 2 dias de folga");
ok(desdeQuando("") === "" && desdeQuando("lixo") === "", "sem carimbo no cache: baixa tudo");
const H = Date.parse(AGORA);
ok(precisaCompleta(0, 1, H) && precisaCompleta(H - 2 * 86400000, 1, H) && !precisaCompleta(H - 3600000, 1, H), "completa: nunca feita ou vencida");

// escutarColecao com coleção falsa
const mem = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
const snapDe = (docs, fromCache) => ({ size: docs.length, docs: docs.map(([id, x]) => ({ id, data: () => x })), metadata: { fromCache }, docChanges: () => docs.map(([id, x]) => ({ type: "added", doc: { id, data: () => x } })) });
let filtro = null, ouvinte = null;
const colF = { where(c, op, v) { filtro = [c, op, v]; return this; }, onSnapshot(fn) { ouvinte = fn; return () => { ouvinte = null; }; },
  get: () => Promise.resolve(snapDe([["a", { updatedAt: "2026-10-05T00:00:00.000Z" }], ["b", { updatedAt: "2026-10-07T10:00:00.000Z" }]], true)) };
let vistos = null;
const s1 = escutarColecao({ col: colF, campo: "updatedAt", chave: "k", dias: 1, armazenamento: mem, aoMudar: (m) => { vistos = new Map(m); } });
ok(filtro === null && ouvinte, "aparelho novo: baixa tudo");
ouvinte(snapDe([["a", { updatedAt: "x" }]], false));
ok(mem.getItem("k") && vistos.size === 1, "marca a completa quando veio do servidor");
s1.parar();
const s2 = escutarColecao({ col: colF, campo: "updatedAt", chave: "k", dias: 1, armazenamento: mem, aoMudar: (m) => { vistos = new Map(m); } });
await new Promise((r) => setTimeout(r, 0));
ok(vistos.size === 2 && filtro && filtro[2] === "2026-10-05T10:00:00.000Z", "depois: cache + só o que mudou desde o maior carimbo − 2 dias");
ouvinte(snapDe([["c", { updatedAt: "2026-10-08T00:00:00.000Z" }]], false));
ok(vistos.size === 3 && vistos.has("c"), "alteração nova entra no mapa");
s2.parar();

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
