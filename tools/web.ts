import { tavily } from "@tavily/core";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 500;

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

export const webSearch = async (
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
): Promise<WebSearchResponse> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0)
    throw new Error("web_search: query cannot be empty");
  if (normalizedQuery.length > MAX_QUERY_LENGTH)
    throw new Error(
      `web_search: query exceeds ${MAX_QUERY_LENGTH} characters`,
    );
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS)
    throw new Error(`web_search: maxResults must be an integer from 1 to ${MAX_RESULTS}`);

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey)
    throw new Error("web_search: TAVILY_API_KEY is not configured");

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
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(`web_search: Tavily request failed: ${message}`);
  }
};
