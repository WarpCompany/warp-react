import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@warpfi/js'],
  // Marks the bundle as a client module for React Server Components (Next.js App Router).
  banner: { js: '"use client";' },
})
