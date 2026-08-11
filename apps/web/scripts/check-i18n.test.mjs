import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compareCatalogParity,
  parseJsonText,
  runChecks,
  scanSourceFile,
} from './check-i18n.mjs';

test('detects duplicate JSON keys and keeps their source location', () => {
  const result = parseJsonText('{\n  "title": "one",\n  "title": "two"\n}', 'fixture.json');
  assert.equal(result.issues[0].code, 'duplicate-json-key');
  assert.deepEqual(result.issues[0].location, { line: 3, column: 3 });
});

test('compares interpolation and plural contracts for both catalogs', () => {
  const issues = [];
  const catalog = (locale, entries) => ({
    locale,
    namespace: 'common',
    relativePath: `locales/${locale}/common.json`,
    entries: new Map(Object.entries(entries)),
  });
  compareCatalogParity(new Map([
    ['en:common', catalog('en', { greeting: 'Hello {{name}}', item_one: 'one', item_other: 'many' })],
    ['ar:common', catalog('ar', { greeting: 'مرحبا {{user}}', item_one: 'واحد' })],
  ]), issues);
  assert.ok(issues.some(({ code }) => code === 'interpolation-mismatch'));
  assert.ok(issues.some(({ code }) => code === 'missing-arabic-key'));
  assert.ok(issues.some(({ code }) => code === 'plural-form-mismatch'));
});

test('flags empty and missing-key sentinel catalog values', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'track-i18n-catalog-'));
  try {
    await mkdir(path.join(fixtureRoot, 'src/i18n/locales/en'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'src/i18n/locales/ar'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'src/i18n/locales/en/common.json'), '{"empty":"","sentinel":"⟦missing:en:sentinel⟧"}\n');
    await writeFile(path.join(fixtureRoot, 'src/i18n/locales/ar/common.json'), '{"empty":"فارغ","sentinel":"قيمة"}\n');
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'scripts/i18n-literal-exemptions.json'), '{"version":1,"exemptions":[]}\n');
    const result = await runChecks({ webRoot: fixtureRoot });
    assert.ok(result.errors.some(({ code }) => code === 'empty-catalog-value'));
    assert.ok(result.errors.some(({ code }) => code === 'catalog-sentinel'));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('source guard catches visible literals but ignores tests and CSS by scope', () => {
  const result = scanSourceFile(
    `import { useTranslation } from 'react-i18next';\nexport function Example() { useTranslation('common'); return <button title="Save now">Save now</button>; }`,
    'src/routes/example.tsx',
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.hits.length, 2);
  assert.equal(result.hits[0].value, 'Save now');
});

test('source guard rejects English translation defaults', () => {
  const result = scanSourceFile(
    `import { useTranslation } from 'react-i18next';\nexport function Example() { const { t } = useTranslation('common'); return <p>{t('hello', { defaultValue: 'Hello' })}</p> }`,
    'src/routes/example.tsx',
  );
  assert.ok(result.issues.some(({ code }) => code === 'call-site-english-default'));
});

test('complete checker passes a minimal bundled catalog fixture', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'track-i18n-check-'));
  try {
    await mkdir(path.join(fixtureRoot, 'src/i18n/locales/en'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'src/i18n/locales/ar'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'src/routes'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'src/i18n/locales/en/common.json'), '{"hello":"Hello {{name}}"}\n');
    await writeFile(path.join(fixtureRoot, 'src/i18n/locales/ar/common.json'), '{"hello":"مرحبا {{name}}"}\n');
    await writeFile(path.join(fixtureRoot, 'src/routes/example.tsx'), [
      `import { useTranslation } from 'react-i18next'`,
      `export function Example() { const { t } = useTranslation('common'); return <p>{t('hello', { name: 'Track' })}</p> }`,
    ].join('\n'));
    await writeFile(path.join(fixtureRoot, 'scripts/i18n-literal-exemptions.json'), '{"version":1,"exemptions":[]}\n');
    const result = await runChecks({ webRoot: fixtureRoot });
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.catalogFiles, 2);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
