process.env.NODE_ENV = 'production';
process.argv = [process.argv[0], require.resolve('webpack/bin/webpack.js'), ...process.argv.slice(2)];
require('webpack/bin/webpack.js');
