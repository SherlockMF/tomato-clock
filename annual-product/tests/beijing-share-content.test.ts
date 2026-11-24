import assert from 'node:assert/strict';
import test from 'node:test';
import {scenes} from '../src/travel-story/beijing-mbti-script.ts';
import {allTypes, rankOptions, simulate} from '../src/travel-story/beijing-mbti.ts';

const callbacks = [
  {id:'still_wind', needs:['word_test']},
  {id:'lend_fold', needs:['fault_marked']},
  {id:'cup_encore', needs:['gift','cup_permission']},
  {id:'message_home', needs:['pocket','voice_note']},
];

test('四个回声凭实际经历解锁，同一人格未经历任一前因就不能触发', () => {
  const options = scenes.flatMap(scene => scene.options);
  for (const {id, needs} of callbacks) {
    const option = options.find(item => item.id === id)!;
    for (const type of allTypes) {
      const rank = (flags:string[]) => rankOptions([option], type, new Set(flags), {}, 0)[0]!;
      assert.deepEqual(rank(needs).blocked, [], id);
      for (const missing of needs) {
        assert.ok(rank(needs.filter(fact => fact !== missing)).blocked.includes('缺少 '+missing), id);
      }
    }
  }
});

test('默认十六种旅程中各回声能实际读到，赠卡后的进展可分开', () => {
  const choices = new Set(allTypes.flatMap(type => simulate(type).choices));
  for (const {id} of callbacks) assert.ok(choices.has(id), id);
  assert.deepEqual(simulate('ISFJ').choices.slice(9,11), ['lend_fold','listen_back']);
  assert.deepEqual(simulate('ESFJ').choices.slice(9,11), ['lend_copy','cup_encore']);
});

test('第二场的停电有后续可读，第一场以及只知道场次的人无法经历同一回响', () => {
  const options = scenes[7]!.options;
  const darkPage = options.find(option => option.id === 'dark_page')!;
  const rank = (flags:string[]) => rankOptions([darkPage], 'INFP', new Set(flags), {}, 0)[0]!;
  assert.deepEqual(rank(['secondSitting']).blocked, ['缺少 heardUnplugged']);
  assert.deepEqual(rank(['heardUnplugged']).blocked, []);
  let count = 0;
  for (const type of allTypes) {
    const first = simulate(type);
    const second = simulate(type, {journey:2});
    assert.ok(!first.choices.includes(darkPage.id));
    assert.ok(second.windows[0]!.addedFlags.includes('heardUnplugged'));
    if (second.choices.includes(darkPage.id)) count++;
  }
  assert.ok(count > 0 && count < allTypes.length);
});
