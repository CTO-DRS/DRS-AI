module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@services': './src/services',
            '@hooks': './src/hooks',
            '@contexts': './src/contexts',
            '@i18n': './src/i18n',
            '@theme': './src/theme',
            '@types': './src/types',
          },
        },
      ],
    ],
  };
};
