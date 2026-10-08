// Peças concretadas sem repetição NA MESMA BETONADA: node tests/pecas.test.mjs
import { separarPecas, semRepetidas, pecasRepetidas, repetidasNoTexto } from "../src/modulos/rastreabilidade/pecas.js";
let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
ok(separarPecas("V1c, V2a; P5 / P6\nLaje L11 e V3").join("|") === "V1c|V2a|P5|P6|Laje L11|V3", "separa por , ; / quebra e ' e '");
ok(repetidasNoTexto("V5b, L5, v5B").join() === "V5b", "V5b, L5, V5b → V5b repetido na mesma linha");
ok(repetidasNoTexto("V5b, L5").length === 0, "sem repetição");
const L = [{ seq: "1", pecas: "V1c, P5" }, { seq: "2", pecas: "V2a, v1C, V2a, Laje  L11" }, { seq: "3", pecas: "laje l11" }];
const r = semRepetidas(L, 1);
ok(r.texto === "V2a, v1C, Laje  L11", "BT 2: só tira o 2º V2a; V1c e Laje L11 em outras BTs podem → " + r.texto);
ok(r.repetidas.map((x) => x.peca + "@" + x.seq).join() === "V2a@2", "aponta a repetição na própria BT");
ok(pecasRepetidas(L).map((x) => x.peca + "@" + x.seq).join() === "V2a@2", "ficha: só a repetição dentro da BT 2");
ok(pecasRepetidas([{ seq: "1", pecas: "V5b, L5" }, { seq: "2", pecas: "V5b" }]).length === 0, "mesma peça em NFs diferentes: liberado");
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
