# Webpage Comments Chrome Extension

A Chrome extension that allows you to add comments to any webpage you visit. The comments are stored locally and will persist across sessions.

## Features

- Add comments to any webpage
- Comments are stored locally and persist across sessions
- Clean and modern user interface
- Collapsible comments panel
- Timestamp for each comment

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. Click the extension icon in your Chrome toolbar to activate the comments panel
2. The comments panel will appear on the right side of the webpage
3. Type your comment in the text area and click "Post" to add it
4. Use the toggle button (−) to collapse/expand the comments panel
5. Comments are automatically saved and will be available when you revisit the page

## Files

- `manifest.json`: Extension configuration
- `content.js`: Main script that injects and manages the comments panel
- `styles.css`: Styling for the comments panel
- `popup.html`: Extension popup interface
- `background.js`: Background script for initialization

## Note

This extension stores comments locally in your browser. Comments are associated with specific URLs and will only appear on the pages where they were created. 