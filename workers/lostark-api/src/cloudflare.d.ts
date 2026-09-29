interface DurableObject {
  fetch(request: Request): Promise<Response> | Response;
}

interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
    delete(key: string): Promise<boolean>;
  };
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
