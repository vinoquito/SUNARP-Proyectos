const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'Backend/SUNARP Core/DataSources.js'),
  'utf8'
);

function createSandbox() {
  const opened = [];
  const spreadsheet = {
    getName: () => 'Spreadsheet de prueba',
    getSheetByName: name => ({
      getName: () => name
    })
  };
  const sandbox = vm.createContext({
    SpreadsheetApp: {
      openById: id => {
        opened.push(id);
        return spreadsheet;
      }
    }
  });
  vm.runInContext(source, sandbox, { filename: 'DataSources.js' });
  return { sandbox, opened, spreadsheet };
}

test('Core reutiliza el objeto Spreadsheet por ID dentro de la misma ejecución', () => {
  const { sandbox, opened, spreadsheet } = createSandbox();
  const first = sandbox._coreOpenSpreadsheet_('BOOK_1', 'primera fuente');
  const second = sandbox._coreOpenSpreadsheet_('BOOK_1', 'segunda fuente');

  assert.equal(first, spreadsheet);
  assert.equal(second, spreadsheet);
  assert.deepEqual(opened, ['BOOK_1']);
});

test('la caché de manejadores mantiene un límite LRU y reabre un archivo desalojado', () => {
  const { sandbox, opened } = createSandbox();

  for (let i = 0; i < 13; i++) {
    sandbox._coreOpenSpreadsheet_('BOOK_' + i, 'archivo ' + i);
  }
  sandbox._coreOpenSpreadsheet_('BOOK_0', 'archivo inicial');

  assert.equal(opened.length, 14);
  assert.equal(opened[13], 'BOOK_0');
});

test('abrir varias pestañas del mismo archivo reutiliza el manejador y resuelve cada pestaña', () => {
  const { sandbox, opened } = createSandbox();
  const first = sandbox._coreOpenSource_({
    spreadsheetId: 'BOOK_1',
    sheetName: 'Personas',
    headerRow: 1
  });
  const second = sandbox._coreOpenSource_({
    spreadsheetId: 'BOOK_1',
    sheetName: 'Asignaciones',
    headerRow: 1
  });

  assert.equal(first.spreadsheet, second.spreadsheet);
  assert.equal(first.sheet.getName(), 'Personas');
  assert.equal(second.sheet.getName(), 'Asignaciones');
  assert.deepEqual(opened, ['BOOK_1']);
});



test('una lectura cacheada recalcula la generación tras esperar el bloqueo', () => {
  const repositorySource = fs.readFileSync(
    path.join(root, 'Backend/SUNARP Core/DataRepository.js'),
    'utf8'
  );
  const cache = new Map();
  let generation = 'GEN_OLD';
  let firstOldGenerationLookup = true;
  let sourceReads = 0;

  const sandbox = vm.createContext({
    Date,
    console: { log() {}, warn() {} }
  });
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });

  sandbox._coreGetSourceGeneration_ = () => generation;
  sandbox._coreBuildSourceCacheKey_ = (_source, kind) => kind + ':SOURCE';
  sandbox.getCachedValue = key => {
    if (key === 'records:SOURCE:GEN_OLD' && firstOldGenerationLookup) {
      firstOldGenerationLookup = false;
      return null;
    }
    return cache.has(key) ? cache.get(key) : null;
  };
  sandbox.putCachedValue = (key, value) => {
    cache.set(key, value);
    return { success: true };
  };
  sandbox._coreWithWriteLock_ = callback => {
    // Simula una escritura Core mientras esta lectura espera el bloqueo.
    generation = 'GEN_NEW';
    cache.set('records:SOURCE:GEN_OLD', ['STALE']);
    return callback();
  };
  sandbox.listRecordsFromSources = requests => {
    sourceReads++;
    return Object.fromEntries(requests.map(request => [request.key, ['FRESH']]));
  };

  const result = sandbox.listRecordsFromSourcesCached([{
    key: 'employees',
    source: { spreadsheetId: 'BOOK', sheetName: 'Personas' },
    requiredHeaders: ['persona_id']
  }], 300);

  assert.equal(sourceReads, 1);
  assert.deepEqual(Array.from(result.employees), ['FRESH']);
  assert.deepEqual(cache.get('records:SOURCE:GEN_OLD'), ['STALE']);
  assert.deepEqual(cache.get('records:SOURCE:GEN_NEW'), ['FRESH']);
});
