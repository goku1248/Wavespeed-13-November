# Load Extension in Chrome - Step by Step

## ✅ Server Status
- ✅ Local server is running on `http://localhost:3001`
- ⚠️  Database is disconnected (need to fix MONGODB_URI in .env)

## Load Extension in Chrome

1. **Open Chrome**
   - Launch Google Chrome browser

2. **Go to Extensions Page**
   - Type in address bar: `chrome://extensions/`
   - Or: Menu (⋮) → More tools → Extensions

3. **Enable Developer Mode**
   - Toggle the switch in the top-right corner that says "Developer mode"

4. **Load Extension**
   - Click "Load unpacked" button
   - Navigate to your project folder: `C:\Users\gokul\Desktop\Wavespeed`
   - Select the folder and click "Select Folder"

5. **Extension Should Appear**
   - You should see "Webpage Comments" extension
   - Make sure it's enabled (toggle switch is ON)

6. **Test Extension**
   - Visit any website (e.g., `https://example.com`)
   - You should see the comments panel on the right side
   - If you see errors, check the browser console (F12)

## Fix Database Connection

The server is running but database is disconnected. To fix:

1. **Edit `.env` file** in your project folder
2. **Add correct MongoDB URI**:
   ```
   MONGODB_URI=mongodb+srv://gokulvshetty:YOUR_CORRECT_PASSWORD@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
   PORT=3001
   ```

3. **Get correct URI from MongoDB Atlas**:
   - Go to: https://cloud.mongodb.com/
   - Connect → Connect your application
   - Copy the connection string
   - Replace `<username>` and `<password>`

4. **Restart server**:
   ```powershell
   .\stop-server.bat
   .\start-server.bat
   ```

5. **Verify**: Check http://localhost:3001/health - should show `"database": "connected"`

## Troubleshooting

**Extension not loading?**
- Make sure you selected the correct folder (Wavespeed)
- Check for errors in chrome://extensions/ (red error messages)

**Comments not loading?**
- Check browser console (F12) for errors
- Verify server is running: http://localhost:3001/health
- Check if database is connected

**Server errors?**
- Check MongoDB URI is correct in .env
- Verify MongoDB Atlas Network Access allows connections from anywhere

