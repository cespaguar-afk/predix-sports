import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEspnBoxscore,parseCdnBoxscore,renderNbaTeamDetails} from '../src/nba-details.js';

test('ESPN: parsear estadisticas individuales cuando estan disponibles',()=>{
  const input={boxscore:{teams:[{team:{id:'1'},statistics:[
    {name:'rebounds',displayValue:'45'},{name:'assists',displayValue:'28'}
  ]}],players:[{team:{id:'1',displayName:'Example Celtics',abbreviation:'BOS'},
    statistics:[{labels:['MIN','FG','3PT','REB','AST','STL','BLK','TO','PTS'],athletes:[
      {athlete:{id:'99',displayName:'Player Test'},stats:['31','8-15','3-6','10','7','2','1','3','22']},
      {athlete:{id:'88',displayName:'Not Playing'},didNotPlay:true,stats:['0','0-0','0-0','0','0','0','0','0','0']}
    ]}]}]}};
  const result=parseEspnBoxscore(input);
  assert.equal(result.teams[0].players.length,1);
  const p=result.teams[0].players[0];
  assert.equal(p.points,22);assert.equal(p.rebounds,10);assert.equal(p.assists,7);
  assert.equal(p.steals,2);assert.equal(p.blocks,1);assert.equal(p.turnovers,3);
  assert.equal(p.fgAttempted,15);
  assert.equal(result.teams[0].totals.rebounds,45);
});
test('NBA CDN: extraer puntos, asistencias y perdidas',()=>{
  const team={teamCity:'Boston',teamName:'Celtics',teamTricode:'BOS',teamId:1,
    statistics:{reboundsTotal:42,assists:24},players:[
      {personId:42,name:'Player A',played:true,statistics:{minutes:'27',points:16,assists:8,reboundsTotal:9,turnovers:3}}
    ]};
  const result=parseCdnBoxscore({game:{homeTeam:team,awayTeam:{...team,teamName:'Lakers',teamTricode:'LAL'}}});
  assert.equal(result.teams.length,2);
  assert.equal(result.teams[0].players[0].assists,8);
  assert.equal(result.teams[0].players[0].turnovers,3);
});
test('cualquier nombre de jugador se escapa al renderizar',()=>{
  const html=renderNbaTeamDetails({teams:[{name:'Test',loaded:1,requested:1,providers:['ESPN'],metrics:{},
      players:[{name:'<script>alert(1)</script>',games:1,points:3}]}]});
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('nombres NBA siempre visibles como texto, no convertidos a un guion',()=>{
  const html=renderNbaTeamDetails({teams:[{
    name:'Boston Celtics',loaded:1,requested:1,providers:['ESPN'],
    metrics:{rebounds:42,assists:24},players:[
      {name:'Jayson Tatum',games:3,minutes:35,points:28.7,rebounds:9.1,assists:5.5,steals:1.1,blocks:0.6,turnovers:2.5,fgPct:49,tpPct:38},
      {name:'Jaylen Brown',games:3,minutes:33,points:24,rebounds:6,assists:3.2,steals:1,blocks:0.3,turnovers:2,fgPct:45,tpPct:36}
    ]
  },{name:'Other team',loaded:0,requested:0,providers:[],metrics:{},players:[]}]});
  assert.match(html,/<th scope="row" class="player-name-cell">Jayson Tatum<\/th>/);
  assert.match(html,/<th scope="row" class="player-name-cell">Jaylen Brown<\/th>/);
  assert.ok(!html.includes('<th scope="row" class="player-name-cell">—</th>'));
  assert.ok(html.includes('<td>28.7</td>'));
});
test('los nombres maliciosos se escapan también en la cabecera de fila',()=>{
  const html=renderNbaTeamDetails({teams:[{
    name:'Prueba',loaded:1,requested:1,providers:['ESPN'],metrics:{},
    players:[{name:'<img src=x onerror=alert(1)>',games:1,points:3}]
  }]});
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
