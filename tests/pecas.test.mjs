// Peças concretadas sem repetição: node tests/pecas.test.mjs
import { separarPecas, semRepetidas, pecasRepetidas } from "../src/modulos/rastreabilidade/pecas.js";
let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
ok(separarPecas("V1c, V2a; P5 / P6\nLaje L11 e V3").join("|") === "V1c|V2a|P5|P6|Laje L11|V3", "separa por , ; / quebra e ' e '");
const L = [{ seq: "1", pecas: "V1c, P5" }, { seq: "2", pecas: "V2a, v1C, V2a, Laje  L11" }, { seq: "3", pecas: "laje l11" }];
const r = semRepetidas(L, 1);
ok(r.texto === "V2a", "BT 2: tira V1c (BT 1), o 2º V2a e a Laje L11 (BT 3) → " + r.texto);
ok(r.repetidas.map((x) => x.peca + "@" + x.seq).join() === "v1C@1,V2a@2,Laje  L11@3", "aponta onde já estava");
ok(semRepetidas([{ seq: "1", pecas: "V1, V2" }, { seq: "2", pecas: "V3" }], 0).repetidas.length === 0, "sem repetição: nada removido");
ok(pecasRepetidas(L).map((x) => x.peca + ":" + x.seqs.join("/")).join() === "V1c:1/2,V2a:2/2,Laje  L11:2/3", "lista todas as repetições da ficha");
ok(pecasRepetidas([{ seq: "1", pecas: "V1, V2" }, { seq: "2", pecas: "V3" }]).length === 0, "sem repetição → vazio");
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
