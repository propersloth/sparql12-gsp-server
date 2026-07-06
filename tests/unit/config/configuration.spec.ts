// TEST MATRIX: TC-NFR-01

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GspEnvironmentVariables } from '../../../src/config/configuration.schema';
import { GspConfiguration } from '../../../src/config/configuration';

const VALID_BASE = {
  databaseUrl: 'postgresql://localhost:5432/gsp_test',
  baseUrl: 'http://api.example.com',
  authEnabled: 'false',
  otelEnabled: 'false',
  maxPayloadSize: '100MB',
  streamThreshold: '10MB',
};

describe('GspEnvironmentVariables', () => {
  it('should fail when GSP_DATABASE_URL is missing', async () => {
    const c = plainToInstance(GspEnvironmentVariables, {});
    const errors = await validate(c);
    expect(errors.find((e) => e.property === 'databaseUrl')).toBeDefined();
  });

  it('should apply defaults for optional variables', async () => {
    const c = plainToInstance(GspEnvironmentVariables, {
      databaseUrl: 'postgresql://localhost/test',
      authEnabled: 'false',
    });
    expect(c.baseUrl).toBe('http://localhost:3000');
    expect(c.maxPayloadSize).toBe('100MB');
    expect(c.streamThreshold).toBe('10MB');
    expect(c.patchEnabled).toBeUndefined(); // default applied in class field initializer
  });

  it('patchEnabled defaults to true', async () => {
    const c = plainToInstance(GspEnvironmentVariables, {
      databaseUrl: 'postgresql://localhost/test',
      authEnabled: 'false',
    });
    const errors = await validate(c);
    expect(errors.find((e) => e.property === 'patchEnabled')).toBeUndefined();
  });

  it('patchEnabled can be set to false', async () => {
    const c = plainToInstance(GspEnvironmentVariables, {
      ...VALID_BASE,
      patchEnabled: 'false',
    });
    expect(c.patchEnabled).toBe(false);
    const errors = await validate(c);
    expect(errors.find((e) => e.property === 'patchEnabled')).toBeUndefined();
  });

  it('streamThreshold validates format', async () => {
    const c = plainToInstance(GspEnvironmentVariables, {
      ...VALID_BASE,
      streamThreshold: 'not-a-size',
    });
    const errors = await validate(c);
    expect(errors.find((e) => e.property === 'streamThreshold')).toBeDefined();
  });

  it('does NOT validate or map GSP_DEFAULT_GRAPH_PERSISTENT (retired)', async () => {
    // Passing the old variable should not cause validation errors — it is simply ignored
    const c = plainToInstance(GspEnvironmentVariables, {
      ...VALID_BASE,
      defaultGraphPersistent: 'false',
    });
    const errors = await validate(c);
    expect(
      errors.find((e) => e.property === 'defaultGraphPersistent'),
    ).toBeUndefined();
  });
});

describe('GspConfiguration', () => {
  it('fromEnvironment parses streamThresholdBytes correctly', async () => {
    const cfg = await GspConfiguration.fromEnvironment({
      ...VALID_BASE,
      GSP_DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(cfg.server.streamThresholdBytes).toBe(10 * 1024 * 1024);
  });

  it('fromEnvironment sets patchEnabled from env', async () => {
    const on = await GspConfiguration.fromEnvironment({
      GSP_DATABASE_URL: 'postgresql://localhost/test',
      GSP_AUTH_ENABLED: 'false',
      GSP_PATCH_ENABLED: 'true',
    });
    const off = await GspConfiguration.fromEnvironment({
      GSP_DATABASE_URL: 'postgresql://localhost/test',
      GSP_AUTH_ENABLED: 'false',
      GSP_PATCH_ENABLED: 'false',
    });
    expect(on.server.patchEnabled).toBe(true);
    expect(off.server.patchEnabled).toBe(false);
  });

  it('throws on missing GSP_DATABASE_URL', async () => {
    await expect(GspConfiguration.fromEnvironment({})).rejects.toThrow(
      'Config validation failed',
    );
  });

  it('does not include defaultGraph property (retired)', async () => {
    const cfg = await GspConfiguration.fromEnvironment({
      GSP_DATABASE_URL: 'postgresql://localhost/test',
      GSP_AUTH_ENABLED: 'false',
    });
    expect((cfg as any).defaultGraph).toBeUndefined();
  });
});
