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
  const groups = alternatives.map(group => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      throw new Error('SUNARP Core: cada grupo anyOf debe ser un objeto.');
    }
    const merged = Object.assign({}, base, group);
    if (!Object.keys(merged).length) {
      throw new Error('SUNARP Core: la consulta autorizada requiere filtros exactos.');
    }
    return merged;
  });
  return groups;
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
  const totalOnly = access.scopes.every(scope =>
    String(scope.tipo_ambito_id || scope.tipo_ambito || '').trim().toUpperCase() === 'TOTAL'
  );
  if (!totalOnly && (!Array.isArray(authorization.structures) || !Array.isArray(authorization.locals))) {
    throw new Error('SUNARP Core: faltan los catálogos organizacionales requeridos para comprobar los ámbitos.');
  }
  return { context, moduleId, permissionCode, access, totalOnly };
}

function _coreQueryAuthorizationFingerprint_(authorization, validated, catalogVersion) {
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
    catalogVersion: catalogVersion || ''
  });
}

function _coreQueryGetCatalogVersion_(authorization) {
  if (authorization.catalogVersion) return String(authorization.catalogVersion);
  const sources = authorization.catalogSources;
  if (!Array.isArray(sources) || !sources.length ||
      typeof _coreGetSourceGeneration_ !== 'function') return null;
  const generations = [];
  for (let i = 0; i < sources.length; i++) {
    const generation = _coreGetSourceGeneration_(sources[i]);
    if (!generation) return null;
    generations.push(generation);
  }
  return _coreQueryDigest_(generations);
}

function _coreQueryMatchesSearch_(record, search, fields) {
  if (!search) return true;
  const expected = typeof _coreNormalizeSearchText_ === 'function'
    ? _coreNormalizeSearchText_(search)
    : String(search).toLocaleLowerCase();
  return fields.some(field => {
    const value = record[field];
    const actual = typeof _coreNormalizeSearchText_ === 'function'
      ? _coreNormalizeSearchText_(value)
      : String(value === null || value === undefined ? '' : value).toLocaleLowerCase();
    return actual.includes(expected);
  });
}

function _coreQueryMatchesGroup_(record, group) {
  return Object.keys(group).every(field => {
    const expected = Array.isArray(group[field]) ? group[field] : [group[field]];
    return expected.some(value => _coreValuesEqual_(record[field], value));
  });
}

function _coreQueryCacheKey_(source, generation, authorizationFingerprint, query) {
  const digest = _coreQueryDigest_({
    source: _coreBuildSourceCacheKey_(source, 'query'),
    generation,
    authorizationFingerprint,
    query
  });
  return 'query-result:v1:' + digest;
}

/**
 * Ejecuta una consulta exacta, autorizada y paginada en el servidor.
 * El permiso se valida antes de consultar la caché y el ámbito se aplica
 * a cada candidato antes de calcular el total y la página.
 */
function queryRecords(source, options) {
  options = options || {};
  const authorization = options.authorization;
  const validated = _coreQueryValidateAuthorization_(authorization);
  const groups = _coreQueryNormalizeGroups_(options);
  const idField = String(options.idField || '').trim();
  if (!idField) throw new Error('SUNARP Core: queryRecords requiere idField.');

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
  if (!Array.isArray(searchFields) || (search && !searchFields.length)) {
    throw new Error('SUNARP Core: searchFields debe ser un arreglo no vacío cuando se indica search.');
  }

  const descriptor = {
    groups, search, searchFields, sortBy, sortDirection, offset, limit, idField,
    schemaVersion: String(options.schemaVersion || '1')
  };
  const catalogVersion = _coreQueryGetCatalogVersion_(authorization);
  const authFingerprint = _coreQueryAuthorizationFingerprint_(authorization, validated, catalogVersion);
  const cacheSeconds = options.cacheSeconds === undefined ? 60 : Number(options.cacheSeconds);
  if (!Number.isInteger(cacheSeconds) || cacheSeconds < 0 || cacheSeconds > 21600) {
    throw new Error('SUNARP Core: cacheSeconds debe ser un entero entre 0 y 21600.');
  }
  const generation = typeof _coreGetSourceGeneration_ === 'function'
    ? _coreGetSourceGeneration_(source)
    : null;
  // Para ámbitos no globales, el consumidor debe suministrar una versión
  // verificable de los catálogos para no reutilizar permisos con jerarquía obsoleta.
  const catalogCacheSafe = validated.totalOnly || Boolean(catalogVersion);
  const cacheKey = generation && cacheSeconds > 0 && catalogCacheSafe
    ? _coreQueryCacheKey_(source, generation, authFingerprint, descriptor)
    : null;

  // El permiso ya fue comprobado. El resultado cacheado está aislado por
  // persona, módulo, permiso, ámbitos, filtros, página y versión de catálogo.
  if (cacheKey) {
    const cached = getCachedValue(cacheKey);
    if (cached && cached.version === 1 && Array.isArray(cached.records)) {
      return Object.assign({}, cached, { cacheHit: true });
    }
  }

  const candidates = new Map();
  groups.forEach(group => {
    const fields = Object.keys(group);
    const result = findRecordsByFields(source, group, {
      requiredHeaders: [idField, sortBy].concat(searchFields),
      searchField: fields[0]
    });
    (result.records || []).forEach(record => {
      const id = String(record[idField] === null || record[idField] === undefined ? '' : record[idField]).trim();
      if (id) candidates.set(id, record);
    });
  });

  const records = [];
  const scopeRecordById = authorization.scopeRecordById || {};
  if (typeof scopeRecordById !== 'object' || Array.isArray(scopeRecordById)) {
    throw new Error('SUNARP Core: scopeRecordById debe ser un objeto indexado por idField.');
  }
  candidates.forEach(record => {
    if (!groups.some(group => _coreQueryMatchesGroup_(record, group))) return;
    if (!_coreQueryMatchesSearch_(record, search, searchFields)) return;
    const id = String(record[idField] === null || record[idField] === undefined ? '' : record[idField]).trim();
    const scopeRecord = Object.assign({}, record, scopeRecordById[id] || {});
    if (!authorizationIsRecordInScope(
      validated.context,
      validated.moduleId,
      scopeRecord,
      authorization.structures || [],
      authorization.fields || {},
      authorization.locals || []
    )) return;
    records.push(record);
  });

  records.sort((a, b) => {
    const compared = _coreCompareValues_(a[sortBy], b[sortBy]) ||
      _coreCompareValues_(a[idField], b[idField]);
    return compared * (sortDirection === 'desc' ? -1 : 1);
  });

  const total = records.length;
  const page = records.slice(offset, offset + limit);
  const result = {
    version: 1, records: page, total, offset, limit,
    hasMore: offset + page.length < total,
    cacheHit: false
  };
  if (cacheKey) {
    try {
      putCachedValue(cacheKey, result, cacheSeconds);
    } catch (error) {
      console.warn('[SUNARP Core] No se pudo almacenar el resultado de consulta:', error.message);
    }
  }
  return result;
}
