import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import {rollup} from 'rollup';
import {chapterAt,chapters,sceneValue} from '../studio/south-season.mjs';
import {choiceList,turn} from '../studio/season1-state.mjs';

export const studio=fileURLToPath(new URL('../studio/',import.meta.url));
export const read=name=>readFileSync(join(studio,name),'utf8');
export const python=process.platform==='win32'?'python':'python3';

// Include every reachable scene, including keepsakes and the budget-dependent room.
function storyArtwork(){
  const scenes=new Set(['journey']);
  function visit(state){
    const n=state.unlocked,chapter=chapterAt(n);
    scenes.add(sceneValue(chapter.art,state));
    const item=sceneValue(chapter.item,state);
    if(item)scenes.add(item.scene);
    const options=choiceList(state,n);
    if(options.length && !state.choices[n]){
      for(const [key] of options)visit(turn(state,{kind:'choose',key,unlocked:n},1));
    }else if(n<chapters.length)visit(turn(state,{kind:'skip',id:null,unlocked:n},2));
  }
  visit(turn(null,{kind:'create',edition:3,mode:'preview',preview:true,type:'INFP'},0));
  return [...scenes].sort();
}

export function artwork(scenes=storyArtwork(),archived=false){
  const cache=join(tmpdir(),'south-share-art-v1');
  // Retain the originals for the annual reader. Only the offline distribution uses these.
  const listing=execFileSync(python,['-X','utf8','-c',`
import hashlib,json,sys
from pathlib import Path
from PIL import Image
from io import BytesIO
source,cache=map(Path,sys.argv[1:3])
width,height,quality=map(int,sys.argv[3:6])
cache.mkdir(exist_ok=True)
result={}
for name in sys.argv[6:]:
    data=(source/(name+'.webp')).read_bytes()
    key=hashlib.sha256(data+f'{width}x{height}-q{quality}-6'.encode()).hexdigest()
    dst=cache/(key+'.webp')
    if not dst.is_file():
        with Image.open(BytesIO(data)) as image:
            image.thumbnail((width,height),Image.Resampling.LANCZOS)
            import tempfile,os
            with tempfile.NamedTemporaryFile(dir=cache,delete=False) as tmp:
                image.save(tmp,'WEBP',quality=quality,method=6)
            os.replace(tmp.name,dst)
    result[name]=str(dst)
print(json.dumps(result))
`,join(studio,'annual-scenes'),cache,...(archived?['800','860','55']:['1080','1160','62']),...scenes],{encoding:'utf8'});
  return Object.entries(JSON.parse(listing));
}

export function template(release){
  let page=read('season1.html').replace(/<p\b[^>]*id="classic-link"[^>]*>[\s\S]*?<\/p>/,'');
  if(release)page=page.replace(/<(p|button)\b[^>]*\b(?:id="edition-mark"|name="preview")[^>]*>[\s\S]*?<\/\1>/g,'');
  else page=page.replace('<html lang="zh-CN">','<html lang="zh-CN" data-mode="preview">');
  return page;
}

export async function readerCode(release,mini=false){
  const historical=/[\\/]season1-(edition|story|wuhan|changsha|yangshuo)\.mjs$/;
  const bundle=await rollup({input:join(studio,'season1.js'),treeshake:{tryCatchDeoptimization:false,moduleSideEffects:id=>!historical.test(id)},
    plugins:[{name:'south-reader',transform(source,id){
      if(id.endsWith('season1-build.mjs'))return (mini?"import * as miniPlatform from './season1-minitool.mjs';export {miniPlatform};":"export const miniPlatform=null;")
        +'export const inMiniTool='+mini+';export const currentOnly=true;export const release='+release+';';
      if(id.endsWith('annual-share.mjs')){
        const declaration="export const sceneUrl=scene=>'/annual-scenes/'+scene+'.webp';";
        if(!source.includes(declaration))throw Error('找不到分享图资源入口');
        return source.replace(declaration,mini?"export const sceneUrl=scene=>'./assets/'+scene+'.webp';":
          "const embeddedArt=JSON.parse(document.getElementById('art').textContent);export const sceneUrl=scene=>embeddedArt[scene];document.documentElement.style.setProperty('--season-cover','url('+embeddedArt.journey+')');");
      }
    }}]});
  try{
    const {output:[chunk]}=await bundle.generate({format:mini?'iife':'es'});
    for(const [id,info] of Object.entries(chunk.modules)){
      if(info.renderedLength && historical.test(id))throw Error('新版仍内联旧版正文 '+id+' '+info.renderedExports.join(', '));
    }
    const forbidden=['1752','classicMoney','去车站的路上，旅人买了张动车票','露露刚松开手，桌腿就往回折'];
    if(release)forbidden.push('跳过专注试读','编辑试读','测试试读','south-preview-v','testWindows',' · 试读',"'skip'");
    for(const word of forbidden)if(chunk.code.includes(word))throw Error('分发代码仍含旧内容或测试操作 '+word);
    return chunk.code;
  }finally{await bundle.close();}
}
