import { parseArgs } from 'node:util';
import { createAnnualServer } from '../src/studio/server.ts';

const { values } = parseArgs({ options: { port: { type: 'string', default: '4317' } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');

const server = createAnnualServer();
server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('平行人生 · 年度旅居番茄钟 http://localhost:' + port + '/annual');
});
