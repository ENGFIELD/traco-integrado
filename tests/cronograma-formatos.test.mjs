// Cronograma em vários formatos: node tests/cronograma-formatos.test.mjs
import { normalizarTabela, separadorCsv, lerProjectXml, tabelaDeItensPdf, dataStatusDoTexto } from "../src/modulos/cronograma/formatos.js";
import { lerCronograma } from "../src/modulos/cronograma/cpm.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
const resumo = (t) => { const cr = lerCronograma(t); return cr.tarefas.map((x) => x.nivel + ":" + x.nome + "@" + x.ini + "/" + x.pct + (x.pred.length ? "<" + x.pred.map((p) => p.id + p.tipo).join(",") : "")).join(" | "); };

// 1) planilha com título antes do cabeçalho, colunas em outra ordem e "Nível"
const t1 = normalizarTabela([["Cronograma Belavista"], [], ["Id", "Nível da estrutura", "Nome da tarefa", "Início", "Término", "Duração", "% concluída", "Predecessoras"],
  ["1", "0", "Obra", "01/06/26", "30/07/27", "300 d", "20%", ""], ["2", "1", "ESTRUTURA", "01/06/26", "30/11/26", "100 d", "0,5", ""],
  ["3", "2", "Teto do 1º Pavimento", "01/06/26", "10/06/26", "8 d", "100", ""]]);
ok(t1 && resumo(t1) === "0:Obra@2026-06-01/20 | 1:ESTRUTURA@2026-06-01/50 | 2:Teto do 1º Pavimento@2026-06-01/100", "planilha com título, colunas trocadas e nível → " + (t1 && resumo(t1)));
ok(separadorCsv("Nome;Início;Término\nA;1;2") === ";" && separadorCsv("a,b,c") === ",", "CSV: detecta ; ou ,");
ok(normalizarTabela([["Task Name", "Start", "Finish", "Duration"], ["Project", "06/01/26", "07/30/27", "300 d"]]) != null, "cabeçalho em inglês");
ok(normalizarTabela([["a", "b"], ["c", "d"]]) === null, "planilha sem cronograma → null");

// 2) XML do MS Project
const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Belavista</Name><Tasks>
<Task><UID>0</UID><ID>0</ID><Name>Belavista</Name><OutlineLevel>0</OutlineLevel><Start>2026-06-01T08:00:00</Start><Finish>2027-07-30T17:00:00</Finish><Duration>PT2400H0M0S</Duration><PercentComplete>20</PercentComplete></Task>
<Task><UID>5</UID><ID>1</ID><Name>ESTRUTURA</Name><OutlineLevel>1</OutlineLevel><Start>2026-06-01T08:00:00</Start><Finish>2026-11-30T17:00:00</Finish><Duration>PT800H0M0S</Duration><PercentComplete>30</PercentComplete></Task>
<Task><UID>7</UID><ID>2</ID><Name>Teto do 1º Pavimento &amp; vigas</Name><OutlineLevel>2</OutlineLevel><Start>2026-06-01T08:00:00</Start><Finish>2026-06-10T17:00:00</Finish><Duration>PT64H0M0S</Duration><PercentComplete>100</PercentComplete></Task>
<Task><UID>9</UID><ID>3</ID><Name>Teto do 2º Pavimento</Name><OutlineLevel>2</OutlineLevel><Start>2026-06-11T08:00:00</Start><Finish>2026-06-20T17:00:00</Finish><Duration>PT64H0M0S</Duration><PercentComplete>0</PercentComplete>
  <PredecessorLink><PredecessorUID>7</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink><PredecessorLink><PredecessorUID>5</PredecessorUID><Type>3</Type><LinkLag>9600</LinkLag></PredecessorLink></Task>
</Tasks></Project>`;
const tx = lerProjectXml(xml);
ok(tx && resumo(tx) === "0:Belavista@2026-06-01/20 | 1:ESTRUTURA@2026-06-01/30 | 2:Teto do 1º Pavimento & vigas@2026-06-01/100 | 2:Teto do 2º Pavimento@2026-06-11/0<3TI,2II", "XML do MS Project → " + (tx && resumo(tx)));
ok(tx && tx[4][2] === "3;2II+2 d", "predecessoras com tipo e folga: " + (tx && tx[4][2]));
ok(lerProjectXml("<html></html>") === null, "XML que não é do MS Project → null");

// 3) PDF: itens de texto posicionados (y para cima), com recuo e Gantt à direita
const it = (str, x, y, pagina = 1) => ({ str, x, y, w: str.length * 4.5, pagina });
const pdf = [
  it("Cronograma Belavista", 30, 800),
  it("Id", 30, 760), it("Nome da tarefa", 50, 760), it("Duração", 260, 760), it("Início", 310, 760), it("Término", 370, 760), it("% concluída", 430, 760), it("jun 2026", 600, 760),
  it("1", 30, 740), it("Obra", 50, 740), it("300 dias", 260, 740), it("Seg 01/06/26", 310, 740), it("Sex 30/07/27", 370, 740), it("20%", 430, 740), it("Equipe A", 650, 740),
  it("2", 30, 728), it("ESTRUTURA", 60, 728), it("100 dias", 260, 728), it("Seg 01/06/26", 310, 728), it("Seg 30/11/26", 370, 728), it("30%", 430, 728),
  it("3", 30, 716), it("Teto do 1º Pavimento com", 70, 716), it("8 dias", 260, 716), it("Seg 01/06/26", 310, 716), it("Qua 10/06/26", 370, 716), it("100%", 430, 716),
  it("vigas de transição", 70, 706),
  it("Id", 30, 760, 2), it("Nome da tarefa", 50, 760, 2), it("Duração", 260, 760, 2), it("Início", 310, 760, 2), it("Término", 370, 760, 2), it("% concluída", 430, 760, 2),
  it("4", 30, 740, 2), it("ALVENARIA", 60, 740, 2), it("50 dias", 260, 740, 2), it("Seg 07/09/26", 310, 740, 2), it("Sex 13/11/26", 370, 740, 2), it("0%", 430, 740, 2),
];
const tp = tabelaDeItensPdf(pdf);
ok(tp && resumo(tp) === "0:Obra@2026-06-01/20 | 1:ESTRUTURA@2026-06-01/30 | 2:Teto do 1º Pavimento com vigas de transição@2026-06-01/100 | 1:ALVENARIA@2026-09-07/0", "PDF: linhas, recuo, nome em 2 linhas, 2 páginas, Gantt ignorado → " + (tp && resumo(tp)));
ok(tabelaDeItensPdf([it("Relatório", 30, 700)]) === null, "PDF sem tabela de cronograma → null");

// IDs das predecessoras: linhas vazias e coluna Id preservam a numeração do MS Project
const t4 = normalizarTabela([["Id", "Nome", "Início", "Término", "Predecessoras"], ["1", "A", "01/06/26", "05/06/26", ""], ["", "", "", "", ""], ["3", "C", "08/06/26", "12/06/26", "1"], ["7", "G", "15/06/26", "19/06/26", "3"]]);
const cr4 = lerCronograma(t4);
ok(cr4.porId.get(3).nome === "C" && cr4.porId.get(7).nome === "G" && cr4.porId.get(7).pred[0].id === 3, "IDs preservados (linha vazia e salto 3 → 7)");
const t5 = normalizarTabela([["Nome", "Início", "Término"], ["A", "01/06/26", "05/06/26"], ["", "", ""], ["C", "08/06/26", "12/06/26"]]);
ok(lerCronograma(t5).porId.get(3).nome === "C", "sem coluna Id: linha vazia mantém a posição");

// v1.35: PDF impresso com linhas recolhidas — a coluna "Nº" do MS Project manda (as predecessoras usam esse número)
const pdfN = [
  it("Nº", 30, 760), it("Atividade", 50, 760), it("% concluída", 260, 760), it("Predecessoras", 310, 760), it("Início", 380, 760), it("Duração", 440, 760), it("Término", 490, 760),
  it("1", 30, 740), it("OBRA", 50, 740), it("6%", 260, 740), it("Seg 01/06/26", 380, 740), it("300 d", 440, 740), it("Sex 30/07/27", 490, 740),
  it("20", 30, 728), it("Escavação", 60, 728), it("100%", 260, 728), it("Seg 01/06/26", 380, 728), it("5 d", 440, 728), it("Sex 05/06/26", 490, 728),
  it("31", 30, 716), it("Contenção", 60, 716), it("0%", 260, 716), it("20", 310, 716), it("Seg 08/06/26", 380, 716), it("5 d", 440, 716), it("Sex 12/06/26", 490, 716),
];
const crN = lerCronograma(tabelaDeItensPdf(pdfN));
ok(crN.porId.get(20) && crN.porId.get(20).nome === "Escavação" && crN.porId.get(31).pred[0].id === 20 && crN.porId.get(crN.porId.get(31).pred[0].id).nome === "Escavação",
  "PDF com Nº saltado (1, 20, 31): predecessora “20” liga na atividade certa");
ok(dataStatusDoTexto("CRONOGRAMA REPLANEJADO DATA: 31/08/2026") === "2026-08-31" && dataStatusDoTexto("<StatusDate>2026-09-30T08:00:00</StatusDate>") === "2026-09-30" && dataStatusDoTexto("sem data") === "", "data de referência do cronograma (PDF e XML)");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
