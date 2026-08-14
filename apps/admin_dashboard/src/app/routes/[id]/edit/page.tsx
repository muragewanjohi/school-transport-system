"use client";

import { use } from "react";
import RouteEditorForm from "@/components/RouteEditorForm";

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RouteEditorForm mode="edit" routeId={id} />;
}
