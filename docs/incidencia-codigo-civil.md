# Búsqueda del Código Civil — 29-09-2026

Se reprodujo la búsqueda `codigo civil` desde la portada del piloto. La API y el navegador devolvieron diez candidatos de metadatos, incluido el texto refundido del Código Civil, DFL 1 de 2000, `idNorma:172986`. La identificación se contrastó con la [ficha oficial de BCN](https://www.bcn.cl/leychile/navegar?idNorma=172986). No se descargó XML durante la reproducción del listado.

La página mostraba primero «No encontramos normas que coincidan con tu búsqueda», aunque esa ausencia correspondía únicamente a publicaciones locales. Los candidatos externos aparecían debajo. En las observaciones del intento reportado, discovery respondió HTTP 200 a las 18:57:13 UTC; la posterior selección de `1054426` —el decreto que aprueba el texto oficial, primer candidato alfabético— recibió HTTP 429 al intentar recuperar XML, con una espera compartida de cinco minutos. Son dos problemas distintos: presentación confusa y rechazo temporal del proveedor.

La corrección aclara que no hay publicaciones **locales**, muestra el número de candidatos disponibles y conserva un enlace oficial derivado del identificador cuando falla la recuperación. La ficha explica la espera aproximada y que la indisponibilidad no acredita inexistencia. Si el plazo indicado por la fuente supera la ventana de sondeo, la interfaz deja de comprobar y ofrece reintentar, sin mostrar después un falso mensaje de petición atascada.

Se añadieron escenarios de navegador con y sin tilde, carga remota diferida sin publicaciones locales, y respuestas `rate-limit`/`source_backoff` de cinco minutos. Comprueban que no se descarga XML al listar, que el enlace oficial sigue disponible y que no se programa un reintento automático fuera del límite de sondeo. La prueba determinista utiliza un candidato sintético; la comprobación real usa los metadatos ya cacheados del piloto.

Validación: build de producción con TypeScript y ESLint aprobados; los 13 escenarios de `tests/e2e/discovery.spec.ts` pasaron. La reproducción final desde la portada obtuvo HTTP 200, diez candidatos visibles y ningún error JavaScript.

No se añadieron alias, no se cambió la ordenación de candidatos ni se atribuyó vigencia a los candidatos. Las capturas siguen sujetas a revisión editorial y a la política de publicación existente. El nombre «Código Civil» también encuentra textos históricos y normas relacionadas: la lista no constituye un único texto consolidado seleccionado automáticamente.
