/**
 * The version the guard reports. The bundle script replaces `__CODEMAPS_GUARD_VERSION__` with the
 * version of package.json at build time; outside a bundle (tests, running from sources) there is
 * nothing to replace and a development marker is used.
 */

declare const __CODEMAPS_GUARD_VERSION__: string | undefined;

/** Version of this guard build, matching the release it was packed with. */
export const GUARD_VERSION: string =
  typeof __CODEMAPS_GUARD_VERSION__ === 'string' ? __CODEMAPS_GUARD_VERSION__ : '0.0.0-dev';
