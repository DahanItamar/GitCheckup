import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // `/trending` ranked by absolute score, so it could only ever list the
        // same enormous repositories. `/improved` ranks by movement instead —
        // a different question, and a name that stops people expecting a
        // popularity contest. Permanent, because the old path is in the
        // metadata of anything already shared.
        source: "/trending",
        destination: "/improved",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
