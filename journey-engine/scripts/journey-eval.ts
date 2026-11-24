import { WaitEpisodes } from '../src/journey/waits.ts';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { journeyFixture, journeyRegion } from '../src/journey/world.ts';
import { Runtime32 } from '../src/life32r3/engine.ts';
import type { Background } from '../src/life32r3/types.ts';

// Advance the same stored state a day at a time. A new chapter, terminal scene or daily reset
// would invalidate this test of continued activity late in a journey.
export function evaluateJourney(background: Background, seed: number, days: number, localActivities = true, provisions = localActivities, previousRevision = false) {
  assert.ok(Number.isSafeInteger(days) && days > 0, 'days must be a positive integer');
  const config = journeyFixture(background, seed);
  if (!provisions || !localActivities) delete config.journeyRevision;
  if(previousRevision && config.journeyRevision)config.journeyRevision=2;
  if (!localActivities) delete config.localActivities;
  const runtime = new Runtime32(config);
  const hero = config.hero, person = config.people.find(p => p.id === hero)!;
  const start = runtime.state, home = person.home;
  let previousRegion = journeyRegion(start.worlds[hero]!.locationId);
  let originOfVisit = previousRegion, localActivity = true, immediateReturns = 0, passThroughs = 0;
  const waitingByReason: Record<string,number> = {};
  let latestReason = 'unclassified';
  let moves = 0, homeMinutes = 0, studyMinutes = 0, transitMinutes = 0, waitingMinutes = 0;
  const activityMinutes: Record<string,number> = {};
  let accounted = 0;
  const focusMinutes = 200, waitingPerFocus: number[] = [], completedInFocus = new Set<number>();
  const episodes = new WaitEpisodes();
  function recordTime(kind: string, from: number, until: number, changed = false) {
    const end = accounted + until - from;
    if (kind === 'waiting') {
      for (let cursor = accounted; cursor < end;) {
        const index = Math.floor(cursor / focusMinutes), next = Math.min(end, (index+1)*focusMinutes);
        waitingPerFocus[index] = (waitingPerFocus[index] ?? 0) + next - cursor;
        cursor = next;
      }
    }
    if (changed) completedInFocus.add(Math.floor((end-1)/focusMinutes));
    accounted = end;
    activityMinutes[kind] = (activityMinutes[kind] ?? 0) + until - from;
    episodes.record(kind,from,until);
  }
  let sinceArrival = 0, longestAtHome = 0, homeRun = 0, longestRegionStay = 0;
  const regions = new Set([previousRegion]), actions: Record<string,number> = {};
  const daily: {day:number;regions:string[];tasks:number;completedKinds:string[];moves:number}[] = [];
  for (let day = 1; day <= days; day++) {
    const result = runtime.advance(960);
    assert.equal(result.state.worlds[hero]!.awakeMinutes, day * 960);
    for (const actor of config.people) {
      const world = result.state.worlds[actor.id]!;
      assert.equal(world.time, result.state.time);
      assert.equal(world.awakeMinutes + world.sleepMinutes, world.time - start.time);
      assert.ok(world.cashCents >= 0);
      for (const value of Object.values(result.state.journey!.profiles[actor.id]!.values)) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 100);
      }
    }
    const regionsToday = new Set<string>(), kindsToday = new Set<string>();
    let tasks = 0, movesToday = 0;
    for (const row of result.records) {
      if(row.actor === hero && row.decision) {
        const d = row.decision;
        latestReason = d.reason;
        if(d.reason === 'no_feasible_itinerary' && d.candidates.every(x => x.reasons.length || x.planningReasons?.length)) {
          latestReason = 'all_candidates_blocked';
        }
      }
      const fact = row.fact;
      if (!fact?.actors.includes(hero) || fact.until <= fact.from) continue;
      const minutes = fact.until - fact.from, region = journeyRegion(fact.location);
      recordTime(fact.kind, fact.from, fact.until, Boolean(fact.opportunity && fact.progress && fact.semantic));
      sinceArrival += minutes;
      if (fact.kind === 'move') {
        transitMinutes += minutes;
        if (region !== previousRegion) {
          moves++; movesToday++;
          if (!localActivity) {
            passThroughs++;
            if (region === originOfVisit) immediateReturns++;
          }
          originOfVisit = previousRegion;
          localActivity = false;
          longestRegionStay = Math.max(longestRegionStay, sinceArrival);
          sinceArrival = 0;
        }
      } else if(fact.opportunity && fact.progress) localActivity = true;
      previousRegion = region;
      regions.add(region);
      if (fact.location === home && fact.kind !== 'move') {
        homeMinutes += minutes;
        homeRun += minutes;
        longestAtHome = Math.max(longestAtHome, homeRun);
      } else homeRun = 0;
      if (fact.kind === 'study') studyMinutes += minutes;
      if (fact.kind === 'waiting') {
        waitingMinutes += minutes;
        waitingByReason[latestReason] = (waitingByReason[latestReason] ?? 0) + minutes;
      }
      if (fact.kind.startsWith('journey_') && fact.semantic) {
        tasks++;
        regionsToday.add(region);
        kindsToday.add(fact.kind);
        actions[fact.kind] = (actions[fact.kind] ?? 0) + 1;
      }
    }
    daily.push({day, regions:[...regionsToday], tasks, completedKinds:[...kindsToday], moves:movesToday});
  }
  const state = runtime.state, w = state.worlds[hero]!;
  const pending = w.inProgress, pendingKind = state.bindings[hero]?.kind;
  if (pending) {
    if (pending.elapsed && pendingKind) recordTime(pendingKind, pending.startedAt, pending.startedAt + pending.elapsed);
    if (pendingKind === 'move') transitMinutes += pending.elapsed;
    if (pendingKind === 'waiting') {
      waitingMinutes += pending.elapsed;
      waitingByReason[latestReason] = (waitingByReason[latestReason] ?? 0) + pending.elapsed;
    }
    if (pendingKind === 'study') studyMinutes += pending.elapsed;
    if (pendingKind !== 'move' && w.locationId === home) {
      homeMinutes += pending.elapsed;
      longestAtHome = Math.max(longestAtHome, homeRun + pending.elapsed);
    }
    sinceArrival += pending.elapsed;
  }
  assert.equal(Object.values(activityMinutes).reduce((sum,n)=>sum+n,0), w.awakeMinutes);
  const waitEpisodes=episodes.summary();
  assert.equal(waitEpisodes.totalMinutes,waitingMinutes);
  const longestWait=waitEpisodes.max, longWaitMinutes=waitEpisodes.thresholds.find(t=>t.minutes===120)!.totalMinutes;
  const focusWindows = Math.floor(accounted/focusMinutes);
  const noOutcomeWindows = focusWindows - [...completedInFocus].filter(n=>n<focusWindows).length;
  const allWaitingWindows = waitingPerFocus.slice(0,focusWindows).filter(n=>n===focusMinutes).length;
  const tail = daily.slice(-7);
  const tailRegions = new Set(tail.flatMap(d => d.regions)), tailKinds = new Set(tail.flatMap(d => d.completedKinds));
  for (const wc of config.worlds) {
    const world = state.worlds[wc.character.id]!;
    assert.equal(world.cashCents, world.ledger.reduce((cash,entry) => cash + entry.amountCents,wc.initialCashCents));
  }
  return {
    background, seed, days, awakeMinutes:w.awakeMinutes, calendarDays:(state.time-start.time)/1440,
    regions:[...regions], moves, passThroughs, immediateReturns, homeMinutes, longestAtHome, studyMinutes,
    transitMinutes, waitingMinutes, waitingByReason, waitEpisodes, longestWait, longWaitMinutes, activityMinutes, focusMinutes, focusWindows, noOutcomeWindows, allWaitingWindows,
    longestSameRegionAwakeMinutes:Math.max(longestRegionStay,sinceArrival),
    actions, initialAttributes:start.journey!.profiles[hero]!.values, finalAttributes:state.journey!.profiles[hero]!.values,
    finalCashCents:w.cashCents, tailDays:tail.length, tailRegions:[...tailRegions], tailKinds:[...tailKinds],
    tailTasks:tail.reduce((sum,day)=>sum+day.tasks,0), tailMoves:tail.reduce((sum,day)=>sum+day.moves,0),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [days = '30', seed = '41', ...requested] = process.argv.slice(2);
  const selected = requested.filter(arg=>arg!=='--legacy' && arg!=='--previous' && arg!=='--revision2');
  const backgrounds = selected.length ? selected : ['traveler','settled','creator','low_assets'];
  for (const background of backgrounds) {
    assert.ok(['traveler','settled','creator','low_assets'].includes(background), 'unknown background');
    console.log(JSON.stringify(evaluateJourney(background as Background, Number(seed), Number(days), !requested.includes('--legacy'), !requested.includes('--previous'), requested.includes('--revision2'))));
  }
}
