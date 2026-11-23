import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';

function embedFrontend(): Plugin {
  return {
    name: 'pigeon-embed-frontend',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset' || typeof html.source !== 'string') {
          this.error('Missing generated index.html');
        }

        // The Rust server exposes exact page paths, so every frontend resource
        // must be served with the HTML for both the homepage and share page.
        for (const [filename, output] of Object.entries(bundle)) {
          if (filename === 'index.html') continue;
          if (output.type === 'chunk' && output.isEntry) {
            const tag = `<script type="module" crossorigin src="/${filename}"></script>`;
            if (!html.source.includes(tag)) this.error(`Cannot embed ${filename}`);
            html.source = html.source.replace(tag, () =>
              `<script type="module">${output.code.replace(/<\/script/gi, '<\\/script')}</script>`,
            );
          } else if (output.type === 'asset' && filename.endsWith('.css') && typeof output.source === 'string') {
            const tag = `<link rel="stylesheet" crossorigin href="/${filename}">`;
            if (!html.source.includes(tag)) this.error(`Cannot embed ${filename}`);
            const css = output.source;
            html.source = html.source.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
          } else if (filename === '.vite/license.md' && output.type === 'asset' && typeof output.source === 'string') {
            // Include bundled dependency notices in the executable's only frontend asset.
            const notices = output.source.replaceAll('-->', '--&gt;').replaceAll('<script', '&lt;script');
            html.source += '\n<!--\n' + notices + '\n-->\n';
          } else {
            this.error(`Unexpected external frontend asset: ${filename}`);
          }
          delete bundle[filename];
        }
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PIGEON_');
  const target = env.PIGEON_BACKEND || 'http://127.0.0.1:3000';
  const configuredBase = (env.PIGEON_BASE_PATH || '/').replace(/\/+$/, '');
  const devBootstrap: Plugin = {
    name: 'pigeon-dev-bootstrap',
    apply: 'serve',
    transformIndexHtml(html) {
      const bootstrap = Buffer.from(JSON.stringify({ base_path: configuredBase || '/', page: 'home' }));
      return html.replace('__PIGEON_BOOTSTRAP__', bootstrap.toString('base64url'));
    },
  };
  const prefixes = configuredBase ? ['', configuredBase] : [''];
  const proxy = Object.fromEntries(
    prefixes.flatMap((prefix) => ['/api', '/sharing', '/robots.txt'].map(
      (path) => [`^${(prefix + path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/\\?]|$)`, { target }],
    )),
  );

  return {
    plugins: [react(), devBootstrap, embedFrontend()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    build: { modulePreload: false, cssCodeSplit: false, assetsInlineLimit: Number.MAX_SAFE_INTEGER, license: true },
  };
});
