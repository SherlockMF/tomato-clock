import type {Record32,State32} from '../src/life32r3/types.ts';
import {opportunity32} from '../src/life32r3/sources.ts';
import type {Scene} from '../src/studio/journey-reader.ts';

export class JourneyPatterns {
  readonly hero:string;
  readonly home:string;
  place:string;
  constructor(hero:string,home:string,start:string){this.hero=hero;this.home=home;this.place=start;}
  homeSpan=0;homeMax=0;homeTotal=0;
  studyEnd=-1;studySpan=0;studyMax=0;studyTotal=0;
  previousPlace='';productiveStop=false;returns=0;legs=0;alternating=0;longestAlternating=0;
  moveExample:{ref:string;from:string;to:string;time:number}[]=[];
  private chain:typeof this.moveExample=[];
  private decision:Record32|null=null;
  private waitEnd=-1;
  private waitSpan=0;
  private startWait:Record32|null=null;
  private peak=0;
  waitExample:unknown=null;
  waitReasons:Record<string,number>={};
  private stories:{window:number;key:string;topic:string;ref:string|null}[]=[];
  tenBlocks=0;tenRepeats=0;tenWorst=0;
  worstBlock:typeof this.stories=[];
  record(row:Record32,state:State32){
    if(row.actor===this.hero && row.decision)this.decision=row;
    const f=row.fact;
    if(!f?.actors.includes(this.hero) || f.until<=f.from)return;
    const n=f.until-f.from;
    if(f.kind==='move'){
      this.legs++;
      const reverse=f.location===this.previousPlace;
      if(reverse && !this.productiveStop)this.returns++;
      this.alternating=reverse?this.alternating+1:1;
      const leg={ref:row.id,from:this.place,to:f.location,time:f.until};
      if(!reverse)this.chain=[];
      this.chain.push(leg);
      if(this.alternating>this.longestAlternating){this.longestAlternating=this.alternating;this.moveExample=[...this.chain];}
      this.previousPlace=this.place;this.place=f.location;this.productiveStop=false;
    }else if(f.progress && f.opportunity)this.productiveStop=true;
    if(f.location===this.home && f.kind!=='move'){
      this.homeSpan+=n;this.homeTotal+=n;this.homeMax=Math.max(this.homeSpan,this.homeMax);
    }else this.homeSpan=0;
    if(f.kind==='study'){
      this.studySpan=(this.studyEnd===f.from?this.studySpan:0)+n;this.studyTotal+=n;this.studyEnd=f.until;
      this.studyMax=Math.max(this.studyMax,this.studySpan);
    }
    if(f.kind==='waiting'){
      const reason=this.decision?.decision?.reason??'unknown';
      this.waitReasons[reason]=(this.waitReasons[reason]??0)+n;
      if(this.waitEnd!==f.from){this.waitSpan=0;this.startWait=this.decision;}
      this.waitSpan+=n;this.waitEnd=f.until;
      if(this.waitSpan>this.peak){
        this.peak=this.waitSpan;
        const d=this.startWait?.decision;
        this.waitExample={from:f.until-this.peak,until:f.until,place:f.location,finalRef:row.id,firstDecision:this.startWait?.id,
          reason:d?.reason,needs:d?.needs,candidates:d?.candidates.map(x=>({kind:x.kind,subject:opportunity32(state,x.id)?.subject,
            location:opportunity32(state,x.id)?.location,score:x.score,reasons:x.reasons,planning:x.planningReasons}))};
      }
    }
  }
  story(window:number,scene:Scene,state:State32){
    const f=scene.row?.fact,o=opportunity32(state,f?.opportunity);
    const key=JSON.stringify([f?.kind??null,o?.subject??f?.title??null,f?.location??null]);
    this.stories.push({window,key,topic:scene.topic,ref:scene.row?.id??null});
    if(this.stories.length>10)this.stories.shift();
    if(this.stories.length===10){
      const repeats=10-new Set(this.stories.map(s=>s.key)).size;
      this.tenBlocks++;this.tenRepeats+=repeats;
      if(!this.worstBlock.length || repeats>this.tenWorst){this.tenWorst=repeats;this.worstBlock=[...this.stories];}
    }
  }
  summary(){return {homeMax:this.homeMax,homeTotal:this.homeTotal,studyMax:this.studyMax,studyTotal:this.studyTotal,
    legs:this.legs,immediateReturns:this.returns,longestAlternating:this.longestAlternating,moveExample:this.moveExample,
    waitReasons:this.waitReasons,waitExample:this.waitExample,tenBlocks:this.tenBlocks,meanRepeatInTen:this.tenBlocks?this.tenRepeats/this.tenBlocks:null,
    worstRepeatInTen:this.tenWorst,worstBlock:this.worstBlock};}
}
