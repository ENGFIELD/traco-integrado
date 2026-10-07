#!/usr/bin/env node
/**
 * Prepara os Firebase Emulators (banco de TESTES local) com uma CÓPIA dos dados reais.
 *
 *  1. Cria no Auth Emulator o usuário de teste definido em emulador.usuario.json
 *     (só existe no emulador — não é uma conta real).
 *  2. Restaura no Firestore Emulator o backup mais recente de ../backups/.
 *
 * Uso (com os emuladores já rodando: firebase emulators:start):
 *   node seed-emulador.js
 *
 * Nunca toca no banco real: força FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST.
 */
"use strict";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const admin = require("firebase-admin");

// .replace remove o BOM que o PowerShell/Bloco de Notas às vezes grava no início do arquivo.
const usuario = JSON.parse(fs.readFileSync(path.join(__dirname, "emulador.usuario.json"), "utf8").replace(/^﻿/, ""));
admin.initializeApp({ projectId: "traco-integrado-sig" });

(async () => {
  // 1) usuário de teste
  try {
    await admin.auth().createUser({ email: usuario.email, password: usuario.senha, displayName: usuario.nome });
    console.log("Usuário de teste criado no Auth Emulator:", usuario.email);
  } catch (e) {
    if (e.code === "auth/email-already-exists") console.log("Usuário de teste já existia:", usuario.email);
    else throw e;
  }

  // 2) backup mais recente
  const pasta = path.join(__dirname, "..", "backups");
  const backups = fs.readdirSync(pasta).filter((f) => /^firestore_.*\.json$/.test(f)).sort();
  if (!backups.length) throw new Error("nenhum backup em ../backups — rode backup-firestore.js antes");
  const arquivo = path.join(pasta, backups[backups.length - 1]);
  console.log("Restaurando no emulador:", path.basename(arquivo));
  execFileSync(process.execPath, [path.join(__dirname, "restore-firestore.js"), "--arquivo", arquivo, "--emulador", "--aplicar", "--sobrescrever"], { stdio: "inherit" });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
