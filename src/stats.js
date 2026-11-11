/** Estadísticas descriptivas, nunca estimaciones ni métricas inventadas. */
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const rounded=value=>value===null?null:Math.round(value*10)/10;
const outcome=(r,team)=>{
  const own=r.home===team?r.homeScore:r.awayScore;
  const opp=r.home===team?r.awayScore:r.homeScore;
  return own>opp?'W':own<opp?'L':'D';
};
function fragment(rows,team,sport){
  const wins=rows.filter(r=>outcome(r,team)==='W').length;
  const losses=rows.filter(r=>outcome(r,team)==='L').length;
  const draws=sport==='soccer'?rows.length-wins-losses:0;
  return {played:rows.length,wins,draws,losses,winPct:rows.length?Math.round(wins/rows.length*100):null};
}
function metric(rows,team,field){
  const own=rows.map(r=>r.home===team?r['home'+field]:r['away'+field]).filter(valid);
  const conceded=rows.map(r=>r.home===team?r['away'+field]:r['home'+field]).filter(valid);
  return {for:rounded(average(own)),against:rounded(average(conceded)),sample:own.length,againstSample:conceded.length};
}
/** before es una fecha EXCLUSIVA: evita incorporar resultados futuros al perfil de un encuentro. */
export function teamReport(results,team,sport,before=null){
  const matches=(results||[]).filter(r=>r&&(r.home===team||r.away===team)
    &&valid(r.homeScore)&&valid(r.awayScore)&&(!before||r.date<before))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const recent=matches.slice(0,5);
  const base=fragment(matches,team,sport);
  const last10=fragment(matches.slice(0,10),team,sport);
  let streak=0,streakType=null;
  for(const r of matches){
    const x=outcome(r,team);
    if(streakType===null)streakType=x;
    if(streakType!==x)break;
    streak++;
  }
  const summary={
    ...base,
    last10,
    home:fragment(matches.filter(r=>r.home===team),team,sport),
    away:fragment(matches.filter(r=>r.away===team),team,sport),
    scored:metric(matches,team,'Score'),
    recent:recent.map(r=>({
      date:r.date,opponent:r.home===team?r.away:r.home,
      venue:r.home===team?'Casa':'Fuera',
      for:r.home===team?r.homeScore:r.awayScore,
      against:r.home===team?r.awayScore:r.homeScore,
      result:outcome(r,team)
    })),
    streak:streak?{type:streakType,count:streak}:null,
    coverage:matches.length?'Datos de partidos disponibles en esta fuente':'Sin partidos anteriores'
  };
  if(sport==='soccer'){
    summary.cleanSheets=matches.filter(r=>r.home===team?r.awayScore===0:r.homeScore===0).length;
    summary.bothScore=matches.length?Math.round(matches.filter(r=>r.homeScore>0&&r.awayScore>0).length/matches.length*100):null;
    summary.over25=matches.length?Math.round(matches.filter(r=>r.homeScore+r.awayScore>=3).length/matches.length*100):null;
    summary.metrics=Object.fromEntries(['Shots','Target','Corners','Fouls','Yellow','Red'].map(x=>[x,metric(matches,team,x)]));
    summary.points=base.wins*3+base.draws;
    summary.goalDifference=matches.reduce((n,r)=>n+(r.home===team?r.homeScore-r.awayScore:r.awayScore-r.homeScore),0);
  }
  return summary;
}
export function headToHead(results,home,away,before=null){
  return (results||[]).filter(r=>((r.home===home&&r.away===away)||(r.home===away&&r.away===home))
    &&valid(r.homeScore)&&valid(r.awayScore)&&(!before||r.date<before))
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
}
