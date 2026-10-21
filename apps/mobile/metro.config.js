const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...new Set([...(config.watchFolders ?? []), path.resolve(workspaceRoot, 'packages/shared')]),
  path.resolve(workspaceRoot, 'convex'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Expo native modules can be resolved from the workspace root in this
// monorepo. Keep React itself on the workspace version everywhere to avoid two
// React runtimes sharing one native tree (which breaks hooks such as useId).
const reactRoot = path.resolve(workspaceRoot, 'node_modules', 'react');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: reactRoot,
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Expo Router's dev-client bundle URL resolves this entry as a relative
  // `./node_modules/...` path. In this workspace pnpm hoists dependencies to
  // the repository root, so the entry is not physically inside app-local
  // node_modules. Point that generated entry request at the hoisted package.
  if (moduleName === './node_modules/expo-router/entry') {
    return context.resolveRequest(
      context,
      path.resolve(workspaceRoot, 'node_modules/expo-router/entry'),
      platform,
    );
  }

  // Expo's development bundle can also request native modules through
  // generated relative paths (for example, `./node_modules/expo-network/...`).
  // Those paths are relative to Metro's virtual app root, while pnpm hoists
  // the packages to the workspace root.
  const generatedNodeModule = moduleName.match(/^\.\/node_modules\/(.+)$/);
  if (generatedNodeModule) {
    const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
    const resolvedModule = path.resolve(workspaceNodeModules, generatedNodeModule[1]);
    const relativeModule = path.relative(workspaceNodeModules, resolvedModule);

    if (
      relativeModule !== '..' &&
      !relativeModule.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeModule)
    ) {
      return context.resolveRequest(context, resolvedModule, platform);
    }
  }

  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const reactModule = moduleName === 'react'
      ? reactRoot
      : path.resolve(reactRoot, '..', moduleName);

    return context.resolveRequest(context, reactModule, platform);
  }

  if (moduleName.startsWith('@/assets/')) {
    return context.resolveRequest(context, path.resolve(projectRoot, 'assets', moduleName.slice('@/assets/'.length)), platform);
  }

  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(context, path.resolve(projectRoot, 'src', moduleName.slice('@/'.length)), platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
