const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryService.js');
const frontendPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryScripts.html');
const coreTestsPath = path.join(root, 'Backend/SUNARP Core/DataCoreTests.js');
const coreRepositoryPath = path.join(root, 'Backend/SUNARP Core/DataRepository.js');
const uiDataTablePath = path.join(root, 'Backend/SUNARP UI/UIDataTableScripts.html');

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const accessServicePath = path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js');
const accessServiceSource = fs.readFileSync(accessServicePath, 'utf8');
const frontendSource = fs.readFileSync(frontendPath, 'utf8');
const coreTestsSource = fs.readFileSync(coreTestsPath, 'utf8');
const coreRepositorySource = fs.readFileSync(coreRepositoryPath, 'utf8');
const uiDataTableSource = fs.readFileSync(uiDataTablePath, 'utf8');

const scriptStart = frontendSource.split('<script>')[1];
assert.ok(scriptStart, 'DirectoryScripts.html debe contener el bloque JavaScript principal');
const frontendScript = scriptStart.split('</script>')[0];

const sandbox = vm.createContext({});
vm.runInContext(
  serviceSource + String.fromCharCode(10) + 'this.directoryTestApi = {' +
    'normalizeDocument: _directoryNormalizeDocument_,' +
    'normalizeDate: _directoryNormalizeDateInput_,' +
    'assertDocumentAvailable: _directoryAssertDocumentAvailable_,' +
    'generateId: _directoryGenerateId_,' +
    'getNextOrder: _directoryGetNextOrder_,' +
    'normalizeInteger: _directoryNormalizeInteger_,' +
    'normalizeBoolean: _directoryNormalizeBoolean_,' +
    'resolveAssignmentLocation: _directoryResolveAssignmentLocation_,' +
    'validateSnapshot: _directoryValidateSnapshot_,' +
    'assignmentSchema: _directoryGetAssignmentSchema_,' +
    'enrichAssignment: _directoryEnrichAssignment_,' +
    'buildView: _directoryBuildView_,' +
    'createPersonalDataMap: _directoryCreatePersonalDataMap_,' +
    'resolveDocumentTypesSource: _directoryResolveDocumentTypesSource_,' +
    'buildFilterContract: _directoryBuildFilterContract_,' +
    'sortAssignments: _directorySortAssignments_,' +
    'getAuthorizedSedeIds: _directoryGetAuthorizedSedeIds_,' +
    'buildAssignmentQuery: _directoryBuildAssignmentQuery_,' +
    'executeAssignmentQuery: _directoryExecuteAssignmentQuery_' +
  '};',
  sandbox,
  { filename: 'DirectoryService.js' }
);

const api = sandbox.directoryTestApi;

function extractFrontendFunction(functionName) {
  const start = frontendScript.indexOf('function ' + functionName + '(');
  if (start < 0) return '';
  const bodyStart = frontendScript.indexOf('{', start);
  if (bodyStart < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < frontendScript.length; index++) {
    const current = frontendScript[index];
    const next = frontendScript[index + 1];
    if (lineComment) {
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === '\\') {
        escaped = true;
        continue;
      }
      if (current === quote) quote = '';
      continue;
    }
    if (current === '/' && next === '/') {
      lineComment = true;
      index++;
      continue;
    }
    if (current === '/' && next === '*') {
      blockComment = true;
      index++;
      continue;
    }
    if (current === "'" || current === '"' || current === String.fromCharCode(96)) {
      quote = current;
      continue;
    }
    if (current === '{') depth++;
    else if (current === '}') {
      depth--;
      if (depth === 0) return frontendScript.slice(start, index + 1);
    }
  }
  return '';
}
const hierarchyIndexSource = extractFrontendFunction('_directoryBuildHierarchyClientIndex_');
const hierarchySubtreeSource = extractFrontendFunction('_directoryMatchesHierarchySubtree_');
assert.ok(hierarchyIndexSource, 'El frontend debe precalcular sus índices jerárquicos por sede');
assert.ok(hierarchySubtreeSource, 'El frontend debe resolver pertenencia a subárbol mediante índice');
const hierarchyIndexSandbox = vm.createContext({});
vm.runInContext(
  hierarchyIndexSource + '\n' + hierarchySubtreeSource +
    '\nthis.buildIndex = _directoryBuildHierarchyClientIndex_;' +
    '\nthis.matchesSubtree = _directoryMatchesHierarchySubtree_;',
  hierarchyIndexSandbox,
  { filename: 'DirectoryHierarchyIndex.js' }
);

const hierarchyHelperMatch = frontendScript.match(/function _directoryBuildHierarchyFilterSets_\([\s\S]*?\n  \}/);
assert.ok(hierarchyHelperMatch, 'El frontend debe calcular las rutas de estructuras con asignaciones autorizadas');
const hierarchyChildrenSource = extractFrontendFunction('_directoryGetSelectableHierarchyChildren_');
const hierarchyScopeRootsSource = extractFrontendFunction('_directoryGetHierarchyScopeRoots_');
assert.ok(hierarchyChildrenSource, 'El frontend debe resolver únicamente hijos jerárquicos directos');
assert.ok(hierarchyScopeRootsSource, 'El frontend debe resolver las raíces orgánicas de cada ámbito');
const hierarchySandbox = vm.createContext({});
vm.runInContext(
  hierarchyHelperMatch[0] + '\n' + hierarchyChildrenSource +
    '\n' + hierarchySubtreeSource + '\n' + hierarchyScopeRootsSource +
    '\nthis.buildHierarchyFilterSets = _directoryBuildHierarchyFilterSets_;' +
    '\nthis.getSelectableChildren = _directoryGetSelectableHierarchyChildren_;' +
    '\nthis.getHierarchyScopeRoots = _directoryGetHierarchyScopeRoots_;',
  hierarchySandbox,
  { filename: 'DirectoryHierarchyFilters.js' }
);

test('los filtros conservan ancestros intermedios y mantienen raíces reales independientes', () => {
  const structures = [
    { id: 'GG', name: 'Gerencia General', parent_id: '', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_INT', name: 'UF Integridad', parent_id: 'GG', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_GD', name: 'UF Gestión Documental', parent_id: 'GG', sede_id: 'SEDE_A', order: 2 },
    { id: 'TD', name: 'Trámite Documentario', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 1 },
    { id: 'AC', name: 'Archivo Central', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 2 },
    { id: 'DTR', name: 'Dirección Técnica Registral', parent_id: '', sede_id: 'SEDE_A', order: 2 },
    { id: 'OTHER_SITE', name: 'Órgano de otra sede', parent_id: '', sede_id: 'SEDE_B', order: 1 }
  ];
  const records = [
    { estructura_id: 'GG', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'UF_INT', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'TD', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'AC', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'DTR', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'OTHER_SITE', filter_sede_id: 'SEDE_B', filter_local_id: 'LOCAL_B' }
  ];
  const ids = hierarchySandbox.buildHierarchyFilterSets(records, structures, { scopes: [{ type: 'SEDE', referenceId: 'SEDE_A', includeDescendants: false }] }, 'SEDE_A');
  assert.deepEqual([...ids].sort(), ['AC', 'DTR', 'GG', 'TD', 'UF_GD', 'UF_INT']);
  assert.equal(ids.has('UF_GD'), true, 'La dependencia intermedia se conserva porque contiene asignaciones autorizadas en sus descendientes');
  const hierarchyIndex = hierarchyIndexSandbox.buildIndex(records, structures);
  assert.deepEqual(
    Array.from(hierarchySandbox.getSelectableChildren('GG', hierarchyIndex, ids), node => node.id),
    ['UF_INT', 'UF_GD'],
    'Después de Gerencia General solo aparecen sus hijos directos'
  );
  assert.deepEqual(
    Array.from(hierarchySandbox.getSelectableChildren('UF_GD', hierarchyIndex, ids), node => node.id),
    ['TD', 'AC'],
    'Trámite Documentario y Archivo Central aparecen un nivel debajo de Unidad Funcional de Gestión Documental'
  );
  assert.equal(ids.has('DTR'), true, 'La raíz independiente puede aparecer en el nivel raíz si tiene asignaciones propias');
  assert.equal(structures.find(node => node.id === 'DTR').parent_id, '', 'Dirección Técnica Registral no pertenece a Gerencia General');
  assert.equal(ids.has('OTHER_SITE'), false);
});

test('la cascada se activa solo con herencia del ámbito y omite el nodo raíz ya autorizado', () => {
  const structures = [
    { id: 'SITE_ROOT', parent_id: '', sede_id: 'SEDE_A' },
    { id: 'ZR_I', parent_id: 'SITE_ROOT', sede_id: 'SEDE_A' },
    { id: 'AREA_A', parent_id: 'ZR_I', sede_id: 'SEDE_A' },
    { id: 'AREA_B', parent_id: 'ZR_I', sede_id: 'SEDE_A' },
    { id: 'SIBLING', parent_id: 'SITE_ROOT', sede_id: 'SEDE_A' }
  ];
  const records = [
    { estructura_id: 'ZR_I', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'AREA_A', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'AREA_B', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'SIBLING', filter_sede_id: 'SEDE_A' }
  ];
  const inherited = hierarchySandbox.buildHierarchyFilterSets(
    records, structures,
    { scopes: [{ type: 'ESTRUCTURA_ORG', referenceId: 'ZR_I', includeDescendants: true }] },
    'SEDE_A'
  );
  assert.deepEqual([...inherited].sort(), ['AREA_A', 'AREA_B', 'ZR_I']);
  const fixedUnit = hierarchySandbox.buildHierarchyFilterSets(
    records, structures,
    { scopes: [{ type: 'ESTRUCTURA_ORG', referenceId: 'AREA_A', includeDescendants: false }] },
    'SEDE_A'
  );
  assert.deepEqual([...fixedUnit], ['AREA_A'], 'La unidad terminal queda identificada como raíz implícita, pero no genera un selector orgánico');
  const wholeSite = hierarchySandbox.buildHierarchyFilterSets(
    records, structures,
    { scopes: [{ type: 'SEDE', referenceId: 'SEDE_A', includeDescendants: false }] },
    'SEDE_A'
  );
  assert.deepEqual([...wholeSite].sort(), ['AREA_A', 'AREA_B', 'SIBLING', 'SITE_ROOT', 'ZR_I']);
});



test('el ámbito TOTAL exige elegir sede y no carga registros agregados al entrar', () => {
  const loadStart = frontendSource.indexOf('async function load(force = false)');
  const loadEnd = frontendSource.indexOf('/* =====================================================\n     15. NAVEGACIÓN', loadStart);
  const load = frontendSource.slice(loadStart, loadEnd);
  const siteFilterStart = frontendSource.indexOf('function populateSedeFilter()');
  const siteFilterEnd = frontendSource.indexOf('function populateCargoFilter()', siteFilterStart);
  const siteFilter = frontendSource.slice(siteFilterStart, siteFilterEnd);
  const siteChangeStart = frontendSource.indexOf('function bindEvents()');
  const siteChangeEnd = frontendSource.indexOf('function clearDirectoryTable(', siteChangeStart);
  const siteChange = frontendSource.slice(siteChangeStart, siteChangeEnd);

  assert.ok(load.includes('state.hasTotalScope = Boolean(result.scopeSummary && result.scopeSummary.total === true)'));
  assert.ok(load.includes('populateSedeFilter();'));
  assert.ok(load.includes('if (!state.hasTotalScope && state.authorizedSedes.length === 1)'));
  assert.doesNotMatch(load, /getDirectoryAuthorizedData|autoLoadedAllSites|__ALL__/);
  assert.match(siteFilter, /const placeholder = isTotalSelection\s*\?\s*'Seleccione una opción'/);
  assert.match(siteFilter, /if \(isTotalSelection\) select\.value = ''/);
  assert.match(siteFilter, /wrapper\.hidden = fixedSingleSede/);
  assert.match(siteChange, /loadSelectedSede\(key\(elements\.sedeFilter\.value\)\)/);
  assert.match(frontendSource, /clearDirectoryTable\('Selecciona una sede para consultar la información de personal\.'/);
});

test('el ámbito TOTAL construye la jerarquía solo de la sede elegida', () => {
  const structures = [
    { id: 'A_UNIT', name: 'Unidad A', parent_id: '', sede_id: 'SEDE_A' },
    { id: 'A_CHILD', name: 'Hijo A', parent_id: 'A_UNIT', sede_id: 'SEDE_A' },
    { id: 'B_UNIT', name: 'Unidad B', parent_id: '', sede_id: 'SEDE_B' }
  ];
  const records = [
    { estructura_id: 'A_CHILD', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'B_UNIT', filter_sede_id: 'SEDE_B' }
  ];
  const totalForSiteA = hierarchySandbox.buildHierarchyFilterSets(
    records,
    structures,
    { scopes: [{ type: 'TOTAL', referenceId: '', includeDescendants: false }] },
    'SEDE_A'
  );
  assert.deepEqual([...totalForSiteA].sort(), ['A_CHILD', 'A_UNIT']);
  assert.equal(totalForSiteA.has('B_UNIT'), false, 'La cascada de una sede no incluye raíces de otra sede');
  const noTotal = hierarchySandbox.buildHierarchyFilterSets(
    records,
    structures,
    { scopes: [{ type: 'SEDE', referenceId: 'SEDE_A', includeDescendants: false }] },
    ''
  );
  assert.deepEqual([...noTotal], []);
});

test('los ámbitos de varias áreas muestran raíces propias y eliminan referencias cubiertas por una raíz ancestro', () => {
  const structures = [
    { id: 'ROOT_A', name: 'Área A', parent_id: '', sede_id: 'SEDE_A', order: 1 },
    { id: 'A_CHILD', name: 'Dependencia A', parent_id: 'ROOT_A', sede_id: 'SEDE_A', order: 1 },
    { id: 'ROOT_B', name: 'Área B', parent_id: '', sede_id: 'SEDE_A', order: 2 },
    { id: 'B_CHILD', name: 'Dependencia B', parent_id: 'ROOT_B', sede_id: 'SEDE_A', order: 1 },
    { id: 'ROOT_COVERED', name: 'Área cubierta', parent_id: 'A_CHILD', sede_id: 'SEDE_A', order: 2 }
  ];
  const records = [
    { estructura_id: 'A_CHILD', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'ROOT_B', filter_sede_id: 'SEDE_A' },
    { estructura_id: 'ROOT_COVERED', filter_sede_id: 'SEDE_A' }
  ];
  const scopes = [
    { type: 'ESTRUCTURA_ORG', referenceId: 'ROOT_A', includeDescendants: true },
    { type: 'ESTRUCTURA_ORG', referenceId: 'ROOT_B', includeDescendants: false },
    { type: 'ESTRUCTURA_ORG', referenceId: 'ROOT_COVERED', includeDescendants: true }
  ];
  const selectable = hierarchySandbox.buildHierarchyFilterSets(
    records, structures, { scopes }, 'SEDE_A'
  );
  assert.deepEqual([...selectable].sort(), [
    'A_CHILD', 'ROOT_A', 'ROOT_B', 'ROOT_COVERED'
  ]);
  const index = hierarchyIndexSandbox.buildIndex(records, structures);
  const roots = hierarchySandbox.getHierarchyScopeRoots(scopes, index, selectable, 'SEDE_A');
  assert.deepEqual(
    Array.from(roots, item => item.referenceId),
    ['ROOT_A', 'ROOT_B'],
    'La referencia descendiente cubierta por ROOT_A no duplica la rama'
  );
  assert.deepEqual(
    Array.from(hierarchySandbox.getSelectableChildren('ROOT_A', index, selectable), node => node.id),
    ['A_CHILD'],
    'Al entrar por ROOT_A solo se muestra su hijo directo'
  );

  const fixedScopes = [
    { type: 'ESTRUCTURA_ORG', referenceId: 'ROOT_A', includeDescendants: false },
    { type: 'ESTRUCTURA_ORG', referenceId: 'ROOT_B', includeDescendants: false }
  ];
  const fixedSelectable = hierarchySandbox.buildHierarchyFilterSets(
    [
      { estructura_id: 'ROOT_A', filter_sede_id: 'SEDE_A' },
      { estructura_id: 'ROOT_B', filter_sede_id: 'SEDE_A' }
    ],
    structures,
    { scopes: fixedScopes },
    'SEDE_A'
  );
  const fixedRoots = hierarchySandbox.getHierarchyScopeRoots(fixedScopes, index, fixedSelectable, 'SEDE_A');
  assert.deepEqual(Array.from(fixedRoots, item => item.referenceId), ['ROOT_A', 'ROOT_B']);
  assert.deepEqual([...fixedSelectable].sort(), ['ROOT_A', 'ROOT_B']);
});

test('el índice cliente conserva rutas reales sin convertir ancestros en opciones seleccionables', () => {
  const structures = [
    { id: 'GG', name: 'Gerencia General', parent_id: '', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_INT', name: 'UF Integridad', parent_id: 'GG', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_GD', name: 'UF Gestión Documental', parent_id: 'GG', sede_id: 'SEDE_A', order: 2 },
    { id: 'TD', name: 'Trámite Documentario', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 1 },
    { id: 'AC', name: 'Archivo Central', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 2 },
    { id: 'DTR', name: 'Dirección Técnica Registral', parent_id: '', sede_id: 'SEDE_A', order: 2 }
  ];
  const records = [
    { estructura_id: 'GG', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A', local_name: 'Primavera' },
    { estructura_id: 'UF_INT', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A', local_name: 'Primavera' },
    { estructura_id: 'TD', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A', local_name: 'Primavera' },
    { estructura_id: 'AC', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A', local_name: 'Primavera' },
    { estructura_id: 'DTR', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A', local_name: 'Primavera' },
    { estructura_id: '', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_B', local_name: 'Local solo' }
  ];
  const index = hierarchyIndexSandbox.buildIndex(records, structures);
  const selected = index.selectableByLocal.get('LOCAL_A');
  assert.deepEqual([...selected].sort(), ['AC', 'DTR', 'GG', 'TD', 'UF_INT']);
  assert.deepEqual(
    Array.from(index.childrenByParent.get('GG'), node => node.id).join(','),
    'UF_INT,UF_GD',
    'La relación real entre padre e hijos se conserva para los nodos que sí tienen registros'
  );
  assert.equal(selected.has('UF_GD'), false, 'El ancestro sin registros no se ofrece como filtro');
  assert.deepEqual(
    Array.from(index.structurePathById.get('TD'), node => node.id).join(','),
    'GG,UF_GD,TD'
  );
  assert.equal(index.recordsByLocal.get('LOCAL_A').length, 5);
  assert.equal(index.localOptionsById.has('LOCAL_B'), true);
  assert.equal(index.selectableByLocal.has('LOCAL_B'), false, 'La asignación local-only no crea una estructura');
  assert.equal(hierarchyIndexSandbox.matchesSubtree('TD', 'GG', index), true);
  assert.equal(hierarchyIndexSandbox.matchesSubtree('DTR', 'GG', index), false);
  assert.equal(hierarchyIndexSandbox.matchesSubtree('UF_INT', 'UF_GD', index), false);
});

test('los filtros jerárquicos conservan ancestros reales, pero excluyen otras sedes y ámbitos locales', () => {
  const structures = [
    { id: 'ROOT_A', name: 'Gerencia A', parent_id: '', sede_id: 'SEDE_A' },
    { id: 'UNIT_A', name: 'Unidad A', parent_id: 'ROOT_A', sede_id: 'SEDE_A' },
    { id: 'ROOT_B', name: 'Gerencia B', parent_id: '', sede_id: 'SEDE_B' },
    { id: 'UNIT_B', name: 'Unidad B', parent_id: 'ROOT_B', sede_id: 'SEDE_B' }
  ];
  const records = [
    { estructura_id: 'UNIT_A', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_A' },
    { estructura_id: 'UNIT_B', filter_sede_id: 'SEDE_B', filter_local_id: 'LOCAL_B' },
    { estructura_id: 'UNIT_A', filter_sede_id: 'SEDE_A', filter_local_id: 'LOCAL_OTHER' }
  ];
  const ids = hierarchySandbox.buildHierarchyFilterSets(records, structures, { scopes: [{ type: 'SEDE', referenceId: 'SEDE_A', includeDescendants: false }] }, 'SEDE_A');
  assert.deepEqual([...ids].sort(), ['ROOT_A', 'UNIT_A']);
  assert.equal(ids.has('ROOT_A'), true, 'El ancestro real se conserva para no aplanar los niveles');
  assert.deepEqual([...hierarchySandbox.buildHierarchyFilterSets(records, structures, { scopes: [{ type: 'LOCAL', referenceId: 'LOCAL_A', includeDescendants: false }] }, 'SEDE_A')], []);
});

test('la interfaz limita la cascada a hijos directos reales y no presenta contexto artificial', () => {
  assert.equal(frontendScript.includes('contextualIds'), false);
  assert.equal(frontendScript.includes('(contexto)'), false);
  assert.equal(frontendScript.includes('option.disabled'), false);
  assert.ok(frontendScript.includes('option.textContent = key(node.name)'));
  assert.ok(frontendScript.includes('hierarchyIndex.childrenByParent.get(parentKey)'));
  assert.ok(frontendScript.includes('Array.from(index.structureById.values())'));
  assert.ok(frontendScript.includes('scope.includeDescendants === true'));
  assert.ok(frontendScript.includes('state.hierarchySelectableIds = _directoryBuildHierarchyFilterSets_'));
  assert.ok(frontendScript.includes('_directoryGetSelectableHierarchyChildren_('));

  const getHierarchyStart = frontendScript.indexOf('function getHierarchyNodes(parentId)');
  const getHierarchyEnd = frontendScript.indexOf('function getHierarchyLabel(', getHierarchyStart);
  const getHierarchySource = frontendScript.slice(getHierarchyStart, getHierarchyEnd);
  assert.ok(getHierarchySource.includes('_directoryGetSelectableHierarchyChildren_'));
  assert.equal(getHierarchySource.includes('collectChildren'), false);
  assert.equal(frontendScript.includes('selectableIds.add(keyOf(node.id)'), false);
});;


test('las asignaciones se agrupan por jerarquía, respetan order por unidad y conservan un desempate estable', () => {
  const structures = [
    { id: 'GG', name: 'Gerencia General', parent_id: '', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_INT', name: 'UF Integridad', parent_id: 'GG', sede_id: 'SEDE_A', order: 1 },
    { id: 'UF_GD', name: 'UF Gestión Documental', parent_id: 'GG', sede_id: 'SEDE_A', order: 2 },
    { id: 'TD', name: 'Trámite Documentario', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 1 },
    { id: 'AC', name: 'Archivo Central', parent_id: 'UF_GD', sede_id: 'SEDE_A', order: 2 },
    { id: 'DTR', name: 'Dirección Técnica Registral', parent_id: '', sede_id: 'SEDE_A', order: 2 }
  ];
  const relations = structures.map(node => ({
    id: 'REL_' + node.id,
    estructura_id: node.id,
    local_id: 'LOCAL_A',
    active: true
  }));
  relations.push({
    id: 'REL_GG_C', estructura_id: 'GG', local_id: 'LOCAL_C', active: true
  });
  const context = {
    estructuraOrg: structures,
    estructuraLocal: relations,
    locales: [
      { id: 'LOCAL_A', name: 'Edificio administrativo Primavera', sede_id: 'SEDE_A', active: true },
      { id: 'LOCAL_B', name: 'Local sin estructura', sede_id: 'SEDE_A', active: true },
      { id: 'LOCAL_C', name: 'AAA Local secundario', sede_id: 'SEDE_A', active: true }
    ],
    sedes: [{ id: 'SEDE_A', name: 'Sede Central' }],
    cargos: []
  };
  const records = [
    { asignacion_id: 'AC_01', estructura_local_id: 'REL_AC', local_id: 'LOCAL_A', order: 1 },
    { asignacion_id: 'DTR_01', estructura_local_id: 'REL_DTR', local_id: 'LOCAL_A', order: 1 },
    { asignacion_id: 'TD_01', estructura_local_id: 'REL_TD', local_id: 'LOCAL_A', order: 1 },
    { asignacion_id: 'UF_INT_01', estructura_local_id: 'REL_UF_INT', local_id: 'LOCAL_A', order: 1 },
    { asignacion_id: 'GG_02', estructura_local_id: 'REL_GG', local_id: 'LOCAL_A', order: 2 },
    { asignacion_id: 'GG_01', estructura_local_id: 'REL_GG', local_id: 'LOCAL_A', order: 1 },
    { asignacion_id: 'GG_03', estructura_local_id: 'REL_GG_C', local_id: 'LOCAL_C', order: 3 },
    { asignacion_id: 'LOCAL_ONLY_01', estructura_local_id: '', local_id: 'LOCAL_B', order: 1 }
  ];
  const ordered = api.sortAssignments(records, context);
  assert.deepEqual(
    ordered.map(record => record.asignacion_id),
    ['GG_01', 'GG_02', 'GG_03', 'UF_INT_01', 'TD_01', 'AC_01', 'DTR_01', 'LOCAL_ONLY_01']
  );
});
test('el servicio, el frontend y las pruebas Core tienen sintaxis válida', () => {
  assert.doesNotThrow(() => new vm.Script(serviceSource));
  assert.doesNotThrow(() => new vm.Script(frontendScript));
  assert.doesNotThrow(() => new vm.Script(coreTestsSource));
  assert.doesNotThrow(() => new vm.Script(coreRepositorySource));
});


test('SUNARP Core ofrece lectura limitada desde el final de una fuente', () => {
  const start = coreRepositorySource.indexOf('function listTailRecords(source, options) {');
  const end = coreRepositorySource.indexOf('function getRecordById(', start);
  const implementation = coreRepositorySource.slice(start, end);
  assert.ok(implementation.includes('sheet.getRange('));
  assert.ok(implementation.includes('startRow, 1, numberOfRows, lastColumn'));
  assert.ok(implementation.includes('const startRow = Math.max(dataStartRow, endRow - limit + 1)'));
  assert.ok(!implementation.includes('getDataRange'));
});
test('SUNARP Core limita la lectura agrupada al rango realmente ocupado de cada pestaña', () => {
  const start = coreRepositorySource.indexOf('function listRecordsFromSources(requests) {');
  const end = coreRepositorySource.indexOf('function ', start + 20);
  const implementation = coreRepositorySource.slice(start, end);
  assert.match(implementation, /const lastRow = sheet\.getLastRow\(\)/);
  assert.match(implementation, /const lastColumn = sheet\.getLastColumn\(\)/);
  assert.match(implementation, /sheet\.getRange\(1, 1, lastRow, lastColumn\)\.getValues\(\)/);
  assert.doesNotMatch(implementation, /sheet\.getDataRange\(\)/);
});

test('SUNARP Core no contiene definiciones globales duplicadas en DataRepository', () => {
  const declarations = [...coreRepositorySource.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)]
    .map(match => match[1]);
  const counts = new Map();
  declarations.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  assert.deepEqual(duplicates, []);
  assert.match(coreRepositorySource, /ignoreWhitespace/);
});

test('las lecturas del Directorio no ejecutan validación integral de todas las asignaciones', () => {
  for (const name of [
    'getDirectorySiteData',
    'listDirectoryPeople',
    'listDirectoryAssignments',
    'getDirectoryPersonById'
  ]) {
    const start = serviceSource.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Debe existir ' + name);
    const next = serviceSource.indexOf('\nfunction ', start + 10);
    const implementation = serviceSource.slice(start, next < 0 ? serviceSource.length : next);
    assert.match(implementation, /validateSnapshot:\s*false/);
  }

  const initialStart = serviceSource.indexOf('function getDirectoryInitialData(');
  const siteStart = serviceSource.indexOf('function getDirectorySiteData(', initialStart);
  const initial = serviceSource.slice(initialStart, siteStart);
  assert.doesNotMatch(initial, /_directoryLoadContext_|queryRecords|_directoryExecuteAssignmentQuery_/);

  const saveStart = serviceSource.indexOf('function saveDirectoryAssignment(');
  const saveEnd = serviceSource.indexOf('function setDirectoryAssignmentActive(', saveStart);
  const saveImplementation = serviceSource.slice(saveStart, saveEnd);
  assert.doesNotMatch(saveImplementation, /validateSnapshot:\s*false/);
});

test('el catálogo de tipos de documento se resuelve exclusivamente desde Global parameters', () => {
  const requested = [];
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => {
    requested.push({ sourceKey, sheetName, headerRow });
    return { sourceKey, sheetName, headerRow };
  };
  sandbox.SUNARPCore = {
    getSourceInfoCached: source => ({
      headers: ['id', 'name']
    })
  };

  const source = api.resolveDocumentTypesSource();

  assert.deepEqual(requested, [{
    sourceKey: 'MASTER_DATA',
    sheetName: 'tipo_documento_identidad',
    headerRow: 1
  }]);
  assert.equal(source.sourceKey, 'MASTER_DATA');
  assert.equal(source.sheetName, 'tipo_documento_identidad');
});

test('acepta fechas ISO válidas y campos de fecha vacíos', () => {
  assert.equal(api.normalizeDate('2026-02-28', 'Fecha'), '2026-02-28');
  assert.equal(api.normalizeDate('', 'Fecha'), '');
});

test('rechaza fechas inexistentes y formatos ambiguos', () => {
  assert.throws(() => api.normalizeDate('2026-02-30', 'Fecha'), /calendario/i);
  assert.throws(() => api.normalizeDate('28/02/2026', 'Fecha'), /AAAA-MM-DD/i);
});

test('normaliza tipo y número documental eliminando espacios y convirtiendo a mayúsculas', () => {
  assert.equal(api.normalizeDocument(' d n i ', 'Tipo'), 'DNI');
  assert.equal(api.normalizeDocument(' 12 345 678 ', 'Número'), '12345678');
});

test('rechaza valores documentales que exceden el máximo de 30 caracteres', () => {
  assert.throws(() => api.normalizeDocument('D'.repeat(31), 'Tipo'), /30 caracteres/);
});

test('rechaza un documento duplicado aunque el registro existente tenga espacios', () => {
  assert.throws(
    () => api.assertDocumentAvailable(
      'DNI',
      '12345678',
      [{ servidor_id: 'PER_001', tipo_documento: 'dni', numero_documento: '12 345 678' }],
      'PER_002'
    ),
    /documento ya está registrado/i
  );
});

test('permite el mismo número cuando el tipo documental es distinto', () => {
  assert.doesNotThrow(() => api.assertDocumentAvailable(
    'CE',
    '12345678',
    [{ servidor_id: 'PER_001', tipo_documento: 'DNI', numero_documento: '12345678' }],
    'PER_002'
  ));
});

test('permite conservar el documento de la misma persona durante una edición', () => {
  assert.doesNotThrow(() => api.assertDocumentAvailable(
    'DNI',
    '12345678',
    [{ servidor_id: 'PER_001', tipo_documento: 'DNI', numero_documento: '12345678' }],
    'PER_001'
  ));
});

test('genera el siguiente identificador sin reutilizar los existentes', () => {
  assert.equal(
    api.generateId(
      [{ persona_id: 'PER_001' }, { persona_id: 'PER_009' }, { persona_id: 'otro' }],
      { field: 'persona_id', prefix: 'PER_', digits: 3 }
    ),
    'PER_010'
  );
});

test('calcula el siguiente orden dentro de la misma relación estructura-local', () => {
  assert.equal(
    api.getNextOrder([
      { estructura_local_id: 'REL_1', order: 2 },
      { estructura_local_id: 'REL_1', order: 7 },
      { estructura_local_id: 'REL_2', order: 20 }
    ], 'REL_1'),
    8
  );
});

test('normaliza estados booleanos y rechaza valores ambiguos', () => {
  assert.equal(api.normalizeBoolean('true'), true);
  assert.equal(api.normalizeBoolean('0'), false);
  assert.throws(() => api.normalizeBoolean('desconocido'), /verdadero o falso/i);
});

test('admite anexo vacío y valida anexos enteros', () => {
  assert.equal(api.normalizeInteger('', 'Anexo', true), '');
  assert.equal(api.normalizeInteger('1234', 'Anexo', true), 1234);
  assert.throws(() => api.normalizeInteger('12A', 'Anexo', true), /número entero/i);
});


test('la creación de personas no está expuesta como operación independiente', () => {
  assert.ok(serviceSource.includes('function _saveDirectoryPerson_('));
  assert.equal(serviceSource.includes('function saveDirectoryPerson('), false);
});

test('la edición coordinada impide usar una asignación perteneciente a otra persona', () => {
  assert.match(serviceSource, /La asignación seleccionada no pertenece a la persona indicada/);
});

test('la eliminación de persona comprueba la ficha en el snapshot de datos personales', () => {
  assert.match(serviceSource, /const personalData = _directoryFindPersonalDataById_\(id\)/);
  assert.doesNotMatch(serviceSource, /_directoryLoadPersonalDataLinks_/);
});


function createDirectorySandbox() {
  const context = vm.createContext({});
  vm.runInContext(serviceSource, context, { filename: 'DirectoryService.js' });
  context._directoryAssertAllowedFields_ = () => true;
  context._directoryLoadContext_ = () => ({ datosPersonales: [] });
  context._directoryAuthorizationContext_ = permissionCode => ({
    auth: {},
    moduleId: 'MOD_INFO_PERSONAL',
    permissionCode,
    structures: [],
    locals: []
  });
  context._directoryFindAuthorizedAssignmentById_ = (snapshot, _authorization, id) =>
    (snapshot.asignaciones || []).find(item =>
      String(item.asignacion_id) === String(id)
    ) || null;
  context._directoryAssertDocumentAvailable_ = (type, number) => ({
    tipo_documento: String(type).toUpperCase(),
    numero_documento: String(number)
  });
  context._directoryInvalidateCache_ = () => {};
  context._directorySource_ = name => name;
  context.SUNARPCore = {
    findRecordsByFields: (source, filters) => {
      const snapshot = context._directoryLoadContext_() || {};
      const field = Object.keys(filters)[0];
      const rows = field === 'persona_id'
        ? (snapshot.personas || [])
        : field === 'servidor_id'
          ? (snapshot.datosPersonales || [])
          : [];
      const records = rows.filter(item => String(item[field] || '') === String(filters[field] || ''));
      return { records, total: records.length };
    },
    searchRecordsByFields: (source, query, fields) => {
      const snapshot = context._directoryLoadContext_() || {};
      const expected = String(query || '').toLowerCase();
      const records = (snapshot.personas || []).filter(item =>
        fields.some(field => String(item[field] || '').toLowerCase().includes(expected))
      );
      return { records, total: records.length };
    },
    listRecordsFromSourcesCached: () => ({
      people: (context._directoryLoadContext_().personas || [])
    })
  };
  return context;
}

test('el alta coordinada crea persona, ficha y primera asignación en ese orden', () => {
  const context = createDirectorySandbox();
  const calls = [];
  context._saveDirectoryPerson_ = payload => {
    calls.push('persona');
    return { person: { persona_id: 'PER_001' } };
  };
  context._saveDirectoryPersonalData_ = payload => {
    calls.push('ficha');
    return { personalData: { servidor_id: payload.servidor_id } };
  };
  context.saveDirectoryAssignment = payload => {
    calls.push('asignacion');
    return { assignment: { asignacion_id: 'ASG_001' } };
  };

  const result = context.saveDirectoryEntry({
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '12345678',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  });

  assert.deepEqual(calls, ['persona', 'ficha', 'asignacion']);
  assert.equal(result.person.persona_id, 'PER_001');
  assert.equal(result.personalData.servidor_id, 'PER_001');
  assert.equal(result.assignment.asignacion_id, 'ASG_001');
});

test('si falla la primera asignación, el alta coordinada compensa persona y ficha', () => {
  const context = createDirectorySandbox();
  const deleted = [];
  context._saveDirectoryPerson_ = () => ({ person: { persona_id: 'PER_002' } });
  context._saveDirectoryPersonalData_ = () => ({ personalData: { servidor_id: 'PER_002' } });
  context.saveDirectoryAssignment = () => { throw new Error('fallo de asignación'); };
  context.SUNARPCore = {
    deleteRecord: (source, field, id) => {
      deleted.push([source, field, id]);
      return { success: true };
    }
  };

  assert.throws(() => context.saveDirectoryEntry({
    nombres: 'Luis',
    apellidos: 'Díaz',
    tipo_documento: 'DNI',
    numero_documento: '87654321',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  }), /fallo de asignación/);

  assert.deepEqual(deleted, [
    ['servidores datos personales', 'servidor_id', 'PER_002'],
    ['personas', 'persona_id', 'PER_002']
  ]);
});

test('una asignación adicional no crea ni modifica persona o ficha personal', () => {
  const context = createDirectorySandbox();
  let personWrites = 0;
  let personalWrites = 0;
  let assignmentPayload;
  context._saveDirectoryPerson_ = () => { personWrites++; };
  context.saveDirectoryPersonalData = () => { personalWrites++; };
  context.saveDirectoryAssignment = payload => {
    assignmentPayload = payload;
    return { assignment: { asignacion_id: 'ASG_009' } };
  };

  const result = context.saveDirectoryEntry({
    persona_id: 'PER_009',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  });

  assert.equal(personWrites, 0);
  assert.equal(personalWrites, 0);
  assert.equal(assignmentPayload.persona_id, 'PER_009');
  assert.equal(result.assignment.asignacion_id, 'ASG_009');
});



test('la edición coordinada recupera la asignación anterior por ID sin cargar toda la tabla', () => {
  const context = createDirectorySandbox();
  const person = {
    persona_id: 'PER_012', nombres: 'Ana', apellidos: 'Pérez',
    correo_institucional: 'ana@sunarp.gob.pe'
  };
  const personalData = {
    servidor_id: 'PER_012', tipo_documento: 'DNI', numero_documento: '12345678',
    fecha_nacimiento: '', fecha_inicio_servicios: '', fecha_cese: ''
  };
  const previousAssignment = {
    asignacion_id: 'ASG_012', persona_id: 'PER_012', cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1', local_id: '', active: true, order: 2
  };
  let loadOptions = null;
  let lookupId = '';

  context._directoryLoadContext_ = options => {
    if (options) loadOptions = options;
    return {
      personas: [person],
      datosPersonales: [personalData],
      asignaciones: [],
      estructuraLocal: [],
      estructuraOrg: [],
      locales: []
    };
  };
  context._directoryFindAuthorizedAssignmentById_ = (_snapshot, _authorization, id) => {
    lookupId = id;
    return previousAssignment;
  };
  context._directoryAssertDocumentAvailable_ = () => ({
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  });
  context._saveDirectoryPerson_ = () => ({ person });
  context.saveDirectoryPersonalData = () => ({ personalData });
  context.saveDirectoryAssignment = () => ({
    assignment: { asignacion_id: 'ASG_012' }
  });

  const result = context.saveDirectoryEntry({
    persona_id: 'PER_012',
    asignacion_id: 'ASG_012',
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '12345678',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1'
  });

  assert.equal(loadOptions.includeAssignments, false);
  assert.equal(loadOptions.validateSnapshot, false);
  assert.equal(lookupId, 'ASG_012');
  assert.equal(result.success, true);
});

test('la edición rechaza una asignación que pertenece a otra persona antes de escribir', () => {
  const context = createDirectorySandbox();
  let writes = 0;
  context._directoryLoadContext_ = () => ({
    personas: [{ persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' }],
    datosPersonales: [],
    asignaciones: [{ asignacion_id: 'ASG_002', persona_id: 'PER_002' }]
  });
  context._directoryAssertDocumentAvailable_ = () => ({
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  });
  context._saveDirectoryPerson_ = () => { writes++; };
  context.saveDirectoryPersonalData = () => { writes++; };
  context.saveDirectoryAssignment = () => { writes++; };

  assert.throws(() => context.saveDirectoryEntry({
    persona_id: 'PER_001',
    asignacion_id: 'ASG_002',
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  }), /no pertenece a la persona indicada/i);
  assert.equal(writes, 0);
});


test('guardar datos personales consulta únicamente las asignaciones de la persona', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const person = {
    persona_id: 'PER_015',
    nombres: 'Ana',
    apellidos: 'Pérez',
    correo_institucional: 'ana@sunarp.gob.pe'
  };
  const linkedAssignment = {
    asignacion_id: 'ASG_015',
    persona_id: 'PER_015',
    estructura_local_id: 'REL_1',
    local_id: ''
  };
  const lookupCalls = [];
  let loadOptions = null;
  let scopeAssignments = null;
  let permissionRequested = '';

  vmContext._directoryAssertAllowedFields_ = () => true;
  vmContext._directoryLoadContext_ = options => {
    loadOptions = options;
    return { asignaciones: [], estructuraLocal: [], estructuraOrg: [], locales: [] };
  };
  vmContext._directorySource_ = name => name;
  vmContext.getIntranetDataSource = (_key, sheetName) => ({ sheetName });
  vmContext._directoryAuthorizationContext_ = permission => {
    permissionRequested = permission;
    return { auth: {}, structures: [], locals: [] };
  };
  vmContext._directoryAssertPersonMutationScope_ = (_authorization, _person, assignments, context) => {
    scopeAssignments = assignments;
    assert.equal(context.asignaciones.length, 0);
  };
  vmContext._directoryAssertDocumentAvailable_ = () => ({
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  });
  vmContext._accessRunAudited_ = (_auth, _event, callback) => callback().value;
  vmContext.SUNARPCore = {
    findRecordsByFields: (source, filters) => {
      lookupCalls.push({ source, filters });
      if (source === 'personas') return { records: [person], total: 1 };
      if (source === 'asignaciones') return { records: [linkedAssignment], total: 1 };
      if (source === 'servidores datos personales') return { records: [], total: 0 };
      throw new Error('Fuente inesperada: ' + source);
    },
    assertValidRecord: () => true,
    insertRecord: (source, record) => ({ success: true, record })
  };

  const result = vmContext._saveDirectoryPersonalData_({
    servidor_id: 'PER_015',
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  }, false);

  assert.equal(loadOptions.includeAssignments, false);
  assert.equal(loadOptions.includePersonalData, false);
  assert.equal(permissionRequested, 'INFORMACION_PERSONAL_EDITAR');
  assert.equal(scopeAssignments.length, 1);
  assert.equal(scopeAssignments[0].asignacion_id, 'ASG_015');
  assert.deepEqual(JSON.parse(JSON.stringify(lookupCalls)), [
    { source: 'personas', filters: { persona_id: 'PER_015' } },
    { source: 'asignaciones', filters: { persona_id: 'PER_015' } },
    { source: 'servidores datos personales', filters: { servidor_id: 'PER_015' } }
  ]);
  assert.equal(result.success, true);
});

test('el guardado directo de ficha personal aplica la unicidad documental normalizada', () => {
  const start = serviceSource.indexOf('function _saveDirectoryPersonalData_(');
  const end = serviceSource.indexOf('function saveDirectoryEntry(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('_directoryAssertDocumentAvailable_('));
});


test('el formulario permite registrar y actualizar observaciones de cada asignación', () => {
  assert.ok(frontendSource.includes('directoryFormObservaciones'));
  assert.ok(frontendSource.includes("observaciones: document.getElementById('directoryFormObservaciones')"));
});


function assignmentContext() {
  return {
    personas: [{ persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' }],
    datosPersonales: [],
    asignaciones: [],
    cargos: [{ id: 'CAR_001', name: 'Analista' }],
    sedes: [{ id: 'SEDE_1', name: 'Lima' }],
    locales: [{ id: 'LOC_1', name: 'Local Lima', sede_id: 'SEDE_1', tipo_local_id: 'TL_1' }],
    estructuraOrg: [{ id: 'EST_1', name: 'Oficina', parent_id: '', sede_id: 'SEDE_1', tipo_estructura_id: 'TE_1' }],
    estructuraLocal: [{ id: 'REL_1', estructura_id: 'EST_1', local_id: 'LOC_1' }],
    tiposLocal: [{ id: 'TL_1', name: 'Sede' }],
    tiposEstructura: [{ id: 'TE_1', name: 'Oficina' }]
  };
}

function createDirectoryQueryAuthorization(context, scopes) {
  return {
    auth: {
      authenticated: true,
      personaId: 'PER_ADMIN',
      moduleAccess: [{
        modulo_id: 'MOD_INFO_PERSONAL',
        permissionCodes: ['INFORMACION_PERSONAL_VER'],
        scopes
      }]
    },
    moduleId: 'MOD_INFO_PERSONAL',
    structures: context.estructuraOrg,
    locals: context.locales
  };
}

test('la consulta del Directorio traduce SEDE en relaciones y adscripciones directas al local', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { estructura_local_id: ['REL_1'] });
  assert.deepEqual(groups[1], { local_id: ['LOC_1'], estructura_local_id: '' });
  assert.equal(
    descriptor.queryOptions.authorization.scopeRecordLookups[0].values.REL_1.estructura_id,
    'EST_1'
  );
  assert.equal(descriptor.queryOptions.authorization.scopeRecordLookups[0].requireEqualFields[0], 'local_id');
  assert.equal(descriptor.queryOptions.authorization.scopeRecordLookups[0].required, true);
  assert.equal(descriptor.queryOptions.authorization.scopeRecordLookups[1].required, true);
  assert.ok(descriptor.queryOptions.authorization.catalogSources.some(item =>
    item.sourceKey === 'SECURITY' && item.sheetName === 'EstructuraOrg'
  ));
});

test('la consulta de ESTRUCTURA_ORG incluye descendientes pero no asignaciones directas a locales', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  context.estructuraOrg.push({
    id: 'EST_CHILD', name: 'Unidad hija', parent_id: 'EST_1',
    sede_id: 'SEDE_1', tipo_estructura_id: 'TE_1'
  });
  context.estructuraLocal.push({
    id: 'REL_CHILD', estructura_id: 'EST_CHILD', local_id: 'LOC_1'
  });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_1', incluir_descendientes: true }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], { estructura_local_id: ['REL_1', 'REL_CHILD'] });
});

test('la consulta de LOCAL solo incluye asignaciones directas sin estructura orgánica', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'LOCAL', referencia_id: 'LOC_1', incluir_descendientes: false }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.deepEqual(groups, [{ local_id: ['LOC_1'], estructura_local_id: '' }]);
});

test('listDirectoryPeople consulta personas distintas y recupera solo las asignaciones de la página', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });

  vmContext.getIntranetDataSource = (_key, sheetName) => ({ sheetName });
  const calls = [];
  const context = {
    personas: [],
    asignaciones: [],
    datosPersonales: [],
    sedes: [{ id: 'S1', name: 'Sede' }],
    tiposLocal: [],
    locales: [{ id: 'L1', name: 'Local', sede_id: 'S1' }],
    tiposEstructura: [],
    estructuraOrg: [{ id: 'E1', sede_id: 'S1' }],
    estructuraLocal: [{ id: 'R1', estructura_id: 'E1', local_id: 'L1', active: true }],
    cargos: [{ id: 'C1', name: 'Cargo', active: true }]
  };
  vmContext._directoryAuthorizationContext_ = () => ({
    auth: {
      moduleAccess: [{
        modulo_id: 'MOD_INFO_PERSONAL',
        scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
      }]
    },
    moduleId: 'MOD_INFO_PERSONAL',
    permissionCode: 'INFORMACION_PERSONAL_VER',
    structures: [],
    locals: []
  });
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includePeople, false);
    assert.equal(options.includeAssignments, false);
    assert.equal(options.includePersonalData, false);
    return context;
  };
  vmContext._directoryExecuteAssignmentQuery_ = (
    _context, _authorization, options, _idField, offset, limit,
    _enrich, distinctBy
  ) => {
    calls.push({ options, offset, limit, distinctBy });
    if (distinctBy === 'persona_id') {
      return {
        records: [
          { asignacion_id: 'A2', persona_id: 'PER_002' },
          { asignacion_id: 'A3', persona_id: 'PER_003' }
        ],
        total: 3,
        hasMore: true
      };
    }
    assert.deepEqual(Array.from(options.personaIds), ['PER_002', 'PER_003']);
    return {
      records: [
        { asignacion_id: 'A2', persona_id: 'PER_002', cargo_id: 'C1', estructura_local_id: 'R1', local_id: 'L1', active: true, order: 1 },
        { asignacion_id: 'A2B', persona_id: 'PER_002', cargo_id: 'C1', estructura_local_id: 'R1', local_id: 'L1', active: false, order: 2 },
        { asignacion_id: 'A3', persona_id: 'PER_003', cargo_id: 'C1', estructura_local_id: 'R1', local_id: 'L1', active: true, order: 1 }
      ],
      total: 3
    };
  };
  vmContext.SUNARPCore = {
    findRecordsByFields: (source, filters, options) => {
      assert.equal(source.sheetName, 'personas');
      assert.equal(options.searchField, 'persona_id');
      assert.deepEqual(Array.from(filters.persona_id), ['PER_002', 'PER_003']);
      return {
        records: [
          { persona_id: 'PER_002', nombres: 'Ana', apellidos: 'Beta' },
          { persona_id: 'PER_003', nombres: 'Bea', apellidos: 'Gamma' }
        ],
        total: 2
      };
    }
  };
  vmContext._directoryCreateMap_ = (records, field = 'id') =>
    new Map((records || []).map(item => [String(item[field]), item]));
  vmContext._directoryBuildRelations_ = () => [{
    id: 'R1', estructura_id: 'E1', local_id: 'L1',
    estructura_name: 'Unidad', estructura_path: 'Unidad',
    sede_name: 'Sede', referencia: 'Referencia', display_name: 'Unidad - Local',
    active: true
  }];
  vmContext._directoryResolveAssignmentLocation_ = () => ({
    estructura_id: 'E1', sede_id: 'S1',
    relation: { id: 'R1' },
    local: { id: 'L1', name: 'Local' }
  });
  vmContext._directoryEnrichAssignment_ = (item, _context, _relations, people) =>
    Object.assign({}, item, {
      nombres: people.get(item.persona_id).nombres
    });

  const result = vmContext.listDirectoryPeople({
    active: true,
    search: 'ana',
    offset: 10,
    limit: 2
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].distinctBy, 'persona_id');
  assert.equal(calls[0].offset, 10);
  assert.equal(calls[0].limit, 2);
  assert.equal(calls[0].options.sortBy, 'persona_id');
  assert.equal(calls[0].options.search, 'ana');
  assert.equal(calls[1].options.active, 'all');
  assert.equal(calls[1].limit, 1000);
  assert.equal(result.total, 3);
  assert.equal(result.offset, 10);
  assert.equal(result.limit, 2);
  assert.equal(result.hasMore, true);
  assert.deepEqual(Array.from(result.records, item => item.persona_id), ['PER_002', 'PER_003']);
  assert.equal(result.records[0].assignments.length, 2);
  assert.equal(result.records[1].assignments.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(result.records[0], 'personalData'), false);
});

test('listDirectoryAssignments pagina mediante Core y no carga asignaciones completas', () => {
  const context = assignmentContext();
  const pagePerson = { persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' };
  context.personas = [];
  context.asignaciones = [];
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow
  });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    return context;
  };
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  let query;
  vmContext.SUNARPCore = {
    queryRecords: (source, options) => {
      query = { source, options };
      return {
        records: [{
          asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
          estructura_local_id: 'REL_1', local_id: '', active: true, order: 1
        }],
        total: 21,
        offset: options.offset,
        limit: options.limit,
        hasMore: true
      };
    },
    findRecordsByFields: (source, filters) => {
      const ids = Array.isArray(filters.persona_id) ? Array.from(filters.persona_id) : [filters.persona_id];
      const records = ids.includes('PER_001') ? [pagePerson] : [];
      return { records, total: records.length };
    }
  };
  const result = vmContext.listDirectoryAssignments({ page: 2, pageSize: 10 });
  assert.equal(query.options.offset, 10);
  assert.equal(query.options.limit, 10);
  assert.equal(query.options.idField, 'asignacion_id');
  assert.equal(result.total, 21);
  assert.equal(result.offset, 10);
  assert.equal(result.records[0].asignacion_id, 'ASG_001');
  assert.equal(result.records[0].sede_id, 'SEDE_1');
});

test('getDirectoryInitialData devuelve sedes autorizadas sin consultar asignaciones ni cargar catálogos completos', () => {
  const context = assignmentContext();
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext.requirePermission_ = (permissionCode, moduleId) => {
    assert.equal(permissionCode, 'INFORMACION_PERSONAL_VER');
    assert.equal(moduleId, 'MOD_INFO_PERSONAL');
    return authorization.auth;
  };
  vmContext._directoryLoadContext_ = () => {
    throw new Error('El selector inicial no debe cargar el contexto completo de Directorios.');
  };
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });

  let queryCalls = 0;
  let catalogRequests = null;
  const allSedes = [
    { id: 'SEDE_1', name: 'Lima', active: true },
    { id: 'SEDE_2', name: 'Piura', active: true },
    { id: 'SEDE_3', name: 'Inactiva', active: false }
  ];
  vmContext.SUNARPCore = {
    listRecordsFromSourcesCached: (requests, ttl) => {
      catalogRequests = { requests, ttl };
      return { sedes: allSedes };
    },
    queryRecords: () => { queryCalls++; throw new Error('No debe consultar asignaciones al ingresar.'); }
  };

  const result = vmContext.getDirectoryInitialData();
  assert.equal(queryCalls, 0);
  assert.equal(catalogRequests.requests.length, 1);
  assert.equal(catalogRequests.requests[0].key, 'sedes');
  assert.equal(result.catalogs.sedes.length, 2);
  assert.equal(catalogRequests.requests[0].key, 'sedes');
  assert.equal(catalogRequests.requests[0].source.sheetName, 'sede');
  assert.deepEqual(result.catalogs.sedes.map(item => item.id), ['SEDE_1', 'SEDE_2']);
  assert.equal(result.records.length, 0);
  assert.equal(result.summary.people, 0);
  assert.equal(result.summary.assignments, 0);
});

test('la lista de sedes deriva ámbitos SEDE, ESTRUCTURA_ORG y LOCAL sin ampliar permisos', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  context.estructuraOrg.push({
    id: 'EST_CHILD', name: 'Unidad hija', parent_id: 'EST_1',
    sede_id: 'SEDE_1', tipo_estructura_id: 'TE_1'
  });
  context.locales.push({ id: 'LOC_2', name: 'Local Piura', sede_id: 'SEDE_2' });

  const structureAuth = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_1', incluir_descendientes: true }
  ]);
  assert.deepEqual(
    Array.from(api.getAuthorizedSedeIds(structureAuth, context.sedes)),
    ['SEDE_1']
  );

  const localAuth = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'LOCAL', referencia_id: 'LOC_2', incluir_descendientes: false }
  ]);
  assert.deepEqual(
    Array.from(api.getAuthorizedSedeIds(localAuth, context.sedes)),
    ['SEDE_2']
  );

  const invalidTotalAuth = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false },
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  assert.deepEqual(
    Array.from(api.getAuthorizedSedeIds(invalidTotalAuth, context.sedes)),
    []
  );
});

test('una relación estructura_local no puede vincular una estructura y un local de sedes distintas', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  context.locales.push({
    id: 'LOC_2', name: 'Local Piura', sede_id: 'SEDE_2',
    tipo_local_id: 'TL_1', active: true
  });
  context.estructuraLocal.push({
    id: 'REL_CROSS_SITE', estructura_id: 'EST_1', local_id: 'LOC_2',
    active: true
  });
  assert.throws(
    () => sandbox._directoryResolveAssignmentLocation_({
      estructura_local_id: 'REL_CROSS_SITE', local_id: ''
    }, context, false),
    /no es coherente.*sede/i
  );
  assert.equal(
    sandbox._directoryBuildRelations_(context, false).some(item => item.id === 'REL_CROSS_SITE'),
    false
  );
});

test('la consulta TOTAL excluye relaciones estructura_local incoherentes entre sedes', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  context.locales.push({
    id: 'LOC_2', name: 'Local Piura', sede_id: 'SEDE_2',
    tipo_local_id: 'TL_1', active: true
  });
  context.estructuraLocal.push({
    id: 'REL_CROSS_SITE', estructura_id: 'EST_1', local_id: 'LOC_2',
    active: true
  });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const relationCandidates = descriptor.queryOptions.anyOf
    .filter(group => Object.prototype.hasOwnProperty.call(group, 'estructura_local_id'))
    .flatMap(group => group.estructura_local_id);
  const scopeValues = descriptor.queryOptions.authorization.scopeRecordLookups[0].values;
  assert.equal(relationCandidates.includes('REL_CROSS_SITE'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(scopeValues, 'REL_CROSS_SITE'), false);
  assert.equal(relationCandidates.includes('REL_1'), true);
});


test('getDirectoryAuthorizedData agrega todas las sedes solo bajo un ámbito TOTAL exclusivo', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryAuthorizationCacheFingerprint_ = () => 'authorized-fingerprint';
  vmContext._directoryGetSiteDataCacheSources_ = () => ['authorized-sources'];
  let requestedSiteId = null;
  vmContext._directoryBuildSiteData_ = (siteId) => {
    requestedSiteId = siteId;
    return {
      catalogs: { sedes: context.sedes },
      records: [
        { asignacion_id: 'ASG_A', filter_sede_id: 'SEDE_1' },
        { asignacion_id: 'ASG_B', filter_sede_id: 'SEDE_2' }
      ],
      summary: { assignments: 2 },
      diagnostics: { serverMs: 5, stages: {} }
    };
  };
  vmContext.SUNARPCore = {
    getOrBuildCachedValue: (key, sources, builder, ttl) => {
      assert.match(key, /^directory-authorized-snapshot:v1:/);
      assert.deepEqual(Array.from(sources), ['authorized-sources']);
      assert.ok(ttl > 0);
      return { value: builder(), cacheHit: false, cacheStored: true };
    }
  };
  const result = vmContext.getDirectoryAuthorizedData();
  assert.equal(requestedSiteId, '');
  assert.deepEqual(Array.from(result.catalogs.sedes, item => item.id), ['SEDE_1', 'SEDE_2']);
  assert.deepEqual(Array.from(result.records, item => item.filter_sede_id), ['SEDE_1', 'SEDE_2']);
  assert.equal(result.summary.assignments, 2);

  const restrictedAuthorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_A', incluir_descendientes: false }
  ]);
  vmContext._directoryAuthorizationContext_ = () => restrictedAuthorization;
  assert.throws(
    () => vmContext.getDirectoryAuthorizedData(),
    /ámbito TOTAL exclusivo/i
  );
});

test('getDirectorySiteData entrega catálogos exclusivos de la sede elegida incluso con ámbito TOTAL', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  context.locales.push({
    id: 'LOC_2', name: 'Local Piura', sede_id: 'SEDE_2',
    tipo_local_id: 'TL_1', active: true
  });
  context.estructuraOrg.push({
    id: 'EST_2', name: 'Oficina Piura', parent_id: '',
    sede_id: 'SEDE_2', tipo_estructura_id: 'TE_1', active: true
  });
  context.estructuraLocal.push({
    id: 'REL_2', estructura_id: 'EST_2', local_id: 'LOC_2', active: true
  });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow
  });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryLoadContext_ = () => context;
  vmContext._accessRecordIsAllowed_ = () => true;
  vmContext._directoryEnrichAssignmentRecords_ = records => records.slice();
  vmContext._directoryExecuteAssignmentQuery_ = () => ({
    records: [{
      asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
      estructura_local_id: 'REL_1', local_id: '', active: true, order: 1,
      nombres: 'Ana', apellidos: 'Pérez', cargo_name: 'Analista',
      estructura_id: 'EST_1', estructura_name: 'Oficina',
      sede_id: 'SEDE_1', filter_sede_id: 'SEDE_1',
      filter_local_id: 'LOC_1', local_name: 'Local Lima'
    }],
    total: 1, hasMore: false
  });
  const result = vmContext.getDirectorySiteData('SEDE_1');
  assert.deepEqual(Array.from(result.catalogs.locales, item => item.id), ['LOC_1']);
  assert.deepEqual(Array.from(result.catalogs.estructuraOrg, item => item.id), ['EST_1']);
  assert.deepEqual(Array.from(result.catalogs.estructuraLocal, item => item.id), ['REL_1']);
  assert.deepEqual(Array.from(result.catalogs.sedes, item => item.id), ['SEDE_1']);
});


test('el snapshot agregado vuelve a verificar TOTAL y limita estructuras, locales y relaciones a sedes autorizadas', () => {
  const start = serviceSource.indexOf('function _directoryBuildSiteData_(');
  const end = serviceSource.indexOf('function listDirectoryPeople(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('const allAuthorizedSites = !selectedSedeId'));
  assert.ok(implementation.includes('hasExclusiveTotalScope'));
  assert.ok(implementation.includes('authorizedSedeIds.has(recordSedeId)'));
  assert.ok(implementation.includes('authorizedSedeIds.has(nodeSedeId)'));
  assert.ok(implementation.includes('authorizedSedeIds.has(relationSedeId)'));
  assert.ok(implementation.includes('authorizedSedeIds.has(_directoryKey_(local.sede_id))'));
  assert.ok(implementation.includes('allAuthorizedSites && scopedSedes.length > 1'));
});

test('el enriquecimiento de asignaciones resuelve personas en una sola búsqueda proyectada por lote', () => {
  const context = assignmentContext();
  context.personas = [];
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext._directorySource_ = name => name;
  const lookups = [];
  vmContext.SUNARPCore = {
    findRecordsByFields: (source, filters, options) => {
      lookups.push({ source, filters, options });
      return {
        total: 2,
        records: [
          { persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez', correo_institucional: 'ana@sunarp.gob.pe' },
          { persona_id: 'PER_002', nombres: 'Luis', apellidos: 'Rojas', correo_institucional: 'luis@sunarp.gob.pe' }
        ]
      };
    }
  };
  const assignments = [
    {
      asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
      estructura_local_id: 'REL_1', local_id: 'LOC_1', active: true, order: 1
    },
    {
      asignacion_id: 'ASG_002', persona_id: 'PER_002', cargo_id: 'CAR_001',
      estructura_local_id: '', local_id: 'LOC_1', active: true, order: 2
    }
  ];
  const enriched = vmContext._directoryEnrichAssignmentRecords_(assignments, context);
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].source, 'personas');
  assert.deepEqual(
    JSON.parse(JSON.stringify(lookups[0].filters)),
    { persona_id: ['PER_001', 'PER_002'] }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(lookups[0].options.projectionFields)),
    ['persona_id', 'nombres', 'apellidos', 'correo_institucional']
  );
  assert.deepEqual(Array.from(enriched, item => item.nombres), ['Ana', 'Luis']);
  assert.deepEqual(Array.from(enriched, item => item.filter_sede_id), ['SEDE_1', 'SEDE_1']);
});

test('el enriquecimiento usa las personas ya cargadas en el contexto y evita una segunda lectura masiva', () => {
  const context = assignmentContext();
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext._directorySource_ = name => name;
  let peopleQueries = 0;
  vmContext.SUNARPCore = {
    findRecordsByFields: () => {
      peopleQueries++;
      throw new Error('No debe volver a consultar personas: ya están en el contexto agrupado.');
    }
  };
  const assignments = [{
    asignacion_id: 'ASG_001',
    persona_id: 'PER_001',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1',
    local_id: 'LOC_1',
    active: true,
    order: 1
  }];
  const diagnostics = {};
  const enriched = vmContext._directoryEnrichAssignmentRecords_(
    assignments, context, null, diagnostics
  );
  assert.equal(peopleQueries, 0);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].nombres, 'Ana');
  assert.equal(diagnostics.peopleSource, 'grouped-context');
  assert.equal(diagnostics.uniquePeople, 1);
});
test('Piura se resuelve por estructura_local_id sin depender de local_id físico', () => {
  const context = {
    personas: [{ persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' }],
    cargos: [{ id: 'CAR_001', name: 'Registrador' }],
    sedes: [{ id: 'ZR_I', name: 'Zona Registral N.° I', active: true }],
    locales: [{
      id: 'ZR_I_PIURA', name: 'Oficina Registral de Piura - Sede Principal',
      sede_id: 'ZR_I', tipo_local_id: 'SEDE_ZONAL', active: true
    }],
    tiposLocal: [{ id: 'SEDE_ZONAL', name: 'Sede zonal' }],
    tiposEstructura: [{ id: 'OFICINA_REGISTRAL', name: 'Oficina registral' }],
    estructuraOrg: [{
      id: 'ZR_I_OFICINA_PIURA', name: 'Oficina Registral Piura',
      parent_id: '', sede_id: 'ZR_I', tipo_estructura_id: 'OFICINA_REGISTRAL',
      active: true
    }],
    estructuraLocal: [{
      id: 'EL_ZR_I_PIURA', estructura_id: 'ZR_I_OFICINA_PIURA',
      local_id: 'ZR_I_PIURA', active: true, referencia: ''
    }]
  };
  const assignment = {
    asignacion_id: 'ASG_PIURA', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: 'EL_ZR_I_PIURA', local_id: '', active: true, order: 1
  };
  const location = sandbox._directoryResolveAssignmentLocation_(assignment, context, false);
  const enriched = sandbox._directoryEnrichAssignment_(
    assignment, context,
    sandbox._directoryCreateMap_(sandbox._directoryBuildRelations_(context, false)),
    sandbox._directoryCreateMap_(context.personas, 'persona_id'), location
  );
  assert.equal(location.sede_id, 'ZR_I');
  assert.equal(location.local.id, 'ZR_I_PIURA');
  assert.equal(enriched.filter_sede_id, 'ZR_I');
  assert.equal(enriched.filter_local_id, 'ZR_I_PIURA');
});

test('warmDirectoryContextCache exige permiso y precarga contexto sin devolver personas ni asignaciones', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  let requiredPermission = '';
  let receivedOptions = null;
  vmContext._directoryAuthorizationContext_ = permissionCode => {
    requiredPermission = permissionCode;
    return { auth: { personaId: 'PER_001' } };
  };
  vmContext._directoryLoadContext_ = options => {
    receivedOptions = options;
    return {
      personas: [{ persona_id: 'PER_001' }, { persona_id: 'PER_002' }],
      sedes: [{ id: 'SEDE_1' }],
      locales: [{ id: 'LOC_1' }],
      estructuraOrg: [{ id: 'ORG_1' }],
      estructuraLocal: [{ id: 'REL_1' }],
      asignaciones: []
    };
  };
  const result = vmContext.warmDirectoryContextCache();
  assert.equal(requiredPermission, 'INFORMACION_PERSONAL_VER');
  assert.equal(receivedOptions.includePeople, true);
  assert.equal(receivedOptions.includeAssignments, false);
  assert.equal(receivedOptions.includePersonalData, false);
  assert.equal(receivedOptions.includeDocumentTypes, false);
  assert.equal(result.warmed, true);
  assert.equal(result.peopleRowsLoaded, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'personas'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'records'), false);
});
test('la carga de contexto agrupa las fuentes de Directorios telefónicos en una lectura Core', () => {
  assert.match(serviceSource, /const context = requests\.length[\s\S]*?listRecordsFromSourcesCached\(requests/);
  assert.doesNotMatch(serviceSource, /const operationalRequests = requests\.filter/);
  assert.doesNotMatch(serviceSource, /const catalogRequests = requests\.filter/);
  assert.match(serviceSource, /includePeople: true,[\s\S]*?includeDocumentTypes: false/);
  assert.match(serviceSource, /_directoryLoadAuthorizationCatalog_/);
  assert.match(serviceSource, /getIntranetDataSource\('SECURITY', 'EstructuraOrg', 1\)/);
  assert.match(serviceSource, /_directorySource_\(DIRECTORY_SERVICE_CONFIG\.sheets\.locales\)/);
});
test('el caché del sitio depende de identidad, permisos y generaciones de las fuentes', () => {
  assert.match(serviceSource, /DIRECTORY_DATA_CACHE_TTL = 300/);
  assert.match(serviceSource, /DIRECTORY_CATALOG_CACHE_TTL = 300/);
  assert.match(serviceSource, /DIRECTORY_SITE_SNAPSHOT_CACHE_TTL = 600/);
  assert.match(serviceSource, /DIRECTORY_ASSIGNMENT_QUERY_CACHE_TTL = 300/);
  assert.match(serviceSource, /directory-site-snapshot:v4:/);
  assert.match(serviceSource, /_directoryAuthorizationCacheFingerprint_/);
  assert.match(serviceSource, /_directoryGetSiteDataCacheSources_/);
  assert.match(serviceSource, /cacheSeconds: DIRECTORY_ASSIGNMENT_QUERY_CACHE_TTL/);
  assert.match(accessServiceSource, /access-auth-context:v1:[\s\S]*?3600/);
  assert.match(accessServiceSource, /listRecordsFromSourcesCached\(requests, 60\)/);
});

test('la huella de caché de sede cambia por identidad, permiso, ámbitos y relaciones', () => {
  const vmContext = vm.createContext({
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      computeDigest: (_algorithm, value) => Array.from(
        crypto.createHash('sha256').update(String(value)).digest()
      ),
      base64EncodeWebSafe: bytes => Buffer.from(bytes)
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    }
  });
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const base = {
    auth: {
      personaId: 'PER_001',
      moduleAccess: [{
        modulo_id: 'MOD_INFO_PERSONAL',
        permissionCodes: ['INFORMACION_PERSONAL_VER'],
        scopes: [{ tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }]
      }]
    },
    moduleId: 'MOD_INFO_PERSONAL',
    permissionCode: 'INFORMACION_PERSONAL_VER',
    structures: [{ id: 'EST_1', parent_id: '', sede_id: 'SEDE_1' }],
    locals: [{ id: 'LOC_1', sede_id: 'SEDE_1' }]
  };
  const fingerprint = vmContext._directoryAuthorizationCacheFingerprint_(base);
  assert.equal(fingerprint.length, 43);
  assert.equal(vmContext._directoryAuthorizationCacheFingerprint_(base), fingerprint);

  const otherIdentity = JSON.parse(JSON.stringify(base));
  otherIdentity.auth.personaId = 'PER_002';
  assert.notEqual(vmContext._directoryAuthorizationCacheFingerprint_(otherIdentity), fingerprint);

  const otherScope = JSON.parse(JSON.stringify(base));
  otherScope.auth.moduleAccess[0].scopes[0].referencia_id = 'SEDE_2';
  assert.notEqual(vmContext._directoryAuthorizationCacheFingerprint_(otherScope), fingerprint);

  const otherPermission = JSON.parse(JSON.stringify(base));
  otherPermission.auth.moduleAccess[0].permissionCodes.push('INFORMACION_PERSONAL_EDITAR');
  assert.notEqual(vmContext._directoryAuthorizationCacheFingerprint_(otherPermission), fingerprint);
});

test('getDirectorySiteData carga todas las asignaciones de una sola sede con paginación interna de Core', () => {
  const context = assignmentContext();
  context.sedes.push({ id: 'SEDE_2', name: 'Piura', active: true });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow
  });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    assert.equal(options.includePeople, true);
    assert.equal(options.includePersonalData, false);
    assert.equal(options.includeDocumentTypes, false);
    assert.equal(options.validateSnapshot, false);
    return context;
  };
  vmContext._accessRecordIsAllowed_ = () => true;

  const records = [
    {
      asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
      estructura_local_id: 'REL_1', local_id: '', active: true, order: 1,
      nombres: 'Ana', apellidos: 'Pérez', cargo_name: 'Analista',
      estructura_id: 'EST_1', estructura_name: 'Oficina',
      sede_id: 'SEDE_1', filter_sede_id: 'SEDE_1',
      filter_local_id: 'LOC_1', local_name: 'Local Lima'
    },
    {
      asignacion_id: 'ASG_002', persona_id: 'PER_001', cargo_id: 'CAR_001',
      estructura_local_id: '', local_id: 'LOC_1', active: false, order: 2,
      nombres: 'Ana', apellidos: 'Pérez', cargo_name: 'Analista',
      estructura_id: '', estructura_name: '',
      sede_id: 'SEDE_1', filter_sede_id: 'SEDE_1',
      filter_local_id: 'LOC_1', local_name: 'Local Lima'
    }
  ];
  let enrichmentCalls = 0;
  vmContext._directoryEnrichAssignmentRecords_ = received => {
    enrichmentCalls++;
    assert.equal(received.length, 2);
    return received.slice();
  };
  const queryCalls = [];
  vmContext._directoryExecuteAssignmentQuery_ = (
    receivedContext, receivedAuthorization, options, idField, offset, limit, enrich
  ) => {
    queryCalls.push({ options, idField, offset, limit, enrich });
    return {
      records: offset === 0 ? [records[0]] : [records[1]],
      total: 2,
      hasMore: offset === 0
    };
  };

  const result = vmContext.getDirectorySiteData('SEDE_1');
  assert.equal(queryCalls.length, 2);
  assert.equal(queryCalls[0].options.sedeId, 'SEDE_1');
  assert.equal(queryCalls[1].options.sedeId, 'SEDE_1');
  assert.equal(queryCalls[0].offset, 0);
  assert.equal(queryCalls[1].offset, 1);
  assert.equal(queryCalls[0].limit, 1000);
  assert.equal(queryCalls[0].idField, 'asignacion_id');
  assert.equal(queryCalls[0].enrich, false);
  assert.equal(queryCalls[1].enrich, false);
  assert.equal(enrichmentCalls, 1);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.assignments, 2);
  assert.equal(result.catalogs.sedes.length, 1);
  assert.equal(result.catalogs.sedes[0].id, 'SEDE_1');
  assert.deepEqual(Array.from(result.catalogs.filterContract.selectable.localIds), ['LOC_1']);

  assert.throws(
    () => vmContext.getDirectorySiteData('SEDE_2'),
    /No tienes permiso para consultar la sede seleccionada/i
  );
  assert.equal(queryCalls.length, 2, 'La sede no autorizada se rechaza antes de consultar asignaciones.');
});

test('getDirectoryPersonById consulta solo asignaciones autorizadas de la persona solicitada', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const assignment = {
    asignacion_id: 'ASG_007',
    persona_id: 'PER_007',
    cargo_id: 'CAR_001',
    active: true,
    order: 1
  };
  const person = {
    persona_id: 'PER_007',
    nombres: 'Ana',
    apellidos: 'Pérez',
    correo_institucional: 'ana@sunarp.gob.pe'
  };
  const personalData = {
    servidor_id: 'PER_007',
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  };
  vmContext._directoryAuthorizationContext_ = () => ({ auth: {}, moduleId: 'MOD_INFO_PERSONAL' });
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    assert.equal(options.includePeople, false);
    assert.equal(options.includePersonalData, false);
    return { asignaciones: [], personas: [], datosPersonales: [] };
  };
  let queryOptions = null;
  vmContext._directoryExecuteAssignmentQuery_ = (_context, _authorization, options) => {
    queryOptions = options;
    return { records: [assignment], total: 1 };
  };
  vmContext._directorySource_ = name => name;
  const lookups = [];
  vmContext.SUNARPCore = {
    findRecordsByFields: (source, filters) => {
      lookups.push({ source, filters });
      if (source === 'personas') return { records: [person], total: 1 };
      if (source === 'servidores datos personales') return { records: [personalData], total: 1 };
      return { records: [], total: 0 };
    }
  };

  const result = vmContext.getDirectoryPersonById('PER_007');
  assert.equal(queryOptions.personaId, 'PER_007');
  assert.equal(queryOptions.active, 'all');
  assert.equal(result.persona_id, 'PER_007');
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].nombres, 'Ana');
  assert.equal(result.personalData.servidor_id, 'PER_007');
  assert.equal(JSON.stringify(lookups), JSON.stringify([
    { source: 'personas', filters: { persona_id: 'PER_007' } },
    { source: 'servidores datos personales', filters: { servidor_id: 'PER_007' } }
  ]));
});

test('las consultas puntuales de asignaciones comprueban permiso y ámbito en Core', () => {
  const start = serviceSource.indexOf('function _directoryBuildAssignmentQuery_(');
  const end = serviceSource.indexOf('function _directoryExecuteAssignmentQuery_(', start);
  const builder = serviceSource.slice(start, end);
  assert.match(builder, /if \(options\.asignacionId\) baseFilters\.asignacion_id/);
  assert.match(builder, /permissionCode: authorization\.permissionCode/);

  for (const name of ['getDirectoryAssignmentById', 'setDirectoryAssignmentActive', 'deleteDirectoryAssignment']) {
    const begin = serviceSource.indexOf('function ' + name + '(');
    const next = serviceSource.indexOf('\nfunction ', begin + 10);
    const implementation = serviceSource.slice(begin, next);
    assert.match(implementation, /includeAssignments:\s*false/);
    assert.match(implementation, /_directoryFindAuthorizedAssignmentById_\(/);
  }
  assert.match(serviceSource, /function _directoryFindAuthorizedAssignmentById_\([\s\S]*?\{ asignacionId: id, active: 'all' \}/);
});


test('deleteDirectoryPerson valida el ámbito con las asignaciones puntuales, no con el contexto vacío', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const person = {
    persona_id: 'PER_009',
    nombres: 'Ana',
    apellidos: 'Pérez'
  };
  const linkedAssignment = {
    asignacion_id: 'ASG_009',
    persona_id: 'PER_009',
    estructura_local_id: 'REL_1',
    local_id: '',
    active: true
  };
  let assignmentsChecked = null;

  vmContext._directoryAuthorizationContext_ = () => ({ auth: {}, structures: [], locals: [] });
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    return { asignaciones: [], estructuraLocal: [], estructuraOrg: [], locales: [] };
  };
  vmContext._directoryFindPersonById_ = () => person;
  vmContext._directoryAssertPersonMutationScope_ = (_authorization, _person, assignments) => {
    assignmentsChecked = assignments;
  };
  vmContext._directorySource_ = name => name;
  vmContext.SUNARPCore = {
    findRecordsByFields: (source, filters) => {
      assert.equal(source, 'asignaciones');
      assert.deepEqual(JSON.parse(JSON.stringify(filters)), { persona_id: 'PER_009' });
      return { records: [linkedAssignment], total: 1 };
    }
  };

  assert.throws(
    () => vmContext.deleteDirectoryPerson('PER_009'),
    /tiene 1 asignación/
  );
  assert.equal(assignmentsChecked.length, 1);
  assert.equal(assignmentsChecked[0].asignacion_id, 'ASG_009');
});

test('la validación de contexto parcial conserva las relaciones sin exigir cargar todas las personas', () => {
  const context = assignmentContext();
  context.personas = [];
  context.datosPersonales = [];
  context.asignaciones = [{
    asignacion_id: 'ASG_001',
    persona_id: 'PER_001',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1',
    local_id: ''
  }];
  assert.doesNotThrow(() =>
    api.validateSnapshot(context, {
      includePeople: false,
      includePersonalData: false
    })
  );
});

test('acepta una asignación vinculada únicamente a estructura_local_id y no completa local_id', () => {
  const context = assignmentContext();
  const assignment = { estructura_local_id: 'REL_1', local_id: '' };
  const resolved = api.resolveAssignmentLocation(assignment, context, true);
  assert.equal(resolved.estructura_id, 'EST_1');
  assert.equal(resolved.sede_id, 'SEDE_1');
  assert.equal(resolved.local.name, 'Local Lima');
  assert.equal(assignment.local_id, '');
});

test('acepta una asignación vinculada únicamente a local_id', () => {
  const context = assignmentContext();
  const resolved = api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: 'LOC_1' }, context, true
  );
  assert.equal(resolved.estructura_id, '');
  assert.equal(resolved.sede_id, 'SEDE_1');
  assert.equal(resolved.local.name, 'Local Lima');
});

test('acepta ambos identificadores cuando corresponden a la misma relación', () => {
  const context = assignmentContext();
  const resolved = api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_1', local_id: 'LOC_1' }, context, true
  );
  assert.equal(resolved.estructura_id, 'EST_1');
  assert.equal(resolved.sede_id, 'SEDE_1');
});

test('rechaza ambos identificadores vacíos', () => {
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: '' }, assignmentContext(), true
  ), /debe estar vinculada/i);
});

test('rechaza local y relación incoherentes', () => {
  const context = assignmentContext();
  context.locales.push({ id: 'LOC_2', name: 'Otro local', sede_id: 'SEDE_1' });
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_1', local_id: 'LOC_2' }, context, true
  ), /no corresponde/i);
});

test('rechaza referencias de relación o local inexistentes', () => {
  const context = assignmentContext();
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_X', local_id: '' }, context, true
  ), /relación estructura_local no existe/i);
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: 'LOC_X' }, context, true
  ), /local no existe/i);
});

test('la validación integral del snapshot admite los tres tipos de adscripción', () => {
  const context = assignmentContext();
  context.asignaciones = [
    { asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: '' },
    { asignacion_id: 'ASG_002', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: '', local_id: 'LOC_1' },
    { asignacion_id: 'ASG_003', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: 'LOC_1' }
  ];
  assert.doesNotThrow(() => api.validateSnapshot(context));
});

test('el esquema no exige individualmente estructura_local_id ni local_id', () => {
  const schema = api.assignmentSchema();
  assert.equal(schema.estructura_local_id.required, undefined);
  assert.equal(schema.local_id.required, undefined);
});


test('el enriquecimiento conserva la modalidad local-only y expone su sede y local', () => {
  const context = assignmentContext();
  const assignment = {
    asignacion_id: 'ASG_010', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  };
  const enriched = api.enrichAssignment(
    assignment, context, new Map(), new Map([['PER_001', context.personas[0]]])
  );
  assert.equal(enriched.estructura_id, '');
  assert.equal(enriched.sede_id, 'SEDE_1');
  assert.equal(enriched.local_name, 'Local Lima');
  assert.equal(enriched.display_location, 'Local Lima');
  assert.equal(enriched.local_id, 'LOC_1');
  assert.equal(enriched.filter_local_id, 'LOC_1');
  assert.equal(enriched.filter_sede_id, 'SEDE_1');
});

test('el enriquecimiento de una adscripción por relación expone el local canónico aunque local_id esté vacío', () => {
  const context = assignmentContext();
  const assignment = {
    asignacion_id: 'ASG_011', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1', local_id: '', active: true, order: 1
  };
  const relation = {
    id: 'REL_1', estructura_id: 'EST_1', local_id: 'LOC_1',
    estructura_name: 'Oficina', estructura_path: 'Oficina',
    sede_id: 'SEDE_1', local_name: 'Local Lima',
    display_name: 'Oficina — Local Lima'
  };
  const enriched = api.enrichAssignment(
    assignment, context, new Map([['REL_1', relation]]),
    new Map([['PER_001', context.personas[0]]])
  );
  assert.equal(enriched.local_id, '');
  assert.equal(enriched.filter_local_id, 'LOC_1');
  assert.equal(enriched.filter_sede_id, 'SEDE_1');
});

test('el orden se calcula por la combinación exacta de relación y local', () => {
  const records = [
    { estructura_local_id: 'REL_1', local_id: '', order: 3 },
    { estructura_local_id: '', local_id: 'LOC_1', order: 5 },
    { estructura_local_id: 'REL_1', local_id: 'LOC_1', order: 7 },
    { estructura_local_id: '', local_id: 'LOC_2', order: 20 }
  ];
  assert.equal(api.getNextOrder(records, 'REL_1', ''), 4);
  assert.equal(api.getNextOrder(records, '', 'LOC_1'), 6);
  assert.equal(api.getNextOrder(records, 'REL_1', 'LOC_1'), 8);
});


test('las asignaciones local-only aparecen en la vista autorizada', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_020', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  sandbox._accessRecordIsAllowed_ = () => true;
  const view = api.buildView(context, { auth: {}, structures: [] });
  assert.equal(view.assignments.length, 1);
  assert.equal(view.assignments[0].local_name, 'Local Lima');
  assert.equal(view.assignments[0].estructura_id, '');
});

test('el Directorio autoriza cada asignación antes de construir su registro enriquecido', () => {
  const context = assignmentContext();
  context.locales.push({ id: 'LOC_2', name: 'Local alterno', sede_id: 'SEDE_1' });
  context.estructuraOrg.push({ id: 'EST_2', name: 'Otra oficina', parent_id: '', sede_id: 'SEDE_1' });
  context.estructuraLocal.push({ id: 'REL_2', estructura_id: 'EST_2', local_id: 'LOC_2' });
  context.asignaciones = [
    { asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: '', active: true, order: 1 },
    { asignacion_id: 'ASG_002', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_2', local_id: '', active: true, order: 2 }
  ];
  let enrichments = 0;
  sandbox._directoryEnrichAssignment_ = (...args) => {
    enrichments++;
    return api.enrichAssignment(...args);
  };
  sandbox._accessRecordIsAllowed_ = (auth, moduleId, record) =>
    !record.estructura_id || record.estructura_id === 'EST_1';

  const view = api.buildView(context, { auth: {}, structures: [] });
  assert.equal(view.assignments.length, 1);
  assert.equal(view.assignments[0].asignacion_id, 'ASG_001');
  assert.equal(enrichments, 1);
});

test('el cambio de estado funciona para una asignación vinculada directamente a un local', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_021', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  let statusCall;
  sandbox._directoryAuthorizationContext_ = () => ({
    auth: {}, moduleId: 'MOD_INFO_PERSONAL',
    permissionCode: 'INFORMACION_PERSONAL_CAMBIAR_ESTADO', structures: [], locals: []
  });
  sandbox._directoryLoadContext_ = () => context;
  sandbox._directorySource_ = name => name;
  sandbox._directoryInvalidateCache_ = () => {};
  sandbox._accessRecordIsAllowed_ = () => true;
  sandbox._accessRunAudited_ = (auth, event, callback) => callback().value;
  sandbox._directoryFindAuthorizedAssignmentById_ = (_context, _authorization, id) =>
    context.asignaciones.find(item => item.asignacion_id === id) || null;
  sandbox.SUNARPCore = {
    findRecordsByFields: () => ({ records: context.personas, total: context.personas.length }),
    setRecordStatus: (...args) => { statusCall = args; return { success: true }; }
  };
  const result = sandbox.setDirectoryAssignmentActive('ASG_021', false);
  assert.deepEqual(statusCall.slice(1), ['asignacion_id', 'ASG_021', 'active', false]);
  assert.equal(result.assignment.active, false);
});

test('la eliminación funciona para una asignación vinculada directamente a un local', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_022', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  let deleteCall;
  sandbox._directoryAuthorizationContext_ = () => ({
    auth: {}, moduleId: 'MOD_INFO_PERSONAL',
    permissionCode: 'INFORMACION_PERSONAL_ELIMINAR', structures: [], locals: []
  });
  sandbox._directoryLoadContext_ = () => context;
  sandbox._directorySource_ = name => name;
  sandbox._directoryInvalidateCache_ = () => {};
  sandbox._accessRecordIsAllowed_ = () => true;
  sandbox._accessRunAudited_ = (auth, event, callback) => callback().value;
  sandbox._directoryFindAuthorizedAssignmentById_ = (_context, _authorization, id) =>
    context.asignaciones.find(item => item.asignacion_id === id) || null;
  sandbox.SUNARPCore = {
    findRecordsByFields: () => ({ records: context.personas, total: context.personas.length }),
    deleteRecord: (...args) => { deleteCall = args; return { success: true }; }
  };
  const result = sandbox.deleteDirectoryAssignment('ASG_022');
  assert.deepEqual(deleteCall.slice(1), ['asignacion_id', 'ASG_022']);
  assert.equal(result.asignacion_id, 'ASG_022');
});


function createAssignmentWriteSandbox(context) {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const writes = [];
  vmContext._directoryAuthorizationContext_ = () => ({ auth: {}, structures: [] });
  vmContext._directoryLoadContext_ = () => context;
  vmContext._directoryFindAuthorizedAssignmentById_ = (_context, _authorization, id) =>
    (context.asignaciones || []).find(item => String(item.asignacion_id) === String(id)) || null;
  vmContext._directoryGetNextOrderForLocation_ = (_context, _authorization, structureLocalId, localId) =>
    api.getNextOrder(context.asignaciones || [], structureLocalId, localId);
  vmContext._directorySource_ = name => name;
  vmContext._directoryInvalidateCache_ = () => {};
  vmContext._accessRecordIsAllowed_ = () => true;
  vmContext._accessRunAudited_ = (auth, event, callback) => callback().value;
  vmContext.SUNARPCore = {
    findRecordsByFields: () => ({
      records: (context.personas || []).slice(),
      total: (context.personas || []).length
    }),
    assertValidRecord: () => true,
    insertRecord: (source, record) => {
      writes.push({ operation: 'insert', source, record: Object.assign({}, record) });
      return { success: true, record };
    },
    updateRecord: (source, field, id, patch) => {
      writes.push({ operation: 'update', source, field, id, patch: Object.assign({}, patch) });
      return { success: true, record: Object.assign({}, patch, { [field]: id }) };
    }
  };
  return { context: vmContext, writes };
}



test('_directoryGetNextOrderForLocation_ consulta mediante Core y calcula el orden por adscripción exacta', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const candidates = [
    { asignacion_id: 'ASG_1', estructura_local_id: 'REL_1', local_id: '', order: 4 },
    { asignacion_id: 'ASG_2', estructura_local_id: 'REL_1', local_id: 'LOC_1', order: 40 },
    { asignacion_id: 'ASG_3', estructura_local_id: '', local_id: 'LOC_1', order: 8 },
    { asignacion_id: 'ASG_4', estructura_local_id: 'REL_2', local_id: '', order: 70 }
  ];
  const calls = [];
  vmContext._directoryExecuteAssignmentQuery_ = (...args) => {
    calls.push(args);
    return { records: candidates, total: candidates.length };
  };

  const relationOrder = vmContext._directoryGetNextOrderForLocation_(
    {}, { permissionCode: 'INFORMACION_PERSONAL_EDITAR' }, 'REL_1', ''
  );
  const localOrder = vmContext._directoryGetNextOrderForLocation_(
    {}, { permissionCode: 'INFORMACION_PERSONAL_EDITAR' }, '', 'LOC_1'
  );

  assert.equal(relationOrder, 5);
  assert.equal(localOrder, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.map(item => item[2]))), [
    { active: 'all', estructuraLocalId: 'REL_1' },
    { active: 'all', localId: 'LOC_1' }
  ]);
  calls.forEach(args => {
    assert.equal(args[3], 'asignacion_id');
    assert.equal(args[4], 0);
    assert.equal(args[5], 1000);
    assert.equal(args[6], false);
  });
});

test('editar una asignación la consulta puntualmente y no carga todas las asignaciones', () => {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const context = assignmentContext();
  context.asignaciones = [];
  const existing = {
    asignacion_id: 'ASG_025',
    persona_id: 'PER_001',
    cargo_id: 'CAR_001',
    condicion_cargo: 'TITULAR',
    anexo: '',
    estructura_local_id: 'REL_1',
    local_id: '',
    observaciones: 'Anterior',
    active: true,
    order: 4
  };
  let loadOptions = null;
  let assignmentLookup = null;
  let updateCall = null;

  vmContext._directoryAuthorizationContext_ = permissionCode => ({
    auth: {},
    moduleId: 'MOD_INFO_PERSONAL',
    permissionCode,
    structures: context.estructuraOrg,
    locals: context.locales
  });
  vmContext._directoryLoadContext_ = options => {
    loadOptions = options;
    return context;
  };
  vmContext._directoryFindAuthorizedAssignmentById_ = (_context, _authorization, id) => {
    assignmentLookup = id;
    return existing;
  };
  vmContext._directoryAssertScope_ = () => true;
  vmContext._directoryFindPersonById_ = () => context.personas[0];
  vmContext._directoryValidateAssignmentReferences_ = () => true;
  vmContext._accessRunAudited_ = (_auth, _event, callback) => callback().value;
  vmContext._directorySource_ = name => name;
  vmContext.SUNARPCore = {
    assertValidRecord: () => true,
    updateRecord: (...args) => {
      updateCall = args;
      return { success: true, record: Object.assign({}, args[3], { asignacion_id: args[2] }) };
    }
  };

  const result = vmContext.saveDirectoryAssignment({
    asignacion_id: 'ASG_025',
    observaciones: 'Actualizada'
  });

  assert.equal(loadOptions.includeAssignments, false);
  assert.equal(loadOptions.validateSnapshot, false);
  assert.equal(assignmentLookup, 'ASG_025');
  assert.equal(updateCall[0], 'asignaciones');
  assert.equal(updateCall[1], 'asignacion_id');
  assert.equal(updateCall[2], 'ASG_025');
  assert.equal(updateCall[3].observaciones, 'Actualizada');
  assert.equal(updateCall[3].order, 4);
  assert.equal(result.assignment.asignacion_id, 'ASG_025');
});

test('el guardado persiste exactamente los tres modelos de adscripción', () => {
  const cases = [
    { estructura_local_id: 'REL_1', local_id: '' },
    { estructura_local_id: '', local_id: 'LOC_1' },
    { estructura_local_id: 'REL_1', local_id: 'LOC_1' }
  ];
  cases.forEach((location, index) => {
    const fixture = createAssignmentWriteSandbox(assignmentContext());
    fixture.context.saveDirectoryAssignment(Object.assign({
      persona_id: 'PER_001', cargo_id: 'CAR_001', active: true
    }, location));
    const saved = fixture.writes[0].record;
    assert.equal(saved.estructura_local_id, location.estructura_local_id);
    assert.equal(saved.local_id, location.local_id);
  });
});

test('el guardado rechaza una asignación sin adscripción antes de escribir', () => {
  const fixture = createAssignmentWriteSandbox(assignmentContext());
  assert.throws(() => fixture.context.saveDirectoryAssignment({
    persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: ''
  }), /debe estar vinculada/i);
  assert.equal(fixture.writes.length, 0);
});

test('la edición parcial conserva la adscripción local-only existente', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_030', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 4
  }];
  const fixture = createAssignmentWriteSandbox(context);
  fixture.context.saveDirectoryAssignment({
    asignacion_id: 'ASG_030', observaciones: 'Actualizada'
  });
  const patch = fixture.writes[0].patch;
  assert.equal(patch.estructura_local_id, '');
  assert.equal(patch.local_id, 'LOC_1');
  assert.equal(patch.observaciones, 'Actualizada');
});

test('la edición permite pasar de ambos identificadores a local-only vaciando la relación', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_031', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1', local_id: 'LOC_1', active: true, order: 4
  }];
  const fixture = createAssignmentWriteSandbox(context);
  fixture.context.saveDirectoryAssignment({
    asignacion_id: 'ASG_031', estructura_local_id: ''
  });
  assert.equal(fixture.writes[0].patch.estructura_local_id, '');
  assert.equal(fixture.writes[0].patch.local_id, 'LOC_1');
});


test('el Directorio utiliza exclusivamente la caché central de SUNARP Core con lecturas agrupadas', () => {
  assert.match(serviceSource, /SUNARPCore\.listRecordsFromSourcesCached\(requests, Math\.min\(/);
  assert.doesNotMatch(serviceSource, /const operationalRequests = requests\.filter/);
  assert.doesNotMatch(serviceSource, /const catalogRequests = requests\.filter/);
  assert.doesNotMatch(serviceSource, /function _directoryWriteCachedContext_/);
  assert.doesNotMatch(serviceSource, /function _directoryReadCachedContext_/);
  assert.doesNotMatch(serviceSource, /DIRECTORY_CACHE_PART_SUFFIX/);
  assert.match(serviceSource, /sources\.map\(source => SUNARPCore\.invalidateSourceCache\(source\)\)/);
  assert.match(serviceSource, /function clearDirectoryCache\(\)/);
});

test('la carga inicial solo entrega sedes y la carga de datos se restringe a la sede seleccionada', () => {
  const initialStart = serviceSource.indexOf('function getDirectoryInitialData() {');
  const siteStart = serviceSource.indexOf('function getDirectorySiteData(', initialStart);
  const peopleStart = serviceSource.indexOf('function listDirectoryPeople(', siteStart);
  const initial = serviceSource.slice(initialStart, siteStart);
  const siteData = serviceSource.slice(siteStart, peopleStart);
  const listingStart = serviceSource.indexOf('function listDirectoryAssignments(', peopleStart);
  const listingEnd = serviceSource.indexOf('function ', listingStart + 10);
  const listing = serviceSource.slice(listingStart, listingEnd);

  assert.match(initial, /_directoryGetAuthorizedSedeIds_/);
  assert.match(initial, /assignmentsLoaded:\s*0/);
  assert.doesNotMatch(initial, /_directoryLoadContext_|_directoryExecuteAssignmentQuery_|queryRecords/);

  assert.match(siteData, /_directoryGetAuthorizedSedeIds_/);
  assert.match(siteData, /\{ active: 'all', sedeId: selectedSedeId \}/);
  assert.match(siteData, /_directoryExecuteAssignmentQuery_/);
  assert.match(siteData, /pageSize = 1000/);
  assert.match(siteData, /records\.length !== \(expectedTotal \|\| 0\)/);
  assert.match(siteData, /No tienes permiso para consultar la sede seleccionada/);

  assert.match(listing, /includeAssignments:\s*false/);
  assert.match(listing, /_directoryExecuteAssignmentQuery_/);
  assert.match(serviceSource, /function _directoryBuildAssignmentQuery_/);
  assert.match(serviceSource, /SUNARPCore\.queryRecords/);
  assert.match(serviceSource, /selectedSiteId/);
  assert.match(serviceSource, /options\.cargoId/);
  assert.match(serviceSource, /selectedStructureId/);
  assert.match(listing, /pageSize > 100/);
  assert.doesNotMatch(listing, /view\.assignments/);
});

test('el ingreso no carga personas, asignaciones ni datos personales; la sede seleccionada carga una instantánea autorizada', () => {
  const initialStart = serviceSource.indexOf('function getDirectoryInitialData() {');
  const siteStart = serviceSource.indexOf('function getDirectorySiteData(', initialStart);
  const initial = serviceSource.slice(initialStart, siteStart);
  const siteDataEnd = serviceSource.indexOf('function listDirectoryPeople(', siteStart);
  const siteData = serviceSource.slice(siteStart, siteDataEnd);

  assert.match(initial, /listRecordsFromSourcesCached/);
  assert.match(initial, /records:\s*\[\]/);
  assert.doesNotMatch(initial, /includePersonalData|includePeople|includeAssignments|tipo_documento|numero_documento|_directoryLoadContext_/);

  assert.match(siteData, /includePersonalData:\s*false/);
  assert.match(siteData, /includePeople:\s*true/);
  assert.match(siteData, /includeDocumentTypes:\s*false/);
  assert.match(siteData, /includeAssignments:\s*false/);
  assert.match(siteData, /records,/);
  assert.match(serviceSource, /filter_local_id: local \? _directoryKey_\(local\.id\) : _directoryKey_\(assignment\.local_id\)/);
  assert.match(serviceSource, /function getDirectoryPersonById\([\s\S]*?findRecordsByFields\([\s\S]*?servidor_id/s);
  assert.match(frontendScript, /callServer\('getDirectoryPersonById', record\.persona_id\)/);
});

test('la autorización y el enriquecimiento reutilizan la adscripción resuelta una sola vez', () => {
  const start = serviceSource.indexOf('function _directoryBuildView_(');
  const end = serviceSource.indexOf('function _directorySortAssignments_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('_directoryResolveAssignmentLocation_(item, context, false)'));
  assert.ok(implementation.includes('estructura_id: location.estructura_id'));
  assert.ok(implementation.includes('sede_id: location.sede_id'));
  assert.ok(implementation.includes('record,'));
  assert.ok(implementation.includes('peopleMap, location'));
});

test('el ordenamiento resuelve una sola vez la adscripción de cada registro', () => {
  const start = serviceSource.indexOf('function _directorySortAssignments_(');
  const end = serviceSource.indexOf('function _directoryGetPersonSchema_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('const sortable = records.map'));
  assert.ok(implementation.includes('return sortable.map'));
  assert.equal(implementation.split('_directoryResolveAssignmentLocation_(').length - 1, 1);
});


test('la interfaz conserva la instantánea anterior cuando falla una actualización', () => {
  const loadStart = frontendSource.indexOf('async function load(force = false)');
  const loadEnd = frontendSource.indexOf('/* =====================================================\n     15. NAVEGACIÓN', loadStart);
  const loadSource = frontendSource.slice(loadStart, loadEnd);
  assert.ok(loadSource.includes('const hadLoadedSnapshot = state.loaded'));
  assert.ok(loadSource.includes('state.loaded = hadLoadedSnapshot'));
  assert.ok(loadSource.includes('if (!hadLoadedSnapshot && elements.table)'));
  assert.ok(loadSource.includes('Se conserva la información cargada.'));
});

test('el contrato de filtros separa ámbitos fijos, opciones autorizadas y ancestros contextuales', () => {
  const authorization = {
    moduleId: 'MOD_INFO_PERSONAL',
    auth: { moduleAccess: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      scopes: [
        { tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_1', incluir_descendientes: true },
        { tipo_ambito_id: 'LOCAL', referencia_id: 'LOC_9', incluir_descendientes: false }
      ]
    }] }
  };
  const structures = [
    { id: 'EST_ROOT', parent_id: '' },
    { id: 'EST_1', parent_id: 'EST_ROOT' },
    { id: 'EST_CHILD', parent_id: 'EST_1' }
  ];
  const contract = api.buildFilterContract(authorization, [
    { estructura_id: 'EST_CHILD', sede_id: 'SEDE_1', local_id: 'LOC_1', cargo_id: 'CAR_1' },
    { estructura_id: '', sede_id: 'SEDE_2', local_id: 'LOC_9', cargo_id: 'CAR_2' }
  ], structures);

  assert.equal(JSON.stringify(contract.scopes), JSON.stringify([
    { type: 'ESTRUCTURA_ORG', referenceId: 'EST_1', includeDescendants: true },
    { type: 'LOCAL', referenceId: 'LOC_9', includeDescendants: false }
  ]));
  assert.equal(JSON.stringify(contract.fixed.structureIds), JSON.stringify(['EST_1']));
  assert.equal(JSON.stringify(contract.fixed.localIds), JSON.stringify(['LOC_9']));
  assert.equal(JSON.stringify(contract.selectable.sedeIds), JSON.stringify(['SEDE_1', 'SEDE_2']));
  assert.equal(JSON.stringify(contract.selectable.cargoIds), JSON.stringify(['CAR_1', 'CAR_2']));
  assert.equal(JSON.stringify(contract.selectable.structureIds), JSON.stringify(['EST_CHILD']));
  assert.equal(JSON.stringify(contract.contextStructureIds), JSON.stringify(['EST_1', 'EST_ROOT']));
});

test('el contrato de filtros reconoce TOTAL sin convertirlo en una selección restrictiva', () => {
  const contract = api.buildFilterContract({
    moduleId: 'MOD_INFO_PERSONAL',
    auth: { moduleAccess: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }]
    }] }
  }, [{ sede_id: 'SEDE_1', cargo_id: 'CAR_1', estructura_id: 'EST_1', local_id: 'LOC_1' }], []);
  assert.equal(contract.fixed.total, true);
  assert.equal(JSON.stringify(contract.fixed.sedeIds), '[]');
  assert.equal(JSON.stringify(contract.selectable.sedeIds), JSON.stringify(['SEDE_1']));
});


test('Información de personal carga automáticamente la única sede autorizada sin filtrar por Local', () => {
  assert.match(frontendSource, /state\.authorizedSedes\.length === 1/);
  assert.match(frontendSource, /result\.scopeSummary && result\.scopeSummary\.total/);
  assert.doesNotMatch(frontendSource, /callServer\('getDirectoryAuthorizedData'\)/);
  assert.doesNotMatch(frontendSource, /state\.activeSedeId = '__ALL__'/);
  assert.doesNotMatch(frontendSource, /autoLoadedAllSites = true/);
  assert.match(frontendSource, /Seleccione una opción/);
  assert.match(frontendSource, /autoLoadedSoleSede = true/);
  assert.match(frontendSource, /await loadSelectedSede\(soleSedeId\)/);
  assert.match(frontendSource, /wrapper\.hidden = fixedSingleSede/);
  assert.match(frontendSource, /state\.hierarchySelectableIds = _directoryBuildHierarchyFilterSets_/);
  assert.match(frontendSource, /if \(wrapper\) wrapper\.hidden = cargos\.length === 0/);
  assert.doesNotMatch(frontendSource, /localFilter\.addEventListener/);
  assert.doesNotMatch(frontendSource, /recordsByLocal\.size > 0/);
});

test('Información de personal carga por sede una vez y usa filtros, búsqueda y paginación locales', () => {
  assert.match(frontendSource, /callServer\('getDirectorySiteData', selectedSedeId\)/);
  assert.match(frontendSource, /mode:\s*'client'/);
  assert.match(frontendSource, /const preparedRows = prepareRows\(filteredRecords\)/);
  assert.match(frontendSource, /data:\s*preparedRows/);
  assert.match(frontendSource, /renderStackedTableCell\([\s\S]*?record\.local_display/);
  assert.match(frontendSource, /record\.estructura_path[\s\S]*?dependencia_secondary_display/);
  assert.doesNotMatch(frontendSource, /key: 'local_display', label: 'Local'/);
  assert.match(frontendSource, /state\.table\.setData\(options\.data\)/);
  assert.match(frontendSource, /siteDataCache/);
  assert.match(frontendSource, /DIRECTORY_SITE_CLIENT_CACHE_TTL_MS = 600000/);
  assert.match(frontendSource, /DIRECTORY_SITE_CLIENT_CACHE_MAX_ENTRIES = 5/);
  assert.match(frontendSource, /function getSiteClientCacheData\(/);
  assert.match(frontendSource, /function rememberSiteClientCacheData\(/);
  assert.match(frontendSource, /callServer\('warmDirectoryContextCache'\)/);
  assert.match(frontendSource, /await state\.contextWarmupPromise/);
  assert.match(frontendSource, /contextWarmupWaitMs/);
  assert.match(frontendSource, /Date\.now\(\) - entry\.loadedAt >= DIRECTORY_SITE_CLIENT_CACHE_TTL_MS/);
  assert.match(frontendSource, /state\.siteDataCache\.set\(id, \{ data, loadedAt: Date\.now\(\) \}\)/);
  assert.match(frontendSource, /state\.catalogs = result\.catalogs;/);
  assert.doesNotMatch(frontendSource, /state\.catalogs = Object\.assign\(\{\}, result\.catalogs, \{\s*sedes: state\.authorizedSedes/);
  assert.match(frontendSource, /async function refreshActiveSede\(/);
  assert.doesNotMatch(frontendSource, /listDirectoryAssignments/);
  assert.doesNotMatch(frontendSource, /mode:\s*'server'/);
  assert.doesNotMatch(frontendSource, /loadData:/);
  assert.match(frontendSource, /function populateSedeFilter\([\s\S]*?wrapper\.hidden = fixedSingleSede/);
  assert.match(frontendSource, /state\.authorizedSedes\.length === 1/);
  assert.match(frontendSource, /await loadSelectedSede\(soleSedeId\)/);
  assert.match(frontendSource, /const includeDescendants = scope\.includeDescendants === true/);
  assert.match(frontendSource, /state\.hierarchySelectableIds/);
  assert.doesNotMatch(frontendSource, /selectableByLocal\.forEach/);
  assert.doesNotMatch(frontendSource, /!siteId \|\| siteId !== state\.activeSedeId \|\| !localId/);
  assert.match(uiDataTableSource, /setData\(nextData\)/);
});

