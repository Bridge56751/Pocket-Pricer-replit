const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname)];
config.resolver.blockList = [
  /\.local\/.*/,
  /\.git\/.*/,
];

module.exports = config;
