import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Plugin to copy data directory to dist
function copyDataPlugin() {
  return {
    name: 'copy-data',
    closeBundle() {
      const dataDir = 'data';
      const distDataDir = 'dist/data';

      function copyDir(src, dest) {
        mkdirSync(dest, { recursive: true });
        const entries = readdirSync(src);

        for (const entry of entries) {
          const srcPath = join(src, entry);
          const destPath = join(dest, entry);

          if (statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      }

      try {
        copyDir(dataDir, distDataDir);
        console.log('✓ Copied data directory to dist');
      } catch (err) {
        console.warn('⚠ Could not copy data directory:', err.message);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyDataPlugin()],
  base: '/usedevpricetracker/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
