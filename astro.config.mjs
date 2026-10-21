import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://vaquita.luisb.space',
  base: '/',
  vite: {
    plugins: [tailwindcss()],
  },
});
