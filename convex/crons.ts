import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// A delivery that died mid-flight (action crashed, deploy restarted it, fetch never settled)
// leaves its email "queued" with nothing scheduled. This turns that into a failed attempt.
crons.interval("sweep stuck emails", { minutes: 5 }, internal.automation.sweepStuck, {});

export default crons;
