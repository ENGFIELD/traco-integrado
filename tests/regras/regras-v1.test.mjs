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
