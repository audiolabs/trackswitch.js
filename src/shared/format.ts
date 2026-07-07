export function formatSecondsToHHMMSSmmm(seconds: number): string {
	const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
	const totalSeconds = Math.floor(totalMilliseconds / 1000);
	const h = Math.floor(totalSeconds / 3600) % 24;
	const m = Math.floor(totalSeconds / 60) % 60;
	const sec = totalSeconds % 60;
	const mil = totalMilliseconds % 1000;

	const hh = h < 10 ? `0${h}` : String(h);
	const mm = m < 10 ? `0${m}` : String(m);
	const ss = sec < 10 ? `0${sec}` : String(sec);
	const mmm = mil < 10 ? `00${mil}` : mil < 100 ? `0${mil}` : String(mil);

	return `${hh}:${mm}:${ss}:${mmm}`;
}

export function formatBytesToHumanReadable(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return "0 B";
	}

	if (bytes < 1024) {
		return `${Math.round(bytes)} B`;
	}

	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
	return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
