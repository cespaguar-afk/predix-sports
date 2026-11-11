import test from 'node:test';
import assert from 'node:assert/strict';
import {predictFootball,predictYellowCards,predictPlayerBookings} from '../src/model.js';

function fixtures(){
  const rows=[];
  for(let i=0;i<12;i++){
    const date='2026-10-'+String(i+1).padStart(2,'0');
    rows.push({date,home:'Athletic Club',away:'Sevilla FC',
      homeScore:1,awayScore:0,homeYellow:2+i%2,awayYellow:3+i%3});
    rows.push({date,home:'Real Madrid',away:'Valencia CF',
      homeScore:3,awayScore:1,homeYellow:1+i%2,awayYellow:2+i%2});
  }
  return rows;
}

test('predicts only verified pre-match yellow card data with per-side totals',()=>{
  const match={home:'Athletic Club',away:'Sevilla FC',date:'2026-11-11'};
  const prediction=predictYellowCards(match,fixtures());
  assert.ok(prediction);
  assert.ok(prediction.expectedHome>0);
  assert.ok(prediction.expectedAway>0);
  assert.ok(Math.abs(prediction.expectedTotal-(prediction.expectedHome+prediction.expectedAway))<=.11);
  for(const k of ['over25','over35','over45','over55'])assert.ok(prediction[k]>=0&&prediction[k]<=1);
  assert.ok(prediction.over25>prediction.over35&&prediction.over35>prediction.over45);
});
test('never invents card totals when samples are missing or postdated',()=>{
  const match={home:'Athletic Club',away:'Sevilla FC',date:'2026-09-01'};
  assert.equal(predictYellowCards(match,fixtures()),null);
  const noCardRows=fixtures().map(({homeYellow,awayYellow,...rest})=>rest);
  assert.equal(predictYellowCards({ ...match,date:'2026-11-15'},noCardRows),null);
});
test('soccer prediction includes independent card model when available',()=>{
  const prediction=predictFootball({home:'Athletic Club',away:'Sevilla FC',date:'2026-11-11'},fixtures());
  assert.ok(prediction?.yellowCards);
});
test('player booking rankings require appearances, samples and past fixtures',()=>{
  const history=[];
  for(let i=0;i<10;i++){
    const date='2026-10-'+String(i+1).padStart(2,'0');
    history.push({date,players:[
      {id:'a',name:'A. Example',team:'Athletic Bilbao',appearance:true,yellow:i%2},
      {id:'b',name:'B. Example',team:'Sevilla',appearance:true,yellow:i===0?1:0},
      {id:'c',name:'C. DNP',team:'Sevilla',appearance:false,yellow:1},
      {id:'d',name:'D. Madrid',team:'Real Madrid',appearance:true,yellow:1}
    ]});
  }
  // A future game must not influence the model
  history.push({date:'2026-12-01',players:[{id:'b',name:'B. Example',team:'Sevilla',appearance:true,yellow:1}]});
  const match={home:'Athletic Club',away:'Sevilla FC',date:'2026-11-11'};
  const got=predictPlayerBookings(match,history);
  assert.deepEqual(got.map(x=>x.id),['a','b']);
  assert.equal(got[0].booked,5);
  assert.equal(got[0].played,10);
  assert.ok(got[0].probability>got[1].probability);
  assert.equal(predictPlayerBookings(match,[]).length,0);
});
test('does not match Atletico Madrid to Real Madrid',()=>{
  const history=Array.from({length:6},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),players:[
    {id:'real',name:'Real player',team:'Real Madrid',appearance:true,yellow:1},
    {id:'atleti',name:'Atleti player',team:'Atlético Madrid',appearance:true,yellow:1}
  ]}));
  const got=predictPlayerBookings({home:'Real Madrid',away:'Sevilla FC',date:'2026-11-11'},history);
  assert.deepEqual(got.map(x=>x.id),['real']);
});
