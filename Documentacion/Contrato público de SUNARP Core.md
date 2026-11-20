# Contrato público de SUNARP Core — base para v10

**Estado:** contrato de trabajo asociado al código fuente del repositorio. No acredita que la versión 10 haya sido creada o publicada en Apps Script.  
**Biblioteca:** `1mDzO7uTarQCKYpS5U7pMv5go0Wh76k3JoIh5GvxWPfU0zoUG7Jfp17tD`  
**Consumidor del repositorio:** Gestor de intranet SUNARP. Su manifiesto permanece en versión 9 hasta la publicación y verificación efectiva de v10.

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

- El booleano activo es `true`; el inactivo es `false`. La autorización también admite el texto `"TRUE"` recibido desde adaptadores, pero no interpreta `ACTIVO/INACTIVO` como booleano.
- Los campos de fechas pueden recibirse como valores `Date` o como cadenas según el adaptador y la fuente.
- Una coincidencia exacta compara valores normalizados por Core; no equivale a una búsqueda textual parcial.

### 1.3 Respuestas de consulta

Las respuestas de lectura suelen utilizar `{ records, total }`; las lecturas paginadas añaden `offset`, `limit` y, según el método, `hasMore`. Las respuestas de escritura indican `success`, un mensaje y, cuando corresponde, el registro afectado o contadores.

## 2. Inventario de la API pública

En el HEAD auditado se identificaron **30 funciones globales públicas**. La lista siguiente se ha obtenido de las declaraciones de los archivos de Core, excluyendo los auxiliares privados.

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
| Caché | `invalidateSourceCache` | `(source)` |
| Caché | `getCachedValue` | `(key)` |
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

`emailField` e `idField` son obligatorios. Un correo vacío devuelve `{ records: [], total: 0 }`. La búsqueda se realiza con `findRecordsByFields` y después vuelve a comprobar la igualdad del correo normalizado y que el campo de identidad tenga contenido. La aplicación consumidora debe rechazar la ambigüedad si aparecen identidades duplicadas; esta función devuelve las coincidencias encontradas.

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
- `SEDE` compara la sede derivada de la estructura o del local. Si el registro no aporta ninguno, utiliza `record.sede_id`.
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
- Los filtros exactos no aceptan valores vacíos.
- `requiredHeaders` comprueba encabezados adicionales.

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
2. Debe existir al menos un grupo de filtros exactos. `filters` se combina con cada grupo `anyOf` mediante AND; los grupos `anyOf` se combinan mediante OR. Un arreglo de valores de un campo representa alternativas.
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

**Límite de paginación que debe permanecer explícito:** el código usa `findRecordsByFields` para materializar todos los candidatos que cumplen los filtros exactos y los examina para calcular autorización, total y facetas exactas. En la implementación de Fase 1, Core proyecta únicamente las columnas necesarias para filtrar, autorizar, ordenar y calcular facetas. Primero usa `TextFinder` sobre el campo exacto prioritario de cada grupo, con comparación de búsqueda insensible a mayúsculas para evitar falsos negativos por valores booleanos mostrados como `TRUE/FALSE`; el filtro exacto se vuelve a comprobar con los valores de la fila. Después recupera las columnas requeridas y, de forma opcional, las columnas organizacionales directas que realmente existan en la fuente. Las relaciones aportadas por `scopeRecordById` y `scopeRecordLookups` no se exigen como encabezados de la tabla de negocio. La lectura proyectada se agrupa en ventanas de filas candidatas, sin cargar el ancho completo de todas esas filas. Mantiene la autorización, los conteos y las facetas sobre todos los candidatos coincidentes, pero conserva como máximo `offset + limit` candidatos ordenados cuando no se usa `distinctBy`. **Solo después de seleccionar la página se hidratan las filas completas**, agrupando lecturas de hasta 25 filas para la página. Esto reduce el volumen de columnas y la memoria de registros completos, pero **no equivale a paginación de origen ni evita el barrido de búsqueda y cálculo sobre todos los candidatos**. La consulta sigue siendo O(n) en la exploración del campo usado por `TextFinder` y O(m) en el conjunto candidato para autorización y facetas. Cuando se utiliza `distinctBy`, si coincide con `sortBy` Core mantiene como máximo `offset + limit` representantes y el conjunto compacto de claves necesario para contar personas/grupos distintos; si no coincide, conserva un representante por cada valor distinto para resolver la ordenación global. La optimización de acceso/seek por origen queda como pendiente técnico y no debe describirse como resuelta.

El resultado final de caché se separa por identidad, módulo, permiso, ámbitos, campos, versión de catálogos y huella de las instantáneas organizacionales/relacionales usadas para autorizar. La caché de candidatos puede compartirse porque almacena datos aún no autorizados; cada solicitud vuelve a aplicar filtros, relaciones y autorización antes de devolver cualquier resultado.

## 5. Escrituras y operaciones compuestas

Todas las escrituras del repositorio usan `ScriptLock` y, tras realizar cambios, ejecutan `SpreadsheetApp.flush()` e invalidan la fuente mediante la generación de Core.

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

- `parentMatch` identifica al padre y no puede estar vacío.
- `keyFields` identifica cada relación.
- `desiredRecords` define las relaciones que deben quedar activas.
- Las relaciones existentes omitidas se conservan y pasan a `inactiveValue`.
- Las nuevas se insertan con `activeValue`.
- `options.allowEmptyKeyFields` declara qué campos de clave pueden estar vacíos (por ejemplo, una referencia opcional).
- Los duplicados en el conjunto deseado o existente provocan error.

Devuelve `{ success, inserted, updated, deactivated, totalActive }`. Usa un solo bloqueo e invalida la fuente cuando hubo cambios.

### 5.7 `appendAuditEvent(source, record, idField)`

Inserta el evento mediante `insertRecord`, indicando el campo identificador. El esquema y campos del evento son responsabilidad del consumidor. Al utilizar `insertRecord`, hereda bloqueo e invalidación.

## 6. Lecturas agrupadas y metadatos

### 6.1 `listRecordsFromSources(requests)`

`requests` es un arreglo de objetos `{ key, source, requiredHeaders }`. Agrupa por `spreadsheetId`, abre cada archivo una vez por ejecución y lee las pestañas solicitadas. Devuelve un objeto indexado por cada `key`.

Es una lectura integral de todas las filas de las pestañas solicitadas; la agrupación reduce aperturas repetidas, no el volumen de filas. Cada clave debe ser única y los encabezados requeridos deben existir.

### 6.2 `listRecordsFromSourcesCached(requests, expirationSeconds)`

Mismo formato de entrada que la lectura agrupada, con `key` única por solicitud. Por defecto usa TTL de 300 segundos; rango permitido 1..21600. Mantiene una instantánea por fuente y reutiliza entradas de CacheService. Las fuentes faltantes se agrupan para abrir cada archivo una vez y leer sus pestañas.

Una escritura Core cambia la generación efectiva de la fuente; las dependencias declaradas participan en esa generación. La caché puede ser desalojada antes del TTL y la función debe reconstruir la fuente completa al producirse un miss. No representa almacenamiento persistente.

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

Bajo bloqueo, genera una nueva generación de la fuente e invalida metadatos/instantánea de esa fuente. Devuelve `{ success, generation, removed }` o `{ success: false, error }`. Los resultados derivados que incluyan la generación anterior dejan de ser accesibles aunque permanezcan físicamente en CacheService.

Los consumidores deben comprobar `success` en tareas administrativas críticas. Las escrituras implementadas por Core llaman a la invalidación internamente; no deben duplicar invalidaciones dispersas salvo operaciones especiales.

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

1. Core usa `CacheService.getScriptCache()`. La caché es temporal, puede perder entradas antes del TTL y no es almacenamiento durable.
2. Las fuentes tienen claves físicas distintas por ID de archivo, pestaña, fila de encabezados y tipo de entrada.
3. La generación efectiva incluye las generaciones de dependencias declaradas. Al invalidar el maestro, la clave efectiva de una réplica cambia en la siguiente consulta.
4. Los resultados de `queryRecords` quedan separados por contexto de autorización y datos organizacionales/relacionales suministrados. La caché de candidatos no se entrega directamente: se revalida por solicitud.
5. La invalidación por generaciones cubre escrituras efectuadas por Core. Una modificación manual en Google Sheets o por otra aplicación que no use Core **no cambia automáticamente la generación**. La consistencia ante escrituras externas, ediciones manuales y disparadores no está resuelta solo por este contrato; se aborda en la Fase 4 sin introducir triggers nuevos sin justificación.
6. La apertura de Spreadsheet reutiliza manejadores durante la ejecución mediante un LRU máximo de 12 IDs. Es una optimización del contexto de ejecución, no caché de datos.
7. `listRecords`, `listRecordsFromSources`, `insertRecord`, `updateRecord`, `deleteRecord` y operaciones compuestas que utilizan `_coreGetTable_` procesan la tabla completa. No son consultas paginadas en origen. Las operaciones de escritura siguen necesitando proteger unicidad bajo bloqueo; su costo debe optimizarse en la fase de repositorio sin introducir carreras.

## 10. Reglas de compatibilidad para consumidores

- No llamar funciones privadas con guion bajo; no son parte del contrato de biblioteca.
- Declarar campos, relaciones, permisos y fuentes en cada consulta. Core no debe recibir ni devolver tablas globales para que el navegador filtre.
- Usar `queryRecords` para listados funcionales sujetos a ámbito. Las funciones genéricas de listado no incorporan autorización.
- Para datos sensibles, la decisión de permiso y ámbito debe ocurrir en backend antes de devolver la respuesta. Nunca usar la caché final sin la comprobación de autorización que exige Core.
- No asumir que `offset`/`limit` en `queryRecords` equivale a paginación física/SQL en origen; revisar `candidateCount`, `authorizedCount`, `retainedForPage` y `durationMs`.
- Mantener los catálogos organizacionales y sus réplicas declarados conforme a la fuente que cada consumidor haya decidido utilizar; no unificarlos por conveniencia.
- Los servicios deben rechazar relaciones inexistentes cuando las hayan declarado obligatorias. Para relaciones opcionales, omitir `required: true`.
- Toda escritura por rutas ajenas a Core debe contemplarse en la estrategia de consistencia externa de la Fase 4.

## 11. Verificación de versión y publicación

El manifiesto de Gestor sigue declarando Core versión 9. El código fuente ya contiene contratos que Gestor comprueba como v10, pero un manifiesto no demuestra qué código contiene una versión publicada.

Para cerrar el paso a v10 es necesario:
1. Completar y probar el contrato descrito aquí contra todos los consumidores.
2. Confirmar que los archivos `.js` de Core se incluyan en el proyecto Apps Script (el `.clasp.json` tiene `rootDir: ""` y extensiones `.js`/ `.gs`).
3. Ejecutar `runCoreTests()` desde el proyecto de Core para las pruebas reales con hojas temporales.
4. Revisar la versión publicada y crear una versión nueva desde el proyecto Apps Script con el procedimiento aprobado.
5. Verificar que el número 10 y sus funciones son visibles en la biblioteca mediante Apps Script.
6. Solo después preparar el cambio de `appsscript.json` del Gestor de 9 a 10 y probarlo mediante el mecanismo de pruebas de Gestor.

No publicar ni desplegar automáticamente aplicaciones de producción. La auditoría realizada mediante GitHub no permite afirmar el contenido efectivo de la versión publicada 9 ni que v10 ya exista.
