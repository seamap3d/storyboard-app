# ApeOnAWhale Storyboard (alpha01)

A single-file HTML storyboard application for filmmakers and visual storytellers. Create, organize, and visualize your shots with image uploads, character consistency tracking, and automated PDF script breakdowns.

## ✨ Features

- **Visual Storyboarding**: Upload images for each shot with 16:9 aspect ratio frames
- **Character Bible**: Maintain character consistency across shots
- **PDF Script Breakdown**: Upload screenplays as PDFs and generate shot cards automatically
- **Drag & Drop Reordering**: Easily reorganize your shots
- **Image Management**: Upload, display, and remove reference images for each shot
- **Export/Import**: Save and load projects as JSON files (including images)
- **Print/PDF Ready**: Print your storyboard for production use
- **Password Protection**: Basic authentication for deployed sites
- **Keyboard Shortcuts**: `N` for new shot, `E` to export, `P` to print

## 🚀 Deployment to Netlify

### Method 1: Drag & Drop
1. Zip the entire project folder
2. Go to [Netlify](https://www.netlify.com) and drag the zip file to deploy
3. Your app will be live instantly with a random URL

### Method 2: GitHub Integration
1. Push this repository to GitHub
2. Connect your GitHub repo to Netlify
3. Netlify will auto-deploy on every push

### Password Protection
The app includes a `_headers` file with basic authentication:
- Default credentials: `username:password`
- Update the `_headers` file to change credentials
- Format: `Basic-Auth: yourusername:yourpassword`

## 📁 Image Storage

### Static Images
- Place images in the `/images` folder
- They'll be deployed as static assets
- Access via: `https://yoursite.netlify.app/images/filename.jpg`

### Uploaded Images
- Images uploaded via the app are stored as base64 data
- Saved in browser localStorage and JSON exports
- No server required - works entirely client-side

## 🎬 Usage

### Creating Shots
1. Click "New Shot" or press `N`
2. Fill in scene details, shot type, lens, camera movement
3. Add action/composition description
4. Upload a reference image using "Upload Image" button
5. Generate AI-ready prompts with the "Generate Prompt" button

### Character Consistency
- Define characters in the "Character Bible" section
- Characters are auto-referenced in generated prompts
- Helps maintain visual consistency across shots

### Script Breakdown
1. Select a PDF in the "Upload PDF Script" panel
2. Click "Upload & Auto-Breakdown" to parse scene headings (`INT.` / `EXT.`)
3. Shot cards are created automatically with editable fields populated from the script
4. Refine each shot with specific details

### Project Management
- Export your storyboard as JSON (includes images)
- Import previously saved projects
- Print or save as PDF for production use

## 🔧 Technical Details

- **Single File App**: Core logic in `index.html` with a companion `styles.css`
- **CDN-Powered**: Tailwind CSS, Google Fonts, and PDF.js loaded via CDN
- **Client-Side**: No server or database required
- **Responsive**: Works on desktop and mobile devices
- **Browser Storage**: Auto-saves to localStorage

## 📝 File Structure

```
storyboard-app/
├── index.html          # Main application
├── styles.css         # Custom global styles
├── _headers           # Netlify authentication
├── images/            # Static image assets
└── README.md         # This file
```

## 🛡️ Security Note

The basic authentication in `_headers` provides minimal security. For sensitive projects, consider:
- Using Netlify Identity for proper user management
- Implementing client-side encryption for stored data
- Using environment variables for credentials

---

Built as a single HTML file for easy hosting on GitHub Pages, Netlify, or any static hosting service.

## 🧭 Release Notes

- **alpha01** (current): Adds PDF screenplay upload and automated shot card generation, refreshed ApeOnAWhale branding, and persistent storage migration.
