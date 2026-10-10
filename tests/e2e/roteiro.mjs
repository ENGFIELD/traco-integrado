/* Teste de ponta a ponta (v1.28 — fase A4 do plano de arquitetura).
 *
 * Roda o app de verdade num navegador, ligado a um banco de TESTE (emuladores
 * do Firebase, que somem no fim — nunca toca no banco real), e confere o
 * roteiro que antes era feito à mão a cada versão:
 *   - cada perfil entra e vê a tela certa (Matheus, Suellen, Jessica);
 *   - a barra de baixo do celular fica numa linha só;
 *   - gravar uma rastreabilidade carimba quem/quando (porteiro);
 *   - excluir manda para a lixeira (o registro continua no banco);
 *   - uma alteração feita por outro aparelho chega com a sincronização que
 *     baixa só o que mudou;
 *   - a conta só de visualização não consegue gravar;
 *   - nenhuma tela dá erro de JavaScript.
 *
 * Uso: npm run build && npm run test:e2e
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(new URL("../../scripts/package.json", import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const admin = require("firebase-admin");
const JSZip = createRequire(import.meta.url)("jszip");
admin.initializeApp({ projectId: "traco-integrado-sig" });
const db = admin.firestore();

const URL_APP = "http://localhost:5000/";
const SENHA = "Senha12345";
let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

// ---------- dados de teste ----------
const T = "2026-10-01T10:00:00.000Z";
const usuario = async (email, nome) => {
  try { return (await admin.auth().createUser({ email, password: SENHA, displayName: nome })).uid; }
  catch (e) { return (await admin.auth().getUserByEmail(email)).uid; }
};
const uidMatheus = await usuario("matheus.alves@sig.eng.br", "Matheus Alves");
const uidSuellen = await usuario("suellen.alves@sig.eng.br", "Suellen Alves");
await usuario("jessica.araujo@sig.eng.br", "Jessica Araujo");
await usuario("alice.soares@sig.eng.br", "Alice Soares");
const linha = (seq, nf, pecas) => ({ seq, notaFiscal: nf, betoneira: "", lacre: "", volBetoneira: "8", volAcumulado: "", fornecedor: "Polimix", nSerieCP: "", nCPs: "2", slump: "12", saidaUsina: "08:00", chegadaObra: "08:30", lancInicial: "08:40", lancFinal: "09:10", aguaFolga: "", aguaLanc: "", pecas });
await db.doc("fvs/f1").set({ tipo: "fvs04", codigo: "FVS 04", numero: "14", pavimentos: ["3º Embasamento"], dataAbertura: "2026-09-20", elementos: {}, checklist: {}, naoConformidades: [{ descricao: "Prumo do pilar P7 fora da tolerância", correcao: "", concluida: false, dataConclusao: "", dataRegistro: "2026-09-21", anexos: [] }], fechado: true, dataFechamento: "2026-09-25", updatedAt: T });
await db.doc("fvs/f3").set({ tipo: "fvs04", codigo: "FVS 04", numero: "30", pavimentos: ["6º Pavimento Tipo"], dataAbertura: "2026-10-03", elementos: {}, checklist: {}, naoConformidades: [], updatedAt: T });
await db.doc("rastreabilidade/r1").set({ data: "2026-10-05", blocoPav: "4º Pavimento Tipo", pavimentos: ["4º Pavimento Tipo"], obra: "Belavista Ipanema", fckSolicitado: "40 MPa", slumpAprovado: "12±2", linhas: [linha(1, "05538", "L5, V1b"), linha(2, "05544", "P1, P4")], fechado: false, responsavelColeta: "Matheus Alves", engenheiro: "Suellen Alves", createdAt: T, updatedAt: T });
await db.doc("rastreabilidade/r2").set({ data: "2026-10-06", blocoPav: "Piso do 5º Embasamento / Piso do 2⁰ Embasamento", pavimentos: [], obra: "Belavista Ipanema", linhas: [linha(1, "06001", "L1")], fechado: false, createdAt: T, updatedAt: T });
await db.doc("controleTecnologico/nf_05538").set({ notaRemessa: "05538", dataConcretagem: "2026-10-05", fck: 40, atualizadoEm: T });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
await db.doc("assinaturas/" + uidSuellen).set({ nome: "Suellen Alves", papel: "engenheiro", crea: "CREA-RJ 123", email: "suellen.alves@sig.eng.br", imagem: PNG });
await db.doc("assinaturas/" + uidMatheus).set({ nome: "Matheus Alves", papel: "estagiario", email: "matheus.alves@sig.eng.br", imagem: PNG });
// v1.32: 7 dias vencido e sem resultado (concretagem há 9 dias) tem que aparecer como pendente
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
await db.doc("controleTecnologico/nf_07001").set({ notaRemessa: "07001", dataConcretagem: diasAtras(9), data7: diasAtras(2), data28: diasAtras(-19), data63: diasAtras(-54), fck: 40, local: "Laje teste 7 dias", anteriorAoSistema: false, atualizadoEm: T });
// v1.36: concretagem com planta demarcada; a NF da BT 2 ficou abaixo do fck aos 28 dias
const PLANTA = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect width="800" height="560" fill="#fff"/><rect x="40" y="40" width="720" height="480" fill="none" stroke="#000" stroke-width="3"/></svg>');
const quad = (x, y, l, a) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + a }, { x, y: y + a }];
await db.doc("rastreabilidade/r3").set({ data: diasAtras(40), blocoPav: "Piso do 6º Pavimento Tipo", pavimentos: ["Piso do 6º Pavimento Tipo"], obra: "Belavista Ipanema", fckSolicitado: "40 MPa",
  linhas: [linha(1, "08001", "L6"), linha(2, "08002", "V3")], fechado: false, createdAt: T, updatedAt: T,
  mapeamento: { plantaUrl: PLANTA, plantaNome: "Forma 6º pav", tipo: "imagem", pagina: 1, areas: [{ pontos: quad(0.1, 0.1, 0.4, 0.4), linhaSeq: 1, cor: "#2E5AAC" }, { pontos: quad(0.5, 0.1, 0.012, 0.05), linhaSeq: 2, cor: "#2E7D46" }] } });
await db.doc("controleTecnologico/nf_08002").set({ notaRemessa: "08002", dataConcretagem: diasAtras(40), fck: 40, r28: 32, data28: diasAtras(12), local: "6º pav V3", anteriorAoSistema: false, atualizadoEm: T });
await db.doc("plantas/p1").set({ nome: "Forma 6º pav", pavimento: "Piso do 6º Pavimento Tipo", url: PLANTA, tipo: "imagem", criadoEm: T });
await db.doc("plantas/p2").set({ nome: "Arquitetura 6º pav", pavimento: "Piso do 6º Pavimento Tipo", disciplina: "Arquitetura", url: PLANTA, tipo: "imagem", criadoEm: T });
await db.doc("tarefas/t1").set({ titulo: "Completar betonadas de 05/10", para: "Matheus Alves", status: "aberta", criadoPor: "suellen.alves@sig.eng.br", criadoEm: T, atualizadoEm: T });

// ---------- navegador ----------
const navegador = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH === "/opt/pw-browsers" ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const erros = [];
async function entrar(email, viewport) {
  const ctx = await navegador.newContext({ viewport: viewport || { width: 1200, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(email + ": " + e.message));
  p.on("dialog", (d) => d.accept().catch(() => {})); // o aviso pode chegar quando a janela já está fechando
  await p.goto(URL_APP);
  await p.fill("#login-email", email); await p.fill("#login-password", SENHA); await p.click("#login-submit");
  await p.waitForSelector("#app-root:not([hidden])", { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".firebase-emulator-warning").forEach((e) => e.remove()));
  return p;
}
const irPara = (p, id) => p.evaluate((i) => document.getElementById(i).click(), id).then(() => p.waitForTimeout(600));
// FOTOS=pasta → guarda capturas de tela das telas novas (para conferir o visual)
const foto = async (p, nome) => { if (process.env.FOTOS) await p.screenshot({ path: process.env.FOTOS + "/" + nome + ".png" }); };
const esperar = async (fn, ms = 10000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

try {
  // 1) Matheus no celular: barra de baixo numa linha só e menu lateral abre
  const cel = await entrar("matheus.alves@sig.eng.br", { width: 412, height: 900 });
  const alturas = await cel.$$eval(".ti-bottom .ti-bn", (l) => l.filter((x) => getComputedStyle(x).display !== "none").map((x) => Math.round(x.getBoundingClientRect().top)));
  ok(alturas.length >= 4 && new Set(alturas).size === 1, "celular: barra de baixo com " + alturas.length + " botões numa linha só");
  await cel.click(".ti-bn[data-abrir-menu]"); await cel.waitForTimeout(500);
  ok(await cel.evaluate(() => { const r = document.getElementById("ti-side").getBoundingClientRect(); return r.left >= 0 && r.right > 0; }), "celular: menu lateral (três barras) abre");
  await cel.context().close();

  // 2) Matheus no computador: gravar rastreabilidade (porteiro carimba)
  const m = await entrar("matheus.alves@sig.eng.br");
  await irPara(m, "btn-nav-board");
  ok(await m.$('.row[data-fvs="f3"]') !== null && await m.$('.row[data-rast="r1"]') !== null, "Fichas & Rastreabilidade lista as fichas do banco");
  await m.click('.row[data-rast="r1"] [data-open-rast="r1"]'); await m.waitForTimeout(800);
  const pecas = m.locator('[data-line-field="pecas"][data-line-idx="0"]');
  await pecas.fill("L5, V1b, V2"); await m.click("#btn-save");
  const r1 = await esperar(async () => ((await db.doc("rastreabilidade/r1").get()).data().linhas[0].pecas === "L5, V1b, V2"));
  const d1 = (await db.doc("rastreabilidade/r1").get()).data();
  ok(r1 && d1.updatedByEmail === "matheus.alves@sig.eng.br" && d1.updatedAt > T, "salvar rastreabilidade grava e carimba quem/quando");
  await m.click("#modal-close").catch(() => {}); await m.waitForTimeout(400);

  // 2a) v1.34: concretagem que pega mais de um pavimento ("A / B" digitado antes vira dois)
  await irPara(m, "btn-nav-board");
  await m.click('.row[data-rast="r2"] [data-open-rast="r2"]'); await m.waitForSelector("#bloco-pav-caixa", { timeout: 8000 });
  const lidos = await m.$$eval("#bloco-pav-caixa [data-pav-base]", (l) => l.map((x) => x.value));
  ok(lidos.join("|") === "Piso do 5º Embasamento|Piso do 2º Embasamento", "ficha antiga com “/” abre com os dois pavimentos separados (" + lidos.join(" | ") + ")");
  await m.click("#add-bloco-pav");
  await m.selectOption("#bloco-pav-caixa .bloco-pav-linha:last-child [data-pav-base]", "Piso do 3º Embasamento");
  await m.click("#btn-save");
  ok(await esperar(async () => { const x = (await db.doc("rastreabilidade/r2").get()).data(); return (x.pavimentos || []).length === 3 && x.blocoPav === "Piso do 5º Embasamento / Piso do 2º Embasamento / Piso do 3º Embasamento"; }), "adicionar pavimento no topo da ficha grava os três");
  await m.click("#modal-close").catch(() => {}); await m.waitForTimeout(400);

  // 2b) exportações nos modelos oficiais (Excel) e relatório de NC (Word)
  const baixar = async (acao) => { const [dl] = await Promise.all([m.waitForEvent("download", { timeout: 20000 }), acao()]); return JSZip.loadAsync(fs.readFileSync(await dl.path())); };
  for (const [tipo, id] of [["fvs", "f1"], ["rast", "r1"]]) {
    await irPara(m, "btn-nav-board");
    await m.click(`[data-open-${tipo}="${id}"]`); await m.waitForTimeout(800);
    const z = await baixar(() => m.click("#btn-export"));
    const planilha = Object.keys(z.files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    ok(planilha && /Belavista|Suellen|05538|FVS|14/.test(await z.file(planilha).async("string") + await (z.file("xl/sharedStrings.xml") ? z.file("xl/sharedStrings.xml").async("string") : "")), `exportar ${tipo === "fvs" ? "FVS" : "rastreabilidade"} para Excel (modelo oficial)`);
    await m.click("#modal-close").catch(() => {}); await m.waitForTimeout(400);
  }
  await irPara(m, "btn-nav-nc");
  const w = await baixar(() => m.evaluate(() => document.getElementById("btn-relatorio-nc").click()));
  ok(/Prumo do pilar P7/.test(await w.file("word/document.xml").async("string")), "relatório de NC em Word traz a pendência");

  // 2c) controle tecnológico: abrir a ficha da nota e lançar o resultado de 28 dias
  await irPara(m, "btn-view-ct");
  ok(await m.$('[data-ct-abrir="nf_07001"]') !== null, "CT: resultado de 7 dias vencido aparece como pendente");
  await m.evaluate(() => { const b = document.querySelector('[data-ct-sit="todos"]'); if (b) b.click(); }); await m.waitForTimeout(400); // ver todas as notas
  await m.click('[data-ct-abrir="nf_05538"]'); await m.waitForSelector('[data-ctf="r28"]', { timeout: 8000 });
  ok((await m.$$eval(".ct-res-grid label", (l) => l.map((x) => x.textContent).join("|"))) === "7 dias|7' dias|28 dias|28' dias|63 dias|63' dias", "ficha do CT só com 7, 28 e 63 dias");
  await m.fill('[data-ctf="r28"]', "45"); await m.click("[data-ct-salvar]");
  const ct = await esperar(async () => { const x = (await db.doc("controleTecnologico/nf_05538").get()).data(); return String(x.r28) === "45" && x.atualizadoPor === "matheus.alves@sig.eng.br"; });
  ok(ct, "controle tecnológico: resultado gravado e carimbado");

  // 2d) v1.36: CT → "No mapa: abaixo do fck" mostra a planta só com a BT da nota
  await irPara(m, "btn-view-ct");
  await m.click('[data-ct-aba="mapa"]');
  ok(await esperar(async () => (await m.$$(".ct-mapa-host svg polygon")).length === 1), "CT no mapa: a planta aparece só com a BT da nota abaixo do fck");
  ok(/BT 2 · NF 08002/.test(await m.$eval(".ct-mapa-host svg", (s) => s.textContent)), "CT no mapa: rótulo “BT 2 · NF 08002” com o resultado");
  ok(await m.$eval(".ct-mapa-host svg", (s) => !!s.querySelector("line")), "BT miúda: rótulo fora da área, com linha");
  await foto(m, "ct-mapa");
  await m.click('[data-ct-aba="notas"]');

  // 2e) v1.36: ficha de concretagem com abas — FVS do local e controle tecnológico
  await irPara(m, "btn-nav-board");
  await m.click('.row[data-rast="r3"] [data-open-rast="r3"]'); await m.waitForSelector('[data-rast-aba="fvs"]', { timeout: 8000 });
  await m.click('[data-rast-aba="fvs"]');
  ok(await m.isVisible('[data-rast-abrir-fvs="f3"]'), "aba FVS do local: lista a FVS do mesmo pavimento");
  await foto(m, "rast-aba-fvs");
  await m.click('[data-rast-aba="ct"]');
  ok(await esperar(async () => (await m.$$('[data-painel="ct"] .ct-mapa-host svg polygon')).length === 1), "aba Controle tecnológico: planta com a BT abaixo do fck");
  await m.click('[data-rast-aba="concretagem"]');
  ok(await m.isVisible('[data-line-field="pecas"][data-line-idx="0"]'), "aba Concretagem: formulário de sempre");

  // 2f) v1.36: pendências da desforma → não conformidade na FVS 04 da concretagem (criada e ligada)
  await m.click('[data-rast-aba="fvs"]');
  await m.click('[data-desforma-rast="r3"]'); await m.waitForSelector(".dsf [data-sem-foto]", { timeout: 8000 });
  await m.click(".dsf [data-sem-foto]");
  await m.selectOption(".dsf-item [data-campo=elemento]", "Pilar");
  await m.fill(".dsf-item [data-campo=descricao]", "Bicheira no pilar P12");
  await foto(m, "desforma-fotos");
  await m.click(".dsf [data-gravar]");
  const desf = await esperar(async () => {
    const q = await db.collection("fvs").where("rastreabilidadeId", "==", "r3").get();
    const r3 = (await db.doc("rastreabilidade/r3").get()).data();
    return q.size === 1 && q.docs[0].data().naoConformidades[0].descricao === "Pilar: Bicheira no pilar P12" && q.docs[0].data().naoConformidades[0].origem === "desforma" && r3.fvsId === q.docs[0].id;
  });
  ok(desf, "desforma: pendência gravada na FVS 04 criada e ligada à concretagem");
  ok(await m.isVisible(".dsf [data-enviar]"), "desforma: botão de enviar no WhatsApp");
  await foto(m, "desforma-enviar");
  await m.click(".dsf [data-fechar]"); await m.waitForTimeout(300);
  await m.click("#modal-close").catch(() => {}); await m.waitForTimeout(400);

  // 2g) v1.37: plantas por disciplina (as antigas contam como forma) e troca de disciplina
  await irPara(m, "btn-view-plantas");
  await m.click('[data-filtro-disc="Arquitetura"]');
  ok((await m.$$("[data-disc-planta]")).length === 1 && await m.$('[data-disc-planta="p2"]') !== null, "plantas: filtro por disciplina (Arquitetura)");
  await m.click('[data-filtro-disc=""]');
  await m.selectOption('[data-disc-planta="p1"]', "Elétrica");
  ok(await esperar(async () => (await db.doc("plantas/p1").get()).data().disciplina === "Elétrica"), "plantas: trocar a disciplina grava no banco");

  // 3) excluir FVS = lixeira (continua no banco, some do app)
  await irPara(m, "btn-nav-board");
  await m.click('.row[data-fvs="f3"] [data-open-fvs="f3"]'); await m.waitForSelector("#btn-delete", { timeout: 8000 });
  await m.click("#btn-delete");
  const foi = await esperar(async () => (await db.doc("fvs/f3").get()).data().excluido === true);
  const d3 = (await db.doc("fvs/f3").get());
  ok(foi && d3.exists && d3.data().numero === "30" && d3.data().excluidoPor === "matheus.alves@sig.eng.br", "excluir FVS: vai para a lixeira, nada é apagado do banco");
  ok(await esperar(async () => (await m.$('.row[data-fvs="f3"]')) === null), "FVS excluída some da lista");

  // 4) sincronização incremental: reabre o app (cache + só o que mudou) e recebe alteração de outro aparelho
  await m.reload(); await m.waitForSelector("#app-root:not([hidden])", { timeout: 30000 }); await m.waitForTimeout(2000);
  ok(await m.evaluate(() => !!localStorage.getItem("traco-fvs-sync-completa")), "primeira abertura marcou a sincronização completa");
  ok(await esperar(() => m.evaluate(() => window.__tracoSincFvs && window.__tracoSincFvs() === "incremental")), "ao reabrir: lê do aparelho e pede ao banco só o que mudou");
  await irPara(m, "btn-nav-board");
  ok(await m.$('.row[data-fvs="f1"]') !== null && await m.$('.row[data-fvs="f3"]') === null, "reaberto do cache: fichas certas (sem a da lixeira)");
  await db.doc("fvs/f1").set({ numero: "77", updatedAt: new Date().toISOString(), updatedByEmail: "outro@aparelho" }, { merge: true });
  ok(await esperar(async () => /FVS 04 · 77/.test(await m.$eval('.row[data-fvs="f1"]', (e) => e.textContent).catch(() => ""))), "alteração de outro aparelho chega sem baixar tudo");

  // 4b) lixeira: a FVS excluída aparece lá e volta ao restaurar
  await irPara(m, "btn-view-lixeira");
  ok(await m.$('[data-restaurar="fvs|f3"]') !== null, "lixeira mostra a FVS excluída");
  await m.click('[data-restaurar="fvs|f3"]');
  ok(await esperar(async () => (await db.doc("fvs/f3").get()).data().excluido === false), "restaurar tira da lixeira (no banco)");
  await irPara(m, "btn-nav-board");
  ok(await esperar(async () => (await m.$('.row[data-fvs="f3"]')) !== null), "FVS restaurada volta para a lista");

  // 4c) histórico de alterações: um documento por dia, com quem/quando/o quê
  const dia = (() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); })();
  const ents = async () => ((await db.doc("auditoria/" + dia).get()).data() || {}).entradas || [];
  ok(await esperar(async () => (await ents()).some((e) => e.col === "fvs" && e.id === "f3" && e.acao === "restaurou")), "histórico registra excluir e restaurar");
  const e = await ents();
  ok(e.some((x) => x.col === "fvs" && x.id === "f3" && x.acao === "excluiu" && x.por === "matheus.alves@sig.eng.br")
    && e.some((x) => x.col === "rastreabilidade" && x.id === "r1" && x.acao === "alterou" && (x.campos || []).includes("linhas")), "histórico: quem excluiu e quais campos mudaram na rastreabilidade");
  await irPara(m, "btn-view-historico"); await m.waitForTimeout(1200);
  ok((await m.$$("#view-historico .hist-item")).length >= 3, "tela Histórico lista as alterações");
  await m.click('.row[data-rast="r1"] [data-open-rast="r1"]').catch(async () => { await irPara(m, "btn-nav-board"); await m.click('.row[data-rast="r1"] [data-open-rast="r1"]'); });
  await m.waitForSelector('#modal [data-ver-historico]', { timeout: 8000 }); await m.click('#modal [data-ver-historico]'); await m.waitForTimeout(1200);
  const soDela = await m.$$eval("#view-historico .hist-item", (l) => l.map((x) => x.textContent));
  ok(soDela.length >= 1 && soDela.every((t) => /Rastreabilidade/.test(t)), "“Ver histórico” da ficha mostra só as alterações dela");
  await m.context().close();

  // 4d) Equipe: guardar a equipe no banco, incluir pessoa (com login) e deixar a Alice só visualizando
  const eqm = await entrar("matheus.alves@sig.eng.br");
  await irPara(eqm, "btn-view-equipe");
  await eqm.click("[data-eq-salvar-inicial]");
  ok(await esperar(async () => (await db.collection("equipe").get()).size === 4), "Equipe: a lista de hoje vai para o banco (4 pessoas)");
  await eqm.waitForSelector("#eq-nome", { timeout: 8000 });
  await eqm.fill("#eq-nome", "Bruno Teste"); await eqm.fill("#eq-email", "Bruno.Teste@sig.eng.br"); await eqm.selectOption("#eq-perfil", "estagiario");
  await eqm.click("[data-eq-incluir]");
  ok(await esperar(async () => (await db.doc("equipe/bruno.teste@sig.eng.br").get()).exists), "Equipe: pessoa nova incluída (e-mail em minúsculas)");
  ok(await esperar(async () => { try { await admin.auth().getUserByEmail("bruno.teste@sig.eng.br"); return true; } catch (e) { return false; } }), "Equipe: login da pessoa nova criado (e o Matheus continua logado)");
  ok(await eqm.evaluate(() => window.firebase.auth().currentUser.email) === "matheus.alves@sig.eng.br", "quem criou o login não foi desconectado");
  await eqm.selectOption('[data-eq-perfil="alice.soares@sig.eng.br"]', "qualidade");
  ok(await esperar(async () => (await db.doc("equipe/alice.soares@sig.eng.br").get()).data().perfil === "qualidade"), "Equipe: perfil da Alice trocado para qualidade");
  await eqm.context().close();
  const al = await entrar("alice.soares@sig.eng.br");
  ok(await esperar(() => al.evaluate(() => document.body.classList.contains("somente-leitura"))), "Alice (qualidade) entra só visualizando — sem versão nova");
  const alRec = await al.evaluate(() => window.firebase.firestore().collection("tarefas").doc("t1").update({ titulo: "y" }).then(() => false, (e) => e.code === "permission-denied"));
  ok(alRec, "e o banco também recusa a gravação dela");
  await al.context().close();

  // 5) Suellen abre no Painel da engenharia
  const s = await entrar("suellen.alves@sig.eng.br");
  ok(await s.evaluate(() => !document.getElementById("view-engenharia").hidden), "Suellen abre no Painel da engenharia");
  ok((await s.$$("#view-engenharia .dash-kpi-card")).length > 0, "Painel da engenharia mostra indicadores");
  await s.click("[data-eng-sel-prontas]"); await s.waitForTimeout(300);
  await s.click("[data-eng-lote]");
  const assinou = await esperar(async () => { const x = (await db.doc("fvs/f1").get()).data(); return x.travada === true && (x.assinaturas || []).length === 1; });
  const f1 = (await db.doc("fvs/f1").get()).data();
  ok(assinou && f1.updatedByEmail === "suellen.alves@sig.eng.br", "Suellen assina em lote: ficha travada e carimbada");
  await s.context().close();

  // 5b) estagiário acrescenta a assinatura na ficha travada (regras do banco aceitam com o carimbo)
  const m2 = await entrar("matheus.alves@sig.eng.br");
  await irPara(m2, "btn-nav-board");
  await m2.click('.row[data-fvs="f1"] [data-open-fvs="f1"]'); await m2.waitForSelector('#modal [data-assinar-papel="tecnico"]', { timeout: 8000 });
  await m2.click('#modal [data-assinar-papel="tecnico"]');
  ok(await esperar(async () => ((await db.doc("fvs/f1").get()).data().assinaturas || []).length === 2), "estagiário assina a ficha travada (2 assinaturas)");
  // 5c) estagiário assina em lote (inspeção/coleta) — antes o botão ficava desligado
  await m2.click("#modal-close").catch(() => {}); await m2.waitForTimeout(300);
  ok(await m2.evaluate(() => getComputedStyle(document.getElementById("btn-view-assinar")).display === "none"), "administrador não vê “Assinar em lote” no menu (usa o Painel da engenharia)");
  await irPara(m2, "btn-view-assinar");
  await m2.selectOption("#eng-periodo", "todas"); await m2.waitForTimeout(300);
  ok(await m2.$('[data-eng-sel="fvs|f3"]') !== null && await m2.$('[data-eng-sel="rastreabilidade|r1"], [data-eng-sel="rast|r1"]') !== null && await m2.$('[data-eng-sel="fvs|f1"]') === null,
    "Assinar em lote: lista o que falta a assinatura do estagiário (e não a que ele já assinou)");
  await m2.click("[data-eng-sel-todas]"); await m2.waitForTimeout(200);
  await m2.click("[data-eng-lote]");
  const lote = await esperar(async () => {
    const f3 = (await db.doc("fvs/f3").get()).data(), r1 = (await db.doc("rastreabilidade/r1").get()).data();
    return (f3.assinaturas || []).some((a) => a.papel === "estagiario") && (r1.assinaturas || []).some((a) => a.papel === "estagiario") && f3.travada !== true;
  });
  ok(lote, "estagiário assinou em lote a FVS e a rastreabilidade (sem travar a FVS)");
  await m2.context().close();

  // 6) Jessica só visualiza
  const j = await entrar("jessica.araujo@sig.eng.br");
  ok(await j.evaluate(() => document.body.classList.contains("somente-leitura")), "Jessica entra como somente leitura");
  const recusou = await j.evaluate(() => window.firebase.firestore().collection("tarefas").doc("t1").set({ titulo: "x" }, { merge: true }).then(() => false, (e) => e.code === "permission-denied"));
  ok(recusou && (await db.doc("tarefas/t1").get()).data().titulo !== "x", "Jessica não consegue gravar (o porteiro recusa)");
  await j.context().close();
} catch (e) {
  console.error(e); falhas++;
} finally {
  await navegador.close();
}
ok(erros.length === 0, "nenhum erro de JavaScript nas telas" + (erros.length ? ": " + erros.join(" | ") : ""));
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
