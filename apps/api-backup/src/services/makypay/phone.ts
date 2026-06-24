/** Normalize user input to MakyPay format: 256XXXXXXXXX (12 digits). */
export function normalizeUgandaPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  if (digits.startsWith("256") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `256${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `256${digits}`;
  }

  return null;
}

export function formatPhoneForDisplay(phone: string) {
  if (phone.length !== 12 || !phone.startsWith("256")) {
    return phone;
  }

  return `+${phone.slice(0, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
}
