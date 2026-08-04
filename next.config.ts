import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["mupdf", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/orders/click-collect/scan": [
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
      "./node_modules/tesseract.js/src/worker-script/**/*",
      "./node_modules/tesseract.js-core/**/*"
    ]
  }
};

export default nextConfig;
