/**
 * Confianza orientativa basada en cobertura de datos, no en probabilidad de acertar.
 * Mantiene las categorías que emite el modelo; no inventa confianza "alta".
 */
export function confidenceOf(value){
  const raw=typeof value==='string'?value:value?.confidence;
  if(raw==='media')return {key:'media',label:'Media',explanation:'Cobertura histórica moderada; no equivale a probabilidad de acierto.'};
  if(raw==='baja')return {key:'baja',label:'Baja',explanation:'Muestra reducida o competición con información limitada.'};
  return {key:'none',label:'Sin evaluar',explanation:'No hay muestra suficiente o no se conservó el nivel de confianza.'};
}
export function confidenceHTML(value,{compact=false}={}){
  const c=confidenceOf(value);
  return '<span class="confidence-chip confidence-'+c.key+(compact?' confidence-compact':'')+
    '" title="'+c.explanation+'" aria-label="Confianza orientativa: '+c.label+
    '"><span class="confidence-led" aria-hidden="true"></span>Confianza '+c.label+'</span>';
}
