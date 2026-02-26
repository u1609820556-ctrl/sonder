import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Song {
  title: string;
  artist: string;
}

interface SeedSong {
  name: string;
  artist: string;
}

async function verifyTrackExists(song: Song, apiKey: string): Promise<boolean> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(song.artist)}&track=${encodeURIComponent(song.title)}&api_key=${apiKey}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    return !data.error && data.track;
  } catch {
    return false;
  }
}

async function getSubstituteSong(
  prompt: string,
  failedSongs: string[],
  apiKey: string,
  maxAttempts: number = 5
): Promise<Song | null> {
  let attempts = 0;
  const triedSongs = [...failedSongs];

  while (attempts < maxAttempts) {
    try {
      const exclusionList = triedSongs.length > 0
        ? `\n\nNO puedes sugerir estas canciones: ${triedSongs.join(', ')}`
        : '';

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompt + exclusionList
          }
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content;
      const parsed = JSON.parse(content || '{}');

      if (parsed.title && parsed.artist) {
        const exists = await verifyTrackExists(parsed, apiKey);
        if (exists) {
          return parsed;
        }
        triedSongs.push(`"${parsed.title}" de ${parsed.artist}`);
        console.log(`[Substitute] Song not found in Last.fm: ${parsed.title} by ${parsed.artist}, retrying...`);
      }
    } catch (error) {
      console.error('[Substitute] OpenAI error:', error);
    }
    attempts++;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode,
      discardedSong,
      currentPlaylist,
      seedSongs,
      answers,
      analysis,
      intention,
      discardReason
    } = body;

    if (!mode || !discardedSong || !currentPlaylist) {
      return NextResponse.json(
        { error: 'Se requiere mode, discardedSong y currentPlaylist' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Last.fm API key no configurada' },
        { status: 500 }
      );
    }

    const playlistArtists = currentPlaylist.map((s: Song) => s.artist.toLowerCase());
    const playlistSongs = currentPlaylist.map((s: Song) => `"${s.title}" de ${s.artist}`);

    let prompt: string;

    if (mode === 'cara-a') {
      const seedList = seedSongs
        ? seedSongs.map((s: SeedSong) => `"${s.name}" de ${s.artist}`).join(', ')
        : '';
      const answersList = answers ? answers.join('\n') : '';

      prompt = `Eres un curador musical sustituyendo UNA canción de una playlist.

CONTEXTO:
- Canciones seed originales: ${seedList}
- Análisis interno de las seeds: ${analysis || 'No disponible'}
- Respuestas del usuario a las preguntas: ${answersList || 'Sin respuestas'}
- Playlist actual (sin la descartada): ${playlistSongs.join(', ')}
- Canción descartada: "${discardedSong.title}" de ${discardedSong.artist}
- Artistas ya en la playlist (NO repetir): ${playlistArtists.join(', ')}

Tu tarea: sugerir UNA canción que:
- Comparta la textura, densidad sonora y producción del conjunto
- Encaje con la emoción nuclear y el arco emocional de la playlist
- Respete las respuestas situacionales del usuario
- No sea de artistas ya presentes en la playlist
- Preferiblemente menos conocida que las canciones seed

Responde SOLO con JSON:
{"title": "...", "artist": "..."}`;

    } else if (mode === 'cara-b') {
      if (discardReason) {
        const reasonText = discardReason === 'no-moment'
          ? 'El usuario dice que la canción no encaja con el momento/intención que pidió'
          : 'El usuario dice que no le gusta el estilo/sonido de la canción';

        prompt = `Eres un curador musical sustituyendo UNA canción de una playlist.

CONTEXTO:
- Playlist creada para: "${intention}"
- Playlist actual (sin la descartada): ${playlistSongs.join(', ')}
- Canción descartada: "${discardedSong.title}" de ${discardedSong.artist}
- Razón del descarte: ${reasonText}
- Artistas ya en la playlist (NO repetir): ${playlistArtists.join(', ')}

${discardReason === 'no-moment'
  ? 'Busca algo que encaje más fielmente con la intención, aunque cambie completamente de género o estilo.'
  : 'Mantén el feeling emocional de la canción descartada pero busca una textura sonora y producción diferente.'}

No repitas artistas ya presentes en la playlist.

Responde SOLO con JSON:
{"title": "...", "artist": "..."}`;

      } else {
        prompt = `Eres un curador musical sustituyendo UNA canción de una playlist.

CONTEXTO:
- Playlist creada para: "${intention}"
- Playlist actual (sin la descartada): ${playlistSongs.join(', ')}
- Canción descartada: "${discardedSong.title}" de ${discardedSong.artist}
- Artistas ya en la playlist (NO repetir): ${playlistArtists.join(', ')}

Sugiere UNA canción diferente que encaje con la intención. Puede ser de cualquier género si emocionalmente es correcta. No repitas artistas ya presentes.

Responde SOLO con JSON:
{"title": "...", "artist": "..."}`;
      }
    } else {
      return NextResponse.json(
        { error: 'Modo inválido. Usa "cara-a" o "cara-b"' },
        { status: 400 }
      );
    }

    console.log(`[Substitute] Mode: ${mode}, Discarded: "${discardedSong.title}" by ${discardedSong.artist}`);

    const failedSongs = [`"${discardedSong.title}" de ${discardedSong.artist}`];
    const substituteSong = await getSubstituteSong(prompt, failedSongs, apiKey);

    if (!substituteSong) {
      return NextResponse.json(
        { error: 'No se pudo encontrar una canción sustituta verificada' },
        { status: 500 }
      );
    }

    console.log(`[Substitute] Found: "${substituteSong.title}" by ${substituteSong.artist}`);

    return NextResponse.json({
      song: {
        name: substituteSong.title,
        artist: substituteSong.artist
      }
    });
  } catch (error) {
    console.error('[Substitute] Error:', error);
    return NextResponse.json(
      { error: 'Error al buscar canción sustituta' },
      { status: 500 }
    );
  }
}
