// Minimal repro: one wide event per request, evlog only, node:http.
// MODE=off | default | noredact | silent | bare | batched
import { createServer } from 'node:http';
import { initLogger, createRequestLogger } from 'evlog';
import { createDrainPipeline } from 'evlog/pipeline';

const mode = process.env.MODE ?? 'default';
const env = { service: 'repro', environment: 'production' };

if (mode === 'default') initLogger({ env });
if (mode === 'silent') initLogger({ env, silent: true, drain: () => {} });
if (mode === 'noredact') initLogger({ env, redact: false });
if (mode === 'bare') initLogger({ env, silent: true, redact: false, drain: () => {} });
if (mode === 'batched') {
  // console off, one stdout write per batch instead of one per event
  const pipeline = createDrainPipeline({ batch: { size: 500, intervalMs: 50 } });
  const drain = pipeline((batch) => {
    process.stdout.write(batch.map((ctx) => JSON.stringify(ctx.event)).join('\n') + '\n');
  });
  initLogger({ env, silent: true, drain });
}

const body = JSON.stringify({ message: 'hello' });

createServer((req, res) => {
  if (mode !== 'off') {
    const log = createRequestLogger({ method: req.method, path: req.url });
    log.set({ status: 200 });
    log.emit();
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
}).listen(3000, '127.0.0.1');
