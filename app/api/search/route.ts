import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.LASTFM_API_KEY;
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&limit=20`;

    const response = await fetch(url);
    const data = await response.json();

    const tracks = data.results?.trackmatches?.track || [];

    const formattedTracks = tracks.map((track: { name: string; artist: string; listeners: string }) => ({
      name: track.name,
      artist: track.artist,
      listeners: parseInt(track.listeners) || 0,
    }));

    return NextResponse.json({ tracks: formattedTracks });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search tracks' }, { status: 500 });
  }
}
