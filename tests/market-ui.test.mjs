import test from 'node:test';
import assert from 'node:assert/strict';
import {predictFootball} from '../src/model.js';
import {marketItems,renderMarketForecast,renderQuickMarkets} from '../src/market-ui.js';
import {normalizeFootball,parseCSV} from '../src/data.js';

function history(){
 const games=[];
 for(let i=1;i<=22;i++){
  const day='2026-10-'+String(i).padStart(2,'0');
  games.push({date:day,home:'Local',away:'Rival '+i,homeScore:2,awayScore:1,
   homeCorners:6,awayCorners:4,homeYellow:2,awayYellow:3,homeFouls:13,awayFouls:14,
   homeShots:15,awayShots:11,homeTarget:5,awayTarget:4,
   homeCorners1H:3,awayCorners1H:2,homeCorners2H:3,awayCorners2H:2});
  games.push({date:day,home:'Rival B '+i,away:'Visitante',homeScore:1,awayScore:1,
   homeCorners:5,awayCorners:4,homeYellow:2,awayYellow:2,homeFouls:14,awayFouls:12,
   homeShots:13,awayShots:10,homeTarget:6,awayTarget:3,
   homeCorners1H:2,awayCorners1H:2,homeCorners2H:3,awayCorners2H:2});
 }
 return games;
}
const match={date:'2026-11-10',sport:'soccer',home:'Local',away:'Visitante'};
test('mercados de fútbol muestran siete categorías, muestra y reparto por equipos',()=>{
 const prediction=predictFootball(match,history());
 assert.ok(prediction);
 const fields=prediction.markets.map(x=>x.field);
 for(const key of ['Corners','Yellow','Fouls','Shots','Target','Corners1H','Corners2H'])assert.ok(fields.includes(key));
 for(const market of prediction.markets){
  assert.ok(Number.isFinite(market.expectedHome));
  assert.ok(Number.isFinite(market.expectedAway));
  assert.ok(market.samples>=3);
  assert.ok(market.over>=0&&market.over<=1);
 }
 const html=renderMarketForecast(prediction);
 assert.match(html,/Córners 1T/);
 assert.match(html,/Tarjetas/);
 assert.match(html,/Faltas/);
 assert.match(html,/Remates/);
 assert.match(html,/Local/);
 assert.match(html,/Visitante/);
 assert.match(html,/partidos por equipo/);
 assert.match(renderQuickMarkets(prediction),/Córners/);
});
test('un partido posterior no contamina las probabilidades anteriores',()=>{
 const baseline=predictFootball(match,history());
 const future={...history()[0],date:'2026-11-20',home:'Local',away:'Visitante',homeCorners:100,awayCorners:90};
 const withFuture=predictFootball(match,[...history(),future]);
 assert.deepEqual(withFuture,baseline);
});
test('si faltan estadísticas, no se muestran falsos valores ni porcentajes',()=>{
 const noStats=history().map(({date,home,away,homeScore,awayScore})=>({date,home,away,homeScore,awayScore}));
 const prediction=predictFootball(match,noStats);
 assert.ok(prediction);
 assert.equal(prediction.markets.length,0);
 const html=renderMarketForecast(prediction);
 assert.match(html,/Datos insuficientes/);
 assert.ok(!html.includes('Más de 8.5'));
 assert.match(renderQuickMarkets(prediction),/Datos insuficientes/i);
});
test('el parser incluye los córners por periodos solo si son valores reales',()=>{
 const data=parseCSV('date,home,away,ft_home,ft_away,home_corners_1h,away_corners_1h,home_corners_2h,away_corners_2h\n2026-10-10,Local,Visitante,1,0,4,2,,3');
 const item=normalizeFootball(data,'laliga')[0];
 assert.equal(item.homeCorners1H,4);
 assert.equal(item.awayCorners2H,3);
 assert.equal(item.homeCorners2H,null);
});
test('NBA no muestra métricas de fútbol',()=>{
 assert.equal(renderMarketForecast({sport:'nba',markets:[]}), '');
 assert.equal(renderQuickMarkets({sport:'nba',markets:[]}), '');
});
