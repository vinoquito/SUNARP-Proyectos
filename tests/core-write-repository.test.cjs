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
const compositeSource = fs.readFileSync(
  path.join(root, 'Backend/SUNARP Core/CoreCompositeRepository.js'),
  'utf8'
);

function createSandbox(initialRecords = []) {
  const headers = ['id', 'email', 'name', 'active'];
  const entries = initialRecords.map((record, index) => ({
    rowNumber: index + 2,
    record: Object.assign({}, record),
    values: headers.map(header => record[header] === undefined ? '' : record[header])
  }));
  let rowsRead = 0;
  let writes = 0;
  let deletions = 0;
  let invalidations = 0;

  const sheet = {
    getLastRow() {
      return Math.max(1, ...entries.map(entry => entry.rowNumber));
    },
    getLastColumn() {
      return headers.length;
    },
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        getDisplayValues() {
          return row === 1 ? [headers] : [];
        },
        getValues() {
          if (row > 1) rowsRead += numRows;
          return Array.from({ length: numRows }, (_, offset) => {
            const entry = entries.find(item => item.rowNumber === row + offset);
            return entry
              ? entry.values.slice(column - 1, column - 1 + numColumns)
              : Array(numColumns).fill('');
          });
        },
        createTextFinder(query) {
          let entireCell = false;
          let caseSensitive = true;
          const finder = {
            matchEntireCell(value) { entireCell = value; return finder; },
            matchCase(value) { caseSensitive = value; return finder; },
            findAll() {
              const expected = String(query);
              return entries.filter(entry => {
                if (entry.rowNumber < row || entry.rowNumber >= row + numRows) return false;
                const actual = String(entry.values[column - 1] ?? '');
                const left = caseSensitive ? actual : actual.toLowerCase();
                const right = caseSensitive ? expected : expected.toLowerCase();
                return entireCell ? left === right : left.includes(right);
              }).map(entry => ({ getRow: () => entry.rowNumber }));
            }
          };
          return finder;
        },
        setValue(value) {
          const entry = entries.find(item => item.rowNumber === row);
          if (!entry) throw new Error('Fila inexistente: ' + row);
          entry.values[column - 1] = value;
          entry.record[headers[column - 1]] = value;
          writes++;
        },
        setValues(matrix) {
          matrix.forEach((values, rowOffset) => {
            const rowNumber = row + rowOffset;
            let entry = entries.find(item => item.rowNumber === rowNumber);
            if (!entry) {
              entry = { rowNumber, record: {}, values: Array(headers.length).fill('') };
              entries.push(entry);
            }
            values.forEach((value, columnOffset) => {
              entry.values[columnOffset] = value;
              entry.record[headers[columnOffset]] = value;
            });
            writes++;
          });
        }
      };
    },
    deleteRow(rowNumber) {
      const index = entries.findIndex(entry => entry.rowNumber === rowNumber);
      if (index < 0) throw new Error('Fila inexistente: ' + rowNumber);
      entries.splice(index, 1);
      entries.forEach(entry => {
        if (entry.rowNumber > rowNumber) entry.rowNumber--;
      });
      deletions++;
    }
  };

  const context = vm.createContext({
    console: { warn() {}, log() {} },
    SpreadsheetApp: { flush() {} }
  });
  context._coreOpenSource_ = () => ({
    config: { headerRow: 1, sheetName: 'Test' },
    spreadsheet: {},
    sheet
  });
  context._coreWithWriteLock_ = callback => callback();
  context._coreRunSourceWrite_ = (_source, writer) => {
    let started = false;
    const result = writer(() => { started = true; });
    if (started) invalidations++;
    return result;
  };
  vm.runInContext(repositorySource, context, { filename: 'DataRepository.js' });
  vm.runInContext(compositeSource, context, { filename: 'CoreCompositeRepository.js' });

  return {
    context,
    entries,
    getRowsRead: () => rowsRead,
    getWrites: () => writes,
    getDeletions: () => deletions,
    getInvalidations: () => invalidations
  };
}

function createRecords(count = 150) {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return {
      id: 'PER_' + number,
      email: 'person' + number + '@sunarp.gob.pe',
      name: 'Persona ' + number,
      active: true
    };
  });
}

test('insertRecord valida ID y unicidad sin leer todas las filas y agrega el registro', () => {
  const sandbox = createSandbox(createRecords());
  const result = sandbox.context.insertRecord(
    { sheetName: 'Test' },
    { id: 'PER_NEW', email: 'new@sunarp.gob.pe', name: 'Nueva', active: true },
    { idField: 'id', uniqueFields: ['email'] }
  );

  assert.equal(result.success, true);
  assert.equal(result.record.id, 'PER_NEW');
  assert.equal(sandbox.entries.length, 151);
  assert.equal(sandbox.getRowsRead(), 0);
  assert.equal(sandbox.getWrites(), 1);
  assert.equal(sandbox.getInvalidations(), 1);
});

test('insertRecord rechaza ID duplicado y combinación única duplicada con lecturas candidatas', () => {
  const byId = createSandbox(createRecords());
  assert.throws(
    () => byId.context.insertRecord(
      { sheetName: 'Test' },
      { id: 'PER_050', email: 'new@sunarp.gob.pe', name: 'Duplicada', active: true },
      { idField: 'id' }
    ),
    /identificador "PER_050" ya existe/
  );
  assert.ok(byId.getRowsRead() < 150);
  assert.equal(byId.getWrites(), 0);

  const byEmail = createSandbox(createRecords());
  assert.throws(
    () => byEmail.context.insertRecord(
      { sheetName: 'Test' },
      { id: 'PER_NEW', email: 'person050@sunarp.gob.pe', name: 'Duplicada', active: true },
      { idField: 'id', uniqueFields: ['email'] }
    ),
    /combinación de campos únicos/
  );
  assert.ok(byEmail.getRowsRead() < 150);
  assert.equal(byEmail.getWrites(), 0);
});

test('updateRecord localiza por ID y comprueba unicidad sin cargar la tabla completa', () => {
  const sandbox = createSandbox(createRecords());
  const result = sandbox.context.updateRecord(
    { sheetName: 'Test' },
    'id',
    'PER_050',
    { name: 'Persona editada', email: 'editada@sunarp.gob.pe' },
    { uniqueFields: ['email'] }
  );

  assert.equal(result.success, true);
  assert.equal(result.record.name, 'Persona editada');
  assert.equal(sandbox.entries.find(entry => entry.record.id === 'PER_050').record.email, 'editada@sunarp.gob.pe');
  assert.ok(sandbox.getRowsRead() < 150);
  assert.equal(sandbox.getWrites(), 2);
  assert.equal(sandbox.getInvalidations(), 1);
});

test('updateRecord rechaza una colisión de unicidad antes de escribir', () => {
  const sandbox = createSandbox(createRecords());
  assert.throws(
    () => sandbox.context.updateRecord(
      { sheetName: 'Test' },
      'id',
      'PER_050',
      { email: 'person060@sunarp.gob.pe' },
      { uniqueFields: ['email'] }
    ),
    /actualización generaría un registro duplicado/
  );
  assert.ok(sandbox.getRowsRead() < 150);
  assert.equal(sandbox.getWrites(), 0);
  assert.equal(sandbox.getInvalidations(), 0);
});

test('deleteRecord localiza la fila por ID sin materializar todas las filas', () => {
  const sandbox = createSandbox(createRecords());
  const result = sandbox.context.deleteRecord(
    { sheetName: 'Test' }, 'id', 'PER_075'
  );

  assert.equal(result.success, true);
  assert.equal(result.id, 'PER_075');
  assert.equal(sandbox.entries.length, 149);
  assert.equal(sandbox.entries.some(entry => entry.record.id === 'PER_075'), false);
  assert.ok(sandbox.getRowsRead() < 150);
  assert.equal(sandbox.getDeletions(), 1);
  assert.equal(sandbox.getInvalidations(), 1);
});

test('updateRecordByFields usa criterios y unicidad puntuales en lugar de leer toda la tabla', () => {
  const sandbox = createSandbox(createRecords());
  const result = sandbox.context.updateRecordByFields(
    { sheetName: 'Test' },
    { id: 'PER_090' },
    { name: 'Actualizada por criterios' },
    { uniqueFields: ['email'] }
  );

  assert.equal(result.success, true);
  assert.equal(result.record.name, 'Actualizada por criterios');
  assert.ok(sandbox.getRowsRead() < 150);
  assert.equal(sandbox.getWrites(), 1);
  assert.equal(sandbox.getInvalidations(), 1);
});
