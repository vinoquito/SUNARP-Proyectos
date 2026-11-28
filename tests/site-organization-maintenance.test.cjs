'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const serviceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/SiteOrganizationMaintenanceService.js'),
  'utf8'
);
const uiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/SiteOrganizationMaintenanceScripts.html'),
  'utf8'
);
const indexSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/Index.html'),
  'utf8'
);
const accessServiceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js'),
  'utf8'
);
const contractSource = fs.readFileSync(
  path.join(root, 'Documentacion/Contrato de datos - Global parameters.md'),
  'utf8'
);

function makeFixture(options) {
  options = options || {};
  const rows = {
    sede: (options.sede || [
      { id: 'SEDE_CENTRAL', name: 'Sede Central' },
      { id: 'ZR_I', name: 'Zona Registral n.° I' }
    ]).map(item => ({ ...item })),
    tipos_local: (options.tipos_local || [
      { id: 'EDIFICIO_ADMINISTRATIVO', name: 'Edificio administrativo', active: true },
      { id: 'SEDE_ZONAL', name: 'Sede zonal', active: true },
      { id: 'OFICINA_REGISTRAL', name: 'Oficina Registral', active: true },
      { id: 'OFICINA_RECEPTORA', name: 'Oficina Receptora', active: true }
    ]).map(item => ({ ...item })),
    locales: (options.locales || [
      { id: 'SC_PRIMAVERA', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'EDIFICIO_ADMINISTRATIVO', name: 'Edificio administrativo Primavera', parent_id: '', order: '', active: true },
      { id: 'SC_PARDO', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'EDIFICIO_ADMINISTRATIVO', name: 'Edificio administrativo Pardo', parent_id: '', order: '', active: true },
      { id: 'ZR_I_PIURA', sede_id: 'ZR_I', tipo_local_id: 'SEDE_ZONAL', name: 'Oficina Registral de Piura - Sede Principal', parent_id: '', order: '', active: true }
    ]).map(item => ({ ...item })),
    tipos_estructura: (options.tipos_estructura || [
      { id: 'SUPERINTENDENCIA', name: 'Superintendencia', active: true },
      { id: 'ORGANO', name: 'Órgano', active: true },
      { id: 'GERENCIA', name: 'Gerencia', active: true },
      { id: 'DIRECCION', name: 'Dirección', active: true },
      { id: 'UNIDAD_FUNCIONAL', name: 'Unidad Funcional', active: true },
      { id: 'SERVICIO', name: 'Servicio', active: true }
    ]).map(item => ({ ...item })),
    estructura_org: (options.estructura_org || [
      { id: 'SC_GERENCIA_GENERAL', sede_id: 'SEDE_CENTRAL', parent_id: '', tipo_estructura_id: 'GERENCIA', name: 'Gerencia General', order: 3, active: true },
      { id: 'SC_UF_INTEGRIDAD', sede_id: 'SEDE_CENTRAL', parent_id: 'SC_GERENCIA_GENERAL', tipo_estructura_id: 'UNIDAD_FUNCIONAL', name: 'Unidad Funcional de Integridad Institucional', order: 4, active: true },
      { id: 'ZR_I_JEFATURA', sede_id: 'ZR_I', parent_id: '', tipo_estructura_id: 'ORGANO', name: 'Jefatura Zonal', order: 1, active: true }
    ]).map(item => ({ ...item })),
    estructura_local: (options.estructura_local || [
      { id: 'EL_SC_UF_INTEGRIDAD', estructura_id: 'SC_UF_INTEGRIDAD', local_id: 'SC_PRIMAVERA', referencia: '5.° piso', active: true }
    ]).map(item => ({ ...item })),
    asignaciones: (options.asignaciones || []).map(item => ({ ...item }))
  };

  const audit = [];
  const writes = [];
  const batches = [];
  const cacheReads = [];
  const cache = new Map();
  let globalScope = options.globalScope !== false;
  const permissions = new Set(options.allowedPermissions || [
    'MANTENIMIENTOS_VER',
    'MANTENIMIENTOS_CREAR',
    'MANTENIMIENTOS_EDITAR',
    'MANTENIMIENTOS_CAMBIAR_ESTADO',
    'MANTENIMIENTOS_ELIMINAR'
  ]);
  const auth = {
    authenticated: true,
    personaId: 'PER_TEST',
    email: 'prueba@sunarp.gob.pe',
    moduleAccess: [{
      modulo_id: 'MOD_MANTENIMIENTOS',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
    }]
  };

  const core = {
    getOrBuildCachedValue(key, sources, builder, ttl) {
      cacheReads.push({
        key,
        sources: Array.from(sources, source => source.sheetName),
        ttl
      });
      if (cache.has(key)) return { value: cache.get(key), cacheHit: true, cacheStored: true };
      const value = builder();
      cache.set(key, value);
      return { value, cacheHit: false, cacheStored: true };
    },
    listRecordsFromSources(requests) {
      batches.push(requests.map(request => ({
        key: request.key,
        sheetName: request.source.sheetName,
        sourceId: request.source.spreadsheetId,
        valueMode: request.valueMode,
        requiredHeaders: Array.from(request.requiredHeaders)
      })));
      const result = {};
      requests.forEach(request => {
        const sheet = request.source.sheetName;
        assert.ok(Object.prototype.hasOwnProperty.call(rows, sheet), 'La lectura debe utilizar una pestaña física conocida.');
        assert.equal(request.valueMode, 'display');
        request.requiredHeaders.forEach(field => {
          rows[sheet].forEach(record => {
            assert.ok(Object.prototype.hasOwnProperty.call(record, field), 'El fixture debe conservar los encabezados físicos.');
          });
        });
        result[request.key] = rows[sheet].map(record => ({ ...record }));
      });
      return result;
    },
    authorizationHasPermission(_context, code, moduleId) {
      return moduleId === 'MOD_MANTENIMIENTOS' && permissions.has(code);
    },
    authorizationIsRecordInScope() {
      return globalScope;
    },
    findRecordsByFields(source, filters, config) {
      const sheet = source.sheetName;
      assert.equal(source.spreadsheetId, 'DIRECTORY_TEST', 'Las referencias operativas deben consultarse en DIRECTORY.');
      assert.ok(Object.prototype.hasOwnProperty.call(rows, sheet));
      const field = config.searchField;
      const expected = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
      const matches = rows[sheet].filter(record =>
        expected.some(value => String(record[field] ?? '').trim() === String(value).trim())
      );
      return { records: matches.map(record => ({ ...record })), total: matches.length };
    },
    insertRecord(source, record, config) {
      const sheet = source.sheetName;
      const key = config && config.idField || 'id';
      assert.equal(source.spreadsheetId, 'MASTER_DATA_TEST', 'Las altas maestras deben dirigirse a MASTER_DATA.');
      assert.ok(Object.prototype.hasOwnProperty.call(rows, sheet));
      assert.equal(rows[sheet].some(item => String(item[key]) === String(record[key])), false);
      rows[sheet].push({ ...record });
      writes.push({ method: 'insertRecord', source: source.spreadsheetId, sheet, record: { ...record }, config });
      cache.clear();
      return { success: true, message: 'Registro insertado correctamente.' };
    },
    updateRecord(source, idField, id, updates) {
      const sheet = source.sheetName;
      assert.equal(source.spreadsheetId, 'MASTER_DATA_TEST', 'Las actualizaciones maestras deben dirigirse a MASTER_DATA.');
      const record = rows[sheet].find(item => String(item[idField]) === String(id));
      assert.ok(record, 'El registro a actualizar debe existir.');
      Object.assign(record, updates);
      writes.push({ method: 'updateRecord', source: source.spreadsheetId, sheet, id, updates: { ...updates } });
      cache.clear();
      return { success: true, message: 'Registro actualizado correctamente.' };
    },
    deleteRecord(source, idField, id) {
      const sheet = source.sheetName;
      assert.equal(source.spreadsheetId, 'MASTER_DATA_TEST');
      const index = rows[sheet].findIndex(item => String(item[idField]) === String(id));
      assert.notEqual(index, -1);
      rows[sheet].splice(index, 1);
      writes.push({ method: 'deleteRecord', source: source.spreadsheetId, sheet, id });
      cache.clear();
      return { success: true };
    }
  };

  const sandbox = {
    console,
    SUNARPCore: core,
    getIntranetDataSource(sourceKey, sheetName, headerRow) {
      assert.ok(sourceKey === 'MASTER_DATA' || sourceKey === 'DIRECTORY');
      assert.equal(headerRow, 1);
      return { spreadsheetId: sourceKey + '_TEST', sheetName };
    },
    _accessRequirePermission_(code, moduleCode) {
      assert.equal(moduleCode, 'MANTENIMIENTOS');
      if (!permissions.has(code)) throw new Error('Permiso denegado: ' + code);
      return auth;
    },
    _accessResolveModuleId_(_context, moduleCode) {
      assert.equal(moduleCode, 'MANTENIMIENTOS');
      return 'MOD_MANTENIMIENTOS';
    },
    _accessGetModuleAccess_(_context, moduleId) {
      return auth.moduleAccess.find(item => item.modulo_id === moduleId) || null;
    },
    _accessWriteAudit_(_context, event) {
      audit.push({ ...event });
    },
    _accessRunAudited_(_context, event, callback) {
      try {
        const outcome = callback();
        const value = outcome && Object.prototype.hasOwnProperty.call(outcome, 'value')
          ? outcome.value
          : outcome;
        audit.push({
          ...event,
          resultado: 'OK',
          datos_despues: outcome && outcome.auditAfter !== undefined ? outcome.auditAfter : null
        });
        return value;
      } catch (error) {
        audit.push({ ...event, resultado: 'ERROR', detalle: event.detalle + ' | ' + error.message });
        throw error;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(serviceSource, sandbox, { filename: 'SiteOrganizationMaintenanceService.js' });
  return {
    sandbox,
    rows,
    audit,
    writes,
    batches,
    cacheReads,
    call(expression) {
      return vm.runInContext(expression, sandbox);
    },
    setGlobalScope(value) {
      globalScope = value;
    }
  };
}

test('carga los cinco catálogos y estructura_local en un solo lote cacheado de Core', () => {
  const fixture = makeFixture();
  const first = fixture.call('getSiteOrganizationMaintenanceData()');
  const second = fixture.call('getSiteOrganizationMaintenanceData()');

  assert.equal(
    Object.keys(first.entities).join('|'),
    'sede|tipos_local|locales|tipos_estructura|estructura_org'
  );
  assert.deepEqual(
    fixture.batches[0].map(item => item.sheetName),
    ['sede', 'tipos_local', 'locales', 'tipos_estructura', 'estructura_org', 'estructura_local']
  );
  assert.equal(fixture.batches.length, 1);
  assert.equal(fixture.cacheReads.length, 2);
  assert.equal(fixture.cacheReads[0].ttl, 300);
  assert.ok(fixture.batches[0].every(item => item.valueMode === 'display'));
  assert.equal(Object.prototype.hasOwnProperty.call(first.entities, 'estructura_local'), false);
  assert.equal(second.catalogs.estructura_local.length, 1);
});

test('respeta los encabezados y la ausencia de active en sede', () => {
  const fixture = makeFixture();
  const data = fixture.call('getSiteOrganizationMaintenanceData()');
  assert.equal(data.entities.sede.hasActive, false);
  assert.deepEqual(
    Object.keys(data.catalogs.sede[0]),
    ['id', 'name']
  );
  assert.deepEqual(
    Object.keys(data.catalogs.tipos_local[0]),
    ['id', 'name', 'active']
  );
  assert.deepEqual(
    Object.keys(data.catalogs.locales[0]),
    ['id', 'sede_id', 'tipo_local_id', 'name', 'parent_id', 'order', 'active']
  );
});

test('genera códigos previsibles según sede, tipo y nombre, sin modificar claves existentes', () => {
  const fixture = makeFixture();
  assert.equal(
    fixture.call("_somGenerateIdentifier_('sede',{name:'Sede Central'},_somLoadCatalogs_())"),
    'SEDE_CENTRAL_2'
  );
  assert.equal(
    fixture.call("_somGenerateIdentifier_('sede',{name:'Zona Registral n.° II'},_somLoadCatalogs_())"),
    'ZR_II'
  );
  assert.equal(
    fixture.call("_somGenerateIdentifier_('sede',{name:'Sede Sur'},_somLoadCatalogs_())"),
    'SEDE_SUR'
  );
  assert.equal(
    fixture.call("_somGenerateIdentifier_('tipos_local',{name:'Oficina Receptora'},_somLoadCatalogs_())"),
    'OFICINA_RECEPTORA'
  );
  assert.equal(
    fixture.call("_somGenerateIdentifier_('locales',{name:'Oficina Registral de Talara - Sede Principal',sede_id:'ZR_I',tipo_local_id:'SEDE_ZONAL'},_somLoadCatalogs_())"),
    'ZR_I_TALARA'
  );
  assert.equal(
    fixture.call("_somGenerateIdentifier_('estructura_org',{name:'Unidad Funcional de Administración',sede_id:'SEDE_CENTRAL'},_somLoadCatalogs_())"),
    'SC_UF_ADMINISTRACION'
  );
});

test('crea sedes y tipos sin columnas inventadas, y crea locales y estructuras activos por defecto', () => {
  const fixture = makeFixture();
  const cases = [
    {
      payload: { entity: 'sede', action: 'create', id: 'SEDE_SUR', name: 'Sede Sur' },
      expected: { id: 'SEDE_SUR', name: 'Sede Sur' },
      sheet: 'sede'
    },
    {
      payload: { entity: 'tipos_local', action: 'create', id: 'OFICINA_RECEPTORA_NUEVA', name: 'Oficina Receptora Nueva' },
      expected: { id: 'OFICINA_RECEPTORA_NUEVA', name: 'Oficina Receptora Nueva', active: true },
      sheet: 'tipos_local'
    },
    {
      payload: {
        entity: 'locales', action: 'create', id: 'ZR_I_TALARA',
        name: 'Oficina Registral de Talara - Sede Principal',
        sede_id: 'ZR_I', tipo_local_id: 'SEDE_ZONAL', parent_id: '', order: ''
      },
      expected: {
        id: 'ZR_I_TALARA', sede_id: 'ZR_I', tipo_local_id: 'SEDE_ZONAL',
        name: 'Oficina Registral de Talara - Sede Principal',
        parent_id: '', order: '', active: true
      },
      sheet: 'locales'
    },
    {
      payload: {
        entity: 'estructura_org', action: 'create', id: 'SC_UF_ADMINISTRACION',
        name: 'Unidad Funcional de Administración',
        sede_id: 'SEDE_CENTRAL', tipo_estructura_id: 'UNIDAD_FUNCIONAL',
        parent_id: 'SC_GERENCIA_GENERAL', order: ''
      },
      expected: {
        id: 'SC_UF_ADMINISTRACION', sede_id: 'SEDE_CENTRAL',
        tipo_estructura_id: 'UNIDAD_FUNCIONAL',
        name: 'Unidad Funcional de Administración',
        parent_id: 'SC_GERENCIA_GENERAL', order: '', active: true
      },
      sheet: 'estructura_org'
    }
  ];

  cases.forEach(item => {
    fixture.call('saveSiteOrganizationMaintenanceRecord(' + JSON.stringify(item.payload) + ')');
    assert.deepEqual(
      fixture.rows[item.sheet].find(record => record.id === item.expected.id),
      item.expected
    );
  });
  assert.equal(fixture.writes.length, 4);
  assert.ok(fixture.writes.every(item => item.source === 'MASTER_DATA_TEST'));
});

test('rechaza identificadores manuales que no correspondan al generador del servidor', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'sede',action:'create',id:'CODIGO_MANUAL',name:'Sede Sur'})"),
    /código generado cambió/
  );
  assert.equal(fixture.writes.length, 0);
});

test('valida relaciones de sede, tipo y padre para locales', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'locales',action:'create',id:'ZR_I_TALARA',name:'Oficina Registral de Talara',sede_id:'ZR_NO_EXISTE',tipo_local_id:'SEDE_ZONAL',parent_id:'',order:''})"),
    /Selecciona una sede existente/
  );
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'locales',action:'create',id:'ZR_I_TALARA',name:'Oficina Registral de Talara',sede_id:'ZR_I',tipo_local_id:'TIPO_INEXISTENTE',parent_id:'',order:''})"),
    /referencia seleccionada.*no existe/
  );
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'locales',action:'edit',id:'SC_PRIMAVERA',name:'Edificio administrativo Primavera',sede_id:'SEDE_CENTRAL',tipo_local_id:'EDIFICIO_ADMINISTRATIVO',parent_id:'ZR_I_PIURA',order:''})"),
    /misma sede/
  );
  assert.equal(fixture.writes.length, 0);
});

test('impide ciclos jerárquicos al modificar locales', () => {
  const fixture = makeFixture({
    locales: [
      { id: 'SC_PARENT', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'EDIFICIO_ADMINISTRATIVO', name: 'Local padre', parent_id: '', order: 1, active: true },
      { id: 'SC_CHILD', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'EDIFICIO_ADMINISTRATIVO', name: 'Local hijo', parent_id: 'SC_PARENT', order: 2, active: true }
    ]
  });
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'locales',action:'edit',id:'SC_PARENT',name:'Local padre',sede_id:'SEDE_CENTRAL',tipo_local_id:'EDIFICIO_ADMINISTRATIVO',parent_id:'SC_CHILD',order:1})"),
    /generaría un ciclo/
  );
  assert.equal(fixture.writes.length, 0);
});

test('valida sede, tipo y jerarquía de estructura orgánica', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'estructura_org',action:'create',id:'SC_NUEVA_UNIDAD',name:'Nueva unidad',sede_id:'SEDE_CENTRAL',tipo_estructura_id:'TIPO_INEXISTENTE',parent_id:'',order:1})"),
    /referencia seleccionada.*no existe/
  );
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'estructura_org',action:'edit',id:'SC_GERENCIA_GENERAL',name:'Gerencia General',sede_id:'SEDE_CENTRAL',tipo_estructura_id:'GERENCIA',parent_id:'ZR_I_JEFATURA',order:3})"),
    /misma sede/
  );
  assert.equal(fixture.writes.length, 0);
});

test('rechaza cambiar la sede de un local o estructura ya registrada', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("saveSiteOrganizationMaintenanceRecord({entity:'locales',action:'edit',id:'SC_PARDO',name:'Edificio administrativo Pardo',sede_id:'ZR_I',tipo_local_id:'EDIFICIO_ADMINISTRATIVO',parent_id:'',order:''})"),
    /sede de un registro existente no se puede cambiar/
  );
  assert.equal(fixture.writes.length, 0);
});

test('order es opcional y, cuando se indica, debe ser entero positivo', () => {
  const fixture = makeFixture();
  assert.equal(fixture.call("_somParseOrder_('')"), '');
  assert.equal(fixture.call("_somParseOrder_('4')"), 4);
  assert.throws(() => fixture.call("_somParseOrder_('1.5')"), /número entero/);
  assert.throws(() => fixture.call("_somParseOrder_('0')"), /número entero/);
});

test('protege la eliminación de sedes y tipos con referencias existentes', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('sede','SEDE_CENTRAL')"),
    /tiene locales asociados|tiene estructuras orgánicas asociadas/
  );
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('tipos_local','EDIFICIO_ADMINISTRATIVO')"),
    /utilizado por uno o más locales/
  );
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('tipos_estructura','GERENCIA')"),
    /utilizado por una o más estructuras orgánicas/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de locales con hijos y con relación estructura_local', () => {
  const child = makeFixture({
    locales: [
      { id: 'SC_PARENT', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'EDIFICIO_ADMINISTRATIVO', name: 'Local padre', parent_id: '', order: 1, active: true },
      { id: 'SC_CHILD', sede_id: 'SEDE_CENTRAL', tipo_local_id: 'OFICINA_REGISTRAL', name: 'Local hijo', parent_id: 'SC_PARENT', order: 2, active: true }
    ],
    estructura_local: []
  });
  assert.throws(
    () => child.call("deleteSiteOrganizationMaintenanceRecord('locales','SC_PARENT')"),
    /tiene locales dependientes/
  );

  const linked = makeFixture();
  assert.throws(
    () => linked.call("deleteSiteOrganizationMaintenanceRecord('locales','SC_PRIMAVERA')"),
    /estructura_local/
  );
  assert.equal(linked.writes.length, 0);
});

test('protege la eliminación de locales referenciados por asignaciones en DIRECTORY', () => {
  const fixture = makeFixture({
    estructura_local: [],
    asignaciones: [{ asignacion_id: 'ASG_001', local_id: 'SC_PARDO' }]
  });
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('locales','SC_PARDO')"),
    /utilizado en asignaciones del Directorio telefónico/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de estructuras orgánicas con hijos o relación estructura_local', () => {
  const fixture = makeFixture();
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('estructura_org','SC_GERENCIA_GENERAL')"),
    /estructuras orgánicas dependientes/
  );
  assert.throws(
    () => fixture.call("deleteSiteOrganizationMaintenanceRecord('estructura_org','SC_UF_INTEGRIDAD')"),
    /estructura_local/
  );
  assert.equal(fixture.writes.length, 0);
});

test('permite eliminar físicamente un catálogo sin referencias y audita la operación', () => {
  const fixture = makeFixture({
    locales: [],
    estructura_org: [],
    estructura_local: []
  });
  const result = fixture.call("deleteSiteOrganizationMaintenanceRecord('sede','ZR_I')");
  assert.equal(result.success, true);
  assert.equal(fixture.rows.sede.some(item => item.id === 'ZR_I'), false);
  assert.deepEqual(fixture.writes[0], {
    method: 'deleteRecord',
    source: 'MASTER_DATA_TEST',
    sheet: 'sede',
    id: 'ZR_I'
  });
  assert.equal(fixture.audit[0].tipo_entidad, 'SEDE');
  assert.equal(fixture.audit[0].resultado, 'OK');
});

test('cambia active mediante operación independiente y no ofrece estado para sede', () => {
  const fixture = makeFixture();
  const result = fixture.call("setSiteOrganizationMaintenanceStatus('locales','SC_PRIMAVERA',false)");
  assert.equal(result.success, true);
  assert.equal(result.record.active, false);
  assert.equal(fixture.rows.locales.find(item => item.id === 'SC_PRIMAVERA').active, false);
  assert.equal(fixture.audit[0].accion, 'CAMBIAR_ESTADO_CATALOGO_MANTENIMIENTO');
  assert.equal(fixture.audit[0].tipo_entidad, 'LOCAL');
  assert.throws(
    () => fixture.call("setSiteOrganizationMaintenanceStatus('sede','SEDE_CENTRAL',false)"),
    /no tiene un campo de estado/
  );
});

test('rechaza el cambio de estado sin permiso CAMBIAR_ESTADO', () => {
  const fixture = makeFixture({
    allowedPermissions: ['MANTENIMIENTOS_VER', 'MANTENIMIENTOS_CREAR', 'MANTENIMIENTOS_EDITAR']
  });
  assert.throws(
    () => fixture.call("setSiteOrganizationMaintenanceStatus('locales','SC_PRIMAVERA',false)"),
    /Permiso denegado/
  );
  assert.equal(fixture.writes.length, 0);
});

test('exige permiso efectivo y ámbito TOTAL exclusivo antes de consultar o escribir', () => {
  const noPermission = makeFixture({ allowedPermissions: ['MANTENIMIENTOS_VER'] });
  assert.throws(
    () => noPermission.call("saveSiteOrganizationMaintenanceRecord({entity:'sede',action:'create',id:'SEDE_SUR',name:'Sede Sur'})"),
    /Permiso denegado/
  );
  assert.equal(noPermission.batches.length, 0);
  assert.equal(noPermission.writes.length, 0);

  const noScope = makeFixture({ globalScope: false });
  assert.throws(
    () => noScope.call('getSiteOrganizationMaintenanceData()'),
    /ámbito TOTAL autorizado/
  );
  assert.equal(noScope.batches.length, 0);
  assert.ok(noScope.audit.some(item => item.accion === 'AUTORIZACION_DENEGADA'));
});

test('la interfaz comparte caché entre rutas, conserva pestañas y no consulta por cada cambio', () => {
  assert.match(uiSource, /const shared = \{ data: null, loadPromise: null \}/);
  assert.match(uiSource, /if \(shared\.data\) return Promise\.resolve\(shared\.data\)/);
  assert.match(uiSource, /if \(shared\.loadPromise\) return shared\.loadPromise/);
  assert.match(uiSource, /rpc\('getSiteOrganizationMaintenanceData'\)/);
  assert.match(uiSource, /function initializeRoute\(route\)/);
  assert.match(uiSource, /if \(shared\.data\) \{\s*renderActiveTab\(route\);\s*return;/);
  assert.match(uiSource, /onChange: function \(tabId\) \{\s*state\.activeTab = tabId;\s*renderActiveTab\(route\)/);
});

test('la interfaz incluye acciones de fila, estado inline, historial y formularios sin checkbox active', () => {
  assert.match(uiSource, /label: 'Editar'/);
  assert.match(uiSource, /label: 'Eliminar'/);
  assert.match(uiSource, /label: 'Historial'/);
  assert.match(uiSource, /window\.SUNARPAccessHistory\.open\(\s*'MANTENIMIENTO'/);
  assert.match(uiSource, /SUNARPUI\.createBadge/);
  assert.match(uiSource, /setSiteOrganizationMaintenanceStatus/);
  assert.match(uiSource, /Código generado automáticamente/);
  assert.match(uiSource, /Orden \(opcional\)/);
  assert.doesNotMatch(uiSource, /activeInput|name\s*=\s*'active'/);
  assert.doesNotMatch(uiSource, /id:\s*'estructura_local'/);
});

test('el historial reconoce los cinco nuevos tipos de mantenimiento y la vista queda incluida', () => {
  for (const eventType of ['SEDE', 'TIPO_LOCAL', 'LOCAL', 'TIPO_ESTRUCTURA', 'ESTRUCTURA_ORG']) {
    assert.match(accessServiceSource, new RegExp("'" + eventType + "'"));
  }
  assert.match(indexSource, /include\('SiteOrganizationMaintenanceScripts'\)/);
  assert.match(contractSource, /#### Convención de identificadores para nuevos registros/);
  assert.match(contractSource, /estructura_local.*relación/i);
});
