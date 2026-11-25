// Runtime methods used by the shared reader that Chrome 61 does not provide.
if(!Array.prototype.flatMap)Object.defineProperty(Array.prototype,'flatMap',{value:function(fn){
  return this.reduce((all,item,index)=>all.concat(fn(item,index,this)),[]);
}});
if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(i){return this[i<0?this.length+i:i];}});
if(!Object.fromEntries)Object.fromEntries=function(entries){
  const result={};for(const [key,value] of entries)Object.defineProperty(result,key,{value,enumerable:true,configurable:true,writable:true});return result;
};
if(!Object.hasOwn)Object.hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(...children){
  this.textContent='';this.append(...children);
};
