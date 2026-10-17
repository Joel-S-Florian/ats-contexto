"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { api, type Me } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

const AuthContext = createContext<{ me: Me; logout: () => Promise<void> } | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AppShell");
  return ctx;
};

const PUBLIC_PATHS = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(path);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecked(true));
  }, [path]);

  useEffect(() => {
    if (checked && !me && !isPublic) router.replace("/login");
    if (checked && me && isPublic) router.replace("/");
  }, [checked, me, isPublic, router]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setMe(null);
    router.replace("/login");
  };

  const toaster = (
    <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: "inherit" } }} />
  );

  if (isPublic)
    return (
      <>
        {children}
        {toaster}
      </>
    );
  if (!me)
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="skeleton h-10 w-48" />
      </div>
    );

  return (
    <AuthContext value={{ me, logout }}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      </div>
      {toaster}
    </AuthContext>
  );
}
