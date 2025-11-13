# Wavespeed - Social Comments Extension

A powerful Chrome extension that brings social commenting, messaging, and engagement features to any webpage.

## Features

### Core Features
- 💬 **Comment on any webpage** - Add comments that persist across sessions
- 🔄 **Infinite nested replies** - Reply to comments and replies infinitely
- 👍 **Reactions** - Like, Dislike, Trust, Distrust, and Flag comments/replies
- 📨 **Direct Messaging** - Send messages to other users
- 👥 **Group Chats** - Create and participate in group conversations
- 🔥 **Real-time Updates** - WebSocket-powered live updates
- 😊 **Emoji & GIF Support** - Add emojis and GIFs to comments and messages
- 🔐 **Google OAuth** - Secure authentication with Google
- 🎨 **Modern UI** - Beautiful, responsive interface inspired by Facebook/Instagram

### Advanced Features
- 📊 **Multiple sorting** - Sort by newest, oldest, most liked, most trusted, etc.
- 🔍 **User search** - Find and message other extension users
- 🌐 **Dual-server architecture** - Automatic fallback between local and cloud servers
- ✨ **No flashing** - Smooth updates without page reloads
- 📱 **Responsive design** - Works on all screen sizes

## Quick Start

### 1. Install Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/goku1248/Wavespeed-25-July.git
   cd Wavespeed-25-July
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your MongoDB connection string and port
   - See [MongoDB Setup](#mongodb-setup) below

4. Load extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this directory

### 2. Start Local Server

**Option A: Quick Start (Terminal closes = server stops)**
```bash
npm start
```

**Option B: Background Mode (Recommended for Windows)**
```batch
start-server.bat
```
Server runs in background even when terminal is closed.

To stop:
```batch
stop-server.bat
```

### 3. Deploy to Cloud (Optional but Recommended)

For 24/7 availability without keeping your computer on:

See [DEPLOY.md](DEPLOY.md) for complete Render.com deployment guide.

## MongoDB Setup

1. Create free MongoDB Atlas account at [cloud.mongodb.com](https://cloud.mongodb.com/)
2. Create a cluster (M0 Free tier)
3. Add a database user
4. Whitelist your IP or allow from anywhere
5. Get connection string and add to `.env`:
```
MONGODB_URI=your-mongodb-uri-here
PORT=3001
```

## Usage

1. **Sign in** with Google OAuth
2. **Browse any webpage** - Comments panel appears on the right
3. **Add comments** - Type and click Post
4. **Reply to comments** - Click Reply button on any comment
5. **React** - Like 👍, Dislike 👎, Trust ✅, Distrust ❌, Flag 🚩
6. **Message users** - Click Messages tab (📨), search for users
7. **Create groups** - Click Groups tab, create group chats

## Project Structure

### Extension Files
- `manifest.json` - Extension configuration
- `content.js` - Main extension logic (4000+ lines)
- `styles.css` - Modern UI styling (1900+ lines)
- `popup.html/js` - Extension popup
- `background.js` - Background service worker
- `auth.js` - Google OAuth handling

### Backend Files
- `server.js` - Express server with MongoDB (1800+ lines)
- `package.json` - Dependencies
- `render.yaml` - Render.com deployment config
- `.env` - Environment variables (not committed)
- `.env.example` - Environment template

### Utility Scripts
- `start-server.bat` - Start server in background (Windows)
- `stop-server.bat` - Stop background server (Windows)
- `auto-commit.js` - Auto-commit helper
- `DEPLOY.md` - Deployment guide

## Architecture

### Dual-Server Design
- **Local Server**: `http://localhost:3001` (development)
- **Cloud Server**: Render.com deployment (production)
- **Automatic Fallback**: Extension tries local first, then cloud
- **Health Monitoring**: Checks server health every 60 seconds

### Technologies
- **Frontend**: Vanilla JavaScript, Chrome Extension APIs
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB Atlas
- **Authentication**: Google OAuth 2.0
- **Real-time**: WebSocket (Socket.IO)

## Development

### Local Development
```bash
npm run dev  # Uses nodemon for auto-restart
```

### Auto-commit
```bash
npm run commit  # Interactive commit
npm run push    # Quick push with default message
```

## Troubleshooting

### "Failed to load comments"
- **Check server**: Is `node server.js` running?
- **Use batch script**: Run `start-server.bat` for persistent server
- **Check MongoDB**: Verify `.env` has correct MONGODB_URI
- **Check health**: Visit `http://localhost:3001/health`

### Messages not sending
- Ensure recipient has installed the extension
- Check browser console (F12) for errors
- Verify you selected a conversation

### Extension not loading
- Reload extension in `chrome://extensions/`
- Check for errors in extension console
- Refresh the webpage

## Security Notes

- ✅ `.env` file is git-ignored (credentials safe)
- ✅ OAuth tokens stored securely in Chrome storage
- ✅ CORS configured for security
- ✅ Input sanitization on server
- ⚠️ For production: Add rate limiting and authentication middleware

## Contributing

Feel free to fork and improve! Key areas for contribution:
- Performance optimization
- Additional features (trending, posts, followers)
- Mobile responsiveness
- Security enhancements

## License

MIT License - See LICENSE file for details

## Author

Gokul Shetty
- GitHub: [@goku1248](https://github.com/goku1248)
- Email: gokulvshetty@gmail.com
 