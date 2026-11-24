import assert from 'node:assert/strict';
import {canStartLocalDuty} from '../life32r3/itinerary.ts';
import { draw } from '../domain/rng.ts';
import {finishMessage, messageDetail} from './correspondence.ts';
import { canReachBed } from './lodging.ts';
import { offer32, opportunity32 } from '../life32r3/sources.ts';
import { fixture32 } from '../life32r3/state.ts';
import type { Background, Config32, Decision32, Emit32, Opportunity32, State32 } from '../life32r3/types.ts';
import type { JourneyActivity, JourneyAssignment, JourneyBook, JourneyStation, JourneyWorld } from './world-types.ts';

const locations = ['bookstore', 'ford', 'ridge'] as const;
const titles = ['沿堤认鸟手册', '旱地菜园', '河道旧影', '榫卯入门', '步行者的地图', '三地食谱'];
const day = 1440;

export function journeyRegion(location: string): string {
  return location === 'ford' || location === 'ridge' ? location : 'bookstore';
}

export function journeyFixture(background: Background = 'traveler', seed = 20261116): Config32 {
  assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'invalid journey seed');
  const c = fixture32(background);
  c.journey = true;
  c.localActivities = true;
  c.journeyRevision = 7;
  for (const [index, w] of c.worlds.entries()) {
    w.seed = (seed + index) >>> 0;
    w.worldId = 'journey-' + w.character.id;
    w.mealCostCents = 600;
    // Synthetic inn rates and library guest bunks. M1 still charges for nights at paid sites.
    for (const place of w.places) place.lodgingCents = place.id === 'bookstore' ? 0 : 800;
    w.places.push(
      { id: 'ford', name: '蓝渡镇·渡口书站', openMinute: 360, closeMinute: 1320, lodgingCents: 0 },
      { id: 'ridge', name: '青岑镇·山前驿站', openMinute: 360, closeMinute: 1320, lodgingCents: 0 },
    );
    for (const [from, to, walk, bus] of [
      ['bookstore', 'ford', 65, 30], ['bookstore', 'ridge', 75, 0], ['ford', 'ridge', 55, 25],
    ] as const) {
      for (const [a, b] of [[from, to], [to, from]] as const) {
        w.routes.push({ id: 'walk-' + a + '-' + b, from: a, to: b, duration: walk, costCents: 0, mode: 'transit' });
        if (bus) w.routes.push({ id: 'bus-' + a + '-' + b, from: a, to: b, duration: bus, costCents: 250, mode: 'transit' });
      }
    }
  }
  return c;
}

export function validateJourneyWorld(c: Config32): void {
  assert.ok(c.rules.continuity && c.rules.diversity, 'journey requires the continuing city simulation');
  for (const w of c.worlds) {
    const awakeLeft = w.sleepAfterMinutes - w.initialFatigue;
    assert.ok(canReachBed(w, w.locationId, w.initialCashCents, awakeLeft),
      w.character.name + '从 ' + w.locationId + ' 出发时有 ' + w.initialCashCents +
      ' 分现金，离入睡还有 ' + awakeLeft + ' 分钟，无法赶到可负担的住宿地点');
    for (const location of locations) {
      assert.ok(w.places.some(p => p.id === location), 'missing journey station: ' + location);
      for (const next of locations.filter(other => other !== location)) {
        assert.ok(w.routes.some(r => r.from === location && r.to === next && !r.costCents && r.mode === 'transit'),
          'missing free connection: ' + location + ' to ' + next);
      }
    }
  }
}

export function initialJourneyWorld(c: Config32): JourneyWorld {
  const start = c.worlds[0]!.start;
  const books: JourneyBook[] = titles.map((title, i) => {
    const home = locations[(i + 1) % locations.length]!;
    const status = i < 2 ? 'returned' : i === 2 ? 'damaged' : 'shelf';
    return { id: 'book-' + (i + 1), title, home, status,
      location: status === 'returned' ? locations[i]! : home, carrier: null,
      source: 'initial:library-' + (i + 1), timesRead: status === 'shelf' ? 0 : 1,
      wear: status === 'damaged' ? 3 : 0, nextAt: start + (i + 1) * 180, assignment: null };
  });
  return { ...(c.journeyRevision ? {provisions:Object.fromEntries(c.people.map(p=>[p.id,{portions:0,source:'initial:'+p.id}]))} : {}),
    ...(c.localActivities ? {serviceInvoices:[], inbox:Object.fromEntries(c.people.map(p=>[p.id,{}]))} : {}), books, stations: locations.map((location, i) => ({
    location, level: 2 + i % 2, reportedLevel: 2 + i % 2, nextWeatherAt: start + 240 + i * 180,
    ...(c.localActivities ? {rack: {baskets: 0, source: 'initial:rack-' + location, assignment: null}} : {}),
    weatherSource: 'initial:river-' + location, reportSource: 'initial:river-' + location, alert: null,
  })), fieldNotes: Object.fromEntries(c.people.map(p => [p.id, {}])),
  nextCheck: start, rng: c.worlds[0]!.seed, dispatchIndex: 0 };
}

function roll(world: JourneyWorld, max: number): number {
  const n = draw(world.rng);
  world.rng = n.state;
  return Math.floor(n.value * max);
}

function dutyActor(c: Config32, world: JourneyWorld): string {
  const people = c.people.map(p => p.id);
  const jobs = [...world.books.map(b => b.assignment), ...world.stations.map(t => t.alert?.assignment)];
  const load = (id: string) => jobs.filter(job => job?.actor === id).length;
  const cursor = world.dispatchIndex++ % people.length;
  const roster = [...people.slice(cursor), ...people.slice(0, cursor)];
  return roster.sort((a, b) => load(a) - load(b))[0]!;
}

function offerDuty(s: State32, emit: Emit32, actor: string, kind: JourneyActivity, subject: string,
  location: string, objectId: string, source: string, minutes = 30): JourneyAssignment {
  const before = s.opportunities.length;
  offer32(s, emit, { actor, participants: [actor], kind, subject, location, objectId,
    available: s.time, deadline: Number.MAX_SAFE_INTEGER, minutes, source: 'consequence',
    rule: 'journey/' + kind + '/1', sourceRefs: [source], sourceKey: kind + ':' + objectId + ':' + source,
    semantic: kind + ':' + objectId + ':' + location });
  assert.equal(s.opportunities.length, before + 1, 'a journey duty already exists for this cause');
  return { actor, opportunity: s.opportunities.at(-1)!.id };
}

// A public request can change hands once, before either person starts the trip or the work.
export function takeLocalDuty(c:Config32,s:State32,id:string,emit:Emit32):boolean {
  if (!c.journeyRevision) return false;
  const world=s.journey!.world, self=s.worlds[id]!, location=self.locationId;
  if (self.needs.hungerMinutes>=300 || s.strain[id]!>=150) return false;
  const holders=[...world.books.filter(b=>b.status==='returned' || b.status==='damaged'),
    ...world.stations.flatMap(st=>[st.alert,st.rack].filter(x=>x!=null))];
  for (const holder of holders) {
    const assignment=holder.assignment;
    if (!assignment || assignment.actor===id || assignment.transferred) continue;
    const o=opportunity32(s,assignment.opportunity)!, owner=s.worlds[assignment.actor]!;
    if (o.location!==location || owner.locationId===location || owner.inProgress?.to===location ||
        o.status!=='pending' || o.inFlight || o.progress || s.time-o.available<60 ||
        s.activePlan[o.actor]===o.id || s.itineraries![o.actor]?.stops.some(stop=>stop.opportunity===o.id && stop.end>s.time)) continue;
    if (o.kind==='journey_collect' && world.books.some(b=>b.carrier===id)) continue;
    if (!canStartLocalDuty(c,s,id,o)) continue;
    o.status='abandoned';
    s.goals.find(g=>g.id===o.goal)!.status='abandoned';
    const ref=emit({kind:'duty_transferred',actor:id,causes:[o.createdRef],data:{opportunity:o.id,from:o.actor,to:id,location}});
    holder.assignment={...offerDuty(s,emit,id,o.kind as JourneyActivity,o.subject,location,o.objectId!,ref,o.minutes),transferred:true};
    return true;
  }
  return false;
}

function placeName(c: Config32, location: string): string {
  return c.worlds[0]!.places.find(p => p.id === location)!.name;
}

function assignBook(c: Config32, s: State32, book: JourneyBook, emit: Emit32): void {
  if (book.assignment) return;
  const title = '《' + book.title + '》';
  const world = s.journey!.world;
  if (book.status === 'returned') {
    book.assignment = offerDuty(s, emit, dutyActor(c, world), 'journey_collect',
      '领取异地还回的' + title, book.location, book.id, book.source);
  } else if (book.status === 'carried') {
    book.assignment = offerDuty(s, emit, book.carrier!, 'journey_deliver',
      '把' + title + '送回' + placeName(c, book.home), book.home, book.id, book.source);
  } else if (book.status === 'damaged') {
    book.assignment = offerDuty(s, emit, dutyActor(c, world), 'journey_mend',
      '修补' + title + '松脱的书脊', book.home, book.id, book.source);
  }
}

function changeWeather(s: State32, station: JourneyStation, emit: Emit32): void {
  const world = s.journey!.world;
  const previous = station.level;
  const drift = roll(world, 5) - 2;
  station.level = Math.max(0, Math.min(6, previous + drift));
  station.nextWeatherAt = s.time + 480 + roll(world, 481);
  if (station.level === previous) return;
  station.weatherSource = emit({ kind: 'river_changed', actor: 'world', causes: [station.weatherSource],
    data: { location: station.location, before: previous, after: station.level } });
  const rack = station.rack;
  if (rack && station.level > previous && rack.baskets < 12) {
    const before = rack.baskets;
    rack.baskets = Math.min(12, before + 3 * (station.level - previous));
    rack.source = emit({kind: 'river_debris', actor: 'world', causes: [rack.source, station.weatherSource],
      data: {location: station.location, before, after: rack.baskets}});
  }
  if (!station.alert && Math.abs(station.level - station.reportedLevel) >= 2) {
    station.alert = { source: emit({ kind: 'river_alert', actor: 'world',
      causes: [station.reportSource, station.weatherSource],
      data: { location: station.location, lastReading: station.reportedLevel, level: station.level } }),
    level: station.level, assignment: null };
  }
}

function circulate(s: State32, book: JourneyBook, emit: Emit32): void {
  const world = s.journey!.world;
  if (s.time < book.nextAt) return;
  if (book.status === 'shelf') {
    book.status = 'loan';
    book.nextAt = s.time + day + roll(world, day * 2);
    book.source = emit({ kind: 'reader_borrowed', actor: 'world', causes: [book.source],
      data: { book: book.id, location: book.home, due: book.nextAt } });
  } else if (book.status === 'loan') {
    const open = world.stations.filter(st => st.location !== book.home && st.reportedLevel < 5 && (st.rack?.baskets ?? 0) < 9);
    const target = open.length ? open[roll(world, open.length)]!.location : book.home;
    book.location = target;
    book.timesRead++;
    book.wear++;
    book.status = target !== book.home ? 'returned' : book.wear >= 3 ? 'damaged' : 'shelf';
    book.source = emit({ kind: 'reader_returned', actor: 'world', causes: [book.source, ...world.stations.flatMap(t => t.rack ? [t.reportSource, t.rack.source] : [t.reportSource])],
      data: { book: book.id, location: target, home: book.home, wear: book.wear } });
    book.nextAt = s.time + 720 + roll(world, day);
  }
}

function offerLocalConversation(c: Config32, s: State32, emit: Emit32): void {
  if (!c.rules.social) return;
  const available = c.people.filter(p => {
    const w = s.worlds[p.id]!;
    return !w.sleeping && !w.inProgress?.to && s.socialNeed[p.id]! >= c.rules.socialAfter / 2 &&
      !s.opportunities.some(o => o.participants.includes(p.id) && ['social','contact','gather','collaborate'].includes(o.kind) &&
        ['pending','active','paused'].includes(o.status));
  });
  for (const speaker of available) {
    const location = s.worlds[speaker.id]!.locationId;
    const listener = available.find(other => other.id !== speaker.id && s.worlds[other.id]!.locationId === location);
    if (!listener) continue;
    const memory = s.memories.findLast(m => m.actor === speaker.id && m.topic.startsWith('journey_') && m.topic!=='journey_message');
    if (!memory) continue;
    const experience = opportunity32(s, memory.opportunity);
    if (!experience) continue;
    const sourceKey = 'conversation:' + memory.source + ':' + listener.id;
    if (s.consumed.includes(sourceKey)) continue;
    offer32(s, emit, {actor: speaker.id, participants: [speaker.id, listener.id], kind: 'social',
      subject: '聊起' + experience.subject, location, objectId: experience.id, source: 'social',
      rule: 'journey/local-conversation/1', sourceRefs: [memory.source], sourceKey,
      available: s.time, deadline: s.time + 120, minutes: 60, semantic: 'conversation:' + experience.semantic});
    return;
  }
}

export function generateJourney(c: Config32, s: State32, emit: Emit32): void {
  const world = s.journey!.world;
  if (s.time < world.nextCheck) return;
  world.nextCheck = s.time + 30;
  if (c.localActivities) offerLocalConversation(c, s, emit);
  for (const station of world.stations) {
    if (s.time >= station.nextWeatherAt) changeWeather(s, station, emit);
    const rack = station.rack;
    if (rack && rack.baskets > 0 && !rack.assignment) {
      const bank = station.location === 'bookstore' ? 'park' : station.location;
      const nearby = c.people.filter(p => !s.worlds[p.id]!.sleeping && journeyRegion(s.worlds[p.id]!.locationId) === station.location);
      // Prefer somebody on site with few outstanding duties. A batch belongs to exactly one person.
      const subjects = [...world.books.map(b => b.assignment), ...world.stations.flatMap(t => [t.rack?.assignment, t.alert?.assignment])];
      const load = (id: string) => subjects.filter(job => job?.actor === id).length;
      const actor = nearby.sort((a,b) => load(a.id)-load(b.id) ||
        Number(s.worlds[b.id]!.locationId===bank)-Number(s.worlds[a.id]!.locationId===bank) ||
        (s.history.findLast(h=>h.actor===a.id && h.kind==='journey_clear')?.until ?? 0) -
        (s.history.findLast(h=>h.actor===b.id && h.kind==='journey_clear')?.until ?? 0))[0];
      if (actor) {
        const baskets = Math.min(3, rack.baskets);
        rack.assignment = offerDuty(s, emit, actor.id, 'journey_clear', '从岸边拦网上清走' + baskets + '筐漂枝',
          bank, station.location, rack.source, baskets * 30);
      }
    }
    if (c.localActivities && !station.reportSource.startsWith('initial:')) openFieldVisits(c, s, station, emit, true);
    const alert = station.alert;
    if (alert && !alert.assignment) {
      alert.assignment = offerDuty(s, emit, dutyActor(c, world), 'journey_survey', '沿岸复测水位并更新还书点通告',
        station.location, station.location, alert.source);
    }
  }
  for (const book of world.books) {
    circulate(s, book, emit);
    assignBook(c, s, book, emit);
  }
}

function journeyAction(o: Opportunity32): boolean {
  return o.kind.startsWith('journey_');
}

export function scoreJourneyWorld(c: Config32, s: State32, id: string, d: Decision32): Decision32 {
  const world = s.journey!.world;
  const carrying = world.books.find(b => b.carrier === id);
  for (const candidate of d.candidates) {
    const op = s.opportunities.find(o => o.id === candidate.id)!;
    if (!journeyAction(op)) continue;
    if (op.kind === 'journey_collect' && carrying) candidate.reasons.push('journey_bag_occupied');
    // Age measures how long a concrete request has waited. No reward for crossing a boundary itself.
    if (op.kind === 'journey_message') {
      candidate.factors.personalNews = 60;
    } else if (op.kind === 'journey_clear') {
      candidate.factors.blockedLanding = (world.stations.find(st => st.location === op.objectId)!.rack!.baskets >= 9 ? 45 : 10);
    } else if (op.kind === 'journey_fieldnote') {
      const profile = c.people.find(p => p.id === id)!;
      candidate.factors.fieldInterest = profile.interests.filter(i => ['摄影','园艺','写作','探索'].includes(i)).length * 35;
    } else {
      candidate.factors.outstandingDuty = Math.min(95, Math.floor((s.time - op.available) / 20));
      candidate.factors.sharedNeed = op.kind === 'journey_deliver' ? 190 : op.kind === 'journey_survey' ? 120 : 105;
    }
    candidate.score = Object.values(candidate.factors).reduce((a, b) => a + b, 0);
  }
  return d;
}

export function describeJourney(c: Config32, s: State32, o: Opportunity32): { text: string; changes: string[] } | null {
  if (o.kind === 'travel_journal') {
    const experience=opportunity32(s,o.objectId)!;
    const name=c.people.find(p=>p.id===o.actor)!.name;
    return {text:name+'翻开旅途手记，把在'+placeName(c,experience.location)+'亲历的“'+experience.subject+'”记了下来。',changes:['手记收录一条亲历记录']};
  }
  if (o.kind === 'journey_message') return messageDetail(c,s,o);
  if (o.rule === 'journey/local-conversation/1') {
    const [speaker, listener] = o.participants.map(id => c.people.find(p => p.id === id)!.name);
    const subject = opportunity32(s, o.objectId)!.subject;
    return {text: speaker + '和' + listener + '在' + placeName(c, o.location) + '碰面。两人聊起' + speaker +
      '亲手办过的事——' + subject + '。这段相处用了' + o.minutes + '分钟。', changes: ['分享亲身经历','增加彼此的信任']};
  }
  if (!journeyAction(o)) return null;
  const world = s.journey!.world, name = c.people.find(p => p.id === o.actor)!.name;
  const where = placeName(c, o.location);
  if (o.kind === 'journey_clear') {
    const rack = world.stations.find(st => st.location === o.objectId)!.rack!;
    const baskets = o.minutes / 30;
    return { text: name + '在' + where + '把岸边拦网里的漂枝捞出、分筐运离。清走' + baskets +
      '筐后，网里还剩' + (rack.baskets - baskets) + '筐。', changes: ['河岸拦网清出' + baskets + '筐空间'] };
  }
  if (o.kind === 'journey_fieldnote') {
    const st = world.stations.find(t => t.location === o.location)!;
    const view = st.level >= 5 ? '水沿着码头边的石阶漫过了下一级刻痕' : '退水以后，河滩的一层层泥纹露了出来';
    return { text: name + '在' + where + '沿岸停了半小时。' + view + '。' + name + '把眼前的水痕和' + st.level +
      '格的读数放在同一页手记里。', changes: ['留下自己的现场记录与实测读数'] };
  }
  if (o.kind === 'journey_survey') {
    const site = world.stations.find(st => st.location === o.location)!;
    const result = site.level >= 5 || (site.rack?.baskets ?? 0) >= 9 ? '通知沿路的读者把异地还书带到别的站' : '通知沿路的读者可以来这里还书';
    return { text: name + '在' + where + '的堤岸核对水尺，上次记录是' + site.reportedLevel + '格，这次是' + site.level + '格。站里据此' + result + '。',
      changes: ['归还点通告采用本次实测水位'] };
  }
  const book = world.books.find(b => b.id === o.objectId)!, title = '《' + book.title + '》';
  if (o.kind === 'journey_collect') return {
    text: name + '在' + where + '清点还书箱，把' + title + '放进行囊。这本书属于' + placeName(c, book.home) + '，那边的书架仍空着它的位置。',
    changes: ['异地归还本转入本人行囊'] };
  if (o.kind === 'journey_mend') return {
    text: name + '在' + where + '给' + title + '松脱的书脊重新穿线，把散页装回去。借阅台把修好的这一本重新上架。',
    changes: ['修好的书重新开放借阅'] };
  const damaged = book.wear >= 3;
  return { text: name + '把从' + placeName(c, book.location) + '带来的' + title + '交给' + where + '。' +
    (damaged ? '摊开时有几页松动，收书人把它送上了待修架。' : '收书人核对馆藏，将它放回可以借出的书架。'),
  changes: [damaged ? '异地还书入站，书脊破损产生修补需求' : '书归原站，可供下一位读者借出'] };
}

function riverBand(level: number): 'high' | 'low' | null {
  return level >= 5 ? 'high' : level <= 1 ? 'low' : null;
}

function seasonAt(c: Config32, time: number): number {
  const date = new Date((time + c.worlds[0]!.timezoneOffsetMinutes) * 60000);
  return date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3);
}

function openFieldVisits(c: Config32, s: State32, station: JourneyStation, emit: Emit32, onSite = false): void {
  const band = riverBand(station.level);
  if (!band || station.nextWeatherAt - s.time < 30) return;
  const key = station.location + ':' + band, season = seasonAt(c, s.time);
  for (const p of c.people) {
    if (!p.interests.some(i => ['摄影','园艺','写作','探索'].includes(i))) continue;
    const previous = s.journey!.world.fieldNotes[p.id]![key];
    if (onSite && (s.worlds[p.id]!.locationId !== station.location || s.worlds[p.id]!.sleeping)) continue;
    if (previous?.season === season) {
      const opposite = s.journey!.world.fieldNotes[p.id]![station.location + ':' + (band === 'high' ? 'low' : 'high')];
      if (!onSite || previous.at === undefined || (opposite?.at ?? 0) <= previous.at || s.time - previous.at < 2 * day) continue;
    }
    if (c.localActivities && s.opportunities.some(o => o.actor===p.id && o.kind==='journey_fieldnote' && o.objectId===key &&
        ['pending','active','paused'].includes(o.status)))continue;
    const subject = placeName(c, station.location) + (band === 'high' ? '码头的高水痕迹' : '低水位露出的滩地');
    offer32(s, emit, { actor: p.id, participants: [p.id], kind: 'journey_fieldnote', subject,
      location: station.location, objectId: key, minutes: 30, available: s.time, deadline: Math.min(s.time + 480, station.nextWeatherAt),
      source: 'environment', rule: 'journey/fieldnote/1', sourceRefs: [station.reportSource, ...(onSite ? [station.weatherSource] : []), ...(previous ? [previous.source] : [])],
      sourceKey: 'field:' + (onSite ? station.weatherSource : station.reportSource) + ':' + p.id, semantic: 'field:' + key });
  }
}

export function finishJourney(c: Config32, s: State32, o: Opportunity32, ref: string, emit: Emit32): void {
  if (!journeyAction(o)) return;
  assert.ok(o.progress >= o.minutes && s.worlds[o.actor]!.locationId === o.location, 'journey work requires completed work on site');
  const world = s.journey!.world;
  if (o.kind === 'journey_message') { finishMessage(s,o,ref); return; }
  if (o.kind === 'journey_clear') {
    const rack = world.stations.find(st => st.location === o.objectId)!.rack!;
    assert.equal(rack.assignment?.opportunity, o.id);
    const before = rack.baskets, baskets = o.minutes / 30;
    assert.ok(before >= baskets);
    rack.baskets -= baskets;
    rack.source = emit({kind: 'river_rack_cleared', actor: o.actor, causes: [ref, rack.source],
      data: {location: o.objectId!, before, after: rack.baskets}});
    rack.assignment = null;
    return;
  }
  if (o.kind === 'journey_fieldnote') {
    const st = world.stations.find(town => town.location === o.location)!;
    const key = st.location + ':' + riverBand(st.level);
    const season = seasonAt(c, o.available);
    const notes = world.fieldNotes[o.actor]!;
    const previous = notes[key], opposite = notes[st.location + ':' + (riverBand(st.level) === 'high' ? 'low' : 'high')];
    const fresh = previous?.season !== season || (c.localActivities && previous.at !== undefined &&
      (opposite?.at ?? 0) > previous.at && o.available - previous.at >= 2 * day);
    assert.ok(key === o.objectId && s.time <= o.deadline && fresh, 'field conditions expired or already observed');
    notes[key] = { season, source: ref, level: st.level, ...(c.localActivities ? {at:s.time} : {}) };
    if (c.people.find(p => p.id === o.actor)!.interests.some(i => ['摄影','写作'].includes(i))) {
      offer32(s, emit, { actor: o.actor, participants: [o.actor], kind: 'create', subject: o.subject,
        location: st.location, objectId: key, minutes: 90, available: s.time, deadline: s.time + 3 * day,
        source: 'consequence', rule: 'journey/field-work/1', sourceRefs: [ref], sourceKey: 'field-work:' + ref,
        semantic: 'create:' + o.subject });
    }
    return;
  }
  if (o.kind === 'journey_survey') {
    const st = world.stations.find(town => town.location === o.location)!;
    assert.equal(st.alert?.assignment?.opportunity, o.id, 'survey requires the open alert');
    st.reportedLevel = st.level;
    st.reportSource = emit({ kind: 'river_bulletin', actor: o.actor, causes: [ref, st.weatherSource, ...(st.rack ? [st.rack.source] : [])],
      data: { location: st.location, level: st.level, acceptsReturns: st.level < 5 && (st.rack?.baskets ?? 0) < 9 } });
    st.alert = null;
    openFieldVisits(c, s, st, emit);
    return;
  }
  const book = world.books.find(b => b.id === o.objectId)!;
  assert.equal(book.assignment?.opportunity, o.id, 'book requires its active handover');
  assert.equal(book.assignment.actor, o.actor);
  if (o.kind === 'journey_collect') {
    assert.ok(book.status === 'returned' && book.location === o.location && !world.books.some(b => b.carrier === o.actor));
    book.status = 'carried';
    book.carrier = o.actor;
  } else {
    assert.ok(book.home === o.location);
    if (o.kind === 'journey_deliver') assert.ok(book.status === 'carried' && book.carrier === o.actor);
    else { assert.equal(book.status, 'damaged'); book.wear = 0; }
    book.location = book.home;
    book.carrier = null;
    book.status = book.wear >= 3 ? 'damaged' : 'shelf';
    book.nextAt = s.time + 720 + roll(world, day);
  }
  book.assignment = null;
  book.source = ref;
  assignBook(c, s, book, emit);
}
