import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const confirmationVariable = 'CONFIRM_CONVEX_PRODUCTION_DEPLOYMENT'

export function readConvexDeployment(environmentText) {
  for (const rawLine of environmentText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator === -1 || line.slice(0, separator).trim() !== 'CONVEX_DEPLOYMENT') continue

    const value = line.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1)
    }
    return value
  }

  return null
}

export function requireConfirmedProductionDeployment(environmentText, confirmation) {
  const deployment = readConvexDeployment(environmentText)
  if (!deployment?.startsWith('prod:')) {
    throw new Error('convex.prod.env must select a production deployment with CONVEX_DEPLOYMENT=prod:<deployment>')
  }
  if (confirmation !== deployment) {
    throw new Error(`Set ${confirmationVariable} to the exact deployment selector ${deployment}`)
  }
  return deployment
}

async function runConvexProductionDeploy() {
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const environmentFile = new URL('../convex.prod.env', import.meta.url)
  const environmentText = await readFile(environmentFile, 'utf8')
  const deployment = requireConfirmedProductionDeployment(
    environmentText,
    process.env[confirmationVariable],
  )

  console.log(`Deploying the confirmed Convex production target ${deployment}`)
  await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'convex', 'deploy', '--env-file', 'convex.prod.env'],
      { cwd: repositoryRoot, stdio: 'inherit' },
    )
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Convex production deployment stopped by signal ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`Convex production deployment exited with code ${code ?? 'unknown'}`))
        return
      }
      resolve()
    })
  })
}

const entryPath = process.argv[1]
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  runConvexProductionDeploy().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
