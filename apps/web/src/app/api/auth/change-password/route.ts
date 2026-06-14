import { proxyAuthRequest } from "@/lib/api/proxy-auth";

export async function POST(request: Request) {
  return proxyAuthRequest(request, ["change-password"]);
}
