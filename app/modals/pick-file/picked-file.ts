export interface PickedFile {
  type: 'picked-file';
  objectUrl: string;
  file: File;
  extension: string;
  size: number;
  name: string;
}
