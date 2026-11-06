const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const DEFAULT_SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const RELEASE_SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (System.getenv('DSH_RELEASE_STORE_FILE')) {
                storeFile file(System.getenv('DSH_RELEASE_STORE_FILE'))
                storePassword System.getenv('DSH_RELEASE_STORE_PASSWORD')
                keyAlias System.getenv('DSH_RELEASE_KEY_ALIAS')
                keyPassword System.getenv('DSH_RELEASE_KEY_PASSWORD')
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`;

const DEFAULT_RELEASE_TYPE = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_TYPE = `        release {
            signingConfig signingConfigs.release`;

module.exports = function withReleaseSigning(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const file = path.join(
        modConfig.modRequest.projectRoot,
        'android/app/build.gradle',
      );
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes(DEFAULT_SIGNING_CONFIGS) || !source.includes(DEFAULT_RELEASE_TYPE)) {
        throw new Error('Unexpected Android signing configuration');
      }
      const updated = source
        .replace(DEFAULT_SIGNING_CONFIGS, RELEASE_SIGNING_CONFIGS)
        .replace(DEFAULT_RELEASE_TYPE, RELEASE_TYPE);
      fs.writeFileSync(file, updated);
      return modConfig;
    },
  ]);
};
