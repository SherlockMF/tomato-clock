import assert from 'node:assert/strict';
import test from 'node:test';
import {allTypes} from '../src/travel-story/beijing-mbti.ts';
import {buildMonth, localStamp, renderText} from '../src/travel-story/roaming-month.ts';
import {firstDays} from '../src/travel-story/roaming-days-01.ts';
import {middleDays} from '../src/travel-story/roaming-days-11.ts';
import {lastDays} from '../src/travel-story/roaming-days-21.ts';

const days = [...firstDays, ...middleDays, ...lastDays];

test('每次专注只花200清醒分钟，月底完整经过30夜，每个事件按时间恰好揭晓一次', () => {
  const run = buildMonth('ISTJ', days);
  assert.equal(run.windows.length,144);
  assert.equal(run.nights.length,30);
  assert.equal(run.nights.reduce((n,s) => n+s.until-s.from,0),14400);
  assert.equal(run.until,43200);
  assert.equal(localStamp(run.until),'2026-07-01 07:00');
  assert.equal(run.windows.at(-1)!.until,run.nights.at(-1)!.from);
  const [first,,,,fifth] = run.windows;
  assert.equal(localStamp(first!.from),'2026-06-01 07:00');
  assert.equal(localStamp(first!.until),'2026-06-01 10:20');
  assert.equal(localStamp(fifth!.from),'2026-06-01 20:20');
  assert.equal(localStamp(fifth!.until),'2026-06-02 07:40');
  assert.equal(fifth!.sleepMinutes,480);
  assert.equal(run.windows[23]!.until+480,run.windows[24]!.from);
  const ids:string[] = [];
  for(const window of run.windows){
    assert.equal(window.until-window.from-window.sleepMinutes,200);
    assert.ok(window.events.length);
    for(const event of window.events){
      assert.ok(event.at>window.from && event.at<=window.until);
      assert.ok((event.at%1440)<960);
      ids.push(event.id);
    }
  }
  assert.equal(new Set(ids).size,181);
  assert.equal(ids.length,181);
});

test('16条人格路线可复跑，性别仅在正文自然称呼处呈现', () => {
  const sequences = new Set<string>();
  for(const type of allTypes){
    const run = buildMonth(type,days);
    sequences.add(run.choices.join(''));
    assert.deepEqual(buildMonth(type,days),run);
    const prose = run.windows.flatMap(w=>w.events.map(e=>e.text));
    const changed = prose.filter(s=>renderText(s,'男')!==renderText(s,'女'));
    assert.ok(changed.length>=1 && changed.length<=5);
    assert.ok(prose.every(s=>!/[{}]/u.test(renderText(s,'男')) && !/[{}]/u.test(renderText(s,'女'))));
    assert.equal(new Set(prose).size,181);
  }
  assert.equal(sequences.size,16);
  assert.throws(()=>buildMonth('ABCD',days));
  assert.throws(()=>buildMonth('ISTJ',days.slice(1)));
});

test('29次醒来各归入真正经过该时刻的专注，记得实际走过的昨夜',()=>{
  for(const type of allTypes){
    const run=buildMonth(type,days);
    const wakes=run.windows.flatMap(w=>w.events.filter(e=>e.id.startsWith('wake.')));
    assert.deepEqual(wakes.map(e=>e.day),Array.from({length:29},(_,i)=>i+2));
    for(const e of wakes){
      assert.equal(e.at,(e.day-1)*1440+8);
      assert.equal(e.city,days[e.day-2]!.city.split('→').at(-1));
    }
    assert.equal(run.windows[4]!.events.at(-1)?.id,wakes[0]!.id);
    assert.equal(run.windows[5]!.events[0]!.id.startsWith('wake.'),false);
    assert.equal(run.windows[24]!.events[0]!.id,wakes[4]!.id);
    assert.equal(run.windows[4]!.events[0]!.city,'武汉');
    assert.match(wakes[0]!.text,type.startsWith('I')?/明信片/:/纸板/);
    assert.equal(wakes[0]!.text.includes('早餐图'),type.includes('S'));
  }
});

test('带过明信片或守过棋摊，会改变后来在另一座城的选择',()=>{
  const quiet = buildMonth('ISTJ',days), outgoing = buildMonth('ESTJ',days);
  assert.equal(quiet.choices[17],1);
  assert.equal(outgoing.choices[17],0);
  assert.equal(outgoing.choices[21],1);
  assert.equal(quiet.choices[21],0);
  assert.equal(quiet.recollections[18]?.day,1);
  assert.equal(outgoing.recollections[22]?.day,5);
});
