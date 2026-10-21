import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const [owner, repository] = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const isProjectPage = Boolean(owner && repository !== `${owner}.github.io`);

export default defineConfig({
  site: owner ? `https://${owner}.github.io` : undefined,
  base: isProjectPage ? `/${repository}` : '/',
  vite: {
    plugins: [tailwindcss()],
  },
});
