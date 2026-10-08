/**
 * The interactive extension ships as its own bundle with no value imports from
 * core, so it carries its own copy of this rather than using `shared/dom`.
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
