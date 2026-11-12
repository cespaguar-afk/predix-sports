/** Representación común del pronóstico previo, en lista y ficha.
 * Solo usa registros históricos guardados antes del partido.
 */
export const safeText=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const valid=p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
export function predictionEntries(match,snapshot){
 if(!snapshot||!snapshot.probabilities)return [];
 const rows=match.sport==='nba'
   ?[['H',match.home],['A',match.away]]
   :[['H',match.home],['D','Empate'],['A',match.away]];
 return rows.map(([key,name])=>({key,name,p:snapshot.probabilities[key]}));
}
export function archivedOddsHTML(match,snapshot,{compact=false}={}){
 const entries=predictionEntries(match,snapshot);
 const usable=entries.length&&entries.every(x=>valid(x.p));
 if(!usable)return '<div class="historic-empty">'
  +'<span class="historic-empty-icon">◌</span>'
  +'<span>Pronóstico anterior no registrado</span></div>';
 const values=entries.map(x=>Math.round(x.p*100));
 const cells=entries.map((item,i)=>'<div class="historical-team">'+
   '<span class="historical-name">'+safeText(item.name)+'</span>'+
   '<strong class="historical-value">'+values[i]+'%</strong>'+
   '</div>').join('');
 const segments=entries.map((x,i)=>'<span class="historical-segment seg-'+i+
   '" style="width:'+(x.p*100).toFixed(3)+'%" aria-hidden="true"></span>').join('');
 return '<div class="historical-forecast '+(compact?'historical-compact':'historical-expanded')+'">'
   +'<div class="historical-heading"><span>Pronóstico anterior</span>'
   +'<small>Guardado antes del encuentro</small></div>'
   +'<div class="historical-values" role="group" aria-label="Probabilidades anteriores">'+cells+'</div>'
   +'<div class="historical-bar" aria-hidden="true">'+segments+'</div></div>';
}
