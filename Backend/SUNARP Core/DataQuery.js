/**
 * SUNARP Core — consultas de datos autorizadas.
 *
 * queryRecords(source, {
 *   idField, filters, anyOf, search, searchFields, sortBy,
 *   sortDirection, offset, limit,
 *   authorization: { context, moduleId, permissionCode, structures, locals, fields, catalogVersion },
 *   cacheSeconds, schemaVersion
 * })
 *
 * filters se combina mediante AND. anyOf combina grupos mediante OR y cada
 * grupo mediante AND. Toda consulta exige permiso y ámbito; los filtros
 * exactos se resuelven con TextFinder y solo se recuperan filas candidatas.
 */

function _coreQueryStableValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(_coreQueryStableValue_);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).sort().forEach(key => {
    result[key] = _coreQueryStableValue_(value[key]);
  });
  return result;
}

function _coreQueryDigest_(value) {
  const serialized = JSON.stringify(_coreQueryStableValue_(value));
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, serialized);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function _coreQueryNormalizeGroups_(options) {
  const base = options.filters || {};
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error('SUNARP Core: filters debe ser un objeto.');
  }
  const baseFields = Object.keys(base);
  let alternatives = [{}];
  if (options.anyOf !== undefined) {
    if (!Array.isArray(options.anyOf) || !options.anyOf.length) {
      throw new Error('SUNARP Core: anyOf debe ser un arreglo no vacío.');
    }
    alternatives = options.anyOf;
  }

  return alternatives.map(group => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      throw new Error('SUNARP Core: cada grupo anyOf debe ser un objeto.');
    }

    // filters es una condición AND común a todos los grupos anyOf.
    // Cuando un campo aparece en ambos, se intersectan sus alternativas:
    // sobrescribirlo silenciosamente cambiaría la semántica de la consulta.
    const merged = Object.assign({}, group);
    baseFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(group, field)) {
        merged[field] = base[field];
        return;
      }
      const groupValues = Array.isArray(group[field]) ? group[field] : [group[field]];
      const baseValues = Array.isArray(base[field]) ? base[field] : [base[field]];
      const intersection = groupValues.filter(value =>
        baseValues.some(baseValue => _coreValuesEqual_(value, baseValue))
      );
      merged[field] = intersection;
    });

    if (!Object.keys(merged).length) {
      throw new Error('SUNARP Core: la consulta autorizada requiere filtros exactos.');
    }
    return merged;
  });
}

/**
 * Elige una columna segura para localizar candidatos mediante TextFinder.
 * Los filtros secundarios pueden buscar explícitamente valores vacíos, pero
 * la columna conductora debe tener alternativas no vacías. Un grupo con una
 * intersección vacía es imposible y no necesita lectura de origen.
 */
function _coreQueryGetCandidateSearchField_(group) {
  const fields = Object.keys(group || {});
  if (!fields.length) {
    throw new Error('SUNARP Core: la consulta autorizada requiere filtros exactos.');
  }

  const valuesByField = fields.map(field => ({
    field,
    values: Array.isArray(group[field]) ? group[field] : [group[field]]
  }));
  if (valuesByField.some(item => item.values.length === 0)) return null;

  const driver = valuesByField.find(item =>
    item.values.every(value =>
      value !== null && value !== undefined && String(value) !== ''
    )
  );
  if (driver) return driver.field;

  throw new Error(
    'SUNARP Core: cada grupo de filtros requiere al menos una columna conductora con valores no vacíos.'
  );
}

function _coreQueryValidateAuthorization_(authorization) {
  if (!authorization || typeof authorization !== 'object') {
    throw new Error('SUNARP Core: la consulta requiere un contexto de autorización.');
  }
  const context = authorization.context;
  const moduleId = String(authorization.moduleId || '').trim();
  const permissionCode = String(authorization.permissionCode || '').trim();
  if (!context || context.authenticated !== true || !context.personaId || !moduleId || !permissionCode) {
    throw new Error('SUNARP Core: el contexto de autorización está incompleto o no está autenticado.');
  }
  if (!authorizationHasPermission(context, permissionCode, moduleId)) {
    throw new Error('SUNARP Core: no tienes permiso para consultar estos registros.');
  }
  const access = (context.moduleAccess || []).find(item =>
    String(item.modulo_id || '').trim() === moduleId
  );
  if (!access || !Array.isArray(access.scopes) || !access.scopes.length) {
    throw new Error('SUNARP Core: no tienes ámbitos activos para consultar estos registros.');
  }
  // El atajo global solo es válido para un único ámbito TOTAL sin referencia.
  // Cualquier duplicidad o referencia malformada conserva la comprobación estricta.
  const totalOnly = access.scopes.length === 1 &&
    String(access.scopes[0].tipo_ambito_id || access.scopes[0].tipo_ambito || '').trim().toUpperCase() === 'TOTAL' &&
    !String(access.scopes[0].referencia_id || '').trim();
  if (!totalOnly && (!Array.isArray(authorization.structures) || !Array.isArray(authorization.locals))) {
    throw new Error('SUNARP Core: faltan los catálogos organizacionales requeridos para comprobar los ámbitos.');
  }
  return { context, moduleId, permissionCode, access, totalOnly };
}

function _coreQueryAuthorizationFingerprint_(authorization, validated, catalogVersion, scopeRelations) {
  // La huella refleja todos los datos que intervienen en la resolución del ámbito.
  // No se depende exclusivamente de generaciones: también se detectan cambios
  // en las relaciones/catálogos que el consumidor entrega en esta solicitud.
  const relationSnapshot = {
    structures: Array.isArray(authorization.structures) ? authorization.structures : [],
    locals: Array.isArray(authorization.locals) ? authorization.locals : [],
    scopeRecordById: scopeRelations.scopeRecordById,
    scopeRecordLookups: scopeRelations.scopeRecordLookups
  };
  return _coreQueryDigest_({
    personaId: validated.context.personaId,
    moduleId: validated.moduleId,
    permissionCode: validated.permissionCode,
    permissions: (validated.access.permissionCodes || []).slice().sort(),
    scopes: (validated.access.scopes || []).map(scope => ({
      tipo_ambito_id: scope.tipo_ambito_id || scope.tipo_ambito || '',
      referencia_id: scope.referencia_id || '',
      incluir_descendientes: scope.incluir_descendientes,
      active: scope.active
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    fields: authorization.fields || {},
    relationDigest: _coreQueryDigest_(relationSnapshot),
    catalogVersion: catalogVersion || ''
  });
}

function _coreQueryGetCatalogVersion_(authorization, diagnostics, sourceGenerations) {
  diagnostics = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
  diagnostics.sourceCount = 0;
  diagnostics.missingSource = '';
  diagnostics.reason = '';

  if (authorization.catalogVersion) {
    diagnostics.mode = 'explicit';
    return String(authorization.catalogVersion);
  }

  const sources = authorization.catalogSources;
  if (!Array.isArray(sources) || !sources.length) {
    diagnostics.mode = 'unavailable';
    diagnostics.reason = 'catalog-sources-not-provided';
    return null;
  }
  diagnostics.sourceCount = sources.length;

  let generations;
  if (Array.isArray(sourceGenerations)) {
    if (sourceGenerations.length !== sources.length) {
      diagnostics.mode = 'unavailable';
      diagnostics.reason = 'catalog-generation-count-mismatch';
      return null;
    }
    generations = sourceGenerations;
  } else {
    if (typeof _coreGetSourceGeneration_ !== 'function') {
      diagnostics.mode = 'unavailable';
      diagnostics.reason = 'source-generation-function-unavailable';
      return null;
    }
    generations = sources.map(source => _coreGetSourceGeneration_(source));
  }

  for (let i = 0; i < generations.length; i++) {
    if (!generations[i]) {
      const source = sources[i] || {};
      diagnostics.mode = 'sources';
      diagnostics.missingSource = String(
        source.label || source.sheetName || ('catalog[' + i + ']')
      );
      diagnostics.reason = 'source-generation-unavailable';
      return null;
    }
  }
  diagnostics.mode = 'sources';
  return _coreQueryDigest_(generations);
}

function _coreQueryMatchesSearch_(record, search, fields, searchAny) {
  if (!search) return true;
  const expected = typeof _coreNormalizeSearchText_ === 'function'
    ? _coreNormalizeSearchText_(search)
    : String(search).toLocaleLowerCase();
  const textMatch = fields.some(field => {
    const value = record[field];
    const actual = typeof _coreNormalizeSearchText_ === 'function'
      ? _coreNormalizeSearchText_(value)
      : String(value === null || value === undefined ? '' : value).toLocaleLowerCase();
    return actual.includes(expected);
  });
  if (textMatch) return true;
  return (searchAny || []).some(match => {
    const values = Array.isArray(match.values) ? match.values : [];
    return values.some(value => _coreValuesEqual_(record[match.field], value));
  });
}

function _coreQueryMatchesGroup_(record, group) {
  return Object.keys(group).every(field => {
    const expected = Array.isArray(group[field]) ? group[field] : [group[field]];
    return expected.some(value => _coreValuesEqual_(record[field], value));
  });
}

/**
 * Valida y normaliza las relaciones adicionales que se incorporan al registro
 * antes de comprobar el ámbito. Esta validación debe ocurrir incluso si existe
 * un resultado final en caché.
 */
function _coreQueryNormalizeScopeRelations_(authorization) {
  const rawById = authorization.scopeRecordById;
  const scopeRecordById = rawById === undefined || rawById === null
    ? {}
    : rawById;
  if (!scopeRecordById || typeof scopeRecordById !== 'object' ||
      Array.isArray(scopeRecordById)) {
    throw new Error('SUNARP Core: scopeRecordById debe ser un objeto indexado por idField.');
  }

  Object.keys(scopeRecordById).forEach(id => {
    const related = scopeRecordById[id];
    if (related !== null && (typeof related !== 'object' || Array.isArray(related))) {
      throw new Error('SUNARP Core: cada valor de scopeRecordById debe ser un registro.');
    }
  });

  const rawLookups = authorization.scopeRecordLookups;
  const scopeRecordLookups = rawLookups === undefined ? [] : rawLookups;
  if (!Array.isArray(scopeRecordLookups)) {
    throw new Error('SUNARP Core: scopeRecordLookups debe ser un arreglo.');
  }

  const normalizedLookups = scopeRecordLookups.map(lookup => {
    if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup) ||
        typeof lookup.recordField !== 'string' ||
        !/^[A-Za-z0-9_]+$/.test(lookup.recordField.trim()) ||
        !lookup.values || typeof lookup.values !== 'object' ||
        Array.isArray(lookup.values)) {
      throw new Error('SUNARP Core: cada scopeRecordLookup requiere recordField y values.');
    }
    if (lookup.required !== undefined && typeof lookup.required !== 'boolean') {
      throw new Error('SUNARP Core: scopeRecordLookup.required debe ser booleano.');
    }
    const requireEqualFields = lookup.requireEqualFields === undefined
      ? []
      : lookup.requireEqualFields;
    if (!Array.isArray(requireEqualFields) || requireEqualFields.some(field =>
      typeof field !== 'string' || !/^[A-Za-z0-9_]+$/.test(field.trim())
    )) {
      throw new Error('SUNARP Core: scopeRecordLookup.requireEqualFields debe ser un arreglo de campos válidos.');
    }
    Object.keys(lookup.values).forEach(id => {
      const related = lookup.values[id];
      if (!related || typeof related !== 'object' || Array.isArray(related)) {
        throw new Error('SUNARP Core: cada referencia de scopeRecordLookup debe contener un registro.');
      }
    });
    return {
      recordField: lookup.recordField.trim(),
      values: lookup.values,
      required: lookup.required === true,
      requireEqualFields: requireEqualFields.map(field => field.trim())
    };
  });

  return { scopeRecordById, scopeRecordLookups: normalizedLookups };
}

/** Orden total y determinista usado por la página retenida en memoria. */
function _coreQueryCompareRecords_(recordA, recordB, sortBy, idField, sortDirection) {
  const left = _coreQueryRecordValue_(recordA);
  const right = _coreQueryRecordValue_(recordB);
  const compared = _coreCompareValues_(left[sortBy], right[sortBy]) ||
    _coreCompareValues_(left[idField], right[idField]);
  return compared * (sortDirection === 'desc' ? -1 : 1);
}

/**
 * Mantiene únicamente los primeros maxRecords registros según el orden
 * solicitado. El conjunto completo sigue examinándose para calcular el total,
 * facetas y autorización; no se conserva todo el resultado autorizado.
 */
function _coreQueryInsertPageRecord_(records, record, sortBy, idField, sortDirection, maxRecords) {
  if (maxRecords < 1) return;
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (_coreQueryCompareRecords_(
      records[middle], record, sortBy, idField, sortDirection
    ) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  if (low >= maxRecords && records.length >= maxRecords) return;
  records.splice(low, 0, record);
  if (records.length > maxRecords) records.pop();
}

/**
 * Inserta/reemplaza un representante distinto manteniendo solo la mejor página.
 * Se usa cuando distinctBy === sortBy: todos los registros del mismo grupo
 * comparten la clave primaria de orden y basta retener offset + limit grupos.
 */
function _coreQueryInsertDistinctPageRecord_(
  records, retainedByValue, record, distinctValue,
  sortBy, idField, sortDirection, maxRecords
) {
  const previous = retainedByValue.get(distinctValue);
  if (previous) {
    if (_coreQueryCompareRecords_(
      record, previous, sortBy, idField, sortDirection
    ) >= 0) return;
    const previousIndex = records.indexOf(previous);
    if (previousIndex >= 0) records.splice(previousIndex, 1);
    retainedByValue.delete(distinctValue);
  }

  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (_coreQueryCompareRecords_(
      records[middle], record, sortBy, idField, sortDirection
    ) <= 0) low = middle + 1;
    else high = middle;
  }
  if (low >= maxRecords && records.length >= maxRecords) return;

  records.splice(low, 0, record);
  retainedByValue.set(distinctValue, record);
  if (records.length > maxRecords) {
    const removed = records.pop();
    const removedRecord = _coreQueryRecordValue_(removed);
    const removedValue = String(
      removedRecord[sortBy] === null || removedRecord[sortBy] === undefined
        ? ''
        : removedRecord[sortBy]
    ).trim();
    retainedByValue.delete(removedValue);
  }
}

function _coreQueryCacheKey_(source, generation, authorizationFingerprint, query) {
  const digest = _coreQueryDigest_({
    source: _coreBuildSourceCacheKey_(source, 'query'),
    generation,
    authorizationFingerprint,
    query
  });
  return 'query-result:v2:' + digest;
}

function _coreQueryAuthorizedSnapshotCacheKey_(source, generation, authorizationFingerprint, query) {
  const digest = _coreQueryDigest_({
    source: _coreBuildSourceCacheKey_(source, 'authorized-query-snapshot'),
    generation,
    authorizationFingerprint,
    query
  });
  return 'query-authorized:v1:' + digest;
}

function _coreQueryCandidateCacheKey_(source, generation, idField, schemaVersion, groups) {
  // La clave identifica el conjunto de candidatos, no la forma de la respuesta.
  // La compatibilidad de proyecciones se valida contra los metadatos guardados.
  const digest = _coreQueryDigest_({
    source: _coreBuildSourceCacheKey_(source, 'query-candidates'),
    generation,
    idField,
    schemaVersion,
    groups
  });
  return 'query-candidates:v3:' + digest;
}

function _coreQueryAssertHeaders_(source, requiredHeaders) {
  if (typeof getSourceInfoCached !== 'function') return;
  const info = getSourceInfoCached(source);
  const headers = info && Array.isArray(info.headers) ? info.headers : [];
  const missing = requiredHeaders.filter(header => !headers.includes(header));
  if (missing.length) {
    throw new Error('SUNARP Core: faltan encabezados requeridos: ' + missing.join(', ') + '.');
  }
}

/**
 * Ejecuta una consulta exacta, autorizada y paginada en el servidor.
 * El permiso se valida antes de consultar la caché y el ámbito se aplica
 * a cada candidato antes de calcular el total y la página.
 */
function queryRecords(source, options) {
  const queryStartedAt = Date.now();
  options = options || {};
  const authorization = options.authorization;
  const validated = _coreQueryValidateAuthorization_(authorization);
  const groups = _coreQueryNormalizeGroups_(options);
  const idField = String(options.idField || '').trim();
  const distinctBy = String(options.distinctBy || '').trim();
  const normalizeDistinctFields = (fields, label) => {
    if (fields === undefined) return [];
    if (!Array.isArray(fields) || fields.some(field =>
      typeof field !== 'string' || !/^[A-Za-z0-9_]+$/.test(field.trim())
    )) {
      throw new Error('SUNARP Core: ' + label + ' debe ser un arreglo de nombres de campo válidos.');
    }
    return Array.from(new Set(fields.map(field => field.trim())));
  };
  const distinctFields = normalizeDistinctFields(options.distinctFields, 'distinctFields');
  const distinctCountFields = normalizeDistinctFields(options.distinctCountFields, 'distinctCountFields');
  if (!idField) throw new Error('SUNARP Core: queryRecords requiere idField.');
  if (distinctBy && !/^[A-Za-z0-9_]+$/.test(distinctBy)) {
    throw new Error('SUNARP Core: distinctBy no es un campo válido.');
  }

  const offset = options.offset === undefined ? 0 : Number(options.offset);
  const limit = options.limit === undefined ? 25 : Number(options.limit);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('SUNARP Core: offset debe ser un entero mayor o igual a cero.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('SUNARP Core: limit debe ser un entero entre 1 y 1000.');
  }
  const sortBy = String(options.sortBy || idField);
  const sortDirection = String(options.sortDirection || 'asc').toLowerCase();
  if (!['asc', 'desc'].includes(sortDirection)) {
    throw new Error('SUNARP Core: sortDirection debe ser "asc" o "desc".');
  }
  const search = String(options.search || '').trim();
  const searchFields = options.searchFields === undefined ? [] : options.searchFields;
  const searchAny = options.searchAny === undefined ? [] : options.searchAny;
  if (!Array.isArray(searchFields) || !Array.isArray(searchAny)) {
    throw new Error('SUNARP Core: searchFields y searchAny deben ser arreglos.');
  }
  searchAny.forEach(match => {
    if (!match || typeof match.field !== 'string' || !match.field.trim() ||
        !Array.isArray(match.values) || !match.values.length) {
      throw new Error('SUNARP Core: cada searchAny requiere field y values no vacío.');
    }
  });
  if (search && !searchFields.length && !searchAny.length) {
    throw new Error('SUNARP Core: search requiere searchFields o searchAny.');
  }

  const descriptor = {
    groups, search, searchFields, searchAny, sortBy, sortDirection, offset, limit, idField, distinctBy,
    distinctFields, distinctCountFields,
    schemaVersion: String(options.schemaVersion || '1')
  };
  const scopeRelations = _coreQueryNormalizeScopeRelations_(authorization);
  const catalogDiagnostics = {};
  const catalogSourcesForGeneration = !authorization.catalogVersion &&
    Array.isArray(authorization.catalogSources)
    ? authorization.catalogSources
    : [];
  const generationSources = [source].concat(catalogSourcesForGeneration);
  const sourceGenerationStartedAt = Date.now();
  const sourceGenerations = typeof _coreGetSourceGenerations_ === 'function'
    ? _coreGetSourceGenerations_(generationSources)
    : typeof _coreGetSourceGeneration_ === 'function'
      ? generationSources.map(sourceRef => _coreGetSourceGeneration_(sourceRef))
      : generationSources.map(() => null);
  let sourceGenerationMs = Date.now() - sourceGenerationStartedAt;
  const generation = sourceGenerations[0] || null;
  const catalogVersion = _coreQueryGetCatalogVersion_(
    authorization,
    catalogDiagnostics,
    catalogSourcesForGeneration.length ? sourceGenerations.slice(1) : null
  );
  const authFingerprint = _coreQueryAuthorizationFingerprint_(
    authorization, validated, catalogVersion, scopeRelations
  );
  const requestedCacheSeconds = options.cacheSeconds === undefined ? 60 : Number(options.cacheSeconds);
  if (!Number.isInteger(requestedCacheSeconds) || requestedCacheSeconds < 0 || requestedCacheSeconds > 21600) {
    throw new Error('SUNARP Core: cacheSeconds debe ser un entero entre 0 y 21600.');
  }
  // Las ediciones directas en Sheets/IMPORTRANGE no publican una generación Core.
  // Por eso las consultas derivadas tienen una vigencia máxima de 60 s aunque
  // el consumidor solicite una caché más larga. Las escrituras Core invalidan
  // inmediatamente mediante generaciones; el TTL limita cambios externos.
  const cacheSeconds = Math.min(requestedCacheSeconds, 60);
  const requestedCandidateCacheSeconds = options.candidateCacheSeconds === undefined
    ? requestedCacheSeconds
    : Number(options.candidateCacheSeconds);
  if (!Number.isInteger(requestedCandidateCacheSeconds) ||
      requestedCandidateCacheSeconds < 0 || requestedCandidateCacheSeconds > 21600) {
    throw new Error('SUNARP Core: candidateCacheSeconds debe ser un entero entre 0 y 21600.');
  }
  const candidateCacheSeconds = Math.min(requestedCandidateCacheSeconds, 60);
  const querySession = options.querySession &&
    typeof options.querySession === 'object' &&
    !Array.isArray(options.querySession)
    ? options.querySession
    : null;
  // Para ámbitos no globales, la caché persistente exige generaciones de todos
  // los catálogos. La sesión de una carga paginada puede reutilizar la huella
  // completa de esta misma ejecución sin compartir datos entre solicitudes.
  const catalogCacheSafe = validated.totalOnly || Boolean(catalogVersion);
  const snapshotCacheDisabledReason = !generation
    ? 'source-generation-unavailable'
    : cacheSeconds < 1
      ? 'cache-disabled'
      : !catalogCacheSafe
        ? 'catalog-generation-unavailable'
        : '';
  const cacheKey = generation && cacheSeconds > 0 && catalogCacheSafe
    ? _coreQueryCacheKey_(source, generation, authFingerprint, descriptor)
    : null;

  const projectionFields = _coreQueryBuildProjectionFields_(
    idField, sortBy, distinctBy, groups, searchFields, searchAny,
    distinctFields, distinctCountFields, scopeRelations, authorization
  );
  const requiredHeaders = projectionFields.slice();
  const optionalScopeFields = _coreQueryBuildOptionalScopeFields_(authorization);
  const candidateProjectionFields = Array.from(new Set(
    projectionFields.concat(optionalScopeFields)
  ));
  _coreQueryAssertHeaders_(source, requiredHeaders);

  // El permiso se comprueba antes de cualquier lectura de caché. Los resultados
  // finales quedan aislados por identidad, permiso, ámbito y versión de catálogo.
  if (cacheKey && !querySession) {
    const cached = getCachedValue(cacheKey);
    if (cached && cached.version === 2 && Array.isArray(cached.records)) {
      const cacheResult = Object.assign({}, cached, {
        cacheHit: true,
        sourceGenerationMs,
        durationMs: Date.now() - queryStartedAt
      });
      console.log('[SUNARP Core] Consulta autorizada: resultado en caché', {
        sheet: (source && (source.sheetName || source.label)) || 'fuente',
        durationMs: cacheResult.durationMs,
        total: cacheResult.total,
        offset: cacheResult.offset,
        limit: cacheResult.limit
      });
      return cacheResult;
    }
  }

  // Instantánea autorizada compartida entre páginas. Offset/limit no forman
  // parte de la clave: el conjunto completo, ya filtrado, ordenado y autorizado,
  // se reutiliza. La huella incluye identidad, permiso, ámbitos y catálogos.
  const authorizedSnapshotDescriptor = {
    groups, search, searchFields, searchAny, sortBy, sortDirection,
    idField, distinctBy, distinctFields, distinctCountFields,
    schemaVersion: descriptor.schemaVersion
  };
  const authorizedSnapshotKey = generation && cacheSeconds > 0 && catalogCacheSafe
    ? _coreQueryAuthorizedSnapshotCacheKey_(
        source, generation, authFingerprint, authorizedSnapshotDescriptor
      )
    : null;
  const querySessionKey = querySession && generation
    ? 'query-session-snapshot:v1:' + _coreQueryDigest_({
        source: _coreBuildSourceCacheKey_(source, 'query-session-snapshot'),
        generation,
        authorizationFingerprint: authFingerprint,
        query: authorizedSnapshotDescriptor
      })
    : null;
  const authorizedSnapshot = authorizedSnapshotKey
    ? getCachedValue(authorizedSnapshotKey)
    : null;
  const sessionSnapshot = querySessionKey &&
    Object.prototype.hasOwnProperty.call(querySession, querySessionKey)
    ? querySession[querySessionKey]
    : null;
  const snapshotIsComplete = snapshot => {
    const snapshotTotal = Number(snapshot && snapshot.total);
    return Boolean(
      snapshot &&
      snapshot.version === 1 &&
      Array.isArray(snapshot.records) &&
      Number.isFinite(snapshotTotal) &&
      snapshotTotal >= 0 &&
      snapshot.records.length >= snapshotTotal &&
      snapshot.distinctValues &&
      snapshot.distinctCounts
    );
  };
  const persistentSnapshotUsable = snapshotIsComplete(authorizedSnapshot);
  const sessionSnapshotUsable = !persistentSnapshotUsable &&
    snapshotIsComplete(sessionSnapshot);
  const reusableSnapshot = persistentSnapshotUsable
    ? authorizedSnapshot
    : sessionSnapshotUsable
      ? sessionSnapshot
      : null;
  if (persistentSnapshotUsable && querySession && querySessionKey) {
    try {
      querySession[querySessionKey] = authorizedSnapshot;
    } catch (error) {
      console.warn('[SUNARP Core] No se pudo conservar la instantánea persistente en sesión:', error.message);
    }
  }
  if (reusableSnapshot) {
    const snapshotHitFromCache = persistentSnapshotUsable;
    const snapshotHitFromSession = !snapshotHitFromCache;
    const snapshotContext = typeof _coreOpenSource_ === 'function'
      ? _coreOpenSource_(source)
      : null;
    const selectedSnapshotPage = reusableSnapshot.records.slice(offset, offset + limit);
    const snapshotPage = _coreQueryHydratePage_(
      source, selectedSnapshotPage, snapshotContext
    );
    if (generation) {
      const verificationStartedAt = Date.now();
      const currentGeneration = _coreGetSourceGeneration_(source);
      sourceGenerationMs += Date.now() - verificationStartedAt;
      if (currentGeneration !== generation) {
        throw new Error('SUNARP Core: la fuente cambió durante la consulta; vuelve a solicitar la página.');
      }
    }
    const snapshotResult = {
      version: 2,
      records: snapshotPage,
      total: reusableSnapshot.total,
      offset,
      limit,
      distinctValues: reusableSnapshot.distinctValues,
      distinctCounts: reusableSnapshot.distinctCounts,
      hasMore: offset + snapshotPage.length < reusableSnapshot.total,
      cacheHit: false,
      authorizedSnapshotCacheHit: snapshotHitFromCache,
      authorizedSnapshotSessionHit: snapshotHitFromSession,
      authorizedSnapshotCacheEligible: Boolean(authorizedSnapshotKey),
      authorizedSnapshotCacheDisabledReason: snapshotCacheDisabledReason,
      catalogGenerationMissingSource: catalogDiagnostics.missingSource || '',
      sourceGenerationMs,
      candidateCacheHit: true,
      candidateCount: reusableSnapshot.candidateCount,
      authorizedCount: reusableSnapshot.authorizedCount,
      retainedForPage: reusableSnapshot.records.length,
      projectedFieldCount: reusableSnapshot.projectedFieldCount,
      hydratedRowCount: snapshotPage.length,
      durationMs: Date.now() - queryStartedAt
    };
    if (cacheKey) {
      try { putCachedValue(cacheKey, snapshotResult, cacheSeconds); } catch (error) {
        console.warn('[SUNARP Core] No se pudo almacenar el resultado de consulta:', error.message);
      }
    }
    console.log('[SUNARP Core] Instantánea autorizada reutilizada:', {
      sheet: (source && (source.sheetName || source.label)) || 'fuente',
      authorizedSnapshotCacheHit: snapshotHitFromCache,
      authorizedSnapshotSessionHit: snapshotHitFromSession,
      authorizedSnapshotCacheEligible: Boolean(authorizedSnapshotKey),
      authorizedSnapshotCacheDisabledReason: snapshotCacheDisabledReason,
      catalogGenerationMissingSource: catalogDiagnostics.missingSource || '',
      sourceGenerationMs,
      candidateCount: snapshotResult.candidateCount,
      authorizedCount: snapshotResult.authorizedCount,
      hydratedRowCount: snapshotResult.hydratedRowCount,
      offset,
      limit,
      durationMs: snapshotResult.durationMs
    });
    return snapshotResult;
  }

  // La caché de candidatos contiene filas aún no autorizadas y nunca se entrega
  // directamente: en el primer uso de cada instantánea se aplica el ámbito vigente.
  const candidateCacheKey = generation && candidateCacheSeconds > 0
    ? _coreQueryCandidateCacheKey_(
        source, generation, idField, descriptor.schemaVersion, groups
      )
    : null;
  const cachedCandidateEntry = candidateCacheKey
    ? getCachedValue(candidateCacheKey)
    : null;
  const candidateCacheCompatible = Boolean(
    cachedCandidateEntry &&
    cachedCandidateEntry.version === 3 &&
    Array.isArray(cachedCandidateEntry.candidates) &&
    Array.isArray(cachedCandidateEntry.requestedFields) &&
    Array.isArray(cachedCandidateEntry.projectedFields) &&
    candidateProjectionFields.every(field =>
      cachedCandidateEntry.requestedFields.includes(field)
    )
  );
  let candidateRows = candidateCacheCompatible
    ? cachedCandidateEntry.candidates
    : null;
  const candidateCacheHit = Array.isArray(candidateRows);
  let candidateContext = null;
  let projectedFieldCount = candidateCacheHit
    ? cachedCandidateEntry.projectedFields.length
    : projectionFields.length;
  let actualCandidateProjectedFields = candidateCacheHit
    ? cachedCandidateEntry.projectedFields.slice()
    : null;

  if (!candidateCacheHit) {
    if (typeof _coreOpenSource_ === 'function') {
      const loaded = _coreQueryLoadCandidateRows_(
        source, groups, requiredHeaders, projectionFields, idField, optionalScopeFields
      );
      candidateRows = loaded.candidates;
      candidateContext = loaded.context;
      actualCandidateProjectedFields = Array.isArray(loaded.projectedFields)
        ? loaded.projectedFields.slice()
        : projectionFields.slice();
      projectedFieldCount = actualCandidateProjectedFields.length;
    } else {
      // Adaptador de prueba: devuelve objetos completos; se registra la proyección
      // solicitada para comprobar la compatibilidad al reutilizar candidatos.
      const candidateMap = new Map();
      groups.forEach(group => {
        const searchField = _coreQueryGetCandidateSearchField_(group);
        if (!searchField) return;
        const result = findRecordsByFields(source, group, {
          requiredHeaders,
          searchField
        });
        (result.records || []).forEach(record => {
          const id = String(record[idField] === null || record[idField] === undefined ? '' : record[idField]).trim();
          if (id && !candidateMap.has(id)) candidateMap.set(id, { rowNumber: null, record });
        });
      });
      candidateRows = Array.from(candidateMap.values());
      actualCandidateProjectedFields = candidateProjectionFields.slice();
    }
    if (candidateCacheKey) {
      try {
        const storedCandidates = putCachedValue(candidateCacheKey, {
          version: 3,
          requestedFields: candidateProjectionFields.slice(),
          projectedFields: actualCandidateProjectedFields.slice(),
          candidates: candidateRows
        }, candidateCacheSeconds);
        if (!storedCandidates || storedCandidates.success !== true) {
          console.warn('[SUNARP Core] Caché de candidatos no almacenada:', {
            reason: storedCandidates && storedCandidates.reason || 'unknown',
            candidateCount: candidateRows.length,
            sizeBytes: storedCandidates && storedCandidates.sizeBytes,
            compressedBytes: storedCandidates && storedCandidates.compressedBytes,
            chunkCount: storedCandidates && storedCandidates.chunkCount
          });
        }
      } catch (error) {
        console.warn('[SUNARP Core] No se pudo almacenar la caché de candidatos:', error.message);
      }
    }
  } else if (typeof _coreOpenSource_ === 'function') {
    candidateContext = _coreOpenSource_(source);
  }

  // Para que las páginas posteriores no vuelvan a recorrer y autorizar todos
  // los candidatos, la instantánea conserva el conjunto autorizado completo.
  // La caché fragmentada limita el tamaño; si no cabe, se devuelve el resultado
  // seguro de esta petición y la siguiente vuelve a calcularlo.
  const maxRetainedRecords = candidateRows.length;
  const pageCandidates = [];
  const boundedDistinctPage = Boolean(distinctBy && distinctBy === sortBy);
  const distinctPageRecords = boundedDistinctPage ? [] : null;
  const retainedDistinctByValue = boundedDistinctPage ? new Map() : null;
  const seenDistinctValues = distinctBy ? new Set() : null;
  let distinctTotal = 0;
  const distinctRecords = distinctBy && !boundedDistinctPage ? new Map() : null;
  const distinctValueSets = {};
  const distinctCountSets = {};
  distinctFields.forEach(field => { distinctValueSets[field] = new Set(); });
  distinctCountFields.forEach(field => { distinctCountSets[field] = new Set(); });
  let authorizedCount = 0;
  // Core v13 prepara el evaluador una sola vez por lote. El fallback conserva
  // compatibilidad temporal con consumidores que aún ejecutan Core v12.
  const isRecordInScope = validated.totalOnly
    ? null
    : (typeof _coreAuthCreateRecordScopeChecker_ === 'function'
      ? _coreAuthCreateRecordScopeChecker_(
          validated.context,
          validated.moduleId,
          authorization.structures || [],
          authorization.fields || {},
          authorization.locals || []
        )
      : record => authorizationIsRecordInScope(
          validated.context,
          validated.moduleId,
          record,
          authorization.structures || [],
          authorization.fields || {},
          authorization.locals || []
        ));

  candidateRows.forEach(candidate => {
    const record = _coreQueryRecordValue_(candidate);
    if (!groups.some(group => _coreQueryMatchesGroup_(record, group))) return;
    if (!_coreQueryMatchesSearch_(record, search, searchFields, searchAny)) return;
    const id = String(record[idField] === null || record[idField] === undefined ? '' : record[idField]).trim();
    if (!id) return;
    const scopeRecord = Object.assign(
      {}, record, scopeRelations.scopeRecordById[id] || {}
    );
    let relationConsistent = true;
    scopeRelations.scopeRecordLookups.forEach(lookup => {
      const lookupId = String(record[lookup.recordField] === null ||
        record[lookup.recordField] === undefined ? '' : record[lookup.recordField]).trim();
      const related = lookupId ? lookup.values[lookupId] : null;
      const hasRelated = Boolean(related);
      if (lookupId && !hasRelated && lookup.required) {
        relationConsistent = false;
        return;
      }
      if (hasRelated) {
        const inconsistent = lookup.requireEqualFields.some(field => {
          const actual = record[field];
          const expected = related[field];
          const actualText = String(actual === null || actual === undefined ? '' : actual).trim();
          const expectedText = String(expected === null || expected === undefined ? '' : expected).trim();
          return actualText && expectedText && actualText !== expectedText;
        });
        if (inconsistent) {
          relationConsistent = false;
          return;
        }
        Object.assign(scopeRecord, related);
      }
    });
    if (!relationConsistent) return;
    if (!validated.totalOnly && !isRecordInScope(scopeRecord)) return;

    authorizedCount++;
    distinctFields.forEach(field => {
      const value = String(record[field] === null || record[field] === undefined
        ? '' : record[field]).trim();
      if (value) distinctValueSets[field].add(value);
    });
    distinctCountFields.forEach(field => {
      const value = String(record[field] === null || record[field] === undefined
        ? '' : record[field]).trim();
      if (value) distinctCountSets[field].add(value);
    });

    if (distinctBy) {
      const value = String(record[distinctBy] === null || record[distinctBy] === undefined
        ? '' : record[distinctBy]).trim();
      if (!value) return;
      if (!seenDistinctValues.has(value)) {
        seenDistinctValues.add(value);
        distinctTotal++;
      }
      if (boundedDistinctPage) {
        _coreQueryInsertDistinctPageRecord_(
          distinctPageRecords,
          retainedDistinctByValue,
          candidate,
          value,
          sortBy,
          idField,
          sortDirection,
          maxRetainedRecords
        );
      } else {
        const previous = distinctRecords.get(value);
        if (!previous || _coreQueryCompareRecords_(
          candidate, previous, sortBy, idField, sortDirection
        ) < 0) {
          distinctRecords.set(value, candidate);
        }
      }
    } else {
      _coreQueryInsertPageRecord_(
        pageCandidates, candidate, sortBy, idField,
        sortDirection, maxRetainedRecords
      );
    }
  });

  const distinctValues = {};
  distinctFields.forEach(field => {
    distinctValues[field] = Array.from(distinctValueSets[field]).sort(_coreCompareValues_);
  });
  const distinctCounts = {};
  distinctCountFields.forEach(field => {
    distinctCounts[field] = distinctCountSets[field].size;
  });

  let total = authorizedCount;
  let pageSource = pageCandidates;
  if (distinctBy) {
    if (boundedDistinctPage) {
      pageSource = distinctPageRecords;
      total = distinctTotal;
    } else {
      pageSource = Array.from(distinctRecords.values()).sort((a, b) =>
        _coreQueryCompareRecords_(a, b, sortBy, idField, sortDirection)
      );
      total = distinctRecords.size;
    }
  }
  const selectedPage = pageSource.slice(offset, offset + limit);
  const page = _coreQueryHydratePage_(source, selectedPage, candidateContext);
  if (generation) {
    const verificationStartedAt = Date.now();
    const currentGeneration = _coreGetSourceGeneration_(source);
    sourceGenerationMs += Date.now() - verificationStartedAt;
    if (currentGeneration !== generation) {
      throw new Error('SUNARP Core: la fuente cambió durante la consulta; vuelve a solicitar la página.');
    }
  }
  const snapshotValue = {
    version: 1,
    records: pageSource,
    total,
    distinctValues,
    distinctCounts,
    candidateCount: candidateRows.length,
    authorizedCount,
    projectedFieldCount
  };
  // Esta caché vive únicamente dentro de la ejecución que comparte el objeto
  // querySession. No cruza solicitudes y su clave incluye identidad, permiso,
  // ámbitos, relaciones y generación de la fuente.
  if (querySession && querySessionKey) {
    try {
      querySession[querySessionKey] = snapshotValue;
    } catch (error) {
      console.warn('[SUNARP Core] No se pudo conservar la instantánea de sesión:', error.message);
    }
  }
  if (authorizedSnapshotKey) {
    try {
      const storedSnapshot = putCachedValue(
        authorizedSnapshotKey, snapshotValue, cacheSeconds
      );
      if (!storedSnapshot || storedSnapshot.success !== true) {
        console.warn('[SUNARP Core] Instantánea autorizada no almacenada:', {
          reason: storedSnapshot && storedSnapshot.reason || 'unknown',
          candidateCount: candidateRows.length,
          authorizedCount,
          cacheEligible: Boolean(authorizedSnapshotKey),
          cacheDisabledReason: snapshotCacheDisabledReason,
          catalogGenerationMissingSource: catalogDiagnostics.missingSource || '',
          sizeBytes: storedSnapshot && storedSnapshot.sizeBytes,
          compressedBytes: storedSnapshot && storedSnapshot.compressedBytes,
          chunkCount: storedSnapshot && storedSnapshot.chunkCount
        });
      }
    } catch (error) {
      console.warn('[SUNARP Core] No se pudo almacenar la instantánea autorizada:', error.message);
    }
  }
  const result = {
    version: 2, records: page, total, offset, limit,
    distinctValues, distinctCounts,
    hasMore: offset + page.length < total,
    cacheHit: false,
    authorizedSnapshotCacheHit: false,
    authorizedSnapshotSessionHit: false,
    authorizedSnapshotCacheEligible: Boolean(authorizedSnapshotKey),
    authorizedSnapshotCacheDisabledReason: snapshotCacheDisabledReason,
    catalogGenerationMissingSource: catalogDiagnostics.missingSource || '',
    sourceGenerationMs,
    candidateCacheHit,
    candidateCount: candidateRows.length,
    authorizedCount,
    retainedForPage: pageSource.length,
    projectedFieldCount,
    hydratedRowCount: page.length,
    durationMs: Date.now() - queryStartedAt
  };
  if (cacheKey) {
    try {
      putCachedValue(cacheKey, result, cacheSeconds);
    } catch (error) {
      console.warn('[SUNARP Core] No se pudo almacenar el resultado de consulta:', error.message);
    }
  }
  console.log('[SUNARP Core] Consulta autorizada:', {
    sheet: (source && (source.sheetName || source.label)) || 'fuente',
    candidateCacheHit,
    authorizedSnapshotCacheHit: result.authorizedSnapshotCacheHit,
    authorizedSnapshotSessionHit: result.authorizedSnapshotSessionHit,
    authorizedSnapshotCacheEligible: result.authorizedSnapshotCacheEligible,
    authorizedSnapshotCacheDisabledReason: result.authorizedSnapshotCacheDisabledReason,
    catalogGenerationMissingSource: result.catalogGenerationMissingSource,
    sourceGenerationMs,
    candidateCount: result.candidateCount,
    authorizedCount,
    retainedForPage: result.retainedForPage,
    projectedFieldCount: result.projectedFieldCount,
    hydratedRowCount: result.hydratedRowCount,
    total,
    offset,
    limit,
    durationMs: result.durationMs
  });
  return result;
}


/**
 * Localiza filas candidatas con TextFinder y recupera únicamente las columnas
 * necesarias, agrupando filas cercanas para reducir llamadas a Sheets.
 */
function _coreQueryLoadCandidateRows_(source, groups, requiredHeaders, projectionFields, idField, optionalProjectionFields) {
  const context = _coreOpenSource_(source);
  const config = context.config;
  const sheet = context.sheet;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn || lastRow < config.headerRow) {
    throw new Error('SUNARP Core: la fuente no contiene encabezados.');
  }
  const headers = sheet.getRange(config.headerRow, 1, 1, lastColumn)
    .getDisplayValues()[0].map(value => String(value).trim());
  const headerMap = {};
  headers.forEach((header, index) => {
    if (!header || Object.prototype.hasOwnProperty.call(headerMap, header)) {
      throw new Error('SUNARP Core: existen encabezados vacíos o duplicados en "' + config.sheetName + '".');
    }
    headerMap[header] = index;
  });
  const required = Array.from(new Set(requiredHeaders.concat(projectionFields)));
  const missing = required.filter(field => !Object.prototype.hasOwnProperty.call(headerMap, field));
  if (missing.length) {
    throw new Error('SUNARP Core: la fuente "' + config.sheetName +
      '" no contiene las columnas requeridas: ' + missing.join(', ') + '.');
  }
  const actualProjectionFields = Array.from(new Set(
    projectionFields.concat((optionalProjectionFields || []).filter(field =>
      Object.prototype.hasOwnProperty.call(headerMap, field)
    ))
  ));
  const dataStartRow = config.headerRow + 1;
  const dataRows = Math.max(0, lastRow - config.headerRow);
  if (!dataRows) {
    return { context, candidates: [], projectedFields: actualProjectionFields };
  }

  const candidateRowNumbers = new Set();
  groups.forEach(group => {
    const searchField = _coreQueryGetCandidateSearchField_(group);
    if (!searchField) return;
    const expectedValues = Array.isArray(group[searchField]) ? group[searchField] : [group[searchField]];
    const range = sheet.getRange(dataStartRow, headerMap[searchField] + 1, dataRows, 1);
    const escapeRegex = value => String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    for (let index = 0; index < expectedValues.length; index += 100) {
      const batch = expectedValues.slice(index, index + 100).map(escapeRegex);
      range.createTextFinder('^(?:' + batch.join('|') + ')$')
        .useRegularExpression(true)
        .matchEntireCell(true)
        .matchCase(false)
        .findAll()
        .forEach(cell => candidateRowNumbers.add(cell.getRow()));
    }
  });

  const rowNumbers = Array.from(candidateRowNumbers).sort((a, b) => a - b);
  if (!rowNumbers.length) {
    return { context, candidates: [], projectedFields: actualProjectionFields };
  }
  const columns = actualProjectionFields.map(field => ({ field, index: headerMap[field] }))
    .sort((a, b) => a.index - b.index);
  const blocks = [];
  columns.forEach(column => {
    const previous = blocks[blocks.length - 1];
    if (previous && column.index === previous.end + 1) {
      previous.end = column.index;
      previous.fields.push(column);
    } else {
      blocks.push({ start: column.index, end: column.index, fields: [column] });
    }
  });

  // Leer bloques amplios reduce llamadas a SpreadsheetApp cuando el ámbito
  // autorizado incluye miles de candidatos. La proyección sigue limitada a
  // las columnas necesarias y la autorización se evalúa registro por registro.
  const windowSize = 500;
  const windows = new Map();
  rowNumbers.forEach(rowNumber => {
    const startRow = dataStartRow + Math.floor((rowNumber - dataStartRow) / windowSize) * windowSize;
    if (!windows.has(startRow)) windows.set(startRow, []);
    windows.get(startRow).push(rowNumber);
  });
  const byId = new Map();
  windows.forEach((windowRows, startRow) => {
    const endRow = Math.min(lastRow, startRow + windowSize - 1, Math.max.apply(null, windowRows));
    const count = endRow - startRow + 1;
    const projectedBlocks = blocks.map(block => ({
      block,
      values: sheet.getRange(startRow, block.start + 1, count, block.end - block.start + 1).getValues()
    }));
    windowRows.forEach(rowNumber => {
      const offset = rowNumber - startRow;
      const record = {};
      projectedBlocks.forEach(item => item.block.fields.forEach(column => {
        record[column.field] = item.values[offset][column.index - item.block.start];
      }));
      const id = String(record[idField] === null || record[idField] === undefined ? '' : record[idField]).trim();
      if (id && !byId.has(id)) byId.set(id, { rowNumber, record });
    });
  });
  return {
    context,
    candidates: Array.from(byId.values()),
    projectedFields: actualProjectionFields
  };
}

function _coreQueryRecordValue_(candidate) {
  return candidate && candidate.record ? candidate.record : candidate;
}

/** Recupera el ancho completo exclusivamente para las filas de la página final. */
function _coreQueryProjectionValueMatches_(actual, expected) {
  if (actual instanceof Date || expected instanceof Date) {
    const actualTime = actual instanceof Date ? actual.getTime() : Date.parse(actual);
    const expectedTime = expected instanceof Date ? expected.getTime() : Date.parse(expected);
    return Number.isFinite(actualTime) && Number.isFinite(expectedTime) &&
      actualTime === expectedTime;
  }
  return _coreValuesEqual_(actual, expected);
}

function _coreQueryHydratePage_(source, candidates, context) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  if (!candidates.every(item => item && Number.isInteger(item.rowNumber))) {
    return candidates.map(item => _coreQueryRecordValue_(item));
  }
  context = context || _coreOpenSource_(source);
  const sheet = context.sheet;
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(context.config.headerRow, 1, 1, lastColumn)
    .getDisplayValues()[0].map(value => String(value).trim());
  const rowNumbers = candidates.map(item => item.rowNumber);
  const valuesByNumber = _coreReadCandidateRows_(
    sheet, rowNumbers, lastColumn, context.config.headerRow + 1, 500
  );
  return candidates.map(candidate => {
    const values = valuesByNumber.get(candidate.rowNumber);
    if (!values) {
      throw new Error('SUNARP Core: la fuente cambió durante la consulta; vuelve a solicitar la página.');
    }

    const hydratedRecord = _coreRowToRecord_(headers, values);
    const projectedRecord = _coreQueryRecordValue_(candidate);
    const projectionStillMatches = Object.keys(projectedRecord).every(field =>
      Object.prototype.hasOwnProperty.call(hydratedRecord, field) &&
      _coreQueryProjectionValueMatches_(hydratedRecord[field], projectedRecord[field])
    );
    if (!projectionStillMatches) {
      throw new Error(
        'SUNARP Core: la fuente cambió durante la consulta; vuelve a solicitar la página.'
      );
    }
    return hydratedRecord;
  });
}

/** Determina las columnas necesarias para evaluar la consulta y su ámbito. */
function _coreQueryBuildProjectionFields_(
  idField, sortBy, distinctBy, groups, searchFields, searchAny,
  distinctFields, distinctCountFields, scopeRelations, authorization
) {
  const fields = new Set([idField, sortBy, distinctBy].filter(Boolean));
  groups.forEach(group => Object.keys(group).forEach(field => fields.add(field)));
  searchFields.forEach(field => fields.add(field));
  searchAny.forEach(match => fields.add(match.field));
  distinctFields.forEach(field => fields.add(field));
  distinctCountFields.forEach(field => fields.add(field));
  scopeRelations.scopeRecordLookups.forEach(lookup => {
    fields.add(lookup.recordField);
    lookup.requireEqualFields.forEach(field => fields.add(field));
  });
  return Array.from(fields);
}

/**
 * Los campos organizacionales directos son opcionales en la fuente base:
 * pueden venir de lookups declarados y no de columnas de negocio.
 * Si existen como columnas, se proyectan para autorización.
 */
function _coreQueryBuildOptionalScopeFields_(authorization) {
  const scopeFields = Object.assign({
    recordOrganizationStructureId: 'estructura_org_id',
    recordStructureId: 'estructura_id',
    recordLocalId: 'local_id',
    recordSiteId: 'sede_id'
  }, authorization.fields || {});
  return Array.from(new Set([
    scopeFields.recordOrganizationStructureId,
    scopeFields.recordStructureId,
    scopeFields.recordLocalId,
    scopeFields.recordSiteId
  ].filter(field => typeof field === 'string' && field.trim())));
}
