const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'Backend/SUNARP Core/CoreCompositeRepository.js'),
  'utf8'
);

function createSandbox(initialRecords = []) {
  const headers = [
    'persona_id', 'modulo_id', 'tipo_ambito_id',
    'referencia_id', 'active'
  ];
  const entries = initialRecords.map((record, index) => ({
    rowNumber: index + 2,
    record: Object.assign({}, record),
    values: headers.map(header => record[header] === undefined ? '' : record[header])
  }));
  let invalidations = 0;
  let writes = 0;

  const sheet = {
    getLastRow() {
      return Math.max(1, ...entries.map(entry => entry.rowNumber));
    },
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        setValue(value) {
          const entry = entries.find(item => item.rowNumber === row);
          if (!entry) throw new Error('Fila inexistente en prueba: ' + row);
          entry.values[column - 1] = value;
          entry.record[headers[column - 1]] = value;
          writes++;
        },
        setValues(matrix) {
          matrix.forEach((values, rowOffset) => {
            const rowNumber = row + rowOffset;
            let entry = entries.find(item => item.rowNumber === rowNumber);
            if (!entry) {
              entry = {
                rowNumber,
                record: {},
                values: Array(headers.length).fill('')
              };
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
    }
  };

  const table = {
    headers,
    entries,
    config: { headerRow: 1 },
    sheet
  };

  const context = vm.createContext({
    console: { warn() {}, log() {} },
    SpreadsheetApp: { flush() {} }
  });
  context._coreWithWriteLock_ = callback => callback();
  context._coreGetTable_ = () => table;
  context._coreGetFieldIndex_ = (_table, field) => {
    const index = headers.indexOf(field);
    if (index < 0) throw new Error('Campo inexistente: ' + field);
    return index;
  };
  context._coreValidateRecordFields_ = (record, allowedHeaders) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Registro inválido.');
    }
    const fields = Object.keys(record);
    const unknown = fields.filter(field => !allowedHeaders.includes(field));
    if (unknown.length) throw new Error('Campos desconocidos: ' + unknown.join(', '));
    return fields;
  };
  context._coreIsEmptyRow_ = values =>
    values.every(value => value === null || value === undefined || String(value).trim() === '');
  context._coreValuesEqual_ = (left, right) =>
    String(left === null || left === undefined ? '' : left).trim() ===
    String(right === null || right === undefined ? '' : right).trim();
  context._coreInvalidateSourceCache_ = () => {
    invalidations++;
    return { success: true };
  };
  vm.runInContext(source, context, { filename: 'CoreCompositeRepository.js' });

  return {
    context,
    entries,
    getInvalidations: () => invalidations,
    getWrites: () => writes
  };
}

test('syncRecordsByKey rechaza valores vacíos en la identidad del padre', () => {
  const sandbox = createSandbox();

  assert.throws(() => sandbox.context.syncRecordsByKey(
    { sheetName: 'AmbitosAcceso' },
    { persona_id: ' ', modulo_id: 'MOD_1' },
    ['tipo_ambito_id', 'referencia_id'],
    [],
    'active',
    true,
    false,
    { allowEmptyKeyFields: ['referencia_id'] }
  ), /parentMatch requiere un valor no vacío para "persona_id"/);

  assert.equal(sandbox.getWrites(), 0);
  assert.equal(sandbox.getInvalidations(), 0);
});

test('syncRecordsByKey impide que desiredRecords cambie la clave del padre', () => {
  const sandbox = createSandbox();

  assert.throws(() => sandbox.context.syncRecordsByKey(
    { sheetName: 'UsuarioRol' },
    { persona_id: 'PER_1' },
    ['modulo_id'],
    [{ persona_id: 'PER_2', modulo_id: 'MOD_1' }],
    'active',
    true,
    false
  ), /desiredRecords no puede modificar el campo padre "persona_id"/);

  assert.equal(sandbox.entries.length, 0);
  assert.equal(sandbox.getWrites(), 0);
  assert.equal(sandbox.getInvalidations(), 0);
});

test('syncRecordsByKey conserva el padre validado cuando desiredRecords lo repite igual', () => {
  const sandbox = createSandbox();

  const result = sandbox.context.syncRecordsByKey(
    { sheetName: 'UsuarioRol' },
    { persona_id: 'PER_1' },
    ['modulo_id'],
    [{ persona_id: ' PER_1 ', modulo_id: 'MOD_1' }],
    'active',
    true,
    false
  );

  assert.equal(result.inserted, 1);
  assert.equal(result.totalActive, 1);
  assert.equal(sandbox.entries.length, 1);
  assert.equal(sandbox.entries[0].record.persona_id, 'PER_1');
  assert.equal(sandbox.entries[0].record.modulo_id, 'MOD_1');
  assert.equal(sandbox.entries[0].record.active, true);
  assert.equal(sandbox.getInvalidations(), 1);
});
