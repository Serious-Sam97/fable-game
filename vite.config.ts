import { defineConfig } from 'vite';

export default defineConfig({
  // garante uma única instância do three (o app e os three/addons compartilham a mesma)
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three'] },
  server: {
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
