// Equipe e perfis no banco: node tests/equipe.test.mjs
import { perfilDe, soVisualiza, recebemTarefas, validarPessoa, cadastroDe, EQUIPE_INICIAL } from "../src/modulos/dados/equipe.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

const vazia = new Map();
ok(perfilDe("Suellen.Alves@sig.eng.br", vazia) === "engenharia" && perfilDe("jessica.araujo@sig.eng.br", vazia) === "qualidade", "sem cadastro no banco: vale a lista de antes");
ok(soVisualiza("jessica.araujo@sig.eng.br", vazia) && !soVisualiza("alice.soares@sig.eng.br", vazia), "Jessica só visualiza; Alice edita");
ok(perfilDe("novo@sig.eng.br", vazia) === "estagiario" && !soVisualiza("novo@sig.eng.br", vazia), "quem não está em lugar nenhum segue como estagiário (edita)");

const eq = new Map(EQUIPE_INICIAL.map((p) => [p.email, Object.assign({ ativo: true }, p)]));
eq.set("jessica.araujo@sig.eng.br", { email: "jessica.araujo@sig.eng.br", nome: "Jessica", perfil: "estagiario", ativo: true });
eq.set("bruno@sig.eng.br", { email: "bruno@sig.eng.br", nome: "Bruno", perfil: "estagiario", ativo: false });
ok(!soVisualiza("jessica.araujo@sig.eng.br", eq) && perfilDe("jessica.araujo@sig.eng.br", eq) === "estagiario", "o cadastro do banco manda (Jessica virou estagiária)");
ok(soVisualiza("bruno@sig.eng.br", eq) && perfilDe("bruno@sig.eng.br", eq) === "estagiario", "desativado: só visualiza");
eq.set("matheus.alves@sig.eng.br", { email: "matheus.alves@sig.eng.br", perfil: "qualidade", ativo: false });
ok(perfilDe("matheus.alves@sig.eng.br", eq) === "admin" && !soVisualiza("matheus.alves@sig.eng.br", eq), "Matheus nunca perde o administrador");
ok(cadastroDe("ALICE.SOARES@sig.eng.br ", eq).nome === "Alice Soares", "e-mail sem diferença de maiúsculas/espaços");

const t = recebemTarefas(eq).map((x) => x.nome);
ok(t.includes("Alice Soares") && t.includes("Jessica") && !t.includes("Bruno") && !t.includes("Suellen Alves"), "tarefas: estagiários e admin ativos");
ok(recebemTarefas(vazia).map((x) => x.nome).join() === "Alice Soares,Matheus Alves", "tarefas sem cadastro: Alice e Matheus (como antes)");

ok(validarPessoa({ nome: "", email: "a@b.com", perfil: "estagiario" }, eq) === "Escreva o nome.", "nome obrigatório");
ok(validarPessoa({ nome: "A", email: "abc", perfil: "estagiario" }, eq) === "E-mail inválido.", "e-mail válido");
ok(validarPessoa({ nome: "A", email: "a@b.com", perfil: "chefe" }, eq) === "Escolha o perfil.", "perfil da lista");
ok(validarPessoa({ nome: "A", email: "Alice.Soares@sig.eng.br", perfil: "estagiario" }, eq) === "Essa pessoa já está na equipe.", "não duplica");
ok(validarPessoa({ nome: "Ana", email: "ana@sig.eng.br", perfil: "engenharia" }, eq) === "", "pessoa nova ok");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
