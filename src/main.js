import {LEAGUES,loadFootball,loadEspn,loadNBA,loadInternationalOrCup,loadCopaDelRey,loadPlayerCards,mergeLive} from './data.js';
import {predictFootball,predictNBA,predictPlayerBookings,brierScore,calibrate} from './model.js';
import {teamReport,headToHead} from './stats.js';
import {loadNbaTeamDetails,renderNbaTeamDetails} from './nba-details.js';
import {loadCache,saveCache,loadSnapshots,capturePredictions,gradePredictions,getFavorites,toggleFavorite,exportData,clearHistory} from './storage.js';

const $=s=>document.querySelector(s);
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>`${Math.round(n*100)}%`;
const parseDate=s=>new Date(`${s}T12:00:00Z`);
const dateText=s=>s?new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',timeZone:'UTC'}).format(parseDate(s)):'—';
const datetimeText=s=>s?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'—';
const nowDate=()=>new Date().toISOString().slice(0,10);
const plusDays=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);}
const state={data:loadCache(),league:'all',period:'90',query:'',view:'inicio',selected:null,loading:false,errors:{},updatedAt:null,playerHistory:[],playerCoverage:{},playerIssue:null};
const leagueKeys=Object.keys(LEAGUES);
const predictions=new Map();
let gradedPredictions=[];
let repaintTimer=null;
const nbaReports=new Map();
const nbaPending=new Set();
function scheduleRepaint(){clearTimeout(repaintTimer);repaintTimer=setTimeout(()=>{stamp();if(['inicio','futbol','nba'].includes(state.view))renderNormal();},110);}
function completeResults(m){
  const rows=state.data[m.league]?.results||[];
  return (m.league==='copadelrey'||m.league==='supercopa')
    ?[...rows,...(state.data.laliga?.results||[]),...(state.data.hypermotion?.results||[])]:rows;
}
function allResults(){return leagueKeys.flatMap(k=>state.data[k]?.results||[]);}
function allFixtures(){return leagueKeys.flatMap(k=>state.data[k]?.fixtures||[]);}
function allEvents(){return [...allFixtures(),...allResults()];}
function predFor(match){
  if(match.status!=='pre'&&match.status!=='in')return null;
  if(predictions.has(match.id))return predictions.get(match.id);
  const results=completeResults(match);
  const raw=match.sport==='nba'?predictNBA(match,results):predictFootball(match,results);
  if(!raw){predictions.set(match.id,null);return null;}
  const adjusted=calibrate(raw.probabilities,match.sport,gradedPredictions);
  const cupEstimate=match.league==='copadelrey'||match.league==='supercopa';
  const result={...raw,confidence:cupEstimate?'baja':raw.confidence,
    explanation:raw.explanation+(cupEstimate?' Estimación con históricos de clubes de diferentes competiciones; mayor incertidumbre.':''),
    probabilities:adjusted.probabilities,calibrated:adjusted.calibrated};
  predictions.set(match.id,result);return result;
}
function sealAndGrade(){
  gradePredictions(allResults());
  gradedPredictions=Object.values(loadSnapshots()).filter(x=>x.outcome);
  predictions.clear();
  const future=allFixtures().filter(m=>m.status==='pre'&&m.date>nowDate());
  capturePredictions(future.map(match=>({match,pred:predFor(match)})));
}
function matchesFiltered(){
  let events=allEvents();
  if(state.view==='futbol')events=events.filter(x=>x.sport==='soccer');
  if(state.view==='nba')events=events.filter(x=>x.sport==='nba');
  if(state.view==='futbol'&&state.league!=='all')events=events.filter(x=>x.league===state.league);
  if(state.query)events=events.filter(x=>`${x.home} ${x.away}`.toLowerCase().includes(state.query.toLowerCase()));
  const favs=getFavorites();
  if(state.period==='fav')events=events.filter(x=>favs.includes(x.id));
  else if(state.period!=='all'){
    const end=plusDays(Number(state.period));
    events=events.filter(x=>x.date>=nowDate()&&x.date<=end);
  }
  events.sort((a,b)=>a.date.localeCompare(b.date)||(a.isoTime||a.time||'').localeCompare(b.isoTime||b.time||''));
  if(state.period==='all'){
    events.sort((a,b)=>{
      const f=x=>x.date>=nowDate()?0:1;
      return f(a)-f(b) || (f(a)===0?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
    });
  }
  return events;
}
function badgeText(m){
  if(m.status==='in')return {label:'EN DIRECTO · ESPN',class:'live'};
  if(m.status==='post')return {label:'FINALIZADO',class:''};
  return {label:'PRÓXIMO',class:''};
}
function initials(team){return team.split(' ').filter(x=>x.length>1).slice(0,2).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function teamProfileHTML(m){
  const rows=completeResults(m);
  const end=m.status==='post'?null:m.date;
  const teams=[m.home,m.away];
  const fmtValue=(v,suffix='')=>v===null||v===undefined?'—':String(v)+suffix;
  const cards=teams.map(team=>{
    const x=teamReport(rows,team,m.sport,end);
    if(!x.played)return '<article class="team-profile"><h4>'+escapeHTML(team)+'</h4><p class="source-note">No hay partidos anteriores disponibles en esta fuente.</p></article>';
    const form=x.recent.map(v=>'<span class="form-dot '+v.result+'" title="'+escapeHTML(v.venue+' · '+v.for+'-'+v.against)+'">'+(v.result==='W'?'V':v.result==='D'?'E':'D')+'</span>').join('');
    const lines=[
      ['Partidos analizados',x.played],['Victorias / derrotas',x.wins+' / '+x.losses],
      ...(m.sport==='soccer'?[['Empates',x.draws]]:[]),
      ['Victorias (%)',fmtValue(x.winPct,'%')],
      ['Puntos '+(m.sport==='nba'?'anotados':'goles a favor')+' / partido',fmtValue(x.scored.for)],
      ['Puntos '+(m.sport==='nba'?'encajados':'goles en contra')+' / partido',fmtValue(x.scored.against)],
      ['En casa (V-'+(m.sport==='nba'?'D':'E-D')+')',m.sport==='nba'?x.home.wins+'-'+x.home.losses:x.home.wins+'-'+x.home.draws+'-'+x.home.losses],
      ['Fuera (V-'+(m.sport==='nba'?'D':'E-D')+')',m.sport==='nba'?x.away.wins+'-'+x.away.losses:x.away.wins+'-'+x.away.draws+'-'+x.away.losses],
      ['Últimos 10 · victorias',x.last10.wins+' / '+x.last10.played]
    ];
    if(m.sport==='soccer'){
      lines.push(['Porterías a cero',x.cleanSheets],['Ambos marcan',fmtValue(x.bothScore,'%')],['Más de 2,5 goles',fmtValue(x.over25,'%')]);
      const labels={Shots:'Remates',Target:'Remates a puerta',Corners:'Córners',Fouls:'Faltas',Yellow:'Amarillas',Red:'Rojas'};
      for(const [k,label] of Object.entries(labels)){
        const v=x.metrics[k];if(v.sample>=1)lines.push([label+' propios / rival',fmtValue(v.for)+' / '+fmtValue(v.against)+' ('+v.sample+' pj)']);
      }
    }
    return '<article class="team-profile"><h4>'+escapeHTML(team)+'</h4>'
      +'<div class="source-note">Últimos resultados (más reciente primero)</div><div class="team-form">'+(form||'—')+'</div>'
      +'<div class="team-stat-table">'+lines.map(([label,value])=>'<div><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong></div>').join('')+'</div>'
      +'</article>';
  });
  const h2h=headToHead(rows,m.home,m.away,end);
  const meeting=h2h.length?'<div class="source-note">Últimos enfrentamientos directos disponibles</div>'
    +'<div class="team-h2h">'+h2h.map(x=>'<div><span>'+escapeHTML(dateText(x.date))+'</span><b>'+escapeHTML(x.home)+' '+x.homeScore+'–'+x.awayScore+' '+escapeHTML(x.away)+'</b></div>').join('')+'</div>'
    :'<p class="source-note">No hay enfrentamientos directos registrados en la fuente consultada.</p>';
  return '<div class="detail-section"><h3>Radiografía de los equipos</h3><p class="source-note">Promedios calculados a partir de resultados anteriores disponibles; no son datos en vivo ni equivalen a estadísticas de toda la temporada si la fuente es incompleta.</p>'
    +'<div class="team-profiles">'+cards.join('')+'</div>'+meeting+'</div>';
}
function matchResult(m){
  if(m.status==='in'&&m.liveScore)return `<div class="outcome-big lime">${escapeHTML(m.liveScore)}</div><div class="outcome-small">Marcador ESPN</div>`;
  if(m.status==='in'&&Number.isFinite(m.homeScore))return `<div class="outcome-big lime">${m.homeScore} – ${m.awayScore}</div><div class="outcome-small">Marcador ESPN</div>`;
  if(m.status==='post')return `<div class="outcome-big">${m.homeScore} – ${m.awayScore}</div><div class="outcome-small">Resultado final</div>`;
  const p=predFor(m);
  if(!p)return `<div class="outcome-big">—</div><div class="outcome-small">Sin predicción</div>`;
  const pick=Object.entries(p.probabilities).sort((a,b)=>b[1]-a[1])[0];
  const outcome=pick[0]==='H'?'1':pick[0]==='D'?'X':'2';
  return `<div class="outcome-big lime">${fmt(pick[1])}</div><div class="outcome-small">Pronóstico ${outcome}</div>`;
}
function eventCard(m){
  const league=LEAGUES[m.league];const b=badgeText(m);
  const p=predFor(m);const text=m.isoTime?datetimeText(m.isoTime):`${dateText(m.date)} · ${m.time?m.time+'*':'Hora pendiente'}`;
  return `<button type="button" class="match-card ${state.selected===m.id?'selected':''}" data-match="${escapeHTML(m.id)}">
    <div class="match-card-top"><div class="comp-badge">${league.icon} ${escapeHTML(league.name)}</div><span class="date-text">${escapeHTML(text)}</span></div>
    <div class="match-line"><div class="teams"><div class="team-line"><span class="team-avatar">${escapeHTML(initials(m.home))}</span><b>${escapeHTML(m.home)}</b></div><div class="team-line"><span class="team-avatar">${escapeHTML(initials(m.away))}</span><b>${escapeHTML(m.away)}</b></div></div><div class="match-outcome">${matchResult(m)}</div></div>
    <div class="match-card-bottom"><span class="soft-tag ${b.class}">${b.label}</span><span>${p?`<span class="soft-tag ${p.confidence==='baja'?'low':'medium'}">Confianza ${p.confidence}</span>`:m.status==='post'?'Resultado verificado':'Datos limitados'}</span><span class="linkish">Analizar →</span></div>
  </button>`;
}
function forecastAnalysis(m,p){
  if(!p)return `<div class="disclaimer">No hay datos suficientes para generar un pronóstico, o los datos no se han actualizado. No se inventan probabilidades.</div>`;
  const isSoccer=m.sport==='soccer';
  const keys=isSoccer?['H','D','A']:['H','A'];
  const labels=isSoccer?['LOCAL','EMPATE','VISITANTE']:['LOCAL','VISITANTE'];
  const max=Math.max(...keys.map(k=>p.probabilities[k]));
  const probs=`<div class="probs ${isSoccer?'':'two'}">${keys.map((k,i)=>`<div class="prob-box ${p.probabilities[k]===max?'emph':''}"><div class="prob-val">${fmt(p.probabilities[k])}</div><div class="prob-label">${labels[i]}</div></div>`).join('')}</div>
    <div class="prob-track">${keys.map(k=>`<i style="width:${(p.probabilities[k]*100).toFixed(2)}%"></i>`).join('')}</div>`;
  const score=`<div class="projected-score"><div><b>${p.expectedHome}</b></div><span>${isSoccer?'GOLES ESPERADOS':'PUNTOS ESTIMADOS'}</span><div><b>${p.expectedAway}</b></div></div>`;
  const suggestions=isSoccer?
    `<div class="detail-section"><h3>Otros pronósticos</h3><div class="pred-list">
      <div class="pred-row"><div><div class="name">Más de 2,5 goles</div><div class="extra">Distribución Poisson</div></div><div class="value">${fmt(p.over25)}</div></div>
      <div class="pred-row"><div><div class="name">Ambos equipos marcan</div><div class="extra">Distribución Poisson</div></div><div class="value">${fmt(p.btts)}</div></div>
      ${p.markets.filter(x=>x.field!=='Yellow'||!p.yellowCards).map(x=>`<div class="pred-row"><div><div class="name">${escapeHTML(x.label)}</div><div class="extra">Media ${x.expected} · Más de ${x.threshold} (aprox.)</div></div><div class="value">${fmt(x.over)}</div></div>`).join('')}
      </div>${!p.markets.length?'<p class="source-note">Sin muestras suficientes de córners, faltas, tarjetas o remates; no se estiman.</p>':''}</div>`:
    `<div class="detail-section"><h3>Estimaciones NBA</h3><div class="detail-ministats"><div class="stat-cell"><span>Total de puntos</span><b>${p.total}</b></div><div class="stat-cell"><span>Diferencia local</span><b>${p.margin>0?'+':''}${p.margin}</b></div></div></div>`;
  const cards=isSoccer?(()=>{
    const c=p.yellowCards;
    const totals=c?'<div class="detail-ministats">'
      +'<div class="stat-cell"><span>Amarillas local</span><b>'+c.expectedHome+'</b></div>'
      +'<div class="stat-cell"><span>Amarillas visitante</span><b>'+c.expectedAway+'</b></div>'
      +'</div><div class="projected-score"><span>Amarillas totales esperadas</span><b>'+c.expectedTotal+'</b></div>'
      +'<div class="pred-list">'
      +[[2.5,c.over25],[3.5,c.over35],[4.5,c.over45],[5.5,c.over55]]
        .map(([line,prob])=>'<div class="pred-row"><div><div class="name">Más de '+line+' amarillas</div>'
        +'<div class="extra">Estimación Poisson · muestra '+c.sampleHome+'/'+c.sampleAway+' partidos</div></div>'
        +'<div class="value">'+fmt(prob)+'</div></div>').join('')
      +'</div><p class="source-note">'+escapeHTML(c.explanation)+'</p>'
      :'<p class="source-note">Tarjetas esperadas no disponibles: no hay suficientes partidos anteriores con amarillas por equipo.</p>';
    const all=predictPlayerBookings(m,state.playerHistory,40);
    const players=[...all.filter(x=>x.side==='home').slice(0,4),...all.filter(x=>x.side==='away').slice(0,4)]
      .sort((a,b)=>b.probability-a.probability);
    const playerHtml=players.length?
      '<div class="pred-list">'+players.map(x=>'<div class="pred-row"><div><div class="name">'
        +escapeHTML(x.name)+'</div><div class="extra">'+escapeHTML(x.team)
        +' · '+x.booked+' amonestaciones en '+x.played+' partidos observados'
        +' · muestra '+(x.confidence==='media'?'media':'reducida')+'</div></div>'
        +'<div class="value">'+fmt(x.probability)+'</div></div>').join('')+'</div>'
      :'<p class="source-note">No hay todavía un historial individual suficiente para mostrar porcentajes fiables de jugadores de este partido.</p>';
    return '<div class="detail-section"><h3>Tarjetas amarillas esperadas</h3>'+totals+'</div>'
      +'<div class="detail-section"><h3>Jugadores con mayor riesgo de amarilla</h3>'+playerHtml
      +'<p class="disclaimer">Probabilidades experimentales condicionadas a que el jugador participe. '
      +'No se conoce la alineación de forma anticipada. Se calculan con tarjetas y apariciones verificadas '
      +'de partidos anteriores, con suavizado; no son cuotas ni recomendaciones de apuesta.</p></div>';
  })():'';

  return `<div class="detail-section"><h3>${isSoccer?'Probabilidades 1X2':'Probabilidades de victoria'} <span class="soft-tag low">${p.confidence==='baja'?'BAJA CONFIANZA':'CONFIANZA MEDIA'}</span></h3>${probs}${score}
      ${isSoccer?`<p class="source-note">Marcadores más probables: ${p.scorelines.map(x=>`${x.home}-${x.away} (${fmt(x.p)})`).join(' · ')}</p>`:''}
    </div>${cards}${suggestions}
    <div class="detail-section"><h3>Cómo se calculó</h3><p class="source-note">${escapeHTML(p.explanation)}</p><p class="source-note">Partidos recientes considerados: <strong>${p.sampleHome}</strong> del local y <strong>${p.sampleAway}</strong> del visitante. ${p.calibrated?'Ajuste de calibración local activo.':'Sin calibración aprendida todavía (requiere al menos 20 predicciones evaluadas y muestras suficientes por rango).'}</p><div class="disclaimer">${m.status==='in'?'Marcador en directo, pero el pronóstico es PREPARTIDO: no reacciona a goles, faltas, lesiones ni posesiones en vivo. ':''}Estimaciones experimentales no contrastadas para decisiones económicas. No se calculan apuestas de valor sin cuotas fiables.</div></div>`;
}
function detailed(m){
  if(!m)return `<div class="detail-empty"><div class="detail-icon">◈</div><h3>Selecciona un partido</h3><p>Consulta probabilidades y métricas de cada encuentro.</p></div>`;
  const p=predFor(m);const fav=getFavorites().includes(m.id);
  const when=m.isoTime?datetimeText(m.isoTime):`${dateText(m.date)}${m.time?' · '+m.time+'*':''}`;
  const badge=m.status==='in'?'EN DIRECTO':m.status==='post'?'FINALIZADO':'ANTES DEL PARTIDO';
  const snapped=loadSnapshots()[m.id];
  const actual=m.status==='post'?`<div class="detail-section"><h3>Resultado real</h3><div class="projected-score"><b>${m.homeScore}</b><span>FINAL</span><b>${m.awayScore}</b></div>${snapped?.outcome?`<p class="source-note">Predicción guardada antes del partido · puntuación Brier: ${snapped.brier?.toFixed(3)}</p>`:'<p class="source-note">No consta predicción guardada antes de este encuentro. No se reconstruye usando datos posteriores.</p>'}</div>`:'';
  return `<div class="detail-top"><div class="eyebrow"><span class="eyebrow-line"></span> INFORME DEL PARTIDO</div><button class="icon-button ${fav?'favorited':''}" data-favorite="${escapeHTML(m.id)}" type="button" title="Añadir a favoritos">${fav?'★':'☆'}</button></div>
    <div class="detail-vs"><div class="detail-team"><div class="team-avatar">${escapeHTML(initials(m.home))}</div><strong>${escapeHTML(m.home)}</strong></div><div class="vs">VS</div><div class="detail-team"><div class="team-avatar">${escapeHTML(initials(m.away))}</div><strong>${escapeHTML(m.away)}</strong></div></div>
    <div class="detail-caption">${LEAGUES[m.league].icon} ${escapeHTML(LEAGUES[m.league].name)} · ${escapeHTML(when)} · <span class="tag-sub">${badge}</span></div>
    ${m.status==='post'?actual:forecastAnalysis(m,p)}
    ${teamProfileHTML(m)}
    ${m.sport==='nba'?'<div class="detail-section" id="nba-details">'+(nbaReports.get(m.id)?.teams?renderNbaTeamDetails(nbaReports.get(m.id)):nbaReports.get(m.id)?.error?'<h3>Estadísticas individuales NBA</h3><p class="source-note">'+escapeHTML(nbaReports.get(m.id).error)+'</p>':'<h3>Estadísticas individuales NBA</h3><p class="source-note">'+(nbaPending.has(m.id)?'Consultando los últimos partidos y sus fichas individuales…':'Al seleccionar este partido se consultarán sus estadísticas históricas.')+'</p>')+'</div>':''}
    <div class="detail-section"><h3>Origen de los datos</h3><p class="source-note">${escapeHTML(m.source)}. ${m.liveSource?'Marcador en vivo: '+escapeHTML(m.liveSource)+'. ':''}${m.timeNote?escapeHTML(m.timeNote)+'. ':''}La fecha y el inicio pueden cambiar. Actualiza para consultar información reciente.</p></div>`;
}
function displayMetrics(){
  const upcoming=allFixtures().filter(x=>x.date>=nowDate());
  const saved=Object.values(loadSnapshots());const graded=saved.filter(x=>x.outcome);
  const average=graded.length?graded.reduce((s,x)=>s+x.brier,0)/graded.length:null;
  const predicted=upcoming.filter(x=>!!predFor(x)).length;
  const items=[
    {label:'PRÓXIMOS PARTIDOS',value:upcoming.length,foot:'Calendarios disponibles',icon:'▦'},
    {label:'CON PRONÓSTICO',value:predicted,foot:'Modelo estadístico',icon:'◈'},
    {label:'PREDICCIONES EVALUADAS',value:graded.length,foot:'Registradas en este dispositivo',icon:'◷'},
    {label:'ERROR BRIER MEDIO',value:average===null?'—':average.toFixed(3),foot:'Menor es mejor · no equivale a acierto',icon:'◎'}
  ];
  $('#metrics').innerHTML=items.map(x=>`<div class="metric-box"><div class="metric-label">${x.label}<span class="metric-icon">${x.icon}</span></div><div class="metric-value">${x.value}</div><div class="metric-foot">${x.foot}</div></div>`).join('');
}
function sourceNotice(){
  const problems=Object.entries(state.errors).filter(([,v])=>v);
  const loaded=leagueKeys.filter(k=>state.data[k]&&(state.data[k].fixtures?.length||state.data[k].results?.length));
  const partial=leagueKeys.filter(k=>state.data[k]?.warning);
  if(!loaded.length){
    if(state.loading)return '<div class="notice ok">Buscando competiciones… Puedes navegar mientras se actualizan los datos.</div>';
    const detail=problems.map(([key,error])=>LEAGUES[key].name+': '+error).join(' | ');
    return '<div class="notice"><strong>No se han podido cargar partidos.</strong> '
      +'La web está abierta, pero no hemos obtenido un calendario válido. '
      +'Comprueba tu conexión y pulsa «Actualizar». '
      +(detail?'<details><summary>Detalles técnicos</summary><small>'+escapeHTML(detail)+'</small></details>':'')
      +'</div>';
  }
  if(state.loading)return '<div class="notice ok">Mostrando los datos disponibles. Se están actualizando las demás competiciones…</div>';
  if(problems.length||partial.length){
    const names=problems.map(([key])=>LEAGUES[key].name);
    const detail=problems.map(([key,error])=>LEAGUES[key].name+': '+error)
      .concat(partial.map(key=>LEAGUES[key].name+': '+state.data[key].warning)).join(' | ');
    return '<div class="notice">Se muestran '+loaded.length+' competiciones con datos. '
      +(names.length?'No disponibles ahora: '+escapeHTML(names.join(', '))+'. ':'')
      +'Los resultados pueden estar retrasados. '
      +'<details><summary>Ver detalles de conexión</summary><small>'+escapeHTML(detail)+'</small></details></div>';
  }
  return '<div class="notice ok">Calendarios y resultados cargados desde fuentes públicas. '
    +'Algunos datos se actualizan periódicamente y no son necesariamente en directo.</div>';
}
function renderNormal(){
  $('#content').innerHTML=`<section class="intro"><div><div class="eyebrow"><span class="eyebrow-line"></span> INTELIGENCIA DEPORTIVA</div><h1>Predicciones basadas <em>en datos.</em></h1><p>Analiza cada partido con estadísticas recientes, probabilidades transparentes y seguimiento de resultados.</p></div><div class="intro-graphic"><span class="glow-orbit orbit-one"></span><span class="glow-orbit orbit-two"></span><span class="graphic-p">P.</span></div></section>
    <section class="metrics" id="metrics"></section><section id="notice" aria-live="polite"></section>
    <section class="sport-switch" role="group" aria-label="Deporte"><button type="button" class="sport-tab ${state.view==='futbol'?'active':''}" data-view="futbol">⚽ Fútbol</button><button type="button" class="sport-tab ${state.view==='nba'?'active':''}" data-view="nba">🏀 NBA</button></section>
    <section class="section-heading"><div><div class="eyebrow small">${state.view==='inicio'?'EXPLORAR':state.view==='futbol'?'COMPETICIONES':'BALONCESTO'}</div><h2>${state.view==='inicio'?'Encuentros y pronósticos':state.view==='futbol'?'Partidos de fútbol':'Partidos de NBA'} <span class="accent-dot">.</span></h2></div><span class="small-muted" id="match-counter"></span></section>
    <div class="filter-bar"><div class="league-filters" id="league-filters"></div><div class="controls"><select id="period-filter" aria-label="Periodo"><option value="90">Próximos 90 días</option><option value="30">Próximos 30 días</option><option value="7">Próximos 7 días</option><option value="all">Todos</option><option value="fav">Favoritos</option></select><input type="search" id="search-input" placeholder="Buscar equipo..." aria-label="Buscar equipo" /></div></div>
    <div class="matches-grid"><div class="match-list" id="match-list"></div><section class="detail-panel" id="detail-panel" aria-live="polite"></section></div>`;
  $('#league-filters').innerHTML=state.view==='futbol'?`<button type="button" class="filter-pill ${state.league==='all'?'active':''}" data-league="all">◈ Todas las ligas</button>`+leagueKeys.filter(k=>LEAGUES[k].sport==='soccer').map(k=>`<button type="button" class="filter-pill ${state.league===k?'active':''}" data-league="${k}">${LEAGUES[k].icon} ${LEAGUES[k].name}</button>`).join(''):'';
  $('#period-filter').value=state.period;$('#search-input').value=state.query;
  renderMatchArea();displayMetrics();$('#notice').innerHTML=sourceNotice();
}
async function hydrateNbaDetail(match){
  if(!match||match.sport!=='nba')return;
  if(nbaReports.has(match.id)||nbaPending.has(match.id))return;
  nbaPending.add(match.id);
  try{
    const report=await loadNbaTeamDetails(match,state.data.nba?.results||[]);
    nbaReports.set(match.id,report);
  }catch(error){
    nbaReports.set(match.id,{error:error.message||'Fuente no disponible'});
  }finally{
    nbaPending.delete(match.id);
    if(match.id===state.selected&&$('#detail-panel')){
      const current=allEvents().find(e=>e.id===match.id);
      if(current)$('#detail-panel').innerHTML=detailed(current);
    }
  }
}
function renderMatchArea(){
  if(!$('#match-list'))return;
  const events=matchesFiltered();
  const soccer=events.filter(x=>x.sport==='soccer'),basketball=events.filter(x=>x.sport==='nba');
  $('#match-counter').textContent=state.view==='inicio'?`${soccer.length} fútbol · ${basketball.length} NBA`:`${events.length} partidos`;
  const displayed=state.view==='inicio'?[...soccer.slice(0,12),...basketball.slice(0,10)]:events.slice(0,150);
  const group=(title,icon,items,view,max)=>'<div class="sport-group"><div class="sport-group-head"><h3>'+icon+' '+title+'</h3><button type="button" class="simple-btn secondary" data-view="'+view+'">Ver '+title.toLowerCase()+' →</button></div>'+(items.length?items.slice(0,max).map(eventCard).join(''):'<div class="empty-state">Sin encuentros disponibles para este periodo.</div>')+'</div>';
  $('#match-list').innerHTML=state.view==='inicio'?group('Fútbol','⚽',soccer,'futbol',12)+group('NBA','🏀',basketball,'nba',10):displayed.length?displayed.map(eventCard).join(''):
    `<div class="empty-state">No hay partidos dentro de este periodo o faltan datos de las fuentes.<br><button type="button" class="simple-btn" data-show-all>Ver todos los partidos disponibles</button></div>`;
  if(!displayed.some(m=>m.id===state.selected))state.selected=displayed[0]?.id||null;
  const match=displayed.find(m=>m.id===state.selected);
  $('#detail-panel').innerHTML=detailed(match);
  if(match?.sport==='nba')hydrateNbaDetail(match);
  if(state.view!=='inicio'&&events.length>150)$('#match-list').insertAdjacentHTML('beforeend','<div class="empty-state">Mostrando los primeros 150 encuentros.</div>');
}
function renderHistory(){
  const records=Object.values(loadSnapshots()).sort((a,b)=>b.date.localeCompare(a.date));
  const graded=records.filter(x=>x.outcome);const pending=records.filter(x=>!x.outcome);
  const brier=graded.length?(graded.reduce((s,x)=>s+x.brier,0)/graded.length).toFixed(3):'—';
  $('#content').innerHTML=`<div class="eyebrow"><span class="eyebrow-line"></span> REGISTRO LOCAL</div><h1>Historial <em>de predicciones.</em></h1><p class="source-note">Los pronósticos se registran antes del encuentro y se califican cuando consultas los resultados después. Todo permanece en este dispositivo.</p>
    <section class="metrics"><div class="metric-box"><div class="metric-label">REGISTRADAS</div><div class="metric-value">${records.length}</div></div><div class="metric-box"><div class="metric-label">EVALUADAS</div><div class="metric-value">${graded.length}</div></div><div class="metric-box"><div class="metric-label">PENDIENTES</div><div class="metric-value">${pending.length}</div></div><div class="metric-box"><div class="metric-label">BRIER MEDIO</div><div class="metric-value">${brier}</div></div></section>
    <section class="text-panel"><h3>Aprendizaje verificable</h3><p>El motor conserva probabilidades antes del partido y calcula su error cuando llega el resultado. Con al menos 20 predicciones evaluadas y suficientes observaciones por grupo, aplica un ajuste de calibración suave a futuras estimaciones. <strong>Esto no significa que mejore siempre ni que exista una IA reentrenada.</strong> La puntuación Brier penaliza predicciones seguras equivocadas; cuanto menor, mejor.</p><button type="button" class="simple-btn" id="export-data">↓ Exportar datos JSON</button><button type="button" class="simple-btn secondary" id="clear-history">Borrar historial</button></section>
    <section class="text-panel"><h3>Registros (${records.length})</h3>${records.length?records.slice(0,100).map(r=>`<div class="history-item"><div><b>${escapeHTML(r.home)} – ${escapeHTML(r.away)}</b><br><small>${escapeHTML(LEAGUES[r.league]?.name||r.league)} · ${dateText(r.date)} · ${r.outcome?'Resultado '+escapeHTML(r.actual):'Pendiente'}</small></div><div class="grade">${r.outcome?'Brier '+r.brier.toFixed(3):'PENDIENTE'}</div></div>`).join(''):'<p>El historial aparecerá cuando guardemos predicciones de partidos futuros. No se crea con partidos ya disputados.</p>'}</section>`;
  $('#export-data').addEventListener('click',()=>{
    const blob=new Blob([exportData()],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='predix-historial.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#clear-history').addEventListener('click',()=>{if(confirm('¿Borrar definitivamente el historial de predicciones guardado en este dispositivo?')){clearHistory();renderHistory();toast('Historial eliminado');}});
}
function renderSources(){
  $('#content').innerHTML=`<div class="eyebrow"><span class="eyebrow-line"></span> TRANSPARENCIA</div><h1>Fuentes y <em>metodología.</em></h1>
    <section class="text-panel"><h3>Fútbol · open-matchday</h3><p>Fuente CSV pública para LaLiga, Hypermotion, Premier League, Bundesliga, Ligue 1, Copa del Rey y Champions. Actualización normalmente diaria. Incluye resultados, próximos partidos y, cuando los hay, remates, faltas, córners y tarjetas.</p><p><a target="_blank" rel="noopener noreferrer" href="https://github.com/oladeeayo/open-matchday">Ver fuente y condiciones de uso ↗</a></p><p>Licencia para uso informativo no comercial. No incluye alineaciones, lesiones confirmadas ni cuotas; las horas publicadas son aproximadas y algunas figuran como provisionales.</p></section>
    <section class="text-panel"><h3>NBA, Nations League y Supercopa · fuentes públicas</h3><p>Consulta mensual de marcadores de ESPN sin API key y alternativa de calendario NBA desde NBA CDN. Para Naciones y Supercopa se emplean los partidos que el proveedor publique. No garantizamos cobertura ni directo. Estos servicios pueden bloquear peticiones, retrasar resultados o cambiar su formato. Se muestran errores y se conserva un caché local si ya existía uno.</p><p><a target="_blank" rel="noopener noreferrer" href="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard">Ver endpoint NBA ↗</a></p><p><a target="_blank" rel="noopener noreferrer" href="https://www.boxscorelab.com/downloads/">Descargas adicionales NBA: BoxScore Lab ↗</a> (referencia complementaria, no conectada al modelo en esta versión).</p></section>
    <section class="text-panel"><h3>Estadísticas individuales NBA</h3><p>Al abrir un encuentro NBA se consultan bajo demanda las fichas de hasta tres partidos anteriores por equipo, cuando existen. Se muestran promedios observados de puntos, rebotes, asistencias, robos, tapones, pérdidas y porcentajes de tiro. Fuente principal ESPN y alternativa NBA CDN. Las peticiones pueden bloquearse o carecer de datos, y las cifras no equivalen a estadísticas de temporada ni se incorporan por ahora al modelo predictivo.</p></section>
    <section class="text-panel"><h3>Tarjetas por jugadores</h3><p>El histórico individual recoge apariciones y amarillas documentadas en informes de partidos de ESPN; sólo se usan partidos ya finalizados. La probabilidad individual es una frecuencia suavizada y condicionada a participar, no predice convocatorias ni garantiza amonestaciones. Si faltan datos, se oculta el porcentaje.</p></section>
    <section class="text-panel"><h3>Modelo estadístico</h3><ul><li>Fútbol: distribuciones Poisson para goles, ataque y defensa de los últimos diez partidos, regularización hacia la media de la liga.</li><li>Córners, faltas, tarjetas y remates: medias suavizadas de los equipos con muestra mínima; las probabilidades de superar un umbral son aproximaciones Poisson.</li><li>NBA: medias recientes de puntos anotados y recibidos, con margen heurístico y una función logística <strong>no calibrada</strong>.</li><li>Aprendizaje: evaluación Brier y ajuste de calibración únicamente sobre predicciones guardadas antes de jugarse el partido. No hay entrenamiento neuronal ni garantía de mejora.</li><li>Partidos en directo: solo se actualiza el marcador bajo demanda. Las predicciones no se recalculan en función del juego en vivo.</li></ul><p class="disclaimer">Las probabilidades son estimaciones experimentales; no se han validado externamente. No hay cuotas ni recomendaciones de apuesta de valor, porque no podemos verificar el precio real del mercado.</p></section>
    <section class="text-panel"><h3>Privacidad y alojamiento</h3><p>Historial, caché y favoritos viven en <code>localStorage</code>. No existe cuenta ni servidor propio. Si borras datos del navegador o cambias de móvil, se perderán salvo que exportes tu historial.</p><p>En GitHub Pages el sitio y su código serían públicos, <strong>aunque tu historial local seguiría en tu dispositivo</strong>. No pongas información privada en los archivos que publiques.</p></section>`;
}
function render(){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  $('#crumb-title').textContent={inicio:'Resumen',futbol:'Fútbol',nba:'NBA',historial:'Historial',fuentes:'Fuentes y método'}[state.view];
  if(state.view==='historial')renderHistory();else if(state.view==='fuentes')renderSources();else renderNormal();
}
function stamp(){
  const vals=leagueKeys.map(k=>state.data[k]?.updatedAt).filter(Boolean).sort();
  $('#last-update').textContent=vals.length?`Consulta: ${datetimeText(vals.at(-1))}`:'Sin consultar';
}
async function refresh(){
  if(state.loading)return;
  state.loading=true;
  state.errors={};
  $('#refresh-btn').disabled=true;$('#refresh-btn .refresh-icon').textContent='◌';
  if(state.view==='inicio'||state.view==='partidos')$('#notice').innerHTML=sourceNotice();
  nbaReports.clear();
  // Cada competición se incorpora en cuanto su fuente responde, sin esperar al resto.
  const jobs=leagueKeys.map(async k=>{
    try{
      const fresh=k==='nba'?await loadNBA():k==='copadelrey'?await loadCopaDelRey():LEAGUES[k].folder?await loadFootball(k):await loadInternationalOrCup(k);
      state.data[k]=fresh;
      state.errors[k]=null;
      predictions.clear();
      // Guardar progresivamente: si otra fuente falla, los datos disponibles se conservan.
      saveCache(state.data);
      scheduleRepaint();
      // El marcador ESPN es optativo. No debe bloquear la primera renderización.
      if(k!=='nba'&&k!=='copadelrey'&&LEAGUES[k].folder){
        loadEspn(k,{recentOnly:true}).then(live=>{
          if(state.data[k]!==fresh)return;
          state.data[k]={...fresh,fixtures:mergeLive(fresh.fixtures,live.fixtures)};
          saveCache(state.data);scheduleRepaint();
        }).catch(()=>{});
      }
    }catch(error){
      state.errors[k]=error.message||'Error de conexión';
      scheduleRepaint();
    }
  });
  await Promise.allSettled(jobs);
  sealAndGrade();saveCache(state.data);
  state.loading=false;
  $('#refresh-btn').disabled=false;$('#refresh-btn .refresh-icon').textContent='↻';
  scheduleRepaint();
  if(Object.values(state.errors).some(Boolean))toast('Algunas fuentes no respondieron; se mantienen los datos anteriores');
  else toast('Datos actualizados');
  // El historial de jugadores es secundario y puede ser lento; cargarlo DESPUÉS del calendario.
  loadPlayerCards().then(players=>{
    state.playerHistory=players.matches;
    state.playerCoverage=players.coverage;
    state.playerIssue=null;
    if($('#detail-panel')&&['inicio','futbol','nba'].includes(state.view)){
      const match=allEvents().find(x=>x.id===state.selected);
      if(match)$('#detail-panel').innerHTML=detailed(match);
    }
  }).catch(error=>{state.playerIssue=error.message||'Datos individuales no disponibles';});
}
function bindEvents(){
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-view]');
    if(nav){state.view=nav.dataset.view;window.location.hash=state.view;render();window.scrollTo({top:0,behavior:'smooth'});return;}
    if(e.target.closest('[data-show-all]')){state.period='all';renderNormal();return;}
    const league=e.target.closest('[data-league]');
    if(league){state.league=league.dataset.league;renderNormal();return;}
    const match=e.target.closest('[data-match]');
    if(match){state.selected=match.dataset.match;renderMatchArea();if(innerWidth<701)$('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'});return;}
    const fav=e.target.closest('[data-favorite]');
    if(fav){toggleFavorite(fav.dataset.favorite);renderMatchArea();toast('Favoritos actualizados');}
  });
  document.addEventListener('change',e=>{if(e.target.id==='period-filter'){state.period=e.target.value;renderMatchArea();}});
  document.addEventListener('input',e=>{if(e.target.id==='search-input'){state.query=e.target.value;renderMatchArea();}});
  $('#refresh-btn').addEventListener('click',refresh);
  window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(['inicio','futbol','nba','historial','fuentes'].includes(h)&&h!==state.view){state.view=h;render();}});
}
async function init(){
  const hash=location.hash.slice(1);if(['inicio','futbol','nba','historial','fuentes'].includes(hash))state.view=hash;
  if(hash==='partidos'){state.view='futbol';history.replaceState(null,'','#futbol');}
  bindEvents();stamp();render();
  if('serviceWorker' in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  refresh();
}
init();
