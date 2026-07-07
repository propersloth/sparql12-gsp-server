export interface Identity {
  id: string;
  roles: string[];
  claims: Record<string, unknown>;
}

export interface AuthResult {
  authenticated: boolean;
  identity?: Identity;
  scheme: string;
}

export interface RequestLike {
  headers: Record<string, string | undefined>;
  method?: string;
  identity?: Identity;
}

export interface AuthStrategy {
  name: string;
  canHandle(request: RequestLike): boolean;
  authenticate(request: RequestLike): Promise<AuthResult>;
}

export interface ApiKeyValidation {
  valid: boolean;
  identity?: Identity;
}
