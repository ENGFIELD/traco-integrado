#!/usr/bin/env node
/**
 * Numeração automática das fichas FVS EXISTENTES (v1.4).
 *
 * Regra: sequência por código de ficha (FVS 04 → 001, 002…; FVS-03.9 → 001…),
 * em ordem cronológica de abertura (dataAbertura, depois createdAt, depois id).
 *
 * Segurança (regras do projeto):
 *  - Padrão = SIMULAÇÃO: só mostra a tabela "antes → depois".
 *  - --aplicar em produção exige backup com menos de 60 minutos em ../backups.
 *  - Idempotente: ficha que já tem numeroAuto=true não é renumerada; rodar de
 *    novo só numera fichas novas que ficaram sem número.
 *  - Nada é apagado: o valor antigo (ex.: "B115, B140") vai para numeroAnterior.
 *  - Só altera os campos numero, numeroSeq, numeroAuto, numeroAnterior e
 *    migracoes.numeracaoEm — o resto da ficha fica intacto.
 *
 * Uso (dentro de scripts/):
 *   node numerar-fvs.js --emulador                 (simulação no emulador)
 *   node numerar-fvs.js --emulador --aplicar
 *   node numerar-fvs.js --key <chave.json>         (simulação em produção)
 *   node numerar-fvs.js --key <chave.json> --aplicar
 */
"use strict";
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (n) => process.argv.includes(n);
const emulador = flag("--emulador"), aplicar = flag("--aplicar");
const lerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));

if (emulador) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  admin.initializeApp({ projectId: "traco-integrado-sig" });
} else {
  const keyPath = arg("--key");
  if (!keyPath || !fs.existsSync(keyPath)) { console.error("ERRO: --key <chave.json> (ou --emulador)"); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(lerJson(keyPath)) });
  if (aplicar) {
    const pasta = path.join(__dirname, "..", "backups");
    const recentes = fs.readdirSync(pasta).filter((f) => /^firestore_.*\.json$/.test(f))
      .map((f) => fs.statSync(path.join(pasta, f)).mtimeMs).filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (!recentes.length) { console.error("ERRO: nenhum backup com menos de 60 min em backups/. Rode backup-firestore.js antes."); process.exit(1); }
  }
}
const db = admin.firestore();
const pad = (n) => (n < 1000 ? ("00" + n).slice(-3) : String(n));
const numerico = (s) => /^\d{1,5}$/.test(String(s || "").trim());

(async () => {
  const snap = await db.collection("fvs").get();
  const porCodigo = new Map();
  snap.docs.forEach((d) => {
    const f = d.data();
    if (f.excluido === true) return; // v1.28: ficha na lixeira não entra na numeração
    const cod = f.codigo || "(sem código)";
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    porCodigo.get(cod).push({ id: d.id, ref: d.ref, f });
  });

  const mudancas = [];
  for (const [cod, lista] of porCodigo) {
    lista.sort((a, b) =>
      (a.f.dataAbertura || "9999").localeCompare(b.f.dataAbertura || "9999")
      || (a.f.createdAt || "").localeCompare(b.f.createdAt || "")
      || a.id.localeCompare(b.id));
    // Números já atribuídos (automáticos ou numéricos digitados) são preservados.
    let maior = 0;
    lista.forEach((x) => {
      if (x.f.numeroAuto || numerico(x.f.numero)) maior = Math.max(maior, x.f.numeroSeq || parseInt(x.f.numero, 10) || 0);
    });
    lista.forEach((x) => {
      if (x.f.numeroAuto || numerico(x.f.numero)) return;
      maior++;
      const novo = { numero: pad(maior), numeroSeq: maior, numeroAuto: true,
        "migracoes.numeracaoEm": admin.firestore.FieldValue.serverTimestamp() };
      const antigo = String(x.f.numero || "").trim();
      if (antigo && !x.f.numeroAnterior) novo.numeroAnterior = antigo;
      mudancas.push({ cod, id: x.id, ref: x.ref, abertura: x.f.dataAbertura || "—", antes: antigo || "(vazio)", depois: novo.numero, novo });
    });
  }

  console.log(`Destino: ${emulador ? "EMULADOR" : "PRODUÇÃO"} | Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}`);
  console.log(`${snap.size} ficha(s) lidas; ${mudancas.length} a numerar.\n`);
  let codAtual = null;
  for (const m of mudancas) {
    if (m.cod !== codAtual) { codAtual = m.cod; console.log(`  ${m.cod}`); }
    console.log(`    ${m.depois}  ← ${m.antes.padEnd(22)}  aberta em ${m.abertura}   (${m.id})`);
  }
  if (!aplicar) { console.log("\nNada foi gravado. Repita com --aplicar para executar."); process.exit(0); }

  for (let i = 0; i < mudancas.length; i += 400) {
    const lote = db.batch();
    mudancas.slice(i, i + 400).forEach((m) => lote.update(m.ref, m.novo));
    await lote.commit();
  }
  console.log(`\nOK: ${mudancas.length} ficha(s) numeradas.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
