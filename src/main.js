/* Traço Integrado — ponto de entrada (Vite).
   Etapa 2.1 (v1.2): o código da v1.1 roda aqui SEM mudança de comportamento.
   O que mudou é só a embalagem: CSS em arquivo próprio, logos e modelos
   Excel como arquivos (baixados só quando usados) e bibliotecas pesadas
   (Excel, ZIP, PDF) carregadas sob demanda — ver ./libs.js.
   Os blocos abaixo serão divididos em módulos (src/modulos/...) aos poucos,
   conforme cada área for sendo mexida nas próximas etapas. */
import "./estilos/app.css";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import { instalarPorteiro, dadosExclusao, ativo } from "./modulos/dados/porteiro.js";
import { escutarColecao } from "./modulos/dados/sincronia.js";
import { iniciarEquipe, renderViewEquipe, perfilDe as perfilDaEquipe, soVisualiza, cadastroDe, recebemTarefas } from "./modulos/dados/equipe.js";
import { iniciarTelasDados, renderViewHistorico, renderViewLixeira, verHistoricoDe } from "./modulos/dados/telas-dados.js";
import { DEFAULT_OBRA, FVS_CHECKLIST, FVS_ELEMENTOS, FVS_TIPOS, TEMPO_MAX_MIN, getFvsTipo } from "./modulos/fvs/catalogo.js";
import { diffMin, dowBR, escapeHtml, fmtDateBR, fmtDateTimeBR, fmtMin, lastUpdatedHtml, nowISO, rastRotulo, todayISO } from "./modulos/comum/formatos.js";
import { safeName, triggerDownload } from "./modulos/exportar/xlsx-xml.js";
import { assinaturaDoPapel, exportFvsXlsx, exportRastXlsx, iniciarModelosExcel } from "./modulos/exportar/modelos-excel.js";
import { gerarRelatorioNcWord, iniciarRelatorioWord } from "./modulos/nc/relatorio-word.js";
import { CT_IDADES, abrirFichaNf, ctAbaixoFck, ctAbaixoMapa, ctPlantaDaNotaHtml, ctDesenharPlantasDaNota, ctPorNota, ctAnterior, ctIdadesPendentes, ctLimparInicio, ctMelhor28, ctMelhor63, ctNumero, ctPendente, ctRomperEmBreve, ctRowsArray, ctSecaoRastHtml, ctSituacao, ctSomarDias, ctStatusIdade, ctTemPendencia, filtrosCt, iniciarTelaCt, renderViewCt, showViewCt } from "./modulos/ct/tela-ct.js";
import { garantirLibs, garantirPdf, carregarModelo } from "./libs.js";
import { preencherPlanilhaCt } from "./modulos/ct/planilha-ct.js";
import { situacao as ctSituacaoRegra, emAberto as ctEmAbertoRegra, observacaoExportada as ctObsExportada, anterior as ctAnteriorRegra, obsJustificativa as ctObsJustificativa, concluida as ctConcluidaRegra, anterioresAoSistema as ctAnterioresAoSistema, precisaJustificativa as ctPrecisaJust, abaixoEm as ctAbaixoEm, justificada as ctJustificada, justificativaPendente as ctJustPendente, impedimentosConcluir as ctImpedimentosConcluir, observacaoComJustificativa as ctObsComJustificativa } from "./modulos/ct/regras-ct.js";
import { abrirEditorMapa } from "./modulos/rastreabilidade/editor-mapa.js";
import { lerPecasDaPagina, pecasNaArea } from "./modulos/rastreabilidade/pecas-planta.js";
import { initLayout, definirUsuario, definirContador } from "./ui/layout.js";
import { initBusca } from "./ui/busca.js";
import { pintarIcones } from "./ui/icones.js";
import { corteHtml, corteEtapaHtml } from "./modulos/obra/corte-predio.js";
import { situacaoNivel, topoEtapa, fvsPedidas } from "./modulos/cronograma/etapas.js";
import { rotuloSvg, rotuloCanvas, planejarRotulos, coresDistintas } from "./modulos/rastreabilidade/rotulo-mapa.js";
import { semRepetidas as pecasSemRepetidas, pecasRepetidas, repetidasNoTexto as pecasRepetidasNoTexto } from "./modulos/rastreabilidade/pecas.js";
import { PAPEIS as PAPEIS_ASSIN, abrirCadastroAssinatura, assinaturasHtml } from "./modulos/assinatura/assinatura.js";
import { lerPendencias, sugerirFvs, norm as normNc } from "./modulos/nc/pendencias.js";
import { iniciarDesforma, abrirDesforma } from "./modulos/nc/desforma.js";
import { adicionarAssinaturasXlsx, centralizarImagemNaCaixa } from "./modulos/assinatura/xlsx-assinatura.js";
import { initAco, renderViewAco, proximasEntregas, situacao as acoSituacao, pesoTotal as acoPeso } from "./modulos/aco/aco.js";
import { acoParaLajes, textoAviso as acoTextoLaje, concretadasPorChave as acoConcretadasPorChave, chegouPelaConcretagem as acoChegouPelaConcretagem } from "./modulos/aco/aco-cronograma.js";
import { initCronograma, definirDocumento as definirCronograma, definirProgresso as definirProgressoCron, definirEtapasManuais, etapasDaObra, avancoObra, renderViewCronograma, metasDaSemana, estruturaPrevista, semanaDe, cronogramaCarregado as cronogramaAtual } from "./modulos/cronograma/cronograma.js";

// Mantido no escopo global para depuração e testes automatizados.
window.firebase = firebase;

/* ===== bloco 1 — inicialização do Firebase ===== */
firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var dbf = firebase.firestore();

/* v1.9: contas só de visualização (mesma lista de firestore.rules). As regras
   do banco são a garantia; aqui o app esconde os botões de edição e recusa
   qualquer gravação na hora, com aviso claro (sem isso, com o cache offline, a
   gravação "parecia" salva até o servidor recusar). */
var CONTAS_SOMENTE_LEITURA = ["jessica.araujo@sig.eng.br"];
var somenteLeitura = false;
// v1.30: como um registro está no aparelho antes de gravar (para o histórico
// anotar só os campos que mudaram). Definido no bloco 2, onde ficam os dados.
var buscarAnterior = null;
function ehSomenteLeitura(email){
  email = String(email||"").toLowerCase();
  // teste local: localStorage "traco-teste-leitura" = "1" simula a conta de visualização
  try{ if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem("traco-teste-leitura")==="1") return true; }catch(e){}
  return CONTAS_SOMENTE_LEITURA.indexOf(email) !== -1;
}
var ultimoAvisoLeitura = 0;
function recusarGravacao(){
  if(Date.now() - ultimoAvisoLeitura > 4000){
    ultimoAvisoLeitura = Date.now();
    setTimeout(function(){ alert("Seu acesso é somente para visualização — nada foi alterado."); }, 0);
  }
  var e = new Error("acesso somente para visualização"); e.code = "permission-denied";
  return Promise.reject(e);
}
/* v1.10: fila "aguardando envio". Toda gravação fica contada aqui até o
   servidor confirmar (sem sinal, a promessa do Firestore só resolve quando o
   sinal volta). O selo do topo mostra quantas faltam e o que são. */
var PENDENTES = { n:0, porTipo:{}, desde:0, enviadas:0 };
var NOMES_COLECAO = { fvs:"FVS", rastreabilidade:"rastreabilidade", controleTecnologico:"controle tecnológico", plantas:"planta",
  entregasAco:"entrega de aço", cronogramas:"cronograma", planilhasModelo:"modelo de planilha" };
function marcarPendente(tipo, delta){
  if(delta>0 && !PENDENTES.n){ PENDENTES.desde = Date.now(); PENDENTES.enviadas = 0; }
  PENDENTES.n = Math.max(0, PENDENTES.n + delta);
  PENDENTES.porTipo[tipo] = Math.max(0, (PENDENTES.porTipo[tipo]||0) + delta);
  if(!PENDENTES.porTipo[tipo]) delete PENDENTES.porTipo[tipo];
  if(delta<0) PENDENTES.enviadas++;
  try{ window.dispatchEvent(new CustomEvent("traco-pendentes")); }catch(e){}
}
// v1.28: o porteiro único (src/modulos/dados/porteiro.js) recebe TODA gravação:
// recusa a conta só de visualização, carimba quando/quem gravou e conta a fila.
instalarPorteiro(firebase.firestore, {
  somenteLeitura: function(){ return somenteLeitura; },
  recusar: recusarGravacao,
  email: function(){ return (auth.currentUser && auth.currentUser.email) || ""; },
  agora: function(){ return new Date().toISOString(); },
  pendente: marcarPendente,
  nomeTipo: function(col){ return NOMES_COLECAO[col] || col || "registro"; },
  // v1.30: histórico de alterações (auditoria/AAAA-MM-DD)
  db: function(){ return dbf; },
  anterior: function(col, id){ return buscarAnterior ? buscarAnterior(col, id) : null; }
});
// Rodando no próprio PC (http://localhost): usa os Firebase Emulators com uma
// CÓPIA dos dados, nunca o banco real. No site publicado isto não se aplica.
if(location.hostname==="localhost" || location.hostname==="127.0.0.1"){
  auth.useEmulator("http://127.0.0.1:9099");
  dbf.useEmulator("127.0.0.1", 8080);
}
// v1.6: cache local no aparelho (IndexedDB). Economiza leituras da cota grátis
// e deixa o app abrir mais rápido; também ajuda sem sinal. Se o navegador não
// suportar (ou houver outra aba sem cache), o app segue normal, sem cache.
dbf.enablePersistence({ synchronizeTabs: true }).catch(function(e){ console.warn("cache local indisponível:", e && e.code); });

/* ===== bloco 2 — aplicação ===== */
(function(){
  "use strict";
  // v1.29: liga os módulos separados do main.js ao estado do app (só leitura, sempre o valor atual)
  iniciarEquipe({ db: function(){ return dbf; }, equipe: function(){ return equipeMap; }, email: function(){ return currentUserEmail||""; },
    agora: function(){ return nowISO(); }, criarLogin: criarLogin });
  iniciarTelasDados({ db: function(){ return dbf; }, get todos(){ return todosPorColecao; }, get ctMap(){ return ctMap; }, get tarefasMap(){ return tarefasMap; },
    somenteLeitura: function(){ return somenteLeitura; }, email: function(){ return currentUserEmail||""; }, agora: function(){ return nowISO(); },
    switchView: function(v){ switchView(v); },
    abrir: function(col, id){
      if(col==="controleTecnologico"){ abrirFichaNf(id); return; }
      var tipo = col==="fvs" ? "fvs" : "rast", m = col==="fvs" ? fvsMap : rastMap;
      if(!m.has(id)){ alert("Este registro está na lixeira (ou ainda não chegou neste aparelho)."); return; }
      openModal(tipo, id);
    } });
  iniciarTelaCt({ get ctCol(){ return ctCol; }, get ctMap(){ return ctMap; }, get currentUserEmail(){ return currentUserEmail; }, get dbf(){ return dbf; }, get modelosCol(){ return modelosCol; }, get openModal(){ return openModal; }, get rastCol(){ return rastCol; }, get rastMap(){ return rastMap; }, get somenteLeitura(){ return somenteLeitura; }, get switchView(){ return switchView; } });
  iniciarModelosExcel({ get fichaNaoConformidades(){ return fichaNaoConformidades; } });
  iniciarDesforma({ get somenteLeitura(){ return somenteLeitura; }, get fvsMap(){ return fvsMap; }, get rastMap(){ return rastMap; }, get currentUserEmail(){ return currentUserEmail; },
    todayISO:function(){ return todayISO(); }, nowISO:function(){ return nowISO(); },
    pavimentosCompativeis:function(a, b){ return pavimentosCompativeis(a, b); }, pavimentosDaRast:function(r){ return pavimentosDaRast(r); },
    pavSelectsHtml:function(v, a, r){ return pavSelectsHtml(v, a, r); }, lerPavSelects:function(c, v){ return lerPavSelects(c, v); },
    fichaNaoConformidades:function(f){ return fichaNaoConformidades(f); }, ncGravarNaFicha:function(id, fn){ return ncGravarNaFicha(id, fn); },
    ncUploadAnexo:function(f){ return ncUploadAnexo(f); }, criarFvs04DaRast:function(r, n){ return criarFvs04DaRast(r, n); },
    aposAlterarFvs:function(id){ aposAlterarFvs(id); } });
  iniciarRelatorioWord({ get buildRelatorioNc(){ return buildRelatorioNc; }, get currentUserEmail(){ return currentUserEmail; }, get descricaoFiltrosNc(){ return descricaoFiltrosNc; }, get filtrosNc(){ return filtrosNc; }, get ncAnexoEhImagem(){ return ncAnexoEhImagem; } });

  // pdf.js precisa de um "worker" (script separado que faz o trabalho pesado
  // de decodificar o PDF fora da thread principal) — aponta pra mesma versão
  // carregada lá em cima. Só configura se a biblioteca carregou de verdade
  // (rede instável, adblock etc. podem impedir) — o resto do sistema
  // continua funcionando normalmente mesmo sem isso; só a demarcação na
  // planta do mapeamento de concretagem fica indisponível.
  if(window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  /* ---------------- anexos (fotos/documentos) das não conformidades ----------------
     Os anexos são enviados direto do navegador pra uma conta gratuita do
     Cloudinary (sem precisar de servidor nem de senha exposta no código —
     um "unsigned upload preset" é seguro de deixar aqui). Pra ativar:
       1. Crie uma conta grátis em https://cloudinary.com/users/register/free
       2. No painel, copie o "Cloud name" (aparece no topo do Dashboard) e
          cole abaixo em CLOUDINARY_CLOUD_NAME.
       3. Vá em Settings → Upload → "Upload presets" → "Add upload preset",
          troque "Signing Mode" para "Unsigned", salve, e cole o nome desse
          preset abaixo em CLOUDINARY_UPLOAD_PRESET.
     Removendo um anexo, ele só é desvinculado da ficha — o arquivo
     continua guardado no Cloudinary (o Cloudinary não deixa mais pedir um
     "delete token" em uploads sem assinatura/unsigned, então não dá pra
     apagar o arquivo de dentro do próprio sistema; no plano gratuito isso
     não chega a ser um problema de espaço na prática).
     Enquanto os valores abaixo continuarem como estão, o botão de anexo
     mostra um aviso explicando que falta configurar, em vez de tentar
     enviar o arquivo. */
  var CLOUDINARY_CLOUD_NAME = "uyzrizru";
  var CLOUDINARY_UPLOAD_PRESET = "Fotos FVS";
  function cloudinaryConfigurado(){
    return CLOUDINARY_CLOUD_NAME && CLOUDINARY_CLOUD_NAME.indexOf("SEU_")!==0
        && CLOUDINARY_UPLOAD_PRESET && CLOUDINARY_UPLOAD_PRESET.indexOf("SEU_")!==0;
  }


  // v1.4: número automático da FVS — sequência por código de ficha
  // (FVS 04: 001, 002…; FVS-03.9: 001…). Gerado ao salvar a ficha pela 1ª vez.
  function proximoNumeroFvs(codigo, ignorarId){
    var maior = 0;
    fvsMap.forEach(function(f, id){
      if(id===ignorarId || (f.codigo||"")!==(codigo||"")) return;
      var n = /^\d{1,5}$/.test(String(f.numero||"").trim()) ? parseInt(f.numero,10) : (f.numeroSeq||0);
      if(n>maior) maior = n;
    });
    var prox = maior+1;
    return { numero: (prox<1000 ? ("00"+prox).slice(-3) : String(prox)), seq: prox };
  }

  /* ---------------- state ---------------- */
  var fvsCol = dbf.collection("fvs");
  var rastCol = dbf.collection("rastreabilidade");
  var ctCol = dbf.collection("controleTecnologico");
  // v1.8: cópia da última planilha importada (modelo para exportar no mesmo layout).
  // Só é lida quando alguém exporta — não pesa na abertura do app.
  var modelosCol = dbf.collection("planilhasModelo");
  // Biblioteca de plantas de forma: cada planta é cadastrada uma única vez
  // aqui (comprimida, ver comprimirPlantaEmImagem) e depois só é escolhida
  // numa lista dentro de cada rastreabilidade (ver mapeamentoFieldHtml) —
  // em vez de subir um PDF pesado de novo a cada ficha, economizando a cota
  // do Cloudinary discutida com o Matheus.
  var plantasCol = dbf.collection("plantas");
  // v1.5: programação/recebimento de aço (ver src/modulos/aco/aco.js)
  var acoCol = dbf.collection("entregasAco");
  var acoMap = new Map(), acoErroAcesso = false, unsubAco = null;
  // v1.5: cronograma (ver src/modulos/cronograma/) — só o documento "atual" é escutado
  var cronCol = dbf.collection("cronogramas");
  var cronErroAcesso = false, unsubCron = null, unsubCronProg = null, unsubCronEtapas = null;
  // v1.15: assinatura eletrônica de cada pessoa (assinaturas/<uid>) e cópias das FVS antes de cada nova revisão
  var assinCol = dbf.collection("assinaturas");
  var tarefasCol = dbf.collection("tarefas"), tarefasMap = new Map(), unsubTarefas = null; // v1.25
  var fvsRevCol = dbf.collection("fvsRevisoes");
  var minhaAssinatura = null, unsubAssin = null;
  var fvsMap=new Map(), rastMap=new Map(), ctMap=new Map(), plantasMap=new Map();
  // v1.30: tudo o que veio do banco, inclusive o que está na lixeira (excluido:true)
  var todosPorColecao = { fvs:new Map(), rastreabilidade:new Map(), plantas:new Map(), entregasAco:new Map() };
  buscarAnterior = function(col, id){
    var m = todosPorColecao[col] || (col==="controleTecnologico" ? ctMap : col==="tarefas" ? tarefasMap : null);
    return (m && id && m.get(id)) || null;
  };
  var currentUserEmail="";
  var filters={ search:"", from:"", to:"", sit:"todos", pavimento:"" };
  var draft=null;
  var unsubFvs=null, unsubRast=null, unsubCt=null, unsubPlantas=null;
  // Estado transitório da ferramenta de mapeamento (planta + desenho) do
  // modal de rastreabilidade aberto no momento — não é dado da ficha, só o
  // progresso da ferramenta enquanto o modal está na tela (ver
  // wireMapeamentoEvents()). Reiniciado toda vez que o modal é reaberto.
  var mapaEstado=null;

  /* ---------------- não conformidades: lista + migração ---------------- */
  // Uma ficha nova sempre grava d.naoConformidades como lista (uma entrada
  // por não conformidade: descrição, correção proposta, se foi concluída e a
  // data de conclusão). Fichas já preenchidas antes dessa mudança usavam só
  // um bloco único (houveNC/ncDescricao/ncCorrecao/ncDataCorrecao) — esta
  // função sintetiza, na leitura, uma lista de 1 item equivalente a partir
  // desses campos antigos, sem precisar migrar nada no banco: nenhuma
  // informação já preenchida se perde, ela só passa a ser lida no formato
  // novo (e é convertida de vez assim que a ficha for aberta e salva outra
  // vez, ver openModal()).
  function fichaNaoConformidades(f){
    if(Array.isArray(f.naoConformidades)) return f.naoConformidades;
    if(f.houveNC){
      return [{
        descricao: f.ncDescricao||"",
        correcao: f.ncCorrecao||"",
        concluida: !!f.ncDataCorrecao,
        dataConclusao: f.ncDataCorrecao||"",
        dataRegistro: f.dataAbertura||"",
        anexos: []
      }];
    }
    return [];
  }
  function blankNaoConformidade(){
    return { descricao:"", correcao:"", concluida:false, dataConclusao:"", dataRegistro: todayISO(), anexos:[] };
  }
  function ncAnexos(nc){ return Array.isArray(nc.anexos) ? nc.anexos : []; }
  // Guarda a última mensagem de erro de envio de anexo por índice de NC,
  // só pra sobreviver ao renderModal() que roda logo depois de cada envio
  // (senão a mensagem de erro apareceria e sumiria na hora).
  var ncAnexoErro = {};
  function ncAnexoEhImagem(a){ return /^image\//.test(a.tipo||""); }
  // Envia um arquivo direto do navegador pro Cloudinary (sem servidor
  // nenhum no meio) usando um "unsigned upload preset" — ver comentário de
  // CLOUDINARY_CLOUD_NAME lá no topo do arquivo pra como configurar. Some
  // 'auto' deixa o próprio Cloudinary decidir o tipo (foto, PDF, etc.).
  async function ncUploadAnexo(file){
    var fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    var endpoint = "https://api.cloudinary.com/v1_1/"+encodeURIComponent(CLOUDINARY_CLOUD_NAME)+"/auto/upload";
    var resp = await fetch(endpoint, { method:"POST", body:fd });
    var data = null;
    try{ data = await resp.json(); }catch(ex){}
    if(!resp.ok || !data || !data.secure_url){
      var msg = (data && data.error && data.error.message) ? data.error.message : ("erro HTTP "+resp.status);
      throw new Error(msg);
    }
    return {
      url: data.secure_url,
      nome: file.name||"arquivo",
      tipo: file.type||"",
      tamanho: file.size||0,
      adicionadoEm: nowISO()
    };
  }
  // Diferença em dias entre duas datas ISO (YYYY-MM-DD) — usada para "quantos
  // dias está em aberto" na tela de não conformidades. Meio-dia local evita
  // problema de fuso/horário de verão na hora de contar dias corridos.
  function diffDias(isoInicio, isoFim){
    if(!isoInicio) return null;
    var a = new Date(isoInicio+"T12:00:00");
    var b = new Date((isoFim||todayISO())+"T12:00:00");
    if(isNaN(a)||isNaN(b)) return null;
    return Math.max(0, Math.round((b-a)/86400000));
  }

  /* ---------------- derived status ---------------- */
  function fvsStatus(f){
    var ncs = fichaNaoConformidades(f);
    if(!f.fechado){
      // Ficha ainda aberta, mas já com não conformidade registrada: mantém no
      // grupo "Em aberto" (não muda o comportamento dos filtros), só ganha um
      // indicador visual diferente para chamar atenção antes mesmo de fechar.
      if(ncs.length>0) return {key:"aberto", label:"Aberta com NC", nc:true};
      return {key:"aberto", label:"Aberta"};
    }
    if(ncs.some(function(nc){ return !nc.concluida; })) return {key:"pendente", label:"Pendente de NC"};
    return {key:"concluido", label:"Fechada"};
  }
  function rastOverrun(r){
    var linhas=r.linhas||[];
    for(var i=0;i<linhas.length;i++){
      var l=linhas[i];
      var gasto = diffMin(l.saidaUsina, l.lancFinal);
      if(gasto!=null && gasto>TEMPO_MAX_MIN) return true;
    }
    return false;
  }
  function rastStatus(r){
    if(!r.fechado) return {key:"aberto", label:"Aberto"};
    if(rastOverrun(r) && !(r.acoesCorretivas||"").trim()) return {key:"pendente", label:"Pendente de ação"};
    return {key:"concluido", label:"Fechado"};
  }
  function rowStatus(f,r){
    var fSt = f ? fvsStatus(f) : null;
    var rSt = r ? rastStatus(r) : null;
    var keys=[];
    if(fSt) keys.push(fSt.key);
    if(rSt) keys.push(rSt.key);
    if(keys.indexOf("pendente")!==-1) return {key:"pendente", label:"Pendente"};
    if(keys.indexOf("aberto")!==-1){
      // Propaga o mesmo indicador de "aberta com NC" da ficha FVS para o selo
      // geral da linha (coluna Situação), não só para o selo pequeno da FVS.
      if(fSt && fSt.nc) return {key:"aberto", label:"Em aberto (NC)", nc:true};
      return {key:"aberto", label:"Em aberto"};
    }
    return {key:"concluido", label:"Concluído"};
  }

  /* ---------------- ordem canônica dos pavimentos (filtro) ----------------
     O cliente numerou os pavimentos do prédio de 00 (Fundação) a 27 (Telhado).
     O campo "Local / elemento" / "Bloco / Pavimento" continua sendo texto
     livre, então essa função tenta reconhecer o pavimento a partir do que foi
     digitado, em ordem de confiança: (1) já vem no formato "NN - Nome" igual à
     lista oficial; (2) traz o código numérico do andar entre parênteses (ex.:
     "(701)"); (3) menciona "Nº Pavimento Tipo"/"Nº Pav." ou "Nº Embasamento";
     (4) bate com uma palavra-chave sem número (fundação, subsolo, térreo,
     cobertura, dependência, técnico, telhado). O que não for reconhecido vai
     para o fim da lista, em ordem alfabética entre si — nunca escondido. */
  var PAVIMENTO_CODIGOS = { "201":6, "301":7, "401":8, "501":9, "601":10, "701":11, "801":12, "901":13,
    "1001":14, "1101":15, "1201":16, "1301":17, "1401":18, "1501":19, "1601":20, "1701":21, "1801":22, "1901":23, "2001":24 };
  var PAVIMENTO_PALAVRAS = [
    { rank:0,  re:/funda[cç][aã]o/i },
    { rank:1,  re:/sub\s*-?\s*solo/i },
    { rank:2,  re:/t[eé]rreo/i },
    { rank:24, re:/cobertura/i },
    { rank:25, re:/depend[eê]ncia/i },
    { rank:26, re:/t[eé]cnico/i },
    { rank:27, re:/telhado/i }
  ];
  function pavimentoRank(valorBruto){
    var v = (valorBruto||"").toString().trim().toLowerCase();
    if(!v) return 9999;
    var mLead = v.match(/^(\d{1,2})\s*[-–.)]/);
    if(mLead) return parseInt(mLead[1],10);
    var mCod = v.match(/\(?\b(\d{3,4})\)?\b/);
    if(mCod && PAVIMENTO_CODIGOS[mCod[1]]!==undefined) return PAVIMENTO_CODIGOS[mCod[1]];
    // v1.5: aceita também "⁰" e "ª" (ex.: "3⁰ Pavimento Tipo" estava ficando sem pavimento)
    var mTipo = v.match(/(\d{1,2})\s*[ºo°⁰ª.]?\s*pav(imento)?(\s*tipo)?\b/);
    if(mTipo){
      var n = parseInt(mTipo[1],10);
      if(n>=1 && n<=17) return 6+n;
    }
    var mEmb = v.match(/(\d{1,2})\s*[ºo°⁰ª.]?\s*embasamento/);
    if(mEmb){
      var ne = parseInt(mEmb[1],10);
      if(ne>=1 && ne<=5) return 1+ne;
    }
    for(var i=0;i<PAVIMENTO_PALAVRAS.length;i++){
      if(PAVIMENTO_PALAVRAS[i].re.test(v)) return PAVIMENTO_PALAVRAS[i].rank;
    }
    return 9999;
  }

  function buildRows(){
    var rows=[];
    var linkedRastIds=new Set();
    fvsMap.forEach(function(f,id){
      var r = f.rastreabilidadeId ? rastMap.get(f.rastreabilidadeId) : null;
      if(f.rastreabilidadeId && r) linkedRastIds.add(f.rastreabilidadeId);
      rows.push({ fvsId:id, fvs:f, rastId: (r? f.rastreabilidadeId : null), rast:r||null,
        data: f.dataConcretagem || f.dataAbertura || "" });
    });
    rastMap.forEach(function(r,id){
      if(linkedRastIds.has(id)) return;
      rows.push({ fvsId:null, fvs:null, rastId:id, rast:r, data: r.data || "" });
    });
    rows.forEach(function(row){
      row.linked = !!(row.fvs && row.rast);
      row.status = rowStatus(row.fvs, row.rast);
      row.local = (row.fvs && row.fvs.local) || (row.rast && row.rast.blocoPav) || "";
      // Lista efetiva de pavimentos da linha, usada pelo filtro: junta os chips
      // de pavimentos da FVS e/ou da rastreabilidade vinculadas (uma ficha pode
      // cobrir mais de um andar). Fichas antigas, sem chips cadastrados, caem no
      // fallback do campo único "Local"/"Bloco / Pavimento" de sempre — nenhum
      // dado existente deixa de aparecer no filtro por causa dessa mudança.
      var chipsF = (row.fvs && Array.isArray(row.fvs.pavimentos)) ? row.fvs.pavimentos : [];
      var chipsR = (row.rast && Array.isArray(row.rast.pavimentos)) ? row.rast.pavimentos : [];
      var combinados = chipsF.concat(chipsR).map(function(p){ return (p||"").trim(); }).filter(Boolean);
      row.pavimentos = combinados.length ? Array.from(new Set(combinados)) : (row.local ? [row.local] : []);
    });
    rows.sort(function(a,b){ return (b.data||"").localeCompare(a.data||""); });
    return rows;
  }

  function matchesSit(row, sit){
    if(sit==="todos") return true;
    if(sit==="vinculo") return !row.linked;
    return row.status.key===sit;
  }

  function applyFilters(rows){
    var s=filters.search.trim().toLowerCase();
    return rows.filter(function(row){
      if(!matchesSit(row, filters.sit)) return false;
      if(filters.from && row.data && row.data<filters.from) return false;
      if(filters.to && row.data && row.data>filters.to) return false;
      if(filters.pavimento){
        // Compara por pavimento reconhecido (mesmo rank), não pelo texto
        // exato: a mesma ficha pode ter chip "05 - Piso do 5º Pavimento Tipo
        // (501)" enquanto outra ainda usa o texto livre antigo "5º Pavimento"
        // — ambos devem casar com a mesma opção do filtro.
        var pFiltroRank = pavimentoRank(filters.pavimento);
        var pavBate = false;
        for(var pvi=0; pvi<row.pavimentos.length; pvi++){
          var pv = row.pavimentos[pvi];
          if(pFiltroRank!==9999 ? pavimentoRank(pv)===pFiltroRank : pv===filters.pavimento){ pavBate=true; break; }
        }
        if(!pavBate) return false;
      }
      if(s){
        var hay=[
          row.fvs && row.fvs.numero, row.fvs && row.fvs.codigo, row.fvs && row.fvs.local,
          row.rast && row.rast.numero, row.rast && row.rast.blocoPav,
          row.fvs && row.fvs.obra, row.rast && row.rast.obra
        ].concat((row.rast && row.rast.linhas || []).map(function(l){ return l.betoneira; }))
         .concat((row.rast && row.rast.linhas || []).map(function(l){ return l.notaFiscal; }))
         .concat((row.rast && row.rast.linhas || []).map(function(l){ return l.pecas; }))
         .concat((row.fvs && row.fvs.unidades) || [])
         .join(" ").toLowerCase();
        if(hay.indexOf(s)===-1) return false;
      }
      return true;
    });
  }

  /* ---------------- render: KPIs ---------------- */
  function renderKPIs(rows){
    var totalFvs=fvsMap.size, totalRast=rastMap.size;
    var pendente=0, aberto=0, concluido=0, vinculo=0, abertoNc=0;
    rows.forEach(function(r){
      if(!r.linked) vinculo++;
      if(r.status.key==="pendente") pendente++;
      else if(r.status.key==="aberto") aberto++;
      else concluido++;
      if(r.status.nc) abertoNc++;
    });
    var data=[
      {n:totalFvs, l:"Fichas FVS", t:""},
      {n:totalRast, l:"Rastreabilidades", t:""},
      {n:vinculo, l:"Sem vínculo", t:"vinculo"},
      {n:aberto, l:"Em aberto", t:"aberto"},
      {n:abertoNc, l:"Aberta(s) com NC", t:"nc"},
      {n:pendente, l:"Pendentes", t:"pendente"},
      {n:concluido, l:"Concluídos", t:"concluido"}
    ];
    document.getElementById("kpis").innerHTML = data.map(function(d){
      return '<div class="kpi'+(d.t?" tone-"+d.t:"")+'"><div class="n">'+d.n+'</div><div class="l">'+d.l+'</div></div>';
    }).join("");
  }

  /* ---------------- render: board ---------------- */
  function pill(sit){
    return '<span class="pill '+sit.key+(sit.nc?' has-nc':'')+'"><span class="dot"></span>'+sit.label+'</span>';
  }
  function renderBoard(rows){
    var body=document.getElementById("board-body");
    if(rows.length===0){
      body.innerHTML = '<div class="empty-state"><div class="big">Nada por aqui ainda</div><p>Crie uma ficha FVS ou um controle de rastreabilidade para começar, ou ajuste os filtros acima.</p></div>';
      return;
    }
    body.innerHTML = rows.map(function(row){
      var f=row.fvs, r=row.rast;
      var fvsCell = f
        ? '<div class="rec"><span class="num">'+escapeHtml(f.codigo||"FVS")+' · '+escapeHtml(f.numero||"s/ nº")+'</span><span class="meta">'+pill(fvsStatus(f))+'</span></div>'
        : '<div class="rec empty"><span class="num">Sem ficha FVS</span></div>';
      var rastCell = r
        ? '<div class="rec"><span class="num">Concretagem '+escapeHtml(fmtDateBR(r.data))+'</span><span class="meta">'+pill(rastStatus(r))+'</span></div>'
        : '<div class="rec empty"><span class="num">Sem rastreabilidade</span></div>';
      var obra = (f && f.obra) || (r && r.obra) || DEFAULT_OBRA;
      var local = row.local;
      var sitHtml = pill(row.status) + (!row.linked ? ' '+pill({key:"vinculo",label:"Sem vínculo"}) : '');
      return '<div class="row row-grid" data-fvs="'+(row.fvsId||"")+'" data-rast="'+(row.rastId||"")+'">'
        + '<div class="cell-data" data-label="Data">'+escapeHtml(fmtDateBR(row.data))+(row.data?'<span class="dow">'+dowBR(row.data)+'</span>':'')+'</div>'
        + '<div class="cell" data-label="Rastreabilidade">'+rastCell+'</div>'
        + '<div class="cell" data-label="Ficha FVS">'+fvsCell+'</div>'
        + '<div class="cell local-cell" data-label="Obra / Elemento"><span class="obra">'+escapeHtml(obra)+'</span><span class="elem">'+escapeHtml(local)+'</span></div>'
        + '<div class="cell" data-label="Situação" style="display:flex;flex-wrap:wrap;gap:4px;">'+sitHtml+'</div>'
        + '<div class="cell row-actions" data-label="">'
          + (f? '<button class="icon-btn" data-open-fvs="'+row.fvsId+'">FVS</button>' : (r? '<button class="icon-btn" data-gen-fvs="'+row.rastId+'">+ FVS</button>' : ''))
          + (r? '<button class="icon-btn" data-open-rast="'+row.rastId+'">Rastr.</button>' : (f? '<button class="icon-btn" data-gen-rast="'+row.fvsId+'">+ Rastr.</button>' : ''))
        + '</div>'
        + '</div>';
    }).join("");
  }

  // Lista canônica de pavimentos (00-Fundação ... 27-Telhado) a partir das
  // linhas cadastradas: agrupa textos diferentes que descrevem o mesmo andar
  // (ex.: "5º Pavimento" digitado à mão numa ficha antiga e o chip novo
  // "05 - Piso do 5º Pavimento Tipo (501)") pelo mesmo rank reconhecido,
  // mostrando 1 label por andar (preferindo o formato oficial "NN - Nome").
  // O que não for reconhecido (rank 9999) não pode ser agrupado com
  // segurança, então continua aparecendo por texto exato. Usada tanto pelo
  // filtro de pavimento do quadro principal quanto pelo relatório "FVS por
  // pavimento", para as duas telas sempre mostrarem os mesmos andares.
  function pavimentosCanonicos(allRows){
    var todos=[];
    allRows.forEach(function(r){ (r.pavimentos||[]).forEach(function(p){ todos.push((p||"").trim()); }); });
    todos = todos.filter(Boolean);

    var porRank = new Map(); // rank -> {label, oficial}
    var naoReconhecidos = new Set();
    todos.forEach(function(v){
      var rank = pavimentoRank(v);
      if(rank===9999){ naoReconhecidos.add(v); return; }
      var oficial = /^\s*\d{1,2}\s*[-–.)]/.test(v);
      var atual = porRank.get(rank);
      if(!atual || (oficial && !atual.oficial) || (oficial===atual.oficial && v.length>atual.label.length)){
        porRank.set(rank, { label:v, oficial:oficial });
      }
    });
    var vals = [];
    porRank.forEach(function(o, rank){ vals.push({label:o.label, rank:rank}); });
    naoReconhecidos.forEach(function(v){ vals.push({label:v, rank:9999}); });

    // Ordem canônica dos pavimentos do prédio (00-Fundação ... 27-Telhado); só
    // mostra os que já existem nas fichas cadastradas, nunca a lista toda.
    vals.sort(function(a,b){
      if(a.rank!==b.rank) return a.rank-b.rank;
      return a.label.localeCompare(b.label, "pt-BR", {numeric:true, sensitivity:"base"});
    });
    return vals; // [{label, rank}, ...]
  }

  function renderPavimentoOptions(allRows){
    var sel = document.getElementById("f-pavimento");
    var vals = pavimentosCanonicos(allRows).map(function(o){ return o.label; });
    var current = filters.pavimento;
    if(current && vals.indexOf(current)===-1){
      // A opção exata que estava selecionada sumiu (virou outra label
      // representativa do mesmo pavimento) — tenta manter o filtro pelo
      // mesmo andar (mesmo rank) em vez de simplesmente limpar a seleção.
      var rankAtual = pavimentoRank(current);
      if(rankAtual!==9999){
        for(var vi=0; vi<vals.length; vi++){
          if(pavimentoRank(vals[vi])===rankAtual){ current = vals[vi]; break; }
        }
      }
    }
    sel.innerHTML = '<option value="">Todos os pavimentos</option>'
      + vals.map(function(v){ return '<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>'; }).join("");
    sel.value = vals.indexOf(current)!==-1 ? current : "";
    filters.pavimento = sel.value;
  }
  // v1.31: cria o login de uma pessoa nova sem sair da conta de quem está
  // usando (numa "segunda instância" do Firebase) e manda o e-mail para ela
  // criar a própria senha.
  function criarLogin(email){
    var app2 = firebase.apps.filter(function(a){ return a.name==="cadastro"; })[0] || firebase.initializeApp(firebaseConfig, "cadastro");
    var a2 = app2.auth();
    if((location.hostname==="localhost" || location.hostname==="127.0.0.1") && !a2.__emu){ a2.useEmulator("http://127.0.0.1:9099"); a2.__emu = true; }
    var bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
    var senha = Array.from(bytes).map(function(b){ return ("0"+b.toString(16)).slice(-2); }).join("") + "Aa1!";
    return a2.createUserWithEmailAndPassword(email, senha)
      .then(function(){ return a2.signOut(); })
      .then(function(){ return auth.sendPasswordResetEmail(email); })
      .then(function(){ return "Login criado: a pessoa recebeu um e-mail para criar a senha."; })
      .catch(function(e){
        if(e && e.code==="auth/email-already-in-use") return auth.sendPasswordResetEmail(email).then(function(){ return "Essa pessoa já tinha login — mandei o e-mail para ela criar uma senha nova."; });
        throw e;
      });
  }
  // v1.30: link "Ver histórico" no pé da ficha já salva
  function verHistoricoHtml(col, id){
    return id ? '<div class="last-updated"><button type="button" class="linkish" data-ver-historico="'+escapeHtml(col+"|"+id)+'">Ver histórico de alterações</button></div>' : "";
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-ver-historico]");
    if(!b) return;
    var p = b.getAttribute("data-ver-historico").split("|");
    closeModal();
    verHistoricoDe(p[0], p[1]);
  });
  function render(){
    var allRows = buildRows();
    renderPavimentoOptions(allRows);
    var rows = applyFilters(allRows);
    renderKPIs(rows);
    renderBoard(rows);
    // Mantém o relatório "FVS por Pavimento" atualizado se ele estiver aberto
    // no momento em que os dados mudarem (ex.: outra aba salvando algo).
    var viewPav = document.getElementById("view-pavimento");
    if(viewPav && !viewPav.hidden) renderViewPavimento();
    var viewNc = document.getElementById("view-nc");
    if(viewNc && !viewNc.hidden) renderViewNc();
    var viewCt = document.getElementById("view-ct");
    if(viewCt && !viewCt.hidden) renderViewCt();
    var viewDash = document.getElementById("view-dashboard");
    if(viewDash && !viewDash.hidden) renderViewDashboard();
    var viewLix = document.getElementById("view-lixeira");
    if(viewLix && !viewLix.hidden) renderViewLixeira();
    var viewEng = document.getElementById("view-engenharia");
    if(viewEng && !viewEng.hidden) renderViewEngenharia();
    var viewAssinar = document.getElementById("view-assinar");
    if(viewAssinar && !viewAssinar.hidden) renderViewAssinar();
    var viewPlantas = document.getElementById("view-plantas");
    if(viewPlantas && !viewPlantas.hidden) renderViewPlantas();
    var viewAco = document.getElementById("view-aco");
    if(viewAco && !viewAco.hidden && !document.querySelector(".ct-ficha-ov")) renderViewAco(viewAco);
    var viewCron = document.getElementById("view-cronograma");
    if(viewCron && !viewCron.hidden && !(document.activeElement && document.activeElement.matches("[data-cr-busca]"))) renderViewCronograma(viewCron);
    // Bolinhas vermelhas do menu (v1.3)
    definirContador("nc", todasNaoConformidades().filter(function(i){ return !i.concluida; }).length);
    definirContador("ct", ctRowsArray().filter(ctTemPendencia).length);
  }

  /* ---------------- navegação entre telas ---------------- */
  // Cada tela do sistema é um dos elementos abaixo, e só uma fica visível
  // por vez. Centralizar a troca aqui (em vez de cada tela saber esconder e
  // mostrar a outra "vizinha") evita o problema de telas que só eram
  // alcançáveis passando por dentro de outra (ex.: Não Conformidades antes
  // só abria de dentro de "FVS por Pavimento") — agora qualquer tela pode
  // ser aberta a partir de qualquer outra, inclusive pelo menu do topo.
  /* ---------------- v1.25: perfis e painel da engenharia ----------------
     Perfis pelo e-mail do login (quem não está na lista edita tudo, como
     estagiário — ex.: Alice):
       admin       — Matheus: controle total (vê também o painel da engenharia)
       engenharia  — Suellen: abre no Painel da engenharia (indicadores, fila
                     de assinaturas, assinar em lote, tarefas para estagiários)
       qualidade   — Jessica: só visualiza FVS, controle tecnológico e NCs
     A permissão de gravar continua nas regras do banco (Jessica: só leitura). */
  // v1.31: perfis vêm do cadastro da equipe no banco (equipe/{e-mail}, tela Equipe);
  // enquanto o cadastro não existe, vale a lista de src/modulos/dados/equipe.js
  var equipeMap = new Map(), unsubEquipe = null;
  var perfilAtual = "estagiario";
  function perfilDe(email){ return perfilDaEquipe(email, equipeMap); }
  function aplicarPerfil(){
    var antes = perfilAtual + "|" + somenteLeitura;
    somenteLeitura = cadastroDe(currentUserEmail, equipeMap) ? (soVisualiza(currentUserEmail, equipeMap) || ehSomenteLeitura("")) : ehSomenteLeitura(currentUserEmail);
    document.body.classList.toggle("somente-leitura", somenteLeitura);
    perfilAtual = perfilDe(currentUserEmail);
    document.body.setAttribute("data-perfil", perfilAtual);
    return antes !== perfilAtual + "|" + somenteLeitura;
  }
  function verEngenharia(){ return perfilAtual==="engenharia" || perfilAtual==="admin"; }

  var filtrosEng = { tipo:"todos", periodo:"30", sel:{} };
  // v1.32: quem assina em lote — engenheiro(a) assina como engenharia;
  // estagiário(a)/técnico(a) assina no campo de inspeção (FVS) / coleta (rastreabilidade)
  function papelLote(){ var p = minhaAssinatura && minhaAssinatura.papel; return p==="engenheiro" ? "engenheiro" : (p==="tecnico" || p==="estagiario") ? p : ""; }
  function engPendentesAssinatura(){
    var desde = filtrosEng.periodo==="todas" ? "" : ctSomarDias(todayISO(), -Number(filtrosEng.periodo));
    var out = [], insp = papelLote()==="tecnico" || papelLote()==="estagiario";
    var semEng = insp
      ? function(d){ return !(d.assinaturas||[]).some(function(a){ return a.papel==="tecnico" || a.papel==="estagiario"; }); }
      : function(d){ return !(d.assinaturas||[]).some(function(a){ return a.papel==="engenheiro"; }); };
    if(filtrosEng.tipo!=="rast") fvsMap.forEach(function(f, id){
      var dt = f.dataConcretagem||f.dataAbertura||"";
      if((f.travada && !insp) || !semEng(f) || (desde && dt < desde)) return;
      var st = fvsStatus(f);
      out.push({ tipo:"fvs", id:id, d:f, data:dt, pronta:!!f.fechado, titulo:(f.codigo||"FVS")+" nº "+(f.numero||"s/ nº"),
        sub:(fvsPavimentosList(f).join(", ")||f.local||"")+" · "+st.label, inspecao:!!assinaturaDoPapel(f, insp ? "engenheiro" : "tecnico") });
    });
    if(filtrosEng.tipo!=="fvs") rastMap.forEach(function(r, id){
      var dt = r.data||"";
      if(!semEng(r) || (desde && dt < desde)) return;
      out.push({ tipo:"rast", id:id, d:r, data:dt, pronta:!!r.fechado, titulo:"Rastreabilidade "+fmtDateBR(dt),
        sub:(r.blocoPav||(r.pavimentos||[])[0]||"")+" · "+(r.linhas||[]).length+" BT · "+rastStatus(r).label, inspecao:!!assinaturaDoPapel(r, insp ? "engenheiro" : "tecnico") });
    });
    out.sort(function(a,b){ return (b.pronta-a.pronta) || (b.data||"").localeCompare(a.data||""); });
    return out;
  }
  function avisoAssinaturaLote(){
    if(!minhaAssinatura) return '<div class="banner">Cadastre a sua assinatura para assinar as fichas. <button type="button" class="btn small" data-cad-assin>Cadastrar assinatura</button></div>';
    var p = papelLote();
    if(!p) return '<div class="banner">Seu cadastro de assinatura está como '+escapeHtml(PAPEIS_ASSIN[minhaAssinatura.papel]||minhaAssinatura.papel)+', que não assina fichas. Troque a função em “Minha assinatura”. <button type="button" class="btn small" data-cad-assin>Minha assinatura</button></div>';
    if(p!=="engenheiro") return '<div class="banner">Você assina como <b>'+escapeHtml(PAPEIS_ASSIN[p]||p)+'</b>: na FVS vai no campo “Inspecionado por” e na rastreabilidade em “Responsável pela coleta”. A lista mostra as fichas que ainda não têm essa assinatura. <button type="button" class="btn small" data-cad-assin>Minha assinatura</button></div>';
    return "";
  }
  // v1.32: fila "Para assinar" (Painel da engenharia e tela "Assinar em lote" dos estagiários)
  function filaAssinaturaHtml(pend, todasPend){
    var p = papelLote(), insp = p && p!=="engenheiro";
    var nSel = Object.keys(filtrosEng.sel).filter(function(k){ return filtrosEng.sel[k]; }).length;
    var chipT = function(k, rot, n){ return '<button type="button" class="chip" data-eng-tipo="'+k+'" aria-pressed="'+(filtrosEng.tipo===k)+'">'+rot+' <span class="n">'+n+'</span></button>'; };
    var lista = pend.length ? pend.map(function(x){
      var k = x.tipo+"|"+x.id;
      return '<div class="eng-item'+(x.pronta?"":" rascunho")+'"><label class="eng-chk"><input type="checkbox" data-eng-sel="'+escapeHtml(k)+'"'+(filtrosEng.sel[k]?" checked":"")+'></label>'
        + '<div class="eng-item-tx"><span class="eng-tipo '+x.tipo+'">'+(x.tipo==="fvs"?"FVS":"Rastr.")+'</span><b>'+escapeHtml(x.titulo)+'</b>'
        + '<small>'+escapeHtml(x.sub)+(x.data ? ' · '+escapeHtml(fmtDateBR(x.data)) : '')+'</small>'
        + '<small class="'+(x.pronta?"ok":"warn")+'">'+(x.pronta ? "pronta para assinar" : "ainda em preenchimento")
          +(insp ? (x.inspecao ? " · engenharia já assinou" : "") : (x.inspecao ? " · inspeção já assinou" : " · falta a inspeção"))+'</small></div>'
        + '<div class="eng-item-ac"><button type="button" class="btn small" data-eng-abrir="'+escapeHtml(k)+'">Abrir</button>'
        + '<button type="button" class="btn small primary" data-eng-assinar="'+escapeHtml(k)+'"'+(p ? "" : " disabled")+'>Assinar</button></div></div>';
    }).join("") : '<div class="dash-vazio">Nada pendente de assinatura neste filtro. 👍</div>';
    return '<div class="dash-card" id="eng-assin"><div class="dash-card-h"><h3>Para assinar'+(insp ? " — inspeção / coleta" : "")+'</h3><span class="hoje-cont">'+pend.length+'</span></div>'
        + '<div class="eng-filtros"><div class="chips">'+chipT("todos", "Todas", todasPend.length)+chipT("fvs", "FVS", todasPend.filter(function(x){ return x.tipo==="fvs"; }).length)+chipT("rast", "Rastreabilidades", todasPend.filter(function(x){ return x.tipo==="rast"; }).length)+'</div>'
          + '<select id="eng-periodo" aria-label="Período"><option value="30"'+(filtrosEng.periodo==="30"?" selected":"")+'>Últimos 30 dias</option><option value="90"'+(filtrosEng.periodo==="90"?" selected":"")+'>Últimos 90 dias</option><option value="todas"'+(filtrosEng.periodo==="todas"?" selected":"")+'>Todas</option></select></div>'
        + '<div class="eng-lote"><button type="button" class="btn small" data-eng-sel-prontas>Selecionar as prontas</button><button type="button" class="btn small" data-eng-sel-todas>Selecionar todas</button><button type="button" class="btn small" data-eng-limpar>Limpar seleção</button>'
          + '<button type="button" class="btn primary" data-eng-lote'+(nSel && p ? "" : " disabled")+'>✍ Assinar selecionadas ('+nSel+')</button></div>'
        + '<div class="eng-lista">'+lista+'</div></div>';
  }
  function ligarFilaAssinatura(c, pend, re){
    c.querySelectorAll("[data-cad-assin]").forEach(function(b){ b.addEventListener("click", abrirMinhaAssinatura); });
    c.querySelectorAll("[data-eng-tipo]").forEach(function(b){ b.addEventListener("click", function(){ filtrosEng.tipo = b.getAttribute("data-eng-tipo"); re(); }); });
    c.querySelector("#eng-periodo").addEventListener("change", function(e){ filtrosEng.periodo = e.target.value; re(); });
    c.querySelectorAll("[data-eng-sel]").forEach(function(ch){ ch.addEventListener("change", function(){ filtrosEng.sel[ch.getAttribute("data-eng-sel")] = ch.checked; re(); }); });
    c.querySelector("[data-eng-sel-prontas]").addEventListener("click", function(){ pend.forEach(function(x){ if(x.pronta) filtrosEng.sel[x.tipo+"|"+x.id] = true; }); re(); });
    c.querySelector("[data-eng-sel-todas]").addEventListener("click", function(){ pend.forEach(function(x){ filtrosEng.sel[x.tipo+"|"+x.id] = true; }); re(); });
    c.querySelector("[data-eng-limpar]").addEventListener("click", function(){ filtrosEng.sel = {}; re(); });
    c.querySelectorAll("[data-eng-abrir]").forEach(function(b){ b.addEventListener("click", function(){ var p = b.getAttribute("data-eng-abrir").split("|"); openModal(p[0], p[1]); }); });
    c.querySelectorAll("[data-eng-assinar]").forEach(function(b){ b.addEventListener("click", function(){ engAssinarLote([b.getAttribute("data-eng-assinar")], b, re); }); });
    c.querySelector("[data-eng-lote]").addEventListener("click", function(ev){
      var ks = Object.keys(filtrosEng.sel).filter(function(k){ return filtrosEng.sel[k]; });
      engAssinarLote(ks, ev.currentTarget, re);
    });
  }
  // tela "Assinar em lote" (estagiários e administrador)
  function renderViewAssinar(){
    var c = document.getElementById("view-assinar"); if(!c) return;
    var pend = engPendentesAssinatura();
    var todasPend = (function(){ var s = filtrosEng.tipo; filtrosEng.tipo = "todos"; var x = engPendentesAssinatura(); filtrosEng.tipo = s; return x; })();
    c.innerHTML = '<div class="pav-header"><h2>Assinar em lote</h2><span class="pav-total">'+todasPend.length+' para assinar</span></div>'
      + '<p class="view-desc">Marque as fichas e assine todas de uma vez com a sua assinatura cadastrada.</p>'
      + avisoAssinaturaLote() + filaAssinaturaHtml(pend, todasPend);
    pintarIcones(c);
    ligarFilaAssinatura(c, pend, renderViewAssinar);
  }
  function renderViewEngenharia(){
    var c = document.getElementById("view-engenharia"); if(!c) return;
    var hoje = todayISO(), pend = engPendentesAssinatura();
    var todasPend = (function(){ var s = filtrosEng.tipo; filtrosEng.tipo = "todos"; var x = engPendentesAssinatura(); filtrosEng.tipo = s; return x; })();
    var ncs = todasNaoConformidades().filter(function(n){ return !n.concluida; });
    var ncVenc = ncs.filter(function(n){ return (n.prazo && n.prazo < hoje) || (n.diasAberto||0) >= 15; }).length;
    var ctRows = ctRowsArray(), ctDec = ctRows.filter(function(r){ return ctSituacao(r)==="decidir"; }).length, ctAb = ctRows.filter(function(r){ return ctSituacao(r)==="abaixo"; }).length;
    var tarefas = Array.from(tarefasMap.values()), tAbertas = tarefas.filter(function(t){ return t.status!=="feita"; });
    var desde30 = ctSomarDias(hoje, -30), conc30 = 0, vol30 = 0;
    rastMap.forEach(function(r){ if((r.data||"") >= desde30){ conc30++; (r.linhas||[]).forEach(function(l){ vol30 += Number(String(l.volBetoneira||"").replace(",", "."))||0; }); } });
    var fvsCont = { aberta:0, aguardando:0, assinada:0 };
    fvsMap.forEach(function(f){ if(f.travada) fvsCont.assinada++; else if(f.fechado) fvsCont.aguardando++; else fvsCont.aberta++; });
    var fvsTot = fvsCont.aberta + fvsCont.aguardando + fvsCont.assinada || 1;
    var ncIdade = { a:0, b:0, c:0 }; ncs.forEach(function(n){ var d = n.diasAberto||0; if(d < 7) ncIdade.a++; else if(d < 15) ncIdade.b++; else ncIdade.c++; });
    var kpi = function(n, l, d, tom, ir){ return '<button type="button" class="dash-kpi-card tone-'+tom+'" '+ir+'><div class="n">'+n+'</div><div class="l">'+l+'</div><div class="d">'+d+'</div></button>'; };
    var barra = function(rot, partes){
      var tot = partes.reduce(function(s,p){ return s+p.n; }, 0) || 1;
      return '<div class="eng-barra"><div class="eng-barra-rot">'+rot+'</div><div class="eng-barra-trilho">'
        + partes.map(function(p){ return p.n ? '<i class="'+p.tom+'" style="width:'+(p.n*100/tot)+'%" title="'+escapeHtml(p.rot+': '+p.n)+'"></i>' : ''; }).join("")
        + '</div><div class="eng-barra-leg">'+partes.map(function(p){ return '<span><i class="'+p.tom+'"></i>'+escapeHtml(p.rot)+' <b>'+p.n+'</b></span>'; }).join("")+'</div></div>';
    };
    var semAssin = avisoAssinaturaLote();
    var opcoesPara = '<option value="estagiarios">Todos os estagiários</option>' + recebemTarefas(equipeMap).map(function(e){ return '<option value="'+escapeHtml(e.email||e.nome)+'">'+escapeHtml(e.nome)+'</option>'; }).join("");
    var tarefaLi = function(t){
      var venc = t.status!=="feita" && t.prazo && t.prazo < hoje;
      return '<div class="eng-tarefa'+(t.status==="feita"?" feita":"")+'"><div><b>'+escapeHtml(t.titulo)+'</b><small>Para: '+escapeHtml(t.paraNome||"estagiários")
        + (t.prazo ? ' · prazo '+escapeHtml(fmtDateBR(t.prazo))+(venc ? ' <span class="ncx-tag bad">vencido</span>' : '') : '')
        + (t.status==="feita" ? ' · feita por '+escapeHtml(t.feitaPor||"")+' em '+escapeHtml(fmtDateBR((t.feitaEm||"").slice(0,10))) : '')+'</small>'
        + (t.descricao ? '<small>'+escapeHtml(t.descricao)+'</small>' : '')+'</div>'
        + (t.status!=="feita" ? '<button type="button" class="btn small" data-tarefa-cancelar="'+escapeHtml(t._id)+'" title="Retirar a tarefa">Retirar</button>' : '')+'</div>';
    };
    c.innerHTML = '<div class="pav-header"><h2>Painel da engenharia</h2><span class="pav-total">'+escapeHtml(fmtDateBR(hoje))+'</span></div>'
      + '<p class="view-desc">Indicadores da obra, fichas esperando a sua assinatura e tarefas para os estagiários.</p>'
      + semAssin
      + '<div class="dash-kpis">'
        + kpi(todasPend.filter(function(x){ return x.pronta; }).length, "Prontas para assinar", todasPend.length+" sem a sua assinatura", "pendente", 'data-eng-ir="assin"')
        + kpi(ncs.length, "NCs em aberto", ncVenc+" com prazo vencido ou +15 dias", ncs.length ? "nc" : "ok", 'data-goto-view="nc"')
        + kpi(ctDec+ctAb, "Concreto: decidir", ctDec+" com justificativa · "+ctAb+" abaixo do fck", ctDec+ctAb ? "nc" : "ok", 'data-goto-view="ct"')
        + kpi(tAbertas.length, "Tarefas em aberto", tAbertas.filter(function(t){ return t.prazo && t.prazo < hoje; }).length+" com prazo vencido", "info", 'data-eng-ir="tarefas"')
      + '</div>'
      + filaAssinaturaHtml(pend, todasPend)
      + '<div class="dash-grid">'
        + '<div class="dash-card" id="eng-tarefas"><div class="dash-card-h"><h3>Tarefas para os estagiários</h3><span class="hoje-cont">'+tAbertas.length+' em aberto</span></div>'
          + '<div class="eng-nova"><div class="field"><label for="eng-t-tit">O que fazer</label><input id="eng-t-tit" placeholder="ex.: completar betonadas da rastreabilidade de 05/10"></div>'
          + '<div class="grid2"><div class="field"><label for="eng-t-para">Para</label><select id="eng-t-para">'+opcoesPara+'</select></div><div class="field"><label for="eng-t-prazo">Prazo</label><input type="date" id="eng-t-prazo"></div></div>'
          + '<div class="field"><label for="eng-t-desc">Detalhes (opcional)</label><textarea id="eng-t-desc" rows="2"></textarea></div>'
          + '<button type="button" class="btn primary" data-eng-tarefa>+ Enviar tarefa</button></div>'
          + (tarefas.length ? tarefas.sort(function(a,b){ return (a.status==="feita")-(b.status==="feita") || String(b.criadoEm||"").localeCompare(String(a.criadoEm||"")); }).slice(0, 15).map(tarefaLi).join("") : '<div class="dash-vazio">Nenhuma tarefa enviada ainda.</div>')
        + '</div>'
        + '<div class="dash-card"><div class="dash-card-h"><h3>Indicadores</h3></div>'
          + barra("Fichas FVS", [{ rot:"assinadas", n:fvsCont.assinada, tom:"ok" }, { rot:"fechadas aguardando assinatura", n:fvsCont.aguardando, tom:"warn" }, { rot:"em preenchimento", n:fvsCont.aberta, tom:"neutro" }])
          + barra("NCs em aberto por idade", [{ rot:"até 7 dias", n:ncIdade.a, tom:"ok" }, { rot:"7 a 15 dias", n:ncIdade.b, tom:"warn" }, { rot:"mais de 15 dias", n:ncIdade.c, tom:"bad" }])
          + '<div class="eng-num"><b>'+conc30+'</b> concretagens nos últimos 30 dias · <b>'+String(Math.round(vol30*10)/10).replace(".", ",")+' m³</b></div>'
          + '<div class="eng-num">Controle tecnológico: '+escapeHtml(ctResumoConclusao())+'</div>'
        + '</div>'
      + '</div>';
    pintarIcones(c);
    var re = function(){ renderViewEngenharia(); };
    ligarFilaAssinatura(c, pend, re);
    c.querySelectorAll("[data-goto-view]").forEach(function(b){ b.addEventListener("click", function(){ switchView(b.getAttribute("data-goto-view")); }); });
    c.querySelectorAll("[data-eng-ir]").forEach(function(b){ b.addEventListener("click", function(){ var el = document.getElementById("eng-"+b.getAttribute("data-eng-ir")); if(el) el.scrollIntoView({ behavior:"smooth" }); }); });
    c.querySelector("[data-eng-tarefa]").addEventListener("click", function(ev){
      var tit = c.querySelector("#eng-t-tit").value.trim();
      if(!tit){ alert("Escreva o que precisa ser feito."); return; }
      var para = c.querySelector("#eng-t-para"), nomePara = para.options[para.selectedIndex].text;
      var dados = { titulo:tit, descricao:c.querySelector("#eng-t-desc").value.trim(), prazo:c.querySelector("#eng-t-prazo").value||"", para:para.value, paraNome:nomePara,
        status:"aberta", criadoPor:currentUserEmail||"", criadoEm:nowISO(), atualizadoEm:nowISO() };
      ev.currentTarget.disabled = true;
      Promise.race([tarefasCol.add(dados), new Promise(function(r){ setTimeout(r, 8000); })]).then(re).catch(function(ex){ console.error(ex); alert("Não foi possível enviar a tarefa: "+(ex && ex.code==="permission-denied" ? "o banco ainda não aceita tarefas (falta publicar as regras)." : (ex && ex.message || "erro"))); re(); });
    });
    c.querySelectorAll("[data-tarefa-cancelar]").forEach(function(b){ b.addEventListener("click", function(){
      if(!confirm("Retirar esta tarefa? Ela fica guardada como cancelada.")) return;
      tarefasCol.doc(b.getAttribute("data-tarefa-cancelar")).set({ status:"feita", cancelada:true, feitaPor:currentUserEmail||"", feitaEm:nowISO(), atualizadoEm:nowISO() }, { merge:true });
    }); });
  }
  // Assina como engenheira várias fichas de uma vez (FVS: também fecha e trava, como no botão da ficha)
  async function engAssinarLote(chaves, botao, depois){
    var papel = papelLote(), insp = papel && papel!=="engenheiro";
    if(!papel){ alert(minhaAssinatura ? "Sua assinatura está cadastrada com uma função que não assina fichas. Troque em “Minha assinatura”." : "Cadastre a sua assinatura em “Minha assinatura” para assinar."); return; }
    var jaTem = function(d){ return (d.assinaturas||[]).some(function(a){ return insp ? (a.papel==="tecnico" || a.papel==="estagiario") : a.papel==="engenheiro"; }); };
    var itens = chaves.map(function(k){ var p = k.split("|"); return { tipo:p[0], id:p[1], d:(p[0]==="fvs" ? fvsMap : rastMap).get(p[1]) }; })
      .filter(function(x){ return x.d && !(x.tipo==="fvs" && x.d.travada && !insp) && !jaTem(x.d); });
    if(!itens.length){ alert("Nenhuma ficha selecionada precisa da sua assinatura."); return; }
    var nF = itens.filter(function(x){ return x.tipo==="fvs"; }).length, nR = itens.length - nF;
    var abertas = itens.filter(function(x){ return !x.d.fechado; }).length;
    if(!confirm("Assinar "+itens.length+" ficha(s) como "+(PAPEIS_ASSIN[papel]||papel)+"?\n\n"
      +(nF ? "• "+nF+" FVS"+(insp ? " — no campo “Inspecionado por”" : " — serão fechadas e travadas")+"\n" : "")
      +(nR ? "• "+nR+" rastreabilidade(s)"+(insp ? " — no campo “Responsável pela coleta”" : "")+"\n" : "")
      +(abertas ? "\nAtenção: "+abertas+" ainda estão em preenchimento." : ""))) return;
    var agora = nowISO(), uid = (auth.currentUser||{}).uid||"";
    var assin = { papel:papel, nome:minhaAssinatura.nome||"", crea:minhaAssinatura.crea||"", email:currentUserEmail, uid:uid, em:agora, imagem:minhaAssinatura.imagem||"" };
    if(botao){ botao.disabled = true; botao.textContent = "Assinando…"; }
    try{
      var envios = [];
      for(var i=0;i<itens.length;i+=200){
        var lote = dbf.batch();
        itens.slice(i, i+200).forEach(function(x){
          var d = x.d, dados = { assinaturas:(d.assinaturas||[]).concat([Object.assign({}, assin, x.tipo==="fvs" ? { revisao:d.revisao||0 } : {})]), updatedAt:agora, updatedByEmail:currentUserEmail||"" };
          if(insp){
            // inspeção/coleta: só acrescenta a assinatura (vale também para FVS já travada)
            if(x.tipo==="fvs" && !d.inspecionadoPor) dados.inspecionadoPor = minhaAssinatura.nome||"";
            if(x.tipo==="rast" && !d.responsavelColeta) dados.responsavelColeta = minhaAssinatura.nome||"";
          } else if(!d.engenheiro) dados.engenheiro = minhaAssinatura.nome||"";
          if(x.tipo==="fvs" && !insp){
            dados.fechado = true; if(!d.dataFechamento) dados.dataFechamento = todayISO();
            dados.travada = true; dados.travadaEm = agora; dados.travadaPor = currentUserEmail||"";
          }
          lote.update((x.tipo==="fvs" ? fvsCol : rastCol).doc(x.id), dados);
        });
        envios.push(lote.commit());
      }
      var r = await Promise.race([Promise.all(envios).then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 12000); })]);
      if(r==="pendente") alert("Sem conexão no momento — as assinaturas serão enviadas quando o sinal voltar. Mantenha o app aberto.");
      filtrosEng.sel = {};
    }catch(ex){
      console.error(ex);
      alert("Não foi possível assinar: "+(ex && ex.message ? ex.message : "erro desconhecido"));
    }
    (depois || renderViewEngenharia)();
  }
  // Tarefas da engenharia para mim (estagiários / admin) — no Início
  function minhasTarefas(){
    var eu = String(currentUserEmail||"").toLowerCase(), out = [];
    tarefasMap.forEach(function(t, id){
      if(t.status==="feita") return;
      var p = String(t.para||"").toLowerCase();
      if(p==="estagiarios" || p===eu || (perfilAtual==="estagiario" && p && p.indexOf("@")===-1)) out.push(Object.assign({ _id:id }, t));
    });
    return out.sort(function(a,b){ return String(a.prazo||"9999").localeCompare(String(b.prazo||"9999")); });
  }
  function tarefasInicioHtml(){
    if(perfilAtual==="engenharia" || perfilAtual==="qualidade") return "";
    var l = minhasTarefas(); if(!l.length) return "";
    var hoje = todayISO();
    return '<div class="dash-card eng-minhas"><div class="dash-card-h"><h3>Tarefas da engenharia</h3><span class="hoje-cont">'+l.length+'</span></div>'
      + l.map(function(t){ return '<div class="eng-tarefa"><div><b>'+escapeHtml(t.titulo)+'</b><small>'+(t.prazo ? 'prazo '+escapeHtml(fmtDateBR(t.prazo))+(t.prazo < hoje ? ' <span class="ncx-tag bad">vencido</span>' : '') : 'sem prazo')+' · pedida por '+escapeHtml(String(t.criadoPor||"").split("@")[0])+'</small>'
        + (t.descricao ? '<small>'+escapeHtml(t.descricao)+'</small>' : '')+'</div><button type="button" class="btn small primary" data-tarefa-feita="'+escapeHtml(t._id)+'">✓ Feita</button></div>'; }).join("")
      + '</div>';
  }
  var VIEW_IDS = { engenharia:"view-engenharia", dashboard:"view-dashboard", board:"view-board", pavimento:"view-pavimento", nc:"view-nc", ct:"view-ct", plantas:"view-plantas", aco:"view-aco", cronograma:"view-cronograma", historico:"view-historico", lixeira:"view-lixeira", equipe:"view-equipe", assinar:"view-assinar" };
  function switchView(nome){
    Object.keys(VIEW_IDS).forEach(function(k){
      var el = document.getElementById(VIEW_IDS[k]);
      if(el) el.hidden = (k!==nome);
    });
    document.querySelectorAll(".nav-btn[data-view], .ti-bn[data-view]").forEach(function(b){
      b.setAttribute("aria-current", b.getAttribute("data-view")===nome ? "page" : "false");
    });
    window.scrollTo(0, 0);
    if(nome==="engenharia") renderViewEngenharia();
    else if(nome==="dashboard") renderViewDashboard();
    else if(nome==="pavimento") renderViewPavimento();
    else if(nome==="nc") renderViewNc();
    else if(nome==="ct") renderViewCt();
    else if(nome==="plantas") renderViewPlantas();
    else if(nome==="aco") renderViewAco(document.getElementById("view-aco"));
    else if(nome==="cronograma") renderViewCronograma(document.getElementById("view-cronograma"));
    else if(nome==="historico") renderViewHistorico();
    else if(nome==="lixeira") renderViewLixeira();
    else if(nome==="equipe") renderViewEquipe();
    else if(nome==="assinar") renderViewAssinar();
    // "board" não precisa de um render próprio aqui: KPIs e lista já são
    // mantidos atualizados por render() independente de qual tela está
    // visível no momento.
  }

  /* ---------------- v1.5: avanço da estrutura (corte do prédio) ----------------
     Níveis 00–27 da obra (mesma numeração usada em pavimentoRank). Um pavimento
     conta como CONCRETADO quando existe rastreabilidade dele, e LIBERADO quando,
     além disso, todas as FVS dele estão fechadas. A porcentagem é a fração dos
     28 níveis já concretados. */
  var NIVEIS_OBRA = (function(){
    var n = ["Fundação", "Subsolo"], i;
    for(i=1;i<=5;i++) n.push(i+"º Embasamento");
    for(i=1;i<=17;i++) n.push(i+"º Pavimento Tipo");
    return n.concat(["Cobertura", "Dependência", "Pavimento Técnico", "Telhado"]);
  })();
  // "Piso do 1° Embasamento / Piso do 1° Pavimento Tipo" vale para os dois níveis
  function niveisDoTexto(lista){
    var out = [];
    (lista||[]).forEach(function(t){
      String(t||"").split("/").forEach(function(parte){
        var r = pavimentoRank(parte);
        if(r < NIVEIS_OBRA.length && out.indexOf(r)===-1) out.push(r);
      });
    });
    return out;
  }
  function avancoEstrutura(){
    var niveis = NIVEIS_OBRA.map(function(nome, rank){ return { rank:rank, nome:nome, rast:0, fvs:0, fvsFechadas:0, status:"nada" }; });
    rastMap.forEach(function(r){
      niveisDoTexto((r.pavimentos && r.pavimentos.length) ? r.pavimentos : [r.blocoPav]).forEach(function(k){ niveis[k].rast++; });
    });
    fvsMap.forEach(function(f){
      niveisDoTexto(fvsPavimentosList(f)).forEach(function(k){ niveis[k].fvs++; if(f.fechado) niveis[k].fvsFechadas++; });
    });
    var cont = { liberado:0, concretado:0, execucao:0, nada:0 }, topo = null;
    niveis.forEach(function(n){
      if(n.rast) n.status = (n.fvs && n.fvsFechadas===n.fvs) ? "liberado" : "concretado";
      else if(n.fvs) n.status = "execucao";
      cont[n.status]++;
      if(n.rast) topo = n.rank;
    });
    var pct = Math.round((cont.liberado + cont.concretado) / niveis.length * 100);
    // Previsto pelo cronograma (se enviado): até qual piso a estrutura já deveria estar
    var prev = estruturaPrevista(todayISO());
    var previsto = prev && prev.previsto!=null && prev.previsto>=0 ? prev.previsto : null;
    return { niveis:niveis, cont:cont, topo:topo, pct:pct, previsto:previsto };
  }

  /* ---------------- v1.14: etapas da obra × FVS (Fase 1) ----------------
     O cronograma diz em que etapa e pavimento está cada atividade (ver
     src/modulos/cronograma/etapas.js); aqui juntamos com as FVS do app.
     Só leitura: nada é gravado. */
  function indiceFvs(){
    var idx = {}, inicio = "";
    fvsMap.forEach(function(f){
      var tipo = f.tipo || "fvs04", ab = f.dataAbertura || f.dataConcretagem || "";
      if(ab && (!inicio || ab < inicio)) inicio = ab;
      niveisDoTexto(fvsPavimentosList(f)).forEach(function(k){
        var c = idx[tipo+"|"+k] || (idx[tipo+"|"+k] = { total:0, fechadas:0 });
        c.total++; if(f.fechado) c.fechadas++;
      });
    });
    return { inicio:inicio, doNivel:function(tipos, nivel){
      var r = { total:0, fechadas:0 };
      tipos.forEach(function(t){ var c = idx[t+"|"+nivel]; if(c){ r.total += c.total; r.fechadas += c.fechadas; } });
      return r;
    } };
  }
  // Abas do corte: Estrutura (o corte de sempre, pelas concretagens) + as etapas do cronograma
  function etapasDoCorte(){
    var hoje = todayISO(), eo = etapasDaObra(hoje), fx = indiceFvs();
    if(!eo) return { hoje:hoje, lista:[], fx:fx, eo:null };
    var lista = eo.resumo.filter(function(e){ return e.key!=="estrutura" && e.niveis.size; }).map(function(e){
      var tp = topoEtapa(e, hoje);
      return { key:e.key, nome:e.nome, curto:e.curto, et:e, pct:e.pct, topo:tp.topo, previsto:tp.previsto,
        inicio: e.ini && e.ini > hoje ? e.ini : "", temFvs: e.tiposFvs.length > 0 };
    });
    return { hoje:hoje, lista:lista, fx:fx, eo:eo };
  }
  function dadosCorteEtapa(item, fx){
    return { nome:item.nome, pct:item.pct, topo:item.topo, previsto:item.previsto, inicio:item.inicio, temFvs:item.temFvs,
      niveis: NIVEIS_OBRA.map(function(nome, rank){
        var s = situacaoNivel(item.et, rank, fx.doNivel, fx.inicio);
        return { rank:rank, nome:nome, st:s.st, pct:s.pct };
      }) };
  }
  // Estrutura no quadro/aba: mesmo status do corte de sempre, no vocabulário das etapas
  var ST_ESTRUTURA = { liberado:"liberado", concretado:"fvsaberta", execucao:"execucao", nada:"nada" };
  var etapaAba = (function(){ try{ return localStorage.getItem("traco-etapa-aba") || "estrutura"; }catch(e){ return "estrutura"; } })();
  var etapaModo = "corte"; // "corte" | "quadro"
  function cartaoAvancoHtml(){
    var dc = etapasDoCorte(), av = avancoEstrutura();
    var atual = dc.lista.find(function(x){ return x.key===etapaAba; });
    if(!atual) etapaAba = "estrutura";
    var mesAno = function(iso){ var p = fmtDateBR(iso).split("/"); return p.length===3 ? ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][+p[1]-1]+"/"+p[2].slice(2) : ""; };
    var abas = '<button type="button" class="chip" data-etapa-aba="estrutura" aria-pressed="'+(etapaAba==="estrutura")+'">Estrutura <small>'+av.pct+'%</small></button>'
      + dc.lista.map(function(x){
          var rot = x.inicio ? "começa "+mesAno(x.inicio) : (x.pct>=100 ? "✓" : x.pct+"%");
          return '<button type="button" class="chip'+(x.inicio?" futura":"")+'" data-etapa-aba="'+x.key+'" aria-pressed="'+(etapaAba===x.key)+'">'+escapeHtml(x.nome)+' <small>'+rot+'</small></button>';
        }).join("");
    var corpo;
    if(etapaModo==="quadro") corpo = quadroEtapasHtml(dc, av);
    else if(etapaAba==="estrutura") corpo = corteHtml(av);
    else corpo = corteEtapaHtml(dadosCorteEtapa(atual, dc.fx), fmtDateBR);
    return '<div class="dash-card dash-card-avanco"><div class="dash-card-h"><h3>Avanço da obra por etapa</h3>'
      + '<button type="button" class="mais" data-goto-view="pavimento">FVS por pavimento →</button></div>'
      + (dc.lista.length ? '<div class="etapa-abas" role="group" aria-label="Etapa">'+abas+'</div>'
          + '<div class="etapa-modo"><button type="button" class="btn small" data-etapa-modo>'+(etapaModo==="quadro" ? "Ver o corte do prédio" : "Ver em tabela (todas as etapas)")+'</button></div>' : '')
      + corpo + '</div>';
  }
  function quadroEtapasHtml(dc, av){
    var cols = [{ key:"estrutura", curto:"Estr." }].concat(dc.lista);
    var linhas = "";
    for(var r=NIVEIS_OBRA.length-1; r>=0; r--){
      var cel = cols.map(function(c){
        var st, pct = null;
        if(c.key==="estrutura"){ st = ST_ESTRUTURA[av.niveis[r].status]; }
        else { var s = situacaoNivel(c.et, r, dc.fx.doNivel, dc.fx.inicio); st = s.st; pct = s.pct; }
        var cls = { liberado:"liberado", fvsaberta:"concretado", concluido:"concretado", semfvs:"semfvs", execucao:"execucao", nada:"nada", na:"na" }[st];
        var txt = st==="na" ? "" : (st==="semfvs" ? "FVS?" : (st==="execucao" && pct!=null ? pct+"%" : (st==="nada" ? "" : "✓")));
        return '<td class="q-'+cls+'" title="'+escapeHtml(NIVEIS_OBRA[r]+" · "+(c.nome||"Estrutura"))+'">'+txt+'</td>';
      });
      if(cel.every(function(x){ return x.indexOf('q-na')!==-1 || x.indexOf('q-nada')!==-1; })) continue; // nível sem nada começado em nenhuma etapa
      linhas += '<tr><th>'+escapeHtml(NIVEIS_OBRA[r].replace(" Pavimento Tipo", "º Tipo").replace("ºº","º").replace(" Embasamento", "º Emb.").replace("ºº","º"))+'</th>'+cel.join("")+'</tr>';
    }
    var cab = '<tr><th></th>'+cols.map(function(c){ return '<th>'+escapeHtml(c.curto)+'</th>'; }).join("")+'</tr>';
    var leg = [["var(--accent-strong)","concluído, FVS fechada"],["var(--good-soft)","concluído"],["var(--bad-soft)","100% sem FVS"],["var(--warn-soft)","em andamento"],["var(--surface-2)","a executar"]]
      .map(function(x){ return '<span><i style="background:'+x[0]+'"></i>'+x[1]+'</span>'; }).join("");
    return '<div class="quadro-etapas">'+(linhas ? '<table><thead>'+cab+'</thead><tbody>'+linhas+'</tbody></table>' : '<div class="dash-vazio">Nenhum pavimento iniciado ainda.</div>')
      + '<div class="q-leg">'+leg+'</div><div class="cp-dica" style="margin-top:6px">Estrutura pelas concretagens e FVS do app; as outras etapas pelo % do cronograma. Só aparecem os pavimentos com algo começado.</div></div>';
  }
  // Abre uma FVS nova já com o pavimento (e o tipo, quando a etapa só tem um)
  function abrirNovaFvsDoCronograma(tipos, nivel){
    var pav = pisoNome(nivel);
    // estrutura: a ficha da laje é sempre a FVS 04 (forma, armação e concretagem)
    if(tipos.length===1 || tipos[0]==="fvs04") openModal("fvs", null, tipos[0], { pavimento:pav });
    else openTipoChooser(function(k){ openModal("fvs", null, k, { pavimento:pav }); });
  }
  function nomeTipoFvs(tipos){
    if(tipos.length!==1 && tipos[0]!=="fvs04") return "FVS";
    var t = todosTiposFvs().find(function(x){ return x.key===tipos[0]; });
    return t ? t.codigo : "FVS";
  }

  /* ---------------- v1.6: assistente "Hoje você precisa…" (regras, sem IA) ----------------
     Junta o que exige ação hoje em todas as áreas, dá uma prioridade (maior =
     mais urgente) e o Início mostra as 5 primeiras. Cada sugestão leva direto
     ao registro. Nada é gravado: é só leitura dos dados já carregados. */
  function sugestoesDeHoje(){
    var hoje = todayISO(), amanha = ctSomarDias(hoje, 1), out = [];
    var dias = function(a, b){ return diffDias(a, b) || 0; };
    // 1) Corpos de prova — agrupados por concretagem + idade (uma concretagem
    //    tem várias NFs; cobrar/romper é feito por lote no laboratório)
    var grupos = {};
    var grupo = function(chave, base){ return grupos[chave] || (grupos[chave] = Object.assign({ nfs:[], locais:{} }, base)); };
    var decidir = [];
    ctRowsArray().forEach(function(r){
      var loc = (r.local||"").split(/[—-]/)[0].trim() || "sem local";
      CT_IDADES.forEach(function(i){
        var st = ctStatusIdade(r, i), d = r[i.dataCampo];
        var g = null;
        if(st==="pendente") g = grupo("p|"+i.key+"|"+r.dataConcretagem, { tipo:"pendente", idade:i.key, conc:r.dataConcretagem, venc:d });
        else if(st==="aguardando" && (d===hoje || d===amanha)) g = grupo("r|"+i.key+"|"+d, { tipo:"romper", idade:i.key, conc:r.dataConcretagem, venc:d, lab:r.laboratorio });
        if(g){ g.nfs.push(r); g.locais[loc] = 1; }
      });
      // v1.18: justificativa na planilha (ou já justificada) → o dono decide se conclui
      if(ctSituacao(r)==="decidir") decidir.push(r);
      // v1.16: abaixo do fck aos 28 ou 63 dias → justificativa (causa + resolução) obrigatória
      if(ctJustPendente(r)){
        var idsAb = ctAbaixoEm(r);
        out.push({ cat:"ct-fck", prio: 75, icone:"alert", tom:"bad",
          titulo:"Justificar resultado abaixo do fck — NF "+r.notaRemessa,
          sub:loc+" · "+idsAb.map(function(i){ return i+"d "+String(i==="28" ? ctMelhor28(r) : ctMelhor63(r)).replace(".", ",")+" MPa"; }).join(" · ")+" de "+r.fck+" MPa: informar causa e resolução",
          abrir:{ ct:r._id } });
      }
    });
    if(decidir.length) out.push({ cat:"ct-decidir", prio: 62, icone:"flask", tom:"warn",
      titulo: decidir.length===1 ? "Decidir: concluir a NF "+decidir[0].notaRemessa+"?" : decidir.length+" notas de concreto esperam a sua decisão",
      sub: decidir.length===1 ? "justificativa: "+(ctObsJustificativa(decidir[0]) || ((decidir[0].justificativaFck||{}).causa||"")) : "têm justificativa — conclua ou deixe em aberto",
      abrir: decidir.length===1 ? { ct:decidir[0]._id } : { view:"ct" } });
    Object.keys(grupos).forEach(function(k){
      var g = grupos[k], n = g.nfs.length, locais = Object.keys(g.locais).join(", ");
      var alvo = n===1 ? { ct:g.nfs[0]._id } : { view:"ct" };
      var nfsTxt = n===1 ? "NF "+g.nfs[0].notaRemessa : n+" notas";
      if(g.tipo==="pendente") out.push({ cat:"ct-atraso", prio: 70 + Math.min(20, dias(g.venc, hoje)), icone:"flask", tom:"bad",
        titulo:"Cobrar resultado de "+g.idade+" dias — "+nfsTxt+" da concretagem de "+fmtDateBR(g.conc).slice(0,5),
        sub:locais+" · venceu em "+fmtDateBR(g.venc)+" ("+dias(g.venc, hoje)+" dia(s))", abrir:alvo });
      else out.push({ cat:"ct-romper", prio: g.venc===hoje ? 85 : 60, icone:"flask", tom:"warn",
        titulo:"Romper CPs de "+g.idade+" dias "+(g.venc===hoje ? "hoje" : "amanhã")+" — "+nfsTxt+" de "+fmtDateBR(g.conc).slice(0,5),
        sub:locais+(g.lab ? " · "+g.lab : ""), abrir:alvo });
    });
    // 2) Cronograma: atividades críticas atrasadas ou que terminam hoje/amanhã
    var cr = cronogramaAtual();
    if(cr){
      cr.tarefas.forEach(function(t){
        if(t.resumo || !t.ini || t.pct>=100 || t.folga==null) return;
        var nome = t.nome.length<=6 && t.caminho.length ? t.caminho[t.caminho.length-1]+" — "+t.nome : t.nome;
        if(t.folga<=0 && t.fim < hoje) out.push({ cat:"cron", prio: 80 + Math.min(15, dias(t.fim, hoje)), icone:"clock", tom:"bad",
          titulo:"Atividade crítica atrasada: "+nome, sub:"terminava em "+fmtDateBR(t.fim)+" · "+t.pct+"% · atraso aqui atrasa a obra", abrir:{ view:"cronograma" } });
        else if(t.folga<=0 && (t.fim===hoje || t.fim===amanha)) out.push({ cat:"cron", prio: 65, icone:"clock", tom:"warn",
          titulo:"Concluir "+(t.fim===hoje ? "hoje" : "amanhã")+" (crítica): "+nome, sub:t.pct+"% feito · "+(t.caminho[0]||""), abrir:{ view:"cronograma" } });
      });
      var prev = estruturaPrevista(hoje), av = avancoEstrutura();
      if(prev && prev.previsto!=null && av.topo!=null && av.topo < prev.previsto) out.push({ cat:"estrutura", prio: 72, icone:"layers", tom:"bad",
        titulo:"Estrutura "+(prev.previsto-av.topo)+" pavimento(s) atrás do cronograma",
        sub:"executado até "+NIVEIS_OBRA[av.topo]+" · previsto "+NIVEIS_OBRA[prev.previsto], abrir:{ view:"cronograma" } });
    }
    // 2b) v1.14: etapa concluída no cronograma sem a FVS daquele pavimento
    var dcH = etapasDoCorte();
    if(dcH.eo){
      fvsPedidas(dcH.eo.cr, dcH.eo.classif, dcH.eo.resumo, dcH.fx.doNivel, dcH.fx.inicio, hoje, hoje).faltando.forEach(function(x){
        var d = x.fim ? dias(x.fim, hoje) : 0;
        out.push({ cat:"fvs-falta", prio: 48 + Math.max(0, 12 - Math.floor(d/7)), icone:"check", tom:"warn",
          titulo:"Falta FVS: "+x.nomeEtapa+" · "+pisoNome(x.nivel),
          sub:"100% no cronograma"+(x.fim ? " (terminou "+fmtDateBR(x.fim)+")" : "")+" · "+nomeTipoFvs(x.tiposFvs)+" não aberta",
          abrir:{ novaFvs: x.tiposFvs.join(",")+"|"+x.nivel } });
      });
    }
    // 3) Não conformidades abertas há muito tempo
    todasNaoConformidades().forEach(function(n){
      if(n.concluida || n.diasAberto==null || n.diasAberto < 15) return;
      out.push({ cat:"nc", prio: 40 + Math.min(25, Math.floor(n.diasAberto/10)), icone:"alert", tom:"bad",
        titulo:"NC aberta há "+n.diasAberto+" dias: "+(n.descricao||"(sem descrição)"), sub:(n.ficha.codigo||"FVS")+" "+(n.ficha.numero||"")+" · "+(n.pavimentos[0]||n.ficha.local||""),
        abrir:{ fvs:n.fichaId } });
    });
    // 4) Aço: entrega atrasada / hoje / amanhã
    acoListaComConcretagem().forEach(function(e){
      var st = acoSituacao(e, hoje), kg = acoPeso(e);
      var desc = (e.fornecedor||"")+(kg ? " · "+(Math.round(kg/100)/10).toString().replace(".", ",")+" t" : "")+(e.destino ? " · "+e.destino : "");
      if(st==="atrasada") out.push({ cat:"aco", prio: 68, icone:"truck", tom:"bad", titulo:"Entrega de aço atrasada — pedido "+(e.pedido||"s/ nº"),
        sub:desc+" · previa "+fmtDateBR(e.dataPrevista), abrir:{ view:"aco" } });
      else if(st==="programada" && (e.dataPrevista===hoje || e.dataPrevista===amanha)) out.push({ cat:"aco", prio: e.dataPrevista===hoje ? 62 : 50, icone:"truck", tom:"warn",
        titulo:"Receber aço "+(e.dataPrevista===hoje ? "hoje" : "amanhã")+" — pedido "+(e.pedido||"s/ nº"), sub:desc+" · preparar local de descarga", abrir:{ view:"aco" } });
    });
    // 4b) v1.10: laje do cronograma começando sem aço programado (ou chegando tarde)
    acoLajes().forEach(function(x){
      if(x.tipo==="ok") return;
      var t = acoTextoLaje(x, fmtDateBR);
      out.push({ cat:"aco", prio: (x.tipo==="tarde" ? 45 : 55) + Math.max(0, 21 - Math.max(0, x.diasParaInicio)), icone:"truck", tom: x.tipo==="tarde" ? "warn" : "bad",
        titulo:t.titulo, sub:t.sub, abrir:{ view:"aco" } });
    });
    // 5) Concretagem acima de 2h30 sem ação corretiva
    rastMap.forEach(function(r, id){
      if(rastStatus(r).key==="pendente") out.push({ cat:"rast", prio: 58, icone:"truck", tom:"warn",
        titulo:"Registrar ação corretiva — concretagem "+fmtDateBR(r.data), sub:(r.blocoPav||"")+" · betonada acima de 2h30", abrir:{ rast:id } });
    });
    // 6) FVS aberta muito depois da concretagem
    fvsMap.forEach(function(f, id){
      var base = f.dataConcretagem || f.dataAbertura;
      if(f.fechado || !base) return;
      var d = dias(base, hoje);
      if(d >= 10) out.push({ cat:"fvs", prio: 30 + Math.min(20, Math.floor(d/5)), icone:"check", tom:"info",
        titulo:"Fechar "+(f.codigo||"FVS")+" · "+(f.numero||"s/ nº"), sub:(fvsPavimentosList(f)[0]||f.local||"")+" · aberta há "+d+" dias da concretagem", abrir:{ fvs:id } });
    });
    // 7) v1.18: fichas dos últimos 30 dias sem a SUA assinatura (pelo papel cadastrado)
    if(minhaAssinatura && !somenteLeitura){
      var papelA = minhaAssinatura.papel || "engenheiro", desdeA = ctSomarDias(hoje, -30), faltaA = [];
      var semMinha = function(d){ return !(d.assinaturas||[]).some(function(a){ return a.papel===papelA || (papelA!=="engenheiro" && papelA!=="encarregado" && (a.papel==="tecnico" || a.papel==="estagiario")); }); };
      if(papelA!=="encarregado"){
        fvsMap.forEach(function(f, id){ var dt = f.dataConcretagem||f.dataAbertura||""; if(dt>=desdeA && semMinha(f)) faltaA.push({ fvs:id }); });
        rastMap.forEach(function(r, id){ if((r.data||"")>=desdeA && semMinha(r)) faltaA.push({ rast:id }); });
      }
      if(faltaA.length) out.push({ cat:"assinar", prio: 52, icone:"check", tom:"warn",
        titulo: faltaA.length===1 ? "Assinar 1 ficha" : "Assinar "+faltaA.length+" fichas (FVS e rastreabilidade)",
        sub:"dos últimos 30 dias, ainda sem a assinatura de "+(PAPEIS_ASSIN[papelA]||papelA).toLowerCase(),
        abrir: faltaA.length===1 ? faltaA[0] : { view:"board" } });
    }
    out.sort(function(a,b){ return b.prio - a.prio; });
    return out;
  }
  // v1.18: aço × concretagem — pavimento concretado = aço chegou (não cobra)
  function acoConcretadas(){
    var lista = [];
    rastMap.forEach(function(r){ lista.push({ data:r.data, niveis:niveisDoTexto((r.pavimentos && r.pavimentos.length) ? r.pavimentos : [r.blocoPav]) }); });
    return acoConcretadasPorChave(lista);
  }
  function acoListaComConcretagem(){
    var conc = acoConcretadas();
    return Array.from(acoMap.values()).map(function(e){
      var d = acoChegouPelaConcretagem(e, conc);
      return d ? Object.assign({}, e, { _concretadoEm:d }) : e;
    });
  }
  function acoLajes(){ return acoParaLajes(cronogramaAtual(), acoListaComConcretagem(), todayISO(), { concretadas:acoConcretadas() }); }
  // As 5 principais com variedade: no máximo 2 por área (o resto fica em "ver todas")
  function principaisDeHoje(lista, max){
    var porCat = {}, top = [];
    lista.forEach(function(x){
      if(top.length >= max) return;
      var c = x.cat.split("-")[0];
      if((porCat[c]||0) >= 2) return;
      porCat[c] = (porCat[c]||0) + 1; top.push(x);
    });
    return top;
  }

  /* ---------------- painel geral (tela inicial) ---------------- */
  // v1.17: "12 de 40 notas concluídas · 230 anteriores ao sistema" (cartão do Início)
  function ctResumoConclusao(){
    var rows = ctRowsArray(), ant = 0, conc = 0, tot = 0;
    var dec = 0;
    rows.forEach(function(r){ if(ctAnterior(r)){ ant++; return; } tot++; if(ctConcluidaRegra(r)) conc++; if(ctSituacao(r)==="decidir") dec++; });
    return conc+" de "+tot+" nota(s) concluída(s)"+(dec ? " · "+dec+" para você decidir" : "")+(ant ? " · "+ant+" anterior(es) ao sistema" : "");
  }
  function renderViewDashboard(){
    var container = document.getElementById("view-dashboard");
    if(!container) return;

    var totalFvs = fvsMap.size, totalRast = rastMap.size;
    var fvsAbertas = 0;
    fvsMap.forEach(function(f){ if(fvsStatus(f).key==="aberto") fvsAbertas++; });
    var todasNc = todasNaoConformidades();
    var ncAbertas = todasNc.filter(function(i){ return !i.concluida; }).length;
    var ctPendentes = ctRowsArray().filter(ctPendente).length;
    var rastPendentes = 0;
    rastMap.forEach(function(r){ if(rastStatus(r).key==="pendente") rastPendentes++; });

    // v1.3: Início no formato da prévia aprovada — números que levam direto
    // à tela certa e listas do que precisa de atenção hoje.
    var kpiCards = [
      { n:fvsAbertas, l:"FVS em aberto", t:"info", d:totalFvs+" fichas no total", ir:"board", sit:"aberto" },
      { n:ncAbertas, l:"NCs em aberto", t:"nc", d:todasNc.length+" registradas", ir:"nc" },
      { n:ctPendentes, l:"Notas de CP pendentes", t:"pendente", d:ctResumoConclusao(), ir:"ct", pend:true },
      { n:rastPendentes, l:"Concretagens com pendência", t:rastPendentes?"pendente":"ok", d:"acima de 2h30 sem ação corretiva", ir:"board", sit:"pendente" }
    ];
    var kpisHtml = '<div class="dash-kpis">' + kpiCards.map(function(c){
      return '<button type="button" class="dash-kpi-card tone-'+c.t+'" data-goto-view="'+c.ir+'"'+(c.sit?' data-sit-ir="'+c.sit+'"':'')+(c.pend?' data-ct-pend="1"':'')+'>'
        + '<div class="n">'+c.n+'</div><div class="l">'+escapeHtml(c.l)+'</div><div class="d">'+escapeHtml(c.d)+'</div></button>';
    }).join("") + '</div>';

    function li(attrs, icone, tom, titulo, sub, dir, dirTom){
      return '<div class="dash-li" '+attrs+'><span class="ic '+(tom||"")+'"><svg class="ti-i" data-i="'+icone+'"></svg></span>'
        + '<span class="tx"><b>'+escapeHtml(titulo)+'</b><small>'+escapeHtml(sub||"")+'</small></span>'
        + (dir?'<span class="dir '+(dirTom||"")+'">'+escapeHtml(dir)+'</span>':'')+'</div>';
    }
    function cartao(titulo, irPara, rotuloIr, itensHtml, vazio){
      return '<div class="dash-card"><div class="dash-card-h"><h3>'+escapeHtml(titulo)+'</h3>'
        + '<button type="button" class="mais" data-goto-view="'+irPara+'">'+escapeHtml(rotuloIr)+' →</button></div>'
        + (itensHtml || '<div class="dash-vazio">'+escapeHtml(vazio)+'</div>') + '</div>';
    }
    // NCs abertas há mais tempo
    var ncLista = todasNc.filter(function(i){ return !i.concluida; })
      .sort(function(a,b){ return (b.diasAberto||0)-(a.diasAberto||0); }).slice(0,5).map(function(i){
        return li('data-abrir-fvs="'+escapeHtml(i.fichaId)+'"', "alert", "bad", i.descricao||"(sem descrição)",
          (i.ficha.codigo||"FVS")+" "+(i.ficha.numero||"s/ nº")+" · "+(i.pavimentos[0]||i.ficha.local||""),
          (i.diasAberto!=null? i.diasAberto+" dia(s)" : ""), (i.diasAberto>7?"bad":""));
      }).join("");
    // Corpos de prova com resultado atrasado
    var ctLista = ctRowsArray().filter(ctPendente).slice(0,5).map(function(r){
      var idades = ctIdadesPendentes(r).map(function(x){ return x.key+"d"; }).join(", ");
      var sitR = ctSituacao(r);
      return li('data-hoje-ct="'+escapeHtml(r._id)+'"', "flask", "warn", (r.local||"(sem local)"),
        "NF "+r.notaRemessa+" · "+(r.concreteira||"")+" · concretado "+fmtDateBR(r.dataConcretagem)+(r.observacao ? " · Obs.: "+r.observacao : ""),
        idades ? "falta "+idades : (sitR==="decidir" ? "você decide" : "abaixo do fck"), "bad");
    }).join("");
    // FVS em aberto mais recentes
    var fvsLista = [];
    fvsMap.forEach(function(f, id){ if(fvsStatus(f).key==="aberto") fvsLista.push({id:id, f:f}); });
    fvsLista = fvsLista.sort(function(a,b){ return (b.f.dataConcretagem||b.f.dataAbertura||"").localeCompare(a.f.dataConcretagem||a.f.dataAbertura||""); })
      .slice(0,5).map(function(x){
        var st = fvsStatus(x.f);
        return li('data-abrir-fvs="'+escapeHtml(x.id)+'"', "check", st.nc?"bad":"info",
          (x.f.codigo||"FVS")+" · "+(x.f.numero||"s/ nº")+" — "+(x.f.descricao||""),
          (fvsPavimentosList(x.f)[0]||x.f.local||"sem local"), fmtDateBR(x.f.dataConcretagem||x.f.dataAbertura));
      }).join("");
    // Últimas concretagens
    var rastLista = [];
    rastMap.forEach(function(r, id){ rastLista.push({id:id, r:r}); });
    rastLista = rastLista.sort(function(a,b){ return (b.r.data||"").localeCompare(a.r.data||""); }).slice(0,4).map(function(x){
      var st = rastStatus(x.r), vol = 0;
      (x.r.linhas||[]).forEach(function(l){ var v = parseFloat(String(l.volBetoneira||"").replace(",", ".")); if(!isNaN(v)) vol += v; });
      return li('data-abrir-rast="'+escapeHtml(x.id)+'"', "truck", st.key==="pendente"?"warn":"",
        "Concretagem — "+(x.r.blocoPav||(x.r.pavimentos||[])[0]||"sem local"),
        (x.r.linhas||[]).length+" betonada(s)"+(vol? " · "+String(Math.round(vol*10)/10).replace(".", ",")+" m³":""), fmtDateBR(x.r.data));
    }).join("");

    // Próximas entregas de aço (atrasadas primeiro)
    var hojeAco = todayISO();
    var acoLista = proximasEntregas(acoListaComConcretagem(), hojeAco, 5).map(function(e){
      var st = acoSituacao(e, hojeAco), p = acoPeso(e);
      return li('data-goto-view="aco"', "truck", st==="atrasada"?"bad":"info",
        "Pedido "+(e.pedido||"s/ nº")+" · "+(e.fornecedor||""),
        (e.destino||"sem destino")+(p? " · "+Math.round(p).toLocaleString("pt-BR")+" kg":""),
        st==="atrasada" ? "atrasada" : fmtDateBR(e.dataPrevista), st==="atrasada"?"bad":"");
    }).join("");
    // v1.6: "Hoje você precisa…" — as 5 ações mais urgentes de todas as áreas
    var sugest = sugestoesDeHoje();
    var visiveis = window.__hojeTudo ? sugest : principaisDeHoje(sugest, 5);
    var hojeHtml = '<div class="dash-card dash-card-hoje"><div class="dash-card-h"><h3>Hoje você precisa…</h3>'
      + '<span class="hoje-cont">'+(sugest.length ? sugest.length+" pendência(s)" : "")+'</span></div>'
      + (sugest.length ? visiveis.map(function(x, i){
          var alvo = x.abrir.novaFvs ? 'data-nova-fvs="'+escapeHtml(x.abrir.novaFvs)+'"' : x.abrir.fvs ? 'data-abrir-fvs="'+escapeHtml(x.abrir.fvs)+'"' : (x.abrir.rast ? 'data-abrir-rast="'+escapeHtml(x.abrir.rast)+'"'
            : (x.abrir.ct ? 'data-hoje-ct="'+escapeHtml(x.abrir.ct)+'"' : 'data-goto-view="'+x.abrir.view+'"'));
          return li(alvo, x.icone, x.tom, x.titulo, x.sub, String(i+1), "");
        }).join("")
        + (sugest.length > 5 ? '<button type="button" class="hoje-mais" data-hoje-tudo>'+(window.__hojeTudo ? "Mostrar só as 5 principais" : "Ver todas as "+sugest.length)+'</button>' : '')
        : '<div class="dash-vazio">Nada urgente por enquanto. 👍</div>')
      + '</div>';
    // Metas da semana a partir do cronograma (caminho crítico primeiro)
    var metas = metasDaSemana(todayISO(), 8);
    var metasHtml = "";
    if(metas){
      metasHtml = '<div class="dash-card dash-card-metas"><div class="dash-card-h"><h3>Metas da semana · cronograma</h3>'
        + '<button type="button" class="mais" data-goto-view="cronograma">Cronograma →</button></div>'
        + '<div class="metas-resumo">Semana de '+fmtDateBR(metas.semana.ini).slice(0,5)+' a '+fmtDateBR(metas.semana.fim).slice(0,5)
          + ' · <b>'+metas.total+'</b> atividade(s) · <b class="'+(metas.criticas?"txt-bad":"")+'">'+metas.criticas+'</b> no caminho crítico'
          + (metas.atrasadas ? ' · <b class="txt-bad">'+metas.atrasadas+'</b> atrasada(s) no total' : '')+'</div>'
        + (function(){ var av = avancoObra(todayISO()); if(!av) return "";
            var dif = av.real - av.previsto;
            return '<div class="metas-avanco"><div class="cr-barra" title="real '+av.real+'% · previsto '+av.previsto+'%"><i class="real" style="width:'+av.real+'%"></i><i class="prev" style="left:'+av.previsto+'%"></i></div>'
              + '<span>Obra <b>'+av.real+'%</b> concluída · previsto hoje '+av.previsto+'% · <b class="'+(dif<0?"txt-bad":"")+'">'+(dif>=0?"+":"")+dif+' p.p.</b></span></div>'; })()
        + (metas.itens.length ? metas.itens.map(function(x){
            var t = x.t;
            // "E5", "3º", "COB": nome curto é o pavimento — mostra o serviço junto
            var servico = t.caminho.slice(-1)[0]||"";
            var titulo = t.nome.length<=6 && servico ? servico.charAt(0)+servico.slice(1).toLowerCase()+" — "+t.nome : t.nome;
            return li('data-goto-view="cronograma"', x.crit ? "alert" : "clock", x.crit ? "bad" : (x.terminaNaSemana ? "warn" : "info"),
              titulo, (t.caminho.slice(-2)[0]||"")+(x.terminaNaSemana ? " · termina "+fmtDateBR(t.fim).slice(0,5) : " · até "+fmtDateBR(t.fim).slice(0,5)),
              (x.crit ? "crítica · " : "")+t.pct+"%", x.crit ? "bad" : "");
          }).join("") : '<div class="dash-vazio">Nenhuma atividade prevista para esta semana.</div>')
        + fvsDaSemanaHtml(metas.semana)
        + '</div>';
    }
    // v1.14: FVS que as atividades desta semana vão pedir (ainda não abertas)
    function fvsDaSemanaHtml(sem){
      var dc = etapasDoCorte();
      if(!dc.eo) return "";
      var ped = fvsPedidas(dc.eo.cr, dc.eo.classif, dc.eo.resumo, dc.fx.doNivel, dc.fx.inicio, sem.ini, sem.fim).semana;
      if(!ped.length) return "";
      return '<div class="metas-resumo" style="margin-top:10px"><b>FVS da semana</b> · '+ped.length+' ficha(s) a abrir pelo cronograma</div>'
        + ped.slice(0, 6).map(function(x){
            var t = x.tarefa;
            return '<div class="dash-li"><span class="ic info"><svg class="ti-i" data-i="check"></svg></span>'
              + '<span class="tx"><b>'+escapeHtml(nomeTipoFvs(x.tiposFvs)+" · "+pisoNome(x.nivel))+'</b><small>'+escapeHtml(x.nomeEtapa+" — "+t.nome+(t.ini>todayISO() ? " · começa "+fmtDateBR(t.ini).slice(0,5) : " · até "+fmtDateBR(t.fim).slice(0,5)))+'</small></span>'
              + '<button type="button" class="btn small primary fvs-semana-acao" data-nova-fvs="'+escapeHtml(x.tiposFvs.join(",")+"|"+x.nivel)+'">Abrir FVS</button></div>';
          }).join("")
        + (ped.length>6 ? '<div class="cp-dica" style="padding:4px 2px">e mais '+(ped.length-6)+'.</div>' : '');
    }
    var agora = new Date();
    var dataTxt = agora.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" });
    var h = agora.getHours(), saud = h<12 ? "Bom dia" : (h<18 ? "Boa tarde" : "Boa noite");
    var primeiroNome = (currentUserEmail.split("@")[0].split(/[._-]/)[0]||"");
    primeiroNome = primeiroNome ? primeiroNome.charAt(0).toUpperCase()+primeiroNome.slice(1) : "";

    container.innerHTML =
      '<div class="dash-header">'
        + '<div class="dash-data">'+escapeHtml(dataTxt)+'</div>'
        + '<h2>'+saud+(primeiroNome?", "+escapeHtml(primeiroNome):"")+'</h2>'
        + '<button type="button" class="btn small dash-relatorio" data-relatorio-semana title="Resumo da semana em uma página A4 (imprimir ou salvar em PDF)"><svg class="ti-i" data-i="file"></svg>Resumo da semana</button>'
        + '<p class="dash-sub">'+escapeHtml(DEFAULT_OBRA)+'</p>'
      + '</div>'
      + tarefasInicioHtml()
      + hojeHtml
      + kpisHtml
      + cartaoAvancoHtml()
      + metasHtml
      + '<div class="dash-grid">'
        + cartao("Não conformidades abertas há mais tempo", "nc", "Todas", ncLista, "Nenhuma NC em aberto. 👍")
        + cartao("Corpos de prova com resultado atrasado", "ct", "Controle tecnológico", ctLista, "Nenhum resultado atrasado.")
        + cartao("Fichas FVS em aberto", "board", "Todas as fichas", fvsLista, "Nenhuma ficha em aberto.")
        + cartao("Últimas concretagens", "board", "Rastreabilidades", rastLista, "Nenhuma rastreabilidade lançada ainda.")
        + cartao("Próximas entregas de aço", "aco", "Entregas de aço", acoLista, "Nenhuma entrega de aço programada.")
      + '</div>';
    pintarIcones(container);
    // corte do prédio: tocar num pavimento abre "FVS por pavimento" filtrado nele
    container.querySelectorAll("[data-nivel]").forEach(function(el){
      el.addEventListener("click", function(){
        var rank = +el.getAttribute("data-nivel");
        var canon = pavimentosCanonicos(buildRows()).find(function(c){ return c.rank===rank; });
        filtrosPav.pavimento = canon ? canon.label : "";
        switchView("pavimento");
      });
    });

    container.querySelectorAll("[data-goto-view]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var sit = btn.getAttribute("data-sit-ir");
        if(sit){
          filters.sit = sit;
          document.querySelectorAll("#f-situacao .chip").forEach(function(c){ c.setAttribute("aria-pressed", c.getAttribute("data-sit")===sit ? "true":"false"); });
          render();
        }
        if(btn.getAttribute("data-ct-pend")) filtrosCt.somentePendentes = true;
        switchView(btn.getAttribute("data-goto-view"));
      });
    });
    container.querySelectorAll("[data-abrir-fvs]").forEach(function(el){
      el.addEventListener("click", function(){ openModal("fvs", el.getAttribute("data-abrir-fvs")); });
    });
    // v1.14: abas do corte por etapa, tabela e "abrir FVS" vindos do cronograma
    container.querySelectorAll("[data-etapa-aba]").forEach(function(el){
      el.addEventListener("click", function(){
        etapaAba = el.getAttribute("data-etapa-aba"); etapaModo = "corte";
        try{ localStorage.setItem("traco-etapa-aba", etapaAba); }catch(e){}
        renderViewDashboard();
      });
    });
    var bModo = container.querySelector("[data-etapa-modo]");
    if(bModo) bModo.addEventListener("click", function(){ etapaModo = etapaModo==="quadro" ? "corte" : "quadro"; renderViewDashboard(); });
    container.querySelectorAll("[data-nova-fvs]").forEach(function(el){
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        if(somenteLeitura) return; // conta só de visualização: vê o aviso, não abre ficha
        var p = el.getAttribute("data-nova-fvs").split("|");
        abrirNovaFvsDoCronograma(p[0].split(","), +p[1]);
      });
    });
    container.querySelectorAll("[data-hoje-ct]").forEach(function(el){
      el.addEventListener("click", function(){ abrirFichaNf(el.getAttribute("data-hoje-ct")); });
    });
    container.querySelector("[data-relatorio-semana]").addEventListener("click", abrirRelatorioSemana);
    container.querySelectorAll("[data-tarefa-feita]").forEach(function(b){ b.addEventListener("click", function(){
      tarefasCol.doc(b.getAttribute("data-tarefa-feita")).set({ status:"feita", feitaPor:currentUserEmail||"", feitaEm:nowISO(), atualizadoEm:nowISO() }, { merge:true });
    }); });
    var bt = container.querySelector("[data-hoje-tudo]");
    if(bt) bt.addEventListener("click", function(){ window.__hojeTudo = !window.__hojeTudo; renderViewDashboard(); });
    container.querySelectorAll("[data-abrir-rast]").forEach(function(el){
      el.addEventListener("click", function(){ openModal("rast", el.getAttribute("data-abrir-rast")); });
    });
  }

  /* ---------------- v1.10: relatório da semana (uma página A4) ----------------
     Monta um resumo de tudo e abre a impressão do navegador ("Salvar como PDF"
     no celular/computador). Só leitura: nada é gravado. */
  function abrirRelatorioSemana(){
    var hoje = todayISO(), sem = semanaDe(hoje, 0), semAnt = semanaDe(hoje, -1);
    var dm = function(iso){ return fmtDateBR(iso).slice(0,5); };
    // textos longos (descrição de NC, local da NF) são cortados para caber numa folha
    var e = function(t, n){ t = String(t==null?"":t); n = n || 95; return escapeHtml(t.length>n ? t.slice(0, n-1).trim()+"…" : t); };
    var nomeTarefa = function(t){ var s = t.caminho.slice(-1)[0]||""; return t.nome.length<=6 && s ? s.charAt(0)+s.slice(1).toLowerCase()+" — "+t.nome : t.nome; };
    var bloco = function(titulo, corpo){ return '<section><h3>'+e(titulo)+'</h3>'+corpo+'</section>'; };
    var lista = function(itens, vazio, max){
      max = max || 8;
      if(!itens.length) return '<p class="rel-vazio">'+e(vazio)+'</p>';
      return '<ul>'+itens.slice(0, max).map(function(x){ return '<li>'+x+'</li>'; }).join("")+(itens.length>max ? '<li class="rel-mais">… e mais '+(itens.length-max)+'</li>' : '')+'</ul>';
    };
    // cronograma
    var av = avancoObra(hoje), metas = metasDaSemana(hoje, 8), est = avancoEstrutura();
    var cron = av ? '<div class="rel-num"><b>'+av.real+'%</b> concluído · previsto '+av.previsto+'% · <b class="'+(av.real<av.previsto?"rel-bad":"")+'">'+(av.real-av.previsto>=0?"+":"")+(av.real-av.previsto)+' p.p.</b></div>' : '<p class="rel-vazio">Cronograma não carregado.</p>';
    if(metas) cron += lista(metas.itens.map(function(x){ return (x.crit ? '<b class="rel-bad">crítica</b> · ' : '')+e(nomeTarefa(x.t))+' — '+x.t.pct+'% · até '+dm(x.t.fim); }), "Nenhuma atividade prevista nesta semana.")
      + (metas.atrasadas ? '<p class="rel-bad">'+metas.atrasadas+' atividade(s) atrasada(s) no cronograma.</p>' : '');
    var estTxt = '<div class="rel-num">Executado até <b>'+e(est.topo!=null ? NIVEIS_OBRA[est.topo] : "—")+'</b>'
      + (est.previsto!=null ? ' · previsto '+e(NIVEIS_OBRA[est.previsto]) : '')+' · '+est.pct+'% da estrutura</div>';
    // concretagens da semana passada e desta
    var conc = [];
    rastMap.forEach(function(r){
      if(!r.data || r.data < semAnt.ini || r.data > sem.fim) return;
      var vol = 0; (r.linhas||[]).forEach(function(l){ var v = parseFloat(String(l.volBetoneira||"").replace(",", ".")); if(!isNaN(v)) vol += v; });
      conc.push({ d:r.data, t:dm(r.data)+' · '+e(r.blocoPav||(r.pavimentos||[])[0]||"sem local")+' · '+(r.linhas||[]).length+' BT'+(vol ? ' · '+String(Math.round(vol*10)/10).replace(".", ",")+' m³' : '') });
    });
    conc.sort(function(a,b){ return a.d.localeCompare(b.d); });
    // controle tecnológico
    var rows = ctRowsArray();
    var ctAtr = rows.filter(ctTemPendencia), ctAbx = rows.filter(ctAbaixoFck), ctRomp = rows.filter(ctRomperEmBreve);
    var ct = '<div class="rel-num"><b class="'+(ctAtr.length?"rel-bad":"")+'">'+ctAtr.length+'</b> resultado(s) atrasado(s) · <b class="'+(ctAbx.length?"rel-bad":"")+'">'+ctAbx.length+'</b> abaixo do fck · <b>'+ctRomp.length+'</b> a romper em 7 dias</div>'
      + lista(ctAbx.map(function(r){ return 'NF '+e(r.notaRemessa)+' · '+e(r.local||"", 45)+' · 28d '+e(String(ctMelhor28(r)).replace(".", ","))+' de '+e(r.fck)+' MPa'; }), "Nenhum resultado abaixo do fck.", 5);
    // NCs
    var ncs = todasNaoConformidades().filter(function(n){ return !n.concluida; }).sort(function(a,b){ return (b.diasAberto||0)-(a.diasAberto||0); });
    var ncHtml = '<div class="rel-num"><b class="'+(ncs.length?"rel-bad":"")+'">'+ncs.length+'</b> não conformidade(s) em aberto</div>'
      + lista(ncs.map(function(n){ return e(n.descricao||"(sem descrição)", 80)+' · '+e((n.ficha.codigo||"FVS")+" "+(n.ficha.numero||""))+(n.diasAberto!=null ? ' · <b>'+n.diasAberto+' dia(s)</b>' : ''); }), "Nenhuma NC em aberto.", 5);
    // aço
    var acoTodas = acoListaComConcretagem();
    var recebido = acoTodas.filter(function(x){ return x.status==="entregue" && x.dataEntrega>=semAnt.ini && x.dataEntrega<=sem.fim; });
    var proximas = proximasEntregas(acoTodas, hoje, 6);
    var lajes = acoLajes().filter(function(x){ return x.tipo!=="ok"; });
    var aco = '<div class="rel-num">Recebido (semana passada e esta): <b>'+(Math.round(recebido.reduce(function(s,x){ return s+acoPeso(x); }, 0)/100)/10).toString().replace(".", ",")+' t</b> em '+recebido.length+' entrega(s)</div>'
      + lista(lajes.map(function(x){ var t = acoTextoLaje(x, fmtDateBR); return '<b class="rel-bad">'+e(t.titulo)+'</b> — '+e(t.sub.split(" · ")[0]); })
        .concat(proximas.map(function(x){ var st = acoSituacao(x, hoje); return (st==="atrasada" ? '<b class="rel-bad">atrasada</b> · ' : dm(x.dataPrevista)+' · ')+e(x.destino||"sem destino")+' · pedido '+e(x.pedido||"s/ nº"); })), "Nenhuma entrega programada.", 8);
    // prioridades
    var prio = principaisDeHoje(sugestoesDeHoje(), 8).map(function(x){ return '<b>'+e(x.titulo, 80)+'</b> — '+e(x.sub||"", 70); });

    var ov = document.createElement("div");
    ov.className = "rel-ov";
    ov.innerHTML = '<div class="rel-barra"><button type="button" class="btn primary" data-rel-imprimir><svg class="ti-i" data-i="download"></svg>Imprimir / salvar PDF</button><button type="button" class="btn" data-rel-fechar>Fechar</button></div>'
      + '<div class="rel-pagina">'
        + '<header><div><h2>Relatório da semana</h2><p>'+e(DEFAULT_OBRA)+'</p></div><div class="rel-data">Semana de '+fmtDateBR(sem.ini)+' a '+fmtDateBR(sem.fim)+'<br><small>gerado em '+fmtDateTimeBR(nowISO())+(currentUserEmail ? ' por '+e(currentUserEmail) : '')+'</small></div></header>'
        + '<div class="rel-grid">'
          + bloco("Cronograma · metas da semana", cron)
          + bloco("Estrutura", estTxt + lista(conc.map(function(c){ return c.t; }), "Nenhuma concretagem registrada na semana passada nem nesta.", 6))
          + bloco("Controle tecnológico", ct)
          + bloco("Não conformidades", ncHtml)
          + bloco("Aço", aco)
          + bloco("Prioridades (“Hoje você precisa…”)", lista(prio, "Nada urgente.", 8))
        + '</div>'
        + '<footer>Traço Integrado · dados do app no momento da geração</footer>'
      + '</div>';
    document.body.appendChild(ov);
    pintarIcones(ov);
    document.body.classList.add("com-relatorio");
    var fechar = function(){ ov.remove(); document.body.classList.remove("com-relatorio"); document.removeEventListener("keydown", esc); };
    var esc = function(ev){ if(ev.key==="Escape") fechar(); };
    document.addEventListener("keydown", esc);
    ov.querySelector("[data-rel-fechar]").addEventListener("click", fechar);
    ov.querySelector("[data-rel-imprimir]").addEventListener("click", function(){ window.print(); });
  }

  /* ---------------- relatório: FVS por pavimento ---------------- */
  var filtrosPav = { pavimento:"", tipo:"", situacao:"todos" };
  // Mesma lista de tipos usada no "Qual o tipo de FVS?" (fvs04 + FVS_TIPOS),
  // reaproveitada aqui para o filtro "Por tipo de FVS".
  function todosTiposFvs(){
    return [{key:"fvs04", codigo:"FVS 04", titulo:"Forma, Desforma, Armação e Concretagem"}]
      .concat(FVS_TIPOS.map(function(t){ return {key:t.key, codigo:t.codigo, titulo:t.titulo}; }));
  }
  function fvsPavimentosList(f){
    var chips = (Array.isArray(f.pavimentos) && f.pavimentos.length) ? f.pavimentos : (f.local ? [f.local] : []);
    return chips.map(function(p){ return (p||"").trim(); }).filter(Boolean);
  }
  // Situação de cada FVS, no vocabulário do filtro (mesmas categorias do
  // selo que já aparece em cada ficha: Aberta / Aberta com NC / Pendente de
  // NC / Fechada), pra "abertas, fechadas, não conformes e tal" ficar 1 pra 1
  // com o que a pessoa já vê no resto do app.
  function situacaoPavKey(f){
    var st = fvsStatus(f);
    if(st.key==="aberto") return st.nc ? "aberto_nc" : "aberto";
    return st.key; // "pendente" ou "concluido"
  }
  function matchesFiltrosPav(f){
    if(filtrosPav.tipo && (f.tipo||"fvs04")!==filtrosPav.tipo) return false;
    if(filtrosPav.situacao!=="todos" && situacaoPavKey(f)!==filtrosPav.situacao) return false;
    return true;
  }
  function buildRelatorioPavimento(){
    // Usa o mesmo universo de pavimentos do filtro principal (junta FVS +
    // rastreabilidade) pra a lista de andares bater com a do filtro do
    // quadro, mas só conta FVS's (é um relatório de "FVS por pavimento").
    var canon = pavimentosCanonicos(buildRows());
    if(filtrosPav.pavimento){
      var rankFiltro = pavimentoRank(filtrosPav.pavimento);
      canon = canon.filter(function(c){
        return rankFiltro!==9999 ? c.rank===rankFiltro : c.label===filtrosPav.pavimento;
      });
    }
    var grupos = canon.map(function(c){ return { label:c.label, rank:c.rank, fichas:[] }; });
    var porRank = new Map(), porLabel = new Map();
    grupos.forEach(function(g){ if(g.rank!==9999) porRank.set(g.rank, g); else porLabel.set(g.label, g); });
    fvsMap.forEach(function(f){
      if(!matchesFiltrosPav(f)) return;
      var pavs = fvsPavimentosList(f);
      if(!pavs.length) return;
      var jaContado = new Set();
      pavs.forEach(function(p){
        var r = pavimentoRank(p);
        var g = r!==9999 ? porRank.get(r) : porLabel.get(p);
        if(!g || jaContado.has(g.label)) return;
        jaContado.add(g.label);
        g.fichas.push(f);
      });
    });
    grupos.forEach(function(g){
      g.fichas.sort(function(a,b){
        var da=a.dataConcretagem||a.dataAbertura||"", db=b.dataConcretagem||b.dataAbertura||"";
        return db.localeCompare(da);
      });
    });
    return grupos;
  }
  function renderViewPavimento(){
    var container = document.getElementById("view-pavimento");
    var grupos = buildRelatorioPavimento();
    var totalGeral = grupos.reduce(function(acc,g){ return acc+g.fichas.length; }, 0);

    var pavimentoOpcoes = pavimentosCanonicos(buildRows());
    var filtrosHtml = '<div class="pav-filtros">'
      + '<select id="pav-f-pavimento" aria-label="Filtrar por pavimento">'
        + '<option value="">Todos os pavimentos</option>'
        + pavimentoOpcoes.map(function(o){ return '<option value="'+escapeHtml(o.label)+'"'+(filtrosPav.pavimento===o.label?" selected":"")+'>'+escapeHtml(o.label)+'</option>'; }).join("")
      + '</select>'
      + '<select id="pav-f-tipo" aria-label="Filtrar por tipo de FVS">'
        + '<option value="">Todos os tipos de FVS</option>'
        + todosTiposFvs().map(function(t){ return '<option value="'+escapeHtml(t.key)+'"'+(filtrosPav.tipo===t.key?" selected":"")+'>'+escapeHtml(t.titulo)+'</option>'; }).join("")
      + '</select>'
      + '<div class="chips" id="pav-f-situacao" role="group" aria-label="Filtrar por situação">'
        + ['todos::Todas','aberto::Aberta','aberto_nc::Aberta com NC','pendente::Pendente de NC','concluido::Fechada'].map(function(opt){
            var parts = opt.split("::"), key=parts[0], label=parts[1];
            return '<button class="chip" data-sit-pav="'+key+'" aria-pressed="'+(filtrosPav.situacao===key)+'">'+label+'</button>';
          }).join("")
      + '</div>'
    + '</div>';

    var corpoHtml;
    if(grupos.length===0){
      corpoHtml = '<div class="empty-state"><div class="big">Nenhuma FVS encontrada</div><p>Cadastre o pavimento nas fichas FVS ou de rastreabilidade, ou ajuste os filtros acima, para ver o resumo aqui.</p></div>';
    } else {
      var resumoHtml = '<div class="pav-resumo-grid">' + grupos.map(function(g){
        return '<div class="pav-resumo-card"><div class="n">'+g.fichas.length+'</div><div class="l">'+escapeHtml(g.label)+'</div></div>';
      }).join("") + '</div>';
      var listaHtml = '<div class="pav-lista">' + grupos.map(function(g){
        var linhas = g.fichas.length
          ? g.fichas.map(function(f){
              return '<div class="pav-ficha-row">'
                + '<span class="pav-ficha-cod">'+escapeHtml(f.descricao||f.codigo||"FVS")+' · '+escapeHtml(f.numero||"s/ nº")+'</span>'
                + '<span class="pav-ficha-obra">'+escapeHtml(f.obra||"")+'</span>'
                + pill(fvsStatus(f))
                + '<span class="pav-ficha-data">'+escapeHtml(fmtDateBR(f.dataConcretagem||f.dataAbertura||""))+'</span>'
                + '</div>';
            }).join("")
          : '<div class="pav-ficha-vazio">Nenhuma FVS encontrada neste pavimento com os filtros atuais.</div>';
        return '<div class="pav-grupo">'
          + '<div class="pav-grupo-head"><span class="pav-grupo-nome">'+escapeHtml(g.label)+'</span><span class="pav-grupo-count">'+g.fichas.length+' ficha(s)</span></div>'
          + '<div class="pav-grupo-body">'+linhas+'</div>'
          + '</div>';
      }).join("") + '</div>';
      corpoHtml = resumoHtml + listaHtml;
    }

    container.innerHTML =
      '<div class="pav-header">'
        + '<button class="btn" id="btn-voltar-pavimento">← Voltar</button>'
        + '<h2>FVS\'s por pavimento</h2>'
        + '<span class="pav-total">'+totalGeral+' ficha(s) encontrada(s)</span>'
        + '<button class="btn ghost danger" id="btn-view-nc">NÃO CONFORMIDADES</button>'
      + '</div>'
      + '<p class="view-desc">Fichas agrupadas por pavimento/unidade da obra, pra acompanhar o avanço físico de cada trecho.</p>'
      + filtrosHtml
      + corpoHtml;

    document.getElementById("btn-voltar-pavimento").addEventListener("click", hideViewPavimento);
    document.getElementById("btn-view-nc").addEventListener("click", showViewNc);
    document.getElementById("pav-f-pavimento").addEventListener("change", function(e){ filtrosPav.pavimento=e.target.value; renderViewPavimento(); });
    document.getElementById("pav-f-tipo").addEventListener("change", function(e){ filtrosPav.tipo=e.target.value; renderViewPavimento(); });
    document.getElementById("pav-f-situacao").addEventListener("click", function(e){
      var btn=e.target.closest("[data-sit-pav]"); if(!btn) return;
      filtrosPav.situacao = btn.getAttribute("data-sit-pav");
      renderViewPavimento();
    });
  }
  function showViewPavimento(){ switchView("pavimento"); }
  function hideViewPavimento(){ switchView("dashboard"); }

  /* ---------------- relatório: Não conformidades ---------------- */
  var filtrosNc = { pavimento:"", tipo:"", situacao:"aberto", destinatario:"", busca:"" }; // situacao: "todos" | "aberto" | "atraso" | "concluida"

  // Lista plana de todas as não conformidades cadastradas em todas as
  // fichas FVS (novas, já como lista, e antigas migradas na hora por
  // fichaNaoConformidades()) — cada item já carrega os dados da ficha-mãe e
  // os dias em aberto já calculados, pra alimentar tanto o resumo por
  // pavimento quanto o relatório em Word.
  function todasNaoConformidades(){
    var out=[];
    fvsMap.forEach(function(f, fid){
      fichaNaoConformidades(f).forEach(function(nc, ni){
        out.push({
          fichaId: fid, ficha: f, idx: ni,
          descricao: nc.descricao||"", correcao: nc.correcao||"",
          concluida: !!nc.concluida,
          dataRegistro: nc.dataRegistro||f.dataAbertura||"", dataConclusao: nc.dataConclusao||"",
          prazo: nc.prazo||"", responsavel: nc.responsavel||"",
          diasAberto: nc.concluida ? null : diffDias(nc.dataRegistro||f.dataAbertura||"", todayISO()),
          pavimentos: fvsPavimentosList(f),
          anexos: ncAnexos(nc)
        });
      });
    });
    return out;
  }
  function matchesFiltrosNc(item){
    if(filtrosNc.tipo && (item.ficha.tipo||"fvs04")!==filtrosNc.tipo) return false;
    if(filtrosNc.situacao==="aberto" && item.concluida) return false;
    if(filtrosNc.situacao==="concluida" && !item.concluida) return false;
    if(filtrosNc.situacao==="atraso" && !ncAtrasada(item)) return false;
    if(filtrosNc.pavimento){
      var rankFiltro = pavimentoRank(filtrosNc.pavimento);
      var ok = item.pavimentos.some(function(p){
        return rankFiltro!==9999 ? pavimentoRank(p)===rankFiltro : p===filtrosNc.pavimento;
      });
      if(!ok) return false;
    }
    return true;
  }
  function buildRelatorioNc(){
    var todas = todasNaoConformidades().filter(matchesFiltrosNc);

    var canon = pavimentosCanonicos(buildRows());
    if(filtrosNc.pavimento){
      var rankFiltro = pavimentoRank(filtrosNc.pavimento);
      canon = canon.filter(function(c){ return rankFiltro!==9999 ? c.rank===rankFiltro : c.label===filtrosNc.pavimento; });
    }
    var grupos = canon.map(function(c){ return { label:c.label, rank:c.rank, itens:[] }; });
    var porRank=new Map(), porLabel=new Map();
    grupos.forEach(function(g){ if(g.rank!==9999) porRank.set(g.rank,g); else porLabel.set(g.label,g); });
    todas.forEach(function(item){
      if(!item.pavimentos.length) return;
      var jaContado=new Set();
      item.pavimentos.forEach(function(p){
        var r=pavimentoRank(p);
        var g = r!==9999 ? porRank.get(r) : porLabel.get(p);
        if(!g || jaContado.has(g.label)) return;
        jaContado.add(g.label);
        g.itens.push(item);
      });
    });
    grupos.forEach(function(g){
      g.itens.sort(function(a,b){ return (b.dataRegistro||"").localeCompare(a.dataRegistro||""); });
    });
    return { todas: todas, grupos: grupos };
  }
  function descricaoFiltrosNc(){
    var tipoLabel = "todos";
    if(filtrosNc.tipo){
      var t = todosTiposFvs().find(function(x){ return x.key===filtrosNc.tipo; });
      tipoLabel = t ? t.titulo : filtrosNc.tipo;
    }
    var sitLabel = {todos:"todas", aberto:"em aberto", concluida:"concluídas"}[filtrosNc.situacao] || "todas";
    return "Pavimento: "+(filtrosNc.pavimento||"todos")+" · Tipo de FVS: "+tipoLabel+" · Situação: "+sitLabel;
  }
  /* ---------------- v1.19: tela de não conformidades para VER e RESOLVER ----------------
     Lista única, das mais antigas (ou com prazo vencido) para as mais novas,
     com "Resolver" direto no cartão — grava na própria FVS, sem abrir a ficha.
     "Importar lista de pendências" lê uma lista (texto do WhatsApp, colado do
     Excel ou planilha) e inclui cada pendência como NC na FVS escolhida. */
  var ncResolvendo = "";
  function ncChave(item){ return item.fichaId+"|"+item.idx; }
  function ncVencida(item){ return !item.concluida && !!item.prazo && item.prazo < todayISO(); }
  function ncAtrasada(item){ return !item.concluida && (ncVencida(item) || (item.diasAberto||0) >= 15); }
  function ncRotuloFicha(f){ return (f.codigo||"FVS")+" nº "+(f.numero||"s/ nº"); }
  function renderViewNc(){
    var container = document.getElementById("view-nc");
    var hoje = todayISO();
    var base = todasNaoConformidades();
    var semSit = function(i){ var s = filtrosNc.situacao; filtrosNc.situacao = "todos"; var r = matchesFiltrosNc(i); filtrosNc.situacao = s; return r; };
    var termo = normNc(filtrosNc.busca||"");
    var noFiltro = base.filter(function(i){
      if(!semSit(i)) return false;
      if(termo && normNc([i.descricao, i.correcao, i.responsavel, i.ficha.codigo, i.ficha.numero, i.pavimentos.join(" ")].join(" ")).indexOf(termo)===-1) return false;
      return true;
    });
    var cont = { aberto:0, atraso:0, concluida:0, todos:noFiltro.length };
    noFiltro.forEach(function(i){ if(i.concluida) cont.concluida++; else { cont.aberto++; if(ncAtrasada(i)) cont.atraso++; } });
    var sit = filtrosNc.situacao;
    var lista = noFiltro.filter(function(i){
      return sit==="todos" || (sit==="aberto" && !i.concluida) || (sit==="atraso" && ncAtrasada(i)) || (sit==="concluida" && i.concluida);
    });
    lista.sort(function(a,b){
      if(a.concluida!==b.concluida) return a.concluida ? 1 : -1;
      if(a.concluida) return (b.dataConclusao||"").localeCompare(a.dataConclusao||"");
      if(ncVencida(a)!==ncVencida(b)) return ncVencida(a) ? -1 : 1;
      return (b.diasAberto||0)-(a.diasAberto||0);
    });

    var pavimentoOpcoes = pavimentosCanonicos(buildRows());
    var chip = function(k, rot, n, tom){
      return '<button type="button" class="ncx-sit'+(tom?" "+tom:"")+'" data-sit-nc="'+k+'" aria-pressed="'+(sit===k)+'"><b>'+n+'</b><span>'+rot+'</span></button>';
    };
    var topo = '<div class="pav-header"><h2>Não conformidades</h2><span class="pav-total">'+cont.aberto+' em aberto</span></div>'
      + '<p class="view-desc">Toque em <b>Resolver</b> para dar baixa direto aqui. Recebeu uma lista de pendências? Use <b>Importar lista</b>: cada item vira uma não conformidade na FVS certa.</p>'
      + '<div class="ncx-sits" role="group" aria-label="Situação">'
        + chip("aberto", "Em aberto", cont.aberto, "bad")
        + chip("atraso", "Prazo vencido ou +15 dias", cont.atraso, "warn")
        + chip("concluida", "Resolvidas", cont.concluida, "ok")
        + chip("todos", "Todas", cont.todos, "")
      + '</div>'
      + '<div class="ncx-barra">'
        + '<div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
          + '<input type="text" id="nc-f-busca" placeholder="Buscar: viga V3, reboco, empreiteira…" value="'+escapeHtml(filtrosNc.busca||"")+'"></div>'
        + '<select id="nc-f-pavimento" aria-label="Filtrar por pavimento"><option value="">Todos os pavimentos</option>'
          + pavimentoOpcoes.map(function(o){ return '<option value="'+escapeHtml(o.label)+'"'+(filtrosNc.pavimento===o.label?" selected":"")+'>'+escapeHtml(o.label)+'</option>'; }).join("")+'</select>'
        + '<select id="nc-f-tipo" aria-label="Filtrar por tipo de FVS"><option value="">Todos os tipos de FVS</option>'
          + todosTiposFvs().map(function(t){ return '<option value="'+escapeHtml(t.key)+'"'+(filtrosNc.tipo===t.key?" selected":"")+'>'+escapeHtml(t.codigo+" — "+t.titulo)+'</option>'; }).join("")+'</select>'
      + '</div>'
      + '<div class="ct-acoes">'
        + '<button class="btn primary" type="button" id="btn-nc-desforma"><svg class="ti-i" data-i="alert"></svg>Pendências da desforma (fotos)</button>'
        + '<button class="btn" type="button" id="btn-nc-importar"><svg class="ti-i" data-i="file"></svg>Importar lista de pendências</button>'
        + '<input type="text" id="nc-f-destinatario" placeholder="Empreiteira / destinatário do relatório (opcional)" value="'+escapeHtml(filtrosNc.destinatario)+'" style="flex:1 1 220px;min-width:0">'
        + '<button class="btn" type="button" id="btn-relatorio-nc"><svg class="ti-i" data-i="download"></svg>Relatório (Word)</button>'
      + '</div>';

    var cartao = function(i){
      var f = i.ficha, k = ncChave(i), abertoForm = ncResolvendo===k && !i.concluida;
      var tempo = i.concluida ? '<span class="ncx-tag ok">resolvida em '+escapeHtml(fmtDateBR(i.dataConclusao)||"—")+'</span>'
        : (ncVencida(i) ? '<span class="ncx-tag bad">prazo venceu '+escapeHtml(fmtDateBR(i.prazo).slice(0,5))+'</span>'
          : '<span class="ncx-tag '+((i.diasAberto||0)>=15 ? "bad" : (i.diasAberto||0)>=7 ? "warn" : "")+'">'+(i.diasAberto ? i.diasAberto+" dia(s)" : (i.diasAberto===0 ? "aberta hoje" : "em aberto"))+'</span>'
            + (i.prazo ? '<span class="ncx-tag">prazo '+escapeHtml(fmtDateBR(i.prazo).slice(0,5))+'</span>' : ''));
      return '<div class="ncx-card'+(i.concluida?" feita":"")+(ncAtrasada(i)?" atraso":"")+'" data-nc="'+escapeHtml(k)+'">'
        + '<div class="ncx-top">'+tempo
          + (i.pavimentos[0] ? '<span class="ncx-tag pav">'+escapeHtml(i.pavimentos.join(", "))+'</span>' : '')
          + '<span class="ncx-ficha">'+escapeHtml(ncRotuloFicha(f))+(f.travada ? ' · assinada' : '')+'</span></div>'
        + '<div class="ncx-desc">'+escapeHtml(i.descricao||"(sem descrição)")+'</div>'
        + (i.correcao ? '<div class="ncx-sub"><b>'+(i.concluida?"Feito":"Correção")+':</b> '+escapeHtml(i.correcao)+'</div>' : '')
        + (i.responsavel ? '<div class="ncx-sub"><b>Responsável:</b> '+escapeHtml(i.responsavel)+'</div>' : '')
        + (i.anexos.length ? '<div class="ncx-sub">'+i.anexos.length+' anexo(s)</div>' : '')
        + (abertoForm
          ? '<div class="ncx-resolver"><div class="field"><label for="ncx-feito">O que foi feito</label><textarea id="ncx-feito" rows="2" placeholder="ex.: espaçadores colocados e conferidos">'+escapeHtml(i.correcao||"")+'</textarea></div>'
            + '<div class="ncx-resolver-pe"><div class="field"><label for="ncx-data">Resolvida em</label><input type="date" id="ncx-data" value="'+hoje+'"></div>'
            + '<button type="button" class="btn" data-nc-cancelar>Cancelar</button><button type="button" class="btn primary" data-nc-confirmar>✓ Confirmar</button></div></div>'
          : '<div class="ncx-acoes">'+(i.concluida
              ? '<button type="button" class="btn small" data-nc-reabrir>Reabrir</button>'
              : '<button type="button" class="btn small primary" data-nc-resolver>✓ Resolver</button>')
            + '<button type="button" class="btn small" data-nc-abrir>Abrir a ficha</button></div>')
        + '</div>';
    };
    var corpo = lista.length ? '<div class="ncx-lista">'+lista.map(cartao).join("")+'</div>'
      : '<div class="empty-state"><div class="big">'+(sit==="aberto" ? "Nenhuma pendência em aberto 🎉" : "Nada com esses filtros")+'</div><p>'+(sit==="aberto" ? "Todas as não conformidades estão resolvidas." : "Ajuste a situação, o pavimento ou a busca.")+'</p></div>';

    container.innerHTML = topo + corpo;
    pintarIcones(container);
    var re = function(){ renderViewNc(); };
    container.querySelector(".ncx-sits").addEventListener("click", function(e){
      var b = e.target.closest("[data-sit-nc]"); if(!b) return;
      filtrosNc.situacao = b.getAttribute("data-sit-nc"); re();
    });
    var busca = document.getElementById("nc-f-busca");
    busca.addEventListener("input", function(){
      filtrosNc.busca = busca.value; var pos = busca.selectionStart; re();
      var b2 = document.getElementById("nc-f-busca"); b2.focus(); b2.setSelectionRange(pos, pos);
    });
    document.getElementById("nc-f-pavimento").addEventListener("change", function(e){ filtrosNc.pavimento = e.target.value; re(); });
    document.getElementById("nc-f-tipo").addEventListener("change", function(e){ filtrosNc.tipo = e.target.value; re(); });
    document.getElementById("nc-f-destinatario").addEventListener("input", function(e){ filtrosNc.destinatario = e.target.value; });
    document.getElementById("btn-relatorio-nc").addEventListener("click", gerarRelatorioNcWord);
    document.getElementById("btn-nc-importar").addEventListener("click", abrirImportarPendencias);
    document.getElementById("btn-nc-desforma").addEventListener("click", function(){ abrirDesforma({}); });
    container.querySelectorAll("[data-nc]").forEach(function(card){
      var p = card.getAttribute("data-nc").split("|"), fid = p[0], idx = Number(p[1]);
      var on = function(sel, fn){ var b = card.querySelector(sel); if(b) b.addEventListener("click", fn); };
      on("[data-nc-abrir]", function(){ openModal("fvs", fid); });
      on("[data-nc-resolver]", function(){ ncResolvendo = fid+"|"+idx; re(); var t = document.getElementById("ncx-feito"); if(t) t.focus(); });
      on("[data-nc-cancelar]", function(){ ncResolvendo = ""; re(); });
      on("[data-nc-confirmar]", function(){
        var feito = document.getElementById("ncx-feito").value.trim(), data = document.getElementById("ncx-data").value || todayISO();
        if(!feito){ alert("Escreva o que foi feito para resolver."); return; }
        ncResolvendo = "";
        ncGravarNaFicha(fid, function(lista){ var nc = lista[idx]; if(!nc) return false; nc.correcao = feito; nc.concluida = true; nc.dataConclusao = data; nc.resolvidaPor = currentUserEmail||""; });
      });
      on("[data-nc-reabrir]", function(){
        if(!confirm("Reabrir esta não conformidade?")) return;
        ncGravarNaFicha(fid, function(lista){ var nc = lista[idx]; if(!nc) return false; nc.concluida = false; nc.dataConclusao = ""; });
      });
    });
  }
  // Altera a lista de NCs de uma FVS e grava só esse campo (funciona também em
  // ficha assinada: as regras do banco liberam naoConformidades para dar baixa).
  async function ncGravarNaFicha(fichaId, alterar){
    var f = fvsMap.get(fichaId); if(!f) return;
    var lista = JSON.parse(JSON.stringify(fichaNaoConformidades(f)));
    if(alterar(lista)===false) return;
    try{
      var envio = fvsCol.doc(fichaId).set({ naoConformidades:lista, updatedAt:nowISO(), updatedByEmail:currentUserEmail||"" }, { merge:true });
      var r = await Promise.race([envio.then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
      if(r==="pendente") alert("Sem conexão no momento — a alteração será enviada quando o sinal voltar. Mantenha o app aberto.");
    }catch(ex){
      console.error(ex);
      alert("Não foi possível gravar: "+(ex && ex.code==="permission-denied" ? "sem permissão para alterar esta ficha." : (ex && ex.message ? ex.message : "erro desconhecido")));
    }
    if(!document.getElementById("view-nc").hidden) renderViewNc();
  }

  /* ---- v1.36: pendências da desforma (modulos/nc/desforma.js) ---- */
  function esperarGravacao(envio){
    return Promise.race([envio.then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
  }
  // A concretagem ainda sem FVS 04: cria a ficha (já com as pendências) e liga nas duas pontas
  async function criarFvs04DaRast(rastId, ncs){
    var r = rastMap.get(rastId);
    if(!r) throw new Error("concretagem não encontrada");
    var nf = blankFvs("fvs04");
    nf.obra = r.obra || nf.obra; nf.local = r.blocoPav || ""; nf.pavimentos = pavimentosDaRast(r);
    nf.dataConcretagem = r.data || todayISO(); nf.dataAbertura = r.data || todayISO();
    nf.rastreabilidadeId = rastId; nf.naoConformidades = ncs || [];
    var pn = proximoNumeroFvs(nf.codigo, null);
    nf.numero = pn.numero; nf.numeroSeq = pn.seq; nf.numeroAuto = true;
    var ref = fvsCol.doc();
    var r1 = await esperarGravacao(ref.set(nf));
    var r2 = await esperarGravacao(rastCol.doc(rastId).set({ fvsId:ref.id, updatedAt:nowISO() }, { merge:true }));
    if(r1==="pendente" || r2==="pendente") alert("Sem conexão no momento — a ficha será enviada quando o sinal voltar. Mantenha o app aberto.");
    // a rastreabilidade aberta na tela passa a saber da FVS nova (senão, ao salvar, desfazia a ligação)
    if(draft && draft.type==="rast" && draft.id===rastId){
      draft.data.fvsId = ref.id;
      try{ var o = JSON.parse(draft.orig); o.fvsId = ref.id; draft.orig = JSON.stringify(o); }catch(ex){}
    }
    return { id:ref.id, rotulo:(nf.codigo||"FVS 04")+" nº "+nf.numero };
  }
  // depois de gravar pendências numa FVS: a ficha aberta na tela recebe a lista nova
  function aposAlterarFvs(fid){
    setTimeout(function(){
      if(!draft) return;
      if(draft.type==="fvs" && draft.id===fid){
        var f = fvsMap.get(fid); if(!f) return;
        draft.data.naoConformidades = JSON.parse(JSON.stringify(fichaNaoConformidades(f)));
        try{ var o = JSON.parse(draft.orig); o.naoConformidades = draft.data.naoConformidades; draft.orig = JSON.stringify(o); }catch(ex){}
        renderModal();
      } else if(draft.type==="rast"){
        renderModal();
      }
    }, 400);
  }

  /* ---- v1.19: importar lista de pendências para as FVS ---- */
  function ncFichasParaSugestao(){
    var out = [];
    fvsMap.forEach(function(f, id){
      var t = getFvsTipo(f.tipo);
      out.push({ id:id, numero:f.numero||"", codigo:f.codigo||"", titulo:(t && t.titulo) || f.descricao || (f.tipo==="fvs04"||!f.tipo ? "Forma, desforma, armação e concretagem" : ""),
        pavimentos:fvsPavimentosList(f), data:f.dataConcretagem||f.dataAbertura||"", travada:!!f.travada });
    });
    out.sort(function(a,b){ return (b.data||"").localeCompare(a.data||""); });
    return out;
  }
  function abrirImportarPendencias(){
    var fichas = ncFichasParaSugestao(), itens = [];
    var ov = document.createElement("div");
    ov.className = "overlay ct-ficha-ov";
    ov.innerHTML = '<div class="modal ncx-imp" role="dialog" aria-modal="true" aria-labelledby="ncx-imp-tit">'
      + '<div class="modal-head"><h2 id="ncx-imp-tit">Importar lista de pendências</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>'
      + '<div class="modal-body">'
        + '<div data-passo1>'
          + '<p class="view-desc">Cole a lista (uma pendência por linha, do WhatsApp, e-mail ou copiada do Excel) ou escolha a planilha. O app tenta achar o pavimento, o nº da FVS e o prazo em cada linha.</p>'
          + '<div class="field"><label for="ncx-texto">Lista de pendências</label><textarea id="ncx-texto" rows="8" placeholder="- 5º pav: falta espaçador na viga V3, corrigir até 12/10&#10;- 3º embasamento, FVS nº 14: prumo do pilar P7 fora da tolerância&#10;- Cobertura: bolha na impermeabilização do ralo"></textarea></div>'
          + '<div class="ct-acoes"><label class="btn" for="ncx-arquivo"><svg class="ti-i" data-i="file"></svg>Escolher planilha…</label><input type="file" id="ncx-arquivo" accept=".xlsx,.xls,.csv,.txt" hidden>'
          + '<button type="button" class="btn primary" data-ler>Ler a lista</button><span class="hint" data-msg></span></div>'
        + '</div>'
        + '<div data-passo2 hidden></div>'
      + '</div>'
      + '<div class="modal-foot"><div></div><div style="display:flex;gap:10px;"><button class="btn" data-fechar>Cancelar</button><button class="btn primary" data-incluir hidden>Incluir</button></div></div>'
    + '</div>';
    document.body.appendChild(ov);
    pintarIcones(ov);
    document.body.style.overflow = "hidden";
    var msg = ov.querySelector("[data-msg]");
    var fechar = function(){ ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", tecla); };
    var tecla = function(e){ if(e.key==="Escape") fechar(); };
    document.addEventListener("keydown", tecla);
    var opcoesFicha = function(sel){
      return '<option value="">— escolher a FVS —</option>' + fichas.map(function(f){
        return '<option value="'+escapeHtml(f.id)+'"'+(f.id===sel?" selected":"")+'>'+escapeHtml((f.codigo||"FVS")+" nº "+(f.numero||"s/ nº")+" · "+(f.pavimentos.join(", ")||"sem pavimento")+(f.data ? " · "+fmtDateBR(f.data).slice(0,5) : "")+(f.travada ? " · assinada" : ""))+'</option>';
      }).join("");
    };
    var mostrar = function(){
      var p2 = ov.querySelector("[data-passo2]");
      ov.querySelector("[data-passo1]").hidden = true; p2.hidden = false;
      p2.innerHTML = '<p class="view-desc">'+itens.length+' pendência(s) encontradas. Confira a FVS de cada uma (as sugeridas já vêm marcadas) e desmarque o que não for pendência.</p>'
        + '<div class="ncx-imp-lista">'+itens.map(function(it, k){
          return '<div class="ncx-imp-item" data-k="'+k+'">'
            + '<label class="ncx-imp-chk"><input type="checkbox" data-imp="usar"'+(it.usar?" checked":"")+'> incluir</label>'
            + '<div class="field"><label>Pendência</label><textarea data-imp="descricao" rows="2">'+escapeHtml(it.descricao)+'</textarea></div>'
            + '<div class="grid2"><div class="field"><label>FVS'+(it.ficha ? "" : ' <span class="ncx-tag bad">escolher</span>')+'</label><select data-imp="ficha">'+opcoesFicha(it.ficha)+'</select></div>'
              + '<div class="field"><label>Correção / o que fazer</label><input data-imp="correcao" value="'+escapeHtml(it.correcao)+'"></div></div>'
            + '<div class="grid2"><div class="field"><label>Prazo</label><input type="date" data-imp="prazo" value="'+escapeHtml(it.prazo)+'"></div>'
              + '<div class="field"><label>Responsável / empreiteira</label><input data-imp="responsavel" value="'+escapeHtml(it.responsavel)+'"></div></div>'
            + (it.pavimento ? '<small class="hint">Pavimento lido: '+escapeHtml(it.pavimento)+(it.fvs ? ' · FVS nº '+escapeHtml(it.fvs) : '')+'</small>' : (it.fvs ? '<small class="hint">FVS nº '+escapeHtml(it.fvs)+'</small>' : ''))
          + '</div>';
        }).join("")+'</div>';
      p2.addEventListener("input", atualizar); p2.addEventListener("change", atualizar);
      atualizar();
    };
    function atualizar(e){
      if(e && e.target && e.target.closest){
        var box = e.target.closest("[data-k]");
        if(box){ var it = itens[+box.getAttribute("data-k")], c = e.target.getAttribute("data-imp"); if(it && c) it[c] = c==="usar" ? e.target.checked : e.target.value; }
      }
      var usar = itens.filter(function(i){ return i.usar; }), semFicha = usar.filter(function(i){ return !i.ficha; }).length;
      var b = ov.querySelector("[data-incluir]");
      b.hidden = false; b.disabled = !usar.length || semFicha>0;
      b.textContent = semFicha ? "Falta escolher a FVS de "+semFicha : "Incluir "+usar.length+" pendência(s)";
    }
    var ler = function(entrada){
      var lidos = lerPendencias(entrada, todayISO());
      if(!lidos.length){ msg.textContent = "Não achei pendências. Escreva uma por linha."; return; }
      itens = lidos.map(function(x){
        return Object.assign(x, { usar: !/^pend[eê]ncias?\b.{0,30}:?\s*$/i.test(x.descricao), ficha: sugerirFvs(x, fichas, pavimentoRank) });
      });
      mostrar();
    };
    ov.querySelector("#ncx-arquivo").addEventListener("change", async function(ev){
      var f = ev.target.files && ev.target.files[0]; ev.target.value = "";
      if(!f) return;
      msg.textContent = "Lendo "+f.name+"…";
      try{
        if(/\.txt$/i.test(f.name)){ ler(await f.text()); return; }
        await garantirLibs();
        var wb = XLSX.read(await f.arrayBuffer(), { type:"array", cellDates:true });
        var ws = wb.Sheets[wb.SheetNames[0]];
        ler(XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:"" }));
      }catch(ex){ console.error(ex); msg.textContent = "Não consegui ler esse arquivo. Tente colar a lista no campo acima."; }
    });
    ov.addEventListener("click", async function(e){
      if(e.target===ov || e.target.closest("[data-fechar]")){ fechar(); return; }
      if(e.target.closest("[data-ler]")){ ler(ov.querySelector("#ncx-texto").value); return; }
      var bi = e.target.closest("[data-incluir]");
      if(!bi || bi.disabled) return;
      var usar = itens.filter(function(i){ return i.usar && i.ficha && String(i.descricao||"").trim(); });
      var porFicha = {};
      usar.forEach(function(i){ (porFicha[i.ficha] = porFicha[i.ficha] || []).push(i); });
      bi.disabled = true; bi.textContent = "Incluindo…";
      var ids = Object.keys(porFicha);
      for(var n=0;n<ids.length;n++){
        await ncGravarNaFicha(ids[n], function(lista){
          porFicha[ids[n]].forEach(function(i){
            lista.push(Object.assign(blankNaoConformidade(), { descricao:String(i.descricao).trim(), correcao:i.correcao||"", prazo:i.prazo||"",
              responsavel:i.responsavel||"", dataRegistro: i.data || todayISO(), origem:"lista", importadaPor:currentUserEmail||"", importadaEm:nowISO() }));
          });
        });
      }
      fechar();
      filtrosNc.situacao = "aberto";
      alert(usar.length+" pendência(s) incluída(s) em "+ids.length+" FVS.");
    });
  }
  function showViewNc(){ switchView("nc"); }
  function hideViewNc(){ switchView("dashboard"); }

  /* ---------------- biblioteca de plantas de forma ---------------- */
  // Tela de cadastro/gestão das plantas reaproveitadas pela ferramenta de
  // mapeamento de concretagem (ver bibliotecaAdicionarPlanta,
  // mapeamentoFieldHtml e mapaPlantasOrdenadas). Cada planta é cadastrada
  // uma única vez aqui — comprimida automaticamente — e depois só é
  // escolhida numa lista dentro de cada rastreabilidade, sem reenviar o PDF.
  function showViewPlantas(){ switchView("plantas"); }
  function hideViewPlantas(){ switchView("dashboard"); }
  // v1.37: disciplina de cada planta (as antigas, sem o campo, são de forma)
  var DISCIPLINAS_PLANTA = ["Forma", "Armação", "Arquitetura", "Elétrica", "Hidráulica", "Incêndio", "Outras"];
  function disciplinaDa(p){ return (p && p.disciplina) || "Forma"; }
  var filtroPlantas = { disc:"", pav:"" };
  function plantasOrdenadasPorPavimento(){
    var todas = [];
    plantasMap.forEach(function(p, id){ todas.push(Object.assign({ id:id }, p)); });
    todas.forEach(function(p){ p._rank = pavimentoRank(p.pavimento); });
    todas.sort(function(a,b){
      if(a._rank !== b._rank) return a._rank - b._rank;
      return (a.nome||"").localeCompare(b.nome||"");
    });
    return todas;
  }
  function renderViewPlantas(){
    var container = document.getElementById("view-plantas");
    if(!container) return;
    var lista = plantasOrdenadasPorPavimento();

    var uploadHtml = '<div class="ct-upload-bar" id="planta-upload-bar">'
      + '<div class="info"><div class="t">Cadastrar planta (PDF) na biblioteca</div>'
        + '<div class="s">A planta é comprimida automaticamente ao cadastrar, pra ocupar bem menos espaço — depois fica disponível pra escolher em qualquer rastreabilidade, sem precisar reenviar o PDF de novo.</div>'
        + '<div class="hint" id="planta-upload-msg"></div>'
      + '</div>'
      + '<div class="planta-campos"><div id="planta-nova-pavimento">'+pavSelectsHtml("", "", "Pavimento…")+'</div>'
      + '<select id="planta-nova-disc" aria-label="Disciplina">'+DISCIPLINAS_PLANTA.map(function(d){ return '<option>'+d+'</option>'; }).join("")+'</select></div>'
      + '<button class="btn primary" id="planta-btn-cadastrar" type="button">Cadastrar planta…</button>'
      + '<input type="file" id="planta-file-input" accept="application/pdf" hidden>'
    + '</div>';

    var contDisc = {}; lista.forEach(function(p){ var d = disciplinaDa(p); contDisc[d] = (contDisc[d]||0)+1; });
    var pavs = []; lista.forEach(function(p){ if(p.pavimento && pavs.indexOf(p.pavimento)===-1) pavs.push(p.pavimento); });
    var resumoHtml = '<div class="planta-filtros"><div class="chips">'
      + '<button type="button" class="chip" data-filtro-disc="" aria-pressed="'+(!filtroPlantas.disc)+'">Todas ('+lista.length+')</button>'
      + DISCIPLINAS_PLANTA.filter(function(d){ return contDisc[d]; }).map(function(d){
          return '<button type="button" class="chip" data-filtro-disc="'+d+'" aria-pressed="'+(filtroPlantas.disc===d)+'">'+d+' ('+contDisc[d]+')</button>';
        }).join("")
      + '</div><select id="planta-filtro-pav" aria-label="Pavimento"><option value="">Todos os pavimentos</option>'
      + pavs.map(function(v){ return '<option'+(filtroPlantas.pav===v?" selected":"")+'>'+escapeHtml(v)+'</option>'; }).join("")+'</select></div>';
    var totalPlantas = lista.length;
    lista = lista.filter(function(p){ return (!filtroPlantas.disc || disciplinaDa(p)===filtroPlantas.disc) && (!filtroPlantas.pav || p.pavimento===filtroPlantas.pav); });

    var listaHtml;
    if(lista.length===0){
      listaHtml = totalPlantas ? '<div class="hint">Nenhuma planta com esse filtro.</div>' : '<div class="hint">Nenhuma planta cadastrada ainda. Cadastre acima — depois ela aparece pra escolher no mapeamento de concretagem de qualquer rastreabilidade.</div>';
    }else{
      var porGrupo = [];
      var grupoAtual = null;
      lista.forEach(function(p){
        var titulo = p.pavimento || "Sem pavimento definido";
        if(!grupoAtual || grupoAtual.titulo!==titulo){
          grupoAtual = { titulo:titulo, itens:[] };
          porGrupo.push(grupoAtual);
        }
        grupoAtual.itens.push(p);
      });
      listaHtml = porGrupo.map(function(g){
        return '<div class="planta-grupo-titulo">'+escapeHtml(g.titulo)+'</div>'
          + '<div class="planta-lista">'
          + g.itens.map(function(p){
              return '<div class="planta-item">'
                + '<span class="nome">'+escapeHtml(p.nome)+'</span>'
                + (p.pavimento ? '<span class="pav">'+escapeHtml(p.pavimento)+'</span>' : '')
                + '<select class="planta-disc" data-disc-planta="'+escapeHtml(p.id)+'" aria-label="Disciplina">'+DISCIPLINAS_PLANTA.map(function(d){ return '<option'+(disciplinaDa(p)===d?" selected":"")+'>'+d+'</option>'; }).join("")+'</select>'
                + (disciplinaDa(p)==="Forma"
                    ? '<button type="button" class="btn small" data-marcar-pecas="'+escapeHtml(p.id)+'" title="Desenhe cada peça (pilar, viga, laje) uma vez: ao demarcar a concretagem, as peças dentro da área entram sozinhas na BT">Marcar peças'+((p.pecasAreas||[]).length ? ' ('+p.pecasAreas.length+')' : '')+'</button>'
                      + (Array.isArray(p.pecas) && p.pecas.length ? '<span class="planta-pecas" title="Nomes das peças lidos do PDF">'+p.pecas.length+' nomes lidos</span>' : '')
                    : '')
                + '<a class="btn ghost small" href="'+escapeHtml(p.url)+'" target="_blank" rel="noopener">Abrir</a>'
                + '<span class="acoes"><button type="button" class="icon-btn" data-rm-planta="'+escapeHtml(p.id)+'" title="Remover da biblioteca">Remover</button></span>'
              + '</div>';
            }).join("")
          + '</div>';
      }).join("");
    }

    container.innerHTML =
      '<div class="pav-header">'
        + '<button class="btn" id="btn-voltar-plantas">← Voltar</button>'
        + '<h2>Biblioteca de plantas</h2>'
        + '<span class="pav-total">'+totalPlantas+' planta(s)</span>'
      + '</div>'
      + '<p class="view-desc">Plantas cadastradas uma única vez aqui, por pavimento e disciplina (forma, arquitetura, instalações…). As de forma aparecem primeiro para escolher no mapeamento de concretagem.</p>'
      + uploadHtml
      + resumoHtml
      + listaHtml;

    document.getElementById("btn-voltar-plantas").addEventListener("click", hideViewPlantas);
    var fileInput = document.getElementById("planta-file-input");
    var msgEl = document.getElementById("planta-upload-msg");
    document.getElementById("planta-btn-cadastrar").addEventListener("click", function(){ fileInput.click(); });
    fileInput.addEventListener("change", async function(e){
      var f = e.target.files && e.target.files[0];
      fileInput.value = "";
      if(!f) return;
      if(!cloudinaryConfigurado()){
        if(msgEl) msgEl.textContent = "Envio de plantas ainda não configurado neste sistema (falta ligar a conta do Cloudinary).";
        return;
      }
      var pavInput = document.getElementById("planta-nova-pavimento");
      var pavimento = pavInput ? lerPavSelects(pavInput, "") : "";
      var discEl = document.getElementById("planta-nova-disc");
      if(msgEl) msgEl.textContent = "Comprimindo e enviando "+f.name+"…";
      try{
        await bibliotecaAdicionarPlanta(f, pavimento, discEl ? discEl.value : "Forma");
        renderViewPlantas();
      }catch(ex){
        console.error(ex);
        if(msgEl) msgEl.textContent = "Não foi possível cadastrar "+f.name+": "+(ex&&ex.message?ex.message:"erro desconhecido")+".";
      }
    });
    container.querySelectorAll("[data-filtro-disc]").forEach(function(b){
      b.addEventListener("click", function(){ filtroPlantas.disc = b.getAttribute("data-filtro-disc"); renderViewPlantas(); });
    });
    var fPav = document.getElementById("planta-filtro-pav");
    if(fPav) fPav.addEventListener("change", function(){ filtroPlantas.pav = fPav.value; renderViewPlantas(); });
    container.querySelectorAll("[data-marcar-pecas]").forEach(function(b){
      b.addEventListener("click", function(){ abrirMarcarPecas(b.getAttribute("data-marcar-pecas")); });
    });
    container.querySelectorAll("[data-ler-pecas]").forEach(function(inp){
      inp.addEventListener("change", async function(){
        var f = inp.files && inp.files[0]; inp.value = "";
        if(!f) return;
        if(msgEl) msgEl.textContent = "Lendo as peças de "+f.name+"…";
        try{
          await garantirPdf();
          var pdf = await pdfjsLib.getDocument({ data:await f.arrayBuffer() }).promise;
          var pecas = await lerPecasDaPagina(await pdf.getPage(1));
          if(!pecas.length){ alert("Não achei nomes de peças escritos como texto em "+f.name+" (alguns programas exportam o texto como desenho). Nesse caso as peças continuam sendo digitadas."); if(msgEl) msgEl.textContent = ""; return; }
          await plantasCol.doc(inp.getAttribute("data-ler-pecas")).set({ pecas:pecas, pecasLidasEm:nowISO() }, { merge:true });
          alert(pecas.length+" peças lidas de "+f.name+" (ex.: "+pecas.slice(0, 8).map(function(x){ return x.n; }).join(", ")+").");
        }catch(ex){ console.error(ex); alert("Não consegui ler "+f.name+": "+(ex&&ex.message?ex.message:"erro desconhecido")); }
      });
    });
    container.querySelectorAll("[data-disc-planta]").forEach(function(sel){
      sel.addEventListener("change", async function(){
        try{ await plantasCol.doc(sel.getAttribute("data-disc-planta")).set({ disciplina:sel.value }, { merge:true }); }
        catch(ex){ console.error(ex); alert("Não foi possível trocar a disciplina: "+(ex&&ex.message?ex.message:"erro desconhecido")); }
      });
    });
    container.querySelectorAll("[data-rm-planta]").forEach(function(btn){
      btn.addEventListener("click", async function(){
        var id = btn.getAttribute("data-rm-planta");
        if(!confirm("Remover esta planta da biblioteca? Rastreabilidades que já escolheram ela continuam com a planta normalmente, só não vai mais aparecer pra escolher em fichas novas.")) return;
        try{ await plantasCol.doc(id).set(dadosExclusao("plantas", currentUserEmail, nowISO()), { merge:true }); renderViewPlantas(); }catch(ex){ console.error(ex); alert("Não foi possível remover: "+(ex&&ex.message?ex.message:"erro desconhecido")); }
      });
    });
  }

  /* ---------------- auth + db bootstrap ---------------- */
  // Selo do topo reflete a conexão real do aparelho (antes ficava sempre
  // "sincronizado" depois do login, mesmo sem sinal).
  function atualizarIndicadorConexao(){
    var el = document.getElementById("sync-indicator");
    var tipos = Object.keys(PENDENTES.porTipo).map(function(k){ return PENDENTES.porTipo[k]+" × "+k; });
    if(PENDENTES.n || pendentesAnteriores){
      // só mostra "aguardando" depois de 1,5 s: com sinal a gravação some antes disso
      if(PENDENTES.n && Date.now()-PENDENTES.desde < 1500 && navigator.onLine!==false){ setTimeout(atualizarIndicadorConexao, 1600); }
      else {
        setSync("pend", PENDENTES.n ? PENDENTES.n+" aguardando envio" : "alterações aguardando envio");
        el.title = "Ainda não chegou ao servidor (está salvo neste aparelho):\n"+(tipos.join("\n")||"alterações de antes de abrir o app")
          +"\n\nMantenha o app aberto até o sinal voltar.";
        return;
      }
    }
    el.title = "";
    if(navigator.onLine===false) setSync("off","sem conexão");
    else setSync("on","sincronizado");
  }
  var pendentesAnteriores = false, ultimoAvisoEnvio = 0;
  window.addEventListener("traco-pendentes", function(){
    if(!PENDENTES.n && PENDENTES.enviadas && Date.now()-PENDENTES.desde > 1500 && Date.now()-ultimoAvisoEnvio > 5000){
      ultimoAvisoEnvio = Date.now();
      mostrarAviso("✓ "+PENDENTES.enviadas+" alteração(ões) enviada(s) ao servidor");
    }
    atualizarIndicadorConexao();
  });
  // Ao abrir: alterações feitas offline numa sessão anterior ficam na fila do
  // Firestore neste aparelho e são reenviadas sozinhas — o selo avisa até irem.
  function conferirPendentesAnteriores(){
    var pronto = false;
    dbf.waitForPendingWrites().then(function(){
      pronto = true;
      if(pendentesAnteriores){ pendentesAnteriores = false; mostrarAviso("✓ Alterações pendentes enviadas ao servidor"); atualizarIndicadorConexao(); }
    }).catch(function(){});
    setTimeout(function(){ if(!pronto){ pendentesAnteriores = true; atualizarIndicadorConexao(); } }, 2000);
  }
  function mostrarAviso(txt){
    var t = document.createElement("div");
    t.className = "aviso-flutuante"; t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add("sai"); }, 3200);
    setTimeout(function(){ t.remove(); }, 3800);
  }
  window.addEventListener("online", atualizarIndicadorConexao);
  window.addEventListener("offline", atualizarIndicadorConexao);
  function setSync(state,text){
    var el=document.getElementById("sync-indicator");
    el.className="sync "+state;
    document.getElementById("sync-text").textContent=text;
  }
  function authErrorMessage(code){
    var map={
      "auth/invalid-email":"E-mail inválido.",
      "auth/user-disabled":"Este usuário foi desativado.",
      "auth/user-not-found":"E-mail ou senha incorretos.",
      "auth/wrong-password":"E-mail ou senha incorretos.",
      "auth/invalid-credential":"E-mail ou senha incorretos.",
      "auth/missing-password":"Digite sua senha.",
      "auth/too-many-requests":"Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      "auth/network-request-failed":"Falha de conexão. Verifique sua internet e tente novamente."
    };
    return map[code] || "Não foi possível entrar. Verifique os dados e tente novamente.";
  }
  function subscribeCollections(){
    if(unsubFvs) unsubFvs();
    if(unsubRast) unsubRast();
    if(unsubCt) unsubCt();
    if(unsubPlantas) unsubPlantas();
    if(unsubAco) unsubAco();
    var erroSync = function(err){ setSync("off","erro de sincronização"); console.error(err); };
    // v1.28: todas as coleções grandes baixam só o que mudou (src/modulos/dados/sincronia.js).
    // Sem orderBy/limit: a ordenação é feita na tela (buildRows). Registros na
    // lixeira (excluido:true) ficam no banco, mas fora do app.
    var soAtivos = function(mapa){ var m = new Map(); mapa.forEach(function(x, id){ if(ativo(x)) m.set(id, x); }); return m; };
    var sincFvs = escutarColecao({ col:fvsCol, campo:"updatedAt", chave:"traco-fvs-sync-completa", dias:1, aoErro:erroSync,
      aoMudar:function(mapa){ todosPorColecao.fvs = mapa; fvsMap = soAtivos(mapa); render(); } });
    unsubFvs = sincFvs.parar;
    window.__tracoSincFvs = sincFvs.modo; // para o teste de ponta a ponta
    unsubRast = escutarColecao({ col:rastCol, campo:"updatedAt", chave:"traco-rast-sync-completa", dias:1, aoErro:erroSync,
      aoMudar:function(mapa){
        todosPorColecao.rastreabilidade = mapa;
        // v1.34: cada pavimento separado (inclusive "A / B" das fichas antigas) para filtros e avanço da obra
        rastMap = new Map(); soAtivos(mapa).forEach(function(r, id){ rastMap.set(id, Object.assign({}, r, { pavimentos: pavimentosDaRast(r) })); });
        ctLimparInicio(); render(); } }).parar;
    // Controle Tecnológico (desde a v1.6): baixa tudo uma vez por semana.
    unsubCt = escutarColecao({ col:ctCol, campo:"atualizadoEm", chave:"traco-ct-sync-completa", dias:7, aoErro:erroSync,
      aoMudar:function(mapa){
        ctMap = mapa;
        render();
        // v1.5: rastreabilidade aberta mostra os resultados de CT das suas NFs —
        // atualiza quando chega resultado novo (sem atrapalhar quem está digitando).
        var ae = document.activeElement;
        if(draft && draft.type==="rast" && !document.getElementById("overlay").hidden
          && !(ae && document.getElementById("modal").contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) renderModal();
      } }).parar;
    // plantas são pesadas (imagem dentro do registro): também uma vez por semana
    unsubPlantas = escutarColecao({ col:plantasCol, campo:"atualizadoEm", chave:"traco-plantas-sync-completa", dias:7, aoErro:erroSync,
      aoMudar:function(mapa){ todosPorColecao.plantas = mapa; plantasMap = soAtivos(mapa); render(); } }).parar;
    // Aço: se as regras do banco ainda não liberam esta coleção, a tela avisa
    // em vez de marcar o app inteiro como "erro de sincronização".
    unsubAco = escutarColecao({ col:acoCol, campo:"atualizadoEm", chave:"traco-aco-sync-completa", dias:1,
      aoErro:function(err){ acoErroAcesso = true; console.warn("entregasAco:", err && err.code); render(); },
      aoMudar:function(mapa){
        acoErroAcesso = false;
        todosPorColecao.entregasAco = mapa;
        acoMap = new Map();
        mapa.forEach(function(x, id){ if(ativo(x)) acoMap.set(id, Object.assign({ id:id }, x)); });
        render();
      } }).parar;
    if(unsubCron) unsubCron();
    unsubCron = cronCol.doc("atual").onSnapshot(function(snap){
      cronErroAcesso = false;
      definirCronograma(snap.exists ? snap.data() : null);
      render();
    }, function(err){ cronErroAcesso = true; console.warn("cronogramas:", err && err.code); render(); });
    // v1.8: % lançado no app por atividade (documento pequeno, separado do cronograma)
    if(unsubCronProg) unsubCronProg();
    unsubCronProg = cronCol.doc("progresso").onSnapshot(function(snap){
      definirProgressoCron(snap.exists ? snap.data() : null);
      render();
    }, function(err){ console.warn("cronogramas/progresso:", err && err.code); });
    // v1.14: etapa/pavimento escolhidos à mão para atividades não reconhecidas
    if(unsubCronEtapas) unsubCronEtapas();
    unsubCronEtapas = cronCol.doc("etapas").onSnapshot(function(snap){
      definirEtapasManuais(snap.exists ? snap.data() : null);
      render();
    }, function(err){ console.warn("cronogramas/etapas:", err && err.code); });
  }
  function showApp(user){
    document.getElementById("auth-screen").hidden = true;
    document.getElementById("app-root").hidden = false;
    document.getElementById("user-name").textContent = user.displayName || user.email || "";
    currentUserEmail = user.email || "";
    aplicarPerfil();
    // v1.31: cadastro da equipe (poucos registros) — perfil e "só visualiza" vêm daqui
    if(unsubEquipe) unsubEquipe();
    unsubEquipe = dbf.collection("equipe").onSnapshot(function(snap){
      equipeMap = new Map(); snap.docs.forEach(function(d){ equipeMap.set(d.id, d.data()); });
      if(aplicarPerfil()) render();
      var v = document.getElementById("view-equipe"); if(v && !v.hidden) renderViewEquipe();
    }, function(err){ console.warn("equipe:", err && err.code); });
    // v1.11: sem faixa de aviso (quebrava o layout); a conta só de visualização
    // vê tudo igual aos outros, só sem os botões de criar/alterar/apagar.
    definirUsuario(currentUserEmail);
    atualizarIndicadorConexao();
    conferirPendentesAnteriores();
    subscribeCollections();
    // v1.15: a minha assinatura cadastrada (para o botão "Assinar" das FVS)
    if(unsubAssin) unsubAssin();
    unsubAssin = assinCol.doc(user.uid).onSnapshot(function(snap){
      minhaAssinatura = snap.exists ? snap.data() : null;
      if(draft && draft.type==="fvs") renderModal();
      var vA = document.getElementById("view-assinar"); if(vA && !vA.hidden) renderViewAssinar();
      var vE = document.getElementById("view-engenharia"); if(vE && !vE.hidden) renderViewEngenharia();
    }, function(err){ console.warn("assinaturas:", err && err.code); });
    // v1.25: tarefas da engenharia para os estagiários
    if(unsubTarefas) unsubTarefas();
    unsubTarefas = escutarColecao({ col:tarefasCol, campo:"atualizadoEm", chave:"traco-tarefas-sync-completa", dias:1,
      aoErro:function(err){ console.warn("tarefas:", err && err.code); },
      aoMudar:function(mapa){
        tarefasMap = mapa;
        var v = document.getElementById("view-engenharia");
        if(v && !v.hidden) renderViewEngenharia(); else if(!document.getElementById("view-dashboard").hidden) renderViewDashboard();
      } }).parar;
    render();
    if(perfilAtual==="engenharia") switchView("engenharia"); // a engenheira abre no painel dela
    // Dá tempo das fichas chegarem do servidor antes de oferecer o rascunho.
    setTimeout(oferecerRascunhoPendente, 2500);
  }
  function showAuth(){
    document.getElementById("app-root").hidden = true;
    document.getElementById("auth-screen").hidden = false;
    if(unsubFvs){ unsubFvs(); unsubFvs=null; }
    if(unsubRast){ unsubRast(); unsubRast=null; }
    if(unsubCt){ unsubCt(); unsubCt=null; }
    if(unsubAco){ unsubAco(); unsubAco=null; }
    if(unsubPlantas){ unsubPlantas(); unsubPlantas=null; }
    if(unsubCron){ unsubCron(); unsubCron=null; }
    if(unsubCronProg){ unsubCronProg(); unsubCronProg=null; }
    if(unsubCronEtapas){ unsubCronEtapas(); unsubCronEtapas=null; }
    if(unsubAssin){ unsubAssin(); unsubAssin=null; } minhaAssinatura = null;
    if(unsubTarefas){ unsubTarefas(); unsubTarefas=null; } tarefasMap = new Map();
    if(unsubEquipe){ unsubEquipe(); unsubEquipe=null; } equipeMap = new Map();
    fvsMap=new Map(); rastMap=new Map(); ctMap=new Map();
    currentUserEmail="";
  }
  function boot(){
    try{
      var lastEmail = localStorage.getItem("traco-integrado-last-email");
      if(lastEmail) document.getElementById("login-email").value = lastEmail;
    }catch(e){}
    auth.onAuthStateChanged(function(user){
      if(user) showApp(user); else showAuth();
    });
  }

  /* ---------------- modal: FVS ---------------- */
  function blankFvs(tipoKey){
    var tipo = tipoKey ? getFvsTipo(tipoKey) : null;
    return {
      tipo: tipoKey || "fvs04", unidades: [],
      numero:"", codigo:(tipo?tipo.codigo:"FVS 04"), descricao:(tipo?tipo.titulo:"Forma, Desforma, Armação e Concretagem"),
      obra:DEFAULT_OBRA, local:"", pavimentos:[], dataAbertura:todayISO(), dataConcretagem:todayISO(), dataFechamento:"",
      inspecionadoPor:"", engenheiro:"", elementos:{}, checklist:{}, naoConformidades:[],
      observacoes:"", fechado:false, rastreabilidadeId:null, createdAt:nowISO(), updatedAt:nowISO()
    };
  }
  function blankRast(){
    return {
      numero:"", obra:DEFAULT_OBRA, blocoPav:"", pavimentos:[], data:todayISO(), projetoReferencia:"",
      slumpAprovado:"", fckSolicitado:"", linhas:[ blankLinha(1) ], acoesCorretivas:"",
      responsavelColeta:"", engenheiro:"", fechado:false, dataFechamento:"", fvsId:null,
      mapeamento: blankMapeamento(),
      createdAt:nowISO(), updatedAt:nowISO()
    };
  }
  // Mapeamento de concretagem: a planta de forma (PDF) anexada a esta
  // rastreabilidade, mais as áreas demarcadas nela (cada uma ligada a uma
  // sequência/BT das "Betonadas" acima) — ver mapeamentoFieldHtml().
  // O Firestore NÃO aceita lista dentro de lista. As áreas do mapeamento
  // guardavam os pontos como [[x,y],[x,y]...] — por isso toda rastreabilidade
  // com área demarcada era recusada ao salvar (desde a v1.0). No banco os
  // pontos passam a ser [{x,y},...]; na memória continuam [x,y] para não mexer
  // no código de desenho/exportação.
  // v1.24: várias plantas na mesma ficha — a planta aberta fica em
  // data.mapeamento (como sempre) e as outras em data.mapeamentosExtras.
  function todosMapeamentos(data){
    return [data && data.mapeamento].concat((data && data.mapeamentosExtras) || []).filter(Boolean);
  }
  function paraFirestore(data){
    todosMapeamentos(data).forEach(function(mp){
      if(mp && Array.isArray(mp.areas)){
        mp.areas = mp.areas.map(function(a){
          return Object.assign({}, a, { pontos: (a.pontos||[]).map(function(p){
            return Array.isArray(p) ? { x:p[0], y:p[1] } : p;
          }) });
        });
      }
    });
    return data;
  }
  function doFirestore(data){
    todosMapeamentos(data).forEach(function(mp){
      if(mp && Array.isArray(mp.areas)){
        mp.areas = mp.areas.map(function(a){
          return Object.assign({}, a, { pontos: (a.pontos||[]).map(function(p){
            return Array.isArray(p) ? p : [p.x, p.y];
          }) });
        });
      }
    });
    return data;
  }
  function blankMapeamento(){
    return { plantaUrl:"", plantaNome:"", pagina:1, tipo:"pdf", areas:[] };
  }
  // Paleta de cores fixa pra distinguir visualmente cada sequência (BT)
  // demarcada na planta — cicla se houver mais sequências do que cores.
  var MAPA_CORES = ["#2E5AAC","#2E7D46","#AD3A2C","#B8860B","#6A3FA0","#0E7C86","#C2410C","#767A00","#9C2F6B","#3D5A80"];
  function mapaCorSequencia(seq){
    var n = parseInt(seq,10); if(isNaN(n) || n<1) n=1;
    return MAPA_CORES[(n-1) % MAPA_CORES.length];
  }
  // v1.36: cor de cada BT no desenho — a de sempre, trocada só quando encosta
  // numa BT vizinha de cor parecida (rotulo-mapa.js → coresDistintas)
  function coresDoMapa(mp){ return coresDistintas((mp && mp.areas) || [], mapaCorSequencia); }
  function corDaArea(cores, a){ return (cores && cores.get(String(a.linhaSeq))) || a.cor || mapaCorSequencia(a.linhaSeq); }
  // Envia um arquivo (PDF anexado manualmente, ou o blob de imagem já
  // comprimido de uma planta da biblioteca) direto pro Cloudinary, igual ao
  // envio de anexos de não conformidade — mesma conta, mesmo preset (ver
  // comentário de CLOUDINARY_CLOUD_NAME no topo do arquivo).
  async function uploadParaCloudinary(arquivoOuBlob, nomeArquivo){
    var fd = new FormData();
    fd.append("file", arquivoOuBlob, nomeArquivo);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    var endpoint = "https://api.cloudinary.com/v1_1/"+encodeURIComponent(CLOUDINARY_CLOUD_NAME)+"/auto/upload";
    var resp = await fetch(endpoint, { method:"POST", body:fd });
    var data = null;
    try{ data = await resp.json(); }catch(ex){}
    if(!resp.ok || !data || !data.secure_url){
      var msg = (data && data.error && data.error.message) ? data.error.message : ("erro HTTP "+resp.status);
      throw new Error(msg);
    }
    return data.secure_url;
  }
  // Anexo manual de planta (PDF) só pra esta rastreabilidade — usado quando o
  // usuário escolhe "Anexar PDF só pra esta ficha" em vez de escolher uma
  // planta já cadastrada na biblioteca (ver mapeamentoFieldHtml). Guarda o
  // PDF original, sem comprimir — como não é reaproveitado em outras
  // fichas, não pesa tanto na cota quanto duplicar a mesma planta repetida.
  async function rastUploadPlanta(file){
    var url = await uploadParaCloudinary(file, file.name||"planta.pdf");
    return { url: url, nome: file.name||"planta.pdf" };
  }
  // Renderiza a página 1 do PDF (via pdf.js) num canvas e devolve esse
  // desenho como um JPEG — usado só ao CADASTRAR uma planta na biblioteca
  // (ver bibliotecaAdicionarPlanta). Como essa mesma planta é reaproveitada
  // por várias rastreabilidades (em vez de reenviar o PDF de novo em cada
  // uma), vale a pena comprimir aqui: o PDF vetorial original de obra costuma
  // pesar 2-5MB, e essa versão rasterizada fica bem mais leve, mas ainda
  // nítida o bastante pro zoom de até 400% da ferramenta de mapeamento.
  async function comprimirPlantaEmImagem(file){
    try{ await garantirPdf(); }catch(ex){ console.error(ex); }
    if(!window.pdfjsLib) throw new Error("a biblioteca pdf.js não carregou (verifique a internet)");
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data:arrayBuffer }).promise;
    var page = await pdf.getPage(1);
    var viewportBase = page.getViewport({ scale:1 });
    var alvoPx = 2400; // largura-alvo (px): nítido até 400% de zoom, sem ficar tão pesado quanto o PDF vetorial original
    var escala = Math.min(4, alvoPx/viewportBase.width);
    var viewport = page.getViewport({ scale:escala });
    var canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); // fundo branco (o PDF pode ter fundo transparente)
    await page.render({ canvasContext:ctx, viewport:viewport }).promise;
    var blob = await new Promise(function(resolve){ canvas.toBlob(resolve, "image/jpeg", 0.82); });
    if(!blob) throw new Error("não foi possível gerar a versão comprimida da planta");
    // v1.37: os nomes das peças (P12, V105, L3…) escritos no PDF, com a posição
    var pecas = [];
    try{ pecas = await lerPecasDaPagina(page); }catch(ex){ console.warn("peças da planta", ex); }
    return { blob:blob, larguraPx:canvas.width, alturaPx:canvas.height, pecas:pecas };
  }
  // Cadastra uma planta na biblioteca: comprime (ver comprimirPlantaEmImagem
  // acima), envia a imagem já leve pro Cloudinary e grava o registro em
  // /plantas — a partir daí ela aparece pra escolher em qualquer
  // rastreabilidade (ver mapeamentoFieldHtml / mapaPlantasOrdenadas).
  async function bibliotecaAdicionarPlanta(file, pavimento, disciplina){
    var comp = await comprimirPlantaEmImagem(file);
    var nomeBase = (file.name||"planta").replace(/\.pdf$/i, "");
    var url = await uploadParaCloudinary(comp.blob, nomeBase+".jpg");
    await plantasCol.add({
      nome: nomeBase,
      pavimento: (pavimento||"").trim(),
      disciplina: disciplina || "Forma",
      pecas: comp.pecas || [], pecasLidasEm: nowISO(),
      url: url,
      tipo: "imagem",
      larguraPx: comp.larguraPx,
      alturaPx: comp.alturaPx,
      criadoEm: nowISO(),
      criadoPor: currentUserEmail
    });
  }
  // Ordena as plantas da biblioteca pra exibição num <select>: as que batem
  // com o(s) pavimento(s) já marcados nesta ficha (chips de pavimentos, ver
  // pavimentosFieldHtml) aparecem primeiro, o resto continua disponível
  // embaixo — nunca escondido, só priorizado, já que o reconhecimento do
  // pavimento (pavimentoRank) é por texto livre e pode não bater sempre.
  function mapaPlantasOrdenadas(pavimentosRecord){
    var ranksRecord = (pavimentosRecord||[]).map(pavimentoRank);
    var todas = [];
    plantasMap.forEach(function(p, id){ todas.push(Object.assign({ id:id }, p)); });
    todas.forEach(function(p){
      p._rank = pavimentoRank(p.pavimento);
      p._match = p._rank!==9999 && ranksRecord.indexOf(p._rank)!==-1;
    });
    todas.sort(function(a,b){
      var fa = disciplinaDa(a)==="Forma", fb = disciplinaDa(b)==="Forma"; // v1.37: plantas de forma primeiro
      if(fa !== fb) return fa ? -1 : 1;
      if(a._match !== b._match) return a._match ? -1 : 1;
      if(a._rank !== b._rank) return a._rank - b._rank;
      return (a.nome||"").localeCompare(b.nome||"");
    });
    return todas;
  }
  function blankLinha(seq){
    return { seq:seq, notaFiscal:"", betoneira:"", lacre:"", volBetoneira:"", volAcumulado:"",
      fornecedor:"", nSerieCP:"", nCPs:"", slump:"", saidaUsina:"", chegadaObra:"", lancInicial:"",
      lancFinal:"", aguaFolga:"", aguaLanc:"", pecas:"" };
  }

  // Bloco de "chips" de pavimentos, reutilizado tanto na ficha FVS quanto na
  // rastreabilidade — permite marcar que uma mesma ficha vale para mais de um
  // pavimento (ex.: verificação abrangendo dois andares), sem mexer no campo
  // "Local / elemento" ou "Bloco / Pavimento" já existente (que continua
  // funcionando normalmente para fichas antigas, ver fallback em buildRows()).
  /* ---- v1.5: lista oficial de pavimentos (sem digitação) ----
     Mesma numeração 00–27 do corte do prédio e do cronograma; o texto gravado
     continua no formato que já existia ("Piso do 3º Pavimento Tipo"), então
     filtros, relatórios e fichas antigas seguem funcionando. */
  function pisoNome(rank){
    if(rank===0) return "Fundação";
    if(rank===NIVEIS_OBRA.length-1) return "Telhado";
    var n = NIVEIS_OBRA[rank];
    return (/^(Cobertura|Dependência)/.test(n) ? "Piso da " : "Piso do ")+n;
  }
  var TRECHOS_OBRA = ["Trecho Maria Quitéria", "Trecho Prudente de Morais", "Trecho Volt"];
  function grupoDoNivel(rank){ return rank<=1 ? "Fundação e subsolo" : (rank<=6 ? "Embasamento" : (rank<=23 ? "Pavimentos tipo" : "Cobertura e topo")); }
  function separarPavimento(valor){
    var v = String(valor||"").trim(), trecho = "";
    // abreviações usadas nas fichas antigas
    v = v.replace(/\(?\s*trecho\s+p\.?\s*(de\s+)?morais\s*\)?/i, "— Trecho Prudente de Morais")
         .replace(/\(?\s*trecho\s+m\.?\s*quit[ée]ria\s*\)?/i, "— Trecho Maria Quitéria");
    TRECHOS_OBRA.forEach(function(t){ if(v.toLowerCase().indexOf(t.toLowerCase())!==-1){ trecho = t; v = v.replace(new RegExp("\\s*[—-]?\\s*\\(?"+t+"\\)?", "i"), "").trim(); } });
    // "3⁰", "3°", "3o" e "3º" valem como o mesmo pavimento
    var norm = function(x){ return String(x).toLowerCase().replace(/(\d)\s*[º°⁰ªo](?![a-z])/g, "$1º").replace(/\s+/g, " ").trim(); };
    var base = "";
    for(var r=0;r<NIVEIS_OBRA.length;r++){ if(norm(pisoNome(r))===norm(v)){ base = pisoNome(r); break; } }
    return { base:base, trecho:trecho, antigo: base ? "" : String(valor||"").trim() };
  }
  function juntarPavimento(base, trecho){ return base ? base+(trecho ? " — "+trecho : "") : ""; }
  // <select> de pavimento (+ trecho). attrs: atributos extras (ex.: data-pav-campo="blocoPav")
  function pavSelectsHtml(valor, attrs, rotuloVazio){
    var sp = separarPavimento(valor), grupo = null, html = '<select '+attrs+' data-pav-base aria-label="Pavimento"><option value="">'+(rotuloVazio||"Selecione o pavimento…")+'</option>';
    if(sp.antigo) html += '<option value="__antigo" selected>'+escapeHtml(sp.antigo)+' (digitado antes)</option>';
    for(var r=0;r<NIVEIS_OBRA.length;r++){
      var g = grupoDoNivel(r);
      if(g!==grupo){ html += (grupo ? '</optgroup>' : '')+'<optgroup label="'+g+'">'; grupo = g; }
      var nome = pisoNome(r);
      html += '<option value="'+escapeHtml(nome)+'"'+(sp.base===nome?" selected":"")+'>'+(r<10?"0":"")+r+' — '+escapeHtml(nome)+'</option>';
    }
    html += '</optgroup></select>';
    html += '<select '+attrs+' data-pav-trecho aria-label="Trecho (opcional)"><option value="">Trecho: obra toda</option>'
      + TRECHOS_OBRA.map(function(t){ return '<option'+(sp.trecho===t?" selected":"")+'>'+t+'</option>'; }).join("")+'</select>';
    return '<div class="pav-sel">'+html+'</div>';
  }
  function lerPavSelects(caixa, valorAntigo){
    var b = caixa.querySelector("[data-pav-base]"), t = caixa.querySelector("[data-pav-trecho]");
    if(!b) return "";
    if(b.value==="__antigo") return valorAntigo||"";
    return juntarPavimento(b.value, t ? t.value : "");
  }

  // v1.34: uma concretagem pode pegar mais de um pavimento. "Bloco / Pavimento"
  // guarda todos juntos com " / " (é o que vai no Excel) e a lista "pavimentos"
  // tem cada um separado (filtros, avanço da obra). Fichas antigas digitadas
  // como "Piso do 5º Embasamento / Piso do 2º Embasamento" são lidas assim.
  function dividirPavimentos(txt){ return String(txt||"").split(/\s*\/\s*/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function pavimentosDaRast(r){
    var out = [];
    dividirPavimentos(r && r.blocoPav).concat((r && r.pavimentos) || []).forEach(function(p){
      var sp = separarPavimento(p), v = sp.base ? juntarPavimento(sp.base, sp.trecho) : String(p||"").trim();
      if(v && out.indexOf(v)===-1) out.push(v);
    });
    return out;
  }
  function blocoPavMultiHtml(d){
    var lista = pavimentosDaRast(d); if(!lista.length) lista = [""];
    return '<div id="bloco-pav-caixa" data-antigos="'+escapeHtml(JSON.stringify(lista))+'">'
      + lista.map(function(p, i){ return blocoPavLinhaHtml(p, i); }).join("")
      + '</div><button type="button" class="btn small" id="add-bloco-pav">+ Adicionar pavimento</button>'
      + '<div class="hint" style="margin-top:4px;">Quando a concretagem do dia pega mais de um pavimento, adicione os outros aqui.</div>';
  }
  function blocoPavLinhaHtml(valor, i){
    return '<div class="bloco-pav-linha" data-bp-i="'+i+'">'+pavSelectsHtml(valor, "", i ? "Escolha outro pavimento…" : "Selecione o pavimento…")
      + (i ? '<button type="button" class="close-x bloco-pav-rm" data-bp-rm title="Tirar este pavimento" aria-label="Tirar este pavimento">✕</button>' : '')+'</div>';
  }
  function lerBlocoPavMulti(caixa){
    var antigos = []; try{ antigos = JSON.parse(caixa.getAttribute("data-antigos")||"[]"); }catch(ex){}
    var vals = [];
    caixa.querySelectorAll(".bloco-pav-linha").forEach(function(l){
      var v = lerPavSelects(l, antigos[+l.getAttribute("data-bp-i")]||"");
      if(v && vals.indexOf(v)===-1) vals.push(v);
    });
    return vals;
  }
  function pavimentosFieldHtml(d){
    var pavs = d.pavimentos || [];
    return '<div class="unidades-row">'
      + pavs.map(function(p, pi){
          return '<span class="unidade-chip">'+escapeHtml(p)+'<button type="button" data-rm-pavimento="'+pi+'" title="Remover">✕</button></span>';
        }).join("")
      + '</div>'
      + '<div class="unidade-add" id="nova-pavimento-caixa">'+pavSelectsHtml("", 'id="nova-pavimento"', "Escolha um pavimento…")
        + '<button type="button" class="btn" id="add-pavimento">+ Adicionar pavimento</button></div>'
      + '<div class="hint" style="margin-top:6px;">Opcional: adicione um pavimento para cada andar que esta ficha também cobre. Todos aparecem no filtro de pavimentos do painel.</div>';
  }

  /* ---------------- proteção do rascunho (v1.1) ----------------
     Tudo o que é digitado numa ficha fica guardado também no próprio
     aparelho (localStorage) até o servidor confirmar o salvamento. Assim,
     fechar a ficha sem querer, o app travar ou o sinal cair no subsolo não
     apaga o que foi preenchido: ao reabrir, o sistema oferece recuperar. */
  var RASCUNHO_KEY = "traco-integrado-rascunho";
  var salvando = false;
  var ignorarPop = false;
  var MSG_SAIR_SEM_SALVAR = "Há alterações não salvas nesta ficha. Sair mesmo assim?\n\n"
    + "(Elas continuam guardadas neste aparelho e podem ser recuperadas ao abrir a ficha de novo.)";
  function rascunhoChave(type, id){ return type+":"+(id||"novo"); }
  function lerRascunho(){
    try{ return JSON.parse(localStorage.getItem(RASCUNHO_KEY)||"null"); }catch(ex){ return null; }
  }
  function guardarRascunho(){
    if(!draft || !draft.chave) return;
    try{
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({
        chave: draft.chave, type: draft.type, id: draft.id, data: draft.data, em: nowISO()
      }));
    }catch(ex){}
  }
  function limparRascunho(chave){
    var r = lerRascunho();
    if(r && (!chave || r.chave===chave)){ try{ localStorage.removeItem(RASCUNHO_KEY); }catch(ex){} }
  }
  function draftAlterado(){
    return !!draft && typeof draft.orig==="string" && JSON.stringify(draft.data)!==draft.orig;
  }
  // Fechar pedido pelo usuário (✕, toque fora, Esc, botão Voltar do celular):
  // pergunta antes de sair se houver algo não salvo.
  function tentarFecharModal(){
    if(salvando) return false;
    if(draftAlterado() && !confirm(MSG_SAIR_SEM_SALVAR)) return false;
    closeModal();
    return true;
  }
  // Botão "Voltar" do Android / gesto de voltar do iPhone: com a ficha aberta,
  // fecha a ficha em vez de sair do app.
  function marcarHistoricoModal(){
    try{ if(!(history.state && history.state.tiModal)) history.pushState({tiModal:1}, ""); }catch(ex){}
  }
  window.addEventListener("popstate", function(){
    var aberto = !document.getElementById("overlay").hidden;
    if(ignorarPop){ ignorarPop=false; if(aberto) marcarHistoricoModal(); return; }
    if(!aberto) return;
    // Editor de mapa em tela cheia aberto: o Voltar fecha só o editor.
    if(window.__edmapaFechar){
      window.__edmapaFechar();
      try{ history.pushState({tiModal:1}, ""); }catch(ex){}
      return;
    }
    if(salvando || (draftAlterado() && !confirm(MSG_SAIR_SEM_SALVAR))){
      try{ history.pushState({tiModal:1}, ""); }catch(ex){}
      return;
    }
    closeModal(true);
  });
  // Ao entrar no sistema: se ficou alguma ficha não salva neste aparelho
  // (app fechado, bateria acabou, sem sinal), oferece reabrir.
  function oferecerRascunhoPendente(){
    var r = lerRascunho();
    if(!r || !r.data || !document.getElementById("overlay").hidden) return;
    var nome = r.type==="fvs"
      ? "a ficha FVS "+(r.data.numero||"(sem número)")
      : "a rastreabilidade de "+rastRotulo(r.data);
    if(confirm("Este aparelho tem alterações não salvas n"+nome+" (de "+fmtDateTimeBR(r.em)+").\n\nAbrir agora para revisar e salvar?")){
      openModal(r.type, r.id, r.data.tipo, {restaurar:true});
    }
  }

  function openModal(type, id, tipoKey, opts){
    opts = opts || {};
    ncAnexoErro = {};
    var data;
    var base = id ? (type==="fvs" ? fvsMap.get(id) : rastMap.get(id)) : null;
    var rasc = lerRascunho();
    var chave = rascunhoChave(type, id);
    if(opts.restaurar && rasc && rasc.type===type && (rasc.id||null)===(id||null)) chave = rasc.chave;
    if(base) data = JSON.parse(JSON.stringify(base));
    else if(opts.restaurar && rasc && rasc.data) data = JSON.parse(JSON.stringify(rasc.data));
    else data = type==="fvs" ? blankFvs(tipoKey) : blankRast();
    // v1.14: ficha nova aberta pelo cronograma já vem com o pavimento
    if(!base && !opts.restaurar && type==="fvs" && opts.pavimento) data.pavimentos = [opts.pavimento];
    if(!data.checklist) data.checklist={};
    if(!data.elementos) data.elementos={};
    if(!data.linhas) data.linhas=[blankLinha(1)];
    if(type==="rast" && !data.mapeamento) data.mapeamento=blankMapeamento();
    if(type==="rast") data = doFirestore(data);
    if(type==="fvs" && !data.tipo) data.tipo="fvs04"; // fichas antigas, de antes dos novos tipos
    if(type==="fvs" && !data.unidades) data.unidades=[];
    // Fichas de FVS antigas (antes da lista de não conformidades) chegam aqui
    // sem "naoConformidades" — converte já na abertura, a partir do bloco
    // único legado, para o formato de lista novo. Se a ficha for salva assim
    // (mesmo sem editar nada na NC), ela passa a usar o formato novo pra
    // sempre, sem perder a não conformidade que já estava registrada.
    if(type==="fvs" && !Array.isArray(data.naoConformidades)) data.naoConformidades = fichaNaoConformidades(data);
    if(!data.pavimentos) data.pavimentos=[]; // fichas antigas, de antes do multi-pavimento — fallback usa local/blocoPav
    // v1.34: rastreabilidade — "A / B" digitado antes vira dois pavimentos
    if(type==="rast"){ var pvs = pavimentosDaRast(data); if(pvs.length){ data.pavimentos = pvs; data.blocoPav = pvs.join(" / "); } }
    draft = { type:type, id:id||null, data:data, orig:JSON.stringify(data), chave:chave };
    // Ficha que só existe no rascunho (nunca chegou ao servidor): conta como
    // alterada, para pedir confirmação antes de fechar sem salvar.
    if(opts.restaurar && !base) draft.orig = "{}";
    // Rascunho guardado neste aparelho para esta mesma ficha, diferente do
    // que está no servidor: oferece recuperar (ou aplica direto, se veio de
    // oferecerRascunhoPendente).
    if(rasc && rasc.chave===chave && rasc.type===type && rasc.data){
      var rascJson = JSON.stringify(rasc.data);
      if(rascJson!==draft.orig){
        if(opts.restaurar || confirm("Este aparelho tem alterações desta ficha que não foram salvas (de "+fmtDateTimeBR(rasc.em)+").\n\nRecuperar essas alterações?")){
          draft.data = JSON.parse(rascJson);
        } else {
          limparRascunho(chave);
        }
      }
    }
    document.getElementById("overlay").hidden=false;
    document.body.style.overflow="hidden";
    marcarHistoricoModal();
    renderModal();
  }
  // Tela de escolha do tipo de FVS, mostrada antes de abrir uma ficha nova (não
  // aparece ao editar uma já existente — aí o tipo já está definido). Reaproveita
  // o mesmo overlay/modal da edição, só que com um conteúdo próprio.
  function openTipoChooser(onChoose){
    // onChoose(tipoKey) é opcional: quando informado, é chamado em vez de abrir
    // direto um rascunho novo — usado por generateLinked() para criar a FVS já
    // vinculada a uma rastreabilidade existente, mas ainda perguntando o tipo.
    var m=document.getElementById("modal");
    var opcoes = [{key:"fvs04", codigo:"FVS 04", titulo:"Forma, Desforma, Armação e Concretagem"}]
      .concat(FVS_TIPOS.map(function(t){ return {key:t.key, codigo:t.codigo, titulo:t.titulo}; }));
    m.innerHTML = ''
      + '<div class="modal-head"><h2>Qual o tipo de FVS?</h2><button class="close-x" id="modal-close" aria-label="Fechar">✕</button></div>'
      + '<div class="modal-body">'
      + '<div class="tipo-grid">'
      + opcoes.map(function(o){
          return '<button type="button" class="tipo-card" data-tipo-choice="'+o.key+'">'
            + '<span class="tipo-codigo">'+escapeHtml(o.codigo)+'</span>'
            + '<span class="tipo-titulo">'+escapeHtml(o.titulo)+'</span>'
            + '</button>';
        }).join("")
      + '</div></div>';
    m.querySelector("#modal-close").addEventListener("click", tentarFecharModal);
    m.querySelectorAll("[data-tipo-choice]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var tipoKey = btn.getAttribute("data-tipo-choice");
        if(onChoose) onChoose(tipoKey);
        else openModal("fvs", null, tipoKey);
      });
    });
    document.getElementById("overlay").hidden=false;
    document.body.style.overflow="hidden";
    marcarHistoricoModal();
  }
  // fromPop=true quando o fechamento veio do botão Voltar (o histórico já voltou).
  function closeModal(fromPop){
    draft=null;
    mapaEstado=null;
    document.getElementById("overlay").hidden=true;
    document.body.style.overflow="";
    // "!ignorarPop": se já há um "voltar" a caminho (fechou e reabriu rápido),
    // não pede outro — dois seguidos saíam do app (corrigido na v1.2).
    if(fromPop!==true && !ignorarPop){
      try{ if(history.state && history.state.tiModal){ ignorarPop=true; history.back(); } }catch(ex){}
    }
  }

  function renderModal(){
    var m=document.getElementById("modal");
    m.innerHTML = draft.type==="fvs" ? fvsModalHtml(draft.data, draft.id) : rastModalHtml(draft.data, draft.id);
    // v1.3: no celular cada betonada vira um cartão — cada campo leva o nome
    // da coluna como rótulo (layout.css usa data-label).
    m.querySelectorAll("table.lines").forEach(function(t){
      var cab = Array.prototype.map.call(t.querySelectorAll("thead th"), function(th){ return th.textContent.trim(); });
      t.querySelectorAll("tbody tr").forEach(function(tr){
        Array.prototype.forEach.call(tr.children, function(td, i){ td.setAttribute("data-label", cab[i]||""); });
      });
    });
    wireModalEvents();
    // v1.18: assinaturas também na rastreabilidade (engenharia e estagiário/técnico)
    if(draft.type==="rast"){
      m.querySelectorAll("[data-assinar-papel]").forEach(function(b){ b.addEventListener("click", function(){ assinarRast(b.getAttribute("data-assinar-papel")); }); });
      var bCr = m.querySelector("[data-cad-assin]"); if(bCr) bCr.addEventListener("click", abrirMinhaAssinatura);
    }
    // v1.15: assinatura / ficha travada
    if(draft.type==="fvs"){
      m.querySelectorAll("[data-assinar-papel]").forEach(function(b){ b.addEventListener("click", function(){ assinarFvs(b.getAttribute("data-assinar-papel")); }); });
      var bC = m.querySelector("[data-cad-assin]"); if(bC) bC.addEventListener("click", abrirMinhaAssinatura);
      var bR = m.querySelector("[data-nova-rev]"); if(bR) bR.addEventListener("click", novaRevisaoFvs);
      m.classList.toggle("ficha-travada", !!draft.data.travada);
      if(draft.data.travada){
        m.querySelectorAll(".modal-body input, .modal-body select, .modal-body textarea").forEach(function(el){ el.disabled = true; });
        // botões do corpo também (teclado), menos o bloco de assinaturas, o aviso e "abrir rastreabilidade"
        m.querySelectorAll(".modal-body button").forEach(function(el){
          if(!el.closest(".fvs-assin-bloco, .fvs-travada-banner") && el.id!=="open-linked-rast" && el.id!=="fvs-desforma") el.disabled = true;
        });
      }
    } else m.classList.remove("ficha-travada");
    if(draftAlterado()) guardarRascunho();
  }

  function statusBadgeFvs(d){ return pill(fvsStatus(d)); }
  function statusBadgeRast(d){ return pill(rastStatus(d)); }

  // Mesma legenda impressa no rodapé do checklist da planilha oficial —
  // mostrada em toda ficha FVS (qualquer tipo) para quem estiver preenchendo
  // saber o que cada sigla dos botões (NA/P/X/V) significa.
  var LEGENDA_FVS_HTML = '<div class="legenda-fvs">'
    + '<span class="legenda-item"><span class="legenda-badge badge-na">NA</span>Não aplicável</span>'
    + '<span class="legenda-item"><span class="legenda-badge badge-p">✓</span>Aprovado</span>'
    + '<span class="legenda-item"><span class="legenda-badge badge-x">✕</span>Reprovado</span>'
    + '<span class="legenda-item"><span class="legenda-badge badge-v">↻✓</span>Reinspecionado e aprovado</span>'
    + '</div>';

  // Botão de um item do checklist marcado para um grupo específico (elemento
  // estrutural, unidade dinâmica como "Estaca 3", ou "_unico" quando a ficha
  // não distingue grupos). "P" e "V" usam a fonte Wingdings 2 (mesma da
  // legenda impressa no modelo oficial) para virar símbolo; em computadores
  // sem essa fonte instalada, o navegador simplesmente volta a mostrar a
  // letra normal.
  // v1.3: símbolos Unicode (funcionam em iPhone/Android) no lugar da fonte
  // Wingdings, que só existe no Windows — no celular aparecia a letra crua.
  // O valor gravado continua "P"/"X"/"V"/"NA" (exports Excel inalterados).
  var SEG_SIMBOLO = { NA:"NA", P:"✓", X:"✕", V:"↻✓" };
  var SEG_NOME = { NA:"Não aplica", P:"Aprovado", X:"Reprovado", V:"Reinspec." };
  function segBtn(key, grupoKey, val, label, v){
    return '<button type="button" data-check="'+key+'" data-elemento="'+grupoKey+'" data-v="'+val+'" aria-pressed="'+(v===val)+'"'
      + ' title="'+SEG_NOME[val]+'" aria-label="'+SEG_NOME[val]+'">'
      + '<span class="seg-sim">'+SEG_SIMBOLO[val]+'</span><small class="seg-nome">'+SEG_NOME[val]+'</small></button>';
  }

  function anyChecklistReprovado(checklist){
    return Object.keys(checklist||{}).some(function(k){
      var porGrupo = checklist[k] || {};
      return Object.keys(porGrupo).some(function(gk){ return porGrupo[gk]==="X"; });
    });
  }

  /* ---------------- v1.15: assinatura e ficha travada (Fase 2, itens 8 e 9) ----------------
     Assinar = acrescentar em d.assinaturas uma cópia da assinatura cadastrada
     (com data e hora) e salvar a ficha pelo caminho normal (saveDraft), que
     funciona sem sinal. A assinatura da ENGENHARIA trava a ficha (d.travada):
     ela não pode mais ser alterada nem excluída (também nas regras do banco).
     Para corrigir: "Nova revisão" guarda uma cópia completa da ficha como está
     em fvsRevisoes (nunca apagada) e libera a ficha com revisão +1. */
  function fvsTravadaBannerHtml(d){
    if(!d.travada) return "";
    var eng = (d.assinaturas||[]).filter(function(s){ return s.papel==="engenheiro"; }).slice(-1)[0];
    return '<div class="fvs-travada-banner"><b>🔒 Ficha assinada e travada</b>'
      + '<span>'+(eng ? 'Assinada por '+escapeHtml(eng.nome)+' em '+escapeHtml(fmtDateTimeBR(eng.em))+'. ' : '')
      + 'Para corrigir algo, crie uma nova revisão: a versão atual fica guardada para consulta.</span>'
      + '<button type="button" class="btn" data-nova-rev>Nova revisão</button></div>';
  }
  /* v1.19: toda ficha (FVS e rastreabilidade) tem DOIS lugares de assinatura,
     sempre visíveis: inspeção/coleta (estagiário ou técnico) e engenharia.
     Cada pessoa assina no seu lugar com o próprio login. Na FVS a assinatura da
     engenharia trava a ficha, mas o(a) estagiário(a) ainda pode assinar depois. */
  function assinaturaSlotsHtml(d, id, tipo){
    var slots = [{ papel:"tecnico", rot:"Inspeção / coleta — estagiário(a) ou técnico(a)" }, { papel:"engenheiro", rot:"Engenheiro(a) responsável" }];
    var html = slots.map(function(sl){
      var a = assinaturaDoPapel(d, sl.papel), acao = "";
      if(!a){
        if(!id) acao = '<small class="hint">Salve a ficha para poder assinar.</small>';
        else if(somenteLeitura) acao = '';
        else if(!minhaAssinatura) acao = '<button type="button" class="btn small" data-cad-assin>Cadastrar minha assinatura</button>';
        else if(sl.papel==="engenheiro" && d.travada) acao = '';
        else acao = '<button type="button" class="btn small primary" data-assinar-papel="'+sl.papel+'">Assinar aqui</button>';
      }
      return '<div class="assin-slot'+(a?" feita":"")+'"><div class="assin-slot-rot">'+escapeHtml(sl.rot)+'</div>'
        + (a ? (a.imagem ? '<img src="'+escapeHtml(a.imagem)+'" alt="Assinatura de '+escapeHtml(a.nome)+'">' : '')
            + '<div class="assin-slot-nome"><b>'+escapeHtml(a.nome)+'</b>'+(a.crea ? ' · '+escapeHtml(a.crea) : '')+'<small>'+escapeHtml(PAPEIS_ASSIN[a.papel]||a.papel)+' · '+escapeHtml(fmtDateTimeBR(a.em))+'</small></div>'
          : '<div class="assin-slot-falta">Falta assinar</div>'+acao)
        + '</div>';
    }).join("");
    var outras = (d.assinaturas||[]).filter(function(x){ return x.papel==="encarregado"; });
    return '<div class="assin-slots">'+html+'</div>'+(outras.length ? assinaturasHtml(outras, fmtDateTimeBR) : '')
      + (tipo==="fvs" && !d.travada ? '<div class="hint" style="margin-top:6px">A assinatura da engenharia fecha e trava a ficha.</div>' : '');
  }
  function fvsAssinaturasFieldHtml(d, id){
    var hist = (d.historicoRevisoes||[]).length ? '<div class="assin-hist"><b>Revisões anteriores</b>'
      + d.historicoRevisoes.map(function(h){ return '<div>Rev. '+String(h.rev).padStart(2,"0")+' · '+escapeHtml(fmtDateTimeBR(h.em))+' · '+escapeHtml(h.por||"")+' — '+escapeHtml(h.motivo||"")+'</div>'; }).join("")+'</div>' : '';
    return '<fieldset class="fvs-assin-bloco"><legend>Assinaturas</legend>'+assinaturaSlotsHtml(d, id, "fvs")+hist+'</fieldset>';
  }
  // papel com que a pessoa assina no lugar escolhido (no lugar da inspeção vale o
  // cadastro dela se for técnico/estagiário; se não, assina como estagiário)
  function papelDoLugar(lugar){
    var meu = (minhaAssinatura && minhaAssinatura.papel) || "";
    if(lugar==="engenheiro") return "engenheiro";
    return (meu==="tecnico" || meu==="estagiario") ? meu : "estagiario";
  }
  function avisoPapel(papel){
    var meu = (minhaAssinatura && minhaAssinatura.papel) || "engenheiro";
    if(meu===papel || (papel!=="engenheiro" && (meu==="tecnico" || meu==="estagiario"))) return "";
    return "\n\nAtenção: seu cadastro de assinatura está como "+(PAPEIS_ASSIN[meu]||meu)+". Se isso estiver errado, corrija em “Minha assinatura”.";
  }
  function abrirMinhaAssinatura(){
    var u = auth.currentUser; if(!u) return;
    abrirCadastroAssinatura({ atual:minhaAssinatura, emailNome:(u.displayName||""),
      salvar:function(dados){
        dados.email = currentUserEmail; dados.atualizadoEm = nowISO();
        var envio = assinCol.doc(u.uid).set(dados);
        return Promise.race([envio, new Promise(function(res){ setTimeout(res, 8000); })]);
      } });
  }
  async function assinarFvs(lugar){
    var papel = papelDoLugar(lugar || (minhaAssinatura && minhaAssinatura.papel) || "engenheiro");
    if(!draft || draft.type!=="fvs" || !draft.id || !minhaAssinatura || (draft.data.travada && papel==="engenheiro")) return;
    var d = draft.data;
    var ncAbertas = fichaNaoConformidades(d).filter(function(n){ return !n.concluida; }).length;
    var txt = "Assinar a ficha "+(d.codigo||"FVS")+" "+(d.numero||"")+" como "+(PAPEIS_ASSIN[papel]||papel)+"?"+avisoPapel(papel);
    if(papel==="engenheiro") txt += "\n\nA ficha será FECHADA e TRAVADA: depois disso só dá para corrigir criando uma nova revisão."
      + (ncAbertas ? "\n\nAtenção: há "+ncAbertas+" não conformidade(s) sem conclusão." : "");
    if(!confirm(txt)) return;
    var antes = JSON.stringify(d);
    d.assinaturas = (d.assinaturas||[]).concat([{ papel:papel, nome:minhaAssinatura.nome||"", crea:minhaAssinatura.crea||"",
      email:currentUserEmail, uid:(auth.currentUser||{}).uid||"", em:nowISO(), imagem:minhaAssinatura.imagem||"", revisao:d.revisao||0 }]);
    if(papel==="engenheiro"){
      if(!d.engenheiro) d.engenheiro = minhaAssinatura.nome||"";
      if(!d.fechado){ d.fechado = true; if(!d.dataFechamento) d.dataFechamento = todayISO(); }
      d.travada = true; d.travadaEm = nowISO(); d.travadaPor = currentUserEmail;
    } else if((papel==="tecnico" || papel==="estagiario") && !d.inspecionadoPor){ d.inspecionadoPor = minhaAssinatura.nome||""; }
    // v1.19: ficha já travada (engenharia assinou) → grava SÓ a assinatura nova,
    // que é o que as regras do banco aceitam numa ficha travada
    if(d.travada && papel!=="engenheiro"){
      var dados = { assinaturas:d.assinaturas, updatedAt:nowISO(), updatedByEmail:currentUserEmail||"" };
      if(d.inspecionadoPor) dados.inspecionadoPor = d.inspecionadoPor;
      try{
        var envio = fvsCol.doc(draft.id).update(dados);
        await Promise.race([envio, new Promise(function(res){ setTimeout(res, 10000); })]);
        draft.orig = JSON.stringify(draft.data); // a assinatura já foi gravada
        renderModal();
      }catch(ex){
        console.error(ex);
        alert("Não foi possível assinar: "+(ex && ex.code==="permission-denied" ? "o banco ainda não aceita essa assinatura (falta publicar as regras)." : (ex && ex.message ? ex.message : "erro desconhecido")));
        draft.data = JSON.parse(antes); renderModal();
      }
      return;
    }
    var ok = await saveDraft(true);
    if(!ok && draft && draft.type==="fvs"){ draft.data = JSON.parse(antes); renderModal(); }
  }
  /* v1.18: assinatura na rastreabilidade. A engenheira e o(a) estagiário(a) /
     técnico(a) assinam; no Excel a imagem vai para o campo de assinatura do
     modelo (responsável pela coleta e engenheiro responsável). Não trava a
     ficha: betonadas podem ser completadas depois. */
  function rastAssinaturasFieldHtml(d, id){
    return '<fieldset class="fvs-assin-bloco"><legend>Assinaturas</legend>'+assinaturaSlotsHtml(d, id, "rast")
      + '<div class="hint" style="margin-top:6px">No Excel, cada assinatura sai embaixo do nome: coleta e engenheiro(a) responsável.</div></fieldset>';
  }
  async function assinarRast(lugar){
    if(!draft || draft.type!=="rast" || !draft.id || !minhaAssinatura) return;
    var d = draft.data, papel = papelDoLugar(lugar || minhaAssinatura.papel || "engenheiro");
    if(!confirm("Assinar a rastreabilidade de "+fmtDateBR(d.data)+(d.blocoPav ? " ("+d.blocoPav+")" : "")+" como "+(PAPEIS_ASSIN[papel]||papel)+"?"+avisoPapel(papel))) return;
    var antes = JSON.stringify(d);
    d.assinaturas = (d.assinaturas||[]).concat([{ papel:papel, nome:minhaAssinatura.nome||"", crea:minhaAssinatura.crea||"",
      email:currentUserEmail, uid:(auth.currentUser||{}).uid||"", em:nowISO(), imagem:minhaAssinatura.imagem||"" }]);
    if(papel==="engenheiro" && !d.engenheiro) d.engenheiro = minhaAssinatura.nome||"";
    if((papel==="tecnico" || papel==="estagiario") && !d.responsavelColeta) d.responsavelColeta = minhaAssinatura.nome||"";
    var ok = await saveDraft(true);
    if(!ok && draft && draft.type==="rast"){ draft.data = JSON.parse(antes); renderModal(); }
  }
  async function novaRevisaoFvs(){
    if(!draft || draft.type!=="fvs" || !draft.id || !draft.data.travada) return;
    var motivo = prompt("Nova revisão da ficha "+(draft.data.codigo||"")+" "+(draft.data.numero||"")+".\n\nA versão assinada fica guardada para consulta. Qual o motivo da revisão?");
    if(motivo==null) return;
    motivo = motivo.trim();
    if(!motivo){ alert("Informe o motivo da revisão."); return; }
    var d = draft.data, rev = d.revisao||0;
    var copia = JSON.parse(JSON.stringify(d));
    try{
      var ref = fvsRevCol.doc();
      // cópia completa da ficha como estava (nunca é alterada nem apagada)
      var envio = ref.set({ fvsId:draft.id, revisao:rev, motivo:motivo, em:nowISO(), por:currentUserEmail, ficha:paraFirestore(copia) });
      await Promise.race([envio, new Promise(function(res){ setTimeout(res, 8000); })]);
      d.historicoRevisoes = (d.historicoRevisoes||[]).concat([{ rev:rev, em:nowISO(), por:currentUserEmail, motivo:motivo, copiaId:ref.id }]);
      d.revisao = rev+1; d.travada = false; d.travadaEm = ""; d.travadaPor = "";
      d.assinaturas = []; d.fechado = false;
      await saveDraft(true);
    }catch(ex){
      console.error(ex);
      alert("Não foi possível criar a revisão: "+(ex && ex.code==="permission-denied" ? "o banco ainda não aceita revisões (falta publicar as regras)." : (ex && ex.message ? ex.message : "erro desconhecido"))+".");
    }
  }

  function fvsModalHtml(d, id){
    var linked = d.rastreabilidadeId ? rastMap.get(d.rastreabilidadeId) : null;
    var unlinkedRast=[];
    rastMap.forEach(function(r,rid){ if(!r.fvsId) unlinkedRast.push({id:rid,r:r}); });

    var tipoInfo = (d.tipo && d.tipo!=="fvs04") ? getFvsTipo(d.tipo) : null;
    var legendaHtml = LEGENDA_FVS_HTML;
    var elementosHtml = "";
    var checklistHtml = "";
    var anyReprovado = false;

    if(!tipoInfo){
      // ---------------- FVS 04 — Forma, Desforma, Armação e Concretagem ----------------
      // Cada elemento estrutural marcado abaixo ganha seu próprio conjunto de
      // respostas do checklist (NA/Aprovado/Reprovado/Reinspecionado por item) —
      // reflete as colunas Pilares/Vigas/Paredes/Laje/Outras Estruturas do modelo
      // oficial, onde o mesmo item pode ter resultado diferente em cada uma.
      var elementosAtivos = FVS_ELEMENTOS.filter(function(el){ return !!d.elementos[el.key]; });

      elementosHtml = '<fieldset><legend>Elementos estruturais avaliados nesta ficha</legend><div class="elementos-grid">'+FVS_ELEMENTOS.map(function(el){
        var checked = !!d.elementos[el.key];
        return '<label class="elemento-chip'+(checked?" active":"")+'"><input type="checkbox" data-elemento="'+el.key+'" '+(checked?"checked":"")+'> '+escapeHtml(el.label)+'</label>';
      }).join("")+'</div></fieldset>';

      if(elementosAtivos.length===0){
        checklistHtml = '<div class="hint">Selecione ao menos um elemento estrutural acima (Pilares, Vigas, Paredes, Laje ou Outras Estruturas) para avaliar o checklist. Se mais de um elemento foi concretado nesta ficha, cada um é avaliado separadamente — o resultado de um item pode ser diferente para a laje e para os pilares, por exemplo.</div>';
      } else {
        checklistHtml = FVS_CHECKLIST.map(function(cat, ci){
          var itemsHtml = cat.itens.map(function(it, ii){
            var key=ci+"-"+ii;
            var porElemento = d.checklist[key] || {};
            var rowsHtml = elementosAtivos.map(function(el){
              var v = porElemento[el.key] || "";
              return '<div class="item-row-elemento"><div class="elemento-tag">'+escapeHtml(el.label)+'</div>'
                + '<div class="seg">'+segBtn(key,el.key,"NA","NA",v)+segBtn(key,el.key,"P","P",v)+segBtn(key,el.key,"X","X",v)+segBtn(key,el.key,"V","V",v)+'</div></div>';
            }).join("");
            return '<div class="item-row multi"><div class="item-info"><div class="name">'+escapeHtml(it.n)+'</div><div class="method">'+escapeHtml(it.m)+'</div></div>'
              + '<div class="item-elementos">'+rowsHtml+'</div></div>';
          }).join("");
          return '<div class="cat-block"><div class="cat-title">'+escapeHtml(cat.cat)+'</div>'+itemsHtml+'</div>';
        }).join("");
      }
      anyReprovado = anyChecklistReprovado(d.checklist);

    } else if(tipoInfo.unidades.mode==="single"){
      // ---------------- tipo de unidade única (ex.: Locação da Obra) ----------------
      // Não há elementos/unidades a distinguir: um único marcador por item.
      checklistHtml = tipoInfo.checklist.map(function(cat, ci){
        var itemsHtml = cat.itens.map(function(it, ii){
          var key=ci+"-"+ii;
          var porGrupo = d.checklist[key] || {};
          var v = porGrupo["_unico"] || "";
          return '<div class="item-row"><div class="item-info"><div class="name">'+escapeHtml(it.n)+'</div><div class="method">'+escapeHtml(it.m)+(it.tol?' · Tolerância: '+escapeHtml(it.tol):'')+'</div></div>'
            + '<div class="item-row-single seg">'+segBtn(key,"_unico","NA","NA",v)+segBtn(key,"_unico","P","P",v)+segBtn(key,"_unico","X","X",v)+segBtn(key,"_unico","V","V",v)+'</div></div>';
        }).join("");
        return '<div class="cat-block">'+(cat.cat?'<div class="cat-title">'+escapeHtml(cat.cat)+'</div>':'')+itemsHtml+'</div>';
      }).join("");
      anyReprovado = anyChecklistReprovado(d.checklist);

    } else {
      // ---------------- tipo de unidades dinâmicas (estacas, sapatas, blocos, trechos...) ----------------
      var unidades = d.unidades || [];
      var prefixo = tipoInfo.unidades.prefix || "Unidade";

      elementosHtml = '<fieldset><legend>Unidades avaliadas nesta ficha (ex.: '+escapeHtml(prefixo)+' 1, '+escapeHtml(prefixo)+' 2…)</legend>'
        + '<div class="unidades-row">'
        + unidades.map(function(u, ui){
            return '<span class="unidade-chip">'+escapeHtml(u)+'<button type="button" data-rm-unidade="'+ui+'" title="Remover">✕</button></span>';
          }).join("")
        + '</div>'
        + '<div class="unidade-add"><input type="text" id="nova-unidade" placeholder="ex.: '+escapeHtml(prefixo)+' '+(unidades.length+1)+'"><button type="button" class="btn" id="add-unidade">+ Adicionar</button></div>'
        + '</fieldset>';

      if(unidades.length===0){
        checklistHtml = '<div class="hint">Adicione ao menos uma unidade acima (ex.: '+escapeHtml(prefixo)+' 1) para avaliar o checklist. Cada uma é avaliada separadamente — o resultado de um item pode ser diferente entre elas.</div>';
      } else {
        checklistHtml = tipoInfo.checklist.map(function(cat, ci){
          var itemsHtml = cat.itens.map(function(it, ii){
            var key=ci+"-"+ii;
            var porUnidade = d.checklist[key] || {};
            var rowsHtml = unidades.map(function(u){
              var v = porUnidade[u] || "";
              return '<div class="item-row-elemento"><div class="elemento-tag">'+escapeHtml(u)+'</div>'
                + '<div class="seg">'+segBtn(key,u,"NA","NA",v)+segBtn(key,u,"P","P",v)+segBtn(key,u,"X","X",v)+segBtn(key,u,"V","V",v)+'</div></div>';
            }).join("");
            return '<div class="item-row multi"><div class="item-info"><div class="name">'+escapeHtml(it.n)+'</div><div class="method">'+escapeHtml(it.m)+(it.tol?' · Tolerância: '+escapeHtml(it.tol):'')+'</div></div>'
              + '<div class="item-elementos">'+rowsHtml+'</div></div>';
          }).join("");
          return '<div class="cat-block">'+(cat.cat?'<div class="cat-title">'+escapeHtml(cat.cat)+'</div>':'')+itemsHtml+'</div>';
        }).join("");
      }
      anyReprovado = anyChecklistReprovado(d.checklist);
    }

    var linkHtml;
    if(linked){
      linkHtml = '<div class="link-card linked"><div class="info"><div class="t">Rastreabilidade de '+escapeHtml(rastRotulo(linked))+'</div>'
        + '<div class="s">'+escapeHtml(fmtDateBR(linked.data))+' · '+statusBadgeRast(linked)+'</div></div>'
        + '<button class="btn" id="open-linked-rast">Abrir</button>'
        + '<button class="btn ghost danger" id="unlink-rast">Desvincular</button></div>';
    } else {
      linkHtml = '<div class="link-card"><div class="info"><div class="t">Nenhuma rastreabilidade vinculada</div><div class="s">Vincule um controle existente ou gere um novo já conectado a esta ficha.</div></div>'
        + '<div class="picker">'
        + '<select id="link-picker"><option value="">Selecionar existente…</option>'
        + unlinkedRast.map(function(x){ return '<option value="'+x.id+'">'+escapeHtml(rastRotulo(x.r))+'</option>'; }).join("")
        + '</select>'
        + '<button class="btn" id="do-link-rast">Vincular</button>'
        + '<button class="btn primary" id="gen-rast">+ Gerar nova</button>'
        + '</div></div>';
    }

    return ''
      + '<div class="modal-head"><h2 id="modal-title">'+(id?(d.travada?"Ficha FVS assinada":"Editar ficha FVS"):"Nova ficha FVS")+(d.revisao?' <small class="fvs-rev">Rev. '+String(d.revisao).padStart(2,"0")+'</small>':'')+'</h2>'+statusBadgeFvs(d)+'<button class="close-x" id="modal-close" aria-label="Fechar">✕</button></div>'
      + '<div class="modal-body">'
      + fvsTravadaBannerHtml(d)
      + (anyReprovado && (d.naoConformidades||[]).length===0 ? '<div class="banner">Há item(ns) marcado(s) como reprovado (X). Considere registrar uma não conformidade abaixo.</div>' : '')
      + '<fieldset><legend>Identificação</legend><div class="grid3">'
        + field("Código FVS","codigo",d.codigo,"text")
        // v1.4: número automático (não editável), gerado ao salvar
        + '<div class="field"><label>Nº da ficha</label><div class="num-auto">'
          + (d.numero ? '<b>'+escapeHtml(d.numero)+'</b>' : '<span>gerado ao salvar</span>')
          + (d.numeroAnterior ? '<small>antes: '+escapeHtml(d.numeroAnterior)+'</small>' : '')
        + '</div></div>'
        + field("Descrição do serviço","descricao",d.descricao,"text")
        + '</div><div class="grid2">'+field("Obra","obra",d.obra,"text")+field("Local / elemento","local",d.local,"text","ex.: 5º Pav. — Laje")+'</div></fieldset>'
      + '<fieldset><legend>Pavimentos desta ficha</legend>'+pavimentosFieldHtml(d)+'</fieldset>'
      + '<fieldset><legend>Datas e responsáveis</legend><div class="grid3">'
        + field("Data de abertura","dataAbertura",d.dataAbertura,"date")
        + field("Data de concretagem","dataConcretagem",d.dataConcretagem,"date")
        + field("Data de fechamento","dataFechamento",d.dataFechamento,"date")
        + '</div><div class="grid2">'+field("Inspecionado por","inspecionadoPor",d.inspecionadoPor,"text")+field("Engenheiro responsável","engenheiro",d.engenheiro,"text")+'</div></fieldset>'
      + elementosHtml
      + '<fieldset><legend>Checklist de verificação</legend>'+legendaHtml+checklistHtml+'</fieldset>'
      + '<fieldset><legend>Não conformidades</legend>'
        // v1.36: fotos da desforma entram aqui como não conformidades (modulos/nc/desforma.js)
        + (!tipoInfo && id ? '<div class="desforma-barra"><button type="button" class="btn desforma-btn" id="fvs-desforma">📷 Pendências da desforma (fotos)</button>'
            + '<span class="hint">'+(d.rastreabilidadeId ? 'tire as fotos e mande para a empresa de forma' : 'ligue a rastreabilidade desta concretagem para registrar')+'</span></div>' : '')
        + ncListFieldHtml(d)+'</fieldset>'
      + '<fieldset><legend>Observações</legend>'+field("","observacoes",d.observacoes,"textarea")+'</fieldset>'
      + '<fieldset><legend>Rastreabilidade de concreto vinculada</legend>'+linkHtml+'</fieldset>'
      + fvsAssinaturasFieldHtml(d, id)
      + lastUpdatedHtml(d) + verHistoricoHtml("fvs", id)
      + '</div>'
      + '<div class="modal-foot">'
        + '<div style="display:flex;gap:10px;">'
        + '<button class="btn danger" id="btn-delete" '+(id?"":"disabled")+'>Excluir</button>'
        + '<button class="btn" id="btn-export">Exportar Excel</button>'
        + '</div>'
        + '<div style="display:flex;gap:10px;">'
        + '<button class="btn" id="btn-save">Salvar</button>'
        + '<button class="btn primary" id="btn-toggle-close">'+(d.fechado?"Reabrir ficha":"Fechar ficha")+'</button>'
        + '</div></div>';
  }

  function rastModalHtml(d, id){
    var linked = d.fvsId ? fvsMap.get(d.fvsId) : null;
    var unlinkedFvs=[];
    fvsMap.forEach(function(f,fid){ if(!f.rastreabilidadeId) unlinkedFvs.push({id:fid,f:f}); });

    var linhasHtml = d.linhas.map(function(l,idx){
      var gasto = diffMin(l.saidaUsina, l.lancFinal);
      var over = gasto!=null && gasto>TEMPO_MAX_MIN;
      return '<tr data-line="'+idx+'">'
        + td(inp("seq",idx,l.seq,"number","width:60px"))
        + td(inp("notaFiscal",idx,l.notaFiscal,"text"))
        + td(inp("betoneira",idx,l.betoneira,"text"))
        + td(inp("lacre",idx,l.lacre,"text"))
        + td(inp("volBetoneira",idx,l.volBetoneira,"text","width:60px"))
        + td(inp("volAcumulado",idx,l.volAcumulado,"text","width:60px"))
        + td(inp("fornecedor",idx,l.fornecedor,"text"))
        + td(inp("nSerieCP",idx,l.nSerieCP,"text"))
        + td(inp("nCPs",idx,l.nCPs,"text","width:48px"))
        + td(inp("slump",idx,l.slump,"text","width:56px"))
        + td(inp("saidaUsina",idx,l.saidaUsina,"time"))
        + td(inp("chegadaObra",idx,l.chegadaObra,"time"))
        + td(inp("lancInicial",idx,l.lancInicial,"time"))
        + td(inp("lancFinal",idx,l.lancFinal,"time"))
        + td('<span class="'+(over?"overrun":"")+'" data-tempo-idx="'+idx+'">'+fmtMin(gasto)+'</span>')
        + td(inp("aguaFolga",idx,l.aguaFolga,"text","width:50px"))
        + td(inp("aguaLanc",idx,l.aguaLanc,"text","width:50px"))
        + td(inp("pecas",idx,l.pecas,"text"))
        + td('<button type="button" class="rm-line" data-rm-line="'+idx+'" title="Remover linha">✕</button>')
        + '</tr>';
    }).join("");

    var anyOverrun = rastOverrun(d);

    var linkHtml;
    if(linked){
      linkHtml = '<div class="link-card linked"><div class="info"><div class="t">Ficha '+escapeHtml(linked.codigo||"FVS")+' · '+escapeHtml(linked.numero||"s/ nº")+'</div>'
        + '<div class="s">'+escapeHtml(fmtDateBR(linked.dataConcretagem))+' · '+statusBadgeFvs(linked)+'</div></div>'
        + '<button class="btn" id="open-linked-fvs">Abrir</button>'
        + '<button class="btn ghost danger" id="unlink-fvs">Desvincular</button></div>';
    } else {
      linkHtml = '<div class="link-card"><div class="info"><div class="t">Nenhuma ficha FVS vinculada</div><div class="s">Vincule uma ficha existente ou gere uma nova já conectada a este controle.</div></div>'
        + '<div class="picker">'
        + '<select id="link-picker-r"><option value="">Selecionar existente…</option>'
        + unlinkedFvs.map(function(x){ return '<option value="'+x.id+'">'+escapeHtml(fmtDateBR(x.f.dataConcretagem))+' · '+escapeHtml(x.f.codigo)+' '+escapeHtml(x.f.numero||"s/ nº")+'</option>'; }).join("")
        + '</select>'
        + '<button class="btn" id="do-link-fvs">Vincular</button>'
        + '<button class="btn primary" id="gen-fvs">+ Gerar nova</button>'
        + '</div></div>';
    }

    return ''
      + '<div class="modal-head"><h2 id="modal-title">'+(id?"Editar rastreabilidade":"Nova rastreabilidade")+'</h2>'+statusBadgeRast(d)+'<button class="close-x" id="modal-close" aria-label="Fechar">✕</button></div>'
      + '<div class="modal-body">'
      + rastAbasHtml(d, id)
      + '<div class="rast-painel" data-painel="concretagem"'+(rastAbaAtual()!=="concretagem"?" hidden":"")+'>'
      + '<div class="banner" id="rast-overrun-banner" style="'+(anyOverrun?"":"display:none;")+'">Uma ou mais betonadas excederam o tempo máximo de lançamento (2h30 — NBR 12655). Registre a ação corretiva ao final.</div>'
      + '<fieldset><legend>Identificação</legend><div class="grid2">'
        // v1.4: sem "Nº do controle" — a ficha é identificada por data + pavimento
        + field("Data da concretagem","data",d.data,"date")
        + '<div class="field"><label>Bloco / Pavimento</label>'+blocoPavMultiHtml(d)+'</div>'
        + '</div><div class="grid3">'
        + field("Obra","obra",d.obra,"text")
        + field("Projeto de referência","projetoReferencia",d.projetoReferencia,"text")
        + field("Slump aprovado","slumpAprovado",d.slumpAprovado,"text","ex.: 12±2cm")
        + '</div><div class="grid3">'
        + field("FCK solicitado","fckSolicitado",d.fckSolicitado,"text","ex.: 30 MPa")
        + '</div></fieldset>'
      + '<fieldset><legend>Betonadas <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— tempo máx. de lançamento: 2h30</span></legend>'
        + '<div class="lines-wrap"><table class="lines"><thead><tr>'
        + ['Seq','NF','Betoneira','Lacre','Vol. (m³)','Acum. (m³)','Fornecedor','Série CP','Nº CPs','Slump','Saída usina','Chegada obra','Lanç. inicial','Lanç. final','Tempo gasto','Água folga (L)','Água lanç. (L)','Peças concretadas',''].map(function(h){return '<th>'+h+'</th>';}).join("")
        + '</tr></thead><tbody id="linhas-body">'+linhasHtml+'</tbody></table></div>'
        + '<button type="button" class="btn ghost" id="add-line" style="margin-top:10px;">+ Adicionar betonada</button>'
        + '</fieldset>'
      + '<fieldset><legend>Mapeamento da concretagem <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— demarque na planta onde cada BT foi lançado</span></legend>'
        + mapeamentoFieldHtml(d)
        + '</fieldset>'
      + '<fieldset><legend>Coleta e observações</legend><div class="grid2">'
        + field("Responsável pela coleta","responsavelColeta",d.responsavelColeta,"text")
        + field("Engenheiro responsável","engenheiro",d.engenheiro,"text")
        + '</div>'+field("Observações / ações corretivas","acoesCorretivas",d.acoesCorretivas,"textarea")
        + field("Data de fechamento","dataFechamento",d.dataFechamento,"date")
        + '</fieldset>'
      + rastAssinaturasFieldHtml(d, id)
      + lastUpdatedHtml(d) + verHistoricoHtml("rastreabilidade", id)
      + '</div>'
      // v1.36: abas da ficha de concretagem — as FVS daquele local e o controle tecnológico
      + '<div class="rast-painel" data-painel="fvs"'+(rastAbaAtual()!=="fvs"?" hidden":"")+'>'
        + '<fieldset><legend>Ficha FVS 04 desta concretagem</legend>'+linkHtml+'</fieldset>'
        + rastFvsDoLocalHtml(d, id)
      + '</div>'
      + '<div class="rast-painel" data-painel="ct"'+(rastAbaAtual()!=="ct"?" hidden":"")+'>'
        + (ctSecaoRastHtml(d, id) || '<div class="hint">Lance as notas fiscais nas betonadas (aba Concretagem) para ver aqui os resultados dos corpos de prova de cada BT.</div>')
        + rastCtMapaHtml(d, id)
      + '</div>'
      + '</div>'
      + '<div class="modal-foot">'
        + '<div style="display:flex;gap:10px;">'
        + '<button class="btn danger" id="btn-delete" '+(id?"":"disabled")+'>Excluir</button>'
        + '<button class="btn" id="btn-export">Exportar Excel</button>'
        + '</div>'
        + '<div style="display:flex;gap:10px;">'
        + '<button class="btn" id="btn-save">Salvar</button>'
        + '<button class="btn primary" id="btn-toggle-close">'+(d.fechado?"Reabrir controle":"Fechar controle")+'</button>'
        + '</div></div>';
  }

  /* ---- v1.36: abas da ficha de concretagem ----
     Concretagem (o formulário de sempre) · FVS do local (todas as fichas FVS
     dos pavimentos desta concretagem, de qualquer tipo, + pendências de
     desforma) · Controle tecnológico (resultados de cada BT e, para a nota que
     não atingiu o fck, a planta com só aquela BT). Trocar de aba só mostra/
     esconde: o que foi digitado continua lá. */
  function rastAbaAtual(){ return (draft && draft.abaRast) || "concretagem"; }
  // mesmo pavimento (pelo nível do prédio); trecho diferente só não bate se os dois tiverem trecho
  function pavimentosCompativeis(a, b){
    var sa = separarPavimento(a), sb = separarPavimento(b);
    var ra = pavimentoRank(sa.base || sa.antigo), rb = pavimentoRank(sb.base || sb.antigo);
    if(ra===9999 || rb===9999) return normNc(a)!=="" && normNc(a)===normNc(b);
    if(ra!==rb) return false;
    return !sa.trecho || !sb.trecho || sa.trecho===sb.trecho;
  }
  // FVS do local desta concretagem: a vinculada + as de qualquer tipo com pavimento em comum
  function fvsDoLocal(d, rastId){
    var pvs = pavimentosDaRast(d), out = [];
    fvsMap.forEach(function(f, fid){
      var ligada = (rastId && f.rastreabilidadeId===rastId) || fid===d.fvsId;
      var mesmoLocal = pvs.length && fvsPavimentosList(f).some(function(p){ return pvs.some(function(q){ return pavimentosCompativeis(p, q); }); });
      if(ligada || mesmoLocal) out.push({ id:fid, f:f, ligada:!!ligada });
    });
    out.sort(function(a, b){
      if(a.ligada!==b.ligada) return a.ligada ? -1 : 1;
      var ta = (a.f.tipo||"fvs04")==="fvs04" ? 0 : 1, tb = (b.f.tipo||"fvs04")==="fvs04" ? 0 : 1;
      if(ta!==tb) return ta-tb;
      return String(b.f.dataConcretagem||b.f.dataAbertura||"").localeCompare(String(a.f.dataConcretagem||a.f.dataAbertura||""));
    });
    return out;
  }
  function rastNotasCt(d){
    var out = [];
    (d.linhas||[]).forEach(function(l){
      if(!String(l.notaFiscal||"").trim()) return;
      var c = ctPorNota(l.notaFiscal);
      out.push({ linha:l, ct:c, abaixo: !!(c && ctAbaixoMapa(c)) });
    });
    return out;
  }
  function rastAbasHtml(d, id){
    var nFvs = fvsDoLocal(d, id).length, notas = rastNotasCt(d), nAbaixo = notas.filter(function(x){ return x.abaixo; }).length;
    var aba = rastAbaAtual();
    var b = function(k, rot, n, ruim){ return '<button type="button" role="tab" class="rast-aba" data-rast-aba="'+k+'" aria-selected="'+(aba===k)+'">'+rot+(n ? ' <span class="rast-aba-n'+(ruim?" ruim":"")+'">'+n+'</span>' : '')+'</button>'; };
    return '<div class="rast-abas" role="tablist">'
      + b("concretagem", "Concretagem", 0)
      + b("fvs", "FVS do local", nFvs)
      + b("ct", "Controle tecnológico", nAbaixo || notas.length, nAbaixo>0)
    + '</div>';
  }
  function rastFvsDoLocalHtml(d, id){
    var lista = fvsDoLocal(d, id), pvs = pavimentosDaRast(d);
    var itens = lista.map(function(x){
      var f = x.f, t = getFvsTipo(f.tipo), abertas = fichaNaoConformidades(f).filter(function(n){ return !n.concluida; }).length;
      return '<div class="rast-fvs-item'+(x.ligada?" ligada":"")+'"><div class="info">'
        + '<div class="t">'+escapeHtml((f.codigo||"FVS")+" nº "+(f.numero||"s/ nº"))+' · '+escapeHtml((t && t.titulo) || f.descricao || "Forma, desforma, armação e concretagem")+(x.ligada ? ' <span class="ncx-tag">desta concretagem</span>' : '')+'</div>'
        + '<div class="s">'+escapeHtml(fvsPavimentosList(f).join(", ")||"sem pavimento")+' · '+escapeHtml(fmtDateBR(f.dataConcretagem||f.dataAbertura))+' · '+statusBadgeFvs(f)
          + (abertas ? ' <span class="ct-selo abaixo">'+abertas+' NC em aberto</span>' : '')+'</div>'
        + '</div><button type="button" class="btn small" data-rast-abrir-fvs="'+escapeHtml(x.id)+'">Abrir</button></div>';
    }).join("");
    return '<fieldset><legend>Todas as FVS '+(pvs.length ? 'de '+escapeHtml(pvs.join(" e ")) : 'deste local')+'</legend>'
      + (pvs.length ? '' : '<div class="hint">Escolha o pavimento em “Bloco / Pavimento” (aba Concretagem) para ver as FVS daquele local.</div>')
      + (itens ? '<div class="rast-fvs-lista">'+itens+'</div>' : (pvs.length ? '<div class="hint">Nenhuma FVS desse pavimento ainda.</div>' : ''))
      + (pvs.length ? '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
          + (id ? '<button type="button" class="btn primary" data-desforma-rast="'+escapeHtml(id)+'">Pendências da desforma (fotos)</button>' : '')
          + '<button type="button" class="btn" id="rast-nova-fvs-local">+ Nova FVS deste local</button></div>' : '')
    + '</fieldset>';
  }
  function rastCtMapaHtml(d, id){
    var abaixo = rastNotasCt(d).filter(function(x){ return x.abaixo; });
    if(!abaixo.length) return "";
    return '<fieldset><legend>Onde ficou abaixo do fck</legend>'
      + abaixo.map(function(x, k){
          return '<div class="rast-ct-mapa"><div class="ct-mapa-planta-tit"><b>BT '+escapeHtml(x.linha.seq)+' · NF '+escapeHtml(x.linha.notaFiscal)+'</b> — '+escapeHtml(ctResultadoCurtoMain(x.ct))+'</div>'
            + ctPlantaDaNotaHtml(x.ct, "r"+k).html+'</div>';
        }).join("")
    + '</fieldset>';
  }
  function ctResultadoCurtoMain(c){
    var fck = ctNumero(c.fck), partes = [];
    [["28", ctMelhor28(c)], ["63", ctMelhor63(c)]].forEach(function(p){
      if(p[1]!=null) partes.push(p[0]+" dias: "+String(p[1]).replace(".", ",")+" MPa"+(fck!=null && p[1]<fck ? " (abaixo do fck "+String(fck).replace(".", ",")+")" : ""));
    });
    return partes.join(" · ");
  }
  function rastDesenharCtMapa(m){
    var painel = m.querySelector('[data-painel="ct"]');
    if(!painel || painel.hidden || !draft) return;
    rastNotasCt(draft.data).filter(function(x){ return x.abaixo; }).forEach(function(x, k){
      ctDesenharPlantasDaNota(painel, x.ct, "r"+k, ctPlantaDaNotaHtml(x.ct, "r"+k).onde);
    });
  }
  function wireRastAbas(m){
    m.querySelectorAll("[data-rast-aba]").forEach(function(b){
      b.addEventListener("click", function(){
        var k = b.getAttribute("data-rast-aba");
        draft.abaRast = k;
        m.querySelectorAll("[data-rast-aba]").forEach(function(x){ x.setAttribute("aria-selected", String(x===b)); });
        m.querySelectorAll(".rast-painel").forEach(function(p){ p.hidden = p.getAttribute("data-painel")!==k; });
        if(k==="ct") rastDesenharCtMapa(m);
        var corpo = m.querySelector(".modal-body"); if(corpo) corpo.scrollTop = 0;
      });
    });
    m.querySelectorAll("[data-rast-abrir-fvs]").forEach(function(b){
      b.addEventListener("click", function(){ var fid = b.getAttribute("data-rast-abrir-fvs"); if(!tentarFecharModal()) return; openModal("fvs", fid); });
    });
    m.querySelectorAll(".rast-painel [data-open-rast]").forEach(function(b){
      b.addEventListener("click", function(){ var rid = b.getAttribute("data-open-rast"); if(draft && rid===draft.id) return; if(!tentarFecharModal()) return; openModal("rast", rid); });
    });
    var nova = m.querySelector("#rast-nova-fvs-local");
    if(nova) nova.addEventListener("click", function(){
      var pv = pavimentosDaRast(draft.data)[0] || "";
      if(!tentarFecharModal()) return;
      openTipoChooser(function(tipo){ openModal("fvs", null, tipo, { pavimento:pv }); });
    });
    m.querySelectorAll("[data-desforma-rast]").forEach(function(b){
      b.addEventListener("click", function(){ abrirDesforma({ rastId:b.getAttribute("data-desforma-rast") }); });
    });
    rastDesenharCtMapa(m);
  }

  // Monta o rótulo + linha da legenda de uma área demarcada, reaproveitado
  // tanto no HTML inicial do modal quanto na atualização ao vivo (sem
  // recriar o modal inteiro) depois de fechar/remover uma área.
  function mapaLegendaLinhaHtml(a, ai, linhasFicha, cor){
    var linha = (linhasFicha||[]).find(function(l){ return String(l.seq)===String(a.linhaSeq); });
    return '<div class="mapa-legenda-item"><span class="mapa-cor" style="background:'+(cor||a.cor)+';"></span>'
      + '<span class="mapa-legenda-texto"><span class="mapa-legenda-bt">BT '+escapeHtml(a.linhaSeq)+'</span>'
        + (linha && linha.notaFiscal ? '<span class="mapa-legenda-nf">NF '+escapeHtml(linha.notaFiscal)+'</span>' : '')
      + '</span>'
      + '<button type="button" class="mapa-rm-area" data-rm-area="'+ai+'" title="Remover área">✕</button></div>';
  }
  function mapaLegendaHtml(d){
    var areas = (d.mapeamento && d.mapeamento.areas) || [];
    if(areas.length===0) return '<div class="hint">Nenhuma área demarcada ainda. Toque em "+ Nova área" e marque os cantos do trecho concretado.</div>';
    var cores = coresDoMapa(d.mapeamento);
    return '<div class="mapa-legenda">' + areas.map(function(a, ai){ return mapaLegendaLinhaHtml(a, ai, d.linhas, corDaArea(cores, a)); }).join("") + '</div>';
  }
  // Bloco de "mapeamento de concretagem": anexa a planta de forma (PDF) da
  // rastreabilidade e, uma vez anexada, mostra a ferramenta de desenho
  // (canvas com a planta renderizada por pdf.js + um SVG por cima pra
  // marcar as áreas) — ver wireMapeamentoEvents() para toda a interação.
  // Sem PDF ainda: só o botão de anexar. Com PDF: barra de zoom, área de
  // desenho e a legenda das áreas já demarcadas.
  // abas das plantas da ficha (v1.24): "Planta 1 · nome · 3 áreas" + "Adicionar outra planta"
  function mapaAbasHtml(d){
    var lista = todosMapeamentos(d).slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
    var ativo = d.mapeamento || {};
    if(lista.length<2 && !ativo.plantaUrl) return "";
    return '<div class="mapa-abas" role="tablist">' + lista.map(function(mp, i){
      var eh = mp===ativo, n = (mp.areas||[]).length;
      return '<button type="button" role="tab" class="mapa-aba" aria-selected="'+eh+'" data-mapa-aba="'+(mp.ordem||0)+'">'
        + '<b>Planta '+(i+1)+'</b><small>'+escapeHtml(mp.plantaNome ? mp.plantaNome.slice(0,28) : "escolher planta")+(n ? ' · '+n+' área(s)' : '')+'</small></button>';
    }).join("")
    + (ativo.plantaUrl ? '<button type="button" class="mapa-aba nova" id="mapa-add-planta" title="Demarcar em mais uma planta nesta mesma ficha">+ Outra planta</button>' : '')
    + '</div>';
  }
  function mapeamentoFieldHtml(d){
    return mapaAbasHtml(d) + mapeamentoUmaPlantaHtml(d);
  }
  function mapeamentoUmaPlantaHtml(d){
    var mp = d.mapeamento || blankMapeamento();
    if(!mp.plantaUrl){
      var lista = mapaPlantasOrdenadas(d.pavimentos);
      var pickerHtml = lista.length
        ? '<div class="mapa-toolbar">'
            + '<select id="mapa-planta-select" style="flex:1;min-width:180px;">'
              + '<option value="">Selecione uma planta da biblioteca…</option>'
              + lista.map(function(p){
                  return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.nome)+(p.pavimento?" — "+escapeHtml(p.pavimento):"")+'</option>';
                }).join("")
            + '</select>'
            + '<button type="button" class="btn primary small" id="mapa-planta-usar">Usar esta planta</button>'
          + '</div>'
        : '<div class="hint">Nenhuma planta cadastrada ainda na biblioteca — cadastre em "Plantas" no menu de navegação (assim ela fica disponível pra escolher em qualquer rastreabilidade), ou anexe um PDF só pra esta ficha abaixo.</div>';
      return '<div class="hint">Escolha a planta de forma deste pavimento pra poder demarcar na tela onde o concreto foi lançado nesta rastreabilidade.</div>'
        + pickerHtml
        + '<div class="nc-anexo-add-bar" style="margin-top:8px;">'
          + '<label class="btn ghost nc-anexo-add-label">+ Anexar um PDF só pra esta ficha'
            + '<input type="file" accept="application/pdf" hidden id="input-planta">'
          + '</label>'
          + '<span class="nc-anexo-status" id="status-planta"></span>'
        + '</div>';
    }
    return ''
      + '<div class="mapa-toolbar">'
        + '<span class="hint" style="margin:0;flex:1;min-width:120px;">'+escapeHtml(mp.plantaNome)+'</span>'
        + '<a class="btn ghost small" href="'+escapeHtml(mp.plantaUrl)+'" target="_blank" rel="noopener">Abrir planta</a>'
        + '<button type="button" class="btn small primary" id="mapa-exportar-pdf" title="Planta original em vetor: nítida em qualquer zoom e na impressão">Exportar PDF (imprimir)</button>'
        + '<button type="button" class="btn ghost small" id="mapa-exportar-png">Exportar (PNG)</button>'
        + '<label class="btn ghost small nc-anexo-add-label">Trocar planta<input type="file" accept="application/pdf" hidden id="input-planta"></label>'
        + '<button type="button" class="btn ghost small danger" id="mapa-remover-planta">Remover planta</button>'
      + '</div>'
      // v1.2: a demarcação acontece no editor em tela cheia (editor-mapa.js);
      // aqui fica só a prévia — tocar nela também abre o editor.
      + '<button type="button" class="btn primary" id="mapa-abrir-editor" style="width:100%;justify-content:center;min-height:48px;margin-bottom:8px;">'
        + 'Demarcar áreas na planta (tela cheia)</button>'
      + '<div class="mapa-scroll" id="mapa-previa" style="cursor:zoom-in;" title="Toque para abrir o editor em tela cheia"><div class="mapa-stage" id="mapa-stage">'
        + '<canvas id="mapa-canvas" width="0" height="0"></canvas>'
        + '<svg id="mapa-svg" preserveAspectRatio="none"></svg>'
      + '</div></div>'
      + '<div class="hint" id="mapa-status" style="min-height:14px;"></div>'
      + '<div id="mapa-legenda-host">'+mapaLegendaHtml(d)+'</div>';
  }
  function field(labelText, name, value, type, placeholder){
    var id="f-"+name;
    var lbl = labelText ? '<label for="'+id+'">'+escapeHtml(labelText)+'</label>' : '';
    if(type==="textarea"){
      return '<div class="field">'+lbl+'<textarea id="'+id+'" data-field="'+name+'" placeholder="'+escapeHtml(placeholder||"")+'">'+escapeHtml(value)+'</textarea></div>';
    }
    return '<div class="field">'+lbl+'<input id="'+id+'" data-field="'+name+'" type="'+type+'" value="'+escapeHtml(value)+'" placeholder="'+escapeHtml(placeholder||"")+'"></div>';
  }
  // Fotos/documentos anexados a uma não conformidade específica (evidência
  // do problema, boletim, etc.) — ver comentário de CLOUDINARY_CLOUD_NAME
  // no topo do arquivo pra como habilitar o envio.
  function ncAnexosFieldHtml(nc, ni){
    var anexos = ncAnexos(nc);
    var listaHtml = anexos.length===0 ? "" : '<div class="nc-anexos-lista">' + anexos.map(function(a, ai){
      var item = ncAnexoEhImagem(a)
        ? '<a href="'+escapeHtml(a.url)+'" target="_blank" rel="noopener"><img src="'+escapeHtml(a.url)+'" alt="'+escapeHtml(a.nome)+'"></a>'
        : '<a class="nc-anexo-doc" href="'+escapeHtml(a.url)+'" target="_blank" rel="noopener" title="'+escapeHtml(a.nome)+'">📄<span>'+escapeHtml(a.nome)+'</span></a>';
      var tituloRemover = "Remover anexo (desvincula da ficha — o arquivo já enviado continua guardado no Cloudinary)";
      return '<div class="nc-anexo-item">'+item+'<button type="button" class="nc-anexo-rm" data-rm-anexo="'+ni+':'+ai+'" title="'+escapeHtml(tituloRemover)+'">✕</button></div>';
    }).join("") + '</div>';
    return '<div class="nc-anexos">'
      + listaHtml
      + '<div class="nc-anexo-add-bar">'
        + '<label class="btn ghost nc-anexo-add-label">+ Anexar foto/documento'
          + '<input type="file" accept="image/*,.pdf" multiple data-nc-anexo-input="'+ni+'" hidden>'
        + '</label>'
        + '<span class="nc-anexo-status'+(ncAnexoErro[ni]?" err":"")+'" data-nc-anexo-status="'+ni+'">'+escapeHtml(ncAnexoErro[ni]||"")+'</span>'
      + '</div>'
    + '</div>';
  }
  // Bloco de "não conformidades" da ficha FVS: uma lista de itens (em vez do
  // antigo bloco único), cada um com descrição, correção proposta, se foi
  // concluída e a data de conclusão — permite registrar mais de uma não
  // conformidade na mesma ficha e depois quantificá-las na tela "Não
  // conformidades" (ver buildRelatorioNc()).
  function ncListFieldHtml(d){
    var ncs = d.naoConformidades || [];
    var itensHtml = ncs.length===0
      ? '<div class="hint">Nenhuma não conformidade registrada nesta ficha ainda.</div>'
      : '<div class="nc-lista">' + ncs.map(function(nc, ni){
          var diasTxt = "";
          if(!nc.concluida){
            var dias = diffDias(nc.dataRegistro, todayISO());
            if(dias!=null) diasTxt = ' · '+dias+' dia(s) em aberto';
          }
          return '<div class="nc-item">'
            + '<div class="nc-item-head">'
              + '<span class="nc-item-titulo">Não conformidade '+(ni+1)+'</span>'
              + (nc.concluida
                  ? '<span class="pill concluido"><span class="dot"></span>Concluída</span>'
                  : '<span class="pill aberto has-nc"><span class="dot"></span>Em aberto'+diasTxt+'</span>')
              + '<button type="button" class="btn ghost danger" data-rm-nc="'+ni+'" title="Remover">✕ Remover</button>'
            + '</div>'
            + '<div class="grid2">'
              + '<div class="field"><label>Descrição do produto/serviço não conforme</label><textarea data-nc-field="descricao" data-nc-idx="'+ni+'">'+escapeHtml(nc.descricao)+'</textarea></div>'
              + '<div class="field"><label>Correção proposta</label><textarea data-nc-field="correcao" data-nc-idx="'+ni+'">'+escapeHtml(nc.correcao)+'</textarea></div>'
            + '</div>'
            + '<div class="grid2">'
              + '<div class="field"><label>Prazo para resolver</label><input type="date" data-nc-field="prazo" data-nc-idx="'+ni+'" value="'+escapeHtml(nc.prazo||"")+'"></div>'
              + '<div class="field"><label>Responsável / empreiteira</label><input type="text" data-nc-field="responsavel" data-nc-idx="'+ni+'" value="'+escapeHtml(nc.responsavel||"")+'"></div>'
            + '</div>'
            + '<div class="grid3">'
              + '<div class="field"><label>Data de registro</label><input type="date" data-nc-field="dataRegistro" data-nc-idx="'+ni+'" value="'+escapeHtml(nc.dataRegistro||"")+'"></div>'
              + '<div class="field"><label>Data de conclusão</label><input type="date" data-nc-field="dataConclusao" data-nc-idx="'+ni+'" value="'+escapeHtml(nc.dataConclusao||"")+'" '+(nc.concluida?"":"disabled")+'></div>'
              + '<div class="field"><label>Status</label><div class="toggle-row" style="margin-top:6px;margin-bottom:0;"><label class="switch"><input type="checkbox" data-nc-concluida="'+ni+'" '+(nc.concluida?"checked":"")+'><span class="track"></span><span class="thumb"></span></label><span>Concluída</span></div></div>'
            + '</div>'
            + ncAnexosFieldHtml(nc, ni)
          + '</div>';
        }).join("") + '</div>';
    return itensHtml + '<div style="margin-top:10px;"><button type="button" class="btn" id="add-nc">+ Adicionar não conformidade</button></div>';
  }
  function inp(name, idx, value, type, style){
    return '<input type="'+type+'" data-line-field="'+name+'" data-line-idx="'+idx+'" value="'+escapeHtml(value)+'" '+(style?'style="'+style+'"':'')+'>';
  }
  function td(html){ return '<td>'+html+'</td>'; }

  // Atualiza o "tempo gasto"/alerta de estouro de cada betonada em tempo real,
  // SEM recriar os campos de horário — só mexe no <span> do "Tempo gasto" de
  // cada linha e no banner de estouro no topo do modal. Importante: um
  // <input type="time"> já fica "completo" (e dispara "change") assim que o
  // 1º dígito do minuto forma um valor válido (ex.: "2" vira "02"), ou seja,
  // bem antes do usuário terminar de digitar o 2º dígito. Se essa atualização
  // chamasse renderModal() (que recria todo o HTML do modal), o campo de
  // horário seria destruído nesse meio tempo e o 2º dígito se perderia — foi
  // exatamente esse o bug relatado ("só deixa digitar o 1º número dos
  // minutos"). Por isso essa função nunca toca nos <input>, só no texto ao
  // lado.
  function refreshTemposGasto(){
    if(!draft || draft.type!=="rast") return;
    var m = document.getElementById("modal");
    (draft.data.linhas||[]).forEach(function(l, idx){
      var span = m.querySelector('[data-tempo-idx="'+idx+'"]');
      if(!span) return;
      var gasto = diffMin(l.saidaUsina, l.lancFinal);
      var over = gasto!=null && gasto>TEMPO_MAX_MIN;
      span.className = over ? "overrun" : "";
      span.textContent = fmtMin(gasto);
    });
    var banner = m.querySelector("#rast-overrun-banner");
    if(banner) banner.style.display = rastOverrun(draft.data) ? "" : "none";
  }

  /* ---------------- modal events ---------------- */
  function wireModalEvents(){
    var m=document.getElementById("modal");
    m.querySelector("#modal-close").addEventListener("click", tentarFecharModal);

    m.querySelectorAll("[data-field]").forEach(function(el){
      el.addEventListener("input", function(){ draft.data[el.getAttribute("data-field")] = el.value; });
    });

    // Chips de "Pavimentos" — comum a FVS e Rastreabilidade (uma ficha pode
    // cobrir mais de um pavimento; ver pavimentosFieldHtml()).
    (function(){
      var addPav=m.querySelector("#add-pavimento");
      if(addPav) addPav.addEventListener("click", function(){
        var nome=lerPavSelects(m.querySelector("#nova-pavimento-caixa"), "");
        if(!nome){ alert("Escolha o pavimento na lista."); return; }
        if(!draft.data.pavimentos) draft.data.pavimentos=[];
        if(draft.data.pavimentos.indexOf(nome)!==-1){ alert("Esse pavimento já foi adicionado."); return; }
        draft.data.pavimentos.push(nome);
        renderModal();
      });
      // "Bloco / Pavimento" da rastreabilidade: listas em vez de texto livre
      var caixaBloco = m.querySelector("#bloco-pav-caixa");
      var atualizarBloco = function(){
        var vals = lerBlocoPavMulti(caixaBloco);
        draft.data.pavimentos = vals;
        draft.data.blocoPav = vals.join(" / ");
      };
      if(caixaBloco){
        caixaBloco.addEventListener("change", atualizarBloco);
        caixaBloco.addEventListener("click", function(e){
          var rm = e.target.closest("[data-bp-rm]"); if(!rm) return;
          rm.closest(".bloco-pav-linha").remove(); atualizarBloco();
        });
        var addBp = m.querySelector("#add-bloco-pav");
        if(addBp) addBp.addEventListener("click", function(){
          var n = caixaBloco.querySelectorAll(".bloco-pav-linha").length, maior = 0;
          caixaBloco.querySelectorAll(".bloco-pav-linha").forEach(function(l){ maior = Math.max(maior, +l.getAttribute("data-bp-i")); });
          caixaBloco.insertAdjacentHTML("beforeend", blocoPavLinhaHtml("", Math.max(n, maior+1)));
          var novo = caixaBloco.lastElementChild.querySelector("[data-pav-base]"); if(novo) novo.focus();
        });
      }
      m.querySelectorAll("[data-rm-pavimento]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var idx=+btn.getAttribute("data-rm-pavimento");
          draft.data.pavimentos.splice(idx,1);
          renderModal();
        });
      });
    })();

    if(draft.type==="fvs"){
      m.querySelectorAll("[data-elemento]").forEach(function(el){
        if(el.tagName==="INPUT"){
          el.addEventListener("change", function(){
            var key=el.getAttribute("data-elemento");
            draft.data.elementos[key] = el.checked;
            renderModal();
          });
        }
      });
      m.querySelectorAll("[data-check]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var key=btn.getAttribute("data-check"), elemento=btn.getAttribute("data-elemento"), v=btn.getAttribute("data-v");
          if(!draft.data.checklist[key]) draft.data.checklist[key] = {};
          draft.data.checklist[key][elemento] = (draft.data.checklist[key][elemento]===v) ? "" : v;
          renderModal();
        });
      });
      var addUnidade=m.querySelector("#add-unidade");
      if(addUnidade) addUnidade.addEventListener("click", function(){
        var inputEl=m.querySelector("#nova-unidade");
        var nome=(inputEl.value||"").trim();
        if(!nome) return;
        if(!draft.data.unidades) draft.data.unidades=[];
        if(draft.data.unidades.indexOf(nome)!==-1){ alert("Já existe uma unidade com esse nome."); return; }
        draft.data.unidades.push(nome);
        renderModal();
      });
      var novaUnidadeInput=m.querySelector("#nova-unidade");
      if(novaUnidadeInput) novaUnidadeInput.addEventListener("keydown", function(e){
        if(e.key==="Enter"){ e.preventDefault(); m.querySelector("#add-unidade").click(); }
      });
      m.querySelectorAll("[data-rm-unidade]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var idx=+btn.getAttribute("data-rm-unidade");
          var nome=(draft.data.unidades||[])[idx];
          draft.data.unidades.splice(idx,1);
          if(nome){
            Object.keys(draft.data.checklist||{}).forEach(function(k){
              if(draft.data.checklist[k] && Object.prototype.hasOwnProperty.call(draft.data.checklist[k], nome)){
                delete draft.data.checklist[k][nome];
              }
            });
          }
          renderModal();
        });
      });
      // Lista de "não conformidades" desta ficha — ver ncListFieldHtml(). Os
      // campos de texto/data usam "input" sem re-render (pra não perder o
      // foco/cursor enquanto a pessoa digita, igual às linhas de
      // rastreabilidade); adicionar, remover ou marcar "Concluída" muda a
      // quantidade/aparência de itens, então esses sim re-renderizam.
      var addNc=m.querySelector("#add-nc");
      if(addNc) addNc.addEventListener("click", function(){
        if(!Array.isArray(draft.data.naoConformidades)) draft.data.naoConformidades=[];
        draft.data.naoConformidades.push(blankNaoConformidade());
        renderModal();
      });
      m.querySelectorAll("[data-rm-nc]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var idx=+btn.getAttribute("data-rm-nc");
          draft.data.naoConformidades.splice(idx,1);
          renderModal();
        });
      });
      m.querySelectorAll("[data-nc-field]").forEach(function(el){
        el.addEventListener("input", function(){
          var idx=+el.getAttribute("data-nc-idx"), f=el.getAttribute("data-nc-field");
          draft.data.naoConformidades[idx][f]=el.value;
        });
      });
      m.querySelectorAll("[data-nc-concluida]").forEach(function(chk){
        chk.addEventListener("change", function(){
          var idx=+chk.getAttribute("data-nc-concluida");
          var nc = draft.data.naoConformidades[idx];
          nc.concluida = chk.checked;
          if(nc.concluida && !nc.dataConclusao) nc.dataConclusao = todayISO();
          renderModal();
        });
      });
      // Anexos (fotos/documentos) de cada não conformidade: enviar direto
      // pro Cloudinary a partir do navegador (sem servidor), guardando só a
      // URL retornada na própria não conformidade. Remover um anexo tenta
      // excluir o arquivo de vez do Cloudinary via delete_by_token, mas só
      // funciona nos 10 minutos após o envio (limite do próprio Cloudinary
      // pra exclusão sem senha) — passado esse prazo, ou se a exclusão
      // falhar por qualquer motivo, o anexo é desvinculado da ficha do
      // mesmo jeito, só que o arquivo permanece guardado no Cloudinary.
      m.querySelectorAll("[data-nc-anexo-input]").forEach(function(input){
        input.addEventListener("change", async function(){
          var idx = +input.getAttribute("data-nc-anexo-input");
          var files = Array.prototype.slice.call(input.files||[]);
          if(!files.length) return;
          var statusEl = m.querySelector('[data-nc-anexo-status="'+idx+'"]');
          delete ncAnexoErro[idx];
          if(!cloudinaryConfigurado()){
            ncAnexoErro[idx] = "Envio de anexos ainda não configurado neste sistema (falta ligar a conta do Cloudinary — ver comentário no topo do código).";
            if(statusEl){ statusEl.textContent = ncAnexoErro[idx]; statusEl.className = "nc-anexo-status err"; }
            input.value = "";
            return;
          }
          var nc = draft.data.naoConformidades[idx];
          for(var i=0;i<files.length;i++){
            var file = files[i];
            if(statusEl){ statusEl.textContent = "Enviando "+(i+1)+"/"+files.length+": "+file.name+"…"; statusEl.className = "nc-anexo-status"; }
            try{
              var anexo = await ncUploadAnexo(file);
              if(!Array.isArray(nc.anexos)) nc.anexos = [];
              nc.anexos.push(anexo);
            } catch(ex){
              console.error(ex);
              ncAnexoErro[idx] = "Não foi possível enviar "+file.name+": "+(ex&&ex.message?ex.message:"erro desconhecido")+".";
            }
          }
          input.value = "";
          renderModal();
        });
      });
      m.querySelectorAll("[data-rm-anexo]").forEach(function(btn){
        btn.addEventListener("click", async function(){
          var partes = btn.getAttribute("data-rm-anexo").split(":");
          var idx=+partes[0], ai=+partes[1];
          var lista = ncAnexos(draft.data.naoConformidades[idx]);
          lista.splice(ai,1);
          renderModal();
        });
      });
      var linkPicker=m.querySelector("#link-picker");
      var doLink=m.querySelector("#do-link-rast");
      if(doLink) doLink.addEventListener("click", async function(){
        var rid=linkPicker.value; if(!rid) return;
        await persistLink("fvs", draft.id, rid);
      });
      var genRast=m.querySelector("#gen-rast");
      if(genRast) genRast.addEventListener("click", async function(){ await generateLinked("fvs"); });
      var unlinkRast=m.querySelector("#unlink-rast");
      if(unlinkRast) unlinkRast.addEventListener("click", async function(){ await removeLink("fvs", draft.id, draft.data.rastreabilidadeId); });
      var openLinked=m.querySelector("#open-linked-rast");
      if(openLinked) openLinked.addEventListener("click", function(){ var rid=draft.data.rastreabilidadeId; if(!tentarFecharModal()) return; openModal("rast", rid); });
    } else {
      m.querySelectorAll("[data-line-field]").forEach(function(el){
        el.addEventListener("input", function(){
          var idx=+el.getAttribute("data-line-idx"), f=el.getAttribute("data-line-field");
          draft.data.linhas[idx][f]=el.value;
          // Atualiza o "tempo gasto"/alerta de estouro em tempo real sem
          // recriar nenhum <input> — ver refreshTemposGasto(). Não usar mais
          // "change"/renderModal() aqui: um <input type="time"> já dispara
          // "change" assim que o valor fica válido, o que acontece logo após
          // o 1º dígito do minuto (ex.: "2" já forma "02"), muito antes do
          // usuário terminar de digitar o 2º dígito — recriar o campo nesse
          // instante é o que travava a digitação.
          if(f==="saidaUsina"||f==="lancFinal") refreshTemposGasto();
        });
        // v1.21: o mesmo elemento não pode se repetir NA MESMA BETONADA (mesma NF).
        // Em BTs diferentes pode. O aviso aparece enquanto digita; ao sair do
        // campo, a repetição é retirada.
        if(el.getAttribute("data-line-field")==="pecas"){
          var avisarRep = function(){
            var rep = pecasRepetidasNoTexto(el.value);
            el.classList.toggle("campo-dup", rep.length>0);
            el.title = rep.length ? "Repetido nesta betonada: "+rep.join(", ") : "";
          };
          el.addEventListener("input", avisarRep); avisarRep();
          el.addEventListener("change", function(){
            var idx=+el.getAttribute("data-line-idx");
            var r = pecasSemRepetidas(draft.data.linhas, idx);
            if(!r.repetidas.length) return;
            draft.data.linhas[idx].pecas = r.texto; el.value = r.texto; avisarRep();
            alert(r.repetidas.map(function(x){ return "“"+x.peca+"” está repetido na BT "+x.seq; }).join("\n")+"\n\nNa mesma betonada cada elemento entra uma vez só — a repetição foi retirada.");
          });
        }
      });
      m.querySelectorAll("[data-rm-line]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var idx=+btn.getAttribute("data-rm-line");
          draft.data.linhas.splice(idx,1);
          if(draft.data.linhas.length===0) draft.data.linhas.push(blankLinha(1));
          renderModal();
        });
      });
      var addLine=m.querySelector("#add-line");
      if(addLine) addLine.addEventListener("click", function(){
        draft.data.linhas.push(blankLinha(draft.data.linhas.length+1));
        renderModal();
      });
      wireMapeamentoEvents(m);
      var linkPickerR=m.querySelector("#link-picker-r");
      var doLinkF=m.querySelector("#do-link-fvs");
      if(doLinkF) doLinkF.addEventListener("click", async function(){
        var fid=linkPickerR.value; if(!fid) return;
        await persistLink("rast", draft.id, fid);
      });
      var genFvs=m.querySelector("#gen-fvs");
      if(genFvs) genFvs.addEventListener("click", async function(){ await generateLinked("rast"); });
      var unlinkFvs=m.querySelector("#unlink-fvs");
      if(unlinkFvs) unlinkFvs.addEventListener("click", async function(){ await removeLink("rast", draft.id, draft.data.fvsId); });
      var openLinkedF=m.querySelector("#open-linked-fvs");
      if(openLinkedF) openLinkedF.addEventListener("click", function(){ var fid=draft.data.fvsId; if(!tentarFecharModal()) return; openModal("fvs", fid); });
      wireRastAbas(m);
    }

    var bDesf = m.querySelector("#fvs-desforma");
    if(bDesf) bDesf.addEventListener("click", async function(){
      if(!draft.data.rastreabilidadeId){ alert("Esta FVS ainda não está ligada à rastreabilidade da concretagem. Ligue em “Rastreabilidade de concreto vinculada”, mais abaixo, e tente de novo."); return; }
      if(draftAlterado() && !draft.data.travada && !await saveDraft(true)) return;
      abrirDesforma({ fvsId:draft.id, rastId:draft.data.rastreabilidadeId });
    });
    m.querySelector("#btn-save").addEventListener("click", function(){ saveDraft(false); });
    m.querySelector("#btn-export").addEventListener("click", async function(){
      try{ await garantirLibs(); }catch(ex){ alert("Não foi possível carregar o gerador de Excel (verifique a internet)."); return; }
      if(draft.type==="fvs") exportFvsXlsx(draft.data); else exportRastXlsx(draft.data);
    });
    m.querySelector("#btn-toggle-close").addEventListener("click", async function(){
      if(salvando) return;
      var d = draft;
      var antesFechado = d.data.fechado, antesData = d.data.dataFechamento;
      d.data.fechado = !d.data.fechado;
      if(d.data.fechado && !d.data.dataFechamento) d.data.dataFechamento = todayISO();
      var ok = await saveDraft(true);
      // Não salvou: desfaz a troca aberta/fechada para a tela não mentir.
      if(!ok && draft===d){ d.data.fechado = antesFechado; d.data.dataFechamento = antesData; renderModal(); }
    });
    var delBtn=m.querySelector("#btn-delete");
    if(delBtn && draft.id) delBtn.addEventListener("click", async function(){
      if(!confirm("Excluir este registro? Ele sai do app, mas fica guardado no banco (lixeira).")) return;
      var d = draft;
      var col = d.type==="fvs" ? fvsCol : rastCol;
      try{
        // v1.28: nunca apaga de verdade — vai para a lixeira (excluido:true)
        await col.doc(d.id).set(dadosExclusao(col.id, currentUserEmail, nowISO()), { merge:true });
      }catch(ex){
        console.error(ex);
        alert("Não foi possível excluir: "+(ex && ex.message ? ex.message : "erro desconhecido")+".");
        return;
      }
      // Limpa o vínculo do outro lado, para a ficha/rastreabilidade parceira
      // não ficar apontando para um registro que não existe mais.
      try{
        if(d.type==="fvs" && d.data.rastreabilidadeId && rastMap.has(d.data.rastreabilidadeId)){
          await rastCol.doc(d.data.rastreabilidadeId).update({ fvsId:null, updatedAt: nowISO() });
        } else if(d.type==="rast" && d.data.fvsId && fvsMap.has(d.data.fvsId)){
          await fvsCol.doc(d.data.fvsId).update({ rastreabilidadeId:null, updatedAt: nowISO() });
        }
      }catch(ex){ console.error("exclusão: falha ao limpar vínculo", ex); }
      limparRascunho(d.chave);
      closeModal();
    });
  }

  /* ---------------- mapeamento de concretagem: planta (PDF) + desenho das áreas ----------------
     Ferramenta de "por onde o concreto foi lançado hoje": a planta de forma
     (PDF) é renderizada num <canvas> com pdf.js, e por cima dela um <svg>
     transparente captura os toques pra desenhar um polígono (tocando nos
     cantos da área concretada). Ao fechar o polígono, a pessoa escolhe a
     qual sequência (BT) das "Betonadas" aquela área pertence — a área fica
     salva com essa referência (draft.data.mapeamento.areas), não com a NF
     copiada, então se a NF da sequência mudar depois, a legenda já mostra
     a NF atualizada. Coordenadas dos pontos são normalizadas (0..1,
     fração da largura/altura da planta), então continuam corretas
     independente do zoom ou da resolução em que a planta foi desenhada. */
  function wireMapeamentoEvents(m){
    var mp = draft.data.mapeamento;
    if(!mp) return;

    // v1.24: trocar de planta (aba) e adicionar outra planta na mesma ficha
    var trocarPara = function(novo){
      var d = draft.data, limpo = !draftAlterado();
      d.mapeamentosExtras = (d.mapeamentosExtras || []).filter(function(x){ return x!==novo; });
      d.mapeamentosExtras.push(d.mapeamento);
      d.mapeamento = novo;
      if(limpo) draft.orig = JSON.stringify(d); // só trocar de aba não é alteração
      mapaEstado = null;
      renderModal();
    };
    m.querySelectorAll("[data-mapa-aba]").forEach(function(b){
      b.addEventListener("click", function(){
        var ordem = Number(b.getAttribute("data-mapa-aba"));
        var alvo = (draft.data.mapeamentosExtras||[]).find(function(x){ return (x.ordem||0)===ordem; });
        if(alvo) trocarPara(alvo);
      });
    });
    var btnAdd = m.querySelector("#mapa-add-planta");
    if(btnAdd) btnAdd.addEventListener("click", function(){
      var maior = todosMapeamentos(draft.data).reduce(function(x, y){ return Math.max(x, y.ordem||0); }, 0);
      trocarPara(Object.assign(blankMapeamento(), { ordem: maior+1 }));
    });

    var inputPlanta = m.querySelector("#input-planta");
    if(inputPlanta) inputPlanta.addEventListener("change", async function(){
      var file = inputPlanta.files[0];
      if(!file) return;
      var statusEl = m.querySelector("#status-planta");
      if(!cloudinaryConfigurado()){
        if(statusEl) statusEl.textContent = "Envio de plantas ainda não configurado neste sistema (falta ligar a conta do Cloudinary — ver comentário no topo do código).";
        inputPlanta.value = "";
        return;
      }
      if(mp.areas && mp.areas.length>0 && !confirm("Trocar a planta apaga as áreas já demarcadas nela. Continuar?")){
        inputPlanta.value = "";
        return;
      }
      if(statusEl){ statusEl.textContent = "Enviando "+file.name+"…"; statusEl.className="nc-anexo-status"; }
      try{
        var planta = await rastUploadPlanta(file);
        mp.plantaUrl = planta.url;
        mp.plantaNome = planta.nome;
        mp.tipo = "pdf";
        mp.pagina = 1;
        mp.areas = [];
        renderModal();
      }catch(ex){
        console.error(ex);
        if(statusEl) statusEl.textContent = "Não foi possível enviar "+file.name+": "+(ex&&ex.message?ex.message:"erro desconhecido")+".";
      }
    });

    var btnUsarPlanta = m.querySelector("#mapa-planta-usar");
    if(btnUsarPlanta) btnUsarPlanta.addEventListener("click", function(){
      var sel = m.querySelector("#mapa-planta-select");
      var id = sel ? sel.value : "";
      if(!id){ alert("Selecione uma planta da lista."); return; }
      var p = plantasMap.get(id);
      if(!p) return;
      mp.plantaUrl = p.url;
      mp.plantaNome = p.nome;
      mp.plantaId = id; // v1.37: para achar as peças lidas desta planta
      mp.tipo = p.tipo || "imagem";
      mp.pagina = 1;
      mp.areas = [];
      renderModal();
    });

    if(!mp.plantaUrl) return; // sem planta ainda, nada mais a fazer aqui

    carregarPlantaNoCanvas(m);

    var btnExportarPdf = m.querySelector("#mapa-exportar-pdf");
    if(btnExportarPdf) btnExportarPdf.addEventListener("click", function(){ exportarMapeamentoPdf(m, btnExportarPdf); });
    var btnExportarPng = m.querySelector("#mapa-exportar-png");
    if(btnExportarPng) btnExportarPng.addEventListener("click", function(){ exportarMapeamentoPng(m); });

    // Remover a planta desta rastreabilidade (e as áreas marcadas nela).
    var btnRemoverPlanta = m.querySelector("#mapa-remover-planta");
    if(btnRemoverPlanta) btnRemoverPlanta.addEventListener("click", function(){
      var n = (mp.areas||[]).length;
      if(!confirm("Remover a planta desta rastreabilidade?"+(n ? "\n\nAs "+n+" área(s) demarcadas nela também serão removidas." : "")+"\n\nA alteração só vale depois de Salvar.")) return;
      // v1.24: com mais de uma planta, remove só esta aba e abre a próxima
      var extras = draft.data.mapeamentosExtras || [];
      if(extras.length){
        extras.sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
        draft.data.mapeamento = extras.shift();
      } else draft.data.mapeamento = blankMapeamento();
      mapaEstado = null;
      renderModal();
    });

    // Editor em tela cheia: zoom de verdade, arrastar, e salva cada área na hora.
    function abrirEditor(){
      var d = draft;
      abrirEditorMapa({
        mapeamento: d.data.mapeamento,
        linhas: function(){ return d.data.linhas || []; },
        cor: mapaCorSequencia,
        aoMarcarArea: function(area){ return pecasDaAreaNaBt(d, area); },
        aoAbrir: function(){
          return pecasDaPlanta(d.data.mapeamento || {}).then(function(p){
            return p.length ? p.length+" peças reconhecidas nesta planta (P, V, L…): ao demarcar, as de dentro da área entram sozinhas na BT."
              : "Esta planta ainda não tem as peças marcadas — na tela Plantas, use “Marcar peças” nesta planta; até lá as peças são digitadas.";
          });
        },
        titulo: "Mapeamento — "+rastRotulo(d.data),
        salvar: async function(){ return draft===d ? await saveDraft(true) : false; },
        aoFechar: function(){ if(draft===d) renderModal(); }
      });
    }
    var btnEditor = m.querySelector("#mapa-abrir-editor");
    if(btnEditor) btnEditor.addEventListener("click", abrirEditor);
    var previa = m.querySelector("#mapa-previa");
    if(previa) previa.addEventListener("click", abrirEditor);

    var btnZoomOut = m.querySelector("#mapa-zoom-out");
    var btnZoomIn = m.querySelector("#mapa-zoom-in");
    if(btnZoomOut) btnZoomOut.addEventListener("click", function(){ aplicarZoomMapa(m, (mapaEstado?mapaEstado.zoomPct:100)-25); });
    if(btnZoomIn) btnZoomIn.addEventListener("click", function(){ aplicarZoomMapa(m, (mapaEstado?mapaEstado.zoomPct:100)+25); });

    var btnAddArea = m.querySelector("#mapa-add-area");
    if(btnAddArea) btnAddArea.addEventListener("click", function(){
      if(!mapaEstado) return;
      mapaEstado.desenhando = true;
      mapaEstado.pontosAtual = [];
      var svgEl = m.querySelector("#mapa-svg");
      if(svgEl) svgEl.classList.add("svg-ativo");
      m.querySelector("#mapa-draw-bar").hidden = false;
      btnAddArea.hidden = true;
      atualizarBotaoFechar(m);
      redesenharSvg(m);
    });

    // Toque num dedo só, em modo de desenho: marca um ponto do polígono.
    // Dois dedos ao mesmo tempo: em vez de marcar ponto, funciona como
    // "pinça" pra dar zoom (afastar/aproximar os dedos), já que o toque
    // nativo de pinça do navegador fica desligado aqui (touch-action:none
    // em .svg-ativo) pra não brigar com o toque de marcar pontos.
    var svgEl = m.querySelector("#mapa-svg");
    var mapaPointers = {};
    var mapaPinchDistIni = null, mapaPinchZoomIni = null;
    function mapaPinchIds(){ return Object.keys(mapaPointers); }
    function mapaPinchAtualizar(){
      var ids = mapaPinchIds();
      if(ids.length!==2 || mapaPinchDistIni==null) return;
      var p1 = mapaPointers[ids[0]], p2 = mapaPointers[ids[1]];
      var distAtual = Math.hypot(p2.x-p1.x, p2.y-p1.y);
      if(!distAtual || !mapaPinchDistIni) return;
      var novoPct = Math.round((mapaPinchZoomIni * (distAtual/mapaPinchDistIni)) / 5) * 5;
      aplicarZoomMapa(m, novoPct);
    }
    if(svgEl) svgEl.addEventListener("pointerdown", function(ev){
      if(!mapaEstado || !mapaEstado.desenhando) return;
      ev.preventDefault();
      mapaPointers[ev.pointerId] = { x:ev.clientX, y:ev.clientY };
      var ids = mapaPinchIds();
      if(ids.length===2){
        var p1 = mapaPointers[ids[0]], p2 = mapaPointers[ids[1]];
        mapaPinchDistIni = Math.hypot(p2.x-p1.x, p2.y-p1.y);
        mapaPinchZoomIni = mapaEstado.zoomPct;
        return; // começou uma pinça de 2 dedos — não conta como toque de ponto
      }
      if(ids.length>2) return; // mais de 2 dedos ao mesmo tempo: ignora
      var rect = svgEl.getBoundingClientRect();
      if(!rect.width || !rect.height) return;
      var xNorm = Math.min(1, Math.max(0, (ev.clientX-rect.left)/rect.width));
      var yNorm = Math.min(1, Math.max(0, (ev.clientY-rect.top)/rect.height));
      mapaEstado.pontosAtual.push([xNorm, yNorm]);
      atualizarBotaoFechar(m);
      redesenharSvg(m);
    });
    if(svgEl) svgEl.addEventListener("pointermove", function(ev){
      if(!mapaPointers[ev.pointerId]) return;
      mapaPointers[ev.pointerId] = { x:ev.clientX, y:ev.clientY };
      mapaPinchAtualizar();
    });
    function mapaPinchSoltar(ev){
      delete mapaPointers[ev.pointerId];
      if(mapaPinchIds().length<2){ mapaPinchDistIni=null; mapaPinchZoomIni=null; }
    }
    if(svgEl){
      svgEl.addEventListener("pointerup", mapaPinchSoltar);
      svgEl.addEventListener("pointercancel", mapaPinchSoltar);
      svgEl.addEventListener("pointerleave", mapaPinchSoltar);
    }

    var btnUndo = m.querySelector("#mapa-undo-ponto");
    if(btnUndo) btnUndo.addEventListener("click", function(){
      if(!mapaEstado) return;
      mapaEstado.pontosAtual.pop();
      atualizarBotaoFechar(m);
      redesenharSvg(m);
    });
    var btnCancelarArea = m.querySelector("#mapa-cancelar-area");
    if(btnCancelarArea) btnCancelarArea.addEventListener("click", function(){ sairDoModoDesenho(m); });
    var btnFecharArea = m.querySelector("#mapa-fechar-area");
    if(btnFecharArea) btnFecharArea.addEventListener("click", function(){
      if(!mapaEstado || mapaEstado.pontosAtual.length<3) return;
      abrirSeletorSequencia(m);
    });
    var btnSeqCancelar = m.querySelector("#mapa-seq-cancelar");
    if(btnSeqCancelar) btnSeqCancelar.addEventListener("click", function(){
      m.querySelector("#mapa-seq-picker").hidden = true;
      m.querySelector("#mapa-draw-bar").hidden = false;
    });
    var btnSeqConfirmar = m.querySelector("#mapa-seq-confirmar");
    if(btnSeqConfirmar) btnSeqConfirmar.addEventListener("click", function(){
      if(!mapaEstado || mapaEstado.pontosAtual.length<3) return;
      var sel = m.querySelector("#mapa-seq-select");
      var seq = sel ? sel.value : "";
      if(!seq){ alert("Selecione o BT dessa área."); return; }
      if(!mp.areas) mp.areas=[];
      mp.areas.push({ pontos: mapaEstado.pontosAtual.slice(), linhaSeq: seq, cor: mapaCorSequencia(seq) });
      m.querySelector("#mapa-seq-picker").hidden = true;
      sairDoModoDesenho(m);
      atualizarLegendaMapa(m);
    });

    wireLegendaAreas(m);
  }

  // Carrega a planta da rastreabilidade aberta e desenha no <canvas>,
  // ajustando o <svg> por cima pra ocupar exatamente a mesma área (mesma
  // proporção largura/altura) — assim os pontos normalizados (0..1) caem
  // sempre no lugar certo, em qualquer zoom. Reinicia mapaEstado.
  // Duas origens possíveis (ver mp.tipo): "imagem" é uma planta escolhida da
  // biblioteca (já vem comprimida como JPEG, ver comprimirPlantaEmImagem —
  // só precisa desenhar a imagem, sem pdf.js); "pdf" é um PDF anexado manual
  // só pra esta ficha (segue usando pdf.js pra renderizar a página, como
  // sempre foi).
  async function carregarPlantaNoCanvas(m){
    try{ await garantirPdf(); }catch(ex){ console.error(ex); }
    var mp = draft.data.mapeamento;
    var canvas = m.querySelector("#mapa-canvas");
    var svgEl = m.querySelector("#mapa-svg");
    var stage = m.querySelector("#mapa-stage");
    var statusEl = m.querySelector("#mapa-status");
    if(!canvas || !svgEl || !stage || !mp || !mp.plantaUrl) return;
    if(mp.tipo==="imagem"){
      try{
        if(statusEl) statusEl.textContent = "Carregando planta…";
        var img = await new Promise(function(resolve, reject){
          var im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = function(){ resolve(im); };
          im.onerror = function(){ reject(new Error("falha ao carregar a imagem da planta")); };
          im.src = mp.plantaUrl;
        });
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctxImg = canvas.getContext("2d");
        ctxImg.drawImage(img, 0, 0);
        svgEl.setAttribute("viewBox", "0 0 "+canvas.width+" "+canvas.height);
        stage.style.aspectRatio = canvas.width+" / "+canvas.height;
        mapaEstado = { zoomPct:100, desenhando:false, pontosAtual:[] };
        aplicarZoomMapa(m, 100);
        redesenharSvg(m);
        if(statusEl) statusEl.textContent = "";
      }catch(ex){
        console.error("mapeamento: falha ao carregar a planta (imagem)", ex);
        if(statusEl) statusEl.textContent = "Não foi possível carregar a planta pra desenhar aqui (o arquivo pode ser aberto normalmente pelo link \"Abrir planta\" acima).";
      }
      return;
    }
    if(!window.pdfjsLib){
      if(statusEl) statusEl.textContent = "Não foi possível carregar o desenhador de plantas (biblioteca pdf.js não carregou — verifique a internet). O link \"Abrir planta\" acima continua funcionando normalmente.";
      return;
    }
    try{
      if(statusEl) statusEl.textContent = "Carregando planta…";
      var pdf = await pdfjsLib.getDocument(mp.plantaUrl).promise;
      var pagina = Math.min(Math.max(mp.pagina||1, 1), pdf.numPages);
      var page = await pdf.getPage(pagina);
      var viewportBase = page.getViewport({ scale:1 });
      var alvoPx = 3000; // largura-alvo (px) do render, pra ficar nítido ao dar zoom (v1.17: 2000 → 3000)
      var escala = Math.min(3, alvoPx/viewportBase.width);
      var viewport = page.getViewport({ scale:escala });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext("2d");
      await page.render({ canvasContext:ctx, viewport:viewport }).promise;
      svgEl.setAttribute("viewBox", "0 0 "+viewport.width+" "+viewport.height);
      stage.style.aspectRatio = viewport.width+" / "+viewport.height;
      mapaEstado = { zoomPct:100, desenhando:false, pontosAtual:[] };
      aplicarZoomMapa(m, 100);
      redesenharSvg(m);
      if(statusEl) statusEl.textContent = "";
    }catch(ex){
      console.error("mapeamento: falha ao carregar a planta", ex);
      if(statusEl) statusEl.textContent = "Não foi possível carregar a planta pra desenhar aqui (o arquivo pode ser aberto normalmente pelo link \"Abrir planta\" acima).";
    }
  }

  function aplicarZoomMapa(m, pct){
    if(!mapaEstado) return;
    mapaEstado.zoomPct = Math.max(50, Math.min(400, pct));
    var stage = m.querySelector("#mapa-stage");
    if(stage) stage.style.width = mapaEstado.zoomPct+"%";
    var label = m.querySelector("#mapa-zoom-label");
    if(label) label.textContent = mapaEstado.zoomPct+"%";
  }

  function atualizarBotaoFechar(m){
    var btn = m.querySelector("#mapa-fechar-area");
    if(btn) btn.disabled = !mapaEstado || mapaEstado.pontosAtual.length<3;
  }

  function sairDoModoDesenho(m){
    if(mapaEstado){ mapaEstado.desenhando=false; mapaEstado.pontosAtual=[]; }
    var svgEl = m.querySelector("#mapa-svg");
    if(svgEl) svgEl.classList.remove("svg-ativo");
    var drawBar = m.querySelector("#mapa-draw-bar");
    if(drawBar) drawBar.hidden = true;
    var addBtn = m.querySelector("#mapa-add-area");
    if(addBtn) addBtn.hidden = false;
    redesenharSvg(m);
  }

  /* ---- v1.37: peças desenhadas à mão na planta de forma (modo "peças" do editor) ---- */
  function corPeca(n){ n = String(n||"").toUpperCase(); return /^P(?!AR)/.test(n) ? "#C0392B" : /^V/.test(n) ? "#2E5AAC" : /^L/.test(n) ? "#2E7D46" : "#B8860B"; }
  function abrirMarcarPecas(id){
    var p = plantasMap.get(id);
    if(!p) return;
    if(somenteLeitura){ alert("Sua conta é só de visualização."); return; }
    var mp = { plantaUrl:p.url, plantaNome:p.nome, tipo:p.tipo||"imagem", pagina:1,
      areas:(p.pecasAreas||[]).map(function(a){ return { linhaSeq:a.n, cor:corPeca(a.n), pontos:(a.pontos||[]).map(function(q){ return Array.isArray(q) ? q : [q.x, q.y]; }) }; }) };
    abrirEditorMapa({
      mapeamento: mp, modoPecas: true,
      linhas: function(){ return []; },
      cor: corPeca,
      titulo: "Peças — "+(p.nome||"planta")+(p.pavimento ? " · "+p.pavimento : ""),
      salvar: async function(){
        try{
          var lista = mp.areas.filter(function(a){ return a.pontos && a.pontos.length>=3; }).map(function(a){ return { n:String(a.linhaSeq), pontos:a.pontos.map(function(q){ return { x:q[0], y:q[1] }; }) }; });
          await esperarGravacao(plantasCol.doc(id).set({ pecasAreas:lista, pecasAreasEm:nowISO() }, { merge:true }));
          return true;
        }catch(ex){ console.error(ex); return false; }
      },
      aoFechar: function(){ var v = document.getElementById("view-plantas"); if(v && !v.hidden) renderViewPlantas(); }
    });
  }

  /* ---- v1.37: peças da planta → "Peças concretadas" da BT ao demarcar ---- */
  var cachePecasPdf = {};
  async function pecasDaPlanta(mp){
    var pl = mp.plantaId ? plantasMap.get(mp.plantaId) : null;
    if(!pl) plantasMap.forEach(function(p){ if(!pl && p.url===mp.plantaUrl) pl = p; });
    if(pl){
      // peças desenhadas à mão valem mais que os nomes lidos do PDF
      var desenhadas = (pl.pecasAreas||[]).map(function(a){ return { n:a.n, pontos:(a.pontos||[]).map(function(q){ return Array.isArray(q) ? q : [q.x, q.y]; }) }; });
      if(desenhadas.length) return desenhadas;
      if(Array.isArray(pl.pecas) && pl.pecas.length) return pl.pecas;
    }
    if(mp.tipo!=="pdf" || !mp.plantaUrl) return [];
    var chave = mp.plantaUrl+"#"+(mp.pagina||1);
    if(!cachePecasPdf[chave]){
      cachePecasPdf[chave] = (async function(){
        await garantirPdf();
        var pdf = await pdfjsLib.getDocument(mp.plantaUrl).promise;
        return lerPecasDaPagina(await pdf.getPage(Math.min(Math.max(mp.pagina||1, 1), pdf.numPages)));
      })().catch(function(ex){ console.warn(ex); delete cachePecasPdf[chave]; return []; });
    }
    return cachePecasPdf[chave];
  }
  async function pecasDaAreaNaBt(d, area){
    var mp = d.data.mapeamento || {};
    var pecas = await pecasDaPlanta(mp);
    if(!pecas.length) return "";  // o aviso de “planta sem nomes de peças” já apareceu ao abrir
    var nomes = pecasNaArea(area.pontos, pecas);
    if(!nomes.length) return "BT "+area.linhaSeq+": nenhum nome de peça dentro desta área.";
    var linha = (d.data.linhas||[]).find(function(l){ return String(l.seq)===String(area.linhaSeq); });
    if(!linha) return "";
    var atuais = String(linha.pecas||"").split(/\s*(?:[,;\/\n]|\se\s)\s*/i).map(function(x){ return x.trim(); }).filter(Boolean);
    var chave = function(x){ return String(x).toUpperCase().replace(/\s+/g, ""); };
    var novas = nomes.filter(function(n){ return !atuais.some(function(a){ return chave(a)===chave(n); }); });
    if(!novas.length) return "BT "+area.linhaSeq+": "+nomes.join(", ")+" — já estavam nas peças.";
    linha.pecas = atuais.concat(novas).join(", ");
    return "BT "+area.linhaSeq+": "+novas.join(", ")+" entraram nas peças concretadas.";
  }

  function abrirSeletorSequencia(m){
    var sel = m.querySelector("#mapa-seq-select");
    if(sel){
      sel.innerHTML = (draft.data.linhas||[]).map(function(l){
        var rotulo = "BT "+escapeHtml(l.seq) + (l.notaFiscal?" — NF "+escapeHtml(l.notaFiscal):"");
        return '<option value="'+escapeHtml(l.seq)+'">'+rotulo+'</option>';
      }).join("");
    }
    var drawBar = m.querySelector("#mapa-draw-bar");
    if(drawBar) drawBar.hidden = true;
    var picker = m.querySelector("#mapa-seq-picker");
    if(picker) picker.hidden = false;
  }

  // Redesenha o SVG do zero: as áreas já salvas (polígono preenchido na cor
  // da sequência + rótulo no centro) e, se estiver em modo de desenho, o
  // contorno em progresso (pontos + linhas ainda aberto).
  // "NF: 12345" da betonada ligada à área (vazio se a BT não tem NF)
  function nfDaArea(a){
    var l = (draft && draft.data && draft.data.linhas || []).find(function(x){ return String(x.seq)===String(a.linhaSeq); });
    var nf = l && String(l.notaFiscal||"").trim();
    return nf ? "NF: "+nf : "";
  }
  function redesenharSvg(m){
    var svgEl = m.querySelector("#mapa-svg");
    if(!svgEl) return;
    var vb = (svgEl.getAttribute("viewBox")||"0 0 1 1").split(" ");
    var vw = parseFloat(vb[2])||1, vh = parseFloat(vb[3])||1;
    var ns = "http://www.w3.org/2000/svg";
    while(svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    function pt(p){ return (p[0]*vw)+","+(p[1]*vh); }

    var areasSvg = (draft.data.mapeamento && draft.data.mapeamento.areas) || [];
    var coresSvg = coresDoMapa(draft.data.mapeamento);
    areasSvg.forEach(function(a){
      if(!a.pontos || a.pontos.length<3) return;
      var poly = document.createElementNS(ns, "polygon");
      poly.setAttribute("points", a.pontos.map(pt).join(" "));
      poly.setAttribute("fill", corDaArea(coresSvg, a));
      poly.setAttribute("fill-opacity", "0.32");
      poly.setAttribute("stroke", corDaArea(coresSvg, a));
      poly.setAttribute("stroke-width", Math.max(2, vw*0.003));
      svgEl.appendChild(poly);
    });
    // v1.15/v1.36: rótulos por cima de todas as áreas; o que não cabe vai para fora, com linha
    var textosSvg = function(a){ return { bt:"BT "+a.linhaSeq, nf:nfDaArea(a) }; };
    planejarRotulos(areasSvg, vw, vh, textosSvg).forEach(function(r, i){
      if(r) rotuloSvg(svgEl, r, textosSvg(areasSvg[i]), corDaArea(coresSvg, areasSvg[i]));
    });

    if(mapaEstado && mapaEstado.desenhando && mapaEstado.pontosAtual.length>0){
      var pontos = mapaEstado.pontosAtual;
      if(pontos.length>1){
        var linha = document.createElementNS(ns, "polyline");
        linha.setAttribute("points", pontos.map(pt).join(" "));
        linha.setAttribute("fill", "none");
        linha.setAttribute("stroke", "var(--accent-strong)");
        linha.setAttribute("stroke-width", Math.max(2, vw*0.003));
        linha.setAttribute("stroke-dasharray", (vw*0.006)+","+(vw*0.004));
        svgEl.appendChild(linha);
      }
      pontos.forEach(function(p){
        var c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", p[0]*vw); c.setAttribute("cy", p[1]*vh);
        c.setAttribute("r", Math.max(4, vw*0.006));
        c.setAttribute("fill", "#ffffff"); c.setAttribute("stroke", "#c0392b"); c.setAttribute("stroke-width", 2);
        svgEl.appendChild(c);
      });
    }
  }

  function atualizarLegendaMapa(m){
    var host = m.querySelector("#mapa-legenda-host");
    if(!host) return;
    host.innerHTML = mapaLegendaHtml(draft.data);
    wireLegendaAreas(m);
  }
  function wireLegendaAreas(m){
    m.querySelectorAll("[data-rm-area]").forEach(function(btn){
      btn.onclick = function(){
        var idx = +btn.getAttribute("data-rm-area");
        draft.data.mapeamento.areas.splice(idx,1);
        atualizarLegendaMapa(m);
        redesenharSvg(m);
      };
    });
  }

  // Exporta o mapeamento atual (a planta já renderizada no <canvas> + as
  // áreas marcadas + a legenda) como uma imagem PNG pra baixar — pra poder
  // mandar por WhatsApp/e-mail ou imprimir depois de terminar as marcações.
  // Redesenha a planta e cada área direto num <canvas> novo (mesma lógica de
  // redesenharSvg, só que em 2D canvas em vez de SVG) e acrescenta um
  // cabeçalho com o nº da rastreabilidade + a legenda embaixo.
  // v1.15: a planta é desenhada de novo em ALTA resolução só para exportar
  // (antes saía com a mesma imagem da tela, ~2000 px de largura). Limite de
  // tamanho do canvas: iPhone/iPad aceitam até ~16,7 MP; os demais, bem mais.
  async function plantaAltaResolucao(mp, canvasBase){
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
    var limite = ios ? 14e6 : 32e6;
    if(mp.tipo==="imagem" || !window.pdfjsLib) return canvasBase; // imagem já está no tamanho original
    try{
      var pdf = await pdfjsLib.getDocument(mp.plantaUrl).promise;
      var page = await pdf.getPage(Math.min(Math.max(mp.pagina||1, 1), pdf.numPages));
      var v1 = page.getViewport({ scale:1 });
      var escala = Math.min(12, Math.sqrt(limite / (v1.width*v1.height)));
      if(v1.width*escala <= canvasBase.width) return canvasBase;
      var vp = page.getViewport({ scale:escala });
      var c = document.createElement("canvas");
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext:ctx, viewport:vp, intent:"print" }).promise;
      return c;
    }catch(ex){
      console.warn("exportar mapeamento: alta resolução falhou, usando a da tela", ex);
      return canvasBase;
    }
  }
  // v1.17: PDF vetorial — a própria página do projeto + áreas e rótulos (mapa-pdf.js)
  async function exportarMapeamentoPdf(m, botao){
    var mp = draft.data.mapeamento, statusEl = m.querySelector("#mapa-status");
    if(!mp || !mp.plantaUrl){ if(statusEl) statusEl.textContent = "Carregue a planta antes de exportar."; return; }
    if(mp.tipo==="imagem"){ if(statusEl) statusEl.textContent = "Esta planta é uma imagem (não PDF): use “Exportar (PNG)”."; return; }
    if(botao) botao.disabled = true;
    if(statusEl) statusEl.textContent = "Gerando o PDF…";
    try{
      await garantirPdf();
      var resp = await fetch(mp.plantaUrl);
      if(!resp.ok) throw new Error("não consegui baixar a planta (HTTP "+resp.status+")");
      var bytes = await resp.arrayBuffer();
      var pdfjsDoc = await pdfjsLib.getDocument({ data:new Uint8Array(bytes.slice(0)) }).promise;
      var pagina = Math.min(Math.max(mp.pagina||1, 1), pdfjsDoc.numPages);
      var page = await pdfjsDoc.getPage(pagina);
      var mod = await import("./modulos/rastreabilidade/mapa-pdf.js");
      var areas = (mp.areas||[]).filter(function(a){ return a.pontos && a.pontos.length>=3; });
      var nfDe = function(a){ var l = (draft.data.linhas||[]).find(function(x){ return String(x.seq)===String(a.linhaSeq); }); return l && l.notaFiscal ? String(l.notaFiscal).trim() : ""; };
      var coresPdf = coresDoMapa(mp);
      areas = areas.map(function(a){ return Object.assign({}, a, { cor:corDaArea(coresPdf, a) }); });
      var out = await mod.mapaEmPdf({ bytes:bytes, pagina:pagina, pdfjsPage:page, areas:areas,
        textos:function(a){ return { bt:"BT "+a.linhaSeq, nf:nfDaArea(a) }; },
        titulo:"Mapeamento da concretagem — "+rastRotulo(draft.data),
        subtitulo:"Planta: "+(mp.plantaNome||"—")+"   ·   Data: "+(fmtDateBR(draft.data.data||"")||"—"),
        legenda:areas.map(function(a){ return { cor:a.cor, texto:"BT "+a.linhaSeq+(nfDe(a) ? " · NF "+nfDe(a) : "") }; }) });
      triggerDownload(new Blob([out], { type:"application/pdf" }), "mapeamento_"+(draft.data.data||"sem_data")+"_"+safeName(draft.data.blocoPav||"").slice(0,30)+".pdf");
      if(statusEl) statusEl.textContent = "PDF gerado ("+Math.round(out.length/1024)+" KB) — mesma qualidade da planta original.";
    }catch(ex){
      console.error("exportar mapeamento PDF", ex);
      if(statusEl) statusEl.textContent = "Não foi possível gerar o PDF: "+(ex && ex.message ? ex.message : "erro desconhecido")+". Use “Exportar (PNG)”.";
    }finally{ if(botao) botao.disabled = false; }
  }
  async function exportarMapeamentoPng(m){
    var mp = draft.data.mapeamento;
    var canvasBase = m.querySelector("#mapa-canvas");
    var statusEl = m.querySelector("#mapa-status");
    if(!canvasBase || !canvasBase.width || !mp || !mp.plantaUrl){
      if(statusEl) statusEl.textContent = "Carregue a planta antes de exportar.";
      return;
    }
    if(statusEl) statusEl.textContent = "Gerando a imagem em alta resolução…";
    var planta = await plantaAltaResolucao(mp, canvasBase);
    var coresPng = coresDoMapa(mp);
    var areas = (mp.areas || []).map(function(a){ return Object.assign({}, a, { cor:corDaArea(coresPng, a) }); });
    var vw = planta.width, vh = planta.height;
    // cabeçalho e legenda crescem junto com a planta (k = 1 numa planta de 2000 px)
    var k = Math.max(1, vw/2000);
    var padMargem = Math.round(24*k), padTopo = Math.round(74*k), linhaLegenda = Math.round(28*k);
    var alturaLegenda = areas.length ? (linhaLegenda*areas.length + Math.round(20*k)) : Math.round(36*k);
    var out = document.createElement("canvas");
    out.width = vw + padMargem*2;
    out.height = padTopo + vh + alturaLegenda + padMargem;
    var ctx = out.getContext("2d");
    if(!ctx){ if(statusEl) statusEl.textContent = "Imagem grande demais para este aparelho."; return; }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold "+Math.round(20*k)+"px Arial, Helvetica, sans-serif";
    ctx.fillText("Mapeamento da concretagem — "+rastRotulo(draft.data), padMargem, Math.round(30*k));
    ctx.font = Math.round(13*k)+"px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#666666";
    ctx.fillText("Planta: "+(mp.plantaNome||"—")+"   ·   Data: "+(fmtDateBR(draft.data.data||"")||"—"), padMargem, Math.round(52*k));

    try{
      ctx.drawImage(planta, padMargem, padTopo);
    }catch(ex){
      console.error("exportarMapeamentoPng: falha ao desenhar a planta", ex);
      if(statusEl) statusEl.textContent = "Não foi possível gerar a imagem (falha ao ler a planta). Tente de novo depois de recarregar a página.";
      return;
    }

    areas.forEach(function(a){
      if(!a.pontos || a.pontos.length<3) return;
      ctx.beginPath();
      a.pontos.forEach(function(p, i){
        var x = padMargem + p[0]*vw, y = padTopo + p[1]*vh;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.globalAlpha = 0.32; ctx.fillStyle = a.cor; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = a.cor; ctx.lineWidth = Math.max(2, vw*0.003); ctx.lineJoin = "round"; ctx.stroke();
    });
    // rótulos por cima de todas as áreas (mesma regra do editor: centro visual, tamanho pela
    // planta; v1.36: o que não cabe vai para fora, com linha)
    var textosPng = function(a){ return { bt:"BT "+a.linhaSeq, nf:nfDaArea(a) }; };
    planejarRotulos(areas, vw, vh, textosPng).forEach(function(r, i){
      if(r) rotuloCanvas(ctx, r, textosPng(areas[i]), areas[i].cor, padMargem, padTopo, 1);
    });

    var yLeg = padTopo + vh + Math.round(28*k);
    if(areas.length===0){
      ctx.fillStyle = "#666666"; ctx.font = Math.round(13*k)+"px Arial, Helvetica, sans-serif";
      ctx.fillText("Nenhuma área demarcada.", padMargem, yLeg);
    }else{
      areas.forEach(function(a, ai){
        var linha = (draft.data.linhas||[]).find(function(l){ return String(l.seq)===String(a.linhaSeq); });
        var y = yLeg + ai*linhaLegenda;
        ctx.fillStyle = a.cor;
        ctx.fillRect(padMargem, y-Math.round(13*k), Math.round(14*k), Math.round(14*k));
        ctx.fillStyle = "#1a1a1a"; ctx.font = "bold "+Math.round(13*k)+"px Arial, Helvetica, sans-serif";
        ctx.fillText("BT "+a.linhaSeq + (linha && linha.notaFiscal ? "   ·   NF "+linha.notaFiscal : ""), padMargem+Math.round(22*k), y-Math.round(2*k));
      });
    }

    out.toBlob(function(blob){
      if(!blob){
        if(statusEl) statusEl.textContent = "Não foi possível gerar a imagem pra exportar (pouca memória no aparelho?).";
        return;
      }
      if(statusEl) statusEl.textContent = "Imagem gerada: "+out.width+" × "+out.height+" px.";
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "mapeamento_"+(draft.data.data||"sem_data")+"_"+safeName(draft.data.blocoPav||"").slice(0,30)+".png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    }, "image/png");
  }

  // Trava os botões do rodapé enquanto envia — evita o duplo toque que
  // criava duas fichas iguais.
  function setBotoesSalvando(ativo){
    var m = document.getElementById("modal");
    if(!m) return;
    ["#btn-save","#btn-toggle-close","#btn-delete"].forEach(function(sel){
      var b = m.querySelector(sel);
      if(!b) return;
      if(ativo){ b.dataset.txt = b.textContent; b.disabled = true; if(sel==="#btn-save") b.textContent = "Salvando…"; }
      else { b.disabled = (sel==="#btn-delete" && !draft.id); if(b.dataset.txt) b.textContent = b.dataset.txt; }
    });
  }
  // Salva a ficha aberta. Devolve true se salvou (ou se ficou na fila por
  // falta de sinal) e false se deu erro — nunca mais falha em silêncio.
  async function saveDraft(keepOpen){
    if(!draft || salvando) return false;
    // v1.21: rastreabilidade não salva com elemento repetido na mesma betonada
    if(draft.type==="rast"){
      var rep = pecasRepetidas(draft.data.linhas);
      if(rep.length){ alert("Elemento repetido na mesma betonada:\n"+rep.map(function(x){ return "• "+x.peca+" — BT "+x.seq; }).join("\n")+"\n\nNa mesma BT cada elemento entra uma vez só. Corrija antes de salvar."); return false; }
    }
    salvando = true;
    var d = draft;
    d.data.updatedAt = nowISO();
    d.data.updatedByEmail = currentUserEmail || d.data.updatedByEmail || "";
    var col = d.type==="fvs" ? fvsCol : rastCol;
    // O id é gerado antes de enviar: se a pessoa tocar de novo, ou se o envio
    // ficar na fila sem sinal, continua sendo a MESMA ficha (sem duplicar).
    if(!d.id) d.id = col.doc().id;
    // v1.4: FVS sem número ganha o próximo da sequência do seu código.
    if(d.type==="fvs" && !String(d.data.numero||"").trim()){
      var pn = proximoNumeroFvs(d.data.codigo, d.id);
      d.data.numero = pn.numero; d.data.numeroSeq = pn.seq; d.data.numeroAuto = true;
    }
    guardarRascunho(); // cópia no aparelho até o servidor confirmar
    var chave = d.chave;
    setBotoesSalvando(true);
    // Promise.resolve().then: se o Firestore recusar os dados na hora (erro
    // síncrono), vira uma falha tratada abaixo — antes travava o "Salvando…".
    var payload = paraFirestore(JSON.parse(JSON.stringify(d.data)));
    var envio = Promise.resolve().then(function(){ return col.doc(d.id).set(payload); });
    var resultado;
    try{
      resultado = await Promise.race([
        envio.then(function(){ return "ok"; }),
        new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })
      ]);
    }catch(ex){
      console.error("saveDraft", ex);
      salvando = false;
      if(draft===d) setBotoesSalvando(false);
      var msg = (ex && ex.code==="permission-denied")
        ? "sem permissão para gravar (sua sessão pode ter expirado — saia e entre de novo)"
        : (ex && ex.message ? ex.message : "erro desconhecido");
      alert("Não foi possível salvar: "+msg+".\n\nO que você preencheu continua guardado neste aparelho.");
      return false;
    }
    if(resultado==="ok"){
      limparRascunho(chave);
    } else {
      // Sem resposta do servidor em 10s (subsolo, sinal fraco): o Firestore
      // mantém o envio na fila e manda sozinho quando a conexão voltar.
      envio.then(function(){ limparRascunho(chave); }).catch(function(ex){ console.error("envio pendente falhou", ex); });
      alert("Sem conexão com o servidor no momento.\n\nA ficha ficou guardada neste aparelho e será enviada automaticamente quando o sinal voltar. Se fechar o app antes disso, ao abrir de novo o sistema oferece recuperar.");
    }
    salvando = false;
    if(draft===d){
      d.orig = JSON.stringify(d.data);
      if(!keepOpen) closeModal(); else renderModal();
    }
    return true;
  }

  async function persistLink(fromType, fromId, otherId){
    try{
      if(fromType==="fvs"){
        draft.data.rastreabilidadeId = otherId;
        if(!await saveDraft(true)) return;
        await rastCol.doc(otherId).update({ fvsId: draft.id, updatedAt: nowISO() });
      } else {
        draft.data.fvsId = otherId;
        if(!await saveDraft(true)) return;
        await fvsCol.doc(otherId).update({ rastreabilidadeId: draft.id, updatedAt: nowISO() });
      }
    }catch(ex){ console.error(ex); alert("Não foi possível concluir o vínculo: "+(ex&&ex.message?ex.message:"erro desconhecido")+"."); }
  }
  async function removeLink(fromType, fromId, otherId){
    try{
      if(fromType==="fvs"){
        draft.data.rastreabilidadeId=null;
        if(!await saveDraft(true)) return;
        if(otherId) await rastCol.doc(otherId).update({ fvsId:null, updatedAt: nowISO() });
      } else {
        draft.data.fvsId=null;
        if(!await saveDraft(true)) return;
        if(otherId) await fvsCol.doc(otherId).update({ rastreabilidadeId:null, updatedAt: nowISO() });
      }
    }catch(ex){ console.error(ex); alert("Não foi possível desfazer o vínculo: "+(ex&&ex.message?ex.message:"erro desconhecido")+"."); }
  }
  async function generateLinked(fromType){
    if(!draft.id && !await saveDraft(true)) return;
    if(fromType==="fvs"){
      var f=draft.data;
      var nr = blankRast();
      nr.obra=f.obra; nr.blocoPav=f.local; nr.data=f.dataConcretagem||f.dataAbertura;
      nr.fvsId = draft.id;
      var ref = await rastCol.add(nr);
      draft.data.rastreabilidadeId = ref.id;
      await saveDraft(true);
      closeModal(); openModal("rast", ref.id);
    } else {
      var r=draft.data;
      var rastId=draft.id;
      // Antes só criava direto no tipo padrão (FVS 04); agora pergunta qual tipo
      // de ficha gerar, igual ao botão "+ Ficha FVS" do cabeçalho.
      openTipoChooser(async function(tipoKey){
        var nf = blankFvs(tipoKey);
        nf.obra=r.obra; nf.local=r.blocoPav; nf.dataConcretagem=r.data; nf.dataAbertura=r.data;
        nf.rastreabilidadeId = rastId;
        var pn2 = proximoNumeroFvs(nf.codigo, null);
        nf.numero = pn2.numero; nf.numeroSeq = pn2.seq; nf.numeroAuto = true;
        var ref2 = await fvsCol.add(nf);
        if(draft && draft.id===rastId){
          draft.data.fvsId = ref2.id;
          await saveDraft(true);
        } else {
          await rastCol.doc(rastId).update({ fvsId: ref2.id, updatedAt: nowISO() });
        }
        closeModal(); openModal("fvs", ref2.id);
      });
    }
  }

  /* ---------------- auth screen events ---------------- */
  function wireAuth(){
    document.getElementById("login-form").addEventListener("submit", function(e){
      e.preventDefault();
      var email=document.getElementById("login-email").value.trim();
      var pass=document.getElementById("login-password").value;
      var errEl=document.getElementById("login-error");
      errEl.hidden=true;
      var btn=document.getElementById("login-submit");
      btn.disabled=true; btn.textContent="Entrando…";
      auth.signInWithEmailAndPassword(email, pass).then(function(){
        try{ localStorage.setItem("traco-integrado-last-email", email); }catch(ex){}
      }).catch(function(err){
        errEl.hidden=false;
        errEl.textContent = authErrorMessage(err.code);
      }).finally(function(){
        btn.disabled=false; btn.textContent="Entrar";
      });
    });
    document.getElementById("forgot-password").addEventListener("click", function(){
      var email=document.getElementById("login-email").value.trim();
      if(!email){ alert("Digite seu e-mail no campo acima e clique novamente para receber o link de redefinição de senha."); return; }
      auth.sendPasswordResetEmail(email).then(function(){
        alert("Enviamos um link de redefinição de senha para "+email+".");
      }).catch(function(err){ alert("Não foi possível enviar: "+authErrorMessage(err.code)); });
    });
    document.getElementById("btn-logout").addEventListener("click", function(){ auth.signOut(); });
    document.getElementById("theme-toggle").addEventListener("click", function(){
      var root=document.documentElement;
      var cur=root.getAttribute("data-theme");
      var sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var effectiveCur = cur || (sysDark?"dark":"light");
      var next = effectiveCur==="dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try{ localStorage.setItem("traco-integrado-theme", next); }catch(ex){}
    });
    try{
      var savedTheme=localStorage.getItem("traco-integrado-theme");
      if(savedTheme==="dark"||savedTheme==="light") document.documentElement.setAttribute("data-theme", savedTheme);
    }catch(ex){}
  }

  /* ---------------- global events ---------------- */
  function wireGlobal(){
    document.getElementById("btn-new-fvs").addEventListener("click", function(){ openTipoChooser(); });
    document.getElementById("btn-new-rast").addEventListener("click", function(){ openModal("rast", null); });
    document.getElementById("btn-new-desforma").addEventListener("click", function(){ abrirDesforma({}); });
    document.getElementById("btn-view-pavimento").addEventListener("click", function(){ showViewPavimento(); });
    document.getElementById("btn-view-ct").addEventListener("click", function(){ showViewCt(); });
    document.getElementById("btn-view-plantas").addEventListener("click", function(){ showViewPlantas(); });
    document.getElementById("btn-view-aco").addEventListener("click", function(){ switchView("aco"); });
    document.getElementById("btn-view-cronograma").addEventListener("click", function(){ switchView("cronograma"); });
    document.getElementById("btn-view-historico").addEventListener("click", function(){ switchView("historico"); });
    document.getElementById("btn-view-lixeira").addEventListener("click", function(){ switchView("lixeira"); });
    document.getElementById("btn-view-equipe").addEventListener("click", function(){ switchView("equipe"); });
    document.getElementById("btn-view-assinar").addEventListener("click", function(){ filtrosEng.sel = {}; switchView("assinar"); });
    document.getElementById("btn-minha-assinatura").addEventListener("click", abrirMinhaAssinatura);
    initCronograma({ col:cronCol, todayISO:todayISO, nowISO:nowISO, fmtDateBR:fmtDateBR, garantirLibs:garantirLibs,
      usuario:function(){ return currentUserEmail||""; }, erroAcesso:function(){ return cronErroAcesso; } });
    initAco({ col:acoCol, lista:acoListaComConcretagem, fmtDateBR:fmtDateBR, todayISO:todayISO, garantirPdf:garantirPdf,
      nowISO:nowISO, usuario:function(){ return currentUserEmail||""; }, erroAcesso:function(){ return acoErroAcesso; }, lajes:acoLajes });
    document.getElementById("btn-nav-dashboard").addEventListener("click", function(){ switchView("dashboard"); });
    document.getElementById("btn-nav-engenharia").addEventListener("click", function(){ switchView("engenharia"); });
    document.getElementById("btn-nav-board").addEventListener("click", function(){ switchView("board"); });
    document.getElementById("btn-nav-nc").addEventListener("click", function(){ switchView("nc"); });
    document.getElementById("overlay").addEventListener("click", function(e){ if(e.target.id==="overlay") tentarFecharModal(); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape" && !document.getElementById("overlay").hidden && !document.querySelector(".ct-ficha-ov")) tentarFecharModal(); });
    // v1.5: na rastreabilidade, abrir/lançar o controle tecnológico de cada NF
    document.getElementById("modal").addEventListener("click", function(e){
      var a = e.target.closest("[data-ct-nf]");
      if(a){ abrirFichaNf(a.getAttribute("data-ct-nf")); return; }
      var l = e.target.closest("[data-ct-lancar]");
      if(l && draft){
        var linha = (draft.data.linhas||[])[+l.getAttribute("data-ct-lancar")] || {};
        abrirFichaNf(null, { notaRemessa: linha.notaFiscal||"", dataConcretagem: draft.data.data||todayISO(),
          local: [draft.data.blocoPav, linha.pecas].filter(Boolean).join(" — "), volume: ctNumero(linha.volBetoneira),
          slump: ctNumero(linha.slump), fck: ctNumero(draft.data.fckSolicitado), numCps: ctNumero(linha.nCPs), concreteira: linha.fornecedor||"" });
      }
    });
    // Guarda o rascunho no aparelho enquanto a pessoa digita (meio segundo
    // depois da última tecla), não só quando a tela é redesenhada.
    var timerRascunho = null;
    function agendarRascunho(){
      clearTimeout(timerRascunho);
      timerRascunho = setTimeout(function(){ if(draftAlterado()) guardarRascunho(); }, 500);
    }
    document.getElementById("modal").addEventListener("input", agendarRascunho);
    document.getElementById("modal").addEventListener("change", agendarRascunho);
    // Fechar a aba/app com ficha não salva: o navegador pede confirmação.
    window.addEventListener("beforeunload", function(e){
      if(draftAlterado() || salvando){ guardarRascunho(); e.preventDefault(); e.returnValue = ""; }
      // v1.10: ainda há gravação sem chegar ao servidor (sem sinal)
      else if(PENDENTES.n){ e.preventDefault(); e.returnValue = ""; }
    });

    document.getElementById("f-search").addEventListener("input", function(e){ filters.search=e.target.value; render(); });
    document.getElementById("f-from").addEventListener("change", function(e){ filters.from=e.target.value; render(); });
    document.getElementById("f-to").addEventListener("change", function(e){ filters.to=e.target.value; render(); });
    document.getElementById("f-pavimento").addEventListener("change", function(e){ filters.pavimento=e.target.value; render(); });
    document.getElementById("f-situacao").addEventListener("click", function(e){
      var btn=e.target.closest("[data-sit]"); if(!btn) return;
      document.querySelectorAll("#f-situacao .chip").forEach(function(c){ c.setAttribute("aria-pressed", c===btn ? "true":"false"); });
      filters.sit = btn.getAttribute("data-sit");
      render();
    });

    document.getElementById("board-body").addEventListener("click", function(e){
      var t=e.target;
      var openFvs=t.closest("[data-open-fvs]"); if(openFvs){ openModal("fvs", openFvs.getAttribute("data-open-fvs")); return; }
      var openRast=t.closest("[data-open-rast]"); if(openRast){ openModal("rast", openRast.getAttribute("data-open-rast")); return; }
      var genFvs=t.closest("[data-gen-fvs]"); if(genFvs){ openModal("rast", genFvs.getAttribute("data-gen-fvs")); return; }
      var genRast=t.closest("[data-gen-rast]"); if(genRast){ openModal("fvs", genRast.getAttribute("data-gen-rast")); return; }
    });
  }

  /* ---------------- v1.3: casca nova (menu, barra inferior, busca) ---------------- */
  function wireLayoutNovo(){
    initLayout();
    document.querySelectorAll(".ti-bn[data-view]").forEach(function(b){
      b.addEventListener("click", function(){ switchView(b.getAttribute("data-view")); });
    });
    // Itens da busca global: telas, ações, fichas, rastreabilidades e traços.
    initBusca({ itens: function(){
      var out = [];
      function tela(t, view, icone){ out.push({ grupo:"Telas", titulo:t, icone:icone, busca:t, abrir:function(){ switchView(view); } }); }
      tela("Início", "dashboard", "home");
      tela("Fichas & Rastreabilidade", "board", "check");
      tela("FVS por pavimento", "pavimento", "layers");
      tela("Não conformidades", "nc", "alert");
      tela("Controle tecnológico do concreto", "ct", "flask");
      tela("Plantas", "plantas", "map");
      tela("Entregas de aço", "aco", "truck");
      tela("Cronograma da obra", "cronograma", "clock");
      out.push({ grupo:"Telas", titulo:"Minha assinatura", icone:"pen", busca:"assinatura assinar", abrir:abrirMinhaAssinatura });
      out.push({ grupo:"Ações", titulo:"Nova ficha FVS", icone:"plus", busca:"nova ficha fvs criar", abrir:function(){ openTipoChooser(); } });
      out.push({ grupo:"Ações", titulo:"Nova rastreabilidade de concreto", icone:"plus", busca:"nova rastreabilidade concreto criar betonada", abrir:function(){ openModal("rast", null); } });
      out.push({ grupo:"Ações", titulo:"Pendências da desforma (fotos)", icone:"alert", busca:"desforma pendencia foto freiba forma relatorio fotografico", abrir:function(){ abrirDesforma({}); } });
      var fichas = [];
      fvsMap.forEach(function(f, id){ fichas.push({ id:id, f:f }); });
      fichas.sort(function(a,b){ return (b.f.dataConcretagem||b.f.dataAbertura||"").localeCompare(a.f.dataConcretagem||a.f.dataAbertura||""); });
      fichas.forEach(function(x){
        var f = x.f, pavs = fvsPavimentosList(f);
        out.push({ grupo:"Fichas FVS", icone:"check",
          titulo:(f.codigo||"FVS")+" · "+(f.numero||"s/ nº")+" — "+(f.descricao||""),
          sub:(pavs.join(", ")||f.local||"")+" · "+fvsStatus(f).label, dir:fmtDateBR(f.dataConcretagem||f.dataAbertura),
          busca:[f.codigo, f.numero, f.descricao, f.local, pavs.join(" "), (f.unidades||[]).join(" "), f.inspecionadoPor, f.engenheiro,
            fichaNaoConformidades(f).map(function(n){ return n.descricao; }).join(" ")].join(" "),
          abrir:function(){ openModal("fvs", x.id); } });
      });
      var rasts = [];
      rastMap.forEach(function(r, id){ rasts.push({ id:id, r:r }); });
      rasts.sort(function(a,b){ return (b.r.data||"").localeCompare(a.r.data||""); });
      rasts.forEach(function(x){
        var r = x.r, linhas = r.linhas||[];
        out.push({ grupo:"Rastreabilidades", icone:"truck",
          titulo:"Concretagem "+rastRotulo(r),
          sub:linhas.length+" betonada(s) · NF "+linhas.map(function(l){ return l.notaFiscal; }).filter(Boolean).slice(0,3).join(", "),
          dir:fmtDateBR(r.data),
          busca:[r.numero, r.blocoPav, (r.pavimentos||[]).join(" "), r.projetoReferencia, r.fckSolicitado,
            linhas.map(function(l){ return [l.notaFiscal, l.betoneira, l.lacre, l.fornecedor, l.nSerieCP, l.pecas].join(" "); }).join(" ")].join(" "),
          abrir:function(){ openModal("rast", x.id); } });
      });
      ctRowsArray().forEach(function(c){
        out.push({ grupo:"Controle tecnológico", icone:"flask",
          titulo:(c.local||"(sem local)")+" — NF "+c.notaRemessa, sub:(c.concreteira||"")+" · fck "+(c.fck||"—")+" MPa",
          dir:fmtDateBR(c.dataConcretagem),
          busca:[c.local, c.notaRemessa, c.concreteira, c.laboratorio, "fck "+c.fck].join(" "),
          abrir:function(){ filtrosCt.busca = String(c.notaRemessa); switchView("ct"); } });
      });
      return out;
    } });
  }

  document.addEventListener("DOMContentLoaded", function(){
    wireLayoutNovo();
    wireGlobal();
    wireAuth();
    boot();
  });
})();

/* ===== bloco 3 — PWA (instalar app) ===== */
// PWA: registra o service worker (necessário para o navegador oferecer a
  // instalação como app) e cuida do botão "Instalar app" no cabeçalho.
  // Isolado num <script> à parte para não mexer no app principal acima.
  (function(){
    if("serviceWorker" in navigator){
      window.addEventListener("load", function(){
        navigator.serviceWorker.register("sw.js").catch(function(){});
      });
    }

    var deferredPrompt = null;
    var btn = null;

    function isStandalone(){
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }
    function isIOS(){
      return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    }
    function showIosHint(){
      if(document.getElementById("ios-install-hint")) return;
      var hint = document.createElement("div");
      hint.id = "ios-install-hint";
      hint.innerHTML = '<b>Instalar no iPhone/iPad</b>'
        + 'Toque em <strong>Compartilhar</strong> (ícone com a seta ⬆) na barra do Safari e depois em '
        + '<strong>“Adicionar à Tela de Início”</strong>.'
        + '<div><button type="button" class="btn ghost" id="ios-install-hint-close">Entendi</button></div>';
      btn.parentElement.appendChild(hint);
      document.getElementById("ios-install-hint-close").addEventListener("click", function(){
        hint.remove();
      });
    }

    window.addEventListener("beforeinstallprompt", function(e){
      e.preventDefault();
      deferredPrompt = e;
      if(btn) btn.hidden = false;
    });
    window.addEventListener("appinstalled", function(){
      if(btn) btn.hidden = true;
      deferredPrompt = null;
    });

    document.addEventListener("DOMContentLoaded", function(){
      btn = document.getElementById("btn-install-app");
      if(!btn) return;
      if(isStandalone()){ return; }
      if(isIOS()){ btn.hidden = false; }
      btn.addEventListener("click", function(){
        var existingHint = document.getElementById("ios-install-hint");
        if(existingHint){ existingHint.remove(); return; }
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.finally(function(){ deferredPrompt = null; });
        } else if(isIOS()){
          showIosHint();
        }
      });
    });
  })();
