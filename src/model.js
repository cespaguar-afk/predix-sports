/** Modelo experimental y auditable. No hay ML entrenado ni cuotas implícitas. */
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : null;
const round = (n, digits=1) => Number(n.toFixed(digits));
const valid = v => typeof v === 'number' && Number.isFinite(v);
export const footballOutcome = r => r.homeScore > r.awayScore ? 'H' : r.homeScore < r.awayScore ? 'A' : 'D';

function weightedAverage(numbers, fallback) {
  let sum = 0, weightSum = 0;
  numbers.forEach(({value,index}) => {
    if (!valid(value)) return;
    const w = Math.pow(.84, index);
    sum += w * value;
    weightSum += w;
  });
  return weightSum ? sum/weightSum : fallback;
}
function sample(results, team, before, n=10) {
  return results.filter(r=> r.date < before && (r.home===team || r.away===team) && valid(r.homeScore) && valid(r.awayScore))
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,n);
}
function teammateValue(matches, team, metric, against=false) {
  const data = matches.map((r,i) => {
    const side = r.home===team ? 'home' : 'away';
    const other = side==='home' ? 'away' : 'home';
    const key = (against ? other : side) + metric;
    return {value:r[key], index:i};
  }).filter(x=>valid(x.value));
  return {count:data.length, avg:weightedAverage(data,null)};
}
const poisson = (k, lambda) => { let p=Math.exp(-lambda); for(let i=1;i<=k;i++)p*=lambda/i; return p; };
function pOver(threshold, lambda) {
  let cumulative=0;
  for(let k=0;k<=Math.floor(threshold);k++)cumulative+=poisson(k,lambda);
  return clamp(1-cumulative,0,1);
}
function backoff(measured, n, baseline, prior=6) {
  return (measured*n + baseline*prior)/(n+prior);
}
function poissonGrid(lH,lA) {
  let total=0,H=0,D=0,A=0,over25=0,btts=0;
  const scores=[];
  for(let h=0;h<=11;h++)for(let a=0;a<=11;a++){
    const p=poisson(h,lH)*poisson(a,lA);
    total+=p;
    if(h>a) H+=p; else if(h===a) D+=p; else A+=p;
    if(h+a>=3) over25+=p;
    if(h>0&&a>0)btts+=p;
    scores.push({home:h,away:a,p});
  }
  scores.sort((x,y)=>y.p-x.p);
  return { probabilities:{H:H/total,D:D/total,A:A/total}, over25:over25/total,btts:btts/total, scorelines:scores.slice(0,3).map(s=>({...s,p:s.p/total})) };
}

/** Predice solo usando partidos anteriores a fixture.date. */
export function predictFootball(fixture, results) {
  const past=results.filter(r=>r.date<fixture.date && valid(r.homeScore)&&valid(r.awayScore));
  const home=sample(past, fixture.home, fixture.date);
  const away=sample(past, fixture.away, fixture.date);
  if(!past.length || !home.length || !away.length) return null;
  const baseHome=mean(past.map(r=>r.homeScore)) ?? 1.45;
  const baseAway=mean(past.map(r=>r.awayScore)) ?? 1.15;
  const baseTeam=(baseHome+baseAway)/2;
  const hf=teammateValue(home,fixture.home,'Score');
  const ha=teammateValue(home,fixture.home,'Score',true);
  const af=teammateValue(away,fixture.away,'Score');
  const aa=teammateValue(away,fixture.away,'Score',true);
  const homeAttack=backoff(hf.avg,hf.count,baseTeam), awayDef=backoff(aa.avg,aa.count,baseTeam);
  const awayAttack=backoff(af.avg,af.count,baseTeam), homeDef=backoff(ha.avg,ha.count,baseTeam);
  const lambdaH=clamp((homeAttack*awayDef/baseTeam)*(baseHome/baseTeam),.25,4.5);
  const lambdaA=clamp((awayAttack*homeDef/baseTeam)*(baseAway/baseTeam),.25,4.5);
  const grid=poissonGrid(lambdaH,lambdaA);
  const markets=[];
  const metrics=[
    ['Corners','Córners totales',8.5],
    ['Yellow','Tarjetas amarillas',3.5],
    ['Fouls','Faltas totales',23.5],
    ['Target','Remates a puerta',7.5],
    ['Shots','Remates totales',22.5]
  ];
  for(const [field,label,threshold] of metrics){
    const hFor=teammateValue(home,fixture.home,field);
    const hAgainst=teammateValue(home,fixture.home,field,true);
    const aFor=teammateValue(away,fixture.away,field);
    const aAgainst=teammateValue(away,fixture.away,field,true);
    if(Math.min(hFor.count,hAgainst.count,aFor.count,aAgainst.count)<3) continue;
    const leagueValues=past.map(r=>[r['home'+field],r['away'+field]]).flat().filter(valid);
    if(leagueValues.length<20) continue;
    const baseline=mean(leagueValues);
    const expectedHome=(backoff(hFor.avg,hFor.count,baseline,5) + backoff(aAgainst.avg,aAgainst.count,baseline,5))/2;
    const expectedAway=(backoff(aFor.avg,aFor.count,baseline,5) + backoff(hAgainst.avg,hAgainst.count,baseline,5))/2;
    const expected=expectedHome+expectedAway;
    markets.push({field,label,expected:round(expected),threshold,over:pOver(threshold,expected),samples:Math.min(hFor.count,aFor.count)});
  }
  const n=Math.min(home.length,away.length);
  const confidence = n>=8 && past.length>=75 ? 'media' : 'baja';
  return {sport:'soccer',kind:'poisson',probabilities:grid.probabilities,over25:grid.over25,btts:grid.btts,
    scorelines:grid.scorelines,expectedHome:round(lambdaH,2),expectedAway:round(lambdaA,2),markets,
    sampleHome:home.length,sampleAway:away.length,confidence,explanation:'Poisson con forma reciente, goles a favor/en contra y suavizado hacia la media de la competición. No incluye lesiones ni alineaciones.'};
}

/** Historial NBA con eventos ESPN; ventaja de local pequeña y diferencia de puntos reciente. */
export function predictNBA(fixture, results) {
  const past=results.filter(r=>r.date < fixture.date && valid(r.homeScore)&&valid(r.awayScore));
  const home=sample(past,fixture.home,fixture.date,12);
  const away=sample(past,fixture.away,fixture.date,12);
  if(!home.length||!away.length) return null;
  const pts=mean(past.flatMap(r=>[r.homeScore,r.awayScore]))??112;
  function rates(rows,team){
    const f=teammateValue(rows,team,'Score');
    const a=teammateValue(rows,team,'Score',true);
    return {scored:backoff(f.avg,f.count,pts,5), conceded:backoff(a.avg,a.count,pts,5)};
  }
  const h=rates(home,fixture.home), a=rates(away,fixture.away);
  const projectedHome=clamp((h.scored+a.conceded)/2+1.2,70,155);
  const projectedAway=clamp((a.scored+h.conceded)/2-1.2,70,155);
  const diff=projectedHome-projectedAway;
  // Escala heurística y NO calibrada como una verdadera tasa de victorias.
  const pHome=clamp(1/(1+Math.exp(-diff/12)),.06,.94);
  return {sport:'nba',kind:'heuristic',probabilities:{H:pHome,A:1-pHome},
    expectedHome:round(projectedHome),expectedAway:round(projectedAway),
    total:round(projectedHome+projectedAway),margin:round(diff),sampleHome:home.length,sampleAway:away.length,
    confidence:Math.min(home.length,away.length)>=10?'media':'baja',
    explanation:'Estimación heurística basada en puntos recientes a favor/en contra y ventaja local. Probabilidades no calibradas ni validadas; no incluye bajas.'};
}

export function brierScore(probs, actual, sport='soccer') {
  const outcomes=sport==='nba'?['H','A']:['H','D','A'];
  return outcomes.reduce((sum,k)=>sum+Math.pow((probs[k]??0)-(k===actual?1:0),2),0);
}
/** Ajuste suave SOLO sobre predicciones prepartido ya calificadas, nunca sobre pruebas retrospectivas. */
export function calibrate(probs, sport, evaluated) {
  const outcomes=sport==='nba'?['H','A']:['H','D','A'];
  if(evaluated.length<20) return {probabilities:probs, calibrated:false, count:evaluated.length};
  const blended={};let changed=false;
  for(const k of outcomes){
    const p=probs[k]??0;
    const group=evaluated.filter(x=>x.sport===sport && (x.probabilities?.[k]??0)>=Math.floor(p*5)/5 && (x.probabilities?.[k]??0)<Math.floor(p*5)/5+.2);
    if(group.length<12){blended[k]=p;continue;}
    changed=true;
    const hits=group.filter(x=>x.outcome===k).length;
    const observed=(hits+3*p)/(group.length+3);
    blended[k]=.8*p+.2*observed;
  }
  const sum=outcomes.reduce((s,k)=>s+blended[k],0);
  return {probabilities:Object.fromEntries(outcomes.map(k=>[k,blended[k]/sum])),calibrated:changed,count:evaluated.length};
}
