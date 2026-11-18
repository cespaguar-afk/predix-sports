import test from 'node:test';
import assert from 'node:assert/strict';
import {predictFootball,predictNBA,recentHeadToHead,headToHeadAdjustment} from '../src/model.js';

const fixture={home:'Barcelona',away:'Atlético de Madrid',sport:'soccer',date:'2026-11-20'};
const base=[
  ...Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),
    home:'Barcelona',away:'Rival '+i,homeScore:2,awayScore:1})),
  ...Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),
    home:'Rival B '+i,away:'Atlético de Madrid',homeScore:1,awayScore:1}))
];
const duel={date:'2026-10-19',home:'Barcelona',away:'Atlético de Madrid',homeScore:4,awayScore:0};

test('historical duels count only verified games before kickoff and deduplicate providers',()=>{
 const games=recentHeadToHead(fixture,[duel,{...duel,id:'espn-mirror'},
   {...duel,date:'2026-11-21',homeScore:9,awayScore:0},
   {...duel,date:'2023-01-03'},
   {date:'2026-10-18',home:'Barcelona',away:'Other',homeScore:2,awayScore:0}]);
 assert.equal(games.length,1);
 assert.equal(games[0].goalsFor,4);
 assert.equal(games[0].goalsAgainst,0);
});
test('direct meetings affect estimated probabilities but with a small bounded contribution',()=>{
 const without=predictFootball(fixture,base);
 const withH2H=predictFootball(fixture,[...base,duel]);
 assert.ok(without&&withH2H);
 assert.equal(without.headToHead.count,0);
 assert.equal(withH2H.headToHead.count,1);
 assert.ok(withH2H.probabilities.H>without.probabilities.H);
 assert.ok(Math.abs(withH2H.expectedHome-without.expectedHome)<=.23);
 assert.ok(Math.abs(withH2H.expectedAway-without.expectedAway)<=.23);
 assert.ok(withH2H.headToHead.weight<=12);
});
test('no future scores leak into a pre-match prediction',()=>{
 const withH2H=predictFootball(fixture,[...base,duel]);
 const withFuture=predictFootball(fixture,[...base,duel,
   {...duel,date:'2026-11-21',homeScore:0,awayScore:99}]);
 assert.deepEqual(withH2H,withFuture);
});
test('unavailable direct duels do not change the original estimates',()=>{
 const adjusted=headToHeadAdjustment(fixture,base,1.7,1.1);
 assert.equal(adjusted.expectedHome,1.7);
 assert.equal(adjusted.expectedAway,1.1);
 assert.equal(adjusted.headToHead.count,0);
});
test('NBA uses direct games before match and caps contribution to projected points',()=>{
 const nba={home:'Lakers',away:'Celtics',sport:'nba',date:'2026-11-20'};
 const past=[
   ...Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),
     home:'Lakers',away:'H'+i,homeScore:115,awayScore:107})),
   ...Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),
     home:'A'+i,away:'Celtics',homeScore:109,awayScore:113}))
 ];
 const previous={date:'2026-11-10',home:'Celtics',away:'Lakers',homeScore:140,awayScore:92};
 const before=predictNBA(nba,past),after=predictNBA(nba,[...past,previous]);
 assert.ok(before&&after);
 assert.equal(after.headToHead.count,1);
 assert.equal(after.headToHead.games[0].home,'Celtics');
 assert.ok(Math.abs(after.expectedHome-before.expectedHome)<=4);
 assert.ok(Math.abs(after.expectedAway-before.expectedAway)<=4);
});
