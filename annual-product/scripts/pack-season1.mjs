import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {URL} from 'node:url';
import {chapters,opening} from '../studio/south-season.mjs';
import {choiceList,choiceReply,entryText,turn,visibleText,where,windowAt} from '../studio/season1-state.mjs';
import {artwork,read,readerCode,template} from './season1-package.mjs';

const site=new URL('../南下十五日/',import.meta.url),batches=new URL('../南下十五日分批试读/',import.meta.url);
mkdirSync(site,{recursive:true});mkdirSync(batches,{recursive:true});
const art=Object.fromEntries(artwork().map(([key,file])=>[key,'data:image/webp;base64,'+readFileSync(file).toString('base64')]));
const css=read('season1.css').replace("url('/annual-scenes/journey.webp')",'var(--season-cover)');
for(const [release,target] of [[true,new URL('index.html',site)],[false,new URL('../第一季·南下十五日试读.html',import.meta.url)]]){
  const code=await readerCode(release);
  const page=template(release).replace('<link rel="stylesheet" href="./season1.css">',()=>'<style>'+css+'</style>')
    .replace('<script type="module" src="./season1.js"></script>',()=>'<script id="art" type="application/json">'+JSON.stringify(art)+'</script><script type="module">'+code.replaceAll(/<\/script/gi,'<\\/script')+'</script>');
  writeFileSync(target,page);
}

// Export one continuous, reproducible example for a reader reviewing the three batches in order.
const route={5:'job',10:'credit',14:'note',18:'press',22:'reprint',26:'table',32:'meet',34:'workstay',40:'stand',43:'pull',44:'beijing'};
const titles=['北京与武汉','长沙印店','阳朔渡口与归途'];
let s=turn(null,{kind:'create',edition:3,mode:'preview',type:'INFP',nickname:'阿南',id:'batch',preview:true},0);
for(let batch=0;batch<3;batch++){
  const from=batch*15+1,to=from+14;
  const pages=['# 南下十五日 · '+titles[batch]];
  if(!batch)pages.push(visibleText(s,opening));
  for(let n=from;n<=to;n++){
    if(n>1)s=turn(s,{kind:'skip',id:null,unlocked:n-1},1);
    const {start,part}=windowAt(n,s);
    pages.push('## '+chapters[n-1].title,'6月'+start.day+'日 · '+part+' · '+where(s,n),
      visibleText(s,entryText(s,n)).replaceAll('\n','\n\n'));
    if(choiceList(s,n).length){
      s=turn(s,{kind:'choose',key:route[n],unlocked:n},2);
    }
    const reply=choiceReply(s,n);
    if(reply)pages.push(visibleText(s,reply));
  }
  writeFileSync(new URL('0'+(batch+1)+'-'+titles[batch]+'.md',batches),pages.join('\n\n')+'\n');
}
