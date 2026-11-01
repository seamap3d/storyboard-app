export const requirementKey=(kind,name)=>`${kind}:${String(name).trim().replace(/\s+/g,' ').toLowerCase()}`;
export const splitRequirements=text=>String(text||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
export function collectRequirements(document) {
 const items=new Map();
 for(const item of (Array.isArray(document.planning?.requirements)?document.planning.requirements:[])) {
  if(!['prop','equipment'].includes(item.kind)||!item.name?.trim())continue;
  items.set(requirementKey(item.kind,item.name),{...item,shots:[]});
 }
 for(const [index,shot] of (document.shots||[]).entries())for(const [kind,field] of [['prop','props'],['equipment','equipment']]) {
  const seen=new Set();
  for(const name of splitRequirements(shot[field])) {
   const key=requirementKey(kind,name);if(seen.has(key))continue;seen.add(key);
   if(!items.has(key))items.set(key,{kind,name,quantity:'',providedBy:'',readiness:'needed',notes:'',shots:[]});
   items.get(key).shots.push({id:shot.id,number:shot.number||index+1,scene:shot.scene||''});
  }
 }
 return [...items.entries()].map(([key,item])=>({...item,key})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
}
export function filterShots(shots,filters={}) {
 const query=(filters.search||'').toLowerCase();
 const rows=shots.map((shot,index)=>({...shot,displayNumber:index+1})).filter(shot=>
  (!query||['customTitle','scene','desc','location','chars','props','equipment','notes'].some(k=>String(shot[k]||'').toLowerCase().includes(query)))&&
  (!filters.scene||shot.scene===filters.scene)&&(!filters.location||shot.location===filters.location)&&
  (!filters.day||shot.shootDate===filters.day)&&(!filters.status||(shot.status||'planned')===filters.status));
 if(filters.sort==='scene')rows.sort((a,b)=>String(a.scene||'').localeCompare(String(b.scene||''))||a.displayNumber-b.displayNumber);
 if(filters.sort==='day')rows.sort((a,b)=>String(a.shootDate||'9999').localeCompare(String(b.shootDate||'9999'))||a.displayNumber-b.displayNumber);
 return rows;
}
export function csv(rows) {
 const cell=value=>{
  let text=String(value??'');
  if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
 };
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
