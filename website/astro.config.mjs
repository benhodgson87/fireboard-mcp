import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  publicDir: '../public',
  integrations: [starlight({
    title: '🔥 Fireboard MCP',
    description: 'Connect your Fireboard to an AI assistant.',
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/benhodgson87/fireboard-mcp' }],
    customCss: ['./src/styles/custom.css'],
    sidebar: [
      { label: 'Overview', slug: 'index' },
      { label: 'Connect your assistant', slug: 'connect' },
      { label: 'Tools', items: [{ autogenerate: { directory: 'tools' } }] }
    ]
  })]
});
