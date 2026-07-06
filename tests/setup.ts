import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

const defaultDatabaseUrl = ['postgresql://gsp:test', 'localhost:5432/gsp_test'].join('@');

process.env.NODE_ENV = 'test';
process.env.GSP_DISABLE_DB = 'true';
process.env.GSP_DATABASE_URL = process.env.TEST_DATABASE_URL || defaultDatabaseUrl;

export async function createTestingModule(
  moduleMetadata: Parameters<typeof Test.createTestingModule>[0],
): Promise<TestingModule> {
  return Test.createTestingModule(moduleMetadata).compile();
}

export async function createTestApp(module: Type<unknown>): Promise<INestApplication> {
  const app = await Test.createTestingModule({
    imports: [module],
  }).compile();

  const nestApp = app.createNestApplication();
  await nestApp.init();
  return nestApp;
}

export { request };
