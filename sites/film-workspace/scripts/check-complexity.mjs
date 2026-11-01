import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'acorn';

const functions = [];
const children = (node) =>
  Object.values(node).flatMap((value) =>
    Array.isArray(value) ? value.filter((item) => item?.type) : value?.type ? [value] : [],
  );
const isFunction = (node) =>
  ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
const decisions = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
  'LogicalExpression',
  'AssignmentPattern',
]);
function complexity(fn) {
  let result = 1;
  function walk(node) {
    if (node !== fn && isFunction(node)) return;
    if (
      decisions.has(node.type) ||
      (node.type === 'SwitchCase' && node.test) ||
      (node.type === 'AssignmentExpression' && ['&&=', '||=', '??='].includes(node.operator))
    )
      result++;
    for (const child of children(node)) walk(child);
  }
  walk(fn);
  return result;
}
for (const directory of ['app', 'server', 'worker']) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.mjs') || file === 'assets.generated.mjs') continue;
    const source = await readFile(directory + '/' + file, 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    const occurrences = new Map();
    function walk(node, parent, owner = '') {
      const className = node.type === 'ClassDeclaration' ? node.id.name : owner;
      if (isFunction(node)) {
        const name =
          node.id?.name ||
          parent?.key?.name ||
          (parent?.type === 'VariableDeclarator' ? parent.id.name : '<callback>');
        const base = `${directory}/${file}::${className ? className + '.' : ''}${name}`;
        const count = (occurrences.get(base) || 0) + 1;
        occurrences.set(base, count);
        functions.push({
          key: base + '#' + count,
          file: directory + '/' + file,
          name,
          line: node.loc.start.line,
          complexity: complexity(node),
        });
      }
      for (const child of children(node)) walk(child, node, className);
    }
    walk(ast, null);
  }
}
const html = await readFile('app/index.html', 'utf8');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (script[1].trim()) throw new Error('Keep application JavaScript in modules, not inline HTML.');
}
const budget = JSON.parse(await readFile('quality-budget.json', 'utf8')).complexity;
const errors = [];
for (const fn of functions) {
  const allowed = budget.exceptions[fn.key]?.maximum || budget.maximum;
  if (fn.complexity > allowed)
    errors.push(`${fn.file}:${fn.line} ${fn.name}: ${fn.complexity} exceeds ${allowed}`);
}
await mkdir('coverage', { recursive: true });
await writeFile(
  'coverage/complexity.json',
  JSON.stringify(
    functions.toSorted((a, b) => b.complexity - a.complexity),
    null,
    2,
  ),
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Complexity passed: ${functions.length} functions; maximum ${Math.max(...functions.map((fn) => fn.complexity))}.`,
  );
