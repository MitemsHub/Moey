// Strips files the Sites uploader refuses (hidden files and source maps) from the
// build output, so `deploy.json` can point straight at dist/.
//
// Uses fileURLToPath rather than URL.pathname: on Windows the latter yields
// "/C:/..." which Node then resolves as "C:\C:\...".
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist', import.meta.url))

function clean(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name.startsWith('.') || name.endsWith('.map')) {
      rmSync(path, { recursive: true, force: true })
      continue
    }
    if (statSync(path).isDirectory()) clean(path)
  }
}

clean(root)
console.log(`cleaned ${root}`)
