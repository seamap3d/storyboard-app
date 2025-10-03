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

// Get the original script and extract only the parts not in modules
const originalScript = originalFile.substring(scriptStart + '<script>'.length, scriptEnd - '</script>'.length);

// Include most of the original script but skip renderProductionSchedule
// This is a temporary solution - ideally we'd extract everything to modules
const lines = originalScript.split('\n');
let skipUntil = -1;
const filteredLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip the renderProductionSchedule function
  if (line.includes('function renderProductionSchedule()')) {
    // Find the end of the function by counting braces
    let braceCount = 0;
    let inFunction = false;
    skipUntil = i;
    
    for (let j = i; j < lines.length; j++) {
      const currentLine = lines[j];
      for (let k = 0; k < currentLine.length; k++) {
        if (currentLine[k] === '{') {
          braceCount++;
          inFunction = true;
        } else if (currentLine[k] === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            skipUntil = j;
            break;
          }
        }
      }
      if (skipUntil === j) break;
    }
    
    // Also skip the window assignment line
    for (let j = skipUntil + 1; j < lines.length; j++) {
      if (lines[j].includes('window.renderProductionSchedule = renderProductionSchedule')) {
        skipUntil = j;
        break;
      }
      if (lines[j].trim() && !lines[j].trim().startsWith('//')) break;
    }
    
    continue;
  }
  
  if (i <= skipUntil) {
    continue;
  }
  
  filteredLines.push(line);
}

combinedJS += '\n' + filteredLines.join('\n');

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