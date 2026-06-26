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

// 4. The monorepo mixes React versions: the web app pins React 18 while this
// Expo (SDK 54) app needs React 19 + react-native 0.81. npm hoists react-native
// to the repo root, where — via hierarchical lookup — it would otherwise resolve
// the root's React 18. Mixing two React copies in one bundle crashes at runtime
// ("Cannot read property 'S'/'default' of undefined"). Force EVERY `react` /
// `react-dom` request (including react-native's own) to the single React 19
// copy nested in this package, so the whole bundle shares one React instance.
const singleReact = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};
config.resolver.extraNodeModules = {
  ...singleReact,
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

const mobileModules = path.resolve(projectRoot, 'node_modules');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Pin react / react-dom (and their subpaths like react/jsx-runtime) to the
  // single React 19 copy nested in this package, no matter who imports them.
  if (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-dom/')
  ) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [mobileModules] }),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
