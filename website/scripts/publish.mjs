// Copies the static export into ../docs, which GitHub Pages serves.
import { copyFileSync, cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
const docs = fileURLToPath(new URL("../../docs", import.meta.url));
if (!existsSync(out)) throw new Error("Run next build first");

// Next writes prefetch data as __next.docs/__PAGE__.txt but the client asks for
// __next.docs.__PAGE__.txt, so write a flat copy next to each one.
function flatten(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const f of readdirSync(full)) {
        const src = path.join(full, f);
        if (statSync(src).isFile()) copyFileSync(src, path.join(dir, `${name}.${f}`));
      }
    }
    flatten(full);
  }
}
flatten(out);

// Empty the folder rather than deleting it, so a server watching it keeps working.
if (existsSync(docs)) for (const f of readdirSync(docs)) rmSync(path.join(docs, f), { recursive: true, force: true });
cpSync(out, docs, { recursive: true });
writeFileSync(`${docs}/.nojekyll`, "");
console.log("Site copied to docs/");
