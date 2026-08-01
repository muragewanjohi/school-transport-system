"use client";

import { useParams } from "next/navigation";
import SchoolForm from "@/components/SchoolForm";

export default function EditSchoolPage() {
  const params = useParams<{ id: string }>();
  return <SchoolForm mode="edit" schoolId={params.id} />;
}
