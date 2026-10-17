export const metadata = { title: "Plataforma de reclutamiento" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO">
      <body>{children}</body>
    </html>
  );
}
