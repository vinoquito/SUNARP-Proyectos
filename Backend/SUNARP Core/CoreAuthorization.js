/**
 * SUNARP Core - Authorization
 * Motor genérico de autorización reutilizable por aplicaciones SUNARP.
 * No contiene nombres de hojas ni identificadores de archivos concretos.
 */

function getCurrentUserEmail() {
  const email = Session.getActiveUser().getEmail();
  return String(email || '').trim().toLowerCase();
}

function _coreAuthText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _coreAuthActive_(value) {
  const normalized = _coreAuthText_(value).toUpperCase();
  return ['ACTIVO', 'ACTIVE', 'TRUE', 'VERDADERO', '1', 'SI', 'SÍ'].includes(normalized);
}

/**
 * Construye un contexto de autorización a partir de registros entregados
 * por la aplicación consumidora.
 *
 * data: { email, users, roles, permissions, rolePermissions, scopes }
 * fields: permite mapear esquemas distintos al esquema predeterminado.
 */
function resolveAuthorizationContext(data, fields) {
  data = data || {};
  fields = fields || {};

  const f = Object.assign({
    userEmail: 'correo_institucional',
    userStatus: 'estado',
    userRoleId: 'rol_id',
    roleId: 'rol_id',
    roleStatus: 'estado',
    permissionId: 'permiso_id',
    permissionCode: 'codigo',
    permissionStatus: 'estado',
    assignmentRoleId: 'rol_id',
    assignmentPermissionId: 'permiso_id',
    assignmentStatus: 'estado',
    scopeEmail: 'correo_institucional',
    scopeModule: 'modulo',
    scopeType: 'tipo_ambito',
    scopeReferenceId: 'referencia_id',
    scopeStatus: 'estado'
  }, fields);

  const email = _coreAuthText_(data.email || getCurrentUserEmail()).toLowerCase();

  if (!email) {
    return {
      authenticated: false,
      email: '',
      user: null,
      role: null,
      permissions: [],
      permissionCodes: [],
      scopes: []
    };
  }

  const users = Array.isArray(data.users) ? data.users : [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  const assignments = Array.isArray(data.rolePermissions) ? data.rolePermissions : [];
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];

  const user = users.find(item =>
    _coreAuthText_(item[f.userEmail]).toLowerCase() === email &&
    _coreAuthActive_(item[f.userStatus])
  ) || null;

  if (!user) {
    return {
      authenticated: false,
      email,
      user: null,
      role: null,
      permissions: [],
      permissionCodes: [],
      scopes: []
    };
  }

  const roleId = _coreAuthText_(user[f.userRoleId]);

  const role = roles.find(item =>
    _coreAuthText_(item[f.roleId]) === roleId &&
    _coreAuthActive_(item[f.roleStatus])
  ) || null;

  if (!role) {
    return {
      authenticated: false,
      email,
      user,
      role: null,
      permissions: [],
      permissionCodes: [],
      scopes: []
    };
  }

  const permissionMap = new Map();

  permissions.forEach(item => {
    if (!_coreAuthActive_(item[f.permissionStatus])) return;

    const id = _coreAuthText_(item[f.permissionId]);
    const code = _coreAuthText_(item[f.permissionCode]).toUpperCase();

    if (id && code) {
      permissionMap.set(id, item);
    }
  });

  const permissionByCode = new Map();

  assignments.forEach(item => {
    if (!_coreAuthActive_(item[f.assignmentStatus])) return;
    if (_coreAuthText_(item[f.assignmentRoleId]) !== roleId) return;

    const permission = permissionMap.get(
      _coreAuthText_(item[f.assignmentPermissionId])
    );

    if (!permission) return;

    const code = _coreAuthText_(permission[f.permissionCode]).toUpperCase();

    if (code) {
      permissionByCode.set(code, permission);
    }
  });

  const userScopes = scopes.filter(item =>
    _coreAuthText_(item[f.scopeEmail]).toLowerCase() === email &&
    _coreAuthActive_(item[f.scopeStatus])
  );

  return {
    authenticated: true,
    email,
    user,
    role,
    permissions: Array.from(permissionByCode.values()),
    permissionCodes: Array.from(permissionByCode.keys()),
    scopes: userScopes
  };
}

/**
 * Comprueba si el contexto contiene un permiso activo.
 */
function authorizationHasPermission(context, permissionCode) {
  if (!context || context.authenticated !== true) return false;

  const expected = _coreAuthText_(permissionCode).toUpperCase();

  return Boolean(expected) &&
    Array.isArray(context.permissionCodes) &&
    context.permissionCodes.includes(expected);
}

/**
 * Comprueba si un registro pertenece a alguno de los ámbitos activos
 * del usuario para el módulo indicado. Los ámbitos se interpretan como unión.
 *
 * record admite sede_id y estructura_org_id/estructura_id.
 * structures contiene nodos {id, parent_id, sede_id}.
 */
function authorizationIsRecordInScope(context, moduleCode, record, structures) {
  if (!context || context.authenticated !== true) return false;

  const module = _coreAuthText_(moduleCode).toUpperCase();

  const scopes = (context.scopes || []).filter(item =>
    _coreAuthText_(item.modulo).toUpperCase() === module
  );

  if (!scopes.length) return false;

  if (scopes.some(item =>
    _coreAuthText_(item.tipo_ambito).toUpperCase() === 'TOTAL'
  )) {
    return true;
  }

  record = record || {};

  const nodes = Array.isArray(structures) ? structures : [];

  const structureMap = new Map(nodes.map(node => [
    _coreAuthText_(node.id),
    node
  ]));

  const structureId = _coreAuthText_(
    record.estructura_org_id ||
    record.estructura_id ||
    record.structureId
  );

  // Si existe una estructura orgánica conocida, la sede se deriva
  // del catálogo maestro y no de un sede_id enviado en el registro.
  let sedeId = structureId && structureMap.has(structureId)
    ? _coreAuthText_(structureMap.get(structureId).sede_id)
    : _coreAuthText_(record.sede_id || record.sedeId);

  return scopes.some(scope => {
    const type = _coreAuthText_(scope.tipo_ambito).toUpperCase();
    const referenceId = _coreAuthText_(scope.referencia_id);

    if (type === 'SEDE') {
      return Boolean(referenceId && sedeId && referenceId === sedeId);
    }

    if (type === 'ESTRUCTURA_ORG') {
      if (!referenceId || !structureId) return false;
      if (referenceId === structureId) return true;

      const includeDescendants = [
        'SI', 'SÍ', 'TRUE', 'VERDADERO', '1', 'YES'
      ].includes(
        _coreAuthText_(scope.incluir_descendientes).toUpperCase()
      );

      if (!includeDescendants) return false;

      const visited = new Set();
      let currentId = structureId;

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        const current = structureMap.get(currentId);

        if (!current) return false;

        const parentId = _coreAuthText_(current.parent_id);

        if (!parentId) return false;
        if (parentId === referenceId) return true;

        currentId = parentId;
      }
    }

    return false;
  });
}