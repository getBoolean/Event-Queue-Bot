import moment from "moment-timezone";

import { CustomError } from "./error.utils.ts";

const START_TIME_REGEX = /^(1[0-2]|[1-9])(:[0-5][0-9])? ?(AM|PM)$/i;

export namespace DateUtils {
	export function parseScheduledStart(args: {
		yearStr: string;
		monthStr: string;
		dayStr: string;
		startTime: string;
		timezone: string;
	}) {
		const year = Number(args.yearStr);
		const month = Number(args.monthStr);
		const day = Number(args.dayStr);
		if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
			throw new CustomError({ message: "Year, month, and day must be whole numbers. Pick a value from the autocomplete list." });
		}

		const match = START_TIME_REGEX.exec(args.startTime);
		if (!match) {
			throw new CustomError({
				message: "Invalid start time. Use a 12-hour value like `9 AM`, `9AM`, `9:00 AM`, or `9:30 PM`.",
			});
		}
		const hour = match[1];
		const minutes = (match[2] ?? ":00").slice(1);
		const meridiem = match[3].toUpperCase();
		const normalizedTime = `${hour}:${minutes} ${meridiem}`;

		const parsed = moment.tz(`${year}-${month}-${day} ${normalizedTime}`, "YYYY-M-D h:mm A", args.timezone);
		if (!parsed.isValid()) {
			throw new CustomError({ message: `Invalid date/time for ${year}-${month}-${day} ${normalizedTime} in ${args.timezone}.` });
		}

		return parsed;
	}
}
