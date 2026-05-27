import { useState, useEffect, KeyboardEvent } from 'react';

interface ColumnDef {
  key: string;
  label: string;
  editable?: boolean;
}

interface DataTableModalProps<T extends Record<string, unknown>> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ColumnDef[];
  data: T[];
  onUpdate: (data: T[]) => void;
}

export default function DataTableModal<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  title,
  columns,
  data,
  onUpdate
}: DataTableModalProps<T>) {
  const [localData, setLocalData] = useState<T[]>(data);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<T>>({});

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      if (editingIndex !== null) {
        cancelEdit();
      } else {
        onClose();
      }
    }
    if (e.key === 'Enter' && editingIndex !== null) {
      saveEdit();
    }
  }

  if (!isOpen) return null;

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditValues({ ...localData[index] });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValues({});
  }

  function saveEdit() {
    if (editingIndex === null) return;
    const updated = [...localData];
    updated[editingIndex] = { ...localData[editingIndex], ...editValues };
    setLocalData(updated);
    onUpdate(updated);
    setEditingIndex(null);
  }

  function handleEditChange(key: string, value: unknown) {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div className="modal-body data-table-modal">
          <table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {localData.map((row, index) => (
                <tr key={index}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {editingIndex === index && col.editable ? (
                        <input
                          className="edit-input"
                          value={String(editValues[col.key as keyof T] ?? '')}
                          onChange={(e) => handleEditChange(col.key, e.target.value)}
                        />
                      ) : (
                        String(row[col.key as keyof T] ?? '—')
                      )}
                    </td>
                  ))}
                  <td className="row-actions-cell">
                    <button className="btn-icon" onClick={() => editingIndex === index ? cancelEdit() : startEdit(index)} aria-label={editingIndex === index ? "Cancel edit" : "Edit row"}>
                      {editingIndex === index ? 'Cancel' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {localData.length === 0 && (
            <p className="empty-state">
              No data available.
            </p>
          )}
        </div>
        <div className="modal-footer">
          {editingIndex !== null ? (
            <>
              <button className="btn-primary" onClick={saveEdit}>
                Save
              </button>
              <button className="btn-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="footer-spacer" />
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
