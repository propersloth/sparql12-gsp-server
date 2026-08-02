// tests/unit/docker-build.spec.ts
// PURPOSE: Tests for Docker build and environment configuration
// TEST MATRIX: TC-NFR-04, TC-NFR-01
//
// These are structural/static checks against the repo's Docker and build
// artifacts (Dockerfile, docker-compose.yml, .dockerignore, .env.example,
// tsconfig.prod.json) -- they don't invoke the Docker daemon (CI has no
// docker-in-docker setup), so they can run as part of the normal `npm
// test` suite. `docker build` itself is verified manually/locally (see
// README's Docker section).

import * as fs from 'fs';
import * as path from 'path';

describe('Docker Build', () => {
  // Dockerfile, docker-compose.yml, .dockerignore, and .env.example all
  // live at the repo root, alongside package.json -- the same directory
  // Jest's process.cwd() resolves to when run via `npm test`.
  const repoRoot = process.cwd();

  describe('TC-NFR-04: Docker build succeeds', () => {
    /**
     * TC-NFR-04: Deployment requirements
     */

    it('Dockerfile should exist', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      expect(fs.existsSync(dockerfile)).toBe(true);
    });

    it('docker-compose.yml should exist', () => {
      const composeFile = path.join(repoRoot, 'docker-compose.yml');
      expect(fs.existsSync(composeFile)).toBe(true);
    });

    it('.dockerignore should exist', () => {
      const dockerignore = path.join(repoRoot, '.dockerignore');
      expect(fs.existsSync(dockerignore)).toBe(true);
    });

    it('.dockerignore should exclude node_modules', () => {
      const dockerignore = path.join(repoRoot, '.dockerignore');
      const content = fs.readFileSync(dockerignore, 'utf-8');
      expect(content).toContain('node_modules');
    });

    it('Dockerfile should use multi-stage build', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfile, 'utf-8');
      expect(content).toContain('AS builder');
      expect(content).toMatch(/FROM\s+node:/);
    });

    it('Dockerfile should use non-root user', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfile, 'utf-8');
      expect(content).toContain('USER');
      expect(content).not.toMatch(/RUN\s+.*\b(chmod|chown)\b.*\broot\b/);
    });

    it('Dockerfile should expose port 3000', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfile, 'utf-8');
      expect(content).toContain('EXPOSE 3000');
    });

    it('Dockerfile should include HEALTHCHECK', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfile, 'utf-8');
      expect(content).toContain('HEALTHCHECK');
    });

    it('docker-compose should define gsp-server service', () => {
      const composeFile = path.join(repoRoot, 'docker-compose.yml');
      const content = fs.readFileSync(composeFile, 'utf-8');
      expect(content).toContain('gsp-server');
    });

    it('docker-compose should define postgres service', () => {
      const composeFile = path.join(repoRoot, 'docker-compose.yml');
      const content = fs.readFileSync(composeFile, 'utf-8');
      expect(content).toContain('postgres');
    });

    it('docker-compose should include health checks', () => {
      const composeFile = path.join(repoRoot, 'docker-compose.yml');
      const content = fs.readFileSync(composeFile, 'utf-8');
      expect(content).toContain('healthcheck');
    });

    it('.env.example should exist with all variables', () => {
      const envExample = path.join(repoRoot, '.env.example');
      expect(fs.existsSync(envExample)).toBe(true);

      const content = fs.readFileSync(envExample, 'utf-8');
      expect(content).toContain('GSP_DATABASE_URL');
      expect(content).toContain('GSP_BASE_URL');
      expect(content).toContain('GSP_AUTH_ENABLED');
      expect(content).toContain('GSP_LOG_LEVEL');
    });
  });

  describe('TC-NFR-01: Performance requirements', () => {
    it('tsconfig.prod.json should exist', () => {
      const tsconfigProd = path.join(repoRoot, 'tsconfig.prod.json');
      expect(fs.existsSync(tsconfigProd)).toBe(true);
    });

    it('tsconfig.prod.json should enable strict mode', () => {
      const tsconfigProd = path.join(repoRoot, 'tsconfig.prod.json');
      const content = JSON.parse(fs.readFileSync(tsconfigProd, 'utf-8'));
      expect(content.compilerOptions?.strict).toBe(true);
    });

    it('tsconfig.prod.json should enable source maps', () => {
      const tsconfigProd = path.join(repoRoot, 'tsconfig.prod.json');
      const content = JSON.parse(fs.readFileSync(tsconfigProd, 'utf-8'));
      expect(content.compilerOptions?.sourceMap).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('health endpoint should exist in codebase', () => {
      const healthFiles = [
        path.join(repoRoot, 'src/health'),
        path.join(repoRoot, 'src/common/health'),
      ];

      const exists = healthFiles.some((f) => fs.existsSync(f));
      expect(exists).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    it('Dockerfile should use SIGTERM', () => {
      const dockerfile = path.join(repoRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfile, 'utf-8');
      expect(content).toContain('STOPSIGNAL SIGTERM');
    });

    it('docker-compose should configure restart policy', () => {
      const composeFile = path.join(repoRoot, 'docker-compose.yml');
      const content = fs.readFileSync(composeFile, 'utf-8');
      expect(content).toContain('restart:');
    });
  });
});
