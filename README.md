# Think Real

Website for Think Real, a real estate investment consultancy in Limassol, Cyprus.

A static site: five pages built from shared parts by one Python script. No framework, no npm.

## Build

```
python3 build.py
```

This writes `index.html`, `cyprus.html`, `greece.html`, `middleeast.html` and `contact.html` from `pages/`, `parts/`, `css/` and `js/`, plus `artifact.html`, the whole site as a single file. Run it after any change, then commit the rebuilt pages.

## Layout

| Path | What it is |
| --- | --- |
| `build.py` | the generator |
| `css/style.css` | the stylesheet |
| `js/main.js` | all behaviour |
| `pages/*.body.html` | the content of each page |
| `parts/` | nav and footer, shared by every page |
| `media/` | photographs as WebP, and their real sizes in `manifest.json` |
| `vendor/motion.min.js` | [Motion](https://motion.dev) 12.23.12, MIT, inlined into every page at build |
