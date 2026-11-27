'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const geoServiceSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/GeographicMaintenanceService.js'),
  'utf8'
);
const geoUiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/GeographicMaintenanceScripts.html'),
  'utf8'
);
const maintenanceViewSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/ViewMantenimientos.html'),
  'utf8'
);
const navigationSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/Código.js'),
  'utf8'
);
const accessSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js'),
  'utf8'
);
const appConfigSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AppConfig.js'),
  'utf8'
);

function makeGeoSandbox(options = {}) {
  const rows = {
    departments: (options.departments || [
      { id: '01', name: 'Lima' },
      { id: '02', name: 'Arequipa' }
    ]).map(item => ({ ...item })),
    provinces: (options.provinces || [
      { id: '0101', name: 'Lima', id_departamento: '01' },
      { id: '0102', name: 'Huaral', id_departamento: '01' },
      { id: '0201', name: 'Arequipa', id_departamento: '02' }
    ]).map(item => ({ ...item })),
    districts: (options.districts || [
      { id: '010101', name: 'Miraflores', id_provincia: '0101' },
      { id: '010102', name: 'San Isidro', id_provincia: '0101' },
      { id: '010201', name: 'Huaral', id_provincia: '0102' }
    ]).map(item => ({ ...item }))
  };

  const sheetNames = {
    departments: 'departamento',
    provinces: 'provincia',
    districts: 'distrito'
  };
  const fields = {
    departments: ['id', 'name'],
    provinces: ['id', 'name', 'id_departamento'],
    districts: ['id', 'name', 'id_provincia']
  };
  const audit = [];
  const sourceReads = [];
  const writes = [];
  let globalScope = options.globalScope !== false;
  const permitted = new Set(['VER', 'CREAR', 'EDITAR', 'ELIMINAR']);
  const auth = {
    authenticated: true,
    personaId: 'PER_TEST',
    email: 'prueba@sunarp.gob.pe',
    modules: [{
      modulo_id: 'MOD_MANTENIMIENTOS',
      codigo: 'MANTENIMIENTOS',
      active: true
    }],
    moduleAccess: [{
      modulo_id: 'MOD_MANTENIMIENTOS',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
    }]
  };

  const sheets = {};
  Object.keys(rows).forEach(key => {
    sheets[sheetNames[key]] = {
      getLastColumn() {
        return fields[key].length;
      },
      getLastRow() {
        return rows[key].length + 1;
      },
      getRange(startRow, startColumn, numRows, numColumns) {
        return {
          getDisplayValues() {
            const all = [
              fields[key],
              ...rows[key].map(record =>
                fields[key].map(field => String(record[field] ?? ''))
              )
            ];
            return all.slice(startRow - 1, startRow - 1 + numRows)
              .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
          }
        };
      }
    };
  });

  const core = {
    getOrBuildCachedValue(key, sources, builder, ttl) {
      sourceReads.push({ key, sources: Array.from(sources, source => source.sheetName), ttl });
      return { value: builder(), cacheHit: false, cacheStored: false };
    },
    listRecordsFromSources(requests) {
      const result = {};
      requests.forEach(request => {
        assert.equal(request.valueMode, 'display', 'Los catálogos deben leerse con valores visibles.');
        assert.deepEqual(Array.from(request.requiredHeaders), request.key === 'departments'
          ? ['id', 'name']
          : request.key === 'provinces'
            ? ['id', 'name', 'id_departamento']
            : ['id', 'name', 'id_provincia']);
        const entity = Object.keys(sheetNames).find(key => sheetNames[key] === request.source.sheetName);
        assert.ok(entity);
        result[request.key] = rows[entity].map(record => ({ ...record }));
      });
      return result;
    },
    authorizationHasPermission(context, code, moduleId) {
      const operation = String(code).replace(/^MANTENIMIENTOS_/, '');
      return moduleId === 'MOD_MANTENIMIENTOS' && permitted.has(operation);
    },
    authorizationIsRecordInScope() {
      return globalScope;
    },
    insertRecord(source, record, config) {
      const entity = Object.keys(sheetNames).find(key => sheetNames[key] === source.sheetName);
      assert.ok(entity, 'La escritura debe dirigirse a un catálogo maestro conocido.');
      const idField = config && config.idField || 'id';
      assert.equal(rows[entity].some(item => item[idField] === record[idField]), false);
      rows[entity].push({ ...record });
      writes.push({ method: 'insertRecord', sheet: source.sheetName, record: { ...record }, config });
      return { success: true };
    },
    updateRecord(source, idField, id, updates) {
      const entity = Object.keys(sheetNames).find(key => sheetNames[key] === source.sheetName);
      const record = rows[entity].find(item => String(item[idField]) === String(id));
      assert.ok(record, 'El registro a actualizar debe existir.');
      Object.assign(record, updates);
      writes.push({ method: 'updateRecord', sheet: source.sheetName, id, updates: { ...updates } });
      return { success: true };
    },
    deleteRecord(source, idField, id) {
      const entity = Object.keys(sheetNames).find(key => sheetNames[key] === source.sheetName);
      const index = rows[entity].findIndex(item => String(item[idField]) === String(id));
      assert.notEqual(index, -1);
      rows[entity].splice(index, 1);
      writes.push({ method: 'deleteRecord', sheet: source.sheetName, id });
      return { success: true };
    }
  };

  const sandbox = {
    console,
    SUNARPCore: core,
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, 'MASTER_DATA_TEST');
        return {
          getSheetByName(name) {
            return sheets[name] || null;
          }
        };
      }
    },
    getIntranetDataSource(sourceKey, sheetName, headerRow) {
      assert.equal(sourceKey, 'MASTER_DATA');
      assert.equal(headerRow, 1);
      return { spreadsheetId: 'MASTER_DATA_TEST', sheetName };
    },
    _accessRequirePermission_(code, moduleCode) {
      assert.equal(moduleCode, 'MANTENIMIENTOS');
      const operation = String(code).replace(/^MANTENIMIENTOS_/, '');
      if (!permitted.has(operation)) throw new Error('Permiso denegado.');
      return auth;
    },
    _accessResolveModuleId_(_auth, moduleCode) {
      assert.equal(moduleCode, 'MANTENIMIENTOS');
      return 'MOD_MANTENIMIENTOS';
    },
    _accessGetModuleAccess_(_auth, moduleId) {
      return auth.moduleAccess.find(item => item.modulo_id === moduleId) || null;
    },
    _accessWriteAudit_(_auth, event) {
      audit.push({ ...event });
    },
    _accessRunAudited_(_auth, event, callback) {
      audit.push({ ...event });
      const result = callback();
      if (result && Object.prototype.hasOwnProperty.call(result, 'auditAfter')) {
        audit[audit.length - 1].datos_despues = result.auditAfter;
      }
      return result && Object.prototype.hasOwnProperty.call(result, 'value')
        ? result.value
        : result;
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(geoServiceSource, sandbox, { filename: 'GeographicMaintenanceService.js' });

  return {
    sandbox,
    rows,
    audit,
    sourceReads,
    writes,
    setGlobalScope(value) {
      globalScope = value;
    },
    call(expression) {
      return vm.runInContext(expression, sandbox);
    }
  };
}

test('la navegación agrega un único nodo y exactamente los cinco grupos acordados', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(navigationSource, sandbox, { filename: 'Código.js' });
  const items = Array.from(sandbox._mergeMaintenanceNavigationItems_([]));

  const parent = items.filter(item => item.label === 'Módulos de mantenimiento');
  assert.equal(parent.length, 1);
  const children = items.filter(item => item.parentId === parent[0].id);
  assert.deepEqual(
    children.map(item => item.label),
    [
      'Ubicación geográfica',
      'Sedes y locales',
      'Organización institucional',
      'Datos de personal',
      'Directorio telefónico'
    ]
  );
  assert.deepEqual(
    children.map(item => item.route),
    [
      'ubicacion-geografica',
      'sedes-locales',
      'organizacion-institucional',
      'datos-personal',
      'directorio-telefonico'
    ]
  );
  assert.ok(children.every(item => item.permissionCode === 'MANTENIMIENTOS_VER'));
  assert.equal(parent[0].permissionCode, 'MANTENIMIENTOS_VER');
});

test('el shell conserva el control de permiso MANTENIMIENTOS_VER para padre e hijos', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(navigationSource, sandbox, { filename: 'Código.js' });

  const sourceItems = [
    { id: 'CONTENIDOS', parentId: '', label: 'Gestión de contenidos', route: '', order: 1, permissionCode: '' },
    { id: 'INFORMACION_PERSONAL', parentId: 'CONTENIDOS', label: 'Información de personal', route: 'informacion-personal', order: 2, permissionCode: 'INFORMACION_PERSONAL_VER' },
    { id: 'MANTENIMIENTOS', parentId: '', label: 'Módulos de mantenimiento', route: '', order: 25, permissionCode: '' },
    { id: 'UBICACION_GEOGRAFICA', parentId: 'MANTENIMIENTOS', label: 'Ubicación geográfica', route: 'ubicacion-geografica', order: 26, permissionCode: '' },
    { id: 'SEDES_LOCALES', parentId: 'MANTENIMIENTOS', label: 'Sedes y locales', route: 'sedes-locales', order: 27, permissionCode: '' },
    { id: 'ORGANIZACION_INSTITUCIONAL', parentId: 'MANTENIMIENTOS', label: 'Organización institucional', route: 'organizacion-institucional', order: 28, permissionCode: '' },
    { id: 'DATOS_PERSONAL', parentId: 'MANTENIMIENTOS', label: 'Datos de personal', route: 'datos-personal', order: 29, permissionCode: '' },
    { id: 'DIRECTORIO_TELEFONICO', parentId: 'MANTENIMIENTOS', label: 'Directorio telefónico', route: 'directorio-telefonico', order: 30, permissionCode: '' }
  ];

  sandbox.getAuthContext_ = () => ({ authenticated: true });
  sandbox.getNavigationItems_ = () => sourceItems.map(item => ({ ...item }));
  sandbox._accessIsGlobalAdministrator_ = () => false;
  sandbox.hasPermission_ = (_auth, code) => code === 'MANTENIMIENTOS_VER';

  const config = sandbox.getAppShellConfig();
  const navigation = Array.from(config.navigation);
  const maintenance = navigation.filter(item =>
    item.id === 'MANTENIMIENTOS' || item.parentId === 'MANTENIMIENTOS'
  );

  assert.equal(maintenance.length, 6);
  assert.deepEqual(
    maintenance.filter(item => item.parentId === 'MANTENIMIENTOS').map(item => item.route),
    [
      'ubicacion-geografica',
      'sedes-locales',
      'organizacion-institucional',
      'datos-personal',
      'directorio-telefonico'
    ]
  );

  sandbox.hasPermission_ = () => false;
  const denied = sandbox.getAppShellConfig();
  assert.equal(
    Array.from(denied.navigation).some(item => item.id === 'MANTENIMIENTOS'),
    false
  );
  assert.equal(
    Array.from(denied.navigation).some(item => item.parentId === 'MANTENIMIENTOS'),
    false
  );
});

test('la ruta datos-personal coincide entre Menu, el evento de navegación y la vista', () => {
  assert.match(navigationSource, /route: 'datos-personal'/);
  assert.match(geoUiSource, /'datos-personal': \{/);
  assert.match(maintenanceViewSource, /data-app-view="datos-personal"/);
  assert.doesNotMatch(geoUiSource, /datos-de-personal/);
  assert.doesNotMatch(maintenanceViewSource, /datos-de-personal/);
});

test('los catálogos de personal del Directorio conservan dependencia de Global parameters', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(appConfigSource, sandbox, { filename: 'AppConfig.js' });
  const dependencies = JSON.parse(JSON.stringify(vm.runInContext('INTRANET_SOURCE_DEPENDENCIES.DIRECTORY', sandbox)));

  assert.deepEqual(
    dependencies.tipo_documento_identidad,
    [['MASTER_DATA', 'tipo_documento_identidad']]
  );
  assert.deepEqual(
    dependencies.condicion_cargo,
    [['MASTER_DATA', 'condicion_cargo']]
  );
  assert.deepEqual(
    dependencies.cargos,
    [['MASTER_DATA', 'cargos']]
  );
});

test('la pantalla geográfica solo contiene tres pestañas CRUD y los otros grupos no exponen acciones CRUD simuladas', () => {
  assert.match(geoUiSource, /const geoTabs = \[\s*\{ id: 'departments', label: 'Departamentos' \},\s*\{ id: 'provinces', label: 'Provincias' \},\s*\{ id: 'districts', label: 'Distritos' \}/);
  assert.match(geoUiSource, /function initializeStagedGroup\(route\)/);
  assert.match(geoUiSource, /este mantenimiento se desarrollará en una etapa posterior/);
  assert.match(geoUiSource, /SUNARPUI\.createTabs/);
  assert.match(geoUiSource, /SUNARPUI\.createDataTable/);
  assert.match(geoUiSource, /SUNARPUI\.openModal/);
  assert.match(geoUiSource, /beginSectionLoading/);
});

test('la consulta usa las tres pestañas maestras singulares y conserva códigos con ceros iniciales', () => {
  const fixture = makeGeoSandbox();
  const data = fixture.call('getGeographicMaintenanceData()');

  assert.equal(data.departments[0].id, '01');
  assert.equal(data.provinces[0].id, '0101');
  assert.equal(data.districts[0].id, '010101');
  assert.equal(data.districts[0].provincia, 'Lima');
  assert.equal(data.districts[0].departamento, 'Lima');
  assert.equal(data.districts[0].provincia_departamento, 'Lima — Lima');
  assert.deepEqual(
    fixture.sourceReads[0].sources,
    ['departamento', 'provincia', 'distrito']
  );
  assert.equal(fixture.sourceReads[0].ttl, 300);
});

test('registrar provincia exige código UBIGEO oficial con prefijo de departamento y escribe en la fuente maestra', () => {
  const fixture = makeGeoSandbox();
  const result = fixture.call(
    "saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'0103',name:'Cañete',id_departamento:'01'})"
  );

  assert.equal(result.id, '0103');
  assert.deepEqual(fixture.rows.provinces.at(-1), {
    id: '0103',
    name: 'Cañete',
    id_departamento: '01'
  });
  assert.equal(fixture.writes.at(-1).method, 'insertRecord');
  assert.equal(fixture.writes.at(-1).sheet, 'provincia');
  assert.ok(fixture.audit.some(event => event.accion === 'CREAR_CATALOGO_GEOGRAFICO'));
});

test('registrar distrito exige código UBIGEO y únicamente provincia; deriva departamento por la relación', () => {
  const fixture = makeGeoSandbox();
  const result = fixture.call(
    "saveGeographicCatalogRecord({entity:'districts',action:'create',id:'010202',name:'Chancay',id_provincia:'0102'})"
  );

  assert.equal(result.id, '010202');
  assert.deepEqual(fixture.rows.districts.at(-1), {
    id: '010202',
    name: 'Chancay',
    id_provincia: '0102'
  });
  assert.equal(Object.hasOwn(fixture.rows.districts.at(-1), 'id_departamento'), false);
  assert.equal(fixture.writes.at(-1).sheet, 'distrito');
});

test('rechaza provincia o distrito sin padre existente', () => {
  const fixture = makeGeoSandbox();
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'0103',name:'Nueva'})"),
    /Selecciona el departamento/
  );
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'9901',name:'Nueva',id_departamento:'99'})"),
    /departamento seleccionado no existe/
  );
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'districts',action:'create',id:'999901',name:'Nuevo',id_provincia:'9999'})"),
    /provincia seleccionada no existe/
  );
  assert.equal(fixture.writes.length, 0);
});

test('editar provincia conserva el padre y rechaza cambios de jerarquía', () => {
  const fixture = makeGeoSandbox();
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'provinces',action:'edit',id:'0101',name:'Lima Metropolitana',id_departamento:'02'})"),
    /no se puede cambiar el nivel superior/i
  );
  fixture.call(
    "saveGeographicCatalogRecord({entity:'provinces',action:'edit',id:'0101',name:'Lima Metropolitana',id_departamento:'01'})"
  );
  assert.equal(fixture.rows.provinces[0].name, 'Lima Metropolitana');
  assert.equal(fixture.rows.provinces[0].id_departamento, '01');
  assert.equal(fixture.writes.at(-1).method, 'updateRecord');
});

test('rechaza nombres duplicados dentro de un mismo padre sin afectar otros padres', () => {
  const fixture = makeGeoSandbox();
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'0103',name:'lima',id_departamento:'01'})"),
    /Ya existe un registro/
  );
  fixture.call(
    "saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'0202',name:'Lima',id_departamento:'02'})"
  );
  assert.equal(fixture.rows.provinces.at(-1).id, '0202');
});

test('protege la eliminación de departamentos y provincias con dependencias', () => {
  const fixture = makeGeoSandbox();
  assert.throws(
    () => fixture.call("deleteGeographicCatalogRecord('departments','01')"),
    /tiene provincias relacionadas/
  );
  assert.throws(
    () => fixture.call("deleteGeographicCatalogRecord('provinces','0101')"),
    /tiene distritos relacionados/
  );
  assert.equal(fixture.writes.length, 0);
});

test('bloquea la eliminación de distritos hasta verificar referencias de Agentes SUNARP', () => {
  const fixture = makeGeoSandbox();
  const data = fixture.call('getGeographicMaintenanceData()');
  assert.equal(data.capabilities.canDelete, true);
  assert.equal(data.capabilities.canDeleteDistricts, false);
  assert.throws(
    () => fixture.call("deleteGeographicCatalogRecord('districts','010101')"),
    /Agentes SUNARP conserva referencias distrito_id/
  );
  assert.equal(fixture.writes.length, 0);
});

test('rechaza catálogos existentes con relaciones huérfanas o identificadores duplicados', () => {
  const orphan = makeGeoSandbox({
    provinces: [
      { id: '9901', name: 'Provincia huérfana', id_departamento: '99' }
    ]
  });
  assert.throws(
    () => orphan.call('getGeographicMaintenanceData()'),
    /referencia un departamento inexistente/
  );

  const duplicate = makeGeoSandbox({
    departments: [
      { id: '01', name: 'Lima' },
      { id: '01', name: 'Lima duplicada' }
    ]
  });
  assert.throws(
    () => duplicate.call('getGeographicMaintenanceData()'),
    /está duplicado en la pestaña "departamento"/
  );
});

test('backend exige permiso y ámbito TOTAL antes de consultar o modificar fuentes', () => {
  const fixture = makeGeoSandbox({ globalScope: false });
  assert.throws(
    () => fixture.call('getGeographicMaintenanceData()'),
    /ámbito TOTAL autorizado/
  );
  assert.equal(fixture.sourceReads.length, 0);
  assert.ok(fixture.audit.some(event => event.accion === 'AUTORIZACION_DENEGADA'));
});

test('hasPermission_ exige permiso MANTENIMIENTOS y ámbito global sin alterar la autorización de otros módulos', () => {
  let globalScope = false;
  const sandbox = {
    SUNARPCore: {
      authorizationHasPermission() { return true; },
      authorizationIsRecordInScope() { return globalScope; }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(accessSource, sandbox, { filename: 'AccessManagementService.js' });

  const auth = {
    authenticated: true,
    modules: [{
      modulo_id: 'MOD_MANTENIMIENTOS',
      codigo: 'MANTENIMIENTOS',
      active: true
    }, {
      modulo_id: 'MOD_INFO_PERSONAL',
      codigo: 'INFORMACION_PERSONAL',
      active: true
    }],
    moduleAccess: [{
      modulo_id: 'MOD_MANTENIMIENTOS',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
    }, {
      modulo_id: 'MOD_INFO_PERSONAL',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
    }],
    permissionsCatalog: [{
      codigo: 'MANTENIMIENTOS_VER',
      modulo_id: 'MOD_MANTENIMIENTOS',
      active: true
    }, {
      codigo: 'INFORMACION_PERSONAL_VER',
      modulo_id: 'MOD_INFO_PERSONAL',
      active: true
    }]
  };

  assert.equal(sandbox.hasPermission_(auth, 'MANTENIMIENTOS_VER'), false);
  globalScope = true;
  assert.equal(sandbox.hasPermission_(auth, 'MANTENIMIENTOS_VER'), true);
  auth.moduleAccess[0].scopes.push({
    tipo_ambito_id: 'SEDE',
    referencia_id: 'SEDE_01'
  });
  assert.equal(sandbox.hasPermission_(auth, 'MANTENIMIENTOS_VER'), false);
  auth.moduleAccess[0].scopes.pop();
  assert.equal(sandbox.hasPermission_(auth, 'INFORMACION_PERSONAL_VER'), true);
});

test('la pantalla de distritos muestra provincia y departamento en el selector, pero envía solo id_provincia', () => {
  assert.match(geoUiSource, /value: item\.id,\s*label: item\.name \+ ' — ' \+ departments\.get\(item\.id_departamento\)/);
  assert.match(geoUiSource, /tab === 'districts'\s*\?\s*'id_provincia'/);
  assert.doesNotMatch(geoUiSource, /payload\.id_departamento\s*=/);
});

test('normaliza códigos numéricos devueltos por SUNARP Core v16 sin perder ceros iniciales UBIGEO', () => {
  const fixture = makeGeoSandbox({
    departments: [{ id: 1, name: 'Lima' }],
    provinces: [{ id: 101, name: 'Lima', id_departamento: 1 }],
    districts: [{ id: 10101, name: 'Miraflores', id_provincia: 101 }]
  });
  const data = fixture.call('getGeographicMaintenanceData()');

  assert.equal(data.departments[0].id, '01');
  assert.equal(data.provinces[0].id, '0101');
  assert.equal(data.provinces[0].id_departamento, '01');
  assert.equal(data.districts[0].id, '010101');
  assert.equal(data.districts[0].id_provincia, '0101');
});

test('rechaza códigos UBIGEO ausentes, con longitud incorrecta o prefijo distinto del padre', () => {
  const fixture = makeGeoSandbox();
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'departments',action:'create',name:'Tacna'})"),
    /Ingresa el código UBIGEO/
  );
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'departments',action:'create',id:'9',name:'Tacna'})"),
    /exactamente 2 dígitos/
  );
  assert.throws(
    () => fixture.call("saveGeographicCatalogRecord({entity:'provinces',action:'create',id:'0202',name:'Nueva provincia',id_departamento:'01'})"),
    /debe comenzar con el código de su departamento/
  );
  assert.equal(fixture.writes.length, 0);
});

test('la interfaz exige código UBIGEO al crear y lo vuelve inmutable al editar', () => {
  assert.match(geoUiSource, /const codeField = geoField\('Código UBIGEO'/);
  assert.match(geoUiSource, /codeField\.input\.readOnly = true/);
  assert.match(geoUiSource, /El sistema no inventa ni asigna códigos automáticamente/);
  assert.match(geoUiSource, /id: editing \? record\.id : codeField\.input\.value\.trim\(\)/);
});

