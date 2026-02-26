# CLAUDE.md — Sonder

> Lee este archivo al inicio de cada sesión antes de hacer cualquier cosa.
> Actualiza las secciones relevantes al final de cada sesión.

---

## Qué es Sonder

App web de descubrimiento musical personalizado. El usuario genera playlists basadas en canciones que ya le gustan (Cara A) o en una intención/momento (Cara B). La IA analiza emocional y técnicamente las canciones para recomendar música nueva que resuene con el usuario.

**Objetivo core:** Que el usuario sienta que la app le leyó la mente.

---

## Stack

| Herramienta | Versión | Uso |
|---|---|---|
| Next.js | 16.1.6 | Framework, App Router |
| React | 19.2.3 | UI |
| TypeScript | — | Tipado |
| Tailwind CSS | 3.4 | Estilos |
| OpenAI API | gpt-4o-mini | Análisis musical, preguntas, curación |
| Last.fm API | — | Búsqueda y canciones similares |
| YouTube Data API v3 | — | Búsqueda de videoIds para reproducción |

---

## Variables de entorno
```env
LASTFM_API_KEY=        # Last.fm — búsqueda y similares
OPENAI_API_KEY=        # OpenAI gpt-4o-mini
YOUTUBE_API_KEY=       # YouTube Data API v3 — 10.000 unidades/día
```

**Límite crítico YouTube:** 10.000 unidades/día. Cada búsqueda de videoId cuesta 100 unidades. Sistema de caché en memoria implementado + carga bajo demanda para minimizar consumo.

---

## Estructura de archivos
```
app/
  page.tsx                  # Página principal — toda la lógica de flujo y estado
  layout.tsx                # Layout, fuentes, metadata
  globals.css               # Estilos globales, scrollbar, selection
  components/
    Stepper.tsx             # Indicador de pasos
    SearchInput.tsx         # Input búsqueda de canciones (Last.fm)
    SongCard.tsx            # Card de canción — seleccionable + links plataformas
    Player.tsx              # Reproductor bottom fijo — YouTube iFrame invisible
  api/
    search/route.ts         # Last.fm track.search
    questions/route.ts      # OpenAI — genera preguntas situacionales
    playlist/route.ts       # Last.fm getSimilar + OpenAI curación
    refine/route.ts         # Refinamiento con feedback de texto
    discover/route.ts       # Cara B — genera playlist desde intención
    youtube/route.ts        # YouTube Data API — busca videoId con caché
```

---

## Dos modos de uso

### Cara A (acento rojo #EF4444)
Flujo: Buscar canciones → Preguntas situacionales → Playlist

El usuario selecciona 1-10 canciones como semilla. OpenAI las analiza en dos capas (40% técnica, 60% emocional/narrativa) y genera 3 preguntas situacionales — sobre el momento, la intención, el feeling — no sobre características técnicas. Last.fm busca similares, OpenAI cura y ordena por relevancia emocional.

### Cara B (acento azul #3B82F6)
Flujo: Intención → Playlist

El usuario describe para qué momento es la playlist. Opcionalmente puede añadir géneros o canciones de referencia. Si no añade nada opcional, aparece el botón "✦ Sorpréndeme" (desaparece si hay opciones rellenas) que genera la playlist confiando todo a la IA. OpenAI define el arco emocional completo de la playlist.

---

## APIs externas

### Last.fm
- Base URL: `https://ws.audioscrobbler.com/2.0/`
- Auth: `api_key` como query param
- Endpoints usados:
  - `track.search` — buscar canciones
  - `track.getSimilar` — canciones similares a una dada
  - `track.getInfo` — verificar que una canción existe
  - `chart.getTopTracks` — fallback si getSimilar falla
- ⚠️ Sin OAuth, sin Premium — completamente gratuito

### OpenAI
- Modelo: `gpt-4o-mini` — no cambiar sin revisar costes
- Usado en: questions, playlist, discover, refine
- ⚠️ El análisis emocional/narrativo tiene peso 60%, técnico 40%

### YouTube Data API v3
- ⚠️ `search.list` cuesta 100 unidades — usar con caché
- Caché en memoria en `youtube/route.ts` — key: `artist::title` lowercase
- Carga bajo demanda: solo busca videoId cuando va a reproducirse
- Precarga: cuando empieza canción N, busca en background N+1
- Error 150: video bloqueado para embed — marca como unplayable, salta automáticamente
- ⚠️ Spotify Recommendations API — DEPRECATED, no usar

---

## Diseño y estética

**Estilo:** Minimalista oscuro con personalidad. Discreto pero cuidado.
```css
--bg: #0A0A0B
--bg-card: rgba(255,255,255,0.03)
--bg-card-hover: rgba(255,255,255,0.06)
--border: rgba(255,255,255,0.07)
--border-hover: rgba(255,255,255,0.14)
--text-primary: #F0F0F0
--text-secondary: #71717A
--accent-a: #EF4444  /* Cara A — rojo */
--accent-b: #3B82F6  /* Cara B — azul */
```

Fuentes: `Syne` (títulos, 700) + `Inter` (cuerpo)
Cards: glass sutil, backdrop-blur 8px, border-radius 12px
Mobile-first: áreas táctiles mínimo 44px

---

## Reproductor

- Barra fija bottom, altura 72px desktop / 64px móvil
- YouTube iFrame invisible (1x1px, opacity 0) — solo audio
- Controles: anterior / play-pause / siguiente / volumen / bucle / shuffle
- Shuffle: Fisher-Yates, restaura orden original al desactivar
- Bucle: sin bucle → playlist → canción
- Canción activa: indicador de 3 barras animadas (estilo Spotify)
- Al hacer click en canción de la lista → reproduce esa canción

---

## Lo que NO debes hacer

- ❌ Usar Spotify Recommendations API — está deprecated
- ❌ Precargar todos los videoIds de YouTube al generar la playlist — consume toda la cuota
- ❌ Mostrar el campo `analysis` de OpenAI al usuario — es contexto interno
- ❌ Usar `any` en TypeScript
- ❌ Acceder a variables de entorno desde componentes cliente — solo desde API routes
- ❌ Cambiar el modelo de OpenAI sin revisar costes e impacto

---

## Funcionalidades pendientes

- [ ] Deploy en Vercel
- [ ] Swipe para eliminar canción y sustituir automáticamente (mobile)
- [ ] Modo B refinado con feedback iterativo
- [ ] Caché de videoIds persistente (ahora es solo en memoria — se pierde al reiniciar)
- [ ] Exportar playlist como archivo descargable
- [ ] Optimización móvil: botón Sorpréndeme en fila con Género y canciones
- [ ] Diferenciar visualmente botón Crear playlist vs Sorpréndeme en móvil

---

## Historial de sesiones

### Sesión 1 — [fecha]
- Proyecto creado desde cero con Next.js 15
- Stack definido: Last.fm + OpenAI + YouTube (pivot desde Spotify por restricciones Premium)
- Implementado flujo completo Cara A: búsqueda → preguntas → playlist
- Reproductor YouTube con iFrame invisible + controles custom
- Rediseño visual: minimalista oscuro, Syne + Inter, glassmorphism sutil
- Preguntas situacionales: análisis 40% técnico / 60% emocional, adaptado por género
- Cara B implementada: intención → playlist con botón Sorpréndeme dinámico
- Hardening: estados de carga, manejo de errores visible, edge cases
- Optimización YouTube API: caché en memoria + carga bajo demanda
- Shuffle y bucle en reproductor
- Toggle "incluir canciones originales en playlist"

---

## Instrucciones para Claude

1. **Al iniciar sesión:** Lee este archivo completo antes de escribir una línea de código
2. **Durante la sesión:** Si descubres algo importante sobre las APIs, limitaciones o decisiones de arquitectura, anótalo mentalmente para el resumen final
3. **Al finalizar sesión:** Actualiza la sección "Historial de sesiones" con una nueva entrada que incluya fecha y lista de cambios realizados. Actualiza también cualquier sección que haya cambiado (pendientes completados, nuevas limitaciones descubiertas, cambios de stack, etc.)
4. **Nunca borres** el historial de sesiones anteriores — solo añade
