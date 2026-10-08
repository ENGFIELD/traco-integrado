#!/usr/bin/env node
/**
 * Publica as regras do banco (firestore.rules) em produção — v1.15.
 *
 * Por que não "firebase deploy --only firestore:rules": o deploy da ferramenta
 * primeiro TESTA as regras numa API que a conta do GitHub não pode usar (dava
 * 403). Este script faz o mesmo resultado só com o que a conta já pode:
 *   1) cria um conjunto de regras a partir do arquivo (o Firebase confere a
 *      sintaxe aqui — se houver erro, nada é publicado);
 *   2) aponta o banco para esse conjunto novo.
 * O conjunto anterior continua guardado no Firebase (Console → Firestore →
 * Regras → histórico), dá para voltar com um clique.
 *
 * Uso:  node scripts/publicar-regras.js --key chave.json
 *       (ou com GOOGLE_APPLICATION_CREDENTIALS definida)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const iKey = args.indexOf("--key");
if (iKey >= 0) process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(args[iKey + 1]);
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.error("Informe a chave: --key <arquivo>"); process.exit(1); }

const arquivo = path.join(__dirname, "..", "firestore.rules");
const fonte = fs.readFileSync(arquivo, "utf8");
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: "traco-integrado-sig" });

(async () => {
  const sr = admin.securityRules();
  try {
    const atual = await sr.getFirestoreRuleset();
    console.log("Regras em produção antes:", atual.name, "de", atual.createTime);
  } catch (e) {
    console.log("(não foi possível ler o conjunto atual — segue assim mesmo)");
  }
  const novo = await sr.createRuleset(sr.createRulesFileFromSource("firestore.rules", fonte));
  console.log("Conjunto novo criado (sintaxe conferida):", novo.name);
  await sr.releaseFirestoreRuleset(novo);
  console.log("Pronto: o banco agora usa", novo.name);
})().catch((e) => {
  console.error("Falhou ao publicar as regras:", e && (e.message || e));
  process.exit(1);
});
