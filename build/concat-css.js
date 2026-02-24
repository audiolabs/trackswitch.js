#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read CSS files in order
const reset = fs.readFileSync('dist/tmp/reset.css', 'utf8');
const trackswitch = fs.readFileSync('css/trackswitch.css', 'utf8');

// Create dist directory if needed
const distDir = path.dirname('dist/tmp/concat.css');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Concatenate
fs.writeFileSync('dist/tmp/concat.css', reset + '\n' + trackswitch);
console.log('✓ Concatenated CSS');
