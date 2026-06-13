import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  onSuccess: 'cp -r src/views dist/views && cp -r src/public dist/public',
})
