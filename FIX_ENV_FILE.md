# Fix Your .env File

Your `.env` file appears to have a character encoding issue. Here's how to fix it:

## Option 1: Manual Fix (Recommended)

1. **Open your `.env` file** in a text editor (Notepad++, VS Code, etc.)

2. **Delete the corrupted line** with the gibberish text

3. **Add this line** (make sure it's on a single line, no line breaks):
   ```
   MONGODB_URI=mongodb+srv://gokulvshetty:cHOgg9s7SEEXPyV7@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
   ```

4. **Add the PORT line**:
   ```
   PORT=3001
   ```

5. **Save the file** as UTF-8 encoding (in VS Code: File → Save with Encoding → UTF-8)

## Option 2: Copy from Template

I've created a `.env.example` file with the correct format. You can:

1. Copy `.env.example` to `.env`
2. Update the values if needed
3. Make sure the file is saved as UTF-8

## For Render.com

When adding to Render.com Dashboard → Environment Variables:

**Key**: `MONGODB_URI`
**Value**: 
```
mongodb+srv://gokulvshetty:cHOgg9s7SEEXPyV7@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
```

**Key**: `PORT`
**Value**: `10000`

## Verification

After fixing, test by running:
```powershell
.\start-server.bat
```

Check the console output for:
- ✅ `✅ Connected to MongoDB Atlas`

If you see connection errors, verify:
1. MongoDB Atlas Network Access allows connections from anywhere (0.0.0.0/0)
2. Database user password is correct
3. Connection string format is correct (no spaces, all on one line)

