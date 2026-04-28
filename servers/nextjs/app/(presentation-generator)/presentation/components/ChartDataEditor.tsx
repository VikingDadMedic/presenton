"use client";

import React, { useState, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

export interface ChartColumn {
    key: string;
    label: string;
    type: 'string' | 'number';
}

interface ChartDataEditorProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[];
    onSave: (newData: any[]) => void;
    columns: ChartColumn[];
}

const genRowId = () => Math.random().toString(36).slice(2, 9);

const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
    isOpen,
    onClose,
    data,
    onSave,
    columns,
}) => {
    const [rows, setRows] = useState<Record<string, string>[]>(() =>
        data.map(row => {
            const r: Record<string, string> = { _id: genRowId() };
            columns.forEach(col => {
                r[col.key] = row[col.key] != null ? String(row[col.key]) : (col.type === 'number' ? '0' : '');
            });
            return r;
        })
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    const updateCell = useCallback((rowIndex: number, key: string, value: string) => {
        setRows(prev => {
            const updated = [...prev];
            updated[rowIndex] = { ...updated[rowIndex], [key]: value };
            return updated;
        });
        setErrors(prev => {
            if (!prev[`${rowIndex}-${key}`]) return prev;
            const next = { ...prev };
            delete next[`${rowIndex}-${key}`];
            return next;
        });
    }, []);

    const addRow = useCallback(() => {
        const r: Record<string, string> = { _id: genRowId() };
        columns.forEach(col => {
            r[col.key] = col.type === 'number' ? '0' : '';
        });
        setRows(prev => [...prev, r]);
    }, [columns]);

    const deleteRow = useCallback((index: number) => {
        setRows(prev => prev.filter((_, i) => i !== index));
        setErrors({});
    }, []);

    const handleSave = () => {
        const newErrors: Record<string, string> = {};
        rows.forEach((row, ri) => {
            columns.forEach(col => {
                const val = row[col.key];
                if (col.type === 'number' && (val === '' || Number.isNaN(Number(val)))) {
                    newErrors[`${ri}-${col.key}`] = 'Invalid number';
                }
                if (col.type === 'string' && (!val || val.trim() === '')) {
                    newErrors[`${ri}-${col.key}`] = 'Required';
                }
            });
        });
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        const cleaned = rows.map(row => {
            const out: Record<string, any> = {};
            columns.forEach(col => {
                out[col.key] = col.type === 'number' ? Number(row[col.key]) : row[col.key];
            });
            return out;
        });
        onSave(cleaned);
    };

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent
                className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <DialogHeader>
                    <DialogTitle>Edit Chart Data</DialogTitle>
                    <DialogDescription>
                        Modify the data points for this chart. Click &quot;Save Changes&quot; when done.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto -mx-6 px-6">
                    <table className="w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted"
                                    >
                                        {col.label}
                                    </th>
                                ))}
                                <th className="w-10 border-b border-border bg-muted" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={row._id} className="hover:bg-muted/50">
                                    {columns.map(col => {
                                        const errKey = `${ri}-${col.key}`;
                                        return (
                                            <td key={col.key} className="px-2 py-1.5 border-b border-border">
                                                <Input
                                                    type={col.type === 'number' ? 'number' : 'text'}
                                                    value={row[col.key] ?? ''}
                                                    onChange={e => updateCell(ri, col.key, e.target.value)}
                                                    className={`h-8 text-sm ${errors[errKey] ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                                                />
                                                {errors[errKey] && (
                                                    <span className="text-[10px] text-red-500 mt-0.5 block">
                                                        {errors[errKey]}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-1 py-1.5 border-b border-border text-center">
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(ri)}
                                            disabled={rows.length <= 1}
                                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors w-fit"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                </button>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ChartDataEditor;
