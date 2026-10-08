/* Leitura do "Relatório do pedido" de aço cortado e dobrado (portal Belgo
 * Pronto / credenciado — ex.: Manchester, BP Rio de Janeiro) em PDF.
 *
 * Usa o texto com POSIÇÃO de cada trecho (pdf.js getTextContent), não o texto
 * corrido: assim os espaços vêm certos ("BP Rio de Janeiro", não
 * "Rio deJaneiro") e a tabela é lida pela coluna, mesmo quando a
 * identificação da prancha quebra em várias linhas.
 *
 * Funciona no navegador e no Node (testes): recebe a biblioteca pdf.js pronta.
 * Nada é gravado aqui — só devolve os dados para a pessoa revisar na ficha.
 */

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const isoDe = (t) => { const m = String(t || "").match(DATA); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const numBR = (t) => { const s = String(t || "").trim().replace(/\./g, "").replace(",", "."); const n = Number(s); return s && !isNaN(n) ? n : null; };
const limpa = (t) => String(t || "").replace(/\s+/g, " ").trim();

async function trechos(pdfjsLib, dados) {
  const doc = await pdfjsLib.getDocument({ data: dados, disableWorker: typeof window === "undefined" }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    paginas.push(tc.items.filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, p })));
  }
  return paginas;
}

// valor à direita de um rótulo, na mesma linha (tolerância de 3 pt na altura)
function valorDoRotulo(itens, rotulo) {
  const r = itens.find((t) => limpa(t.s).toLowerCase() === rotulo.toLowerCase());
  if (!r) return "";
  const naLinha = itens.filter((t) => t !== r && Math.abs(t.y - r.y) < 3 && t.x > r.x).sort((a, b) => a.x - b.x);
  return naLinha.length ? limpa(naLinha[0].s) : "";
}

// junta linhas quebradas da identificação: "…-PB-" + "1PV-…" sem espaço; demais com espaço
function juntarLinhas(linhas) {
  return linhas.reduce((acc, l) => {
    if (!acc) return l;
    return /[-_]$/.test(acc) && !/\s-$/.test(acc) ? acc + l : acc + " " + l;
  }, "");
}

export async function lerPedidoPdf(pdfjsLib, dados) {
  const paginas = await trechos(pdfjsLib, dados);
  const todos = paginas.flat();
  const p1 = paginas[0] || [];
  const avisos = [];
  const v = (rotulo) => valorDoRotulo(p1, rotulo);

  const ped = {
    fornecedor: v("Credenciado:"),
    cliente: v("Cliente:"),
    obra: v("Obra:"),
    identificacaoObra: v("Identificação:"),
    pedido: v("Nº Pedido Cliente:"),
    registroPortal: v("Nº Registro Portal:"),
    servico: v("Serviço:"),
    ordemCompra: v("Ordem de Compra:"),
    dataEnvio: isoDe(v("Data do Envio:")),
    dataPrevista: isoDe(v("Data Entrega Prevista:")),
    dataDesejada: isoDe(v("Data Entrega Desejada:")),
    engenheiro: v("Engenheiro(a):"),
    veiculo: "",
    itens: [],
    materialAuxiliar: [],
    pesos: {},
  };
  // fabricante pelo texto do portal (ex.: "credenciado Belgo Pronto")
  if (todos.some((t) => /belgo pronto/i.test(t.s))) ped.portal = "Belgo Pronto";
  const vd = p1.find((t) => /^Veículo Desejado$/i.test(limpa(t.s)));
  if (vd) {
    const abaixo = p1.filter((t) => t.y < vd.y - 2 && t.y > vd.y - 30 && !/^\(/.test(limpa(t.s))).sort((a, b) => b.y - a.y);
    if (abaixo.length) ped.veiculo = limpa(abaixo[0].s);
  }

  // ---------- tabela de itens ----------
  // colunas pelo CENTRO do título (os títulos são centralizados sobre a coluna)
  const cab = {};
  ["Item", "Forma", "XCarb", "Identificação", "Projeto/Revisão", "Elemento", "Pavimento", "Completo?", "Observações", "Peso"].forEach((nome) => {
    const t = todos.find((x) => limpa(x.s) === nome);
    if (t) cab[nome] = t.x + t.w / 2;
  });
  if (cab.Item == null || cab["Identificação"] == null || cab.Peso == null) {
    avisos.push("Não encontrei o cabeçalho da tabela de itens (Item / Identificação / Peso).");
  } else {
    const colunas = Object.entries(cab);
    const colunaDe = (t) => { // coluna cujo centro está mais perto do centro do texto
      const c = t.x + t.w / 2;
      let melhor = null, dist = Infinity;
      for (const [nome, cx] of colunas) { const d = Math.abs(c - cx); if (d < dist) { dist = d; melhor = nome; } }
      return melhor;
    };
    const fimItens = todos.find((t) => /^Material auxiliar$/i.test(limpa(t.s)) || /^Pesos do pedido/i.test(limpa(t.s)));
    const cabY = todos.find((t) => limpa(t.s) === "Item");
    // âncoras: número do item na coluna "Item"
    const ancoras = todos.filter((t) => /^\d{1,3}$/.test(limpa(t.s)) && colunaDe(t) === "Item"
      && !(t.p === cabY.p && t.y >= cabY.y)
      && !(fimItens && (t.p > fimItens.p || (t.p === fimItens.p && t.y <= fimItens.y))));
    ancoras.forEach((a, i) => {
      const prox = ancoras[i + 1];
      const daLinha = todos.filter((t) => t.p === a.p && t.y <= a.y + 2
        && (!prox || prox.p !== a.p || t.y > prox.y + 2)
        && !(fimItens && fimItens.p === a.p && t.y <= fimItens.y));
      const cel = {};
      daLinha.sort((x, y) => (y.y - x.y) || (x.x - y.x)).forEach((t) => {
        const c = colunaDe(t);
        (cel[c] = cel[c] || []).push(limpa(t.s));
      });
      const ident = juntarLinhas(cel["Identificação"] || []);
      const semUuid = ident.replace(/_[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\.zip$/i, "").replace(/\.zip$/i, "");
      const prancha = (semUuid.match(/^[A-Z]{2,}-[A-Z0-9_.-]+?(?=\s|$)/) || [semUuid])[0].replace(/_R\d+$/, (r) => r);
      const titulo = limpa(semUuid.slice(prancha.length).replace(/^\s*-\s*/, ""));
      ped.itens.push({
        item: Number(limpa(a.s)),
        prancha, descricao: titulo,
        revisao: (cel["Projeto/Revisão"] || []).join(" "),
        elemento: (cel.Elemento || []).join(" "),
        pavimento: (cel.Pavimento || []).join(" "),
        completo: (cel["Completo?"] || []).join(" "),
        forma: (cel.Forma || []).join(" ") === "Sim",
        observacoes: (cel["Observações"] || []).join(" "),
        pesoKg: numBR((cel.Peso || []).join("")),
      });
    });
  }

  // ---------- material auxiliar ----------
  const tituloAux = todos.find((t) => /^Material auxiliar$/i.test(limpa(t.s)));
  const tituloPesos = todos.find((t) => /^Pesos do pedido/i.test(limpa(t.s)));
  if (tituloAux && tituloPesos) {
    const entre = (t) => (t.p > tituloAux.p || (t.p === tituloAux.p && t.y < tituloAux.y)) && (t.p < tituloPesos.p || (t.p === tituloPesos.p && t.y > tituloPesos.y));
    const linhasAux = todos.filter((t) => entre(t) && !/^(Material|Qtde|Peso \(kg\))$/i.test(limpa(t.s)));
    const porLinha = {};
    linhasAux.forEach((t) => { const k = t.p + "|" + Math.round(t.y); (porLinha[k] = porLinha[k] || []).push(t); });
    Object.values(porLinha).forEach((ts) => {
      ts.sort((a, b) => a.x - b.x);
      const nums = ts.filter((t) => numBR(t.s) != null);
      const texto = ts.filter((t) => numBR(t.s) == null).map((t) => limpa(t.s)).join(" ");
      if (texto && nums.length >= 2) ped.materialAuxiliar.push({ material: texto, qtde: numBR(nums[0].s), pesoKg: numBR(nums[nums.length - 1].s) });
    });
  }

  // ---------- pesos e conferência ----------
  const pAll = (rot) => numBR(valorDoRotulo(todos.filter((t) => !tituloPesos || t.p >= tituloPesos.p), rot));
  ped.pesos = { projeto: pAll("Projeto:"), extra: pAll("Pedido extra:"), auxiliar: pAll("Material auxiliar:"), total: pAll("Total:") };
  const somaItens = Math.round(ped.itens.reduce((s, i) => s + (i.pesoKg || 0), 0) * 100) / 100;
  const somaAux = Math.round(ped.materialAuxiliar.reduce((s, i) => s + (i.pesoKg || 0), 0) * 100) / 100;
  if (ped.pesos.projeto != null && Math.abs(somaItens - ped.pesos.projeto) > 0.5) avisos.push(`Soma dos itens (${somaItens} kg) diferente do peso de projeto do pedido (${ped.pesos.projeto} kg) — confira os itens.`);
  if (ped.pesos.auxiliar != null && Math.abs(somaAux - ped.pesos.auxiliar) > 0.5) avisos.push(`Material auxiliar lido (${somaAux} kg) diferente do informado (${ped.pesos.auxiliar} kg).`);
  if (!ped.pedido) avisos.push("Não encontrei o nº do pedido.");
  if (!ped.dataPrevista) avisos.push("Não encontrei a data de entrega prevista.");
  ped.somaItensKg = somaItens;
  ped.avisos = avisos;
  return ped;
}
