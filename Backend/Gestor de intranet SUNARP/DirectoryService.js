
/**
 * GESTOR DE INTRANET SUNARP
 * Servicio: Directorios telefónicos
 *
 * Responsabilidades:
 * - Obtener catálogos para la interfaz.
 * - Consultar y enriquecer registros.
 * - Validar relaciones con los catálogos.
 * - Guardar y actualizar servidores.
 * - Gestionar el estado de los registros.
 *
 * Las operaciones CRUD se delegan a SUNARP Core.
 */


/* =========================================================
   1. CONFIGURACIÓN Y ACCESO A DATOS
   ========================================================= */

const DIRECTORY_SERVICE_CONFIG = Object.freeze({
  sourceKey: 'DIRECTORY',
  sheetName: 'servidores',
  idField: 'id',
  idPrefix: 'DIR_',
  idDigits: 3
});

/* =========================================================
   AUTORIZACIÓN DE ACCESO AL DIRECTORIO
   ========================================================= */

/** Obtiene identidad y catálogos de ámbito desde la fuente de seguridad. */
function _directoryAuthorizationContext_(permissionCode) {
  const auth = requirePermission_(
    permissionCode || 'DIRECTORIOS_VER'
  );

  const catalog = _accessOrgCatalog_();

  return {
    auth,
    structures: catalog.estructuraOrg || []
  };
}


/** Deniega una operación cuando el registro está fuera del ámbito asignado. */
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
    tipo_entidad: 'REGISTRO',
    registro_id: _directoryKey_(record && record.id),

    registro_nombre: [
      record && record.nombres,
      record && record.apellidos
    ]
      .map(_directoryText_)
      .filter(Boolean)
      .join(' '),

    resultado: 'DENEGADO',

    detalle: actionLabel ||
      'El registro se encuentra fuera del ámbito de acceso asignado.'
  });

  throw new Error(
    'No tienes ámbito de acceso para operar sobre este registro.'
  );
}


/** Construye el mapa de relaciones que permite obtener la adscripción orgánica. */
function _directoryRelationMap_(context) {
  const map = new Map();

  _directoryBuildRelations_(context, false).forEach(relation => {
    map.set(
      _directoryKey_(relation.id),
      relation
    );
  });

  return map;
}


/**
 * Obtiene la configuración de la hoja de servidores.
 */
function _directoryGetSource_() {
  return getIntranetDataSource(
    DIRECTORY_SERVICE_CONFIG.sourceKey,
    DIRECTORY_SERVICE_CONFIG.sheetName,
    1
  );
}


/**
 * Lee todos los registros de una pestaña mediante SUNARP Core.
 */
function _directoryReadAll_(sourceKey, sheetName) {
  const source = getIntranetDataSource(
    sourceKey,
    sheetName,
    1
  );

  const result = SUNARPCore.listRecords(source, {});

  return result.records;
}



/* =========================================================
   CARGA Y CACHÉ DE DATOS DEL DIRECTORIO
   Utiliza los servicios de SUNARP Core.
   ========================================================= */

// Clave exclusiva de esta aplicación y funcionalidad.
const DIRECTORY_CACHE_KEY =
  'gestor-intranet:directory-context:v1';

// Tiempo de almacenamiento: cinco minutos.
const DIRECTORY_CACHE_TTL = 300;




/**
 * Carga los ocho conjuntos de datos desde el archivo
 * Directorios telefónicos.
 *
 * Todas las pestañas se consultan desde una sola fuente.
 * Los catálogos locales se alimentan mediante IMPORTRANGE.
 */
function _directoryLoadContextFromSheets_() {

  const sheets = [
    {
      key: 'sedes',
      sheetName: 'sede'
    },
    {
      key: 'tiposLocal',
      sheetName: 'tipos_local'
    },
    {
      key: 'locales',
      sheetName: 'locales'
    },
    {
      key: 'tiposEstructura',
      sheetName: 'tipos_estructura'
    },
    {
      key: 'estructuraOrg',
      sheetName: 'estructura_org'
    },
    {
      key: 'estructuraLocal',
      sheetName: 'estructura_local'
    },
    {
      key: 'cargos',
      sheetName: 'cargos'
    },
    {
      key: 'servidores',
      sheetName: 'servidores'
    }
  ];

  const requests = sheets.map(item => ({
    key: item.key,
    source: getIntranetDataSource(
      'DIRECTORY',
      item.sheetName,
      1
    )
  }));

  return SUNARPCore.listRecordsFromSources(requests);

}




/**
 * Recupera los datos desde SUNARP Core.
 *
 * Si no existen en caché, consulta las hojas
 * y almacena el resultado durante cinco minutos.
 */
function _directoryLoadContext_() {

  // 1. Intentar recuperar los datos almacenados.
  try {

    const cached = SUNARPCore.getCachedValue(
      DIRECTORY_CACHE_KEY
    );

    if (cached !== null) {

      console.log(
        '[DirectoryService] CACHE HIT'
      );

      return cached;

    }

  } catch (error) {

    console.warn(
      '[DirectoryService] Error al consultar caché:',
      error.message
    );

  }

  // 2. Si no existe caché, leer las hojas.
  console.log(
    '[DirectoryService] CACHE MISS'
  );

  const context = _directoryLoadContextFromSheets_();

  // 3. Intentar almacenar los datos mediante SUNARP Core.
  try {

    const result = SUNARPCore.putCachedValue(
      DIRECTORY_CACHE_KEY,
      context,
      DIRECTORY_CACHE_TTL
    );

    console.log(
      '[DirectoryService] Datos almacenados en caché:',
      result.sizeBytes,
      'bytes'
    );

  } catch (error) {

    // La aplicación sigue funcionando aunque no pueda
    // almacenar la información en caché.
    console.warn(
      '[DirectoryService] No se pudo almacenar caché:',
      error.message
    );

  }

  return context;

}


/**
 * Invalida la caché del directorio.
 *
 * Se ejecuta después de registrar, editar,
 * desactivar o reactivar servidores.
 */
function _directoryInvalidateCache_() {

  SUNARPCore.removeCachedValue(
    DIRECTORY_CACHE_KEY
  );

}


/**
 * Permite invalidar manualmente la caché cuando
 * se modifican directamente las hojas de cálculo.
 */
function clearDirectoryCache() {
  requirePermission_('DIRECTORIOS_VER');

  _directoryInvalidateCache_();

  return {
    success: true,
    message: 'Caché del directorio eliminada correctamente.'
  };
}




/* =========================================================
   2. FUNCIONES AUXILIARES
   ========================================================= */


/**
 * Normaliza identificadores para realizar comparaciones.
 */
function _directoryKey_(value) {
  return String(
    value === null || value === undefined ? '' : value
  ).trim();
}


/**
 * Determina si un registro está activo.
 *
 * Cuando el catálogo no tiene columna active,
 * se considera activo.
 */
function _directoryIsActive_(record) {
  if (
    !Object.prototype.hasOwnProperty.call(record, 'active')
  ) {
    return true;
  }

  const value = record.active;

  if (value === false || value === 0) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();

  return ![
    'false',
    '0',
    'no',
    'inactivo'
  ].includes(normalized);
}


/**
 * Crea un índice de registros mediante su identificador.
 */
function _directoryCreateMap_(records) {
  const map = new Map();

  records.forEach(record => {
    map.set(_directoryKey_(record.id), record);
  });

  return map;
}


/**
 * Construye la ruta jerárquica de una dependencia.
 *
 * Ejemplo:
 * Superintendencia Nacional / Gerencia General / Oficina
 */
function _directoryGetStructurePath_(node, structureMap) {
  const parts = [];
  const visited = new Set();

  let current = node;

  while (current) {
    const currentId = _directoryKey_(current.id);

    if (!currentId || visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    parts.unshift(String(current.name || ''));

    const parentId = _directoryKey_(current.parent_id);

    if (!parentId) {
      break;
    }

    current = structureMap.get(parentId) || null;
  }

  return parts.filter(Boolean).join(' / ');
}


/**
 * Obtiene la secuencia de orden jerárquico de una dependencia.
 * Recorre la estructura desde la raíz hasta el nodo seleccionado.
 */
function _directoryGetStructureOrderPath_(structureId, structureMap) {

  const path = [];
  const visited = new Set();

  let current = structureMap.get(
    _directoryKey_(structureId)
  );

  while (current) {

    const currentId = _directoryKey_(current.id);

    if (!currentId || visited.has(currentId)) {
      break;
    }

    visited.add(currentId);

    const order = Number(current.order);

    path.unshift({
      order: Number.isFinite(order)
        ? order
        : Number.MAX_SAFE_INTEGER,

      name: _directoryText_(current.name)
    });

    const parentId = _directoryKey_(current.parent_id);

    current = parentId
      ? structureMap.get(parentId) || null
      : null;
  }

  return path;
}


/**
 * Compara dos rutas jerárquicas.
 * Respeta el orden definido en cada nivel de estructura_org.
 */
function _directoryCompareStructurePaths_(pathA, pathB) {

  const length = Math.min(pathA.length, pathB.length);

  for (let i = 0; i < length; i++) {

    const orderDifference =
      pathA[i].order - pathB[i].order;

    if (orderDifference !== 0) {
      return orderDifference;
    }

    const nameDifference = pathA[i].name.localeCompare(
      pathB[i].name,
      'es',
      { sensitivity: 'base' }
    );

    if (nameDifference !== 0) {
      return nameDifference;
    }
  }

  return pathA.length - pathB.length;
}


/**
 * Convierte un valor a texto sin dejar espacios exteriores.
 */
function _directoryText_(value) {
  return String(
    value === null || value === undefined ? '' : value
  ).trim();
}


/**
 * Compara valores para ordenar registros.
 */
function _directoryCompare_(a, b) {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';

  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a).localeCompare(
    String(b),
    'es',
    {
      numeric: true,
      sensitivity: 'base'
    }
  );
}


/* =========================================================
   3. RELACIONES ENTRE CATÁLOGOS
   ========================================================= */


/**
 * Construye las relaciones entre:
 *
 * estructura_local
 *   -> estructura_org
 *   -> locales
 *   -> sedes
 *   -> tipos_estructura
 *   -> tipos_local
 *
 * Una dependencia puede estar relacionada con varios locales.
 */
function _directoryBuildRelations_(context, onlyActive) {
  const structureMap = _directoryCreateMap_(
    context.estructuraOrg
  );

  const localMap = _directoryCreateMap_(
    context.locales
  );

  const sedeMap = _directoryCreateMap_(
    context.sedes
  );

  const structureTypeMap = _directoryCreateMap_(
    context.tiposEstructura
  );

  const localTypeMap = _directoryCreateMap_(
    context.tiposLocal
  );

  return context.estructuraLocal
    .map(relation => {
      const structure = structureMap.get(
        _directoryKey_(relation.estructura_id)
      );

      const local = localMap.get(
        _directoryKey_(relation.local_id)
      );

      if (!structure || !local) {
        return null;
      }

      const isActive =
        _directoryIsActive_(relation) &&
        _directoryIsActive_(structure) &&
        _directoryIsActive_(local);

      if (onlyActive && !isActive) {
        return null;
      }

      const sede = sedeMap.get(
        _directoryKey_(structure.sede_id)
      );

      const localSede = sedeMap.get(
        _directoryKey_(local.sede_id)
      );

      const structureType = structureTypeMap.get(
        _directoryKey_(structure.tipo_estructura_id)
      );

      const localType = localTypeMap.get(
        _directoryKey_(local.tipo_local_id)
      );

      const structurePath = _directoryGetStructurePath_(
        structure,
        structureMap
      );

      const reference = _directoryText_(
        relation.referencia
      );

      const locationLabel = [
        local.name,
        reference
      ].filter(Boolean).join(' - ');

      return {
        id: relation.id,
        estructura_id: relation.estructura_id,
        local_id: relation.local_id,

        referencia: reference,
        active: isActive,

        estructura_name: structure.name,
        estructura_path: structurePath,

        tipo_estructura_id: structure.tipo_estructura_id,
        tipo_estructura_name: structureType
          ? structureType.name
          : '',

        local_name: local.name,
        tipo_local_id: local.tipo_local_id,
        tipo_local_name: localType
          ? localType.name
          : '',

        // Sede de pertenencia orgánica.
        sede_id: structure.sede_id,
        sede_name: sede ? sede.name : '',

        // Sede de ubicación física del local.
        local_sede_id: local.sede_id,
        local_sede_name: localSede ? localSede.name : '',

        display_name: `${structurePath} — ${locationLabel}`
      };
    })
    .filter(Boolean);
}


/**
 * Enriquece un servidor incorporando los nombres
 * de los catálogos relacionados.
 */
function _directoryEnrichRecord_(record, context, relationMap) {
  const cargo = context.cargos.find(item =>
    _directoryKey_(item.id) ===
    _directoryKey_(record.cargo_id)
  );

  const relation = relationMap.get(
    _directoryKey_(record.estructura_local_id)
  );

  return {
    ...record,

    cargo_name: cargo ? cargo.name : '',

    estructura_name: relation
      ? relation.estructura_name
      : '',

    estructura_path: relation
      ? relation.estructura_path
      : '',

    estructura_id: relation
      ? relation.estructura_id
      : '',

    tipo_estructura_id: relation
      ? relation.tipo_estructura_id
      : '',

    sede_id: relation
      ? relation.sede_id
      : '',

    local_name: relation
      ? relation.local_name
      : '',

    sede_name: relation
      ? relation.sede_name
      : '',

    referencia: relation
      ? relation.referencia
      : '',

    display_location: relation
      ? relation.display_name
      : ''
  };
}


/**
 * Enriquece todos los registros de servidores.
 */
function _directoryBuildEntries_(context) {
  const relations = _directoryBuildRelations_(
    context,
    false
  );

  const relationMap = new Map();

  relations.forEach(relation => {
    relationMap.set(
      _directoryKey_(relation.id),
      relation
    );
  });

  return context.servidores.map(record =>
    _directoryEnrichRecord_(
      record,
      context,
      relationMap
    )
  );
}


/* =========================================================
   4. DATOS INICIALES PARA LA INTERFAZ
   ========================================================= */


/**
 * Devuelve los catálogos y registros necesarios
 * para inicializar la página de directorios.
 */

/**
 * Devuelve los catálogos y servidores activos
 * ordenados según la estructura orgánica.
 */
function getDirectoryInitialData() {

  const authorization = _directoryAuthorizationContext_('DIRECTORIOS_VER');

  const context = _directoryLoadContext_();

  // Índices de la estructura.
  const structureMap = _directoryCreateMap_(
    context.estructuraOrg
  );

  const structureTypeMap = _directoryCreateMap_(
    context.tiposEstructura
  );

  // Índice de relaciones entre dependencias y locales.
  const relations = _directoryBuildRelations_(
    context,
    false
  );

  const relationMap = new Map();

  relations.forEach(relation => {
    relationMap.set(
      _directoryKey_(relation.id),
      relation
    );
  });

  // Índice del orden de las sedes según el catálogo.
  const sedeOrderMap = new Map();

  context.sedes.forEach((sede, index) => {
    sedeOrderMap.set(
      _directoryKey_(sede.id),
      index
    );
  });

  // Obtener y enriquecer todos los servidores.
  const entries = context.servidores.map(record =>
    _directoryEnrichRecord_(
      record,
      context,
      relationMap
    )
  );

  const activeEntries = entries;

  // Preparar las rutas jerárquicas para no reconstruirlas
  // repetidamente durante el ordenamiento.
  const structurePathMap = new Map();

  context.estructuraOrg.forEach(node => {

    structurePathMap.set(
      _directoryKey_(node.id),
      _directoryGetStructureOrderPath_(
        node.id,
        structureMap
      )
    );

  });

  // ORDENAMIENTO GENERAL:
  // 1. Sede.
  // 2. Jerarquía orgánica.
  // 3. Orden de relaciones con locales.
  // 4. Orden de servidores dentro de cada relación.
  activeEntries.sort((a, b) => {

    const relationA = relationMap.get(
      _directoryKey_(a.estructura_local_id)
    );

    const relationB = relationMap.get(
      _directoryKey_(b.estructura_local_id)
    );

    // Primero, ordenar por sede.
    const sedeOrderA = relationA
      ? (
        sedeOrderMap.get(
          _directoryKey_(relationA.sede_id)
        ) ?? Number.MAX_SAFE_INTEGER
      )
      : Number.MAX_SAFE_INTEGER;

    const sedeOrderB = relationB
      ? (
        sedeOrderMap.get(
          _directoryKey_(relationB.sede_id)
        ) ?? Number.MAX_SAFE_INTEGER
      )
      : Number.MAX_SAFE_INTEGER;

    if (sedeOrderA !== sedeOrderB) {
      return sedeOrderA - sedeOrderB;
    }

    // Segundo, ordenar por la jerarquía orgánica.
    const pathA = relationA
      ? structurePathMap.get(
        _directoryKey_(relationA.estructura_id)
      ) || []
      : [];

    const pathB = relationB
      ? structurePathMap.get(
        _directoryKey_(relationB.estructura_id)
      ) || []
      : [];

    const structureDifference =
      _directoryCompareStructurePaths_(pathA, pathB);

    if (structureDifference !== 0) {
      return structureDifference;
    }

    // Tercero, agrupar las relaciones por el orden
    // en que aparecen en la hoja estructura_local.
    const relationIndexA = context.estructuraLocal.findIndex(
      item =>
        _directoryKey_(item.id) ===
        _directoryKey_(a.estructura_local_id)
    );

    const relationIndexB = context.estructuraLocal.findIndex(
      item =>
        _directoryKey_(item.id) ===
        _directoryKey_(b.estructura_local_id)
    );

    if (relationIndexA !== relationIndexB) {
      return relationIndexA - relationIndexB;
    }

    // Cuarto, ordenar los servidores dentro de su
    // correspondiente estructura_local_id.
    const orderA = Number(a.order);
    const orderB = Number(b.order);

    const validOrderA = Number.isFinite(orderA)
      ? orderA
      : Number.MAX_SAFE_INTEGER;

    const validOrderB = Number.isFinite(orderB)
      ? orderB
      : Number.MAX_SAFE_INTEGER;

    if (validOrderA !== validOrderB) {
      return validOrderA - validOrderB;
    }

    return (
      _directoryCompare_(a.apellidos, b.apellidos) ||
      _directoryCompare_(a.nombres, b.nombres)
    );

  });

  // Preparar la estructura orgánica para los selectores.
  const activeStructure = context.estructuraOrg
    .filter(_directoryIsActive_)
    .map(node => ({

      ...node,

      path: _directoryGetStructurePath_(
        node,
        structureMap
      ),

      tipo_estructura_name: (
        structureTypeMap.get(
          _directoryKey_(node.tipo_estructura_id)
        ) || {}
      ).name || ''

    }));

  // Reducir también los catálogos devueltos: no basta con filtrar
  // los servidores si la respuesta expone toda la estructura orgánica.
  const scopedStructures = activeStructure.filter(node =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'DIRECTORIOS',
      {
        estructura_id: node.id,
        sede_id: node.sede_id
      },
      authorization.structures
    )
  );

  const allowedStructureIds = new Set(
    scopedStructures.map(node => _directoryKey_(node.id))
  );

  const scopedRelations = relations.filter(relation =>
    relation.active &&
    allowedStructureIds.has(
      _directoryKey_(relation.estructura_id)
    )
  );

  const allowedLocalIds = new Set(
    scopedRelations.map(relation =>
      _directoryKey_(relation.local_id)
    )
  );

  const allowedSedeIds = new Set(
    scopedStructures.map(node =>
      _directoryKey_(node.sede_id)
    )
  );

  const allowedLocalTypes = new Set(
    context.locales
      .filter(local =>
        allowedLocalIds.has(_directoryKey_(local.id))
      )
      .map(local =>
        _directoryKey_(local.tipo_local_id)
      )
  );

  const allowedStructureTypes = new Set(
    scopedStructures.map(node =>
      _directoryKey_(node.tipo_estructura_id)
    )
  );

  const scopedEntries = activeEntries.filter(record =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'DIRECTORIOS',
      record,
      authorization.structures
    )
  );

  return {
    catalogs: {
      sedes: context.sedes.filter(item =>
        _directoryIsActive_(item) &&
        allowedSedeIds.has(_directoryKey_(item.id))
      ),

      tiposLocal: context.tiposLocal.filter(item =>
        _directoryIsActive_(item) &&
        allowedLocalTypes.has(_directoryKey_(item.id))
      ),

      locales: context.locales.filter(item =>
        _directoryIsActive_(item) &&
        allowedLocalIds.has(_directoryKey_(item.id))
      ),

      tiposEstructura: context.tiposEstructura.filter(item =>
        _directoryIsActive_(item) &&
        allowedStructureTypes.has(_directoryKey_(item.id))
      ),

      estructuraOrg: scopedStructures,
      estructuraLocal: scopedRelations,

      cargos: context.cargos.filter(_directoryIsActive_)
    },

    records: scopedEntries
  };

}



/* =========================================================
   5. CONSULTA Y LISTADO DE SERVIDORES
   ========================================================= */

/**
 * Lista los servidores y permite buscar, filtrar y paginar.
 *
 * Opciones:
 * {
 *   search: '',
 *   estructuraLocalId: '',
 *   active: true | false | 'all',
 *   sortBy: 'order',
 *   sortDirection: 'asc',
 *   offset: 0,
 *   limit: 25
 * }
 *
 * El filtro active, cuando no se indica, muestra
 * solamente los registros activos.
 */
function listDirectoryEntries(options) {
  options = options || {};

  // 1. Obtener autorización y ámbito del usuario.
  const authorization = _directoryAuthorizationContext_(
    'DIRECTORIOS_VER'
  );

  // 2. Cargar los datos del directorio.
  const context = _directoryLoadContext_();

  // 3. Construir los registros y filtrar por ámbito de acceso.
  let records = _directoryBuildEntries_(context).filter(record =>
    _accessRecordIsAllowed_(
      authorization.auth,
      'DIRECTORIOS',
      record,
      authorization.structures
    )
  );

  // 4. Filtrar por estado.
  const activeFilter = options.active === undefined
    ? true
    : options.active;

  if (activeFilter !== 'all') {
    if (typeof activeFilter !== 'boolean') {
      throw new Error(
        'El filtro active debe ser true, false o "all".'
      );
    }

    records = records.filter(record =>
      _directoryIsActive_(record) === activeFilter
    );
  }

  // 5. Filtrar por dependencia y local.
  if (options.estructuraLocalId) {
    const selectedId = _directoryKey_(
      options.estructuraLocalId
    );

    records = records.filter(record =>
      _directoryKey_(record.estructura_local_id) === selectedId
    );
  }

  // 6. Búsqueda general.
  const search = _directoryText_(
    options.search
  ).toLocaleLowerCase();

  if (search) {
    const fields = [
      'nombres',
      'apellidos',
      'cargo_name',
      'anexo',
      'estructura_name',
      'estructura_path',
      'local_name',
      'sede_name',
      'referencia'
    ];

    records = records.filter(record =>
      fields.some(field =>
        _directoryText_(record[field])
          .toLocaleLowerCase()
          .includes(search)
      )
    );
  }

  // 7. Calcular el total después de aplicar los filtros.
  const total = records.length;

  // 8. Ordenamiento.
  const sortBy = options.sortBy || 'order';

  const sortDirection = String(
    options.sortDirection || 'asc'
  ).toLowerCase();

  if (!['asc', 'desc'].includes(sortDirection)) {
    throw new Error(
      'sortDirection debe ser "asc" o "desc".'
    );
  }

  const direction = sortDirection === 'desc' ? -1 : 1;

  records.sort((a, b) => {
    const result = _directoryCompare_(
      a[sortBy],
      b[sortBy]
    );

    return result * direction ||
      _directoryCompare_(a.apellidos, b.apellidos) ||
      _directoryCompare_(a.nombres, b.nombres);
  });

  // 9. Paginación.
  const offset = options.offset === undefined
    ? 0
    : Number(options.offset);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset no es válido.');
  }

  let limit = null;

  if (options.limit !== undefined && options.limit !== null) {
    limit = Number(options.limit);

    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error('limit no es válido.');
    }

    records = records.slice(offset, offset + limit);

  } else {
    records = records.slice(offset);
  }

  // 10. Devolver resultados.
  return {
    records,
    total,
    offset,
    limit
  };
}


/**
 * Obtiene un servidor por su identificador.
 */
function getDirectoryEntryById(id) {
  const authorization = _directoryAuthorizationContext_(
    'DIRECTORIOS_VER'
  );

  const context = _directoryLoadContext_();

  const record = context.servidores.find(item =>
    _directoryKey_(item.id) === _directoryKey_(id)
  );

  if (!record) {
    return null;
  }

  const relations = _directoryBuildRelations_(
    context,
    false
  );

  const relationMap = new Map();

  relations.forEach(relation => {
    relationMap.set(
      _directoryKey_(relation.id),
      relation
    );
  });

  const enriched = _directoryEnrichRecord_(
    record,
    context,
    relationMap
  );

  _directoryAssertScope_(
    authorization,
    enriched,
    'Consulta de un registro fuera del ámbito asignado.'
  );

  return enriched;
}


/* =========================================================
   6. VALIDACIÓN DE DATOS DEL DIRECTORIO
   ========================================================= */


/**
 * Esquema particular de validación de servidores.
 *
 * Las reglas comunes son ejecutadas por SUNARP Core.
 */
function _directoryGetValidationSchema_() {
  return {
    id: {
      label: 'Identificador',
      required: true,
      type: 'string',
      maxLength: 30
    },

    nombres: {
      label: 'Nombres',
      required: true,
      type: 'string',
      minLength: 2,
      maxLength: 100
    },

    apellidos: {
      label: 'Apellidos',
      required: true,
      type: 'string',
      minLength: 2,
      maxLength: 150
    },

    cargo_id: {
      label: 'Cargo',
      required: true,
      type: 'string'
    },

    anexo: {
      label: 'Anexo',
      type: 'integer',
      min: 1,
      max: 99999
    },

    estructura_local_id: {
      label: 'Dependencia y local',
      required: true,
      type: 'string'
    },

    active: {
      label: 'Estado',
      required: true,
      type: 'boolean'
    },

    order: {
      label: 'Orden',
      required: true,
      type: 'integer',
      min: 1
    }
  };
}


/**
 * Convierte un valor a entero.
 *
 * Los campos opcionales pueden quedar vacíos.
 */
function _directoryNormalizeInteger_(value, label, optional) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    if (optional) return '';

    throw new Error(`${label} es obligatorio.`);
  }

  const normalized = typeof value === 'number'
    ? value
    : /^\d+$/.test(String(value).trim())
      ? Number(value)
      : NaN;

  if (!Number.isSafeInteger(normalized)) {
    throw new Error(`${label} debe ser un número entero.`);
  }

  return normalized;
}


/**
 * Normaliza valores booleanos recibidos desde la interfaz
 * o desde las hojas de cálculo.
 */
function _directoryNormalizeBoolean_(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error('El estado del registro no es válido.');
}


/**
 * Verifica que los identificadores de los catálogos existan
 * y estén activos.
 */
function _directoryValidateReferences_(record, context) {
  const cargo = context.cargos.find(item =>
    _directoryKey_(item.id) ===
    _directoryKey_(record.cargo_id)
  );

  if (!cargo || !_directoryIsActive_(cargo)) {
    throw new Error(
      'El cargo seleccionado no existe o está inactivo.'
    );
  }

  const relations = _directoryBuildRelations_(
    context,
    true
  );

  const relation = relations.find(item =>
    _directoryKey_(item.id) ===
    _directoryKey_(record.estructura_local_id)
  );

  if (!relation) {
    throw new Error(
      'La dependencia o el local seleccionado no existe, ' +
      'o se encuentra inactivo.'
    );
  }
}


/* =========================================================
   7. GENERACIÓN DE IDENTIFICADORES Y ORDEN
   ========================================================= */


/**
 * Genera el siguiente identificador DIR_###.
 *
 * Considera registros activos e inactivos.
 */
function _directoryGenerateId_(records) {
  let maximum = 0;

  const prefix = DIRECTORY_SERVICE_CONFIG.idPrefix;

  const expression = new RegExp(
    '^' + prefix + '(\\d+)$',
    'i'
  );

  records.forEach(record => {
    const match = _directoryKey_(record.id).match(
      expression
    );

    if (match) {
      maximum = Math.max(
        maximum,
        Number(match[1])
      );
    }
  });

  return prefix + String(maximum + 1).padStart(
    DIRECTORY_SERVICE_CONFIG.idDigits,
    '0'
  );
}


/**
 * Calcula el siguiente orden dentro de una
 * estructura_local_id determinada.
 *
 * Incluye registros activos e inactivos.
 */
function _directoryGetNextOrder_(records, structureLocalId) {
  let maximum = 0;

  records.forEach(record => {
    if (
      _directoryKey_(record.estructura_local_id) !==
      _directoryKey_(structureLocalId)
    ) {
      return;
    }

    const order = Number(record.order);

    if (Number.isInteger(order) && order > maximum) {
      maximum = order;
    }
  });

  return maximum + 1;
}


/* =========================================================
   8. ALTA Y ACTUALIZACIÓN DE SERVIDORES
   ========================================================= */


/**
 * Registra o actualiza un servidor.
 *
 * Para insertar:
 * {
 *   nombres,
 *   apellidos,
 *   cargo_id,
 *   anexo,
 *   estructura_local_id
 * }
 *
 * Para actualizar se incluye el id.
 *
 * El identificador y el orden se generan automáticamente
 * al insertar.
 */
function saveDirectoryEntry(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error(
      'Debes proporcionar los datos del servidor.'
    );
  }

  const allowedFields = [
    'id',
    'nombres',
    'apellidos',
    'cargo_id',
    'anexo',
    'estructura_local_id',
    'active'
  ];

  Object.keys(payload).forEach(field => {
    if (!allowedFields.includes(field)) {
      throw new Error(
        `El campo "${field}" no está permitido en esta operación.`
      );
    }
  });

  const id = _directoryText_(payload.id);
  const isUpdate = Boolean(id);

  const authorization = _directoryAuthorizationContext_(
    isUpdate
      ? 'DIRECTORIOS_EDITAR'
      : 'DIRECTORIOS_CREAR'
  );

  const context = _directoryLoadContext_();

  let existing = null;

  if (isUpdate) {
    existing = context.servidores.find(record =>
      _directoryKey_(record.id) === id
    );

    if (!existing) {
      throw new Error(
        `No se encontró el servidor "${id}".`
      );
    }
  }

  const relationMap = _directoryRelationMap_(context);

  // Verificar que el registro actual esté dentro del ámbito.
  if (isUpdate) {
    const existingEnriched = _directoryEnrichRecord_(
      existing,
      context,
      relationMap
    );

    _directoryAssertScope_(
      authorization,
      existingEnriched,
      'Edición de un registro fuera del ámbito asignado.'
    );
  }

  // Construir el registro completo.
  const record = {
    id: isUpdate
      ? id
      : _directoryGenerateId_(context.servidores),

    nombres: _directoryText_(
      payload.nombres !== undefined
        ? payload.nombres
        : existing && existing.nombres
    ),

    apellidos: _directoryText_(
      payload.apellidos !== undefined
        ? payload.apellidos
        : existing && existing.apellidos
    ),

    cargo_id: _directoryText_(
      payload.cargo_id !== undefined
        ? payload.cargo_id
        : existing && existing.cargo_id
    ),

    anexo: _directoryNormalizeInteger_(
      payload.anexo !== undefined
        ? payload.anexo
        : existing && existing.anexo,
      'Anexo',
      true
    ),

    estructura_local_id: _directoryText_(
      payload.estructura_local_id !== undefined
        ? payload.estructura_local_id
        : existing && existing.estructura_local_id
    ),

    active: payload.active !== undefined
      ? _directoryNormalizeBoolean_(payload.active)
      : existing
        ? _directoryNormalizeBoolean_(existing.active)
        : true,

    order: 1
  };

  // Mantener el orden actual o asignar uno nuevo
  // cuando cambia la relación con el local.
  if (isUpdate) {
    const locationChanged =
      _directoryKey_(existing.estructura_local_id) !==
      _directoryKey_(record.estructura_local_id);

    record.order = locationChanged
      ? _directoryGetNextOrder_(
        context.servidores,
        record.estructura_local_id
      )
      : _directoryNormalizeInteger_(
        existing.order,
        'Orden',
        false
      );

  } else {
    record.order = _directoryGetNextOrder_(
      context.servidores,
      record.estructura_local_id
    );
  }

  // Validar los campos con SUNARP Core.
  const schema = _directoryGetValidationSchema_();

  SUNARPCore.assertValidRecord(
    record,
    schema
  );

  // Validar las relaciones particulares del directorio.
  _directoryValidateReferences_(
    record,
    context
  );

  // Validar el ámbito de la unidad orgánica de destino.
  const targetRelation = relationMap.get(
    _directoryKey_(record.estructura_local_id)
  );

  if (!targetRelation) {
    throw new Error(
      'La relación entre unidad orgánica y local no existe.'
    );
  }

  _directoryAssertScope_(
    authorization,
    {
      estructura_id: targetRelation.estructura_id,
      sede_id: targetRelation.sede_id,
      id: record.id,
      nombres: record.nombres,
      apellidos: record.apellidos
    },
    'La unidad orgánica de destino se encuentra fuera de tus ámbitos de acceso.'
  );

  const source = _directoryGetSource_();

  const event = {
    accion: isUpdate
      ? 'EDITAR_SERVIDOR_DIRECTORIO'
      : 'CREAR_SERVIDOR_DIRECTORIO',

    modulo: 'DIRECTORIOS',
    tipo_entidad: 'SERVIDOR',
    registro_id: record.id,

    registro_nombre: [
      record.nombres,
      record.apellidos
    ].filter(Boolean).join(' '),

    detalle: isUpdate
      ? 'Actualización de un registro del directorio.'
      : 'Alta de un registro del directorio.',

    datos_antes: existing || null
  };

  return _accessRunAudited_(
    authorization.auth,
    event,
    () => {
      let result;

      if (isUpdate) {
        const updates = {
          nombres: record.nombres,
          apellidos: record.apellidos,
          cargo_id: record.cargo_id,
          anexo: record.anexo,
          estructura_local_id: record.estructura_local_id,
          active: record.active,
          order: record.order
        };

        result = SUNARPCore.updateRecord(
          source,
          'id',
          record.id,
          updates,
          { schema }
        );

      } else {
        result = SUNARPCore.insertRecord(
          source,
          record,
          {
            idField: 'id',
            schema
          }
        );
      }

      _directoryInvalidateCache_();

      return {
        value: {
          ...result,

          record: _directoryEnrichRecord_(
            record,
            context,
            relationMap
          )
        },

        auditAfter: record
      };
    }
  );
}


/* =========================================================
   9. ACTIVACIÓN Y DESACTIVACIÓN
   ========================================================= */


/**
 * Activa o desactiva un servidor.
 *
 * No elimina físicamente su registro.
 */
function setDirectoryEntryActive(id, active) {
  if (typeof active !== 'boolean') {
    throw new Error(
      'El nuevo estado debe ser true o false.'
    );
  }

  const authorization = _directoryAuthorizationContext_(
    'DIRECTORIOS_CAMBIAR_ESTADO'
  );

  const context = _directoryLoadContext_();

  const recordId = _directoryText_(id);

  const existing = context.servidores.find(item =>
    _directoryKey_(item.id) === recordId
  );

  if (!existing) {
    throw new Error(
      `No se encontró el servidor "${recordId}".`
    );
  }

  const relationMap = _directoryRelationMap_(context);

  const enriched = _directoryEnrichRecord_(
    existing,
    context,
    relationMap
  );

  _directoryAssertScope_(
    authorization,
    enriched,
    'Cambio de estado de un registro fuera del ámbito asignado.'
  );

  return _accessRunAudited_(
    authorization.auth,
    {
      accion: active
        ? 'ACTIVAR_SERVIDOR_DIRECTORIO'
        : 'DESACTIVAR_SERVIDOR_DIRECTORIO',

      modulo: 'DIRECTORIOS',
      tipo_entidad: 'SERVIDOR',
      registro_id: recordId,

      registro_nombre: [
        existing.nombres,
        existing.apellidos
      ].filter(Boolean).join(' '),

      detalle: 'Cambio de estado de un registro del directorio.',
      datos_antes: existing
    },

    () => {
      const result = SUNARPCore.setRecordStatus(
        _directoryGetSource_(),
        'id',
        recordId,
        'active',
        active
      );

      _directoryInvalidateCache_();

      return {
        value: {
          ...result,
          record: {
            ...enriched,
            active
          }
        },

        auditAfter: {
          ...existing,
          active
        }
      };
    }
  );
}


/**
 * Elimina físicamente un registro del directorio.
 *
 * La operación se delega a SUNARP Core.
 * Después de eliminarlo, invalida la caché.
 */
function deleteDirectoryEntry(id) {
  const recordId = _directoryText_(id);

  if (!recordId) {
    throw new Error(
      'Debes proporcionar el identificador del servidor.'
    );
  }

  const authorization = _directoryAuthorizationContext_(
    'DIRECTORIOS_ELIMINAR'
  );

  const context = _directoryLoadContext_();

  const existing = context.servidores.find(item =>
    _directoryKey_(item.id) === recordId
  );

  if (!existing) {
    throw new Error(
      `No se encontró el servidor "${recordId}".`
    );
  }

  const relationMap = _directoryRelationMap_(context);

  const enriched = _directoryEnrichRecord_(
    existing,
    context,
    relationMap
  );

  _directoryAssertScope_(
    authorization,
    enriched,
    'Eliminación de un registro fuera del ámbito asignado.'
  );

  return _accessRunAudited_(
    authorization.auth,
    {
      accion: 'ELIMINAR_SERVIDOR_DIRECTORIO',
      modulo: 'DIRECTORIOS',
      tipo_entidad: 'SERVIDOR',
      registro_id: recordId,

      registro_nombre: [
        existing.nombres,
        existing.apellidos
      ].filter(Boolean).join(' '),

      detalle: 'Eliminación física de un registro del directorio.',
      datos_antes: existing
    },

    () => {
      SUNARPCore.deleteRecord(
        _directoryGetSource_(),
        'id',
        recordId
      );

      _directoryInvalidateCache_();

      return {
        value: {
          success: true,
          message: 'El registro se eliminó correctamente.',
          id: recordId
        },

        auditAfter: null
      };
    }
  );
}


