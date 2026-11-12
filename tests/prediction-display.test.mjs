import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionEntries,archivedOddsHTML} from '../src/prediction-display.js';

test('los encuentros finalizados muestran los tres porcentajes anteriores del fútbol',()=>{
  const match={sport:'soccer',home:'FC Barcelona',away:'Atlético de Madrid'};
  const saved={probabilities:{H:.60,D:.12,A:.28}};
  const html=archivedOddsHTML(match,saved,{compact:true});
  assert.match(html,/FC Barcelona/);
  assert.match(html,/60%/);
  assert.match(html,/Empate/);
  assert.match(html,/12%/);
  assert.match(html,/Atlético de Madrid/);
  assert.match(html,/28%/);
  assert.match(html,/Guardado antes del encuentro/);
});
test('la NBA muestra únicamente dos equipos y sus porcentajes previos',()=>{
  const match={sport:'nba',home:'Lakers',away:'Celtics'};
  const rows=predictionEntries(match,{probabilities:{H:.72,A:.28}});
  assert.deepEqual(rows.map(x=>x.name),['Lakers','Celtics']);
  const html=archivedOddsHTML(match,{probabilities:{H:.72,A:.28}});
  assert.match(html,/72%/);assert.match(html,/28%/);
  assert.ok(!html.includes('Empate'));
});
test('los partidos antiguos sin predicción guardada no fabrican porcentajes',()=>{
  const html=archivedOddsHTML({sport:'soccer',home:'A',away:'B'},null);
  assert.match(html,/no registrado/);
  assert.ok(!html.includes('50%'));
});
test('el nombre de equipo se escapa para impedir HTML inyectado',()=>{
  const html=archivedOddsHTML({sport:'nba',home:'<script>alert(1)</script>',away:'B'},
    {probabilities:{H:.6,A:.4}});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});
test('las probabilidades inválidas no se dibujan como predicciones verificadas',()=>{
  const html=archivedOddsHTML({sport:'soccer',home:'A',away:'B'},{
    probabilities:{H:.8,D:.3,A:-.1}});
  assert.match(html,/no registrado/);
});
