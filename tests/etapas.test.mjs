// Teste das etapas da obra (Fase 1): node tests/etapas.test.mjs
import { lerCronograma } from "../src/modulos/cronograma/cpm.js";
import { etapaDoTexto, nivelDoTexto, classificar, chaveAtividade, resumoEtapas, situacaoNivel, topoEtapa, fvsPedidas } from "../src/modulos/cronograma/etapas.js";
import { nivelDoTeto } from "../src/modulos/cronograma/cronograma.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

// --- etapa pelo nome ---
ok(etapaDoTexto("ESTRUTURA") === "estrutura", "grupo ESTRUTURA");
ok(etapaDoTexto("Teto do 4º Pavimento") === "estrutura", "teto = estrutura");
ok(etapaDoTexto("Elevação de alvenaria") === "alvenaria", "alvenaria");
ok(etapaDoTexto("Blocos de alvenaria") === "alvenaria", "bloco de alvenaria não é fundação");
ok(etapaDoTexto("Impermeabilização da laje") === "impermeabilizacao", "impermeabilização antes de laje");
ok(etapaDoTexto("Contrapiso") === "contrapiso", "contrapiso");
ok(etapaDoTexto("Instalações Elétricas") === "eletrica", "elétricas");
ok(etapaDoTexto("INSTALAÇÕES HIDROSSANITÁRIAS") === "hidraulica", "hidrossanitárias");
ok(etapaDoTexto("Instalações") === "instalacoes", "instalações genérico");
ok(etapaDoTexto("Reboco interno") === "revestimento", "reboco");
ok(etapaDoTexto("Estacas hélice contínua") === "fundacao", "estacas");
ok(etapaDoTexto("Guarda-corpo") === "esquadrias", "guarda-corpo");
ok(etapaDoTexto("Pintura do teto") === "pintura", "pintura do teto não é estrutura");
ok(etapaDoTexto("Mobilização do canteiro") === null, "sem etapa");

// --- nível: mesma convenção do corte ("Teto do X" = piso do nível de cima) ---
["Teto do Subsolo", "Teto do 3º Embasamento", "Teto do 4º Pavimento", "Teto da Cobertura", "Teto da Dependência", "Teto Casa de Máquinas / Reservatório Superior"]
  .forEach((n) => ok(nivelDoTexto(n) === nivelDoTeto(n), "teto igual ao corte: " + n + " → " + nivelDoTexto(n)));
ok(nivelDoTexto("Alvenaria do 3º Pavimento") === 9, "3º pavimento = 09");
ok(nivelDoTexto("2º Embasamento") === 3, "2º embasamento = 03");
ok(nivelDoTexto("Complemento Piso do 5º Embasamento (Maria Quitéria)") === 6, "complemento de piso");
ok(nivelDoTexto("E5") === 6 && nivelDoTexto("3º") === 9 && nivelDoTexto("COB") === 24, "nomes curtos E5, 3º, COB");
ok(nivelDoTexto("Subsolo") === 1 && nivelDoTexto("Fundação") === 0, "subsolo e fundação");
ok(nivelDoTexto("Marcação") === null, "sem pavimento");

// --- cronograma sintético ---
const L = [["Atividade", "% concluída", "Predecessoras", "Início", "Duração", "Término"],
  ["Obra", "20%", "", "Seg 01/06/26", "300 d", "Sex 30/07/27"],
  ["   FUNDAÇÃO", "100%", "", "", "", ""],
  ["      Estacas", "100%", "", "Seg 01/06/26", "20 d", "Sex 26/06/26"],
  ["   ESTRUTURA", "50%", "", "", "", ""],
  ["      Teto do Subsolo", "100%", "", "Seg 06/07/26", "10 d", "Sex 17/07/26"],
  ["      Teto do 1º Embasamento", "100%", "", "Seg 20/07/26", "10 d", "Sex 31/07/26"],
  ["      Teto do 2º Embasamento", "100%", "", "Seg 03/08/26", "10 d", "Sex 14/08/26"],
  ["      Teto do 3º Embasamento", "40%", "", "Seg 28/09/26", "10 d", "Sex 09/10/26"],
  ["   ALVENARIA", "10%", "", "", "", ""],
  ["      1º Embasamento", "50%", "", "", "", ""],
  ["         Marcação", "100%", "", "Seg 07/09/26", "5 d", "Sex 11/09/26"],
  ["         Elevação", "0%", "", "Seg 14/09/26", "15 d", "Sex 02/10/26"],
  ["      2º Embasamento", "0%", "", "", "", ""],
  ["         Elevação", "0%", "", "Seg 05/10/26", "15 d", "Sex 23/10/26"],
  ["   SERVIÇOS GERAIS", "0%", "", "", "", ""],
  ["      Mobilização", "100%", "", "Seg 01/06/26", "5 d", "Sex 05/06/26"]];
const cr = lerCronograma(L);
const porNome = (n, i) => cr.tarefas.filter((t) => t.nome === n)[i || 0];
let cl = classificar(cr, {});
ok(cl.get(porNome("Estacas").id).etapa === "fundacao" && cl.get(porNome("Estacas").id).nivel === 0, "estacas → fundação, nível 00");
ok(cl.get(porNome("Teto do 2º Embasamento").id).nivel === 4, "teto do 2º emb → nível 04 (piso do 3º)");
ok(cl.get(porNome("Marcação").id).etapa === "alvenaria" && cl.get(porNome("Marcação").id).nivel === 2, "marcação herda ALVENARIA › 1º Embasamento");
ok(cl.get(porNome("Elevação", 1).id).nivel === 3, "2ª elevação → 2º embasamento");
ok(cl.get(porNome("Mobilização").id).etapa === null, "mobilização sem etapa");
ok(!cl.has(porNome("ESTRUTURA").id), "resumos ficam de fora");

// escolha manual
const mob = porNome("Mobilização");
cl = classificar(cr, { [chaveAtividade(mob)]: { etapa: "fundacao", nivel: -1 } });
ok(cl.get(mob.id).etapa === "fundacao" && cl.get(mob.id).nivel === null && cl.get(mob.id).origem === "manual", "escolha manual vale");
cl = classificar(cr, { [chaveAtividade(porNome("Estacas"))]: { etapa: "" } });
ok(cl.get(porNome("Estacas").id).etapa === null, "manual: não é etapa de obra");
ok(chaveAtividade(porNome("Elevação", 0)) !== chaveAtividade(porNome("Elevação", 1)), "chave diferencia o grupo");

cl = classificar(cr, {});
const hoje = "2026-10-08";
const res = resumoEtapas(cr, cl, hoje);
ok(res.map((e) => e.key).join() === "fundacao,estrutura,alvenaria", "etapas na ordem da obra: " + res.map((e) => e.key).join());
const alv = res.find((e) => e.key === "alvenaria"), est = res.find((e) => e.key === "estrutura");
ok(alv.niveis.get(2).pct === 25, "alvenaria 1º emb = 25% (5 d × 100 + 15 d × 0) → " + alv.niveis.get(2).pct);
ok(alv.pct === 14, "alvenaria total ponderado → " + alv.pct);
ok(alv.niveis.get(2).previsto === 100, "alvenaria 1º emb previsto 100% hoje");

// FVS: só a do nível 02 (piso do 1º emb) existe e está fechada; nível 03 tem uma aberta
const fvs = { "fvs04|2": { total: 1, fechadas: 1 }, "fvs04|3": { total: 1, fechadas: 0 } };
const fvsDoNivel = (tipos, n) => tipos.reduce((a, t) => { const x = fvs[t + "|" + n]; if (x) { a.total += x.total; a.fechadas += x.fechadas; } return a; }, { total: 0, fechadas: 0 });
ok(situacaoNivel(est, 2, fvsDoNivel, "2026-01-01").st === "liberado", "estrutura 02: liberado");
ok(situacaoNivel(est, 3, fvsDoNivel, "2026-01-01").st === "fvsaberta", "estrutura 03: FVS aberta");
ok(situacaoNivel(est, 4, fvsDoNivel, "2026-01-01").st === "semfvs", "estrutura 04: 100% sem FVS");
ok(situacaoNivel(est, 4, fvsDoNivel, "2026-09-01").st === "concluido", "estrutura 04: terminou antes do app → não cobra");
ok(situacaoNivel(est, 5, fvsDoNivel, "2026-01-01").st === "execucao", "estrutura 05: em andamento");
ok(situacaoNivel(est, 9, fvsDoNivel, "2026-01-01").st === "na", "estrutura 09: fora do cronograma");
ok(situacaoNivel(alv, 3, fvsDoNivel, "").st === "nada", "alvenaria 2º emb: a executar");
const fund = res.find((e) => e.key === "fundacao");
ok(situacaoNivel(fund, 0, fvsDoNivel, "2026-01-01").st === "semfvs", "fundação 100% sem FVS");
const tp = topoEtapa(est, hoje);
ok(tp.topo === 4 && tp.previsto === 4, "topo da estrutura 04, previsto 04");

const ped = fvsPedidas(cr, cl, res, fvsDoNivel, "2026-01-01", "2026-10-05", "2026-10-11");
ok(ped.faltando.map((x) => x.etapa + x.nivel).join() === "estrutura4,fundacao0", "faltando: " + ped.faltando.map((x) => x.etapa + x.nivel).join());
ok(ped.semana.map((x) => x.etapa + x.nivel).join() === "estrutura5", "FVS da semana: só a laje do 3º emb (alvenaria ainda sem ficha) → " + ped.semana.map((x) => x.etapa + x.nivel).join());

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
