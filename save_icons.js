const fs = require('fs');
const { createCanvas } = require('canvas');

function drawIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.15);
    ctx.fill();
    
    // Draw comment box
    const padding = size * 0.25;
    const boxSize = size - (padding * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size * 0.06;
    
    // Draw box
    ctx.strokeRect(padding, padding, boxSize, boxSize);
    
    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(padding, size/2);
    ctx.lineTo(size - padding, size/2);
    ctx.stroke();
    
    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(size/2, padding);
    ctx.lineTo(size/2, size - padding);
    ctx.stroke();

    return canvas;
}

// Create icons directory if it doesn't exist
if (!fs.existsSync('icons')) {
    fs.mkdirSync('icons');
}

// Generate and save icons
[16, 48, 128].forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`icons/icon${size}.png`, buffer);
    console.log(`Created icon${size}.png`);
}); 