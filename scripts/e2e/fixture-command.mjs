import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const metadataPath = process.env.TRACK_E2E_METADATA_PATH ?? new URL('../../artifacts/e2e/local-stack.json', import.meta.url)
const operation = process.argv[2] ?? 'reset'

if (!['reset', 'seed', 'performanceReset', 'quoteReset'].includes(operation)) {
  throw new Error(`Unsupported fixture operation: ${operation}`)
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
if (metadata.schemaVersion !== 1 || !metadata.isolatedRoot || !metadata.namespace || !metadata.token) {
  throw new Error('Invalid local E2E stack metadata')
}

const { stdout } = await execFileAsync('pnpm', [
  'exec',
  'convex',
  'run',
  '--deployment',
  metadata.deployment,
  `e2eFixtures:${operation}`,
  JSON.stringify({ namespace: metadata.namespace, token: metadata.token }),
  '--identity',
  JSON.stringify(metadata.fixtureIdentity),
  '--typecheck',
  'disable',
  '--codegen',
  'disable',
], {
  cwd: metadata.isolatedRoot,
  env: {
    ...process.env,
    CONVEX_AGENT_MODE: 'anonymous',
    CONVEX_DEPLOYMENT: metadata.deployment,
    PATH: metadata.nodeDir ? `${metadata.nodeDir}:${process.env.PATH ?? ''}` : process.env.PATH,
  },
  maxBuffer: 8 * 1024 * 1024,
})

if (stdout.trim()) process.stdout.write(stdout)
