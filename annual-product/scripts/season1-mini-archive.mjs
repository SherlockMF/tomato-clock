import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {URL} from 'node:url';
import {artwork,read} from './season1-package.mjs';

// The platform accepts one HTML document. Its saved-edition script supplies
// the frozen reader's markup and story only when that edition is requested.
export function writeArchive(out,shared,adaptPage,compile,adaptStyle){
  const file=new URL('../南下十五日/旧版存档/完成专注.html',import.meta.url),bytes=readFileSync(file);
  if(createHash('sha256').update(bytes).digest('hex')!=='db48bf63832921beac4da051909149177e2b8d74198035c5367393be802ee84a')
    throw Error('历史文件与冻结版本不同');
  const document=bytes.toString('utf8');
  const style=/<style>([\s\S]+?)<\/style>/,module=/<script type="module">([\s\S]+?)<\/script>/;
  const pictures=/<script id="art" type="application\/json">([\s\S]+?)<\/script>/;
  const folder=join(out,'legacy');
  mkdirSync(join(folder,'assets'),{recursive:true});
  const oldOnly=Object.keys(JSON.parse(document.match(pictures)[1])).filter(name=>!shared.has(name));
  for(const [name,path] of artwork(oldOnly,true))copyFileSync(path,join(folder,'assets',name+'.webp'));
  const css=document.match(style)[1].replace(/url\('data:image\/webp;base64,[A-Za-z\d+/=]+'\)/,"url('../assets/journey.webp')");
  writeFileSync(join(folder,'style.css'),adaptStyle(css));
  const layout=adaptPage(document.replace(style,'').replace(pictures,'').replace(module,''));
  const body=layout.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if(!body||/<script\b/i.test(body))throw Error('旧存档阅读页缺少可用的静态正文');
  const platform=read('season1-minitool.mjs').replaceAll(/\bexport /g,'');
  let code=document.match(module)[1];
  function replace(pattern,replacement){
    if(!pattern.test(code))throw Error('未匹配到冻结稿的容器接口 '+pattern);
    code=code.replace(pattern,()=>replacement);
  }
  replace(/const embeddedScenes=[^\n]+;/,"const oldOnly="+JSON.stringify(oldOnly)+";const sceneUrl=name=>(oldOnly.includes(name)?'./legacy/assets/':'./assets/')+name+'.webp';");
  replace(/const channel=[^\n]+/,'');
  replace(/Promise\.resolve\(\);[\s\S]+?(?=function act\()/,`
let pending=Promise.resolve();
function access(action){
  const operation=pending.then(async()=>{
    s=await archiveHost.access(slot,action,turn);
    if(!s && !action){
      const home=new URL(location.href);
      home.searchParams.delete('edition');
      location.replace(home.href);
      return;
    }
    previousLink(archiveHost.hasSave(savePrefix+'2'));
    alive=true;status('');render();
  });
  pending=operation.catch(()=>{});return operation;
}
`);
  replace(/\{\$\('save-share'\)\.href=src;[^\n]+/,'');
  replace(/\$\('copy-share'\)\.onclick=async\(\)=>\{[\s\S]+?\n\};/,'archiveHost.bindShare(document);');
  replace(/function refresh\(\)\{if\(db\|\|inMiniTool\)[\s\S]+?(?=setInterval\(tick)/,`
function refresh(){access().catch(storageError);}
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
`);
  const mount="document.querySelector('link[rel=stylesheet]').href='./legacy/style.css';\n"
    +'document.body.innerHTML='+JSON.stringify(body)+';\n';
  writeFileSync(join(folder,'app.js'),compile(mount+'const archiveHost=(()=>{'+platform+';return {access,hasSave,bindShare};})();\n'+code));
}
