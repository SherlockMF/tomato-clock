import type { Evidence32 } from '../life32r3/store.ts';
import type { Record32 } from '../life32r3/types.ts';
import { journeyRegion } from './world.ts';

export function travelParagraphs(e: Evidence32, facts: Record32[]) {
  const hero = e.config.hero, person = e.config.people.find(p => p.id === hero)!;
  let region = journeyRegion(e.before.worlds[hero]!.locationId);
  const chosen = facts.filter(r => {
    const fact = r.fact!;
    if (fact.kind !== 'move') return Boolean(fact.opportunity);
    const arrival = journeyRegion(fact.location), crossed = arrival !== region;
    region = arrival;
    return crossed;
  });
  if (!chosen.length) chosen.push(...facts.filter(r => r.fact!.kind !== 'waiting').slice(-2));
  const groups: Record32[][] = [];
  for (const row of chosen) {
    const group = groups.at(-1), opportunity = row.fact!.opportunity;
    if (group && opportunity && group[0]!.fact!.opportunity === opportunity) group.push(row);
    else groups.push([row]);
  }
  const ledger = e.after.worlds[hero]!.ledger;
  const wages = new Map(ledger.slice(e.before.worlds[hero]!.ledger.length)
    .filter(entry => entry.category === 'earned_income').map(entry => [hero+'/'+entry.eventId, entry.amountCents]));
  return groups.map(group => {
    const fact = group.at(-1)!.fact!, refs = group.map(r => r.id);
    if (fact.kind !== 'work') return {text:fact.text, refs};
    const minutes = group.reduce((sum,r) => sum + r.fact!.until - r.fact!.from, 0);
    const cents = group.flatMap(r => r.causes).reduce((sum,id) => sum + (wages.get(id) ?? 0), 0);
    const place = e.config.worlds[0]!.places.find(p => p.id === fact.location)!.name;
    const continuing = e.before.opportunities.some(o => o.id === fact.opportunity && o.progress > 0);
    const text = person.name + (continuing ? '接着上一段班在' : '在') + place + '值班，本次结算' + minutes + '分钟，实收' + cents/100 + '元。';
    return {text, refs};
  });
}
