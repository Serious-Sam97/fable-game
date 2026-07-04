import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: ['fable.serious-sam.dev'],
    host: true, // aceita conexões de fora do container
    port: 8471,
    strictPort: true,
    watch: {
      // dentro do Docker, eventos de fs de bind mounts nem sempre chegam — polling garante o HMR
      usePolling: !!process.env.DOCKER,
    },
    
  },
  build: {
    target: 'es2022',
  },
});
