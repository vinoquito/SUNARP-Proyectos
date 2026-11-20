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
