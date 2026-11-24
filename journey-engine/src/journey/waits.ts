export class WaitEpisodes {
  private end = -1;
  private current = 0;
  private finished: number[] = [];

  record(kind:string, from:number, until:number):void {
    if (until <= from) return;
    if (kind !== 'waiting' || from !== this.end) {
      if (this.current) this.finished.push(this.current);
      this.current = 0;
    }
    if (kind === 'waiting') this.current += until-from;
    this.end = until;
  }

  summary() {
    const runs = this.current ? [...this.finished, this.current] : [...this.finished];
    runs.sort((a,b)=>a-b);
    const quantile = (p:number) => runs[Math.ceil(runs.length*p)-1] ?? 0;
    const thresholds = [30,60,120,180,240].map(minutes=>{
      const matched = runs.filter(duration=>duration>=minutes);
      return {minutes, count:matched.length, totalMinutes:matched.reduce((a,b)=>a+b,0)};
    });
    const histogram:Record<number,number> = {};
    for (const minutes of runs) histogram[minutes] = (histogram[minutes] ?? 0)+1;
    return {count:runs.length, totalMinutes:runs.reduce((a,b)=>a+b,0), median:quantile(.5),
      p90:quantile(.9),p95:quantile(.95),max:quantile(1),thresholds,histogram};
  }
}
