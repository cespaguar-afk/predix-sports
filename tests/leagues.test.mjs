import test from 'node:test';
import assert from 'node:assert/strict';
import {LEAGUES,monthKeys,nbaCdnSchedule,parseCSV,normalizeFootball} from '../src/data.js';

test('includes all requested free competitions and valid source slugs',()=>{
  assert.deepEqual(Object.keys(LEAGUES),[
    'laliga','hypermotion','premier','bundesliga','ligue1','champions','copadelrey','supercopa','nations','nba'
  ]);
  assert.equal(LEAGUES.hypermotion.folder,'ESP_2_segunda-division');
  assert.equal(LEAGUES.copadelrey.folder,'ESP_CUP_copa-del-rey');
  assert.equal(LEAGUES.nations.espn,'soccer/uefa.nations');
  assert.equal(LEAGUES.supercopa.espn,'soccer/esp.super_cup');
});
test('ESPN requests months separately and handles year boundaries',()=>{
  assert.deepEqual(monthKeys(new Date('2026-11-11T12:00:00Z'),2,2),[
    '202609','202610','202611','202612','202701'
  ]);
  assert.deepEqual(monthKeys(new Date('2027-01-05T00:00:00Z'),1,1),[
    '202612','202701','202702'
  ]);
});
test('NBA CDN dates, match status, final scores are normalized without fabrication',()=>{
  const data={leagueSchedule:{gameDates:[{games:[
    {gameId:'001',gameDateTimeUTC:'2026-11-12T00:00:00Z',gameStatus:1,
      homeTeam:{teamCity:'Boston',teamName:'Celtics',teamTricode:'BOS',score:0},
      awayTeam:{teamCity:'New York',teamName:'Knicks',teamTricode:'NYK',score:0}},
    {gameId:'002',gameDateTimeUTC:'2026-11-10T00:00:00Z',gameStatus:3,
      homeTeam:{teamCity:'Los Angeles',teamName:'Lakers',teamTricode:'LAL',score:111},
      awayTeam:{teamCity:'Boston',teamName:'Celtics',teamTricode:'BOS',score:105}},
    {gameId:'003',gameDateTimeUTC:'2026-11-10T00:00:00Z',gameStatus:3,
      homeTeam:{teamCity:'Denver',teamName:'Nuggets',score:null},
      awayTeam:{teamCity:'Miami',teamName:'Heat',score:null}}
  ]}]}};
  const got=nbaCdnSchedule(data,new Date('2026-11-11T00:00:00Z'));
  assert.equal(got.results.length,1);
  assert.equal(got.fixtures.length,2);
  assert.equal(got.results[0].homeScore,111);
  assert.equal(got.fixtures[0].homeScore,null);
  assert.equal(got.fixtures[1].status,'pre');
});
test('Hypermotion and Copa CSVs preserve their competition identity',()=>{
  const csv='gw,date,time,home,away,ft_home,ft_away\n2,2026-09-21,20:00,Team A,Team B,2,1\n';
  for(const league of ['hypermotion','copadelrey']){
    const matches=normalizeFootball(parseCSV(csv),league);
    assert.equal(matches.length,1);
    assert.equal(matches[0].league,league);
    assert.equal(matches[0].status,'post');
  }
});
