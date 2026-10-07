/**
 * `npm run erp:reset`: delete the ERPNext site (its database and files: every record, POS session
 * and sale) by removing the Docker volumes. Asks first: type RESET to continue.
 *
 * Without a terminal to ask in (CI, scripts), it refuses unless told explicitly:
 *   npm run erp:reset -- --yes
 */
const { execFileSync } = require('child_process')
const readline = require('readline')

const COMPOSE = ['compose', '-p', 'erpnext-qa', '-f', 'docker/pwd.yml', '-f', 'docker/apps.yml']

function wipe() {
  console.log('Deleting the ERPNext site...')
  execFileSync('docker', [...COMPOSE, 'down', '-v'], { stdio: 'inherit' })
  console.log('Done. Next: npm run erp:up, then npm run erp:app (the tests' seed rebuilds their data)')
}

if (process.argv.includes('--yes')) {
  wipe()
} else if (!process.stdin.isTTY) {
  console.error('erp:reset deletes the ERPNext site. Not run: no terminal to confirm in. Use: npm run erp:reset -- --yes')
  process.exitCode = 1
} else {
  console.log('This deletes the ERPNext site: all its data, POS sessions and sales.')
  console.log('Deleting the project folders does NOT do this; this command does.')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Type RESET to continue (anything else cancels): ', (answer) => {
    rl.close()
    if (answer.trim() === 'RESET') wipe()
    else console.log('Cancelled. Nothing was deleted.')
  })
}
