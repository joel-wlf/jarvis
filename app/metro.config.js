// Metro config: lets the app import the shared contract from ../packages/contract/src directly,
// so the types and fixtures stay one source of truth without a build step.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const contractSrc = path.resolve(__dirname, '../packages/contract/src')

config.watchFolders = [...(config.watchFolders ?? []), contractSrc]

const aliases = {
  '@jarvis/contract': path.join(contractSrc, 'index.ts'),
  '@jarvis/contract/fixtures': path.join(contractSrc, 'fixtures.ts'),
}

const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (aliases[moduleName]) return { type: 'sourceFile', filePath: aliases[moduleName] }
  // The contract is ESM and imports './cards.js'; map that to the .ts source.
  if (context.originModulePath.startsWith(contractSrc) && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return { type: 'sourceFile', filePath: path.resolve(path.dirname(context.originModulePath), moduleName.replace(/\.js$/, '.ts')) }
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
