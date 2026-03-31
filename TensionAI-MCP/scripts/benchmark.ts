/**
 * Performance Benchmarking Script
 * 
 * Benchmarks:
 * - Latency benchmarks
 * - Throughput tests
 * - Resource usage profiling
 */

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTimeMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSecond: number;
  error?: string;
}

interface LatencyMetrics {
  latencies: number[];
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Calculate latency percentiles
 */
function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  
  return {
    latencies,
    average: latencies.reduce((a, b) => a + b, 0) / n,
    min: sorted[0],
    max: sorted[n - 1],
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

/**
 * Run a benchmark
 */
async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number,
  warmup: number = 2
): Promise<BenchmarkResult> {
  console.log(`\n🔬 Running benchmark: ${name}`);
  console.log(`   Iterations: ${iterations}, Warmup: ${warmup}`);
  
  const latencies: number[] = [];
  let error: string | undefined;
  
  // Warmup
  for (let i = 0; i < warmup; i++) {
    try {
      await fn();
    } catch (e) {
      // Ignore warmup errors
    }
  }
  
  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      await fn();
      latencies.push(Date.now() - start);
    } catch (e) {
      error = (e as Error).message;
      console.error(`   Error on iteration ${i + 1}: ${error}`);
    }
  }
  
  const totalTimeMs = latencies.reduce((a, b) => a + b, 0);
  const metrics = calculateLatencyMetrics(latencies);
  
  const result: BenchmarkResult = {
    name,
    iterations,
    totalTimeMs,
    averageMs: metrics.average,
    minMs: metrics.min,
    maxMs: metrics.max,
    p50Ms: metrics.p50,
    p95Ms: metrics.p95,
    p99Ms: metrics.p99,
    opsPerSecond: (iterations / totalTimeMs) * 1000,
    error,
  };
  
  console.log(`   Results:`);
  console.log(`   - Average: ${result.averageMs.toFixed(2)}ms`);
  console.log(`   - Min/Max: ${result.minMs}/${result.maxMs}ms`);
  console.log(`   - P50/P95/P99: ${result.p50Ms}/${result.p95Ms}/${result.p99Ms}ms`);
  console.log(`   - Ops/sec: ${result.opsPerSecond.toFixed(2)}`);
  
  return result;
}

/**
 * Benchmark: Health Check
 */
async function benchmarkHealthCheck(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Health Check", async () => {
    const res = await fetch(`${SERVER_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Server Info
 */
async function benchmarkServerInfo(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Server Info", async () => {
    const res = await fetch(`${SERVER_URL}/api/info`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Task List
 */
async function benchmarkTaskList(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Task List", async () => {
    const res = await fetch(`${SERVER_URL}/api/tasks?limit=10`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Providers List
 */
async function benchmarkProvidersList(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Providers List", async () => {
    const res = await fetch(`${SERVER_URL}/api/providers`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Provider Health
 */
async function benchmarkProviderHealth(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Provider Health", async () => {
    const res = await fetch(`${SERVER_URL}/api/providers/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Metrics
 */
async function benchmarkMetrics(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Metrics", async () => {
    const res = await fetch(`${SERVER_URL}/api/metrics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Queue Status
 */
async function benchmarkQueueStatus(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Queue Status", async () => {
    const res = await fetch(`${SERVER_URL}/api/queue/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Benchmark: Teams List
 */
async function benchmarkTeamsList(iterations: number): Promise<BenchmarkResult> {
  return runBenchmark("Teams List", async () => {
    const res = await fetch(`${SERVER_URL}/api/teams`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, iterations);
}

/**
 * Throughput test: Concurrent task creation
 */
async function benchmarkThroughput(
  concurrentRequests: number,
  durationSeconds: number
): Promise<{ requests: number; opsPerSecond: number; errors: number }> {
  console.log(`\n🔬 Running throughput test`);
  console.log(`   Concurrent: ${concurrentRequests}, Duration: ${durationSeconds}s`);
  
  let requests = 0;
  let errors = 0;
  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;
  
  const promises: Promise<void>[] = [];
  
  const makeRequest = async () => {
    while (Date.now() < endTime) {
      try {
        const res = await fetch(`${SERVER_URL}/health`);
        if (!res.ok) errors++;
        requests++;
      } catch {
        errors++;
        requests++;
      }
    }
  };
  
  // Start concurrent requests
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(makeRequest());
  }
  
  // Wait for all to complete
  await Promise.all(promises);
  
  const actualDuration = (Date.now() - startTime) / 1000;
  const opsPerSecond = requests / actualDuration;
  
  console.log(`   Results:`);
  console.log(`   - Total requests: ${requests}`);
  console.log(`   - Errors: ${errors}`);
  console.log(`   - Ops/sec: ${opsPerSecond.toFixed(2)}`);
  
  return { requests, opsPerSecond, errors };
}

/**
 * Print benchmark summary
 */
function printSummary(results: BenchmarkResult[]): void {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(60));
  
  console.log("\n| Benchmark | Avg (ms) | P50 | P95 | P99 | Ops/sec |");
  console.log("|-----------|----------|-----|-----|-----|---------|");
  
  for (const result of results) {
    if (result.error) {
      console.log(`| ${result.name.padEnd(9)} | ERROR: ${result.error.substring(0, 20)} |`);
    } else {
      console.log(
        `| ${result.name.padEnd(9)} | ${result.averageMs.toFixed(2).padStart(7)} | ` +
        `${result.p50Ms.toFixed(0).padStart(3)} | ${result.p95Ms.toFixed(0).padStart(3)} | ` +
        `${result.p99Ms.toFixed(0).padStart(3)} | ${result.opsPerSecond.toFixed(2).padStart(7)} |`
      );
    }
  }
  
  console.log("=".repeat(60));
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log("🚀 Starting Performance Benchmarks");
  console.log(`   Server: ${SERVER_URL}`);
  
  // Verify server is running
  console.log("\nVerifying server is running...");
  try {
    const healthRes = await fetch(`${SERVER_URL}/health`);
    if (!healthRes.ok) {
      throw new Error(`Server returned ${healthRes.status}`);
    }
    console.log("   ✓ Server is healthy");
  } catch (error) {
    console.error(`   ✗ Server not available: ${(error as Error).message}`);
    console.error("   Please start the server before running benchmarks");
    process.exit(1);
  }
  
  const results: BenchmarkResult[] = [];
  const iterations = 50;
  
  // Run latency benchmarks
  results.push(await benchmarkHealthCheck(iterations));
  results.push(await benchmarkServerInfo(iterations));
  results.push(await benchmarkTaskList(iterations));
  results.push(await benchmarkProvidersList(iterations));
  results.push(await benchmarkProviderHealth(iterations));
  results.push(await benchmarkMetrics(iterations));
  results.push(await benchmarkQueueStatus(iterations));
  results.push(await benchmarkTeamsList(iterations));
  
  // Run throughput test
  await benchmarkThroughput(10, 5);
  
  // Print summary
  printSummary(results);
  
  console.log("\n✅ Benchmarks complete!");
}

main().catch(console.error);
