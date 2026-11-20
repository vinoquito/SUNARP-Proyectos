const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const coreDir = path.join(root, 'Backend/SUNARP Core');
const gestorDir = path.join(root, 'Backend/Gestor de intranet SUNARP');

function collectFiles(directory, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, extensions));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

test('el inventario público de SUNARP Core coincide con el contrato documentado', () => {
  const expected = [
    'appendAuditEvent',
    'assertValidRecord',
    'authorizationHasPermission',
    'authorizationIsRecordInScope',
    'deleteRecord',
    'findRecordsByFields',
    'getCachedValue',
    'getCurrentUserEmail',
    'getRecordById',
    'getSourceInfo',
    'getSourceInfoCached',
    'insertRecord',
    'invalidateSourceCache',
    'listRecords',
    'listRecordsFromSources',
    'listRecordsFromSourcesCached',
    'listTailRecords',
    'putCachedValue',
    'queryRecords',
    'removeCachedValue',
    'removeCachedValues',
    'resolveAuthorizationContext',
    'resolveIdentity',
    'runCoreTests',
    'searchRecordsByFields',
    'setRecordStatus',
    'syncRecordsByKey',
    'updateRecord',
    'updateRecordByFields',
    'validateRecord'
  ].sort();

  const discovered = new Set();
  for (const file of collectFiles(coreDir, new Set(['.js']))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const name = match[1];
      if (!name.startsWith('_') && !name.endsWith('_')) discovered.add(name);
    }
  }

  assert.deepEqual([...discovered].sort(), expected);
});

test('todos los métodos SUNARPCore invocados por Gestor existen en la API pública', () => {
  const coreFiles = collectFiles(coreDir, new Set(['.js']));
  const publicApi = new Set();
  for (const file of coreFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const name = match[1];
      if (!name.startsWith('_') && !name.endsWith('_')) publicApi.add(name);
    }
  }

  const calls = new Set();
  for (const file of collectFiles(gestorDir, new Set(['.js', '.html']))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bSUNARPCore\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      calls.add(match[1]);
    }
  }
  const missing = [...calls].filter(name => !publicApi.has(name));
  assert.deepEqual(missing, []);
  assert.ok(calls.size > 0, 'Debe existir al menos una llamada explícita a la biblioteca.');
});

test('el proyecto Apps Script de Core incluye los archivos JavaScript fuente', () => {
  const clasp = JSON.parse(fs.readFileSync(path.join(coreDir, '.clasp.json'), 'utf8'));
  const gestorManifest = JSON.parse(fs.readFileSync(
    path.join(gestorDir, 'appsscript.json'),
    'utf8'
  ));
  const library = (gestorManifest.dependencies?.libraries || [])
    .find(item => item.userSymbol === 'SUNARPCore');

  assert.equal(clasp.rootDir, '');
  assert.ok(clasp.scriptExtensions.includes('.js'));
  assert.equal(clasp.skipSubdirectories, false);
  assert.equal(clasp.scriptId, library.libraryId);
  assert.equal(fs.existsSync(path.join(coreDir, 'DataQuery.js')), true);
  assert.equal(fs.existsSync(path.join(coreDir, 'DataRepository.js')), true);
});
