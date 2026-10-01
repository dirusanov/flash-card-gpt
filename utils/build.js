// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  path = require('path'),
  config = require('../webpack.config'),
  ZipPlugin = require('zip-webpack-plugin');

delete config.chromeExtensionBoilerplate;

config.mode = 'production';

config.plugins = (config.plugins || []).concat(
  new ZipPlugin({
    filename: 'build.zip',
    path: path.join(__dirname, '..'),
  })
);

webpack(config, function (err, stats) {
  if (err) {
    console.error(err);
    process.exitCode = 1;
    return;
  }
  if (stats.hasErrors()) {
    console.error(stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
  }
});
