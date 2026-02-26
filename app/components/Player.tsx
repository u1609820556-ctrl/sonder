'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Song {
  name: string;
  artist: string;
}

interface PlayerProps {
  playlist: Song[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  isShuffled: boolean;
  onShuffleToggle: () => void;
}

type LoopMode = 'none' | 'playlist' | 'single';

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          height: string;
          width: string;
          videoId: string;
          playerVars: Record<string, number>;
          events: {
            onReady: (event: { target: YTPlayer }) => void;
            onStateChange: (event: { data: number }) => void;
            onError: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

// Caché local de videoIds para evitar llamadas repetidas
const localVideoIdCache = new Map<string, string | null>();

function getCacheKey(song: Song): string {
  return `${song.artist.toLowerCase()}::${song.name.toLowerCase()}`;
}

export default function Player({ playlist, currentIndex, onIndexChange, onPlayingChange, isShuffled, onShuffleToggle }: PlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [loopMode, setLoopMode] = useState<LoopMode>('playlist');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [loadingVideoId, setLoadingVideoId] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiLoadedRef = useRef(false);
  const pendingFetchRef = useRef<number | null>(null);

  const currentSong = playlist[currentIndex];

  // Fetch a single videoId
  const fetchVideoId = useCallback(async (song: Song, index: number): Promise<string | null> => {
    const cacheKey = getCacheKey(song);

    // Check local cache first
    if (localVideoIdCache.has(cacheKey)) {
      console.log(`[Player] Local cache hit for "${song.name}"`);
      return localVideoIdCache.get(cacheKey)!;
    }

    try {
      console.log(`[Player] Fetching videoId for "${song.name}" (index ${index})`);
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });
      const data = await res.json();
      const videoId = data.videoId || null;

      // Store in local cache
      localVideoIdCache.set(cacheKey, videoId);
      console.log(`[Player] Got videoId for "${song.name}": ${videoId}`);

      return videoId;
    } catch (error) {
      console.error(`[Player] Error fetching videoId for "${song.name}":`, error);
      localVideoIdCache.set(cacheKey, null);
      return null;
    }
  }, []);

  // Prefetch next track's videoId
  const prefetchNext = useCallback(async (currentIdx: number) => {
    const nextIdx = (currentIdx + 1) % playlist.length;
    if (nextIdx === currentIdx) return; // Only one song

    const nextSong = playlist[nextIdx];
    const cacheKey = getCacheKey(nextSong);

    // Only prefetch if not already in cache
    if (!localVideoIdCache.has(cacheKey)) {
      console.log(`[Player] Prefetching next track: "${nextSong.name}" (index ${nextIdx})`);
      await fetchVideoId(nextSong, nextIdx);
    }
  }, [playlist, fetchVideoId]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (apiLoadedRef.current) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    apiLoadedRef.current = true;
  }, []);

  // Fetch videoId when currentIndex changes (on-demand loading)
  useEffect(() => {
    if (!currentSong) return;

    const loadCurrentVideo = async () => {
      // Cancel any pending fetch
      pendingFetchRef.current = currentIndex;

      setLoadingVideoId(true);
      const videoId = await fetchVideoId(currentSong, currentIndex);

      // Check if this fetch is still relevant
      if (pendingFetchRef.current !== currentIndex) {
        console.log(`[Player] Fetch for index ${currentIndex} cancelled (now at ${pendingFetchRef.current})`);
        return;
      }

      setCurrentVideoId(videoId);
      setLoadingVideoId(false);

      // Prefetch next track in background
      prefetchNext(currentIndex);
    };

    loadCurrentVideo();
  }, [currentIndex, currentSong, fetchVideoId, prefetchNext]);

  // Initialize player when API is ready and we have a video
  useEffect(() => {
    if (!currentVideoId || playerRef.current) return;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      playerRef.current = new window.YT.Player('youtube-player', {
        height: '1',
        width: '1',
        videoId: currentVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(volume);
            setIsReady(true);
            setDuration(event.target.getDuration());
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              handleSongEnd();
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              onPlayingChange(true);
              setDuration(playerRef.current?.getDuration() || 0);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              onPlayingChange(false);
            }
          },
          onError: (event) => {
            console.error('[Player] YouTube player error:', event.data);
            handleNext();
          },
        },
      });
    };

    initPlayer();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [currentVideoId]);

  // Update video when currentVideoId changes and player is ready
  useEffect(() => {
    if (playerRef.current && currentVideoId && isReady) {
      console.log(`[Player] Loading video: ${currentVideoId}`);
      playerRef.current.loadVideoById(currentVideoId);
      setProgress(0);
    }
  }, [currentVideoId, isReady]);

  // Progress tracking
  useEffect(() => {
    if (isPlaying && playerRef.current) {
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current) {
          const currentTime = playerRef.current.getCurrentTime();
          const totalDuration = playerRef.current.getDuration();
          setProgress(currentTime);
          setDuration(totalDuration);
        }
      }, 1000);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying]);

  const handleSongEnd = useCallback(() => {
    if (loopMode === 'single') {
      playerRef.current?.seekTo(0, true);
      playerRef.current?.playVideo();
    } else if (loopMode === 'playlist') {
      const nextIndex = (currentIndex + 1) % playlist.length;
      onIndexChange(nextIndex);
    } else {
      if (currentIndex < playlist.length - 1) {
        onIndexChange(currentIndex + 1);
      } else {
        setIsPlaying(false);
        onPlayingChange(false);
      }
    }
  }, [loopMode, currentIndex, playlist.length, onIndexChange, onPlayingChange]);

  const handlePlayPause = () => {
    if (!playerRef.current || !currentVideoId) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handlePrevious = () => {
    if (progress > 3) {
      playerRef.current?.seekTo(0, true);
    } else {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      onIndexChange(prevIndex);
    }
  };

  const handleNext = () => {
    const nextIndex = (currentIndex + 1) % playlist.length;
    onIndexChange(nextIndex);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    playerRef.current?.setVolume(newVolume);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = parseFloat(e.target.value);
    setProgress(newProgress);
    playerRef.current?.seekTo(newProgress, true);
  };

  const cycleLoopMode = () => {
    const modes: LoopMode[] = ['none', 'playlist', 'single'];
    const currentModeIndex = modes.indexOf(loopMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    setLoopMode(nextMode);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getLoopIcon = () => {
    if (loopMode === 'single') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          <text x="12" y="14" textAnchor="middle" fontSize="8" fill="currentColor">1</text>
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    );
  };

  if (playlist.length === 0) return null;

  return (
    <>
      {/* Hidden YouTube iframe */}
      <div id="youtube-player" className="fixed -top-[9999px] -left-[9999px] w-[1px] h-[1px] opacity-0 pointer-events-none" />

      {/* Player bar */}
      <div className="fixed bottom-0 left-0 right-0 h-[64px] md:h-[72px] bg-[#0A0A0B]/95 backdrop-blur-xl border-t border-white/10 z-50">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-white/40 transition-all duration-200"
            style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }}
          />
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={progress}
            onChange={handleProgressChange}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="max-w-6xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          {/* Song info (left) */}
          <div className="flex-1 min-w-0">
            {currentSong && (
              <div className="flex items-center gap-3 min-w-0">
                {loadingVideoId && (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin flex-shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-[#F0F0F0] text-sm font-medium truncate">
                    {currentSong.name}
                  </span>
                  <span className="text-[#71717A] text-xs truncate">
                    {currentSong.artist}
                    {loadingVideoId && ' · Cargando...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Playback controls (center) */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevious}
              className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#71717A] hover:text-white transition-colors"
              title="Anterior"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!currentVideoId || !isReady || loadingVideoId}
              className="p-3 min-w-[44px] min-h-[44px] bg-white rounded-full text-[#0A0A0B] hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              title={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={handleNext}
              className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#71717A] hover:text-white transition-colors"
              title="Siguiente"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          {/* Volume and loop (right) */}
          <div className="flex-1 flex items-center justify-end gap-3">
            <span className="text-[#71717A] text-xs hidden sm:block">
              {formatTime(progress)} / {formatTime(duration)}
            </span>

            <button
              onClick={onShuffleToggle}
              className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${
                isShuffled ? 'text-white' : 'text-[#52525B]'
              } hover:text-white`}
              title={isShuffled ? 'Desactivar aleatorio' : 'Activar aleatorio'}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>

            <button
              onClick={cycleLoopMode}
              className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${
                loopMode === 'none' ? 'text-[#52525B]' : 'text-white'
              } hover:text-white`}
              title={loopMode === 'none' ? 'Sin repetir' : loopMode === 'playlist' ? 'Repetir playlist' : 'Repetir canción'}
            >
              {getLoopIcon()}
            </button>

            <div className="hidden sm:flex items-center gap-2">
              <svg className="w-4 h-4 text-[#71717A]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
