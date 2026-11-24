import type {Evidence32} from '../life32r3/store.ts';
import type {Record32} from '../life32r3/types.ts';
import {opportunity32} from '../life32r3/sources.ts';
import type {Scene} from './journey-reader.ts';

export function connectScene(e:Evidence32,scene:Scene,lookup:(ref:string)=>Record32|undefined):Scene {
  const row=scene.row,f=row?.fact,hero=e.config.hero;
  if(!row || !f?.semantic || !f.actors.includes(hero))return scene;
  const op=opportunity32(e.after,f.opportunity);
  if(!op)return scene;
  const name=e.config.people.find(p=>p.id===hero)!.name;
  // Follow only the typed origin of this opportunity, within this window's past.
  function origin(ref:string|undefined,before:Record32){
    if(!ref || !/^v\d+$/.test(ref))return undefined;
    const source=lookup(ref);
    return source && source.id===ref && source.sequence<before.sequence && source.time<=before.time?source:undefined;
  }
  if((e.config.journeyRevision??0)>=7 && f.kind==='journey_clear'){
    const finish=e.records.find(r=>r.kind==='river_rack_cleared' && r.actor===hero && r.causes[0]===row.id &&
      r.data?.location===f.location && r.data.after===0);
    if(!finish)return scene;
    const earlier=origin(finish.causes[1],finish);
    if(earlier?.kind!=='river_rack_cleared' || earlier.actor!==hero || earlier.data?.location!==f.location ||
      earlier.id!==op.sourceRefs[0] || earlier.data.after!==finish.data?.before)return scene;
    const first=origin(earlier.causes[0],earlier);
    if(first?.fact?.kind!=='journey_clear' || first.actor!==hero || !first.fact.semantic || first.fact.location!==f.location)return scene;
    const removed=Number(earlier.data.before)-Number(earlier.data.after), left=Number(earlier.data.after);
    if(!(removed>0 && left>0))return scene;
    const place=e.config.worlds[0]!.places.find(p=>p.id===f.location)!.name;
    return {...scene,context:{text:name+'上次在'+place+'捞走了'+removed+'筐漂枝，拦网上还挂着'+left+
      '筐。这回把剩下的也搬上了岸，拦网清空了。',refs:[first.id,earlier.id,row.id,finish.id]}};
  }
  if(['journey_deliver','journey_mend'].includes(f.kind)){
    const prior=origin(op.sourceRefs[0],row),old=opportunity32(e.after,prior?.fact?.opportunity);
    const book=e.after.journey?.world.books.find(b=>b.id===op.objectId);
    if(!book || !prior?.fact?.semantic || !prior.fact.actors.includes(hero) || old?.objectId!==op.objectId)return scene;
    const title='《'+book.title+'》';
    if(f.kind==='journey_deliver' && prior.fact.kind==='journey_collect'){
      const place=e.config.worlds[0]!.places.find(p=>p.id===prior.fact!.location)!.name;
      return {...scene,context:{text:name+'先前在'+place+'收进包里的'+title+'，这次送回了原来的书站。'+f.text.split('。').slice(1).join('。'),refs:[prior.id,row.id]}};
    }
    if(f.kind==='journey_mend' && prior.fact.kind==='journey_deliver' && prior.fact.location===f.location &&
      prior.fact.newState.includes('异地还书入站，书脊破损产生修补需求'))
      return {...scene,context:{text:name+'上次送回'+title+'时，书里有几页松了。这次重新穿好书脊，借阅台把书放回了架上。',refs:[prior.id,row.id]}};
  }
  if(op.rule!=='journey/reply/1')return scene;
  const sender=op.objectId,letter=origin(op.sourceRefs[0],row),send=opportunity32(e.after,letter?.fact?.opportunity);
  if(!letter?.fact?.semantic || letter.actor!==sender || send?.rule!=='journey/news/1' || send.objectId!==hero)return scene;
  const finish=origin(send.sourceRefs[0],letter),job=opportunity32(e.after,finish?.fact?.opportunity);
  if(!finish?.fact?.semantic || finish.actor!==sender || job?.kind!=='journey_clear')return scene;
  const change=origin(job.sourceRefs[0],finish);
  if(change?.kind!=='river_rack_cleared' || change.data?.location!==job.objectId)return scene;
  const prior=origin(change.causes[0],change),old=opportunity32(e.after,prior?.fact?.opportunity);
  if(!prior?.fact?.semantic || prior.actor!==hero || old?.kind!=='journey_clear' || old.objectId!==job.objectId ||
    prior.fact.location!==finish.fact.location || change.data?.after!==job.minutes/30 ||
    !finish.fact.text.endsWith('网里还剩0筐。'))return scene;
  const amount=Number(change.data.before)-Number(change.data.after),left=job.minutes/30;
  if(amount!==old.minutes/30 || amount<=0 || left<=0)return scene;
  const place=e.config.worlds[0]!.places.find(p=>p.id===finish.fact!.location)!.name;
  const person=e.config.people.find(p=>p.id===sender)!,friend=person.name,pronoun=person.gender==='female'?'她':'他';
  return {...scene,context:{text:friend+'捎来消息，'+place+'拦网上剩下的'+left+'筐漂枝，'+pronoun+'已经清完了。'+name+'先前从那张网上捞走了'+amount+'筐，读完便给'+pronoun+'回了信。',
    refs:[row.id,letter.id,finish.id,change.id,prior.id]}};
}
