import test from 'node:test';
import assert from 'node:assert/strict';
import {confidenceOf,confidenceHTML} from '../src/confidence.js';

test('confianza media y baja se derivan del modelo sin inventar alta',()=>{
 assert.equal(confidenceOf({confidence:'media'}).key,'media');
 assert.equal(confidenceOf({confidence:'baja'}).key,'baja');
 assert.equal(confidenceOf({confidence:'alta'}).key,'none');
});
test('sin predicción o histórico incompleto se indica sin evaluar',()=>{
 assert.equal(confidenceOf(null).label,'Sin evaluar');
 assert.match(confidenceHTML({probabilities:{H:.6,A:.4}}),/Sin evaluar/);
});
test('etiquetas compactas visibles en el calendario y accesibles',()=>{
 const html=confidenceHTML({confidence:'media'},{compact:true});
 assert.match(html,/Confianza Media/);
 assert.match(html,/confidence-compact/);
 assert.match(html,/aria-label="Confianza orientativa/);
});
test('la confianza no se confunde con probabilidad de acierto',()=>{
 assert.match(confidenceOf('media').explanation,/no equivale a probabilidad/);
});
