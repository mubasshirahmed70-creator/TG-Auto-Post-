// cPanel Startup Entry (for Setup Node.js App with Node.js 22.23.2+)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import('./server.ts').catch((err) => {
  console.error('Failed to start BazarBot server:', err);
  process.exit(1);
});
