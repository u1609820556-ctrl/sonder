import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Song {
  name: string;
  artist: string;
}

interface Question {
  id: number;
  text: string;
  options?: string[];
}

interface Answer {
  questionId: number;
  answer: string;
}

interface SimilarTrack {
  name: string;
  artist: { name: string };
  match?: number;
}

async function fetchSimilarTracks(song: Song, apiKey: string, limit: number = 20): Promise<SimilarTrack[]> {
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${encodeURIComponent(song.artist)}&track=${encodeURIComponent(song.name)}&api_key=${apiKey}&format=json&limit=${limit}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const tracks = data.similartracks?.track || [];
    if (tracks.length === 0) {
      console.log(`[Last.fm] No similar tracks found for "${song.name}" by ${song.artist}`);
    }
    return tracks;
  } catch (error) {
    console.error(`[Last.fm] Error fetching similar tracks for "${song.name}" by ${song.artist}:`, error);
    return [];
  }
}

async function fetchTopTracks(apiKey: string, limit: number = 50): Promise<SimilarTrack[]> {
  const url = `https://ws.audioscrobbler.com/2.0/?method=chart.getTopTracks&api_key=${apiKey}&format=json&limit=${limit}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const tracks = data.tracks?.track || [];
    console.log(`[Last.fm] Fetched ${tracks.length} top tracks as fallback`);
    return tracks.map((t: { name: string; artist: { name: string } }) => ({
      name: t.name,
      artist: { name: t.artist.name },
    }));
  } catch (error) {
    console.error('[Last.fm] Error fetching top tracks:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { songs, questions, answers, analysis, playlistSize = 20, includeSeed = false, seedSongs = [] } = await request.json();

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json({ error: 'Se requieren canciones' }, { status: 400 });
    }

    const apiKey = process.env.LASTFM_API_KEY;
    const targetSize = Math.min(Math.max(playlistSize, 10), 50);

    const tracksPerSeed = Math.ceil((targetSize * 3) / songs.length);

    const allSimilar = await Promise.all(
      songs.map((song: Song) => fetchSimilarTracks(song, apiKey!, tracksPerSeed))
    );

    let flatTracks = allSimilar.flat();

    if (flatTracks.length < targetSize * 2) {
      const additionalPromises = songs.map((song: Song) =>
        fetchSimilarTracks(song, apiKey!, tracksPerSeed * 2)
      );
      const additionalTracks = await Promise.all(additionalPromises);
      flatTracks = [...flatTracks, ...additionalTracks.flat()];
    }

    const seen = new Set<string>();
    const seedSet = new Set(songs.map((s: Song) => `${s.name.toLowerCase()}|${s.artist.toLowerCase()}`));

    const uniqueTracks = flatTracks.filter((track: SimilarTrack) => {
      const key = `${track.name.toLowerCase()}|${track.artist.name.toLowerCase()}`;
      if (seen.has(key) || seedSet.has(key)) return false;
      seen.add(key);
      return true;
    });

    let candidateTracks = uniqueTracks.slice(0, targetSize * 3).map((t: SimilarTrack) => ({
      name: t.name,
      artist: t.artist.name,
    }));

    console.log(`[Playlist] Found ${candidateTracks.length} unique candidate tracks from similar`);

    // Fallback: if we have too few candidates, fetch top tracks
    if (candidateTracks.length < targetSize) {
      console.log(`[Playlist] Not enough candidates (${candidateTracks.length}), fetching top tracks as fallback`);
      const topTracks = await fetchTopTracks(apiKey!, targetSize * 2);
      const topFiltered = topTracks.filter((t: SimilarTrack) => {
        const key = `${t.name.toLowerCase()}|${t.artist.name.toLowerCase()}`;
        if (seen.has(key) || seedSet.has(key)) return false;
        seen.add(key);
        return true;
      }).map((t: SimilarTrack) => ({
        name: t.name,
        artist: t.artist.name,
      }));
      candidateTracks = [...candidateTracks, ...topFiltered];
      console.log(`[Playlist] After fallback: ${candidateTracks.length} total candidates`);
    }

    const songList = songs.map((s: Song) => `"${s.name}" de ${s.artist}`).join(', ');
    const qaContext = questions && answers
      ? questions.map((q: Question) => {
          const answer = answers.find((a: Answer) => a.questionId === q.id);
          return `P: ${q.text}\nR: ${answer?.answer || 'Sin respuesta'}`;
        }).join('\n\n')
      : '';

    // If we still have no candidates after fallback, return error
    if (candidateTracks.length === 0) {
      console.error('[Playlist] No candidates found even after fallback');
      return NextResponse.json({ error: 'No se encontraron canciones similares' }, { status: 500 });
    }

    let playlist: Song[] = [];

    // Try OpenAI curation
    try {
      console.log('[Playlist] Attempting OpenAI curation...');
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un curador musical experto. Construyes playlists que hacen que el usuario sienta que alguien le leyó la mente.

CONSTRUCCIÓN DEL PERFIL:

Capa técnica (40%) — deriva del análisis interno:
- Densidad sonora del conjunto
- Dinámica predominante (constante, creciente, explosiva, contenida)
- Textura característica (rugosa, suave, fría, cálida, orgánica, sintética)
- Tipo de producción (íntima, épica, cruda, pulida, lo-fi, hi-fi, vintage, contemporánea)
- Relación voz/música
- Rango de tempo y energía que define el conjunto

Capa emocional y situacional (60%) — deriva de las respuestas del usuario:
- Emoción nuclear buscada con toda su especificidad y matiz — no etiquetas simples
- Si hay contradicción emocional deseada — dos fuerzas en tensión
- La imagen, lugar o momento que debe evocar
- La narrativa que debe contar o sugerir
- La tensión interna que debe recorrer la playlist
- El estado en que debe dejar al usuario al terminar

SELECCIÓN Y ORDEN:
Selecciona exactamente ${targetSize} canciones.

Prioridad:
1. Coincidencia en AMBAS capas
2. Coincidencia principalmente emocional
3. Coincidencia principalmente técnica

Arco emocional obligatorio:
- Entrada (primeras 20%): introducen el estado emocional gradualmente
- Núcleo (60% central): el corazón de la experiencia
- Cierre (últimas 20%): resuelven, intensifican o dejan suspendido según la intención

Reglas:
- Máximo 2 canciones del mismo artista
- Mínimo 30% canciones que el usuario probablemente no conoce
- Cada canción se justifica emocionalmente, no solo por género
- Coherencia emocional por encima de coherencia de género

Responde SOLO con JSON:
{
  "playlist": [{"name": "...", "artist": "..."}]
}`
          },
          {
            role: 'user',
            content: `Canciones seed del usuario: ${songList}

ANÁLISIS INTERNO (contexto técnico y emocional de las canciones seed — 40% peso técnico):
${analysis || 'No disponible'}

RESPUESTAS DEL USUARIO (preferencias situacionales y emocionales — 60% peso emocional):
${qaContext || 'Sin preferencias específicas'}

Candidatos disponibles para la playlist:
${JSON.stringify(candidateTracks)}

Construye el perfil combinando análisis (40% técnico) + respuestas (60% emocional) y selecciona las ${targetSize} mejores canciones.`
          }
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content;
      const parsed = JSON.parse(content || '{"playlist":[]}');
      playlist = parsed.playlist || [];
      console.log(`[Playlist] OpenAI returned ${playlist.length} curated tracks`);
    } catch (openaiError) {
      console.error('[Playlist] OpenAI curation failed:', openaiError);
      console.log('[Playlist] Falling back to uncurated candidates');
      // OpenAI failed - use candidates directly without curation
      playlist = [];
    }

    // Fill up if playlist is smaller than target
    if (playlist.length < targetSize && candidateTracks.length > playlist.length) {
      console.log(`[Playlist] Filling playlist: have ${playlist.length}, need ${targetSize}`);
      const existing = new Set(playlist.map((t: Song) => `${t.name.toLowerCase()}|${t.artist.toLowerCase()}`));
      for (const track of candidateTracks) {
        if (playlist.length >= targetSize) break;
        if (!existing.has(`${track.name.toLowerCase()}|${track.artist.toLowerCase()}`)) {
          playlist.push(track);
        }
      }
    }

    // Final slice to target size
    playlist = playlist.slice(0, targetSize);

    // Last resort: if still empty, return whatever candidates we have
    if (playlist.length === 0 && candidateTracks.length > 0) {
      console.log('[Playlist] Playlist still empty, returning raw candidates');
      playlist = candidateTracks.slice(0, targetSize);
    }

    // Include seed songs if requested - intercalate them throughout the playlist
    if (includeSeed && seedSongs && seedSongs.length > 0) {
      console.log(`[Playlist] Including ${seedSongs.length} seed songs, intercalating...`);
      const finalPlaylist: Song[] = [];
      const interval = Math.max(1, Math.floor(playlist.length / (seedSongs.length + 1)));
      let seedIndex = 0;

      for (let i = 0; i < playlist.length; i++) {
        // Insert a seed song at regular intervals
        if (seedIndex < seedSongs.length && i > 0 && i % interval === 0) {
          finalPlaylist.push(seedSongs[seedIndex]);
          seedIndex++;
        }
        finalPlaylist.push(playlist[i]);
      }

      // Add any remaining seed songs at the end
      while (seedIndex < seedSongs.length) {
        finalPlaylist.push(seedSongs[seedIndex]);
        seedIndex++;
      }

      playlist = finalPlaylist;
      console.log(`[Playlist] After intercalation: ${playlist.length} tracks`);
    }

    console.log(`[Playlist] Final playlist: ${playlist.length} tracks`);
    return NextResponse.json({ playlist });
  } catch (error) {
    console.error('[Playlist] Unhandled error:', error);
    return NextResponse.json({ error: 'Error al generar playlist' }, { status: 500 });
  }
}
