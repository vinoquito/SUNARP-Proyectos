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
    const generationBeforeSync = _coreGetSourceGeneration_(source);

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

    const generationAfterFirstSync = _coreGetSourceGeneration_(source);
    assert(
      total.inserted === 1 &&
      total.totalActive === 1 &&
      generationAfterFirstSync !== generationBeforeSync,
      'Inserta una relación TOTAL y cambia la generación de la fuente.'
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

    const generationAfterSecondSync = _coreGetSourceGeneration_(source);
    assert(
      second.inserted === 1 &&
      second.deactivated === 1 &&
      generationAfterSecondSync !== generationAfterFirstSync,
      'Reemplaza TOTAL por SEDE, desactiva el ámbito anterior e invalida la fuente.'
    );

    const beforeUpdate = _coreGetSourceGeneration_(source);
    const updated = updateRecordByFields(
      source,
      {
        correo_institucional: parent.correo_institucional,
        modulo: parent.modulo,
        tipo_ambito: 'SEDE',
        referencia_id: 'SEDE_CENTRAL'
      },
      { incluir_descendientes: 'SI' }
    );
    const afterUpdate = _coreGetSourceGeneration_(source);
    assert(
      updated.success && afterUpdate !== beforeUpdate,
      'updateRecordByFields invalida la generación después de una escritura compuesta.'
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
