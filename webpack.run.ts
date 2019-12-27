import webpack from 'webpack';
import config from './webpack.config';
import './src';

webpack(config).watch({
    aggregateTimeout: 300,
    poll: 100
}, (err, stats) => {
    console.log(stats.hasErrors() ? 'Compiled with errors:' : 'Compiled OK!');
    if (err) {
        console.error(err);
    }
});