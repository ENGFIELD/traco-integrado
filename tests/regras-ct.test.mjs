// Regras de aceitação do Controle Tecnológico: node tests/regras-ct.test.mjs
import { situacao, emAberto, observacaoExportada, anterior, obsConcluida, obsJustificativa, concluida, anterioresAoSistema, abaixoEm, precisaJustificativa, justificada, justificativaPendente, impedimentosConcluir, observacaoComJustificativa } from "../src/modulos/ct/regras-ct.js";

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
ok(impedimentosConcluir({ fck: 35, r28: 36 }).length === 0, "v1.18: com 28 dias o dono já pode concluir");
ok(impedimentosConcluir({ fck: 35 }).join() === "falta o resultado de 28 dias", "sem 28 dias não conclui");
ok(impedimentosConcluir({ fck: 35, r28: 32, r63: 36 }).length === 1, "abaixo aos 28 sem justificativa impede concluir");
ok(impedimentosConcluir({ fck: 35, r28: 32, r63: 36, justificativaFck: J }).length === 0, "com 28, 63 e justificativa pode concluir");
ok(observacaoComJustificativa({ fck: 35, r28: 32, r63: 36, observacao: "CONCLUÍDO", justificativaFck: J }) === "CONCLUÍDO | Abaixo do fck aos 28 dias. Causa: cura deficiente. Resolução: extração de testemunhos; laudo ok.", "observação da planilha leva a justificativa");
ok(observacaoComJustificativa({ observacao: "ok" }) === "ok", "sem justificativa: observação igual");

// v1.17: anteriores ao sistema e coluna Observação da planilha
ok(!precisaJustificativa({ fck: 35, r28: 30, anteriorAoSistema: true }) && concluida({ anteriorAoSistema: true }), "anterior ao sistema: fora dos indicadores e concluída");
ok(obsConcluida({ observacao: "CONCLUÍDO" }) && concluida({ observacao: "Concluído" }), "“Concluído” na observação = concluída");
ok(obsJustificativa({ observacao: "CONCLUÍDO" }) === "", "“Concluído” sozinho não é justificativa");
ok(obsJustificativa({ observacao: "Concluído - CP rompido com defeito, extraído testemunho OK" }) === "CP rompido com defeito, extraído testemunho OK", "texto da observação vale como justificativa");
ok(!justificativaPendente({ fck: 35, r28: 32, observacao: "Rompimento fora da prensa calibrada; refeito" }), "justificativa vinda da planilha libera a cobrança");
ok(!justificativaPendente({ fck: 35, r28: 32, observacao: "CONCLUÍDO" }), "v1.18: “Concluído” na planilha conclui, mesmo abaixo do fck");
ok(anterioresAoSistema([{ _id: "a", dataConcretagem: "2025-10-01" }, { _id: "b", dataConcretagem: "2025-12-01" }, { _id: "c", dataConcretagem: "2025-09-01", anteriorAoSistema: false }], "2025-11-22").join() === "a", "marca só as anteriores ainda não marcadas (respeita quem desmarcou)");

// v1.18: situação de cada nota (regras do dono)
const S = (r) => situacao(r);
ok(S({ fck: 40, dataConcretagem: "2025-01-10" }) === "aguardando", "sem 28 dias: aguardando");
ok(S({ fck: 40, r28: 41 }) === "ok28", "bateu aos 28: concluída, aguardando 63");
ok(concluida({ fck: 40, r28: 41 }) && !emAberto({ fck: 40, r28: 41 }), "ok aos 28 conta como concluída");
ok(S({ fck: 45, r28: 46, r63: 48 }) === "concluida", "bateu aos 28 e 63: concluída");
ok(S({ fck: 45, r28: 46, r63: 44 }) === "abaixo" && emAberto({ fck: 45, r28: 46, r63: 44 }), "bateu aos 28 e não aos 63: pendente");
ok(S({ fck: 45, r28: 40 }) === "abaixo", "não bateu aos 28: pendente");
ok(S({ fck: 45, r28: 40, justificativaFck: J }) === "decidir", "justificada no app: em aberto para o dono decidir");
ok(S({ fck: 45, r28: 46, observacao: "CP quebrado no transporte, aguardando contraprova" }) === "decidir", "justificativa na planilha: em aberto");
ok(S({ fck: 45, r28: 40, observacao: "Concluído" }) === "concluida", "“Concluído” na planilha: concluída");
ok(S({ fck: 45, r28: 40, concluida: true }) === "concluida", "concluída pelo dono: concluída");
ok(S({ fck: 45, r28: 40, dataConcretagem: "2025-01-10" }) === "abaixo" && anterior({ dataConcretagem: "2025-01-10" }, "2025-03-01"), "anterior ao sistema pela data");
ok(!anterior({ dataConcretagem: "2025-01-10", anteriorAoSistema: false }, "2025-03-01"), "desmarcada à mão continua valendo");
ok(observacaoExportada({ concluida: true, observacao: "" }) === "CONCLUÍDO", "concluída no app sai como CONCLUÍDO na planilha");
ok(observacaoExportada({ concluida: true, observacao: "Concluído" }) === "Concluído", "não repete o CONCLUÍDO");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
