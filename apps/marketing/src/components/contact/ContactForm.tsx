"use client";

import { useState } from "react";
import { siteConfig } from "@/lib/site";

type ContactFormState = {
  name: string;
  schoolName: string;
  email: string;
  phone: string;
  schoolType: string;
  interest: string;
  message: string;
};

const initialState: ContactFormState = {
  name: "",
  schoolName: "",
  email: "",
  phone: "",
  schoolType: "",
  interest: "demo",
  message: "",
};

const schoolTypes = [
  { value: "", label: "Select school type" },
  { value: "primary", label: "Primary school" },
  { value: "secondary", label: "Secondary school" },
  { value: "both", label: "Primary & secondary" },
  { value: "group", label: "School group / operator" },
] as const;

const interestOptions = [
  { value: "demo", label: "Book a demo" },
  { value: "pricing", label: "Pricing enquiry" },
  { value: "onboarding", label: "Onboarding support" },
  { value: "other", label: "General question" },
] as const;

export function ContactForm() {
  const [form, setForm] = useState<ContactFormState>(initialState);
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: keyof ContactFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const subject = encodeURIComponent(
      `${form.interest === "demo" ? "Demo request" : "Contact"} — ${form.schoolName || form.name}`,
    );
    const body = encodeURIComponent(
      [
        `Name: ${form.name}`,
        `School: ${form.schoolName}`,
        `Email: ${form.email}`,
        `Phone: ${form.phone}`,
        `School type: ${form.schoolType}`,
        `Interest: ${form.interest}`,
        "",
        form.message,
      ].join("\n"),
    );

    window.location.href = `mailto:${siteConfig.contactEmail}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div id="contact-form" className="scroll-mt-28">
      <div className="rounded-2xl border border-theme bg-theme-surface p-6 shadow-theme-card sm:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-theme-primary">Send us a message</h2>
         
        </div>

        {submitted ? (
          <div className="rounded-xl border border-theme bg-theme-accent-muted px-5 py-4">
            <p className="text-sm font-medium text-theme-primary">Your email app should open shortly.</p>
            <p className="mt-2 text-sm text-theme-muted">
              If it does not, write to{" "}
              <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-theme-accent hover:underline">
                {siteConfig.contactEmail}
              </a>{" "}
              with your school details.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">Full name</span>
                <input
                  type="text"
                  name="name"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="ms-input w-full"
                  placeholder="Enter Full Names"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">School name</span>
                <input
                  type="text"
                  name="schoolName"
                  required
                  value={form.schoolName}
                  onChange={(event) => updateField("schoolName", event.target.value)}
                  className="ms-input w-full"
                  placeholder="School Name"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">Email address</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="ms-input w-full"
                  placeholder="Enter your email"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">Phone number</span>
                <input
                  type="tel"
                  name="phone"
                  required
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="ms-input w-full"
                  placeholder="Phone Number"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">School type</span>
                <select
                  name="schoolType"
                  required
                  value={form.schoolType}
                  onChange={(event) => updateField("schoolType", event.target.value)}
                  className="ms-input w-full"
                >
                  {schoolTypes.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-theme-primary">I want to</span>
                <select
                  name="interest"
                  required
                  value={form.interest}
                  onChange={(event) => updateField("interest", event.target.value)}
                  className="ms-input w-full"
                >
                  {interestOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-theme-primary">Message</span>
              <textarea
                name="message"
                rows={5}
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                className="ms-input w-full resize-y"
                placeholder="Tell us about your school size, current challenges, or what you would like to see in a demo."
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button type="submit" className="ms-btn-primary rounded-full px-7 py-3 text-sm shadow-theme-accent">
                Send message
              </button>
             
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
