import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        offscreen: resolve(__dirname, 'src/offscreen/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'src/popup', dest: '.' },
        { src: 'src/icons', dest: '.' },
      ],
    }),
    {
      name: 'copy-wasm-files',
      closeBundle() {
        const wasmDir = resolve(__dirname, 'node_modules/@xenova/transformers/dist');
        const destDir = resolve(__dirname, 'dist/wasm');
        if (existsSync(wasmDir)) {
          mkdirSync(destDir, { recursive: true });
          // Copy ONNX Runtime Web WASM files
          const files = ['ort-wasm.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-threaded.wasm', 'ort-wasm-simd-threaded.wasm'];
          for (const file of files) {
            const src = resolve(wasmDir, file);
            const dest = resolve(destDir, file);
            if (existsSync(src)) {
              copyFileSync(src, dest);
            }
          }
        }
      },
    },
  ],
  worker: {
    format: 'es',
    plugins: () => [
      {
        name: 'worker-wasm-import',
        transform(code, id) {
          if (id.endsWith('.wasm')) {
            return `export default ${JSON.stringify(id)};`;
          }
        },
      },
    ],
  },
});