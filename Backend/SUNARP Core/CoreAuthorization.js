/**
 * SUNARP Core - Authorization
 *
 * Motor genérico de autorización para aplicaciones SUNARP.
 * No conoce hojas de cálculo, archivos, correos de usuarios ni reglas
 * administrativas particulares de una aplicación.
 *
 * CONTRATO ÚNICO DE DATOS
 *
 * resolveAuthorizationContext({
 *   personaId: 'PER_117',
 *   users: [{ persona_id, active }],
 *   modules: [{ modulo_id, codigo, nombre, active }],
 *   roles: [{ rol_id, nombre, active }],
 *   userRoles: [{ persona_id, modulo_id, rol_id, active }],
 *   permissions: [{ permiso_id, codigo, modulo_id, active }],
 *   rolePermissions: [{ rol_id, permiso_id, active }],
 *   scopes: [{
 *     persona_id, modulo_id, tipo_ambito, referencia_id,
 *     incluir_descendientes, active
 *   }]
 * });
 *
 * Reglas:
 * - La identidad de autorización es exclusivamente persona_id.
 * - Una persona tiene como máximo un rol activo por módulo.
 * - Los permisos se conceden por la relación rol-permiso, siempre que
 *   el permiso pertenezca al mismo módulo al que está asignado el rol.
 * - Los ámbitos pertenecen a una persona y a un módulo determinados.
 * - Los ámbitos de módulos distintos nunca se acumulan ni se transfieren.
 * - Los registros activos utilizan active: true; los inactivos, false.
 */

/**
 * Obtiene el correo de la sesión. Es una utilidad de identidad para que
 * la aplicación consumidora pueda resolver persona_id en su propio modelo.
 * El correo no interviene en la autorización de este módulo.
 */
function getCurrentUserEmail() {
  const email = Session.getActiveUser().getEmail();
  return String(email || '').trim().toLowerCase();
}

function _coreAuthText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _coreAuthUpper_(value) {
  return _coreAuthText_(value).toUpperCase();
}

/**
 * Interpreta exclusivamente la convención active TRUE/FALSE.
 * Los textos TRUE/FALSE se admiten por si el adaptador de datos devuelve
 * valores de hoja como texto; estados ACTIVO/INACTIVO no son válidos aquí.
 */
function _coreAuthIsActive_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  return _coreAuthUpper_(value) === 'TRUE';
}

function _coreAuthIsTruthy_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  return ['TRUE', 'SI', 'SÍ', 'YES', '1'].includes(
    _coreAuthUpper_(value)
  );
}

function _coreAuthAssertUniqueActiveIds_(records, idField, label) {
  const ids = new Set();

  (records || []).forEach(record => {
    if (!_coreAuthIsActive_(record.active)) return;

    const id = _coreAuthText_(record[idField]);

    if (!id) {
      throw new Error(
        'SUNARP Core: existe un registro activo sin identificador en ' + label + '.'
      );
    }

    if (ids.has(id)) {
      throw new Error(
        'SUNARP Core: identificador activo duplicado en ' + label + ': ' + id + '.'
      );
    }

    ids.add(id);
  });
}

function _coreAuthBuildActiveMap_(records, idField, label) {
  _coreAuthAssertUniqueActiveIds_(records, idField, label);

  const map = new Map();

  (records || []).forEach(record => {
    if (!_coreAuthIsActive_(record.active)) return;

    map.set(_coreAuthText_(record[idField]), record);
  });

  return map;
}

function _coreAuthAssertUniqueActiveCodes_(records, label) {
  const codes = new Set();

  (records || []).forEach(record => {
    if (!_coreAuthIsActive_(record.active)) return;

    const code = _coreAuthUpper_(record.codigo);

    if (!code) {
      throw new Error(
        'SUNARP Core: existe un registro activo sin código en ' + label + '.'
      );
    }

    if (codes.has(code)) {
      throw new Error(
        'SUNARP Core: código activo duplicado en ' + label + ': ' + code + '.'
      );
    }

    codes.add(code);
  });
}

function _coreAuthAssertUniqueActivePairs_(
  records,
  firstField,
  secondField,
  label
) {
  const pairs = new Set();

  (records || []).forEach(record => {
    if (!_coreAuthIsActive_(record.active)) return;

    const first = _coreAuthText_(record[firstField]);
    const second = _coreAuthText_(record[secondField]);

    if (!first || !second) {
      throw new Error(
        'SUNARP Core: existe una relación activa incompleta en ' + label + '.'
      );
    }

    const key = first + '\u0000' + second;

    if (pairs.has(key)) {
      throw new Error(
        'SUNARP Core: relación activa duplicada en ' + label + '.'
      );
    }

    pairs.add(key);
  });
}

/**
 * Construye el contexto de autorización para una persona.
 *
 * La función no consulta Session ni busca usuarios por correo. La aplicación
 * consumidora resuelve la identidad y entrega personaId, junto con los
 * registros de seguridad ya leídos.
 *
 * Retorna:
 * {
 *   authenticated: boolean,
 *   personaId: string,
 *   user: Object|null,
 *   moduleAccess: [{
 *     modulo_id: string,
 *     module: Object,
 *     rol_id: string,
 *     role: Object,
 *     permissions: Object[],
 *     permissionCodes: string[],
 *     scopes: Object[]
 *   }]
 * }
 */
function resolveAuthorizationContext(data) {
  data = data || {};

  const personaId = _coreAuthText_(data.personaId);

  const emptyContext = {
    authenticated: false,
    personaId,
    user: null,
    moduleAccess: []
  };

  if (!personaId) return emptyContext;

  const users = Array.isArray(data.users) ? data.users : [];
  const modules = Array.isArray(data.modules) ? data.modules : [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const userRoles = Array.isArray(data.userRoles) ? data.userRoles : [];
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  const rolePermissions = Array.isArray(data.rolePermissions)
    ? data.rolePermissions
    : [];
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];

  const activeUsers = users.filter(user =>
    _coreAuthText_(user.persona_id) === personaId &&
    _coreAuthIsActive_(user.active)
  );

  if (activeUsers.length > 1) {
    throw new Error(
      'SUNARP Core: existe más de un usuario activo para la persona ' +
      personaId + '.'
    );
  }

  const user = activeUsers[0] || null;

  if (!user) return emptyContext;

  const moduleById = _coreAuthBuildActiveMap_(
    modules,
    'modulo_id',
    'Modulos.modulo_id'
  );
  _coreAuthAssertUniqueActiveCodes_(modules, 'Modulos.codigo');

  const roleById = _coreAuthBuildActiveMap_(
    roles,
    'rol_id',
    'Roles.rol_id'
  );

  const permissionById = _coreAuthBuildActiveMap_(
    permissions,
    'permiso_id',
    'Permisos.permiso_id'
  );
  _coreAuthAssertUniqueActiveCodes_(permissions, 'Permisos.codigo');

  const activeUserRoleRows = userRoles.filter(item =>
    _coreAuthText_(item.persona_id) === personaId &&
    _coreAuthIsActive_(item.active)
  );

  const activeAssignmentByModule = new Map();

  activeUserRoleRows.forEach(item => {
    const moduloId = _coreAuthText_(item.modulo_id);
    const rolId = _coreAuthText_(item.rol_id);

    if (!moduloId || !rolId) {
      throw new Error(
        'SUNARP Core: existe una asignación activa UsuarioRol incompleta ' +
        'para la persona ' + personaId + '.'
      );
    }

    if (!moduleById.has(moduloId)) {
      // Una asignación a un módulo inexistente o inactivo no concede acceso.
      return;
    }

    if (activeAssignmentByModule.has(moduloId)) {
      throw new Error(
        'SUNARP Core: la persona ' + personaId +
        ' tiene más de un rol activo en el módulo ' + moduloId + '.'
      );
    }

    activeAssignmentByModule.set(moduloId, item);
  });

  _coreAuthAssertUniqueActivePairs_(
    rolePermissions,
    'rol_id',
    'permiso_id',
    'RolPermiso'
  );


  const rolePermissionIdsByRole = new Map();

  rolePermissions.forEach(item => {
    if (!_coreAuthIsActive_(item.active)) return;

    const rolId = _coreAuthText_(item.rol_id);
    const permisoId = _coreAuthText_(item.permiso_id);

    if (!rolId || !permisoId) return;

    if (!rolePermissionIdsByRole.has(rolId)) {
      rolePermissionIdsByRole.set(rolId, new Set());
    }

    rolePermissionIdsByRole.get(rolId).add(permisoId);
  });

  const scopesByModule = new Map();

  scopes.forEach(scope => {
    if (
      !_coreAuthIsActive_(scope.active) ||
      _coreAuthText_(scope.persona_id) !== personaId
    ) {
      return;
    }

    const moduloId = _coreAuthText_(scope.modulo_id);

    // Solo se consideran ámbitos de módulos activos donde la persona
    // también dispone de una asignación activa de rol.
    if (
      !moduloId ||
      !moduleById.has(moduloId) ||
      !activeAssignmentByModule.has(moduloId)
    ) {
      return;
    }

    if (!scopesByModule.has(moduloId)) {
      scopesByModule.set(moduloId, []);
    }

    scopesByModule.get(moduloId).push(scope);
  });

  const moduleAccess = [];

  activeAssignmentByModule.forEach((assignment, moduloId) => {
    const rolId = _coreAuthText_(assignment.rol_id);
    const role = roleById.get(rolId);

    // Un rol inactivo o inexistente no produce acceso al módulo.
    if (!role) return;

    const assignedPermissionIds =
      rolePermissionIdsByRole.get(rolId) || new Set();

    const modulePermissions = [];

    assignedPermissionIds.forEach(permisoId => {
      const permission = permissionById.get(permisoId);

      if (!permission) return;

      // Aislamiento modular: el permiso debe pertenecer al módulo
      // de la asignación persona-rol que se está resolviendo.
      if (_coreAuthText_(permission.modulo_id) !== moduloId) return;

      const code = _coreAuthUpper_(permission.codigo);

      if (!code) return;

      modulePermissions.push(permission);
    });

    const permissionCodes = Array.from(new Set(
      modulePermissions.map(permission =>
        _coreAuthUpper_(permission.codigo)
      )
    ));

    moduleAccess.push({
      modulo_id: moduloId,
      module: moduleById.get(moduloId),
      rol_id: rolId,
      role,
      permissions: modulePermissions,
      permissionCodes,
      scopes: scopesByModule.get(moduloId) || []
    });
  });

  return {
    authenticated: true,
    personaId,
    user,
    moduleAccess
  };
}

/**
 * Devuelve el acceso de la persona a un módulo, identificado exclusivamente
 * por modulo_id. Nunca acepta el código o nombre del módulo como sustituto.
 */
function _coreAuthGetModuleAccess_(context, moduloId) {
  if (!context || context.authenticated !== true) return null;

  const expectedModuleId = _coreAuthText_(moduloId);

  if (!expectedModuleId) return null;

  return (context.moduleAccess || []).find(item =>
    item.modulo_id === expectedModuleId
  ) || null;
}

/**
 * Comprueba un permiso dentro de un módulo concreto.
 * moduloId es obligatorio: no existe una comprobación global por código.
 */
function authorizationHasPermission(context, permissionCode, moduloId) {
  const moduleAccess = _coreAuthGetModuleAccess_(context, moduloId);

  if (!moduleAccess) return false;

  const expectedCode = _coreAuthUpper_(permissionCode);

  if (!expectedCode) return false;

  return moduleAccess.permissionCodes.includes(expectedCode);
}

/**
 * Comprueba si un registro pertenece a alguno de los ámbitos activos
 * de la persona para el modulo_id indicado.
 *
 * Tipos admitidos:
 * - TOTAL
 * - SEDE
 * - ESTRUCTURA_ORG
 * - LOCAL
 *
 * La lista structures contiene nodos del catálogo organizacional:
 * { id, parent_id, sede_id }.
 *
 * fields permite adaptar únicamente los campos del registro de negocio
 * y del catálogo organizacional, sin alterar el contrato de seguridad.
 */
function authorizationIsRecordInScope(
  context,
  moduloId,
  record,
  structures,
  fields
) {
  const moduleAccess = _coreAuthGetModuleAccess_(context, moduloId);

  if (!moduleAccess || !moduleAccess.scopes.length) return false;

  const activeScopes = moduleAccess.scopes;

  if (activeScopes.some(scope =>
    _coreAuthUpper_(scope.tipo_ambito) === 'TOTAL'
  )) {
    return true;
  }

  record = record || {};
  fields = fields || {};

  const f = Object.assign({
    recordOrganizationStructureId: 'estructura_org_id',
    recordStructureId: 'estructura_id',
    recordLocalId: 'local_id',
    recordSiteId: 'sede_id',
    structureId: 'id',
    structureParentId: 'parent_id',
    structureSiteId: 'sede_id'
  }, fields);

  const nodes = Array.isArray(structures) ? structures : [];
  const structureMap = new Map();

  nodes.forEach(node => {
    const id = _coreAuthText_(node[f.structureId]);

    if (!id) return;

    if (structureMap.has(id)) {
      throw new Error(
        'SUNARP Core: identificador duplicado en el catálogo organizacional: ' +
        id + '.'
      );
    }

    structureMap.set(id, node);
  });

  const structureId = _coreAuthText_(
    record[f.recordOrganizationStructureId] ||
    record[f.recordStructureId]
  );

  const localId = _coreAuthText_(record[f.recordLocalId]);

  /*
   * Si el registro declara una estructura orgánica, esa estructura debe
   * existir en el catálogo. No se confía en un sede_id enviado por el registro
   * cuando no se puede verificar su estructura.
   */
  let siteId = '';

  if (structureId) {
    const structure = structureMap.get(structureId);

    if (!structure) return false;

    siteId = _coreAuthText_(structure[f.structureSiteId]);
  } else {
    siteId = _coreAuthText_(record[f.recordSiteId]);
  }

  return activeScopes.some(scope => {
    const type = _coreAuthUpper_(scope.tipo_ambito);
    const referenceId = _coreAuthText_(scope.referencia_id);

    if (type === 'SEDE') {
      return Boolean(referenceId && siteId && referenceId === siteId);
    }

    if (type === 'LOCAL') {
      // LOCAL cubre únicamente registros adscritos directamente al local,
      // sin estructura orgánica.
      return Boolean(
        referenceId &&
        localId &&
        referenceId === localId &&
        !structureId
      );
    }

    if (type === 'ESTRUCTURA_ORG') {
      if (!referenceId || !structureId) return false;

      // Tanto la estructura de referencia como la del registro deben
      // pertenecer al catálogo antes de comparar su relación jerárquica.
      if (!structureMap.has(referenceId)) return false;
      if (!structureMap.has(structureId)) return false;
      if (referenceId === structureId) return true;

      if (!_coreAuthIsTruthy_(scope.incluir_descendientes)) return false;

      const visited = new Set();
      let currentId = structureId;

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        const current = structureMap.get(currentId);

        if (!current) return false;

        const parentId = _coreAuthText_(
          current[f.structureParentId]
        );

        if (!parentId) return false;
        if (parentId === referenceId) return true;

        currentId = parentId;
      }
    }

    return false;
  });
}
