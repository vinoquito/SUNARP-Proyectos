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
