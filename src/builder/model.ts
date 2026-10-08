import type {
	AlignmentConfig,
	MarkerSequenceSourceConfig,
	MediaEntryConfig,
	PresetsConfig,
	TrackSwitchCssOverrides,
	TrackSwitchFeatures,
	TrackSwitchInit,
	TrackSwitchViewConfig,
} from "../types";

export const MAX_PROJECT_BYTES = 500 * 1024 * 1024;
export const CONFIG_SCHEMA_URL =
	"https://audiolabs.github.io/trackswitch.js/schema/trackswitch.schema.json";

export type BuilderResourceKind =
	| "audio"
	| "midi"
	| "musicxml"
	| "image"
	| "csv";
export type ConfigSourceMode = "preview" | "export";

export interface BuilderResource {
	id: string;
	kind: BuilderResourceKind;
	file: File;
	previewUrl: string;
	exportPath: string;
	csvHeaders?: string[];
	csvError?: string;
}

export interface BuilderMedia {
	resourceId: string;
	config: MediaEntryConfig;
	synchronizedResourceId?: string;
}

export interface BuilderView {
	id: string;
	config: TrackSwitchViewConfig;
}

export interface BuilderAlignment {
	resourceId: string;
	config: Omit<AlignmentConfig, "src">;
}

export interface BuilderMarker {
	resourceId: string;
	config: Omit<MarkerSequenceSourceConfig, "src">;
}

export interface BuilderProject {
	resources: Record<string, BuilderResource>;
	media: Record<string, BuilderMedia>;
	views: BuilderView[];
	alignment?: BuilderAlignment;
	markers: Record<string, BuilderMarker>;
	presets: PresetsConfig;
	features: Partial<TrackSwitchFeatures>;
	css?: TrackSwitchCssOverrides;
}

export interface AddFilesResult {
	added: BuilderResource[];
	errors: string[];
}

const AUDIO_EXTENSIONS = new Set([
	"aac",
	"aif",
	"aiff",
	"au",
	"flac",
	"m4a",
	"mp1",
	"mp2",
	"mp3",
	"mp4",
	"mpeg",
	"mpg",
	"oga",
	"ogg",
	"wav",
	"webm",
]);
const IMAGE_EXTENSIONS = new Set([
	"avif",
	"gif",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
]);

export function classifyFileName(name: string): BuilderResourceKind | null {
	const extension = name.toLowerCase().split(".").pop() ?? "";
	if (AUDIO_EXTENSIONS.has(extension)) return "audio";
	if (extension === "mid" || extension === "midi") return "midi";
	if (extension === "xml" || extension === "musicxml") return "musicxml";
	if (IMAGE_EXTENSIONS.has(extension)) return "image";
	if (extension === "csv") return "csv";
	return null;
}

function baseName(name: string): string {
	const extensionIndex = name.lastIndexOf(".");
	return extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
}

export function slugifyId(value: string): string {
	const slug = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "resource";
}

function uniqueValue(base: string, used: ReadonlySet<string>): string {
	if (!used.has(base)) return base;
	let suffix = 2;
	while (used.has(`${base}-${String(suffix)}`)) suffix += 1;
	return `${base}-${String(suffix)}`;
}

function hasOwn(target: object, key: PropertyKey): boolean {
	return Object.keys(target).includes(String(key));
}

function sanitizeFileName(name: string): string {
	const dot = name.lastIndexOf(".");
	const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
	const cleanBase = baseName(name)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${cleanBase || "resource"}${extension}`;
}

function humanTitle(name: string): string {
	return baseName(name).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function createBuilderProject(): BuilderProject {
	return {
		resources: {},
		media: {},
		views: [],
		markers: {},
		presets: {},
		features: {},
	};
}

function nextViewId(project: BuilderProject, type: string): string {
	return uniqueValue(type, new Set(project.views.map((view) => view.id)));
}

function addViewBeforeTrackList(
	project: BuilderProject,
	config: TrackSwitchViewConfig,
): void {
	const view = { id: nextViewId(project, config.type), config };
	const trackListIndex = project.views.findIndex(
		(entry) => entry.config.type === "trackList",
	);
	if (trackListIndex < 0) project.views.push(view);
	else project.views.splice(trackListIndex, 0, view);
}

function addMediaDefaults(
	project: BuilderProject,
	resource: BuilderResource,
	mediaId: string,
): void {
	if (resource.kind === "audio") {
		project.media[mediaId] = {
			resourceId: resource.id,
			config: {
				type: "audio",
				src: resource.exportPath,
				title: humanTitle(resource.file.name) || mediaId,
			},
		};
		const trackList = project.views.find(
			(view) => view.config.type === "trackList",
		);
		if (trackList?.config.type === "trackList") {
			trackList.config.tracks.push(mediaId);
			return;
		}
		project.views.push(
			{
				id: nextViewId(project, "navigationBar"),
				config: {
					type: "navigationBar",
					controls: [
						"playback",
						"globalVolume",
						"looping",
						"timer",
						"seekBar",
						"fullscreen-control",
					],
				},
			},
			{
				id: nextViewId(project, "waveform"),
				config: { type: "waveform", tracks: "audible" },
			},
			{
				id: nextViewId(project, "trackList"),
				config: {
					type: "trackList",
					tracks: [mediaId],
					trackVolumeControls: true,
				},
			},
		);
		return;
	}

	const mediaKind = resource.kind;
	if (mediaKind === "csv") return;
	const config: MediaEntryConfig = {
		type: mediaKind,
		src: resource.exportPath,
	};
	project.media[mediaId] = { resourceId: resource.id, config };
	if (resource.kind === "midi") {
		addViewBeforeTrackList(project, {
			type: "pianoRoll",
			mediaID: mediaId,
			pianoKeyboard: true,
		});
	} else if (resource.kind === "musicxml") {
		addViewBeforeTrackList(project, { type: "sheetMusic", mediaID: mediaId });
	} else if (resource.kind === "image") {
		addViewBeforeTrackList(project, {
			type: "image",
			mediaID: mediaId,
		});
	}
}

export function addFilesToProject(
	project: BuilderProject,
	files: readonly File[],
	createObjectUrl: (
		resource: Pick<BuilderResource, "id" | "file" | "kind">,
	) => string = (resource) => URL.createObjectURL(resource.file),
	createMediaBindings = true,
): AddFilesResult {
	const added: BuilderResource[] = [];
	const errors: string[] = [];
	let totalBytes = Object.values(project.resources).reduce(
		(total, resource) => total + resource.file.size,
		0,
	);

	for (const file of files) {
		const kind = classifyFileName(file.name);
		if (!kind) {
			errors.push(`${file.name}: unsupported file type.`);
			continue;
		}
		if (totalBytes + file.size > MAX_PROJECT_BYTES) {
			errors.push(`${file.name}: the project would exceed the 500 MB limit.`);
			continue;
		}

		const mediaIds = new Set(Object.keys(project.media));
		const resourceIds = new Set(Object.keys(project.resources));
		const id = uniqueValue(slugifyId(baseName(file.name)), resourceIds);
		const folder = kind === "csv" ? "data" : "media";
		const usedPaths = new Set(
			Object.values(project.resources).map((resource) => resource.exportPath),
		);
		const cleanFileName = sanitizeFileName(file.name);
		const dot = cleanFileName.lastIndexOf(".");
		const pathBase = dot >= 0 ? cleanFileName.slice(0, dot) : cleanFileName;
		const extension = dot >= 0 ? cleanFileName.slice(dot) : "";
		let exportPath = `${folder}/${cleanFileName}`;
		let suffix = 2;
		while (usedPaths.has(exportPath)) {
			exportPath = `${folder}/${pathBase}-${String(suffix)}${extension}`;
			suffix += 1;
		}

		const resourceBase = { id, file, kind };
		const resource: BuilderResource = {
			...resourceBase,
			previewUrl: createObjectUrl(resourceBase),
			exportPath,
		};
		project.resources[id] = resource;
		added.push(resource);
		totalBytes += file.size;

		if (kind !== "csv" && createMediaBindings) {
			const mediaId = uniqueValue(slugifyId(baseName(file.name)), mediaIds);
			addMediaDefaults(project, resource, mediaId);
		}
	}

	return { added, errors };
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function sourceFor(
	project: BuilderProject,
	resourceId: string,
	mode: ConfigSourceMode,
): string {
	const resource = project.resources[resourceId];
	if (!resource) return "";
	return mode === "preview" ? resource.previewUrl : resource.exportPath;
}

function omitUndefined(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(omitUndefined);
	if (!value || typeof value !== "object") return value;
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child !== undefined) result[key] = omitUndefined(child);
	}
	return result;
}

export function buildPlayerConfig(
	project: BuilderProject,
	mode: ConfigSourceMode,
): TrackSwitchInit {
	const media: TrackSwitchInit["media"] = {};
	for (const [mediaId, binding] of Object.entries(project.media)) {
		const config = clone(binding.config);
		config.src = sourceFor(project, binding.resourceId, mode);
		if (config.type === "audio" && config.srcTimeScaled) {
			config.srcTimeScaled.src = binding.synchronizedResourceId
				? sourceFor(project, binding.synchronizedResourceId, mode)
				: config.srcTimeScaled.src;
		}
		media[mediaId] = config;
	}
	const config: TrackSwitchInit = {
		$schema: CONFIG_SCHEMA_URL,
		media,
		views: project.views.map((view) => clone(view.config)),
	};
	if (project.alignment) {
		config.alignment = {
			...clone(project.alignment.config),
			src: sourceFor(project, project.alignment.resourceId, mode),
		};
	}
	if (Object.keys(project.markers).length > 0) {
		config.markers = {};
		for (const [id, marker] of Object.entries(project.markers)) {
			config.markers[id] = {
				...clone(marker.config),
				src: sourceFor(project, marker.resourceId, mode),
			};
		}
	}
	if (Object.keys(project.presets).length > 0)
		config.presets = clone(project.presets);
	if (Object.keys(project.features).length > 0)
		config.features = clone(project.features);
	if (project.css && Object.keys(project.css).length > 0)
		config.css = clone(project.css);
	return omitUndefined(config) as TrackSwitchInit;
}

export function buildRuntimePreviewConfig(
	project: BuilderProject,
): TrackSwitchInit {
	const config = buildPlayerConfig(project, "preview");
	return {
		...config,
		features: { ...config.features, autoload: true },
	};
}

function replaceInTracks(tracks: string[], oldId: string, newId: string): void {
	for (let index = 0; index < tracks.length; index += 1) {
		if (tracks[index] === oldId) tracks[index] = newId;
	}
}

export function renameMediaId(
	project: BuilderProject,
	oldId: string,
	requestedId: string,
): string {
	const binding = project.media[oldId];
	if (!binding) throw new Error(`Unknown media ID: ${oldId}`);
	const newId = slugifyId(requestedId);
	if (newId !== oldId && project.media[newId]) {
		throw new Error(`Media ID already exists: ${newId}`);
	}
	if (newId === oldId) return oldId;
	delete project.media[oldId];
	project.media[newId] = binding;

	for (const media of Object.values(project.media)) {
		if (media.config.type === "audio" && media.config.imageID === oldId) {
			media.config.imageID = newId;
		}
	}
	if (project.alignment) {
		if (project.alignment.config.referenceTimeline === oldId) {
			project.alignment.config.referenceTimeline = newId;
		}
		if (hasOwn(project.alignment.config.timelines, oldId)) {
			project.alignment.config.timelines[newId] =
				project.alignment.config.timelines[oldId];
			delete project.alignment.config.timelines[oldId];
		}
	}
	for (const marker of Object.values(project.markers)) {
		if (marker.config.timeline === oldId) marker.config.timeline = newId;
	}
	for (const preset of Object.values(project.presets)) {
		replaceInTracks(preset.tracks, oldId, newId);
	}
	for (const view of project.views) {
		const config = view.config;
		if (
			(config.type === "image" ||
				config.type === "pianoRoll" ||
				config.type === "sheetMusic") &&
			config.mediaID === oldId
		) {
			config.mediaID = newId;
		}
		if (config.type === "waveform" && Array.isArray(config.tracks)) {
			replaceInTracks(config.tracks, oldId, newId);
		}
		if (config.type === "trackList")
			replaceInTracks(config.tracks, oldId, newId);
		if (config.type === "warpingMatrix") {
			if (config.x === oldId) config.x = newId;
			if (config.y === oldId) config.y = newId;
		}
		if (config.type === "pianoRoll" && config.channelToTrackIDMap) {
			for (const [channel, value] of Object.entries(
				config.channelToTrackIDMap,
			)) {
				if (Array.isArray(value)) replaceInTracks(value, oldId, newId);
				else if (value === oldId) config.channelToTrackIDMap[channel] = newId;
			}
		}
	}
	return newId;
}

function firstMediaIdOfType(
	project: BuilderProject,
	type: MediaEntryConfig["type"],
	exclude: ReadonlySet<string>,
): string | undefined {
	return Object.entries(project.media).find(
		([id, media]) => media.config.type === type && !exclude.has(id),
	)?.[0];
}

/**
 * Drops every reference to `mediaId` before it's deleted, instead of blocking
 * the deletion: a reference that can fall back to another matching media
 * entry does so (e.g. a warpingMatrix track, or an image view's mediaID),
 * and one that can't (the last audio track of a trackList, the last entry of
 * a preset) is removed along with whatever solely depended on it.
 */
export function detachMedia(project: BuilderProject, mediaId: string): void {
	for (const media of Object.values(project.media)) {
		if (media.config.type === "audio" && media.config.imageID === mediaId) {
			delete media.config.imageID;
		}
	}

	if (project.alignment) {
		if (hasOwn(project.alignment.config.timelines, mediaId)) {
			delete project.alignment.config.timelines[mediaId];
		}
		const remaining = Object.keys(project.alignment.config.timelines);
		if (remaining.length === 0) {
			project.alignment = undefined;
		} else if (project.alignment.config.referenceTimeline === mediaId) {
			project.alignment.config.referenceTimeline = remaining[0];
		}
	}

	for (const marker of Object.values(project.markers)) {
		if (marker.config.timeline !== mediaId) continue;
		if (project.alignment) {
			marker.config.timeline = project.alignment.config.referenceTimeline;
		} else {
			delete marker.config.timeline;
		}
	}

	for (const [id, preset] of Object.entries(project.presets)) {
		if (!preset.tracks.includes(mediaId)) continue;
		preset.tracks = preset.tracks.filter((track) => track !== mediaId);
		if (preset.tracks.length === 0) delete project.presets[id];
	}

	const exclude = new Set([mediaId]);
	const removedViewIds = new Set<string>();
	for (const view of project.views) {
		const config = view.config;
		if (
			(config.type === "image" ||
				config.type === "pianoRoll" ||
				config.type === "sheetMusic") &&
			config.mediaID === mediaId
		) {
			const wanted =
				config.type === "image"
					? "image"
					: config.type === "pianoRoll"
						? "midi"
						: "musicxml";
			const fallback = firstMediaIdOfType(project, wanted, exclude);
			if (fallback) config.mediaID = fallback;
			else removedViewIds.add(view.id);
		}
		if (config.type === "waveform" && Array.isArray(config.tracks)) {
			if (config.tracks.includes(mediaId)) {
				const remaining = config.tracks.filter((track) => track !== mediaId);
				config.tracks = remaining.length ? remaining : "audible";
			}
		}
		if (config.type === "trackList" && config.tracks.includes(mediaId)) {
			config.tracks = config.tracks.filter((track) => track !== mediaId);
			if (config.tracks.length === 0) removedViewIds.add(view.id);
		}
		if (
			config.type === "warpingMatrix" &&
			(config.x === mediaId || config.y === mediaId)
		) {
			const other = config.x === mediaId ? config.y : config.x;
			const fallback = firstMediaIdOfType(
				project,
				"audio",
				new Set([mediaId, other]),
			);
			if (!fallback) removedViewIds.add(view.id);
			else if (config.x === mediaId) config.x = fallback;
			else config.y = fallback;
		}
		if (config.type === "pianoRoll" && config.channelToTrackIDMap) {
			for (const [channel, value] of Object.entries(
				config.channelToTrackIDMap,
			)) {
				if (Array.isArray(value)) {
					const next = value.filter((track) => track !== mediaId);
					if (next.length === 0) delete config.channelToTrackIDMap[channel];
					else config.channelToTrackIDMap[channel] = next;
				} else if (value === mediaId) {
					delete config.channelToTrackIDMap[channel];
				}
			}
		}
	}
	if (removedViewIds.size) {
		project.views = project.views.filter(
			(view) => !removedViewIds.has(view.id),
		);
	}
}

export function renameMarkerId(
	project: BuilderProject,
	oldId: string,
	requestedId: string,
): string {
	const marker = project.markers[oldId];
	if (!marker) throw new Error(`Unknown marker ID: ${oldId}`);
	const newId = slugifyId(requestedId);
	if (newId !== oldId && project.markers[newId]) {
		throw new Error(`Marker ID already exists: ${newId}`);
	}
	delete project.markers[oldId];
	project.markers[newId] = marker;
	for (const view of project.views) {
		if ("markerLayers" in view.config && view.config.markerLayers) {
			for (const layer of view.config.markerLayers) {
				if (layer.sequence === oldId) layer.sequence = newId;
			}
		}
	}
	return newId;
}

export function findMarkerReferences(
	project: BuilderProject,
	markerId: string,
): string[] {
	return project.views
		.filter(
			(view) =>
				"markerLayers" in view.config &&
				view.config.markerLayers?.some((layer) => layer.sequence === markerId),
		)
		.map((view) => `views.${view.id}.markerLayers`);
}
