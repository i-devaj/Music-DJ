# 🎵 Music Mood DJ - AI-Powered Playlist Generator

An intelligent music application that generates mood-based playlists using Google Gemini AI, built with Node.js, React, Supabase, and Redis.

## 🎯 Features

- ✅ Upload music files (MP3/WAV) via backend API
- ✅ Store metadata in Supabase PostgreSQL
- ✅ AI-powered mood-based playlist generation using Gemini API
- ✅ Track selection statistics with Redis caching
- ✅ Beautiful responsive React UI with audio playback
- ✅ Real-time top tracks analytics
- ✅ Supabase Storage for file management

## 🛠️ Tech Stack

### Backend
- **Node.js + Express** - REST API
- **Supabase** - PostgreSQL database + file storage
- **Google Gemini API** - AI playlist generation
- **Redis** - Caching for analytics
- **Multer** - File upload handling

### Frontend
- **React + Vite** - UI framework
- **Tailwind CSS** - Styling
- **Lucide Icons** - Icon library

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account ([supabase.com](https://supabase.com))
- Google Gemini API key ([makersuite.google.com](https://makersuite.google.com/app/apikey))
- Redis instance (local or cloud like Upstash)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/music-mood-dj.git
cd music-mood-dj
```

### 2. Supabase Setup

#### Create a new Supabase project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to SQL Editor and run this schema:

```sql
-- Create tracks table
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  duration FLOAT,
  file_size BIGINT,
  upload_date TIMESTAMP DEFAULT NOW(),
  selection_count INTEGER DEFAULT 0
);

-- Create playlists table
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mood_prompt TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create playlist_tracks junction table
CREATE TABLE playlist_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  weight FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_tracks_selection_count ON tracks(selection_count DESC);
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_tracks_upload_date ON tracks(upload_date DESC);
```

#### Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create a new bucket named `music-files`
3. Make it **public** (or configure RLS policies)

### 3. Backend Setup

```bash
# Install dependencies
npm install express multer cors @supabase/supabase-js @google/generative-ai ioredis dotenv uuid

# Create .env file
cp .env.example .env
```

#### Configure `.env` file:

```env
# Server
PORT=3000

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Redis (local or cloud)
REDIS_URL=redis://localhost:6379
# For Upstash: redis://default:xxxxx@xxxxx.upstash.io:6379

# Node Environment
NODE_ENV=development
```

#### Get your credentials:

- **Supabase URL & Key**: Project Settings → API
- **Gemini API Key**: [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Redis URL**: 
  - Local: `redis://localhost:6379`
  - Upstash: Create free instance at [upstash.com](https://upstash.com)

### 4. Start Backend Server

```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000` or 3003 or 3002

### 5. Frontend Setup

```bash
# In a new terminal
cd client

# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:3000/api" > .env

# Start development server
npm run dev
```

Frontend runs on `http://localhost:5173`

## 📁 Project Structure

```
music-mood-dj/
├── server.js                 # Main backend server
├── package.json
├── .env
├── .gitignore
├── README.md
├── uploads/                  # Temporary upload directory
└── client/                   # React frontend
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    └── vite.config.js
    └── index.html
```

## 🔌 API Endpoints

### Tracks
- `POST /api/tracks/upload` - Upload music files
- `GET /api/tracks` - Get all tracks

### Playlists
- `POST /api/playlists/generate` - Generate mood-based playlist
- `GET /api/playlists` - Get all playlists
- `GET /api/playlists/:id` - Get specific playlist

### Statistics
- `GET /api/stats/top-tracks?limit=10` - Get top tracks (cached)

### Health
- `GET /api/health` - Health check

## 📊 Database Schema

### tracks
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| filename | TEXT | Unique filename |
| original_name | TEXT | Original upload name |
| storage_path | TEXT | Supabase storage path |
| file_size | BIGINT | File size in bytes |
| upload_date | TIMESTAMP | Upload timestamp |
| selection_count | INTEGER | Times used in playlists |

### playlists
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| mood_prompt | TEXT | User's mood input |
| created_at | TIMESTAMP | Creation timestamp |

### playlist_tracks
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| playlist_id | UUID | Foreign key to playlists |
| track_id | UUID | Foreign key to tracks |
| position | INTEGER | Track order |
| weight | FLOAT | Relevance score (0-1) |

## 🎨 Features Deep Dive

### 1. File Upload
- Supports MP3 and WAV formats
- Max file size: 50MB per file
- Files stored in Supabase Storage
- Metadata saved in PostgreSQL
- Automatic cleanup of temporary files

### 2. AI Playlist Generation
- Uses Google Gemini Pro model
- Analyzes track names and mood prompt
- Selects 3-6 tracks per playlist
- Assigns relevance weights (0.0 - 1.0)
- Orders tracks for cohesive listening

### 3. Caching Strategy
- Top tracks endpoint cached in Redis
- TTL: 5 minutes (300 seconds)
- Cache invalidated on new playlist generation
- Reduces database load for analytics

### 4. Audio Playback
- HTML5 Audio API
- Sequential playback
- Play/pause controls
- Track navigation
- Progress indicator

## 🚢 Deployment

### Backend (Railway/Render)

#### Railway:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### Render:
1. Create new Web Service
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables

### Frontend (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd client
vercel --prod
```

Or use Vercel GitHub integration for automatic deployments.

### Environment Variables for Production

Remember to set these in your hosting platform:

**Backend:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GEMINI_API_KEY`
- `REDIS_URL`
- `PORT` (usually auto-set)

**Frontend:**
- `VITE_API_URL` (your deployed backend URL)

## 🧪 Testing the Application

### 1. Upload Music
1. Go to "Upload" tab
2. Click to upload MP3/WAV files
3. Verify files appear in library

### 2. Generate Playlist
1. Go to "Generate" tab
2. Enter a mood (e.g., "energetic workout")
3. Click "Generate Playlist"
4. Wait for AI processing

### 3. Play Music
1. Navigate to "Player" tab
2. Use play/pause controls
3. Skip through tracks
4. View queue

### 4. View Statistics
1. Go to "Stats" tab
2. See top tracks by usage
3. Verify counts update after playlist generation

## 🐛 Troubleshooting

### Backend Issues

**Files not uploading:**
- Check Supabase storage bucket is public
- Verify service role key has storage permissions
- Check file size limits

**Gemini API errors:**
- Verify API key is valid
- Check API quotas not exceeded
- Ensure proper JSON parsing

**Redis connection failed:**
- Verify Redis is running: `redis-cli ping`
- Check REDIS_URL format
- Try without password if local

### Frontend Issues

**CORS errors:**
- Ensure backend CORS is enabled
- Check API_URL in .env
- Verify backend is running

**Audio not playing:**
- Check Supabase storage URLs are public
- Verify file formats are supported
- Check browser console for errors

## 📈 Performance Optimization

### Backend
- Redis caching for top tracks (5min TTL)
- Database indexes on frequently queried columns
- Multer file size limits
- Efficient SQL queries with joins

### Frontend
- Lazy loading for track lists
- Audio preloading
- Optimized re-renders with React hooks
- Tailwind CSS for minimal bundle size

## 🔒 Security Considerations

- Use Supabase service role key only on backend
- Validate file types and sizes
- Implement rate limiting (optional)
- Sanitize user inputs
- Use environment variables for secrets

## 📝 Future Enhancements

- [ ] User authentication with Supabase Auth
- [ ] Collaborative playlists
- [ ] Advanced audio analysis
- [ ] Spotify/Apple Music integration
- [ ] Social sharing features
- [ ] Mobile app (React Native)
- [ ] Offline playback support


## 📄 License

MIT License - feel free to use this project for your portfolio!

## 👤 Author

**Your Name**
- GitHub: [i-devaj](https://github.com/i-devaj)
- Email: devajarya0@gmail.com

## 🙏 Acknowledgments

- Google Gemini AI for intelligent playlist generation
- Supabase for backend infrastructure
- The open-source community

---

**Built with ❤️**

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section
2. Review environment variables
3. Check browser/server console logs
4. Open an issue on GitHub

Good luck! 🚀