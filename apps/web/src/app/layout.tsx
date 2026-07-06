import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "Be Connected — K-Home Smart",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
