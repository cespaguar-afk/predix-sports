/**
 * Visualización de mercados futbolísticos basada exclusivamente en muestras
 * observadas anteriormente y estimaciones existentes del modelo.
 * Nunca convierte datos ausentes en ceros ni presenta confianza como certeza.
 */
const html=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>typeof v==='number'&&Number.isFinite(v);
const round=v=>num(v)?(Number.isInteger(v)?String(v):v.toFixed(1)):'—';
const pct=v=>num(v)&&v>=0&&v<=1?Math.round(v*100)+'%':'—';
const MARKET_TYPES=[
  {field:'Corners',icon:'◩',short:'Córners',desc:'Córners totales'},
  {field:'Yellow',icon:'▣',short:'Tarjetas',desc:'Tarjetas amarillas'},
  {field:'Fouls',icon:'◈',short:'Faltas',desc:'Faltas totales'},
  {field:'Target',icon:'◎',short:'A puerta',desc:'Remates a puerta'},
  {field:'Shots',icon:'↗',short:'Remates',desc:'Remates totales'},
  {field:'Corners1H',icon:'◩',short:'Córners 1T',desc:'Córners primera parte'},
  {field:'Corners2H',icon:'◩',short:'Córners 2T',desc:'Córners segunda parte'}
];
const textField=(field,markets)=>markets.find(x=>x.field===field);
export function marketItems(pred){
  const markets=Array.isArray(pred?.markets)?pred.markets:[];
  return MARKET_TYPES.map(descriptor=>{
    const record=textField(descriptor.field,markets);
    return {...descriptor,record:record&&num(record.expected)?record:null};
  });
}
function marketCard({field,icon,short,desc,record}){
  if(!record){
    return '<article class="market-card market-unavailable"><div class="market-card-top"><span class="market-icon">'
      +icon+'</span><b>'+html(short)+'</b></div><p class="market-empty">Datos insuficientes</p>'
      +'<small>Faltan partidos anteriores con esta estadística.</small></article>';
  }
  const coverage=num(record.samples)?record.samples:record.sampleHome??0;
  const side=num(record.expectedHome)&&num(record.expectedAway)
    ?'<div class="market-sides"><span>Local <strong>'+round(record.expectedHome)+'</strong></span>'
      +'<span>Visitante <strong>'+round(record.expectedAway)+'</strong></span></div>':'';
  const prob=num(record.over)?'<div class="market-line"><span>Más de '+html(record.threshold)+'</span><strong>'+pct(record.over)+'</strong></div>':'';
  return '<article class="market-card"><div class="market-card-top"><span class="market-icon">'+icon+'</span><b>'+html(short)+'</b></div>'
    +'<div class="market-main"><strong>'+round(record.expected)+'</strong><span>estimados</span></div>'
    +side+prob+'<small>'+coverage+' partidos por equipo (mín.) · aproximación estadística</small>'
    +'</article>';
}
export function renderMarketForecast(pred){
  if(!pred||pred.sport!=='soccer')return '';
  const items=marketItems(pred);
  const count=items.filter(x=>x.record).length;
  return '<section class="detail-section market-section"><div class="market-heading">'
    +'<div><h3>Mercados del partido</h3><p class="source-note">Proyección de estadísticas de ambos equipos en los últimos encuentros disponibles.</p></div>'
    +'<span class="market-coverage">'+count+'/'+items.length+' con datos</span></div>'
    +'<div class="market-grid">'+items.map(marketCard).join('')+'</div>'
    +'<p class="source-note">Las probabilidades de superar una línea se aproximan mediante una distribución de Poisson. '
    +'No están calibradas individualmente; en faltas y remates esta aproximación puede ser menos precisa. '
    +'No incluyen árbitro, alineaciones confirmadas ni lesiones.</p></section>';
}
export function renderQuickMarkets(pred){
  if(!pred||pred.sport!=='soccer')return '';
  const shown=marketItems(pred).filter(x=>['Corners','Yellow','Fouls'].includes(x.field));
  const known=shown.filter(x=>x.record);
  if(!known.length)return '<span class="quick-market-muted">Mercados: datos insuficientes</span>';
  return '<div class="quick-markets">'+shown.map(({short,record})=>
    '<span class="quick-market'+(record?'':' quick-market-unknown')+'">'+html(short)
      +' <strong>'+(record?round(record.expected):'—')+'</strong></span>').join('')+'</div>';
}
