import test from 'node:test';
import assert from 'node:assert/strict';
import {teamReport,headToHead} from '../src/stats.js';

const football=[
  {date:'2026-11-01',home:'Alpha',away:'Beta',homeScore:3,awayScore:1,homeCorners:6,awayCorners:2,homeTarget:5,awayTarget:1,homeYellow:2,awayYellow:3},
  {date:'2026-11-04',home:'Gamma',away:'Alpha',homeScore:0,awayScore:0,homeCorners:4,awayCorners:3},
  {date:'2026-11-13',home:'Alpha',away:'Gamma',homeScore:1,awayScore:4,homeCorners:1,awayCorners:8}
];
test('team report omits resultados posteriores al inicio solicitado',()=>{
  const r=teamReport(football,'Alpha','soccer','2026-11-11');
  assert.equal(r.played,2);
  assert.equal(r.wins,1);
  assert.equal(r.draws,1);
  assert.equal(r.losses,0);
  assert.equal(r.scored.for,1.5);
  assert.equal(r.cleanSheets,1);
});
test('medias deportivas se basan en muestras disponibles, sin fabricar ceros',()=>{
  const r=teamReport(football,'Beta','soccer','2026-11-11');
  assert.equal(r.metrics.Corners.for,2);
  assert.equal(r.metrics.Target.for,1);
  assert.equal(r.metrics.Fouls.for,null);
  assert.equal(r.metrics.Fouls.sample,0);
});
test('local y visitante se desglosan correctamente',()=>{
  const r=teamReport(football,'Alpha','soccer','2026-11-11');
  assert.equal(r.home.played,1);
  assert.equal(r.away.played,1);
  assert.equal(r.home.wins,1);
  assert.equal(r.away.draws,1);
});
test('NBA usa victorias y derrotas, puntos a favor y en contra',()=>{
  const games=[
    {date:'2026-11-01',home:'Lakers',away:'Bulls',homeScore:114,awayScore:108},
    {date:'2026-11-03',home:'Bulls',away:'Lakers',homeScore:122,awayScore:120}
  ];
  const r=teamReport(games,'Lakers','nba','2026-11-05');
  assert.equal(r.played,2);assert.equal(r.wins,1);assert.equal(r.losses,1);
  assert.equal(r.scored.for,117);assert.equal(r.scored.against,115);
});
test('enfrentamientos directos solo incluyen partidos terminados anteriores',()=>{
  assert.equal(headToHead(football,'Alpha','Beta','2026-11-11').length,1);
  assert.equal(headToHead(football,'Alpha','Gamma','2026-11-11').length,1);
});
