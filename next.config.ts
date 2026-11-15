import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Database drivers run as plain Node modules (PGlite ships a WebAssembly build of PostgreSQL).
  // pdf.js and Tesseract (local text extraction / OCR before masking) also load workers and WebAssembly at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfjs-dist", "tesseract.js"],
  // Files that are loaded by path at runtime (pdf.js worker, Tesseract worker script, helpers and WebAssembly core)
  // are not found by static tracing; include them explicitly so serverless hosts (Vercel) ship them.
  outputFileTracingIncludes: {
    "/api/extract": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/bmp-js/**",
      "./node_modules/idb-keyval/**",
      "./node_modules/is-url/**",
      "./node_modules/node-fetch/**",
      "./node_modules/whatwg-url/**",
      "./node_modules/tr46/**",
      "./node_modules/webidl-conversions/**",
      "./node_modules/regenerator-runtime/**",
      "./node_modules/wasm-feature-detect/**",
      "./node_modules/zlibjs/**",
    ],
  },
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
