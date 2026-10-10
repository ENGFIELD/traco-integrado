// Teste das pendências da desforma (v1.36): node tests/desforma.test.mjs
import { mensagemDesforma, concretagensDoPavimento, ncDaDesforma, RESPONSAVEL_PADRAO } from "../src/modulos/nc/desforma.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

const txt = mensagemDesforma({ pavimento: "Piso do 6º Pavimento Tipo", dataConcretagem: "2026-09-29", fvs: "FVS 04 nº 31", prazo: "2026-10-15", responsavel: "Freiba",
  itens: [{ elemento: "Pilar", descricao: "bicheira no P12", temFoto: true }, { descricao: "", temFoto: true }, { elemento: "Laje", descricao: "rebarba na borda", temFoto: false }] });
ok(txt.includes("Piso do 6º Pavimento Tipo") && txt.includes("29/09/2026") && txt.includes("FVS 04 nº 31"), "mensagem: local, data da concretagem e FVS");
ok(txt.includes("1. Pilar: bicheira no P12 (foto 1)") && txt.includes("2. ver foto (foto 2)") && txt.includes("3. Laje: rebarba na borda\n"), "mensagem: uma linha por pendência, com o nº da foto");
ok(txt.includes("Prazo para corrigir: 15/10/2026") && txt.includes("Responsável: Freiba"), "mensagem: prazo e responsável");

const rasts = [
  { id: "a", r: { data: "2026-09-01", pavimentos: ["Piso do 6º Pavimento Tipo"] } },
  { id: "b", r: { data: "2026-09-29", pavimentos: ["Piso do 6º Pavimento Tipo — Trecho Volt"] } },
  { id: "c", r: { data: "2026-09-30", pavimentos: ["Piso do 7º Pavimento Tipo"] } },
];
const nivel = (p) => (/(\d+)º Pav/.exec(p) || [])[1];
const compat = (a, b) => nivel(a) === nivel(b);
const lista = concretagensDoPavimento(rasts, "Piso do 6º Pavimento Tipo", compat, (r) => r.pavimentos);
ok(lista.map((x) => x.id).join(",") === "b,a", "concretagens do pavimento, da mais nova para a mais antiga");
ok(concretagensDoPavimento(rasts, "", compat, (r) => r.pavimentos).length === 0, "sem pavimento escolhido, nenhuma");

const nc = ncDaDesforma({ elemento: "Viga", descricao: "  desalinhada  ", anexos: [{ url: "u", tipo: "image/jpeg" }] }, { hoje: "2026-10-10", prazo: "", responsavel: "", rastId: "r9", email: "m@x", agora: "T" });
ok(nc.descricao === "Viga: desalinhada" && nc.origem === "desforma" && nc.etapa === "Desforma" && nc.concluida === false, "não conformidade com origem desforma");
ok(nc.responsavel === RESPONSAVEL_PADRAO && nc.rastreabilidadeId === "r9" && nc.anexos.length === 1 && nc.dataRegistro === "2026-10-10", "responsável padrão, concretagem e foto ligados");
ok(ncDaDesforma({}, { hoje: "h" }).descricao.includes("ver foto"), "sem texto: descrição padrão");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
