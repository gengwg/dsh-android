import { assertDshRuntimeCapabilities } from './checks';
import { installRuntimePolyfills } from './polyfills';

installRuntimePolyfills();
assertDshRuntimeCapabilities();
