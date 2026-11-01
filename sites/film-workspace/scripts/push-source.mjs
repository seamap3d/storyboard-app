// Credentials stay on stdin/in process memory, never in a file or remote URL.
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
console.log('Ready for source credential JSON on stdin (input is hidden).');
const input=createInterface({input:process.stdin,terminal:false});
const text=await new Promise(resolve=>input.once('line',resolve));input.close();process.stdin.pause();
const credential=JSON.parse(text);
const env={...process.env};
if(credential.auth_mode!=='work_proxy'){
 env.GIT_CONFIG_COUNT='1';env.GIT_CONFIG_KEY_0='http.extraHeader';env.GIT_CONFIG_VALUE_0='Authorization: Bearer '+credential.token;
}
const run=args=>{const p=spawnSync('git',args,{env,encoding:'utf8'});if(p.status!==0){process.stderr.write((p.stderr||'Git failed.').replaceAll(credential.token||'__none__','[redacted]'));process.exit(1);}return p.stdout.trim();};
run(['init','-b',credential.branch]);
run(['config','user.name','Christof Mueller']);run(['config','user.email','12056193+seamap3d@users.noreply.github.com']);
run(['add','.']);
const changes=run(['status','--porcelain']);if(changes)run(['commit','-m','Migrate storyboard app to ChatGPT Sites with linked-account MCP']);
const remote=spawnSync('git',['remote','get-url','origin'],{encoding:'utf8'});
if(remote.status===0)run(['remote','set-url','origin',credential.remote_url]);else run(['remote','add','origin',credential.remote_url]);
run(['push','-u','origin',credential.branch]);
console.log(JSON.stringify({commit_sha:run(['rev-parse','HEAD'])}));
