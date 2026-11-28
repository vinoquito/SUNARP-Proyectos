'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const serviceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/PersonnelTelephoneMaintenanceService.js'),
  'utf8'
);
const uiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/PersonnelTelephoneMaintenanceScripts.html'),
  'utf8'
);
const indexSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/Index.html'),
  'utf8'
);
const stagedUiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/GeographicMaintenanceScripts.html'),
  'utf8'
);
const geographicServiceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/GeographicMaintenanceService.js'),
  'utf8'
);
const accessServiceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js'),
  'utf8'
);

function makeMaintenanceSandbox(options) {
  options = options || {};
  const rows = {
    cargos: (options.cargos || [
      { id: 'CARGO_ASESOR', name: 'Asesor', active: true },
      { id: 'CARGO_GERENTE_GENERAL', name: 'Gerente General', active: true }
    ]).map(item => ({ ...item })),
    condicion_cargo: (options.condicion_cargo || [
      { id: 'CONDICION_TITULAR', name: 'Titular', active: true },
      { id: 'CONDICION_ENCARGADO', name: 'Encargado', active: true },
      { id: 'CONDICION_SUPLENTE', name: 'Suplente', active: true }
    ]).map(item => ({ ...item })),
    tipo_documento_identidad: (options.tipo_documento_identidad || [
      { id: 'TD_001', name: 'DNI' },
      { id: 'TD_002', name: 'Carné de extranjería' },
      { id: 'TD_003', name: 'Pasaporte' },
      { id: 'TD_004', name: 'CPP' },
      { id: 'TD_005', name: 'CTM' }
    ]).map(item => ({ ...item })),
    tipo_telefono: (options.tipo_telefono || [
      { id: 'CENTRAL_TELEFONICA', nombre: 'Central telefónica', active: true },
      { id: 'DIRECTO', nombre: 'Teléfono directo', active: true },
      { id: 'MOVIL', nombre: 'Teléfono móvil', active: true }
    ]).map(item => ({ ...item })),
    asignaciones: (options.asignaciones || [
      { asignacion_id: 'ASG_001', cargo_id: 'CARGO_ASESOR', condicion_cargo: 'Titular' }
    ]).map(item => ({ ...item })),
    'servidores datos personales': (options.datosPersonales || [
      { servidor_id: 'PER_001', tipo_documento: 'TD_001' }
    ]).map(item => ({ ...item }))
  };

  const audit = [];
  const writes = [];
  const sourceReads = [];
  const batches = [];
  const cache = new Map();
  let globalScope = options.globalScope !== false;
  const allowedPermissions = new Set(options.allowedPermissions || [
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
      sourceReads.push({
        key,
        sources: Array.from(sources, source => source.sheetName),
        ttl
      });
      if (cache.has(key)) {
        return { value: cache.get(key), cacheHit: true, cacheStored: true };
      }
      const value = builder();
      cache.set(key, value);
      return { value, cacheHit: false, cacheStored: true };
    },
    listRecordsFromSources(requests) {
      batches.push(requests.map(request => ({
        key: request.key,
        sheetName: request.source.sheetName,
        valueMode: request.valueMode,
        requiredHeaders: Array.from(request.requiredHeaders)
      })));
      const result = {};
      requests.forEach(request => {
        const name = request.source.sheetName;
        assert.ok(Object.prototype.hasOwnProperty.call(rows, name), 'La fuente debe ser una pestaña existente del catálogo.');
        assert.equal(request.valueMode, 'display');
        request.requiredHeaders.forEach(field => {
          rows[name].forEach(record => {
            assert.ok(Object.prototype.hasOwnProperty.call(record, field), 'El fixture debe respetar los encabezados físicos.');
          });
        });
        result[request.key] = rows[name].map(record => ({ ...record }));
      });
      return result;
    },
    authorizationHasPermission(_context, code, moduleId) {
      return moduleId === 'MOD_MANTENIMIENTOS' && allowedPermissions.has(code);
    },
    authorizationIsRecordInScope() {
      return globalScope;
    },
    findRecordsByFields(source, filters, options) {
      const sheetName = source.sheetName;
      sourceReads.push({ key: 'reference-check', sources: [sheetName] });
      assert.ok(Object.prototype.hasOwnProperty.call(rows, sheetName), 'La comprobación debe usar una fuente operativa conocida.');
      const field = options.searchField;
      const expected = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
      const matches = rows[sheetName].filter(record =>
        expected.some(value => String(record[field] ?? '').trim() === String(value).trim())
      );
      return { records: matches.map(record => ({ ...record })), total: matches.length };
    },
    insertRecord(source, record, config) {
      const name = source.sheetName;
      const idField = config && config.idField || 'id';
      assert.ok(Object.prototype.hasOwnProperty.call(rows, name), 'La inserción debe dirigirse a la fuente maestra.');
      assert.equal(rows[name].some(item => String(item[idField]) === String(record[idField])), false);
      rows[name].push({ ...record });
      writes.push({ method: 'insertRecord', sheet: name, record: { ...record }, config });
      cache.clear();
      return { success: true, message: 'Registro insertado correctamente.' };
    },
    updateRecord(source, idField, id, updates) {
      const name = source.sheetName;
      const record = rows[name].find(item => String(item[idField]) === String(id));
      assert.ok(record, 'El registro a actualizar debe existir.');
      Object.assign(record, updates);
      writes.push({ method: 'updateRecord', sheet: name, id, updates: { ...updates } });
      cache.clear();
      return { success: true, message: 'Registro actualizado correctamente.' };
    },
    deleteRecord(source, idField, id) {
      const name = source.sheetName;
      const index = rows[name].findIndex(item => String(item[idField]) === String(id));
      assert.notEqual(index, -1);
      rows[name].splice(index, 1);
      writes.push({ method: 'deleteRecord', sheet: name, id });
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
      if (!allowedPermissions.has(code)) throw new Error('Permiso denegado: ' + code);
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
        const result = callback();
        const value = result && Object.prototype.hasOwnProperty.call(result, 'value')
          ? result.value
          : result;
        audit.push({
          ...event,
          resultado: 'OK',
          datos_despues: result && result.auditAfter !== undefined ? result.auditAfter : null
        });
        return value;
      } catch (error) {
        audit.push({ ...event, resultado: 'ERROR', detalle: event.detalle + ' | ' + error.message });
        throw error;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(serviceSource, sandbox, { filename: 'PersonnelTelephoneMaintenanceService.js' });
  return {
    sandbox,
    rows,
    audit,
    writes,
    sourceReads,
    batches,
    call(expression) {
      return vm.runInContext(expression, sandbox);
    },
    setGlobalScope(value) {
      globalScope = value;
    }
  };
}

test('carga de una sola vez los tres catálogos de Datos de personal en una consulta agrupada de Core', () => {
  const fixture = makeMaintenanceSandbox();
  const first = fixture.call("getPersonnelTelephoneMaintenanceData('datos-personal')");
  const second = fixture.call("getPersonnelTelephoneMaintenanceData('datos-personal')");

  assert.equal(
    Object.keys(first.entities).join('|'),
    'cargos|condicion_cargo|tipo_documento_identidad'
  );
  assert.equal(Object.keys(second.entities).join('|'), Object.keys(first.entities).join('|'));
  assert.equal(fixture.batches.length, 1);
  assert.equal(
    fixture.batches[0].map(item => item.sheetName).join('|'),
    'cargos|condicion_cargo|tipo_documento_identidad'
  );
  assert.ok(fixture.batches[0].every(item => item.valueMode === 'display'));
  assert.equal(fixture.sourceReads[0].ttl, 300);
});

test('el grupo Directorio telefónico consulta tipo_telefono una sola vez y no inventa la fuente telefonos', () => {
  const fixture = makeMaintenanceSandbox();
  const data = fixture.call("getPersonnelTelephoneMaintenanceData('directorio-telefonico')");

  assert.deepEqual(Object.keys(data.entities), ['tipo_telefono']);
  assert.equal(data.entities.tipo_telefono.records[0].nombre, 'Central telefónica');
  assert.ok(!fixture.batches[0].some(item => item.sheetName === 'telefonos'));
});

test('tipo_telefono conserva el encabezado físico nombre y no lo convierte a name', () => {
  const fixture = makeMaintenanceSandbox();
  const data = fixture.call("getPersonnelTelephoneMaintenanceData('directorio-telefonico')");
  const item = data.entities.tipo_telefono;
  assert.equal(item.nameField, 'nombre');
  assert.equal(item.records[0].nombre, 'Central telefónica');
  assert.equal(Object.prototype.hasOwnProperty.call(item.records[0], 'name'), false);
});

test('tipo_documento_identidad no incorpora un campo active inexistente', () => {
  const fixture = makeMaintenanceSandbox();
  const data = fixture.call("getPersonnelTelephoneMaintenanceData('datos-personal')");
  const item = data.entities.tipo_documento_identidad;
  assert.equal(item.hasActive, false);
  assert.deepEqual(Object.keys(item.records[0]), ['id', 'name']);
});

test('genera códigos según cada catálogo: CARGO_, CONDICION_, TD_ secuencial y tipo de teléfono según nombre', () => {
  const fixture = makeMaintenanceSandbox();
  assert.equal(fixture.call("_ptmGenerateIdentifier_('cargos','Asistente de oficina',[])"), 'CARGO_ASISTENTE_DE_OFICINA');
  assert.equal(fixture.call("_ptmGenerateIdentifier_('condicion_cargo','Titular',[])"), 'CONDICION_TITULAR');
  assert.equal(fixture.call("_ptmGenerateIdentifier_('tipo_documento_identidad','Carné de extranjería',[])"), 'TD_001');
  assert.equal(fixture.call("_ptmGenerateIdentifier_('tipo_telefono','Teléfono satelital',[])"), 'SATELITAL');
});

test('el generador resuelve colisiones con sufijo y evita duplicar identificadores', () => {
  const fixture = makeMaintenanceSandbox();
  assert.equal(
    fixture.call("_ptmGenerateIdentifier_('condicion_cargo','Titular',[{id:'CONDICION_TITULAR',name:'Titular',active:true}])"),
    'CONDICION_TITULAR_2'
  );
  assert.equal(
    fixture.call("_ptmGenerateIdentifier_('tipo_documento_identidad','DNI',[{id:'TD_001'},{id:'TD_002'}])"),
    'TD_003'
  );
});

test('crea los cuatro catálogos con sus columnas correctas y active=true por defecto', () => {
  const fixture = makeMaintenanceSandbox();
  const cases = [
    { entity: 'cargos', id: 'CARGO_ESPECIALISTA', name: 'Especialista', field: 'name', expected: { id: 'CARGO_ESPECIALISTA', name: 'Especialista', active: true } },
    { entity: 'condicion_cargo', id: 'CONDICION_SUPLENTE_NUEVO', name: 'Suplente nuevo', field: 'name', expected: { id: 'CONDICION_SUPLENTE_NUEVO', name: 'Suplente nuevo', active: true } },
    { entity: 'tipo_documento_identidad', id: 'TD_006', name: 'Documento especial', field: 'name', expected: { id: 'TD_006', name: 'Documento especial' } },
    { entity: 'tipo_telefono', id: 'SATELITAL', name: 'Teléfono satelital', field: 'nombre', expected: { id: 'SATELITAL', nombre: 'Teléfono satelital', active: true } }
  ];

  cases.forEach(item => {
    const payload = { entity: item.entity, action: 'create', id: item.id };
    payload[item.field] = item.name;
    fixture.call('savePersonnelTelephoneMaintenanceRecord(' + JSON.stringify(payload) + ')');
    assert.deepEqual(fixture.rows[item.entity].find(record => record.id === item.id), item.expected);
  });

  assert.deepEqual(
    fixture.writes.map(item => item.sheet),
    ['cargos', 'condicion_cargo', 'tipo_documento_identidad', 'tipo_telefono']
  );
  assert.ok(fixture.audit.every(item => item.accion === 'CREAR_CATALOGO_MANTENIMIENTO'));
});

test('rechaza códigos manuales, nombres vacíos y nombres duplicados antes de escribir', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'condicion_cargo',action:'create',id:'CUSTOM_01',name:'Nueva condición'})"),
    /código generado cambió/
  );
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_',name:' '})"),
    /Ingresa nombre/
  );
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_ASESOR_2',name:'Asesor'})"),
    /Ya existe un registro con ese nombre/
  );
  assert.equal(fixture.writes.length, 0);
});

test('edita el nombre sin permitir cambiar el identificador ni modificar active desde el formulario', () => {
  const fixture = makeMaintenanceSandbox();
  fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'edit',id:'CARGO_ASESOR',name:'Asesor principal'})");
  assert.deepEqual(fixture.rows.cargos[0], {
    id: 'CARGO_ASESOR',
    name: 'Asesor principal',
    active: true
  });
  assert.deepEqual(fixture.writes[0].updates, { name: 'Asesor principal' });
});

test('impide renombrar una condición de cargo si una asignación guarda su nombre', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'condicion_cargo',action:'edit',id:'CONDICION_TITULAR',name:'Titular designado'})"),
    /no se puede cambiar el nombre.*utilizada en asignaciones/i
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de cargos utilizados mediante asignaciones.cargo_id', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('cargos','CARGO_ASESOR')"),
    /utilizado en asignaciones/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de condiciones utilizadas mediante asignaciones.condicion_cargo', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('condicion_cargo','CONDICION_TITULAR')"),
    /utilizado en asignaciones/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de tipos de documento asociados a datos personales', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('tipo_documento_identidad','TD_001')"),
    /utilizado en servidores datos personales/
  );
  assert.equal(fixture.writes.length, 0);
});

test('permite eliminar tipo de documento sin referencias y registra datos de auditoría', () => {
  const fixture = makeMaintenanceSandbox({ datosPersonales: [] });
  const result = fixture.call("deletePersonnelTelephoneMaintenanceRecord('tipo_documento_identidad','TD_005')");
  assert.equal(result.success, true);
  assert.equal(fixture.rows.tipo_documento_identidad.some(item => item.id === 'TD_005'), false);
  assert.equal(fixture.writes[0].method, 'deleteRecord');
  assert.equal(fixture.audit[0].accion, 'ELIMINAR_CATALOGO_MANTENIMIENTO');
  assert.equal(fixture.audit[0].tipo_entidad, 'CATALOGO_MANTENIMIENTO');
});

test('el borrado de tipos de teléfono permanece bloqueado mientras no se conozca la relación de telefonos', () => {
  const fixture = makeMaintenanceSandbox();
  const data = fixture.call("getPersonnelTelephoneMaintenanceData('directorio-telefonico')");
  assert.equal(data.entities.tipo_telefono.capabilities.canDeletePermission, true);
  assert.equal(data.entities.tipo_telefono.capabilities.canDelete, false);
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('tipo_telefono','DIRECTO')"),
    /no se ha documentado la tabla que contiene las referencias/
  );
  assert.equal(fixture.writes.length, 0);
});

test('el estado se cambia mediante una operación independiente y se audita', () => {
  const fixture = makeMaintenanceSandbox();
  const result = fixture.call("setPersonnelTelephoneMaintenanceStatus('cargos','CARGO_ASESOR',false)");
  assert.equal(result.success, true);
  assert.equal(result.record.active, false);
  assert.equal(fixture.rows.cargos[0].active, false);
  assert.deepEqual(fixture.writes[0].updates, { active: false });
  assert.equal(fixture.audit[0].accion, 'CAMBIAR_ESTADO_CATALOGO_MANTENIMIENTO');
});

test('rechaza el cambio de estado cuando no existe permiso CAMBIAR_ESTADO', () => {
  const fixture = makeMaintenanceSandbox({
    allowedPermissions: [
      'MANTENIMIENTOS_VER',
      'MANTENIMIENTOS_CREAR',
      'MANTENIMIENTOS_EDITAR',
      'MANTENIMIENTOS_ELIMINAR'
    ]
  });
  assert.throws(
    () => fixture.call("setPersonnelTelephoneMaintenanceStatus('cargos','CARGO_ASESOR',false)"),
    /Permiso denegado/
  );
  assert.equal(fixture.writes.length, 0);
});

test('exige permiso efectivo y ámbito TOTAL exclusivo antes de consultar o escribir', () => {
  const noPermission = makeMaintenanceSandbox({
    allowedPermissions: ['MANTENIMIENTOS_VER']
  });
  assert.throws(
    () => noPermission.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_NUEVO',name:'Nuevo'})"),
    /Permiso denegado/
  );
  assert.equal(noPermission.batches.length, 0);
  assert.equal(noPermission.writes.length, 0);

  const noScope = makeMaintenanceSandbox({ globalScope: false });
  assert.throws(
    () => noScope.call("getPersonnelTelephoneMaintenanceData('datos-personal')"),
    /ámbito TOTAL autorizado/
  );
  assert.equal(noScope.batches.length, 0);
  assert.ok(noScope.audit.some(event => event.accion === 'AUTORIZACION_DENEGADA'));
});

test('la interfaz conserva una sola instantánea por grupo y los cambios de pestaña solo renderizan datos locales', () => {
  assert.match(uiSource, /data: null,\s*loadPromise: null/);
  assert.match(uiSource, /if \(current\.data\) return Promise\.resolve\(current\.data\)/);
  assert.match(uiSource, /if \(current\.data\) \{\s*renderActiveTab\(route\);\s*return;/);
  assert.match(uiSource, /onChange: function \(tabId\) \{\s*current\.activeTab = tabId;\s*renderActiveTab\(route\);/);
  assert.match(uiSource, /rpc\('getPersonnelTelephoneMaintenanceData', route\)/);
  assert.doesNotMatch(uiSource, /rpc\('getPersonnelTelephoneMaintenanceData', current\.activeTab\)/);
});

test('la tabla ofrece Editar, Eliminar e Historial y cambia Estado directamente en la celda', () => {
  assert.match(uiSource, /label: 'Editar'/);
  assert.match(uiSource, /label: 'Eliminar'/);
  assert.match(uiSource, /label: 'Historial'/);
  assert.match(uiSource, /window\.SUNARPAccessHistory\.open\(\s*'MANTENIMIENTO'/);
  assert.match(uiSource, /key: 'active',\s*label: 'Estado'/);
  assert.match(uiSource, /setPersonnelTelephoneMaintenanceStatus/);
});

test('el formulario no ofrece checkbox Activo y genera el código según el nombre', () => {
  assert.doesNotMatch(uiSource, /activeInput/);
  assert.doesNotMatch(uiSource, /name = 'active'/);
  assert.match(uiSource, /Código generado automáticamente/);
  assert.match(uiSource, /previewIdentifier\(data\.entity, nameInput\.value/);
  assert.match(uiSource, /nameInput\.addEventListener\('input', updateIdentifierPreview\)/);
});

test('el historial compartido acepta MANTENIMIENTO y GEOGRAFICO bajo MANTENIMIENTOS_VER', () => {
  assert.match(accessServiceSource, /MANTENIMIENTO:\s*\[/);
  assert.match(accessServiceSource, /GEOGRAFICO:\s*\['DEPARTAMENTO', 'PROVINCIA', 'DISTRITO'\]/);
  assert.match(accessServiceSource, /_accessRequirePermission_\('MANTENIMIENTOS_VER', 'MANTENIMIENTOS'\)/);
  assert.match(accessServiceSource, /eventModule !== 'MANTENIMIENTOS'/);
});

test('Ubicación geográfica también ofrece Historial y conserva protegida la eliminación de distritos', () => {
  assert.match(stagedUiSource, /label: 'Historial'/);
  assert.match(stagedUiSource, /'GEOGRAFICO'/);
  assert.match(stagedUiSource, /disabled: districtDeletionBlocked/);
});

test('la navegación del Gestor carga los scripts de mantenimiento sin incorporar lógica en Core/UI', () => {
  assert.match(indexSource, /include\('PersonnelTelephoneMaintenanceScripts'\)/);
  assert.match(uiSource, /SUNARPUI\.createDataTable/);
  assert.match(uiSource, /SUNARPUI\.createTabs/);
  assert.match(uiSource, /SUNARPUI\.openModal/);
  assert.match(uiSource, /beginSectionLoading/);
  assert.match(uiSource, /SUNARPUI\.createBadge/);
  assert.match(geographicServiceSource, /const operationIds = \['VER', 'CREAR', 'EDITAR', 'CAMBIAR_ESTADO', 'ELIMINAR'\]/);
  assert.match(geographicServiceSource, /ROL_EDITOR: \['VER', 'CREAR', 'EDITAR', 'CAMBIAR_ESTADO'\]/);
});
