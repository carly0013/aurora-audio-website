# AURORA Mock Site

AURORA is a static concept website for a futuristic headphone brand. This project was created as a portfolio piece to explore interactive product presentation, scroll-based animation, and 3D web design using HTML, CSS, JavaScript, Three.js, GSAP, and a GLB model.

## Built With

- HTML
- CSS
- JavaScript
- Three.js
- GSAP
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

```text
AURORA Mock Site/
├── index.html
├── styles.css
├── script.js
├── assets/
├── public/
│   └── models/
│       └── headphones.glb
└── vendor/
```

## Core Files

The live site is powered by the following root files:

- `index.html`
- `styles.css`
- `script.js`

It also uses the following project folders:

- `assets/`
- `public/`
- `vendor/`

## Referenced Assets

The page references the following assets:

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

## Additional Source Files

The project also contains source, archive, and local-only files that are not part of the live site experience, including:

- `.DS_Store`
- `Open Aurora Site.command`
- `assets/source/`
- `assets/blend-preview/`
- unused logo variations inside `assets/logos/`
- backup or older GLB files inside `public/models/`

## Deployment

AURORA is a static site and is structured to deploy from the project root.

The current model path in `script.js` is:

```js
/public/models/headphones.glb?v=7
```

The `public` folder remains at the project root so the 3D model path resolves correctly on deployment.

## Local Preview

A local preview can be started with:

```bash
python3 -m http.server 8000
```

Then viewed at:

```text
http://127.0.0.1:8000/
```

## Project Purpose

This project was designed to practice creating a more immersive product landing page while keeping the visual direction simple, focused, and portfolio-ready.
