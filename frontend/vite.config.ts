import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';

function packFrontend(): Plugin {
  return {
    name: 'pigeon-pack-frontend',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset' || typeof html.source !== 'string') {
          this.error('Missing generated index.html');
        }

        // Rust supplies the run-time base path for assets referenced by HTML.
        // Module imports stay relative to the JS chunk that requested them.
        html.source = html.source.replace(/(\s(?:href|src)=")\.\/assets\//g, '$1__PIGEON_ASSETS__/');
        if (!html.source.includes('src="__PIGEON_ASSETS__/')) {
          this.error('Missing generated entry module');
        }

        const license = bundle['.vite/license.md'];
        if (license?.type !== 'asset' || typeof license.source !== 'string') {
          this.error('Missing bundled dependency notices');
        }
        const notices = license.source.replaceAll('-->', '--&gt;').replaceAll('<script', '&lt;script');
        html.source += '\n<!--\n' + notices + '\n-->\n';
        delete bundle['.vite/license.md'];
      },
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PIGEON_');
  const target = env.PIGEON_BACKEND || 'http://127.0.0.1:3000';
  const configuredBase = (env.PIGEON_BASE_PATH || '/').replace(/\/+$/, '');
  const devBootstrap: Plugin = {
    name: 'pigeon-dev-bootstrap',
    apply: 'serve',
    transformIndexHtml(html) {
      const bootstrap = Buffer.from(JSON.stringify({ base_path: configuredBase || '/' }));
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
    base: command === 'build' ? './' : '/',
    plugins: [react(), devBootstrap, packFrontend()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    build: { modulePreload: false, assetsInlineLimit: Number.MAX_SAFE_INTEGER, license: true },
  };
});
