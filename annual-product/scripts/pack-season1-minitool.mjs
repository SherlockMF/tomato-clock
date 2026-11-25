import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {copyFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {artwork,python,read,readerCode,template} from './season1-package.mjs';
import {writeArchive} from './season1-mini-archive.mjs';

const out=mkdtempSync(join(tmpdir(),'south-minitool-'));
mkdirSync(join(out,'assets'));
const shared=artwork();
for(const [scene,path] of shared)copyFileSync(path,join(out,'assets',scene+'.webp'));
function compile(source){
  const js=ts.transpileModule(read('season1-minitool-compat.js')+'\n'+source,{compilerOptions:{
    target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.None
  }}).outputText;
  for(const marker of ['indexedDB','navigator.clipboard','south-preview-v','跳过专注试读','BroadcastChannel','/annual-scenes/','.download =']){
    if(js.includes(marker))throw new Error('小工具包含网页专用代码 '+marker);
  }
  return js;
}
function adaptPage(html){
  return html.replace('<body>','<body class="minitool">')
    .replace('id="message"></p>','id="message">正在读取旅途手记…</p>')
    .replace('手机可长按图片保存，再到小红书选图发笔记。','把这段旅途留在相册里，或带到笔记里和朋友分享。')
    .replace('<a id="save-share" class="download">保存图片</a>','<button type="button" id="save-share">保存到相册</button>')
    .replace('复制手记正文','写小红书笔记');
}
const currentReader=await readerCode(true,true);
writeFileSync(join(out,'app.js'),compile(`
(() => {
  const edition = new URLSearchParams(location.search).get('edition');
  if (edition === '2' || edition === '3') {
    const archive = document.createElement('script');
    archive.src = './legacy/app.js';
    archive.onerror = () => { document.getElementById('message').textContent = '旧存档未能打开，请重新进入小工具。'; };
    document.head.appendChild(archive);
  } else {
    ${currentReader}
  }
})();
`));
writeFileSync(join(out,'index.html'),adaptPage(template(true).replace('./season1.css','./style.css')
  .replace('type="module" src="./season1.js"','defer src="./app.js"')));
const baseline='header,main{width:94%;max-width:880px}.cover{padding:32px}.cover h1{font-size:36px}article{padding:24px}.prose{font-size:19px;word-wrap:break-word}.timer{font:3rem/1.3 Georgia,serif}.bars progress{width:42%;max-width:14rem}#share-sheet{width:94%;max-width:29rem;max-height:92vh}form{align-items:flex-end}details{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}nav a,.actions>*{margin-right:.45rem}form label{margin:0 .4em .4em 0}input,select{min-width:0;width:100%}.souvenir img{margin-right:1em}';
function adaptStyle(css){
  const releaseCss=css.replace(/,#focus\.timing #edition-mark(?=\{)/g,'')
    .replace(/,\.reading-skip(?::hover)?(?=\{)/g,'')
    .replace(/^\.reading-skip\{[^{}]*\}\r?$/gm,'');
  return baseline+'\n'+releaseCss;
}
writeFileSync(join(out,'style.css'),adaptStyle(read('season1.css').replace('/annual-scenes/journey.webp','./assets/journey.webp')));
writeArchive(out,new Set(shared.map(([key])=>key)),adaptPage,compile,adaptStyle);
const zip=fileURLToPath(new URL('../南下十五日-小红书小工具-新版.zip',import.meta.url));
const auditOnly=process.argv.includes('--audit-only');
const spec=fileURLToPath(new URL('../../.codex/skills/minitool-zip-builder/scripts/audit_artifact.py',import.meta.url));
execFileSync(python,['-X','utf8','-c',`
import sys,zipfile,subprocess
from pathlib import Path
out,auditor=map(Path,sys.argv[1:3])
target=sys.argv[3]
if [p.relative_to(out).as_posix() for p in out.rglob('*') if p.suffix.lower()=='.html']!=['index.html']:
    raise SystemExit('小红书仅接受一个 HTML 文件，且必须是根目录的 index.html')
trial_markers=('跳过专注','跳过本次专注','编辑试读','测试试读','south-preview-v','testWindows','trialFrom','edition-mark','reading-skip','name="preview"','data-mode="preview"')
for file in out.rglob('*'):
    if file.suffix in ('.html','.css','.js'):
        content=file.read_text(encoding='utf-8')
        for marker in trial_markers:
            if marker in content:
                raise SystemExit(f'{file.relative_to(out)} 仍含试读入口或测试标记 {marker}')
subprocess.run([sys.executable,'-X','utf8',auditor,out],check=True)
if not target: sys.exit(0)
candidate=out.with_suffix('.zip')
with zipfile.ZipFile(candidate,'w',zipfile.ZIP_DEFLATED) as archive:
    for f in sorted(out.rglob('*')):
        if f.is_file(): archive.write(f,f.relative_to(out).as_posix())
subprocess.run([sys.executable,'-X','utf8',auditor,candidate],check=True)
import shutil
shutil.copyfile(candidate,target)
`,out,spec,auditOnly?'':zip],{stdio:'inherit'});
console.log(auditOnly?out:zip);
