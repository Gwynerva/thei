export interface PickedFile {
  type: 'picked-file';
  objectUrl: string;
  file: File;
  extension: string;
  size: number;
  name: string;
}

export interface PickedFiles {
  type: 'picked-files';
  files: PickedFile[];
  errors: { fileName: string; message: string }[];
}
