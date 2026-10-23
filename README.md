# Mori & Mill Menu

A 3D page-turning flipbook of the Mori & Mill menu, built with [three.js](https://threejs.org/).

**View it:** open the GitHub Pages link for this repository, or download the repo and double-click `index.html`.

| Edition | Folder | Link |
|---|---|---|
| Full menu | `/` | https://automationlunarcorestudios-byte.github.io/mori-and-mill-menu/ |
| Christmas menu | `christmas/` | https://automationlunarcorestudios-byte.github.io/mori-and-mill-menu/christmas/ |

Both editions share `flipbook.js` and `flipbook.css`; each has its own `index.html` and `pages/`.

## Turning pages

- Drag a page, or click the right or left page
- Arrow keys, Home / End
- Mouse wheel or pinch to zoom
- Top-left button shows every page

## Changing things

- **Buttons (ORDER NOW / RESERVE NOW) and their links, speed, page bend, sound:** the `CONFIG` block at the top of `flipbook.js`. To change one edition only, add `<script>window.FLIPBOOK_CONFIG = { buttons: [ … ] }</script>` before `flipbook.js` in that edition's `index.html`.
- **Colours:** the `:root` block at the top of `flipbook.css`. The Christmas edition overrides them in a `<style>` in `christmas/index.html`.
- **Pages:** replace the artwork and run `build-pages.ps1`. It rebuilds an edition's `pages/` from its `catalog-manifest.json`:
  - Full menu: `build-pages.ps1`
  - Christmas: `build-pages.ps1 -Source ..\christmas-menu -Out christmas\pages`
