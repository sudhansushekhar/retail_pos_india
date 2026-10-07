/**
 * `npm run erp:restore`: put a backup made by `npm run erp:backup` back onto the ERPNext site.
 *
 *   npm run erp:restore                      the newest backup in BACKUP_DIR
 *   npm run erp:restore -- 2026-10-07_103000 that backup
 *   npm run erp:restore -- "G:\My Drive\ERPNext-Backups\2026-10-07_103000"   a folder anywhere
 *
 * Everything on the site now is REPLACED by the backup (asks you to type RESTORE first; from a
 * script, add --yes). Then it restores the site's encryption key from the backup, migrates (in
 * case the apps are newer than the backup) and clears the cache.
 */
require('./env')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { execFileSync } = require('child_process')

const SITE = 'frontend'
const CONTAINER = 'erpnext-qa-backend-1'
const DB_ROOT_PASSWORD = process.env.DB_ROOT_PASSWORD || 'admin' // docker/pwd.yml, local only
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'erpnext-backups'))
const FOLDER = /^\d{4}-\d{2}-\d{2}_\d{4}(\d{2})?$/

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const bench = (...args) => docker('exec', CONTAINER, 'bench', '--site', SITE, ...args)

function pickBackup(arg) {
  if (arg) {
    const direct = path.resolve(arg)
    if (fs.existsSync(path.join(direct, 'manifest.json'))) return direct
    const named = path.join(BACKUP_DIR, arg)
    if (fs.existsSync(path.join(named, 'manifest.json'))) return named
    throw new Error(`No backup at ${arg} (looked in ${direct} and ${named})`)
  }
  if (!fs.existsSync(BACKUP_DIR)) throw new Error(`No backups yet: ${BACKUP_DIR} does not exist`)
  const newest = fs.readdirSync(BACKUP_DIR).filter((n) => FOLDER.test(n)).sort().pop()
  if (!newest) throw new Error(`No backups in ${BACKUP_DIR}`)
  return path.join(BACKUP_DIR, newest)
}

function restore(dir, manifest) {
  const f = manifest.files
  const tmp = '/tmp/erp-restore'
  docker('exec', CONTAINER, 'rm', '-rf', tmp)
  docker('exec', CONTAINER, 'mkdir', '-p', tmp)
  for (const name of Object.values(f)) docker('cp', path.join(dir, name), `${CONTAINER}:${tmp}/${name}`)

  console.log('Restoring the database and files (a minute or two)...')
  const args = ['restore', `${tmp}/${f.database}`, '--db-root-password', DB_ROOT_PASSWORD, '--force']
  if (f.public) args.push('--with-public-files', `${tmp}/${f.public}`)
  if (f.private) args.push('--with-private-files', `${tmp}/${f.private}`)
  bench(...args)

  // The backup's encryption key decrypts what the site stored encrypted (e.g. passwords of email
  // accounts). It is set, never printed.
  if (f.config) {
    const config = JSON.parse(fs.readFileSync(path.join(dir, f.config), 'utf8'))
    if (config.encryption_key) bench('set-config', 'encryption_key', config.encryption_key)
  }

  console.log('Migrating and clearing the cache...')
  bench('migrate')
  bench('clear-cache')
  docker('exec', CONTAINER, 'rm', '-rf', tmp)
  console.log('Restored. Reload ERPNext in the browser (Ctrl+Shift+R) and sign in again.')
}

function main() {
  const arg = process.argv.slice(2).find((a) => a !== '--yes')
  const dir = pickBackup(arg)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  console.log(`Backup:  ${dir}`)
  console.log(`Made:    ${new Date(manifest.created).toLocaleString()}`)
  console.log(`Apps:    ${manifest.apps.join(', ')}`)
  console.log('This REPLACES everything on the site now (records, POS sessions, sales) with the backup.')

  if (process.argv.includes('--yes')) return restore(dir, manifest)
  if (!process.stdin.isTTY) {
    console.error('Not run: no terminal to confirm in. Use: npm run erp:restore -- --yes')
    process.exitCode = 1
    return
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Type RESTORE to continue (anything else cancels): ', (answer) => {
    rl.close()
    if (answer.trim() === 'RESTORE') {
      try {
        restore(dir, manifest)
      } catch (err) {
        console.error(`RESTORE FAILED: ${err.stderr || err.message}`)
        process.exitCode = 1
      }
    } else console.log('Cancelled. Nothing was changed.')
  })
}

try {
  main()
} catch (err) {
  console.error(`RESTORE FAILED: ${err.message}`)
  process.exitCode = 1
}
