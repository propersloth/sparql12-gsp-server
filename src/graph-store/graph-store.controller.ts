import {
  Controller,
  Delete,
  Get,
  Head,
  Post,
  Put,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ETagService } from './services/etag.service';
import { GraphRoutingService } from './services/graph-routing.service';
import { GraphStoreService, MultipartPart, Preconditions } from './services/graph-store.service';

type RequestLike = AsyncIterable<unknown> & {
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  header(name: string): string | undefined;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
};

type UploadedFileLike = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Controller()
export class GraphStoreController {
  constructor(
    private readonly graphStore: GraphStoreService,
    private readonly routing: GraphRoutingService,
    private readonly etagService: ETagService,
  ) {}

  @Get('graph/:iri')
  async getDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<string> {
    return this.handleGet(req, res);
  }

  @Get('graph-store')
  async getIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<string> {
    return this.handleGet(req, res);
  }

  @Head('graph/:iri')
  async headDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleHead(req, res);
  }

  @Head('graph-store')
  async headIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleHead(req, res);
  }

  @Put('graph/:iri')
  async putDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePut(req, res);
  }

  @Put('graph-store')
  async putIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePut(req, res);
  }

  @Post('graph/:iri')
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage() }))
  async postDirect(
    @Req() req: RequestLike,
    @UploadedFiles() files: UploadedFileLike[] = [],
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePost(req, files, res);
  }

  @Post('graph-store')
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage() }))
  async postIndirect(
    @Req() req: RequestLike,
    @UploadedFiles() files: UploadedFileLike[] = [],
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePost(req, files, res);
  }

  @Delete('graph/:iri')
  async deleteDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleDelete(req, res);
  }

  @Delete('graph-store')
  async deleteIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleDelete(req, res);
  }

  private async handleGet(req: RequestLike, res: ResponseLike): Promise<string> {
    const target = this.routing.resolveTarget(req);
    const result = await this.graphStore.getGraph(
      target.iri,
      req.header('accept'),
      req.header('if-none-match') ?? undefined,
    );
    res.status(result.status);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
    return result.content;
  }

  private async handleHead(req: RequestLike, res: ResponseLike): Promise<void> {
    const target = this.routing.resolveTarget(req);
    const result = await this.graphStore.headGraph(target.iri, req.header('accept'));
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
  }

  private async handlePut(req: RequestLike, res: ResponseLike): Promise<void> {
    const target = this.routing.resolveTarget(req);
    const body = await readRequestBody(req);
    const preconditions = this.getPreconditions(req);
    const result = await this.graphStore.putGraph(
      target.iri,
      body,
      req.header('content-type') ?? '',
      preconditions,
    );
    this.applyMutationResponse(res, result.status, result.etag, result.location);
  }

  private async handlePost(
    req: RequestLike,
    files: UploadedFileLike[],
    res: ResponseLike,
  ): Promise<void> {
    const target = this.routing.resolveTarget(req);
    const targetIri = hasExplicitPostTarget(req) ? target.iri : undefined;
    const parts = toMultipartParts(files);
    const body = parts ? Buffer.alloc(0) : await readRequestBody(req);

    const result = await this.graphStore.postGraph(
      body,
      req.header('content-type') ?? '',
      targetIri,
      parts,
    );
    this.applyMutationResponse(res, result.status, result.etag, result.location);
  }

  private async handleDelete(req: RequestLike, res: ResponseLike): Promise<void> {
    const target = this.routing.resolveTarget(req);
    const result = await this.graphStore.deleteGraph(target.iri, this.getPreconditions(req));
    this.applyMutationResponse(res, result.status, result.etag);
  }

  private getPreconditions(req: RequestLike): Preconditions {
    const ifMatch = req.header('if-match');
    const ifNoneMatch = req.header('if-none-match');
    return {
      ifMatch: ifMatch ? this.etagService.extractFirstEtag(ifMatch) ?? undefined : undefined,
      ifNoneMatch: ifNoneMatch ? this.etagService.extractFirstEtag(ifNoneMatch) ?? undefined : undefined,
    };
  }

  private applyMutationResponse(
    res: ResponseLike,
    status: number,
    etag?: string,
    location?: string,
  ): void {
    res.status(status);
    if (etag) {
      res.setHeader('ETag', etag);
    }
    if (location) {
      res.setHeader('Location', location);
    }
  }
}

function hasExplicitPostTarget(req: RequestLike): boolean {
  return typeof req.params?.iri === 'string'
    || Object.hasOwn(req.query ?? {}, 'graph')
    || Object.hasOwn(req.query ?? {}, 'default');
}

function toMultipartParts(files: UploadedFileLike[]): MultipartPart[] | undefined {
  if (files.length === 0) {
    return undefined;
  }

  return files.map((file) => ({
    buffer: file.buffer,
    contentType: file.mimetype,
    filename: file.originalname,
  }));
}

async function readRequestBody(req: RequestLike): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }
  if (
    req.body !== undefined
    && req.body !== null
    && typeof req.body === 'object'
    && Object.keys(req.body).length > 0
  ) {
    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
