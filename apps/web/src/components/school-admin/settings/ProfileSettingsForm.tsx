"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import type { SchoolRecord, SchoolSettingsResponse } from "@makyschool/shared/types";
import {
  ProfileStep,
  type ProfileValue,
} from "@/components/school-admin/setup/steps/ProfileStep";
import {
  SettingsFormFooter,
  SettingsSection,
} from "@/components/school-admin/settings/SettingsFormLayout";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/providers/ToastProvider";

function MediaPreviewCard({ label, src, alt }: { label: string; src: string; alt: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-theme bg-theme-raised/60 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-theme-muted">{label}</p>
      <div className="flex min-h-[7rem] flex-1 items-center justify-center rounded-lg border border-dashed border-theme bg-theme-page p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-24 w-auto max-w-full object-contain" />
      </div>
    </div>
  );
}

function contactsFromProfile(profile: SchoolRecord): Pick<ProfileValue, "emails" | "phones"> {
  const emails =
    profile.emails?.length
      ? profile.emails
      : profile.email
        ? [profile.email]
        : [""];
  const phones =
    profile.phones?.length
      ? profile.phones
      : profile.phone
        ? [profile.phone]
        : [""];
  return { emails, phones };
}

export function ProfileSettingsForm({
  settings,
  onSaved,
}: {
  settings: SchoolSettingsResponse;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const profile = settings.profile;
  const initialContacts = contactsFromProfile(profile);
  const [value, setValue] = useState<ProfileValue>({
    name: profile.name ?? "",
    logo: null,
    stamp: null,
    emails: initialContacts.emails,
    phones: initialContacts.phones,
    address: profile.address ?? "",
    schoolType: (profile.school_type ?? "primary") as string,
    theologyEnabled: profile.theology_enabled ?? false,
  });
  const [mediaUrls, setMediaUrls] = useState({
    logo: profile.logo_url ?? null,
    stamp: profile.stamp_url ?? null,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(profile.logo_url ?? null);
  const [stampPreview, setStampPreview] = useState<string | null>(profile.stamp_url ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMediaUrls({
      logo: profile.logo_url ?? null,
      stamp: profile.stamp_url ?? null,
    });
  }, [profile.logo_url, profile.stamp_url]);

  useEffect(() => {
    if (!value.logo) {
      setLogoPreview(mediaUrls.logo);
      return;
    }
    const objectUrl = URL.createObjectURL(value.logo);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [value.logo, mediaUrls.logo]);

  useEffect(() => {
    if (!value.stamp) {
      setStampPreview(mediaUrls.stamp);
      return;
    }
    const objectUrl = URL.createObjectURL(value.stamp);
    setStampPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [value.stamp, mediaUrls.stamp]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const name = value.name.trim();
    if (!name) {
      setError("School name is required.");
      setSaving(false);
      return;
    }

    const emails = value.emails.map((e) => e.trim()).filter(Boolean);
    const phones = value.phones.map((p) => p.trim()).filter(Boolean);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("emails", JSON.stringify(emails));
    formData.append("phones", JSON.stringify(phones));
    formData.append("address", value.address.trim());
    // School type is locked post-setup — do not send changes.
    if (value.logo) formData.append("logo", value.logo);
    if (value.stamp) formData.append("stamp", value.stamp);

    try {
      const response = await apiClient<SchoolRecord>("/schools/settings/profile", {
        method: "PATCH",
        body: formData,
      });
      setMediaUrls({
        logo: response.data.logo_url ?? mediaUrls.logo,
        stamp: response.data.stamp_url ?? mediaUrls.stamp,
      });
      setValue((current) => ({
        ...current,
        name: response.data.name ?? current.name,
        address: response.data.address ?? current.address,
        logo: null,
        stamp: null,
        emails: response.data.emails?.length
          ? response.data.emails
          : response.data.email
            ? [response.data.email]
            : [""],
        phones: response.data.phones?.length
          ? response.data.phones
          : response.data.phone
            ? [response.data.phone]
            : [""],
      }));
      toast.success("School profile saved.");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save profile.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={ImageIcon}
        title="Branding & contact"
        description="Logo, stamp, and school contact information. You can add multiple emails and phone numbers."
      >
        {(logoPreview || stampPreview) && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {logoPreview ? <MediaPreviewCard label="Logo preview" src={logoPreview} alt="School logo" /> : null}
            {stampPreview ? <MediaPreviewCard label="Stamp preview" src={stampPreview} alt="School stamp" /> : null}
          </div>
        )}
        <ProfileStep
          value={value}
          onChange={(next) => setValue(next)}
          lockSchoolType
        />
      </SettingsSection>

      {error ? (
        <div className="rounded-xl bg-theme-danger-bg px-4 py-3 text-sm text-theme-danger">{error}</div>
      ) : null}

      <SettingsFormFooter saving={saving} saveLabel="Save profile" onSave={() => void handleSave()} />
    </div>
  );
}
