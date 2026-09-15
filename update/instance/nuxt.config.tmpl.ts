// Thei instance configuration.
//
// Everything that makes this site work lives in the `thei` package; this file
// only says where the content directory is and where a build should land.
// `content/` next to this file holds all of your data.
export default defineNuxtConfig({
  extends: ['thei'],
  srcDir: '.',

  // An in-place update builds into a staging directory first and swaps it in at
  // the very end, so the running site keeps serving from an intact build.
  // Leave this alone unless you know you need to.
  nitro: process.env.THEI_BUILD_DIR
    ? { output: { dir: process.env.THEI_BUILD_DIR } }
    : {},
});
