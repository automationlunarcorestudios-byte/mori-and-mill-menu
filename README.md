# Mori & Mill Menu

A 3D page-turning flipbook of the Mori & Mill menu, built with [three.js](https://threejs.org/).

**View it:** open the GitHub Pages link for this repository, or download the repo and double-click `index.html`.

| Edition | Folder | Link |
|---|---|---|
| Main menu (main link to share) | `christmas/` | https://automationlunarcorestudios-byte.github.io/mori-and-mill-menu/christmas/ |
| Main menu (same, site root) | `/` | https://automationlunarcorestudios-byte.github.io/mori-and-mill-menu/ |
| 16-page Christmas promo | `christmas-promo/` | https://automationlunarcorestudios-byte.github.io/mori-and-mill-menu/christmas-promo/ |

All of them share `flipbook.js` and `flipbook.css`, plus the Christmas theme in `christmas/` (`theme.css`, `decor.js`, `music/`). The main menu's pages live in `pages/` and are used by both `/` and `christmas/`; the promo has its own `christmas-promo/pages/`.

## Turning pages

- Drag a page, or click the right or left page
- Arrow keys, Home / End
- Mouse wheel or pinch to zoom
- Top-left button shows every page

## Changing things

- **Buttons (ORDER NOW / RESERVE NOW) and their links, speed, page bend, sound:** the `CONFIG` block at the top of `flipbook.js`. To change one edition only, add `<script>window.FLIPBOOK_CONFIG = { buttons: [ … ] }</script>` before `flipbook.js` in that edition's `index.html`.
- **Colours:** the Christmas colours are in `christmas/theme.css`; the plain defaults are at the top of `flipbook.css`.
- **Pages:** replace the artwork and run `build-pages.ps1`. It rebuilds an edition's `pages/` from its `catalog-manifest.json`:
  - Main menu: `build-pages.ps1`
  - Christmas promo: `build-pages.ps1 -Source ..\christmas-menu -Out christmas-promo\pages`
