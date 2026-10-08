// Teste do aviso aço × cronograma: node tests/aco-cronograma.test.mjs
// Usa o cronograma real se existir na Área de Trabalho; senão, um sintético.
import fs from "fs";
import XLSX from "xlsx-js-style";
import { lerCronograma } from "../src/modulos/cronograma/cpm.js";
import { chaveDaTarefa, chavesDaEntrega, acoParaLajes, textoAviso } from "../src/modulos/aco/aco-cronograma.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

ok(chaveDaTarefa("Teto do 4º Pavimento") === "pav:4", "teto de pavimento");
ok(chaveDaTarefa("Teto do 3º Embasamento (Maria Quitéria)") === "emb:3", "teto de embasamento");
ok(chaveDaTarefa("Complemento Piso do 5º Embasamento (Maria Quitéria)") === "emb:5", "complemento de piso");
ok(chaveDaTarefa("Teto do Subsolo (Prudente de Morais)") === "subsolo", "subsolo");
ok(chaveDaTarefa("Teto Casa de Máquinas / Reservatório Superior") === "cm", "casa de máquinas");
ok(chaveDaTarefa("Alvenaria 4º Pavimento") === null, "não-laje ignorada");
const real = { destino: "1º Pavimento — Laje e Viga", itens: [{ prancha: "PDM-EST-EX-424-PB-1PV-ARMV_R02", descricao: "Armação das Vigas do 1º Pavimento" }] };
ok([...chavesDaEntrega(real)].join() === "pav:1", "entrega real → pav:1");
ok(chavesDaEntrega({ destino: "", itens: [{ prancha: "XX-EST-3PV-ARML" }] }).has("pav:3"), "código da prancha -3PV-");
ok(chavesDaEntrega({ destino: "Laje do 2º Emb." }).has("emb:2"), "abreviação Emb");

const arq = "C:/Users/Pichau/Desktop/Cópia de Cronograma Belavista Setembro 2026.xlsx";
let linhas;
if (fs.existsSync(arq) && !process.env.CI) {
  const wb = XLSX.read(fs.readFileSync(arq));
  linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  console.log("(cronograma real)");
} else {
  linhas = [["Atividade", "% concluída", "Predecessoras", "Início", "Duração", "Término"],
    ["Obra", "10%", "", "", "", ""], ["   ESTRUTURA", "10%", "", "", "", ""],
    ["      Teto do 3º Pavimento", "0%", "", "Ter 29/09/26", "7 d", "Qua 07/10/26"],
    ["      Teto do 4º Pavimento", "0%", "", "Qui 08/10/26", "9 d", "Ter 20/10/26"],
    ["      Teto do 5º Pavimento", "0%", "", "Qua 21/10/26", "7 d", "Qui 29/10/26"],
    ["      Teto do 6º Pavimento", "0%", "", "Sex 30/10/26", "8 d", "Ter 10/11/26"],
    ["      Teto do 9º Pavimento", "0%", "", "Qua 02/12/26", "7 d", "Qui 10/12/26"]];
}
const cr = lerCronograma(linhas);
const hoje = "2026-10-08";
const entregas = [
  { id: "a", status: "entregue", dataEntrega: "2026-10-05", destino: "4º Pavimento — Laje" },
  { id: "b", status: "programado", dataPrevista: "2026-10-27", destino: "5º Pavimento" },        // início 21/10 → tarde
  { id: "c", status: "programado", dataPrevista: "2026-10-01", destino: "3º Pavimento" },        // atrasada
  { id: "d", status: "cancelado", dataPrevista: "2026-10-20", destino: "6º Pavimento" },         // cancelada não conta
  { id: "e", status: "entregue", dataEntrega: "2026-07-10", destino: "9º Pavimento" },           // muito antiga
];
const r = acoParaLajes(cr, entregas, hoje, { antecedencia: 30 });
const por = (n) => r.find((x) => x.tarefa.nome === n);
r.forEach((x) => console.log("     ", x.tipo.padEnd(8), x.tarefa.ini, x.tarefa.nome, "|", textoAviso(x, (d) => d.split("-").reverse().join("/")).sub));
ok(por("Teto do 4º Pavimento") && por("Teto do 4º Pavimento").tipo === "ok", "4º pav: aço entregue → ok");
ok(por("Teto do 5º Pavimento") && por("Teto do 5º Pavimento").tipo === "tarde", "5º pav: chega depois do início → tarde");
ok(por("Teto do 3º Pavimento") && por("Teto do 3º Pavimento").tipo === "atrasada", "3º pav: entrega vencida → atrasada");
ok(por("Teto do 6º Pavimento") && por("Teto do 6º Pavimento").tipo === "sem", "6º pav: só entrega cancelada → sem aço");
ok(!por("Teto do 9º Pavimento"), "9º pav: fora da janela de 30 dias");
ok(!por("Teto do 1º Pavimento"), "lajes concluídas ficam de fora");
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
