/* Leitura do cronograma em vários formatos (v1.17).
 *
 * Tudo vira a mesma tabela que o cpm.lerCronograma já entende:
 *   [ ["Atividade","% concluída","Predecessoras","Início","Duração","Término"],
 *     ["Obra", "20%", "", "Seg 01/06/26", "300 d", "Sex 30/07/27"],
 *     ["   ESTRUTURA", …]   ← nível pela quantidade de espaços (3 por nível)
 *     … ]
 *
 *  - Excel/ODS/CSV: lidos pelo SheetJS (main/cronograma.js) → normalizarTabela
 *  - XML do MS Project (Arquivo → Salvar como → XML): lerProjectXml
 *  - PDF (impressão do MS Project): o texto da página vira linhas e colunas
 *    pela posição na folha → tabelaDeItensPdf → normalizarTabela
 *  - .mpp: formato fechado da Microsoft — o app pede para salvar em outro formato.
 *
 * Sem dependências: roda no navegador e no Node (tests/cronograma-formatos.test.mjs).
 */

const norm = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const COLUNAS = [
  ["id", /^(id|n[oº°]|#|item)$/],
  ["nome", /^(nome|atividade|tarefa|descricao|task|name)|nome da tarefa|task name/],
  ["pct", /conclu|% ?complete|^%/],
  ["pred", /predecess/],
  ["ini", /^(inicio|start|data de inicio|comeco)/],
  ["dur", /^(duracao|duration|dur\.?)$|duracao/],
  ["fim", /^(termino|fim|finish|data de termino|conclusao)$|termino/],
  ["nivel", /nivel da estrutura|^nivel$|outline level|^nivel de topico/],
];
function papelDaColuna(txt) {
  const n = norm(txt);
  if (!n) return null;
  for (const [k, re] of COLUNAS) if (re.test(n)) return k;
  return null;
}

/**
 * Acha a linha de cabeçalho (pode não ser a primeira: títulos, logos…),
 * reconhece as colunas pelo nome (português ou inglês), converte "Nível da
 * estrutura" em recuo e devolve a tabela no formato do lerCronograma.
 */
export function normalizarTabela(linhas) {
  let iCab = -1, mapa = null;
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const m = {};
    (linhas[i] || []).forEach((c, j) => { const k = papelDaColuna(c); if (k && m[k] == null) m[k] = j; });
    if (m.nome != null && (m.ini != null || m.fim != null) && Object.keys(m).length >= 3) { iCab = i; mapa = m; break; }
  }
  if (iCab < 0) return null;
  const out = [["Atividade", "% concluída", "Predecessoras", "Início", "Duração", "Término"]];
  const cel = (r, k) => (mapa[k] == null || r[mapa[k]] == null ? "" : String(r[mapa[k]]));
  const VAZIA = ["", "", "", "", "", ""];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const r = linhas[i] || [];
    let nome = cel(r, "nome");
    // a posição da linha é o ID usado nas predecessoras ("12TI+5 d"): linha vazia
    // continua ocupando o lugar, e se houver coluna Id, a linha vai para o seu número
    if (!nome.trim()) { if (mapa.id == null) out.push(VAZIA); continue; }
    const id = mapa.id != null ? parseInt(cel(r, "id"), 10) : NaN;
    if (!isNaN(id)) while (out.length < id) out.push(VAZIA);
    if (mapa.nivel != null) {
      const nv = parseInt(cel(r, "nivel"), 10);
      if (!isNaN(nv)) nome = " ".repeat(3 * Math.max(0, nv)) + nome.trim();
    }
    let pct = cel(r, "pct").trim();
    if (pct && !/%$/.test(pct)) { const n = Number(pct.replace(",", ".")); pct = isNaN(n) ? pct : (n <= 1 && /[.,]/.test(pct) ? Math.round(n * 100) : n) + "%"; }
    out.push([nome, pct, cel(r, "pred"), cel(r, "ini"), cel(r, "dur"), cel(r, "fim")]);
  }
  return out.length > 1 ? out : null;
}

/** CSV do Excel em português usa ";" — escolhe o separador pela 1ª linha com conteúdo */
export function separadorCsv(texto) {
  const l = String(texto).split(/\r?\n/).find((x) => x.trim()) || "";
  return (l.match(/;/g) || []).length > (l.match(/,/g) || []).length ? ";" : ",";
}

// ---------- XML do MS Project ----------
const tag = (xml, nome) => { const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml); return m ? m[1] : ""; };
const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ""; };
const TIPO = { "0": "TT", "1": "TI", "2": "IT", "3": "II" }; // FF, FS, SF, SS

/** Arquivo XML do MS Project → tabela do lerCronograma (ou null se não for desse formato) */
export function lerProjectXml(xml) {
  if (!/<Project[\s>]/.test(xml) || !/<Tasks>/.test(xml)) return null;
  const tarefas = [...xml.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map((m) => m[1])
    .filter((t) => tag(t, "IsNull") !== "1" && tag(t, "Name") !== "");
  const linhaDoUid = new Map();
  tarefas.forEach((t, i) => linhaDoUid.set(tag(t, "UID"), i + 1)); // ID da linha = ordem (igual ao Excel)
  const out = [["Atividade", "% concluída", "Predecessoras", "Início", "Duração", "Término"]];
  tarefas.forEach((t) => {
    const nivel = parseInt(tag(t, "OutlineLevel") || "0", 10);
    const horas = /PT(\d+)H(\d+)M/.exec(tag(t, "Duration"));
    const dias = horas ? (Number(horas[1]) + Number(horas[2]) / 60) / 8 : 0;
    const preds = [...t.matchAll(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g)].map((p) => {
      const id = linhaDoUid.get(tag(p[1], "PredecessorUID"));
      if (!id) return "";
      const tipo = TIPO[tag(p[1], "Type")] || "TI";
      const lag = Number(tag(p[1], "LinkLag") || 0) / 4800; // décimos de minuto → dias de 8 h
      return id + (tipo === "TI" ? "" : tipo) + (lag ? (lag > 0 ? "+" : "") + String(Math.round(lag * 100) / 100).replace(".", ",") + " d" : "");
    }).filter(Boolean).join(";");
    out.push([" ".repeat(3 * Math.max(0, nivel)) + unesc(tag(t, "Name")), (tag(t, "PercentComplete") || "0") + "%", preds,
      dataBR(tag(t, "Start")), String(Math.round(dias * 100) / 100).replace(".", ",") + " d", dataBR(tag(t, "Finish"))]);
  });
  return out.length > 1 ? out : null;
}

// ---------- PDF (texto posicionado na página) ----------
/**
 * itens: [{ str, x, y, w, pagina }] do pdf.js (y cresce para CIMA, como no PDF).
 * Monta linhas (mesmo y) e colunas (pela posição dos títulos do cabeçalho).
 * O recuo do nome vira nível pela distância até o nome mais à esquerda.
 */
export function tabelaDeItensPdf(itens) {
  // 1) linhas: agrupa por página e y (tolerância de 2,5 pt)
  const linhas = [];
  [...itens].filter((i) => String(i.str).trim()).sort((a, b) => (a.pagina - b.pagina) || (b.y - a.y) || (a.x - b.x)).forEach((it) => {
    const l = linhas.find((x) => x.pagina === it.pagina && Math.abs(x.y - it.y) <= 2.5);
    if (l) l.itens.push(it); else linhas.push({ pagina: it.pagina, y: it.y, itens: [it] });
  });
  linhas.forEach((l) => l.itens.sort((a, b) => a.x - b.x));
  // 2) cabeçalho: a 1ª linha com "nome/tarefa" e "início"/"término"
  let cab = null;
  for (const l of linhas) {
    const papeis = l.itens.map((i) => papelDaColuna(i.str));
    if (papeis.includes("nome") && (papeis.includes("ini") || papeis.includes("fim"))) {
      // todas as colunas do cabeçalho (inclusive "Id" e outras sem uso) para nada grudar no nome
      cab = l.itens.map((i, k) => ({ papel: papeis[k], x: i.x, fimX: i.x + (i.w || 0) }));
      break;
    }
  }
  if (!cab) return null;
  cab.sort((a, b) => a.x - b.x);
  const iNome = cab.findIndex((c) => c.papel === "nome");
  // limites: cada coluna vai do meio entre o título anterior e o seu até o meio com o próximo;
  // o nome começa um pouco à esquerda do título (o recuo das tarefas pode começar antes)
  const ultimo = cab[cab.length - 1];
  const fimTabela = ultimo.fimX + Math.max(60, (ultimo.fimX - ultimo.x) * 2); // à direita disso é o gráfico de Gantt
  const colunaDe = (x) => {
    if (x > fimTabela) return -1;
    let k = 0;
    for (let i = 0; i < cab.length; i++) {
      const ini = i === 0 ? -Infinity : (i === iNome ? cab[i].x - 4 : (cab[i - 1].fimX + cab[i].x) / 2);
      if (x >= ini) k = i;
    }
    return k;
  };
  // 3) linhas de dados: só as que têm alguma data (dd/mm/aa); linha sem data e só com texto no nome = continuação
  const reData = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
  const dados = [];
  linhas.forEach((l) => {
    if (cab && l.itens.some((i) => papelDaColuna(i.str) === "nome")) return; // cabeçalho repetido em cada página
    const cel = cab.map(() => []);
    let xNome = null;
    l.itens.forEach((i) => { const k = colunaDe(i.x); if (k < 0) return; cel[k].push(i.str); if (k === iNome && xNome == null) xNome = i.x; });
    const temData = cel.some((c, k) => cab[k].papel !== "nome" && reData.test(c.join(" ")));
    if (temData) dados.push({ cel: cel.map((c) => c.join(" ").replace(/\s+/g, " ").trim()), xNome });
    else if (dados.length && cel[iNome].length && cel.every((c, k) => k === iNome || !c.length)) {
      dados[dados.length - 1].cel[iNome] += " " + cel[iNome].join(" ").trim(); // nome quebrado em duas linhas
    }
  });
  if (!dados.length) return null;
  // 4) recuo → nível: passo = menor diferença entre recuos distintos
  const xs = [...new Set(dados.map((d) => Math.round(d.xNome)).filter((x) => !isNaN(x)))].sort((a, b) => a - b);
  let passo = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] >= 3) passo = Math.min(passo, xs[i] - xs[i - 1]);
  if (!isFinite(passo)) passo = 10;
  const x0 = xs[0];
  const tabela = [cab.map((c) => ({ nome: "Nome", pct: "% concluída", pred: "Predecessoras", ini: "Início", dur: "Duração", fim: "Término", nivel: "Nível" }[c.papel] || ""))];
  dados.forEach((d) => {
    const nivel = d.xNome == null ? 0 : Math.round((d.xNome - x0) / passo);
    tabela.push(d.cel.map((c, k) => (k === iNome ? " ".repeat(3 * nivel) + c : c)));
  });
  return normalizarTabela(tabela);
}
