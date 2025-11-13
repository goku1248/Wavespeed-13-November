# How to Save .env File as UTF-8

## Method 1: Using VS Code (Visual Studio Code)

1. **Open your .env file** in VS Code
2. **Look at the bottom-right corner** of VS Code window
3. You'll see the current encoding (might say "UTF-8", "Windows-1252", etc.)
4. **Click on the encoding** (bottom-right corner)
5. **Select "Save with Encoding"**
6. **Choose "UTF-8"** from the list
7. **File is now saved as UTF-8!**

Alternatively:
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "Save with Encoding"
- Select "UTF-8"
- Press Enter

## Method 2: Using Notepad++

1. **Open your .env file** in Notepad++
2. **Click "Encoding"** in the top menu
3. **Select "Convert to UTF-8"** (or "Encode in UTF-8")
4. **Save the file** (Ctrl+S)
5. **Done!**

## Method 3: Using Windows Notepad

1. **Open your .env file** in Notepad
2. **Click "File" → "Save As"**
3. **At the bottom**, you'll see "Encoding" dropdown
4. **Change from "ANSI" to "UTF-8"**
5. **Click "Save"**
6. **If prompted to replace, click "Yes"**

## Method 4: Using PowerShell (Automatic)

I can create a script to convert your .env file to UTF-8 automatically!

## Quick Check: Is it UTF-8?

After saving, you can verify:
- The file should not have garbled characters
- Special characters should display correctly
- MongoDB URI should work without encoding issues

## Why UTF-8 Matters

- Prevents character encoding issues
- Ensures special characters in passwords work correctly
- MongoDB connection strings work properly
- Prevents the corrupted text issue you had before

