import {footballOutcome,brierScore} from './model.js';
const KEY='predix-v1-snapshots';
const CACHE='predix-v1-data';
const FAV='predix-v1-favorites';
function read(key, defaultValue){try{return JSON.parse(localStorage.getItem(key))??defaultValue;}catch{return defaultValue;}}
function write(key,obj){try{localStorage.setItem(key,JSON.stringify(obj));return true;}catch{return false;}}
export const loadSnapshots=()=>read(KEY,{});
export const loadCache=()=>read(CACHE,{});
export const saveCache=data=>write(CACHE,data);
export const getFavorites=()=>read(FAV,[]);
export function toggleFavorite(id){const current=getFavorites();return write(FAV,current.includes(id)?current.filter(x=>x!==id):[...current,id]);}
function outcomeOf(r){return r.sport==='nba'?(r.homeScore>r.awayScore?'H':'A'):footballOutcome(r);}
/** Solo sellar predicciones antes del día del partido para evitar filtración de información. */
export function capturePredictions(fixturePredictions){
  const data=loadSnapshots();let changed=false;
  const today=new Date().toISOString().slice(0,10);
  for(const {match,pred} of fixturePredictions){
    if(!pred||match.status!=='pre'||match.date<=today||data[match.id])continue;
    data[match.id]={id:match.id,league:match.league,sport:match.sport,date:match.date,
      home:match.home,away:match.away,probabilities:{...pred.probabilities},
      predictedAt:new Date().toISOString(),outcome:null};changed=true;
  }
  if(changed)write(KEY,data);
  return Object.values(data);
}
export function gradePredictions(results){
  const snapshots=loadSnapshots();let changed=false;
  const scored=results.filter(r=>r.status==='post'&&Number.isFinite(r.homeScore)&&Number.isFinite(r.awayScore));
  const byId=new Map(scored.map(r=>[r.id,r]));
  for(const [id,snap] of Object.entries(snapshots)){
    if(snap.outcome)continue;
    const match=byId.get(id);
    if(!match)continue;
    if(snap.date>=new Date().toISOString().slice(0,10))continue;
    snap.outcome=outcomeOf(match);snap.actual=`${match.homeScore}-${match.awayScore}`;
    snap.brier=brierScore(snap.probabilities,snap.outcome,snap.sport);
    snap.gradedAt=new Date().toISOString();changed=true;
  }
  if(changed)write(KEY,snapshots);
  return Object.values(snapshots);
}
export function exportData(){const payload={version:1,exportedAt:new Date().toISOString(),snapshots:loadSnapshots(),favorites:getFavorites()};
  return JSON.stringify(payload,null,2);}
export function clearHistory(){localStorage.removeItem(KEY);}
