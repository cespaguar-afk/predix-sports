#!/usr/bin/env node
/** Archivo público de pronósticos verificables de Predix Sports.
 * Ejecutar ANTES de los partidos, nunca rehacer probabilidades de partidos finalizados.
 * El archivo persiste entre ejecuciones y se sirve desde GitHub Pages a todos los dispositivos.
 */
import fs from 'node:fs';
import {parseCSV,normalizeFootball} from '../src/data.js';
import {predictFootball,predictNBA,brierScore} from '../src/model.js';

const ROOT='feeds/';
const OUTPUT=ROOT+'predictions.json';
const NOW=new Date();
const TODAY=NOW.toISOString().slice(0,10);
const SOCCER={
 laliga:'ESP_1_la-liga',hypermotion:'ESP_2_segunda-division',
 premier:'ENG_1_premier-league',bundesliga:'GER_1_bundesliga',
 ligue1:'FRA_1_ligue-1',champions:'UEFA_1_champions-league',
 copadelrey:'ESP_CUP_copa-del-rey'
};
const yes=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const number=x=>yes(x)?Number(x):null;
const name=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const close=a=>Math.round(a*1000)/1000;
const existing=(()=>{
 try{const read=JSON.parse(fs.readFileSync(OUTPUT,'utf8'));return read?.snapshots&&typeof read.snapshots==='object'?read.snapshots:{};}
 catch{return {};}
})();
const data={};
for(const [league,folder] of Object.entries(SOCCER)){
 const all={results:[],fixtures:[]};
 for(const kind of ['results','fixtures']){
  try{
   const csv=fs.readFileSync(ROOT+folder+'_'+kind+'.csv','utf8');
   all[kind]=normalizeFootball(parseCSV(csv),league,kind==='fixtures');
  }catch(e){console.log('Sin datos:',league,kind,e.message);}
 }
 data[league]=all;
}
function fromEspnFile(league){
 try{
  const file=JSON.parse(fs.readFileSync(ROOT+league+'.json','utf8'));
  return (file.events||[]).map(e=>{
   const sides=e.competitions?.[0]?.competitors||[];
   const h=sides.find(x=>x.homeAway==='home'),a=sides.find(x=>x.homeAway==='away');
   if(!h?.team||!a?.team||!e.date||!e.id)return null;
   const status=e.status?.type?.state||'pre';
   return {id:league+':espn:'+e.id,league,
    sport:league==='nba'?'nba':'soccer',
    home:h.team.displayName||h.team.name,away:a.team.displayName||a.team.name,
    date:e.date.slice(0,10),isoTime:e.date,status:status==='post'?'post':status==='in'?'in':'pre',
    homeScore:number(h.score),awayScore:number(a.score)
   };
  }).filter(Boolean);
 }catch(e){console.log('ESPN no disponible:',league,e.message);return [];}
}
for(const league of ['nba','copadelrey','supercopa','nations']){
 const rows=fromEspnFile(league);
 if(!data[league])data[league]={results:[],fixtures:[]};
 if(rows.length&&league==='copadelrey'){
   // Los eventos ESPN tienen preferencia frente al calendario CSV contradictorio.
   data[league].fixtures=rows.filter(r=>r.status!=='post');
   data[league].results=[...rows.filter(r=>r.status==='post'),...data[league].results.filter(r=>
     !rows.some(x=>x.date===r.date&&(name(x.home)===name(r.home)||name(x.away)===name(r.away))))];
 }else{
   data[league].results.push(...rows.filter(r=>r.status==='post'));
   data[league].fixtures.push(...rows.filter(r=>r.status!=='post'));
 }
}
const allResults=Object.values(data).flatMap(v=>v.results);
const allFixtures=Object.values(data).flatMap(v=>v.fixtures);
const byIdentity=match=>match.league+':'+match.date+':'+name(match.home)+':'+name(match.away);
const lookup=new Map();
for(const [id,snap] of Object.entries(existing)){
 if(snap?.date&&snap?.league&&snap?.home&&snap?.away){
  const key=byIdentity(snap);
  if(!lookup.has(key))lookup.set(key,id);
 }
}
const nowTime=NOW.getTime();
let added=0,scored=0;
function safeToCapture(m){
 if(m.status!=='pre'||!m.date||m.date<TODAY)return false;
 if(m.isoTime){
  const start=Date.parse(m.isoTime);
  return Number.isFinite(start)&&start>nowTime+5*60000;
 }
 // CSV no confirma hora exacta; guardar únicamente antes del día del partido.
 return m.date>TODAY;
}
function observedEarlier(m){
 const list=data[m.league]?.results||[];
 if(m.league==='copadelrey'||m.league==='supercopa'){
  return [...list,...(data.laliga?.results||[]),...(data.hypermotion?.results||[])];
 }
 return list;
}
for(const m of allFixtures){
 if(!safeToCapture(m)||lookup.has(byIdentity(m)))continue;
 const history=observedEarlier(m);
 const pred=m.sport==='nba'?predictNBA(m,history):predictFootball(m,history);
 if(!pred||!pred.probabilities)continue;
 const snap={id:m.id,league:m.league,sport:m.sport,date:m.date,
  home:m.home,away:m.away,isoTime:m.isoTime||null,predictedAt:NOW.toISOString(),
  probabilities:Object.fromEntries(Object.entries(pred.probabilities).map(([k,v])=>[k,close(v)])),
  expectedHome:pred.expectedHome,expectedAway:pred.expectedAway,
  over25:pred.over25??null,btts:pred.btts??null,
  confidence:pred.confidence,
  scorelines:(pred.scorelines||[]).slice(0,3),
  markets:(pred.markets||[]).map(x=>({label:x.label,expected:x.expected,threshold:x.threshold,over:x.over})),
  outcome:null};
 existing[m.id]=snap;lookup.set(byIdentity(m),m.id);added++;
}
for(const match of allResults){
 if(!yes(match.homeScore)||!yes(match.awayScore))continue;
 const snapId=lookup.get(byIdentity(match)),snap=existing[snapId];
 if(!snap||snap.outcome||!snap.predictedAt)continue;
 const created=Date.parse(snap.predictedAt);
 const started=Date.parse(match.isoTime||snap.isoTime||'');
 const legal=Number.isFinite(started)?created<started:snap.predictedAt.slice(0,10)<match.date;
 if(!legal)continue;
 snap.outcome=match.sport==='nba'?(match.homeScore>match.awayScore?'H':'A')
   :match.homeScore>match.awayScore?'H':match.homeScore<match.awayScore?'A':'D';
 snap.actual=match.homeScore+'-'+match.awayScore;
 snap.brier=brierScore(snap.probabilities,snap.outcome,snap.sport);
 snap.gradedAt=NOW.toISOString();scored++;
}
const ordered=Object.fromEntries(Object.entries(existing).sort((a,b)=>
 b[1].date.localeCompare(a[1].date)).slice(0,3000));
const result={version:1,fetchedAt:NOW.toISOString(),description:'Pronósticos conservados ANTES del inicio de partidos',snapshots:ordered};
fs.mkdirSync(ROOT,{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+'\n');
console.log('Archivo de pronósticos: '+Object.keys(ordered).length+', nuevos '+added+', calificados '+scored);
