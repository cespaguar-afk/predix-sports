import test from 'node:test';
import assert from 'node:assert/strict';
import {predictFootball,predictNBA,brierScore,calibrate} from '../src/model.js';
import {parseCSV,normalizeFootball,mergeLive} from '../src/data.js';

test('CSV quoted fields and missing values',()=>{
  const rows=parseCSV('gw,date,time,home,away,goal_minutes\r\n1,2026-10-01,20:00,"AC, Test",Away,"12,45"\r\n');
  assert.equal(rows.length,1);assert.equal(rows[0].home,'AC, Test');assert.equal(rows[0].goal_minutes,'12,45');
  const normalized=normalizeFootball(rows,'laliga',true);
  assert.equal(normalized[0].homeScore,null);
});
function genFoot(){const results=[];for(let i=1;i<=18;i++){
  const date=`2026-09-${String(i).padStart(2,'0')}`;
  results.push({date,home:'Home',away:`Opp${i}`,homeScore:i%3,awayScore:i%2});
  results.push({date,home:`Rival${i}`,away:'Away',homeScore:i%2,awayScore:(i+1)%3});
}
return results;}
test('Poisson returns probabilities summing to one, sensible score candidates',()=>{
  const pred=predictFootball({home:'Home',away:'Away',date:'2026-11-20'},genFoot());
  assert.ok(pred);assert.equal(pred.sampleHome,10);assert.ok(Math.abs(Object.values(pred.probabilities).reduce((a,b)=>a+b,0)-1)<1e-6);
  assert.ok(pred.scorelines.length===3);assert.ok(pred.expectedHome>=.25);
});
test('model does not use games played after fixture',()=>{
  const games=genFoot();
  const fixture={home:'Home',away:'Away',date:'2026-11-20'};
  const before=predictFootball(fixture,games);
  const after=predictFootball(fixture,[...games,{date:'2026-11-21',home:'Home',away:'Away',homeScore:15,awayScore:0}]);
  assert.deepEqual(before,after);
});
test('NBA returns two probabilities and pregame estimates',()=>{
  const results=[];for(let i=1;i<=20;i++){
    const date=`2026-10-${String(i).padStart(2,'0')}`;
    results.push({date,home:'Lakers',away:`B${i}`,homeScore:112+i%3,awayScore:104});
    results.push({date,home:`C${i}`,away:'Celtics',homeScore:105,awayScore:110+i%3});
  }
  const pred=predictNBA({home:'Lakers',away:'Celtics',date:'2026-11-10'},results);
  assert.ok(pred);assert.ok(Math.abs(pred.probabilities.H+pred.probabilities.A-1)<1e-8);
  assert.ok(pred.total>150);
});
test('Brier scores perfect forecasts as zero',()=>{
  assert.equal(brierScore({H:1,D:0,A:0},'H'),0);
  assert.equal(brierScore({H:0,D:0,A:1},'H'),2);
});
test('Calibration never activates on fewer than 20 evaluated',()=>{
  const p={H:.4,D:.3,A:.3};assert.deepEqual(calibrate(p,'soccer',[]).probabilities,p);
});
test('Live matching does not inject data from unmatched teams',()=>{
  const fixture={home:'FC Barcelona',away:'Real Madrid',date:'2026-11-20'};
  const live={home:'Arsenal',away:'Tottenham',date:'2026-11-20',id:'x',status:'in',homeScore:1,awayScore:1};
  assert.deepEqual(mergeLive([fixture],[live])[0],fixture);
});
