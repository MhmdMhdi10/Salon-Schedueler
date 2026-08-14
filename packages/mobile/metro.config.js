// Metro config for the Expo app inside the npm-workspaces monorepo.
// Watches the repo root so `@salon/shared` (a sibling workspace package) and
// the hoisted root `node_modules` resolve correctly.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so changes in packages/shared are picked up.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both the app and the hoisted root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Let Metro follow the symlinked workspace package.
config.resolver.disableHierarchicalLookup = false;

// 4. The monorepo intentionally keeps separate renderers: web uses React 18,
// while Expo (SDK 57) uses React 19 + react-native 0.86. Force every React
// request inside the native bundle to its one React 19 copy; sharing the web
// React 18 copy would crash the native renderer at runtime.
const singleReact = {
  react: path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-dom': path.dirname(require.resolve('react-dom/package.json', { paths: [projectRoot] })),
};
config.resolver.extraNodeModules = {
  ...singleReact,
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Pin react / react-dom (and their subpaths like react/jsx-runtime) to the
  // single native copy, no matter who imports them.
  if (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-dom/')
  ) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
