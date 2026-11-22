// The backup import (file or Gist) rebuilds what it reads from an allowlist. Fast half of the planted-backup test:
// planted-backup.py is the browser half, which proves that what is left cannot run.
//
// How to use
//   node .tests/import-allowlist.test.mjs        exit 0 = PASS
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const BASE = 'b326f13';
const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
}

function load(source) {
  const ctx = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console };
  vm.createContext(ctx);
  vm.runInContext(`${source.replace('return{getLocal:gl', 'return{__merge:merge,__def:function(){return cp(DEF)},getLocal:gl')}\n;this.D = D;`, ctx);
  return {
    // what a page does after it was poisoned: the guard must not learn new reserved words from it
    pollute: (key) => vm.runInContext(`Object.prototype[${JSON.stringify(key)}] = NaN`, ctx),
    def: () => JSON.parse(JSON.stringify(ctx.D.__def())),
    // inputs are parsed inside the app's realm, exactly as doImp and getG do
    merge: (a, b) => {
      ctx.input = JSON.stringify([a, b]);
      return JSON.parse(vm.runInContext('var p = JSON.parse(input); JSON.stringify(D.__merge(p[0], p[1]))', ctx));
    },
  };
}
const now = load(read('js/data.js'));
const base = load(git('cat-file', 'blob', `${BASE}:js/data.js`));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (v) => JSON.parse(JSON.stringify(v));

const rich = JSON.parse(read('.tests/backup-fixture.json').replaceAll('@T', '2026-11-22').replaceAll('@Y', '2026-11-21'));
const used = now.def();
used.study = { '2026-11-20': [{ cat: 'General', dur: 60, start: 1, end: 2 }] };

// 1. nothing valid is lost
for (const [label, local] of [['fresh device', () => now.def()], ['device with data', () => copy(used)]]) {
  check(`valid backup into a ${label}: exactly the old merge`, same(now.merge(local(), rich), base.merge(local(), rich)));
}
const awkward = 'Newton\'s "Q&A" <b> \\ back\nline `x` ${y} &#39; 🙂';
const wordy = JSON.parse(JSON.stringify(rich).replace(
  /"(Alpha|Workone|Knowone|Typeone|Examone|Todoone|Planone|Rightone|Wrongone|Journalnote|Factnote|Busy)"/g,
  () => JSON.stringify(awkward),
));
check('free text keeps quotes, ampersands, angle brackets, backslashes and new lines', same(now.merge(now.def(), wordy), base.merge(now.def(), wordy)));
const olderIds = copy(rich);
olderIds.todos.study[1].id = 42;
olderIds.deadlines[0].id = 'exam-old_7';
check('older id shapes are kept', same(now.merge(now.def(), olderIds), base.merge(now.def(), olderIds)));

// 2. every value that is not free text has to have its own shape
const TEXT = new RegExp(`^(${[
  'config\\.(studySubjects|workCategories|knowledgeCategories|recurringTypes)\\.\\*',
  'config\\.exams\\.\\*\\.(name|subjects\\.\\*)',
  'config\\.goalPresets\\.\\*\\.name',
  'deadlines\\.\\*\\.title',
  'revisions\\.\\*\\.(subj|topic|history\\.\\*\\.type)',
  'recurring\\.\\*\\.(title|rcType)',
  'knowledge\\.\\*\\.(category|topic|source|notes)',
  '(study|work)\\.~\\.\\*\\.(cat|note|source)',
  'plans\\.~\\.\\*\\.(subject|topic|source|notes)',
  'todos\\.(study|work)(\\.\\*\\.children)*\\.\\*\\.(title|content)',
  'journal\\.~\\.(dayType|wentRight|wentWrong|notes|tags\\.\\*)',
].join('|')})$`);
const MAPS = /^(config\.(dailyGoals|dailyWake|dailyBed)|syllabus|study|work|plans|journal)$/;
const paths = new Set();
const maps = new Set();
(function walk(value, path) {
  if (path) paths.add(path);
  if (!value || typeof value !== 'object') return;
  if (MAPS.test(path)) maps.add(path);
  for (const key of Object.keys(value)) {
    const part = Array.isArray(value) ? '*' : MAPS.test(path) ? '~' : key;
    walk(value[key], path ? `${path}.${part}` : part);
  }
})(rich, '');

function plant(target, value, rename = null) {
  const out = copy(rich);
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    if (rename && path === target) {
      for (const old of Object.keys(node)) {
        node[rename(old)] = node[old];
        delete node[old];
      }
      return;
    }
    for (const key of Object.keys(node)) {
      const part = Array.isArray(node) ? '*' : MAPS.test(path) ? '~' : key;
      const next = path ? `${path}.${part}` : part;
      if (!rename && next === target) node[key] = value;
      else walk(node[key], next);
    }
  })(out, '');
  return out;
}

const X = 'P7\');__got(localStorage.st3_t);//"><img data-planted src=x: onerror=__got(1)>';
const isText = (path) => TEXT.test(path);
const TEXT_LIST = /(studySubjects|workCategories|knowledgeCategories|recurringTypes|subjects|tags)$/;
check(`control: the walk found typed and text fields (${paths.size} paths, ${maps.size} maps)`,
  paths.size >= 90 && maps.size === 8 && [...paths].filter(isText).length >= 30);

const carried = [];
const broke = [];
let trials = 0;
for (const [label, local] of [['fresh', () => now.def()], ['used', () => copy(used)]]) {
  const attempt = (name, backup) => {
    trials++;
    try {
      if (JSON.stringify(now.merge(local(), backup)).includes('P7')) carried.push(`${label}:${name}`);
    } catch (error) {
      broke.push(`${label}:${name}:${error.message}`);
    }
  };
  for (const path of paths) {
    // a list of text may hold text, so planted text is legal there; a planted object never is
    if (!TEXT_LIST.test(path)) attempt(`${path} (list)`, plant(path, [X]));
    attempt(`${path} (object)`, plant(path, { [X]: X }));
    if (!isText(path)) attempt(`${path} (string)`, plant(path, X));
  }
  for (const path of maps) {
    if (path === 'syllabus') continue; // its keys are subject names, so they are free text
    attempt(`${path} (key)`, plant(path, null, (old) => X + old));
    attempt(`${path} (key with a date in front)`, plant(path, null, (old) => old + X));
  }
}
const fields = new Set(carried.map((c) => c.replace(/^\w+:| \(.*$/g, '')));
check(`no planted value gets past the allowlist (${carried.length} of ${trials})`, !carried.length, [...fields].join(', '));
check(`no planted value breaks the import (${broke.length} of ${trials})`, !broke.length, broke.slice(0, 12).join(' | '));

// 3. shapes an allowlist is easy to get wrong
const unknown = copy(rich);
for (const list of ['deadlines', 'revisions', 'recurring', 'knowledge']) unknown[list][0].extraField = X;
unknown.plans['2026-11-22'][0].extraField = X;
unknown.todos.study[0].children[0].extraField = X;
unknown.journal['2026-11-22'].extraField = X;
check('a record brings no unknown field', !JSON.stringify(now.merge(now.def(), unknown)).includes('P7'));

const linked = JSON.parse(JSON.stringify(rich).replaceAll('pl_1700000000000_ab1', () => JSON.stringify(X).slice(1, -1)));
const out = now.merge(now.def(), linked);
const planId = out.plans['2026-11-22'][0].id;
check('a replaced id keeps its link to the session',
  planId !== X && out.study['2026-11-22'][0].planId === planId && /^[A-Za-z0-9_-]+$/.test(planId));
check('a replaced id is the same on a second import', same(now.merge(out, linked), out));

const reserved = JSON.parse(JSON.stringify(rich)
  .replaceAll('"Alpha"', '"__proto__"').replaceAll('"Knowone"', '"constructor"').replaceAll('"Busy"', '"__proto__"').replaceAll('rc_1700000000000', 'constructor'));
let builtIn;
try {
  builtIn = /"(__proto__|constructor)"/.test(JSON.stringify(now.merge(now.def(), reserved)));
} catch {
  builtIn = true;
}
check('no name, key or id is an object built-in', !builtIn);
check('a file that is not a backup is refused', [null, 'text', 5, [X]].every((v) => {
  try {
    now.merge(copy(used), v);
    return false;
  } catch {
    return true;
  }
}));

// 4. review 1: what an allowlist must not lose, and what the browser turns a name into
const older = copy(rich);
older.study['2026-11-21'][0].topic = 'Optics';
older.deadlines[0].done = true;
older.deadlines[1].done = false;
check('fields of older records that the app still reads are kept', same(now.merge(now.def(), older), base.merge(now.def(), older)));
older.deadlines[0].done = X;
check('a planted done mark is not a done mark', now.merge(now.def(), older).deadlines[0].done === false);

const CHOICES = [
  ['journal.~.mood', ['😤', '😞', '😐', '😊', '🤩', '']],
  ['deadlines.*.type', ['study', 'work', 'personal']],
  ['revisions.*.diff', ['easy', 'medium', 'hard']],
  ['study.~.*.diff', ['easy', 'medium', 'hard', '']],
  ['recurring.*.pattern', ['daily', 'weekly', 'specific', 'fortnightly', 'monthly', 'yearly']],
  ['recurring.*.days.*', [0, 1, 2, 3, 4, 5, 6]],
  ['plans.~.*.planFor', ['study', 'work']],
  ['plans.~.*.type', ['topic', 'lecture', 'revision', 'practice', 'other']],
  ['plans.~.*.priority', ['critical', 'high', 'medium', 'low']],
  ['plans.~.*.status', ['planned', 'in-progress', 'completed', 'skipped', 'carried']],
  ['todos.study.*.type', ['todo', 'note']],
  ['todos.study.*.priority', ['critical', 'high', 'medium', 'low']],
  ['todos.study.*.status', ['pending', 'done']],
  ['todos.study.*.repeat', ['', 'daily', 'weekly', 'monthly']],
];
const lost = [];
for (const [path, values] of CHOICES) {
  for (const value of values) {
    const one = plant(path, value);
    if (!same(now.merge(now.def(), one), base.merge(now.def(), one))) lost.push(`${path}=${value}`);
  }
}
check(`every choice the app offers is kept (${lost.length} lost)`, !lost.length, lost.join(', '));

const longYear = JSON.parse(JSON.stringify(rich).replaceAll('"2026-11-22"', '"20261-11-22"').replaceAll('2026-11-21T06:00', '+020261-02-11T06:00'));
check('a long year from the date box is kept', same(now.merge(now.def(), longYear), base.merge(now.def(), longYear)));
const otherIds = copy(rich);
otherIds.knowledge[0].id = 'kn.1';
otherIds.knowledge[1].id = 1700000000000.25;
check('dotted and fractional ids are kept', same(now.merge(now.def(), otherIds), base.merge(now.def(), otherIds)));
const twins = copy(rich);
for (const [i, twin] of ['Aa!', 'BB!'].entries()) twins.deadlines[i].id = twin;
const twinIds = now.merge(now.def(), twins).deadlines.map((d) => d.id);
check('two different odd ids never become one', twinIds.length === 2 && twinIds[0] !== twinIds[1]);

// an <option> hands a name back without NUL and with its ASCII white space collapsed
const asOption = (s) => s.replace(/\0/g, '').replace(/[\t\n\f\r ]+/g, ' ').trim();
const BUILT_IN = Object.getOwnPropertyNames(Object.prototype);
const slipped = new Set();
for (const word of BUILT_IN) {
  for (const variant of [word, ` ${word}`, `${word} `, `\t${word}\n`, `${word.slice(0, 3)}\0${word.slice(3)}`, `\f${word}\r\n`]) {
    const text = JSON.stringify(rich).replace(/"(Alpha|Workone|Knowone|Typeone|Busy|focused)"/g, () => JSON.stringify(variant));
    const got = now.merge(now.def(), JSON.parse(text));
    (function walk(node) {
      if (typeof node === 'string' && BUILT_IN.includes(asOption(node))) slipped.add(JSON.stringify(variant));
      else if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) {
        if (BUILT_IN.includes(asOption(key))) slipped.add(JSON.stringify(variant));
        walk(value);
      }
    })(got);
  }
}
check(`no name turns into a built-in inside an <option> (${slipped.size})`, !slipped.size, [...slipped].slice(0, 8).join(' '));

const poisoned = load(read('js/data.js'));
const plain = JSON.parse(JSON.stringify(rich).replaceAll('"Workone"', '"work"').replaceAll('"Alpha"', '"total"'));
const expected = base.merge(now.def(), plain);
const fresh = poisoned.def();
for (const key of ['work', 'total']) poisoned.pollute(key);
check('an already poisoned page does not rename honest names', same(poisoned.merge(fresh, plain), expected));

// 5. the release itself
check('sw.js: the cache is newer than v48', Number(read('sw.js').match(/study-timer-v(\d+)/)[1]) >= 49);
check('privacy.html is byte-identical', git('hash-object', 'privacy.html').trim() === git('rev-parse', `${BASE}:privacy.html`).trim());

console.log(`${failed ? 'FAILED' : 'PASS'}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
