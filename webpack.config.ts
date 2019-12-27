import * as path from 'path';
import webpack = require('webpack');

export default {
  entry: './src/resources/map.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\.json$/,
        loader: 'json-loader',
        exclude: /node_modules/
      },
      {
        test: /\.tsx?$/,
        use: ['babel-loader', 'ts-loader'],
        exclude: /node_modules/
      },
    ]
  },
  devtool: 'source-map',
  resolve: {
    extensions: [".js", ".ts", ".json"],
    modules: [
      path.join(__dirname, "src"),
      path.join(__dirname, "node_modules")
    ]
  }
} as webpack.Configuration;