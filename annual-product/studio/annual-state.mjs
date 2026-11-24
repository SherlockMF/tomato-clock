export const duration = 25 * 60 * 1000;
export const totalWindows = 1752;
export const types = [...'IE'].flatMap(a => [...'SN'].flatMap(b =>
  [...'TF'].flatMap(c => [...'JP'].map(d => a+b+c+d))));

export const directions = {
  I:'给自己留独处的时间', E:'主动认识人、找人聊聊',
  S:'先从眼前的细节入手', N:'试试还没探过的可能',
  T:'先理清事情的利弊', F:'先听当事人的感受',
  J:'提前约好、按计划做', P:'给临时的机会留空'
};
export const axes = ['IE','SN','TF','JP'];

export function displayName({nickname, gender}) {
  return nickname?.trim() || (gender === '男' ? '小川' : '小禾');
}

export function storyText(text, profile) {
  return text.replace(/小禾|\{称呼\}/gu, token =>
    token === '小禾' ? displayName(profile) : (profile.gender === '男' ? '小伙子' : '姑娘'));
}

function unlock(current, test) {
  const unlocked = current.unlocked + 1;
  const next = {...current, unlocked, id:null, deadline:null, remaining:duration};
  if (test) next.testWindows = [...(current.testWindows ?? []), unlocked];
  return next;
}

export function nextFocus(current, action, now) {
  if (!current) {
    if (action.kind !== 'create' || !types.includes(action.type) || !['女','男'].includes(action.gender)) return null;
    const profile = {type:action.type, gender:action.gender, nickname:displayName(action), unlocked:0,
      testWindows:[], id:action.id, remaining:duration, deadline:now+duration};
    return action.preview ? unlock(profile, true) : profile;
  }
  if (action.kind === 'preference') {
    // Settle an expired timer before dating a preference, in the same transaction.
    if (current.deadline !== null && current.deadline <= now && current.unlocked < totalWindows)
      current = unlock(current, false);
    const axis=axes.find(pair=>pair.includes(action.letter));
    if (!Object.hasOwn(directions,action.letter) || !axis || current.unlocked>=totalWindows) return current;
    const note=typeof action.note==='string'?action.note.trim().slice(0,80):'';
    const from=current.unlocked+1, history=current.preferences??[];
    const last=history.findLast(p=>axis.includes(p.letter));
    if(last?.letter===action.letter && last.note===note)return current;
    const preferences=history.filter(p=>p.from!==from || !axis.includes(p.letter));
    preferences.push({from,letter:action.letter,note});
    return {...current,preferences};
  }
  if (action.kind === 'rename') {
    const nickname = displayName({gender:current.gender, nickname:action.nickname});
    if (nickname !== displayName(current)) current = {...current, nickname};
  }
  if (current.deadline !== null && current.deadline <= now && current.unlocked < totalWindows)
    return unlock(current, false);
  if (action.kind === 'skip' && current.id === action.id && current.unlocked === action.unlocked && current.unlocked < totalWindows)
    return unlock(current, true);
  if (action.kind === 'start' && !current.id && current.unlocked === action.unlocked && current.unlocked < totalWindows)
    return {...current, id:action.id, remaining:duration, deadline:now+duration};
  if (!current.id || current.id !== action.id) return current;
  if (action.kind === 'pause' && current.deadline !== null)
    return {...current, remaining:current.deadline-now, deadline:null};
  if (action.kind === 'resume' && current.deadline === null)
    return {...current, deadline:now+current.remaining};
  if (action.kind === 'cancel')
    return {...current, id:null, remaining:duration, deadline:null};
  return current;
}
