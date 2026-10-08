// Lista de pendências → NCs nas FVS: node tests/pendencias.test.mjs
import { lerPendencias, sugerirFvs, pavimentoNoTexto, fvsNoTexto, dataISO } from "../src/modulos/nc/pendencias.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

// texto de WhatsApp
const t = lerPendencias(`Pendências vistoria 08/10:
- 5º pav: falta espaçador na viga V3, corrigir até 12/10
2) 3º embasamento - FVS nº 14 - prumo do pilar P7 fora da tolerância
• Cobertura: impermeabilização com bolha no ralo`, "2026-10-08");
ok(t.length === 4, "uma pendência por linha (inclusive o título, que o dono pode desmarcar)");
ok(t[1].pavimento === "5º pav" && t[1].prazo === "2026-10-12", "pavimento e prazo saem do texto");
ok(t[2].fvs === "14" && /3º embasamento/i.test(t[2].pavimento), "nº da FVS e embasamento");
ok(t[3].pavimento === "Cobertura" && t[3].descricao.startsWith("Cobertura"), "marcador • removido");

// colado do Excel (TAB)
const x = lerPendencias("Item\tLocal\tPendência\tAção corretiva\tPrazo\tResponsável\n1\t4º Pavimento\tReboco com fissura no hall\tRefazer reboco\t15/10/2026\tEmpreiteira Alfa\n2\t6º Pavimento\tFalta pingadeira\t\t\t", "2026-10-08");
ok(x.length === 2, "tabela: 2 pendências");
ok(x[0].descricao === "Reboco com fissura no hall" && x[0].correcao === "Refazer reboco" && x[0].prazo === "2026-10-15" && x[0].responsavel === "Empreiteira Alfa" && x[0].pavimento === "4º Pavimento", "colunas reconhecidas pelo cabeçalho");

// planilha (array) sem cabeçalho
const s = lerPendencias([["7º pavimento", "Laje com ninho de concretagem"], ["", ""]], "2026-10-08");
ok(s.length === 1 && s[0].pavimento === "7º pavimento", "sem cabeçalho: junta as células");

ok(pavimentoNoTexto("no 12º Pavimento Tipo, sala") === "12º Pavimento Tipo", "pavimento tipo");
ok(fvsNoTexto("FVS 04 nº 7") === "7" && fvsNoTexto("ficha 23") === "23", "nº da ficha");
ok(dataISO(46300) === "2026-10-05" && dataISO("1/2/27") === "2027-02-01", "datas do Excel e curtas");

// sugestão de ficha
const nivel = (p) => { const m = /(\d+)\s*º?\s*(pav|emb)/i.exec(p || ""); return m ? (/emb/i.test(m[2]) ? 1 + Number(m[1]) : 6 + Number(m[1])) : (/cobertura/i.test(p) ? 24 : 9999); };
const fichas = [
  { id: "a", numero: "14", codigo: "FVS 04", titulo: "Forma, armação e concretagem", pavimentos: ["3º Embasamento"], data: "2026-09-01" },
  { id: "b", numero: "20", codigo: "FVS 04", titulo: "Forma, armação e concretagem", pavimentos: ["5º Pavimento Tipo"], data: "2026-10-01" },
  { id: "c", numero: "21", codigo: "FVS 31", titulo: "Impermeabilização rígida", pavimentos: ["Cobertura"], data: "2026-10-02" },
  { id: "d", numero: "22", codigo: "FVS 04", titulo: "Forma, armação e concretagem", pavimentos: ["5º Pavimento Tipo"], data: "2026-09-02" },
];
ok(sugerirFvs(t[2], fichas, nivel) === "a", "pelo nº da FVS");
ok(sugerirFvs(t[1], fichas, nivel) === "b", "pelo pavimento (a mais recente)");
ok(sugerirFvs(t[3], fichas, nivel) === "c", "pavimento + serviço (impermeabilização)");
ok(sugerirFvs({ descricao: "limpeza geral", pavimento: "" }, fichas, nivel) === "", "sem pista: deixa para escolher");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
