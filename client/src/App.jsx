import React, { useState, useEffect, useRef } from 'react';
import { Upload, Music, Sparkles, TrendingUp, Play, Pause, SkipForward, Loader2, RefreshCw, Trash2, CheckCircle, AlertTriangle, X, Repeat } from 'lucide-react';


// A self-contained Notification component for a better UX than alert()
const Notification = ({ message, type, onDismiss }) => {
  if (!message) return null;

  const styles = {
    success: {
      icon: <CheckCircle className="text-green-500" />,
      bar: 'bg-green-500',
    },
    error: {
      icon: <AlertTriangle className="text-red-500" />,
      bar: 'bg-red-500',
    },
  };

  return (
    <div className="fixed top-5 right-5 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-white flex items-center max-w-sm animate-fade-in-down">
      <div className={`w-2 h-full rounded-l-lg ${styles[type]?.bar || 'bg-gray-500'}`}></div>
      <div className="p-4 flex items-center gap-4">
        {styles[type]?.icon}
        <span>{message}</span>
        <button onClick={onDismiss} className="ml-auto p-1 rounded-full hover:bg-gray-700"><X size={18} /></button>
      </div>
    </div>
  );
};

const App = () => {
  const [libraryTracks, setLibraryTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState({
    currentTime: 0,
    duration: 0,
  });
  const [isLooping, setIsLooping] = useState(false); // State for playlist loop
  const [moodPrompt, setMoodPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // To track which track is being deleted
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [activeTab, setActiveTab] = useState('upload');
  
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  // Use environment variable for the API URL, with a fallback for development
  // Build API base URL
  const raw = import.meta.env.VITE_API_URL || "http://localhost:3003";

    // Normalize it (remove trailing slash if user accidentally added one)
  const API_BASE = raw.replace(/\/+$/, "");

  // Final API prefix
   const API_URL = `${API_BASE}/api`;

  

  // --- Notification Handler ---
  const notificationTimeoutRef = useRef(null);
  const showNotification = (message, type = 'success') => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ message, type });
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 4000); // Auto-dismiss after 4 seconds
  };

  // Fetch all tracks
  const fetchTracks = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/tracks`);
      if (!response.ok) throw new Error('Failed to fetch tracks');
      const data = await response.json();
      setLibraryTracks(data);
    } catch (error) {
      console.error('Error fetching tracks:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch all playlists
  const fetchPlaylists = async () => {
    try {
      const response = await fetch(`${API_URL}/playlists`);
      const data = await response.json();
      setPlaylists(data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  // Fetch top tracks
  const fetchTopTracks = async () => {
    try {
      const response = await fetch(`${API_URL}/stats/top-tracks`);
      if (!response.ok) throw new Error('Failed to fetch top tracks');
      const data = await response.json();
      setTopTracks(data);
    } catch (error) {
      console.error('Error fetching top tracks:', error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    
    for (let i = 0; i < files.length; i++) {
      formData.append('music', files[i]);
    }

    try {
      const response = await fetch(`${API_URL}/tracks/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        await fetchTracks();
        setActiveTab('upload'); // Stay on upload tab to see new tracks
        showNotification('Files uploaded successfully!', 'success');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      showNotification('Error uploading files.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Generate mood-based playlist
  const generatePlaylist = async () => {
    if (!moodPrompt.trim()) {
      showNotification('Please enter a mood prompt.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/playlists/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mood: moodPrompt }),
      });

      const data = await response.json();
      setCurrentPlaylist(data);
      setCurrentTrackIndex(0);
      setActiveTab('player');
      await fetchPlaylists(); // Refresh playlist list
      await fetchTopTracks(); // Refresh top tracks
    } catch (error) {
      console.error('Error generating playlist:', error);
      showNotification('Error generating playlist.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle track deletion
  const handleDeleteTrack = async (trackId, trackName) => {
    if (deletingId) return; // Prevent multiple deletions at once

    if (!window.confirm(`Are you sure you want to delete "${trackName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(trackId);
    try {
      const response = await fetch(`${API_URL}/tracks/${trackId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete the track.');
      }

      // Refresh all relevant data after deletion
      await Promise.all([
        fetchTracks(),
        fetchPlaylists(),
        fetchTopTracks()
      ]);
    } catch (error) {
      console.error('Error deleting track:', error);
      showNotification(error.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle playlist deletion
  const handleDeletePlaylist = async (playlistId, playlistName) => {
    if (deletingId) return; // Prevent multiple deletions at once

    if (!window.confirm(`Are you sure you want to delete the playlist with mood "${playlistName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(playlistId);
    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete the playlist.');
      }
      await fetchPlaylists(); // Refresh the playlists
      showNotification('Playlist deleted successfully.', 'success');
    } catch (error) {
      console.error('Error deleting playlist:', error);
      showNotification(error.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlayPlaylist = (playlist) => {
    // The data from GET /api/playlists has a different structure than the one from generation.
    // We need to reformat it to match what the player component expects.
    const formattedTracks = playlist.playlist_tracks
      .sort((a, b) => a.position - b.position) // Ensure tracks are in order
      .map(pt => {
        return {
          ...pt.tracks, // pt.tracks contains the full track object
          weight: pt.weight,
          position: pt.position,
        };
      });


    setCurrentPlaylist({ ...playlist, tracks: formattedTracks });
    setCurrentTrackIndex(0);
    setActiveTab('player');
  };

  // Audio playback controls
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(e => console.error("Playback error:", e));
      } else {
        audioRef.current.pause();
      }
    }
  };

  const playNextTrack = () => {
    if (isLooping && currentPlaylist && currentTrackIndex === currentPlaylist.tracks.length - 1) {
      setCurrentTrackIndex(0);
    } else if (currentPlaylist && currentTrackIndex < currentPlaylist.tracks.length - 1) {
      setCurrentTrackIndex(prevIndex => prevIndex + 1);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setTrackProgress({
        currentTime: audioRef.current.currentTime,
        duration: audioRef.current.duration,
      });
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setTrackProgress({
        currentTime: audioRef.current.currentTime,
        duration: audioRef.current.duration,
      });
    }
  };

  const handleTrackEnded = () => {
    playNextTrack();
  };

  const handleAudioError = (e) => {
    console.error('%c[DEBUG] Audio Element Error Event:', 'color: red', e.target.error);
  };

  const handleCanPlay = () => {
    console.log(`%c[DEBUG] handleCanPlay fired. isPlaying=${isPlaying}. Ready to play: ${audioRef.current.currentSrc}`, 'color: green');
    // This event fires when the browser has loaded the new track and is ready.
    // Now it's safe to command it to play.
    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch((error) => {
        // Catch potential AbortError if user interacts quickly
        if (error.name !== 'AbortError') console.error("Audio play error:", error);
      });
    }
  };

  useEffect(() => {
    fetchTracks();
    fetchTopTracks();
    fetchPlaylists();
  }, []);

  const moodSuggestions = [
    'Calm focus for work',
    'Energetic workout',
    'Romantic evening',
    'Chill weekend vibes',
    'Upbeat party mix',
    'Relaxing meditation'
  ];

  // --- Media Session API Integration ---
  useEffect(() => {
    const track = currentPlaylist?.tracks[currentTrackIndex];

    if ('mediaSession' in navigator && track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.original_name,
        artist: 'Mood DJ', // You can replace this with actual artist data if available
        album: currentPlaylist.mood_prompt,
        artwork: [
          // You can add multiple sizes. The browser will pick the best one.
          // Using a generic icon for now.
          { src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' },
        ]
      });

      // Set up action handlers for the media controls
      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
      // You can also add 'previoustrack' if you implement that functionality
    }

    // Cleanup function to clear the metadata when the component unmounts or track changes
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    };
  }, [currentPlaylist, currentTrackIndex, isPlaying]);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds === 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (event) => {
    if (audioRef.current) {
      audioRef.current.currentTime = event.target.value;
    }
  };

  const currentTrackUrl = currentPlaylist ? `${API_URL}/tracks/stream/${currentPlaylist.tracks[currentTrackIndex]?.id}` : null;
  console.log(`%c[DEBUG] Component rendering. Current track URL: ${currentTrackUrl}`, 'color: cyan');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-6">
      {/* Persistent Audio Element - moved to top level to prevent unmounting on tab change */}
      <audio
        ref={audioRef}
        onEnded={handleTrackEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={handleAudioError}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        src={currentTrackUrl || ''}
        hidden // The UI is handled by the player tab, this element is just for playback
      />
      <Notification 
        message={notification.message} 
        type={notification.type}
        onDismiss={() => setNotification({ message: '', type: '' })}
      />
      
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
            Music Mood DJ
          </h1>
          <p className="text-blue-200">AI-Powered Playlist Generation</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-6 space-x-4">
          {['upload', 'generate', 'player', 'playlists', 'stats'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-purple-600 shadow-lg'
                  : 'bg-purple-900/30 hover:bg-purple-800/50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Upload Section */}
        {activeTab === 'upload' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center mb-6">
              <Upload className="mr-3 text-pink-400" size={28} />
              <h2 className="text-2xl font-bold">Upload Music</h2>
            </div>
            
            <div className="border-2 border-dashed border-purple-400 rounded-xl p-12 text-center hover:border-pink-400 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mp3,audio/wav,audio/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Music className="mx-auto mb-4 text-purple-300" size={48} />
                <p className="text-xl mb-2">
                  {uploading ? 'Uploading...' : 'Click to upload music files'}
                </p>
                <p className="text-sm text-blue-300">MP3 or WAV format</p>
              </label>
            </div>

            {/* Track List */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Your Music Library ({libraryTracks.length} tracks)</h3>
                <button onClick={fetchTracks} disabled={refreshing} className="p-2 rounded-full hover:bg-purple-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Refresh Library">
                  <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {libraryTracks.map((track, index) => (
                  <div key={track.id || index} className="bg-purple-900/30 p-3 rounded-lg flex justify-between items-center gap-4">
                    <div className="flex-1 truncate">
                      <p className="truncate">{track.original_name || track.filename}</p>
                      <p className="text-xs text-purple-300">
                        Used {track.selection_count || 0} times
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDeleteTrack(track.id, track.original_name)}
                      disabled={deletingId === track.id}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full transition-colors disabled:opacity-50"
                    >
                      {deletingId === track.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Generate Playlist Section */}
        {activeTab === 'generate' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center mb-6">
              <Sparkles className="mr-3 text-yellow-400" size={28} />
              <h2 className="text-2xl font-bold">Generate Mood Playlist</h2>
            </div>

            <div className="mb-6">
              <label className="block mb-2 font-medium">What's your mood?</label>
              <input
                type="text"
                value={moodPrompt}
                onChange={(e) => setMoodPrompt(e.target.value)}
                placeholder="e.g., calm focus for work"
                className="w-full p-4 rounded-lg bg-purple-900/50 border border-purple-500 focus:border-pink-400 focus:outline-none text-white placeholder-purple-300"
              />
            </div>

            <div className="mb-6">
              <p className="text-sm text-blue-300 mb-3">Quick suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {moodSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setMoodPrompt(suggestion)}
                    className="px-4 py-2 bg-purple-800/50 rounded-full text-sm hover:bg-purple-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generatePlaylist}
              disabled={loading || libraryTracks.length === 0}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg font-bold text-lg hover:from-pink-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Generating playlist...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2" size={20} />
                  Generate Playlist
                </>
              )}
            </button>

            {libraryTracks.length === 0 && (
              <p className="text-yellow-300 text-center mt-4">
                Please upload some tracks first!
              </p>
            )}
          </div>
        )}

        {/* Player Section */}
        {activeTab === 'player' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center mb-6">
              <Play className="mr-3 text-green-400" size={28} />
              <h2 className="text-2xl font-bold">Now Playing</h2>
            </div>

            {currentPlaylist ? (
              <div>
                <div className="bg-purple-900/50 rounded-xl p-6 mb-6">
                  <p className="text-sm text-purple-300 mb-2">Mood: {currentPlaylist.mood_prompt}</p>
                  <h3 className="text-xl font-bold mb-4">
                    {currentPlaylist.tracks[currentTrackIndex]?.original_name || 'No track'}
                  </h3>
                  
                  {/* Custom Progress Bar */}
                  <div className="my-4">
                    <input
                      type="range"
                      value={trackProgress.currentTime}
                      step="1"
                      min="0"
                      max={trackProgress.duration || 0}
                      onChange={handleSeek}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm"
                    />
                    <div className="flex justify-between text-xs text-purple-300 mt-1">
                      <span>{formatTime(trackProgress.currentTime)}</span>
                      <span>{formatTime(trackProgress.duration)}</span>
                    </div>
                  </div>

                  {/* Playback Controls */}
                  <div className="flex justify-center items-center space-x-4">
                    <button
                      onClick={togglePlayPause}
                      className="p-4 bg-purple-600 rounded-full hover:bg-purple-700 transition-colors"
                    >
                      {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button
                      onClick={playNextTrack}
                      disabled={!isLooping && currentTrackIndex >= currentPlaylist.tracks.length - 1}
                      className="p-4 bg-purple-600 rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      <SkipForward size={24} />
                    </button>
                    <button
                      onClick={() => setIsLooping(!isLooping)}
                      className={`p-4 rounded-full hover:bg-purple-700 transition-colors ${isLooping ? 'bg-green-600 text-white' : 'bg-purple-600'}`}
                      title={isLooping ? "Disable Playlist Loop" : "Enable Playlist Loop"}
                    >
                      <Repeat size={24} />
                    </button>
                  </div>

                  <p className="text-center mt-4 text-sm text-purple-300">
                    Track {currentTrackIndex + 1} of {currentPlaylist.tracks.length}
                  </p>
                </div>

                {/* Playlist Queue */}
                <div>
                  <h4 className="font-semibold mb-3">Up Next</h4>
                  <div className="space-y-2">
                    {currentPlaylist.tracks.map((track, index) => (
                      <div
                        key={track.id || index}
                        onClick={() => setCurrentTrackIndex(index)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          index === currentTrackIndex
                            ? 'bg-purple-600'
                            : 'bg-purple-900/30 hover:bg-purple-800/50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="truncate">{track.original_name}</span>
                          <span className="text-sm text-purple-300">
                            Weight: {track.weight?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Music className="mx-auto mb-4 text-purple-400" size={64} />
                <p className="text-xl">No playlist generated yet</p>
                <p className="text-purple-300 mt-2">Go to Generate tab to create one!</p>
              </div>
            )}
          </div>
        )}

        {/* Playlists Section */}
        {activeTab === 'playlists' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">

            <div className="flex items-center mb-6">
              <Music className="mr-3 text-blue-400" size={28} />
              <h2 className="text-2xl font-bold">Generated Playlists</h2>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {playlists.length > 0 ? playlists.map(p => (
                <div
                  key={p.id}
                  className="bg-purple-900/50 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center"
                >
                  <div>
                    <p className="font-bold text-lg">Mood: "{p.mood_prompt}"</p>
                    <p className="text-xs text-purple-300 mb-2">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                    <ul className="list-disc list-inside text-sm pl-2">
                      {p.playlist_tracks.slice(0, 3).map(pt => (
                        <li key={pt.id} className="truncate">
                          {pt.tracks.original_name}
                        </li>
                      ))}
                      {p.playlist_tracks.length > 3 && (
                        <li className="text-purple-400">
                          ...and {p.playlist_tracks.length - 3} more
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex items-center gap-2 mt-3 sm:mt-0">
                    <button
                      onClick={() => handlePlayPlaylist(p)}
                      className="px-4 py-2 bg-purple-600 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                      <Play size={16} /> Play Playlist
                    </button>
                    <button 
                      onClick={() => handleDeletePlaylist(p.id, p.mood_prompt)}
                      disabled={deletingId === p.id}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full transition-colors disabled:opacity-50"
                      title="Delete Playlist"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12">
                  <Sparkles className="mx-auto mb-4 text-purple-400" size={64} />
                  <p className="text-xl">No playlists have been generated yet.</p>
                  <p className="text-purple-300 mt-2">
                    Go to the "Generate" tab to create your first AI playlist!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statistics Section */}
        {activeTab === 'stats' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center mb-6">
              <TrendingUp className="mr-3 text-green-400" size={28} />
              <h2 className="text-2xl font-bold">Top Tracks</h2>
            </div>

            <div className="space-y-3">
              {topTracks.map((track, index) => (
                <div
                  key={track.id}
                  className="bg-purple-900/50 p-4 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl font-bold text-purple-400">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{track.original_name}</p>
                      <p className="text-sm text-purple-300">
                        Selected {track.selection_count} times
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="w-24 h-2 bg-purple-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 to-purple-500"
                        style={{
                          width: `${(track.selection_count / (topTracks?.[0]?.selection_count || 1)) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {topTracks.length === 0 && (
                <p className="text-center text-purple-300 py-8">
                  No statistics yet. Generate some playlists first!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-purple-300 text-sm">
          <p>Built by i-devaj</p>
        </div>
        </div>
      </div>
  );
};

export default App;