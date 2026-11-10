
/**
 * SUNARP Core
 * Módulo: DataCoreTests
 *
 * Ejecuta pruebas de los módulos:
 * - DataSources
 * - DataRepository
 * - DataValidation
 *
 * Crea una hoja de cálculo temporal y la envía a la papelera
 * al finalizar. No modifica archivos reales.
 */

function runCoreSelfTests_() {
  let testSpreadsheet = null;
  const results = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`PRUEBA FALLIDA: ${message}`);
    }

    results.push(`OK: ${message}`);
  }

  function expectError(callback, message) {
    let errorDetected = false;

    try {
      callback();
    } catch (error) {
      errorDetected = true;
    }

    assert(errorDetected, message);
  }

  try {
    // 1. Crear archivo temporal.
    testSpreadsheet = SpreadsheetApp.create(
      'TEMP - SUNARP Core - Pruebas'
    );

    const sheet = testSpreadsheet.getSheets()[0];
    sheet.setName('registros');

    // 2. Preparar datos de prueba.
    sheet.getRange(1, 1, 1, 5).setValues([[
      'id',
      'nombre',
      'area',
      'anexo',
      'active'
    ]]);

    sheet.getRange(2, 1, 2, 5).setValues([
      ['TST_001', 'Ana Torres', 'Administración', 1001, true],
      ['TST_002', 'Luis Pérez', 'Asesoría', 1002, true]
    ]);

    SpreadsheetApp.flush();

    const source = {
      spreadsheetId: testSpreadsheet.getId(),
      sheetName: 'registros',
      headerRow: 1,
      label: 'Prueba SUNARP Core'
    };

    // 3. Esquema de validación.
    const schema = {
      id: {
        label: 'Identificador',
        required: true,
        type: 'string',
        maxLength: 30
      },
      nombre: {
        label: 'Nombre',
        required: true,
        type: 'string',
        minLength: 2,
        maxLength: 100
      },
      area: {
        label: 'Área',
        required: true,
        type: 'string'
      },
      anexo: {
        label: 'Anexo',
        type: 'integer',
        min: 1,
        max: 99999
      },
      active: {
        label: 'Estado',
        required: true,
        type: 'boolean'
      }
    };

    // 4. Probar conexión y lectura de metadatos.
    const info = getSourceInfo(source);

    assert(
      info.sheetName === 'registros',
      'Conexión y consulta de información de la fuente.'
    );

    assert(
      info.headers.length === 5,
      'Lectura correcta de encabezados.'
    );

    // 5. Probar listado y filtros.
    const listing = listRecords(source, {
      filters: { active: true },
      search: 'ana',
      searchFields: ['nombre'],
      sortBy: 'nombre',
      sortDirection: 'asc',
      offset: 0,
      limit: 10
    });

    assert(
      listing.total === 1 &&
      listing.records[0].id === 'TST_001',
      'Listado, filtros, búsqueda, ordenamiento y paginación.'
    );

    // 6. Probar consulta individual.
    const individual = getRecordById(
      source,
      'id',
      'TST_001'
    );

    assert(
      individual !== null &&
      individual.nombre === 'Ana Torres',
      'Consulta de registro por identificador.'
    );

    // 7. Probar validación de datos.
    const validRecord = validateRecord({
      id: 'TST_003',
      nombre: 'María López',
      area: 'Informática',
      anexo: 1003,
      active: true
    }, schema);

    assert(
      validRecord.valid,
      'Validación de un registro correcto.'
    );

    const invalidRecord = validateRecord({
      id: 'TST_004',
      nombre: '',
      area: 'Informática',
      anexo: 0,
      active: true
    }, schema);

    assert(
      !invalidRecord.valid &&
      invalidRecord.errors.length >= 2,
      'Detección de campos obligatorios y valores fuera de rango.'
    );

    // 8. Probar inserción.
    const insertion = insertRecord(
      source,
      {
        id: 'TST_003',
        nombre: 'María López',
        area: 'Informática',
        anexo: 1003,
        active: true
      },
      {
        idField: 'id',
        schema
      }
    );

    assert(
      insertion.success &&
      insertion.record.id === 'TST_003',
      'Inserción de un registro.'
    );

    // 9. Probar duplicidad de identificadores.
    expectError(() => {
      insertRecord(
        source,
        {
          id: 'TST_003',
          nombre: 'Otro nombre',
          area: 'Informática',
          anexo: 1004,
          active: true
        },
        {
          idField: 'id',
          schema
        }
      );
    }, 'Detección de identificadores duplicados.');

    // 10. Probar actualización parcial.
    const update = updateRecord(
      source,
      'id',
      'TST_003',
      {
        nombre: 'María López Actualizado'
      },
      {
        schema
      }
    );

    assert(
      update.success &&
      update.record.nombre === 'María López Actualizado',
      'Actualización parcial de un registro.'
    );

    // 11. Probar cambio de estado.
    const status = setRecordStatus(
      source,
      'id',
      'TST_003',
      'active',
      false,
      {
        schema
      }
    );

    const updatedStatus = getRecordById(
      source,
      'id',
      'TST_003'
    );

    assert(
      status.success &&
      updatedStatus.active === false,
      'Cambio de estado sin eliminar el registro.'
    );

    // 12. Probar eliminación física.
    const deletion = deleteRecord(
      source,
      'id',
      'TST_002'
    );

    const deletedRecord = getRecordById(
      source,
      'id',
      'TST_002'
    );

    assert(
      deletion.success &&
      deletedRecord === null,
      'Eliminación física de un registro.'
    );

    Logger.log('-----------------------------------');
    Logger.log('RESULTADO: TODAS LAS PRUEBAS PASARON');
    Logger.log(`Pruebas satisfactorias: ${results.length}`);

    results.forEach(result => Logger.log(result));

    return {
      success: true,
      totalTests: results.length,
      results
    };

  } catch (error) {
    Logger.log('ERROR EN LAS PRUEBAS: ' + error.message);

    throw error;

  } finally {
    // Eliminar el archivo temporal enviándolo a la papelera.
    if (testSpreadsheet) {
      try {
        DriveApp
          .getFileById(testSpreadsheet.getId())
          .setTrashed(true);

        Logger.log('Archivo temporal enviado a la papelera.');

      } catch (cleanupError) {
        Logger.log(
          'No se pudo eliminar el archivo temporal: ' +
          cleanupError.message
        );
      }
    }
  }
}
