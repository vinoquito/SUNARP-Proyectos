
/**
 * SUNARP Core
 * Módulo: DataCoreTests
 *
 * Ejecuta pruebas de los módulos:
 * - DataSources
 * - DataRepository
 * - DataQuery
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

    const projectedLookup = findRecordsByFields(
      source,
      { nombre: 'Ana Torres' },
      { searchField: 'nombre', projectionFields: ['id', 'area'] }
    );
    assert(
      projectedLookup.total === 1 &&
      projectedLookup.records[0].id === 'TST_001' &&
      projectedLookup.records[0].area === 'Administración' &&
      !Object.prototype.hasOwnProperty.call(projectedLookup.records[0], 'anexo') &&
      !Object.prototype.hasOwnProperty.call(projectedLookup.records[0], 'active'),
      'La proyección exacta devuelve únicamente los campos declarados y los necesarios para verificar el filtro.'
    );
    const exactMany = findRecordsByFields(
      source,
      { id: ['TST_001', 'TST_002'] },
      { searchField: 'id' }
    );
    assert(
      exactMany.total === 2,
      'La búsqueda exacta por múltiples identificadores resuelve el subconjunto en lotes.'
    );
    const whitespaceLookup = findRecordsByFields(
      source,
      { nombre: 'AnaTorres' },
      { searchField: 'nombre', ignoreWhitespace: true }
    );
    assert(
      whitespaceLookup.total === 1 &&
      whitespaceLookup.records[0].id === 'TST_001',
      'La búsqueda exacta puede normalizar espacios sin cargar la tabla completa.'
    );
    const partialSearch = searchRecordsByFields(
      source,
      'ana',
      ['nombre'],
      { matchCase: false }
    );
    assert(
      partialSearch.total === 1 &&
      partialSearch.records[0].id === 'TST_001',
      'La búsqueda parcial recupera únicamente filas coincidentes mediante TextFinder.'
    );
    const accentSearch = searchRecordsByFields(
      source,
      'perez',
      ['nombre'],
      { matchCase: false }
    );
    assert(
      accentSearch.total === 1 &&
      accentSearch.records[0].id === 'TST_002',
      'La búsqueda parcial ignora diferencias de acentuación.'
    );


    // 4.15. Consultas autorizadas, distinción y caché de candidatos.
    const queryAuthorizationContext = {
      authenticated: true,
      personaId: 'TST_ADMIN',
      moduleAccess: [{
        modulo_id: 'MOD_TEST',
        permissionCodes: ['TEST_READ'],
        scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }]
      }]
    };
    const authorizedQuery = queryRecords(source, {
      idField: 'id',
      distinctBy: 'area',
      sortBy: 'area',
      filters: { active: true },
      authorization: {
        context: queryAuthorizationContext,
        moduleId: 'MOD_TEST',
        permissionCode: 'TEST_READ'
      },
      cacheSeconds: 60
    });
    assert(
      authorizedQuery.total === 2 &&
      authorizedQuery.records.length === 2,
      'La consulta central filtra, autoriza, ordena y devuelve valores distintos.'
    );

    const distinctPageSheet = testSpreadsheet.insertSheet('distinct-page');
    distinctPageSheet.getRange(1, 1, 1, 5).setValues([[
      'asignacion_id', 'persona_id', 'active', 'sede_id', 'detalle'
    ]]);
    distinctPageSheet.getRange(2, 1, 5, 5).setValues([
      ['ASG_001', 'PER_001', true, 'SEDE_1', 'primera'],
      ['ASG_002', 'PER_001', true, 'SEDE_1', 'segunda'],
      ['ASG_003', 'PER_002', true, 'SEDE_1', 'tercera'],
      ['ASG_004', 'PER_003', true, 'SEDE_1', 'cuarta'],
      ['ASG_005', 'PER_004', true, 'SEDE_1', 'quinta']
    ]);
    SpreadsheetApp.flush();
    const distinctPageResult = queryRecords(
      Object.assign({}, source, { sheetName: 'distinct-page' }),
      {
        idField: 'asignacion_id',
        filters: { active: true },
        distinctBy: 'persona_id',
        sortBy: 'persona_id',
        sortDirection: 'asc',
        offset: 1,
        limit: 2,
        authorization: {
          context: queryAuthorizationContext,
          moduleId: 'MOD_TEST',
          permissionCode: 'TEST_READ'
        },
        cacheSeconds: 0,
        candidateCacheSeconds: 0
      }
    );
    assert(
      distinctPageResult.total === 4 &&
      distinctPageResult.records.length === 2 &&
      distinctPageResult.records[0].persona_id === 'PER_002' &&
      distinctPageResult.records[1].persona_id === 'PER_003' &&
      distinctPageResult.retainedForPage === 3,
      'La paginación por personas distintas retiene solo offset + limit representantes y conserva el total exacto.'
    );
    testSpreadsheet.deleteSheet(distinctPageSheet);

    // 4.16. El Directorio puede aportar la jerarquía por relaciones:
    // asignaciones no debe declarar columnas organizacionales adicionales.
    const assignmentSheet = testSpreadsheet.insertSheet('asignaciones');
    assignmentSheet.getRange(1, 1, 1, 10).setValues([[
      'asignacion_id', 'persona_id', 'cargo_id', 'condicion_cargo',
      'anexo', 'estructura_local_id', 'local_id', 'observaciones',
      'active', 'order'
    ]]);
    assignmentSheet.getRange(2, 1, 2, 10).setValues([
      ['ASG_001', 'PER_001', 'CAR_001', 'Titular', 1001, 'REL_001', 'LOC_001', '', true, 1],
      ['ASG_002', 'PER_002', 'CAR_002', 'Suplente', 1002, 'REL_INEXISTENTE', 'LOC_002', '', true, 2]
    ]);
    SpreadsheetApp.flush();
    const assignmentLookupResult = queryRecords(
      Object.assign({}, source, { sheetName: 'asignaciones' }),
      {
        idField: 'asignacion_id',
        filters: { active: true },
        sortBy: 'order',
        authorization: {
          context: queryAuthorizationContext,
          moduleId: 'MOD_TEST',
          permissionCode: 'TEST_READ',
          scopeRecordLookups: [{
            recordField: 'estructura_local_id',
            values: {
              REL_001: {
                estructura_id: 'ORG_001',
                local_id: 'LOC_001',
                sede_id: 'SEDE_001'
              }
            },
            required: true,
            requireEqualFields: ['local_id']
          }]
        },
        cacheSeconds: 0,
        candidateCacheSeconds: 0
      }
    );
    assert(
      assignmentLookupResult.total === 1 &&
      assignmentLookupResult.records.length === 1 &&
      assignmentLookupResult.records[0].asignacion_id === 'ASG_001',
      'queryRecords autoriza asignaciones con relaciones organizacionales enriquecidas sin exigir columnas adicionales en la tabla de negocio.'
    );
    testSpreadsheet.deleteSheet(assignmentSheet);

    const candidateCacheQuery = queryRecords(source, {
      idField: 'id',
      distinctBy: 'active',
      sortBy: 'active',
      filters: { active: true },
      authorization: {
        context: queryAuthorizationContext,
        moduleId: 'MOD_TEST',
        permissionCode: 'TEST_READ'
      },
      cacheSeconds: 60
    });
    assert(
      candidateCacheQuery.total === 1 &&
      candidateCacheQuery.candidateCacheHit === true,
      'Las consultas distintas reutilizan candidatos, pero vuelven a aplicar autorización.'
    );

    const relationshipCacheBase = {
      context: queryAuthorizationContext,
      moduleId: 'MOD_TEST',
      permissionCode: 'TEST_READ',
      scopeRecordLookups: [{
        recordField: 'area',
        values: { 'Administración': { area: 'Administración' } },
        required: true
      }]
    };
    const relationshipCacheFirst = queryRecords(source, {
      idField: 'id',
      filters: { active: true },
      authorization: relationshipCacheBase,
      cacheSeconds: 60
    });
    assert(
      relationshipCacheFirst.total === 1,
      'La consulta autorizada excluye referencias obligatorias ausentes del catálogo declarado.'
    );
    const relationshipCacheSecond = queryRecords(source, {
      idField: 'id',
      filters: { active: true },
      authorization: Object.assign({}, relationshipCacheBase, {
        scopeRecordLookups: [{
          recordField: 'area',
          values: {
            'Administración': { area: 'Administración' },
            'Asesoría': { area: 'Asesoría' }
          },
          required: true
        }]
      }),
      cacheSeconds: 60
    });
    assert(
      relationshipCacheSecond.total === 2 &&
      relationshipCacheSecond.cacheHit === false &&
      relationshipCacheSecond.candidateCacheHit === true,
      'La caché final distingue relaciones de autorización diferentes y reutiliza solo los candidatos.'
    );

    const deniedQueryContext = {
      authenticated: true,
      personaId: 'TST_DENIED',
      moduleAccess: [{
        modulo_id: 'MOD_TEST',
        permissionCodes: [],
        scopes: [{ tipo_ambito_id: 'TOTAL' }]
      }]
    };
    expectError(() => queryRecords(source, {
      idField: 'id',
      filters: { active: true },
      authorization: {
        context: deniedQueryContext,
        moduleId: 'MOD_TEST',
        permissionCode: 'TEST_READ'
      }
    }), 'La consulta central rechaza permisos ausentes antes de reutilizar caché.');

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
    const largeCacheFullKey = _coreBuildCacheKey_('core-test:large-value');
    const largeCacheManifest = JSON.parse(
      CacheService.getScriptCache().get(largeCacheFullKey)
    );
    if (largeCacheManifest.storage === 'gzip-chunks') {
      CacheService.getScriptCache().remove(largeCacheManifest.chunkKeys[0]);
      assert(
        getCachedValue('core-test:large-value') === null,
        'Una generación con un fragmento ausente se descarta íntegramente.'
      );
    }
    removeCachedValue('core-test:large-value');
    assert(
      getCachedValue('core-test:large-value') === null,
      'La invalidación elimina el manifiesto de un valor grande.'
    );

    const incompleteManifestKey = _coreBuildCacheKey_('core-test:missing-checksum');
    const incompleteChunkKey = 'SUNARP_CORE:core-test:missing-checksum:chunk';
    const scriptCache = CacheService.getScriptCache();
    scriptCache.put(incompleteChunkKey, 'abc', 300);
    scriptCache.put(incompleteManifestKey, JSON.stringify({
      format: _CORE_CACHE_CHUNK_FORMAT_,
      storage: 'gzip-chunks',
      chunkKeys: [incompleteChunkKey],
      payloadLength: 3
    }), 300);
    assert(
      getCachedValue('core-test:missing-checksum') === null,
      'Rechaza un manifiesto fragmentado sin checksum y descarta sus fragmentos.'
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

    const generationBeforeExternalEdit = _coreGetSourceGeneration_(source);
    const sourceRecordsKey = _coreBuildSourceCacheKey_(source, 'records') +
      ':' + generationBeforeExternalEdit;
    const externalName = 'Edición externa a Core';
    sheet.getRange(sheet.getLastRow(), 2).setValue(externalName);
    SpreadsheetApp.flush();
    const generationAfterExternalEdit = _coreGetSourceGeneration_(source);
    const retainedSnapshot = getCachedValue(sourceRecordsKey);
    const cachedAfterExternalEdit = listRecordsFromSourcesCached([{
      key: 'registros', source, requiredHeaders: ['id', 'nombre']
    }], 300);
    const cachedExternalRow = cachedAfterExternalEdit.registros.find(
      row => row.id === 'TST_003'
    );
    const retainedExternalRow = Array.isArray(retainedSnapshot)
      ? retainedSnapshot.find(row => row.id === 'TST_003')
      : null;
    const cachedName = cachedExternalRow && cachedExternalRow.nombre;
    assert(
      generationAfterExternalEdit === generationBeforeExternalEdit &&
      (!Array.isArray(retainedSnapshot) ||
        (retainedExternalRow && retainedExternalRow.nombre === 'María López')) &&
      (cachedName === 'María López' || cachedName === externalName),
      'Una edición externa no cambia la generación; una instantánea retenida puede quedar obsoleta, pero CacheService también puede desalojarla antes del TTL.'
    );

    const externalInvalidation = invalidateSourceCache(source);
    const refreshedAfterExternalEdit = listRecordsFromSourcesCached([{
      key: 'registros', source, requiredHeaders: ['id', 'nombre']
    }], 300);
    const refreshedExternalRow = refreshedAfterExternalEdit.registros.find(
      row => row.id === 'TST_003'
    );
    assert(
      externalInvalidation.success &&
      refreshedExternalRow && refreshedExternalRow.nombre === externalName,
      'La invalidación explícita de una escritura externa fuerza la lectura actualizada.'
    );

    // 8.1. Probar unicidad compuesta en inserción.
    expectError(() => {
      insertRecord(
        source,
        {
          id: 'TST_005',
          // La prueba anterior editó externamente el nombre de TST_003.
          // Se reutiliza el valor vigente en la hoja para probar unicidad.
          nombre: externalName,
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

    // 8.3. Probar lectura acotada desde el final de una fuente append-only.
    const tailPage = listTailRecords(source, {
      offset: 0,
      limit: 2,
      requiredHeaders: ['id']
    });
    assert(
      tailPage.total === 5 &&
      tailPage.records.length === 2 &&
      tailPage.records[0].id === 'TST_006' &&
      tailPage.records[1].id === 'TST_005',
      'La lectura de cola devuelve la página más reciente en orden descendente.'
    );
    const tailPrevious = listTailRecords(source, {
      offset: 2,
      limit: 2,
      requiredHeaders: ['id']
    });
    assert(
      tailPrevious.records.length === 2 &&
      tailPrevious.records[0].id === 'TST_003' &&
      tailPrevious.records[1].id === 'TST_002',
      'La lectura de cola pagina hacia registros anteriores sin leer la tabla completa.'
    );

    // 8.4. Consulta indexada de Auditoria: el total excluye filas vacías y el
    // orden corresponde a fecha_hora, no a asumir que el append fue cronológico.
    const auditSheet = testSpreadsheet.insertSheet('auditoria');
    auditSheet.getRange(1, 1, 1, 3).setValues([[
      'evento_id', 'fecha_hora', 'detalle'
    ]]);
    auditSheet.getRange(2, 1, 5, 3).setValues([
      ['EVT_001', new Date('2026-11-20T09:00:00Z'), 'primero'],
      ['', new Date('2026-11-20T10:00:00Z'), 'sin identificador'],
      ['EVT_002', new Date('2026-11-20T11:00:00Z'), 'segundo'],
      ['EVT_003', new Date('2026-11-20T08:00:00Z'), 'tercero'],
      ['EVT_004', new Date('2026-11-20T12:00:00Z'), 'cuarto']
    ]);
    SpreadsheetApp.flush();
    const auditSource = Object.assign({}, source, { sheetName: 'auditoria' });
    const indexedTail = listTailRecords(auditSource, {
      idField: 'evento_id',
      dateField: 'fecha_hora',
      sortBy: 'fecha_hora',
      offset: 0,
      limit: 2,
      requiredHeaders: ['evento_id', 'fecha_hora']
    });
    assert(
      indexedTail.total === 4 &&
      indexedTail.records.length === 2 &&
      indexedTail.records[0].evento_id === 'EVT_004' &&
      indexedTail.records[1].evento_id === 'EVT_002' &&
      indexedTail.hasMore,
      'La cola indexada cuenta solo eventos con ID y ordena por fecha descendente.'
    );
    const indexedDateRange = listTailRecords(auditSource, {
      idField: 'evento_id',
      dateField: 'fecha_hora',
      sortBy: 'fecha_hora',
      fromDate: new Date('2026-11-20T08:30:00Z'),
      toDate: new Date('2026-11-20T11:30:00Z'),
      offset: 0,
      limit: 10
    });
    assert(
      indexedDateRange.total === 2 &&
      indexedDateRange.records[0].evento_id === 'EVT_002' &&
      indexedDateRange.records[1].evento_id === 'EVT_001',
      'La consulta por rango temporal aplica límites inclusivos y conserva orden cronológico.'
    );

    const invalidTailDateRange = () => listTailRecords(auditSource, {
      idField: 'evento_id',
      fromDate: new Date('2026-11-20T00:00:00Z'),
      offset: 0,
      limit: 10
    });
    expectError(
      invalidTailDateRange,
      'La consulta temporal indexada exige dateField explícito o sortBy como fecha.'
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

    // 13. Probar lote multihoja bajo el mismo bloqueo central de Core.
    const batchSheet = testSpreadsheet.insertSheet('lote_secundario');
    batchSheet.getRange(1, 1, 1, 2).setValues([['id', 'valor']]);
    batchSheet.getRange(2, 1, 1, 2).setValues([['BATCH_001', 'antes']]);
    const batchSource = {
      spreadsheetId: testSpreadsheet.getId(),
      sheetName: 'lote_secundario',
      headerRow: 1,
      label: 'Prueba lote secundario'
    };

    const batchGenerationBefore = _coreGetSourceGeneration_(batchSource);
    const sourceGenerationBefore = _coreGetSourceGeneration_(source);
    const batchResult = runSourceWriteBatch([source, batchSource], markWriteStarted => {
      markWriteStarted();
      sheet.getRange(2, 3).setValue('Lote correcto');
      batchSheet.getRange(2, 2).setValue('después');
      return { success: true };
    });
    const batchGenerationAfter = _coreGetSourceGeneration_(batchSource);
    const sourceGenerationAfter = _coreGetSourceGeneration_(source);

    assert(
      batchResult.success === true &&
      batchGenerationAfter !== batchGenerationBefore &&
      sourceGenerationAfter !== sourceGenerationBefore &&
      batchSheet.getRange(2, 2).getValue() === 'después' &&
      sheet.getRange(2, 3).getValue() === 'Lote correcto',
      'El lote multihoja ejecuta las escrituras y cambia las generaciones de todas las fuentes declaradas.'
    );

    const partialBatchGenerationBefore = _coreGetSourceGeneration_(batchSource);
    const partialSourceGenerationBefore = _coreGetSourceGeneration_(source);
    expectError(() => runSourceWriteBatch([source, batchSource], markWriteStarted => {
      markWriteStarted();
      sheet.getRange(2, 3).setValue('Cambio parcial');
      batchSheet.getRange(2, 2).setValue('parcial');
      throw new Error('fallo simulado después de escribir dos fuentes');
    }), 'El lote informa el error después de intentar flush e invalidación.');

    assert(
      _coreGetSourceGeneration_(batchSource) !== partialBatchGenerationBefore &&
      _coreGetSourceGeneration_(source) !== partialSourceGenerationBefore &&
      batchSheet.getRange(2, 2).getValue() === 'parcial' &&
      sheet.getRange(2, 3).getValue() === 'Cambio parcial',
      'El lote también invalida todas las fuentes cuando el callback falla tras iniciar escrituras parciales.'
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
