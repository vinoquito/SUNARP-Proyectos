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
  let candidateRowsRead = 0;
  let fullTableLoads = 0;

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
          candidateRowsRead += numRows;
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
            useRegularExpression() { return finder; },
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
    sheet,
    headerMap: Object.fromEntries(headers.map((header, index) => [header, index]))
  };

  const context = vm.createContext({
    console: { warn() {}, log() {} },
    SpreadsheetApp: { flush() {} }
  });
  context._coreWithWriteLock_ = callback => callback();
  context._coreGetTable_ = () => {
    fullTableLoads++;
    return table;
  };
  context._coreOpenSource_ = () => ({
    config: { headerRow: 1, sheetName: 'AmbitosAcceso' },
    spreadsheet: {},
    sheet
  });
  context._coreReadCandidateRows_ = (_sheet, rowNumbers) => {
    candidateRowsRead += rowNumbers.length;
    const result = new Map();
    rowNumbers.forEach(rowNumber => {
      const entry = entries.find(item => item.rowNumber === rowNumber);
      if (entry) result.set(rowNumber, entry.values.slice());
    });
    return result;
  };
  context._coreRowToRecord_ = (fieldNames, values) =>
    Object.fromEntries(fieldNames.map((field, index) => [field, values[index]]));
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
  context._coreInvalidateSourceCacheOrThrow_ = sourceRef => {
    const result = context._coreInvalidateSourceCache_(sourceRef);
    if (!result || result.success !== true) {
      throw new Error('Falló la invalidación de caché.');
    }
    return result;
  };
  context._coreRunSourceWrite_ = (sourceRef, writer) => {
    let writeStarted = false;
    const result = writer(() => { writeStarted = true; });
    if (writeStarted) context._coreInvalidateSourceCacheOrThrow_(sourceRef);
    return result;
  };
  vm.runInContext(source, context, { filename: 'CoreCompositeRepository.js' });

  return {
    context,
    entries,
    getInvalidations: () => invalidations,
    getWrites: () => writes,
    getCandidateRowsRead: () => candidateRowsRead,
    getFullTableLoads: () => fullTableLoads
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

test('syncRecordsByKey lee únicamente las filas del conjunto padre y no materializa la tabla completa', () => {
  const unrelated = Array.from({ length: 120 }, (_, index) => ({
    persona_id: 'PER_OTHER_' + index,
    modulo_id: 'MOD_OTHER',
    tipo_ambito_id: 'SEDE',
    referencia_id: 'SEDE_' + index,
    active: true
  }));
  const target = [
    { persona_id: 'PER_TARGET', modulo_id: 'MOD_KEEP', tipo_ambito_id: 'TOTAL', referencia_id: '', active: false },
    { persona_id: 'PER_TARGET', modulo_id: 'MOD_DROP', tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', active: true }
  ];
  const sandbox = createSandbox(unrelated.concat(target));
  const result = sandbox.context.syncRecordsByKey(
    { sheetName: 'AmbitosAcceso' },
    { persona_id: 'PER_TARGET' },
    ['modulo_id'],
    [{ modulo_id: 'MOD_KEEP', tipo_ambito_id: 'TOTAL', referencia_id: '' }],
    'active',
    true,
    false,
    { allowEmptyKeyFields: ['referencia_id'] }
  );

  assert.equal(result.updated, 1);
  assert.equal(result.deactivated, 1);
  assert.equal(result.inserted, 0);
  assert.equal(sandbox.getCandidateRowsRead(), 2);
  assert.equal(sandbox.getFullTableLoads(), 0);
  assert.equal(sandbox.getInvalidations(), 1);
});
