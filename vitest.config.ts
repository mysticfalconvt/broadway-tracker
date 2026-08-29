import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Pin the clock's timezone so date behaviour is deterministic wherever the
    // suite runs. The production server runs in UTC and readers do not, which
    // is the case these tests exist to cover.
    env: { TZ: 'America/New_York' },
    setupFiles: ['./tests/setup.ts'],
    // Every suite shares one Postgres database, so run them one at a time.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
