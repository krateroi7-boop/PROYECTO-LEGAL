# Visor jurídico avanzado

El visor de `/normas/[slug]` y sus versiones históricas comparte un lector renderizado en servidor. Las herramientas trabajan sobre la publicación seleccionada; las propuestas pendientes continúan utilizando su ficha limitada. No se añaden migraciones ni contratos REST. La lectura documental existente utiliza un mapa de padres para evitar búsquedas cuadráticas al reconstruir una jerarquía grande; conserva el mismo resultado y las comprobaciones de visibilidad.

## Componentes y lectura

- `LegalDocument`: cabecera, texto completo, jerarquía del modelo y procedencia. Los párrafos no tienen componentes cliente individuales. Conserva las claves estables y el texto de todos los tipos de nodo existentes.
- `ReaderController`: preferencias, navegación de versiones, un observador compartido de encabezados y delegación de acciones. Recibe índices con etiquetas, sin una segunda copia JSON del texto jurídico.
- `TableOfContents`: listas anidadas, ramas plegables, ubicación activa y expansión de la ruta del artículo seleccionado. Las referencias huérfanas o cíclicas se conservan como raíces reparadas para la presentación. Plegar el índice no oculta el texto.
- `InDocumentSearch`: búsqueda sobre el DOM publicado, sin solicitudes de red. Ignora mayúsculas y tildes y conserva los offsets del original, incluidos caracteres combinantes. El procesamiento se divide en bloques y se cancela si cambia la consulta. Usa `scheduler.yield` cuando está disponible, con alternativa basada en temporizadores. No intercepta Ctrl/Cmd+F.
- `ContextPanel`: relaciones, cambios y datos personales cargados al solicitarlos mediante funciones internas de servidor. Las funciones validan nuevamente la visibilidad y la identidad de la versión/nodo mediante consultas de identificadores, sin volver a cargar todo el texto jurídico para abrir notas o relaciones. Las notas sólo se consultan para el usuario autenticado.

El texto usa Georgia y una longitud de línea limitada; la interfaz usa Geist. El tamaño (16/18/20/22 px) y el tema (sistema/claro/oscuro) se conservan en cookies sin datos personales. El tema se limita al visor y sus páginas de historial/comparación.

A partir de 1440 px se muestran índice, texto y contexto, manteniendo al menos 640 px de columna central. Entre 1024 y 1439 px, el contexto usa un diálogo. Por debajo de 1024 px, una barra inferior ofrece Índice, Buscar y Contexto; los paneles usan un solo diálogo nativo, con Escape, foco contenido y restauración del foco. El texto permanece legible sin JavaScript. En navegadores compatibles, `content-visibility: auto` difiere el cálculo visual de artículos fuera de pantalla; no elimina ni virtualiza nodos del DOM. Los enlaces y la búsqueda siguen accediendo al documento completo. La impresión desactiva esa optimización.

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

El selector carga resúmenes de versiones publicadas y permitidas por la política de fuente. La comparación carga únicamente las dos versiones seleccionadas y reutiliza `compareVersions`. Mostrar cambios está desactivado inicialmente. Las diferencias son textuales: no se interpretan como modificaciones jurídicas verificadas. Los nodos eliminados aparecen en el contexto/comparador, nunca insertados en el texto de la versión actual.

Las relaciones se filtran mediante las comprobaciones públicas existentes: estado verificado, evidencia permitida y ambos extremos públicos. Se conserva dirección, evidencia y versión/nodo del destino; se excluyen relaciones específicas de otra versión del documento consultado. Las relaciones generales de la norma se presentan separadas de las del artículo.

La última comprobación procede exclusivamente de observaciones satisfactorias (`resolve`, `upstream`, `captured`/`not_modified`, HTTP 200/304) vinculadas al documento fuente exacto. Se distingue de captura, fecha declarada de versión y publicación. `updatedAt` editorial no se presenta como una modificación jurídica.

## Verificación reproducible

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
