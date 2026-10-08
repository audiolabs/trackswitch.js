import type { TrackSwitchInit } from "../types";
import {
	type BuilderProject,
	type BuilderView,
	buildPlayerConfig,
} from "./model";

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export type StructuralValidator = (config: TrackSwitchInit) => unknown;

export function validateBuilderProject(
	project: BuilderProject,
	validateStructure?: StructuralValidator,
): string[] {
	const errors: string[] = [];
	if (
		!Object.values(project.media).some((media) => media.config.type === "audio")
	) {
		errors.push("Add at least one audio file.");
	}

	for (const resource of Object.values(project.resources)) {
		if (resource.csvError) {
			errors.push(`${resource.file.name}: ${resource.csvError}`);
		}
	}

	const validateColumns = (
		resourceId: string,
		columns: string[],
		label: string,
	) => {
		const resource = project.resources[resourceId];
		if (!resource) {
			errors.push(`${label} source file is missing.`);
			return;
		}
		if (resource.kind !== "csv") {
			errors.push(`${label} source must be a CSV file.`);
			return;
		}
		for (const column of columns.filter(Boolean)) {
			if (!resource.csvHeaders?.includes(column)) {
				errors.push(`${label} references missing CSV column "${column}".`);
			}
		}
	};

	if (project.alignment) {
		validateColumns(
			project.alignment.resourceId,
			Object.values(project.alignment.config.timelines),
			"Alignment",
		);
	}
	for (const [id, marker] of Object.entries(project.markers)) {
		validateColumns(
			marker.resourceId,
			[marker.config.timeCol, marker.config.labelCol ?? ""],
			`Marker ${id}`,
		);
	}

	if (validateStructure) {
		try {
			validateStructure(buildPlayerConfig(project, "preview"));
		} catch (error) {
			errors.push(describeError(error));
		}
	}
	return Array.from(new Set(errors));
}

export function appendViewIfValid(
	project: BuilderProject,
	view: BuilderView,
	validateStructure?: StructuralValidator,
): { added: boolean; errors: string[] } {
	project.views.push(view);
	const errors = validateBuilderProject(project, validateStructure);
	if (errors.length === 0) return { added: true, errors };
	const index = project.views.findIndex((entry) => entry.id === view.id);
	if (index >= 0) project.views.splice(index, 1);
	return { added: false, errors };
}
