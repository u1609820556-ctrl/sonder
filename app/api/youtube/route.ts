import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Caché simple en memoria — persiste durante la sesión del servidor
const videoIdCache = new Map<string, string>();

function getCacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`;
}

async function searchYouTubeVideo(songName: string, artist: string): Promise<string | null> {
  if (!YOUTUBE_API_KEY) {
    return null;
  }

  // Check cache first
  const cacheKey = getCacheKey(artist, songName);
  if (videoIdCache.has(cacheKey)) {
    console.log(`[YouTube] Cache hit for "${songName}" by ${artist}`);
    return videoIdCache.get(cacheKey)!;
  }

  try {
    console.log(`[YouTube] API call for "${songName}" by ${artist}`);
    const query = encodeURIComponent(`${songName} ${artist} official audio`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&videoCategoryId=10&maxResults=1&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const videoId = data.items[0].id.videoId;
      // Store in cache
      videoIdCache.set(cacheKey, videoId);
      console.log(`[YouTube] Found and cached videoId: ${videoId}`);
      return videoId;
    }
    console.log(`[YouTube] No video found for "${songName}" by ${artist}`);
    return null;
  } catch (error) {
    console.error('[YouTube] Search error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { song } = await request.json();

    if (!song || !song.name || !song.artist) {
      return NextResponse.json({ error: 'Se requiere una canción con name y artist' }, { status: 400 });
    }

    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ error: 'YouTube API key no configurada' }, { status: 500 });
    }

    const videoId = await searchYouTubeVideo(song.name, song.artist);

    return NextResponse.json({ videoId });
  } catch (error) {
    console.error('[YouTube] API error:', error);
    return NextResponse.json({ error: 'Error al buscar video' }, { status: 500 });
  }
}
