"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";

export function SafeImage({ src, alt, width, height, className, style }: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const [hide, setHide] = useState(false);
  useEffect(() => { setUseFallback(false); setHide(false); }, [src]);
  if (hide) return null;
  return <Image src={useFallback ? "/seal-optimized.webp" : src} alt={alt} width={width} height={height} unoptimized className={className} style={style} onError={() => {
    if (useFallback) setHide(true);
    else setUseFallback(true);
  }} />;
}
