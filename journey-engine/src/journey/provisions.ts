import {localMinute} from '../domain/time.ts';
import {path32,unfinished} from '../life32r3/planner.ts';
import {offer32} from '../life32r3/sources.ts';
import type {Config32,Emit32,State32} from '../life32r3/types.ts';

export const ingredientsCents = 800;
const kitchens = ['bookstore','ford','ridge','lunch','home'];

export function mealPrice(s:State32,id:string,normalPrice:number):number {
  return (s.journey?.world.provisions?.[id]?.portions ?? 0)>0 ? 0 : normalPrice;
}

export function offerPackedMeals(c:Config32,s:State32,id:string,emit:Emit32):boolean {
  const stock=s.journey?.world.provisions?.[id];
  if (!stock || stock.portions || s.opportunities.some(o=>o.actor===id && o.kind==='pack_meals' && unfinished(o))) return false;
  const w=s.worlds[id]!, cfg=c.worlds.find(v=>v.character.id===id)!;
  if(w.needs.hungerMinutes>=300 || w.fatigue+30>cfg.sleepAfterMinutes || w.cashCents<ingredientsCents) return false;
  const choices=kitchens.flatMap(location=>{
    const place=cfg.places.find(v=>v.id===location);
    const path=place && path32(c,s,id,location);
    if (!place || !path) return [];
    const travel=path.reduce((sum,r)=>sum+r.duration,0), fare=path.reduce((sum,r)=>sum+r.costCents,0);
    const arrival=localMinute(s.time+travel,cfg.timezoneOffsetMinutes);
    if (travel>30 || w.fatigue+travel+30>cfg.sleepAfterMinutes || arrival<place.openMinute ||
        arrival+30>place.closeMinute || w.cashCents<fare+ingredientsCents+cfg.mealCostCents) return [];
    return [{location,travel,fare}];
  }).sort((a,b)=>a.travel-b.travel || a.fare-b.fare);
  const site=choices[0];
  if(!site)return false;
  const key='packed-meals:'+id+':'+stock.source;
  if(s.consumed.includes(key))return false;
  offer32(s,emit,{actor:id,participants:[id],kind:'pack_meals',subject:'买食材，做好两份路餐',location:site.location,
    objectId:null,minutes:30,available:s.time,deadline:s.time+120,source:'consequence',rule:'journey/packed-meals/1',
    sourceRefs:[stock.source],sourceKey:key,semantic:'prepare:two-meals'});
  return true;
}
