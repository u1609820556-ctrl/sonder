'use client';

import { useState, useEffect, useRef } from 'react';
import Stepper from './components/Stepper';
import SearchInput from './components/SearchInput';
import SongCard from './components/SongCard';
import Player from './components/Player';

interface Song {
  name: string;
  artist: string;
  listeners?: number;
  isLoading?: boolean;
  isNew?: boolean;
}

interface Question {
  id: number;
  text: string;
  options?: string[];
}

interface Answer {
  questionId: number;
  answer: string;
  extra?: string;
}

interface SubstituteContext {
  mode: 'cara-a' | 'cara-b';
  // Cara A:
  seedSongs?: { title: string; artist: string }[];
  answers?: string[];
  analysis?: string;
  // Cara B:
  intention?: string;
}

interface DiscardPopup {
  songIndex: number;
  song: { title: string; artist: string };
}

type AppMode = 'modeA' | 'modeB';
type LoadingState = 'idle' | 'searching' | 'analyzing' | 'generating' | 'discovering' | 'refining';

const STEPS_MODE_A = ['Buscar', 'Preguntas', 'Playlist'];
const STEPS_MODE_B = ['Intención', 'Playlist'];
const PLAYLIST_SIZES = [10, 20, 30, 50];
const MAX_INTENTION_LENGTH = 300;

export default function Home() {
  // Mode state
  const [mode, setMode] = useState<AppMode>('modeA');

  // Mode A states
  const [step, setStep] = useState(0);
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [includeSeedSongs, setIncludeSeedSongs] = useState(false);

  // Mode B states
  const [stepB, setStepB] = useState(0);
  const [intention, setIntention] = useState('');
  const [genres, setGenres] = useState('');
  const [referenceSongs, setReferenceSongs] = useState<Song[]>([]);
  const [refSearchResults, setRefSearchResults] = useState<Song[]>([]);
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [refSongsExpanded, setRefSongsExpanded] = useState(false);

  // Shared states
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [playlistSize, setPlaylistSize] = useState(20);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [refineText, setRefineText] = useState('');
  const [error, setError] = useState('');
  const [errorRetryAction, setErrorRetryAction] = useState<(() => void) | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [originalPlaylist, setOriginalPlaylist] = useState<Song[]>([]);
  const [noResults, setNoResults] = useState(false);

  // Substitute context
  const [substituteContext, setSubstituteContext] = useState<SubstituteContext | null>(null);

  // Discard popup for Cara B
  const [discardPopup, setDiscardPopup] = useState<DiscardPopup | null>(null);
  const discardPopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loading = loadingState !== 'idle';

  // Switch mode and reset
  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Reset all states
    setStep(0);
    setStepB(0);
    setSearchResults([]);
    setSelectedSongs([]);
    setQuestions([]);
    setAnswers([]);
    setAnalysis('');
    setIncludeSeedSongs(false);
    setIntention('');
    setGenres('');
    setReferenceSongs([]);
    setRefSearchResults([]);
    setGenresExpanded(false);
    setRefSongsExpanded(false);
    setPlaylist([]);
    setPlaylistSize(20);
    setRefineText('');
    setError('');
    setErrorRetryAction(null);
    setNoResults(false);
    setCurrentTrackIndex(0);
    setIsPlaying(false);
    setIsShuffled(false);
    setOriginalPlaylist([]);
    setSubstituteContext(null);
    setDiscardPopup(null);
  };

  // Clear discard popup timeout on unmount
  useEffect(() => {
    return () => {
      if (discardPopupTimeoutRef.current) {
        clearTimeout(discardPopupTimeoutRef.current);
      }
    };
  }, []);

  // Mode A handlers
  const handleSearch = async (query: string) => {
    setLoadingState('searching');
    setError('');
    setErrorRetryAction(null);
    setNoResults(false);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.tracks || data.tracks.length === 0) {
        setNoResults(true);
        setSearchResults([]);
      } else {
        setSearchResults(data.tracks);
      }
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      setError(isNetwork ? 'Sin conexión, comprueba tu internet' : 'No hemos encontrado canciones con ese nombre, prueba con otro término');
    } finally {
      setLoadingState('idle');
    }
  };

  const toggleSong = (song: Song) => {
    setSelectedSongs((prev) => {
      const exists = prev.some(
        (s) => s.name === song.name && s.artist === song.artist
      );
      if (exists) {
        return prev.filter(
          (s) => !(s.name === song.name && s.artist === song.artist)
        );
      }
      if (prev.length >= 10) return prev;
      return [...prev, song];
    });
  };

  const handleContinueToQuestions = async () => {
    if (selectedSongs.length === 0) return;
    setLoadingState('analyzing');
    setError('');
    setErrorRetryAction(null);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: selectedSongs }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis || '');
      setQuestions(data.questions);
      setAnswers(data.questions.map((q: Question) => ({ questionId: q.id, answer: '', extra: '' })));
      setStep(1);
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      setError(isNetwork ? 'Sin conexión, comprueba tu internet' : 'Algo ha ido mal generando las preguntas');
      setErrorRetryAction(() => handleContinueToQuestions);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleAnswerChange = (questionId: number, answer: string) => {
    setAnswers((prev) =>
      prev.map((a) => (a.questionId === questionId ? { ...a, answer } : a))
    );
  };

  const handleExtraChange = (questionId: number, extra: string) => {
    setAnswers((prev) =>
      prev.map((a) => (a.questionId === questionId ? { ...a, extra } : a))
    );
  };

  const handleGeneratePlaylist = async () => {
    setLoadingState('generating');
    setError('');
    setErrorRetryAction(null);
    try {
      const combinedAnswers = answers.map(a => ({
        questionId: a.questionId,
        answer: a.extra ? `${a.answer}. Adicional: ${a.extra}` : a.answer
      }));
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songs: selectedSongs,
          questions,
          answers: combinedAnswers,
          analysis,
          playlistSize,
          includeSeed: includeSeedSongs,
          seedSongs: includeSeedSongs ? selectedSongs : [],
        }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.playlist || data.playlist.length === 0) {
        throw new Error('empty');
      }
      setPlaylist(data.playlist);
      setOriginalPlaylist(data.playlist);
      setIsShuffled(false);
      // Save substitute context for Cara A
      setSubstituteContext({
        mode: 'cara-a',
        seedSongs: selectedSongs.map(s => ({ title: s.name, artist: s.artist })),
        answers: combinedAnswers.map(a => a.answer),
        analysis: analysis,
      });
      setStep(2);
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      const isEmpty = err instanceof Error && err.message === 'empty';
      if (isNetwork) {
        setError('Sin conexión, comprueba tu internet');
      } else if (isEmpty) {
        setError('No hemos encontrado canciones para este vibe, prueba con otras canciones de base');
      } else {
        setError('Algo ha ido mal generando la playlist');
      }
      setErrorRetryAction(() => handleGeneratePlaylist);
    } finally {
      setLoadingState('idle');
    }
  };

  // Mode B handlers
  const handleRefSearch = async (query: string) => {
    setLoadingState('searching');
    setError('');
    setErrorRetryAction(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRefSearchResults(data.tracks || []);
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      setError(isNetwork ? 'Sin conexión, comprueba tu internet' : 'No hemos encontrado canciones con ese nombre');
    } finally {
      setLoadingState('idle');
    }
  };

  const toggleReferenceSong = (song: Song) => {
    setReferenceSongs((prev) => {
      const exists = prev.some(
        (s) => s.name === song.name && s.artist === song.artist
      );
      if (exists) {
        return prev.filter(
          (s) => !(s.name === song.name && s.artist === song.artist)
        );
      }
      if (prev.length >= 3) return prev;
      return [...prev, song];
    });
  };

  const handleDiscover = async (surpriseMode: boolean = false) => {
    if (!intention.trim()) return;
    setLoadingState(surpriseMode ? 'discovering' : 'generating');
    setError('');
    setErrorRetryAction(null);
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intention: intention.trim().slice(0, MAX_INTENTION_LENGTH),
          genres: surpriseMode ? undefined : (genres.trim() || undefined),
          referenceSongs: surpriseMode ? undefined : (referenceSongs.length > 0 ? referenceSongs : undefined),
          playlistSize,
          surpriseMode,
        }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.playlist || data.playlist.length === 0) {
        throw new Error('empty');
      }
      setPlaylist(data.playlist);
      setOriginalPlaylist(data.playlist);
      setIsShuffled(false);
      // Save substitute context for Cara B
      setSubstituteContext({
        mode: 'cara-b',
        intention: intention.trim(),
      });
      setStepB(1);
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      const isEmpty = err instanceof Error && err.message === 'empty';
      if (isNetwork) {
        setError('Sin conexión, comprueba tu internet');
      } else if (isEmpty) {
        setError('No hemos encontrado canciones para este vibe, prueba con otra intención');
      } else {
        setError('Algo ha ido mal generando la playlist');
      }
      setErrorRetryAction(() => () => handleDiscover(surpriseMode));
    } finally {
      setLoadingState('idle');
    }
  };

  // Shared handlers
  const handleRefine = async () => {
    if (!refineText.trim()) return;
    setLoadingState('refining');
    setError('');
    setErrorRetryAction(null);
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seeds: mode === 'modeA' ? selectedSongs : referenceSongs,
          currentPlaylist: playlist,
          feedback: refineText,
          playlistSize,
        }),
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlaylist(data.playlist);
      setOriginalPlaylist(data.playlist);
      setRefineText('');
    } catch (err) {
      const isNetwork = err instanceof Error && (err.message === 'network' || err.message.includes('fetch'));
      setError(isNetwork ? 'Sin conexión, comprueba tu internet' : 'Algo ha ido mal refinando la playlist');
      setErrorRetryAction(() => handleRefine);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleStartOver = () => {
    if (mode === 'modeA') {
      setStep(0);
      setSearchResults([]);
      setSelectedSongs([]);
      setQuestions([]);
      setAnswers([]);
      setAnalysis('');
      setIncludeSeedSongs(false);
    } else {
      setStepB(0);
      setIntention('');
      setGenres('');
      setReferenceSongs([]);
      setRefSearchResults([]);
      setGenresExpanded(false);
      setRefSongsExpanded(false);
    }
    setPlaylist([]);
    setPlaylistSize(20);
    setRefineText('');
    setError('');
    setErrorRetryAction(null);
    setNoResults(false);
    setCurrentTrackIndex(0);
    setIsPlaying(false);
    setIsShuffled(false);
    setOriginalPlaylist([]);
  };

  const handleTrackSelect = (index: number) => {
    setCurrentTrackIndex(index);
  };

  // Swipe discard handler
  const handleSwipeDiscard = async (
    discardedSong: { title: string; artist: string },
    discardReason?: 'no-moment' | 'no-style'
  ) => {
    if (!substituteContext) return;

    // Find the index of the discarded song
    const songIndex = playlist.findIndex(
      s => s.name === discardedSong.title && s.artist === discardedSong.artist
    );
    if (songIndex === -1) return;

    // Mark the song as loading
    setPlaylist(prev => prev.map((s, i) =>
      i === songIndex ? { ...s, isLoading: true } : s
    ));

    // Clear any existing popup
    setDiscardPopup(null);
    if (discardPopupTimeoutRef.current) {
      clearTimeout(discardPopupTimeoutRef.current);
    }

    try {
      // Build current playlist without discarded song
      const currentPlaylistForApi = playlist
        .filter((_, i) => i !== songIndex)
        .map(s => ({ title: s.name, artist: s.artist }));

      const res = await fetch('/api/substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: substituteContext.mode,
          discardedSong,
          currentPlaylist: currentPlaylistForApi,
          seedSongs: substituteContext.seedSongs,
          answers: substituteContext.answers,
          analysis: substituteContext.analysis,
          intention: substituteContext.intention,
          discardReason,
        }),
      });

      if (!res.ok) throw new Error('network');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Replace the loading song with the new one (with isNew animation flag)
      setPlaylist(prev => prev.map((s, i) =>
        i === songIndex ? { name: data.song.name, artist: data.song.artist, isNew: true } : s
      ));

      // Remove isNew flag after animation
      setTimeout(() => {
        setPlaylist(prev => prev.map((s, i) =>
          i === songIndex ? { ...s, isNew: false } : s
        ));
      }, 300);

      // Update original playlist too
      setOriginalPlaylist(prev => prev.map((s, i) => {
        const origIndex = prev.findIndex(
          os => os.name === discardedSong.title && os.artist === discardedSong.artist
        );
        return i === origIndex ? { name: data.song.name, artist: data.song.artist } : s;
      }));

      // If the discarded song was playing, start playing the new one
      if (songIndex === currentTrackIndex && isPlaying) {
        // The player will pick up the new song automatically since currentTrackIndex stays the same
      }
    } catch (err) {
      console.error('Error substituting song:', err);
      // Remove loading state on error
      setPlaylist(prev => prev.map((s, i) =>
        i === songIndex ? { ...s, isLoading: false } : s
      ));
      setError('No se pudo sustituir la canción, inténtalo de nuevo');
    }
  };

  // Handle swipe initiation (shows popup for Cara B)
  const handleSwipeInit = (song: { title: string; artist: string }) => {
    const songIndex = playlist.findIndex(
      s => s.name === song.title && s.artist === song.artist
    );
    if (songIndex === -1) return;

    if (substituteContext?.mode === 'cara-b') {
      // Show popup for Cara B
      setDiscardPopup({ songIndex, song });

      // Auto-dismiss after 5 seconds
      if (discardPopupTimeoutRef.current) {
        clearTimeout(discardPopupTimeoutRef.current);
      }
      const capturedSong = song;
      const capturedIndex = songIndex;
      discardPopupTimeoutRef.current = setTimeout(() => {
        setDiscardPopup(currentPopup => {
          if (currentPopup?.songIndex === capturedIndex) {
            handleSwipeDiscard(capturedSong);
            return null;
          }
          return currentPopup;
        });
      }, 5000);
    } else {
      // Cara A: direct substitution
      handleSwipeDiscard(song);
    }
  };

  // Handle popup button click
  const handleDiscardReasonSelect = (reason: 'no-moment' | 'no-style') => {
    if (!discardPopup) return;
    if (discardPopupTimeoutRef.current) {
      clearTimeout(discardPopupTimeoutRef.current);
    }
    handleSwipeDiscard(discardPopup.song, reason);
    setDiscardPopup(null);
  };

  const shufflePlaylist = () => {
    if (isShuffled) {
      setPlaylist(originalPlaylist);
      setCurrentTrackIndex(0);
      setIsShuffled(false);
    } else {
      const currentSong = playlist[currentTrackIndex];
      const shuffled = [...playlist];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const newIndex = shuffled.findIndex(
        s => s.name === currentSong.name && s.artist === currentSong.artist
      );
      setPlaylist(shuffled);
      setCurrentTrackIndex(newIndex >= 0 ? newIndex : 0);
      setIsShuffled(true);
    }
  };

  // Determine if we're showing playlist
  const showingPlaylist = (mode === 'modeA' && step === 2) || (mode === 'modeB' && stepB === 1);

  // Check if all questions have answers (for Mode A validation)
  const allQuestionsAnswered = answers.every(a => a.answer.trim() !== '');
  const unansweredCount = answers.filter(a => a.answer.trim() === '').length;

  return (
    <main className="min-h-screen">
      <div className="noise-overlay" />

      <div className="max-w-xl mx-auto px-4 py-14">
        {/* Header */}
        <div className="text-center mb-6 animate-fade-in">
          <h1 className="font-[family-name:var(--font-syne)] text-[2.5rem] font-bold text-[#F0F0F0] mb-1">
            Sonder
          </h1>
          <p className="text-[#71717A] text-sm">
            Descubre música que resuena contigo
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={() => handleModeChange('modeA')}
            className={`px-6 min-h-[44px] py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              mode === 'modeA'
                ? 'border-[rgba(239,68,68,0.4)] text-white bg-[rgba(239,68,68,0.06)]'
                : 'border-[rgba(255,255,255,0.07)] text-[#71717A] bg-transparent hover:text-white'
            }`}
          >
            {mode === 'modeA' && <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />}
            Cara A
          </button>
          <button
            onClick={() => handleModeChange('modeB')}
            className={`px-6 min-h-[44px] py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              mode === 'modeB'
                ? 'border-[rgba(59,130,246,0.4)] text-white bg-[rgba(59,130,246,0.06)]'
                : 'border-[rgba(255,255,255,0.07)] text-[#71717A] bg-transparent hover:text-white'
            }`}
          >
            {mode === 'modeB' && <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />}
            Cara B
          </button>
        </div>

        {/* Stepper */}
        {mode === 'modeA' ? (
          <Stepper currentStep={step} steps={STEPS_MODE_A} accentColor="red" />
        ) : (
          <Stepper currentStep={stepB} steps={STEPS_MODE_B} accentColor="blue" />
        )}

        {error && (
          <div className="mb-5 p-3.5 card border-red-500/20 text-red-400 text-sm animate-fade-in flex items-center justify-between gap-3">
            <span>{error}</span>
            {errorRetryAction && (
              <button
                onClick={() => {
                  setError('');
                  errorRetryAction();
                }}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors whitespace-nowrap"
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        {/* Loading overlay for generating states */}
        {(loadingState === 'analyzing' || loadingState === 'generating' || loadingState === 'discovering' || loadingState === 'refining') && (
          <div className="mb-5 p-5 card animate-fade-in flex flex-col items-center justify-center gap-3">
            <div className={`w-6 h-6 rounded-full border-2 border-t-transparent animate-spin ${mode === 'modeA' ? 'border-[#EF4444]' : 'border-[#3B82F6]'}`} />
            <span className="text-[#71717A] text-sm text-center">
              {loadingState === 'analyzing' && 'Analizando tus canciones...'}
              {loadingState === 'generating' && 'Creando tu playlist...'}
              {loadingState === 'discovering' && 'Dejándote sorprender...'}
              {loadingState === 'refining' && 'Refinando tu playlist...'}
            </span>
          </div>
        )}

        {/* ========== MODE A ========== */}
        {mode === 'modeA' && (
          <>
            {/* Step 0: Search */}
            {step === 0 && (
              <div className="space-y-5">
                <SearchInput onSearch={handleSearch} loading={loading} />

                {selectedSongs.length > 0 && (
                  <div className="card p-4 animate-fade-in">
                    <div className="flex items-center justify-between mb-3">
                      <span className="section-label">
                        Seleccionadas ({selectedSongs.length}/10)
                      </span>
                      <button
                        onClick={handleContinueToQuestions}
                        disabled={loading}
                        className="btn px-4 py-2 text-sm font-medium"
                      >
                        {loading ? 'Cargando...' : 'Continuar'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSongs.map((song) => (
                        <span
                          key={`${song.name}-${song.artist}`}
                          className="px-2.5 py-1 rounded-md bg-white/5 text-[#E2E8F0] text-sm flex items-center gap-1.5 border border-white/10"
                        >
                          {song.name}
                          <button
                            onClick={() => toggleSong(song)}
                            className="text-[#71717A] hover:text-white transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {loadingState === 'searching' && (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="card p-4 animate-pulse">
                        <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-white/5 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                )}

                {noResults && !loading && (
                  <p className="text-[#71717A] text-sm text-center py-6">
                    No hemos encontrado canciones con ese nombre, prueba con otro término
                  </p>
                )}

                {searchResults.length > 0 && !loading && (
                  <div className="space-y-2.5">
                    <span className="section-label">Resultados</span>
                    <div className="space-y-2">
                      {searchResults.map((song, index) => (
                        <div
                          key={`${song.name}-${song.artist}`}
                          className={`animate-fade-in stagger-${Math.min(index + 1, 10)}`}
                        >
                          <SongCard
                            song={song}
                            selected={selectedSongs.some(
                              (s) => s.name === song.name && s.artist === song.artist
                            )}
                            onSelect={() => toggleSong(song)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Questions */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-[#F0F0F0] mb-1">
                    Cuéntanos más sobre tu vibe
                  </h2>
                  <p className="text-[#71717A] text-sm">
                    Responde estas preguntas para personalizar tu playlist
                  </p>
                </div>

                <div className="space-y-4">
                  {questions.map((question, qIndex) => (
                    <div
                      key={question.id}
                      className={`card p-4 animate-fade-in stagger-${Math.min(qIndex + 1, 10)}`}
                    >
                      <label className="block text-[#F0F0F0] mb-3 font-medium text-[0.95rem]">
                        {question.text}
                      </label>
                      {question.options && question.options.length > 0 ? (
                        <div className="space-y-2">
                          {question.options
                            .filter(opt => !opt.toLowerCase().includes('otra cosa') && !opt.toLowerCase().includes('otro'))
                            .map((option, idx) => {
                              const currentAnswer = answers.find((a) => a.questionId === question.id)?.answer || '';
                              const isSelected = currentAnswer === option;

                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleAnswerChange(question.id, option)}
                                  className={`w-full text-left px-5 py-4 rounded-xl transition-all duration-200 flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-white/8 border border-white/30 text-[#F0F0F0]'
                                      : 'card text-[#A1A1AA] hover:text-[#F0F0F0]'
                                  }`}
                                >
                                  <span>{option}</span>
                                  {isSelected && (
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          <textarea
                            value={answers.find((a) => a.questionId === question.id)?.extra || ''}
                            onChange={(e) => handleExtraChange(question.id, e.target.value)}
                            placeholder="¿Algo más que añadir?"
                            rows={2}
                            className="input w-full px-4 py-3 mt-1 text-sm resize-none"
                          />
                        </div>
                      ) : (
                        <textarea
                          value={answers.find((a) => a.questionId === question.id)?.answer || ''}
                          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                          placeholder="Tu respuesta..."
                          rows={3}
                          className="input w-full px-4 py-3 resize-none"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="card p-4">
                  <span className="section-label block mb-3">
                    Tamaño de la playlist
                  </span>
                  <div className="flex gap-2">
                    {PLAYLIST_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => setPlaylistSize(size)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          playlistSize === size
                            ? 'bg-white text-[#0A0A0B]'
                            : 'card text-[#71717A] hover:text-[#F0F0F0]'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#A1A1AA] text-sm">
                    Incluir mis canciones en la playlist
                  </span>
                  <button
                    onClick={() => setIncludeSeedSongs(!includeSeedSongs)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      includeSeedSongs ? 'bg-white' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform duration-200 ${
                        includeSeedSongs ? 'translate-x-5 bg-[#0A0A0B]' : 'translate-x-0 bg-[#52525B]'
                      }`}
                    />
                  </button>
                </div>

                {!allQuestionsAnswered && (
                  <p className="text-[#71717A] text-sm text-center">
                    {unansweredCount === 1 ? 'Falta 1 pregunta por responder' : `Faltan ${unansweredCount} preguntas por responder`}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(0)}
                    className="flex-1 min-h-[44px] py-3 card text-[#71717A] hover:text-[#F0F0F0] font-medium transition-colors"
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleGeneratePlaylist}
                    disabled={loading || !allQuestionsAnswered}
                    className="flex-1 min-h-[44px] py-3 btn font-medium disabled:opacity-40"
                  >
                    {loading ? 'Generando...' : 'Generar Playlist'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Playlist (Mode A) */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in pb-24">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-[#F0F0F0] mb-1">
                    Tu Playlist
                  </h2>
                  <p className="text-[#71717A] text-sm">
                    {playlist.length} canciones curadas para ti
                  </p>
                </div>

                <div className="space-y-2">
                  {playlist.map((song, index) => (
                    <div
                      key={`${song.name}-${song.artist}-${index}`}
                      className={`${song.isNew ? 'song-enter' : ''} ${!song.isNew ? `animate-fade-in stagger-${Math.min(index + 1, 10)}` : ''}`}
                      style={song.isNew ? {
                        animation: 'songEnter 0.3s ease-out forwards',
                      } : undefined}
                    >
                      <SongCard
                        song={song}
                        trackNumber={index + 1}
                        selectable={false}
                        isCurrentTrack={index === currentTrackIndex}
                        isPlaying={isPlaying}
                        onSelect={() => handleTrackSelect(index)}
                        onSwipeDiscard={handleSwipeInit}
                        isLoading={song.isLoading}
                        mode="cara-a"
                      />
                    </div>
                  ))}
                </div>

                <div className="card p-4">
                  <span className="section-label block mb-3">
                    Refinar playlist
                  </span>
                  <textarea
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder="Ej: 'Más canciones movidas' o 'Menos electrónica, más acústico'"
                    rows={3}
                    className="input w-full px-4 py-3 resize-none mb-3"
                  />
                  <button
                    onClick={handleRefine}
                    disabled={loading || !refineText.trim()}
                    className="w-full min-h-[44px] py-3 btn font-medium"
                  >
                    {loadingState === 'refining' ? 'Refinando tu playlist...' : 'Refinar Playlist'}
                  </button>
                </div>

                <button
                  onClick={handleStartOver}
                  className="w-full min-h-[44px] py-3 card text-[#71717A] hover:text-[#F0F0F0] font-medium transition-colors"
                >
                  Empezar de nuevo
                </button>
              </div>
            )}
          </>
        )}

        {/* ========== MODE B ========== */}
        {mode === 'modeB' && (
          <>
            {/* Step 0: Intention */}
            {stepB === 0 && (
              <div className="space-y-5 animate-fade-in">
                {/* Main intention field */}
                <div className="card p-5">
                  <label className="block text-[#F0F0F0] mb-3 font-medium">
                    ¿Para qué momento es esta playlist?
                  </label>
                  <textarea
                    value={intention}
                    onChange={(e) => setIntention(e.target.value.slice(0, MAX_INTENTION_LENGTH))}
                    placeholder="Esta noche conduciendo solo, para entrenar, para una tarde de domingo sin planes..."
                    rows={4}
                    className="input w-full px-4 py-3 resize-none text-base"
                  />
                  {intention.length > 200 && (
                    <p className={`text-xs mt-2 text-right ${intention.length >= MAX_INTENTION_LENGTH ? 'text-red-400' : 'text-[#52525B]'}`}>
                      {intention.length}/{MAX_INTENTION_LENGTH}
                    </p>
                  )}
                </div>

                {/* Action buttons row */}
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setGenresExpanded(!genresExpanded)}
                    className="px-4 py-2.5 rounded-lg border border-white/10 text-[#52525B] hover:text-[#A1A1AA] text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    Género y canciones (opcional)
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${genresExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDiscover(true)}
                    disabled={loading || !intention.trim()}
                    className={`px-5 min-h-[44px] py-2.5 rounded-lg font-medium transition-all duration-200 bg-[#3B82F6] hover:bg-[#60A5FA] text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      genres.trim() || referenceSongs.length > 0
                        ? 'opacity-0 pointer-events-none'
                        : 'opacity-100'
                    }`}
                  >
                    <span>✦</span>
                    {loadingState === 'discovering' ? 'Dejándote sorprender...' : 'Sorpréndeme'}
                  </button>
                </div>

                {/* Collapsible sections */}
                {genresExpanded && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Genres */}
                    <div className="card p-4">
                      <label className="block text-[#A1A1AA] text-sm mb-2">
                        ¿Algún género en mente?
                      </label>
                      <input
                        type="text"
                        value={genres}
                        onChange={(e) => setGenres(e.target.value)}
                        placeholder="Rock, jazz, electrónica, mezcla..."
                        className="input w-full px-4 py-3"
                      />
                      <p className="text-[#52525B] text-xs mt-2">
                        Si lo dejas vacío, la IA elige por ti
                      </p>
                    </div>

                    {/* Reference songs */}
                    <div className="card p-4">
                      <label className="block text-[#A1A1AA] text-sm mb-2">
                        ¿Alguna canción de referencia? (máx. 3)
                      </label>

                      {referenceSongs.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {referenceSongs.map((song) => (
                            <span
                              key={`${song.name}-${song.artist}`}
                              className="px-2.5 py-1 rounded-md bg-white/5 text-[#E2E8F0] text-sm flex items-center gap-1.5 border border-white/10"
                            >
                              {song.name}
                              <button
                                onClick={() => toggleReferenceSong(song)}
                                className="text-[#71717A] hover:text-white transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <SearchInput onSearch={handleRefSearch} loading={loading} placeholder="Buscar canción de referencia..." />

                      {refSearchResults.length > 0 && (
                        <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
                          {refSearchResults.slice(0, 5).map((song) => (
                            <SongCard
                              key={`${song.name}-${song.artist}`}
                              song={song}
                              selected={referenceSongs.some(
                                (s) => s.name === song.name && s.artist === song.artist
                              )}
                              onSelect={() => toggleReferenceSong(song)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Playlist size */}
                <div className="card p-4">
                  <span className="section-label block mb-3">
                    Tamaño de la playlist
                  </span>
                  <div className="flex gap-2">
                    {PLAYLIST_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => setPlaylistSize(size)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          playlistSize === size
                            ? 'bg-[#3B82F6] text-white'
                            : 'card text-[#71717A] hover:text-[#F0F0F0]'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CTA - Crear playlist */}
                <button
                  onClick={() => handleDiscover(false)}
                  disabled={loading || !intention.trim()}
                  className="w-full min-h-[44px] py-4 rounded-xl font-medium transition-all duration-200 bg-[#3B82F6] hover:bg-[#2563EB] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loadingState === 'generating' ? 'Creando tu playlist...' : 'Crear playlist'}
                </button>
              </div>
            )}

            {/* Step 1: Playlist (Mode B) */}
            {stepB === 1 && (
              <div className="space-y-5 animate-fade-in pb-24">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-[#F0F0F0] mb-1">
                    Tu Playlist
                  </h2>
                  <p className="text-[#71717A] text-sm">
                    {playlist.length} canciones para ti
                  </p>
                </div>

                <div className="space-y-2">
                  {playlist.map((song, index) => (
                    <div
                      key={`${song.name}-${song.artist}-${index}`}
                      className={`${song.isNew ? 'song-enter' : ''} ${!song.isNew ? `animate-fade-in stagger-${Math.min(index + 1, 10)}` : ''}`}
                      style={song.isNew ? {
                        animation: 'songEnter 0.3s ease-out forwards',
                      } : undefined}
                    >
                      <SongCard
                        song={song}
                        trackNumber={index + 1}
                        selectable={false}
                        isCurrentTrack={index === currentTrackIndex}
                        isPlaying={isPlaying}
                        onSelect={() => handleTrackSelect(index)}
                        onSwipeDiscard={handleSwipeInit}
                        isLoading={song.isLoading}
                        mode="cara-b"
                      />
                      {/* Discard reason popup for Cara B */}
                      {discardPopup?.songIndex === index && (
                        <div
                          className="mt-2 p-3 rounded-lg border border-white/10 bg-[rgba(10,10,11,0.95)] backdrop-blur-sm animate-fade-in-fast"
                          style={{ animation: 'fadeInFast 0.15s ease-out forwards' }}
                        >
                          <p className="text-[#A1A1AA] text-sm mb-2.5">¿Por qué la descartas?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDiscardReasonSelect('no-moment')}
                              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[#E2E8F0] text-xs font-medium hover:bg-white/10 transition-colors"
                            >
                              No encaja con el momento
                            </button>
                            <button
                              onClick={() => handleDiscardReasonSelect('no-style')}
                              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[#E2E8F0] text-xs font-medium hover:bg-white/10 transition-colors"
                            >
                              No es mi estilo
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="card p-4">
                  <span className="section-label block mb-3">
                    Refinar playlist
                  </span>
                  <textarea
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder="Ej: 'Más canciones movidas' o 'Menos electrónica, más acústico'"
                    rows={3}
                    className="input w-full px-4 py-3 resize-none mb-3"
                  />
                  <button
                    onClick={handleRefine}
                    disabled={loading || !refineText.trim()}
                    className="w-full min-h-[44px] py-3 rounded-xl font-medium transition-all duration-200 bg-[#3B82F6] hover:bg-[#2563EB] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loadingState === 'refining' ? 'Refinando tu playlist...' : 'Refinar Playlist'}
                  </button>
                </div>

                <button
                  onClick={handleStartOver}
                  className="w-full min-h-[44px] py-3 card text-[#71717A] hover:text-[#F0F0F0] font-medium transition-colors"
                >
                  Empezar de nuevo
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Song enter animation styles */}
      <style jsx global>{`
        @keyframes songEnter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeInFast {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in-fast {
          animation: fadeInFast 0.15s ease-out forwards;
        }
      `}</style>

      {/* Player */}
      {showingPlaylist && playlist.length > 0 && (
        <Player
          playlist={playlist}
          currentIndex={currentTrackIndex}
          onIndexChange={setCurrentTrackIndex}
          onPlayingChange={setIsPlaying}
          isShuffled={isShuffled}
          onShuffleToggle={shufflePlaylist}
        />
      )}
    </main>
  );
}
