import { useEffect, useRef, useState } from "react";

type Conn = "offline" | "connecting" | "online";
let cachedConnection: Conn = "connecting";

const TEXT: Record<Conn, string> = {
  offline: "Offline",
  connecting: "Menyambungkan",
  online: "Tersambung",
};

/** Indikator kecil di navigasi atas: internet putus / menyambung ke server / tersambung. */
export function ConnectionStatus({ reconnecting = false }: { reconnecting?: boolean }) {
  const [conn, updateConn] = useState<Conn>(cachedConnection);
  const setConn = (value: Conn | ((previous: Conn) => Conn)) => {
    cachedConnection = typeof value === "function" ? value(cachedConnection) : value;
    updateConn(cachedConnection);
  };
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (busy.current) return;
      if (!navigator.onLine) {
        setConn("offline");
        return;
      }
      busy.current = true;
      setConn((c) => (c === "online" ? c : "connecting"));
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (alive) setConn(res.ok ? "online" : "connecting");
      } catch {
        if (alive) setConn(navigator.onLine ? "connecting" : "offline");
      } finally {
        busy.current = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 20_000);
    const onOffline = () => setConn("offline");
    const onOnline = () => {
      setConn("connecting");
      void check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const shown: Conn = conn === "online" && reconnecting ? "connecting" : conn;
  const dot =
    shown === "online" ? "bg-success" : shown === "offline" ? "bg-destructive" : "bg-warning animate-pulse";
  const ring = shown === "online" ? "border-success/40 text-success" : shown === "offline" ? "border-destructive/50 text-destructive" : "border-warning/40 text-warning";

  return (
    <span
      role="status"
      aria-live="polite"
      title={shown === "online" ? "Tersambung ke server WenGPT" : shown === "offline" ? "Internet terputus" : "Menyambungkan ke server WenGPT"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 text-[10px] font-medium transition-colors ${ring}`}
    >
      <span className="relative grid size-2 place-items-center">
        {shown === "online" && <span className="absolute inset-0 animate-ping rounded-full bg-success/50 [animation-duration:2.5s]" />}
        <span className={`relative size-2 rounded-full ${dot}`} />
      </span>
      {TEXT[shown]}
    </span>
  );
}
