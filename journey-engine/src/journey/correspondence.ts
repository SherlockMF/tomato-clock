import assert from 'node:assert/strict';
import {offer32, opportunity32} from '../life32r3/sources.ts';
import type {Config32, Emit32, Opportunity32, State32} from '../life32r3/types.ts';

// An absent friend can receive a message while busy. Only a subsequent reply records that it was read.
export function offerMessage(c:Config32,s:State32,id:string,emit:Emit32,openGap=false):boolean {
  if (!c.localActivities || !c.rules.social || s.socialNeed[id]! < c.rules.socialAfter / 3) return false;
  const recent = s.history.findLast(h=>h.actor===id);
  if (!recent || (!((c.journeyRevision??0)>=3 && openGap) && (recent.kind!=='waiting' || recent.until!==s.time))) return false;
  const lastMessage = s.history.findLast(h=>h.actor===id && h.kind==='journey_message');
  if (lastMessage && s.time-lastMessage.until < 480) return false;
  const inbox = s.journey!.world.inbox!;
  const self = s.worlds[id]!, config = c.worlds.find(w=>w.character.id===id)!;
  if (config.sleepAfterMinutes-self.fatigue<30 || self.needs.hungerMinutes>=300 || s.strain[id]!>=150) return false;
  const location = self.locationId;
  const incoming = Object.entries(inbox[id]!).find(([other])=>c.journeyRevision===7 || s.worlds[other]!.locationId!==location);
  const experience = s.memories.findLast(m=>m.actor===id && m.opportunity && m.topic.startsWith('journey_') && m.topic!=='journey_message');
  const other = incoming?.[0] ?? c.people.find(p=>p.id!==id && s.worlds[p.id]!.locationId!==location && !inbox[p.id]![id])?.id;
  if (!other) return false;
  const original = incoming ? incoming[1].experience : experience?.opportunity;
  const topic = opportunity32(s,original);
  if (!topic) return false;
  const source = incoming ? incoming[1].source : experience!.source;
  let key = (incoming ? 'reply:' : 'news:') + source;
  if (s.consumed.includes(key)) {
    if (!incoming) return false;
    const last = s.opportunities.findLast(o=>o.actor===id && o.rule==='journey/reply/1' && o.sourceRefs[0]===source);
    if (!last || last.status!=='missed' || s.time-last.deadline<240) return false;
    key += ':' + last.createdRef;
  }
  const name = c.people.find(p=>p.id===other)!.name;
  offer32(s,emit,{actor:id,participants:[id],kind:'journey_message',subject:(incoming?'回复':'写给')+name+'的旅途近况',
    location,minutes:30,available:s.time,deadline:s.time+30,source:'social',rule:incoming?'journey/reply/1':'journey/news/1',
    sourceRefs:[source,recent.ref],sourceKey:key,objectId:other,semantic:(incoming?'reply:':'news:')+topic.semantic});
  return true;
}

export function messageDetail(c:Config32,s:State32,o:Opportunity32) {
  const sender=c.people.find(p=>p.id===o.actor)!.name, other=c.people.find(p=>p.id===o.objectId)!.name;
  if(o.rule==='journey/reply/1'){
    const original=s.journey!.world.inbox![o.actor]![o.objectId!]!;
    const topic=opportunity32(s,original.experience)!.subject;
    return {text:sender+'读完'+other+'从异地发来的消息，里面讲的是“'+topic+'”。'+sender+'花时间写下自己的回应，把回信发了出去。',
      changes:['来信已读并回信']};
  }
  const memory=s.memories.findLast(m=>m.source===o.sourceRefs[0] && m.actor===o.actor)!;
  return {text:sender+'把亲历的“'+opportunity32(s,memory.opportunity)!.subject+'”写给异地的'+other+'。消息已经送达，对方有空时可以回复。',
    changes:['近况已送达，等待对方阅读']};
}

export function finishMessage(s:State32,o:Opportunity32,ref:string):void {
  const inbox=s.journey!.world.inbox!, other=o.objectId!;
  if(o.rule==='journey/reply/1'){
    assert.equal(inbox[o.actor]![other]?.source,o.sourceRefs[0],'reply requires the unread message');
    delete inbox[o.actor]![other];
    const relation=s.relations.find(r=>[r.a,r.b].includes(o.actor) && [r.a,r.b].includes(other))!;
    relation.trust=Math.min(100,relation.trust+1);
    relation.source=ref;
    s.socialNeed[o.actor]=Math.max(0,s.socialNeed[o.actor]!-120);
  } else {
    const memory=s.memories.findLast(m=>m.source===o.sourceRefs[0] && m.actor===o.actor)!;
    assert.ok(!inbox[other]![o.actor],'previous message is still unread');
    inbox[other]![o.actor]={source:ref,experience:memory.opportunity!};
  }
}
