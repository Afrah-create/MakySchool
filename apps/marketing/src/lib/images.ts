/**
 * Central registry for marketing images under /public/images.
 * Update entries here when assets change.
 */
export const marketingImages = {
  hero: {
    src: "/images/Hero.png",
    alt: "School administrator using the MakySchool dashboard on a laptop",
    width: 1408,
    height: 768,
  },
  classes: {
    src: "/images/image1.png",
    alt: "MakySchool dashboard showing classes, students, and school overview",
    width: 1408,
    height: 768,
  },
  portals: {
    src: "/images/Teacher.png",
    alt: "Teacher using MakySchool student assessment tools in the classroom",
    width: 1408,
    height: 768,
  },
  fees: {
    src: "/images/Headteacher.png",
    alt: "Head teacher reviewing fee collection and attendance analytics on MakySchool",
    width: 1408,
    height: 768,
  },
  roles: {
    src: "/images/Registration.png",
    alt: "School registrar helping a learner and parent during enrollment",
    width: 1408,
    height: 768,
  },
  academics: {
    src: "/images/Teacher.png",
    alt: "Teacher tracking learner assessment and progress in MakySchool",
    width: 1408,
    height: 768,
  },
  branding: {
    src: "/images/Hero.png",
    alt: "Branded MakySchool workspace for Greenfield Academy",
    width: 1408,
    height: 768,
  },
  primary: {
    src: "/images/Registration.png",
    alt: "Primary school enrollment and registration with MakySchool",
    width: 1408,
    height: 768,
  },
  secondary: {
    src: "/images/secondary.png",
    alt: "Secondary school growth dashboard and analytics in MakySchool",
    width: 1408,
    height: 768,
  },
  theology: {
    src: "/images/Teacher.png",
    alt: "Islamic school teacher managing theology and Quran studies in MakySchool",
    width: 1408,
    height: 768,
  },
  og: {
    src: "/images/Hero.png",
    alt: "MakySchool — school management platform",
    width: 1408,
    height: 768,
  },
} as const;

export type MarketingImageKey = keyof typeof marketingImages;

export function getMarketingImage(key: MarketingImageKey) {
  return marketingImages[key];
}
