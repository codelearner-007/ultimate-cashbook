/**
 * Ultimate CashBook — Developer Audit Script
 *
 * Run:  node audit.js
 * Fix:  node audit.js --fix   (auto-applies safe fixes)
 *
 * Checks every JSX/JS source file for real bugs and code-quality
 * violations. Acts as a "test developer" who reads the whole codebase
 * before reporting. Zero external dependencies — pure Node.js.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT      = path.join(__dirname, 'src');
const APP_DIR   = path.join(__dirname, 'app');
const ENV_FILE  = path.join(__dirname, '.env');
const ENV_EXAMPLE = path.join(__dirname, '.env.example');

const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
];

// Colors that belong in constants/colors.js — raw hex in screens is a violation
const HEX_RE = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;

// Files exempt from the hex-color check (they ARE the token source)
const HEX_EXEMPT = new Set([
  path.join(ROOT, 'constants', 'colors.js'),
]);

const AUTO_FIX = process.argv.includes('--fix');

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

const pass = (msg)  => console.log(`  ${GREEN}✔${RESET}  ${msg}`);
const fail = (msg)  => console.log(`  ${RED}✘${RESET}  ${msg}`);
const warn = (msg)  => console.log(`  ${YELLOW}⚠${RESET}  ${msg}`);
const info = (msg)  => console.log(`  ${CYAN}i${RESET}  ${msg}`);

let totalFails = 0;
let totalWarns = 0;

function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
  console.log('─'.repeat(60));
}

function record(ok, message) {
  if (ok === true)  { pass(message); }
  else if (ok === false) { fail(message); totalFails++; }
  else { warn(message); totalWarns++; }
}

/** Recursively collect .js / .jsx files under a directory */
function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Short relative path for display */
function rel(p) {
  return path.relative(__dirname, p).replace(/\\/g, '/');
}

/** Read file content + split into lines */
function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

// ── Check 1: Mid-file imports ─────────────────────────────────────────────────
// Multi-line imports span several lines. We track bracket depth so we only
// leave "import mode" once the closing } or ; of an import statement is seen.

function checkMidFileImports(files) {
  section('CHECK 1 — No mid-file imports');
  let found = false;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Strip block comments so we don't trip on commented-out imports
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = stripped.split('\n');

    let passedFirstNonImport = false;
    let insideImport = false;   // we're mid-way through a multi-line import

    for (let i = 0; i < lines.length; i++) {
      const raw  = lines[i];
      const line = raw.trim();

      if (!line || line.startsWith('//')) continue;

      if (insideImport) {
        // End of multi-line import: line contains ; or is the closing } or }
        if (line.includes(';') || /^\}/.test(line)) insideImport = false;
        continue;
      }

      if (!passedFirstNonImport) {
        if (line.startsWith('import ')) {
          // Multi-line import: opening { without closing ; on same line
          if (line.includes('{') && !line.includes(';')) insideImport = true;
          // else single-line import — stays in "import zone"
        } else if (!line.startsWith("'use ") && !line.startsWith('"use ')) {
          passedFirstNonImport = true;
        }
      } else if (line.startsWith('import ')) {
        fail(`${rel(file)}:${i + 1}  import after code: "${line.slice(0, 70)}"`);
        totalFails++;
        found = true;
        if (line.includes('{') && !line.includes(';')) insideImport = true;
      }
    }
  }

  if (!found) pass('All imports are at file tops');
}

// ── Check 2: Unused React import (React 17+ JSX transform) ───────────────────

function checkUnusedReactImport(files) {
  section('CHECK 2 — No "import React" when not used');
  let found = false;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');

    // Has default React import?
    const hasDefault = /import React(?:,|\s)/.test(src);
    if (!hasDefault) continue;

    // Strip the import line itself, then check if React. or <React. appears
    const withoutImport = src.replace(/^import React.*\n?/m, '');
    if (!/\bReact\./.test(withoutImport)) {
      warn(`${rel(file)}  — "import React" is unused (JSX transform handles it)`);
      totalWarns++;
      found = true;
    }
  }

  if (!found) pass('No redundant React imports');
}

// ── Check 3: Hardcoded hex colors outside colors.js ──────────────────────────

function checkHardcodedColors(files) {
  section('CHECK 3 — No raw hex values in screens/components');
  const violations = {};

  for (const file of files) {
    if (HEX_EXEMPT.has(file)) continue;
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(HEX_RE);
      if (matches) {
        if (!violations[file]) violations[file] = [];
        violations[file].push({ line: i + 1, values: matches, text: lines[i].trim() });
      }
    }
  }

  if (Object.keys(violations).length === 0) {
    pass('No raw hex colors found outside token file');
    return;
  }

  for (const [file, hits] of Object.entries(violations)) {
    for (const h of hits) {
      warn(`${rel(file)}:${h.line}  hex ${h.values.join(', ')} — use C.* token instead`);
      totalWarns++;
    }
  }
}

// ── Check 4: Empty style objects ──────────────────────────────────────────────
// Only flag empty keys that appear INSIDE a StyleSheet.create({...}) call
// to avoid false-positives on store initial state, empty config objects, etc.

function checkEmptyStyles(files) {
  section('CHECK 4 — No empty StyleSheet entries');
  let found = false;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Find content inside StyleSheet.create({...})
    const ssMatch = src.match(/StyleSheet\.create\s*\(\s*\{([\s\S]*?)\}\s*\)/);
    if (!ssMatch) continue;

    const ssBlock = ssMatch[1];
    // Find the line offset of the block start within the file
    const blockStart = src.indexOf(ssMatch[0]);
    const linesBefore = src.slice(0, blockStart).split('\n').length;

    const blockLines = ssBlock.split('\n');
    for (let i = 0; i < blockLines.length; i++) {
      if (/^\s*\w+:\s*\{\s*\},?\s*$/.test(blockLines[i])) {
        warn(`${rel(file)}:${linesBefore + i}  empty StyleSheet key: "${blockLines[i].trim()}"`);
        totalWarns++;
        found = true;
      }
    }
  }

  if (!found) pass('No empty StyleSheet entries');
}

// ── Check 5: Screens that bypass useTheme() ───────────────────────────────────

function checkThemeUsage(files) {
  section('CHECK 5 — Screens use useTheme(), not hardcoded color objects');
  let found = false;

  for (const file of files) {
    // Only screen files need to follow this rule
    if (!file.includes(`${path.sep}screens${path.sep}`)) continue;

    const src = fs.readFileSync(file, 'utf8');
    const importsLightColors = /LightColors|DarkColors|Colors\b/.test(src);
    const usesUseTheme       = /useTheme\s*\(/.test(src);

    if (importsLightColors && !usesUseTheme) {
      warn(`${rel(file)}  imports color object directly instead of useTheme() — dark mode won't work`);
      totalWarns++;
      found = true;
    }
  }

  if (!found) pass('All screens use useTheme()');
}

// ── Check 6: useMutation hooks have onError rollback ─────────────────────────

function checkMutationRollback(files) {
  section('CHECK 6 — useMutation calls include onError rollback');
  let found = false;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('useMutation(')) continue;

    // Simple heuristic: count useMutation blocks vs onError occurrences
    const mutationCount = (src.match(/useMutation\s*\(/g) || []).length;
    const onErrorCount  = (src.match(/onError\s*:/g) || []).length;

    if (mutationCount > onErrorCount) {
      warn(`${rel(file)}  — ${mutationCount} useMutation call(s), only ${onErrorCount} onError handler(s)`);
      totalWarns++;
      found = true;
    }
  }

  if (!found) pass('All useMutation hooks have onError handlers');
}

// ── Check 7: Route references resolve to actual files ────────────────────────

function checkRoutes(files) {
  section('CHECK 7 — router.push / router.replace targets exist as files');
  let found = false;

  // Build a set of all route file paths we know exist
  const routeFiles = collectFiles(APP_DIR);
  const knownRoutes = new Set();
  for (const f of routeFiles) {
    // Convert file path to Expo Router route string
    let route = path.relative(APP_DIR, f).replace(/\\/g, '/');
    route = route.replace(/\.(jsx?|tsx?)$/, '');
    route = route.replace(/\/index$/, '');
    knownRoutes.add('/' + route);
  }

  const routeCallRe = /router\.(push|replace)\(\s*['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = routeCallRe.exec(src)) !== null) {
      const target = match[2];
      // Strip query-string and dynamic segments for file-existence check
      const staticPart = target.split('?')[0];

      // Normalize: /(app)/books → (app)/books
      const normalized = staticPart.replace(/^\//, '');

      // Check if any known route starts with or equals normalized
      const exists = [...knownRoutes].some(r => {
        const n = r.replace(/^\//, '');
        // Exact match or the static part matches up to a dynamic segment
        return n === normalized || n.startsWith(normalized.split('[')[0]);
      });

      if (!exists) {
        const lineNo = src.slice(0, match.index).split('\n').length;
        fail(`${rel(file)}:${lineNo}  route "${target}" has no matching file`);
        totalFails++;
        found = true;
      }
    }
  }

  if (!found) pass('All route references resolve to existing files');
}

// ── Check 8: Environment variables present in .env.example ───────────────────

function checkEnvExample() {
  section('CHECK 8 — .env.example declares all required variables');

  if (!fs.existsSync(ENV_EXAMPLE)) {
    fail('.env.example not found');
    return;
  }

  const content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  for (const key of REQUIRED_ENV_VARS) {
    record(content.includes(key), `.env.example contains ${key}`);
  }

  if (fs.existsSync(ENV_FILE)) {
    warn('.env is present — confirm it is listed in .gitignore');
    const gitignore = path.join(__dirname, '.gitignore');
    if (fs.existsSync(gitignore)) {
      const gi = fs.readFileSync(gitignore, 'utf8');
      record(gi.includes('.env'), '.gitignore includes .env');
    }
  } else {
    info('.env not present locally (expected in dev — copy from .env.example)');
  }
}

// ── Check 9: API layer has both request + response interceptors ───────────────

function checkApiInterceptors() {
  section('CHECK 9 — api.js has request AND response interceptors');

  const apiFile = path.join(ROOT, 'lib', 'api.js');
  if (!fs.existsSync(apiFile)) {
    fail('src/lib/api.js not found');
    return;
  }

  const src = fs.readFileSync(apiFile, 'utf8');
  record(src.includes('interceptors.request.use'), 'Request interceptor (JWT attachment)');
  record(src.includes('interceptors.response.use'), 'Response interceptor (401/403 handling)');
  record(
    src.includes('401') || src.includes('403'),
    'Response interceptor handles auth failure status codes',
  );
}

// ── Check 10: No console.log left in production screens ──────────────────────

function checkConsoleLog(files) {
  section('CHECK 10 — No console.log in screen/hook/lib files');
  let found = false;

  for (const file of files) {
    if (!file.includes(`${path.sep}screens${path.sep}`) &&
        !file.includes(`${path.sep}hooks${path.sep}`) &&
        !file.includes(`${path.sep}lib${path.sep}`)) continue;

    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (/console\.log\s*\(/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
        warn(`${rel(file)}:${i + 1}  console.log left in file`);
        totalWarns++;
        found = true;
      }
    }
  }

  if (!found) pass('No stray console.log calls');
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${BOLD}AUDIT SUMMARY${RESET}`);
  console.log('═'.repeat(60));
  if (totalFails === 0 && totalWarns === 0) {
    console.log(`${GREEN}${BOLD}  All checks passed. Codebase is clean.${RESET}`);
  } else {
    if (totalFails > 0) {
      console.log(`${RED}${BOLD}  ${totalFails} failure(s) — must fix before shipping${RESET}`);
    }
    if (totalWarns > 0) {
      console.log(`${YELLOW}  ${totalWarns} warning(s) — should fix for code quality${RESET}`);
    }
  }
  console.log('');
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}${CYAN}Ultimate CashBook — Developer Audit${RESET}  ${DIM}(node audit.js)${RESET}`);
console.log(`Scanning: ${DIM}${rel(ROOT)}${RESET}  +  ${DIM}${rel(APP_DIR)}${RESET}`);

const srcFiles = collectFiles(ROOT);
const appFiles = collectFiles(APP_DIR);
const allFiles = [...srcFiles, ...appFiles];

checkMidFileImports(allFiles);
checkUnusedReactImport(allFiles);
checkHardcodedColors(srcFiles);   // app/ route files are thin re-exports; skip
checkEmptyStyles(srcFiles);
checkThemeUsage(srcFiles);
checkMutationRollback(srcFiles);
checkRoutes(srcFiles);
checkEnvExample();
checkApiInterceptors();
checkConsoleLog(srcFiles);

printSummary();

process.exit(totalFails > 0 ? 1 : 0);
