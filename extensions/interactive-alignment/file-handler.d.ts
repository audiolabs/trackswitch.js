import type { InteractiveFile, InteractiveFileType } from "./types";
export declare function classifyFileType(file: File): InteractiveFileType | null;
export declare function readFileAsText(file: File): Promise<string>;
export declare function processFile(file: File): Promise<InteractiveFile>;
/** Keep the original filename for visible UI labels. */
export declare function fileNameToDisplayTitle(filename: string): string;
export declare function buildUniqueAlignmentColumnMaps(files: InteractiveFile[]): {
    timeColumnByFileId: Record<string, string>;
    measureColumnByFileId: Record<string, string>;
};
