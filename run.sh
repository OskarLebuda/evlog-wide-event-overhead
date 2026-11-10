#!/usr/bin/env bash
# usage: ./run.sh [node|bun]
# needs bombardier: https://github.com/codesenberg/bombardier
cd "$(dirname "$0")" || exit 1
rt=${1:-node}

if lsof -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "port 3000 is busy"; exit 1
fi

for mode in off default noredact silent bare batched; do
  NODE_ENV=production MODE=$mode "$rt" server.mjs >/dev/null 2>&1 &
  pid=$!
  sleep 1
  rps=$(bombardier -c 100 -d 5s --fasthttp -p r -o json http://127.0.0.1:3000/ 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Math.round(JSON.parse(s).result.rps.mean)))')
  printf '%-5s %-9s %s req/s\n' "$rt" "$mode" "$rps"
  kill $pid; wait $pid 2>/dev/null
done
