import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function getGraph(
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

export function putGraph(
  app: INestApplication,
  iri: string,
  body: string,
  options: { contentType?: string; ifMatch?: string; ifNoneMatch?: string } = {},
) {
  const req = request(app.getHttpServer())
    .put(`/graph/${encodeURIComponent(iri)}`)
    .set('Content-Type', options.contentType || 'text/turtle')
    .send(body);

  if (options.ifMatch) {
    req.set('If-Match', options.ifMatch);
  }

  if (options.ifNoneMatch) {
    req.set('If-None-Match', options.ifNoneMatch);
  }

  return req;
}

export function postGraph(
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

export function deleteGraph(
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

export function patchGraph(
  app: INestApplication,
  iri: string,
  patchBody: string,
  ifMatchOrOptions: string | { ifMatch?: string } = {},
) {
  const ifMatch =
    typeof ifMatchOrOptions === 'string'
      ? ifMatchOrOptions
      : ifMatchOrOptions.ifMatch;
  const req = request(app.getHttpServer())
    .patch(`/graph/${encodeURIComponent(iri)}`)
    .set('Content-Type', 'application/sparql-update')
    .send(patchBody);

  if (ifMatch) {
    req.set('If-Match', ifMatch);
  }

  return req;
}
