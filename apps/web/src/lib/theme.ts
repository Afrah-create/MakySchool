/** Shared MakySchool dashboard surface tokens (Tailwind class strings). */
export const theme = {
  page: "min-h-screen bg-[#0F1117] text-[#F0F2FA]",
  panel: "rounded-2xl border border-[#252A3A] bg-[#181C27]",
  panelPadding: "p-5 sm:p-6",
  muted: "text-[#8B90A7]",
  heading: "text-[#F0F2FA] font-semibold",
  input:
    "w-full rounded-lg border border-[#252A3A] bg-[#0F1117] px-4 py-2.5 text-sm text-[#F0F2FA] outline-none placeholder:text-[#3D4357] focus:border-[#4F6EF7] focus:ring-2 focus:ring-[#4F6EF7]/30",
  select:
    "rounded-lg border border-[#252A3A] bg-[#0F1117] px-4 py-2.5 text-sm text-[#F0F2FA] outline-none focus:border-[#4F6EF7] focus:ring-2 focus:ring-[#4F6EF7]/30",
  btnPrimary:
    "inline-flex items-center justify-center rounded-lg bg-[#4F6EF7] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3D5CE6] disabled:opacity-60",
  btnGhost:
    "inline-flex items-center justify-center rounded-lg border border-[#252A3A] px-4 py-2.5 text-sm font-medium text-[#F0F2FA] transition hover:bg-[#252A3A]/50 disabled:opacity-60",
  tableHead: "bg-[#0F1117] text-left text-xs font-medium text-[#8B90A7]",
  divider: "border-[#252A3A]",
} as const;
