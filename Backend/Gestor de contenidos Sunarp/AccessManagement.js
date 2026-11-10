// ============================================================
// ADMINISTRACIÓN DE ACCESOS
// Usuarios, roles, permisos y asignaciones
// ============================================================

const ACCESS_ADMIN_PERMISSIONS_ = [
  'USUARIOS_ADMINISTRAR',
  'ROLES_ADMINISTRAR',
  'PERMISOS_ADMINISTRAR'
];

const ACCESS_TABLE_HEADERS_ = {
  users: [
    'correo_institucional',
    'nombre',
    'estado',
    'rol_id'
  ],

  roles: [
    'rol_id',
    'nombre',
    'descripcion',
    'estado'
  ],

  permissions: [
    'permiso_id',
    'codigo',
    'modulo',
    'operacion',
    'descripcion',
    'estado'
  ],

  rolePermissions: [
    'rol_id',
    'permiso_id',
    'estado'
  ]
};

// ============================================================
// VALIDACIÓN DE INTEGRIDAD
// ============================================================

function assertUniqueSecurityField_(records, field, label) {
  const seen = new Set();

  records.forEach(record => {
    const value = normalize_(record[field]).toLowerCase();

    if (!value) return;

    if (seen.has(value)) {
      throw new Error(
        'Configuración de seguridad inconsistente: el campo "' +
        label + '" contiene valores duplicados.'
      );
    }

    seen.add(value);
  });
}

function assertUniqueRolePermissionAssignments_(records) {
  const seen = new Set();

  records.forEach(record => {
    const roleId = normalize_(record.rol_id);
    const permissionId = normalize_(record.permiso_id);

    if (!roleId || !permissionId) return;

    const key = roleId + '\u0000' + permissionId;

    if (seen.has(key)) {
      throw new Error(
        'Configuración de seguridad inconsistente: hay asignaciones ' +
        'rol-permiso duplicadas.'
      );
    }

    seen.add(key);
  });
}

function getWritableSecurityTable_(sheetName, requiredHeaders) {
  const ss = getSecuritySpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'No existe la pestaña de seguridad "' + sheetName + '".'
    );
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error(
      'La pestaña "' + sheetName + '" no tiene encabezados.'
    );
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(value => normalize_(value).toLowerCase());

  const indexes = {};

  requiredHeaders.forEach(header => {
    const matches = headers.filter(value => value === header).length;
    const index = headers.indexOf(header);

    if (matches !== 1 || index === -1) {
      throw new Error(
        'La pestaña "' + sheetName +
        '" debe contener una sola columna "' + header + '".'
      );
    }

    indexes[header] = index;
  });

  const lastRow = sheet.getLastRow();

  const values = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn)
        .getDisplayValues()
    : [];

  const rows = values.map((row, index) => {
    const record = {};

    requiredHeaders.forEach(header => {
      record[header] = normalize_(row[indexes[header]]);
    });

    return {
      rowNumber: index + 2,
      values: row,
      record
    };
  }).filter(item =>
    requiredHeaders.some(header => item.record[header] !== '')
  );

  return {
    sheet,
    width: lastColumn,
    indexes,
    rows
  };
}

function appendSecurityRow_(table, values) {
  const row = Array(table.width).fill('');

  Object.keys(values).forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(table.indexes, field)) {
      throw new Error(
        'La columna "' + field + '" no existe en la tabla de seguridad.'
      );
    }

    row[table.indexes[field]] = values[field];
  });

  table.sheet.appendRow(row);
}

function updateSecurityRow_(table, rowNumber, values) {
  Object.keys(values).forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(table.indexes, field)) {
      throw new Error(
        'La columna "' + field + '" no existe en la tabla de seguridad.'
      );
    }

    table.sheet
      .getRange(rowNumber, table.indexes[field] + 1)
      .setValue(values[field]);
  });
}

function loadAccessAdminTables_() {
  const tables = {
    users: getWritableSecurityTable_(
      CONFIG.SHEET_USERS,
      ACCESS_TABLE_HEADERS_.users
    ),

    roles: getWritableSecurityTable_(
      CONFIG.SHEET_ROLES,
      ACCESS_TABLE_HEADERS_.roles
    ),

    permissions: getWritableSecurityTable_(
      CONFIG.SHEET_PERMISSIONS,
      ACCESS_TABLE_HEADERS_.permissions
    ),

    rolePermissions: getWritableSecurityTable_(
      CONFIG.SHEET_ROLE_PERMISSIONS,
      ACCESS_TABLE_HEADERS_.rolePermissions
    )
  };

  const snapshot = {};

  Object.keys(tables).forEach(name => {
    snapshot[name] = tables[name].rows.map(item => ({
      ...item.record
    }));
  });

  validateAccessSnapshot_(snapshot);

  return {
    tables,
    snapshot
  };
}

function validateAccessSnapshot_(snapshot) {
  assertUniqueSecurityField_(
    snapshot.users,
    'correo_institucional',
    'correo_institucional'
  );

  assertUniqueSecurityField_(
    snapshot.roles,
    'rol_id',
    'rol_id'
  );

  assertUniqueSecurityField_(
    snapshot.permissions,
    'permiso_id',
    'permiso_id'
  );

  assertUniqueSecurityField_(
    snapshot.permissions,
    'codigo',
    'codigo'
  );

  assertUniqueRolePermissionAssignments_(
    snapshot.rolePermissions
  );
}

function copyAccessSnapshot_(snapshot) {
  return {
    users: snapshot.users.map(record => ({ ...record })),
    roles: snapshot.roles.map(record => ({ ...record })),
    permissions: snapshot.permissions.map(record => ({ ...record })),
    rolePermissions: snapshot.rolePermissions.map(record => ({
      ...record
    }))
  };
}

// ============================================================
// PROTECCIÓN CONTRA LA PÉRDIDA DEL ÚLTIMO ADMINISTRADOR
// ============================================================

function countActiveSecurityAdministrators_(snapshot) {
  const requiredCodes = ACCESS_ADMIN_PERMISSIONS_;

  const activeRoles = new Set(
    snapshot.roles
      .filter(role => isSecurityActive_(role.estado))
      .map(role => role.rol_id)
  );

  const activePermissions = new Map(
    snapshot.permissions
      .filter(permission => isSecurityActive_(permission.estado))
      .map(permission => [
        permission.permiso_id,
        permission.codigo.toUpperCase()
      ])
  );

  const permissionsByRole = new Map();

  snapshot.rolePermissions.forEach(assignment => {
    if (
      !isSecurityActive_(assignment.estado) ||
      !activeRoles.has(assignment.rol_id)
    ) {
      return;
    }

    const code = activePermissions.get(assignment.permiso_id);

    if (!code) return;

    if (!permissionsByRole.has(assignment.rol_id)) {
      permissionsByRole.set(assignment.rol_id, new Set());
    }

    permissionsByRole.get(assignment.rol_id).add(code);
  });

  return snapshot.users.filter(user => {
    if (!isSecurityActive_(user.estado)) return false;
    if (!activeRoles.has(user.rol_id)) return false;

    const codes = permissionsByRole.get(user.rol_id);

    return Boolean(codes) &&
      requiredCodes.every(code => codes.has(code));
  }).length;
}

function assertAdministratorContinuity_(before, after) {
  const previousCount = countActiveSecurityAdministrators_(before);
  const nextCount = countActiveSecurityAdministrators_(after);

  // Permite inicializar la seguridad manualmente si todavía no
  // existe ningún rol con los tres permisos administrativos.
  if (previousCount > 0 && nextCount === 0) {
    throw new Error(
      'La operación dejaría el sistema sin administradores de seguridad. ' +
      'Conserva al menos un usuario activo con los tres permisos ' +
      'administrativos.'
    );
  }
}

function requireAccessAdminPermission_(permissionCode) {
  return requirePermission_(
    permissionCode,
    'ADMINISTRACION_ACCESOS',
    'ADMINISTRAR',
    ''
  );
}

// ============================================================
// CONSULTA PARA LA INTERFAZ DE ADMINISTRACIÓN
// ============================================================

function getAccessManagementData() {
  const context = getAuthContext_();

  const capabilities = {
    users: context.permissions.has('USUARIOS_ADMINISTRAR'),
    roles: context.permissions.has('ROLES_ADMINISTRAR'),
    permissions: context.permissions.has('PERMISOS_ADMINISTRAR'),
    audit: context.permissions.has('AUDITORIA_VER')
  };

  capabilities.assignments =
    capabilities.roles && capabilities.permissions;

  if (!Object.values(capabilities).some(Boolean)) {
    throw new Error(
      'No tienes permisos para administrar accesos ni consultar auditoría.'
    );
  }

  const { snapshot } = loadAccessAdminTables_();

  return {
    currentUser: {
      email: context.email,
      name: context.name,
      roleId: context.roleId,
      roleName: context.roleName
    },

    capabilities,

    users: capabilities.users
      ? snapshot.users.map(user => ({
          email: user.correo_institucional,
          name: user.nombre,
          state: user.estado,
          roleId: user.rol_id
        }))
      : [],

    roles: capabilities.users || capabilities.roles
      ? snapshot.roles.map(role => ({
          roleId: role.rol_id,
          name: role.nombre,
          description: role.descripcion,
          state: role.estado
        }))
      : [],

    permissions: capabilities.permissions
      ? snapshot.permissions.map(permission => ({
          permissionId: permission.permiso_id,
          code: permission.codigo,
          module: permission.modulo,
          operation: permission.operacion,
          description: permission.descripcion,
          state: permission.estado
        }))
      : [],

    rolePermissions: capabilities.assignments
      ? snapshot.rolePermissions.map(assignment => ({
          roleId: assignment.rol_id,
          permissionId: assignment.permiso_id,
          state: assignment.estado
        }))
      : []
  };
}

// ============================================================
// USUARIOS: CREAR Y EDITAR
// ============================================================

function saveAccessUser(payload) {
  const auth = requireAccessAdminPermission_(
    'USUARIOS_ADMINISTRAR'
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('No se recibieron los datos del usuario.');
  }

  const action = normalize_(payload.action).toLowerCase();

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del usuario no es válida.');
  }

  const email = normalize_(payload.email).toLowerCase();
  const name = normalize_(payload.name);
  const roleId = normalize_(payload.roleId);
  const state = normalize_(payload.state).toUpperCase();
  const originalEmail = normalize_(payload.originalEmail).toLowerCase();

  if (!/^[^\s@]+@sunarp\.gob\.pe$/i.test(email)) {
    throw new Error(
      'Ingresa un correo institucional válido del dominio sunarp.gob.pe.'
    );
  }

  if (!name) {
    throw new Error('Ingresa el nombre del usuario.');
  }

  if (!roleId) {
    throw new Error('Selecciona un rol.');
  }

  if (!['ACTIVO', 'INACTIVO'].includes(state)) {
    throw new Error('El estado del usuario no es válido.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const { tables, snapshot } = loadAccessAdminTables_();

    const activeRole = snapshot.roles.find(role =>
      role.rol_id === roleId &&
      isSecurityActive_(role.estado)
    );

    if (!activeRole) {
      throw new Error(
        'El rol seleccionado no existe o está inactivo.'
      );
    }

    const matches = tables.users.rows.filter(row =>
      row.record.correo_institucional.toLowerCase() ===
      (action === 'edit' ? originalEmail : email)
    );

    if (action === 'edit' && matches.length !== 1) {
      throw new Error(
        'No se encontró un único usuario para editar.'
      );
    }

    if (action === 'create' && matches.length > 0) {
      throw new Error(
        'Ya existe un usuario registrado con ese correo.'
      );
    }

    const duplicateEmail = snapshot.users.some(user =>
      user.correo_institucional.toLowerCase() === email &&
      (
        action !== 'edit' ||
        user.correo_institucional.toLowerCase() !== originalEmail
      )
    );

    if (duplicateEmail) {
      throw new Error('Ya existe un usuario con ese correo.');
    }

    const after = copyAccessSnapshot_(snapshot);

    if (action === 'edit') {
      const index = after.users.findIndex(user =>
        user.correo_institucional.toLowerCase() === originalEmail
      );

      after.users[index] = {
        correo_institucional: email,
        nombre: name,
        estado: state,
        rol_id: roleId
      };

    } else {
      after.users.push({
        correo_institucional: email,
        nombre: name,
        estado: state,
        rol_id: roleId
      });
    }

    validateAccessSnapshot_(after);
    assertAdministratorContinuity_(snapshot, after);

    const previousUser = action === 'edit'
      ? {
          email: matches[0].record.correo_institucional,
          name: matches[0].record.nombre,
          state: matches[0].record.estado,
          roleId: matches[0].record.rol_id
        }
      : null;

    return runAuditedMutation_(auth, {
      action: action === 'create' ? 'CREAR' : 'EDITAR',
      module: 'USUARIOS',
      entityType: 'USUARIO',
      recordId: action === 'edit' ? originalEmail : email,
      recordName: name,
      detail: 'Administración de cuenta institucional',
      before: previousUser
    }, () => {
      if (action === 'edit') {
        updateSecurityRow_(
          tables.users,
          matches[0].rowNumber,
          {
            correo_institucional: email,
            nombre: name,
            estado: state,
            rol_id: roleId
          }
        );
      } else {
        appendSecurityRow_(tables.users, {
          correo_institucional: email,
          nombre: name,
          estado: state,
          rol_id: roleId
        });
      }

      return {
        value: {
          message: action === 'create'
            ? 'Usuario registrado correctamente.'
            : 'Usuario actualizado correctamente.'
        },
        after: {
          email,
          name,
          state,
          roleId
        }
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// ROLES: CREAR Y EDITAR
// ============================================================

function saveAccessRole(payload) {
  const auth = requireAccessAdminPermission_(
    'ROLES_ADMINISTRAR'
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('No se recibieron los datos del rol.');
  }

  const action = normalize_(payload.action).toLowerCase();

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del rol no es válida.');
  }

  const roleId = normalize_(payload.roleId).toUpperCase();
  const originalRoleId = normalize_(
    payload.originalRoleId || payload.roleId
  ).toUpperCase();

  const name = normalize_(payload.name);
  const description = normalize_(payload.description);
  const state = normalize_(payload.state).toUpperCase();

  if (!/^[A-Z0-9_-]{2,50}$/.test(roleId)) {
    throw new Error(
      'El identificador del rol solo puede contener letras, números, guion y guion bajo.'
    );
  }

  if (!name) {
    throw new Error('Ingresa el nombre del rol.');
  }

  if (!['ACTIVO', 'INACTIVO'].includes(state)) {
    throw new Error('El estado del rol no es válido.');
  }

  if (action === 'edit' && roleId !== originalRoleId) {
    throw new Error(
      'No está permitido cambiar el identificador de un rol existente.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const { tables, snapshot } = loadAccessAdminTables_();

    const matches = tables.roles.rows.filter(row =>
      row.record.rol_id.toUpperCase() ===
      (action === 'edit' ? originalRoleId : roleId)
    );

    if (action === 'edit' && matches.length !== 1) {
      throw new Error('No se encontró un único rol para editar.');
    }

    if (action === 'create' && matches.length > 0) {
      throw new Error('Ya existe un rol con ese identificador.');
    }

    const duplicateName = snapshot.roles.some(role =>
      catalogKey_(role.nombre) === catalogKey_(name) &&
      role.rol_id !== originalRoleId
    );

    if (duplicateName) {
      throw new Error('Ya existe un rol con ese nombre.');
    }

    if (
      action === 'edit' &&
      state === 'INACTIVO' &&
      snapshot.users.some(user =>
        user.rol_id === originalRoleId &&
        isSecurityActive_(user.estado)
      )
    ) {
      throw new Error(
        'No se puede desactivar un rol asignado a usuarios activos. ' +
        'Reasigna esos usuarios antes de desactivarlo.'
      );
    }

    const after = copyAccessSnapshot_(snapshot);

    if (action === 'edit') {
      const index = after.roles.findIndex(role =>
        role.rol_id === originalRoleId
      );

      after.roles[index] = {
        rol_id: originalRoleId,
        nombre: name,
        descripcion: description,
        estado: state
      };

    } else {
      after.roles.push({
        rol_id: roleId,
        nombre: name,
        descripcion: description,
        estado: state
      });
    }

    validateAccessSnapshot_(after);
    assertAdministratorContinuity_(snapshot, after);

    const previousRole = action === 'edit'
      ? {
          roleId: matches[0].record.rol_id,
          name: matches[0].record.nombre,
          description: matches[0].record.descripcion,
          state: matches[0].record.estado
        }
      : null;

    return runAuditedMutation_(auth, {
      action: action === 'create' ? 'CREAR' : 'EDITAR',
      module: 'ROLES',
      entityType: 'ROL',
      recordId: roleId,
      recordName: name,
      detail: 'Administración de rol',
      before: previousRole
    }, () => {
      if (action === 'edit') {
        updateSecurityRow_(
          tables.roles,
          matches[0].rowNumber,
          {
            nombre: name,
            descripcion: description,
            estado: state
          }
        );
      } else {
        appendSecurityRow_(tables.roles, {
          rol_id: roleId,
          nombre: name,
          descripcion: description,
          estado: state
        });
      }

      return {
        value: {
          message: action === 'create'
            ? 'Rol creado correctamente.'
            : 'Rol actualizado correctamente.'
        },
        after: {
          roleId,
          name,
          description,
          state
        }
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// PERMISOS: CREAR Y EDITAR
// ============================================================

function saveAccessPermission(payload) {
  const auth = requireAccessAdminPermission_(
    'PERMISOS_ADMINISTRAR'
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('No se recibieron los datos del permiso.');
  }

  const action = normalize_(payload.action).toLowerCase();

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del permiso no es válida.');
  }

  const originalPermissionId = normalize_(
    payload.originalPermissionId
  );

  const code = normalize_(payload.code).toUpperCase();
  const moduleName = normalize_(payload.module).toUpperCase();
  const operation = normalize_(payload.operation).toUpperCase();
  const description = normalize_(payload.description);
  const state = normalize_(payload.state).toUpperCase();

  if (!['ACTIVO', 'INACTIVO'].includes(state)) {
    throw new Error('El estado del permiso no es válido.');
  }

  if (!moduleName || !operation || !description) {
    throw new Error(
      'Completa el módulo, la operación y la descripción.'
    );
  }

  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/.test(code)
  ) {
    throw new Error(
      'El código debe usar letras mayúsculas, números y guion bajo.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const { tables, snapshot } = loadAccessAdminTables_();

    const matches = action === 'edit'
      ? tables.permissions.rows.filter(row =>
          row.record.permiso_id === originalPermissionId
        )
      : [];

    if (action === 'edit' && matches.length !== 1) {
      throw new Error('No se encontró un único permiso para editar.');
    }

    const existing = action === 'edit'
      ? matches[0].record
      : null;

    // Los códigos están referenciados por la lógica de autorización.
    // No se permite cambiarlos después de crear el permiso.
    const finalCode = existing
      ? existing.codigo.toUpperCase()
      : code;

    if (existing && code !== finalCode) {
      throw new Error(
        'No se puede cambiar el código de un permiso existente.'
      );
    }

    if (
      action === 'create' &&
      snapshot.permissions.some(permission =>
        permission.codigo.toUpperCase() === finalCode
      )
    ) {
      throw new Error('Ya existe un permiso con ese código.');
    }

    const permissionId = existing
      ? existing.permiso_id
      : 'PERM_' +
        Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();

    const after = copyAccessSnapshot_(snapshot);

    if (action === 'edit') {
      const index = after.permissions.findIndex(permission =>
        permission.permiso_id === originalPermissionId
      );

      after.permissions[index] = {
        permiso_id: permissionId,
        codigo: finalCode,
        modulo: moduleName,
        operacion: operation,
        descripcion: description,
        estado: state
      };

    } else {
      after.permissions.push({
        permiso_id: permissionId,
        codigo: finalCode,
        modulo: moduleName,
        operacion: operation,
        descripcion: description,
        estado: state
      });
    }

    validateAccessSnapshot_(after);
    assertAdministratorContinuity_(snapshot, after);

    const previousPermission = action === 'edit'
      ? {
          permissionId: matches[0].record.permiso_id,
          code: matches[0].record.codigo,
          module: matches[0].record.modulo,
          operation: matches[0].record.operacion,
          description: matches[0].record.descripcion,
          state: matches[0].record.estado
        }
      : null;

    return runAuditedMutation_(auth, {
      action: action === 'create' ? 'CREAR' : 'EDITAR',
      module: 'PERMISOS',
      entityType: 'PERMISO',
      recordId: permissionId,
      recordName: finalCode,
      detail: 'Administración de permiso',
      before: previousPermission
    }, () => {
      if (action === 'edit') {
        updateSecurityRow_(
          tables.permissions,
          matches[0].rowNumber,
          {
            modulo: moduleName,
            operacion: operation,
            descripcion: description,
            estado: state
          }
        );
      } else {
        appendSecurityRow_(tables.permissions, {
          permiso_id: permissionId,
          codigo: finalCode,
          modulo: moduleName,
          operacion: operation,
          descripcion: description,
          estado: state
        });
      }

      return {
        value: {
          message: action === 'create'
            ? 'Permiso creado correctamente.'
            : 'Permiso actualizado correctamente.'
        },
        after: {
          permissionId,
          code: finalCode,
          module: moduleName,
          operation,
          description,
          state
        }
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// ASIGNACIONES DE PERMISOS A ROLES
// ============================================================

function saveRolePermissions(payload) {
  const rolesAuth = requireAccessAdminPermission_(
    'ROLES_ADMINISTRAR'
  );

  const auth = requireAccessAdminPermission_(
    'PERMISOS_ADMINISTRAR'
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('No se recibieron las asignaciones.');
  }

  const roleId = normalize_(payload.roleId);

  if (
    !Array.isArray(payload.permissionIds) ||
    !roleId
  ) {
    throw new Error(
      'Selecciona un rol y envía una lista válida de permisos.'
    );
  }

  const selectedIds = payload.permissionIds.map(normalize_);

  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('La selección contiene permisos duplicados.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const { tables, snapshot } = loadAccessAdminTables_();

    const role = snapshot.roles.find(item =>
      item.rol_id === roleId &&
      isSecurityActive_(item.estado)
    );

    if (!role) {
      throw new Error('El rol no existe o está inactivo.');
    }

    const activePermissionIds = new Set(
      snapshot.permissions
        .filter(permission => isSecurityActive_(permission.estado))
        .map(permission => permission.permiso_id)
    );

    selectedIds.forEach(permissionId => {
      if (!activePermissionIds.has(permissionId)) {
        throw new Error(
          'No puedes asignar permisos que no existan o estén inactivos.'
        );
      }
    });

    const previousAssignments = snapshot.rolePermissions
      .filter(item => item.rol_id === roleId)
      .map(item => ({
        permissionId: item.permiso_id,
        state: item.estado
      }));

    const after = copyAccessSnapshot_(snapshot);
    const selectedSet = new Set(selectedIds);

    const existingPairs = new Set();

    after.rolePermissions.forEach(assignment => {
      if (assignment.rol_id !== roleId) {
        return;
      }

      existingPairs.add(assignment.permiso_id);

      assignment.estado = selectedSet.has(assignment.permiso_id)
        ? 'ACTIVO'
        : 'INACTIVO';
    });

    selectedIds.forEach(permissionId => {
      if (!existingPairs.has(permissionId)) {
        after.rolePermissions.push({
          rol_id: roleId,
          permiso_id: permissionId,
          estado: 'ACTIVO'
        });
      }
    });

    validateAccessSnapshot_(after);
    assertAdministratorContinuity_(snapshot, after);

    return runAuditedMutation_(auth, {
      action: 'ACTUALIZAR_ASIGNACIONES',
      module: 'ROL_PERMISO',
      entityType: 'ROL_PERMISO',
      recordId: roleId,
      recordName: role.nombre,
      detail: 'Actualización de permisos asignados al rol',
      before: previousAssignments
    }, () => {
      const existingPairs = new Set();

      tables.rolePermissions.rows.forEach(row => {
        if (row.record.rol_id !== roleId) {
          return;
        }

        existingPairs.add(row.record.permiso_id);

        const desiredState = selectedSet.has(row.record.permiso_id)
          ? 'ACTIVO'
          : 'INACTIVO';

        if (row.record.estado !== desiredState) {
          updateSecurityRow_(
            tables.rolePermissions,
            row.rowNumber,
            { estado: desiredState }
          );
        }
      });

      selectedIds.forEach(permissionId => {
        if (!existingPairs.has(permissionId)) {
          appendSecurityRow_(tables.rolePermissions, {
            rol_id: roleId,
            permiso_id: permissionId,
            estado: 'ACTIVO'
          });
        }
      });

      return {
        value: {
          message: 'Permisos del rol actualizados correctamente.'
        },
        after: selectedIds.map(permissionId => ({
          permissionId,
          state: 'ACTIVO'
        }))
      };
    });

    return {
      message: 'Permisos del rol actualizados correctamente.'
    };

  } finally {
    lock.releaseLock();
  }
}