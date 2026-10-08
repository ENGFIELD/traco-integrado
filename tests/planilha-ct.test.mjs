// Teste da exportação do CT na planilha-modelo: node tests/planilha-ct.test.mjs
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { preencherPlanilhaCt } from "../src/modulos/ct/planilha-ct.js";

const COLS = { local:0, volume:4, fck:5, notaRemessa:6, laboratorio:7, concreteira:8, dataConcretagem:9, numCps:10, slump:11,
  data7:12, data14:13, data28:14, data63:15, cpsConforme:16, r3:17, r7:18, r7b:19, r14:20, r14b:21, r28:22, r28b:23, r63:24, r63b:25, observacao:26 };
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "ok   " : "FALHA") + " " + msg); if (!cond) falhas++; };

// ---------- planilha-modelo parecida com a real ----------
const borda = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
const sData = { numFmt: "dd/mm/yyyy", border: borda, alignment: { horizontal: "center" } };
const sTxt = { border: borda, fill: { fgColor: { rgb: "FFF2CC" } } };
const ws = {};
const put = (ref, v, s, t) => { ws[ref] = { v, t: t || (typeof v === "number" ? "n" : "s"), s }; };
put("A1", "CONTROLE TECNOLÓGICO DO CONCRETO", { font: { bold: true, sz: 16 } });
put("A6", "LOCAL", sTxt); put("G6", "NOTA", sTxt); put("M6", "DATA 7", sTxt);
const linhaModelo = (r, nf, conc, local) => {
  put("A" + r, local, sTxt); put("E" + r, 8, { border: borda }); put("F" + r, 35, { border: borda });
  put("G" + r, nf, { border: borda }); put("H" + r, "Lab X", sTxt); put("I" + r, "Concreteira Y", sTxt);
  put("J" + r, conc, sData, "n");
  ws["M" + r] = { t: "n", f: `J${r}+7`, v: conc + 7, s: sData };
  ["N", "O", "P"].forEach((c) => put(c + r, "", sData, "s"));
  ["W", "X", "AA"].forEach((c) => put(c + r, "", { border: borda }, "s"));
};
linhaModelo(7, 1001, 46000, "Laje 1º pav"); linhaModelo(8, 1002, 46001, "Laje 1º pav"); linhaModelo(9, "001003", 46002, "Pilares");
put("W7", 38.5, { border: borda });
// duas linhas vazias formatadas
[10, 11].forEach((r) => ["A", "G", "J", "W"].forEach((c) => put(c + r, "", c === "J" ? sData : { border: borda }, "s")));
ws["!ref"] = "A1:AA11";
ws["!merges"] = [XLSX.utils.decode_range("A1:K1"), XLSX.utils.decode_range("A9:D9")];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["capa"]]), "CAPA");
XLSX.utils.book_append_sheet(wb, ws, "CONT. TECNOLÓGICO");
const bufModelo = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });

// ---------- dados do app ----------
const regs = [
  { notaRemessa: "1001", local: "Laje 1º pav", volume: 8, fck: 35, dataConcretagem: "2025-12-08", r28: 41.2, observacao: "ok" },   // W7 já tem 38,5 → muda p/ 41,2
  { notaRemessa: "1002", local: "Laje 1º pav", volume: 8, fck: 35, r7: "28,4" },                                                   // novo resultado
  { notaRemessa: "1003", local: "Pilares", volume: 8, fck: 35 },                                                                   // nada muda
  { notaRemessa: "2001", local: "Laje 2º pav", volume: 7, fck: 35, dataConcretagem: "2026-01-10", laboratorio: "Lab X" },          // só no app → linha 10
  { notaRemessa: "2002", local: "Laje 2º pav", volume: 6.5, fck: 35, dataConcretagem: "2026-01-10" },                               // → linha 11
  { notaRemessa: "2003", local: "Viga 2º pav", volume: 5, fck: 35, dataConcretagem: "2026-01-11", observacao: "<teste & aspas \"x\">" }, // → cópia (linha 12)
];

const zip = await JSZip.loadAsync(bufModelo);
const capaAntes = await zip.file("xl/worksheets/sheet1.xml").async("string");
const res = await preencherPlanilhaCt(zip, regs, COLS);
console.log(res);
const saida = await zip.generateAsync({ type: "nodebuffer" });
ok((await zip.file("xl/worksheets/sheet1.xml").async("string")) === capaAntes, "outra aba intacta");

const wb2 = XLSX.read(saida, { cellStyles: true, cellFormula: true });
const w = wb2.Sheets["CONT. TECNOLÓGICO"];
const v = (r) => (w[r] ? w[r].v : undefined);
ok(v("A1") === "CONTROLE TECNOLÓGICO DO CONCRETO", "título preservado");
ok(v("W7") === 41.2, "resultado 28d atualizado na linha da NF 1001");
ok(v("S8") === 28.4, "resultado 7d (texto com vírgula) gravado como número");
ok(v("G9") === "001003", "NF 001003 reconhecida como 1003 e não duplicada");
ok(v("G10") === 2001 && v("G11") === 2002 && v("G12") === 2003, "NFs novas nas linhas vazias e depois em linha copiada");
ok(v("A12") === "Viga 2º pav" && v("AA12") === "<teste & aspas \"x\">", "texto com caracteres especiais");
ok(w["M12"] && w["M12"].f === "J12+7", "fórmula copiada e ajustada (J12+7)");
ok(w["M7"] && w["M7"].f === "J7+7", "fórmula original mantida");
ok(w["J12"] && w["J12"].v === 46033, "data de concretagem como data do Excel");
ok(res.atualizadas === 2 && res.novas === 3, "contagem: 2 atualizadas, 3 novas");
ok(w["!ref"] === "A1:AA12", "dimensão da aba ampliada");
ok((w["!merges"] || []).some((m) => XLSX.utils.encode_range(m) === "A12:D12"), "mesclagem da linha-modelo (A9:D9) copiada para A12:D12");
const xmlAba = await zip.file("xl/worksheets/sheet2.xml").async("string");
const estilo = (ref) => (new RegExp(`<c r="${ref}"[^>]*?s="(\\d+)"`).exec(xmlAba) || [])[1];
ok(estilo("J12") === estilo("J9") && estilo("A12") === estilo("A9"), "linha nova com o mesmo estilo da linha-modelo");
ok(estilo("W7") === (new RegExp(`<c r="W8"[^>]*?s="(\\d+)"`).exec(xmlAba) || [])[1], "célula alterada mantém o estilo");
ok(/fullCalcOnLoad="1"/.test(await zip.file("xl/workbook.xml").async("string")), "Excel recalcula ao abrir");
if (process.env.SAIDA) (await import("fs")).writeFileSync(process.env.SAIDA, saida);
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
