import assert from 'node:assert/strict';
import {journeyFixture} from '../src/journey/world.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import type {Background} from '../src/life32r3/types.ts';
import type {Evidence32} from '../src/life32r3/store.ts';
import {JourneyReading,renderScene} from '../src/studio/journey-reader.ts';

const [background='creator',days='60',seed='19']=process.argv.slice(2);
assert.ok(['creator','traveler','settled','low_assets'].includes(background));
assert.ok(Number.isSafeInteger(+days) && +days>0 && Number.isSafeInteger(+seed));
const config=journeyFixture(background as Background,+seed), rt=new Runtime32(config);
function stats(){return {windows:0, repeats:0, identical:0, longest:0, run:0, last:'', lastText:'', ordinary:0,
  topics:{} as Record<string,number>, samples:[] as string[]};}
const short=stats(),long=stats();
const shortReading=new JourneyReading(),longReading=new JourneyReading();
function read(e:Evidence32, result:ReturnType<typeof stats>,reading:JourneyReading){
  const scene=reading.select(e), recap=renderScene(e,scene);
  if(result.last===scene.topic)result.repeats++;
  if(result.lastText===recap.text)result.identical++;
  result.run=result.last===scene.topic?result.run+1:1;
  result.longest=Math.max(result.longest,result.run);
  result.topics[scene.topic]=(result.topics[scene.topic]??0)+1;
  if(['途中','起居','赶路','吃饭','停留','休息','锻炼','路餐'].includes(scene.topic))result.ordinary++;
  if(result.samples.length<6)result.samples.push(recap.text);
  result.last=scene.topic;result.lastText=recap.text;result.windows++;
}
let first:Evidence32|undefined;
let before=rt.state;
for(let i=1;i<=Math.floor(+days*960/200);i++){
  const {state:after,records}=rt.advance(200);
  const e={config,before,after,records,digest:'evaluation',receipt:{id:'w'+i,sequence:i,realMinutes:25,rate:8 as const,
    from:before.time,until:after.time,start:before.serial,end:after.serial,digest:'evaluation'}};
  read(e,short,shortReading);
  if(first){
    read({...e,before:first.before,records:[...first.records,...records],receipt:{...e.receipt,realMinutes:50,
      sequence:i/2,from:first.receipt.from,start:first.receipt.start}},long,longReading);
    first=undefined;
  }else first=e;
  before=after;
}
console.log(JSON.stringify({background,days:+days,seed:+seed,short,long}));
