import { useEffect, useState, type CSSProperties } from "react";

/** Pins a full-screen layout to the visible area so the mobile keyboard never pushes the top bar away. */
export function useViewportBox(): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties>();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setBox({ height: `${vv.height}px`, transform: `translateY(${vv.offsetTop}px)` });
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}
