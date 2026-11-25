async function platform(minimum, methods){
  const host=window.xhs;
  const sdk=host && host.miniTool;
  function version(options){
    const raw=options && options.miniToolEnv && options.miniToolEnv.buildVersion;
    if(!/^[1-9]\d{6,}$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))return null;
    return Math.floor(Number(raw)/1000);
  }
  let client=version(host && host.launchOptions);
  if(client===null && sdk && typeof sdk.getLaunchOptions==='function')client=version(await sdk.getLaunchOptions());
  if(client===null)throw Error('无法识别小红书客户端版本，请在小红书内重新打开。');
  if(client<minimum)throw Error('当前小红书版本过低，请更新客户端。');
  if(!sdk || methods.some(name=>typeof sdk[name]!=='function'))throw Error('当前容器未提供所需能力，请更新客户端或重新打开。');
  return sdk;
}

async function call(sdk,name,options){
  const result=await sdk[name](options);
  if(!result || result.errMsg!==name+':ok')throw Error((result && result.errMsg)||'客户端未确认操作');
  return result;
}

let storedKeys=[];
export const hasSave=key=>storedKeys.includes(key);

export async function access(key,action,turn){
  const sdk=await platform(9460,['getStorageInfo','getStorage','setStorage']);
  const {keys}=await call(sdk,'getStorageInfo',{});
  if(!Array.isArray(keys))throw Error('无法读取存档目录。');
  storedKeys=keys;
  let old=null;
  if(keys.includes(key)){
    const {data}=await call(sdk,'getStorage',{key});
    old=JSON.parse(data);
    const editions={'south-focus-v2':2,'south-focus-v3':3,'south-focus-v4':3};
    if(!old || !Object.hasOwn(editions,key) || old.edition!==editions[key] || old.mode!=='focus' || !Array.isArray(old.sessions))throw Error('存档格式无法识别。');
  }
  const next=action?turn(old,action,Date.now()):old;
  if(next!==old)await call(sdk,'setStorage',{key,data:JSON.stringify(next)});
  return next;
}

export function bindShare(doc){
  const img=doc.getElementById('share-img'),note=doc.getElementById('share-text');
  const message=doc.getElementById('share-status');
  function bind(id,method){
    const button=doc.getElementById(id);
    button.onclick=async()=>{
      button.disabled=true;
      try{
        const sdk=await platform(method==='saveImageToPhotosAlbum'?9420:0,['writeTempFile',method]);
        const {filePath}=await call(sdk,'writeTempFile',{data:img.src});
        if(!filePath)throw Error('未能生成临时图片。');
        if(method==='saveImageToPhotosAlbum'){
          await call(sdk,method,{filePath});
          message.textContent='分享图已保存到相册。';
        }else{
          await call(sdk,method,{title:'南下十五日 · 旅途手记',content:note.value.slice(0,1000),mediaInfo:{image_resources:[{url:filePath}]}});
          message.textContent='已从笔记编辑页返回。';
        }
      }catch(e){message.textContent='操作未完成。'+(e.errMsg || e.message || '请稍后再试。');}
      finally{button.disabled=false;}
    };
  }
  bind('save-share','saveImageToPhotosAlbum');
  bind('copy-share','postNote');
}
