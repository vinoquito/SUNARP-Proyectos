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

// Core invalida por generación las escrituras propias. Las hojas y fórmulas
// editadas externamente (incluido IMPORTRANGE) no publican esa generación;
// los TTL acotan la obsolescencia externa y permiten reutilizar sedes entre
// cambios de filtro. Las escrituras Core invalidan estas entradas por fuente.
const DIRECTORY_DATA_CACHE_TTL = 300;
const DIRECTORY_CATALOG_CACHE_TTL = 300;
const DIRECTORY_SITE_SNAPSHOT_CACHE_TTL = 600;
const DIRECTORY_ASSIGNMENT_QUERY_CACHE_TTL = 300;

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
 * El catálogo de tipos de documento tiene una única fuente maestra:
 * Global parameters. No se buscan copias alternativas en archivos
 * consumidores, porque eso ocultaría errores de configuración y permitiría
 * que cada aplicación termine usando catálogos divergentes.
 */
function _directoryResolveDocumentTypesSource_() {
  const source = _directorySource_(
    DIRECTORY_SERVICE_CONFIG.sheets.documentTypes,
    'MASTER_DATA'
  );
  const info = SUNARPCore.getSourceInfoCached(source, DIRECTORY_CATALOG_CACHE_TTL);
  const missing = DIRECTORY_REQUIRED_HEADERS.documentTypes.filter(header =>
    !info.headers.includes(header)
  );

  if (missing.length) {
    throw new Error(
      'La fuente maestra Global parameters, pestaña "' +
      DIRECTORY_SERVICE_CONFIG.sheets.documentTypes +
      '", no contiene los encabezados requeridos: ' +
      missing.join(', ') + '.'
    );
  }

  return source;
}

function _directoryLoadAuthorizationCatalog_(auth) {
  const moduleAccess = (auth && Array.isArray(auth.moduleAccess)
    ? auth.moduleAccess
    : []).find(item => item && item.modulo_id === 'MOD_INFO_PERSONAL');
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];
  const scopeTypes = new Set(scopes.map(scope =>
    String(scope && scope.tipo_ambito_id || '').trim().toUpperCase()
  ));

  // TOTAL exclusivo no necesita catálogos de estructura/local para evaluar
  // registros: Core aplica la autorización global antes de construir mapas.
  const exclusiveTotal = scopes.length === 1 &&
    scopeTypes.has('TOTAL') &&
    !String(scopes[0].referencia_id || '').trim();
  if (exclusiveTotal) {
    return { estructuraOrg: [], locales: [] };
  }

  const requests = [];
  if (scopeTypes.has('SEDE') || scopeTypes.has('ESTRUCTURA_ORG')) {
    requests.push({
      key: 'estructuraOrg',
      source: getIntranetDataSource('SECURITY', 'EstructuraOrg', 1),
      requiredHeaders: ['id', 'name', 'parent_id', 'sede_id']
    });
  }
  if (
    scopeTypes.has('SEDE') ||
    scopeTypes.has('ESTRUCTURA_ORG') ||
    scopeTypes.has('LOCAL')
  ) {
    requests.push({
      key: 'locales',
      source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.locales),
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.locales
    });
  }

  // Sedes no participa en la evaluación de ámbito del Core: la sede de cada
  // registro se deriva de estructura_org o locales, y el catálogo visible
  // se obtiene desde Directorios telefónicos.sede en el flujo de la pantalla.
  if (!requests.length) return { estructuraOrg: [], locales: [] };

  const catalogs = SUNARPCore.listRecordsFromSourcesCached(
    requests,
    DIRECTORY_CATALOG_CACHE_TTL
  );
  return {
    estructuraOrg: (catalogs.estructuraOrg || []).filter(_directoryIsActive_),
    locales: (catalogs.locales || []).filter(_directoryIsActive_)
  };
}


function _directoryAuthorizationContext_(permissionCode) {
  const moduleId = 'MOD_INFO_PERSONAL';
  const requiredPermissionCode = permissionCode || 'INFORMACION_PERSONAL_VER';
  const auth = requirePermission_(requiredPermissionCode, moduleId);
  const catalog = _directoryLoadAuthorizationCatalog_(auth);

  return {
    auth: auth,
    moduleId: moduleId,
    permissionCode: requiredPermissionCode,
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

  // Una relación estructura_local solo define una adscripción válida cuando
  // la estructura y el local pertenecen a la misma sede.
  const structureSedeId = relation ? _directoryKey_(structure.sede_id) : '';
  const localSedeId = resolvedLocal ? _directoryKey_(resolvedLocal.sede_id) : '';
  if (!localSedeId) {
    throw new Error('La adscripción no puede resolverse porque el local no tiene sede_id.');
  }
  if (relation && (!structureSedeId || structureSedeId !== localSedeId)) {
    throw new Error(
      'La relación estructura-local "' + relationId +
      '" no es coherente: la estructura pertenece a la sede "' +
      (structureSedeId || 'sin sede') +
      '" y el local pertenece a la sede "' + localSedeId + '".'
    );
  }
  return { relation, local: resolvedLocal, estructura_id: relation ? _directoryKey_(relation.estructura_id) : '',
    sede_id: relation ? structureSedeId : localSedeId };
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
 * Orden físico de locales. order es relativo a hermanos con igual
 * sede_id y parent_id. Si el encabezado aún no existe, conserva el orden
 * recibido solo como transición y comunica que la migración está pendiente.
 */
function _directorySortLocalCatalog_(locales) {
  const items = Array.isArray(locales) ? locales.slice() : [];
  const byId = new Map();
  items.forEach(local => {
    const id = _directoryKey_(local && local.id);
    if (!id) throw new Error('La tabla locales contiene un registro sin id.');
    if (byId.has(id)) throw new Error('La tabla locales contiene el id duplicado "' + id + '".');
    byId.set(id, local);
  });

  items.forEach(local => {
    const id = _directoryKey_(local.id);
    const parentId = _directoryKey_(local.parent_id);
    if (!parentId) return;
    const parent = byId.get(parentId);
    if (!parent) throw new Error('El local "' + id + '" referencia un parent_id inexistente: "' + parentId + '".');
    if (_directoryKey_(parent.sede_id) !== _directoryKey_(local.sede_id)) {
      throw new Error('El local "' + id + '" tiene un padre de otra sede.');
    }
    const visited = new Set([id]);
    let current = parent;
    while (current) {
      const currentId = _directoryKey_(current.id);
      if (visited.has(currentId)) throw new Error('Existe un ciclo en locales.parent_id que involucra "' + id + '".');
      visited.add(currentId);
      const nextParentId = _directoryKey_(current.parent_id);
      current = nextParentId ? byId.get(nextParentId) : null;
    }
  });

  const orderConfigured = items.some(local =>
    Object.prototype.hasOwnProperty.call(local || {}, 'order')
  );
  if (!orderConfigured) {
    return { records: items, orderConfigured: false, missingOrderCount: items.length };
  }

  const siblingOrders = new Map();
  items.forEach(local => {
    const id = _directoryKey_(local.id);
    const normalized = _directoryText_(local.order);
    const order = Number(local.order);
    if (!normalized || !Number.isInteger(order) || order <= 0) {
      throw new Error('El local "' + id + '" debe tener un order entero positivo.');
    }
    const group = JSON.stringify([_directoryKey_(local.sede_id), _directoryKey_(local.parent_id)]);
    if (!siblingOrders.has(group)) siblingOrders.set(group, new Map());
    const groupOrders = siblingOrders.get(group);
    if (groupOrders.has(order)) {
      throw new Error('Los locales "' + groupOrders.get(order) + '" y "' + id +
        '" repiten order=' + order + ' dentro de la misma sede y parent_id.');
    }
    groupOrders.set(order, id);
  });

  const childrenByParent = new Map();
  items.forEach(local => {
    const parentId = _directoryKey_(local.parent_id);
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(local);
  });
  childrenByParent.forEach(children => children.sort((a, b) => Number(a.order) - Number(b.order)));

  const ordered = [];
  const visitedIds = new Set();
  const visit = local => {
    const id = _directoryKey_(local.id);
    if (visitedIds.has(id)) return;
    visitedIds.add(id);
    ordered.push(local);
    (childrenByParent.get(id) || []).forEach(visit);
  };
  const rootsBySite = new Map();
  items.filter(local => !_directoryKey_(local.parent_id)).forEach(local => {
    const siteId = _directoryKey_(local.sede_id);
    if (!rootsBySite.has(siteId)) rootsBySite.set(siteId, []);
    rootsBySite.get(siteId).push(local);
  });
  rootsBySite.forEach(roots => {
    roots.sort((a, b) => Number(a.order) - Number(b.order));
    roots.forEach(visit);
  });
  if (ordered.length !== items.length) {
    const missing = items.filter(local => !visitedIds.has(_directoryKey_(local.id)))
      .map(local => _directoryKey_(local.id));
    throw new Error('No se pudo ordenar toda la jerarquía de locales: ' + missing.join(', ') + '.');
  }
  return { records: ordered, orderConfigured: true, missingOrderCount: 0 };
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

    const structureSedeId = _directoryKey_(structure.sede_id);
    const localSedeId = _directoryKey_(local.sede_id);
    if (!structureSedeId || !localSedeId || structureSedeId !== localSedeId) {
      return null;
    }

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
    !(options.includePeople === false && item[0] === 'personas') &&
    !(options.includeAssignments === false && item[0] === 'asignaciones')
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

  // Todas las fuentes de Directorios telefónicos comparten el mismo TTL y
  // se agrupan en una sola llamada Core. Esto abre el archivo una vez y lee
  // sus pestañas juntas, en lugar de abrirlo por separado para datos y
  // catálogos aunque ambos TTL fueran idénticos.
  const context = requests.length
    ? SUNARPCore.listRecordsFromSourcesCached(requests, Math.min(
        DIRECTORY_DATA_CACHE_TTL,
        DIRECTORY_CATALOG_CACHE_TTL
      ))
    : {};

  if (!Array.isArray(context.personas)) context.personas = [];
  if (!Array.isArray(context.datosPersonales)) context.datosPersonales = [];
  if (!Array.isArray(context.asignaciones)) context.asignaciones = [];

  if (options.validateSnapshot !== false) _directoryValidateSnapshot_(context, options);

  return context;
}

function _directoryLoadContext_(options) {
  options = options || {};
  const started = Date.now();
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
    !(options.includePeople === false && item[0] === 'personas') &&
    !(options.includeAssignments === false && item[0] === 'asignaciones')
  );
  const sources = selectedSheets.map(item => _directorySource_(item[1]));
  const baseOptions = Object.assign({}, options, {
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const variant = [
    options.includePersonalData === false ? 'no-personal' : 'personal',
    options.includePeople === false ? 'no-people' : 'people',
    options.includeAssignments === false ? 'no-assignments' : 'assignments'
  ].join(':');
  const cacheTtl = Math.min(DIRECTORY_DATA_CACHE_TTL, DIRECTORY_CATALOG_CACHE_TTL);
  let context;
  let cacheHit = false;
  let sourceGenerationElapsed = 0;

  if (typeof SUNARPCore.getOrBuildCachedValue === 'function') {
    const cached = SUNARPCore.getOrBuildCachedValue(
      'directory-context:v1:' + variant,
      sources,
      () => _directoryLoadContextFromSheets_(baseOptions),
      cacheTtl
    );
    context = cached && cached.value;
    cacheHit = Boolean(cached && cached.cacheHit);
    sourceGenerationElapsed = Number(cached && cached.sourceGenerationMs) || 0;
  }

  if (!context) {
    context = _directoryLoadContextFromSheets_(baseOptions);
  }

  // Tipos de documento se cargan aparte para que la carga de páginas y filtros
  // comparta el mismo contexto de catálogos, sin arrastrar ese catálogo auxiliar.
  if (options.includeDocumentTypes !== false) {
    const documentTypes = SUNARPCore.listRecordsFromSourcesCached([{
      key: 'documentTypes',
      source: _directoryResolveDocumentTypesSource_(),
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.documentTypes
    }], DIRECTORY_CATALOG_CACHE_TTL);
    context = Object.assign({}, context, {
      documentTypes: documentTypes.documentTypes || []
    });
  } else if (!Array.isArray(context.documentTypes)) {
    context = Object.assign({}, context, { documentTypes: [] });
  }

  if (options.validateSnapshot !== false) {
    _directoryValidateSnapshot_(context, options);
  }

  console.log('[DirectoryService] Contexto de catálogos:', JSON.stringify({
    durationMs: Date.now() - started,
    cacheHit,
    sourceCount: sources.length,
    sourceGenerationMs: sourceGenerationElapsed,
    variant,
    documentTypesLoaded: options.includeDocumentTypes !== false
  }));
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


function _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap, resolvedLocation) {
  const location = resolvedLocation || _directoryResolveAssignmentLocation_(assignment, context, false);
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
    display_location: relation ? relation.display_name : (local ? local.name : ''),
    // Campos normalizados exclusivamente para filtros de presentación.
    // No sustituyen los identificadores físicos almacenados en asignaciones.
    filter_sede_id: _directoryKey_(location.sede_id),
    filter_local_id: local ? _directoryKey_(local.id) : _directoryKey_(assignment.local_id)
  });
}


function _directoryBuildFilterContract_(authorization, assignments, structures) {
  const moduleAccess = (authorization.auth && authorization.auth.moduleAccess || [])
    .find(item => _directoryKey_(item.modulo_id) === _directoryKey_(authorization.moduleId));
  const scopes = (moduleAccess && moduleAccess.scopes || []).map(scope => ({
    type: _directoryText_(scope.tipo_ambito_id).toUpperCase(),
    referenceId: _directoryKey_(scope.referencia_id),
    includeDescendants: _directoryNormalizeBoolean_(scope.incluir_descendientes === undefined ? false : scope.incluir_descendientes)
  })).filter(scope => ['TOTAL', 'SEDE', 'ESTRUCTURA_ORG', 'LOCAL'].includes(scope.type));

  const unique = field => Array.from(new Set((assignments || [])
    .map(record => _directoryKey_(record[field])).filter(Boolean)));
  const uniqueResolved = (resolvedField, fallbackField) => Array.from(new Set((assignments || [])
    .map(record => _directoryKey_(record[resolvedField] || record[fallbackField])).filter(Boolean)));

  const usedStructureIds = new Set(unique('estructura_id'));
  const structureMap = _directoryCreateMap_(structures || []);
  const contextStructureIds = new Set();
  usedStructureIds.forEach(id => {
    let current = structureMap.get(id);
    const visited = new Set();
    while (current) {
      const parentId = _directoryKey_(current.parent_id);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      if (!usedStructureIds.has(parentId)) contextStructureIds.add(parentId);
      current = structureMap.get(parentId);
    }
  });

  return {
    scopes,
    fixed: {
      total: scopes.some(scope => scope.type === 'TOTAL'),
      sedeIds: Array.from(new Set(scopes.filter(scope => scope.type === 'SEDE').map(scope => scope.referenceId).filter(Boolean))),
      structureIds: Array.from(new Set(scopes.filter(scope => scope.type === 'ESTRUCTURA_ORG').map(scope => scope.referenceId).filter(Boolean))),
      localIds: Array.from(new Set(scopes.filter(scope => scope.type === 'LOCAL').map(scope => scope.referenceId).filter(Boolean)))
    },
    selectable: {
      sedeIds: uniqueResolved('filter_sede_id', 'sede_id'),
      cargoIds: unique('cargo_id'),
      structureIds: unique('estructura_id'),
      localIds: uniqueResolved('filter_local_id', 'local_id')
    },
    contextStructureIds: Array.from(contextStructureIds)
  };
}


function _directoryBuildView_(context, authorization) {
  const relations = _directoryBuildRelations_(context, false), relationMap = _directoryCreateMap_(relations);
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const assignments = [];

  // Resolver primero la adscripción y comprobar el ámbito. Solo los registros
  // autorizados pasan por el enriquecimiento destinado a la respuesta.
  context.asignaciones.forEach(item => {
    const location = _directoryResolveAssignmentLocation_(item, context, false);
    const record = {
      estructura_id: location.estructura_id,
      sede_id: location.sede_id,
      local_id: item.local_id
    };
    const allowed = _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      record,
      authorization.structures,
      authorization.locals
    );
    if (!allowed) return;
    assignments.push(_directoryEnrichAssignment_(item, context, relationMap, peopleMap, location));
  });

  const visiblePersonIds = new Set(assignments.map(x => _directoryKey_(x.persona_id)));
  const hasTotalScope = _accessRecordIsAllowed_(authorization.auth, 'MOD_INFO_PERSONAL', {}, authorization.structures);
  const people = context.personas.filter(x => hasTotalScope || visiblePersonIds.has(_directoryKey_(x.persona_id)));
  return { people, assignments, relations, relationMap };
}

function _directorySortAssignments_(records, context) {
  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const sedeOrder = new Map();
  context.sedes.forEach((sede, index) => sedeOrder.set(_directoryKey_(sede.id), index));
  const localOrderResult = _directorySortLocalCatalog_(context.locales || []);
  const localOrder = new Map(localOrderResult.records.map((local, index) => [
    _directoryKey_(local.id), index
  ]));
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
      localOrder: location.local
        ? (localOrder.get(_directoryKey_(location.local.id)) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER,
      structurePath: location.estructura_id
        ? pathMap.get(location.estructura_id) || []
        : [],
      localName: location.local ? location.local.name : ''
    };
  });

  sortable.sort((a, b) => {
    if (a.sedeOrder !== b.sedeOrder) return a.sedeOrder - b.sedeOrder;
    if (a.localOrder !== b.localOrder) return a.localOrder - b.localOrder;
    // Dentro de cada local, las adscripciones orgánicas siguen su ruta real.
    // Las adscripciones solo a local, sin estructura declarada, quedan al final
    // y nunca reciben una unidad orgánica artificial.
    const hasStructureA = a.structurePath.length > 0;
    const hasStructureB = b.structurePath.length > 0;
    if (hasStructureA !== hasStructureB) return hasStructureA ? -1 : 1;
    const pathDiff = _directoryCompareStructurePaths_(a.structurePath, b.structurePath);
    if (pathDiff) return pathDiff;
    // El orden explícito de las adscripciones prevalece dentro de cada unidad,
    // aunque la unidad tenga relaciones con más de un local físico.
    return _directoryCompare_(Number(a.record.order), Number(b.record.order)) ||
      _directoryCompare_(a.record.asignacion_id, b.record.asignacion_id) ||
      _directoryCompare_(a.localName, b.localName) ||
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
function _directoryGetStructureIds_(structures, rootIds, includeDescendants) {
  const roots = new Set(Array.from(rootIds || []).map(_directoryKey_).filter(Boolean));
  const result = new Set(roots);
  if (!includeDescendants || !roots.size) return result;
  const structureMap = _directoryCreateMap_(structures || []);
  (structures || []).forEach(node => {
    let current = node;
    const visited = new Set();
    while (current) {
      const id = _directoryKey_(current.id);
      if (!id || visited.has(id)) break;
      if (roots.has(id)) {
        result.add(_directoryKey_(node.id));
        break;
      }
      visited.add(id);
      current = structureMap.get(_directoryKey_(current.parent_id));
    }
  });
  return result;
}


/**
 * Construye filtros exactos a partir de los ámbitos efectivos.
 * Las relaciones estructura-local y local se traducen a candidatos físicos;
 * Core vuelve a comprobar el ámbito sobre los datos de relación declarados.
 */
function _directoryBuildAssignmentQuery_(context, authorization, options) {
  options = options || {};
  const relations = context.estructuraLocal || [];
  const structures = context.estructuraOrg || [];
  const locals = context.locales || [];
  const structureMap = _directoryCreateMap_(structures);
  const relationMap = _directoryCreateMap_(relations);
  const localMap = _directoryCreateMap_(locals);
  const consistentRelations = relations.filter(relation => {
    const structure = structureMap.get(_directoryKey_(relation.estructura_id));
    const local = localMap.get(_directoryKey_(relation.local_id));
    const structureSedeId = _directoryKey_(structure && structure.sede_id);
    const localSedeId = _directoryKey_(local && local.sede_id);
    return Boolean(structure && local && structureSedeId &&
      localSedeId && structureSedeId === localSedeId);
  });
  const moduleAccess = (authorization.auth.moduleAccess || []).find(item =>
    _directoryKey_(item.modulo_id) === _directoryKey_(authorization.moduleId)
  );
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];

  const selectedSiteId = _directoryKey_(options.sedeId);
  const selectedStructureId = _directoryKey_(options.estructuraId);
  const selectedStructureIds = selectedStructureId
    ? _directoryGetStructureIds_(structures, [selectedStructureId], true)
    : null;

  const baseFilters = {};
  if (options.personaId) baseFilters.persona_id = _directoryKey_(options.personaId);
  if (Array.isArray(options.personaIds)) {
    baseFilters.persona_id = Array.from(new Set(options.personaIds.map(_directoryKey_).filter(Boolean)));
  }
  if (options.asignacionId) baseFilters.asignacion_id = _directoryKey_(options.asignacionId);
  if (options.estructuraLocalId) baseFilters.estructura_local_id = _directoryKey_(options.estructuraLocalId);
  const selectedLocalId = _directoryKey_(options.localId);
  if (options.cargoId) baseFilters.cargo_id = _directoryKey_(options.cargoId);

  const activeFilter = options.active === undefined ? true : options.active;
  if (activeFilter !== 'all') {
    if (activeFilter === true || String(activeFilter).toLowerCase() === 'true') {
      baseFilters.active = [true, 'true', 'TRUE', '', 1, '1', 'SI', 'SÍ', 'YES'];
    } else if (activeFilter === false || String(activeFilter).toLowerCase() === 'false') {
      baseFilters.active = [false, 'false', 'FALSE', 0, '0', 'NO', 'no', 'INACTIVO', 'inactivo'];
    } else {
      throw new Error('El filtro active debe ser true, false o "all".');
    }
  }

  const groups = [];
  const addScopeCandidates = (scope, type, referenceId, includeDescendants) => {
    let relationIds = [];
    let localIds = [];

    if (type === 'TOTAL') {
      relationIds = consistentRelations.map(item => _directoryKey_(item.id)).filter(Boolean);
      localIds = locals.map(item => _directoryKey_(item.id)).filter(Boolean);
    } else if (type === 'SEDE') {
      relationIds = consistentRelations.filter(relation => {
        const structure = structureMap.get(_directoryKey_(relation.estructura_id));
        return structure && _directoryKey_(structure.sede_id) === referenceId;
      }).map(item => _directoryKey_(item.id)).filter(Boolean);
      localIds = locals.filter(local =>
        _directoryKey_(local.sede_id) === referenceId
      ).map(item => _directoryKey_(item.id)).filter(Boolean);
    } else if (type === 'ESTRUCTURA_ORG') {
      const allowedIds = _directoryGetStructureIds_(structures, [referenceId], includeDescendants);
      relationIds = consistentRelations.filter(relation =>
        allowedIds.has(_directoryKey_(relation.estructura_id))
      ).map(item => _directoryKey_(item.id)).filter(Boolean);
    } else if (type === 'LOCAL') {
      // Un ámbito LOCAL autoriza las dos formas válidas de adscripción:
      // asignaciones directas al local y asignaciones vinculadas mediante
      // estructura_local. Core comprobará la localización efectiva usando
      // el mapa scopeRecordLookups en ambos casos.
      relationIds = consistentRelations.filter(relation =>
        _directoryKey_(relation.local_id) === referenceId
      ).map(item => _directoryKey_(item.id)).filter(Boolean);
      localIds = [referenceId];
    }

    if (selectedLocalId) {
      relationIds = relationIds.filter(id => {
        const relation = relationMap.get(id);
        return relation && _directoryKey_(relation.local_id) === selectedLocalId;
      });
      localIds = localIds.filter(id => id === selectedLocalId);
    }

    if (selectedSiteId) {
      relationIds = relationIds.filter(id => {
        const relation = relationMap.get(id);
        const structure = relation && structureMap.get(_directoryKey_(relation.estructura_id));
        const local = relation && localMap.get(_directoryKey_(relation.local_id));
        return structure && local &&
          _directoryKey_(structure.sede_id) === selectedSiteId &&
          _directoryKey_(local.sede_id) === selectedSiteId;
      });
      localIds = localIds.filter(id => {
        const local = localMap.get(id);
        return local && _directoryKey_(local.sede_id) === selectedSiteId;
      });
    }

    if (selectedStructureIds) {
      relationIds = relationIds.filter(id => {
        const relation = relationMap.get(id);
        return relation && selectedStructureIds.has(_directoryKey_(relation.estructura_id));
      });
      // El filtro de unidad orgánica no incluye asignaciones directas a locales.
      localIds = [];
    }

    if (relationIds.length) {
      groups.push({ estructura_local_id: Array.from(new Set(relationIds)) });
    }
    if (localIds.length) {
      groups.push({
        local_id: Array.from(new Set(localIds)),
        estructura_local_id: ''
      });
    }
  };

  scopes.forEach(scope => {
    const type = _directoryText_(scope.tipo_ambito_id).toUpperCase();
    const referenceId = _directoryKey_(scope.referencia_id);
    const includeDescendants = _directoryNormalizeBoolean_(
      scope.incluir_descendientes === undefined ? false : scope.incluir_descendientes
    );
    if (type === 'TOTAL') addScopeCandidates(scope, type, '', false);
    if (type === 'SEDE' && referenceId) addScopeCandidates(scope, type, referenceId, false);
    if (type === 'ESTRUCTURA_ORG' && referenceId) addScopeCandidates(scope, type, referenceId, includeDescendants);
    if (type === 'LOCAL' && referenceId) addScopeCandidates(scope, type, referenceId, false);
  });

  const relationValues = {};
  consistentRelations.forEach(relation => {
    const relationId = _directoryKey_(relation.id);
    const structure = structureMap.get(_directoryKey_(relation.estructura_id));
    const local = localMap.get(_directoryKey_(relation.local_id));
    if (!relationId || !structure || !local) return;
    relationValues[relationId] = {
      estructura_id: _directoryKey_(relation.estructura_id),
      local_id: _directoryKey_(relation.local_id),
      sede_id: _directoryKey_(structure.sede_id)
    };
  });
  const localValues = {};
  locals.forEach(local => {
    const id = _directoryKey_(local.id);
    if (!id) return;
    localValues[id] = {
      local_id: id,
      sede_id: _directoryKey_(local.sede_id)
    };
  });

  const search = _directoryText_(options.search);
  const searchAny = [];
  const addSearchMatches = (field, values) => {
    const ids = Array.from(new Set((values || []).map(_directoryKey_).filter(Boolean)));
    if (ids.length) searchAny.push({ field, values: ids });
  };
  if (search) {
    const peopleMatches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
      search,
      ['nombres', 'apellidos', 'correo_institucional'],
      { matchCase: false }
    );
    addSearchMatches('persona_id', (peopleMatches.records || []).map(item => item.persona_id));

    const cargoMatches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.cargos),
      search,
      ['name'],
      { matchCase: false }
    );
    addSearchMatches('cargo_id', (cargoMatches.records || []).map(item => item.id));

    const localMatches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.locales),
      search,
      ['name'],
      { matchCase: false }
    );
    const matchedLocalIds = new Set((localMatches.records || []).map(item => _directoryKey_(item.id)));
    addSearchMatches('local_id', Array.from(matchedLocalIds));
    addSearchMatches('estructura_local_id', consistentRelations.filter(item =>
      matchedLocalIds.has(_directoryKey_(item.local_id))
    ).map(item => item.id));

    const structureMatches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.estructuraOrg),
      search,
      ['name'],
      { matchCase: false }
    );
    const matchingStructureIds = _directoryGetStructureIds_(
      structures,
      (structureMatches.records || []).map(item => item.id),
      true
    );
    addSearchMatches('estructura_local_id', consistentRelations.filter(item =>
      matchingStructureIds.has(_directoryKey_(item.estructura_id))
    ).map(item => item.id));

    const siteMatches = SUNARPCore.searchRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.sedes),
      search,
      ['name'],
      { matchCase: false }
    );
    const matchingSiteIds = new Set((siteMatches.records || []).map(item => _directoryKey_(item.id)));
    addSearchMatches('estructura_local_id', consistentRelations.filter(item => {
      const structure = structureMap.get(_directoryKey_(item.estructura_id));
      return structure && matchingSiteIds.has(_directoryKey_(structure.sede_id));
    }).map(item => item.id));
    addSearchMatches('local_id', locals.filter(item =>
      matchingSiteIds.has(_directoryKey_(item.sede_id))
    ).map(item => item.id));

    if (relations.some(item => Object.prototype.hasOwnProperty.call(item, 'referencia'))) {
      const referenceMatches = SUNARPCore.searchRecordsByFields(
        _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.estructuraLocal),
        search,
        ['referencia'],
        { matchCase: false }
      );
      addSearchMatches('estructura_local_id', (referenceMatches.records || []).map(item => item.id));
    }
  }

  const authorizationForQuery = {
    context: authorization.auth,
    moduleId: authorization.moduleId,
    permissionCode: authorization.permissionCode || 'INFORMACION_PERSONAL_VER',
    structures: authorization.structures || [],
    locals: authorization.locals || [],
    scopeRecordLookups: [
      {
        recordField: 'estructura_local_id',
        values: relationValues,
        required: true,
        requireEqualFields: ['local_id']
      },
      {
        recordField: 'local_id',
        values: localValues,
        required: true
      }
    ],
    catalogSources: [
      getIntranetDataSource('SECURITY', 'Sedes', 1),
      getIntranetDataSource('SECURITY', 'EstructuraOrg', 1),
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.sedes),
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.locales),
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.estructuraOrg),
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.estructuraLocal),
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.cargos)
    ]
  };

  return {
    source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
    queryOptions: {
      filters: baseFilters,
      anyOf: groups,
      search,
      searchFields: search ? ['condicion_cargo', 'anexo', 'observaciones'] : [],
      searchAny,
      authorization: authorizationForQuery,
      cacheSeconds: DIRECTORY_ASSIGNMENT_QUERY_CACHE_TTL,
      candidateCacheSeconds: DIRECTORY_ASSIGNMENT_QUERY_CACHE_TTL,
      schemaVersion: 'directory-assignment-query-v1',
      sortBy: options.sortBy || 'order',
      sortDirection: options.sortDirection || 'asc'
    }
  };
}


/**
 * Ejecuta la consulta central de Core y enriquece solo la página devuelta.
 * idField puede cambiarse para obtener conjuntos distintos (cargos, locales,
 * personas) sin volver a cargar la tabla completa al servicio consumidor.
 */
function _directoryExecuteAssignmentQuery_(context, authorization, options, idField, offset, limit, enrich, distinctBy, distinctFields, distinctCountFields, preparedDescriptor) {
  const descriptor = preparedDescriptor || _directoryBuildAssignmentQuery_(context, authorization, options);
  const pageOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const pageLimit = Number.isInteger(limit) && limit >= 1 ? limit : 10;
  if (!descriptor.queryOptions.anyOf.length) {
    return {
      records: [], total: 0, offset: pageOffset, limit: pageLimit,
      hasMore: false, cacheHit: false
    };
  }
  if (typeof SUNARPCore.queryRecords !== 'function') {
    throw new Error('Esta operación requiere SUNARP Core v10 con consultas autorizadas y paginadas. No se debe sustituir por una lectura completa.');
  }

  const result = SUNARPCore.queryRecords(
    descriptor.source,
    Object.assign({}, descriptor.queryOptions, {
      idField: idField || 'asignacion_id',
      distinctBy: distinctBy || '',
      distinctFields: Array.isArray(distinctFields) ? distinctFields : [],
      distinctCountFields: Array.isArray(distinctCountFields) ? distinctCountFields : [],
      offset: pageOffset,
      limit: pageLimit
    })
  );
  if (!enrich) return result;

  const assignments = result.records || [];
  return Object.assign({}, result, {
    records: _directoryEnrichAssignmentRecords_(assignments, context)
  });
}

/**
 * Enriquece un lote completo de asignaciones con una sola búsqueda masiva
 * de personas y un único mapa de relaciones. La consulta de personas proyecta
 * únicamente las columnas de presentación necesarias para la tabla principal.
 */
function _directoryEnrichAssignmentRecords_(assignments, context, relationMap, diagnostics) {
  const records = Array.isArray(assignments) ? assignments : [];
  if (!records.length) {
    if (diagnostics) Object.assign(diagnostics, {
      peopleSource: 'none', uniquePeople: 0, peopleRowsLoaded: 0
    });
    return [];
  }
  const personaIds = Array.from(new Set(records.map(item =>
    _directoryKey_(item.persona_id)
  ).filter(Boolean)));
  const preloadedPeople = Array.isArray(context.personas) ? context.personas : [];
  const preloadedPeopleMap = _directoryCreateMap_(preloadedPeople, 'persona_id');
  const canUsePreloadedPeople = personaIds.every(id => preloadedPeopleMap.has(id));

  let peopleMap;
  let peopleSource;
  if (canUsePreloadedPeople) {
    if (preloadedPeopleMap.size !== preloadedPeople.length) {
      throw new Error('La tabla personas contiene identificadores duplicados o incompletos.');
    }
    peopleMap = preloadedPeopleMap;
    peopleSource = 'grouped-context';
  } else {
    // Compatibilidad para consultas puntuales que no cargan el catálogo de
    // personas completo: una única búsqueda proyectada, nunca una búsqueda
    // por asignación.
    const peopleResult = personaIds.length
      ? SUNARPCore.findRecordsByFields(
          _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
          { persona_id: personaIds },
          {
            searchField: 'persona_id',
            requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas,
            projectionFields: DIRECTORY_REQUIRED_HEADERS.personas
          }
        )
      : { records: [], total: 0 };
    const people = peopleResult.records || [];
    if (Number(peopleResult.total) !== personaIds.length || people.length !== personaIds.length) {
      throw new Error('Una o más asignaciones visibles no tienen una persona válida en el directorio.');
    }
    peopleMap = _directoryCreateMap_(people, 'persona_id');
    if (peopleMap.size !== personaIds.length) {
      throw new Error('El conjunto de personas contiene identificadores duplicados o incompletos.');
    }
    peopleSource = 'projected-batch';
  }

  if (diagnostics) Object.assign(diagnostics, {
    peopleSource,
    uniquePeople: personaIds.length,
    peopleRowsLoaded: preloadedPeople.length
  });
  const resolvedRelationMap = relationMap ||
    _directoryCreateMap_(_directoryBuildRelations_(context, false));
  return records.map(item => {
    const location = _directoryResolveAssignmentLocation_(item, context, false);
    return _directoryEnrichAssignment_(item, context, resolvedRelationMap, peopleMap, location);
  });
}


function _directoryFindAuthorizedAssignmentById_(context, authorization, asignacionId) {
  const id = _directoryKey_(asignacionId);
  if (!id) throw new Error('Debes proporcionar el identificador de la asignación.');
  const result = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    { asignacionId: id, active: 'all' },
    'asignacion_id',
    0,
    2,
    false
  );
  if (Number(result.total) > 1) {
    throw new Error('El identificador de asignación está duplicado.');
  }
  return (result.records || [])[0] || null;
}


function _directoryGetNextOrderForLocation_(context, authorization, structureLocalId, localId) {
  const queryOptions = { active: 'all' };
  if (_directoryKey_(structureLocalId)) {
    queryOptions.estructuraLocalId = _directoryKey_(structureLocalId);
  } else {
    queryOptions.localId = _directoryKey_(localId);
  }

  const result = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    queryOptions,
    'asignacion_id',
    0,
    1000,
    false
  );
  const records = result.records || [];
  if (Number(result.total) > records.length) {
    throw new Error('Hay demasiadas asignaciones en la adscripción de destino para calcular el siguiente orden de forma segura.');
  }
  const matching = records.filter(item =>
    _directoryKey_(item.estructura_local_id) === _directoryKey_(structureLocalId) &&
    _directoryKey_(item.local_id) === _directoryKey_(localId)
  );
  return _directoryGetNextOrder_(matching, structureLocalId, localId);
}


function _directoryBuildInitialAssignmentPage_(view, context) {
  const sorted = view.assignments.slice().sort((a, b) =>
    _directoryCompare_(a.order, b.order) ||
    _directoryCompare_(a.asignacion_id, b.asignacion_id)
  );
  const total = sorted.length;
  const pageSize = 10;
  const assignments = sorted.slice(0, pageSize);
  const personaIds = Array.from(new Set(
    assignments.map(item => _directoryKey_(item.persona_id)).filter(Boolean)
  ));
  const peopleResult = personaIds.length
    ? SUNARPCore.findRecordsByFields(
        _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
        { persona_id: personaIds },
        {
          searchField: 'persona_id',
          requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas
        }
      )
    : { records: [], total: 0 };
  if (peopleResult.total !== personaIds.length) {
    throw new Error('Una o más asignaciones visibles no tienen una persona válida en el directorio.');
  }
  const peopleById = _directoryCreateMap_(peopleResult.records, 'persona_id');
  return {
    records: assignments.map(item => {
      const person = peopleById.get(_directoryKey_(item.persona_id));
      return Object.assign({}, item, {
        nombres: person ? person.nombres : '',
        apellidos: person ? person.apellidos : '',
        correo_institucional: person ? person.correo_institucional : ''
      });
    }),
    total,
    page: 1,
    pageSize
  };
}

function _directoryGetAuthorizedSedeIds_(authorization, sedes) {
  const moduleAccess = (authorization.auth && authorization.auth.moduleAccess || [])
    .find(item => _directoryKey_(item.modulo_id) === _directoryKey_(authorization.moduleId));
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];
  const availableSedeIds = new Set((sedes || [])
    .filter(_directoryIsActive_)
    .map(item => _directoryKey_(item.id))
    .filter(Boolean));
  const allowedSedeIds = new Set();

  if (!scopes.length) return allowedSedeIds;

  const totalScopes = scopes.filter(scope =>
    _directoryText_(scope.tipo_ambito_id).toUpperCase() === 'TOTAL'
  );
  if (totalScopes.length) {
    // Core considera TOTAL exclusivo. No se amplía un conjunto inconsistente.
    if (scopes.length === 1 && !_directoryKey_(totalScopes[0].referencia_id)) {
      return availableSedeIds;
    }
    return allowedSedeIds;
  }

  const structures = authorization.structures || [];
  const locals = authorization.locals || [];

  scopes.forEach(scope => {
    const type = _directoryText_(scope.tipo_ambito_id).toUpperCase();
    const referenceId = _directoryKey_(scope.referencia_id);
    if (!referenceId) return;

    if (type === 'SEDE') {
      allowedSedeIds.add(referenceId);
      return;
    }

    if (type === 'ESTRUCTURA_ORG') {
      const includeDescendants = _directoryNormalizeBoolean_(
        scope.incluir_descendientes === undefined ? false : scope.incluir_descendientes
      );
      const structureIds = _directoryGetStructureIds_(
        structures, [referenceId], includeDescendants
      );
      structures.forEach(node => {
        if (structureIds.has(_directoryKey_(node.id))) {
          const sedeId = _directoryKey_(node.sede_id);
          if (sedeId) allowedSedeIds.add(sedeId);
        }
      });
      return;
    }

    if (type === 'LOCAL') {
      const local = locals.find(item => _directoryKey_(item.id) === referenceId);
      const sedeId = local ? _directoryKey_(local.sede_id) : '';
      if (sedeId) allowedSedeIds.add(sedeId);
    }
  });

  return new Set(Array.from(allowedSedeIds).filter(id => availableSedeIds.has(id)));
}

function getDirectoryInitialData() {
  const startedAt = Date.now();
  const authorizationStartedAt = Date.now();
  const moduleId = 'MOD_INFO_PERSONAL';
  const auth = requirePermission_('INFORMACION_PERSONAL_VER', moduleId);
  const authorizationElapsed = Date.now() - authorizationStartedAt;

  // El ingreso solo necesita las sedes disponibles para la identidad actual.
  // EstructuraOrg o locales solo se leen cuando un ámbito requiere resolver
  // una referencia de ese tipo. Para SEDE y TOTAL basta el catálogo de sedes.
  const moduleAccess = (auth.moduleAccess || []).find(item =>
    _directoryKey_(item.modulo_id) === moduleId
  );
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];
  const scopeTypes = new Set(scopes.map(scope =>
    _directoryText_(scope.tipo_ambito_id).toUpperCase()
  ));
  const catalogRequests = [{
    key: 'sedes',
    source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.sedes),
    requiredHeaders: ['id', 'name']
  }];

  if (scopeTypes.has('ESTRUCTURA_ORG')) {
    catalogRequests.push({
      key: 'structures',
      source: getIntranetDataSource('SECURITY', 'EstructuraOrg', 1),
      requiredHeaders: ['id', 'parent_id', 'sede_id']
    });
  }
  if (scopeTypes.has('LOCAL')) {
    catalogRequests.push({
      key: 'locals',
      source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.locales),
      requiredHeaders: ['id', 'sede_id']
    });
  }

  const catalogStartedAt = Date.now();
  const catalogs = SUNARPCore.listRecordsFromSourcesCached(
    catalogRequests,
    DIRECTORY_CATALOG_CACHE_TTL
  );
  const authorization = {
    auth,
    moduleId,
    structures: catalogs.structures || [],
    locals: catalogs.locals || []
  };
  const allSedes = catalogs.sedes || [];
  const authorizedSedeIds = _directoryGetAuthorizedSedeIds_(authorization, allSedes);
  const sedes = allSedes
    .filter(item => _directoryIsActive_(item) && authorizedSedeIds.has(_directoryKey_(item.id)))
    .map(item => ({
      id: _directoryKey_(item.id),
      name: _directoryText_(item.name),
      active: _directoryIsActive_(item)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const hasTotalScope = scopes.length === 1 &&
    _directoryText_(scopes[0].tipo_ambito_id).toUpperCase() === 'TOTAL' &&
    !_directoryKey_(scopes[0].referencia_id);
  const catalogElapsed = Date.now() - catalogStartedAt;

  const serverElapsed = Date.now() - startedAt;
  const diagnostics = {
    serverMs: serverElapsed,
    stages: {
      authorizationMs: authorizationElapsed,
      siteCatalogMs: catalogElapsed
    }
  };
  console.log('[DirectoryService] Initial site selector ms:', JSON.stringify({
    authorization: authorizationElapsed,
    siteCatalog: catalogElapsed,
    total: serverElapsed,
    authorizedSites: sedes.length,
    authorizationCatalogs: catalogRequests.map(item => item.key),
    assignmentsLoaded: 0
  }));

  return {
    catalogs: { sedes },
    scopeSummary: {
      total: hasTotalScope,
      types: Array.from(scopeTypes)
    },
    records: [],
    summary: { people: 0, assignments: 0 },
    diagnostics
  };
}





/**
 * Precalienta el contexto común de Información de personal en segundo plano.
 * La respuesta contiene únicamente tiempos y conteos; nunca devuelve datos
 * personales ni asignaciones. La autorización se vuelve a comprobar aquí.
 */
/**
 * Carga una vez todas las asignaciones autorizadas de la sede seleccionada.
 * Los filtros, la búsqueda y la paginación posteriores se ejecutan en el
 * navegador sobre esta instantánea; este endpoint no recibe filtros de tabla.
 */
function _directoryGetSiteDataCacheSources_() {
  const directorySheetKeys = [
    'personas', 'asignaciones', 'sedes', 'tiposLocal', 'locales',
    'tiposEstructura', 'estructuraOrg', 'estructuraLocal', 'cargos'
  ];
  const sources = directorySheetKeys.map(key =>
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets[key])
  );
  [
    'Sedes', 'EstructuraOrg', 'Usuarios', 'Modulos', 'Roles',
    'UsuarioRol', 'Permisos', 'RolPermiso', 'AmbitosAcceso'
  ].forEach(sheetName => {
    sources.push(getIntranetDataSource('SECURITY', sheetName, 1));
  });
  return sources;
}


function _directoryAuthorizationCacheFingerprint_(authorization) {
  const auth = authorization && authorization.auth || {};
  const moduleId = _directoryKey_(authorization && authorization.moduleId);
  const access = (auth.moduleAccess || []).find(item =>
    _directoryKey_(item.modulo_id) === moduleId
  );
  const scopes = (access && access.scopes || []).map(scope => ({
    tipo_ambito_id: _directoryKey_(scope.tipo_ambito_id),
    referencia_id: _directoryKey_(scope.referencia_id),
    incluir_descendientes: scope.incluir_descendientes,
    active: scope.active
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const snapshot = {
    personaId: _directoryKey_(auth.personaId),
    moduleId,
    permissionCode: _directoryKey_(authorization && authorization.permissionCode),
    permissionCodes: (access && access.permissionCodes || []).slice().sort(),
    scopes,
    structures: (authorization && authorization.structures || []).map(item => ({
      id: _directoryKey_(item.id),
      parent_id: _directoryKey_(item.parent_id),
      sede_id: _directoryKey_(item.sede_id),
      active: item.active
    })).sort((a, b) => a.id.localeCompare(b.id)),
    locals: (authorization && authorization.locals || []).map(item => ({
      id: _directoryKey_(item.id),
      sede_id: _directoryKey_(item.sede_id),
      active: item.active
    })).sort((a, b) => a.id.localeCompare(b.id))
  };
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(snapshot)
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}


function getDirectorySiteData(sedeId) {
  const startedAt = Date.now();
  const selectedSedeId = _directoryKey_(sedeId);
  if (!selectedSedeId) throw new Error('Debes seleccionar una sede.');

  const authorizationStartedAt = Date.now();
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const authorizationElapsed = Date.now() - authorizationStartedAt;
  const siteContextOptions = {
    includePersonalData: false,
    includePeople: true,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  };

  let siteValidationElapsed = 0;
  if (typeof SUNARPCore !== 'undefined' &&
      typeof SUNARPCore.listRecordsFromSourcesCached === 'function') {
    const validationStartedAt = Date.now();
    const siteCatalog = SUNARPCore.listRecordsFromSourcesCached([{
      key: 'sedes',
      source: _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.sedes),
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.sedes
    }], DIRECTORY_CATALOG_CACHE_TTL);
    const allowedSiteIds = _directoryGetAuthorizedSedeIds_(
      authorization, siteCatalog.sedes || []
    );
    const activeSite = (siteCatalog.sedes || []).some(item =>
      _directoryKey_(item.id) === selectedSedeId &&
      allowedSiteIds.has(selectedSedeId) &&
      _directoryIsActive_(item)
    );
    if (!activeSite) {
      throw new Error('No tienes permiso para consultar la sede seleccionada o la sede ya no está activa.');
    }
    siteValidationElapsed = Date.now() - validationStartedAt;
  }

  let result = null;
  let siteSnapshotCacheHit = false;
  let siteSnapshotCacheStored = false;
  let snapshotCacheLookupElapsed = 0;
  let snapshotSourceGenerationElapsed = 0;
  if (typeof SUNARPCore !== 'undefined' &&
      typeof SUNARPCore.getOrBuildCachedValue === 'function' &&
      _directoryKey_(authorization.auth && authorization.auth.personaId)) {
    const authorizationFingerprint = _directoryAuthorizationCacheFingerprint_(authorization);
    const cacheKey = 'directory-site-snapshot:v4:' +
      _directoryKey_(authorization.auth.personaId) + ':' +
      selectedSedeId + ':' + authorizationFingerprint;
    const cacheLookupStartedAt = Date.now();
    const cached = SUNARPCore.getOrBuildCachedValue(
      cacheKey,
      _directoryGetSiteDataCacheSources_(),
      () => _directoryBuildSiteData_(
        selectedSedeId, authorization, startedAt, authorizationElapsed,
        siteContextOptions
      ),
      DIRECTORY_SITE_SNAPSHOT_CACHE_TTL
    );
    snapshotCacheLookupElapsed = Date.now() - cacheLookupStartedAt;
    siteSnapshotCacheHit = Boolean(cached && cached.cacheHit);
    siteSnapshotCacheStored = Boolean(cached && cached.cacheStored);
    snapshotSourceGenerationElapsed = Number(cached && cached.sourceGenerationMs) || 0;
    console.log('[DirectoryService] Site snapshot cache:', JSON.stringify({
      cacheHit: siteSnapshotCacheHit,
      cacheStored: siteSnapshotCacheStored,
      cacheReason: cached && cached.cacheReason || '',
      sourceGenerationMs: snapshotSourceGenerationElapsed,
      selectedSedeId,
      durationMs: snapshotCacheLookupElapsed
    }));
    if (cached && cached.value) result = cached.value;
  }

  if (!result) {
    result = _directoryBuildSiteData_(
      selectedSedeId, authorization, startedAt, authorizationElapsed,
      siteContextOptions
    );
  }
  const requestServerMs = Date.now() - startedAt;
  const previousDiagnostics = result.diagnostics || {};
  const diagnostics = Object.assign({}, previousDiagnostics, {
    snapshotBuildMs: Number.isFinite(Number(previousDiagnostics.serverMs))
      ? Number(previousDiagnostics.serverMs)
      : null,
    serverMs: requestServerMs,
    requestServerMs,
    stages: Object.assign({}, previousDiagnostics.stages || {}, {
      authorizationMs: authorizationElapsed,
      siteValidationMs: siteValidationElapsed,
      snapshotSourceGenerationMs: snapshotSourceGenerationElapsed,
      snapshotCacheLookupMs: snapshotCacheLookupElapsed
    }),
    cache: Object.assign({}, previousDiagnostics.cache || {}, {
      siteSnapshotCacheHit,
      siteSnapshotCacheStored
    })
  });
  console.log('[DirectoryService] Site request timing:', JSON.stringify({
    selectedSedeId,
    serverMs: requestServerMs,
    siteSnapshotCacheHit,
    siteValidationMs: siteValidationElapsed,
    snapshotSourceGenerationMs: snapshotSourceGenerationElapsed,
    snapshotCacheLookupMs: snapshotCacheLookupElapsed
  }));
  return Object.assign({}, result, { diagnostics });
}


function getDirectoryAuthorizedData() {
  const startedAt = Date.now();
  const authorizationStartedAt = Date.now();
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const authorizationElapsed = Date.now() - authorizationStartedAt;
  const moduleAccess = (authorization.auth.moduleAccess || []).find(item =>
    _directoryKey_(item.modulo_id) === _directoryKey_(authorization.moduleId)
  );
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];
  const hasExclusiveTotalScope = scopes.length === 1 &&
    _directoryText_(scopes[0].tipo_ambito_id).toUpperCase() === 'TOTAL' &&
    !_directoryKey_(scopes[0].referencia_id);
  if (!hasExclusiveTotalScope) {
    throw new Error('La carga de todas las sedes requiere un ámbito TOTAL exclusivo en Información de personal.');
  }

  const siteContextOptions = {
    includePersonalData: false,
    includePeople: true,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  };
  const authorizationFingerprint = _directoryAuthorizationCacheFingerprint_(authorization);
  const cacheKey = 'directory-authorized-snapshot:v1:' +
    _directoryKey_(authorization.auth && authorization.auth.personaId) + ':' +
    authorizationFingerprint;
  const cacheStartedAt = Date.now();
  const cached = SUNARPCore.getOrBuildCachedValue(
    cacheKey,
    _directoryGetSiteDataCacheSources_(),
    () => _directoryBuildSiteData_(
      '', authorization, startedAt, authorizationElapsed, siteContextOptions
    ),
    DIRECTORY_SITE_SNAPSHOT_CACHE_TTL
  );
  if (!cached || !cached.value || !Array.isArray(cached.value.records) ||
      !cached.value.catalogs || !Array.isArray(cached.value.catalogs.sedes)) {
    throw new Error('SUNARP Core no devolvió una instantánea completa de los ámbitos autorizados.');
  }
  const diagnostics = Object.assign({}, cached.value.diagnostics || {}, {
    serverMs: Date.now() - startedAt,
    stages: Object.assign({}, cached.value.diagnostics && cached.value.diagnostics.stages || {}, {
      authorizationMs: authorizationElapsed,
      snapshotCacheLookupMs: Date.now() - cacheStartedAt
    }),
    cache: Object.assign({}, cached.value.diagnostics && cached.value.diagnostics.cache || {}, {
      authorizedSnapshotCacheHit: cached.cacheHit === true,
      authorizedSnapshotCacheStored: cached.cacheStored === true
    })
  });
  console.log('[DirectoryService] Authorized all-sites snapshot:', JSON.stringify({
    cacheHit: cached.cacheHit === true,
    cacheStored: cached.cacheStored === true,
    records: cached.value.records.length,
    authorizedSedes: cached.value.catalogs.sedes.length,
    totalMs: Date.now() - startedAt
  }));
  return Object.assign({}, cached.value, { diagnostics });
}

function _directoryBuildSiteData_(
  selectedSedeId, authorization, startedAt, authorizationElapsed, siteContextOptions
) {
  const contextStartedAt = Date.now();
  const context = _directoryLoadContext_(siteContextOptions || {
    includePersonalData: false,
    includePeople: false,
    includeAssignments: false,
    validateSnapshot: false
  });
  const contextElapsed = Date.now() - contextStartedAt;

  const authorizedSedeIds = _directoryGetAuthorizedSedeIds_(authorization, context.sedes || []);
  const allAuthorizedSites = !selectedSedeId;
  if (allAuthorizedSites) {
    const moduleAccess = (authorization.auth.moduleAccess || []).find(item =>
      _directoryKey_(item.modulo_id) === _directoryKey_(authorization.moduleId)
    );
    const scopes = moduleAccess && Array.isArray(moduleAccess.scopes) ? moduleAccess.scopes : [];
    const hasExclusiveTotalScope = scopes.length === 1 &&
      _directoryText_(scopes[0].tipo_ambito_id).toUpperCase() === 'TOTAL' &&
      !_directoryKey_(scopes[0].referencia_id);
    if (!hasExclusiveTotalScope) {
      throw new Error('La consulta agregada requiere un ámbito TOTAL exclusivo.');
    }
  } else if (!authorizedSedeIds.has(selectedSedeId)) {
    throw new Error('No tienes permiso para consultar la sede seleccionada.');
  }
  const selectedSede = allAuthorizedSites ? null : (context.sedes || []).find(item =>
    _directoryKey_(item.id) === selectedSedeId && _directoryIsActive_(item)
  );
  if (!allAuthorizedSites && !selectedSede) throw new Error('La sede seleccionada no existe o está inactiva.');

  const queryDescriptorStartedAt = Date.now();
  const assignmentQueryOptions = allAuthorizedSites
    ? { active: 'all' }
    : { active: 'all', sedeId: selectedSedeId };
  const assignmentQueryDescriptor = _directoryBuildAssignmentQuery_(
    context, authorization, assignmentQueryOptions
  );
  // Las páginas internas comparten solo la instantánea autorizada de esta
  // ejecución; Core vuelve a validar autorización y huella en cada página.
  assignmentQueryDescriptor.queryOptions.querySession = Object.create(null);
  const queryDescriptorElapsed = Date.now() - queryDescriptorStartedAt;

  const queryStartedAt = Date.now();
  let coreQueryElapsed = 0;
  let candidateCacheHits = 0;
  let authorizedSnapshotCacheHits = 0;
  let authorizedSnapshotSessionHits = 0;
  const pageSize = 1000;
  const records = [];
  let offset = 0;
  let expectedTotal = null;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    // La consulta de Core pagina asignaciones autorizadas sin repetir su
    // enriquecimiento por cada página interna. Las personas se recuperan
    // juntas después de completar el conjunto de la sede.
    const page = _directoryExecuteAssignmentQuery_(
      context,
      authorization,
      assignmentQueryOptions,
      'asignacion_id',
      offset,
      pageSize,
      false,
      '',
      [],
      [],
      assignmentQueryDescriptor
    );
    coreQueryElapsed += Number(page.durationMs) || 0;
    if (page.candidateCacheHit) candidateCacheHits++;
    if (page.authorizedSnapshotCacheHit) authorizedSnapshotCacheHits++;
    if (page.authorizedSnapshotSessionHit) authorizedSnapshotSessionHits++;
    if (expectedTotal === null) expectedTotal = Number(page.total) || 0;
    const pageRecords = page.records || [];
    records.push.apply(records, pageRecords);
    hasMore = Boolean(page.hasMore);
    pageCount++;

    if (!hasMore) break;
    if (!pageRecords.length || pageCount > 10) {
      throw new Error('No se pudo completar la carga de asignaciones de la sede. No se mostrarán resultados parciales.');
    }
    offset += pageRecords.length;
  }

  if (records.length !== (expectedTotal || 0)) {
    throw new Error('La carga de asignaciones de la sede quedó incompleta. No se mostrarán resultados parciales.');
  }
  const queryElapsed = Date.now() - queryStartedAt;
  const relationIndexStartedAt = Date.now();
  const relations = _directoryBuildRelations_(context, false);
  const relationMap = _directoryCreateMap_(relations);
  const relationIndexElapsed = Date.now() - relationIndexStartedAt;

  const peopleEnrichmentStartedAt = Date.now();
  const peopleEnrichmentDiagnostics = {};
  const enrichedRecords = _directoryEnrichAssignmentRecords_(
    records, context, relationMap, peopleEnrichmentDiagnostics
  );
  records.length = 0;
  enrichedRecords.forEach(record => records.push(record));
  const peopleEnrichmentElapsed = Date.now() - peopleEnrichmentStartedAt;

  // La consulta base ordena por el campo order, pero ese orden es local a cada
  // adscripción. Aplicar una única ordenación por ruta orgánica asegura que la
  // unidad padre aparezca antes que sus dependencias y conserva order dentro
  // de cada unidad, con asignacion_id como desempate estable.
  const hierarchySortStartedAt = Date.now();
  const hierarchyOrderedRecords = _directorySortAssignments_(records, context);
  records.length = 0;
  hierarchyOrderedRecords.forEach(record => records.push(record));
  const hierarchySortElapsed = Date.now() - hierarchySortStartedAt;

  const recordsOutsideSelectedSite = records.filter(record => {
    const recordSedeId = _directoryKey_(record.filter_sede_id || record.sede_id);
    return allAuthorizedSites
      ? (!recordSedeId || !authorizedSedeIds.has(recordSedeId))
      : recordSedeId !== selectedSedeId;
  });
  if (recordsOutsideSelectedSite.length) {
    console.error('[DirectoryService] Consulta por sede con adscripciones resueltas fuera de la sede:', JSON.stringify({
      selectedSedeId,
      count: recordsOutsideSelectedSite.length,
      sample: recordsOutsideSelectedSite.slice(0, 10).map(record => ({
        asignacion_id: _directoryKey_(record.asignacion_id),
        estructura_local_id: _directoryKey_(record.estructura_local_id),
        local_id: _directoryKey_(record.local_id),
        resolvedSedeId: _directoryKey_(record.filter_sede_id || record.sede_id),
        resolvedLocalId: _directoryKey_(record.filter_local_id || record.local_id)
      }))
    }));
    throw new Error('La consulta de la sede seleccionada devolvió asignaciones cuya adscripción se resuelve en otra sede. No se mostrarán resultados inconsistentes.');
  }
  const catalogAssemblyStartedAt = Date.now();
  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const structureTypeMap = _directoryCreateMap_(context.tiposEstructura);
  const activeStructure = (context.estructuraOrg || [])
    .filter(_directoryIsActive_)
    .map(node => {
      const type = structureTypeMap.get(_directoryKey_(node.tipo_estructura_id));
      return Object.assign({}, node, {
        path: _directoryGetStructurePath_(node, structureMap),
        tipo_estructura_name: type ? type.name : ''
      });
    });

  // La autorización consulta la réplica del libro Seguridad; la vista y sus
  // catálogos continúan utilizando la réplica de Directorios telefónicos.
  // Los catálogos de esta respuesta pertenecen exclusivamente a la sede
  // seleccionada, incluso cuando los ámbitos del usuario incluyen TOTAL.
  const siteActiveStructure = activeStructure.filter(node => {
    const nodeSedeId = _directoryKey_(node.sede_id);
    return allAuthorizedSites ? authorizedSedeIds.has(nodeSedeId) : nodeSedeId === selectedSedeId;
  });
  const permittedStructures = siteActiveStructure.filter(node =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      { estructura_id: node.id, sede_id: node.sede_id },
      authorization.structures
    )
  );
  const allowedStructureIds = new Set(
    permittedStructures.map(item => _directoryKey_(item.id))
  );
  const hierarchyDisplayIds = new Set(allowedStructureIds);
  // Los registros ya fueron autorizados. Sus estructuras y ancestros
  // orgánicos reales permiten navegar también en ámbitos LOCAL, sin ampliar
  // el conjunto de asignaciones ni heredar ubicación física a los padres.
  records.forEach(record => {
    const recordSiteId = _directoryKey_(record.filter_sede_id || record.sede_id);
    if (!recordSiteId || (allAuthorizedSites
      ? !authorizedSedeIds.has(recordSiteId)
      : recordSiteId !== selectedSedeId)) return;
    let current = structureMap.get(_directoryKey_(record.estructura_id));
    const visited = new Set();
    while (current && _directoryKey_(current.sede_id) === recordSiteId) {
      const id = _directoryKey_(current.id);
      if (!id || visited.has(id)) break;
      hierarchyDisplayIds.add(id);
      visited.add(id);
      const parentId = _directoryKey_(current.parent_id);
      current = parentId ? structureMap.get(parentId) || null : null;
    }
  });
  permittedStructures.forEach(node => {
    let current = structureMap.get(_directoryKey_(node.parent_id));
    const visited = new Set();
    while (current && (allAuthorizedSites
      ? authorizedSedeIds.has(_directoryKey_(current.sede_id))
      : _directoryKey_(current.sede_id) === selectedSedeId)) {
      const id = _directoryKey_(current.id);
      if (!id || visited.has(id)) break;
      hierarchyDisplayIds.add(id);
      visited.add(id);
      current = structureMap.get(_directoryKey_(current.parent_id));
    }
  });
  const scopedStructures = siteActiveStructure.filter(node =>
    hierarchyDisplayIds.has(_directoryKey_(node.id))
  );

  const scopedRelations = relations.filter(item => {
    const relationSedeId = _directoryKey_(item.sede_id);
    const localSedeId = _directoryKey_(item.local_sede_id);
    const siteAllowed = allAuthorizedSites
      ? authorizedSedeIds.has(relationSedeId)
      : relationSedeId === selectedSedeId;
    const relationAuthorized = _accessRecordIsAllowed_(
      authorization.auth,
      'MOD_INFO_PERSONAL',
      {
        estructura_id: _directoryKey_(item.estructura_id),
        sede_id: relationSedeId,
        local_id: _directoryKey_(item.local_id)
      },
      authorization.structures,
      authorization.locals
    );
    return item.active && siteAllowed && localSedeId === relationSedeId && relationAuthorized;
  });
  const scopedLocals = (context.locales || []).filter(local =>
    _directoryIsActive_(local) &&
    (allAuthorizedSites
      ? authorizedSedeIds.has(_directoryKey_(local.sede_id))
      : _directoryKey_(local.sede_id) === selectedSedeId) &&
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
  const localOrderResult = _directorySortLocalCatalog_(context.locales || []);
  if (!localOrderResult.orderConfigured) {
    console.warn('[DirectoryService] locales.order no está configurado; se conserva temporalmente el orden recibido hasta completar la migración del catálogo.');
  }
  const catalogLocals = localOrderResult.records.filter(local =>
    _directoryIsActive_(local) &&
    (allAuthorizedSites
      ? authorizedSedeIds.has(_directoryKey_(local.sede_id))
      : _directoryKey_(local.sede_id) === selectedSedeId) &&
    (relationLocalIds.has(_directoryKey_(local.id)) ||
      scopedLocalIds.has(_directoryKey_(local.id)))
  );
  const allowedLocalTypes = new Set(
    catalogLocals.map(item => _directoryKey_(item.tipo_local_id))
  );
  const allowedStructureTypes = new Set(
    scopedStructures.map(item => _directoryKey_(item.tipo_estructura_id))
  );

  const filterContractStartedAt = Date.now();
  const filterContract = _directoryBuildFilterContract_(
    authorization, records, scopedStructures
  );
  const filterContractElapsed = Date.now() - filterContractStartedAt;
  const selectable = filterContract.selectable || {};
  const usedCargoIds = new Set(selectable.cargoIds || []);
  const usedStructureIds = new Set(selectable.structureIds || []);
  const usedLocalIds = new Set(selectable.localIds || []);
  const scopedSedes = (context.sedes || []).filter(item =>
    _directoryIsActive_(item) &&
    authorizedSedeIds.has(_directoryKey_(item.id)) &&
    (allAuthorizedSites || _directoryKey_(item.id) === selectedSedeId)
  );
  const scopedCargos = (context.cargos || []).filter(_directoryIsActive_);

  const structureCatalogMap = _directoryCreateMap_(context.estructuraOrg);
  const localCatalogMap = _directoryCreateMap_(context.locales);
  const relationIntegrity = {
    total: (context.estructuraLocal || []).length,
    missingStructure: 0,
    missingLocal: 0,
    missingSite: 0,
    crossSite: 0,
    sample: []
  };
  (context.estructuraLocal || []).forEach(relation => {
    const structure = structureCatalogMap.get(_directoryKey_(relation.estructura_id));
    const local = localCatalogMap.get(_directoryKey_(relation.local_id));
    if (!structure) relationIntegrity.missingStructure++;
    if (!local) relationIntegrity.missingLocal++;
    if (!structure || !local) return;
    const structureSedeId = _directoryKey_(structure.sede_id);
    const localSedeId = _directoryKey_(local.sede_id);
    if (!structureSedeId || !localSedeId) relationIntegrity.missingSite++;
    else if (structureSedeId !== localSedeId) {
      relationIntegrity.crossSite++;
      if (relationIntegrity.sample.length < 10) relationIntegrity.sample.push({
        estructura_local_id: _directoryKey_(relation.id),
        estructura_id: _directoryKey_(relation.estructura_id),
        estructura_sede_id: structureSedeId,
        local_id: _directoryKey_(relation.local_id),
        local_sede_id: localSedeId
      });
    }
  });

  const catalogAndFilterContractElapsed = Date.now() - catalogAssemblyStartedAt;
  const serverElapsed = Date.now() - startedAt;
  const diagnostics = {
    serverMs: serverElapsed,
    stages: {
      authorizationMs: authorizationElapsed,
      contextMs: contextElapsed,
      queryDescriptorMs: queryDescriptorElapsed,
      assignmentQueryWallMs: queryElapsed,
      coreQueryMs: coreQueryElapsed,
      relationResolutionMs: relationIndexElapsed,
      peopleEnrichmentMs: peopleEnrichmentElapsed,
      peopleSource: peopleEnrichmentDiagnostics.peopleSource || 'unknown',
      uniquePeople: peopleEnrichmentDiagnostics.uniquePeople || 0,
      peopleRowsLoaded: peopleEnrichmentDiagnostics.peopleRowsLoaded || 0,
      hierarchySortingMs: hierarchySortElapsed,
      filterContractMs: filterContractElapsed,
      catalogAndFilterContractMs: catalogAndFilterContractElapsed
    },
    counts: {
      assignmentQueryPages: pageCount,
      assignments: records.length,
      expectedAssignments: expectedTotal || 0,
      candidateCacheHits,
      authorizedSnapshotCacheHits,
      authorizedSnapshotSessionHits
    }
  };
  console.log('[DirectoryService] Site data ms:', JSON.stringify({
    authorization: authorizationElapsed,
    context: contextElapsed,
    queryDescriptor: queryDescriptorElapsed,
    assignmentQueryWall: queryElapsed,
    coreQuery: coreQueryElapsed,
    relationResolution: relationIndexElapsed,
    peopleEnrichment: peopleEnrichmentElapsed,
    peopleSource: peopleEnrichmentDiagnostics.peopleSource || 'unknown',
    uniquePeople: peopleEnrichmentDiagnostics.uniquePeople || 0,
    peopleRowsLoaded: peopleEnrichmentDiagnostics.peopleRowsLoaded || 0,
    hierarchySort: hierarchySortElapsed,
    filterContract: filterContractElapsed,
    catalogAndFilterContract: catalogAndFilterContractElapsed,
    total: serverElapsed,
    selectedSedeId: allAuthorizedSites ? 'ALL_AUTHORIZED' : selectedSedeId,
    candidatePages: pageCount,
    candidateCacheHits,
    authorizedSnapshotCacheHits,
    authorizedSnapshotSessionHits,
    records: records.length,
    totalAssignments: expectedTotal || 0,
    siteCatalogsRestricted: true,
    allAuthorizedSites,
    localOrderConfigured: localOrderResult.orderConfigured,
    localOrderMissingCount: localOrderResult.missingOrderCount,
    relationIntegrity
  }));

  return {
    catalogs: {
      sedes: scopedSedes,
      tiposLocal: (context.tiposLocal || []).filter(item =>
        _directoryIsActive_(item) && allowedLocalTypes.has(_directoryKey_(item.id))
      ),
      locales: catalogLocals,
      tiposEstructura: (context.tiposEstructura || []).filter(item =>
        _directoryIsActive_(item) && allowedStructureTypes.has(_directoryKey_(item.id))
      ),
      tiposDocumento: (context.documentTypes || [])
        .filter(_directoryIsActive_)
        .map(item => ({ id: _directoryKey_(item.id), name: _directoryText_(item.name) })),
      estructuraOrg: scopedStructures,
      estructuraLocal: scopedRelations,
      cargos: scopedCargos,
      filterContract,
      filterVisibility: {
        sede: allAuthorizedSites && scopedSedes.length > 1,
        local: usedLocalIds.size > 0,
        cargo: usedCargoIds.size > 1,
        hierarchy: usedStructureIds.size > 0
      },
      localOrder: {
        configured: localOrderResult.orderConfigured,
        missingOrderCount: localOrderResult.missingOrderCount,
        semantics: 'order entero positivo y único por sede_id y parent_id'
      }
    },
    records,
    summary: {
      people: new Set(records.map(item => _directoryKey_(item.persona_id)).filter(Boolean)).size,
      assignments: records.length
    },
    diagnostics
  };
}


function listDirectoryPeople(options) {
  options = options || {};
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });

  const activeFilter = options.active === undefined ? true : options.active;
  if (activeFilter !== 'all' && typeof activeFilter !== 'boolean') {
    throw new Error('El filtro active debe ser true, false o "all".');
  }

  const offset = options.offset === undefined ? 0 : Number(options.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset no es válido.');
  const limit = options.limit === undefined || options.limit === null
    ? 25
    : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit debe estar entre 1 y 100.');
  }

  // La primera consulta aplica filtros y ámbito sobre las asignaciones y
  // colapsa por persona. persona_id es también la clave de orden estable.
  const peoplePage = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    {
      active: activeFilter,
      search: options.search,
      sortBy: 'persona_id',
      sortDirection: 'asc'
    },
    'asignacion_id',
    offset,
    limit,
    false,
    'persona_id'
  );

  const pageAssignments = peoplePage.records || [];
  const personaIds = Array.from(new Set(pageAssignments.map(item =>
    _directoryKey_(item.persona_id)
  ).filter(Boolean)));
  if (!personaIds.length) {
    return {
      records: [],
      total: Number(peoplePage.total) || 0,
      offset,
      limit,
      hasMore: Boolean(peoplePage.hasMore)
    };
  }

  // La identidad solo se consulta para las personas que aparecerán en la página.
  const peopleResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: personaIds },
    {
      searchField: 'persona_id',
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas
    }
  );
  const people = peopleResult.records || [];
  const peopleMap = _directoryCreateMap_(people, 'persona_id');
  if (people.length !== personaIds.length || peopleMap.size !== personaIds.length) {
    throw new Error('Una o más asignaciones autorizadas no tienen una identidad válida en el directorio.');
  }

  // La segunda consulta recupera todas las asignaciones visibles solo de la
  // página actual, sin repetir el filtro de búsqueda/estado de selección.
  const assignmentPage = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    {
      personaIds,
      active: 'all',
      sortBy: 'order',
      sortDirection: 'asc'
    },
    'asignacion_id',
    0,
    1000,
    false
  );
  if (Number(assignmentPage.total) > (assignmentPage.records || []).length) {
    throw new Error('Las personas de la página superan el límite de asignaciones recuperables en una sola consulta.');
  }

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const assignmentsByPerson = new Map();
  (assignmentPage.records || []).forEach(item => {
    const personaId = _directoryKey_(item.persona_id);
    const person = peopleMap.get(personaId);
    if (!person) throw new Error('Una asignación visible no tiene una persona válida.');
    const location = _directoryResolveAssignmentLocation_(item, context, false);
    const enriched = _directoryEnrichAssignment_(
      item,
      context,
      relationMap,
      peopleMap,
      location
    );
    if (!assignmentsByPerson.has(personaId)) assignmentsByPerson.set(personaId, []);
    assignmentsByPerson.get(personaId).push(enriched);
  });

  const records = personaIds.map(personaId => {
    const person = peopleMap.get(personaId);
    return Object.assign({}, person, {
      assignments: assignmentsByPerson.get(personaId) || []
    });
  });

  return {
    records,
    total: Number(peoplePage.total) || 0,
    offset,
    limit,
    hasMore: Boolean(peoplePage.hasMore)
  };
}

function listDirectoryAssignments(options) {
  const totalStartedAt = Date.now();
  options = options || {};
  const authStartedAt = Date.now();
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const authElapsed = Date.now() - authStartedAt;
  const contextStartedAt = Date.now();
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const contextElapsed = Date.now() - contextStartedAt;

  let offset;
  let limit;
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
    limit = options.limit === undefined || options.limit === null ? 1000 : Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error('limit debe estar entre 1 y 1000.');
    }
  }

  const queryStartedAt = Date.now();
  const includeCargoOptions = options.includeCargoOptions === true;
  const result = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    options,
    'asignacion_id',
    offset,
    limit,
    true,
    '',
    includeCargoOptions ? ['cargo_id'] : [],
    []
  );
  const availableCargoIds = new Set(
    result.distinctValues && result.distinctValues.cargo_id || []
  );
  const cargoOptions = includeCargoOptions
    ? (context.cargos || [])
        .filter(item => _directoryIsActive_(item) &&
          availableCargoIds.has(_directoryKey_(item.id)))
        .map(item => ({ id: _directoryKey_(item.id), name: _directoryText_(item.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : null;
  console.log('[DirectoryService] Assignment page ms:', JSON.stringify({
    authorization: authElapsed,
    context: contextElapsed,
    queryAndHydration: Date.now() - queryStartedAt,
    total: Date.now() - totalStartedAt,
    page: page || 1,
    pageSize: limit,
    cargoOptions: includeCargoOptions,
    rows: (result.records || []).length,
    totalRows: Number(result.total) || 0
  }));
  return {
    records: result.records || [],
    total: Number(result.total) || 0,
    offset,
    limit,
    page,
    pageSize,
    ...(includeCargoOptions ? { cargoOptions } : {})
  };
}


function getDirectoryPersonById(personaId) {
  const id = _directoryKey_(personaId);
  if (!id) throw new Error('Debes proporcionar persona_id.');
  const authorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });

  // Core consulta únicamente las asignaciones de esta persona y aplica su
  // autorización antes de devolver cualquier fila al servicio de negocio.
  const assignmentResult = _directoryExecuteAssignmentQuery_(
    context,
    authorization,
    { personaId: id, active: 'all', sortBy: 'order' },
    'asignacion_id',
    0,
    1000,
    false
  );
  const assignments = assignmentResult.records || [];
  if (!assignments.length) return null;
  if (Number(assignmentResult.total) > assignments.length) {
    throw new Error('La persona supera el límite de asignaciones recuperables en una sola consulta.');
  }

  const personResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: id },
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
    { servidor_id: id },
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
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: false,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const assignment = _directoryFindAuthorizedAssignmentById_(
    context, authorization, asignacionId
  );
  if (!assignment) return null;

  const personResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas),
    { persona_id: _directoryKey_(assignment.persona_id) },
    { searchField: 'persona_id', requiredHeaders: DIRECTORY_REQUIRED_HEADERS.personas }
  );
  if (personResult.total !== 1) {
    throw new Error('No se pudo resolver la identidad de la persona asignada.');
  }
  context.personas = personResult.records;
  const location = _directoryResolveAssignmentLocation_(assignment, context, false);
  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  return _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap, location);
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
    includeAssignments: false,
    includeDocumentTypes: false
  });

  const existing = isUpdate ? _directoryFindPersonById_(personaId) : null;
  if (isUpdate && !existing) throw new Error('No se encontró la persona "' + personaId + '".');
  if (isUpdate) {
    const linkedResult = SUNARPCore.findRecordsByFields(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
      { persona_id: personaId },
      {
        searchField: 'persona_id',
        requiredHeaders: DIRECTORY_REQUIRED_HEADERS.asignaciones
      }
    );
    _directoryAssertPersonMutationScope_(authorization, existing, linkedResult.records, context);
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
    includeAssignments: false,
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
  const assignmentsResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
    { persona_id: personaId },
    {
      searchField: 'persona_id',
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.asignaciones
    }
  );
  const linkedAssignments = assignmentsResult.records || [];
  const createWithoutAssignment = allowUnassigned === true && !linkedAssignments.length;
  const authorization = _directoryAuthorizationContext_(
    createWithoutAssignment ? 'INFORMACION_PERSONAL_CREAR' : 'INFORMACION_PERSONAL_EDITAR'
  );
  if (!createWithoutAssignment) {
    _directoryAssertPersonMutationScope_(authorization, person, linkedAssignments, context);
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
    const assignmentAuthorization = _directoryAuthorizationContext_('INFORMACION_PERSONAL_EDITAR');
    const snapshot = _directoryLoadContext_({
      includePersonalData: false,
      includePeople: false,
      includeAssignments: false,
      includeDocumentTypes: false,
      validateSnapshot: false
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
    const previousAssignment = _directoryFindAuthorizedAssignmentById_(
      snapshot,
      assignmentAuthorization,
      assignmentId
    );
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
    includeAssignments: !isUpdate,
    includeDocumentTypes: false,
    validateSnapshot: !isUpdate
  });

  const existing = isUpdate
    ? _directoryFindAuthorizedAssignmentById_(context, authorization, assignmentId)
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
    record.order = isUpdate
      ? _directoryGetNextOrderForLocation_(
          context,
          authorization,
          record.estructura_local_id,
          record.local_id
        )
      : _directoryGetNextOrder_(
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
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const id = _directoryText_(asignacionId);
  const existing = _directoryFindAuthorizedAssignmentById_(context, authorization, id);
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
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const existing = _directoryFindAuthorizedAssignmentById_(context, authorization, id);
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
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const person = _directoryFindPersonById_(id);
  if (!person) throw new Error('No se encontró la persona "' + id + '".');

  const linkedResult = SUNARPCore.findRecordsByFields(
    _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
    { persona_id: id },
    {
      searchField: 'persona_id',
      requiredHeaders: DIRECTORY_REQUIRED_HEADERS.asignaciones
    }
  );
  const linkedAssignments = linkedResult.records || [];

  _directoryAssertPersonMutationScope_(
    authorization,
    person,
    linkedAssignments,
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


function warmDirectoryContextCache() {
  const startedAt = Date.now();
  const authorizationStartedAt = Date.now();
  _directoryAuthorizationContext_('INFORMACION_PERSONAL_VER');
  const authorizationElapsed = Date.now() - authorizationStartedAt;

  const contextStartedAt = Date.now();
  const context = _directoryLoadContext_({
    includePersonalData: false,
    includePeople: true,
    includeAssignments: false,
    includeDocumentTypes: false,
    validateSnapshot: false
  });
  const contextElapsed = Date.now() - contextStartedAt;
  const result = {
    warmed: true,
    serverMs: Date.now() - startedAt,
    authorizationMs: authorizationElapsed,
    contextMs: contextElapsed,
    peopleRowsLoaded: (context.personas || []).length,
    catalogCounts: {
      sites: (context.sedes || []).length,
      locals: (context.locales || []).length,
      structures: (context.estructuraOrg || []).length,
      structureLocalRelations: (context.estructuraLocal || []).length
    }
  };
  console.log('[DirectoryService] Context cache warmup:', JSON.stringify(result));
  return result;
}
