import typescript from '@rollup/plugin-typescript';

export default {
	input: 'src/main.ts',
	output: {
		file: 'build/main.min.js',
		format: 'iife',
    sourcemap: true,
	},
	plugins: [typescript()],
};