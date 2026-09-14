/*
 * Bundle the built app into one self-contained HTML file.
 *
 * The point is a preview that needs nothing: no clone, no install, no dev
 * server, no hosting. Double-click it and it runs. Map tiles still come from
 * the network, so it wants a connection, but everything else is inlined.
 *
 *   pnpm build:standalone   ->   dist-standalone/cooee.html
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const OUT_DIR = 'dist-standalone'
const OUT = join(OUT_DIR, 'cooee.html')

let html = readFileSync(join(DIST, 'index.html'), 'utf8')
const assets = readdirSync(join(DIST, 'assets'))

const cssFile = assets.find((f) => f.endsWith('.css'))
const jsFile = assets.find((f) => f.endsWith('.js'))
if (cssFile === undefined || jsFile === undefined) {
  throw new Error('expected one css and one js asset in dist/assets')
}

const css = readFileSync(join(DIST, 'assets', cssFile), 'utf8')
// A closing script tag inside a string literal would end the inline block
// early, so neutralise the sequence rather than trusting it not to appear.
const js = readFileSync(join(DIST, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script')

const favicon = readFileSync('public/favicon.svg', 'utf8')
const faviconUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`

// Replacer functions, not replacement strings: a bundle reliably contains
// "$&" and friends, which a string replacement would expand back into the
// matched tag — reinstating the very asset reference being inlined.
html = html
  .replace(/<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    /<script type="module"[^>]*src="[^"]*\.js"[^>]*><\/script>/,
    () => `<script type="module">${js}</script>`,
  )
  .replace(/href="[^"]*favicon\.svg"/, () => `href="${faviconUri}"`)

if (html.includes('assets/')) {
  throw new Error('an asset reference survived inlining; the file is not self-contained')
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, html)
console.log(`${OUT} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB, self-contained`)
