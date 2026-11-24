import type {DatabaseSync} from 'node:sqlite';
import {StudioError} from './catalog.ts';

export interface Timer {id:string;experiment:string;realMinutes:25|50;rate:6|8;until:number;status:'running'|'completed'|'cancelled';sequence:number|null}
export class JourneyClock {
  readonly db:DatabaseSync;
  readonly now:()=>number;
  constructor(db:DatabaseSync,now=Date.now){
    this.db=db;this.now=now;
    db.exec(`CREATE TABLE IF NOT EXISTS journey_timers(
      experiment TEXT NOT NULL,id TEXT NOT NULL,realMinutes INTEGER NOT NULL,rate INTEGER NOT NULL,
      until INTEGER NOT NULL,status TEXT NOT NULL,sequence INTEGER,PRIMARY KEY(experiment,id));
      CREATE UNIQUE INDEX IF NOT EXISTS one_running_timer ON journey_timers(experiment) WHERE status='running'`);
  }
  latest(experiment:string):Timer|undefined{
    return this.db.prepare('SELECT * FROM journey_timers WHERE experiment=? ORDER BY rowid DESC LIMIT 1').get(experiment) as unknown as Timer|undefined;
  }
  command(experiment:string,input:unknown,submit:(timer:Timer)=>number):Timer{
    const {action,id,realMinutes,rate}=(input??{}) as Partial<Timer>&{action?:string};
    if(typeof id!=='string'||!/^[-\w]{1,100}$/.test(id)||!['start','cancel','finish'].includes(action??''))throw new StudioError(422,'timer_command','无效的计时操作');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const get=()=>this.db.prepare('SELECT * FROM journey_timers WHERE experiment=? AND id=?').get(experiment,id) as unknown as Timer|undefined;
      const timer=get(),now=this.now();
      if(action==='start'){
        if((realMinutes!==25 && realMinutes!==50)||(rate!==6 && rate!==8))throw new StudioError(422,'timer_config','请选择有效时长和倍率');
        if(timer && (timer.realMinutes!==realMinutes || timer.rate!==rate))throw new StudioError(409,'timer_conflict','计时参数与原请求不同');
        if(!timer){
          if(this.latest(experiment)?.status==='running')throw new StudioError(409,'timer_active','这段旅途已有专注正在进行');
          this.db.prepare("INSERT INTO journey_timers VALUES(?,?,?,?,?,'running',NULL)").run(experiment,id,realMinutes,rate,now+realMinutes*60000);
        }
      }else{
        if(!timer)throw new StudioError(404,'timer_missing','找不到这次专注');
        if(action==='cancel' && timer.status!=='cancelled'){
          if(timer.status!=='running' || now>=timer.until)throw new StudioError(409,'timer_elapsed','专注已到时');
          this.db.prepare("UPDATE journey_timers SET status='cancelled' WHERE experiment=? AND id=?").run(experiment,id);
        }
        if(action==='finish' && timer.status!=='completed'){
          if(timer.status!=='running'||now<timer.until)throw new StudioError(409,'timer_pending','专注尚未完成');
          const sequence=submit(timer);
          this.db.prepare("UPDATE journey_timers SET status='completed',sequence=? WHERE experiment=? AND id=?").run(sequence,experiment,id);
        }
      }
      const result=get()!;this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
