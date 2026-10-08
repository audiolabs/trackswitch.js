import Papa from "papaparse";

export interface ParsedCsvRecords {
	headers: string[];
	rows: Record<string, unknown>[];
}

interface ParseCsvRecordsOptions {
	emptyDataError: string;
	/** Accepts a file that holds a header row and nothing else. */
	allowNoRows?: boolean;
	transformHeader?(header: string): string;
}

export function parseCsvRecords(
	csvText: string,
	options: ParseCsvRecordsOptions,
): ParsedCsvRecords {
	const normalizedText = String(csvText || "").replace(/^\uFEFF/, "");
	const parsed = Papa.parse<Record<string, unknown>>(normalizedText, {
		header: true,
		dynamicTyping: true,
		skipEmptyLines: "greedy",
		transformHeader: options.transformHeader,
	});

	// A single-column file has no delimiter to detect; Papa still parses it
	// correctly and only notes that it fell back to the default. Not fatal.
	const fatalErrors = parsed.errors.filter(
		(error) => error.code !== "UndetectableDelimiter",
	);
	if (fatalErrors.length > 0) {
		throw new Error(formatPapaErrors(fatalErrors));
	}

	const headers = Array.isArray(parsed.meta.fields)
		? parsed.meta.fields
				.map((field) => String(field ?? "").trim())
				.filter((field) => field.length > 0)
		: [];

	if (
		headers.length === 0 ||
		(parsed.data.length === 0 && !options.allowNoRows)
	) {
		throw new Error(options.emptyDataError);
	}

	return {
		headers: headers,
		rows: parsed.data,
	};
}

export function formatCsvRecords(
	headers: readonly string[],
	rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
): string {
	return Papa.unparse(
		{
			fields: [...headers],
			data: rows.map((row) => headers.map((header) => row[header] ?? "")),
		},
		{ newline: "\n" },
	);
}

function formatPapaErrors(
	errors: Array<{ message: string; row?: number }>,
): string {
	return errors
		.map((error) => {
			const rowSuffix =
				typeof error.row === "number" ? ` (row ${error.row})` : "";
			return error.message + rowSuffix;
		})
		.join("; ");
}
