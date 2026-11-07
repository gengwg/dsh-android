import { assertDshRuntimeCapabilities } from './checks';
import { installRuntimePolyfills } from './polyfills';

installRuntimePolyfills();
assertDshRuntimeCapabilities();

// Keep third-party attribution notices in the packaged application.
void require('../../assets/third-party-notices.html');
