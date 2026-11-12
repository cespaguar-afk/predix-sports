/**
 * Predix Sports — NBA box scores bajo demanda.
 * Fuentes públicas no oficiales: ESPN game summary; NBA CDN como alternativa.
 * Los promedios sólo usan partidos realmente consultados antes de la fecha
 * del encuentro seleccionado. No representan una predicción ni la temporada.
 */
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const NBA_CDN='https://cdn.nba.com/static/json/liveData/boxscore/boxscore_';
const CACHE_PREFIX='predix.nba.box.v3.'; // Invalida los datos antiguos que ocultaban nombres.
const FETCH_TIMEOUT=6500;
const memory=new Map();
const dateLookup=new Map();

const number=x=>{
  if(x===null||x===undefined||x==='')return null;
  const v=String(x).trim();
  return /^[-+]?\d+(?:\.\d+)?$/.test(v)?Number(v):null;
};
const avg=values=>{
  const valid=values.filter(x=>typeof x==='number'&&Number.isFinite(x));
  return valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*10)/10:null;
};
const clean=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim();
const sameTeam=(a,b)=>clean(a)===clean(b)||(
  clean(a).split(' ').at(-1)===clean(b).split(' ').at(-1)
  &&clean(a).split(' ').at(-1)?.length>3
);
const tableNumber=(row,keys)=>{
  for(const k of keys){if(k in row){const n=number(row[k]);if(n!==null)return n;}}
  return null;
};
const splitShooting=s=>{
  const m=String(s||'').trim().match(/^(\d+)-(\d+)$/);
  return m?[Number(m[1]),Number(m[2])]:[null,null];
};
const firstValue=(rows,names)=>{
  for(const name of names){const v=rows[name];if(v!==undefined&&v!==null)return v;}
  return null;
};
const parseStatRow=(columns,values)=>{
  const out={};
  columns.forEach((name,i)=>{if(name)out[String(name).trim().toUpperCase()]=values[i];});
  return out;
};
const readableName=(person,row={})=>{
  const full=[person?.firstName,person?.lastName||person?.familyName].filter(Boolean).join(' ');
  const fromRow=[row?.athlete?.displayName,row?.player?.displayName,row?.displayName,row?.playerName,row?.name];
  return [
    person?.displayName,person?.fullName,full,person?.shortName,person?.name,
    ...fromRow
  ].find(v=>typeof v==='string'&&v.trim().length>1)?.trim()||'';
};
const normalPlayer=(athlete,values,row={})=>{
  const [fgMade,fgAttempted]=splitShooting(firstValue(values,['FG','FGM-FGA']));
  const [tpMade,tpAttempted]=splitShooting(firstValue(values,['3PT','3P','3PM-3PA']));
  const minutesRaw=firstValue(values,['MIN','MINUTES']);
  const minutes=number(minutesRaw)??(/^\d+:\d+$/.test(String(minutesRaw))?number(String(minutesRaw).split(':')[0]):null);
  return {
    id:String(athlete?.id||athlete?.uid||athlete?.displayName||''),
    name:readableName(athlete,row),
    points:tableNumber(values,['PTS','POINTS']),
    rebounds:tableNumber(values,['REB','TRB','REBOUNDS']),
    assists:tableNumber(values,['AST','ASSISTS']),
    turnovers:tableNumber(values,['TO','TOV','TURNOVERS']),
    steals:tableNumber(values,['STL','STEALS']),
    blocks:tableNumber(values,['BLK','BLOCKS']),
    minutes,fgMade,fgAttempted,tpMade,tpAttempted
  };
};
const teamStatistics=values=>{
  const map=Object.fromEntries((values||[]).filter(x=>x?.name)
    .map(x=>[String(x.name).toLowerCase(),x.displayValue??x.value]));
  return {
    rebounds:number(map.rebounds??map.totalrebounds),
    assists:number(map.assists),
    turnovers:number(map.turnovers??map.totalturnovers),
    steals:number(map.steals),
    blocks:number(map.blocks),
    fgPct:number(map.fieldgoalpct??map.fieldgoalpercentage),
    tpPct:number(map.threepointfieldgoalpct??map.threepointfieldgoalpercentage)
  };
};
export function parseEspnBoxscore(payload){
  const box=payload?.boxscore;
  if(!box||!Array.isArray(box.players))return null;
  const totals=new Map();
  for(const t of box.teams||[]){
    const team=t.team||{};
    const key=String(team.id||team.abbreviation||team.displayName||'');
    if(key)totals.set(key,teamStatistics(t.statistics));
  }
  const teams=[];
  for(const block of box.players){
    const team=block.team||{};
    const key=String(team.id||team.abbreviation||team.displayName||'');
    const players=[];
    for(const group of Array.isArray(block.statistics)?block.statistics:[block.statistics]){
      if(!group)continue;
      const headers=group.labels?.length?group.labels:group.names||[];
      for(const row of group.athletes||[]){
        if(row.didNotPlay===true||row.didNotDress===true)continue;
        const raw=Array.isArray(row.stats)?row.stats:null;
        if(!raw||!raw.length)continue;
        const player=normalPlayer(row.athlete||row.player||{},parseStatRow(headers,raw),row);
        if(player.name&&player.points!==null)players.push(player);
      }
    }
    if(players.length)teams.push({
      name:team.displayName||team.name||'',
      abbr:team.abbreviation||'',
      id:key,
      players,
      totals:totals.get(key)||{},
      source:'ESPN'
    });
  }
  return teams.length?{teams,source:'ESPN'}:null;
}
const cdnPlayer=p=>{
  const s=p.statistics||{};
  const minutes=number(s.minutes)??number(String(s.minutes||'').split(':')[0]);
  return {
    id:String(p.personId||p.playerId||p.name||''),name:readableName(p,{displayName:p.nameI}),
    points:number(s.points),rebounds:number(s.reboundsTotal),assists:number(s.assists),
    turnovers:number(s.turnovers),steals:number(s.steals),blocks:number(s.blocks),
    minutes,fgMade:number(s.fieldGoalsMade),fgAttempted:number(s.fieldGoalsAttempted),
    tpMade:number(s.threePointersMade),tpAttempted:number(s.threePointersAttempted)
  };
};
export function parseCdnBoxscore(payload){
  const game=payload?.game;
  if(!game?.homeTeam||!game?.awayTeam)return null;
  const teams=[game.homeTeam,game.awayTeam].map(team=>{
    const s=team.statistics||{};
    return {
      name:[team.teamCity,team.teamName].filter(Boolean).join(' '),
      abbr:team.teamTricode||'',id:String(team.teamId||''),
      players:(team.players||[]).filter(p=>p?.played!==false).map(cdnPlayer)
        .filter(p=>p.name&&p.points!==null),
      totals:{
        rebounds:number(s.reboundsTotal),assists:number(s.assists),turnovers:number(s.turnoversTotal??s.turnovers),
        steals:number(s.steals),blocks:number(s.blocks),
        fgPct:number(s.fieldGoalsPercentage),tpPct:number(s.threePointersPercentage)
      },
      source:'NBA CDN'
    };
  }).filter(t=>t.players.length);
  return teams.length?{teams,source:'NBA CDN'}:null;
}
async function readJson(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(FETCH_TIMEOUT),cache:'default'});
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
}
function fromCache(id){
  try{
    const item=JSON.parse(localStorage.getItem(CACHE_PREFIX+id)||'null');
    if(item&&item.expiry>Date.now()&&item.box?.teams?.length)return item.box;
  }catch{}
  return null;
}
function toCache(id,box,final){
  try{localStorage.setItem(CACHE_PREFIX+id,JSON.stringify({
    expiry:Date.now()+(final?14*86400000:2*60000),box
  }));}catch{}
}
function espnId(match){
  const m=String(match?.id||'').match(/^nba:espn:(\d+)$/);
  return m?.[1]||null;
}
function cdnId(match){
  const m=String(match?.id||'').match(/^nba:official:(\d{10})$/);
  return m?.[1]||null;
}
async function lookupEspnId(match){
  if(!match.date)return null;
  if(!dateLookup.has(match.date)){
    const promise=readJson(ESPN+'/scoreboard?dates='+match.date.replaceAll('-',''))
      .then(data=>data.events||[]).catch(()=>[]);
    dateLookup.set(match.date,promise);
  }
  const events=await dateLookup.get(match.date);
  const event=events.find(e=>{
    const comps=e.competitions?.[0]?.competitors||[];
    const home=comps.find(c=>c.homeAway==='home')?.team;
    const away=comps.find(c=>c.homeAway==='away')?.team;
    if(!home||!away)return false;
    const h=clean(home.displayName||home.name),a=clean(away.displayName||away.name);
    return (sameTeam(h,match.home)||clean(home.abbreviation)===clean(match.homeShort))
       && (sameTeam(a,match.away)||clean(away.abbreviation)===clean(match.awayShort));
  });
  return event?.id||null;
}
async function readBoxscore(match){
  if(match.status==='pre')return null;
  const key=match.id;
  if(memory.has(key))return memory.get(key);
  const cached=fromCache(key);
  if(cached){memory.set(key,cached);return cached;}
  const task=(async()=>{
    let found=null;
    const id=espnId(match);
    if(id){
      try{found=parseEspnBoxscore(await readJson(ESPN+'/summary?event='+id));}catch{}
    }else{
      const official=cdnId(match);
      if(official){
        try{found=parseCdnBoxscore(await readJson(NBA_CDN+official+'.json'));}catch{}
        if(!found){
          const event=await lookupEspnId(match);
          if(event)try{found=parseEspnBoxscore(await readJson(ESPN+'/summary?event='+event));}catch{}
        }
      }
    }
    if(found)toCache(key,found,match.status==='post');
    return found;
  })();
  memory.set(key,task);
  try{
    const result=await task;
    if(!result)memory.delete(key);
    else memory.set(key,result);
    return result;
  }catch(error){memory.delete(key);throw error;}
}
function averagePlayers(games){
  const map=new Map();
  for(const game of games)for(const p of game.players){
    const key=clean(p.name);
    if(!map.has(key))map.set(key,{name:p.name,games:0,metrics:{},fgMade:0,fgAttempted:0,tpMade:0,tpAttempted:0});
    const row=map.get(key);
    row.games++;
    for(const metric of ['points','rebounds','assists','turnovers','steals','blocks','minutes']){
      if(!row.metrics[metric])row.metrics[metric]=[];
      if(typeof p[metric]==='number')row.metrics[metric].push(p[metric]);
    }
    for(const field of ['fgMade','fgAttempted','tpMade','tpAttempted']){
      if(typeof p[field]==='number')row[field]+=p[field];
    }
  }
  return [...map.values()].map(row=>({
    name:row.name,games:row.games,
    ...Object.fromEntries(Object.entries(row.metrics).map(([k,v])=>[k,avg(v)])),
    fgPct:row.fgAttempted?Math.round(row.fgMade/row.fgAttempted*100):null,
    tpPct:row.tpAttempted?Math.round(row.tpMade/row.tpAttempted*100):null
  })).sort((a,b)=>(b.points??-1)-(a.points??-1));
}
const byDate=(a,b)=>b.date.localeCompare(a.date);
function matchTeam(block,team,short){
  return block.teams.find(x=>sameTeam(x.name,team)
    ||Boolean(short&&clean(x.abbr)===clean(short)));
}
export async function loadNbaTeamDetails(match,results,{perTeam=4}={}){
  const maximum=Math.max(1,Math.min(5,Number(perTeam)||3));
  const names=[{name:match.home,short:match.homeShort},{name:match.away,short:match.awayShort}];
  const candidates=names.map(({name})=>(results||[]).filter(r=>
    r?.status==='post'&&r.date<match.date&&(r.home===name||r.away===name))
    .sort(byDate).slice(0,maximum));
  const unique=[...new Map(candidates.flat().map(r=>[r.id,r])).values()];
  const boxes=new Map();
  // Límite de dos peticiones simultáneas para no saturar la conexión móvil.
  let index=0;
  async function worker(){
    while(index<unique.length){
      const item=unique[index++];
      try{boxes.set(item.id,await readBoxscore(item));}
      catch{boxes.set(item.id,null);}
    }
  }
  await Promise.all([worker(),worker()]);
  const teams=names.map((team,i)=>{
    const selected=candidates[i].map(r=>boxes.get(r.id))
      .map(box=>box&&matchTeam(box,team.name,team.short)).filter(Boolean);
    return {
      name:team.name,requested:candidates[i].length,loaded:selected.length,
      metrics:Object.fromEntries(['rebounds','assists','turnovers','steals','blocks','fgPct','tpPct']
        .map(k=>[k,avg(selected.map(x=>x.totals?.[k]))])),
      players:averagePlayers(selected),
      providers:[...new Set(selected.map(x=>x.source))]
    };
  });
  return {teams,requested:unique.length,loaded:[...boxes.values()].filter(Boolean).length,
    isHistorical:true};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fmt=value=>typeof value==='number'&&Number.isFinite(value)?String(value):'—';
function playerTable(team){
  const top=(team.players||[]).filter(p=>typeof p.name==='string'&&p.name.trim()).slice(0,8);
  if(!top.length)return '<p class="source-note">No se han recibido nombres y estadísticas individuales verificables.</p>';
  const fields=[
    ['MIN','minutes'],['PTS','points'],['REB','rebounds'],['AST','assists'],
    ['ROB','steals'],['TAP','blocks'],['PÉRD','turnovers'],['TC%','fgPct'],['3PT%','tpPct']
  ];
  return '<div class="nba-player-cards" role="list" aria-label="Estadísticas de jugadores">'
    +top.map((p,i)=>'<article class="nba-player-card" role="listitem">'
      +'<div class="nba-player-card-head"><span class="nba-player-number">'+String(i+1).padStart(2,'0')+'</span>'
      +'<h6 class="nba-player-name">'+esc(p.name)+'</h6>'
      +'<span class="nba-player-games">'+esc(fmt(p.games))+' PJ</span></div>'
      +'<div class="nba-player-metrics">'
      +fields.map(([label,key])=>{
        const value=p[key];
        const shown=(key==='fgPct'||key==='tpPct')?typeof value==='number'?value+'%':'—':fmt(value);
        return '<div class="nba-player-metric"><small>'+label+'</small><strong>'+esc(shown)+'</strong></div>';
      }).join('')
      +'</div></article>').join('')
    +'</div>';
}
export function renderNbaTeamDetails(report){
  const visible=report.teams.some(t=>t.loaded>0);
  if(!visible)return '<h3>Estadísticas individuales NBA</h3><p class="source-note">No se han podido recuperar fichas de jugadores de los últimos encuentros. Puede faltar cobertura o estar bloqueada la fuente. Vuelve a intentarlo más tarde.</p>';
  const teams=report.teams.map(t=>{
    const stats=[
      ['Rebotes',t.metrics.rebounds],['Asistencias',t.metrics.assists],
      ['Pérdidas',t.metrics.turnovers],['Robos',t.metrics.steals],
      ['Tapones',t.metrics.blocks],['TC%',t.metrics.fgPct===null?null:t.metrics.fgPct+'%'],
      ['3PT%',t.metrics.tpPct===null?null:t.metrics.tpPct+'%']
    ];
    return '<div class="nba-detail-team"><h4>'+esc(t.name)+'</h4>'
      +'<p class="source-note">'+t.loaded+' de '+t.requested+' partidos anteriores con ficha disponible'
      +(t.providers.length?' · '+esc(t.providers.join(', ')):'')+'</p>'
      +'<div class="nba-team-stat-grid">'+stats.map(([k,v])=>
        '<div><span>'+esc(k)+'</span><strong>'+esc(fmt(v))+'</strong></div>').join('')+'</div>'
      +'<h5>Jugadores · promedio en partidos disponibles</h5>'
      +playerTable(t)+'</div>';
  });
  return '<h3>Estadísticas individuales NBA</h3>'
    +'<p class="source-note">Promedios observados en los últimos partidos anteriores a este encuentro (máximo 4 por equipo); el número PJ indica cuántas apariciones se han registrado para cada jugador. No son estadísticas de toda la temporada ni garantizan que participe en el próximo partido.</p>'
    +'<div class="nba-detail-teams">'+teams.join('')+'</div>'
    +'<p class="disclaimer">Datos históricos de ESPN / NBA CDN sujetos a disponibilidad. No constituyen un pronóstico individual ni se utilizan todavía para ajustar probabilidades.</p>';
}
