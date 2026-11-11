/** Calendario de Predix Sports. Las fechas de ESPN se muestran en la zona local del usuario. */
export function localDate(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(d.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const pick=type=>parts.find(p=>p.type===type)?.value;
  return [pick('year'),pick('month'),pick('day')].join('-');
}
/** Los CSV publican la fecha del encuentro ya como día de calendario. */
export function matchDay(match){
  if(match?.isoTime){
    const local=localDate(match.isoTime);
    if(local)return local;
  }
  return match?.date||null;
}
export function plusCalendarDays(yyyyMmDd,offset){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd||''));
  if(!match)return null;
  const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])+offset,12));
  return date.toISOString().slice(0,10);
}
export function dayTitle(day,today=localDate()){
  if(!day)return 'Fecha pendiente';
  const parsed=new Date(day+'T12:00:00Z');
  if(!Number.isFinite(parsed.getTime()))return day;
  const readable=new Intl.DateTimeFormat('es-ES',{
    weekday:'long',day:'numeric',month:'long',timeZone:'UTC'
  }).format(parsed);
  const dateLabel=readable.charAt(0).toUpperCase()+readable.slice(1);
  const prefix=day===today?'Hoy':day===plusCalendarDays(today,1)?'Mañana':null;
  return prefix?prefix+' · '+dateLabel:dateLabel;
}
/**
 * Agrupa en orden de aparición, que determina la vista (próximos primero,
 * historial después), y separa por competición dentro de cada fecha.
 * Nunca deduce partidos, horarios ni resultados.
 */
export function groupMatchesByDay(matches){
  const days=new Map();
  for(const match of matches){
    const date=matchDay(match);
    if(!date)continue;
    if(!days.has(date))days.set(date,{date,count:0,leagues:new Map()});
    const group=days.get(date);
    group.count++;
    const league=match.league||'unknown';
    if(!group.leagues.has(league))group.leagues.set(league,{league,matches:[]});
    group.leagues.get(league).matches.push(match);
  }
  return [...days.values()].map(group=>({
    date:group.date,count:group.count,leagues:[...group.leagues.values()]
  }));
}
