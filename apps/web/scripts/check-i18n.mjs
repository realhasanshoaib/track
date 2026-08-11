#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultWebRoot = path.resolve(scriptDirectory, '..');
const supportedLocales = new Set(['en', 'ar']);
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ignoredDirectories = new Set(['node_modules', 'dist', 'build', '.output', 'coverage', 'generated']);
const ignoredSourceSuffixes = ['.test.js', '.test.jsx', '.test.ts', '.test.tsx', '.spec.js', '.spec.jsx', '.spec.ts', '.spec.tsx'];
const userFacingPropNames = new Set([
  'aria-label', 'caption', 'description', 'errorMessage', 'helperText', 'label',
  'loadingMessage', 'placeholder', 'title', 'tooltip',
]);
const ignoredLiteralValues = new Set(['true', 'false', 'null', 'undefined', 'NaN']);
const exemptionCategories = new Set(['product/proper-name', 'user-content', 'provider-content', 'technical-value', 'test-fixture', 'non-user-visible']);
const missingSentinelPattern = /(?:__MISSING(?:_[A-Z]+)*__|MISSING[_ -]?(?:TRANSLATION|KEY)|TRANSLATION[_ -]?MISSING|⟦missing:)/i;

const issue = (code, message, filePath, location) => ({
  code,
  message,
  ...(filePath ? { path: filePath } : {}),
  ...(location ? { location } : {}),
});

function relativeToWebRoot(webRoot, filePath) {
  return path.relative(webRoot, filePath).split(path.sep).join('/');
}

function locationFromOffset(text, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function skipWhitespace(text, start) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function readJsonString(text, start) {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') {
      const raw = text.slice(start, index + 1);
      return { end: index + 1, value: JSON.parse(raw) };
    }
    index += 1;
  }
  throw new Error(`Unterminated JSON string at offset ${start}`);
}

function collectDuplicateJsonKeys(text) {
  const duplicates = [];

  function readValue(start, valuePath) {
    const index = skipWhitespace(text, start);
    if (text[index] === '{') return readObject(index, valuePath);
    if (text[index] === '[') return readArray(index, valuePath);
    if (text[index] === '"') return readJsonString(text, index).end;
    let end = index;
    while (end < text.length && !/[\s,\]}]/.test(text[end])) end += 1;
    if (end === index) throw new Error(`Expected a JSON value at offset ${index}`);
    return end;
  }

  function readObject(start, objectPath) {
    let index = skipWhitespace(text, start + 1);
    const keys = new Set();
    if (text[index] === '}') return index + 1;
    while (index < text.length) {
      const keyStart = index;
      const key = readJsonString(text, index);
      index = skipWhitespace(text, key.end);
      if (text[index] !== ':') throw new Error(`Expected ':' after JSON key at offset ${index}`);
      index = skipWhitespace(text, index + 1);
      const keyPath = objectPath ? `${objectPath}.${key.value}` : key.value;
      if (keys.has(key.value)) duplicates.push({ key: key.value, path: keyPath, location: locationFromOffset(text, keyStart) });
      keys.add(key.value);
      index = skipWhitespace(text, readValue(index, keyPath));
      if (text[index] === '}') return index + 1;
      if (text[index] !== ',') throw new Error(`Expected ',' or '}' at offset ${index}`);
      index = skipWhitespace(text, index + 1);
    }
    throw new Error(`Unterminated JSON object at offset ${start}`);
  }

  function readArray(start, arrayPath) {
    let index = skipWhitespace(text, start + 1);
    let itemIndex = 0;
    if (text[index] === ']') return index + 1;
    while (index < text.length) {
      index = skipWhitespace(text, readValue(index, `${arrayPath}[${itemIndex}]`));
      itemIndex += 1;
      if (text[index] === ']') return index + 1;
      if (text[index] !== ',') throw new Error(`Expected ',' or ']' at offset ${index}`);
      index = skipWhitespace(text, index + 1);
    }
    throw new Error(`Unterminated JSON array at offset ${start}`);
  }

  readValue(0, '');
  return duplicates;
}

export function parseJsonText(text, filePath = '<json>') {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      value: undefined,
      duplicates: [],
      issues: [issue('malformed-json', error instanceof Error ? error.message : 'Invalid JSON', filePath)],
    };
  }

  let duplicates;
  try {
    duplicates = collectDuplicateJsonKeys(text);
  } catch (error) {
    return {
      value,
      duplicates: [],
      issues: [issue('malformed-json', error instanceof Error ? error.message : 'Invalid JSON', filePath)],
    };
  }
  return {
    value,
    duplicates,
    issues: duplicates.map((duplicate) => issue(
      'duplicate-json-key',
      `Duplicate JSON key '${duplicate.key}' at '${duplicate.path}'.`,
      filePath,
      duplicate.location,
    )),
  };
}

function flattenCatalogValue(value, keyPath = '', output = new Map(), problems = []) {
  if (typeof value === 'string') {
    if (!value.trim()) problems.push({ kind: 'empty', key: keyPath });
    if (missingSentinelPattern.test(value)) problems.push({ kind: 'sentinel', key: keyPath });
    output.set(keyPath, value);
    return { output, problems };
  }
  if (Array.isArray(value)) {
    problems.push({ kind: 'non-string', key: keyPath, valueType: 'array' });
    return { output, problems };
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flattenCatalogValue(child, keyPath ? `${keyPath}.${key}` : key, output, problems);
    return { output, problems };
  }
  problems.push({ kind: 'non-string', key: keyPath, valueType: value === null ? 'null' : typeof value });
  return { output, problems };
}

async function walkJsonFiles(root) {
  const files = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkJsonFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(entryPath);
  }
  return files;
}

function catalogFileIdentity(localesRoot, filePath) {
  const relativePath = path.relative(localesRoot, filePath).split(path.sep).join('/');
  const segments = relativePath.split('/');
  if (segments.length < 2 || !supportedLocales.has(segments[0])) return undefined;
  return {
    locale: segments[0],
    namespace: segments.slice(1).join('/').replace(/\.json$/, ''),
  };
}

export async function readCatalogs(localesRoot, webRoot = path.resolve(localesRoot, '../../..')) {
  const issues = [];
  const catalogs = new Map();
  const files = await walkJsonFiles(localesRoot);
  if (files.length === 0) {
    issues.push(issue('missing-catalogs', 'No locale JSON files were found under src/i18n/locales.', relativeToWebRoot(webRoot, localesRoot)));
    return { catalogs, issues, files };
  }
  for (const filePath of files.sort()) {
    const identity = catalogFileIdentity(localesRoot, filePath);
    const relativePath = relativeToWebRoot(webRoot, filePath);
    if (!identity || !identity.namespace) {
      issues.push(issue('malformed-locale-path', 'Locale JSON must be en/ar under a locale directory with a namespace filename.', relativePath));
      continue;
    }
    const parsed = parseJsonText(await readFile(filePath, 'utf8'), relativePath);
    issues.push(...parsed.issues);
    if (parsed.value === undefined) continue;
    const flattened = flattenCatalogValue(parsed.value);
    for (const problem of flattened.problems) {
      const code = problem.kind === 'empty' ? 'empty-catalog-value' : problem.kind === 'sentinel' ? 'catalog-sentinel' : 'non-string-catalog-value';
      const message = problem.kind === 'empty'
        ? `Catalog value '${problem.key}' is empty.`
        : problem.kind === 'sentinel'
          ? `Catalog value '${problem.key}' contains a missing-key sentinel.`
          : `Catalog value '${problem.key}' must be a string, found ${problem.valueType}.`;
      issues.push(issue(code, message, relativePath));
    }
    const catalogKey = `${identity.locale}:${identity.namespace}`;
    if (catalogs.has(catalogKey)) {
      issues.push(issue('duplicate-catalog-namespace', `Namespace '${identity.namespace}' is declared more than once for ${identity.locale}.`, relativePath));
      continue;
    }
    catalogs.set(catalogKey, { ...identity, filePath, relativePath, entries: flattened.output });
  }
  return { catalogs, issues, files };
}

function interpolationVariables(value) {
  const variables = new Map();
  const pattern = /\{\{\s*(-?\s*[A-Za-z0-9_.-]+)(?:\s*,[^}]*)?\s*\}\}/g;
  for (const match of value.matchAll(pattern)) {
    const variable = match[1].replace(/^[-\s]+/, '');
    variables.set(variable, (variables.get(variable) ?? 0) + 1);
  }
  return variables;
}

function pluralGroups(entries) {
  const groups = new Map();
  for (const key of entries.keys()) {
    const match = key.match(/^(.*)_((?:zero|one|two|few|many|other|plural)(?:_\d+)?)$/);
    if (!match) continue;
    const forms = groups.get(match[1]) ?? new Set();
    forms.add(match[2]);
    groups.set(match[1], forms);
  }
  return groups;
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function describeSet(values) {
  return [...values].sort().join(', ');
}

export function compareCatalogParity(catalogs, issues = []) {
  const namespaces = new Set([...catalogs.values()].map((catalog) => catalog.namespace));
  for (const namespace of [...namespaces].sort()) {
    const english = catalogs.get(`en:${namespace}`);
    const arabic = catalogs.get(`ar:${namespace}`);
    if (!english || !arabic) {
      issues.push(issue('missing-namespace', `Namespace '${namespace}' must have both en and ar catalogs.`));
      continue;
    }
    const englishKeys = new Set(english.entries.keys());
    const arabicKeys = new Set(arabic.entries.keys());
    for (const key of [...englishKeys].filter((value) => !arabicKeys.has(value)).sort()) issues.push(issue('missing-arabic-key', `Arabic namespace '${namespace}' is missing key '${key}'.`, arabic.relativePath));
    for (const key of [...arabicKeys].filter((value) => !englishKeys.has(value)).sort()) issues.push(issue('missing-english-key', `English namespace '${namespace}' is missing key '${key}'.`, english.relativePath));
    for (const key of [...englishKeys].filter((value) => arabicKeys.has(value)).sort()) {
      const englishVariables = interpolationVariables(english.entries.get(key));
      const arabicVariables = interpolationVariables(arabic.entries.get(key));
      if (!setsEqual(new Set(englishVariables.keys()), new Set(arabicVariables.keys())) || [...englishVariables].some(([name, count]) => arabicVariables.get(name) !== count)) {
        issues.push(issue('interpolation-mismatch', `Interpolation variables differ for '${namespace}:${key}' (en: ${describeSet(englishVariables.keys()) || 'none'}; ar: ${describeSet(arabicVariables.keys()) || 'none'}).`, arabic.relativePath));
      }
    }
    const englishPlurals = pluralGroups(english.entries);
    const arabicPlurals = pluralGroups(arabic.entries);
    const pluralBases = new Set([...englishPlurals.keys(), ...arabicPlurals.keys()]);
    for (const base of [...pluralBases].sort()) {
      const englishForms = englishPlurals.get(base) ?? new Set();
      const arabicForms = arabicPlurals.get(base) ?? new Set();
      if (!setsEqual(englishForms, arabicForms)) issues.push(issue('plural-form-mismatch', `Plural forms differ for '${namespace}:${base}' (en: ${describeSet(englishForms) || 'none'}; ar: ${describeSet(arabicForms) || 'none'}).`, arabic.relativePath));
    }
  }
  return issues;
}

function stripSourceComments(sourceText) {
  return sourceText
    .replace(/\/\/[^\n]*/g, (comment) => ' '.repeat(comment.length))
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function looksLikeUserFacing(value) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || ignoredLiteralValues.has(trimmed)) return false;
  if (/^[\W_]+$/u.test(trimmed) || !/[\p{L}]/u.test(trimmed)) return false;
  if (/^(?:https?:\/\/|mailto:|tel:|data:)/i.test(trimmed)) return false;
  if (trimmed === 'Track' || trimmed === 'English' || trimmed === 'العربية') return false;
  return true;
}

export function scanSourceFile(sourceText, filePath = '<source>') {
  const source = stripSourceComments(sourceText);
  const hits = [];
  const issues = [];
  const seen = new Set();
  const addHit = (value, offset, context) => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!looksLikeUserFacing(trimmed)) return;
    const location = locationFromOffset(sourceText, offset);
    const key = `${location.line}:${location.column}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ path: filePath, location, value: trimmed, context });
  };

  for (const match of source.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) {
    const valueOffset = (match.index ?? 0) + match[0].indexOf(match[1]);
    if (source[match.index + match[0].lastIndexOf('<') + 1] === '/') addHit(match[1], valueOffset, 'jsx-text');
  }
  for (const match of source.matchAll(/\b([A-Za-z][\w-]*)\s*=\s*(["'])(.*?)\2/g)) {
    if (userFacingPropNames.has(match[1])) addHit(match[3], (match.index ?? 0) + match[0].indexOf(match[2]) + 1, `jsx-${match[1]}`);
  }
  for (const match of source.matchAll(/\b([A-Za-z][\w-]*)\s*=\s*\{\s*(["'])(.*?)\2\s*\}/g)) {
    if (userFacingPropNames.has(match[1])) addHit(match[3], (match.index ?? 0) + match[0].indexOf(match[2]) + 1, `jsx-${match[1]}`);
  }
  for (const match of source.matchAll(/\b(?:toast|alert|confirm|notify|setError|setSuccess|setMessage)\s*\(\s*(["'])(.*?)\1/g)) addHit(match[2], (match.index ?? 0) + match[0].indexOf(match[1]) + 1, 'user-facing-call');

  for (const match of source.matchAll(/\b(?:t|i18n\.t|translate)\s*\(\s*(["'])[^"']+\1\s*,\s*(["'])(.*?)\2/g)) {
    const valueOffset = (match.index ?? 0) + match[0].lastIndexOf(match[2]) + 1;
    addHit(match[3], valueOffset, 'translation-default');
    issues.push(issue('call-site-english-default', 'Translation call contains an English default; catalog values must own the copy.', filePath, locationFromOffset(sourceText, valueOffset)));
  }
  for (const match of source.matchAll(/\bdefaultValue\s*:\s*(["'])(.*?)\1/g)) {
    const valueOffset = (match.index ?? 0) + match[0].indexOf(match[1]) + 1;
    addHit(match[2], valueOffset, 'translation-default');
    issues.push(issue('call-site-english-default', 'Translation options contain an English defaultValue; catalog values must own the copy.', filePath, locationFromOffset(sourceText, valueOffset)));
  }
  for (const match of source.matchAll(/<Trans\b[^>]*\bi18nKey\s*=\s*(["']).*?\1[^>]*>\s*([^<{]+?)\s*<\/Trans>/gs)) {
    const valueOffset = (match.index ?? 0) + match[0].indexOf(match[2]);
    addHit(match[2], valueOffset, 'translation-default');
    issues.push(issue('call-site-english-default', 'Trans contains inline English fallback copy; catalog values must own the copy.', filePath, locationFromOffset(sourceText, valueOffset)));
  }
  const sentinel = source.match(missingSentinelPattern);
  if (sentinel?.index !== undefined) issues.push(issue('missing-key-sentinel', 'Source contains a missing-key sentinel.', filePath, locationFromOffset(sourceText, sentinel.index)));
  return { hits, issues };
}

async function walkSourceFiles(root) {
  const files = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkSourceFiles(entryPath));
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name)) && !ignoredSourceSuffixes.some((suffix) => entry.name.endsWith(suffix))) files.push(entryPath);
  }
  return files;
}

function shouldScanSource(sourceText, relativePath) {
  if (relativePath.startsWith('src/i18n/')) return false;
  return /\buseTranslation\s*\(|\buseLocale\s*\(|\bwithTranslation\s*\(/.test(sourceText);
}

function normalizeExemptionLocation(location) {
  if (typeof location === 'string') {
    const [line, column] = location.split(':').map(Number);
    return { line, ...(column ? { column } : {}) };
  }
  if (location && typeof location === 'object' && !Array.isArray(location)) return location;
  return undefined;
}

function matchesExemption(hit, exemption) {
  const targetPath = exemption.path.replace(/^apps\/web\//, '');
  const targetLocation = normalizeExemptionLocation(exemption.location);
  return hit.path === targetPath && targetLocation?.line === hit.location.line && (!targetLocation.column || targetLocation.column === hit.location.column);
}

function validateExemptions(value, filePath, issues) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.exemptions)) {
    issues.push(issue('malformed-exemptions', 'Literal exemptions must be an object with version 1 and an exemptions array.', filePath));
    return [];
  }
  const seen = new Set();
  const valid = [];
  for (const [index, exemption] of value.exemptions.entries()) {
    const location = normalizeExemptionLocation(exemption?.location);
    const pathIsValid = typeof exemption?.path === 'string' && /^(?:apps\/web\/)?src\/.+\.(?:js|jsx|ts|tsx)$/.test(exemption.path);
    const categoryIsValid = typeof exemption?.category === 'string' && exemptionCategories.has(exemption.category);
    const locationIsValid = Number.isInteger(location?.line) && location.line > 0 && (!location.column || (Number.isInteger(location.column) && location.column > 0));
    if (!pathIsValid || !categoryIsValid || !locationIsValid || typeof exemption?.reason !== 'string' || !exemption.reason.trim()) {
      issues.push(issue('malformed-exemptions', `Exemption ${index} must declare a source path, location, allowed category, and reason.`, filePath));
      continue;
    }
    const key = `${exemption.path}:${location.line}:${location.column ?? ''}`;
    if (seen.has(key)) issues.push(issue('duplicate-exemption', `Literal exemption '${key}' is listed more than once.`, filePath));
    seen.add(key);
    valid.push(exemption);
  }
  return valid;
}

async function readExemptions(filePath, webRoot) {
  const relativePath = relativeToWebRoot(webRoot, filePath);
  try {
    const parsed = parseJsonText(await readFile(filePath, 'utf8'), relativePath);
    const issues = [...parsed.issues];
    return { exemptions: parsed.value === undefined ? [] : validateExemptions(parsed.value, relativePath, issues), issues };
  } catch {
    return { exemptions: [], issues: [issue('missing-exemptions', 'Literal exemptions file was not found.', relativePath)] };
  }
}

async function scanLiterals(sourceRoot, webRoot, exemptions) {
  const issues = [];
  const hits = [];
  const files = [];
  for (const filePath of (await walkSourceFiles(sourceRoot)).sort()) {
    const relativePath = relativeToWebRoot(webRoot, filePath);
    const sourceText = await readFile(filePath, 'utf8');
    if (!shouldScanSource(sourceText, relativePath)) continue;
    files.push(filePath);
    const result = scanSourceFile(sourceText, relativePath);
    issues.push(...result.issues);
    hits.push(...result.hits);
  }
  const matched = new Set();
  for (const hit of hits) {
    const exemptionIndex = exemptions.findIndex((exemption) => matchesExemption(hit, exemption));
    if (exemptionIndex === -1) issues.push(issue('unexempted-user-facing-literal', `Likely user-facing literal '${hit.value}' (${hit.context}) needs a catalog key or an approved exemption.`, hit.path, hit.location));
    else matched.add(exemptionIndex);
  }
  for (let index = 0; index < exemptions.length; index += 1) {
    if (!matched.has(index)) issues.push(issue('stale-exemption', `Literal exemption '${exemptions[index].path}' does not match a current source literal.`, exemptions[index].path, normalizeExemptionLocation(exemptions[index].location)));
  }
  return { issues, hits, files };
}

function catalogKeys(catalogs) {
  const keys = new Set();
  for (const catalog of catalogs.values()) {
    for (const key of catalog.entries.keys()) {
      keys.add(key);
      keys.add(`${catalog.namespace}.${key}`);
    }
  }
  return keys;
}

async function sourceTranslationKeyIssues(sourceFiles, catalogs, webRoot) {
  const issues = [];
  const keys = catalogKeys(catalogs);
  const callPattern = /\b(?:t|i18n\.t|translate)\s*\(\s*(["'])([^"']+)\1/g;
  for (const filePath of sourceFiles) {
    const relativePath = relativeToWebRoot(webRoot, filePath);
    const text = await readFile(filePath, 'utf8');
    const namespaces = new Set([...text.matchAll(/\buseTranslation\s*\(\s*(?:['"]([^'"]+)['"])?/g)].map((match) => match[1] ?? 'common'));
    for (const match of text.matchAll(callPattern)) {
      const key = match[2];
      const offset = (match.index ?? 0) + match[0].indexOf(match[1]) + 1;
      if (key.includes('.') ? !keys.has(key) : ![...namespaces].some((namespace) => catalogs.has(`en:${namespace}`) && catalogs.get(`en:${namespace}`).entries.has(key))) {
        issues.push(issue('missing-translation-key', `Translation call references missing key '${key}'.`, relativePath, locationFromOffset(text, offset)));
      }
    }
  }
  return issues;
}

export async function runChecks(options = {}) {
  const webRoot = path.resolve(options.webRoot ?? defaultWebRoot);
  const localesRoot = path.resolve(options.localesRoot ?? path.join(webRoot, 'src/i18n/locales'));
  const sourceRoot = path.resolve(options.sourceRoot ?? path.join(webRoot, 'src'));
  const exemptionsPath = path.resolve(options.exemptionsPath ?? path.join(webRoot, 'scripts/i18n-literal-exemptions.json'));
  const errors = [];
  const catalogsResult = await readCatalogs(localesRoot, webRoot);
  errors.push(...catalogsResult.issues);
  compareCatalogParity(catalogsResult.catalogs, errors);
  const exemptionsResult = await readExemptions(exemptionsPath, webRoot);
  errors.push(...exemptionsResult.issues);
  const literalResult = await scanLiterals(sourceRoot, webRoot, exemptionsResult.exemptions);
  errors.push(...literalResult.issues);
  errors.push(...await sourceTranslationKeyIssues(literalResult.files, catalogsResult.catalogs, webRoot));
  errors.sort((left, right) => `${left.path ?? ''}:${left.location?.line ?? 0}:${left.location?.column ?? 0}:${left.code}:${left.message}`.localeCompare(`${right.path ?? ''}:${right.location?.line ?? 0}:${right.location?.column ?? 0}:${right.code}:${right.message}`));
  return {
    errors,
    summary: {
      catalogFiles: catalogsResult.files.length,
      sourceFiles: literalResult.files.length,
      literalHits: literalResult.hits.length,
    },
  };
}

function parseCliArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    if (argument === '--help') {
      console.log('Usage: node scripts/check-i18n.mjs [--web-root PATH] [--locales-root PATH] [--source-root PATH] [--exemptions PATH]');
      return null;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    const key = argument.slice(2).replaceAll('-', '');
    const optionName = { webroot: 'webRoot', localesroot: 'localesRoot', sourceroot: 'sourceRoot', exemptions: 'exemptionsPath' }[key];
    if (!optionName) throw new Error(`Unknown option ${argument}`);
    options[optionName] = value;
    index += 1;
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCliArguments(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid command line');
    return 2;
  }
  if (!options) return 0;
  const result = await runChecks(options);
  if (result.errors.length === 0) {
    console.log(`i18n check passed: ${result.summary.catalogFiles} catalog files, ${result.summary.sourceFiles} opted-in source files, ${result.summary.literalHits} approved literal hits.`);
    return 0;
  }
  console.error(`i18n check failed with ${result.errors.length} issue(s):`);
  for (const currentIssue of result.errors) {
    const location = currentIssue.location ? `:${currentIssue.location.line}:${currentIssue.location.column}` : '';
    console.error(`- ${currentIssue.code}${currentIssue.path ? ` ${currentIssue.path}${location}` : ''}: ${currentIssue.message}`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().then((exitCode) => { process.exitCode = exitCode; });
