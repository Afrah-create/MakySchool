const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const siteConfig = {
  name: "MakySchool",
  tagline: "Uganda's leading school management system",
  description:
    "MakySchool is Uganda's best school management platform for traditional and international schools — primary, secondary, and theology-focused schools. Manage classes, academics, theology curriculum, teachers, learners, fees, and complete school operations in one modern system.",
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
  { value: "15+", label: "Modules for complete school operations" },
  { value: "CBC", label: "Competency-based curriculum" },
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
    title: "CBC competency-based assessment",
    description:
      "Track competencies (critical thinking, problem solving, communication) with continuous assessment, not just exam marks. Record assignments, projects, group work, and practical activities throughout the term.",
    imageKey: "academics" as const,
  },
  {
    title: "Classes & streams",
    description:
      "Organise primary and secondary levels with streams, subjects, and term-based academic structure. Support for P1-P7, S1-S4, S5-S6 with PLE, UCE, and UACE tracking.",
    imageKey: "classes" as const,
  },
  {
    title: "Continuous assessment module",
    description:
      "Record assignments, projects, group work, practicals, class participation, and presentations. CBC-aligned tracking shows exceeds/meets/approaching/below expectations, not just percentages.",
    imageKey: "academics" as const,
  },
  {
    title: "Teacher & learner portals",
    description:
      "Dedicated workspaces for teachers and learners. Teachers manage schemes of work, lesson plans, and competency assessments. Learners and parents access reports and attendance.",
    imageKey: "portals" as const,
  },
  {
    title: "Fees & bursar module",
    description:
      "Fee structures in UGX, term payments, receipts, outstanding balances, and parent fee tracking. Bursar portal with payment recording, voiding, and comprehensive reports.",
    imageKey: "fees" as const,
  },
  {
    title: "Theology & secular subjects",
    description:
      "Manage theology curriculum alongside secular subjects. Generate combined reports and theology-only reports. Full support for faith-based education programs.",
    imageKey: "branding" as const,
  },
  {
    title: "CBC report cards",
    description:
      "Uganda CBC-compliant report cards with academic performance, competency ratings, teacher comments, headteacher remarks, attendance, student strengths, and improvement areas.",
    imageKey: "academics" as const,
  },
  {
    title: "Parent portal",
    description:
      "Parents view CBC reports, monitor attendance, track fees, receive school announcements, and communicate with teachers from any device.",
    imageKey: "portals" as const,
  },
  {
    title: "Attendance & discipline",
    description:
      "Daily attendance tracking, discipline records, medical information, and behavior monitoring. Generate attendance reports and trend analytics.",
    imageKey: "roles" as const,
  },
  {
    title: "Analytics dashboard",
    description:
      "View best-performing students, weak subjects, attendance trends, fee balances, teacher performance, and CBC competency achievement rates across your school.",
    imageKey: "academics" as const,
  },
  {
    title: "Role-based access",
    description:
      "Admin, head teacher, teacher, bursar, and learner permissions enforced across every route. Audit logs, user management, and secure role-based workflows.",
    imageKey: "roles" as const,
  },
  {
    title: "School branding",
    description:
      "Each school gets a branded workspace with its own identity across portals, report cards, and communications.",
    imageKey: "branding" as const,
  },
] as const;

export const pricingTiers = [
  {
    name: "School",
    price: "Contact us",
    description: "For a single primary or secondary school getting started with CBC-compliant management.",
    features: [
      "Unlimited staff & learner accounts",
      "CBC competency-based assessment",
      "Continuous assessment tracking",
      "Classes, subjects & academic terms",
      "Teacher & learner portals",
      "Fees management & bursar portal",
      "Theology & secular subjects",
      "CBC-compliant report cards",
      "Parent portal access",
      "Guided onboarding support",
    ],
    cta: "Book a demo",
    highlighted: false,
  },
  {
    name: "Campus",
    price: "Custom",
    description: "For schools with multiple sections, streams, or growing teams needing advanced analytics.",
    features: [
      "Everything in School",
      "Advanced analytics dashboard",
      "Competency achievement tracking",
      "Teacher performance reports",
      "Attendance & discipline analytics",
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
    description: "For education groups, dioceses, or operators managing several institutions with centralized oversight.",
    features: [
      "Everything in Campus",
      "Multi-school provisioning",
      "Central platform administration",
      "Cross-school analytics",
      "Group-wide reporting",
      "Volume pricing",
      "Custom rollout planning",
      "Enterprise support",
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
      "MakySchool is Uganda's leading school management platform, serving primary schools, secondary schools, and theology-focused schools. It provides complete academic management, theology curriculum support, fees collection, teacher and learner portals, and comprehensive school operations from one modern cloud-based system.",
  },
  {
    question: "Does MakySchool support theology programs?",
    answer:
      "Yes. MakySchool supports schools with theology curriculum management, religious studies tracking, and all standard academic features. Schools can manage both religious and secular subjects within the same system.",
  },
  {
    question: "How much does school management software cost in Uganda?",
    answer:
      "MakySchool offers flexible pricing for Ugandan schools. Contact us for a demo and custom quote based on your school size, whether primary, secondary, or Islamic school. Pricing includes all features: academics, fees management, portals, and support.",
  },
  {
    question: "Can MakySchool handle school fees in UGX?",
    answer:
      "Yes. MakySchool is built for Ugandan schools with full UGX currency support. Define term fees, record payments in shillings, generate receipts, track balances, and manage complete fee collection workflows.",
  },
  {
    question: "Who uses MakySchool?",
    answer:
      "School administrators, head teachers, teachers, bursars, and learners each get a dedicated portal tailored to their daily work. Used by primary schools, secondary schools, theology-focused schools, and education groups across Uganda including Kampala, Gulu, Mbarara, and other regions.",
  },
  {
    question: "Does MakySchool support PLE and UCE/UACE?",
    answer:
      "Yes. MakySchool supports Uganda's national exams including PLE for primary schools (P7) and UCE/UACE for secondary schools (S4 and S6). Manage candidate registration, marks tracking, and exam preparation workflows.",
  },
  {
    question: "What types of schools can use MakySchool?",
    answer:
      "MakySchool serves primary schools (P1-P7), secondary schools (O-Level S1-S4, A-Level S5-S6), schools with theology programs, mixed schools, boarding schools, day schools, and multi-campus education groups throughout Uganda.",
  },
  {
    question: "How do schools get started with MakySchool?",
    answer:
      "Book a demo with our team. We walk you through the platform, plan your rollout including theology curriculum if needed, and support onboarding for your staff. Setup typically takes less than a week.",
  },
  {
    question: "Does MakySchool work offline or require internet?",
    answer:
      "MakySchool is a cloud-based platform requiring internet access. However, it works on any device with a browser - desktop, laptop, tablet, or smartphone - making it accessible across your school campus.",
  },
  {
    question: "Is MakySchool only for Uganda?",
    answer:
      "MakySchool is built specifically for Ugandan schools — three-term years, local currency, theology education support, and workflows common in East African schools. It can serve similar institutions across the region.",
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
    title: "Theology programs",
    summary: "Complete support for theology curriculum and religious education.",
    description:
      "Manage theology studies, religious education tracking, and faith-based subjects alongside standard curriculum for schools with religious programs in Uganda.",
    bullets: [
      "Theology curriculum management",
      "Religious studies and subjects",
      "Combined secular and religious education",
      "Faith-based education support",
      "Full school management features",
    ],
    imageKey: "theology",
  },
];

export function getSolution(slug: string) {
  return solutions.find((item) => item.slug === slug);
}
