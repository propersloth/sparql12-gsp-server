/**
 * NAMING CAUTION (v2):
 *   /graph/:iri   — percent-encoded IRI parameter (direct identification)
 *   /graphs/:uuid — server-minted UUID (minted-graph resource shape, D-3)
 * These two route prefixes differ by ONE character. Do not confuse them.
 */
import {
  All,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Head,
  Options,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { MethodNotAllowedFilter } from '../common/filters/method-not-allowed.filter';
import { MethodNotAllowedException } from './exceptions/method-not-allowed.exception';
import { PatchMediaTypeFilter } from './filters/patch-media-type.filter';
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

type OptionsResponseLike = {
  status(code: number): OptionsResponseLike;
  header(name: string, value: string): OptionsResponseLike;
  send(): void;
};

type UploadedFileLike = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Controller()
export class GraphStoreController {
  /** Allowed methods for /graph/:iri and /graphs/:uuid (v2: POST added, C2). */
  private readonly graphResourceAllow = 'GET, HEAD, PUT, POST, DELETE, PATCH, OPTIONS';
  /** Allowed methods for /graph-store (v2: PATCH added, D-2). */
  private readonly storeAllow = 'GET, HEAD, PUT, POST, DELETE, PATCH, OPTIONS';

  constructor(
    private readonly graphStore: GraphStoreService,
    private readonly routing: GraphRoutingService,
    private readonly etagService: ETagService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  private get patchEnabled(): boolean {
    return this.configService?.get<boolean>('GSP_PATCH_ENABLED') ?? true;
  }

  private mintedIri(uuid: string): string {
    return this.graphStore.mintedGraphIri(uuid);
  }

  @Get('graph/:iri')
  @UseGuards(OptionalAuthGuard)
  async getDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<string> {
    return this.handleGet(req, res);
  }

  @Get('graph-store')
  @UseGuards(OptionalAuthGuard)
  async getIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<string> {
    return this.handleGet(req, res);
  }

  @Head('graph/:iri')
  @UseGuards(OptionalAuthGuard)
  async headDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleHead(req, res);
  }

  @Head('graph-store')
  @UseGuards(OptionalAuthGuard)
  async headIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleHead(req, res);
  }

  @Put('graph/:iri')
  @UseGuards(JwtOrApiKeyGuard)
  async putDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePut(req, res);
  }

  @Put('graph-store')
  @UseGuards(JwtOrApiKeyGuard)
  async putIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePut(req, res);
  }

  @Post('graph/:iri')
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage() }))
  async postDirect(
    @Req() req: RequestLike,
    @UploadedFiles() files: UploadedFileLike[] = [],
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePost(req, files, res);
  }

  @Post('graph-store')
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage() }))
  async postIndirect(
    @Req() req: RequestLike,
    @UploadedFiles() files: UploadedFileLike[] = [],
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePost(req, files, res);
  }

  @Delete('graph/:iri')
  @UseGuards(JwtOrApiKeyGuard)
  async deleteDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleDelete(req, res);
  }

  @Delete('graph-store')
  @UseGuards(JwtOrApiKeyGuard)
  async deleteIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handleDelete(req, res);
  }

  @Patch('graph/:iri')
  @UseGuards(JwtOrApiKeyGuard)
  @UseFilters(PatchMediaTypeFilter)
  async patchDirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePatch(req, res);
  }

  @Patch('graph-store')
  @UseGuards(JwtOrApiKeyGuard)
  @UseFilters(PatchMediaTypeFilter)
  async patchIndirect(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.handlePatch(req, res);
  }

  /**
   * v2 (H4 fix): headers set explicitly via Res(); the v1 version returned an
   * object from the method body, which Nest serializes as the JSON response
   * body — Allow/Accept-Patch never reached actual HTTP headers.
   */
  @Options('graph/:iri')
  optionsGraph(@Res() res: OptionsResponseLike): void {
    res.header('Allow', this.graphResourceAllow);
    if (this.patchEnabled) {
      res.header('Accept-Patch', 'application/sparql-update');
    }
    res.status(204).send();
  }

  /**
   * Catch-all for /graph/:iri — any verb not listed above → 405.
   * MUST appear AFTER all specific handlers so NestJS routes specific
   * methods first and only falls through here for unregistered verbs.
   */
  @All('graph/:iri')
  @UseFilters(MethodNotAllowedFilter)
  catchAllGraph(): never {
    throw new MethodNotAllowedException(this.graphResourceAllow);
  }

  // ── Resource: /graph-store (indirect identification, incl. ?default) ───────

  @Options('graph-store')
  optionsStore(@Res() res: OptionsResponseLike): void {
    res.header('Allow', this.storeAllow);
    if (this.patchEnabled) {
      res.header('Accept-Patch', 'application/sparql-update');
    }
    res.status(204).send();
  }

  @All('graph-store')
  @UseFilters(MethodNotAllowedFilter)
  catchAllStore(): never {
    throw new MethodNotAllowedException(this.storeAllow);
  }

  // ── Resource: /graphs/:uuid (v2, D-3 — direct route for server-minted graphs) ──
  //
  // POST-to-store mints {baseUrl}/graphs/{uuid} and returns it as an absolute
  // Location header. Without this resource shape, a client that follows that
  // Location with a plain GET received a generic Nest 404. Every handler here
  // reconstructs the full IRI and delegates to the SAME GraphStoreService
  // methods used by /graph/:iri.

  @Get('graphs/:uuid')
  @UseGuards(OptionalAuthGuard)
  async getMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<string> {
    const iri = this.mintedIri(uuid);
    const result = await this.graphStore.getGraph(
      iri,
      req.header('accept'),
      req.header('if-none-match') ?? undefined,
    );
    res.status(result.status);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
    return result.content;
  }

  @Head('graphs/:uuid')
  @UseGuards(OptionalAuthGuard)
  async headMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    const iri = this.mintedIri(uuid);
    const result = await this.graphStore.headGraph(iri, req.header('accept'));
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
  }

  @Put('graphs/:uuid')
  @UseGuards(JwtOrApiKeyGuard)
  async putMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    const iri = this.mintedIri(uuid);
    const body = await readRequestBody(req);
    const preconditions = this.getPreconditions(req);
    const result = await this.graphStore.putGraph(
      iri,
      body,
      req.header('content-type') ?? '',
      preconditions,
    );
    this.applyMutationResponse(res, result.status, result.etag, result.location);
  }

  @Post('graphs/:uuid')
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage() }))
  async postMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @UploadedFiles() files: UploadedFileLike[] = [],
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    const iri = this.mintedIri(uuid);
    const parts = toMultipartParts(files);
    const body = parts ? Buffer.alloc(0) : await readRequestBody(req);
    const result = await this.graphStore.postGraph(
      body,
      req.header('content-type') ?? '',
      iri,
      parts,
    );
    this.applyMutationResponse(res, result.status, result.etag, result.location);
  }

  @Delete('graphs/:uuid')
  @UseGuards(JwtOrApiKeyGuard)
  async deleteMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    const iri = this.mintedIri(uuid);
    const result = await this.graphStore.deleteGraph(iri, this.getPreconditions(req));
    this.applyMutationResponse(res, result.status, result.etag);
  }

  @Patch('graphs/:uuid')
  @UseGuards(JwtOrApiKeyGuard)
  @UseFilters(PatchMediaTypeFilter)
  async patchMintedGraph(
    @Param('uuid') uuid: string,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    const iri = this.mintedIri(uuid);
    const body = await readRequestBody(req);
    const ifMatch = req.header('if-match') ?? undefined;
    const result = await this.graphStore.patchGraph(
      iri,
      body.toString('utf-8'),
      req.header('content-type') ?? '',
      ifMatch,
    );
    res.status(result.status);
    if (result.etag) {
      res.setHeader('ETag', result.etag);
    }
  }

  @Options('graphs/:uuid')
  optionsMintedGraph(@Res() res: OptionsResponseLike): void {
    res.header('Allow', this.graphResourceAllow);
    if (this.patchEnabled) {
      res.header('Accept-Patch', 'application/sparql-update');
    }
    res.status(204).send();
  }

  @All('graphs/:uuid')
  @UseFilters(MethodNotAllowedFilter)
  catchAllMintedGraph(): never {
    throw new MethodNotAllowedException(this.graphResourceAllow);
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
    // Require an explicit target on the indirect resource: neither ?graph=<iri> nor
    // ?default was provided (isIndirect=false) while iri is null → 400, not 405.
    // Direct routes always have a non-null iri, so this check never fires there.
    if (target.iri === null && !target.isIndirect) {
      throw new BadRequestException('No target graph specified: add ?graph=<iri> or ?default');
    }
    const result = await this.graphStore.deleteGraph(target.iri, this.getPreconditions(req));
    this.applyMutationResponse(res, result.status, result.etag);
  }

  private async handlePatch(req: RequestLike, res: ResponseLike): Promise<void> {
    const target = this.routing.resolveTarget(req);
    const body = await readRequestBody(req);
    const ifMatch = req.header('if-match') ?? undefined;
    const result = await this.graphStore.patchGraph(
      target.iri,
      body.toString('utf-8'),
      req.header('content-type') ?? '',
      ifMatch,
    );
    res.status(result.status);
    if (result.etag) {
      res.setHeader('ETag', result.etag);
    }
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
