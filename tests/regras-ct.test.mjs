// Regras de aceitação do Controle Tecnológico: node tests/regras-ct.test.mjs
import { abaixoEm, precisaJustificativa, justificada, justificativaPendente, impedimentosConcluir, observacaoComJustificativa } from "../src/modulos/ct/regras-ct.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
const J = { causa: "cura deficiente", resolucao: "extração de testemunhos; laudo ok" };

ok(abaixoEm({ fck: 35, r28: 36, r63: 40 }).length === 0, "bateu aos 28 e 63: nada a justificar");
ok(abaixoEm({ fck: 35, r28: "32,5", r63: 37 }).join() === "28", "abaixo aos 28 (mesmo batendo aos 63) → justificar");
ok(abaixoEm({ fck: 35, r28: 36, r63: 34 }).join() === "63", "abaixo só aos 63 → justificar");
ok(abaixoEm({ fck: 35, r28: 30, r28b: 36 }).length === 0, "usa o melhor entre 28 e 28'");
ok(abaixoEm({ fck: 35, r28: 30, r63: 33 }).join() === "28,63", "abaixo nas duas idades");
ok(abaixoEm({ fck: "", r28: 10 }).length === 0, "sem fck não acusa");
ok(precisaJustificativa({ fck: 35, r28: 32 }) && !justificada({}), "precisa e não tem");
ok(!justificada({ justificativaFck: { causa: "x", resolucao: " " } }), "só causa não basta");
ok(!justificativaPendente({ fck: 35, r28: 32, justificativaFck: J }), "justificada: não fica pendente");
ok(impedimentosConcluir({ fck: 35, r28: 36 }).join() === "falta o resultado de 63 dias", "63 dias é obrigatório para concluir");
ok(impedimentosConcluir({ fck: 35, r28: 32, r63: 36 }).length === 1, "abaixo aos 28 sem justificativa impede concluir");
ok(impedimentosConcluir({ fck: 35, r28: 32, r63: 36, justificativaFck: J }).length === 0, "com 28, 63 e justificativa pode concluir");
ok(observacaoComJustificativa({ fck: 35, r28: 32, r63: 36, observacao: "CONCLUÍDO", justificativaFck: J }) === "CONCLUÍDO | Abaixo do fck aos 28 dias. Causa: cura deficiente. Resolução: extração de testemunhos; laudo ok.", "observação da planilha leva a justificativa");
ok(observacaoComJustificativa({ observacao: "ok" }) === "ok", "sem justificativa: observação igual");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
