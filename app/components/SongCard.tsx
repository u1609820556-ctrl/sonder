'use client';

interface Song {
  name: string;
  artist: string;
  listeners?: number;
}

interface SongCardProps {
  song: Song;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  trackNumber?: number;
  isPlaying?: boolean;
  isCurrentTrack?: boolean;
}

export default function SongCard({
  song,
  selected = false,
  onSelect,
  selectable = true,
  trackNumber,
  isPlaying = false,
  isCurrentTrack = false,
}: SongCardProps) {
  const searchQuery = encodeURIComponent(`${song.artist} ${song.name}`);

  const platforms = [
    {
      name: 'Spotify',
      url: `https://open.spotify.com/search/${searchQuery}`,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      ),
    },
    {
      name: 'YouTube Music',
      url: `https://music.youtube.com/search?q=${searchQuery}`,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/>
        </svg>
      ),
    },
    {
      name: 'Apple Music',
      url: `https://music.apple.com/search?term=${searchQuery}`,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.8.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.785-.455-2.105-1.392-.227-.665-.096-1.3.395-1.84.376-.41.863-.645 1.405-.782.39-.1.79-.157 1.185-.236.276-.055.554-.104.823-.194.147-.05.255-.143.303-.3.026-.084.04-.173.04-.26V8.923c0-.2-.07-.307-.262-.354-.357-.086-.717-.166-1.076-.248l-2.58-.596-2.143-.494c-.1-.023-.204-.04-.308-.042-.158-.003-.26.076-.287.238-.013.077-.02.156-.02.234v7.837c0 .378-.044.752-.192 1.105-.26.623-.71 1.053-1.338 1.283-.39.143-.8.21-1.217.23-.86.04-1.62-.32-2.035-1.15-.296-.593-.27-1.2.07-1.778.236-.4.59-.676 1.006-.878.478-.232.987-.357 1.503-.46.354-.07.712-.12 1.058-.214.252-.07.472-.18.608-.42.078-.138.117-.29.117-.45V5.946c0-.198.04-.387.134-.564.138-.257.373-.388.644-.44.18-.035.363-.06.546-.09l3.053-.605 2.47-.492 1.24-.247c.112-.02.227-.033.34-.033.22 0 .377.106.424.326.023.11.034.224.034.336v5.313z"/>
        </svg>
      ),
    },
    {
      name: 'YouTube',
      url: `https://youtube.com/results?search_query=${searchQuery}`,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
    },
  ];

  // Playing indicator animation
  const PlayingIndicator = () => (
    <div className="flex items-center gap-[2px] h-4">
      <span className="w-[3px] h-full bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
      <span className="w-[3px] h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
      <span className="w-[3px] h-full bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
    </div>
  );

  // Playlist view with track number
  if (trackNumber !== undefined) {
    return (
      <div
        onClick={onSelect}
        className={`card p-4 flex items-center gap-4 cursor-pointer ${isCurrentTrack ? 'border-white/30' : ''}`}
      >
        <div className="w-8 flex justify-center">
          {isCurrentTrack && isPlaying ? (
            <PlayingIndicator />
          ) : (
            <span className="font-[family-name:var(--font-syne)] text-2xl font-bold text-[#27272A] text-right">
              {trackNumber}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[#F0F0F0] truncate">{song.name}</h3>
          <p className="text-sm text-[#71717A] truncate">{song.artist}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {platforms.map((platform) => (
            <a
              key={platform.name}
              href={platform.url}
              target="_blank"
              rel="noopener noreferrer"
              title={platform.name}
              className="p-2 rounded-lg text-[#52525B] hover:text-[#F0F0F0] transition-colors"
            >
              {platform.icon}
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Search results / selection view
  return (
    <div
      onClick={selectable ? onSelect : undefined}
      className={`card p-4 ${selectable ? 'cursor-pointer' : ''} ${
        selected ? 'card-selected' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[#F0F0F0] truncate">{song.name}</h3>
          <p className="text-sm text-[#71717A] truncate">{song.artist}</p>
          {song.listeners !== undefined && (
            <p className="text-xs text-[#52525B] mt-1">
              {song.listeners.toLocaleString()} oyentes
            </p>
          )}
        </div>
        {selectable && (
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200 ${
              selected
                ? 'bg-white border-white'
                : 'border-[#52525B]'
            }`}
          >
            {selected && (
              <svg className="w-3 h-3 text-[#0A0A0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
