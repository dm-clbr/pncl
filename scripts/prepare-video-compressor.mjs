import { mkdir, copyFile } from "node:fs/promises";
await mkdir(new URL("../public/ffmpeg/", import.meta.url), { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(
    new URL(`../node_modules/@ffmpeg/core/dist/esm/${name}`, import.meta.url),
    new URL(`../public/ffmpeg/${name}`, import.meta.url),
  );
}

for (const name of ["worker.js", "const.js", "errors.js"]) {
  await copyFile(
    new URL(`../node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`, import.meta.url),
    new URL(`../public/ffmpeg/${name}`, import.meta.url),
  );
}
