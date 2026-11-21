# Contrato público de SUNARP Core — extensión de fuente para v11 (base v10)

**Estado:** Fase 1 completada para la arquitectura integrada de SUNARP Core y Gestor de intranet SUNARP. Core v10 está publicada como biblioteca, las pruebas de Core y las 192 pruebas de regresión del repositorio fueron satisfactorias, el Gestor fue sincronizado con la versión 10 y la validación funcional inicial confirmó autenticación y carga de Información de personal. La auditoría confirmó que no hay activadores instalados en Core ni en Gestor; las ediciones manuales requieren invalidación explícita y esta limitación queda aceptada/documentada. Los demás proyectos Backend aún no unificados quedan fuera del alcance de esta fase.  
**Biblioteca:** `1mDzO7uTarQCKYpS5U7pMv5go0Wh76k3JoIh5GvxWPfU0zoUG7Jfp17tD`  
**Consumidor del repositorio:** Gestor de intranet SUNARP. El manifiesto del repositorio y el proyecto Apps Script consumidor están sincronizados con Core versión 10. La aplicación se probó mediante el mecanismo de pruebas existente; no se actualizó el despliegue productivo.

Este documento enumera la superficie global que Apps Script expone a los proyectos consumidores, describe los parámetros y las respuestas observables en el código y diferencia expresamente las lecturas completas de las consultas selectivas. Las funciones privadas cuyos nombres empiezan y terminan con guion bajo no forman parte de la API de la biblioteca.

## 1. Convenciones comunes

### 1.1 Fuente

Las funciones que operan sobre hojas reciben una configuración de fuente:

```js
{
  spreadsheetId: 'ID_DEL_ARCHIVO',
  sheetName: 'Nombre de pestaña',
  headerRow: 1,              // opcional; por defecto 1
  label: 'Nombre descriptivo', // opcional
  dependencies: [            // opcional
    { spreadsheetId: '...', sheetName: '...', headerRow: 1 }
  ]
}
```

Core no fija nombres de archivos, pestañas ni columnas de negocio. Comprueba la existencia del archivo, pestaña, encabezados y campos que exige cada operación. `dependencies` declara fuentes maestras que intervienen en la vigencia de una réplica o resultado derivado. Los ciclos de dependencias impiden obtener una generación efectiva segura.

Los registros devueltos conservan los valores de hoja convertidos a objetos cuyas propiedades corresponden a los encabezados. Los identificadores de SUNARP deben tratarse como cadenas cuando el modelo así lo establece.

### 1.2 Tipos y estados

- Para usuarios, asignaciones de rol, relaciones rol-permiso, permisos y ámbitos, solo se considera activo el booleano `true` o el texto `"TRUE"` (sin distinguir mayúsculas y después de recortar espacios). `false`, `null`, `undefined` y cualquier otro valor —incluidos `1`, `"SI"` y `"ACTIVO"`— no conceden actividad. En los catálogos organizacionales de estructuras y locales, la ausencia de la propiedad `active` se interpreta como activo por compatibilidad; cuando la propiedad existe se aplica la misma regla estricta.
- `incluir_descendientes` se interpreta como verdadero para `true`, `"TRUE"`, `"SI"`, `"SÍ"`, `"YES"` o `"1"` (sin distinguir mayúsculas y recortando espacios).
- Los campos de fechas pueden recibirse como valores `Date` o como cadenas según el adaptador y la fuente.
- El comparador exacto común considera equivalentes `''`, `null` y `undefined`; compara dos fechas `Date` por su instante; para los demás valores compara su representación textual recortada y distingue mayúsculas/minúsculas. En `findRecordsByFields`, `matchCase` e `ignoreWhitespace` modifican únicamente la comparación de la columna conductora. En `queryRecords`, `TextFinder` localiza candidatos sin distinguir mayúsculas, pero Core vuelve a comprobar los filtros exactos con el comparador sensible a mayúsculas. Una búsqueda parcial es un contrato distinto.

### 1.3 Respuestas de consulta

Las respuestas de lectura suelen utilizar `{ records, total }`; las lecturas paginadas añaden `offset`, `limit` y, según el método, `hasMore`. Las respuestas de escritura indican `success`, un mensaje y, cuando corresponde, el registro afectado o contadores.

## 2. Inventario de la API pública

En el HEAD auditado se identificaron **32 funciones globales públicas**. La lista siguiente se ha obtenido de las declaraciones de los archivos de Core, excluyendo los auxiliares privados.

| Módulo | Función pública | Firma |
|---|---|---|
| Identidad y autorización | `getCurrentUserEmail` | `()` |
| Identidad y autorización | `resolveIdentity` | `(source, email, options)` |
| Identidad y autorización | `resolveAuthorizationContext` | `(data)` |
| Identidad y autorización | `authorizationHasPermission` | `(context, permissionCode, moduloId)` |
| Identidad y autorización | `authorizationIsRecordInScope` | `(context, moduloId, record, structures, fields, locals)` |
| Repositorio compuesto | `updateRecordByFields` | `(source, criteria, updates, options)` |
| Repositorio compuesto | `syncRecordsByKey` | `(source, parentMatch, keyFields, desiredRecords, statusField, activeValue, inactiveValue, options)` |
| Repositorio compuesto | `appendAuditEvent` | `(source, record, idField)` |
| Repositorio compuesto | `runSourceWriteBatch` | `(sources, writer)` |
| Caché | `invalidateSourceCache` | `(source)` |
| Caché | `getCachedValue` | `(key)` |
| Caché | `getOrBuildCachedValue` | `(key, sources, builder, expirationSeconds)` |
| Caché | `putCachedValue` | `(key, value, expirationSeconds)` |
| Caché | `removeCachedValue` | `(key)` |
| Caché | `removeCachedValues` | `(keys)` |
| Consultas autorizadas | `queryRecords` | `(source, options)` |
| Repositorio | `listRecords` | `(source, options)` |
| Repositorio | `listTailRecords` | `(source, options)` |
| Repositorio | `getRecordById` | `(source, idField, id)` |
| Repositorio | `findRecordsByFields` | `(source, filters, options)` |
| Repositorio | `searchRecordsByFields` | `(source, query, fields, options)` |
| Repositorio | `insertRecord` | `(source, record, options)` |
| Repositorio | `updateRecord` | `(source, idField, id, updates, options)` |
| Repositorio | `setRecordStatus` | `(source, idField, id, statusField, statusValue, options)` |
| Repositorio | `deleteRecord` | `(source, idField, id)` |
| Repositorio | `listRecordsFromSourcesCached` | `(requests, expirationSeconds)` |
| Repositorio | `listRecordsFromSources` | `(requests)` |
| Fuentes | `getSourceInfoCached` | `(source, expirationSeconds)` |
| Fuentes | `getSourceInfo` | `(source)` |
| Validación | `validateRecord` | `(record, schema, options)` |
| Validación | `assertValidRecord` | `(record, schema, options)` |
| Pruebas Apps Script | `runCoreTests` | `()` |

Los métodos públicos no quedan automáticamente garantizados por el número de versión declarado por un consumidor. El proyecto consumidor debe apuntar a una versión de biblioteca realmente creada que contenga estas implementaciones.

## 3. Identidad y autorización

### 3.1 `getCurrentUserEmail()`

Obtiene el correo de `Session.getActiveUser().getEmail()`, lo convierte a minúsculas y elimina espacios periféricos. Puede devolver cadena vacía cuando Apps Script no facilita el correo en el contexto de ejecución. El correo es un dato para resolver identidad; **no sustituye a `persona_id` como identidad de autorización**.

### 3.2 `resolveIdentity(source, email, options)`

Resuelve una persona mediante una coincidencia exacta e insensible a mayúsculas/minúsculas.

```js
resolveIdentity(source, email, {
  emailField: 'correo_institucional',
  idField: 'persona_id',
  requiredHeaders: ['persona_id', 'correo_institucional']
})
// { records: [...], total: n }
```

`emailField` e `idField` son obligatorios. Un correo vacío devuelve `{ records: [], total: 0 }`. La búsqueda se realiza con `findRecordsByFields` y después vuelve a comprobar la igualdad del correo normalizado y que el campo de identidad tenga contenido. La aplicación consumidora debe rechazar la ambigüedad si aparecen identidades duplicadas; esta función devuelve las coincidencias encontradas. Admite `projectionFields` opcional: Core añade siempre `emailField` e `idField` para verificar la identidad y devolver `persona_id`; cuando no se declara, conserva el resultado completo por compatibilidad.

### 3.3 `resolveAuthorizationContext(data)`

Recibe los registros de seguridad ya recuperados por el consumidor. Core no consulta hojas ni resuelve correos dentro de esta función.

```js
{
  personaId: 'PER_117',
  users: [{ persona_id, active }],
  modules: [{ modulo_id, codigo, nombre, active }],
  roles: [{ rol_id, nombre, active }],
  userRoles: [{ persona_id, modulo_id, rol_id, active }],
  permissions: [{ permiso_id, codigo, modulo_id, active }],
  rolePermissions: [{ rol_id, permiso_id, active }],
  scopes: [{
    persona_id, modulo_id, tipo_ambito_id, referencia_id,
    incluir_descendientes, active
  }]
}
```

Respuesta:

```js
{
  authenticated: true | false,
  personaId: 'PER_117',
  user: { ... } | null,
  moduleAccess: [{
    modulo_id,
    module,
    rol_id,
    role,
    permissions: [...],
    permissionCodes: [...],
    scopes: [...]
  }]
}
```

Reglas efectivamente aplicadas:

- La identidad es `personaId` (`persona_id` en las tablas).
- Debe existir exactamente un usuario activo para esa persona; más de uno genera error.
- Solo se consideran módulos, roles y permisos activos con identificadores/códigos activos únicos.
- La persona puede tener como máximo un rol activo por módulo. Una asignación a un módulo inexistente o inactivo no concede acceso.
- Un permiso concedido por `RolPermiso` solo se incluye cuando pertenece al mismo módulo de la asignación persona-rol.
- Los ámbitos se asocian a la persona y al módulo correspondiente y solo se incluyen para módulos con asignación activa de rol.

La función no reemplaza las validaciones de integridad del servicio administrativo. Debe recibir las relaciones pertinentes y confiables del usuario que se está autorizando, no utilizarse como sustituto de una auditoría global de todas las tablas.

### 3.4 `authorizationHasPermission(context, permissionCode, moduloId)`

Comprueba el código de permiso dentro del `modulo_id` indicado. El módulo es obligatorio; no existe una concesión global por código. Devuelve booleano.

### 3.5 `authorizationIsRecordInScope(context, moduloId, record, structures, fields, locals)`

Comprueba pertenencia de un registro a alguno de los ámbitos activos del módulo. El catálogo `structures` se interpreta por defecto con `{ id, parent_id, sede_id }`; `locals` con `{ id, sede_id }`.

`fields` permite adaptar los nombres de propiedades:

| Propiedad | Valor por defecto |
|---|---|
| `recordOrganizationStructureId` | `estructura_org_id` |
| `recordStructureId` | `estructura_id` |
| `recordLocalId` | `local_id` |
| `recordSiteId` | `sede_id` |
| `structureId` | `id` |
| `structureParentId` | `parent_id` |
| `structureSiteId` | `sede_id` |
| `localId` | `id` |
| `localSiteId` | `sede_id` |

Comportamiento:

- Sin ámbito activo, deniega.
- `TOTAL` es exclusivo: se permite solo cuando es el único ámbito activo y `referencia_id` está vacío. Una mezcla de TOTAL con ámbitos específicos deniega.
- `SEDE` deriva la sede con esta precedencia: si el registro declara estructura, utiliza `sede_id` de esa estructura; si no declara estructura pero sí local, utiliza `sede_id` del local; si no declara ninguno, utiliza `record.sede_id`. Si declara estructura y local, ambos deben existir y, cuando ambos informan sede, estas deben coincidir. Si existe estructura pero no permite obtener su sede, Core no sustituye ese dato con la sede del local.
- `ESTRUCTURA_ORG` exige que tanto la estructura de referencia como la del registro existan en el catálogo. Permite la coincidencia directa; admite descendientes solo cuando `incluir_descendientes` es verdadero y existe la relación `parent_id`.
- `LOCAL` permite únicamente la adscripción directa al local: el registro debe referenciar un local existente y no tener estructura orgánica.
- Todo `local_id` declarado debe existir en el catálogo. Cuando el registro contiene estructura y local, sus sedes deben concordar si ambas están informadas.

Los ámbitos específicos se evalúan como alternativas (OR): un registro que coincida con cualquiera de ellos puede ser autorizado. La función genérica no impone por sí sola una política administrativa adicional de “una sola sede por persona”; esa restricción debe validarse al crear/modificar ámbitos en el servicio de administración. Tampoco debe permitirse una combinación de ámbitos que amplíe accidentalmente los permisos.

## 4. Consultas y repositorio

### 4.1 `listRecords(source, options)`

Lectura general que materializa los registros de la fuente y después aplica en memoria:

```js
{
  filters: { campo: valor },   // valor o arreglo de alternativas
  search: 'texto',
  searchFields: ['campo1', 'campo2'],
  sortBy: 'campo',
  sortDirection: 'asc' | 'desc',
  offset: 0,
  limit: 25
}
```

Respuesta: `{ records, total, offset, limit }`. `total` se calcula antes de paginar. Es una lectura integral; no debe elegirse para paginar una tabla grande esperando que limite las filas leídas desde Sheets.

### 4.2 `listTailRecords(source, options)`

Tiene dos modos compatibles:

- **Modo legado**, sin `idField`: lee una ventana física desde el final de la hoja. `offset` se cuenta desde la última fila y `limit` admite 1..1000 (por defecto 25). Respuesta: `{ records, total, offset, limit, hasMore }`. En este modo `total` cuenta filas físicas; una fuente con huecos no representa necesariamente un total exacto de registros.
- **Modo indexado**, con `idField`: escanea la columna del identificador y, cuando se declara, la columna de fecha; conserva como máximo `offset + limit` referencias ordenadas y recupera las filas completas en ventanas pequeñas para la página pedida. Opciones adicionales: `dateField`, `sortBy` (fecha, descendente), `fromDate` y `toDate` (límites inclusivos, valores Date o parseables). Para rango temporal se exige `dateField` o `sortBy`. `total` cuenta únicamente filas con ID no vacío que pasan el rango. Respuesta: `{ records, total, offset, limit, hasMore }`.

El modo indexado reduce la lectura de datos completos a las filas de las ventanas que contienen la página y evita que el historial confunda filas vacías con eventos. No evita el barrido de las columnas de índice/fecha: su costo de exploración sigue siendo O(n), aunque el volumen de lectura de columnas y la memoria de resultados se mantienen acotados. El modo legado se mantiene para no romper consumidores que todavía no declaran identificadores.

### 4.3 `getRecordById(source, idField, id)`

Devuelve la primera coincidencia exacta o `null`. La implementación del cierre de Fase 1 delega en `findRecordsByFields`, en lugar de materializar toda la tabla. Rechaza un identificador vacío.

### 4.4 `findRecordsByFields(source, filters, options)`

Busca coincidencias exactas mediante `TextFinder` en la columna indicada por `options.searchField` o en el primer campo de `filters`. Recupera filas candidatas y aplica el resto de filtros en Core.

```js
findRecordsByFields(source, {
  correo_institucional: 'ana@sunarp.gob.pe',
  active: true
}, {
  searchField: 'correo_institucional',
  matchCase: false,
  ignoreWhitespace: false,
  requiredHeaders: ['persona_id', 'correo_institucional']
})
// { records: [...], total: n }
```

- Un valor puede ser escalar o arreglo (OR dentro del campo); los distintos campos se combinan con AND.
- La coincidencia normal es de celda completa.
- `matchCase: false` desactiva distinción entre mayúsculas/minúsculas.
- `ignoreWhitespace: true` compara tolerando espacios, incluso entre caracteres.
- La columna conductora de `TextFinder` (`options.searchField` o, si se omite, el primer campo de `filters`) no admite valores `null`, `undefined` ni cadena vacía. Los demás campos se comprueban después sobre las filas candidatas y sí pueden comparar explícitamente `''`; esto permite búsquedas como `{ estructura_local_id: '', local_id: 'LOC_1' }` usando `local_id` como columna conductora.
- `requiredHeaders` comprueba encabezados adicionales.
- `projectionFields` es opcional; cuando se declara, devuelve únicamente esos campos más los campos de filtro, y Core lee solo las columnas solicitadas para las filas candidatas. Sin esta opción, mantiene el comportamiento completo anterior.

No es un índice persistente de base de datos: `TextFinder` localiza coincidencias sobre el rango de columna de la hoja. Evita transferir/materializar todos los registros, pero el tiempo del buscador depende del tamaño de la fuente.

### 4.5 `searchRecordsByFields(source, query, fields, options)`

Búsqueda parcial en una o más columnas, mediante `TextFinder`. Devuelve `{ records, total }` y solo materializa las filas candidatas encontradas.

- `fields`: arreglo no vacío de columnas existentes.
- `matchCase`: por defecto la búsqueda no distingue mayúsculas.
- `accentInsensitive`: por defecto es verdadera; normaliza acentos para localizar y comprobar coincidencias. Con `false`, la comparación no elimina acentos y `matchCase: true` distingue mayúsculas.
- Una consulta vacía devuelve `{ records: [], total: 0 }`.

### 4.6 `queryRecords(source, options)` — consulta autorizada

Es la única consulta genérica del repositorio que exige permiso y ámbito de autorización antes de entregar resultados. Contrato de opciones:

```js
{
  idField: 'asignacion_id',        // obligatorio
  filters: { active: true },       // AND
  anyOf: [                         // OR de grupos; cada grupo es AND
    { estructura_local_id: ['REL_1', 'REL_2'] },
    { local_id: ['LOC_1'], estructura_local_id: '' }
  ],
  search: 'texto',
  searchFields: ['campo1', 'campo2'],
  searchAny: [{ field: 'persona_id', values: ['PER_1'] }],
  sortBy: 'order',
  sortDirection: 'asc' | 'desc',
  offset: 0,
  limit: 25,                       // 1..1000
  distinctBy: 'persona_id',        // opcional
  distinctFields: ['cargo_id'],    // facetas autorizadas
  distinctCountFields: ['persona_id'],
  authorization: {
    context,                       // contexto de resolveAuthorizationContext
    moduleId: 'MOD_...',
    permissionCode: '...',
    structures: [],
    locals: [],
    fields: {},
    catalogVersion: '...',         // o catalogSources: [source, ...]
    scopeRecordById: {},            // mapa por idField
    scopeRecordLookups: [{
      recordField: 'estructura_local_id',
      values: { REL_1: { ... } },
      required: true,
      requireEqualFields: ['local_id']
    }]
  },
  cacheSeconds: 60,
  candidateCacheSeconds: 60,
  schemaVersion: 'v1'
}
```

Reglas:

1. `authorization.context`, `moduleId` y `permissionCode` son obligatorios. Core comprueba el permiso y el ámbito del módulo antes de consultar la caché final.
2. Debe existir al menos un grupo de filtros exactos. `filters` se combina con cada grupo `anyOf` mediante AND; los grupos `anyOf` se combinan mediante OR. Un arreglo de valores de un campo representa alternativas. Si un campo aparece en `filters` y en un grupo `anyOf`, Core intersecta ambos conjuntos de valores (AND), no sobrescribe uno con el otro. Una intersección vacía hace imposible ese grupo y no genera una lectura de candidatos. El campo conductor de cada grupo debe tener alternativas no vacías; pueden existir campos secundarios con `''` para comparar adscripciones opcionales. Un grupo cuyos campos no aporten ninguna columna conductora no vacía se rechaza.
3. `searchFields` implementa búsqueda parcial. Cuando `search` tiene contenido, `searchAny` ofrece alternativas exactas adicionales; el resultado satisface texto parcial en alguno de los campos **o** una coincidencia de `searchAny`.
4. `scopeRecordById` añade al registro una representación de sus relaciones antes de comprobar el ámbito. `scopeRecordLookups` resuelve referencias de cada registro mediante mapas declarados por el consumidor. Una referencia no vacía que no exista en un lookup con `required: true` excluye el candidato. `requireEqualFields` evita aceptar relaciones que contradigan valores presentes en el registro original.
5. Cada candidato vuelve a pasar por la comprobación de autorización antes de contarse o incluirse en facetas. Los registros fuera del ámbito no llegan a la respuesta.
6. `distinctFields` y `distinctCountFields` se calculan solo sobre registros autorizados que satisfacen filtros/búsqueda. `distinctBy` reduce el conjunto final a un registro por valor no vacío.
7. El orden es ascendente por defecto y añade `idField` como desempate. `offset` debe ser entero no negativo; `limit` entero de 1 a 1000.
8. `cacheSeconds` y `candidateCacheSeconds` aceptan 0..21600. `schemaVersion` separa versiones de la forma de los candidatos.
9. Para ámbitos distintos de TOTAL, `structures` y `locals` deben estar presentes. Para almacenar resultados finales de dichos ámbitos se debe poder obtener una versión de catálogo (`catalogVersion` o generaciones de `catalogSources`). Si no hay versión verificable, no se almacena el resultado final restringido.
10. Cuando `distinctBy` coincide con `sortBy`, Core conserva únicamente los mejores `offset + limit` representantes distintos y mantiene un conjunto compacto de claves para contar el total exacto. Esto permite paginar conjuntos por identidad (por ejemplo, personas) sin retener todos los registros representativos. Cuando los campos no coinciden, Core conserva un representante por valor distinto para poder resolver el orden global.

Respuesta:

```js
{
  version: 2,
  records: [...],             // solo la página autorizada
  total: 123,                  // posterior a distinctBy, si se declaró
  offset: 0,
  limit: 25,
  distinctValues: { cargo_id: [...] },
  distinctCounts: { persona_id: 80 },
  hasMore: true,
  cacheHit: false,
  candidateCacheHit: false,
  candidateCount: 400,
  authorizedCount: 123,        // antes de distinctBy
  retainedForPage: 25,
  projectedFieldCount: 9,
  hydratedRowCount: 25,
  durationMs: 15
}
```

**Límite de paginación que debe permanecer explícito:** el código localiza con `TextFinder` los candidatos que satisfacen los filtros exactos y examina todos ellos para calcular autorización, total y facetas exactas. En la implementación de Fase 1, Core proyecta únicamente las columnas necesarias para filtrar, autorizar, ordenar y calcular facetas. Primero busca sobre el campo conductor no vacío de cada grupo, con comparación de búsqueda insensible a mayúsculas para evitar falsos negativos por valores booleanos mostrados como `TRUE/FALSE`; los filtros exactos se vuelven a comprobar con los valores de la fila. Después recupera las columnas requeridas y, de forma opcional, las columnas organizacionales directas que realmente existan en la fuente. Los valores organizacionales aportados por `scopeRecordById` y `scopeRecordLookups` se enriquecen en memoria y no se exigen como encabezados de la entidad funcional; si la fuente contiene esos campos directamente, Core también los proyecta para evaluar el ámbito y validar coherencia. La lectura proyectada se agrupa en ventanas de filas candidatas, sin cargar el ancho completo de todas esas filas. Mantiene la autorización, los conteos y las facetas sobre todos los candidatos coincidentes, pero conserva como máximo `offset + limit` candidatos ordenados cuando no se usa `distinctBy`. **Solo después de seleccionar la página se hidratan las filas completas**, agrupando lecturas de hasta 25 filas para la página. Antes de devolverlas, Core compara todas las columnas proyectadas con los valores leídos para autorizar y ordenar; si cambia el identificador, la adscripción o cualquier campo proyectado de una fila seleccionada durante la consulta, rechaza la página completa en lugar de devolver una fila distinta de la autorizada. Este control protege las filas de la página, pero no convierte la lectura completa, el total ni las facetas en una transacción/snapshot serializable ante ediciones concurrentes en otras filas. El total y las facetas reflejan el conjunto candidato observado durante el recorrido. Esto reduce el volumen de columnas y la memoria de registros completos, pero **no equivale a paginación de origen ni evita el barrido de búsqueda y cálculo sobre todos los candidatos**. La consulta sigue siendo O(n) en la exploración del campo usado por `TextFinder` y O(m) en el conjunto candidato para autorización y facetas. Cuando se utiliza `distinctBy`, si coincide con `sortBy` Core mantiene como máximo `offset + limit` representantes y el conjunto compacto de claves necesario para contar personas/grupos distintos; si no coincide, conserva un representante por cada valor distinto para resolver la ordenación global. La optimización de acceso/seek por origen queda como pendiente técnico y no debe describirse como resuelta.

El resultado final de caché se separa por identidad, módulo, permiso, ámbitos, campos, versión de catálogos y huella de las instantáneas organizacionales/relacionales usadas para autorizar. La caché de candidatos puede compartirse porque almacena datos aún no autorizados; cada solicitud vuelve a aplicar filtros, relaciones y autorización antes de devolver cualquier resultado. Su clave identifica el conjunto de candidatos independientemente de la forma de la respuesta. Cada entrada conserva los campos solicitados y realmente proyectados: una consulta puede reutilizar una proyección anterior si esta cubre todos sus campos requeridos; si falta alguno, Core vuelve a leer los candidatos. Una proyección más amplia nunca se entrega directamente ni omite la autorización.

## 5. Escrituras y operaciones compuestas

Todas las escrituras del repositorio usan `ScriptLock` y delegan la modificación efectiva en el ejecutor interno `_coreRunSourceWrite_()`. Cada ruta marca el inicio de la primera modificación; al terminar, Core ejecuta `SpreadsheetApp.flush()` e invalida la fuente mediante una nueva generación. Si el callback de escritura falla después de haber empezado, Core intenta igualmente ejecutar flush e invalidación y propaga un error que advierte de la posible escritura parcial y exige comprobar el estado antes de reintentar. Si falla la invalidación, también se informa explícitamente que la escritura pudo haberse aplicado y no debe repetirse a ciegas. El bloqueo coordina las operaciones que pasan por el mismo mecanismo de Core; no convierte varias llamadas independientes ni escrituras sobre varias fuentes en una transacción distribuida. Una operación compuesta de una sola fuente no ofrece rollback transaccional garantizado ante un fallo de Apps Script después de que algunas celdas ya hayan sido escritas.

### 5.1 `insertRecord(source, record, options)`

Inserta una fila conforme a los encabezados existentes. Opciones:

- `idField`: comprueba que el identificador sea obligatorio y no esté duplicado.
- `uniqueFields`: combinación de columnas cuya unicidad se comprueba bajo el mismo bloqueo.
- `schema`: esquema opcional para `assertValidRecord`.

Devuelve `{ success, message, record }`. La comprobación de duplicados requiere recorrer la tabla completa actualmente.

### 5.2 `updateRecord(source, idField, id, updates, options)`

Actualiza solamente los campos enviados y no permite cambiar `idField`. Opciones:

- `schema`: validación parcial de campos.
- `uniqueFields`: comprueba que la combinación resultante no duplique otra fila.

Devuelve `{ success, message, record }`. La implementación actual carga la tabla completa dentro del bloqueo para localizar el registro y comprobar unicidad.

### 5.3 `setRecordStatus(source, idField, id, statusField, statusValue, options)`

Atajo que construye `updates` con el campo de estado indicado y delega en `updateRecord`. No impone un nombre de columna o una convención de texto.

### 5.4 `deleteRecord(source, idField, id)`

Elimina físicamente la fila que corresponde al identificador; devuelve `{ success, message, id }`. La implementación actual materializa la tabla dentro del bloqueo para hallar su número de fila.

### 5.5 `updateRecordByFields(source, criteria, updates, options)`

Busca dentro de la tabla con criterios AND y exige exactamente una coincidencia. Puede actualizar campos que forman parte de la clave. `options.uniqueFields` comprueba la unicidad compuesta antes de escribir. Devuelve `{ success, message, record }`.

### 5.6 `syncRecordsByKey(source, parentMatch, keyFields, desiredRecords, statusField, activeValue, inactiveValue, options)`

Sincroniza relaciones de un conjunto padre:

- `parentMatch` identifica al padre. Debe contener al menos un campo y todos sus valores deben ser no nulos, no indefinidos y no vacíos.
- `keyFields` identifica cada relación.
- `desiredRecords` define las relaciones que deben quedar activas. No puede sustituir ningún campo de `parentMatch` por un valor distinto; puede repetirlo con un valor equivalente, pero Core conserva el valor validado del padre.
- Las relaciones existentes omitidas se conservan y pasan a `inactiveValue`.
- Las nuevas se insertan con `activeValue`.
- `options.allowEmptyKeyFields` declara qué campos de clave pueden estar vacíos (por ejemplo, una referencia opcional).
- Los duplicados en el conjunto deseado o existente provocan error.

Devuelve `{ success, inserted, updated, deactivated, totalActive }`. Usa un solo bloqueo y finaliza/invalida la fuente cuando hubo cambios. Si una escritura parcial falla, también intenta flush e invalidación y comunica que puede haber cambios parciales. La coordinación se limita a esa llamada bajo bloqueo: no hay rollback garantizado, y una secuencia de sincronizaciones de distintas pestañas (por ejemplo, roles y ámbitos) no es una transacción conjunta. El consumidor debe detectar e informar resultados parciales y permitir su reconciliación.

### 5.7 `appendAuditEvent(source, record, idField)`

Inserta el evento mediante `insertRecord`, indicando el campo identificador. El esquema y campos del evento son responsabilidad del consumidor. Al utilizar `insertRecord`, hereda bloqueo e invalidación.

### 5.8 `runSourceWriteBatch(sources, writer)`

Coordina una escritura de mantenimiento que afecta varias fuentes o pestañas y que no puede expresarse mediante las operaciones CRUD normales.

- `sources` debe ser un arreglo no vacío de configuraciones Core; declara **todas** las fuentes que el callback puede modificar. Core normaliza y deduplica las fuentes físicas por archivo, pestaña y fila de encabezados.
- `writer` es una función síncrona que recibe `markWriteStarted()`. El consumidor debe llamarla inmediatamente antes de la primera mutación de Google Sheets, incluso si la mutación es crear una pestaña o una columna.
- Core ejecuta el callback dentro del mismo `LockService.getScriptLock()` de la biblioteca que utilizan las escrituras CRUD. Después de la ruta normal, o después de un error que ocurra tras marcar el inicio, ejecuta un único `SpreadsheetApp.flush()` y trata de invalidar **todas** las fuentes declaradas, aunque falle una invalidación.
- Si la validación del callback falla antes de marcar una escritura, no ejecuta `flush` ni invalida. Si falla después, intenta finalizar todas las fuentes y lanza un error que advierte de cambios parciales. No existe rollback ni transacción entre pestañas; el consumidor debe inspeccionar los datos antes de repetir la operación.
- El callback no debe invocar otros métodos públicos de escritura ni `invalidateSourceCache`, porque el lote ya mantiene el bloqueo central y esas llamadas intentarían adquirirlo de nuevo.
- Es apropiado para migraciones de esquema o escrituras multihoja excepcionales. Las operaciones funcionales ordinarias deben seguir usando los métodos CRUD/compuestos de Core.

## 6. Lecturas agrupadas y metadatos

### 6.1 `listRecordsFromSources(requests)`

`requests` es un arreglo de objetos `{ key, source, requiredHeaders }`. Agrupa por `spreadsheetId`, abre cada archivo una vez por ejecución y lee las pestañas solicitadas. Devuelve un objeto indexado por cada `key`.

Es una lectura integral de todas las filas de las pestañas solicitadas; la agrupación reduce aperturas repetidas, no el volumen de filas. Cada clave debe ser única y los encabezados requeridos deben existir.

### 6.2 `listRecordsFromSourcesCached(requests, expirationSeconds)`

Mismo formato de entrada que la lectura agrupada, con `key` única por solicitud. Por defecto usa TTL de 300 segundos; rango permitido 1..21600. Mantiene una instantánea por fuente y reutiliza entradas de CacheService. Las fuentes faltantes se agrupan para abrir cada archivo una vez y leer sus pestañas.

Una escritura Core cambia la generación efectiva de la fuente; las dependencias declaradas participan en esa generación. Si una solicitud produce un miss y espera el bloqueo de escritura, Core vuelve a calcular la generación dentro del bloqueo antes de reconsultar la caché; así no reutiliza una instantánea de la generación anterior después de una escritura Core concurrente. La caché puede ser desalojada antes del TTL y la función debe reconstruir la fuente completa al producirse un miss. No representa almacenamiento persistente.

### 6.3 `getSourceInfo(source)` y `getSourceInfoCached(source, expirationSeconds)`

Devuelven metadatos:

```js
{
  label, spreadsheetName, sheetName,
  headerRow, lastRow, lastColumn, headers
}
```

La variante cacheada usa por defecto TTL de 300 segundos (rango 1..21600) y la generación efectiva de la fuente.

## 7. Caché pública

### 7.1 `getCachedValue(key)`

Recupera el valor almacenado o `null` si no está disponible, expiró, fue desalojado, está corrupto o le falta algún fragmento. Nunca entrega datos parcialmente reconstruidos.

### 7.2 `putCachedValue(key, value, expirationSeconds)`

Almacena valores pequeños directamente; los grandes se comprimen GZIP y pueden fragmentarse. TTL por defecto 600 segundos; rango 1..21600. La clave completa, incluido el prefijo interno, no puede exceder 250 caracteres.

Constantes actuales del mecanismo:
- 95 KiB como umbral máximo de bytes para un elemento/manifiesto.
- Fragmentos Base64 de 70 Ki caracteres.
- Máximo 128 fragmentos por entrada.
- El manifiesto se escribe después de los fragmentos. Un fragmento ausente o checksum/longitud incorrectos provoca miss y limpieza, nunca respuesta parcial.

Devuelve un objeto con `success`, `storage` (`direct`, `gzip-inline`, `gzip-chunks` o `not-cached`), tamaños, TTL o razón de fallo. Un valor `not-cached` no impide devolver al llamador el dato que obtuvo de la fuente.

### 7.3 `removeCachedValue(key)` y `removeCachedValues(keys)`

Eliminan las entradas solicitadas y los fragmentos conocidos de sus manifiestos. Devuelven indicadores y contadores de entradas/fragmentos eliminados.

### 7.4 `invalidateSourceCache(source)`

Bajo bloqueo, genera una nueva generación de la fuente e invalida metadatos/instantánea de esa fuente. Devuelve `{ success, generation, removed }` o `{ success: false, error }`. Los resultados derivados que incluyan la generación anterior dejan de ser accesibles aunque permanezcan físicamente en CacheService y expiren por TTL/desalojo; `removed` cuenta las claves base de instantánea/metadatos eliminadas y sus fragmentos conocidos, no todas las entradas versionadas de resultados derivadas. En las lecturas agrupadas con caché, si se produce un miss y la solicitud tuvo que esperar el bloqueo, Core recalcula la generación antes de volver a comprobar la caché.

Los consumidores deben comprobar `success` en tareas administrativas críticas. Las escrituras implementadas por Core llaman a la invalidación internamente y propagan un error explícito si esta falla después de que la escritura pudo haberse aplicado; en ese caso no se debe repetir la escritura a ciegas, sino comprobar el registro y ejecutar `invalidateSourceCache(source)`. La propia invalidación intenta retirar la generación anterior cuando no puede publicar una nueva, pero esta limpieza es best-effort si CacheService está indisponible.


### 7.5 `getOrBuildCachedValue(key, sources, builder, expirationSeconds)`

Obtiene un valor derivado de varias fuentes o ejecuta `builder` cuando no existe una entrada vigente.

- `key`: clave lógica estable del conjunto derivado (1..180 caracteres).
- `sources`: arreglo no vacío de descriptores de fuente. La clave efectiva incorpora la identidad de cada fuente y su generación, incluidas las dependencias declaradas.
- `builder`: función sin argumentos que devuelve el valor derivado. Solo se ejecuta cuando hay un fallo de caché o no se pueden obtener generaciones.
- `expirationSeconds`: TTL opcional entre 1 y 21600 segundos; por defecto 300.

Respuesta: `{ value, cacheHit, cacheStored, cacheReason? }`. Si una fuente cambia durante la construcción, la función descarta el resultado y lanza un error para que el consumidor vuelva a solicitarlo. Si no puede obtener una generación, ejecuta el builder sin almacenar el resultado. Un fallo de escritura de caché no invalida el valor recién construido.

La función no ejecuta consultas ni aplica permisos por sí misma. El consumidor debe comprobar su autorización antes de invocarla y declarar todas las fuentes de las que depende el valor. La invalidación de cualquiera de ellas vuelve inaccesible la entrada derivada.

## 8. Validación genérica

### 8.1 `validateRecord(record, schema, options)`

El esquema es un objeto cuyas propiedades describen reglas de campo:

```js
{
  nombre: {
    label: 'Nombre',
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 100
  },
  edad: {
    type: 'integer',
    min: 18,
    max: 100,
    allowedValues: [18, 21, 25],
    pattern: '...',
    patternFlags: 'i',
    patternMessage: '...',
    nullable: false
  }
}
```

Tipos admitidos: `string`, `number`, `integer`, `boolean`, `date`, `email`. Reglas adicionales: `minLength`, `maxLength`, `min`, `max`, `allowedValues`, `pattern`, `patternFlags`, `patternMessage`, `required`, `nullable`.

Opciones:
- `partial: true`: omite campos no enviados.
- `allowUnknownFields: true`: admite propiedades fuera del esquema.

Devuelve `{ valid, errors, messages }`. Cada error contiene `field` y `message`.

### 8.2 `assertValidRecord(record, schema, options)`

Ejecuta la misma validación y lanza un error agregado si `valid` es falso. Devuelve `true` si la validación pasa.

## 9. Semántica de caché, consistencia y límites

1. Core usa `CacheService.getScriptCache()` y `LockService.getScriptLock()` desde el proyecto de biblioteca. Apps Script clasifica `Cache` y `Lock` como recursos propios/no compartidos de la biblioteca: la biblioteca mantiene su instancia y todos los proyectos que la incluyen comparten esa misma instancia. Por ello, los consumidores de este mismo proyecto SUNARP Core comparten la caché central y el bloqueo de escritura de Core; no reciben una caché ni un bloqueo aislados por aplicación. El bloqueo coordina las escrituras que pasan por esta biblioteca, pero no sincroniza una edición manual ni una escritura externa que no invoque Core. La caché es temporal, puede perder entradas antes del TTL y no es almacenamiento durable.
2. Las fuentes tienen claves físicas distintas por ID de archivo, pestaña, fila de encabezados y tipo de entrada.
3. La generación efectiva incluye las generaciones de dependencias declaradas. Al invalidar el maestro, la clave efectiva de una réplica cambia en la siguiente consulta.
4. Los resultados de `queryRecords` quedan separados por contexto de autorización y datos organizacionales/relacionales suministrados. La caché de candidatos no se entrega directamente: se revalida por solicitud.
5. La consistencia ante ediciones externas forma parte del contrato de **Fase 1**. La invalidación por generaciones cubre automáticamente las escrituras ejecutadas por Core. Una edición manual en Google Sheets o una escritura de otra aplicación/script que no invoque la invalidación **no cambia automáticamente la generación**; las instantáneas y consultas cacheadas pueden permanecer obsoletas hasta su expiración/desalojo. Los TTL configurables están limitados a 21600 segundos y CacheService puede desalojar entradas antes de ese plazo, por lo que esto es consistencia eventual acotada por TTL, no consistencia inmediata ni una transacción/snapshot.
   - Todo escritor externo automatizado debe llamar `invalidateSourceCache(source)` para cada fuente afectada después de completar sus escrituras. Si modifica una fuente maestra, debe invalidar la fuente maestra: las réplicas que declaren esa dependencia obtendrán otra generación efectiva en la siguiente consulta. Si modifica directamente una réplica, debe invalidar también esa réplica.
   - Para una edición manual, debe ejecutarse una invalidación explícita de la fuente afectada antes de exigir que las consultas cacheadas reflejen el cambio. El repositorio no contiene un disparador automático `onEdit`/`onChange` para estas hojas. No se debe asumir que existe un trigger instalado ni que una actualización de `IMPORTRANGE` lo activa. La guía oficial de bibliotecas de Apps Script clasifica `Triggers` como recurso propio/no compartido y advierte que los disparadores simples definidos dentro de una biblioteca no se ejecutan por el hecho de que un proyecto consumidor la invoque. Si se requiere automatizar la invalidación de ediciones manuales, debe comprobarse una instalación real para cada archivo relevante, su propietario, evento, autorización, cobertura y comportamiento ante ediciones de usuario; no basta con añadir un `onEdit` simple a SUNARP Core ni se debe presumir que cubre `IMPORTRANGE`. La comprobación debe hacerse en los proyectos Apps Script correspondientes.
   - El contrato de Fase 1 queda cerrado con esta semántica explícita y con la invalidación pública disponible. La instalación/operación de triggers, si se requiere automatización adicional para ediciones manuales, es una tarea de Apps Script externa al repositorio y no puede darse por verificada desde GitHub.
6. La apertura de Spreadsheet reutiliza manejadores durante la ejecución mediante un LRU máximo de 12 IDs. Es una optimización del contexto de ejecución, no caché de datos.
7. `listRecords`, `listRecordsFromSources`, `insertRecord`, `updateRecord`, `deleteRecord`, `updateRecordByFields` y las operaciones compuestas que aún utilizan `_coreGetTable_` procesan la tabla completa. `syncRecordsByKey` usa búsquedas `TextFinder` e intersección de filas para `parentMatch` textual, y recupera las filas candidatas en ventanas acotadas; conserva el lector completo para valores padre no textuales. Esta optimización reduce la lectura de filas, pero `TextFinder` sigue buscando en cada columna padre y no equivale a un índice persistente ni a paginación SQL.

## 10. Reglas de compatibilidad para consumidores

- No llamar funciones privadas con guion bajo; no son parte del contrato de biblioteca.
- Declarar campos, relaciones, permisos y fuentes en cada consulta. Core no debe recibir ni devolver tablas globales para que el navegador filtre.
- Usar `queryRecords` para listados funcionales sujetos a ámbito. Las funciones genéricas de listado no incorporan autorización.
- Para datos sensibles, la decisión de permiso y ámbito debe ocurrir en backend antes de devolver la respuesta. Nunca usar la caché final sin la comprobación de autorización que exige Core.
- No asumir que `offset`/`limit` en `queryRecords` equivale a paginación física/SQL en origen; revisar `candidateCount`, `authorizedCount`, `retainedForPage` y `durationMs`.
- Mantener los catálogos organizacionales y sus réplicas declarados conforme a la fuente que cada consumidor haya decidido utilizar; no unificarlos por conveniencia.
- Los servicios deben rechazar relaciones inexistentes cuando las hayan declarado obligatorias. Para relaciones opcionales, omitir `required: true`.
- Toda escritura por rutas ajenas a Core debe invalidar explícitamente cada fuente afectada conforme al contrato de consistencia externa de Fase 1. No asumir que la instalación de triggers existe o está completa; debe verificarse en Apps Script.

### 10.1 Consumidores comprobados en esta rama

- **Gestor de intranet SUNARP** es el único proyecto de Apps Script que declara e invoca directamente la biblioteca `SUNARPCore` en esta rama. El manifiesto del repositorio referencia la versión 10 publicada. Queda pendiente sincronizarlo con el proyecto Apps Script consumidor y validar la integración mediante el despliegue de pruebas existente; no se debe actualizar el despliegue productivo.
- La resolución ordinaria de identidad del Gestor obtiene el correo de sesión, busca una coincidencia exacta en `personas.correo_institucional` mediante `resolveIdentity` y proyecta únicamente `persona_id`, correo, nombres y apellidos. Exige exactamente una coincidencia y entrega `persona_id` a `resolveAuthorizationContext`; Core no busca identidades por correo dentro del motor de autorización.
- La autorización ordinaria del Gestor consulta las relaciones activas de la persona solicitante, sus ámbitos, roles asociados, relaciones rol-permiso y permisos correspondientes; carga el catálogo de módulos mediante la caché central. No carga las nueve tablas administrativas completas durante el login. `_accessLoadSecurityData_()`, que sí lee el snapshot integral de seguridad, se reserva para la operación explícita de mantenimiento `validateAccessManagementIntegrity()`.
- La migración excepcional `migrateAccessManagementSchema()` modifica las fuentes `Permisos`, `AmbitosAcceso` y `TiposAmbito`. Ahora utiliza `runSourceWriteBatch`: el bloqueo, `flush` y las invalidaciones se coordinan desde la biblioteca Core para evitar carreras con CRUD de Core. La función exige que la biblioteca exponga ese método y se niega a iniciar escrituras cuando el consumidor permanece en una versión anterior. El callback no tiene rollback; un error tras la primera mutación puede dejar cambios parciales y exige inspección antes de reintentar.
- **DirectoryService** usa `queryRecords` para listados funcionales de asignaciones sujetos a permiso y ámbito; enriquece la página devuelta mediante búsquedas exactas de las personas correspondientes. Los catálogos y las relaciones obligatorias se declaran en la consulta. Las búsquedas exactas/parciales de soporte usan `findRecordsByFields` y `searchRecordsByFields`.
- La operación compuesta `saveDirectoryEntry()` coordina la creación/edición de una persona, su ficha de datos personales y una asignación mediante varias llamadas CRUD independientes de Core. Cada escritura y cada compensación (`updateRecord`/`deleteRecord`) ejecuta su propio bloqueo, `flush` e invalidación de la fuente correspondiente. El flujo realiza rollback compensatorio cuando un paso falla, pero **no es una transacción multihoja**: los bloqueos se liberan entre llamadas y una lectura concurrente puede observar un estado intermedio. Si una compensación falla, el Gestor devuelve un error que requiere revisión de los registros afectados. No envolver este flujo en `runSourceWriteBatch` sin refactorizarlo: el callback de lote no debe llamar a métodos públicos de escritura de Core porque intentaría adquirir de nuevo el mismo bloqueo.
- **Gestor de contenidos Sunarp** y **Agente Sunarp** no declaran la biblioteca ni invocan `SUNARPCore` en los archivos del repositorio inspeccionados; no se consideran consumidores directos del Core en esta rama.
- La prueba `core-public-contract.test.cjs` compara el inventario de funciones globales exportables, verifica las firmas documentadas y detecta las invocaciones de Core desde los archivos del Gestor. La prueba `access-management-adapter.test.cjs` comprueba la resolución de identidad con proyección mínima, la autorización selectiva y que la lectura integral de seguridad quede diferida a mantenimiento. `directory-service.test.cjs` comprueba el contrato de consulta y compatibilidad del Directorio.

Este inventario describe los consumidores comprobados en el repositorio y la rama auditados; no afirma que no existan proyectos Apps Script externos que no estén versionados aquí.

### 10.2 Operaciones CRUD administrativas del Gestor

- `saveAccessRole()` consulta por nombre e identificador mediante `findRecordsByFields()`; la generación del siguiente `rol_id` comprueba colisiones mediante búsquedas exactas sucesivas. No descarga la tabla `Roles` completa para esas validaciones.
- `saveAccessPermission()` consulta módulo, permiso y código por sus claves; genera `permiso_id` mediante búsqueda exacta, sin cargar todos los permisos.
- `saveAccessUserConfiguration()` recupera únicamente los módulos y roles vinculados a la persona o enviados en la operación. Conserva las relaciones previas de módulos inactivos/no disponibles. El catálogo `TiposAmbito` se consulta completo porque es un catálogo cerrado de cuatro tipos.
- La protección de continuidad del administrador global consulta `ACCESOS`, `ROL_ADMIN`, sus cuatro permisos administrativos, las relaciones correspondientes, las cuentas candidatas y los ámbitos `TOTAL`. No requiere el snapshot administrativo completo.
- `saveAccessUserRole()`, `saveRolePermissions()`, `saveAccessScopes()` y `saveAccessUserConfiguration()` conservan la sincronización compuesta protegida por bloqueo. `syncRecordsByKey()` localiza filas por cada campo de `parentMatch` con `TextFinder`, intersecta los números de fila y recupera las filas candidatas en ventanas acotadas; no materializa la hoja completa para claves padre textuales. Para padres no textuales mantiene el lector anterior por compatibilidad.
- `validateAccessManagementIntegrity()` sigue siendo la operación explícita que carga y valida el snapshot integral de las nueve tablas de seguridad. Los listados completos de catálogos de una pestaña se mantienen bajo demanda para presentar esa pestaña, no como requisito previo de cada mutación.

### 10.3 Historial general de auditoría

- `getAccessAuditHistory()` requiere `AUDITORIA_VER`. Cuando no hay filtros de texto, usa `listTailRecords()` con `evento_id` y `fecha_hora`; las fechas `desde` y `hasta` deben ser fechas calendario `YYYY-MM-DD` válidas y se convierten en límites de inicio y fin de día inclusivos. Core obtiene el total y la página ordenada sin recuperar todas las columnas de todas las filas.
- Cuando hay filtros de texto, el Gestor obtiene candidatos mediante búsquedas exactas o parciales en Core, aplica los filtros restantes, calcula el total exacto y retiene únicamente los primeros `offset + pageSize` eventos en orden cronológico descendente. El rango temporal también se aplica de forma inclusiva.
- La ruta integral queda únicamente como compatibilidad con consumidores de Core v9 que no exponen `listTailRecords()`. El Gestor versionado en esta rama declara Core v10 y utiliza la ruta indexada.

### 10.4 Historial por entidad

- `getAccessEntityHistory()` consulta `Auditoria` por `registro_id`; para `PERMISO` añade candidatos encontrados en `datos_antes` y `datos_despues`, interpreta los snapshots y conserva solo relaciones que contienen exactamente el permiso solicitado.
- Los eventos encontrados por ambas rutas se deduplican por `evento_id`, se ordenan por fecha descendente y, ante empate, por identificador descendente. El índice resultante se cachea durante 300 segundos por entidad e identidad y por generación de la fuente `Auditoria`; cada solicitud devuelve únicamente la página pedida.
- Las escrituras de auditoría realizadas mediante Core invalidan la generación de la fuente y hacen inaccesible el índice anterior. La primera consulta construye el índice a partir de candidatos de la entidad; no descarga la hoja completa de auditoría.

## 11. Verificación de versión y publicación

### 11.1 Comprobaciones completadas

- El proyecto de Core incluye los archivos fuente JavaScript mediante `.clasp.json` con `rootDir: ""` y extensiones `.js`/`.gs`.
- `runCoreTests()` se ejecutó en Apps Script sin errores. La suite de repositorio registró 51 pruebas satisfactorias; las suites de autorización y repositorio compuesto también finalizaron con sus aserciones correctas.
- La auditoría estática de la rama identifica 31 funciones globales públicas y comprueba sus firmas documentadas y las invocaciones desde Gestor.
- Apps Script creó la versión inmutable **10**, con la descripción `SUNARP Core v10 - contrato público y validación integral`.
- Se creó el despliegue versionado de biblioteca **v10** con ID `AKfycbw5Sx_tBJH6zANC8IrQ4cbYSIbiYj8N2NEfBqAtNtXEylclET7XK7ns5TNemHAw9KRpCg`. El inventario confirmó que los despliegues previos `@HEAD` y `@9` permanecen intactos. El despliegue versionado anterior de Core, **versión 9**, se conserva sin modificaciones.
- En el editor del Gestor, el usuario confirmó que la versión 10 aparece disponible en el selector de la dependencia `SUNARPCore`; el identificador de código permanece `SUNARPCore` y el ID de biblioteca está conservado en el manifiesto.

### 11.2 Cierre operativo de Fase 1

Se completaron las verificaciones de publicación, sincronización e integración del consumidor:

1. El manifiesto de Gestor declara `SUNARPCore` versión `10`, conserva `SUNARP_UI` versión `0` en modo desarrollo y el acceso web `DOMAIN`.
2. El proyecto Apps Script de Gestor recibió los 15 archivos mediante `clasp push`; no se creó ni modificó ningún despliegue de Gestor.
3. La prueba funcional inicial confirmó autenticación y navegación, y el usuario confirmó que Información de personal carga los registros. Los problemas de filtros, carga dinámica, persistencia de pestañas y tiempos iniciales observados en Administración de accesos/Información de personal quedan registrados para la fase siguiente de correcciones de los módulos consumidores; no son motivo para alterar Core v10.
4. El responsable comprobó en Apps Script que **SUNARP Core no tiene activadores instalados** y que **Gestor de intranet SUNARP tampoco tiene activadores instalados**.
5. La revisión del código confirma que las escrituras funcionales de Gestor pasan por Core; la migración excepcional es la única ruta directa y utiliza `runSourceWriteBatch()` para coordinar la invalidación.
6. La arquitectura actual no automatiza la invalidación después de ediciones manuales en Sheets. Cuando se requiera consistencia inmediata, el responsable debe ejecutar `SUNARPCore.invalidateSourceCache(source)` para cada fuente física modificada. De lo contrario, la caché mantiene consistencia eventual conforme a TTL/desalojo. Esta limitación está documentada y aceptada; no se instalarán activadores en esta fase.
7. Los demás proyectos Backend todavía no están unificados con Core/Gestor y quedan fuera del alcance de Fase 1. Cuando se integren, su diseño deberá adoptar el contrato de invalidación antes de escribir en fuentes administradas por Core.

**Estado: FASE 1 COMPLETADA para la arquitectura actualmente integrada de SUNARP Core y Gestor de intranet SUNARP.** No se debe interpretar como certificación de los proyectos Backend aún no unificados, ni como afirmación de invalidación automática para ediciones manuales.

No se actualizó ningún despliegue productivo. Core v10 permanece como biblioteca versionada; el despliegue productivo de Gestor no fue modificado. **No se afirma que el despliegue productivo de Gestor utilice v10**; la validación se limita al código sincronizado y al mecanismo de pruebas existente.

## 12. Referencias oficiales de Apps Script

- [Bibliotecas de Apps Script](https://developers.google.com/apps-script/guides/libraries): acceso por ID y versión, creación/compartición de bibliotecas, recursos compartidos/no compartidos, alcance de `Cache`/`Lock`/`Triggers` y advertencia de sobrecarga de ejecución de bibliotecas.
- [CacheService](https://developers.google.com/apps-script/reference/cache/cache-service?hl=es): alcance de `getScriptCache()` y advertencia de que los datos pueden ser desalojados antes de su expiración.
- [Versiones de Apps Script](https://developers.google.com/apps-script/guides/versions?hl=es-419): diferencia entre versión inmutable e implementación, creación y consulta del historial de versiones.


## Nota de publicación de la extensión

`getOrBuildCachedValue` forma parte de la fuente de esta rama, pero no de la biblioteca v10 ya publicada. Para habilitar el nuevo listado de usuarios se requiere publicar una nueva versión de SUNARP Core que incluya esta función y actualizar después la dependencia del Gestor a esa versión. La referencia del manifiesto se mantiene en v10 hasta que la nueva versión exista realmente.
