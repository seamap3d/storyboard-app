#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔨 Building ApeOnAWhale Storyboard...');

// Read the original file to extract the non-script parts
const originalFile = fs.readFileSync('index.html', 'utf8');

// Find the start and end of the script section
const scriptStart = originalFile.indexOf('<script>');
const scriptEnd = originalFile.indexOf('</script>') + '</script>'.length;

// Extract the parts we want to keep
const beforeScript = originalFile.substring(0, scriptStart);
const afterScript = originalFile.substring(scriptEnd);

// Read all JavaScript modules
const jsFiles = [
  'src/scripts/state.js',
  'src/scripts/elements.js', 
  'src/scripts/utils.js',
  'src/scripts/shotManagement.js',
  'src/scripts/productionSchedule.js'
];

let combinedJS = '';

// Add modular JavaScript files
jsFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    combinedJS += '\n' + content + '\n';
  }
});

// Add the remaining JS from the original file (everything that wasn't extracted)
const originalScript = originalFile.substring(scriptStart + '<script>'.length, scriptEnd - '</script>'.length);

// For now, include both the modules and the original script
// TODO: Remove duplicated functions from originalScript once fully modularized
combinedJS += '\n' + originalScript;

// Read CSS
const customCSS = fs.readFileSync('src/styles.css', 'utf8');

// Replace the style tag content with our extracted CSS
const beforeStyleStart = beforeScript.substring(0, beforeScript.indexOf('<style>') + '<style>'.length);
const afterStyleEnd = beforeScript.substring(beforeScript.indexOf('</style>'));
const beforeWithNewCSS = beforeStyleStart + '\n' + customCSS + '\n  ' + afterStyleEnd;

// Build the final file
const finalHTML = beforeWithNewCSS + '<script>\n' + combinedJS + '\n  </script>' + afterScript;

// Write to build directory
if (!fs.existsSync('build')) {
  fs.mkdirSync('build');
}

fs.writeFileSync('build/index.html', finalHTML);

console.log('✅ Build complete! Generated build/index.html');
console.log('📊 Original: ' + Math.round(fs.statSync('index.html').size / 1024) + 'KB');
console.log('📊 Built: ' + Math.round(fs.statSync('build/index.html').size / 1024) + 'KB');

// Copy other necessary files
const filesToCopy = ['_headers', 'test_schedule.json', 'AOAW_stortboard_template.json'];
filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `build/${file}`);
    console.log(`📄 Copied ${file}`);
  }
});

console.log('\n🎬 Ready to deploy! Use files from build/ directory.');