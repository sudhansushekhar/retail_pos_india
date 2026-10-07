/**
 * `npm run erp:app`: install this app (docker/apps.yml) on the Docker site. Safe to run again:
 * an app already installed is migrated instead, which re-runs its setup (fields, settings).
 */
const { execFileSync } = require('child_process')

const SITE = 'frontend'
const CONTAINER = 'erpnext-qa-backend-1'
const APPS = ['retail_pos_india'] // this app

const bench = (...args) =>
  execFileSync('docker', ['exec', CONTAINER, 'bench', '--site', SITE, ...args], { encoding: 'utf8' })

const installed = bench('list-apps')
for (const app of APPS) {
  if (new RegExp(`^${app}\\b`, 'm').test(installed)) {
    console.log(`${app}: installed, migrating`)
    bench('migrate')
  } else {
    console.log(`${app}: installing`)
    bench('install-app', app)
  }
}
console.log(bench('list-apps').trim())
