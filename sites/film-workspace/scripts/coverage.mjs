import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import v8ToIstanbul from 'v8-to-istanbul';
import coverageLib from 'istanbul-lib-coverage';
import reportLib from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const mode = process.argv[2];
if (!['unit', 'browser'].includes(mode)) throw new Error('Choose unit or browser coverage.');
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const directory = mode === 'unit' ? 'unit' : 'browser-server';
const tests = (await readdir('tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => 'tests/' + name);
const command =
  mode === 'unit' ? ['--test', '--test-isolation=none', ...tests] : ['scripts/check-browser.mjs'];
const result = spawnSync(
  process.execPath,
  [
    'node_modules/c8/bin/c8.js',
    '--all',
    '--include=app/**/*.mjs',
    '--include=server/**/*.mjs',
    '--include=worker/**/*.mjs',
    '--exclude=worker/assets.generated.mjs',
    '--reporter=json',
    '--reporter=json-summary',
    '--reports-dir=coverage/' + directory,
    process.execPath,
    ...command,
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, ...(mode === 'browser' ? { COLLECT_BROWSER_COVERAGE: '1' } : {}) },
  },
);
if (result.status !== 0) process.exit(result.status || 1);

const load = async (name) => JSON.parse(await readFile(name, 'utf8'));
const map = coverageLib.createCoverageMap(await load('coverage/unit/coverage-final.json'));
if (mode === 'browser') {
  map.merge(await load('coverage/browser-server/coverage-final.json'));
  const entries = await load('coverage/browser-v8.json');
  if (!entries.length) throw new Error('Browser coverage was not collected.');
  for (const entry of entries) {
    const filename = root + 'app' + entry.url;
    const converter = v8ToIstanbul(filename, 0, { source: entry.source });
    await converter.load();
    converter.applyCoverage(entry.functions);
    map.merge(converter.toIstanbul());
  }
}
const output = 'coverage/' + (mode === 'unit' ? 'unit' : 'combined');
await mkdir(output, { recursive: true });
const context = reportLib.createContext({ dir: output, coverageMap: map });
for (const reporter of ['json-summary', 'html', 'text-summary'])
  reports.create(reporter).execute(context);
const summary = await load(output + '/coverage-summary.json');
const budget = (await load('quality-budget.json'))[mode];
if (summary.total.lines.pct < budget.lines)
  throw new Error(`${mode} line coverage ${summary.total.lines.pct}% is below ${budget.lines}%.`);
for (const [file, minimum] of Object.entries(budget.files || {})) {
  const measured = summary[root + file]?.lines.pct;
  if (measured === undefined || measured < minimum)
    throw new Error(`${file} coverage ${measured}% is below ${minimum}%.`);
}
await writeFile(
  output + '/scope.json',
  JSON.stringify(
    {
      mode,
      source: ['app/**/*.mjs', 'server/**/*.mjs', 'worker/**/*.mjs'],
      excludes: ['worker/assets.generated.mjs'],
      lineCoverage: summary.total.lines.pct,
    },
    null,
    2,
  ),
);
console.log(`${mode} coverage budget passed.`);
