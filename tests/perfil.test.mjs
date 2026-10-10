// Teste da tela Meu perfil (v1.38): node tests/perfil.test.mjs
import { permissoesDaConta, validarSenhaNova, erroSenha } from "../src/modulos/dados/perfil.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
const pode = (lista, trecho) => lista.find((p) => p.texto.includes(trecho)).pode;

const est = permissoesDaConta({ perfil: "estagiario", somenteLeitura: false, papelAssinatura: "estagiario" });
ok(pode(est, "Ver fichas") && pode(est, "Criar e alterar") && pode(est, "inspeção/coleta") && !pode(est, "Painel da engenharia") && !pode(est, "Tela Equipe"), "estagiário: edita, assina como inspeção, sem painel nem equipe");
const eng = permissoesDaConta({ perfil: "engenharia", somenteLeitura: false, papelAssinatura: "engenheiro" });
ok(pode(eng, "Assinar como engenharia") && pode(eng, "Painel da engenharia") && !pode(eng, "Tela Equipe"), "engenharia: assina e trava, painel, sem equipe");
const adm = permissoesDaConta({ perfil: "admin", somenteLeitura: false, papelAssinatura: "" });
ok(pode(adm, "Tela Equipe") && !pode(adm, "falta cadastrar"), "admin: equipe; sem assinatura cadastrada → não assina ainda");
const qual = permissoesDaConta({ perfil: "qualidade", somenteLeitura: true, papelAssinatura: "engenheiro" });
ok(pode(qual, "Ver fichas") && qual.filter((p) => p.pode).length === 1, "qualidade (só visualiza): só ver, mesmo com assinatura de engenheiro");
const desat = permissoesDaConta({ perfil: "admin", somenteLeitura: true, papelAssinatura: "" });
ok(!pode(desat, "Tela Equipe") && !pode(desat, "Criar e alterar"), "admin desativado/só visualiza: não edita nem mexe na equipe");

ok(validarSenhaNova("", "abcd1234", "abcd1234") !== "", "senha: atual obrigatória");
ok(/8 caracteres/.test(validarSenhaNova("x", "ab12", "ab12")), "senha: mínimo 8");
ok(/letras e números/.test(validarSenhaNova("x", "abcdefgh", "abcdefgh")), "senha: letras e números");
ok(/não são iguais/.test(validarSenhaNova("x", "abcd1234", "abcd1235")), "senha: repetição diferente");
ok(/igual à atual/.test(validarSenhaNova("abcd1234", "abcd1234", "abcd1234")), "senha: igual à atual");
ok(validarSenhaNova("velha123", "nova12345", "nova12345") === "", "senha: válida");
ok(erroSenha("auth/wrong-password") === "A senha atual não confere." && /Tente de novo/.test(erroSenha("auth/qualquer")), "erros do Firebase em português, sem detalhe interno");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
