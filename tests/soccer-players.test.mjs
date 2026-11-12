import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSoccerRoster,loadSoccerPlayers,renderSoccerPlayers} from '../src/soccer-players.js';

test('se recogen solo estadísticas verificables de fútbol por jugador',()=>{
 const payload={rosters:[{team:{displayName:'Barcelona'},roster:[
  {athlete:{id:'1',displayName:'Futbolista Ejemplo'},stats:[
   {name:'appearances',value:1},{name:'goals',value:1},{name:'assists',value:2},
   {name:'yellowCards',value:0},{name:'shots',value:3}
  ]},
  {athlete:{id:'2',displayName:'Jugador sin actividad'},stats:[
   {name:'appearances',value:0},{name:'goals',value:0}
  ]},
  {athlete:{id:'3',displayName:'Jugador sin estadísticas'},stats:[]}
 ]}]};
 const players=parseSoccerRoster(payload,'laliga','2026-11-01');
 assert.equal(players.length,1);
 assert.equal(players[0].goals,1);
 assert.equal(players[0].assists,2);
 assert.equal(players[0].yellow,0);
 assert.equal(players[0].shots,3);
});
test('el histórico previo no usa partidos posteriores al encuentro',async()=>{
 const match={id:'test:1',date:'2026-11-10',league:'laliga',home:'Barcelona',away:'Valencia'};
 const cards=[
  {date:'2026-11-02',players:[{id:'1',name:'Futbolista',team:'Barcelona',appearance:true,yellow:1}]},
  {date:'2026-11-11',players:[{id:'1',name:'Futbolista',team:'Barcelona',appearance:true,yellow:1}]}
 ];
 const result=await loadSoccerPlayers(match,cards,null);
 assert.equal(result.teams[0].players.length,1);
 assert.equal(result.teams[0].players[0].appearances,1);
 assert.equal(result.teams[0].players[0].yellows,1);
 assert.equal(result.teams[0].players[0].goals,null);
});
test('la interfaz no ejecuta nombres de jugadores como HTML',()=>{
 const markup=renderSoccerPlayers({teams:[
  {name:'Barcelona',players:[{name:'<script>alert(1)</script>',appearances:1,goals:1}]},
  {name:'Valencia',players:[]}],checked:0,source:'Archivo local'});
 assert.ok(markup.includes('&lt;script&gt;'));
 assert.ok(!markup.includes('<script>'));
});
