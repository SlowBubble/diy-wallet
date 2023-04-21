import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const plugins = [
	nodeResolve(),
	// commonjs(),
	typescript(),
];

export default [
	{
		input: 'src/main.ts',
		output: {
			file: 'build/main.min.js',
			format: 'iife',
			sourcemap: true,
		},
		plugins: plugins,
	},
	{
		input: 'src/testMain.ts',
		output: {
			file: 'build/testMain.js',
			format: 'iife',
			sourcemap: true,
		},
		plugins: plugins,
	},
];