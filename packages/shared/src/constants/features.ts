/** Flip on when MakyPay billing is production-ready (set in root .env). */
export function subscriptionsEnabled() {
  return (
    process.env.SUBSCRIPTIONS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED === "true"
  );
}
