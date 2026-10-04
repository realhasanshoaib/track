import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const isolatedRoot = join(mkdtempSync('/tmp/track-e2e-project-'), 'repo')
const isolatedRootParent = dirname(isolatedRoot)
const namespace = process.env.TRACK_E2E_NAMESPACE ?? `pw-${process.pid.toString(36)}`
const fixtureToken = process.env.TRACK_E2E_FIXTURE_TOKEN ?? randomUUID().replaceAll('-', '')
const fixturePassword = process.env.VITE_DEV_AUTH_BYPASS_PASSWORD ?? 'track-e2e-local-password'
const siteUrl = 'http://127.0.0.1:4173'
const envFile = join(mkdtempSync('/tmp/track-e2e-env-'), 'convex.env')
const convexEnvFile = join(mkdtempSync('/tmp/track-e2e-convex-env-'), 'fixture.env')
const metadataPath = process.env.TRACK_E2E_METADATA_PATH ?? join(repoRoot, 'artifacts/e2e/local-stack.json')
const childProcesses = []

cpSync(repoRoot, isolatedRoot, {
  recursive: true,
  filter: (source) => {
    const relativePath = source.slice(repoRoot.length + 1)
    if (!relativePath) return true
    const segments = relativePath.split('/')
    const excludedDirectories = new Set([
      '.convex',
      '.expo',
      '.git',
      '.output',
      '.turbo',
      '.worktrees',
      '.wrangler',
      'android',
      'artifacts',
      'build',
      '.credentials',
      'coverage',
      'ios',
      'node_modules',
      'playwright-report',
      'scratchpad',
      'test-results',
    ])
    if (segments.some((segment) => excludedDirectories.has(segment))) return false
    const basename = segments.at(-1) ?? ''
    if (basename.startsWith('.env')) return false
    return true
  },
})
// The workspace packages are only needed for Convex bundling; reuse the installed dependency graph.
symlinkSync(join(repoRoot, 'node_modules'), join(isolatedRoot, 'node_modules'), 'dir')
// Preserve the web workspace's React/React DOM resolution rather than the mobile hoist.
symlinkSync(join(repoRoot, 'apps/web/node_modules'), join(isolatedRoot, 'apps/web/node_modules'), 'dir')

writeFileSync(envFile, 'CONVEX_DEPLOYMENT=anonymous-agent\n')
writeFileSync(convexEnvFile, [
  'TRACK_E2E_FIXTURE=1',
  `TRACK_E2E_FIXTURE_TOKEN=${fixtureToken}`,
  'DEV_AUTH_BYPASS=1',
  `SITE_URL=${siteUrl}`,
  `BETTER_AUTH_URL=${siteUrl}`,
  'TRACK_COMPANY_MODEL_ENABLED=false',
  'TRACK_TASKS_ENABLED=true',
  'TRACK_THREADS_ENABLED=true',
].join('\n') + '\n')

const supportedNodeDirs = [
  ...(process.versions.node.startsWith('24.') ? [dirname(process.execPath)] : []),
  '/opt/homebrew/opt/node@24/bin',
]
const supportedNodeDir = supportedNodeDirs.find((directory) => existsSync(join(directory, 'node')))
if (!supportedNodeDir) throw new Error('Track E2E local stack requires Node 24')

const blockedEnvironmentKeys = new Set([
  'APNS_DEVELOPMENT_PRIVATE_KEY',
  'APNS_PRODUCTION_PRIVATE_KEY',
  'AUTH_SECRET',
  'BETTER_AUTH_SECRET',
  'CLOUDFLARE_API_TOKEN',
  'CONVEX_DEPLOY_KEY',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'FCM_V1_SERVICE_ACCOUNT_JSON',
  'GOOGLE_CLIENT_SECRET_WEB',
  'OPENROUTER_API_KEY',
  'TOTP_ENCRYPTION_SECRET',
  'VAPID_PRIVATE_KEY',
])
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    !blockedEnvironmentKeys.has(key) &&
    !/(?:API_KEY|PASSWORD|PRIVATE|SECRET|SERVICE_ACCOUNT|TOKEN)/i.test(key),
  ),
)
const childEnv = {
  ...inheritedEnvironment,
  CONVEX_AGENT_MODE: 'anonymous',
  CONVEX_DEPLOYMENT: 'anonymous-agent',
  PATH: `${supportedNodeDir}:${process.env.PATH ?? ''}`,
}

function start(command, args, extraEnv = {}, cwd = isolatedRoot) {
  const child = spawn(command, args, {
    cwd,
    env: { ...childEnv, ...extraEnv },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  childProcesses.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return child
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, {
      cwd: isolatedRoot,
      env: { ...childEnv, ...extraEnv },
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || stdout || error.message}`))
        return
      }
      resolvePromise(stdout)
    })
  })
}

async function waitForOutput(child, pattern, timeoutMs) {
  const startedAt = Date.now()
  let output = ''
  const onData = (chunk) => {
    output += String(chunk)
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (pattern.test(output)) return output
      if (child.exitCode !== null) throw new Error(`local stack child exited before readiness (${child.exitCode})`)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
    }
    throw new Error(`timed out waiting for local stack readiness: ${output.slice(-2000)}`)
  } finally {
    child.stdout.off('data', onData)
    child.stderr.off('data', onData)
  }
}

async function runFixtureCommand(functionName, args) {
  await run('pnpm', [
    'exec', 'convex', 'run', '--deployment', 'anonymous-agent', functionName,
    JSON.stringify(args),
    '--identity', JSON.stringify({
      subject: 'demo:track-developer',
      email: 'developer@track.local',
      name: 'Track Developer',
    }),
    '--typecheck', 'disable',
    '--codegen', 'disable',
  ])
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now()
  let lastFailure = 'no response'
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(5_000),
      })
      response.body?.cancel().catch(() => {})
      if (response.status >= 200 && response.status < 400) {
        console.log(`E2E web ready: ${url} (${response.status})`)
        return
      }
      lastFailure = `HTTP ${response.status}`
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`timed out waiting for E2E web readiness: ${lastFailure}`)
}

async function stopChild(child) {
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      if (child.exitCode === null) child.kill(signal)
    }
  }
  signalGroup('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
  ])
  signalGroup('SIGKILL')
}

let cleaned = false
async function cleanup() {
  if (cleaned) return
  cleaned = true
  for (const child of childProcesses.toReversed()) await stopChild(child)
  rmSync(metadataPath, { force: true })
  rmSync(isolatedRootParent, { recursive: true, force: true })
  rmSync(dirname(envFile), { recursive: true, force: true })
  rmSync(dirname(convexEnvFile), { recursive: true, force: true })
}

// Playwright normally gives the webServer command a graceful shutdown window,
// but keep a synchronous process-group fallback for timeout/error paths where
// the parent can exit before an async signal handler finishes. The children
// are detached intentionally, so killing the runner alone is not sufficient.
process.on('exit', () => {
  for (const child of childProcesses) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // The child group may already have been reaped by cleanup().
    }
  }
  rmSync(metadataPath, { force: true })
})

process.on('SIGINT', () => { void cleanup().finally(() => process.exit(130)) })
process.on('SIGTERM', () => { void cleanup().finally(() => process.exit(143)) })

// If the Playwright supervisor is force-killed on a timeout, Node does not
// deliver a signal to this detached process. Detect that orphaning and run the
// same cleanup path instead of leaving a local Convex/Vite stack behind.
const supervisorPid = process.ppid
const supervisorWatch = setInterval(() => {
  let supervisorAlive = true
  try {
    process.kill(supervisorPid, 0)
  } catch {
    supervisorAlive = false
  }
  if (process.ppid !== 1 && supervisorAlive) return
  clearInterval(supervisorWatch)
  void cleanup().finally(() => process.exit(143))
}, 1_000)
supervisorWatch.unref()

async function main() {
  const convex = start('pnpm', [
    'exec', 'convex', 'dev',
    '--env-file', envFile,
    '--typecheck', 'disable',
    '--codegen', 'disable',
    '--tail-logs', 'disable',
  ])
  const convexOutput = await waitForOutput(convex, /Convex functions ready|Unable to start push|DeploymentNotConfiguredForNodeActions/, 120_000)
  if (/Unable to start push|DeploymentNotConfiguredForNodeActions/.test(convexOutput)) {
    throw new Error('local Convex could not deploy the fixture backend')
  }
  const convexUrlMatch = convexOutput.match(/http:\/\/127\.0\.0\.1:\d+/)
  if (!convexUrlMatch) throw new Error('local Convex did not report a client URL')
  const convexUrl = convexUrlMatch[0]
  const convexSiteUrl = convexUrl.replace(/:(\d+)$/, (_, port) => `:${Number.parseInt(port, 10) + 1}`)

  await run('pnpm', [
    'exec', 'convex', 'env', 'set', '--deployment', 'anonymous-agent', '--from-file', convexEnvFile, '--force',
  ])
  await runFixtureCommand('e2eFixtures:seed', { namespace, token: fixtureToken })

  mkdirSync(dirname(metadataPath), { recursive: true })
  writeFileSync(metadataPath, JSON.stringify({
    schemaVersion: 1,
    convexUrl,
    convexSiteUrl,
    deployment: 'anonymous-agent',
    nodeDir: supportedNodeDir,
    namespace,
    token: fixtureToken,
    isolatedRoot,
    fixtureIdentity: {
      subject: 'demo:track-developer',
      email: 'developer@track.local',
      name: 'Track Developer',
    },
  }, null, 2) + '\n', { mode: 0o600 })

  const webEnv = {
    VITE_CONVEX_URL: convexUrl,
    VITE_CONVEX_SITE_URL: convexSiteUrl,
    VITE_CONVEX_URL_PROD: convexUrl,
    VITE_CONVEX_SITE_URL_PROD: convexSiteUrl,
    CONVEX_URL: convexUrl,
    CONVEX_SITE_URL: convexSiteUrl,
    SITE_URL: siteUrl,
    BETTER_AUTH_URL: siteUrl,
    VITE_DEV_AUTH_BYPASS: '1',
    VITE_DEV_AUTH_BYPASS_PASSWORD: fixturePassword,
    VITE_REACT_GRAB: '0',
    VITE_DEVTOOLS: '0',
    TRACK_E2E_FIXTURE: '1',
    TRACK_E2E_FIXTURE_TOKEN: fixtureToken,
  }
  if (process.env.TRACK_E2E_PRODUCTION === '1') {
    // Build only the disposable checkout; never reuse or overwrite a developer's output.
    // pnpm 12 refuses script task state beneath the reused node_modules symlink.
    const webRoot = join(isolatedRoot, 'apps/web')
    const build = start('node', [join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build'], webEnv, webRoot)
    const [code] = await once(build, 'exit')
    if (code !== 0) throw new Error(`E2E production build failed (${code})`)
    start('node', [
      join(repoRoot, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
      '--config', '.output/server/wrangler.json', '--local', '--ip', '127.0.0.1', '--port', '4173',
      '--var', `VITE_CONVEX_URL_PROD:${convexUrl}`,
      '--var', `VITE_CONVEX_SITE_URL_PROD:${convexSiteUrl}`,
    ], webEnv, webRoot)
  } else {
    start('pnpm', ['--filter', '@track/web', 'dev', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], webEnv, repoRoot)
  }
  await waitForHttp(`${siteUrl}/sign-in`, 180_000)

  await new Promise(() => {})
}

try {
  await main()
} catch (error) {
  await cleanup()
  throw error
}
