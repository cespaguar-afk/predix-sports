import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate,matchDay,plusCalendarDays,dayTitle,groupMatchesByDay} from '../src/calendar.js';

test('Hoy y mañana tienen etiquetas claras y fechas españolas',()=>{
  assert.match(dayTitle('2026-11-11','2026-11-11'),/^Hoy · Miércoles, 11 de noviembre$/);
  assert.match(dayTitle('2026-11-12','2026-11-11'),/^Mañana · Jueves, 12 de noviembre$/);
  assert.match(dayTitle('2026-11-13','2026-11-11'),/^Viernes, 13 de noviembre$/);
});
test('cambio de mes y año en el calendario',()=>{
  assert.equal(plusCalendarDays('2026-12-31',1),'2027-01-01');
  assert.equal(plusCalendarDays('2026-11-11',7),'2026-11-18');
});
test('la fecha de partidos NBA en UTC pasa al día local',()=>{
  const isoTime='2026-11-12T00:30:00Z';
  assert.equal(matchDay({isoTime,date:'2026-11-11'}),localDate(isoTime));
  assert.equal(matchDay({date:'2026-11-11'}),'2026-11-11');
});
test('separar por día y dentro por competición sin perder ningún partido',()=>{
  const games=[
    {id:'1',date:'2026-11-11',league:'laliga'},
    {id:'2',date:'2026-11-11',league:'bundesliga'},
    {id:'3',date:'2026-11-11',league:'laliga'},
    {id:'4',date:'2026-11-12',league:'ligue1'},
    {id:'5',date:'2026-11-12',league:'copadelrey'}
  ];
  const groups=groupMatchesByDay(games);
  assert.equal(groups.length,2);
  assert.equal(groups[0].count,3);
  assert.deepEqual(groups[0].leagues.map(g=>g.league),['laliga','bundesliga']);
  assert.deepEqual(groups[0].leagues[0].matches.map(g=>g.id),['1','3']);
  assert.deepEqual(groups[1].leagues.map(g=>g.league),['ligue1','copadelrey']);
  assert.deepEqual(groups.flatMap(d=>d.leagues.flatMap(g=>g.matches)).map(m=>m.id).sort(),games.map(g=>g.id).sort());
});
test('el orden histórico se respeta como lo entrega el filtro',()=>{
  const rows=[
    {id:'new',date:'2026-11-15',league:'nba'},
    {id:'old',date:'2026-11-09',league:'nba'},
    {id:'older',date:'2026-11-08',league:'nba'}
  ];
  assert.deepEqual(groupMatchesByDay(rows).map(x=>x.date),['2026-11-15','2026-11-09','2026-11-08']);
});
