const fs = require('fs');

const code = fs.readFileSync('content.js', 'utf8');

let depth = 0;
const stack = [];
let line = 1;
let col = 0;
let inString = false;
let stringChar = '';
let escape = false;
let inSingleComment = false;
let inMultiComment = false;

for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (ch === '\n') {
        line += 1;
        col = 0;
        inSingleComment = false;
        continue;
    }

    col += 1;

    if (inSingleComment) continue;

    if (inMultiComment) {
        if (ch === '*' && code[i + 1] === '/') {
            inMultiComment = false;
            i += 1;
            col += 1;
        }
        continue;
    }

    if (inString) {
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === stringChar) {
            inString = false;
            stringChar = '';
        }
        continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
    }

    if (ch === '/') {
        const next = code[i + 1];
        if (next === '/') {
            inSingleComment = true;
            i += 1;
            col += 1;
            continue;
        }
        if (next === '*') {
            inMultiComment = true;
            i += 1;
            col += 1;
            continue;
        }
    }

    if (ch === '{') {
        stack.push({ line, col });
        depth += 1;
    } else if (ch === '}') {
        if (depth === 0) {
            console.log('Extra closing brace at line', line, 'col', col);
            process.exit(0);
        }
        stack.pop();
        depth -= 1;
    }
}

if (depth !== 0) {
    console.log('Unclosed brace starting at', stack[0]);
} else {
    console.log('Braces balanced');
}

