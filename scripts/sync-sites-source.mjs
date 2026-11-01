import { readFile, writeFile, mkdir, rm, realpath, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(repository, 'sites/film-workspace');
const index = process.argv.indexOf('--target');
if (index < 0 || !process.argv[index + 1])
  throw new Error('Use --target /absolute/dedicated/site-checkout.');
const target = await realpath(resolve(process.argv[index + 1]));
if (target.startsWith(repository) || target === source)
  throw new Error('Use a separate Site-managed checkout, outside this repository.');
function git(directory, args) {
  const command = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (command.status !== 0) throw new Error('Could not verify the source checkout.');
  return command.stdout.trim();
}
if (git(repository, ['status', '--porcelain']) || git(target, ['status', '--porcelain']))
  throw new Error('Both source and target must be clean before synchronization.');
if ((await realpath(git(target, ['rev-parse', '--show-toplevel']))) !== target)
  throw new Error('Target must be its own Git checkout root.');
const manifest = JSON.parse(await readFile(resolve(source, '.openai/hosting.json'), 'utf8'));
const remote = git(target, ['remote', 'get-url', 'origin']);
const deployed = JSON.parse(await readFile(resolve(target, '.openai/hosting.json'), 'utf8'));
if (
  manifest.project_id !== deployed.project_id ||
  !remote.startsWith('https://git.chatgpt-team.site/') ||
  !remote.endsWith('/' + manifest.project_id + '.git')
)
  throw new Error('Target identity/remote does not match this Site.');
const prefix = 'sites/film-workspace/';
const files = git(repository, ['ls-files', '-z', prefix])
  .split('\0')
  .filter(Boolean)
  .map((file) => file.slice(prefix.length));
const oldFiles = git(target, ['ls-files', '-z']).split('\0').filter(Boolean);
for (const file of files) {
  if (
    file.includes('..') ||
    file.startsWith('/') ||
    /(^|\/)(node_modules|dist|coverage|work|\.git)(\/|$)/.test(file)
  )
    throw new Error('Unexpected source path.');
  const from = resolve(source, file),
    to = resolve(target, file);
  if (!(await lstat(from)).isFile())
    throw new Error('Only regular tracked source files may be synchronized.');
  await mkdir(dirname(to), { recursive: true });
  const parent = await realpath(dirname(to));
  if (relative(target, parent).startsWith('..'))
    throw new Error('Target directory escapes the checkout.');
  const existing = await lstat(to).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing?.isSymbolicLink()) throw new Error('Refusing a target file symlink.');
  await writeFile(to, await readFile(from));
}
for (const file of oldFiles) if (!files.includes(file)) await rm(resolve(target, file));
console.log(
  `Synchronized ${files.length} tracked files to ${target}. Run quality checks there, inspect the diff, then commit/push and publish through Sites.`,
);
