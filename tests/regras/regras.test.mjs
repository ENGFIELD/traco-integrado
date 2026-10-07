/* Testes das regras de segurança da v2 (firestore.v2.rules).
 * Rodar:  npm run test:regras
 * (sobe um Firestore Emulator SEPARADO na porta 8180, com projeto de
 *  demonstração — não toca no banco real nem na cópia de testes.)
 *
 * Cada teste corresponde a uma linha da matriz de permissões do
 * docs/PLANO_V2.md (seção 3) ou a uma garantia da seção 4.
 */
import { test, before, after, beforeEach } from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const O = "belavista-ipanema";
const ST = () => firebase.firestore.FieldValue.serverTimestamp();
const AGORA_CELULAR = () => firebase.firestore.Timestamp.fromDate(new Date());

// Equipe (mesmos papéis aprovados em 07/10/2026) + casos de borda
const EQUIPE = {
  matheus: { papel: "admin", adminGlobal: true },
  suellen: { papel: "admin", adminGlobal: true },
  alice:   { papel: "tecnico" },
  jessica: { papel: "visualizador" },
  joao:    { papel: "encarregado" },
  eng:     { papel: "engenheiro" },
  outro:   { papel: null },                 // conta sem papel nesta obra
  inativo: { papel: "admin", ativo: false } // conta desativada
};

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traco-regras",
    firestore: { host: "127.0.0.1", port: 8180, rules: fs.readFileSync("firestore.v2.rules", "utf8") },
  });
});
after(async () => { if (env) await env.cleanup(); });

// Estado inicial de cada teste
const base = (extra) => ({
  obraId: O, schema: 2, versao: 1, numero: "004-001", fechado: false,
  criadoEm: firebase.firestore.Timestamp.fromMillis(1_700_000_000_000),
  atualizadoEm: firebase.firestore.Timestamp.fromMillis(1_700_000_000_000),
  criadoPor: { uid: "alice", nome: "Alice" }, atualizadoPor: { uid: "alice", nome: "Alice" },
  excluidoEm: null, excluidoPor: null, ultimaAuditoria: "aud-semente", ...extra,
});
const FICHAS = {
  aberta: base(),
  daSuellen: base({ criadoPor: { uid: "suellen", nome: "Suellen" } }),
  fechada: base({ fechado: true }),
  naLixeira: base({ excluidoEm: firebase.firestore.Timestamp.fromMillis(1_700_000_100_000), excluidoPor: { uid: "alice" } }),
};
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [u, p] of Object.entries(EQUIPE)) {
      await db.doc(`usuarios/${u}`).set({
        nome: u, email: `${u}@sig.eng.br`, ativo: p.ativo !== false,
        adminGlobal: !!p.adminGlobal, obras: p.papel ? { [O]: p.papel } : {},
      });
    }
    await db.doc(`obras/${O}`).set({ nome: "Consórcio de Construção Belavista Ipanema" });
    for (const [id, dados] of Object.entries(FICHAS)) await db.doc(`obras/${O}/fvs/${id}`).set(dados);
    await db.doc(`obras/${O}/auditoria/aud-semente`).set({ colecao: "fvs", docId: "x", acao: "criar", por: { uid: "alice" } });
    await db.doc("fvs/legado1").set({ numero: "antiga" });
  });
});

const dbDe = (u) => env.authenticatedContext(u).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Grava como o app da v2 vai gravar: documento + auditoria no mesmo lote.
function gravar(db, u, col, id, dados, { acao = "editar", semAuditoria = false, auditoriaDe = u, auditoriaPara } = {}) {
  const lote = db.batch();
  const aud = db.collection(`obras/${O}/auditoria`).doc();
  lote.set(db.doc(`obras/${O}/${col}/${id}`), semAuditoria ? dados : { ...dados, ultimaAuditoria: aud.id });
  if (!semAuditoria) {
    lote.set(aud, { colecao: col, docId: auditoriaPara || id, acao, por: { uid: auditoriaDe }, em: ST(), diff: {} });
  }
  return lote.commit();
}
const criarFvs = (u, extra = {}, opts) => gravar(dbDe(u), u, "fvs", "nova", {
  obraId: O, schema: 2, versao: 1, numero: "004-099", fechado: false,
  criadoEm: ST(), atualizadoEm: ST(), criadoPor: { uid: u }, atualizadoPor: { uid: u },
  excluidoEm: null, ...extra }, { acao: "criar", ...opts });
const editarFvs = (u, id, mudancas = {}, opts) => gravar(dbDe(u), u, "fvs", id, {
  ...FICHAS[id], versao: FICHAS[id].versao + 1, atualizadoEm: ST(), atualizadoPor: { uid: u }, ...mudancas }, opts);

// ---------------- leitura ----------------
test("sem login: não lê nada", async () => {
  await assertFails(anon().doc(`obras/${O}/fvs/aberta`).get());
});
test("visualizador (Jéssica) lê as fichas da obra", async () => {
  await assertSucceeds(dbDe("jessica").doc(`obras/${O}/fvs/aberta`).get());
});
test("conta sem papel na obra não lê", async () => {
  await assertFails(dbDe("outro").doc(`obras/${O}/fvs/aberta`).get());
});
test("conta desativada não lê (mesmo sendo admin)", async () => {
  await assertFails(dbDe("inativo").doc(`obras/${O}/fvs/aberta`).get());
});

// ---------------- criar / editar ----------------
test("visualizador não cria ficha", async () => { await assertFails(criarFvs("jessica")); });
test("encarregado não cria FVS (só RDO/pendências, nas próximas fases)", async () => { await assertFails(criarFvs("joao")); });
test("técnico (Alice) cria ficha com auditoria", async () => { await assertSucceeds(criarFvs("alice")); });
test("criar SEM auditoria é recusado", async () => { await assertFails(criarFvs("alice", {}, { semAuditoria: true })); });
test("auditoria em nome de outra pessoa é recusada", async () => { await assertFails(criarFvs("alice", {}, { auditoriaDe: "suellen" })); });
test("auditoria apontando para outro documento é recusada", async () => { await assertFails(criarFvs("alice", {}, { auditoriaPara: "outra-ficha" })); });
test("horário do celular (em vez do servidor) é recusado", async () => { await assertFails(criarFvs("alice", { criadoEm: AGORA_CELULAR() })); });
test("criar em nome de outra pessoa é recusado", async () => { await assertFails(criarFvs("alice", { criadoPor: { uid: "suellen" } })); });
test("técnico não cria ficha já fechada", async () => { await assertFails(criarFvs("alice", { fechado: true })); });
test("técnico edita ficha aberta", async () => { await assertSucceeds(editarFvs("alice", "aberta", { observacoes: "ok" })); });
test("versão desatualizada (edição simultânea) é recusada", async () => {
  await assertFails(editarFvs("alice", "aberta", { versao: 1 }));
});
test("não dá para mudar quem criou a ficha", async () => {
  await assertFails(editarFvs("alice", "aberta", { criadoPor: { uid: "jessica" } }));
});
test("reaproveitar o registro de auditoria anterior é recusado", async () => {
  const db = dbDe("alice");
  await assertFails(db.doc(`obras/${O}/fvs/aberta`).set({ ...FICHAS.aberta, versao: 2, atualizadoEm: ST(), atualizadoPor: { uid: "alice" } }));
});
test("texto gigante (acima de 5.000 caracteres) é recusado", async () => {
  await assertFails(editarFvs("alice", "aberta", { observacoes: "x".repeat(5001) }));
});

// ---------------- fechar / reabrir ----------------
test("técnico NÃO fecha ficha", async () => { await assertFails(editarFvs("alice", "aberta", { fechado: true }, { acao: "fechar" })); });
test("engenheiro fecha ficha", async () => { await assertSucceeds(editarFvs("eng", "aberta", { fechado: true }, { acao: "fechar" })); });
test("admin (Suellen) fecha ficha", async () => { await assertSucceeds(editarFvs("suellen", "aberta", { fechado: true }, { acao: "fechar" })); });
test("técnico NÃO edita ficha fechada", async () => { await assertFails(editarFvs("alice", "fechada", { observacoes: "x" })); });
test("técnico NÃO reabre ficha", async () => { await assertFails(editarFvs("alice", "fechada", { fechado: false }, { acao: "reabrir" })); });
test("admin reabre ficha fechada", async () => { await assertSucceeds(editarFvs("matheus", "fechada", { fechado: false }, { acao: "reabrir" })); });

// ---------------- excluir (lixeira) ----------------
test("NINGUÉM apaga de verdade — nem admin", async () => {
  await assertFails(dbDe("matheus").doc(`obras/${O}/fvs/aberta`).delete());
});
test("técnico manda para a lixeira ficha aberta que ele criou", async () => {
  await assertSucceeds(editarFvs("alice", "aberta", { excluidoEm: ST(), excluidoPor: { uid: "alice" } }, { acao: "excluir" }));
});
test("técnico NÃO manda para a lixeira ficha de outra pessoa", async () => {
  await assertFails(editarFvs("alice", "daSuellen", { excluidoEm: ST(), excluidoPor: { uid: "alice" } }, { acao: "excluir" }));
});
test("técnico NÃO restaura da lixeira", async () => {
  await assertFails(editarFvs("alice", "naLixeira", { excluidoEm: null, excluidoPor: null }, { acao: "restaurar" }));
});
test("admin restaura da lixeira", async () => {
  await assertSucceeds(editarFvs("suellen", "naLixeira", { excluidoEm: null, excluidoPor: null }, { acao: "restaurar" }));
});
test("ficha na lixeira não pode ser editada (só restaurada)", async () => {
  await assertFails(editarFvs("suellen", "naLixeira", { observacoes: "editando escondido" }));
});

// ---------------- auditoria ----------------
test("auditoria não pode ser alterada", async () => {
  await assertFails(dbDe("matheus").doc(`obras/${O}/auditoria/aud-semente`).update({ acao: "editar" }));
});
test("auditoria não pode ser apagada", async () => {
  await assertFails(dbDe("matheus").doc(`obras/${O}/auditoria/aud-semente`).delete());
});
test("visualizador não lê a auditoria", async () => {
  await assertFails(dbDe("jessica").doc(`obras/${O}/auditoria/aud-semente`).get());
});

// ---------------- usuários e papéis ----------------
test("Alice NÃO consegue se promover a admin", async () => {
  await assertFails(dbDe("alice").doc("usuarios/alice").update({ obras: { [O]: "admin" } }));
});
test("Alice muda o próprio nome/cargo", async () => {
  await assertSucceeds(dbDe("alice").doc("usuarios/alice").update({ cargo: "Estagiária de Engenharia" }));
});
test("admin global (Matheus) muda o papel da Alice", async () => {
  await assertSucceeds(dbDe("matheus").doc("usuarios/alice").update({ obras: { [O]: "engenheiro" } }));
});
test("engenheiro (sem admin global) NÃO muda papéis", async () => {
  await assertFails(dbDe("eng").doc("usuarios/alice").update({ obras: { [O]: "admin" } }));
});
test("membro lê a lista de usuários (nomes da equipe)", async () => {
  await assertSucceeds(dbDe("jessica").doc("usuarios/suellen").get());
});

// ---------------- coleções antigas (v1) após a virada ----------------
test("v1: membro lê as coleções antigas", async () => {
  await assertSucceeds(dbDe("jessica").doc("fvs/legado1").get());
});
test("v1: ninguém grava nas coleções antigas (somente leitura por 90 dias)", async () => {
  await assertFails(dbDe("matheus").doc("fvs/legado1").set({ numero: "alterada" }));
});
