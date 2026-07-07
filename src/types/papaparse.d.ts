declare module "papaparse" {
	export interface ParseConfig {
		header?: boolean;
		dynamicTyping?: boolean;
		delimiter?: string;
		skipEmptyLines?: boolean | "greedy";
		transformHeader?: (header: string, index: number) => string;
	}

	export interface ParseError {
		type?: string;
		code?: string;
		message: string;
		row?: number;
	}

	export interface ParseResult<T> {
		data: T[];
		errors: ParseError[];
		meta: {
			fields?: string[];
		};
	}

	export interface PapaStatic {
		parse<T = string[]>(input: string, config?: ParseConfig): ParseResult<T>;
	}

	const Papa: PapaStatic;
	export default Papa;
}
