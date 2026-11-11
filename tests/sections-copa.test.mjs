import test from 'node:test';
import assert from 'node:assert/strict';
import {LEAGUES,reconcileCopaDelRey} from '../src/data.js';

test('Bundesliga and Ligue 1 exist with correct public feed folders',()=>{
  assert.equal(LEAGUES.bundesliga.folder,'GER_1_bundesliga');
  assert.equal(LEAGUES.ligue1.folder,'FRA_1_ligue-1');
  assert.equal(LEAGUES.bundesliga.sport,'soccer');
  assert.equal(LEAGUES.ligue1.sport,'soccer');
});
test('Copa del Rey does not show two opponents for Albacete on same day',()=>{
  const result=reconcileCopaDelRey({
    results:[],
    fixtures:[
      {id:'cup:csv:1',date:'2026-11-12',home:'Puertollano C.F.',away:'Albacete',status:'pre',source:'open-matchday',time:null},
      {id:'cup:espn:2',date:'2026-11-12',home:'Calvo Sotelo',away:'Albacete',status:'pre',source:'ESPN (copia)',isoTime:'2026-11-12T17:30:00Z'}
    ]
  });
  assert.equal(result.fixtures.length,1);
  assert.equal(result.fixtures[0].home,'Calvo Sotelo');
  assert.match(result.warning,/duplicados/);
});
test('Copa del Rey prefers finished scores to stale fixtures',()=>{
  const result=reconcileCopaDelRey({results:[
    {id:'cup:played',date:'2026-11-10',home:'Anaitasuna',away:'Alavés',status:'post',homeScore:0,awayScore:3,source:'ESPN'}
  ],fixtures:[
    {id:'cup:future',date:'2026-11-10',home:'Anaitasuna',away:'Alavés',status:'pre',source:'open-matchday'}
  ]});
  assert.equal(result.results.length,1);
  assert.equal(result.fixtures.length,0);
});
test('Copa del Rey preserves different days and unrelated matches',()=>{
  const result=reconcileCopaDelRey({results:[],fixtures:[
    {id:'cup:a',date:'2026-11-12',home:'Calvo Sotelo',away:'Albacete',status:'pre',source:'ESPN'},
    {id:'cup:b',date:'2026-11-13',home:'Albacete',away:'Valladolid',status:'pre',source:'ESPN'},
    {id:'cup:c',date:'2026-11-12',home:'Navalcarnero',away:'Real Betis',status:'pre',source:'ESPN'}
  ]});
  assert.equal(result.fixtures.length,3);
});
