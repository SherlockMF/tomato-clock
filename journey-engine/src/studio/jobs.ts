import{Worker}from'node:worker_threads';import{randomUUID}from'node:crypto';import{validateFocus}from'../engine/focus-session.ts';import{StudioError}from'./catalog.ts';import type{Job,RunRequest,RunMode}from'./catalog.ts';
interface JobCatalog {
  previous(key:string,value:unknown):string|null;
  job(id:string):Job;
  jobs():Job[];
  updateJob(job:Job):void;
  remember(key:string,value:unknown,id:string):void;
  file(id:string):string;
  get(id:string):{readOnly:boolean;engine:string};
}
interface JobOptions {
  worker:URL;
  version:()=>string;
  modes:RunMode[];
  compatibleVersion?:(id:string,stored:string,current:string)=>boolean;
}
export class JobManager{
  readonly catalog:JobCatalog;readonly workers=new Map<string,Worker>();readonly options:JobOptions;
  constructor(catalog:JobCatalog,options:JobOptions){this.catalog=catalog;this.options=options;}
  start(id:string,request:RunRequest,key:string):Job{const value={id,request},previous=this.catalog.previous('job:'+key,value);if(previous)return this.catalog.job(previous);const experiment=this.catalog.get(id);
    if(experiment.readOnly)throw new StudioError(409,'read_only_history','历史证据只读；请复制配置创建新实验');
    const current=this.options.version();
    if(experiment.engine!==current&&!this.options.compatibleVersion?.(id,experiment.engine,current))throw new StudioError(409,'engine_changed','引擎源码版本变化；请创建新实验');
    if(this.catalog.jobs().some(j=>j.experiment===id&&['queued','running'].includes(j.status)))throw new StudioError(409,'experiment_busy','实验正在运行');
    if(!request||!this.options.modes.includes(request.mode))throw new StudioError(422,'invalid_mode','未知运行模式');
    try{validateFocus({id:'validation',sequence:1,realMinutes:request.realMinutes,rate:request.rate});if(request.realMinutes>120)throw new Error('单窗最多120真实分钟');}catch(e){throw new StudioError(422,'invalid_focus',String(e));}
    const job:Job={id:randomUUID(),experiment:id,request,status:'queued',progress:0,commits:0,from:0,until:0,message:'',createdAt:new Date().toISOString()};this.catalog.updateJob(job);this.catalog.remember('job:'+key,value,job.id);
    const worker=new Worker(this.options.worker,{workerData:{file:this.catalog.file(id),job}});this.workers.set(job.id,worker);
    worker.on('message',(update:Job)=>this.catalog.updateJob(update));worker.on('error',e=>this.catalog.updateJob({...this.catalog.job(job.id),status:'failed',message:e.message}));worker.on('exit',()=>{this.workers.delete(job.id);const latest=this.catalog.job(job.id);if(['running','queued'].includes(latest.status))this.catalog.updateJob({...latest,status:'interrupted',message:'Worker退出，已提交事实保留'});});return job;
  }
  cancel(id:string):Job{const job=this.catalog.job(id);this.workers.get(id)?.postMessage('cancel');return job;}
  async close():Promise<void>{for(const worker of this.workers.values())worker.postMessage('cancel');await Promise.all([...this.workers.values()].map(w=>new Promise<void>(r=>w.once('exit',()=>r()))));}
}
