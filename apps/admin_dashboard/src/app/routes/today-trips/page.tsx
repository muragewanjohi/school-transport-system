import { redirect } from "next/navigation";

export default function LegacyTodayTripsPage() {
  redirect("/trips/override");
}
