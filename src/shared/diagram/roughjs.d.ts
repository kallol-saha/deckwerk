/**
 * Types for rough.js's bundled ES module, the same build draw.io ships as
 * js/rough/rough.min.js (roughjs 4.6.6); the package declares types only
 * for its `bin` modules.
 */
declare module 'roughjs/bundled/rough.esm.js' {
  import type { Config } from 'roughjs/bin/core';
  import type { RoughGenerator } from 'roughjs/bin/generator';

  const rough: {
    generator(config?: Config): RoughGenerator;
    newSeed(): number;
  };
  export default rough;
}
