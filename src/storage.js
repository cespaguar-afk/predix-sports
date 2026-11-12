import {footballOutcome,brierScore} from './model.js';
const KEY='predix-v1-snapshots';
const CACHE='predix-v1-data';
const FAV='predix-v1-favorites';
function read(key,defaultValue){try{return JSON.parse(localStorage.getItem(key))??defaultValue;}catch{return defaultValue;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let publicSnapshots={};
let publicIndex=new Map();
const matchKey=x=>[x?.league,x?.sport,x?.date,simplify(x?.home),simplify(x?.away)].join(':');
export const loadSnapshots=()=>read(KEY,{});
export function getHistoricSnapshot(match){
  // Priorizamos el registro local; la copia pública está indexada para que
  // cientos de resultados no hagan búsquedas lineales en cada renderizado.
  return findSnapshot(match,loadSnapshots())||publicIndex.get(matchKey(match))||null;
}
export async function loadPublicSnapshots(){
  try{
    const res=await fetch('./feeds/predictions.json',{cache:'no-store',signal:AbortSignal.timeout(6500)});
    if(!res.ok)throw Error('HTTP '+res.status);
    const payload=await res.json();
    if(payload?.snapshots&&typeof payload.snapshots==='object'){
      publicSnapshots=payload.snapshots;
      publicIndex=new Map();
      const conflicting=new Set();
      for(const item of Object.values(publicSnapshots)){
        if(!item||!item.probabilities)continue;
        const key=matchKey(item);
        if(conflicting.has(key))continue;
        if(publicIndex.has(key)){publicIndex.delete(key);conflicting.add(key);}
        else publicIndex.set(key,item);
      }
      return Object.keys(publicSnapshots).length;
    }
  }catch{}
  return Object.keys(publicSnapshots).length;
}
export const loadCache=()=>read(CACHE,{});
export const saveCache=data=>write(CACHE,data);
export const getFavorites=()=>read(FAV,[]);
export function toggleFavorite(id){const current=getFavorites();return write(FAV,current.includes(id)?current.filter(x=>x!==id):[...current,id]);}
const simplify=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
function sameFixture(snapshot,match){
  return snapshot?.league===match?.league&&snapshot?.sport===match?.sport
    &&snapshot?.date===match?.date&&simplify(snapshot?.home)===simplify(match?.home)
    &&simplify(snapshot?.away)===simplify(match?.away);
}
/** Emparejamiento exacto de equipo/fecha, sólo si hay UNA predicción inequívoca. */
export function findSnapshot(match,snapshots=loadSnapshots()){
  if(!match)return null;
  if(snapshots[match.id]&&sameFixture(snapshots[match.id],match))return snapshots[match.id];
  const matches=Object.values(snapshots).filter(s=>sameFixture(s,match));
  return matches.length===1?matches[0]:null;
}
function outcomeOf(r){return r.sport==='nba'?(r.homeScore>r.awayScore?'H':'A'):footballOutcome(r);}
const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
/** Nunca crear pronósticos retrospectivos. Para el mismo día exige hora ISO futura verificable. */
export function canCapture(match,now=new Date()){
  if(!match||match.status!=='pre'||!match.date)return false;
  const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'})
    .format(now);
  if(match.date>today)return true;
  if(match.date<today||!match.isoTime)return false;
  const kickoff=new Date(match.isoTime).getTime();
  return Number.isFinite(kickoff)&&kickoff>now.getTime()+120000;
}
function snapshotOf(match,pred,now){
  return {id:match.id,league:match.league,sport:match.sport,date:match.date,
    home:match.home,away:match.away,isoTime:match.isoTime||null,
    probabilities:{...pred.probabilities},
    expectedHome:num(pred.expectedHome),expectedAway:num(pred.expectedAway),
    scorelines:Array.isArray(pred.scorelines)?pred.scorelines.slice(0,3).map(x=>({
      home:x.home,away:x.away,p:num(x.p)})):[],
    over25:num(pred.over25),btts:num(pred.btts),
    markets:Array.isArray(pred.markets)?pred.markets.map(x=>({
      label:x.label,field:x.field,expected:num(x.expected),threshold:num(x.threshold),over:num(x.over)})):[],
    confidence:pred.confidence||null,
    predictedAt:now.toISOString(),outcome:null};
}
export function capturePredictions(fixturePredictions,now=new Date()){
  const snapshots=loadSnapshots();let changed=false;
  for(const {match,pred} of fixturePredictions){
    if(!pred||!canCapture(match,now)||findSnapshot(match,snapshots))continue;
    snapshots[match.id]=snapshotOf(match,pred,now);changed=true;
  }
  if(changed)write(KEY,snapshots);
  return Object.values(snapshots);
}
function wasPredictedBeforeKickoff(snap,match){
  const issued=Date.parse(snap.predictedAt||'');
  if(!Number.isFinite(issued))return false;
  const kickoff=Date.parse(match.isoTime||snap.isoTime||'');
  if(Number.isFinite(kickoff))return issued<kickoff;
  // En CSV sin inicio horario fiable, solo admitir registros de días anteriores.
  return snap.predictedAt.slice(0,10)<match.date;
}
export function gradePredictions(results){
  const snapshots=loadSnapshots();let changed=false;
  const completed=(results||[]).filter(r=>r.status==='post'
    &&Number.isFinite(r.homeScore)&&Number.isFinite(r.awayScore));
  for(const snap of Object.values(snapshots)){
    if(snap.outcome)continue;
    const matches=completed.filter(r=>sameFixture(snap,r));
    if(matches.length!==1||!wasPredictedBeforeKickoff(snap,matches[0]))continue;
    const match=matches[0];
    snap.outcome=outcomeOf(match);
    snap.actual=match.homeScore+'-'+match.awayScore;
    snap.brier=brierScore(snap.probabilities,snap.outcome,snap.sport);
    snap.gradedAt=new Date().toISOString();changed=true;
  }
  if(changed)write(KEY,snapshots);
  return Object.values(snapshots);
}
export function exportData(){
  return JSON.stringify({version:2,exportedAt:new Date().toISOString(),
    snapshots:loadSnapshots(),favorites:getFavorites()},null,2);
}
export function clearHistory(){localStorage.removeItem(KEY);}
