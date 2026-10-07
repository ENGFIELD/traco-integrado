#!/usr/bin/env node
/**
 * Gestão de usuários do Traço Integrado (Firebase Auth + papéis da v2).
 *
 * Uso (dentro de scripts/):
 *   node usuarios.js listar --key <chave.json>
 *       Lista as contas do Firebase Auth. Somente leitura.
 *
 *   node usuarios.js definir-papeis --arquivo equipe.belavista.json [--emulador] [--aplicar] [--key <chave.json>]
 *       Grava usuarios/{uid} (nome, cargo, papel por obra) e obras/{obraId}.
 *       Padrão: SIMULAÇÃO — mostra o que faria. Grava só com --aplicar.
 *       --emulador: grava nos Firebase Emulators (localhost) e, se a conta não
 *       existir lá, cria com a senha de teste de emulador.usuario.json.
 *       Nunca cria nem altera senha de conta real.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (n) => process.argv.includes(n);
const comando = process.argv[2];
const emulador = flag("--emulador");
const aplicar = flag("--aplicar");
const lerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

if (emulador) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  admin.initializeApp({ projectId: "traco-integrado-sig" });
} else {
  const keyPath = arg("--key") || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error('ERRO: informe a chave com --key "C:\\...\\chave.json" (ou use --emulador)');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(lerJson(keyPath)) });
}

const fmt = (s) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const PAPEIS = ["admin", "engenheiro", "tecnico", "encarregado", "visualizador"];

async function listar() {
  const todos = [];
  let pageToken;
  do {
    const r = await admin.auth().listUsers(1000, pageToken);
    todos.push(...r.users);
    pageToken = r.pageToken;
  } while (pageToken);
  todos.sort((a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime));
  console.log(`${todos.length} conta(s) no Firebase Auth${emulador ? " (EMULADOR)" : ""}:\n`);
  for (const u of todos) {
    console.log(`- ${u.email || "(sem e-mail)"}${u.disabled ? "  [DESATIVADA]" : ""}`);
    console.log(`    uid: ${u.uid}`);
    console.log(`    criada: ${fmt(u.metadata.creationTime)} | último acesso: ${fmt(u.metadata.lastSignInTime)}`);
  }
}

async function definirPapeis() {
  const arquivo = arg("--arquivo");
  if (!arquivo) throw new Error("informe --arquivo equipe.xxx.json");
  const cfg = lerJson(path.resolve(arquivo));
  const db = admin.firestore();
  const o = cfg.obra.id;
  console.log(`Obra: ${o} — ${cfg.obra.nome}`);
  console.log(`Destino: ${emulador ? "EMULADOR" : "PRODUÇÃO"} | Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);

  for (const m of cfg.equipe) {
    if (!PAPEIS.includes(m.papel)) throw new Error(`papel inválido para ${m.email}: ${m.papel}`);
    let conta = null;
    try { conta = await admin.auth().getUserByEmail(m.email); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    if (!conta) {
      if (!emulador) { console.log(`  ⚠ ${m.email}: conta não existe no Firebase Auth — crie no console antes. Pulando.`); continue; }
      const senha = lerJson(path.join(__dirname, "emulador.usuario.json")).senha;
      if (aplicar) conta = await admin.auth().createUser({ email: m.email, password: senha, displayName: m.nome });
      console.log(`  + ${m.email}: conta de TESTE ${aplicar ? "criada" : "seria criada"} no emulador`);
      if (!conta) continue;
    }
    const ref = db.doc(`usuarios/${conta.uid}`);
    const atual = (await ref.get()).data() || {};
    const novo = {
      nome: m.nome, email: m.email, cargo: m.cargo || "", ativo: true,
      adminGlobal: !!m.adminGlobal,
      obras: { ...(atual.obras || {}), [o]: m.papel },
    };
    const antes = atual.obras ? atual.obras[o] || "(sem papel)" : "(sem cadastro)";
    console.log(`  ${m.email}: ${antes} → ${m.papel}${m.adminGlobal ? " + admin global" : ""}`);
    if (aplicar) {
      await ref.set({ ...novo, atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        ...(atual.criadoEm ? {} : { criadoEm: admin.firestore.FieldValue.serverTimestamp() }) }, { merge: true });
    }
  }
  if (aplicar) {
    await db.doc(`obras/${o}`).set({ nome: cfg.obra.nome, empresa: cfg.obra.empresa || "", cidade: cfg.obra.cidade || "",
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log(`\nOK: papéis gravados e obra ${o} registrada.`);
  } else {
    console.log("\nNada foi gravado. Repita com --aplicar para executar.");
  }
}

(async () => {
  if (comando === "listar") await listar();
  else if (comando === "definir-papeis") await definirPapeis();
  else { console.error("Comandos: listar | definir-papeis"); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
