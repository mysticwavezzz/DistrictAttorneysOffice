"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: `#${string}` };

export function CaseSectionLink({ href, onClick, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(href.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
    onClick?.(event);
  };

  return <a href={href} onClick={handleClick} {...props} />;
}
