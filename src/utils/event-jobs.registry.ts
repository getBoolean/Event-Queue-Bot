import type { Job } from "node-schedule";

export interface OccurrenceJobs {
	open?: Job;
	lock?: Job;
	cleanup?: Job;
	roomPings: Map<bigint, Job>;
	roomPulls: Map<bigint, Job>;
}

export const occurrenceIdToJobs = new Map<bigint, OccurrenceJobs>();

export function unregisterJobs(occurrenceId: bigint) {
	const jobs = occurrenceIdToJobs.get(occurrenceId);
	if (!jobs) return;
	jobs.open?.cancel();
	jobs.lock?.cancel();
	jobs.cleanup?.cancel();
	jobs.roomPings.forEach(job => job.cancel());
	jobs.roomPulls.forEach(job => job.cancel());
	occurrenceIdToJobs.delete(occurrenceId);
}
