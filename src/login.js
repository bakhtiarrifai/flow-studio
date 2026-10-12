#!/usr/bin/env node
// One-time setup: opens Flow in the tool's own browser profile so you can sign in to Google by hand.
import { findBrowser, getFlowPage } from "./browser.js";
import { PROFILE_DIR } from "./config.js";

console.log(`Browser: ${findBrowser()}`);
const page = await getFlowPage();
await page.bringToFront();
console.log(`Open on: ${page.url()}`);
console.log(`Profile: ${PROFILE_DIR}`);
console.log("Sign in to Google in that window, then open or create a Flow project and leave the window open.");
console.log("This tool never sees or types your password; it only uses the signed-in session afterwards.");
process.exit(0);
