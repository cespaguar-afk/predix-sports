import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {canCapture,capturePredictions,gradePredictions,findSnapshot} from '../src/storage.js';

const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.get(key)||null,
  setItem:(key,value)=>memory.set(key,value),
  removeItem:key=>memory.delete(key)
};
beforeEach(()=>memory.clear());
const m={
  id:'nba:espn:555',league:'nba',sport:'nba',
  home:'Boston Celtics',away:'Milwaukee Bucks',date:'2026-11-12',
  isoTime:'2026-11-12T20:00:00Z',status:'pre'
};
const forecast={
  probabilities:{H:.65,A:.35},expectedHome:114,expectedAway:106,
  over25:null,btts:null,markets:[],confidence:'media'
};
test('predicción NBA del mismo día solo se sella antes del inicio verificable',()=>{
  assert.equal(canCapture(m,new Date('2026-11-12T10:00:00Z')),true);
  assert.equal(canCapture(m,new Date('2026-11-12T20:01:00Z')),false);
  const rows=capturePredictions([{match:m,pred:forecast}],new Date('2026-11-12T10:00:00Z'));
  assert.equal(rows.length,1);
  assert.equal(rows[0].expectedHome,114);
  assert.equal(rows[0].probabilities.H,.65);
});
test('partido finalizado muestra pronóstico que ya existía antes del encuentro',()=>{
  capturePredictions([{match:m,pred:forecast}],new Date('2026-11-12T10:00:00Z'));
  const completed={...m,status:'post',homeScore:105,awayScore:98};
  const graded=gradePredictions([completed]);
  assert.equal(graded.length,1);
  assert.equal(graded[0].outcome,'H');
  assert.equal(graded[0].actual,'105-98');
  assert.equal(findSnapshot({...completed,id:'nba:official:555'})?.expectedHome,114);
});
test('no se genera predicción para partidos que ya han comenzado o terminado',()=>{
  const late=capturePredictions([{match:m,pred:forecast}],new Date('2026-11-12T22:00:00Z'));
  assert.equal(late.length,0);
  assert.equal(findSnapshot({...m,status:'post'}),null);
});
test('no se confunden equipos del mismo día ni distintas competiciones',()=>{
  capturePredictions([{match:m,pred:forecast}],new Date('2026-11-12T10:00:00Z'));
  assert.equal(findSnapshot({...m,away:'Atlanta Hawks'}),null);
  assert.equal(findSnapshot({...m,league:'copadelrey'}),null);
});
