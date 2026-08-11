import { SUPPORTED_LOCALES, type Locale } from './locale'

export type Catalog = {
  readonly [key: string]: string | Catalog
}

export type BundledResources = {
  readonly [locale in Locale]: Readonly<Record<string, Catalog>>
}

const catalogModules = import.meta.glob<Catalog>('./locales/*/*.json', {
  eager: true,
  import: 'default',
})

function createBundledResources(
  modules: Readonly<Record<string, Catalog>>,
): BundledResources {
  const resources: Record<Locale, Record<string, Catalog>> = {
    en: {},
    ar: {},
  }

  for (const locale of SUPPORTED_LOCALES) {
    const prefix = `./locales/${locale}/`
    for (const [path, catalog] of Object.entries(modules)) {
      if (!path.startsWith(prefix) || !path.endsWith('.json')) continue
      const namespace = path.slice(prefix.length, -'.json'.length)
      if (namespace) resources[locale][namespace] = catalog
    }
  }

  return resources
}

export const bundledResources = createBundledResources(catalogModules)

export const bundledNamespaces = Object.freeze(
  Array.from(
    new Set(
      SUPPORTED_LOCALES.flatMap((locale) =>
        Object.keys(bundledResources[locale]),
      ),
    ),
  ).sort(),
)
