import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Database drivers run as plain Node modules (PGlite ships a WebAssembly build of PostgreSQL).
  // pdf.js and Tesseract (local text extraction / OCR before masking) also load workers and WebAssembly at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfjs-dist", "tesseract.js"],
  async redirects() {
    // Azerbaijani is the default interface language.
    return [{ source: "/", destination: "/az", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
