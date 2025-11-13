# Fix MongoDB Authentication Error

## Current Error
```
bad auth : authentication failed
```

This means MongoDB is reachable, but the username/password is incorrect.

## Quick Fix: Get Connection String from MongoDB Atlas

### Step 1: Go to MongoDB Atlas
1. Open: https://cloud.mongodb.com/
2. Sign in to your account

### Step 2: Get the Connection String
1. Click on your cluster (should be visible on the dashboard)
2. Click the **"Connect"** button
3. Select **"Connect your application"**
4. Choose **"Node.js"** and version **4.1 or later**
5. **Copy the connection string** shown

### Step 3: Replace Placeholders
The connection string will look like:
```
mongodb+srv://<username>:<password>@cluster0.0qlmqjw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

**IMPORTANT:** Replace:
- `<username>` with your actual MongoDB username (probably `gokulvshetty`)
- `<password>` with your actual MongoDB database password

**Note:** If your password has special characters, MongoDB Atlas will show the correctly encoded version automatically.

### Step 4: Update .env File
1. Open `.env` file in your project
2. Replace the `MONGODB_URI` line with your connection string (after replacing username/password)
3. Make sure it's all on ONE line, no line breaks
4. Save as UTF-8 encoding

### Step 5: Restart Server
```powershell
.\stop-server.bat
.\start-server.bat
```

### Step 6: Verify
Check: http://localhost:3001/health

Should show: `"database": "connected"`

---

## Alternative: Reset Your Password

If you don't remember your password:

1. Go to MongoDB Atlas → **Database Access** (left menu)
2. Find your user (`gokulvshetty`)
3. Click **"Edit"** or the **"..."** menu
4. Click **"Edit Password"**
5. Enter a new password (remember it!)
6. Update your `.env` file with the new password
7. Restart server

---

## Alternative: Create New Database User

If you want to start fresh:

1. Go to MongoDB Atlas → **Database Access**
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Enter username and password
5. Give **"Atlas Admin"** role
6. Click **"Add User"**
7. Use the new credentials in your `.env` file

---

## Current .env File Content

Your current `.env` has:
```
MONGODB_URI=mongodb+srv://gokulvshetty:gokulvshetty%40%23123@cluster0.0qlmqjw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
PORT=3001
```

The password `gokulvshetty@#123` (encoded as `gokulvshetty%40%23123`) appears to be incorrect.

**Get the correct connection string from MongoDB Atlas to fix this!**

