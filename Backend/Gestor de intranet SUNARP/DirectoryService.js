/**
 * GESTOR DE INTRANET SUNARP
 * Servicio: Directorio telefónico
 *
 * Modelo operativo:
 * - personas: identidad única.
 * - asignaciones: relación de una persona con cargo, dependencia y local.
 * - servidores datos personales: entidad complementaria cuya clave
 *   servidor_id corresponde a personas.persona_id.
 *
 * Las operaciones CRUD se delegan a SUNARP Core.
 * La autorización, los ámbitos y la auditoría reutilizan
 * los servicios del Gestor de intranet.
 */

const DIRECTORY_SERVICE_CONFIG = Object.freeze({
  sourceKey: 'DIRECTORY',

  sheets: Object.freeze({
    personas: 'personas',
    asignaciones: 'asignaciones',
    datosPersonales: 'servidores datos personales',
    documentTypes: 'tipo_documento_identidad',
    sedes: 'sede',
    tiposLocal: 'tipos_local',
    locales: 'locales',
    tiposEstructura: 'tipos_estructura',
    estructuraOrg: 'estructura_org',
    estructuraLocal: 'estructura_local',
    cargos: 'cargos'
  }),

  ids: Object.freeze({
    persona: Object.freeze({ field: 'persona_id', prefix: 'PER_', digits: 3 }),
    asignacion: Object.freeze({ field: 'asignacion_id', prefix: 'ASG_', digits: 3 })
  })
});

const DIRECTORY_DATA_CACHE_TTL = 300;

const DIRECTORY_REQUIRED_HEADERS = Object.freeze({
  personas: ['persona_id', 'nombres', 'apellidos', 'correo_institucional'],
  datosPersonales: ['servidor_id', 'tipo_documento', 'numero_documento', 'fecha_nacimiento', 'fecha_inicio_servicios', 'fecha_cese'],
  documentTypes: ['id', 'name'],
  asignaciones: [
    'asignacion_id',
    'persona_id',
    'cargo_id',
    'condicion_cargo',
    'anexo',
    'estructura_local_id',
    'local_id',
    'observaciones',
    'active',
    'order'
  ],
  sedes: ['id', 'name'],
  tiposLocal: ['id', 'name'],
  locales: ['id', 'name', 'sede_id', 'tipo_local_id'],
  tiposEstructura: ['id', 'name'],
  estructuraOrg: ['id', 'name', 'parent_id', 'sede_id', 'tipo_estructura_id'],
  estructuraLocal: ['id', 'estructura_id', 'local_id'],
  cargos: ['id', 'name']
});

function _directoryText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _directoryKey_(value) {
  return _directoryText_(value);
}

function _directoryIsActive_(record) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, 'active')) return true;
  const value = record.active;
  if (value === false || value === 0) return false;
  return !['false', '0', 'no', 'inactivo'].includes(String(value).trim().toLowerCase());
}

function _directoryNormalizeBoolean_(value) {
  if (typeof value === 'boolean') return value;
  const normalized = _directoryText_(value).toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error('El estado de la asignación debe ser verdadero o falso.');
}

function _directoryNormalizeInteger_(value, label, optional) {
  if (value === null || value === undefined || _directoryText_(value) === '') {
    if (optional) return '';
    throw new Error(label + ' es obligatorio.');
  }

  const normalized = typeof value === 'number'
    ? value
    : /^\d+$/.test(_directoryText_(value))
      ? Number(value)
      : NaN;

  if (!Number.isSafeInteger(normalized)) {
    throw new Error(label + ' debe ser un número entero.');
  }

  return normalized;
}

function _directoryCreateMap_(records, keyField) {
  const map = new Map();
  (records || []).forEach(record => {
    map.set(_directoryKey_(record[keyField || 'id']), record);
  });
  return map;
}

// Los mapas derivados se construyen una sola vez por contexto de datos.
// Evita reconstruir mapas de cientos de elementos por cada asignación.
const DIRECTORY_CONTEXT_MAPS = new WeakMap();

function _directoryGetContextMaps_(context) {
  let maps = DIRECTORY_CONTEXT_MAPS.get(context);
  if (maps) return maps;

  maps = {
    estructuraLocal: _directoryCreateMap_(context.estructuraLocal),
    locales: _directoryCreateMap_(context.locales),
    estructuraOrg: _directoryCreateMap_(context.estructuraOrg),
    cargos: _directoryCreateMap_(context.cargos),
    sedes: _directoryCreateMap_(context.sedes)
  };

  DIRECTORY_CONTEXT_MAPS.set(context, maps);
  return maps;
}

function _directoryAssertUnique_(records, field, label) {
  const seen = new Set();
  (records || []).forEach(record => {
    const value = _directoryKey_(record[field]);
    if (!value) throw new Error('Existe un registro sin ' + field + ' en ' + label + '.');
    if (seen.has(value)) throw new Error('Se encontró un identificador duplicado en ' + label + ': ' + value + '.');
    seen.add(value);
  });
}

function _directorySource_(sheetName, sourceKey) {
  return getIntranetDataSource(
    sourceKey || DIRECTORY_SERVICE_CONFIG.sourceKey,
    sheetName,
    1
  );
}


/**
 * Localiza el catálogo oficial de tipos de documento.
 * Se busca primero en Global parameters y después en el libro del directorio.
 */
function _directoryResolveDocumentTypesSource_() {
  const sourceKeys = ['MASTER_DATA', DIRECTORY_SERVICE_CONFIG.sourceKey];
  const failures = [];

  for (const sourceKey of sourceKeys) {
    const source = _directorySource_(
      DIRECTORY_SERVICE_CONFIG.sheets.documentTypes,
      sourceKey
    );

    try {
      const info = SUNARPCore.getSourceInfoCached(source, 300);
      const missing = DIRECTORY_REQUIRED_HEADERS.documentTypes.filter(header =>
        !info.headers.includes(header)
      );

      if (missing.length) {
        throw new Error(
          'Faltan encabezados requeridos: ' + missing.join(', ') + '.'
        );
      }

      return source;
    } catch (error) {
      failures.push(sourceKey + ': ' + error.message);
    }
  }

  throw new Error(
    'No se pudo localizar la pestaña "tipo_documento_identidad" en Global parameters ni en Directorios telefónicos. ' +
    failures.join(' | ')
  );
}

function _directoryAuthorizationContext_(permissionCode) {
  const moduleId = 'MOD_INFO_PERSONAL';
  const auth = requirePermission_(
    permissionCode || 'INFORMACION_PERSONAL_VER',
    moduleId
  );
  const catalog = _accessOrgCatalog_();

  return {
    auth: auth,
    moduleId: moduleId,
    structures: catalog.estructuraOrg || [],
    locals: catalog.locales || []
  };
}


function _directoryAssertScope_(authorization, record, actionLabel) {
  const allowed = _accessRecordIsAllowed_(
    authorization.auth,
    'MOD_INFO_PERSONAL',
    record,
    authorization.structures,
    authorization.locals
  );

  if (allowed) return true;

  _accessWriteAudit_(authorization.auth, {
    accion: 'AUTORIZACION_DENEGADA',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: record && record.asignacion_id ? 'ASIGNACION' : 'REGISTRO',
    registro_id: _directoryKey_(
      record && (record.asignacion_id || record.persona_id || record.id)
    ),
    registro_nombre: [
      record && record.nombres,
      record && record.apellidos
    ].map(_directoryText_).filter(Boolean).join(' '),
    resultado: 'DENEGADO',
    detalle: actionLabel || 'El registro se encuentra fuera del ámbito de acceso asignado.'
  });

  throw new Error('No tienes ámbito de acceso para operar sobre este registro.');
}

function _directoryAssertPersonMutationScope_(authorization, person, assignments, context) {
  const linked = (assignments || []).filter(x => _directoryKey_(x.persona_id) === _directoryKey_(person.persona_id));
  if (!linked.length) {
    _directoryAssertScope_(authorization, { persona_id: person.persona_id, nombres: person.nombres, apellidos: person.apellidos },
      'La persona no tiene asignaciones para determinar su ámbito organizacional.');
    return true;
  }
  linked.forEach(assignment => {
    const location = _directoryResolveAssignmentLocation_(assignment, context, false);
    _directoryAssertScope_(authorization, { persona_id: person.persona_id, asignacion_id: assignment.asignacion_id,
      nombres: person.nombres, apellidos: person.apellidos, estructura_id: location.estructura_id, sede_id: location.sede_id, local_id: assignment.local_id },
      'La modificación de la identidad afectaría una asignación fuera del ámbito autorizado.');
  });
}
function _directoryResolveAssignmentLocation_(assignment, context, onlyActive) {
  const relationId = _directoryKey_(assignment && assignment.estructura_local_id);
  const localId = _directoryKey_(assignment && assignment.local_id);
  if (!relationId && !localId) throw new Error('La asignación debe estar vinculada a una unidad orgánica, a un local o a ambos.');
  const maps = _directoryGetContextMaps_(context);
  const relation = relationId ? maps.estructuraLocal.get(relationId) : null;
  const local = localId ? maps.locales.get(localId) : null;
  if (relationId && !relation) throw new Error('La relación estructura_local no existe.');
  if (localId && !local) throw new Error('El local no existe.');
  if (relationId && onlyActive && !_directoryIsActive_(relation)) throw new Error('La relación estructura-local no existe o está inactiva.');
  if (localId && onlyActive && !_directoryIsActive_(local)) throw new Error('El local no existe o está inactivo.');
  if (relation && local && _directoryKey_(relation.local_id) !== localId) throw new Error('El local seleccionado no corresponde a la relación estructura-local.');
  const resolvedLocal = local || (relation ? maps.locales.get(_directoryKey_(relation.local_id)) : null);
  const structure = relation ? maps.estructuraOrg.get(_directoryKey_(relation.estructura_id)) : null;
  if (relation && (!structure || !resolvedLocal)) throw new Error('La relación estructura-local tiene referencias incompletas.');
  if (relation && onlyActive && (!_directoryIsActive_(structure) || !_directoryIsActive_(resolvedLocal))) {
    throw new Error('La estructura o el local de la relación no existe o está inactivo.');
  }
  return { relation, local: resolvedLocal, estructura_id: relation ? _directoryKey_(relation.estructura_id) : '',
    sede_id: relation ? _directoryKey_(structure.sede_id) : (resolvedLocal ? _directoryKey_(resolvedLocal.sede_id) : '') };
}

function _directoryGetStructurePath_(node, structureMap) {
  const parts = [];
  const visited = new Set();
  let current = node;

  while (current) {
    const currentId = _directoryKey_(current.id);
    if (!currentId || visited.has(currentId)) break;

    visited.add(currentId);
    parts.unshift(_directoryText_(current.name));

    const parentId = _directoryKey_(current.parent_id);
    current = parentId ? structureMap.get(parentId) || null : null;
  }

  return parts.filter(Boolean).join(' / ');
}

function _directoryGetStructureOrderPath_(structureId, structureMap) {
  const path = [];
  const visited = new Set();
  let current = structureMap.get(_directoryKey_(structureId));

  while (current) {
    const currentId = _directoryKey_(current.id);
    if (!currentId || visited.has(currentId)) break;

    visited.add(currentId);
    const order = Number(current.order);

    path.unshift({
      order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
      name: _directoryText_(current.name)
    });

    const parentId = _directoryKey_(current.parent_id);
    current = parentId ? structureMap.get(parentId) || null : null;
  }

  return path;
}

function _directoryCompareStructurePaths_(pathA, pathB) {
  const length = Math.min(pathA.length, pathB.length);

  for (let i = 0; i < length; i++) {
    const orderDifference = pathA[i].order - pathB[i].order;
    if (orderDifference !== 0) return orderDifference;

    const nameDifference = pathA[i].name.localeCompare(
      pathB[i].name,
      'es',
      { sensitivity: 'base' }
    );
    if (nameDifference !== 0) return nameDifference;
  }

  return pathA.length - pathB.length;
}

function _directoryCompare_(a, b) {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  return String(a).localeCompare(String(b), 'es', {
    numeric: true,
    sensitivity: 'base'
  });
}

/**
 * Construye la relación estructura_local -> estructura_org + local
 * y añade las denominaciones de los catálogos.
 */
function _directoryBuildRelations_(context, onlyActive) {
  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const localMap = _directoryCreateMap_(context.locales);
  const sedeMap = _directoryCreateMap_(context.sedes);
  const structureTypeMap = _directoryCreateMap_(context.tiposEstructura);
  const localTypeMap = _directoryCreateMap_(context.tiposLocal);
  const structurePathMap = new Map();
  context.estructuraOrg.forEach(node => {
    structurePathMap.set(
      _directoryKey_(node.id),
      _directoryGetStructurePath_(node, structureMap)
    );
  });

  return context.estructuraLocal.map(relation => {
    const structure = structureMap.get(_directoryKey_(relation.estructura_id));
    const local = localMap.get(_directoryKey_(relation.local_id));

    if (!structure || !local) return null;

    const isActive =
      _directoryIsActive_(relation) &&
      _directoryIsActive_(structure) &&
      _directoryIsActive_(local);

    if (onlyActive && !isActive) return null;

    const sede = sedeMap.get(_directoryKey_(structure.sede_id));
    const localSede = sedeMap.get(_directoryKey_(local.sede_id));
    const structureType = structureTypeMap.get(_directoryKey_(structure.tipo_estructura_id));
    const localType = localTypeMap.get(_directoryKey_(local.tipo_local_id));

    const structurePath = structurePathMap.get(_directoryKey_(structure.id)) || [];
    const reference = _directoryText_(relation.referencia);
    const locationLabel = [local.name, reference].filter(Boolean).join(' - ');

    return {
      id: relation.id,
      estructura_id: relation.estructura_id,
      local_id: relation.local_id,
      referencia: reference,
      active: isActive,
      estructura_name: structure.name,
      estructura_path: structurePath,
      tipo_estructura_id: structure.tipo_estructura_id,
      tipo_estructura_name: structureType ? structureType.name : '',
      local_name: local.name,
      tipo_local_id: local.tipo_local_id,
      tipo_local_name: localType ? localType.name : '',
      sede_id: structure.sede_id,
      sede_name: sede ? sede.name : '',
      local_sede_id: local.sede_id,
      local_sede_name: localSede ? localSede.name : '',
      display_name: structurePath + ' — ' + locationLabel
    };
  }).filter(Boolean);
}

function _directoryValidateHeaders_(context) {
  Object.keys(DIRECTORY_REQUIRED_HEADERS).forEach(key => {
    const sheetName = DIRECTORY_SERVICE_CONFIG.sheets[key];
    const info = SUNARPCore.getSourceInfo(_directorySource_(sheetName));
    const missing = DIRECTORY_REQUIRED_HEADERS[key].filter(header =>
      !info.headers.includes(header)
    );

    if (missing.length) {
      throw new Error(
        'La pestaña "' + sheetName + '" no contiene los encabezados requeridos: ' +
        missing.join(', ') + '.'
      );
    }
  });
}

function _directoryValidateSnapshot_(context, options) {
  options = options || {};
  _directoryAssertUnique_(context.personas || [], 'persona_id', 'personas');
  _directoryAssertUnique_(context.asignaciones, 'asignacion_id', 'asignaciones');
  _directoryAssertUnique_(context.documentTypes || [], 'id', 'tipo_documento_identidad');
  const peopleIds = options.includePeople === false
    ? null
    : new Set((context.personas || []).map(x => _directoryKey_(x.persona_id)));
  const cargoIds = new Set(context.cargos.map(x => _directoryKey_(x.id)));
  const localIds = new Set(context.locales.map(x => _directoryKey_(x.id)));
  const structureIds = new Set(context.estructuraOrg.map(x => _directoryKey_(x.id)));
  if (options.includePersonalData !== false) {
    if (options.includePeople === false) {
      throw new Error('No se puede validar la integridad de datos personales sin cargar personas.');
    }
    const personalIds = new Set(), documentKeys = new Set();
    (context.datosPersonales || []).forEach(record => {
      const id = _directoryKey_(record.servidor_id);
      if (!id || !peopleIds.has(id)) throw new Error('La ficha de datos personales referencia una persona inexistente o carece de servidor_id.');
      if (personalIds.has(id)) throw new Error('Existe más de una ficha de datos personales para ' + id + '.');
      personalIds.add(id);
      const type = _directoryText_(record.tipo_documento).replace(/\s+/g, '').toUpperCase();
      const number = _directoryText_(record.numero_documento).replace(/\s+/g, '').toUpperCase();
      if (type && number) { const key = JSON.stringify([type, number]); if (documentKeys.has(key)) throw new Error('Existe un documento de identidad duplicado en datos personales.'); documentKeys.add(key); }
    });
  }
  _directoryAssertUnique_(context.estructuraLocal, 'id', 'estructura_local');
  context.estructuraLocal.forEach(relation => {
    if (!structureIds.has(_directoryKey_(relation.estructura_id))) throw new Error('La relación estructura_local ' + _directoryKey_(relation.id) + ' referencia una estructura orgánica inexistente.');
    if (!localIds.has(_directoryKey_(relation.local_id))) throw new Error('La relación estructura_local ' + _directoryKey_(relation.id) + ' referencia un local inexistente.');
  });
  context.asignaciones.forEach(assignment => {
    const id = _directoryKey_(assignment.asignacion_id);
    if (peopleIds && !peopleIds.has(_directoryKey_(assignment.persona_id))) throw new Error('La asignación ' + id + ' referencia una persona inexistente.');
    if (!cargoIds.has(_directoryKey_(assignment.cargo_id))) throw new Error('La asignación ' + id + ' referencia un cargo inexistente.');
    try { _directoryResolveAssignmentLocation_(assignment, context, false); }
    catch (error) { throw new Error('La asignación ' + id + ': ' + error.message); }
  });
}

function _directoryLoadContextFromSheets_(options) {
  options = options || {};
  const sheetMap = [
    ['personas', 'personas'],
    ['datosPersonales', 'servidores datos personales'],
    ['asignaciones', 'asignaciones'],
    ['sedes', 'sede'],
    ['tiposLocal', 'tipos_local'],
    ['locales', 'locales'],
    ['tiposEstructura', 'tipos_estructura'],
    ['estructuraOrg', 'estructura_org'],
    ['estructuraLocal', 'estructura_local'],
    ['cargos', 'cargos']
  ];

  const selectedSheets = sheetMap.filter(item =>
    !(options.includePersonalData === false && item[0] === 'datosPersonales') &&
    !(options.includePeople === false && item[0] === 'personas')
  );
  const requests = selectedSheets.map(item => ({
    key: item[0],
    source: _directorySource_(item[1]),
    requiredHeaders: DIRECTORY_REQUIRED_HEADERS[item[0]]
  }));

  if (options.includeDocumentTypes !== false) {
    requests.push({
      key: 'documentTypes',
      source: _directoryResolveDocumentTypesSource_(),
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.documentTypes
    });
  }

  // Core agrupa la lectura por libro aunque el catálogo documental
  // se encuentre en Global parameters o en Directorios telefónicos.
  const context = SUNARPCore.listRecordsFromSourcesCached(requests, DIRECTORY_DATA_CACHE_TTL);
  if (!Array.isArray(context.personas)) context.personas = [];
  if (!Array.isArray(context.datosPersonales)) context.datosPersonales = [];

  _directoryValidateSnapshot_(context, options);

  return context;
}

function _directoryLoadContext_(options) {
  const started = Date.now();
  const context = _directoryLoadContextFromSheets_(options);
  console.log('[DirectoryService] Contexto recuperado mediante caché central de SUNARP Core:', Date.now() - started, 'ms.');
  return context;
}

function _directoryInvalidateCache_() {
  const sheetNames = Object.values(DIRECTORY_SERVICE_CONFIG.sheets)
    .filter(sheetName => sheetName !== DIRECTORY_SERVICE_CONFIG.sheets.documentTypes);
  const sources = sheetNames.map(sheetName => _directorySource_(sheetName));
  sources.push(_directoryResolveDocumentTypesSource_());
  const results = sources.map(source => SUNARPCore.invalidateSourceCache(source));
  return {
    success: results.every(result => result && result.success !== false),
    sources: results.length
  };
}


function _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap) {
  const location = _directoryResolveAssignmentLocation_(assignment, context, false);
  const maps = _directoryGetContextMaps_(context);
  const relation = location.relation
    ? relationMap.get(_directoryKey_(location.relation.id))
    : null;
  const local = location.local;
  const person = peopleMap.get(_directoryKey_(assignment.persona_id));
  const cargo = maps.cargos.get(_directoryKey_(assignment.cargo_id));
  const sede = maps.sedes.get(_directoryKey_(location.sede_id));

  return Object.assign({}, assignment, {
    nombres: person ? person.nombres : '',
    apellidos: person ? person.apellidos : '',
    correo_institucional: person ? person.correo_institucional : '',
    cargo_name: cargo ? cargo.name : '',
    estructura_id: location.estructura_id,
    estructura_name: relation ? relation.estructura_name : '',
    estructura_path: relation ? relation.estructura_path : '',
    sede_id: location.sede_id,
    sede_name: relation ? relation.sede_name : (sede ? sede.name : ''),
    local_name: local ? local.name : '',
    referencia: relation ? relation.referencia : '',
    display_location: relation ? relation.display_name : (local ? local.name : '')
  });
}


function _directoryBuildView_(context, authorization) {
  const relations = _directoryBuildRelations_(context, false), relationMap = _directoryCreateMap_(relations);
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const assignments = context.asignaciones
    .map(item => _directoryEnrichAssignment_(item, context, relationMap, peopleMap))
    .filter(record => _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      {
        estructura_id: record.estructura_id,
        sede_id: record.sede_id,
        local_id: record.local_id
      },
      authorization.structures,
      authorization.locals
    ));
  const visiblePersonIds = new Set(assignments.map(x => _directoryKey_(x.persona_id)));
  const hasTotalScope = _accessRecordIsAllowed_(authorization.auth, 'MOD_INFO_PERSONAL', {}, authorization.structures);
  const people = context.personas.filter(x => hasTotalScope || visiblePersonIds.has(_directoryKey_(x.persona_id)));
  return { people, assignments, relations, relationMap };
}

function _directorySortAssignments_(records, context) {
  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const sedeOrder = new Map();
  context.sedes.forEach((sede, index) => sedeOrder.set(_directoryKey_(sede.id), index));
  const pathMap = new Map();
  context.estructuraOrg.forEach(node => pathMap.set(
    _directoryKey_(node.id), _directoryGetStructureOrderPath_(node.id, structureMap)
  ));

  // Resolver la adscripción una sola vez por registro, no en cada
  // comparación del algoritmo de ordenamiento.
  const sortable = records.map(record => {
    const location = _directoryResolveAssignmentLocation_(record, context, false);
    return {
      record,
      sedeOrder: sedeOrder.get(location.sede_id) ?? Number.MAX_SAFE_INTEGER,
      structurePath: location.estructura_id
        ? pathMap.get(location.estructura_id) || []
        : [],
      localName: location.local ? location.local.name : ''
    };
  });

  sortable.sort((a, b) => {
    if (a.sedeOrder !== b.sedeOrder) return a.sedeOrder - b.sedeOrder;
    const pathDiff = _directoryCompareStructurePaths_(a.structurePath, b.structurePath);
    if (pathDiff) return pathDiff;
    const localDiff = _directoryCompare_(a.localName, b.localName);
    if (localDiff) return localDiff;
    return _directoryCompare_(Number(a.record.order), Number(b.record.order)) ||
      _directoryCompare_(a.record.apellidos, b.record.apellidos) ||
      _directoryCompare_(a.record.nombres, b.record.nombres);
  });

  return sortable.map(item => item.record);
}

function _directoryGetPersonSchema_() {
  return {
    persona_id: { label: 'Identificador de persona', required: true, type: 'string', maxLength: 30 },
    nombres: { label: 'Nombres', required: true, type: 'string', minLength: 2, maxLength: 100 },
    apellidos: { label: 'Apellidos', required: true, type: 'string', minLength: 2, maxLength: 150 },
    correo_institucional: { label: 'Correo institucional', type: 'string', maxLength: 150 }
  };
}


function _directoryAssertNoDuplicatePerson_() { return true; }

function _directoryGetAssignmentSchema_() {
  return {
    asignacion_id: { label: 'Identificador de asignación', required: true, type: 'string', maxLength: 30 },
    persona_id: { label: 'Persona', required: true, type: 'string', maxLength: 30 },
    cargo_id: { label: 'Cargo', required: true, type: 'string' },
    condicion_cargo: { label: 'Condición del cargo', type: 'string', maxLength: 150 },
    anexo: { label: 'Anexo', type: 'integer', min: 1, max: 99999 },
    estructura_local_id: { label: 'Relación estructura-local', type: 'string' },
    local_id: { label: 'Local', type: 'string' },
    observaciones: { label: 'Observaciones', type: 'string', maxLength: 1000 },
    active: { label: 'Estado', required: true, type: 'boolean' },
    order: { label: 'Orden', required: true, type: 'integer', min: 1 }
  };
}
function _directoryValidateAssignmentReferences_(record, context) {
  if (!context.personas.some(x => _directoryKey_(x.persona_id) === _directoryKey_(record.persona_id))) throw new Error('La persona seleccionada no existe.');
  const cargo = context.cargos.find(x => _directoryKey_(x.id) === _directoryKey_(record.cargo_id));
  if (!cargo || !_directoryIsActive_(cargo)) throw new Error('El cargo seleccionado no existe o está inactivo.');
  return _directoryResolveAssignmentLocation_(record, context, true);
}

function _directoryGenerateId_(records, config) {
  let maximum = 0;
  const expression = new RegExp('^' + config.prefix + '(\\d+)$', 'i');

  (records || []).forEach(record => {
    const match = _directoryKey_(record[config.field]).match(expression);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  });

  return config.prefix + String(maximum + 1).padStart(config.digits, '0');
}

function _directoryGetNextOrder_(assignments, structureLocalId, localId) {
  let maximum = 0;
  (assignments || []).forEach(record => {
    if (_directoryKey_(record.estructura_local_id) !== _directoryKey_(structureLocalId) ||
        _directoryKey_(record.local_id) !== _directoryKey_(localId)) return;
    const order = Number(record.order); if (Number.isInteger(order) && order > maximum) maximum = order;
  });
  return maximum + 1;
}

function _directoryAssertAllowedFields_(payload, allowedFields, label) {
  Object.keys(payload).forEach(field => {
    if (!allowedFields.includes(field)) {
      throw new Error('El campo "' + field + '" no está permitido en ' + label + '.');
    }
  });
}

/**
 * Devuelve los catálogos autorizados y las dos colecciones operativas.
 * Las personas se devuelven una sola vez, aunque tengan varias asignaciones.
 */
function getDirectoryInitialData() {
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({ includePersonalData: false, includePeople: false });
  const view = _directoryBuildView_(context, authorization);

  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const structureTypeMap = _directoryCreateMap_(context.tiposEstructura);
  const activeStructure = context.estructuraOrg
    .filter(_directoryIsActive_)
    .map(node => {
      const type = structureTypeMap.get(_directoryKey_(node.tipo_estructura_id));
      return Object.assign({}, node, {
        path: _directoryGetStructurePath_(node, structureMap),
        tipo_estructura_name: type ? type.name : ''
      });
    });

  const permittedStructures = activeStructure.filter(node =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      { estructura_id: node.id, sede_id: node.sede_id },
      authorization.structures
    )
  );

  // Se incluyen los antecesores únicamente para contextualizar la cascada.
  // La autorización de registros continúa aplicándose sobre el ámbito real.
  const allowedStructureIds = new Set(
    permittedStructures.map(item => _directoryKey_(item.id))
  );
  const hierarchyDisplayIds = new Set(allowedStructureIds);
  permittedStructures.forEach(node => {
    let current = structureMap.get(_directoryKey_(node.parent_id));
    const visited = new Set();
    while (current) {
      const id = _directoryKey_(current.id);
      if (!id || visited.has(id)) break;
      hierarchyDisplayIds.add(id);
      visited.add(id);
      current = structureMap.get(_directoryKey_(current.parent_id));
    }
  });
  const scopedStructures = activeStructure.filter(node =>
    hierarchyDisplayIds.has(_directoryKey_(node.id))
  );
  const scopedRelations = view.relations.filter(item =>
    item.active && allowedStructureIds.has(_directoryKey_(item.estructura_id))
  );

  // Los locales directos se autorizan por su sede; no requieren una
  // relación estructura_local ni se inventa una estructura orgánica.
  const scopedLocals = context.locales.filter(local =>
    _directoryIsActive_(local) &&
    _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      { sede_id: _directoryKey_(local.sede_id), local_id: _directoryKey_(local.id) },
      authorization.structures,
      authorization.locals
    )
  );
  const relationLocalIds = new Set(
    scopedRelations.map(item => _directoryKey_(item.local_id))
  );
  const scopedLocalIds = new Set(
    scopedLocals.map(item => _directoryKey_(item.id))
  );
  const catalogLocals = context.locales.filter(local =>
    _directoryIsActive_(local) &&
    (
      relationLocalIds.has(_directoryKey_(local.id)) ||
      scopedLocalIds.has(_directoryKey_(local.id))
    )
  );

  const allowedSedeIds = new Set([
    ...permittedStructures.map(item => _directoryKey_(item.sede_id)),
    ...catalogLocals.map(item => _directoryKey_(item.sede_id))
  ]);
  const allowedLocalTypes = new Set(
    catalogLocals.map(item => _directoryKey_(item.tipo_local_id))
  );
  const allowedStructureTypes = new Set(
    scopedStructures.map(item => _directoryKey_(item.tipo_estructura_id))
  );

  const assignments = view.assignments;
  const scopedSedes = context.sedes.filter(item =>
    _directoryIsActive_(item) && allowedSedeIds.has(_directoryKey_(item.id))
  );
  const usedCargoIds = new Set(assignments.map(item => _directoryKey_(item.cargo_id)));
  const scopedCargos = context.cargos.filter(item =>
    _directoryIsActive_(item) && usedCargoIds.has(_directoryKey_(item.id))
  );

  return {
    catalogs: {
      sedes: scopedSedes,
      tiposLocal: context.tiposLocal.filter(item =>
        _directoryIsActive_(item) && allowedLocalTypes.has(_directoryKey_(item.id))
      ),
      locales: catalogLocals,
      tiposEstructura: context.tiposEstructura.filter(item =>
        _directoryIsActive_(item) && allowedStructureTypes.has(_directoryKey_(item.id))
      ),
      tiposDocumento: (context.documentTypes || [])
        .filter(_directoryIsActive_)
        .map(item => ({
          id: _directoryKey_(item.id),
          name: _directoryText_(item.name)
        })),
      estructuraOrg: scopedStructures,
      estructuraLocal: scopedRelations,
      cargos: scopedCargos,
      filterVisibility: {
        sede: scopedSedes.length > 1,
        cargo: scopedCargos.length > 1,
        hierarchy: scopedStructures.length > 1
      }
    },
    // La tabla consulta sus filas bajo demanda mediante listDirectoryAssignments.
    // No se entrega la colección completa al navegador durante el bootstrap.
    records: [],
    summary: {
      people: new Set(view.assignments.map(item => _directoryKey_(item.persona_id))).size,
      assignments: assignments.length
    }
  };
}

function listDirectoryPeople(options) {
  options = options || {};
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({ includePersonalData: false, includeDocumentTypes: false });
  const view = _directoryBuildView_(context, authorization);

  const activeFilter = options.active === undefined ? true : options.active;
  if (activeFilter !== 'all' && typeof activeFilter !== 'boolean') {
    throw new Error('El filtro active debe ser true, false o "all".');
  }

  const assignmentByPerson = new Map();
  view.assignments.forEach(item => {
    const key = _directoryKey_(item.persona_id);
    if (!assignmentByPerson.has(key)) assignmentByPerson.set(key, []);
    assignmentByPerson.get(key).push(item);
  });

  let records = view.people.map(person => Object.assign({}, person, {
    assignments: assignmentByPerson.get(_directoryKey_(person.persona_id)) || []
  }));

  if (activeFilter !== 'all') {
    records = records.filter(person =>
      person.assignments.some(item => _directoryIsActive_(item) === activeFilter)
    );
  }

  const search = _directoryText_(options.search).toLocaleLowerCase();
  if (search) {
    records = records.filter(person =>
      [person.nombres, person.apellidos].some(value =>
        _directoryText_(value).toLocaleLowerCase().includes(search)
      )
    );
  }

  records.sort((a, b) =>
    _directoryCompare_(a.apellidos, b.apellidos) ||
    _directoryCompare_(a.nombres, b.nombres)
  );

  const total = records.length;
  const offset = options.offset === undefined ? 0 : Number(options.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset no es válido.');

  let limit = null;
  if (options.limit !== undefined && options.limit !== null) {
    limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 0) throw new Error('limit no es válido.');
    records = records.slice(offset, offset + limit);
  } else {
    records = records.slice(offset);
  }

  return { records: records, total: total, offset: offset, limit: limit };
}

function listDirectoryAssignments(options) {
  options = options || {};
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({ includePersonalData: false, includePeople: false, includeDocumentTypes: false });
  const view = _directoryBuildView_(context, authorization);

  const activeFilter = options.active === undefined ? true : options.active;
  if (activeFilter !== 'all') {
    if (typeof activeFilter !== 'boolean') throw new Error('El filtro active debe ser true, false o "all".');
    view.assignments = view.assignments.filter(item =>
      _directoryIsActive_(item) === activeFilter
    );
  }

  if (options.personaId) {
    view.assignments = view.assignments.filter(item =>
      _directoryKey_(item.persona_id) === _directoryKey_(options.personaId)
    );
  }

  if (options.estructuraLocalId) {
    view.assignments = view.assignments.filter(item =>
      _directoryKey_(item.estructura_local_id) === _directoryKey_(options.estructuraLocalId)
    );
  }

  if (options.localId) {
    view.assignments = view.assignments.filter(item =>
      _directoryKey_(item.local_id) === _directoryKey_(options.localId)
    );
  }

  if (options.sedeId) {
    view.assignments = view.assignments.filter(item =>
      _directoryKey_(item.sede_id) === _directoryKey_(options.sedeId)
    );
  }

  if (options.cargoId) {
    view.assignments = view.assignments.filter(item =>
      _directoryKey_(item.cargo_id) === _directoryKey_(options.cargoId)
    );
  }

  if (options.estructuraId) {
    const targetId = _directoryKey_(options.estructuraId);
    const structures = _directoryCreateMap_(context.estructuraOrg);
    view.assignments = view.assignments.filter(item => {
      let current = structures.get(_directoryKey_(item.estructura_id));
      const visited = new Set();
      while (current) {
        const currentId = _directoryKey_(current.id);
        if (!currentId || visited.has(currentId)) break;
        if (currentId === targetId) return true;
        visited.add(currentId);
        current = structures.get(_directoryKey_(current.parent_id));
      }
      return false;
    });
  }

  const search = _directoryText_(options.search).toLocaleLowerCase();
  if (search) {
    const matchedPeople = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      search,
      ['nombres', 'apellidos', 'correo_institucional'],
      { matchCase: false }
    );
    const matchedPersonIds = new Set(
      matchedPeople.records.map(person => _directoryKey_(person.persona_id))
    );
    const fields = [
      'cargo_name', 'condicion_cargo', 'anexo', 'estructura_name',
      'estructura_path', 'local_name', 'sede_name', 'referencia',
      'observaciones'
    ];
    view.assignments = view.assignments.filter(record =>
      matchedPersonIds.has(_directoryKey_(record.persona_id)) ||
      fields.some(field => _directoryText_(record[field]).toLocaleLowerCase().includes(search))
    );
  }

  const sortBy = options.sortBy || 'order';
  const directionValue = _directoryText_(options.sortDirection || 'asc').toLowerCase();
  if (!['asc', 'desc'].includes(directionValue)) throw new Error('sortDirection debe ser "asc" o "desc".');

  const direction = directionValue === 'desc' ? -1 : 1;
  view.assignments.sort((a, b) =>
    _directoryCompare_(a[sortBy], b[sortBy]) * direction ||
    _directoryCompare_(a.asignacion_id, b.asignacion_id)
  );

  const total = view.assignments.length;
  let offset;
  let limit = null;
  let page = null;
  let pageSize = null;

  if (options.page !== undefined || options.pageSize !== undefined) {
    page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    pageSize = Number.parseInt(options.pageSize, 10) || 10;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('pageSize debe estar entre 1 y 100.');
    }
    offset = (page - 1) * pageSize;
    limit = pageSize;
  } else {
    offset = options.offset === undefined ? 0 : Number(options.offset);
    if (!Number.isInteger(offset) || offset < 0) throw new Error('offset no es válido.');
    if (options.limit !== undefined && options.limit !== null) {
      limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 0) throw new Error('limit no es válido.');
    }
  }

  view.assignments = limit === null
    ? view.assignments.slice(offset)
    : view.assignments.slice(offset, offset + limit);

  const pagePersonaIds = [...new Set(
    view.assignments.map(item => _directoryKey_(item.persona_id)).filter(Boolean)
  )];
  const peopleResult = pagePersonaIds.length
    ? SUNARPCore.findRecordsByFields(
        _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
        { persona_id: pagePersonaIds },
        {
          searchField: 'persona_id',
          requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas
        }
      )
    : { records: [] };
  if (peopleResult.total !== pagePersonaIds.length) {
    throw new Error('Una o más asignaciones visibles no tienen una persona válida en el directorio.');
  }
  const peopleById = _directoryCreateMap_(peopleResult.records, 'persona_id');
  const records = view.assignments.map(item => {
    const person = peopleById.get(_directoryKey_(item.persona_id));
    return Object.assign({}, item, {
      nombres: person ? person.nombres : '',
      apellidos: person ? person.apellidos : '',
      correo_institucional: person ? person.correo_institucional : ''
    });
  });

  return {
    records,
    total,
    offset,
    limit,
    page,
    pageSize
  };
}

function getDirectoryPersonById(personaId) {
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({ includePersonalData: false, includePeople: false, includeDocumentTypes: false });

  // Primero se determina qué asignaciones de esta persona están autorizadas.
  // No se consulta su identidad ni sus datos personales antes de esta comprobación.
  const view = _directoryBuildView_(context, authorization);
  const assignments = view.assignments.filter(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(personaId)
  );

  if (!assignments.length) {
    if (context.asignaciones.some(item =>
      _directoryKey_(item.persona_id) === _directoryKey_(personaId)
    )) {
      throw new Error('No tienes ámbito de acceso para consultar esta persona.');
    }
    return null;
  }

  const personResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: _directoryKey_(personaId) },
    { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
  );
  if (personResult.total > 1) {
    throw new Error('El identificador de persona está duplicado en el directorio.');
  }
  const person = personResult.records[0] || null;
  if (!person) {
    throw new Error('Las asignaciones autorizadas no tienen una identidad válida en el directorio.');
  }

  const personalDataResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales),
    { servidor_id: _directoryKey_(personaId) },
    {
      searchField: 'servidor_id',
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.datosPersonales
    }
  );
  if (personalDataResult.total > 1) {
    throw new Error('La ficha de datos personales está duplicada para la persona solicitada.');
  }

  const enrichedAssignments = assignments.map(item => Object.assign({}, item, {
    nombres: person.nombres,
    apellidos: person.apellidos,
    correo_institucional: person.correo_institucional
  }));

  return Object.assign({}, person, {
    assignments: enrichedAssignments,
    personalData: personalDataResult.records[0] || null
  });
}

function getDirectoryAssignmentsByPersonId(personaId, options) {
  options = Object.assign({}, options || {}, { personaId: personaId, active: 'all' });
  return listDirectoryAssignments(options);
}

function getDirectoryAssignmentById(asignacionId) {
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({ includePersonalData: false, includePeople: false, includeDocumentTypes: false });
  const assignment = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === _directoryKey_(asignacionId)
  );
  if (!assignment) return null;

  const location = _directoryResolveAssignmentLocation_(assignment, context, false);
  _directoryAssertScope_(
    authorization,
    Object.assign({}, assignment, {
      estructura_id: location.estructura_id,
      sede_id: location.sede_id
    }),
    'Consulta de una asignación fuera del ámbito asignado.'
  );

  // Solo después de validar el ámbito se recupera la identidad relacionada.
  const personResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: _directoryKey_(assignment.persona_id) },
    { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
  );
  if (personResult.total !== 1) {
    throw new Error('No se pudo resolver la identidad de la persona asignada.');
  }
  context.personas = personResult.records;
  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  return _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap);
}

function _saveDirectoryPerson_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos de la persona.');
  }

  _directoryAssertAllowedFields_(
    payload,
    ['persona_id', 'nombres', 'apellidos', 'correo_institucional'],
    'personas'
  );

  const personaId = _directoryText_(payload.persona_id);
  const isUpdate = Boolean(personaId);
  const authorization = _directoryAuthorizationContext_(
    isUpdate ? 'INFORMACION_PERSONAL_EDITAR' : 'INFORMACION_PERSONAL_CREAR'
  );
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: false
  });

  const existing = isUpdate ? _directoryFindPersonById_(personaId) : null;
  if (isUpdate && !existing) throw new Error('No se encontró la persona "' + personaId + '".');
  if (isUpdate) {
    _directoryAssertPersonMutationScope_(authorization, existing, context.asignaciones, context);
  }

  const email = _directoryText_(
    payload.correo_institucional !== undefined
      ? payload.correo_institucional
      : existing && existing.correo_institucional
  ).toLowerCase();

  if (email) {
    _accessValidateEmail_(email);
    const matches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      email,
      ['correo_institucional'],
      { matchCase: false }
    );
    const duplicateEmail = matches.records.some(item =>
      _directoryKey_(item.persona_id) !== _directoryKey_(personaId) &&
      _directoryText_(item.correo_institucional).toLowerCase() === email
    );
    if (duplicateEmail) {
      throw new Error('El correo institucional ya está asociado a otra persona.');
    }
  }

  let peopleForId = [];
  if (!isUpdate) {
    const peopleResult = SUNARPCore.listRecordsFromSourcesCached([{
      key: 'people',
      source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas
    }], DIRECTORY_DATA_CACHE_TTL);
    peopleForId = peopleResult.people || [];
  }

  const record = {
    persona_id: isUpdate
      ? personaId
      : _directoryGenerateId_(peopleForId, DIRECTORY_SERVICE_CONFIG.ids.persona),
    nombres: _directoryText_(payload.nombres !== undefined ? payload.nombres : existing && existing.nombres),
    apellidos: _directoryText_(payload.apellidos !== undefined ? payload.apellidos : existing && existing.apellidos),
    correo_institucional: email
  };

  const schema = _directoryGetPersonSchema_();
  SUNARPCore.assertValidRecord(record, schema);

  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas);
  const event = {
    accion: isUpdate ? 'EDITAR_PERSONA_DIRECTORIO' : 'CREAR_PERSONA_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'PERSONA',
    registro_id: record.persona_id,
    registro_nombre: [record.nombres, record.apellidos].filter(Boolean).join(' '),
    detalle: isUpdate ? 'Actualización de identidad de una persona.' : 'Registro de una persona.',
    datos_antes: existing || null
  };

  return _accessRunAudited_(authorization.auth, event, () => {
    const result = isUpdate
      ? SUNARPCore.updateRecord(source, 'persona_id', record.persona_id, {
          nombres: record.nombres,
          apellidos: record.apellidos,
          correo_institucional: record.correo_institucional
        }, { schema: schema })
      : SUNARPCore.insertRecord(source, record, {
          idField: 'persona_id',
          schema: schema
        });

    return {
      value: Object.assign({}, result, { person: record }),
      auditAfter: record
    };
  });
}
function _directoryNormalizeDocument_(value, label) {
  const normalized = _directoryText_(value).replace(/\s+/g, '').toUpperCase();
  if (!normalized) throw new Error(label + ' es obligatorio.');
  if (normalized.length > 30) throw new Error(label + ' no puede superar 30 caracteres.');
  return normalized;
}

function _directoryNormalizeDateInput_(value, label) {
  if (value === null || value === undefined || value === '') return '';

  let normalized = '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error(label + ' no es una fecha válida.');
    normalized = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else {
    normalized = _directoryText_(value);
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(label + ' debe tener el formato AAAA-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(label + ' no corresponde a una fecha del calendario.');
  }

  return normalized;
}

function _directoryFindPersonById_(personaId) {
  const result = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: _directoryKey_(personaId) },
    { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
  );
  if (result.total > 1) throw new Error('El identificador de persona está duplicado en el directorio.');
  return result.records[0] || null;
}


function _directoryFindPersonalDataById_(personaId) {
  const result = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales),
    { servidor_id: _directoryKey_(personaId) },
    { searchField: 'servidor_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.datosPersonales }
  );
  if (result.total > 1) throw new Error('La ficha de datos personales está duplicada para la persona solicitada.');
  return result.records[0] || null;
}


function _directoryCreatePersonalDataMap_(records) {
  const byPerson = new Map();
  (records || []).forEach(record => {
    const personaId = _directoryKey_(record.servidor_id);
    if (personaId) byPerson.set(personaId, record);
  });
  return byPerson;
}

function _directoryAssertDocumentAvailable_(type, number, records, excludedPersonaId) {
  const normalizedType = _directoryNormalizeDocument_(type, 'Tipo de documento');
  const normalizedNumber = _directoryNormalizeDocument_(number, 'Número de documento');
  const matches = Array.isArray(records)
    ? { records: records }
    : SUNARPCore.findRecordsByFields(
        _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales),
        { numero_documento: normalizedNumber },
        {
          searchField: 'numero_documento',
          requiredHeaders: DIRECTORY_REQUIRED_HEADERS.datosPersonales,
          matchCase: false,
          ignoreWhitespace: true
        }
      );
  const duplicate = matches.records.find(item =>
    _directoryKey_(item.servidor_id) !== _directoryKey_(excludedPersonaId) &&
    _directoryText_(item.tipo_documento).replace(/\s+/g, '').toUpperCase() === normalizedType &&
    _directoryText_(item.numero_documento).replace(/\s+/g, '').toUpperCase() === normalizedNumber
  );
  if (duplicate) {
    throw new Error('El documento ya está registrado para otra persona.');
  }
  return { tipo_documento: normalizedType, numero_documento: normalizedNumber };
}
function _directoryFormatDateInput_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = _directoryText_(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return text;
}

function saveDirectoryPersonalData(payload) {
  return _saveDirectoryPersonalData_(payload, false);
}

/**
 * Rutina interna. allowUnassigned solo puede activarse desde el flujo
 * coordinado de alta; nunca se acepta como dato enviado por el navegador.
 */
function _saveDirectoryPersonalData_(payload, allowUnassigned) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos personales.');
  }
  _directoryAssertAllowedFields_(payload, [
    'servidor_id', 'tipo_documento', 'numero_documento',
    'fecha_nacimiento', 'fecha_inicio_servicios', 'fecha_cese'
  ], 'datos personales');

  const personaId = _directoryText_(payload.servidor_id);
  if (!personaId) throw new Error('La persona vinculada es obligatoria.');

  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: true
  });
  const personResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: personaId },
    { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
  );
  if (personResult.total !== 1) {
    throw new Error('No existe una identidad única para la ficha de datos personales.');
  }
  const person = personResult.records[0];
  const linkedAssignments = context.asignaciones.filter(item =>
    _directoryKey_(item.persona_id) === personaId
  );
  const createWithoutAssignment = allowUnassigned === true && !linkedAssignments.length;
  const authorization = _directoryAuthorizationContext_(
    createWithoutAssignment ? 'INFORMACION_PERSONAL_CREAR' : 'INFORMACION_PERSONAL_EDITAR'
  );
  if (!createWithoutAssignment) {
    _directoryAssertPersonMutationScope_(authorization, person, context.asignaciones, context);
  }

  const normalizedDocument = _directoryAssertDocumentAvailable_(
    payload.tipo_documento,
    payload.numero_documento,
    null,
    personaId
  );
  const record = {
    servidor_id: personaId,
    tipo_documento: normalizedDocument.tipo_documento,
    numero_documento: normalizedDocument.numero_documento,
    fecha_nacimiento: _directoryNormalizeDateInput_(payload.fecha_nacimiento, 'Fecha de nacimiento'),
    fecha_inicio_servicios: _directoryNormalizeDateInput_(payload.fecha_inicio_servicios, 'Fecha de inicio de servicios'),
    fecha_cese: _directoryNormalizeDateInput_(payload.fecha_cese, 'Fecha de cese')
  };
  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales);
  const existingResult = SUNARPCore.findRecordsByFields(
    source,
    { servidor_id: personaId },
    { searchField: 'servidor_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.datosPersonales }
  );
  if (existingResult.total > 1) {
    throw new Error('La ficha de datos personales está duplicada para la persona solicitada.');
  }
  const existing = existingResult.records[0] || null;
  const event = {
    accion: existing ? 'EDITAR_DATOS_PERSONALES_DIRECTORIO' : 'CREAR_DATOS_PERSONALES_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'DATOS_PERSONALES',
    registro_id: personaId,
    registro_nombre: [person.nombres, person.apellidos].filter(Boolean).join(' '),
    detalle: 'Registro de datos personales y validación única del documento de identidad.',
    datos_antes: existing
  };

  return _accessRunAudited_(authorization.auth, event, () => {
    const result = existing
      ? SUNARPCore.updateRecord(source, 'servidor_id', personaId, {
          tipo_documento: record.tipo_documento,
          numero_documento: record.numero_documento,
          fecha_nacimiento: record.fecha_nacimiento,
          fecha_inicio_servicios: record.fecha_inicio_servicios,
          fecha_cese: record.fecha_cese
        }, { uniqueFields: ['tipo_documento', 'numero_documento'] })
      : SUNARPCore.insertRecord(source, record, {
          idField: 'servidor_id',
          uniqueFields: ['tipo_documento', 'numero_documento']
        });

    return { value: Object.assign({}, result, { personalData: record }), auditAfter: record };
  });
}
function saveDirectoryEntry(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos del registro.');
  }
  _directoryAssertAllowedFields_(payload, [
    'persona_id', 'asignacion_id', 'nombres', 'apellidos', 'correo_institucional',
    'tipo_documento', 'numero_documento', 'fecha_nacimiento',
    'fecha_inicio_servicios', 'fecha_cese', 'cargo_id',
    'condicion_cargo', 'anexo', 'estructura_local_id',
    'observaciones', 'local_id'
  ], 'registro del directorio');

  const personaId = _directoryText_(payload.persona_id);
  const assignmentId = _directoryText_(payload.asignacion_id);
  const isNewPerson = !personaId;
  const isNewAssignment = !assignmentId;

  if (isNewPerson && !isNewAssignment) {
    throw new Error('No se puede actualizar una asignación sin identificar a su persona.');
  }

  if (!isNewPerson && isNewAssignment) {
    // Una asignación adicional nunca crea ni modifica identidad o ficha personal.
    const assignment = saveDirectoryAssignment({
      persona_id: personaId,
      cargo_id: payload.cargo_id,
      condicion_cargo: payload.condicion_cargo,
      anexo: payload.anexo,
      estructura_local_id: payload.estructura_local_id,
      local_id: payload.local_id,
      observaciones: payload.observaciones,
      active: true
    });
    return Object.assign({}, assignment, { message: 'La asignación se registró correctamente.' });
  }

  const personPayload = {
    nombres: payload.nombres,
    apellidos: payload.apellidos,
    correo_institucional: payload.correo_institucional
  };
  if (personaId) personPayload.persona_id = personaId;

  if (!isNewPerson && !isNewAssignment) {
    const snapshot = _directoryLoadContext_({
      includePersonalData: false,
      includePeople: false,
      includeDocumentTypes: false
    });
    const previousPersonResult = SUNARPCore.findRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      { persona_id: personaId },
      { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
    );
    if (previousPersonResult.total !== 1) throw new Error('No se encontró una identidad única para la persona.');
    const previousPerson = previousPersonResult.records[0];
    const previousPersonalResult = SUNARPCore.findRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales),
      { servidor_id: personaId },
      { searchField: 'servidor_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.datosPersonales }
    );
    if (previousPersonalResult.total > 1) throw new Error('La ficha de datos personales está duplicada.');
    const previousPersonalData = previousPersonalResult.records[0] || null;
    const previousAssignment = snapshot.asignaciones.find(item => _directoryKey_(item.asignacion_id) === assignmentId);
    if (!previousPerson || !previousAssignment) throw new Error('No se encontró la persona o asignación que se intenta editar.');
    if (_directoryKey_(previousAssignment.persona_id) !== personaId) {
      throw new Error('La asignación seleccionada no pertenece a la persona indicada.');
    }
    const normalizedDocument = _directoryAssertDocumentAvailable_(
      payload.tipo_documento,
      payload.numero_documento,
      null,
      personaId
    );

    let personUpdated = false;
    let personalDataUpdated = false;
    let assignmentUpdated = false;
    try {
      const person = _saveDirectoryPerson_(personPayload);
      personUpdated = true;
      const personalData = saveDirectoryPersonalData({
        servidor_id: personaId,
        tipo_documento: normalizedDocument.tipo_documento,
        numero_documento: normalizedDocument.numero_documento,
        fecha_nacimiento: payload.fecha_nacimiento,
        fecha_inicio_servicios: payload.fecha_inicio_servicios,
        fecha_cese: payload.fecha_cese
      });
      personalDataUpdated = true;
      const assignment = saveDirectoryAssignment({
        asignacion_id: assignmentId,
        persona_id: personaId,
        cargo_id: payload.cargo_id,
        condicion_cargo: payload.condicion_cargo,
        anexo: payload.anexo,
        estructura_local_id: payload.estructura_local_id,
        local_id: payload.local_id,
        observaciones: payload.observaciones
      });
      assignmentUpdated = true;
      return { success: true, message: 'Persona, datos personales y asignación actualizados.', person, personalData, assignment };
    } catch (error) {
      const rollbackErrors = [];
      if (assignmentUpdated) {
        try {
          saveDirectoryAssignment({
            asignacion_id: assignmentId,
            persona_id: previousAssignment.persona_id,
            cargo_id: previousAssignment.cargo_id,
            condicion_cargo: previousAssignment.condicion_cargo,
            anexo: previousAssignment.anexo,
            estructura_local_id: previousAssignment.estructura_local_id,
            local_id: previousAssignment.local_id,
            observaciones: previousAssignment.observaciones,
            active: _directoryNormalizeBoolean_(previousAssignment.active),
            order: previousAssignment.order
          });
        } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
      }
      if (personalDataUpdated) {
        try {
          if (previousPersonalData) {
            saveDirectoryPersonalData({
              servidor_id: personaId,
              tipo_documento: previousPersonalData.tipo_documento,
              numero_documento: previousPersonalData.numero_documento,
              fecha_nacimiento: _directoryFormatDateInput_(previousPersonalData.fecha_nacimiento),
              fecha_inicio_servicios: _directoryFormatDateInput_(previousPersonalData.fecha_inicio_servicios),
              fecha_cese: _directoryFormatDateInput_(previousPersonalData.fecha_cese)
            });
          } else {
            SUNARPCore.deleteRecord(_directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales), 'servidor_id', personaId);
          }
        } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
      }
      if (personUpdated) {
        try { _saveDirectoryPerson_({ persona_id: personaId, nombres: previousPerson.nombres, apellidos: previousPerson.apellidos, correo_institucional: previousPerson.correo_institucional }); }
        catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
      }

      if (rollbackErrors.length) {
        throw new Error(error.message + ' La reversión requiere revisión: ' + rollbackErrors.join(' | '));
      }
      throw error;
    }
  }

  const normalizedNewDocument = _directoryAssertDocumentAvailable_(
    payload.tipo_documento,
    payload.numero_documento,
    null,
    ''
  );

  let createdPersonId = '';
  let personalCreated = false;
  let assignmentCreated = false;
  let createdAssignmentId = '';
  try {
    const person = _saveDirectoryPerson_(personPayload);
    createdPersonId = person.person.persona_id;
    const personalData = _saveDirectoryPersonalData_({
      servidor_id: createdPersonId,
      tipo_documento: normalizedNewDocument.tipo_documento,
      numero_documento: normalizedNewDocument.numero_documento,
      fecha_nacimiento: payload.fecha_nacimiento,
      fecha_inicio_servicios: payload.fecha_inicio_servicios,
      fecha_cese: payload.fecha_cese
    }, true);
    personalCreated = true;
    const assignment = saveDirectoryAssignment({
      persona_id: createdPersonId,
      cargo_id: payload.cargo_id,
      condicion_cargo: payload.condicion_cargo,
      anexo: payload.anexo,
      estructura_local_id: payload.estructura_local_id,
      local_id: payload.local_id,
      observaciones: payload.observaciones
    });
    createdAssignmentId = assignment.assignment.asignacion_id;
    assignmentCreated = true;
    return {
      success: true,
      message: 'La persona, sus datos personales y su primera asignación se registraron correctamente.',
      person: person.person,
      personalData: personalData.personalData,
      assignment: assignment.assignment
    };
  } catch (error) {
    const rollbackErrors = [];
    try {
      if (assignmentCreated && createdAssignmentId) {
        SUNARPCore.deleteRecord(_directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones), 'asignacion_id', createdAssignmentId);
      }
    } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    try {
      if (personalCreated && createdPersonId) {
        SUNARPCore.deleteRecord(_directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales), 'servidor_id', createdPersonId);
      }
    } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    try {
      if (createdPersonId) {
        SUNARPCore.deleteRecord(_directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas), 'persona_id', createdPersonId);
      }
    } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }

    if (rollbackErrors.length) {
      throw new Error(error.message + ' Además, la compensación requiere revisión: ' + rollbackErrors.join(' | '));
    }
    throw error;
  }
}

function saveDirectoryAssignment(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos de la asignación.');
  }

  const allowedFields = [
    'asignacion_id', 'persona_id', 'cargo_id', 'condicion_cargo',
    'anexo', 'estructura_local_id', 'local_id', 'observaciones',
    'active', 'order'
  ];
  _directoryAssertAllowedFields_(payload, allowedFields, 'asignaciones');

  const assignmentId = _directoryText_(payload.asignacion_id);
  const isUpdate = Boolean(assignmentId);
  const authorization = _directoryAuthorizationContext_(
    isUpdate ? 'INFORMACION_PERSONAL_EDITAR' : 'INFORMACION_PERSONAL_CREAR'
  );
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: false
  });

  const existing = isUpdate
    ? context.asignaciones.find(item => _directoryKey_(item.asignacion_id) === assignmentId)
    : null;
  if (isUpdate && !existing) {
    throw new Error('No se encontró la asignación "' + assignmentId + '".');
  }

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  if (isUpdate) {
    const oldLocation = _directoryResolveAssignmentLocation_(existing, context, false);
    _directoryAssertScope_(
      authorization,
      Object.assign({}, existing, {
        estructura_id: oldLocation.estructura_id,
        sede_id: oldLocation.sede_id
      }),
      'Edición de una asignación fuera del ámbito asignado.'
    );
  }

  const targetRelationId = _directoryText_(payload.estructura_local_id !== undefined
    ? payload.estructura_local_id : (existing && existing.estructura_local_id));
  const targetLocalId = _directoryText_(payload.local_id !== undefined
    ? payload.local_id : (existing && existing.local_id));
  const targetLocation = _directoryResolveAssignmentLocation_(
    { estructura_local_id: targetRelationId, local_id: targetLocalId }, context, true
  );

  const record = {
    asignacion_id: isUpdate
      ? assignmentId
      : _directoryGenerateId_(context.asignaciones, DIRECTORY_SERVICE_CONFIG.ids.asignacion),
    persona_id: _directoryText_(
      payload.persona_id !== undefined ? payload.persona_id : existing && existing.persona_id
    ),
    cargo_id: _directoryText_(
      payload.cargo_id !== undefined ? payload.cargo_id : existing && existing.cargo_id
    ),
    condicion_cargo: _directoryText_(
      payload.condicion_cargo !== undefined ? payload.condicion_cargo : existing && existing.condicion_cargo
    ),
    anexo: _directoryNormalizeInteger_(
      payload.anexo !== undefined ? payload.anexo : existing && existing.anexo,
      'Anexo',
      true
    ),
    estructura_local_id: targetRelationId,
    local_id: targetLocalId,
    observaciones: _directoryText_(
      payload.observaciones !== undefined ? payload.observaciones : existing && existing.observaciones
    ),
    active: payload.active !== undefined
      ? _directoryNormalizeBoolean_(payload.active)
      : existing
        ? _directoryNormalizeBoolean_(existing.active)
        : true,
    order: 1
  };

  const locationChanged = isUpdate && (
    _directoryKey_(existing.estructura_local_id) !== _directoryKey_(record.estructura_local_id) ||
    _directoryKey_(existing.local_id) !== _directoryKey_(record.local_id)
  );
  if (payload.order !== undefined) {
    record.order = _directoryNormalizeInteger_(payload.order, 'Orden', false);
  } else if (isUpdate && !locationChanged) {
    record.order = _directoryNormalizeInteger_(existing.order, 'Orden', false);
  } else {
    record.order = _directoryGetNextOrder_(
      context.asignaciones,
      record.estructura_local_id,
      record.local_id
    );
  }

  _directoryAssertScope_(
    authorization,
    {
      asignacion_id: record.asignacion_id,
      persona_id: record.persona_id,
      estructura_id: targetLocation.estructura_id,
      sede_id: targetLocation.sede_id,
      local_id: record.local_id
    },
    'La unidad orgánica de destino se encuentra fuera de tus ámbitos de acceso.'
  );

  // La identidad solo se recupera después de autorizar el destino.
  const person = _directoryFindPersonById_(record.persona_id);
  if (!person) throw new Error('La persona seleccionada no existe.');
  context.personas = [person];
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');

  const schema = _directoryGetAssignmentSchema_();
  SUNARPCore.assertValidRecord(record, schema);
  _directoryValidateAssignmentReferences_(record, context);

  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones);
  const event = {
    accion: isUpdate ? 'EDITAR_ASIGNACION_DIRECTORIO' : 'CREAR_ASIGNACION_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'ASIGNACION',
    registro_id: record.asignacion_id,
    registro_nombre: [person.nombres, person.apellidos].filter(Boolean).join(' '),
    detalle: isUpdate ? 'Actualización de una asignación.' : 'Alta de una asignación.',
    datos_antes: existing || null
  };

  return _accessRunAudited_(authorization.auth, event, () => {
    const result = isUpdate
      ? SUNARPCore.updateRecord(source, 'asignacion_id', record.asignacion_id, {
          persona_id: record.persona_id,
          cargo_id: record.cargo_id,
          condicion_cargo: record.condicion_cargo,
          anexo: record.anexo,
          estructura_local_id: record.estructura_local_id,
          local_id: record.local_id,
          observaciones: record.observaciones,
          active: record.active,
          order: record.order
        }, { schema: schema })
      : SUNARPCore.insertRecord(source, record, {
          idField: 'asignacion_id',
          schema: schema
        });

    return {
      value: Object.assign({}, result, {
        assignment: _directoryEnrichAssignment_(record, context, relationMap, peopleMap)
      }),
      auditAfter: record
    };
  });
}

function setDirectoryAssignmentActive(asignacionId, active) {
  if (typeof active !== 'boolean') {
    throw new Error('El nuevo estado debe ser true o false.');
  }

  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_CAMBIAR_ESTADO');
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: false
  });
  const id = _directoryText_(asignacionId);
  const existing = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === id
  );
  if (!existing) throw new Error('No se encontró la asignación "' + id + '".');

  const location = _directoryResolveAssignmentLocation_(existing, context, false);
  _directoryAssertScope_(
    authorization,
    Object.assign({}, existing, {
      estructura_id: location.estructura_id,
      sede_id: location.sede_id
    }),
    'Cambio de estado de una asignación fuera del ámbito asignado.'
  );

  const person = _directoryFindPersonById_(existing.persona_id);
  if (!person) throw new Error('La asignación no tiene una identidad válida.');
  context.personas = [person];
  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const enriched = _directoryEnrichAssignment_(existing, context, relationMap, peopleMap);

  return _accessRunAudited_(authorization.auth, {
    accion: active ? 'ACTIVAR_ASIGNACION_DIRECTORIO' : 'DESACTIVAR_ASIGNACION_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'ASIGNACION',
    registro_id: id,
    registro_nombre: [person.nombres, person.apellidos].filter(Boolean).join(' '),
    detalle: 'Cambio de estado de una asignación.',
    datos_antes: existing
  }, () => {
    const result = SUNARPCore.setRecordStatus(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
      'asignacion_id',
      id,
      'active',
      active
    );
    return {
      value: Object.assign({}, result, {
        assignment: Object.assign({}, enriched, { active: active })
      }),
      auditAfter: Object.assign({}, existing, { active: active })
    };
  });
}

function deleteDirectoryAssignment(asignacionId) {
  const id = _directoryText_(asignacionId);
  if (!id) throw new Error('Debes proporcionar el identificador de la asignación.');

  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_ELIMINAR');
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: false
  });
  const existing = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === id
  );
  if (!existing) throw new Error('No se encontró la asignación "' + id + '".');

  const location = _directoryResolveAssignmentLocation_(existing, context, false);
  _directoryAssertScope_(
    authorization,
    Object.assign({}, existing, {
      estructura_id: location.estructura_id,
      sede_id: location.sede_id
    }),
    'Eliminación de una asignación fuera del ámbito asignado.'
  );

  const person = _directoryFindPersonById_(existing.persona_id);
  if (!person) throw new Error('La asignación no tiene una identidad válida.');

  return _accessRunAudited_(authorization.auth, {
    accion: 'ELIMINAR_ASIGNACION_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'ASIGNACION',
    registro_id: id,
    registro_nombre: [person.nombres, person.apellidos].filter(Boolean).join(' '),
    detalle: 'Eliminación física de una asignación. La persona se conserva.',
    datos_antes: existing
  }, () => {
    const result = SUNARPCore.deleteRecord(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
      'asignacion_id',
      id
    );
    return {
      value: Object.assign({}, result, {
        success: true,
        message: 'La asignación se eliminó correctamente. La persona se conservó.',
        asignacion_id: id
      }),
      auditAfter: null
    };
  });
}

function deleteDirectoryPerson(personaId) {
  const id = _directoryText_(personaId);
  if (!id) throw new Error('Debes proporcionar el identificador de la persona.');

  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_ELIMINAR');
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeDocumentTypes: false
  });
  const person = _directoryFindPersonById_(id);
  if (!person) throw new Error('No se encontró la persona "' + id + '".');

  const linkedAssignments = context.asignaciones.filter(item =>
    _directoryKey_(item.persona_id) === id
  );

  _directoryAssertPersonMutationScope_(
    authorization,
    person,
    context.asignaciones,
    context
  );

  if (linkedAssignments.length) {
    throw new Error(
      'No se puede eliminar la persona porque tiene ' +
      linkedAssignments.length +
      ' asignación(es) vinculada(s). Elimina o reasigna primero esas asignaciones.'
    );
  }

  const personalData = _directoryFindPersonalDataById_(id);
  if (personalData) {
    throw new Error(
      'No se puede eliminar la persona porque tiene una ficha de datos personales vinculada.'
    );
  }

  return _accessRunAudited_(authorization.auth, {
    accion: 'ELIMINAR_PERSONA_DIRECTORIO',
    modulo: 'INFORMACION_PERSONAL',
    tipo_entidad: 'PERSONA',
    registro_id: id,
    registro_nombre: [person.nombres, person.apellidos].filter(Boolean).join(' '),
    detalle: 'Eliminación física de una persona sin asignaciones ni ficha personal vinculada.',
    datos_antes: person
  }, () => {
    const result = SUNARPCore.deleteRecord(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      'persona_id',
      id
    );
    return {
      value: Object.assign({}, result, {
        success: true,
        message: 'La persona se eliminó correctamente.',
        persona_id: id
      }),
      auditAfter: null
    };
  });
}

function clearDirectoryCache() {
  requirePermission_('INFORMACION_PERSONAL_VER', 'MOD_INFO_PERSONAL');
  const result = _directoryInvalidateCache_();
  return {
    success: result.success,
    message: result.success
      ? 'Caché de las fuentes del directorio invalidada correctamente.'
      : 'No se pudo invalidar una o más fuentes del directorio.',
    sources: result.sources
  };
}
