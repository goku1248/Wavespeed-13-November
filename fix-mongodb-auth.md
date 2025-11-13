# Fix MongoDB Authentication Error

## Error Meaning
The error "bad auth : authentication failed" means:
- MongoDB server is reachable ✅
- But the username/password in your connection string is wrong ❌

## Solution: Get Correct MongoDB URI

### Option 1: From MongoDB Atlas (Recommended)

1. **Go to MongoDB Atlas**: https://cloud.mongodb.com/
2. **Sign in** to your account
3. **Click on your cluster** (`cluster1` or similar)
4. **Click "Connect" button**
5. **Choose "Connect your application"**
6. **Select "Node.js" and version (4.1 or later)**
7. **Copy the connection string** - it will look like:
   ```
   mongodb+srv://<username>:<password>@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
   ```

8. **IMPORTANT**: Replace `<username>` and `<password>` with your actual credentials
   - If the string shows `<username>`, replace it with your MongoDB username (probably `gokulvshetty`)
   - If the string shows `<password>`, replace it with your MongoDB database password

9. **If password has special characters**, you might need to URL-encode them, or MongoDB Atlas will provide the correctly encoded version

### Option 2: Reset MongoDB Password (If You Forgot)

If you don't remember your MongoDB password:

1. Go to MongoDB Atlas
2. Click "Database Access" in the left menu
3. Find your user (`gokulvshetty`)
4. Click "Edit" or "..." menu
5. Click "Edit Password"
6. Enter new password
7. Update your `.env` file with the new password

### Option 3: Create New Database User

If you want to create a fresh user:

1. Go to MongoDB Atlas → Database Access
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Enter username and password
5. Give "Atlas Admin" role (or custom permissions)
6. Click "Add User"
7. Use this new username/password in connection string

## Update .env File

Once you have the correct URI:

1. **Open `.env` file** in your project
2. **Replace the MONGODB_URI line** with:
   ```
   MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
   PORT=3001
   ```

3. **Save the file** as UTF-8 encoding

## Restart Server

After updating `.env`:

1. **Stop current server**:
   ```powershell
   .\stop-server.bat
   ```

2. **Start server again**:
   ```powershell
   .\start-server.bat
   ```

3. **Check health endpoint**:
   ```
   http://localhost:3001/health
   ```
   Should show: `"database": "connected"`

## Test Connection

After restarting, check browser console - the error should be gone and comments should load!

## Common Issues

**Password has special characters?**
- Use URL encoding: `@` = `%40`, `#` = `%23`, `:` = `%3A`
- Or get the string directly from MongoDB Atlas - it handles encoding automatically

**Still getting auth error?**
- Double-check username/password (case-sensitive!)
- Verify the user exists in MongoDB Atlas Database Access
- Make sure Network Access allows connections from your IP

