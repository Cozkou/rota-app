import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accessorize Rota Application",
  description: "View rotas here!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
