# Development Setup

## Overview
The ApeOnAWhale Storyboard now uses a **modular development structure** that builds to a single HTML file for distribution.

## Project Structure

```
storyboard-app/
├── src/                          # Development files
│   ├── styles.css               # Extracted CSS styles
│   └── scripts/                 # JavaScript modules
│       ├── state.js            # Application state and constants
│       ├── elements.js         # DOM element references  
│       ├── utils.js            # Helper functions and tab management
│       ├── shotManagement.js   # Shot CRUD operations
│       └── productionSchedule.js # Production schedule rendering
├── build/                       # Built output (single file)
│   └── index.html              # Final deployable file
├── index.html                   # Original monolithic file (still works)
├── build.js                     # Build script
├── package.json                 # Build commands
└── README.md                    # Usage documentation
```

## Development Workflow

### 1. Setup
```bash
# No dependencies needed! Just Node.js for the build script
# The app works entirely client-side
```

### 2. Development
Edit files in the `src/` directory:
- **CSS**: `src/styles.css`
- **JavaScript**: Individual modules in `src/scripts/`
- **HTML**: The template is in the original `index.html` (for now)

### 3. Building
```bash
# Build the single HTML file
npm run build
# or
node build.js
```

### 4. Testing
```bash
# Test the original during development
npm run dev
# Opens http://localhost:8000

# Test the built version  
cd build && python3 -m http.server 8001
# Opens http://localhost:8001
```

### 5. Deployment
```bash
# Build for production
npm run deploy

# Deploy the build/ directory to:
# - Netlify (drag & drop the build/ folder)
# - GitHub Pages (copy build/ contents to gh-pages branch)
# - Any static host (upload build/ contents)
```

## Module Overview

### `state.js`
- Application state object
- Constants (shot types, lens options, etc.)
- Storage keys

### `elements.js`  
- DOM element references
- Centralized element access

### `utils.js`
- Helper functions (uid generation, shot selection, etc.)
- Layout management
- Tab switching logic

### `shotManagement.js`
- Shot CRUD operations
- Shot rendering logic
- Shot data persistence

### `productionSchedule.js`
- Production schedule rendering
- Date/location grouping
- Scene heading organization

## Benefits

✅ **Maintainable**: Clean separation of concerns  
✅ **Single-file output**: Same deployment model  
✅ **No runtime deps**: Still works entirely client-side  
✅ **Better git diffs**: Changes are isolated to relevant modules  
✅ **Easier debugging**: Functions are logically grouped  
✅ **Simple build**: One command builds everything  

## Migration Notes

- The original `index.html` still works as-is
- New development should use the `src/` structure
- The build process combines everything back into a single file
- No functionality changes - just better organization

## Adding New Features

1. **New JavaScript function**: Add to appropriate module in `src/scripts/`
2. **New CSS**: Add to `src/styles.css`  
3. **New HTML**: Currently add to the original `index.html` template
4. **Build**: Run `npm run build` to generate `build/index.html`
5. **Test**: Verify both development and built versions work

## Build Process Details

The `build.js` script:
1. Reads the original `index.html`
2. Extracts CSS from `src/styles.css` 
3. Combines JavaScript modules (partially implemented)
4. Generates a single `build/index.html` file
5. Copies deployment files (`_headers`, JSON templates)

## Next Steps

The modular structure is set up and working. Future improvements could include:
- Full JavaScript extraction to modules
- HTML template system  
- CSS preprocessing
- Minification for production
- Automated testing

But for now, you have a much more maintainable codebase that still delivers a single-file application! 🎬