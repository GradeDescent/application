import './load-env.js';
import { createServer } from 'http';
import { app } from './server/app.js';

const port = Number(process.env.PORT || 3000);

const server = createServer(app);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`GradeDescent API listening on http://localhost:${port}/v1`);
});

