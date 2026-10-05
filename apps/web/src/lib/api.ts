/**
 * Typed client for the Express API. All requests go to same-origin /api/*
 * (proxied by Next.js), carry the httpOnly session cookie, and unwrap the
 * { success, data, meta } envelope.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface Paged<T, M = PageMeta> {
  data: T[];
  meta: M;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`/api${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<{ data: T; meta?: PageMeta }> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError("Can't reach the server. Check your connection and try again.", 0, "NETWORK");
  }

  let json: { success?: boolean; data?: T; meta?: PageMeta; message?: string; code?: string; errors?: Record<string, string[]> } = {};
  try {
    json = await res.json();
  } catch {
    // Non-JSON (e.g. proxy error page)
  }

  if (!res.ok || json.success === false) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // A full navigation (not router.push) is intentional: it drops every cached query of the expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${next}`;
    }
    const message =
      json.message ?? (res.status >= 500 ? "The server had a problem. Please try again." : `Request failed (${res.status})`);
    throw new ApiClientError(message, res.status, json.code, json.errors);
  }
  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: async <T>(path: string, query?: Query) => (await request<T>("GET", path, undefined, query)).data,
  page: async <T, M extends PageMeta = PageMeta>(path: string, query?: Query): Promise<Paged<T, M>> => {
    const r = await request<T[]>("GET", path, undefined, query);
    return { data: r.data, meta: (r.meta ?? { page: 1, pageSize: r.data.length, total: r.data.length, pageCount: 1 }) as M };
  },
  post: async <T>(path: string, body?: unknown) => (await request<T>("POST", path, body ?? {})).data,
  patch: async <T>(path: string, body?: unknown) => (await request<T>("PATCH", path, body ?? {})).data,
  put: async <T>(path: string, body?: unknown) => (await request<T>("PUT", path, body ?? {})).data,
  del: async <T>(path: string) => (await request<T>("DELETE", path)).data,
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
