import { SharedClient } from './shared-client.mjs';
const $=id=>document.getElementById(id);
const status=message=>{$('status').textContent=message;};
let client,path;
function redirect(value){const url=new URL(value);if(url.protocol!=='https:' || url.username || url.password)throw new Error('Unsafe callback URL.');location.assign(url.href);}
async function details(){
  $('actions').hidden=true;
  const data=await client.request(path);
  if(data.redirect_url){redirect(data.redirect_url);return;}
  $('details').textContent=JSON.stringify({client:data.client,scope:data.scope,redirect_uri:data.redirect_uri},null,2);
  $('actions').hidden=false;status('Review the client and callback before allowing access.');
}
try{
  const config=await fetch('/runtime-config.json',{cache:'no-store'}).then(r=>r.json());
  if(config.environment!=='development')throw new Error('This connector is available only in development.');
  $('environment').textContent='Development storyboard account';
  const id=new URL(location.href).searchParams.get('authorization_id');
  if(!id || !/^[A-Za-z0-9_-]{1,200}$/.test(id))throw new Error('Missing or invalid authorization request. Start the connection from ChatGPT.');
  path='/auth/v1/oauth/authorizations/'+encodeURIComponent(id);
  client=new SharedClient(config);
  if(client.session){await details();}else{$('signin').hidden=false;}
}catch(error){status(error.message);}
$('signin').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;
  try{await client.signIn(form.elements.email.value,form.elements.password.value);form.reset();form.hidden=true;await details();}catch{status('Could not sign in or load consent. Check your account and restart the connection if expired.');}finally{button.disabled=false;}
});
for(const action of ['approve','deny'])$(action).addEventListener('click',async()=>{
  $('actions').hidden=true;
  try{const data=await client.request(path+'/consent',{body:{action}});redirect(data.redirect_url);}catch{status('Authorization failed. Restart the connection from ChatGPT.');}
});
