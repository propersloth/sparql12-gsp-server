import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function getGraph(
  app: INestApplication,
  iri: string,
  options: { accept?: string; ifNoneMatch?: string } = {},
) {
  const req = request(app.getHttpServer())
    .get(`/graph/${encodeURIComponent(iri)}`)
    .set('Accept', options.accept || 'text/turtle');

  if (options.ifNoneMatch) {
    req.set('If-None-Match', options.ifNoneMatch);
  }

  return req;
}

export async function putGraph(
  app: INestApplication,
  iri: string,
  body: string,
  options: { contentType?: string; ifMatch?: string } = {},
) {
  const req = request(app.getHttpServer())
    .put(`/graph/${encodeURIComponent(iri)}`)
    .set('Content-Type', options.contentType || 'text/turtle')
    .send(body);

  if (options.ifMatch) {
    req.set('If-Match', options.ifMatch);
  }

  return req;
}

export async function postGraph(
  app: INestApplication,
  body: string,
  options: { targetIri?: string; contentType?: string } = {},
) {
  const path = options.targetIri
    ? `/graph/${encodeURIComponent(options.targetIri)}`
    : '/graph-store';

  return request(app.getHttpServer())
    .post(path)
    .set('Content-Type', options.contentType || 'text/turtle')
    .send(body);
}

export async function deleteGraph(
  app: INestApplication,
  iri: string,
  options: { ifMatch?: string } = {},
) {
  const req = request(app.getHttpServer())
    .delete(`/graph/${encodeURIComponent(iri)}`);

  if (options.ifMatch) {
    req.set('If-Match', options.ifMatch);
  }

  return req;
}

export async function patchGraph(
  app: INestApplication,
  iri: string,
  patchBody: string,
  options: { ifMatch?: string } = {},
) {
  const req = request(app.getHttpServer())
    .patch(`/graph/${encodeURIComponent(iri)}`)
    .set('Content-Type', 'application/sparql-update')
    .send(patchBody);

  if (options.ifMatch) {
    req.set('If-Match', options.ifMatch);
  }

  return req;
}
