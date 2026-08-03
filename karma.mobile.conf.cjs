module.exports = function configureMobileKarma(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    reporters: ['progress', 'kjhtml'],
    client: {
      clearContext: false,
      jasmine: { random: false },
    },
    customLaunchers: {
      ChromeHeadlessMobile: {
        base: 'ChromeHeadless',
        flags: [
          '--window-size=500,760',
          '--force-device-scale-factor=2.5',
          '--high-dpi-support=1',
        ],
      },
    },
    browsers: ['ChromeHeadlessMobile'],
  });
};
