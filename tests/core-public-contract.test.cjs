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


test('el documento del contrato declara exactamente los métodos públicos y sus parámetros reales', () => {
  const contractPath = path.join(root, 'Documentacion/Contrato público de SUNARP Core.md');
  const contract = fs.readFileSync(contractPath, 'utf8');
  const section = contract.match(
    /^## 2\\. Inventario de la API pública\\s*([\\s\\S]*?)^## 3\\./m
  );
  assert.ok(section, 'Debe existir la sección de inventario de la API pública.');

  const documented = new Map();
  for (const match of section[1].matchAll(
    /^\\|\\s*[^|]+\\|\\s*`([A-Za-z_$][\\w$]*)`\\s*\\|\\s*`([A-Za-z_$][\\w$]*\\([^ `]*\\))`\\s*\\|$/gm
  )) {
    documented.set(match[1], match[2]);
  }

  const declarations = new Map();
  for (const file of collectFiles(coreDir, new Set(['.js']))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const name of documented.keys()) {
      if (declarations.has(name)) continue;
      const escapedName = name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
      const declaration = source.match(new RegExp(
        '^function\\s+' + escapedName + '\\s*\\(([\\s\\S]*?)\\)\\s*\\{',
        'm'
      ));
      if (declaration) declarations.set(name, declaration[1]);
    }
  }

  assert.deepEqual([...documented.keys()].sort(), [...declarations.keys()].sort());

  for (const [name, signature] of documented) {
    const signatureMatch = signature.match(/^[A-Za-z_$][\\w$]*\\((.*)\\)$/);
    assert.ok(signatureMatch, 'Firma documentada inválida para ' + name + '.');
    const documentedParameters = signatureMatch[1].split(',')
      .map(value => value.trim()).filter(Boolean);
    const actualParameters = declarations.get(name)
      .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
      .replace(/\\/\\/[^\\n]*/g, '')
      .split(',')
      .map(value => value.trim()).filter(Boolean);
    assert.deepEqual(
      documentedParameters,
      actualParameters,
      'Los parámetros documentados deben coincidir con la declaración de ' + name + '.'
    );
  }
});

test('solo los consumidores que declaran SUNARPCore invocan la biblioteca y Gestor permanece en v9', () => {
  const gestorManifest = JSON.parse(fs.readFileSync(
    path.join(gestorDir, 'appsscript.json'),
    'utf8'
  ));
  const library = (gestorManifest.dependencies?.libraries || [])
    .find(item => item.userSymbol === 'SUNARPCore');
  assert.ok(library, 'Gestor debe declarar SUNARPCore.');
  assert.equal(String(library.version), '9', 'No se debe cambiar el Gestor a v10 antes de publicarla y verificarla.');

  const backendDir = path.join(root, 'Backend');
  const projectDirs = fs.readdirSync(backendDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(backendDir, entry.name));
  for (const projectDir of projectDirs) {
    const manifestPath = path.join(projectDir, 'appsscript.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const referencesCore = collectFiles(projectDir, new Set(['.js', '.gs', '.html']))
      .some(file => /\\bSUNARPCore\\./.test(fs.readFileSync(file, 'utf8')));
    const declaresCore = (manifest.dependencies?.libraries || [])
      .some(item => item.userSymbol === 'SUNARPCore' || item.libraryId === library.libraryId);
    assert.equal(
      referencesCore,
      declaresCore,
      'La dependencia SUNARP Core debe estar declarada cuando el proyecto la invoca: ' + projectDir
    );
  }
});
