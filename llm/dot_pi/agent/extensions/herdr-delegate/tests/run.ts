const suites = [
  "core.test.ts",
  "settle.test.ts",
  "worker-pool.test.ts",
  "warm-start.test.ts",
  "warm-cleanup.test.ts",
  "delegation.test.ts",
  "actions.test.ts",
];

for (const suite of suites) {
  process.stdout.write(`\n=== ${suite} ===\n`);
  await import(new URL(suite, import.meta.url).href);
}

process.stdout.write("\n=== HERDR-DELEGATE TESTS PASSED ===\n");
