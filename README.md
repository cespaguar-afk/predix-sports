# Predix Sports · Primera versión funcional

PWA oscura de predicciones deportivas con datos abiertos, sin API keys y sin servidor propio. Proyecto **personal, no comercial**. Incluye LaLiga, Premier League, Champions League masculina y NBA.

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
| LaLiga, Premier, Champions: calendario y resultados | Conectado a CSV de open-matchday 2026/27 |
| Pronósticos fútbol 1X2, marcador, más de 2,5, ambos marcan | Poisson experimental |
| Córners, amarillas, faltas, remates | Estimaciones solo si hay suficientes valores no nulos |
| NBA: partidos, resultados y modelo ganador/total | ESPN API no oficial (puede fallar) |
| En directo | Marcador ESPN al pulsar actualizar (no hay pronóstico in-play) |
| Apuestas de valor | No implementado, no hay cuotas fiables y el usuario no quiere introducirlas |
| Aprendizaje | Brier + recalibración suave con historial local ya evaluado; no reentrena redes neuronales |
| Bajas, alineaciones, impacto de jugadores | No implementado: sin feed fiable y gratuito |
| Clasificado en eliminatorias | No implementado aún: requiere agregados y reglas verificadas |
| Instalación offline | La interfaz se abre offline una vez instalada; datos externos necesitan conexión o caché previo |

## Datos y metodología

Fútbol: [open-matchday](https://github.com/oladeeayo/open-matchday) (CSV 2026/27, edición diaria, no live). Su compilación permite uso personal informativo no comercial con atribución. No incluye cuotas, lesiones ni xG. Las horas están en una convención CET-1 fija (en verano puede diferir respecto al huso local) y se marcan como orientativas.

NBA/marcadores: [ESPN scoreboard no oficial](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard), JSON sin clave. Es un endpoint **no documentado ni garantizado**; depende de CORS y puede dejar de funcionar. La UI muestra una advertencia y conserva datos previos si falla. [BoxScore Lab](https://www.boxscorelab.com/downloads/) ofrece descargas NBA gratuitas, pero no está conectado todavía.

Los modelos no están calibrados ni han superado validación externa; la etiqueta de confianza indica solo volumen de muestra. Las métricas de error se computan contra registros guardados antes del encuentro, no contra datos filtrados a posteriori. No hay ingresos por apuestas, banca, rentabilidad ni promesas de acierto.

**Actualización 2027/28:** en `src/data.js`, modifica `SEASON='2627'` cuando open-matchday publique la siguiente temporada y confirme sus rutas. Considera un adaptador automático en una futura versión.

## Archivos

- `index.html`: estructura de la interfaz
- `styles.css`: diseño responsive oscuro
- `src/data.js`: fuentes externas, parseo y normalización
- `src/model.js`: modelos experimentales, Brier y calibración
- `src/storage.js`: historial local y favoritos
- `src/main.js`: interacciones, carga y visualización
- `manifest.webmanifest`, `sw.js`, `assets/`: PWA e iconos
- `tests/model.test.mjs`: pruebas sin dependencias

## Limitaciones importantes

- Estimar probabilidades no garantiza fiabilidad; no representan una recomendación financiera.
- Las predicciones guardadas se sellan solo para partidos posteriores al día de consulta; evita fuga de resultados del mismo día con horas inciertas.
- Al cambiar el proveedor, la localización de equipos y el código de partido podrían cambiar, impidiendo calificar históricos; no atribuye datos inciertos.
- Guardar en `localStorage` no aporta sincronización ni protección criptográfica.
- No hay actualizaciones automáticas ni procesos en segundo plano.
