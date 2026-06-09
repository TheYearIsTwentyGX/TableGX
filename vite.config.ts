import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/components/table'],
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/table/index.ts'),
      name: 'TableGX',
      formats: ['es', 'umd'],
      fileName: (format) => `tablegx.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'lucide-react', 'framer-motion', '@tanstack/react-table', '@tanstack/react-virtual', 'tailwind-merge', 'clsx'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'LucideReact',
          'framer-motion': 'FramerMotion',
          '@tanstack/react-table': 'ReactTable',
          '@tanstack/react-virtual': 'ReactVirtual',
          'tailwind-merge': 'TailwindMerge',
          'clsx': 'Clsx'
        },
      },
    },
  },
});
