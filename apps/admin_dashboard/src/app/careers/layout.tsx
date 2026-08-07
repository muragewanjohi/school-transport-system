import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Careers at OnTheBus are coming soon. Share your specialization and interest with our team.",
};

export default function CareersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
