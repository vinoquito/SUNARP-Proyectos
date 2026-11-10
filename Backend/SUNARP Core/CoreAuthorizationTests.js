/**
 * SUNARP Core — pruebas de autorización.
 * Ejecutar runAuthorizationSelfTests_() desde el editor de Core.
 * No crea ni modifica hojas de cálculo.
 */
function runAuthorizationSelfTests_() {
  const results = [];

  function assert(condition, label) {
    if (!condition) {
      throw new Error(`PRUEBA FALLIDA: ${label}`);
    }

    results.push(`OK: ${label}`);
  }

  const context = resolveAuthorizationContext({
    email: 'prueba@sunarp.gob.pe',

    users: [{
      correo_institucional: 'prueba@sunarp.gob.pe',
      estado: 'ACTIVO',
      rol_id: 'ROL_PRUEBA'
    }],

    roles: [{
      rol_id: 'ROL_PRUEBA',
      estado: 'ACTIVO'
    }],

    permissions: [
      {
        permiso_id: 'PERM_001',
        codigo: 'DIRECTORIOS_VER',
        estado: 'ACTIVO'
      },
      {
        permiso_id: 'PERM_002',
        codigo: 'DIRECTORIOS_EDITAR',
        estado: 'INACTIVO'
      }
    ],

    rolePermissions: [
      {
        rol_id: 'ROL_PRUEBA',
        permiso_id: 'PERM_001',
        estado: 'ACTIVO'
      },
      {
        rol_id: 'ROL_PRUEBA',
        permiso_id: 'PERM_002',
        estado: 'ACTIVO'
      }
    ],

    scopes: [{
      correo_institucional: 'prueba@sunarp.gob.pe',
      modulo: 'DIRECTORIOS',
      tipo_ambito: 'ESTRUCTURA_ORG',
      referencia_id: 'SC_OFICINA_ADMINISTRACION',
      incluir_descendientes: 'SI',
      estado: 'ACTIVO'
    }]
  });

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
      id: 'ZR_I_UNIDAD',
      parent_id: '',
      sede_id: 'ZR_I'
    }
  ];

  assert(
    context.authenticated,
    'Reconoce usuario y rol activos.'
  );

  assert(
    authorizationHasPermission(context, 'DIRECTORIOS_VER'),
    'Reconoce permiso activo asignado al rol.'
  );

  assert(
    !authorizationHasPermission(context, 'DIRECTORIOS_EDITAR'),
    'Ignora permisos inactivos.'
  );

  assert(
    authorizationIsRecordInScope(
      context,
      'DIRECTORIOS',
      { estructura_id: 'SC_UNIDAD_TESORERIA', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'Incluye unidades descendientes cuando el ámbito lo permite.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'DIRECTORIOS',
      { estructura_id: 'ZR_I_UNIDAD', sede_id: 'ZR_I' },
      structures
    ),
    'Rechaza registros fuera del ámbito orgánico.'
  );

  assert(
    !authorizationIsRecordInScope(
      context,
      'DOCUMENTOS_NORMATIVOS',
      { estructura_id: 'SC_UNIDAD_TESORERIA', sede_id: 'SEDE_CENTRAL' },
      structures
    ),
    'No reutiliza ámbitos de otro módulo.'
  );

  const sedeContext = resolveAuthorizationContext({
    email: 'sede@sunarp.gob.pe',

    users: [{
      correo_institucional: 'sede@sunarp.gob.pe',
      estado: 'ACTIVO',
      rol_id: 'ROL_PRUEBA'
    }],

    roles: [{
      rol_id: 'ROL_PRUEBA',
      estado: 'ACTIVO'
    }],

    permissions: [{
      permiso_id: 'PERM_001',
      codigo: 'DIRECTORIOS_VER',
      estado: 'ACTIVO'
    }],

    rolePermissions: [{
      rol_id: 'ROL_PRUEBA',
      permiso_id: 'PERM_001',
      estado: 'ACTIVO'
    }],

    scopes: [{
      correo_institucional: 'sede@sunarp.gob.pe',
      modulo: 'DIRECTORIOS',
      tipo_ambito: 'SEDE',
      referencia_id: 'SEDE_CENTRAL',
      incluir_descendientes: 'NO',
      estado: 'ACTIVO'
    }]
  });

  assert(
    authorizationIsRecordInScope(
      sedeContext,
      'DIRECTORIOS',
      {
        estructura_id: 'SC_UNIDAD_TESORERIA',
        sede_id: 'ZR_I'
      },
      structures
    ),
    'Deriva la sede desde el catálogo orgánico maestro y no desde el registro.'
  );

  const totalContext = resolveAuthorizationContext({
    email: 'total@sunarp.gob.pe',

    users: [{
      correo_institucional: 'total@sunarp.gob.pe',
      estado: 'ACTIVO',
      rol_id: 'ROL_PRUEBA'
    }],

    roles: [{
      rol_id: 'ROL_PRUEBA',
      estado: 'ACTIVO'
    }],

    permissions: [{
      permiso_id: 'PERM_001',
      codigo: 'DIRECTORIOS_VER',
      estado: 'ACTIVO'
    }],

    rolePermissions: [{
      rol_id: 'ROL_PRUEBA',
      permiso_id: 'PERM_001',
      estado: 'ACTIVO'
    }],

    scopes: [{
      correo_institucional: 'total@sunarp.gob.pe',
      modulo: 'DIRECTORIOS',
      tipo_ambito: 'TOTAL',
      referencia_id: '',
      incluir_descendientes: 'NO',
      estado: 'ACTIVO'
    }]
  });

  assert(
    authorizationIsRecordInScope(
      totalContext,
      'DIRECTORIOS',
      {
        estructura_id: 'ZR_I_UNIDAD',
        sede_id: 'ZR_I'
      },
      structures
    ),
    'Interpreta TOTAL como acceso a todos los registros del módulo.'
  );

  console.log(results.join('\n'));

  return {
    success: true,
    total: results.length,
    results
  };
}
