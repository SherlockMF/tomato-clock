import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture32 } from '../src/life32r3/state.ts';
import { routeWithinBudget } from '../src/journey/routing.ts';

test('在每一段都能付得起的路线中选择，到达中转站不耗尽盘缠', () => {
  const world = fixture32().worlds[0]!;
  world.routes = [
    {id:'fast',from:'bookstore',to:'street',duration:5,costCents:700,mode:'transit'},
    {id:'walk',from:'bookstore',to:'street',duration:30,costCents:0,mode:'transit'},
    {id:'last',from:'street',to:'park',duration:5,costCents:500,mode:'transit'},
  ];
  assert.deepEqual(routeWithinBudget(world,'bookstore','park',1000)?.map(r=>r.id), ['walk','last']);
  assert.deepEqual(routeWithinBudget(world,'bookstore','park',1200)?.map(r=>r.id), ['fast','last']);
  assert.equal(routeWithinBudget(world,'bookstore','park',400), null);
});
