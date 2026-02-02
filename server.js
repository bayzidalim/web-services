const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000; // Render default

// Enable CORS for the gateway
app.use(cors());

// Health check for the gateway itself
app.get('/health', (req, res) => {
  res.json({ status: 'Gateway Online', timestamp: new Date() });
});

// Configuration for child services
const services = [
  {
    name: 'kanban',
    path: '/kanban',
    port: 3001,
    dir: path.join(__dirname, 'apps', 'kanban'),
    script: 'server.js', // As per package.json
    env: { PORT: 3001 }
  },
  {
    name: 'mindlit',
    path: '/mindlit',
    port: 3002,
    dir: path.join(__dirname, 'apps', 'mindlit'),
    script: 'src/server.js', // As per package.json
    env: { PORT: 3002 }
  },
  {
    name: 'rapidcare',
    path: '/rapidcare',
    port: 3003,
    dir: path.join(__dirname, 'apps', 'rapidcare'),
    script: 'index.js', // As per package.json
    env: { PORT: 3003 }
  },
  {
    name: 'webhuiyans',
    path: '/webhuiyans',
    port: 3004,
    dir: path.join(__dirname, 'apps', 'webhuiyans'),
    script: 'src/server.js', // As per package.json
    env: { PORT: 3004 }
  }
];

// Start child processes
services.forEach(service => {
  console.log(`[Gateway] Starting ${service.name} on port ${service.port}...`);
  
  // Merge parent env with service specific env
  const env = { ...process.env, ...service.env };
  
  const child = spawn('node', [service.script], {
    cwd: service.dir,
    env: env,
    stdio: 'inherit' // Pipe output to parent console
  });

  child.on('error', (err) => {
    console.error(`[${service.name}] Failed to start:`, err);
  });

  // Setup Proxy
  // Rewrite path: /kanban/api/foo -> /api/foo
  app.use(
    service.path,
    createProxyMiddleware({
      target: `http://localhost:${service.port}`,
      changeOrigin: true,
      pathRewrite: {
        [`^${service.path}`]: '', // Remove /kanban prefix when forwarding
      },
      onProxyReq: (proxyReq, req, res) => {
         // Optional: Log proxy requests
      },
      onError: (err, req, res) => {
        console.error(`[Proxy] Error forwarding to ${service.name}:`, err.message);
        res.status(502).json({ error: `${service.name} unavailable` });
      }
    })
  );
});

app.listen(PORT, () => {
  console.log(`[Gateway] Running on http://localhost:${PORT}`);
  console.log(`[Gateway] Routes:`);
  services.forEach(s => console.log(`  ${s.path} -> http://localhost:${s.port}`));
});
