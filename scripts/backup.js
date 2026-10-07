/**
 * `npm run erp:backup`: a full backup of the ERPNext site, copied out of Docker into a dated folder.
 *
 *   <BACKUP_DIR>/2026-10-07_1030/
 *     *-database.sql.gz          every record: POS invoices, sessions, profiles, items, customers...
 *     *-files.tar                public attachments
 *     *-private-files.tar        private attachments
 *     *-site_config_backup.json  site settings, incl. the ENCRYPTION KEY (keep the folder private)
 *     manifest.json              when, which site, which apps and versions
 *
 * BACKUP_DIR comes from .env (e.g. G:\My Drive\ERPNext-Backups once Google Drive for desktop is
 * installed); without it, ../erpnext-backups next to this repository. The newest BACKUP_KEEP
 * backups are kept (default 30); older ones are deleted.
 */
require('./env')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const SITE = 'frontend'
const CONTAINER = 'erpnext-qa-backend-1'
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'erpnext-backups'))
const KEEP = Number(process.env.BACKUP_KEEP) || 30
const FOLDER = /^\d{4}-\d{2}-\d{2}_\d{4}(\d{2})?$/

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const bench = (...args) => docker('exec', CONTAINER, 'bench', '--site', SITE, ...args)

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function main() {
  console.log(`Backing up site "${SITE}"...`)
  const out = bench('backup', '--with-files')
  // bench prints one line per file: "Database: /home/frappe/.../x-database.sql.gz 1.0MiB"
  const files = [...out.matchAll(/^(Config|Database|Public|Private)\s*:\s*(\S+)/gm)].map((m) => ({ kind: m[1], path: m[2] }))
  if (!files.some((f) => f.kind === 'Database')) throw new Error(`bench backup printed no database file:\n${out}`)

  const dest = path.join(BACKUP_DIR, stamp())
  fs.mkdirSync(dest, { recursive: true })
  for (const f of files) docker('cp', `${CONTAINER}:${f.path}`, path.join(dest, path.posix.basename(f.path)))

  const apps = bench('list-apps').trim().split('\n').map((l) => l.trim().split(/\s+/).slice(0, 2).join(' '))
  const manifest = {
    site: SITE,
    created: new Date().toISOString(),
    apps,
    files: Object.fromEntries(files.map((f) => [f.kind.toLowerCase(), path.posix.basename(f.path)])),
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const size = fs.readdirSync(dest).reduce((sum, n) => sum + fs.statSync(path.join(dest, n)).size, 0)
  console.log(`Saved ${(size / 1024 / 1024).toFixed(1)} MB to ${dest}`)
  console.log(`Apps: ${apps.join(', ')}`)

  const old = fs.readdirSync(BACKUP_DIR).filter((n) => FOLDER.test(n)).sort().reverse().slice(KEEP)
  for (const n of old) fs.rmSync(path.join(BACKUP_DIR, n), { recursive: true, force: true })
  if (old.length) console.log(`Removed ${old.length} backup(s) older than the newest ${KEEP}.`)
  console.log('⚠ The folder holds the site\'s encryption key and all its data: keep it private.')
}

try {
  main()
} catch (err) {
  console.error(`BACKUP FAILED: ${err.message}`)
  process.exitCode = 1
}
