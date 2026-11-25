# Modelo de datos y filtros jerárquicos de Información de personal

**Propósito:** conservar el modelo real de las hojas, las relaciones que alimentan la interfaz y el estado de la investigación del filtro jerárquico. Este documento es el punto de continuidad para los siguientes chats. No debe reiniciarse el análisis ni deducirse la estructura por los nombres de las unidades.

**Fecha de referencia de los datos compartidos:** 24 de noviembre de 2026  
**Rama examinada:** `feat/directorio-personas-datos-asignaciones`  
**HEAD examinado:** `8522c7654ecb7ca1ba20745f03ef5fe9a5ea768f`  
**Estado de CI en ese HEAD:** 272/272 pruebas aprobadas en GitHub Actions (push #1464 y PR #1465).  
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

**Importante sobre el extracto compartido:** el fragmento de `asignaciones` contiene 45 filas. Allí se ven asignaciones para Gerencia General, Integridad Institucional y Trámite Documentario; no aparece una asignación directa a `EL_SC_UF_GESTION_DOCUMENTAL` ni a `EL_SC_ARCHIVO_CENTRAL`. El extracto puede no ser la hoja completa. Por tanto, no se debe concluir que Archivo Central carezca de asignaciones en los datos completos. Antes de exigir que aparezca como opción, comprobar si existe una asignación autorizada que resuelva a `SC_ARCHIVO_CENTRAL`.

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

La prueba de Archivo Central debe contrastarse con la hoja completa de `asignaciones`: el extracto de 45 filas compartido no contiene una asignación visible a `EL_SC_ARCHIVO_CENTRAL`.

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
