/**
 * SUNARP Core - Authorization
 * Motor genérico de autorización reutilizable por aplicaciones SUNARP.
 * No contiene nombres de hojas ni identificadores de archivos concretos.
 *
 * Modelo nuevo:
 *   Users: persona_id, active
 *   UserRoles: persona_id, modulo_id, rol_id, active
 *   Roles: rol_id, active
 *   Modules: modulo_id, codigo, active
 *   Permissions: permiso_id, codigo, modulo_id, active
 *   RolePermissions: rol_id, permiso_id, active
 *   Scopes: persona_id, modulo_id, tipo_ambito, referencia_id,
 *           incluir_descendientes, active
 *
 * El modelo anterior (usuario por correo y rol_id en Users) se mantiene
 * disponible para no romper aplicaciones consumidoras aún no migradas.
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

function _coreAuthActive_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  return [
    'ACTIVO',
    'ACTIVE',
    'TRUE',
    'VERDADERO',
    '1',
    'SI',
    'SÍ'
  ].includes(_coreAuthUpper_(value));
}

/**
 * El nuevo esquema utiliza active. estado se consulta únicamente como
 * respaldo para conservar compatibilidad con aplicaciones anteriores.
 */
function _coreAuthIsActiveRecord_(record, statusField, legacyStatusField) {
  if (!record) return false;

  let value;

  if (Object.prototype.hasOwnProperty.call(record, statusField)) {
    value = record[statusField];
  } else if (
    legacyStatusField &&
    Object.prototype.hasOwnProperty.call(record, legacyStatusField)
  ) {
    value = record[legacyStatusField];
  } else {
    return false;
  }

  return _coreAuthActive_(value);
}

function _coreAuthTruthy_(value) {
  return [
    'SI',
    'SÍ',
    'TRUE',
    'VERDADERO',
    '1',
    'YES'
  ].includes(_coreAuthUpper_(value));
}

function _coreAuthFindModuleEntry_(moduleEntries, moduleKey) {
  const expected = _coreAuthUpper_(moduleKey);
  if (!expected) return null;

  return (moduleEntries || []).find(module =>
    _coreAuthUpper_(module.id) === expected ||
    _coreAuthUpper_(module.code) === expected
  ) || null;
}

/**
 * Construye el contexto de autorización a partir de los registros
 * entregados por la aplicación consumidora.
 *
 * Nuevo contrato:
 * {
 *   personaId,
 *   email,               // opcional; solo dato contextual/auditoría
 *   users,
 *   modules,
 *   roles,
 *   userRoles,
 *   permissions,
 *   rolePermissions,
 *   scopes
 * }
 *
 * Contrato anterior:
 * {
 *   email,
 *   users,               // correo_institucional y rol_id
 *   roles,
 *   permissions,
 *   rolePermissions,
 *   scopes               // correo_institucional y modulo textual
 * }
 *
 * fields permite mapear esquemas distintos al esquema predeterminado.
 */
function resolveAuthorizationContext(data, fields) {
  data = data || {};
  fields = fields || {};

  const f = Object.assign({
    // Identidad y usuarios.
    userPersonId: 'persona_id',
    userEmail: 'correo_institucional',
    userStatus: 'active',
    userRoleId: 'rol_id',

    // Catálogos.
    roleId: 'rol_id',
    roleName: 'nombre',
    roleStatus: 'active',
    moduleId: 'modulo_id',
    moduleCode: 'codigo',
    moduleStatus: 'active',

    // Relación persona - rol - módulo.
    userRolePersonId: 'persona_id',
    userRoleModuleId: 'modulo_id',
    userRoleRoleId: 'rol_id',
    userRoleStatus: 'active',

    // Permisos.
    permissionId: 'permiso_id',
    permissionCode: 'codigo',
    permissionModuleId: 'modulo_id',
    permissionStatus: 'active',
    assignmentRoleId: 'rol_id',
    assignmentPermissionId: 'permiso_id',
    assignmentStatus: 'active',

    // Ámbitos.
    scopePersonId: 'persona_id',
    scopeEmail: 'correo_institucional',
    scopeModuleId: 'modulo_id',
    scopeModule: 'modulo',
    scopeType: 'tipo_ambito',
    scopeReferenceId: 'referencia_id',
    scopeIncludeDescendants: 'incluir_descendientes',
    scopeStatus: 'active',

    // Compatibilidad de estado con el esquema anterior.
    legacyStatus: 'estado',

    // Campos de ubicación de los registros y del catálogo orgánico.
    recordOrganizationStructureId: 'estructura_org_id',
    recordStructureId: 'estructura_id',
    recordLocalId: 'local_id',
    recordSiteId: 'sede_id',
    structureNodeId: 'id',
    structureParentId: 'parent_id',
    structureSiteId: 'sede_id'
  }, fields);

  const personaId = _coreAuthText_(
    data.personaId !== undefined ? data.personaId : data.personId
  );
  const isPersonModel = Boolean(personaId);

  const email = _coreAuthText_(
    data.email || (isPersonModel ? '' : getCurrentUserEmail())
  ).toLowerCase();

  if (!isPersonModel && !email) {
    return {
      authenticated: false,
      model: 'legacy',
      email: '',
      personaId: '',
      user: null,
      role: null,
      roles: [],
      roleAssignments: [],
      permissions: [],
      permissionEntries: [],
      permissionCodes: [],
      scopes: [],
      scopeEntries: [],
      modules: []
    };
  }

  const users = Array.isArray(data.users) ? data.users : [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const modulesInput = Array.isArray(data.modules) ? data.modules : [];
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  const rolePermissionAssignments = Array.isArray(data.rolePermissions)
    ? data.rolePermissions
    : [];
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];

  const user = isPersonModel
    ? users.find(item =>
        _coreAuthText_(item[f.userPersonId]) === personaId &&
        _coreAuthIsActiveRecord_(
          item,
          f.userStatus,
          f.legacyStatus
        )
      ) || null
    : users.find(item =>
        _coreAuthText_(item[f.userEmail]).toLowerCase() === email &&
        _coreAuthIsActiveRecord_(
          item,
          f.userStatus,
          f.legacyStatus
        )
      ) || null;

  if (!user) {
    return {
      authenticated: false,
      model: isPersonModel ? 'persona' : 'legacy',
      email,
      personaId,
      user: null,
      role: null,
      roles: [],
      roleAssignments: [],
      permissions: [],
      permissionEntries: [],
      permissionCodes: [],
      scopes: [],
      scopeEntries: [],
      modules: []
    };
  }

  /*
   * NUEVO MODELO: una persona puede tener un rol distinto en cada módulo.
   * Cada permiso solo se incorpora cuando el modulo_id de UsuarioRol
   * coincide con el modulo_id del permiso.
   */
  if (isPersonModel) {
    const activeModules = modulesInput.filter(module =>
      _coreAuthIsActiveRecord_(
        module,
        f.moduleStatus,
        f.legacyStatus
      ) &&
      _coreAuthText_(module[f.moduleId])
    );

    const moduleEntries = activeModules.map(module => ({
      record: module,
      id: _coreAuthText_(module[f.moduleId]),
      code: _coreAuthUpper_(module[f.moduleCode])
    }));

    const moduleById = new Map(
      moduleEntries.map(module => [module.id, module])
    );

    const activeRoles = roles.filter(role =>
      _coreAuthIsActiveRecord_(
        role,
        f.roleStatus,
        f.legacyStatus
      )
    );

    const roleById = new Map(
      activeRoles.map(role => [
        _coreAuthText_(role[f.roleId]),
        role
      ])
    );

    const userRoleRows = Array.isArray(data.userRoles)
      ? data.userRoles
      : [];

    // Una asignación activa por persona y módulo. Si los datos contienen
    // más de una, se excluye ese módulo para no combinar roles por error.
    const activeUserRoleRows = userRoleRows.filter(item =>
      _coreAuthText_(item[f.userRolePersonId]) === personaId &&
      _coreAuthIsActiveRecord_(
        item,
        f.userRoleStatus,
        f.legacyStatus
      ) &&
      moduleById.has(_coreAuthText_(item[f.userRoleModuleId]))
    );

    const userRoleCountByModule = new Map();

    activeUserRoleRows.forEach(item => {
      const id = _coreAuthText_(item[f.userRoleModuleId]);
      userRoleCountByModule.set(
        id,
        (userRoleCountByModule.get(id) || 0) + 1
      );
    });

    const roleAssignments = [];

    activeUserRoleRows.forEach(item => {
      const moduleId = _coreAuthText_(item[f.userRoleModuleId]);
      const roleId = _coreAuthText_(item[f.userRoleRoleId]);

      if (userRoleCountByModule.get(moduleId) !== 1) return;

      const role = roleById.get(roleId);
      const module = moduleById.get(moduleId);

      if (!role || !module) return;

      roleAssignments.push({
        record: item,
        personaId,
        roleId,
        role,
        moduleId,
        moduleCode: module.code,
        module: module.record,
        permissions: [],
        permissionCodes: []
      });
    });

    const activePermissionsById = new Map();

    permissions.forEach(permission => {
      if (!_coreAuthIsActiveRecord_(
        permission,
        f.permissionStatus,
        f.legacyStatus
      )) return;

      const permissionId = _coreAuthText_(permission[f.permissionId]);
      const moduleId = _coreAuthText_(permission[f.permissionModuleId]);
      const code = _coreAuthUpper_(permission[f.permissionCode]);

      if (
        permissionId &&
        code &&
        moduleById.has(moduleId)
      ) {
        activePermissionsById.set(permissionId, {
          record: permission,
          id: permissionId,
          code,
          moduleId
        });
      }
    });

    const permissionEntriesByKey = new Map();

    roleAssignments.forEach(roleAssignment => {
      rolePermissionAssignments.forEach(assignment => {
        if (!_coreAuthIsActiveRecord_(
          assignment,
          f.assignmentStatus,
          f.legacyStatus
        )) return;

        if (
          _coreAuthText_(assignment[f.assignmentRoleId]) !==
          roleAssignment.roleId
        ) return;

        const permission = activePermissionsById.get(
          _coreAuthText_(assignment[f.assignmentPermissionId])
        );

        if (!permission) return;

        // Regla de aislamiento: un rol asignado en un módulo no hereda
        // permisos que pertenecen a otro módulo.
        if (permission.moduleId !== roleAssignment.moduleId) return;

        const key = roleAssignment.moduleId + '|' + permission.id;

        if (!permissionEntriesByKey.has(key)) {
          permissionEntriesByKey.set(key, {
            permission: permission.record,
            permissionId: permission.id,
            permissionCode: permission.code,
            moduleId: roleAssignment.moduleId,
            moduleCode: roleAssignment.moduleCode,
            roleId: roleAssignment.roleId
          });
        }
      });
    });

    const permissionEntries = Array.from(permissionEntriesByKey.values());

    roleAssignments.forEach(roleAssignment => {
      const entries = permissionEntries.filter(entry =>
        entry.moduleId === roleAssignment.moduleId &&
        entry.roleId === roleAssignment.roleId
      );

      roleAssignment.permissions = entries.map(entry => entry.permission);
      roleAssignment.permissionCodes = entries.map(entry => entry.permissionCode);
    });

    const assignedModuleIds = new Set(
      roleAssignments.map(item => item.moduleId)
    );

    const scopeEntries = scopes
      .filter(scope =>
        _coreAuthText_(scope[f.scopePersonId]) === personaId &&
        _coreAuthIsActiveRecord_(
          scope,
          f.scopeStatus,
          f.legacyStatus
        )
      )
      .map(scope => {
        const moduleId = _coreAuthText_(scope[f.scopeModuleId]);
        const module = moduleById.get(moduleId);

        return module && assignedModuleIds.has(moduleId)
          ? {
              record: scope,
              moduleId,
              moduleCode: module.code,
              type: _coreAuthUpper_(scope[f.scopeType]),
              referenceId: _coreAuthText_(scope[f.scopeReferenceId]),
              includeDescendants: scope[f.scopeIncludeDescendants]
            }
          : null;
      })
      .filter(Boolean);

    const scopedRecords = scopeEntries.map(entry => entry.record);
    const permissionCodes = Array.from(new Set(
      permissionEntries.map(entry => entry.permissionCode)
    ));

    return {
      authenticated: true,
      model: 'persona',
      email,
      personaId,
      user,
      role: roleAssignments.length ? roleAssignments[0].role : null,
      roles: roleAssignments.map(item => item.role),
      roleAssignments,
      permissions: permissionEntries.map(entry => entry.permission),
      permissionEntries,
      permissionCodes,
      scopes: scopedRecords,
      scopeEntries,
      modules: moduleEntries.map(entry => entry.record),
      moduleEntries,
      fields: f
    };
  }

  /*
   * MODELO ANTERIOR: se conserva para no romper los consumidores que aún
   * almacenan el correo y un único rol_id directamente en Usuarios.
   */
  const roleId = _coreAuthText_(user[f.userRoleId]);

  const role = roles.find(item =>
    _coreAuthText_(item[f.roleId]) === roleId &&
    _coreAuthIsActiveRecord_(
      item,
      f.roleStatus,
      f.legacyStatus
    )
  ) || null;

  if (!role) {
    return {
      authenticated: false,
      model: 'legacy',
      email,
      personaId: '',
      user,
      role: null,
      roles: [],
      roleAssignments: [],
      permissions: [],
      permissionEntries: [],
      permissionCodes: [],
      scopes: [],
      scopeEntries: [],
      modules: []
    };
  }

  const permissionMap = new Map();

  permissions.forEach(item => {
    if (!_coreAuthIsActiveRecord_(
      item,
      f.permissionStatus,
      f.legacyStatus
    )) return;

    const id = _coreAuthText_(item[f.permissionId]);
    const code = _coreAuthUpper_(item[f.permissionCode]);

    if (id && code) {
      permissionMap.set(id, item);
    }
  });

  const permissionByCode = new Map();

  rolePermissionAssignments.forEach(item => {
    if (!_coreAuthIsActiveRecord_(
      item,
      f.assignmentStatus,
      f.legacyStatus
    )) return;

    if (_coreAuthText_(item[f.assignmentRoleId]) !== roleId) return;

    const permission = permissionMap.get(
      _coreAuthText_(item[f.assignmentPermissionId])
    );

    if (!permission) return;

    const code = _coreAuthUpper_(permission[f.permissionCode]);

    if (code) {
      permissionByCode.set(code, permission);
    }
  });

  const userScopes = scopes.filter(item =>
    _coreAuthText_(item[f.scopeEmail]).toLowerCase() === email &&
    _coreAuthIsActiveRecord_(
      item,
      f.scopeStatus,
      f.legacyStatus
    )
  );

  const legacyScopeEntries = userScopes.map(item => ({
    record: item,
    moduleId: '',
    moduleCode: _coreAuthUpper_(item[f.scopeModule]),
    type: _coreAuthUpper_(item[f.scopeType]),
    referenceId: _coreAuthText_(item[f.scopeReferenceId]),
    includeDescendants: item[f.scopeIncludeDescendants]
  }));

  return {
    authenticated: true,
    model: 'legacy',
    email,
    personaId: '',
    user,
    role,
    roles: [role],
    roleAssignments: [{
      record: user,
      personaId: '',
      roleId,
      role,
      moduleId: '',
      moduleCode: '',
      module: null,
      permissions: Array.from(permissionByCode.values()),
      permissionCodes: Array.from(permissionByCode.keys())
    }],
    permissions: Array.from(permissionByCode.values()),
    permissionEntries: [],
    permissionCodes: Array.from(permissionByCode.keys()),
    scopes: userScopes,
    scopeEntries: legacyScopeEntries,
    modules: [],
    fields: f
  };
}

/**
 * Comprueba si el contexto contiene un permiso activo.
 *
 * moduleIdOrCode es opcional por compatibilidad. En el nuevo modelo debe
 * enviarse para exigir que el permiso pertenezca al módulo indicado.
 */
function authorizationHasPermission(context, permissionCode, moduleIdOrCode) {
  if (!context || context.authenticated !== true) return false;

  const expectedCode = _coreAuthUpper_(permissionCode);
  if (!expectedCode) return false;

  if (context.model === 'persona') {
    const requestedModule = _coreAuthText_(moduleIdOrCode);
    let expectedModuleId = '';

    if (requestedModule) {
      const module = _coreAuthFindModuleEntry_(
        context.moduleEntries,
        requestedModule
      );

      if (!module) return false;
      expectedModuleId = module.id;
    }

    return (context.permissionEntries || []).some(entry =>
      entry.permissionCode === expectedCode &&
      (!expectedModuleId || entry.moduleId === expectedModuleId)
    );
  }

  return Array.isArray(context.permissionCodes) &&
    context.permissionCodes.includes(expectedCode);
}

/**
 * Comprueba si un registro pertenece a alguno de los ámbitos activos
 * del usuario para el módulo indicado. Los ámbitos se interpretan como unión.
 *
 * moduleIdOrCode:
 *   - Nuevo modelo: modulo_id o codigo de Modulos.
 *   - Modelo anterior: código textual almacenado en AmbitosAcceso.modulo.
 *
 * record admite sede_id, estructura_org_id/estructura_id y local_id.
 * structures contiene nodos {id, parent_id, sede_id}.
 */
function authorizationIsRecordInScope(context, moduleIdOrCode, record, structures) {
  if (!context || context.authenticated !== true) return false;

  const requestedModule = _coreAuthText_(moduleIdOrCode);
  if (!requestedModule) return false;

  let scopeEntries = [];

  if (context.model === 'persona') {
    const module = _coreAuthFindModuleEntry_(
      context.moduleEntries,
      requestedModule
    );

    if (!module) return false;

    scopeEntries = (context.scopeEntries || [])
      .filter(entry => entry.moduleId === module.id);
  } else {
    const expectedModule = _coreAuthUpper_(requestedModule);

    scopeEntries = (context.scopeEntries || [])
      .filter(entry => entry.moduleCode === expectedModule);
  }

  if (!scopeEntries.length) return false;

  if (scopeEntries.some(entry => entry.type === 'TOTAL')) {
    return true;
  }

  record = record || {};

  const f = context.fields || {};
  const structureNodeIdField = f.structureNodeId || 'id';
  const structureParentIdField = f.structureParentId || 'parent_id';
  const structureSiteIdField = f.structureSiteId || 'sede_id';
  const recordOrganizationStructureIdField =
    f.recordOrganizationStructureId || 'estructura_org_id';
  const recordStructureIdField = f.recordStructureId || 'estructura_id';
  const recordLocalIdField = f.recordLocalId || 'local_id';
  const recordSiteIdField = f.recordSiteId || 'sede_id';

  const nodes = Array.isArray(structures) ? structures : [];

  const structureMap = new Map(nodes.map(node => [
    _coreAuthText_(node[structureNodeIdField]),
    node
  ]));

  const structureId = _coreAuthText_(
    record[recordOrganizationStructureIdField] ||
    record[recordStructureIdField] ||
    record.structureId
  );

  // Si existe una estructura orgánica conocida, la sede se deriva
  // del catálogo maestro y no de un sede_id enviado en el registro.
  const siteId = structureId && structureMap.has(structureId)
    ? _coreAuthText_(
        structureMap.get(structureId)[structureSiteIdField]
      )
    : _coreAuthText_(
        record[recordSiteIdField] || record.sedeId
      );

  const localId = _coreAuthText_(
    record[recordLocalIdField] || record.localId
  );

  return scopeEntries.some(scope => {
    const type = scope.type;
    const referenceId = scope.referenceId;

    if (type === 'SEDE') {
      return Boolean(referenceId && siteId && referenceId === siteId);
    }

    if (type === 'LOCAL') {
      // LOCAL solo cubre asignaciones vinculadas directamente al local.
      // Si el registro tiene estructura orgánica, no pertenece a este ámbito.
      return Boolean(
        referenceId &&
        localId &&
        referenceId === localId &&
        !structureId
      );
    }

    if (type === 'ESTRUCTURA_ORG') {
      if (!referenceId || !structureId) return false;
      if (referenceId === structureId) return true;

      if (!_coreAuthTruthy_(scope.includeDescendants)) return false;

      const visited = new Set();
      let currentId = structureId;

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        const current = structureMap.get(currentId);

        if (!current) return false;

        const parentId = _coreAuthText_(
          current[structureParentIdField]
        );

        if (!parentId) return false;
        if (parentId === referenceId) return true;

        currentId = parentId;
      }
    }

    return false;
  });
}
