import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // Defaults: localhost:5050 in dev (so `npm run expo:dev:local` works without
  // any env-var setup on a fresh clone — port 5050 because macOS AirPlay
  // squats on 5000), pocketpricerapp.com in production (defense-in-depth so a
  // misconfigured EAS build profile doesn't crash the app). Override either
  // by setting EXPO_PUBLIC_DOMAIN.
  const host =
    process.env.EXPO_PUBLIC_DOMAIN ||
    (__DEV__ ? "localhost:5050" : "pocketpricerapp.com");

  // Localhost runs HTTP (no TLS in local dev). iOS allows this because
  // app.json grants NSAppTransportSecurity → NSAllowsLocalNetworking.
  // Everything else uses HTTPS.
  const isLocalhost =
    host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const scheme = isLocalhost ? "http" : "https";

  return new URL(`${scheme}://${host}`).href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  authToken?: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
