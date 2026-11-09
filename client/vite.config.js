import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API binds to 127.0.0.1; target it directly (Node may resolve "localhost" to ::1).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
});
