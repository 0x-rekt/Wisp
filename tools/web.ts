import { tavily } from "@tavily/core";
import { readConfig } from "../config";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 500;

/** Delays for successive retry attempts (ms). */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

/**
 * Returns true for errors that are worth retrying (network blips, 5xx).
 * Returns false for permanent failures (bad key, quota, invalid query).
 */
const isTransient = (error: unknown): boolean => {
  const e = error as { status?: number; statusCode?: number; message?: string };
  const status = e.status ?? e.statusCode;
  if (typeof status === "number") {
    // 4xx errors are permanent; 5xx / no-status are transient
    return status >= 500 || status === 0;
  }
  const msg = e.message ?? "";
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const webSearch = async (
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
): Promise<WebSearchResponse> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0)
    throw new Error("web_search: query cannot be empty");
  if (normalizedQuery.length > MAX_QUERY_LENGTH)
    throw new Error(`web_search: query exceeds ${MAX_QUERY_LENGTH} characters`);
  if (
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > MAX_RESULTS
  )
    throw new Error(
      `web_search: maxResults must be an integer from 1 to ${MAX_RESULTS}`,
    );

  const apiKey = readConfig().tavilyApiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("web_search: TAVILY_API_KEY is not configured");

  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await tavily({ apiKey }).search(normalizedQuery, {
        maxResults,
        searchDepth: "basic",
        includeAnswer: false,
        includeRawContent: false,
      });

      return {
        query: normalizedQuery,
        results: response.results.map((result) => ({
          title: result.title,
          url: result.url,
          content: result.content,
        })),
      };
    } catch (error) {
      lastError = error;

      // Don't retry permanent errors
      if (!isTransient(error)) break;

      // Don't wait after the last attempt
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await sleep(delay);
    }
  }

  const message = lastError instanceof Error ? lastError.message : "request failed";
  throw new Error(`web_search: Tavily request failed: ${message}`);
};
