#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

// Read package.json for banner
const banner = `/*!
 * trackswitchjs v${pkg.version} (${pkg.homepage})
 * Copyright ${new Date().getFullYear()} International Audio Laboratories Erlangen
 * Licensed under MIT (https://github.com/audiolabs/trackswitchjs/blob/master/LICENSE)
 */
if (typeof jQuery === 'undefined') {
  throw new Error('trackswitchjs\\'s JavaScript requires jQuery. jQuery must be included before trackswitchjs\\'s JavaScript.')
}
+function ($) {
  var version = $.fn.jquery.split(' ')[0].split('.').map(Number)
  if ((version[0] < 1) || (version[0] === 1 && version[1] < 9) || (version[0] === 1 && version[1] === 9 && version[2] < 1) || (version[0] >= 4)) {
    throw new Error('trackswitchjs\\'s JavaScript requires at least jQuery v1.9.1 but less than v4.0.0')
  }
}(jQuery);
+function () {
`;

const footer = '\n}();';

// Read and process JS file
let js = fs.readFileSync('js/trackswitch.js', 'utf8');

// Remove export/import statements
js = js
  .split('\n')
  .filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith('export ') && !trimmed.startsWith('import ');
  })
  .join('\n');

// Create dist directory if it doesn't exist
const distDir = path.dirname('dist/js/trackswitch.js');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write concatenated file with banner and footer
fs.writeFileSync('dist/js/trackswitch.js', banner + js + footer);
console.log('✓ Concatenated JS with banner and footer');
