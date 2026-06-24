const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const siteConfig = {
  name: "MakySchool",
  tagline: "Uganda's leading school management system",
  description:
    "MakySchool is Uganda's best school management platform for primary, secondary, and Islamic schools — classes, academics, theology, teachers, learners, fees, and complete school operations in one modern system.",
  company: "MakyLegacy",
  companyUrl: "https://makylegacy.com",
  contactEmail: "support@makylegacy.com",
  contactPhone: "+256 708 826 558",
  contactWhatsApp: "+256708826558",
  contactLocation: "Kampala, Uganda",
  officeHours: "Mon – Fri, 8:00 AM – 6:00 PM EAT",
  locale: "en_UG",
} as const;

export const siteUrl = trimTrailingSlash(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://makyschool.com",
);

export const contactPageUrl = "/contact";
export const bookDemoUrl = "/contact#contact-form";

export const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

export const stats = [
  { value: "5+", label: "Portals in one platform" },
  { value: "3", label: "Academic terms supported" },
  { value: "UGX", label: "Native fees & receipts" },
  { value: "24/7", label: "Cloud access" },
] as const;

export const howItWorks = [
  {
    step: "01",
    title: "Book a demo",
    description:
      "Tell us about your school. Our team walks you through MakySchool and answers your questions.",
  },
  {
    step: "02",
    title: "Plan your rollout",
    description:
      "We help you map classes, terms, staff roles, and fees workflows before go-live.",
  },
  {
    step: "03",
    title: "Onboard your team",
    description:
      "Add head teachers, teachers, bursars, and learners — each role gets a focused portal.",
  },
  {
    step: "04",
    title: "Run daily operations",
    description:
      "Manage academics, attendance, marks, fees, and reports from dashboards built for school staff.",
  },
] as const;

export const featureHighlights = [
  {
    title: "Classes & streams",
    description:
      "Organise primary and secondary levels with streams, subjects, and term-based academic structure.",
    imageKey: "classes" as const,
  },
  {
    title: "Teacher & learner portals",
    description:
      "Dedicated workspaces for teachers and learners — not a one-size-fits-all admin screen.",
    imageKey: "portals" as const,
  },
  {
    title: "Fees & bursar module",
    description:
      "Fee structures, student accounts, payments, receipts, and outstanding balances with bursar access.",
    imageKey: "fees" as const,
  },
  {
    title: "Role-based access",
    description:
      "Admin, head teacher, teacher, bursar, and learner permissions enforced across every route.",
    imageKey: "roles" as const,
  },
  {
    title: "Academic terms & grading",
    description:
      "Uganda-style three-term years, grading scales, and marks workflows aligned to how schools run.",
    imageKey: "academics" as const,
  },
  {
    title: "School branding",
    description:
      "Each school gets a branded workspace with its own identity across portals and communications.",
    imageKey: "branding" as const,
  },
] as const;

export const pricingTiers = [
  {
    name: "School",
    price: "Contact us",
    description: "For a single primary or secondary school getting started on MakySchool.",
    features: [
      "Unlimited staff & learner accounts",
      "Classes, subjects & academic terms",
      "Teacher & learner portals",
      "Fees management & bursar portal",
      "Guided onboarding support",
    ],
    cta: "Book a demo",
    highlighted: false,
  },
  {
    name: "Campus",
    price: "Custom",
    description: "For schools with multiple sections, streams, or growing administrative teams.",
    features: [
      "Everything in School",
      "Advanced fees reporting",
      "Priority onboarding",
      "Dedicated success contact",
      "Custom training sessions",
    ],
    cta: "Book a demo",
    highlighted: true,
  },
  {
    name: "Group",
    price: "Custom",
    description: "For education groups, dioceses, or operators managing several institutions.",
    features: [
      "Everything in Campus",
      "Multi-school provisioning",
      "Central platform administration",
      "Volume pricing",
      "Custom rollout planning",
    ],
    cta: "Book a demo",
    highlighted: false,
  },
] as const;

export const testimonials = [
  {
    quote:
      "We finally have one place for classes, teachers, and fees instead of spreadsheets and paper receipts.",
    name: "Grace Apio",
    role: "School Administrator",
    location: "Gulu, Uganda",
  },
  {
    quote:
      "Teachers see only their classes and learners. That alone cut confusion across the staff.",
    name: "David Okello",
    role: "Head Teacher",
    location: "Kampala, Uganda",
  },
  {
    quote:
      "The bursar portal made fee collection visible — balances, payments, and receipts in one workflow.",
    name: "Sarah Nakato",
    role: "Bursar",
    location: "Mbarara, Uganda",
  },
] as const;

export const faqItems = [
  {
    question: "What is the best school management system in Uganda?",
    answer:
      "MakySchool is Uganda's leading school management platform, serving primary schools, secondary schools, and Islamic schools. It provides complete academic management, theology curriculum support, fees collection, teacher and learner portals, and comprehensive school operations from one modern cloud-based system.",
  },
  {
    question: "Does MakySchool support Islamic schools and theology?",
    answer:
      "Yes. MakySchool supports Islamic schools with theology curriculum management, Islamic studies tracking, and all standard academic features. Muslim schools can manage both religious and secular subjects within the same system.",
  },
  {
    question: "Who uses MakySchool?",
    answer:
      "School administrators, head teachers, teachers, bursars, and learners each get a dedicated portal tailored to their daily work. Used by primary schools, secondary schools, Islamic schools, and education groups across Uganda.",
  },
  {
    question: "Does MakySchool support school fees?",
    answer:
      "Yes. Schools can define fee structures, assign accounts to learners, record payments, generate receipts, and track outstanding balances. Bursars have a dedicated portal for this work.",
  },
  {
    question: "What types of schools can use MakySchool?",
    answer:
      "MakySchool serves primary schools, secondary schools (O-Level and A-Level), Islamic schools with theology programs, mixed schools, boarding schools, day schools, and multi-campus education groups throughout Uganda.",
  },
  {
    question: "How do schools get started with MakySchool?",
    answer:
      "Book a demo with our team. We walk you through the platform, plan your rollout including theology curriculum if needed, and support onboarding for your staff.",
  },
  {
    question: "Is MakySchool only for Uganda?",
    answer:
      "MakySchool is built specifically for Ugandan schools — three-term years, local currency, Islamic education support, and workflows common in East African schools. It can serve similar institutions across the region.",
  },
] as const;

export type SolutionSlug = "primary-schools" | "secondary-schools" | "fees-bursar" | "islamic-schools";

export const solutions: Array<{
  slug: SolutionSlug;
  title: string;
  summary: string;
  description: string;
  bullets: string[];
  imageKey: "primary" | "secondary" | "fees" | "theology";
}> = [
  {
    slug: "primary-schools",
    title: "Primary schools",
    summary: "Complete management for Uganda's primary schools.",
    description:
      "Run primary levels, streams, subjects, and learner management with portals designed for Ugandan primary school operations.",
    bullets: [
      "Primary class levels P1-P7",
      "Teacher class assignments",
      "Learner profiles and guardians",
      "Term-based academic calendar",
      "PLE preparation support",
    ],
    imageKey: "primary",
  },
  {
    slug: "secondary-schools",
    title: "Secondary schools",
    summary: "O-Level and A-Level operations for Uganda's secondary schools.",
    description:
      "Manage O-Level and A-Level programs, UCE/UACE preparation, subject combinations, and complete secondary school administration.",
    bullets: [
      "O-Level (S1-S4) and A-Level (S5-S6)",
      "Subject combinations and streaming",
      "UCE and UACE exam management",
      "Marks and academic terms",
      "Head teacher oversight portal",
    ],
    imageKey: "secondary",
  },
  {
    slug: "fees-bursar",
    title: "Fees & bursar",
    summary: "Complete fees management with UGX currency support.",
    description:
      "Fee structures, term payments, receipts in UGX, outstanding tracking, and dedicated bursar portal for Uganda's schools.",
    bullets: [
      "Fee structures per term in UGX",
      "Student fee accounts",
      "Payment recording & voiding",
      "PDF receipts and statements",
      "Outstanding balance reports",
    ],
    imageKey: "fees",
  },
  {
    slug: "islamic-schools",
    title: "Islamic schools & theology",
    summary: "Complete support for Islamic education and theology curriculum.",
    description:
      "Manage Islamic studies, Quran memorization tracking, theology subjects alongside standard curriculum for Muslim schools in Uganda.",
    bullets: [
      "Islamic studies curriculum",
      "Quran and theology subjects",
      "Combined secular and religious education",
      "Arabic language support",
      "Full school management features",
    ],
    imageKey: "theology",
  },
];

export function getSolution(slug: string) {
  return solutions.find((item) => item.slug === slug);
}
