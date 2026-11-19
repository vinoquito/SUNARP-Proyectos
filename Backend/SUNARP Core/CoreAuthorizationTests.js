/**
 * SUNARP Core — pruebas del contrato único de autorización.
 *
 * Ejecutar runAuthorizationSelfTests_() desde el editor de SUNARP Core.
 * Las pruebas son unitarias: no leen ni modifican hojas de cálculo.
 */
function runAuthorizationSelfTests_() {
  const results = [];

  function assert(condition, label) {
    if (!condition) {
      throw new Error('PRUEBA FALLIDA: ' + label);
    }

    results.push('OK: ' + label);
  }

  function assertThrows(callback, expectedText, label) {
    let thrown = null;

    try {
      callback();
    } catch (error) {
      thrown = error;
    }

    assert(
      Boolean(thrown) &&
      (!expectedText || thrown.message.includes(expectedText)),
      label
    );
  }

  const modules = [
    {
      modulo_id: 'MOD_INFO_PERSONAL',
      codigo: 'INFORMACION_PERSONAL',
      nombre: 'Información de personal',
      active: true
    },
    {
      modulo_id: 'MOD_ACCESOS',
      codigo: 'ACCESOS',
      nombre: 'Administración de accesos',
      active: true
    },
    {
      modulo_id: 'MOD_DOCUMENTOS',
      codigo: 'DOCUMENTOS_NORMATIVOS',
      nombre: 'Documentos normativos',
      active: true
    },
    {
      modulo_id: 'MOD_LOCAL',
      codigo: 'MODULO_LOCAL',
      nombre: 'Módulo de prueba local',
      active: true
    },
    {
      modulo_id: 'MOD_INACTIVO',
      codigo: 'MODULO_INACTIVO',
      nombre: 'Módulo inactivo',
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
      codigo: 'PERMISO_INACTIVO',
      modulo_id: 'MOD_INFO_PERSONAL',
      active: true
    }
  ];

  const locals = [
    { id: 'LOCAL_001', sede_id: 'SEDE_CENTRAL' },
    { id: 'LOCAL_002', sede_id: 'ZR_I' },
    { id: 'LOCAL_INACTIVO', sede_id: 'SEDE_CENTRAL', active: false }
  ];

  const baseData = {
    personaId: 'PER_117',
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
        permiso_id: 'PERM_003',
        active: true
      },
      {
        rol_id: 'ROL_EDITOR',
        permiso_id: 'PERM_007',
        active: false
      }
    ],
    scopes: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito_id: 'ESTRUCTURA_ORG',
        referencia_id: 'SC_OFICINA_ADMINISTRACION',
        incluir_descendientes: true,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_ACCESOS',
        tipo_ambito_id: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_DOCUMENTOS',
        tipo_ambito_id: 'SEDE',
        referencia_id: 'SEDE_CENTRAL',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_LOCAL',
        tipo_ambito_id: 'LOCAL',
        referencia_id: 'LOCAL_001',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INACTIVO',
        tipo_ambito_id: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: false,
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito_id: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: false,
        active: false
      },
      {
        persona_id: 'PER_OTRA',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito_id: 'TOTAL',
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
    },
    {
      id: 'SC_ESTRUCTURA_INACTIVA',
      parent_id: '',
      sede_id: 'SEDE_CENTRAL',
      active: false
    }
  ];

  assert(
    context.authenticated && context.personaId === 'PER_117',
    'Identifica a la persona mediante persona_id y usuario activo.'
  );

  assert(
    context.moduleAccess.length === 4,
    'Resuelve únicamente módulos activos con rol activo asignado.'
  );

  assert(
    context.moduleAccess.every(item =>
      item.modulo_id && item.role && item.module
    ),
    'Cada acceso modular contiene su módulo y su rol resueltos.'
  );

  assert(
    authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_VER',
      'MOD_INFO_PERSONAL'
    ),
    'Reconoce un permiso activo asignado al rol del módulo.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_EDITAR',
      'MOD_INFO_PERSONAL'
    ),
    'Ignora un permiso inactivo aunque su relación rol-permiso esté activa.'
  );

  assert(
    authorizationHasPermission(
      context,
      'MODULO_LOCAL_VER',
      'MOD_LOCAL'
    ) &&
    !authorizationHasPermission(
      context,
      'MODULO_LOCAL_VER',
      'MOD_INFO_PERSONAL'
    ),
    'Aplica los permisos de un mismo rol por separado en cada módulo asignado.'
  );

  assert(
    authorizationHasPermission(
      context,
      'USUARIOS_ADMINISTRAR',
      'MOD_ACCESOS'
    ),
    'Reconoce el permiso administrativo en el módulo al que pertenece.'
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
    !authorizationHasPermission(
      context,
      'INFORMACION_PERSONAL_ELIMINAR',
      'MOD_ACCESOS'
    ),
    'No traslada permisos de Información de personal a Accesos.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'USUARIOS_ADMINISTRAR',
      'ACCESOS'
    ),
    'Exige modulo_id y no acepta el código del módulo como sustituto.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'USUARIOS_ADMINISTRAR'
    ),
    'Exige indicar el módulo en toda comprobación de permisos.'
  );

  assert(
    !authorizationHasPermission(
      context,
      'PERMISO_INACTIVO',
      'MOD_INFO_PERSONAL'
    ),
    'Ignora una relación RolPermiso inactiva.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_AREA_CONTABILIDAD' },
      structures
    ),
    'Incluye descendientes cuando incluir_descendientes es TRUE.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'Rechaza estructuras fuera del ámbito orgánico asignado.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { sede_id: 'ZR_I' },
      structures
    ),
    'No hereda los ámbitos de otra persona.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_UNIDAD_TESORERIA' },
      structures
    ),
    'Acepta el ámbito de la estructura de referencia y sus descendientes.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'No reutiliza el ámbito orgánico de otro módulo.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_ACCESOS',
      { estructura_id: 'ZR_I_UNIDAD' },
      structures
    ),
    'Interpreta TOTAL como acceso a todos los registros de su propio módulo.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'SC_UNIDAD_TESORERIA', sede_id: 'ZR_I' },
      structures
    ),
    'Deriva la sede desde la estructura del catálogo y no desde el registro.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'SC_OTRA_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'El ámbito SEDE incluye distintas estructuras orgánicas de la misma sede.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'El ámbito SEDE rechaza estructuras de otra sede.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { local_id: 'LOCAL_001', sede_id: 'ZR_I' },
      structures,
      undefined,
      locals
    ),
    'Deriva la sede de un registro local desde el catálogo de locales.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { local_id: 'LOCAL_002', sede_id: 'SEDE_CENTRAL' },
      structures,
      undefined,
      locals
    ),
    'Rechaza un registro local de otra sede aunque indique una sede permitida.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { local_id: 'LOCAL_DESCONOCIDO', sede_id: 'SEDE_CENTRAL' },
      structures,
      undefined,
      locals
    ),
    'Rechaza local_id que no existe en el catálogo.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { local_id: 'LOCAL_INACTIVO', sede_id: 'SEDE_CENTRAL' },
      structures,
      undefined,
      locals
    ),
    'Rechaza locales inactivos aunque pertenezcan a la sede permitida.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_ESTRUCTURA_INACTIVA' },
      structures
    ),
    'Rechaza estructuras orgánicas inactivas.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { local_id: 'LOCAL_001', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'Falla de forma segura cuando no recibe el catálogo necesario para validar local_id.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_DOCUMENTOS',
      { estructura_id: 'ESTRUCTURA_DESCONOCIDA', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'Rechaza estructuras desconocidas sin confiar en la sede del registro.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'MOD_LOCAL',
      { local_id: 'LOCAL_001' },
      structures,
      undefined,
      locals
    ),
    'Permite LOCAL para una asignación vinculada directamente al local.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_LOCAL',
      { local_id: 'LOCAL_002' },
      structures,
      undefined,
      locals
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
      structures,
      undefined,
      locals
    ),
    'Rechaza LOCAL si el registro también pertenece a una estructura orgánica.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_INFO_PERSONAL',
      { local_id: 'LOCAL_001' },
      structures,
      undefined,
      locals
    ),
    'No transfiere el ámbito LOCAL a Información de personal.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'MOD_NO_EXISTE',
      { estructura_id: 'ZR_I_UNIDAD' },
      structures
    ),
    'Rechaza consultas de ámbito para un módulo no asignado.'
  );

  const noIdentityContext = resolveAuthorizationContext({
    email: 'persona@sunarp.gob.pe',
    users: [{
      correo_institucional: 'persona@sunarp.gob.pe',
      estado: 'ACTIVO',
      rol_id: 'ROL_ADMIN'
    }]
  });

  assert(
    !noIdentityContext.authenticated,
    'No utiliza correo, estado ni rol_id en Usuarios como identidad alternativa.'
  );

  const noActiveUserContext = resolveAuthorizationContext({
    personaId: 'PER_INACTIVA',
    users: [{
      persona_id: 'PER_INACTIVA',
      active: false
    }],
    modules,
    roles,
    userRoles: [],
    permissions,
    rolePermissions: [],
    scopes: []
  });

  assert(
    !noActiveUserContext.authenticated,
    'Rechaza usuarios con active FALSE.'
  );

  const stateOnlyUserContext = resolveAuthorizationContext({
    personaId: 'PER_ESTADO',
    users: [{
      persona_id: 'PER_ESTADO',
      estado: 'ACTIVO'
    }],
    modules,
    roles,
    userRoles: [],
    permissions,
    rolePermissions: [],
    scopes: []
  });

  assert(
    !stateOnlyUserContext.authenticated,
    'No interpreta estado ACTIVO como sustituto de active TRUE.'
  );

  const stringTrueContext = resolveAuthorizationContext({
    personaId: 'PER_STRING_TRUE',
    users: [{ persona_id: 'PER_STRING_TRUE', active: 'TRUE' }],
    modules: [],
    roles: [],
    userRoles: [],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  const numericActiveContext = resolveAuthorizationContext({
    personaId: 'PER_NUMERIC',
    users: [{ persona_id: 'PER_NUMERIC', active: 1 }],
    modules: [],
    roles: [],
    userRoles: [],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  assert(
    stringTrueContext.authenticated &&
    !numericActiveContext.authenticated,
    'Interpreta TRUE/FALSE como booleano y rechaza valores numéricos.'
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
      tipo_ambito_id: 'TOTAL',
      active: true
    }]
  });

  assert(
    inactiveRoleContext.authenticated &&
    inactiveRoleContext.moduleAccess.length === 0 &&
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
    'No concede acceso mediante roles inactivos.'
  );

  assertThrows(
    function () {
      resolveAuthorizationContext({
        personaId: 'PER_117',
        users: [{ persona_id: 'PER_117', active: true }],
        modules: [modules[0]],
        roles: [roles[0], roles[1]],
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
        ]
      });
    },
    'más de un rol activo',
    'Detecta más de un rol activo de la misma persona en un módulo.'
  );

  assertThrows(
    function () {
      resolveAuthorizationContext({
        personaId: 'PER_117',
        users: [
          { persona_id: 'PER_117', active: true },
          { persona_id: 'PER_117', active: true }
        ],
        modules,
        roles,
        userRoles: [],
        permissions: [],
        rolePermissions: [],
        scopes: []
      });
    },
    'más de un usuario activo',
    'Detecta identidades duplicadas activas.'
  );

  assertThrows(
    function () {
      resolveAuthorizationContext({
        personaId: 'PER_117',
        users: [{ persona_id: 'PER_117', active: true }],
        modules: [
          { modulo_id: 'MOD_DUP', active: true },
          { modulo_id: 'MOD_DUP', active: true }
        ],
        roles: [],
        userRoles: [],
        permissions: [],
        rolePermissions: [],
        scopes: []
      });
    },
    'duplicado en Modulos.modulo_id',
    'Detecta identificadores de módulo duplicados activos.'
  );

  assertThrows(
    function () {
      resolveAuthorizationContext({
        personaId: 'PER_117',
        users: [{ persona_id: 'PER_117', active: true }],
        modules,
        roles,
        userRoles: [{
          persona_id: 'PER_117',
          modulo_id: 'MOD_INFO_PERSONAL',
          rol_id: 'ROL_EDITOR',
          active: true
        }],
        permissions: [
          {
            permiso_id: 'PERM_A',
            codigo: 'DUPLICADO',
            modulo_id: 'MOD_INFO_PERSONAL',
            active: true
          },
          {
            permiso_id: 'PERM_B',
            codigo: 'DUPLICADO',
            modulo_id: 'MOD_ACCESOS',
            active: true
          }
        ],
        rolePermissions: [],
        scopes: []
      });
    },
    'código activo duplicado',
    'Detecta códigos de permiso duplicados activos.'
  );

  assertThrows(
    function () {
      resolveAuthorizationContext({
        personaId: 'PER_117',
        users: [{ persona_id: 'PER_117', active: true }],
        modules,
        roles,
        userRoles: [],
        permissions,
        rolePermissions: [
          {
            rol_id: 'ROL_EDITOR',
            permiso_id: 'PERM_001',
            active: true
          },
          {
            rol_id: 'ROL_EDITOR',
            permiso_id: 'PERM_001',
            active: true
          }
        ],
        scopes: []
      });
    },
    'relación activa duplicada en RolPermiso',
    'Detecta relaciones RolPermiso activas duplicadas.'
  );

  const noDescendantContext = resolveAuthorizationContext({
    personaId: 'PER_NO_DESC',
    users: [{ persona_id: 'PER_NO_DESC', active: true }],
    modules: [modules[0]],
    roles: [roles[0]],
    userRoles: [{
      persona_id: 'PER_NO_DESC',
      modulo_id: 'MOD_INFO_PERSONAL',
      rol_id: 'ROL_EDITOR',
      active: true
    }],
    permissions: [],
    rolePermissions: [],
    scopes: [{
      persona_id: 'PER_NO_DESC',
      modulo_id: 'MOD_INFO_PERSONAL',
      tipo_ambito_id: 'ESTRUCTURA_ORG',
      referencia_id: 'SC_OFICINA_ADMINISTRACION',
      incluir_descendientes: false,
      active: true
    }]
  });

  assert(
    authorizationIsRecordInScope(
      noDescendantContext,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_OFICINA_ADMINISTRACION' },
      structures
    ) &&
    !authorizationIsRecordInScope(
      noDescendantContext,
      'MOD_INFO_PERSONAL',
      { estructura_id: 'SC_UNIDAD_TESORERIA' },
      structures
    ),
    'Respeta incluir_descendientes FALSE y permite solo la estructura exacta.'
  );

  const customFieldContext = resolveAuthorizationContext({
    personaId: 'PER_117',
    users: [{ persona_id: 'PER_117', active: true }],
    modules: [{
      modulo_id: 'MOD_CUSTOM',
      codigo: 'CUSTOM',
      active: true
    }],
    roles: [{ rol_id: 'ROL_CUSTOM', active: true }],
    userRoles: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_CUSTOM',
      rol_id: 'ROL_CUSTOM',
      active: true
    }],
    permissions: [],
    rolePermissions: [],
    scopes: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_CUSTOM',
      tipo_ambito_id: 'ESTRUCTURA_ORG',
      referencia_id: 'ORG_ROOT',
      incluir_descendientes: true,
      active: true
    }]
  });

  assert(
    authorizationIsRecordInScope(
      customFieldContext,
      'MOD_CUSTOM',
      { orgId: 'ORG_CHILD' },
      [{
        structureId: 'ORG_ROOT',
        parentId: '',
        siteId: 'SITE_A'
      }, {
        structureId: 'ORG_CHILD',
        parentId: 'ORG_ROOT',
        siteId: 'SITE_A'
      }],
      {
        recordStructureId: 'orgId',
        structureId: 'structureId',
        structureParentId: 'parentId',
        structureSiteId: 'siteId'
      }
    ),
    'Permite adaptar los campos del registro y del catálogo organizacional.'
  );

  console.log(results.join('\n'));

  return {
    success: true,
    total: results.length,
    results
  };
}
