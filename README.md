# Mori & Mill Menu

A 3D page-turning flipbook of the Mori & Mill menu, built with [three.js](https://threejs.org/).

**View it:** open the GitHub Pages link for this repository, or download the repo and double-click `index.html`.

## Turning pages

- Drag a page, or click the right or left page
- Arrow keys, Home / End
- Mouse wheel or pinch to zoom
- Top-left button shows every page

## Changing things

- **Button text, link, speed, page bend, sound:** the `CONFIG` block at the top of the script in `index.html`
- **Colours:** the `:root` block at the top of the `<style>` in `index.html`
- **Pages:** replace the artwork and run `build-pages.ps1`. It rebuilds `pages/` from `catalog-manifest.json`.
