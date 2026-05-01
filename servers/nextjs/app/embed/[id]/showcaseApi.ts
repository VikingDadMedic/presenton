export interface ShowcaseFetchResult {
  response: Response;
  publicStatus: number;
  privateStatus?: number;
}

export interface ShowcaseAskHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ShowcaseAskRequest {
  presentation_id: string;
  slide_id: string;
  question: string;
  topic?: string;
  history?: ShowcaseAskHistoryTurn[];
}

const FALLBACK_STATUSES = new Set([401, 403]);

async function fetchWithPublicFallback(
  publicPath: string,
  privatePath: string,
  init?: RequestInit
): Promise<ShowcaseFetchResult> {
  const publicResponse = await fetch(publicPath, init);
  if (publicResponse.ok || !FALLBACK_STATUSES.has(publicResponse.status)) {
    return {
      response: publicResponse,
      publicStatus: publicResponse.status,
    };
  }

  const privateResponse = await fetch(privatePath, {
    ...init,
    credentials: "include",
  });
  return {
    response: privateResponse,
    publicStatus: publicResponse.status,
    privateStatus: privateResponse.status,
  };
}

export async function fetchShowcasePresentation(
  presentationId: string
): Promise<ShowcaseFetchResult> {
  return fetchWithPublicFallback(
    `/api/v1/public/presentation/${presentationId}`,
    `/api/v1/ppt/presentation/${presentationId}`
  );
}

export async function fetchShowcaseReady(
  presentationId: string
): Promise<ShowcaseFetchResult> {
  return fetchWithPublicFallback(
    `/api/v1/public/showcase/ready/${presentationId}`,
    `/api/v1/ppt/showcase/ready/${presentationId}`
  );
}

export async function fetchShowcaseAsk(
  payload: ShowcaseAskRequest,
  initOverrides?: RequestInit
): Promise<ShowcaseFetchResult> {
  const init: RequestInit = {
    ...initOverrides,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(initOverrides?.headers ?? {}),
    },
    body: JSON.stringify(payload),
  };
  return fetchWithPublicFallback(
    "/api/v1/public/showcase/ask",
    "/api/v1/ppt/showcase/ask",
    init
  );
}
