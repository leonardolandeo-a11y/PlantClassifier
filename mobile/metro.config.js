const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared sensor formatting is pure TypeScript; web React components are not imported.
config.watchFolders = [path.resolve(__dirname, '../frontend/src')];
module.exports = config;
