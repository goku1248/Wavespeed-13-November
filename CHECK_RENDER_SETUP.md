# Render.com Setup Verification Checklist

Follow these steps to verify your Render.com deployment is properly configured.

## Step 1: Check Render Dashboard

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Find your service**: Look for `wavespeed-server` (or whatever you named it)
3. **Check status**: Should show "Live" (green indicator)
4. **Note the URL**: Copy your service URL (e.g., `https://wavespeed-server.onrender.com`)

## Step 2: Verify Environment Variables

1. **In Render Dashboard**, click on your service
2. **Go to "Environment" tab**
3. **Verify these variables exist**:
   - ✅ `MONGODB_URI` - Should be your MongoDB Atlas connection string
   - ✅ `PORT` - Should be `10000` (required for Render)

**If missing**, add them:
- Click "Add Environment Variable"
- Add the key-value pairs
- Click "Save Changes" (will trigger a redeploy)

## Step 3: Check Deployment Logs

1. **In Render Dashboard**, click on your service
2. **Go to "Logs" tab**
3. **Look for these success messages**:
   - ✅ `✅ Loaded .env file` (if you have one)
   - ✅ `✅ Connected to MongoDB Atlas`
   - ✅ `Server is running on port 10000`
   - ✅ `Environment PORT: 10000`
   - ✅ `Using PORT: 10000`

**Red flags** (things that indicate problems):
   - ❌ `Missing MONGODB_URI`
   - ❌ `MongoDB connection error`
   - ❌ `Failed to connect`
   - ❌ Build errors

## Step 4: Test Health Endpoint

Open your browser and visit:
```
https://wavespeed-server.onrender.com/health
```

**Expected response** (should see JSON):
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-01-11T...",
  "port": "10000"
}
```

**If you see**:
- ❌ `404 Not Found` → The route isn't deployed (check server.js has `/health` route)
- ❌ `Cannot GET /health` → Same issue
- ❌ `database: "disconnected"` → MongoDB connection issue (check MONGODB_URI)
- ❌ Page doesn't load → Server might be sleeping (wait 30-60 seconds and retry)

## Step 5: Test API Comments Endpoint

Test the actual API endpoint your extension uses:

**Method 1: Browser**
Visit:
```
https://wavespeed-server.onrender.com/api/comments?url=https://example.com
```

**Expected response**: Should return JSON array (even if empty):
```json
[]
```

**If you see**:
- ❌ `404 Not Found` → API route not deployed
- ❌ `Cannot GET /api/comments` → Route missing
- ✅ `[]` (empty array) → **This is correct!** Means endpoint works

**Method 2: PowerShell/Command Line**
```powershell
# Test health endpoint
Invoke-WebRequest -Uri "https://wavespeed-server.onrender.com/health" -UseBasicParsing

# Test comments endpoint
Invoke-WebRequest -Uri "https://wavespeed-server.onrender.com/api/comments?url=https://example.com" -UseBasicParsing
```

**Method 3: Using curl (if available)**
```bash
curl https://wavespeed-server.onrender.com/health
curl "https://wavespeed-server.onrender.com/api/comments?url=https://example.com"
```

## Step 6: Verify Code Deployment

1. **Check "Events" tab** in Render Dashboard
2. **Look for recent deployments**:
   - Should show "Deploy succeeded" or "Deploy live"
   - Check if latest commit is deployed
3. **If deployment failed**:
   - Check build logs
   - Verify `package.json` exists
   - Check for build errors

## Step 7: Verify Extension Configuration

1. **Open `content.js`** in your project
2. **Find the SERVERS configuration** (around line 1550)
3. **Verify cloud server URL matches**:
   ```javascript
   cloud: {
       api: 'https://wavespeed-server.onrender.com/api',  // ← Should match your Render URL
       base: 'https://wavespeed-server.onrender.com',      // ← Should match your Render URL
       name: 'Cloud Server'
   }
   ```

## Step 8: Test from Extension

1. **Reload extension**: Go to `chrome://extensions/` → Reload
2. **Open browser console** (F12)
3. **Visit any webpage**
4. **Check console logs** for:
   - ✅ `🔍 Finding working server...`
   - ✅ `✅ Using Cloud Server` (if local isn't running)
   - ✅ `Fetching comments for URL: ...`
   - ✅ `Using server: Cloud Server https://wavespeed-server.onrender.com/api`

## Common Issues & Solutions

### Issue: 404 on `/api/comments`
**Solution**: 
- Check if `server.js` has `app.get('/api/comments', ...)` route
- Verify the deployment includes the latest code
- Check Render logs for route registration

### Issue: Database shows "disconnected"
**Solution**:
- Verify `MONGODB_URI` environment variable is set correctly
- Check MongoDB Atlas Network Access allows connections from anywhere (0.0.0.0/0)
- Wait 1-2 minutes for connection to establish (it's async)

### Issue: Server appears sleeping
**Solution**:
- Render free tier sleeps after 15 min inactivity
- First request after sleep takes 30-60 seconds
- Wait and retry, or upgrade to paid tier

### Issue: Build fails
**Solution**:
- Check `package.json` has all dependencies
- Verify Node version (Render uses Node 18+ by default)
- Check build logs for specific errors

### Issue: Extension still shows errors
**Solution**:
- Clear browser cache
- Reload extension
- Check browser console (F12) for specific errors
- Verify cloud server URL in `content.js` matches Render URL

## Quick Verification Script

You can run this PowerShell script to test all endpoints:

```powershell
$baseUrl = "https://wavespeed-server.onrender.com"

Write-Host "Testing Render.com deployment..." -ForegroundColor Cyan
Write-Host ""

# Test health endpoint
Write-Host "1. Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "   ✅ Health check passed" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host "   Database: $($health.database)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test API comments endpoint
Write-Host "2. Testing /api/comments endpoint..." -ForegroundColor Yellow
try {
    $comments = Invoke-RestMethod -Uri "$baseUrl/api/comments?url=https://example.com" -Method Get
    Write-Host "   ✅ Comments endpoint works" -ForegroundColor Green
    Write-Host "   Comments found: $($comments.Count)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Comments endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Verification complete!" -ForegroundColor Cyan
```

Save as `test-render.ps1` and run: `.\test-render.ps1`

## Summary Checklist

- [ ] Service shows "Live" status in Render Dashboard
- [ ] Environment variables (`MONGODB_URI`, `PORT`) are set
- [ ] Logs show "Connected to MongoDB Atlas"
- [ ] Logs show "Server is running on port 10000"
- [ ] `/health` endpoint returns `{"status":"ok","database":"connected"}`
- [ ] `/api/comments` endpoint returns `[]` (or valid JSON)
- [ ] Extension `content.js` has correct cloud server URL
- [ ] Extension console shows successful connection to cloud server

If all checkboxes are ✅, your Render.com setup is complete!

