# Modelo de datos y filtros jerárquicos de Información de personal

**Propósito:** conservar el modelo real de las hojas, las relaciones que alimentan la interfaz y el estado de la investigación del filtro jerárquico. Este documento es el punto de continuidad para los siguientes chats. No debe reiniciarse el análisis ni deducirse la estructura por los nombres de las unidades.

**Fecha de referencia de los datos compartidos:** 24 de noviembre de 2026  
**Rama examinada:** `feat/directorio-personas-datos-asignaciones`  
**HEAD del código implementado y probado:** `5c253513480273090e6d5dc9980997009357cad8`.  
**Estado de CI de la implementación:** 274/274 pruebas aprobadas, 0 fallidas en GitHub Actions (push #1487 y PR #1488, HEAD `5c253513480273090e6d5dc9980997009357cad8`).  
**Estado de despliegue:** la aprobación de CI no acredita que el comportamiento esté publicado ni validado en la implementación de pruebas de Apps Script.

---

## 1. Regla principal: existen dos relaciones diferentes

La estructura de las hojas tiene dos dimensiones que no deben confundirse:

1. **Jerarquía orgánica:** la define exclusivamente `estructura_org.parent_id`, dentro de una misma sede.
2. **Adscripción física:** relaciona una unidad orgánica con un local mediante `estructura_local`.

La asignación de personal se vincula a esa segunda relación. Por ello, la estructura orgánica no se obtiene leyendo directamente `asignaciones.estructura_local_id` como si fuese un `estructura_org.id`.

### 1.1. Relaciones entre pestañas

| Origen | Campo | Destino | Significado |
|---|---|---|---|
| `asignaciones` | `persona_id` | `personas.persona_id` | Persona a la que pertenece la asignación |
| `asignaciones` | `estructura_local_id` | `estructura_local.id` | Adscripción orgánica en un local concreto |
| `asignaciones` | `local_id` | `locales.id` | Local directo, especialmente para asignaciones sin estructura orgánica |
| `estructura_local` | `estructura_id` | `estructura_org.id` | Unidad orgánica asociada a la relación |
| `estructura_local` | `local_id` | `locales.id` | Local en el que está adscrita esa unidad |
| `estructura_org` | `sede_id` | `sede.id` | Sede a la que pertenece la unidad orgánica |
| `estructura_org` | `parent_id` | `estructura_org.id` | Padre orgánico directo; vacío para las raíces de esa sede |
| `locales` | `sede_id` | `sede.id` | Sede a la que pertenece el local |
| `locales` | `parent_id` | `locales.id` | Relación entre locales, no jerarquía orgánica |

`tipo_estructura_id` clasifica la unidad (por ejemplo, GERENCIA, UNIDAD_FUNCIONAL, SERVICIO o ARCHIVO); no establece quién es su padre. `order` ordena elementos; tampoco establece relaciones padre-hijo.

`estructura_local` tampoco establece la jerarquía orgánica. Es una relación de ubicación entre estructura y local. No se debe recorrer para decidir qué unidad es hija de otra.

### 1.2. Encabezados observados

- `sede`: `id, name`
- `locales`: `id, sede_id, tipo_local_id, name, parent_id, active`
- `tipo_estructura`: `id, name, active`
- `estructura_org`: `id, sede_id, parent_id, tipo_estructura_id, name, order, active`
- `estructura_local`: `id, estructura_id, local_id, referencia, active`
- `asignaciones`: `asignacion_id, persona_id, cargo_id, condicion_cargo, anexo, estructura_local_id, local_id, observaciones, active, order`
- `personas`: `persona_id, nombres, apellidos, correo_institucional`
- `servidores datos personales`: `servidor_id, tipo_documento, numero_documento, fecha_nacimiento, fecha_inicio_servicios, fecha_cese`

Los datos personales no definen ni intervienen en la jerarquía de los filtros.

---

## 2. Ejemplo real: Sede Central → Gerencia General

En los datos compartidos, la ruta está definida así:

| `estructura_org.id` | Unidad | `sede_id` | `parent_id` | Tipo |
|---|---|---|---|---|
| `SC_GERENCIA_GENERAL` | Gerencia General | `SEDE_CENTRAL` | vacío | GERENCIA |
| `SC_UF_INTEGRIDAD` | Unidad Funcional de Integridad Institucional | `SEDE_CENTRAL` | `SC_GERENCIA_GENERAL` | UNIDAD_FUNCIONAL |
| `SC_UF_GESTION_DOCUMENTAL` | Unidad Funcional de Gestión Documental y Atención a la Ciudadanía | `SEDE_CENTRAL` | `SC_GERENCIA_GENERAL` | UNIDAD_FUNCIONAL |
| `SC_TRAMITE_DOCUMENTARIO` | Trámite Documentario | `SEDE_CENTRAL` | `SC_UF_GESTION_DOCUMENTAL` | SERVICIO |
| `SC_ARCHIVO_CENTRAL` | Archivo Central | `SEDE_CENTRAL` | `SC_UF_GESTION_DOCUMENTAL` | ARCHIVO |

La ruta esperada de los selectores, cuando los registros autorizados contienen esas ramas, es:

1. La selección de sede restringe el conjunto a `sede_id = SEDE_CENTRAL`. La sede es un filtro de contexto: no es un nodo padre dentro de `estructura_org`.
2. El primer selector orgánico presenta las raíces seleccionables de esa sede. En este ejemplo debe incluir Gerencia General si sus registros autorizados o los de sus descendientes la hacen relevante.
3. Después de seleccionar Gerencia General, el siguiente selector presenta **solo sus hijos directos**: Unidad Funcional de Integridad Institucional y Unidad Funcional de Gestión Documental y Atención a la Ciudadanía.
4. Después de seleccionar Unidad Funcional de Gestión Documental, el siguiente selector presenta **solo sus hijos directos**: Trámite Documentario y Archivo Central, siempre que cada rama tenga registros autorizados que la hagan seleccionable.

No se debe saltar la Unidad Funcional de Gestión Documental para colocar sus hijos al mismo nivel que Integridad Institucional.

### 2.1. Los nodos intermedios pueden no tener asignaciones propias

Una unidad intermedia debe conservarse como opción cuando es ancestro de una unidad descendiente que sí tiene asignaciones autorizadas. Por ejemplo, si hay asignaciones autorizadas en Trámite Documentario, debe conservarse Unidad Funcional de Gestión Documental para que el usuario pueda navegar por el nivel correcto.

Esto no significa mostrar todas las estructuras del catálogo. Solo deben aparecer nodos que formen parte de rutas hacia registros autorizados y que respeten los ámbitos y sede aplicables. No deben inventarse hijos ni mostrarse ramas sin registros autorizados.

La hoja `estructura_org` define las unidades y sus relaciones padre-hijo. La hoja `asignaciones`, mediante `estructura_local_id` y la relación correspondiente de `estructura_local`, permite resolver a qué unidad orgánica está vinculada cada asignación. Ambas fuentes cumplen funciones distintas dentro del modelo y deben interpretarse conjuntamente.

---

## 3. Adscripción: cómo resolver una asignación

### 3.1. Asignación con `estructura_local_id`

La ruta correcta es:

```text
asignaciones.estructura_local_id
    → estructura_local.id
        → estructura_local.estructura_id
            → estructura_org.id
        → estructura_local.local_id
            → locales.id
```

La sede se comprueba con `estructura_org.sede_id` y `locales.sede_id`. Para que la relación sea válida, ambos valores deben coincidir.

En el extracto, por ejemplo:

- `ASG_016` apunta a `EL_SC_GERENCIA_GENERAL`.
- `EL_SC_GERENCIA_GENERAL` apunta a `SC_GERENCIA_GENERAL` y a `SC_PRIMAVERA`.
- `SC_GERENCIA_GENERAL.sede_id` y `SC_PRIMAVERA.sede_id` son `SEDE_CENTRAL`.

También hay asignaciones a `EL_SC_UF_INTEGRIDAD`, `EL_SC_TRAMITE_5` y `EL_SC_TRAMITE_1`.

### 3.2. Asignación solo con `local_id`

Hay asignaciones donde `estructura_local_id` está vacío y `local_id` contiene directamente un ID de `locales`. Ejemplos del extracto: `ASG_406`, `ASG_411` a `ASG_417`.

Estas asignaciones permiten resolver sede y local, pero **no proporcionan un `estructura_org.id`**. No se les debe inventar una unidad orgánica ni incorporarlas a un nodo de la jerarquía por semejanza de nombre. Pueden participar en el filtro de sede/local y en los resultados que correspondan, pero no generan opciones de jerarquía orgánica si no tienen una estructura resoluble.

### 3.3. Cuando vienen ambos campos

Si una asignación contiene `estructura_local_id` y `local_id`, el local debe coincidir con el `local_id` de la relación `estructura_local`. Una discrepancia debe rechazarse, no corregirse silenciosamente.

El resolver actual `_directoryResolveAssignmentLocation_()` de `DirectoryService.js` implementa estas comprobaciones:
- exige que exista al menos una de las dos referencias;
- comprueba que las referencias existan;
- comprueba que el local directo coincida con el de la relación cuando ambos se proporcionan;
- obtiene la estructura mediante `estructura_local.estructura_id`;
- exige que estructura y local pertenezcan a la misma sede.

---

## 4. Particularidades que afectan la construcción de los filtros

### 4.1. Una estructura puede tener varias adscripciones físicas

En el extracto hay más de una fila de `estructura_local` para una misma estructura orgánica:

- `SC_TRAMITE_DOCUMENTARIO`: `EL_SC_TRAMITE_5` y `EL_SC_TRAMITE_1`, ambos en `SC_PRIMAVERA`, pero con referencias de piso diferentes.
- También aparecen múltiples relaciones para Dirección Técnica Registral, Gestión de Recursos Humanos, Seguridad y algunas Salas.

En consecuencia:
- la unidad del selector es `estructura_org.id`, no `estructura_local.id`;
- dos relaciones físicas de la misma estructura no deben duplicar la opción orgánica;
- las asignaciones deben conservar su ubicación/referencia correspondiente.

### 4.2. No todos los nodos de una sede tienen padre orgánico

En `estructura_org`, varias unidades de Sede Central tienen `parent_id` vacío. También hay numerosas estructuras de zonas registrales con `parent_id` vacío. Esto es un dato explícito de la hoja y no autoriza a inventar relaciones por orden, nombre, tipo o local.

La raíz se identifica por `parent_id` vacío (o por un padre inexistente/incompatible, que debe tratarse como problema de integridad y no como una relación inventada), dentro de la sede seleccionada.

### 4.3. Anomalías de sede en el extracto de `estructura_local`

Se identificaron dos relaciones cuyo local y estructura no pertenecen a la misma sede:

- `EL_SC_SALA_CUARTA_TRUJILLO`: estructura de `SEDE_CENTRAL`, local `ZR_V_TRUJILLO` de `ZR_V`.
- `EL_SC_SALA_QUINTA_AREQUIPA`: estructura de `SEDE_CENTRAL`, local `ZR_XII_AREQUIPA` de `ZR_XII`.

La implementación actual de `_directoryBuildRelations_()` descarta relaciones donde `estructura_org.sede_id` y `locales.sede_id` no coinciden; el diagnóstico `relationIntegrity` de la carga de sede cuenta las relaciones cruzadas. No corregir estas filas ni alterar sus sedes sin confirmación del responsable de los datos.

---

## 5. Qué debe hacer exactamente el filtro en cascada

La lógica funcional debe ser equivalente a esta:

```text
seleccionar sede
  └─ limitar asignaciones y catálogo orgánico a esa sede y ámbito autorizado
      └─ mostrar raíces orgánicas seleccionables
          └─ al elegir un nodo, mostrar únicamente sus hijos directos seleccionables
              └─ repetir hasta que el nodo elegido no tenga hijos seleccionables
```

Para construir los nodos seleccionables:

1. Resolver cada asignación a `estructura_org.id` mediante las relaciones descritas.
2. Mantener solo asignaciones que ya fueron autorizadas y pertenecen a la sede activa.
3. Para cada estructura con asignaciones autorizadas, recorrer sus padres por `parent_id` dentro de la misma sede y conservar esos ancestros como nodos intermedios.
4. Mostrar en el primer nivel solo raíces pertenecientes a ese conjunto.
5. Después de cada selección mostrar exclusivamente registros cuyo `parent_id` sea el ID seleccionado y que también pertenezcan al conjunto seleccionable.
6. Filtrar los resultados por el subárbol del último nodo elegido, no solo por coincidencia de nombre o tipo.

El filtro de sede y el filtro jerárquico son dimensiones conectadas, pero distintas:
- `sede_id` restringe el ámbito;
- `parent_id` determina el siguiente nivel orgánico;
- `estructura_local_id` permite resolver una asignación a estructura y ubicación;
- `local_id` permite resolver adscripciones físicas directas.

No usar `locales.parent_id` para construir la jerarquía orgánica. No usar `estructura_local.id` como ID de nodo del selector. No agrupar todos los registros por `tipo_estructura_id` para simular niveles.

---

## 6. Código actual inspeccionado y límite de lo que demuestran las pruebas

En el HEAD indicado se observó este flujo en el Gestor:

1. `getDirectoryInitialData()` devuelve las sedes autorizadas sin cargar todas las asignaciones.
2. Al elegir una sede, el cliente llama a `getDirectorySiteData(sedeId)`.
3. `_directoryBuildSiteData_()` carga y autoriza asignaciones, resuelve adscripciones, enriquece los registros y devuelve catálogos restringidos.
4. El frontend `DirectoryScripts.html` construye `hierarchyIndex` y `hierarchySelectableIds`.
5. `renderHierarchyFilters()` llama a `appendHierarchyLevel()`; cada selector siguiente se obtiene con `getHierarchyNodes(parentId)` y el helper `_directoryGetSelectableHierarchyChildren_()`.

Funciones relevantes para revisar conjuntamente, no de forma aislada:

- Backend: `_directoryResolveAssignmentLocation_()`
- Backend: `_directoryBuildRelations_()`
- Backend: `_directoryEnrichAssignment_()`
- Backend: `_directoryBuildSiteData_()`
- Backend: `_directoryBuildFilterContract_()`
- Frontend: `_directoryBuildHierarchyFilterSets_()`
- Frontend: `_directoryBuildHierarchyClientIndex_()`
- Frontend: `getHierarchyNodes()`
- Frontend: `appendHierarchyLevel()`
- Frontend: `renderHierarchyFilters()`
- Frontend: `refreshDependentFilters()`

El test de regresión jerárquica añadido en `tests/directory-service.test.cjs` prueba el helper con una jerarquía pequeña y registros de prueba que ya contienen `estructura_id`. Comprueba que se conservan ancestros y que se devuelven hijos directos. Es útil, pero **no demuestra por sí solo**:
- que la unión real `asignaciones.estructura_local_id → estructura_local.id → estructura_org.id` funcione con el contenido de las hojas;
- que la respuesta completa de `getDirectorySiteData()` contenga los IDs y niveles correctos;
- que el HTML genere y actualice correctamente los selectores al elegir cada nivel;
- que el comportamiento sea correcto en la implementación real de Apps Script.

Las 272 pruebas aprobadas en CI no sustituyen estas comprobaciones funcionales.

---

## 7. Incidencia funcional pendiente

**Síntoma reportado por el responsable del proyecto:** en la aplicación no se comportan como una cascada jerárquica real; aparecen las sedes y, después, la selección no respeta los niveles siguientes y termina mostrando áreas en conjunto, en lugar de continuar desde el elemento padre seleccionado.

Este síntoma no se considera resuelto. La corrección anterior del helper y sus pruebas no bastan para declarar que la interfaz funciona.

No atribuir todavía la causa a `parent_id`, a los ámbitos ni a la caché sin observar los valores que atraviesan cada frontera del flujo.

### Comprobación obligatoria para localizar la causa

Con la selección de Sede Central, inspeccionar en orden:

1. Valor de sede seleccionado y llamada efectiva a `getDirectorySiteData('SEDE_CENTRAL')`.
2. `result.records`: asignaciones y campos resueltos `estructura_id`, `filter_sede_id`, `estructura_local_id` y `filter_local_id`.
3. `result.catalogs.estructuraOrg`: IDs, `sede_id`, `parent_id`, nombre y estado de los nodos relevantes.
4. `result.catalogs.filterContract.scopes` y el conjunto `hierarchySelectableIds` calculado en el cliente.
5. Opciones de `getHierarchyNodes('')`: deben ser raíces seleccionables de la sede; no todas las unidades del catálogo.
6. Después de elegir `SC_GERENCIA_GENERAL`, opciones de `getHierarchyNodes('SC_GERENCIA_GENERAL')`: solo `SC_UF_INTEGRIDAD` y `SC_UF_GESTION_DOCUMENTAL`, cuando ambas ramas tengan registros autorizados.
7. Después de elegir `SC_UF_GESTION_DOCUMENTAL`, opciones de `getHierarchyNodes('SC_UF_GESTION_DOCUMENTAL')`: solo `SC_TRAMITE_DOCUMENTARIO` y `SC_ARCHIVO_CENTRAL`, cuando ambas ramas tengan registros autorizados.
8. Comprobar que el evento change conserva la ruta seleccionada, reconstruye el siguiente nivel y filtra la tabla por el subárbol del último nodo.

Esta inspección debe permitir identificar si el fallo aparece en la resolución de las hojas, en la respuesta del backend, en el conjunto de nodos seleccionables o en el ciclo de eventos/renderizado del frontend.

---

## 8. Pruebas de aceptación antes de declarar la corrección

- Una prueba de servicio usa las columnas reales de las seis hojas relevantes y resuelve asignaciones por `estructura_local_id`, sin preinyectar `estructura_id` en los datos de origen.
- Se prueba una unidad intermedia sin asignación propia que sí tiene descendientes con asignaciones: debe mantenerse como opción.
- Se prueba que al seleccionar un nodo solo se reciben sus hijos directos; ningún nieto puede aparecer como hermano.
- Se prueba que no se muestran ramas sin registros autorizados.
- Se prueba que la misma estructura con dos filas en `estructura_local` produce una sola opción orgánica.
- Se prueba una asignación solo con `local_id`: resuelve sede/local, pero no inventa estructura orgánica.
- Se prueba rechazo de referencias inconsistentes y de relaciones entre sedes.
- Una prueba de interfaz o integración recorre los selectores reales: Sede Central → Gerencia General → Unidad Funcional de Gestión Documental → hijos directos.
- Se comprueba que el resultado de la tabla corresponde al subárbol elegido y conserva las restricciones de autorización.

Se verifica el recorrido jerárquico de Archivo Central según su `parent_id` y los registros autorizados que devuelve el servicio.

---

## 9. Instrucciones para continuar en otro chat

Al retomar este proyecto:

1. Leer primero este documento y el código vigente de la rama; no repetir la explicación del modelo desde cero.
2. No asumir que la interfaz está corregida por el resultado de un test unitario del helper.
3. No volver a pedir las relaciones básicas de las hojas: ya están documentadas aquí. Pedir datos adicionales solo cuando sean necesarios para confirmar una fila o una ejecución que no aparece en el extracto.
4. No modificar rendimiento, permisos, otras pantallas ni el modelo de datos mientras se aísla la incidencia de cascada.
5. Reproducir el flujo completo desde las hojas hasta el DOM, registrar valores en cada frontera y corregir la primera divergencia comprobada.
6. Mantener separadas las dos líneas del proyecto: consistencia funcional primero; optimización de rendimiento después.
7. No desplegar ni pedir al responsable una nueva prueba hasta que las pruebas de servicio e interfaz demuestren el recorrido con las relaciones reales.

**Criterio de cierre:** los selectores deben reflejar la jerarquía almacenada en `estructura_org.parent_id`, restringida por sede y asignaciones autorizadas resueltas mediante `estructura_local`. La interfaz debe mostrar un solo nivel descendiente por selección, sin saltos, aplanamientos ni ramas inventadas.


---

## 10. Comportamiento esperado según el ámbito autorizado

La interfaz no debe decidir su comportamiento por el nombre del rol (administrador, editor o consulta), sino por los permisos y, especialmente, por los registros activos de **AmbitosAcceso** para **MOD_INFO_PERSONAL**. El permiso **INFORMACION_PERSONAL_VER** habilita la consulta; el ámbito determina el conjunto visible y la forma inicial de navegarlo.

### 10.1. Administrador con ámbito TOTAL exclusivo

Al entrar en Información de personal:

- La tabla debe permanecer vacía.
- El selector de sede debe estar visible y comenzar en **«Seleccione una opción»**.
- Sus opciones deben ser las sedes activas que devuelve **getDirectoryInitialData()** para el ámbito TOTAL.
- No debe seleccionarse automáticamente una sede.
- No debe cargarse información agregada de todas las sedes.
- No deben aparecer filtros de cargos ni de estructura orgánica mientras no se elija una sede.

Cuando el administrador selecciona una sede:

1. Se llama a **getDirectorySiteData(sedeId)**.
2. El backend vuelve a comprobar el ámbito TOTAL y limita la respuesta a la sede seleccionada.
3. La tabla muestra todos los registros autorizados de esa sede.
4. Los filtros orgánicos se construyen únicamente con las estructuras de esa sede y las asignaciones autorizadas que contiene la respuesta.
5. El filtro de cargos se construye con los cargos presentes en esos registros.

El administrador puede cambiar de sede desde el mismo selector. Al volver a «Seleccione una opción», se limpia la tabla y se retiran los filtros dependientes; no se debe interpretar esa opción vacía como una solicitud de cargar todas las sedes.

Esta regla se mantiene aunque el catálogo devolviera una sola sede: un ámbito TOTAL significa que la selección corresponde al usuario, no que la aplicación deba convertir el ámbito en una adscripción fija.

### 10.2. Usuario con ámbito SEDE y una sola sede autorizada

Al entrar:

- La sede autorizada se aplica como contexto fijo.
- No aparece el selector de sede, porque el usuario no tiene que elegir entre sedes.
- Se carga automáticamente la sede mediante **getDirectorySiteData(sedeId)**.
- La tabla muestra todos los registros permitidos en esa sede, no solo los de una estructura elegida en un filtro.
- Los filtros orgánicos, si corresponden, permiten navegar la jerarquía de esa misma sede.
- El filtro de cargos se alimenta exclusivamente de los registros autorizados.

El rol no cambia este comportamiento. Un editor, un usuario de consulta u otro rol con el mismo ámbito SEDE debe recibir el mismo alcance de lectura.

### 10.3. Usuario con ámbito ESTRUCTURA_ORG sobre una única área terminal

Si el usuario tiene acceso a una unidad orgánica y esa unidad no tiene descendientes que formen parte de su autorización:

- La sede se aplica como contexto fijo; no aparece el selector de sede cuando solo hay una sede autorizada.
- La tabla muestra los registros de la unidad permitida.
- No aparecen selectores de jerarquía orgánica.
- Se muestra el filtro de cargos con los cargos presentes en esos registros.
- No se muestran unidades hermanas, superiores ni descendientes que no estén incluidas en el ámbito.

Si el ámbito tiene **incluir_descendientes = false**, la autorización se limita a la unidad indicada aunque el catálogo estructura_org tenga hijos. La existencia de hijos en el catálogo no concede permiso para mostrarlos ni consultar sus registros.

Si **incluir_descendientes = true**, pero no existen descendientes con registros autorizados que permitan navegar, tampoco se muestran selectores orgánicos: la unidad autorizada queda implícita y la tabla presenta su conjunto completo permitido.

### 10.4. Usuario con ámbito ESTRUCTURA_ORG y descendientes autorizados

Cuando existe una única unidad raíz de ámbito:

- Esa unidad se considera implícita; no se obliga al usuario a seleccionarla de nuevo.
- El primer selector orgánico muestra solamente sus hijos directos que conduzcan a registros autorizados.
- Cada selector posterior muestra exclusivamente los hijos directos del nodo seleccionado.
- Si el nodo seleccionado no tiene hijos seleccionables, no se crea otro selector.
- La tabla inicial contiene toda la información permitida por el ámbito (unidad raíz y descendientes autorizados); la selección orgánica es un filtro opcional sobre ese conjunto.

Cuando hay varias referencias ESTRUCTURA_ORG autorizadas dentro de la misma sede, el primer nivel debe permitir distinguir esas áreas autorizadas. Una vez elegida una de ellas, los siguientes niveles deben continuar únicamente por sus hijos directos y respetar el valor **incluir_descendientes** de esa referencia. No se deben unir los hijos de referencias independientes en un selector que pierda la relación con su respectivo ámbito raíz.

Si una referencia está completamente cubierta por otra referencia ancestro que ya concede acceso a sus descendientes, la navegación debe evitar duplicar la misma rama.

### 10.5. Ámbito LOCAL

Un ámbito LOCAL permite consultar las asignaciones que correspondan al local autorizado. No crea por sí mismo una unidad orgánica. Si las asignaciones carecen de **estructura_local_id** y solo tienen **local_id**, no se debe inventar una estructura para generar selectores. En ese caso no hay cascada orgánica; se presenta la tabla autorizada y el filtro de cargos.

### 10.6. Reglas comunes

- La autorización se aplica en el backend antes de devolver registros. Los filtros del navegador nunca amplían permisos.
- La tabla de un usuario con ámbito fijo se carga con el conjunto completo que su ámbito permite; no se debe obligar a seleccionar cada nivel para que aparezcan los registros.
- El selector de sede es una decisión de contexto: se exige para TOTAL y se omite cuando el ámbito no deja al usuario elegir entre sedes.
- Los selectores orgánicos representan **estructura_org.parent_id**; cada nivel muestra hijos directos, no todos los descendientes.
- Los nodos intermedios se conservan para que el recorrido no salte niveles, aunque no tengan asignaciones propias, siempre que sean ancestros reales de registros autorizados.
- El filtro de cargos se muestra cuando el conjunto cargado contiene cargos. Si solo existe un cargo, se mantiene visible con su única opción y deshabilitado; no se oculta por el simple hecho de que haya una sola opción.
- La jerarquía nunca se deduce de **locales.parent_id**, **estructura_local.id**, **tipo_estructura_id**, el nombre de las unidades o el campo **order**.

---

## 11. Divergencias comprobadas antes de la corrección

La revisión del código previo en el HEAD **ae07efe63c12451d2241b2b1a00ee10626f6f38f** confirmó las siguientes divergencias. La sección 14 registra cómo se corrigieron.

### 11.1. El ámbito TOTAL carga todas las sedes al entrar

En **DirectoryScripts.html**, la función **load()** hace lo siguiente cuando **state.hasTotalScope** y hay más de una sede:

1. Oculta el contenedor del selector de sede.
2. Llama a **getDirectoryAuthorizedData()**.
3. Coloca en **state.records** los registros de todas las sedes.
4. Establece **state.activeSedeId = '__ALL__'**.
5. Construye un índice jerárquico conjunto con estructuras de todas las sedes.
6. Renderiza la tabla y los filtros sin que el administrador haya seleccionado una sede.

Esto contradice directamente el escenario TOTAL: la tabla no debe cargar al entrar, el selector debe permanecer visible y la primera elección debe ser una sede concreta.

Además, **getHierarchyNodes('')**, para el ámbito amplio, obtiene las raíces del índice completo. Cuando el índice contiene varias sedes, las raíces de esas sedes se presentan juntas. Se pierde la sede como primer nivel de contexto, por lo que la interfaz puede mostrar unidades orgánicas de distintas sedes dentro de una misma lista.

La misma ruta también trata de forma distinta el caso TOTAL con una sola sede: el bloque **else if (state.authorizedSedes.length === 1)** la carga automáticamente. El ámbito TOTAL debe conservar la selección explícita incluso si el conjunto disponible tiene una sola opción.

### 11.2. La regla de visibilidad del selector de sede depende solo del número de sedes

**populateSedeFilter()** selecciona automáticamente la única sede y oculta el contenedor cuando **sedes.length <= 1**. Esa regla es correcta para un ámbito fijo de una sede, pero no para TOTAL. La visibilidad no puede depender exclusivamente del número de opciones: primero debe distinguirse si el ámbito es TOTAL o si la sede viene impuesta por la autorización.

### 11.3. El filtro de cargos desaparece cuando hay una única opción

**populateCargoFilter()** oculta el contenedor cuando **cargos.length <= 1**. Esto no coincide con el comportamiento solicitado para un usuario cuyo ámbito se reduce a una sola área terminal: en ese escenario no habrá filtros orgánicos y debe quedar disponible el filtro de cargos cuando el conjunto tenga cargos, incluso si solo existe uno.

### 11.4. Falta una navegación explícita para varias raíces ESTRUCTURA_ORG

En **getHierarchyNodes('')**, cuando no hay ámbito TOTAL o SEDE, el código combina los hijos directos de cada referencia **ESTRUCTURA_ORG** con **incluir_descendientes = true**. No representa explícitamente las propias referencias autorizadas cuando existen varias áreas independientes. Esa combinación puede hacer que se pierda el contexto de cuál de las áreas autorizadas origina cada rama.

Debe diferenciarse el caso de una sola referencia (raíz implícita) del caso de varias referencias (primer nivel de elección entre las áreas autorizadas), sin ampliar ninguna de ellas.

### 11.5. Lo que ya está correctamente separado y debe conservarse

- **getDirectoryInitialData()** obtiene los ámbitos y sedes autorizadas sin cargar asignaciones.
- **getDirectorySiteData(sedeId)** valida la sede elegida, vuelve a construir el contexto de autorización y produce una respuesta limitada a esa sede.
- **_directoryBuildSiteData_()** autoriza las asignaciones antes del enriquecimiento y devuelve catálogos restringidos a la sede.
- **_directoryResolveAssignmentLocation_()** resuelve la estructura a través de asignaciones.estructura_local_id → estructura_local.estructura_id → estructura_org.id.
- **_directoryGetSelectableHierarchyChildren_()** devuelve hijos directos y verifica la sede del padre y del hijo.
- El índice de cliente permite filtrar por subárbol sin recorrer repetidamente toda la jerarquía.

La corrección debe aprovechar esas piezas; no requiere modificar las hojas, renormalizar datos ni cambiar el modelo de relaciones.

---

## 12. Solución técnica implementada

La solución se concentra en el flujo de carga inicial y en la selección de nodos de la interfaz. La autorización del backend se conserva como autoridad y cada carga de sede sigue validándose en el servidor.

### Fase A. Separar el modo de selección de sede del número de sedes

En el frontend, determinar el modo con el resumen del ámbito recibido por **getDirectoryInitialData()**:

- **TOTAL exclusivo:** selector de sede visible, valor vacío y tabla sin registros al entrar. No llamar a **getDirectoryAuthorizedData()** desde la página.
- **Ámbito fijo con una sola sede autorizada:** ocultar selector de sede, aplicar esa sede y ejecutar **getDirectorySiteData(sedeId)** automáticamente.
- **Sin sede autorizada válida:** no cargar datos ni inventar un contexto.

Para TOTAL, la opción vacía debe significar únicamente «todavía no se ha seleccionado una sede». Al volver a ella, limpiar **records**, índice jerárquico, ruta seleccionada, opciones de cargos y tabla. No debe invocar la carga agregada.

La función **getDirectoryAuthorizedData()** puede conservarse si otro flujo del sistema la necesita; simplemente deja de ser la ruta de entrada de la página Información de personal.

### Fase B. Cargar cada sede de manera aislada

Después de elegir una sede, utilizar exclusivamente **getDirectorySiteData(sedeId)**. Mantener:

- la comprobación de que esa sede pertenece al ámbito activo;
- la autorización de cada asignación en el servidor;
- los catálogos restringidos a esa sede;
- la caché identificada por usuario, sede y huella de autorización.

No se deben combinar instantáneas de distintas sedes para construir una única cascada. Cambiar de sede debe reemplazar los registros y el índice de la sede anterior, no agregarlos.

### Fase C. Construir la cascada según el tipo y número de ámbitos de estructura

Separar dos conceptos en el cálculo del navegador:

1. **Nodos autorizados/seleccionables:** nodos con asignaciones autorizadas y ancestros reales necesarios para recorrerlos.
2. **Raíces de navegación:** puntos desde los que el usuario debe empezar, derivados del ámbito de acceso.

Aplicar estas reglas:

- Para TOTAL o SEDE, la navegación comienza en las raíces orgánicas de la sede ya seleccionada.
- Para una única referencia ESTRUCTURA_ORG, la referencia autorizada es implícita. Si permite descendientes, la navegación comienza en sus hijos directos seleccionables. Si no tiene descendientes autorizados con registros, no se muestra selector.
- Para varias referencias ESTRUCTURA_ORG independientes en la misma sede, el primer selector presenta esas áreas autorizadas que tengan registros visibles; tras seleccionar una, se ofrecen solo sus hijos directos autorizados.
- Para LOCAL sin estructura orgánica resoluble, no se construye cascada orgánica.

En todos los casos, las opciones de cada nivel deben formar parte de rutas reales hacia registros autorizados. No basta con que la estructura exista en el catálogo. Los padres intermedios se conservan, y los nietos nunca se presentan como hijos directos.

### Fase D. Mantener la tabla y los filtros independientes

- Tras cargar una sede fija o seleccionar una sede con TOTAL, renderizar de inmediato todos los registros que el servidor ya autorizó para ese contexto.
- La ruta jerárquica comienza vacía. Por tanto, no reduce el conjunto inicial de la tabla.
- Una selección orgánica filtra por el subárbol de ese nodo.
- El filtro de cargos se obtiene de los registros autorizados del contexto actual; debe permanecer visible si hay al menos un cargo y quedar deshabilitado si solo hay una opción.
- Al cambiar de sede, se limpian todos los filtros dependientes y se crea un índice nuevo para la sede elegida.

### Fase E. Pruebas de regresión e integración obligatorias

Antes de publicar la corrección, probar el flujo completo, no solo los helpers:

1. **TOTAL al entrar:** selector visible en «Seleccione una opción», tabla vacía y sin llamada a **getDirectoryAuthorizedData()**.
2. **TOTAL al elegir Sede Central:** se carga solo **SEDE_CENTRAL**; el selector se mantiene para poder cambiar de sede; no aparecen registros de otras sedes.
3. **Cascada de Sede Central:** Gerencia General → hijos directos Unidad Funcional de Integridad y Unidad Funcional de Gestión Documental → hijos directos de Gestión Documental, Trámite Documentario y Archivo Central, cuando existan registros autorizados para esas ramas.
4. **TOTAL con una sola sede disponible:** el selector continúa visible y sin selección predeterminada.
5. **SEDE con una sede:** carga automática de la tabla autorizada y selector de sede oculto.
6. **ESTRUCTURA_ORG terminal:** tabla con sus registros; ningún selector orgánico; filtro de cargos visible si hay cargos.
7. **ESTRUCTURA_ORG con descendientes:** la raíz autorizada es implícita si es una sola; la cascada comienza en sus hijos directos.
8. **Varias referencias ESTRUCTURA_ORG en una sede:** primer nivel identifica las áreas autorizadas y cada rama conserva su propio padre.
9. **ESTRUCTURA_ORG sin descendientes autorizados:** no muestra niveles de catálogo fuera del ámbito aunque existan hijos en estructura_org.
10. **LOCAL:** sin estructura orgánica inventada.
11. **Relaciones reales:** los datos de prueba deben comenzar con las columnas originales de asignaciones, estructura_local, estructura_org y locales; no se debe preinyectar estructura_id en las asignaciones de origen.
12. **Interfaz real:** comprobar eventos change, reconstrucción de los niveles, conservación de la selección válida, limpieza de niveles posteriores y contenido final de la tabla.

Los tests unitarios actuales del helper siguen siendo útiles, pero no bastan para dar por cerrada la incidencia. La prueba de integración debe cubrir backend, respuesta, estado del frontend y selectores renderizados.

---

## 13. Criterio final de aceptación

La pantalla se comporta según el ámbito de autorización, no según una ruta universal de filtros:

- **TOTAL:** primero se elige sede; la tabla permanece vacía hasta entonces.
- **SEDE fija:** se carga directamente la tabla completa de esa sede autorizada, sin selector de sede.
- **ESTRUCTURA_ORG terminal:** se carga directamente su información permitida, sin selectores orgánicos; queda el filtro de cargos.
- **ESTRUCTURA_ORG con descendientes:** se navega desde la raíz autorizada, un nivel directo a la vez.
- **Varias áreas autorizadas en la misma sede:** se distinguen sus raíces y se recorren sus ramas sin mezclarlas.
- **LOCAL sin estructura:** no se fabrica jerarquía orgánica.

La autorización del backend es invariable. Los filtros solo permiten explorar el conjunto ya autorizado. El arreglo no debe modificar las hojas ni alterar relaciones normalizadas.

**Estado de implementación:** los cambios de interfaz y filtros ya están aplicados en **DirectoryScripts.html**. No fue necesario modificar **DirectoryService.js**: la validación de autorización por sede y la respuesta limitada a la sede seleccionada ya existían y se conservaron. La implementación está en la rama indicada en el encabezado.

---

## 14. Implementación realizada y validación

### 14.1. Cambios aplicados en DirectoryScripts.html

La implementación quedó limitada al frontend de Información de personal:

- **TOTAL:** se eliminó la carga agregada al entrar. El selector de sede permanece visible, inicia en «Seleccione una opción» y no selecciona automáticamente, incluso si solo existe una sede autorizada. La tabla permanece vacía hasta elegir una sede.
- **Cambio o limpieza de sede:** seleccionar una sede llama a getDirectorySiteData(sedeId). Volver al valor vacío cancela la solicitud pendiente, limpia registros, índice, ruta jerárquica, filtros dependientes y tabla. Ya no convierte el valor vacío en una carga global.
- **Ámbito fijo con una sede:** conserva la carga automática y oculta el selector de sede.
- **Cargo:** el filtro se oculta solamente cuando no hay cargos. Con una sola opción permanece visible y deshabilitado.
- **Jerarquía de estructura:** los nodos seleccionables se construyen desde las asignaciones autorizadas y las rutas reales de estructura_org.parent_id. Una referencia ESTRUCTURA_ORG única se trata como raíz implícita; sus hijos directos son el primer nivel si tiene descendientes autorizados. Varias referencias visibles se ofrecen como raíces de elección, evitando duplicar una rama que ya esté cubierta por una referencia ancestro con permiso de descendientes.
- **Ámbitos independientes:** si una referencia no incluye descendientes, seleccionar esa raíz filtra solo sus registros exactos y no incorpora los registros de un nodo hijo autorizado por otra referencia independiente.
- **Sin estructura orgánica:** las asignaciones locales sin estructura_id no generan opciones artificiales.

### 14.2. Backend y límites de la intervención

No se modificó DirectoryService.js, las hojas ni el modelo de datos. Se reutiliza el flujo que ya existía:

1. getDirectoryInitialData() entrega las sedes permitidas y el resumen del ámbito sin cargar asignaciones.
2. getDirectorySiteData(sedeId) valida nuevamente el ámbito y la sede concreta.
3. _directoryBuildSiteData_() devuelve únicamente los registros autorizados para esa sede.
4. El cliente construye filtros sobre esa respuesta; no decide permisos ni amplía el conjunto devuelto por el servidor.

Tampoco se modificó la carga de otras pantallas, Administración de accesos, SUNARP Core, la configuración de clasp ni los despliegues.

### 14.3. Pruebas ejecutadas

Se actualizaron las pruebas que codificaban la antigua carga agregada y se añadieron casos para:

- TOTAL sin carga inicial y elección explícita de sede;
- cascada TOTAL restringida a la sede seleccionada;
- raíz de ámbito ESTRUCTURA_ORG implícita;
- selección entre varias referencias orgánicas en una sede;
- deduplicación de referencias hijas cubiertas por una raíz ancestro con permiso de descendientes;
- unidad terminal sin selectores orgánicos;
- cargo único visible y deshabilitado;
- aislamiento de una referencia sin descendientes frente a otra referencia independiente sobre un nodo hijo.

**Resultado CI:** 274 pruebas aprobadas de 274, 0 fallidas, en push #1487 y PR #1488 para el HEAD 5c253513480273090e6d5dc9980997009357cad8.

Estas pruebas validan las funciones de jerarquía, las reglas de estado esperadas y las regresiones del repositorio. No equivalen a una prueba visual en la implementación real de Apps Script.

### 14.4. Verificación pendiente en la implementación de pruebas

Antes de publicar, comprobar en la implementación de pruebas de Apps Script:

1. Administrador TOTAL: entrar, comprobar tabla vacía y selector «Seleccione una opción». Hacerlo tanto con varias sedes como con una sola.
2. Elegir Sede Central y confirmar que la tabla contiene solo sus registros autorizados y que el selector continúa visible.
3. Recorrer Gerencia General → hijos directos → Unidad Funcional de Gestión Documental → Trámite Documentario y Archivo Central, verificando cada nivel sin saltos.
4. Usuario con ámbito SEDE y una única sede: confirmar carga automática de toda la tabla permitida y selector de sede oculto.
5. Usuario con una única área terminal: confirmar tabla permitida, ausencia de selectores orgánicos y filtro de cargos visible, incluso con un único cargo.
6. Usuario con varias referencias ESTRUCTURA_ORG en la misma sede: verificar que puede distinguir sus raíces y recorrer cada rama sin mezclar autorizaciones.
7. Repetir la comprobación con una raíz sin permiso de descendientes y una referencia independiente sobre un área hija.

**Despliegue:** no se ha ejecutado clasp push ni se ha publicado una versión de Apps Script desde este trabajo. La implementación está en GitHub, pendiente de que se sincronice y se pruebe en la implementación de prueba habitual.


---

## 15. Corrección del nivel físico Local — revisión del 25 de noviembre de 2026

Esta sección **sustituye el estado de implementación descrito en las secciones 13 y 14** cuando se trate de la incidencia Sede → Local → Estructura organizacional. La incidencia se originó porque la interfaz anterior omitía el selector físico Local y empezaba directamente la cascada de estructura_org.

### 15.1. Contrato de presentación

La navegación de consulta queda definida como:

1. **Sede:** limita el conjunto autorizado al ámbito de sede seleccionado.
2. **Local:** presenta únicamente locales relacionados con asignaciones autorizadas de la sede. La lista se construye intersectando records[].filter_local_id con catalogs.locales; el catálogo por sí solo no habilita opciones.
3. **Estructura organizacional:** presenta las rutas reales de estructura_org.parent_id que conducen a asignaciones autorizadas del local seleccionado.
4. **Descendientes:** cada selector siguiente contiene exclusivamente hijos directos del nodo seleccionado, manteniendo estructura_org.order entre hermanos.

El local seleccionado se aplica a los registros mediante filter_local_id. La sede se aplica mediante filter_sede_id. La selección de estructura filtra el subárbol real. Los tres filtros se acumulan con Cargo.

La tabla presenta Sede y Local en columnas separadas. La referencia física se muestra como detalle del Local. La dependencia conserva su ruta orgánica real.

### 15.2. Ubicación y autorización

El frontend no resuelve ni amplía permisos. Las opciones de Local se derivan de registros devueltos por getDirectorySiteData() después de autorización. La respuesta se reutiliza en memoria para los cambios de Local y estructura; esos cambios no generan llamadas adicionales a Apps Script.

Para permitir navegación con ámbito LOCAL, el backend incluye en el catálogo estructural los nodos de las asignaciones ya autorizadas y sus ancestros reales de la misma sede. Esto no incorpora asignaciones adicionales ni asigna al padre la ubicación de un hijo.

Las relaciones estructura_local devueltas se comprueban por el ámbito efectivo incluyendo estructura_id, sede_id y local_id. Las asignaciones que solo tienen local_id permanecen en la tabla y no generan una estructura artificial.

Los ámbitos TOTAL, SEDE, ESTRUCTURA_ORG y LOCAL conservan sus significados. Un Local fijo por ámbito se presenta como valor determinado y no habilita navegación a otros locales.

### 15.3. Orden del catálogo físico

La hoja locales observada en la fuente tiene 190 registros, todos con parent_id vacío, y no tiene encabezado order. Zona IX contiene 26 locales, entre ellos Lima y Callao. La tabla original no proporciona un campo institucional que formalice la precedencia física.

Se incorpora compatibilidad para consumir locales.order con estas reglas:

- Entero positivo.
- Único dentro del grupo (sede_id, parent_id).
- Valores no correlativos permitidos.
- Orden de presentación en recorrido del árbol físico: padres y después hijos, con hermanos ordenados por order.
- parent_id debe apuntar a un local existente de la misma sede y no puede formar ciclos.
- No hay desempate alfabético para ocultar órdenes duplicados o ausentes.

**Transición:** mientras no todos los locales tengan un valor order no vacío, el código conserva el orden recibido para no bloquear la aplicación, emite un diagnóstico de que la migración está pendiente y no interpreta ese orden de filas como una regla permanente. Esto incluye que el encabezado exista pero sus celdas sigan vacías, o que solo algunos locales tengan valor. Solo cuando todos los locales tengan un valor se activa el orden explícito; entonces cada valor debe ser un entero positivo y los duplicados entre hermanos detienen la validación.

La futura modificación de Sheets consiste en añadir una columna order al final de locales, después de active, y asignar un valor a los 190 locales. La precedencia Lima antes que Callao debe quedar expresada allí con valores distintos. Los valores institucionales concretos deben ser proporcionados o aprobados por el responsable de los datos; no se deducen de la posición actual de las filas. No se modifican estructura_local, estructura_org.order ni asignaciones.order.

### 15.4. Orden de la tabla

Las asignaciones se presentan agrupadas por sede, después por orden físico de Local y, dentro del local, por ruta orgánica real. asignaciones.order conserva su función dentro de la adscripción correspondiente. La ubicación efectiva continúa resolviéndose por estructura_local_id y/o local_id; no se infiere desde el padre orgánico.

### 15.5. Integridad pendiente separada

Las dos relaciones cruzadas detectadas en estructura_local (Sala Cuarta–Trujillo y Sala Quinta–Arequipa) no se corrigen con este cambio. La resolución de asignaciones continúa exigiendo coherencia de sede y esas relaciones permanecen como anomalías independientes para evaluación administrativa.

### 15.6. Rendimiento

El selector Local consume la respuesta existente de getDirectorySiteData(). No se añade una llamada al servidor por cambio de filtro ni se hidratan páginas adicionales. Se conservan los registros autorizados completos, la paginación, las cachés y las comprobaciones de Core.

La medición de Zona IX del 25 de noviembre que registró 1.852 asignaciones, dos páginas y 8.833 ms de solicitud del servidor es una referencia de rendimiento anterior a esta corrección. No debe atribuirse a la interfaz Local ni considerarse una medición de la nueva implementación.

### 15.7. Validación funcional

La aceptación debe verificar conjuntamente el backend, records, catalogs.locales, catalogs.estructuraOrg, filterContract, el índice cliente, las opciones renderizadas y la tabla. Como mínimo: Lima, Callao, Huacho/Cañete/Huaral/Barranca, locales sin estructura, asignaciones local_id solamente, estructuras con varias relaciones físicas, estructura con ubicación directa distinta de la raíz, ámbitos TOTAL/SEDE/LOCAL/ESTRUCTURA_ORG, orden no correlativo y rechazos de orden ausente/duplicado cuando la columna esté habilitada.


---

## 16. Punto de entrada de los selectores según el ámbito de acceso

La cadena de filtros no debe obligar al usuario a elegir niveles que son ancestros de su permiso. Los selectores empiezan en el primer nivel descendiente que corresponde al ámbito concedido.

| Ámbito concedido | Selector Sede | Selector Local | Inicio de la cascada orgánica |
|---|---|---|---|
| TOTAL | Visible; elección explícita | Visible después de elegir Sede | Raíces orgánicas del Local elegido |
| SEDE | Oculto cuando la sede está determinada | Visible | Raíces orgánicas del Local elegido |
| LOCAL, una referencia | Oculto cuando la sede está determinada | Oculto; Local fijado por el permiso | Raíces orgánicas de ese Local |
| LOCAL, varias referencias de la misma sede | Oculto cuando la sede está determinada | Visible solo con los locales autorizados que tengan registros | Raíces orgánicas del Local elegido |
| ESTRUCTURA_ORG | Oculto cuando la sede está determinada | Oculto | Hijos directos de la estructura autorizada, si incluye descendientes |

Una autorización ESTRUCTURA_ORG sobre Oficina de Comunicaciones, por ejemplo, no debe mostrar Sede ni Local para llegar a esa oficina. Si el ámbito permite descendientes, el primer selector orgánico presenta únicamente sus hijos directos. Las siguientes selecciones avanzan un nivel cada vez. Si el ámbito no permite descendientes, no se ofrece una cascada de unidades hijas.

Para TOTAL y SEDE, Local sigue siendo un filtro de exploración porque esos ámbitos cubren todos los locales de la sede seleccionada. Para LOCAL, una referencia fija no se presenta como una pregunta al usuario; con varias referencias, el selector se limita a esas referencias y nunca al catálogo completo. Para ESTRUCTURA_ORG, no se exige una ubicación física para navegar la estructura concedida.

La tabla continúa mostrando todos los registros ya autorizados cuando no se ha seleccionado un filtro opcional. La cascada solo reduce ese conjunto. La respuesta del servidor y la autorización central siguen siendo la autoridad: ocultar o mostrar un selector no concede permisos.

La implementación resuelve esta política mediante un plan de entrada derivado de filterContract.scopes, referenceId e includeDescendants. El plan distingue modo de selección Local y modo de navegación jerárquica; el modo de ámbito ESTRUCTURA_ORG calcula sus nodos navegables desde las rutas orgánicas autorizadas y no requiere localFilter.value.
