/* Fuentes: open-matchday (fútbol; CSV diario) y ESPN no oficial (NBA/live; puede fallar). */
export const LEAGUES={
  laliga:{name:'LaLiga',icon:'🇪🇸',sport:'soccer',folder:'ESP_1_la-liga',espn:'soccer/esp.1'},
  hypermotion:{name:'LaLiga Hypermotion',icon:'🇪🇸',sport:'soccer',folder:'ESP_2_segunda-division',espn:'soccer/esp.2'},
  premier:{name:'Premier League',icon:'🏴',sport:'soccer',folder:'ENG_1_premier-league',espn:'soccer/eng.1'},
  champions:{name:'Champions League',icon:'⭐',sport:'soccer',folder:'UEFA_1_champions-league',espn:'soccer/uefa.champions'},
  copadelrey:{name:'Copa del Rey',icon:'🏆',sport:'soccer',folder:'ESP_CUP_copa-del-rey',espn:'soccer/esp.copa_del_rey'},
  supercopa:{name:'Supercopa de España',icon:'🥇',sport:'soccer',espn:'soccer/esp.super_cup'},
  nations:{name:'UEFA Nations League',icon:'🌍',sport:'soccer',espn:'soccer/uefa.nations'},
  nba:{name:'NBA',icon:'🏀',sport:'nba',espn:'basketball/nba'}
};
const ROOT='https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data';
const BACKUP='https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data';
const ESPN='https://site.api.espn.com/apis/site/v2/sports';
const SEASON='2627'; // Cambiar cuando el proyecto de origen publique temporada siguiente.
const iso=d=>d.toISOString().slice(0,10);
const utcDay=(d,delta)=>new Date(d.getTime()+delta*86400000);
const compact=d=>iso(d).replaceAll('-','');
export const isNumber = x => x!==null && x!==undefined && x!=='' && Number.isFinite(Number(x));
const score=x => isNumber(x)?Number(x):null;

/** RFC4180 (incluye comillas escapadas y CRLF). */
export function parseCSV(csv){
  const records=[];let row=[],field='',quoted=false;
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(c==='"'){
      if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&csv[i+1]==='\n')i++;
      row.push(field);field='';if(row.some(Boolean))records.push(row);row=[];
    }else field+=c;
  }
  row.push(field);if(row.some(Boolean))records.push(row);
  const headings=records.shift()?.map((x,i)=>i===0?x.replace(/^\uFEFF/,''):x)||[];
  return records.map(items=>Object.fromEntries(headings.map((h,i)=>[h,items[i]??''])));
}
export function normalizeFootball(rows,league,isFixture=false){
  return rows.filter(r=>r.date&&r.home&&r.away).map(r=>({
    id:`${league}:${r.date}:${r.home}:${r.away}`,
    league,sport:'soccer',home:r.home,away:r.away,date:r.date,
    time:r.time&&r.time!=='01:00'?r.time:null, // proveedores usan 01:00 como valor provisional en muchos calendarios
    // No afirmar hora local exacta: la fuente usa una convención CET-1 constante.
    timeNote:r.time==='01:00'?'Hora por confirmar':'Hora orientativa (CET fijo)',
    gw:r.gw,homeScore:isFixture?null:score(r.ft_home),awayScore:isFixture?null:score(r.ft_away),
    status:isFixture?'pre':'post',source:'open-matchday',
    homeShots:score(r.home_shots),awayShots:score(r.away_shots),
    homeTarget:score(r.home_target),awayTarget:score(r.away_target),
    homeFouls:score(r.home_fouls),awayFouls:score(r.away_fouls),
    homeCorners:score(r.home_corners),awayCorners:score(r.away_corners),
    homeYellow:score(r.home_yellow),awayYellow:score(r.away_yellow),
    homeRed:score(r.home_red),awayRed:score(r.away_red)
  }));
}
async function getText(url){
  const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.text();
}
/**
 * Primero usa el espejo CSV de GitHub Pages (mismo origen, sin bloqueo CORS).
 * Si aún no se ha publicado, prueba el origen público y su respaldo.
 * Resultados y calendario se solicitan por separado para evitar perder ambos
 * cuando solo falla uno de ellos. No fabrica partidos.
 */
export async function loadFootball(league){
  const folder=LEAGUES[league].folder;
  async function getFeed(kind){
    const candidates=[
      './feeds/'+folder+'_'+kind+'.csv',
      ROOT+'/'+folder+'/'+kind+'_'+SEASON+'.csv',
      BACKUP+'/'+folder+'/'+kind+'_'+SEASON+'.csv'
    ];
    let lastError;
    for(const url of candidates){
      try{
        const csv=await getText(url);
        if(!csv.replace(/^\uFEFF/,'').startsWith('gw,date,time,home,away'))throw new Error('Cabecera CSV inesperada');
        const parsed=parseCSV(csv);
        if(!parsed.length)throw new Error('CSV sin encuentros');
        return {rows:parsed,origin:url.startsWith('./')?'espejo en GitHub Pages':'origen remoto'};
      }catch(error){lastError=error;}
    }
    throw new Error(kind+': '+(lastError?.message||'sin respuesta'));
  }
  const [history,calendar]=await Promise.allSettled([getFeed('results'),getFeed('fixtures')]);
  const results=history.status==='fulfilled'?normalizeFootball(history.value.rows,league):[];
  const fixtures=calendar.status==='fulfilled'?normalizeFootball(calendar.value.rows,league,true):[];
  if(!results.length&&!fixtures.length){
    throw new Error([history,calendar].filter(x=>x.status==='rejected').map(x=>x.reason?.message).join('; ')||'Sin partidos');
  }
  return {results,fixtures,
    source:'open-matchday'+((history.status==='fulfilled'&&history.value.origin==='espejo en GitHub Pages')?' (copia alojada en esta web)':' (fuente pública)'),
    updatedAt:new Date().toISOString(),
    warning:history.status==='rejected'?'No se pudieron cargar resultados históricos':calendar.status==='rejected'?'No se pudo cargar el calendario':null};
}
function espnEvent(e,league){
  const c=e.competitions?.[0];if(!c)return null;
  const h=c.competitors?.find(t=>t.homeAway==='home'),a=c.competitors?.find(t=>t.homeAway==='away');
  if(!h?.team||!a?.team)return null;
  const s=e.status?.type?.state||'pre';
  return {id:`${league}:espn:${e.id}`,league,sport:LEAGUES[league].sport,
    home:h.team.displayName||h.team.name,away:a.team.displayName||a.team.name,
    homeShort:h.team.shortDisplayName||h.team.abbreviation,
    awayShort:a.team.shortDisplayName||a.team.abbreviation,
    date:(e.date||'').slice(0,10),isoTime:e.date||null,
    status:s==='in'?'in':s==='post'?'post':'pre',
    statusText:e.status?.type?.shortDetail||'',
    homeScore:s==='pre'?null:score(h.score),awayScore:s==='pre'?null:score(a.score),source:'ESPN (no oficial)'};
}

/** Un mes por petición. ESPN devuelve HTTP 400 para intervalos largos de fechas. */
export function monthKeys(now=new Date(),monthsBack=2,monthsForward=3){
  const keys=[];
  for(let offset=-monthsBack;offset<=monthsForward;offset++){
    const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+offset,1));
    keys.push(String(d.getUTCFullYear())+String(d.getUTCMonth()+1).padStart(2,'0'));
  }
  return keys;
}
function fromEspnEvents(events,league,source='ESPN (no oficial)',updatedAt=new Date().toISOString(),warning=null){
  const unique=new Map(events.map(e=>espnEvent(e,league)).filter(Boolean).map(e=>[e.id,e]));
  const all=[...unique.values()];
  return {results:all.filter(x=>x.status==='post'),
    fixtures:all.filter(x=>x.status!=='post'),source,updatedAt,warning};
}
async function loadPublishedSnapshot(league){
  const raw=JSON.parse(await getText('./feeds/'+league+'.json'));
  if(!Array.isArray(raw.events))throw new Error('Copia de '+league+' sin eventos');
  return fromEspnEvents(raw.events,league,'ESPN (copia pública; puede estar retrasada)',raw.fetchedAt||null,
    'Información guardada en la última sincronización; puede estar retrasada');
}
export async function loadEspn(league,{nbaHistory=false,recentOnly=false}={}){
  const path=LEAGUES[league]?.espn;
  if(!path)throw new Error('Liga sin identificador ESPN');
  const keys=recentOnly?monthKeys(new Date(),0,1):nbaHistory?monthKeys(new Date(),2,2):monthKeys(new Date(),2,4);
  const responses=await Promise.allSettled(keys.map(async month=>{
    const url=ESPN+'/'+path+'/scoreboard?dates='+month+'&limit=500';
    const data=JSON.parse(await getText(url));
    if(!Array.isArray(data.events))throw new Error('Respuesta ESPN inesperada ('+month+')');
    return data.events;
  }));
  const good=responses.filter(r=>r.status==='fulfilled').map(r=>r.value);
  if(!good.length)throw new Error('ESPN no respondió a ninguna consulta mensual');
  const result=fromEspnEvents(good.flat(),league);
  if(good.length<responses.length)result.warning='Algunos meses no respondieron; calendario posiblemente incompleto';
  return result;
}
function nbaCdnEvent(g){
  const home=g.homeTeam,away=g.awayTeam;
  if(!home?.teamName||!away?.teamName||!g.gameId)return null;
  const t=g.gameDateTimeUTC||g.gameDateUTC||g.gameDateTimeEst||g.gameDateEst;
  if(!t)return null;
  const date=new Date(t);
  if(!Number.isFinite(date.getTime()))return null;
  const isoTime=date.toISOString();
  const s=Number(g.gameStatus)||1;
  const h=score(home.score),a=score(away.score);
  const status=s===2?'in':s===3&&h!==null&&a!==null?'post':'pre';
  return {id:'nba:official:'+g.gameId,league:'nba',sport:'nba',
    home:[home.teamCity,home.teamName].filter(Boolean).join(' '),
    away:[away.teamCity,away.teamName].filter(Boolean).join(' '),
    homeShort:home.teamTricode,awayShort:away.teamTricode,
    date:isoTime.slice(0,10),isoTime,status,
    homeScore:status==='pre'?null:h,awayScore:status==='pre'?null:a,
    statusText:g.gameStatusText||'',source:'NBA CDN (público; no garantizado)'};
}
export function nbaCdnSchedule(data,now=new Date()){
  const days=data?.leagueSchedule?.gameDates||[];
  const events=days.flatMap(d=>d.games||[]).map(nbaCdnEvent).filter(Boolean);
  const min=new Date(now.getTime()-65*86400000).toISOString().slice(0,10);
  const max=new Date(now.getTime()+95*86400000).toISOString().slice(0,10);
  const visible=events.filter(e=>e.date>=min&&e.date<=max);
  return {results:visible.filter(x=>x.status==='post'),fixtures:visible.filter(x=>x.status!=='post'),
    source:'NBA CDN (calendario público)',updatedAt:new Date().toISOString(),
    warning:'Calendario de NBA; marcadores en vivo solo si el proveedor los incluye'};
}
async function loadOfficialNba(){
  let lastError;
  for(const url of [
    'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json',
    'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json'
  ]){
    try{
      const data=JSON.parse(await getText(url));
      const normalized=nbaCdnSchedule(data);
      if(normalized.results.length+normalized.fixtures.length>0)return normalized;
      throw new Error('Calendario oficial sin encuentros válidos');
    }catch(err){lastError=err;}
  }
  throw lastError||new Error('No se pudo leer calendario de NBA');
}
/** NBA sin claves: ESPN mensual, copia sincronizada y calendario oficial alternativo. */
export async function loadNBA(){
  const errors=[];
  for(const task of [
    ()=>loadEspn('nba',{nbaHistory:true}),
    ()=>loadPublishedSnapshot('nba'),
    ()=>loadOfficialNba()
  ]){
    try{
      const result=await task();
      if(result.results.length+result.fixtures.length>0)return result;
      errors.push('Fuente sin partidos');
    }catch(error){errors.push(error.message||String(error));}
  }
  throw new Error('NBA no disponible: '+errors.join(' / '));
}
/** Copas y Nations League: ESPN directo y, cuando exista, copia sin conexión CORS. */
export async function loadInternationalOrCup(league){
  const errors=[];
  for(const task of [()=>loadEspn(league),()=>loadPublishedSnapshot(league)]){
    try{
      const result=await task();
      if(result.results.length+result.fixtures.length>0)return result;
      errors.push('Sin encuentros en el intervalo consultado');
    }catch(error){errors.push(error.message||String(error));}
  }
  throw new Error(errors.join(' / '));
}
const simpl=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/\b(fc|cf|club|football|de|la|el|the|united|city|atletico|real)\b/g,'').replace(/[^a-z0-9]/g,'');
function similarName(x,y){const a=simpl(x),b=simpl(y);return a.length>=4 && b.length>=4 && (a===b || (Math.min(a.length,b.length)>=6 && (a.includes(b)||b.includes(a))));}
/** Solo añade resultados en directo si es posible emparejar inequívocamente el partido. */
export function mergeLive(football,espn){
  const seen=new Set();
  return football.map(f=>{
    const matches=espn.filter(e=>{
      const days=Math.abs((new Date(f.date+'T12:00:00Z')-new Date(e.date+'T12:00:00Z'))/86400000);
      return days<=1 && similarName(f.home,e.home)&&similarName(f.away,e.away);
    });
    if(matches.length!==1||seen.has(matches[0].id))return f;
    const e=matches[0];seen.add(e.id);
    return {...f,liveStatus:e.status,status:e.status==='in'?'in':f.status,
      liveScore:e.status==='in'?`${e.homeScore} – ${e.awayScore}`:null,
      statusText:e.statusText,liveSource:'ESPN (no oficial)'};
  });
}
