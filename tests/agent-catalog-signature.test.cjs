'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'Backend/Agente Sunarp/Código.js'),
  'utf8'
);

test('la firma de sincronización de Agentes SUNARP detecta cambios en los catálogos geográficos observados', () => {
  const context = vm.createContext({
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest(_algorithm, value) {
        return Array.from(crypto.createHash('sha256').update(String(value), 'utf8').digest());
      },
      base64Encode(bytes) {
        return Buffer.from(bytes).toString('base64');
      }
    }
  });

  vm.runInContext(source, context, { filename: 'AgentesSunarp.js' });

  const config = vm.runInContext('AGENTES_SUNARP_CONFIG', context);
  const sheets = new Map();
  Array.from(new Set([
    config.HOJA_ORIGEN,
    ...(config.HOJAS_OBSERVADAS || [])
  ])).forEach(name => {
    sheets.set(name, {
      values: [['id', 'name'], ['01', name]],
      getDataRange() {
        return { getDisplayValues: () => this.values.map(row => row.slice()) };
      }
    });
  });

  const spreadsheet = {
    getSheetByName(name) {
      return sheets.get(name) || null;
    }
  };

  const signature = () => context.obtenerFirmaOrigenAgentesSunarp_(spreadsheet);
  const initial = signature();

  for (const name of ['departamentos', 'provincias', 'distritos']) {
    const sheet = sheets.get(name);
    assert.ok(sheet, 'Agentes SUNARP debe observar la hoja ' + name + '.');
    sheet.values[1][1] += ' actualizado';
    assert.notEqual(
      signature(),
      initial,
      'Un cambio en ' + name + ' debe invalidar la firma de sincronización.'
    );
    sheet.values[1][1] = name;
  }
});
