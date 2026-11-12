import test from 'node:test';
import assert from 'node:assert/strict';
import {getHistoricSnapshot,loadPublicSnapshots} from '../src/storage.js';

test('el historial público rescata el pronóstico aunque cambie el ID del proveedor',async()=>{
  const match={id:'laliga:espn:999',league:'laliga',sport:'soccer',
    date:'2026-11-12',home:'FC Barcelona',away:'Atlético de Madrid'};
  const saved={id:'laliga:csv:123',league:'laliga',sport:'soccer',
    date:'2026-11-12',home:'FC Barcelona',away:'Atletico de Madrid',
    predictedAt:'2026-11-11T09:00:00Z',probabilities:{H:.60,D:.13,A:.27}};
  const originalFetch=globalThis.fetch;
  const originalStorage=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({snapshots:{x:saved}})});
  try{
    assert.equal(await loadPublicSnapshots(),1);
    assert.equal(getHistoricSnapshot(match).probabilities.H,.60);
    assert.equal(getHistoricSnapshot({...match,date:'2026-11-13'}),null);
  }finally{
    globalThis.fetch=originalFetch;
    globalThis.localStorage=originalStorage;
  }
});
