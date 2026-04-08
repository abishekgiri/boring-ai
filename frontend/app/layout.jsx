import "./globals.css";

export const metadata = {
  title: "boring-ai",
  description: "Self-hosted AI back office for freelancers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

