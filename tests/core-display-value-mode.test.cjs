'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'Backend/SUNARP Core/DataRepository.js'),
  'utf8'
);

function createSandbox() {
  const calls = {
    displayReads: 0,
    rawReads: 0,
    spreadsheetOpens: 0
  };
  const cache = new Map();

  const data = {
    departamentos: {
      headers: ['id', 'name'],
      display: [
        ['id', 'name'],
        ['01', 'Lima'],
        ['02', 'Arequipa']
      ],
      raw: [
        ['id', 'name'],
        [1, 'Lima'],
        [2, 'Arequipa']
      ]
    },
    provincias: {
      headers: ['id', 'name', 'id_departamento'],
      display: [
        ['id', 'name', 'id_departamento'],
        ['0101', 'Lima', '01']
      ],
      raw: [
        ['id', 'name', 'id_departamento'],
        [101, 'Lima', 1]
      ]
    }
  };

  const sheets = {};
  Object.keys(data).forEach(name => {
    const item = data[name];
    sheets[name] = {
      getLastRow() { return item.display.length; },
      getLastColumn() { return item.headers.length; },
      getRange(startRow, startColumn, numRows, numColumns) {
        return {
          getDisplayValues() {
            calls.displayReads++;
            return item.display
              .slice(startRow - 1, startRow - 1 + numRows)
              .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
          },
          getValues() {
            calls.rawReads++;
            return item.raw
              .slice(startRow - 1, startRow - 1 + numRows)
              .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
          }
        };
      }
    };
  });

  const context = vm.createContext({
    console: { log() {}, warn() {} },
    _coreNormalizeSourceConfig_(sourceConfig) {
      return {
        spreadsheetId: sourceConfig.spreadsheetId,
        sheetName: sourceConfig.sheetName,
        headerRow: sourceConfig.headerRow || 1,
        label: sourceConfig.label || sourceConfig.sheetName
      };
    },
    _coreOpenSpreadsheet_(spreadsheetId) {
      assert.equal(spreadsheetId, 'MASTER_DATA_TEST');
      calls.spreadsheetOpens++;
      return {
        getName() { return 'Global parameters'; },
        getSheetByName(name) { return sheets[name] || null; }
      };
    },
    _coreGetSourceGeneration_() { return 'GENERATION_1'; },
    _coreBuildSourceCacheKey_(sourceConfig, namespace) {
      return 'source:' + sourceConfig.sheetName + ':' + namespace;
    },
    getCachedValue(key) { return cache.get(key) || null; },
    putCachedValue(key, value) {
      cache.set(key, value);
      return { success: true };
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() {},
          hasLock() { return true; },
          releaseLock() {}
        };
      }
    }
  });

  vm.runInContext(source, context, { filename: 'DataRepository.js' });
  return { context, calls, cache };
}

test('listRecordsFromSources display mode conserva ceros iniciales de códigos geográficos', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.listRecordsFromSources([
    {
      key: 'departments',
      source: {
        spreadsheetId: 'MASTER_DATA_TEST',
        sheetName: 'departamentos',
        headerRow: 1
      },
      requiredHeaders: ['id', 'name'],
      valueMode: 'display'
    },
    {
      key: 'provinces',
      source: {
        spreadsheetId: 'MASTER_DATA_TEST',
        sheetName: 'provincias',
        headerRow: 1
      },
      requiredHeaders: ['id', 'name', 'id_departamento'],
      valueMode: 'display'
    }
  ]);

  assert.equal(result.departments[0].id, '01');
  assert.equal(result.provinces[0].id, '0101');
  assert.equal(result.provinces[0].id_departamento, '01');
  assert.equal(sandbox.calls.displayReads, 2);
  assert.equal(sandbox.calls.rawReads, 0);
  assert.equal(sandbox.calls.spreadsheetOpens, 1);
});

test('el modo raw predeterminado mantiene el comportamiento previo', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.listRecordsFromSources([{
    key: 'departments',
    source: {
      spreadsheetId: 'MASTER_DATA_TEST',
      sheetName: 'departamentos',
      headerRow: 1
    },
    requiredHeaders: ['id', 'name']
  }]);

  assert.equal(result.departments[0].id, 1);
  assert.equal(sandbox.calls.rawReads, 1);
  assert.equal(sandbox.calls.displayReads, 0);
});

test('listRecordsFromSources rechaza modos de lectura no admitidos', () => {
  const sandbox = createSandbox();
  assert.throws(
    () => sandbox.context.listRecordsFromSources([{
      key: 'departments',
      source: {
        spreadsheetId: 'MASTER_DATA_TEST',
        sheetName: 'departamentos'
      },
      requiredHeaders: ['id', 'name'],
      valueMode: 'formatted'
    }]),
    /valueMode debe ser "raw" o "display"/
  );
  assert.equal(sandbox.calls.spreadsheetOpens, 0);
});

test('display mode conserva las validaciones de encabezados requeridos', () => {
  const sandbox = createSandbox();
  assert.throws(
    () => sandbox.context.listRecordsFromSources([{
      key: 'departments',
      source: {
        spreadsheetId: 'MASTER_DATA_TEST',
        sheetName: 'departamentos'
      },
      requiredHeaders: ['id', 'name', 'id_departamento'],
      valueMode: 'display'
    }]),
    /no contiene las columnas requeridas: id_departamento/
  );
});

test('listRecordsFromSourcesCached separa los modos raw y display y reutiliza cada caché', () => {
  const sandbox = createSandbox();
  const displayRequest = [{
    key: 'departments',
    source: {
      spreadsheetId: 'MASTER_DATA_TEST',
      sheetName: 'departamentos',
      headerRow: 1
    },
    requiredHeaders: ['id', 'name'],
    valueMode: 'display'
  }];

  const firstDisplay = sandbox.context.listRecordsFromSourcesCached(displayRequest, 60);
  assert.equal(firstDisplay.departments[0].id, '01');
  assert.equal(sandbox.calls.displayReads, 1);

  const cachedDisplay = sandbox.context.listRecordsFromSourcesCached(displayRequest, 60);
  assert.equal(cachedDisplay.departments[0].id, '01');
  assert.equal(sandbox.calls.displayReads, 1);

  const raw = sandbox.context.listRecordsFromSourcesCached([{
    ...displayRequest[0],
    valueMode: 'raw'
  }], 60);
  assert.equal(raw.departments[0].id, 1);
  assert.equal(sandbox.calls.rawReads, 1);
  assert.equal(sandbox.cache.size, 2);
});

