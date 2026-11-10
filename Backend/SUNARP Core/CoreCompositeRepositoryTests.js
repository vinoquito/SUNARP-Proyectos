/**
 * SUNARP Core — pruebas para operaciones de relaciones compuestas.
 * Ejecutar runCompositeRepositorySelfTests_() desde el editor de Core.
 * Crea una hoja temporal y la envía a la papelera al finalizar.
 */
function runCompositeRepositorySelfTests_() {
  let spreadsheet = null;
  const results = [];

  function assert(condition, label) {
    if (!condition) throw new Error(`PRUEBA FALLIDA: ${label}`);
    results.push(`OK: ${label}`);
  }

  try {
    spreadsheet = SpreadsheetApp.create(
      'TEMP - SUNARP Core - Relaciones compuestas'
    );

    const sheet = spreadsheet.getSheets()[0];
    sheet.setName('AmbitosAcceso');

    sheet.getRange(1, 1, 1, 6).setValues([[
      'correo_institucional',
      'modulo',
      'tipo_ambito',
      'referencia_id',
      'incluir_descendientes',
      'estado'
    ]]);

    const source = {
      spreadsheetId: spreadsheet.getId(),
      sheetName: 'AmbitosAcceso',
      headerRow: 1,
      label: 'Prueba de relaciones compuestas'
    };

    const parent = {
      correo_institucional: 'prueba@sunarp.gob.pe',
      modulo: 'DIRECTORIOS'
    };

    const total = syncRecordsByKey(
      source,
      parent,
      ['tipo_ambito', 'referencia_id'],
      [{
        tipo_ambito: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: 'NO'
      }],
      'estado',
      'ACTIVO',
      'INACTIVO',
      { allowEmptyKeyFields: ['referencia_id'] }
    );

    assert(
      total.inserted === 1 && total.totalActive === 1,
      'Inserta una relación TOTAL con referencia vacía.'
    );

    const second = syncRecordsByKey(
      source,
      parent,
      ['tipo_ambito', 'referencia_id'],
      [{
        tipo_ambito: 'SEDE',
        referencia_id: 'SEDE_CENTRAL',
        incluir_descendientes: 'NO'
      }],
      'estado',
      'ACTIVO',
      'INACTIVO',
      { allowEmptyKeyFields: ['referencia_id'] }
    );

    assert(
      second.inserted === 1 && second.deactivated === 1,
      'Reemplaza TOTAL por SEDE y desactiva la relación anterior.'
    );

    const finalRows = listRecords(source, {}).records;
    const totalRow = finalRows.find(row => row.tipo_ambito === 'TOTAL');
    const sedeRow = finalRows.find(row => row.tipo_ambito === 'SEDE');

    assert(
      totalRow && totalRow.estado === 'INACTIVO',
      'Conserva el historial lógico desactivando el ámbito retirado.'
    );

    assert(
      sedeRow && sedeRow.estado === 'ACTIVO',
      'Mantiene activo el nuevo ámbito asignado.'
    );

    console.log(results.join('\n'));

    return {
      success: true,
      total: results.length,
      results
    };

  } finally {
    if (spreadsheet) {
      DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
    }
  }
}
