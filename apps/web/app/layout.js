import './globals.css';

export const metadata = {
  title: 'CROPSY',
  description: 'CROPSY web application foundation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
