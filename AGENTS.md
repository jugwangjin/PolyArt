# AGENTS.md

## Cursor Cloud specific instructions

This is a client-side-only React + Vite + TypeScript Polygon Art Generator (폴리곤 아트 만들기). There is no backend, database, or external API at runtime.

### Key commands

- **Dev server:** `npm run dev` (Vite on port 3000, `--host=0.0.0.0`)
- **Lint:** `npm run lint` (runs `tsc --noEmit`)
- **Build:** `npm run build`
- See `package.json` `scripts` for full list.

### Notes

- The Vite config sets `base: '/polyart/'`, so the app is served at `http://localhost:3000/polyart/`.
- `package.json` lists `express`, `better-sqlite3`, `dotenv`, and `@google/genai` as dependencies but **none are used** in the source code (leftover from Google AI Studio scaffolding). They install without issue but are not needed at runtime.
- No automated test suite exists; manual browser testing is the primary validation method.
- The app processes images entirely client-side using Canvas API, Sobel edge detection, and Delaunay triangulation. Upload an image to trigger automatic polygon art conversion.
