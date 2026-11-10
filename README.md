# evlog wide event overhead

Minimal reproduction of the per-request cost of emitting one [evlog](https://github.com/HugoRCD/evlog) wide event. No framework: `node:http` and evlog only.

I ran into this while profiling [Vercube](https://github.com/vercube/vercube)'s request path ([vercube/vercube#1506](https://github.com/vercube/vercube/issues/1506)) and wanted to see how much of it was evlog on its own.

## What it does

`server.mjs` answers every request with a small JSON body. Depending on `MODE`, it also emits one wide event per request, the way the standalone section of the evlog README shows it:

```js
const log = createRequestLogger({ method: req.method, path: req.url });
log.set({ status: 200 });
log.emit();
```

| `MODE` | `initLogger` options |
| --- | --- |
| `off` | no logger, no event |
| `default` | `{ env }` |
| `noredact` | `{ env, redact: false }` |
| `silent` | `{ env, silent: true, drain: () => {} }` |
| `bare` | `{ env, silent: true, redact: false, drain: () => {} }` |
| `batched` | `{ env, silent: true, drain }` with `createDrainPipeline`, one `stdout` write per batch |

## Results

`NODE_ENV=production`, stdout to `/dev/null`, `bombardier -c 100 -d 5s`.

| Mode | Node 26.13 | Bun 1.4.1 |
| --- | ---: | ---: |
| `off` | 110k req/s | 126k req/s |
| `default` | 48k (-57%) | 57k (-54%) |
| `noredact` | 64k | 73k |
| `silent` | 72k | 79k |
| `bare` | 98k (-11%) | 112k (-11%) |
| `batched` | 71k | 75k |

Reading it step by step on Node:

- **Building and sampling the event is cheap.** `off` to `bare`: 110k to 98k, about 11%.
- **Redaction costs about 27%.** `bare` to `silent`: 98k to 72k. The event has four fields (`method`, `path`, `status`, duration) and nothing in it to redact.
- **The console write costs about 34% more.** `silent` to `default`: 72k to 48k. It is one synchronous write per event.
- **Batching the output already works.** `batched` is within noise of `silent`, so `silent: true` plus a pipeline drain removes the console cost. Redaction is what is left.

Numbers move by a few percent between runs. The order and the size of the steps do not.

## Run it

Needs Node (or Bun) and [bombardier](https://github.com/codesenberg/bombardier).

```sh
npm install
./run.sh node
./run.sh bun
```

To look at a single mode:

```sh
NODE_ENV=production MODE=silent node server.mjs > /dev/null
bombardier -c 100 -d 5s http://127.0.0.1:3000/
```

A CPU profile of the redaction step:

```sh
NODE_ENV=production MODE=silent node --cpu-prof server.mjs > /dev/null
```

## Environment

- evlog 2.35.1
- Node 26.13.0, Bun 1.4.1
- Apple M4 Pro, macOS 27.0
- bombardier 2.0.2, running on the same machine as the server

## Questions

1. Can redaction skip events (or fields) that hold only values evlog produced itself, or avoid cloning the event when no pattern can match?
2. Should production default to buffered output instead of one synchronous console write per event?
