# Visor jurídico avanzado

El visor de `/normas/[slug]` y sus versiones históricas comparte un lector renderizado en servidor. Las herramientas trabajan sobre la publicación seleccionada; las propuestas pendientes continúan utilizando su ficha limitada. No se añaden migraciones ni contratos REST. La lectura documental existente utiliza un mapa de padres para evitar búsquedas cuadráticas al reconstruir una jerarquía grande; conserva el mismo resultado y las comprobaciones de visibilidad.

## Componentes y lectura

- `LegalDocument`: cabecera, texto completo, jerarquía del modelo y procedencia. Los párrafos no tienen componentes cliente individuales. Conserva las claves estables y el texto de todos los tipos de nodo existentes.
- `ReaderController`: preferencias, navegación de versiones, un observador compartido de encabezados y delegación de acciones. Recibe índices con etiquetas, sin una segunda copia JSON del texto jurídico.
- `TableOfContents`: listas anidadas, ramas plegables, ubicación activa y expansión de la ruta del artículo seleccionado. Las referencias huérfanas o cíclicas se conservan como raíces reparadas para la presentación. Plegar el índice no oculta el texto.
- `InDocumentSearch`: búsqueda sobre el DOM publicado, sin solicitudes de red. Ignora mayúsculas y tildes y conserva los offsets del original, incluidos caracteres combinantes. El procesamiento se divide en bloques y se cancela si cambia la consulta. Usa `scheduler.yield` cuando está disponible, con alternativa basada en temporizadores. No intercepta Ctrl/Cmd+F.
- `ContextPanel`: relaciones, cambios y datos personales cargados al solicitarlos mediante funciones internas de servidor. Las funciones validan nuevamente la visibilidad y la identidad de la versión/nodo mediante consultas de identificadores, sin volver a cargar todo el texto jurídico para abrir notas o relaciones. Las notas sólo se consultan para el usuario autenticado.

El texto usa Georgia y una longitud de línea limitada; la interfaz usa Geist. El tamaño (16/18/20/22 px) y el tema (sistema/claro/oscuro) se conservan en cookies sin datos personales. El tema se limita al visor y sus páginas de historial/comparación.

Desde 1024 px se muestran el índice editorial (240 px) y el documento (hasta 800 px), sin panel derecho permanente. Fuente, relaciones, notas y cambios se abren en un drawer temporal que no modifica el ancho del documento. Por debajo de 1024 px, la barra inferior ofrece Índice, Buscar y Más, y el panel adopta forma de sheet. Un único diálogo nativo contiene el foco, se cierra con Escape y devuelve el foco al control de origen. Cada artículo expone sólo el botón ⋯; sus acciones se resuelven por delegación y un menú compartido, sin hidratar cada artículo. Aa agrupa las preferencias; Más incluye versión, historial y herramientas.

El documento mantiene el texto servido por el servidor, selección nativa y Ctrl/Cmd+F. En navegadores compatibles, `content-visibility: auto` difiere el cálculo visual de artículos fuera de pantalla; no elimina ni virtualiza nodos del DOM. La impresión desactiva esa optimización. La identidad usa azul `#173f6b`, naranja `#d37d42` y superficies cálidas; el modo oscuro conserva la misma familia visual.

Los resaltados usan CSS Custom Highlight cuando está disponible: se cuentan todas las coincidencias y un observador compartido pinta las cercanas al área visible para evitar el coste de resaltar miles de rangos fuera de pantalla. El documento permanece completo en el DOM. El borde del bloque activo y el fragmento marcado del buscador permiten localizar coincidencias también sin esa API. Las reglas `::highlight` se sirven como una etiqueta de estilo estática porque el analizador CSS incluido en esta versión de Turbopack no reconoce aún ese selector; no se modificó la infraestructura de compilación.

## Identidades y límites editoriales

Las URLs existentes permanecen estables:

- Norma: `/normas/[slug]`.
- Versión: `/normas/[slug]/versiones/[versionId]`.
- Artículo: fragmento `#[stableKey]` en cualquiera de las anteriores.
- Historial: `/normas/[slug]/versiones`.
- Comparación: `/normas/[slug]/comparar?desde=...&hasta=...`, con `#cambio-[stableKey]` para cada diferencia.
- Procedencia: `#fuente`.

Copiar texto incluye el nodo, sus descendientes, la norma, la versión consultada y su enlace fijado. Copiar enlace y compartir también fijan la versión. Los controles y notas privadas quedan fuera de la copia. Compartir usa la función nativa del navegador o copia el enlace.

Guardar abre el espacio privado del artículo y muestra su estado real antes de alternar el favorito. Se reutilizan las acciones existentes para favoritos, creación y eliminación de notas. Los borradores se mantienen sólo en memoria mientras se cambia de artículo; una respuesta de guardado no borra texto nuevo escrito durante esa espera; no se guardan en cookies ni almacenamiento del navegador. El inicio de sesión conserva versión y fragmento.

La capa `presentation.ts` obtiene etiquetas públicas a partir de fechas y del indicador de versión de consulta, nunca de `versionLabel`. No equipara `isCurrent` a vigencia jurídica. La búsqueda obtiene `stableKey` de `norm_nodes` mediante `nodeId`, sin duplicarlo en la proyección ni añadir migraciones. Las páginas de cuenta enlazan a la norma, versión y artículo originales y conservan notas/favoritos privados si una publicación se retira.

El selector, accesible en Más, carga resúmenes de versiones publicadas y permitidas por la política de fuente. La comparación carga únicamente las dos versiones seleccionadas y reutiliza `compareVersions`. Mostrar cambios está desactivado inicialmente. Las diferencias son textuales: no se interpretan como modificaciones jurídicas verificadas. Los nodos eliminados aparecen en el contexto/comparador, nunca insertados en el texto de la versión actual.

Las relaciones se filtran mediante las comprobaciones públicas existentes: estado verificado, evidencia permitida y ambos extremos públicos. Se conserva dirección, evidencia y versión/nodo del destino; se excluyen relaciones específicas de otra versión del documento consultado. Las relaciones generales de la norma se presentan separadas de las del artículo.

La última comprobación procede exclusivamente de observaciones satisfactorias (`resolve`, `upstream`, `captured`/`not_modified`, HTTP 200/304) vinculadas al documento fuente exacto. Se distingue de captura, fecha declarada de versión y publicación. `updatedAt` editorial no se presenta como una modificación jurídica.

## Verificación reproducible del primer hito

Con PostgreSQL local migrado y las variables del piloto cargadas, ejecutar:

```sh
npm test
npm run lint
npm run build
PLAYWRIGHT_USE_BUILD=1 npm run test:e2e -- --workers=1
```

Ejecutar estas suites de forma secuencial en equipos con recursos limitados. La batería unitaria/PostgreSQL pasó con 141 pruebas, y ESLint terminó sin errores. La batería de Chromium pasó con 31 pruebas y una omisión prevista: el estado de instancia sin PostgreSQL no corresponde al piloto conectado. Una primera ejecución concurrente con otras suites tuvo timeouts; la ejecución secuencial conservó los límites de tiempo originales.

Las pruebas cubren jerarquía, Unicode, cancelación, preservación del texto, versiones y permisos; consultas de notas por usuario y versión; rechazo de propuestas por UUID; revocación de permisos de fuente; procedencia; búsqueda sin red; portapapeles; cookies de lectura; móvil y teclado; borradores privados, notas y favoritos; cambios y artículos ausentes; lectura sin JavaScript.

Tras los ajustes finales, las nueve pruebas E2E del visor se repitieron sobre la compilación de producción y pasaron. Incluyen conservar un borrador nuevo mientras termina el guardado de la nota anterior; la comprobación de búsqueda sin red distingue las precargas de enlaces de Next.js.

La prueba de carga usa exclusivamente una norma sintética temporal con 3000 artículos, 10000 nodos y aproximadamente dos millones de caracteres. No captura normas externas ni cambia políticas editoriales. Requiere PostgreSQL en localhost y el servidor de producción en `127.0.0.1:3000`:

```sh
READER_BENCHMARK=1 node --import tsx scripts/benchmark-reader.ts
```

El script elimina su propia norma al terminar y escribe métricas sin contenido jurídico en `.staging/reader/benchmark.json` (ignorado por Git). Las capturas visuales y los datos de sesión utilizados en pruebas también quedan fuera del repositorio.

## Resultado de validación · 30 de septiembre de 2026

La compilación de producción pasó con Next.js 16.3.5. La prueba extrema se ejecutó en Chromium 153.0.8010.12, Node 24.19.0, Intel Core i5-4260U a 1,40 GHz (cuatro procesadores lógicos), con PostgreSQL y navegador locales. Es una medición de este equipo, no una garantía para otros dispositivos.

| Medida | Resultado |
|---|---:|
| Artículos / nodos | 3000 / 10000 |
| Caracteres jurídicos sintéticos | 2.003.000 |
| Coincidencias | 3000 |
| Entrada de búsqueda → contador visible, incluido debounce | 817 ms |
| Tiempo posterior al debounce de 180 ms | 637 ms |
| Motor aislado en navegador | 177 ms |
| Mayor bloque cooperativo del motor | 8,3 ms |
| Mayor tarea global observada del navegador | 80 ms |
| Navegación inicial del caso extremo | 18,1 s |
| Preparado con buscador abierto | 21,0 s |

Pasó el salto a la última coincidencia y su artículo. El umbral automático del script exige menos de un segundo después del debounce y bloques de procesamiento de hasta 50 ms. El tiempo del controlador Playwright incluye comunicación e inspección del DOM y se registra aparte. Los bloques del motor cumplen 50 ms, aunque el navegador registró una tarea global de 80 ms; no se afirma ausencia total de tareas largas.

**Límite conocido:** mantener 10.000 nodos completos genera más de 114.000 elementos DOM y una carga inicial costosa en este equipo. El renderizado diferido reduce el trabajo de diseño durante la lectura y la búsqueda, pero no elimina el coste inicial de servir y construir el documento. No se introdujo paginación ni virtualización del texto jurídico.

Se inspeccionaron vistas claras y oscuras en escritorio y móvil. Los contrastes de los tokens principales medidos oscilan entre 5,77:1 y 13,02:1. Las pruebas de reflujo usan 640 y 320 px con texto de 22 px; esto no sustituye una auditoría completa con lectores de pantalla ni pruebas en todos los navegadores.


## Rediseño controlado · 1 de octubre de 2026

Este hito cambia la presentación y organización del visor, las etiquetas públicas de versiones, los contextos de cuenta y el enlace de resultados por artículo. No modifica el motor de búsqueda interna, compareVersions, fuentes BCN, autenticación, ingesta ni política editorial.

La cronología muestra sólo las fechas disponibles. El comparador presenta textos anterior/posterior y conteos sin cards; un diff dentro de cada párrafo se reserva para otro hito, conservando el algoritmo actual.

No hay migraciones nuevas: el enlace de búsqueda obtiene la clave estable mediante el `nodeId` existente. Las consultas adicionales de cuenta conservan el filtro por propietario y ocultan el contexto jurídico de publicaciones retiradas, sin eliminar las notas o favoritos del usuario.

### Validación final

Las ejecuciones fueron secuenciales, con un trabajador para las pruebas, sobre PostgreSQL local y el build de producción:

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Sin errores |
| `npm test -- --maxWorkers=1` | 143 pruebas aprobadas, 26 archivos |
| `npm run db:migrate` / `npm run db:check` | Migraciones existentes aplicadas y conexión comprobada |
| `npm run test:integration -- --maxWorkers=1` | 31 pruebas aprobadas, 7 archivos |
| `npm run build` | Compilación y TypeScript aprobados |
| `PLAYWRIGHT_USE_BUILD=1 npm run test:e2e -- --workers=1` | 33 aprobadas y una omisión prevista: instancia sin PostgreSQL, incompatible con este piloto conectado |

Se conservaron las pruebas previas. Las nuevas comprobaciones cubren `label != stableKey`, etiquetas técnicas deliberadas que no deben aparecer, contexto privado por usuario, retirada de publicaciones, menús por teclado y devolución de foco, temas claro/oscuro/sistema, movimiento reducido, hash activo y lectura sin JavaScript. El reflujo se comprobó a 320 y 640 px y con texto de 22 px; se añadió una comprobación con CSS `zoom: 2`. Esta última aproxima el aumento visual del 200 %, pero no equivale a certificar el zoom nativo de todos los navegadores ni sustituye una auditoría con lectores de pantalla.

Se inspeccionaron las capturas de escritorio a 1920, 1440 y 1366 px, tablet a 768 px y vistas a 640 y 320 px. Incluyen versión actual e histórica, historial, comparación, búsqueda, índice, fuente, notas, favorito y menú de artículo. En escritorio el índice acompaña al documento y el contexto aparece como drawer temporal; en móvil se conserva la barra Índice/Buscar/Más y los controles se abren en una hoja inferior. Los artefactos están en `.staging/reader-redesign/`, fuera del historial Git.

### Rendimiento del rediseño

El mismo caso sintético mantiene 3000 artículos, 10000 nodos y 2.003.000 caracteres; verifica las 3000 coincidencias y el salto a la última. No se cambió el motor ni se elevaron sus umbrales. Primera medición posterior al rediseño:

| Medida | Primer hito | Rediseño |
|---|---:|---:|
| Búsqueda hasta contador visible, incluido debounce | 817 ms | 673 ms |
| Tiempo posterior al debounce de 180 ms | 637 ms | 493 ms |
| Motor aislado | 177 ms | 193 ms |
| Mayor bloque cooperativo | 8,3 ms | 8,1 ms |
| Mayor tarea global observada | 80 ms | 273 ms |
| Elementos DOM | 114.152 | 99.098 |
| Navegación inicial | 18,1 s | 25,5 s |
| Preparado con buscador abierto | 21,0 s | 36,3 s |

La búsqueda pasó los límites de menos de un segundo después del debounce y bloques de hasta 50 ms. Hay menos elementos DOM, pero la carga inicial medida fue más lenta y hubo tareas globales largas. Son muestras del mismo equipo bajo carga variable, no una comparación controlada que permita atribuir la diferencia al rediseño. No se afirma una mejora global de rendimiento: la carga inicial del documento extremo sigue siendo una limitación. Se conservan los JSON anteriores y posteriores en `.staging/reader-redesign/`.

Una repetición se interrumpió al cerrarse el navegador y terminar el servidor local (salida 143), sin medición válida. Tras restablecer el servidor, la repetición completa pasó: navegación de 17,2 s, buscador preparado a los 30,0 s, búsqueda visible en 771 ms (591 ms después del debounce), motor aislado de 823 ms y bloque máximo de 45,3 ms. La tarea global máxima fue de 274 ms. La navegación quedó por debajo de la referencia anterior, pero la disponibilidad del buscador tardó más en ambas muestras del rediseño. Esto queda como limitación de rendimiento pendiente de una comparación controlada; el benchmark no impone un umbral de carga inicial y su aprobación no descarta esa posible regresión. Resultado conservado en `benchmark-repeat.json`.

### Archivos del rediseño

- `docs/visor-juridico-avanzado.md`
- `scripts/benchmark-reader.ts`
- `src/app/cuenta/favoritos/page.tsx`
- `src/app/cuenta/notas/page.tsx`
- `src/app/globals.css`
- `src/app/normas/[slug]/comparar/page.tsx`
- `src/app/normas/[slug]/versiones/page.tsx`
- `src/components/reader/context-panel.tsx`
- `src/components/reader/legal-document.tsx`
- `src/components/reader/reader-controller.tsx`
- `src/components/reader/reader.css`
- `src/components/reader/table-of-contents.tsx`
- `src/db/repositories/search.ts`
- `src/db/repositories/users.ts`
- `src/lib/reader/data.ts`
- `src/lib/reader/presentation.ts`
- `tests/e2e/public-reading.spec.ts`
- `tests/e2e/reader.spec.ts`
- `tests/integration/public-reading.test.ts`
- `tests/unit/reader.test.ts`
