import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Song {
  name: string;
  artist: string;
}

interface OpenAISong {
  title: string;
  artist: string;
}

async function verifyTrackExists(song: { title: string; artist: string }, apiKey: string): Promise<boolean> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(song.artist)}&track=${encodeURIComponent(song.title)}&api_key=${apiKey}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    return !data.error && data.track;
  } catch {
    return false;
  }
}

async function getReplacementSong(
  intention: string,
  genres: string | undefined,
  referenceSongs: Song[] | undefined,
  existingSongs: string[],
  apiKey: string
): Promise<OpenAISong | null> {
  try {
    const refContext = referenceSongs && referenceSongs.length > 0
      ? `\nCanciones de referencia: ${referenceSongs.map(s => `"${s.name}" de ${s.artist}`).join(', ')}`
      : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sugiere UNA canción que encaje con esta intención: "${intention}"${genres ? `. Géneros preferidos: ${genres}` : ''}${refContext}

La canción NO puede ser ninguna de estas: ${existingSongs.join(', ')}

Responde SOLO con JSON:
{"title": "...", "artist": "..."}`
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
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { intention, genres, referenceSongs, playlistSize = 20, surpriseMode = false } = await request.json();

    if (!intention || typeof intention !== 'string' || intention.trim().length === 0) {
      return NextResponse.json({ error: 'Se requiere una intención' }, { status: 400 });
    }

    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Last.fm API key no configurada' }, { status: 500 });
    }

    const targetSize = Math.min(Math.max(playlistSize, 10), 50);

    // Build reference context for OpenAI
    const refContext = referenceSongs && referenceSongs.length > 0
      ? `\n\nCanciones de referencia del usuario (analiza qué tienen en común emocionalmente y busca canciones con ese feeling, no necesariamente del mismo género):
${referenceSongs.map((s: Song) => `- "${s.name}" de ${s.artist}`).join('\n')}`
      : '';

    const refExclusion = referenceSongs && referenceSongs.length > 0
      ? referenceSongs.map((s: Song) => `"${s.name}" de ${s.artist}`).join(', ')
      : '';

    console.log('[Discover] Generating playlist for intention:', intention, '| surpriseMode:', surpriseMode);

    // Different prompts based on surpriseMode
    const systemPrompt = surpriseMode
      ? `Eres un experto en curación musical con gusto impecable. El usuario quiere SORPRENDERSE.

Con SOLO la intención proporcionada, genera una playlist de exactamente ${targetSize} canciones.

REGLAS PARA MODO SORPRESA:
- PRIORIDAD ABSOLUTA: Canciones poco conocidas pero de alta calidad — deep cuts, joyas escondidas, artistas emergentes
- Cruza géneros inesperados si encajan emocionalmente con la intención
- Evita los hits obvios y las canciones que todo el mundo conoce
- Busca versiones alternativas, remixes interesantes, o canciones de álbumes menos conocidos de artistas famosos
- El objetivo es que el usuario descubra algo nuevo que le encante
- Devuelve SOLO el JSON, sin texto adicional

Devuelve:
{
  "songs": [
    { "title": "...", "artist": "..." }
  ]
}`
      : `Eres un experto en curación musical. El usuario quiere una playlist para un momento o intención específica.

Con la intención proporcionada, y opcionalmente géneros y canciones de referencia, genera una lista de exactamente ${targetSize} canciones perfectas para ese momento.

REGLAS:
- Prioriza la intención por encima de todo — es lo más importante
- Si hay géneros, úsalos como marco pero no te limites a ellos si algo encaja mejor
- Si hay canciones de referencia, analiza qué tienen en común emocionalmente y busca canciones con ese mismo feeling, no necesariamente del mismo género
- Incluye mezcla de canciones conocidas y menos conocidas — el objetivo es descubrir
- No incluyas las canciones de referencia en la playlist final
- Devuelve SOLO el JSON, sin texto adicional

Devuelve:
{
  "songs": [
    { "title": "...", "artist": "..." }
  ]
}`;

    const userContent = surpriseMode
      ? `Intención: ${intention}`
      : `Intención: ${intention}${genres ? `\n\nGéneros preferidos: ${genres}` : ''}${refContext}${refExclusion ? `\n\nNO incluyas estas canciones: ${refExclusion}` : ''}`;

    // Generate playlist with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content || '{"songs":[]}');
    let suggestedSongs: OpenAISong[] = parsed.songs || [];

    console.log(`[Discover] OpenAI suggested ${suggestedSongs.length} songs`);

    // Verify each song exists in Last.fm
    const verifiedPlaylist: Song[] = [];
    const triedSongs: string[] = [];

    for (const song of suggestedSongs) {
      const songKey = `"${song.title}" de ${song.artist}`;
      triedSongs.push(songKey);

      const exists = await verifyTrackExists(song, apiKey);
      if (exists) {
        verifiedPlaylist.push({ name: song.title, artist: song.artist });
        console.log(`[Discover] Verified: ${song.title} by ${song.artist}`);
      } else {
        console.log(`[Discover] Not found: ${song.title} by ${song.artist}, getting replacement...`);
        // Try to get a replacement
        const replacement = await getReplacementSong(intention, genres, referenceSongs, triedSongs, apiKey);
        if (replacement) {
          verifiedPlaylist.push({ name: replacement.title, artist: replacement.artist });
          triedSongs.push(`"${replacement.title}" de ${replacement.artist}`);
          console.log(`[Discover] Replacement found: ${replacement.title} by ${replacement.artist}`);
        }
      }

      // Stop if we have enough songs
      if (verifiedPlaylist.length >= targetSize) break;
    }

    // If we still don't have enough, try to get more
    let attempts = 0;
    while (verifiedPlaylist.length < targetSize && attempts < 10) {
      const replacement = await getReplacementSong(intention, genres, referenceSongs, triedSongs, apiKey);
      if (replacement) {
        verifiedPlaylist.push({ name: replacement.title, artist: replacement.artist });
        triedSongs.push(`"${replacement.title}" de ${replacement.artist}`);
        console.log(`[Discover] Additional song: ${replacement.title} by ${replacement.artist}`);
      }
      attempts++;
    }

    console.log(`[Discover] Final playlist: ${verifiedPlaylist.length} verified songs`);

    if (verifiedPlaylist.length === 0) {
      return NextResponse.json({ error: 'No se pudieron encontrar canciones verificadas' }, { status: 500 });
    }

    return NextResponse.json({ playlist: verifiedPlaylist.slice(0, targetSize) });
  } catch (error) {
    console.error('[Discover] Error:', error);
    return NextResponse.json({ error: 'Error al generar playlist' }, { status: 500 });
  }
}
