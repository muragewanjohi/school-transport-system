"use client";

import { use } from "react";
import StopEditorForm from "@/components/StopEditorForm";

export default function EditStopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <StopEditorForm mode="edit" stopId={id} />;
}
