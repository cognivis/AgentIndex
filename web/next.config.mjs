/** @type {import('next').NextConfig} */
export default {
  experimental: {
    // lets us import the shared rank/assess logic from ../mcp/src
    externalDir: true,
  },
};
