#!/usr/bin/env node
/**
 * Gestão de usuários do Traço Integrado (Firebase Auth + papéis).
 *
 * Uso (dentro de scripts/):
 *   node usuarios.js listar --key <chave.json>
 *       Lista todas as contas do Firebase Auth (e-mail, criação, último acesso,
 *       provedor). Somente leitura.
 *
 * (Na etapa 2.2 este script ganha "definir-papel", que grava usuarios/{uid}.)
 */
"use strict";

const fs = require("fs");
const admin = require("firebase-admin");

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const comando = process.argv[2];
const keyPath = arg("--key") || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('ERRO: informe a chave com --key "C:\\...\\chave.json"');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, "utf8"))) });

const fmt = (s) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

async function listar() {
  const todos = [];
  let pageToken;
  do {
    const r = await admin.auth().listUsers(1000, pageToken);
    todos.push(...r.users);
    pageToken = r.pageToken;
  } while (pageToken);
  todos.sort((a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime));
  console.log(`${todos.length} conta(s) no Firebase Auth:\n`);
  for (const u of todos) {
    console.log(`- ${u.email || "(sem e-mail)"}${u.disabled ? "  [DESATIVADA]" : ""}`);
    console.log(`    uid: ${u.uid}`);
    console.log(`    criada: ${fmt(u.metadata.creationTime)} | último acesso: ${fmt(u.metadata.lastSignInTime)} | provedor: ${u.providerData.map((p) => p.providerId).join(",") || "—"}`);
  }
}

(async () => {
  if (comando === "listar") await listar();
  else { console.error("Comandos: listar"); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
