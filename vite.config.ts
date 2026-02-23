import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'magusic.ts',
      formats: ['iife'],
      name: 'Magusic',
      fileName: () => 'magusic.js',
    },
    outDir: '.',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: ['chart.js'],
      output: {
        globals: {
          'chart.js': 'Chart',
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
