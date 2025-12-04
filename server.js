// server.js
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Redis for caching
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Configure Multer for in-memory file storage. This is more efficient
// as it avoids writing the file to disk on the server before uploading to Supabase.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // A more specific check for common audio formats
    const allowedTypes = [
      'audio/mpeg', // .mp3
      'audio/wav',  // .wav
      'audio/x-wav' // another common wav type
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 and WAV files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Helper to determine content type from filename
const getContentTypeByExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  return 'application/octet-stream'; // Fallback
};

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Music Mood DJ API is running' });
});

// 1. Upload music files
app.post('/api/tracks/upload', upload.array('music', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedTracks = [];

    for (const file of req.files) {
      const uniqueName = `${uuidv4()}-${file.originalname}`;
      const storagePath = `music/${uniqueName}`;

      const contentType = getContentTypeByExtension(file.originalname);

      const { data: storageData, error: storageError } = await supabase.storage
        .from('music-files').upload(storagePath, file.buffer, { contentType });

      if (storageError) {
        console.error('Storage error:', storageError);
        continue;
      }

      // Insert track metadata into database
      const { data: track, error: dbError } = await supabase
        .from('tracks')
        .insert({
          filename: uniqueName,
          original_name: file.originalname,
          storage_path: storagePath,
          file_size: file.size,
          selection_count: 0
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        continue;
      }

      uploadedTracks.push(track);
    }

    res.json({
      message: 'Files uploaded successfully',
      tracks: uploadedTracks
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// 2. Get all tracks
app.get('/api/tracks', async (req, res) => {
  try {
    const { data: tracks, error } = await supabase
      .from('tracks')
      .select('*')
      .order('upload_date', { ascending: false });

    if (error) throw error;

    res.json(tracks);
  } catch (error) {
    console.error('Error fetching tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// 3. Generate mood-based playlist using Gemini
app.post('/api/playlists/generate', async (req, res) => {
  try {
    const { mood } = req.body;

    if (!mood || mood.trim() === '') {
      return res.status(400).json({ error: 'Mood prompt is required' });
    }

    // Fetch all available tracks
    const { data: tracks, error: tracksError } = await supabase
      .from('tracks')
      .select('*');

    if (tracksError) throw tracksError;

    if (tracks.length === 0) {
      return res.status(400).json({ error: 'No tracks available. Please upload some music first.' });
    }

    // Prepare track list for Gemini
    const trackList = tracks.map((t, idx) => 
      `${idx + 1}. "${t.original_name}" (ID: ${t.id})`
    ).join('\n');

    // Call Gemini API
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    // const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `You are a professional DJ creating a music playlist based on mood.

Mood: "${mood}"

Available tracks:
${trackList}

Instructions:
1. Select 3-6 tracks that best match the mood
2. Order them to create a cohesive listening experience
3. Assign a relevance weight (0.0 to 1.0) to each track based on how well it fits the mood
4. Respond ONLY with valid JSON in this exact format:

{
  "tracks": [
    {"id": "track-uuid-here", "weight": 0.95, "reason": "brief reason"},
    {"id": "track-uuid-here", "weight": 0.85, "reason": "brief reason"}
  ]
}

Important: 
- Use actual track IDs from the list above
- Select 3-6 tracks minimum
- Higher weight = better match for the mood
- No markdown, no extra text, only JSON`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean up response (remove markdown code blocks if present)
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const geminiResponse = JSON.parse(text);

    // Validate response
    if (!geminiResponse.tracks || !Array.isArray(geminiResponse.tracks)) {
      throw new Error('Invalid response format from Gemini');
    }

    // Create playlist in database
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .insert({
        mood_prompt: mood
      })
      .select()
      .single();

    if (playlistError) throw playlistError;

    // Insert playlist tracks and update selection counts
    const playlistTracks = [];
    for (let i = 0; i < geminiResponse.tracks.length; i++) {
      const selectedTrack = geminiResponse.tracks[i];
      const track = tracks.find(t => t.id === selectedTrack.id);

      if (!track) continue;

      // Insert into playlist_tracks
      const { data: playlistTrack, error: ptError } = await supabase
        .from('playlist_tracks')
        .insert({
          playlist_id: playlist.id,
          track_id: track.id,
          position: i + 1,
          weight: selectedTrack.weight || 0.5
        })
        .select()
        .single();

      if (ptError) {
        console.error('Error inserting playlist track:', ptError);
        continue;
      }

      // Increment selection count
      await supabase
        .from('tracks')
        .update({ selection_count: track.selection_count + 1 })
        .eq('id', track.id);

      playlistTracks.push({
        ...track,
        // The URL will be constructed on the frontend to point to our proxy
        weight: selectedTrack.weight,
        reason: selectedTrack.reason,
        position: i + 1
      });
    }

    // Invalidate cache
    await redis.del('top-tracks');

    res.json({
      id: playlist.id,
      mood_prompt: mood,
      created_at: playlist.created_at,
      tracks: playlistTracks
    });

  } catch (error) {
    console.error('Error generating playlist:', error);
    res.status(500).json({ 
      error: 'Failed to generate playlist',
      details: error.message 
    });
  }
});

// 4. Get top tracks with caching
app.get('/api/stats/top-tracks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Check cache first
    const cacheKey = 'top-tracks';
    const cached = await redis.get(cacheKey);

    if (cached) {
      console.log('Returning cached top tracks');
      return res.json(JSON.parse(cached));
    }

    // Query database with aggregation
    const { data: topTracks, error } = await supabase
      .from('tracks')
      .select('*')
      .gt('selection_count', 0)
      .order('selection_count', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Cache for 5 minutes (300 seconds)
    await redis.setex(cacheKey, 300, JSON.stringify(topTracks));

    res.json(topTracks);
  } catch (error) {
    console.error('Error fetching top tracks:', error);
    res.status(500).json({ error: 'Failed to fetch top tracks' });
  }
});

// 5. Get all playlists
app.get('/api/playlists', async (req, res) => {
  try {
    const { data: playlists, error } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_tracks (
          *,
          tracks (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// 6. Get single playlist by ID
app.get('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: playlist, error } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_tracks (
          *,
          tracks (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(playlist);
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// 7. Delete a track
app.delete('/api/tracks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // First, get the track from the database to find its storage path
    const { data: track, error: fetchError } = await supabase
      .from('tracks')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Delete the file from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('music-files')
      .remove([track.storage_path]);

    if (storageError) {
      // Log the error but proceed to delete from DB anyway, as the file might already be gone
      console.error('Storage deletion error (might be benign):', storageError.message);
    }

    // Delete the track record from the database
    const { error: dbError } = await supabase.from('tracks').delete().eq('id', id);
    if (dbError) throw dbError;

    // Invalidate the top-tracks cache since a track has been removed
    await redis.del('top-tracks');

    res.status(200).json({ message: 'Track deleted successfully' });
  } catch (error) {
    console.error('Error deleting track:', error);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

// 8. Stream a track
app.get('/api/tracks/stream/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: track, error: fetchError } = await supabase
      .from('tracks')
      .select('storage_path, original_name')
      .eq('id', id)
      .single();

    if (fetchError || !track) {
      return res.status(404).send('Track not found');
    }

    const { data, error: downloadError } = await supabase.storage
      .from('music-files')
      .download(track.storage_path);

    if (downloadError) {
      throw downloadError;
    }

    const contentType = getContentTypeByExtension(track.original_name);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline'); // Ensure browser plays the file

    // Convert Blob to Buffer and send
    const buffer = Buffer.from(await data.arrayBuffer());
    res.send(buffer);

  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).send('Could not stream track');
  }
});

// 9. Delete a playlist
app.delete('/api/playlists/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Delete the playlist record from the database
    const { error: dbError } = await supabase.from('playlists').delete().eq('id', id);
    if (dbError) throw dbError;

    res.status(200).json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});






// ==================== SERVE FRONTEND ====================

// These lines are needed for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the React app's build directory
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// The "catchall" handler: for any request that doesn't
// match one of the API routes above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Music Mood DJ API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});
