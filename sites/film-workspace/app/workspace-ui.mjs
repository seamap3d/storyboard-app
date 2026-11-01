import {collectRequirements,requirementKey,filterShots,csv} from './workspace-model.mjs';
const $=id=>document.getElementById(id),bridge=window.storyboard;
await bridge.ready;
const filters={search:'',scene:'',location:'',day:'',status:'',sort:''};
let selected='storyboard';
const tabs=[...document.querySelectorAll('#workspaceTabs [role=tab]')];
function selectTab(name,focus=false){
 selected=name;
 for(const tab of tabs){const active=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();}
 for(const panel of document.querySelectorAll('[data-workspace-panel]'))panel.hidden=panel.dataset.workspacePanel!==name;
 render();
}
for(const tab of tabs)tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
$('workspaceTabs').addEventListener('keydown',event=>{
 const enabled=tabs.filter(t=>!t.disabled),index=enabled.indexOf(document.activeElement);if(index<0)return;
 let next;if(event.key==='ArrowRight')next=(index+1)%enabled.length;if(event.key==='ArrowLeft')next=(index+enabled.length-1)%enabled.length;if(event.key==='Home')next=0;if(event.key==='End')next=enabled.length-1;
 if(next!==undefined){event.preventDefault();selectTab(enabled[next].dataset.tab,true);}
});
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function control(value,label,onChange,{type='text',choices,field}={}){
 const input=element(choices?'select':'input');input.setAttribute('aria-label',label);if(field)input.dataset.field=field;
 if(choices){const values=[...choices];if(value&&!values.includes(value))values.push(value);for(const choice of values)input.add(new Option(choice,choice));}
 else input.type=type;
 input.value=value??'';input.disabled=!bridge.canEdit;
 if(type==='number'){input.min='0';input.step='1';}
 input.addEventListener('change',()=>{
  if(!bridge.canEdit)return;
  if(type==='number'&&!input.checkValidity()){input.reportValidity();return;}
  onChange(type==='number'?(input.value===''?'':Number(input.value)):input.value);
 });return input;
}
function options(id,values,empty){const select=$(id),prior=select.value;select.replaceChildren(new Option(empty,''),...Array.from(new Set(values.filter(Boolean))).sort().map(x=>new Option(x,x)));select.value=prior;if(select.value!==prior)filters[select.dataset.filter]='';}
function tableHeader(table,labels){const head=element('thead'),row=element('tr');for(const label of labels)row.append(element('th',label));head.append(row);table.append(head);return element('tbody');}
const shotFields=[['scene','Scene'],['desc','Action / composition'],['type','Type'],['lens','Lens'],['move','Move'],['location','Location'],['chars','Cast'],['shootDate','Shoot date'],['estimatedMinutes','Minutes'],['status','Status'],['props','Props'],['equipment','Equipment'],['notes','Notes']];
function renderShots(document){
 options('shotScene',document.shots.map(s=>s.scene),'All scenes');options('shotLocation',document.shots.map(s=>s.location),'All locations');options('shotDay',document.shots.map(s=>s.shootDate),'All shoot dates');
 const rows=filterShots(document.shots,filters),table=$('shotTable');table.replaceChildren();
 const body=tableHeader(table,['Shot',...shotFields.map(x=>x[1])]);
 for(const shot of rows){const row=element('tr');row.dataset.shotId=shot.id;const title=element('td');const button=element('button',`${shot.displayNumber}. ${shot.customTitle||'Shot'}`);button.type='button';button.onclick=()=>{selectTab('storyboard');const card=[...document.querySelectorAll('#shotList > li')].find(li=>li.dataset.id===shot.id);if(card?.dataset.folded==='true')card.querySelector('.btnToggleFold').click();card?.scrollIntoView({behavior:'smooth',block:'center'});};title.append(button);row.append(title);
  for(const [field,label]of shotFields){const cell=element('td');const config={field};if(field==='status')config.choices=['planned','ready','filmed'];if(field==='shootDate')config.type='date';if(field==='estimatedMinutes')config.type='number';cell.append(control(shot[field]??(field==='status'?'planned':''),`Shot ${shot.displayNumber}: ${label}`,value=>bridge.updateShot(shot.id,{[field]:value}),config));row.append(cell);}body.append(row);
 }
 table.append(body);$('shotSummary').textContent=`${rows.length} of ${document.shots.length} shots · ${rows.reduce((sum,s)=>sum+(Number(s.estimatedMinutes)||0),0)} estimated shooting minutes`;
 $('shotEmpty').hidden=rows.length>0;
}
function saveRequirement(item,patch){
 const document=bridge.collectData(),records=[...(Array.isArray(document.planning?.requirements)?document.planning.requirements:[])];
 const index=records.findIndex(r=>requirementKey(r.kind,r.name)===item.key);
 const record={...(index>=0?records[index]:{id:crypto.randomUUID(),kind:item.kind,name:item.name,quantity:'',providedBy:'',readiness:'needed',notes:''}),...patch};
 if(index>=0)records[index]=record;else records.push(record);
 bridge.updateRequirements(records);
}
function visibleRequirements(document){const query=$('requirementSearch').value.toLowerCase(),kind=$('requirementKind').value;return collectRequirements(document).filter(item=>(!kind||kind===item.kind)&&(!query||[item.name,item.providedBy,item.notes,...item.shots.map(s=>s.scene)].join(' ').toLowerCase().includes(query)));}
function renderRequirements(document){
 const rows=visibleRequirements(document),table=$('requirementsTable');table.replaceChildren();const body=tableHeader(table,['Category','Item','Quantity','Provided by','Readiness','Notes','Used in shots / scenes']);
 for(const item of rows){const row=element('tr');row.dataset.requirementKey=item.key;row.append(element('td',item.kind==='prop'?'Prop':'Equipment'),element('td',item.name));
  for(const [field,label]of [['quantity','Quantity'],['providedBy','Provided by'],['readiness','Readiness'],['notes','Notes']]){const cell=element('td');cell.append(control(item[field],`${item.name}: ${label}`,value=>saveRequirement(item,{[field]:value}),{field,...(field==='quantity'?{type:'number'}:{}),...(field==='readiness'?{choices:['needed','sourcing','ready','on set']}:{})}));row.append(cell);}
  row.append(element('td',item.shots.length?item.shots.map(s=>`#${s.number}${s.scene?' · '+s.scene:''}`).join('\n'):'No current shot references — retained for planning'));body.append(row);
 }
 table.append(body);$('requirementsSummary').textContent=`${rows.length} requirements · ${rows.filter(r=>['ready','on set'].includes(r.readiness)).length} ready/on set`;$('requirementsEmpty').hidden=rows.length>0;
 $('addRequirement').querySelectorAll('input,select,button').forEach(el=>el.disabled=!bridge.canEdit);
}
function render(){const data=bridge.collectData();if(selected==='shot-list')renderShots(data);if(selected==='requirements')renderRequirements(data);}
for(const node of document.querySelectorAll('[data-filter]'))node.addEventListener(node.id==='shotSearch'?'input':'change',()=>{filters[node.dataset.filter]=node.value;render();});
for(const id of ['requirementSearch','requirementKind'])$(id).addEventListener(id==='requirementSearch'?'input':'change',render);
$('addRequirement').onsubmit=event=>{event.preventDefault();if(!bridge.canEdit)return;const name=$('newRequirementName').value.trim();if(!name)return;const kind=$('newRequirementKind').value,item=collectRequirements(bridge.collectData()).find(r=>r.key===requirementKey(kind,name))||{key:requirementKey(kind,name),kind,name};saveRequirement(item,{});$('newRequirementName').value='';};
function downloadCsv(rows,name){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'})),link=element('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportShotCsv').onclick=()=>downloadCsv([['Shot','Title',...shotFields.map(x=>x[1])],...filterShots(bridge.collectData().shots,filters).map(s=>[s.displayNumber,s.customTitle||'',...shotFields.map(([field])=>s[field]??(field==='status'?'planned':''))])],'shot-list.csv');
$('exportRequirementCsv').onclick=()=>downloadCsv([['Category','Item','Quantity','Provided by','Readiness','Notes','Shots','Scenes'],...visibleRequirements(bridge.collectData()).map(r=>[r.kind,r.name,r.quantity,r.providedBy,r.readiness,r.notes,r.shots.map(s=>s.number).join('; '),[...new Set(r.shots.map(s=>s.scene))].join('; ')])],'props-equipment.csv');
document.addEventListener('storyboardchange',render);document.addEventListener('storyboardpermissions',render);
selectTab('storyboard');
