/* Controle Tecnológico do Concreto: importar/exportar a planilha, situação de
 * cada nota (regras em regras-ct.js), painel, ficha da nota e a seção de CT
 * dentro da rastreabilidade. Separado do main.js na v1.29 (fase A1). */
import { abaixoEm as ctAbaixoEm, anterior as ctAnteriorRegra, anterioresAoSistema as ctAnterioresAoSistema, concluida as ctConcluidaRegra, emAberto as ctEmAbertoRegra, impedimentosConcluir as ctImpedimentosConcluir, justificada as ctJustificada, justificativaPendente as ctJustPendente, obsJustificativa as ctObsJustificativa, observacaoExportada as ctObsExportada, situacao as ctSituacaoRegra } from "./regras-ct.js";
import { escapeHtml, fmtDateBR, fmtDateTimeBR, nowISO, rastRotulo, todayISO } from "../comum/formatos.js";
import { garantirLibs } from "../../libs.js";
import { safeName, triggerDownload } from "../exportar/xlsx-xml.js";
import { preencherPlanilhaCt, conferirExportacao } from "./planilha-ct.js";
import { pintarIcones } from "../../ui/icones.js";
import { DEFAULT_OBRA } from "../fvs/catalogo.js";

// O que este módulo usa do app principal (ligado por iniciarTelaCt() no main.js).
let ctx = null;
export function iniciarTelaCt(c) { ctx = c; }

/* ---------------- Controle Tecnológico do Concreto ---------------- */
// Em vez de uma tela pra digitar cada traço manualmente, o usuário reenvia
// a mesma planilha de Controle Tecnológico (a mesma que já circula com o
// laboratório/concreteira) sempre que ela tiver novidade, e o app lê essa
// planilha e grava/atualiza cada linha no Firestore usando a "Nota de
// Remessa" como identificador único: reenviar a planilha nunca duplica
// nada, só atualiza o que já existe e adiciona o que for novo. Registros
// que em algum momento saírem da planilha (linha apagada/renumerada) nunca
// são excluídos automaticamente por aqui — continuam guardados como
// estavam, pra não haver risco de perda de dados.

// Mapa de colunas da aba "CONT. TECNOLÓGICO" (0-index, no formato que
// XLSX.utils.encode_cell espera), a partir da linha 7 da planilha (linhas
// 1–6 são título e cabeçalhos). CT_IDADES usa os mesmos nomes de campo
// abaixo pra descobrir qual resultado de ruptura já saiu e qual está
// pendente.
var CT_COLS = {
  local:0, volume:4, fck:5, notaRemessa:6, laboratorio:7, concreteira:8,
  dataConcretagem:9, numCps:10, slump:11,
  data7:12, data14:13, data28:14, data63:15,
  cpsConforme:16, r3:17, r7:18, r7b:19, r14:20, r14b:21, r28:22, r28b:23, r63:24, r63b:25,
  observacao:26
};
// Cada idade de ruptura tem uma data prevista (colunas "Data 7/14/28/63
// Dias") e um ou dois resultados (a planilha reserva uma segunda coluna,
// ex. "7' Dias", para reensaio). Um resultado é "pendente" quando a data
// prevista já passou e nenhum dos dois foi preenchido; se a data prevista
// ainda não chegou, simplesmente ainda não é o caso de cobrar o resultado.
// v1.32 (pedido do dono): o sistema só considera os resultados de 7, 28 e 63
// dias. Os de 3 e 14 dias continuam na planilha (importados e devolvidos
// iguais na exportação), mas não aparecem nem contam em nada no app.
var CT_IDADES = [
  {key:"7", dataCampo:"data7", campos:["r7","r7b"]},
  {key:"28", dataCampo:"data28", campos:["r28","r28b"]},
  {key:"63", dataCampo:"data63", campos:["r63","r63b"]}
];
function ctValorPreenchido(v){ return v!=null && String(v).trim()!==""; }
// Na prática, nem todo traço passa pelas 4 idades de ruptura — é comum o
// laboratório pular o rompimento de 14 dias, por exemplo, quando já não
// é mais necessário. Quando isso acontece, quem preenche a planilha marca
// a coluna "Observação" como "CONCLUÍDO" mesmo com aquela idade em
// branco — esse marcador é o sinal mais confiável de que não há nada
// pendente ali, então ele tem prioridade sobre a comparação de datas: só
// vira "pendente" (cobrança de resultado) quando a data já passou, o
// resultado não saiu E a observação não foi marcada como concluída.
// v1.11: além da observação, a nota pode ser marcada como concluída no app
// (campo concluida:true) — encerra a cobrança de todas as idades sem resultado.
/* v1.18 (regras do dono, ver modulos/ct/regras-ct.js):
   - anterior ao sistema (pela data da 1ª rastreabilidade): fora de tudo;
   - só 28 e 63 dias são obrigatórios — 7 nunca vira pendência (v1.32: 3 e
     14 dias não contam mais no app);
   - concluída (no app, "Concluído" na planilha ou 28 e 63 ok) e "você
     decide" (justificativa) não cobram resultado. */
var ctInicioCache = null;
function ctInicioSistema(){
  if(ctInicioCache==null) ctInicioCache = ctPrimeiraRast();
  return ctInicioCache;
}
// a lista de rastreabilidades mudou: recalcular a data de início do sistema
function ctLimparInicio(){ ctInicioCache = null; }
function ctAnterior(row){ return ctAnteriorRegra(row, ctInicioSistema()); }
// devolve a nota com anteriorAoSistema:true quando ela é anterior só pela data
function ctComAnterior(row){
  if(!row || row.anteriorAoSistema!=null || !ctAnterior(row)) return row;
  return Object.assign({}, row, { anteriorAoSistema:true });
}
function ctSituacao(row){ return ctSituacaoRegra(ctComAnterior(row)); }
function ctEmAberto(row){ return ctEmAbertoRegra(ctComAnterior(row)); }
function ctStatusIdade(row, idade){
  var dataPrev = row[idade.dataCampo];
  if(!dataPrev) return "sem-data";
  var saiu = idade.campos.some(function(c){ return ctValorPreenchido(row[c]); });
  if(saiu) return "concluido";
  var sit = ctSituacao(row);
  if(sit==="anterior" || sit==="concluida" || sit==="decidir") return "dispensado";
  if(dataPrev > todayISO()) return "aguardando";
  if(idade.key!=="28" && idade.key!=="63") return "dispensado";
  return "pendente";
}
function ctIdadesPendentes(row){
  return CT_IDADES.filter(function(idade){ return ctStatusIdade(row, idade)==="pendente"; });
}
function ctTemPendencia(row){ return ctIdadesPendentes(row).length>0; }
// v1.18: pendente = resultado obrigatório atrasado OU abaixo do fck / esperando a decisão do dono
function ctPendente(row){ return ctTemPendencia(row) || ctEmAberto(row); }

// Liga a Nota de Remessa desta linha às linhas de rastreabilidade que
// citam a mesma nota fiscal (mesmo campo já usado na busca ampliada do
// quadro principal), dando acesso direto à ficha de rastreabilidade a
// partir do painel de Controle Tecnológico.
function ctNormalizaNota(v){
  var s = String(v==null?"":v).replace(/\D/g,"");
  return s.replace(/^0+(?=\d)/,"");
}
function ctRastreabilidadesLigadas(notaRemessa){
  var alvo = ctNormalizaNota(notaRemessa);
  if(!alvo) return [];
  var achados = [];
  ctx.rastMap.forEach(function(r, id){
    var bateu = (r.linhas||[]).some(function(l){ return ctNormalizaNota(l.notaFiscal)===alvo; });
    if(bateu) achados.push({ id:id, numero:fmtDateBR(r.data) });
  });
  return achados;
}

/* ---- leitura da planilha (.xlsx) ---- */
function ctCellVal(ws, r, c){
  var cell = ws[XLSX.utils.encode_cell({r:r,c:c})];
  return cell ? cell.v : null;
}
function ctPad2(n){ return n<10 ? "0"+n : ""+n; }
function ctDataISO(v){
  if(v==null || v==="") return "";
  if(v instanceof Date && !isNaN(v)) return v.getUTCFullYear()+"-"+ctPad2(v.getUTCMonth()+1)+"-"+ctPad2(v.getUTCDate());
  if(typeof v==="number" && typeof XLSX!=="undefined" && XLSX.SSF && XLSX.SSF.parse_date_code){
    var d = XLSX.SSF.parse_date_code(v);
    if(d) return d.y+"-"+ctPad2(d.m)+"-"+ctPad2(d.d);
  }
  return "";
}
function ctNum(v){
  if(v==null || v==="") return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}
function ctStr(v){ return v==null ? "" : String(v).trim(); }
function ctBruto(v){
  if(v instanceof Date) return ctDataISO(v);
  if(v==null || v==="") return null;
  return v;
}

var ctImportando = false;
var ctUltimaConferencia = null; // v1.32: resultado da conferência da última importação (para o teste de ponta a ponta)
window.__tracoCtConferencia = function(){ return ctUltimaConferencia; };
function ctSetStatus(msg, tone){
  var el = document.getElementById("ct-import-msg");
  if(!el) return;
  el.textContent = msg||"";
  el.className = "ct-import-msg"+(tone?" "+tone:"");
}
async function ctImportarArquivo(file){
  try{ await garantirLibs(); }catch(ex){ console.error(ex); }
  if(!file || ctImportando) return;
  ctImportando = true;
  var bar = document.getElementById("ct-upload-bar");
  if(bar) bar.classList.add("busy");
  ctSetStatus("Lendo "+file.name+"…");
  try{
    var buf = await file.arrayBuffer();
    var wb = XLSX.read(buf, {type:"array", cellDates:true});
    var nomeAba = wb.SheetNames.find(function(n){ return /CONT\.?\s*TECNOL/i.test(n); }) || wb.SheetNames[0];
    var ws = wb.Sheets[nomeAba];
    if(!ws || !ws["!ref"]) throw new Error("planilha vazia ou sem a aba de Controle Tecnológico");
    var range = XLSX.utils.decode_range(ws["!ref"]);
    var linhas = [];
    for(var r=6; r<=range.e.r; r++){ // linha 7 da planilha (0-index 6) em diante
      var notaVal = ctCellVal(ws, r, CT_COLS.notaRemessa);
      if(notaVal==null || String(notaVal).trim()==="") continue; // sem Nota de Remessa não é uma linha de dado
      linhas.push({
        notaRemessa: String(notaVal).trim(),
        local: ctStr(ctCellVal(ws,r,CT_COLS.local)),
        volume: ctNum(ctCellVal(ws,r,CT_COLS.volume)),
        fck: ctNum(ctCellVal(ws,r,CT_COLS.fck)),
        laboratorio: ctStr(ctCellVal(ws,r,CT_COLS.laboratorio)),
        concreteira: ctStr(ctCellVal(ws,r,CT_COLS.concreteira)),
        dataConcretagem: ctDataISO(ctCellVal(ws,r,CT_COLS.dataConcretagem)),
        numCps: ctNum(ctCellVal(ws,r,CT_COLS.numCps)),
        slump: ctNum(ctCellVal(ws,r,CT_COLS.slump)),
        data7: ctDataISO(ctCellVal(ws,r,CT_COLS.data7)),
        data14: ctDataISO(ctCellVal(ws,r,CT_COLS.data14)),
        data28: ctDataISO(ctCellVal(ws,r,CT_COLS.data28)),
        data63: ctDataISO(ctCellVal(ws,r,CT_COLS.data63)),
        cpsConforme: ctNum(ctCellVal(ws,r,CT_COLS.cpsConforme)),
        r3: ctBruto(ctCellVal(ws,r,CT_COLS.r3)),
        r7: ctBruto(ctCellVal(ws,r,CT_COLS.r7)),
        r7b: ctBruto(ctCellVal(ws,r,CT_COLS.r7b)),
        r14: ctBruto(ctCellVal(ws,r,CT_COLS.r14)),
        r14b: ctBruto(ctCellVal(ws,r,CT_COLS.r14b)),
        r28: ctBruto(ctCellVal(ws,r,CT_COLS.r28)),
        r28b: ctBruto(ctCellVal(ws,r,CT_COLS.r28b)),
        r63: ctBruto(ctCellVal(ws,r,CT_COLS.r63)),
        r63b: ctBruto(ctCellVal(ws,r,CT_COLS.r63b)),
        observacao: ctStr(ctCellVal(ws,r,CT_COLS.observacao))
      });
    }
    if(!linhas.length) throw new Error("nenhuma linha com Nota de Remessa foi encontrada na planilha");

    var novos=0, atualizados=0, preservados=0, anteriores=0, ignoradas=0;
    // v1.17: início do sistema = data da 1ª rastreabilidade lançada no app
    var inicioSistema = "";
    ctx.rastMap.forEach(function(r){ if(r.data && (!inicioSistema || r.data < inicioSistema)) inicioSistema = r.data; });
    var ops = linhas.map(function(row){
      var id = "nf_"+safeName(row.notaRemessa);
      var existente = ctx.ctMap.get(id);
      // v1.18: nota que o dono marcou como concluída no app não muda mais com a planilha
      if(existente && existente.concluida===true){ ignoradas++; return null; }
      if(existente) atualizados++; else novos++;
      // v1.5: célula VAZIA na planilha não apaga o que foi lançado pelo site
      // (ex.: resultado de 28 dias preenchido na obra antes do laboratório
      // atualizar a planilha). Célula preenchida na planilha continua valendo.
      if(existente){
        Object.keys(row).forEach(function(k){
          var vazio = row[k]==null || String(row[k]).trim()==="";
          if(vazio && existente[k]!=null && String(existente[k]).trim()!==""){ row[k] = existente[k]; preservados++; }
        });
      }
      var data = Object.assign({}, existente||{}, row, {
        criadoEm: (existente && existente.criadoEm) ? existente.criadoEm : nowISO(),
        atualizadoEm: nowISO(),
        atualizadoPor: ctx.currentUserEmail||""
      });
      // v1.17: concretada antes do sistema → fora dos indicadores e concluída
      // (só se ninguém marcou/desmarcou à mão: campo ainda ausente)
      if(ctAnterioresAoSistema([Object.assign({ _id:id }, data)], inicioSistema).length){ data.anteriorAoSistema = true; anteriores++; }
      return { id:id, data:data };
    }).filter(Boolean);
    ctSetStatus("Gravando "+ops.length+" linha(s)…");
    // Grava em lotes (limite de 500 operações por commit no Firestore).
    for(var i=0;i<ops.length;i+=450){
      var chunk = ops.slice(i, i+450);
      var batch = ctx.dbf.batch();
      chunk.forEach(function(op){ batch.set(ctx.ctCol.doc(op.id), op.data); });
      await batch.commit();
    }
    await ctx.ctCol.doc("_meta").set({
      atualizadoEm: nowISO(), // v1.6: entra na sincronização incremental
      ultimaImportacaoEm: nowISO(), ultimaImportacaoPor: ctx.currentUserEmail||"",
      ultimoArquivo: file.name||"", ultimoTotalLinhas: linhas.length
    }, {merge:true});

    var modeloOk = true;
    try{ await ctSalvarModelo(file, buf); }catch(exM){ modeloOk = false; console.warn("modelo da planilha:", exM); }
    // v1.32: confere, já com os dados do app, que a exportação sai no mesmo formato desta planilha
    var conferencia = "";
    try{
      var depois = new Map(); ctx.ctMap.forEach(function(d, id){ depois.set(id, d); });
      ops.forEach(function(op){ depois.set(op.id, op.data); });
      var regsConf = [];
      depois.forEach(function(d, id){ if(id!=="_meta" && d && d.notaRemessa) regsConf.push(Object.assign({}, ctComAnterior(Object.assign({ _id:id }, d)))); });
      regsConf = regsConf.map(function(r){ return Object.assign({}, r, { observacao: ctObsExportada(r) }); });
      var conf = await conferirExportacao(JSZip, buf, regsConf, CT_COLS);
      if(conf.inesperadas.length || !conf.restoIgual){
        conferencia = " ⚠ Conferência da exportação: "+(conf.inesperadas.length ? conf.inesperadas.length+" célula(s) sairiam diferentes sem motivo ("+conf.inesperadas.slice(0,6).join(", ")+")" : "o layout da aba mudaria")+" — me avise antes de exportar.";
      } else if(!conf.alteradas.length){
        conferencia = " ✓ Conferido: exportando agora, a planilha sai idêntica a esta.";
      } else {
        conferencia = " ✓ Conferido: a exportação sai no mesmo formato desta planilha; só "+conf.alteradas.length+" célula(s) mudam, com o que foi lançado no app"
          +(conf.novas ? " ("+conf.novas+" nota(s) nova(s) do app)" : "")+": "+conf.alteradas.slice(0,8).join(", ")+(conf.alteradas.length>8 ? "…" : "")+".";
      }
      ctUltimaConferencia = conf;
    }catch(exC){ console.warn("conferência da exportação:", exC); }
    ctSetStatus(linhas.length+" linha(s) na planilha — "+novos+" nova(s), "+atualizados+" atualizada(s)"
      +(preservados ? "; "+preservados+" valor(es) lançado(s) pelo site mantido(s) (célula vazia na planilha)" : "")
      +(ignoradas ? "; "+ignoradas+" nota(s) que você concluiu no app ficaram como estavam" : "")
      +(anteriores ? "; "+anteriores+" nota(s) anterior(es) ao sistema (antes de "+fmtDateBR(inicioSistema)+") marcadas como concluídas, fora dos indicadores" : "")+"."
      +(modeloOk ? "" : " (Não consegui guardar a planilha como modelo de exportação.)")
      +conferencia, conferencia.indexOf("⚠")!==-1 ? "err" : "ok");
  } catch(ex){
    console.error(ex);
    ctSetStatus("Não foi possível importar: "+(ex && ex.message ? ex.message : "erro desconhecido")+".", "err");
  } finally {
    ctImportando = false;
    if(bar) bar.classList.remove("busy");
  }
}

/* ---- v1.8: modelo da planilha (para exportar no mesmo formato) ----
   O arquivo importado é guardado em base64, em partes de até 700 mil
   caracteres (limite de 1 MB por documento do Firestore):
     planilhasModelo/ct        → { arquivo, em, por, partes, bytes }
     planilhasModelo/ct_p0..N  → { dados }  */
var CT_MODELO_PARTE = 700000;
function bufParaB64(buf){
  var u8 = new Uint8Array(buf), s = "";
  for(var i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000));
  return btoa(s);
}
function b64ParaU8(b64){
  var s = atob(b64), u8 = new Uint8Array(s.length);
  for(var i=0;i<s.length;i++) u8[i] = s.charCodeAt(i);
  return u8;
}
async function ctSalvarModelo(file, buf){
  var b64 = bufParaB64(buf);
  if(b64.length > CT_MODELO_PARTE*12) throw new Error("planilha grande demais para guardar como modelo");
  var partes = Math.ceil(b64.length / CT_MODELO_PARTE);
  for(var i=0;i<partes;i++) await ctx.modelosCol.doc("ct_p"+i).set({ dados: b64.slice(i*CT_MODELO_PARTE, (i+1)*CT_MODELO_PARTE) });
  await ctx.modelosCol.doc("ct").set({ arquivo:file.name||"", em:nowISO(), por:ctx.currentUserEmail||"", partes:partes, bytes:buf.byteLength });
}
async function ctCarregarModelo(){
  var meta = await ctx.modelosCol.doc("ct").get();
  if(!meta.exists) return null;
  var m = meta.data(), pedacos = [];
  for(var i=0;i<m.partes;i++){
    var p = await ctx.modelosCol.doc("ct_p"+i).get();
    if(!p.exists) return null;
    pedacos.push(p.data().dados);
  }
  return { arquivo:m.arquivo, em:m.em, dados:b64ParaU8(pedacos.join("")) };
}
// Exporta TODAS as notas do app na planilha-modelo (não só as filtradas na tela)
async function ctExportarPlanilha(arquivoEscolhido){
  var btn = document.getElementById("ct-btn-exportar");
  if(btn) btn.disabled = true;
  try{
    await garantirLibs();
    var modelo;
    if(arquivoEscolhido){
      var bufE = await arquivoEscolhido.arrayBuffer();
      modelo = { arquivo:arquivoEscolhido.name, dados:new Uint8Array(bufE) };
      try{ await ctSalvarModelo(arquivoEscolhido, bufE); }catch(exM){ console.warn(exM); }
    } else {
      ctSetStatus("Buscando a planilha-modelo…");
      modelo = await ctCarregarModelo();
    }
    if(!modelo){
      ctSetStatus("Ainda não há planilha-modelo guardada. Escolha a planilha do Controle Tecnológico (a mesma que costuma importar) — ela vira o modelo e a exportação sai no mesmo layout.", "err");
      var fi = document.getElementById("ct-modelo-input");
      if(fi) fi.click();
      return;
    }
    ctSetStatus("Preenchendo a planilha…");
    var zip = await JSZip.loadAsync(modelo.dados);
    // v1.16: a justificativa do resultado abaixo do fck vai junto na coluna Observação
    // v1.18: + "CONCLUÍDO" nas notas concluídas no app (a planilha sai igual à do laboratório)
    var regs = ctRowsArray().map(function(r){ return Object.assign({}, r, { observacao: ctObsExportada(r) }); });
    var res = await preencherPlanilhaCt(zip, regs, CT_COLS);
    var blob = await zip.generateAsync({ type:"blob", compression:"DEFLATE", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var base = String(modelo.arquivo||"Controle Tecnologico.xlsx").replace(/\.xlsx?$/i, "").replace(/\s*\(app \d{2}-\d{2}-\d{4}\)$/, "");
    triggerDownload(blob, base+" (app "+fmtDateBR(todayISO()).replace(/\//g,"-")+").xlsx");
    ctSetStatus("Planilha exportada no layout de \""+modelo.arquivo+"\": "+res.atualizadas+" nota(s) atualizada(s)"
      +(res.novas ? ", "+res.novas+" nota(s) lançada(s) no app acrescentada(s)" : "")+" · "+res.celulas+" célula(s) preenchida(s)."
      +(res.avisos.length ? " "+res.avisos.join(" ") : ""), "ok");
  } catch(ex){
    console.error(ex);
    ctSetStatus("Não foi possível exportar: "+(ex && ex.message ? ex.message : "erro desconhecido")+".", "err");
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* ---- painel / dashboard ---- */
// v1.5: filtros do Controle Tecnológico (situação, período, concreteira,
// laboratório) e modo de visualização (agrupado por data ou tabela).
// somentePendentes é mantido por compatibilidade (Início → "atrasados").
var filtrosCt = { busca:"", somentePendentes:false, situacao:"pendentes", de:"", ate:"", concreteira:"", laboratorio:"", visao:"grupos" };
function ctRowsArray(){
  var out = [];
  ctx.ctMap.forEach(function(d, id){
    if(id==="_meta" || !d || !d.notaRemessa) return;
    out.push(ctComAnterior(Object.assign({ _id:id }, d)));
  });
  out.sort(function(a,b){ return (b.dataConcretagem||"").localeCompare(a.dataConcretagem||"") || String(a.notaRemessa).localeCompare(String(b.notaRemessa)); });
  return out;
}
// número a partir de texto da planilha/site ("32,5" → 32.5); null se não for número
function ctNumero(v){
  if(v==null || String(v).trim()==="") return null;
  var n = Number(String(v).replace(/\s/g,"").replace(",", "."));
  return isNaN(n) ? null : n;
}
// Melhor resultado de 28 dias (28 ou 28') — base da comparação com o fck
function ctMelhor28(row){
  var a = ctNumero(row.r28), b = ctNumero(row.r28b);
  if(a==null && b==null) return null;
  return Math.max(a==null ? -Infinity : a, b==null ? -Infinity : b);
}
function ctMelhor63(row){
  var a = ctNumero(row.r63), b = ctNumero(row.r63b);
  if(a==null && b==null) return null;
  return Math.max(a==null ? -Infinity : a, b==null ? -Infinity : b);
}
// v1.16 (regra do dono): abaixo do fck aos 28 OU aos 63 dias — mesmo que
// recupere aos 63, o resultado de 28 abaixo exige justificativa (regras-ct.js).
// v1.18: abaixo do fck e ainda em aberto (concluídas e anteriores ao sistema ficam de fora)
function ctAbaixoFck(row){ var s = ctSituacao(row); return (s==="abaixo" || s==="decidir") && ctAbaixoEm(row).length>0; }
// Ficou abaixo aos 28 dias, mas atingiu o fck aos 63
function ctRecuperou63(row){
  var fck = ctNumero(row.fck), r = ctMelhor28(row), r63 = ctMelhor63(row);
  return fck!=null && r!=null && r < fck && r63!=null && r63 >= fck;
}
// Algum rompimento previsto para os próximos 7 dias (ainda sem resultado)
function ctRomperEmBreve(row){
  var hoje = todayISO(), lim = ctSomarDias(hoje, 7);
  return CT_IDADES.some(function(idade){
    return ctStatusIdade(row, idade)==="aguardando" && row[idade.dataCampo] <= lim;
  });
}
function ctAguardando(row){ return CT_IDADES.some(function(i){ return ctStatusIdade(row, i)==="aguardando"; }); }
function ctSomarDias(iso, dias){
  if(!iso) return "";
  var d = new Date(iso+"T12:00:00"); if(isNaN(d)) return "";
  d.setDate(d.getDate()+dias);
  return d.getFullYear()+"-"+ctPad2(d.getMonth()+1)+"-"+ctPad2(d.getDate());
}
var CT_SITUACOES = [
  { key:"todos", label:"Todas", teste:function(){ return true; } },
  { key:"pendentes", label:"Pendentes (tudo)", teste:ctPendente },
  { key:"atrasado", label:"Resultado atrasado", teste:ctTemPendencia },
  { key:"decidir", label:"Você decide (justificadas)", teste:function(r){ return ctSituacao(r)==="decidir"; } },
  { key:"ok28", label:"Bateu aos 28 — aguarda 63", teste:function(r){ return ctSituacao(r)==="ok28"; } },
  { key:"semana", label:"Romper em 7 dias", teste:ctRomperEmBreve },
  { key:"abaixo", label:"Abaixo do fck", teste:ctAbaixoFck },
  { key:"semjust", label:"Abaixo do fck sem justificativa", teste:ctJustPendente },
  { key:"recuperou", label:"Atingiu só aos 63d", teste:ctRecuperou63 },
  { key:"aguardando", label:"Aguardando", teste:ctAguardando },
  // v1.8: NF sem rastreabilidade ligada (nem pela NF nas betonadas, nem manual)
  // v1.10: as marcadas "anterior ao sistema" não entram (não há o que ligar)
  { key:"semvinculo", label:"Sem vínculo com rastreabilidade", teste:function(r){ return r.anteriorAoSistema!==true && !ctLigacoes(r).confirmadas.length; } },
  { key:"anteriores", label:"Anteriores ao sistema", teste:ctAnterior },
  { key:"concluidas", label:"Concluídas", teste:function(r){ var st = ctSituacao(r); return st==="concluida" || st==="ok28"; } },
  { key:"completo", label:"Completas", teste:function(r){ return !ctPendente(r) && !ctAguardando(r); } }
];
function ctRowsFiltradas(){
  var termo = (filtrosCt.busca||"").trim().toLowerCase();
  var sit = CT_SITUACOES.find(function(s){ return s.key===filtrosCt.situacao; }) || CT_SITUACOES[0];
  return ctRowsArray().filter(function(row){
    if(filtrosCt.somentePendentes && !ctPendente(row)) return false;
    if(!sit.teste(row)) return false;
    if(filtrosCt.de && (row.dataConcretagem||"") < filtrosCt.de) return false;
    if(filtrosCt.ate && (row.dataConcretagem||"") > filtrosCt.ate) return false;
    if(filtrosCt.concreteira && (row.concreteira||"") !== filtrosCt.concreteira) return false;
    if(filtrosCt.laboratorio && (row.laboratorio||"") !== filtrosCt.laboratorio) return false;
    if(termo){
      var alvo = (String(row.local||"")+" "+String(row.notaRemessa||"")+" "+String(row.concreteira||"")+" "+String(row.laboratorio||"")+" "+String(row.observacao||"")).toLowerCase();
      if(alvo.indexOf(termo)===-1) return false;
    }
    return true;
  });
}
// Rastreabilidades ligadas a uma NF do CT: pela NF nas betonadas (automático),
// pelo vínculo manual feito na ficha da NF, e as do mesmo dia (sugestão).
function ctLigacoes(row){
  var porNota = ctRastreabilidadesLigadas(row.notaRemessa).map(function(x){ return x.id; });
  var manual = (row.rastreabilidadeId && ctx.rastMap.has(row.rastreabilidadeId)) ? [row.rastreabilidadeId] : [];
  var mesmoDia = [];
  if(row.dataConcretagem){
    ctx.rastMap.forEach(function(r, id){ if(r.data===row.dataConcretagem) mesmoDia.push(id); });
  }
  var confirmadas = Array.from(new Set(porNota.concat(manual)));
  return { confirmadas:confirmadas, mesmoDia:mesmoDia.filter(function(id){ return confirmadas.indexOf(id)===-1; }), porNota:porNota };
}
function ctCelulaResultado(row, campo, idade){
  var v = row[campo];
  var texto = (v==null || v==="") ? "—" : String(v);
  var tone = idade ? ctStatusIdade(row, idade) : "";
  if(tone==="concluido" && !ctAtingiuFck(row, idade)) tone = "resultado"; // v1.22: verde só se atingiu o fck
  return '<td class="ct-cell'+(tone?" tone-"+tone:"")+'">'+escapeHtml(texto)+'</td>';
}
function ctCelulaData(iso){
  return '<td class="ct-cell" style="color:var(--text-muted);">'+escapeHtml(fmtDateBR(iso))+'</td>';
}
function ctCelulaTexto(v, align){
  return '<td'+(align?' style="text-align:'+align+';"':'')+'>'+escapeHtml(v==null||v===""?"—":v)+'</td>';
}
function ctCelulaRastreabilidade(row){
  var ligadas = ctLigacoes(row).confirmadas;
  if(!ligadas.length) return '<td><span class="ct-sem-vinculo">'+(row.anteriorAoSistema===true ? "anterior ao sistema" : "sem vínculo")+'</span></td>';
  var principal = ligadas[0], r = ctx.rastMap.get(principal);
  var extra = ligadas.length>1 ? ' <span class="ct-sem-vinculo">+'+(ligadas.length-1)+'</span>' : '';
  return '<td><button type="button" class="ct-rast-link" data-open-rast="'+escapeHtml(principal)+'">Rastr. '+escapeHtml(r ? fmtDateBR(r.data) : "")+'</button>'+extra+'</td>';
}
function ctUltimoImportInfo(){
  var meta = ctx.ctMap.get("_meta");
  if(!meta || !meta.ultimaImportacaoEm) return "Nenhuma planilha importada ainda.";
  return "Última importação: "+fmtDateTimeBR(meta.ultimaImportacaoEm)+(meta.ultimaImportacaoPor?" por "+escapeHtml(meta.ultimaImportacaoPor):"")+(meta.ultimoTotalLinhas?" — "+meta.ultimoTotalLinhas+" linha(s)":"")+".";
}
// Só a tabela é reconstruída a cada busca/filtro (o cabeçalho com o campo
// de busca fica de fora), pro campo de texto não perder o foco/cursor a
// cada letra digitada — mesmo cuidado já tomado no campo de busca do
// quadro principal.
function renderCtTable(){
  var el = document.getElementById("ct-table-container");
  if(!el) return;
  var rows = ctRowsArray();
  if(!rows.length){
    el.innerHTML = '<div class="empty-state"><div class="big">Nenhuma nota cadastrada ainda</div><p>Importe a planilha do laboratório ou toque em "Lançar nota / resultado".</p></div>';
    return;
  }
  var visiveis = ctRowsFiltradas();
  // v1.10: no filtro "sem vínculo", painel para acertar em lote
  if(filtrosCt.situacao==="semvinculo" && visiveis.length){
    el.innerHTML = ctPainelVinculos(visiveis) + '<div id="ct-vinc-tabela"></div>';
    ctLigarPainelVinculos(el);
    pintarIcones(el);
    el = el.querySelector("#ct-vinc-tabela");
  }
  if(filtrosCt.visao!=="tabela"){
    if(!visiveis.length){ el.innerHTML = '<div class="empty-state"><div class="big">Nenhuma nota com esses filtros</div><p>Ajuste a situação, o período ou a busca.</p></div>'; return; }
    renderCtGrupos(el, visiveis);
    return;
  }
  el.innerHTML = '<div class="lines-wrap ct-wrap"><table class="ct-table"><thead>'
    + '<tr>'
      + '<th rowspan="2">Local</th>'
      + '<th rowspan="2">Vol (m³)</th>'
      + '<th rowspan="2">Fck (Mpa)</th>'
      + '<th rowspan="2">Nota de Remessa</th>'
      + '<th rowspan="2">Laboratório</th>'
      + '<th rowspan="2">Concreteira</th>'
      + '<th rowspan="2">Data Concretagem</th>'
      + '<th rowspan="2">Nº de CPs</th>'
      + '<th rowspan="2">Slump</th>'
      + '<th rowspan="2">Data 7 Dias</th>'
      + '<th rowspan="2">Data 28 Dias</th>'
      + '<th rowspan="2">Data 63 Dias</th>'
      + '<th rowspan="2">CPs Conforme</th>'
      + '<th class="ct-th-group" colspan="2">7 Dias</th>'
      + '<th class="ct-th-group" colspan="2">28 Dias</th>'
      + '<th class="ct-th-group" colspan="2">63 Dias</th>'
      + '<th rowspan="2">Observação</th>'
      + '<th rowspan="2">Rastreabilidade</th>'
    + '</tr>'
    + '<tr>'
      + '<th class="ct-th-sub">7 Dias</th><th class="ct-th-sub">7\' Dias</th>'
      + '<th class="ct-th-sub">28 Dias</th><th class="ct-th-sub">28\' Dias</th>'
      + '<th class="ct-th-sub">63 Dias</th><th class="ct-th-sub">63\' Dias</th>'
    + '</tr>'
  + '</thead><tbody>'
  + (visiveis.length ? visiveis.map(function(row){
      return '<tr class="ct-tr" data-ct-abrir="'+escapeHtml(row._id)+'" title="Abrir a ficha desta NF">'
        + ctCelulaTexto(row.local, "left")
        + ctCelulaTexto(row.volume)
        + ctCelulaTexto(row.fck)
        + ctCelulaTexto(row.notaRemessa)
        + ctCelulaTexto(row.laboratorio, "left")
        + ctCelulaTexto(row.concreteira, "left")
        + ctCelulaData(row.dataConcretagem)
        + ctCelulaTexto(row.numCps)
        + ctCelulaTexto(row.slump)
        + ctCelulaData(row.data7)
        + ctCelulaData(row.data28)
        + ctCelulaData(row.data63)
        + ctCelulaTexto(row.cpsConforme)
        + ctCelulaResultado(row, "r7", CT_IDADES[0]) + ctCelulaResultado(row, "r7b", CT_IDADES[0])
        + ctCelulaResultado(row, "r28", CT_IDADES[1]) + ctCelulaResultado(row, "r28b", CT_IDADES[1])
        + ctCelulaResultado(row, "r63", CT_IDADES[2]) + ctCelulaResultado(row, "r63b", CT_IDADES[2])
        + ctCelulaTexto(row.concluida===true ? "✓ concluída"+(row.observacao ? " · "+row.observacao : "") : row.observacao, "left")
        + ctCelulaRastreabilidade(row)
      + '</tr>';
    }).join("") : '<tr><td colspan="21" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum traço encontrado com os filtros atuais.</td></tr>')
  + '</tbody></table></div>';
  el.querySelectorAll("[data-open-rast]").forEach(function(btn){
    btn.addEventListener("click", function(e){ e.stopPropagation(); ctx.openModal("rast", btn.getAttribute("data-open-rast")); });
  });
  el.querySelectorAll("tr[data-ct-abrir]").forEach(function(tr){
    tr.addEventListener("click", function(){ abrirFichaNf(tr.getAttribute("data-ct-abrir")); });
  });
}
/* ---- v1.10: acertar vínculos CT ↔ rastreabilidade em lote ----
   Sugestão = concretagem registrada no MESMO DIA da NF. Notas de antes da
   primeira rastreabilidade do app não têm o que ligar: marcam-se como
   "anterior ao sistema" (campo novo anteriorAoSistema:true, só acrescenta). */
var ctVincAcoes = {};
function ctPrimeiraRast(){
  var m = "";
  ctx.rastMap.forEach(function(r){ if(r.data && (!m || r.data < m)) m = r.data; });
  return m;
}
function ctPainelVinculos(visiveis){
  var primeira = ctPrimeiraRast();
  var antes = function(r){ return !!(primeira && r.dataConcretagem && r.dataConcretagem < primeira); };
  var antigas = visiveis.filter(antes);
  var comSug = visiveis.map(function(r){ return { r:r, sug:ctLigacoes(r).mesmoDia }; }).filter(function(x){ return x.sug.length; });
  var unicas = comSug.filter(function(x){ return x.sug.length===1; });
  var resto = visiveis.filter(function(r){ return !antes(r) && !ctLigacoes(r).mesmoDia.length; }).length;
  ctVincAcoes = { antigas:antigas, unicas:unicas, primeira:primeira };
  var mostrar = comSug.slice(0, 40);
  return '<div class="ct-vinc">'
    + '<div class="ct-vinc-h"><b>Acertar vínculos</b><small>'+visiveis.length+' nota(s) sem rastreabilidade ligada'
      + (primeira ? ' · a primeira rastreabilidade do app é de '+fmtDateBR(primeira) : '')+'</small></div>'
    + '<div class="ct-vinc-acoes">'
      + (antigas.length ? '<button type="button" class="btn small" data-ct-vinc-antigas>Marcar '+antigas.length+' nota(s) de antes de '+fmtDateBR(primeira)+' como “anterior ao sistema”</button>' : '')

    + '</div>'
    + (mostrar.length ? '<div class="ct-vinc-lista">'+mostrar.map(function(x){
        var r = x.r;
        return '<div class="ct-vinc-li"><div class="tx"><b>NF '+escapeHtml(r.notaRemessa)+'</b><small>'+escapeHtml(fmtDateBR(r.dataConcretagem))+' · '+escapeHtml(r.local||"sem local")+'</small></div>'
          // v1.18: a NF precisa ficar igual à da BT — o vínculo é feito na ficha da nota, escolhendo a betonada
          + '<div class="bt"><button type="button" class="btn small" data-ct-vinc="'+escapeHtml(r._id)+'" title="Escolher a BT desta nota (a NF da BT fica igual)">Escolher a BT ('+x.sug.length+' concretagem(ns) no dia)</button><button type="button" class="btn small" data-ct-ant="'+escapeHtml(r._id)+'">Anterior ao sistema</button></div></div>';
      }).join("")+(comSug.length>mostrar.length ? '<div class="hint">… e mais '+(comSug.length-mostrar.length)+'. Use o botão acima ou filtre por período.</div>' : '')+'</div>' : '')
    + (resto>0 ? '<div class="hint">'+resto+' nota(s) não têm concretagem registrada no mesmo dia: toque na nota abaixo para vincular manualmente ou marcar como anterior ao sistema.</div>' : '')
  + '</div>';
}
function ctLigarPainelVinculos(el){
  var b1 = el.querySelector("[data-ct-vinc-antigas]");
  if(b1) b1.addEventListener("click", function(){
    var l = ctVincAcoes.antigas;
    if(!confirm("Marcar "+l.length+" nota(s) concretadas antes de "+fmtDateBR(ctVincAcoes.primeira)+" como “anterior ao sistema”?\n\nNada é apagado: só acrescenta a marcação, que pode ser desfeita na ficha de cada nota.")) return;
    ctGravarLote(l.map(function(r){ return { id:r._id, dados:{ anteriorAoSistema:true } }; }), b1);
  });
  el.querySelectorAll("[data-ct-vinc]").forEach(function(b){
    b.addEventListener("click", function(){ abrirFichaNf(b.getAttribute("data-ct-vinc")); });
  });
  el.querySelectorAll("[data-ct-ant]").forEach(function(b){
    b.addEventListener("click", function(){ ctGravarLote([{ id:b.getAttribute("data-ct-ant"), dados:{ anteriorAoSistema:true } }], b); });
  });
}
// Grava várias notas (lotes de 450, abaixo do limite de 500 do Firestore)
async function ctGravarLote(alteracoes, botao){
  if(!alteracoes.length) return;
  var agora = nowISO(), envios = [];
  if(botao){ botao.disabled = true; botao.textContent = "Gravando…"; }
  try{
    for(var i=0;i<alteracoes.length;i+=450){
      var batch = ctx.dbf.batch();
      alteracoes.slice(i, i+450).forEach(function(a){
        batch.set(ctx.ctCol.doc(a.id), Object.assign({}, a.dados, { atualizadoEm:agora, atualizadoPor:ctx.currentUserEmail||"", editadoNoSite:true }), { merge:true });
      });
      envios.push(batch.commit());
    }
    var r = await Promise.race([Promise.all(envios).then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
    if(r==="pendente") alert("Sem conexão no momento — as alterações serão enviadas automaticamente quando o sinal voltar. Mantenha o app aberto.");
  }catch(ex){
    console.error(ex);
    if(!(ex && ex.code==="permission-denied" && ctx.somenteLeitura)) alert("Não foi possível gravar: "+(ex && ex.message ? ex.message : "erro desconhecido"));
  }
  if(document.getElementById("ct-table-container")) renderViewCt();
}

/* ---- v1.10: cobrar o laboratório pelo WhatsApp ----
   Resultados atrasados agrupados por laboratório → concretagem → idade. */
function ctCobrancaGrupos(desde){
  var labs = {};
  ctRowsArray().forEach(function(r){
    if(desde && (r.dataConcretagem||"") < desde) return;
    ctIdadesPendentes(r).forEach(function(i){
      var lab = String(r.laboratorio||"").trim() || "Laboratório não informado";
      var L = labs[lab] || (labs[lab] = { lab:lab, conc:{}, n:0 });
      var k = (r.dataConcretagem||"")+"|"+("0"+i.key).slice(-2);
      var g = L.conc[k] || (L.conc[k] = { data:r.dataConcretagem||"", idade:i.key, venc:r[i.dataCampo], nfs:[], locais:{} });
      g.nfs.push(String(r.notaRemessa||"?"));
      var loc = String(r.local||"").split(/[—-]/)[0].trim(); if(loc) g.locais[loc] = 1;
      L.n++;
    });
  });
  return Object.keys(labs).sort().map(function(k){
    var L = labs[k];
    L.grupos = Object.keys(L.conc).sort().map(function(c){ return L.conc[c]; });
    return L;
  });
}
function ctMensagemCobranca(L){
  var out = ["Olá! Tudo bem?", "", "Da obra *"+DEFAULT_OBRA+"*, ainda não recebemos os resultados de rompimento abaixo:"];
  var dataAtual = null;
  L.grupos.forEach(function(g){
    if(g.data!==dataAtual){
      dataAtual = g.data;
      var locais = {};
      L.grupos.forEach(function(x){ if(x.data===g.data) Object.assign(locais, x.locais); });
      locais = Object.keys(locais);
      out.push("", "*Concretagem de "+(g.data ? fmtDateBR(g.data) : "data não informada")+"*"+(locais.length ? " — "+locais.join(", ") : ""));
    }
    out.push("• "+g.idade+" dias (previsto para "+fmtDateBR(g.venc)+"): NF "+g.nfs.join(", "));
  });
  out.push("", "Podem nos enviar, por favor? Obrigado!");
  return out.join("\n");
}
function ctAbrirCobranca(){
  var periodo = "90";
  var ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  var desenhar = function(){
    var desde = periodo==="todos" ? "" : ctSomarDias(todayISO(), -parseInt(periodo,10));
    var labs = ctCobrancaGrupos(desde);
    ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true">'
      + '<div class="modal-head"><h2>Cobrar resultados do laboratório</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>'
      + '<div class="modal-body">'
        + '<div class="chips" role="group" aria-label="Período">'+[["30","Concretagens dos últimos 30 dias"],["90","Últimos 90 dias"],["todos","Todas"]].map(function(p){
            return '<button type="button" class="chip" data-periodo="'+p[0]+'" aria-pressed="'+(periodo===p[0])+'">'+p[1]+'</button>'; }).join("")+'</div>'
        + (labs.length ? labs.map(function(L, i){
            var msg = ctMensagemCobranca(L);
            return '<fieldset class="ct-cobra"><legend>'+escapeHtml(L.lab)+' — '+L.n+' resultado(s) atrasado(s)</legend>'
              + '<textarea readonly rows="9" data-msg="'+i+'">'+escapeHtml(msg)+'</textarea>'
              + '<div class="ct-cobra-bt"><a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(msg)+'">Enviar pelo WhatsApp</a>'
              + '<button type="button" class="btn" data-copiar="'+i+'">Copiar mensagem</button></div></fieldset>';
          }).join("") : '<div class="dash-vazio">Nenhum resultado atrasado nesse período. 👍</div>')
        + '<div class="hint">O WhatsApp abre com a mensagem pronta; você escolhe o contato do laboratório e envia. Nada é gravado no app.</div>'
      + '</div></div>';
  };
  desenhar();
  document.body.appendChild(ov);
  document.body.style.overflow = "hidden";
  var fechar = function(){ ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", esc); };
  var esc = function(e){ if(e.key==="Escape") fechar(); };
  document.addEventListener("keydown", esc);
  ov.addEventListener("click", function(e){
    if(e.target===ov || e.target.closest("[data-fechar]")){ fechar(); return; }
    var p = e.target.closest("[data-periodo]");
    if(p){ periodo = p.getAttribute("data-periodo"); desenhar(); return; }
    var c = e.target.closest("[data-copiar]");
    if(c){
      var ta = ov.querySelector('[data-msg="'+c.getAttribute("data-copiar")+'"]');
      var ok = function(){ c.textContent = "Copiada ✓"; setTimeout(function(){ c.textContent = "Copiar mensagem"; }, 2000); };
      var antigo = function(){ ta.select(); document.execCommand("copy"); ok(); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, antigo);
      else antigo();
    }
  });
}
function renderViewCt(){
  var container = document.getElementById("view-ct");
  var rows = ctRowsArray();
  // v1.5: o atalho "resultados atrasados" do Início chega aqui como filtro de situação
  if(filtrosCt.somentePendentes){ filtrosCt.somentePendentes = false; filtrosCt.situacao = "pendentes"; }
  var cont = {}; CT_SITUACOES.forEach(function(s){ cont[s.key] = rows.filter(s.teste).length; });
  var unicos = function(campo){ return Array.from(new Set(rows.map(function(r){ return r[campo]||""; }).filter(Boolean))).sort(); };

  // v1.19: menos filtros — os 4 cartões são a escolha principal; o resto fica em "Mais filtros"
  var cartaoSit = function(k, tom, rot, sub){
    return '<button type="button" class="dash-kpi-card tone-'+tom+'" data-ct-sit="'+k+'" aria-pressed="'+(filtrosCt.situacao===k)+'"><div class="n">'+cont[k]+'</div><div class="l">'+rot+'</div><div class="d">'+sub+'</div></button>';
  };
  var kpis = '<div class="dash-kpis ct-sits">'
    + cartaoSit("pendentes", "nc", "Pendentes", "resultado atrasado ou abaixo do fck")
    + cartaoSit("decidir", "pendente", "Você decide", "têm justificativa: concluir ou não")
    + cartaoSit("semana", "info", "Romper em 7 dias", "programe o laboratório")
    + cartaoSit("concluidas", "ok", "Concluídas", "inclui as que bateram aos 28 e aguardam 63")
  + '</div>'
  + (filtrosCt.situacao!=="todos" ? '<div class="ct-sit-atual">Mostrando: <b>'+escapeHtml((CT_SITUACOES.find(function(x){ return x.key===filtrosCt.situacao; })||{}).label||"")+'</b> · <button type="button" class="linkish" data-ct-sit="todos">ver todas as '+rows.length+'</button></div>' : '');

  var acoes = '<div class="ct-acoes">'
    + '<button class="btn primary" id="ct-btn-nova" type="button"><svg class="ti-i" data-i="plus"></svg>Lançar nota / resultado</button>'
    + '<button class="btn" id="ct-btn-importar" type="button"><svg class="ti-i" data-i="file"></svg>Importar planilha…</button>'
    + '<input type="file" id="ct-file-input" accept=".xlsx" hidden>'
    + '<button class="btn" id="ct-btn-exportar" type="button" title="Gera a planilha do Controle Tecnológico no mesmo layout da importada, com os dados do app"><svg class="ti-i" data-i="download"></svg>Exportar planilha</button>'
    + '<input type="file" id="ct-modelo-input" accept=".xlsx" hidden>'
    + '<button class="btn" id="ct-btn-cobrar" type="button" title="Monta a mensagem para o laboratório com os resultados atrasados"><svg class="ti-i" data-i="flask"></svg>Cobrar laboratório</button>'
    + '<div class="ct-acoes-info"><span>'+ctUltimoImportInfo()+'</span><div class="ct-import-msg" id="ct-import-msg"></div></div>'
  + '</div>';

  var opt = function(lista, sel, vazio){ return '<option value="">'+vazio+'</option>'+lista.map(function(v){ return '<option value="'+escapeHtml(v)+'"'+(v===sel?" selected":"")+'>'+escapeHtml(v)+'</option>'; }).join(""); };
  var maisAtivos = ["de","ate","concreteira","laboratorio"].filter(function(k){ return filtrosCt[k]; }).length
    + (["todos","pendentes","decidir","semana","concluidas"].indexOf(filtrosCt.situacao)===-1 ? 1 : 0);
  var filtros = '<div class="ct-filtros">'
    + '<div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      + '<input type="text" id="ct-f-busca" placeholder="Buscar NF, local, peça, observação…" value="'+escapeHtml(filtrosCt.busca)+'"></div>'
    + '<details class="ct-mais"'+(maisAtivos ? " open" : "")+'><summary>Mais filtros'+(maisAtivos ? " ("+maisAtivos+")" : "")+'</summary><div class="ct-mais-corpo">'
    + '<select id="ct-f-sit-extra" aria-label="Outras situações"><option value="">Outras situações…</option>'
      + CT_SITUACOES.filter(function(x){ return ["todos","pendentes","decidir","semana","concluidas"].indexOf(x.key)===-1; }).map(function(x){ return '<option value="'+x.key+'"'+(filtrosCt.situacao===x.key?" selected":"")+'>'+escapeHtml(x.label)+' ('+cont[x.key]+')</option>'; }).join("")+'</select>'
    + '<div class="ct-periodo"><input type="date" id="ct-f-de" value="'+escapeHtml(filtrosCt.de)+'" aria-label="Concretagem a partir de"><span>até</span><input type="date" id="ct-f-ate" value="'+escapeHtml(filtrosCt.ate)+'" aria-label="Concretagem até"></div>'
    + '<select id="ct-f-concreteira" aria-label="Concreteira">'+opt(unicos("concreteira"), filtrosCt.concreteira, "Todas as concreteiras")+'</select>'
    + '<select id="ct-f-laboratorio" aria-label="Laboratório">'+opt(unicos("laboratorio"), filtrosCt.laboratorio, "Todos os laboratórios")+'</select>'
    + '<div class="ct-visao" role="group" aria-label="Visualização">'
      + '<button type="button" class="chip" data-ct-visao="grupos" aria-pressed="'+(filtrosCt.visao!=="tabela")+'">Por data</button>'
      + '<button type="button" class="chip" data-ct-visao="tabela" aria-pressed="'+(filtrosCt.visao==="tabela")+'">Tabela</button>'
    + '</div>'
    + '</div></details>'
  + '</div>';

  container.innerHTML =
    '<div class="pav-header"><button class="btn" id="btn-voltar-ct">← Voltar</button><h2>Controle tecnológico</h2>'
      + '<span class="pav-total">'+rows.length+' nota(s) de concreto</span></div>'
    + '<p class="view-desc">Corpos de prova por nota fiscal (7, 28 e 63 dias). Importe a planilha do laboratório ou lance direto aqui; cada nota fica ligada à rastreabilidade da concretagem pela NF e pela data.</p>'
    + kpis + acoes + filtros
    + '<div id="ct-table-container"></div>';
  pintarIcones(container);

  document.getElementById("btn-voltar-ct").addEventListener("click", hideViewCt);
  var fileInput = document.getElementById("ct-file-input");
  document.getElementById("ct-btn-importar").addEventListener("click", function(){ fileInput.click(); });
  fileInput.addEventListener("change", function(e){
    var f = e.target.files && e.target.files[0];
    if(f) ctImportarArquivo(f);
    fileInput.value = "";
  });
  document.getElementById("ct-btn-nova").addEventListener("click", function(){ abrirFichaNf(null); });
  document.getElementById("ct-btn-exportar").addEventListener("click", function(){ ctExportarPlanilha(null); });
  document.getElementById("ct-btn-cobrar").addEventListener("click", ctAbrirCobranca);
  var modeloInput = document.getElementById("ct-modelo-input");
  modeloInput.addEventListener("change", function(e){
    var f = e.target.files && e.target.files[0];
    modeloInput.value = "";
    if(f) ctExportarPlanilha(f);
  });
  document.getElementById("ct-f-busca").addEventListener("input", function(e){ filtrosCt.busca = e.target.value; renderCtTable(); });
  [["ct-f-de","de"],["ct-f-ate","ate"],["ct-f-concreteira","concreteira"],["ct-f-laboratorio","laboratorio"]].forEach(function(p){
    document.getElementById(p[0]).addEventListener("change", function(e){ filtrosCt[p[1]] = e.target.value; renderCtTable(); });
  });
  document.getElementById("ct-f-sit-extra").addEventListener("change", function(e){ filtrosCt.situacao = e.target.value || "todos"; renderViewCt(); });
  container.querySelectorAll("[data-ct-sit]").forEach(function(b){
    b.addEventListener("click", function(){ filtrosCt.situacao = b.getAttribute("data-ct-sit"); renderViewCt(); });
  });
  container.querySelectorAll("[data-ct-visao]").forEach(function(b){
    b.addEventListener("click", function(){ filtrosCt.visao = b.getAttribute("data-ct-visao"); renderViewCt(); });
  });
  renderCtTable();
}

/* ---- v1.5: na ficha de rastreabilidade, o CT de cada betonada (pela NF) ---- */
function ctPorNota(nota){
  var alvo = ctNormalizaNota(nota), achado = null;
  if(!alvo) return null;
  ctx.ctMap.forEach(function(r, id){ if(!achado && id!=="_meta" && r && ctNormalizaNota(r.notaRemessa)===alvo) achado = Object.assign({ _id:id }, r); });
  return ctComAnterior(achado);
}
function ctSecaoRastHtml(d, rastId){
  var linhas = (d.linhas||[]);
  if(!linhas.some(function(l){ return String(l.notaFiscal||"").trim(); })) return "";
  var itens = linhas.map(function(l, idx){
    if(!String(l.notaFiscal||"").trim()) return "";
    var c = ctPorNota(l.notaFiscal);
    if(!c && rastId){ ctx.ctMap.forEach(function(r, id){ if(!c && r && r.rastreabilidadeId===rastId && ctNormalizaNota(r.notaRemessa)===ctNormalizaNota(l.notaFiscal)) c = Object.assign({ _id:id }, r); }); }
    var cab = '<b>BT '+escapeHtml(l.seq)+'</b> · NF '+escapeHtml(l.notaFiscal);
    if(!c) return '<div class="ct-bt"><div class="ct-bt-id">'+cab+'<small>NF não encontrada no controle tecnológico — confira se está igual à nota de remessa da planilha</small></div>'
      + '<button type="button" class="btn small" data-ct-lancar="'+idx+'">Lançar no controle tecnológico</button></div>';
    return '<div class="ct-bt" data-ct-nf="'+escapeHtml(c._id)+'" title="Abrir a ficha desta NF"><div class="ct-bt-id">'+cab
      + (ctAbaixoFck(c) ? (ctJustificada(c) ? ' <span class="ct-selo atraso">abaixo do fck · justificado</span>' : ' <span class="ct-selo abaixo">abaixo do fck · sem justificativa</span>') : (ctTemPendencia(c) ? ' <span class="ct-selo atraso">resultado atrasado</span>' : ''))
      + '<small>fck '+escapeHtml(c.fck==null?"—":c.fck)+' MPa</small></div>'
      + '<div class="ct-idades">'+CT_IDADES.map(function(i){ return ctChipIdade(c, i); }).join("")+'</div></div>';
  }).join("");
  return '<fieldset><legend>Controle tecnológico das notas <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— resultados dos CPs de cada BT, pela nota fiscal</span></legend>'
    + '<div class="ct-bts">'+itens+'</div></fieldset>';
}

/* ---- v1.5: visão agrupada por data de concretagem ---- */
// v1.22: verde só quando o resultado atingiu o fck especificado (igual ou acima)
function ctAtingiuFck(row, idade){
  var fck = ctNumero(row.fck);
  if(fck==null) return false;
  var melhor = null;
  idade.campos.forEach(function(c){ var n = ctNumero(row[c]); if(n!=null && (melhor==null || n>melhor)) melhor = n; });
  return melhor!=null && melhor >= fck;
}
function ctChipIdade(row, idade){
  var st = ctStatusIdade(row, idade);
  var vals = idade.campos.map(function(c){ return row[c]; }).filter(ctValorPreenchido);
  var txt = vals.length ? vals.map(function(v){ var n = ctNumero(v); return n!=null ? String(n).replace(".", ",") : String(v); }).join(" / ")
    : (row[idade.dataCampo] ? fmtDateBR(row[idade.dataCampo]).slice(0,5) : "—");
  var tom = st==="concluido" ? (ctAtingiuFck(row, idade) ? "ok" : "resultado") : (st==="pendente" ? "atraso" : (st==="aguardando" ? "espera" : "nada"));
  // v1.16: vermelho na idade (28 ou 63) que ficou abaixo do fck; amarelo se já justificada
  var sitC = ctSituacao(row);
  if(sitC!=="anterior" && ctAbaixoEm(row).indexOf(idade.key)!==-1) tom = sitC==="abaixo" ? "abaixo" : "recuperou";
  return '<span class="ct-idade '+tom+'" title="'+idade.key+' dias: '+escapeHtml(st)+'"><i>'+idade.key+'d</i><b>'+escapeHtml(txt)+'</b></span>';
}
function renderCtGrupos(el, visiveis){
  var grupos = [], porData = {};
  visiveis.forEach(function(r){
    var d = r.dataConcretagem || "";
    if(!porData[d]){ porData[d] = { data:d, linhas:[] }; grupos.push(porData[d]); }
    porData[d].linhas.push(r);
  });
  el.innerHTML = grupos.map(function(g){
    var vol = g.linhas.reduce(function(s,r){ return s + (ctNumero(r.volume)||0); }, 0);
    var concreteiras = Array.from(new Set(g.linhas.map(function(r){ return r.concreteira; }).filter(Boolean))).join(", ");
    var rasts = [];
    ctx.rastMap.forEach(function(r, id){ if(g.data && r.data===g.data) rasts.push({ id:id, r:r }); });
    var dia = g.data ? new Date(g.data+"T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit", year:"numeric" }) : "Sem data de concretagem";
    return '<div class="ct-grupo">'
      + '<div class="ct-grupo-h"><div><b>'+escapeHtml(dia)+'</b><small>'+g.linhas.length+' nota(s)'+(vol? ' · '+String(Math.round(vol*10)/10).replace(".", ",")+' m³' : '')+(concreteiras? ' · '+escapeHtml(concreteiras) : '')+'</small></div>'
        + '<div class="ct-grupo-rast">'+(rasts.length
            ? rasts.map(function(x){ return '<button type="button" class="ct-rast-link" data-open-rast="'+escapeHtml(x.id)+'"><svg class="ti-i" data-i="truck"></svg>Rastreabilidade · '+escapeHtml(x.r.blocoPav||(x.r.pavimentos||[])[0]||"abrir")+'</button>'; }).join("")
            : '<span class="ct-sem-vinculo">sem rastreabilidade neste dia</span>')+'</div></div>'
      + g.linhas.map(function(r){
          var lig = ctLigacoes(r);
          var selo = lig.confirmadas.length ? '<span class="ct-selo ok" title="NF encontrada numa rastreabilidade">NF ✓</span>'
            : (lig.mesmoDia.length ? '<span class="ct-selo meio" title="Há rastreabilidade no mesmo dia, mas sem esta NF">NF ?</span>' : '<span class="ct-selo nada" title="Nenhuma rastreabilidade com esta NF">sem vínculo</span>');
          var feita = ctConcluidaRegra(r), sit = ctSituacao(r);
          return '<div class="ct-linha'+(feita?" concluida":"")+'" data-ct-abrir="'+escapeHtml(r._id)+'">'
            + '<div class="ct-linha-id"><b>NF '+escapeHtml(r.notaRemessa)+'</b> '+selo+(feita ? ' <span class="ct-selo ok">concluída</span>' : '')+'<small>'+escapeHtml(r.local||"(sem local)")+'</small>'
              + '<small class="ct-linha-meta">fck '+escapeHtml(r.fck==null?"—":r.fck)+' · slump '+escapeHtml(r.slump==null?"—":r.slump)+(r.volume!=null? ' · '+escapeHtml(r.volume)+' m³' : '')+(r.origem==="site"?' · lançada no site':'')+(ctAnterior(r)?' · anterior ao sistema':'')+'</small>'
              + (r.observacao ? '<small class="ct-linha-obs">Obs.: '+escapeHtml(r.observacao)+'</small>' : '')+'</div>'
            + '<div class="ct-idades">'+CT_IDADES.map(function(i){ return ctChipIdade(r, i); }).join("")+'</div>'
            // concluída pela planilha ("Concluído") ou anterior ao sistema: sem botão (vem dos dados)
            // v1.18: anterior / concluída na planilha / bateu aos 28 vêm dos dados (sem botão);
            // "você decide" e "abaixo do fck" ficam com o botão para o dono concluir
            + (sit==="anterior" ? '<span class="ct-selo ok">anterior ao sistema</span>'
              : (sit==="concluida" && r.concluida!==true) ? '<span class="ct-selo ok">'+(/CONCLU/i.test(r.observacao||"") ? "concluída na planilha" : "28 e 63 dias ok")+'</span>'
              : sit==="ok28" ? '<span class="ct-selo ok" title="Bateu o fck aos 28 dias — conta como concluída; falta o resultado de 63 dias">ok aos 28 · aguarda 63</span>'
              : (sit==="decidir" ? '<span class="ct-selo atraso" title="Tem justificativa: conclua ou deixe em aberto">você decide</span> '
                : sit==="abaixo" ? '<span class="ct-selo abaixo" title="Abaixo do fck: informe a causa e a resolução na ficha">abaixo do fck</span> ' : '')
                + '<button type="button" class="btn small ct-concluir" data-ct-concluir="'+escapeHtml(r._id)+'" title="'+(feita?"Reabrir esta nota":"Marcar esta nota como concluída (as próximas planilhas não alteram mais esta nota)")+'">'+(feita?"Reabrir":"✓ Concluir")+'</button>')
          + '</div>';
        }).join("")
    + '</div>';
  }).join("");
  pintarIcones(el);
  el.querySelectorAll("[data-open-rast]").forEach(function(btn){
    btn.addEventListener("click", function(e){ e.stopPropagation(); ctx.openModal("rast", btn.getAttribute("data-open-rast")); });
  });
  el.querySelectorAll("[data-ct-concluir]").forEach(function(b){
    b.addEventListener("click", function(e){
      e.stopPropagation();
      var id = b.getAttribute("data-ct-concluir"), r = ctComAnterior(ctx.ctMap.get(id) || {});
      if(r.concluida!==true){
        var imp = ctImpedimentosConcluir(r);
        if(imp.length){ alert("A NF "+(r.notaRemessa||"")+" ainda não pode ser concluída: "+imp.join("; ")+"."); return; }
        if(!confirm("Concluir a NF "+(r.notaRemessa||"")+"?\n\nDepois de concluída, as próximas planilhas importadas não alteram mais esta nota.")) return;
      }
      ctGravarLote([{ id:id, dados:{ concluida: r.concluida!==true } }], b);
    });
  });
  el.querySelectorAll("[data-ct-abrir]").forEach(function(div){
    div.addEventListener("click", function(){ abrirFichaNf(div.getAttribute("data-ct-abrir")); });
  });
}

/* ---- v1.5: ficha da NF — lançar/editar pelo site e ligar à rastreabilidade ---- */
var CT_CAMPOS_FICHA = [
  ["notaRemessa","Nota fiscal (remessa)","text"], ["dataConcretagem","Data da concretagem","date"],
  ["local","Local / peças","text"], ["volume","Volume (m³)","num"], ["fck","fck (MPa)","num"], ["slump","Slump (cm)","num"],
  ["numCps","Nº de CPs","num"], ["concreteira","Concreteira","text"], ["laboratorio","Laboratório","text"]
];
// v1.32: só 7, 28 e 63 dias (3 e 14 ficam na planilha, intocados)
var CT_CAMPOS_RESULT = [["r7","7 dias"],["r7b","7' dias"],["r28","28 dias"],["r28b","28' dias"],["r63","63 dias"],["r63b","63' dias"]];
// padrao: dados para pré-preencher uma nota NOVA (ex.: vindos da betonada)
function abrirFichaNf(id, padrao){
  var atual = id ? ctx.ctMap.get(id) : null;
  var d = Object.assign({}, atual ? ctComAnterior(atual) : Object.assign({ dataConcretagem: todayISO() }, padrao||{}));
  var novo = !atual;
  var ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  var lig = novo ? { confirmadas:[], mesmoDia:[] } : ctLigacoes(Object.assign({ _id:id }, d));
  var listaRast = function(ids, rotulo){
    if(!ids.length) return "";
    return '<div class="ct-lig"><span>'+rotulo+'</span>'+ids.map(function(rid){
      var r = ctx.rastMap.get(rid);
      return '<button type="button" class="ct-rast-link" data-ct-rast="'+escapeHtml(rid)+'"><svg class="ti-i" data-i="truck"></svg>'+escapeHtml(rastRotulo(r))+'</button>';
    }).join("")+'</div>';
  };
  // v1.18: a nota de remessa tem que ser IGUAL à NF da betonada. O vínculo
  // manual agora é com uma BT: ao salvar, a NF daquela BT passa a ser a desta
  // nota. Aparecem só as BTs com NF em branco ou que não batem com nenhuma
  // nota do controle tecnológico (as da mesma data primeiro).
  var notasCt = {};
  ctx.ctMap.forEach(function(r, cid){ if(cid!=="_meta" && r && r.notaRemessa) notasCt[ctNormalizaNota(r.notaRemessa)] = 1; });
  var opcoesBt = [];
  ctx.rastMap.forEach(function(r, rid){
    (r.linhas||[]).forEach(function(l, idx){
      var nfL = ctNormalizaNota(l.notaFiscal);
      if(nfL && notasCt[nfL]) return;
      opcoesBt.push({ v:rid+"|"+idx, data:r.data||"", mesmoDia: !!(d.dataConcretagem && r.data===d.dataConcretagem),
        t:rastRotulo(r)+" · BT "+(l.seq||idx+1)+" · NF digitada: "+(String(l.notaFiscal||"").trim() || "em branco") });
    });
  });
  opcoesBt.sort(function(a,b){ return (b.mesmoDia-a.mesmoDia) || b.data.localeCompare(a.data); });
  opcoesBt = opcoesBt.slice(0, 120);
  var vincAntigo = d.rastreabilidadeId && ctx.rastMap.has(d.rastreabilidadeId) && lig.porNota.indexOf(d.rastreabilidadeId)===-1;
  var campo = function(c){
    var v = d[c[0]]; var ro = (c[0]==="notaRemessa" && !novo);
    return '<div class="field"><label>'+c[1]+'</label><input data-ctf="'+c[0]+'" type="'+(c[2]==="date"?"date":"text")+'"'+(c[2]==="num"?' inputmode="decimal"':'')
      +' value="'+escapeHtml(v==null?"":String(v).replace(/^(-?\d+)\.(\d+)$/, "$1,$2"))+'"'+(ro?' readonly title="A NF identifica a nota; para corrigir, lance uma nova."':'')+'></div>';
  };
  ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true">'
    + '<div class="modal-head"><h2>'+(novo ? "Nova nota de concreto" : "NF "+escapeHtml(d.notaRemessa))+'</h2><button class="close-x" data-ct-fechar aria-label="Fechar">✕</button></div>'
    + '<div class="modal-body">'
      + (novo ? '' : '<fieldset><legend>Rastreabilidade ligada</legend>'
          + (listaRast(lig.confirmadas, "Esta NF está em:") || '<div class="hint">Esta NF ainda não aparece em nenhuma rastreabilidade.</div>')
          + listaRast(lig.mesmoDia, "Concretagens do mesmo dia:")
          + (vincAntigo ? '<div class="hint">Vínculo manual antigo com '+escapeHtml(rastRotulo(ctx.rastMap.get(d.rastreabilidadeId)))+', mas a NF não está igual em nenhuma BT. Escolha a BT abaixo para igualar.</div>' : '')
          + (lig.porNota.length ? '' : '<div class="field" style="margin-top:10px"><label>Qual BT é esta nota? (a NF da BT passa a ser '+escapeHtml(d.notaRemessa)+')</label><select data-ctf="vinculoBt"><option value="">— escolher a betonada —</option>'
            + opcoesBt.map(function(x){ return '<option value="'+escapeHtml(x.v)+'">'+(x.mesmoDia?"★ ":"")+escapeHtml(x.t)+'</option>'; }).join("")
          + '</select><small class="hint">★ = concretagem do mesmo dia da nota.</small></div>')
          + '<label class="ct-anterior"><input type="checkbox" data-ctf-chk="anteriorAoSistema"'+(d.anteriorAoSistema===true?" checked":"")+'> Concretagem anterior ao sistema — não há rastreabilidade no app para ligar</label></fieldset>')
      + (novo ? '' : '<label class="ct-concluida-chk"><input type="checkbox" data-ctf-chk="concluida"'+(d.concluida===true?" checked":"")+'> <b>Nota concluída</b> — você decide; depois de concluída, as próximas planilhas importadas não alteram mais esta nota'
          + (d.concluida!==true && /CONCLU/i.test(d.observacao||"") ? ' <small>(a observação já diz “concluído”)</small>' : '')+'</label>')
      + '<fieldset><legend>Dados da nota</legend><div class="grid3">'+CT_CAMPOS_FICHA.map(campo).join("")+'</div></fieldset>'
      + '<fieldset><legend>Datas de rompimento</legend><div class="grid3">'
        + CT_IDADES.map(function(i){ return '<div class="field"><label>'+i.key+' dias</label><input type="date" data-ctf="'+i.dataCampo+'" value="'+escapeHtml(d[i.dataCampo]||"")+'"></div>'; }).join("")
        + '</div><button type="button" class="btn small" data-ct-recalc>Calcular datas a partir da concretagem</button></fieldset>'
      + '<fieldset><legend>Resultados (MPa)</legend><div class="ct-res-grid">'
        + CT_CAMPOS_RESULT.map(function(c){ var v=d[c[0]]; return '<div class="field"><label>'+c[1]+'</label><input data-ctf="'+c[0]+'" inputmode="decimal" value="'+escapeHtml(v==null?"":String(v).replace(/^(-?\d+)\.(\d+)$/, "$1,$2"))+'"></div>'; }).join("")
        + '</div><div class="grid2"><div class="field"><label>CPs conformes</label><input data-ctf="cpsConforme" inputmode="numeric" value="'+escapeHtml(d.cpsConforme==null?"":d.cpsConforme)+'"></div>'
        + '<div class="field"><label>Observação</label><input data-ctf="observacao" value="'+escapeHtml(d.observacao||"")+'" placeholder="ex.: CONCLUÍDO"></div></div>'
        + '<div class="ct-aviso-fck" data-ct-aviso hidden></div></fieldset>'
      // v1.16: resultado abaixo do fck aos 28 ou 63 dias → causa e resolução obrigatórias
      + '<fieldset class="ct-just" data-ct-just hidden><legend>Justificativa do resultado abaixo do fck (obrigatória)</legend>'
        + '<div class="field"><label>Causa</label><textarea data-ctf="justCausa" rows="2" placeholder="ex.: cura deficiente nas primeiras 24 h; CP danificado no transporte…">'+escapeHtml((d.justificativaFck||{}).causa||"")+'</textarea></div>'
        + '<div class="field"><label>Resolução tomada</label><textarea data-ctf="justResolucao" rows="2" placeholder="ex.: extração de testemunhos, laudo do projetista liberando a peça…">'+escapeHtml((d.justificativaFck||{}).resolucao||"")+'</textarea></div>'
        + ((d.justificativaFck||{}).em ? '<div class="hint">Registrada por '+escapeHtml(d.justificativaFck.por||"")+' em '+escapeHtml(fmtDateTimeBR(d.justificativaFck.em))+'.</div>' : '')
      + '</fieldset>'
      + (atual && atual.atualizadoEm ? '<div class="last-updated">Última atualização: '+escapeHtml(atual.atualizadoPor||"")+' às '+fmtDateTimeBR(atual.atualizadoEm)+'</div>' : '')
    + '</div>'
    + '<div class="modal-foot"><div></div><div style="display:flex;gap:10px;"><button class="btn" data-ct-fechar>Cancelar</button><button class="btn primary" data-ct-salvar>Salvar</button></div></div>'
  + '</div>';
  document.body.appendChild(ov);
  pintarIcones(ov);
  document.body.style.overflow = "hidden";
  var ler = function(c){ var el = ov.querySelector('[data-ctf="'+c+'"]'); return el ? el.value.trim() : undefined; };
  var atualizarAviso = function(){
    var tmp = { fck: ler("fck"), r28: ler("r28"), r28b: ler("r28b") };
    var av = ov.querySelector("[data-ct-aviso]");
    tmp.r63 = ler("r63"); tmp.r63b = ler("r63b");
    var ab = ctAbaixoEm(tmp);
    tmp.observacao = ler("observacao");
    ov.querySelector("[data-ct-just]").hidden = !ab.length;
    if(ab.length && ctObsJustificativa(tmp)){
      // v1.17: a justificativa já veio na coluna Observação da planilha
      av.hidden = false; av.className = "ct-aviso-fck leve";
      av.textContent = "Abaixo do fck aos "+ab.join(" e ")+" dias — justificado na observação: “"+ctObsJustificativa(tmp)+"”.";
    } else if(ab.length){
      av.hidden = false; av.className = "ct-aviso-fck";
      av.textContent = "⚠ Abaixo do fck ("+tmp.fck+" MPa) aos "+ab.map(function(i){ return i+" dias ("+String(i==="28" ? ctMelhor28(tmp) : ctMelhor63(tmp)).replace(".", ",")+" MPa)"; }).join(" e ")
        +". Informe abaixo a causa e a resolução tomada"+(ab[0]==="28" && ab.length===1 ? " — mesmo atingindo aos 63 dias" : "")+".";
    } else av.hidden = true;
  };
  ov.addEventListener("input", atualizarAviso); atualizarAviso();
  var sujo = false; ov.addEventListener("input", function(){ sujo = true; });
  var fechar = function(){ if(sujo && !confirm("Descartar as alterações desta nota?")) return; ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", esc); };
  var esc = function(e){ if(e.key==="Escape") fechar(); };
  document.addEventListener("keydown", esc);
  ov.addEventListener("click", function(e){
    if(e.target===ov || e.target.closest("[data-ct-fechar]")) { fechar(); return; }
    var rb = e.target.closest("[data-ct-rast]");
    if(rb){ var rid = rb.getAttribute("data-ct-rast"); sujo = false; fechar(); ctx.openModal("rast", rid); return; }
    if(e.target.closest("[data-ct-recalc]")){
      var base = ler("dataConcretagem");
      if(!base){ alert("Preencha a data da concretagem primeiro."); return; }
      CT_IDADES.forEach(function(i){ ov.querySelector('[data-ctf="'+i.dataCampo+'"]').value = ctSomarDias(base, parseInt(i.key,10)); });
      sujo = true; return;
    }
    var sb = e.target.closest("[data-ct-salvar]");
    if(sb) salvarFichaNf(ov, id, novo, d, ler, sb, function(){ sujo = false; fechar(); });
  });
}
async function salvarFichaNf(ov, id, novo, d, ler, botao, aoTerminar){
  var nota = ler("notaRemessa");
  if(novo){
    if(!nota){ alert("Informe a nota fiscal."); return; }
    id = "nf_"+safeName(nota);
    if(ctx.ctMap.has(id)){ alert("A NF "+nota+" já está cadastrada. Ela será aberta para edição."); aoTerminar(); abrirFichaNf(id); return; }
    // Datas de rompimento vazias: calcula sozinho a partir da concretagem.
    var base = ler("dataConcretagem");
    CT_IDADES.forEach(function(i){ var el = ov.querySelector('[data-ctf="'+i.dataCampo+'"]'); if(base && !el.value) el.value = ctSomarDias(base, parseInt(i.key,10)); });
  }
  var dados = {};
  CT_CAMPOS_FICHA.forEach(function(c){ var v = ler(c[0]); dados[c[0]] = c[2]==="num" ? ctNumero(v) : (v||""); });
  CT_IDADES.forEach(function(i){ dados[i.dataCampo] = ler(i.dataCampo) || ""; });
  CT_CAMPOS_RESULT.forEach(function(c){ var v = ler(c[0]); var n = ctNumero(v); dados[c[0]] = v==="" ? null : (n!=null ? n : v); });
  dados.cpsConforme = ctNumero(ler("cpsConforme"));
  dados.observacao = ler("observacao") || "";
  var vincBt = novo ? "" : (ler("vinculoBt") || "");
  var chkAnt = ov.querySelector('[data-ctf-chk="anteriorAoSistema"]');
  if(chkAnt) dados.anteriorAoSistema = chkAnt.checked;
  // v1.16: justificativa (causa + resolução) do resultado abaixo do fck
  var jc = ler("justCausa")||"", jr = ler("justResolucao")||"", jAnt = d.justificativaFck || {};
  if(jc || jr || jAnt.causa || jAnt.resolucao){
    dados.justificativaFck = { causa:jc, resolucao:jr,
      em: (jc===(jAnt.causa||"") && jr===(jAnt.resolucao||"") && jAnt.em) ? jAnt.em : nowISO(),
      por: (jc===(jAnt.causa||"") && jr===(jAnt.resolucao||"") && jAnt.por) ? jAnt.por : (ctx.currentUserEmail||"") };
  }
  var chkConc = ov.querySelector('[data-ctf-chk="concluida"]');
  if(chkConc) dados.concluida = chkConc.checked;
  // v1.16: só conclui com 28 e 63 dias lançados e, se abaixo do fck, com a justificativa
  if(dados.concluida===true && d.concluida!==true){
    var imp = ctImpedimentosConcluir(Object.assign({}, d, dados));
    if(imp.length){ alert("Ainda não dá para marcar a nota como concluída: "+imp.join("; ")+"."); return; }
  }
  dados.notaRemessa = novo ? nota : d.notaRemessa;
  // v1.18: vínculo com uma BT → a NF da betonada passa a ser igual à desta nota
  if(vincBt){
    var pv = vincBt.split("|"), rRast = ctx.rastMap.get(pv[0]), iBt = Number(pv[1]);
    if(rRast && rRast.linhas && rRast.linhas[iBt]){
      var linhasR = JSON.parse(JSON.stringify(rRast.linhas)), antigaNf = String(linhasR[iBt].notaFiscal||"").trim();
      if(antigaNf && !confirm("A BT "+(linhasR[iBt].seq||iBt+1)+" está com a NF "+antigaNf+". Trocar para "+dados.notaRemessa+"?")) return;
      if(antigaNf) linhasR[iBt].nfAnterior = antigaNf;
      linhasR[iBt].notaFiscal = String(dados.notaRemessa);
      try{ ctx.rastCol.doc(pv[0]).set({ linhas:linhasR, updatedAt:nowISO(), updatedByEmail:ctx.currentUserEmail||"" }, { merge:true }); }
      catch(exR){ console.error(exR); alert("Não foi possível corrigir a NF na rastreabilidade: "+(exR && exR.message ? exR.message : "erro")); return; }
      dados.rastreabilidadeId = pv[0];
    }
  }
  dados.atualizadoEm = nowISO(); dados.atualizadoPor = ctx.currentUserEmail||""; dados.editadoNoSite = true;
  if(novo){ dados.criadoEm = nowISO(); dados.origem = "site"; }
  botao.disabled = true; botao.textContent = "Salvando…";
  try{
    var envio = ctx.ctCol.doc(id).set(dados, { merge:true });
    var r = await Promise.race([envio.then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
    if(r==="pendente") alert("Sem conexão no momento — a nota será enviada automaticamente quando o sinal voltar. Mantenha o app aberto.");
    aoTerminar();
  }catch(ex){
    console.error(ex);
    alert("Não foi possível salvar a nota: "+(ex && ex.message ? ex.message : "erro desconhecido"));
    botao.disabled = false; botao.textContent = "Salvar";
  }
}
function showViewCt(){ ctx.switchView("ct"); }
function hideViewCt(){ ctx.switchView("dashboard"); }

export { CT_IDADES, abrirFichaNf, ctAbaixoFck, ctAnterior, ctIdadesPendentes, ctLimparInicio, ctMelhor28, ctMelhor63, ctNumero, ctPendente, ctRomperEmBreve, ctRowsArray, ctSecaoRastHtml, ctSituacao, ctSomarDias, ctStatusIdade, ctTemPendencia, filtrosCt, renderViewCt, showViewCt };
