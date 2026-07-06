# AURORA Mock Site

AURORA is a static concept website for a futuristic headphone brand. This project was created as a portfolio piece to explore interactive product presentation, scroll-based animation, and 3D web design using plain HTML, CSS, JavaScript, Three.js, GSAP, and a GLB model.

## Live Site

Coming soon.

## Built With

- HTML
- CSS
- JavaScript
- Three.js
- GSAP (GreenSock Animation Platform)
- GLB 3D model
- Google Fonts

## Features

- Scroll-based 3D headphone movement
- Animated hero section
- Interactive product sections
- Responsive layout
- Mobile fallback experience
- Custom mock branding and visual direction
- Locally stored vendor modules for Three.js, GSAP, and ScrollTrigger

## Project Structure

AURORA Mock Site/
├── index.html
├── styles.css
├── script.js
├── assets/
├── public/
│   └── models/
│       └── headphones.glb
└── vendor/

## Required Runtime Files

The live site depends on the following root files:

- `index.html`
- `styles.css`
- `script.js`

The live site also requires these folders:

- `assets/`
- `public/`
- `vendor/`

## Required Assets

These files are referenced by the live page:

- `assets/aurora-headphones-rendering.png`
- `assets/logos/aurora-logo-no-text-white-wave-animated.svg`
- `assets/logos/aurora-text-only-white.svg`
- `assets/logos/aurora-logo-white-static.svg`
- `public/models/headphones.glb`
- `vendor/three.module.js`
- `vendor/GLTFLoader.js`
- `vendor/BufferGeometryUtils.js`
- `vendor/gsap.js`
- `vendor/ScrollTrigger.js`

## Files Not Required for Deployment

These are source, archive, or local-only files and are not required for the live site:

- `.DS_Store`
- `Open Aurora Site.command`
- `assets/source/`
- `assets/blend-preview/`
- unused files inside `assets/logos/`
- backup or older GLB files inside `public/models/`

## Vercel Deployment Notes

This is a static site. It should be deployed from the project root.

Recommended Vercel settings:

- Framework Preset: Other
- Build Command: Leave blank
- Output Directory: Leave blank
- Install Command: Leave blank

The model URL in `script.js` is:

`/public/models/headphones.glb?v=7`

Because of that, the `public` folder needs to remain at the project root for the model path to resolve correctly.

## Local Preview

From the project folder, run:

`python3 -m http.server 8000`

Then open:

`http://127.0.0.1:8000/`

## Project Purpose

This project was designed to practice creating a more immersive product landing page while keeping the visual direction simple, focused, and portfolio-ready.