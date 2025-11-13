# Quick Fix: MongoDB Authentication Error

## Current Error
```
bad auth : authentication failed
```

This means your password in `.env` is incorrect.

## Fastest Solution

### Option 1: Use the Helper Script (Easiest)

1. **Get your connection string from MongoDB Atlas:**
   - Go to: https://cloud.mongodb.com/
   - Click "Connect" on your cluster
   - Select "Connect your application"
   - Copy the connection string
   - Replace `<username>` and `<password>` with your actual credentials

2. **Run the update script:**
   ```powershell
   .\update-env.ps1
   ```
   - Paste your connection string when prompted
   - The script will update your `.env` file automatically

3. **Restart server:**
   ```powershell
   .\stop-server.bat
   .\start-server.bat
   ```

---

### Option 2: Manual Fix

1. **Get connection string from MongoDB Atlas** (same as above)

2. **Edit `.env` file manually:**
   - Open `.env` in a text editor
   - Replace the `MONGODB_URI` line with your connection string
   - Make sure it's all on ONE line, no line breaks
   - Save as UTF-8 encoding

3. **Restart server**

---

### Option 3: Reset Your Password

If you don't remember your MongoDB password:

1. Go to MongoDB Atlas → **Database Access**
2. Find your user (`gokulvshetty`)
3. Click **"Edit"** → **"Edit Password"**
4. Set a new password
5. Use it in the connection string from Atlas

---

## Verify It Works

After updating, check:
- http://localhost:3001/health
- Should show: `"database": "connected"`

---

## Current Issue

Your `.env` file has:
```
MONGODB_URI=mongodb+srv://gokulvshetty:gokulvshetty%40%23123@cluster0.0qlmqjw.mongodb.net/...
```

The password `gokulvshetty@#123` is incorrect. You need to get the correct connection string from MongoDB Atlas with your actual password.

