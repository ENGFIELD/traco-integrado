/* Regras publicadas (firestore.rules): conta só de visualização (v1.9).
 * Rodar:  npm run test:regras-v1   (Firestore Emulator separado, porta 8180) */
import { test, before, after } from "node:test";
import fs from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traco-regras-v1",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8180 },
  });
  await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc("fvs/a").set({ x: 1 }); });
});
after(async () => { await env.cleanup(); });

const COLECOES = ["fvs", "rastreabilidade", "controleTecnologico", "plantas", "entregasAco", "cronogramas", "planilhasModelo"];
const db = (email) => env.authenticatedContext(email.split("@")[0], { email }).firestore();

test("Jéssica lê, mas não grava em nenhuma coleção", async () => {
  const j = db("jessica.araujo@sig.eng.br");
  await assertSucceeds(j.doc("fvs/a").get());
  for (const c of COLECOES) {
    await assertFails(j.doc(c + "/t").set({ y: 1 }));
  }
  await assertFails(j.doc("fvs/a").update({ x: 2 }));
  await assertFails(j.doc("fvs/a").delete());
});
test("e-mail em maiúsculas também é bloqueado", async () => {
  await assertFails(db("Jessica.Araujo@SIG.eng.br").doc("fvs/b").set({ y: 1 }));
});
test("demais contas continuam gravando", async () => {
  const m = db("matheus.alves@sig.eng.br");
  for (const c of COLECOES) await assertSucceeds(m.doc(c + "/t").set({ y: 1 }));
});
test("sem login não lê nem grava", async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(anon.doc("fvs/a").get());
  await assertFails(anon.doc("fvs/z").set({ y: 1 }));
});

// v1.15: assinatura eletrônica, ficha travada e revisões
test("assinatura: cada um grava só a sua; ninguém apaga", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("assinaturas/matheus.alves").set({ nome: "Matheus", imagem: "data:image/png;base64,AA" }));
  await assertFails(m.doc("assinaturas/outra.pessoa").set({ nome: "x" }));
  await assertSucceeds(db("outra.pessoa@sig.eng.br").doc("assinaturas/matheus.alves").get());
  await assertFails(m.doc("assinaturas/matheus.alves").delete());
  await assertFails(db("jessica.araujo@sig.eng.br").doc("assinaturas/jessica.araujo").set({ nome: "J" }));
});
test("FVS travada: não altera nem apaga; nova revisão e vínculo passam", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("fvs/tr").set({ numero: "1", revisao: 0, travada: false }));
  await assertSucceeds(m.doc("fvs/tr").set({ numero: "1", revisao: 0, travada: true, assinaturas: [{ nome: "Eng" }] }));
  await assertFails(m.doc("fvs/tr").update({ numero: "2" }));
  await assertFails(m.doc("fvs/tr").set({ numero: "1", revisao: 0, travada: false }));
  await assertFails(m.doc("fvs/tr").delete());
  await assertSucceeds(m.doc("fvs/tr").update({ rastreabilidadeId: "r1", updatedAt: "x" }));
  await assertSucceeds(m.doc("fvs/tr").set({ numero: "1", revisao: 1, travada: false, assinaturas: [] }));
  await assertSucceeds(m.doc("fvs/tr").update({ numero: "2" }));
});
test("v1.19 FVS travada: dá baixa em NC e acrescenta assinatura do estagiário; não tira a da engenharia", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("fvs/t2").set({ numero: "5", revisao: 0, travada: false }));
  await assertSucceeds(m.doc("fvs/t2").set({ numero: "5", revisao: 0, travada: true, assinaturas: [{ papel: "engenheiro" }], naoConformidades: [{ descricao: "x", concluida: false }] }));
  await assertSucceeds(m.doc("fvs/t2").update({ naoConformidades: [{ descricao: "x", concluida: true }], updatedAt: "y" }));
  await assertSucceeds(m.doc("fvs/t2").update({ assinaturas: [{ papel: "engenheiro" }, { papel: "estagiario" }], inspecionadoPor: "Matheus" }));
  await assertFails(m.doc("fvs/t2").update({ assinaturas: [{ papel: "estagiario" }] }));
  await assertFails(m.doc("fvs/t2").update({ naoConformidades: [], numero: "6" }));
});
test("v1.25 tarefas: equipe cria e marca feita; Jessica só lê; ninguém apaga", async () => {
  const m = db("suellen.alves@sig.eng.br");
  await assertSucceeds(m.doc("tarefas/t1").set({ titulo: "Completar betonadas", status: "aberta" }));
  await assertSucceeds(db("matheus.alves@sig.eng.br").doc("tarefas/t1").set({ status: "feita" }, { merge: true }));
  await assertSucceeds(db("jessica.araujo@sig.eng.br").doc("tarefas/t1").get());
  await assertFails(db("jessica.araujo@sig.eng.br").doc("tarefas/t2").set({ titulo: "x" }));
  await assertFails(m.doc("tarefas/t1").delete());
});
test("fichas antigas (sem travada) continuam normais", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("fvs/antiga").set({ numero: "9" }));
  await assertSucceeds(m.doc("fvs/antiga").update({ numero: "10" }));
  await assertSucceeds(m.doc("fvs/antiga").delete());
});
test("revisões guardadas: cria, não altera nem apaga", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("fvsRevisoes/r1").set({ fvsId: "tr", revisao: 0 }));
  await assertFails(m.doc("fvsRevisoes/r1").update({ revisao: 5 }));
  await assertFails(m.doc("fvsRevisoes/r1").delete());
  await assertFails(db("jessica.araujo@sig.eng.br").doc("fvsRevisoes/r2").set({ x: 1 }));
});

// v1.30: histórico de alterações (auditoria/AAAA-MM-DD)
test("histórico: equipe acrescenta linhas; ninguém altera, tira ou apaga; Jessica só lê", async () => {
  const m = db("matheus.alves@sig.eng.br");
  const e1 = { em: "2026-10-09T10:00:00Z", por: "matheus.alves@sig.eng.br", col: "fvs", id: "a", acao: "alterou", campos: ["fechado"] };
  const e2 = Object.assign({}, e1, { em: "2026-10-09T11:00:00Z" });
  await assertSucceeds(m.doc("auditoria/2026-10-09").set({ entradas: [e1] }, { merge: true }));
  await assertSucceeds(m.doc("auditoria/2026-10-09").set({ entradas: [e1, e2] }, { merge: true }));
  await assertFails(m.doc("auditoria/2026-10-09").set({ entradas: [e2] }));             // tirar linha
  await assertFails(m.doc("auditoria/2026-10-09").set({ entradas: [Object.assign({}, e1, { por: "outro" }), e2] })); // mudar linha
  await assertFails(m.doc("auditoria/2026-10-09").set({ entradas: [e1, e2], extra: 1 }));
  await assertFails(m.doc("auditoria/2026-10-09").delete());
  const j = db("jessica.araujo@sig.eng.br");
  await assertSucceeds(j.doc("auditoria/2026-10-09").get());
  await assertFails(j.doc("auditoria/2026-10-10").set({ entradas: [e1] }));
});
test("lixeira: excluir e restaurar FVS aberta; travada não vai para a lixeira", async () => {
  const m = db("matheus.alves@sig.eng.br");
  await assertSucceeds(m.doc("fvs/lx").set({ numero: "9", travada: false }));
  await assertSucceeds(m.doc("fvs/lx").set({ excluido: true, excluidoEm: "x", excluidoPor: "m", updatedAt: "x" }, { merge: true }));
  await assertSucceeds(m.doc("fvs/lx").set({ excluido: false, restauradoEm: "y", restauradoPor: "m", updatedAt: "y" }, { merge: true }));
  await assertSucceeds(m.doc("fvs/lx2").set({ numero: "10", travada: true, revisao: 0 }));
  await assertFails(m.doc("fvs/lx2").set({ excluido: true }, { merge: true }));
});
