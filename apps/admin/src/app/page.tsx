import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
} from "@makyschool/shared/constants";

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.get(SUPERADMIN_ACCESS_COOKIE) ?? cookieStore.get(SUPERADMIN_REFRESH_COOKIE);

  redirect(hasSession ? "/dashboard" : "/login");
}
