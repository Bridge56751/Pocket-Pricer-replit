const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withFirebaseStaticFramework(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');
      if (!contents.includes('$RNFirebaseAsStaticFramework')) {
        contents = '$RNFirebaseAsStaticFramework = true\n' + contents;
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);
}

module.exports = withFirebaseStaticFramework;
