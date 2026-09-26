const path = require('path');

const entries = {
    'scratch-vm': './vendor-shims/scratch-vm.js',
    'scratch-vm-argument-type': './vendor-shims/scratch-vm-argument-type.js',
    'scratch-vm-block-type': './vendor-shims/scratch-vm-block-type.js',
    'scratch-vm-sprite': './vendor-shims/scratch-vm-sprite.js',
    'scratch-vm-sb3': './vendor-shims/scratch-vm-sb3.js',
    'scratch-render': './vendor-shims/scratch-render.js',
    'scratch-audio': './vendor-shims/scratch-audio.js',
    'scratch-paint': './vendor-shims/scratch-paint.js',
    'scratch-paint-fonts': './vendor-shims/scratch-paint-fonts.js',
    'scratch-render-fonts': './vendor-shims/scratch-render-fonts.js',
    'scratch-blocks': './vendor-shims/scratch-blocks.js'
};

// Maps bare import specifiers in src/ to the generated ESM vendor files.
const manifest = {
    'scratch-vm': 'scratch-vm.mjs',
    'scratch-vm/src/extension-support/argument-type': 'scratch-vm-argument-type.mjs',
    'scratch-vm/src/extension-support/block-type': 'scratch-vm-block-type.mjs',
    'scratch-vm/src/sprites/sprite': 'scratch-vm-sprite.mjs',
    'scratch-vm/src/serialization/sb3': 'scratch-vm-sb3.mjs',
    'scratch-render': 'scratch-render.mjs',
    'scratch-audio': 'scratch-audio.mjs',
    'scratch-paint': 'scratch-paint.mjs',
    'scratch-paint/src/lib/fonts': 'scratch-paint-fonts.mjs',
    'scratch-render-fonts': 'scratch-render-fonts.mjs',
    'scratch-blocks': 'scratch-blocks.mjs'
};

const repoRoot = __dirname;

module.exports = {
    entries,
    manifest,
    webpackConfig: {
        mode: 'development',
        devtool: false,
        target: 'web',
        entry: entries,
        output: {
            path: path.resolve(repoRoot, 'vendor'),
            filename: '[name].mjs',
            chunkFilename: 'chunks/[name].mjs',
            module: true,
            library: {type: 'module'},
            publicPath: '/vendor/',
            clean: true
        },
        experiments: {
            outputModule: true
        },
        resolve: {
            modules: ['node_modules'],
            extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
            alias: {
                'scratch-render-fonts$': path.resolve(repoRoot, 'src/lib/tw-scratch-render-fonts/index.js')
            }
        },
        resolveLoader: {
            modules: ['node_modules'],
            alias: {
                'worker-loader': path.resolve(repoRoot, 'vendor-loaders/worker-stub-loader.js'),
                [path.resolve(repoRoot, 'node_modules/scratch-vm/src/extension-support/tw-load-script-as-plain-text.js')]:
                    path.resolve(repoRoot, 'vendor-loaders/plain-text-stub-loader.js')
            }
        },
        module: {
            rules: [
                {
                    test: /\.(js|jsx|ts|tsx)$/,
                    include: [
                        path.resolve(repoRoot, 'vendor-shims'),
                        /node_modules[\\/]scratch-[^\\/]+[\\/]src/
                    ],
                    use: {
                        loader: 'babel-loader',
                        options: {
                            babelrc: false,
                            configFile: false,
                            presets: [
                                ['@babel/preset-env', {modules: false}],
                                '@babel/preset-react',
                                '@babel/preset-typescript'
                            ]
                        }
                    }
                },
                {
                    test: /\.css$/,
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                modules: true,
                                importLoaders: 1,
                                localIdentName: '[name]_[local]_[hash:base64:5]',
                                camelCase: true
                            }
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                ident: 'postcss',
                                plugins: [
                                    require('postcss-import')(),
                                    require('postcss-simple-vars')(),
                                    require('autoprefixer')()
                                ]
                            }
                        }
                    ]
                },
                {
                    test: /\.less$/,
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                modules: true,
                                importLoaders: 1,
                                localIdentName: '[name]_[local]_[hash:base64:5]',
                                camelCase: true
                            }
                        },
                        'less-loader'
                    ]
                },
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg|jpeg|woff2|hex)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'assets/',
                        esModule: false
                    }
                }
            ]
        },
        optimization: {
            minimize: false,
            splitChunks: false,
            runtimeChunk: false,
            usedExports: false,
            providedExports: false,
            sideEffects: true,
            concatenateModules: false
        },
        performance: {
            hints: false
        },
        stats: {
            errors: true,
            warnings: false,
            errorDetails: true,
            colors: false
        }
    }
};
