/**
 * SUNARP Core — pruebas de autorización.
 * Ejecutar runAuthorizationSelfTests_() desde el editor de Core.
 * No crea ni modifica hojas de cálculo.
 */
function runAuthorizationSelfTests_() {
  const results = [];

  function assert(condition, label) {
    if (!condition) {
      throw new Error('PRUEBA FALLIDA: ' + label);
    }

    results.push('OK: ' + label);
  }

  const modules = [
    {
      modulo_id: 'MOD_INFO_PERSONAL',
      codigo: 'INFORMACION_PERSONAL',
      active: true
    },
    {
      modulo_id: 'MOD_ACCESOS',
      codigo: 'ACCESOS',
      active: true
    },
    {
      modulo_id: 'MOD_DOCUMENTOS',
      codigo: 'DOCUMENTOS_NORMATIVOS',
      active: true
    },
    {
      modulo_id: 'MOD_LOCAL',
      codigo: 'MODULO_LOCAL',
      active: true
    },
    {
      modulo_id: 'MOD_INACTIVO',
      codigo: 'MODULO_INACTIVO',
      active: false
    }
  ];

  const roles = [
    { rol_id: 'ROL_EDITOR', nombre: 'Editor', active: true },
    { rol_id: 'ROL_ADMIN', nombre: 'Administrador', active: true },
    { rol_id: 'ROL_CONSULTA', nombre: 'Consulta', active: true },
    { rol_id: 'ROL_INACTIVO', nombre: 'Inactivo', active: false }
  ];

  const permissions = [
    {
      permiso_id: 'PERM_001',
      codigo: 'INFORMACION_PERSONAL_VER',
      modulo_id: 'MOD_INFO_PERSONAL',
      active: true
    },
    {
      permiso_id: 'PERM_002',
      codigo: 'INFORMACION_PERSONAL_EDITAR',
      modulo_id: 'MOD_INFO_PERSONAL',
      active: false
    },
    {
      permiso_id: 'PERM_003',
      codigo: 'USUARIOS_ADMINISTRAR',
      modulo_id: 'MOD_ACCESOS',
      active: true
    },
    {
      permiso_id: 'PERM_004',
      codigo: 'INFORMACION_PERSONAL_ELIMINAR',
      modulo_id: 'MOD_INFO_PERSONAL',
      active: true
    },
    {
      permiso_id: 'PERM_005',
      codigo: 'DOCUMENTOS_NORMATIVOS_VER',
      modulo_id: 'MOD_DOCUMENTOS',
      active: true
    },
    {
      permiso_id: 'PERM_006',
      codigo: 'MODULO_LOCAL_VER',
      modulo_id: 'MOD_LOCAL',
      active: true
    },
    {
      permiso_id: 'PERM_007',
      codigo: 'ACCESOS_ROLES_ADMINISTRAR',
      modulo_id: 'MOD_ACCESOS',
      active: true
    }
  ];

  const baseData = {
    personaId: 'PER_117',
    email: 'prueba@sunarp.gob.pe',
    users: [
      {
        persona_id: 'PER_117',
        active: true
      }
    ],
    modules,
    roles,
    userRoles: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        rol_id: 'ROL_EDITOR',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_ACCESOS',
        rol_id: 'ROL_ADMIN',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_DOCUMENTOS',
        rol_id: 'ROL_CONSULTA',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_LOCAL',
        rol_id: 'ROL_EDITOR',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INACTIVO',
        rol_id: 'ROL_ADMIN',
        active: true
      }
    ],
    permissions,
    rolePermissions: [
      {
        rol_id: 'ROL_EDITOR',
        permiso_id: 'PERM_001',
        active: true
      },
      {
        rol_id: 'ROL_EDITOR',
        permiso_id: 'PERM_002',
        active: true
      },
      {
        rol_id: 'ROL_ADMIN',
        permiso_id: 'PERM_003',
        active: true
      },
      {
        rol_id: 'ROL_ADMIN',
        permiso_id: 'PERM_004',
        active: true
      },
      {
        rol_id: 'ROL_CONSULTA',
        permiso_id: 'PERM_005',
        active: true
      },
      {
        rol_id: 'ROL_EDITOR',
        permiso_id: 'PERM_006',
        active: true
      },
      {
        rol_id: 'ROL_EDITOR',
        permiso_id: 'PERM_007',
        active: true
      }
    ],
    scopes: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito: 'ESTRUCTURA_ORG',
        referencia_id: 'SC_OFICINA_ADMINISTRACION',
        incluir_descendientes: true,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_ACCESOS',
        tipo_ambito: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_DOCUMENTOS',
        tipo_ambito: 'SEDE',
        referencia_id: 'SEDE_CENTRAL',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_LOCAL',
        tipo_ambito: 'LOCAL',
        referencia_id: 'LOCAL_001',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INACTIVO',
        tipo_ambito: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: false,
        active: true
      }
    ]
  };

  const context = resolveAuthorizationContext(baseData);

  const structures = [
    {
      id: 'SC_OFICINA_ADMINISTRACION',
      parent_id: '',
      sede_id: 'SEDE_CENTRAL'
    },
    {
      id: 'SC_UNIDAD_TESORERIA',
      parent_id: 'SC_OFICINA_ADMINISTRACION',
      sede_id: 'SEDE_CENTRAL'
    },
    {
      id: 'SC_AREA_CONTABILIDAD',
      parent_id: 'SC_UNIDAD_TESORERIA',
      sede_id: 'SEDE_CENTRAL'
    },
    {
      id: 'SC_OTRA_UNIDAD',
      parent_id: '',
      sede_id: 'SEDE_CENTRAL'
    },
    {
      id: 'ZR_I_UNIDAD',
      parent_id: '',
      sede_id: 'ZR_I'
    }
  ];

  assert(
    context.authenticated && context.personaId === 'PER_117',
    'Identifica a la persona mediante persona_id y usuario activo.'
  );

  assert(
    context.roleAssignments.length === 4,
    'Resuelve roles diferentes por módulo e ignora el módulo inactivo.'
  );

  assert(
    authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_VER',
      'MOD_INFO_PERSONAL'
    ),
    'Reconoce el permiso activo del rol asignado en Información de personal.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_EDITAR',
      'MOD_INFO_PERSONAL'
    ),
    'Ignora permisos inactivos aunque RolPermiso esté activo.'
  );

  assert(
    authorizationHasPermission(
      context,
      'USUARIOS_ADMINISTRAR',
      'MOD_ACCESOS'
    ),
    'Reconoce el permiso del rol asignado en Accesos.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'USUARIOS_ADMINISTRAR',
      'MOD_INFO_PERSONAL'
    ),
    'No traslada permisos de Accesos a Información de personal.'
  );

  assert(
    !authorizationHasPermission(context, 'USUARIOS_ADMINISTRAR'),
    'Exige indicar el módulo al comprobar permisos en el nuevo modelo.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'ACCESOS_ROLES_ADMINISTRAR',
      'MOD_ACCESOS'
    ),
    'No concede en Accesos un permiso asignado a un rol de otro módulo.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_ELIMINAR',
      'MOD_INFO_PERSONAL'
    ),
    'No hereda el rol ROL_ADMIN de Accesos en otro módulo.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_AREA_CONTABILIDAD' },
      structures
    ),
    'Incluye descendientes de una estructura cuando incluir_descendientes es TRUE.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'Rechaza estructuras ajenas al ámbito orgánico.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { sede_id: 'SEDE_DISTINTA' },
      structures
    ),
    'El ámbito TOTAL de otro módulo no amplía el ámbito del módulo actual.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'INFORMACION_PERSONAL',
      { estructura_id: 'SC_UNIDAD_TESORERIA' },
      structures
    ),
    'Acepta el código del módulo además de su modulo_id.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_ACCESOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'Interpreta TOTAL como acceso a todos los registros de su propio módulo.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INEXISTENTE',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'No aplica un ámbito a un módulo inexistente.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      {
        estructura_id: 'SC_UNIDAD_TESORERIA',
        sede_id: 'ZR_I'
      },
      structures
    ),
    'Deriva la sede desde el catálogo orgánico y no desde la sede enviada en el registro.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'SC_OTRA_UNIDAD', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'El ámbito SEDE incluye distintas estructuras orgánicas de la misma sede.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'El ámbito SEDE rechaza estructuras pertenecientes a otra sede.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_LOCAL',
      { local_id: 'LOCAL_001' },
      structures
    ),
    'Permite el ámbito LOCAL para una asignación directamente vinculada al local.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_LOCAL',
      { local_id: 'LOCAL_002' },
      structures
    ),
    'Rechaza un local distinto del asignado.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_LOCAL',
      {
        local_id: 'LOCAL_001',
        estructura_id: 'SC_OFICINA_ADMINISTRACION'
      },
      structures
    ),
    'Rechaza LOCAL cuando el registro también pertenece a una estructura orgánica.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { local_id: 'LOCAL_001' },
      structures
    ),
    'No reutiliza el ámbito LOCAL en otro módulo.'
  );

  const inactiveUserContext = resolveAuthorizationContext({
    personaId: 'PER_INACTIVA',
    users: [{ persona_id: 'PER_INACTIVA', active: false }],
    modules,
    roles,
    userRoles: [],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  assert(
    !inactiveUserContext.authenticated,
    'Rechaza usuarios con active FALSE.'
  );

  const inactiveRoleContext = resolveAuthorizationContext({
    personaId: 'PER_117',
    users: [{ persona_id: 'PER_117', active: true }],
    modules: [modules[0]],
    roles,
    userRoles: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_INFO_PERSONAL',
      rol_id: 'ROL_INACTIVO',
      active: true
    }],
    permissions,
    rolePermissions: [{
      rol_id: 'ROL_INACTIVO',
      permiso_id: 'PERM_001',
      active: true
    }],
    scopes: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_INFO_PERSONAL',
      tipo_ambito: 'TOTAL',
      active: true
    }]
  });

  assert(
    inactiveRoleContext.authenticated &&
    inactiveRoleContext.roleAssignments.length === 0 &&
    !authorizationHasPermission(
      inactiveRoleContext,
      'INFORMACION_PERSONAL_VER',
      'MOD_INFO_PERSONAL'
    ) &&
    !authorizationIsRecordInScope(
      inactiveRoleContext,
      'MOD_INFO_PERSONAL',
      {},
      structures
    ),
    'Ignora roles inactivos y sus permisos y ámbitos.'
  );

  const duplicateAssignmentContext = resolveAuthorizationContext({
    personaId: 'PER_117',
    users: [{ persona_id: 'PER_117', active: true }],
    modules: [modules[0]],
    roles: [roles[0]],
    userRoles: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        rol_id: 'ROL_EDITOR',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        rol_id: 'ROL_ADMIN',
        active: true
      }
    ],
    permissions,
    rolePermissions: [{
      rol_id: 'ROL_EDITOR',
      permiso_id: 'PERM_001',
      active: true
    }],
    scopes: []
  });

  assert(
    duplicateAssignmentContext.roleAssignments.length === 0,
    'Evita combinar roles cuando hay más de una asignación activa en un módulo.'
  );

  // Compatibilidad con el esquema anterior basado en correo, rol_id y estado.
  const legacyContext = resolveAuthorizationContext({
    email: 'legado@sunarp.gob.pe',
    users: [{
      correo_institucional: 'legado@sunarp.gob.pe',
      estado: 'ACTIVO',
      rol_id: 'ROL_LEGADO'
    }],
    roles: [{
      rol_id: 'ROL_LEGADO',
      estado: 'ACTIVO'
    }],
    permissions: [{
      permiso_id: 'PERM_LEGADO',
      codigo: 'DIRECTORIOS_VER',
      estado: 'ACTIVO'
    }],
    rolePermissions: [{
      rol_id: 'ROL_LEGADO',
      permiso_id: 'PERM_LEGADO',
      estado: 'ACTIVO'
    }],
    scopes: [{
      correo_institucional: 'legado@sunarp.gob.pe',
      modulo: 'DIRECTORIOS',
      tipo_ambito: 'TOTAL',
      referencia_id: '',
      estado: 'ACTIVO'
    }]
  });

  assert(
    legacyContext.authenticated &&
    authorizationHasPermission(legacyContext, 'DIRECTORIOS_VER'),
    'Mantiene compatibilidad con usuarios, roles y permisos del esquema anterior.'
  );

  assert(
    authorizationIsRecordInScope(
      legacyContext,
      'DIRECTORIOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'Mantiene compatibilidad con ámbitos textuales del esquema anterior.'
  );

  const legacyBooleanContext = resolveAuthorizationContext({
    email: 'booleano@sunarp.gob.pe',
    users: [{
      correo_institucional: 'booleano@sunarp.gob.pe',
      active: true,
      estado: 'INACTIVO',
      rol_id: 'ROL_BOOLEANO'
    }],
    roles: [{
      rol_id: 'ROL_BOOLEANO',
      active: true
    }],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  assert(
    legacyBooleanContext.authenticated,
    'Da prioridad al campo active cuando coexiste con el antiguo estado.'
  );

  console.log(results.join('\n'));

  return {
    success: true,
    total: results.length,
    results
  };
}
