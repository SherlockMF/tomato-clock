import { parseArgs } from 'node:util';
import { createStudioServer } from '../src/studio/server.ts';

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '4333' },
  data: { type: 'string', default: 'experiments/studio' },
  'narrator-port': { type: 'string' },
} });
const port = Number(values.port);
const narratorPort = values['narrator-port'] === undefined ? undefined : Number(values['narrator-port']);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
if (narratorPort !== undefined && (!Number.isInteger(narratorPort) || narratorPort < 1 || narratorPort > 65535)) {
  throw new Error('invalid narrator port');
}

const app = createStudioServer({ root: values.data!, ...(narratorPort === undefined ? {} : { narratorPort }) });
app.server.on('error', async error => {
  console.error(error.message);
  process.exitCode = 1;
  await app.close();
});
app.server.listen(port, '127.0.0.1', () => {
  console.log('LifeSim Studio · 持续旅途 http://127.0.0.1:' + port + '/life32r3?mode=journey');
});
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void app.close().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
