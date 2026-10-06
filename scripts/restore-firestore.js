#!/usr/bin/env node
/**
 * Restaura um backup gerado por backup-firestore.js.
 *
 * SEGURANÇA:
 *  - Por padrão roda em modo SIMULAÇÃO (dry-run): só mostra o que faria.
 *    Para gravar de verdade é obrigatório passar --aplicar.
 *  - Por padrão NÃO sobrescreve documentos que já existem no banco
 *    (restaura apenas os que estão faltando). Para sobrescrever, use --sobrescrever.
 *  - Nunca apaga nada.
 *
 * Uso (dentro da pasta scripts/):
 *   node restore-firestore.js --key "C:\chave.json" --arquivo ..\backups\firestore_2026-10-06.json
 *   node restore-firestore.js ... --aplicar                 (grava os que faltam)
 *   node restore-firestore.js ... --aplicar --sobrescrever  (grava tudo, substituindo)
 *   node restore-firestore.js ... --colecao fvs             (restaura só uma coleção raiz)
 *   node restore-firestore.js ... --emulador                (grava no Firestore Emulator localhost:8080)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (nome) => process.argv.includes(nome);

const arquivo = arg("--arquivo");
const keyPath = arg("--key") || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const soColecao = arg("--colecao");
const aplicar = flag("--aplicar");
const sobrescrever = flag("--sobrescrever");
const emulador = flag("--emulador");

if (!arquivo || !fs.existsSync(arquivo)) {
  console.error("ERRO: informe o backup com --arquivo <caminho.json>");
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(arquivo, "utf8"));
if (!backup.meta || backup.meta.formato !== "traco-integrado-backup/1") {
  console.error("ERRO: arquivo não parece ser um backup do Traço Integrado.");
  process.exit(1);
}

if (emulador) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080";
  admin.initializeApp({ projectId: backup.meta.projeto });
} else {
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error("ERRO: chave da conta de serviço não encontrada (--key).");
    process.exit(1);
  }
  const chave = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  if (chave.project_id !== backup.meta.projeto) {
    console.warn(`ATENÇÃO: backup é do projeto "${backup.meta.projeto}" e a chave é de "${chave.project_id}".`);
  }
  admin.initializeApp({ credential: admin.credential.cert(chave) });
}
const db = admin.firestore();

// ---------- desserialização ----------
function desserializar(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(desserializar);
  if (typeof v === "object") {
    switch (v.__tipo) {
      case "timestamp": return new admin.firestore.Timestamp(v.s, v.ns);
      case "geopoint":  return new admin.firestore.GeoPoint(v.lat, v.lng);
      case "ref":       return db.doc(v.path);
      case "bytes":     return Buffer.from(v.base64, "base64");
    }
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = desserializar(val);
    return o;
  }
  return v;
}

// ---------- restauração ----------
const cont = { novos: 0, sobrescritos: 0, ignorados: 0 };
const writer = aplicar ? db.bulkWriter() : null;

async function restaurarColecao(caminho, docs) {
  for (const [id, item] of Object.entries(docs)) {
    const ref = db.doc(`${caminho}/${id}`);
    if (item.dados) {
      const existe = (await ref.get()).exists;
      if (existe && !sobrescrever) {
        cont.ignorados++;
      } else {
        existe ? cont.sobrescritos++ : cont.novos++;
        if (writer) writer.set(ref, desserializar(item.dados));
      }
    }
    for (const [sub, subDocs] of Object.entries(item.subcolecoes || {})) {
      await restaurarColecao(`${caminho}/${id}/${sub}`, subDocs);
    }
  }
}

(async () => {
  console.log(`Backup: ${path.basename(arquivo)} (gerado em ${backup.meta.geradoEm}, ${backup.meta.totalDocumentos} docs)`);
  console.log(`Destino: ${emulador ? "EMULADOR " + process.env.FIRESTORE_EMULATOR_HOST : "PRODUÇÃO " + backup.meta.projeto}`);
  console.log(`Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO (dry-run)"}${sobrescrever ? " + sobrescrever" : ""}\n`);

  for (const [col, docs] of Object.entries(backup.colecoes)) {
    if (soColecao && col !== soColecao) continue;
    await restaurarColecao(col, docs);
  }
  if (writer) await writer.close();

  console.log(`Novos: ${cont.novos} | Sobrescritos: ${cont.sobrescritos} | Já existiam (mantidos): ${cont.ignorados}`);
  if (!aplicar) console.log("\nNada foi gravado. Repita com --aplicar para executar.");
  process.exit(0);
})().catch((e) => {
  console.error("Falha no restore:", e);
  process.exit(1);
});
