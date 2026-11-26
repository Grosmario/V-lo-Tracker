// plan2.js : programme 30 nov 2026 - 30 juin 2027. Chargé APRÈS wahoo.js et features.js.
// Les watts sont donnés pour une FTP home trainer de 220 W et suivent le réglage de l'appli.
"use strict";
(function(){
 if(typeof base!=="function"||typeof renderAll!=="function")return;
 const NEW="2026-11-30";
 const w=x=>Math.round(x*S.ftpHT/220)+" W";
 WARM.doc={min:15,cool:[0,""],steps:[["0:00","5 min à {~52%}, puis 5 min à {~64%}"],["10:00","3 × (30 s à {~80%} en cadence haute + 30 s à {~55%})"],["13:00","2 min à {~57%}"]]};
 const OUT={ss:"Montée régulière ou faux plat, au ressenti (RPE 6–7) et à la FC tant que les capteurs ne sont pas comparés.",
  vo2:"Côte de 2–3 min, RPE 8–9. Récup très facile.",e:"Endurance en restant à l'aise dans les bosses (FC ≤ 155)."};
 function mk2(kind,title,lines,dur,note){const key=kind==="ss"||kind==="vo2";
  return{kind,title,dur,main:lines.map(t=>[dur,t]),warm:key?"doc":"none",note:note||"",so:key?OUT[kind]:OUT.e,hard:key,mode:key?"ht":"ext",nv:true}}
 const reps=(n,m,p,r)=>n+" × "+m+" min à "+p+" — récup "+r+" à "+w(120)+" entre les blocs";
 const ss=(n,m,p,end,dur,title)=>mk2("ss",(title||"Sweet Spot "+n+" × "+m+" min")+" à "+p,[reps(n,m,p,"4 min"),"Fin de séance : "+end],dur);
 const vo=(n,m,p,r,end,dur)=>mk2("vo2","VO2max "+n+" × "+m+" min à "+w(p),[n+" × "+m+" min à "+w(p)+" — récup "+r+" à "+w(115),"Fin de séance : "+end],dur);
 const e2=(a,b)=>a+" min à "+w(140)+" puis "+b+" min à "+w(115);
 const short=(dur,end)=>mk2("vo2","VO2 2 × 8 × 30/15 s à "+w(260),["2 séries de 8 × (30 s à "+w(260)+" + 15 s à "+w(130)+"), 5 min à "+w(115)+" entre les séries","Fin de séance : "+end],dur);
 // 4 premières semaines (lundi de la semaine -> [mardi, jeudi])
 const FIRST={
  "2026-11-30":()=>[ss(3,8,w(195),"5 min à "+w(140)+" + 8 min à "+w(115),60),vo(6,2,240,"2 min",e2(13,10),60)],
  "2026-12-07":()=>[ss(3,10,w(195),"7 min à "+w(115),60),vo(5,3,235,"2 min 30",e2(10,10),60)],
  "2026-12-14":()=>[ss(3,12,w(195)+"–"+w(200),"6 min à "+w(115),65),short(60,e2(18,10))],
  "2026-12-21":()=>[ss(2,8,w(195),"7 min à "+w(140)+" + 8 min à "+w(115),50),vo(4,2,240,"2 min",e2(11,10),50)]
 };
 const LIGHT=["2026-12-21","2026-12-28","2027-01-25","2027-02-22","2027-03-22","2027-04-12","2027-05-10","2027-06-14"];
 const PH=[["2027-01-04",1,"Phase 1 · Base"],["2027-03-01",2,"Phase 2 · Construction"],["2027-04-19",3,"Phase 3 · VO2max"],["2027-05-31",4,"Phase 4 · Seuil spécifique"],["2027-07-01",5,"Phase 5 · Consolidation"]];
 const ph=k=>PH.find(x=>k<x[0])||PH[4];
 const _ph=phaseOf;
 phaseOf=function(wk){const k=iso(addD(START,wk*7));return k<NEW?_ph(wk):{p:ph(k)[1],i:0,n:ph(k)[2]}};
 // Après le 27 décembre : séances PROVISOIRES, à ajuster d'après les bilans.
 const wu=" Échauffement 15 min puis retour au calme compris dans la durée.";
 function later(k,tue){const p=ph(k)[1];
  if(LIGHT.includes(k))return tue?ss(2,8,w(195),"facile jusqu'à 50 min",50,"Allégée : Sweet Spot 2 × 8 min"):vo(4,2,240,"2 min","facile jusqu'à 50 min",50);
  const end="facile jusqu'à la durée totale";
  if(p===2){if(tue)return k<"2027-02-01"?ss(2,20,w(195),end,70):ss(3,10,w(210),end,65,"Seuil 3 × 10 min");return vo(5,2,240,"2 min",end,60)}
  if(p===3)return tue?ss(3,12,w(200),end,65):vo(k<"2027-03-29"?4:5,3,240,"3 min",end,60);
  if(p===4)return tue?ss(3,15,w(210),end,75,"Seuil 3 × 15 min"):vo(4,2,245,"3 min",end,55);
  return tue?ss(2,20,w(210),end,70,"Seuil long 2 × 20 min"):vo(4,2,245,"3 min",end,55);
 }
 function day(d){const k=iso(d),mon=iso(monday(d)),dow=d.getDay(),light=LIGHT.includes(mon);
  if(dow===3)return{kind:"rest",title:"Repos complet",dur:0,main:[],warm:"none",note:"",so:"",hard:false,mode:"ext",nv:true};
  if(dow===2||dow===4){const tue=dow===2;
   if(FIRST[mon])return FIRST[mon]()[tue?0:1];
   if(mon==="2026-12-28")return mk2("easy","Noël : 45 min à "+w(125),["45 min à "+w(125)],45,"Repos si besoin.");
   const s=later(mon,tue);s.note="Séance provisoire : à ajuster d'après tes bilans."+wu;s.warm="doc";return s}
  if(light||mon==="2026-12-28"){
   if(dow===6)return mk2("endu","Sortie libre facile 1 h à 1 h 30",["1 h à 1 h 30 en endurance facile"],75,"Semaine allégée.");
   if(dow===0)return mk2("easy","Libre ou repos, facile",["Au choix, facile"],45,"Semaine allégée.");
   return mk2("easy","Facile 45 min à "+w(125),["45 min à "+w(125)],45,"Semaine allégée."+(dow===1?" Repos possible.":""))}
  if(dow===6)return mk2("endu","Endurance 1 h 30 à "+w(140)+"–"+w(150)+" + 5 × 10 s",["15 min à "+w(125),"60 min à "+w(140)+"–"+w(150)+" avec 5 sprints de 10 s (un toutes les 10 min)","15 min à "+w(125)],90);
  if(dow===0)return mk2("easy","Endurance 1 h à "+w(125)+"–"+w(140),["1 h à "+w(125)+"–"+w(140)+", cadence variée"],60);
  const s=mk2("endu","Endurance Z2 1 h à "+w(140),["10 min à "+w(120),"45 min à "+w(140),"5 min à "+w(115)],60);
  if(k===NEW)s.note="Comparaison des capteurs au début (dans l'heure) : 5 min à 130 W, 5 min à 170 W, 3 min à 210 W, en enregistrant KICKR et Assioma.";
  return s}
 const EVAL={"2027-01":[11,17],"2027-04":[19,25],"2027-06":[21,30]};
 const _base=base;
 base=function(d){const k=iso(d);
  if(k==="2026-11-26"){const s=vo(4,2,245,"3 min","13 min à "+w(120),45);return s}
  if(k<NEW||d>END)return _base(d);
  const s=day(d),ev=EVAL[k.slice(0,7)],n=d.getDate();
  if(ev&&n>=ev[0]&&n<=ev[1]&&d.getDay()===6)s.note+=" Semaine d'évaluation possible : 3 min à fond, 30 min très faciles, 12 min à fond (si frais, à la place de la sortie).";
  return s};
 const _sp=seuilProgression;
 seuilProgression=function(p,d){return iso(d)>=NEW?p:_sp(p,d)};
 const _kj=estKJ;
 estKJ=function(p,ftp){if(!p||!p.nv)return _kj(p,ftp);const z={ss:0.76,vo2:0.69,endu:0.63,easy:0.58}[p.kind]||0;return Math.round(S.ftpHT*z*(p.dur||0)*60/1000)};
 if(!LS.get("plan4wkg-plan2-clean",0)){
  Object.keys(S.over).forEach(k=>{const r=String((S.over[k]&&S.over[k].reason)||"");if(k>="2026-11-26"&&r.indexOf("Bibliothèque")!==0)delete S.over[k]});
  LS.set("plan4wkg-over",S.over);LS.set("plan4wkg-plan2-clean",1)}
 renderAll();
})();
