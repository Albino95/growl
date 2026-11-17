// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    // unstable_transformImportMeta: zustand's ESM build reads import.meta.env,
    // which breaks the classic-script web bundle without this.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
