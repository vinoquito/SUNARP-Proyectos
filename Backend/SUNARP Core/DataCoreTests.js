
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

    // 4.1. Probar caché compartida de fuentes y metadatos.
    const cachedInitial = listRecordsFromSourcesCached([{ key: 'registros', source, requiredHeaders: ['id', 'nombre'] }], 300);
    assert(cachedInitial.registros.length === 2, 'Lectura inicial mediante caché compartida de fuentes.');

    const cachedInfo = getSourceInfoCached(source, 300);
    assert(cachedInfo.headers.length === 5, 'Recuperación de metadatos mediante caché compartida.');

    const cachedRepeated = listRecordsFromSourcesCached([{ key: 'registros', source, requiredHeaders: ['id', 'nombre'] }], 300);
    assert(cachedRepeated.registros.length === 2, 'Reutilización de la instantánea de fuente en una lectura posterior.');

    const exactLookup = findRecordsByFields(
      source,
      { nombre: 'ana torres', active: true },
      { searchField: 'nombre', matchCase: false, requiredHeaders: ['id'] }
    );
    assert(
      exactLookup.total === 1 &&
      exactLookup.records[0].id === 'TST_001',
      'La búsqueda exacta recupera únicamente las filas coincidentes sin cargar la tabla completa.'
    );


    // 4.2. Probar almacenamiento centralizado de valores que superan 95 KiB.
    let largeValue = '';
    let seed = 123456789;
    for (let i = 0; i < 220000; i++) {
      seed = (seed * 16807) % 2147483647;
      largeValue += String.fromCharCode(32 + (seed % 90));
    }
    const largeCacheResult = putCachedValue('core-test:large-value', {
      payload: largeValue
    }, 300);
    assert(
      largeCacheResult.success &&
      ['gzip-inline', 'gzip-chunks'].includes(largeCacheResult.storage),
      'Almacena valores grandes mediante compresión y fragmentación centralizadas.'
    );
    const largeCachedValue = getCachedValue('core-test:large-value');
    assert(
      largeCachedValue &&
      largeCachedValue.payload === largeValue,
      'Reconstruye íntegramente un valor grande desde la caché.'
    );
    removeCachedValue('core-test:large-value');
    assert(
      getCachedValue('core-test:large-value') === null,
      'La invalidación elimina el manifiesto de un valor grande.'
    );


    expectError(() => listRecordsFromSources([{
      key: 'registros',
      source,
      requiredHeaders: ['columna_inexistente']
    }]), 'La lectura agrupada valida encabezados requeridos sin una consulta adicional de metadatos.');

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

    const cachedAfterInsert = listRecordsFromSourcesCached([{ key: 'registros', source, requiredHeaders: ['id', 'nombre'] }], 300);
    assert(
      cachedAfterInsert.registros.length === 3 &&
      cachedAfterInsert.registros.some(row => row.id === 'TST_003'),
      'La inserción invalida automáticamente la instantánea de la fuente.'
    );

    // 8.1. Probar unicidad compuesta en inserción.
    expectError(() => {
      insertRecord(
        source,
        {
          id: 'TST_005',
          nombre: 'María López',
          area: 'Otra área',
          anexo: 1005,
          active: true
        },
        {
          idField: 'id',
          uniqueFields: ['nombre'],
          schema
        }
      );
    }, 'Detección de duplicados mediante uniqueFields al insertar.');

    // 8.2. Unicidad compuesta: el mismo número puede existir bajo otro tipo.
    insertRecord(source, {
      id: 'TST_005',
      nombre: '12345678',
      area: 'DNI',
      anexo: 1005,
      active: true
    }, {
      idField: 'id',
      uniqueFields: ['area', 'nombre'],
      schema
    });

    const otherDocumentType = insertRecord(source, {
      id: 'TST_006',
      nombre: '12345678',
      area: 'CE',
      anexo: 1006,
      active: true
    }, {
      idField: 'id',
      uniqueFields: ['area', 'nombre'],
      schema
    });

    assert(
      otherDocumentType.success,
      'La unicidad compuesta permite el mismo número en tipos documentales distintos.'
    );

    expectError(() => {
      insertRecord(source, {
        id: 'TST_007',
        nombre: '12345678',
        area: 'DNI',
        anexo: 1007,
        active: true
      }, {
        idField: 'id',
        uniqueFields: ['area', 'nombre'],
        schema
      });
    }, 'La unicidad compuesta impide repetir tipo y número de documento.');

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

    const cachedAfterUpdate = listRecordsFromSourcesCached([{ key: 'registros', source, requiredHeaders: ['id', 'nombre'] }], 300);
    assert(
      cachedAfterUpdate.registros.some(row => row.id === 'TST_003' && row.nombre === 'María López Actualizado'),
      'La actualización invalida automáticamente la instantánea de la fuente.'
    );

    // 10.1. Probar unicidad compuesta en actualización.
    expectError(() => {
      updateRecord(
        source,
        'id',
        'TST_003',
        { nombre: 'Ana Torres' },
        { uniqueFields: ['nombre'], schema }
      );
    }, 'Detección de duplicados mediante uniqueFields al actualizar.');

    expectError(() => {
      updateRecord(
        source,
        'id',
        'TST_006',
        { area: 'DNI' },
        { uniqueFields: ['area', 'nombre'], schema }
      );
    }, 'La actualización impide duplicar la combinación de tipo y número documental.');

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

    const cachedAfterDelete = listRecordsFromSourcesCached([{ key: 'registros', source, requiredHeaders: ['id', 'nombre'] }], 300);
    assert(
      !cachedAfterDelete.registros.some(row => row.id === 'TST_002'),
      'La eliminación invalida automáticamente la instantánea de la fuente.'
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

/** Ejecuta las suites de pruebas del núcleo. */
function runCoreTests() {
  runCoreSelfTests_();
  runAuthorizationSelfTests_();
  runCompositeRepositorySelfTests_();
}
