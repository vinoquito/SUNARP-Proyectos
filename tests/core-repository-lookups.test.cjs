const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const repositorySource = fs.readFileSync(
  path.join(root, 'Backend/SUNARP Core/DataRepository.js'),
  'utf8'
);

test('getRecordById usa una búsqueda exacta y no carga la tabla completa', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });
  sandbox._coreGetTable_ = () => {
    throw new Error('No debe cargar la tabla completa.');
  };
  sandbox.findRecordsByFields = (source, filters, options) => {
    assert.equal(source.spreadsheetId, 'DIRECTORY');
    assert.equal(source.sheetName, 'personas');
    assert.equal(Object.keys(filters).length, 1);
    assert.equal(filters.persona_id, 'PER_001');
    assert.equal(options.searchField, 'persona_id');
    return { records: [{ persona_id: 'PER_001', nombres: 'Ana' }], total: 1 };
  };

  const result = sandbox.getRecordById(
    { spreadsheetId: 'DIRECTORY', sheetName: 'personas' },
    'persona_id',
    'PER_001'
  );
  assert.equal(result.persona_id, 'PER_001');
  assert.throws(
    () => sandbox.getRecordById({}, 'persona_id', '  '),
    /identificador válido/
  );
});

test('listTailRecords pagina por identificador y fecha, excluye filas vacías y lee solo dos columnas antes de la página', () => {
  const headers = ['evento_id', 'fecha_hora', 'detalle'];
  const values = [
    ['EVT_001', new Date('2026-11-20T09:00:00Z'), 'primero'],
    ['', new Date('2026-11-20T10:00:00Z'), 'fila sin id'],
    ['EVT_002', new Date('2026-11-20T11:00:00Z'), 'segundo'],
    ['EVT_003', new Date('2026-11-20T08:00:00Z'), 'tercero'],
    ['EVT_004', new Date('2026-11-20T12:00:00Z'), 'cuarto']
  ];
  const reads = [];
  const sheet = {
    getLastRow: () => 6,
    getLastColumn: () => 3,
    getRange(row, column, numRows, numColumns) {
      reads.push({ row, column, numRows, numColumns });
      if (row === 1) return { getDisplayValues: () => [headers] };
      const sourceRows = values.slice(row - 2, row - 2 + numRows);
      return {
        getValues: () => sourceRows.map(item => item.slice(column - 1, column - 1 + numColumns))
      };
    }
  };
  const sandbox = vm.createContext({
    _coreOpenSource_: () => ({ config: { headerRow: 1, sheetName: 'Auditoria' }, sheet })
  });
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });

  const page = sandbox.listTailRecords(
    { spreadsheetId: 'SECURITY', sheetName: 'Auditoria' },
    {
      idField: 'evento_id',
      dateField: 'fecha_hora',
      sortBy: 'fecha_hora',
      offset: 0,
      limit: 2,
      requiredHeaders: ['evento_id', 'fecha_hora']
    }
  );
  assert.equal(page.total, 4);
  assert.equal(page.records.length, 2);
  assert.deepEqual(Array.from(page.records, item => item.evento_id), ['EVT_004', 'EVT_002']);
  assert.equal(page.hasMore, true);
  const dataReads = reads.filter(item => item.row > 1);
  assert.equal(dataReads.filter(item => item.numColumns === 1).length, 2);
  assert.ok(dataReads.filter(item => item.numColumns === 1).every(item => item.numRows === 5));
  // La lectura de filas completas se agrupa en ventanas de máximo 25 filas.
  assert.ok(dataReads.filter(item => item.numColumns === 3).every(item => item.numRows <= 25));
  assert.ok(dataReads.some(item => item.numColumns === 3));
});

test('listTailRecords permite filtros temporales exactos sin leer filas completas fuera de la página', () => {
  const headers = ['evento_id', 'fecha_hora', 'detalle'];
  const values = [
    ['EVT_001', new Date('2026-11-19T23:59:59Z'), 'antes'],
    ['EVT_002', new Date('2026-11-20T00:00:00Z'), 'inicio'],
    ['EVT_003', new Date('2026-11-20T12:00:00Z'), 'medio'],
    ['EVT_004', new Date('2026-11-21T00:00:00Z'), 'fin']
  ];
  const sheet = {
    getLastRow: () => 5,
    getLastColumn: () => 3,
    getRange(row, column, numRows, numColumns) {
      if (row === 1) return { getDisplayValues: () => [headers] };
      return {
        getValues: () => values.slice(row - 2, row - 2 + numRows)
          .map(item => item.slice(column - 1, column - 1 + numColumns))
      };
    }
  };
  const sandbox = vm.createContext({
    _coreOpenSource_: () => ({ config: { headerRow: 1, sheetName: 'Auditoria' }, sheet })
  });
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });
  const result = sandbox.listTailRecords(
    { spreadsheetId: 'SECURITY', sheetName: 'Auditoria' },
    {
      idField: 'evento_id',
      dateField: 'fecha_hora',
      sortBy: 'fecha_hora',
      fromDate: new Date('2026-11-20T00:00:00Z'),
      toDate: new Date('2026-11-20T23:59:59Z'),
      offset: 0,
      limit: 10
    }
  );
  assert.equal(result.total, 2);
  assert.deepEqual(Array.from(result.records, item => item.evento_id), ['EVT_003', 'EVT_002']);
  assert.equal(result.hasMore, false);
});

test('findRecordsByFields respeta matchCase=false al validar filas candidatas', () => {
  const headers = ['persona_id', 'correo_institucional'];
  const rows = [
    ['PER_001', 'ANA@SUNARP.GOB.PE'],
    ['PER_002', 'bea@sunarp.gob.pe']
  ];
  const sheet = {
    getLastRow: () => 3,
    getLastColumn: () => 2,
    getRange: (startRow, startColumn, numRows, numColumns) => {
      if (startRow === 1) return { getDisplayValues: () => [headers] };
      const values = rows.slice(startRow - 2, startRow - 2 + numRows)
        .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
      return {
        createTextFinder: searchText => {
          let matchCase = true;
          let entireCell = false;
          return {
            matchEntireCell(value) { entireCell = value; return this; },
            matchCase(value) { matchCase = value; return this; },
            useRegularExpression() { return this; },
            findAll() {
              const expected = String(searchText);
              return values.flatMap((row, index) => {
                const actual = String(row[0] === undefined ? '' : row[0]);
                const left = matchCase ? actual : actual.toLowerCase();
                const right = matchCase ? expected : expected.toLowerCase();
                const matched = entireCell ? left === right : left.includes(right);
                return matched ? [{ getRow: () => startRow + index }] : [];
              });
            }
          };
        }
      };
    }
  };
  const sandbox = vm.createContext({
    _coreOpenSource_: () => ({ config: { headerRow: 1, sheetName: 'personas' }, sheet }),
    _coreReadCandidateRows_: (_sheet, rowNumbers) => {
      const map = new Map();
      rowNumbers.forEach(rowNumber => map.set(rowNumber, rows[rowNumber - 2]));
      return map;
    },
    _coreIsEmptyRow_: row => !row || row.every(value => value === '' || value === null || value === undefined),
    _coreRowToRecord_: (headerList, row) =>
      Object.fromEntries(headerList.map((header, index) => [header, row[index]])),
    _coreValuesEqual_: (actual, expected) =>
      String(actual === null || actual === undefined ? '' : actual).trim() ===
      String(expected === null || expected === undefined ? '' : expected).trim()
  });
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });
  sandbox._coreReadCandidateRows_ = (_sheet, rowNumbers) => {
    const map = new Map();
    rowNumbers.forEach(rowNumber => map.set(rowNumber, rows[rowNumber - 2]));
    return map;
  };
  sandbox._coreIsEmptyRow_ = row => !row || row.every(value => value === '' || value === null || value === undefined);
  sandbox._coreRowToRecord_ = (headerList, row) =>
    Object.fromEntries(headerList.map((header, index) => [header, row[index]]));
  sandbox._coreValuesEqual_ = (actual, expected) =>
    String(actual === null || actual === undefined ? '' : actual).trim() ===
    String(expected === null || expected === undefined ? '' : expected).trim();

  const result = sandbox.findRecordsByFields(
    { spreadsheetId: 'DIRECTORY', sheetName: 'personas' },
    { correo_institucional: 'ana@sunarp.gob.pe' },
    { searchField: 'correo_institucional', matchCase: false }
  );
  assert.equal(result.total, 1);
  assert.equal(result.records[0].persona_id, 'PER_001');
});


test('findRecordsByFields admite proyección de columnas sin leer el ancho completo de las filas coincidentes', () => {
  const headers = [
    'asignacion_id', 'persona_id', 'cargo_id', 'condicion_cargo',
    'anexo', 'estructura_local_id', 'local_id', 'observaciones',
    'active', 'order', 'payload_extenso'
  ];
  const rows = [
    ['ASG_001', 'PER_001', 'CAR_01', 'Titular', 1001, 'REL_01', 'LOC_01', '', true, 1, 'X'.repeat(500)],
    ['ASG_002', 'PER_002', 'CAR_02', 'Suplente', 1002, '', 'LOC_02', '', false, 2, 'Y'.repeat(500)],
    ['ASG_003', 'PER_003', 'CAR_03', 'Titular', 1003, 'REL_03', 'LOC_03', '', true, 3, 'Z'.repeat(500)]
  ];
  const reads = [];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange(startRow, startColumn, numRows, numColumns) {
      reads.push({ startRow, startColumn, numRows, numColumns });
      if (startRow === 1) {
        return { getDisplayValues: () => [headers.slice(startColumn - 1, startColumn - 1 + numColumns)] };
      }
      const selected = rows.slice(startRow - 2, startRow - 2 + numRows)
        .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
      return {
        getValues: () => selected,
        createTextFinder(pattern) {
          let entireCell = false;
          let matchCase = true;
          return {
            matchEntireCell(value) { entireCell = value; return this; },
            matchCase(value) { matchCase = value; return this; },
            useRegularExpression() { return this; },
            findAll() {
              const found = [];
              selected.forEach((row, index) => {
                const actual = String(row[0]);
                const expected = String(pattern);
                const left = matchCase ? actual : actual.toLowerCase();
                const right = matchCase ? expected : expected.toLowerCase();
                const matched = entireCell ? left === right : left.includes(right);
                if (matched) found.push({ getRow: () => startRow + index });
              });
              return found;
            }
          };
        }
      };
    }
  };
  const sandbox = vm.createContext({
    _coreOpenSource_: () => ({ config: { headerRow: 1, sheetName: 'asignaciones' }, sheet }),
    _coreValuesEqual_: (actual, expected) =>
      String(actual === null || actual === undefined ? '' : actual).trim() ===
      String(expected === null || expected === undefined ? '' : expected).trim(),
    _coreIsEmptyRow_: row => !row || row.every(value => value === '' || value === null || value === undefined),
    _coreRowToRecord_: (fields, row) => Object.fromEntries(fields.map((field, index) => [field, row[index]]))
  });
  vm.runInContext(repositorySource, sandbox, { filename: 'DataRepository.js' });

  const result = sandbox.findRecordsByFields(
    { spreadsheetId: 'DIRECTORY', sheetName: 'asignaciones' },
    { estructura_local_id: ['REL_01', 'REL_03'] },
    {
      searchField: 'estructura_local_id',
      requiredHeaders: ['asignacion_id', 'persona_id'],
      projectionFields: ['asignacion_id', 'persona_id', 'local_id', 'active']
    }
  );
  assert.equal(result.total, 2);
  assert.deepEqual(Array.from(result.records, row => row.asignacion_id), ['ASG_001', 'ASG_003']);
  assert.deepEqual(Object.keys(result.records[0]).sort(), [
    'active', 'asignacion_id', 'estructura_local_id', 'local_id', 'persona_id'
  ].sort());
  assert.ok(reads.filter(item => item.startRow > 1).every(item => item.numColumns < headers.length));
  assert.ok(!Object.prototype.hasOwnProperty.call(result.records[0], 'payload_extenso'));
  assert.throws(
    () => sandbox.findRecordsByFields(
      { spreadsheetId: 'DIRECTORY', sheetName: 'asignaciones' },
      { estructura_local_id: 'REL_01' },
      { projectionFields: [] }
    ),
    /projectionFields/
  );
});
