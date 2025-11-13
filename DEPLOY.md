# Deployment Guide - Wavespeed Server

This guide will help you deploy the Wavespeed backend server to Render.com for 24/7 availability.

## Prerequisites

- GitHub account (already set up)
- MongoDB Atlas database (already configured)
- Render.com account (free tier available)

## Step 1: Create Render.com Account

1. Go to [https://render.com/](https://render.com/)
2. Click "Get Started" or "Sign Up"
3. Sign up with your GitHub account (recommended for easy deployment)

## Step 2: Deploy from GitHub

1. **On Render Dashboard**, click "New +" button → Select "Web Service"

2. **Connect Repository**:
   - If first time: Click "Connect GitHub" and authorize Render
   - Search for your repository: `Wavespeed-25-July`
   - Click "Connect"

3. **Configure Web Service**:
   - **Name**: `wavespeed-server` (or any name you prefer)
   - **Region**: Choose closest to you (e.g., Oregon, Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: (leave empty)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (enough for personal use)

4. **Add Environment Variables**:
   Click "Advanced" → "Add Environment Variable"
   
   Add these variables:
  - **Key**: `MONGODB_URI`
    **Value**: Your MongoDB connection string (never commit secrets)
    ```
    mongodb+srv://<username>:<password>@<cluster-host>/<db>?retryWrites=true&w=majority
    ```
   
   - **Key**: `PORT`
     **Value**: `10000` (Render uses this port)

5. **Deploy**:
   - Click "Create Web Service"
   - Wait 2-5 minutes for deployment
   - Watch the logs for "Connected to MongoDB Atlas" and "Server is running"

## Step 3: Get Your Cloud Server URL

After deployment completes:
1. Your service URL will be shown (e.g., `https://wavespeed-server.onrender.com`)
2. **Copy this URL** - you'll need it for the next step

## Step 4: Update Extension Configuration

1. Open `content.js` in your code editor
2. Find line ~1438 where it says:
   ```javascript
   cloud: {
       api: 'https://your-app.onrender.com/api',
       base: 'https://your-app.onrender.com',
   ```
3. Replace `https://your-app.onrender.com` with your actual Render URL
4. Save the file

## Step 5: Test Cloud Server

1. Visit your Render URL + `/health`:
   ```
   https://wavespeed-server.onrender.com/health
   ```
2. You should see:
   ```json
   {
     "status": "ok",
     "database": "connected",
     "timestamp": "...",
     "port": "10000"
   }
   ```

## Step 6: Reload Extension

1. Go to `chrome://extensions/`
2. Find "Webpage Comments"
3. Click reload button
4. Refresh any webpage
5. Extension will now automatically use cloud server when local is unavailable!

## Running Local Server in Background

For local development, use the provided batch scripts:

**Start Server (Background):**
```batch
start-server.bat
```

**Stop Server:**
```batch
stop-server.bat
```

The server will keep running even if you close PowerShell/Command Prompt.

## Troubleshooting

**If deployment fails:**
- Check build logs on Render dashboard
- Verify MONGODB_URI is correct
- Ensure package.json has all dependencies

**If health check fails:**
- Wait a few minutes for MongoDB to connect
- Check Render logs for errors
- Verify MongoDB Atlas allows connections from anywhere (Network Access)

**Extension still shows errors:**
- Make sure you updated the cloud server URL in content.js
- Reload the extension
- Check browser console (F12) for server connection logs

## Free Tier Limitations

Render's free tier:
- ✅ Unlimited requests
- ✅ 750 hours/month (enough for 24/7)
- ⚠️ Sleeps after 15 min of inactivity (wakes on first request)
- First request after sleep may take 30-60 seconds

The extension's dual-server design handles this automatically!

