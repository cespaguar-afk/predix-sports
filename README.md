# Predix Sports · Primera versión funcional

PWA oscura de predicciones deportivas con datos abiertos, sin API keys y sin servidor propio. Proyecto **personal, no comercial**. Incluye LaLiga, LaLiga Hypermotion, Premier League, Bundesliga, Ligue 1, Champions League masculina, Copa del Rey, Supercopa de España, UEFA Nations League y NBA. La interfaz separa fútbol y NBA en secciones dedicadas.

## Ejecutar localmente

Requisitos: navegador moderno y Python 3 (o cualquier servidor estático HTTP). **No abras `index.html` desde `file://`** porque los módulos JavaScript y el Service Worker requieren HTTP/HTTPS.

```bash
cd predix-sports
python3 -m http.server 8080
```

Abre `http://localhost:8080` en el ordenador. En Windows, alternativamente `py -m http.server 8080`.

Para tests: `npm test` (Node.js 20+). Sin instalación de dependencias.

## Publicar gratis y usar en el móvil

1. Crea una cuenta en [GitHub](https://github.com/signup) si no tienes.
2. Crea un **repositorio público** llamado `predix-sports`. GitHub Pages gratuito para repositorios públicos; revisa los términos actuales.
3. Sube **el contenido** de esta carpeta a la raíz del repositorio (conservando `src/`, `assets/`, `index.html`, etc.). Puedes usar *Add file → Upload files*.
4. En el repositorio, entra a **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/(root)`; guarda.
5. Cuando GitHub Pages haya publicado, abre `https://TU_USUARIO.github.io/predix-sports/` en Chrome para Android.
6. Chrome: menú **⋮ → Añadir a pantalla de inicio → Instalar**. En algunos móviles la opción puede aparecer como *Instalar aplicación*.

**Privacidad realista:** el código y la web desplegada en GitHub Pages serán públicos, pero las predicciones guardadas, favoritos y caché se almacenan solo en el navegador local (sin usuarios ni nube). No es una web protegida con contraseña. No incluyas claves ni datos personales en archivos publicados.

## Cobertura

| Función | Estado |
|---|---|
| LaLiga, Hypermotion, Premier, Bundesliga, Ligue 1 y Champions | CSV públicos de open-matchday (espejo en feeds/) |
| Copa del Rey | Calendario ESPN guardado con prioridad, verificación de duplicados/conflictos y CSV de respaldo |
| Nations League y Supercopa de España | ESPN no oficial; instantáneas gratuitas cuando existan |
| NBA | ESPN por meses, copia histórica en feeds/nba.json y respaldo de calendario NBA CDN |
| Amarillas por equipo/partido | Media ponderada reciente y estimación Poisson si existen partidos suficientes |
| Jugadores con mayor riesgo de amonestación | Informes individuales ESPN archivados en feeds/player_cards.json; probabilidad experimental CONDICIONADA a que jueguen |
| Pronósticos fútbol 1X2, marcador, más de 2,5, ambos marcan | Poisson experimental |
| Córners, amarillas, faltas, remates | Estimaciones solo si hay suficientes valores no nulos |
| En directo | Marcador ESPN al pulsar actualizar (no hay pronóstico in-play) |
| Apuestas de valor | No implementado, no hay cuotas fiables y el usuario no quiere introducirlas |
| Aprendizaje | Brier + recalibración suave con historial local ya evaluado; no reentrena redes neuronales |
| Bajas, alineaciones, impacto de jugadores | No implementado: sin feed fiable y gratuito |
| Clasificado en eliminatorias | No implementado aún: requiere agregados y reglas verificadas |
| Instalación offline | La interfaz se abre offline una vez instalada; datos externos necesitan conexión o caché previo |

## Datos y metodología

Fútbol: [open-matchday](https://github.com/oladeeayo/open-matchday) (CSV 2026/27, edición diaria, no live). Su compilación permite uso personal informativo no comercial con atribución. No incluye cuotas, lesiones ni xG. Las horas están en una convención CET-1 fija (en verano puede diferir respecto al huso local) y se marcan como orientativas.

NBA, Nations League, Supercopa y amonestaciones por jugador: [ESPN scoreboard no oficial](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard), JSON sin clave. Es un endpoint **no documentado ni garantizado**; consultamos meses individuales y una copia pública para evitar CORS y HTTP 400 de intervalos largos; depende de CORS y puede dejar de funcionar. La UI muestra una advertencia y conserva datos previos si falla. [BoxScore Lab](https://www.boxscorelab.com/downloads/) ofrece descargas NBA gratuitas, pero no está conectado todavía.

Los modelos no están calibrados ni han superado validación externa; la etiqueta de confianza indica solo volumen de muestra. Las métricas de error se computan contra registros guardados antes del encuentro, no contra datos filtrados a posteriori. No hay ingresos por apuestas, banca, rentabilidad ni promesas de acierto.

**Actualización 2027/28:** en `src/data.js`, modifica `SEASON='2627'` cuando open-matchday publique la siguiente temporada y confirme sus rutas. Considera un adaptador automático en una futura versión.

## Archivos

- `index.html`: estructura de la interfaz
- `styles.css`: diseño responsive oscuro
- `src/data.js`: fuentes externas, parseo, normalización y reconciliación de calendarios de Copa del Rey
- `src/model.js`: modelos experimentales, Brier y calibración
- `src/storage.js`: historial local y favoritos
- `src/main.js`: interacciones, carga y visualización
- `manifest.webmanifest`, `sw.js`, `assets/`: PWA e iconos
- `tests/*.test.mjs`: pruebas sin dependencias, incluidas tarjetas, NBA y competiciones
- `scripts/sync_player_cards.py`: obtiene datos por jugador con apariciones y amarillas verificadas
- `.github/workflows/player-cards.yml`: sincroniza el histórico individual dos veces al día
- `.github/workflows/sync-feeds.yml`: copia calendarios/resultados, incluidas Bundesliga y Ligue 1, cada seis horas

## Limitaciones importantes

- Estimar probabilidades no garantiza fiabilidad; no representan una recomendación financiera.
- **Tarjetas de jugadores**: los porcentajes son heurísticos y condicionados a participar. Se calculan sólo con partidos finalizados que indican tanto aparición como amarillas verificables (mínimo cuatro apariciones en 85 días). No se conocen alineaciones futuras ni estado médico confirmado.
- **Tarjetas por equipo**: se calculan únicamente cuando la fuente tiene conteos de amarillas en suficientes partidos previos. No se inventan valores ante huecos de datos.
- La cobertura ESPN por jugador no está garantizada y puede variar mucho según la competición; algunas eliminatorias no tienen estadísticas individuales suficientes.
- Las predicciones guardadas se sellan solo para partidos posteriores al día de consulta; evita fuga de resultados del mismo día con horas inciertas.
- Al cambiar el proveedor, la localización de equipos y el código de partido podrían cambiar, impidiendo calificar históricos; no atribuye datos inciertos.
- Guardar en `localStorage` no aporta sincronización ni protección criptográfica.
- No hay actualizaciones automáticas ni procesos en segundo plano.

## Actualización de noviembre 2026

- Nuevas pestañas **Fútbol** y **NBA**, con secciones separadas también en Inicio. En Fútbol están los filtros de todas las ligas disponibles; los enlaces antiguos `#partidos` se abren en Fútbol.
- **Copa del Rey:** prioridad al calendario archivado de ESPN frente al CSV complementario, con descarte de enfrentamientos contradictorios (un club con dos rivales distintos el mismo día), duplicados y partidos cuyo resultado final ya se ha confirmado. El calendario es parcial por rondas y depende de los proveedores.
- **Bundesliga y Ligue 1:** añadidas a los filtros de fútbol y a la sincronización de CSV. Las estadísticas dependen de los campos realmente disponibles en open-matchday; no se inventan datos ausentes.
- Nueva versión del service worker para que Android instale el código actualizado. Tras la primera actualización puede ser necesario cerrar y volver a abrir la PWA.

## Vista por días — versión 1.4

Los partidos se muestran **día a día**, con títulos como **Hoy** y **Mañana** según la zona horaria local del navegador. Dentro de cada día de **Fútbol**, los partidos están agrupados por competición (LaLiga, Bundesliga, Ligue 1, Copa del Rey, etc.). En **NBA**, los encuentros se agrupan por el día local, aunque ESPN publique la hora en UTC.

La portada muestra separadamente un resumen de fútbol y otro de NBA para los primeros dos días con encuentros disponibles. Las secciones completas empiezan mostrando siete fechas y permiten pulsar **Mostrar 7 días más** sucesivamente, conservando los filtros de búsqueda, liga y periodo. Se mantiene la carga progresiva para móviles.


## Versión 1.6 — Interfaz, jugadores e historial

- Interfaz compacta en **Fútbol** y **NBA**: fecha, búsqueda y partidos son las primeras acciones. Los filtros por competición, estadísticas de equipos, mercados avanzados, fuentes y precisión del modelo siguen disponibles en paneles desplegables.
- Android: al seleccionar un encuentro se abre su ficha en una vista a pantalla completa con botón de regreso al calendario.
- **Partidos finalizados:** la ficha muestra el resultado real y, solo cuando ya existía una predicción sellada antes del inicio, las probabilidades originales, el marcador estimado y los mercados guardados. Nunca se fabrica un pronóstico retrospectivo.
- Historial: los nuevos registros guardan más datos. Los anteriores siguen conservando sus probabilidades originales aunque no tengan estimaciones detalladas.
- **Fútbol:** bajo demanda, se consultan apariciones y estadísticas individuales que ESPN documente en partidos anteriores, más un historial de amonestaciones local cuando lo haya. No se atribuyen goles, asistencias, minutos ni tarjetas si la fuente no los verifica. La cobertura varía mucho entre competiciones.
- **NBA:** bajo demanda, hasta cuatro partidos anteriores por equipo para mostrar puntos, rebotes, asistencias, minutos, robos, tapones, pérdidas y porcentajes de tiro de sus jugadores.
- Rendimiento: copia local de calendarios NBA primero; el directo se consulta después sin bloquear la vista, los archivos alojados en la web aprovechan la caché del navegador, los guardados locales se agrupan y las fichas de jugadores requieren una acción explícita.
- Privacidad: las predicciones guardadas siguen siendo **locales de este navegador/dispositivo**. El historial no se comparte automáticamente entre Android y un ordenador.
- Limitación: fuentes ESPN/NBA CDN no garantizadas. Si no responden, se muestra la ausencia de datos; no hay precisión máxima garantizada ni reentrenamiento automático del modelo.

## Versión 2.0 — interfaz renovada e historial visible tras el resultado

- Interfaz visual clara, con colores azul/verde agua, tarjetas de partido más legibles y menos elementos secundarios.
- **Partidos finalizados:** debajo del resultado se muestran *todos* los porcentajes guardados antes del inicio: local / empate / visitante para fútbol y local / visitante para NBA.
- La ficha ampliada repite esas probabilidades sin recalcularlas, con fecha de registro, marcador estimado y otros mercados si se guardaron.
- **Archivo compartido:** GitHub Actions ejecuta `scripts/archive_predictions.mjs` cada dos horas y tras actualizar los feeds; guarda en `feeds/predictions.json` los pronósticos creados *antes* del partido. La web prioriza el registro local y consulta la copia pública como respaldo.
- Los partidos antiguos para los que no se conservó una predicción válida seguirán mostrando «Pronóstico anterior no registrado». Nunca se reconstruyen probabilidades después del resultado.
- Los históricos personales del navegador siguen en cada dispositivo; el archivo compartido solo contiene datos deportivos y probabilidades, nunca datos personales.
- Las actualizaciones automáticas dependen de que GitHub Actions esté habilitado y se ejecute correctamente. No pueden rellenar predicciones de partidos anteriores a su instalación.

Las probabilidades son experimentales y no garantizan aciertos.

## Versión 2.1 — confianza visible, carga rápida y nuevo diseño

- Interfaz renovada en azul noche con contraste alto, filtros discretos, tarjetas legibles y navegación adaptada a Android.
- **Confianza en todas las tarjetas**: Media, Baja o Sin evaluar, tanto en próximos encuentros como en partidos finalizados con predicción histórica. El nivel refleja la cobertura de datos del modelo, **no** la probabilidad de acertar. No se inventa la categoría Alta.
- Los partidos finalizados conservan a la vista el marcador y los porcentajes originales previos, con la confianza que se archivó. Si el archivo anterior no incluía confianza, se indica Sin evaluar.
- Rendimiento: calendario y estadísticas se actualizan por regiones sin reconstruir todos los controles, se consulta un máximo de tres fuentes deportivas en paralelo, con prioridad a LaLiga/NBA/Copa del Rey, y el historial local de pronósticos se lee una vez por renderizado.
- Los historiales de jugadores se consultan solamente al pulsar el botón correspondiente. La ficha de análisis no se genera hasta que se abre el partido, para evitar cómputos invisibles al iniciar.
- La caché de la PWA se actualizó a `predix-shell-v11`, incluyendo el módulo `src/confidence.js`.
- Estas mejoras no representan una medición de velocidad en Android ni una validación real de precisión predictiva.

## Versión 2.2 — nombres de jugadores NBA y diseño Midnight Graphite

- Corregido el error que ocultaba los nombres de jugadores de NBA: la tabla usaba una función de formato numérico incluso para la columna de texto, mostrando `—` en vez del nombre.
- Ahora el nombre se representa como texto escapado y cabecera de fila; queda fijo al desplazar las estadísticas lateralmente en Android.
- Añadidas comprobaciones de nombres visibles y de escape de HTML malicioso, sin alterar los cálculos de puntos, rebotes o asistencias.
- Nuevo tema más oscuro, con fondo grafito, tarjetas azul noche, bordes suaves, estados claros y mejor contraste en las tablas NBA.
- Caché de la PWA incrementada a `predix-shell-v12` para distribuir los cambios a la aplicación instalada.
