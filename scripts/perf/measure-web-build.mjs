import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const outputDir = resolve(repoRoot, process.env.WEB_OUTPUT_DIR ?? 'apps/web/.output/public')
const budgetPath = resolve(repoRoot, 'e2e/performance/budgets.json')
const outputPath = resolve(repoRoot, process.env.BUNDLE_OUTPUT_PATH ?? 'artifacts/performance/web-bundle.json')

function filesIn(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}

if (!statSafe(outputDir)?.isDirectory()) {
  throw new Error(`Web production output is missing: ${outputDir}`)
}

const assets = filesIn(outputDir).map((path) => ({
  path: relative(repoRoot, path),
  bytes: statSync(path).size,
  extension: extname(path),
}))
const javascript = assets.filter((asset) => ['.js', '.mjs'].includes(asset.extension))
const stylesheets = assets.filter((asset) => asset.extension === '.css')
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8')).bundle
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  outputDir: relative(repoRoot, outputDir),
  publicBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
  javascriptBytes: javascript.reduce((total, asset) => total + asset.bytes, 0),
  largestJavascriptBytes: Math.max(...javascript.map((asset) => asset.bytes), 0),
  stylesheetBytes: stylesheets.reduce((total, asset) => total + asset.bytes, 0),
  routes: Object.fromEntries(['workspace', 'sign-in', 'about'].map((route) => [
    route,
    assets.filter((asset) => asset.path.toLowerCase().includes(route)).reduce((total, asset) => total + asset.bytes, 0),
  ])),
  largestAssets: assets.toSorted((left, right) => right.bytes - left.bytes).slice(0, 10),
}

const failures = [
  ['publicBytes', report.publicBytes, budgets.publicBytes],
  ['javascriptBytes', report.javascriptBytes, budgets.javascriptBytes],
  ['largestJavascriptBytes', report.largestJavascriptBytes, budgets.largestJavascriptBytes],
  ['stylesheetBytes', report.stylesheetBytes, budgets.stylesheetBytes],
].filter(([, actual, budget]) => actual > budget)

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ outputPath: relative(repoRoot, outputPath), ...report }, null, 2))

if (failures.length > 0) {
  for (const [name, actual, budget] of failures) console.error(`${name} budget exceeded: ${actual} > ${budget}`)
  process.exitCode = 1
}

function statSafe(path) {
  try {
    return statSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}
