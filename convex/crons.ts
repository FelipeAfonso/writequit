import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Purge notifications older than 30 days, once per day at midnight UTC.
crons.daily(
	'cleanup old notifications',
	{ hourUTC: 0, minuteUTC: 0 },
	internal.notifications.cleanup
);

export default crons;
