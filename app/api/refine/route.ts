import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Song {
  name: string;
  artist: string;
}

interface SimilarTrack {
  name: string;
  artist: { name: string };
}

async function fetchSimilarTracks(song: Song, apiKey: string, limit: number = 30): Promise<SimilarTrack[]> {
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${encodeURIComponent(song.artist)}&track=${encodeURIComponent(song.name)}&api_key=${apiKey}&format=json&limit=${limit}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.similartracks?.track || [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { seeds, currentPlaylist, feedback, playlistSize = 20 } = await request.json();

    if (!seeds || !currentPlaylist || !feedback) {
      return NextResponse.json({ error: 'Se requieren canciones seed, playlist actual y feedback' }, { status: 400 });
    }

    const apiKey = process.env.LASTFM_API_KEY;
    const targetSize = Math.min(Math.max(playlistSize, 10), 50);
    const tracksPerSeed = Math.ceil((targetSize * 3) / seeds.length);

    // Get similar tracks based on seeds
    const allSimilar = await Promise.all(
      seeds.map((song: Song) => fetchSimilarTracks(song, apiKey!, tracksPerSeed))
    );

    let flatTracks = allSimilar.flat();

    // Fetch more if needed
    if (flatTracks.length < targetSize * 2) {
      const additionalTracks = await Promise.all(
        seeds.map((song: Song) => fetchSimilarTracks(song, apiKey!, tracksPerSeed * 2))
      );
      flatTracks = [...flatTracks, ...additionalTracks.flat()];
    }

    // Deduplicate
    const seen = new Set<string>();
    const seedSet = new Set(seeds.map((s: Song) => `${s.name.toLowerCase()}|${s.artist.toLowerCase()}`));

    const uniqueTracks = flatTracks.filter((track: SimilarTrack) => {
      const key = `${track.name.toLowerCase()}|${track.artist.name.toLowerCase()}`;
      if (seen.has(key) || seedSet.has(key)) return false;
      seen.add(key);
      return true;
    });

    const candidateTracks = uniqueTracks.slice(0, targetSize * 3).map((t: SimilarTrack) => ({
      name: t.name,
      artist: t.artist.name,
    }));

    const seedList = seeds.map((s: Song) => `"${s.name}" de ${s.artist}`).join(', ');
    const currentList = currentPlaylist.map((s: Song) => `"${s.name}" de ${s.artist}`).join(', ');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un curador musical refinando una playlist basándote en el feedback del usuario.

CONTEXTO QUE RECIBES:
- Playlist actual
- Feedback del usuario en texto libre
- Contexto original (canciones seed + respuestas si es Cara A / intención si es Cara B)

PROCESO:
1. Analiza el feedback — identifica qué dimensión critica:
   - ¿Es de energía? ("más movido", "más tranquilo")
   - ¿Es de género o estilo? ("sin electrónica", "más guitarra")
   - ¿Es emocional? ("más alegre", "menos melancólico")
   - ¿Es de contexto? ("no encaja con lo que pedí")

2. Identifica qué canciones de la playlist actual SÍ encajan con el feedback — mantenlas

3. Para las que no encajan, busca sustituciones que corrijan exactamente lo criticado sin romper lo que sí funcionaba

REGLAS:
- Si el feedback es de energía → ajusta energía, no necesariamente género
- Si el feedback es de estilo → mantén el feeling emocional pero cambia la textura sonora
- Si el feedback es emocional → prioriza ese cambio por encima de todo
- Coherencia emocional por encima de coherencia de género
- Máximo 2 canciones del mismo artista en la playlist final
- La playlist refinada es una evolución de la original, no un reemplazo completo

Responde SOLO con JSON:
{"playlist": [{"name": "...", "artist": "..."}]} con exactamente ${targetSize} canciones.`
        },
        {
          role: 'user',
          content: `Canciones seed originales: ${seedList}

Playlist actual: ${currentList}

Feedback del usuario: "${feedback}"

Candidatos disponibles:
${JSON.stringify(candidateTracks)}

Crea una playlist refinada de ${targetSize} canciones basada en el feedback.`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content || '{"playlist":[]}');
    let playlist = parsed.playlist || [];

    // Ensure we have enough tracks
    if (playlist.length < targetSize) {
      const existing = new Set(playlist.map((t: Song) => `${t.name.toLowerCase()}|${t.artist.toLowerCase()}`));
      for (const track of candidateTracks) {
        if (playlist.length >= targetSize) break;
        if (!existing.has(`${track.name.toLowerCase()}|${track.artist.toLowerCase()}`)) {
          playlist.push(track);
        }
      }
    }

    playlist = playlist.slice(0, targetSize);

    return NextResponse.json({ playlist });
  } catch (error) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: 'Error al refinar playlist' }, { status: 500 });
  }
}
