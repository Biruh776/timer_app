#!/usr/bin/env node
/* Bundles index.html + still.css + still.js + scenes.js into a single
 * self-contained still.html, with no dependencies of any kind.
 *
 *   node build.js
 *
 * You don't need this to develop — just open index.html. It's here for when you
 * want one file to host, email, or drop on a USB stick.
 */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

let html = read('index.html');

// stylesheet -> <style>
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="([^"]+)">/,
  (_, href) => `<style>\n${read(href).trimEnd()}\n</style>`
);

// scripts -> one <script>, concatenated in the order index.html loads them
const srcs = [...html.matchAll(/[ \t]*<script src="([^"]+)"><\/script>\n?/g)];
if (!srcs.length) throw new Error('no <script src> tags found in index.html');

const code = srcs
  .map(m => `/* ===== ${m[1]} ===== */\n${read(m[1]).trimEnd()}`)
  .join('\n\n');

// drop every <script src> tag, then fold the code into the boot script
for (const m of srcs) html = html.replace(m[0], '');
html = html.replace(
  /<script>start\(\);<\/script>/,
  `<script>\n(() => {\n${code}\n\nstart();\n})();\n</script>`
);

// the sources declare 'use strict' individually; once wrapped, one is enough
html = html.replace(/^'use strict';\n/gm, '');
html = html.replace(/\(\(\) => \{\n/, "(() => {\n'use strict';\n");

const out = path.join(dir, 'still.html');
fs.writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built still.html  ${kb} KB  (${srcs.length} scripts inlined)`);
