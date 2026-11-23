import { useEffect, useEffectEvent, useState } from 'react';
import type { UploadSelection } from './folderSelection.ts';

export function usePageDrop(
  disabled: boolean,
  onSelect: (selection: UploadSelection) => void,
  onMultipleItems: () => void,
) {
  const [dragging, setDragging] = useState(false);

  const over = useEffectEvent((transfer: DataTransfer) => {
    transfer.dropEffect = disabled ? 'none' : 'copy';
    setDragging(!disabled);
  });

  const pick = useEffectEvent((transfer: DataTransfer) => {
    if (disabled) return;
    const { items, files } = transfer;
    const fileItems = Array.from(items).filter((item) => item.kind === 'file');
    if (files.length > 1 || fileItems.length > 1) {
      onMultipleItems();
      return;
    }
    // Access the entry synchronously, while the drop event permits reading it.
    const entry = fileItems[0]?.webkitGetAsEntry?.();
    if (entry?.isDirectory) onSelect(entry as FileSystemDirectoryEntry);
    else if (files.length) onSelect(files[0]);
  });

  useEffect(() => {
    let entered = 0;

    function enter(event: DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) entered += 1;
    }
    function dragOver(event: DragEvent) {
      const transfer = event.dataTransfer;
      if (!transfer?.types.includes('Files')) return;
      event.preventDefault();
      over(transfer);
    }
    function leave() {
      // Moving between children emits enter and leave without leaving the page.
      entered = Math.max(0, entered - 1);
      if (entered === 0) setDragging(false);
    }
    function drop(event: DragEvent) {
      const transfer = event.dataTransfer;
      if (!transfer?.types.includes('Files')) return;
      event.preventDefault();
      entered = 0;
      setDragging(false);
      pick(transfer);
    }

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', dragOver);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', dragOver);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return dragging;
}
