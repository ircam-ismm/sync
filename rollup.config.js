// adapted from https://github.com/rollup/rollup-starter-lib
import pkg from './package.json';
import babel from 'rollup-plugin-babel';
import builtins from 'rollup-plugin-node-builtins';
import resolve from 'rollup-plugin-node-resolve';

const inputFile = 'src/index.js';

export default [
  // CommonJS (for Node and browserify) and ES module (for bundlers) builds.
  {
    input: inputFile,
    external: Object.keys(pkg.dependencies),
    plugins: [
      builtins(),
      resolve(),
      babel({
        exclude: 'node_modules/**'
      })
    ],
    output: [
      { file: pkg.main, format: 'cjs', sourcemap: 'inline' },
      { file: pkg.module, format: 'es', sourcemap: 'inline' }
    ]
  }
];
