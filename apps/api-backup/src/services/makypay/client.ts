const DEFAULT_BASE_URL = "https://wire-api.makylegacy.com/api/v1";

type MakyPayResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
  error?: string;
};

type CollectionData = {
  transaction?: {
    uuid?: string;
    reference?: string;
    status?: string;
  };
};

type TransactionData = {
  transaction?: {
    uuid?: string;
    reference?: string;
    status?: string;
    amount?: { raw?: number };
  };
};

function baseUrl() {
  return (process.env.MAKYWIRE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function makypayConfigured() {
  if (process.env.MAKYWIRE_AUTH_BASIC?.trim()) {
    return true;
  }

  return Boolean(process.env.MAKYWIRE_API_KEY?.trim() && process.env.MAKYWIRE_API_SECRET?.trim());
}

function authorizationHeader() {
  const encoded = process.env.MAKYWIRE_AUTH_BASIC?.trim();
  if (encoded) {
    return `Basic ${encoded}`;
  }

  const apiKey = process.env.MAKYWIRE_API_KEY?.trim();
  const apiSecret = process.env.MAKYWIRE_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error("MakyPay credentials are not configured");
  }

  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

async function makyPayRequest<T>(
  path: string,
  init: RequestInit & { formBody?: URLSearchParams },
): Promise<MakyPayResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorizationHeader());
  headers.set("Accept", "application/json");

  let body = init.body;
  if (init.formBody) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = init.formBody.toString();
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    body,
  });

  const raw = await response.text();
  let payload: MakyPayResponse<T>;

  try {
    payload = raw ? (JSON.parse(raw) as MakyPayResponse<T>) : {};
  } catch {
    throw new Error(`Unexpected MakyPay response (${response.status})`);
  }

  if (!response.ok || payload.status === "error") {
    throw new Error(payload.message ?? payload.error ?? `MakyPay request failed (${response.status})`);
  }

  return payload;
}

export async function collectMobileMoney(params: {
  phoneNumber: string;
  amount: number;
  reference: string;
  description: string;
  callbackUrl?: string;
}) {
  const formBody = new URLSearchParams({
    phone_number: params.phoneNumber,
    amount: String(params.amount),
    country: "UG",
    reference: params.reference,
    description: params.description,
  });

  if (params.callbackUrl) {
    formBody.set("callback_url", params.callbackUrl);
  }

  const result = await makyPayRequest<CollectionData>("/collections/collect-money", {
    method: "POST",
    formBody,
  });

  return {
    transactionId: result.data?.transaction?.uuid ?? null,
    reference: result.data?.transaction?.reference ?? params.reference,
    status: result.data?.transaction?.status ?? "processing",
    message: result.message ?? "Collection initiated",
  };
}

export async function getTransaction(transactionId: string) {
  const result = await makyPayRequest<TransactionData>(`/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
  });

  return {
    transactionId: result.data?.transaction?.uuid ?? transactionId,
    reference: result.data?.transaction?.reference ?? null,
    status: result.data?.transaction?.status ?? "unknown",
    amount: result.data?.transaction?.amount?.raw ?? null,
  };
}
