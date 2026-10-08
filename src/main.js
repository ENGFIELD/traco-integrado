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
import { garantirLibs, garantirPdf, carregarModelo } from "./libs.js";
import { preencherPlanilhaCt } from "./modulos/ct/planilha-ct.js";
import { abrirEditorMapa } from "./modulos/rastreabilidade/editor-mapa.js";
import { initLayout, definirUsuario, definirContador } from "./ui/layout.js";
import { initBusca } from "./ui/busca.js";
import { pintarIcones } from "./ui/icones.js";
import { corteHtml, corteEtapaHtml } from "./modulos/obra/corte-predio.js";
import { situacaoNivel, topoEtapa, fvsPedidas } from "./modulos/cronograma/etapas.js";
import { rotuloArea, rotuloSvg, rotuloCanvas } from "./modulos/rastreabilidade/rotulo-mapa.js";
import { PAPEIS as PAPEIS_ASSIN, abrirCadastroAssinatura, assinaturasHtml } from "./modulos/assinatura/assinatura.js";
import { adicionarAssinaturasXlsx } from "./modulos/assinatura/xlsx-assinatura.js";
import { initAco, renderViewAco, proximasEntregas, situacao as acoSituacao, pesoTotal as acoPeso } from "./modulos/aco/aco.js";
import { acoParaLajes, textoAviso as acoTextoLaje } from "./modulos/aco/aco-cronograma.js";
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
(function(){
  var fs = firebase.firestore;
  var tipoDe = function(obj, m){
    if(m==="commit") return "alterações em lote";
    var col = obj instanceof fs.CollectionReference ? obj.id : (obj.parent && obj.parent.id);
    return NOMES_COLECAO[col] || col || "registro";
  };
  [[fs.DocumentReference.prototype, ["set","update","delete"]], [fs.CollectionReference.prototype, ["add"]], [fs.WriteBatch.prototype, ["commit"]]].forEach(function(par){
    par[1].forEach(function(m){
      var original = par[0][m];
      par[0][m] = function(){
        if(somenteLeitura) return recusarGravacao();
        var p = original.apply(this, arguments), tipo = tipoDe(this, m);
        marcarPendente(tipo, +1);
        p.then(function(){ marcarPendente(tipo, -1); }, function(){ marcarPendente(tipo, -1); });
        return p;
      };
    });
  });
})();
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

  var FVS_CHECKLIST = [
    { cat:"Montagem de Fôrma", itens:[
      {n:"Travamento", m:"Travamento e encaixe dos painéis, verificado visualmente."},
      {n:"Nivelamento", m:"Nível do topo das fôrmas com nível a laser (desvio máx. 5mm)."},
      {n:"Prumo", m:"Prumo de face (desvio máx. 3mm)."},
      {n:"Escoramento", m:"Posição e quantidade do escoramento de acordo com o projeto."}
    ]},
    { cat:"Montagem de Armadura", itens:[
      {n:"Amarração e posicionamento", m:"Amarração firme, armadura sem contato com as fôrmas, conforme projeto."},
      {n:"Armadura positiva", m:"Posicionamento, espaçamento, bitola e fixação, conforme projeto."},
      {n:"Armadura negativa", m:"Posicionamento, espaçamento, bitola e fixação, conforme projeto."},
      {n:"Limpeza a laser", m:"Limpeza a laser das armaduras com corrosão."},
      {n:"Limpeza", m:"Limpeza com hidrojato."}
    ]},
    { cat:"Instalações", itens:[
      {n:"Furos de passagem e caixas", m:"Posicionamento e vedação."},
      {n:"SPDA", m:"Distribuição e execução do sistema de descarga atmosférica, conforme projeto específico."},
      {n:"Tubulações", m:"Posicionamento, tipo e vedação."}
    ]},
    { cat:"Concretagem de peça estrutural", itens:[
      {n:"Nivelamento de taliscas", m:"Nível a laser na laje (desvio máx. 5mm)."},
      {n:"Mapeamento do concreto", m:"Acompanhamento visual do lançamento e adensamento."}
    ]},
    { cat:"Laje mista", itens:[
      {n:"Nivelamento", m:"Fôrmas de borda e laje (desvio máx. 5mm); encaixe das peças."},
      {n:"Acabamento", m:"Acabamento da superfície da laje, verificado visualmente."}
    ]},
    { cat:"Desforma", itens:[
      {n:"Falhas na concretagem", m:"Falhas identificadas após a desforma."},
      {n:"Reescoramento", m:"Posicionamento do reescoramento, de acordo com o projeto."},
      {n:"Terminalidade", m:"Verificação visual final."}
    ]}
  ];

  // O modelo oficial da FVS-04 reserva 5 blocos de colunas ao lado de cada item
  // do checklist (visível no cabeçalho "LOCAL:" da planilha) — um por tipo de
  // elemento estrutural (Pilares / Vigas / Paredes / Laje / Outras Estruturas).
  // Cada elemento marcado nesta ficha precisa ter TODO o checklist avaliado de
  // novo, porque o resultado de "Travamento", "Nivelamento" etc. pode ser
  // diferente para a laje e para os pilares concretados no mesmo dia.
  var FVS_ELEMENTOS = [
    { key:"pilares", label:"Pilares",           cols:["J","K","L"]      },
    { key:"vigas",   label:"Vigas",              cols:["M","N","O"]      },
    { key:"paredes", label:"Paredes",            cols:["P","Q","R"]      },
    { key:"laje",    label:"Laje",               cols:["S","T","U"]      },
    { key:"outras",  label:"Outras Estruturas",  cols:["V","W","X","Y"]  }
  ];

  // Catálogo dos "tipos de FVS" além da FVS 04 (Forma/Armação/Concretagem, que
  // já tinha tratamento próprio com elementos fixos Pilares/Vigas/Paredes/Laje).
  // Cada tipo traz o checklist oficial (categorias e itens) e como a ficha marca
  // o resultado: "single" = uma marcação só por item (ex.: Locação da Obra, uma
  // atividade única); "dynamic" = várias unidades numeradas pelo usuário na hora
  // (ex.: várias estacas, sapatas ou blocos avaliados na mesma ficha), com o
  // prefixo indicado (gera "Estaca 1", "Sapata 1" etc. como sugestão de nome).
  var FVS_TIPOS = [
    { key:"locacao_obra", codigo:"FVS 02", revisao:"05", titulo:"Locação da Obra", unidades:{mode:"single"},
      checklist:[{cat:null, itens:[
        {n:"Definir a referência de Nível (RN)", m:"Verificar as distâncias entre eixos e divisas.", tol:">1 metro"},
        {n:"Cravação dos Pontaletes", m:"Verificar se estão aprumados e alinhados faceando o mesmo lado da linha de náilon. A distância será aproximadamente 2m entre um e outro.", tol:"aproximadamente 2 metros entre pontaletes"},
        {n:"Pintura do gabarito", m:"Verificar se o gabarito foi pintado na cor branca."},
        {n:"Posição do Elemento Estrutural", m:"Esticar um arame pelos dois eixos do elemento estrutural (o cruzamento do arame define a posição entre eixos, x e y)."}
      ]}]
    },
    { key:"escavacao", codigo:"RVS-01", revisao:"01", titulo:"Escavação, Aterro, Reaterro e Compactação", unidades:{mode:"dynamic", prefix:"Trecho"},
      checklist:[{cat:null, itens:[
        {n:"Cortes", m:"Cortes conforme cotas de projeto - com trena, nível a laser ou teodolito.", tol:"≤ 3cm"},
        {n:"Cotas", m:"Cotas finais de acordo com projeto, com nível a laser ou teodolito.", tol:"≤ 3cm"},
        {n:"Ensaio", m:"Quando necessário, contratar laboratório para ensaio de compactação de aterro.", tol:"grau de compactação mínimo=95%"},
        {n:"Gabarito", m:"Alinhamento e nivelamento da tabeira, com linha e nível de mangueira ou laser; esquadro com trena metálica; fixação e travamento visualmente.", tol:"desvio máx. 1cm (2cm na extremidade maior do triângulo 3x4x5m)"},
        {n:"Marcação", m:"Locação dos eixos das peças na tabeira com trena metálica.", tol:"desvio máx. 5mm"},
        {n:"Acabamento", m:"Inclinação dos taludes de acordo com projeto, com nível a laser ou teodolito.", tol:"desvio máx. 5cm"},
        {n:"Uniformidade", m:"Uniformidade do terreno - visualmente.", tol:"não aplicável"}
      ]}]
    },
    { key:"estaca_metalica", codigo:"RVS-03.4", revisao:"04", titulo:"Estaca Metálica (Perfil) e Estaca Prancha", unidades:{mode:"dynamic", prefix:"Estaca"},
      checklist:[{cat:null, itens:[
        {n:"Locação das Estacas", m:"A partir do gabarito, com os eixos definidos, os centros de cada estaca devem estar de acordo com o projeto de locação, com apoio da topografia. Verificar pintura, acabamento e firmeza.", tol:"± 1,0 cm"},
        {n:"Diâmetro, especificação e profundidade das estacas", m:"De acordo com as definições de projeto de estaqueamento.", tol:"verificar tolerância definida pelo Consultor"},
        {n:"Prumo do equipamento e da estaca", m:"Conferir o prumo do equipamento de cravação e da estaca, utilizar prumo de face e centro."},
        {n:"Relatório de cravação", m:"Diário de cravação / relatório por estaca com todos os campos preenchidos (nega, profundidade, excentricidade etc.) e assinados pelo responsável.", tol:"verificar tolerância definida pelo Consultor"},
        {n:"Acabamento", m:"Acabamento (visual)."}
      ]}]
    },
    { key:"estaca_raiz", codigo:"RVS-03.3", revisao:"03", titulo:"Estaca Raiz", unidades:{mode:"dynamic", prefix:"Estaca"},
      checklist:[{cat:null, itens:[
        {n:"Locação do eixo das estacas", m:"Conferir a locação da estaca com o gabarito e com as medidas de projeto - trena metálica e prumo de centro.", tol:"1cm"},
        {n:"Prumo equipamento de perfuração", m:"Conferir a verticalidade (prumo) da torre nos planos ortogonais (X e Y) ou inclinação, conforme projeto de fundações.", tol:"1º (grau)"},
        {n:"Centralização da estaca", m:"Conferir que o centro da tubulação metálica de escavação coincida com a locação da estaca.", tol:"1% do diâmetro da estaca"},
        {n:"Verificar a profundidade", m:"Verificar a profundidade mínima de perfuração conforme projeto - trena metálica.", tol:"5cm"},
        {n:"Armação da estaca", m:"Conforme projeto de fundações.", tol:"não aplicável"},
        {n:"Recobrimento da armação", m:"Conforme projeto de fundações.", tol:"1mm"},
        {n:"Relatório de execução da estaca", m:"Leitura e assinatura do relatório.", tol:"consultar projetista e/ou consultor de fundação"},
        {n:"Cota de arrasamento/corte da estaca", m:"A partir do gabarito e/ou acompanhamento topográfico, considerando as definições do projeto para o corte; checar excentricidade.", tol:"não aplicável"}
      ]}]
    },
    { key:"estaca_helice", codigo:"RVS-03.5", revisao:"07", titulo:"Estaca Hélice Contínua", unidades:{mode:"dynamic", prefix:"Estaca"},
      checklist:[{cat:null, itens:[
        {n:"Locação das Estacas", m:"O centro de cada estaca deve estar de acordo com o projeto de locação, com apoio da topografia. Utilizar trena metálica e prumo de centro.", tol:"em projeto"},
        {n:"Diâmetro, especificação e profundidade das estacas", m:"De acordo com as definições do projeto de estaqueamento.", tol:"em projeto"},
        {n:"Prumo do equipamento e da estaca", m:"Conferir o prumo do equipamento de cravação e da estaca. Utilizar prumo de face e centro.", tol:"conforme procedimento de calibração"},
        {n:"Relatório de cravação", m:"Relatório por estaca com todos os campos preenchidos (profundidade etc.), assinado pelo responsável e pelo fiscal."},
        {n:"Armação", m:"Armação de acordo com o projeto e conferir profundidade."},
        {n:"Concretagem", m:"Concreto bombeado de acordo com as especificações de projeto."},
        {n:"Cota de arrasamento/corte da estaca", m:"A partir do gabarito e/ou acompanhamento topográfico, considerando as definições do projeto; checar excentricidade."},
        {n:"Integridade e capacidade de carga da estaca de concreto", m:"Ensaios PIT, PDA e PCE devem ser executados de acordo com projeto e conforme NBR 6122 e outras."}
      ]}]
    },
    { key:"estaca_escavada", codigo:"RVS-03.1", revisao:"02", titulo:"Estaca Escavada", unidades:{mode:"dynamic", prefix:"Estaca"},
      checklist:[
        {cat:"Locação", itens:[
          {n:"Colocação de Camisa Guia", m:"Locação e nivelamento da camisa guia."},
          {n:"Locação Topográfica", m:"Verificação da estaca através de estação total."}
        ]},
        {cat:"Escavação", itens:[
          {n:"Posicionamento da Perfuratriz", m:"Alinhamento em relação ao eixo de escavação."},
          {n:"Injetar Lama Bentonítica", m:"Injeção de lama."},
          {n:"Profundidade", m:"Profundidade conforme especificado em projeto."}
        ]},
        {cat:"Armadura", itens:[
          {n:"Montagem", m:"Armadura posicionada, com utilização dos espaçadores."},
          {n:"Posicionamento", m:"Posicionamento, espaçamento, bitola e fixação da armadura positiva, conforme projeto."}
        ]},
        {cat:"Concretagem", itens:[
          {n:"Lama Bentonítica", m:"Desarenação concluída."},
          {n:"Armadura", m:"Armadura fixada na camisa-guia para evitar deslocamento durante a concretagem."},
          {n:"Lançamento do Concreto", m:"Tempo de concretagem não deve ultrapassar 2h30."}
        ]},
        {cat:"Finalização", itens:[
          {n:"Acabamento", m:"Acabamento (visual)."}
        ]}
      ]
    },
    { key:"estaca_franki", codigo:"RVS-03.2", revisao:"03", titulo:"Estaca Franki", unidades:{mode:"dynamic", prefix:"Estaca"},
      checklist:[{cat:null, itens:[
        {n:"Locação", m:"Locação e nivelamento através de trena metálica e topografia.", tol:"desvio ≤ 1cm"},
        {n:"Prumo", m:"Locação e nivelamento através de trena metálica e topografia.", tol:"desvio de verticalidade no máx. 1% por metro cravado"},
        {n:"Nega", m:"Verificação de acordo com o projeto / atender as especificações do projeto.", tol:"atender especificações do projeto"},
        {n:"Comprimento da Estaca", m:"Através de mangueira de nível e trena; a concretagem do fuste deve ser executada no mínimo 40cm acima da cota de arrasamento."},
        {n:"Desvio máximo na estaca já concretada", m:"Através da trena metálica e topografia.", tol:"desvio não pode ser maior que 5,0 cm"},
        {n:"Acabamento", m:"Acabamento (visual)."}
      ]}]
    },
    { key:"sapata_isolada", codigo:"RVS-03.10", revisao:"01", titulo:"Sapata Isolada", unidades:{mode:"dynamic", prefix:"Sapata"},
      checklist:[{cat:null, itens:[
        {n:"Cota do fundo", m:"Verificar cota de fundo por meio de mangueira de nível ou laser.", tol:"± 5mm"},
        {n:"Forma de Borda", m:"Alinhamento, largura, altura e inclinação das laterais com linha de náilon e trena metálica. Dimensões e nivelamento do topo.", tol:"desvio máx. 5mm"},
        {n:"Locação da base da sapata", m:"Por meio de linha e prumo de centro, após a montagem e ajuste das formas.", tol:"± 5mm"},
        {n:"Largura e altura da sapata e inclinação das laterais", m:"Conforme projeto."},
        {n:"Armadura", m:"Diâmetro e posicionamento das barras e estribos (espaçadores), de acordo com projeto. Fixação e afastamento das faces da forma, visualmente.", tol:"conforme projeto"},
        {n:"Limpeza", m:"Limpeza antes da concretagem.", tol:"visual"},
        {n:"Concretagem", m:"Mapeamento do concreto; acompanhamento visual e rastreamento dos locais onde o concreto foi lançado."},
        {n:"Desforma", m:"Falhas de concretagem após a desforma (visual); limpeza final com retirada total dos restos de forma e outros materiais.", tol:"visual"}
      ]}]
    },
    { key:"radier_armado", codigo:"RVS-03.10", revisao:"01", titulo:"Radier Armado", unidades:{mode:"dynamic", prefix:"Trecho"},
      checklist:[{cat:null, itens:[
        {n:"Locação da forma de borda", m:"A partir do gabarito, com trena metálica.", tol:"máx. 5mm"},
        {n:"Nivelamento da forma de borda", m:"Nivelamento e alinhamento com linha e nível a laser ou mangueira.", tol:"máx. 5mm"},
        {n:"Armadura", m:"Diâmetro e posicionamento das barras, de acordo com projeto. Amarração firme, sem contato com as fôrmas (visual)."},
        {n:"Largura e caimento", m:"Largura e caimento das calçadas de borda, com trena metálica e nível de bolha.", tol:"máx. 5mm"},
        {n:"Posicionamento da lona plástica", m:"Lona esticada em toda a extensão do radier, sem rasgos e sem danos."},
        {n:"Instalações", m:"Locação de pontos conforme projetos específicos, com uso de trena para auxílio."}
      ]}]
    },
    { key:"bloco", codigo:"FVS-03.9", revisao:"03", titulo:"Blocos", unidades:{mode:"dynamic", prefix:"Bloco"},
      checklist:[
        {cat:"Montagem de Forma", itens:[
          {n:"Dimensão da peça", m:"Conferir a execução conforme o projeto, com trena metálica."},
          {n:"Rigidez do Travamento", m:"Visualmente."},
          {n:"Locação", m:"A partir da locação do gabarito, conferir os eixos e faces da peça e o engastamento do arranque do pilar, com prumo de centro e trena metálica."},
          {n:"Nível", m:"Com apoio da topografia ou utilizando nível laser ou mangueira de nível."}
        ]},
        {cat:"Montagem de Armadura", itens:[
          {n:"Amarração", m:"Rigidez da montagem e nós firmes."},
          {n:"Posição da Armadura", m:"Posicionamento e fixação da armadura de acordo com o projeto (visual)."},
          {n:"Espaçador", m:"Conferir o uso de espaçador, garantindo o afastamento da armação das faces da forma (visual)."},
          {n:"Limpeza", m:"Limpeza antes da concretagem (visual)."}
        ]},
        {cat:"Concretagem de Peça Estrutural", itens:[
          {n:"Mapeamento do Concreto", m:"Acompanhamento visual e rastreamento dos locais onde o concreto foi lançado."}
        ]},
        {cat:"Desforma", itens:[
          {n:"Falhas", m:"Falhas de concretagem após a desforma (visual)."},
          {n:"Limpeza Final", m:"Retirada total dos restos de forma e outros materiais (visual)."}
        ]}
      ]
    },
    { key:"impermeabilizacao_rigida", codigo:"FVS-11.1", revisao:"07", titulo:"Impermeabilização Rígida: Cristalização, Resina Epóxi, Argamassa Polimérica", unidades:{mode:"dynamic", prefix:"Área"},
      checklist:[
        {cat:"Inicial", itens:[
          {n:"Preparação", m:"Local limpo e livre de poeiras, óleos ou desmoldantes.", tol:"-"},
          {n:"Caimento", m:"Verificar se os caimentos estão corretos e com acabamento arredondado.", tol:"1%"}
        ]},
        {cat:"Impermeabilização", itens:[
          {n:"Cantos e ralos", m:"Calafetar todas as emendas e encontros com ralos.", tol:"-"},
          {n:"Mistura", m:"Misturar bem a resina ao pó, de modo a obter uma mistura homogênea.", tol:"-"},
          {n:"Aplicação", m:"Aplicar a 1ª demão e aguardar de 4 a 8 horas para seguir com as demãos. Subir pelo menos 30cm nos cantos.", tol:"mínimo 30 cm"},
          {n:"2º a 3º demão", m:"As demãos devem ser aplicadas de forma cruzada.", tol:"-"}
        ]},
        {cat:"Final", itens:[
          {n:"Finalização", m:"Polvilhar areia seca e peneirada da última camada antes da secagem completa."},
          {n:"Estanqueidade", m:"Após a secagem completa da impermeabilização, realizar o teste de estanqueidade, aplicar uma lâmina de água sobre o local, com no mínimo 10 cm de altura e aguardar por 72 horas.", tol:"Não haver vazamentos"}
        ]}
      ]
    },
    { key:"montagem_estrutura_metalica", codigo:"FVS-34", revisao:"00", titulo:"Montagem em Estrutura Metálica", unidades:{mode:"dynamic", prefix:"Peça"},
      checklist:[
        {cat:"Trabalho a Quente e Oxicorte", itens:[
          {n:"Equipamentos íntegros e sem vazamentos", m:"Inspeção Visual", tol:"-"},
          {n:"Mangueiras identificadas e em bom estado", m:"Inspeção Visual", tol:"-"},
          {n:"Área isolada (mín. 10m sem inflamáveis)", m:"Remover todos os inflamáveis da área", tol:"10m no mínimo"},
          {n:"Ventilação adequada", m:"Inspeção Visual", tol:"-"}
        ]},
        {cat:"SOLDAGEM", itens:[
          {n:"Limpeza adequada da superfície", m:"Remoção do zinco na área de solda utilizando lixadeira ou produtos químicos para evitar contaminação", tol:"-"},
          {n:"BURN-ZINC", m:"Técnica usada para queimar o zinco antes de iniciar a solda propriamente dita, garantindo um ponto mais limpo", tol:"-"},
          {n:"Distâncias e Medidas", m:"Respeitar as distâncias recomendadas em projeto", tol:"-"},
          {n:"Proteção anticorrosiva e limpeza", m:"Depois de soldar, realizar limpeza dos cordões de solda, com uso de escovas rotativas de aço e posterior aplicação de proteção anticorrosiva (CRZ) e remoção do zinco.", tol:"-"},
          {n:"Rastreabilidade da solda", m:"No campo anotar: nome do executor da solda, data e se há relatórios complementares assinados pela empresa e/ou executor.", tol:"-"}
        ]},
        {cat:"GALVANIZAÇÃO", itens:[
          {n:"Desengraxe e decapagem", m:"1.Desengraxe (NaOH); 2.Lavagem (Água); 3.Decapagem (HCl); 4.Lavagem (Água); 5.Fluxagem (ZnCl₂ e NH₄Cl); 6.Secagem; 7.Banho a zinco (450°C); 8.Passivação (solução cromatizante) e/ou resfriamento.", tol:"-"},
          {n:"Limpeza pós-solda adequada", m:"Retirar escória e carepas com escova rotativa de aço.", tol:"-"},
          {n:"Aplicação de tinta rica em zinco", m:"Com pincel – nunca spray, pois não atinge a espessura da camada e destaca pintura posterior.", tol:"-"},
          {n:"Aceitação (acabamento final)", m:"As razões para a aceitação ou a rejeição devem ser comunicadas às partes responsáveis, a saber: o galvanizador, construtor, projetista e usuário final.", tol:"-"}
        ]}
      ]
    },
    { key:"parede_diafragma", codigo:"RVS-03.6", revisao:"02", titulo:"Execução de Parede Diafragma", unidades:{mode:"dynamic", prefix:"Painel"},
      checklist:[
        {cat:"Mureta Guia", itens:[
          {n:"Locação", m:"Verificar a locação das lamelas de acordo com o projeto - trena metálica", tol:"± 1,0 cm"},
          {n:"Largura", m:"Verificar a largura da parede; a mureta deverá fornecer espaçamento extra conforme projeto", tol:"1 cm"},
          {n:"Armação", m:"Verificar a montagem da armação da mureta guia, conforme projeto", tol:"0,5mm"},
          {n:"Prumo", m:"Verificar prumo da mureta guia, conforme projeto - prumo de face", tol:"0,5mm"}
        ]},
        {cat:null, itens:[
          {n:"Lama betonítica", m:"Verificar resultados de ensaio da lama betonítica", tol:"Visual"},
          {n:"Escavação", m:"Verificar cota de apoio para escavação da lamela conforme projeto", tol:"-"},
          {n:"Painéis", m:"Verificar locação dos painéis das muretas guia conforme projeto - trena metálica", tol:"-"},
          {n:"Armação", m:"Verificar montagem da armação da parede conforme projeto", tol:"0,5mm"},
          {n:"Concretagem", m:"Concreto bombeado de acordo com as especificações de projeto", tol:"-"}
        ]}
      ]
    },
    { key:"cortina_atirantada", codigo:"RVS-03.7", revisao:"01", titulo:"Cortina Atirantada", unidades:{mode:"dynamic", prefix:"Painel"},
      checklist:[
        {cat:"Locação e Movimento de Terra", itens:[
          {n:"Locação Topográfica, Alinhamento", m:"Verificar a locação e os níveis; Verificar alinhamento de acordo com os marcos topográficos", tol:"-"},
          {n:"Corte manual de Barranco", m:"Cortar mantendo o alinhamento e prumo", tol:"-"},
          {n:"Magro e chapisco", m:"Verificar se estão feitos garantindo alinhamento e nível", tol:"-"}
        ]},
        {cat:"Forma, Armação e Concretagem", itens:[
          {n:"Dimensão da peça", m:"Conferir a execução conforme o projeto, com trena metálica", tol:"-"},
          {n:"Rigidez do Travamento", m:"Visualmente", tol:"-"},
          {n:"Nível", m:"Com apoio da topografia ou utilizando nível a laser ou mangueira de nível", tol:"-"},
          {n:"Amarração da Armação", m:"Rigidez da montagem e nós firmes", tol:"-"},
          {n:"Posição da Armadura", m:"Posicionamento e fixação da armadura de acordo com o projeto - visual", tol:"-"},
          {n:"Espaçador", m:"Conferir o uso de espaçador de forma a garantir o afastamento da armação das faces da forma - visual", tol:"-"},
          {n:"Limpeza", m:"Limpeza antes da concretagem - visual", tol:"-"},
          {n:"Mapeamento do Concreto", m:"Acompanhamento visual e rastreamento dos locais que o concreto foi lançado", tol:"-"},
          {n:"Falhas após Concretagem", m:"Falhas de concretagem após a desforma - visual", tol:"-"},
          {n:"Limpeza final", m:"Retirada total dos restos de forma e outros materiais - visual", tol:"-"}
        ]},
        {cat:"Atirantamento e Protensão", itens:[
          {n:"Locação dos tirantes", m:"Conferir a locação de tirantes em cada painel observando os níveis em função dos marcos topográficos", tol:"0,5 cm"},
          {n:"Perfuração", m:"Verificar se perfuração alcançou profundidade prevista em projeto", tol:"-"},
          {n:"Tirante", m:"Colocação de tirante devidamente tratado", tol:"-"},
          {n:"Injeção", m:"Injetar até o transbordamento de calda sã", tol:"-"},
          {n:"Protensão", m:"Verificar pelos dados do equipamento se alcançou a carga de projeto", tol:"-"},
          {n:"Acabamento", m:"Verificar a colocação da chapa, cunha, porca e contra-porca devidamente protegidas e concretar as cabeças", tol:"-"}
        ]}
      ]
    },
    { key:"protensao_cabos", codigo:"RVS-33", revisao:"00", titulo:"Protensão de Cabos (Distribuição das Cordoalhas na Forma da Laje)", unidades:{mode:"dynamic", prefix:"Painel"},
      checklist:[
        {cat:null, itens:[
          {n:"Cabos", m:"Quantidade e disposição dos cabos - Visual. Após a abertura dos rolos, as cordoalhas sem tensão devem manter flechas inferiores a 15 cm em 2 m de comprimento.\n\nApoio (excentricidade dos cabos): Estar de acordo com projeto; com auxílio de trena metálica e Projeto.", tol:"Estar de acordo com projeto / Até 5 mm."},
          {n:"Curvatura dos Cabos", m:"Curvatura dos cabos horizontais para desvios de aberturas ou outras interferências devem ser previstas no projeto estrutural; em tais curvaturas, os cabos que caminham em grupos de até quatro cordoalhas lado a lado devem ser afastados uns dos outros em 5 cm no centro da curva.", tol:"5 cm"},
          {n:"Ancoragens", m:"Fixação das Ancoragens - Aceitar se estiver bem fixa. A extremidade do cabo com ancoragem passiva deve ser colocada na fôrma conforme indicado em projeto. Esta ponta ficará oculta após a concretagem. Note que o trecho descoberto da cordoalha não pode ser maior que 2,5 cm.", tol:"2,5cm"},
          {n:"Forma de Borda", m:"Um ponto crítico na execução de estruturas protendidas com cordoalhas engraxadas é a furação da forma de borda por onde deve passar a cordoalha da ancoragem ativa. Para que não haja erros de cota, o espaçamento entre as ancoragens deve se basear, exclusivamente, nos desenhos detalhados em Projeto.", tol:"-"},
          {n:"Instalação dos Cabos nas Fôrmas", m:"Para permitir a atuação do equipamento de protensão, faça a cordoalha ultrapassar o limite da fôrma em no mínimo 30 cm.", tol:"30 cm"},
          {n:"Ferragem", m:"Barras de fretagem - Estar de acordo com projeto.", tol:"-"}
        ]},
        {cat:"Finalização", itens:[
          {n:"Organização e limpeza", m:"Acabamento", tol:"Visual"}
        ]}
      ]
    },
    { key:"guarda_corpo", codigo:"RVS-34", revisao:"00", titulo:"Instalação de Guarda-Corpo", unidades:{mode:"dynamic", prefix:"Trecho"},
      checklist:[
        {cat:null, itens:[
          {n:"Ancoragens", m:"Marcação de ancoragens: conferir com trena se marcação está conforme projeto, aceitar se a marcação estiver correta.\n\nLimpeza dos furos das ancoragens: verificar visualmente a limpeza do furo para melhor fixação do graute; o furo deve estar livre de pó.\n\nFixação das ancoragens: verificar visualmente se o chumbamento está bem acabado e firme, aceitar se não houver imperfeições.\n\nNivelamento: verificar com prumo, nível de bolha ou laser.", tol:"No máximo 5mm."},
          {n:"Acabamento", m:"As peças deverão estar no alinhamento correto, acabamentos e calafetes bem feitos.", tol:"-"},
          {n:"Apoios", m:"Balançar um pouco as peças para verificar se há folgas ou partes soltas. As peças deverão estar totalmente apoiadas, sem folgas ou partes soltas.", tol:"-"},
          {n:"Guarda-Corpo", m:"Atender a profundidade mínima de penetração dos elementos de fixação (ancoragens) ao concreto não inferior a 90 mm, independentemente da espessura de eventuais revestimentos.", tol:"-"}
        ]},
        {cat:"Finalização", itens:[
          {n:"Organização e limpeza", m:"Verificar visualmente", tol:"-"}
        ]}
      ]
    },
    { key:"preservacao_produto_acabado", codigo:"RVS-32", revisao:"00", titulo:"Preservação do Produto/Serviço Acabado", unidades:{mode:"single"},
      checklist:[
        {cat:null, itens:[
          {n:"Alvenaria", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Contrapiso", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Revestimento em Gesso Liso (estuque)", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Impermeabilização", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Instalação Hidrosanitária", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Instalação Elétrica e Caixas de Passagem", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Forro de Gesso", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Locação da Obra", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Tubulação de espera (elétrica)", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Tubulação de espera (Hidráulica)", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Dutos SPDA", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Piso de Madeira", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Paredes de Dry Wall", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Piso de pedra natural e piso cerâmico", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Caixilhos de Alumínio", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Banheiras e cubas de aço inóx", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Registros de pressão e de gaveta", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Ralos", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Dobradiças, fechaduras, ferragens, chapas testa e contra-testa de portas", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Tomadas interruptores sem espelhos", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Esquadrias de Madeira, Alumínio e Aço", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Batentes", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Tanque de lavar e louça sanitária", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Pontos d'água", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Forro", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Piso Cerâmico", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Pintura", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Vidros", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Porta de elevador", m:"Ver método de proteção específico do item.", tol:"N/A"},
          {n:"Cabine interna de elevador", m:"Ver método de proteção específico do item.", tol:"N/A"}
        ]}
      ]
    }
  ];
  function getFvsTipo(key){ return FVS_TIPOS.find(function(t){ return t.key===key; }) || null; }

  var DEFAULT_OBRA = "Consórcio de Construção Belavista Ipanema";
  var TEMPO_MAX_MIN = 150; // 2:30h, conforme FORM-15

  // Data de hoje no fuso do aparelho (Rio, UTC-3). Antes usava toISOString(),
  // que é UTC — entre 21h e 0h devolvia o dia seguinte.
  function todayISO(){
    var d=new Date();
    function p2(n){ return n<10 ? "0"+n : ""+n; }
    return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  }
  function nowISO(){ return new Date().toISOString(); }
  function escapeHtml(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  // v1.4: a rastreabilidade é identificada por DATA + PAVIMENTO (o antigo
  // "Nº do controle" era só a data digitada, ex. 280926; o campo continua
  // guardado no banco, mas não aparece mais).
  function rastRotulo(r){
    r = r || {};
    var d = r.data ? fmtDateBR(r.data) : "sem data";
    var loc = r.blocoPav || (r.pavimentos||[])[0] || "";
    return d + (loc ? " · "+loc : "");
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
  function fmtDateBR(iso){
    if(!iso) return "—";
    var p = iso.split("-"); if(p.length!==3) return iso;
    return p[2]+"/"+p[1]+"/"+p[0];
  }
  // Formata um timestamp ISO completo (com hora) para o rodapé "Última
  // atualização" das fichas — usa o horário local do navegador de quem visualiza.
  function fmtDateTimeBR(iso){
    if(!iso) return "";
    var d = new Date(iso);
    if(isNaN(d)) return "";
    function pad(n){ return String(n).length<2 ? "0"+n : String(n); }
    return pad(d.getHours())+":"+pad(d.getMinutes())+" do dia "+pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear();
  }
  function dowBR(iso){
    if(!iso) return "";
    var d = new Date(iso+"T12:00:00");
    if(isNaN(d)) return "";
    return ["dom","seg","ter","qua","qui","sex","sáb"][d.getDay()];
  }
  function diffMin(a,b){
    if(!a || !b) return null;
    var pa=a.split(":"), pb=b.split(":");
    if(pa.length<2||pb.length<2) return null;
    var ma=(+pa[0])*60+(+pa[1]), mb=(+pb[0])*60+(+pb[1]);
    var d=mb-ma; if(d<0) d+=24*60;
    return d;
  }
  // Linha discreta de rodapé mostrando quem foi a última pessoa a salvar esta
  // ficha/controle e quando — visível ao final do modal de FVS e de Rastreabilidade.
  function lastUpdatedHtml(d){
    // Só aparece depois do primeiro salvamento (é aí que updatedByEmail passa a
    // existir) — numa ficha nova, ainda não salva, não faz sentido mostrar
    // "última atualização" nenhuma.
    if(!d.updatedByEmail) return "";
    var when = fmtDateTimeBR(d.updatedAt);
    if(!when) return "";
    return '<div class="last-updated">Última atualização: '+escapeHtml(d.updatedByEmail)+' às '+when+'</div>';
  }
  function fmtMin(m){
    if(m==null) return "—";
    var h=Math.floor(m/60), r=m%60;
    return (h>0? h+"h ":"")+r+"min";
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
  var fvsRevCol = dbf.collection("fvsRevisoes");
  var minhaAssinatura = null, unsubAssin = null;
  var fvsMap=new Map(), rastMap=new Map(), ctMap=new Map(), plantasMap=new Map();
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
  var VIEW_IDS = { dashboard:"view-dashboard", board:"view-board", pavimento:"view-pavimento", nc:"view-nc", ct:"view-ct", plantas:"view-plantas", aco:"view-aco", cronograma:"view-cronograma" };
  function switchView(nome){
    Object.keys(VIEW_IDS).forEach(function(k){
      var el = document.getElementById(VIEW_IDS[k]);
      if(el) el.hidden = (k!==nome);
    });
    document.querySelectorAll(".nav-btn[data-view], .ti-bn[data-view]").forEach(function(b){
      b.setAttribute("aria-current", b.getAttribute("data-view")===nome ? "page" : "false");
    });
    window.scrollTo(0, 0);
    if(nome==="dashboard") renderViewDashboard();
    else if(nome==="pavimento") renderViewPavimento();
    else if(nome==="nc") renderViewNc();
    else if(nome==="ct") renderViewCt();
    else if(nome==="plantas") renderViewPlantas();
    else if(nome==="aco") renderViewAco(document.getElementById("view-aco"));
    else if(nome==="cronograma") renderViewCronograma(document.getElementById("view-cronograma"));
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
    ctRowsArray().forEach(function(r){
      var loc = (r.local||"").split(/[—-]/)[0].trim() || "sem local";
      CT_IDADES.forEach(function(i){
        var st = ctStatusIdade(r, i), d = r[i.dataCampo];
        var g = null;
        if(st==="pendente") g = grupo("p|"+i.key+"|"+r.dataConcretagem, { tipo:"pendente", idade:i.key, conc:r.dataConcretagem, venc:d });
        else if(st==="aguardando" && (d===hoje || d===amanha)) g = grupo("r|"+i.key+"|"+d, { tipo:"romper", idade:i.key, conc:r.dataConcretagem, venc:d, lab:r.laboratorio });
        if(g){ g.nfs.push(r); g.locais[loc] = 1; }
      });
      if(ctAbaixoFck(r) && !/CONCLU|NC|n[ãa]o conformidade/i.test(r.observacao||"")) out.push({ cat:"ct-fck", prio: 75, icone:"alert", tom:"bad",
        titulo:"Resultado abaixo do fck — NF "+r.notaRemessa, sub:loc+" · 28d "+String(ctMelhor28(r)).replace(".", ",")+" MPa de "+r.fck+" MPa: avaliar NC",
        abrir:{ ct:r._id } });
    });
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
    acoMap.forEach(function(e){
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
    out.sort(function(a,b){ return b.prio - a.prio; });
    return out;
  }
  function acoLajes(){ return acoParaLajes(cronogramaAtual(), Array.from(acoMap.values()), todayISO()); }
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
  function renderViewDashboard(){
    var container = document.getElementById("view-dashboard");
    if(!container) return;

    var totalFvs = fvsMap.size, totalRast = rastMap.size;
    var fvsAbertas = 0;
    fvsMap.forEach(function(f){ if(fvsStatus(f).key==="aberto") fvsAbertas++; });
    var todasNc = todasNaoConformidades();
    var ncAbertas = todasNc.filter(function(i){ return !i.concluida; }).length;
    var ctPendentes = ctRowsArray().filter(ctTemPendencia).length;
    var rastPendentes = 0;
    rastMap.forEach(function(r){ if(rastStatus(r).key==="pendente") rastPendentes++; });

    // v1.3: Início no formato da prévia aprovada — números que levam direto
    // à tela certa e listas do que precisa de atenção hoje.
    var kpiCards = [
      { n:fvsAbertas, l:"FVS em aberto", t:"info", d:totalFvs+" fichas no total", ir:"board", sit:"aberto" },
      { n:ncAbertas, l:"NCs em aberto", t:"nc", d:todasNc.length+" registradas", ir:"nc" },
      { n:ctPendentes, l:"Resultados de CP pendentes", t:"pendente", d:"data de rompimento já passou", ir:"ct", pend:true },
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
    var ctLista = ctRowsArray().filter(ctTemPendencia).slice(0,5).map(function(r){
      var idades = ctIdadesPendentes(r).map(function(x){ return x.key+"d"; }).join(", ");
      return li('data-goto-view="ct" data-ct-pend="1"', "flask", "warn", (r.local||"(sem local)"),
        "NF "+r.notaRemessa+" · "+(r.concreteira||"")+" · concretado "+fmtDateBR(r.dataConcretagem), "falta "+idades, "bad");
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
    var acoLista = proximasEntregas(Array.from(acoMap.values()), hojeAco, 5).map(function(e){
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
    var acoTodas = Array.from(acoMap.values());
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
  var filtrosNc = { pavimento:"", tipo:"", situacao:"todos", destinatario:"" }; // situacao: "todos" | "aberto" | "concluida"

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
  function renderViewNc(){
    var container = document.getElementById("view-nc");
    var rel = buildRelatorioNc();
    var todas = rel.todas, grupos = rel.grupos;

    var abertas = todas.filter(function(i){ return !i.concluida; }).length;
    var concluidas = todas.length - abertas;

    var pavimentoOpcoes = pavimentosCanonicos(buildRows());
    var filtrosHtml = '<div class="pav-filtros">'
      + '<select id="nc-f-pavimento" aria-label="Filtrar por pavimento">'
        + '<option value="">Todos os pavimentos</option>'
        + pavimentoOpcoes.map(function(o){ return '<option value="'+escapeHtml(o.label)+'"'+(filtrosNc.pavimento===o.label?" selected":"")+'>'+escapeHtml(o.label)+'</option>'; }).join("")
      + '</select>'
      + '<select id="nc-f-tipo" aria-label="Filtrar por tipo de FVS">'
        + '<option value="">Todos os tipos de FVS</option>'
        + todosTiposFvs().map(function(t){ return '<option value="'+escapeHtml(t.key)+'"'+(filtrosNc.tipo===t.key?" selected":"")+'>'+escapeHtml(t.titulo)+'</option>'; }).join("")
      + '</select>'
      + '<div class="chips" id="nc-f-situacao" role="group" aria-label="Filtrar por situação da não conformidade">'
        + ['todos::Todas','aberto::Em aberto','concluida::Concluídas'].map(function(opt){
            var parts=opt.split("::"), key=parts[0], label=parts[1];
            return '<button class="chip" data-sit-nc="'+key+'" aria-pressed="'+(filtrosNc.situacao===key)+'">'+label+'</button>';
          }).join("")
      + '</div>'
    + '</div>';

    var resumoHtml = '<div class="pav-resumo-grid">'
      + '<div class="pav-resumo-card"><div class="n">'+todas.length+'</div><div class="l">Não conformidades (filtro atual)</div></div>'
      + '<div class="pav-resumo-card tone-nc"><div class="n">'+abertas+'</div><div class="l">Em aberto</div></div>'
      + '<div class="pav-resumo-card tone-ok"><div class="n">'+concluidas+'</div><div class="l">Concluídas</div></div>'
    + '</div>';

    var corpoHtml;
    if(todas.length===0){
      corpoHtml = '<div class="empty-state"><div class="big">Nenhuma não conformidade encontrada</div><p>Ajuste os filtros acima ou registre não conformidades nas fichas FVS.</p></div>';
    } else {
      corpoHtml = '<div class="pav-lista">' + grupos.map(function(g){
        var abertasG = g.itens.filter(function(i){ return !i.concluida; }).length;
        var concluidasG = g.itens.length - abertasG;
        var linhas = g.itens.length
          ? g.itens.map(function(item){
              var f=item.ficha;
              var statusPill = item.concluida
                ? '<span class="pill concluido"><span class="dot"></span>Concluída</span>'
                : '<span class="pill aberto has-nc"><span class="dot"></span>Em aberto</span>';
              var diasHtml = !item.concluida && item.diasAberto!=null
                ? '<span class="nc-dias">'+item.diasAberto+' dia(s) em aberto</span>'
                : (item.concluida ? '<span class="nc-dias">Concluída em '+escapeHtml(fmtDateBR(item.dataConclusao))+'</span>' : '');
              return '<div class="pav-ficha-row">'
                + '<span class="pav-ficha-cod">'+escapeHtml(f.descricao||f.codigo||"FVS")+' · '+escapeHtml(f.numero||"s/ nº")+'</span>'
                + '<span class="pav-ficha-obra">'+escapeHtml(item.descricao||"(sem descrição)")+'</span>'
                + statusPill
                + diasHtml
                + '</div>';
            }).join("")
          : '<div class="pav-ficha-vazio">Nenhuma não conformidade neste pavimento com os filtros atuais.</div>';
        return '<div class="pav-grupo">'
          + '<div class="pav-grupo-head"><span class="pav-grupo-nome">'+escapeHtml(g.label)+'</span>'
            + '<span class="pav-grupo-count">'+g.itens.length+' NC(s) · '+abertasG+' em aberto · '+concluidasG+' concluída(s)</span></div>'
          + '<div class="pav-grupo-body">'+linhas+'</div>'
          + '</div>';
      }).join("") + '</div>';
    }

    var relatorioHtml = '<div class="nc-relatorio-bar">'
      + '<input type="text" id="nc-f-destinatario" placeholder="Empreiteira / destinatário deste relatório (opcional)" value="'+escapeHtml(filtrosNc.destinatario)+'">'
      + '<button class="btn primary" id="btn-relatorio-nc">Gerar relatório (Word)</button>'
    + '</div>';

    container.innerHTML =
      '<div class="pav-header">'
        + '<button class="btn" id="btn-voltar-nc">← Voltar</button>'
        + '<h2>Não conformidades</h2>'
        + '<span class="pav-total">'+todas.length+' não conformidade(s) encontrada(s)</span>'
      + '</div>'
      + '<p class="view-desc">Todas as não conformidades registradas nas fichas FVS, filtráveis por pavimento, tipo e situação — gere um relatório em Word pra notificar a empreiteira ao final.</p>'
      + filtrosHtml
      + resumoHtml
      + relatorioHtml
      + corpoHtml;

    document.getElementById("btn-voltar-nc").addEventListener("click", hideViewNc);
    document.getElementById("btn-relatorio-nc").addEventListener("click", gerarRelatorioNcWord);
    document.getElementById("nc-f-destinatario").addEventListener("input", function(e){ filtrosNc.destinatario = e.target.value; });
    document.getElementById("nc-f-pavimento").addEventListener("change", function(e){ filtrosNc.pavimento=e.target.value; renderViewNc(); });
    document.getElementById("nc-f-tipo").addEventListener("change", function(e){ filtrosNc.tipo=e.target.value; renderViewNc(); });
    document.getElementById("nc-f-situacao").addEventListener("click", function(e){
      var btn=e.target.closest("[data-sit-nc]"); if(!btn) return;
      filtrosNc.situacao = btn.getAttribute("data-sit-nc");
      renderViewNc();
    });
  }
  function showViewNc(){ switchView("nc"); }
  function hideViewNc(){ switchView("dashboard"); }

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
  var CT_IDADES = [
    {key:"7", dataCampo:"data7", campos:["r7","r7b"]},
    {key:"14", dataCampo:"data14", campos:["r14","r14b"]},
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
  function ctRowConcluidaPorObservacao(row){
    return row.concluida===true || /CONCLU/i.test(row.observacao||"");
  }
  function ctStatusIdade(row, idade){
    var dataPrev = row[idade.dataCampo];
    if(!dataPrev) return "sem-data";
    var saiu = idade.campos.some(function(c){ return ctValorPreenchido(row[c]); });
    if(saiu) return "concluido";
    if(row.concluida===true) return "dispensado";
    if(dataPrev > todayISO()) return "aguardando";
    return ctRowConcluidaPorObservacao(row) ? "dispensado" : "pendente";
  }
  function ctIdadesPendentes(row){
    return CT_IDADES.filter(function(idade){ return ctStatusIdade(row, idade)==="pendente"; });
  }
  function ctTemPendencia(row){ return ctIdadesPendentes(row).length>0; }

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
    rastMap.forEach(function(r, id){
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

      var novos=0, atualizados=0, preservados=0;
      var ops = linhas.map(function(row){
        var id = "nf_"+safeName(row.notaRemessa);
        var existente = ctMap.get(id);
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
          atualizadoPor: currentUserEmail||""
        });
        return { id:id, data:data };
      });
      ctSetStatus("Gravando "+ops.length+" linha(s)…");
      // Grava em lotes (limite de 500 operações por commit no Firestore).
      for(var i=0;i<ops.length;i+=450){
        var chunk = ops.slice(i, i+450);
        var batch = dbf.batch();
        chunk.forEach(function(op){ batch.set(ctCol.doc(op.id), op.data); });
        await batch.commit();
      }
      await ctCol.doc("_meta").set({
        atualizadoEm: nowISO(), // v1.6: entra na sincronização incremental
        ultimaImportacaoEm: nowISO(), ultimaImportacaoPor: currentUserEmail||"",
        ultimoArquivo: file.name||"", ultimoTotalLinhas: linhas.length
      }, {merge:true});

      var modeloOk = true;
      try{ await ctSalvarModelo(file, buf); }catch(exM){ modeloOk = false; console.warn("modelo da planilha:", exM); }
      ctSetStatus(linhas.length+" linha(s) na planilha — "+novos+" nova(s), "+atualizados+" atualizada(s)"
        +(preservados ? "; "+preservados+" valor(es) lançado(s) pelo site mantido(s) (célula vazia na planilha)" : "")+"."
        +(modeloOk ? "" : " (Não consegui guardar a planilha como modelo de exportação.)"), "ok");
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
    for(var i=0;i<partes;i++) await modelosCol.doc("ct_p"+i).set({ dados: b64.slice(i*CT_MODELO_PARTE, (i+1)*CT_MODELO_PARTE) });
    await modelosCol.doc("ct").set({ arquivo:file.name||"", em:nowISO(), por:currentUserEmail||"", partes:partes, bytes:buf.byteLength });
  }
  async function ctCarregarModelo(){
    var meta = await modelosCol.doc("ct").get();
    if(!meta.exists) return null;
    var m = meta.data(), pedacos = [];
    for(var i=0;i<m.partes;i++){
      var p = await modelosCol.doc("ct_p"+i).get();
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
      var regs = ctRowsArray();
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
  var filtrosCt = { busca:"", somentePendentes:false, situacao:"todos", de:"", ate:"", concreteira:"", laboratorio:"", visao:"grupos" };
  function ctRowsArray(){
    var out = [];
    ctMap.forEach(function(d, id){
      if(id==="_meta" || !d || !d.notaRemessa) return;
      out.push(Object.assign({ _id:id }, d));
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
  // Abaixo do fck aos 28 dias E não recuperou aos 63 (ou ainda sem 63 dias).
  // Indicador por resultado individual — a aceitação formal do lote segue o
  // fck estimado da NBR 12655 (Fase 4.3).
  function ctAbaixoFck(row){
    var fck = ctNumero(row.fck), r = ctMelhor28(row);
    if(fck==null || r==null || r >= fck) return false;
    var r63 = ctMelhor63(row);
    return !(r63!=null && r63 >= fck);
  }
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
    { key:"atrasado", label:"Resultado atrasado", teste:ctTemPendencia },
    { key:"semana", label:"Romper em 7 dias", teste:ctRomperEmBreve },
    { key:"abaixo", label:"Abaixo do fck", teste:ctAbaixoFck },
    { key:"recuperou", label:"Atingiu só aos 63d", teste:ctRecuperou63 },
    { key:"aguardando", label:"Aguardando", teste:ctAguardando },
    // v1.8: NF sem rastreabilidade ligada (nem pela NF nas betonadas, nem manual)
    // v1.10: as marcadas "anterior ao sistema" não entram (não há o que ligar)
    { key:"semvinculo", label:"Sem vínculo com rastreabilidade", teste:function(r){ return r.anteriorAoSistema!==true && !ctLigacoes(r).confirmadas.length; } },
    { key:"completo", label:"Completas", teste:function(r){ return !ctTemPendencia(r) && !ctAguardando(r); } }
  ];
  function ctRowsFiltradas(){
    var termo = (filtrosCt.busca||"").trim().toLowerCase();
    var sit = CT_SITUACOES.find(function(s){ return s.key===filtrosCt.situacao; }) || CT_SITUACOES[0];
    return ctRowsArray().filter(function(row){
      if(filtrosCt.somentePendentes && !ctTemPendencia(row)) return false;
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
    var manual = (row.rastreabilidadeId && rastMap.has(row.rastreabilidadeId)) ? [row.rastreabilidadeId] : [];
    var mesmoDia = [];
    if(row.dataConcretagem){
      rastMap.forEach(function(r, id){ if(r.data===row.dataConcretagem) mesmoDia.push(id); });
    }
    var confirmadas = Array.from(new Set(porNota.concat(manual)));
    return { confirmadas:confirmadas, mesmoDia:mesmoDia.filter(function(id){ return confirmadas.indexOf(id)===-1; }), porNota:porNota };
  }
  function ctCelulaResultado(row, campo, idade){
    var v = row[campo];
    var texto = (v==null || v==="") ? "—" : String(v);
    var tone = idade ? ctStatusIdade(row, idade) : "";
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
    var principal = ligadas[0], r = rastMap.get(principal);
    var extra = ligadas.length>1 ? ' <span class="ct-sem-vinculo">+'+(ligadas.length-1)+'</span>' : '';
    return '<td><button type="button" class="ct-rast-link" data-open-rast="'+escapeHtml(principal)+'">Rastr. '+escapeHtml(r ? fmtDateBR(r.data) : "")+'</button>'+extra+'</td>';
  }
  function ctUltimoImportInfo(){
    var meta = ctMap.get("_meta");
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
        + '<th rowspan="2">Data 14 Dias</th>'
        + '<th rowspan="2">Data 28 Dias</th>'
        + '<th rowspan="2">Data 63 Dias</th>'
        + '<th rowspan="2">CPs Conforme</th>'
        + '<th rowspan="2">3 Dias</th>'
        + '<th class="ct-th-group" colspan="2">7 Dias</th>'
        + '<th class="ct-th-group" colspan="2">14 Dias</th>'
        + '<th class="ct-th-group" colspan="2">28 Dias</th>'
        + '<th class="ct-th-group" colspan="2">63 Dias</th>'
        + '<th rowspan="2">Observação</th>'
        + '<th rowspan="2">Rastreabilidade</th>'
      + '</tr>'
      + '<tr>'
        + '<th class="ct-th-sub">7 Dias</th><th class="ct-th-sub">7\' Dias</th>'
        + '<th class="ct-th-sub">14 Dias</th><th class="ct-th-sub">14\' Dias</th>'
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
          + ctCelulaData(row.data14)
          + ctCelulaData(row.data28)
          + ctCelulaData(row.data63)
          + ctCelulaTexto(row.cpsConforme)
          + ctCelulaResultado(row, "r3", null)
          + ctCelulaResultado(row, "r7", CT_IDADES[0]) + ctCelulaResultado(row, "r7b", CT_IDADES[0])
          + ctCelulaResultado(row, "r14", CT_IDADES[1]) + ctCelulaResultado(row, "r14b", CT_IDADES[1])
          + ctCelulaResultado(row, "r28", CT_IDADES[2]) + ctCelulaResultado(row, "r28b", CT_IDADES[2])
          + ctCelulaResultado(row, "r63", CT_IDADES[3]) + ctCelulaResultado(row, "r63b", CT_IDADES[3])
          + ctCelulaTexto(row.concluida===true ? "✓ concluída"+(row.observacao ? " · "+row.observacao : "") : row.observacao, "left")
          + ctCelulaRastreabilidade(row)
        + '</tr>';
      }).join("") : '<tr><td colspan="25" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum traço encontrado com os filtros atuais.</td></tr>')
    + '</tbody></table></div>';
    el.querySelectorAll("[data-open-rast]").forEach(function(btn){
      btn.addEventListener("click", function(e){ e.stopPropagation(); openModal("rast", btn.getAttribute("data-open-rast")); });
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
    rastMap.forEach(function(r){ if(r.data && (!m || r.data < m)) m = r.data; });
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
        + (unicas.length ? '<button type="button" class="btn small primary" data-ct-vinc-unicas>Vincular '+unicas.length+' nota(s) à concretagem do mesmo dia</button>' : '')
      + '</div>'
      + (mostrar.length ? '<div class="ct-vinc-lista">'+mostrar.map(function(x){
          var r = x.r;
          return '<div class="ct-vinc-li"><div class="tx"><b>NF '+escapeHtml(r.notaRemessa)+'</b><small>'+escapeHtml(fmtDateBR(r.dataConcretagem))+' · '+escapeHtml(r.local||"sem local")+'</small></div>'
            + '<div class="bt">'+x.sug.map(function(rid){
                return '<button type="button" class="btn small" data-ct-vinc="'+escapeHtml(r._id)+'|'+escapeHtml(rid)+'" title="Ligar esta NF a esta rastreabilidade">Vincular: '+escapeHtml(rastRotulo(rastMap.get(rid)))+'</button>';
              }).join("")+'<button type="button" class="btn small" data-ct-ant="'+escapeHtml(r._id)+'">Anterior ao sistema</button></div></div>';
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
    var b2 = el.querySelector("[data-ct-vinc-unicas]");
    if(b2) b2.addEventListener("click", function(){
      var l = ctVincAcoes.unicas;
      if(!confirm("Ligar "+l.length+" nota(s) à única concretagem registrada no mesmo dia de cada uma?\n\nConfira depois na ficha da nota; o vínculo pode ser trocado lá.")) return;
      ctGravarLote(l.map(function(x){ return { id:x.r._id, dados:{ rastreabilidadeId:x.sug[0] } }; }), b2);
    });
    el.querySelectorAll("[data-ct-vinc]").forEach(function(b){
      b.addEventListener("click", function(){
        var p = b.getAttribute("data-ct-vinc").split("|");
        ctGravarLote([{ id:p[0], dados:{ rastreabilidadeId:p[1] } }], b);
      });
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
        var batch = dbf.batch();
        alteracoes.slice(i, i+450).forEach(function(a){
          batch.set(ctCol.doc(a.id), Object.assign({}, a.dados, { atualizadoEm:agora, atualizadoPor:currentUserEmail||"", editadoNoSite:true }), { merge:true });
        });
        envios.push(batch.commit());
      }
      var r = await Promise.race([Promise.all(envios).then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
      if(r==="pendente") alert("Sem conexão no momento — as alterações serão enviadas automaticamente quando o sinal voltar. Mantenha o app aberto.");
    }catch(ex){
      console.error(ex);
      if(!(ex && ex.code==="permission-denied" && somenteLeitura)) alert("Não foi possível gravar: "+(ex && ex.message ? ex.message : "erro desconhecido"));
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
    if(filtrosCt.somentePendentes){ filtrosCt.somentePendentes = false; filtrosCt.situacao = "atrasado"; }
    var cont = {}; CT_SITUACOES.forEach(function(s){ cont[s.key] = rows.filter(s.teste).length; });
    var unicos = function(campo){ return Array.from(new Set(rows.map(function(r){ return r[campo]||""; }).filter(Boolean))).sort(); };

    var kpis = '<div class="dash-kpis">'
      + '<button type="button" class="dash-kpi-card tone-nc" data-ct-sit="atrasado"><div class="n">'+cont.atrasado+'</div><div class="l">Resultados atrasados</div><div class="d">data de rompimento já passou</div></button>'
      + '<button type="button" class="dash-kpi-card tone-pendente" data-ct-sit="semana"><div class="n">'+cont.semana+'</div><div class="l">Romper nos próximos 7 dias</div><div class="d">programe o laboratório</div></button>'
      + '<button type="button" class="dash-kpi-card tone-nc" data-ct-sit="abaixo"><div class="n">'+cont.abaixo+'</div><div class="l">Abaixo do fck</div><div class="d">aos 28d e sem recuperar aos 63d · '+cont.recuperou+' atingiram só aos 63d</div></button>'
      + '<button type="button" class="dash-kpi-card tone-ok" data-ct-sit="completo"><div class="n">'+cont.completo+'</div><div class="l">Completas</div><div class="d">de '+rows.length+' nota(s)</div></button>'
    + '</div>';

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
    var filtros = '<div class="ct-filtros">'
      + '<div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
        + '<input type="text" id="ct-f-busca" placeholder="Buscar NF, local, peça, observação…" value="'+escapeHtml(filtrosCt.busca)+'"></div>'
      + '<div class="ct-periodo"><input type="date" id="ct-f-de" value="'+escapeHtml(filtrosCt.de)+'" aria-label="Concretagem a partir de"><span>até</span><input type="date" id="ct-f-ate" value="'+escapeHtml(filtrosCt.ate)+'" aria-label="Concretagem até"></div>'
      + '<select id="ct-f-concreteira" aria-label="Concreteira">'+opt(unicos("concreteira"), filtrosCt.concreteira, "Todas as concreteiras")+'</select>'
      + '<select id="ct-f-laboratorio" aria-label="Laboratório">'+opt(unicos("laboratorio"), filtrosCt.laboratorio, "Todos os laboratórios")+'</select>'
      + '<div class="ct-visao" role="group" aria-label="Visualização">'
        + '<button type="button" class="chip" data-ct-visao="grupos" aria-pressed="'+(filtrosCt.visao!=="tabela")+'">Por data</button>'
        + '<button type="button" class="chip" data-ct-visao="tabela" aria-pressed="'+(filtrosCt.visao==="tabela")+'">Tabela</button>'
      + '</div>'
    + '</div>'
    + '<div class="chips" id="ct-f-situacao" role="group" aria-label="Situação">'
      + CT_SITUACOES.map(function(s){ return '<button type="button" class="chip" data-ct-sit="'+s.key+'" aria-pressed="'+(filtrosCt.situacao===s.key)+'">'+s.label+' <span class="n">'+cont[s.key]+'</span></button>'; }).join("")
    + '</div>';

    container.innerHTML =
      '<div class="pav-header"><button class="btn" id="btn-voltar-ct">← Voltar</button><h2>Controle tecnológico</h2>'
        + '<span class="pav-total">'+rows.length+' nota(s) de concreto</span></div>'
      + '<p class="view-desc">Corpos de prova por nota fiscal (7/14/28/63 dias). Importe a planilha do laboratório ou lance direto aqui; cada nota fica ligada à rastreabilidade da concretagem pela NF e pela data.</p>'
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
    ctMap.forEach(function(r, id){ if(!achado && id!=="_meta" && r && ctNormalizaNota(r.notaRemessa)===alvo) achado = Object.assign({ _id:id }, r); });
    return achado;
  }
  function ctSecaoRastHtml(d, rastId){
    var linhas = (d.linhas||[]);
    if(!linhas.some(function(l){ return String(l.notaFiscal||"").trim(); })) return "";
    var itens = linhas.map(function(l, idx){
      if(!String(l.notaFiscal||"").trim()) return "";
      var c = ctPorNota(l.notaFiscal);
      if(!c && rastId){ ctMap.forEach(function(r, id){ if(!c && r && r.rastreabilidadeId===rastId && ctNormalizaNota(r.notaRemessa)===ctNormalizaNota(l.notaFiscal)) c = Object.assign({ _id:id }, r); }); }
      var cab = '<b>BT '+escapeHtml(l.seq)+'</b> · NF '+escapeHtml(l.notaFiscal);
      if(!c) return '<div class="ct-bt"><div class="ct-bt-id">'+cab+'<small>sem resultado no controle tecnológico</small></div>'
        + '<button type="button" class="btn small" data-ct-lancar="'+idx+'">Lançar no controle tecnológico</button></div>';
      return '<div class="ct-bt" data-ct-nf="'+escapeHtml(c._id)+'" title="Abrir a ficha desta NF"><div class="ct-bt-id">'+cab
        + (ctAbaixoFck(c) ? ' <span class="ct-selo abaixo">abaixo do fck</span>' : (ctTemPendencia(c) ? ' <span class="ct-selo atraso">resultado atrasado</span>' : ''))
        + '<small>fck '+escapeHtml(c.fck==null?"—":c.fck)+' MPa</small></div>'
        + '<div class="ct-idades">'+CT_IDADES.map(function(i){ return ctChipIdade(c, i); }).join("")+'</div></div>';
    }).join("");
    return '<fieldset><legend>Controle tecnológico das notas <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— resultados dos CPs de cada BT, pela nota fiscal</span></legend>'
      + '<div class="ct-bts">'+itens+'</div></fieldset>';
  }

  /* ---- v1.5: visão agrupada por data de concretagem ---- */
  function ctChipIdade(row, idade){
    var st = ctStatusIdade(row, idade);
    var vals = idade.campos.map(function(c){ return row[c]; }).filter(ctValorPreenchido);
    var txt = vals.length ? vals.map(function(v){ var n = ctNumero(v); return n!=null ? String(n).replace(".", ",") : String(v); }).join(" / ")
      : (row[idade.dataCampo] ? fmtDateBR(row[idade.dataCampo]).slice(0,5) : "—");
    var tom = st==="concluido" ? "ok" : (st==="pendente" ? "atraso" : (st==="aguardando" ? "espera" : "nada"));
    if(idade.key==="28" && ctAbaixoFck(row)) tom = "abaixo";
    if(idade.key==="28" && ctRecuperou63(row)) tom = "recuperou";
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
      rastMap.forEach(function(r, id){ if(g.data && r.data===g.data) rasts.push({ id:id, r:r }); });
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
            var feita = r.concluida===true;
            return '<div class="ct-linha'+(feita?" concluida":"")+'" data-ct-abrir="'+escapeHtml(r._id)+'">'
              + '<div class="ct-linha-id"><b>NF '+escapeHtml(r.notaRemessa)+'</b> '+selo+(feita ? ' <span class="ct-selo ok">concluída</span>' : '')+'<small>'+escapeHtml(r.local||"(sem local)")+'</small>'
                + '<small class="ct-linha-meta">fck '+escapeHtml(r.fck==null?"—":r.fck)+' · slump '+escapeHtml(r.slump==null?"—":r.slump)+(r.volume!=null? ' · '+escapeHtml(r.volume)+' m³' : '')+(r.origem==="site"?' · lançada no site':'')+'</small></div>'
              + '<div class="ct-idades">'+CT_IDADES.map(function(i){ return ctChipIdade(r, i); }).join("")+'</div>'
              + '<button type="button" class="btn small ct-concluir" data-ct-concluir="'+escapeHtml(r._id)+'" title="'+(feita?"Reabrir esta nota":"Marcar esta nota como concluída (não cobra mais resultados)")+'">'+(feita?"Reabrir":"✓ Concluir")+'</button>'
            + '</div>';
          }).join("")
      + '</div>';
    }).join("");
    pintarIcones(el);
    el.querySelectorAll("[data-open-rast]").forEach(function(btn){
      btn.addEventListener("click", function(e){ e.stopPropagation(); openModal("rast", btn.getAttribute("data-open-rast")); });
    });
    el.querySelectorAll("[data-ct-concluir]").forEach(function(b){
      b.addEventListener("click", function(e){
        e.stopPropagation();
        var id = b.getAttribute("data-ct-concluir"), r = ctMap.get(id) || {};
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
  var CT_CAMPOS_RESULT = [["r3","3 dias"],["r7","7 dias"],["r7b","7' dias"],["r14","14 dias"],["r14b","14' dias"],["r28","28 dias"],["r28b","28' dias"],["r63","63 dias"],["r63b","63' dias"]];
  // padrao: dados para pré-preencher uma nota NOVA (ex.: vindos da betonada)
  function abrirFichaNf(id, padrao){
    var atual = id ? ctMap.get(id) : null;
    var d = Object.assign({}, atual || Object.assign({ dataConcretagem: todayISO() }, padrao||{}));
    var novo = !atual;
    var ov = document.createElement("div");
    ov.className = "overlay ct-ficha-ov";
    var lig = novo ? { confirmadas:[], mesmoDia:[] } : ctLigacoes(Object.assign({ _id:id }, d));
    var listaRast = function(ids, rotulo){
      if(!ids.length) return "";
      return '<div class="ct-lig"><span>'+rotulo+'</span>'+ids.map(function(rid){
        var r = rastMap.get(rid);
        return '<button type="button" class="ct-rast-link" data-ct-rast="'+escapeHtml(rid)+'"><svg class="ti-i" data-i="truck"></svg>'+escapeHtml(rastRotulo(r))+'</button>';
      }).join("")+'</div>';
    };
    var opcoesVinculo = [];
    rastMap.forEach(function(r, rid){ opcoesVinculo.push({ id:rid, r:r }); });
    opcoesVinculo.sort(function(a,b){ return (b.r.data||"").localeCompare(a.r.data||""); });
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
            + '<div class="field" style="margin-top:10px"><label>Vincular manualmente (quando a NF foi digitada diferente)</label><select data-ctf="rastreabilidadeId"><option value="">— sem vínculo manual —</option>'
              + opcoesVinculo.map(function(x){ return '<option value="'+escapeHtml(x.id)+'"'+(d.rastreabilidadeId===x.id?" selected":"")+'>'+escapeHtml(rastRotulo(x.r))+'</option>'; }).join("")
            + '</select></div>'
            + '<label class="ct-anterior"><input type="checkbox" data-ctf-chk="anteriorAoSistema"'+(d.anteriorAoSistema===true?" checked":"")+'> Concretagem anterior ao sistema — não há rastreabilidade no app para ligar</label></fieldset>')
        + (novo ? '' : '<label class="ct-concluida-chk"><input type="checkbox" data-ctf-chk="concluida"'+(d.concluida===true?" checked":"")+'> <b>Ficha concluída</b> — não cobra mais resultados desta nota'
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
      if(ctAbaixoFck(tmp)){ av.hidden = false; av.className = "ct-aviso-fck"; av.textContent = "⚠ Resultado de 28 dias ("+String(ctMelhor28(tmp)).replace(".", ",")+" MPa) abaixo do fck ("+tmp.fck+" MPa). Registre uma não conformidade e avise o engenheiro."; }
      else if(ctRecuperou63(tmp)){ av.hidden = false; av.className = "ct-aviso-fck leve"; av.textContent = "Abaixo do fck aos 28 dias, mas atingiu aos 63 dias ("+String(ctMelhor63(tmp)).replace(".", ",")+" MPa)."; }
      else av.hidden = true;
    };
    ov.addEventListener("input", atualizarAviso); atualizarAviso();
    var sujo = false; ov.addEventListener("input", function(){ sujo = true; });
    var fechar = function(){ if(sujo && !confirm("Descartar as alterações desta nota?")) return; ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", esc); };
    var esc = function(e){ if(e.key==="Escape") fechar(); };
    document.addEventListener("keydown", esc);
    ov.addEventListener("click", function(e){
      if(e.target===ov || e.target.closest("[data-ct-fechar]")) { fechar(); return; }
      var rb = e.target.closest("[data-ct-rast]");
      if(rb){ var rid = rb.getAttribute("data-ct-rast"); sujo = false; fechar(); openModal("rast", rid); return; }
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
      if(ctMap.has(id)){ alert("A NF "+nota+" já está cadastrada. Ela será aberta para edição."); aoTerminar(); abrirFichaNf(id); return; }
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
    if(!novo) dados.rastreabilidadeId = ler("rastreabilidadeId") || null;
    var chkAnt = ov.querySelector('[data-ctf-chk="anteriorAoSistema"]');
    if(chkAnt) dados.anteriorAoSistema = chkAnt.checked;
    var chkConc = ov.querySelector('[data-ctf-chk="concluida"]');
    if(chkConc) dados.concluida = chkConc.checked;
    dados.notaRemessa = novo ? nota : d.notaRemessa;
    dados.atualizadoEm = nowISO(); dados.atualizadoPor = currentUserEmail||""; dados.editadoNoSite = true;
    if(novo){ dados.criadoEm = nowISO(); dados.origem = "site"; }
    botao.disabled = true; botao.textContent = "Salvando…";
    try{
      var envio = ctCol.doc(id).set(dados, { merge:true });
      var r = await Promise.race([envio.then(function(){ return "ok"; }), new Promise(function(res){ setTimeout(function(){ res("pendente"); }, 10000); })]);
      if(r==="pendente") alert("Sem conexão no momento — a nota será enviada automaticamente quando o sinal voltar. Mantenha o app aberto.");
      aoTerminar();
    }catch(ex){
      console.error(ex);
      alert("Não foi possível salvar a nota: "+(ex && ex.message ? ex.message : "erro desconhecido"));
      botao.disabled = false; botao.textContent = "Salvar";
    }
  }
  function showViewCt(){ switchView("ct"); }
  function hideViewCt(){ switchView("dashboard"); }

  /* ---------------- biblioteca de plantas de forma ---------------- */
  // Tela de cadastro/gestão das plantas reaproveitadas pela ferramenta de
  // mapeamento de concretagem (ver bibliotecaAdicionarPlanta,
  // mapeamentoFieldHtml e mapaPlantasOrdenadas). Cada planta é cadastrada
  // uma única vez aqui — comprimida automaticamente — e depois só é
  // escolhida numa lista dentro de cada rastreabilidade, sem reenviar o PDF.
  function showViewPlantas(){ switchView("plantas"); }
  function hideViewPlantas(){ switchView("dashboard"); }
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
      + '<div class="info"><div class="t">Cadastrar planta de forma (PDF) na biblioteca</div>'
        + '<div class="s">A planta é comprimida automaticamente ao cadastrar, pra ocupar bem menos espaço — depois fica disponível pra escolher em qualquer rastreabilidade, sem precisar reenviar o PDF de novo.</div>'
        + '<div class="hint" id="planta-upload-msg"></div>'
      + '</div>'
      + '<input type="text" id="planta-nova-pavimento" placeholder="Pavimento (ex.: 5º Pavimento Tipo)" style="max-width:220px;">'
      + '<button class="btn primary" id="planta-btn-cadastrar" type="button">Cadastrar planta…</button>'
      + '<input type="file" id="planta-file-input" accept="application/pdf" hidden>'
    + '</div>';

    var resumoHtml = '<div class="pav-resumo-grid">'
      + '<div class="pav-resumo-card"><div class="n">'+lista.length+'</div><div class="l">Plantas cadastradas</div></div>'
    + '</div>';

    var listaHtml;
    if(lista.length===0){
      listaHtml = '<div class="hint">Nenhuma planta cadastrada ainda. Cadastre acima — depois ela aparece pra escolher no mapeamento de concretagem de qualquer rastreabilidade.</div>';
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
        + '<span class="pav-total">'+lista.length+' planta(s)</span>'
      + '</div>'
      + '<p class="view-desc">Plantas de forma cadastradas uma única vez aqui, pra escolher (sem reenviar) na ferramenta de mapeamento de concretagem de qualquer rastreabilidade.</p>'
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
      var pavimento = pavInput ? pavInput.value : "";
      if(msgEl) msgEl.textContent = "Comprimindo e enviando "+f.name+"…";
      try{
        await bibliotecaAdicionarPlanta(f, pavimento);
        renderViewPlantas();
      }catch(ex){
        console.error(ex);
        if(msgEl) msgEl.textContent = "Não foi possível cadastrar "+f.name+": "+(ex&&ex.message?ex.message:"erro desconhecido")+".";
      }
    });
    container.querySelectorAll("[data-rm-planta]").forEach(function(btn){
      btn.addEventListener("click", async function(){
        var id = btn.getAttribute("data-rm-planta");
        if(!confirm("Remover esta planta da biblioteca? Rastreabilidades que já escolheram ela continuam com a planta normalmente, só não vai mais aparecer pra escolher em fichas novas.")) return;
        try{ await plantasCol.doc(id).delete(); renderViewPlantas(); }catch(ex){ console.error(ex); alert("Não foi possível remover: "+(ex&&ex.message?ex.message:"erro desconhecido")); }
      });
    });
  }

  /* ---------------- relatório de não conformidades em .docx (Word) ---------------- */
  // Gera um .docx de verdade (não um .rtf) manipulando o XML do Office Open
  // XML diretamente via JSZip — a mesma técnica já usada pra exportação em
  // Excel deste app, só que pro formato do Word. Isso dá um documento com
  // cara de relatório formal (faixa colorida, tabelas com cabeçalho, cores
  // de situação), que abre no Word sem nenhum aviso de compatibilidade,
  // pronto pra ser enviado a uma empreiteira — com exatamente as não
  // conformidades que batem com os filtros ativos no momento do clique.
  var DOCX_COR_FAIXA = "1A1A1A";   // --accent-strong (identidade Belavista Consórcio: preto/grafite)
  var DOCX_COR_ACCENT = "404040";  // --accent
  var DOCX_COR_RUIM = "AD3A2C";    // --bad
  var DOCX_COR_BOM = "2E7D46";     // --good
  var DOCX_COR_CINZA_CLARO = "F2F2F2";
  var DOCX_COR_BORDA = "BFBFBF";
  var DOCX_LARGURA_UTIL = 9906; // twips (~ A4 menos margens de 1000 twips de cada lado)

  function docxEscape(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function docxRun(text, opts){
    opts = opts||{};
    var rpr = "";
    if(opts.bold) rpr += "<w:b/>";
    if(opts.italic) rpr += "<w:i/>";
    if(opts.color) rpr += '<w:color w:val="'+opts.color+'"/>';
    if(opts.sz) rpr += '<w:sz w:val="'+opts.sz+'"/><w:szCs w:val="'+opts.sz+'"/>';
    var rprXml = rpr ? "<w:rPr>"+rpr+"</w:rPr>" : "";
    var linhas = String(text==null?"":text).split("\n");
    return linhas.map(function(linha, i){
      return (i>0 ? "<w:br/>" : "") + "<w:r>"+rprXml+'<w:t xml:space="preserve">'+docxEscape(linha)+"</w:t></w:r>";
    }).join("");
  }
  function docxPar(text, opts){
    opts = opts||{};
    var ppr = "";
    if(opts.align) ppr += '<w:jc w:val="'+opts.align+'"/>';
    if(opts.shd) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="'+opts.shd+'"/>';
    ppr += '<w:spacing w:before="'+(opts.spacingBefore||0)+'" w:after="'+(opts.spacingAfter!=null?opts.spacingAfter:120)+'"/>';
    if(opts.borderBottom) ppr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="'+opts.borderBottom+'"/></w:pBdr>';
    var run = text==="" ? "" : docxRun(text, opts);
    return "<w:p><w:pPr>"+ppr+"</w:pPr>"+run+"</w:p>";
  }
  function docxCell(innerXml, opts){
    opts = opts||{};
    var tcpr = '<w:tcW w:w="'+opts.width+'" w:type="dxa"/>';
    if(opts.shd) tcpr += '<w:shd w:val="clear" w:color="auto" w:fill="'+opts.shd+'"/>';
    tcpr += '<w:vAlign w:val="'+(opts.vAlign||"center")+'"/>';
    return "<w:tc><w:tcPr>"+tcpr+"</w:tcPr>"+innerXml+"</w:tc>";
  }
  function docxCelTexto(text, width, parOpts, cellOpts){
    var opts = Object.assign({spacingBefore:30, spacingAfter:30}, parOpts||{});
    return docxCell(docxPar(text, opts), Object.assign({width:width}, cellOpts||{}));
  }
  function docxTable(colWidths, rows){
    var totalW = colWidths.reduce(function(a,b){ return a+b; }, 0);
    var grid = colWidths.map(function(w){ return '<w:gridCol w:w="'+w+'"/>'; }).join("");
    var trs = rows.map(function(cells){ return "<w:tr>"+cells.join("")+"</w:tr>"; }).join("");
    var borda = ' w:val="single" w:sz="4" w:space="0" w:color="'+DOCX_COR_BORDA+'"/>';
    return "<w:tbl>"
      + '<w:tblPr><w:tblW w:w="'+totalW+'" w:type="dxa"/>'
      + "<w:tblBorders>"
        + "<w:top"+borda+"<w:left"+borda+"<w:bottom"+borda+"<w:right"+borda
        + "<w:insideH"+borda+"<w:insideV"+borda
      + "</w:tblBorders>"
      + '<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar>'
      + "</w:tblPr>"
      + "<w:tblGrid>"+grid+"</w:tblGrid>"
      + trs
      + "</w:tbl>";
  }
  function docxCabecalhoTabela(labels, widths){
    return labels.map(function(label, i){
      return docxCelTexto(label, widths[i], {bold:true, color:"FFFFFF", sz:17, align:"center"}, {shd:DOCX_COR_FAIXA});
    });
  }

  /* ---------------- fotos/documentos anexados às NCs, embutidos no .docx ----------------
     Cada foto anexada é redimensionada pelo próprio Cloudinary (sem recorte,
     preservando a proporção original, sempre convertida pra JPG — não
     importa o formato original) só pra limitar o tamanho do arquivo: assim
     o Word sempre recebe um JPG de resolução previsível, mesmo que o anexo
     original seja HEIC/PNG/WEBP. No relatório a foto entra em tamanho
     grande — o suficiente pra ser analisada de verdade, não só uma
     miniatura de referência — numa seção própria "Registro fotográfico"
     logo depois da tabela de cada pavimento, e continua clicável, abrindo a
     foto original (em tamanho cheio) no navegador. Documentos que não são
     foto (PDF, etc.) entram como um link com o nome do arquivo — não dá pra
     "desenhar" um PDF como imagem. */
  var DOCX_ANEXO_FOTO_MAX_PX = 1600;
  var DOCX_ANEXO_FOTO_MAX_CX = 5040000; // ~14cm de largura máxima no documento
  var DOCX_ANEXO_FOTO_MAX_CY = 6480000; // ~18cm de altura máxima no documento
  function docxUrlFotoRelatorio(url){
    // c_limit (sem recorte) com largura E altura máximas: o Cloudinary só
    // reduz a imagem (nunca aumenta) até caber nesse quadro, preservando a
    // proporção original — diferente do antigo c_fill, que recortava um
    // quadrado fixo.
    var transform = "c_limit,w_"+DOCX_ANEXO_FOTO_MAX_PX+",h_"+DOCX_ANEXO_FOTO_MAX_PX+",q_auto:good,f_jpg";
    return url.indexOf("/image/upload/")!==-1 ? url.replace("/image/upload/", "/image/upload/"+transform+"/") : url;
  }
  async function docxBaixarComoBlob(url){
    var resp = await fetch(url);
    if(!resp.ok) throw new Error("HTTP "+resp.status);
    return await resp.blob();
  }
  // Mede a foto já baixada (largura/altura reais em pixels) carregando-a
  // numa <img> na própria página — assim dá pra calcular o tamanho de
  // exibição no Word preservando a proporção original (sem esticar/achatar
  // a imagem). Se por algum motivo não conseguir medir, retorna null e o
  // chamador usa um tamanho padrão.
  function docxMedirImagem(blob){
    return new Promise(function(resolve){
      try{
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function(){
          var w = img.naturalWidth||0, h = img.naturalHeight||0;
          URL.revokeObjectURL(url);
          resolve((w&&h) ? {w:w, h:h} : null);
        };
        img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      }catch(ex){ resolve(null); }
    });
  }
  // Calcula o tamanho de exibição (em EMU) da foto no documento, tipo
  // "object-fit: contain" dentro de um quadro máximo de
  // DOCX_ANEXO_FOTO_MAX_CX x DOCX_ANEXO_FOTO_MAX_CY, preservando a proporção
  // real da imagem.
  function docxCalcularExtentImagem(pxW, pxH){
    if(!pxW || !pxH){
      return { cx: DOCX_ANEXO_FOTO_MAX_CX, cy: Math.round(DOCX_ANEXO_FOTO_MAX_CX*0.75) };
    }
    var r = pxW/pxH;
    var cx = DOCX_ANEXO_FOTO_MAX_CX, cy = Math.round(cx/r);
    if(cy > DOCX_ANEXO_FOTO_MAX_CY){ cy = DOCX_ANEXO_FOTO_MAX_CY; cx = Math.round(cy*r); }
    return { cx:cx, cy:cy };
  }
  function docxImagemInlineXml(relId, idNum, nomeAlt, hlinkRelId, cx, cy){
    cx = cx || DOCX_ANEXO_FOTO_MAX_CX;
    cy = cy || Math.round(DOCX_ANEXO_FOTO_MAX_CX*0.75);
    var cNvPr = '<pic:cNvPr id="'+idNum+'" name="'+docxEscape(nomeAlt)+'">'
      + (hlinkRelId ? '<a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:id="'+hlinkRelId+'"/>' : '')
      + '</pic:cNvPr>';
    return '<w:r><w:drawing>'
      + '<wp:inline distT="0" distB="0" distL="0" distR="45720" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
        + '<wp:extent cx="'+cx+'" cy="'+cy+'"/>'
        + '<wp:docPr id="'+idNum+'" name="'+docxEscape(nomeAlt)+'"/>'
        + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
          + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
              + '<pic:nvPicPr>'+cNvPr+'<pic:cNvPicPr/></pic:nvPicPr>'
              + '<pic:blipFill><a:blip r:embed="'+relId+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
              + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            + '</pic:pic>'
          + '</a:graphicData>'
        + '</a:graphic>'
      + '</wp:inline>'
    + '</w:drawing></w:r>';
  }
  function docxParImagem(drawingRunXml, opts){
    opts = opts||{};
    var ppr = '<w:jc w:val="'+(opts.align||"center")+'"/>'
      + '<w:spacing w:before="'+(opts.spacingBefore!=null?opts.spacingBefore:60)+'" w:after="'+(opts.spacingAfter!=null?opts.spacingAfter:200)+'"/>';
    return "<w:p><w:pPr>"+ppr+"</w:pPr>"+drawingRunXml+"</w:p>";
  }
  function docxHyperlinkRunXml(relId, texto, opts){
    opts = opts||{};
    var rpr = '<w:rPr><w:color w:val="'+DOCX_COR_ACCENT+'"/><w:u w:val="single"/>'+(opts.sz?'<w:sz w:val="'+opts.sz+'"/><w:szCs w:val="'+opts.sz+'"/>':'')+'</w:rPr>';
    return '<w:hyperlink r:id="'+relId+'"><w:r>'+rpr+'<w:t xml:space="preserve">'+docxEscape(texto)+'</w:t></w:r></w:hyperlink>';
  }
  // Baixa (melhor esforço) todas as fotos/documentos anexados às NCs do
  // relatório atual, preparando as relações (rels) e os arquivos de mídia
  // que vão dentro do .docx. Uma foto que não pode ser baixada (rede caiu,
  // link expirou etc.) é simplesmente pulada — não trava o relatório
  // inteiro por causa de uma foto só.
  async function docxPrepararAnexosNc(todas){
    var proximoRelId = 2; // rId1 já é usado pelo relacionamento com styles.xml
    var proximoDocPrId = 1;
    var extraRels = [];  // {id, type:"image"|"hyperlink", target}
    var mediaFiles = []; // {name, buffer}
    var anexoInfo = new Map(); // chave "fichaId:idx:ai" -> {relIdImagem?, relIdLink?, docPrId?}
    var tarefas = [];

    todas.forEach(function(item){
      (item.anexos||[]).forEach(function(a, ai){
        var chave = item.fichaId+":"+item.idx+":"+ai;
        if(ncAnexoEhImagem(a)){
          tarefas.push((async function(){
            try{
              var blob = await docxBaixarComoBlob(docxUrlFotoRelatorio(a.url));
              var dims = await docxMedirImagem(blob);
              var extent = docxCalcularExtentImagem(dims&&dims.w, dims&&dims.h);
              var buffer = await blob.arrayBuffer();
              var relIdImg = "rId"+(proximoRelId++);
              var relIdLink = "rId"+(proximoRelId++);
              var nomeArquivo = "image"+mediaFiles.length+".jpg";
              mediaFiles.push({ name:nomeArquivo, buffer:buffer });
              extraRels.push({ id:relIdImg, type:"image", target:"media/"+nomeArquivo });
              extraRels.push({ id:relIdLink, type:"hyperlink", target:a.url });
              anexoInfo.set(chave, { relIdImagem:relIdImg, relIdLink:relIdLink, docPrId:(proximoDocPrId++), cx:extent.cx, cy:extent.cy });
            }catch(ex){
              console.error("relatório NC: não foi possível baixar a foto", a.url, ex);
            }
          })());
        } else {
          var relIdLink2 = "rId"+(proximoRelId++);
          extraRels.push({ id:relIdLink2, type:"hyperlink", target:a.url });
          anexoInfo.set(chave, { relIdLink:relIdLink2 });
        }
      });
    });

    await Promise.all(tarefas);
    return { extraRels:extraRels, mediaFiles:mediaFiles, anexoInfo:anexoInfo };
  }
  // Monta a seção "Registro fotográfico" de um grupo (pavimento): pra cada
  // item que tem foto/documento anexado, imprime um mini-título (ficha +
  // descrição da NC) seguido da(s) foto(s) em tamanho grande — o suficiente
  // pra analisar de verdade os detalhes da não conformidade — e dos links
  // dos documentos que não são foto. Fica separada da tabela principal
  // (que continua enxuta, só com o texto) pra dar espaço de verdade às
  // fotos. Retorna "" se nenhum item do grupo tiver anexo.
  function docxSecaoRegistroFotografico(itens, anexoInfo){
    var partes = "";
    itens.forEach(function(item){
      var algumAnexo = (item.anexos||[]).some(function(a, ai){ return anexoInfo.get(item.fichaId+":"+item.idx+":"+ai); });
      if(!algumAnexo) return;
      var f = item.ficha;
      partes += docxPar("Ficha "+(f.numero||"s/ nº")+" — "+(item.descricao||"—"),
        {bold:true, sz:17, color:DOCX_COR_ACCENT, spacingBefore:160, spacingAfter:80, borderBottom:DOCX_COR_BORDA});
      (item.anexos||[]).forEach(function(a, ai){
        var info = anexoInfo.get(item.fichaId+":"+item.idx+":"+ai);
        if(!info) return; // sem info = download falhou (melhor esforço) ou não tinha url
        if(info.relIdImagem){
          partes += docxParImagem(docxImagemInlineXml(info.relIdImagem, info.docPrId, a.nome||"foto", info.relIdLink, info.cx, info.cy));
          partes += docxPar("Clique na imagem para abrir a foto original em tamanho cheio.", {italic:true, color:"7F7F7F", sz:13, align:"center", spacingBefore:0, spacingAfter:180});
        } else if(info.relIdLink){
          partes += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="160"/></w:pPr>'+docxHyperlinkRunXml(info.relIdLink, "📎 "+(a.nome||"documento"), {sz:16})+'</w:p>';
        }
      });
    });
    if(!partes) return "";
    return docxPar("Registro fotográfico", {bold:true, color:"FFFFFF", shd:DOCX_COR_ACCENT, sz:19, spacingBefore:60, spacingAfter:80}) + partes;
  }
  async function gerarRelatorioNcWord(){
    try{ await garantirLibs(); }catch(ex){ console.error(ex); }
    var rel = buildRelatorioNc();
    var todas = rel.todas;
    var grupos = rel.grupos.filter(function(g){ return g.itens.length>0; });
    var abertas = todas.filter(function(i){ return !i.concluida; }).length;
    var concluidas = todas.length - abertas;

    if(todas.length===0){
      alert("Nenhuma não conformidade encontrada com os filtros atuais — ajuste os filtros antes de gerar o relatório.");
      return;
    }

    // Baixar as fotos anexadas pode levar alguns segundos (depende da
    // internet e de quantas NCs têm foto) — trava o botão nesse meio tempo
    // pra não deixar a pessoa achar que travou ou clicar duas vezes.
    var btnRelatorio = document.getElementById("btn-relatorio-nc");
    var btnRelatorioTextoOriginal = btnRelatorio ? btnRelatorio.textContent : "";
    if(btnRelatorio){ btnRelatorio.disabled = true; btnRelatorio.textContent = "Gerando relatório… (baixando fotos)"; }
    var anexosPreparados;
    try{
      anexosPreparados = await docxPrepararAnexosNc(todas);
    } finally {
      if(btnRelatorio){ btnRelatorio.disabled = false; btnRelatorio.textContent = btnRelatorioTextoOriginal; }
    }
    var extraRelsAnexos = anexosPreparados.extraRels;
    var mediaFilesAnexos = anexosPreparados.mediaFiles;
    var anexoInfoMap = anexosPreparados.anexoInfo;

    var agora = new Date();
    function pad2(n){ return String(n).length<2?"0"+n:String(n); }
    var geradoEm = pad2(agora.getDate())+"/"+pad2(agora.getMonth()+1)+"/"+agora.getFullYear()+" às "+pad2(agora.getHours())+":"+pad2(agora.getMinutes());
    var destinatario = (filtrosNc.destinatario||"").trim();

    var body = "";

    // ---- faixa de cabeçalho (letterhead) ----
    body += docxPar("TRAÇO INTEGRADO", {align:"center", shd:DOCX_COR_FAIXA, color:"FFFFFF", bold:true, sz:40, spacingBefore:120, spacingAfter:20});
    body += docxPar((DEFAULT_OBRA||"").toUpperCase(), {align:"center", shd:DOCX_COR_FAIXA, color:"FFFFFF", sz:19, spacingBefore:0, spacingAfter:120});
    body += docxPar("", {spacingAfter:120});
    body += docxPar("RELATÓRIO DE NÃO CONFORMIDADES", {align:"center", bold:true, color:DOCX_COR_FAIXA, sz:34, spacingAfter:20});
    body += docxPar("Documento para acompanhamento e notificação de não conformidades de execução", {align:"center", italic:true, color:"595959", sz:17, spacingAfter:220});

    // ---- bloco de identificação do documento ----
    var infoLinhas = [["Gerado em", geradoEm], ["Elaborado por", currentUserEmail||"—"]];
    if(destinatario) infoLinhas.push(["Empreiteira / Destinatário", destinatario]);
    infoLinhas.push(["Filtros aplicados", descricaoFiltrosNc()]);
    body += docxTable([2200, DOCX_LARGURA_UTIL-2200], infoLinhas.map(function(par){
      return [
        docxCelTexto(par[0], 2200, {bold:true, sz:17}, {shd:DOCX_COR_CINZA_CLARO, vAlign:"top"}),
        docxCelTexto(par[1], DOCX_LARGURA_UTIL-2200, {sz:17}, {vAlign:"top"})
      ];
    }));
    body += docxPar("", {spacingAfter:160});

    // ---- resumo (total / em aberto / concluídas) ----
    var wResumo = Math.floor(DOCX_LARGURA_UTIL/3);
    body += docxTable([wResumo, wResumo, DOCX_LARGURA_UTIL-2*wResumo], [
      docxCabecalhoTabela(["TOTAL NO RELATÓRIO","EM ABERTO","CONCLUÍDAS"], [wResumo, wResumo, DOCX_LARGURA_UTIL-2*wResumo]),
      [
        docxCelTexto(String(todas.length), wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_FAIXA, spacingBefore:80, spacingAfter:80}),
        docxCelTexto(String(abertas), wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_RUIM, spacingBefore:80, spacingAfter:80}),
        docxCelTexto(String(concluidas), DOCX_LARGURA_UTIL-2*wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_BOM, spacingBefore:80, spacingAfter:80})
      ]
    ]);
    body += docxPar("", {spacingAfter:220});

    // ---- detalhe por pavimento ----
    var wCols = [1500, 3006, 3006, 1100, 1294]; // Ficha / Descrição / Correção / Situação / Dias-Data
    grupos.forEach(function(g, gi){
      var abertasG = g.itens.filter(function(i){ return !i.concluida; }).length;
      var concluidasG = g.itens.length - abertasG;
      body += docxPar(g.label.toUpperCase()+"   ·   "+g.itens.length+" NC(s)   ·   "+abertasG+" em aberto   ·   "+concluidasG+" concluída(s)",
        {bold:true, color:"FFFFFF", shd:DOCX_COR_ACCENT, sz:19, spacingBefore:gi>0?160:0, spacingAfter:80});

      var linhasTabela = [docxCabecalhoTabela(["Ficha","Descrição da NC","Correção proposta","Situação","Dias / Conclusão"], wCols)];
      g.itens.forEach(function(item){
        var f = item.ficha;
        var fichaTxt = (f.descricao||f.codigo||"FVS")+"\nNº "+(f.numero||"s/ nº");
        var sitTxt = item.concluida ? "Concluída" : "Em aberto";
        var sitCor = item.concluida ? DOCX_COR_BOM : DOCX_COR_RUIM;
        var diasTxt = item.concluida
          ? "Concluída em\n"+(item.dataConclusao?fmtDateBR(item.dataConclusao):"—")
          : (item.diasAberto!=null ? item.diasAberto+" dia(s)\nem aberto" : "—");
        linhasTabela.push([
          docxCelTexto(fichaTxt, wCols[0], {sz:16, bold:true}),
          docxCelTexto(item.descricao||"—", wCols[1], {sz:16}),
          docxCelTexto(item.correcao||"—", wCols[2], {sz:16}),
          docxCelTexto(sitTxt, wCols[3], {sz:16, bold:true, color:sitCor, align:"center"}),
          docxCelTexto(diasTxt, wCols[4], {sz:15, align:"center"})
        ]);
      });
      body += docxTable(wCols, linhasTabela);
      body += docxSecaoRegistroFotografico(g.itens, anexoInfoMap);
    });

    // ---- encerramento / recebimento ----
    body += docxPar("", {spacingAfter:260});
    body += docxPar("Recebimento", {bold:true, color:DOCX_COR_FAIXA, sz:22, spacingAfter:140, borderBottom:DOCX_COR_BORDA});
    body += docxPar("Empreiteira / responsável: "+(destinatario||"______________________________________________"), {sz:17, spacingAfter:200});
    body += docxPar("Assinatura: ___________________________________________________     Data: ____ / ____ / ______", {sz:17, spacingAfter:160});
    body += docxPar("Documento gerado automaticamente pelo sistema Traço Integrado, a partir dos registros de campo cadastrados nas fichas FVS.", {italic:true, color:"7F7F7F", sz:14, spacingAfter:0});

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + "<w:body>"
      + body
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
      + "</w:body></w:document>";

    var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + (mediaFilesAnexos.length ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : '')
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + "</Types>";

    var rootRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + "</Relationships>";

    var docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + extraRelsAnexos.map(function(r){
          if(r.type==="image"){
            return '<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="'+docxEscape(r.target)+'"/>';
          }
          return '<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+docxEscape(r.target)+'" TargetMode="External"/>';
        }).join("")
      + "</Relationships>";

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + "</w:styles>";

    var coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + "<dc:title>Relatório de Não Conformidades</dc:title>"
      + "<dc:creator>Traço Integrado</dc:creator>"
      + "</cp:coreProperties>";

    var appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Traço Integrado</Application></Properties>';

    var zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypesXml);
    zip.folder("_rels").file(".rels", rootRelsXml);
    zip.folder("word").file("document.xml", documentXml);
    zip.folder("word").file("styles.xml", stylesXml);
    zip.folder("word/_rels").file("document.xml.rels", docRelsXml);
    zip.folder("docProps").file("core.xml", coreXml);
    zip.folder("docProps").file("app.xml", appXml);
    if(mediaFilesAnexos.length){
      var pastaMedia = zip.folder("word/media");
      mediaFilesAnexos.forEach(function(m){ pastaMedia.file(m.name, m.buffer); });
    }

    zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}).then(function(blob){
      triggerDownload(blob, "Relatorio_NaoConformidades_"+todayISO()+".docx");
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
    // Sem orderBy/limit: o Firestore esconde de uma consulta com orderBy os
    // documentos que não têm o campo ordenado, e o limit(500) cortava os mais
    // antigos sem aviso. A ordenação já é feita na tela (buildRows).
    unsubFvs = fvsCol.onSnapshot(function(snap){
      fvsMap = new Map();
      snap.docs.forEach(function(d){ fvsMap.set(d.id, d.data()); });
      render();
    }, function(err){ setSync("off","erro de sincronização"); console.error(err); });
    unsubRast = rastCol.onSnapshot(function(snap){
      rastMap = new Map();
      snap.docs.forEach(function(d){ rastMap.set(d.id, d.data()); });
      render();
    }, function(err){ setSync("off","erro de sincronização"); console.error(err); });
    // v1.6: Controle Tecnológico em sincronização INCREMENTAL. Ao abrir o app,
    // as notas vêm do cache do aparelho (0 leituras) e só as alteradas desde a
    // última vez são baixadas (atualizadoEm > última). Uma vez por semana, ou
    // num aparelho novo, baixa tudo de novo por segurança.
    var CT_SYNC_KEY = "traco-ct-sync-completa";
    var precisaCompleta = true;
    try{ precisaCompleta = (Date.now() - Number(localStorage.getItem(CT_SYNC_KEY)||0)) > 7*86400000; }catch(ex){}
    ctMap = new Map();
    var tratarCt = function(snap){
      snap.docChanges().forEach(function(ch){
        if(ch.type==="removed"){ if(precisaCompleta) ctMap.delete(ch.doc.id); return; } // no modo incremental, "removed" = só saiu do filtro
        ctMap.set(ch.doc.id, ch.doc.data());
      });
      render();
      // v1.5: rastreabilidade aberta mostra os resultados de CT das suas NFs —
      // atualiza quando chega resultado novo (sem atrapalhar quem está digitando).
      var ae = document.activeElement;
      if(draft && draft.type==="rast" && !document.getElementById("overlay").hidden
        && !(ae && document.getElementById("modal").contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) renderModal();
    };
    var erroCt = function(err){ setSync("off","erro de sincronização"); console.error(err); };
    var escutarCt = function(desde){
      var q = desde ? ctCol.where("atualizadoEm", ">", desde) : ctCol;
      unsubCt = q.onSnapshot(function(snap){
        tratarCt(snap);
        if(!desde && !snap.metadata.fromCache){ try{ localStorage.setItem(CT_SYNC_KEY, String(Date.now())); }catch(ex){} }
      }, erroCt);
    };
    if(precisaCompleta){ escutarCt(null); }
    else {
      ctCol.get({ source:"cache" }).then(function(snap){
        if(!snap.size){ precisaCompleta = true; escutarCt(null); return; }
        var maior = "";
        snap.docs.forEach(function(d){ var x = d.data(); ctMap.set(d.id, x); if(x.atualizadoEm && String(x.atualizadoEm) > maior) maior = String(x.atualizadoEm); });
        render();
        // margem de 2 dias: relógio de outro celular atrasado não faz perder alteração
        var t = Date.parse(maior);
        escutarCt(isNaN(t) ? null : new Date(t - 2*86400000).toISOString());
      }).catch(function(){ precisaCompleta = true; escutarCt(null); });
    }
    if(unsubPlantas) unsubPlantas();
    unsubPlantas = plantasCol.onSnapshot(function(snap){
      plantasMap = new Map();
      snap.docs.forEach(function(d){ plantasMap.set(d.id, d.data()); });
      render();
    }, function(err){ setSync("off","erro de sincronização"); console.error(err); });
    // Aço: se as regras do banco ainda não liberam esta coleção, a tela avisa
    // em vez de marcar o app inteiro como "erro de sincronização".
    if(unsubAco) unsubAco();
    unsubAco = acoCol.onSnapshot(function(snap){
      acoErroAcesso = false;
      acoMap = new Map();
      // v1.12: pedidos na lixeira (excluido:true) ficam no banco, mas fora do app
      snap.docs.forEach(function(d){ var x = d.data(); if(x.excluido!==true) acoMap.set(d.id, Object.assign({ id:d.id }, x)); });
      render();
    }, function(err){ acoErroAcesso = true; console.warn("entregasAco:", err && err.code); render(); });
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
    somenteLeitura = ehSomenteLeitura(currentUserEmail);
    document.body.classList.toggle("somente-leitura", somenteLeitura);
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
    }, function(err){ console.warn("assinaturas:", err && err.code); });
    render();
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
    if(unsubCron){ unsubCron(); unsubCron=null; }
    if(unsubCronProg){ unsubCronProg(); unsubCronProg=null; }
    if(unsubCronEtapas){ unsubCronEtapas(); unsubCronEtapas=null; }
    if(unsubAssin){ unsubAssin(); unsubAssin=null; } minhaAssinatura = null;
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
  function paraFirestore(data){
    var mp = data && data.mapeamento;
    if(mp && Array.isArray(mp.areas)){
      mp.areas = mp.areas.map(function(a){
        return Object.assign({}, a, { pontos: (a.pontos||[]).map(function(p){
          return Array.isArray(p) ? { x:p[0], y:p[1] } : p;
        }) });
      });
    }
    return data;
  }
  function doFirestore(data){
    var mp = data && data.mapeamento;
    if(mp && Array.isArray(mp.areas)){
      mp.areas = mp.areas.map(function(a){
        return Object.assign({}, a, { pontos: (a.pontos||[]).map(function(p){
          return Array.isArray(p) ? p : [p.x, p.y];
        }) });
      });
    }
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
    return { blob:blob, larguraPx:canvas.width, alturaPx:canvas.height };
  }
  // Cadastra uma planta na biblioteca: comprime (ver comprimirPlantaEmImagem
  // acima), envia a imagem já leve pro Cloudinary e grava o registro em
  // /plantas — a partir daí ela aparece pra escolher em qualquer
  // rastreabilidade (ver mapeamentoFieldHtml / mapaPlantasOrdenadas).
  async function bibliotecaAdicionarPlanta(file, pavimento){
    var comp = await comprimirPlantaEmImagem(file);
    var nomeBase = (file.name||"planta").replace(/\.pdf$/i, "");
    var url = await uploadParaCloudinary(comp.blob, nomeBase+".jpg");
    await plantasCol.add({
      nome: nomeBase,
      pavimento: (pavimento||"").trim(),
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
    // v1.15: assinatura / ficha travada
    if(draft.type==="fvs"){
      var bA = m.querySelector("[data-assinar]"); if(bA) bA.addEventListener("click", assinarFvs);
      var bC = m.querySelector("[data-cad-assin]"); if(bC) bC.addEventListener("click", abrirMinhaAssinatura);
      var bR = m.querySelector("[data-nova-rev]"); if(bR) bR.addEventListener("click", novaRevisaoFvs);
      m.classList.toggle("ficha-travada", !!draft.data.travada);
      if(draft.data.travada){
        m.querySelectorAll(".modal-body input, .modal-body select, .modal-body textarea").forEach(function(el){ el.disabled = true; });
        // botões do corpo também (teclado), menos o bloco de assinaturas, o aviso e "abrir rastreabilidade"
        m.querySelectorAll(".modal-body button").forEach(function(el){
          if(!el.closest(".fvs-assin-bloco, .fvs-travada-banner") && el.id!=="open-linked-rast") el.disabled = true;
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
  function fvsAssinaturasFieldHtml(d, id){
    var acoes = "";
    if(!d.travada){
      if(!id) acoes = '<div class="hint">Salve a ficha para poder assinar.</div>';
      else if(!minhaAssinatura) acoes = '<button type="button" class="btn" data-cad-assin>Cadastrar minha assinatura</button>';
      else {
        var papel = minhaAssinatura.papel || "engenheiro";
        var ja = (d.assinaturas||[]).some(function(s){ return s.email===currentUserEmail && s.papel===papel; });
        acoes = ja ? '<div class="hint">Você já assinou esta ficha.</div>'
          : '<button type="button" class="btn primary" data-assinar>Assinar como '+escapeHtml(PAPEIS_ASSIN[papel]||papel)+'</button>'
            + (papel==="engenheiro" ? '<div class="hint" style="margin-top:6px">A assinatura da engenharia fecha e trava a ficha.</div>' : '');
      }
    }
    var hist = (d.historicoRevisoes||[]).length ? '<div class="assin-hist"><b>Revisões anteriores</b>'
      + d.historicoRevisoes.map(function(h){ return '<div>Rev. '+String(h.rev).padStart(2,"0")+' · '+escapeHtml(fmtDateTimeBR(h.em))+' · '+escapeHtml(h.por||"")+' — '+escapeHtml(h.motivo||"")+'</div>'; }).join("")+'</div>' : '';
    return '<fieldset class="fvs-assin-bloco"><legend>Assinaturas</legend>'+assinaturasHtml(d.assinaturas, fmtDateTimeBR)
      + '<div class="assin-acoes-ficha">'+acoes+'</div>'+hist+'</fieldset>';
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
  async function assinarFvs(){
    if(!draft || draft.type!=="fvs" || !draft.id || !minhaAssinatura || draft.data.travada) return;
    var d = draft.data, papel = minhaAssinatura.papel || "engenheiro";
    var ncAbertas = fichaNaoConformidades(d).filter(function(n){ return !n.concluida; }).length;
    var txt = "Assinar a ficha "+(d.codigo||"FVS")+" "+(d.numero||"")+" como "+(PAPEIS_ASSIN[papel]||papel)+"?";
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
    } else if(papel==="tecnico" && !d.inspecionadoPor){ d.inspecionadoPor = minhaAssinatura.nome||""; }
    var ok = await saveDraft(true);
    if(!ok && draft && draft.type==="fvs"){ draft.data = JSON.parse(antes); renderModal(); }
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
      + '<fieldset><legend>Não conformidades</legend>'+ncListFieldHtml(d)+'</fieldset>'
      + '<fieldset><legend>Observações</legend>'+field("","observacoes",d.observacoes,"textarea")+'</fieldset>'
      + '<fieldset><legend>Rastreabilidade de concreto vinculada</legend>'+linkHtml+'</fieldset>'
      + fvsAssinaturasFieldHtml(d, id)
      + lastUpdatedHtml(d)
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
      + '<div class="banner" id="rast-overrun-banner" style="'+(anyOverrun?"":"display:none;")+'">Uma ou mais betonadas excederam o tempo máximo de lançamento (2h30 — NBR 12655). Registre a ação corretiva ao final.</div>'
      + '<fieldset><legend>Identificação</legend><div class="grid2">'
        // v1.4: sem "Nº do controle" — a ficha é identificada por data + pavimento
        + field("Data da concretagem","data",d.data,"date")
        + '<div class="field"><label>Bloco / Pavimento</label><div id="bloco-pav-caixa">'+pavSelectsHtml(d.blocoPav, "", "Selecione o pavimento…")+'</div></div>'
        + '</div><div class="grid3">'
        + field("Obra","obra",d.obra,"text")
        + field("Projeto de referência","projetoReferencia",d.projetoReferencia,"text")
        + field("Slump aprovado","slumpAprovado",d.slumpAprovado,"text","ex.: 12±2cm")
        + '</div><div class="grid3">'
        + field("FCK solicitado","fckSolicitado",d.fckSolicitado,"text","ex.: 30 MPa")
        + '</div></fieldset>'
      + '<fieldset><legend>Pavimentos deste controle</legend>'+pavimentosFieldHtml(d)+'</fieldset>'
      + '<fieldset><legend>Betonadas <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— tempo máx. de lançamento: 2h30</span></legend>'
        + '<div class="lines-wrap"><table class="lines"><thead><tr>'
        + ['Seq','NF','Betoneira','Lacre','Vol. (m³)','Acum. (m³)','Fornecedor','Série CP','Nº CPs','Slump','Saída usina','Chegada obra','Lanç. inicial','Lanç. final','Tempo gasto','Água folga (L)','Água lanç. (L)','Peças concretadas',''].map(function(h){return '<th>'+h+'</th>';}).join("")
        + '</tr></thead><tbody id="linhas-body">'+linhasHtml+'</tbody></table></div>'
        + '<button type="button" class="btn ghost" id="add-line" style="margin-top:10px;">+ Adicionar betonada</button>'
        + '</fieldset>'
      + ctSecaoRastHtml(d, id)
      + '<fieldset><legend>Mapeamento da concretagem <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— demarque na planta onde cada BT foi lançado</span></legend>'
        + mapeamentoFieldHtml(d)
        + '</fieldset>'
      + '<fieldset><legend>Coleta e observações</legend><div class="grid2">'
        + field("Responsável pela coleta","responsavelColeta",d.responsavelColeta,"text")
        + field("Engenheiro responsável","engenheiro",d.engenheiro,"text")
        + '</div>'+field("Observações / ações corretivas","acoesCorretivas",d.acoesCorretivas,"textarea")
        + field("Data de fechamento","dataFechamento",d.dataFechamento,"date")
        + '</fieldset>'
      + '<fieldset><legend>Ficha FVS vinculada</legend>'+linkHtml+'</fieldset>'
      + lastUpdatedHtml(d)
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

  // Monta o rótulo + linha da legenda de uma área demarcada, reaproveitado
  // tanto no HTML inicial do modal quanto na atualização ao vivo (sem
  // recriar o modal inteiro) depois de fechar/remover uma área.
  function mapaLegendaLinhaHtml(a, ai, linhasFicha){
    var linha = (linhasFicha||[]).find(function(l){ return String(l.seq)===String(a.linhaSeq); });
    return '<div class="mapa-legenda-item"><span class="mapa-cor" style="background:'+a.cor+';"></span>'
      + '<span class="mapa-legenda-texto"><span class="mapa-legenda-bt">BT '+escapeHtml(a.linhaSeq)+'</span>'
        + (linha && linha.notaFiscal ? '<span class="mapa-legenda-nf">NF '+escapeHtml(linha.notaFiscal)+'</span>' : '')
      + '</span>'
      + '<button type="button" class="mapa-rm-area" data-rm-area="'+ai+'" title="Remover área">✕</button></div>';
  }
  function mapaLegendaHtml(d){
    var areas = (d.mapeamento && d.mapeamento.areas) || [];
    if(areas.length===0) return '<div class="hint">Nenhuma área demarcada ainda. Toque em "+ Nova área" e marque os cantos do trecho concretado.</div>';
    return '<div class="mapa-legenda">' + areas.map(function(a, ai){ return mapaLegendaLinhaHtml(a, ai, d.linhas); }).join("") + '</div>';
  }
  // Bloco de "mapeamento de concretagem": anexa a planta de forma (PDF) da
  // rastreabilidade e, uma vez anexada, mostra a ferramenta de desenho
  // (canvas com a planta renderizada por pdf.js + um SVG por cima pra
  // marcar as áreas) — ver wireMapeamentoEvents() para toda a interação.
  // Sem PDF ainda: só o botão de anexar. Com PDF: barra de zoom, área de
  // desenho e a legenda das áreas já demarcadas.
  function mapeamentoFieldHtml(d){
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

  /* ---------------- Excel export (SheetJS / xlsx-js-style) ---------------- */
  var THIN={style:"thin",color:{rgb:"BFBFBF"}};
  var BORDER_ALL={top:THIN,bottom:THIN,left:THIN,right:THIN};
  function styleAddr(ws,r,c,style){
    var addr = XLSX.utils.encode_cell({r:r,c:c});
    if(!ws[addr]) ws[addr] = {t:"s", v:""};
    ws[addr].s = Object.assign({}, ws[addr].s||{}, style);
  }
  function safeName(s){ return String(s||"sem_numero").replace(/[^\w-]+/g,"_").slice(0,40); }


  // ---------------------------------------------------------------------------
  // Exportação para Excel — geração via manipulação direta do XML (JSZip), sem
  // passar pelo SheetJS/xlsx-js-style para ler+regravar o arquivo.
  //
  // Por quê: a biblioteca xlsx-js-style (edição gratuita) não preserva bordas,
  // cores de preenchimento nem imagens/desenhos ao ler um arquivo existente e
  // regravá-lo (mesmo pedindo {cellStyles:true}) — foi por isso que a logo da SIG
  // sumia e, mais grave, todo o layout visual (faixas coloridas, bordas da
  // tabela, células mescladas em negrito) saía diferente do modelo oficial.
  //
  // A solução: um arquivo .xlsx é só um .zip com arquivos XML dentro. Em vez de
  // deixar uma biblioteca "reinterpretar" o arquivo, nós abrimos o .zip do
  // modelo oficial (o base64 embutido), pegamos o texto bruto do XML da aba que
  // interessa e da tabela de estilos, e fazemos apenas substituições cirúrgicas
  // nesse texto: escrever o valor de uma célula, ou trocar o índice de estilo de
  // uma célula por um novo estilo (clonado do original, só mudando a cor). Todo
  // o resto do arquivo — bordas, fontes, a logo, os desenhos, a paginação —
  // nunca é tocado, então fica garantidamente idêntico ao modelo.
  // ---------------------------------------------------------------------------

  function xmlEscape(s){
    return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }
  // Escreve um texto numa célula existente (endereço tipo "B4"), preservando o
  // estilo (atributo s="N") que a célula já tinha. Usa t="inlineStr" (texto
  // embutido direto na célula) em vez de shared-strings ou t="str" — mais simples
  // de gerar e 100% aceito tanto pelo Excel quanto pelo LibreOffice.
  function xmlSetCellText(xml, addr, text){
    var re = new RegExp('<c r="'+addr+'"([^>]*?)(/>|>[\\s\\S]*?</c>)');
    var m = re.exec(xml);
    if(!m) return xml;
    var attrs = m[1].replace(/\st="[^"]*"/, "");
    var newCell = '<c r="'+addr+'"'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(text)+'</t></is></c>';
    return xml.slice(0, m.index) + newCell + xml.slice(m.index + m[0].length);
  }
  function xmlGetCellStyleId(xml, addr){
    var re = new RegExp('<c r="'+addr+'"([^>]*?)(?:/>|>)');
    var m = re.exec(xml);
    if(!m) return "0";
    var sm = /\ss="(\d+)"/.exec(m[1]);
    return sm ? sm[1] : "0";
  }
  function xmlSetCellStyleId(xml, addr, newStyleId){
    var re = new RegExp('(<c r="'+addr+'")([^>]*?)((?:/>|>[\\s\\S]*?</c>))');
    return xml.replace(re, function(full, head, attrs, tail){
      attrs = /\ss="\d+"/.test(attrs) ? attrs.replace(/\ss="\d+"/, ' s="'+newStyleId+'"') : (attrs+' s="'+newStyleId+'"');
      return head+attrs+tail;
    });
  }
  function xfParts(xfXml){
    var selfClose = /^<xf\b([^>]*)\/>$/.exec(xfXml);
    if(selfClose) return {attrs: selfClose[1], children: null};
    var open = /^<xf\b([^>]*)>([\s\S]*)<\/xf>$/.exec(xfXml);
    return {attrs: open[1], children: open[2]};
  }
  function xfBuild(attrs, children){
    return children==null ? ('<xf'+attrs+'/>') : ('<xf'+attrs+'>'+children+'</xf>');
  }
  function xfSetAttr(attrs, name, value){
    var re = new RegExp('\\s'+name+'="[^"]*"');
    return re.test(attrs) ? attrs.replace(re, ' '+name+'="'+value+'"') : (attrs+' '+name+'="'+value+'"');
  }
  function getXfByIndex(stylesXml, idx){
    var m = /<cellXfs count="\d+"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
    var list = m[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
    return list[parseInt(idx,10)] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  }
  // Lê o tamanho (<sz val="...">) da fonte de índice fontId em <fonts> do
  // styles.xml — usado para herdar o tamanho de letra já usado na célula
  // original em vez de forçar um tamanho fixo (ver ensureColoredStyle).
  function getFontSizeByFontId(stylesXml, fontId){
    var m = /<fonts count="\d+"[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
    if(!m) return null;
    var list = m[1].match(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g) || [];
    var fontXml = list[parseInt(fontId,10)];
    if(!fontXml) return null;
    var sm = /<sz val="([^"]+)"/.exec(fontXml);
    return sm ? sm[1] : null;
  }
  function bumpBlock(stylesXml, tag, newEntryXml){
    // Alguns modelos convertidos a partir de PDF (LibreOffice) gravam
    // atributos extras nessas tags (ex.: <fonts count="17" x14ac:knownFonts="1">),
    // então o count="N" nem sempre é seguido direto de ">".
    var re = new RegExp('<'+tag+' count="(\\d+)"[^>]*>([\\s\\S]*?)</'+tag+'>');
    var m = re.exec(stylesXml);
    var n = parseInt(m[1],10);
    var newXml = stylesXml.slice(0,m.index) + '<'+tag+' count="'+(n+1)+'">'+m[2]+newEntryXml+'</'+tag+'>' + stylesXml.slice(m.index+m[0].length);
    return {xml:newXml, index:n};
  }
  // Clona o estilo de uma célula (base) trocando só a cor da fonte/preenchimento —
  // usado para marcar visualmente o "X" nas colunas de status do checklist (NA/
  // Aprovado/Reprovado/Reinspecionado) com a mesma cor da legenda impressa.
  // "state" é um objeto {stylesXml, styleCache} compartilhado durante uma
  // exportação inteira, para não duplicar o mesmo estilo repetidas vezes.
  function ensureColoredStyle(state, baseStyleId, fillRgb, fontRgb, fontName){
    fontName = fontName || "Calibri";
    var key = "c|"+baseStyleId+"|"+fillRgb+"|"+fontRgb+"|"+fontName;
    if(state.styleCache[key]!=null) return state.styleCache[key];
    var parts = xfParts(getXfByIndex(state.stylesXml, baseStyleId));
    // Herda o tamanho de fonte que a própria célula já tinha no modelo original,
    // em vez de forçar um tamanho fixo — antes isso deixava as marcações do
    // checklist (P/X/V/NA) menores do que o resto da ficha em quase todos os
    // tipos de FVS, mesmo quando o modelo original usava 12pt/14pt ali.
    var baseFontIdMatch = /\sfontId="(\d+)"/.exec(parts.attrs);
    var baseFontSize = getFontSizeByFontId(state.stylesXml, baseFontIdMatch ? baseFontIdMatch[1] : "0") || "10";
    var r1 = bumpBlock(state.stylesXml, "fonts", '<font><b/><sz val="'+baseFontSize+'"/><color rgb="FF'+fontRgb+'"/><name val="'+xmlEscape(fontName)+'"/></font>');
    state.stylesXml = r1.xml; var newFontId = r1.index;
    var r2 = bumpBlock(state.stylesXml, "fills", '<fill><patternFill patternType="solid"><fgColor rgb="FF'+fillRgb+'"/><bgColor indexed="64"/></patternFill></fill>');
    state.stylesXml = r2.xml; var newFillId = r2.index;
    var attrs = parts.attrs;
    attrs = xfSetAttr(attrs, "fontId", newFontId);
    attrs = xfSetAttr(attrs, "fillId", newFillId);
    attrs = xfSetAttr(attrs, "applyFont", "true");
    attrs = xfSetAttr(attrs, "applyFill", "true");
    var newXf = xfBuild(attrs, parts.children);
    var r3 = bumpBlock(state.stylesXml, "cellXfs", newXf);
    state.stylesXml = r3.xml;
    state.styleCache[key] = r3.index;
    return r3.index;
  }
  // Clona o estilo de uma célula (base) ligando a quebra de linha automática —
  // usado nos campos onde rótulo+valor dividem a mesma célula mesclada (ver
  // explicação em exportRastXlsx) e nos blocos de texto livre da FVS.
  function ensureWrapStyle(state, baseStyleId){
    var key = "w|"+baseStyleId;
    if(state.styleCache[key]!=null) return state.styleCache[key];
    var baseXf = getXfByIndex(state.stylesXml, baseStyleId);
    var parts = xfParts(baseXf);
    var attrs = xfSetAttr(parts.attrs, "applyAlignment", "true");
    var children = parts.children;
    if(children==null){
      children = '<alignment wrapText="true"/>';
    } else if(/<alignment\b[^>]*\/>/.test(children)){
      children = children.replace(/<alignment\b([^>]*)\/>/, function(full,a){
        a = /wrapText="[^"]*"/.test(a) ? a.replace(/wrapText="[^"]*"/,'wrapText="true"') : a+' wrapText="true"';
        return '<alignment'+a+'/>';
      });
    } else if(/<alignment\b[^>]*>[\s\S]*?<\/alignment>/.test(children)){
      children = children.replace(/<alignment\b([^>]*)>/, function(full,a){
        a = /wrapText="[^"]*"/.test(a) ? a.replace(/wrapText="[^"]*"/,'wrapText="true"') : a+' wrapText="true"';
        return '<alignment'+a+'>';
      });
    } else {
      children = '<alignment wrapText="true"/>' + children;
    }
    var newXf = xfBuild(attrs, children);
    var r = bumpBlock(state.stylesXml, "cellXfs", newXf);
    state.stylesXml = r.xml;
    state.styleCache[key] = r.index;
    return r.index;
  }
  function xmlSetRowHeight(xml, rowNum, pts){
    var re = new RegExp('<row r="'+rowNum+'"([^>]*)>');
    var m = re.exec(xml);
    if(!m) return xml;
    var attrs = m[1].replace(/\sht="[^"]*"/, "").replace(/\scustomHeight="[^"]*"/, "");
    attrs += ' ht="'+pts+'" customHeight="true"';
    return xml.slice(0, m.index) + '<row r="'+rowNum+'"'+attrs+'>' + xml.slice(m.index+m[0].length);
  }
  function colRowFromRef(ref){
    var m = /^([A-Z]+)(\d+)$/.exec(ref);
    var col=0; for(var i=0;i<m[1].length;i++) col = col*26 + (m[1].charCodeAt(i)-64);
    return {col:col, row:parseInt(m[2],10)};
  }
  function xmlAddMerge(sheetXml, ref){
    if(new RegExp('<mergeCell ref="'+ref+'"/>').test(sheetXml)) return sheetXml;
    if(/<mergeCells count="(\d+)">/.test(sheetXml)){
      return sheetXml.replace(/<mergeCells count="(\d+)">/, function(full, n){
        return '<mergeCells count="'+(parseInt(n,10)+1)+'">';
      }).replace('</mergeCells>', '<mergeCell ref="'+ref+'"/></mergeCells>');
    } else {
      return sheetXml.replace('</sheetData>', '</sheetData><mergeCells count="1"><mergeCell ref="'+ref+'"/></mergeCells>');
    }
  }
  // O modelo original tem várias linhas mescladas separadamente (uma por linha,
  // pensadas para preenchimento à mão) onde nós precisamos de um único bloco alto
  // para o texto digitado quebrar linha normalmente — remove as mesclagens
  // pequenas dentro do retângulo indicado (linhas/colunas 1-based) antes de
  // adicionar a mesclagem única consolidada com xmlAddMerge.
  function xmlRemoveMergesWithin(sheetXml, r1,c1,r2,c2){
    if(!/<mergeCells /.test(sheetXml)) return sheetXml;
    return sheetXml.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, function(full, n, body){
      var kept = [];
      var re = /<mergeCell ref="([^"]+)"\/>/g, mm;
      while((mm = re.exec(body))){
        var ref = mm[1];
        var parts = ref.split(":");
        var a = colRowFromRef(parts[0]), b = colRowFromRef(parts[1]||parts[0]);
        var inside = (a.row>=r1 && b.row<=r2 && a.col>=c1 && b.col<=c2);
        if(!inside) kept.push(mm[0]);
      }
      if(kept.length===0) return "";
      return '<mergeCells count="'+kept.length+'">'+kept.join("")+'</mergeCells>';
    });
  }
  // O modelo da Rastreabilidade não vem com paginação definida (imprime cortado
  // em várias páginas retrato) — injeta orientação paisagem/ajuste de largura.
  // O modelo da FVS-04 já traz essa configuração certa, então isso é ignorado.
  function xmlAddPageSetupLandscape(sheetXml){
    var xml = sheetXml;
    if(/<pageSetup\b/.test(xml)) return xml;
    if(!/<sheetPr>/.test(xml)){
      xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    }
    var setup = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>';
    if(/<pageMargins[^>]*\/>/.test(xml)){
      xml = xml.replace(/(<pageMargins[^>]*\/>)/, "$1"+setup);
    } else {
      xml = xml.replace("</worksheet>", setup+"</worksheet>");
    }
    return xml;
  }
  function triggerDownload(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- Excel export — modelos oficiais reais ---------------- */
  // Os dois arquivos que o Matheus enviou (FVS-04 e FORM-15) ficam embutidos aqui como
  // base64. Em vez de reconstruir a planilha do zero, abrimos o arquivo original de
  // verdade com o SheetJS e só escrevemos os valores nas células certas — layout,
  // bordas, textos fixos, legenda e numeração de página continuam exatamente como no
  // modelo oficial; só os campos preenchidos pelo usuário entram no lugar certo.
  var FVS_TEMPLATE_B64 = "/modelos/FVS_TEMPLATE_B64.xlsx";
  var RAST_TEMPLATE_B64 = "/modelos/RAST_TEMPLATE_B64.xlsx";

  // Modelos oficiais .xlsx (convertidos a partir dos .xls originais enviados) dos
  // 10 novos tipos de FVS, embutidos como base64 do mesmo jeito que o FVS_TEMPLATE_B64
  // acima — preservam 100% do layout, bordas, cores, logo e paginação originais;
  // exportFvsXlsxFromTemplate() só escreve texto/cor nas células certas.
  var FVS_TPL_locacao_obra = "/modelos/FVS_TPL_locacao_obra.xlsx";
  var FVS_TPL_escavacao = "/modelos/FVS_TPL_escavacao.xlsx";
  var FVS_TPL_estaca_metalica = "/modelos/FVS_TPL_estaca_metalica.xlsx";
  var FVS_TPL_estaca_raiz = "/modelos/FVS_TPL_estaca_raiz.xlsx";
  var FVS_TPL_estaca_helice = "/modelos/FVS_TPL_estaca_helice.xlsx";
  var FVS_TPL_estaca_escavada = "/modelos/FVS_TPL_estaca_escavada.xlsx";
  var FVS_TPL_estaca_franki = "/modelos/FVS_TPL_estaca_franki.xlsx";
  var FVS_TPL_sapata_isolada = "/modelos/FVS_TPL_sapata_isolada.xlsx";
  var FVS_TPL_radier_armado = "/modelos/FVS_TPL_radier_armado.xlsx";
  var FVS_TPL_bloco = "/modelos/FVS_TPL_bloco.xlsx";
  var FVS_TPL_impermeabilizacao_rigida = "/modelos/FVS_TPL_impermeabilizacao_rigida.xlsx";
  var FVS_TPL_montagem_estrutura_metalica = "/modelos/FVS_TPL_montagem_estrutura_metalica.xlsx";
  var FVS_TPL_parede_diafragma = "/modelos/FVS_TPL_parede_diafragma.xlsx";
  var FVS_TPL_cortina_atirantada = "/modelos/FVS_TPL_cortina_atirantada.xlsx";
  var FVS_TPL_preservacao_produto_acabado = "/modelos/FVS_TPL_preservacao_produto_acabado.xlsx";
  var FVS_TPL_protensao_cabos = "/modelos/FVS_TPL_protensao_cabos.xlsx";
  var FVS_TPL_guarda_corpo = "/modelos/FVS_TPL_guarda_corpo.xlsx";

  // Exportação "genérica" para os tipos de FVS novos (Locação, Escavação,
  // Estacas, Sapata, Radier, Bloco) que ainda não têm um modelo .xlsx
  // pixel-perfect embutido — gera uma planilha simples, mas com todos os
  // dados e o resultado do checklist por unidade, para não travar o botão
  // "Exportar Excel" nesses tipos enquanto os modelos oficiais não são
  // replicados (etapa futura).
  // ---------------------------------------------------------------------------
  // Exportação em réplica exata dos modelos oficiais dos 10 novos tipos de FVS.
  //
  // Cada linha de FVS_LAYOUTS abaixo mapeia, célula por célula, onde cada campo
  // do app cai dentro do .xlsx oficial daquele tipo (extraído diretamente dos
  // arquivos .xls originais enviados) — mesma técnica de patch cirúrgico de XML
  // já usada em FVS_TEMPLATE_B64/exportFvsXlsx acima, só que parametrizada para
  // não repetir a lógica 10 vezes. Croquis/desenhos dos modelos (ex.: caixa de
  // "CROQUI" da Locação da Obra) nunca são tocados — ficam em branco, para
  // preencher à mão ou anexar em papel, como o modelo original já previa.
  //
  // "single": ficha sem unidades (ex.: Locação da Obra) — 1 marcação por item,
  //   em itemCells[i] (lista de endereços de célula daquele item; mais de 1
  //   endereço quando o modelo mescla a célula de resposta em várias linhas).
  // "dynamic": ficha com unidades (estacas/sapata/radier/bloco/trecho) — cada
  //   unidade ocupa 1 coluna a partir de startCol; itemRows[i] é a lista de
  //   linhas daquele item (mais de 1 número quando o modelo mescla o texto do
  //   item em várias linhas); unidadesRow é a linha onde o nome de cada unidade
  //   (ex.: "Estaca 3") é escrito, na mesma coluna da marcação.
  function colLetter(n){
    var s="";
    while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
    return s;
  }
  var FVS_LAYOUTS = {
    locacao_obra: {
      b64: FVS_TPL_locacao_obra, mode:"single",
      header: [ {field:"obra", cell:"B4", prefix:"Obra: "}, {field:"local", cell:"H5", prefix:"LOCAL: "} ],
      itemCells: [ ["H7","H8"], ["H9","H10"], ["H11"], ["H12"] ],
      nc: { rows:[17,19], cols:{desc:[2,6], correcao:[7,13], data:[14,17]} },
      obs: { rows:[21,24], cols:[2,17] },
      footer: { row:25, cols:{ inspecionado:[2,5], dataAbertura:[6,8], engenheiro:[9,12], dataFechamento:[13,17] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da FVS: " } }
    },
    escavacao: {
      b64: FVS_TPL_escavacao, mode:"dynamic", startCol:10, unidadesRow:7,
      bannerFix: { removeRegion:[6,10,7,26], newMergeRef:"J6:Z6" },
      header: [ {field:"obra", cell:"B5"}, {field:"local", cell:"J6", prefix:"LOCAL: "} ],
      itemRows: [ [8],[9],[10],[11,12,13],[14],[15],[16] ],
      nc: { rows:[20,24], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
      obs: { rows:[25,32], cols:[1,26] },
      footer: { row:33, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    estaca_metalica: {
      b64: FVS_TPL_estaca_metalica, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [8],[9],[10],[11],[12] ],
      nc: { rows:[17,20], cols:{desc:[1,8], correcao:[9,16], data:[17,25]} },
      obs: { rows:[21,27], cols:[1,25] },
      footer: { row:29, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:null, dataFechamento:[17,25] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", dataFechamento:"Data de fechamento da RVS: " } }
    },
    estaca_raiz: {
      b64: FVS_TPL_estaca_raiz, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J4"} ],
      itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
      nc: { rows:[18,24], cols:{desc:[1,7], correcao:[8,15], data:[16,24]} },
      obs: { rows:[25,31], cols:[1,24] },
      footer: { row:32, cols:{ inspecionado:[1,4], dataAbertura:[5,9], engenheiro:[10,16], dataFechamento:[17,24] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    estaca_helice: {
      b64: FVS_TPL_estaca_helice, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J4"} ],
      itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
      nc: { rows:[18,24], cols:{desc:[1,7], correcao:[8,15], data:[16,24]} },
      obs: { rows:[25,31], cols:[1,24] },
      footer: { row:32, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,16], dataFechamento:[17,24] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    estaca_franki: {
      b64: FVS_TPL_estaca_franki, mode:"dynamic", startCol:13, unidadesRow:6,
      bannerFix: { removeRegion:[6,10,6,26], newMergeRef:"J6:L6" },
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [7],[8],[9],[10],[11],[12] ],
      nc: { rows:[16,20], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
      obs: { rows:[21,27], cols:[1,26] },
      footer: { row:29, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    estaca_escavada: {
      b64: FVS_TPL_estaca_escavada, mode:"dynamic", startCol:13, unidadesRow:6,
      bannerFix: { removeRegion:[6,10,6,26], newMergeRef:"J6:L6" },
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17] ],
      nc: { rows:[21,33], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
      obs: null,
      footer: { row:34, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    sapata_isolada: {
      b64: FVS_TPL_sapata_isolada, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"C4"}, {field:"local", cell:"L4"} ],
      itemRows: [ [8,9],[10],[11],[12],[13],[14],[15],[16,17] ],
      nc: { rows:[20,26], cols:{desc:[1,7], correcao:[8,15], data:[16,23]} },
      obs: { rows:[27,33], cols:[1,23] },
      footer: { row:34, cols:{ inspecionado:[1,5], dataAbertura:[6,9], engenheiro:[10,16], dataFechamento:[17,23] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ASST. ENGENHEIRO DA OBRA", dataFechamento:"Data de fechamento da RVS: " } }
    },
    radier_armado: {
      b64: FVS_TPL_radier_armado, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [8],[9],[10],[11],[12],[13] ],
      nc: { rows:[17,21], cols:{desc:[1,8], correcao:[9,17], data:[18,25]} },
      obs: { rows:[22,28], cols:[1,25] },
      footer: { row:30, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,25] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    bloco: {
      b64: FVS_TPL_bloco, mode:"dynamic", startCol:10, unidadesRow:6,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J5", prefix:"LOCAL: "} ],
      itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17] ],
      nc: { rows:[20,25], cols:{desc:[1,6], correcao:[7,12], data:[13,14]} },
      obs: { rows:[26,33], cols:[1,14] },
      footer: { row:34, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,12], dataFechamento:[13,14] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da FVS: " } }
    },
    impermeabilizacao_rigida: {
      b64: FVS_TPL_impermeabilizacao_rigida, mode:"dynamic", startCol:8, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J5"} ],
      itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
      nc: { rows:[19,22], cols:{desc:[1,6], correcao:[7,15]} },
      obs: { rows:[24,29], cols:[1,15] },
      footer: { row:30, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:null },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO" } }
    },
    montagem_estrutura_metalica: {
      b64: FVS_TPL_montagem_estrutura_metalica, mode:"dynamic", unidadesRow:6,
      unitCols: [ [9,10,11], [13,14], [15,16] ],
      header: [ {field:"obra", cell:"A4", prefix:"OBRA: "}, {field:"local", cell:"K5"} ],
      itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17],[18],[19] ],
      nc: { rows:[24,29], cols:{desc:[1,7], correcao:[8,13], data:[14,17]} },
      obs: { rows:[31,34], cols:[1,17] },
      footer: { row:36, cols:{ inspecionado:[1,4], dataAbertura:[5,9], engenheiro:null, dataFechamento:[14,17] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", dataFechamento:"Data de fechamento da FVS: " } }
    },
    parede_diafragma: {
      b64: FVS_TPL_parede_diafragma, mode:"dynamic", startCol:10, unidadesRow:7,
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15],[16] ],
      nc: { rows:[21,24], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
      obs: { rows:[26,31], cols:[1,26] },
      footer: { row:33, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    cortina_atirantada: {
      b64: FVS_TPL_cortina_atirantada, mode:"dynamic", startCol:10,
      unidadesRow: [ {row:7, prefix:"PAINEL: "}, {row:22, prefix:"TIRANTE Nº "} ],
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J6", prefix:"CORTINA: "} ],
      itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15],[16],[17],[18],[19],[20],[23],[24],[25],[26],[27],[28] ],
      nc: { rows:[33,36], cols:{desc:[1,8], correcao:[9,17], data:[18,22]} },
      obs: { rows:[38,43], cols:[1,22] },
      footer: { row:45, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,22] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    protensao_cabos: {
      b64: FVS_TPL_protensao_cabos, mode:"dynamic", startCol:10, unidadesRow:6,
      bannerFix: { removeRegion:[6,10,6,23] },
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [7,8],[9],[10],[11],[12],[13],[14] ],
      nc: { rows:[18,21], cols:{desc:[1,8], correcao:[9,15], data:[16,23]} },
      obs: { rows:[23,27], cols:[1,23] },
      footer: { row:28, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:[16,23] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    guarda_corpo: {
      b64: FVS_TPL_guarda_corpo, mode:"dynamic", startCol:10, unidadesRow:6,
      bannerFix: { removeRegion:[6,10,6,23] },
      header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
      itemRows: [ [7,8,9,10],[11],[12],[13],[14] ],
      nc: { rows:[18,21], cols:{desc:[1,8], correcao:[9,15], data:[16,23]} },
      obs: { rows:[23,28], cols:[1,23] },
      footer: { row:29, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:[16,23] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    },
    preservacao_produto_acabado: {
      b64: FVS_TPL_preservacao_produto_acabado, mode:"single",
      header: [ {field:"obra", cell:"B5"}, {field:"local", cell:"J6", prefix:"LOCAL: "} ],
      itemCells: [
        ["J8"],["J9"],["J10"],["J11"],["J12"],["J13"],["J14"],["J15"],["J16"],["J17"],
        ["J18"],["J19"],["J20"],["J21"],["J22"],["J23"],["J24"],["J25"],["J26"],["J27"],
        ["J28"],["J29"],["J30"],["J31"],["J32"],["J33"],["J34"],["J35"],["J36"],["J37"]
      ],
      nc: { rows:[41,47], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
      obs: { rows:[49,54], cols:[1,26] },
      footer: { row:55, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
        labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
    }
  };

  var STATUS_FILL_FVS = {NA:"E9E9E4", P:"DDEFE1", X:"F5DEDA", V:"E9E9E7"};
  var STATUS_FONT_FVS = {NA:"666666", P:"1B5E20", X:"8E1B0F", V:"1A1A1A"};
  var STATUS_FONT_NAME_FVS = {NA:"Calibri", P:"Wingdings 2", X:"Calibri", V:"Wingdings 2"};

  function paintMark(sheetXml, state, addrs, v){
    sheetXml = xmlSetCellText(sheetXml, addrs[0], v);
    addrs.forEach(function(addr){
      var base = xmlGetCellStyleId(sheetXml, addr);
      var ns = ensureColoredStyle(state, base, STATUS_FILL_FVS[v], STATUS_FONT_FVS[v], STATUS_FONT_NAME_FVS[v]);
      sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
    });
    return sheetXml;
  }

  function fillChecklistItemsTemplate(sheetXml, state, d, layout, tipoInfo){
    var flat = 0;
    if(layout.mode==="single"){
      tipoInfo.checklist.forEach(function(cat, ci){
        cat.itens.forEach(function(it, ii){
          var key = ci+"-"+ii;
          var v = (d.checklist[key]||{})["_unico"];
          var addrs = layout.itemCells[flat];
          if(v && STATUS_FILL_FVS[v] && addrs) sheetXml = paintMark(sheetXml, state, addrs, v);
          flat++;
        });
      });
    } else {
      var unidades = d.unidades||[];
      // colUnidade: por padrão, cada unidade ocupa 1 coluna a partir de
      // startCol. Modelos com grade irregular (ex.: 3 vãos de largura
      // desigual) podem informar layout.unitCols = [[c1,c2,...], ...] — um
      // grupo de colunas por unidade; usamos sempre a 1ª coluna do grupo
      // (a célula mesclada já cobre visualmente as demais).
      function colUnidade(ui){
        if(layout.unitCols){
          var grp = layout.unitCols[ui];
          return grp ? grp[0] : null;
        }
        return layout.startCol+ui;
      }
      if(layout.unidadesRow){
        // unidadesRow pode ser um único número (padrão) ou uma lista de
        // linhas — cada uma um número, ou {row, prefix} quando o modelo
        // já tem um rótulo impresso na célula (ex.: "PAINEL:", "TIRANTE Nº")
        // e o valor deve ser escrito logo após esse rótulo.
        var uRows = Array.isArray(layout.unidadesRow) ? layout.unidadesRow : [layout.unidadesRow];
        uRows.forEach(function(ur){
          var rowNum = (ur && typeof ur === "object") ? ur.row : ur;
          var prefix = (ur && typeof ur === "object" && ur.prefix) ? ur.prefix : "";
          unidades.forEach(function(u, ui){
            var col = colUnidade(ui);
            if(col==null) return;
            sheetXml = xmlSetCellText(sheetXml, colLetter(col)+rowNum, prefix+u);
          });
        });
      }
      tipoInfo.checklist.forEach(function(cat, ci){
        cat.itens.forEach(function(it, ii){
          var key = ci+"-"+ii;
          var porUnidade = d.checklist[key]||{};
          var rows = layout.itemRows[flat];
          unidades.forEach(function(u, ui){
            var v = porUnidade[u];
            var col = colUnidade(ui);
            if(v && STATUS_FILL_FVS[v] && rows && col!=null){
              var addrs = rows.map(function(r){ return colLetter(col)+r; });
              sheetXml = paintMark(sheetXml, state, addrs, v);
            }
          });
          flat++;
        });
      });
    }
    return sheetXml;
  }

  // Concatena todas as não conformidades da ficha (agora uma lista, ver
  // fichaNaoConformidades()) em texto de múltiplas linhas — o modelo impresso
  // continua tendo só uma área fixa por campo (descrição/correção/data), então
  // em vez de reservar uma linha por não conformidade no layout, cada célula
  // recebe o texto de todas elas, numeradas, separadas por linha em branco.
  function textoNcConcatenado(ncs, campo){
    if(!ncs.length) return "";
    if(ncs.length===1) return ncs[0][campo]||"";
    return ncs.map(function(nc, i){ return (i+1)+") "+(nc[campo]||""); }).join("\n\n");
  }
  // v1.15: última assinatura de cada papel (a da revisão atual) e o texto "assinado em …"
  function assinaturaDoPapel(d, papel){
    return (d.assinaturas||[]).filter(function(s){ return s.papel===papel; }).slice(-1)[0] || null;
  }
  function textoAssinado(d, papel, nome){
    var a = assinaturaDoPapel(d, papel);
    if(!a) return nome||"";
    return (nome||a.nome||"")+(a.crea ? " · "+a.crea : "");
  }
  // linha que vai embaixo do traço de assinatura: "assinado eletronicamente em 08/10/2026 13:53"
  function rodapeAssinado(d, papel){
    var a = assinaturaDoPapel(d, papel);
    if(!a || !a.em) return "";
    var t = new Date(a.em); if(isNaN(t)) return "";
    var z = function(n){ return String(n).padStart(2,"0"); };
    return "\nassinado eletronicamente em "+z(t.getDate())+"/"+z(t.getMonth()+1)+"/"+t.getFullYear()+" "+z(t.getHours())+":"+z(t.getMinutes());
  }
  // imagens das assinaturas para o Excel: inspeção (técnico) e engenharia, nos campos do rodapé
  function assinaturasParaXlsx(d, insp, eng, row){
    var out = [], t = assinaturaDoPapel(d, "tecnico"), e = assinaturaDoPapel(d, "engenheiro");
    if(t && t.imagem && insp) out.push({ imagem:t.imagem, col:insp[0], colFim:insp[1], row:row });
    if(e && e.imagem && eng) out.push({ imagem:e.imagem, col:eng[0], colFim:eng[1], row:row });
    return out;
  }
  function fillNcObsFooterTemplate(sheetXml, state, d, layout){
    var ncs = fichaNaoConformidades(d);
    if(layout.nc && ncs.length){
      var nc = layout.nc;
      [["desc", textoNcConcatenado(ncs,"descricao")], ["correcao", textoNcConcatenado(ncs,"correcao")],
       ["data", ncs.map(function(n){ return n.concluida && n.dataConclusao ? fmtDateBR(n.dataConclusao) : "Em aberto"; }).join("\n")]].forEach(function(pair){
        var cc = nc.cols[pair[0]];
        var addr = colLetter(cc[0])+nc.rows[0];
        sheetXml = xmlSetCellText(sheetXml, addr, pair[1]);
        sheetXml = xmlRemoveMergesWithin(sheetXml, nc.rows[0], cc[0], nc.rows[1], cc[1]);
        sheetXml = xmlAddMerge(sheetXml, addr+":"+colLetter(cc[1])+nc.rows[1]);
        var base = xmlGetCellStyleId(sheetXml, addr);
        var ns = ensureWrapStyle(state, base);
        sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
      });
    }
    if(layout.obs && d.observacoes){
      var obs = layout.obs;
      var addr = colLetter(obs.cols[0])+obs.rows[0];
      sheetXml = xmlSetCellText(sheetXml, addr, d.observacoes);
      sheetXml = xmlRemoveMergesWithin(sheetXml, obs.rows[0], obs.cols[0], obs.rows[1], obs.cols[1]);
      sheetXml = xmlAddMerge(sheetXml, addr+":"+colLetter(obs.cols[1])+obs.rows[1]);
      var base = xmlGetCellStyleId(sheetXml, addr);
      var ns = ensureWrapStyle(state, base);
      sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
    }
    if(layout.footer){
      var f = layout.footer, r = f.row, L = f.labels;
      if(f.cols.inspecionado) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.inspecionado[0])+r, (L.inspecionado||"")+textoAssinado(d, "tecnico", d.inspecionadoPor)+"\n\n___________________________"+rodapeAssinado(d, "tecnico"));
      if(f.cols.dataAbertura) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.dataAbertura[0])+r, (L.dataAbertura||"")+(d.dataAbertura?fmtDateBR(d.dataAbertura):"_______ / _______ / _______"));
      if(f.cols.engenheiro) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.engenheiro[0])+r, (L.engenheiro||"ENGENHEIRO")+": "+textoAssinado(d, "engenheiro", d.engenheiro)+"\n\n__________________________________"+rodapeAssinado(d, "engenheiro"));
      if(f.cols.dataFechamento) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.dataFechamento[0])+r, (L.dataFechamento||"")+(d.dataFechamento?fmtDateBR(d.dataFechamento):"_______/_______/_______"));
    }
    return sheetXml;
  }

  function exportFvsXlsxFromTemplate(d){
    var layout = FVS_LAYOUTS[d.tipo];
    var tipoInfo = getFvsTipo(d.tipo);
    if(!layout || !tipoInfo){ exportFvsXlsxGenerico(d); return; }
    carregarModelo(layout.b64).then(function(zip){
      return Promise.all([
        zip.file("xl/worksheets/sheet1.xml").async("string"),
        zip.file("xl/styles.xml").async("string")
      ]).then(function(res){
        var sheetXml = res[0], stylesXml = res[1];
        var state = { stylesXml: stylesXml, styleCache: {} };

        if(layout.bannerFix){
          // bannerFix pode ser um único ajuste ou uma lista deles (quando mais
          // de uma faixa mesclada precisa ser desfeita antes de liberar as
          // colunas de unidade para escrita individual).
          var fixes = Array.isArray(layout.bannerFix) ? layout.bannerFix : [layout.bannerFix];
          fixes.forEach(function(bf){
            var rr = bf.removeRegion;
            sheetXml = xmlRemoveMergesWithin(sheetXml, rr[0], rr[1], rr[2], rr[3]);
            if(bf.newMergeRef) sheetXml = xmlAddMerge(sheetXml, bf.newMergeRef);
          });
        }

        layout.header.forEach(function(h){
          sheetXml = xmlSetCellText(sheetXml, h.cell, (h.prefix||"")+(d[h.field]||""));
        });

        sheetXml = fillChecklistItemsTemplate(sheetXml, state, d, layout, tipoInfo);
        sheetXml = fillNcObsFooterTemplate(sheetXml, state, d, layout);

        stylesXml = state.stylesXml;
        zip.file("xl/worksheets/sheet1.xml", sheetXml);
        zip.file("xl/styles.xml", stylesXml);
        // v1.15: imagem das assinaturas no rodapé do modelo
        var ft = layout.footer;
        var assinXlsx = ft ? assinaturasParaXlsx(d, ft.cols.inspecionado, ft.cols.engenheiro, ft.row) : [];
        return adicionarAssinaturasXlsx(zip, "xl/worksheets/sheet1.xml", assinXlsx)
          .then(function(){ return zip.generateAsync({type:"blob"}); });
      });
    }).then(function(blob){
      triggerDownload(blob, safeName(tipoInfo.codigo)+"_"+safeName(d.numero)+".xlsx");
    }).catch(function(err){
      console.error("Falha ao exportar FVS ("+d.tipo+"):", err);
      alert("Não foi possível gerar o Excel desta ficha. Tente novamente.");
    });
  }


  function exportFvsXlsxGenerico(d){
    try{
      var tipoInfo = getFvsTipo(d.tipo);
      var isSingle = tipoInfo && tipoInfo.unidades && tipoInfo.unidades.mode==="single";
      var unidades = isSingle ? ["Resultado"] : (d.unidades||[]).slice();

      var rows = [];
      rows.push([(tipoInfo?tipoInfo.codigo+" — "+tipoInfo.titulo:d.codigo+" — "+d.descricao)]);
      rows.push(["Obra", d.obra||"", "Local", d.local||""]);
      rows.push(["Nº da ficha", d.numero||"", "Data de abertura", d.dataAbertura?fmtDateBR(d.dataAbertura):""]);
      rows.push(["Inspecionado por", textoAssinado(d, "tecnico", d.inspecionadoPor)+rodapeAssinado(d, "tecnico").replace("\n"," — "), "Engenheiro responsável", textoAssinado(d, "engenheiro", d.engenheiro)+rodapeAssinado(d, "engenheiro").replace("\n"," — ")]);
      rows.push(["Data de concretagem", d.dataConcretagem?fmtDateBR(d.dataConcretagem):"", "Data de fechamento", d.dataFechamento?fmtDateBR(d.dataFechamento):""]);
      rows.push([]);

      if(!isSingle && unidades.length===0){
        rows.push(["(nenhuma unidade adicionada nesta ficha)"]);
      } else if(tipoInfo){
        rows.push(["Item","Método / Critério","Tolerância"].concat(unidades));
        tipoInfo.checklist.forEach(function(cat, ci){
          if(cat.cat) rows.push([cat.cat]);
          cat.itens.forEach(function(it, ii){
            var key=ci+"-"+ii;
            var porGrupo = d.checklist[key] || {};
            var line = [it.n||"", it.m||"", it.tol||""];
            unidades.forEach(function(u){
              var gk = isSingle ? "_unico" : u;
              line.push(porGrupo[gk] || "");
            });
            rows.push(line);
          });
        });
      }

      rows.push([]);
      var ncsGenerico = fichaNaoConformidades(d);
      if(ncsGenerico.length){
        rows.push(["Não conformidades ("+ncsGenerico.length+")"]);
        ncsGenerico.forEach(function(nc, ni){
          rows.push(["Não conformidade "+(ni+1)+" — descrição", nc.descricao||""]);
          rows.push(["Não conformidade "+(ni+1)+" — correção proposta", nc.correcao||""]);
          rows.push(["Não conformidade "+(ni+1)+" — situação", nc.concluida ? "Concluída em "+(nc.dataConclusao?fmtDateBR(nc.dataConclusao):"") : "Em aberto"]);
        });
      }
      if(d.observacoes) rows.push(["Observações", d.observacoes]);

      var ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{wch:34},{wch:40},{wch:14}].concat(unidades.map(function(){ return {wch:16}; }));
      if(ws["A1"]) ws["A1"].s = {font:{bold:true, sz:13}};
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, safeName(tipoInfo?tipoInfo.codigo:"FVS").slice(0,31));
      var wbout = XLSX.write(wb, {bookType:"xlsx", type:"array"});
      triggerDownload(new Blob([wbout], {type:"application/octet-stream"}), "FVS_"+safeName(d.codigo)+"_"+safeName(d.numero)+".xlsx");
    }catch(err){
      console.error("Falha ao exportar FVS (tipo novo):", err);
      alert("Não foi possível gerar o Excel desta ficha. Tente novamente.");
    }
  }

  function exportFvsXlsx(d){
    if(d.tipo && d.tipo!=="fvs04"){
      if(FVS_LAYOUTS[d.tipo]) exportFvsXlsxFromTemplate(d); else exportFvsXlsxGenerico(d);
      return;
    }
    carregarModelo(FVS_TEMPLATE_B64).then(function(orig){
      var sheetFile = "xl/worksheets/sheet3.xml"; // aba "FVS 04" do modelo oficial (as outras 2 abas são exemplos, descartadas abaixo)
      return Promise.all([
        orig.file(sheetFile).async("string"),
        orig.file("xl/worksheets/_rels/sheet3.xml.rels").async("string"),
        orig.file("xl/styles.xml").async("string"),
        orig.file("xl/theme/theme1.xml").async("string"),
        orig.file("xl/drawings/drawing3.xml").async("string"),
        orig.file("xl/drawings/_rels/drawing3.xml.rels").async("string"),
        orig.file("xl/media/image2.png").async("uint8array"),
        orig.file("xl/sharedStrings.xml").async("string")
      ]).then(function(res){
        var sheetXml = res[0], sheetRelsXml = res[1], stylesXml = res[2], themeXml = res[3],
            drawingXml = res[4], drawingRelsXml = res[5], imageBytes = res[6], sharedStringsXml = res[7];
        var state = { stylesXml: stylesXml, styleCache: {} };

        sheetXml = xmlSetCellText(sheetXml, "B4", (d.obra||"") + (d.numero ? "   |   Nº da ficha: "+d.numero : ""));
        sheetXml = xmlSetCellText(sheetXml, "L5", (d.local||"") + (d.dataConcretagem ? "   |   Concretagem: "+fmtDateBR(d.dataConcretagem) : ""));

        // O modelo reserva 5 blocos de colunas ao lado de cada item do checklist
        // (cabeçalho "LOCAL:" na linha 6) — um por elemento estrutural. Cada
        // bloco recebe seu cabeçalho fixo, e cada item do checklist é marcado
        // com o resultado (NA/Aprovado/Reprovado/Reinspecionado, mesma cor da
        // legenda impressa) só nos elementos marcados nesta ficha — os demais
        // ficam em branco. Como cada bloco é uma mesclagem (ex: J6:L6), o estilo
        // novo é aplicado em todas as colunas por trás dela, não só na primeira.
        var STATUS_FILL = {NA:"E9E9E4", P:"DDEFE1", X:"F5DEDA", V:"E9E9E7"};
        var STATUS_FONT = {NA:"666666", P:"1B5E20", X:"8E1B0F", V:"1A1A1A"};
        // A legenda impressa do modelo oficial não usa a letra "P" nem "V" como
        // texto comum — ela usa esses mesmos caracteres só que na fonte "Wingdings
        // 2", que troca o glifo por um símbolo (✓ para aprovado, e o símbolo de
        // reinspecionado/aprovado). Para a marcação do checklist bater com a
        // legenda, usamos a mesma fonte nesses dois casos; NA e X continuam em
        // texto normal (Calibri), igual à legenda também os mostra.
        var STATUS_FONT_NAME = {NA:"Calibri", P:"Wingdings 2", X:"Calibri", V:"Wingdings 2"};

        FVS_ELEMENTOS.forEach(function(el){
          sheetXml = xmlSetCellText(sheetXml, el.cols[0]+"6", el.label.toUpperCase());
        });

        var flat = 0;
        FVS_CHECKLIST.forEach(function(cat, ci){
          cat.itens.forEach(function(it, ii){
            var row = 7 + flat; // linha 7 do modelo = primeiro item do checklist
            var key = ci+"-"+ii;
            var porElemento = d.checklist[key] || {};
            FVS_ELEMENTOS.forEach(function(el){
              if(!(d.elementos||{})[el.key]) return; // elemento não avaliado nesta ficha — coluna fica em branco
              var v = porElemento[el.key];
              if(!v || !STATUS_FILL[v]) return;
              var cols = el.cols;
              sheetXml = xmlSetCellText(sheetXml, cols[0]+row, v);
              cols.forEach(function(col){
                var addr = col+row;
                var baseStyle = xmlGetCellStyleId(sheetXml, addr);
                var newStyle = ensureColoredStyle(state, baseStyle, STATUS_FILL[v], STATUS_FONT[v], STATUS_FONT_NAME[v]);
                sheetXml = xmlSetCellStyleId(sheetXml, addr, newStyle);
              });
            });
            flat++;
          });
        });

        // O modelo traz o bloco de não-conformidade/observação pré-dividido em
        // várias mesclagens pequenas (uma por linha, pensadas para preenchimento à
        // mão) — troca por uma mesclagem única alta, com quebra de linha, para o
        // texto digitado caber e alinhar como no restante do sistema.
        var ncsFvs04 = fichaNaoConformidades(d);
        if(ncsFvs04.length){
          sheetXml = xmlSetCellText(sheetXml, "A29", textoNcConcatenado(ncsFvs04,"descricao"));
          sheetXml = xmlSetCellText(sheetXml, "I29", textoNcConcatenado(ncsFvs04,"correcao"));
          sheetXml = xmlSetCellText(sheetXml, "R29", ncsFvs04.map(function(n){ return n.concluida && n.dataConclusao ? fmtDateBR(n.dataConclusao) : "Em aberto"; }).join("\n"));
          sheetXml = xmlRemoveMergesWithin(sheetXml, 29,1,33,8);
          sheetXml = xmlAddMerge(sheetXml, "A29:H33");
          sheetXml = xmlRemoveMergesWithin(sheetXml, 29,9,33,17);
          sheetXml = xmlAddMerge(sheetXml, "I29:Q33");
          sheetXml = xmlRemoveMergesWithin(sheetXml, 29,18,33,25);
          sheetXml = xmlAddMerge(sheetXml, "R29:Y33");
          ["A29","I29","R29"].forEach(function(addr){
            var baseStyle = xmlGetCellStyleId(sheetXml, addr);
            var newStyle = ensureWrapStyle(state, baseStyle);
            sheetXml = xmlSetCellStyleId(sheetXml, addr, newStyle);
          });
        }

        if(d.observacoes){
          sheetXml = xmlSetCellText(sheetXml, "A35", d.observacoes);
          sheetXml = xmlRemoveMergesWithin(sheetXml, 35,1,41,25);
          sheetXml = xmlAddMerge(sheetXml, "A35:Y41");
          var baseStyleObs = xmlGetCellStyleId(sheetXml, "A35");
          var newStyleObs = ensureWrapStyle(state, baseStyleObs);
          sheetXml = xmlSetCellStyleId(sheetXml, "A35", newStyleObs);
        }

        sheetXml = xmlSetCellText(sheetXml, "A42", " Inspecionado por: "+textoAssinado(d, "tecnico", d.inspecionadoPor)+"\n\n___________________________"+rodapeAssinado(d, "tecnico"));
        sheetXml = xmlSetCellText(sheetXml, "F42", "Data de abertura da FVS: \n\n"+(d.dataAbertura ? fmtDateBR(d.dataAbertura) : "_______ / _______ / _______"));
        sheetXml = xmlSetCellText(sheetXml, "K42", "ENGENHEIRO: "+textoAssinado(d, "engenheiro", d.engenheiro)+"\n\n__________________________________"+rodapeAssinado(d, "engenheiro"));
        sheetXml = xmlSetCellText(sheetXml, "S42", "Data de fechamento da FVS: \n\n"+(d.dataFechamento ? fmtDateBR(d.dataFechamento) : "_______/_______/_______"));

        stylesXml = state.stylesXml;

        // O arquivo original traz 3 abas (2 são exemplos preenchidos de outra
        // obra); montamos um pacote .xlsx novo e mínimo contendo só a aba "FVS 04"
        // preenchida — reaproveitando sem qualquer alteração os arquivos internos
        // de estilo, tema, logo e tabela de textos do modelo oficial.
        var out = new JSZip();
        out.file("[Content_Types].xml",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
          '<Default Extension="xml" ContentType="application/xml"/>'+
          '<Default Extension="png" ContentType="image/png"/>'+
          '<Default Extension="jpeg" ContentType="image/jpeg"/>'+
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
          '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
          '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+
          '<Override PartName="/xl/drawings/drawing3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'+
          '</Types>');
        out.file("_rels/.rels",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
          '</Relationships>');
        out.file("xl/workbook.xml",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
          '<sheets><sheet name="FVS 04" sheetId="1" r:id="rId1"/></sheets></workbook>');
        out.file("xl/_rels/workbook.xml.rels",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>'+
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'+
          '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'+
          '</Relationships>');
        out.file(sheetFile, sheetXml);
        out.file("xl/worksheets/_rels/sheet3.xml.rels", sheetRelsXml);
        out.file("xl/styles.xml", stylesXml);
        out.file("xl/theme/theme1.xml", themeXml);
        out.file("xl/drawings/drawing3.xml", drawingXml);
        out.file("xl/drawings/_rels/drawing3.xml.rels", drawingRelsXml);
        out.file("xl/media/image2.png", imageBytes);
        out.file("xl/sharedStrings.xml", sharedStringsXml);

        // v1.15: imagem das assinaturas nos campos "Inspecionado por" (A42:E42) e "ENGENHEIRO" (K42:R42)
        return adicionarAssinaturasXlsx(out, sheetFile, assinaturasParaXlsx(d, [1,5], [11,18], 42))
          .then(function(){ return out.generateAsync({type:"blob"}); });
      });
    }).then(function(blob){
      triggerDownload(blob, "FVS_"+safeName(d.codigo)+"_"+safeName(d.numero)+".xlsx");
    }).catch(function(err){
      console.error("Falha ao exportar FVS:", err);
      alert("Não foi possível gerar o Excel da FVS. Tente novamente.");
    });
  }

  function exportRastXlsx(d){
    carregarModelo(RAST_TEMPLATE_B64).then(function(zip){
      return Promise.all([
        zip.file("xl/worksheets/sheet1.xml").async("string"),
        zip.file("xl/styles.xml").async("string")
      ]).then(function(res){
        var sheetXml = res[0], stylesXml = res[1];
        var state = { stylesXml: stylesXml, styleCache: {} };

        sheetXml = xmlSetCellText(sheetXml, "N1", "NOME DA OBRA: "+(d.obra||""));
        sheetXml = xmlSetCellText(sheetXml, "U1", (d.blocoPav ? "  "+d.blocoPav : ""));
        sheetXml = xmlSetCellText(sheetXml, "D2", "Projeto de Referência: "+(d.projetoReferencia||""));
        sheetXml = xmlSetCellText(sheetXml, "J2", "Slump (aprovado pela obra): "+(d.slumpAprovado||""));
        sheetXml = xmlSetCellText(sheetXml, "L2", "FCK solicitado: "+(d.fckSolicitado||""));
        // Rótulo+valor na mesma célula mesclada — o modelo não reserva uma célula
        // em branco ao lado para o valor (pensado para preenchimento à mão, mais
        // curto). Ativar quebra de linha e aumentar a altura das linhas 1 e 2 evita
        // que o texto digitado pelo sistema corte ou sobreponha a célula vizinha.
        ["N1","U1","D2","J2","L2"].forEach(function(addr){
          var baseStyle = xmlGetCellStyleId(sheetXml, addr);
          var newStyle = ensureWrapStyle(state, baseStyle);
          sheetXml = xmlSetCellStyleId(sheetXml, addr, newStyle);
        });
        sheetXml = xmlSetRowHeight(sheetXml, 1, 34); // linha 1
        sheetXml = xmlSetRowHeight(sheetXml, 2, 46); // linha 2

        var ROWS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]; // 17 betonadas no modelo impresso
        (d.linhas||[]).slice(0, ROWS.length).forEach(function(l, idx){
          var r = ROWS[idx];
          var gasto = diffMin(l.saidaUsina, l.lancFinal);
          var over = gasto!=null && gasto>TEMPO_MAX_MIN;
          sheetXml = xmlSetCellText(sheetXml, "A"+r, l.seq||"");
          sheetXml = xmlSetCellText(sheetXml, "C"+r, l.notaFiscal||"");
          sheetXml = xmlSetCellText(sheetXml, "D"+r, l.betoneira||"");
          sheetXml = xmlSetCellText(sheetXml, "E"+r, l.lacre||"");
          sheetXml = xmlSetCellText(sheetXml, "F"+r, l.volBetoneira||"");
          sheetXml = xmlSetCellText(sheetXml, "G"+r, l.volAcumulado||"");
          sheetXml = xmlSetCellText(sheetXml, "H"+r, l.fornecedor||"");
          sheetXml = xmlSetCellText(sheetXml, "I"+r, l.nSerieCP||"");
          sheetXml = xmlSetCellText(sheetXml, "J"+r, l.nCPs||"");
          sheetXml = xmlSetCellText(sheetXml, "K"+r, l.slump||"");
          sheetXml = xmlSetCellText(sheetXml, "L"+r, l.saidaUsina||"");
          sheetXml = xmlSetCellText(sheetXml, "M"+r, l.chegadaObra||"");
          sheetXml = xmlSetCellText(sheetXml, "N"+r, l.lancInicial||"");
          sheetXml = xmlSetCellText(sheetXml, "O"+r, l.lancFinal||"");
          sheetXml = xmlSetCellText(sheetXml, "P"+r, fmtMin(gasto));
          if(over){
            var baseStyle = xmlGetCellStyleId(sheetXml, "P"+r);
            var newStyle = ensureColoredStyle(state, baseStyle, "F5DEDA", "8E1B0F");
            sheetXml = xmlSetCellStyleId(sheetXml, "P"+r, newStyle);
          }
          sheetXml = xmlSetCellText(sheetXml, "Q"+r, l.aguaFolga||"");
          sheetXml = xmlSetCellText(sheetXml, "R"+r, l.aguaLanc||"");
          sheetXml = xmlSetCellText(sheetXml, "S"+r, l.pecas||"");
        });

        sheetXml = xmlSetCellText(sheetXml, "L23", d.acoesCorretivas||"");
        // A célula já vem com quebra de linha automática no próprio modelo
        // (herdada do estilo original), mas a linha 23 é fixada em só 9pt de
        // altura — o suficiente para uma anotação curta feita à mão, mas não
        // para um texto de observações/ações corretivas mais longo digitado
        // no sistema, que ficaria cortado visualmente mesmo com a quebra
        // ligada. Aumenta só a altura dessa linha quando o texto não cabe,
        // sem tocar em colunas, mesclagens ou qualquer outro elemento do
        // layout da planilha.
        if(d.acoesCorretivas && d.acoesCorretivas.length > 40){
          var linhasEstimadasL23 = Math.ceil(d.acoesCorretivas.length / 70);
          var alturaL23 = Math.min(90, Math.max(9, linhasEstimadasL23 * 13));
          sheetXml = xmlSetRowHeight(sheetXml, 23, alturaL23);
        }
        if(d.dataFechamento) sheetXml = xmlSetCellText(sheetXml, "B25", fmtDateBR(d.dataFechamento));
        sheetXml = xmlSetCellText(sheetXml, "E25", "RESPONSÁVEL PELA COLETA DOS DADOS (LETRA DE FORMA): "+(d.responsavelColeta||""));
        sheetXml = xmlSetCellText(sheetXml, "S25", "  "+(d.engenheiro||""));
        var baseStyleE25 = xmlGetCellStyleId(sheetXml, "E25");
        var newStyleE25 = ensureWrapStyle(state, baseStyleE25);
        sheetXml = xmlSetCellStyleId(sheetXml, "E25", newStyleE25);
        sheetXml = xmlSetRowHeight(sheetXml, 25, 34); // linha 25

        sheetXml = xmlAddPageSetupLandscape(sheetXml);

        stylesXml = state.stylesXml;
        zip.file("xl/worksheets/sheet1.xml", sheetXml);
        zip.file("xl/styles.xml", stylesXml);

        return zip.generateAsync({type:"blob"});
      });
    }).then(function(blob){
      triggerDownload(blob, "Rastreabilidade_"+(d.data||"sem_data")+"_"+safeName(d.blocoPav||"").slice(0,30)+".xlsx");
    }).catch(function(err){
      console.error("Falha ao exportar Rastreabilidade:", err);
      alert("Não foi possível gerar o Excel de Rastreabilidade. Tente novamente.");
    });
  }


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
      if(caixaBloco) caixaBloco.addEventListener("change", function(){
        draft.data.blocoPav = lerPavSelects(caixaBloco, draft.data.blocoPav);
      });
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
    }

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
      if(!confirm("Excluir definitivamente este registro?")) return;
      var d = draft;
      var col = d.type==="fvs" ? fvsCol : rastCol;
      try{
        await col.doc(d.id).delete();
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
      mp.tipo = p.tipo || "imagem";
      mp.pagina = 1;
      mp.areas = [];
      renderModal();
    });

    if(!mp.plantaUrl) return; // sem planta ainda, nada mais a fazer aqui

    carregarPlantaNoCanvas(m);

    var btnExportarPng = m.querySelector("#mapa-exportar-png");
    if(btnExportarPng) btnExportarPng.addEventListener("click", function(){ exportarMapeamentoPng(m); });

    // Remover a planta desta rastreabilidade (e as áreas marcadas nela).
    var btnRemoverPlanta = m.querySelector("#mapa-remover-planta");
    if(btnRemoverPlanta) btnRemoverPlanta.addEventListener("click", function(){
      var n = (mp.areas||[]).length;
      if(!confirm("Remover a planta desta rastreabilidade?"+(n ? "\n\nAs "+n+" área(s) demarcadas nela também serão removidas." : "")+"\n\nA alteração só vale depois de Salvar.")) return;
      draft.data.mapeamento = blankMapeamento();
      renderModal();
    });

    // Editor em tela cheia: zoom de verdade, arrastar, e salva cada área na hora.
    function abrirEditor(){
      var d = draft;
      abrirEditorMapa({
        mapeamento: d.data.mapeamento,
        linhas: function(){ return d.data.linhas || []; },
        cor: mapaCorSequencia,
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
      var alvoPx = 2000; // largura-alvo (px) do render, pra ficar nítido ao dar zoom
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

    ((draft.data.mapeamento && draft.data.mapeamento.areas) || []).forEach(function(a){
      if(!a.pontos || a.pontos.length<3) return;
      var poly = document.createElementNS(ns, "polygon");
      poly.setAttribute("points", a.pontos.map(pt).join(" "));
      poly.setAttribute("fill", a.cor);
      poly.setAttribute("fill-opacity", "0.32");
      poly.setAttribute("stroke", a.cor);
      poly.setAttribute("stroke-width", Math.max(2, vw*0.003));
      svgEl.appendChild(poly);
      // v1.15: rótulo no centro visual, tamanho igual ao do editor e do PNG
      var textos = { bt:"BT "+a.linhaSeq, nf:nfDaArea(a) };
      rotuloSvg(svgEl, rotuloArea(a.pontos, vw, vh, textos), textos, a.cor);
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
    var areas = mp.areas || [];
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
    // rótulos por cima de todas as áreas (mesma regra do editor: centro visual, tamanho pela planta)
    areas.forEach(function(a){
      if(!a.pontos || a.pontos.length<3) return;
      var textos = { bt:"BT "+a.linhaSeq, nf:nfDaArea(a) };
      rotuloCanvas(ctx, rotuloArea(a.pontos, vw, vh, textos), textos, a.cor, padMargem, padTopo, 1);
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
    document.getElementById("btn-view-pavimento").addEventListener("click", function(){ showViewPavimento(); });
    document.getElementById("btn-view-ct").addEventListener("click", function(){ showViewCt(); });
    document.getElementById("btn-view-plantas").addEventListener("click", function(){ showViewPlantas(); });
    document.getElementById("btn-view-aco").addEventListener("click", function(){ switchView("aco"); });
    document.getElementById("btn-view-cronograma").addEventListener("click", function(){ switchView("cronograma"); });
    document.getElementById("btn-minha-assinatura").addEventListener("click", abrirMinhaAssinatura);
    initCronograma({ col:cronCol, todayISO:todayISO, nowISO:nowISO, fmtDateBR:fmtDateBR, garantirLibs:garantirLibs,
      usuario:function(){ return currentUserEmail||""; }, erroAcesso:function(){ return cronErroAcesso; } });
    initAco({ col:acoCol, lista:function(){ return Array.from(acoMap.values()); }, fmtDateBR:fmtDateBR, todayISO:todayISO, garantirPdf:garantirPdf,
      nowISO:nowISO, usuario:function(){ return currentUserEmail||""; }, erroAcesso:function(){ return acoErroAcesso; }, lajes:acoLajes });
    document.getElementById("btn-nav-dashboard").addEventListener("click", function(){ switchView("dashboard"); });
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
