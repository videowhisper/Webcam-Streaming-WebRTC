import { createServer } from 'vite';
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, plugins: [{
  name: 'loopback-synthetic-configuration',
  configureServer(server) {
// Synthetic configuration exists only in this loopback test process.
server.middlewares.use((req, res, next) => {
  if (req.url !== '/config.json') return next();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ deny: '', channel: 'LocalRoom', username: 'LocalUser',
    view: 'BroadcastChat', enableGET: true, development: false,
    videowhisperServer: { socket: 'http://127.0.0.1:8094', authentication: 'token', token: 'local-synthetic-test-only' },
    stream: { width: 640, height: 360, framerate: 15, videoBitrate: 500, audioBitrate: 32 } }));
});
  },
}] });
await server.listen();
