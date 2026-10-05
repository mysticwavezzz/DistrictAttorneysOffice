import type { Metadata } from "next";
import { shareMetadata } from "@/lib/share-metadata";

export function staffPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    ...shareMetadata(title, description, path),
    robots: { index: false, follow: false },
  };
}
