// webpack.config.js
const path = require('path');

const isProduction = process.env.NODE_ENV == 'production';

const config = {
    entry: './src/main.ts',
    output: {
        path: path.resolve(__dirname, 'dist_packed'),
    },
    plugins: [
        // Add your plugins here
    ],
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/'],
                options: {
                    transpileOnly: true
                }
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
        fallback: {
            "process": false, // Отключаем process для браузера
            "canvas": false,  // Отключаем canvas
            "jsdom": false    // Отключаем jsdom
        }
    },
    externals: {
        'paper': 'paper'
    }
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
    } else {
        config.mode = 'development';
    }
    return config;
};