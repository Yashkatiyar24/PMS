// Copies the OCR runtime out of node_modules into public/, so the app serves it
// itself: no CDN at runtime, works offline once cached, and the assets can never
// drift from the installed package version. Runs on postinstall.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = (...p) => join(root, "public", "ocr", ...p)
mkdirSync(out("core"), { recursive: true })
mkdirSync(out("lang"), { recursive: true })

copyFileSync(join(root, "node_modules/tesseract.js/dist/worker.min.js"), out("worker.min.js"))
// The worker picks the right build for the browser; we only ever ask for the LSTM engine.
const core = join(root, "node_modules/tesseract.js-core")
for (const f of readdirSync(core)) if (f.includes("-lstm.wasm")) copyFileSync(join(core, f), out("core", f))
// Int-quantised English data: digits and Latin letters are all an ID number needs.
copyFileSync(join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), out("lang", "eng.traineddata.gz"))
console.log("ocr assets copied to public/ocr")
