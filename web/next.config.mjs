/** @type {import('next').NextConfig} */
export default {
  experimental: {
    // lets us import the shared rank/assess logic from ../mcp/src
    externalDir: true,
  },
  // Next 15 miskeys the client-reference manifest for an App Router segment
  // literally named `index` in production. Keep the public URL while routing
  // it to a non-reserved internal segment.
  async rewrites() {
    return [{ source: '/index', destination: '/evidence' }];
  },
};
