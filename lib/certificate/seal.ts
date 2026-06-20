// Certificate seal — GENERIC PLACEHOLDER in this starter.
//
// The reference app embedded a branded gold seal as a base64 PNG data URI so it
// travels INSIDE the serverless function bundle (public/ is CDN-only on Vercel
// and is NOT on the function filesystem, so reading from public/ at runtime
// renders nothing in production — it only "works" in `next dev`).
//
// TO USE YOUR OWN SEAL:
//   1. Create your seal PNG (e.g. 360x360) and put it at public/brand/seal.png
//   2. Encode it: `base64 -i public/brand/seal.png` (macOS) / `base64 -w0 ...` (Linux)
//   3. Paste the result below as the data URI.
//
// The placeholder below is a tiny transparent 1x1 PNG so certificate generation
// still runs end-to-end without shipping anyone else's branding.
export const SEAL_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDdwGqGAAAAAElFTkSuQmCC"
