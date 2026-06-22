export type CreateTeacherInput = {
  full_name?: string;
  email?: string;
  phone?: string;
};

export function validateTeacherForm(data: CreateTeacherInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.full_name?.trim()) {
    errors.full_name = "Full name is required.";
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = "Full name must be at least 2 characters.";
  } else if (data.full_name.trim().length > 100) {
    errors.full_name = "Full name must be under 100 characters.";
  }

  if (!data.email?.trim()) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (data.phone && !/^\+?[0-9\s\-]{7,15}$/.test(data.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  return errors;
}

export function teacherInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function teacherFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function marksStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "draft":
      return "Draft";
    default:
      return "Pending";
  }
}
