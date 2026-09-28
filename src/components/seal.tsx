import Image from "next/image";
import { siteConfig } from "@/config/site";

interface SealProps {
  className?: string;
}

export function Seal({ className }: SealProps) {
  return (
    <Image
      src="/seal.webp"
      alt={`${siteConfig.county} ${siteConfig.name} seal`}
      width={877}
      height={1000}
      className={className}
    />
  );
}
