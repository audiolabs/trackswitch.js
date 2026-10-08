import schemaSource from "../../docs/schema/trackswitch.schema.json?raw";
import { BuilderApp } from "./app";
import type { JsonSchema } from "./schema";

function startBuilder(): void {
	const root = document.querySelector<HTMLElement>("#ts-builder-root");
	if (!root) return;
	const playerScript = root.dataset.playerScript;
	const license = root.dataset.license;
	const thirdPartyNotices = root.dataset.thirdPartyNotices;
	const alignmentWorkerUrl = root.dataset.alignmentWorkerUrl;
	if (!playerScript || !license || !thirdPartyNotices || !alignmentWorkerUrl) {
		throw new Error("Builder export asset URLs are missing.");
	}
	new BuilderApp(root, JSON.parse(schemaSource) as JsonSchema, {
		playerScript,
		license,
		thirdPartyNotices,
		alignmentWorkerUrl,
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", startBuilder, { once: true });
} else {
	startBuilder();
}
