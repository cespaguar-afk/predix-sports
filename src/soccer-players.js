/**
 * Jugadores de fútbol: datos observados de resúmenes públicos ESPN.
 * Carga sólo al solicitar la pestaña de jugadores de un partido.
 * Nunca afirma alineaciones futuras ni inventa estadísticas ausentes.
 */
const ROOT='https://site.api.espn.com/apis/site/v2/sports/';
const memo=new Map();
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\b(fc|cf|cd|ud|sd|club|de|del|la|el|football)\b/g,'')
  .replace(/[^a-z0-9]/g,'');
const toNum=x=>{
  if(x===null||x===undefined||x==='')return null;
  const n=Number(x);return Number.isFinite(n)?n:null;
};
const metric=(list,keys)=>{
  for(const item of list||[]){
    const id=String(item.name||item.abbreviation||'').toLowerCase().replace(/[^a-z]/g,'');
    if(keys.includes(id)){
      const n=toNum(item.value??item.displayValue);
      if(n!==null)return n;
    }
  }
  return null;
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function getJSON(url){
  const res=await fetch(url,{cache:'default',signal:AbortSignal.timeout(6500)});
  if(!res.ok)throw Error('HTTP '+res.status);
  return res.json();
}
export function parseSoccerRoster(summary,league,date){
  const out=[];
  for(const side of summary?.rosters||[]){
    const team=side.team?.displayName||side.team?.name;
    if(!team)continue;
    for(const item of side.roster||[]){
      const athlete=item.athlete||{};
      if(!athlete.displayName)continue;
      const stats=item.stats||[];
      const apps=metric(stats,['appearances','gamesplayed']);
      const minutes=metric(stats,['minutesplayed','minutes']);
      const yellow=metric(stats,['yellowcards','yellowcard']);
      const goals=metric(stats,['goals']);
      const assists=metric(stats,['assists']);
      const shots=metric(stats,['shots','totalshots']);
      if(apps!==null&&apps<=0)continue;
      if([apps,minutes,yellow,goals,assists,shots].every(x=>x===null))continue;
      out.push({id:String(athlete.id||norm(athlete.displayName)),name:athlete.displayName,
        team,date,league,apps,minutes,yellow,goals,assists,shots});
    }
  }
  return out;
}
function aggregate(players,team){
  const rows=players.filter(x=>norm(x.team)===norm(team));
  const aggregate=new Map();
  for(const p of rows){
    const key=p.id||norm(p.name);
    if(!aggregate.has(key))aggregate.set(key,{name:p.name,appearances:0,goals:0,assists:0,yellows:0,
      minutes:0,shots:0,coverage:{goals:0,assists:0,yellows:0,minutes:0,shots:0}});
    const x=aggregate.get(key);
    x.appearances+=p.apps??1;
    for(const [from,to] of [['goals','goals'],['assists','assists'],['yellow','yellows'],['minutes','minutes'],['shots','shots']]){
      if(p[from]!==null&&p[from]!==undefined){x[to]+=p[from];x.coverage[to]++;}
    }
  }
  return [...aggregate.values()].sort((a,b)=>b.appearances-a.appearances||b.goals-a.goals)
    .slice(0,18).map(x=>({...x,...Object.fromEntries(Object.keys(x.coverage).map(k=>
      [k,x.coverage[k]?x[k]:null]))}));
}
function fromHistory(history,match){
  const list=[];
  for(const game of history||[]){
    if(game?.date>=match.date)continue;
    for(const x of game.players||[]){
      if(x.appearance!==true||x.yellow===null||x.yellow===undefined)continue;
      list.push({id:String(x.id||''),name:x.name,team:x.team,date:game.date,
        apps:1,minutes:null,goals:null,assists:null,shots:null,yellow:x.yellow});
    }
  }
  return list;
}
const monthKey=date=>date.slice(0,7).replace('-','');
async function load(month,espn){
  const url=ROOT+espn+'/scoreboard?dates='+month+'&limit=500';
  return (await getJSON(url)).events||[];
}
async function fetchTeamGames(match,espn){
  const month=monthKey(match.date);
  const first=match.date.slice(0,8)+'01';
  const previous=new Date(first+'T12:00:00Z');
  previous.setUTCMonth(previous.getUTCMonth()-1);
  const months=[month,monthKey(previous.toISOString().slice(0,10))];
  const settled=await Promise.allSettled(months.map(m=>load(m,espn)));
  const events=settled.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
  const teams=[match.home,match.away];
  return teams.map(team=>events.filter(event=>{
    if(!event?.date||event.date.slice(0,10)>=match.date||event.status?.type?.state!=='post')return false;
    return (event.competitions?.[0]?.competitors||[]).some(x=>
      norm(x.team?.displayName||x.team?.name)===norm(team));
  }).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2)).flat()
    .filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i);
}
export async function loadSoccerPlayers(match,history,espnSlug){
  const initial=fromHistory(history,match);
  if(!espnSlug)return {teams:[match.home,match.away].map(name=>({name,players:aggregate(initial,name)})),
    source:'Historial local verificado',checked:0};
  let events=[];
  try{events=await fetchTeamGames(match,espnSlug)}catch{}
  const index=0;
  let offset=index;
  const observations=[...initial];
  async function worker(){
    while(offset<events.length){
      const event=events[offset++];
      try{
        const summary=await getJSON(ROOT+espnSlug+'/summary?event='+encodeURIComponent(event.id));
        observations.push(...parseSoccerRoster(summary,match.league,event.date.slice(0,10)));
      }catch{}
    }
  }
  await Promise.all([worker(),worker()]);
  return {teams:[match.home,match.away].map(name=>({name,players:aggregate(observations,name)})),
    checked:events.length,source:'ESPN · partidos anteriores y archivo local',coverage:observations.length};
}
export function getSoccerPlayers(match,history,slug){
  if(!memo.has(match.id))memo.set(match.id,loadSoccerPlayers(match,history,slug).catch(e=>{
    memo.delete(match.id);throw e;
  }));
  return memo.get(match.id);
}
function table(team){
  if(!team.players.length)return '<p class="source-note">Sin estadísticas individuales verificables de los últimos partidos.</p>';
  return '<div class="nba-player-scroll"><table class="nba-player-table"><thead><tr><th>Jugador</th><th>PJ</th><th>Goles</th><th>Asist.</th><th>Amar.</th><th>Min</th><th>Rem.</th></tr></thead><tbody>'
  +team.players.map(p=>'<tr>'+[
    p.name,p.appearances,p.goals??'—',p.assists??'—',p.yellows??'—',
    p.minutes??'—',p.shots??'—'
  ].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
export function renderSoccerPlayers(report){
  return '<div class="player-headnote">Datos de partidos anteriores: solo apariciones y estadísticas verificadas. No indican quién jugará el próximo encuentro.</div>'
    +report.teams.map(team=>'<section class="nba-detail-team"><h4>'+esc(team.name)+'</h4>'+table(team)+'</section>').join('')
    +'<p class="source-note">Fuente: '+esc(report.source)+'. Partidos adicionales consultados: '+report.checked+'. Un guion indica datos no disponibles, no cero.</p>';
}
