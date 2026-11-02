# StoryStudio v2

A focused first step for a 2.5D animation studio: import separate images, arrange them as independent layers, edit transforms/depth, and save locally. No animation or camera features are included.

## Run

Requirements: Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

For native MP4 export, install FFmpeg with `libx264` and FFprobe, then run `npm run build && npm run studio` and open the printed loopback URL. The local service accepts only same-origin 1920×1080 PNG frames and encodes 1–30 seconds at 60 FPS. Temporary encoding files are removed after export; download the result in the browser. The Vite development server does not provide the export endpoint.

Build and run tests:

```sh
npm run build
npm test
npx playwright install chromium  # first time only
npm run test:e2e  # requires test-images/{background,foreground,character,jungle}.png
```

## Architecture

- `src/components/` — focused React UI for the layer list, properties, and workspace preview.
- `src/features/import/` — image validation, dimensions, thumbnails and initial layer defaults.
- `src/features/layers/` — standalone layer operations.
- `src/engine/` — PixiJS renderer; has no React dependency, caches texture resources and releases temporary image URLs on cleanup.
- `src/store/` — Zustand project state and editor selection/dirty status.
- `src/persistence/` — IndexedDB schema and project/asset repository.
- `src/types/` — versioned project, layer, and stored-asset contracts.

## Data model and behavior

Project metadata (format version 1) stores composition settings and ordered, stable layer IDs. Each layer references an asset record whose original image Blob lives independently in IndexedDB. Duplicates share that asset without copying the binary; their properties remain independent. `layerIds` lists layers from back to front, so the last listed layer renders on top. Images are kept at original dimensions and aspect ratio; oversized artwork receives a uniform fit scale. Position uses composition pixel coordinates, rotation uses degrees, opacity is 0–1, and depth is persisted as metadata.

## Implemented

PNG/JPEG/WebP multi-import and drag/drop; separate image layers and thumbnails; selection, rename, visibility, locking, forward/backward reorder, duplication and deletion; transform, opacity and depth controls; PixiJS composition rendering; IndexedDB save/reopen/reload; responsive Arrange workspace; unit/integration tests and a Playwright end-to-end workflow.

## Limitations

The optional reference is a preview-only overlay. Arrangement analyses same-sized images under a shared-origin assumption and uses alpha-masked, scale-aware colour matching for cropped images. Review the results: occlusion, inpainting, low-detail images, and scale changes outside 0.5–1.5 can prevent reliable matching; only high-confidence proposals are applied. Restore is available during the current session. Layer editing uses numeric inputs/sliders rather than direct canvas manipulation. Locking prevents property edits and deletion, but not reordering or visibility changes. IndexedDB assets are retained locally; there is no cloud sync, project export/import, camera, animation, or timeline. On open, the most recently saved project is restored; use the project menu to switch or create a project. Browser rendering support is required for PixiJS WebGL/WebGPU (Canvas fallback is not configured).
