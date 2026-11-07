const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withThirdPartyNotices(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const source = path.join(projectRoot, 'assets/third-party-notices.html');
      const target = path.join(
        projectRoot,
        'android/app/src/main/assets/third-party-notices.html',
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      return modConfig;
    },
  ]);
};
