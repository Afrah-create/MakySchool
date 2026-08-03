export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_ROOT_DOMAIN?: string;
      NEXT_PUBLIC_APP_URL?: string;
      NEXT_PUBLIC_PLATFORM_APP_URL?: string;
      NEXT_PUBLIC_API_URL?: string;
      /** Browser Maps JavaScript API key (restrict by HTTP referrer). */
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
      API_URL?: string;
      API_INTERNAL_URL?: string;
      DEV_TENANT_SLUG?: string;
    }
  }
}
