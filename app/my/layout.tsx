import type { Metadata } from "next";
import { MyLayoutClient } from "./my-layout-client";

export const metadata: Metadata = {
  manifest: "/api/manifest?portal=my",
};

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return <MyLayoutClient>{children}</MyLayoutClient>;
}
