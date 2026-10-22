import {SharedClient} from './shared-client.mjs';
const $ = id => document.getElementById(id);
const bridge = window.storyboard;
await bridge.ready;
let client, user, projects=[], boards=[], project=null, board=null, dirty=false, loading=false, busy=false;
function checkSharedSize(document) {
  if (new Blob([JSON.stringify(document)]).size > 5 * 1024 * 1024) {
    throw new Error('This storyboard exceeds the current 5 MiB shared-save limit, often because of embedded images. Your draft is preserved; keep its JSON export. Dedicated image storage is planned.');
  }
}
const status = message => { $('sharedStatus').textContent=message; };
function editable() { return !project || project.owner_id===user?.id || project.role==='editor'; }
function controls() {
  $('draftStatus').hidden=bridge.mode!=='local';
  bridge.setEditable(!loading && (bridge.mode==='local' || (!!user && !!board && editable())));
  $('cloudSave').disabled=!user || !board || !editable() || busy;
  $('newBoard').disabled=!project || !editable() || busy;
  $('copyLocal').disabled=!project || !editable() || busy;
  $('boardName').disabled=!board || !editable() || busy;
  $('membersPanel').hidden=!project;
  $('inviteForm').hidden=project?.owner_id!==user?.id;
  $('accountLabel').textContent=user ? user.email : 'Browser draft — sign in for shared projects';
  $('authForm').hidden=!!user;
  $('signedIn').hidden=!user;
  $('cloudRole').textContent=project ? `Your role: ${project.owner_id===user?.id?'owner':project.role}. ${editable()?'Save changes to share them.':'Read only; comments are planned separately.'}` : 'This draft is saved only in this browser.';
}
function discard() { return !dirty || confirm('Discard unsaved shared changes? Export JSON first to keep a copy.'); }
function options(select,rows,placeholder,selected) {
  select.replaceChildren(new Option(placeholder,''),...rows.map(row=>new Option(row.name,row.id)));
  select.value=selected||'';
}
function useLocal() {
  project=null; board=null; boards=[]; dirty=false;
  bridge.mode='local'; bridge.hydrate(bridge.localData());
  options($('boardSelect'),[],'Choose a storyboard'); $('boardName').value='';
  controls(); status('Browser draft loaded. Shared projects are saved separately.');
}
function clearShared() {
  bridge.hydrate({meta:{},shots:[]}); board=null; dirty=false; $('boardName').value='';
}
async function loadProjects(selected) {
  projects=await client.list('film_projects','select=*&order=created_at.asc');
  const memberships=await client.list('project_members','select=*&user_id=eq.'+user.id);
  projects.forEach(p=>p.role=memberships.find(m=>m.project_id===p.id)?.role);
  options($('projectSelect'),projects,'Browser draft',selected);
}
async function loadBoard(id) {
  if (!id) { clearShared(); controls(); return; }
  clearShared(); controls();
  const rows=await client.list('storyboards','select=*&id=eq.'+encodeURIComponent(id));
  if (!rows.length) { clearShared(); controls(); throw new Error('Storyboard is unavailable. Your project access may have changed.'); }
  board=rows[0]; bridge.hydrate(board.document); $('boardName').value=board.name; dirty=false;
  controls(); status(`Loaded ${board.name}, version ${board.version}.`);
}
async function selectProject(id) {
  if (!id) { useLocal(); return; }
  bridge.mode='shared'; clearShared(); project=null; loading=true; controls();
  try {
    await loadProjects(id);
    project=projects.find(p=>p.id===id);
    if (!project) throw new Error('Project access is no longer available.');
    boards=await client.list('storyboards','select=id,name&project_id=eq.'+id+'&order=updated_at.desc');
    options($('boardSelect'),boards,'Choose a storyboard');
    await renderMembers();
    if (boards.length) { $('boardSelect').value=boards[0].id; await loadBoard(boards[0].id); }
    else status('No storyboards yet. Create one or copy your browser draft.');
  } finally { loading=false; controls(); }
}
async function renderMembers() {
  $('memberList').replaceChildren(); $('projectInvitations').replaceChildren();
  if (!project) return;
  const owner=project.owner_id===user.id;
  const members=await client.list('project_members','select=*&project_id=eq.'+project.id);
  const ownerLine=document.createElement('p'); ownerLine.textContent=`Owner: ${project.owner_id===user.id?'you':project.owner_id}`; $('memberList').append(ownerLine);
  for (const member of members) {
    const row=document.createElement('div'); row.className='member-row';
    const label=document.createElement('span'); label.textContent=member.user_id===user.id?'You':member.email;
    row.append(label);
    const select=document.createElement('select');
    for (const role of ['editor','commenter','viewer']) select.add(new Option(role,role));
    select.value=member.role; select.disabled=!owner;
    select.addEventListener('change',()=>run(async()=>{ await client.rpc('set_project_member',{p_project:project.id,p_user:member.user_id,p_role:select.value}); await renderMembers(); status('Member role updated.'); })); row.append(select);
    if (owner) {
      for (const [text,action] of [['Remove',async()=>{if(confirm('Remove this member from the project?')) await client.rpc('set_project_member',{p_project:project.id,p_user:member.user_id,p_role:null});}],['Transfer ownership',async()=>{if(confirm('Transfer ownership to this member? You will become an editor.')) await client.rpc('transfer_project_ownership',{p_project:project.id,p_user:member.user_id});}]]) {
        const button=document.createElement('button'); button.textContent=text;
        button.onclick=()=>run(async()=>{await action(); await loadProjects(project.id); project=projects.find(p=>p.id===project.id); await renderMembers(); controls();}); row.append(button);
      }
    }
    $('memberList').append(row);
  }
  if (owner) {
    const invitations=await client.list('project_invitations','select=*&project_id=eq.'+project.id+'&order=created_at.desc');
    for (const invite of invitations) {
      const row=document.createElement('div'); row.className='member-row';
      const label=document.createElement('span'); label.textContent=`${invite.email} · ${invite.role} · ${invite.accepted_at?'accepted':invite.revoked_at?'revoked':Date.parse(invite.expires_at)<Date.now()?'expired':'pending'}`; row.append(label);
      if (!invite.accepted_at && !invite.revoked_at) {
        const button=document.createElement('button'); button.textContent='Revoke'; button.onclick=()=>run(async()=>{await client.rpc('revoke_project_invitation',{p_id:invite.id});await renderMembers();}); row.append(button);
      }
      $('projectInvitations').append(row);
    }
  }
}
async function incoming() {
  $('incoming').replaceChildren();
  const invitations=await client.list('project_invitations','select=*&email=eq.'+encodeURIComponent(user.email.toLowerCase())+'&accepted_at=is.null&revoked_at=is.null&expires_at=gt.'+encodeURIComponent(new Date().toISOString()));
  for (const invitation of invitations) {
    const row=document.createElement('div'); row.className='member-row';
    const label=document.createElement('span'); label.textContent=`Invitation to project ${invitation.project_id} as ${invitation.role}`;
    const accept=document.createElement('button'); accept.textContent='Accept'; accept.onclick=()=>run(async()=>{const id=await client.rpc('accept_project_invitation',{p_id:invitation.id}); await selectProject(id); await incoming();});
    row.append(label,accept); $('incoming').append(row);
  }
}
async function signedIn() { user=await client.user(); controls(); await loadProjects(); await incoming(); status('Signed in. Choose or create a film project.'); }
async function run(action) {
  if (busy) return;
  busy=true; controls();
  document.querySelectorAll('#sharedPanel button, #sharedPanel select').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});
  try { await action(); }
  catch(error) { status(error.message); if (!client?.session) { user=null; $('authForm').hidden=false; $('signedIn').hidden=true; bridge.setEditable(false); } }
  finally {
    busy=false;
    document.querySelectorAll('#sharedPanel button, #sharedPanel select').forEach(el=>{el.disabled=el.dataset.wasDisabled==='true';});
    controls();
  }
}
bridge.onChange=()=>{ if (bridge.mode==='shared' && board && editable()) { dirty=true; status('Unsaved shared changes — click Save storyboard.'); } };
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
$('boardName').oninput=()=>bridge.onChange();
$('authForm').onsubmit=event=>{event.preventDefault();run(async()=>{await client.signIn($('accountEmail').value.trim(),$('accountPassword').value);$('accountPassword').value='';await signedIn();});};
$('signUp').onclick=()=>run(async()=>{if(!$('authForm').reportValidity())return; await client.signUp($('accountEmail').value.trim(),$('accountPassword').value,location.origin+location.pathname);$('accountPassword').value=''; if(client.session)await signedIn();else status('Check your email to confirm your account, then sign in.');});
$('recover').onclick=()=>run(async()=>{const email=$('accountEmail').value.trim();if(!email)throw new Error('Enter your email first.');await client.request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{auth:false,body:{email}});status('If the account exists, a recovery email will arrive. Open its link on this site.');});
$('updatePassword').onclick=()=>run(async()=>{const password=$('recoveryPassword').value;if(password.length<8)throw new Error('Use at least 8 characters.');await client.request('/auth/v1/user',{method:'PUT',body:{password}});$('recoveryPassword').value='';$('recoveryPanel').hidden=true;status('Password updated.');});
$('signOut').onclick=()=>{if(!discard())return;run(async()=>{try{await client.signOut();}finally{user=null;projects=[];$('projectSelect').replaceChildren();$('incoming').replaceChildren();$('memberList').replaceChildren();$('projectInvitations').replaceChildren();useLocal();}});};
$('newProject').onclick=()=>run(async()=>{if(!discard())return;const name=prompt('Film project name');if(!name?.trim())return;const id=await client.rpc('create_film_project',{p_name:name.trim()});await selectProject(id);});
$('projectSelect').onchange=()=>{const id=$('projectSelect').value;if(!discard()){$('projectSelect').value=project?.id||'';return;}run(()=>selectProject(id));};
$('boardSelect').onchange=()=>{const id=$('boardSelect').value;if(!discard()){$('boardSelect').value=board?.id||'';return;}run(()=>loadBoard(id));};
for(const [id,copy] of [['newBoard',false],['copyLocal',true]]) $(id).onclick=()=>run(async()=>{
  if(!discard())return;const name=prompt(copy?'Name for a shared copy of your browser draft':'Storyboard name');if(!name?.trim())return;
  const document=copy?bridge.localData():{meta:{},shots:[]};
  checkSharedSize(document);
  const result=await client.rpc('create_storyboard',{p_project:project.id,p_name:name.trim(),p_document:document});
  const selectedProject=project.id;await selectProject(selectedProject);$('boardSelect').value=result.id;await loadBoard(result.id);
});
$('cloudSave').onclick=()=>run(async()=>{
  const snapshot=JSON.stringify(bridge.collectData()), name=$('boardName').value;
  checkSharedSize(JSON.parse(snapshot));
  const result=await client.rpc('save_storyboard',{p_id:board.id,p_version:board.version,p_name:name,p_document:JSON.parse(snapshot)});
  board=result;
  dirty=JSON.stringify(bridge.collectData())!==snapshot || $('boardName').value!==name;
  const option=[...$('boardSelect').options].find(o=>o.value===board.id);if(option)option.textContent=result.name;
  status(dirty?'Saved earlier changes; newer edits still need saving.':`Saved to shared storage, version ${board.version}.`);
});
$('reloadShared').onclick=()=>run(async()=>{if(!discard())return;if(project){const id=board?.id;await selectProject(project.id);if(id && boards.some(b=>b.id===id)){$('boardSelect').value=id;await loadBoard(id);}}else{await loadProjects();await incoming();} });
$('inviteForm').onsubmit=event=>{event.preventDefault();run(async()=>{await client.rpc('invite_project_member',{p_project:project.id,p_email:$('inviteEmail').value.trim(),p_role:$('inviteRole').value});$('inviteEmail').value='';await renderMembers();status('Invitation created. Share this app’s link with the recipient; they must sign in with that verified email and accept. No invitation email is sent.');});};
try {
  const response=await fetch('./runtime-config.json',{cache:'no-store'});if(!response.ok)throw new Error('Public configuration is unavailable.');
  client=new SharedClient(await response.json());
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('access_token')) {
    const type=hash.get('type'); client.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600)});
    history.replaceState(null,'',location.pathname+location.search);if(type==='recovery')$('recoveryPanel').hidden=false;
  }
  if(client.session)await signedIn();else controls();
} catch(error) {status('Shared projects unavailable: '+error.message);if(!client) $('authForm').querySelectorAll('button').forEach(b=>b.disabled=true);}
