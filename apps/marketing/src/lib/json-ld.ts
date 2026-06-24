import { faqItems, siteConfig, siteUrl } from "./site";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.company,
    alternateName: siteConfig.name,
    url: siteConfig.companyUrl,
    logo: `${siteUrl}/images/Hero.png`,
    description: siteConfig.description,
    address: {
      "@type": "PostalAddress",
      addressCountry: "Uganda",
      addressRegion: "Kampala",
    },
    sameAs: [
      siteConfig.companyUrl,
      // Add social media links when available
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: siteConfig.contactEmail,
      telephone: siteConfig.contactPhone,
      contactType: "customer support",
      areaServed: "UG",
      availableLanguage: "English",
    },
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "Uganda's best school management system for primary schools, secondary schools, and Islamic schools. Manage classes, academics, theology curriculum, teachers, learners, fees in UGX, and complete school operations from one platform.",
    url: siteUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "UGX",
      description: "Contact for school pricing",
      priceValidUntil: "2026-12-31",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "35",
      bestRating: "5",
      worstRating: "1",
    },
    review: [
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Grace Apio" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody: "Best school management system in Uganda. We finally have one place for classes, teachers, and fees instead of spreadsheets.",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Sheikh Ibrahim Musa" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody: "Perfect for our Islamic school. Manages Islamic studies and theology alongside regular curriculum. MakySchool understands Muslim schools in Uganda.",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "David Okello" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody: "As a head teacher, MakySchool transformed our secondary school operations. Teachers see only their classes, and the bursar portal made fee collection transparent.",
      },
    ],
    provider: {
      "@type": "Organization",
      name: siteConfig.company,
      url: siteConfig.companyUrl,
    },
  };
}

export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: siteConfig.name,
    image: `${siteUrl}/images/Hero.png`,
    "@id": siteUrl,
    url: siteUrl,
    telephone: siteConfig.contactPhone,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      addressCountry: "UG",
      addressRegion: "Kampala",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 0.3476,
      longitude: 32.5825,
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
      ],
      opens: "08:00",
      closes: "18:00",
    },
    sameAs: [
      siteConfig.companyUrl,
    ],
  };
}

export function faqPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: `${siteConfig.name} School Management`,
    url: siteUrl,
    description: siteConfig.description,
    inLanguage: "en-UG",
    publisher: {
      "@type": "Organization",
      name: siteConfig.company,
      url: siteConfig.companyUrl,
    },
  };
}

export function productJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${siteConfig.name} - School Management System`,
    description: siteConfig.description,
    brand: {
      "@type": "Brand",
      name: siteConfig.company,
    },
    offers: {
      "@type": "Offer",
      url: siteUrl,
      priceCurrency: "UGX",
      price: "0",
      priceValidUntil: "2026-12-31",
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: siteConfig.company,
      },
    },
  };
}

export function generateBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
