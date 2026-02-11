#!/usr/bin/env node

/**
 * Post-build script to fix import.meta issue
 * Adds type="module" to script tags in the generated HTML
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../web-build/index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('HTML file not found at:', htmlPath);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// Find script tags that reference the Expo bundle and add type="module"
// The script tag will be something like: <script src="/_expo/static/js/web/index-*.js"></script>
html = html.replace(
  /<script\s+src=["']([^"']*\/_expo\/static\/js\/web\/[^"']*\.js)["']([^>]*)>/g,
  '<script type="module" src="$1"$2>'
);

// Also handle script tags without explicit src (Expo might inject them differently)
html = html.replace(
  /<script\s+([^>]*src=["'][^"']*\/_expo\/static\/js\/web\/[^"']*\.js["'][^>]*)>/g,
  (match, attrs) => {
    if (!attrs.includes('type=')) {
      return `<script type="module" ${attrs}>`;
    }
    return match.replace(/type=["'][^"']*["']/, 'type="module"');
  }
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ Fixed HTML: Added type="module" to script tags');
