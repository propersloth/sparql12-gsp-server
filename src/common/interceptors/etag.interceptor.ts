import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface HttpResponse {
  getHeaders(): Record<string, string | string[] | number | undefined>;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string }>();
    const response = http.getResponse<HttpResponse>();
    const method = (request.method ?? '').toUpperCase();
    const isReadMethod = method === 'GET' || method === 'HEAD';

    return next.handle().pipe(
      map((data) => {
        const headers = response.getHeaders();

        // ── ETag injection ──────────────────────────────────────────────
        const existingEtag = headers['etag'] as string | undefined;
        if (existingEtag) {
          response.setHeader('ETag', existingEtag);
        } else if (data?.etag) {
          response.setHeader('ETag', data.etag as string);
        }

        // ── Vary: Accept (UR-CC-03) ─────────────────────────────────────
        // Only GET and HEAD responses are content-negotiated.
        // Setting Vary on mutations (PUT/PATCH/…) is unnecessary and confusing.
        if (isReadMethod) {
          const existingVary = headers['vary'] as string | undefined;
          if (!existingVary) {
            response.setHeader('Vary', 'Accept');
          } else if (!existingVary.toLowerCase().includes('accept')) {
            response.setHeader('Vary', `${existingVary}, Accept`);
          }
        }

        return data;
      }),
    );
  }
}
