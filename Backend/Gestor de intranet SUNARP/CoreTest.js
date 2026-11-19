
function testSunarpCoreConnection() {
  const source = {
    spreadsheetId: '1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE',
    sheetName: 'sede',
    headerRow: 1,
    label: 'Global parameters - sede'
  };

 const result = SUNARPCore.getSourceInfo(source);

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


function testAllIntranetSources() {

  const sources = [
    {
      key: 'APP_DATA',
      sheet: 'Menu'
    },
    {
      key: 'MASTER_DATA',
      sheet: 'sede'
    },
    {
      key: 'DIRECTORY',
      sheet: 'servidores'
    }
  ];

  const results = sources.map(item => {

    const source = getIntranetDataSource(
      item.key,
      item.sheet
    );

    return SUNARPCore.getSourceInfo(source);

  });

  Logger.log(JSON.stringify(results, null, 2));

  return results;
}


function inspectDirectoryCatalogs() {

  const tabs = [
    { source: 'MASTER_DATA', sheet: 'sede' },
    { source: 'MASTER_DATA', sheet: 'tipos_local' },
    { source: 'MASTER_DATA', sheet: 'locales' },
    { source: 'MASTER_DATA', sheet: 'tipos_estructura' },
    { source: 'MASTER_DATA', sheet: 'estructura_org' },
    { source: 'MASTER_DATA', sheet: 'estructura_local' },
    { source: 'MASTER_DATA', sheet: 'cargos' },
    { source: 'DIRECTORY', sheet: 'servidores' }
  ];

  const results = tabs.map(item => {

    try {
      const source = getIntranetDataSource(
        item.source,
        item.sheet
      );

      const info = SUNARPCore.getSourceInfo(source);

      return {
        source: item.source,
        sheet: item.sheet,
        success: true,
        headers: info.headers,
        lastRow: info.lastRow,
        lastColumn: info.lastColumn
      };

    } catch (error) {

      return {
        source: item.source,
        sheet: item.sheet,
        success: false,
        error: error.message
      };

    }

  });

  results.forEach(result => {
    Logger.log(JSON.stringify(result, null, 2));
  });

  return results;
}


function testDirectoryService() {
  const result = getDirectoryInitialData();

  Logger.log('RESUMEN DEL DIRECTORIO');
  Logger.log(JSON.stringify(result.summary, null, 2));

  Logger.log('CATÁLOGOS');
  Logger.log(JSON.stringify({
    sedes: result.catalogs.sedes.length,
    tiposLocal: result.catalogs.tiposLocal.length,
    locales: result.catalogs.locales.length,
    tiposEstructura: result.catalogs.tiposEstructura.length,
    estructuraOrg: result.catalogs.estructuraOrg.length,
    estructuraLocal: result.catalogs.estructuraLocal.length,
    cargos: result.catalogs.cargos.length
  }, null, 2));

  Logger.log('PRIMEROS REGISTROS');
  Logger.log(JSON.stringify(
    result.records.slice(0, 5),
    null,
    2
  ));

  return result;
}


/**
 * Diagnóstico de integración entre el Gestor y el motor de autorización
 * de SUNARP Core. Solo lee el contexto de autorización y registra un resumen.
 */
function testAccessManagementIntegration() {
  const auth = getAuthContext_();

  const summary = {
    authenticated: auth.authenticated === true,
    institutionalPersonResolved: Boolean(auth.person && auth.person.persona_id),
    activeAccountResolved: Boolean(
      auth.user &&
      (auth.user.active === true || String(auth.user.active).toUpperCase() === 'TRUE')
    ),
    moduleAccess: (auth.moduleAccess || []).map(item => ({
      modulo_id: item.modulo_id,
      moduleCode: item.module && item.module.codigo || '',
      moduleName: item.module && item.module.nombre || '',
      rol_id: item.rol_id,
      roleName: item.role && item.role.nombre || '',
      permissions: item.permissionCodes || [],
      scopes: (item.scopes || []).map(scope => ({
        tipo_ambito: scope.tipo_ambito,
        incluir_descendientes: scope.incluir_descendientes
      }))
    }))
  };

  Logger.log('INTEGRACIÓN GESTOR - SUNARP CORE');
  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}


/**
 * Diagnóstico de autorización para el usuario de prueba PER_117.
 * No depende del correo de la sesión que ejecuta el editor.
 * Solo lee las hojas de seguridad y consulta SUNARP Core.
 */
function testAuthorizationForPerson117() {
  const personaId = 'PER_117';
  const data = _accessLoadSecurityData_();

  const personRows = data.personas.filter(row =>
    _accessText_(row.persona_id) === personaId
  );

  const userRows = data.usuarios.filter(row =>
    _accessText_(row.persona_id) === personaId
  );

  const context = SUNARPCore.resolveAuthorizationContext({
    personaId,
    users: data.usuarios,
    modules: data.modulos,
    roles: data.roles,
    userRoles: data.usuarioRol,
    permissions: data.permisos,
    rolePermissions: data.rolPermiso,
    scopes: data.ambitosAcceso
  });

  const adminContext = Object.assign({}, context, {
    modules: data.modulos
  });

  const adminPermissionCodes = [
    'USUARIOS_ADMINISTRAR',
    'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR',
    'AMBITOS_ACCESO_ADMINISTRAR'
  ];

  const summary = {
    personaId,
    personRows: personRows.map(row => ({
      persona_id: row.persona_id,
      correo_institucional: row.correo_institucional,
      active: row.active
    })),
    userRows: userRows.map(row => ({
      persona_id: row.persona_id,
      active: row.active
    })),
    coreAuthenticated: context.authenticated,
    moduleAccess: (context.moduleAccess || []).map(item => ({
      modulo_id: item.modulo_id,
      moduleCode: item.module && item.module.codigo || '',
      rol_id: item.rol_id,
      permissionCodes: item.permissionCodes || [],
      scopes: (item.scopes || []).map(scope => ({
        tipo_ambito: scope.tipo_ambito,
        referencia_id: scope.referencia_id,
        incluir_descendientes: scope.incluir_descendientes
      }))
    })),
    accessAdminPermissions: adminPermissionCodes.reduce((result, code) => {
      result[code] = SUNARPCore.authorizationHasPermission(
        context,
        code,
        'MOD_ACCESOS'
      );
      return result;
    }, {}),
    auditPermission: {
      inModAccesos: SUNARPCore.authorizationHasPermission(
        context,
        'AUDITORIA_VER',
        'MOD_ACCESOS'
      ),
      inModAuditoria: SUNARPCore.authorizationHasPermission(
        context,
        'AUDITORIA_VER',
        'MOD_AUDITORIA'
      )
    },
    globalAdministrator: context.authenticated
      ? _accessIsGlobalAdministrator_(adminContext)
      : false,
    rawUserRoles: data.usuarioRol
      .filter(row => _accessText_(row.persona_id) === personaId)
      .map(row => ({
        persona_id: row.persona_id,
        modulo_id: row.modulo_id,
        rol_id: row.rol_id,
        active: row.active
      })),
    rawScopes: data.ambitosAcceso
      .filter(row => _accessText_(row.persona_id) === personaId)
      .map(row => ({
        persona_id: row.persona_id,
        modulo_id: row.modulo_id,
        tipo_ambito: row.tipo_ambito,
        referencia_id: row.referencia_id,
        incluir_descendientes: row.incluir_descendientes,
        active: row.active
      }))
  };

  Logger.log('DIAGNÓSTICO DE AUTORIZACIÓN - PER_117');
  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}


/**
 * Aísla la resolución de identidad de SUNARP Core:
 * compara un usuario mínimo conocido con la fila real de Usuarios.
 * No escribe ni modifica hojas.
 */
function testCoreAuthorizationUserResolution() {
  const personaId = 'PER_117';
  const data = _accessLoadSecurityData_();
  const realUser = data.usuarios.find(row =>
    _accessText_(row.persona_id) === personaId
  ) || null;

  const minimalContext = SUNARPCore.resolveAuthorizationContext({
    personaId,
    users: [{ persona_id: personaId, active: true }],
    modules: [],
    roles: [],
    userRoles: [],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  const realUserContext = SUNARPCore.resolveAuthorizationContext({
    personaId,
    users: realUser ? [realUser] : [],
    modules: [],
    roles: [],
    userRoles: [],
    permissions: [],
    rolePermissions: [],
    scopes: []
  });

  const fullContext = SUNARPCore.resolveAuthorizationContext({
    personaId,
    users: data.usuarios,
    modules: data.modulos,
    roles: data.roles,
    userRoles: data.usuarioRol,
    permissions: data.permisos,
    rolePermissions: data.rolPermiso,
    scopes: data.ambitosAcceso
  });

  const result = {
    personaId,
    realUserFound: Boolean(realUser),
    realUserPersonaId: realUser ? realUser.persona_id : null,
    realUserActive: realUser ? realUser.active : null,
    realUserActiveType: realUser ? typeof realUser.active : null,
    minimalContext: {
      authenticated: minimalContext.authenticated,
      userFound: Boolean(minimalContext.user)
    },
    realUserOnlyContext: {
      authenticated: realUserContext.authenticated,
      userFound: Boolean(realUserContext.user)
    },
    fullContext: {
      authenticated: fullContext.authenticated,
      userFound: Boolean(fullContext.user),
      moduleAccessCount: (fullContext.moduleAccess || []).length
    }
  };

  Logger.log('PRUEBA AISLADA DE RESOLUCIÓN DE USUARIO - CORE');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Comprueba el catálogo oficial de tipos de documento y su correspondencia
 * con el valor almacenado en servidores datos personales.
 * No modifica hojas ni imprime números de documento.
 */
function testDirectoryDocumentTypeCatalog() {
  const context = _directoryLoadContext_();

  const expected = {
    TD_001: 'DNI',
    TD_002: 'Carné de extranjería',
    TD_003: 'Pasaporte',
    TD_004: 'Carné de Permiso Temporal de Permanencia (CPP)',
    TD_005: 'Carné Temporal Migratorio',
    TD_006: 'Carné de identidad del Ministerio de Relaciones Exteriores',
    TD_007: 'Cédula de identidad extranjera',
    TD_008: 'Documento de viaje o salvoconducto'
  };

  const types = (context.documentTypes || []).map(item => ({
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim()
  }));

  const byId = new Map(types.map(item => [item.id, item.name]));
  const mismatches = Object.keys(expected).filter(id =>
    byId.get(id) !== expected[id]
  );

  const sampleMatches = (context.datosPersonales || []).filter(item =>
    String(item.tipo_documento || '').trim().toUpperCase() === 'TD_001' &&
    String(item.numero_documento || '').replace(/\s+/g, '') === '40051271'
  );

  const result = {
    catalogCount: types.length,
    types,
    expectedCatalogComplete: mismatches.length === 0,
    mismatches,
    sampleDniMatchCount: sampleMatches.length,
    sampleDniCatalogName: byId.get('TD_001') || ''
  };

  Logger.log('VALIDACIÓN DEL CATÁLOGO TIPO_DOCUMENTO_IDENTIDAD');
  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
