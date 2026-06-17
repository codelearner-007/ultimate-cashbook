const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

// getSentryExpoConfig wraps Expo's default Metro config and adds Sentry's
// debug-id / source-map support so production stack traces are de-minified.
const config = getSentryExpoConfig(__dirname);

const stubPath = path.resolve(__dirname, 'src/shims/usePanResponder.js');

// Preserve any resolver Sentry installed, then layer the web-only shim on top.
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === './usePanResponder') {
    return { filePath: stubPath, type: 'sourceFile' };
  }
  return (baseResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
