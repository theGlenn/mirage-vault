import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const watchMode = process.argv.includes("--watch");

const commonOptions = {
  absWorkingDir: rootDir,
  bundle: true,
  sourcemap: true,
  target: ["chrome114"],
  platform: "browser",
  format: "iife",
  outdir: distDir,
  entryNames: "[name]",
  logLevel: "info"
};

const buildOptions = {
  ...commonOptions,
  entryPoints: {
    background: "src/background/background.ts",
    content: "src/content/content.ts",
    mistralBridge: "src/content/mistralBridge.ts",
    popup: "src/popup/popup.ts"
  }
};

async function copyStatics() {
  await mkdir(distDir, { recursive: true });
  await mkdir(path.join(distDir, "fonts"), { recursive: true });
  await Promise.all([
    cp(path.join(rootDir, "src", "manifest.json"), path.join(distDir, "manifest.json")),
    cp(path.join(rootDir, "src", "popup", "popup.html"), path.join(distDir, "popup.html")),
    cp(path.join(rootDir, "src", "popup", "popup.css"), path.join(distDir, "popup.css")),
    cp(path.join(rootDir, "src", "fonts"), path.join(distDir, "fonts"), { recursive: true })
  ]);
}

async function clean() {
  await rm(distDir, { recursive: true, force: true });
}

async function runBuild() {
  await clean();
  await copyStatics();
  await build(buildOptions);
}

async function runWatch() {
  await clean();
  await copyStatics();
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("[mirage-shroud] Watching for changes...");
}

if (watchMode) {
  runWatch().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  runBuild().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
