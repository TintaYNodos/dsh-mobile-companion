import http from "node:http";
import { performance } from "node:perf_hooks";import { HOST, PORT, authHeader } from "./_harness.mjs";




const timeOnce = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request({ hostname: HOST, port: PORT, path, headers: { ...authHeader(), ...headers }, agent: false }, (res) => {
      const firstByte = performance.now();
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, ttfb: firstByte - start, total: performance.now() - start }));
    });
    req.on("error", reject);
    req.end();
  });

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { min: sorted[0], mean, p50: p(0.5), p95: p(0.95), max: sorted.at(-1) };
};

const MOBILE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36";

console.log("== Linea base: 30 peticiones secuenciales ==");
for (const [label, path, headers] of [
  ["documento HTML movil (con inyeccion)", "/", { "user-agent": MOBILE, accept: "text/html" }],
  ["documento HTML escritorio (sin inyeccion)", "/", { "user-agent": "Mozilla/5.0 (Windows NT 10.0)", accept: "text/html" }],
  ["activo CSS (streaming puro)", "/assets/index-lh_YM6sT.css", {}],
  ["estado del puente", "/dsh-companion/status", {}],
]) {
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const result = await timeOnce(path, headers);
    if (result.status !== 200) {
      console.log(`${label}: estado inesperado ${result.status}`);
      samples.length = 0;
      break;
    }
    samples.push(result.ttfb);
  }
  if (!samples.length) continue;
  const s = stats(samples);
  console.log(
    `${label.padEnd(44)} p50 ${s.p50.toFixed(1)} ms  p95 ${s.p95.toFixed(1)} ms  max ${s.max.toFixed(1)} ms`
  );
}

console.log("\n== Ráfaga concurrente: 40 peticiones al CSS ==");
const burstStart = performance.now();
const burst = await Promise.all(
  Array.from({ length: 40 }, () => timeOnce("/assets/index-lh_YM6sT.css"))
);
const burstTotal = performance.now() - burstStart;
const ok = burst.filter((r) => r.status === 200).length;
console.log(`completadas ${ok}/40 en ${burstTotal.toFixed(0)} ms  (${(40 / (burstTotal / 1000)).toFixed(1)} req/s)`);
console.log(`p95 individual ${stats(burst.map((r) => r.total)).p95.toFixed(1)} ms`);
