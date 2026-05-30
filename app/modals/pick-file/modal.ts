export interface PickFileResult {
  type: 'file';
  /** Temporary blob: URL — caller must call URL.revokeObjectURL() when done. */
  objectUrl: string;
  file: File;
  extension: string;
  size: number;
  name: string;
  mimeType: string;
}

export const pickFileModal = defineModal(
  'pick-file',
  () => import('./ModalPickFile.vue'),
);
