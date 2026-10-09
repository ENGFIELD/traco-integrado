/* Datas, horários e textos no formato brasileiro, usados em todas as telas.
 * Separado do main.js na v1.29 (fase A1). Funções puras. */

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

export { diffMin, dowBR, escapeHtml, fmtDateBR, fmtDateTimeBR, fmtMin, lastUpdatedHtml, nowISO, rastRotulo, todayISO };
