/* Catálogo das fichas FVS: checklist da FVS 04, elementos, os demais tipos de
 * FVS com o checklist oficial de cada um, obra padrão e tempo máximo da
 * betonada (FORM-15). Separado do main.js na v1.29 (fase A1). Só dados. */

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

export { DEFAULT_OBRA, FVS_CHECKLIST, FVS_ELEMENTOS, FVS_TIPOS, TEMPO_MAX_MIN, getFvsTipo };
