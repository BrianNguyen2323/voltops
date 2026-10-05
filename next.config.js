import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // standalone needs symlink rights on Windows; the Dockerfile sets STANDALONE=1
  output: process.env.STANDALONE ? "standalone" : undefined,
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
};

export default config;
