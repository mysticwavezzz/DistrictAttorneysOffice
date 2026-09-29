"use client";

import { useEffect, useRef, useState } from "react";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./site-header";

const SCROLL_STEP = 160;

export function NavTabsScroller({ items }: { items: readonly NavItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateEdges() {
      setCanScrollLeft(el!.scrollLeft > 1);
      setCanScrollRight(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 1);
    }

    function onWheel(e: WheelEvent) {
      if (el!.scrollWidth <= el!.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el!.scrollLeft += e.deltaY;
      e.preventDefault();
    }

    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateEdges);
      el.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
    };
  }, [items]);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="nav-tabs-wrap">
      <button
        type="button"
        className="nav-scroll-btn"
        aria-label="Scroll tabs left"
        disabled={!canScrollLeft}
        onClick={() => scrollBy(-SCROLL_STEP)}
      >
        &#8249;
      </button>
      <div className="nav-tabs" ref={scrollerRef}>
        <NavLinks items={items} />
      </div>
      <button
        type="button"
        className="nav-scroll-btn"
        aria-label="Scroll tabs right"
        disabled={!canScrollRight}
        onClick={() => scrollBy(SCROLL_STEP)}
      >
        &#8250;
      </button>
    </div>
  );
}
