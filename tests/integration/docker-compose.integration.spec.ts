// tests/integration/docker-compose.integration.spec.ts
// PURPOSE: Smoke tests for a running Docker Compose deployment.
// TEST MATRIX: TC-NFR-04
//
// Every test here is a no-op unless DOCKER_CONTAINER=true is set in the
// environment -- these are NOT run as part of the normal `npm test` /
// `npm run test:compliance` suites (which exercise the app in-process,
// see tests/setup.ts's createTestApp). This spec instead makes real HTTP
// requests against a server that's already running (e.g. via `docker
// compose up`), so it's meant to be run manually/in a deploy-verification
// step, pointed at that server with:
//
//   DOCKER_CONTAINER=true GSP_BASE_URL=http://localhost:3000 \
//     npx jest tests/integration/docker-compose.integration.spec.ts

import request from 'supertest';

describe('Docker Compose Integration', () => {
  const baseUrl = process.env.GSP_BASE_URL || 'http://localhost:3000';
  const dockerContainer = process.env.DOCKER_CONTAINER === 'true';
  // Jest requires at least one test per describe block that doesn't get
  // filtered out entirely; `it` is used with an internal early-return
  // guard (rather than `it.skip`) so the intent -- "only meaningful
  // against a live deployment" -- stays visible in the test itself.

  describe('TC-NFR-04: Container health check', () => {
    it('health endpoint should return 200 when service is healthy', async () => {
      if (!dockerContainer) {
        return;
      }

      const response = await request(baseUrl).get('/health').timeout(5000);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('TC-NFR-01: Service availability', () => {
    it('should serve GSP endpoints', async () => {
      if (!dockerContainer) {
        return;
      }

      // Should get 404 for a non-existent graph (healthy, reachable service).
      const response = await request(baseUrl)
        .get(`/graph/${encodeURIComponent('http://ex.org/health-test')}`)
        .timeout(5000);

      expect([200, 404]).toContain(response.status);
    });
  });
});
