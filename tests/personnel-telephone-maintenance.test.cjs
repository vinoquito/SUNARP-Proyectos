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

function makeMaintenanceSandbox(options) {
  options = options || {};
  const rows = {
    cargos: (options.cargos || [
      { id: 'CARGO_ASESOR', name: 'Asesor', active: true }
    ]).map(item => ({ ...item })),
    condicion_cargo: (options.condicion_cargo || [
      { id: 'CONDICION_TITULAR', name: 'Titular', active: true },
      { id: 'CONDICION_ENCARGADO', name: 'Encargado', active: true }
    ]).map(item => ({ ...item })),
    tipo_documento_identidad: (options.tipo_documento_identidad || [
      { id: 'TD_001', name: 'DNI' },
      { id: 'TD_002', name: 'Pasaporte' }
    ]).map(item => ({ ...item })),
    tipo_telefono: (options.tipo_telefono || [
      { id: 'CENTRAL_TELEFONICA', nombre: 'Central telefónica', active: true }
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
  let globalScope = options.globalScope !== false;
  const allowedPermissions = new Set(options.allowedPermissions || [
    'MANTENIMIENTOS_VER',
    'MANTENIMIENTOS_CREAR',
    'MANTENIMIENTOS_EDITAR',
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
      return { value: builder(), cacheHit: false, cacheStored: false };
    },
    listRecordsFromSources(requests) {
      const result = {};
      requests.forEach(request => {
        const name = request.source.sheetName;
        assert.ok(Object.prototype.hasOwnProperty.call(rows, name), 'La fuente maestra debe existir en el fixture.');
        const headers = request.requiredHeaders;
        rows[name].forEach(record => {
          headers.forEach(field => {
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
      assert.ok(Object.prototype.hasOwnProperty.call(rows, name));
      assert.equal(rows[name].some(item => String(item[idField]) === String(record[idField])), false);
      rows[name].push({ ...record });
      writes.push({ method: 'insertRecord', sheet: name, record: { ...record }, config });
      return { success: true, message: 'Registro insertado correctamente.' };
    },
    updateRecord(source, idField, id, updates) {
      const name = source.sheetName;
      const record = rows[name].find(item => String(item[idField]) === String(id));
      assert.ok(record);
      Object.assign(record, updates);
      writes.push({ method: 'updateRecord', sheet: name, id, updates: { ...updates } });
      return { success: true, message: 'Registro actualizado correctamente.' };
    },
    deleteRecord(source, idField, id) {
      const name = source.sheetName;
      const index = rows[name].findIndex(item => String(item[idField]) === String(id));
      assert.notEqual(index, -1);
      rows[name].splice(index, 1);
      writes.push({ method: 'deleteRecord', sheet: name, id });
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
      const result = callback();
      audit.push({
        ...event,
        resultado: 'OK',
        datos_despues: result && result.auditAfter !== undefined ? result.auditAfter : null
      });
      return result && Object.prototype.hasOwnProperty.call(result, 'value')
        ? result.value
        : result;
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
    call(expression) {
      return vm.runInContext(expression, sandbox);
    },
    setGlobalScope(value) {
      globalScope = value;
    }
  };
}

test('lee los cuatro catálogos maestros confirmados desde Global parameters con encabezados exactos', () => {
  const fixture = makeMaintenanceSandbox();
  const expected = [
    ['cargos', ['id', 'name', 'active']],
    ['condicion_cargo', ['id', 'name', 'active']],
    ['tipo_documento_identidad', ['id', 'name']],
    ['tipo_telefono', ['id', 'nombre', 'active']]
  ];

  expected.forEach(([entity, headers]) => {
    const loaded = fixture.call('getPersonnelTelephoneMaintenanceData(' + JSON.stringify(entity) + ')');
    assert.equal(loaded.entity, entity);
    assert.ok(loaded.records.length > 0);
    assert.ok(loaded.records.every(item => JSON.stringify(Object.keys(item)) === JSON.stringify(headers)));
    assert.ok(fixture.sourceReads.some(item => item.sources.includes(entity)));
  });
  assert.ok(fixture.sourceReads.every(item => item.ttl === undefined || item.ttl === 300));
});

test('tipo_telefono conserva el encabezado nombre y no lo convierte a name', () => {
  const fixture = makeMaintenanceSandbox();
  const loaded = fixture.call("getPersonnelTelephoneMaintenanceData('tipo_telefono')");
  assert.equal(loaded.nameField, 'nombre');
  assert.equal(loaded.records[0].nombre, 'Central telefónica');
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.records[0], 'name'), false);
});

test('tipo_documento_identidad no expone un campo active inexistente', () => {
  const fixture = makeMaintenanceSandbox();
  const loaded = fixture.call("getPersonnelTelephoneMaintenanceData('tipo_documento_identidad')");
  assert.equal(loaded.hasActive, false);
  assert.deepEqual(Object.keys(loaded.records[0]), ['id', 'name']);
});

test('crea cargos, condición, tipo de documento y tipo de teléfono en sus pestañas maestras exactas', () => {
  const fixture = makeMaintenanceSandbox();
  const cases = [
    { entity: 'cargos', id: 'CARGO_NUEVO', name: 'Especialista', active: true, field: 'name', expected: { id: 'CARGO_NUEVO', name: 'Especialista', active: true } },
    { entity: 'condicion_cargo', id: 'CONDICION_SUPLENTE', name: 'Suplente', active: true, field: 'name', expected: { id: 'CONDICION_SUPLENTE', name: 'Suplente', active: true } },
    { entity: 'tipo_documento_identidad', id: 'TD_003', name: 'Carné de extranjería', field: 'name', expected: { id: 'TD_003', name: 'Carné de extranjería' } },
    { entity: 'tipo_telefono', id: 'MOVIL', nombre: 'Teléfono móvil', active: true, field: 'nombre', expected: { id: 'MOVIL', nombre: 'Teléfono móvil', active: true } }
  ];

  cases.forEach(item => {
    const payload = { entity: item.entity, action: 'create', id: item.id };
    payload[item.field] = item[item.field];
    if (Object.prototype.hasOwnProperty.call(item, 'active')) payload.active = item.active;
    fixture.call('savePersonnelTelephoneMaintenanceRecord(' + JSON.stringify(payload) + ')');
    assert.deepEqual(fixture.rows[item.entity].find(record => record.id === item.id), item.expected);
  });

  assert.deepEqual(
    fixture.writes.map(item => item.sheet),
    ['cargos', 'condicion_cargo', 'tipo_documento_identidad', 'tipo_telefono']
  );
  assert.equal(fixture.writes[3].record.name, undefined);
  assert.ok(fixture.audit.every(item => item.accion === 'CREAR_CATALOGO_MANTENIMIENTO'));
});

test('edita el nombre y el estado booleano sin alterar el identificador', () => {
  const fixture = makeMaintenanceSandbox();
  fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'edit',id:'CARGO_ASESOR',name:'Asesor principal',active:false})");
  assert.deepEqual(fixture.rows.cargos[0], {
    id: 'CARGO_ASESOR',
    name: 'Asesor principal',
    active: false
  });
  assert.deepEqual(fixture.writes[0].updates, { name: 'Asesor principal', active: false });
});

test('el cambio de estado del tipo de documento no introduce una columna active', () => {
  const fixture = makeMaintenanceSandbox();
  fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'tipo_documento_identidad',action:'edit',id:'TD_002',name:'Pasaporte ordinario'})");
  assert.deepEqual(fixture.rows.tipo_documento_identidad[1], {
    id: 'TD_002',
    name: 'Pasaporte ordinario'
  });
  assert.deepEqual(fixture.writes[0].updates, { name: 'Pasaporte ordinario' });
});

test('rechaza identificadores duplicados, valores obligatorios ausentes y estados no booleanos', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_ASESOR',name:'Duplicado',active:true})"),
    /Ya existe el código/
  );
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_X',name:' ',active:true})"),
    /Ingresa nombre/
  );
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'tipo_telefono',action:'create',id:'EXT',nombre:'Extensión',active:'TRUE'})"),
    /verdadero o falso/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de cargos utilizados por asignaciones mediante cargo_id', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('cargos','CARGO_ASESOR')"),
    /utilizado en asignaciones/
  );
  assert.equal(fixture.writes.length, 0);
});

test('protege la eliminación de condiciones utilizadas en asignaciones por su valor funcional', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('condicion_cargo','CONDICION_TITULAR')"),
    /utilizado en asignaciones/
  );
  assert.equal(fixture.writes.length, 0);
});

test('impide renombrar una condición de cargo cuando existen asignaciones que almacenan su nombre', () => {
  const fixture = makeMaintenanceSandbox();
  assert.throws(
    () => fixture.call("savePersonnelTelephoneMaintenanceRecord({entity:'condicion_cargo',action:'edit',id:'CONDICION_TITULAR',name:'Titular designado',active:true})"),
    /no se puede cambiar el nombre.*utilizada en asignaciones/i
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

test('permite eliminar físicamente un catálogo sin referencias y registra auditoría', () => {
  const fixture = makeMaintenanceSandbox({
    asignaciones: [],
    datosPersonales: []
  });
  const result = fixture.call("deletePersonnelTelephoneMaintenanceRecord('tipo_documento_identidad','TD_002')");
  assert.equal(result.success, true);
  assert.equal(fixture.rows.tipo_documento_identidad.some(item => item.id === 'TD_002'), false);
  assert.equal(fixture.writes[0].method, 'deleteRecord');
  assert.equal(fixture.audit[0].accion, 'ELIMINAR_CATALOGO_MANTENIMIENTO');
});

test('no habilita el borrado de tipos de teléfono sin conocer el contrato de sus referencias', () => {
  const fixture = makeMaintenanceSandbox();
  const data = fixture.call("getPersonnelTelephoneMaintenanceData('tipo_telefono')");
  assert.equal(data.capabilities.canDelete, false);
  assert.throws(
    () => fixture.call("deletePersonnelTelephoneMaintenanceRecord('tipo_telefono','CENTRAL_TELEFONICA')"),
    /no se ha documentado la tabla que contiene las referencias/
  );
  assert.equal(fixture.writes.length, 0);
});

test('la autorización exige permiso efectivo y ámbito TOTAL exclusivo antes de leer fuentes', () => {
  const noPermission = makeMaintenanceSandbox({ allowedPermissions: ['MANTENIMIENTOS_VER'] });
  assert.throws(
    () => noPermission.call("savePersonnelTelephoneMaintenanceRecord({entity:'cargos',action:'create',id:'CARGO_X',name:'Nuevo',active:true})"),
    /Permiso denegado/
  );
  assert.equal(noPermission.sourceReads.length, 0);
  assert.equal(noPermission.writes.length, 0);

  const noGlobalScope = makeMaintenanceSandbox({ globalScope: false });
  assert.throws(
    () => noGlobalScope.call("getPersonnelTelephoneMaintenanceData('cargos')"),
    /ámbito TOTAL autorizado/
  );
  assert.equal(noGlobalScope.sourceReads.length, 0);
  assert.ok(noGlobalScope.audit.some(event => event.accion === 'AUTORIZACION_DENEGADA'));
});

test('no crea hojas, nombres de pestaña ni CRUD independientes para telefonos_ubicaciones', () => {
  assert.doesNotMatch(serviceSource, /sheetName:\s*['"]telefonos['"]/);
  assert.doesNotMatch(serviceSource, /telefonos_ubicaciones\s*:/);
  assert.match(uiSource, /El contrato físico de la tabla "telefonos"/);
  assert.match(uiSource, /telefonos_ubicaciones/);
});

test('la navegación conserva tres pestañas de Datos de personal y dos de Directorio telefónico', () => {
  assert.match(uiSource, /id: 'cargos', label: 'Cargos'/);
  assert.match(uiSource, /id: 'condicion_cargo', label: 'Condiciones de cargo'/);
  assert.match(uiSource, /id: 'tipo_documento_identidad', label: 'Tipos de documento de identidad'/);
  assert.match(uiSource, /id: 'tipo_telefono', label: 'Tipos de teléfono'/);
  assert.match(uiSource, /id: 'telefonos', label: 'Teléfonos'/);
  assert.match(indexSource, /include\('PersonnelTelephoneMaintenanceScripts'\)/);
  assert.match(stagedUiSource, /'datos-personal': \{/);
  assert.match(stagedUiSource, /'directorio-telefonico': \{/);
  assert.match(stagedUiSource, /if \(route === 'datos-personal' \|\| route === 'directorio-telefonico'\) return;/);
});

test('el formulario y la tabla usan búsqueda local, estado booleano y los controles de SUNARP UI', () => {
  assert.match(uiSource, /SUNARPUI\.createDataTable/);
  assert.match(uiSource, /search: true/);
  assert.match(uiSource, /pageSize: 10/);
  assert.match(uiSource, /SUNARPUI\.openModal/);
  assert.match(uiSource, /beginSectionLoading/);
  assert.match(uiSource, /activeInput\.checked = editing \? isActive\(record\.active\) : true/);
});
