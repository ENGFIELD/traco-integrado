/* Exportação do Controle Tecnológico NA PLANILHA ORIGINAL (v1.8).
 *
 * Em vez de gerar uma planilha nova, abrimos a própria planilha que foi
 * importada (guardada como modelo) e escrevemos os dados do app direto no XML
 * da aba "CONT. TECNOLÓGICO" — o resto do arquivo (outras abas, cabeçalho,
 * logos, larguras, bordas, cores, fórmulas, impressão) não é tocado.
 *
 * Regras de escrita:
 *  - A linha de cada nota é achada pela Nota de Remessa (coluna G).
 *  - Só escreve onde o valor do app é diferente do que está na célula; célula
 *    com fórmula nunca é sobrescrita; valor vazio no app nunca apaga a planilha.
 *  - Notas lançadas só no app entram nas linhas vazias já formatadas logo
 *    abaixo da última nota; se acabarem, a última linha de dados é copiada
 *    (mesma formatação, fórmulas ajustadas para a nova linha).
 *
 * Funciona no navegador e no Node (testes): recebe o JSZip já aberto.
 */

const LINHA_INICIAL = 7; // 1ª linha de dados (1–6 são título e cabeçalhos)

const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
const normNota = (v) => String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+(?=\d)/, "");

export function letraColuna(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
export function indiceColuna(l) { let n = 0; for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
const serialData = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null; };

// ---------- caminhos dentro do .xlsx ----------
async function acharAba(zip, padraoNome) {
  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const abas = [...wb.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"[^>]*\/>/g)].map((m) => ({ nome: unesc(m[1]), rid: m[2] }));
  const aba = abas.find((a) => padraoNome.test(a.nome)) || abas[0];
  const rel = new RegExp('<Relationship\\b[^>]*Id="' + aba.rid + '"[^>]*/>').exec(rels) || [""];
  const alvo = (/Target="([^"]*)"/.exec(rel[0]) || [])[1] || "worksheets/sheet1.xml";
  const caminho = alvo.startsWith("/") ? alvo.slice(1) : "xl/" + alvo.replace(/^\.\//, "");
  return { nome: aba.nome, caminho, wb };
}
async function lerSharedStrings(zip) {
  const f = zip.file("xl/sharedStrings.xml");
  if (!f) return [];
  const x = await f.async("string");
  return [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(""));
}

// ---------- células ----------
function celulasDaLinha(rowXml) {
  return [...rowXml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((m) => ({
    xml: m[0], col: indiceColuna(m[1]), attrs: m[3], corpo: m[4] || "",
  }));
}
function valorCelula(c, ss) {
  const t = (/\st="([^"]*)"/.exec(c.attrs) || [])[1];
  if (t === "inlineStr") return [...c.corpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join("");
  const v = (/<v>([\s\S]*?)<\/v>/.exec(c.corpo) || [])[1];
  if (v == null) return null;
  if (t === "s") return ss[+v] != null ? ss[+v] : "";
  if (t === "str" || t === "e") return unesc(v);
  if (t === "b") return v === "1";
  return Number(v);
}
const estilo = (attrs) => (/\ss="(\d+)"/.exec(attrs) || [])[1];
function montarCelula(ref, s, valor) {
  const sa = s != null ? ` s="${s}"` : "";
  if (valor == null || valor === "") return `<c r="${ref}"${sa}/>`;
  if (typeof valor === "number") return `<c r="${ref}"${sa}><v>${valor}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
}

// desloca as referências relativas de uma fórmula (A1, $A1, A$1 …)
function deslocarFormula(f, dLin, dCol) {
  return f.replace(/(^|[^A-Za-z0-9_$."'])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g, (m, pre, dc, col, dl, lin) => {
    const c = dc ? col : letraColuna(indiceColuna(col) + dCol);
    const l = dl ? lin : String(Number(lin) + dLin);
    return pre + dc + c + dl + l;
  });
}

/** Converte o valor do app para o tipo gravado na planilha */
function valorParaPlanilha(campo, v, tipos) {
  if (v == null || v === "") return null;
  if (tipos.datas.includes(campo)) return serialData(v);
  if (tipos.numeros.includes(campo)) { const n = Number(String(v).replace(",", ".")); return isNaN(n) ? String(v) : n; }
  if (campo === "notaRemessa") return /^\d{1,15}$/.test(String(v)) && tipos.notaNumerica ? Number(v) : String(v);
  if (tipos.resultados.includes(campo)) { const n = Number(String(v).replace(",", ".")); return typeof v === "number" ? v : (String(v).trim() !== "" && !isNaN(n) ? n : String(v)); }
  return String(v);
}
function iguais(a, b) {
  if (a == null || a === "") return b == null || b === "";
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return String(a).trim() === String(b == null ? "" : b).trim();
}

/**
 * zip: JSZip da planilha-modelo · registros: linhas do CT no app ·
 * COLS: { campo: índice da coluna } (mesmo mapa da importação)
 * Retorna { atualizadas, novas, celulas, avisos }
 */
export async function preencherPlanilhaCt(zip, registros, COLS) {
  const tipos = {
    datas: ["dataConcretagem", "data7", "data14", "data28", "data63"],
    numeros: ["volume", "fck", "numCps", "slump", "cpsConforme"],
    resultados: ["r3", "r7", "r7b", "r14", "r14b", "r28", "r28b", "r63", "r63b"],
    notaNumerica: false,
  };
  const avisos = [];
  const aba = await acharAba(zip, /CONT\.?\s*TECNOL/i);
  const ss = await lerSharedStrings(zip);
  let xml = await zip.file(aba.caminho).async("string");
  const ini = xml.indexOf("<sheetData"), fimSD = xml.indexOf("</sheetData>");
  if (ini < 0) throw new Error("aba sem dados");
  const abertura = xml.slice(ini, xml.indexOf(">", ini) + 1);
  if (abertura.endsWith("/>")) throw new Error("aba de Controle Tecnológico vazia");
  const corpoSD = xml.slice(ini + abertura.length, fimSD);

  // linhas existentes
  const linhas = [...corpoSD.matchAll(/<row\b[^>]*?r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({ r: +m[1], xml: m[0] }));
  const porNumero = new Map(linhas.map((l) => [l.r, l]));
  // fórmulas compartilhadas (mestre) — para copiar linhas com fórmula
  const mestres = {};
  linhas.forEach((l) => celulasDaLinha(l.xml).forEach((c) => {
    const f = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(c.corpo);
    if (f && /t="shared"/.test(f[1])) { const si = (/si="(\d+)"/.exec(f[1]) || [])[1]; if (si != null) mestres[si] = { f: unesc(f[2]), lin: l.r, col: c.col }; }
  }));

  const notaDaLinha = (l) => { const c = celulasDaLinha(l.xml).find((x) => x.col === COLS.notaRemessa); return c ? valorCelula(c, ss) : null; };
  const linhaVazia = (l) => celulasDaLinha(l.xml).every((c) => /<f\b/.test(c.corpo) || valorCelula(c, ss) == null || valorCelula(c, ss) === "");
  const porNota = new Map();
  let ultimaDados = LINHA_INICIAL - 1;
  linhas.forEach((l) => {
    if (l.r < LINHA_INICIAL) return;
    const n = notaDaLinha(l);
    if (n != null && String(n).trim() !== "") {
      if (typeof n === "number") tipos.notaNumerica = true;
      const k = normNota(n); if (k && !porNota.has(k)) porNota.set(k, l.r);
      ultimaDados = Math.max(ultimaDados, l.r);
    }
  });
  if (ultimaDados < LINHA_INICIAL) throw new Error("não encontrei nenhuma nota na planilha-modelo (coluna G a partir da linha 7)");
  const modelo = porNumero.get(ultimaDados);
  const maxLinha = linhas.reduce((m, l) => Math.max(m, l.r), 0);

  const campos = Object.keys(COLS);
  const novasLinhas = new Map(); // r → xml (substituições e inclusões)
  let celulas = 0, atualizadas = 0;
  const alteradas = []; // v1.32: endereço de cada célula escrita (ex.: "W435")

  // escreve os campos de um registro numa linha (xml) — devolve o xml novo
  const escrever = (rowXml, r, reg, modeloCelulas) => {
    let alterou = false;
    const cels = celulasDaLinha(rowXml);
    const porCol = new Map(cels.map((c) => [c.col, c]));
    campos.forEach((campo) => {
      const col = COLS[campo];
      const novo = valorParaPlanilha(campo, reg[campo], tipos);
      if (novo == null) return; // vazio no app nunca apaga a planilha
      const atual = porCol.get(col);
      if (atual && /<f\b/.test(atual.corpo)) return; // fórmula: a planilha calcula
      if (atual && iguais(valorCelula(atual, ss), novo)) return;
      if (atual && campo === "notaRemessa" && normNota(valorCelula(atual, ss)) === normNota(novo)) return; // 001003 = 1003
      const s = atual ? estilo(atual.attrs) : (modeloCelulas.get(col) || {}).s;
      porCol.set(col, { col, xml: montarCelula(letraColuna(col) + r, s, novo), novo: true });
      alterou = true; celulas++; alteradas.push(letraColuna(col) + r);
    });
    if (!alterou) return null;
    const abre = /^<row\b[^>]*?(\/?)>/.exec(rowXml);
    const tagAbre = abre[1] ? abre[0].replace(/\s*\/>$/, ">") : abre[0];
    const corpo = [...porCol.values()].sort((a, b) => a.col - b.col).map((c) => c.xml).join("");
    return tagAbre.replace(/\sspans="[^"]*"/, "") + corpo + "</row>";
  };
  const celsModelo = new Map(celulasDaLinha(modelo.xml).map((c) => [c.col, { s: estilo(c.attrs) }]));

  // 1) notas que já estão na planilha
  const faltando = [];
  registros.forEach((reg) => {
    const r = porNota.get(normNota(reg.notaRemessa));
    if (r == null) { faltando.push(reg); return; }
    const l = porNumero.get(r);
    const novo = escrever(novasLinhas.get(r) || l.xml, r, reg, celsModelo);
    if (novo) { novasLinhas.set(r, novo); atualizadas++; }
  });

  // 2) notas só do app: linhas vazias já formatadas abaixo da última nota, depois cópias da última linha
  faltando.sort((a, b) => String(a.dataConcretagem || "").localeCompare(String(b.dataConcretagem || "")) || String(a.notaRemessa).localeCompare(String(b.notaRemessa)));
  let proxima = ultimaDados + 1, acrescidas = [];
  const mergesModelo = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)].filter((m) => +m[2] === ultimaDados && +m[4] === ultimaDados);
  let novasMerges = "";
  faltando.forEach((reg) => {
    const existente = porNumero.get(proxima);
    if (existente && !linhaVazia(existente)) { // algo escrito abaixo (rodapé?) — não mexe: vai para depois do fim
      avisos.push(`A linha ${proxima} abaixo das notas não está vazia; as notas novas foram colocadas no fim da aba.`);
      proxima = Math.max(proxima, maxLinha + 1);
      while (porNumero.get(proxima) && !linhaVazia(porNumero.get(proxima))) proxima++;
    }
    const r = proxima++;
    let base;
    if (porNumero.get(r)) base = porNumero.get(r).xml;
    else { base = copiarLinha(modelo.xml, ultimaDados, r, mestres); acrescidas.push(r); mergesModelo.forEach((m) => { novasMerges += `<mergeCell ref="${m[1]}${r}:${m[3]}${r}"/>`; }); }
    novasLinhas.set(r, escrever(base, r, reg, celsModelo) || base);
  });

  // remonta o sheetData mantendo a ordem das linhas
  const todas = new Map(linhas.map((l) => [l.r, l.xml]));
  novasLinhas.forEach((x, r) => todas.set(r, x));
  const corpoNovo = [...todas.keys()].sort((a, b) => a - b).map((r) => todas.get(r)).join("");
  xml = xml.slice(0, ini) + abertura + corpoNovo + xml.slice(fimSD);

  const ultima = Math.max(maxLinha, ...acrescidas, 0);
  if (acrescidas.length) {
    xml = xml.replace(/<dimension ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"\/>/, (m, c1, l1, c2, l2) => `<dimension ref="${c1}${l1}:${c2 || c1}${Math.max(Number(l2 || l1), ultima)}"/>`);
    if (novasMerges) xml = xml.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, (m, n, corpo) => {
      const total = Number(n) + (novasMerges.match(/<mergeCell /g) || []).length;
      return `<mergeCells count="${total}">${corpo}${novasMerges}</mergeCells>`;
    });
    // formatação condicional / validações que iam até a última nota passam a cobrir as novas
    xml = xml.replace(/sqref="([^"]*)"/g, (m, refs) => 'sqref="' + refs.split(" ").map((rg) => {
      const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rg);
      return mm && +mm[4] >= ultimaDados && +mm[4] < ultima ? `${mm[1]}${mm[2]}:${mm[3]}${ultima}` : rg;
    }).join(" ") + '"');
  }
  zip.file(aba.caminho, xml);
  // pede ao Excel para recalcular as fórmulas ao abrir (datas de ruptura etc.)
  let wb = aba.wb;
  if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b([^>]*?)\/?>/, (m, a) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`);
  else wb = wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file("xl/workbook.xml", wb);
  // o cálculo em cache do arquivo original ficaria desatualizado
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = await zip.file("[Content_Types].xml").async("string");
    zip.file("[Content_Types].xml", ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ""));
    const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ""));
  }
  return { aba: aba.nome, atualizadas, novas: faltando.length, celulas, alteradas, avisos: [...new Set(avisos)] };
}

/**
 * v1.32 — conferência de ida e volta, feita a cada importação.
 * Exporta (em memória) os registros do app na própria planilha recém-importada
 * e compara com o original, célula por célula:
 *   - alteradas: células que a exportação muda (valores lançados no app);
 *   - inesperadas: qualquer outra diferença (não deveria haver nenhuma);
 *   - restoIgual: cabeçalho, larguras, mesclagens, impressão etc. iguais.
 * JSZip vem de fora (no navegador é carregado sob demanda).
 */
export async function conferirExportacao(JSZip, dadosPlanilha, registros, COLS) {
  const original = await JSZip.loadAsync(dadosPlanilha);
  const zip = await JSZip.loadAsync(dadosPlanilha);
  const aba = await acharAba(original, /CONT\.?\s*TECNOL/i);
  const antes = await original.file(aba.caminho).async("string");
  const res = await preencherPlanilhaCt(zip, registros, COLS);
  const depois = await zip.file(aba.caminho).async("string");
  const celulas = (x) => { const m = new Map(); for (const c of x.matchAll(/<c r="([A-Z]+\d+)"[\s\S]*?(?:\/>|<\/c>)/g)) m.set(c[1], c[0]); return m; };
  const a = celulas(antes), d = celulas(depois), esperadas = new Set(res.alteradas);
  const inesperadas = [];
  d.forEach((x, ref) => { if (a.get(ref) !== x && !esperadas.has(ref)) inesperadas.push(ref); });
  a.forEach((x, ref) => { if (!d.has(ref)) inesperadas.push(ref); });
  const semDados = (x) => x.replace(/<sheetData[\s\S]*<\/sheetData>/, "").replace(/<dimension [^>]*\/>/, "").replace(/<mergeCells[\s\S]*?<\/mergeCells>/, "").replace(/sqref="[^"]*"/g, "");
  // linhas novas (notas só do app) podem estender dimensão/mesclagens/formatação; o resto tem que ser igual
  const restoIgual = semDados(antes) === semDados(depois);
  return { alteradas: res.alteradas, novas: res.novas, inesperadas, restoIgual };
}

// copia a linha-modelo para a linha r: mesmo estilo, valores limpos, fórmulas ajustadas
function copiarLinha(rowXml, rOrig, r, mestres) {
  const d = r - rOrig;
  const abre = /^<row\b[^>]*?>/.exec(rowXml)[0].replace(/\sr="\d+"/, ` r="${r}"`).replace(/\sspans="[^"]*"/, "");
  const cels = celulasDaLinha(rowXml).map((c) => {
    const ref = letraColuna(c.col) + r;
    const s = estilo(c.attrs);
    const f = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.corpo);
    if (!f) return `<c r="${ref}"${s != null ? ` s="${s}"` : ""}/>`;
    let formula = f[2] != null ? unesc(f[2]) : null;
    if (/t="shared"/.test(f[1])) {
      const m = mestres[(/si="(\d+)"/.exec(f[1]) || [])[1]];
      formula = m ? deslocarFormula(m.f, r - m.lin, c.col - m.col) : null;
    } else if (formula != null) formula = deslocarFormula(formula, d, 0);
    if (formula == null) return `<c r="${ref}"${s != null ? ` s="${s}"` : ""}/>`;
    return `<c r="${ref}"${s != null ? ` s="${s}"` : ""}><f>${esc(formula)}</f></c>`;
  });
  return abre + cels.join("") + "</row>";
}
