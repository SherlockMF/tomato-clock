import test from 'node:test';
import assert from 'node:assert/strict';
import {JourneyPatterns} from '../scripts/journey-patterns.ts';
import {initial32} from '../src/life32r3/state.ts';
import {journeyFixture} from '../src/journey/world.ts';
import type {Record32} from '../src/life32r3/types.ts';

test('区分有办事的往返和空手折返，学习跨窗合并、跨睡眠断开，十窗从第十窗起统计',()=>{
  const config=journeyFixture('creator',19),state=initial32(config),hero=config.hero;
  const audit=new JourneyPatterns(hero,'home','home');
  let serial=0;
  const fact=(kind:string,location:string,from:number,until:number)=>{
    const row:Record32={id:'v'+ ++serial,sequence:serial,time:until,actor:hero,causes:[],kind:'fact',
      fact:{kind,title:kind,actors:[hero],location,from,until,text:kind,semantic:null,
        progress:kind==='study',newState:[],opportunity:kind==='study'?'o1':null}};
    audit.record(row,state);return row;
  };
  fact('study','home',0,30);fact('study','home',30,60);fact('study','home',540,570);
  fact('move','ford',570,600);fact('move','home',600,630);
  fact('study','home',630,660);const r=fact('move','ford',660,690);
  const s=audit.summary();
  assert.equal(s.homeMax,90);assert.equal(s.studyMax,60);
  assert.equal(s.immediateReturns,1);assert.equal(s.longestAlternating,3);
  for(let n=1;n<=11;n++)audit.story(n,{topic:'赶路',row:r},state);
  assert.equal(audit.summary().tenBlocks,2);assert.equal(audit.summary().meanRepeatInTen,9);
});
