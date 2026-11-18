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

const DIRECTORY_CACHE_KEY = 'gestor-intranet:directory-context:v2';
const DIRECTORY_CACHE_TTL = 300;

const DIRECTORY_REQUIRED_HEADERS = Object.freeze({
  personas: ['persona_id', 'nombres', 'apellidos'],
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

function _directoryAssertUnique_(records, field, label) {
  const seen = new Set();
  (records || []).forEach(record => {
    const value = _directoryKey_(record[field]);
    if (!value) throw new Error('Existe un registro sin ' + field + ' en ' + label + '.');
    if (seen.has(value)) throw new Error('Se encontró un identificador duplicado en ' + label + ': ' + value + '.');
    seen.add(value);
  });
}

function _directorySource_(sheetName) {
  return getIntranetDataSource(
    DIRECTORY_SERVICE_CONFIG.sourceKey,
    sheetName,
    1
  );
}

function _directoryAuthorizationContext_(permissionCode) {
  const auth = requirePermission_(permissionCode || 'DIRECTORIOS_VER');
  const catalog = _accessOrgCatalog_();

  return {
    auth: auth,
    structures: catalog.estructuraOrg || []
  };
}

function _directoryAssertScope_(authorization, record, actionLabel) {
  const allowed = _accessRecordIsAllowed_(
    authorization.auth,
    'DIRECTORIOS',
    record,
    authorization.structures
  );

  if (allowed) return true;

  _accessWriteAudit_(authorization.auth, {
    accion: 'AUTORIZACION_DENEGADA',
    modulo: 'DIRECTORIOS',
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

function _directoryAssertPersonMutationScope_(authorization, person, assignments, relationMap) {
  const linked = (assignments || []).filter(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(person.persona_id)
  );

  if (!linked.length) {
    // Sin asignaciones no existe una adscripción con la que comprobar
    // un ámbito SEDE o ESTRUCTURA_ORG. Solo un ámbito TOTAL autoriza
    // modificar una identidad que no tenga adscripción operativa.
    _directoryAssertScope_(
      authorization,
      { persona_id: person.persona_id, nombres: person.nombres, apellidos: person.apellidos },
      'La persona no tiene asignaciones para determinar su ámbito organizacional.'
    );
    return true;
  }

  linked.forEach(assignment => {
    const relation = relationMap.get(_directoryKey_(assignment.estructura_local_id));
    if (!relation) {
      throw new Error('Una asignación de la persona tiene una relación organizacional inexistente.');
    }

    _directoryAssertScope_(
      authorization,
      {
        persona_id: person.persona_id,
        asignacion_id: assignment.asignacion_id,
        nombres: person.nombres,
        apellidos: person.apellidos,
        estructura_id: relation.estructura_id,
        sede_id: relation.sede_id
      },
      'La modificación de la identidad afectaría una asignación fuera del ámbito autorizado.'
    );
  });
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

    const structurePath = _directoryGetStructurePath_(structure, structureMap);
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

function _directoryValidateSnapshot_(context) {
  _directoryAssertUnique_(context.personas, 'persona_id', 'personas');
  _directoryAssertUnique_(context.asignaciones, 'asignacion_id', 'asignaciones');

  const peopleIds = new Set(context.personas.map(item => _directoryKey_(item.persona_id)));
  const cargoIds = new Set(context.cargos.map(item => _directoryKey_(item.id)));
  const localIds = new Set(context.locales.map(item => _directoryKey_(item.id)));
  const structureIds = new Set(context.estructuraOrg.map(item => _directoryKey_(item.id)));
  const relationMap = _directoryCreateMap_(context.estructuraLocal);
  _directoryAssertUnique_(context.estructuraLocal, 'id', 'estructura_local');

  context.estructuraLocal.forEach(relation => {
    if (!structureIds.has(_directoryKey_(relation.estructura_id))) {
      throw new Error('La relación estructura_local ' + _directoryKey_(relation.id) + ' referencia una estructura orgánica inexistente.');
    }
    if (!localIds.has(_directoryKey_(relation.local_id))) {
      throw new Error('La relación estructura_local ' + _directoryKey_(relation.id) + ' referencia un local inexistente.');
    }
  });

  context.asignaciones.forEach(assignment => {
    const assignmentId = _directoryKey_(assignment.asignacion_id);

    if (!peopleIds.has(_directoryKey_(assignment.persona_id))) {
      throw new Error('La asignación ' + assignmentId + ' referencia una persona inexistente.');
    }

    if (!cargoIds.has(_directoryKey_(assignment.cargo_id))) {
      throw new Error('La asignación ' + assignmentId + ' referencia un cargo inexistente.');
    }

    const relation = relationMap.get(_directoryKey_(assignment.estructura_local_id));
    if (!relation) {
      throw new Error('La asignación ' + assignmentId + ' referencia una relación estructura_local inexistente.');
    }

    if (!localIds.has(_directoryKey_(assignment.local_id))) {
      throw new Error('La asignación ' + assignmentId + ' referencia un local inexistente.');
    }

    if (_directoryKey_(relation.local_id) !== _directoryKey_(assignment.local_id)) {
      throw new Error('La asignación ' + assignmentId + ' tiene un local_id que no corresponde a su estructura_local_id.');
    }
  });
}

function _directoryLoadContextFromSheets_() {
  const sheetMap = [
    ['personas', 'personas'],
    ['asignaciones', 'asignaciones'],
    ['sedes', 'sede'],
    ['tiposLocal', 'tipos_local'],
    ['locales', 'locales'],
    ['tiposEstructura', 'tipos_estructura'],
    ['estructuraOrg', 'estructura_org'],
    ['estructuraLocal', 'estructura_local'],
    ['cargos', 'cargos']
  ];

  const requests = sheetMap.map(item => ({
    key: item[0],
    source: _directorySource_(item[1])
  }));

  const context = SUNARPCore.listRecordsFromSources(requests);

  _directoryValidateHeaders_(context);
  _directoryValidateSnapshot_(context);

  return context;
}

function _directoryLoadContext_() {
  try {
    const cached = SUNARPCore.getCachedValue(DIRECTORY_CACHE_KEY);
    if (cached !== null) return cached;
  } catch (error) {
    console.warn('[DirectoryService] Error al consultar caché:', error.message);
  }

  const context = _directoryLoadContextFromSheets_();

  try {
    const result = SUNARPCore.putCachedValue(
      DIRECTORY_CACHE_KEY,
      context,
      DIRECTORY_CACHE_TTL
    );
    console.log('[DirectoryService] Contexto almacenado en caché:', result.sizeBytes, 'bytes');
  } catch (error) {
    console.warn('[DirectoryService] No se pudo almacenar caché:', error.message);
  }

  return context;
}

function _directoryInvalidateCache_() {
  SUNARPCore.removeCachedValue(DIRECTORY_CACHE_KEY);
}

/**
 * La hoja de datos personales es complementaria y no participa
 * en la carga ni en la caché ordinaria del directorio.
 *
 * Su relación es 1:1: servidores datos personales.servidor_id
 * contiene el mismo identificador que personas.persona_id.
 * No se crea una columna persona_id adicional ni una relación paralela.
 */
function _directoryLoadPersonalDataLinks_() {
  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales);

  let info;
  try {
    info = SUNARPCore.getSourceInfo(source);
  } catch (error) {
    if (String(error.message || error).toLowerCase().includes('no existe la pestaña')) {
      return [];
    }
    throw error;
  }

  const expectedHeaders = [
    'servidor_id',
    'tipo_documento',
    'numero_documento',
    'fecha_nacimiento',
    'fecha_inicio_servicios',
    'fecha_cese'
  ];
  const missing = expectedHeaders.filter(header => !info.headers.includes(header));
  if (missing.length) {
    throw new Error(
      'La pestaña "' + DIRECTORY_SERVICE_CONFIG.sheets.datosPersonales +
      '" no contiene los encabezados requeridos: ' + missing.join(', ') + '.'
    );
  }

  const records = SUNARPCore.listRecords(source, {}).records;

  // Se descartan expresamente los datos personales: solo se conserva
  // la clave necesaria para comprobar integridad referencial.
  return records.map(record => _directoryKey_(record.servidor_id)).filter(Boolean);
}

function _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap) {
  const relation = relationMap.get(_directoryKey_(assignment.estructura_local_id));
  const person = peopleMap.get(_directoryKey_(assignment.persona_id));
  const cargo = context.cargos.find(item =>
    _directoryKey_(item.id) === _directoryKey_(assignment.cargo_id)
  );

  return Object.assign({}, assignment, {
    nombres: person ? person.nombres : '',
    apellidos: person ? person.apellidos : '',
    cargo_name: cargo ? cargo.name : '',
    estructura_id: relation ? relation.estructura_id : '',
    estructura_name: relation ? relation.estructura_name : '',
    estructura_path: relation ? relation.estructura_path : '',
    sede_id: relation ? relation.sede_id : '',
    sede_name: relation ? relation.sede_name : '',
    local_name: relation ? relation.local_name : '',
    referencia: relation ? relation.referencia : '',
    display_location: relation ? relation.display_name : ''
  });
}

function _directoryBuildView_(context, authorization) {
  const relations = _directoryBuildRelations_(context, false);
  const relationMap = _directoryCreateMap_(relations);
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');

  const assignments = context.asignaciones.map(item =>
    _directoryEnrichAssignment_(item, context, relationMap, peopleMap)
  ).filter(record => {
    const relation = relationMap.get(_directoryKey_(record.estructura_local_id));
    return relation && _accessRecordIsAllowed_(
      authorization.auth,
      'DIRECTORIOS',
      {
        estructura_id: relation.estructura_id,
        sede_id: relation.sede_id
      },
      authorization.structures
    );
  });

  const visiblePersonIds = new Set(assignments.map(item => _directoryKey_(item.persona_id)));
  const hasTotalScope = _accessRecordIsAllowed_(
    authorization.auth,
    'DIRECTORIOS',
    {},
    authorization.structures
  );
  const people = context.personas.filter(person =>
    hasTotalScope || visiblePersonIds.has(_directoryKey_(person.persona_id))
  );

  return {
    people: people,
    assignments: assignments,
    relations: relations,
    relationMap: relationMap
  };
}

function _directorySortAssignments_(records, context) {
  const structureMap = _directoryCreateMap_(context.estructuraOrg);
  const relations = _directoryBuildRelations_(context, false);
  const relationMap = _directoryCreateMap_(relations);
  const sedeOrder = new Map();

  context.sedes.forEach((sede, index) => sedeOrder.set(_directoryKey_(sede.id), index));

  const pathMap = new Map();
  context.estructuraOrg.forEach(node => {
    pathMap.set(
      _directoryKey_(node.id),
      _directoryGetStructureOrderPath_(node.id, structureMap)
    );
  });

  records.sort((a, b) => {
    const relationA = relationMap.get(_directoryKey_(a.estructura_local_id));
    const relationB = relationMap.get(_directoryKey_(b.estructura_local_id));

    const sedeA = relationA ? (sedeOrder.get(_directoryKey_(relationA.sede_id)) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const sedeB = relationB ? (sedeOrder.get(_directoryKey_(relationB.sede_id)) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    if (sedeA !== sedeB) return sedeA - sedeB;

    const pathA = relationA ? pathMap.get(_directoryKey_(relationA.estructura_id)) || [] : [];
    const pathB = relationB ? pathMap.get(_directoryKey_(relationB.estructura_id)) || [] : [];
    const pathDifference = _directoryCompareStructurePaths_(pathA, pathB);
    if (pathDifference !== 0) return pathDifference;

    const orderDifference = _directoryCompare_(Number(a.order), Number(b.order));
    if (orderDifference !== 0) return orderDifference;

    return _directoryCompare_(a.apellidos, b.apellidos) ||
      _directoryCompare_(a.nombres, b.nombres);
  });

  return records;
}

function _directoryGetPersonSchema_() {
  return {
    persona_id: { label: 'Identificador de persona', required: true, type: 'string', maxLength: 30 },
    nombres: { label: 'Nombres', required: true, type: 'string', minLength: 2, maxLength: 100 },
    apellidos: { label: 'Apellidos', required: true, type: 'string', minLength: 2, maxLength: 150 }
  };
}

/**
 * Aplica el mismo criterio de identidad utilizado en la migración:
 * coincidencia exacta de nombres + apellidos.
 *
 * No compara cargo, anexo, estructura ni local, porque esas diferencias
 * corresponden a asignaciones distintas de una misma persona.
 * No fusiona registros automáticamente.
 */
function _directoryAssertNoDuplicatePerson_(record, people) {
  const duplicate = (people || []).find(person =>
    _directoryKey_(person.persona_id) !== _directoryKey_(record.persona_id) &&
    _directoryText_(person.nombres) === _directoryText_(record.nombres) &&
    _directoryText_(person.apellidos) === _directoryText_(record.apellidos)
  );

  if (duplicate) {
    throw new Error(
      'Ya existe una persona con exactamente los mismos nombres y apellidos ' +
      '( ' + _directoryKey_(duplicate.persona_id) + ' ). ' +
      'No se creó ni fusionó ningún registro. Revisa la identidad antes de continuar.'
    );
  }
}

function _directoryGetAssignmentSchema_() {
  return {
    asignacion_id: { label: 'Identificador de asignación', required: true, type: 'string', maxLength: 30 },
    persona_id: { label: 'Persona', required: true, type: 'string', maxLength: 30 },
    cargo_id: { label: 'Cargo', required: true, type: 'string' },
    condicion_cargo: { label: 'Condición del cargo', type: 'string', maxLength: 150 },
    anexo: { label: 'Anexo', type: 'integer', min: 1, max: 99999 },
    estructura_local_id: { label: 'Relación estructura-local', required: true, type: 'string' },
    local_id: { label: 'Local', required: true, type: 'string' },
    observaciones: { label: 'Observaciones', type: 'string', maxLength: 1000 },
    active: { label: 'Estado', required: true, type: 'boolean' },
    order: { label: 'Orden', required: true, type: 'integer', min: 1 }
  };
}

function _directoryValidateAssignmentReferences_(record, context) {
  const person = context.personas.find(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(record.persona_id)
  );
  if (!person) throw new Error('La persona seleccionada no existe.');

  const cargo = context.cargos.find(item =>
    _directoryKey_(item.id) === _directoryKey_(record.cargo_id)
  );
  if (!cargo || !_directoryIsActive_(cargo)) {
    throw new Error('El cargo seleccionado no existe o está inactivo.');
  }

  const relation = _directoryBuildRelations_(context, true).find(item =>
    _directoryKey_(item.id) === _directoryKey_(record.estructura_local_id)
  );
  if (!relation) {
    throw new Error('La relación estructura-local no existe o está inactiva.');
  }

  if (_directoryKey_(relation.local_id) !== _directoryKey_(record.local_id)) {
    throw new Error('El local seleccionado no corresponde a la relación estructura-local.');
  }

  return relation;
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

function _directoryGetNextOrder_(assignments, structureLocalId) {
  let maximum = 0;

  (assignments || []).forEach(record => {
    if (_directoryKey_(record.estructura_local_id) !== _directoryKey_(structureLocalId)) return;
    const order = Number(record.order);
    if (Number.isInteger(order) && order > maximum) maximum = order;
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
  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');
  const context = _directoryLoadContext_();
  const view = _directoryBuildView_(context, authorization);

  const activeStructure = context.estructuraOrg.filter(_directoryIsActive_).map(node => {
    const structureMap = _directoryCreateMap_(context.estructuraOrg);
    const type = context.tiposEstructura.find(item =>
      _directoryKey_(item.id) === _directoryKey_(node.tipo_estructura_id)
    );

    return Object.assign({}, node, {
      path: _directoryGetStructurePath_(node, structureMap),
      tipo_estructura_name: type ? type.name : ''
    });
  });

  const scopedStructures = activeStructure.filter(node =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'DIRECTORIOS',
      { estructura_id: node.id, sede_id: node.sede_id },
      authorization.structures
    )
  );

  const allowedStructureIds = new Set(scopedStructures.map(item => _directoryKey_(item.id)));
  const scopedRelations = view.relations.filter(item =>
    item.active && allowedStructureIds.has(_directoryKey_(item.estructura_id))
  );

  const allowedLocalIds = new Set(scopedRelations.map(item => _directoryKey_(item.local_id)));
  const allowedSedeIds = new Set(scopedStructures.map(item => _directoryKey_(item.sede_id)));
  const allowedLocalTypes = new Set(
    context.locales.filter(item => allowedLocalIds.has(_directoryKey_(item.id)))
      .map(item => _directoryKey_(item.tipo_local_id))
  );
  const allowedStructureTypes = new Set(
    scopedStructures.map(item => _directoryKey_(item.tipo_estructura_id))
  );

  const assignments = _directorySortAssignments_(view.assignments.slice(), context);

  return {
    catalogs: {
      sedes: context.sedes.filter(item => _directoryIsActive_(item) && allowedSedeIds.has(_directoryKey_(item.id))),
      tiposLocal: context.tiposLocal.filter(item => _directoryIsActive_(item) && allowedLocalTypes.has(_directoryKey_(item.id))),
      locales: context.locales.filter(item => _directoryIsActive_(item) && allowedLocalIds.has(_directoryKey_(item.id))),
      tiposEstructura: context.tiposEstructura.filter(item => _directoryIsActive_(item) && allowedStructureTypes.has(_directoryKey_(item.id))),
      estructuraOrg: scopedStructures,
      estructuraLocal: scopedRelations,
      cargos: context.cargos.filter(_directoryIsActive_)
    },
    people: view.people,
    assignments: assignments,
    summary: {
      people: view.people.length,
      assignments: assignments.length
    }
  };
}

function listDirectoryPeople(options) {
  options = options || {};
  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');
  const context = _directoryLoadContext_();
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
  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');
  const context = _directoryLoadContext_();
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

  const search = _directoryText_(options.search).toLocaleLowerCase();
  if (search) {
    const fields = [
      'nombres', 'apellidos', 'cargo_name', 'condicion_cargo',
      'anexo', 'estructura_name', 'estructura_path', 'local_name',
      'sede_name', 'referencia', 'observaciones'
    ];

    view.assignments = view.assignments.filter(record =>
      fields.some(field => _directoryText_(record[field]).toLocaleLowerCase().includes(search))
    );
  }

  const sortBy = options.sortBy || 'order';
  const directionValue = _directoryText_(options.sortDirection || 'asc').toLowerCase();
  if (!['asc', 'desc'].includes(directionValue)) throw new Error('sortDirection debe ser "asc" o "desc".');

  const direction = directionValue === 'desc' ? -1 : 1;
  view.assignments.sort((a, b) =>
    _directoryCompare_(a[sortBy], b[sortBy]) * direction ||
    _directoryCompare_(a.apellidos, b.apellidos) ||
    _directoryCompare_(a.nombres, b.nombres)
  );

  const total = view.assignments.length;
  const offset = options.offset === undefined ? 0 : Number(options.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset no es válido.');

  let limit = null;
  if (options.limit !== undefined && options.limit !== null) {
    limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 0) throw new Error('limit no es válido.');
    view.assignments = view.assignments.slice(offset, offset + limit);
  } else {
    view.assignments = view.assignments.slice(offset);
  }

  return {
    records: view.assignments,
    total: total,
    offset: offset,
    limit: limit
  };
}

function getDirectoryPersonById(personaId) {
  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');
  const context = _directoryLoadContext_();
  const person = context.personas.find(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(personaId)
  );
  if (!person) return null;

  const view = _directoryBuildView_(context, authorization);
  const assignments = view.assignments.filter(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(personaId)
  );

  if (!assignments.length && context.asignaciones.some(item =>
    _directoryKey_(item.persona_id) === _directoryKey_(personaId)
  )) {
    throw new Error('No tienes ámbito de acceso para consultar esta persona.');
  }

  if (!assignments.length) return null;

  return Object.assign({}, person, { assignments: assignments });
}

function getDirectoryAssignmentsByPersonId(personaId, options) {
  options = Object.assign({}, options || {}, { personaId: personaId, active: 'all' });
  return listDirectoryAssignments(options);
}

function getDirectoryAssignmentById(asignacionId) {
  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');
  const context = _directoryLoadContext_();
  const assignment = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === _directoryKey_(asignacionId)
  );
  if (!assignment) return null;

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const enriched = _directoryEnrichAssignment_(assignment, context, relationMap, peopleMap);

  const relation = relationMap.get(_directoryKey_(assignment.estructura_local_id));
  _directoryAssertScope_(
    authorization,
    Object.assign({}, enriched, {
      estructura_id: relation ? relation.estructura_id : '',
      sede_id: relation ? relation.sede_id : ''
    }),
    'Consulta de una asignación fuera del ámbito asignado.'
  );

  return enriched;
}

/**
 * Crea o actualiza exclusivamente la identidad de una persona.
 * No se fusionan personas por coincidencia de nombres o apellidos:
 * esos campos no permiten distinguir homónimos.
 */
function saveDirectoryPerson(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos de la persona.');
  }

  _directoryAssertAllowedFields_(
    payload,
    ['persona_id', 'nombres', 'apellidos'],
    'personas'
  );

  const personaId = _directoryText_(payload.persona_id);
  const isUpdate = Boolean(personaId);
  const authorization = _directoryAuthorizationContext_(
    isUpdate ? 'DIRECTORIOS_EDITAR' : 'DIRECTORIOS_CREAR'
  );
  const context = _directoryLoadContext_();

  const existing = isUpdate
    ? context.personas.find(item => _directoryKey_(item.persona_id) === personaId)
    : null;

  if (isUpdate && !existing) {
    throw new Error('No se encontró la persona "' + personaId + '".');
  }

  if (isUpdate) {
    const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
    _directoryAssertPersonMutationScope_(
      authorization,
      existing,
      context.asignaciones,
      relationMap
    );
  }

  const record = {
    persona_id: isUpdate
      ? personaId
      : _directoryGenerateId_(context.personas, DIRECTORY_SERVICE_CONFIG.ids.persona),
    nombres: _directoryText_(
      payload.nombres !== undefined ? payload.nombres : existing && existing.nombres
    ),
    apellidos: _directoryText_(
      payload.apellidos !== undefined ? payload.apellidos : existing && existing.apellidos
    )
  };

  const schema = _directoryGetPersonSchema_();
  SUNARPCore.assertValidRecord(record, schema);
  _directoryAssertNoDuplicatePerson_(record, context.personas);

  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.personas);
  const event = {
    accion: isUpdate ? 'EDITAR_PERSONA_DIRECTORIO' : 'CREAR_PERSONA_DIRECTORIO',
    modulo: 'DIRECTORIOS',
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
          apellidos: record.apellidos
        }, { schema: schema })
      : SUNARPCore.insertRecord(source, record, {
          idField: 'persona_id',
          schema: schema
        });

    _directoryInvalidateCache_();

    return {
      value: Object.assign({}, result, { person: record }),
      auditAfter: record
    };
  });
}

/**
 * Crea o actualiza una asignación. La identidad nunca se actualiza aquí.
 * local_id se obtiene de estructura_local y se valida contra el valor recibido.
 */
function saveDirectoryAssignment(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes proporcionar los datos de la asignación.');
  }

  const allowedFields = [
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
  ];
  _directoryAssertAllowedFields_(payload, allowedFields, 'asignaciones');

  const assignmentId = _directoryText_(payload.asignacion_id);
  const isUpdate = Boolean(assignmentId);
  const authorization = _directoryAuthorizationContext_(
    isUpdate ? 'DIRECTORIOS_EDITAR' : 'DIRECTORIOS_CREAR'
  );
  const context = _directoryLoadContext_();

  const existing = isUpdate
    ? context.asignaciones.find(item => _directoryKey_(item.asignacion_id) === assignmentId)
    : null;

  if (isUpdate && !existing) {
    throw new Error('No se encontró la asignación "' + assignmentId + '".');
  }

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');

  if (isUpdate) {
    const oldRelation = relationMap.get(_directoryKey_(existing.estructura_local_id));
    if (!oldRelation) throw new Error('La asignación actual tiene una relación organizacional inexistente.');

    _directoryAssertScope_(
      authorization,
      Object.assign(
        _directoryEnrichAssignment_(existing, context, relationMap, peopleMap),
        {
          estructura_id: oldRelation.estructura_id,
          sede_id: oldRelation.sede_id
        }
      ),
      'Edición de una asignación fuera del ámbito asignado.'
    );
  }

  const targetRelationId = _directoryText_(
    payload.estructura_local_id !== undefined
      ? payload.estructura_local_id
      : existing && existing.estructura_local_id
  );
  const targetRelation = relationMap.get(targetRelationId);
  if (!targetRelation || !targetRelation.active) {
    throw new Error('La relación estructura-local seleccionada no existe o está inactiva.');
  }

  const requestedLocalId = _directoryText_(
    payload.local_id !== undefined
      ? payload.local_id
      : existing && existing.local_id
  );

  if (requestedLocalId && requestedLocalId !== _directoryKey_(targetRelation.local_id)) {
    throw new Error('El local seleccionado no corresponde a la relación estructura-local.');
  }

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
    local_id: _directoryKey_(targetRelation.local_id),
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

  const locationChanged = isUpdate &&
    _directoryKey_(existing.estructura_local_id) !== _directoryKey_(record.estructura_local_id);

  if (payload.order !== undefined) {
    record.order = _directoryNormalizeInteger_(payload.order, 'Orden', false);
  } else if (isUpdate && !locationChanged) {
    record.order = _directoryNormalizeInteger_(existing.order, 'Orden', false);
  } else {
    record.order = _directoryGetNextOrder_(context.asignaciones, record.estructura_local_id);
  }

  const schema = _directoryGetAssignmentSchema_();
  SUNARPCore.assertValidRecord(record, schema);
  _directoryValidateAssignmentReferences_(record, context);

  _directoryAssertScope_(
    authorization,
    {
      asignacion_id: record.asignacion_id,
      persona_id: record.persona_id,
      nombres: (peopleMap.get(record.persona_id) || {}).nombres,
      apellidos: (peopleMap.get(record.persona_id) || {}).apellidos,
      estructura_id: targetRelation.estructura_id,
      sede_id: targetRelation.sede_id
    },
    'La unidad orgánica de destino se encuentra fuera de tus ámbitos de acceso.'
  );

  const source = _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones);
  const person = peopleMap.get(record.persona_id);
  const event = {
    accion: isUpdate ? 'EDITAR_ASIGNACION_DIRECTORIO' : 'CREAR_ASIGNACION_DIRECTORIO',
    modulo: 'DIRECTORIOS',
    tipo_entidad: 'ASIGNACION',
    registro_id: record.asignacion_id,
    registro_nombre: [person && person.nombres, person && person.apellidos].filter(Boolean).join(' '),
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

    _directoryInvalidateCache_();

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

  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_CAMBIAR_ESTADO');
  const context = _directoryLoadContext_();
  const id = _directoryText_(asignacionId);

  const existing = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === id
  );
  if (!existing) throw new Error('No se encontró la asignación "' + id + '".');

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const relation = relationMap.get(_directoryKey_(existing.estructura_local_id));
  if (!relation) throw new Error('La asignación no tiene una relación organizacional válida.');

  const enriched = _directoryEnrichAssignment_(existing, context, relationMap, peopleMap);
  _directoryAssertScope_(
    authorization,
    Object.assign({}, enriched, {
      estructura_id: relation.estructura_id,
      sede_id: relation.sede_id
    }),
    'Cambio de estado de una asignación fuera del ámbito asignado.'
  );

  const person = peopleMap.get(_directoryKey_(existing.persona_id));

  return _accessRunAudited_(authorization.auth, {
    accion: active ? 'ACTIVAR_ASIGNACION_DIRECTORIO' : 'DESACTIVAR_ASIGNACION_DIRECTORIO',
    modulo: 'DIRECTORIOS',
    tipo_entidad: 'ASIGNACION',
    registro_id: id,
    registro_nombre: [person && person.nombres, person && person.apellidos].filter(Boolean).join(' '),
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

    _directoryInvalidateCache_();

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

  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_ELIMINAR');
  const context = _directoryLoadContext_();

  const existing = context.asignaciones.find(item =>
    _directoryKey_(item.asignacion_id) === id
  );
  if (!existing) throw new Error('No se encontró la asignación "' + id + '".');

  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));
  const peopleMap = _directoryCreateMap_(context.personas, 'persona_id');
  const relation = relationMap.get(_directoryKey_(existing.estructura_local_id));
  if (!relation) throw new Error('La asignación no tiene una relación organizacional válida.');

  const enriched = _directoryEnrichAssignment_(existing, context, relationMap, peopleMap);
  _directoryAssertScope_(
    authorization,
    Object.assign({}, enriched, {
      estructura_id: relation.estructura_id,
      sede_id: relation.sede_id
    }),
    'Eliminación de una asignación fuera del ámbito asignado.'
  );

  const person = peopleMap.get(_directoryKey_(existing.persona_id));

  return _accessRunAudited_(authorization.auth, {
    accion: 'ELIMINAR_ASIGNACION_DIRECTORIO',
    modulo: 'DIRECTORIOS',
    tipo_entidad: 'ASIGNACION',
    registro_id: id,
    registro_nombre: [person && person.nombres, person && person.apellidos].filter(Boolean).join(' '),
    detalle: 'Eliminación física de una asignación. La persona se conserva.',
    datos_antes: existing
  }, () => {
    const result = SUNARPCore.deleteRecord(
      _directorySource_(DIRECTORY_SERVICE_CONFIG.sheets.asignaciones),
      'asignacion_id',
      id
    );

    _directoryInvalidateCache_();

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

/**
 * Elimina una persona solo cuando no tiene asignaciones ni
 * una ficha complementaria de datos personales vinculada.
 */
function deleteDirectoryPerson(personaId) {
  const id = _directoryText_(personaId);
  if (!id) throw new Error('Debes proporcionar el identificador de la persona.');

  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_ELIMINAR');
  const context = _directoryLoadContext_();

  const person = context.personas.find(item =>
    _directoryKey_(item.persona_id) === id
  );
  if (!person) throw new Error('No se encontró la persona "' + id + '".');

  const linkedAssignments = context.asignaciones.filter(item =>
    _directoryKey_(item.persona_id) === id
  );
  const relationMap = _directoryCreateMap_(_directoryBuildRelations_(context, false));

  // Primero se comprueba el ámbito de todas las adscripciones para no
  // revelar relaciones ni operar sobre identidades fuera del alcance.
  _directoryAssertPersonMutationScope_(
    authorization,
    person,
    context.asignaciones,
    relationMap
  );

  if (linkedAssignments.length) {
    throw new Error(
      'No se puede eliminar la persona porque tiene ' +
      linkedAssignments.length +
      ' asignación(es) vinculada(s). Elimina o reasigna primero esas asignaciones.'
    );
  }

  const personalDataLinks = _directoryLoadPersonalDataLinks_();
  if (personalDataLinks.includes(id)) {
    throw new Error(
      'No se puede eliminar la persona porque tiene una ficha de datos personales vinculada.'
    );
  }

  return _accessRunAudited_(authorization.auth, {
    accion: 'ELIMINAR_PERSONA_DIRECTORIO',
    modulo: 'DIRECTORIOS',
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

    _directoryInvalidateCache_();

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

/**
 * Invalida manualmente la caché del directorio.
 */
function clearDirectoryCache() {
  requirePermission_('DIRECTORIOS_VER');
  _directoryInvalidateCache_();

  return {
    success: true,
    message: 'Caché del directorio eliminada correctamente.'
  };
}
