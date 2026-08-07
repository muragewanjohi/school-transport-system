import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact the OnTheBus team about school transport tracking, demos, and partnerships.",
};

export default function ContactLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
