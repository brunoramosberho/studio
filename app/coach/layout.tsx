import type { Metadata } from "next";
import { CoachLayoutClient } from "./coach-layout-client";

export const metadata: Metadata = {
  manifest: "/api/manifest?portal=coach",
};

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <CoachLayoutClient>{children}</CoachLayoutClient>;
}
