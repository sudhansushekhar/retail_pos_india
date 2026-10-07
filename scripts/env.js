/**
 * Read .env (KEY=value lines) into process.env, without overriding what is already set.
 * A tiny stand-in for the dotenv package, so these scripts need no `npm install`.
 */
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', '.env')
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
