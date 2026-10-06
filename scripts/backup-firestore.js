#!/usr/bin/env node
/**
 * Backup completo do Cloud Firestore do Traço Integrado.
 *
 * Exporta TODAS as coleções (inclusive subcoleções, em qualquer profundidade)
 * para um único arquivo JSON:  backups/firestore_AAAA-MM-DD.json
 * (se já existir um backup do mesmo dia, acrescenta _HHMM ao nome — nunca sobrescreve).
 *
 * Tipos especiais do Firestore (Timestamp, GeoPoint, DocumentReference, Bytes)
 * são gravados com uma marcação "__tipo" para que o restore os recrie fielmente.
 *
 * Uso (dentro da pasta scripts/):
 *   npm install
 *   node backup-firestore.js --key "C:\caminho\da\chave.json"
 *   (ou defina a variável GOOGLE_APPLICATION_CREDENTIALS e rode sem --key)
 *
 * Opções:
 *   --key <arquivo>   chave da conta de serviço (NUNCA guardar dentro do projeto)
 *   --out <pasta>     pasta de destino (padrão: ../backups)
 *
 * Este script é somente leitura: não altera nada no banco.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ---------- argumentos ----------
function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const keyPath = arg("--key") || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const outDir = path.resolve(arg("--out") || path.join(__dirname, "..", "backups"));

if (!keyPath || !fs.existsSync(keyPath)) {
  console.error("ERRO: chave da conta de serviço não encontrada.");
  console.error('Use: node backup-firestore.js --key "C:\\caminho\\chave.json"');
  process.exit(1);
}

const chave = JSON.parse(fs.readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(chave) });
const db = admin.firestore();

// ---------- serialização dos tipos do Firestore ----------
function serializar(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof admin.firestore.Timestamp) {
    return { __tipo: "timestamp", s: v.seconds, ns: v.nanoseconds, iso: v.toDate().toISOString() };
  }
  if (v instanceof admin.firestore.GeoPoint) {
    return { __tipo: "geopoint", lat: v.latitude, lng: v.longitude };
  }
  if (v instanceof admin.firestore.DocumentReference) {
    return { __tipo: "ref", path: v.path };
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    return { __tipo: "bytes", base64: Buffer.from(v).toString("base64") };
  }
  if (Array.isArray(v)) return v.map(serializar);
  if (typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = serializar(val);
    return o;
  }
  return v;
}

// ---------- varredura recursiva ----------
let totalDocs = 0;

async function exportarColecao(colRef) {
  const saida = {};
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    const item = { dados: serializar(doc.data()) };
    const subs = await doc.ref.listCollections();
    if (subs.length) {
      item.subcolecoes = {};
      for (const sub of subs) item.subcolecoes[sub.id] = await exportarColecao(sub);
    }
    saida[doc.id] = item;
    totalDocs++;
  }
  // Documentos "fantasma" (sem dados, mas com subcoleções) não aparecem no get();
  // listDocuments() os encontra para não perdermos subcoleções órfãs.
  const refs = await colRef.listDocuments();
  for (const ref of refs) {
    if (saida[ref.id]) continue;
    const subs = await ref.listCollections();
    if (!subs.length) continue;
    const item = { dados: null, subcolecoes: {} };
    for (const sub of subs) item.subcolecoes[sub.id] = await exportarColecao(sub);
    saida[ref.id] = item;
  }
  return saida;
}

function nomeArquivo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  let f = path.join(outDir, `firestore_${dia}.json`);
  if (fs.existsSync(f)) f = path.join(outDir, `firestore_${dia}_${p(d.getHours())}${p(d.getMinutes())}.json`);
  return f;
}

(async () => {
  const inicio = Date.now();
  console.log(`Projeto: ${chave.project_id}`);
  const raiz = await db.listCollections();
  const backup = {
    meta: {
      projeto: chave.project_id,
      geradoEm: new Date().toISOString(),
      formato: "traco-integrado-backup/1",
    },
    colecoes: {},
  };
  for (const col of raiz) {
    process.stdout.write(`  exportando ${col.id}... `);
    const antes = totalDocs;
    backup.colecoes[col.id] = await exportarColecao(col);
    console.log(`${totalDocs - antes} doc(s)`);
  }
  backup.meta.totalDocumentos = totalDocs;

  fs.mkdirSync(outDir, { recursive: true });
  const arquivo = nomeArquivo();
  fs.writeFileSync(arquivo, JSON.stringify(backup, null, 2), "utf8");
  console.log(`\nOK: ${totalDocs} documento(s) em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  console.log(`Arquivo: ${arquivo}`);
  process.exit(0);
})().catch((e) => {
  console.error("Falha no backup:", e);
  process.exit(1);
});
