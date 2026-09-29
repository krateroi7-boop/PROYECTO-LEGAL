# Piloto funcional BCN — 29 de septiembre de 2026

Piloto local sobre el segundo hito (`8e6187e`, `7c878a0`). Se activó `BCN_DISCOVERY_ENABLED=true` únicamente en `.env.pilot.local`, ignorado por Git. PostgreSQL 16 y Next.js se ejecutaron localmente; el servidor web escucha en `127.0.0.1:3000`. No se habilitó la publicación del XML BCN ni se incorporaron fuentes o infraestructura nuevas.

## Qué representa este entorno

Las publicaciones `ley-19880`, `ley-20285` y `ley-19628` son el corpus de demostración existente. Las capturas reales de BCN son propuestas distintas (`bcn-210676`, `bcn-276363`), sin publicación autorizada. No se asignaron identidades oficiales a los ejemplos por similitud de título o número.

Por eso una búsqueda temática puede mostrar un ejemplo publicado y un candidato oficial semejante. Sólo una identidad externa verificada permite deduplicarlos. El caso de identidad verificada se comprueba mediante una respuesta controlada en navegador y datos sintéticos aislados en PostgreSQL, sin alterar las identidades del piloto.

## Resultado por búsqueda

| Consulta | Publicación local y lectura | Discovery real adicional | Resolución y repetición |
| --- | --- | --- | --- |
| Ley 19.880 | Visible en 750 ms; abre directamente el visor de `ley-19880` | Candidato `210676`, título completo, tipo, fecha y organismo. Repetición: `hit` | Captura v2 pendiente; revalidación posterior HTTP 304 y repetición `hit`; solicitud registrada |
| Ley 20.285 | Visible en 527 ms; abre directamente `ley-20285` | Candidato `276363`, metadatos completos. Repetición: `hit` | Tras HTTP 429 y espera, captura v2 pendiente; repetición `hit`; solicitud registrada |
| Ley de transparencia | Visible en 926 ms; Ley 20.285 primero, apertura directa en su visor | Dos intentos separados de la consulta adicional de API agotaron ocho segundos; no se consiguió un candidato remoto nuevo para esta clave de alias | El flujo local funciona. La norma oficial `276363` quedó comprobada en el caso anterior; no se presenta el discovery del alias como exitoso |
| procedimiento administrativo | Visible en 764 ms; publicaciones locales accesibles mientras carga el bloque remoto | Consulta inicial exitosa: candidato `210676`. Al vencer su TTL, actualización con timeout y reutilización de metadatos `stale`, debidamente señalados; repetición también `stale` | Selección real del enlace del candidato → ficha pendiente; resolución `hit`; solicitud repetida sin duplicación |

Son tiempos de una ejecución local con carga de herramientas, no una medición de rendimiento en producción. Las búsquedas exactas con publicación disponible no solicitan automáticamente discovery: sus llamadas adicionales de API se hicieron expresamente para comprobar el conector. La búsqueda temática sí usa el bloque remoto independiente.

En el recorrido corregido, listar resultados y candidatos no produjo llamadas XML. Las recuperaciones/revalidaciones XML se hicieron por selección o referencia explícita. No se repitieron indefinidamente las consultas fallidas para obtener artificialmente una muestra satisfactoria.

## Flujo visible y correcciones

La entrada humana es **Buscar en Legisdata**. `/consultar` sin referencia y `/consultar?q=...` llevan a ese mismo buscador. Una publicación abre directamente `/normas/...`; un candidato externo abre una ficha en `/consultar?referencia=idNorma:...`, conserva el enlace a los resultados y presenta a BCN como procedencia.

Se corrigieron problemas observados en el recorrido:

- La búsqueda exacta mostraba una publicación de demostración y además una ficha pendiente de otra identidad BCN. Ahora la revalidación automática requiere una identidad externa comprobada; su estado se muestra de forma compacta.
- El formulario separado de consulta daba la sensación de otro buscador. Se unificó la entrada y se mantuvo el contrato técnico de `referencia`.
- El XML real usa `TituloNorma`; el parser sólo consultaba `Titulo`. También aparecían entidades numéricas sin decodificar en los organismos. El parser `bcn-leychile-xml-v2` reconoce ambos campos y conserva acentos. Se mantiene la evidencia y las representaciones de la versión anterior.
- Al cambiar de búsqueda se reinicia el bloque remoto, evitando presentar candidatos de la consulta anterior.
- En móvil, las etiquetas de materias se distribuyen en varias líneas dentro de su tarjeta.

Un cambio de parser genera una representación y propuesta nuevas cuando se recupera la norma; no modifica la publicación ni sustituye silenciosamente los datos editoriales anteriores. Sus claves de caché son distintas: una captura v1 no es un hit de v2.

## Incidencias reales

Se observaron dos respuestas HTTP 429 del servicio XML, con `Retry-After: 300`. Se respetó el presupuesto compartido y la espera. No se interpretaron como ausencia de norma. Los reintentos posteriores de las leyes 19.880 y 20.285 recuperaron XML válido y conservaron el estado `pending_review`.

Durante el primer intento v2 de la Ley 20.285, la ficha informó indisponibilidad temporal: el original anterior seguía almacenado, pero su caché pertenecía al parser v1. La publicación de demostración seguía accesible. Esta distinción importa al actualizar el parser.

La prueba de navegador para deduplicación inicialmente esperaba que la Ley 20.285 no estuviese entre los resultados locales de la búsqueda temática. PostgreSQL sí la encontró y el componente la deduplicó correctamente. Se corrigió el dato de prueba para usar otra publicación que no aparecía en esos resultados.

Además hubo tres timeouts SPARQL reales: dos en la consulta adicional del alias y uno al actualizar la materia. Cada uno duró aproximadamente ocho segundos. El presupuesto compartido impuso espera y los metadatos temáticos anteriores siguieron disponibles dentro de su ventana de uso desactualizado. No se almacenaron esos errores como resultados vacíos.

## Llamadas externas y caché

Corte de observaciones BCN: **29-09-2026, 03:12:43–18:49:27 UTC**. Incluye diagnóstico inicial, reanudación del piloto y comprobaciones CLI/API; excluye las observaciones anteriores al inicio y las fuentes sintéticas de las pruebas.

| Operación | Llamadas reales | Resultado |
| --- | ---: | --- |
| XML `resolve` | 5 | Dos HTTP 200, un HTTP 304, dos HTTP 429 |
| SPARQL `metadata` | 4 | Dos HTTP 200, dos timeouts |
| SPARQL `discover` | 2 | Un HTTP 200, un timeout |
| **Total** | **11** | Cinco HTTP 200, un HTTP 304, dos HTTP 429 y tres timeouts SPARQL |

| Operación | Hits | Misses | Hit / (hit + miss) | Usos desactualizados | Negativos |
| --- | ---: | ---: | ---: | ---: | ---: |
| `resolve` | 4 | 5 | 44,4 % | 3 | 0 |
| `metadata` | 8 | 4 | 66,7 % | 0 | 0 |
| `discover` | 0 | 2 | 0 % | 8 | 0 |

Los usos desactualizados se informan aparte; no cuentan como hit. La lectura inicial de una ficha mediante `readSourceResolution` no emite un evento de caché, por lo que estos contadores corresponden a los servicios instrumentados, no a cada renderizado. Latencias HTTP exitosas XML: 353–2168 ms; SPARQL: 285–6716 ms. Los tres timeouts duraron 8011–8027 ms. Se contabilizaron seis selecciones válidas de eventos de discovery distintos, sin duplicar la selección del mismo evento.

El detalle agregado y los eventos HTTP, sin contenido jurídico ni datos personales, están en [metrics.json](piloto-bcn-2026-09-29/metrics.json).

## Editorial, privacidad y evidencia visual

Las dos representaciones v2 y las dos v1 anteriores siguen `pending_review`. No hay autorización de publicación para BCN. El usuario local del piloto tiene **dos solicitudes únicas**, ambas pendientes; volver a solicitar la misma propuesta no creó una tercera.

Las ocho rutas públicas de las dos normas pendientes —web y API, norma y versión por UUID— devolvieron **404**. Se comprobó además que el HTML de las fichas no contiene una muestra del texto pendiente. La ficha entrega metadatos, estado, enlace oficial y la acción autenticada de solicitud.

Se inspeccionaron las capturas de escritorio y móvil. La prueba de fallo simulado mantuvo los resultados locales y permitió abrir el visor, sin solicitudes de resolución XML.

- [Búsqueda exacta](piloto-bcn-2026-09-29/search-19880.png).
- [Alias de transparencia](piloto-bcn-2026-09-29/search-alias.png).
- [Materia, publicaciones y candidato conservado](piloto-bcn-2026-09-29/search-materia.png).
- [Ficha pendiente sin texto](piloto-bcn-2026-09-29/pending-20285.png).
- [Resultados locales con BCN indisponible — simulación](piloto-bcn-2026-09-29/outage.png).
- [Mis solicitudes de revisión](piloto-bcn-2026-09-29/reviews.png).
- [Búsqueda móvil con etiquetas contenidas](piloto-bcn-2026-09-29/mobile-search.png).

## Validación y conservación del trabajo

- 133 pruebas unitarias/de integración aprobadas sobre PostgreSQL aislado.
- Suite de producción Chromium: 18 aprobadas, una omitida porque requiere ejecutar sin PostgreSQL. Incluye identidad verificada, selección entre candidatos, Auth.js, solicitud editorial, caída remota y navegación unificada.
- Build de producción, TypeScript y ESLint aprobados.
- Tras el último ajuste CSS se reconstruyó producción y se comprobó en Chromium móvil que las etiquetas quedan dentro de su tarjeta, sin desbordamiento horizontal.
- La comprobación viva usa consultas pequeñas y está separada de CI; los E2E versionados interceptan la red externa para ser deterministas.
- Se conserva el primer y segundo hito. Los cambios del piloto se agrupan en una corrección del parser con su contrato, y otra del recorrido de búsqueda con pruebas y documentación. `.env.pilot.local`, `.staging`, sesiones de prueba, originales de `.storage` y archivos de build quedan fuera de Git.

## Límites de la comprobación

Las sesiones de prueba se crearon en las tablas reales de Auth.js, con un usuario local sin correo. Se comprobaron autenticación en servidor, acción de solicitud, unicidad y consulta del estado. No se verificó el inicio de sesión contra un proveedor OIDC externo, porque no está configurado en este entorno.

Las pruebas deterministas de caída y timeout se distinguen de los HTTP 429 observados en vivo. Estas muestras no certifican disponibilidad, exhaustividad o vigencia jurídica de BCN. No se publicó texto pendiente ni se descargó masivamente legislación.
