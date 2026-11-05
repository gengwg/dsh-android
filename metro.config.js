const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [
  ...new Set([
    'import',
    'require',
    'react-native',
    ...(config.resolver.unstable_conditionNames ?? []),
    'node',
  ]),
];

const nativeClientArtifacts = Object.fromEntries(
  [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-controller',
    '@deepseek-ai/dsh-client-file-upload',
  ].map((packageName) => {
    const packageRoot = path.dirname(require.resolve(`${packageName}/package.json`));
    return [`${packageName}/client`, path.join(packageRoot, 'lib/types/client/index.js')];
  }),
);

const defaultResolveRequest = config.resolver.resolveRequest;

// rc.5 publishes browser-only high-level /client entries; select its pinned plain ESM on native.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const artifact = platform === 'web' ? undefined : nativeClientArtifacts[moduleName];
  if (artifact) {
    return { filePath: artifact, type: 'sourceFile' };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
